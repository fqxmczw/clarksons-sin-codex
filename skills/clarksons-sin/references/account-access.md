# Account access procedure

## Connect and verify

At the beginning of an account research session, discover the connected browser and any browser-mode Clarksons MCP. Reuse the user's persistent regular profile and existing Clarksons tab. Avoid temporary/incognito contexts that discard login. If a saved connection is unavailable, report connection failure; it is not a login-expiry signal.

With browser-mode MCP, call clarksons_status. Verify it is not transport=direct-public or browser.mode=direct. With native browser tools, inspect login/logout indicators in the page but return only booleans; do not return the account header, display name or a full screenshot. Login/logout indicators and protected page access are stronger evidence than public search results. Follow the SKILL.md data-minimization procedure before returning page content.

If the companion MCP is configured as direct and a working compatible Chrome bridge is present, configure it for chrome only as part of the user's chosen account setup. Preserve executable/path/custom bridge settings, reload the connection if possible, and verify again. Otherwise use the connected browser directly. Changing an environment variable alone does not establish a working authenticated channel.

## Initial login

If the connected browser is already authenticated, reuse it immediately. Otherwise open https://www.clarksons.net.cn/sin/ in that browser and ask the user to complete login there. Wait for confirmation; do not poll indefinitely or interact with password/verification fields on their behalf. After confirmation, inspect the same session again. Do not claim success based solely on the user's message.

A tool unable to open the browser may provide the URL, but manual opening alone does not prove Codex can read that browser. Verify the connection before promising account-backed results.

## Later requests

Keep the access preference across conversations using preferences.py. Keep authentication in the browser, not the preference file. Verify once per new research session and reuse the channel for subsequent queries. Closing a tab is not necessarily logout; reopen the site in the same profile when supported.

Recheck after an access failure and classify the evidence:

| Evidence | Action |
| --- | --- |
| Login redirect or explicit logged-out state in the account channel | Ask to log in again in the same browser; recheck after confirmation and retry the original query once |
| Logged-in state plus explicit subscription/entitlement denial for the requested content | Explain which data is not covered; do not ask for another login |
| Authenticated state but generic 403, empty body, Cloudflare challenge or ambiguous denial | Report the exact uncertainty; inspect browser page/verification, do not infer subscription failure or logout |
| Bridge disconnected, missing tool, timeout or unsupported page | Diagnose connection/coverage; preserve the preference and do not label it expired login |
| Direct-public request reports LOGIN_REQUIRED | That request has no browser authentication; use the account channel, not another login prompt |

If a single query still fails after a verified relogin, stop the retry loop and explain the observed problem. If authentication cannot be determined, report uncertainty rather than repeatedly prompting.

## Breadth of access

Use the authenticated website for any relevant area the account can view, even if no specialized MCP tool exists. Read the actual result and preserve the filter scope. Site entitlements and technical tool coverage are independent: neither a logged-in header nor a successful search proves that every report, export or dataset is accessible.
