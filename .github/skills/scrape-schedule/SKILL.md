---
name: scrape-schedule
description: "Scrape Calgary Sports Club volleyball schedule pages and generate iCalendar (.ics) files. Use when: running the scraper, adding a new schedule, updating schedule URLs, debugging parsed events, regenerating .ics files, or troubleshooting missing events."
argument-hint: "Optionally provide a schedule name, URL, or 'all' to run all schedules"
---

# Scrape Volleyball Schedule

Fetch Calgary Sports Club schedule pages and generate `.ics` calendar files for Google Calendar import.

## When to Use

- User wants to run the scraper to generate/update `.ics` files
- User wants to add a new schedule (new league, new day, new team)
- User wants to debug why events aren't being parsed
- User wants to regenerate all calendars
- User mentions volleyball, schedule, calendar, ics, or scraping

## Prerequisites

- Node.js installed (engine: 24.8.0)
- Dependencies installed: run `npm install` from the project root if `node_modules/` is missing
- Dependencies: `got` (HTTP client), `cheerio` (HTML parser)

## Project Layout

```
index.js              # Single-file CLI scraper (entry point)
schedules.json        # Registry of all schedules to scrape
scripts/run-schedules.js  # Batch runner: iterates schedules.json, runs index.js for each
generated/            # Output .ics files (safe to overwrite, committed to repo)
backup/               # Backup copies of .ics files (do not delete)
data/                 # Debug artifacts: raw.html, generated.ics (gitignored)
```

## Procedures

### Run a single schedule

```bash
node index.js <SCHEDULE_URL> <TEAM_ID> [ICS_FILENAME]
```

- `SCHEDULE_URL` — full URL to the Calgary Sports Club schedule page
- `TEAM_ID` — numeric team identifier (appears in CSS class `team_<ID>` on schedule rows)
- `ICS_FILENAME` — optional; if provided, writes `.ics` into `./generated/<ICS_FILENAME>`

Example (Thursday league):
```bash
node index.js "https://www.calgarysportsclub.com/schedules/fall-2025-thursday-indoor-volleyball-recreational-plus-a" 132313 brazil-nuts-thursday.ics
```

### Run all schedules

```bash
node scripts/run-schedules.js
```

This reads `schedules.json` and runs `index.js` for each entry sequentially. It also commits and pushes any changed `.ics` files in CI.

### Add a new schedule

1. Open `schedules.json`
2. Add a new entry:
   ```json
   {
     "name": "descriptive-name",
     "url": "https://www.calgarysportsclub.com/schedules/<season-page-slug>",
     "team": "<TEAM_ID>",
     "ics": "<output-filename>.ics"
   }
   ```
3. Find the team ID: inspect the schedule page HTML, look for CSS classes like `team_123456` on match rows
4. Run the single schedule to verify: `node index.js "<url>" "<team_id>" "<filename>.ics"`
5. Verify output in `generated/<filename>.ics`

### Debug missing or incorrect events

1. Set `SAVE_RAW=1` and run the scraper to save the raw HTML:
   ```bash
   SAVE_RAW=1 node index.js "<url>" "<team_id>"
   ```
2. Open `data/raw.html` and inspect the page structure
3. Look for `.week-entry` containers → `.allocation-entry` → `.match-entry` with class `team_<ID>`
4. If selectors are wrong, update the cheerio selectors in `index.js` (around the `main()` function)

### Verify output

- Check `generated/*.ics` files — they should contain `VCALENDAR` with `VEVENT` blocks
- Each event has: `DTSTART`, `DTEND` (90 min default), `SUMMARY` (teams), `LOCATION` (facility)
- Events on the same day are merged into a single calendar event
- Import the `.ics` file into Google Calendar to spot-check dates and times

## Key Parsing Details

- **Selectors**: `.ssc-schedule-html` → `.week-entry` → `.allocation-entry` → `.match-entry.team_<ID>`
- **Date format**: parsed from `.game_date` text + `.game_time` text; year `2025` appended if missing
- **Duration**: 90 minutes default
- **Merging**: multiple matches on the same calendar day are merged into one event
- **ICS UIDs**: stable base64 encoding of start time + summary, so repeated runs produce identical files when content hasn't changed

## Important Rules

- **Do not delete** `backup/` or existing `.ics` files in `generated/`
- Treat `data/` and `generated/` as generated artifacts (safe to overwrite)
- If the schedule page is client-rendered (no useful rows in `data/raw.html`), add a Puppeteer fallback and document why
- After changing parsing logic, add a comment in `index.js` describing the selector/regex relied on
- Use **git bash** for all terminal commands (user preference)
