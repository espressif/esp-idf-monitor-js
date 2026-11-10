import { MonitorEmitter } from "./events.js";
import { SymbolAddressDecoder, formatAddress } from "./elf/address-decoder.js";
import { loadElf } from "./elf/image.js";
import { ConsoleParser } from "./input/console-parser.js";
import { describeKey, resolveKeys } from "./input/keys.js";
import { Colorizer, Timestamper } from "./output/color.js";
import { LineMatcher } from "./output/line-matcher.js";
import { LineBuffer } from "./output/pipeline.js";
import { CoredumpDetector } from "./detect/coredump.js";
import { GdbStubDetector } from "./detect/gdbstub.js";
import { PanicDecoder } from "./detect/panic.js";
import { compareSha256, flashedSha256 } from "./detect/sha256.js";
import { SignalControl, enterBootloader, hardReset, runCustomReset } from "./serial/reset.js";
import {
  AddressFrame,
  ElfFile,
  ExpectTimeoutError,
  LoadedElf,
  FlashTarget,
  IDFMonitorOptions,
  MenuAction,
  MonitorError,
  MonitorEventMap,
  MonitorPort,
  MonitorTerminal,
} from "./types.js";

const encoder = new TextEncoder();
const LOOKBACK = 1024;
const GDB_CONTINUE = "+$c#63";

interface ExpectWaiter {
  regex: RegExp;
  resolve: (line: string) => void;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Serial console for an ESP-IDF target.
 *
 * The page supplies an already granted port and a terminal. Chip text is written to the
 * terminal. Ctrl+T menu commands, panic and core-dump capture, and address decoration
 * stay inside this object and are reported with {@link IDFMonitor.on}.
 */
export class IDFMonitor {
  private readonly events = new MonitorEmitter<MonitorEventMap>();
  private readonly port: MonitorPort;
  private readonly terminal: MonitorTerminal;
  private readonly baudRate: number;
  private readonly target: string;
  private readonly elfFiles: ElfFile[];
  private readonly romElf?: ArrayBuffer | Uint8Array;
  private readonly noReset: boolean;
  private readonly eol: "\r" | "\n" | "\r\n";
  private readonly decodeAddresses: boolean;
  private readonly decodePanic: boolean;
  private readonly decodeCoredumps: boolean;
  private readonly encrypted: boolean;
  private readonly reconnectDelayMs: number;
  private readonly openPortAttempts: number;
  private readonly customReset?: string;
  private readonly customHardReset?: string;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly parser: ConsoleParser;
  private readonly matcher: LineMatcher;
  private readonly colorizer: Colorizer;
  private readonly stamper: Timestamper;
  private readonly lines: LineBuffer;
  private readonly panic = new PanicDecoder();
  private readonly coredump = new CoredumpDetector();
  private readonly gdb = new GdbStubDetector();

  private outputEnabled = true;
  private timestampsEnabled: boolean;
  private logCapture: string[] | null = null;
  private digests: string[] = [];
  private decoder: SymbolAddressDecoder | null = null;
  private progName: string | undefined;
  private keySubscription: { dispose(): void } | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private writeQueue: Promise<void> = Promise.resolve();
  private lookback: string[] = [];
  private waiter: ExpectWaiter | null = null;
  private state: "idle" | "running" | "stopped" = "idle";
  private stopRequested = false;
  private paused = false;
  private connectedOnce = false;
  private coldFailures = 0;
  private exitEmitted = false;
  private loopPromise: Promise<void> = Promise.resolve();
  private pauseGate: Promise<void> = Promise.resolve();
  private resolvePause: () => void = () => undefined;
  private ready!: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private readySettled = false;

  /**
   * @param {IDFMonitorOptions} options Port, terminal, and the monitor settings.
   */
  constructor(options: IDFMonitorOptions) {
    this.port = options.port;
    this.terminal = options.terminal;
    this.baudRate = options.baudRate ?? 115200;
    this.target = options.target ?? "esp32";
    this.elfFiles = options.elfFiles ?? [];
    this.romElf = options.romElf;
    this.noReset = options.noReset === true;
    this.eol = options.eol === "CRLF" ? "\r\n" : options.eol === "LF" ? "\n" : "\r";
    this.decodeAddresses = options.decodeAddresses !== false;
    this.decodePanic = options.decodePanic === "backtrace";
    this.decodeCoredumps = options.decodeCoredumps !== "disable";
    this.encrypted = options.encrypted === true;
    this.reconnectDelayMs = (options.reconnectDelay ?? 0.5) * 1000;
    this.openPortAttempts = options.openPortAttempts ?? 1;
    this.customReset = options.customResetSequence;
    this.customHardReset = options.customHardResetSequence;
    this.wait = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.timestampsEnabled = options.timestamps === true;
    this.parser = new ConsoleParser(resolveKeys(options.keys), options.eol ?? "CR");
    this.matcher = new LineMatcher(options.printFilter ?? "");
    this.colorizer = new Colorizer(options.autoColor !== false);
    this.stamper = new Timestamper(this.timestampsEnabled, options.timestampFormat ?? "%Y-%m-%d %H:%M:%S");
    this.lines = new LineBuffer(
      {
        push: (fragment, newline) => this.handleFragment(fragment, newline),
        decodeWarning: () => {
          this.events.emit("decode-warning", {});
          this.note("Serial data is not valid UTF-8. Check the baud rate and the crystal frequency.");
        },
      },
      options.flushIntervalMs ?? 100,
      () => this.coredump.active,
    );
    this.resetReady();
  }

  /**
   * Subscribe to a monitor event.
   * @param {K} event Event id.
   * @param {Function} handler Called with the payload.
   * @returns {IDFMonitor} This monitor, so subscriptions can be chained.
   */
  on<K extends keyof MonitorEventMap>(event: K, handler: (payload: MonitorEventMap[K]) => void): this {
    this.events.on(event, handler);
    return this;
  }

  /**
   * Remove a subscription created with {@link on}.
   * @param {K} event Event id.
   * @param {Function} handler The same function that was registered.
   * @returns {IDFMonitor} This monitor.
   */
  off<K extends keyof MonitorEventMap>(event: K, handler: (payload: MonitorEventMap[K]) => void): this {
    this.events.off(event, handler);
    return this;
  }

  /**
   * Subscribe to the next occurrence of an event.
   * @param {K} event Event id.
   * @param {Function} handler Called once.
   * @returns {IDFMonitor} This monitor.
   */
  once<K extends keyof MonitorEventMap>(event: K, handler: (payload: MonitorEventMap[K]) => void): this {
    this.events.once(event, handler);
    return this;
  }

  /**
   * Open the port if it is closed, optionally hard-reset the chip, and start reading.
   * Resolves when the first open succeeds.
   * @returns {Promise<void>} Resolves when chip bytes can be received.
   */
  async start(): Promise<void> {
    if (this.state !== "idle") {
      throw new MonitorError("Monitor is already started");
    }
    this.state = "running";
    this.stopRequested = false;
    this.paused = false;
    this.exitEmitted = false;
    this.connectedOnce = false;
    this.coldFailures = 0;
    try {
      await this.loadImages();
    } catch (error) {
      this.state = "idle";
      throw error;
    }
    this.keySubscription = this.terminal.onData((data) => this.onTerminalData(data));
    this.loopPromise = this.readLoop(true);
    try {
      await this.ready;
    } catch (error) {
      this.keySubscription?.dispose();
      this.keySubscription = null;
      this.state = "idle";
      throw error;
    }
  }

  /**
   * Stop reading, unsubscribe the terminal, and close the port.
   * @returns {Promise<void>} Resolves when the port is closed.
   */
  async stop(): Promise<void> {
    if (this.state === "stopped") {
      return;
    }
    this.stopRequested = true;
    this.paused = false;
    this.state = "stopped";
    this.keySubscription?.dispose();
    this.keySubscription = null;
    this.lines.dispose();
    this.clearExpect();
    try {
      await this.reader?.cancel();
    } catch {
      // The in-flight read rejects when the reader is cancelled.
    }
    try {
      await this.port.close();
    } catch {
      // Closing an already closed port is the end state we wanted.
    }
    this.settleReady();
    this.events.emit("close", {});
    this.emitExit(0);
  }

  /**
   * Hard-reset the chip through RTS.
   * @returns {Promise<void>} Resolves when the pulse has finished.
   */
  async reset(): Promise<void> {
    await this.performHardReset();
  }

  /**
   * Reset the chip into the download bootloader.
   * @returns {Promise<void>} Resolves when the sequence has finished.
   */
  async bootloader(): Promise<void> {
    await this.performBootloader();
  }

  /**
   * Write text to the device, followed by the configured end-of-line.
   * @param {string} text Characters to send. The end-of-line is added.
   * @returns {Promise<void>} Resolves when the bytes are written.
   */
  async send(text: string): Promise<void> {
    await this.writeDevice(encoder.encode(text + this.eol));
  }

  /**
   * Wait until a chip line matches. Recent lines are checked before new ones.
   * The pattern is tested against the line with its newline removed, so `$` matches the end.
   * @param {string | RegExp} pattern Regular expression. A string is compiled with `new RegExp`.
   * @param {number} [timeoutSeconds] When set, the promise rejects with {@link ExpectTimeoutError}.
   * @returns {Promise<string>} The matching line without its newline.
   */
  expect(pattern: string | RegExp, timeoutSeconds?: number): Promise<string> {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    if (timeoutSeconds !== undefined && (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0)) {
      throw new MonitorError("Invalid expect timeout");
    }
    for (const line of this.lookback) {
      if (regex.test(line)) {
        return Promise.resolve(line);
      }
    }
    return new Promise((resolve, reject) => {
      if (this.waiter) {
        reject(new MonitorError("Another expect is already waiting"));
        return;
      }
      const waiter: ExpectWaiter = {
        regex,
        resolve: (line) => {
          if (waiter.timer) {
            clearTimeout(waiter.timer);
          }
          this.waiter = null;
          resolve(line);
        },
      };
      if (timeoutSeconds !== undefined) {
        waiter.timer = setTimeout(() => {
          if (this.waiter !== waiter) {
            return;
          }
          this.waiter = null;
          this.events.emit("exit", { code: 110 });
          reject(new ExpectTimeoutError(timeoutSeconds));
        }, timeoutSeconds * 1000);
      }
      this.waiter = waiter;
    });
  }

  /**
   * Pause the caller. Command-stream scripts use this between `send` and `expect`.
   * @param {number} seconds How long to wait.
   * @returns {Promise<void>} Resolves when the wait is over.
   */
  sleep(seconds: number): Promise<void> {
    return this.wait(seconds * 1000);
  }

  /**
   * Show or hide chip text. Status lines are still written.
   * @returns {boolean} True when chip text is visible.
   */
  toggleOutput(): boolean {
    this.outputEnabled = !this.outputEnabled;
    this.events.emit("output-toggle", { enabled: this.outputEnabled });
    this.note(this.outputEnabled ? "Output enabled" : "Output disabled");
    return this.outputEnabled;
  }

  /**
   * Turn line timestamps on or off.
   * @returns {boolean} True when timestamps are written.
   */
  toggleTimestamps(): boolean {
    this.timestampsEnabled = !this.timestampsEnabled;
    this.stamper.setEnabled(this.timestampsEnabled);
    this.events.emit("timestamps-toggle", { enabled: this.timestampsEnabled });
    this.note(this.timestampsEnabled ? "Timestamps enabled" : "Timestamps disabled");
    return this.timestampsEnabled;
  }

  /**
   * Start or stop an in-memory copy of terminal output.
   * The captured text is on the `log-toggle` event when capture stops.
   * @returns {boolean} True when capture is running.
   */
  toggleLog(): boolean {
    if (this.logCapture) {
      const text = this.logCapture.join("");
      this.logCapture = null;
      this.events.emit("log-toggle", { enabled: false, text });
      this.note("Log capture stopped");
      return false;
    }
    this.logCapture = [];
    this.events.emit("log-toggle", { enabled: true });
    this.note("Log capture started");
    return true;
  }

  /**
   * Continue a chip that stopped in the gdb stub, then read the port again.
   * Writes `+$c#63`. No local debugger is started.
   * @returns {Promise<void>} Resolves when reading has resumed.
   */
  async continueStub(): Promise<void> {
    if (!this.paused || this.state !== "running") {
      return;
    }
    await this.pauseGate;
    await this.writeDevice(encoder.encode(GDB_CONTINUE));
    try {
      await this.port.close();
    } catch {
      // The reader cancellation may already have closed the stream.
    }
    this.paused = false;
    this.resetReady();
    this.loopPromise = this.readLoop(false);
    await this.ready;
  }

  /**
   * Load every ELF before the first open so a bad image fails `start`.
   * @returns {Promise<void>} Resolves when the images are indexed.
   */
  private async loadImages(): Promise<void> {
    const loaded: LoadedElf[] = [];
    for (const file of this.elfFiles) {
      loaded.push(await loadElf(file.name, file.data, false));
    }
    if (this.romElf) {
      loaded.push(await loadElf("rom.elf", this.romElf, true));
    }
    this.digests = loaded.map((elf) => elf.sha256);
    this.decoder = new SymbolAddressDecoder(loaded);
    this.progName = loaded.find((elf) => !elf.rom)?.name;
  }

  /**
   * Read until stop, gdb pause, or a cold-open failure.
   * @param {boolean} greet True for the initial open, which may reset the chip.
   * @returns {Promise<void>} Resolves when this loop stops reading.
   */
  private async readLoop(greet: boolean): Promise<void> {
    if (greet) {
      this.resetReady();
    }
    let first = greet;
    while (!this.stopRequested && !this.paused) {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        if (first || this.port.readable === null || this.port.writable === null) {
          if (!first) {
            try {
              await this.port.close();
            } catch {
              // Already closed while reconnecting.
            }
          }
          await this.openPort(first);
          first = false;
        }
        if (!this.port.readable) {
          throw new Error("Port has no readable stream");
        }
        reader = this.port.readable.getReader();
        this.reader = reader;
        while (!this.stopRequested && !this.paused) {
          const { value, done } = await reader.read();
          if (done) {
            throw new Error("device disconnected");
          }
          if (value && value.byteLength > 0) {
            this.lines.push(value);
          }
        }
      } catch (error) {
        this.releaseReader(reader);
        reader = undefined;
        if (this.stopRequested || this.paused) {
          break;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.events.emit("reconnect-wait", { error: message });
        if (!this.connectedOnce) {
          this.coldFailures += 1;
          if (this.openPortAttempts !== 0 && this.coldFailures >= this.openPortAttempts) {
            this.failReady(error instanceof Error ? error : new MonitorError(message));
            this.emitExit(1);
            this.stopRequested = true;
            this.state = "idle";
            break;
          }
        }
        await this.wait(this.reconnectDelayMs);
        try {
          await this.port.close();
        } catch {
          // The next open creates a new stream.
        }
      } finally {
        this.releaseReader(reader);
      }
    }
  }

  /**
   * Open the port and run the startup line sequence.
   * A reconnect passes `false` and does not reset the chip.
   * @param {boolean} first True only for the first open of this session.
   * @returns {Promise<void>} Resolves when the port is open.
   */
  private async openPort(first: boolean): Promise<void> {
    if (this.port.readable === null || this.port.writable === null) {
      await this.port.open({ baudRate: this.baudRate });
    }
    const reset = first && !this.noReset;
    if (reset && this.customHardReset) {
      const ok = await runCustomReset(this.signals(), this.customHardReset);
      if (!ok) {
        this.note("Invalid custom hard reset sequence");
      } else {
        this.events.emit("reset", { kind: "custom" });
      }
    } else if (reset) {
      await this.port.setSignals({ requestToSend: true });
      await this.port.setSignals({ dataTerminalReady: true });
      await this.port.setSignals({ requestToSend: false });
      await this.port.setSignals({ dataTerminalReady: false });
      await hardReset(this.signals());
      this.events.emit("reset", { kind: "hard" });
    } else {
      await this.port.setSignals({ requestToSend: false });
      await this.port.setSignals({ dataTerminalReady: false });
    }
    this.connectedOnce = true;
    const payload = { baud: this.baudRate, port: this.safeInfo() };
    if (first) {
      this.events.emit("open", payload);
      this.note("Quit: Ctrl+] | Menu: Ctrl+T | Help: Ctrl+T followed by Ctrl+H");
    } else {
      this.events.emit("reconnect", payload);
    }
    this.settleReady();
  }

  /**
   * Handle one terminal character at a time, matching the Python console parser.
   * @param {string} data Text from `terminal.onData`.
   * @returns {void}
   */
  private onTerminalData(data: string): void {
    if (this.stopRequested) {
      return;
    }
    for (const key of data) {
      const parsed = this.parser.parse(key);
      if (parsed.kind === "arm") {
        continue;
      }
      if (parsed.kind === "bytes") {
        void this.writeDevice(encoder.encode(parsed.data));
        continue;
      }
      void this.runMenu(parsed.action, parsed.key);
    }
  }

  /**
   * Run a menu command.
   * @param {MenuAction} action Command selected by the parser.
   * @param {string} [key] Original character, for forwarded and unknown keys.
   * @returns {Promise<void>} Resolves when the command has been issued.
   */
  private async runMenu(action: MenuAction, key?: string): Promise<void> {
    this.events.emit("menu", { action });
    switch (action) {
      case "forward-menu-key":
        if (key) {
          await this.writeDevice(encoder.encode(key));
        }
        return;
      case "help":
        this.note(this.parser.helpText());
        return;
      case "unknown":
        this.note(`Unknown menu character ${key ? describeKey(key) : ""}`.trim());
        return;
      case "exit":
        await this.stop();
        return;
      case "reset":
        await this.performHardReset();
        return;
      case "bootloader":
        await this.performBootloader();
        return;
      case "flash":
      case "app-flash":
      case "flash-all":
        this.requestFlash(action);
        return;
      case "output":
        this.toggleOutput();
        return;
      case "log":
        this.toggleLog();
        return;
      case "timestamps":
        this.toggleTimestamps();
        return;
      default:
        return;
    }
  }

  /**
   * Pulse EN, or run the custom hard-reset sequence.
   * @returns {Promise<void>} Resolves when the lines have been restored.
   */
  private async performHardReset(): Promise<void> {
    if (this.customHardReset) {
      const ok = await runCustomReset(this.signals(), this.customHardReset);
      if (!ok) {
        this.note("Invalid custom hard reset sequence");
        return;
      }
      this.events.emit("reset", { kind: "custom" });
      return;
    }
    await hardReset(this.signals());
    this.events.emit("reset", { kind: "hard" });
  }

  /**
   * Enter the bootloader with the classic, USB-JTAG, or custom sequence.
   * @returns {Promise<void>} Resolves when the sequence has finished.
   */
  private async performBootloader(): Promise<void> {
    const kind = await enterBootloader(this.signals(), this.target, this.safeInfo().usbProductId, this.customReset);
    if (kind === "invalid") {
      this.note("Invalid custom reset sequence");
      return;
    }
    this.events.emit("reset", { kind });
  }

  /**
   * Tell the page that the operator asked to flash. This package does not run esptool.
   * @param {"flash" | "app-flash" | "flash-all"} action Which flash command was chosen.
   * @returns {void}
   */
  private requestFlash(action: "flash" | "app-flash" | "flash-all"): void {
    let target: FlashTarget;
    let full = false;
    if (action === "app-flash") {
      target = this.encrypted ? "encrypted-app-flash" : "app-flash";
    } else if (action === "flash-all") {
      target = this.encrypted ? "encrypted-flash" : "flash";
      full = !this.encrypted;
    } else {
      target = this.encrypted ? "encrypted-flash" : "flash";
    }
    this.events.emit("flash", { target, full, encrypted: this.encrypted });
    this.note(`Flash requested (${target}${full ? ", full" : ""})`);
  }

  /**
   * Decode one chip fragment. Detectors run before the print filter.
   * @param {string} fragment Text, including a trailing newline when it has one.
   * @param {boolean} newline True when the fragment ends a line.
   * @returns {void}
   */
  private handleFragment(fragment: string, newline: boolean): void {
    const stripped = fragment.replace(/\r|\n/g, "");
    this.remember(stripped);

    if (this.decodeCoredumps) {
      const step = this.coredump.push(stripped);
      if (step?.kind === "prompt") {
        this.events.emit("coredump-prompt", {});
        void this.send("");
      } else if (step?.kind === "start") {
        this.events.emit("coredump-start", {});
      } else if (step?.kind === "body") {
        this.events.emit("line", { text: stripped, printed: false });
        if (step.progress !== undefined) {
          this.events.emit("coredump-progress", { bytes: step.progress });
        }
        return;
      } else if (step?.kind === "end") {
        this.events.emit("coredump", { base64: step.base64, progName: this.progName });
      }
    }

    let panicText: string | null = null;
    if (this.decodePanic) {
      const panic = this.panic.push(stripped);
      if (panic === "start") {
        this.events.emit("panic-start", {});
        this.note("Stack dump detected");
      } else if (panic === "done") {
        panicText = this.panic.text();
      }
    }

    const gdb = this.gdb.push(stripped);
    this.printChip(fragment, newline, stripped, this.panic.suppressing);
    if (panicText !== null) {
      const frames = this.decoder?.addressesIn(panicText) ?? [];
      this.events.emit("panic", { text: panicText, frames });
    }
    if (gdb && "packet" in gdb) {
      this.paused = true;
      this.pauseGate = new Promise((resolve) => {
        this.resolvePause = resolve;
      });
      this.events.emit("gdb_stub", { packet: gdb.packet, progName: this.progName });
      void this.finishPause();
    } else if (gdb && "malformed" in gdb) {
      this.note("Malformed gdb message");
    }
  }

  /**
   * Filter, color, timestamp, and decorate one fragment.
   * @param {string} fragment Original fragment, including its newline.
   * @param {boolean} newline Whether the fragment ends a line.
   * @param {string} stripped Fragment without CR or LF.
   * @param {boolean} forceHide True while a panic stack dump is being captured.
   * @returns {void}
   */
  private printChip(fragment: string, newline: boolean, stripped: string, forceHide: boolean): void {
    const flashed = flashedSha256(stripped);
    if (flashed) {
      const compared = compareSha256(flashed, this.digests);
      this.events.emit("elf-sha256", { flashed, match: compared.match, built: compared.built });
      if (!compared.match) {
        this.note(`ELF SHA256 mismatch, flashed ${flashed}`);
      }
    }
    const host = /IDF_MONITOR_EXECUTE_([A-Z0-9_]+)(?:\s+(.*))?/.exec(stripped);
    if (host) {
      this.events.emit("host-command", { type: host[1], args: host[2] ?? "" });
    }

    const printed = this.outputEnabled && !forceHide && this.matcher.match(stripped);
    this.events.emit("line", { text: stripped, printed });
    if (!printed) {
      return;
    }
    this.writeTerminal(this.stamper.apply(this.colorizer.apply(fragment)));
    if (!this.decodeAddresses || !this.decoder) {
      return;
    }
    for (const frame of this.decoder.push(stripped, newline)) {
      this.emitAddress(frame);
    }
  }

  /**
   * Write a resolved address under the chip line and emit it.
   * @param {AddressFrame} frame Resolved program counter.
   * @returns {void}
   */
  private emitAddress(frame: AddressFrame): void {
    this.events.emit("address", { address: frame.address, trace: [frame] });
    this.writeTerminal(`--- ${formatAddress(frame)}\n`);
  }

  /**
   * Remember a line for `expect`, and complete a waiting `expect` when it matches.
   * @param {string} line Line without its newline.
   * @returns {void}
   */
  private remember(line: string): void {
    this.lookback.push(line);
    if (this.lookback.length > LOOKBACK) {
      this.lookback.shift();
    }
    if (this.waiter && this.waiter.regex.test(line)) {
      this.waiter.resolve(line);
    }
  }

  /**
   * Write a monitor status block. Each line is prefixed with `--- `.
   * @param {string} text Status text. Newlines are preserved as separate status lines.
   * @returns {void}
   */
  private note(text: string): void {
    const block = text
      .split("\n")
      .map((line) => `--- ${line}\n`)
      .join("");
    this.writeTerminal(block);
    this.stamper.forceStart();
  }

  /**
   * Write to the terminal and, when capture is on, keep a copy.
   * @param {string} data Text, including ANSI sequences.
   * @returns {void}
   */
  private writeTerminal(data: string): void {
    this.terminal.write(data);
    if (this.logCapture) {
      this.logCapture.push(data);
    }
  }

  /**
   * Queue a device write so keystrokes cannot interleave.
   * @param {Uint8Array} data Bytes to send.
   * @returns {Promise<void>} Resolves when this write finishes.
   */
  private writeDevice(data: Uint8Array): Promise<void> {
    const copy = new Uint8Array(data);
    this.events.emit("write", { data: copy });
    this.writeQueue = this.writeQueue
      .then(async () => {
        if (!this.port.writable) {
          throw new MonitorError("Port is not writable");
        }
        const writer = this.port.writable.getWriter();
        try {
          await writer.write(copy);
        } finally {
          writer.releaseLock();
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.note(`Write failed: ${message}`);
      });
    return this.writeQueue;
  }

  /**
   * Cancel the reader after `paused` is already set, then let {@link continueStub} proceed.
   * Called without awaiting so the read loop can leave `handleFragment` and notice `paused`.
   * @returns {Promise<void>} Resolves when the read loop has stopped.
   */
  private async finishPause(): Promise<void> {
    try {
      await this.reader?.cancel();
    } catch {
      // The in-flight read rejects when the reader is cancelled.
    }
    try {
      await this.loopPromise;
    } catch {
      // Open failures are reported through the exit event.
    }
    this.resolvePause();
  }

  /**
   * Release a reader lock if this loop still holds it.
   * @param {ReadableStreamDefaultReader<Uint8Array> | undefined} reader Reader to release.
   * @returns {void}
   */
  private releaseReader(reader: ReadableStreamDefaultReader<Uint8Array> | undefined): void {
    if (!reader) {
      return;
    }
    try {
      reader.releaseLock();
    } catch {
      // cancel() already released the lock.
    }
    if (this.reader === reader) {
      this.reader = undefined;
    }
  }

  /**
   * Adapter passed to the reset sequences.
   * @returns {SignalControl} Line control bound to this port.
   */
  private signals(): SignalControl {
    return {
      setSignals: (signals) => this.port.setSignals(signals),
      sleep: (ms) => this.wait(ms),
    };
  }

  /**
   * USB identity, or an empty object when the port cannot report it.
   * @returns {SerialPortInfo} Vendor and product ids.
   */
  private safeInfo(): SerialPortInfo {
    try {
      return this.port.getInfo();
    } catch {
      return {};
    }
  }

  /**
   * Drop a waiting `expect` without resolving it. Used when the monitor stops.
   * @returns {void}
   */
  private clearExpect(): void {
    if (this.waiter?.timer) {
      clearTimeout(this.waiter.timer);
    }
    this.waiter = null;
  }

  /**
   * Install a fresh ready promise for the next open.
   * @returns {void}
   */
  private resetReady(): void {
    this.readySettled = false;
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
  }

  /**
   * Resolve {@link start} or {@link continueStub} once the port is open.
   * @returns {void}
   */
  private settleReady(): void {
    if (this.readySettled) {
      return;
    }
    this.readySettled = true;
    this.resolveReady();
  }

  /**
   * Reject {@link start} because the port never opened.
   * @param {Error} error Open failure.
   * @returns {void}
   */
  private failReady(error: Error): void {
    if (this.readySettled) {
      return;
    }
    this.readySettled = true;
    this.rejectReady(error);
  }

  /**
   * Emit `exit` once per session.
   * @param {number} code Status code.
   * @returns {void}
   */
  private emitExit(code: number): void {
    if (this.exitEmitted) {
      return;
    }
    this.exitEmitted = true;
    this.events.emit("exit", { code });
  }
}
