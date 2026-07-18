# Link

Link 是一个移动端优先的 Vue 3 + Vite + PWA 角色扮演聊天应用原型，界面参考 LINK 的 Home、VOOM 与聊天房间体验。

## 功能

- 四个底部 Tab：主页、VOOM、Music、Fanfic；主页内可切换 Chats、Group、Friends 与 All 会话列表。
- 同一个 conversation 支持线上聊天和线下长文本 RP 两种渲染。
- 支持邀请当前账号绑定角色与多个自定义 NPC 创建群聊，也可选择一个或多个绑定角色后调用 API 搜索并加入 3–6 个模拟既有群聊。
- 群聊保存群主、成员、公告和历史消息；每条消息记录明确作者，已有角色与用户在 AI 上下文中始终使用真名。
- 群聊角色会读取其私聊/线下 RP 的共同楼层、摘要、记忆和局部世界书；群聊事件会以隐藏上下文同步回角色私聊，保持跨会话连续性。
- 进入线下模式会切换会话模式与提示词，退出后切回线上模式。
- 用户人设、角色名称、头像、角色资料、朋友圈频率可编辑。
- IndexedDB 本地存储用户、角色、会话、消息、VOOM、世界书和 API 设置。
- 设置页支持本地导入导出、端到端加密 WebDAV 自动备份，以及 GitHub 私有仓库备份。
- 生产服务支持 QQ 群一次性口令注册、NapCat 多群成员校验、设备管理、退群撤权和受保护安装包发布。
- 世界书分为线上全局、线下全局、局部世界书；每本世界书支持多个可单独开关的条目、绿灯关键词触发、蓝灯常驻注入和黄灯优先注入，局部世界书可绑定到角色。
- VOOM 可手动生成，也可在 AI 回复后按角色频率低频自动生成。
- PWA manifest 与 service worker 已配置，可在移动浏览器安装。

## API

设置页的 API 分栏可以配置 OpenAI 兼容文本模型供应商：

- `API Url`：供应商根地址，例如 `https://api.openai.com/v1` 或 `https://api.example.com/v1`。
- `API 路径`：聊天补全路径，通常是 `/chat/completions`。
- `API Key`：请求时作为 Bearer token 发送。
- `Model`：在“选择模型”里同步或手动选择后传给接口。

本地 `npm run dev` 与 `npm run preview` 会把远端文本模型请求优先转发到同源代理，避免浏览器直连 OpenAI 兼容网关时被 CORS 拦截。如果部署到纯静态站点，请使用支持浏览器跨域的网关，或自行部署同源后端代理。

如果不填写供应商，应用会提示先配置 API 模型，方便在发起真实回复前检查设置。

### 群聊

- 在 Add 页切换到“创建群聊”，可以邀请当前账号绑定角色，并添加多个带真名、群昵称、头像和角色设定的自定义 NPC。
- 在 Add 页切换到“加入群组”，选择角色后点击“查找群聊”。搜索会调用当前文本 API，并读取所选角色的设定、局部世界书、线上/线下会话与记忆。
- 候选结果展示群名、成员、群主、公告和最近消息；点击“加入”后才会写入 IndexedDB。
- 群聊输入区的“发送”只发送用户消息，“回复”会在发送后调用 API，由群内合适的一个或多个成员自然回复。
- 群聊支持引用、撤回、@成员、Stickers、本地/描述图片、录音/文字语音；长按消息可复制、引用、撤回或仅删除本地记录。
- 加号菜单支持邀请当前账号绑定的角色、重新生成上一轮群回复、退出群聊和删除群聊；受邀角色会带着已有设定与连续记忆成为真实群成员。
- 退出后会保留群聊与历史，可继续调用 API 旁观群成员聊天、使用固定匿名小号发言，或重新申请加入并由 AI 扮演的群主/管理员按群关系通过或拒绝。
- 群主和管理员可修改群名与公告；所有在群成员都可通过 URL 或本地上传裁剪修改群头像，修改后自动保存。
- 群设置可绑定多个 Stickers 分组，群内任何 AI 成员都可从绑定分组中发送 Stickers。
- 邀请成员、退出、申请、审批及资料变更都会写入群聊系统事件并同步角色上下文。
- 群资料可分别开启主动群消息并设置频率。
- 群聊回复可以由 AI 判断是否让某位已有角色转到线上私聊主动联系用户，群事件会先写入该角色的连续上下文。

## 数据备份

设置页底部的“备份”分栏提供三种数据保护方式：

- `导出备份`：下载当前 IndexedDB 快照，包含用户、角色、会话、消息、VOOM、世界书、Stickers 与设置。
- `导入备份`：选择此前导出的 JSON 文件并替换当前本地数据。
- `加密 WebDAV`：用户填写自己的 WebDAV 账号，备份在当前设备使用 AES-256-GCM 加密后再上传，服务器不保存云盘凭据和备份文件。
- `恢复密钥`：密钥仅保存在当前设备并从所有导出快照中清除，跨设备恢复前必须由用户自行保存和填写。
- `GitHub 登录`：配置 Cloudflare Worker 后会打开 GitHub OAuth 授权页，授权完成后自动回到 LINK。
- `GitHub 自动备份`：OAuth 登录成功后会自动创建私有仓库、开启自动备份并完成首次备份；也可以手动填写 token 后连接账号。
- `导入 GitHub 备份`：连接 GitHub 后，可直接把私有仓库里的备份文件拉回本地并覆盖当前 LINK 数据。
- `自动检测恢复`：登录 GitHub 后如果检测到仓库里已有较新的备份，会提示是否恢复到当前设备，避免先覆盖云端旧数据。
- `历史备份列表`：设置页会显示最近三次 GitHub 备份记录，可按某一个历史版本恢复。
- `备份可视化`：设置页会显示最近同步状态、手动/自动备份进度条，以及导入恢复阶段进度。

GitHub token 需要具备创建私有仓库和写入仓库内容的权限。所有导出快照会清空 GitHub token、WebDAV 密码和 WebDAV 恢复密钥。隐私要求较高时优先使用端到端加密 WebDAV。

## QQ 群访问控制

生产服务使用 Fastify、PostgreSQL 与 NapCat OneBot 11 反向 WebSocket：

- 用户输入 QQ 后获得 5 分钟一次性口令，并必须用同一 QQ 在任一授权群发送绑定命令。
- 每台新设备独立验证，默认每个 QQ 最多三台设备；用户可在备份设置页移除设备。
- NapCat 监听进群/退群事件并定时全量同步多个授权群；不再属于任何授权群的账号会被撤销会话。
- 应用只在服务器保存最少账号元数据，聊天和角色数据继续保存在用户本地。

### GitHub OAuth Worker

项目内置 `workers/github-oauth`，用于安全保存 GitHub OAuth secret 并把授权结果回传给 PWA。

1. 在 GitHub 创建 OAuth App：
	- `Authorization callback URL` 填 `https://<你的 Worker 域名>/github/callback`。
	- 记录 `Client ID` 和 `Client Secret`。
2. 把 `workers/github-oauth/wrangler.toml` 里的 `APP_ORIGIN` 改成你的 PWA 域名；本地开发可保留 `http://localhost:5173`。
3. 部署 Worker：

```bash
cd workers/github-oauth
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put OAUTH_STATE_SECRET
npx wrangler deploy
```

4. 在前端环境变量里配置 Worker URL：

```bash
VITE_GITHUB_OAUTH_WORKER_URL=https://link-github-oauth.<your-subdomain>.workers.dev
```

配置后，设置页的“GitHub 登录”会走 Worker OAuth；未配置时仍会退回 GitHub token 创建页。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run build:server
npm run build:all
npm run preview
```

## 生产部署

域名、Caddy HTTPS、Docker Compose、NapCat、数据库备份、Android 固定签名、iOS 自签和安装包发布的完整步骤见 `deploy/README.md`。

生产环境不使用 GitHub Pages：纯静态托管无法执行 QQ 群鉴权、退群撤权、WebDAV 安全中转和受保护安装包下载。

## 目录

- `src/pages`：五个 Tab 页面、聊天详情和线下 RP 页面。
- `src/components`：按功能拆分的 UI 组件。
- `src/stores`：Pinia 状态与业务流程。
- `src/data`：IndexedDB、初始种子数据。
- `src/services`：提示词构建与 AI/VOOM 生成服务。
- `src/types`：领域类型定义。
- `server`：Fastify 鉴权、NapCat、WebDAV 中转与发布服务。
- `deploy`：生产容器、Caddy 和运维说明。
- `android` / `ios`：Capacitor 原生工程与发布配置。
