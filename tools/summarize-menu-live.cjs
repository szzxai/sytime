'use strict';
// Summarize saved measurements without making new model requests.
const fs = require('node:fs'),
  path = require('node:path');
const file = path.resolve(process.argv[2] || '');
if (!process.argv[2])
  throw new Error('Usage: node tools/summarize-menu-live.cjs path/to/report.json');
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
report.finished_at ||= new Date(
  Math.max(
    ...report.sources.map(
      (s) =>
        fs.statSync(path.join(path.dirname(file), s.article_id + '-manual-review.json')).mtimeMs,
    ),
  ),
).toISOString();
report.summary = {
  complete_sources: report.sources.filter((s) => s.published).length,
  total_sources: report.sources.length,
  checked: report.sources.reduce((n, s) => n + s.checked, 0),
  matched: report.sources.reduce((n, s) => n + s.matched, 0),
  field_matches: Object.fromEntries(
    ['name', 'date', 'price', 'spicy'].map((field) => [
      field,
      report.sources.reduce((n, s) => n + s.field_matches[field], 0),
    ]),
  ),
};
fs.writeFileSync(file, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      started_at: report.started_at,
      finished_at: report.finished_at,
      model: report.model,
      version: report.version,
      summary: report.summary,
      sources: report.sources.map(
        ({ article_id, candidate_count, matched, mismatches, stats }) => ({
          article_id,
          candidate_count,
          matched,
          mismatches,
          stats,
        }),
      ),
    },
    null,
    2,
  ),
);
