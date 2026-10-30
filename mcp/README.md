# Clarksons SIN MCP

Read-only MCP adapter for Clarksons Shipping Intelligence Network.

It does not copy passwords or cookies. The adapter asks the already-running
`chrome-mcp-server` to make same-origin requests in the user's existing Chrome
session. Network requests temporarily activate the Clarksons tab and restore
the previously active tab afterward.

The server is intended to be the first source for shipping, freight, vessel,
fleet, shipbuilding, port, company, and maritime-market research. The global
`clarksons-sin` Codex skill encodes that routing preference and the required
access-boundary language.

## Tools

- `clarksons_status`
- `clarksons_search`
- `clarksons_latest_news`
- `clarksons_article`
- `clarksons_register_search`
- `clarksons_timeseries`
- `clarksons_market_snapshot`
- `clarksons_page`

## Access behavior

- Search, latest headlines, public homepage indicators, and some register
  records can be available without an active subscription.
- Full articles, register records, and timeseries may return `LOGIN_REQUIRED`,
  `loginRequired`, or `accessLimited` when the Chrome session or subscription
  does not have entitlement.
- `clarksons_article` falls back to the public homepage title, author, date,
  categories, and synopsis. That fallback is not the full article.
- A successful search does not prove that the account can access restricted
  articles or data series.

## Transports

- `CLARKS_TRANSPORT=chrome` is the default and reuses the existing Chrome login
  through the Chrome MCP bridge.
- `CLARKS_TRANSPORT=direct` is a public-data mode for Open Minis and other
  mobile clients that cannot reach a desktop Chrome bridge. It reads public
  Clarksons search APIs and falls back to the Minis browser for restricted
  pages.

See [MINIS-INSTALL.md](MINIS-INSTALL.md) for the mobile import configuration.

## Requirements

- Node.js 20 or newer.
- Chrome with an authenticated Clarksons tab.
- The existing Chrome MCP bridge at `http://127.0.0.1:12306/mcp`.

## Run

```powershell
node D:\Administrator\Documents\MCP\clarksons-mcp\src\server.cjs
```

The process speaks MCP over stdio.

## Codex configuration

```powershell
codex mcp add clarksons-sin `
  --env CHROME_MCP_URL=http://127.0.0.1:12306/mcp `
  -- "C:\Program Files\nodejs\node.exe" `
  "D:\Administrator\Documents\MCP\clarksons-mcp\src\server.cjs"
```

Verify with `codex mcp list`. A new Codex session is required before the
Clarksons tools appear in the active tool catalog.

