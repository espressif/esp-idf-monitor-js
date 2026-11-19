import { ElfData, readAt } from "../elf/image.js";

const encoder = new TextEncoder();
const EMPTY = new Uint8Array(0);
const SPACE = Uint8Array.of(0x20);
const LEVELS = ["", "E", "W", "I", "D", "V"];
const BYTES_PER_LINE = 16;
const MIN_FRAME = 15;
const C_FORMAT =
  /%%|%(?<flags>[-+0# ]*)?(?<width>\*|\d+)?(?:\.(?<precision>\*|\d+))?(?<length>hh|ll|h|l|z|j|t|L)?(?<specifier>[diuoxXfFeEgGaAcsp])/g;

type LogValue = number | bigint | string | Uint8Array;
type BufferKind = "hex" | "char" | "hexdump";

interface ControlWord {
  pkgLen: number;
  level: number;
  time64: boolean;
  version: number;
}

interface Parsed {
  level: number;
  timestamp: number | bigint;
  tag: string;
  format: string;
  args: LogValue[];
  buffer: BufferKind | null;
}

interface Piece {
  bytes: Uint8Array;
  frame: boolean;
}

interface Scan {
  pieces: Piece[];
  remaining: Uint8Array;
}

/**
 * Turn ESP-IDF binary log frames into the text lines the rest of the monitor already prints.
 * A partial frame is kept until the next chunk. Bytes that are not a frame are returned unchanged.
 */
export class BinaryLogDecoder {
  private pending = EMPTY;

  /**
   * @param {ElfData[]} elves Application ELF first. A `bootloader.elf` name supplies bootloader frames.
   */
  constructor(private readonly elves: readonly ElfData[]) {}

  /**
   * Drop a frame that was split by a disconnect.
   * @returns {void}
   */
  reset(): void {
    this.pending = EMPTY;
  }

  /**
   * Decode one serial chunk.
   * @param {Uint8Array} chunk Raw bytes from the port.
   * @returns {Uint8Array} Plain text and formatted log lines. Empty when the chunk is only a partial frame.
   */
  push(chunk: Uint8Array): Uint8Array {
    const data = this.pending.length === 0 ? chunk : joinBytes([this.pending, chunk]);
    const scanned = findFrames(data);
    this.pending = scanned.remaining.length === 0 ? EMPTY : scanned.remaining.slice();
    const parts: Uint8Array[] = [];
    for (const piece of scanned.pieces) {
      if (!piece.frame) {
        parts.push(piece.bytes);
        continue;
      }
      try {
        parts.push(...decodeFrame(piece.bytes, this.elves));
      } catch {
        // The CRC matched, but the payload was shorter than its format string.
      }
    }
    return joinBytes(parts);
  }
}

/**
 * CRC-8, polynomial 0x07, initial value 0. A valid frame, including its CRC byte, sums to 0.
 * @param {Uint8Array} data Frame bytes.
 * @returns {number} CRC in the range 0–255.
 */
export function crc8(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

/**
 * Scan a buffer the way esp-idf-monitor does: hold a plausible partial frame, and skip one byte after a bad CRC.
 * @param {Uint8Array} data Bytes accumulated so far.
 * @returns {Scan} Complete frames, the unfinished tail, and the text in between.
 */
function findFrames(data: Uint8Array): Scan {
  const pieces: Piece[] = [];
  let index = 0;
  let after = 0;
  let partial: number | null = null;
  const leak = (end: number): void => {
    if (end > after) {
      pieces.push({ bytes: data.subarray(after, end), frame: false });
    }
  };

  while (index < data.length) {
    if (data.length - index < MIN_FRAME) {
      break;
    }
    if (data[index] === 0x01 || data[index] === 0x02) {
      const start = index;
      try {
        const control = readControl(data, start + 1);
        if (control.pkgLen > data.length - index) {
          if (plausible(control)) {
            partial = start;
            break;
          }
          index += 1;
          continue;
        }
        const frame = data.subarray(start, start + control.pkgLen);
        if (control.pkgLen !== 0 && crc8(frame) === 0) {
          leak(start);
          pieces.push({ bytes: frame, frame: true });
          after = start + control.pkgLen;
          index += control.pkgLen - 1;
        } else {
          index += 1;
          continue;
        }
      } catch {
        index += 1;
        continue;
      }
    }
    index += 1;
  }

  let remaining = EMPTY;
  if (partial !== null) {
    leak(partial);
    remaining = data.subarray(partial);
  } else if (index < data.length && (data[index] === 0x01 || data[index] === 0x02)) {
    leak(index);
    remaining = data.subarray(index);
  } else {
    leak(data.length);
  }
  return { pieces, remaining };
}

/**
 * @param {Uint8Array} data Buffer.
 * @param {number} offset Index of the control word.
 * @returns {ControlWord} Length, level, timestamp width, and version.
 */
function readControl(data: Uint8Array, offset: number): ControlWord {
  need(data, offset, 2);
  const word = view(data).getUint16(offset, false);
  return {
    pkgLen: word & 0x3ff,
    level: (word >> 10) & 0x7,
    time64: ((word >> 13) & 0x1) === 1,
    version: (word >> 14) & 0x3,
  };
}

/**
 * A short tail is a real frame only when the header could belong to log version 0.
 * @param {ControlWord} control Parsed header.
 * @returns {boolean} True when the scanner should wait for more bytes.
 */
function plausible(control: ControlWord): boolean {
  return control.level >= 1 && control.level <= 5 && control.version === 0 && control.pkgLen >= MIN_FRAME;
}

/**
 * @param {Uint8Array} frame One CRC-checked frame.
 * @param {ElfData[]} elves Images supplied to the decoder.
 * @returns {Uint8Array[]} Encoded log lines.
 */
function decodeFrame(frame: Uint8Array, elves: readonly ElfData[]): Uint8Array[] {
  const message = parseMessage(frame, elfFor(elves, frame[0]));
  return message.buffer ? formatBuffer(message) : [formatMessage(message)];
}

/**
 * `0x01` is the bootloader image. `0x02` is the first application image.
 * @param {ElfData[]} elves Indexed ELFs.
 * @param {number} kind Frame type byte.
 * @returns {ElfData | null} The image that holds this frame's format string.
 */
function elfFor(elves: readonly ElfData[], kind: number): ElfData | null {
  if (kind === 0x01) {
    return elves.find((elf) => elf.name.endsWith("bootloader.elf")) ?? null;
  }
  if (kind === 0x02) {
    return elves[0] ?? null;
  }
  return null;
}

/**
 * @param {Uint8Array} frame CRC-checked frame.
 * @param {ElfData | null} elf Image used to resolve addresses.
 * @returns {Parsed} Level, timestamp, tag, format, and arguments.
 */
function parseMessage(frame: Uint8Array, elf: ElfData | null): Parsed {
  const control = readControl(frame, 1);
  let cursor = 3;
  const formatField = readField(elf, frame, cursor);
  cursor += formatField.consumed;
  const format = bytesToText(formatField.bytes);
  const buffer = bufferKind(format);
  const tagField = readField(elf, frame, cursor);
  cursor += tagField.consumed;
  const tag = bytesToText(tagField.bytes);
  const timeBytes = control.time64 ? 8 : 4;
  need(frame, cursor, timeBytes);
  const timestamp = control.time64 ? view(frame).getBigUint64(cursor, false) : view(frame).getUint32(cursor, false);
  cursor += timeBytes;
  return {
    level: control.level,
    timestamp,
    tag,
    format,
    args: readArguments(format, frame.subarray(cursor), elf, buffer),
    buffer,
  };
}

/**
 * @param {string} format Format string from the frame.
 * @returns {BufferKind | null} Which buffer printer to use, or null for an ordinary message.
 */
function bufferKind(format: string): BufferKind | null {
  if (format.startsWith("__ESP_BUFFER_HEXDUMP_FORMAT__")) {
    return "hexdump";
  }
  if (format.startsWith("__ESP_BUFFER_HEX_FORMAT__")) {
    return "hex";
  }
  if (format.startsWith("__ESP_BUFFER_CHAR_FORMAT__")) {
    return "char";
  }
  return null;
}

/**
 * @param {string} format C format string.
 * @param {Uint8Array} raw Argument bytes, including the trailing CRC.
 * @param {ElfData | null} elf Image used for address-backed strings.
 * @param {BufferKind | null} buffer Set when the format is a buffer sentinel.
 * @returns {LogValue[]} Values in format-string order. A short payload stops early.
 */
function readArguments(format: string, raw: Uint8Array, elf: ElfData | null, buffer: BufferKind | null): LogValue[] {
  const args: LogValue[] = [];
  let cursor = 0;
  for (const match of format.matchAll(C_FORMAT)) {
    if (match[0] === "%%") {
      continue;
    }
    const specifier = match.groups?.specifier ?? "";
    try {
      if (specifier === "s") {
        const previous = args[args.length - 1];
        const explicit = buffer && typeof previous === "number" && previous >= 0 ? previous : undefined;
        const field = readField(elf, raw, cursor, explicit);
        cursor += field.consumed;
        args.push(buffer ? field.bytes : bytesToText(field.bytes));
      } else if ("fFeEgGaA".includes(specifier)) {
        need(raw, cursor, 8);
        args.push(view(raw).getFloat64(cursor, false));
        cursor += 8;
      } else if ("diouxX".includes(specifier)) {
        const read = readInteger(raw, cursor, match.groups?.length ?? "", "di".includes(specifier));
        cursor += read.size;
        args.push(read.value);
      } else if (specifier === "p") {
        need(raw, cursor, 4);
        args.push(view(raw).getUint32(cursor, false));
        cursor += 4;
      } else if (specifier === "c") {
        need(raw, cursor, 4);
        args.push(String.fromCharCode(raw[cursor + 3]));
        cursor += 4;
      } else {
        need(raw, cursor, 4);
        args.push(view(raw).getInt32(cursor, false));
        cursor += 4;
      }
    } catch {
      break;
    }
  }
  return args;
}

/**
 * Read a format, tag, or `%s` argument. Embedded strings win over ELF addresses.
 * @param {ElfData | null} elf Image used when the field is an address.
 * @param {Uint8Array} raw Payload.
 * @param {number} offset Start of the field.
 * @param {number} [length] Byte count for a buffer stored in the ELF. Embedded data carries its own length.
 * @returns {{ bytes: Uint8Array, consumed: number }} Field bytes and how far the cursor moves.
 */
function readField(
  elf: ElfData | null,
  raw: Uint8Array,
  offset: number,
  length?: number,
): { bytes: Uint8Array; consumed: number } {
  if (isEmbedded(raw, offset)) {
    return readEmbedded(raw, offset);
  }
  need(raw, offset, 4);
  const addr = view(raw).getUint32(offset, false);
  const found = elf ? readAt(elf, addr, length) : null;
  return { bytes: found ?? SPACE, consumed: 4 };
}

/**
 * The top six bits of an embedded string are 0xFC. The check looks at a big-endian uint32, so four bytes are required.
 * @param {Uint8Array} raw Payload.
 * @param {number} offset Start of the field.
 * @returns {boolean} True when the field is an embedded string.
 */
function isEmbedded(raw: Uint8Array, offset: number): boolean {
  if (offset + 4 > raw.length) {
    return false;
  }
  // `>>>` keeps the top bits unsigned. A signed `&` would not compare equal to 0xFC000000.
  return view(raw).getUint32(offset, false) >>> 26 === 0x3f;
}

/**
 * Embedded layout: int16 length `1 - len`, then the bytes.
 * @param {Uint8Array} raw Payload.
 * @param {number} offset Start of the field.
 * @returns {{ bytes: Uint8Array, consumed: number }} The string bytes and the size including the length prefix.
 */
function readEmbedded(raw: Uint8Array, offset: number): { bytes: Uint8Array; consumed: number } {
  need(raw, offset, 2);
  const length = 1 - view(raw).getInt16(offset, false);
  if (length < 0) {
    throw new RangeError("invalid embedded string");
  }
  need(raw, offset + 2, length);
  return { bytes: raw.subarray(offset + 2, offset + 2 + length), consumed: 2 + length };
}

/**
 * @param {Uint8Array} raw Payload.
 * @param {number} offset Start.
 * @param {string} length C length modifier.
 * @param {boolean} signed True for `%d` and `%i`.
 * @returns {{ value: number | bigint, size: number }} The integer and the bytes consumed, including 32-bit padding.
 */
function readInteger(
  raw: Uint8Array,
  offset: number,
  length: string,
  signed: boolean,
): { value: number | bigint; size: number } {
  const data = view(raw);
  if (length === "ll") {
    need(raw, offset, 8);
    return {
      value: signed ? data.getBigInt64(offset, false) : data.getBigUint64(offset, false),
      size: 8,
    };
  }
  let pad = 0;
  let width = 4;
  if (length === "h") {
    pad = 2;
    width = 2;
  } else if (length === "hh") {
    pad = 3;
    width = 1;
  }
  need(raw, offset, pad + width);
  const at = offset + pad;
  let value: number;
  if (width === 1) {
    value = signed ? data.getInt8(at) : data.getUint8(at);
  } else if (width === 2) {
    value = signed ? data.getInt16(at, false) : data.getUint16(at, false);
  } else {
    value = signed ? data.getInt32(at, false) : data.getUint32(at, false);
  }
  return { value, size: pad + width };
}

/**
 * @param {Parsed} message Decoded frame.
 * @returns {Uint8Array} One `I (123) tag: text` line, including the newline.
 */
function formatMessage(message: Parsed): Uint8Array {
  const level = LEVELS[message.level];
  if (!level) {
    throw new RangeError("invalid binary log level");
  }
  let text = message.format;
  try {
    text = cFormat(message.format, message.args);
  } catch {
    text = message.format;
  }
  return encoder.encode(`${level} (${message.timestamp}) ${message.tag}: ${text}\n`);
}

/**
 * Print a hex, character, or hexdump buffer as 16-byte lines.
 * @param {Parsed} message Buffer frame. Arguments are length, bytes, and address.
 * @returns {Uint8Array[]} One encoded line per row. Empty when the length is 0.
 */
function formatBuffer(message: Parsed): Uint8Array[] {
  const length = message.args[0];
  const buffer = message.args[1];
  const address = message.args[2];
  if (
    typeof length !== "number" ||
    !(buffer instanceof Uint8Array) ||
    (typeof address !== "number" && typeof address !== "bigint")
  ) {
    return [formatMessage(message)];
  }
  const lines: Uint8Array[] = [];
  let offset = 0;
  let addr = typeof address === "bigint" ? address : BigInt(address >>> 0);
  let remaining = length;
  while (remaining > 0) {
    const take = Math.min(BYTES_PER_LINE, remaining);
    const slice = buffer.subarray(offset, Math.min(buffer.length, offset + take));
    lines.push(formatMessage({ ...message, format: bufferLine(message.buffer, slice, addr), args: [], buffer: null }));
    offset += take;
    remaining -= take;
    addr += BigInt(take);
  }
  return lines;
}

/**
 * @param {BufferKind | null} kind Buffer printer.
 * @param {Uint8Array} slice Up to 16 bytes.
 * @param {bigint} addr Address of this row. Used by the hexdump printer.
 * @returns {string} The row text, without the log prefix.
 */
function bufferLine(kind: BufferKind | null, slice: Uint8Array, addr: bigint): string {
  if (kind === "char") {
    return [...slice].map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : "")).join("");
  }
  const hex = [...slice].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
  if (kind === "hexdump") {
    const split = `${hex.slice(0, 24)} ${hex.slice(24)}`;
    const padded = split.length >= 48 ? split : split + " ".repeat(48 - split.length);
    const chars = [...slice].map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".")).join("");
    return `0x${addr.toString(16).padStart(8, "0")} ${padded} |${chars}|`;
  }
  return hex;
}

/**
 * Format a C printf string. `%%` is a literal percent. A missing argument throws.
 * @param {string} fmt Format string.
 * @param {LogValue[]} args Arguments already unpacked from the frame.
 * @returns {string} The formatted text.
 */
function cFormat(fmt: string, args: LogValue[]): string {
  let out = "";
  let cursor = 0;
  let argIndex = 0;
  for (const match of fmt.matchAll(C_FORMAT)) {
    const at = match.index ?? 0;
    out += fmt.slice(cursor, at);
    if (match[0] === "%%") {
      out += "%";
    } else {
      const value = args[argIndex];
      argIndex += 1;
      if (value === undefined || value instanceof Uint8Array) {
        throw new RangeError("missing format argument");
      }
      out += formatArgument(match, value);
    }
    cursor = at + match[0].length;
  }
  return out + fmt.slice(cursor);
}

/**
 * @param {RegExpMatchArray} match One conversion specification.
 * @param {number | bigint | string} value Argument for that specification.
 * @returns {string} The formatted argument.
 */
function formatArgument(match: RegExpMatchArray, value: number | bigint | string): string {
  const flags = match.groups?.flags ?? "";
  const widthText = match.groups?.width ?? "";
  const precisionText = match.groups?.precision ?? "";
  const specifier = match.groups?.specifier ?? "d";
  const alignLeft = flags.includes("-");
  let width = widthText && widthText !== "*" ? Number(widthText) : 0;
  const precision = precisionText && precisionText !== "*" ? Number(precisionText) : null;

  if ("fFeEgGaA".includes(specifier)) {
    const numeric = typeof value === "number" ? value : Number(value);
    let text = formatFloat(numeric, specifier, precision);
    if (numeric > 0 || (numeric === 0 && !Object.is(numeric, -0))) {
      if (flags.includes("+")) {
        text = `+${text}`;
      } else if (flags.includes(" ")) {
        text = ` ${text}`;
      }
    }
    return padField(text, width, alignLeft, flags.includes("0"));
  }

  if (specifier === "s" || specifier === "c") {
    const text = precision === null ? String(value) : String(value).slice(0, precision);
    return padField(text, width, alignLeft, false);
  }

  let zero = flags.includes("0");
  if (precision !== null && "diouxX".includes(specifier)) {
    width = precision;
    zero = true;
  }
  const type = specifier === "p" || "diu".includes(specifier) ? (specifier === "p" ? "x" : "d") : specifier;
  return formatInteger(toBigInt(value), type, {
    width,
    zero,
    alignLeft,
    signPlus: flags.includes("+"),
    signSpace: flags.includes(" "),
    alt: flags.includes("#") || specifier === "p",
  });
}

/**
 * @param {number | bigint | string} value Argument.
 * @returns {bigint} Integer value. A fractional number is truncated toward zero.
 */
function toBigInt(value: number | bigint | string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }
  return BigInt(value);
}

/**
 * @param {number} value Floating argument.
 * @param {string} specifier `f`, `e`, `g`, `a`, or the uppercase form.
 * @param {number | null} precision Precision, or null for the C default of 6.
 * @returns {string} The number as text.
 */
function formatFloat(value: number, specifier: string, precision: number | null): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  const prec = precision ?? 6;
  const lower = specifier.toLowerCase();
  const upper = specifier !== lower;
  if (lower === "f") {
    const text = value.toFixed(prec);
    return upper ? text.toUpperCase() : text;
  }
  if (lower === "e") {
    return withExponent(value.toExponential(prec), upper);
  }
  if (lower === "g") {
    return formatGeneral(value, prec, upper);
  }
  return formatHexFloat(value, upper);
}

/**
 * `%g`: significant digits, fixed or scientific, with trailing zeros removed.
 * @param {number} value Floating argument.
 * @param {number} precision Significant digits.
 * @param {boolean} upper True for `%G`.
 * @returns {string} The shorter form.
 */
function formatGeneral(value: number, precision: number, upper: boolean): string {
  if (value === 0) {
    return "0";
  }
  const prec = Math.max(precision, 1);
  const exp = Math.floor(Math.log10(Math.abs(value)));
  if (exp < -4 || exp >= prec) {
    return withExponent(value.toExponential(prec - 1), upper);
  }
  let text = value.toFixed(Math.max(prec - exp - 1, 0));
  if (text.includes(".")) {
    text = text.replace(/0+$/, "").replace(/\.$/, "");
  }
  return upper ? text.toUpperCase() : text;
}

/**
 * Pad a scientific exponent to two digits, matching C printf.
 * @param {string} text JavaScript exponential form.
 * @param {boolean} upper True for `E`.
 * @returns {string} Text with a two-digit exponent.
 */
function withExponent(text: string, upper: boolean): string {
  const rendered = upper ? text.toUpperCase() : text;
  return rendered.replace(/e([+-])(\d+)$/i, (_all, sign: string, digits: string) => {
    return `${upper ? "E" : "e"}${sign}${digits.padStart(2, "0")}`;
  });
}

/**
 * `%a` form `0x1.8p+0`.
 * @param {number} value Floating argument.
 * @param {boolean} upper True for `%A`.
 * @returns {string} Hexadecimal floating text.
 */
function formatHexFloat(value: number, upper: boolean): string {
  const sign = value < 0 || Object.is(value, -0) ? "-" : "";
  const prefix = upper ? "0X" : "0x";
  const marker = upper ? "P" : "p";
  if (value === 0) {
    return `${sign}${prefix}0${marker}+0`;
  }
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, Math.abs(value), false);
  const hi = bits.getUint32(0, false);
  const lo = bits.getUint32(4, false);
  const biased = (hi >> 20) & 0x7ff;
  if (biased === 0x7ff) {
    return String(value);
  }
  const exp = biased === 0 ? -1022 : biased - 1023;
  const fraction = ((hi & 0xfffff) * 0x100000000 + lo).toString(16).padStart(13, "0").replace(/0+$/, "");
  const lead = biased === 0 ? "0" : "1";
  const body = fraction.length > 0 ? `${lead}.${fraction}` : lead;
  return `${sign}${prefix}${body}${marker}${exp >= 0 ? "+" : ""}${exp}`;
}

interface IntegerFormat {
  width: number;
  zero: boolean;
  alignLeft: boolean;
  signPlus: boolean;
  signSpace: boolean;
  alt: boolean;
}

/**
 * @param {bigint} value Integer argument.
 * @param {string} type `d`, `o`, `x`, or `X`.
 * @param {IntegerFormat} options Width, padding, sign, and the C alternate form.
 * @returns {string} The formatted integer.
 */
function formatInteger(value: bigint, type: string, options: IntegerFormat): string {
  const negative = value < BigInt(0);
  const magnitude = negative ? -value : value;
  const base = type === "o" ? 8 : type === "x" || type === "X" ? 16 : 10;
  let digits = magnitude.toString(base);
  if (type === "X") {
    digits = digits.toUpperCase();
  }
  if (type === "o" && options.alt) {
    digits = `0${digits}`;
  }
  let prefix = "";
  if (options.alt && type === "x") {
    prefix = "0x";
  } else if (options.alt && type === "X") {
    prefix = "0X";
  }
  let sign = "";
  if (negative) {
    sign = "-";
  } else if (options.signPlus) {
    sign = "+";
  } else if (options.signSpace) {
    sign = " ";
  }
  if (options.zero && !options.alignLeft && options.width > sign.length + prefix.length + digits.length) {
    digits = "0".repeat(options.width - sign.length - prefix.length - digits.length) + digits;
  }
  const width = options.zero && !options.alignLeft ? 0 : options.width;
  return padField(sign + prefix + digits, width, options.alignLeft, false);
}

/**
 * @param {string} text Text to pad.
 * @param {number} width Minimum width. Zero means none.
 * @param {boolean} alignLeft Pad on the right.
 * @param {boolean} zero Pad with zeros after a leading sign.
 * @returns {string} Padded text.
 */
function padField(text: string, width: number, alignLeft: boolean, zero: boolean): string {
  if (width <= text.length) {
    return text;
  }
  const extra = width - text.length;
  if (alignLeft) {
    return text + " ".repeat(extra);
  }
  if (zero) {
    const sign = text[0] === "-" || text[0] === "+" || text[0] === " " ? text[0] : "";
    return sign + "0".repeat(extra) + (sign ? text.slice(1) : text);
  }
  return " ".repeat(extra) + text;
}

/**
 * @param {Uint8Array} data Payload.
 * @returns {string} UTF-8 text with trailing NULs removed.
 */
function bytesToText(data: Uint8Array): string {
  return new TextDecoder("utf-8").decode(data).replace(/\0+$/, "");
}

/**
 * @param {Uint8Array} data Payload.
 * @param {number} offset Start index.
 * @param {number} size Bytes required.
 * @returns {void}
 */
function need(data: Uint8Array, offset: number, size: number): void {
  if (offset < 0 || size < 0 || offset + size > data.length) {
    throw new RangeError("truncated binary log");
  }
}

/**
 * @param {Uint8Array} data Payload.
 * @returns {DataView} A view of those bytes.
 */
function view(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * @param {Uint8Array[]} parts Chunks, in order. Empty chunks are skipped.
 * @returns {Uint8Array} One buffer, or the only chunk when there is nothing to join.
 */
function joinBytes(parts: Uint8Array[]): Uint8Array {
  const present = parts.filter((part) => part.length > 0);
  if (present.length === 0) {
    return EMPTY;
  }
  if (present.length === 1) {
    return present[0];
  }
  let length = 0;
  for (const part of present) {
    length += part.length;
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of present) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
