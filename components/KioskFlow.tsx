"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import DepthWater, { LEVELS } from "@/components/kiosk/DepthWater";
import Ripples from "@/components/kiosk/Ripples";
import SeaCreatures from "@/components/kiosk/SeaCreatures";
import FishSchool from "@/components/kiosk/FishSchool";
import { FRILL } from "@/components/kiosk/frillyFish";
import { PrinterButton, useReceiptPrinter } from "@/components/kiosk/ReceiptPrinter";

/**
 * Kiosk flow:
 *   welcome → "I care about…" → "because…" (optional)
 *   → your thought takes shape (its words break into dots, swirl, and form a fish)
 *   → place it in the water (how long it has stayed with you)
 *   → check your receipt → thank you + print.
 *
 * Design rules followed (Norman's heuristics / common UX laws):
 *  - Visibility of status: step dots, "Listening…", "Sending…", printing.
 *  - User control: Back on every step, optional step can be skipped, a tap
 *    skips the transition; nothing is sent until "Done".
 *  - Recognition over recall: the question stays on screen above each box.
 *  - Error prevention: Next stays off until there is something to send.
 *  - Minimal, consistent: one question per screen, same blue water, same
 *    white buttons with dark text, same places for Back / Next.
 *  - Fitts: large buttons (≥ 56 px), primary action bottom-right.
 *  - Accessibility: text size (3 limited steps), easier-reading spacing,
 *    read aloud, voice typing, keyboard support, reduced motion respected,
 *    and an idle reset so the next visitor never sees someone else's words.
 */

type Step = "welcome" | "care" | "because" | "place" | "preview" | "sending" | "done";
type Level = "recent" | "common" | "deep";

const MAX_WORDS = 50;
const IDLE_RESET_MS = 90_000;
const DONE_RESET_MS = 40_000;
const SENDING_MS = 500;
const ORDER: Step[] = ["welcome", "care", "because", "place", "preview", "sending", "done"];
const STEPS: Step[] = ["care", "because", "place", "preview"];

const QUESTION = "What is a quiet weight or worry you carry about our world?";

/** The three ocean zones, as a depth scale (like the sidebar on Saskia's site). */
const LEVEL_TEXT: Record<Level, { name: string; note: string }> = {
  recent: { name: "Sunlight zone", note: "A recent worry" },
  common: { name: "Twilight zone", note: "It keeps coming back" },
  deep: { name: "Midnight zone", note: "Carried for so long. Let it rest here." },
};
const LEVEL_IDS: Level[] = ["recent", "common", "deep"];

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
function limitToWords(value: string, max: number) {
  const m = [...value.matchAll(/\S+/g)];
  if (m.length <= max) return value;
  const last = m[max - 1]!;
  return value.slice(0, last.index! + last[0].length);
}
function levelAt(y: number): Level {
  return y < LEVELS[1].from ? "recent" : y < LEVELS[2].from ? "common" : "deep";
}

/** What "Read aloud" says on each screen. */
const SPOKEN: Record<Step, string> = {
  welcome: `${QUESTION} Tap Start to begin.`,
  care: `${QUESTION} All responses remain anonymous. Finish the sentence: I care about. Type, or tap the microphone to speak.`,
  because: "Go a little deeper? Your first answer is shown above the box. Finish the sentence: I care because. Or tap Skip this step.",
  place: "How long has this worry stayed with you? Tap and drag to place your worry: the sunlight zone for a recent worry, the twilight zone if it keeps coming back, or the midnight zone if you have carried it for so long and want to let it rest here. Then tap Next.",
  preview: "Here is your receipt. Check your words, then tap Print and send. Or tap Back to change them.",
  sending: "Sending your worry as a ripple.",
  done: "Take your printed worry. Tap Done when you are finished.",
};

/* ------------------------------------------------------------------ */

export default function KioskFlow() {
  const [step, setStepRaw] = useState<Step>("welcome");
  // 1 = forward (the next screen swipes up from below), -1 = back (it comes down from above)
  const [dir, setDir] = useState(1);
  const stepRef = useRef<Step>("welcome");
  const setStep = useCallback((next: Step) => {
    setDir(ORDER.indexOf(next) >= ORDER.indexOf(stepRef.current) ? 1 : -1);
    stepRef.current = next;
    setStepRaw(next);
  }, []);
  const [care, setCare] = useState("");
  const [because, setBecause] = useState("");
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const printer = useReceiptPrinter();
  // the receipt that's already gone to the printer, so a retry after a failed send doesn't print it twice
  const printedKey = useRef<string | null>(null);

  // Their receipt, drawn from their words for the preview, and shown again sliding out on the last screen
  const receiptKey = `${care.trim()}\n${because.trim()}`;
  const [receipt, setReceipt] = useState<{ key: string; src: string | null; failed: boolean }>({
    key: "",
    src: null,
    failed: false,
  });
  const wantReceipt = step === "preview" || step === "sending" || step === "done";
  useEffect(() => {
    if (!wantReceipt) return;
    let cancelled = false;
    fetch("/api/receipts/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ care: care.trim(), because: because.trim() }),
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error())))
      .then((blob) => {
        if (cancelled) return;
        const src = URL.createObjectURL(blob);
        setReceipt((prev) => {
          if (prev.src) URL.revokeObjectURL(prev.src);
          return { key: receiptKey, src, failed: false };
        });
      })
      .catch(() => !cancelled && setReceipt((prev) => ({ ...prev, key: receiptKey, failed: true })));
    return () => {
      cancelled = true;
    };
    // care and because are covered by receiptKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantReceipt, receiptKey]);
  const receiptSrc = receipt.key === receiptKey ? receipt.src : null;
  const receiptFailed = receipt.key === receiptKey && receipt.failed;

  // Accessibility settings (cleared for each new visitor)
  const [sizeStep, setSizeStep] = useState(0);
  const [easyRead, setEasyRead] = useState(false);
  const [readAloud, setReadAloud] = useState(false);

  const reset = useCallback(() => {
    setStep("welcome");
    setCare("");
    setBecause("");
    setSpot(null);
    setError(null);
    setSending(false);
    setReceipt((prev) => {
      if (prev.src) URL.revokeObjectURL(prev.src);
      return { key: "", src: null, failed: false };
    });
    printedKey.current = null;
    setSizeStep(0);
    setEasyRead(false);
    setReadAloud(false);
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, [setStep]);

  // Idle reset
  const lastTouch = useRef(0);
  useEffect(() => {
    lastTouch.current = Date.now();
    const bump = () => (lastTouch.current = Date.now());
    const evts = ["pointerdown", "keydown", "input"] as const;
    evts.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const id = window.setInterval(() => {
      const limit = step === "done" ? DONE_RESET_MS : IDLE_RESET_MS;
      if (step !== "welcome" && Date.now() - lastTouch.current > limit) reset();
    }, 2000);
    return () => {
      evts.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(id);
    };
  }, [step, reset]);

  // Read aloud: speak each screen as it appears (and stop when leaving it).
  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return;
    synth.cancel();
    if (!readAloud) return;
    const u = new SpeechSynthesisUtterance(SPOKEN[step]);
    u.rate = 0.92;
    synth.speak(u);
    return () => synth.cancel();
  }, [step, readAloud]);

  // Next on the placement screen: the fish carry the thought off while it
  // sends; we stay on that screen for at least SENDING_MS so it never flashes.
  async function send() {
    if (!spot || sending) return;
    setSending(true);
    setError(null);
    setStep("sending");
    // start printing straight away from the receipt they just checked, while the thought saves
    const printNow = receiptSrc !== null && printedKey.current !== receiptKey;
    if (printNow) {
      printer.printImage(receiptSrc);
      printedKey.current = receiptKey;
    }
    const minWait = new Promise((r) => window.setTimeout(r, SENDING_MS));
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worry_text: care.trim(),
          offering_text: because.trim(),
          category: "unspecified",
          theme: "unspecified",
          feeling_tag: levelAt(spot.y),
        }),
      });
      if (!res.ok) throw new Error();
      // the receipt prints over Bluetooth in the background, while the thank-you shows
      const { id } = (await res.json()) as { id: string };
      // no preview to print from (it failed to draw): print the server's copy instead
      if (!printNow && printedKey.current !== receiptKey) {
        printer.print(id);
        printedKey.current = receiptKey;
      }
      await minWait;
      setStep("done");
    } catch {
      await minWait;
      setError("That didn't send. Please tap Print and send again.");
      setStep("preview");
    } finally {
      setSending(false);
    }
  }

  const stepNo = STEPS.indexOf(step);
  // "first answer· second answer": the dot sits right after the last word (no gap)
  const thought = [care.trim(), because.trim()].filter(Boolean).join("\u00b7 ");

  return (
    <main
      className={`kiosk relative flex h-dvh w-full flex-col overflow-hidden ${easyRead ? "kiosk-easy" : ""}`}
      data-size={sizeStep}
    >
      {/* off-white page with a soft, blurred orb of the projection's blues in the middle */}
      <div className="kiosk-bg kiosk-grain pointer-events-none absolute inset-0" aria-hidden>
        <div className="kiosk-orb kiosk-orb-main" />
        <div className="kiosk-orb kiosk-orb-tr" />
        <div className="kiosk-orb kiosk-orb-bl" />
      </div>

      <PrinterButton {...printer} />

      <A11yMenu
        sizeStep={sizeStep}
        onSize={setSizeStep}
        easyRead={easyRead}
        onEasyRead={setEasyRead}
        readAloud={readAloud}
        onReadAloud={setReadAloud}
      />

      <AnimatePresence initial={false} mode="wait">
        {(step === "welcome" || step === "care") && (
          <Page key="intro" dir={dir} className="kiosk-on-orb">
            <Ripples cy={0.45} rgb="255,255,255" strength={0.14} />
            <Logo />
            <motion.div layout className={`relative flex flex-1 flex-col items-center justify-center text-center ${step === "welcome" ? "pb-[12vh]" : ""}`} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
              <motion.h1 layout="position" className={`kiosk-hero ${step === "care" ? "is-compact" : "kiosk-float"}`}>
                {QUESTION}
              </motion.h1>
              <AnimatePresence mode="wait" initial={false}>
                {step === "welcome" ? (
                  <motion.div key="start" exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.25 }}>
                    <button type="button" className="kiosk-btn is-large mt-[2.2em]" onClick={() => setStep("care")}>
                      Start
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="care"
                    className="w-full"
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <TextStep
                      label="I care about…"
                      hideLabel
                      placeholder="I care about…"
                      footnote="All responses remain anonymous."
                      value={care}
                      onChange={setCare}
                      required
                      onBack={() => setStep("welcome")}
                      onNext={() => setStep("because")}
                      nextLabel="Next"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
            {step === "care" && <Steps current={stepNo} light />}
          </Page>
        )}

        {step === "because" && (
          <Page key="because" dir={dir} className="kiosk-on-orb">
            <Logo />
            <div className="relative flex flex-1 flex-col items-center justify-center text-center">
              <h1 className="kiosk-hero is-compact">
                Go a little deeper?
              </h1>
              <TextStep
                label="I care because… (optional)"
                hideLabel
                placeholder="I care because…"
                note={<q className="kiosk-recall">{care.trim()}</q>}
                value={because}
                onChange={setBecause}
                onBack={() => setStep("care")}
                onNext={() => setStep("place")}
                nextLabel={because.trim() ? "Next" : "Skip this step"}
              />
            </div>
            <Steps current={stepNo} light />
          </Page>
        )}

        {step === "place" && (
          <Place
            key="place"
            dir={dir}
            thought={thought}
            spot={spot}
            onSpot={setSpot}
            onBack={() => setStep("because")}
            onDone={() => {
              setError(null);
              setStep("preview");
            }}
            sending={sending}
            error={null}
            stepNo={stepNo}
          />
        )}

        {step === "preview" && (
          <Preview
            key="preview"
            dir={dir}
            care={care}
            because={because}
            src={receiptSrc}
            failed={receiptFailed}
            onBack={() => setStep("place")}
            onSend={send}
            sending={sending}
            error={error}
            stepNo={stepNo}
          />
        )}

        {step === "sending" && <Sending key="sending" dir={dir} />}

        {step === "done" && (
          <Page key="done" dir={dir} className="kiosk-on-orb">
            {/* the same fish, faint, swimming around behind — like the projection */}
            <FishSchool seed="done" count={22} size={[10, 20]} speed={60} colour="#ffffff" opacity={0.22} />
            <Logo />
            <div className="relative flex flex-1 flex-col items-center justify-center text-center">
              <h1 className="kiosk-hero is-compact">Take your printed worry</h1>
              <Printing src={receiptSrc} />
            </div>
            <div className="relative flex justify-center pb-[clamp(2rem,9vh,5rem)]">
              <button type="button" className="kiosk-btn min-w-[12em]" onClick={reset}>
                Done
              </button>
            </div>
          </Page>
        )}
      </AnimatePresence>
    </main>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Every screen fades: the old one fades out, then the new one fades in.
 */
const pageVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.45, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.3, ease: "easeIn" } },
};

function Page({ dir, children, className = "" }: { dir: number; children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      className={`absolute inset-0 flex min-h-0 flex-col overflow-y-auto px-[clamp(1.25rem,5vw,4rem)] pb-[clamp(1rem,4vh,2rem)] pt-[clamp(1rem,4vh,2.5rem)] ${className}`}
      data-dir={dir}
      variants={pageVariants}
      initial="enter"
      animate="center"
      exit="exit"
    >
      {children}
    </motion.section>
  );
}

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/branding/dive-deep-wordmark-dark.png"
      alt="dive deep"
      width={1292}
      height={306}
      className="relative z-10 h-auto w-[min(22vw,9.5em)] select-none"
      draggable={false}
    />
  );
}

function Steps({ current, light = false }: { current: number; light?: boolean }) {
  if (current < 0) return null;
  return (
    <div
      className="kiosk-steps z-30 flex items-center justify-center gap-2"
      role="img"
      aria-label={`Step ${current + 1} of ${STEPS.length}`}
    >
      {STEPS.map((s, i) => (
        <span
          key={s}
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: i === current ? 22 : 8, background: light ? (i <= current ? "#ffffff" : "rgba(255,255,255,0.4)") : i <= current ? "#123c6e" : "rgba(18,60,110,0.22)" }}
        />
      ))}
    </div>
  );
}

/* ---- check your receipt -------------------------------------------- */

/**
 * Their receipt as it will print, drawn from their words before anything is
 * saved, so they can check it and go back to change it. Nothing is sent until
 * "Print and send".
 */
function Preview({
  dir, care, because, src, failed, onBack, onSend, sending, error, stepNo,
}: {
  dir: number; care: string; because: string; src: string | null; failed: boolean;
  onBack: () => void; onSend: () => void; sending: boolean; error: string | null; stepNo: number;
}) {
  return (
    <Page dir={dir} className="kiosk-on-orb">
      <Logo />
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[1.2em] text-center">
        <h1 className="kiosk-hero is-compact">Here&apos;s your receipt</h1>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {src ? (
            // a slip of receipt paper, torn zigzag top and bottom, settling in at a slight tilt
            <motion.div
              className="kiosk-slip-shadow"
              initial={{ opacity: 0, y: 30, rotate: 0 }}
              animate={{ opacity: 1, y: 0, rotate: -2 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="kiosk-slip">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Your receipt: I #divedeep about ${care.trim()}${because.trim() ? `, because ${because.trim()}` : ""}`}
                  className="block max-h-[52vh] w-auto"
                />
              </div>
            </motion.div>
          ) : (
            <p className="kiosk-body" role="status">
              {failed ? "The preview didn't load, but your receipt will still print." : "Drawing your receipt…"}
            </p>
          )}
        </div>
      </div>

      <div className="relative z-10 pb-[clamp(1rem,4vh,2rem)] px-[clamp(1.25rem,5vw,4rem)]">
        {error && (
          <p className="kiosk-body mb-3 text-center !text-white" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-4">
          <button type="button" className="kiosk-btn-ghost" onClick={onBack} disabled={sending}>
            Back
          </button>
          <button type="button" className="kiosk-btn" onClick={onSend} disabled={sending}>
            Print and send
          </button>
        </div>
      </div>
      <Steps current={stepNo} light />
    </Page>
  );
}

/* ---- accessibility menu ------------------------------------------- */

function A11yMenu({
  sizeStep, onSize, easyRead, onEasyRead, readAloud, onReadAloud,
}: {
  sizeStep: number; onSize: (n: number) => void;
  easyRead: boolean; onEasyRead: (b: boolean) => void;
  readAloud: boolean; onReadAloud: (b: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  return (
    <div className="fixed right-[clamp(1rem,3vw,2rem)] top-[clamp(1rem,4vh,2.5rem)] z-40 flex flex-col items-end">
      <button
        type="button"
        className={`kiosk-a11y-btn ${open ? "is-open" : ""}`}
        aria-label="Accessibility options"
        aria-expanded={open}
        aria-controls="kiosk-a11y"
        onClick={() => setOpen((o) => !o)}
      >
        <AccessIcon />
      </button>
      {open && (
        <div id="kiosk-a11y" role="dialog" aria-label="Accessibility" className="kiosk-a11y-panel mt-3">
          <p className="kiosk-a11y-title">Text size</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Text size">
            {["A", "A", "A"].map((a, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={sizeStep === i}
                aria-label={["Standard", "Large", "Larger"][i]}
                onClick={() => onSize(i)}
                className={`kiosk-a11y-size ${sizeStep === i ? "is-on" : ""}`}
                style={{ fontSize: `${[1, 1.25, 1.5][i]}em` }}
              >
                {a}
              </button>
            ))}
          </div>
          <Toggle label="Easier reading" note="More space between letters and lines" on={easyRead} onChange={onEasyRead} />
          {canSpeak && <Toggle label="Read aloud" note="Hear each screen" on={readAloud} onChange={onReadAloud} />}
          <button type="button" className="kiosk-a11y-close" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

/** The universal accessibility figure (arms out, inside the round button). */
function AccessIcon() {
  return (
    <svg viewBox="0 0 24 24" width="70%" height="70%" aria-hidden>
      <circle cx="12" cy="4.4" r="2.5" fill="currentColor" />
      <path
        d="M3.4 8.7 L20.6 8.7 M10.6 13.6 L9.2 21 M13.4 13.6 L14.8 21"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.8"
      />
      <path d="M9.4 8.2 H14.6 L14 14.4 H10 Z" fill="currentColor" />
    </svg>
  );
}

function Toggle({ label, note, on, onChange }: { label: string; note: string; on: boolean; onChange: (b: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="kiosk-a11y-toggle">
      <span className="flex flex-col items-start text-left">
        <span className="font-semibold">{label}</span>
        <span className="text-[0.85em] text-[#4a5b68]">{note}</span>
      </span>
      <span className={`kiosk-switch ${on ? "is-on" : ""}`} aria-hidden />
    </button>
  );
}

/* ---- text steps with voice typing --------------------------------- */

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const noSubscribe = () => () => {};

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function TextStep({
  heading, hint, note, footnote, label, hideLabel, placeholder, value, onChange, required, onBack, onNext, nextLabel,
}: {
  heading?: string; hint?: string;
  /** A small line just under the page heading, above the box. */
  note?: React.ReactNode;
  /** A small line under the box, on the left (beside the word count). */
  footnote?: string;
  label: string; hideLabel?: boolean; placeholder?: string; value: string;
  onChange: (v: string) => void; required?: boolean; onBack: () => void; onNext: () => void; nextLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [listening, setListening] = useState(false);
  // Voice typing only where the browser supports it (Chrome, Edge); false on the server.
  const voiceOk = useSyncExternalStore(noSubscribe, () => Boolean(getRecognition()), () => false);
  const rec = useRef<Recognition | null>(null);
  const base = useRef("");
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  useEffect(() => {
    const id = window.setTimeout(() => ref.current?.focus(), 450);
    return () => {
      window.clearTimeout(id);
      rec.current?.stop();
    };
  }, []);

  const toggleVoice = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const R = getRecognition();
    if (!R) return;
    const r = new R();
    r.lang = "en-AU";
    r.continuous = true;
    r.interimResults = true;
    base.current = valueRef.current.trim();
    r.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) finalText += res[0]!.transcript;
        else interim += res[0]!.transcript;
      }
      const spoken = `${finalText}${interim}`.trim();
      onChange(limitToWords([base.current, spoken].filter(Boolean).join(" "), MAX_WORDS));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  const words = wordCount(value);
  const canGo = !required || value.trim().length > 0;
  const id = useMemo(() => `t-${label.replace(/\W+/g, "")}`, [label]);
  return (
    <div className={`mx-auto flex w-full max-w-[46rem] flex-col text-left ${note ? "mt-[0.7em]" : "mt-[2.4em]"}`}>
      {note && <div className="kiosk-note mb-[1.7em] text-center">{note}</div>}
      {heading && <h1 className="kiosk-h1 text-center">{heading}</h1>}
      {hint && <p className="kiosk-small mt-[0.3em] text-center">{hint}</p>}
      <label htmlFor={id} className={hideLabel ? "sr-only" : "kiosk-label"}>
        {label}
      </label>
      <div className={`relative ${hideLabel ? "" : "mt-[0.6em]"}`}>
        <textarea
          id={id}
          ref={ref}
          value={value}
          onChange={(e) => onChange(limitToWords(e.target.value, MAX_WORDS))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canGo) onNext();
            }
          }}
          placeholder={placeholder ?? (voiceOk ? "Type here, or tap the mic to speak" : "Type here")}
          rows={4}
          maxLength={400}
          className="kiosk-input"
          aria-describedby={`${id}-count`}
        />
        {voiceOk && (
          <button
            type="button"
            onClick={toggleVoice}
            className={`kiosk-mic ${listening ? "is-on" : ""}`}
            aria-pressed={listening}
            aria-label={listening ? "Stop voice typing" : "Speak instead of typing"}
          >
            <MicIcon />
          </button>
        )}
      </div>
      <p id={`${id}-count`} className="kiosk-small mt-[0.4em] flex justify-between" aria-live="polite">
        <span>{listening ? "Listening… tap the mic to stop" : footnote ?? ""}</span>
        <span>
          {words}/{MAX_WORDS} words
        </span>
      </p>
      <div className="mt-[1.6em] flex items-center justify-between gap-4">
        <button type="button" className="kiosk-btn-ghost" onClick={onBack}>
          Back
        </button>
        <button type="button" className="kiosk-btn" onClick={onNext} disabled={!canGo}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.4em" height="1.4em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </svg>
  );
}

/* ---- your thought takes shape ------------------------------------- */

/**
 * After Next: a small school of fish swims slowly round in a loose ring while
 * the thought sends. Each fish keeps its own lane and pace and gently sways,
 * and they never stop: the next screen fades in while they are still swimming,
 * so the screen never looks frozen.
 */
const SCHOOL = Array.from({ length: 16 }, (_, i) => ({
  start: (i / 16) * 360 + (i % 3) * 7,
  lane: 16 + ((i * 7) % 5) * 1, // em from the centre (clear of the text)
  size: 2 + ((i * 5) % 4) * 0.4, // em
  secs: 6 + ((i * 3) % 5) * 0.4, // one lap
  sway: 1.6 + (i % 4) * 0.3,
}));
function Sending({ dir }: { dir: number }) {
  const reduce = useReducedMotion();
  return (
    <Page dir={dir} className="kiosk-on-orb items-center justify-center overflow-hidden">
      <div className="absolute left-[clamp(1.25rem,5vw,4rem)] top-[clamp(1rem,4vh,2.5rem)] z-10">
        <Logo />
      </div>
      {SCHOOL.map((f, i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0"
          initial={{ rotate: f.start, opacity: 0 }}
          animate={{ rotate: reduce ? f.start : f.start + 360, opacity: 1 }}
          transition={{
            rotate: { duration: f.secs, ease: "linear", repeat: Infinity },
            opacity: { duration: 0.3 },
          }}
          aria-hidden
        >
          <span
            className="absolute left-0 top-0"
            style={{
              width: `${f.size}em`,
              aspectRatio: "120 / 62",
              // out to its lane, then turned to swim clockwise along it (shapes face left)
              transform: `translateX(${f.lane}em) rotate(-90deg) translate(-50%, -50%)`,
              transformOrigin: "0 0",
            }}
          >
            <svg
              viewBox="0 0 120 62"
              width="100%"
              height="100%"
              fill="#ffffff"
              opacity={0.55 + (i % 4) * 0.12}
              className="kiosk-sway"
              style={{ animationDuration: `${f.sway}s`, animationDelay: `${-i * 0.37}s` }}
            >
              <path d={FRILL.tail} />
              <path d={FRILL.dorsal} />
              <path d={FRILL.anal} />
              <path d={FRILL.body} />
            </svg>
          </span>
        </motion.div>
      ))}
      <p className="kiosk-h1 relative z-10 text-center" aria-live="polite">
        Sending your worry as a ripple…
      </p>
    </Page>
  );
}

/* ---- place it in the water ---------------------------------------- */

function Place({
  dir, thought, spot, onSpot, onBack, onDone, sending, error, stepNo,
}: {
  dir: number; thought: string; spot: { x: number; y: number } | null;
  onSpot: (s: { x: number; y: number }) => void;
  onBack: () => void; onDone: () => void; sending: boolean; error: string | null; stepNo: number;
}) {
  const area = useRef<HTMLDivElement>(null);
  const scale = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [drops, setDrops] = useState<{ id: number; x: number; y: number }[]>([]);
  const reduce = useReducedMotion();
  const clampY = (y: number) => Math.min(0.8, Math.max(LEVELS[0].from + 0.02, y));

  // Keep the thought clear of the depth scale on the left.
  const minX = () => {
    const r = area.current?.getBoundingClientRect();
    const p = scale.current?.getBoundingClientRect();
    if (!r || !p) return 0.3;
    return Math.min(0.6, (p.right - r.left + 140) / r.width);
  };
  const place = (x: number, y: number, ripple: boolean) => {
    const s = { x: Math.min(0.85, Math.max(minX(), x)), y: clampY(y) };
    onSpot(s);
    if (ripple && !reduce) {
      const id = performance.now();
      setDrops((d) => [...d.slice(-3), { id, ...s }]);
      window.setTimeout(() => setDrops((d) => d.filter((q) => q.id !== id)), 2600);
    }
  };
  const toSpot = (clientX: number, clientY: number, ripple: boolean) => {
    const r = area.current!.getBoundingClientRect();
    place((clientX - r.left) / r.width, (clientY - r.top) / r.height, ripple);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const s = spot ?? { x: 0.55, y: 0.4 };
    const d = 0.04;
    const map: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    if (map[e.key]) {
      e.preventDefault();
      const [dx, dy] = map[e.key]!;
      place(s.x + dx, s.y + dy, false);
    }
  };

  const level = spot ? levelAt(spot.y) : null;

  return (
    <Page dir={dir} className="kiosk-on-water !overflow-hidden !p-0">
      <div
        ref={area}
        className="absolute inset-0 touch-none outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-white/70"
        tabIndex={0}
        role="application"
        aria-label="The water. Tap to place your worry; tap again or drag to move it. Arrow keys also move it, or choose a zone on the depth scale."
        onKeyDown={onKey}
        onPointerDown={(e) => {
          dragging.current = true;
          setIsDragging(true);
          (e.target as Element).setPointerCapture?.(e.pointerId);
          toSpot(e.clientX, e.clientY, true);
        }}
        onPointerMove={(e) => dragging.current && toSpot(e.clientX, e.clientY, false)}
        onPointerUp={() => {
          dragging.current = false;
          setIsDragging(false);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          setIsDragging(false);
        }}
      >
        <DepthWater />
        <SeaCreatures />

        {/* rings where you tap, like touching the installation's water */}
        {drops.map((d) => (
          <span
            key={d.id}
            className="kiosk-drop pointer-events-none absolute"
            style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
            aria-hidden
          >
            <span />
            <span />
          </span>
        ))}

        {/* your thought surfaces where you tap, like a tapped thought on the projection */}
        {spot && (
          <motion.div
            className="pointer-events-none absolute left-0 top-0"
            initial={false}
            animate={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
            transition={reduce || isDragging ? { duration: 0.1 } : { type: "spring", stiffness: 26, damping: 10, mass: 1.1 }}
            style={{ x: "-50%", y: "-50%" }}
          >
            <motion.p
              className="kiosk-thought on-deep"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              {thought}
            </motion.p>
          </motion.div>
        )}
      </div>

      {/* level names, floating on the left of the water (tap one to drop the thought there) */}
      <div ref={scale} className="kiosk-levels pointer-events-none absolute bottom-0 left-[clamp(1.25rem,5vw,4rem)] top-0 z-20">
        <ul className="m-0 list-none p-0" aria-label="Sea levels">
          {LEVELS.map((l, i) => {
            const id = LEVEL_IDS[i]!;
            const active = level === id;
            const t = LEVEL_TEXT[id];
            return (
              <li key={l.id} className="absolute left-0 right-0" style={{ top: `${((l.from + l.to) / 2) * 100}%` }}>
                <button
                  type="button"
                  className={`kiosk-zone pointer-events-auto ${active ? "is-on" : ""}`}
                  style={{ animationDelay: `${-i * 2.3}s` }}
                  aria-pressed={active}
                  onClick={() => place(spot?.x ?? 0.55, (l.from + l.to) / 2, true)}
                >
                  <span className="kiosk-zone-name">{t.name}</span>
                  <span className="kiosk-zone-note">{t.note}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="pointer-events-none relative z-10 px-[clamp(1.25rem,5vw,4rem)] pt-[clamp(1rem,4vh,2.5rem)]">
        <Logo />
        <div className="mt-[0.6em] flex flex-col items-center text-center">
          <h1 className="kiosk-hero is-place">How long has this worry stayed with you?</h1>
          <p className="kiosk-body mt-[0.5em]" aria-live="polite">
            Tap and drag to place your worry
          </p>
        </div>
      </div>

      {/* right padding leaves room for the round Aa button in the corner */}
      <div className="relative z-10 mt-auto pb-[clamp(1rem,4vh,2rem)] px-[clamp(1.25rem,5vw,4rem)]">
        {error && (
          <p className="kiosk-body mb-3 text-center !text-white" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-4">
          <button type="button" className="kiosk-btn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="kiosk-btn" onClick={onDone} disabled={!spot || sending}>
            Next
          </button>
        </div>
      </div>
      <Steps current={stepNo} />
    </Page>
  );
}

/* ---- the print sliding out ---------------------------------------- */

function Printing({ src }: { src: string | null }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative my-[1.6em] flex flex-col items-center" aria-label="Your receipt is printing" role="img">
      {/* the printer slot */}
      <div className="relative z-10 h-[18px] w-[min(30vh,250px)] rounded-full bg-[#d9dee4] shadow-[inset_0_2px_5px_rgba(15,23,42,0.18)]" />
      {/* their receipt feeds down out of the slot, as long as it takes the printer */}
      <div className="kiosk-slip-shadow relative -mt-[9px] h-[min(44vh,400px)] overflow-hidden">
        <motion.div
          className="h-full"
          initial={{ y: reduce ? "0%" : "-100%" }}
          animate={{ y: "0%" }}
          transition={{ duration: reduce ? 0 : 6, ease: [0.45, 0, 0.55, 1], delay: 0.4 }}
        >
          {src ? (
            <div className="kiosk-slip is-printing h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="block h-full w-auto" />
            </div>
          ) : (
            // the receipt is still being drawn (or couldn't be): the blank template stands in
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/kiosk/print-template.jpg" alt="" className="h-full w-[min(24vh,200px)] rounded-b-md object-cover object-top" />
          )}
        </motion.div>
      </div>
    </div>
  );
}
