#!/usr/bin/env node
// Simple first-pass scraper for Calgary Sports Club schedule pages.
// Usage: node index.js --url <URL> --team <ID> [--output <file.ics>] [--name <display title>]
//        Short: -u -t -o -n  |  help: --help
// If --name is omitted, env VOLLEYBALL_EVENT_NAME is used (when set).

import fs from 'fs';
import path from 'path';
import got from 'got';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const rawArg = process.argv.slice(2);

function printUsage() {
	console.error(
		'Usage: node index.js --url <SCHEDULE_URL> --team <TEAM_ID> [--output <file.ics>] [--name <TITLE>]',
	);
	console.error('  -u, --url       Schedule page URL (required)');
	console.error('  -t, --team      Team id to filter (required)');
	console.error('  -o, --output    ICS filename written under ./generated/ (optional; omit for read-only)');
	console.error('  -n, --name      Display title for every game; bye weeks unchanged (optional)');
	console.error('  --event-name     Same as --name');
	console.error('  If --name is omitted, VOLLEYBALL_EVENT_NAME is used when set.');
}

function needValue(flag, i) {
	const v = rawArg[i + 1];
	if (v == null || v.startsWith('-')) {
		console.error('Error: ' + flag + ' requires a value');
		printUsage();
		process.exit(2);
	}
	return { val: v, nextI: i + 1 };
}

let url;
let TEAM_ID;
let icsName;
let eventNameOverride = (process.env.VOLLEYBALL_EVENT_NAME || '').trim() || null;

for (let i = 0; i < rawArg.length; i++) {
	const a = rawArg[i];
	if (a === '-h' || a === '--help') {
		printUsage();
		process.exit(0);
	}
	if (a === '-u' || a === '--url') {
		const n = needValue(a, i);
		url = n.val;
		i = n.nextI;
		continue;
	}
	if (a === '-t' || a === '--team') {
		const n = needValue(a, i);
		TEAM_ID = n.val;
		i = n.nextI;
		continue;
	}
	if (a === '-o' || a === '--output') {
		const n = needValue(a, i);
		icsName = n.val;
		i = n.nextI;
		continue;
	}
	if (a === '-n' || a === '--name' || a === '--event-name') {
		const n = needValue(a, i);
		eventNameOverride = n.val;
		i = n.nextI;
		continue;
	}
	if (a.startsWith('-')) {
		console.error('Unknown option:', a);
		printUsage();
		process.exit(2);
	}
	console.error('Positional arguments are not supported. Use --url, --team, etc.');
	printUsage();
	process.exit(2);
}

if (!url || !TEAM_ID) {
	console.error('Error: --url and --team are required.');
	printUsage();
	process.exit(2);
}

if (icsName) {
	icsName = path.basename(icsName);
}
if (eventNameOverride === '') {
	eventNameOverride = null;
}
const TEAM_CLASS = `team_${TEAM_ID}`;

/**
 * Replaces the summary shown for each game. Original scraped title is kept in uidSummary
 * (so event UIDs stay stable if you only change the display name) and prepended to DESCRIPTION.
 * All-day (bye) events are left as-is.
 */
function applyEventNameOverride(events) {
	if (!eventNameOverride) {
		return events;
	}
	return events.map((ev) => {
		if (ev.allDay) {
			return ev;
		}
		const orig = ev.summary;
		const baseDesc = (ev.description || '').trim();
		const extra = `Scraped title: ${orig}${baseDesc ? '\n\n' : ''}${baseDesc}`;
		return {
			...ev,
			uidSummary: orig,
			summary: eventNameOverride,
			description: extra,
		};
	});
}

// Determine whether to write an ICS file. If an ICS filename is provided we will write into ./generated
const WRITE_ICS = Boolean(icsName);
const GENERATED_DIR = path.join(__dirname, 'generated');
if (WRITE_ICS) {
	if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

async function fetchUrl(u) {
	const headers = {
		'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36',
		'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
	};
	const opts = {
		headers,
		responseType: 'text',
		retry: { limit: 2 },
		timeout: { request: 15000 },
		decompress: true,
		followRedirect: true
	};

	const resp = await got(u, opts);
	const body = resp.body;
	try {
		if (process.env.GITHUB_ACTIONS === 'true' || process.env.SAVE_RAW === '1') {
			const rawPath = path.join(OUT_DIR, 'raw.html');
			fs.writeFileSync(rawPath, body, 'utf8');
			console.log('Saved raw HTML to', rawPath);
		}
	} catch (e) {
		// ignore
	}
	return body;
}

function toICalDate(d) {
	// return YYYYMMDDTHHMMSSZ in UTC
	const pad = (n) => String(n).padStart(2, '0');
	const y = d.getUTCFullYear();
	const m = pad(d.getUTCMonth() + 1);
	const day = pad(d.getUTCDate());
	const hh = pad(d.getUTCHours());
	const mm = pad(d.getUTCMinutes());
	const ss = pad(d.getUTCSeconds());
	return `${y}${m}${day}T${hh}${mm}${ss}Z`;
}

function toICalDateValueLocal(d) {
	const pad = (n) => String(n).padStart(2, '0');
	const y = d.getFullYear();
	const m = pad(d.getMonth() + 1);
	const day = pad(d.getDate());
	return `${y}${m}${day}`;
}

function buildICS(events = [], sourceUrl, calendarName) {
	const headerLines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//volleyball-schedule//EN',
	];
	if (calendarName) {
		headerLines.push(`X-WR-CALNAME:${calendarName}`);
	}
	const header = headerLines.join('\r\n');

	const body = events.map((ev, i) => {
		// Create a stable UID per event so repeated runs produce the same file when content hasn't changed.
		// Use start time + summary hash as the UID source.
		const uidBase = ev.uid || `${ev.start.toISOString()}|${ev.uidSummary || ev.summary}`;
		const uid = `${Buffer.from(uidBase).toString('base64').replace(/=/g, '')}-${i}@volleyball-schedule`;
		if (ev.allDay) {
			const startD = toICalDateValueLocal(ev.start);
			// iCal all-day: DTEND is the exclusive end date (day after the last day of the event)
			const endExclusive = new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate() + 1);
			const endD = toICalDateValueLocal(endExclusive);
			return [
				'BEGIN:VEVENT',
				`UID:${uid}`,
				`DTSTAMP:${toICalDate(new Date())}`,
				`DTSTART;VALUE=DATE:${startD}`,
				`DTEND;VALUE=DATE:${endD}`,
				`SUMMARY:${ev.summary}`,
				`DESCRIPTION:${ev.description || ''}\\nSource: ${sourceUrl}`,
				`LOCATION:${ev.location || ''}`,
				'END:VEVENT',
			].join('\r\n');
		}
		return [
			'BEGIN:VEVENT',
			`UID:${uid}`,
			`DTSTAMP:${toICalDate(new Date())}`,
			`DTSTART:${toICalDate(ev.start)}`,
			`DTEND:${toICalDate(ev.end)}`,
			`SUMMARY:${ev.summary}`,
			`DESCRIPTION:${ev.description || ''}\\nSource: ${sourceUrl}`,
			`LOCATION:${ev.location || ''}`,
			'END:VEVENT',
		].join('\r\n');
	}).join('\r\n');

	const footer = '\r\nEND:VCALENDAR\r\n';
	return header + '\r\n' + body + footer;
}

async function main() {
	if (eventNameOverride) {
		console.log('Display title for all game events:', eventNameOverride, '(bye weeks unchanged)');
	}
	console.log('Fetching', url);
	const raw = await fetchUrl(url);
	// Keep raw HTML in memory for parsing. We no longer persist raw.html to disk by default.

	// Parse with cheerio (fast, jQuery-like parsing). Keep selector heuristics from the original jsdom code.
	let events = [];
	try {
		const $ = cheerio.load(raw);
		const scheduleRoot = $('.ssc-schedule-html').length ? $('.ssc-schedule-html') : $.root();
		const weekEntries = scheduleRoot.find('.week-entry').toArray();
		console.log('Found', weekEntries.length, 'week entries');
		const matchEntryForTeam = (el) => {
			const m = $(el);
			return m.hasClass(TEAM_CLASS) || m.find(`.${TEAM_CLASS}`).length > 0;
		};
		const weekIncludesTeam = (week$) =>
			week$.hasClass(TEAM_CLASS) || week$.find(`.${TEAM_CLASS}`).length > 0;
		/** Date only (local midnight) from .game_date text, same heuristics as game rows for missing year */
		const parseAllDayFromGameDate = (dateText) => {
			if (!dateText) return new Date(NaN);
			const timeText = '12:00 PM';
			let dtString = `${dateText} ${timeText}`;
			if (dateText && !/\d{4}/.test(dateText)) {
				dtString = `${dateText} 2025 ${timeText}`;
			}
			let t = new Date(dtString);
			if (isNaN(t)) {
				const alt = dateText.replace(/,/g, '');
				t = new Date(`${alt} ${timeText} 2025`);
			}
			if (isNaN(t)) return new Date(NaN);
			return new Date(t.getFullYear(), t.getMonth(), t.getDate());
		};

		for (const weekEl of weekEntries) {
			const week = $(weekEl);
			const dateEl = week.find('.game_date').first();
			const dateText = dateEl.length ? dateEl.text().trim() : null;
			for (const allocEl of week.find('.allocation-entry').toArray()) {
				const alloc = $(allocEl);
				const timeEl = alloc.find('.game_time').first();
				const timeText = timeEl.length ? timeEl.text().trim() : '';
				const facilityEl = alloc.find('.facility_details a').first();
				const facility = facilityEl.length ? facilityEl.text().trim() : '';
				const coordEl = alloc.find('.event_coordinator').first();
				const coordinator = coordEl.length ? coordEl.text().trim() : '';

				for (const meEl of alloc.find('.match-entry').toArray()) {
					const me = $(meEl);
					const hasTeamClass = matchEntryForTeam(meEl);
					if (!hasTeamClass) continue;

					const matchText = me.text().replace(/\s+/g, ' ').trim();
					let dtString = '';
					if (dateText) dtString = `${dateText} ${timeText}`;
					if (dateText && !/\d{4}/.test(dateText)) dtString = `${dateText} 2025 ${timeText}`;

					let start = new Date(dtString);
					if (isNaN(start)) {
						const altDate = dateText ? dateText.replace(/,/g, '') : '';
						start = new Date(`${altDate} ${timeText} 2025`);
					}

					if (isNaN(start)) {
						events.push({ start: new Date(NaN), end: new Date(NaN), summary: 'Volleyball (unparsed)', description: `MATCH: ${matchText} | FACILITY: ${facility} | COORD: ${coordinator}`, location: facility });
						continue;
					}

					const end = new Date(start.getTime() + 90 * 60 * 1000);
					const teamSpans = me.find('span').filter((i, el) => /team_/.test((el.attribs && el.attribs.class) || '')).toArray();
					let summary = matchText;
					if (teamSpans.length >= 2) {
						const t0 = $(teamSpans[0]).text().trim();
						const t1 = $(teamSpans[1]).text().trim();
						summary = `${t0} vs ${t1}`;
					}

					const descriptionParts = [];
					if (coordinator) descriptionParts.push(coordinator);
					if (facility) descriptionParts.push(`Facility: ${facility}`);
					descriptionParts.push(`Raw: ${matchText}`);
					const description = descriptionParts.join('\n');

					events.push({ start, end, summary, description, location: facility });
				}
			}

			// Bye week: week is tagged for this team (e.g. class="week-entry team_123 ..."),
			// no match-entry for this team, optional .game_notes with reason (all-day event).
			if (!weekIncludesTeam(week)) continue;
			const teamMatchCount = week.find('.match-entry').toArray().filter(matchEntryForTeam).length;
			if (teamMatchCount > 0) continue;
			const notesText = week.find('.game_notes').first().text().replace(/\s+/g, ' ').trim();
			if (!dateText) continue;
			const dayStart = parseAllDayFromGameDate(dateText);
			if (isNaN(dayStart)) continue;
			const summary = notesText
				? `Bye week — ${notesText}`
				: 'Bye week (no game scheduled)';
			const description = notesText
				? notesText
				: 'No game scheduled for your team this week.';
			events.push({
				allDay: true,
				uid: `bye|${toICalDateValueLocal(dayStart)}|${TEAM_ID}|${notesText}`,
				start: dayStart,
				end: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000),
				summary,
				description,
				location: '',
			});
		}
	} catch (err) {
		console.warn('HTML parse failed:', String(err));
	}

	if (events.length === 0) {
		console.warn('No events parsed — inspect data/raw.html to craft selectors.');
	}

		// Merge timed events on the same calendar day (all-day byes are kept separate)
		function dayKey(date) {
			if (!date || isNaN(date)) return null;
			const y = date.getFullYear();
			const m = String(date.getMonth() + 1).padStart(2, '0');
			const d = String(date.getDate()).padStart(2, '0');
			return `${y}-${m}-${d}`;
		}

		const timed = events.filter((e) => !e.allDay);
		const byes = events.filter((e) => e.allDay);
		const byDay = new Map();
		for (const ev of timed) {
			if (!ev.start || isNaN(ev.start)) continue; // skip unparsable
			const key = dayKey(ev.start);
			if (!key) continue;
			if (!byDay.has(key)) byDay.set(key, []);
			byDay.get(key).push(ev);
		}

		const merged = [];
		for (const [k, list] of byDay.entries()) {
			// earliest start, latest end
			const valid = list.filter(e => e.start && !isNaN(e.start));
			if (valid.length === 0) continue;
			let start = valid[0].start;
			let end = valid[0].end || new Date(start.getTime() + 90 * 60 * 1000);
			const descriptions = [];
			const summaries = new Set();
			const locations = new Set();
			for (const e of valid) {
				if (e.start < start) start = e.start;
				if (e.end && e.end > end) end = e.end;
				if (e.description) descriptions.push(e.description);
				if (e.summary) summaries.add(e.summary);
				if (e.location) locations.add(e.location);
			}
			const summary = Array.from(summaries).join(' | ');
			const description = descriptions.join('\n---\n');
			const location = Array.from(locations).join(' | ');
			merged.push({ start, end, summary, description, location });
		}

		const mergedTimed = merged.length ? merged : timed;
		const toShow = applyEventNameOverride(
			[...mergedTimed, ...byes].sort((a, b) => a.start.getTime() - b.start.getTime())
		);

				// Emit ICS file for consumers (Google Calendar import/subscription)
				if (WRITE_ICS) {
					try {
						const calName = icsName && icsName.toLowerCase().endsWith('.ics') ? icsName.slice(0, -4) : icsName;
						const ics = buildICS(toShow, url, calName);
						const icsPath = path.join(GENERATED_DIR, icsName);

						// If file exists, compare normalized contents (ignore DTSTAMP and UID lines) and only overwrite if different
						let shouldWrite = true;
						if (fs.existsSync(icsPath)) {
							const old = fs.readFileSync(icsPath, 'utf8');
							const normalize = (s) => s.split(/\r?\n/).filter(l => !l.startsWith('DTSTAMP:') && !/^UID:/.test(l)).join('\n').trim();
							if (normalize(old) === normalize(ics)) {
								shouldWrite = false;
							}
						}

						if (shouldWrite) {
							fs.writeFileSync(icsPath, ics, 'utf8');
							console.log(`\nWrote ${toShow.length} events to ${icsPath}`);
						} else {
							console.log(`\nNo changes detected in ${icsPath}; not updating file.`);
						}
					} catch (err) {
						console.warn('Failed to write ICS:', String(err));
					}
				} else {
					console.log('\nNo ICS filename provided: running in read-only mode (provide a filename to write into ./generated/)');
				}

				// Also print a readable summary to the console
				console.log('\nParsed events (readable):\n');
				for (const ev of toShow) {
					const s = ev.allDay
						? toICalDateValueLocal(ev.start) + ' (all day)'
						: ev.start && !isNaN(ev.start) ? ev.start.toISOString() : 'INVALID';
					const e = ev.allDay
						? '(all day)'
						: ev.end && !isNaN(ev.end) ? ev.end.toISOString() : 'INVALID';
					console.log(`- ${s} -> ${e}`);
					console.log(`  SUMMARY: ${ev.summary || ''}`);
					if (ev.location) console.log(`  LOCATION: ${ev.location}`);
					if (ev.description) console.log(`  DESCRIPTION: ${ev.description.split('\n').slice(0,3).join('\n               ')}${ev.description.split('\n').length>3? '\n               ...' : ''}`);
					console.log('');
				}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
