// ---------------------------------------------------------------------------
// ripple.js — one ripple system, several ripple types, all carried by the water.
//
// Every ripple is the same kind of travelling wave packet; the type only changes its
// scale, speed, duration, strength and how the water treats it (see RIPPLE_TYPES in constants.js):
//
//   movement    presence / movement in front of the camera   small, subtle — pulled into a wake
//   wake        the trailing crescents behind a moving person
//   touch       a finger on the water                         small and still fairly round
//   thought     a new thought entering                        wide, strong, slow — then carried sideways
//   collective  an artefact added to the collective           the largest, slowest, longest
//   (+ ambient / reveal: quiet local swells)
//
// A ripple is NOT drawn as a perfect circle. Each one:
//   • is carried and sheared by the local current as it ages (different parts of the ring
//     travel at different speeds, because the current differs from place to place);
//   • may be drawn out along the current (`stretch`) and may be only a partial arc (`sector`);
//   • has a slightly uneven radius that slowly changes, so no ring is mathematically round;
//   • gets a little random variation in speed, size, wavelength and phase;
//   • leaves a very faint remnant after its main life, which the current keeps carrying away.
//
// The water (water.js) renders ripples into its height field using the same geometry; this
// file owns their life cycle, the geometry helpers, how they stir the thoughts they pass through,
// and the faint drawn "wave front" that makes the large ripples unmistakable.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { rgba } from './palette.js';
import { clamp, smoothstep } from '../utils/math.js';

const TAU = Math.PI * 2;
const TAIL_AMP = 0.16;          // remnant strength, as a fraction of the ripple's own strength
const CARRY_MAX_AGE = 16;       // s: the current stops accumulating sideways shear beyond this
const rnd = (a, b) => a + Math.random() * (b - a);

/** The four ripple kinds the installation is described with, mapped onto the ring types below. */
const TYPE_ALIASES = { thoughtEntry: 'thought', camera: 'movement', artefact: 'collective' };

export class RippleSystem {
  /** @param {object} state installation state (for view.scale and, if present, state.flow) */
  constructor(state) {
    this.state = state;
    this.list = [];
    this._v = { vx: 0, vy: 0 };
  }

  /** the shared flow, if one is running (tests and tools may run without it) */
  get flow() { return this.state.flow || null; }

  /**
   * @param {{x:number,y:number,type?:string,strength?:number,
   *          speedMul?:number,lifeMul?:number,wavelengthMul?:number,delay?:number,
   *          dir?:number, stretch?:number, carry?:number,
   *          sector?:{ahead?:boolean,width?:number}}} o
   *   dir      angle (rad) the ring is drawn out along; defaults to the local current's direction
   *   stretch  1 = round; larger = drawn out along `dir` (default: the type's own)
   *   sector   draw only an arc of the ring: centred ahead of (or behind) `dir`, `width` rad either side
   * @returns the ripple, or null if a per-type cap refused it
   */
  create({ x, y, type = 'touch', strength, speedMul = 1, lifeMul = 1, wavelengthMul = 1, delay = 0,
           dir, stretch, carry, sector = null, maxRadius, duration }) {
    type = TYPE_ALIASES[type] || type;
    let def = C.RIPPLE_TYPES[type];
    // createRipple({ x, y, type, strength, maxRadius, duration }): `duration` (s) and `maxRadius` (px @1080p) are just
    // another way of saying lifeMul and speedMul — every ripple type is the same ring drawn with different parameters.
    if (def && duration > 0) lifeMul *= duration / def.life;
    if (def && maxRadius > 0) speedMul *= maxRadius / (def.speed * def.life * lifeMul * 0.875);
    if (!def) throw new Error(`unknown ripple type "${type}"`);

    if (type === 'ambient' && this.countType('ambient') >= C.MAX_AMBIENT_RIPPLES) return null;
    if (type === 'movement' && this.countType('movement') >= C.MAX_MOVEMENT_RIPPLES) return null;
    if (type === 'rain' && this.countType('rain') >= C.MAX_RAIN_RIPPLES) return null;
    if (type === 'wake' && this.countType('wake') >= C.MAX_WAKE_RIPPLES) return null;

    if (this.list.length >= C.MAX_TOTAL_RIPPLES) {
      // Make room by dropping the least important, oldest ripple — never a big one first.
      let victim = -1;
      for (let i = 0; i < this.list.length; i++) {
        const r = this.list[i];
        if (victim < 0 || r.def.priority < this.list[victim].def.priority ||
            (r.def.priority === this.list[victim].def.priority && r.age > this.list[victim].age)) victim = i;
      }
      if (victim >= 0 && this.list[victim].def.priority <= def.priority) this.list.splice(victim, 1);
      else return null;
    }

    const s = this.state.view.scale;
    const infl = C.RIPPLE_CURRENT_INFLUENCE;

    // Which way is the water going here? Rings are drawn out along it unless told otherwise.
    let angle = dir;
    if (angle === undefined) {
      const f = this.flow ? this.flow.velocityAt(x, y, this._v) : null;
      angle = f && (f.vx * f.vx + f.vy * f.vy) > 1 ? Math.atan2(f.vy, f.vx) : 0;
    }

    // Uneven ring: three slowly turning harmonics of the radius
    const irr = def.irregular * rnd(0.7, 1.3);
    const harm = [1, 2, 3].map((k) => ({
      mag: irr / (k === 1 ? 1 : k === 2 ? 1.7 : 2.8),
      ph: rnd(0, TAU),
      rate: rnd(-0.32, 0.32) * (k === 1 ? 1 : k === 2 ? 1.3 : 1.7),
    }));

    const life = def.life * lifeMul * rnd(0.95, 1.05);
    const r = {
      x, y, type, def,
      strength: (strength ?? def.strength) * rnd(0.9, 1.1),
      age: -delay,                                       // a delayed ripple waits (age < 0) before it opens
      life,
      total: life * (1 + def.tail),                      // main life + the faint remnant the current carries away
      speed: def.speed * s * speedMul * rnd(0.92, 1.08),
      wavelength: def.wavelength * s * wavelengthMul * rnd(0.95, 1.06),
      phase: Math.random(),                              // crest phase offset (periods)
      dir: angle, cd: Math.cos(angle), sd: Math.sin(angle),
      stretch: 1 + ((stretch ?? def.stretch) - 1) * Math.min(1.5, infl),
      carry: (carry ?? def.carry) * infl,
      harm,
      hc: [0, 0, 0, 0, 0, 0],                           // harmonic coefficients at the current age (see ringHarmonics)
      sector: sector ? { sign: sector.ahead === false ? -1 : 1, c0: Math.cos(clamp(sector.width ?? 1.1, 0.2, 3)) } : null,
    };
    this.list.push(r);
    return r;
  }

  /**
   * A person moving through the water: a ripple drawn out along their movement, two short
   * crescents left behind on their path, and a brief pull on the current around them.
   * @param {{x:number,y:number,dir:number,strength:number,speed?:number,moving?:boolean}} o dir in rad; speed 0–1
   */
  createWake({ x, y, dir, strength, speed = 0.5, moving = true }) {
    const W = C.CAMERA_WAKE_STRENGTH;
    const s = this.state.view.scale;
    const lead = this.create({ x, y, type: 'movement', strength, dir, stretch: moving ? 1.35 + 0.4 * W : 1.2 + 0.15 * W });
    if (!lead || !moving || W <= 0) return lead;

    const bx = Math.cos(dir), by = Math.sin(dir);
    const L = C.CAMERA_WAKE_LENGTH * s;
    const wake = C.RIPPLE_TYPES.wake.strength * Math.min(1.5, W);
    [[0.45, 0.30, 0.9], [0.95, 0.75, 0.6]].forEach(([back, delay, k]) => {
      this.create({ x: x - bx * L * back, y: y - by * L * back, type: 'wake', strength: wake * k * rnd(0.85, 1.1),
                    dir, delay, sector: { ahead: true, width: 1.0 } });
    });
    if (this.flow) {                                     // the water near them is pulled along, then relaxes
      const v = 15 * s * W * (0.6 + 0.4 * clamp(speed, 0, 1));
      this.flow.impulse(x, y, bx * v, by * v, { radius: 190, life: 4 });
    }
    return lead;
  }

  /** Ripples in their main life (the fading remnant doesn't count toward a type's cap). */
  countType(type) {
    let n = 0;
    for (const r of this.list) if (r.type === type && r.age <= r.life) n++;
    return n;
  }

  /** Counts per type — for the debug overlay. */
  counts() {
    const out = {};
    for (const r of this.list) if (r.age >= 0) out[r.type] = (out[r.type] || 0) + 1;
    return out;
  }

  update(dt) {
    for (const r of this.list) {
      r.age += dt;
      // As a major ripple fades, it leaves soft broad swells behind at its origin — the current keeps
      // carrying them sideways until they blend back into the ambient water.
      if (!r.remnantDone && r.def.remnant > 0 && !r.sector && r.strength >= 0.85 * r.def.strength && r.age >= r.life * 0.5) {   // the lead ring only
        r.remnantDone = true;
        this._leaveRemnants(r);
      }
    }
    this.list = this.list.filter((r) => r.age < r.total);
  }

  _leaveRemnants(r) {
    const k = r.strength * r.def.remnant;
    [[0, 1.0, 1.0], [2.4, 0.7, 1.35]].forEach(([delay, amp, wl]) => {
      this.create({ x: r.x, y: r.y, type: 'remnant', strength: k * amp, delay, wavelengthMul: wl, speedMul: rnd(0.85, 1.15) });
    });
  }

  /**
   * How much the ripples currently passing through (x, y) stir a thought there.
   * Camera (movement) ripples have `affects: 0`, so presence never disturbs a thought.
   * @returns {{wobble:number, glimmer:number}} each 0–1
   */
  influenceAt(x, y) {
    let sum = 0;
    const flow = this.flow;
    for (const r of this.list) {
      if (r.age <= 0 || r.def.affects <= 0) continue;
      const half = rippleWavelength(r) * 1.6;
      if (flow) flow.velocityAt(x, y, this._v); else { this._v.vx = 0; this._v.vy = 0; }
      const q = ringDistance(r, x, y, this._v);
      const dd = q.dd;
      if (dd > half || dd < -half) continue;
      const u = dd / half;
      let env = 1 - u * u;
      env *= env;
      sum += rippleAmplitude(r) * env * q.w * r.def.affects;
    }
    const v = Math.min(1, sum / 1.6);
    return { wobble: v, glimmer: v };
  }
}

// ---- geometry ----------------------------------------------------------------------
/** Current outer radius in px (slows a little as it ages; after its main life the remnant hardly spreads). */
export function rippleRadius(r) {
  const age = Math.max(0, r.age);
  if (age <= r.life) return r.speed * age * (1 - 0.125 * (age / r.life));
  return r.speed * r.life * 0.875 + r.speed * 0.12 * (age - r.life);
}

/** Current amplitude: soft fade-in, then fades at the type's own rate, then a faint remnant. */
export function rippleAmplitude(r) {
  if (r.age <= 0) return 0;
  const u = r.age / r.life;
  const fadeIn = Math.min(1, r.age / (r.def.life > 10 ? 0.9 : 0.35));
  const main = u < 1 ? Math.pow(1 - u, r.def.decay) : 0;
  let tail = 0;
  if (r.def.tail > 0) {
    const fadeOut = 1 - smoothstep((r.age - 0.75 * r.life) / Math.max(0.01, r.total - 0.75 * r.life));
    tail = TAIL_AMP * smoothstep((u - 0.45) / 0.25) * fadeOut;
  }
  return r.strength * Math.max(main, tail) * fadeIn;
}

/** Wavelength softens a little as the ripple ages, so remnants blend back into the water. */
export function rippleWavelength(r) {
  return r.wavelength * (1 + 0.45 * clamp(r.age / r.total, 0, 1));
}

/** How long (s) the current has been carrying this ripple. */
export const carryTime = (r) => Math.min(Math.max(r.age, 0), CARRY_MAX_AGE);

/** Fill r.hc with the ring's radial-harmonic coefficients [cos1, sin1, cos2, sin2, cos3, sin3] at its current age. */
export function ringHarmonics(r) {
  for (let k = 0; k < 3; k++) {
    const h = r.harm[k];
    const p = h.ph + h.rate * Math.max(0, r.age);
    r.hc[k * 2] = h.mag * Math.cos(p);
    r.hc[k * 2 + 1] = h.mag * Math.sin(p);
  }
  return r.hc;
}

/**
 * Where is (x, y) relative to this ripple's crest, once the ring's stretch, unevenness and the
 * current's carrying are accounted for?
 * @param {{vx:number,vy:number}} vel the local current at (x, y), px/s
 * @returns {{dd:number, w:number}} dd = px outside (+) / inside (−) the crest; w = sector weight 0–1
 */
export function ringDistance(r, x, y, vel) {
  const ct = r.carry * carryTime(r);
  const dx = x - r.x - vel.vx * ct;
  const dy = y - r.y - vel.vy * ct;
  const u = (dx * r.cd + dy * r.sd) / r.stretch;
  const v = -dx * r.sd + dy * r.cd;
  const d = Math.hypot(u, v) || 1e-6;
  const c = u / d, s = v / d;
  const c2 = c * c - s * s, s2 = 2 * c * s;
  const c3 = c * c2 - s * s2, s3 = s * c2 + c * s2;
  const h = ringHarmonics(r);
  const eps = h[0] * c + h[1] * s + h[2] * c2 + h[3] * s2 + h[4] * c3 + h[5] * s3;
  let w = 1;
  if (r.sector) {
    const q = clamp((r.sector.sign * c - r.sector.c0) / (1 - r.sector.c0), 0, 1);
    w = q * q * (3 - 2 * q);
  }
  return { dd: d - rippleRadius(r) * (1 + eps), w };
}

/**
 * A faint luminous ring riding the crest of the big ripples (thought / collective),
 * so a new thought's ripple is clearly legible even against busy water. Calm: thin,
 * soft, and it fades as the ripple travels. It follows the same deformed geometry as the
 * water, so it is carried and stretched with it rather than staying a perfect circle.
 */
export function drawRippleFronts(ctx, ripples, state) {
  const { scale } = state.view;
  const light = state.palette.light;
  const flow = state.flow || null;
  const vel = { vx: 0, vy: 0 };
  ctx.save();
  ctx.lineJoin = 'round';
  for (const r of ripples.list) {
    if (r.age <= 0 || r.def.front <= 0 || r.age >= r.life || r.sector) continue;   // partial arcs get no full drawn ring
    const u = r.age / r.life;
    const base = C.RIPPLE_FRONT_STRENGTH * r.def.front * Math.pow(1 - u, r.def.decay + 0.3) * Math.min(1, r.age / 0.8) * (r.strength / r.def.strength);
    if (base < 0.01) continue;
    ringHarmonics(r);
    const ct = r.carry * carryTime(r);
    const R0 = rippleRadius(r);
    const wl = rippleWavelength(r);
    const rings = [[R0, 1.1, base * 0.7], [Math.max(0, R0 - wl * 1.05), 0.9, base * 0.4], [Math.max(0, R0 - wl * 2.1), 0.8, base * 0.22]];
    for (const [R, lw, alpha] of rings) {
      if (R < 2) continue;
      const steps = R > 300 ? 96 : 56;
      ctx.beginPath();
      for (let k = 0; k <= steps; k++) {
        const th = (k / steps) * TAU, c = Math.cos(th), s = Math.sin(th);
        const c2 = c * c - s * s, s2 = 2 * c * s, c3 = c * c2 - s * s2, s3 = s * c2 + c * s2;
        const eps = r.hc[0] * c + r.hc[1] * s + r.hc[2] * c2 + r.hc[3] * s2 + r.hc[4] * c3 + r.hc[5] * s3;
        const ru = R * (1 + eps) * c * r.stretch, rv = R * (1 + eps) * s;
        let px = r.x + ru * r.cd - rv * r.sd;
        let py = r.y + ru * r.sd + rv * r.cd;
        if (flow && ct > 0) {                             // carried by the current at the ring's own position
          flow.velocityAt(px, py, vel);
          px += vel.vx * ct; py += vel.vy * ct;
        }
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.lineWidth = lw * Math.max(0.7, scale);
      ctx.strokeStyle = rgba(light, alpha);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---- convenience: createRipple({ x, y, type }) -------------------------------------
let active = null;
export function setActiveRippleSystem(system) { active = system; }
/** `createRipple({ x, y, type: 'movement' | 'thought' | 'collective' })` on the running system. */
export function createRipple(opts) { return active ? active.create(opts) : null; }
