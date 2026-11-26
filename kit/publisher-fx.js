// The look of an activity group's page: a turning ASCII solid, filters for the activity list
// and a light that follows the cursor over the cards. Decorative: the list works without it.
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const games = document.body.dataset.brand === "games";
const COLORS = ["#7b2ff7", "#c02bd8", "#f107a3", "#ff2d75", "#ff5f6d", "#ff8a3d", "#ffb627", "#ffd23f"];

// ---- The solid: a die for the games club, a folded-paper gem for the maker space --------
const points = [];
function tile(a, ab, ac, n, kind, steps = 46) {
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= (kind === "tri" ? steps - i : steps); j++) {
      const u = i / steps, v = j / steps;
      let pip = false;
      if (Array.isArray(kind)) pip = kind.some(([x, y]) => Math.hypot(u - x, v - y) < 0.1);
      points.push([0, 1, 2].map((k) => a[k] + ab[k] * u + ac[k] * v).concat(n, pip ? 1 : 0));
    }
  }
}
if (games) {
  const L = 0.25, M = 0.5, H = 0.75, s = 0.86;
  const pips = [[[M, M]], [[L, L], [H, H]], [[L, L], [M, M], [H, H]], [[L, L], [L, H], [H, L], [H, H]], [[L, L], [L, H], [M, M], [H, L], [H, H]], [[L, L], [L, M], [L, H], [H, L], [H, M], [H, H]]];
  [[0, 1, 2, 1, 0], [0, 1, 2, -1, 5], [1, 2, 0, 1, 1], [1, 2, 0, -1, 4], [2, 0, 1, 1, 2], [2, 0, 1, -1, 3]].forEach(([axis, p, q, sign, face]) => {
    const a = [0, 0, 0], ab = [0, 0, 0], ac = [0, 0, 0], n = [0, 0, 0];
    a[axis] = sign * s; a[p] = -s; a[q] = -s; ab[p] = 2 * s; ac[q] = 2 * s; n[axis] = sign;
    tile(a, ab, ac, n, pips[face]);
  });
} else {
  // An octahedron, like a folded paper gem.
  for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) {
    const a = [x * 1.1, 0, 0], b = [0, y * 1.4, 0], c = [0, 0, z * 1.1];
    const n = [x / 1.1, y / 1.4, z / 1.1], m = Math.hypot(...n);
    tile(a, b.map((v, k) => v - a[k]), c.map((v, k) => v - a[k]), n.map((v) => v / m), "tri", 70);
  }
}

const canvas = document.querySelector("#group-art");
const ctx = canvas?.getContext("2d");
const pointer = { x: 0, y: 0 };
let turn = 0, spin = 0, visible = true, last = 0;
function draw() {
  const box = canvas.parentElement.getBoundingClientRect(), size = Math.min(box.width, 520);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(size * dpr)) { canvas.width = canvas.height = Math.round(size * dpr); canvas.style.width = canvas.style.height = `${size}px`; }
  const cw = 7.2, ch = 12, cols = Math.floor(size / cw), rows = Math.floor(size / ch), k = size * 0.29;
  const depth = new Float32Array(cols * rows).fill(-9), cells = new Array(cols * rows);
  const ay = turn + pointer.x * 0.9, ax = 0.5 + turn * 0.37 + pointer.y * 0.6;
  const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
  const rotate = (x, y, z) => { const X = cy * x + sy * z, Z = -sy * x + cy * z; return [X, cx * y - sx * Z, sx * y + cx * Z]; };
  const ramp = ".,-~:;=!*#$@";
  for (const [x, y, z, nx, ny, nz, pip] of points) {
    const n = rotate(nx, ny, nz);
    if (n[2] <= 0.02) continue;
    const p = rotate(x, y, z), c = Math.floor((size / 2 + p[0] * k) / cw), r = Math.floor((size / 2 - p[1] * k) / ch), i = r * cols + c;
    if (c < 0 || c >= cols || r < 0 || r >= rows || p[2] <= depth[i]) continue;
    depth[i] = p[2];
    const light = Math.max(0, -0.45 * n[0] + 0.6 * n[1] + 0.66 * n[2]);
    cells[i] = pip ? ["@", "#fff"] : [ramp[Math.min(11, 3 + Math.floor(light * 8))], COLORS[Math.max(0, Math.min(7, Math.floor((p[1] + 1.3) * 3)))], 0.6 + light * 0.4];
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.font = '600 11px "Geist Mono", ui-monospace, monospace';
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    ctx.globalAlpha = cells[i][2] ?? 1;
    ctx.fillStyle = cells[i][1];
    ctx.fillText(cells[i][0], (i % cols) * cw, (Math.floor(i / cols) + 1) * ch);
  }
}
if (ctx) {
  document.fonts?.load('600 11px "Geist Mono"').catch(() => {});
  draw();
  addEventListener("pointermove", (event) => { pointer.x = event.clientX / innerWidth - 0.5; pointer.y = event.clientY / innerHeight - 0.5; }, { passive: true });
  canvas.addEventListener("click", () => { spin = 0.35; if (still) { turn += 0.8; draw(); } });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(canvas);
  const loop = (time) => {
    requestAnimationFrame(loop);
    if (!visible || time - last < 33) return;
    last = time;
    turn += 0.012 + spin;
    spin *= 0.94;
    draw();
  };
  if (!still) requestAnimationFrame(loop);
}

// ---- The activity list: filters, and a light that follows the cursor ---------------------
const cards = [...document.querySelectorAll(".activity-card")];
const filters = document.querySelector("#activity-filters");
for (const [name, test] of [
  ["All", () => true],
  ["Free", (card) => card.dataset.cost === "0"],
  ["20 min or less", (card) => Number(card.dataset.duration) <= 20],
  ["Meet", (card) => card.dataset.moods.includes("meet")],
  ["Make", (card) => card.dataset.moods.includes("make")],
  ["Move", (card) => card.dataset.moods.includes("move")],
]) {
  if (!cards.some(test)) continue;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = name;
  button.setAttribute("aria-pressed", String(name === "All"));
  button.addEventListener("click", () => {
    for (const other of filters.children) other.setAttribute("aria-pressed", String(other === button));
    for (const card of cards) {
      card.hidden = !test(card);
      if (!card.hidden && !still) card.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  });
  filters?.append(button);
}
for (const card of cards) {
  card.addEventListener("pointermove", (event) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - r.left}px`);
    card.style.setProperty("--my", `${event.clientY - r.top}px`);
  });
}
