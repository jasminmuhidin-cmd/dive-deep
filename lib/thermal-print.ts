/**
 * Printing to the Bluetooth thermal printer (YHK-30A2, sold at Kmart as Anko,
 * normally driven by the WalkPrint app) straight from the browser, with Web
 * Bluetooth. Works in Chrome or Edge on a Mac, Windows or Android, over https
 * or localhost; not on iPhone or iPad.
 *
 * The printer sits behind a Microchip "transparent UART" Bluetooth chip, which
 * passes bytes straight through; we speak ESC/POS to it and send images as
 * GS v 0 raster bands.
 */

/** The chip's pass-through service */
const SERVICE = "49535343-fe7d-4ae5-8fa9-9fafd205e455";

// Just enough of the Web Bluetooth API for this file (TypeScript doesn't ship its types)
type Characteristic = {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean; notify: boolean; indicate: boolean };
  value?: DataView;
  writeValueWithResponse(data: BufferSource): Promise<void>;
  writeValueWithoutResponse(data: BufferSource): Promise<void>;
  startNotifications(): Promise<Characteristic>;
  addEventListener(type: "characteristicvaluechanged", listener: () => void): void;
};
type BluetoothDeviceLike = {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryService(uuid: string): Promise<{ getCharacteristics(): Promise<Characteristic[]> }>;
    }>;
    disconnect(): void;
  };
};
type BluetoothLike = {
  requestDevice(options: {
    filters?: { namePrefix?: string; services?: string[] }[];
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }): Promise<BluetoothDeviceLike>;
  /** Printers this site was given before; not in every version of Chrome */
  getDevices?(): Promise<BluetoothDeviceLike[]>;
};

const bluetooth = () => (navigator as unknown as { bluetooth: BluetoothLike }).bluetooth;

export type PrintSettings = {
  /** Dots across the print head: 384 on most 58mm printers, 576 on 80mm */
  width: number;
  /** Bytes per Bluetooth write */
  chunk: number;
  /**
   * How fast to send, in rows of dots a second (8 rows = 1mm of paper). The
   * printer has only a small buffer, so sending faster than it prints
   * overflows it and the print stalls and garbles; this keeps the two in step.
   */
  speed: number;
  /** Wait for the printer's Bluetooth chip to confirm each write before the next: slower, but nothing gets dropped */
  confirm: boolean;
  /** Lighter (lower) to darker (higher), 0–255: where grey turns into a black dot */
  threshold: number;
  /** Which of the common ways of sending an image this printer understands */
  mode: ImageMode;
};

/**
 * - bands: GS v 0 raster, a band of 64 rows at a time
 * - whole: GS v 0 raster, the whole image in one command
 * - columns: ESC * bit image, 24 rows at a time (older printers)
 */
export const IMAGE_MODES = ["bands", "whole", "columns"] as const;
export type ImageMode = (typeof IMAGE_MODES)[number];

export const DEFAULT_SETTINGS: PrintSettings = {
  // tested on the YHK-30A2: the fastest settings that print a whole receipt cleanly
  width: 384,
  chunk: 180,
  speed: 160,
  confirm: true,
  threshold: 150,
  mode: "bands",
};

export function bluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export type Printer = {
  name: string;
  /** The Bluetooth channels the printer offers, and which one we write to, for diagnosing */
  readonly channels: string;
  /** Still linked over Bluetooth (sending reconnects by itself if not) */
  readonly connected: boolean;
  /** Sends a job paced to the print speed; `onProgress` gets the share sent so far, 0–1 */
  send(bytes: Uint8Array, settings: PrintSettings, onProgress?: (share: number) => void): Promise<void>;
  disconnect(): void;
};

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");

/**
 * Chrome's Bluetooth picker, then a connection. Must run from a tap or click.
 * Anything the printer says back (out of paper, too hot, buffer full) is passed to `onReply` as hex.
 */
export async function connectPrinter(onReply?: (hexBytes: string) => void): Promise<Printer> {
  const device = await bluetooth().requestDevice({
    filters: [{ namePrefix: "YHK" }, { services: [SERVICE] }],
    optionalServices: [SERVICE],
  });
  return openPrinter(device, onReply);
}

/**
 * The printer this site was given last time, connected without asking — so a
 * reloaded kiosk can print again without anyone tapping Connect. Null when
 * Chrome doesn't remember it, or it's switched off or out of range.
 */
export async function reconnectPrinter(onReply?: (hexBytes: string) => void): Promise<Printer | null> {
  const known = (await bluetooth().getDevices?.().catch(() => [])) ?? [];
  const device = known.find((d) => d.name?.startsWith("YHK"));
  if (!device) return null;
  return Promise.race([
    openPrinter(device, onReply).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 8000)),
  ]);
}

async function openPrinter(device: BluetoothDeviceLike, onReply?: (hexBytes: string) => void): Promise<Printer> {
  let out: Characteristic | null = null;
  let channels = "";

  // (re)connect and find the channel to write to; run again whenever the link has dropped
  async function link() {
    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(SERVICE);
    const chars = await service.getCharacteristics();
    const writable = chars.find((c) => c.properties.writeWithoutResponse || c.properties.write);
    if (!writable) throw new Error("The printer has no channel to write to.");
    for (const c of chars.filter((c) => c.properties.notify || c.properties.indicate)) {
      c.addEventListener("characteristicvaluechanged", () => {
        if (c.value) onReply?.(hex(new Uint8Array(c.value.buffer, c.value.byteOffset, c.value.byteLength)));
      });
      await c.startNotifications().catch(() => {});
    }
    channels = chars
      .map((c) => {
        const p = c.properties;
        const can = [p.write && "write", p.writeWithoutResponse && "write-fast", p.notify && "notify", p.indicate && "indicate"];
        return `${c.uuid.slice(0, 8)} [${can.filter(Boolean).join(", ")}]${c === writable ? " ← sending here" : ""}`;
      })
      .join("\n");
    out = writable;
  }
  await link();

  return {
    name: device.name ?? "printer",
    get channels() {
      return channels;
    },
    get connected() {
      return Boolean(device.gatt?.connected);
    },
    async send(bytes, { chunk, speed, confirm, width }, onProgress) {
      if (!device.gatt?.connected || !out) await link();
      const ch = out!;
      const confirmed = ch.properties.write && (confirm || !ch.properties.writeWithoutResponse);
      // a row of dots is width / 8 bytes, so this is how many bytes the printer gets through a second
      const perSecond = Math.max(1, speed) * Math.max(1, Math.floor(width / 8));
      const started = performance.now();
      for (let i = 0; i < bytes.length; i += chunk) {
        const part = bytes.slice(i, i + chunk);
        if (confirmed) await ch.writeValueWithResponse(part);
        else await ch.writeValueWithoutResponse(part);
        // hold back until the printer has had time to print what's been sent
        const due = ((i + part.length) / perSecond) * 1000 - (performance.now() - started);
        if (due > 0) await new Promise((r) => setTimeout(r, due));
        onProgress?.((i + part.length) / bytes.length);
      }
    },
    disconnect: () => device.gatt?.disconnect(),
  };
}

const ESC = 0x1b;
const GS = 0x1d;

/** Plain text in the printer's own font, then a few blank lines to clear the tear bar */
export function textJob(text: string): Uint8Array {
  const body = new TextEncoder().encode(text.replace(/[^\x20-\x7e\n]/g, "?") + "\n");
  return new Uint8Array([ESC, 0x40, ...body, ESC, 0x64, 4]);
}

/**
 * An image as a print job: scaled to the print head's width, turned into black
 * dots by error diffusion (so greys come out as finer or coarser stippling),
 * and set out in the chosen image mode.
 */
export function imageJob(source: CanvasImageSource & { width: number; height: number }, settings: PrintSettings): Uint8Array {
  const { bits, width, height } = dither(source, settings);
  return encode(bits, width, height, settings.mode);
}

/** An image as the printer's black and white dots: 1 bit a dot, rows of `width / 8` bytes, left dot in the high bit */
export function dither(source: CanvasImageSource & { width: number; height: number }, settings: PrintSettings) {
  // the printer takes whole bytes of dots across
  const width = Math.max(8, Math.floor(settings.width / 8) * 8);
  const height = Math.round((source.height / source.width) * width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  // greyscale, then Floyd–Steinberg down to black and white
  const grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i++) grey[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  const rowBytes = width / 8;
  const bits = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const black = grey[i] < settings.threshold;
      const err = grey[i] - (black ? 0 : 255);
      if (black) bits[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      if (x + 1 < width) grey[i + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) grey[i + width - 1] += (err * 3) / 16;
        grey[i + width] += (err * 5) / 16;
        if (x + 1 < width) grey[i + width + 1] += err / 16;
      }
    }
  }

  return { bits, width, height };
}

/** Black-and-white rows (1 bit a dot, left dot in the high bit) as printer commands */
function encode(bits: Uint8Array, width: number, height: number, mode: ImageMode): Uint8Array {
  const rowBytes = width / 8;
  const parts: number[] = [ESC, 0x40];
  const dot = (x: number, y: number) => y < height && (bits[y * rowBytes + (x >> 3)] & (0x80 >> (x & 7))) !== 0;

  if (mode === "columns") {
    // line spacing of exactly 24 dots, so the bands meet without gaps
    parts.push(ESC, 0x33, 24);
    for (let top = 0; top < height; top += 24) {
      parts.push(ESC, 0x2a, 33, width & 0xff, width >> 8);
      for (let x = 0; x < width; x++) {
        for (let k = 0; k < 3; k++) {
          let byte = 0;
          for (let b = 0; b < 8; b++) if (dot(x, top + k * 8 + b)) byte |= 0x80 >> b;
          parts.push(byte);
        }
      }
      parts.push(0x0a);
    }
    parts.push(ESC, 0x32);
  } else {
    const band = mode === "whole" ? height : 64;
    for (let top = 0; top < height; top += band) {
      const rows = Math.min(band, height - top);
      parts.push(GS, 0x76, 0x30, 0, rowBytes & 0xff, rowBytes >> 8, rows & 0xff, rows >> 8);
      for (const b of bits.subarray(top * rowBytes, (top + rows) * rowBytes)) parts.push(b);
    }
  }
  parts.push(ESC, 0x64, 4);
  return new Uint8Array(parts);
}

/**
 * A short, easy-to-read test: a solid black bar, then a checkerboard, about
 * 1.5cm in all. Quick to send, and obvious whether it worked.
 */
export function patternJob(settings: PrintSettings): Uint8Array {
  const width = Math.max(8, Math.floor(settings.width / 8) * 8);
  const height = 120;
  const rowBytes = width / 8;
  const bits = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const black = y < 48 || ((x >> 4) + (y >> 4)) % 2 === 0;
      if (black) bits[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return encode(bits, width, height, settings.mode);
}

/** An image from a URL, ready to print */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}
