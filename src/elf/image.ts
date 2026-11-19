import { readLineTable } from "./line-table.js";
import { LoadedElf } from "../types.js";
import { MonitorError } from "../types.js";

const SHF_EXECINSTR = 0x4;
const SHT_PROGBITS = 1;
const SHT_SYMTAB = 2;
const SHT_STRTAB = 3;

/** One `SHT_PROGBITS` span. `offset` indexes {@link ElfData.bytes}; the image is not copied. */
export interface ElfSection {
  /** Section name from the ELF string table. `.noload` holds binary-log format strings. */
  name: string;
  /** Virtual address. */
  addr: number;
  /** File offset of the section bytes. */
  offset: number;
  /** Section size in bytes. */
  size: number;
}

/**
 * ELF bytes plus the section spans a binary-log decoder reads.
 * `bytes` is the view passed by the page.
 */
export interface ElfData {
  /** Caller-supplied name. A bootloader image ends with `bootloader.elf`. */
  name: string;
  /** ELF image. Not copied. */
  bytes: Uint8Array;
  /** Loadable sections that have file bytes, including `.noload`. */
  sections: ElfSection[];
}

/**
 * Copy an `ArrayBuffer` or a view into a `Uint8Array` the ELF parser can index.
 * @param {ArrayBuffer | Uint8Array} data ELF bytes.
 * @returns {Uint8Array} A view of those bytes.
 */
export function asBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  return new Uint8Array(data);
}

/**
 * Lower-case SHA-256 of the ELF file bytes. This is the comparison esp-idf-monitor prints.
 * @param {Uint8Array} bytes ELF bytes.
 * @returns {Promise<string>} Hex digest.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Load executable ranges, named symbols, and DWARF line locations from an ELF image.
 * Both ELF32 and ELF64, little or big endian, are accepted. A ROM image skips the line table.
 * A missing or corrupt line table leaves {@link LoadedElf.lines} empty and does not fail the load.
 * @param {string} name Name reported in events.
 * @param {ArrayBuffer | Uint8Array} data ELF bytes.
 * @param {boolean} rom True when this is the ROM ELF. Addresses that hit it and have no symbol are labeled `ROM`.
 * @returns {Promise<LoadedElf>} Ranges, symbols, line intervals, and the file digest.
 */
export async function loadElf(name: string, data: ArrayBuffer | Uint8Array, rom = false): Promise<LoadedElf> {
  const bytes = asBytes(data);
  const parsed = parseElf(bytes);
  return {
    name,
    ranges: parsed.ranges,
    symbols: parsed.symbols,
    sha256: await sha256Hex(bytes),
    rom,
    lines: rom ? [] : readLineTable(bytes),
  };
}

/**
 * Index `SHT_PROGBITS` sections, including `.noload`, without copying the image.
 * Binary-log format strings are resolved through {@link readAt}.
 * @param {string} name Caller-supplied name. Bootloader frames select a name ending in `bootloader.elf`.
 * @param {ArrayBuffer | Uint8Array} data ELF bytes.
 * @returns {ElfData} The same bytes plus section spans.
 */
export function indexElf(name: string, data: ArrayBuffer | Uint8Array): ElfData {
  const bytes = asBytes(data);
  const sections = readSections(bytes)
    .filter(
      (section) =>
        section.type === SHT_PROGBITS &&
        section.size > 0 &&
        section.offset >= 0 &&
        section.size <= bytes.length &&
        section.offset <= bytes.length - section.size,
    )
    .map((section) => ({
      name: section.name,
      addr: section.addr,
      offset: section.offset,
      size: section.size,
    }));
  return { name, bytes, sections };
}

/**
 * Bytes at a virtual address. With no length, the read stops at the first NUL.
 * An address whose top byte is 0 is resolved only in `.noload`, matching esp-idf-monitor.
 * The result views {@link ElfData.bytes}.
 * @param {ElfData} elf Indexed image.
 * @param {number} addr Virtual address from a binary-log frame.
 * @param {number} [length] Explicit byte count. Omit it to read a C string.
 * @returns {Uint8Array | null} The bytes, or null when no section covers `addr`. An immediate NUL is an empty array.
 */
export function readAt(elf: ElfData, addr: number, length?: number): Uint8Array | null {
  const sections = addr >>> 24 === 0 ? elf.sections.filter((section) => section.name === ".noload") : elf.sections;
  for (const section of sections) {
    if (addr < section.addr || addr >= section.addr + section.size) {
      continue;
    }
    const start = section.offset + (addr - section.addr);
    const end = section.offset + section.size;
    if (start < section.offset || start >= end || start >= elf.bytes.length) {
      continue;
    }
    const data = elf.bytes.subarray(start, Math.min(end, elf.bytes.length));
    if (data.length === 0) {
      continue;
    }
    const endOffset = length !== undefined ? length : data.indexOf(0);
    if (endOffset >= 0) {
      return data.subarray(0, Math.min(endOffset, data.length));
    }
  }
  return null;
}

/**
 * Parse section headers. Exported so tests can inspect a fixture without hashing.
 * @param {Uint8Array} bytes ELF bytes.
 * @returns {Pick<LoadedElf, "ranges" | "symbols">} Executable ranges and symbols.
 */
export function parseElf(bytes: Uint8Array): Pick<LoadedElf, "ranges" | "symbols"> {
  const sections = readSections(bytes);
  const elf64 = bytes[4] === 2;
  const little = bytes[5] !== 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readU16 = (offset: number) => view.getUint16(offset, little);
  const readU32 = (offset: number) => view.getUint32(offset, little);
  const readU64 = (offset: number) => {
    const low = little ? view.getUint32(offset, true) : view.getUint32(offset + 4, false);
    const high = little ? view.getUint32(offset + 4, true) : view.getUint32(offset, false);
    return high * 0x100000000 + low;
  };
  const readAddr = elf64 ? readU64 : (offset: number) => readU32(offset);
  const ranges = sections
    .filter((section) => (section.flags & SHF_EXECINSTR) !== 0 && section.size > 0)
    .map((section) => ({ start: section.addr, end: section.addr + section.size }));

  const symbols: Array<{ name: string; value: number; size: number }> = [];
  for (const section of sections) {
    if (section.type !== SHT_SYMTAB) {
      continue;
    }
    const strings = sections[section.link];
    if (!strings || strings.type !== SHT_STRTAB) {
      continue;
    }
    const step = section.entsize || (elf64 ? 24 : 16);
    for (let offset = 0; offset + step <= section.size; offset += step) {
      const at = section.offset + offset;
      if (at + step > bytes.length) {
        break;
      }
      const nameOffset = readU32(at);
      const info = bytes[elf64 ? at + 4 : at + 12];
      const value = elf64 ? readAddr(at + 8) : readU32(at + 4);
      const size = elf64 ? readAddr(at + 16) : readU32(at + 8);
      const shndx = readU16(elf64 ? at + 6 : at + 14);
      if (shndx === 0 || nameOffset === 0) {
        continue;
      }
      const name = readCString(bytes, strings.offset + nameOffset);
      if (!name) {
        continue;
      }
      // STT_SECTION (3) is not a callable symbol. Everything else can label an address.
      if ((info & 0xf) === 3) {
        continue;
      }
      symbols.push({ name, value, size });
    }
  }

  return { ranges, symbols };
}

interface Section {
  name: string;
  type: number;
  flags: number;
  addr: number;
  offset: number;
  size: number;
  link: number;
  entsize: number;
}

/**
 * Read section headers, including each section name.
 * @param {Uint8Array} bytes ELF bytes.
 * @returns {Section[]} Sections in file order.
 */
function readSections(bytes: Uint8Array): Section[] {
  if (bytes.length < 52 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) {
    throw new MonitorError("Not an ELF file");
  }
  const elf64 = bytes[4] === 2;
  if (bytes[4] !== 1 && !elf64) {
    throw new MonitorError("Unsupported ELF class");
  }
  const little = bytes[5] !== 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readU16 = (offset: number) => view.getUint16(offset, little);
  const readU32 = (offset: number) => view.getUint32(offset, little);
  const readU64 = (offset: number) => {
    const low = little ? view.getUint32(offset, true) : view.getUint32(offset + 4, false);
    const high = little ? view.getUint32(offset + 4, true) : view.getUint32(offset, false);
    return high * 0x100000000 + low;
  };
  const readAddr = elf64 ? readU64 : (offset: number) => readU32(offset);

  const shoff = readAddr(elf64 ? 40 : 32);
  const shentsize = readU16(elf64 ? 58 : 46);
  const shnum = readU16(elf64 ? 60 : 48);
  const shstrndx = readU16(elf64 ? 62 : 50);
  const headerBytes = shoff + shnum * shentsize;
  if (shoff <= 0 || shentsize < (elf64 ? 64 : 40) || headerBytes > bytes.length) {
    throw new MonitorError("ELF section headers are truncated");
  }

  const sections: Section[] = [];
  const nameOffsets: number[] = [];
  for (let index = 0; index < shnum; index += 1) {
    const base = shoff + index * shentsize;
    nameOffsets.push(readU32(base));
    if (elf64) {
      sections.push({
        name: "",
        type: readU32(base + 4),
        flags: readAddr(base + 8),
        addr: readAddr(base + 16),
        offset: readAddr(base + 24),
        size: readAddr(base + 32),
        link: readU32(base + 40),
        entsize: readAddr(base + 56),
      });
    } else {
      sections.push({
        name: "",
        type: readU32(base + 4),
        flags: readU32(base + 8),
        addr: readU32(base + 12),
        offset: readU32(base + 16),
        size: readU32(base + 20),
        link: readU32(base + 24),
        entsize: readU32(base + 36),
      });
    }
  }

  const table = sections[shstrndx];
  for (let index = 0; index < sections.length; index += 1) {
    sections[index].name = sectionName(bytes, table, nameOffsets[index]);
  }
  return sections;
}

/**
 * Section name from the section-header string table.
 * @param {Uint8Array} bytes ELF bytes.
 * @param {Section | undefined} table `.shstrtab` section.
 * @param {number} nameOffset Offset of the name inside the string table.
 * @returns {string} The name, or empty when the table does not cover it.
 */
function sectionName(bytes: Uint8Array, table: Section | undefined, nameOffset: number): string {
  if (!table || table.size <= 0 || nameOffset < 0 || nameOffset >= table.size) {
    return "";
  }
  const start = table.offset + nameOffset;
  if (start < table.offset || start >= table.offset + table.size) {
    return "";
  }
  return readCString(bytes, start);
}

/**
 * Read a NUL-terminated ASCII string. Non-ASCII bytes stop the string.
 * @param {Uint8Array} bytes File bytes.
 * @param {number} offset Start index.
 * @returns {string} The string, or empty when it is missing.
 */
function readCString(bytes: Uint8Array, offset: number): string {
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0) {
    end += 1;
  }
  return new TextDecoder("utf-8").decode(bytes.subarray(offset, end));
}
