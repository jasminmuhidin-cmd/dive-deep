"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Pencil, Undo2 } from "lucide-react";
import type { Submission } from "@/lib/types";
import { CATEGORY_LABELS, PROMPT_LABELS } from "@/lib/types";

type Tool = "pencil" | "eraser";

interface StrokePoint {
  x: number;
  y: number;
}

interface Stroke {
  tool: Tool;
  color: string;
  width: number;
  points: StrokePoint[];
}

const PENCIL_COLORS = ["#e9d68c", "#c6979d", "#4b908d", "#147a90", "#f4efe4"];

/** Safe center zone as fractions of canvas — drawing is blocked here */
const SAFE = { x: 0.22, y: 0.28, w: 0.56, h: 0.44 };

function inSafeZone(x: number, y: number, w: number, h: number) {
  return (
    x >= w * SAFE.x &&
    x <= w * (SAFE.x + SAFE.w) &&
    y >= h * SAFE.y &&
    y <= h * (SAFE.y + SAFE.h)
  );
}

export default function DecorateCanvas({
  exchange,
  onBack,
  onComplete,
}: {
  exchange: Submission;
  onBack: () => void;
  onComplete: (compositeDataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState(PENCIL_COLORS[0]);
  const [canUndo, setCanUndo] = useState(false);
  const [compositing, setCompositing] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = Number(canvas.dataset.cssW || canvas.clientWidth);
    const h = Number(canvas.dataset.cssH || canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Draw strokes onto an offscreen layer so eraser doesn't punch the UI chrome
    const layer = document.createElement("canvas");
    layer.width = canvas.width;
    layer.height = canvas.height;
    const lctx = layer.getContext("2d")!;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (const stroke of strokesRef.current) {
      paintStroke(lctx, stroke);
    }
    if (currentRef.current) {
      paintStroke(lctx, currentRef.current);
    }

    ctx.drawImage(layer, 0, 0, w, h);

    // protected center outline only
    const sx = w * SAFE.x;
    const sy = h * SAFE.y;
    const sw = w * SAFE.w;
    const sh = h * SAFE.h;
    ctx.strokeStyle = "rgba(233, 214, 140, 0.28)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, sx, sy, sw, sh, 24);
    ctx.stroke();

    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = "rgba(244, 239, 228, 0.12)";
    roundRect(ctx, 12, 12, w - 24, h - 24, 28);
    ctx.stroke();
    ctx.setLineDash([]);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = parent?.clientWidth || 600;
      const cssH = Math.min(window.innerHeight * 0.55, 520);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // store logical size on dataset for hit testing
      canvas.dataset.cssW = String(cssW);
      canvas.dataset.cssH = String(cssH);
      redraw();
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [exchange, redraw]);

  const localPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = localPoint(e);
    const w = Number(canvas.dataset.cssW || canvas.clientWidth);
    const h = Number(canvas.dataset.cssH || canvas.clientHeight);
    if (inSafeZone(x, y, w, h)) return;

    currentRef.current = {
      tool,
      color: tool === "eraser" ? "erase" : color,
      width: tool === "eraser" ? 28 : 3.5,
      points: [{ x, y }],
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = localPoint(e);
    const w = Number(canvas.dataset.cssW || canvas.clientWidth);
    const h = Number(canvas.dataset.cssH || canvas.clientHeight);
    if (inSafeZone(x, y, w, h)) {
      // end stroke at edge of safe zone
      return;
    }
    currentRef.current.points.push({ x, y });
    redraw();
  };

  const onPointerUp = () => {
    if (currentRef.current && currentRef.current.points.length > 0) {
      strokesRef.current.push(currentRef.current);
      setCanUndo(true);
    }
    currentRef.current = null;
    redraw();
  };

  const undo = () => {
    strokesRef.current.pop();
    setCanUndo(strokesRef.current.length > 0);
    redraw();
  };

  async function handlePrint() {
    setCompositing(true);
    try {
      const dataUrl = await compositePrint(exchange, strokesRef.current);
      onComplete(dataUrl);
    } finally {
      setCompositing(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="font-serif text-3xl leading-snug text-foam md:text-4xl">
        Decorate their words
      </h2>
      <p className="mt-3 max-w-lg text-foam/60">
        Someone else&apos;s thought sits in the centre. Draw around the edges —
        leave their words untouched.
      </p>

      <div className="relative mt-6 overflow-hidden rounded-3xl border border-foam/15 bg-depth/50">
        <canvas
          ref={canvasRef}
          className="block w-full touch-none"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        {/* Center text overlay (protected) */}
        <div
          className="pointer-events-none absolute flex flex-col items-center justify-center px-6 text-center"
          style={{
            left: `${SAFE.x * 100}%`,
            top: `${SAFE.y * 100}%`,
            width: `${SAFE.w * 100}%`,
            height: `${SAFE.h * 100}%`,
          }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-sand/70">
            From another person
            {exchange.prompt_type
              ? ` · ${PROMPT_LABELS[exchange.prompt_type]}`
              : ""}
            {` · ${CATEGORY_LABELS[exchange.category]}`}
          </p>
          <p className="mt-3 font-serif text-lg leading-snug text-foam md:text-xl">
            {exchange.worry_text}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ToolButton
          active={tool === "pencil"}
          onClick={() => setTool("pencil")}
          label="Pencil"
        >
          <Pencil className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          active={tool === "eraser"}
          onClick={() => setTool("eraser")}
          label="Eraser"
        >
          <Eraser className="h-4 w-4" />
        </ToolButton>
        <ToolButton active={false} onClick={undo} label="Undo" disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </ToolButton>

        <div className="ml-2 flex gap-2">
          {PENCIL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                setTool("pencil");
              }}
              aria-label={`Color ${c}`}
              className={`h-8 w-8 rounded-full border-2 transition ${
                color === c && tool === "pencil"
                  ? "border-foam scale-110"
                  : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-3 pt-8">
        <button
          type="button"
          onClick={onBack}
          className="min-h-12 min-w-28 rounded-full border border-foam/20 px-5 py-3 text-foam/80"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handlePrint}
          disabled={compositing}
          className="min-h-12 min-w-40 rounded-full bg-sand px-5 py-3 text-navy transition hover:bg-glow disabled:opacity-50"
        >
          {compositing ? "Compositing…" : "Print this exchange"}
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border px-3 transition disabled:opacity-35 ${
        active
          ? "border-sand bg-sand/20 text-sand"
          : "border-foam/20 text-foam/75 hover:border-foam/40"
      }`}
    >
      {children}
      <span className="hidden text-sm sm:inline">{label}</span>
    </button>
  );
}

function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
) {
  if (stroke.points.length < 1) return;
  ctx.save();
  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color;
  }
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  if (stroke.points.length === 1) {
    ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y);
  }
  ctx.stroke();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** High-res print composite: border artwork + protected stranger text */
export async function compositePrint(
  exchange: Submission,
  strokes: Stroke[],
): Promise<string> {
  const W = 1800;
  const H = 2400;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#2d3651");
  bg.addColorStop(0.5, "#1a2033");
  bg.addColorStop(1, "#121826");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // subtle glow
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.4, 40, W * 0.5, H * 0.4, W * 0.6);
  glow.addColorStop(0, "rgba(20,122,144,0.25)");
  glow.addColorStop(1, "rgba(18,24,38,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // scale strokes from logical decorate canvas (~600x520) — use SAFE-relative mapping
  // Decorate canvas logical size varies; strokes are in CSS pixels of that canvas.
  // We map assuming strokes were drawn on a surface with same SAFE fractions.
  // Estimate source size from stroke bounds or default.
  let srcW = 600;
  let srcH = 520;
  for (const s of strokes) {
    for (const p of s.points) {
      srcW = Math.max(srcW, p.x + 40);
      srcH = Math.max(srcH, p.y + 40);
    }
  }

  const scaleX = W / srcW;
  const scaleY = H / srcH;

  // Drawings on separate layer so eraser only affects ink
  const layer = document.createElement("canvas");
  layer.width = W;
  layer.height = H;
  const lctx = layer.getContext("2d")!;

  for (const stroke of strokes) {
    const scaled: Stroke = {
      ...stroke,
      width: stroke.width * ((scaleX + scaleY) / 2),
      points: stroke.points.map((p) => ({
        x: p.x * scaleX,
        y: p.y * scaleY,
      })),
    };
    paintStroke(lctx, scaled);
  }
  ctx.drawImage(layer, 0, 0);

  // center text panel
  const sx = W * SAFE.x;
  const sy = H * SAFE.y;
  const sw = W * SAFE.w;
  const sh = H * SAFE.h;

  ctx.fillStyle = "rgba(244, 239, 228, 0.92)";
  roundRect(ctx, sx, sy, sw, sh, 36);
  ctx.fill();

  ctx.fillStyle = "#2d3651";
  ctx.font = "500 28px IBM Plex Mono, monospace";
  ctx.textAlign = "center";
  const label = [
    "FROM ANOTHER PERSON",
    exchange.prompt_type ? PROMPT_LABELS[exchange.prompt_type].toUpperCase() : null,
    CATEGORY_LABELS[exchange.category].toUpperCase(),
  ]
    .filter(Boolean)
    .join("  ·  ");
  ctx.fillText(label, W / 2, sy + 70);

  ctx.fillStyle = "#121826";
  ctx.font = "500 52px Fraunces, Georgia, serif";
  wrapText(ctx, exchange.worry_text, W / 2, sy + 140, sw - 100, 64);

  if (exchange.why_text) {
    ctx.fillStyle = "#4b908d";
    ctx.font = "400 28px Source Sans 3, sans-serif";
    wrapText(ctx, exchange.why_text, W / 2, sy + sh * 0.62, sw - 120, 38);
  }

  ctx.fillStyle = "#8a9aa8";
  ctx.font = "400 24px IBM Plex Mono, monospace";
  ctx.fillText("deep dive  ·  keep, gift, or leave behind", W / 2, H - 80);

  return canvas.toDataURL("image/png");
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
