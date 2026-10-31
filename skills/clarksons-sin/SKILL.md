---
name: clarksons-sin
description: Research Clarksons shipping, freight, vessels, fleets, shipyards, ports and maritime markets. Offer optional account login on first use, reuse the authenticated browser on later requests, and distinguish session expiry from subscription limits. 航运、运费、船舶、船队、港口、航运市场。
metadata:
  short-description: Clarksons research with optional login and browser session reuse
---

# Clarksons SIN

Use Clarksons first for maritime research. Serve the requested information within the account's actual permissions, using website pages for areas not covered by specialized MCP tools.

## First use on each device

Run the bundled helper using its absolute installed path:

```text
python <skill-directory>/scripts/preferences.py status
```

Use python3 if appropriate. This helper stores only the access preference under CODEX_HOME (default ~/.codex); it does not store credentials or assert authentication.

If onboardingRequired=true, ask once and wait for the answer:
“是否现在登录克拉克森账号？可以选择「登录并使用账号权限查询」或「暂不登录，仅查询公开信息」。登录后会复用本设备的浏览器会话，失效时才提示重新登录。”

A prior explicit choice in this conversation counts as the answer. Save only after the user's choice:
- Login: run preferences.py choose account.
- Public only: run preferences.py choose public.

If preference storage fails, disclose it and keep the choice in the current conversation; do not claim it will survive a new session. An invalid state file is a configuration issue, not expired login; do not silently overwrite it. User requests to switch access modes override the saved preference. Run preferences.py reset only when the user requests resetting onboarding. Merely installing/updating this skill must not choose an access mode.

## Account access

Read [account-access.md](references/account-access.md) before account queries. Discover the available browser tools and connected MCP capabilities, and select an actual authenticated channel:

- Existing browser-mode clarksons-sin MCP through its compatible Chrome bridge.
- An available browser tool capable of controlling and reading the user's persistent browser session. Use its supported browser; do not require Chrome when a different connected browser suffices.

Direct-public MCP requests are unauthenticated. Never use their authenticated=false field to decide that a browser login has expired. Do not switch away from account mode or use public summaries as a substitute for requested subscription data without explaining the limitation.

If no authenticated channel exists, explain that this device needs a browser connection before account data can be read. Offer setup instructions or an explicit public-only alternative. Preserve account preference while setup is pending; do not prompt for login repeatedly or claim arbitrary browsers are supported.

## Public access

Use available direct clarksons_* tools for public results. If absent, use connected browser/public web tools and identify the source. Respect the saved public preference on later sessions. When requested content is restricted, explain the limit and offer switching to account mode; do not repeat onboarding on every ordinary public query.

## Query coverage

Use specialized tools only when their transport matches the selected access mode:
- Discovery: clarksons_search.
- News and articles: clarksons_latest_news, clarksons_article.
- Ships, companies, builders, ports and repair: clarksons_register_search.
- Historical data: find series IDs, then clarksons_timeseries.
- Market overview: clarksons_market_snapshot.
- Known pages: clarksons_page.

For other entitled information, navigate the signed-in website using available browser tools, inspect the relevant report/table/dashboard and follow its ordinary filters, pagination and download controls when needed for the requested task. A missing MCP tool or unsupported export is a technical coverage gap, not evidence of missing subscription entitlement. Do not bulk-download the site or change account settings.

## Minimize personal data before tool output

Prefer the companion MCP, which filters results before returning them. For native browser queries, read and execute scripts/browser-extract.js inside the page via the available JavaScript evaluation tool, calling extractClarksonsContent with the narrow article/table/main selector needed for the query. Return only its cleaned result. Inspect DOM structure using tag/role/selector metadata if the selector is unknown; do not first return the whole page to discover it. Keep login checks to booleans and access markers, not account names or page screenshots.

The helper excludes account/navigation areas, form controls and hidden elements, masks email and labelled personal/contact/credential text, and removes authentication URL parameters. Do not read password fields, cookies or storage. Preserve vessel/company names, public authors, dates, values and relevant business filters. If the browser tool cannot filter before returning data, disclose that limitation and use a narrower supported extraction or the filtered MCP instead of an unfiltered full-page dump. Screenshots, downloads and other tools are not automatically covered by the MCP filter; avoid including profile regions and process relevant data locally before returning it where supported.

Filtering is best-effort: unfamiliar profile layouts and unlabelled personal names may not be recognized. Never promise that all data remains local; cleaned research content still enters model context.

## Evidence and sources

Cite the public page URL and retrieval date, preserving units, reporting dates and actual/forecast distinctions. Label a title, synopsis or partial table as such. Report blocked, truncated or unsupported content explicitly rather than claiming full website coverage. Credentials, cookies, tokens and browser profiles remain in the browser; never request them in chat, export them or put them in this repository.

