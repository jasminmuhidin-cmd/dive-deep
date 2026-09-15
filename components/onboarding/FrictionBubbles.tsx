"use client";

import { FRICTION_OPTIONS, type FrictionItem } from "@/lib/types";

export default function FrictionBubbles({
  selected,
  customText,
  onSelect,
  onCustomText,
}: {
  selected: FrictionItem | null;
  customText: string;
  onSelect: (item: FrictionItem) => void;
  onCustomText: (value: string) => void;
}) {
  const somethingElseOn = selected?.id === "something_else";

  return (
    <div>
      <h2 className="font-serif text-2xl leading-snug text-foam md:text-3xl">
        What keeps this mattering to you?
      </h2>

      <div className="mt-6 flex flex-wrap gap-2.5">
        {FRICTION_OPTIONS.map((option) => {
          const active = selected?.id === option.id;
          const isPersonalize = Boolean(option.personalize);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option)}
              className={`min-h-11 rounded-full border px-4 py-2.5 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand ${
                isPersonalize
                  ? active
                    ? "border-rose bg-rose/25 text-sand"
                    : "border-dashed border-rose/50 bg-rose/10 text-rose hover:border-rose"
                  : active
                    ? "border-sand/70 bg-sand/20 text-sand shadow-[0_0_24px_rgba(233,214,140,0.15)]"
                    : "border-foam/15 bg-depth/40 text-foam/80 hover:border-foam/30"
              }`}
            >
              {isPersonalize ? `${option.label} — write your own` : option.label}
            </button>
          );
        })}
      </div>

      {somethingElseOn && (
        <label className="mt-4 block">
          <span className="sr-only">Your own response</span>
          <input
            value={customText}
            onChange={(e) => onCustomText(e.target.value.slice(0, 120))}
            placeholder="Write your own…"
            className="min-h-12 w-full rounded-full border border-rose/40 bg-depth/50 px-5 py-3 text-foam placeholder:text-foam/35 focus:border-rose focus:outline-none"
            autoFocus
          />
        </label>
      )}
    </div>
  );
}
