'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const { GoogleGenAI } = require('@google/genai');
const { setTimeout: delay } = require('node:timers/promises');
const { MenuError, VERSION, sha256 } = require('./schema');
const { writeJson } = require('./source');

// Gemini supports a subset of JSON Schema. Local Ajv remains authoritative.
function geminiSchema(value) {
  if (Array.isArray(value)) return value.map(geminiSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['uniqueItems', 'maxLength', 'minLength'].includes(key))
      .map(([key, item]) => [key, geminiSchema(item)]),
  );
}
class GeminiClient {
  constructor(config, { cacheDir, signal, maxRequests = 100, onRequest, client } = {}) {
    this.config = config;
    this.cacheDir = cacheDir;
    this.signal = signal;
    this.maxRequests = maxRequests;
    this.onRequest = onRequest;
    this.client = client || new GoogleGenAI({ apiKey: config.api_key });
    this.stats = {
      requests: 0,
      cache_hits: 0,
      input_tokens: 0,
      output_tokens: 0,
      reported_cost: 0,
      cost_reported: false,
    };
  }
  async request({ name, schema, prompt, images, validateResult }) {
    const boxes = ['menu_layout', 'menu_records'].includes(name);
    if (boxes)
      prompt +=
        '\n本次坐标统一使用 Gemini 原生顺序 [y_min, x_min, y_max, x_max]，归一化为 0..1000。bbox、header_bbox、cell_bbox 均遵循这个顺序。';
    const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
    const identity = sha256(
      JSON.stringify([
        VERSION,
        'gemini-high-resolution-v1',
        this.config.model,
        name,
        schema,
        prompt,
        images.map((image) => sha256(image.data)),
      ]),
    );
    const file = this.cacheDir && path.join(this.cacheDir, identity + '.json');
    if (file) {
      try {
        const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (validate(cached)) {
          validateResult?.(cached);
          this.stats.cache_hits++;
          return cached;
        }
      } catch {
        /* Invalid caches never publish data. */
      }
    }
    let repaired = false;
    let retries = 0;
    for (;;) {
      this.signal?.throwIfAborted();
      if (this.stats.requests >= this.maxRequests)
        throw new MenuError('达到菜单模型请求上限，已有菜单保留', 422, 'model_budget');
      this.stats.requests++;
      this.onRequest?.(this.stats);
      let response;
      try {
        response = await this.client.models.generateContent({
          model: this.config.model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text:
                    prompt + (repaired ? '\n上次结果格式错误，请严格按 Schema 重新读取原图。' : ''),
                },
                ...images.flatMap((image) => [
                  { text: image.label || '菜单图片' },
                  { inlineData: { mimeType: 'image/png', data: image.data.toString('base64') } },
                ]),
              ],
            },
          ],
          config: {
            temperature: 0,
            mediaResolution: 'MEDIA_RESOLUTION_HIGH',
            responseMimeType: 'application/json',
            responseJsonSchema: geminiSchema(schema),
            maxOutputTokens: 32768,
            abortSignal: AbortSignal.any([
              ...(this.signal ? [this.signal] : []),
              AbortSignal.timeout(120000),
            ]),
            httpOptions: { timeout: 120000, retryOptions: { attempts: 1 } },
          },
        });
      } catch (error) {
        this.signal?.throwIfAborted();
        const status = Number(error.status || error.code) || 0;
        if ((!status || [408, 429, 500, 502, 503, 504].includes(status)) && retries++ < 2) {
          await delay(status === 429 ? 60000 : 2000 * retries, undefined, { signal: this.signal });
          continue;
        }
        // SDK error messages can contain request credentials; never expose them.
        throw new MenuError(
          status === 429
            ? 'Gemini 免费额度或速率受限，将自动稍后重试'
            : `Gemini 请求失败（${status || '网络超时'}），请检查模型与凭据`,
          502,
          status === 429 ? 'model_rate_limit' : 'model_http',
        );
      }
      this.stats.input_tokens += response.usageMetadata?.promptTokenCount || 0;
      this.stats.output_tokens += response.usageMetadata?.candidatesTokenCount || 0;
      const reason = response.candidates?.[0]?.finishReason;
      if (reason === 'MAX_TOKENS') throw new MenuError('模型输出截断', 422, 'output_truncated');
      if (reason !== 'STOP') throw new MenuError('Gemini 未返回完整菜单', 422, 'model_refusal');
      let result;
      try {
        result = JSON.parse(response.text);
      } catch {
        /* handled below */
      }
      if (!result || !validate(result)) {
        if (!repaired) {
          repaired = true;
          continue;
        }
        throw new MenuError('Gemini 输出未通过本地格式校验', 422, 'model_format');
      }
      if (boxes) {
        const swap = (b) => [b[1], b[0], b[3], b[2]];
        for (const table of result.tables || []) {
          table.bbox = swap(table.bbox);
          table.header_bbox = swap(table.header_bbox);
        }
        for (const record of result.records || []) record.cell_bbox = swap(record.cell_bbox);
      }
      validateResult?.(result);
      if (file) writeJson(file, result);
      return result;
    }
  }
}
module.exports = { GeminiClient, geminiSchema };
