import { LineInterval } from "../types.js";

const DW_AT_STMT_LIST = 0x10;
const DW_AT_COMP_DIR = 0x1b;
const DW_FORM_ADDR = 0x01;
const DW_FORM_BLOCK2 = 0x03;
const DW_FORM_BLOCK4 = 0x04;
const DW_FORM_DATA2 = 0x05;
const DW_FORM_DATA4 = 0x06;
const DW_FORM_DATA8 = 0x07;
const DW_FORM_STRING = 0x08;
const DW_FORM_BLOCK = 0x09;
const DW_FORM_BLOCK1 = 0x0a;
const DW_FORM_DATA1 = 0x0b;
const DW_FORM_FLAG = 0x0c;
const DW_FORM_SDATA = 0x0d;
const DW_FORM_STRP = 0x0e;
const DW_FORM_UDATA = 0x0f;
const DW_FORM_REF_ADDR = 0x10;
const DW_FORM_REF1 = 0x11;
const DW_FORM_REF2 = 0x12;
const DW_FORM_REF4 = 0x13;
const DW_FORM_REF8 = 0x14;
const DW_FORM_REF_UDATA = 0x15;
const DW_FORM_INDIRECT = 0x16;
const DW_FORM_SEC_OFFSET = 0x17;
const DW_FORM_EXPRLOC = 0x18;
const DW_FORM_FLAG_PRESENT = 0x19;
const DW_FORM_STRX = 0x1a;
const DW_FORM_ADDRX = 0x1b;
const DW_FORM_REF_SUP4 = 0x1c;
const DW_FORM_STRP_SUP = 0x1d;
const DW_FORM_DATA16 = 0x1e;
const DW_FORM_LINE_STRP = 0x1f;
const DW_FORM_REF_SIG8 = 0x20;
const DW_FORM_IMPLICIT_CONST = 0x21;
const DW_FORM_LOCLISTX = 0x22;
const DW_FORM_RNGLISTX = 0x23;
const DW_FORM_REF_SUP8 = 0x24;
const DW_FORM_STRX1 = 0x25;
const DW_FORM_STRX2 = 0x26;
const DW_FORM_STRX3 = 0x27;
const DW_FORM_STRX4 = 0x28;
const DW_FORM_ADDRX1 = 0x29;
const DW_FORM_ADDRX2 = 0x2a;
const DW_FORM_ADDRX3 = 0x2b;
const DW_FORM_ADDRX4 = 0x2c;
const DW_LNCT_PATH = 0x1;
const DW_LNCT_DIRECTORY_INDEX = 0x2;
const DW_LNS_COPY = 1;
const DW_LNS_ADVANCE_PC = 2;
const DW_LNS_ADVANCE_LINE = 3;
const DW_LNS_SET_FILE = 4;
const DW_LNS_SET_COLUMN = 5;
const DW_LNS_NEGATE_STMT = 6;
const DW_LNS_SET_BASIC_BLOCK = 7;
const DW_LNS_CONST_ADD_PC = 8;
const DW_LNS_FIXED_ADVANCE_PC = 9;
const DW_LNS_SET_PROLOGUE_END = 10;
const DW_LNS_SET_EPILOGUE_BEGIN = 11;
const DW_LNS_SET_ISA = 12;
const DW_LNE_END_SEQUENCE = 1;
const DW_LNE_SET_ADDRESS = 2;
const DW_LNE_DEFINE_FILE = 3;
const DW_LNE_SET_DISCRIMINATOR = 4;

interface Slice {
  offset: number;
  size: number;
}

interface SourceFile {
  name: string;
  directory: number;
}

interface AbbrevAttribute {
  name: number;
  form: number;
  constant?: number;
}

interface Abbrev {
  attributes: AbbrevAttribute[];
}

/**
 * Read `.debug_line` into half-open source intervals.
 * A missing table, or a unit that cannot be parsed, contributes nothing.
 * Symbol lookup still works when this returns an empty list.
 * @param {Uint8Array} bytes ELF image.
 * @returns {LineInterval[]} Intervals ordered by start address.
 */
export function readLineTable(bytes: Uint8Array): LineInterval[] {
  try {
    return collectLines(bytes);
  } catch {
    return [];
  }
}

/**
 * Walk every line-number program in the image.
 * @param {Uint8Array} bytes ELF image.
 * @returns {LineInterval[]} Parsed intervals. Malformed units are skipped.
 */
function collectLines(bytes: Uint8Array): LineInterval[] {
  const image = elfLayout(bytes);
  if (!image) {
    return [];
  }
  const line = image.sections.get(".debug_line");
  if (!line || line.size <= 0) {
    return [];
  }
  const strings = image.sections.get(".debug_str");
  const lineStrings = image.sections.get(".debug_line_str");
  let directories = new Map<number, string>();
  try {
    directories = compilationDirectories(bytes, image.little, image.sections);
  } catch {
    directories = new Map();
  }
  const cursor = new Cursor(bytes, image.little, line.offset, line.offset + line.size);
  const intervals: LineInterval[] = [];
  while (cursor.offset + 4 <= cursor.limit) {
    const unitStart = cursor.offset;
    const length = cursor.u32();
    if (length === 0xffffffff) {
      const wide = cursor.u64();
      if (!Number.isSafeInteger(wide) || unitStart + 12 + wide > cursor.limit) {
        break;
      }
      cursor.offset = unitStart + 12 + wide;
      continue;
    }
    const unitEnd = unitStart + 4 + length;
    if (length < 4 || unitEnd > cursor.limit) {
      break;
    }
    const saved = cursor.limit;
    cursor.limit = unitEnd;
    try {
      const relative = unitStart - line.offset;
      parseLineUnit(cursor, image.addressSize, directories.get(relative) ?? "", bytes, strings, lineStrings, intervals);
    } catch {
      // This compilation unit does not contribute locations.
    }
    cursor.limit = saved;
    cursor.offset = unitEnd;
  }
  return orderLines(intervals);
}

/**
 * Parse one DWARF 4 or DWARF 5 line-number unit.
 * @param {Cursor} cursor Positioned just after the unit length.
 * @param {number} elfAddressSize Address width of the ELF, used by DWARF 4.
 * @param {string} compDir Compilation directory for DWARF 4 directory index 0.
 * @param {Uint8Array} bytes ELF bytes, for string sections.
 * @param {Slice | undefined} strings `.debug_str`, when present.
 * @param {Slice | undefined} lineStrings `.debug_line_str`, when present.
 * @param {LineInterval[]} intervals Rows appended for this unit.
 * @returns {void}
 */
function parseLineUnit(
  cursor: Cursor,
  elfAddressSize: number,
  compDir: string,
  bytes: Uint8Array,
  strings: Slice | undefined,
  lineStrings: Slice | undefined,
  intervals: LineInterval[],
): void {
  const version = cursor.u16();
  let addressSize = elfAddressSize;
  let segmentSize = 0;
  if (version === 5) {
    addressSize = cursor.u8();
    segmentSize = cursor.u8();
  } else if (version !== 4) {
    return;
  }
  const headerLength = cursor.u32();
  const programStart = cursor.offset + headerLength;
  if (programStart > cursor.limit) {
    throw new Error("line header overruns its unit");
  }
  const minInstruction = cursor.u8() || 1;
  const maxOperations = cursor.u8() || 1;
  const defaultIsStmt = cursor.u8() !== 0;
  const lineBase = cursor.s8();
  const lineRange = cursor.u8();
  const opcodeBase = cursor.u8();
  if (lineRange === 0 || opcodeBase < 1 || programStart < cursor.offset) {
    throw new Error("line header is not usable");
  }
  const operandCounts: number[] = [];
  for (let index = 1; index < opcodeBase; index += 1) {
    operandCounts.push(cursor.u8());
  }

  const includeDirs: string[] = [];
  const files: SourceFile[] = [];
  if (version === 4) {
    includeDirs.push(compDir);
    while (cursor.offset < programStart && cursor.peek() !== 0) {
      includeDirs.push(cursor.cstring());
    }
    cursor.u8();
    files.push({ name: "", directory: 0 });
    while (cursor.offset < programStart && cursor.peek() !== 0) {
      const name = cursor.cstring();
      const directory = cursor.uleb();
      cursor.uleb();
      cursor.uleb();
      files.push({ name, directory });
    }
    cursor.u8();
  } else {
    readEntries(cursor, addressSize, bytes, strings, lineStrings, true, includeDirs, files);
    readEntries(cursor, addressSize, bytes, strings, lineStrings, false, includeDirs, files);
  }
  if (cursor.offset > programStart) {
    throw new Error("line header does not match its length");
  }
  cursor.offset = programStart;
  runProgram(
    cursor,
    {
      version,
      addressSize,
      segmentSize,
      minInstruction,
      maxOperations,
      defaultIsStmt,
      lineBase,
      lineRange,
      opcodeBase,
      operandCounts,
      directories: includeDirs,
      files,
    },
    intervals,
  );
}

interface ProgramHeader {
  version: number;
  addressSize: number;
  segmentSize: number;
  minInstruction: number;
  maxOperations: number;
  defaultIsStmt: boolean;
  lineBase: number;
  lineRange: number;
  opcodeBase: number;
  operandCounts: number[];
  directories: string[];
  files: SourceFile[];
}

interface Machine {
  address: number;
  opIndex: number;
  file: number;
  line: number;
}

/**
 * Execute a line-number program and append one interval per emitted row.
 * @param {Cursor} cursor Start of the opcode stream.
 * @param {ProgramHeader} header Registers and file table for this unit.
 * @param {LineInterval[]} intervals Destination.
 * @returns {void}
 */
function runProgram(cursor: Cursor, header: ProgramHeader, intervals: LineInterval[]): void {
  const reset = (): Machine => ({
    address: 0,
    opIndex: 0,
    file: header.version >= 5 ? 0 : 1,
    line: 1,
  });
  let state = reset();
  let open: Machine | null = null;

  const advance = (operationAdvance: number): void => {
    state.address += header.minInstruction * Math.floor((state.opIndex + operationAdvance) / header.maxOperations);
    state.opIndex = (state.opIndex + operationAdvance) % header.maxOperations;
  };
  const emit = (endSequence: boolean): void => {
    if (open && state.address > open.address) {
      const path = sourcePath(header, open.file);
      if (path) {
        intervals.push({ start: open.address, end: state.address, path, line: open.line });
      }
    }
    open = endSequence ? null : { address: state.address, opIndex: state.opIndex, file: state.file, line: state.line };
  };

  while (cursor.offset < cursor.limit) {
    const opcode = cursor.u8();
    if (opcode === 0) {
      const length = cursor.uleb();
      const extendedEnd = cursor.offset + length;
      if (extendedEnd > cursor.limit) {
        throw new Error("extended opcode overruns its unit");
      }
      const extended = cursor.u8();
      if (extended === DW_LNE_END_SEQUENCE) {
        emit(true);
        state = reset();
      } else if (extended === DW_LNE_SET_ADDRESS) {
        if (header.segmentSize) {
          cursor.skip(header.segmentSize);
        }
        state.address = cursor.address(header.addressSize);
        state.opIndex = 0;
      } else if (extended === DW_LNE_DEFINE_FILE) {
        const name = cursor.cstring();
        const directory = cursor.uleb();
        cursor.uleb();
        cursor.uleb();
        header.files.push({ name, directory });
      } else if (extended === DW_LNE_SET_DISCRIMINATOR) {
        cursor.uleb();
      }
      cursor.offset = extendedEnd;
      continue;
    }
    if (opcode < header.opcodeBase) {
      switch (opcode) {
        case DW_LNS_COPY:
          emit(false);
          break;
        case DW_LNS_ADVANCE_PC:
          advance(cursor.uleb());
          break;
        case DW_LNS_ADVANCE_LINE:
          state.line += cursor.sleb();
          break;
        case DW_LNS_SET_FILE:
          state.file = cursor.uleb();
          break;
        case DW_LNS_SET_COLUMN:
          cursor.uleb();
          break;
        case DW_LNS_NEGATE_STMT:
        case DW_LNS_SET_BASIC_BLOCK:
        case DW_LNS_SET_PROLOGUE_END:
        case DW_LNS_SET_EPILOGUE_BEGIN:
          break;
        case DW_LNS_CONST_ADD_PC:
          advance(Math.floor((255 - header.opcodeBase) / header.lineRange));
          break;
        case DW_LNS_FIXED_ADVANCE_PC:
          state.address += cursor.u16();
          state.opIndex = 0;
          break;
        case DW_LNS_SET_ISA:
          cursor.uleb();
          break;
        default: {
          const count = header.operandCounts[opcode - 1] ?? 0;
          for (let index = 0; index < count; index += 1) {
            cursor.uleb();
          }
        }
      }
      continue;
    }
    const adjusted = opcode - header.opcodeBase;
    advance(Math.floor(adjusted / header.lineRange));
    state.line += header.lineBase + (adjusted % header.lineRange);
    emit(false);
  }
}

/**
 * Read a DWARF 5 directory or file table.
 * @param {Cursor} cursor Header cursor.
 * @param {number} addressSize Address width used by `DW_FORM_addr` entries.
 * @param {Uint8Array} bytes ELF bytes.
 * @param {Slice | undefined} strings `.debug_str`.
 * @param {Slice | undefined} lineStrings `.debug_line_str`.
 * @param {boolean} directories True for the directory table.
 * @param {string[]} includeDirs Directory paths, appended when `directories` is true.
 * @param {SourceFile[]} files File entries, appended when `directories` is false.
 * @returns {void}
 */
function readEntries(
  cursor: Cursor,
  addressSize: number,
  bytes: Uint8Array,
  strings: Slice | undefined,
  lineStrings: Slice | undefined,
  directories: boolean,
  includeDirs: string[],
  files: SourceFile[],
): void {
  const formats: Array<{ content: number; form: number }> = [];
  const formatCount = cursor.u8();
  for (let index = 0; index < formatCount; index += 1) {
    formats.push({ content: cursor.uleb(), form: cursor.uleb() });
  }
  const count = cursor.uleb();
  for (let index = 0; index < count; index += 1) {
    let name = "";
    let directory = 0;
    for (const format of formats) {
      const value = cursor.form(format.form, addressSize, bytes, strings, lineStrings);
      if (format.content === DW_LNCT_PATH && typeof value === "string") {
        name = value;
      } else if (format.content === DW_LNCT_DIRECTORY_INDEX && typeof value === "number") {
        directory = value;
      }
    }
    if (directories) {
      includeDirs.push(name);
    } else {
      files.push({ name, directory });
    }
  }
}

/**
 * Join a file entry with its directory the way addr2line prints it.
 * An absolute file name is kept. Relative names are not normalized.
 * @param {ProgramHeader} header File and directory tables.
 * @param {number} index File register value.
 * @returns {string} The path, or empty when the index is not in the table.
 */
function sourcePath(header: ProgramHeader, index: number): string {
  const file = header.files[index];
  if (!file?.name) {
    return "";
  }
  if (file.name.startsWith("/") || /^[A-Za-z]:[\\/]/.test(file.name)) {
    return file.name;
  }
  const directory = header.directories[file.directory] ?? "";
  if (!directory) {
    return file.name;
  }
  const separator = directory.endsWith("/") || directory.endsWith("\\") ? "" : "/";
  return `${directory}${separator}${file.name}`;
}

/**
 * Map each DWARF 4 line program to the compile unit's `DW_AT_comp_dir`.
 * Only the root DIE of each unit is read. A unit that cannot be skipped is ignored.
 * @param {Uint8Array} bytes ELF bytes.
 * @param {boolean} little True for a little-endian image.
 * @param {Map<string, Slice>} sections Named sections.
 * @returns {Map<number, string>} `.debug_line` offset to compilation directory.
 */
function compilationDirectories(bytes: Uint8Array, little: boolean, sections: Map<string, Slice>): Map<number, string> {
  const found = new Map<number, string>();
  const info = sections.get(".debug_info");
  const abbrevSection = sections.get(".debug_abbrev");
  if (!info || !abbrevSection || info.size <= 0) {
    return found;
  }
  const strings = sections.get(".debug_str");
  const lineStrings = sections.get(".debug_line_str");
  const cursor = new Cursor(bytes, little, info.offset, info.offset + info.size);
  const tables = new Map<number, Map<number, Abbrev>>();
  while (cursor.offset + 4 <= cursor.limit) {
    const unitStart = cursor.offset;
    const length = cursor.u32();
    if (length === 0xffffffff) {
      const wide = cursor.u64();
      if (!Number.isSafeInteger(wide) || unitStart + 12 + wide > cursor.limit) {
        break;
      }
      cursor.offset = unitStart + 12 + wide;
      continue;
    }
    const unitEnd = unitStart + 4 + length;
    if (length < 7 || unitEnd > cursor.limit) {
      break;
    }
    const savedLimit = cursor.limit;
    cursor.limit = unitEnd;
    try {
      const version = cursor.u16();
      let abbrevOffset = 0;
      let addressSize = 4;
      if (version === 5) {
        cursor.u8();
        addressSize = cursor.u8();
        abbrevOffset = cursor.u32();
      } else if (version >= 2 && version <= 4) {
        abbrevOffset = cursor.u32();
        addressSize = cursor.u8();
      } else {
        throw new Error("unsupported compile-unit version");
      }
      const absolute = abbrevSection.offset + abbrevOffset;
      let table = tables.get(absolute);
      if (!table) {
        table = readAbbreviations(bytes, little, absolute, abbrevSection.offset + abbrevSection.size);
        tables.set(absolute, table);
      }
      const code = cursor.uleb();
      const abbrev = code === 0 ? undefined : table.get(code);
      let compDir: string | undefined;
      let stmtList: number | undefined;
      if (abbrev) {
        for (const attribute of abbrev.attributes) {
          if (attribute.form === DW_FORM_IMPLICIT_CONST) {
            if (attribute.name === DW_AT_STMT_LIST) {
              stmtList = attribute.constant;
            }
            continue;
          }
          const value = cursor.form(attribute.form, addressSize, bytes, strings, lineStrings);
          if (attribute.name === DW_AT_COMP_DIR && typeof value === "string") {
            compDir = value;
          } else if (attribute.name === DW_AT_STMT_LIST && typeof value === "number") {
            stmtList = value;
          }
        }
      }
      if (compDir && stmtList !== undefined) {
        found.set(stmtList, compDir);
      }
    } catch {
      // This unit has no usable compilation directory.
    }
    cursor.limit = savedLimit;
    cursor.offset = unitEnd;
  }
  return found;
}

/**
 * Read one abbreviation table, ending at the zero code.
 * @param {Uint8Array} bytes ELF bytes.
 * @param {boolean} little True for a little-endian image.
 * @param {number} offset File offset of the first abbreviation.
 * @param {number} end Exclusive end of `.debug_abbrev`.
 * @returns {Map<number, Abbrev>} Abbreviation code to attributes.
 */
function readAbbreviations(bytes: Uint8Array, little: boolean, offset: number, end: number): Map<number, Abbrev> {
  const cursor = new Cursor(bytes, little, offset, end);
  const table = new Map<number, Abbrev>();
  let code = cursor.uleb();
  while (code !== 0) {
    cursor.uleb();
    cursor.u8();
    const attributes: AbbrevAttribute[] = [];
    let name = cursor.uleb();
    let form = cursor.uleb();
    while (name !== 0 || form !== 0) {
      const attribute: AbbrevAttribute = { name, form };
      if (form === DW_FORM_IMPLICIT_CONST) {
        attribute.constant = cursor.sleb();
      }
      attributes.push(attribute);
      name = cursor.uleb();
      form = cursor.uleb();
    }
    table.set(code, { attributes });
    code = cursor.uleb();
  }
  return table;
}

/**
 * Drop empty rows and keep the last row when two start at the same address.
 * @param {LineInterval[]} intervals Unordered rows from every unit.
 * @returns {LineInterval[]} Rows ordered by start address.
 */
function orderLines(intervals: LineInterval[]): LineInterval[] {
  const sorted = [...intervals].sort((left, right) => left.start - right.start || left.end - right.end);
  const ordered: LineInterval[] = [];
  for (const interval of sorted) {
    if (interval.end <= interval.start || !interval.path) {
      continue;
    }
    const previous = ordered[ordered.length - 1];
    if (previous && previous.start === interval.start) {
      ordered[ordered.length - 1] = interval;
    } else {
      ordered.push(interval);
    }
  }
  return ordered;
}

/**
 * Section offsets needed to find DWARF tables.
 * @param {Uint8Array} bytes ELF image.
 * @returns {{ little: boolean, addressSize: number, sections: Map<string, Slice> } | null} Layout, or null.
 */
function elfLayout(bytes: Uint8Array): { little: boolean; addressSize: number; sections: Map<string, Slice> } | null {
  if (bytes.length < 52 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) {
    return null;
  }
  const elf64 = bytes[4] === 2;
  if (bytes[4] !== 1 && !elf64) {
    return null;
  }
  const little = bytes[5] !== 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readU16 = (offset: number): number => view.getUint16(offset, little);
  const readU32 = (offset: number): number => view.getUint32(offset, little);
  const readAddr = (offset: number): number => {
    if (!elf64) {
      return readU32(offset);
    }
    const low = little ? view.getUint32(offset, true) : view.getUint32(offset + 4, false);
    const high = little ? view.getUint32(offset + 4, true) : view.getUint32(offset, false);
    return high * 0x100000000 + low;
  };
  const shoff = readAddr(elf64 ? 40 : 32);
  const shentsize = readU16(elf64 ? 58 : 46);
  const shnum = readU16(elf64 ? 60 : 48);
  const shstrndx = readU16(elf64 ? 62 : 50);
  if (shoff <= 0 || shnum === 0 || shstrndx >= shnum || shentsize < (elf64 ? 64 : 40)) {
    return null;
  }
  if (shoff + shnum * shentsize > bytes.length) {
    return null;
  }
  const readSection = (index: number): { name: number; offset: number; size: number } => {
    const base = shoff + index * shentsize;
    if (elf64) {
      return { name: readU32(base), offset: readAddr(base + 24), size: readAddr(base + 32) };
    }
    return { name: readU32(base), offset: readU32(base + 16), size: readU32(base + 20) };
  };
  const names = readSection(shstrndx);
  const sections = new Map<string, Slice>();
  for (let index = 0; index < shnum; index += 1) {
    const section = readSection(index);
    const name = readCString(bytes, names.offset + section.name, names.offset + names.size);
    if (name && !sections.has(name)) {
      sections.set(name, { offset: section.offset, size: section.size });
    }
  }
  return { little, addressSize: elf64 ? 8 : 4, sections };
}

/**
 * Bounds-checked cursor over an ELF image.
 */
class Cursor {
  /**
   * @param {Uint8Array} bytes Image bytes.
   * @param {boolean} little True when multi-byte values are little-endian.
   * @param {number} offset First byte to read.
   * @param {number} limit Exclusive end.
   */
  constructor(
    private readonly bytes: Uint8Array,
    private readonly little: boolean,
    public offset: number,
    public limit: number,
  ) {}

  /**
   * @returns {number} The next byte, without consuming it.
   */
  peek(): number {
    this.need(1);
    return this.bytes[this.offset];
  }

  /**
   * @returns {number} The next unsigned byte.
   */
  u8(): number {
    this.need(1);
    const value = this.bytes[this.offset];
    this.offset += 1;
    return value;
  }

  /**
   * @returns {number} The next signed byte.
   */
  s8(): number {
    const value = this.u8();
    return value < 128 ? value : value - 256;
  }

  /**
   * @returns {number} The next unsigned 16-bit value.
   */
  u16(): number {
    this.need(2);
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const value = view.getUint16(this.offset, this.little);
    this.offset += 2;
    return value;
  }

  /**
   * @returns {number} The next unsigned 32-bit value.
   */
  u32(): number {
    this.need(4);
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const value = view.getUint32(this.offset, this.little);
    this.offset += 4;
    return value;
  }

  /**
   * @returns {number} The next unsigned 64-bit value, when it fits in a safe integer.
   */
  u64(): number {
    const first = this.u32();
    const second = this.u32();
    return this.little ? second * 0x100000000 + first : first * 0x100000000 + second;
  }

  /**
   * @param {number} size Address width in bytes. 4 and 8 are accepted.
   * @returns {number} The address.
   */
  address(size: number): number {
    if (size === 8) {
      return this.u64();
    }
    if (size === 4) {
      return this.u32();
    }
    if (size === 2) {
      return this.u16();
    }
    throw new Error("unsupported address size");
  }

  /**
   * @param {number} count Bytes to move past.
   * @returns {void}
   */
  skip(count: number): void {
    this.need(count);
    this.offset += count;
  }

  /**
   * @returns {number} An unsigned LEB128.
   */
  uleb(): number {
    let value = 0;
    let factor = 1;
    let byte = 0;
    do {
      byte = this.u8();
      value += (byte & 0x7f) * factor;
      factor *= 128;
    } while (byte >= 0x80);
    return value;
  }

  /**
   * @returns {number} A signed LEB128.
   */
  sleb(): number {
    let value = 0;
    let factor = 1;
    let byte = 0;
    do {
      byte = this.u8();
      value += (byte & 0x7f) * factor;
      factor *= 128;
    } while (byte >= 0x80);
    if ((byte & 0x40) !== 0) {
      value -= factor;
    }
    return value;
  }

  /**
   * @returns {string} A NUL-terminated string.
   */
  cstring(): string {
    const start = this.offset;
    while (this.offset < this.limit && this.bytes[this.offset] !== 0) {
      this.offset += 1;
    }
    if (this.offset >= this.limit) {
      throw new Error("string is truncated");
    }
    const value = new TextDecoder("utf-8").decode(this.bytes.subarray(start, this.offset));
    this.offset += 1;
    return value;
  }

  /**
   * Consume one attribute form.
   * @param {number} formCode DWARF form code.
   * @param {number} addressSize Width of a `DW_FORM_addr` value.
   * @param {Uint8Array} bytes ELF bytes.
   * @param {Slice | undefined} strings `.debug_str`.
   * @param {Slice | undefined} lineStrings `.debug_line_str`.
   * @returns {string | number | undefined} A string, a number, or nothing for forms with no scalar.
   */
  form(
    formCode: number,
    addressSize: number,
    bytes: Uint8Array,
    strings: Slice | undefined,
    lineStrings: Slice | undefined,
  ): string | number | undefined {
    switch (formCode) {
      case DW_FORM_ADDR:
        return this.address(addressSize);
      case DW_FORM_DATA1:
      case DW_FORM_FLAG:
      case DW_FORM_REF1:
      case DW_FORM_STRX1:
      case DW_FORM_ADDRX1:
        return this.u8();
      case DW_FORM_DATA2:
      case DW_FORM_REF2:
      case DW_FORM_STRX2:
      case DW_FORM_ADDRX2:
        return this.u16();
      case DW_FORM_STRX3:
      case DW_FORM_ADDRX3: {
        const first = this.u8();
        const second = this.u8();
        const third = this.u8();
        return this.little ? first | (second << 8) | (third << 16) : (first << 16) | (second << 8) | third;
      }
      case DW_FORM_DATA4:
      case DW_FORM_REF4:
      case DW_FORM_SEC_OFFSET:
      case DW_FORM_STRP_SUP:
      case DW_FORM_REF_SUP4:
      case DW_FORM_STRX4:
      case DW_FORM_ADDRX4:
        return this.u32();
      case DW_FORM_DATA8:
      case DW_FORM_REF8:
      case DW_FORM_REF_SIG8:
      case DW_FORM_REF_SUP8:
        return this.u64();
      case DW_FORM_DATA16:
        this.skip(16);
        return undefined;
      case DW_FORM_STRING:
        return this.cstring();
      case DW_FORM_STRP:
        return stringAt(bytes, strings, this.u32());
      case DW_FORM_LINE_STRP:
        return stringAt(bytes, lineStrings, this.u32());
      case DW_FORM_BLOCK1: {
        this.skip(this.u8());
        return undefined;
      }
      case DW_FORM_BLOCK2: {
        this.skip(this.u16());
        return undefined;
      }
      case DW_FORM_BLOCK4: {
        this.skip(this.u32());
        return undefined;
      }
      case DW_FORM_BLOCK:
      case DW_FORM_EXPRLOC: {
        this.skip(this.uleb());
        return undefined;
      }
      case DW_FORM_UDATA:
      case DW_FORM_REF_UDATA:
      case DW_FORM_STRX:
      case DW_FORM_ADDRX:
      case DW_FORM_LOCLISTX:
      case DW_FORM_RNGLISTX:
        return this.uleb();
      case DW_FORM_SDATA:
        return this.sleb();
      case DW_FORM_REF_ADDR:
        return this.u32();
      case DW_FORM_INDIRECT:
        return this.form(this.uleb(), addressSize, bytes, strings, lineStrings);
      case DW_FORM_FLAG_PRESENT:
      case DW_FORM_IMPLICIT_CONST:
        return undefined;
      default:
        throw new Error("unsupported DWARF form");
    }
  }

  /**
   * @param {number} count Bytes required.
   * @returns {void}
   */
  private need(count: number): void {
    if (this.offset < 0 || count < 0 || this.offset + count > this.limit) {
      throw new Error("DWARF data is truncated");
    }
  }
}

/**
 * Read a NUL-terminated string that must end inside `end`.
 * @param {Uint8Array} bytes Image bytes.
 * @param {number} offset First byte.
 * @param {number} end Exclusive end.
 * @returns {string} The string, or empty when the offset is outside the section.
 */
function readCString(bytes: Uint8Array, offset: number, end: number): string {
  if (offset < 0 || offset >= end || offset >= bytes.length) {
    return "";
  }
  let stop = offset;
  const last = Math.min(end, bytes.length);
  while (stop < last && bytes[stop] !== 0) {
    stop += 1;
  }
  return new TextDecoder("utf-8").decode(bytes.subarray(offset, stop));
}

/**
 * Resolve an offset into a DWARF string section.
 * @param {Uint8Array} bytes Image bytes.
 * @param {Slice | undefined} section String section.
 * @param {number} relative Offset from the start of the section.
 * @returns {string} The string, or empty when the offset is outside the section.
 */
function stringAt(bytes: Uint8Array, section: Slice | undefined, relative: number): string {
  if (!section) {
    return "";
  }
  return readCString(bytes, section.offset + relative, section.offset + section.size);
}
