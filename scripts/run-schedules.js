#!/usr/bin/env node
// Simple runner that reads schedules.json and runs index.js sequentially for each entry.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const schedulesPath = path.join(__dirname, '..', 'schedules.json');
if (!fs.existsSync(schedulesPath)) {
  console.error('schedules.json not found at', schedulesPath);
  process.exit(2);
}

const schedules = JSON.parse(fs.readFileSync(schedulesPath, 'utf8'));
for (const s of schedules) {
  console.log('Running schedule:', s.name);
  const args = [path.join(__dirname, '..', 'index.js'), s.url, s.team, s.ics || ''];
  const res = spawnSync('node', args, { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error('Schedule failed:', s.name);
    process.exit(res.status);
  }
  // small throttle
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
}

console.log('All schedules completed.');
