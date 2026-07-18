# BabyLink 生产部署

生产环境由 Caddy、Fastify 和 PostgreSQL 三个容器组成。Caddy 是唯一公网入口；PostgreSQL、Fastify 容器端口和 NapCat 均不直接暴露。

## 1. 域名与防火墙

1. 将 `babylink.top` 和可选的 `www.babylink.top` A 记录指向服务器 IPv4。DNS 记录只填写 IP，不填写 `/24`。
2. 云安全组和服务器防火墙只向公网开放 TCP 80、TCP 443 和 UDP 443。
3. SSH 仅允许固定管理 IP，或改用 Tailscale/WireGuard；不要开放 3000、5432 和 NapCat 端口。
4. 如果服务器位于中国大陆，需要先完成 ICP 备案，并根据实际运营要求处理公安备案和隐私告知。

## 2. 环境变量

在服务器仓库根目录执行：

```bash
cd deploy
cp .env.example .env
```

必须替换以下值：

- `POSTGRES_PASSWORD`：仅使用 URL 安全的长随机字符，例如字母、数字、`_`、`-`。
- `CHALLENGE_SECRET`：至少 32 个随机字符，用于散列登录口令和签名短时下载票据。
- `ADMIN_TOKEN`：管理员 API 和安装包上传凭据。
- `NAPCAT_ACCESS_TOKEN`：NapCat 反向 WebSocket 独立凭据，不得与管理员 Token 相同。
- `NAPCAT_ACCOUNT`：专用机器人 QQ 号；首次扫码后用于容器重启时快速登录。
- `NAPCAT_MAC_ADDRESS`：固定的本地管理 MAC；首次登录后不要修改，避免 QQ 将容器识别为新设备。
- `ALLOWED_QQ_GROUPS`：逗号分隔的全部授权 QQ 群号。

生成随机值时可使用 `openssl rand -base64 48 | tr -d '\n'`。不要把 `deploy/.env`、数据库密码、NapCat Token 或 Android keystore 提交到 Git。

首次启动前创建专用于 NapCat 的稳定 machine-id；此文件已被 Git 忽略，首次扫码登录后不得删除或重新生成：

```bash
mkdir -p private
umask 077
test -s private/napcat-machine-id || openssl rand -hex 16 > private/napcat-machine-id
```

## 3. 首次启动

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app caddy
```

服务启动时会自动创建数据库表，并把 `ALLOWED_QQ_GROUPS` 写入授权群表。确认以下检查通过：

```bash
curl -fsS https://babylink.top/health
curl -I https://babylink.top/access
```

应用静态资源默认需要登录；未登录浏览器会跳转到 `/access`。健康检查、登录口令接口和 NapCat 入口是最小公开面。

## 4. NapCat 配置

使用专用 QQ 作为机器人，并让它加入 `ALLOWED_QQ_GROUPS` 中的全部群。NapCat 配置 OneBot 11 反向 WebSocket：

生产 Compose 固定了 NapCat 镜像摘要、hostname、MAC 和 machine-id。升级 NapCat 时应先备份 `napcat_qq`、`napcat_config` 卷及 `private/napcat-machine-id`，再显式更新镜像摘要；不要改回浮动的 `latest` 标签。

NapCat WebUI 只绑定服务器 `127.0.0.1:6099`，在本机建立 SSH 隧道后访问，禁止直接开放公网端口：

```bash
ssh -L 6099:127.0.0.1:6099 root@149.104.26.54
```

随后打开 `http://127.0.0.1:6099/webui`，首次 Token 可从 `docker-compose logs napcat` 查看并在页面中完成机器人 QQ 扫码登录。

- 地址：`wss://babylink.top/api/napcat/onebot`
- Access Token：与 `NAPCAT_ACCESS_TOKEN` 一致
- 如果 NapCat 配置界面不能发送 Authorization Header，可使用 `wss://babylink.top/api/napcat/onebot?access_token=<token>`
- 开启群消息、群成员增加和群成员减少事件。

同一 Compose 网络中也可以使用内部地址 `ws://app:3000/api/napcat/onebot?access_token=<token>`，避免经过公网；生产部署默认推荐该地址。

不要启用公网 OneBot HTTP Server。NapCat 应主动向 BabyLink 发起 WSS 连接。

用户注册流程：

1. 用户在 `/access` 输入 QQ。
2. 页面生成 `/link 绑定 XXXXXXXX`。
3. 用户必须用同一 QQ 在任一授权群发送该命令。
4. 服务器核对事件中的 `user_id`、`group_id` 和一次性口令后创建设备会话。

机器人连接后会自动同步所有群成员，之后每 `GROUP_SYNC_MINUTES` 分钟全量校准。退群事件会立即更新成员状态；当用户不再属于任何授权群时，其全部会话被撤销。

手动触发同步：

```bash
curl -X POST https://babylink.top/api/admin/napcat/sync -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 5. 管理接口

管理员接口只接受 `Authorization: Bearer <ADMIN_TOKEN>`：

- `GET /api/admin/overview`：用户、活跃会话和授权群概览。
- `PUT /api/admin/groups/:groupId`：新增、改名或停用授权群。
- `PUT /api/admin/users/:qq/status`：将用户设为 `active` 或 `banned`。
- `POST /api/admin/napcat/sync`：立即全量同步群成员。
- `PUT /api/admin/releases/upload`：上传 APK/IPA 并发布版本。

管理员 Token 只在受控终端使用，不放入网页、客户端、截图或群文件。

## 6. 用户数据与备份

- 聊天、角色、世界书、消息和 API 配置保存在用户设备 IndexedDB。
- Fastify/PostgreSQL 只保存 QQ、授权群成员状态、设备、会话、发布版本和安全审计。
- WebDAV 备份在浏览器端通过 PBKDF2-SHA-256 派生密钥并使用 AES-256-GCM 加密；服务器仅转发密文，不落盘。
- WebDAV 自动备份仅在应用运行或重新回到前台时执行，移动系统不会保证网页真正后台运行。
- 用户必须离线保存恢复密钥；密钥丢失后管理员也无法恢复备份。

账号数据库仍需每日异地备份：

```bash
docker compose exec -T postgres pg_dump -U link -d link | gzip > "link-auth-$(date +%F).sql.gz"
```

备份文件包含 QQ 号，必须加密保存并设置保留周期。

## 7. Android 固定签名与发布

Android release 更新必须永久使用同一份 keystore。先复制配置：

```bash
cd android
cp keystore.properties.example keystore.properties
```

把 keystore 放在 `android/`，填写真实密码。至少制作三份离线加密备份；丢失后已安装用户无法覆盖升级。
公开证书指纹记录在 `android/release-certificate.sha256`；每次发布前应确认 APK 签名指纹一致，keystore 本体和密码不得提交。

在安装 JDK 21 和 Android SDK 的构建机执行：

```bash
npm run build
npx cap sync android
cd android
./gradlew :app:assembleRelease
```

也可以在仓库 Actions 中手动运行 `Build signed Android APK`。首次使用前，把同一份 keystore 和配置写入以下 Actions Secrets：

- `BABYLINK_ANDROID_KEYSTORE_BASE64`
- `BABYLINK_ANDROID_STORE_PASSWORD`
- `BABYLINK_ANDROID_KEY_ALIAS`
- `BABYLINK_ANDROID_KEY_PASSWORD`

工作流会使用 JDK 21 构建 release，强制验证 APK v2 签名，并将签名证书 SHA-256 与 `android/release-certificate.sha256` 比对后才上传 artifact。

每次发布必须递增 `android/app/build.gradle` 中的 `versionCode`，并同步修改 `versionName`。随后从仓库根目录上传：

```bash
ADMIN_TOKEN='<admin-token>' node scripts/publish-release.mjs android android/app/build/outputs/apk/release/app-release.apk 2 1.1.0 1 '更新说明'
```

Android 原生壳会读取真实 `versionCode`，从登录接口取得 5 分钟下载票据，再跳转系统浏览器下载。APK 即使被转发，没有授权 QQ 仍不能进入应用。

## 8. iOS 用户自签

普通网页更新不需要重新打包 IPA。只有 Capacitor 插件、原生权限或壳配置改变时才需要新版本：

```bash
npm run build
npx cap sync ios
```

通过 Xcode 或现有 IPA 打包流程生成 IPA 后上传：

```bash
ADMIN_TOKEN='<admin-token>' node scripts/publish-release.mjs ios path/to/BabyLink.ipa 2 1.1.0 1 '更新说明'
```

仓库 Actions 中的 `Build unsigned iOS IPA` 可在 macOS runner 生成未签名 IPA 和相对路径 SHA-256 清单，不需要向 GitHub 提交 Apple 证书或描述文件。

用户下载后自行使用 Apple ID、AltStore、SideStore、Sideloadly 或其他合法方式签名。非 App Store 分发无法提供可靠的静默原生更新；免费 Apple ID 的签名有效期也由 Apple 决定。

## 9. 更新与回滚

更新代码：

```bash
git pull --ff-only
cd deploy
docker compose up -d --build
docker compose logs --tail=200 app caddy
```

静态网页更新由 PWA Service Worker 拉取。原生壳继续加载 `https://babylink.top`，所以绝大多数 UI 和业务更新无需重新发布 APK/IPA。

回滚时切回上一个经过验证的 Git 提交并重新构建。不要删除 PostgreSQL、Caddy 和 releases volumes。

## 10. 安全边界

登录、短时票据、设备限制、退群撤权和受保护静态资源只能提高二次传播门槛，不能阻止已授权用户截取页面或逆向客户端。不得把长期密钥放入 JavaScript、APK、IPA 或仓库；真正的授权判断始终由服务器完成。