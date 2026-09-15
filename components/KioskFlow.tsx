"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type Submission,
} from "@/lib/types";

type Step = "welcome" | "worry" | "offering" | "review" | "receipt";

const IDLE_RESET_MS = 10_000;

export default function KioskFlow() {
  const [step, setStep] = useState<Step>("welcome");
  const [worry, setWorry] = useState("");
  const [offering, setOffering] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("welcome");
    setWorry("");
    setOffering("");
    setCategory(null);
    setSubmission(null);
    setQrDataUrl(null);
    setSubmitting(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (step !== "receipt") return;

    let timer = window.setTimeout(reset, IDLE_RESET_MS);

    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(reset, IDLE_RESET_MS);
    };

    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [step, reset]);

  const stewardUrl = useMemo(() => {
    if (!submission) return "";
    const base =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
      (typeof window !== "undefined" ? window.location.origin : "");
    return `${base}/steward/${submission.id}`;
  }, [submission]);

  useEffect(() => {
    if (!stewardUrl) return;
    QRCode.toDataURL(stewardUrl, {
      width: 220,
      margin: 1,
      color: { dark: "#1c1916", light: "#f3eee6" },
    }).then(setQrDataUrl);
  }, [stewardUrl]);

  async function handleSubmit() {
    if (!category || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worry_text: worry,
          offering_text: offering,
          category,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not release your words");
      }

      const created = (await res.json()) as Submission;
      setSubmission(created);

      await fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: created.id }),
      });

      setStep("receipt");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-cream text-ink">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, #ebe2d4 0%, transparent 55%), linear-gradient(180deg, #f3eee6 0%, #e9e1d4 100%)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 md:py-14">
        <header className="mb-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-stone">
            Shared Burdens
          </p>
        </header>

        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <StepPanel key="welcome">
              <h1 className="font-serif text-4xl leading-tight text-charcoal md:text-5xl">
                Take a breath. You are not carrying this alone.
              </h1>
              <p className="mt-6 max-w-md text-lg text-stone">
                Leave a quiet worry, offer one small thing, and release it into
                the collective wall.
              </p>
              <button
                type="button"
                onClick={() => setStep("worry")}
                className="mt-12 min-h-14 w-full rounded-sm bg-charcoal px-6 py-4 text-lg text-cream transition hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm md:w-auto"
              >
                Begin
              </button>
            </StepPanel>
          )}

          {step === "worry" && (
            <StepPanel key="worry">
              <h2 className="font-serif text-3xl leading-snug text-charcoal md:text-4xl">
                What is a quiet weight or worry you carry about our world?
              </h2>
              <label className="mt-8 block">
                <span className="sr-only">Your worry</span>
                <textarea
                  value={worry}
                  onChange={(e) => setWorry(e.target.value.slice(0, 280))}
                  rows={5}
                  placeholder="A quiet worry you carry…"
                  className="w-full resize-none rounded-sm border border-charcoal/15 bg-cream/80 px-4 py-4 text-lg leading-relaxed text-ink placeholder:text-stone/60 focus:border-warm focus:outline-none"
                  autoFocus
                />
              </label>
              <p className="mt-2 font-mono text-xs text-stone">
                {worry.length}/280
              </p>

              <fieldset className="mt-8">
                <legend className="mb-3 text-sm text-stone">Theme</legend>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`min-h-11 rounded-sm border px-4 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm ${
                        category === c
                          ? "border-charcoal bg-charcoal text-cream"
                          : "border-charcoal/20 bg-transparent text-charcoal hover:border-charcoal/40"
                      }`}
                    >
                      {CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
              </fieldset>

              <NavRow
                back={() => setStep("welcome")}
                next={() => setStep("offering")}
                nextDisabled={!worry.trim() || !category}
                nextLabel="Continue"
              />
            </StepPanel>
          )}

          {step === "offering" && (
            <StepPanel key="offering">
              <h2 className="font-serif text-3xl leading-snug text-charcoal md:text-4xl">
                What is one small thing you can offer someone carrying this same
                weight?
              </h2>
              <label className="mt-8 block">
                <span className="sr-only">Your offering</span>
                <textarea
                  value={offering}
                  onChange={(e) => setOffering(e.target.value.slice(0, 280))}
                  rows={5}
                  placeholder="Words of comfort, a local action, a willingness to listen…"
                  className="w-full resize-none rounded-sm border border-charcoal/15 bg-cream/80 px-4 py-4 text-lg leading-relaxed text-ink placeholder:text-stone/60 focus:border-warm focus:outline-none"
                  autoFocus
                />
              </label>
              <p className="mt-2 font-mono text-xs text-stone">
                {offering.length}/280
              </p>
              <NavRow
                back={() => setStep("worry")}
                next={() => setStep("review")}
                nextDisabled={!offering.trim()}
                nextLabel="Review"
              />
            </StepPanel>
          )}

          {step === "review" && (
            <StepPanel key="review">
              <h2 className="font-serif text-3xl text-charcoal md:text-4xl">
                Ready to release?
              </h2>
              <div className="mt-8 space-y-6 border-y border-charcoal/10 py-6">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone">
                    Worry · {category ? CATEGORY_LABELS[category] : ""}
                  </p>
                  <p className="mt-2 text-lg leading-relaxed text-charcoal">
                    {worry}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone">
                    Offering
                  </p>
                  <p className="mt-2 text-lg leading-relaxed text-charcoal">
                    {offering}
                  </p>
                </div>
              </div>
              {error && (
                <p className="mt-4 text-sm text-red-800" role="alert">
                  {error}
                </p>
              )}
              <NavRow
                back={() => setStep("offering")}
                next={handleSubmit}
                nextDisabled={submitting}
                nextLabel={submitting ? "Releasing…" : "Release into the wall"}
              />
            </StepPanel>
          )}

          {step === "receipt" && submission && (
            <StepPanel key="receipt">
              <h2 className="font-serif text-3xl text-charcoal md:text-4xl">
                Thank you. Your words are part of the wall now.
              </h2>
              <p className="mt-3 text-stone">
                Take this artifact — or leave it for someone else to find.
              </p>

              <article className="mt-8 border border-charcoal/20 bg-cream/90 p-6 print:border-black">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone">
                  Collective Efficacy & Shared Burdens
                </p>
                <p className="mt-1 font-mono text-[10px] text-stone">
                  {new Date(submission.created_at).toLocaleString()}
                </p>
                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-stone">
                      Worry
                    </p>
                    <p className="mt-1 font-serif text-xl leading-snug text-charcoal">
                      {submission.worry_text}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-stone">
                      Offering
                    </p>
                    <p className="mt-1 text-base leading-relaxed text-charcoal">
                      {submission.offering_text}
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  {qrDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrDataUrl}
                      alt="QR code linking to stewardship page"
                      className="h-36 w-36"
                    />
                  )}
                  <p className="max-w-xs text-sm leading-relaxed text-stone">
                    Scan to steward this burden. Keep, trade, or gift this
                    artifact.
                  </p>
                </div>
              </article>

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-12 rounded-sm border border-charcoal/25 px-5 py-3 text-charcoal transition hover:border-charcoal/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
                >
                  Print receipt
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="min-h-12 rounded-sm bg-charcoal px-5 py-3 text-cream transition hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
                >
                  Start again
                </button>
              </div>
              <p className="mt-4 font-mono text-xs text-stone">
                Resets after {IDLE_RESET_MS / 1000}s of inactivity
              </p>
            </StepPanel>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function StepPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}

function NavRow({
  back,
  next,
  nextDisabled,
  nextLabel,
}: {
  back: () => void;
  next: () => void;
  nextDisabled?: boolean;
  nextLabel: string;
}) {
  return (
    <div className="mt-auto flex flex-wrap gap-3 pt-12">
      <button
        type="button"
        onClick={back}
        className="min-h-12 min-w-28 rounded-sm border border-charcoal/20 px-5 py-3 text-charcoal transition hover:border-charcoal/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
      >
        Back
      </button>
      <button
        type="button"
        onClick={next}
        disabled={nextDisabled}
        className="min-h-12 min-w-40 rounded-sm bg-charcoal px-5 py-3 text-cream transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
      >
        {nextLabel}
      </button>
    </div>
  );
}
