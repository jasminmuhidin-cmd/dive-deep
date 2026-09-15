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
} from "@/lib/types";
import FishArtefact from "@/components/onboarding/FishArtefact";

const TILE_TONES: Record<Category, { bg: string; ink: string; soft: string }> = {
  environment: { bg: "#5f735c", ink: "#f3eee6", soft: "#d5e0d3" },
  community: { bg: "#a88868", ink: "#1c1916", soft: "#f0e6d8" },
  future: { bg: "#6d7f91", ink: "#f3eee6", soft: "#d9e2eb" },
  belonging: { bg: "#8f6d5c", ink: "#f3eee6", soft: "#eadfd6" },
  economy: { bg: "#7a6f63", ink: "#f3eee6", soft: "#e5ddd3" },
};

export default function GalleryView() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Submission | null>(null);

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
      const res = await fetch(`/api/submissions${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as Submission[];
      // Newest first for gallery browsing
      setSubmissions(
        [...data].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      );
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
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const countLabel = useMemo(() => {
    if (loading) return "Searching the archive…";
    if (submissions.length === 0) return "No burdens match this search.";
    return `${submissions.length} quiet weight${submissions.length === 1 ? "" : "s"}`;
  }, [loading, submissions.length]);

  return (
    <main className="relative min-h-screen bg-[#1a1714] text-glow">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse at 15% 0%, rgba(196,164,132,0.18), transparent 45%), radial-gradient(ellipse at 90% 20%, rgba(111,127,145,0.12), transparent 40%), linear-gradient(180deg, #1a1714 0%, #12100e 100%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        <header className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-4 text-warm-soft/70">
            <Link
              href="/"
              className="font-mono text-[11px] uppercase tracking-[0.28em] transition hover:text-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
            >
              Shared Burdens
            </Link>
            <span className="text-warm-soft/30">/</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.22em]">
              Archive
            </span>
          </div>
          <h1 className="mt-5 font-serif text-4xl leading-tight tracking-tight text-glow md:text-6xl">
            A gallery of quiet weights
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-warm-soft/75 md:text-lg">
            Browse every worry released into the installation. Search by word,
            filter by theme, open a card to read its paired offering.
          </p>
        </header>

        <div className="mt-10 flex flex-col gap-4 md:flex-row md:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search submissions</span>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-soft/50"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a word you carry…"
              className="min-h-14 w-full rounded-sm border border-warm-soft/20 bg-[#241f1b]/80 py-3 pl-11 pr-4 text-base text-glow placeholder:text-warm-soft/40 focus:border-warm focus:outline-none"
            />
          </label>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-warm-soft/55 md:min-w-40 md:text-right">
            {countLabel}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <FilterChip
            active={category === "all"}
            onClick={() => setCategory("all")}
            label="All themes"
          />
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c}
              active={category === c}
              onClick={() => setCategory(c)}
              label={CATEGORY_LABELS[c]}
              swatch={TILE_TONES[c].bg}
            />
          ))}
        </div>

        <div className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {submissions.map((submission, index) => {
            const tone = TILE_TONES[submission.category];
            return (
              <motion.button
                key={submission.id}
                type="button"
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(index * 0.02, 0.3) }}
                onClick={() => setSelected(submission)}
                className="mb-4 w-full break-inside-avoid rounded-sm p-5 text-left transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
                style={{ backgroundColor: tone.bg, color: tone.ink }}
              >
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-70"
                  style={{ color: tone.ink }}
                >
                  {CATEGORY_LABELS[submission.category]}
                  {submission.is_claimed ? " · stewarded" : ""}
                </p>
                <p className="mt-3 font-serif text-xl leading-snug md:text-[1.35rem]">
                  {submission.worry_text}
                </p>
              </motion.button>
            );
          })}
        </div>

        {!loading && submissions.length === 0 && (
          <p className="mt-16 text-center text-warm-soft/60">
            Try another word, or clear the theme filter.
          </p>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          >
            <motion.article
              role="dialog"
              aria-modal="true"
              aria-labelledby="gallery-detail-title"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.3 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-sm border border-warm-soft/15 bg-[#241f1b] p-6 text-glow shadow-2xl md:p-8"
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
                    frictions={selected.frictions}
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

function FilterChip({
  active,
  onClick,
  label,
  swatch,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  swatch?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm ${
        active
          ? "border-warm-soft/50 bg-warm-soft/15 text-glow"
          : "border-warm-soft/15 text-warm-soft/70 hover:border-warm-soft/35 hover:text-glow"
      }`}
    >
      {swatch && (
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: swatch }}
          aria-hidden
        />
      )}
      {label}
    </button>
  );
}
