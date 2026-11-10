const AUTO_COLOR = /^(I|W|E) \([\d:. -]+\)/;

const COLOR: Record<string, string> = {
  I: "\u001b[0;32m",
  W: "\u001b[0;33m",
  E: "\u001b[0;31m",
};

const RESET = "\u001b[0m";

/**
 * Paint `I` / `W` / `E` log lines and pass every other ANSI sequence through.
 * A partial line leaves the color open until the newline arrives.
 */
export class Colorizer {
  private open = false;

  /**
   * @param {boolean} enabled When false, the fragment is returned unchanged.
   */
  constructor(private readonly enabled: boolean) {}

  /**
   * Color one fragment. The fragment may end with a newline.
   * @param {string} fragment Chip text.
   * @returns {string} The same text, with ANSI color wrapped around a matching log line.
   */
  apply(fragment: string): string {
    if (!this.enabled) {
      return fragment;
    }
    const newlineAt = fragment.search(/\r\n|\n|\r/);
    const body = newlineAt === -1 ? fragment : fragment.slice(0, newlineAt);
    const ending = newlineAt === -1 ? "" : fragment.slice(newlineAt);
    if (!this.open) {
      const match = AUTO_COLOR.exec(body);
      if (!match) {
        return fragment;
      }
      const color = COLOR[match[1]];
      if (ending) {
        return `${color}${body}${RESET}${ending}`;
      }
      this.open = true;
      return `${color}${body}`;
    }
    if (ending) {
      this.open = false;
      return `${body}${RESET}${ending}`;
    }
    return fragment;
  }
}

/**
 * Format a date with the small `strftime` subset the monitor documents.
 * @param {Date} date Clock reading.
 * @param {string} format Format string. Unknown tokens are left in place.
 * @returns {string} Formatted timestamp.
 */
export function formatTimestamp(date: Date, format: string): string {
  const pad = (value: number, width = 2) => value.toString().padStart(width, "0");
  return format.replace(/%Y|%m|%d|%H|%M|%S|%f|%%/g, (token) => {
    switch (token) {
      case "%Y":
        return String(date.getFullYear());
      case "%m":
        return pad(date.getMonth() + 1);
      case "%d":
        return pad(date.getDate());
      case "%H":
        return pad(date.getHours());
      case "%M":
        return pad(date.getMinutes());
      case "%S":
        return pad(date.getSeconds());
      case "%f":
        return pad(date.getMilliseconds(), 3);
      default:
        return "%";
    }
  });
}

/**
 * Insert a timestamp at each start-of-line, including after a newline embedded in the fragment.
 */
export class Timestamper {
  private atStart = true;

  /**
   * @param {boolean} enabled Start enabled or not. {@link setEnabled} toggles it later.
   * @param {string} format Timestamp format.
   * @param {function(): Date} now Clock. Tests can freeze it.
   */
  constructor(
    private enabled: boolean,
    private readonly format: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Turn timestamps on or off. The next chip line is treated as a new line.
   * @param {boolean} enabled Whether to prefix lines.
   * @returns {void}
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.atStart = true;
  }

  /**
   * A monitor status line ended, so the next chip byte starts a line.
   * @returns {void}
   */
  forceStart(): void {
    this.atStart = true;
  }

  /**
   * Prefix timestamps onto a fragment.
   * @param {string} fragment Chip text that may contain newlines.
   * @returns {string} Fragment, with a timestamp inserted at each line start when enabled.
   */
  apply(fragment: string): string {
    if (!this.enabled) {
      this.track(fragment);
      return fragment;
    }
    let out = "";
    for (let index = 0; index < fragment.length; ) {
      if (this.atStart) {
        out += `${formatTimestamp(this.now(), this.format)} `;
        this.atStart = false;
      }
      const rest = fragment.slice(index);
      const newlineAt = rest.search(/\r\n|\n|\r/);
      if (newlineAt === -1) {
        out += rest;
        break;
      }
      const separator = rest.startsWith("\r\n", newlineAt) ? 2 : 1;
      out += rest.slice(0, newlineAt + separator);
      index += newlineAt + separator;
      this.atStart = true;
    }
    return out;
  }

  /**
   * Keep line-start tracking even while timestamps are off, so enabling them mid-line waits.
   * @param {string} fragment Chip text.
   * @returns {void}
   */
  private track(fragment: string): void {
    if (fragment.length === 0) {
      return;
    }
    this.atStart = /[\r\n]$/.test(fragment);
  }
}
