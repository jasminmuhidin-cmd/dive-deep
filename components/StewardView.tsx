"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ACTION_TYPES,
  ACTION_TYPE_LABELS,
  CATEGORY_LABELS,
  type ActionType,
  type StewardshipAction,
  type Submission,
} from "@/lib/types";

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
        setError("This artifact could not be found.");
        return;
      }

      setSubmission((await subRes.json()) as Submission);
      if (actRes.ok) {
        setActions((await actRes.json()) as StewardshipAction[]);
      }
    } catch {
      setError("Could not load this burden.");
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
      <main className="min-h-screen bg-cream px-5 py-12 text-ink">
        <p className="text-stone">Opening this burden…</p>
      </main>
    );
  }

  if (!submission) {
    return (
      <main className="min-h-screen bg-cream px-5 py-12 text-ink">
        <h1 className="font-serif text-3xl text-charcoal">Not found</h1>
        <p className="mt-3 text-stone">{error}</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, #ebe2d4 0%, transparent 50%), linear-gradient(180deg, #f3eee6, #e8e0d4)",
        }}
      />
      <div className="relative mx-auto max-w-lg px-5 py-10 pb-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-stone">
          Stewardship
        </p>
        <h1 className="mt-3 font-serif text-3xl leading-tight text-charcoal">
          You are holding someone&apos;s burden.
        </h1>
        <p className="mt-3 text-stone">
          Theme: {CATEGORY_LABELS[submission.category]}
        </p>

        <section className="mt-8 space-y-5 border-y border-charcoal/10 py-6">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone">
              Their worry
            </p>
            <p className="mt-2 font-serif text-xl leading-snug text-charcoal">
              {submission.worry_text}
            </p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone">
              Their offering
            </p>
            <p className="mt-2 text-base leading-relaxed text-charcoal">
              {submission.offering_text}
            </p>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="mt-8">
          <label className="block">
            <span className="font-serif text-xl text-charcoal">
              What is one small step, conversation, or reflection you will do in
              solidarity?
            </span>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value.slice(0, 500))}
              rows={4}
              required
              placeholder="One concrete act of care…"
              className="mt-4 w-full resize-none rounded-sm border border-charcoal/15 bg-cream/80 px-4 py-3 text-base leading-relaxed text-ink placeholder:text-stone/60 focus:border-warm focus:outline-none"
            />
          </label>
          <p className="mt-1 font-mono text-xs text-stone">
            {response.length}/500
          </p>

          <fieldset className="mt-5">
            <legend className="mb-2 text-sm text-stone">Kind of action</legend>
            <div className="flex flex-wrap gap-2">
              {ACTION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActionType(type)}
                  className={`min-h-11 rounded-sm border px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm ${
                    actionType === type
                      ? "border-charcoal bg-charcoal text-cream"
                      : "border-charcoal/20 text-charcoal"
                  }`}
                >
                  {ACTION_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </fieldset>

          {error && (
            <p className="mt-4 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
          {done && (
            <p className="mt-4 text-sm text-charcoal" role="status">
              Thank you. Your care is now part of this lineage.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !response.trim()}
            className="mt-6 min-h-12 w-full rounded-sm bg-charcoal px-5 py-3 text-cream transition hover:bg-ink disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
          >
            {submitting ? "Saving…" : "Log this act of care"}
          </button>
        </form>

        <section className="mt-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-stone">
            Lineage of care
          </h2>
          {actions.length === 0 ? (
            <p className="mt-4 text-stone">
              No reflections yet. Yours could be the first.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {actions.map((action) => (
                <li
                  key={action.id}
                  className="border-l border-charcoal/20 pl-4"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone">
                    {ACTION_TYPE_LABELS[action.action_type]} ·{" "}
                    {new Date(action.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1 leading-relaxed text-charcoal">
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
