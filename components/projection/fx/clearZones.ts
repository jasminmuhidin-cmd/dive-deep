/**
 * Text "clear zones", shared between the text layer (which knows where each
 * thought currently floats) and the water shader (which keeps dots and the
 * body outline out of them). Updated every frame through a ref — no React
 * renders.
 */
export type ClearZone = {
  /** Screen uv, y down. */
  x: number;
  y: number;
  /** Ellipse radii in screen units. */
  rx: number;
  ry: number;
  /** Thought id (teasers), used for the touch nudge. */
  id?: string;
  kind: "teaser" | "revealed";
  /** Has this thought already been revealed by a visitor? */
  read?: boolean;
};

export const MAX_CLEAR_ZONES = 10;
