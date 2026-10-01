"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Worker } = require("node:worker_threads");
const { MenuConfig, fingerprint } = require("./config");
const { testConfiguration } = require("./provider");
const { migrate, bootstrap, touchSource, publishSource, sourceId, lastAutoDay } = require("./store");
const { nextRun, dueOccurrence } = require("./schedule");
const { MenuError, cleanError } = require("./schema");
const { writeJson } = require("./source");
const { normalizeImage } = require("./images");
const { ManualMenus } = require("./manual");
const TERMINAL = ["succeeded", "partial", "failed", "cancelled", "interrupted"];
class MenuService {
  constructor(db, root, { clock = Date.now, workerFactory, capabilityTester = testConfiguration, seed } = {}) {
    this.db = db; this.root = root; this.clock = clock; this.privateDir = path.join(root, ".private");
    this.workerFactory = workerFactory || (data => new Worker(path.join(__dirname, "worker.js"), { workerData: data }));
    this.capabilityTester = capabilityTester;
    migrate(db);
    const bootstrapFile = path.join(root, "data", "menu-bootstrap.json");
    if (seed) bootstrap(db, seed);
    else if (fs.existsSync(bootstrapFile)) bootstrap(db, JSON.parse(fs.readFileSync(bootstrapFile, "utf8")));
    this.config = new MenuConfig(db, this.privateDir, clock);
    this.manual = new ManualMenus(this);
    this.active = null; this.testing = false; this.closed = false;
    this.recoverExpired();
  }
  recoverExpired() {
    const lease = this.db.prepare("SELECT * FROM menu_sync_lease WHERE id=1").get();
    if (lease && lease.expires_at <= this.clock()) {
      this.db.prepare("UPDATE menu_sync_jobs SET status='interrupted',phase='done',finished_at=?,error='服务退出或任务租约失效，未完成菜单未发布' WHERE id=? AND status='running'").run(this.clock(), lease.owner);
      this.db.prepare("UPDATE menu_sources SET last_error='任务中断，待重新同步' WHERE id IN (SELECT source_id FROM menu_job_items WHERE job_id=? AND status='running')").run(lease.owner);
      this.db.prepare("UPDATE menu_job_items SET status='interrupted',error='任务中断，未完成菜单未发布' WHERE job_id=? AND status='running'").run(lease.owner);
      this.db.prepare("DELETE FROM menu_sync_lease WHERE owner=?").run(lease.owner);
    }
  }
  settings() {
    const settings = this.config.public();
    return { ...settings, next_run_at: nextRun(settings, lastAutoDay(this.db), this.clock()), active_job_id: this.active?.id || this.db.prepare("SELECT owner FROM menu_sync_lease WHERE expires_at>?").get(this.clock())?.owner || null };
  }
  saveSettings(body) {
    const settings = this.config.save(body);
    if (body.clear_api_key) {
      this.testController?.abort();
      const running = this.active?.id || this.db.prepare("SELECT owner FROM menu_sync_lease WHERE expires_at>?").get(this.clock())?.owner;
      if (running) this.cancel(running);
    }
    // tick reads the persisted schedule, so no old per-time timer can survive edits.
    return { ...settings, next_run_at: nextRun(settings, lastAutoDay(this.db), this.clock()) };
  }
  async testSettings() {
    if (this.testing) throw new MenuError("模型配置正在测试，请稍候", 409);
    const snapshot = this.config.snapshot(), expected = fingerprint(snapshot);
    this.testing = true;
    this.testController = new AbortController();
    try {
      const result = await this.capabilityTester(snapshot, { signal: this.testController.signal });
      this.config.recordTest(expected, result);
      return { ...result, settings: this.settings() };
    } catch (error) {
      const message = cleanError(error, [snapshot.api_key]);
      if (fingerprint(this.config.raw()) === expected) this.config.recordTest(expected, { ok: false, message });
      throw error instanceof MenuError && error.status === 409 ? error : new MenuError(message, 422, "capability_test_failed");
    } finally { this.testing = false; this.testController = null; }
  }
  jobs() {
    return this.db.prepare("SELECT * FROM menu_sync_jobs ORDER BY created_at DESC,id DESC LIMIT 50").all();
  }
  job(id) {
    const job = this.db.prepare("SELECT * FROM menu_sync_jobs WHERE id=?").get(id);
    if (!job) throw new MenuError("菜单任务不存在", 404);
    const items = this.db.prepare("SELECT * FROM menu_job_items WHERE job_id=? ORDER BY article_id DESC").all(id);
    return { ...job, items };
  }
  sources() { return this.db.prepare("SELECT * FROM menu_sources WHERE kind='school' ORDER BY article_id DESC").all(); }
  owns(id) {
    const lease = this.db.prepare("SELECT * FROM menu_sync_lease WHERE id=1").get();
    return !!lease && lease.owner === id && lease.expires_at > this.clock() && !this.db.prepare("SELECT cancel_requested FROM menu_sync_jobs WHERE id=?").get(id)?.cancel_requested;
  }
  async enqueue({ trigger = "manual", autoDay = null, sourceIds = null, files = null, force = false } = {}) {
    if (this.closed) throw new MenuError("网站正在关闭", 503);
    const settings = this.settings();
    if (!settings.model_tested || settings.key_unavailable) throw new MenuError("请先保存并通过模型配置测试");
    const config = this.config.snapshot();
    if (trigger === "automatic" && !settings.enabled) throw new MenuError("自动同步未开启", 409);
    const sources = this.sources();
    if (sourceIds && (!Array.isArray(sourceIds) || !sourceIds.length || sourceIds.some(id => !sources.some(source => source.id === id)))) throw new MenuError("指定菜单来源不存在", 404);
    if (files?.length && sourceIds?.length !== 1) throw new MenuError("补充图片时必须指定一篇菜单");
    if (files?.length > 6) throw new MenuError("一次最多补充六张菜单图片");
    const id = crypto.randomUUID();
    // Normalize before acquiring the job lease; a bad image cannot leave a job running.
    const normalized = [];
    for (const file of files || []) normalized.push((await normalizeImage(file.buffer)).data);
    const current = this.settings();
    if (!current.model_tested || current.key_unavailable || fingerprint(this.config.raw()) !== fingerprint(config)) throw new MenuError("模型配置在准备任务期间发生变化，请重新启动任务", 409);
    if (trigger === "automatic" && !current.enabled) throw new MenuError("自动同步已关闭", 409);
    const now = this.clock();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const lease = this.db.prepare("SELECT * FROM menu_sync_lease WHERE id=1").get();
      if (lease && lease.expires_at > now) throw new MenuError("已有菜单同步任务正在运行", 409, "menu_job_busy");
      this.recoverExpired();
      if (autoDay && this.db.prepare("SELECT id FROM menu_sync_jobs WHERE auto_day=?").get(autoDay)) throw new MenuError("今天的自动同步已经触发", 409);
      this.db.prepare(`INSERT INTO menu_sync_jobs (id,trigger,auto_day,status,phase,created_at,started_at,config_revision,provider,model) VALUES (?,?,?,'running','queued',?,?,?,?,?)`).run(id, trigger, autoDay, now, now, config.revision, config.provider, config.model);
      this.db.prepare("INSERT INTO menu_sync_lease (id,owner,expires_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at").run(id, now + 120000);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    let worker;
    try {
      const replacements = {};
      if (normalized.length) {
        const source = sources.find(source => source.id === sourceIds[0]), sourceDir = path.join(this.privateDir, "menu-sources", String(source.article_id));
        fs.mkdirSync(sourceDir, { recursive: true, mode: 0o700 });
        replacements[source.id] = normalized.map((buffer, index) => {
          const file = path.join(sourceDir, `upload-${id}-${index}.png`); fs.writeFileSync(file, buffer, { mode: 0o600 }); return file;
        });
      }
      const anchor = this.db.prepare("SELECT value FROM menu_sync_state WHERE key='discovery_anchor'").get()?.value || "";
      worker = this.workerFactory({ jobId: id, privateDir: this.privateDir, config, sources, anchor, sourceIds, replacements, force });
      const active = this.active = { id, worker, cancelled: false, settled: false, key: config.api_key };
      active.heartbeat = setInterval(() => {
        try {
          if (this.db.prepare("SELECT cancel_requested FROM menu_sync_jobs WHERE id=?").get(id)?.cancel_requested) this.cancel(id);
          else if (this.owns(id)) this.db.prepare("UPDATE menu_sync_lease SET expires_at=? WHERE owner=?").run(this.clock() + 120000, id);
          else {
            active.cancelled = true; worker.postMessage({ type: "cancel" });
            if (!active.cancelTimer) {
              active.cancelTimer = setTimeout(() => { worker.terminate(); this.finish(active, "interrupted", "任务租约失效，未完成菜单未发布"); }, 2000);
              active.cancelTimer.unref();
            }
          }
        } catch { worker.postMessage({ type: "cancel" }); }
      }, 30000);
      active.heartbeat.unref();
      worker.on("message", message => this.handleMessage(active, message));
      worker.on("error", error => this.finish(active, "failed", cleanError(error, [config.api_key])));
      worker.on("exit", () => { if (!active.settled) this.finish(active, active.cancelled ? "cancelled" : "interrupted", "任务进程退出，未完成菜单未发布"); });
      return this.job(id);
    } catch (error) {
      this.db.prepare("UPDATE menu_sync_jobs SET status='failed',phase='done',finished_at=?,error=? WHERE id=?").run(this.clock(), cleanError(error, [config.api_key]), id);
      this.db.prepare("DELETE FROM menu_sync_lease WHERE owner=?").run(id);
      throw error;
    }
  }
  handleMessage(active, message) {
    if (active.settled) return;
    const ack = (ok, error) => { if (message.request_id) active.worker.postMessage({ type: "ack", request_id: message.request_id, ok, error }); };
    try {
      if (active.cancelled || !this.owns(active.id)) { ack(false, "任务已停止或租约失效"); return; }
      if (message.type === "discovery") {
        this.db.exec("BEGIN IMMEDIATE");
        try {
          for (const ref of message.refs) touchSource(this.db, ref, this.clock());
          if (message.anchor) this.db.prepare("INSERT INTO menu_sync_state (key,value) VALUES ('discovery_anchor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(message.anchor));
          this.db.exec("COMMIT");
        } catch (error) { this.db.exec("ROLLBACK"); throw error; }
        ack(true);
      } else if (message.type === "publish") {
        publishSource(this.db, message.source, message.records, { now: this.clock() }); ack(true);
      } else if (message.type === "item") {
        if (!Number.isSafeInteger(message.article_id) || sourceId(message.article_id) !== message.source_id) throw new MenuError("任务来源格式无效");
        touchSource(this.db, { article_id: message.article_id, title: message.title }, this.clock());
        this.db.prepare(`INSERT INTO menu_job_items (job_id,source_id,article_id,title,status,phase,records_count,error,artifact_path) VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT(job_id,source_id) DO UPDATE SET title=excluded.title,status=excluded.status,phase=excluded.phase,records_count=excluded.records_count,error=excluded.error,artifact_path=excluded.artifact_path`).run(active.id, message.source_id, message.article_id, message.title, message.status, message.phase, message.records_count || 0, message.error || "", message.artifact_path || null);
        this.db.prepare("UPDATE menu_sources SET last_error=? WHERE id=?").run(message.status === "failed" ? message.error : "", message.source_id);
      } else if (message.type === "progress") {
        this.db.prepare("UPDATE menu_job_items SET phase=? WHERE job_id=? AND source_id=?").run(message.phase, active.id, message.source_id);
        this.db.prepare("UPDATE menu_sync_jobs SET phase=? WHERE id=?").run(message.phase, active.id);
      } else if (message.type === "phase") {
        this.db.prepare("UPDATE menu_sync_jobs SET phase=?,total=COALESCE(?,total),processed=COALESCE(?,processed),succeeded=COALESCE(?,succeeded),failed=COALESCE(?,failed) WHERE id=?").run(message.phase, message.total ?? null, message.processed ?? null, message.succeeded ?? null, message.failed ?? null, active.id);
      } else if (message.type === "done") {
        const result = message.result;
        this.db.prepare("UPDATE menu_sync_jobs SET total=?,processed=?,succeeded=?,failed=? WHERE id=?").run(result.total, result.processed, result.succeeded, result.failed, active.id);
        writeJson(path.join(this.privateDir, "menu-jobs", active.id, "summary.json"), result);
        this.finish(active, result.status, result.failed ? "部分菜单未通过识别或校验，请查看逐篇结果" : "");
      } else if (message.type === "fatal") this.finish(active, message.cancelled ? "cancelled" : "failed", message.error);
    } catch (error) {
      ack(false, cleanError(error, [active.key]));
      this.finish(active, "failed", cleanError(error, [active.key])); active.worker.terminate();
    }
  }
  finish(active, status, error = "") {
    if (active.settled) return;
    active.settled = true; clearInterval(active.heartbeat); clearTimeout(active.cancelTimer);
    this.db.prepare("UPDATE menu_sync_jobs SET status=?,phase='done',finished_at=?,error=? WHERE id=? AND status='running'").run(status, this.clock(), error, active.id);
    this.db.prepare("UPDATE menu_sources SET last_error=? WHERE id IN (SELECT source_id FROM menu_job_items WHERE job_id=? AND status='running')").run(error || "任务已结束，该篇未发布", active.id);
    this.db.prepare("UPDATE menu_job_items SET status=?,error=? WHERE job_id=? AND status='running'").run(status === "cancelled" ? "cancelled" : "interrupted", error || "任务已结束，该篇未发布", active.id);
    this.db.prepare("DELETE FROM menu_sync_lease WHERE owner=?").run(active.id);
    if (this.active === active) this.active = null;
    active.key = "";
  }
  cancel(id) {
    const job = this.job(id);
    if (TERMINAL.includes(job.status)) throw new MenuError("任务已经结束", 409);
    this.db.prepare("UPDATE menu_sync_jobs SET cancel_requested=1 WHERE id=?").run(id);
    if (this.active?.id === id && !this.active.cancelled) {
      const active = this.active; active.cancelled = true; active.worker.postMessage({ type: "cancel" });
      active.cancelTimer = setTimeout(() => { active.worker.terminate(); this.finish(active, "cancelled", "developer 已停止任务，未完成菜单未发布"); }, 2000);
      active.cancelTimer.unref();
    }
    return this.job(id);
  }
  retry(id) {
    const job = this.job(id);
    if (!TERMINAL.includes(job.status)) throw new MenuError("任务仍在运行，不能重试", 409);
    const sourceIds = job.items.filter(item => ["failed", "cancelled", "interrupted"].includes(item.status)).map(item => item.source_id);
    if (!sourceIds.length && job.status === "succeeded") throw new MenuError("该任务没有失败菜单可重试", 409);
    return this.enqueue({ sourceIds: sourceIds.length ? sourceIds : null, force: true });
  }
  artifact(id, sourceIdValue, kind) {
    const job = this.job(id), item = job.items.find(item => item.source_id === sourceIdValue);
    if (!item) throw new MenuError("任务菜单不存在", 404);
    const names = { menu: "menu.json", diagnostic: "diagnostic.json", source: "source.json" };
    if (/^image-\d+$/.test(kind) && Number(kind.slice(6)) < 12) names[kind] = kind + ".png";
    if (!names[kind]) throw new MenuError("资料类型无效", 404);
    const file = path.join(this.privateDir, "menu-jobs", id, String(item.article_id), names[kind]);
    if (!fs.existsSync(file)) throw new MenuError("该任务尚未生成此资料", 404);
    return file;
  }
  async tick() {
    if (this.closed) return;
    try {
      this.recoverExpired();
      const config = this.settings(), due = dueOccurrence(config, lastAutoDay(this.db), this.clock());
      if (due) await this.enqueue({ trigger: "automatic", autoDay: due.day });
    } catch (error) {
      if (error.status !== 409) console.error("[menu-sync]", cleanError(error));
    }
  }
  start() {
    this.tick(); this.timer = setInterval(() => this.tick(), 15000); this.timer.unref();
  }
  async close() {
    this.closed = true; clearInterval(this.timer); this.testController?.abort();
    if (this.active) { const active = this.active; active.cancelled = true; await active.worker.terminate(); this.finish(active, "interrupted", "网站关闭，未完成菜单未发布"); }
  }
}
module.exports = { MenuService, TERMINAL };
