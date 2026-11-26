// What makes the hub a visitor's own: the planner opens with their defaults, or with the gap
// they are in; the suggestions start with their interests; a line above the planner says what
// was set and why; and first-time visitors are invited to customize their experience. It reads
// the profile (you.js) and uses the planner's own controls (Sidequest). It runs before play.js,
// which wires up the suggestions.
import { Sidequest } from "./sidequest.js";
import { INTERESTS, MOODS, fitTime } from "./planner.js";
import { readProfile } from "./google-auth.js";
import { KEYS, clock, miniFace, nameOf, nextGap, readProgress, readYou, saveYou, statsOf, takeNext } from "./you.js";
import { button, el } from "./you-controls.js";

const $ = (selector) => document.querySelector(selector);
const nameNow = () => nameOf(readYou(), readProfile()).split(" ")[0];

// ---- The planner's opening choices -------------------------------------------------------

/** Set the planner from the profile. Returns the gap the visitor is in, if any. */
function tunePlanner() {
  const you = readYou(), gap = nextGap(you.gaps);
  if (!you.joined) return null;
  const { mood, timeMinutes, budget } = you.plan;
  Sidequest.useDefaults({ mood, timeMinutes, budget });
  if (!gap?.isNow) return null;
  Sidequest.setChoices({ timeMinutes: fitTime(gap.minutes) });
  return gap;
}

function showSuggestions() {
  const row = $(".suggestions"), mine = INTERESTS.filter(({ id }) => readYou().plan.interests.includes(id)).map(({ request }) => request);
  if (!row || !mine.length) return;
  const stock = [...row.querySelectorAll("[data-suggest]")].map((chip) => chip.dataset.suggest);
  const words = [...mine, ...stock.filter((word) => !mine.includes(word) && !(word === "card game" && mine.includes("cards")))].slice(0, Math.max(5, Math.min(mine.length, 8)));
  row.replaceChildren(...words.map((word) => {
    const chip = button("", word, () => {});
    chip.dataset.suggest = word;
    chip.setAttribute("aria-pressed", "false");
    return chip;
  }));
}

function showHello(gap, opened) {
  const root = $("#planner-hello"), you = readYou();
  if (!root) return;
  const face = el("span", "hello-face", you.setup === "done" ? miniFace(you.face) : ":)"), copy = el("p"), link = el("a");
  face.setAttribute("aria-hidden", "true");
  if (you.setup === "done") {
    const name = nameNow(), { mood } = you.plan;
    const likes = INTERESTS.filter(({ id }) => you.plan.interests.includes(id)).map(({ label }) => label.toLowerCase());
    const set = gap
      ? `You’re free until ${clock(gap.end)}, ${gap.minutes < fitTime(gap.minutes) ? "so pick a one-stop plan." : `so the time is set to ${fitTime(gap.minutes)} minutes.`}`
      : opened ? "Set from your profile." : `Set to ${MOODS[mood].label.toLowerCase()}, the way you like it.`;
    const lean = likes.length ? ` Plans lean towards ${new Intl.ListFormat("en-GB").format(likes.slice(0, 3))}.` : "";
    copy.append(el("strong", "", name ? `Hey ${name}. ` : "Hey. "), `${set}${lean}`);
    link.href = "profile.html#plan";
    link.textContent = "Change";
  } else {
    copy.append(el("strong", "", "Make it yours. "), "Set your usual vibe, limits and free time once, and the planner opens with them.");
    link.href = "welcome.html";
    link.textContent = "Customize your experience →";
  }
  root.replaceChildren(face, copy, link);
  // Someone who skipped the setup has answered; the chip still leads there.
  root.hidden = you.setup === "skipped";
}

// ---- The adventure log --------------------------------------------------------------------

function showWeek() {
  const link = $(".quest-profile-link"), you = readYou();
  if (!link || !you.joined) return;
  let week = link.querySelector("small");
  if (!week) { week = el("small"); link.prepend(week); }
  week.textContent = `${statsOf(readProgress(), you.goal).thisWeek} of ${you.goal} this week`;
}

// ---- First-time invitation ----------------------------------------------------------------

function invite() {
  if (readYou().setup !== "new") return;
  const box = el("aside", "invite"), art = el("pre", "invite-face"), copy = el("div"), actions = el("div", "invite-actions");
  const name = nameNow();
  box.setAttribute("aria-label", "Customize your experience");
  art.setAttribute("aria-hidden", "true");
  art.textContent = ".--------.\n| ^    ^ |\n|   --   |\n|  \\__/  |\n'--------'";
  copy.append(el("p", "kicker", name ? `/ you’re in, ${name.toLowerCase()}` : "/ first time here?"), el("strong", "", "Customize your experience"), el("p", "", "Six quick picks so every plan starts closer to you. About a minute, kept in this browser."));
  const start = el("a", "btn btn-primary btn-sm", "Let’s do it →");
  start.href = "welcome.html#start";
  const hide = () => {
    box.classList.remove("is-on");
    setTimeout(() => box.remove(), 450);
  };
  const close = () => { saveYou({ setup: "later" }); hide(); };
  actions.append(start, button("btn btn-ghost btn-sm", "Not now", close));
  copy.append(actions);
  box.append(art, copy);
  box.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  const calm = window.SidequestLook?.calm;
  // It steps aside for someone who is already planning, and comes back on their next visit.
  let busy = false;
  for (const type of ["focusin", "pointerdown"]) $("#planner")?.addEventListener(type, () => { busy = true; hide(); }, { once: true });
  setTimeout(() => {
    // Another tab may have answered in the meantime.
    if (readYou().setup !== "new") return;
    if (busy) return;
    document.body.append(box);
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("is-on")));
  }, calm ? 300 : 2800);
  window.addEventListener("storage", () => { if (readYou().setup !== "new") box.remove(); });
}

// ---- Start --------------------------------------------------------------------------------

function start() {
  const next = takeNext();
  const gap = tunePlanner();
  if (next?.plan) Sidequest.openQuest(next.plan, next.choices);
  else if (next) Sidequest.setChoices(next.choices);
  showSuggestions();
  showHello(next ? null : gap, Boolean(next));
  showWeek();
}

start();
invite();
window.addEventListener("sidequest:changed", (event) => { if (event.detail === KEYS.progress || event.detail === KEYS.you) showWeek(); });
// Coming back from the profile page through the back cache: the defaults may have changed.
let stamp = JSON.stringify(readYou());
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  const now = JSON.stringify(readYou()), next = takeNext();
  if (now !== stamp || next) {
    stamp = now;
    const gap = tunePlanner();
    if (next?.plan) Sidequest.openQuest(next.plan, next.choices);
    else if (next) Sidequest.setChoices(next.choices);
    showHello(next ? null : gap, Boolean(next));
  }
  showWeek();
  if (readYou().setup !== "new") $(".invite")?.remove();
});
