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

- `generated/<ICS_FILENAME>` — generated iCalendar when an ICS filename is provided (otherwise no file is written)

GitHub Actions
--------------

A workflow is provided at `.github/workflows/scrape.yml` which can be triggered manually via the Actions tab. It accepts three inputs:

- `url` (required) — the schedule page URL
- `team_id` (required) — team id to filter
- `ics_name` (optional) — filename to write into `./generated/` (if omitted the job will run read-only)

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
