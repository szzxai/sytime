<div align="center">

  <!-- 请在此处替换您的 Banner 图片路径 -->
  <img src="./docs/assets/banner.svg" alt="拾光酥糕" width="100%" />

  <br />

  <p><b>苏州中学最大的校园信息平台</b></p>

  <p>
    <a href="https://github.com/szzxai/sytime/blob/main/LICENSE">
      <img src="https://img.shields.io/github/license/szzxai/sytime?style=flat-square&color=1b7f4b" alt="License" />
    </a>
    <a href="https://github.com/szzxai/sytime/stargazers">
      <img src="https://img.shields.io/github/stars/szzxai/sytime?style=flat-square&color=1b7f4b" alt="Stars" />
    </a>
    <a href="https://github.com/szzxai/sytime/issues">
      <img src="https://img.shields.io/github/issues/szzxai/sytime?style=flat-square&color=1b7f4b" alt="Issues" />
    </a>
    <a href="https://github.com/szzxai/sytime/contributors">
      <img src="https://img.shields.io/github/contributors/szzxai/sytime?style=flat-square&color=1b7f4b" alt="Issues" />
    </a>
  </p>

  <p>
    <!--<a href="https://your-website-url.com">🌐 在线访问</a> · -->
    <a href="https://github.com/szzxai/sytime/issues">💬 问题反馈</a>
  </p>

</div>


## 简介

**拾光酥糕**是由**苏州中学人工智能实验室**开发并维护的校园综合信息平台。项目致力于为苏高学子提供便捷的校园生活指引，涵盖校园地图、食堂菜谱与评价、必吃榜等功能。

## 反馈与共建

我们欢迎任何形式的贡献与建议。如果你在使用过程中遇到问题，或对新功能有任何想法，欢迎提交 [Issue](https://github.com/szzxai/sytime/issues) 或直接发起 [Pull Request](https://github.com/szzxai/sytime/pulls)。

参与开发请阅读[架构与运行说明](./docs/architecture.md)及[公开仓库准备](./docs/public-release.md)。源码不包含运行站点的账号、学生资料或上传内容；安全问题请按[安全反馈说明](./SECURITY.md)私下联系。

生产环境、NAT 反代及可信代理配置见[部署说明](./docs/deployment.md)。

## 开源协议

本项目基于 [GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE) 协议开源。

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/szzxai">苏州中学人工智能实验室</a></sub>
</div>

### 社盟单点登录配置

学生通过苏州中学社团管理系统的 OpenID Connect 登录，首次登录自动建立 `student` 账号并同步真实姓名。管理员及全部现有本地账号继续使用原用户名、密码和角色。登录页提供两个入口。

在社盟后台为拾光酥糕创建独立的 Confidential / Authorization Code 应用，使用 RS256 与 PKCE S256，然后在服务端环境配置：

```dotenv
APP_ORIGIN=https://你的站点域名
OIDC_ISSUER=https://szzxclubunion.cn/o
OIDC_CLIENT_ID=社盟分配的客户端标识
OIDC_CLIENT_SECRET=社盟分配的客户端密钥
```

向社盟登记精确地址：回调地址为 `<APP_ORIGIN>/api/sso/callback`，登出回跳地址为 `<APP_ORIGIN>/login.html`。密钥通过服务端环境注入。配置尚未完成时，社盟登录页会提示稍后重试，现有账号密码登录可继续使用。

iOS 通过系统认证浏览器完成同一服务端流程，使用绑定客户端校验值、有效期 60 秒的一次性凭证返回 App，再向本站兑换会话；社盟后台登记的仍是上述 HTTPS 回调地址。

启动时执行账号迁移，保留现有本地账号及其资料、角色、收藏和内容，清理旧学生认证申请、认证通知与绑定表。部署前备份数据库。学生封禁与解封由本站管理，每次登录及身份操作按本站状态执行。
