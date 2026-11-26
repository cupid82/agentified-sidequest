// End-to-end check of Campus Sidequest in headless Chrome, against the three real sites on
// three origins and, for the AI agent, a scripted router (tests/e2e/scripted-router.mjs)
// with a fake key. No real model and no real key.
//
//   node tests/e2e/run-sidequest-e2e.mjs [--chrome <path>] [--screenshots <folder>]
//
// Ports 8080, 8081 and 8083 must be free: stop serve-all.mjs first.
//
//   S1  First load: neither group is contacted, the runtime is not loaded, and the hub's
//       public agent files are readable by other origins (CORS).
//   S2  Quick chat: an off-topic message gets a reply, opens no dialog, contacts no one.
//   S3  Quick chat sets the planner from a message; the dialog names both origins and
//       "Nothing personal"; Not now contacts no one.
//   S4  Allow: both groups' public files are read with GET only, no Authorization header
//       and no cookie; every plan shown fits the time and budget.
//   S5  "Don't ask again in this tab" skips the dialog; "Ask me each time" brings it back.
//   S6  A quest can be started and finished; the badge is saved.
//   S7  AI agent: the runtime boots only on request; with the visitor's router and key,
//       the hub's agent sets the planner, the page asks before reading, and the agent
//       reports the plan from the page's result.
//   S8  AI agent, site composition: asking what Makers Studio offers shows the runtime's
//       consent card first; after Allow, Makers Studio's own network loads from its origin
//       and runs here, its agent reads its list through its bridge, and the request it got
//       held none of the visitor's choices.
//   S9  Every model request went to the visitor's router with the key and model; the
//       partner agent was offered only its own site's tools.
//   S10 No CSP violations and no page errors along the whole path.
//   S11 First visit: an invitation to customize shows, takes no focus and stores nothing;
//       Not now keeps it away. (Runs right after S1.)
//   S12 Setup: six steps save as they are answered and contact no one; the planner then opens
//       with the answers and its suggestions start with the interests.
//   S13 Profile: the quest from S6 and a saved plan are there, changes are kept, a saved plan
//       starts on the hub without reading anything, and the page cannot send a request.
//   S14 Erase: everything is gone, the AI key too, after the page asks.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ChromeLauncher } from "../linking/chrome/chrome_launcher.mjs";
import { CdpClient } from "../linking/chrome/cdp_client.mjs";
import { startAll } from "../../scripts/serve-all.mjs";
import { ScriptedRouter } from "./scripted-router.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const HUB = "http://127.0.0.1:8080/";
const KEY = "sk-test-not-a-real-key";
const ROUTER_PORT = 8794;
const CHROME_PORT = 9786;
const MODEL = "gpt-4.1-mini";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const results = [];
function check(id, ok, detail) {
  results.push({ id, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${detail}`);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readLog = (file) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);

async function waitFor(client, session, expression, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await client.evaluate(session, expression);
      if (last) {
        return last;
      }
    } catch (error) {
      last = error.message;
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}

async function portsFree() {
  for (const url of ["http://127.0.0.1:8080/", "http://127.0.0.1:8081/", "http://[::1]:8083/"]) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(800) });
      return url;
    } catch {}
  }
  return null;
}

async function main() {
  const busy = await portsFree();
  if (busy) {
    console.error(`${busy} is already serving. Stop serve-all.mjs (or whatever uses ports 8080, 8081 and 8083) first.`);
    process.exit(2);
  }
  const chromePath = ChromeLauncher.locate(option("--chrome"))
    || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => existsSync(p));
  if (!chromePath) {
    console.error("No Chrome found. Pass --chrome <path> or set CHROME.");
    process.exit(2);
  }
  const work = mkdtempSync(path.join(os.tmpdir(), "sidequest-e2e-"));
  const logDir = path.join(work, "logs");
  const shots = path.resolve(option("--screenshots") || path.join(ROOT, "docs", "screenshots"));
  mkdirSync(shots, { recursive: true });
  const servers = startAll({ logDir, quiet: true });
  const router = new ScriptedRouter(KEY);
  await router.listen(ROUTER_PORT);
  const chrome = new ChromeLauncher(chromePath, CHROME_PORT, path.join(work, "profile"), path.join(work, "chrome.log"));
  let client = null;
  const hubLog = path.join(logDir, "sidequest.jsonl");
  const makerLog = path.join(logDir, "makers.jsonl");
  const gamesLog = path.join(logDir, "games.jsonl");
  const groupRequests = () => readLog(makerLog).length + readLog(gamesLog).length;
  try {
    await sleep(1200);
    await chrome.start();
    client = await CdpClient.connect(CHROME_PORT);
    const target = await client.send("Target.createTarget", { url: "about:blank" });
    const { sessionId: session } = await client.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    await client.send("Page.enable", {}, session);
    await client.send("Runtime.enable", {}, session);
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__csp = []; window.__errors = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); addEventListener("error", (e) => window.__errors.push(String(e.message))); addEventListener("unhandledrejection", (e) => window.__errors.push(String(e.reason?.message || e.reason)));` }, session);
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, session);
    await client.send("Page.navigate", { url: HUB }, session);
    await waitFor(client, session, `!!window.Sidequest && !!document.querySelector("#chat-form")`, "the hub page");
    await sleep(500);

    const chatLines = () => client.evaluate(session, `[...document.querySelectorAll("#chat-messages .chat-message")].map((m) => m.textContent)`);
    const say = async (text) => {
      const before = (await chatLines()).length;
      await client.evaluate(session, `{ const i = document.querySelector("#chat-input"); i.value = ${JSON.stringify(text)}; document.querySelector("#chat-form").requestSubmit(); "sent"; }`);
      await waitFor(client, session, `document.querySelectorAll("#chat-messages .chat-message").length >= ${before + 2}`, `a reply to "${text}"`);
    };
    const dialogOpen = () => client.evaluate(session, `document.querySelector("#contact-dialog").open`);
    const answerDialog = (value) => client.evaluate(session, `document.querySelector('#contact-dialog button[value="${value}"]').click(), "clicked"`);
    const planDone = () => waitFor(client, session, `["success", "error"].includes(document.querySelector("#planner-status").dataset.kind) && document.querySelector("#planner-status").dataset.kind`, "the plan");

    // S1: first load.
    const hubFirst = readLog(hubLog).map((entry) => entry.path);
    const cors = await fetch("http://127.0.0.1:8080/agent-manifest.json", { headers: { Origin: "https://elsewhere.example" } });
    const corsNetwork = await fetch("http://127.0.0.1:8080/campus_sidequest.network.json", { headers: { Origin: "https://elsewhere.example" } });
    check("S1", groupRequests() === 0 && !hubFirst.some((p) => p.startsWith("/runtime/index.js") || p.startsWith("/site.js"))
      && cors.headers.get("access-control-allow-origin") === "*" && corsNetwork.headers.get("access-control-allow-origin") === "*",
      `group requests on load: ${groupRequests()}; runtime loaded on load: ${hubFirst.some((p) => p.startsWith("/runtime/index.js"))}; manifest CORS: ${cors.headers.get("access-control-allow-origin")}; network CORS: ${corsNetwork.headers.get("access-control-allow-origin")}`);

    // S11: the first-time invitation.
    await waitFor(client, session, `!!document.querySelector(".invite.is-on")`, "the first-time invitation");
    const invitation = await client.evaluate(session, `JSON.stringify({ text: document.querySelector(".invite").innerText, focus: document.activeElement === document.body, stored: localStorage.length, dialogs: document.querySelectorAll("dialog[open]").length })`).then(JSON.parse);
    await client.evaluate(session, `[...document.querySelectorAll(".invite button")].find((b) => b.textContent === "Not now").click(), "closed"`);
    await waitFor(client, session, `!document.querySelector(".invite")`, "the invitation to close");
    await client.send("Page.navigate", { url: HUB }, session);
    await waitFor(client, session, `document.readyState === "complete" && !!window.Sidequest`, "the hub page again");
    await sleep(3600);
    const invitedAgain = await client.evaluate(session, `!!document.querySelector(".invite")`);
    check("S11", /customize your experience/i.test(invitation.text) && invitation.focus && invitation.stored === 0 && invitation.dialogs === 0 && !invitedAgain && groupRequests() === 0,
      `took focus: ${!invitation.focus}; items stored by looking: ${invitation.stored}; shown again after "Not now": ${invitedAgain}; group requests: ${groupRequests()}`);

    // S2: off-topic.
    await say("What's the weather like today?");
    const offTopic = (await chatLines()).at(-1);
    check("S2", !(await dialogOpen()) && groupRequests() === 0 && /campus/i.test(offTopic),
      `dialog opened: ${await dialogOpen()}; group requests: ${groupRequests()}; reply: ${offTopic.slice(0, 90)}`);

    // S3: the chat sets the planner; Not now contacts no one.
    await client.evaluate(session, `{ const i = document.querySelector("#chat-input"); i.value = "45 mins, no money, make a zine"; document.querySelector("#chat-form").requestSubmit(); "sent"; }`);
    await waitFor(client, session, `document.querySelector("#contact-dialog").open`, "the consent dialog");
    const choices = await client.evaluate(session, `JSON.stringify(Sidequest.currentChoices())`);
    const dialogText = await client.evaluate(session, `document.querySelector("#contact-dialog").innerText`);
    await sleep(400);
    const duringDialog = groupRequests();
    await answerDialog("cancel");
    await waitFor(client, session, `[...document.querySelectorAll("#chat-messages .chat-message")].some((m) => m.textContent.includes("didn\u2019t contact either group"))`, "the declined reply");
    check("S3", choices === JSON.stringify({ mood: "make", activityRequest: "zine", timeMinutes: 30, budget: 0 })
      && dialogText.includes("http://localhost:8081") && dialogText.includes("http://[::1]:8083") && dialogText.includes("Nothing personal")
      && duringDialog === 0 && groupRequests() === 0,
      `planner: ${choices}; dialog names both origins: ${dialogText.includes("http://localhost:8081") && dialogText.includes("http://[::1]:8083")}; group requests while open: ${duringDialog}, after Not now: ${groupRequests()}`);

    // S4: Allow, from the form, with wider limits.
    await client.evaluate(session, `Sidequest.setChoices({ mood: "make", timeMinutes: 60, budget: 5, activityRequest: "" }), document.querySelector("#build-quest").click(), "clicked"`);
    await waitFor(client, session, `document.querySelector("#contact-dialog").open`, "the consent dialog");
    await answerDialog("allow");
    const outcome = await planDone();
    const plans = await client.evaluate(session, `[...document.querySelectorAll(".plan-card")].map((c) => ({ total: c.querySelector(".plan-total").textContent, time: c.querySelector(".plan-time").textContent, stops: [...c.querySelectorAll(".plan-stops strong")].map((s) => s.textContent) }))`);
    const fits = plans.every((plan) => parseInt(plan.time, 10) <= 60 && (plan.total === "Free" || Number(plan.total.slice(1)) <= 5));
    const allStops = plans.flatMap((plan) => plan.stops);
    const groupLog = [...readLog(makerLog), ...readLog(gamesLog)];
    const unsafe = groupLog.filter((entry) => entry.method !== "GET" || entry.authorization || (entry.cookies && entry.cookies.length));
    const bridges = ["makers", "games"].map((name) => readLog(path.join(logDir, `${name}.jsonl`)).some((entry) => entry.path.endsWith("/bridge/action-bridge.html")));
    check("S4", outcome === "success" && plans.length === 3 && fits && new Set(allStops).size === allStops.length && unsafe.length === 0 && bridges.every(Boolean),
      `plans: ${plans.map((plan) => `${plan.total}/${plan.time}: ${plan.stops.join(" + ")}`).join(" | ")}; within 60 min and $5: ${fits}; repeated stops: ${allStops.length - new Set(allStops).size}; both bridges loaded: ${bridges}; group requests that were not a plain GET or carried a key or cookie: ${unsafe.length}`);
    await shot(client, session, path.join(shots, "sidequest-01-plans.png"), "#planner");

    // S5: remember for this tab, then forget.
    await client.evaluate(session, `document.querySelector("#build-quest").click(), "clicked"`);
    await waitFor(client, session, `document.querySelector("#contact-dialog").open`, "the consent dialog");
    await client.evaluate(session, `document.querySelector("#remember-consent").click(), "checked"`);
    await answerDialog("allow");
    await planDone();
    await client.evaluate(session, `document.querySelector("#planner-status").dataset.kind = "", document.querySelector("#build-quest").click(), "clicked"`);
    await sleep(300);
    const askedAgain = await dialogOpen();
    await planDone();
    const forgetShown = await client.evaluate(session, `!document.querySelector("#forget-consent").hidden`);
    await client.evaluate(session, `document.querySelector("#forget-consent").click(), "clicked"`);
    await client.evaluate(session, `document.querySelector("#build-quest").click(), "clicked"`);
    await sleep(300);
    const askedAfterForget = await dialogOpen();
    if (askedAfterForget) await answerDialog("cancel");
    await sleep(200);
    check("S5", !askedAgain && forgetShown && askedAfterForget, `asked again after "don't ask": ${askedAgain}; "Ask me each time" shown: ${forgetShown}; asked after it: ${askedAfterForget}`);

    // S6: start and finish a quest. (The cancelled build above cleared the plans, so build once more.)
    await client.evaluate(session, `document.querySelector("#build-quest").click(), "clicked"`);
    await waitFor(client, session, `document.querySelector("#contact-dialog").open`, "the consent dialog");
    await answerDialog("allow");
    await planDone();
    await client.evaluate(session, `document.querySelector(".choose-quest-button").click(), "clicked"`);
    await waitFor(client, session, `!!document.querySelector(".active-quest")`, "the active quest");
    await client.evaluate(session, `document.querySelectorAll(".quest-route-list input[type=checkbox]").forEach((box) => box.click()), "checked"`);
    await client.evaluate(session, `document.querySelector(".finish-quest-button").click(), "finished"`);
    const progress = await client.evaluate(session, `localStorage.getItem("campus-sidequest-progress-v1")`);
    const recap = await client.evaluate(session, `document.querySelector(".quest-recap").textContent`);
    check("S6", JSON.parse(progress || "{}").completed === 1 && recap.includes("First Steps"), `saved progress: ${progress}; recap: ${recap.slice(0, 90)}`);

    // S7: the AI agent, on the visitor's router and key.
    const runtimeBefore = readLog(hubLog).some((entry) => entry.path.startsWith("/runtime/index.js"));
    await client.evaluate(session, `scrollTo(0, 0), document.querySelector("#mode-ai").click(), "clicked"`);
    await waitFor(client, session, `!!document.querySelector("#ns-key") && document.querySelector("#assistant-status").dataset.state`, "the agent's settings");
    const needsKey = await client.evaluate(session, `document.querySelector("#assistant-status").dataset.state`);
    await client.evaluate(session, `{
      const set = (id, value) => { const input = document.querySelector(id); input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); };
      set("#ns-key", ${JSON.stringify(KEY)});
      set("#ns-router", "http://127.0.0.1:${ROUTER_PORT}/v1");
      set("#ns-model", ${JSON.stringify(MODEL)});
      document.querySelector("#ns-apply").click();
      "applied";
    }`);
    await waitFor(client, session, `window.__nsweb?.engine?.byokKey === ${JSON.stringify(KEY)} && !!document.querySelector("#ns-send") && document.querySelector(".side-agent").dataset.mode === "ai"`, "the agent after the setup reload");
    const ready = await waitFor(client, session, `document.querySelector("#assistant-status").dataset.state`, "the agent status");
    const ask = (text) => client.evaluate(session, `{ const input = document.querySelector("#ns-input"); input.value = ${JSON.stringify(text)}; document.querySelector("#ns-send").click(); "sent"; }`);
    const answer = (marker, timeoutMs = 45000) => waitFor(client, session, `[...document.querySelectorAll("#ns-msgs .ns-msg")].map((m) => m.innerText).find((t) => t.includes(${JSON.stringify(marker)}))`, `the ${marker} answer`, timeoutMs);
    await client.evaluate(session, `Sidequest.setChoices({ mood: "meet", timeMinutes: 90, budget: 10, activityRequest: "" }), "reset"`);
    const groupsBeforeAsk = groupRequests();
    await ask("I have 45 minutes and no money. I'd like to make a zine.");
    await waitFor(client, session, `document.querySelector("#contact-dialog").open`, "the page's dialog, asked by the agent");
    const agentChoices = await client.evaluate(session, `JSON.stringify(Sidequest.currentChoices())`);
    await sleep(300);
    const groupsDuringAgentDialog = groupRequests() - groupsBeforeAsk;
    await answerDialog("allow");
    const planned = await answer("SIDEQUEST_PLAN:");
    check("S7", !runtimeBefore && needsKey === "needs-key" && ready === "ready" && agentChoices === JSON.stringify({ mood: "make", activityRequest: "zine", timeMinutes: 30, budget: 0 })
      && groupsDuringAgentDialog === 0 && planned.includes("ok=true") && planned.includes("Fold a tiny zine (Makers Studio)"),
      `runtime loaded before the switch: ${runtimeBefore}; status before/after key: ${needsKey}/${ready}; planner set by the agent: ${agentChoices}; group requests while the page asked: ${groupsDuringAgentDialog}; agent said: ${planned.slice(planned.indexOf("SIDEQUEST_PLAN:"), planned.indexOf("SIDEQUEST_PLAN:") + 140)}`);
    await shot(client, session, path.join(shots, "sidequest-02-ai-agent.png"), ".side-agent");

    // S8: site composition: the hub's agent asks Makers Studio's agent.
    const makerBefore = readLog(makerLog).length;
    await ask("What does Makers Studio offer?");
    const card = await waitFor(client, session, `(() => { const a = document.querySelector(".ns-consent:not(.ns-action-window) .ns-consent-actions"); return a ? a.closest(".ns-consent").innerText : null; })()`, "the runtime's consent card");
    await sleep(400);
    const makerDuringCard = readLog(makerLog).slice(makerBefore).filter((entry) => entry.path.includes("maker_studio.network.json")).length;
    await client.evaluate(session, `document.querySelector('.ns-consent:not(.ns-action-window) .ns-consent-actions [data-d="allow"]').click(), "allowed"`);
    const partnered = await answer("SIDEQUEST_PARTNER:");
    const makerAfter = readLog(makerLog).slice(makerBefore).map((entry) => entry.path);
    const makerAsked = router.chats("maker_front").map((record) => JSON.parse(record.body).messages.filter((m) => m.role === "user").map((m) => m.content).join(" ")).join(" ");
    check("S8", /Makers Studio|localhost:8081/.test(card) && makerDuringCard === 0 && makerAfter.some((p) => p.includes("maker_studio.network.json")) && makerAfter.some((p) => p.endsWith("/bridge/action-bridge.html"))
      && partnered.includes("MAKER_FRONT: 8 activities") && !/zine|45|money/i.test(makerAsked),
      `card names the group: ${/Makers Studio|localhost:8081/.test(card)}; network fetched before Allow: ${makerDuringCard}; fetched after: ${makerAfter.filter((p) => /network\.json|bridge|manifest/.test(p)).join(", ")}; agent said: ${partnered.slice(partnered.indexOf("SIDEQUEST_PARTNER:"), partnered.indexOf("SIDEQUEST_PARTNER:") + 120)}; partner was asked: "${makerAsked.slice(0, 90)}"`);

    // S9: every model request went to the visitor's router, with the key and model.
    const chats = router.chats();
    const badKey = chats.filter((record) => !record.keyOk).length;
    const badModel = chats.filter((record) => record.model !== MODEL).length;
    const hubTools = router.chats("sidequest")[0]?.tools || [];
    const makerTools = router.chats("maker_front")[0]?.tools || [];
    check("S9", chats.length >= 5 && badKey === 0 && badModel === 0 && ["website_set_sidequest_choices", "website_build_sidequest", "website_get_sidequest_status"].every((tool) => hubTools.includes(tool))
      && makerTools.includes("website_get_activities") && !makerTools.some((tool) => tool.includes("sidequest")),
      `model requests: ${chats.length} (${[...new Set(chats.map((record) => record.role))].join(", ")}); without the key: ${badKey}; other model: ${badModel}; hub agent tools: ${hubTools.join(", ")}; Makers Studio agent tools: ${makerTools.join(", ")}`);

    // S10: no CSP violations, no page errors.
    const csp = await client.evaluate(session, `window.__csp`);
    const errors = await client.evaluate(session, `window.__errors`);
    check("S10", csp.length === 0 && errors.length === 0, `CSP violations: ${csp.length ? csp.join(" || ") : "none"}; page errors: ${errors.length ? errors.join(" || ") : "none"}`);

    // S12: the first-time setup, then the hub it tunes.
    const run = (expression) => client.evaluate(session, expression);
    const trouble = async () => [...await run("window.__csp"), ...await run("window.__errors")];
    const go = async (page, ready) => {
      await client.send("Page.navigate", { url: "about:blank" }, session);
      await client.send("Page.navigate", { url: new URL(page, HUB).href }, session);
      await waitFor(client, session, `document.readyState === "complete" && !!document.querySelector(${JSON.stringify(ready)})`, page);
      await sleep(400);
    };
    const groupsBeforeSetup = groupRequests();
    await go("welcome.html#start", "#wl-gaps td button");
    const next = async () => { await run(`document.querySelector("#wl-next").click(), "next"`); await sleep(120); };
    const press = (selector, text) => run(`[...document.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.includes(${JSON.stringify(text)})).click(), "pressed"`);
    await run(`{ const i = document.querySelector("#wl-name"); i.value = "Robin"; i.dispatchEvent(new Event("input", { bubbles: true })); "typed"; }`);
    await press("#wl-face label", "Grad cap");
    await next();
    await press("#wl-mood label", "Get moving");
    await next();
    await press("#wl-interests button", "Walks");
    await press("#wl-interests button", "Photos");
    await next();
    await press("#wl-limits label", "30 min");
    await press("#wl-limits label", "Up to $5");
    await sleep(1500);
    await shot(client, session, path.join(shots, "sidequest-03-setup.png"), "#main");
    await next();
    await press("#wl-gaps .yc-presets button", "Lunch");
    await next();
    await press("#wl-look label", "Lagoon");
    await next();
    await waitFor(client, session, `document.querySelector("#wl-title-7").innerText.includes("Robin")`, "the end of the setup");
    const stored = JSON.parse(await run(`localStorage.getItem("campus-sidequest-you-v1")`));
    const setupTrouble = await trouble();
    await go("./", "#planner-hello p");
    const tuned = JSON.parse(await run(`JSON.stringify({ choices: Sidequest.currentChoices(), suggestions: [...document.querySelectorAll("[data-suggest]")].slice(0, 2).map((n) => n.dataset.suggest), hello: document.querySelector("#planner-hello").innerText, accent: document.documentElement.dataset.accent, invited: !!document.querySelector(".invite") })`));
    // During the lunch hour on a weekday the planner opens with the gap's own time.
    const times = [30, 60];
    check("S12", stored.setup === "done" && stored.face.hat === "grad" && stored.gaps.slice(0, 5).every((hours) => hours.join() === "12") && tuned.choices.mood === "move" && times.includes(tuned.choices.timeMinutes) && tuned.choices.budget === 5
      && tuned.suggestions.join() === "walk,photo" && tuned.hello.includes("Hey Robin.") && tuned.accent === "lagoon" && !tuned.invited && setupTrouble.length === 0 && groupRequests() === groupsBeforeSetup,
      `planner: ${JSON.stringify(tuned.choices)}; suggestions: ${tuned.suggestions.join(", ")}; says: ${tuned.hello.replace(/\s+/g, " ").slice(0, 80)}; group requests during setup: ${groupRequests() - groupsBeforeSetup}; CSP violations or errors: ${setupTrouble.join(" || ") || "none"}`);

    // S13: the profile page.
    await run(`document.querySelector("#build-quest").click(), "clicked"`);
    await waitFor(client, session, `document.querySelector("#contact-dialog").open`, "the consent dialog");
    await answerDialog("allow");
    await planDone();
    const firstPlan = await run(`[...document.querySelector(".plan-card").querySelectorAll(".plan-stops strong")].map((s) => s.textContent).join(" → ")`);
    const picked = await run(`document.querySelector(".plan-match")?.textContent || ""`);
    await run(`document.querySelector(".save-quest-button").click(), "saved"`);
    await go("profile.html", ".quest-row");
    await run(`document.querySelector(".quest-feels button").click(); { const n = document.querySelector(".quest-note"); n.value = "Would do again"; n.dispatchEvent(new Event("change")); } document.querySelector("#me-edit").click(); document.querySelector("#me-form-tagline").value = "<b>Walks first</b>"; document.querySelector("#me-form").requestSubmit(); "edited"`);
    await sleep(1800);
    const profile = JSON.parse(await run(`JSON.stringify({ name: document.querySelector("#me-name").innerText.replace(/\\s+/g, ""), level: document.querySelector("#me-level").textContent, log: document.querySelector("#panel-log h3").textContent, saved: document.querySelector("#panel-saved h3").textContent, badges: [...document.querySelectorAll(".me-badges .is-earned strong")].map((n) => n.textContent), tagline: document.querySelector("#me-tagline").textContent, markup: document.querySelector("#me-tagline").children.length })`));
    const entry = JSON.parse(await run(`localStorage.getItem("campus-sidequest-progress-v1")`)).log[0];
    const profileTrouble = await trouble();
    await run(`document.querySelector("#me-edit").click(); document.querySelector("#me-form-tagline").value = "Walks first, coffee second."; document.querySelector("#me-form").requestSubmit(); "edited"`);
    // Headings rise as they are scrolled to, and the "saved" message fades: let both finish.
    for (let y = 0; y < 5200; y += 400) { await run(`scrollTo({ top: ${y}, behavior: "instant" }), 1`); await sleep(90); }
    await run(`scrollTo({ top: 0, behavior: "instant" }), 1`);
    await sleep(2200);
    await shot(client, session, path.join(shots, "sidequest-04-profile.png"), "#main");
    const sent = await run(`await fetch("agent-manifest.json").then(() => "sent", () => "blocked")`);
    const groupsBeforeStart = groupRequests();
    await run(`document.querySelector("#tab-saved").click(); document.querySelector("#panel-saved .btn").click(); "started"`);
    await waitFor(client, session, `location.pathname === "/" && !!document.querySelector(".active-quest")`, "the saved plan on the hub");
    check("S13", profile.name === "Robin" && profile.level.includes("First Steps") && profile.log.includes("→") && profile.saved === firstPlan && profile.badges.includes("First Steps") && profile.tagline === "<b>Walks first</b>" && profile.markup === 0
      && entry.feel === "love" && entry.note === "Would do again" && profileTrouble.length === 0 && sent === "blocked" && groupRequests() === groupsBeforeStart,
      `${profile.name}, ${profile.level}; finished: ${profile.log}; saved: ${profile.saved}; ${picked || "no match line"}; badges: ${profile.badges.join(", ")}; feeling and note kept: ${entry.feel}, ${entry.note}; a request from the page: ${sent}; group requests to start a saved plan: ${groupRequests() - groupsBeforeStart}; CSP violations or errors: ${profileTrouble.join(" || ") || "none"}`);

    // S14: erase everything. The key from S7 is still saved.
    await go("profile.html#privacy", "#data-erase");
    const keyBefore = await run(`(JSON.stringify(localStorage) + document.cookie).includes(${JSON.stringify(KEY)})`);
    await run(`document.querySelector("#data-erase").click(), "asked"`);
    const asked = await run(`document.querySelector("#ask").open && document.querySelector("#ask").innerText`);
    await run(`document.querySelector("#ask-yes").click(), "erased"`);
    await sleep(500);
    const left = await run(`JSON.stringify({ ours: Object.keys(localStorage).filter((k) => k.startsWith("campus-sidequest")), key: (JSON.stringify(localStorage) + JSON.stringify(sessionStorage) + decodeURIComponent(document.cookie)).includes(${JSON.stringify(KEY)}), accent: document.documentElement.dataset.accent })`).then(JSON.parse);
    check("S14", keyBefore && /AI provider key/.test(asked) && left.ours.length === 0 && !left.key && left.accent === "sunset",
      `asked first: ${Boolean(asked)}; items left: ${left.ours.join(", ") || "none"}; AI key before and after: ${keyBefore}, ${left.key}`);
  } catch (error) {
    check("RUN", false, error.stack || String(error));
  } finally {
    client?.close();
    await chrome.stop().catch(() => {});
    await router.close();
    for (const child of servers) {
      child.kill();
    }
    await sleep(300);
    const failed = results.filter((item) => !item.ok);
    writeFileSync(path.join(shots, "sidequest-e2e-report.json"), JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
    rmSync(path.join(work, "profile"), { recursive: true, force: true });
    console.log(`\n${results.length - failed.length}/${results.length} passed.`);
    process.exit(failed.length ? 1 : 0);
  }
}

async function shot(client, session, file, selector) {
  const box = await client.evaluate(session, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.max(0, r.left + scrollX - 8), y: Math.max(0, r.top + scrollY - 8), width: r.width + 16, height: Math.min(r.height + 16, 3000) }; })()`);
  const image = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...box, scale: 1 } }, session);
  writeFileSync(file, Buffer.from(image.data, "base64"));
}

main();
