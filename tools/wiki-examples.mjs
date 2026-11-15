/** Local acceptance fixtures. Explicit opt-in; never runs during server startup. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createDatabase, query } from '../packages/db/src/client.ts';
const require = createRequire(import.meta.url);
const store = require('../apps/api/src/domain/wiki/store.js');
const root = path.resolve(import.meta.dirname, '..');
const filename = path.resolve(process.argv[2] || path.join(root, 'data.db'));
if (!fs.existsSync(filename)) throw new Error(`Start the development server first: ${filename}`);
const db = createDatabase(filename);
const articles = [
  {
    title: '排版示例：校园阅读指南',
    aliases: ['Wiki 排版验收'],
    markdown: `> 这是一篇用于界面验收的示例文章，文中信息不代表实际开放安排。

这里记录校园里的阅读空间。中文与 English 混排，标点、1234567890、**粗体文字**、*斜体文字*和 ~~删除文字~~ 都应保持自然的阅读节奏。

## 找到适合自己的位置

从一段普通正文开始：阅读可以是课间十分钟的放松，也可以是一整个下午的探索。文章使用 Material for MkDocs 的默认正文宽度、字体和行距。

### 开始之前

- 带上想读的书。
- 将手机调至静音。
  - 保持公共空间安静。
  - 离开前整理桌面。

### 一份小小的清单

1. 浏览目录，选择主题。
2. 阅读正文，记录疑问。
3. 沿着参考资料继续探索。

- [x] 找到座位
- [ ] 归还书籍

## 表格与链接

| 空间 | 适合的活动 | 备注 |
| :--- | :--- | :--- |
| 阅览区 | 安静阅读 | 示例信息 |
| 讨论区 | 交流与分享 | 示例信息 |

[Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) · [[没有小标题的校园随笔]]

## 提示与折叠

!!! note "阅读提示"
    提示框中的正文使用更紧凑的字号。它也可以包含 **强调** 与 [链接](https://example.com)。

!!! warning "请留意"
    这里的开放时间仅供演示，请以学校实际通知为准。

??? tip "展开一段校园故事"
    雨后的走廊里，书页和树叶都带着清新的气息。

## 代码与引用

行内代码 \`const campus = '苏中'\` 与正文的基线自然对齐。

\`\`\`javascript
const message = 'Hello, campus!';
console.log(message);
\`\`\`

> 我们把知道的校园写下来，是为了让后来的人少一点陌生，多一点好奇。
>
> 这段引用也用于检查连续段落的间距。

---

### 更小的标题

#### 四级标题

普通段落的字距和行距不应受到全站其他样式的影响。

##### 五级标题

The quick brown fox jumps over the lazy dog.

###### 六级标题

文章结束。`,
  },
  {
    title: '没有小标题的校园随笔',
    aliases: [],
    markdown: `> 这是一篇用于验证“无目录大纲”状态的示例文章。

午后的风从窗外吹进来，桌上的书页轻轻翻动。走廊里传来脚步声，又很快安静下来。校园里那些熟悉的声音，常常藏着最平凡也最值得记住的时刻。

这篇文章刻意没有任何二级或三级标题，因此右侧不应该出现空白目录的标题、占位说明或无效按钮。正文会按照 Material for MkDocs 的规则利用余下的空间。

你可以从左侧目录切换到其他示例，或回到 [[排版示例：校园阅读指南]]。`,
  },
  {
    title: '长文示例：校园里的四季',
    aliases: [],
    markdown: `> 用于验证长文章滚动、大纲高亮与锚点跳转的示例文章。

${['春：草木新生', '夏：树荫与蝉鸣', '秋：银杏落叶', '冬：安静的操场']
  .map(
    (title, i) => `## ${title}

${Array.from({ length: 6 }, (_, n) => `第 ${i + 1} 章，第 ${n + 1} 段。我们沿着校园的小路慢慢走，穿过树影与教学楼之间的空地。每一次回望，都能发现一处新的细节。The campus changes with the seasons, while familiar paths connect our everyday stories.`).join('\n\n')}

### 留下一份观察

选择一个你熟悉的角落，记录今天的光线、声音与心情。`,
  )
  .join('\n\n')}`,
  },
];
try {
  const ids = db.$client
    .transaction(() => {
      const username = '__wiki_examples__';
      let user = query(db, 'SELECT id FROM users WHERE username=?').get(username);
      if (!user)
        user = {
          id: Number(
            query(db, 'INSERT INTO users(username,nickname,role) VALUES(?,?,?)').run(
              username,
              'Wiki 示例',
              'user',
            ).lastInsertRowid,
          ),
        };
      const folder = (name, parent = null) => {
        const old = query(
          db,
          'SELECT id FROM wiki_folders WHERE name=? AND parent_id IS ? AND deleted_at IS NULL',
        ).get(name, parent);
        return (
          old?.id ||
          Number(
            query(db, 'INSERT INTO wiki_folders(name,parent_id,position) VALUES(?,?,?)').run(
              name,
              parent,
              900,
            ).lastInsertRowid,
          )
        );
      };
      const top = folder('示例文章');
      const reading = folder('阅读与排版', top);
      // Retire only the obsolete, unused acceptance folder from earlier seeds.
      query(
        db,
        `UPDATE wiki_folders SET deleted_at=unixepoch() WHERE name=? AND parent_id=? AND deleted_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM wiki_entries WHERE folder_id=wiki_folders.id AND deleted_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM wiki_folders child WHERE child.parent_id=wiki_folders.id AND child.deleted_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM moderation_requests WHERE status='pending' AND kind IN ('wiki_create','wiki_edit') AND json_extract(payload,'$.folder_id')=wiki_folders.id)`,
      ).run('空目录（验收用）', top);
      return articles.map((article) => {
        const existing = query(
          db,
          `SELECT e.id FROM wiki_entries e JOIN wiki_revisions r ON r.id=e.current_revision_id WHERE e.deleted_at IS NULL AND e.folder_id=? AND r.title=?`,
        ).get(reading, article.title);
        if (existing) return existing.id;
        return store.publish(
          db,
          { id: null, kind: 'wiki_create', user_id: user.id },
          { ...article, folder_id: reading, images: [], sources: [], summary: '本地界面验收示例' },
          user,
        );
      });
    })
    .immediate();
  ids.forEach((id, index) =>
    console.log(`${articles[index].title}: http://localhost:5173/wiki.html?id=${id}`),
  );
} finally {
  db.$client.close();
}
