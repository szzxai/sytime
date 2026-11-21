'use strict';
const sharp = require('sharp');
const { structuralTables, preview } = require('./images');
const { LAYOUT_SCHEMA } = require('./provider');
const { tablePrompt, reviewPrompt, SCHOOL_LABELS } = require('./prompts');
const { geminiTablePrompt, geminiReviewPrompt } = require('./gemini-prompts');
const { MenuError, TIMES, validateRecords } = require('./schema');

const text = { type: ['string', 'null'] };
const COMPACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    complete: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
    groups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: { type: 'string' },
          time: { type: 'array', items: { type: 'string', enum: TIMES } },
          places: { type: 'array', minItems: 1, items: text },
          group: text,
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string' },
                price_text: { type: ['string', 'null'] },
                spicy: { type: ['boolean', 'null'] },
              },
              required: ['name', 'price_text', 'spicy'],
            },
          },
        },
        required: ['date', 'time', 'places', 'group', 'items'],
      },
    },
  },
  required: ['complete', 'issues', 'groups'],
};
const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    groups: COMPACT_SCHEMA.properties.groups,
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['groups', 'problems'],
};
function normalizeGroups(groups) {
  // School proper noun: vision frequently mistakes 泮 for 洋 in this typeface.
  const label = (value) =>
    typeof value === 'string' ? value.replaceAll('洋水居', '泮水居').trim() : value;
  return groups.map((group) => {
    const rawName = label(group.group);
    const brackets = [...(rawName || '').matchAll(/[（(]([^）)]+)[）)]/g)]
      .map((match) => match[1].trim())
      .filter((place) => /楼|厅|居|校区/.test(place));
    const name = /课间/.test(rawName || '')
      ? '大课间'
      : brackets.length
        ? rawName.replace(/[（(][^）)]+[）)]/g, '').trim()
        : rawName;
    const time = name === '大课间' ? [] : group.time;
    // Explicit stall labels override a table-wide campus list. Derive the same
    // locations on every date, instead of asking vision to reinterpret them.
    const local = [...(name || '').matchAll(/([^、&＆]+?)(?:风味|现煮)/g)]
      .map((match) => match[1].trim())
      .filter(
        (place) => /楼|厅|居|校区/.test(place) && !/^[一二三四五六七八九十0-9]+楼$/.test(place),
      );
    return {
      ...group,
      group: name,
      time,
      places: [
        ...new Set(
          local.length
            ? local
            : brackets.length
              ? brackets
              : group.places.map((place) =>
                  label(place)
                    .replace(/(?:风味|现煮)$/, '')
                    .trim(),
                ),
        ),
      ],
    };
  });
}
function expandGroups(groups) {
  const rows = [];
  for (const g of normalizeGroups(groups))
    for (const item of g.items)
      for (const place of g.places)
        rows.push({
          date: g.date,
          weekday: null,
          time: g.time,
          place,
          group: g.group,
          name: item.name,
          spicy: item.spicy,
          price: parsePrice(item.price_text),
        });
  return rows.length ? validateRecords(rows) : [];
}
const identity = (rows) => JSON.stringify(rows.map((row) => JSON.stringify(row)).sort());
function parsePrice(value) {
  if (value === null || !String(value).trim()) return null;
  const raw = String(value).replace(/\s/g, '');
  if (/^(免费|免|0元)$/.test(raw)) return 0;
  const amounts = [...raw.matchAll(/(\d+(?:\.\d+)?)元/g)].map((m) => Number(m[1]));
  if (amounts.length === 1) return amounts[0];
  if (!amounts.length && /^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return null;
}

// Header grid measurements are per image. Date widths may differ when cells wrap;
// left-side meal/category labels are narrower and must never include earlier dates.
function dateColumns(edges, width) {
  for (let start = 1; start < edges.length - 2; start++) {
    const columns = edges.slice(start),
      widths = columns.slice(1).map((x, i) => x - columns[i]);
    if (columns[0] > width * 0.25) break;
    if (
      widths.length >= 3 &&
      widths.length <= 7 &&
      widths.every((w) => w >= width * 0.1 && w <= width * 0.35)
    )
      return columns;
  }
  return []; // Uncertain geometry stays as a complete table, never a guessed slice.
}

// Read complete tables using compact groups, then expand shared labels locally.
// This keeps repeated locations and dates out of the model's output budget.
async function extractMenuImage(image, source, model, { onProgress, imageIndex = 0 } = {}) {
  const gemini = model.config?.provider === 'gemini';
  onProgress?.('layout');
  const overview = await preview(image.data, 2400, 6000);
  const physical = await structuralTables(image);
  let regions = physical.map((table) => table.box);
  if (!regions.length) {
    const layout = await model.request({
      name: 'menu_layout',
      schema: LAYOUT_SCHEMA,
      prompt:
        '定位所有上下排列的菜单表格，含面档、早餐、加餐、午晚餐和夜宵。只返回表格区域和表头，不能遗漏底部。',
      images: [{ data: overview }],
      validateResult(value) {
        if (!value.complete || value.problems.length || !value.tables.length)
          throw new MenuError('无法确定菜单表格范围');
      },
    });
    // Model coordinates are approximate: full-width crops, padded at boundaries.
    regions = layout.tables.map((table) => {
      const top = Math.max(0, Math.floor((table.bbox[1] * image.height) / 1000) - 40);
      return {
        left: 0,
        top,
        width: image.width,
        height: Math.min(image.height, Math.ceil((table.bbox[3] * image.height) / 1000) + 40) - top,
      };
    });
  }
  const tasks = [];
  for (const [index, region] of regions.entries()) {
    const table = physical[index];
    let columns = [];
    if (table && region.height > 1200) {
      const { data, info } = await sharp(image.data)
        .extract({
          left: 0,
          top: table.header.top + table.header.height - 10,
          width: image.width,
          height: 8,
        })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const edges = [];
      for (let x = 0; x < info.width; x++) {
        let dark = 0;
        for (let y = 0; y < 8; y++) if (data[y * info.width + x] < 210) dark++;
        if (dark >= 7 && (!edges.length || x - edges.at(-1) > 5)) edges.push(x);
      }
      columns = dateColumns(edges, image.width);
    }
    if (columns.length) {
      const header = await sharp(image.data)
        .extract({
          left: Math.floor(image.width * 0.2),
          top: table.header.top + 5,
          width: Math.floor(image.width * 0.6),
          height: Math.floor(table.header.height / 2) - 6,
        })
        .png()
        .toBuffer();
      const context = await model.request({
        name: gemini ? 'menu_header_context_v1' : 'menu_header_context_v2',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string' },
            places: { type: 'array', items: { type: 'string' }, minItems: 1 },
          },
          required: ['text', 'places'],
        },
        prompt:
          '逐字转录菜单标题为text，places只列标题括号中明确的食堂或校区名称。不读菜品、不猜测。' +
          (gemini ? '' : SCHOOL_LABELS),
        images: [{ data: header, label: '原图完整菜单标题' }],
      });
      const labels = await sharp(image.data)
        .extract({ ...region, width: columns[0] })
        .png()
        .toBuffer();
      // Meal boundaries cross the first merged-label column. Splitting there
      // keeps entire labels and gives small chili icons enough input pixels.
      const { data: pixels, info: size } = await sharp(image.data)
        .extract(region)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const cuts = [0];
      const labelWidth = Math.max(12, Math.floor(columns[0] * 0.25));
      for (let y = table.header.height; y < region.height - 10; y++) {
        let dark = 0;
        for (let x = 8; x < labelWidth; x++) if (pixels[y * size.width + x] < 210) dark++;
        if (
          dark / (labelWidth - 8) > 0.85 &&
          y - cuts.at(-1) > region.height * 0.2 &&
          region.height - y > region.height * 0.15
        )
          cuts.push(y);
      }
      cuts.push(region.height);
      for (let c = 0; c < columns.length - 1; c++) {
        const left = columns[c],
          width = columns[c + 1] - left;
        const day = await sharp(image.data)
          .extract({ ...region, left, width })
          .png()
          .toBuffer();
        const data = await sharp({
          create: {
            width: columns[0] + width,
            height: region.height,
            channels: 3,
            background: 'white',
          },
        })
          .composite([
            { input: labels, left: 0, top: 0 },
            { input: day, left: columns[0], top: 0 },
          ])
          .png()
          .toBuffer();
        for (let b = 0; b < cuts.length - 1; b++) {
          const top = cuts[b],
            height = cuts[b + 1] - top;
          let band = await sharp(data)
            .extract({ left: 0, top, width: columns[0] + width, height })
            .png()
            .toBuffer();
          if (b > 0) {
            const dateHeader = await sharp(data)
              .extract({ left: 0, top: 0, width: columns[0] + width, height: table.header.height })
              .png()
              .toBuffer();
            band = await sharp({
              create: {
                width: columns[0] + width,
                height: height + table.header.height,
                channels: 3,
                background: 'white',
              },
            })
              .composite([
                { input: dateHeader, left: 0, top: 0 },
                { input: band, left: 0, top: table.header.height },
              ])
              .png()
              .toBuffer();
          }
          tasks.push({
            index,
            region,
            data: band,
            header,
            context,
            column: c + '-' + b,
            measured: {
              date_column: { left, width },
              meal_band: { top: region.top + top, height },
            },
          });
        }
      }
    } else
      tasks.push({ index, region, data: await sharp(image.data).extract(region).png().toBuffer() });
  }
  const records = [],
    evidence = [],
    blocks = [];
  try {
    for (const { index, region, data, header, context, column, measured } of tasks) {
      onProgress?.('recognize');
      const images = [
        { data, label: '待读取表格；若仅一个日期，只读取这个日期，保留左侧餐次与档口标签。' },
        ...(header
          ? [{ data: header, label: '完整表头：仅用于年份、地点与日期对应，其他日期不输出' }]
          : []),
      ];
      let result;
      let checked;
      const contextText = context
        ? '\n本表标题已经从原图转录：' +
          JSON.stringify(context) +
          '。这是本日期裁片继承的原表地点；明确局部档口可覆盖，不能因标题在第二图就认为地点不存在。'
        : '';
      let feedback = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result ||= await model.request({
            name: gemini ? 'menu_table_v6' : 'menu_table_v9',
            schema: COMPACT_SCHEMA,
            prompt: (gemini ? geminiTablePrompt : tablePrompt)({
              source,
              contextText,
              feedback,
              attempt,
            }),
            images,
            validateResult(value) {
              if (!value.complete || value.issues.length)
                throw new MenuError('菜单有未读清的内容：' + value.issues.join('；').slice(0, 500));
            },
          });
          result.groups = normalizeGroups(result.groups);
          checked = expandGroups(result.groups);
          onProgress?.('audit');
          const audit = await model.request({
            name: gemini ? 'menu_table_review_v8' : 'menu_table_review_v11',
            schema: REVIEW_SCHEMA,
            prompt: (gemini ? geminiReviewPrompt : reviewPrompt)({
              source,
              contextText,
              groups: result.groups,
            }),
            images,
          });
          if (audit.problems.length)
            throw new MenuError('菜单复核未通过：' + audit.problems.join('；').slice(0, 600));
          const reviewed = expandGroups(audit.groups);
          const stable = identity(checked) === identity(reviewed);
          result = { complete: true, issues: [], groups: normalizeGroups(audit.groups) };
          checked = reviewed;
          if (stable) break;
          if (attempt === 2) throw new MenuError('菜单复核结果未收敛，原有菜单保留');
        } catch (error) {
          if (
            attempt === 2 ||
            ['model_rate_limit', 'model_budget', 'model_http'].includes(error.code)
          )
            throw error;
          feedback =
            '\n上次读取未通过：' +
            error.message +
            '\n上次候选数据（必须对照原图，不是事实依据）：' +
            JSON.stringify(result?.groups || []);
          result = undefined;
        }
      }
      records.push(...checked);
      evidence.push({
        image_index: imageIndex,
        table_index: index,
        column,
        measured,
        bbox: region,
        groups: result.groups,
      });
      blocks.push({
        id: String(index) + ':' + (column ?? 'all'),
        bbox: region,
        records_count: checked.length,
      });
    }
    return { records: validateRecords(records), evidence, layout: { regions }, blocks };
  } catch (error) {
    error.menu_diagnostic = { image_index: imageIndex, partial_records: records, evidence, blocks };
    throw error;
  }
}
module.exports = {
  extractMenuImage,
  extractGeminiImage: extractMenuImage,
  COMPACT_SCHEMA,
  parsePrice,
  normalizeGroups,
  dateColumns,
};
