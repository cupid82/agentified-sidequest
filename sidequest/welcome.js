// The first-time setup, "Customize your experience": six short steps, with the visitor's card
// filling in beside them. Every answer is saved as it is given, so leaving early keeps it, and
// coming back starts at the step they left. It can be run again at any time.
import { INTERESTS, MOODS } from "./planner.js";
import { readProfile, signIn } from "./google-auth.js";
import { freeHours, nameOf, readYou, saveYou } from "./you.js";
import { blockBar, el, faceControls, gapControls, interestControls, lookControls, radios } from "./you-controls.js";
import { Buddy } from "./buddy.js";

const $ = (selector) => document.querySelector(selector);
const LAST = 6, DONE = 7;
const steps = [...document.querySelectorAll(".wl-step[data-step]")];
const account = readProfile();
let you = readYou(), step = 0;
const calm = () => window.SidequestLook?.calm;

const buddy = new Buddy($("#buddy"), you.face);
const save = (patch) => { you = saveYou(patch); renderTicket(); };

// ---- The card -----------------------------------------------------------------------------

const ticket = new Map();
for (const [key, label] of [["vibe", "vibe"], ["into", "into"], ["time", "time"], ["spend", "spend"], ["free", "free"], ["look", "look"]]) {
  const row = el("div"), value = el("dd");
  value.dataset.row = key;
  row.append(el("dt", "", label), value);
  $("#wl-ticket").append(row);
  ticket.set(key, value);
}

/** What the card shows for an answer, or nothing when it has not been given yet. */
function ticketText() {
  const reached = (at) => step >= at || you.setup === "done";
  const likes = INTERESTS.filter(({ id }) => you.plan.interests.includes(id)).map(({ label }) => label.toLowerCase());
  const full = you.plan.timeMinutes / 5, hours = freeHours(you.gaps);
  return {
    vibe: reached(2) ? MOODS[you.plan.mood].label : "",
    into: likes.length ? `${likes.slice(0, 2).join(", ")}${likes.length > 2 ? ` +${likes.length - 2}` : ""}` : (reached(4) ? "a bit of everything" : ""),
    time: reached(4) ? `${"█".repeat(full)}${"░".repeat(18 - full)} ${you.plan.timeMinutes} min` : "",
    spend: reached(4) ? (you.plan.budget ? `up to $${you.plan.budget}` : "free") : "",
    free: hours ? `${hours} ${hours === 1 ? "hour" : "hours"} a week` : (reached(6) ? "whenever" : ""),
    look: reached(6) ? `${you.look.accent}${you.look.motion === "calm" ? ", calm" : ""}` : "",
  };
}

function renderTicket() {
  const name = nameOf(you, account), title = $("#wl-ticket-name");
  title.textContent = name || "Your name";
  title.classList.toggle("is-empty", !name);
  for (const [key, text] of Object.entries(ticketText())) {
    const cell = ticket.get(key);
    if (cell.dataset.text === text) continue;
    cell.dataset.text = text;
    cell.textContent = text || "· · ·";
    cell.title = text;
    cell.classList.toggle("is-empty", !text);
    if (text && window.gsap && !calm()) window.gsap.fromTo(cell, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.45, ease: "expo.out", clearProps: "all" });
  }
}

// ---- The steps' controls ------------------------------------------------------------------

const nameField = $("#wl-name");
nameField.value = you.name || nameOf(you, account);
nameField.addEventListener("input", () => save({ name: nameField.value }));

faceControls($("#wl-face"), you.face, (face, kind) => {
  save({ face });
  buddy.face = face;
  buddy.react({ hat: "hop", shuffle: "spin" }[kind] || "nod");
});

radios($("#wl-mood"), [
  { value: "meet", label: MOODS.meet.label, icon: ":-)", desc: "Low-pressure and social" },
  { value: "make", label: MOODS.make.label, icon: "/~/", desc: "Try a quick creative activity" },
  { value: "move", label: MOODS.move.label, icon: ">>>", desc: "Explore or stretch your legs" },
], { legend: "Usual vibe", value: you.plan.mood, kind: "cards", onChange: (mood) => { save({ plan: { mood } }); buddy.react({ meet: "nod", make: "shake", move: "hop" }[mood]); } });

interestControls($("#wl-interests"), you.plan.interests, (interests) => { const more = interests.length > you.plan.interests.length; save({ plan: { interests } }); buddy.react(more ? "hop" : "shake"); });

const limits = $("#wl-limits");
radios(limits, [{ value: 30, label: "30 min" }, { value: 60, label: "1 hour" }, { value: 90, label: "90 min" }], { legend: "Usual time", value: you.plan.timeMinutes, kind: "segmented", onChange: (timeMinutes) => { save({ plan: { timeMinutes } }); buddy.react("nod"); } });
radios(limits, [{ value: 0, label: "Free" }, { value: 5, label: "Up to $5" }, { value: 10, label: "Up to $10" }], { legend: "Usual budget", value: you.plan.budget, kind: "segmented", onChange: (budget) => { save({ plan: { budget } }); buddy.react("nod"); } });
radios(limits, [{ value: "any", label: "Anywhere" }, { value: "inside", label: "Indoors" }, { value: "around", label: "Out and about" }], { legend: "Where", value: you.plan.place, kind: "segmented", onChange: (place) => { save({ plan: { place } }); buddy.react("shake"); } });
radios(limits, [{ value: 1, label: "1 a week" }, { value: 2, label: "2 a week" }, { value: 3, label: "3 a week" }], { legend: "A goal to aim for", value: you.goal, kind: "segmented", onChange: (goal) => { save({ goal }); buddy.react(goal === 3 ? "spin" : "hop"); } });

gapControls($("#wl-gaps"), you.gaps, (gaps) => save({ gaps }));

lookControls($("#wl-look"), you.look, (look, changed) => {
  save({ look });
  window.SidequestLook?.apply(look);
  if (changed === "accent") buddy.react("spin");
});

// ---- Moving between steps -----------------------------------------------------------------

function show(next, { focus = true } = {}) {
  const back = next < step;
  step = Math.min(DONE, Math.max(0, next));
  for (const section of steps) section.hidden = Number(section.dataset.step) !== step;
  const asking = step >= 1 && step <= LAST, section = steps[step];
  $("#wl-nav").hidden = !asking;
  $("#wl-progress").hidden = !asking;
  $("#wl-skip").hidden = step === DONE;
  $("#wl-skip").textContent = you.setup === "done" ? "Close" : "Skip for now";
  if (asking) {
    $("#wl-count").textContent = `Step ${step} of ${LAST}`;
    $("#wl-bar").replaceChildren(blockBar(step / LAST));
    $("#wl-next").firstChild.textContent = step === LAST ? "Finish " : "Continue ";
  }
  if (step === DONE) finish(); else if (asking) save({ step });
  renderTicket();
  $("#wl-state").textContent = step === DONE || you.setup === "done" ? "READY" : asking ? `${step}/${LAST}` : "DRAFT";
  if (window.gsap && !calm()) {
    const parts = [...section.children, ...(asking ? [$("#wl-nav")] : [])];
    window.gsap.fromTo(parts, { opacity: 0, x: back ? -26 : 26 }, { opacity: 1, x: 0, duration: 0.6, stagger: 0.05, ease: "expo.out", clearProps: "opacity,transform" });
  }
  scrollTo({ top: 0 });
  if (!focus) return;
  // The name is typed straight away; elsewhere the heading takes the focus, to be read out.
  if (step === 1 && matchMedia("(hover: hover)").matches) nameField.focus(); else section.querySelector("h1").focus({ preventScroll: true });
}

function finish() {
  const before = you.setup;
  save({ setup: "done", step: 0, name: nameField.value });
  const name = nameOf(you, account).split(" ")[0], hours = freeHours(you.gaps), { mood, timeMinutes, budget } = you.plan;
  $("#wl-done-name").textContent = name ? `${name}, you’re` : "You’re";
  $("#wl-done-text").textContent = `The planner opens with ${MOODS[mood].noun}, ${timeMinutes} minutes, ${budget ? `up to $${budget}` : "free"}${hours ? ", and knows when you’re free" : ""}. Change any of it on your profile.`;
  history.replaceState(null, "", location.pathname);
  buddy.react("spin");
  if (before === "done") return;
  const box = $("#buddy").getBoundingClientRect();
  setTimeout(() => window.SidequestFX?.hearts(box.left + box.width / 2, box.top + box.height / 2), 500);
}

$("#wl-form").addEventListener("submit", (event) => { event.preventDefault(); show(step + 1); });
// Enter moves on from a choice too. Buttons and links keep their own Enter.
$("#wl-form").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches("input[type=radio], input[type=checkbox], h1")) return;
  event.preventDefault();
  show(step + 1);
});
$("#wl-back").addEventListener("click", () => show(step - 1));
$("#wl-skip").addEventListener("click", () => {
  if (you.setup !== "done") saveYou({ setup: "skipped" });
  location.href = you.setup === "done" ? "profile.html" : "./";
});
$("#wl-google").addEventListener("click", () => { $("#wl-google").disabled = true; signIn("welcome.html"); });

// ---- Start --------------------------------------------------------------------------------

if (account) {
  $("#wl-google").remove();
  $("#wl-hello").textContent = you.setup === "done" ? "/ welcome back" : `/ you’re in, ${nameOf(you, account).toLowerCase()}`;
} else if (you.setup === "done") {
  $("#wl-hello").textContent = "/ welcome back";
}
// "#start" comes from the invitation on the hub, which has already said what this is.
const resume = you.setup !== "done" && you.step >= 1 ? you.step : 0;
const first = resume || (location.hash === "#start" ? 1 : 0);
show(first, { focus: first > 0 });
renderTicket();
