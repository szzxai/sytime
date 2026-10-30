"use strict";
// Optional fresh production installation check; never copies runtime data/secrets.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process"), net = require("node:net");
async function main() {
  const root = path.resolve(__dirname, ".."), temp = fs.mkdtempSync(path.join(os.tmpdir(), "szzx-node-deploy-")); let server;
  try {
    for (const file of ["server.js", "data.json", "menu-json-rules.md", "package.json", "package-lock.json", "tsconfig.json"]) fs.copyFileSync(path.join(root, file), path.join(temp, file));
    for (const dir of ["apps", "packages", "data", "tools"]) fs.cpSync(path.join(root, dir), path.join(temp, dir), {recursive: true, filter: source => !source.includes("node_modules") && !source.includes("/dist")});
    const env = {...process.env, JWT_SECRET: "deploy-isolated-test-secret"}; delete env.NODE_PATH;
    for (const key of Object.keys(env)) if (/^(OPENROUTER_|GEMINI_|MENU_)/.test(key)) delete env[key];
    const windows = process.platform === "win32";
    function npm(args) {
      const result = spawnSync(windows ? (process.env.ComSpec || "cmd.exe") : "npm", windows ? ["/d", "/c", "npm", ...args] : args, {cwd: temp, env, windowsHide: true, encoding: "utf8", timeout: 180000});
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    npm(["ci", "--no-audit", "--no-fund"]);
    npm(["run", "build"]);
    npm(["prune", "--omit=dev", "--no-audit", "--no-fund"]);
    const probe = net.createServer(); await new Promise(r => probe.listen(0, "127.0.0.1", r)); const port = probe.address().port; await new Promise(r => probe.close(r));
    server = spawn(process.execPath, ["server.js"], {cwd: temp, env: {...env, PORT: String(port)}, windowsHide: true, stdio: ["ignore", "pipe", "pipe"]});
    let log = ""; server.stdout.on("data", x => log += x); server.stderr.on("data", x => log += x);
    const base = `http://127.0.0.1:${port}`; let data;
    for (let i = 0; i < 150; i++) {
      if (server.exitCode !== null) throw new Error(log);
      try { const response = await fetch(base + "/api/dishes"); if (response.ok) { data = await response.json(); break; } } catch { /* startup */ }
      await new Promise(r => setTimeout(r, 100));
    }
    assert.equal(data?.dishes.length, 0); assert.equal(data.meta.records_count || 0, 0);
    assert.equal((await fetch(base + "/recipe.html")).status, 200);
    assert.equal((await fetch(base + "/.private/menu-master.key")).status, 404);
    assert.equal((await fetch(base + "/api/admin/menu-sync/settings")).status, 401);
    assert.equal((await fetch(base + "/api/admin/menu-sync/imports")).status, 401);
    assert.equal((await fetch(base + "/menu-json-rules.md")).status, 200);
    assert.ok(!fs.existsSync(path.join(temp, "node_modules", "playwright")));
    assert.ok(!fs.existsSync(path.join(temp, ".private", "menu-master.key")));
    console.log("Fresh install, source build, dependency prune and production startup passed: catalog, static page, private-file protection and admin authentication.");
  } finally {
    if (server && server.exitCode === null) { server.kill(); await new Promise(r => server.once("exit", r)); }
    assert.equal(path.dirname(fs.realpathSync(temp)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    fs.rmSync(temp, {recursive: true, force: true});
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
