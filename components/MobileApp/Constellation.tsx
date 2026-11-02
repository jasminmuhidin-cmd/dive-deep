"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { motion } from "framer-motion";
import {
  CATEGORY_LABELS,
  PROMPT_LABELS,
  type Submission,
  type ThoughtResponse,
} from "@/lib/types";
import { seeded } from "./seeded";

/** Seconds between each star lighting up */
const STEP = 0.22;

export type StarNode = {
  key: string;
  /** Star radius in px — the thought itself is the brightest */
  size: number;
  content: ReactNode;
};

type Point = { x: number; y: number };

/**
 * A thought unfolded as a constellation: a chain of stars drawn out of the
 * creature that carried it, each star holding one part of the thought.
 */
export default function Constellation({
  submission,
  tint,
  anchorRef,
  onClose,
}: {
  submission: Submission;
  tint: string;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const [responses, setResponses] = useState<ThoughtResponse[]>([]);
  const [responseText, setResponseText] = useState("");
  const [posting, setPosting] = useState(false);

  // sample thoughts aren't in the database, so there's nothing to load or reply to
  const sample = Boolean(submission.is_sample);

  useEffect(() => {
    if (sample) return;
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
  }, [submission.id, sample]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  const label = [
    submission.prompt_type ? PROMPT_LABELS[submission.prompt_type] : null,
    submission.category !== "unspecified"
      ? CATEGORY_LABELS[submission.category]
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const nodes: StarNode[] = [];
  if (label) {
    nodes.push({
      key: "label",
      size: 3,
      content: (
        <p className="text-xs" style={{ color: tint }}>
          {label}
        </p>
      ),
    });
  }
  nodes.push({
    key: "thought",
    size: 6,
    content: submission.key_worry ? (
      <>
        <h3 className="font-serif text-2xl leading-snug text-ink">
          {submission.key_worry}
        </h3>
        <p className="mt-3 text-xs text-ink/45">
          What they said
        </p>
        <p className="mt-1 leading-relaxed text-ink/80">
          &ldquo;{submission.worry_text}&rdquo;
        </p>
      </>
    ) : (
      <p className="font-serif text-2xl leading-snug text-ink">
        {submission.worry_text}
      </p>
    ),
  });
  if (submission.why_text?.trim()) {
    nodes.push({
      key: "why",
      size: 3.5,
      content: <p className="leading-relaxed text-ink/70">{submission.why_text}</p>,
    });
  }
  if (submission.offering_text?.trim()) {
    nodes.push({
      key: "offering",
      size: 3.5,
      content: (
        <>
          <p className="text-xs text-ink/45">
            Offering
          </p>
          <p className="mt-1 leading-relaxed text-ink/80">{submission.offering_text}</p>
        </>
      ),
    });
  }
  for (const f of submission.frictions ?? []) {
    nodes.push({
      key: `friction-${f.id}-${f.label}`,
      size: 2.5,
      content: <p className="text-sm italic text-ink/60">{f.label}</p>,
    });
  }
  nodes.push({
    key: "count",
    size: 2.5,
    content: (
      <p className="text-[13px] text-ink/45">
        Uncovered by {submission.uncover_count}{" "}
        {submission.uncover_count === 1 ? "person" : "people"}
      </p>
    ),
  });
  for (const r of responses) {
    nodes.push({
      key: `response-${r.id}`,
      size: 3,
      content: (
        <>
          <p className="text-xs text-ink/40">
            Response · {new Date(r.created_at).toLocaleDateString()}
          </p>
          <p className="mt-1 font-serif text-lg leading-relaxed text-ink/90">
            {r.response_text}
          </p>
        </>
      ),
    });
  }
  nodes.push({
    key: "reply",
    size: 2.5,
    content: sample ? (
      <div>
        <p className="text-sm leading-relaxed text-ink/55">
          This is a sample thought for the prototype — replies open once live responses are in.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-11 px-2 text-sm text-ink/50 transition hover:text-ink"
        >
          Let it drift
        </button>
      </div>
    ) : (
      <div>
        <label className="block">
          <span className="sr-only">Add your own star</span>
          <textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={responses.length ? "Add your own star…" : "Be the first to respond…"}
            className="w-full resize-none rounded-2xl border border-ink/15 bg-paper/80 px-4 py-3 text-base leading-relaxed text-ink placeholder:text-ink/35 focus:outline-none"
            style={{ borderColor: `${tint}55` }}
          />
        </label>
        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            onClick={postResponse}
            disabled={posting || !responseText.trim()}
            className="min-h-11 rounded-full border px-5 py-2 text-sm text-ink transition disabled:opacity-40"
            style={{ borderColor: `${tint}88` }}
          >
            {posting ? "Sending…" : "Send"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-2 text-sm text-ink/50 transition hover:text-ink"
          >
            Let it drift
          </button>
        </div>
      </div>
    ),
  });

  return <StarChain nodes={nodes} tint={tint} anchorRef={anchorRef} seed={submission.id} />;
}

/**
 * Stars lighting up one after another, joined by lines drawn out of `anchorRef`,
 * each star holding one piece of content.
 */
export function StarChain({
  nodes,
  tint,
  anchorRef,
  seed,
}: {
  nodes: StarNode[];
  tint: string;
  anchorRef: RefObject<HTMLElement | null>;
  /** Keeps each star's indent stable between renders */
  seed: string;
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const starRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Re-measure star positions whenever the layout settles (text wrap, new responses).
  const nodeCount = nodes.length;
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const base = wrap.getBoundingClientRect();
      const pts: Point[] = [];
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (anchor) {
        pts.push({
          x: anchor.left + anchor.width / 2 - base.left,
          y: anchor.bottom - 6 - base.top,
        });
      }
      for (const el of starRefs.current.slice(0, nodeCount)) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        pts.push({
          x: r.left + r.width / 2 - base.left,
          y: r.top + r.height / 2 - base.top,
        });
      }
      setPoints(pts);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [anchorRef, nodeCount]);

  return (
    <div ref={wrapRef} className="relative pb-4 pt-2">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        {points.slice(1).map((p, i) => {
          const from = points[i];
          return (
            <motion.line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={p.x}
              y2={p.y}
              stroke={tint}
              strokeOpacity={0.45}
              strokeWidth={1}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: i * STEP, duration: STEP * 1.6, ease: "easeOut" }}
            />
          );
        })}
      </svg>

      {nodes.map((node, i) => {
        const offset = 4 + seeded(`${seed}-${node.key}`) * 24;
        return (
          <motion.div
            key={node.key}
            className="relative flex items-start gap-4 py-3 pr-5"
            style={{ paddingLeft: `${offset}%` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * STEP + STEP, duration: 0.6 }}
          >
            <span
              ref={(el) => {
                starRefs.current[i] = el;
              }}
              className="dive-star mt-2 block shrink-0 rounded-full"
              style={{
                width: node.size * 2,
                height: node.size * 2,
                background: "#fffaf0",
                boxShadow: `0 0 ${node.size * 3}px ${node.size}px ${tint}`,
                animationDelay: `-${seeded(node.key) * 3}s`,
              }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">{node.content}</div>
          </motion.div>
        );
      })}
    </div>
  );
}
