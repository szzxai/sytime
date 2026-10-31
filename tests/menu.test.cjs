"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { EventEmitter } = require("node:events");
const { DatabaseSync } = require("./helpers/database.cjs");
const { Hono } = require("hono");
const { serve } = require("@hono/node-server");
const sharp = require("sharp");
const { MenuConfig, fingerprint } = require("../apps/api/src/domain/menu/config");
const { dueOccurrence, nextRun, validateTime, localDay } = require("../apps/api/src/domain/menu/schedule");
const { migrate, bootstrap, catalog, publishSource, sourceId } = require("../apps/api/src/domain/menu/store");
const { MenuError, nameFields, validateRecords, sha256 } = require("../apps/api/src/domain/menu/schema");
const { parseArticle, parseList, checkSchoolUrl, parseRobots, robotsAllows, SchoolSource } = require("../apps/api/src/domain/menu/source");
const { ModelClient, EXTRACTION_SCHEMA, testConfiguration } = require("../apps/api/src/domain/menu/provider");
const { extractImage, normalizeImage, structuralTables } = require("../apps/api/src/domain/menu/images");
const { MenuService } = require("../apps/api/src/domain/menu/service");
const { mountMenuRoutes } = require("../apps/api/src/domain/menu/routes");
const { runMenuJob } = require("../apps/api/src/domain/menu/worker");
const record = (name = "免费汤", price = 0) => ({date: "2026-10-01", weekday: "周四", time: ["noon"], place: "西区", group: "例汤", name, price, spicy: null});
const source = id => ({article_id: id, title: "每周菜单", published_date: "2026-09-30", content_hash: sha256(String(id))});
const at = value => Date.parse(value + "+08:00");
function fixture(t) {
  const keys=['MENU_PROVIDER','MENU_MODEL','MENU_API_KEY','GEMINI_API_KEY','MENU_SYNC_MODE','MENU_SYNC_TIME','MENU_SYNC_ENABLED'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));for(const k of keys)delete process.env[k];t.after(()=>{for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];});
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "szzx-menu-test-")), db = new DatabaseSync(path.join(root, "data.db"));
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT,status TEXT)");
  migrate(db);
  t.after(() => { db.close(); assert.equal(path.dirname(fs.realpathSync(root)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase()); fs.rmSync(root, {recursive: true, force: true}); });
  return {root, db};
}
class FakeWorker extends EventEmitter {
  constructor(input) { super(); this.input = input; this.messages = []; }
  postMessage(message) { this.messages.push(message); }
  async terminate() { this.emit("exit", 0); }
}
function configure(_service) {
  Object.assign(process.env,{MENU_PROVIDER:'openrouter',MENU_MODEL:'vision-test',MENU_API_KEY:'test-only-key',MENU_SYNC_MODE:'daily',MENU_SYNC_TIME:'08:00',MENU_SYNC_ENABLED:'false'});
}
test('weekend schedule uses Shanghai slots, catches up once and retries in the next slot', () => {
  const config={enabled:true,schedule_mode:'weekend',schedule_effective_at:at('2026-10-23T12:00:00')};
  assert.equal(dueOccurrence(config,null,at('2026-10-24T07:59:00')),null);
  const first=dueOccurrence(config,null,at('2026-10-24T08:00:00'));
  assert.equal(first.day,'2026-10-24T08:00');
  assert.equal(dueOccurrence(config,first.day,at('2026-10-24T08:45:00')),null);
  assert.equal(dueOccurrence(config,first.day,at('2026-10-24T09:00:00')).day,'2026-10-24T09:00');
  assert.equal(dueOccurrence(config,first.day,at('2026-10-25T23:00:00')).day,'2026-10-25T22:00');
  assert.equal(nextRun(config,'2026-10-25T22:00',at('2026-10-25T23:00:00')),'2026-10-26T00:00:00.000Z');
  assert.equal(nextRun(config,'2026-10-26T12:00',at('2026-10-26T13:00:00')),'2026-10-31T00:00:00.000Z');
  assert.equal(dueOccurrence({...config,enabled:false},null,at('2026-10-24T09:00:00')),null);
});
test('fresh menu service never resurrects retired test menus', async t => {
  const {root,db}=fixture(t), service=new MenuService(db,root);
  assert.equal(catalog(db).dishes.length,0);
  assert.equal(service.settings().provider,'gemini');
  assert.equal(service.settings().schedule_mode,'weekend');
  await service.close();
});
test('Gemini structured output validates, caches, normalizes boxes and redacts SDK credentials', async t => {
  const {GeminiClient}=require('../apps/api/src/domain/menu/gemini');
  const {root}=fixture(t);
  let calls=0;
  const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
  const client={models:{async generateContent(input) {
    calls++; assert.equal(input.config.responseMimeType,'application/json');
    return {text:calls===1?'malformed':JSON.stringify({ok:true}),candidates:[{finishReason:'STOP'}]};
  }}};
  const model=new GeminiClient({model:'fake',api_key:'secret'}, {client,cacheDir:path.join(root,'cache')});
  const request={name:'probe',schema,prompt:'Read data',images:[{data:Buffer.from('image')}]};
  assert.deepEqual(await model.request(request),{ok:true});
  assert.deepEqual(await model.request(request),{ok:true});
  assert.equal(calls,2); assert.equal(model.stats.cache_hits,1);
  const bad=new GeminiClient({model:'fake',api_key:'secret'}, {client:{models:{async generateContent(){throw Object.assign(new Error('secret'),{status:403});}}}});
  await assert.rejects(bad.request(request),e=>!e.message.includes('secret')&&e.code==='model_http');
  const budget=new GeminiClient({model:'fake'}, {client,maxRequests:0});
  await assert.rejects(budget.request(request),e=>e.code==='model_budget');
});
test('weekly public data joins star ratings and replaces a source without losing dish reviews', t => {
  const {db}=fixture(t);
  db.exec('CREATE TABLE recipes(id INTEGER PRIMARY KEY,dish_id INTEGER,rating INTEGER,is_weekly INTEGER DEFAULT 0)');
  const {weeklyMenu}=require('../apps/api/src/domain/menu/public');
  assert.equal(weeklyMenu(db).week,null);
  const s=source(11427);publishSource(db,s,[record('面条',12)]);
  const id=catalog(db).dishes[0].id;
  db.prepare('INSERT INTO recipes(dish_id,rating) VALUES (?,5),(?,3)').run(id,id);
  let menu=weeklyMenu(db);
  assert.equal(menu.records[0].rating_avg,4);assert.equal(menu.records[0].reviews_count,2);
  publishSource(db,{...s,content_hash:sha256('updated')},[record('面条',13)]);
  menu=weeklyMenu(db);
  assert.equal(menu.records.length,1);assert.equal(menu.records[0].price,13);
  assert.equal(menu.records[0].dish_id,id);assert.equal(menu.records[0].reviews_count,2);
  assert.throws(()=>weeklyMenu(db,'missing'),e=>e.status===404);
});
test('Gemini extraction repairs rejected tables and never accepts a failed completeness audit', async () => {
  const {extractGeminiImage,parsePrice}=require('../apps/api/src/domain/menu/extract');
  assert.equal(parsePrice('15元/12个'),15);
  assert.equal(parsePrice('6元/小份'),6);
  assert.equal(parsePrice('1元/1.5元'),null);
  assert.equal(parsePrice('免费'),0);assert.equal(parsePrice(null),null);
  const image=await normalizeImage(await sharp({create:{width:200,height:200,channels:3,background:'white'}}).png().toBuffer());
  let audits=0,attempts=0;
  const model={async request(request) {
    if(request.name==='menu_layout') return {complete:true,problems:[],tables:[{bbox:[0,0,1000,1000]}]};
    if(request.name.startsWith('menu_table_review')) {audits++;return {problems:[],groups:[{date:'2026-10-26',time:['noon'],places:['希文楼'],group:'面档',items:[{name:'鲜肉大馄饨',price_text:'15元/12个',spicy:true}]}]};}
    attempts++;
    return {complete:true,issues:[],groups:[{date:'2026-10-26',time:['noon'],places:['希文楼'],group:'面档',
      items:[{name:'鲜肉大馄饨',price_text:'15元/12个',spicy:false}]}]};
  }};
  const result=await extractGeminiImage(image,source(11427),model);
  assert.equal(attempts,1);assert.equal(audits,2);assert.equal(result.records[0].price,15);assert.equal(result.records[0].spicy,true);
  const rejecting={async request(request){
    if(request.name.startsWith('menu_table_review'))return {complete:false,problems:['原图未覆盖']};
    return model.request(request);
  }};
  await assert.rejects(extractGeminiImage(image,source(11427),rejecting),e=>e.menu_diagnostic.partial_records.length===0);
});
test("Shanghai daily schedule: midnight, edits, once per day and downtime catch-up", () => {
  const config = {enabled: true, daily_time: "08:00", schedule_effective_at: at("2026-09-29T12:00:00")};
  assert.equal(localDay(Date.parse("2026-09-30T16:01:00Z")), "2026-10-01");
  assert.equal(dueOccurrence(config, "2026-09-29", at("2026-10-01T07:00:00")).day, "2026-09-30");
  assert.equal(dueOccurrence(config, "2026-10-01", at("2026-10-01T18:00:00")), null);
  assert.equal(dueOccurrence(config, "2026-09-29", at("2026-10-01T09:00:00")).day, "2026-10-01");
  const changed = {...config, daily_time: "06:00", schedule_effective_at: at("2026-10-01T10:00:00")};
  assert.equal(dueOccurrence(changed, null, at("2026-10-01T10:00:00")), null);
  assert.equal(nextRun(changed, null, at("2026-10-01T10:00:00")), "2026-10-01T22:00:00.000Z");
  assert.equal(nextRun({...changed, daily_time: "18:00"}, null, at("2026-10-01T10:00:00")), "2026-10-01T10:00:00.000Z");
  assert.equal(nextRun({...changed, daily_time: "18:00"}, "2026-10-01", at("2026-10-01T10:00:00")), "2026-10-02T10:00:00.000Z");
  assert.equal(dueOccurrence({...config, enabled: false}, null, at("2026-10-01T10:00:00")), null);
  assert.throws(() => validateTime("24:00")); assert.throws(() => validateTime("8:00"));
});
test('environment menu config is private, validates endpoints and cannot be changed through save',t=>{
 const {root,db}=fixture(t),config=new MenuConfig(db,path.join(root,'.private'));configure();
 assert.equal(config.snapshot().api_key,'test-only-key');assert.ok(!JSON.stringify(config.raw()).includes('test-only-key'));assert.ok(!JSON.stringify(config.public()).includes('test-only-key'));
 assert.throws(()=>config.save({api_key:'web-key'}),e=>e.status===403);
 process.env.MENU_PROVIDER='compatible';process.env.MENU_BASE_URL='http://localhost/v1';assert.throws(()=>config.raw(),/HTTPS/);delete process.env.MENU_BASE_URL;
});
test("historical seed is idempotent, preserves live data and uses stable pinyin IDs", t => {
  const {db} = fixture(t), seed = require("../data/menu-bootstrap.json");
  bootstrap(db, seed); const first = catalog(db);
  assert.equal(first.dishes.length, 1243); assert.equal(first.meta.records_count, 5874);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM menu_records WHERE spicy IS NOT NULL").get().n, 0);
  bootstrap(db, seed); assert.deepEqual(catalog(db), first);
  const s = source(seed.sources[0].article_id), dish = first.dishes[0];
  publishSource(db, s, [record(dish.name), record("重庆小面", null), record("#特色套餐+汤", 10)]);
  assert.equal(catalog(db).dishes.find(x => x.name === dish.name).id, dish.id);
  assert.equal(nameFields("重庆小面").initial, "C"); assert.equal(nameFields("长寿面").initial, "C");
  assert.equal(catalog(db).dishes.at(-1).name, "#特色套餐+汤");
  bootstrap(db, seed); assert.equal(db.prepare("SELECT records_count FROM menu_sources WHERE id=?").get(sourceId(s.article_id)).records_count, 3);
});
test("article transaction rolls back on SQL failure; free/null and distinct supplies survive", t => {
  const {db} = fixture(t), s = source(2);
  publishSource(db, s, [record("汤", 0), {...record("汤", null), place: "东区"}]);
  const old = db.prepare("SELECT * FROM menu_records").all(), oldDish = catalog(db).dishes[0];
  db.exec("CREATE TRIGGER forced_failure BEFORE INSERT ON menu_records WHEN NEW.price=999 BEGIN SELECT RAISE(ABORT,'forced'); END");
  assert.throws(() => publishSource(db, {...s, content_hash: sha256("changed")}, [record("新菜", 999)]));
  assert.deepEqual(db.prepare("SELECT * FROM menu_records").all(), old);
  assert.equal(catalog(db).dishes[0].id, oldDish.id);
  assert.equal(catalog(db).dishes.length, 1);
  assert.throws(() => validateRecords([{...record(), date: "2026-02-30"}]));
  assert.throws(() => validateRecords([{...record(), weekday: "周一"}]));
  assert.equal(validateRecords([record(), record()]).length, 1);
  assert.throws(() => validateRecords([{...record(), unexpected: true}]));
});
test("school parser guards origin, robots, lazy inline images and paging backlog", async t => {
  const png = await sharp({create: {width: 40, height: 40, channels: 3, background: "white"}}).png().toBuffer();
  const html = '<div class="titlebox"><h1>菜单</h1><span>2026-09-30</span></div><div id="newstext"><img src="https://evil.test/p.png" data-src="data:image/png;base64,' + png.toString("base64") + '"/><img data-original="data:image/png;base64,' + png.toString("base64") + '"/></div>';
  assert.equal(parseArticle(html, 4).images.length, 1);
  assert.throws(() => checkSchoolUrl("https://evil.test/e/action/ShowInfo.php?classid=36&id=1"));
  assert.throws(() => checkSchoolUrl("/e/action/ShowInfo.php?classid=34&id=1"));
  const robots = parseRobots("User-agent: *\nDisallow: /e/\nAllow: /e/action/ShowInfo.php\n");
  assert.equal(robotsAllows(robots, checkSchoolUrl("/e/action/ShowInfo.php?classid=36&id=4")), true);
  assert.equal(robotsAllows(robots, checkSchoolUrl("/e/action/ListInfo/?classid=36")), false);
  assert.throws(() => parseList("<html><title>unknown</title></html>"));
  function listing(ids) { return '<ul class="listsbox">' + ids.map(id => '<li><a href="/e/action/ShowInfo.php?classid=36&id=' + id + '">菜单 ' + id + '</a></li>').join("") + '</ul>'; }
  const school = new SchoolSource({fetchImpl: async url => new Response(url.endsWith("robots.txt") ? "User-agent: *\nAllow: /" : new URL(url).searchParams.has("page") ? listing([5,4,3]) : listing(Array.from({length: 15}, (_, i) => 20-i)), {headers: {"content-type": "text/html;charset=utf-8"}})});
  const found = await school.discover(4); assert.equal(found.fresh.length, 16); assert.equal(found.anchor, 20);
  const refused = new SchoolSource({fetchImpl: async () => new Response("", {status: 302, headers: {location: "https://evil.test"}})});
  await assert.rejects(() => refused.article(4), /robots/);
});
test("provider strict JSON/images: retry, repair, truncation and cache isolation", async t => {
  const {root} = fixture(t), config = {provider: "openrouter", base_url: "https://test.invalid/v1", model: "v1", api_key: "test-key"}, requests = [];
  const schema = {type: "object", properties: {ok: {type: "boolean"}}, required: ["ok"], additionalProperties: false};
  let count = 0;
  const fetchImpl = async (_url, options) => { requests.push(JSON.parse(options.body)); count++; return new Response(JSON.stringify({choices: [{finish_reason: "stop", message: {content: count === 1 ? "invalid" : '{"ok":true}'}}]})); };
  const call = {name: "probe", schema, prompt: "read", images: [{data: Buffer.from("img"), label: "block"}]};
  const client = new ModelClient(config, {fetchImpl, cacheDir: root}); assert.equal((await client.request(call)).ok, true); assert.equal(count, 2);
  assert.equal(requests[0].response_format.json_schema.strict, true); assert.equal(requests[0].messages[0].content[2].type, "image_url");
  await client.request(call); assert.equal(count, 2);
  const changed = new ModelClient({...config, model: "v2"}, {fetchImpl, cacheDir: root}); await changed.request(call); assert.equal(count, 3);
  const truncated = new ModelClient(config, {fetchImpl: async () => new Response(JSON.stringify({choices: [{finish_reason: "length"}]}))});
  await assert.rejects(() => truncated.request(call), error => error.code === "output_truncated");
  const auth = new ModelClient(config, {fetchImpl: async () => new Response("test-key", {status: 401})});
  await assert.rejects(() => auth.request(call), error => error.code === "model_http" && !error.message.includes("test-key"));
  const bad = new ModelClient(config, {maxRequests: 1, fetchImpl: async () => new Response("{}")});
  await assert.rejects(() => bad.request(call), error => error.code === "model_budget");
  let transientCalls = 0;
  const transient = new ModelClient(config, {fetchImpl: async () => ++transientCalls === 1 ? new Response("", {status: 503}) : new Response(JSON.stringify({choices: [{message: {content: '{"ok":true}'}}]}))});
  await transient.request(call); assert.equal(transientCalls, 2);
  const probe = await testConfiguration(config, {probeFactory: async () => ({marker: "RANDOM_IMG_ONLY", image: Buffer.from("image")}), fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body); assert.ok(!JSON.stringify(body.response_format).includes("uniqueItems")); assert.ok(!body.messages[0].content[0].text.includes("RANDOM_IMG_ONLY"));
    return new Response(JSON.stringify({choices: [{message: {content: JSON.stringify({complete: true, unreadable: [], records: [{...record("RANDOM_IMG_ONLY"), spicy: false, cell_bbox: [0,0,1000,1000]}]})}}]}));
  }}); assert.equal(probe.ok, true);
});
test("block extraction overlap deduplicates, keeps evidence and refuses failed coverage", async () => {
  const image = await normalizeImage(await sharp({create: {width: 600, height: 900, channels: 3, background: "white"}}).png().toBuffer());
  function model(failAudit = false) { return {request: async req => {
    if (req.name === "menu_coverage_audit") assert.equal(JSON.parse(req.prompt.split("\n候选供应记录：")[1]).length, 1, "overlap must be deduplicated before audit");
    const result = req.name === "menu_layout" ? {complete: true, problems: [], tables: [{id: "a", bbox: [0,0,1000,1000], header_bbox: [0,0,1000,100], context_text: "2026-10-01 午餐"}]} : req.name === "menu_coverage_audit" ? {complete: !failAudit, problems: failAudit ? ["底部漏行"] : []} : {complete: true, unreadable: [], records: [{...record(), cell_bbox: [10,10,500,100]}]};
    req.validateResult(result); return result;
  }}; }
  const result = await extractImage(image, source(1), model()); assert.equal(result.records.length, 1); assert.equal(result.evidence.length, 1); assert.ok(result.blocks.length > 1);
  await assert.rejects(() => extractImage(image, source(1), model(true)), error => error.message.includes("底部漏行") && error.menu_diagnostic.blocks.length > 1);
});
test("pixel table boundaries recover title/header rows from approximate model boxes", async () => {
  const lines = [];
  for (const top of [0,320]) {
    for (const y of [top,top+50,top+100,top+150,top+200,top+250,top+300]) lines.push(`<path d="M0 ${y}H600"/>`);
    for (const x of [0,150,300,450,600]) lines.push(`<path d="M${x} ${x===0||x===600?top:top+50}V${top+300}"/>`);
    lines.push(`<text x="220" y="${top+33}">TABLE TITLE</text>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="625"><rect width="600" height="625" fill="white"/><g fill="black" stroke="black" stroke-width="2" font-size="22">${lines.join("")}</g></svg>`;
  const image = await normalizeImage(await sharp(Buffer.from(svg)).png().toBuffer());
  const tables = await structuralTables(image); assert.equal(tables.length, 2);
  assert.ok(tables[0].box.top < 5); assert.ok(Math.abs(tables[1].box.top-320) < 6); assert.ok(tables[0].header.height >= 100);
});
test("worker refuses incomplete multi-image articles and reuses unchanged content without a model", async t => {
  const {root} = fixture(t), png = await sharp({create: {width: 40, height: 40, channels: 3, background: "white"}}).png().toBuffer();
  const html = '<h1>菜单</h1><div id="newstext"><img src="data:image/png;base64,' + png.toString("base64") + '"/></div>', events = [];
  const input = {jobId: "test-job", privateDir: root, config: {api_key: "test-only"}, sources: [{...source(1), id: sourceId(1)}], sourceIds: [sourceId(1)]};
  const fetchImpl = async url => new Response(url.endsWith("robots.txt") ? "User-agent: *\nAllow: /" : html, {headers: {"content-type": "text/html"}});
  const failed = await runMenuJob(input, {fetchImpl, emit: async e => events.push(e), extractor: async () => {throw new MenuError("无法确认餐次");}});
  assert.equal(failed.failed, 1); assert.equal(events.some(x => x.type === "publish"), false);
  const unchanged = await runMenuJob({...input, sources: [{...input.sources[0], content_hash: parseArticle(html,1).content_hash}]}, {fetchImpl, emit: async e => events.push(e), extractor: () => { throw new Error("Must not call model"); }});
  assert.equal(unchanged.failed, 0); assert.ok(fs.existsSync(path.join(root, "menu-jobs/test-job/1/image-0.png")));
  const other = await sharp({create: {width: 40, height: 40, channels: 3, background: "red"}}).png().toBuffer();
  const doubleHtml = html.replace("</div>", '<img src="data:image/png;base64,' + other.toString("base64") + '"/></div>');
  let calls = 0; const multiEvents = [];
  const multi = await runMenuJob({...input, force: true}, {fetchImpl: async url => new Response(url.endsWith("robots.txt") ? "User-agent: *\nAllow: /" : doubleHtml, {headers: {"content-type": "text/html"}}), emit: async e => multiEvents.push(e), extractor: async () => {
    if (++calls === 2) throw new MenuError("第二张图片无法确认"); return {records: [record()], evidence: [], layout: {}, blocks: []};
  }});
  assert.equal(calls, 2); assert.equal(multi.failed, 1); assert.equal(multiEvents.some(e => e.type === "publish"), false);
});
test('environment key changes while preparing a job prevent stale publication',async t=>{
 const {root,db}=fixture(t),service=new MenuService(db,root);t.after(()=>service.close());configure();publishSource(db,source(1),[record()]);
 const png=await sharp({create:{width:40,height:40,channels:3,background:'white'}}).png().toBuffer();
 const preparing=service.enqueue({sourceIds:[sourceId(1)],files:[{buffer:png}]});delete process.env.MENU_API_KEY;await assert.rejects(preparing,e=>e.status===409);assert.equal(service.jobs().length,0);
});
test("service lease prevents overlap; time changes preserve running snapshot; cancelled work cannot publish", async t => {
  const {root, db} = fixture(t); let now = at("2026-10-01T07:00:00"), workers = [];
  const service = new MenuService(db, root, {clock: () => now, workerFactory: input => { const w = new FakeWorker(input); workers.push(w); return w; }});
  t.after(() => service.close()); configure(service); publishSource(db, source(1), [record()]);
  const job = await service.enqueue({sourceIds: [sourceId(1)]});
  await assert.rejects(() => service.enqueue(), error => error.status === 409);
  process.env.MENU_SYNC_TIME='09:30'; assert.equal(service.settings().model_tested, true); assert.equal(workers[0].input.config.daily_time, "08:00");
  workers[0].emit("message", {type: "item", article_id: 1, source_id: sourceId(1), title: "菜单", status: "running", phase: "recognize"});
  service.cancel(job.id);
  workers[0].emit("message", {type: "publish", request_id: 1, source: {...source(1), content_hash: sha256("updated")}, records: [record("不应发布")]});
  assert.equal(workers[0].messages.at(-1).ok, false); assert.equal(catalog(db).dishes.length, 1);
  await workers[0].terminate(); assert.equal(service.job(job.id).status, "cancelled");
  assert.ok(service.sources()[0].last_error, "cancelled old article remains in durable pending queue");
  now = at("2026-10-01T10:00:00"); process.env.MENU_SYNC_ENABLED='true';
  now = at("2026-10-02T10:00:00"); await service.tick(); assert.equal(workers.length, 2);
  workers[1].emit("message", {type: "done", result: {status: "succeeded", total: 0, processed: 0, succeeded: 0, failed: 0}});
  await service.tick(); assert.equal(workers.length, 2);
});
test('menu management and upload HTTP endpoints are removed for all identities',async t=>{
 const {root,db}=fixture(t),service=new MenuService(db,root);t.after(()=>service.close());publishSource(db,source(1),[record()]);const app=new Hono();mountMenuRoutes(app,db);
 assert.equal((await app.request('/api/dishes')).status,200);
 for(const endpoint of ['/settings','/jobs','/test','/imports','/imports/preview','/jobs/anything/artifacts/diagnostic'])for(const method of ['GET','POST','PUT','DELETE'])assert.equal((await app.request('/api/admin/menu-sync'+endpoint,{method,headers:{authorization:'operator'}})).status,404);
});
test("restart recovers a lease that expires after startup even when today already triggered", async t => {
  const {root, db} = fixture(t); let now = at("2026-10-01T09:00:00");
  db.prepare("INSERT INTO menu_sync_jobs(id,trigger,auto_day,status,created_at,config_revision,provider,model) VALUES('old-job','automatic','2026-10-01','running',?,1,'openrouter','test')").run(now);
  db.prepare("INSERT INTO menu_sync_lease(id,owner,expires_at) VALUES(1,'old-job',?)").run(now+60000);
  const service = new MenuService(db, root, {clock: () => now, workerFactory: () => {throw new Error("today must not run twice");}});
  t.after(() => service.close()); configure(service); process.env.MENU_SYNC_ENABLED='true';
  assert.equal(service.job("old-job").status, "running");
  now += 120000; await service.tick();
  assert.equal(service.job("old-job").status, "interrupted"); assert.equal(service.settings().active_job_id, null);
});

test("manual import creates independent batches and atomically records normalized publication", t => {
  const {root,db}=fixture(t),service=new MenuService(db,root);t.after(()=>service.close());
  const input={title:"人工核对菜单",json_text:JSON.stringify([record(),record(),{...record("无价格菜"),price:null,weekday:null}])};
  const preview=service.manual.preview(input);assert.equal(preview.count,2);assert.equal(preview.duplicates_removed,1);assert.equal(preview.records[1].weekday,"周四");
  assert.throws(()=>service.manual.publish({...input,digest:preview.digest},7),/先校验/);
  const imported=service.manual.publish({...input,digest:preview.digest,reviewed:true},7);
  assert.match(imported.source_id,/^manual:/);assert.equal(service.sources().length,0,"manual batches never enter school discovery");
  const meta=db.prepare("SELECT * FROM menu_sources WHERE id=?").get(imported.source_id);assert.equal(meta.article_id,null);assert.equal(meta.kind,"manual");assert.equal(meta.publication_origin,"manual");
  const audit=db.prepare("SELECT * FROM menu_import_audit").get();assert.equal(audit.actor_id,7);assert.equal(audit.records_count,2);assert.deepEqual(JSON.parse(audit.records_json),preview.records);
  const loaded=service.manual.load(imported.source_id);assert.equal(loaded.records[0].price,0);assert.equal(loaded.records[1].price,null);
  const replace={source_id:imported.source_id,expected_revision:imported.revision,json_text:JSON.stringify([record("更正名称")])};
  const next=service.manual.preview(replace);
  db.exec("CREATE TRIGGER reject_manual_audit BEFORE INSERT ON menu_import_audit BEGIN SELECT RAISE(ABORT,'audit write failed'); END");
  assert.throws(()=>service.manual.publish({...replace,digest:next.digest,reviewed:true},7),/audit write failed/);
  assert.equal(service.manual.source(imported.source_id).revision,imported.revision);assert.equal(service.manual.records(imported.source_id).length,2);
  db.exec("DROP TRIGGER reject_manual_audit");service.manual.publish({...replace,digest:next.digest,reviewed:true},7);
  assert.deepEqual(catalog(db).dishes.map(d=>d.name),["更正名称"]);
  assert.throws(()=>service.manual.publish({...replace,digest:next.digest,reviewed:true},7),/已经更新/);
});

test("manual validation rejects bad types, calendar dates, field extras and stale or edited previews", t => {
  const {root,db}=fixture(t),service=new MenuService(db,root);t.after(()=>service.close());
  for (const json_text of ['```json\n[]\n```','[]','{}',JSON.stringify([{...record(),price:"0"}]),JSON.stringify([{...record(),spicy:"false"}]),JSON.stringify([{...record(),date:"2026-02-30"}]),JSON.stringify([{...record(),weekday:"周一"}]),JSON.stringify([{...record(),time:["noon","noon"]}]),JSON.stringify([{...record(),cell_bbox:[0,0,1,1]}])]) {
    assert.throws(()=>service.manual.preview({json_text}),MenuError);
  }
  assert.throws(()=>service.manual.preview({json_text:JSON.stringify([record(),{...record(),price:"bad"}])}),/第 2 条：price/);
  const input={json_text:JSON.stringify([record()])},preview=service.manual.preview(input);
  assert.throws(()=>service.manual.publish({...input,json_text:JSON.stringify([record("改动")]),digest:preview.digest,reviewed:true},1),/先校验/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM menu_import_audit").get().n,0);
});

test("manual corrections combine failed image candidates, retain image hash and reject active sync", t => {
  const {root,db}=fixture(t),service=new MenuService(db,root);t.after(()=>service.close());publishSource(db,source(1),[record("旧菜")]);
  const job="22222222-2222-4222-8222-222222222222";
  db.prepare("INSERT INTO menu_sync_jobs(id,trigger,status,created_at,config_revision,provider,model) VALUES(?,'manual','failed',1,0,'x','x')").run(job);
  db.prepare("INSERT INTO menu_job_items(job_id,source_id,article_id,title,status) VALUES(?,?,1,'menu','failed')").run(job,sourceId(1));
  const dir=path.join(root,".private/menu-jobs",job,"1");fs.mkdirSync(dir,{recursive:true});
  const imageHash=sha256("latest image");fs.writeFileSync(path.join(dir,"source.json"),JSON.stringify({content_hash:imageHash,image_count:2}));
  fs.writeFileSync(path.join(dir,"diagnostic.json"),JSON.stringify({complete:false,partial_records:[record("首图")],image_failure:{partial_records:[record("次图")]}}));
  const loaded=service.manual.load(sourceId(1),job);assert.equal(loaded.incomplete,true);assert.equal(loaded.records.length,2);assert.match(loaded.warning,/补全/);
  const input={source_id:sourceId(1),expected_revision:loaded.source.revision,job_id:job,json_text:JSON.stringify(loaded.records)},preview=service.manual.preview(input);
  db.prepare("INSERT INTO menu_sync_lease VALUES(1,'other',?)").run(Date.now()+60000);
  assert.throws(()=>service.manual.publish({...input,digest:preview.digest,reviewed:true},1),/正在运行/);
  assert.deepEqual(catalog(db).dishes.map(d=>d.name),["旧菜"]);db.exec("DELETE FROM menu_sync_lease");
  service.manual.publish({...input,digest:preview.digest,reviewed:true},1);
  assert.equal(service.sources()[0].content_hash,imageHash);assert.equal(service.sources()[0].last_error,"");
  assert.equal(db.prepare("SELECT job_id FROM menu_import_audit").get().job_id,job);
});

test("upgrade permits manual sources without changing existing foreign keys or published rows", t => {
  const {root,db}=fixture(t);publishSource(db,source(1),[record()]);
  db.exec(`PRAGMA foreign_keys=OFF;BEGIN;
    CREATE TABLE old_sources(id TEXT PRIMARY KEY,article_id INTEGER NOT NULL UNIQUE,title TEXT NOT NULL,url TEXT NOT NULL,published_date TEXT,content_hash TEXT,updated_at INTEGER,checked_at INTEGER,records_count INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '');
    INSERT INTO old_sources SELECT id,article_id,title,url,published_date,content_hash,updated_at,checked_at,records_count,last_error FROM menu_sources;
    DROP TABLE menu_sources;ALTER TABLE old_sources RENAME TO menu_sources;COMMIT;PRAGMA foreign_keys=ON;`);
  migrate(db);assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);assert.equal(catalog(db).dishes.length,1);
  const service=new MenuService(db,root);t.after(()=>service.close());const input={json_text:JSON.stringify([record("手工菜")])},preview=service.manual.preview(input);
  service.manual.publish({...input,digest:preview.digest,reviewed:true},1);assert.equal(catalog(db).dishes.length,2);
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys,1);
});

test('manual menu publishing remains a server-side utility without HTTP upload access',async t=>{
 const {root,db}=fixture(t),service=new MenuService(db,root);t.after(()=>service.close());const app=new Hono();mountMenuRoutes(app,db);
 assert.equal((await app.request('/api/admin/menu-sync/imports',{method:'POST',body:'{}'})).status,404);
 assert.equal((await app.request('/api/menu')).status,200);
});

test('Gemini groups use consistent school names and explicit local stalls',()=>{
  const {normalizeGroups}=require('../apps/api/src/domain/menu/extract');
  const group={group:'早餐',places:['洋水居','洋水居'],items:[]};
  assert.deepEqual(normalizeGroups([group])[0].places,['泮水居']);
  assert.deepEqual(normalizeGroups([{...group,group:'泮水居二楼风味 & 紫阳楼风味'}])[0].places,['泮水居二楼','紫阳楼']);
  assert.deepEqual(normalizeGroups([{...group,group:'一楼北厅风味'}])[0].places,['一楼北厅']);
  assert.deepEqual(group.places,['洋水居','洋水居']);
});

test('public all-week supplies preserve older weeks and reject ambiguous selectors', async t=>{
 const {root,db}=fixture(t),service=new MenuService(db,root);t.after(()=>service.close());
 db.exec('CREATE TABLE recipes(dish_id INTEGER,rating INTEGER,is_weekly INTEGER)');
 publishSource(db,source(1),[record('旧菜')]);publishSource(db,source(2),[{...record('新菜'),date:'2026-10-08',weekday:null}]);
 const {weeklyMenu}=require('../apps/api/src/domain/menu/public');
 assert.equal(weeklyMenu(db).records.length,1);assert.equal(weeklyMenu(db,undefined,true).records.length,2);
 const app=new Hono();mountMenuRoutes(app,db,service,()=>{});
 assert.equal((await app.request('/api/menu?all=1')).status,200);
 assert.equal((await app.request('/api/menu?all=1&all=1')).status,400);
 assert.equal((await app.request('/api/menu?all=1&source_id='+sourceId(1))).status,400);
});

test('physical table detection follows variable heights and pale wide-image grids',async()=>{
 const height=1600,width=6096;
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="6096" height="1600"><rect width="6096" height="1600" fill="white"/>'+[0,700].map((top,i)=>
 '<g stroke="#aaa" stroke-width="5">'+[top,top+80,top+160,top+230+(i*30),top+340+(i*80),i?1598:700].map(y=>'<path d="M0 '+y+'H6096"/>').join('')+[0,900,1800,3000,4100,5100,6095].map(x=>'<path d="M'+x+' '+(top+80)+'V'+(i?1598:700)+'"/>').join('')+'</g><rect x="2400" y="'+(top+20)+'" width="1000" height="30" fill="black"/>').join('')+'</svg>';
 const image=await normalizeImage(await sharp(Buffer.from(svg)).png().toBuffer());const tables=await structuralTables(image);
 assert.equal(tables.length,2);assert.ok(Math.abs(tables[1].box.top-700)<20);
 assert.equal(tables[0].box.width,width);assert.ok(tables[1].box.height>tables[0].box.height);
});

test('date grid uses measured unequal columns without treating earlier dates as labels',()=>{
 const {dateColumns}=require('../apps/api/src/domain/menu/extract');
 assert.deepEqual(dateColumns([0,445,1375,2374,3304,4234,5164,6094],6096),[445,1375,2374,3304,4234,5164,6094]);
 assert.deepEqual(dateColumns([0,110,292,740,1188,1638,2090,2542,2992],2993),[292,740,1188,1638,2090,2542,2992]);
 assert.deepEqual(dateColumns([0,100,200],3000),[]);
});

test('school course break is not breakfast even when a model calls it morning',()=>{
 const {normalizeGroups}=require('../apps/api/src/domain/menu/extract');
 const row=normalizeGroups([{group:'上午大课间',time:['morning'],places:['希文楼'],items:[]}])[0];assert.equal(row.group,'大课间');assert.deepEqual(row.time,[]);
 const local=normalizeGroups([{group:'泮水居一楼北厅现煮',time:['noon'],places:['泮水居','正谊校区'],items:[]}])[0];assert.deepEqual(local.places,['泮水居一楼北厅']);
});

test('parenthesized stall overrides table campuses, while bare floor preserves the full campus',()=>{
 const {normalizeGroups}=require('../apps/api/src/domain/menu/extract');
 const base={time:['evening'],places:['泮水居','正谊校区'],items:[]};
 const snack=normalizeGroups([{...base,group:'小吃 (泮水居三楼)'}])[0];assert.deepEqual(snack.places,['泮水居三楼']);assert.equal(snack.group,'小吃');
 const floor=normalizeGroups([{...base,group:'二楼风味',places:['正谊校区二楼']}])[0];assert.deepEqual(floor.places,['正谊校区二楼']);
});
