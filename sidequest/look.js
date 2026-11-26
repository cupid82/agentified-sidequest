// Applies the visitor's saved look (accent, motion, cursor, click hearts) before the first
// paint, so the page never flashes the default one. A plain script in <head>: it reads one
// localStorage item, sets attributes on <html> that styles.css uses, and leaves
// window.SidequestLook for the effects. The profile page and the setup call apply() again
// when a choice changes.
(() => {
  const root = document.documentElement;
  const ACCENTS = ["sunset", "lagoon", "phosphor", "ultraviolet", "ember", "mono"];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const Look = {
    name: "",
    cursor: true,
    hearts: true,
    motion: "full",
    /** True when things should hold still: the visitor's choice here, or their system's. */
    get calm() { return Look.motion === "calm" || reduced.matches; },
    apply(look) {
      const value = look && typeof look === "object" ? look : {};
      Look.motion = value.motion === "calm" ? "calm" : "full";
      Look.cursor = value.cursor !== false;
      Look.hearts = value.hearts !== false;
      root.dataset.accent = ACCENTS.includes(value.accent) ? value.accent : "sunset";
      root.dataset.motion = Look.motion;
      root.dataset.cursor = Look.cursor ? "on" : "off";
      window.dispatchEvent(new CustomEvent("sidequest:look"));
    },
  };
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("campus-sidequest-you-v1") || "null"); } catch {}
  if (typeof saved?.name === "string" && saved.setup === "done") Look.name = saved.name.slice(0, 24);
  window.SidequestLook = Look;
  Look.apply(saved?.look);
})();
