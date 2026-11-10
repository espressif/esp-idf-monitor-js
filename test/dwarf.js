/**
 * Small DWARF line tables for the address-decoder tests.
 */

const STANDARD_LENGTHS = [0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 1];

/**
 * Flatten nested byte lists.
 * @param {Array<number | number[]>} parts Bytes and nested byte lists.
 * @returns {Uint8Array} One buffer.
 */
function bytesOf(parts) {
  return new Uint8Array(parts.flat());
}

/**
 * @param {number} value A 32-bit value.
 * @returns {number[]} Little-endian bytes.
 */
function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/**
 * @param {string} text ASCII text.
 * @returns {number[]} NUL-terminated bytes.
 */
function cstr(text) {
  return [...text].map((char) => char.charCodeAt(0)).concat(0);
}

/**
 * @param {number} value A non-negative integer.
 * @returns {number[]} Unsigned LEB128 bytes.
 */
function uleb(value) {
  const encoded = [];
  let rest = value;
  do {
    let byte = rest & 0x7f;
    rest = Math.floor(rest / 128);
    if (rest) {
      byte |= 0x80;
    }
    encoded.push(byte);
  } while (rest);
  return encoded;
}

/**
 * One row from `address` through `end`, on `line`.
 * @param {number} address First address of the row.
 * @param {number} line 1-based line number.
 * @param {number} end Address of the end-sequence marker.
 * @returns {number[]} Line-program opcodes.
 */
function lineProgram(address, line, end) {
  return [0, 5, 2, ...u32(address), 3, ...uleb(line - 1), 1, 0, 5, 2, ...u32(end), 0, 1, 1];
}

/**
 * A DWARF 4 line unit. Directory index 0 is left for `DW_AT_comp_dir`.
 * @param {object} options Table and the one source row.
 * @param {string[]} options.directories Explicit directories, numbered from 1.
 * @param {string} options.file File name.
 * @param {number} options.dirIndex Directory index for `file`.
 * @param {number} options.address First address of the row.
 * @param {number} options.line 1-based line.
 * @param {number} options.end Exclusive end address.
 * @returns {Uint8Array} `.debug_line` bytes.
 */
export function dwarf4Line(options) {
  const prologue = [1, 1, 1, 0xfb, 14, 13, ...STANDARD_LENGTHS];
  for (const directory of options.directories) {
    prologue.push(...cstr(directory));
  }
  prologue.push(0, ...cstr(options.file), ...uleb(options.dirIndex), 0, 0, 0);
  const program = lineProgram(options.address, options.line, options.end);
  const body = [4, 0, ...u32(prologue.length), ...prologue, ...program];
  return bytesOf([u32(body.length), body]);
}

/**
 * DWARF 4 compile-unit DIE whose statement list is the first line unit.
 * @param {string} directory `DW_AT_comp_dir`. The string sits at offset 1 of `.debug_str`.
 * @returns {{ info: Uint8Array, abbrev: Uint8Array, strings: Uint8Array }} The three sections.
 */
export function dwarf4CompDir(directory) {
  const abbrev = bytesOf([uleb(1), uleb(0x11), 0, uleb(0x1b), uleb(0x0e), uleb(0x10), uleb(0x17), 0, 0, 0]);
  const die = [uleb(1), u32(1), u32(0)];
  const infoBody = [4, 0, ...u32(0), 4, ...die.flat()];
  return {
    info: bytesOf([u32(infoBody.length), infoBody]),
    abbrev,
    strings: bytesOf([0, cstr(directory)]),
  };
}

/**
 * A DWARF 5 line unit whose directory and file live in `.debug_line_str`.
 * @param {object} options Names and the one source row.
 * @param {string} options.directory Directory entry 0.
 * @param {string} options.file File entry 0.
 * @param {number} options.address First address of the row.
 * @param {number} options.line 1-based line.
 * @param {number} options.end Exclusive end address.
 * @returns {{ line: Uint8Array, lineStr: Uint8Array }} `.debug_line` and `.debug_line_str`.
 */
export function dwarf5Line(options) {
  const lineStr = bytesOf([0, cstr(options.directory), cstr(options.file)]);
  const fileOffset = 1 + options.directory.length + 1;
  const prologue = [
    1,
    1,
    1,
    0xfb,
    14,
    13,
    ...STANDARD_LENGTHS,
    1,
    ...uleb(1),
    ...uleb(0x1f),
    ...uleb(1),
    ...u32(1),
    2,
    ...uleb(1),
    ...uleb(0x1f),
    ...uleb(2),
    ...uleb(0x0f),
    ...uleb(1),
    ...u32(fileOffset),
    ...uleb(0),
  ];
  const program = lineProgram(options.address, options.line, options.end);
  const body = [5, 0, 4, 0, ...u32(prologue.length), ...prologue, ...program];
  return { line: bytesOf([u32(body.length), body]), lineStr };
}
