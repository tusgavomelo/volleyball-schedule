volleyball-schedule
===================

Small Node.js scraper that fetches a Calgary Sports Club schedule page and emits an iCalendar (`.ics`) file into `generated/` for Google Calendar import (or runs read-only and logs events).

Quick start
-----------

Install dependencies:

```bash
npm install
```

Run the scraper:

```bash
# Required args: URL and TEAM_ID. Optional third arg is the ICS filename.
# Read-only (no ICS written):
node index.js "https://.../view=schedule" 132313

# Write ICS into ./generated/<ICS_FILENAME>:
node index.js "https://.../view=schedule" 132313 brazil-nuts-thursday.ics
```

Examples
--------

Read-only (inspect parsing without writing ICS):

```bash
node index.js "https://.../view=schedule" 132313
```

Write ICS into `./generated/`:

```bash
node index.js "https://.../view=schedule" 132313 brazil-nuts-thursday.ics
```

Outputs
-------

Outputs
-------

- `data/raw.html` — saved HTML fetched from the site
- `generated/<ICS_FILENAME>` — generated iCalendar when an ICS filename is provided (otherwise no file is written)

GitHub Actions
--------------

A workflow is provided at `.github/workflows/scrape.yml` which can be triggered manually via the Actions tab. It accepts three inputs:

- `url` (required) — the schedule page URL
- `team_id` (required) — team id to filter
- `ics_name` (optional) — filename to write into `./generated/` (if omitted the job will run read-only)

The job uploads `data/raw.html` as an artifact and, if `ics_name` was provided, uploads the generated ICS as an artifact named `generated-ics`.

Notes
-----

- The parser uses `jsdom` and heuristics tailored to the Calgary Sports Club schedule markup. If parsing yields no events, inspect `data/raw.html` and adjust selectors in `index.js`.
- If the site becomes client-rendered, consider adding Puppeteer as a fallback to render JS before scraping.

License
-------

MIT
