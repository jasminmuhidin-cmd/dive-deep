"use client";

import { useEffect, useState } from "react";
import type { Submission } from "@/lib/types";

export type ThoughtPlacement = {
  id: string;
  text: string;
  /** 0–1 from left */
  x: number;
  /** 0–1 from top (CSS) */
  y: number;
  /** Phase for floating drift */
  phase: number;
};

function hash01(s: string, salt: number): number {
  let h = salt * 374761393;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 1103515245);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * The whole of what someone wrote at the kiosk, as they wrote it:
 * "I care about …", then "because …" on a line of its own if they went deeper.
 * (Their own "I care about" / "because" is dropped, so it's never said twice.)
 */
export function fullThought(s: Submission): string {
  const care = s.worry_text.trim().replace(/^i\s+care\s+about\b[\s.…]*/i, "");
  const because = (s.offering_text ?? "").trim().replace(/^(i\s+care\s+)?because\b[\s.…]*/i, "");
  return because ? `I care about ${care}\nbecause ${because}` : `I care about ${care}`;
}

const MIN_DIST = 0.22;
const PAD_X = 0.14;
const PAD_Y = 0.16;

/** Spread placements so teasers don’t overlap for comfortable taps. */
export function placeThought(
  s: Submission,
  occupied: { x: number; y: number }[] = [],
): ThoughtPlacement {
  let best = {
    x: PAD_X + hash01(s.id, 1) * (1 - 2 * PAD_X),
    y: PAD_Y + hash01(s.id, 2) * (1 - 2 * PAD_Y),
  };
  let bestScore = -1;

  // Try several candidate spots; pick the one farthest from neighbors
  for (let attempt = 0; attempt < 28; attempt++) {
    const x = PAD_X + hash01(s.id, 3 + attempt * 2) * (1 - 2 * PAD_X);
    const y = PAD_Y + hash01(s.id, 4 + attempt * 2) * (1 - 2 * PAD_Y);
    let minD = 1;
    for (const o of occupied) {
      const dx = x - o.x;
      const dy = (y - o.y) * 1.15; // prefer vertical separation a bit more
      minD = Math.min(minD, Math.hypot(dx, dy));
    }
    if (minD > bestScore) {
      bestScore = minD;
      best = { x, y };
    }
    if (minD >= MIN_DIST) break;
  }

  return {
    id: s.id,
    text: fullThought(s),
    x: best.x,
    y: best.y,
    phase: hash01(s.id, 9) * Math.PI * 2,
  };
}

/**
 * Load submissions for projection thoughts + live SSE / poll.
 */
export function useThoughts(limit = 40): ThoughtPlacement[] {
  const [thoughts, setThoughts] = useState<ThoughtPlacement[]>([]);

  useEffect(() => {
    let cancelled = false;

    const upsert = (list: Submission[]) => {
      if (cancelled) return;
      setThoughts((prev) => {
        const map = new Map(prev.map((t) => [t.id, t]));
        const occupied = Array.from(map.values()).map((t) => ({
          x: t.x,
          y: t.y,
        }));
        for (const s of list) {
          if (!s.worry_text?.trim()) continue;
          if (map.has(s.id)) continue;
          const placed = placeThought(s, occupied);
          map.set(s.id, placed);
          occupied.push({ x: placed.x, y: placed.y });
        }
        return Array.from(map.values())
          .slice(-limit)
          .sort((a, b) => a.id.localeCompare(b.id));
      });
    };

    const load = async () => {
      try {
        const res = await fetch("/api/submissions");
        if (!res.ok) return;
        const data = (await res.json()) as Submission[];
        upsert(data.slice(-limit));
      } catch {
        // retry on poll
      }
    };

    load();
    const poll = window.setInterval(load, 12000);

    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/events");
      es.addEventListener("submission", (event) => {
        try {
          const submission = JSON.parse(
            (event as MessageEvent).data,
          ) as Submission;
          upsert([submission]);
        } catch {
          // ignore
        }
      });
    } catch {
      // SSE unavailable
    }

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      es?.close();
    };
  }, [limit]);

  return thoughts;
}
