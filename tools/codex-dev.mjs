import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const stateDir = path.join(root, '.private/codex');
const pidFile = path.join(stateDir, 'dev.pid');
const logFile = path.join(stateDir, 'dev.log');
const ports = [3000, 5173];

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isListeningAt(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function isListening(port) {
  return (await Promise.all(['127.0.0.1', '::1'].map((host) => isListeningAt(port, host)))).some(
    Boolean,
  );
}

fs.mkdirSync(stateDir, { recursive: true });
if (fs.existsSync(pidFile)) {
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  // An empty file belongs to another invocation that is currently starting up.
  if (!pid) process.exit(0);
  if (isAlive(pid)) {
    if ((await Promise.all(ports.map(isListening))).every(Boolean)) process.exit(0);
    console.error(
      `Development server process ${pid} is running but not ready; inspect ${logFile}.`,
    );
    process.exit(1);
  }
  fs.unlinkSync(pidFile);
}

let lock;
try {
  lock = fs.openSync(pidFile, 'wx');
} catch (error) {
  if (error.code === 'EEXIST') process.exit(0);
  throw error;
}

try {
  const occupied = await Promise.all(ports.map(isListening));
  if (occupied.some(Boolean)) {
    throw new Error(
      `Development port(s) ${ports.filter((_, index) => occupied[index]).join(', ')} already in use; check the existing servers before starting another copy.`,
    );
  }
  const log = fs.openSync(logFile, 'a');
  let child;
  try {
    child = spawn(process.execPath, [path.join(root, 'tools/dev.mjs')], {
      cwd: root,
      detached: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, PORT: '3000' },
    });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    fs.writeFileSync(lock, String(child.pid));
    child.unref();
  } finally {
    fs.closeSync(log);
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (!isAlive(child.pid)) break;
    if ((await Promise.all(ports.map(isListening))).every(Boolean)) {
      console.log('Development servers ready: http://localhost:5173 (API: port 3000).');
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Development servers did not become ready; inspect ${logFile}.`);
} catch (error) {
  if (!fs.readFileSync(pidFile, 'utf8').trim()) fs.unlinkSync(pidFile);
  console.error(error.message);
  process.exitCode = 1;
} finally {
  fs.closeSync(lock);
}
