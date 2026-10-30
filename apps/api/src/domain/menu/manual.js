const { query } = require('../../../../../packages/db/src/client.ts');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { MenuError, validateRecords, sha256 } = require('./schema');
const { publishSource } = require('./store');
class ManualMenus {
  constructor(service) {
    this.service = service;
    this.db = service.db;
  }
  list() {
    return {
      sources: query(
        this.db,
        'SELECT id,title,article_id,kind,records_count,updated_at,revision,publication_origin FROM menu_sources ORDER BY updated_at DESC,article_id DESC',
      ).all(),
      jobs: this.service.jobs().map(({ id, status, created_at }) => ({
        id,
        status,
        created_at,
        sources: this.service
          .job(id)
          .items.map((item) => ({ id: item.source_id, title: item.title, status: item.status })),
      })),
      history: query(
        this.db,
        'SELECT a.id,a.source_id,a.actor_id,a.job_id,a.created_at,a.records_count,a.revision,s.title FROM menu_import_audit a JOIN menu_sources s ON s.id=a.source_id ORDER BY a.created_at DESC,a.rowid DESC LIMIT 50',
      ).all(),
    };
  }
  source(id) {
    const source = query(this.db, 'SELECT * FROM menu_sources WHERE id=?').get(id);
    if (!source) throw new MenuError('菜单来源不存在', 404);
    return source;
  }
  records(id) {
    return query(
      this.db,
      `SELECT r.date,r.weekday,r.time_json,r.place,r.group_name,d.name,r.price,r.spicy
      FROM menu_records r JOIN dishes d ON d.id=r.dish_id WHERE r.source_id=? ORDER BY r.rowid`,
    )
      .all(id)
      .map((row) => ({
        date: row.date,
        weekday: row.weekday,
        time: JSON.parse(row.time_json),
        place: row.place,
        group: row.group_name,
        name: row.name,
        price: row.price,
        spicy: row.spicy === null ? null : Boolean(row.spicy),
      }));
  }
  load(id, jobId) {
    const source = this.source(id);
    let records = this.records(id),
      incomplete = false,
      warning = '',
      image_count = 0;
    if (jobId) {
      const job = this.service.job(jobId);
      if (!job.items.some((item) => item.source_id === id))
        throw new MenuError('该任务不包含此菜单', 404);
      if (!['succeeded', 'partial', 'failed', 'cancelled', 'interrupted'].includes(job.status))
        throw new MenuError('识图任务尚未结束，请结束后再编辑', 409);
      const read = (kind) => {
        try {
          return JSON.parse(fs.readFileSync(this.service.artifact(jobId, id, kind), 'utf8'));
        } catch (error) {
          if (error.status === 404) return null;
          throw error;
        }
      };
      const menu = read('menu'),
        diagnostic = read('diagnostic'),
        metadata = read('source');
      image_count = metadata?.image_count || 0;
      if (menu) records = validateRecords(menu);
      else if (diagnostic) {
        const partial = [
          ...(diagnostic.partial_records || []),
          ...(diagnostic.image_failure?.partial_records || []),
        ];
        records = partial.length ? validateRecords(partial) : [];
        incomplete = true;
        warning =
          '识图未通过完整性校验。以下仅为已识别的部分记录，请逐张核对原图、补全全部遗漏后发布。';
      } else {
        incomplete = true;
        warning = '任务没有生成识图 JSON，当前载入已发布记录。请核对原图并补全本篇菜单。';
      }
    }
    return {
      source: { id: source.id, title: source.title, revision: source.revision, kind: source.kind },
      records,
      incomplete,
      warning,
      image_count,
    };
  }
  preview(body) {
    if (
      typeof body?.json_text !== 'string' ||
      Buffer.byteLength(body.json_text, 'utf8') > 6 * 1024 * 1024
    )
      throw new MenuError('请粘贴不超过 6 MB 的 JSON 文本');
    let input;
    try {
      input = JSON.parse(body.json_text);
    } catch {
      throw new MenuError('JSON 语法无效：请检查双引号、逗号和括号，不要包含 Markdown 代码围栏');
    }
    const records = validateRecords(input);
    const source = body.source_id ? this.source(body.source_id) : null;
    const title = source ? source.title : String(body.title || '手动导入菜单').trim();
    if (!title || title.length > 300) throw new MenuError('批次名称应为 1 至 300 个字符');
    const expected_revision = source?.revision ?? null;
    if (source && body.expected_revision !== expected_revision)
      throw new MenuError('菜单已经更新，请重新载入再编辑', 409);
    if (body.job_id) {
      if (!source) throw new MenuError('编辑识图结果时必须指定菜单来源');
      const job = this.service.job(body.job_id);
      if (job.status === 'running' || !job.items.some((item) => item.source_id === source.id))
        throw new MenuError('请选择已经结束且包含该菜单的识图任务', 409);
    }
    const digest = sha256(
      JSON.stringify({
        source_id: source?.id || null,
        title,
        expected_revision,
        job_id: body.job_id || null,
        records,
      }),
    );
    return {
      records,
      count: records.length,
      input_count: input.length,
      duplicates_removed: input.length - records.length,
      dish_count: new Set(records.map((row) => row.name.toLowerCase())).size,
      source_id: source?.id || null,
      title,
      expected_revision,
      digest,
      job_id: body.job_id || null,
      mode: source ? 'replace' : 'create',
    };
  }
  publish(body, actorId) {
    if (this.service.closed) throw new MenuError('网站正在关闭', 503);
    this.service.recoverExpired();
    const preview = this.preview(body);
    if (body.reviewed !== true || body.digest !== preview.digest)
      throw new MenuError('请先校验当前 JSON，并确认已核对完整菜单后再发布', 409);
    const existing = preview.source_id ? this.source(preview.source_id) : null;
    const id = crypto.randomUUID();
    const source = existing || {
      id: 'manual:' + crypto.randomUUID(),
      kind: 'manual',
      title: preview.title,
    };
    // Keep the image hash so unchanged school images do not erase a human correction.
    let imageHash = existing?.kind === 'school' ? existing.content_hash : null;
    if (preview.job_id) {
      try {
        imageHash =
          JSON.parse(
            fs.readFileSync(this.service.artifact(preview.job_id, source.id, 'source'), 'utf8'),
          ).content_hash || imageHash;
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    }
    source.content_hash = imageHash || sha256(JSON.stringify(preview.records));
    const count = publishSource(this.db, source, preview.records, {
      now: this.service.clock(),
      manualAudit: {
        id,
        actor_id: actorId,
        job_id: preview.job_id,
        expected_revision: preview.expected_revision,
      },
    });
    return { id, source_id: source.id, count, revision: this.source(source.id).revision };
  }
}
module.exports = { ManualMenus };
