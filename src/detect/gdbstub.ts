const PACKET = /\$(T..)#([0-9a-fA-F]{2})/;

/**
 * Find a checksum-valid gdbstub stop packet. Six trailing characters are kept so a
 * packet split across reads still matches. A bad checksum is reported and consumed.
 */
export class GdbStubDetector {
  private tail = "";

  /**
   * Feed the next chip line.
   * @param {string} text New text.
   * @returns {{ packet: string } | { malformed: true } | null} A valid packet, a bad checksum, or nothing.
   */
  push(text: string): { packet: string } | { malformed: true } | null {
    const combined = this.tail + text;
    this.tail = "";
    const match = PACKET.exec(combined);
    if (!match) {
      this.tail = combined.slice(-6);
      return null;
    }
    let sum = 0;
    for (const char of match[1]) {
      sum = (sum + char.charCodeAt(0)) & 0xff;
    }
    if (sum !== Number.parseInt(match[2], 16)) {
      return { malformed: true };
    }
    return { packet: match[0] };
  }
}
