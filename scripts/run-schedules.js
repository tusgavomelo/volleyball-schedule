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
  // After successful run, add and commit the generated ICS (if any)
  try {
    const icsPath = path.join(__dirname, '..', 'generated', s.ics || '*.ics');
    spawnSync('git', ['add', icsPath]);
    const diff = spawnSync('git', ['diff', '--staged', '--quiet']);
    if (diff.status === 0) {
      console.log('No changes to commit for', s.name);
    } else {
      const when = new Date().toISOString();
      const msg = `chore(ci): update ${s.ics || 'generated'} (schedule ${s.name} ${when})`;
      const commit = spawnSync('git', ['-c', 'user.name=local-runner', '-c', 'user.email=local-runner@example.com', 'commit', '-m', msg], { stdio: 'inherit' });
      if (commit.status === 0) {
        const push = spawnSync('git', ['push'], { stdio: 'inherit' });
        if (push.status !== 0) {
          console.error('git push failed for', s.name);
        }
      }
    }
  } catch (e) {
    console.warn('Git commit/push step failed:', String(e));
  }

  // small throttle (sleep 2s)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
}

console.log('All schedules completed.');
