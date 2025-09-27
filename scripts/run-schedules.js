#!/usr/bin/env node
// Simple runner that reads schedules.json and runs index.js sequentially for each entry.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schedulesPath = path.join(__dirname, '..', 'schedules.json');
if (!fs.existsSync(schedulesPath)) {
  console.error('schedules.json not found at', schedulesPath);
  process.exit(2);
}

const schedules = JSON.parse(fs.readFileSync(schedulesPath, 'utf8'));
for (const s of schedules) {
  console.log('Running schedule:', s.name);
  const scriptPath = path.join(__dirname, '..', 'index.js');
  const args = [scriptPath, s.url, s.team];
  if (s.ics) args.push(s.ics);
  const res = spawnSync('node', args, { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error('Schedule failed:', s.name);
    process.exit(res.status);
  }
  // small throttle (sleep 2s)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
}

console.log('All schedules completed.');
