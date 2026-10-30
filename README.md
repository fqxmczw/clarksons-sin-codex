# Clarksons SIN for Codex

让 Codex 在查询航运、运费、船舶、船队、船厂、港口及航运市场时优先使用克拉克森 Shipping Intelligence Network，并在回答中保留数据来源、日期、单位及访问限制。

本项目包含 **Codex Skill + 8 个只读 MCP 工具**。Skill 决定何时调用数据源，MCP 负责查询；只安装 Skill 不会自动获得数据访问能力。本项目是个人适配工具，并非 Clarksons 官方产品。

## 跨设备安装

需要 Git、Node.js 20+、Python 3 和 Codex CLI。私有仓库需要先在目标设备配置 GitHub Git 访问权限。以下命令不会迁移密码、Cookie 或订阅权限。

### Windows PowerShell

```powershell
git clone https://github.com/fqxmczw/clarksons-sin-codex.git
Set-Location clarksons-sin-codex
$codexRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
python (Join-Path $codexRoot 'skills/.system/skill-installer/scripts/install-skill-from-github.py') --repo fqxmczw/clarksons-sin-codex --path skills/clarksons-sin
codex mcp add clarksons-sin --env CLARKS_TRANSPORT=direct -- node (Join-Path $PWD 'mcp/src/server.cjs')
codex mcp list
```

### macOS / Linux

```bash
git clone https://github.com/fqxmczw/clarksons-sin-codex.git
cd clarksons-sin-codex
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" --repo fqxmczw/clarksons-sin-codex --path skills/clarksons-sin
codex mcp add clarksons-sin --env CLARKS_TRANSPORT=direct -- node "$PWD/mcp/src/server.cjs"
codex mcp list
```

安装器遇到已存在的同名 Skill 会停止，避免覆盖个人修改。如果没有预装 skill-installer，可在 Codex 中说：“请从 fqxmczw/clarksons-sin-codex 的 skills/clarksons-sin 安装 Skill，并按 README 注册 MCP。”

保留克隆目录：MCP 配置引用其中的源码。安装后开启新的 Codex 会话，让它调用 `clarksons_status`，然后查询 `Panamax`。公开查询成功并不证明订阅数据可访问。

## 两种模式

- **direct**：默认安装示例使用公开直连，适合没有 Chrome 桥接的设备。支持站内搜索及部分公开内容；新闻列表是搜索结果推导的近似列表，可能只返回文章标题和日期。
- **chrome**：通过目标设备上已配置的 chrome-mcp-server 桥接，复用该设备 Chrome 的 Clarksons 登录态。需要桥接服务、已打开的 Clarksons 页面和对应订阅权限，仓库不包含桥接服务。

已配置 Chrome 桥接后，可将上面注册命令中的 `CLARKS_TRANSPORT=direct` 改为 `CLARKS_TRANSPORT=chrome`，并添加 `--env CHROME_MCP_URL=http://127.0.0.1:12306/mcp`。如果已存在同名配置，先检查配置，再用 `codex mcp remove clarksons-sin` 移除本项目注册项后重新添加。

受限正文、注册记录、时序数据或浏览器验证可能返回 `LOGIN_REQUIRED`、`accessLimited` 或 `CLARKS_DIRECT_BROWSER_REQUIRED`。请在目标设备浏览器中登录；direct 模式不会因此自动共享浏览器登录态。不要把标题、摘要或 Please Login 当作完整数据。

## 工具

| 工具 | 用途 |
| --- | --- |
| clarksons_status | 检查连接和访问状态 |
| clarksons_search | 跨栏目搜索 |
| clarksons_latest_news | 新闻与分析 |
| clarksons_article | 文章与访问限制 |
| clarksons_register_search | 船舶、公司、船厂及港口查询 |
| clarksons_timeseries | 按系列 ID 查询历史数据 |
| clarksons_market_snapshot | 市场概况，字段取决于访问模式 |
| clarksons_page | 页面读取，通常需要浏览器模式 |

## 验证与更新

MCP 仅使用 Node.js 内置模块，无需 npm install。

```powershell
$env:CLARKS_TRANSPORT='direct'
node mcp/scripts/smoke-test.cjs
```

macOS/Linux：`CLARKS_TRANSPORT=direct node mcp/scripts/smoke-test.cjs`。该测试依赖实时网站及特定文章，网站变化或网络限制可能导致失败。

更新源码运行 `git pull --ff-only`；已安装 Skill 是独立副本，需要另行更新并保留自己的修改。

Minis 配置及访问限制见 [手机安装说明](mcp/MINIS-INSTALL.md)。其中路径对应原始移动端包；使用本仓库时应按实际解压路径调整配置。

## 数据与凭据

仓库只分发适配代码与指令，不分发订阅内容、账号密码、Cookie、令牌或浏览器配置。数据访问取决于 Clarksons 服务和账号权限。

