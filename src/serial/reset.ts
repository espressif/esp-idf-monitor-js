import { USB_JTAG_SERIAL_PID } from "../types.js";

/**
 * Object that can wiggle DTR/RTS and wait.
 */
export interface SignalControl {
  /**
   * Apply line states. `true` means asserted (pin low on the auto-reset circuit).
   * @param {SerialOutputSignals} signals Lines to change.
   * @returns {Promise<void>} Resolves when the adapter has applied them.
   */
  setSignals(signals: SerialOutputSignals): Promise<void>;
  /**
   * Wait.
   * @param {number} ms Milliseconds.
   * @returns {Promise<void>} Resolves after the delay.
   */
  sleep(ms: number): Promise<void>;
}

/**
 * Pulse EN low for 5 ms. RTS asserted is EN low.
 * @param {SignalControl} control Adapter that sets the lines.
 * @returns {Promise<void>} Resolves when EN is high again.
 */
export async function hardReset(control: SignalControl): Promise<void> {
  await control.setSignals({ requestToSend: true });
  await control.sleep(5);
  await control.setSignals({ requestToSend: false });
}

/**
 * Classic IO0/EN bootloader entry.
 * ESP32 uses 1300 ms / 450 ms. Every other target uses 100 ms / 50 ms.
 * @param {SignalControl} control Adapter that sets the lines.
 * @param {number} enterBootSetMs Delay after asserting reset with IO0 high.
 * @param {number} enterBootUnsetMs Delay after releasing reset with IO0 low.
 * @returns {Promise<void>} Resolves when IO0 is high again and the ROM is running.
 */
export async function classicBootloaderReset(
  control: SignalControl,
  enterBootSetMs: number,
  enterBootUnsetMs: number,
): Promise<void> {
  await control.setSignals({ dataTerminalReady: false, requestToSend: true });
  await control.sleep(enterBootSetMs);
  await control.setSignals({ dataTerminalReady: true, requestToSend: false });
  await control.sleep(enterBootUnsetMs);
  await control.setSignals({ dataTerminalReady: false, requestToSend: false });
}

/**
 * USB-Serial-JTAG bootloader entry used when the product id is {@link USB_JTAG_SERIAL_PID}.
 * RTS is toggled on its own so the adapter walks through the (1,1) idle pair.
 * @param {SignalControl} control Adapter that sets the lines.
 * @returns {Promise<void>} Resolves when both lines are deasserted.
 */
export async function usbJtagBootloaderReset(control: SignalControl): Promise<void> {
  await control.setSignals({ requestToSend: false });
  await control.setSignals({ dataTerminalReady: false });
  await control.sleep(100);
  await control.setSignals({ dataTerminalReady: true });
  await control.setSignals({ requestToSend: false });
  await control.sleep(100);
  await control.setSignals({ requestToSend: true });
  await control.setSignals({ dataTerminalReady: false });
  await control.setSignals({ requestToSend: true });
  await control.sleep(100);
  await control.setSignals({ requestToSend: false });
  await control.setSignals({ dataTerminalReady: false });
}

/**
 * Run a `D` / `R` / `U` / `W` sequence.
 * Digits are asserted booleans (`1` = true). `W` is seconds, so `W0.1` waits 100 ms.
 * `U<dtr>,<rts>` sets both lines in one call.
 * @param {SignalControl} control Adapter that sets the lines.
 * @param {string} sequence Pipe-separated steps.
 * @returns {Promise<boolean>} False when a step is not in the grammar. Nothing is applied after the bad step.
 */
export async function runCustomReset(control: SignalControl, sequence: string): Promise<boolean> {
  const steps = sequence.split("|").filter((step) => step.length > 0);
  if (steps.length === 0) {
    return false;
  }
  for (const step of steps) {
    if (/^D[01]$/.test(step)) {
      await control.setSignals({ dataTerminalReady: step[1] === "1" });
    } else if (/^R[01]$/.test(step)) {
      await control.setSignals({ requestToSend: step[1] === "1" });
    } else if (/^U[01],[01]$/.test(step)) {
      const [dtr, rts] = step.slice(1).split(",");
      await control.setSignals({ dataTerminalReady: dtr === "1", requestToSend: rts === "1" });
    } else if (/^W(?:\d+|\d*\.\d+)$/.test(step)) {
      await control.sleep(Number.parseFloat(step.slice(1)) * 1000);
    } else {
      return false;
    }
  }
  return true;
}

/**
 * Boot delays for the classic sequence. Revision is ignored: esp-idf-monitor always uses the rev-0 row.
 * @param {string} target Chip name, for example `esp32` or `esp32c3`.
 * @returns {{ enterBootSetMs: number, enterBootUnsetMs: number }} Delays in milliseconds.
 */
export function classicDelays(target: string): { enterBootSetMs: number; enterBootUnsetMs: number } {
  if (target.toLowerCase() === "esp32") {
    return { enterBootSetMs: 1300, enterBootUnsetMs: 450 };
  }
  return { enterBootSetMs: 100, enterBootUnsetMs: 50 };
}

/**
 * Choose the bootloader sequence: custom, then USB-JTAG when the pid matches, otherwise classic.
 * @param {SignalControl} control Adapter that sets the lines.
 * @param {string} target Chip name.
 * @param {number | undefined} productId USB product id from `getInfo`, when the browser has one.
 * @param {string | undefined} custom Sequence that replaces the built-in trains.
 * @returns {Promise<"bootloader" | "custom" | "invalid">} Which sequence ran.
 */
export async function enterBootloader(
  control: SignalControl,
  target: string,
  productId: number | undefined,
  custom: string | undefined,
): Promise<"bootloader" | "custom" | "invalid"> {
  if (custom) {
    const ok = await runCustomReset(control, custom);
    return ok ? "custom" : "invalid";
  }
  if (productId === USB_JTAG_SERIAL_PID) {
    await usbJtagBootloaderReset(control);
    return "bootloader";
  }
  const delays = classicDelays(target);
  await classicBootloaderReset(control, delays.enterBootSetMs, delays.enterBootUnsetMs);
  return "bootloader";
}
