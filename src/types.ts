/**
 * Port accepted by {@link IDFMonitor}.
 * Web Serial `SerialPort` and esptool-js `WebUSBSerialPort` both satisfy this shape.
 */
export interface MonitorPort {
  /** Byte stream from the device. `null` while the port is closed. */
  readable: ReadableStream<Uint8Array> | null;
  /** Byte stream to the device. `null` while the port is closed. */
  writable: WritableStream<Uint8Array> | null;
  /**
   * Open the port.
   * @param {object} options Serial options. Only `baudRate` is required.
   * @returns {Promise<void>} Resolves when the port is open.
   */
  open(options: { baudRate: number }): Promise<void>;
  /**
   * Close the port and release the device.
   * @returns {Promise<void>} Resolves when the port is closed.
   */
  close(): Promise<void>;
  /**
   * USB identity, when the browser exposes it.
   * @returns {SerialPortInfo} Vendor and product ids, possibly empty.
   */
  getInfo(): SerialPortInfo;
  /**
   * Set DTR and RTS. `true` is asserted, which the auto-reset circuit treats as pin-low.
   * @param {SerialOutputSignals} signals Line states to apply.
   * @returns {Promise<void>} Resolves when the control transfer finishes.
   */
  setSignals(signals: SerialOutputSignals): Promise<void>;
}

/**
 * Terminal driven by the monitor. xterm.js `Terminal` matches this shape.
 */
export interface MonitorTerminal {
  /**
   * Write chip or monitor text. ANSI sequences are included as-is.
   * @param {string} data Text to display.
   * @returns {void}
   */
  write(data: string): void;
  /**
   * Subscribe to keystrokes. Dispose the returned handle to unsubscribe.
   * @param {function(string): void} callback Keystroke text, which may contain several characters.
   * @returns {{ dispose: function(): void }} Subscription handle.
   */
  onData(callback: (data: string) => void): { dispose(): void };
}

/**
 * ELF image supplied by the page. Bytes stay in memory; nothing is read from disk.
 */
export interface ElfFile {
  /** File name used in events, for example `app.elf`. */
  name: string;
  /** ELF contents. */
  data: ArrayBuffer | Uint8Array;
}

/** How the monitor ends a line it sends to the device. */
export type EolMode = "CR" | "LF" | "CRLF";

/**
 * Letters that become the Ctrl-key menu bindings. Each value is one character,
 * converted the same way as esp-idf-monitor (`ord(letter) - ord('@')`).
 */
export interface KeyLetters {
  /** Menu key. Default `T` (Ctrl+T). */
  menuKey?: string;
  /** Exit key. Default `]` (Ctrl+]). */
  exitKey?: string;
  /** Hard reset. Default `R`. */
  chipResetKey?: string;
  /** Flash request. Default `F`. */
  flashKey?: string;
  /** App-flash request. Default `A`. */
  appFlashKey?: string;
  /** Full flash request. Default `E`. */
  flashAllKey?: string;
  /** Toggle chip output. Default `Y`. */
  outputKey?: string;
  /** Toggle log capture. Default `L`. */
  logKey?: string;
  /** Toggle timestamps. Default `I`. */
  timestampKey?: string;
  /** Bootloader reset. Default `P`. */
  bootloaderKey?: string;
  /** Exit from inside the menu. Default `X`. */
  exitMenuKey?: string;
  /** When true, the Ctrl bindings work without pressing the menu key first. */
  skipMenuKey?: boolean;
}

/**
 * Construction options. Defaults match `idf.py monitor` where a browser can.
 */
export interface IDFMonitorOptions {
  /** Granted Web Serial port, or a WebUSB adapter with the same methods. */
  port: MonitorPort;
  /** Terminal that displays output and supplies keystrokes. */
  terminal: MonitorTerminal;
  /** Baud rate used when this monitor opens the port. Default 115200. Fixed for the session. */
  baudRate?: number;
  /** Chip name. ESP32 uses the longer bootloader delays. Default `esp32`. */
  target?: string;
  /** Application ELF, then extra ELFs such as the bootloader. First match wins. */
  elfFiles?: ElfFile[];
  /** ROM ELF used when an address is not in any application image. */
  romElf?: ArrayBuffer | Uint8Array;
  /** Skip the hard reset that normally runs on the first open. */
  noReset?: boolean;
  /** ESP log filter, for example `wifi:I *:E`. Empty shows every line. */
  printFilter?: string;
  /** Line ending written to the device. Default `CR`. */
  eol?: EolMode;
  /** Prefix each chip line with a timestamp. */
  timestamps?: boolean;
  /** Python `strftime` subset: `%Y %m %d %H %M %S %f %%`. Default `%Y-%m-%d %H:%M:%S`. */
  timestampFormat?: string;
  /** Resolve `0x` addresses that fall in an executable ELF section. Default true. */
  decodeAddresses?: boolean;
  /** `backtrace` captures a panic register dump. Default `disable`. */
  decodePanic?: "disable" | "backtrace";
  /** `info` captures a UART core dump. `disable` lets the bytes pass through. Default `info`. */
  decodeCoredumps?: "info" | "disable";
  /** Paint `I` / `W` / `E` log lines. Default true. */
  autoColor?: boolean;
  /** Menu key letters. */
  keys?: KeyLetters;
  /** Seconds to wait before reopening a dropped port. Default 0.5. Reconnect does not reset. */
  reconnectDelay?: number;
  /** Cold-start open attempts. `1` fails immediately, `0` retries forever. Default 1. */
  openPortAttempts?: number;
  /** Custom bootloader sequence (`D0|R1|W0.1|U0,1`). Overrides classic and USB-JTAG. */
  customResetSequence?: string;
  /** Custom hard-reset sequence. Same grammar as {@link IDFMonitorOptions.customResetSequence}. */
  customHardResetSequence?: string;
  /** Report flash requests as encrypted targets. */
  encrypted?: boolean;
  /** How long a partial line waits for a newline before it is shown. Default 100. */
  flushIntervalMs?: number;
  /**
   * Clock used by reset delays and {@link IDFMonitor.sleep}. Tests pass a fake.
   * @param {number} ms Milliseconds to wait.
   * @returns {Promise<void>} Resolves when the wait is over.
   */
  sleep?: (ms: number) => Promise<void>;
}

/** One resolved program counter. */
export interface AddressFrame {
  /** Address as a number. */
  address: number;
  /** Nearest function symbol, or `??` when the ROM ELF has none. */
  func: string;
  /** Source path from the DWARF line table, or `ROM` for a ROM ELF hit. */
  path?: string;
  /** 1-based source line from the DWARF line table. */
  line?: number;
}

/** One DWARF line-table row, covering `[start, end)`. */
export interface LineInterval {
  /** First address of this source line. */
  start: number;
  /** First address after this source line. */
  end: number;
  /** Source path stored in the line table. */
  path: string;
  /** 1-based line number. */
  line: number;
}

/** Executable range and function symbols loaded from one ELF. */
export interface LoadedElf {
  /** Caller-supplied name. */
  name: string;
  /** `SHF_EXECINSTR` intervals, `[start, end)`. */
  ranges: Array<{ start: number; end: number }>;
  /** Named symbols with a defined section. */
  symbols: Array<{ name: string; value: number; size: number }>;
  /** Lower-case SHA-256 of the ELF bytes. */
  sha256: string;
  /** True when this image was passed as the ROM ELF. */
  rom: boolean;
  /** Line-table intervals. Empty for a ROM image or an ELF without DWARF. */
  lines: LineInterval[];
}

/** Menu and command-stream actions. */
export type MenuAction =
  | "help"
  | "reset"
  | "bootloader"
  | "flash"
  | "app-flash"
  | "flash-all"
  | "output"
  | "log"
  | "timestamps"
  | "exit"
  | "forward-menu-key"
  | "unknown";

/** Flash target names from the esp-idf-monitor IDE protocol. */
export type FlashTarget = "flash" | "app-flash" | "encrypted-flash" | "encrypted-app-flash";

/**
 * Events emitted by {@link IDFMonitor}.
 * `gdb_stub`, `coredump`, and `flash` use the esp-idf-monitor IDE names.
 * Payloads carry bytes instead of filesystem paths.
 */
export interface MonitorEventMap {
  /** First successful open. */
  open: { port: SerialPortInfo; baud: number };
  /** The port was closed by {@link IDFMonitor.stop}. */
  close: Record<string, never>;
  /** The device disappeared, or a cold open is about to retry. */
  "reconnect-wait": { error: string };
  /** The port was reopened. The chip is not reset again. */
  reconnect: { port: SerialPortInfo; baud: number };
  /** Session finished. `110` is an `expect` timeout, `2` is a script error, `1` is an open failure. */
  exit: { code: number };
  /** One decoded chip line. `printed` is false when the filter or a mute hid it. */
  line: { text: string; printed: boolean };
  /** Bytes about to be written to the device. */
  write: { data: Uint8Array };
  /** Chip output was shown or hidden. */
  "output-toggle": { enabled: boolean };
  /** Timestamps were turned on or off. */
  "timestamps-toggle": { enabled: boolean };
  /** Log capture started or stopped. `text` is the capture when stopping. */
  "log-toggle": { enabled: boolean; text?: string };
  /** A menu command ran. */
  menu: { action: MenuAction };
  /** A DTR/RTS sequence finished. */
  reset: { kind: "hard" | "bootloader" | "custom" };
  /** One resolved address. */
  address: { address: number; trace: AddressFrame[] };
  /** The chip printed `ELF file SHA256:`. */
  "elf-sha256": { flashed: string; match: boolean; built?: string };
  /** A panic register dump started. Only when panic decode is `backtrace`. */
  "panic-start": Record<string, never>;
  /** A panic dump finished, with addresses resolved against the loaded ELFs. */
  panic: { text: string; frames: AddressFrame[] };
  /** The chip asked for Enter before printing a core dump. The monitor sends a newline. */
  "coredump-prompt": Record<string, never>;
  /** Core-dump body started. Chip output is muted until the end banner. */
  "coredump-start": Record<string, never>;
  /** The in-memory core dump grew by another KiB. */
  "coredump-progress": { bytes: number };
  /** Core dump finished. `base64` is the body with newlines removed. */
  coredump: { base64: string; progName?: string };
  /** A checksum-valid gdbstub stop packet. The read loop is released and the port stays open. */
  gdb_stub: { packet: string; progName?: string };
  /** Three UTF-8 decode failures in a row. */
  "decode-warning": Record<string, never>;
  /** The operator asked to flash. The page closes the monitor and runs esptool-js. */
  flash: { target: FlashTarget; full: boolean; encrypted: boolean };
  /** The chip printed `IDF_MONITOR_EXECUTE_<TYPE>`. The page decides whether to run it. */
  "host-command": { type: string; args: string };
}

/** USB product id of the on-chip USB-Serial-JTAG bridge. */
export const USB_JTAG_SERIAL_PID = 0x1001;

/** Thrown when the monitor is used incorrectly or a command-stream request is invalid. */
export class MonitorError extends Error {
  /**
   * @param {string} message What went wrong.
   */
  constructor(message: string) {
    super(message);
    this.name = "MonitorError";
  }
}

/**
 * `expect` did not match before its timeout. `code` is 110, matching esp-idf-monitor.
 */
export class ExpectTimeoutError extends MonitorError {
  /** Process-style status a script runner can surface. */
  readonly code = 110;

  /**
   * @param {number} timeoutSeconds How long the caller was willing to wait.
   */
  constructor(timeoutSeconds: number) {
    super(`expect timed out after ${timeoutSeconds}s`);
    this.name = "ExpectTimeoutError";
  }
}
