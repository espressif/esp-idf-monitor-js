/**
 * In-memory serial port and terminal used by the monitor tests.
 */

/**
 * @returns {object} Port, terminal, and helpers shared by the suite.
 */
export function createFakePort(info = { usbVendorId: 0x303a, usbProductId: 0x0002 }) {
  /** @type {ReadableStreamDefaultController<Uint8Array> | null} */
  let controller = null;
  const written = [];
  const signals = [];
  const port = {
    readable: /** @type {ReadableStream<Uint8Array> | null} */ (null),
    writable: /** @type {WritableStream<Uint8Array> | null} */ (null),
    info,
    written,
    signals,
    async open() {
      port.readable = new ReadableStream({
        start(stream) {
          controller = stream;
        },
        cancel() {
          controller = null;
        },
      });
      port.writable = new WritableStream({
        write(chunk) {
          written.push(new Uint8Array(chunk));
        },
      });
    },
    async close() {
      try {
        await controller?.close();
      } catch {
        // The stream may already be closed by a disconnect.
      }
      controller = null;
      port.readable = null;
      port.writable = null;
    },
    getInfo() {
      return { ...port.info };
    },
    async setSignals(next) {
      signals.push({ ...next });
    },
    /**
     * @param {Uint8Array} bytes Chunk the device would have sent.
     */
    push(bytes) {
      if (!controller) {
        throw new Error("fake port is not open");
      }
      controller.enqueue(bytes);
    },
    disconnect() {
      const current = controller;
      controller = null;
      if (current) {
        current.close();
      }
    },
  };
  return port;
}

/**
 * Terminal that records writes and lets a test inject keystrokes.
 * @returns {object} Terminal double.
 */
export function createTerminal() {
  const output = [];
  const listeners = new Set();
  return {
    output,
    text() {
      return output.join("");
    },
    /**
     * @param {string} data Text the monitor printed.
     */
    write(data) {
      output.push(data);
    },
    /**
     * @param {function(string): void} callback Key handler.
     * @returns {{ dispose: function(): void }} Subscription.
     */
    onData(callback) {
      listeners.add(callback);
      return {
        dispose() {
          listeners.delete(callback);
        },
      };
    },
    /**
     * @param {string} data Keys to deliver.
     */
    type(data) {
      for (const callback of listeners) {
        callback(data);
      }
    },
  };
}

/**
 * @param {string} text Text to encode.
 * @returns {Uint8Array} UTF-8 bytes.
 */
export function bytes(text) {
  return new TextEncoder().encode(text);
}

/**
 * Poll until a condition is true.
 * @param {function(): boolean} predicate Test to retry.
 * @param {string} label Included in the timeout error.
 * @returns {Promise<void>} Resolves when the predicate is true.
 */
export async function waitFor(predicate, label = "condition") {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${label}`);
}

/**
 * Build a tiny executable ELF32 with one function symbol.
 * Extra sections are appended after the symbol table. Omit `symbol` for a ROM-like image.
 * @param {object} [options] Address, symbol name, and optional non-allocated sections.
 * @param {Array<{ name: string, data: Uint8Array }>} [options.sections] Debug sections such as `.debug_line`.
 * @returns {Uint8Array} ELF bytes.
 */
export function buildElf(options = {}) {
  const addr = options.addr ?? 0x40000000;
  const size = options.size ?? 16;
  const symbol = options.symbol === undefined ? "app_main" : options.symbol;
  const extra = options.sections ?? [];
  const sectionNames = [".text", ".shstrtab", ".strtab", ".symtab", ...extra.map((section) => section.name)];
  const shstr = cString(sectionNames);
  const names = nameOffsets(sectionNames);
  const str = symbol ? cString([symbol]) : new Uint8Array([0]);
  const text = new Uint8Array(size);
  const sym = new Uint8Array(symbol ? 32 : 16);
  if (symbol) {
    const symView = new DataView(sym.buffer);
    symView.setUint32(16, 1, true);
    symView.setUint32(20, addr, true);
    symView.setUint32(24, Math.min(size, 8), true);
    sym[28] = 0x12;
    symView.setUint16(30, 1, true);
  }

  const headerSize = 52;
  const textOff = headerSize;
  const shstrOff = textOff + text.length;
  const strOff = shstrOff + shstr.length;
  const symOff = strOff + str.length;
  const extras = [];
  let cursor = symOff + sym.length;
  for (const section of extra) {
    extras.push({ name: section.name, off: cursor, data: section.data });
    cursor += section.data.length;
  }
  const shoff = cursor;
  const shentsize = 40;
  const shnum = 5 + extra.length;
  const file = new Uint8Array(shoff + shnum * shentsize);
  const view = new DataView(file.buffer);
  file.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1], 0);
  view.setUint16(16, 2, true);
  view.setUint16(18, 0x5e, true);
  view.setUint32(20, 1, true);
  view.setUint32(32, shoff, true);
  view.setUint16(40, 52, true);
  view.setUint16(46, shentsize, true);
  view.setUint16(48, shnum, true);
  view.setUint16(50, 2, true);
  file.set(text, textOff);
  file.set(shstr, shstrOff);
  file.set(str, strOff);
  file.set(sym, symOff);
  for (const section of extras) {
    file.set(section.data, section.off);
  }

  const sections = [
    { name: 0, type: 0, flags: 0, addr: 0, off: 0, size: 0, link: 0, entsize: 0 },
    { name: names[".text"], type: 1, flags: 6, addr, off: textOff, size, link: 0, entsize: 0 },
    { name: names[".shstrtab"], type: 3, flags: 0, addr: 0, off: shstrOff, size: shstr.length, link: 0, entsize: 0 },
    { name: names[".strtab"], type: 3, flags: 0, addr: 0, off: strOff, size: str.length, link: 0, entsize: 0 },
    { name: names[".symtab"], type: 2, flags: 0, addr: 0, off: symOff, size: sym.length, link: 3, entsize: 16 },
    ...extras.map((section) => ({
      name: names[section.name],
      type: 1,
      flags: 0,
      addr: 0,
      off: section.off,
      size: section.data.length,
      link: 0,
      entsize: 0,
    })),
  ];
  sections.forEach((section, index) => {
    const base = shoff + index * shentsize;
    view.setUint32(base, section.name, true);
    view.setUint32(base + 4, section.type, true);
    view.setUint32(base + 8, section.flags, true);
    view.setUint32(base + 12, section.addr, true);
    view.setUint32(base + 16, section.off, true);
    view.setUint32(base + 20, section.size, true);
    view.setUint32(base + 24, section.link, true);
    view.setUint32(base + 36, section.entsize, true);
  });
  return file;
}

/**
 * Offsets of names in a leading-NUL string table.
 * @param {string[]} names Section names, in table order.
 * @returns {Record<string, number>} Name to offset.
 */
function nameOffsets(names) {
  const offsets = {};
  let cursor = 1;
  for (const name of names) {
    offsets[name] = cursor;
    cursor += name.length + 1;
  }
  return offsets;
}

/**
 * NUL-terminated string table with a leading NUL.
 * @param {string[]} values Strings to place in order.
 * @returns {Uint8Array} String table bytes.
 */
function cString(values) {
  const parts = [0];
  for (const value of values) {
    for (const char of value) {
      parts.push(char.charCodeAt(0));
    }
    parts.push(0);
  }
  return new Uint8Array(parts);
}
