"use strict";
// Optional fresh production installation check; never copies runtime data/secrets.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process"), net = require("node:net");
async function main() {
  const root = path.resolve(__dirname, ".."), temp = fs.mkdtempSync(path.join(os.tmpdir(), "szzx-node-deploy-")); let server;
  try {
    // Copy only publishable source candidates, never ignored workspace data or builds.
    const manifest = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {cwd: root, encoding: 'utf8'});
    assert.equal(manifest.status, 0, 'Cannot enumerate public source files');
    const rootFiles = new Set(['server.js', 'data.json', 'menu-json-rules.md', 'package.json', 'package-lock.json', 'tsconfig.json']);
    for (const file of new Set(manifest.stdout.split('\0').filter(Boolean))) {
      if (!rootFiles.has(file) && !/^(apps|packages|data|tools)\//.test(file)) continue;
      const source = path.join(root, file);
      if (!fs.existsSync(source)) continue;
      const destination = path.join(temp, file);
      fs.mkdirSync(path.dirname(destination), {recursive: true});
      fs.copyFileSync(source, destination);
    }
    for (const file of ['data.db', '.env', '.private', 'uploads', 'apps/api/dist', 'apps/web/dist']) assert.ok(!fs.existsSync(path.join(temp, file)), file);
    const env = {...process.env, JWT_SECRET: require('node:crypto').randomBytes(48).toString('hex')}; delete env.NODE_PATH;
    for (const key of Object.keys(env)) if (/^(OPENROUTER_|GEMINI_|MENU_|AMAP_|OPERATOR_)/.test(key) || ['APP_ROOT', 'APP_ORIGIN', 'DATABASE_URL'].includes(key)) delete env[key];
    env.NODE_ENV = 'production'; env.MENU_SYNC_ENABLED = 'false';
    const windows = process.platform === "win32";
    function npm(args) {
      const result = spawnSync(windows ? (process.env.ComSpec || "cmd.exe") : "npm", windows ? ["/d", "/c", "npm", ...args] : args, {cwd: temp, env, windowsHide: true, encoding: "utf8", timeout: 180000});
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    npm(["ci", "--include=dev", "--no-audit", "--no-fund"]);
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
    for (const route of ['/.private/menu-master.key', '/.private/session-secret', '/.env', '/.git/config', '/data.db']) assert.equal((await fetch(base + route)).status, 404, route);
    assert.equal((await fetch(base + "/api/admin/menu-sync/settings")).status, 404);
    assert.equal((await fetch(base + "/api/admin/menu-sync/imports")).status, 404);
    assert.equal((await fetch(base + "/menu-json-rules.md")).status, 404);
    assert.ok(!fs.existsSync(path.join(temp, "node_modules", "playwright")));
    assert.ok(!fs.existsSync(path.join(temp, ".private", "menu-master.key")));
    env.OPERATOR_USERNAME='deploy_operator';env.OPERATOR_PASSWORD='DeployOperator2026Safe';npm(['run','account:operator']);
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'deploy_operator',password:env.OPERATOR_PASSWORD})});assert.equal(login.status,200);assert.equal((await login.json()).user.role,'operator');
    console.log("Fresh install, source build, dependency prune and production startup passed: catalog, static page, private-file protection and admin authentication.");
  } finally {
    if (server && server.exitCode === null) { server.kill(); await new Promise(r => server.once("exit", r)); }
    assert.equal(path.dirname(fs.realpathSync(temp)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    fs.rmSync(temp, {recursive: true, force: true});
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
