// The visitor's buddy: a soft-cornered head with their eyes, mouth and hat, drawn in characters.
//
// One ray is marched per character cell through a small distance field, then lit and coloured
// with the page's accent (--ramp in styles.css), so it belongs with the hub's hourglass. It
// looks at the cursor, blinks, and reacts when a choice changes. Decorative: the canvas carries
// a text description and nothing depends on it. It holds still when the visitor wants calm.
import { faceText } from "./you.js";

const TAU = Math.PI * 2;
const { abs, atan2, cos, floor, max, min, pow, round, sin, sqrt } = Math;
// Math.hypot is several times slower, and this runs a hundred thousand times a frame.
const hypot = (x, y, z = 0) => sqrt(x * x + y * y + z * z);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const SHADE = ".,-~:;=!*#$@";
const NOISE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=?@<>";

// ---- Distance field ---------------------------------------------------------------------
// Units: the head is about 1.6 wide and 1.4 tall, centred at the origin; +z faces the visitor.

const HEAD = 0, HAT = 1, TRIM = 2;
let part = HEAD;

const ellipsoid = (x, y, z, rx, ry, rz) => {
  const k0 = hypot(x / rx, y / ry, z / rz), k1 = hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 === 0 ? -min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
};
const roundBox = (x, y, z, bx, by, bz, r) => {
  const qx = abs(x) - bx + r, qy = abs(y) - by + r, qz = abs(z) - bz + r;
  return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, qy, qz), 0) - r;
};
const capsule = (x, y, z, ax, ay, az, bx, by, bz, r) => {
  const ux = bx - ax, uy = by - ay, uz = bz - az, px = x - ax, py = y - ay, pz = z - az;
  const t = clamp((px * ux + py * uy + pz * uz) / (ux * ux + uy * uy + uz * uz), 0, 1);
  return hypot(px - ux * t, py - uy * t, pz - uz * t) - r;
};
/** An upright cone with its base at y = 0. */
const cone = (x, y, z, height, radius) => {
  const m = hypot(height, radius);
  return max((height * hypot(x, z) + radius * (y - height)) / m, -y);
};

const HATS = {
  none: () => 9,
  cap(x, y, z) {
    const dome = max(ellipsoid(x, y - 0.46, z, 0.86, 0.56, 0.74), 0.5 - y);
    const brim = ellipsoid(x, y - 0.53 + z * 0.06, z - 0.72, 0.6, 0.075, 0.5);
    const button = hypot(x, y - 1.02, z) - 0.075;
    const d = min(dome, brim, button);
    part = d === dome ? HAT : TRIM;
    return d;
  },
  grad(x, y, z) {
    const band = roundBox(x, y - 0.68, z, 0.56, 0.16, 0.48, 0.1);
    const c = 0.7071, rx = c * (x - z), rz = c * (x + z);
    const board = roundBox(rx, y - 0.9, rz, 0.74, 0.045, 0.74, 0.03);
    const cord = min(capsule(x, y, z, 0, 0.96, 0, 0.86, 0.95, 0.24, 0.032), capsule(x, y, z, 0.86, 0.95, 0.24, 0.9, 0.46, 0.28, 0.034));
    const tassel = ellipsoid(x - 0.9, y - 0.38, z - 0.28, 0.085, 0.17, 0.085);
    const d = min(band, board, cord, tassel);
    part = d === band || d === board ? HAT : TRIM;
    return d;
  },
  beanie(x, y, z) {
    const dome = max(ellipsoid(x, y - 0.4, z, 0.88, 0.74, 0.76), 0.4 - y);
    const rim = roundBox(x, y - 0.47, z, 0.9, 0.13, 0.78, 0.12);
    const pom = hypot(x, y - 1.2, z) - 0.18 - 0.02 * sin(x * 34) * sin(y * 34) * sin(z * 34);
    const d = min(dome, rim, pom);
    part = d === dome ? HAT : TRIM;
    return d;
  },
  headphones(x, y, z) {
    const ring = hypot(hypot(x, y - 0.02) - 1.0, z) - 0.085;
    const arch = max(ring, 0.1 - y);
    const ax = abs(x) - 0.93;
    const cup = max(hypot(y + 0.02, z) - 0.31, abs(ax) - 0.12);
    const pad = max(hypot(y + 0.02, z) - 0.17, abs(ax - 0.08) - 0.1);
    const d = min(arch, cup - 0.03, pad - 0.03);
    part = d === arch || d === cup - 0.03 ? HAT : TRIM;
    return d;
  },
  crown(x, y, z) {
    const r = hypot(x, z * 1.1);
    const band = max(abs(r - 0.6) - 0.055, abs(y - 0.78) - 0.17);
    const sector = TAU / 7, a = atan2(z, x), near = round(a / sector) * sector;
    const sx = 0.6 * cos(near), sz = (0.6 * sin(near)) / 1.1;
    const spike = cone(x - sx, y - 0.92, z - sz, 0.36, 0.15);
    const gem = hypot(x - sx, y - 1.3, z - sz) - 0.075;
    const d = min(band, spike, gem);
    part = d === gem ? TRIM : HAT;
    return d;
  },
  cat(x, y, z) {
    const ax = abs(x) - 0.5;
    const ear = cone(ax + (y - 0.5) * 0.1, y - 0.46, z * 1.5, 0.74, 0.44);
    const inner = cone(ax + (y - 0.5) * 0.1, y - 0.5, (z - 0.2) * 1.5, 0.54, 0.27);
    const d = min(ear, inner);
    part = d === inner ? TRIM : HEAD;
    return d * 0.8;
  },
  party(x, y, z) {
    const px = x + (y - 0.6) * 0.16;
    const hat = cone(px, y - 0.54, z, 0.96, 0.6);
    const pom = hypot(x + 0.14, y - 1.5, z) - 0.14;
    const d = min(hat, pom);
    part = d === pom || sin((y + px * 0.5) * 17) > 0.55 ? TRIM : HAT;
    return d * 0.9;
  },
};

function field(x, y, z, hat) {
  const head = roundBox(x, y, z, 0.82, 0.72, 0.68, 0.36);
  const top = hat(x, y, z);
  if (head <= top) { part = HEAD; return head; }
  return top;
}

// ---- The face ---------------------------------------------------------------------------
// Each returns 1 for a lit character, 2 for a dark one that sets it off, 0 for neither.

const ball = (x, y, rx, ry, px, py, pr, dark = 1.34) => {
  const r = hypot(x / rx, y / ry);
  if (r < 1) return hypot((x - px) / pr, (y - py) / (pr * 1.35)) < 1 ? 2 : 1;
  return r < dark ? 2 : 0;
};
const stroke = (d, thick = 0.05) => (d < thick ? 1 : d < thick + 0.055 ? 2 : 0);
const arc = (x, y, r, up) => (up ? y > -0.05 : y < 0.05) ? abs(hypot(x, y) - r) : 9;
const segment = (x, y, ax, ay, bx, by) => {
  const ux = bx - ax, uy = by - ay, t = clamp(((x - ax) * ux + (y - ay) * uy) / (ux * ux + uy * uy), 0, 1);
  return hypot(x - ax - ux * t, y - ay - uy * t);
};

const EYE = {
  round: (x, y, gx, gy) => ball(x, y, 0.145, 0.19, gx, gy, 0.052),
  big: (x, y, gx, gy) => ball(x, y, 0.19, 0.25, gx * 1.4, gy * 1.4, 0.07, 1.24),
  happy: (x, y) => stroke(arc(x, y + 0.07, 0.14, true)),
  sleepy: (x, y) => stroke(arc(x, y - 0.07, 0.14, false)),
  star: (x, y) => { const a = pow(abs(x) / 0.19, 0.62) + pow(abs(y) / 0.23, 0.62); return a < 1 ? 1 : a < 1.22 ? 2 : 0; },
  squint: (x, y, gx, gy, side) => stroke(min(segment(x * side, y, 0.12, 0.13, -0.1, 0), segment(x * side, y, 0.12, -0.13, -0.1, 0))),
  wink: (x, y, gx, gy, side) => (side < 0 ? EYE.round(x, y, gx, gy) : stroke(segment(x, y, -0.13, 0, 0.13, 0))),
};

function shades(u, v) {
  const lens = max(abs(abs(u) - 0.35) - 0.27, abs(v - 0.1) - 0.23);
  if (lens < -0.075) return abs(abs(u) - 0.35 + (v - 0.1) * 0.7 + 0.04) < 0.035 ? 1 : 2;
  if (lens < 0) return 1;
  if (abs(u) < 0.1 && abs(v - 0.2) < 0.055) return 1;
  return abs(u) > 0.6 && abs(v - 0.22) < 0.05 ? 1 : lens < 0.05 ? 2 : 0;
}

const MOUTH = {
  smile: (u, v) => stroke(v < -0.2 ? abs(hypot(u, v + 0.13) - 0.25) : 9),
  flat: (u, v) => stroke(segment(u, v, -0.17, -0.32, 0.17, -0.32)),
  open: (u, v) => { const r = hypot(u / 0.14, (v + 0.33) / 0.17); return r < 0.55 ? 2 : r < 1.05 ? 1 : r < 1.36 ? 2 : 0; },
  cat: (u, v) => stroke(v < -0.2 ? abs(hypot(abs(u) - 0.125, v + 0.23) - 0.125) : 9),
  grin: (u, v) => { const r = hypot(u / 0.32, (v + 0.18) / 0.27); return v < -0.18 && r < 1 ? (abs(v + 0.28) < 0.03 ? 2 : 1) : v < -0.12 && r < 1.22 ? 2 : 0; },
  smirk: (u, v) => stroke(segment(u, v, -0.14, -0.36, 0.22, -0.24)),
};

// ---- Drawing ----------------------------------------------------------------------------

const LIGHT = [-0.36, 0.5, 0.8].map((v, _, l) => v / hypot(...l));
const HUES = 20, LEVELS = 7;

function palette() {
  const found = getComputedStyle(document.documentElement).getPropertyValue("--ramp").match(/#[0-9a-f]{6}/gi);
  const ramp = (found?.length > 2 ? found : ["#7b2ff7", "#f107a3", "#ff8a3d", "#ffd23f"]).map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const styles = [];
  for (let h = 0; h < HUES; h++) {
    const at = (h / (HUES - 1)) * (ramp.length - 1.0001), i = floor(at), f = at - i;
    const rgb = ramp[i].map((v, k) => v + (ramp[i + 1][k] - v) * f);
    for (let l = 0; l < LEVELS; l++) {
      const bright = 0.2 + 0.8 * (l / (LEVELS - 1)), white = l === LEVELS - 1 ? 0.34 : l === LEVELS - 2 ? 0.1 : 0;
      styles.push(`rgb(${rgb.map((v) => round(v * bright + (255 - v * bright) * white)).join(",")})`);
    }
  }
  for (const v of [38, 52, 72, 100, 136, 180, 226]) styles.push(`rgb(${v},${v},${v + 4})`);
  styles.push("#ffffff");
  return styles;
}
const GREY = HUES * LEVELS, WHITE = GREY + 7;

const pointer = { x: 0, y: 0, at: -1e9 };
if (typeof window !== "undefined") {
  window.addEventListener("pointermove", (event) => { pointer.x = event.clientX; pointer.y = event.clientY; pointer.at = performance.now(); }, { passive: true });
}

export class Buddy {
  /**
   * Draw a buddy on a canvas and keep it alive.
   *
   * :param canvas: The canvas. Its parent's box sets the size.
   * :param face: {eyes, mouth, hat}, as in you.js.
   */
  constructor(canvas, face) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.yaw = -0.4; this.pitch = 0.05; this.gazeX = 0; this.gazeY = 0;
    this.clock = 0; this.last = 0; this.nextBlink = 1.6; this.reveal = this.calm ? 1 : 0;
    this.acts = [];
    this.visible = true; this.running = false;
    this.styles = palette();
    this.face = face;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.wake(); }).observe(canvas);
    document.addEventListener("visibilitychange", () => this.wake());
    window.addEventListener("sidequest:look", () => { this.styles = palette(); this.wake(); this.draw(); });
    document.fonts?.ready.then(() => { this.resize(); });
    canvas.addEventListener("click", () => this.react(["hop", "spin", "shake"][floor(Math.random() * 3)]));
    this.wake();
  }

  get calm() { return Boolean(window.SidequestLook?.calm); }

  get face() { return this.look; }
  set face(face) {
    this.look = { ...face };
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", `Your buddy: ${faceText(face)}`);
    if (this.cols) this.draw();
  }

  /** Play a short reaction: "hop", "nod", "shake" or "spin". */
  react(kind) {
    if (this.calm) return;
    this.acts = this.acts.filter((act) => act.kind !== kind);
    this.acts.push({ kind, at: this.clock, lasts: { hop: 0.75, nod: 0.8, shake: 0.7, spin: 1.1 }[kind] });
    this.wake();
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const width = floor(box.width), height = floor(box.height);
    if (width < 24 || height < 24) return;
    const size = min(width, height * 1.12);
    const font = clamp(size / 42, 6, 11.5), dpr = min(window.devicePixelRatio || 1, 2);
    this.ctx.font = `600 ${font}px "Geist Mono", ui-monospace, Consolas, monospace`;
    const cw = this.ctx.measureText("M").width || font * 0.6, ch = round(font * 1.08 * 2) / 2;
    const cols = floor(width / cw), rows = floor(height / ch);
    Object.assign(this, { cols, rows, cw, ch, scale: min(width / 2.35, height / 2.85) });
    this.glyph = new Array(cols * rows);
    this.style = new Int16Array(cols * rows);
    this.canvas.width = round(cols * cw * dpr);
    this.canvas.height = round(rows * ch * dpr);
    this.canvas.style.width = `${cols * cw}px`;
    this.canvas.style.height = `${rows * ch}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.font = `600 ${font}px "Geist Mono", ui-monospace, Consolas, monospace`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.draw();
  }

  wake() {
    if (this.running || this.calm || !this.visible || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now) => {
      if (!this.visible || document.hidden || this.calm || !this.canvas.isConnected) {
        this.running = false;
        if (this.calm) { this.reveal = 1; this.acts = []; this.draw(); }
        return;
      }
      requestAnimationFrame(tick);
      if (now - this.last < 30) return;
      const dt = min(0.06, (now - this.last) / 1000);
      this.last = now;
      this.step(dt, now);
      this.draw();
    };
    requestAnimationFrame(tick);
  }

  step(dt, now) {
    this.clock += dt;
    this.reveal = min(1, this.reveal + dt / 1.1);
    let yaw = sin(this.clock * 0.55) * 0.5, pitch = sin(this.clock * 0.8) * 0.07, gx = sin(this.clock * 0.55) * 0.045, gy = 0;
    if (now - pointer.at < 4000) {
      const box = this.canvas.getBoundingClientRect();
      const dx = (pointer.x - box.left - box.width / 2) / max(320, innerWidth * 0.5), dy = (pointer.y - box.top - box.height / 2) / max(280, innerHeight * 0.5);
      yaw = clamp(dx, -1, 1) * 0.72;
      pitch = clamp(dy, -1, 1) * 0.36;
      gx = clamp(dx * 2, -1, 1) * 0.055;
      gy = -clamp(dy * 2, -1, 1) * 0.06;
    }
    const ease = 1 - pow(0.002, dt);
    this.yaw += (yaw - this.yaw) * ease;
    this.pitch += (pitch - this.pitch) * ease;
    this.gazeX += (gx - this.gazeX) * ease * 1.4;
    this.gazeY += (gy - this.gazeY) * ease * 1.4;
    if (this.clock > this.nextBlink + 0.16) this.nextBlink = this.clock + 1.8 + Math.random() * 3.2;
    this.acts = this.acts.filter((act) => this.clock - act.at < act.lasts);
  }

  draw() {
    if (!this.cols) return;
    const { cols, rows, cw, ch, scale, glyph, style, styles, ctx } = this;
    let yaw = this.yaw, pitch = this.pitch, hop = this.calm ? 0 : sin(this.clock * 1.7) * 0.02, squash = 1, glad = false;
    for (const act of this.acts) {
      const p = (this.clock - act.at) / act.lasts, fade = 1 - p;
      if (act.kind === "hop") { hop += abs(sin(p * Math.PI * 2)) * 0.3 * fade; squash -= max(0, 0.12 * sin(p * Math.PI * 4 + 2.6)) * fade; glad = true; }
      if (act.kind === "nod") pitch += sin(p * TAU * 1.5) * 0.3 * fade;
      if (act.kind === "shake") yaw += sin(p * TAU * 2) * 0.4 * fade;
      if (act.kind === "spin") { yaw += TAU * (p < 0.5 ? 4 * p * p * p : 1 - pow(-2 * p + 2, 3) / 2); glad = true; }
    }
    const blinking = this.clock > this.nextBlink ? max(0.12, abs((this.clock - this.nextBlink) / 0.08 - 1)) : 1;
    const eyes = this.look.eyes, hat = HATS[this.look.hat] || HATS.none;
    const eye = glad && eyes !== "shades" ? EYE.happy : EYE[eyes] || EYE.round;
    const mouth = glad ? MOUTH.grin : MOUTH[this.look.mouth] || MOUTH.smile;
    const tall = this.look.hat !== "none" && this.look.hat !== "headphones";
    const cy0 = tall ? 0.34 : 0.08;

    // Object to world: Rx(pitch) · Ry(yaw). Rays go the other way, with the transpose.
    const c1 = cos(yaw), s1 = sin(yaw), c2 = cos(pitch), s2 = sin(pitch);
    const dirX = s1 * c2, dirY = -s2, dirZ = -c1 * c2;
    style.fill(-1);
    const shown = this.reveal * (rows + 4) - 2, edge = floor(shown);

    for (let r = 0; r < rows; r++) {
      if (r > shown) break;
      const Y = (-((r + 0.5) * ch - (rows * ch) / 2) / scale + cy0 - hop) / squash;
      for (let c = 0; c < cols; c++) {
        const X = ((c + 0.5) * cw - (cols * cw) / 2) / scale;
        const i = r * cols + c;
        if (r === edge && this.reveal < 1) {
          if (abs(X) < 1 && Math.random() < 0.5) { glyph[i] = NOISE[floor(Math.random() * NOISE.length)]; style[i] = WHITE; }
          continue;
        }
        if (X * X + (Y - 0.3) * (Y - 0.3) > 2.1) continue;
        // World ray (X, Y, 3) towards -z, turned into the object's space.
        const wy = Y * c2 + 3 * s2, wz = -Y * s2 + 3 * c2;
        const ox = X * c1 - wz * s1, oy = wy, oz = X * s1 + wz * c1;
        let t = 1.3, hit = false;
        for (let k = 0; k < 40; k++) {
          const d = field(ox + dirX * t, oy + dirY * t, oz + dirZ * t, hat);
          if (d < 0.01) { hit = true; break; }
          t += d * 0.92;
          if (t > 4.8) break;
        }
        if (!hit) continue;
        const x = ox + dirX * t, y = oy + dirY * t, z = oz + dirZ * t, e = 0.015;
        const kind = part;
        const na = field(x + e, y - e, z - e, hat), nb = field(x - e, y - e, z + e, hat), nc = field(x - e, y + e, z - e, hat), nd = field(x + e, y + e, z + e, hat);
        let nx = na - nb - nc + nd, ny = -na - nb + nc + nd, nz = -na + nb - nc + nd;
        const m = sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= m; ny /= m; nz /= m;

        // The face sits on the front of the head.
        if (kind === HEAD && nz > 0.4 && z > 0.3) {
          let mark = 0;
          if (eyes === "shades") mark = shades(x, y);
          else {
            const side = x < 0 ? -1 : 1;
            const ey = (y - 0.13) / (eye === EYE.round || eye === EYE.big || eye === EYE.star || (eye === EYE.wink && side < 0) ? blinking : 1);
            mark = eye(x - side * 0.34, ey, this.gazeX, this.gazeY, side);
          }
          mark ||= mouth(x, y);
          if (mark === 1) { glyph[i] = "@"; style[i] = WHITE; continue; }
          if (mark === 2) continue;
        }

        // Light stays where it is while the buddy turns.
        const wnx = nx * c1 + nz * s1, tz = -nx * s1 + nz * c1;
        const wny = ny * c2 - tz * s2, wnz = ny * s2 + tz * c2;
        const lit = clamp(wnx * LIGHT[0] + wny * LIGHT[1] + wnz * LIGHT[2], 0, 1);
        const lum = clamp(0.24 + lit * 0.76 - (wnz < 0.28 ? (0.28 - wnz) * 1.1 : 0), 0, 1);
        glyph[i] = SHADE[min(11, 2 + floor(lum * 9.6))];
        if (kind === HEAD) style[i] = round(clamp(0.46 + y * 0.46 + x * 0.1, 0, 1) * (HUES - 1)) * LEVELS + round(0.6 + lum * (LEVELS - 1.9));
        else if (kind === HAT) style[i] = GREY + round(1 + lum * 4.6);
        else style[i] = lum > 0.5 ? WHITE : GREY + 6;
      }
    }

    // A soft shadow on the ground.
    for (let c = 0; c < cols; c++) {
      const X = ((c + 0.5) * cw - (cols * cw) / 2) / scale, wide = 0.74 - hop * 0.5;
      if (abs(X) > wide || this.reveal < 1) continue;
      const r = floor(((0.98 + cy0) * scale + (rows * ch) / 2) / ch), i = r * cols + c;
      if (r < rows && style[i] < 0) { glyph[i] = abs(X) < wide * 0.55 ? ":" : "."; style[i] = GREY + (abs(X) < wide * 0.55 ? 1 : 0); }
    }

    ctx.clearRect(0, 0, cols * cw + 2, rows * ch + 2);
    const hx = cw / 2, hy = ch / 2;
    let now = -1;
    for (let i = 0; i < style.length; i++) {
      if (style[i] < 0) continue;
      if (style[i] !== now) { now = style[i]; ctx.fillStyle = styles[now]; }
      const c = i % cols;
      ctx.fillText(glyph[i], c * cw + hx, ((i - c) / cols) * ch + hy);
    }
  }
}
