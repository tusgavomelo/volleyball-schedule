#!/usr/bin/env node
// Simple first-pass scraper for Calgary Sports Club schedule pages.
// Usage: node index.js [URL] [TEAM_ID]
// Example: node index.js <url> 132313

const fs = require('fs');
const path = require('path');
const https = require('https');
const { JSDOM } = require('jsdom');

const OUT_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const argv = process.argv.slice(2);
// Require URL and TEAM_ID as positional args (no defaults). Optional third arg is the ICS filename.
if (argv.length < 2) {
	console.error('Usage: node index.js <SCHEDULE_URL> <TEAM_ID> [ICS_FILENAME]');
	console.error('If ICS_FILENAME is provided the script will write the .ics into ./generated/<ICS_FILENAME>');
	process.exit(2);
}
const url = argv[0];
const TEAM_ID = argv[1];
const icsName = argv[2]; // optional; presence controls whether we write an ICS file
const TEAM_CLASS = `team_${TEAM_ID}`;

// Determine whether to write an ICS file. If an ICS filename is provided we will write into ./generated
const WRITE_ICS = Boolean(icsName);
const GENERATED_DIR = path.join(__dirname, 'generated');
if (WRITE_ICS) {
	if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

function fetchUrl(u) {
	return new Promise((resolve, reject) => {
		https.get(u, (res) => {
			let raw = '';
			res.on('data', (d) => raw += d);
			res.on('end', () => resolve(raw));
		}).on('error', reject);
	});
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
		const uidBase = ev.uid || `${ev.start.toISOString()}|${ev.summary}`;
		const uid = `${Buffer.from(uidBase).toString('base64').replace(/=/g, '')}-${i}@volleyball-schedule`;
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
	console.log('Fetching', url);
	const raw = await fetchUrl(url);
	// Keep raw HTML in memory for parsing. We no longer persist raw.html to disk by default.

	// Parse with jsdom (JSDOM is a dependency; if missing, instruct user to install)
	let events = [];
	try {
		const dom = new JSDOM(raw);
		const doc = dom.window.document;

				// Structured parsing tailored to sample markup in sample.html
				const scheduleRoot = doc.querySelector('.ssc-schedule-html') || doc;
				const weekEntries = Array.from(scheduleRoot.querySelectorAll('.week-entry'));
				console.log('Found', weekEntries.length, 'week entries');
				for (const week of weekEntries) {
					const dateEl = week.querySelector('.game_date');
					const dateText = dateEl ? dateEl.textContent.trim() : null;
					for (const alloc of Array.from(week.querySelectorAll('.allocation-entry'))) {
						const timeEl = alloc.querySelector('.game_time');
						const timeText = timeEl ? timeEl.textContent.trim() : '';
						const facilityEl = alloc.querySelector('.facility_details a');
						const facility = facilityEl ? facilityEl.textContent.trim() : '';
						const coordEl = alloc.querySelector('.event_coordinator');
						const coordinator = coordEl ? coordEl.textContent.trim() : '';

						for (const me of Array.from(alloc.querySelectorAll('.match-entry'))) {
							const hasTeamClass = me.classList.contains(TEAM_CLASS) || !!me.querySelector('.' + TEAM_CLASS);
							if (!hasTeamClass) continue;

							const matchText = me.textContent.replace(/\s+/g, ' ').trim();
							// Build a date-time string from dateText and timeText
							let dtString = '';
							if (dateText) dtString = `${dateText} ${timeText}`;
							// If dateText doesn't include a year, append 2025
							if (dateText && !/\d{4}/.test(dateText)) dtString = `${dateText} 2025 ${timeText}`;

							let start = new Date(dtString);
							if (isNaN(start)) {
								// try a few fallbacks: remove commas
								const altDate = dateText ? dateText.replace(/,/g, '') : '';
								start = new Date(`${altDate} ${timeText} 2025`);
							}

							if (isNaN(start)) {
								// preserve unparsed match for later inspection
								events.push({ start: new Date(NaN), end: new Date(NaN), summary: 'Volleyball (unparsed)', description: `MATCH: ${matchText} | FACILITY: ${facility} | COORD: ${coordinator}`, location: facility });
								continue;
							}

							const end = new Date(start.getTime() + 90 * 60 * 1000);
							// summary: prefer explicit team spans inside match-entry
							const teamSpans = Array.from(me.querySelectorAll('span[class^="team_"]'));
							let summary = matchText;
							if (teamSpans.length >= 2) {
								summary = `${teamSpans[0].textContent.trim()} vs ${teamSpans[1].textContent.trim()}`;
							}

							const descriptionParts = [];
							if (coordinator) descriptionParts.push(coordinator);
							if (facility) descriptionParts.push(`Facility: ${facility}`);
							descriptionParts.push(`Raw: ${matchText}`);
							const description = descriptionParts.join('\n');

							events.push({ start, end, summary, description, location: facility });
						}
					}
				}
	} catch (err) {
		console.warn('HTML parse failed:', String(err));
	}

	if (events.length === 0) {
		console.warn('No events parsed — inspect data/raw.html to craft selectors.');
	}

		// Merge events that occur on the same calendar day into a single event
		function dayKey(date) {
			if (!date || isNaN(date)) return null;
			const y = date.getFullYear();
			const m = String(date.getMonth() + 1).padStart(2, '0');
			const d = String(date.getDate()).padStart(2, '0');
			return `${y}-${m}-${d}`;
		}

		const byDay = new Map();
		for (const ev of events) {
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

				const toShow = merged.length ? merged : events;

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
					const s = ev.start && !isNaN(ev.start) ? ev.start.toISOString() : 'INVALID';
					const e = ev.end && !isNaN(ev.end) ? ev.end.toISOString() : 'INVALID';
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
