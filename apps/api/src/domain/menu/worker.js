'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parentPort, workerData, isMainThread } = require('node:worker_threads');
const { SchoolSource, writeJson } = require('./source');
const { ModelClient } = require('./provider');
const { normalizeImage, extractImage } = require('./images');
const { MenuError, sha256, validateRecords, cleanError } = require('./schema');
const { sourceId } = require('./store');
// Injectable transports/extractors are for offline tests, never HTTP parameters.
async function runMenuJob(input, { signal, emit, fetchImpl = fetch, extractor } = {}) {
  extractor ||=
    input.config.provider === 'gemini' ? require('./extract').extractGeminiImage : extractImage;
  const school = new SchoolSource({
    fetchImpl,
    cacheDir: path.join(input.privateDir, 'menu-cache'),
    signal,
  });
  const known = new Map(input.sources.map((source) => [source.article_id, source]));
  let refs,
    discoveryAnchor = null;
  if (input.sourceIds?.length) {
    refs = input.sources.filter((source) => input.sourceIds.includes(source.id));
    if (refs.length !== input.sourceIds.length) throw new MenuError('指定菜单来源不存在');
  } else {
    await emit({ type: 'phase', phase: 'discover' });
    const discovered = await school.discover(input.anchor);
    discoveryAnchor = discovered.anchor;
    // Durable discovery registers the entire backlog before advancing the anchor.
    await emit({ type: 'discovery', refs: discovered.fresh, anchor: discoveryAnchor });
    const pending = input.sources
      .filter((source) => !source.content_hash || source.last_error)
      .sort((a, b) => b.article_id - a.article_id);
    refs = [
      ...new Map(
        [
          ...discovered.fresh,
          ...pending,
          ...discovered.recent.slice(0, 2).filter((ref) => known.has(ref.article_id)),
        ].map((ref) => [ref.article_id, ref]),
      ).values(),
    ];
  }
  let processed = 0,
    succeeded = 0,
    failed = 0,
    recognized = 0;
  await emit({ type: 'phase', phase: 'running', total: refs.length, processed, succeeded, failed });
  const totals = {
    requests: 0,
    cache_hits: 0,
    input_tokens: 0,
    output_tokens: 0,
    reported_cost: 0,
    cost_reported: false,
  };
  for (const ref of refs) {
    signal?.throwIfAborted();
    if (recognized >= 10) break;
    const id = sourceId(ref.article_id),
      itemDir = path.join(input.privateDir, 'menu-jobs', input.jobId, String(ref.article_id));
    fs.mkdirSync(itemDir, { recursive: true, mode: 0o700 });
    await emit({
      type: 'item',
      source_id: id,
      article_id: ref.article_id,
      title: ref.title || '菜单',
      status: 'running',
      phase: 'fetch',
      artifact_path: `${input.jobId}/${ref.article_id}`,
    });
    let source,
      model,
      lastPhase = 'fetch',
      partial = [],
      evidence = [],
      layouts = [];
    try {
      source = await school.article(ref.article_id);
      const rawHash = source.content_hash;
      const sourceDir = path.join(input.privateDir, 'menu-sources', String(ref.article_id));
      const metadata = {
        article_id: source.article_id,
        title: source.title,
        url: source.url,
        published_date: source.published_date,
        content_hash: rawHash,
      };
      writeJson(path.join(sourceDir, 'source.json'), metadata);
      const replacementPaths = input.replacements?.[id];
      let override;
      if (replacementPaths?.length) {
        override = {
          base_hash: rawHash,
          files: replacementPaths.map((file) => path.basename(file)),
        };
        writeJson(path.join(sourceDir, 'override.json'), override);
      } else {
        try {
          override = JSON.parse(fs.readFileSync(path.join(sourceDir, 'override.json'), 'utf8'));
        } catch {
          /* no correction */
        }
      }
      if (
        override?.base_hash === rawHash &&
        Array.isArray(override.files) &&
        override.files.length
      ) {
        source.images = override.files.map((file) => {
          if (
            typeof file !== 'string' ||
            path.basename(file) !== file ||
            !/^upload-[a-f0-9-]+-\d+\.png$/.test(file)
          )
            throw new MenuError('补充图片存档无效');
          const data = fs.readFileSync(path.join(sourceDir, file));
          return { data, hash: sha256(data) };
        });
        source.content_hash = sha256(
          source.title +
            '\n' +
            (source.published_date || '') +
            '\n' +
            source.images.map((image) => image.hash).join('\n'),
        );
      }
      const sourcePublic = {
        ...metadata,
        content_hash: source.content_hash,
        raw_content_hash: rawHash,
        image_count: source.images.length,
      };
      writeJson(path.join(itemDir, 'source.json'), sourcePublic);
      if (!source.images.length)
        throw new MenuError('菜单正文没有可获取的内联图片，请在后台补充该篇全部菜单图片后重试');
      if (source.images.length > 12) throw new MenuError('菜单图片超过十二张，需要核对正文结构');
      const normalizedImages = [];
      for (let index = 0; index < source.images.length; index++) {
        signal?.throwIfAborted();
        const image = await normalizeImage(source.images[index].data);
        fs.writeFileSync(path.join(itemDir, `image-${index}.png`), image.data, { mode: 0o600 });
        normalizedImages.push(image);
      }
      if (
        known.get(ref.article_id)?.content_hash === source.content_hash &&
        !input.force &&
        !replacementPaths?.length
      ) {
        await emit({
          type: 'item',
          source_id: id,
          article_id: ref.article_id,
          title: source.title,
          status: 'unchanged',
          phase: 'done',
          artifact_path: `${input.jobId}/${ref.article_id}`,
        });
        processed++;
        await emit({
          type: 'phase',
          phase: 'running',
          total: refs.length,
          processed,
          succeeded,
          failed,
        });
        continue;
      }
      recognized++;
      const articleSignal = AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(20 * 60000),
      ]);
      model = new ModelClient(input.config, {
        fetchImpl,
        signal: articleSignal,
        cacheDir: path.join(input.privateDir, 'menu-cache', 'models'),
      });
      for (let index = 0; index < normalizedImages.length; index++) {
        articleSignal.throwIfAborted();
        const image = normalizedImages[index];
        const result = await extractor(image, source, model, {
          imageIndex: index,
          onProgress(phase) {
            lastPhase = phase;
            emit({ type: 'progress', source_id: id, phase, stats: model.stats });
          },
        });
        partial.push(...result.records);
        evidence.push(...result.evidence);
        layouts.push({ image_index: index, layout: result.layout, blocks: result.blocks });
      }
      articleSignal.throwIfAborted();
      lastPhase = 'validate';
      const records = validateRecords(partial);
      writeJson(path.join(itemDir, 'diagnostic.json'), {
        source: sourcePublic,
        layouts,
        evidence,
        stats: model.stats,
        complete: true,
      });
      writeJson(path.join(itemDir, 'menu.json'), records);
      await emit({ type: 'publish', source: sourcePublic, records });
      succeeded++;
      await emit({
        type: 'item',
        source_id: id,
        article_id: ref.article_id,
        title: source.title,
        status: 'succeeded',
        phase: 'done',
        records_count: records.length,
        artifact_path: `${input.jobId}/${ref.article_id}`,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      failed++;
      const message =
        error.name === 'TimeoutError'
          ? '本篇菜单超过二十分钟时限，未发布'
          : cleanError(error, [input.config.api_key]);
      writeJson(path.join(itemDir, 'diagnostic.json'), {
        source: source && {
          article_id: source.article_id,
          title: source.title,
          content_hash: source.content_hash,
        },
        phase: lastPhase,
        error: message,
        complete: false,
        partial_records: partial,
        evidence,
        layouts,
        image_failure: error.menu_diagnostic || null,
        stats: model?.stats || {},
      });
      await emit({
        type: 'item',
        source_id: id,
        article_id: ref.article_id,
        title: source?.title || ref.title || '菜单',
        status: 'failed',
        phase: lastPhase,
        error: message,
        artifact_path: `${input.jobId}/${ref.article_id}`,
      });
    } finally {
      if (model)
        for (const key of Object.keys(totals)) {
          if (key === 'cost_reported') totals[key] ||= model.stats[key];
          else totals[key] += model.stats[key];
        }
    }
    processed++;
    await emit({
      type: 'phase',
      phase: 'running',
      total: refs.length,
      processed,
      succeeded,
      failed,
    });
  }
  return {
    status: failed ? (succeeded ? 'partial' : 'failed') : 'succeeded',
    processed,
    succeeded,
    failed,
    total: refs.length,
    stats: totals,
    deferred: Math.max(0, refs.length - processed),
    discovery_anchor: discoveryAnchor,
  };
}
if (!isMainThread) {
  const controller = new AbortController(),
    acknowledgements = new Map();
  let serial = 0;
  parentPort.on('message', (message) => {
    if (message.type === 'cancel') controller.abort();
    if (message.type === 'ack') {
      const pending = acknowledgements.get(message.request_id);
      if (pending) {
        acknowledgements.delete(message.request_id);
        message.ok
          ? pending.resolve()
          : pending.reject(new MenuError(message.error || '任务已停止', 409));
      }
    }
  });
  const emit = (message) => {
    if (['publish', 'discovery'].includes(message.type)) {
      const request_id = ++serial;
      return new Promise((resolve, reject) => {
        acknowledgements.set(request_id, { resolve, reject });
        parentPort.postMessage({ ...message, request_id });
      });
    }
    parentPort.postMessage(message);
    return Promise.resolve();
  };
  runMenuJob(workerData, { signal: controller.signal, emit })
    .then((result) => {
      parentPort.postMessage({ type: 'done', result });
      parentPort.close();
    })
    .catch((error) => {
      parentPort.postMessage({
        type: 'fatal',
        cancelled: controller.signal.aborted,
        error: cleanError(error, [workerData.config.api_key]),
      });
      parentPort.close();
    });
}
module.exports = { runMenuJob };
