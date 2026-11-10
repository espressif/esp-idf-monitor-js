const PANIC_START = /Core\s*\d+ register dump:/;

/**
 * Capture a panic from `Core N register dump:` through the blank line that ends it.
 * Output is muted once `Stack memory:` is seen. Guru Meditation text is not a trigger.
 */
export class PanicDecoder {
  /** True while stack-dump lines should be hidden. */
  suppressing = false;
  private reading = false;
  private lines: string[] = [];

  /**
   * Feed one stripped line.
   * @param {string} line Line without its newline.
   * @returns {"start" | "done" | null} `start` on the register-dump line, `done` on the blank line that ends it.
   */
  push(line: string): "start" | "done" | null {
    if (!this.reading) {
      if (!PANIC_START.test(line)) {
        return null;
      }
      this.reading = true;
      this.suppressing = false;
      this.lines = [line];
      return "start";
    }
    if (line.length === 0) {
      this.reading = false;
      this.suppressing = false;
      return "done";
    }
    if (line.includes("Stack memory:")) {
      this.suppressing = true;
    }
    this.lines.push(line);
    return null;
  }

  /**
   * Text captured since the register dump, not including the terminating blank line.
   * @returns {string} Joined lines.
   */
  text(): string {
    return this.lines.join("\n");
  }
}
