import { EolMode, MenuAction } from "../types.js";
import { ResolvedKeys, describeKey } from "./keys.js";

/** What {@link ConsoleParser.parse} decided to do with one character. */
export type ParsedKey =
  | { kind: "arm" }
  | { kind: "bytes"; data: string }
  | { kind: "command"; action: MenuAction; key?: string };

const VERSION = "0.1.0";

/**
 * Translate a keystroke into a device byte or a local command.
 * Same rules as `ConsoleParser` in esp-idf-monitor, including plain-letter aliases
 * (`a`, `e`, `i`, `x`, `h`) that only work after the menu key.
 */
export class ConsoleParser {
  private menuArmed = false;
  private readonly translate: (value: string) => string;

  /**
   * @param {ResolvedKeys} keys Control characters to match.
   * @param {EolMode} eol Line ending applied to device-bound input.
   */
  constructor(private readonly keys: ResolvedKeys, eol: EolMode) {
    this.translate =
      eol === "CRLF"
        ? (value) => value.replace(/\n/g, "\r\n")
        : eol === "LF"
        ? (value) => value.replace(/\r/g, "\n")
        : (value) => value.replace(/\n/g, "\r");
  }

  /**
   * Parse one character.
   * @param {string} key Character from the terminal.
   * @returns {ParsedKey} Device bytes, a local command, or the menu being armed.
   */
  parse(key: string): ParsedKey {
    if (this.menuArmed || (this.keys.skipMenu && this.isCommandKey(key))) {
      this.menuArmed = false;
      return this.menuKey(key);
    }
    if (key === this.keys.menu) {
      this.menuArmed = true;
      return { kind: "arm" };
    }
    if (key === this.keys.exit) {
      return { kind: "command", action: "exit" };
    }
    return { kind: "bytes", data: this.translate(key) };
  }

  /**
   * Help text printed for Ctrl+T then Ctrl+H.
   * @returns {string} Help text without a trailing newline.
   */
  helpText(): string {
    const row = (name: string, label: string) => `    ${name.padEnd(14)} ${label}`;
    const lines = [
      `esp-idf-monitor-js (${VERSION}) - ESP-IDF monitor`,
      "",
      `    ${describeKey(this.keys.exit).padEnd(8)} Exit program`,
      `    ${describeKey(this.keys.menu).padEnd(8)} Menu escape key, followed by:`,
      "    Menu keys:",
      row(describeKey(this.keys.menu), "Send the menu character itself to remote"),
      row(describeKey(this.keys.exit), "Send the exit character itself to remote"),
      row(describeKey(this.keys.reset), "Reset target board via RTS line"),
      row(describeKey(this.keys.flash), "Build & flash project"),
      row(`${describeKey(this.keys.appFlash)} (or A)`, "Build & flash app only"),
      row(`${describeKey(this.keys.flashAll)} (or E)`, "Build & full flash project"),
      row(describeKey(this.keys.output), "Toggle output display"),
      row(describeKey(this.keys.log), "Toggle saving output into file"),
      row(`${describeKey(this.keys.timestamps)} (or I)`, "Toggle printing timestamps"),
      row(describeKey(this.keys.bootloader), "Reset target into bootloader"),
      row(`${describeKey(this.keys.exitMenu)} (or X)`, "Exit program"),
    ];
    if (this.keys.skipMenu) {
      lines.push("", "Commands can be executed without pressing the menu escape key.");
    }
    return lines.join("\n");
  }

  /**
   * Control bytes that `skipMenuKey` promotes out of the menu.
   * Plain letters are intentionally absent.
   * @param {string} key Character to test.
   * @returns {boolean} True when the character is a command control byte.
   */
  private isCommandKey(key: string): boolean {
    return [
      this.keys.reset,
      this.keys.flash,
      this.keys.appFlash,
      this.keys.flashAll,
      this.keys.output,
      this.keys.log,
      this.keys.timestamps,
      this.keys.bootloader,
      this.keys.exitMenu,
    ].includes(key);
  }

  /**
   * Handle the character that follows the menu key.
   * @param {string} key Character to handle.
   * @returns {ParsedKey} The command or the bytes to forward.
   */
  private menuKey(key: string): ParsedKey {
    if (key === this.keys.menu || key === this.keys.exit) {
      return { kind: "command", action: "forward-menu-key", key };
    }
    if (key === "\x08" || key === "h" || key === "H" || key === "?") {
      return { kind: "command", action: "help" };
    }
    if (key === this.keys.reset) {
      return { kind: "command", action: "reset" };
    }
    if (key === this.keys.flash) {
      return { kind: "command", action: "flash" };
    }
    if (key === this.keys.appFlash || key === "a" || key === "A") {
      return { kind: "command", action: "app-flash" };
    }
    if (key === this.keys.flashAll || key === "e" || key === "E") {
      return { kind: "command", action: "flash-all" };
    }
    if (key === this.keys.output) {
      return { kind: "command", action: "output" };
    }
    if (key === this.keys.log) {
      return { kind: "command", action: "log" };
    }
    if (key === this.keys.timestamps || key === "i" || key === "I") {
      return { kind: "command", action: "timestamps" };
    }
    if (key === this.keys.bootloader) {
      return { kind: "command", action: "bootloader" };
    }
    if (key === this.keys.exitMenu || key === "x" || key === "X") {
      return { kind: "command", action: "exit" };
    }
    return { kind: "command", action: "unknown", key };
  }
}
