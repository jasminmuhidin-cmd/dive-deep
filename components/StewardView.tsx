"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ACTION_TYPES,
  ACTION_TYPE_LABELS,
  CATEGORY_LABELS,
  insightForFriction,
  type ActionType,
  type StewardshipAction,
  type Submission,
} from "@/lib/types";
import FishTextVessel from "@/components/onboarding/FishTextVessel";

export default function StewardPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [actions, setActions] = useState<StewardshipAction[]>([]);
  const [response, setResponse] = useState("");
  const [actionType, setActionType] = useState<ActionType>("reflection");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subRes, actRes] = await Promise.all([
        fetch(`/api/submissions/${id}`),
        fetch(`/api/stewardship?submission_id=${id}`),
      ]);

      if (!subRes.ok) {
        setSubmission(null);
        setError("This thought could not be found.");
        return;
      }

      setSubmission((await subRes.json()) as Submission);
      if (actRes.ok) {
        setActions((await actRes.json()) as StewardshipAction[]);
      }
    } catch {
      setError("Could not load this thought.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!response.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/stewardship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: id,
          response_text: response,
          action_type: actionType,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not save your response");
      }

      const created = (await res.json()) as StewardshipAction;
      setActions((prev) => [...prev, created]);
      setResponse("");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="relative min-h-screen text-foam">
        <div className="deep-dive-bg absolute inset-0" />
        <p className="relative px-5 py-12 text-foam/70">Opening this thought…</p>
      </main>
    );
  }

  if (!submission) {
    return (
      <main className="relative min-h-screen text-foam">
        <div className="deep-dive-bg absolute inset-0" />
        <div className="relative px-5 py-12">
          <h1 className="font-serif text-3xl">Not found</h1>
          <p className="mt-3 text-foam/65">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen text-foam">
      <div className="deep-dive-bg pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-lg px-5 py-10 pb-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-sand/70">
          Stewardship
        </p>
        <h1 className="mt-3 font-serif text-3xl leading-tight">
          You are holding someone&apos;s thought.
        </h1>

        <div className="mt-8">
          <FishTextVessel
            form={submission.fish_form || "betta"}
            text={submission.worry_text}
            insight={insightForFriction(submission.frictions?.[0])}
            size={300}
          />
          <p className="mt-4 text-center text-sm leading-relaxed text-sand/75">
            {insightForFriction(submission.frictions?.[0])}
          </p>
          {submission.frictions?.[0] && (
            <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-foam/40">
              {submission.frictions[0].label} ·{" "}
              {CATEGORY_LABELS[submission.category]}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-8">
          <label className="block">
            <span className="font-serif text-xl">
              What is one small step, conversation, or reflection you will do in
              solidarity?
            </span>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value.slice(0, 500))}
              rows={4}
              required
              placeholder="One concrete act of care…"
              className="mt-4 w-full resize-none rounded-2xl border border-foam/15 bg-depth/50 px-4 py-3 text-base leading-relaxed text-foam placeholder:text-foam/35 focus:border-sand/50 focus:outline-none"
            />
          </label>
          <p className="mt-1 font-mono text-xs text-foam/40">
            {response.length}/500
          </p>

          <fieldset className="mt-5">
            <legend className="mb-2 text-sm text-foam/60">Kind of action</legend>
            <div className="flex flex-wrap gap-2">
              {ACTION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActionType(type)}
                  className={`min-h-11 rounded-full border px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand ${
                    actionType === type
                      ? "border-sand bg-sand/20 text-sand"
                      : "border-foam/20 text-foam/80"
                  }`}
                >
                  {ACTION_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </fieldset>

          {error && (
            <p className="mt-4 text-sm text-rose" role="alert">
              {error}
            </p>
          )}
          {done && (
            <p className="mt-4 text-sm text-sand" role="status">
              Thank you. Your care is now part of this lineage.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !response.trim()}
            className="mt-6 min-h-12 w-full rounded-full bg-sand px-5 py-3 text-navy transition hover:bg-glow disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seafoam"
          >
            {submitting ? "Saving…" : "Log this act of care"}
          </button>
        </form>

        <section className="mt-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-sand/70">
            Lineage of care
          </h2>
          {actions.length === 0 ? (
            <p className="mt-4 text-foam/60">
              No reflections yet. Yours could be the first.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {actions.map((action) => (
                <li key={action.id} className="border-l border-foam/20 pl-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foam/45">
                    {ACTION_TYPE_LABELS[action.action_type]} ·{" "}
                    {new Date(action.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1 leading-relaxed text-foam/85">
                    {action.response_text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
