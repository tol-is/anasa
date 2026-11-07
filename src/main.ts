/*!
 * @license © 2026 Apostolos Christodoulou · https://tol.is · All rights reserved.
 */

// ANASA. A drifting dot field whose radius and alpha track a scalar wave; the
// wave's wavelength breathes so the pattern never settles, and a diagonal
// front crosses on a slow cycle, swelling the dots it passes. The pointer is a
// wave source. Theme follows prefers-color-scheme.

const canvas = document.getElementById("field") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const dpr = Math.min(window.devicePixelRatio || 1, 2);
let w = 0;
let h = 0;
const resize = () => {
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};
resize();
new ResizeObserver(resize).observe(canvas);

let ink = "#666";
const scheme = window.matchMedia("(prefers-color-scheme: dark)");
const theme = () => {
  ink = getComputedStyle(document.documentElement).getPropertyValue("--line-hi").trim() || "#666";
};
theme();
scheme.addEventListener("change", theme);

const GAP = 38;
const SWEEP_DIR = Math.PI * 0.28; // front travels down-right
const SWEEP_CX = Math.cos(SWEEP_DIR);
const SWEEP_CY = Math.sin(SWEEP_DIR);
const LEAD = 70; // px of anticipation ahead of the front
const TRAIL = 340; // px of relaxation behind it

// three directional waves: non-parallel, incommensurate wavelengths, own drift
// rates, so the sum is quasi-periodic and never tiles the viewport.
// flat [kx, ky, speed, phase] × 3
const WAVES = [
  0.01157, 0.00354, 1.0, 0,
  -0.00196, 0.00848, -0.73, 2.1,
  -0.00531, -0.00358, 0.41, 4.3,
];

// pointer ripples: emitted along the path, then travel on their own. Nothing
// is displaced; the rings ride the field's brightness.
const POOL = 16;
const CEL = 780; // ring speed, px per unit t
const WID = 44; // crest width, px
const LIFE = 1.6; // units of t before a ring is spent
const STEP = 52; // px of travel between emissions
const rx = new Float32Array(POOL);
const ry = new Float32Array(POOL);
const rt = new Float32Array(POOL).fill(-99);
const ra = new Float32Array(POOL);
let head = 0;
let tx = -1e4;
let ty = -1e4;
let ex = 0;
let ey = 0;
let lastEmit = -99;
let t = 0;

const emit = (x: number, y: number, amp: number) => {
  rx[head] = x;
  ry[head] = y;
  rt[head] = t;
  ra[head] = amp;
  head = (head + 1) % POOL;
  ex = x;
  ey = y;
  lastEmit = t;
};
window.addEventListener(
  "pointermove",
  (ev) => {
    const first = tx < -1e3;
    tx = ev.clientX;
    ty = ev.clientY;
    if (first) {
      ex = tx;
      ey = ty;
      return;
    }
    if (Math.hypot(tx - ex, ty - ey) > STEP) emit(tx, ty, 0.9);
  },
  { passive: true },
);
window.addEventListener("pointerdown", (ev) => emit(ev.clientX, ev.clientY, 2.2), { passive: true });
document.addEventListener("pointerleave", () => {
  tx = -1e4;
  ty = -1e4;
});

const frame = () => {
  t += 0.005;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = ink;

  const span = Math.abs(w * SWEEP_CX) + Math.abs(h * SWEEP_CY);
  const sweep = ((t * 900) % (span + TRAIL + LEAD * 6)) - LEAD * 3;

  // global wavelength breathes, so the field drifts through scales
  const fs = 1 + 0.16 * Math.sin(t * 0.19);

  // a resting cursor still breathes: slow, faint rings
  if (tx > -1e3 && t - lastEmit > 1.15) emit(tx, ty, 0.4);

  for (let gy = 0; gy < h + GAP; gy += GAP) {
    for (let gx = 0; gx < w + GAP; gx += GAP) {
      // warped sample point, breaks the lattice the raw waves make
      const ax = gx + Math.sin(gy * 0.0041 + t * 0.23) * 90;
      const ay = gy + Math.cos(gx * 0.0033 - t * 0.19) * 90;

      let wave = 0;
      for (let i = 0; i < WAVES.length; i += 4) {
        wave += Math.sin((ax * WAVES[i] + ay * WAVES[i + 1]) * fs + t * WAVES[i + 2] + WAVES[i + 3]);
      }
      // gamma on the crest; the three-wave sum rarely reaches ±3, so remap on
      // the range it uses
      const n = Math.min(1, Math.max(0, (wave + 2.3) / 4.6));
      const e = n * n;

      const px = gx + Math.sin(t + gy * 0.02) * 5;
      const py = gy + Math.cos(t + gx * 0.02) * 5;

      // ripples: a crest with trailing troughs, summed as brightness
      let ring = 0;
      for (let i = 0; i < POOL; i++) {
        const age = t - rt[i];
        if (age < 0 || age > LIFE) continue;
        const cr = age * CEL;
        const ox = px - rx[i];
        const oy = py - ry[i];
        const o2 = ox * ox + oy * oy;
        const hi = cr + WID * 2.6;
        if (o2 > hi * hi) continue;
        const lo = cr - WID * 2.6;
        if (lo > 0 && o2 < lo * lo) continue;
        const u = (Math.sqrt(o2) - cr) / WID;
        ring += Math.exp(-u * u) * Math.cos(u * 2.1) * ra[i] * (1 - age / LIFE) * (1 / (1 + cr * 0.0032));
      }

      // signed distance to the travelling front: swell on arrival, relax behind
      const sd = px * SWEEP_CX + py * SWEEP_CY - sweep;
      let s = 0;
      if (sd > 0) s = sd < LEAD ? 1 - sd / LEAD : 0;
      else if (sd > -TRAIL) {
        const u = -sd / TRAIL;
        s = (1 - u) * (1 - u) * Math.cos(u * Math.PI * 1.6);
      }
      const sp = Math.max(0, s);

      const g = Math.max(-0.9, Math.min(1.3, ring));
      ctx.globalAlpha = Math.max(0.02, Math.min(1, 0.05 + e * 0.8 + sp * 0.4 + g * 0.55));
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.2, 0.35 + e * 2.9 + sp * 1.6 + g * 2.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
};

let raf = 0;
const loop = () => {
  frame();
  raf = requestAnimationFrame(loop);
};
document.addEventListener("visibilitychange", () => {
  cancelAnimationFrame(raf);
  if (!document.hidden) raf = requestAnimationFrame(loop);
});
raf = requestAnimationFrame(loop);
