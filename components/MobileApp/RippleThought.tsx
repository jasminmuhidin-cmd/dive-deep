"use client";

import { useEffect, useState, type FormEvent, type RefObject } from "react";
import type { Submission, ThoughtResponse } from "@/lib/types";
import RippleChain, { type RippleNode } from "./RippleChain";
import Ripples, { CHALK, LINE_DASH, LINE_WIDTH } from "./Ripples";

const pad = (n: number) => String(n).padStart(2, "0");

/** When something was left in the water, as dd/mm/yyyy, e.g. "03/11/2026" */
function dated(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Each thought's count once this visit has been counted in, so reopening it doesn't count twice */
const uncovered = new Map<string, number>();
const SEEN_KEY = "dive:uncovered";

/** Thoughts already counted this visit, kept across reloads; empty if storage is blocked */
function seenThisVisit(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function markSeen(id: string) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seenThisVisit(), id]));
  } catch {
    // storage blocked: it may count again after a reload, which is harmless
  }
}

/** You're one of the people who uncovered it — unless you were already counted earlier this visit */
function countWithYou(s: Submission): number {
  return uncovered.get(s.id) ?? (!s.is_sample && seenThisVisit().has(s.id) ? s.uncover_count : s.uncover_count + 1);
}

/**
 * How many people have uncovered a thought, counting you in when you open it
 * (once a visit). Sample thoughts aren't stored, so they count you in locally.
 */
function useUncoverCount(s: Submission): number {
  const [count, setCount] = useState(() => countWithYou(s));
  useEffect(() => {
    if (uncovered.has(s.id)) return;
    uncovered.set(s.id, countWithYou(s));
    if (s.is_sample || seenThisVisit().has(s.id)) return;
    markSeen(s.id);
    fetch(`/api/submissions/${encodeURIComponent(s.id)}/uncover`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((updated: Submission | null) => {
        if (!updated) return;
        uncovered.set(s.id, updated.uncover_count);
        setCount(updated.uncover_count);
      })
      .catch(() => {});
  }, [s]);
  return count;
}

/**
 * A thought unfolded as a chain of ripples drawn out of the fish that carried
 * it: what they said, how many have uncovered it, each reply, and a space to
 * add your own.
 */
export default function RippleThought({
  submission,
  anchorRef,
  onClose,
}: {
  submission: Submission;
  /** Where the fish rests — the chain is drawn out of here */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const [responses, setResponses] = useState<ThoughtResponse[]>([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [failed, setFailed] = useState(false);
  const count = useUncoverCount(submission);
  // sample thoughts aren't in the database, so replies to them stay on this screen
  const sample = Boolean(submission.is_sample);

  useEffect(() => {
    if (sample) return;
    let cancelled = false;
    fetch(`/api/responses?submission_id=${encodeURIComponent(submission.id)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ThoughtResponse[]) => {
        if (!cancelled) setResponses(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [submission.id, sample]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const reply = text.trim();
    if (!reply || posting) return;
    setFailed(false);
    if (sample) {
      setResponses((prev) => [
        ...prev,
        { id: `local-${prev.length}`, submission_id: submission.id, response_text: reply, created_at: new Date().toISOString() },
      ]);
      setText("");
      return;
    }
    setPosting(true);
    try {
      const res = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submission.id, response_text: reply }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const created = (await res.json()) as ThoughtResponse;
      setResponses((prev) => [...prev, created]);
      setText("");
    } catch {
      setFailed(true);
    } finally {
      setPosting(false);
    }
  }

  const nodes: RippleNode[] = [
    {
      key: "thought",
      content: (
        <>
          <p className="dive-eyebrow">
            <time dateTime={submission.created_at}>{dated(submission.created_at)}</time>
          </p>
          <p className="mt-0.5">{submission.worry_text}</p>
          {/* their "because" from the kiosk */}
          {(submission.offering_text || submission.why_text)?.trim() && (
            <p className="mt-1 opacity-75">{submission.offering_text || submission.why_text}</p>
          )}
        </>
      ),
    },
    {
      key: "count",
      content: (
        <p className="whitespace-nowrap italic opacity-85">
          uncovered by {count} {count === 1 ? "person" : "people"}
        </p>
      ),
    },
    ...responses.map((r) => ({
      key: r.id,
      content: (
        <>
          <p className="dive-eyebrow">
            response · <time dateTime={r.created_at}>{dated(r.created_at)}</time>
          </p>
          <p className="mt-0.5">{r.response_text}</p>
        </>
      ),
    })),
  ];

  return (
    <RippleChain
      nodes={nodes}
      anchorRef={anchorRef}
      seed={submission.id}
      reply={
        <form onSubmit={send} className="flex w-64 flex-col items-center">
          {/* the reply is a ripple of its own: a patch of brighter water, rings spreading out from it like every other */}
          {/* only as tall as the pool, so send sits just beneath it; the rings spread out past the edges */}
          <label className="group relative grid h-[176px] w-64 place-items-center">
            <span className="sr-only">Add your own ripple</span>
            <Ripples
              size={256}
              rings={4}
              seed={`${submission.id}-reply`}
              delay={-1.5}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white"
            />
            {/* no hard edge: the light fades out into the water */}
            <span className="relative block h-[168px] w-[168px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.3),rgba(255,255,255,0.14)_60%,rgba(255,255,255,0)_100%)] transition-[background-color] group-focus-within:bg-white/[0.06]">
              {/* where the chain's line joins the pool */}
              <span data-chain-end className="absolute left-1/2 top-1" aria-hidden />
              {/* while you write, a ring drawn like the ripples: dashed, chalky and a little blurred */}
              <svg
                viewBox="0 0 176 176"
                className="pointer-events-none absolute -inset-1 h-[176px] w-[176px] overflow-visible text-white opacity-0 blur-[0.6px] transition-opacity duration-500 group-focus-within:opacity-80"
                aria-hidden
              >
                <circle
                  cx={88}
                  cy={88}
                  r={86}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={LINE_WIDTH}
                  strokeLinecap="round"
                  strokeDasharray={LINE_DASH.join(" ")}
                  filter={CHALK}
                />
              </svg>
              {/* at 16px, so phones don't zoom in on it */}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                placeholder="add your own ripple"
                className="absolute left-1/2 top-1/2 h-[120px] w-[128px] -translate-x-1/2 -translate-y-1/2 resize-none bg-transparent pt-[32px] text-center text-[16px] leading-[1.5] placeholder:text-current placeholder:italic placeholder:opacity-80 focus:outline-none"
              />
            </span>
          </label>
          <div className="flex items-center gap-6">
            <button
              type="submit"
              disabled={posting || !text.trim()}
              className="min-h-10 px-1 tracking-[0.04em] underline decoration-from-font underline-offset-4 transition hover:opacity-70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-current disabled:no-underline disabled:opacity-55"
            >
              {posting ? "sending…" : "send"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 px-1 italic opacity-70 transition hover:opacity-100"
            >
              exit
            </button>
          </div>
          {failed && (
            <p role="alert" className="mt-2 text-center">
              That ripple didn&apos;t send. Try again?
            </p>
          )}
        </form>
      }
    />
  );
}
