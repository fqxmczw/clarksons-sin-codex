# Clarksons SIN for Codex

在其他设备安装后，让 Codex 优先使用克拉克森开展航运研究。首次使用选择是否登录账号；选择登录后，通过已连接的浏览器查询账号有权访问的信息，并在后续会话中复用登录。登录过期才提示重新登录，订阅权限不足单独说明。

这是个人维护的 Codex Skill 与可选 MCP 适配器，不是 Clarksons 官方产品。

## 使用体验

1. **首次使用**：Codex 提示“登录并使用账号权限查询”或“暂不登录，仅查询公开信息”，等待你选择。
2. **选择登录**：连接本设备可用的浏览器，已有登录直接复用；未登录则打开克拉克森，由你在网页完成登录。Codex 检查成功后继续原查询。
3. **后续使用**：记住访问方式，在同一持久浏览器会话内查询，不反复询问是否登录。
4. **登录失效**：确认浏览器已退出或跳转登录页后，才提示重新登录。
5. **订阅不足**：确认账号仍然登录且页面明确限制订阅时，说明哪项内容不可用，不要求重复登录。

首次选择保存在本机 `$CODEX_HOME/clarksons-sin/preferences.json`（默认 `~/.codex/clarksons-sin/preferences.json`），仅包含访问方式，不保存账号、Cookie、密码或登录有效性。每台新设备单独选择、单独登录。

## 安装 Skill

需要 Python 3 和具备 Skill 安装能力的 Codex。直接在其他设备的 Codex 中发送：

```text
请从 https://github.com/fqxmczw/clarksons-sin-codex 安装 skills/clarksons-sin。
安装完成后按 Skill 的首次使用流程让我选择是否登录；如果选择登录，请检查并使用本设备可连接的持久浏览器会话。
```

也可使用 Codex 自带的 skill-installer：

**Windows PowerShell**

```powershell
$codexRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
python (Join-Path $codexRoot 'skills/.system/skill-installer/scripts/install-skill-from-github.py') --repo fqxmczw/clarksons-sin-codex --path skills/clarksons-sin
```

**macOS / Linux**

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" --repo fqxmczw/clarksons-sin-codex --path skills/clarksons-sin
```

安装器遇到同名 Skill 会停止，避免覆盖修改。没有预装安装器时使用上面的 Codex 安装指令。开启新会话并提出航运问题，即可触发首次选择。

## 账号查询需要什么

**需要 Codex 能实际控制和读取你登录的浏览器。** 普通浏览器里已经登录，不代表 Codex 自动拥有该浏览器连接。

| 可用环境 | 账号查询路径 |
| --- | --- |
| 已连接的持久浏览器工具，支持当前设备所用浏览器 | Skill 直接操作已登录的网站页面 |
| Chrome + 已配置的 chrome-mcp-server | 配套 MCP 使用 chrome 模式，复用 Chrome 登录 |
| 只有 direct MCP，没有浏览器连接 | 只能查询公开信息；选择账号模式后会提示补齐连接 |
| 浏览器工具仅提供临时或隔离会话 | 不能保证跨会话复用；需配置持久会话并验证 |

Skill 不限定必须使用 Chrome，但**不宣称适配器原生支持任意浏览器**。浏览器支持范围由你连接的工具决定。工具缺失、桥接断开和浏览器验证会单独说明，不冒充登录过期。

## 查询范围

目标是使用账号有权限查看的栏目，而不局限于固定的几个接口：资讯、文章、船舶、公司、船队、船厂、港口、市场指标、历史序列以及可访问的报告和页面。专用工具未覆盖的部分，Skill 会尝试通过已登录网站的页面、筛选、分页及相关下载入口读取。

**登录成功不等于拥有全站订阅，也不保证所有图表、文件和接口都能被工具读取。** 每次以实际页面及数据返回为准；订阅限制、技术上无法读取、部分结果会分别标注。不会把公开摘要包装成订阅全文。

## 可选配套 MCP

本仓库的 MCP 提供 8 个只读工具。它是结构化查询的补充；有可用浏览器工具时，单独安装 Skill 也可通过页面研究。

需要 Git、Node.js 20+、Codex CLI。MCP 无第三方 npm 依赖。

```text
git clone https://github.com/fqxmczw/clarksons-sin-codex.git
cd clarksons-sin-codex
```

### 仅公开查询

PowerShell：

```powershell
codex mcp add clarksons-sin --env CLARKS_TRANSPORT=direct -- node (Join-Path $PWD 'mcp/src/server.cjs')
```

macOS / Linux：

```bash
codex mcp add clarksons-sin --env CLARKS_TRANSPORT=direct -- node "$PWD/mcp/src/server.cjs"
```

程序未指定模式时仍使用 direct；**Skill 的账号选择不会让 direct 请求自动携带登录状态**。账号模式必须走实际的浏览器连接，不能悄悄回退到公开直连。

### Chrome 桥接账号查询

先在该设备安装并连接 chrome-mcp-server；本仓库不包含或自动安装该扩展。然后注册：

PowerShell：

```powershell
codex mcp add clarksons-sin --env CLARKS_TRANSPORT=chrome --env CHROME_MCP_URL=http://127.0.0.1:12306/mcp -- node (Join-Path $PWD 'mcp/src/server.cjs')
```

macOS / Linux：

```bash
codex mcp add clarksons-sin --env CLARKS_TRANSPORT=chrome --env CHROME_MCP_URL=http://127.0.0.1:12306/mcp -- node "$PWD/mcp/src/server.cjs"
```

如已有同名 MCP，先检查原配置并保留自定义路径/桥接地址，再修改传输模式，或移除该项后重新注册。保留克隆目录，配置会引用其中的服务器源码。开启新会话后调用 `clarksons_status` 验证实际连接及登录状态。

| 工具 | 用途 |
| --- | --- |
| clarksons_status | 连接与访问状态 |
| clarksons_search | 跨栏目搜索 |
| clarksons_latest_news | 新闻列表 |
| clarksons_article | 文章 |
| clarksons_register_search | 船舶、公司、船厂、港口 |
| clarksons_timeseries | 历史序列 |
| clarksons_market_snapshot | 市场概况 |
| clarksons_page | 网站页面 |

## 更新、切换与验证

- 更新 MCP 源码：在克隆目录执行 `git pull --ff-only`。
- 更新 Skill：更新整个 `skills/clarksons-sin` 文件夹，包括 scripts 和 references，保留个人修改。本机偏好位于 Skill 目录之外，不随升级重置。
- 切换方式：告诉 Codex“改用登录账号查询”或“只查询公开数据”，Skill 会更新选择。
- 重新选择：明确要求“重置克拉克森首次使用选择”；重置不清除浏览器登录。
- 更换设备：偏好和登录不会从 GitHub 同步，需要在新设备重新选择。

本地偏好脚本测试：

```text
python -m unittest discover -s tests -p "test_*.py"
```

公开 MCP 在线检查（PowerShell）：

```powershell
$env:CLARKS_TRANSPORT='direct'
node mcp/scripts/smoke-test.cjs
```

在线测试受网络及网站变化影响，公开模式通过不等于账号数据通过。账号流程需在已连接且有权限的浏览器中另行验证。Minis 使用说明见 [移动端配置](mcp/MINIS-INSTALL.md)，同样需要区分公开直连与浏览器账号通道。

仓库仅提供代码和 Skill，不含用户账号、浏览器登录资料或订阅数据。

## 隐私过滤

- 状态接口不读取或返回账号显示名称，只保留登录与访问状态。
- MCP 返回模型前统一过滤个人邮箱、明确标注的电话/住址/用户名及常见凭据字段；错误响应省略原始页面、响应头和堆栈。
- 浏览器页面读取在页面内避开导航、账户菜单、输入框、隐藏元素，再返回清理后的业务正文；不修改页面或登录会话。
- 船名、公司名、公开作者、IMO、日期、价格和时序数值保留。邮箱和电话会被遮蔽，包括业务联系人的这些字段。
- 直接使用其他浏览器工具时，Skill 提供 scripts/browser-extract.js 在浏览器内清理后返回；第三方截图、下载及其他工具的原始输出不会自动经过 MCP 过滤。

过滤属于尽力识别，无法保证识别任意页面中的所有个人资料。研究正文和清理后的结果仍会进入模型上下文，不等于全部数据只在本地保存。运行 `node --test tests/privacy.test.cjs` 可验证过滤和业务字段保留。

