// ---------------------------------------------------------------------------
// hint.js — the one quiet invitation. Appears only after nobody has touched the
// water for a while, and only when nothing is being read or carried; fades away
// the moment someone touches. No instructions about timing, ever.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { THOUGHT_STATE as S } from '../state/installationState.js';

export function drawIdleHint(ctx, state, now, dt) {
  const attended = state.drag.active || state.thoughts.some((t) => t.state === S.REVEALING || t.state === S.REVEALED);
  const show = now - state.lastTouchTime > C.IDLE_HINT_DELAY && !attended;
  const a = state.hintAlpha ?? 0;
  state.hintAlpha = Math.min(1, Math.max(0, a + (show ? dt / 3 : -dt / 0.8)));   // arrives slowly, leaves quickly
  if (state.hintAlpha < 0.01) return;

  const { w, h, scale } = state.view;
  const left = C.LEFT_CONTROL_RESERVE * scale;
  ctx.save();
  ctx.font = `italic ${Math.max(11, Math.round(17 * scale))}px ${C.THOUGHT_FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(232, 244, 250, ${0.5 * state.hintAlpha * (0.85 + 0.15 * Math.sin(now * 0.8))})`;
  ctx.fillText(C.IDLE_HINT_TEXT, left + (w - left) / 2, h - 0.055 * h);
  ctx.restore();
}
