# esp-idf-monitor-js

Browser serial console for ESP-IDF. It speaks the same keyboard commands as [esp-idf-monitor](https://github.com/espressif/esp-idf-monitor) and reports gdbstub, core dump, and flash requests as events instead of a WebSocket.

The page grants a [Web Serial](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) or [WebUSB](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API) port.

## Install

```bash
npm install @espressif/esp-idf-monitor-js
```

## Use

```ts
import { IDFMonitor } from "@espressif/esp-idf-monitor-js";

const port = await navigator.serial.requestPort();
const term = new Terminal(); // xterm.js: write() and onData()
term.open(document.getElementById("terminal"));

const monitor = new IDFMonitor({
  port,
  terminal: term,
  baudRate: 115200,
  target: "esp32c3",
  elfFiles: [{ name: "app.elf", data: await file.arrayBuffer() }],
  decodePanic: "backtrace",
});

monitor.on("gdb_stub", async ({ packet }) => {
  console.log("gdb stub", packet);
  // The read loop is released. Hand the port to a debugger, then:
  await monitor.continueStub();
});

monitor.on("coredump", ({ base64, progName }) => {
  console.log("core dump", progName, base64.length);
});

monitor.on("flash", async ({ target, full }) => {
  await monitor.stop();
  // Run esptool-js on the same port, then construct a new monitor.
  console.log(target, full);
});

monitor.on("line", ({ text, printed }) => {
  if (!printed) console.log("hidden", text);
});

await monitor.start();
```

Ctrl+] exits. Ctrl+T opens the menu (reset, bootloader, flash, output, timestamps, log capture, help). Ctrl+C is sent to the chip and does not exit.

`reset()`, `bootloader()`, `send(text)`, `expect(pattern, timeoutSeconds)`, and `sleep(seconds)` are the command-stream equivalents of the Python tool.

## What the library does not do

It does not launch `gdb`, `addr2line`, `idf.py`, or `espefuse`. 

Address decoration uses the ELF symbol table and the DWARF line table in the application ELF, so a program counter prints as a function, source file, and line. A ROM address is labeled `ROM`. Inlined calls, C++ demangling, binary logs, and a human-readable core dump are left to the page or a later decoder that implements `AddressDecoder`.

On `flash`, close the monitor and flash with [esptool-js](https://github.com/espressif/esptool-js) on the same port. Opening the port twice at once will fail.

## Example

[examples/typescript](examples/typescript) is a page that grants a Web Serial or WebUSB port, loads an ELF, and starts a monitor. Build this package, then run `npm install` and `npm run dev` in that directory.

GitHub Actions publishes the built example to GitHub Pages from `main`. Enable Pages in the repository settings. The site is `https://espressif.github.io/esp-idf-monitor-js/`. The API reference, generated from the source comments, is `https://espressif.github.io/esp-idf-monitor-js/docs/`.

## Publish

GitHub Actions in `.github/workflows` builds, lints, tests, and packs on every push and pull request to `main`. Pushing a tag `vX.Y.Z` that matches `package.json` publishes to npm with trusted publishing (`id-token: write`).

## License

Apache-2.0
