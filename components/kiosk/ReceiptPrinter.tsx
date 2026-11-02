"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  bluetoothSupported,
  connectPrinter,
  DEFAULT_SETTINGS,
  imageJob,
  loadImage,
  reconnectPrinter,
  type Printer,
} from "@/lib/thermal-print";

type PrinterState = "unsupported" | "off" | "connecting" | "ready" | "printing" | "error";

/**
 * The Bluetooth receipt printer, for the kiosk: reconnects by itself to a
 * printer it was given before, and prints a thought's receipt in the
 * background, one at a time, while the visitor carries on.
 */
export function useReceiptPrinter() {
  const [state, setState] = useState<PrinterState>("connecting");
  const [message, setMessage] = useState("");
  const printer = useRef<Printer | null>(null);
  // prints wait their turn, so two quick submissions never interleave on the paper
  const queue = useRef<Promise<void>>(Promise.resolve());

  // a printer this site was given before reconnects by itself
  useEffect(() => {
    let cancelled = false;
    const supported = bluetoothSupported();
    (supported ? reconnectPrinter() : Promise.resolve(null)).then((p) => {
      if (cancelled) return p?.disconnect();
      printer.current = p;
      setState(!supported ? "unsupported" : p ? "ready" : "off");
    });
    return () => {
      cancelled = true;
      printer.current?.disconnect();
    };
  }, []);

  /** Chrome's picker; must come from a tap */
  const connect = useCallback(async () => {
    setState("connecting");
    setMessage("");
    try {
      printer.current?.disconnect();
      printer.current = await connectPrinter();
      setState("ready");
    } catch (err) {
      printer.current = null;
      setState("off");
      // closing the picker without choosing isn't worth a message
      if (err instanceof Error && err.name !== "NotFoundError") setMessage(err.message);
    }
  }, []);

  /**
   * Print a receipt image (any URL, including a blob: the kiosk already has)
   * once the ones before it are done; never throws. Does nothing without a printer.
   */
  const printImage = useCallback((src: string) => {
    queue.current = queue.current.then(async () => {
      const p = printer.current;
      if (!p) return;
      setState("printing");
      try {
        const img = await loadImage(src);
        await p.send(imageJob(img, DEFAULT_SETTINGS), DEFAULT_SETTINGS);
        setState("ready");
        setMessage("");
      } catch (err) {
        console.error("[printer]", err);
        setState("error");
        setMessage(err instanceof Error ? err.message : "The receipt didn't print.");
      }
    });
  }, []);

  /** Print a saved thought's receipt, drawn by the server */
  const print = useCallback((submissionId: string) => printImage(`/api/receipts/${submissionId}`), [printImage]);

  return { state, message, connect, print, printImage };
}

const LABELS: Record<PrinterState, string> = {
  unsupported: "Printing needs Chrome",
  off: "Connect printer",
  connecting: "Connecting…",
  ready: "Printer ready",
  printing: "Printing…",
  error: "Printer error · reconnect",
};

/**
 * A small, quiet control in the corner for whoever sets up the kiosk: shows
 * whether the printer is linked, and connects it with a tap. Low-key on
 * purpose, so visitors pass it by.
 */
export function PrinterButton({
  state,
  message,
  connect,
}: Pick<ReturnType<typeof useReceiptPrinter>, "state" | "message" | "connect">) {
  const canConnect = state === "off" || state === "error";
  const dot = state === "ready" || state === "printing" ? "#3fae6a" : state === "error" ? "#d4483b" : "#9aa3ad";
  return (
    <div className="fixed bottom-3 left-3 z-40 flex flex-col items-start gap-1 text-[13px] text-[var(--ink)]">
      <button
        type="button"
        onClick={canConnect ? connect : undefined}
        disabled={!canConnect}
        title={message || undefined}
        className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition ${
          canConnect ? "bg-white/70 opacity-90 hover:opacity-100" : "opacity-45"
        }`}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} aria-hidden />
        {LABELS[state]}
      </button>
      {message && state === "error" && <span className="max-w-[18rem] rounded bg-white/80 px-2 py-1">{message}</span>}
    </div>
  );
}
