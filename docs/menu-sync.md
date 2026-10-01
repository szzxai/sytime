# 菜品目录与菜单同步运维

## 安装与初始数据

生产使用 Node.js 24+、`npm ci --omit=dev`、`npm start`。无需 Python、OCR 或第二个服务。启动自动创建菜单表，并仅向尚无成功数据的来源导入 `data/menu-bootstrap.json`；已有实时识别结果不会被种子覆盖。

十篇历史菜单 ID：11392、11389、11386、11380、11358、11354、11347、11343、11341、11333。原始 5,878 条经完全相同记录去重后为 5,874 条供应记录、1,243 道菜品。历史结果原为七字段，`spicy` 补为 `null`。种子来源于 szzx-menu 的 `table_run`，可能有历史识别错误，不能作为新识别的独立金标准。

开发者重建种子（生产无需执行）：

```powershell
python tools/build-menu-seed.py --menu-root ../szzx-menu
```

Python 3.10+，仅标准库，不需要 pip 依赖。脚本读取相邻仓库 `.scratch/table_run` 和 `.scratch/audit_10` 的上述十篇存档；运行时不会访问这些路径。排序始终在 Node 中生成。

## 开发者设置

登录当前角色为 `developer` 且未封禁的账号，进入「管理后台 → 菜单自动同步」。

1. 选择 OpenRouter，或填写自定义 HTTPS API Base URL。接口采用 `/chat/completions`，必须支持图片输入和严格 `json_schema`。
2. 填写 API Key 和视觉模型 ID，保存草稿。空 Key 保留旧值；切换提供商或地址须重新提供 Key。网站不替开发者选择模型或写入环境中已有凭据。
3. 点击「测试已保存配置」。网站生成随机菜品标识的图片，验证图片读取、免费价格、餐次、辣椒和八字段 JSON；测试失败不能开启自动同步。
4. 自行设置每日 HH:mm，默认 08:00，固定北京时间。测试通过后开启并保存「每日自动同步」。下方显示下一次执行时刻；立即同步可单独运行。

修改时间不会撤销模型测试、立即补跑或停止当前任务；今日已自动触发或新时间已过时，安排次日。自动同步每天最多一次，失败后通过手动重试修复。启动补最近一个有效遗漏时刻，分页发现遗漏文章；不会按停机天数逐日重复执行。启用或改时刻之前的遗漏不会被追补。

模型、提供商和 Key 改动使测试失效并关闭自动同步，已经运行的任务使用启动时快照。删除 Key 关闭同步并停止正在运行的任务和测试。接口每次读取数据库中的当前角色/封禁状态，降级账号的旧 JWT 也不能管理同步。

## 数据与识别

供应 JSON 固定八字段：`date`、`weekday`、`time`、`place`、`group`、`name`、`price`、`spicy`。日期是实际供应日期，未知为 null；餐次数组仅 morning/noon/evening/night；免费为 0，未知或单格多个金额为 null；辣椒未知为 null。名称保留繁简体、括号与组合套餐。相同名称共享稳定菜品 ID，不同日期/地点/档口/价格/辣椒仍为独立供应记录。

网站直接获取学校官网每周食谱栏目 `classid=36`，仅下载正文内联图片。外部图片、附件及跳转不会自动抓取；没有内联图片时，在后台补充该篇全部菜单图片（JPG/PNG/WEBP，最多六张，每张 10 MB）。补充会替换该篇输入，立即重新识别，原文摘要变化后旧补图失效。

识别在 Node worker 中进行：布局与表头定位、网格/标题行校准、重叠读取、逐格坐标证据、八字段校验、全图覆盖复核。重叠单元格按坐标只由一个区块纳入，完全相同供应再去重。跨区块标签不明时最多一次结合原图表头重读；模型输出截断会缩小区块，仍不明确或复核失败则整篇不发布。不能把模型的完整性声明理解为准确率保证；后台诊断与原图用于人工复核。

每轮最多识别十篇，未处理文章保留来源队列；近期十篇也会检查摘要，未变不调用模型。发现扫描最多十二页，未扫描完整不前移锚点；大量积压或官网结构变化需要查看任务诊断。每篇上限二十分钟、一百次模型请求（含重试），每请求超时两分钟。网络、429、5xx有限重试；格式错误最多一次修复。已成功来源原子替换，失败、取消或丢失租约不会提交部分菜单。

## 任务与故障

任务状态：运行中、已完成、部分失败、失败、已取消、已中断。逐篇显示获取/定位/识别/复核/校验阶段与记录数。详情支持原图放大、下载完整 JSON、下载诊断（区块、坐标、问题、模型请求及报告的 token/费用）；提供商未报告费用时不估算金额。

- 凭据/模型权限或 Schema 不支持：更换设置，保存并重新测试。
- 没有内联图片或图像不清：补充完整原图后重试。
- 日期矛盾、无法确定标签归属或漏项：核对诊断与图片，使用合适视觉模型或清晰补图；旧成功数据保留。
- 官网超时、robots 拒绝或结构改变：查看逐篇问题，修复来源解析后手动重试。robots 无有效快照时拒绝获取。
- 网站退出：未完成任务在租约过期后标为中断。重启或第二进程不能抢占有效租约；有效租约两分钟、每三十秒续约。停止后禁止该任务继续发布。
- 多位开发者同时编辑：设置版本冲突返回 409，刷新后重新保存。

## 持久化与备份

持久化 `data.db`、`uploads/`、`.private/`。`.private/menu-master.key` 是 API Key 的 AES-256-GCM 主密钥，首次保存 Key 自动生成；其他子目录存原图、补图、任务 JSON、诊断和模型/robots 缓存。此目录不由静态服务公开，已加入 `.gitignore`。Key 不写入浏览器存储、任务结果或日志。

备份时停止网站，复制以上目录并保留文件权限；数据库和主密钥必须配套恢复。遗失主密钥后 API Key 无法解密，自动同步停止，需要重新保存 Key 并测试。不要将生产主密钥、数据库凭据配置或私有任务文件提交 Git；仓库 `data.db` 是历史初始数据，本轮测试没有修改它。

## 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/dishes` | 公开目录、拼音字段、数量及更新时间 |
| GET/PUT | `/api/admin/menu-sync/settings` | 掩码设置、保存与下一次运行 |
| POST | `/api/admin/menu-sync/test` | 测试已保存配置 |
| GET/POST | `/api/admin/menu-sync/jobs` | 任务/来源列表、立即同步或补图 |
| GET | `/api/admin/menu-sync/jobs/:id` | 逐篇进度 |
| POST | `/api/admin/menu-sync/jobs/:id/retry` | 重试失败篇目 |
| POST | `/api/admin/menu-sync/jobs/:id/cancel` | 停止任务 |
| GET | `/api/admin/menu-sync/jobs/:id/artifacts/:kind?source_id=…` | menu、diagnostic、source JSON 或 image-N 原图 |

配置、模型测试、同步启动/停止/重试/补图仅允许 active developer。任务详情与原图/结果/诊断读取允许 active developer、super_admin、admin；资料通过带 Authorization 的请求获取，无公开静态下载地址。每次请求核对数据库中的当前角色及状态，旧 token 不保留撤销后的权限。

## 手动导入与修正

三种管理角色在“菜单手动导入”面板粘贴合法八字段数组，或选择菜单来源和已结束识图任务、载入结果、查看原图后修改。失败诊断中已完成图片及失败图片的部分候选都会进入编辑框，醒目标记为不完整。原始诊断与任务状态保留不变；人工发布另记审计。

“新建手动批次”不需要学校文章 ID、AI 配置或额外服务，也不会进入学校自动检索。编辑已有来源会替换全部供应记录，保留稳定菜品 ID；其他来源不受影响。预览执行本地严格类型、日历与星期校验、文本归一和完全重复项去重；发布重新计算预览摘要并检查版本、已核对标记和同步租约。同步运行中允许编辑，结束后才能发布。

`menu_sources` 增加 kind、publication_origin、revision，article_id 允许空值以表示真正的手动批次。启动自动迁移旧表，保留原有数据和外键。`menu_import_audit` 在发布事务内保存操作者、时间、任务、修订及归一化 JSON。完整备份 `data.db` 可恢复操作记录。学校人工更正保留图片摘要，未变图片的普通自动检查会跳过；新图或强制识图可能覆盖人工更正。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/admin/menu-sync/imports` | 来源、已结束任务选项与最近 50 条人工操作记录，不返回 AI 配置 |
| GET | `/api/admin/menu-sync/imports/source?source_id=…&job_id=…` | 已发布记录或指定任务候选；job_id 可省略 |
| POST | `/api/admin/menu-sync/imports/preview` | `{json_text,title?,source_id?,expected_revision?,job_id?}` → 归一化 records、计数、digest |
| POST | `/api/admin/menu-sync/imports` | 预览参数加 `{digest,reviewed:true}`，原子发布并返回修订；编辑须携带所载入版本 |
| GET | `/menu-json-rules.md` | 公开的详细格式与图片读取规则 |

格式与操作说明见 [menu-json-rules.md](../menu-json-rules.md)。[szzx-menu.skill](../szzx-menu.skill) 可用于 AI 直接读图生成 JSON，不依赖网站的 Key；技能校验脚本只检查格式。`npm run build:menu-skill` 同步规则与生成包，`npm run test:menu-skill` 验证，均为开发操作。

## 验证与上游

`npm run test:menu` 运行隔离的后端测试，`npm run test:ui` 运行浏览器与 axe 回归，`npm test` 依次执行两者。`npm run test:deploy` 验证全新 Node 生产依赖安装。可选 `npm run test:menu:live` 使用环境中的 OpenRouter Key 和指定 `MENU_TEST_MODEL` 做真实接口/三图验证，需提供开发存档；它会产生实际 API 用量，不是生产运行依赖。测试产物位于忽略的 `output/`，实测结果和限制见 [验证记录](./menu-validation.md)。

来源解析移植自 [szzx1000](https://github.com/szzxvc/szzx1000)，分块规则参考 [szzx-menu](https://github.com/szzxvc/szzx-menu)，保留 AGPL-3.0 许可。运行依赖 sharp、cheerio、Ajv、pinyin-pro；精确版本见 package-lock。接口规范参考 [OpenRouter 图片输入](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding)与[结构化输出](https://openrouter.ai/docs/guides/features/structured-outputs)。
