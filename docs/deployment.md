# 生产部署

本站地址为 `https://time.szzxclubunion.cn`。公网 Nginx 按域名单独配置虚拟主机和 TLS 证书，将请求转发至 NAT VPS 的映射端口。

## 环境

使用满足项目 engines 的 Node.js，执行 `npm ci --include=dev`、`npm run build`，然后可执行 `npm prune --omit=dev`。在项目根目录运行 `npm start`，通过 systemd 等进程管理器设置工作目录、环境变量、自动重启及日志。

```dotenv
NODE_ENV=production
APP_ORIGIN=https://time.szzxclubunion.cn
PORT=3000
JWT_SECRET=请替换为独立生成的至少32字节随机密钥
TRUSTED_PROXIES=
OIDC_ISSUER=https://szzxclubunion.cn/o
OIDC_CLIENT_ID=社盟分配的客户端标识
OIDC_CLIENT_SECRET=社盟分配的客户端密钥
```

社盟回调地址为 `https://time.szzxclubunion.cn/api/sso/callback`，登出回跳地址为 `https://time.szzxclubunion.cn/login.html`。客户端使用 Authorization Code、RS256 和 PKCE S256。

## 可信代理与 NAT

`TRUSTED_PROXIES` 为逗号分隔的 IP 或 CIDR，默认留空，不信任任何转发头。部署后填写应用实际看到的代理 socket 来源地址，以及可信中间代理地址。IPv4、IPv6 和 IPv4-mapped IPv6 均支持。不要配置 `0.0.0.0/0` 或 `::/0`。

应用从 socket 对端开始，自右向左检查 `X-Forwarded-For`，到第一个非可信地址即停止。只有可信代理提供的头才参与登录、SSO 和申诉限流。若 NAT 将来源统一改成网关地址，应配置实际网关 IP，并在网络层确保该映射端口只允许公网反代机器连接，否则不可信客户端也能冒充可信代理。

公网边缘 Nginx 应覆盖客户端传入的转发头，例如以下指令放在本站对应的代理 location 中：

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
client_max_body_size 64m;
```

如果边缘前面还有 CDN，需要先按 CDN 官方地址范围配置可信 real-IP 来源，确保 `$remote_addr` 可信。回源链路跨公网时使用 TLS 或加密隧道。API 不启用共享代理缓存，不改写本站 Cookie 到父域，不复用主站的 Cookie 改写规则。HTTP 重定向至 HTTPS。

应用为所有响应添加防嵌入 CSP、`X-Frame-Options: DENY`、`nosniff` 和 Referrer 策略；HTTPS 生产配置还添加仅本域生效的 HSTS。此 CSP 只限制嵌入、base 和插件，不限制现有脚本、样式和图片来源。

## 发布前

- 在 `apps/web/src/pages/LegalPages.tsx` 填写用户协议和隐私政策正文，目前按运营者要求留空。
- 备份 `data.db`、`uploads/`、`.private/` 和环境配置，保存到非公开位置并验证恢复。更新前停服备份或使用 SQLite 在线备份接口，不直接复制正在写入的数据库文件。
- 旧数据库首次应用 `0001_menu_rebuild.sql` 会清空旧菜单、菜品和评价；确认迁移历史与数据保留需求后再启动。
- 单实例运行应用，确保运行目录及数据库可写。自动菜单同步需要从内地 VPS 实测学校网站和配置的模型服务连通性。
- 验证域名首页、协议页面、正式社盟登录及回跳、管理员登录、上传、重启后数据保留和端口访问限制。
