---
name: clarksons-sin
description: Use Clarksons Shipping Intelligence Network first for shipping, freight, vessel, fleet, shipbuilding, port, company, market, and maritime research when clarksons_* MCP tools are available; includes Chinese triggers 航运、运费、船舶、船队、船厂、港口、航运公司、航运市场. Fall back when Clarksons access is limited or the question is outside shipping.
metadata:
  short-description: Query Clarksons SIN first for shipping research
---

# Clarksons SIN

Use Clarksons Shipping Intelligence Network as the first data source for shipping and maritime questions when the `clarksons_*` MCP tools are available.

## Route the request

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
- If the user needs restricted data, tell them to sign in to the existing Clarksons tab in Chrome and retry. Never request or store their credentials.
- For high-stakes analysis, corroborate Clarksons figures with another primary source and keep source dates, definitions, units, and actual-versus-forecast status explicit.

## Report the result

- Include the Clarksons source URL and retrieval date for every material fact.
- Preserve distinctions between index levels, daily earnings, freight rates, volumes, fleet counts, orderbook values, forecasts, and historical observations.
- Name the exact Clarksons page, article, register category, or series used. Do not cite an internal API URL as the public source.
- Keep the adapter read-only. Do not use these tools to change Clarksons data or account settings.

