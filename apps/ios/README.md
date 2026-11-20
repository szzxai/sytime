# 拾光酥糕 · iOS

原生 SwiftUI App，与 Web / API 位于同一仓库。最低 iOS / iPadOS 26；使用系统 Liquid Glass 导航栏、标签栏、工具栏和按钮，无 WebView，无第三方 iOS 运行时依赖。

## 在 Xcode 运行

打开 `apps/ios/Sytime.xcodeproj`，选择 `Sytime` scheme 和 iPhone、iPad 或 iPhone Duo 模拟器即可运行。工程已提交，不需要先安装 XcodeGen。当前在 Xcode 27.2 / iOS 27.2 验证。

默认连接官方站点 `https://time.szzxclubunion.cn`（尚未上线），用户无需配置。在「我的 → 设置 → 服务器地址」保留手动切换入口。开发时可切换为 `http://localhost:3000`（Debug 构建），或使用 `-serverURL` 启动参数。地址由 Info.plist 的 `SytimeServerURL` 提供，已保存的有效地址优先。

真机运行需在 Signing & Capabilities 选择开发团队，确认 Bundle ID `cn.szzxai.sytime.ios` 可用。Release 仅允许 HTTPS；Debug 允许本机和局域网 HTTP 联调。凭证按服务器 origin 隔离并保存在 Keychain，切换站点不会把旧凭证发给新站点。

## 功能

- 首页、公告、关于、校园地图：离线内置校园简图与地点目录，支持双指缩放、连续旋转、搜索、别名、分类和地点说明。
- 食谱：今日 / 明日、周食谱、供应筛选、地点与价格合并、菜品详情、评价与配图、审核提交。
- 周边店铺：搜索 / 筛选 / 排序、MapKit 地图、坐标转换、导航链接、点赞、评价、推荐、收藏及公开收藏。
- 校园 Wiki：目录、搜索、随机阅读、原生 Markdown、图片、章节跳转、贡献者、历史版本及文字差异；新建 / 编辑、预览、上传、按账号和站点隔离的本地草稿、审核锁定、目录及词条治理。
- 账号：社盟单点登录 / 现有账号密码登录 / 退出、真实姓名同步、公开资料、头像及资料变更审核、本站密码、会话撤销、偏好、主题、消息、申请与撤回、工单、头衔。
- 管理：概览、分类审核与图片预览、用户权限与封禁、工单、公告 / 横幅 / 系统消息、头衔与规则、Wiki 管理、审计记录。

iPad 使用可适配的系统侧边导航；校园导览与店铺列表在宽屏提供并排内容。窄屏、横屏和 Duo 使用可用窗口宽度适配。支持深浅色、系统字体缩放、VoiceOver 标签和原生链接。`sytime://dish?id=…`、`shop`、`user`、`wiki` 等链接进入对应原生页面。Universal Links 需正式域名及服务端 AASA 后另行启用。

## 构建与测试

```sh
# 自动选择本机可用 iPhone 模拟器，运行测试，再构建设备 Release（不签名）
apps/ios/scripts/verify.sh

# 指定 iPad / Duo 等模拟器
SYTIME_SIMULATOR_ID='<simulator UUID>' apps/ios/scripts/verify.sh
```

单元测试覆盖 JSON、日期、口令、origin / URL 安全、认证错误、校园数据、坐标转换、食谱合并及 Markdown。XCUITest 覆盖原生导航、校园目录及横屏。真实 API 和网络 UI 测试默认跳过，使用下面的独立临时服务开启：

```sh
npm ci
# 终端 1：创建临时数据库及测试账号，关闭时自动清理；不打开仓库运行数据库
node --import tsx apps/ios/scripts/test-server.cjs

# 终端 2
TEST_RUNNER_SYTIME_LIVE_TESTS=1 apps/ios/scripts/verify.sh
```

测试服务仅监听 `127.0.0.1:4387`，预置公开食谱、测试店铺、Wiki 和 `ios_student` / `ios_admin` / `ios_user` 测试账号，口令 `CampusTest2026`。仅用于可丢弃的本地联调。Debug Scheme 启动参数 `-serverURL http://127.0.0.1:4387` 可直连模拟器测试服务。

CI `.github/workflows/ios.yml` 在 iOS 文件变更时执行模拟器测试及未签名 Release 构建。真实服务器测试需本地显式开启。

## 维护

- `Sytime/Core`：API、会话、动态表单、可重试资源、媒体及 Markdown。
- `Sytime/Features`：按功能划分的原生页面。
- `Sytime/Resources`：地图、地点数据、品牌图、图标、隐私声明。
- `project.yml`：工程定义。增删 Swift 文件后执行 `xcodegen generate --spec apps/ios/project.yml`，并保留生成工程。
- `node --import tsx apps/ios/scripts/sync-resources.mjs`：从校园矢量地物、地点目录及 favicon 同步资源，需仓库依赖和 Playwright Chromium。仅开发时使用，App 不包含浏览器运行时。

后端额外补充了 `PUT /api/collections/:id` 重命名接口，带所有权和名称校验，测试位于 `tests/ios-collections.test.cjs`。其余功能复用现有 API。并行开发产生的 Wiki 后端和 Web 变更由各自任务维护。

## 上架配置

发布前需上线正式站点、填写 Apple Developer 团队、确认最终 Bundle ID，配置 App Store Connect 的隐私政策 / 支持链接和隐私回答，再用真机验证生产站点、通知与账号流程。当前未配置推送服务（站内消息在前台定时刷新），未上传 TestFlight 或发布 App Store。模拟器验证不能替代 Duo 真机折叠状态、真实网络及签名验证。当前 Duo 双显示屏的电源切换曾触发模拟器 SpringBoard 崩溃，不能将该操作视为展开状态适配通过；正式交付前须在稳定的 Duo 运行时或真机继续验证。
