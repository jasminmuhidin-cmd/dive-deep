"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type Submission,
  type ThoughtResponse,
} from "@/lib/types";
import FishArtefact from "@/components/onboarding/FishArtefact";

export default function GalleryView() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [count, setCount] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [responses, setResponses] = useState<ThoughtResponse[]>([]);
  const [responseText, setResponseText] = useState("");
  const [codeLookup, setCodeLookup] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (category !== "all") params.set("category", category);
      const qs = params.toString();
      const [listRes, countRes] = await Promise.all([
        fetch(`/api/submissions${qs ? `?${qs}` : ""}`),
        fetch("/api/submissions?count=1"),
      ]);
      if (listRes.ok) {
        const data = (await listRes.json()) as Submission[];
        setSubmissions(
          [...data].sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          ),
        );
      }
      if (countRes.ok) {
        const c = (await countRes.json()) as { count: number };
        setCount(c.count);
      }
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, category]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const code = params.get("code");
    if (id || code) {
      fetch(`/api/submissions/${id || code}?include=responses`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.id) {
            setSelected(data);
            setResponses(data.responses || []);
          }
        })
        .catch(() => {});
    }
  }, []);

  async function openThought(s: Submission) {
    setSelected(s);
    setResponseText("");
    try {
      const res = await fetch(
        `/api/responses?submission_id=${encodeURIComponent(s.id)}`,
      );
      if (res.ok) setResponses((await res.json()) as ThoughtResponse[]);
      else setResponses([]);
    } catch {
      setResponses([]);
    }
  }

  async function openRandom() {
    if (!submissions.length) return;
    const s = submissions[Math.floor(Math.random() * submissions.length)];
    await openThought(s);
  }

  async function returnByCode() {
    if (!codeLookup.trim()) return;
    const res = await fetch(
      `/api/submissions/${encodeURIComponent(codeLookup.trim())}?include=responses`,
    );
    if (!res.ok) return;
    const data = await res.json();
    setSelected(data);
    setResponses(data.responses || []);
  }

  async function postResponse() {
    if (!selected || !responseText.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: selected.id,
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

  const countLabel = useMemo(() => {
    const n = count || submissions.length;
    return `${n.toLocaleString()} thought${n === 1 ? "" : "s"} have entered the shared current.`;
  }, [count, submissions.length]);

  return (
    <main className="relative min-h-screen text-ink">
      <div className="ocean-bg pointer-events-none absolute inset-0" />

      <div className="relative mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-16">
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.28em] text-mist/60 transition hover:text-foam"
        >
          deep dive
        </Link>

        <h1 className="mt-6 font-serif text-4xl leading-tight text-foam md:text-6xl">
          What we&apos;ve been carrying
        </h1>
        <p className="mt-4 text-lg text-mist">{countLabel}</p>

        <nav className="mt-10 flex flex-wrap gap-3">
          <WayIn onClick={openRandom} label="Dive deep" hint="Open one at random" />
          <WayIn
            onClick={() => {
              document.getElementById("archive-list")?.scrollIntoView({
                behavior: "smooth",
              });
            }}
            label="Open one thought"
            hint="Browse below"
          />
          <WayIn
            onClick={() => setCategory("all")}
            label="Explore by theme"
            hint="Use the filters"
          />
          <div className="flex min-h-14 items-center gap-2 rounded-full border border-ripple/25 bg-ocean-mid/40 px-4">
            <input
              value={codeLookup}
              onChange={(e) => setCodeLookup(e.target.value)}
              placeholder="QW-… code"
              className="w-28 bg-transparent text-sm text-foam placeholder:text-mist/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={returnByCode}
              className="text-sm text-ripple hover:text-foam"
            >
              Return
            </button>
          </div>
        </nav>

        <div className="mt-10 flex flex-col gap-4 md:flex-row md:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the current…"
              className="min-h-12 w-full rounded-full border border-ripple/20 bg-ocean-mid/50 py-3 pl-11 pr-4 text-foam placeholder:text-mist/40 focus:border-ripple/50 focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <FilterChip
            active={category === "all"}
            onClick={() => setCategory("all")}
            label="All"
          />
          {CATEGORIES.filter((c) => c !== "unspecified").map((c) => (
            <FilterChip
              key={c}
              active={category === c}
              onClick={() => setCategory(c)}
              label={CATEGORY_LABELS[c]}
            />
          ))}
        </div>

        <div id="archive-list" className="mt-12 columns-1 gap-4 sm:columns-2">
          {submissions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openThought(s)}
              className="mb-4 w-full break-inside-avoid rounded-2xl border border-ripple/20 bg-ocean-mid/40 p-5 text-left transition hover:border-ripple/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-mist/55">
                {CATEGORY_LABELS[s.category] || s.theme} · {s.anonymous_code}
              </p>
              <p className="mt-3 font-serif text-xl leading-snug text-foam">
                {s.worry_text}
              </p>
              <p className="mt-3 text-xs text-mist/50">
                Uncovered {s.uncover_count}{" "}
                {s.uncover_count === 1 ? "time" : "times"}
              </p>
            </button>
          ))}
        </div>

        {!loading && submissions.length === 0 && (
          <p className="mt-16 text-center text-mist/60">
            The current is still quiet. Send a ripple from the kiosk.
          </p>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-ocean-deep/80 p-4 backdrop-blur-sm sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          >
            <motion.article
              role="dialog"
              aria-modal
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-ripple/25 bg-ocean-mid p-6 text-foam md:p-8"
            >
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="absolute right-4 top-4 z-10 rounded-sm p-2 text-warm-soft/70 transition hover:bg-warm-soft/10 hover:text-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>

              {selected.fish_form && selected.prompt_type ? (
                <div className="pr-8">
                  <FishArtefact
                    fishForm={selected.fish_form}
                    promptType={selected.prompt_type}
                    thought={selected.worry_text}
                    whyText={selected.why_text}
                    frictions={selected.frictions ?? []}
                    category={selected.category}
                  />
                </div>
              ) : (
                <>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-warm-soft/60">
                    {CATEGORY_LABELS[selected.category]}
                  </p>
                  <h2
                    id="gallery-detail-title"
                    className="mt-3 pr-10 font-serif text-3xl leading-snug"
                  >
                    {selected.worry_text}
                  </h2>
                  {selected.offering_text ? (
                    <div className="mt-8 border-t border-warm-soft/15 pt-6">
                      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-warm-soft/55">
                        Offering
                      </p>
                      <p className="mt-2 text-lg leading-relaxed text-warm-soft/90">
                        {selected.offering_text}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
              <p className="mt-6 font-mono text-xs text-warm-soft/45">
                Released {new Date(selected.created_at).toLocaleString()}
                {selected.is_claimed ? " · someone has stewarded this" : ""}
              </p>
              <Link
                href={`/steward/${selected.id}`}
                className="mt-8 inline-flex min-h-12 items-center rounded-full bg-sand px-5 py-3 text-navy transition hover:bg-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seafoam"
              >
                Steward this thought
              </Link>
            </motion.article>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function WayIn({
  onClick,
  label,
  hint,
}: {
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-h-14 rounded-full border border-ripple/25 bg-ocean-mid/40 px-5 py-3 text-left transition hover:border-ripple/50"
    >
      <span className="block text-sm text-foam">{label}</span>
      <span className="block text-[11px] text-mist/50 group-hover:text-mist/70">
        {hint}
      </span>
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-full border px-4 py-2 text-sm transition ${
        active
          ? "border-ripple bg-ripple/20 text-foam"
          : "border-ripple/20 text-mist hover:border-ripple/40"
      }`}
    >
      {label}
    </button>
  );
}
