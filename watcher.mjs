#!/usr/bin/env node
/**
 * watcher.mjs — External hot-swap supervisor
 *
 * Kept as plain ESM JavaScript (not TypeScript) so it:
 * - Requires no build step
 * - Can run independently without the backend's dependencies
 * - Stays alive during the backend restart it orchestrates
 *
 * Usage: node watcher.mjs
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const SIGNAL_FILE = path.join(ROOT, 'stage-ready');
const PID_FILE = path.join(ROOT, 'backend.pid');
const POLL_INTERVAL = 1000; // ms
const SHUTDOWN_TIMEOUT = 10_000; // ms before SIGKILL

let backendProc = null;

// ── Utilities ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[watcher] ${new Date().toISOString()} ${msg}`);
}

function readPid() {
  try {
    return parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
  } catch {
    return null;
  }
}

function killProcess(pid) {
  return new Promise((resolve) => {
    try {
      process.kill(pid, 'SIGTERM');
      log(`Sent SIGTERM to PID ${pid}`);
    } catch {
      log(`PID ${pid} already gone`);
      resolve();
      return;
    }

    const start = Date.now();
    const check = setInterval(() => {
      try {
        process.kill(pid, 0); // check if still alive
        if (Date.now() - start > SHUTDOWN_TIMEOUT) {
          try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
          clearInterval(check);
          resolve();
        }
      } catch {
        clearInterval(check);
        resolve();
      }
    }, 200);
  });
}

function spawnBackend() {
  const proc = spawn('node', ['--loader', 'tsx/esm', 'src/index.ts'], {
    cwd: path.join(ROOT, 'backend'),
    stdio: 'inherit',
    env: { ...process.env },
  });

  proc.on('exit', (code, signal) => {
    log(`Backend exited (code=${code}, signal=${signal})`);
    backendProc = null;
  });

  backendProc = proc;
  log(`Backend spawned (PID: ${proc.pid})`);
}

// ── Hot-swap handler ──────────────────────────────────────────────────────────

async function handleSwap() {
  let signal;
  try {
    signal = JSON.parse(await fsPromises.readFile(SIGNAL_FILE, 'utf-8'));
  } catch (err) {
    log(`Failed to read signal file: ${err.message}`);
    return;
  }

  const { stagingDir, stagingPath, commitHash, commitMessage } = signal;
  log(`Hot-swap requested: ${stagingDir} (commit: ${commitHash ?? 'none'})`);
  log(`Commit: "${commitMessage}"`);

  // 1. Kill current backend
  const pid = readPid();
  if (pid) {
    await killProcess(pid);
    log('Backend stopped');
  }

  // 2. Backup current backend
  const backupDir = `backend_backup_${Date.now()}`;
  try {
    await fsPromises.rename(path.join(ROOT, 'backend'), path.join(ROOT, backupDir));
    log(`Current backend backed up → ${backupDir}`);
  } catch (err) {
    log(`Backup failed: ${err.message} — aborting swap`);
    return;
  }

  // 3. Move staging → backend
  try {
    await fsPromises.rename(stagingPath, path.join(ROOT, 'backend'));
    log('Staging dir promoted → backend');
  } catch (err) {
    log(`Rename failed: ${err.message} — restoring backup`);
    try {
      await fsPromises.rename(path.join(ROOT, backupDir), path.join(ROOT, 'backend'));
      log('Backup restored');
    } catch (restoreErr) {
      log(`CRITICAL: Restore also failed: ${restoreErr.message}`);
    }
    return;
  }

  // 4. Remove signal file
  try {
    await fsPromises.unlink(SIGNAL_FILE);
  } catch { /* ignore */ }

  // 5. Start new backend
  spawnBackend();
  log(`✓ Hot-swap complete (commit: ${commitHash ?? 'none'})`);
}

// ── Main loop ─────────────────────────────────────────────────────────────────

log('Watcher started');
log(`Watching for: ${SIGNAL_FILE}`);

// Start backend initially
spawnBackend();

// Poll for signal file
setInterval(async () => {
  if (fs.existsSync(SIGNAL_FILE)) {
    await handleSwap();
  }
}, POLL_INTERVAL);

// Cleanup on watcher exit
process.on('SIGINT', () => {
  log('Watcher stopping...');
  if (backendProc) backendProc.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (backendProc) backendProc.kill('SIGTERM');
  process.exit(0);
});
