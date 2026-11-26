// The profile chip at the top left of every page, and the small card it opens: who you are,
// your level, this week, and the ways into the full profile (profile.html) and the first-time
// setup (welcome.html). Signing in with Google (google-auth.js) is optional.
import { readProfile, signIn, signOut } from "./google-auth.js";
import { levelOf, nameOf, readProgress, readSaved, readYou, statsOf } from "./you.js";
import { avatar, blockBar, button, el } from "./you-controls.js";

const root = document.querySelector("#profile");
const chip = document.querySelector("#profile-chip");
const card = document.querySelector("#profile-card");
const here = location.pathname.split("/").pop();

function link(className, text, href) {
  const node = el("a", className, text);
  node.href = href;
  if (here === href) node.setAttribute("aria-current", "page");
  return node;
}

function render() {
  const you = readYou(), account = readProfile(), progress = readProgress();
  const name = nameOf(you, account), isSetUp = you.setup === "done";
  chip.replaceChildren(avatar(you, account), el("span", "profile-name", name ? name.split(" ")[0] : "Profile"));
  chip.setAttribute("aria-label", name ? `Your profile, ${name}` : "Your profile");
  chip.classList.toggle("is-new", you.setup === "new" || you.setup === "later");

  const head = el("div", "profile-head"), who = el("div");
  who.append(el("strong", "", you.name || account?.name || "Guest"), el("small", "", account?.email || "Saved in this browser only"));
  head.append(avatar(you, account), who);

  const { completed } = progress, level = levelOf(completed), week = statsOf(progress, you.goal).thisWeek, saved = readSaved().length;
  const stats = el("div", "profile-level");
  stats.append(el("span", "", level.name), el("span", "", level.next ? `${completed}/${level.next.at} quests` : `${completed} quests`));
  const facts = el("dl", "profile-facts");
  for (const [label, value] of [["This week", `${week} of ${you.goal}`], ["Saved", String(saved)], ["Badges", String(progress.badges.length)]]) {
    const row = el("div");
    row.append(el("dt", "", label), el("dd", "", value));
    facts.append(row);
  }

  // Not a <nav>: the top bar styles those as its own menu.
  const links = el("div", "profile-links");
  if (isSetUp) {
    links.append(link("", "View profile", "profile.html"), link("", "Customize your experience", "welcome.html"));
  } else {
    links.append(link("btn btn-primary profile-start", "Customize your experience", "welcome.html"), link("", "View profile", "profile.html"));
  }
  const action = button("profile-action", account ? "Sign out" : "Continue with Google", () => {
    if (account) { signOut(); chip.focus(); } else { action.disabled = true; signIn(here); }
  });
  card.replaceChildren(head, stats, blockBar(level.share), facts, links, action);
  if (!account) card.append(el("p", "profile-note", "Optional. Only your name, email and picture are kept, in this browser."));
}

function toggle(open) {
  if (open) render();
  card.hidden = !open;
  chip.setAttribute("aria-expanded", String(open));
  if (open && !window.SidequestLook?.calm) {
    window.gsap?.fromTo(card, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.35, ease: "expo.out", clearProps: "all" });
  }
}

chip.addEventListener("click", () => toggle(card.hidden));
// A re-rendered button is no longer in the page, so use the event's own path.
document.addEventListener("click", (event) => { if (!card.hidden && !event.composedPath().includes(root)) toggle(false); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !card.hidden) { toggle(false); chip.focus(); } });
// Keep up with changes on this page, in other tabs, and while this page sat in the back cache.
window.addEventListener("sidequest:changed", render);
window.addEventListener("storage", render);
window.addEventListener("pageshow", (event) => { if (event.persisted) render(); });
render();
