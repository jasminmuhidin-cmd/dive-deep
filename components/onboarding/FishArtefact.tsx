"use client";

import {
  FISH_FORM_LABELS,
  PROMPT_LABELS,
  type Category,
  type FishForm,
  type FrictionItem,
  type PromptType,
  CATEGORY_LABELS,
} from "@/lib/types";
import CreatureSilhouette from "./CreatureSilhouette";

export default function FishArtefact({
  fishForm,
  promptType,
  thought,
  whyText,
  frictions,
  category,
  compact = false,
}: {
  fishForm: FishForm;
  promptType: PromptType;
  thought: string;
  whyText?: string | null;
  frictions: FrictionItem[];
  category?: Category | null;
  compact?: boolean;
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-3xl border border-foam/15 bg-depth/60 ${
        compact ? "p-5" : "p-6 md:p-8"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 70% 30%, rgba(75,144,141,0.2), transparent 50%), radial-gradient(ellipse at 20% 80%, rgba(198,151,157,0.15), transparent 45%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-6 md:flex-row md:items-start">
        <CreatureSilhouette form={fishForm} size={compact ? 140 : 200} />

        <div className="min-w-0 flex-1 text-center md:text-left">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-sand/70">
            {PROMPT_LABELS[promptType]} · {FISH_FORM_LABELS[fishForm]}
            {category ? ` · ${CATEGORY_LABELS[category]}` : ""}
          </p>
          <p
            className={`mt-3 font-serif leading-snug text-foam ${
              compact ? "text-xl" : "text-2xl md:text-3xl"
            }`}
          >
            {thought}
          </p>
          {whyText?.trim() && (
            <p className="mt-4 text-sm leading-relaxed text-foam/65">
              {whyText}
            </p>
          )}
          {frictions.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
              {frictions.map((f) => (
                <span
                  key={`${f.id}-${f.label}`}
                  className="rounded-full border border-seafoam/40 bg-seafoam/15 px-3 py-1.5 text-xs text-sand"
                >
                  {f.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
