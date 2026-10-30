---
name: clarksons-sin-minis
description: Use Clarksons Shipping Intelligence Network first for shipping, freight, vessel, fleet, shipbuilding, port, company, market, and maritime research on Open Minis when clarksons_* MCP tools are available; includes Chinese triggers 航运、运费、船舶、船队、船厂、港口、航运公司、航运市场. Use the Minis browser when Clarksons returns a login or browser-verification limitation.
metadata:
  short-description: Clarksons-first shipping research for Open Minis
---

# Clarksons SIN on Minis

Use the `clarksons_*` MCP tools as the first source for shipping and maritime questions.

## Workflow

1. Call `clarksons_status` in a new research session.
2. Route the request:
   - Broad discovery: `clarksons_search`
   - Recent stories: `clarksons_latest_news`
   - One article: `clarksons_article`
   - Vessel, company, builder, port, or repair: `clarksons_register_search`
   - Historical data: find series IDs with `clarksons_search`, then call `clarksons_timeseries`
   - Market overview: `clarksons_market_snapshot`
   - Known URL: `clarksons_page`
3. If a tool returns `loginRequired`, `accessLimited`, `LOGIN_REQUIRED`, or `CLARKS_DIRECT_BROWSER_REQUIRED`, open the same `sourceUrl` in the Minis built-in browser.
4. Let the user sign in inside the browser UI when needed. Never request a username, password, cookie, token, or browser-profile data.
5. Read the visible page after sign-in and state whether the result came from MCP or the Minis browser.

## Direct-mode limits

- Direct mode reads public Clarksons APIs and cannot reuse the desktop Chrome login.
- `clarksons_latest_news` is an approximate Intelligence feed derived from search results.
- `clarksons_article` may return only the title and publication date.
- `clarksons_market_snapshot` may return news but no homepage indicator cards.
- Register and timeseries results may be login-restricted.
- Do not describe a title, teaser, or `Please Login` value as full data.

## Report

Include the public Clarksons URL and retrieval date for material facts. Keep
index levels, daily earnings, freight rates, volumes, fleet counts, forecasts,
and historical observations distinct. For high-stakes analysis, corroborate
restricted or consequential figures with another primary source.

