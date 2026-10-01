"use strict";
// Explicit, opt-in real provider check. No credentials are persisted or printed.
const fs = require("node:fs"), path = require("node:path");
const { testConfiguration, ModelClient } = require("../lib/menu/provider");
const { parseArticle } = require("../lib/menu/source");
const { normalizeImage, extractImage, preview } = require("../lib/menu/images");
const { cleanError, VERSION } = require("../lib/menu/schema");
const samples = require("./fixtures/menu-manual-review.json");
async function main() {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_CODE_API_KEY;
  if (!key) throw new Error("Set OPENROUTER_API_KEY for the optional live check");
  const config = { provider: "openrouter", base_url: "https://openrouter.ai/api/v1", model: process.env.MENU_TEST_MODEL || "openai/gpt-6-luna", api_key: key };
  const started = new Date().toISOString();
  const out = path.resolve("output/playwright/menu-live", started.replace(/[:.]/g, "-")); fs.mkdirSync(out, {recursive: true});
  const report = { started_at: started, version: VERSION, model: config.model, sample_basis: "人工逐项核对的 30 个供应记录；仅评价抽样字段，不代表全图准确率", sources: [] };
  console.log("Report directory:", out);
  function score(id, records, published, error, stats) {
    const manual = samples.sources.find(s => s.article_id === id).samples;
    const fields = ["name", "date", "price", "spicy"];
    const field_matches = Object.fromEntries(fields.map(field => [field, manual.filter(sample => records.some(record => record.name === sample.name && (field === "date" || record.date === sample.date) && record[field] === sample[field])).length]));
    const mismatches = manual.filter(sample => !records.some(record => Object.entries(sample).every(([key,value]) => record[key] === value)));
    const result = {article_id: id, published, candidate_count: records.length, checked: manual.length, matched: manual.length-mismatches.length, field_matches, mismatches, error: error || null, stats};
    report.sources.push(result);
    fs.writeFileSync(path.join(out, `${id}-manual-review.json`), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
    console.log(id, published ? "published candidate" : "unpublished candidate", "samples", result.matched, "/", result.checked, "fields", JSON.stringify(field_matches));
    if (!published || mismatches.length) process.exitCode = 1;
  }
  const diagnosticFetch = async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const body = await response.clone().json().catch(() => ({}));
      console.log("Provider diagnostic:", cleanError(new (require("../lib/menu/schema").MenuError)(JSON.stringify(body.error || {status: response.status})), [key]));
    }
    if (response.ok) {
      const body = await response.clone().json().catch(() => ({}));
      try { const value = JSON.parse(body.choices?.[0]?.message?.content); if (value.complete === false) console.log("Incomplete:", (value.unreadable || value.problems || []).join("; ").slice(0, 1000)); } catch { /* live diagnostics only */ }
    }
    return response;
  };
  const result = await testConfiguration(config, {fetchImpl: diagnosticFetch});
  report.capability = result;
  console.log("Capability:", result.ok, result.elapsed_ms, "ms");
  const archive = path.resolve(process.argv[2] || "../szzx-menu/.scratch/audit_10");
  const ids = process.env.MENU_TEST_IDS ? process.env.MENU_TEST_IDS.split(",").map(Number) : [11392,11389,11386];
  if (ids.some(id => !samples.sources.some(source => source.article_id === id))) throw new Error("Unsupported manual-review article ID");
  await Promise.all(ids.map(async id => {
    const article = JSON.parse(fs.readFileSync(path.join(archive, String(id), "article.json"), "utf8")).data;
    const html = '<div class="titlebox"><h1>' + article.title + '</h1><span>' + (article.published_date || article.publish_time || "") + '</span></div><div id="newstext">' + (article.content_html || article.html || article.content || "") + '</div>';
    const source = parseArticle(html, id);
    if (!source.images.length) throw new Error("Archive content key not found");
    const image = await normalizeImage(source.images[0].data);
    fs.writeFileSync(path.join(out, `${id}-original.png`), image.data);
    fs.writeFileSync(path.join(out, `${id}-preview.png`), await preview(image.data, 1600, 2600));
    const model = new ModelClient(config, {fetchImpl: diagnosticFetch, cacheDir: path.join(out, "cache"), signal: AbortSignal.timeout(20*60000)});
    console.log("Image", id, image.width, image.height);
    try {
      const extracted = await extractImage(image, source, model, {onProgress: phase => console.log(id, phase)});
      fs.writeFileSync(path.join(out, `${id}-result.json`), JSON.stringify(extracted));
      console.log(id, "complete", extracted.records.length, "records", model.stats.requests, "requests");
      score(id, extracted.records, true, null, model.stats);
    } catch (error) {
      const message = cleanError(error, [key]);
      fs.writeFileSync(path.join(out, `${id}-failure.json`), JSON.stringify({message, code: error.code, stats: model.stats, diagnostic: error.menu_diagnostic}));
      console.log(id, "unpublished", message);
      score(id, error.menu_diagnostic?.partial_records || [], false, message, model.stats);
    }
  }));
  report.finished_at = new Date().toISOString();
  report.summary = {
    complete_sources:report.sources.filter(s=>s.published).length,total_sources:report.sources.length,
    checked:report.sources.reduce((n,s)=>n+s.checked,0),matched:report.sources.reduce((n,s)=>n+s.matched,0),
    field_matches:Object.fromEntries(["name","date","price","spicy"].map(field=>[field,report.sources.reduce((n,s)=>n+s.field_matches[field],0)]))
  };
  fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2));
  console.log("Summary:",JSON.stringify(report.summary));
}
main().catch(error => {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_CODE_API_KEY;
  console.error(error.name, cleanError(new (require("../lib/menu/schema").MenuError)(error.message), [key])); process.exitCode = 1;
});
