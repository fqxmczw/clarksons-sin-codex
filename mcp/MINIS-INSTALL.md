# Install on Open Minis

This package supports two transports:

- `direct`: public Clarksons data from the phone, with no desktop Chrome bridge.
- `chrome`: the full desktop adapter that reuses an authenticated Chrome tab.

Open Minis should use `direct` because a phone cannot reach the desktop's
`127.0.0.1:12306` Chrome bridge.

## What works in direct mode

- Site-wide Clarksons search.
- Intelligence and article titles with publication dates.
- An approximate latest-news feed derived from Clarksons search.
- Company, fleet, port, builder, and repair search when Clarksons allows the
  request without login.
- Timeseries metadata and values when the endpoint does not require login.

## What requires the Minis browser

- Full article text.
- Register results that return `LOGIN_REQUIRED`.
- Restricted timeseries values.
- Homepage ClarkSea, trade, newbuild, and GHG indicator cards.
- Pages protected by the Cloudflare browser challenge.

The included Minis skill tells the agent to open the same Clarksons URL in the
Minis built-in browser when the MCP returns a login or browser-verification
limitation. Sign in only inside the browser UI. Do not send a password, cookie,
or token to the agent.

## Install

1. Upload `clarksons-sin-mcp-1.2.0-minis.zip` to Open Minis.
2. Ask the Minis agent to unzip it to:

   ```text
   /var/minis/skills/clarksons-sin-mcp
   ```

3. Import `minis/mcp-config.example.json` through the MCP settings, or ask the
   agent to add that JSON configuration.
4. Import `minis/skill/SKILL.md` as a Minis skill.
5. Start a new conversation and ask a shipping question.

The example MCP command is:

```json
{
  "mcpServers": {
    "clarksons-sin": {
      "command": "node",
      "args": [
        "/var/minis/skills/clarksons-sin-mcp/src/server.cjs"
      ],
      "env": {
        "CLARKS_TRANSPORT": "direct"
      }
    }
  }
}
```

## Optional desktop bridge mode

Only use this over a trusted private network such as Tailscale. Do not expose
the Chrome MCP bridge directly to the public internet.

```json
{
  "mcpServers": {
    "clarksons-sin": {
      "command": "node",
      "args": [
        "/var/minis/skills/clarksons-sin-mcp/src/server.cjs"
      ],
      "env": {
        "CLARKS_TRANSPORT": "chrome",
        "CHROME_MCP_URL": "http://DESKTOP_PRIVATE_IP:12306/mcp"
      }
    }
  }
}
```

This mode requires the desktop Chrome MCP bridge to listen beyond loopback and
an authenticated Clarksons tab on that desktop. Keep access restricted to your
own devices.

## Verification

Ask the Minis agent to call:

```text
clarksons_status
clarksons_search query=Panamax
clarksons_latest_news limit=3
```

`clarksons_status` should report `transport: "direct-public"` and
`searchAccess: true`.

