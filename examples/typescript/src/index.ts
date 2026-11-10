import { IDFMonitor, IDFMonitorOptions, MonitorPort } from "../../../lib/index.js";
import { requestWebUsbPort, webUsbAvailable } from "./webusb-port.js";

interface XTerm {
  open(parent: HTMLElement): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(callback: (data: string) => void): { dispose(): void };
}

declare const Terminal: {
  new (options?: { cols?: number; rows?: number; convertEol?: boolean }): XTerm;
};

const terminalElement = required("terminal");
const term = new Terminal({ convertEol: true });
term.open(terminalElement);
fitTerminal();
window.addEventListener("resize", fitTerminal);

const connectButton = required<HTMLButtonElement>("connectButton");
const startButton = required<HTMLButtonElement>("startButton");
const stopButton = required<HTMLButtonElement>("stopButton");
const useWebUsb = required<HTMLInputElement>("useWebUsb");
const portStatus = required("portStatus");
const events = required("events");
const webUsbNote = required("webUsbNote");

let port: MonitorPort | null = null;
let monitor: IDFMonitor | null = null;

if (!webUsbAvailable()) {
  useWebUsb.disabled = true;
  useWebUsb.checked = false;
  webUsbNote.textContent = "WebUSB is not available in this browser.";
} else {
  webUsbNote.textContent =
    "WebUSB asks the browser for a USB device and uses its CDC ACM interface. If the operating system already owns that interface, the claim fails and Web Serial is the path to use.";
}

connectButton.addEventListener("click", () => {
  void connect();
});
startButton.addEventListener("click", () => {
  void start();
});
stopButton.addEventListener("click", () => {
  void stopSession();
});
required<HTMLButtonElement>("resetButton").addEventListener("click", () => {
  void run((current) => current.reset());
});
required<HTMLButtonElement>("bootloaderButton").addEventListener("click", () => {
  void run((current) => current.bootloader());
});
required<HTMLButtonElement>("outputButton").addEventListener("click", () => {
  void run((current) => {
    current.toggleOutput();
  });
});
required<HTMLButtonElement>("timestampButton").addEventListener("click", () => {
  void run((current) => {
    current.toggleTimestamps();
  });
});
required<HTMLButtonElement>("logButton").addEventListener("click", () => {
  void run((current) => {
    current.toggleLog();
  });
});
required<HTMLButtonElement>("sendButton").addEventListener("click", () => {
  void run((current) => current.send(required<HTMLInputElement>("sendText").value));
});

updateButtons();

/**
 * Grant a Web Serial port, or a WebUSB device wrapped as a monitor port.
 * @returns {Promise<void>} Resolves when the picker finishes.
 */
async function connect(): Promise<void> {
  try {
    if (useWebUsb.checked) {
      port = await requestWebUsbPort();
    } else if (!navigator.serial) {
      throw new Error("Web Serial is not available in this browser.");
    } else {
      port = await navigator.serial.requestPort();
    }
    const info = port.getInfo();
    const vendor = info.usbVendorId === undefined ? "unknown" : `0x${info.usbVendorId.toString(16)}`;
    const product = info.usbProductId === undefined ? "unknown" : `0x${info.usbProductId.toString(16)}`;
    portStatus.textContent = `Granted vendor ${vendor}, product ${product}.`;
  } catch (error) {
    note(messageOf(error));
  }
  updateButtons();
}

/**
 * Read the form and start one monitor on the granted port.
 * @returns {Promise<void>} Resolves when the port is open, or when start fails.
 */
async function start(): Promise<void> {
  if (!port) {
    note("Choose a serial port first.");
    return;
  }
  if (monitor) {
    note("Monitor is already running.");
    return;
  }
  const elfFiles = [];
  const app = await readFile(required<HTMLInputElement>("appElf"));
  if (app) {
    elfFiles.push(app);
  }
  const rom = await readFile(required<HTMLInputElement>("romElf"));
  const next = new IDFMonitor({
    port,
    terminal: {
      write: (data) => term.write(data),
      onData: (callback) => term.onData(callback),
    },
    elfFiles,
    romElf: rom?.data,
    ...readSettings(),
  });
  wire(next);
  monitor = next;
  updateButtons();
  try {
    await next.start();
  } catch (error) {
    monitor = null;
    note(messageOf(error));
    updateButtons();
  }
}

/**
 * Stop the running monitor. The granted port object is kept for another start.
 * @returns {Promise<void>} Resolves when the port is closed.
 */
async function stopSession(): Promise<void> {
  const current = monitor;
  if (!current) {
    return;
  }
  monitor = null;
  updateButtons();
  try {
    await current.stop();
  } catch (error) {
    note(messageOf(error));
  }
}

/**
 * Run a session command, or tell the user to start first.
 * @param {function(IDFMonitor): Promise<void> | void} action Command to run.
 * @returns {Promise<void>} Resolves when the command finishes.
 */
async function run(action: (current: IDFMonitor) => Promise<void> | void): Promise<void> {
  if (!monitor) {
    note("Start the monitor first.");
    return;
  }
  try {
    await action(monitor);
  } catch (error) {
    note(messageOf(error));
  }
}

/**
 * Subscribe to the events the page shows while testing.
 * @param {IDFMonitor} current Monitor that is about to start.
 * @returns {void}
 */
function wire(current: IDFMonitor): void {
  current.on("open", (payload) => log("open", payload));
  current.on("reset", (payload) => log("reset", payload));
  current.on("line", (payload) => {
    if (!payload.printed) {
      log("line", payload);
    }
  });
  current.on("address", (payload) => log("address", payload));
  current.on("elf-sha256", (payload) => log("elf-sha256", payload));
  current.on("panic", (payload) => log("panic", payload));
  current.on("coredump", (payload) => log("coredump", { chars: payload.base64.length, progName: payload.progName }));
  current.on("gdb_stub", (payload) => {
    log("gdb_stub", payload);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-info btn-xs";
    button.textContent = "Continue stub";
    button.addEventListener("click", () => {
      void run((active) => active.continueStub());
    });
    events.appendChild(button);
  });
  current.on("flash", (payload) => {
    log("flash", payload);
    note(`Flash requested (${payload.target}${payload.full ? ", full" : ""}). Stopped. Flash with esptool-js on this port.`);
    void stopSession();
  });
  current.on("host-command", (payload) => log("host-command", payload));
  current.on("reconnect-wait", (payload) => log("reconnect-wait", payload));
  current.on("exit", (payload) => log("exit", payload));
}

/**
 * Settings controlled by the form. Port, terminal, and ELF bytes are added by start.
 * @returns {Omit<IDFMonitorOptions, "port" | "terminal" | "elfFiles" | "romElf">} Monitor options.
 */
function readSettings(): Omit<IDFMonitorOptions, "port" | "terminal" | "elfFiles" | "romElf"> {
  const customReset = valueOf("customResetSequence");
  const customHardReset = valueOf("customHardResetSequence");
  return {
    baudRate: numberOf("baudRate", 115200),
    target: valueOf("target") || "esp32",
    noReset: checked("noReset"),
    printFilter: valueOf("printFilter"),
    eol: valueOf("eol") as IDFMonitorOptions["eol"],
    timestamps: checked("timestamps"),
    timestampFormat: valueOf("timestampFormat") || "%Y-%m-%d %H:%M:%S",
    decodeAddresses: checked("decodeAddresses"),
    decodePanic: valueOf("decodePanic") as IDFMonitorOptions["decodePanic"],
    decodeCoredumps: valueOf("decodeCoredumps") as IDFMonitorOptions["decodeCoredumps"],
    autoColor: checked("autoColor"),
    reconnectDelay: numberOf("reconnectDelay", 0.5),
    openPortAttempts: numberOf("openPortAttempts", 1),
    encrypted: checked("encrypted"),
    customResetSequence: customReset || undefined,
    customHardResetSequence: customHardReset || undefined,
    keys: { skipMenuKey: checked("skipMenuKey") },
  };
}

/**
 * Read one optional ELF file.
 * @param {HTMLInputElement} input File input.
 * @returns {Promise<{ name: string, data: ArrayBuffer } | undefined>} The file, when one is selected.
 */
async function readFile(input: HTMLInputElement): Promise<{ name: string; data: ArrayBuffer } | undefined> {
  const file = input.files?.[0];
  if (!file) {
    return undefined;
  }
  return { name: file.name, data: await file.arrayBuffer() };
}

/**
 * Append one event to the on-page log. Long values are shortened.
 * @param {string} name Event id.
 * @param {unknown} payload Event payload.
 * @returns {void}
 */
function log(name: string, payload: unknown): void {
  const line = document.createElement("div");
  const text = JSON.stringify(payload);
  line.textContent = `${name} ${text.length > 180 ? `${text.slice(0, 180)}…` : text}`;
  events.appendChild(line);
  events.scrollTop = events.scrollHeight;
}

/**
 * Write a page message into the terminal.
 * @param {string} text Message without a newline.
 * @returns {void}
 */
function note(text: string): void {
  term.write(`\r\n${text}\r\n`);
}

/**
 * Enable start only after a port is granted, and stop only while a session exists.
 * @returns {void}
 */
function updateButtons(): void {
  startButton.disabled = port === null || monitor !== null;
  stopButton.disabled = monitor === null;
  connectButton.disabled = monitor !== null;
}

/**
 * @param {string} id Element id.
 * @returns {T} The element.
 */
/** Size the terminal to the column so a fixed column count does not spill the page. */
function fitTerminal(): void {
  const probe = terminalElement.querySelector(".xterm-char-measure-element");
  if (!(probe instanceof HTMLElement)) {
    return;
  }
  const metrics = probe.getBoundingClientRect();
  if (metrics.width < 1 || metrics.height < 1) {
    return;
  }
  const cols = Math.max(40, Math.floor((terminalElement.clientWidth - 16) / metrics.width));
  const rows = Math.max(10, Math.floor((terminalElement.clientHeight - 16) / metrics.height));
  term.resize(cols, rows);
}

function required<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing #${id}`);
  }
  return found as T;
}

/**
 * @param {string} id Input id.
 * @returns {string} Trimmed value.
 */
function valueOf(id: string): string {
  return required<HTMLInputElement>(id).value.trim();
}

/**
 * @param {string} id Checkbox id.
 * @returns {boolean} Whether it is checked.
 */
function checked(id: string): boolean {
  return required<HTMLInputElement>(id).checked;
}

/**
 * @param {string} id Numeric input id.
 * @param {number} fallback Value used when the field is empty or invalid.
 * @returns {number} Parsed number.
 */
function numberOf(id: string, fallback: number): number {
  const parsed = Number(valueOf(id));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {unknown} error Thrown value.
 * @returns {string} A message suitable for the terminal.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
