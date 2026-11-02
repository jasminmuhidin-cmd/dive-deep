"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { Submission } from "@/lib/types";
import Ethos from "@/components/Ethos";
import { SiteFooter, SiteHeader } from "@/components/SiteNav";

const MAX_WORDS = 50;
/** How long the screen wobbles after a ripple is sent (ms) */
const RIPPLE_MS = 1800;

type Ripple = { id: number; x: number; y: number };

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Keep at most `max` words; preserves spaces while typing under the limit. */
function limitToWords(value: string, max: number) {
  const matches = [...value.matchAll(/\S+/g)];
  if (matches.length <= max) return value;
  const last = matches[max - 1];
  return value.slice(0, last.index! + last[0].length);
}

export default function KioskFlow() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<
    (Submission & {
      receipt_url?: string;
      imessage?: { ok: boolean; to?: string; error?: string };
    }) | null
  >(null);
  const words = useMemo(() => wordCount(text), [text]);
  const reduced = useReducedMotion();
  const sendRef = useRef<HTMLButtonElement>(null);
  const [ripple, setRipple] = useState<Ripple | null>(null);

  /** Ripple the whole screen out from the send button, like a stone dropped in water */
  function makeWaves() {
    if (reduced) return;
    const r = sendRef.current?.getBoundingClientRect();
    setRipple({
      id: Date.now(),
      x: r ? r.left + r.width / 2 : window.innerWidth / 2,
      y: r ? r.top + r.height / 2 : window.innerHeight / 2,
    });
  }

  async function sendRipple() {
    if (!text.trim() || submitting || words > MAX_WORDS) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worry_text: text.trim(),
          category: "unspecified",
          theme: "unspecified",
          feeling_tag: "quiet",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not send ripple");
      }
      const created = (await res.json()) as Submission & {
        receipt_url?: string;
        imessage?: { ok: boolean; to?: string; error?: string };
      };
      makeWaves();
      setDone(created);
      setText("");

      try {
        const receiptRes = await fetch(`/api/receipts/${created.id}`);
        if (receiptRes.ok) {
          const blob = await receiptRes.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `receipt-${created.anonymous_code || created.id.slice(0, 8)}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }
      } catch {
        // best-effort download
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* outside <main>: its filter would otherwise pin the rings to it rather than the screen */}
      {ripple && <ScreenRipple key={ripple.id} ripple={ripple} onDone={() => setRipple(null)} />}
      <main
        className="relative flex min-h-screen flex-col text-ink"
        style={{ filter: ripple ? "url(#kiosk-ripple)" : undefined }}
      >
        <div className="ocean-bg pointer-events-none absolute inset-0 deep-dive-bg" />
        <div
          className="pointer-events-none absolute left-1/2 top-1/3 h-[40vmin] w-[40vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(75,144,141,0.2) 0%, transparent 70%)",
          }}
        />
        <SiteHeader />

        <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-12">
          <AnimatePresence mode="wait">
            {!done ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-col"
              >
                <p className="font-serif text-2xl tracking-tight text-foam/90">
                  deep dive
                </p>
                <div
                  className="mt-2 h-1 w-20 rounded-full"
                  style={{
                    background: "linear-gradient(90deg, #4b908d, #147a90)",
                  }}
                  aria-hidden
                />

                <h1 className="mt-12 font-serif text-3xl leading-snug text-foam md:text-4xl">
                  What is a quiet weight or worry you carry about our world?
                </h1>

                <textarea
                  value={text}
                  onChange={(e) =>
                    setText(limitToWords(e.target.value, MAX_WORDS))
                  }
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.shiftKey) return;
                    e.preventDefault();
                    void sendRipple();
                  }}
                  rows={5}
                  className="mt-8 w-full resize-none rounded-2xl border border-seafoam/25 bg-navy/40 px-5 py-4 text-lg leading-relaxed text-foam placeholder:text-foam/30 focus:border-seafoam/60 focus:outline-none"
                  placeholder=""
                  autoFocus
                />
                <p className="mt-2 self-end text-[13px] text-foam/45">
                  {words}/{MAX_WORDS} words
                </p>

                {error && (
                  <p className="mt-4 text-sm text-rose" role="alert">
                    {error}
                  </p>
                )}

                <button
                  ref={sendRef}
                  type="button"
                  disabled={!text.trim() || submitting}
                  onClick={sendRipple}
                  className="mt-8 min-h-14 w-full rounded-full bg-sand px-8 py-4 text-lg text-navy transition hover:bg-glow disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seafoam md:w-auto"
                >
                  {submitting ? "Sending…" : "Send ripple"}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                // surfaces once the water has mostly settled
                transition={{ duration: 0.9, delay: reduced ? 0 : 0.9, ease: "easeOut" }}
                className="flex flex-col items-start"
              >
                <p className="font-serif text-3xl text-foam md:text-4xl">
                  Your ripple is in the water.
                </p>
                <p className="mt-4 text-lg leading-relaxed text-foam/70">
                  It&apos;s drifting out to the projection now. Dive in to find it among what others
                  have left, or send another.
                </p>
                <p className="mt-4 text-foam/55">
                  Code{" "}
                  <span className="font-sans text-foam">
                    {done.anonymous_code}
                  </span>
                </p>
                <div className="mt-10 flex w-full flex-col gap-3 sm:flex-row">
                  <Link
                    href={`/mobile?thought=${encodeURIComponent(done.id)}`}
                    className="min-h-14 rounded-full bg-sand px-8 py-4 text-center text-lg text-navy transition hover:bg-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seafoam"
                  >
                    Dive in
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDone(null)}
                    className="min-h-14 rounded-full border border-foam/25 px-8 py-4 text-lg text-foam transition hover:border-foam/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seafoam"
                  >
                    Send another
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <Ethos />
        <SiteFooter />
      </main>
    </>
  );
}

/**
 * The screen answers a sent ripple: rings spread out from the button across
 * the whole screen while everything on it wobbles like a disturbed surface,
 * then settles. The wobble is an SVG displacement filter (applied to <main>
 * by id) whose strength is driven frame by frame.
 */
function ScreenRipple({ ripple, onDone }: { ripple: Ripple; onDone: () => void }) {
  const mapRef = useRef<SVGFEDisplacementMapElement>(null);
  const noiseRef = useRef<SVGFETurbulenceElement>(null);
  // held in a ref so a re-render mid-ripple (the result arriving) doesn't restart it
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / RIPPLE_MS);
      // swells fast, then eases away
      const strength = Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t) * 34;
      mapRef.current?.setAttribute("scale", strength.toFixed(2));
      // the noise drifts so the wobble travels rather than flickers
      noiseRef.current?.setAttribute("seed", String(Math.floor(t * 6)));
      noiseRef.current?.setAttribute("baseFrequency", `${(0.012 - t * 0.006).toFixed(4)} ${(0.03 - t * 0.012).toFixed(4)}`);
      if (t < 1) raf = requestAnimationFrame(frame);
      else onDoneRef.current();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // far enough for the outermost ring to clear every corner
  const reach = Math.hypot(Math.max(ripple.x, window.innerWidth - ripple.x), Math.max(ripple.y, window.innerHeight - ripple.y));

  return (
    <>
      <svg width={0} height={0} className="absolute" aria-hidden focusable="false">
        <filter id="kiosk-ripple" x="0" y="0" width="100%" height="100%">
          <feTurbulence ref={noiseRef} type="fractalNoise" baseFrequency="0.012 0.03" numOctaves={2} seed={0} result="noise" />
          <feDisplacementMap ref={mapRef} in="SourceGraphic" in2="noise" scale={0} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="absolute rounded-full border-2 border-foam/60"
            style={{
              left: ripple.x - reach,
              top: ripple.y - reach,
              width: reach * 2,
              height: reach * 2,
              boxShadow: "0 0 24px rgba(174,245,233,0.35), inset 0 0 24px rgba(174,245,233,0.25)",
            }}
            initial={{ scale: 0, opacity: 0.9 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 1.6, delay: i * 0.18, ease: [0.2, 0.6, 0.35, 1] }}
          />
        ))}
      </div>
    </>
  );
}
