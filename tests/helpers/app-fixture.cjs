"use strict";

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function startApp(prefix) {
  const root = path.resolve(__dirname, "../..");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  for (const filename of ["server.js", "data.json", "menu-json-rules.md"]) {
    fs.copyFileSync(path.join(root, filename), path.join(directory, filename));
  }
  for (const dirname of ["lib", "data"]) {
    fs.cpSync(path.join(root, dirname), path.join(directory, dirname), { recursive: true });
  }
  fs.symlinkSync(path.join(root, "public"), path.join(directory, "public"), "junction");
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const base = "http://127.0.0.1:" + port;
  const server = spawn(process.execPath, [path.join(directory, "server.js")], {
    cwd: directory,
    env: { ...process.env, NODE_PATH: path.join(root, "node_modules"), PORT: String(port), JWT_SECRET: "dish-tests-only-secret" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "", stopped = false;
  server.stdout.on("data", data => { log += data; });
  server.stderr.on("data", data => { log += data; });
  async function stop() {
    if (stopped) return;
    stopped = true;
    if (server.exitCode === null && server.signalCode === null) {
      server.kill();
      await new Promise(resolve => server.once("exit", resolve));
    }
    const resolved = fs.realpathSync(directory);
    if (path.dirname(resolved).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase() ||
        !path.basename(resolved).startsWith(prefix)) throw new Error("Unexpected test directory");
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  try {
    const deadline = Date.now() + 60000;
    let ready = false;
    while (Date.now() < deadline) {
      if (server.exitCode !== null || server.signalCode !== null) throw new Error(log);
      try {
        const response = await fetch(base + "/api/dishes", { signal: AbortSignal.timeout(1500) });
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!ready) throw new Error("Test server did not become ready: " + log);
  } catch (error) {
    await stop();
    throw error;
  }
  async function api(route, { method = "GET", token, body } = {}) {
    const headers = token ? { Authorization: "Bearer " + token } : {};
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const response = await fetch(base + route, { method, headers, body });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  return { root, directory, base, api, stop };
}

module.exports = { startApp };
