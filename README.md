# Agentified Sidequest

**Turn a gap between classes into a small campus adventure.**

Campus Sidequest reads public activity lists from Makers Studio and Campus Games, then
builds up to three short plans in the visitor's browser. The visitor approves each read;
their mood, time and budget stay on their device. The listings are demo examples, not
scheduled events. There are no accounts, bookings or payments.

## Run locally

Requires Node.js 22 or newer. From the repository root:

```shell
npm run build
npm run serve
```

Open <http://127.0.0.1:8080/>. The two activity sites run on separate origins at
`http://localhost:8081/` and `http://[::1]:8083/`. Quick chat works without an AI key.
The optional AI agent runs in the browser with the visitor's own provider key.

## Project layout

- `sidequest/` — hub page, planner, browser agent and network.
- `publishers/maker-studio/` and `publishers/campus-games/` — independent activity sites.
- `skills/agentify-website/` — the browser runtime and network builder used by the sites.
- `scripts/` — build, local serve and three-origin retargeting commands.
- `tests/` — planner tests and a headless Chrome end-to-end check.
- `docs/SIDEQUEST_PLAN.md` — user flow, architecture, privacy boundary and remaining work.

## Checks

```shell
npm test
npm run e2e
```

The end-to-end check needs Chrome or Chromium. It starts all three local sites and uses a
scripted router; it does not call a real model.

## Hosting

The hub and each activity publisher must use three distinct HTTPS origins for the
cross-site agent calls. Run:

```shell
node scripts/retarget-sidequest.mjs --sidequest <hub-url> --maker <makers-url> --games <games-url>
```

Then deploy `sidequest/`,
`publishers/maker-studio/` and `publishers/campus-games/` separately to static hosts that
serve the included `_headers` rules. Listings are fixed demo data, and the sites are not
hosted by this repository.
