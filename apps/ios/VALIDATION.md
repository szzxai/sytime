# iOS 验证记录

2026-11-15，本机 Xcode 27.2，iOS / iPadOS 27.2，原生 SwiftUI 应用。

| 检查 | 结果 |
| --- | --- |
| iPhone 18 Pro | 17 项单元 / API 测试及 5 项 UI 测试通过 |
| iPad Pro 13-inch (M5)，深色模式 | 17 项单元 / API 测试通过；校园、横屏、Wiki、店铺双栏 UI 通过；登录键盘与导航定位修正后，登录 / 食谱和店铺专项回归通过 |
| iPhone Duo，常规显示模式 | 17 项单元 / API 测试通过；校园、横屏、Wiki UI 通过；滚动定位修正后，登录 / 食谱和店铺专项回归通过 |
| iOS device Release，未签名 | 构建通过 |
| 收藏夹重命名后端测试 | 所有权、输入验证、隐私保持、列表同步通过 |
| TypeScript 类型检查、Swift 格式检查、相关 JS / YAML 格式检查 | 通过 |
| 仓库公共安全检查 | 通过，无发现 |

真实 API 联调使用 `scripts/test-server.cjs` 创建的临时数据库，未操作仓库运行数据库。覆盖登录、资料、食谱、店铺、收藏添加去重与重命名、评价审核提交与撤回、工单、退出会话失效，以及 Wiki 历史快照、修改锁定、公开内容保持与撤回解锁。

界面截图已人工检查：首页、食谱供应、校园目录与横屏、账号登录、原生 Wiki、iPad 深色与店铺双栏。截图由 XCTest / simctl 导出，未使用浏览器或桌面自动化操作。

本机 XCTest 结果（临时路径，不随仓库分发）：

- `/tmp/sytime-iphone-verified.xcresult`
- `/tmp/sytime-ipad-verified.xcresult` 与 `/tmp/sytime-ipad-login-fixed.xcresult`：后者为修正后的专项回归。
- `/tmp/sytime-duo-clean.xcresult` 与 `/tmp/sytime-duo-navigation-fixed.xcresult`：后者为修正后的专项回归。

## 未计入通过的范围

Duo 的双显示屏电源切换触发模拟器 SpringBoard 崩溃；常规模式在新建的干净 Duo 模拟器中完成回归。该电源操作不等同于折叠姿态切换，因此尚不能宣称真机展开 / 折叠转换验证通过。应用根据可用窗口宽度响应布局，仍需稳定运行时或真机验证状态转换。

正式 HTTPS 域名已配置为 `https://time.szzxclubunion.cn`，站点尚未上线；未配置 Apple Developer 开发团队、生产签名与 App Store Connect 元数据；未向 TestFlight 或 App Store 上传。CI 工作流已添加，本记录仅证明本机执行结果，不代表远端 CI 已执行。
