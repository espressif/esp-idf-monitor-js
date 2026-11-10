const START = "================= CORE DUMP START =================";
const END = "================= CORE DUMP END =================";
const PROMPT = "Press Enter to print core dump to UART...";

/** What a core-dump line asked the monitor to do. */
export type CoredumpStep =
  | { kind: "prompt" }
  | { kind: "start" }
  | { kind: "body"; progress?: number }
  | { kind: "end"; base64: string };

/**
 * UART core-dump state machine. The body is kept in memory and returned as base64
 * with the line breaks removed.
 */
export class CoredumpDetector {
  /** True while the body is being captured. The line buffer must not flush a partial line. */
  active = false;
  private body: string[] = [];
  private announced = 0;

  /**
   * Feed one stripped line.
   * @param {string} line Line without its newline.
   * @returns {CoredumpStep | null} The transition, or null when this line is ordinary output.
   */
  push(line: string): CoredumpStep | null {
    if (line.includes(PROMPT)) {
      return { kind: "prompt" };
    }
    if (line.includes(START)) {
      this.active = true;
      this.body = [];
      this.announced = 0;
      return { kind: "start" };
    }
    if (!this.active) {
      return null;
    }
    if (line.includes(END)) {
      this.active = false;
      const base64 = this.body.join("");
      this.body = [];
      return { kind: "end", base64 };
    }
    this.body.push(line.trim());
    const bytes = this.body.join("").length;
    let progress: number | undefined;
    if (bytes >= this.announced + 1024) {
      this.announced = Math.floor(bytes / 1024) * 1024;
      progress = this.announced;
    }
    return { kind: "body", progress };
  }
}
