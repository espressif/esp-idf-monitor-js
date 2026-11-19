import assert from "node:assert/strict";
import { test } from "node:test";
import { IDFMonitor } from "../lib/index.js";
import { indexElf, readAt } from "../lib/elf/image.js";
import { BinaryLogDecoder, crc8 } from "../lib/output/binlog.js";
import { buildElf, bytes, createFakePort, createTerminal, waitFor } from "./support.js";

const RODATA = 0x3c000000;

/**
 * @param {Uint8Array[]} parts Chunks to join.
 * @returns {Uint8Array} One buffer.
 */
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * @param {number} value Unsigned 32-bit value.
 * @returns {Uint8Array} Big-endian bytes.
 */
function u32(value) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

/**
 * @param {number | bigint} value Unsigned 64-bit value.
 * @returns {Uint8Array} Big-endian bytes.
 */
function u64(value) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), false);
  return out;
}

/**
 * @param {number} value IEEE double.
 * @returns {Uint8Array} Big-endian bytes.
 */
function f64(value) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value, false);
  return out;
}

/**
 * @param {string} value C string without the terminator.
 * @returns {Uint8Array} Bytes plus a NUL.
 */
function cString(value) {
  return concat(bytes(value), Uint8Array.of(0));
}

/**
 * @param {string | Uint8Array} value String or raw bytes. Length must be at least 2.
 * @returns {Uint8Array} Embedded-string field.
 */
function embedded(value) {
  const payload = typeof value === "string" ? bytes(value) : value;
  const out = new Uint8Array(2 + payload.length);
  new DataView(out.buffer).setInt16(0, 1 - payload.length, false);
  out.set(payload, 2);
  return out;
}

/**
 * @param {number} type 0x01 bootloader or 0x02 application.
 * @param {number} level Log level 1–5.
 * @param {Uint8Array} payload Format, tag, timestamp, and arguments.
 * @param {boolean} time64 True when the control word marks a 64-bit timestamp.
 * @returns {Uint8Array} A frame whose CRC-8 is 0.
 */
function finishFrame(type, level, payload, time64) {
  const pkgLen = 1 + 2 + payload.length + 1;
  const control = pkgLen | (level << 10) | ((time64 ? 1 : 0) << 13);
  const frame = new Uint8Array(pkgLen);
  frame[0] = type;
  frame[1] = (control >> 8) & 0xff;
  frame[2] = control & 0xff;
  frame.set(payload, 3);
  for (let crc = 0; crc < 256; crc += 1) {
    frame[pkgLen - 1] = crc;
    if (crc8(frame) === 0) {
      return frame;
    }
  }
  throw new Error("no crc");
}

/**
 * @param {object} options Frame fields.
 * @returns {Uint8Array} One binary log frame.
 */
function frame(options) {
  const time = options.time64 ? u64(options.timestamp ?? 10) : u32(options.timestamp ?? 10);
  return finishFrame(
    options.type ?? 0x02,
    options.level ?? 3,
    concat(options.format, options.tag, time, options.args ?? new Uint8Array()),
    options.time64 === true,
  );
}

/**
 * @param {Uint8Array} data Decoder output.
 * @returns {string} UTF-8 text.
 */
function text(data) {
  return new TextDecoder().decode(data);
}

/**
 * @returns {object} An application image whose `.rodata` holds `value %d` and `wifi`.
 */
function appElf() {
  const format = "value %d";
  const tag = "wifi";
  const data = concat(cString(format), cString(tag));
  return {
    formatAddr: RODATA,
    tagAddr: RODATA + format.length + 1,
    elf: indexElf("app.elf", buildElf({ sections: [{ name: ".rodata", data, addr: RODATA }] })),
  };
}

test("crc8 matches the CRC-8 check value", () => {
  assert.equal(crc8(bytes("123456789")), 0xf4);
});

test("reads a high address from .rodata and a low address only from .noload", () => {
  const image = appElf();
  const found = readAt(image.elf, image.formatAddr);
  assert.ok(found);
  assert.equal(text(found), "value %d");
  assert.equal(found.buffer, image.elf.bytes.buffer);
  assert.equal(readAt(image.elf, 0x40), null);

  const format = "boot %s";
  const noload = indexElf(
    "app.elf",
    buildElf({
      sections: [{ name: ".noload", data: concat(cString(format), cString("noload")), addr: 0x40 }],
    }),
  );
  assert.equal(text(readAt(noload, 0x40)), format);
  assert.equal(readAt(noload, 0), null);
});

test("decodes a format string stored at an ELF address", () => {
  const image = appElf();
  const decoder = new BinaryLogDecoder([image.elf]);
  const packet = frame({ format: u32(image.formatAddr), tag: u32(image.tagAddr), args: u32(7) });
  assert.equal(text(decoder.push(packet)), "I (10) wifi: value 7\n");
});

test("decodes a format string in .noload", () => {
  const format = "boot %s";
  const elf = indexElf(
    "app.elf",
    buildElf({
      sections: [{ name: ".noload", data: concat(cString(format), cString("noload")), addr: 0x40 }],
    }),
  );
  const decoder = new BinaryLogDecoder([elf]);
  const packet = frame({ format: u32(0x40), tag: u32(0x40 + format.length + 1), args: embedded("now") });
  assert.equal(text(decoder.push(packet)), "I (10) noload: boot now\n");
});

test("decodes an embedded string and a 64-bit integer", () => {
  const decoder = new BinaryLogDecoder([indexElf("app.elf", buildElf())]);
  const big = 9007199254740993n;
  const packet = frame({
    format: embedded("id %s %lld"),
    tag: embedded("app"),
    args: concat(embedded("abc"), u64(big)),
  });
  assert.equal(text(decoder.push(packet)), `I (10) app: id abc ${big}\n`);
});

test("decodes a big-endian double", () => {
  const decoder = new BinaryLogDecoder([indexElf("app.elf", buildElf())]);
  const packet = frame({ format: embedded("pi %f"), tag: embedded("pi"), timestamp: 1, args: f64(1.5) });
  assert.equal(text(decoder.push(packet)), "I (1) pi: pi 1.500000\n");
});

test("holds a frame that arrives in two chunks", () => {
  const image = appElf();
  const decoder = new BinaryLogDecoder([image.elf]);
  const packet = frame({ format: u32(image.formatAddr), tag: u32(image.tagAddr), args: u32(7) });
  assert.equal(decoder.push(packet.subarray(0, 10)).length, 0);
  assert.equal(text(decoder.push(packet.subarray(10))), "I (10) wifi: value 7\n");
});

test("resyncs after a bad CRC and keeps surrounding text", () => {
  const image = appElf();
  const decoder = new BinaryLogDecoder([image.elf]);
  const packet = frame({ format: u32(image.formatAddr), tag: u32(image.tagAddr), args: u32(7) });
  const blob = concat(bytes("ROM\n"), Uint8Array.of(0x02, 0xff, 0xff), packet, bytes("done\n"));
  const decoded = text(decoder.push(blob));
  assert.match(decoded, /^ROM\n/);
  assert.match(decoded, /I \(10\) wifi: value 7\n/);
  assert.match(decoded, /done\n$/);
});

test("prints a 64-bit timestamp", () => {
  const image = appElf();
  const decoder = new BinaryLogDecoder([image.elf]);
  const packet = frame({
    format: u32(image.formatAddr),
    tag: u32(image.tagAddr),
    timestamp: 0x100000000,
    args: u32(1),
    time64: true,
  });
  assert.equal(text(decoder.push(packet)), "I (4294967296) wifi: value 1\n");
});

test("formats a hex buffer log in 16-byte rows", () => {
  const decoder = new BinaryLogDecoder([indexElf("app.elf", buildElf())]);
  const payload = Uint8Array.from({ length: 18 }, (_unused, index) => index + 1);
  const packet = frame({
    format: embedded("__ESP_BUFFER_HEX_FORMAT__ len %d, array %s, address %p"),
    tag: embedded("log_example"),
    timestamp: 954,
    args: concat(u32(payload.length), embedded(payload), u32(0x3ffb5bc0)),
  });
  const row = (slice) => [...slice].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
  const expected = `I (954) log_example: ${row(payload.subarray(0, 16))}\nI (954) log_example: ${row(
    payload.subarray(16),
  )}\n`;
  assert.equal(text(decoder.push(packet)), expected);
});

test("uses bootloader.elf for a type 0x01 frame", () => {
  const app = indexElf("app.elf", buildElf({ sections: [{ name: ".rodata", data: cString("app %d"), addr: RODATA }] }));
  const bootFormat = cString("boot %d");
  const boot = indexElf(
    "bootloader.elf",
    buildElf({ sections: [{ name: ".rodata", data: concat(bootFormat, cString("boot")), addr: RODATA }] }),
  );
  const decoder = new BinaryLogDecoder([app, boot]);
  const packet = frame({
    type: 0x01,
    format: u32(RODATA),
    tag: u32(RODATA + bootFormat.length),
    timestamp: 3,
    args: u32(2),
  });
  assert.equal(text(decoder.push(packet)), "I (3) boot: boot 2\n");
});

test("forwards text that is not a binary frame", () => {
  const decoder = new BinaryLogDecoder([indexElf("app.elf", buildElf())]);
  assert.equal(text(decoder.push(bytes("hello\n"))), "hello\n");
});

test("colors a decoded line and applies the print filter", async () => {
  const format = "value %d";
  const tag = "wifi";
  const data = concat(cString(format), cString(tag), cString("other"));
  const elf = buildElf({ sections: [{ name: ".rodata", data, addr: RODATA }] });
  const port = createFakePort();
  const terminal = createTerminal();
  const monitor = new IDFMonitor({
    port,
    terminal,
    noReset: true,
    flushIntervalMs: 5000,
    elfFiles: [{ name: "app.elf", data: elf }],
    printFilter: "wifi:I *:N",
    decodeAddresses: false,
  });
  const lines = [];
  monitor.on("line", (event) => lines.push(event));
  await monitor.start();
  try {
    port.push(frame({ format: u32(RODATA), tag: u32(RODATA + format.length + 1), args: u32(7) }));
    port.push(
      frame({
        format: u32(RODATA),
        tag: u32(RODATA + format.length + 1 + tag.length + 1),
        timestamp: 11,
        args: u32(1),
      }),
    );
    await waitFor(() => lines.length >= 2, "two decoded lines");
    assert.equal(lines[0].printed, true);
    assert.equal(lines[0].text, "I (10) wifi: value 7");
    assert.equal(lines[1].printed, false);
    assert.equal(lines[1].text, "I (11) other: value 1");
    assert.match(terminal.text(), /\u001b\[0;32mI \(10\) wifi: value 7\u001b\[0m/);
    assert.equal(terminal.text().includes("other"), false);
  } finally {
    await monitor.stop();
  }
});
