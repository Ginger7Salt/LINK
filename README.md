# Link

Link 是一个移动端优先的 Vue 3 + Vite + PWA 角色扮演聊天应用原型，界面参考 LINK 的 Home、Chats、VOOM 与聊天房间体验。

## 功能

- 五个底部 Tab：主页、聊天、VOOM、Music、Fanfic。
- 同一个 conversation 支持线上聊天和线下长文本 RP 两种渲染。
- 进入线下模式会切换会话模式与提示词，退出后切回线上模式。
- 用户人设、角色名称、头像、角色资料、朋友圈频率可编辑。
- IndexedDB 本地存储用户、角色、会话、消息、VOOM、世界书和 API 设置。
- 设置页的备份分栏支持本地 JSON 导出/导入，以及 GitHub 私有仓库自动备份。
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

## 数据备份

设置页底部的“备份”分栏提供三种数据保护方式：

- `导出备份`：下载当前 IndexedDB 快照，包含用户、角色、会话、消息、VOOM、世界书、Stickers 与设置。
- `导入备份`：选择此前导出的 JSON 文件并替换当前本地数据。
- `GitHub 登录`：配置 Cloudflare Worker 后会打开 GitHub OAuth 授权页，授权完成后自动回到 LINK。
- `GitHub 自动备份`：OAuth 登录成功后会自动创建私有仓库、开启自动备份并完成首次备份；也可以手动填写 token 后连接账号。
- `导入 GitHub 备份`：连接 GitHub 后，可直接把私有仓库里的备份文件拉回本地并覆盖当前 LINK 数据。
- `自动检测恢复`：登录 GitHub 后如果检测到仓库里已有较新的备份，会提示是否恢复到当前设备，避免先覆盖云端旧数据。
- `历史备份列表`：设置页会显示最近三次 GitHub 备份记录，可按某一个历史版本恢复。
- `备份可视化`：设置页会显示最近同步状态、手动/自动备份进度条，以及导入恢复阶段进度。

GitHub token 需要具备创建私有仓库和写入仓库内容的权限。备份文件会清空 `settings.githubBackup.token`，避免把 token 写进本地导出或 GitHub 备份。

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
npm run preview
```

## 部署到 GitHub Pages

项目已内置 GitHub Actions 工作流，推送到 GitHub 后会自动构建并发布到 GitHub Pages。

1. 在 GitHub 新建一个仓库，例如 `LINK`。
2. 在本地初始化并推送代码：

```bash
git init
git branch -M main
git add .
git commit -m "Deploy Link"
git remote add origin https://github.com/<你的 GitHub 用户名>/<仓库名>.git
git push -u origin main
```

3. 打开 GitHub 仓库的 `Settings` -> `Pages`，把 `Build and deployment` 的 `Source` 设为 `GitHub Actions`。
4. 等 `Actions` 里的 `Deploy to GitHub Pages` 跑完后，用手机打开：

```text
https://<你的 GitHub 用户名>.github.io/<仓库名>/
```

如果仓库名是 `LINK`，地址通常是：

```text
https://<你的 GitHub 用户名>.github.io/LINK/
```

## 目录

- `src/pages`：五个 Tab 页面、聊天详情和线下 RP 页面。
- `src/components`：按功能拆分的 UI 组件。
- `src/stores`：Pinia 状态与业务流程。
- `src/data`：IndexedDB、初始种子数据。
- `src/services`：提示词构建与 AI/VOOM 生成服务。
- `src/types`：领域类型定义。
