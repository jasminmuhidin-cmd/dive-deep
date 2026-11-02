"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import type { Submission } from "@/lib/types";

const MAX_RESULTS = 8;

/** Find a thought by what it says, and dive straight to it */
export default function DiveSearch({
  submissions,
  sectionOf,
  onPick,
  onClose,
}: {
  submissions: Submission[];
  /** Which part of the dive a thought sits in */
  sectionOf: (s: Submission) => string;
  onPick: (s: Submission) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      q
        ? submissions
            .filter((s) => [s.worry_text, s.key_worry, s.theme].some((field) => field?.toLowerCase().includes(q)))
            .slice(0, MAX_RESULTS)
        : [],
    [q, submissions],
  );

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Search the thoughts"
      className="fixed inset-0 z-50 overflow-y-auto bg-[#d2e3e6]/80 text-ink backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mx-auto max-w-lg px-6 pb-10 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <div className="flex items-center gap-3 border-b border-ink/40">
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
          {/* at 16px, so phones don't zoom in on it */}
          <span className="relative flex min-h-12 min-w-0 flex-1 items-center">
          <input
            ref={inputRef}
            // a plain field, so the browser doesn't add its own clear button beside ours
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search the thoughts"
            aria-label="Search the thoughts"
            className="w-full bg-transparent text-[16px] placeholder:text-ink/65 focus:outline-none"
          />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="-mr-2 grid h-11 w-11 place-items-center rounded-full transition hover:bg-ink/10"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-ink/15">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="block w-full py-4 text-left transition hover:opacity-70"
                >
                  <span className="dive-eyebrow block">{sectionOf(s)}</span>
                  <span className="mt-1 block">{s.worry_text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q && results.length === 0 && (
          <p className="mt-6 opacity-70">Nothing in the water matches that yet.</p>
        )}
      </div>
    </motion.div>
  );
}
