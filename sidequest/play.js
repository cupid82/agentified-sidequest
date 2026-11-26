// The playful parts of the page: three small ASCII toys under "How it works", and the live
// quest ticket, suggestions and tilting cards in the planner. They only use the planner's own
// controls (window.Sidequest), so the page works the same without them.
const gsap = window.gsap;
const still = window.SidequestLook?.calm ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const MOODS = ["meet", "make", "move"], TIMES = [30, 60, 90], BUDGETS = [0, 5, 10];
const LABEL = { meet: "Meet people", make: "Make something", move: "Get moving" };
const choices = () => window.Sidequest?.currentChoices() || { mood: "meet", timeMinutes: 60, budget: 0, activityRequest: "" };
const set = (patch) => { window.Sidequest?.setChoices(patch); refresh(); };
const cash = (n) => (n ? `up to $${n}` : "free");
const cycle = (list, value) => list[(list.indexOf(value) + 1) % list.length];

// ---- 01: a face that watches the cursor; click it to change the vibe ----------------------
let gaze = 0, lift = 0, blink = false;
function face() {
  const mood = choices().mood, left = 3 + Math.round(gaze), shift = " ".repeat(left), rest = " ".repeat(7 - left);
  const eye = blink ? "-" : { meet: "o", make: "*", move: ">" }[mood];
  const eyes = `|${shift}${eye}   ${eye}${rest}|`, blank = "|            |";
  const up = lift < 0.45;
  const mouth = { meet: "|   \\____/   |", make: "|    '--'    |", move: "|   =====>   |" }[mood];
  return [".------------.", up ? eyes : blank, up ? blank : eyes, mouth, "'------------'"].join("\n");
}

// ---- 02: a dial that shows the time and the budget ---------------------------------------
let hand = 0;
function dial() {
  const { timeMinutes, budget } = choices();
  const spots = [[7, 0], [11, 1], [13, 2], [11, 3], [7, 4], [3, 3], [1, 2], [3, 1]];
  const grid = Array.from({ length: 5 }, () => Array(27).fill(" "));
  const lit = Math.round((timeMinutes / 90) * 8);
  spots.forEach(([x, y], i) => { grid[y][x] = i < lit ? "#" : "."; });
  const [hx, hy] = spots[Math.floor(hand) % 8];
  grid[hy][hx] = "@";
  grid[2][7] = "+";
  [...`${timeMinutes} min`].forEach((c, i) => { grid[1][18 + i] = c; });
  [...(budget ? `$${budget} max` : "free")].forEach((c, i) => { grid[3][18 + i] = c; });
  return grid.map((row) => row.join("")).join("\n");
}

// ---- 03: a walker that follows the cursor to the flag ------------------------------------
let walk = 0, stepNo = 0;
function path() {
  const W = 27, x = Math.round(walk * (W - 7)), grid = Array.from({ length: 5 }, () => Array(W).fill(" "));
  for (let i = 0; i < W; i++) grid[4][i] = i < x ? "=" : ".";
  for (let y = 0; y < 4; y++) grid[y][W - 3] = "|";
  grid[0][W - 2] = ">";
  grid[1][x + 1] = "o";
  ["/", "|", "\\"].forEach((c, i) => { grid[2][x + i] = c; });
  if (stepNo % 2) { grid[3][x] = "/"; grid[3][x + 2] = "\\"; } else grid[3][x + 1] = "|";
  if (walk > 0.97) { grid[1][x] = "\\"; grid[1][x + 2] = "/"; grid[2][x] = " "; grid[2][x + 2] = " "; }
  return grid.map((row) => row.join("")).join("\n");
}

const toys = { face, dial, path };
const target = { gaze: 0, lift: 0, walk: 0 };
function draw(name) {
  const pre = $(`[data-toy="${name}"] .step-ascii`), text = toys[name]();
  if (pre && pre.textContent !== text) pre.textContent = text;
}

// ---- The planner's live ticket -----------------------------------------------------------
let shown = "";
function refresh() {
  const c = choices(), key = JSON.stringify(c);
  for (const name of Object.keys(toys)) draw(name);
  if (key === shown) return;
  shown = key;
  const texts = { "#toy-mood": LABEL[c.mood], "#toy-limits": `${c.timeMinutes} min`, "#toy-budget": cash(c.budget) };
  for (const [selector, text] of Object.entries(texts)) { const button = $(selector); if (button) button.textContent = text; }
  for (const button of $$("[data-suggest]")) button.setAttribute("aria-pressed", String(button.dataset.suggest === c.activityRequest));
  for (const group of $$(".segmented")) {
    const inputs = [...group.querySelectorAll("input")];
    group.style.setProperty("--at", String(Math.max(0, inputs.findIndex((input) => input.checked))));
  }
  const ticket = $("#live-ticket");
  if (!ticket) return;
  const full = c.timeMinutes / 5, bar = "█".repeat(full) + "░".repeat(18 - full);
  const rows = { vibe: LABEL[c.mood], looking: c.activityRequest || "anything that fits", time: `${bar} ${c.timeMinutes} min`, spend: cash(c.budget) };
  for (const [name, value] of Object.entries(rows)) {
    const cell = ticket.querySelector(`[data-ticket="${name}"]`);
    if (cell.textContent === value) continue;
    cell.textContent = value;
    if (gsap && !still) gsap.fromTo(cell, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.45, ease: "expo.out" });
  }
}

$("#toy-mood")?.addEventListener("click", () => set({ mood: cycle(MOODS, choices().mood) }));
$("#toy-limits")?.addEventListener("click", () => set({ timeMinutes: cycle(TIMES, choices().timeMinutes) }));
$("#toy-budget")?.addEventListener("click", () => set({ budget: cycle(BUDGETS, choices().budget) }));
$('[data-toy="face"] .step-ascii')?.addEventListener("click", () => $("#toy-mood").click());
$('[data-toy="dial"] .step-ascii')?.addEventListener("click", () => $("#toy-limits").click());
$("#toy-go")?.addEventListener("click", (event) => {
  target.walk = 1;
  window.SidequestFX?.hearts(event.clientX || innerWidth / 2, event.clientY || innerHeight / 2);
  setTimeout(() => $("#planner").scrollIntoView({ behavior: still ? "auto" : "smooth" }), still ? 0 : 850);
});
for (const button of $$("[data-suggest]")) {
  button.addEventListener("click", () => set({ activityRequest: choices().activityRequest === button.dataset.suggest ? "" : button.dataset.suggest }));
}
$("#quest-form")?.addEventListener("input", () => refresh());

const steps = $(".steps-grid");
steps?.addEventListener("pointermove", (event) => {
  const r = steps.getBoundingClientRect();
  target.gaze = ((event.clientX - r.left) / r.width) * 6 - 3;
  target.lift = (event.clientY - r.top) / r.height;
  const box = event.target.closest('[data-toy="path"]')?.getBoundingClientRect();
  if (box) target.walk = Math.min(1, Math.max(0, (event.clientX - box.left - 30) / (box.width - 110)));
});

if (gsap && !still) {
  for (const card of $$(".choice-card")) {
    card.addEventListener("pointermove", (event) => {
      const r = card.getBoundingClientRect();
      gsap.to(card, { rotationY: ((event.clientX - r.left) / r.width - 0.5) * 14, rotationX: -((event.clientY - r.top) / r.height - 0.5) * 14, transformPerspective: 700, duration: 0.4, overwrite: "auto" });
    });
    card.addEventListener("pointerleave", () => gsap.to(card, { rotationX: 0, rotationY: 0, duration: 0.8, ease: "elastic.out(1,.5)", overwrite: "auto" }));
  }
  let seen = true, last = 0;
  if (steps) new IntersectionObserver(([entry]) => { seen = entry.isIntersecting; }).observe(steps);
  gsap.ticker.add((time) => {
    if (time - last < 0.08) return;
    last = time;
    const before = walk;
    gaze += (target.gaze - gaze) * 0.35;
    lift += (target.lift - lift) * 0.35;
    walk += (target.walk - walk) * 0.18;
    if (Math.abs(walk - before) > 0.004) stepNo++;
    hand += 0.2;
    blink = time % 3.4 < 0.16;
    // The chat and the agent change choices without events, so look rather than listen.
    if (seen || JSON.stringify(choices()) !== shown) refresh();
  });
}
refresh();
