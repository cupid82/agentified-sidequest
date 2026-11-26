// The controls the first-time setup (welcome.js) and the profile page (profile-page.js) share:
// the face builder, interests, the weekly free-time grid, the look, and small helpers. Each one
// fills an element and calls back with the new value; saving is the page's job.
import { INTERESTS, MOODS } from "./planner.js";
import { ACCENTS, DAYS, EYES, HATS, HOURS, MOUTHS, cleanGaps, freeHours, miniFace, randomFace } from "./you.js";

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className, text, onClick) {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

/** The small round picture: a Google photo, the visitor's face, an initial, or a smile. */
export function avatar(you, account) {
  const own = you.setup === "done" || you.picture === "face";
  const face = el("span", "avatar", own ? miniFace(you.face) : account ? account.name.trim().charAt(0).toUpperCase() : ":)");
  face.setAttribute("aria-hidden", "true");
  if (account?.picture && you.picture === "google") {
    const image = el("img");
    image.src = account.picture;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove());
    face.append(image);
  }
  return face;
}

let groups = 0;

/**
 * One choice out of a few, as radio buttons.
 *
 * :param root: The element to fill.
 * :param options: [{value, label, desc?, icon?}].
 * :param settings: {legend, value, kind, onChange}. kind is "cards", "segmented" or "chips".
 * :return: {set(value)} to change it without calling back.
 */
export function radios(root, options, { legend, value, kind, onChange }) {
  const name = `yc-${++groups}`, fieldset = el("fieldset", "yc-group");
  const title = el("legend", "", legend);
  const row = el("div", { cards: "choice-row", segmented: "yc-seg", chips: "yc-chips" }[kind]);
  const inputs = options.map((option) => {
    const label = el("label", kind === "cards" ? "choice-card" : "");
    const input = el("input");
    Object.assign(input, { type: "radio", name, value: String(option.value), checked: option.value === value });
    label.append(input);
    if (kind === "cards") {
      const icon = el("span", "choice-emoji", option.icon);
      icon.setAttribute("aria-hidden", "true");
      label.append(icon, el("span", "choice-title", option.label), el("span", "choice-desc", option.desc));
    } else {
      const text = el("span", option.icon ? "yc-icon" : "", option.icon || option.label);
      if (option.icon) { text.setAttribute("aria-hidden", "true"); label.append(text, el("span", "visually-hidden", option.label)); label.title = option.label; } else label.append(text);
    }
    input.addEventListener("change", () => { place(); onChange(option.value); });
    row.append(label);
    return input;
  });
  const place = () => row.style.setProperty("--at", String(Math.max(0, inputs.findIndex((input) => input.checked))));
  row.style.setProperty("--n", String(options.length));
  place();
  fieldset.append(title, row);
  root.append(fieldset);
  return {
    set(next) {
      inputs.forEach((input, index) => { input.checked = options[index].value === next; });
      place();
    },
  };
}

/** The face builder: eyes, mouth, hat and a shuffle. */
export function faceControls(root, face, onChange) {
  let value = { ...face };
  const change = (patch, kind) => { value = { ...value, ...patch }; onChange({ ...value }, kind); };
  const parts = [
    ["eyes", "Eyes", EYES.map(({ id, label, mini }) => ({ value: id, label, icon: mini.join(" ") }))],
    ["mouth", "Mouth", MOUTHS.map(({ id, label, mini }) => ({ value: id, label, icon: mini }))],
    ["hat", "Hat", HATS.map(({ id, label }) => ({ value: id, label }))],
  ];
  const rows = Object.fromEntries(parts.map(([key, legend, options]) => [key, radios(root, options, { legend, value: value[key], kind: "chips", onChange: (next) => change({ [key]: next }, key) })]));
  const set = (next) => { value = { ...next }; for (const key of Object.keys(rows)) rows[key].set(value[key]); };
  root.append(button("yc-shuffle", "Shuffle", () => {
    let next = randomFace();
    while (JSON.stringify(next) === JSON.stringify(value)) next = randomFace();
    set(next);
    onChange({ ...value }, "shuffle");
  }));
  return { set };
}

/** Interests as toggles, grouped by vibe. */
export function interestControls(root, interests, onChange) {
  let value = [...interests];
  const toggles = [];
  for (const mood of ["make", "meet", "move"]) {
    const group = el("div", "yc-interests");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", MOODS[mood].label);
    group.append(el("span", "yc-interest-label", MOODS[mood].label));
    const row = el("div", "yc-chips");
    for (const interest of INTERESTS.filter((entry) => entry.mood === mood)) {
      const toggle = button("", interest.label, () => {
        value = value.includes(interest.id) ? value.filter((id) => id !== interest.id) : [...value, interest.id];
        toggle.setAttribute("aria-pressed", String(value.includes(interest.id)));
        onChange([...value], interest.id);
      });
      toggle.setAttribute("aria-pressed", String(value.includes(interest.id)));
      toggles.push([interest.id, toggle]);
      row.append(toggle);
    }
    group.append(row);
    root.append(group);
  }
  return { set(next) { value = [...next]; for (const [id, toggle] of toggles) toggle.setAttribute("aria-pressed", String(value.includes(id))); } };
}

const WEEKDAYS = [0, 1, 2, 3, 4];
const PRESETS = [
  { label: "Mornings", hours: [9, 10, 11] },
  { label: "Lunch", hours: [12] },
  { label: "Afternoons", hours: [14, 15, 16] },
  { label: "Evenings", hours: [18, 19] },
];

/**
 * The week as a grid of hours. Click or drag to mark free ones; arrow keys move and Space
 * marks. The presets fill Monday to Friday.
 *
 * :param root: The element to fill.
 * :param gaps: Seven lists of free hours, Monday first.
 * :param onChange: Called with the new gaps.
 */
export function gapControls(root, gaps, onChange) {
  let value = cleanGaps(gaps);
  const hourText = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
  const label = (hour) => hourText.format(new Date(2000, 0, 1, hour));
  const isFree = (day, hour) => value[day].includes(hour);
  const presets = el("div", "yc-presets");
  presets.setAttribute("role", "group");
  presets.setAttribute("aria-label", "Fill Monday to Friday");
  const cells = new Map();

  function paint() {
    for (const [key, cell] of cells) {
      const [day, hour] = key.split(":").map(Number);
      cell.setAttribute("aria-pressed", String(isFree(day, hour)));
    }
    for (const toggle of presets.querySelectorAll("[data-preset]")) {
      const { hours } = PRESETS[Number(toggle.dataset.preset)];
      toggle.setAttribute("aria-pressed", String(WEEKDAYS.every((day) => hours.every((hour) => isFree(day, hour)))));
    }
    clear.disabled = freeHours(value) === 0;
  }
  function mark(changes, free) {
    value = cleanGaps(value.map((hours, day) => {
      const touched = changes.filter((change) => change[0] === day).map((change) => change[1]);
      return free ? [...hours, ...touched] : hours.filter((hour) => !touched.includes(hour));
    }));
    paint();
    onChange(value.map((hours) => [...hours]));
  }

  PRESETS.forEach(({ label: text, hours }, index) => {
    const toggle = button("", text, () => mark(WEEKDAYS.flatMap((day) => hours.map((hour) => [day, hour])), toggle.getAttribute("aria-pressed") !== "true"));
    toggle.dataset.preset = String(index);
    presets.append(toggle);
  });
  const clear = button("yc-clear", "Clear", () => mark(DAYS.flatMap((_, day) => HOURS.map((hour) => [day, hour])), false));
  presets.append(clear);

  const table = el("table", "yc-gaps");
  table.append(el("caption", "visually-hidden", "Hours you are usually free. Arrow keys move between hours, Space marks one."));
  const head = el("tr"), now = new Date(), today = (now.getDay() + 6) % 7;
  head.append(el("td"));
  DAYS.forEach((day, index) => {
    const cell = el("th", index > 4 ? "is-weekend" : "");
    cell.scope = "col";
    const short = el("abbr", "", day.slice(0, 3));
    short.title = day;
    cell.append(short);
    if (index === today) cell.dataset.today = "";
    head.append(cell);
  });
  const thead = el("thead"), tbody = el("tbody");
  thead.append(head);

  let brush = null;
  const focusCell = (day, hour) => {
    const next = cells.get(`${day}:${hour}`);
    if (!next) return;
    for (const cell of cells.values()) cell.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  };
  for (const hour of HOURS) {
    const row = el("tr"), title = el("th", "", label(hour));
    title.scope = "row";
    row.append(title);
    DAYS.forEach((day, index) => {
      const holder = el("td", index > 4 ? "is-weekend" : ""), cell = el("button");
      cell.type = "button";
      cell.tabIndex = cells.size ? -1 : 0;
      cell.setAttribute("aria-label", `${day} ${label(hour)}`);
      if (index === today && hour === now.getHours()) cell.dataset.now = "";
      // A mouse or pen paints while held; touch and the keyboard toggle one hour.
      cell.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch" || event.button !== 0) return;
        brush = { free: !isFree(index, hour) };
        mark([[index, hour]], brush.free);
        cell.dataset.painted = "";
      });
      cell.addEventListener("pointerenter", () => { if (brush && isFree(index, hour) !== brush.free) mark([[index, hour]], brush.free); });
      cell.addEventListener("click", () => {
        if ("painted" in cell.dataset) { delete cell.dataset.painted; return; }
        mark([[index, hour]], !isFree(index, hour));
      });
      cell.addEventListener("focus", () => { for (const other of cells.values()) other.tabIndex = -1; cell.tabIndex = 0; });
      cell.addEventListener("keydown", (event) => {
        const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!step) return;
        event.preventDefault();
        focusCell(index + step[0], hour + step[1]);
      });
      cells.set(`${index}:${hour}`, cell);
      holder.append(cell);
      row.append(holder);
    });
    tbody.append(row);
  }
  const drop = () => {
    if (!brush) return;
    brush = null;
    // The click that follows a press comes after pointerup; forget presses that had none.
    setTimeout(() => { for (const cell of cells.values()) delete cell.dataset.painted; });
  };
  window.addEventListener("pointerup", drop);
  window.addEventListener("pointercancel", drop);
  table.append(thead, tbody);
  root.append(presets, table);
  paint();
  return { set(next) { value = cleanGaps(next); paint(); } };
}

/** The look: accent, motion, cursor and click hearts. */
export function lookControls(root, look, onChange) {
  let value = { ...look };
  const change = (patch) => { value = { ...value, ...patch }; onChange({ ...value }, Object.keys(patch)[0]); };
  const accents = el("fieldset", "yc-group");
  accents.append(el("legend", "", "Accent"));
  const row = el("div", "yc-accents"), name = `yc-${++groups}`;
  for (const { id, label } of ACCENTS) {
    const card = el("label"), input = el("input"), strip = el("span", "yc-strip", "#%@*+=:. .:=+*@%#");
    card.dataset.accentChip = id;
    strip.setAttribute("aria-hidden", "true");
    Object.assign(input, { type: "radio", name, value: id, checked: id === value.accent });
    input.addEventListener("change", () => change({ accent: id }));
    card.append(input, strip, el("span", "yc-accent-name", label));
    row.append(card);
  }
  accents.append(row);
  root.append(accents);
  radios(root, [{ value: "full", label: "Full motion" }, { value: "calm", label: "Calm" }], { legend: "Motion", value: value.motion, kind: "segmented", onChange: (motion) => change({ motion }) });
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) root.append(el("p", "yc-note", "Your system asks for less motion, so Sidequest stays calm either way."));
  const extras = el("div", "yc-switches");
  for (const [key, text, note] of [["cursor", "Square cursor", "With its trail of characters"], ["hearts", "Click hearts", "A burst when you click around"]]) {
    const holder = el("label", "yc-switch"), input = el("input"), copy = el("span");
    Object.assign(input, { type: "checkbox", checked: value[key] });
    input.setAttribute("role", "switch");
    input.addEventListener("change", () => change({ [key]: input.checked }));
    copy.append(el("b", "", text), el("small", "", note));
    holder.append(copy, input);
    extras.append(holder);
  }
  root.append(extras);
}

// ---- A short message at the bottom of the page --------------------------------------------

let toastNode = null, toastTimer = null;

/**
 * Show a short message, with one optional action.
 *
 * :param message: The text.
 * :param action: {label, run}, or nothing.
 */
export function toast(message, action) {
  if (!toastNode) {
    toastNode = el("div", "toast");
    toastNode.setAttribute("role", "status");
    document.body.append(toastNode);
  }
  clearTimeout(toastTimer);
  toastNode.replaceChildren(el("span", "", message));
  if (action) toastNode.append(button("", action.label, () => { toastNode.classList.remove("is-on"); action.run(); }));
  toastNode.classList.add("is-on");
  toastTimer = setTimeout(() => toastNode.classList.remove("is-on"), action ? 6500 : 2200);
}

/** A row of 16 blocks, filled by a share from 0 to 1, as the profile chip draws it. */
export function blockBar(share) {
  const bar = el("div", "profile-bar"), filled = Math.round(Math.min(1, Math.max(0, share)) * 16);
  bar.setAttribute("aria-hidden", "true");
  bar.append(el("b", "", "█".repeat(filled)), el("i", "", "░".repeat(16 - filled)));
  return bar;
}
