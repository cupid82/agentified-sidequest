// Everything Sidequest remembers about a visitor: name and face, planner defaults, free time,
// look, finished quests and saved plans. All of it stays in this browser. Nothing here is sent
// to the activity groups, to Google or to an AI provider.
//
// Functions that work something out take plain values and touch neither the page nor storage,
// so Node tests can import this file. Only read*, save* and the few helpers under "Storage"
// use localStorage or sessionStorage.
import { MOODS, TIME_OPTIONS, BUDGET_OPTIONS, INTERESTS, PLACES } from "./planner.js";

export const KEYS = {
  you: "campus-sidequest-you-v1",
  progress: "campus-sidequest-progress-v1",
  saved: "campus-sidequest-saved-v1",
  account: "campus-sidequest-profile-v1", // name, email and picture, written by google-auth.js
  next: "campus-sidequest-next-v1", // sessionStorage: what the planner should open with
  consent: "campus-sidequest-read-consent", // sessionStorage, owned by sidequest.js
};

// ---- The face ---------------------------------------------------------------------------

export const EYES = [
  { id: "round", label: "Round", mini: ["o", "o"] },
  { id: "happy", label: "Happy", mini: ["^", "^"] },
  { id: "star", label: "Starry", mini: ["*", "*"] },
  { id: "sleepy", label: "Sleepy", mini: ["-", "-"] },
  { id: "wink", label: "Wink", mini: ["o", "-"] },
  { id: "squint", label: "Squint", mini: [">", "<"] },
  { id: "big", label: "Wide", mini: ["O", "O"] },
  { id: "shades", label: "Shades", mini: ["=", "="] },
];
export const MOUTHS = [
  { id: "smile", label: "Smile", mini: "u" },
  { id: "flat", label: "Straight", mini: "_" },
  { id: "open", label: "Surprised", mini: "o" },
  { id: "cat", label: "Cat", mini: "w" },
  { id: "grin", label: "Grin", mini: "v" },
  { id: "smirk", label: "Smirk", mini: "~" },
];
export const HATS = [
  { id: "none", label: "No hat" },
  { id: "cap", label: "Cap" },
  { id: "grad", label: "Grad cap" },
  { id: "beanie", label: "Beanie" },
  { id: "headphones", label: "Headphones" },
  { id: "crown", label: "Crown" },
  { id: "cat", label: "Cat ears" },
  { id: "party", label: "Party hat" },
];
export const ACCENTS = [
  { id: "sunset", label: "Sunset" },
  { id: "lagoon", label: "Lagoon" },
  { id: "phosphor", label: "Phosphor" },
  { id: "ultraviolet", label: "Ultraviolet" },
  { id: "ember", label: "Ember" },
  { id: "mono", label: "Mono" },
];

const byId = (list, id) => list.find((entry) => entry.id === id) || list[0];

/** A face as three characters, such as "^_^", for the small avatar. */
export function miniFace(face) {
  const [left, right] = byId(EYES, face?.eyes).mini;
  return `${left}${byId(MOUTHS, face?.mouth).mini}${right}`;
}

/** A face in words, for screen readers. */
export function faceText(face) {
  const hat = byId(HATS, face?.hat);
  return `${byId(EYES, face?.eyes).label.toLowerCase()} eyes, ${byId(MOUTHS, face?.mouth).label.toLowerCase()} mouth, ${hat.label.toLowerCase()}`;
}

/** A random face. */
export function randomFace(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)].id;
  return { eyes: pick(EYES), mouth: pick(MOUTHS), hat: pick(HATS) };
}

// ---- Cleaning what was stored or imported -----------------------------------------------
// Storage and imported files can hold anything, so every field is checked on the way in.

const object = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const list = (value) => (Array.isArray(value) ? value : []);
const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);
const number = (value, min, max, fallback) => (typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
const line = (value, max) => (typeof value === "string" ? [...value.replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, " ").trim()].slice(0, max).join("") : "");
const iso = (value) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : "");
const ids = (entries) => entries.map((entry) => entry.id);
const webUrl = (value) => {
  try { const url = new URL(String(value)); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
};

export const NAME_MAX = 24;
export const TAGLINE_MAX = 80;
export const NOTE_MAX = 140;
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** The hours a visitor can mark as free: 8:00 up to and including 21:00, each an hour long. */
export const HOURS = Array.from({ length: 14 }, (_, index) => index + 8);

export function cleanGaps(raw) {
  return DAYS.map((_, day) => [...new Set(list(list(raw)[day]).filter((hour) => HOURS.includes(hour)))].sort((a, b) => a - b));
}

/**
 * A visitor's profile with every field valid, whatever was passed in.
 *
 * :param raw: A stored or imported value, or nothing for a new visitor.
 * :return: The profile. setup is "new" (never asked), "later" (closed the hub's invitation),
 *     "skipped" (left the setup) or "done".
 */
export function cleanYou(raw) {
  const value = object(raw), plan = object(value.plan), face = object(value.face), look = object(value.look);
  return {
    version: 1,
    name: line(value.name, NAME_MAX),
    tagline: line(value.tagline, TAGLINE_MAX),
    joined: iso(value.joined),
    setup: oneOf(value.setup, ["new", "later", "skipped", "done"], "new"),
    step: Math.floor(number(value.step, 0, 6, 0)),
    picture: oneOf(value.picture, ["google", "face"], "google"),
    face: {
      eyes: oneOf(face.eyes, ids(EYES), "round"),
      mouth: oneOf(face.mouth, ids(MOUTHS), "smile"),
      hat: oneOf(face.hat, ids(HATS), "none"),
    },
    plan: {
      mood: oneOf(plan.mood, Object.keys(MOODS), "meet"),
      timeMinutes: oneOf(plan.timeMinutes, TIME_OPTIONS, 60),
      budget: oneOf(plan.budget, BUDGET_OPTIONS, 0),
      place: oneOf(plan.place, PLACES, "any"),
      interests: ids(INTERESTS).filter((id) => list(plan.interests).includes(id)),
    },
    goal: oneOf(value.goal, [1, 2, 3], 1),
    gaps: cleanGaps(value.gaps),
    look: {
      accent: oneOf(look.accent, ids(ACCENTS), "sunset"),
      motion: oneOf(look.motion, ["full", "calm"], "full"),
      cursor: look.cursor !== false,
      hearts: look.hearts !== false,
    },
  };
}

function cleanEntry(raw) {
  const value = object(raw);
  const stops = list(value.stops).map((stop) => ({
    title: line(object(stop).title, 120),
    group: line(object(stop).group, 60),
    url: webUrl(object(stop).url),
    duration: number(object(stop).duration, 0, 1440, 0),
    cost: number(object(stop).cost, 0, 10000, 0),
    setting: line(object(stop).setting, 80),
  })).filter((stop) => stop.title).slice(0, 4);
  const at = iso(value.at);
  if (!at || !stops.length) return null;
  return {
    id: line(value.id, 40) || `q${Date.parse(at).toString(36)}`,
    at,
    mood: oneOf(value.mood, Object.keys(MOODS), "meet"),
    minutes: Math.round(number(value.minutes, 0, 1440, 0)),
    cost: number(value.cost, 0, 10000, 0),
    stops,
    feel: oneOf(value.feel, FEELS.map((feel) => feel.id), ""),
    note: line(value.note, NOTE_MAX),
  };
}

/** How a finished quest went. "nah" ranks that activity last in later plans. */
export const FEELS = [
  { id: "love", face: ":D", label: "Loved it" },
  { id: "good", face: ":)", label: "Good" },
  { id: "nah", face: ":/", label: "Not for me" },
];

const LOG_MAX = 200;
const SAVED_MAX = 30;

/** Quest progress with every field valid. completed can be higher than the log: quests
 * finished before the log existed were only counted. */
export function cleanProgress(raw) {
  const value = object(raw), seen = new Set();
  const log = list(value.log).map(cleanEntry).filter((entry) => entry && !seen.has(entry.id) && seen.add(entry.id))
    .sort((a, b) => a.at.localeCompare(b.at)).slice(-LOG_MAX);
  return {
    completed: Math.max(Math.floor(number(value.completed, 0, 100000, 0)), log.length),
    badges: [...new Set(list(value.badges).map((badge) => line(badge, 40)).filter(Boolean))].slice(0, 40),
    log,
  };
}

/** One plan as the planner builds it, checked; null when it could not be started. */
export function cleanPlan(raw) {
  const value = object(raw);
  const stops = list(value.stops).map((stop) => {
    const peer = object(object(stop).peer), item = object(object(stop).item);
    return {
      peer: { id: line(peer.id, 40), name: line(peer.name, 60), base: webUrl(peer.base).replace(/\/+$/, "") },
      item: {
        id: line(item.id, 80), title: line(item.title, 120), description: line(item.description, 400), setting: line(item.setting, 80),
        duration: number(item.duration, 0, 1440, 0), cost: number(item.cost, 0, 10000, 0),
        moods: list(item.moods).filter((mood) => mood in MOODS),
      },
    };
  });
  if (!stops.length || stops.length > 4 || stops.some(({ peer, item }) => !peer.name || !peer.base || !item.title || !item.duration)) return null;
  return {
    label: line(value.label, 40),
    minutes: stops.reduce((total, { item }) => total + item.duration, 0),
    cost: stops.reduce((total, { item }) => total + item.cost, 0),
    stops,
  };
}

export function cleanChoices(raw) {
  const value = object(raw);
  return {
    mood: oneOf(value.mood, Object.keys(MOODS), "meet"),
    timeMinutes: oneOf(value.timeMinutes, TIME_OPTIONS, 60),
    budget: oneOf(value.budget, BUDGET_OPTIONS, 0),
    activityRequest: line(value.activityRequest, 100),
  };
}

/** The same stops make the same plan, so a plan is saved once. */
export const planId = (plan) => plan.stops.map(({ peer, item }) => `${peer.id || peer.name}:${item.id || item.title}`).join("+");

export function cleanSaved(raw) {
  const seen = new Set();
  return list(raw).map((entry) => {
    const plan = cleanPlan(object(entry).plan);
    return plan && { id: planId(plan), at: iso(object(entry).at), plan, choices: cleanChoices(object(entry).choices) };
  }).filter((entry) => entry && !seen.has(entry.id) && seen.add(entry.id)).slice(0, SAVED_MAX);
}

// ---- Names ------------------------------------------------------------------------------

/** The name to show: the visitor's own, then their Google first name, then nothing. */
export const nameOf = (you, account) => you?.name || line(account?.name, 80).split(" ")[0] || "";

// ---- Levels, numbers and badges ---------------------------------------------------------

export const LEVELS = [
  { at: 0, name: "Wanderer" },
  { at: 1, name: "First Steps" },
  { at: 3, name: "Campus Regular" },
  { at: 5, name: "Quest Collector" },
  { at: 10, name: "Trailblazer" },
  { at: 20, name: "Campus Legend" },
];

/**
 * Where a number of finished quests stands on the ladder.
 *
 * :param completed: Finished quests.
 * :return: {number, name, next, share}: the level from 1, the next level (or null at the
 *     top) and how full the bar to it is, from 0 to 1.
 */
export function levelOf(completed) {
  const index = LEVELS.findLastIndex((level) => completed >= level.at);
  const next = LEVELS[index + 1] || null;
  return { number: index + 1, name: LEVELS[index].name, next, share: next ? completed / next.at : 1 };
}

/** Midnight on the Monday of a date's week. */
export function weekStart(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function shiftWeeks(monday, weeks) {
  const day = new Date(monday);
  day.setDate(day.getDate() + weeks * 7);
  return day;
}

/**
 * The numbers on the profile page, worked out from finished quests only.
 *
 * :param progress: cleanProgress() output.
 * :param goal: Quests a week the visitor aims for.
 * :param now: The current time.
 * :return: completed, and from the log: logged, minutes, spent, free (quests that cost
 *     nothing), byMood, moods (vibes tried), topMood, hops (quests with two groups), groups,
 *     weeks (the last eight, oldest first), thisWeek, streak and bestStreak in weeks.
 */
export function statsOf(progress, goal = 1, now = new Date()) {
  const { log, completed } = progress;
  const byMood = Object.fromEntries(Object.keys(MOODS).map((mood) => [mood, log.filter((entry) => entry.mood === mood).length]));
  const top = Object.entries(byMood).sort((a, b) => b[1] - a[1])[0];
  const perWeek = new Map();
  for (const entry of log) {
    const key = weekStart(entry.at).getTime();
    perWeek.set(key, (perWeek.get(key) || 0) + 1);
  }
  const monday = weekStart(now);
  const countAt = (weeksAgo) => perWeek.get(shiftWeeks(monday, -weeksAgo).getTime()) || 0;
  // A week still in progress does not end a streak.
  let streak = 0;
  for (let ago = countAt(0) >= goal ? 0 : 1; countAt(ago) >= goal; ago++) streak++;
  let bestStreak = streak;
  for (const start of perWeek.keys()) {
    let run = 0;
    for (let week = 0; (perWeek.get(shiftWeeks(new Date(start), week).getTime()) || 0) >= goal; week++) run++;
    bestStreak = Math.max(bestStreak, run);
  }
  return {
    completed,
    logged: log.length,
    minutes: log.reduce((total, entry) => total + entry.minutes, 0),
    spent: log.reduce((total, entry) => total + entry.cost, 0),
    free: log.filter((entry) => entry.cost === 0).length,
    byMood,
    moods: Object.values(byMood).filter(Boolean).length,
    topMood: top && top[1] > 0 ? top[0] : "",
    hops: log.filter((entry) => new Set(entry.stops.map((stop) => stop.group)).size > 1).length,
    groups: [...new Set(log.flatMap((entry) => entry.stops.map((stop) => stop.group)).filter(Boolean))],
    weeks: Array.from({ length: 8 }, (_, index) => ({ start: shiftWeeks(monday, index - 7), count: countAt(7 - index) })),
    thisWeek: countAt(0),
    streak,
    bestStreak,
  };
}

// Earned badges are stored by name (progress.badges), so a name here must not change.
export const BADGES = [
  { name: "First Steps", icon: "[1]", hint: "Finish your first quest", goal: 1, have: (stats) => stats.completed },
  { name: "Campus Regular", icon: "[3]", hint: "Finish 3 quests", goal: 3, have: (stats) => stats.completed },
  { name: "Quest Collector", icon: "[5]", hint: "Finish 5 quests", goal: 5, have: (stats) => stats.completed },
  { name: "Trailblazer", icon: "[10]", hint: "Finish 10 quests", goal: 10, have: (stats) => stats.completed },
  { name: "Campus Legend", icon: "[20]", hint: "Finish 20 quests", goal: 20, have: (stats) => stats.completed },
  { name: "Social Spark", icon: ":-)", hint: "Finish 3 Meet people quests", goal: 3, have: (stats) => stats.byMood.meet },
  { name: "Maker Hands", icon: "/~/", hint: "Finish 3 Make something quests", goal: 3, have: (stats) => stats.byMood.make },
  { name: "Pathfinder", icon: ">>>", hint: "Finish 3 Get moving quests", goal: 3, have: (stats) => stats.byMood.move },
  { name: "All Rounder", icon: "(+)", hint: "Finish one quest of each vibe", goal: 3, have: (stats) => stats.moods },
  { name: "Free Spirit", icon: "$0", hint: "Finish 3 quests that cost nothing", goal: 3, have: (stats) => stats.free },
  { name: "Club Hopper", icon: "<->", hint: "Visit two groups in one quest", goal: 1, have: (stats) => stats.hops },
  { name: "On a Roll", icon: "~*~", hint: "Reach your weekly goal 3 weeks in a row", goal: 3, have: (stats) => stats.bestStreak },
];

/** Every badge with how far along it is. A badge once earned stays earned. */
export function badgesOf(progress, goal = 1, now = new Date()) {
  const stats = statsOf(progress, goal, now);
  return BADGES.map(({ name, icon, hint, goal: need, have }) => {
    const earned = progress.badges.includes(name) || have(stats) >= need;
    return { name, icon, hint, need, have: earned ? need : Math.min(need, have(stats)), earned };
  });
}

/** The progress with every badge it has earned by now written down, so each one stays earned. */
export function keepBadges(progress, goal = 1, now = new Date()) {
  const fresh = badgesOf(progress, goal, now).filter((badge) => badge.earned && !progress.badges.includes(badge.name)).map((badge) => badge.name);
  return fresh.length ? { ...progress, badges: [...progress.badges, ...fresh] } : progress;
}

/**
 * Add a finished quest to the progress.
 *
 * :param progress: cleanProgress() output.
 * :param plan: The plan that was finished.
 * :param choices: The planner choices it was built from.
 * :param goal: The visitor's weekly goal.
 * :param now: The current time.
 * :return: {progress, earned}: the new progress and the names of badges it earned.
 */
export function addQuest(progress, plan, choices, goal = 1, now = new Date()) {
  const entry = {
    id: `q${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: now.toISOString(),
    mood: choices?.mood,
    minutes: plan.minutes,
    cost: plan.cost,
    stops: plan.stops.map(({ peer, item }) => ({ title: item.title, group: peer.name, url: `${peer.base}/`, duration: item.duration, cost: item.cost, setting: item.setting })),
  };
  const next = keepBadges(cleanProgress({ ...progress, completed: progress.completed + 1, log: [...progress.log, entry] }), goal, now);
  return { progress: next, earned: next.badges.filter((name) => !progress.badges.includes(name)) };
}

/** Remove one quest from the log, and from the count. Earned badges stay. */
export function dropQuest(progress, id) {
  const log = progress.log.filter((entry) => entry.id !== id);
  return cleanProgress({ ...progress, log, completed: progress.completed - (progress.log.length - log.length) });
}

/** Change how a quest felt, or its note. */
export function editQuest(progress, id, patch) {
  return cleanProgress({ ...progress, log: progress.log.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) });
}

/**
 * A finished quest as something the planner can open again.
 *
 * :param entry: An entry of the log.
 * :return: {plan, choices}, or null when too little was kept about its stops.
 */
export function replay(entry) {
  const plan = cleanPlan({ stops: entry.stops.map(({ title, group, url, duration, cost, setting }) => ({ peer: { name: group, base: url }, item: { title, duration, cost, setting } })) });
  const enough = (options, value) => options.find((option) => option >= value) ?? options.at(-1);
  return plan && { plan, choices: cleanChoices({ mood: entry.mood, timeMinutes: enough(TIME_OPTIONS, plan.minutes), budget: enough(BUDGET_OPTIONS, plan.cost) }) };
}

/** What findPlans() should lean towards; see tasteScore() in planner.js. */
export function tasteOf(you, progress) {
  return {
    interests: you.plan.interests,
    place: you.plan.place,
    avoid: [...new Set(progress.log.filter((entry) => entry.feel === "nah").flatMap((entry) => entry.stops.map((stop) => stop.title)))],
  };
}

// ---- Free time --------------------------------------------------------------------------

/** One day's free hours as blocks: [13, 14, 16] -> [{13-15}, {16-17}]. */
export function gapBlocks(hours) {
  const blocks = [];
  for (const hour of hours) {
    const last = blocks.at(-1);
    if (last && last.end === hour) last.end = hour + 1; else blocks.push({ start: hour, end: hour + 1 });
  }
  return blocks;
}

export const freeHours = (gaps) => gaps.reduce((total, hours) => total + hours.length, 0);

/**
 * The gap the visitor is in, or the next one within a week.
 *
 * :param gaps: Seven lists of free hours, Monday first.
 * :param now: The current time.
 * :param least: A gap with fewer minutes left than this counts as over.
 * :return: {isNow, start, end, minutes, wait} or null. minutes is what is left of it, and
 *     wait is the minutes until it starts.
 */
export function nextGap(gaps, now = new Date(), least = 15) {
  for (let ahead = 0; ahead <= 7; ahead++) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + ahead);
    for (const block of gapBlocks(gaps[(date.getDay() + 6) % 7])) {
      const start = new Date(date), end = new Date(date);
      start.setHours(block.start);
      end.setHours(block.end);
      const minutes = Math.floor((end - Math.max(start, now)) / 60000);
      if (minutes < least) continue;
      return { isNow: start <= now, start, end, minutes, wait: Math.max(0, Math.ceil((start - now) / 60000)) };
    }
  }
  return null;
}

export const clock = (date, locale) => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);

/** When a gap starts, in words: "Now", "In 20 min", "Today 2:00 PM", "Tomorrow …", "Thu …". */
export function gapWhen(gap, now = new Date(), locale) {
  if (gap.isNow) return "Now";
  if (gap.wait < 60) return `In ${gap.wait} min`;
  const midnight = (date) => new Date(date).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(gap.start) - midnight(now)) / 86400000);
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow" : new Intl.DateTimeFormat(locale, { weekday: "short" }).format(gap.start);
  return `${day} ${clock(gap.start, locale)}`;
}

/**
 * The week's free time in words, with days that share the same hours taken together:
 * "Monday to Friday 12:00 PM to 1:00 PM. Saturday 10:00 AM to 12:00 PM."
 */
export function gapsText(gaps, locale) {
  const edge = (hour) => clock(new Date(2000, 0, 1, hour), locale), days = new Map();
  gaps.forEach((hours, day) => {
    const times = gapBlocks(hours).map(({ start, end }) => `${edge(start)} to ${edge(end)}`).join(", ");
    if (times) days.set(times, [...(days.get(times) || []), day]);
  });
  return [...days].map(([times, list]) => {
    const inARow = list.length > 2 && list.at(-1) - list[0] === list.length - 1;
    return `${inARow ? `${DAYS[list[0]]} to ${DAYS[list.at(-1)]}` : new Intl.ListFormat("en-GB").format(list.map((day) => DAYS[day]))} ${times}.`;
  }).join(" ");
}

/** 205 -> "3h 25m", 60 -> "1h", 45 -> "45m". */
export function spanText(minutes) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours ? `${hours}h` : "", rest || !hours ? `${rest}m` : ""].filter(Boolean).join(" ");
}

// ---- Moving to another browser -----------------------------------------------------------

export function exportText(you, progress, saved, now = new Date()) {
  return JSON.stringify({ app: "campus-sidequest", version: 1, exportedAt: now.toISOString(), you, progress, saved }, null, 2);
}

/**
 * Read a file made by exportText().
 *
 * :param text: The file's text.
 * :return: {ok: true, you, progress, saved} or {ok: false, reason}.
 */
export function importText(text) {
  let value;
  try { value = JSON.parse(text); } catch { return { ok: false, reason: "That file is not a Sidequest profile." }; }
  if (object(value).app !== "campus-sidequest" || !object(value.you).version) return { ok: false, reason: "That file is not a Sidequest profile." };
  return { ok: true, you: cleanYou(value.you), progress: cleanProgress(value.progress), saved: cleanSaved(value.saved) };
}

/** Where to go after signing in: first-time people set things up, others go back. */
export function afterSignIn(setup, back) {
  if (setup === "new" || setup === "later") return "welcome.html";
  return ["profile.html", "welcome.html"].includes(back) ? back : "./";
}

// ---- Storage ----------------------------------------------------------------------------

// What storage refused to keep (private windows, a full disk). It lasts as long as the page.
const unsaved = new Map();

function read(area, key) {
  try { return JSON.parse(unsaved.get(key) ?? globalThis[area].getItem(key) ?? "null"); } catch { return null; }
}

/** Store a value (null removes it) and tell this page. Returns false when storage refuses. */
function write(area, key, value) {
  let kept = true;
  try {
    if (value === null) globalThis[area].removeItem(key); else globalThis[area].setItem(key, JSON.stringify(value));
    unsaved.delete(key);
  } catch {
    kept = false;
    unsaved.set(key, JSON.stringify(value));
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sidequest:changed", { detail: key }));
  return kept;
}

export const readYou = () => cleanYou(read("localStorage", KEYS.you));
export const readProgress = () => cleanProgress(read("localStorage", KEYS.progress));
export const readSaved = () => cleanSaved(read("localStorage", KEYS.saved));
export const saveProgress = (progress) => write("localStorage", KEYS.progress, cleanProgress(progress));
export const saveSaved = (saved) => write("localStorage", KEYS.saved, cleanSaved(saved));

/**
 * Change part of the profile. face, plan and look are merged field by field.
 *
 * :param patch: The fields to change.
 * :return: The profile as stored.
 */
export function saveYou(patch) {
  const you = readYou(), merged = { ...you, ...patch };
  for (const section of ["face", "plan", "look"]) merged[section] = { ...you[section], ...patch[section] };
  // Closing the hub's invitation is not joining.
  if (patch.setup !== "later") merged.joined ||= new Date().toISOString();
  const next = cleanYou(merged);
  write("localStorage", KEYS.you, next);
  return next;
}

/** Save a finished quest. Returns the badges it earned. */
export function finishQuest(plan, choices) {
  const { progress, earned } = addQuest(readProgress(), plan, choices, readYou().goal);
  saveProgress(progress);
  return earned;
}

export const isSaved = (plan, saved = readSaved()) => saved.some((entry) => entry.id === planId(plan));

/** Save a plan for later, or take it off the list. Returns whether it is saved now. */
export function toggleSaved(plan, choices) {
  const saved = readSaved(), id = planId(plan);
  if (saved.some((entry) => entry.id === id)) {
    saveSaved(saved.filter((entry) => entry.id !== id));
    return false;
  }
  saveSaved([{ at: new Date().toISOString(), plan, choices }, ...saved]);
  return true;
}

/** Leave something for the planner to open with: {choices} or {plan, choices}. */
export const planNext = (value) => write("sessionStorage", KEYS.next, value);

/** Take what planNext() left, once. */
export function takeNext() {
  const value = object(read("sessionStorage", KEYS.next));
  write("sessionStorage", KEYS.next, null);
  if (!value.choices) return null;
  return { choices: cleanChoices(value.choices), plan: value.plan ? cleanPlan(value.plan) : null };
}

/** Forget everything in KEYS. The AI key is the runtime's own; see profile-page.js. */
export function eraseAll() {
  for (const key of [KEYS.you, KEYS.progress, KEYS.saved, KEYS.account]) write("localStorage", key, null);
  for (const key of [KEYS.next, KEYS.consent]) write("sessionStorage", key, null);
}
