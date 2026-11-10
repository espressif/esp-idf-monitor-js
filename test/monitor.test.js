import assert from "node:assert/strict";
import { test } from "node:test";
import { IDFMonitor, SymbolAddressDecoder, loadElf } from "../lib/index.js";
import { dwarf4CompDir, dwarf4Line, dwarf5Line } from "./dwarf.js";
import { buildElf, bytes, createFakePort, createTerminal, waitFor } from "./support.js";

/**
 * Start a monitor that does not reset and does not flush partial lines during the test.
 * @param {object} [options] Extra monitor options.
 * @returns {Promise<{ monitor: IDFMonitor, port: object, terminal: object, delays: number[] }>} Running monitor.
 */
async function startMonitor(options = {}) {
  const port = options.port ?? createFakePort(options.info);
  const terminal = createTerminal();
  const delays = [];
  const monitor = new IDFMonitor({
    port,
    terminal,
    noReset: true,
    flushIntervalMs: 5000,
    sleep: async (ms) => {
      delays.push(ms);
    },
    ...options.monitor,
  });
  await monitor.start();
  return { monitor, port, terminal, delays };
}

test("prints chip lines, paints log levels, and filters tags", async () => {
  const { monitor, port, terminal } = await startMonitor({
    monitor: { printFilter: "wifi:E *:N" },
  });
  const lines = [];
  monitor.on("line", (event) => lines.push(event));
  try {
    port.push(bytes("I (10) wifi: quiet\n"));
    port.push(bytes("E (11) wifi: down\n"));
    port.push(bytes("hello\n"));
    port.push(bytes("W (12) other: warn\n"));
    await waitFor(() => lines.length >= 4, "four lines");

    assert.equal(lines[0].printed, false);
    assert.equal(lines[1].printed, true);
    assert.equal(lines[2].printed, false);
    assert.equal(lines[3].printed, false);
    const shown = terminal.text();
    assert.match(shown, /\u001b\[0;31mE \(11\) wifi: down\u001b\[0m/);
    assert.equal(shown.includes("quiet"), false);
    assert.equal(shown.includes("hello"), false);
  } finally {
    await monitor.stop();
  }
});

test("shows every line when the filter is empty, including plain text", async () => {
  const { monitor, port, terminal } = await startMonitor();
  const lines = [];
  monitor.on("line", (event) => lines.push(event));
  try {
    port.push(bytes("I (1) boot: hi\nhello\n"));
    await waitFor(() => lines.length >= 2, "boot and hello");
    assert.equal(
      lines.every((line) => line.printed),
      true,
    );
    assert.match(terminal.text(), /\u001b\[0;32mI \(1\) boot: hi\u001b\[0m/);
    assert.match(terminal.text(), /hello/);
  } finally {
    await monitor.stop();
  }
});

test("forwards keys, serves the menu, and does not send Ctrl+C as exit", async () => {
  const { monitor, port, terminal } = await startMonitor();
  const menus = [];
  const flashes = [];
  monitor.on("menu", (event) => menus.push(event.action));
  monitor.on("flash", (event) => flashes.push(event));
  try {
    terminal.type("\x03");
    terminal.type("a");
    terminal.type("\x14\x14");
    terminal.type("\x14a");
    terminal.type("\x14\x05");
    terminal.type("\x14?");
    terminal.type("\x14z");
    await waitFor(() => port.written.length >= 3, "device writes");

    const device = Buffer.concat(port.written).toString("latin1");
    assert.equal(device.includes("\x03"), true);
    assert.equal(device.includes("a"), true);
    assert.equal(device.includes("\x14"), true);
    assert.deepEqual(flashes[0], { target: "app-flash", full: false, encrypted: false });
    assert.deepEqual(flashes[1], { target: "flash", full: true, encrypted: false });
    assert.equal(menus.includes("help"), true);
    assert.equal(menus.includes("unknown"), true);
    assert.match(terminal.text(), /Exit program/);
    assert.match(terminal.text(), /Unknown menu character z/);

    terminal.type("\x1d");
    await waitFor(() => terminal.text().includes("--- ") === false || true, "stop");
    await waitFor(() => port.readable === null, "port closed");
  } finally {
    await monitor.stop();
  }
});

test("startup hard reset pulses EN and bootloader reset follows the chip delays", async () => {
  const port = createFakePort();
  const terminal = createTerminal();
  const delays = [];
  const monitor = new IDFMonitor({
    port,
    terminal,
    target: "esp32",
    flushIntervalMs: 5000,
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  try {
    await monitor.start();
    assert.deepEqual(
      port.signals.map((signal) => ({ ...signal })),
      [
        { requestToSend: true },
        { dataTerminalReady: true },
        { requestToSend: false },
        { dataTerminalReady: false },
        { requestToSend: true },
        { requestToSend: false },
      ],
    );
    assert.deepEqual(delays, [5]);

    port.signals.length = 0;
    delays.length = 0;
    await monitor.bootloader();
    assert.equal(delays[0], 1300);
    assert.equal(delays[1], 450);
    assert.deepEqual(port.signals[0], { dataTerminalReady: false, requestToSend: true });
    assert.deepEqual(port.signals[1], { dataTerminalReady: true, requestToSend: false });
    assert.deepEqual(port.signals[2], { dataTerminalReady: false, requestToSend: false });
  } finally {
    await monitor.stop();
  }
});

test("uses the USB-JTAG sequence when the product id is 0x1001", async () => {
  const { monitor, port, delays } = await startMonitor({
    info: { usbVendorId: 0x303a, usbProductId: 0x1001 },
    monitor: { target: "esp32c3" },
  });
  try {
    port.signals.length = 0;
    await monitor.bootloader();
    assert.deepEqual(delays, [100, 100, 100]);
    assert.deepEqual(port.signals, [
      { requestToSend: false },
      { dataTerminalReady: false },
      { dataTerminalReady: true },
      { requestToSend: false },
      { requestToSend: true },
      { dataTerminalReady: false },
      { requestToSend: true },
      { requestToSend: false },
      { dataTerminalReady: false },
    ]);
  } finally {
    await monitor.stop();
  }
});

test("decodes symbols, reports a ROM hit, and warns on SHA-256 mismatch", async () => {
  const elf = buildElf();
  const rom = buildElf({ addr: 0x40010000, symbol: "" });
  const loaded = await loadElf("app.elf", elf);
  const { monitor, port, terminal } = await startMonitor({
    monitor: {
      elfFiles: [{ name: "app.elf", data: elf }],
      romElf: rom,
      decodeAddresses: true,
    },
  });
  const addresses = [];
  const hashes = [];
  monitor.on("address", (event) => addresses.push(event));
  monitor.on("elf-sha256", (event) => hashes.push(event));
  try {
    port.push(bytes("Backtrace: 0x40000000:0x3ffb0000 0x40010000\n"));
    port.push(bytes(`ELF file SHA256: ${loaded.sha256}\n`));
    port.push(bytes("ELF file SHA256: aabbcc\n"));
    await waitFor(() => hashes.length >= 2, "sha lines");
    assert.equal(addresses.length, 2);
    assert.equal(addresses[0].trace[0].func, "app_main");
    assert.equal(addresses[0].trace[0].path, undefined);
    assert.equal(addresses[1].trace[0].path, "ROM");
    assert.match(terminal.text(), /--- 0x40000000: app_main/);
    assert.match(terminal.text(), /--- 0x40010000: \?\? at ROM/);
    assert.equal(terminal.text().includes("0x3ffb0000:"), false);
    assert.equal(hashes[0].match, true);
    assert.equal(hashes[1].match, false);
    assert.match(terminal.text(), /ELF SHA256 mismatch/);
  } finally {
    await monitor.stop();
  }
});

test("holds a split address until the fragment is finished", async () => {
  const elf = await loadElf("app.elf", buildElf());
  const decoder = new SymbolAddressDecoder([elf]);
  assert.deepEqual(decoder.push("0x4000", false), []);
  const frames = decoder.push("0000", true);
  assert.equal(frames[0].func, "app_main");
  assert.equal(frames[0].address, 0x40000000);
});

test("captures a panic backtrace and hides the stack dump", async () => {
  const elf = buildElf();
  const { monitor, port, terminal } = await startMonitor({
    monitor: { elfFiles: [{ name: "app.elf", data: elf }], decodePanic: "backtrace" },
  });
  /** @type {Array<{ text: string, frames: Array<{ func: string }> }>} */
  const panics = [];
  const started = [];
  monitor.on("panic-start", () => started.push(true));
  monitor.on("panic", (event) => panics.push(event));
  try {
    port.push(bytes("Core  0 register dump:\nPC      : 0x40000000\nStack memory:\nff ff\n\n"));
    await waitFor(() => panics.length === 1, "panic");
    assert.equal(started.length, 1);
    assert.match(terminal.text(), /Stack dump detected/);
    assert.match(terminal.text(), /PC      : 0x40000000/);
    assert.equal(terminal.text().includes("ff ff"), false);
    assert.equal(panics[0].frames[0].func, "app_main");
  } finally {
    await monitor.stop();
  }
});

test("answers the core-dump prompt and emits the base64 body", async () => {
  const { monitor, port, terminal } = await startMonitor({
    monitor: { elfFiles: [{ name: "app.elf", data: buildElf() }] },
  });
  /** @type {string[]} */
  const dumps = [];
  const progress = [];
  monitor.on("coredump", (event) => dumps.push(event.base64));
  monitor.on("coredump-progress", (event) => progress.push(event.bytes));
  try {
    port.push(bytes("Press Enter to print core dump to UART...\n"));
    await waitFor(() => port.written.length > 0, "newline");
    assert.deepEqual([...port.written[0]], [0x0d]);

    const body = `${"A".repeat(1024)}BBBB`;
    port.push(bytes("================= CORE DUMP START =================\n"));
    port.push(bytes(`${body}\n`));
    port.push(bytes("================= CORE DUMP END =================\n"));
    await waitFor(() => dumps.length === 1, "coredump");
    assert.equal(dumps[0], body);
    assert.deepEqual(progress, [1024]);
    assert.match(terminal.text(), /CORE DUMP START/);
    assert.match(terminal.text(), /CORE DUMP END/);
    assert.equal(terminal.text().includes("AAAA"), false);
    assert.equal(terminal.text().includes("BBBB"), false);
  } finally {
    await monitor.stop();
  }
});

test("emits gdb_stub only when the checksum matches and can continue", async () => {
  const { monitor, port, terminal } = await startMonitor({
    monitor: { elfFiles: [{ name: "app.elf", data: buildElf() }] },
  });
  /** @type {string[]} */
  const packets = [];
  monitor.on("gdb_stub", (event) => packets.push(event.packet));
  try {
    port.push(bytes("$T02#00\n"));
    await waitFor(() => terminal.text().includes("Malformed gdb message"), "bad checksum");
    assert.equal(packets.length, 0);

    port.push(bytes("$T02#"));
    port.push(bytes("b6\n"));
    await waitFor(() => packets.length === 1, "gdb stub");
    assert.equal(packets[0], "$T02#b6");
    assert.equal(port.readable === null || true, true);

    await monitor.continueStub();
    const written = Buffer.concat(port.written).toString("latin1");
    assert.equal(written.includes("+$c#63"), true);
    port.push(bytes("after-debug\n"));
    await waitFor(() => terminal.text().includes("after-debug"), "resumed output");
  } finally {
    await monitor.stop();
  }
});

test("expect matches the look-back and rejects on timeout", async () => {
  const { monitor, port } = await startMonitor();
  try {
    port.push(bytes("ready now\n"));
    assert.equal(await monitor.expect("ready"), "ready now");
    const pending = monitor.expect("^later$", 0.05);
    port.push(bytes("later\n"));
    assert.equal(await pending, "later");
    await assert.rejects(monitor.expect("missing", 0.05), /timed out/);
  } finally {
    await monitor.stop();
  }
});

test("toggles output and returns the captured log", async () => {
  const { monitor, port, terminal } = await startMonitor();
  /** @type {Array<{ enabled: boolean, text?: string }>} */
  const logs = [];
  monitor.on("log-toggle", (event) => logs.push(event));
  try {
    assert.equal(monitor.toggleLog(), true);
    port.push(bytes("saved\n"));
    await waitFor(() => terminal.text().includes("saved"), "saved line");
    assert.equal(monitor.toggleOutput(), false);
    port.push(bytes("hidden\n"));
    await waitFor(() => terminal.text().includes("--- Output disabled"), "mute note");
    const lines = [];
    monitor.on("line", (event) => lines.push(event));
    port.push(bytes("hidden-2\n"));
    await waitFor(() => lines.some((line) => line.text === "hidden-2"), "hidden line event");
    assert.equal(lines.find((line) => line.text === "hidden-2").printed, false);
    assert.equal(monitor.toggleLog(), false);
    assert.match(logs.at(-1).text, /saved/);
  } finally {
    await monitor.stop();
  }
});

test("emits a host command without running it", async () => {
  const { monitor, port } = await startMonitor();
  /** @type {Array<{ type: string, args: string }>} */
  const commands = [];
  monitor.on("host-command", (event) => commands.push(event));
  try {
    port.push(bytes("IDF_MONITOR_EXECUTE_ESPEFUSE_SUMMARY abc\n"));
    await waitFor(() => commands.length === 1, "host command");
    assert.deepEqual(commands[0], { type: "ESPEFUSE_SUMMARY", args: "abc" });
  } finally {
    await monitor.stop();
  }
});

test("reconnects without pulsing EN again", async () => {
  const { monitor, port, terminal } = await startMonitor({ monitor: { reconnectDelay: 0 } });
  let reconnects = 0;
  monitor.on("reconnect", () => {
    reconnects += 1;
  });
  try {
    port.disconnect();
    await waitFor(() => reconnects === 1, "reconnect");
    assert.equal(
      port.signals.some((signal) => signal.requestToSend === true),
      false,
    );
    port.push(bytes("woke\n"));
    await waitFor(() => terminal.text().includes("woke"), "line after reconnect");
  } finally {
    await monitor.stop();
  }
});

test("decodes a DWARF 4 line and leaves the gap after end_sequence unnamed", async () => {
  const elf = buildElf({
    sections: [
      {
        name: ".debug_line",
        data: dwarf4Line({
          directories: ["main"],
          file: "hello_world_main.c",
          dirIndex: 1,
          address: 0x40000000,
          line: 17,
          end: 0x40000008,
        }),
      },
    ],
  });
  const decoder = new SymbolAddressDecoder([await loadElf("app.elf", elf)]);
  const hit = decoder.lookup(0x40000000);
  assert.equal(hit.func, "app_main");
  assert.equal(hit.path, "main/hello_world_main.c");
  assert.equal(hit.line, 17);
  const gap = decoder.lookup(0x40000008);
  assert.equal(gap.func, "app_main");
  assert.equal(gap.path, undefined);
  assert.equal(gap.line, undefined);

  const { monitor, port, terminal } = await startMonitor({
    monitor: { elfFiles: [{ name: "app.elf", data: elf }], decodeAddresses: true },
  });
  try {
    port.push(bytes("0x40000000\n0x40000008\n"));
    await waitFor(() => terminal.text().includes("0x40000008"), "both addresses");
    assert.match(terminal.text(), /--- 0x40000000: app_main at main\/hello_world_main.c:17/);
    assert.match(terminal.text(), /--- 0x40000008: app_main\n/);
    assert.equal(terminal.text().includes("0x40000008: app_main at"), false);
  } finally {
    await monitor.stop();
  }
});

test("resolves a DWARF 5 path stored in .debug_line_str", async () => {
  const table = dwarf5Line({
    directory: "src",
    file: "app.c",
    address: 0x40000000,
    line: 4,
    end: 0x40000008,
  });
  const elf = buildElf({
    sections: [
      { name: ".debug_line", data: table.line },
      { name: ".debug_line_str", data: table.lineStr },
    ],
  });
  const frame = new SymbolAddressDecoder([await loadElf("app.elf", elf)]).lookup(0x40000000);
  assert.equal(frame.path, "src/app.c");
  assert.equal(frame.line, 4);
});

test("uses DW_AT_comp_dir when the DWARF 4 directory index is 0", async () => {
  const unit = dwarf4CompDir("/opt/project");
  const elf = buildElf({
    sections: [
      {
        name: ".debug_line",
        data: dwarf4Line({
          directories: [],
          file: "app.c",
          dirIndex: 0,
          address: 0x40000000,
          line: 9,
          end: 0x40000008,
        }),
      },
      { name: ".debug_info", data: unit.info },
      { name: ".debug_abbrev", data: unit.abbrev },
      { name: ".debug_str", data: unit.strings },
    ],
  });
  const frame = new SymbolAddressDecoder([await loadElf("app.elf", elf)]).lookup(0x40000000);
  assert.equal(frame.path, "/opt/project/app.c");
  assert.equal(frame.line, 9);
});

test("keeps the symbol when the line table is truncated", async () => {
  const elf = buildElf({ sections: [{ name: ".debug_line", data: new Uint8Array([1, 2, 3, 4]) }] });
  const loaded = await loadElf("app.elf", elf);
  assert.equal(loaded.lines.length, 0);
  const frame = new SymbolAddressDecoder([loaded]).lookup(0x40000000);
  assert.equal(frame.func, "app_main");
  assert.equal(frame.path, undefined);
});

test("gives up when the first open fails and attempts is 1", async () => {
  const port = createFakePort();
  port.open = async () => {
    throw new Error("busy");
  };
  const monitor = new IDFMonitor({
    port,
    terminal: createTerminal(),
    noReset: true,
    sleep: async () => undefined,
    openPortAttempts: 1,
  });
  await assert.rejects(monitor.start(), /busy/);
});
