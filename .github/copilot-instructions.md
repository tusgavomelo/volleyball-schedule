## Quick instructions for AI contributors

- Purpose: download a Calgary Sports Club schedule page and emit an iCalendar (`.ics`) into `data/` for Google Calendar import.

- Entry point: `index.js` — single-file CLI. Default URL is embedded in the file (Thursday Fall 2025 schedule). Run:

  node index.js
  node index.js <URL>

- Outputs: `data/raw.html` (saved HTML) and `data/generated.ics` (iCalendar). Treat `data/` as generated artifacts — do not delete existing sample `.ics` files.

- Parsing approach used in this repo (what to preserve or change):
  - Uses `jsdom` to parse server-rendered HTML. If `jsdom` can't locate schedule rows, prefer adding a Puppeteer fallback.
  - Heuristic selectors in `index.js`: look for `<table>` → `tbody tr`, fallback to `.schedule tr, .list tr`.
  - Column mapping heuristic: [date, time, summary, location?]. If parsed date lacks a year the script appends `2025`. Default duration = 90 minutes.

- ICS specifics: timestamps are written in UTC (`DTSTART...Z`), UIDs use `${Date.now()}-<index>@volleyball-schedule`, DESCRIPTION contains the raw row text and the source URL.

- When editing `index.js`:
  - Run the script and open `data/raw.html` to discover the page structure and choose selectors.
  - Keep parsing idempotent and save raw HTML for debugging.
  - If the schedule is client-rendered (no useful rows in `raw.html`) add Puppeteer and document why in your PR.

- Developer workflow notes:
  - Add runtime deps to `package.json` and explain them in your PR (e.g. `jsdom`, `puppeteer`).
  - Small selector or text-cleanup fixes: commit to a feature branch. Bigger changes (new runtime, CI, hosting ICS) warrant a PR with rationale.

- Quick troubleshooting:
  - No events parsed? Inspect `data/raw.html`, find the table or event rows, and update the selector in `index.js`.
  - Date parsing gives NaN? Adjust date+time concatenation or add a `--year` flag for ambiguous dates.

If anything is unclear, run the scraper, paste the relevant `data/raw.html` fragment, and I will propose exact selector updates.
## What this project is

Small Node.js scraper that fetches a public Calgary Sports Club schedule page and generates iCalendar (.ics) files into the `data/` folder for importing into Google Calendar.

Entry point
- `index.js` — single-file, early-stage scraper. Run with `node index.js` (optionally pass a URL as first arg).

Key files and folders
- `index.js` — fetch + parse + .ics generation logic.
- `package.json` — project metadata (no deps by default).
- `data/` — output location for `*.ics` and saved raw HTML (`raw.html`, `generated.ics`, etc.).

Big picture & design hints for an AI editing this repo
- Goal: reliably extract event rows (date/time/location/summary) from the Calgary Sports Club schedule pages and emit valid iCalendar files.
- Keep scraping logic focused and idempotent: save the raw HTML (`data/raw.html`) for debugging, then parse it.
- Prefer non-headless solutions first (HTTP fetch + HTML parsing). If the page is rendered client-side (JS), opt to add a headless browser step (Puppeteer) and document it in the PR.

Patterns and conventions discovered here
- Single script CLI: accept a URL via command-line; default is the schedule URL for Thursday Fall 2025.
- Output files go into `data/` and are safe to overwrite — treat `data/` as generated artifacts.
- Minimal dependencies: the repo currently doesn't list external packages. If you add a dependency (cheerio, puppeteer, axios), update `package.json` and mention it in the PR description.

How the scraper should behave (concrete examples)
- Example run: `node index.js` will fetch
  `https://www.calgarysportsclub.com/schedules/fall-2025-thursday-indoor-volleyball-recreational-plus-a?team=132313&view=schedule`
- Save the HTTP response to `data/raw.html` for inspection.
- Parse table rows (`<tr>`) or event containers; map columns to fields: date, time, location, and optional notes. Create an event per row and write `data/generated.ics` containing all events.

Parsing tips specific to this site
- The schedule pages are organized visually as tables/lists. A reliable approach is:
  1. Search for `<table` / `<tbody>` blocks and iterate `<tr>` rows.
  2. Extract `<td>` text (trim whitespace). Typical columns: date, time, teams/summary, court/location.
  3. When time strings are like `7:00 PM`, append the year (2025) and parse with `new Date(`${dateText} ${timeText} 2025`)
  4. Default duration: 1.5 hours (adjustable per league).

ICS generation notes
- Use UTC timestamps in the iCalendar (DTSTART;TZID or convert to UTC and use Z suffix).
- Create unique UIDs (e.g. `${Date.now()}-${index}@volleyball-schedule`).
- Include a DESCRIPTION with the raw row text and a link back to the source page.

Developer workflows / quick commands
- Run the scraper (node must be installed):
  node index.js
  node index.js <URL>

- Inspect outputs: `data/raw.html` and `data/generated.ics`.

When to open a PR vs commit directly
- Small local fixes (typos in README, minor parsing tweaks): commit directly to a feature branch.
- Adding new dependencies, adding Puppeteer, or changing output format: open a PR and document why (rendered JS, auth, etc.).

What not to change
- Do not remove the `data/` folder or existing `.ics` files — they are used as sample output.

Where to look first when editing
- `index.js` — the canonical place for the scraping flow.
- `data/` — sample outputs you can inspect to validate parsing choices.

If something is unclear
- Run the scraper once to produce `data/raw.html` and paste relevant snippets when asking for parsing help.

Feedback
- After you change parsing logic, add a short note to the script describing the selector/regex you relied on so future agents can reason about the transformation.
