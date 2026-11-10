import { AddressFrame, LineInterval, LoadedElf } from "../types.js";

const ADDRESS = /0x[0-9a-fA-F]{8}/g;

/**
 * Resolve a program counter against loaded ELFs.
 * The built-in decoder reads the symbol table and, for an application ELF, the DWARF line table.
 * A decoder that expands inlined calls can replace this class; the monitor only needs
 * {@link AddressDecoder.addressesIn}.
 */
export interface AddressDecoder {
  /**
   * Every executable address in a finished piece of text.
   * @param {string} text Chip text.
   * @returns {AddressFrame[]} Frames, in order. Data addresses are omitted.
   */
  addressesIn(text: string): AddressFrame[];
}

/**
 * Nearest-symbol decoder. The first ELF whose executable range contains the address wins.
 * An application hit also takes its file and line from that ELF's line table.
 * The ROM ELF is last and is labeled `ROM` with no line. A 9-character tail is held back
 * while a fragment is unfinished so an address split across reads is not decoded twice.
 */
export class SymbolAddressDecoder implements AddressDecoder {
  private tail = "";

  /**
   * @param {LoadedElf[]} elves Application ELFs followed by the ROM ELF, if any.
   */
  constructor(private readonly elves: LoadedElf[]) {}

  /**
   * Scan text, optionally keeping the last 9 characters for the next unfinished fragment.
   * @param {string} text New text.
   * @param {boolean} finished When true, the tail is included and then cleared.
   * @returns {AddressFrame[]} Resolved addresses in the portion that is safe to scan.
   */
  push(text: string, finished: boolean): AddressFrame[] {
    const combined = this.tail + text;
    if (!finished) {
      const limit = Math.max(0, combined.length - 9);
      this.tail = combined.slice(limit);
      return this.addressesIn(combined.slice(0, limit));
    }
    this.tail = "";
    return this.addressesIn(combined);
  }

  /**
   * Resolve every `0x` word of exactly 8 hex digits.
   * @param {string} text Chip text.
   * @returns {AddressFrame[]} Frames whose address landed in an executable section.
   */
  addressesIn(text: string): AddressFrame[] {
    const frames: AddressFrame[] = [];
    for (const match of text.matchAll(ADDRESS)) {
      const address = Number.parseInt(match[0], 16);
      const frame = this.lookup(address);
      if (frame) {
        frames.push(frame);
      }
    }
    return frames;
  }

  /**
   * Look up one address.
   * @param {number} address Program counter.
   * @returns {AddressFrame | null} The frame, or null when no executable section contains it.
   */
  lookup(address: number): AddressFrame | null {
    for (const elf of this.elves) {
      const hit = elf.ranges.some((range) => address >= range.start && address < range.end);
      if (!hit) {
        continue;
      }
      const containing = elf.symbols
        .filter((symbol) => symbol.size > 0 && address >= symbol.value && address < symbol.value + symbol.size)
        .sort((left, right) => right.value - left.value)[0];
      const nearest = elf.symbols
        .filter((symbol) => symbol.value <= address)
        .sort((left, right) => right.value - left.value)[0];
      const symbol = containing ?? nearest;
      if (symbol) {
        const location = elf.rom ? undefined : lineAt(elf.lines, address);
        return {
          address,
          func: symbol.name,
          path: elf.rom ? "ROM" : location?.path,
          line: location?.line,
        };
      }
      if (elf.rom) {
        return { address, func: "??", path: "ROM" };
      }
      return null;
    }
    return null;
  }
}

/**
 * Find the line-table row that covers an address.
 * @param {LineInterval[]} lines Intervals ordered by start address.
 * @param {number} address Program counter.
 * @returns {LineInterval | undefined} The covering row, when the address falls in one.
 */
function lineAt(lines: LineInterval[], address: number): LineInterval | undefined {
  let low = 0;
  let high = lines.length - 1;
  let found: LineInterval | undefined;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const row = lines[mid];
    if (row.start <= address) {
      found = row;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (found && address < found.end) {
    return found;
  }
  return undefined;
}

/**
 * Format one frame the way the monitor writes it under the chip line.
 * @param {AddressFrame} frame Resolved address.
 * @returns {string} A single display line without the `--- ` prefix.
 */
export function formatAddress(frame: AddressFrame): string {
  const address = `0x${frame.address.toString(16).padStart(8, "0")}`;
  if (frame.path && frame.line !== undefined) {
    return `${address}: ${frame.func} at ${frame.path}:${frame.line}`;
  }
  if (frame.path) {
    return `${address}: ${frame.func} at ${frame.path}`;
  }
  return `${address}: ${frame.func}`;
}
