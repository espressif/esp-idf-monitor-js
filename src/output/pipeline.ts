/** Where a finished or flushed fragment goes. */
export interface LineSink {
  /**
   * Receive one piece of chip text.
   * @param {string} fragment Text, including its newline when it has one.
   * @param {boolean} newline True when `fragment` ends a line. False for a timed-out partial line.
   * @returns {void}
   */
  push(fragment: string, newline: boolean): void;
  /**
   * Three UTF-8 failures in a row.
   * @returns {void}
   */
  decodeWarning(): void;
}

/**
 * Assemble serial bytes into lines. A partial line is flushed after `flushIntervalMs`
 * unless a core dump is in progress, because espcoredump treats a blank line as the end.
 */
export class LineBuffer {
  private decoder = new TextDecoder("utf-8", { fatal: true });
  private pending = "";
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * @param {LineSink} sink Consumer of complete lines.
   * @param {number} flushIntervalMs Quiet time before a partial line is shown.
   * @param {function(): boolean} coredumpActive When true, the partial-line flush is held back.
   */
  constructor(
    private readonly sink: LineSink,
    private readonly flushIntervalMs: number,
    private readonly coredumpActive: () => boolean,
  ) {}

  /**
   * Append a serial chunk.
   * @param {Uint8Array} bytes Raw bytes.
   * @returns {void}
   */
  push(bytes: Uint8Array): void {
    let text: string;
    try {
      text = this.decoder.decode(bytes, { stream: true });
      this.failures = 0;
    } catch {
      this.failures += 1;
      if (this.failures >= 3) {
        this.sink.decodeWarning();
        this.failures = 0;
      }
      this.decoder = new TextDecoder("utf-8", { fatal: true });
      text = new TextDecoder("utf-8").decode(bytes);
    }
    if (text.length === 0) {
      return;
    }
    this.pending += text;
    if (this.pending.startsWith("\u001b[5n")) {
      this.emit(this.pending, false);
      this.pending = "";
      this.clearTimer();
      return;
    }
    this.drain();
    this.armTimer();
  }

  /**
   * Drop a pending flush. Called when the monitor stops.
   * @returns {void}
   */
  dispose(): void {
    this.clearTimer();
  }

  /**
   * Emit every complete line, keeping a trailing fragment that has no newline.
   * @returns {void}
   */
  private drain(): void {
    while (this.pending.length > 0) {
      const match = /\r\n|\n|\r/.exec(this.pending);
      if (!match) {
        return;
      }
      const end = match.index + match[0].length;
      const line = this.pending.slice(0, end);
      this.pending = this.pending.slice(end);
      this.sink.push(line, true);
    }
    this.clearTimer();
  }

  /**
   * Schedule a flush of the current partial line.
   * @returns {void}
   */
  private armTimer(): void {
    this.clearTimer();
    if (this.pending.length === 0 || this.coredumpActive()) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.pending.length === 0 || this.coredumpActive()) {
        return;
      }
      const line = this.pending;
      this.pending = "";
      this.sink.push(line, false);
    }, this.flushIntervalMs);
  }

  /**
   * Cancel the partial-line timer.
   * @returns {void}
   */
  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Forward one fragment.
   * @param {string} fragment Text to emit.
   * @param {boolean} newline Whether it ends a line.
   * @returns {void}
   */
  private emit(fragment: string, newline: boolean): void {
    this.sink.push(fragment, newline);
  }
}
