const LEVEL: Record<string, number> = {
  N: 0,
  E: 1,
  W: 2,
  I: 3,
  D: 4,
  V: 5,
  "*": 5,
  "": 5,
};

/**
 * ESP-IDF log prefix. The optional ANSI run is accepted so a colored line can be re-filtered.
 * Group 1 is the level, group 2 is the tag.
 */
// The CSI byte is the ANSI color ESP-IDF may already have written.
// eslint-disable-next-line no-control-regex
const LOG_LINE = /^(?:\u001b\[[01];?\d+m?)?([EWIDV]) (?:\([^)]+\) )?([^:]+): /;

/**
 * Decide which chip lines are shown. The filter never hides a line from panic, coredump,
 * gdbstub, SHA-256, or `expect`; callers apply it only when printing.
 */
export class LineMatcher {
  private readonly limits = new Map<string, number>();

  /**
   * @param {string} printFilter Space-separated `tag` or `tag:LEVEL` rules. Empty shows everything.
   */
  constructor(printFilter: string) {
    const items = printFilter.split(/\s+/).filter((item) => item.length > 0);
    if (items.length === 0) {
      this.limits.set("*", LEVEL.V);
      return;
    }
    for (const item of items) {
      const parts = item.split(":");
      if (parts.length === 1) {
        this.limits.set(parts[0], LEVEL.V);
        continue;
      }
      if (parts.length !== 2 || parts[0].length === 0) {
        throw new Error(`Invalid print filter: ${item}`);
      }
      const level = LEVEL[parts[1].toUpperCase()];
      if (level === undefined) {
        throw new Error(`Unknown level in print filter: ${item}`);
      }
      this.limits.set(parts[0], level);
    }
  }

  /**
   * Whether a line should be written to the terminal.
   * A non-log line is shown only when `*` is above `N`. An unknown tag uses `*`, which
   * defaults to `N` when the filter listed tags and did not mention `*`.
   * @param {string} line Chip line without its trailing newline.
   * @returns {boolean} True when the line is visible.
   */
  match(line: string): boolean {
    const found = LOG_LINE.exec(line);
    if (found) {
      const level = LEVEL[found[1]];
      const tag = found[2];
      const limit = this.limits.has(tag) ? this.limits.get(tag)! : this.limits.get("*") ?? LEVEL.N;
      return limit >= level;
    }
    return (this.limits.get("*") ?? LEVEL.N) > LEVEL.N;
  }
}
