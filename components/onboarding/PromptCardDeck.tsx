"use client";

import { useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PROMPT_CARDS, type PromptType } from "@/lib/types";
import CreatureSilhouette from "./CreatureSilhouette";

export default function PromptCardDeck({
  onSelect,
}: {
  onSelect: (type: PromptType) => void;
}) {
  const [index, setIndex] = useState(0);
  const card = PROMPT_CARDS[index];

  function go(delta: number) {
    setIndex((i) => (i + delta + PROMPT_CARDS.length) % PROMPT_CARDS.length);
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -80 || info.velocity.x < -400) go(1);
    else if (info.offset.x > 80 || info.velocity.x > 400) go(-1);
  }

  return (
    <div className="flex flex-1 flex-col">
      <p className="text-sm text-foam/60">
        Swipe to find the question that fits. Each one shapes a different
        creature.
      </p>

      <div className="relative mt-8 flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={() => go(-1)}
          className="absolute left-0 z-10 hidden min-h-12 min-w-12 items-center justify-center rounded-full border border-foam/20 text-foam/70 transition hover:border-foam/40 hover:text-foam md:flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand"
          aria-label="Previous prompt"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key={card.type}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={onDragEnd}
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md cursor-grab active:cursor-grabbing touch-pan-y"
          >
            <div className="rounded-3xl border border-foam/15 bg-depth/50 p-6 backdrop-blur-sm md:p-8">
              <div className="flex justify-center">
                <CreatureSilhouette form={card.fish} size={160} />
              </div>
              <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-[0.28em] text-sand/80">
                {card.type}
              </p>
              <h2 className="mt-3 text-center font-serif text-2xl leading-snug text-foam md:text-3xl">
                {card.question}
              </h2>
              <p className="mt-3 text-center text-sm text-foam/55">{card.hint}</p>
              <button
                type="button"
                onClick={() => onSelect(card.type)}
                className="mt-8 min-h-14 w-full rounded-full bg-sand px-6 py-3 text-lg text-navy transition hover:bg-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seafoam"
              >
                Dive in
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        <button
          type="button"
          onClick={() => go(1)}
          className="absolute right-0 z-10 hidden min-h-12 min-w-12 items-center justify-center rounded-full border border-foam/20 text-foam/70 transition hover:border-foam/40 hover:text-foam md:flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand"
          aria-label="Next prompt"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-6 flex items-center justify-center gap-2">
        {PROMPT_CARDS.map((c, i) => (
          <button
            key={c.type}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show ${c.type} prompt`}
            className={`h-2.5 rounded-full transition ${
              i === index ? "w-8 bg-sand" : "w-2.5 bg-foam/25 hover:bg-foam/40"
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-foam/40 md:hidden">
        Swipe left or right
      </p>
    </div>
  );
}
