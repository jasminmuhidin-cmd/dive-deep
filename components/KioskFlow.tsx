"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Submission } from "@/lib/types";

export default function KioskFlow() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Submission | null>(null);

  async function sendRipple() {
    if (!text.trim() || submitting) return;
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
      const created = (await res.json()) as Submission;
      setDone(created);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col text-ink">
      <div className="ocean-bg pointer-events-none absolute inset-0" />
      <div
        className="ocean-ripple-pulse pointer-events-none absolute left-1/2 top-1/3 h-[40vmin] w-[40vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(94,176,192,0.2) 0%, transparent 70%)",
        }}
      />

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
                  background: "linear-gradient(90deg, #1a5f6e, #5eb0c0)",
                }}
                aria-hidden
              />

              <h1 className="mt-12 font-serif text-3xl leading-snug text-foam md:text-4xl">
                What is a quiet weight or worry you carry about our world?
              </h1>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 500))}
                rows={5}
                className="mt-8 w-full resize-none rounded-2xl border border-ripple/25 bg-ocean-mid/50 px-5 py-4 text-lg leading-relaxed text-foam placeholder:text-mist/40 focus:border-ripple/60 focus:outline-none"
                placeholder=""
                autoFocus
              />
              <p className="mt-2 self-end font-mono text-xs text-mist/50">
                {text.length}/500
              </p>

              {error && (
                <p className="mt-4 text-sm text-rose" role="alert">
                  {error}
                </p>
              )}

              <button
                type="button"
                disabled={!text.trim() || submitting}
                onClick={sendRipple}
                className="mt-8 min-h-14 w-full rounded-full bg-ripple px-8 py-4 text-lg text-ocean-deep transition hover:bg-foam disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foam md:w-auto"
              >
                {submitting ? "Sending…" : "Send ripple"}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-start"
            >
              <p className="font-serif text-3xl text-foam md:text-4xl">
                Your ripple is in the water.
              </p>
              <p className="mt-4 text-mist">
                Code{" "}
                <span className="font-mono text-foam">
                  {done.anonymous_code}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setDone(null)}
                className="mt-10 min-h-12 rounded-full border border-ripple/40 px-6 py-3 text-foam transition hover:border-foam/50"
              >
                Send another
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
