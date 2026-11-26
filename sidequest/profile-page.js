// The profile page. It shows and edits what you.js keeps in this browser, and changes nothing
// else. Choices save as they are made; the name, tagline and face save together.
import { MOODS } from "./planner.js";
import { readProfile, signIn, signOut } from "./google-auth.js";
import { deleteByokProfile, loadByokStore, saveTabByokSetup } from "./runtime/byok.js";
import {
  FEELS, KEYS, NOTE_MAX, badgesOf, clock, dropQuest, editQuest, eraseAll, exportText, freeHours, gapWhen, gapsText, importText, keepBadges, levelOf,
  nameOf, nextGap, planNext, readProgress, readSaved, readYou, replay, saveProgress, saveSaved, saveYou, spanText, statsOf,
} from "./you.js";
import { avatar, blockBar, button, el, faceControls, gapControls, interestControls, lookControls, radios, toast } from "./you-controls.js";
import { Buddy } from "./buddy.js";

const $ = (selector) => document.querySelector(selector);
const money = (cost) => (cost === 0 ? "Free" : `$${cost}`);
const many = (count, one, more = `${one}s`) => `${count} ${count === 1 ? one : more}`;
const words = (list) => new Intl.ListFormat("en-GB").format(list);

let you = readYou(), progress = readProgress(), saved = readSaved(), account = readProfile();
let editing = false;
const buddy = new Buddy($("#buddy"), you.face);

// ---- Hero -------------------------------------------------------------------------------

function renderHero() {
  const name = you.name || account?.name || "", level = levelOf(progress.completed), stats = statsOf(progress, you.goal), gap = nextGap(you.gaps);
  document.title = name ? `${name} | Campus Sidequest` : "Your profile | Campus Sidequest";
  const badge = $("#me-level"), badgeText = `Level ${level.number} · ${level.name}`;
  if (badge.textContent !== badgeText) badge.textContent = badgeText;
  const title = $("#me-name"), titleText = name || "Hey, you.";
  // The intro splits the title into letters; only replace it when the name changed.
  if (title.dataset.name !== titleText) { title.textContent = titleText; title.dataset.name = titleText; }
  // The size follows the longest word, so a long name shrinks instead of breaking.
  title.style.setProperty("--letters", String(Math.max(5, ...titleText.split(" ").map((word) => [...word].length))));
  $("#me-tagline").textContent = you.tagline || (name ? "Add a tagline, so your profile sounds like you." : "Add your name and pick a face. It stays in this browser.");
  $("#me-tagline").classList.toggle("is-empty", !you.tagline);

  const meter = $("#me-meter"), line = el("div", "me-meter-text");
  line.append(el("span", "", level.next ? `${progress.completed} of ${level.next.at} quests` : many(progress.completed, "quest")), el("span", "", level.next ? `Next: ${level.next.name}` : "Top level"));
  meter.replaceChildren(line, blockBar(level.share));

  $("#hud-joined").textContent = you.joined ? `JOINED ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(you.joined)).toUpperCase()}` : "NEW HERE";
  $("#hud-moods").textContent = Object.entries(stats.byMood).map(([mood, count]) => `${mood.toUpperCase()} ${count}`).join(" · ");
  $("#hud-gap").textContent = gap ? `NEXT GAP ${gapWhen(gap).toUpperCase()}` : "NO GAPS SET";
  $("#me-setup").hidden = you.setup === "done";
  if (!editing) buddy.face = you.face;
}

// Sharing is the visitor's own doing: their share sheet opens, or the text is copied.
$("#me-share").addEventListener("click", async () => {
  const name = nameOf(you, account), level = levelOf(progress.completed), stats = statsOf(progress, you.goal);
  const text = `${name ? `${name} on Campus Sidequest` : "My Campus Sidequest"}: level ${level.number}, ${level.name}. ${words([many(progress.completed, "quest"), `${spanText(stats.minutes)} of breaks`, many(progress.badges.length, "badge")])}.`;
  try {
    if (navigator.share) await navigator.share({ title: "My Campus Sidequest", text, url: new URL("./", location.href).href });
    else { await navigator.clipboard.writeText(text); toast("Copied. Paste it anywhere."); }
  } catch (error) { if (error.name !== "AbortError") toast("Could not share from this browser."); }
});

// ---- Editing the name, tagline and face -------------------------------------------------

let draft = null;

function openEditor() {
  editing = true;
  draft = { face: { ...you.face }, picture: you.picture };
  $("#me-form-name").value = you.name;
  $("#me-form-name").placeholder = nameOf(you, account) || "What should we call you?";
  $("#me-form-tagline").value = you.tagline;
  const face = $("#me-form-face"), picture = $("#me-form-picture");
  face.replaceChildren();
  faceControls(face, draft.face, (next, kind) => {
    draft.face = next;
    buddy.face = next;
    buddy.react({ hat: "hop", shuffle: "spin" }[kind] || "nod");
  });
  picture.replaceChildren();
  if (account?.picture) {
    radios(picture, [{ value: "google", label: "Google photo" }, { value: "face", label: "My face" }], { legend: "Small picture", value: draft.picture, kind: "segmented", onChange: (value) => { draft.picture = value; } });
  }
  $("#me-view").hidden = true;
  $("#me-form").hidden = false;
  $("#me-form-name").focus({ preventScroll: true });
}

function closeEditor() {
  editing = false;
  $("#me-form").hidden = true;
  $("#me-view").hidden = false;
  buddy.face = you.face;
  $("#me-edit").focus({ preventScroll: true });
}

$("#me-edit").addEventListener("click", openEditor);
$("#me-cancel").addEventListener("click", closeEditor);
$("#me-form").addEventListener("keydown", (event) => { if (event.key === "Escape") closeEditor(); });
$("#me-form").addEventListener("submit", (event) => {
  event.preventDefault();
  saveYou({ name: $("#me-form-name").value, tagline: $("#me-form-tagline").value, face: draft.face, picture: account?.picture ? draft.picture : "face" });
  reload();
  closeEditor();
  buddy.react("hop");
  toast("Profile saved.");
});

// ---- Overview ---------------------------------------------------------------------------

function renderOverview() {
  const stats = statsOf(progress, you.goal), early = stats.completed - stats.logged;
  const tiles = [
    ["Quests finished", String(stats.completed), stats.completed ? `${many(stats.groups.length, "group")} visited` : "Your first takes about 30 minutes"],
    ["Time well spent", spanText(stats.minutes), stats.logged ? `About ${spanText(Math.round(stats.minutes / stats.logged))} a quest` : "Adds up as you go"],
    ["Money spent", `$${stats.spent}`, !stats.logged ? "Free quests are the default" : stats.free === stats.logged ? "Every quest was free" : `${stats.free} of ${stats.logged} were free`],
    ["Week streak", String(stats.streak), stats.bestStreak > stats.streak ? `Best so far: ${stats.bestStreak}` : stats.streak ? "Your best yet" : `Goal: ${many(you.goal, "quest")} a week`],
    ["Top vibe", stats.topMood ? MOODS[stats.topMood].label : "–", stats.topMood ? `${stats.byMood[stats.topMood]} of ${many(stats.logged, "quest")}` : "Shows after your first quest"],
  ];
  $("#me-tiles").replaceChildren(...tiles.map(([label, value, note]) => {
    const tile = el("div"), figure = el("dd", value.length > 8 ? "is-words" : "", value);
    tile.append(el("dt", "", label), figure, el("dd", "me-tile-note", note));
    return tile;
  }));
  $("#me-early").hidden = !early;
  $("#me-early").textContent = early ? `${many(early, "earlier quest")} ${early === 1 ? "counts" : "count"} without details, so time, money and vibe leave ${early === 1 ? "it" : "them"} out.` : "";
  renderWeek(stats);
  renderNextGap();
}

function renderWeek(stats) {
  const root = $("#me-week"), days = 7 - ((new Date().getDay() + 6) % 7), left = you.goal - stats.thisWeek;
  const head = el("p", "me-week-text");
  head.append(el("strong", "", `${stats.thisWeek} of ${you.goal}`), ` ${you.goal === 1 ? "quest" : "quests"}. ${left > 0 ? `${left} to go, ${days === 1 ? "last day" : `${days} days left`}.` : "Goal reached."}`);
  const meter = el("div", "me-goal"), fill = el("i");
  meter.setAttribute("role", "img");
  meter.setAttribute("aria-label", `${stats.thisWeek} of ${you.goal} quests this week`);
  fill.style.width = `${Math.min(1, stats.thisWeek / you.goal) * 100}%`;
  meter.append(fill);

  // The last eight weeks: one block per quest, with a line at the goal.
  const title = el("p", "me-weeks-title");
  title.append(el("span", "", "Last eight weeks"), el("span", "", `Line: your goal of ${you.goal}`));
  const short = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }), top = Math.max(you.goal, 3, ...stats.weeks.map((week) => Math.min(5, week.count)));
  const chart = el("ol", "me-weeks");
  chart.style.setProperty("--top", String(top));
  chart.style.setProperty("--goal", String(you.goal));
  chart.setAttribute("aria-label", "Quests in the last eight weeks");
  stats.weeks.forEach((week, index) => {
    const column = el("li"), blocks = el("span", "me-weeks-blocks");
    const label = `${index === 7 ? "This week" : `Week of ${short.format(week.start)}`}: ${many(week.count, "quest")}`;
    column.tabIndex = 0;
    column.setAttribute("aria-label", label);
    column.dataset.tip = label;
    blocks.setAttribute("aria-hidden", "true");
    for (let block = 0; block < Math.min(5, week.count); block++) blocks.append(el("i"));
    column.append(blocks);
    chart.append(column);
  });
  const axis = el("p", "me-weeks-axis");
  axis.setAttribute("aria-hidden", "true");
  axis.append(el("span", "", short.format(stats.weeks[0].start)), el("span", "", "this week"));
  root.replaceChildren(head, meter, title, chart, axis);
}

function renderNextGap() {
  const root = $("#me-gap"), gap = nextGap(you.gaps);
  if (!gap) {
    const copy = el("p", "me-gap-empty", "Mark when you’re usually free and Sidequest plans around it.");
    const link = el("a", "btn btn-ghost btn-sm", "Mark my free time");
    link.href = "#free-time";
    root.replaceChildren(copy, link);
    return;
  }
  const when = el("p", "me-gap-when", gapWhen(gap));
  const detail = el("p", "me-gap-text", gap.isNow
    ? `You’re free until ${clock(gap.end)}. ${spanText(gap.minutes)} left.`
    : `${clock(gap.start)} to ${clock(gap.end)}, ${spanText(gap.minutes)} free.`);
  const go = button("btn btn-primary btn-sm", "Plan this gap", () => {
    const time = [90, 60, 30].find((minutes) => minutes <= gap.minutes) || 30;
    planNext({ choices: { mood: you.plan.mood, timeMinutes: time, budget: you.plan.budget, activityRequest: "" } });
    location.href = "./#planner";
  });
  root.replaceChildren(when, detail, go);
}

// ---- Free time --------------------------------------------------------------------------

const gapGrid = gapControls($("#me-gaps"), you.gaps, (gaps) => { saveYou({ gaps }); });

function renderFreeTime() {
  const hours = freeHours(you.gaps);
  $("#me-gaps-text").textContent = hours ? `${many(hours, "free hour")} a week. ${gapsText(you.gaps)}` : "Nothing marked yet. Mark the hours between your classes, or use a preset.";
}

// ---- Quests -----------------------------------------------------------------------------

function emptyState(art, text, label) {
  const box = el("div", "me-empty"), drawing = el("pre", "", art), link = el("a", "btn btn-primary btn-sm", label);
  drawing.setAttribute("aria-hidden", "true");
  link.href = "./#planner";
  box.append(drawing, el("p", "", text), link);
  return box;
}

function openOnHub(next) {
  planNext(next);
  location.href = "./#planner";
}

function groupLinks(stops) {
  const line = el("p", "quest-groups"), seen = new Set();
  for (const { group, url } of stops) {
    if (!group || seen.has(group)) continue;
    seen.add(group);
    if (line.childNodes.length) line.append(" · ");
    if (!url) { line.append(group); continue; }
    const link = el("a", "", group);
    Object.assign(link, { href: url, target: "_blank", rel: "noopener noreferrer" });
    line.append(link);
  }
  return line;
}

const LOG_FIRST = 8, LOG_MORE = 20;
let logShown = "", logLimit = LOG_FIRST;

function renderLog() {
  const root = $("#panel-log");
  $("#count-log").textContent = String(progress.completed);
  // A changed note is already in its field; redrawing the list would take the focus from it.
  const key = JSON.stringify(progress.log.map((entry) => ({ ...entry, note: "" })));
  if (key === logShown && progress.log.length) {
    for (const entry of progress.log) {
      const field = root.querySelector(`[data-note="${entry.id}"]`);
      if (field && field !== document.activeElement) field.value = entry.note;
    }
    return;
  }
  logShown = key;
  if (!progress.log.length) {
    root.replaceChildren(emptyState("  o      |>\n /|\\     |\n / \\     |\n=========|..", progress.completed ? "Your next finished quest shows up here, with its stops." : "No quests yet. Your first one takes about 30 minutes.", "Find my hour"));
    return;
  }
  const list = el("ol", "quest-list"), day = new Intl.DateTimeFormat(undefined, { day: "numeric" }), month = new Intl.DateTimeFormat(undefined, { month: "short" }), full = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });
  for (const entry of [...progress.log].reverse().slice(0, logLimit)) {
    const row = el("li", "quest-row"), at = new Date(entry.at), date = el("time", "quest-date"), body = el("div", "quest-body"), side = el("div", "quest-side");
    date.dateTime = entry.at;
    date.title = full.format(at);
    date.append(el("b", "", day.format(at)), el("span", "", month.format(at)));
    const title = entry.stops.map((stop) => stop.title).join(" → ");
    body.append(el("p", "quest-meta", `${MOODS[entry.mood].label} · ${entry.minutes} min · ${money(entry.cost)}`), el("h3", "", title), groupLinks(entry.stops));

    const tail = el("div", "quest-tail"), feels = el("div", "quest-feels");
    feels.setAttribute("role", "group");
    feels.setAttribute("aria-label", `How was ${title}?`);
    for (const feel of FEELS) {
      const choice = button("", feel.face, () => {
        saveProgress(editQuest(readProgress(), entry.id, { feel: entry.feel === feel.id ? "" : feel.id }));
        toast(entry.feel === feel.id ? "Cleared." : feel.id === "nah" ? "Got it. It goes last in your plans from now on." : "Noted.");
        root.querySelector(`[data-feel="${entry.id}-${feel.id}"]`)?.focus();
      });
      choice.setAttribute("aria-pressed", String(entry.feel === feel.id));
      choice.setAttribute("aria-label", feel.label);
      choice.title = feel.label;
      choice.dataset.feel = `${entry.id}-${feel.id}`;
      feels.append(choice);
    }
    const note = el("input", "quest-note");
    Object.assign(note, { type: "text", value: entry.note, maxLength: NOTE_MAX, placeholder: "Add a note", autocomplete: "off" });
    note.dataset.note = entry.id;
    note.setAttribute("aria-label", `Note for ${title}`);
    note.addEventListener("change", () => {
      if (note.value.trim() === progress.log.find((other) => other.id === entry.id)?.note) return;
      saveProgress(editQuest(readProgress(), entry.id, { note: note.value }));
      toast("Note saved.");
    });
    note.addEventListener("keydown", (event) => { if (event.key === "Enter") note.blur(); });
    tail.append(feels, note);
    body.append(tail);

    const again = replay(entry);
    if (again) side.append(button("me-quiet", "Do it again", () => openOnHub(again)));
    side.append(button("me-quiet", "Remove", () => {
      const before = readProgress();
      saveProgress(dropQuest(before, entry.id));
      toast("Removed from your log.", { label: "Undo", run: () => saveProgress(before) });
    }));
    row.append(date, body, side);
    list.append(row);
  }
  root.replaceChildren(list);
  const rest = progress.log.length - logLimit;
  if (rest <= 0) return;
  root.append(button("me-quiet quest-more", `Show ${Math.min(rest, LOG_MORE)} more of ${rest}`, () => {
    const first = logLimit;
    logLimit += LOG_MORE;
    logShown = "";
    renderLog();
    root.querySelectorAll(".quest-feels button:first-child")[first]?.focus();
    window.ScrollTrigger?.refresh();
  }));
}

function renderSaved() {
  const root = $("#panel-saved");
  $("#count-saved").textContent = String(saved.length);
  if (!saved.length) {
    root.replaceChildren(emptyState(" .------.\n | +    |\n |      |\n '--\\/--'", "Nothing saved. Tap Save on a plan to keep it here for another day.", "Make a plan"));
    return;
  }
  const list = el("ol", "quest-list");
  for (const entry of saved) {
    const row = el("li", "quest-row is-saved"), body = el("div", "quest-body"), side = el("div", "quest-side"), { plan, choices } = entry;
    const title = plan.stops.map(({ item }) => item.title).join(" → ");
    body.append(el("p", "quest-meta", `${MOODS[choices.mood].label} · ${plan.minutes} min · ${money(plan.cost)}`), el("h3", "", title), groupLinks(plan.stops.map(({ peer }) => ({ group: peer.name, url: `${peer.base}/` }))));
    side.append(
      button("btn btn-primary btn-sm", "Start", () => openOnHub({ plan, choices })),
      button("me-quiet", "Remove", () => {
        const before = readSaved();
        saveSaved(before.filter((other) => other.id !== entry.id));
        toast("Removed from saved.", { label: "Undo", run: () => saveSaved(before) });
      }),
    );
    row.append(body, side);
    list.append(row);
  }
  root.replaceChildren(list);
}

const tabs = [$("#tab-log"), $("#tab-saved")];
function selectTab(tab, focus) {
  for (const other of tabs) {
    const on = other === tab;
    other.setAttribute("aria-selected", String(on));
    other.tabIndex = on ? 0 : -1;
    $(`#${other.getAttribute("aria-controls")}`).hidden = !on;
  }
  if (focus) tab.focus();
  window.ScrollTrigger?.refresh();
}
for (const tab of tabs) {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    selectTab(tabs[event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - tabs.indexOf(tab)], true);
  });
}

// ---- Badges -----------------------------------------------------------------------------

function renderBadges() {
  const badges = badgesOf(progress, you.goal), earned = badges.filter((badge) => badge.earned).length;
  $("#badges-title").setAttribute("aria-label", `Badges. ${earned} of ${badges.length} earned.`);
  $("#me-badges").replaceChildren(...badges.map((badge) => {
    const card = el("li", badge.earned ? "is-earned" : ""), icon = el("span", "badge-icon", badge.icon), state = el("span", "badge-state");
    icon.setAttribute("aria-hidden", "true");
    state.textContent = badge.earned ? "Earned" : `${badge.have} of ${badge.need}`;
    const bar = el("span", "badge-bar"), fill = el("i");
    bar.setAttribute("aria-hidden", "true");
    fill.style.width = `${(badge.have / badge.need) * 100}%`;
    bar.append(fill);
    card.append(icon, el("strong", "", badge.name), el("p", "", badge.hint), bar, state);
    return card;
  }));
}

// ---- Planner defaults and look ------------------------------------------------------------

function buildPlanner() {
  const root = $("#me-plan"), set = (patch) => { saveYou({ plan: patch }); toast("Saved."); };
  root.replaceChildren();
  const pair = () => { const box = el("div", "me-two"); root.append(box); return box; };
  radios(root, [
    { value: "meet", label: MOODS.meet.label, icon: ":-)", desc: "Low-pressure and social" },
    { value: "make", label: MOODS.make.label, icon: "/~/", desc: "Try a quick creative activity" },
    { value: "move", label: MOODS.move.label, icon: ">>>", desc: "Explore or stretch your legs" },
  ], { legend: "Usual vibe", value: you.plan.mood, kind: "cards", onChange: (mood) => set({ mood }) });
  const limits = pair();
  radios(limits, [{ value: 30, label: "30 min" }, { value: 60, label: "1 hour" }, { value: 90, label: "90 min" }], { legend: "Usual time", value: you.plan.timeMinutes, kind: "segmented", onChange: (timeMinutes) => set({ timeMinutes }) });
  radios(limits, [{ value: 0, label: "Free" }, { value: 5, label: "Up to $5" }, { value: 10, label: "Up to $10" }], { legend: "Usual budget", value: you.plan.budget, kind: "segmented", onChange: (budget) => set({ budget }) });
  const interests = el("fieldset", "yc-group");
  interests.append(el("legend", "", "Into"));
  const box = el("div");
  interestControls(box, you.plan.interests, (next) => set({ interests: next }));
  interests.append(box, el("p", "me-note", "When plans fit equally well, the one with something you like comes first. Nothing is ever hidden."));
  root.append(interests);
  const rest = pair();
  radios(rest, [{ value: "any", label: "Anywhere" }, { value: "inside", label: "Indoors" }, { value: "around", label: "Out and about" }], { legend: "Where", value: you.plan.place, kind: "segmented", onChange: (place) => set({ place }) });
  radios(rest, [{ value: 1, label: "1 a week" }, { value: 2, label: "2 a week" }, { value: 3, label: "3 a week" }], { legend: "Weekly goal", value: you.goal, kind: "segmented", onChange: (goal) => { saveYou({ goal }); keep(); toast("Saved."); } });
}

function buildLook() {
  const root = $("#me-look");
  root.replaceChildren();
  lookControls(root, you.look, (look, changed) => {
    saveYou({ look });
    window.SidequestLook?.apply(look);
    if (changed === "accent") buddy.react("spin");
    toast(changed === "motion" ? "Saved. Other pages follow when you open them." : "Saved.");
  });
}

// ---- Account and data ---------------------------------------------------------------------

function renderAccount() {
  const root = $("#me-account");
  if (!account) {
    const go = button("btn btn-primary btn-sm", "Continue with Google", () => { go.disabled = true; signIn("profile.html"); });
    root.replaceChildren(el("p", "me-account-text", "Not signed in, and you don’t have to be. Signing in adds your name and picture here. It doesn’t sync your profile to other devices."), go);
    return;
  }
  const row = el("div", "me-account"), who = el("div");
  who.append(el("strong", "", account.name), el("small", "", account.email));
  row.append(avatar({ setup: "done", picture: "google", face: you.face }, account), who);
  root.replaceChildren(row, el("p", "me-account-text", "Only your name, email and picture link are kept. Signing out removes them and leaves the rest of your profile."), button("btn btn-ghost btn-sm", "Sign out", () => { signOut(); toast("Signed out. Your profile is still here."); }));
}

const aiSetups = () => { try { return loadByokStore().profiles; } catch { return []; } };
function forgetAi() {
  for (const { id } of aiSetups()) deleteByokProfile(id);
  saveTabByokSetup(null);
}
const readAllowed = () => { try { return sessionStorage.getItem(KEYS.consent) === "allowed"; } catch { return false; } };

function renderData() {
  const ai = aiSetups().length;
  const rows = [
    ["Profile and preferences", you.joined ? "Name, face, planner defaults, free time and look" : "Nothing yet", you.joined && ["Reset", () => ask({ kicker: "/ reset", title: "Reset your preferences?", copy: "Your name, face, planner defaults, free time and look go back to how they started. Your quests and badges stay.", yes: "Reset" }, () => { clear(KEYS.you); window.SidequestLook?.apply(readYou().look); toast("Preferences reset."); })]],
    ["Finished quests", progress.completed ? `${many(progress.completed, "quest")}, ${many(progress.badges.length, "badge")}` : "Nothing yet", progress.completed > 0 && ["Clear", () => ask({ kicker: "/ clear", title: "Clear your finished quests?", copy: "Your quest log, level and badges are removed. This can’t be undone, so download your profile first if you might want them back.", yes: "Clear quests" }, () => { clear(KEYS.progress); toast("Quests cleared."); })]],
    ["Saved plans", saved.length ? many(saved.length, "plan") : "Nothing yet", saved.length > 0 && ["Clear", () => { const before = readSaved(); saveSaved([]); toast("Saved plans cleared.", { label: "Undo", run: () => saveSaved(before) }); }]],
    ["AI provider key", ai ? `${many(ai, "saved setup")}, for the AI agent` : "None saved", ai > 0 && ["Forget", () => ask({ kicker: "/ ai key", title: "Forget your AI key?", copy: "The AI agent asks for a key again next time. Quick chat and the planner don’t need one.", yes: "Forget key" }, () => { forgetAi(); reload(); toast("AI key forgotten."); })]],
    ["Reading activity lists", readAllowed() ? "Allowed in this tab until you close it" : "Asks you every time", readAllowed() && ["Ask me", () => { try { sessionStorage.removeItem(KEYS.consent); } catch {} reload(); toast("Sidequest asks again before reading."); }]],
  ];
  $("#me-data").replaceChildren(...rows.map(([name, text, action]) => {
    const row = el("li"), copy = el("div");
    copy.append(el("strong", "", name), el("small", "", text));
    row.append(copy);
    if (action) {
      const run = button("me-quiet", action[0], action[1]);
      run.setAttribute("aria-label", `${action[0]}: ${name}`);
      row.append(run);
    }
    return row;
  }));
}

function clear(key) {
  try { localStorage.removeItem(key); } catch {}
  reload();
  window.dispatchEvent(new CustomEvent("sidequest:changed", { detail: key }));
  rebuildControls();
}

/** Ask before something that can't be undone. */
function ask({ kicker, title, copy, list = [], yes }, run) {
  const dialog = $("#ask");
  $("#ask-kicker").textContent = kicker;
  $("#ask-title").textContent = title;
  $("#ask-copy").textContent = copy;
  $("#ask-list").replaceChildren(...list.map((text) => el("li", "", text)));
  $("#ask-list").hidden = !list.length;
  $("#ask-yes").textContent = yes;
  dialog.returnValue = "cancel";
  dialog.showModal();
  dialog.querySelector(".cancel-button").focus();
  dialog.addEventListener("close", () => { if (dialog.returnValue === "yes") run(); }, { once: true });
}

$("#data-export").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([exportText(you, progress, saved)], { type: "application/json" })), link = el("a");
  link.href = url;
  link.download = "sidequest-profile.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Downloaded. Your sign-in and AI key are not in the file.");
});
$("#data-import").addEventListener("click", () => $("#data-file").click());
$("#data-file").addEventListener("change", async () => {
  const [file] = $("#data-file").files;
  $("#data-file").value = "";
  if (!file) return;
  const found = file.size > 2_000_000 ? { ok: false, reason: "That file is too big to be a Sidequest profile." } : importText(await file.text());
  if (!found.ok) { toast(found.reason); return; }
  ask({
    kicker: "/ load a profile", title: "Replace what’s here?", yes: "Replace",
    copy: "Your profile, finished quests and saved plans in this browser are replaced with the ones in the file.",
    list: [found.you.name ? `Name: ${found.you.name}` : "No name", many(found.progress.completed, "finished quest"), many(found.saved.length, "saved plan")],
  }, () => {
    saveYou(found.you);
    saveProgress(found.progress);
    saveSaved(found.saved);
    reload();
    rebuildControls();
    window.SidequestLook?.apply(you.look);
    toast("Profile loaded.");
  });
});
$("#data-erase").addEventListener("click", () => ask({
  kicker: "/ erase everything", title: "Erase everything?", yes: "Erase everything",
  copy: "Sidequest forgets you in this browser. This can’t be undone.",
  list: [`Your profile, preferences and free time`, `${many(progress.completed, "finished quest")} and ${many(progress.badges.length, "badge")}`, many(saved.length, "saved plan"), ...(account ? ["Your Google sign-in"] : []), ...(aiSetups().length ? ["Your AI provider key"] : [])],
}, () => {
  forgetAi();
  eraseAll();
  closeEditor();
  reload();
  rebuildControls();
  window.SidequestLook?.apply(you.look);
  scrollTo({ top: 0 });
  toast("Erased. Nothing is left in this browser.");
}));

// ---- Section links ------------------------------------------------------------------------

function watchSections() {
  const links = [...$("#me-nav").querySelectorAll("a")], sections = links.map((link) => $(link.getAttribute("href")));
  const mark = () => {
    const line = innerHeight * 0.35, atEnd = scrollY + innerHeight >= document.documentElement.scrollHeight - 4;
    let at = 0;
    sections.forEach((section, index) => { if (section.getBoundingClientRect().top <= line) at = index; });
    if (atEnd) at = sections.length - 1;
    links.forEach((link, index) => {
      if (index !== at) { link.removeAttribute("aria-current"); return; }
      if (link.getAttribute("aria-current")) return;
      link.setAttribute("aria-current", "true");
      const nav = $("#me-nav");
      if (nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: link.offsetLeft - 16, behavior: window.SidequestLook?.calm ? "auto" : "smooth" });
    });
  };
  addEventListener("scroll", mark, { passive: true });
  addEventListener("resize", mark);
  mark();
}

/** The soft light that follows the cursor over badges and tiles. */
document.addEventListener("pointermove", (event) => {
  const card = event.target instanceof Element && event.target.closest(".me-badges li, .me-tiles > div");
  if (!card) return;
  const box = card.getBoundingClientRect();
  card.style.setProperty("--mx", `${event.clientX - box.left}px`);
  card.style.setProperty("--my", `${event.clientY - box.top}px`);
}, { passive: true });

// ---- Rendering ----------------------------------------------------------------------------

function reload() {
  you = readYou();
  progress = readProgress();
  saved = readSaved();
  account = readProfile();
  renderHero();
  renderOverview();
  renderFreeTime();
  renderLog();
  renderSaved();
  renderBadges();
  renderAccount();
  renderData();
  // Headings rise as they are scrolled to, so a page that got shorter must be measured again.
  requestAnimationFrame(() => window.ScrollTrigger?.refresh());
}

/** The controls keep their own state, so they are only rebuilt when it changed elsewhere. */
function rebuildControls() {
  gapGrid.set(you.gaps);
  buildPlanner();
  buildLook();
}

/** Write down badges earned by now, such as by older quests or a lower goal. */
function keep() {
  const before = readProgress(), after = keepBadges(before, readYou().goal);
  if (after !== before) saveProgress(after);
}

keep();
reload();
buildPlanner();
buildLook();
watchSections();
window.addEventListener("sidequest:changed", reload);
window.addEventListener("storage", () => { reload(); rebuildControls(); window.SidequestLook?.apply(you.look); });
window.addEventListener("pageshow", (event) => { if (event.persisted) { reload(); rebuildControls(); } });
// Gaps come and go while the page is open.
setInterval(() => { renderNextGap(); renderHero(); }, 60000);
