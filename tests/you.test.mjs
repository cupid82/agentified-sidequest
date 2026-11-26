// Unit tests for what Sidequest remembers about a visitor (sidequest/you.js) and how the
// planner uses it: cleaning of stored and imported data, levels, badges, streaks, free time,
// saved plans, moving to another browser, and taste as a tie-breaker.
//
//   node --test tests/you.test.mjs
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUDGET_OPTIONS, INTERESTS, MOODS, TIME_OPTIONS, findPlans, interestsIn, placeOf, searchTerms, tasteScore } from "../sidequest/planner.js";
import * as You from "../sidequest/you.js";
import { ACTIVITIES as MAKER } from "../publishers/maker-studio/activities.js";
import { ACTIVITIES as GAMES } from "../publishers/campus-games/activities.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const LISTS = [
  { peer: { id: "maker", name: "Makers Studio", base: "http://localhost:8081" }, activities: MAKER },
  { peer: { id: "games", name: "Campus Games", base: "http://[::1]:8083" }, activities: GAMES },
];
const ALL = [...MAKER, ...GAMES];

class FakeStorage {
  constructor() { this.items = new Map(); }
  getItem(key) { return this.items.has(key) ? this.items.get(key) : null; }
  setItem(key, value) { this.items.set(key, String(value)); }
  removeItem(key) { this.items.delete(key); }
}
beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: new FakeStorage(), configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: new FakeStorage(), configurable: true, writable: true });
});

// Local time, so the tests mean the same in every time zone. 25 November 2026 is a Wednesday.
const at = (day, hour = 12, minute = 0) => new Date(2026, 10, day, hour, minute);
const plan = (...picks) => {
  const stops = picks.map((id) => {
    const list = LISTS.find(({ activities }) => activities.some((item) => item.id === id));
    return { peer: list.peer, item: list.activities.find((item) => item.id === id) };
  });
  return { label: "FREE", stops, minutes: stops.reduce((sum, { item }) => sum + item.duration, 0), cost: stops.reduce((sum, { item }) => sum + item.cost, 0) };
};
const quest = (progress, when, picks = ["tiny-zine"], mood = "make", goal = 1) => You.addQuest(progress, plan(...picks), { mood }, goal, when);
const none = () => You.cleanProgress(null);

test("a new visitor gets a complete, valid profile", () => {
  for (const raw of [undefined, null, "", 7, [], "nonsense", { plan: "x", face: [], look: 3, gaps: {} }]) {
    const you = You.cleanYou(raw);
    assert.equal(you.setup, "new");
    assert.equal(you.name, "");
    assert.deepEqual(you.plan, { mood: "meet", timeMinutes: 60, budget: 0, place: "any", interests: [] });
    assert.deepEqual(you.look, { accent: "sunset", motion: "full", cursor: true, hearts: true });
    assert.equal(you.gaps.length, 7);
    assert.equal(You.freeHours(you.gaps), 0);
  }
});

test("bad values in storage or an imported file never get through", () => {
  const you = You.cleanYou({
    name: "  Ada\n\tLovelace  with a very long name indeed ", tagline: "x".repeat(500), joined: "not a date", setup: "admin", step: 99,
    face: { eyes: "laser", mouth: "cat", hat: 4 }, picture: "javascript:alert(1)",
    plan: { mood: "party", timeMinutes: 45, budget: -3, place: "moon", interests: ["zine", "zine", "nope", 4, "puzzle"] },
    goal: 12, gaps: [[13, 13, 12, 3, 99, "14"], "x"], look: { accent: "url(x)", motion: "wild", cursor: 0, hearts: false },
  });
  assert.equal(you.name, "Ada Lovelace with a very");
  assert.ok([...you.name].length <= You.NAME_MAX);
  assert.equal(you.tagline.length, You.TAGLINE_MAX);
  assert.equal(you.joined, "");
  assert.equal(you.setup, "new");
  assert.equal(you.step, 6);
  assert.deepEqual(you.face, { eyes: "round", mouth: "cat", hat: "none" });
  assert.equal(you.picture, "google");
  assert.deepEqual(you.plan, { mood: "meet", timeMinutes: 60, budget: 0, place: "any", interests: ["zine", "puzzle"] });
  assert.equal(you.goal, 1);
  assert.deepEqual(you.gaps[0], [12, 13]);
  assert.deepEqual(you.gaps[1], []);
  assert.deepEqual(you.look, { accent: "sunset", motion: "full", cursor: true, hearts: false });
  // A name of emoji is cut between characters, not through one.
  assert.equal(You.cleanYou({ name: "🎲".repeat(40) }).name, "🎲".repeat(You.NAME_MAX));
});

test("saving changes only what was given, and remembers when the visitor joined", () => {
  You.saveYou({ setup: "later" });
  assert.equal(You.readYou().joined, "", "closing the invitation is not joining");
  You.saveYou({ plan: { mood: "move" } });
  You.saveYou({ plan: { budget: 5 }, look: { accent: "lagoon" } });
  const you = You.readYou();
  assert.deepEqual([you.plan.mood, you.plan.budget, you.plan.timeMinutes, you.look.accent, you.look.cursor], ["move", 5, 60, "lagoon", true]);
  assert.ok(you.joined);
  const joined = you.joined;
  You.saveYou({ name: "Ada" });
  assert.equal(You.readYou().joined, joined);
  localStorage.setItem(You.KEYS.you, "{broken");
  assert.equal(You.readYou().setup, "new");
});

test("progress saved before the log existed keeps its count and badges", () => {
  const progress = You.cleanProgress({ completed: 4, badges: ["First Steps", "Campus Regular"] });
  assert.deepEqual([progress.completed, progress.log.length], [4, 0]);
  const { progress: next, earned } = quest(progress, at(25));
  assert.equal(next.completed, 5);
  assert.equal(next.log.length, 1);
  assert.deepEqual(earned, ["Quest Collector"]);
  assert.deepEqual(next.badges, ["First Steps", "Campus Regular", "Quest Collector"]);
});

test("a finished quest is logged with what it was, and the first one earns First Steps", () => {
  const { progress, earned } = quest(none(), at(25, 15), ["tiny-zine", "co-op-puzzle"]);
  assert.deepEqual(earned, ["First Steps", "Club Hopper"]);
  const [entry] = progress.log;
  assert.deepEqual(entry.stops, [
    { title: "Fold a tiny zine", group: "Makers Studio", url: "http://localhost:8081/", duration: 25, cost: 0, setting: "Maker table" },
    { title: "Co-op puzzle sprint", group: "Campus Games", url: "http://[::1]:8083/", duration: 20, cost: 0, setting: "Student lounge" },
  ]);
  assert.deepEqual([entry.minutes, entry.cost, entry.mood, entry.feel, entry.note], [45, 0, "make", "", ""]);
  assert.equal(new Date(entry.at).getTime(), at(25, 15).getTime());
});

test("a finished quest can be opened again, unless too little was kept", () => {
  const [entry] = quest(none(), at(25), ["button-badge", "photo-bingo"], "make").progress.log;
  const again = You.replay(entry);
  assert.deepEqual(again.choices, { mood: "make", timeMinutes: 60, budget: 5, activityRequest: "" });
  assert.deepEqual([again.plan.minutes, again.plan.cost, again.plan.stops.map(({ peer }) => peer.base)], [40, 2, ["http://localhost:8081", "http://[::1]:8083"]]);
  assert.equal(You.replay({ ...entry, stops: [{ title: "Old entry", group: "Makers Studio", url: "" }] }), null);
});

test("finishQuest stores the quest and reports the badges once", () => {
  assert.deepEqual(You.finishQuest(plan("tiny-zine"), { mood: "make" }), ["First Steps"]);
  assert.deepEqual(You.finishQuest(plan("tiny-zine"), { mood: "make" }), []);
  assert.equal(You.readProgress().completed, 2);
  assert.equal(new Set(You.readProgress().log.map((entry) => entry.id)).size, 2, "each entry has its own id");
});

test("badges follow the log, and one once earned stays", () => {
  let progress = none();
  for (const [day, picks, mood] of [[10, ["quick-cards"], "meet"], [11, ["tiny-zine"], "make"], [12, ["courtyard-walk"], "move"]]) progress = quest(progress, at(day), picks, mood).progress;
  const earned = You.badgesOf(progress, 1, at(25)).filter((badge) => badge.earned).map((badge) => badge.name);
  assert.deepEqual(earned, ["First Steps", "Campus Regular", "All Rounder", "Free Spirit"]);
  const social = You.badgesOf(progress, 1, at(25)).find((badge) => badge.name === "Social Spark");
  assert.deepEqual([social.have, social.need, social.earned], [1, 3, false]);
  for (const entry of [...progress.log]) progress = You.dropQuest(progress, entry.id);
  assert.deepEqual([progress.completed, progress.log.length], [0, 0]);
  assert.equal(You.badgesOf(progress, 1, at(25)).find((badge) => badge.name === "All Rounder").earned, true);
  const names = You.BADGES.map((badge) => badge.name);
  assert.equal(new Set(names).size, names.length);
  for (const { name, at: need } of You.LEVELS.slice(1)) assert.equal(You.BADGES.find((badge) => badge.name === name)?.goal, need, `${name} is both a level and a badge`);
});

test("badges earned by older quests or a lower goal are written down once", () => {
  const old = You.cleanProgress({ completed: 6, badges: ["First Steps"] });
  const kept = You.keepBadges(old, 1, at(25));
  assert.deepEqual(kept.badges, ["First Steps", "Campus Regular", "Quest Collector"]);
  assert.equal(You.keepBadges(kept, 1, at(25)), kept, "nothing new, nothing to save");
  let progress = none();
  for (const day of [3, 10, 17]) progress = quest(progress, at(day), ["tiny-zine"], "make", 2).progress;
  assert.ok(!progress.badges.includes("On a Roll"));
  const rolled = You.keepBadges(progress, 1, at(25));
  assert.ok(rolled.badges.includes("On a Roll"));
  assert.equal(You.badgesOf(rolled, 3, at(25)).find((badge) => badge.name === "On a Roll").earned, true, "a higher goal later does not take it back");
});

test("levels climb at 1, 3, 5, 10 and 20", () => {
  const names = [0, 1, 2, 3, 4, 5, 9, 10, 19, 20, 500].map((count) => You.levelOf(count).name);
  assert.deepEqual(names, ["Wanderer", "First Steps", "First Steps", "Campus Regular", "Campus Regular", "Quest Collector", "Quest Collector", "Trailblazer", "Trailblazer", "Campus Legend", "Campus Legend"]);
  assert.equal(You.levelOf(2).share, 2 / 3);
  assert.deepEqual([You.levelOf(20).next, You.levelOf(20).share], [null, 1]);
});

test("weeks start on Monday, and the numbers come from the log", () => {
  assert.equal(You.weekStart(at(25)).getTime(), new Date(2026, 10, 23).getTime());
  assert.equal(You.weekStart(at(23, 0)).getTime(), new Date(2026, 10, 23).getTime());
  assert.equal(You.weekStart(at(29, 23, 59)).getTime(), new Date(2026, 10, 23).getTime());
  let progress = none();
  for (const [day, picks, mood] of [[24, ["tiny-zine", "co-op-puzzle"], "make"], [25, ["button-badge"], "make"], [17, ["quick-cards"], "meet"]]) progress = quest(progress, at(day), picks, mood).progress;
  const stats = You.statsOf(progress, 1, at(25));
  assert.deepEqual([stats.completed, stats.logged, stats.minutes, stats.spent, stats.free, stats.hops, stats.topMood, stats.thisWeek], [3, 3, 85, 2, 2, 1, "make", 2]);
  assert.deepEqual(stats.groups.sort(), ["Campus Games", "Makers Studio"]);
  assert.equal(stats.weeks.length, 8);
  assert.deepEqual(stats.weeks.map((week) => week.count), [0, 0, 0, 0, 0, 0, 1, 2]);
  assert.deepEqual(You.statsOf(none(), 1, at(25)).topMood, "");
});

test("a streak counts weeks that reach the goal, and this week does not break it yet", () => {
  let progress = none();
  for (const day of [3, 10, 17]) progress = quest(progress, at(day)).progress; // three weeks in a row, nothing this week
  assert.equal(You.statsOf(progress, 1, at(25)).streak, 3);
  assert.equal(You.statsOf(quest(progress, at(24)).progress, 1, at(25)).streak, 4);
  assert.equal(You.statsOf(progress, 2, at(25)).streak, 0, "one quest a week does not reach a goal of two");
  assert.equal(You.statsOf(progress, 1, new Date(2026, 11, 9)).streak, 0, "a missed week ends it");
  assert.equal(You.statsOf(progress, 1, new Date(2026, 11, 9)).bestStreak, 3);
  assert.equal(You.badgesOf(progress, 1, at(25)).find((badge) => badge.name === "On a Roll").earned, true);
});

test("a streak survives the clocks changing", () => {
  let progress = none();
  for (let week = 0; week < 60; week++) progress = quest(progress, new Date(2026, 0, 7 + week * 7, 12)).progress;
  assert.equal(You.statsOf(progress, 1, new Date(2026, 0, 7 + 59 * 7, 13)).streak, 60);
});

test("notes, feelings and removal change one entry only", () => {
  let progress = quest(quest(none(), at(24)).progress, at(25), ["quick-cards"], "meet").progress;
  const [first, second] = progress.log;
  progress = You.editQuest(progress, second.id, { feel: "nah", note: "Too loud  \n for me", at: "not a date" });
  assert.equal(progress.log.length, 1, "an entry that stops being valid is dropped, not kept broken");
  progress = quest(quest(none(), at(24)).progress, at(25), ["quick-cards"], "meet").progress;
  progress = You.editQuest(progress, progress.log[1].id, { feel: "nah", note: "Too loud  \n for me" });
  assert.deepEqual([progress.log[1].feel, progress.log[1].note, progress.log[0].feel], ["nah", "Too loud for me", ""]);
  assert.deepEqual(You.tasteOf(You.cleanYou(null), progress).avoid, ["Quick card-table round"]);
  assert.equal(You.dropQuest(progress, progress.log[0].id).completed, 1);
  assert.equal(You.dropQuest(progress, "no such quest").completed, 2);
  assert.ok(first.id !== second.id);
});

test("free hours join into gaps, and the next one is found", () => {
  assert.deepEqual(You.gapBlocks([13, 14, 16]), [{ start: 13, end: 15 }, { start: 16, end: 17 }]);
  const gaps = You.cleanGaps([[], [], [13, 14], [10]]); // Wednesday 1–3 PM, Thursday 10–11 AM
  const during = You.nextGap(gaps, at(25, 13, 40));
  assert.deepEqual([during.isNow, during.minutes, during.wait], [true, 80, 0]);
  const before = You.nextGap(gaps, at(25, 12, 45));
  assert.deepEqual([before.isNow, before.minutes, before.wait], [false, 120, 15]);
  assert.equal(You.gapWhen(before, at(25, 12, 45), "en-US"), "In 15 min");
  assert.equal(You.gapWhen(You.nextGap(gaps, at(25, 9)), at(25, 9), "en-US").replace(/\s/g, " "), "Today 1:00 PM");
  const tomorrow = You.nextGap(gaps, at(25, 15));
  assert.equal(You.gapWhen(tomorrow, at(25, 15), "en-US").replace(/\s/g, " "), "Tomorrow 10:00 AM");
  const nearlyOver = You.nextGap(gaps, at(25, 14, 50));
  assert.equal(nearlyOver.isNow, false, "ten minutes left is too short to plan for");
  const nextWeek = You.nextGap(You.cleanGaps([[], [], [13]]), at(25, 14));
  assert.equal(nextWeek.start.getTime(), new Date(2026, 11, 2, 13).getTime());
  assert.equal(You.nextGap(You.cleanGaps(null), at(25)), null);
  assert.deepEqual([You.spanText(0), You.spanText(45), You.spanText(60), You.spanText(205)], ["0m", "45m", "1h", "3h 25m"]);
});

test("free time reads as words, with days that match taken together", () => {
  const say = (gaps) => You.gapsText(You.cleanGaps(gaps), "en-US").replace(/\s/g, " ");
  assert.equal(say([[12], [12], [12], [12], [12]]), "Monday to Friday 12:00 PM to 1:00 PM.");
  assert.equal(say([[13, 14], [], [13, 14], [], [9, 16]]), "Monday and Wednesday 1:00 PM to 3:00 PM. Friday 9:00 AM to 10:00 AM, 4:00 PM to 5:00 PM.");
  assert.equal(say([]), "");
});

test("a plan is saved once, taken off again, and survives a reload", () => {
  const choices = { mood: "make", timeMinutes: 60, budget: 5, activityRequest: "" };
  assert.equal(You.toggleSaved(plan("tiny-zine", "co-op-puzzle"), choices), true);
  assert.equal(You.isSaved(plan("tiny-zine", "co-op-puzzle")), true);
  assert.equal(You.isSaved(plan("tiny-zine")), false);
  assert.equal(You.readSaved()[0].plan.minutes, 45);
  assert.equal(You.toggleSaved(plan("tiny-zine", "co-op-puzzle"), choices), false);
  assert.deepEqual(You.readSaved(), []);
});

test("a saved plan that could not be started is dropped", () => {
  const good = plan("tiny-zine");
  const bad = (change) => { const copy = structuredClone(good); change(copy); return You.cleanPlan(copy); };
  assert.ok(You.cleanPlan(good));
  assert.equal(bad((copy) => { copy.stops = []; }), null);
  assert.equal(bad((copy) => { copy.stops[0].peer.base = "javascript:alert(1)"; }), null);
  assert.equal(bad((copy) => { copy.stops[0].item.title = " "; }), null);
  assert.equal(bad((copy) => { copy.stops[0].item.duration = "long"; }), null);
  assert.equal(bad((copy) => { copy.minutes = 9999; }).minutes, 25, "totals are worked out again");
  assert.deepEqual(You.cleanSaved([{ plan: good }, { plan: good }, null, { plan: 4 }]).length, 1);
});

test("the planner's next instructions are taken once", () => {
  const choices = { mood: "move", timeMinutes: 30, budget: 0, activityRequest: "walk" };
  You.planNext({ choices });
  assert.deepEqual(You.takeNext(), { choices, plan: null });
  assert.equal(You.takeNext(), null);
  You.planNext({ choices, plan: plan("courtyard-walk") });
  assert.equal(You.takeNext().plan.stops[0].item.id, "courtyard-walk");
  sessionStorage.setItem(You.KEYS.next, "[1,2");
  assert.equal(You.takeNext(), null);
});

test("a profile can move to another browser, and other files are refused", () => {
  You.saveYou({ name: "Ada", setup: "done", plan: { interests: ["puzzle"] }, gaps: [[13]] });
  You.finishQuest(plan("tiny-zine"), { mood: "make" });
  You.toggleSaved(plan("quick-cards"), { mood: "meet" });
  const text = You.exportText(You.readYou(), You.readProgress(), You.readSaved(), at(25));
  const back = You.importText(text);
  assert.equal(back.ok, true);
  assert.deepEqual(back.you, You.readYou());
  assert.deepEqual(back.progress, You.readProgress());
  assert.deepEqual(back.saved, You.readSaved());
  for (const other of ["", "{", "[]", "null", "{}", '{"app":"campus-sidequest"}', '{"app":"other","you":{"version":1}}']) assert.equal(You.importText(other).ok, false, other);
  const hostile = You.importText(JSON.stringify({ app: "campus-sidequest", you: { version: 1, name: "<img src=x onerror=alert(1)>", setup: "done" }, progress: { completed: 1e99, log: [{ at: "2026-11-25", stops: [{ title: "t", url: "javascript:alert(1)" }] }] }, saved: "x" }));
  assert.equal(hostile.ok, true);
  assert.equal(hostile.progress.log[0].url, undefined);
  assert.equal(hostile.progress.log[0].stops[0].url, "");
  assert.equal(hostile.progress.completed, 100000);
  // The sign-in and the AI key are not part of the file.
  assert.doesNotMatch(text, /email|@|byok|sk-/);
});

test("erasing leaves nothing behind", () => {
  You.saveYou({ name: "Ada" });
  You.finishQuest(plan("tiny-zine"), { mood: "make" });
  You.toggleSaved(plan("quick-cards"), { mood: "meet" });
  You.planNext({ choices: {} });
  localStorage.setItem(You.KEYS.account, '{"name":"Ada"}');
  sessionStorage.setItem(You.KEYS.consent, "allowed");
  You.eraseAll();
  assert.deepEqual([localStorage.items.size, sessionStorage.items.size], [0, 0]);
});

test("storage that refuses does not break the page", () => {
  const refuse = () => { throw new Error("QuotaExceeded"); };
  Object.defineProperty(globalThis, "localStorage", { value: { getItem: refuse, setItem: refuse, removeItem: refuse }, configurable: true, writable: true });
  assert.equal(You.readYou().setup, "new");
  assert.equal(You.saveYou({ name: "Ada" }).name, "Ada");
  assert.equal(You.saveYou({ plan: { mood: "move" } }).name, "Ada", "answers build on each other until the page closes");
  assert.deepEqual(You.finishQuest(plan("tiny-zine"), { mood: "make" }), ["First Steps"]);
  assert.equal(You.readProgress().completed, 1);
  You.eraseAll();
  assert.equal(You.readYou().name, "");
});

test("signing in sends first-time people to the setup and others back", () => {
  for (const setup of ["new", "later"]) for (const back of ["", "profile.html", "welcome.html"]) assert.equal(You.afterSignIn(setup, back), "welcome.html");
  for (const setup of ["done", "skipped"]) {
    assert.equal(You.afterSignIn(setup, "profile.html"), "profile.html");
    assert.equal(You.afterSignIn(setup, ""), "./");
    for (const elsewhere of ["https://evil.example/", "//evil.example", "javascript:alert(1)", "auth.html", undefined]) assert.equal(You.afterSignIn(setup, elsewhere), "./", String(elsewhere));
  }
});

test("the visitor's own name wins over their Google one", () => {
  assert.equal(You.nameOf({ name: "Ada" }, { name: "Augusta King" }), "Ada");
  assert.equal(You.nameOf({ name: "" }, { name: "Augusta King" }), "Augusta");
  assert.equal(You.nameOf({ name: "" }, null), "");
});

test("a face is three characters and reads as words", () => {
  for (const eyes of You.EYES) for (const mouth of You.MOUTHS) assert.equal(You.miniFace({ eyes: eyes.id, mouth: mouth.id }).length, 3);
  assert.equal(You.miniFace(undefined), "ouo");
  assert.equal(You.faceText({ eyes: "happy", mouth: "cat", hat: "grad" }), "happy eyes, cat mouth, grad cap");
  const face = You.randomFace(() => 0.999);
  assert.deepEqual(You.cleanYou({ face }).face, face);
});

// ---- Taste ------------------------------------------------------------------------------

test("every interest matches a listing, and tapping it finds a plan", () => {
  for (const { id, label, mood, request } of INTERESTS) {
    assert.ok(mood in MOODS, id);
    assert.ok(ALL.some((item) => interestsIn(item, [id]).length), `${label} matches no listing`);
    assert.ok(searchTerms(request).length, `${label}: "${request}" searches for nothing`);
    assert.ok(findPlans(LISTS, { mood, timeMinutes: 90, budget: 10, activityRequest: request }).length, `${label}: "${request}" finds no plan`);
  }
  assert.equal(new Set(INTERESTS.map(({ id }) => id)).size, INTERESTS.length);
});

test("interests match titles, not passing mentions", () => {
  const titled = (title) => ALL.find((item) => item.title === title);
  assert.deepEqual(interestsIn(titled("Photo challenge cards"), ["cards", "photo"]).map(({ id }) => id), ["photo"]);
  assert.deepEqual(interestsIn(titled("Quick card-table round"), ["cards"]).map(({ id }) => id), ["cards"]);
  assert.deepEqual(interestsIn(titled("Design a button badge"), ["sketch"]), [], "a doodle in the description is not an interest match");
  assert.deepEqual(interestsIn(null, ["zine"]), []);
  assert.equal(placeOf({ setting: "Around campus" }), "around");
  assert.equal(placeOf({ setting: "Maker table" }), "inside");
  assert.equal(placeOf({}), "inside");
});

test("taste breaks ties towards what the visitor likes", () => {
  const choices = { mood: "make", timeMinutes: 30, budget: 0, activityRequest: "" };
  for (const id of ["sketch", "zine", "puzzle", "photo"]) {
    const [first] = findPlans(LISTS, choices, { interests: [id] });
    assert.ok(first.stops.some(({ item }) => interestsIn(item, [id]).length), `${id} should come first, got ${first.stops.map(({ item }) => item.title)}`);
  }
  const avoid = ["Fold a tiny zine"];
  const titles = findPlans(LISTS, choices, { interests: ["zine"], avoid }).map((entry) => entry.stops.map(({ item }) => item.title).join());
  assert.notEqual(titles[0], "Fold a tiny zine");
  assert.ok(tasteScore(MAKER[0], { interests: ["zine"], avoid }) < 0);
  const around = findPlans(LISTS, { ...choices, mood: "move", timeMinutes: 30, budget: 10 }, { place: "around" })[0];
  assert.ok(around.stops.every(({ item }) => placeOf(item) === "around"));
});

test("taste never hides a listing, loosens a limit or changes plans without a taste", () => {
  const tastes = [{ interests: INTERESTS.map(({ id }) => id), place: "around" }, { interests: ["cards"], place: "inside", avoid: ALL.map((item) => item.title) }, { place: "any" }];
  for (const mood of Object.keys(MOODS)) for (const timeMinutes of TIME_OPTIONS) for (const budget of BUDGET_OPTIONS) for (const activityRequest of ["", "zine", "cards", "walk"]) {
    const choices = { mood, timeMinutes, budget, activityRequest }, plain = findPlans(LISTS, choices);
    assert.deepEqual(findPlans(LISTS, choices, {}), plain);
    assert.deepEqual(findPlans(LISTS, choices, { interests: [], place: "any", avoid: [] }), plain);
    for (const taste of tastes) {
      const tuned = findPlans(LISTS, choices, taste);
      assert.equal(tuned.length, plain.length, JSON.stringify(choices));
      for (const entry of tuned) assert.ok(entry.minutes <= timeMinutes && entry.cost <= budget, JSON.stringify(choices));
    }
  }
});

test("a request still beats taste", () => {
  const [first] = findPlans(LISTS, { mood: "meet", timeMinutes: 30, budget: 10, activityRequest: "cards" }, { interests: ["zine", "puzzle"], avoid: ["Quick card-table round"] });
  assert.equal(first.stops[0].item.id, "quick-cards");
});

// ---- The pages --------------------------------------------------------------------------

test("look.js knows the same accents as the profile, and styles.css draws each one", () => {
  const ids = You.ACCENTS.map(({ id }) => id), css = source("sidequest/styles.css");
  const listed = source("sidequest/look.js").match(/const ACCENTS = \[([^\]]+)\]/)[1].match(/[a-z]+/g);
  assert.deepEqual(listed, ids);
  for (const id of ids) {
    const rule = css.match(new RegExp(`\\[data-accent-chip="${id}"\\] \\{([^}]+)\\}`))[1];
    assert.equal(rule.match(/--ramp: ([^;]+)/)[1].match(/#[0-9a-f]{6}/g).length, 9, id);
    for (const name of ["violet", "orchid", "magenta", "pink", "coral", "orange", "gold", "link", "on-accent"]) assert.match(rule, new RegExp(`--${name}: #`), `${id} --${name}`);
  }
});

test("the profile and the setup cannot send anything anywhere", () => {
  for (const page of ["profile.html", "welcome.html"]) {
    const csp = source(`sidequest/${page}`).match(/Content-Security-Policy" content="([^"]+)"/)[1];
    assert.match(csp, /connect-src 'none'/, page);
    assert.match(csp, /default-src 'self'/, page);
    assert.match(csp, /script-src 'self'(;|$)/, page);
    assert.match(csp, /form-action 'self'/, page);
  }
  for (const file of ["you.js", "you-controls.js", "personal.js", "profile.js", "profile-page.js", "welcome.js", "buddy.js", "look.js"]) {
    assert.doesNotMatch(source(`sidequest/${file}`), /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|\.innerHTML|insertAdjacentHTML|\beval\(/, file);
  }
});

test("the AI agent's page actions do not read the profile", () => {
  assert.doesNotMatch(source("sidequest/site-actions.js"), /you\.js|google-auth|interests|readYou|readProfile/);
  const status = source("sidequest/sidequest.js").match(/status: \(\) => \(\{[\s\S]+?\}\),/)[0];
  assert.doesNotMatch(status, /readYou|interests|taste|readProgress|readProfile/);
  const summary = source("sidequest/sidequest.js").match(/const planSummary = [\s\S]+?\}\);/)[0];
  assert.doesNotMatch(summary, /readYou|interests|taste/);
});
