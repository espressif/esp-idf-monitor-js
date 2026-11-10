# esp-idf-monitor-js example

Browser page for granting a serial port, loading ELF files, and running a monitor session.

Build the library from the repository root first, so `lib/` exists:

```bash
npm install
npm run build
cd examples/typescript
npm install
npm run dev
```

`npm run dev` and `npm run build` generate API docs at the repository root with `typedoc`, then copy them into `dist/docs`. The page links to that folder. `npm run build` also writes the rest of the static site to `dist/` with relative URLs for GitHub Pages. The Pages workflow publishes that directory. After GitHub Pages is enabled for the repository, the site is `https://<owner>.github.io/esp-idf-monitor-js/` and the API reference is `https://<owner>.github.io/esp-idf-monitor-js/docs/`.

Choose a port with Web Serial, or check WebUSB to call `navigator.usb.requestDevice()`. WebUSB only works for a CDC ACM device whose interface the browser can claim. On desktop the operating system usually owns that interface, and the page shows the claim error.

Chrome reserves Ctrl+T for a new tab. Use the on-page buttons to reset, enter the bootloader, and toggle output, timestamps, and log capture.
