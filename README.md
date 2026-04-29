volleyball-schedule
===================

Small Node.js scraper that fetches a Calgary Sports Club schedule page and emits an iCalendar (`.ics`) file into `generated/` for Google Calendar import (or runs read-only and logs events).

Quick start
-----------

Install dependencies:

```bash
npm install
```

Run the scraper (all arguments are **named**; use `node index.js --help` for a full list):

```bash
# Required: --url and --team. Read-only (no .ics file):
node index.js --url "https://www.calgarysportsclub.com/schedules/winter-2026-monday-indoor-volleyball-intermediate-e" --team 135775

# Write ./generated/brazil-nuts-thursday.ics:
node index.js \
  --url "https://www.calgarysportsclub.com/schedules/winter-2026-monday-indoor-volleyball-intermediate-e" \
  --team 135775 \
  --output brazil-nuts-thursday.ics

# Optional display name for every game (bye weeks unchanged; original title is in the description):
node index.js --url "https://…" --team 135775 --output brazil-nuts.ics --name "Caramelo Republic"
# Short: -u -t -o -n   |   If --name is omitted, env VOLLEYBALL_EVENT_NAME is used when set.
```

`schedules.json` entries can include an optional `eventName` so `node scripts/run-schedules.js` passes `--name` for that row.

Outputs
-------

- `generated/<ICS_FILENAME>` — generated iCalendar when an ICS filename is provided (otherwise no file is written)

GitHub Actions
--------------

A workflow is provided at `.github/workflows/scrape.yml` which can be triggered manually via the Actions tab. It accepts these inputs:

- `url` (required) — the schedule page URL
- `team_id` (required) — team id to filter
- `ics_name` (optional) — filename to write into `./generated/` (if omitted the job will run read-only)
- `event_name` (optional) — display title for every **game** event (bye weeks unchanged); passed as `--name` to `index.js`

The workflow no longer uploads generated ICS files as build artifacts. Instead, when an ICS filename is provided the job will write `generated/<ICS_FILENAME>` and commit & push that file back to the repository.

Since this repository can be made public, you can use the raw GitHub file URL directly in Google Calendar to subscribe to or import the calendar. Example raw URL format:

```
https://raw.githubusercontent.com/<owner>/<repo>/<branch>/generated/<filename>.ics
```

For example (replace values accordingly):

```
https://raw.githubusercontent.com/tusgavomelo/volleyball-schedule/main/generated/brazil-nuts-thursday.ics
```

Notes about Google Calendar and Content-Type:

- Google Calendar can import or subscribe to raw GitHub URLs and generally handles `.ics` files served with common content types. However, some hosts set specific Content-Type headers for calendar files (`text/calendar`). If you need strict Content-Type control (for example, certain calendar clients), consider publishing `generated/` via GitHub Pages or a static host (Netlify, S3) where you can set `text/calendar` for `.ics` files. Raw GitHub URLs typically work fine for Google Calendar subscriptions.

The scheduled workflow is configured to commit and push any changes to files under `generated/*.ics` back to the repository. The workflow uses the default GITHUB_TOKEN with write permissions to make these commits.

Notes
-----

-- The parser uses `jsdom` and heuristics tailored to the Calgary Sports Club schedule markup. If parsing yields no events, run the scraper in read-only mode and inspect console output; you can also run the scraper locally and save the HTML for debugging.
- If the site becomes client-rendered, consider adding Puppeteer as a fallback to render JS before scraping.

License
-------

MIT
