/**
 * CDC ACM adapter so a WebUSB `USBDevice` can be passed to `IDFMonitor`.
 * The monitor only needs byte streams plus DTR and RTS.
 */

const CDC_COMM_CLASS = 0x02;
const CDC_DATA_CLASS = 0x0a;
const SET_LINE_CODING = 0x20;
const SET_CONTROL_LINE_STATE = 0x22;

interface CdcEndpoints {
  commInterface: number;
  dataInterface: number;
  dataAlternate: number;
  endpointIn: number;
  endpointOut: number;
  packetSize: number;
}

/**
 * Whether this browser exposes `navigator.usb`.
 * @returns {boolean} True when WebUSB can request a device.
 */
export function webUsbAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.usb;
}

/**
 * Ask the browser to pick a USB device and wrap it as a monitor port.
 * @returns {Promise<WebUsbMonitorPort>} Closed port. The monitor opens it on start.
 */
export async function requestWebUsbPort(): Promise<WebUsbMonitorPort> {
  if (!navigator.usb) {
    throw new Error("WebUSB is not available in this browser.");
  }
  const device = await navigator.usb.requestDevice({ filters: [] });
  return new WebUsbMonitorPort(device);
}

/**
 * USB CDC ACM serial port. `readable` and `writable` stay null until `open`.
 */
export class WebUsbMonitorPort {
  /** Byte stream from the device, or null while closed. */
  readable: ReadableStream<Uint8Array> | null = null;
  /** Byte stream to the device, or null while closed. */
  writable: WritableStream<Uint8Array> | null = null;

  private closed = true;
  private dtr = false;
  private rts = false;
  private commInterface = 0;
  private dataInterface = 0;
  private endpointIn = 0;
  private endpointOut = 0;
  private packetSize = 64;

  /**
   * @param {USBDevice} device Device chosen with `navigator.usb.requestDevice`.
   */
  constructor(private readonly device: USBDevice) {}

  /**
   * Vendor and product ids from the granted device.
   * @returns {SerialPortInfo} USB identity.
   */
  getInfo(): SerialPortInfo {
    return {
      usbVendorId: this.device.vendorId,
      usbProductId: this.device.productId,
    };
  }

  /**
   * Open the CDC data interface and start bulk transfers.
   * @param {object} options Serial options. Only `baudRate` is applied.
   * @returns {Promise<void>} Resolves when the streams are ready.
   */
  async open(options: { baudRate: number }): Promise<void> {
    if (!this.device.opened) {
      await this.device.open();
    }
    if (this.device.configuration === null) {
      const configuration = this.device.configurations[0];
      if (!configuration) {
        throw new Error("USB device has no configuration.");
      }
      await this.device.selectConfiguration(configuration.configurationValue);
    }
    const cdc = findCdc(this.device);
    this.commInterface = cdc.commInterface;
    this.dataInterface = cdc.dataInterface;
    this.endpointIn = cdc.endpointIn;
    this.endpointOut = cdc.endpointOut;
    this.packetSize = cdc.packetSize;

    await this.claim(cdc.commInterface);
    if (cdc.dataInterface !== cdc.commInterface) {
      await this.claim(cdc.dataInterface);
    }
    if (cdc.dataAlternate !== 0) {
      await this.device.selectAlternateInterface(cdc.dataInterface, cdc.dataAlternate);
    }
    await this.setLineCoding(options.baudRate);
    this.dtr = false;
    this.rts = false;
    await this.writeControlLines();

    this.closed = false;
    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        void this.readLoop(controller);
      },
      cancel: () => {
        this.closed = true;
      },
    });
    this.writable = new WritableStream<Uint8Array>({
      write: async (chunk) => {
        const result = await this.device.transferOut(this.endpointOut, ownedBuffer(chunk));
        if (result.status !== "ok") {
          throw new Error(`USB write failed: ${result.status}`);
        }
      },
    });
  }

  /**
   * Stop transfers and release the interfaces.
   * @returns {Promise<void>} Resolves when the device is closed.
   */
  async close(): Promise<void> {
    this.closed = true;
    this.readable = null;
    this.writable = null;
    if (!this.device.opened) {
      return;
    }
    try {
      await this.device.releaseInterface(this.dataInterface);
      if (this.commInterface !== this.dataInterface) {
        await this.device.releaseInterface(this.commInterface);
      }
    } catch {
      // The interface may already have been released.
    }
    await this.device.close();
  }

  /**
   * Set DTR and RTS. `true` is asserted. Unspecified lines keep their previous state.
   * @param {SerialOutputSignals} signals Line states to apply.
   * @returns {Promise<void>} Resolves when the control transfer finishes.
   */
  async setSignals(signals: SerialOutputSignals): Promise<void> {
    if (signals.dataTerminalReady !== undefined) {
      this.dtr = signals.dataTerminalReady;
    }
    if (signals.requestToSend !== undefined) {
      this.rts = signals.requestToSend;
    }
    await this.writeControlLines();
  }

  /**
   * Claim one interface, including the case where a previous open still holds it.
   * @param {number} interfaceNumber Interface to claim.
   * @returns {Promise<void>} Resolves when the interface is claimed.
   */
  private async claim(interfaceNumber: number): Promise<void> {
    const already = this.device.configuration?.interfaces.some(
      (iface) => iface.interfaceNumber === interfaceNumber && iface.claimed,
    );
    if (already) {
      return;
    }
    try {
      await this.device.claimInterface(interfaceNumber);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not claim the USB interface (${message}). The operating system often owns this CDC interface on desktop; Web Serial is the reliable path there.`,
      );
    }
  }

  /**
   * SET_LINE_CODING for 8N1 at the requested baud rate.
   * @param {number} baudRate Baud rate.
   * @returns {Promise<void>} Resolves when the device accepts the coding.
   */
  private async setLineCoding(baudRate: number): Promise<void> {
    const coding = new Uint8Array(7);
    new DataView(coding.buffer).setUint32(0, baudRate, true);
    coding[4] = 0;
    coding[5] = 0;
    coding[6] = 8;
    await this.controlOut(SET_LINE_CODING, 0, coding);
  }

  /**
   * SET_CONTROL_LINE_STATE from the stored DTR and RTS bits.
   * @returns {Promise<void>} Resolves when the device accepts the lines.
   */
  private async writeControlLines(): Promise<void> {
    const value = (this.dtr ? 0x1 : 0) | (this.rts ? 0x2 : 0);
    await this.controlOut(SET_CONTROL_LINE_STATE, value);
  }

  /**
   * Class control transfer addressed to the CDC communication interface.
   * @param {number} request CDC request code.
   * @param {number} value Request value.
   * @param {Uint8Array} [data] Optional payload.
   * @returns {Promise<void>} Resolves when the transfer status is ok.
   */
  private async controlOut(request: number, value: number, data?: Uint8Array): Promise<void> {
    const result = await this.device.controlTransferOut(
      {
        requestType: "class",
        recipient: "interface",
        request,
        value,
        index: this.commInterface,
      },
      data ? ownedBuffer(data) : undefined,
    );
    if (result.status !== "ok") {
      throw new Error(`USB control transfer ${request} failed: ${result.status}`);
    }
  }

  /**
   * Copy bulk IN packets onto the readable stream until `close`.
   * @param {ReadableStreamDefaultController<Uint8Array>} controller Stream controller.
   * @returns {Promise<void>} Resolves when reading stops.
   */
  private async readLoop(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    try {
      while (!this.closed) {
        const result = await this.device.transferIn(this.endpointIn, this.packetSize);
        if (this.closed) {
          break;
        }
        if (result.status === "stall") {
          await this.device.clearHalt("in", this.endpointIn);
          continue;
        }
        if (result.status !== "ok" || !result.data || result.data.byteLength === 0) {
          continue;
        }
        const copy = new Uint8Array(result.data.byteLength);
        copy.set(new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength));
        controller.enqueue(copy);
      }
      if (!this.closed) {
        controller.close();
      }
    } catch (error) {
      if (!this.closed) {
        controller.error(error);
      }
    }
  }
}

/**
 * Find the CDC communication interface and the bulk data endpoints.
 * @param {USBDevice} device An opened device with a selected configuration.
 * @returns {CdcEndpoints} Interface and endpoint numbers.
 */
/**
 * Copy bytes into an ArrayBuffer the WebUSB transfer methods accept.
 * @param {Uint8Array} bytes Source bytes.
 * @returns {ArrayBuffer} A detached copy.
 */
function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function findCdc(device: USBDevice): CdcEndpoints {
  const configuration = device.configuration;
  if (!configuration) {
    throw new Error("USB device has no active configuration.");
  }
  let commInterface: number | null = null;
  let data: CdcEndpoints | null = null;
  for (const iface of configuration.interfaces) {
    for (const alternate of iface.alternates) {
      if (alternate.interfaceClass === CDC_COMM_CLASS && commInterface === null) {
        commInterface = iface.interfaceNumber;
      }
      if (alternate.interfaceClass !== CDC_DATA_CLASS) {
        continue;
      }
      const endpointIn = alternate.endpoints.find((endpoint) => endpoint.type === "bulk" && endpoint.direction === "in");
      const endpointOut = alternate.endpoints.find(
        (endpoint) => endpoint.type === "bulk" && endpoint.direction === "out",
      );
      if (!endpointIn || !endpointOut) {
        continue;
      }
      data = {
        commInterface: commInterface ?? iface.interfaceNumber,
        dataInterface: iface.interfaceNumber,
        dataAlternate: alternate.alternateSetting,
        endpointIn: endpointIn.endpointNumber,
        endpointOut: endpointOut.endpointNumber,
        packetSize: endpointIn.packetSize || 64,
      };
    }
  }
  if (!data) {
    throw new Error(
      "This USB device has no CDC ACM data interface. Use Web Serial when the operating system already exposes the board as a serial port.",
    );
  }
  data.commInterface = commInterface ?? data.dataInterface;
  return data;
}
