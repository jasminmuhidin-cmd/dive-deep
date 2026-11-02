"use client";

import { useRef, useState } from "react";
import {
  bluetoothSupported,
  connectPrinter,
  DEFAULT_SETTINGS,
  dither,
  IMAGE_MODES,
  imageJob,
  loadImage,
  patternJob,
  textJob,
  type ImageMode,
  type Printer,
  type PrintSettings,
} from "@/lib/thermal-print";

const MODE_LABELS: Record<ImageMode, string> = {
  bands: "A: raster in small bands",
  whole: "B: raster in one go",
  columns: "C: column image (older printers)",
};

/**
 * A bench for the Bluetooth receipt printer: connect, try each way of sending
 * an image with a quick test pattern, then print a real receipt and tune the
 * width, darkness and send speed until it comes out right.
 */
export default function PrintTestPage() {
  const [printer, setPrinter] = useState<Printer | null>(null);
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_SETTINGS);
  const [log, setLog] = useState<string[]>(["Not connected."]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);

  const note = (line: string) => setLog((l) => [...l, line]);

  async function run(label: string, job: () => Promise<void>) {
    setBusy(true);
    note(`${label}…`);
    const started = performance.now();
    try {
      await job();
      note(`${label}: sent in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
    } catch (err) {
      note(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  /** The newest thought's receipt, as the kiosk would print it, or the example one if there are no thoughts yet */
  async function latestReceipt() {
    const subs: { id: string; created_at: string }[] = await (await fetch("/api/submissions")).json();
    const newest = subs.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const img = await loadImage(newest ? `/api/receipts/${newest.id}` : "/api/receipts/example");
    note(`Loaded ${newest ? `the receipt for "${newest.id.slice(0, 8)}…"` : "the example receipt"} (${img.width}×${img.height}).`);
    return img;
  }

  /** Exactly the dots that will print, drawn back out as pixels */
  function drawPreview(img: HTMLImageElement) {
    const canvas = preview.current;
    if (!canvas) return;
    const { bits, width, height } = dither(img, settings);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const out = ctx.createImageData(width, height);
    const rowBytes = width / 8;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const black = bits[y * rowBytes + (x >> 3)] & (0x80 >> (x & 7));
        const i = (y * width + x) * 4;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = black ? 0 : 255;
        out.data[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  async function send(bytes: Uint8Array) {
    if (!printer) throw new Error("Connect the printer first.");
    const rows = bytes.length / Math.floor(settings.width / 8);
    note(
      `Sending ${bytes.length.toLocaleString()} bytes, about ${Math.ceil(rows / settings.speed)}s ` +
        `[method ${MODE_LABELS[settings.mode][0]}, speed ${settings.speed}, chunk ${settings.chunk}, ` +
        `confirm ${settings.confirm ? "on" : "off"}, width ${settings.width}, darkness ${settings.threshold}]`,
    );
    setProgress(0);
    try {
      await printer.send(bytes, settings, setProgress);
    } finally {
      setProgress(null);
    }
  }

  const field = (key: "width" | "threshold" | "chunk" | "speed", label: string, hint: string) => (
    <label className="flex flex-col gap-1">
      <span className="font-bold">{label}</span>
      <input
        type="number"
        value={settings[key]}
        onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))}
        className="rounded border border-black/30 px-2 py-1"
      />
      <span className="text-sm opacity-70">{hint}</span>
    </label>
  );

  const button = "rounded-full bg-black px-5 py-3 text-white disabled:opacity-40";

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-black">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <h1 className="text-2xl font-bold">Printer test</h1>

        {!bluetoothSupported() && (
          <p className="rounded bg-red-100 p-3">
            This browser can&apos;t use Bluetooth. Open this page in Chrome or Edge on a Mac, Windows or Android.
          </p>
        )}

        <ol className="list-decimal space-y-1 pl-5">
          <li>Turn the printer on and close WalkPrint, so it isn&apos;t holding the printer.</li>
          <li>Connect, and pick YHK-30A2 from the list.</li>
          <li>Print the test pattern with method A, then B, then C. Note which one prints a black bar and a checkerboard.</li>
          <li>With that method chosen, print the latest receipt and adjust the settings until it looks right.</li>
        </ol>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={button}
            disabled={busy || !bluetoothSupported()}
            onClick={() =>
              run("Connecting", async () => {
                printer?.disconnect();
                const p = await connectPrinter((reply) => note(`Printer replied: ${reply}`));
                setPrinter(p);
                note(`Connected to ${p.name}. Channels:\n${p.channels}`);
              })
            }
          >
            {printer ? `Connected: ${printer.name}` : "Connect printer"}
          </button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-bold">How to send images</legend>
          {IMAGE_MODES.map((mode) => (
            <label key={mode} className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={settings.mode === mode}
                onChange={() => setSettings((s) => ({ ...s, mode }))}
              />
              {MODE_LABELS[mode]}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <button type="button" className={button} disabled={busy || !printer} onClick={() => run("Test pattern", () => send(patternJob(settings)))}>
            Print test pattern
          </button>
          <button
            type="button"
            className={button}
            disabled={busy || !printer}
            onClick={() =>
              run("Latest receipt", async () => {
                const img = await latestReceipt();
                drawPreview(img);
                await send(imageJob(img, settings));
              })
            }
          >
            Print latest receipt
          </button>
          <button
            type="button"
            className="rounded-full border border-black px-5 py-3 disabled:opacity-40"
            disabled={busy || !printer}
            onClick={() => run("Test line", () => send(textJob("dive deep printer test\n0123456789")))}
          >
            Print text line
          </button>
          <button
            type="button"
            className="rounded-full border border-black px-5 py-3 disabled:opacity-40"
            disabled={busy}
            onClick={() => run("Preview", async () => drawPreview(await latestReceipt()))}
          >
            Preview only
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {field("width", "Width (dots)", "384 for 58mm paper. Try 576 if it prints only the left part.")}
          {field("threshold", "Darkness", "0–255. Higher prints darker.")}
          {field("speed", "Speed (rows a second)", "Lower it if the print stops or garbles partway. 8 rows = 1mm.")}
          {field("chunk", "Chunk size (bytes)", "Try 20 if it still garbles at a low speed.")}
          <label className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.confirm}
              onChange={(e) => setSettings((s) => ({ ...s, confirm: e.target.checked }))}
            />
            <span>
              <span className="font-bold">Confirm each write</span>
              <span className="block text-sm opacity-70">Slower, but no data gets lost on the way. Untick to test if it&apos;s too slow.</span>
            </span>
          </label>
        </div>

        {progress !== null && (
          <div className="flex items-center gap-3">
            <progress value={progress} max={1} className="flex-1" />
            <span className="tabular-nums">{Math.round(progress * 100)}%</span>
          </div>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Log</h2>
            <button
              type="button"
              className="text-sm underline"
              onClick={() => navigator.clipboard?.writeText(log.join("\n"))}
            >
              Copy log
            </button>
          </div>
          <pre role="log" className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-black/5 p-3 text-sm">
            {log.join("\n")}
          </pre>
        </section>

        <figure className="flex flex-col gap-2">
          <figcaption className="font-bold">What will print, dot for dot</figcaption>
          <canvas ref={preview} className="w-full max-w-[384px] border border-black/20 [image-rendering:pixelated]" />
        </figure>
      </div>
    </main>
  );
}
