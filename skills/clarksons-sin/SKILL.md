---
name: clarksons-sin
description: Use Clarksons Shipping Intelligence Network first for shipping, freight, vessel, fleet, shipbuilding, port, company, market, and maritime research when clarksons_* MCP tools are available; includes Chinese triggers 航运、运费、船舶、船队、船厂、港口、航运公司、航运市场. Fall back when Clarksons access is limited or the question is outside shipping.
metadata:
  short-description: Query Clarksons SIN first for shipping research
---

# Clarksons SIN

Use Clarksons Shipping Intelligence Network as the first data source for shipping and maritime questions when the `clarksons_*` MCP tools are available.

## Connection and optional login

Default to CLARKS_TRANSPORT=direct on every device. Respect explicitly configured chrome mode; never switch a working direct installation to chrome automatically.

1. On first use in each conversation call clarksons_status. If tools are missing, install the companion MCP using the repository README; direct mode requires no browser bridge.
2. If transport=direct-public or browser.mode=direct, query public data immediately. session.authenticated=false in this mode does not describe the user's browser session. Do not require login before public queries.
3. When direct access is restricted, provide the public source URL and explain that the user may sign in using their preferred browser. If a connected browser tool can read that browser, use its existing session and label those results as browser-derived. Otherwise ask the user for the relevant page content or disclose the limitation. Browser login never authenticates the direct MCP automatically.
4. In explicitly selected chrome mode, check the bridge first. CHROME_BRIDGE_UNREACHABLE requires connection repair, not another login. For CLARKS_TAB_NOT_FOUND, use available browser tools to open https://www.clarksons.net.cn/sin/ in the existing regular Chrome profile, or provide that URL if opening is unavailable.
5. In chrome mode, session.authenticated=true means continue immediately using the existing session. If false, open or focus the existing tab when possible and prompt the user to sign in there. Wait for their completion message, then recheck status. On later queries reuse the session; prompt again only when it expires.
6. After an access failure, distinguish missing subscription entitlement from expired authentication. Public search success does not establish login. Never request, read, export or store passwords, cookies, tokens or browser profiles.

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
- If the user needs restricted data, follow the connection and optional login workflow above: recheck authentication and distinguish expired sessions from missing subscription entitlement.
- For high-stakes analysis, corroborate Clarksons figures with another primary source and keep source dates, definitions, units, and actual-versus-forecast status explicit.

## Report the result

- Include the Clarksons source URL and retrieval date for every material fact.
- Preserve distinctions between index levels, daily earnings, freight rates, volumes, fleet counts, orderbook values, forecasts, and historical observations.
- Name the exact Clarksons page, article, register category, or series used. Do not cite an internal API URL as the public source.
- Keep the adapter read-only. Do not use these tools to change Clarksons data or account settings.

