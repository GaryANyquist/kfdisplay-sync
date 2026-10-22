// Start, stop or restart the KFDisplay sync service on this PC, or show whether it is running (Gary, 2026-10-22:
// without Task Manager, and without KFIDisplay). The desktop shortcuts from setup\install-startup.ps1 run this.
//
//   node tools/control.js status | start | stop | restart
//
// Stop and restart ask the running service itself (POST /v1/restart with the SYNC_KEY from .env), so no
// administrator rights are needed even when it runs as SYSTEM. start-sync.cmd starts it again unless stop.flag is
// there. Start runs start-sync.cmd hidden when nothing is answering.
import { spawn } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../src/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stopFlag = path.join(root, 'stop.flag');
const cfg = loadConfig();
const base = `http://127.0.0.1:${cfg.port}`;
const auth = { Authorization: `Bearer ${cfg.syncKey}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The database name when the service answers, else null. */
async function health() {
  try {
    const res = await fetch(`${base}/v1/health`, { headers: auth, signal: AbortSignal.timeout(3000) });
    return res.ok ? ((await res.json()).database ?? '?') : null;
  } catch {
    return null;
  }
}

async function waitFor(up, seconds) {
  for (let i = 0; i < seconds * 2; i++) {
    if (!!(await health()) === up) return true;
    await sleep(500);
  }
  return false;
}

async function askToStop() {
  try {
    await fetch(`${base}/v1/restart`, { method: 'POST', headers: auth, signal: AbortSignal.timeout(3000) });
  } catch {
    // it may close the connection as it stops
  }
}

function startHidden() {
  if (existsSync(stopFlag)) rmSync(stopFlag);
  spawn('cmd.exe', ['/c', path.join(root, 'start-sync.cmd')], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

const what = process.argv[2] ?? 'status';
let ok = true;
if (what === 'status') {
  const db = await health();
  console.log(db ? `KFDisplay sync is running (database ${db}) on port ${cfg.port}.` : 'KFDisplay sync is not running.');
} else if (what === 'start') {
  if (await health()) console.log('KFDisplay sync is already running.');
  else {
    startHidden();
    ok = await waitFor(true, 20);
    console.log(ok ? 'KFDisplay sync started.' : 'KFDisplay sync did not start: see logs\\sync.log.');
  }
} else if (what === 'stop') {
  if (!(await health())) console.log('KFDisplay sync is not running.');
  else {
    writeFileSync(stopFlag, `stopped ${new Date().toISOString()}\n`);
    await askToStop();
    ok = await waitFor(false, 15);
    console.log(ok ? 'KFDisplay sync stopped. The register keeps its changes until it is started again.' : 'KFDisplay sync did not stop.');
  }
} else if (what === 'restart') {
  if (existsSync(stopFlag)) rmSync(stopFlag);
  if (await health()) {
    await askToStop();
    await waitFor(false, 10);
    // start-sync.cmd brings it back; if it was started some other way, start it here.
    if (!(await waitFor(true, 10))) startHidden();
  } else startHidden();
  ok = await waitFor(true, 20);
  console.log(ok ? 'KFDisplay sync restarted.' : 'KFDisplay sync did not come back: see logs\\sync.log.');
} else {
  console.log('Use: node tools/control.js status | start | stop | restart');
  ok = false;
}
process.exitCode = ok ? 0 : 1;
