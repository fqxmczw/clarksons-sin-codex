---
name: clarksons-sin
description: Use Clarksons Shipping Intelligence Network first for shipping, freight, vessel, fleet, shipbuilding, port, company, market, and maritime research when clarksons_* MCP tools are available; includes Chinese triggers 航运、运费、船舶、船队、船厂、港口、航运公司、航运市场. Fall back when Clarksons access is limited or the question is outside shipping.
metadata:
  short-description: Query Clarksons SIN first for shipping research
---

# Clarksons SIN

Use Clarksons Shipping Intelligence Network as the first data source for shipping and maritime questions when the `clarksons_*` MCP tools are available.

## Browser login workflow (run before query routing)

Default desktop installations to CLARKS_TRANSPORT=chrome. Use browser session state as the source of truth; do not save a permanent login-completed flag.

1. On first use in each conversation call clarksons_status. If session.authenticated is true, immediately continue the query using the existing Chrome session without another login prompt.
2. If tools are missing, finish companion MCP and chrome-mcp-server bridge setup using the repository README. If CHROME_BRIDGE_UNREACHABLE is returned, repair the bridge connection before requesting login.
3. If status reports transport=direct-public or browser.mode=direct, this is public-only mode, not proof that Chrome is logged out. For desktop use, inspect the MCP registration and switch CLARKS_TRANSPORT to chrome while preserving its executable, source path and custom bridge URL. Reload the connection when supported, otherwise request a new Codex session. Respect an explicit direct/mobile preference.
4. If CLARKS_TAB_NOT_FOUND is returned, use available browser tools to open https://www.clarksons.net.cn/sin/ in the existing regular Chrome profile, then recheck status. If browser tools are unavailable, provide that URL for the user to open. Preserve existing tabs and avoid incognito or isolated profiles.
5. If browser-mode status reports session.authenticated=false, open or focus the existing Clarksons tab when browser tools are available. On first use say: "请在 Chrome 的克拉克森页面完成登录，完成后告诉我；后续会默认复用该浏览器登录状态。" For an expired session say: "克拉克森登录已失效，请在原浏览器页面重新登录。" Let the user complete login and verification in the website UI. Wait for their completion message rather than repeatedly polling.
6. After the user confirms completion, call clarksons_status again. Proceed once authentication is confirmed. A public search success is not login evidence. Never request, read, export or store credentials, cookies, tokens or browser profiles.
7. On subsequent queries reuse the authenticated session; recheck after access failures. If authenticated but data remains restricted, explain subscription entitlement limitations instead of repeating login prompts.
8. In explicitly selected direct/mobile mode, signing into a browser does not authenticate the direct client. Use available browser tools for restricted pages and label the source separately; otherwise disclose the access limitation.

## Query routing

1. Call `clarksons_status` at the start of a new research session, or when another Clarksons tool fails. Do not ask for a username, password, cookie, or token.
2. Choose the narrowest useful tool:
   - Broad discovery or an unfamiliar term: `clarksons_search`
   - Recent market news: `clarksons_latest_news`
   - One known story: `clarksons_article`
   - Vessel, company, builder, port, or repair lookup: `clarksons_register_search`
   - Historical series: first find series IDs with `clarksons_search`, then call `clarksons_timeseries`
   - Current headline indicators: `clarksons_market_snapshot`
   - A known Clarksons page, dashboard, or report URL: `clarksons_page`
3. Expand only when the first result set is insufficient. Search results are grouped by Sectors, Intelligence, Reports, Timeseries, Fleet, Companies, Vessels, and related categories.

## Handle access boundaries

- A successful search does not prove that the account has article, register, or timeseries entitlement.
- If `loginRequired`, `accessLimited`, or `LOGIN_REQUIRED` is returned, state the exact limitation. Do not present a homepage synopsis, teaser, or "Please Login" value as full data.
- `clarksons_article` may return the public title, author, date, and synopsis when full text is restricted. Cite it as a Clarksons summary, not as the full article.
- `clarksons_timeseries` may contain `Please Login` values when the current session or subscription lacks access.
- If the user needs restricted data, follow the browser login workflow above: recheck authentication and distinguish expired sessions from missing subscription entitlement.
- For high-stakes analysis, corroborate Clarksons figures with another primary source and keep source dates, definitions, units, and actual-versus-forecast status explicit.

## Report the result

- Include the Clarksons source URL and retrieval date for every material fact.
- Preserve distinctions between index levels, daily earnings, freight rates, volumes, fleet counts, orderbook values, forecasts, and historical observations.
- Name the exact Clarksons page, article, register category, or series used. Do not cite an internal API URL as the public source.
- Keep the adapter read-only. Do not use these tools to change Clarksons data or account settings.

