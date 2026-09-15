"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import {
  insightForFriction,
  type FrictionItem,
  type Submission,
} from "@/lib/types";
import FrictionBubbles from "@/components/onboarding/FrictionBubbles";
import FishTextVessel from "@/components/onboarding/FishTextVessel";
import DecorateCanvas from "@/components/onboarding/DecorateCanvas";

type Phase = "welcome" | "flow" | "decorate" | "artefact";

const IDLE_RESET_MS = 20_000;
const DEFAULT_FISH = "betta" as const;

export default function KioskFlow() {
  const [phase, setPhase] = useState<Phase>("welcome");
  const [thought, setThought] = useState("");
  const [whyText, setWhyText] = useState("");
  const [showWhy, setShowWhy] = useState(false);
  const [whySkipped, setWhySkipped] = useState(false);
  const [friction, setFriction] = useState<FrictionItem | null>(null);
  const [customFriction, setCustomFriction] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [exchange, setExchange] = useState<Submission | null>(null);
  const [printPreview, setPrintPreview] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const whyRef = useRef<HTMLElement>(null);
  const frictionRef = useRef<HTMLElement>(null);

  const resolvedFriction = useMemo(() => {
    if (!friction) return null;
    if (friction.id === "something_else" && customFriction.trim()) {
      return { id: friction.id, label: customFriction.trim() };
    }
    return friction;
  }, [friction, customFriction]);

  const insight = insightForFriction(resolvedFriction);

  const reset = useCallback(() => {
    setPhase("welcome");
    setThought("");
    setWhyText("");
    setShowWhy(false);
    setWhySkipped(false);
    setFriction(null);
    setCustomFriction("");
    setSubmission(null);
    setExchange(null);
    setPrintPreview(null);
    setQrDataUrl(null);
    setSubmitting(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (phase !== "artefact" || !submission) return;
    let timer = window.setTimeout(reset, IDLE_RESET_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(reset, IDLE_RESET_MS);
    };
    window.addEventListener("pointerdown", bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", bump);
    };
  }, [phase, submission, reset]);

  useEffect(() => {
    if (!submission) return;
    const base =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
      window.location.origin;
    QRCode.toDataURL(`${base}/steward/${submission.id}`, {
      width: 200,
      margin: 1,
      color: { dark: "#2d3651", light: "#f4efe4" },
    }).then(setQrDataUrl);
  }, [submission]);

  function start() {
    setPhase("flow");
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function goToWhy() {
    if (!thought.trim()) return;
    setShowWhy(true);
    requestAnimationFrame(() => {
      whyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function goToFriction(skipWhy: boolean) {
    if (skipWhy) {
      setWhyText("");
      setWhySkipped(true);
    } else {
      setWhySkipped(false);
    }
    setShowWhy(true);
    requestAnimationFrame(() => {
      frictionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleRelease() {
    if (!thought.trim() || !resolvedFriction || submitting) return;
    if (
      friction?.id === "something_else" &&
      !customFriction.trim()
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worry_text: thought,
          offering_text: "",
          category: "community",
          prompt_type: "care",
          fish_form: DEFAULT_FISH,
          why_text: whyText.trim() || null,
          frictions: [resolvedFriction],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not release");
      }

      const created = (await res.json()) as Submission;
      setSubmission(created);

      const exRes = await fetch(
        `/api/exchange?exclude=${encodeURIComponent(created.id)}&friction=${encodeURIComponent(resolvedFriction.id)}`,
      );
      if (exRes.ok) {
        setExchange((await exRes.json()) as Submission);
        setPhase("decorate");
      } else {
        // No exchange available — still show fish artefact
        setPhase("artefact");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecorateComplete(compositeDataUrl: string) {
    if (!submission) return;
    setPrintPreview(compositeDataUrl);
    try {
      await fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: submission.id,
          exchange_id: exchange?.id,
          composite_data_url: compositeDataUrl,
          insight,
        }),
      });
    } catch {
      // still continue
    }
    setPhase("artefact");
  }

  const canRelease =
    !!thought.trim() &&
    !!resolvedFriction &&
    !(friction?.id === "something_else" && !customFriction.trim());

  if (phase === "welcome") {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center px-6 text-foam">
        <div className="deep-dive-bg pointer-events-none absolute inset-0" />
        <div className="relative flex w-full max-w-3xl flex-col items-center text-center">
          <h1
            className="font-serif font-medium leading-none tracking-tight text-foam"
            style={{ fontSize: "clamp(3.5rem, 18vw, 9rem)" }}
          >
            deep dive
          </h1>
          <div
            className="mt-4 h-1.5 w-1/3 max-w-xs rounded-full"
            style={{
              background: "linear-gradient(90deg, #4b908d, #147a90, #c6979d)",
            }}
            aria-hidden
          />
          <p className="mt-8 max-w-md text-lg text-foam/70 md:text-xl">
            dive deep into what matters to you
          </p>
          <button
            type="button"
            onClick={start}
            className="mt-12 min-h-14 min-w-40 rounded-full bg-sand px-10 py-4 text-lg text-navy transition hover:bg-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seafoam"
          >
            Start
          </button>
        </div>
      </main>
    );
  }

  if (phase === "decorate" && exchange) {
    return (
      <main className="relative flex min-h-screen flex-col text-foam">
        <div className="deep-dive-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-8">
          <DecorateCanvas
            exchange={exchange}
            onBack={() => setPhase("flow")}
            onComplete={handleDecorateComplete}
          />
        </div>
      </main>
    );
  }

  if (phase === "artefact" && submission) {
    return (
      <main className="relative flex min-h-screen flex-col text-foam">
        <div className="deep-dive-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-5 py-10">
          <FishTextVessel
            form={submission.fish_form || DEFAULT_FISH}
            text={
              exchange?.worry_text || submission.worry_text
            }
            insight={insight}
            size={380}
          />
          <p className="mt-6 max-w-sm text-center text-sm text-foam/60">
            {insight}
          </p>
          {printPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={printPreview}
              alt="Print preview"
              className="mt-6 max-h-48 rounded-2xl border border-foam/10"
            />
          )}
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="QR to stewardship"
                className="h-28 w-28 rounded-lg bg-foam p-2"
              />
            )}
            <p className="max-w-[14rem] text-center text-sm text-foam/55 sm:text-left">
              Scan for a shared insight — someone feeling a similar way.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="mt-10 min-h-12 rounded-full bg-sand px-8 py-3 text-navy"
          >
            Start again
          </button>
        </div>
      </main>
    );
  }

  // Scroll flow
  return (
    <main className="relative h-screen text-foam">
      <div className="deep-dive-bg pointer-events-none absolute inset-0" />
      <div
        ref={scrollRef}
        className="relative h-full snap-y snap-mandatory overflow-y-auto scroll-smooth"
      >
        {/* Question + input */}
        <section className="flex min-h-[85vh] snap-start flex-col px-5 pb-16 pt-10 md:px-8">
          <div className="mx-auto w-full max-w-xl flex-1">
            <h2 className="font-serif text-3xl leading-snug text-foam md:text-4xl">
              What&apos;s an issue that matters to you?
            </h2>
            <textarea
              value={thought}
              onChange={(e) => setThought(e.target.value.slice(0, 280))}
              rows={4}
              placeholder=""
              className="mt-6 w-full resize-none rounded-2xl border border-foam/20 bg-depth/40 px-5 py-4 text-lg leading-relaxed text-foam focus:border-sand/50 focus:outline-none"
              autoFocus
            />

            {thought.trim() && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-10"
              >
                <FishTextVessel
                  form={DEFAULT_FISH}
                  text={thought}
                  size={320}
                />
              </motion.div>
            )}

            <button
              type="button"
              disabled={!thought.trim()}
              onClick={goToWhy}
              className="mt-10 min-h-12 rounded-full bg-sand px-8 py-3 text-navy disabled:opacity-35"
            >
              Continue
            </button>
          </div>
        </section>

        {/* Why — half screen, previous fish stays visible above */}
        {showWhy && (
          <section
            ref={whyRef}
            className="flex min-h-screen snap-start flex-col"
          >
            <div className="flex h-[45vh] items-center justify-center border-b border-foam/10 bg-depth/30 px-4">
              <FishTextVessel form={DEFAULT_FISH} text={thought} size={260} />
            </div>
            <div className="flex min-h-[55vh] flex-col px-5 py-8 md:px-8">
              <div className="mx-auto w-full max-w-xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sand/70">
                  Want to add more?
                </p>
                <h3 className="mt-2 font-serif text-2xl text-foam md:text-3xl">
                  Why does this stay with you?
                </h3>
                <textarea
                  value={whyText}
                  onChange={(e) => setWhyText(e.target.value.slice(0, 400))}
                  rows={3}
                  className="mt-5 w-full resize-none rounded-2xl border border-foam/20 bg-depth/40 px-4 py-3 text-base text-foam focus:border-sand/40 focus:outline-none"
                />
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => goToFriction(true)}
                    className="min-h-11 rounded-full border border-foam/25 px-5 py-2.5 text-foam/70"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={() => goToFriction(false)}
                    className="min-h-11 rounded-full bg-sand px-6 py-2.5 text-navy"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Friction — fish still visible top half */}
        {showWhy && (
          <section
            ref={frictionRef}
            className="flex min-h-screen snap-start flex-col"
          >
            <div className="flex h-[40vh] items-center justify-center border-b border-foam/10 bg-depth/30 px-4">
              <FishTextVessel
                form={DEFAULT_FISH}
                text={thought}
                insight={whyText.trim() || null}
                size={240}
              />
            </div>
            <div className="flex min-h-[60vh] flex-col px-5 py-8 md:px-8">
              <div className="mx-auto w-full max-w-xl flex-1">
                <FrictionBubbles
                  selected={friction}
                  customText={customFriction}
                  onSelect={setFriction}
                  onCustomText={setCustomFriction}
                />
                {error && (
                  <p className="mt-4 text-sm text-rose" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  disabled={!canRelease || submitting}
                  onClick={handleRelease}
                  className="mt-8 min-h-12 rounded-full bg-sand px-8 py-3 text-navy disabled:opacity-35"
                >
                  {submitting ? "…" : "Release"}
                </button>
                {whySkipped ? null : null}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
