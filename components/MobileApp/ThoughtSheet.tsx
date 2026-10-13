"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import {
  CATEGORY_LABELS,
  type Submission,
  type ThoughtResponse,
} from "@/lib/types";
import FishArtefact from "@/components/onboarding/FishArtefact";

export default function ThoughtSheet({
  submission,
  onClose,
}: {
  submission: Submission;
  onClose: () => void;
}) {
  const [responses, setResponses] = useState<ThoughtResponse[]>([]);
  const [responseText, setResponseText] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
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
  }, [submission.id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function postResponse() {
    if (!responseText.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: submission.id,
          response_text: responseText.trim(),
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as ThoughtResponse;
        setResponses((prev) => [...prev, created]);
        setResponseText("");
      }
    } finally {
      setPosting(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#020308]/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.article
        role="dialog"
        aria-modal
        aria-label="Thought"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 260 }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[88svh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-ripple/30 bg-ocean-mid px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 text-foam"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-foam/25" aria-hidden />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full p-2 text-warm-soft/70 transition hover:bg-warm-soft/10 hover:text-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {submission.fish_form && submission.prompt_type ? (
          <FishArtefact
            compact
            fishForm={submission.fish_form}
            promptType={submission.prompt_type}
            thought={submission.worry_text}
            whyText={submission.why_text}
            frictions={submission.frictions ?? []}
            category={submission.category}
          />
        ) : (
          <div className="pr-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-warm-soft/60">
              {CATEGORY_LABELS[submission.category]}
            </p>
            <h2 className="mt-3 font-serif text-2xl leading-snug">
              {submission.worry_text}
            </h2>
            {submission.offering_text ? (
              <div className="mt-6 border-t border-warm-soft/15 pt-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-warm-soft/55">
                  Offering
                </p>
                <p className="mt-2 leading-relaxed text-warm-soft/90">
                  {submission.offering_text}
                </p>
              </div>
            ) : null}
          </div>
        )}
        <p className="mt-5 font-mono text-xs text-warm-soft/45">
          Uncovered by {submission.uncover_count}{" "}
          {submission.uncover_count === 1 ? "person" : "people"}
        </p>

        <section className="mt-6 border-t border-warm-soft/15 pt-5">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-warm-soft/60">
            Responses
            {responses.length > 0 ? ` · ${responses.length}` : ""}
          </h3>
          {responses.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-warm-soft/55">
              No responses yet. Leave one below.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {responses.map((r) => (
                <li key={r.id} className="border-l border-ripple/35 pl-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-warm-soft/45">
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1 font-serif text-lg leading-relaxed text-foam">
                    {r.response_text}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <label className="mt-5 block">
            <span className="sr-only">Leave a response</span>
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Leave a response…"
              className="w-full resize-none rounded-2xl border border-ripple/25 bg-ocean-deep/40 px-4 py-3 text-base leading-relaxed text-foam placeholder:text-mist/40 focus:border-ripple/50 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={postResponse}
            disabled={posting || !responseText.trim()}
            className="mt-3 min-h-11 rounded-full border border-ripple/40 px-5 py-2 text-sm text-foam transition hover:border-ripple/70 disabled:opacity-40"
          >
            {posting ? "Sending…" : "Send response"}
          </button>
        </section>
      </motion.article>
    </motion.div>
  );
}
