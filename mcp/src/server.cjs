'use strict';

const readline = require('node:readline');
const { ChromeMcpClient, BrowserBridgeError } = require('./chrome-client.cjs');
const { DirectClarksonsClient } = require('./direct-client.cjs');
const service = require('./clarksons-service.cjs');
const { sanitizeOutput } = require('./privacy.cjs');

const SERVER_NAME = 'clarksons-sin';
const SERVER_VERSION = '1.2.0';
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
const transport = String(process.env.CLARKS_TRANSPORT || 'direct').toLowerCase();
const client = transport === 'direct' ? new DirectClarksonsClient() : new ChromeMcpClient();

const TOOLS = [
  {
    name: 'clarksons_status',
    description:
      'Check whether the existing Chrome session can access Clarksons Shipping Intelligence Network search, and return the current Clarksons tab and account state.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'clarksons_search',
    description:
      'Search Clarksons SIN across intelligence articles, sectors, reports, timeseries, fleet, companies, builders, ports, and repair records. Use this first for broad shipping research.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search text, for example Panamax, VLCC, LNG, Middle East, or a company name.'
        },
        page: {
          type: 'integer',
          minimum: 1,
          default: 1
        },
        page_size: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 25
        },
        search_type: {
          type: 'string',
          enum: ['contains', 'startswith'],
          default: 'contains'
        },
        scope: {
          type: 'string',
          enum: [
            'all',
            'intelligence',
            'sectors',
            'reports',
            'timeseries',
            'fleet',
            'companies',
            'builders',
            'ports',
            'repair'
          ],
          default: 'all'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'clarksons_latest_news',
    description:
      'Read the latest Clarksons SIN news and analysis feed, including English, Chinese, Middle East, US policy, green, and new-content tabs.',
    inputSchema: {
      type: 'object',
      properties: {
        tab: {
          type: 'string',
          enum: [
            'latest',
            'analysis',
            'briefings',
            'chinese',
            'middle_east',
            'us_policy',
            'green',
            'new_content',
            'all'
          ],
          default: 'latest'
        },
        query: {
          type: 'string',
          description: 'Optional keyword filter over titles, synopses, and categories.'
        },
        category: {
          type: 'string',
          description: 'Optional category filter such as Tanker, Bulkers, LNG, or Shipbuilding.'
        },
        language: {
          type: 'string',
          enum: ['all', 'en', 'zh'],
          default: 'all'
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'clarksons_article',
    description:
      'Read a Clarksons SIN article by article_id or URL, returning title, author, publication date, body text, source URL, and access restrictions.',
    inputSchema: {
      type: 'object',
      properties: {
        article_id: {
          type: 'string',
          description: 'Clarksons article ID, for example 230162.'
        },
        url: {
          type: 'string',
          description: 'A Clarksons /sin/News/Article/<id> URL. Use either url or article_id.'
        },
        include_body: {
          type: 'boolean',
          default: true
        },
        max_chars: {
          type: 'integer',
          minimum: 1000,
          maximum: 120000,
          default: 30000
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'clarksons_register_search',
    description:
      'Search the Clarksons register directly by category: fleet, companies, builders, ports, or repair. Use this for vessel and company lookups rather than news.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Vessel, company, builder, port, or repair search text.'
        },
        category: {
          type: 'string',
          enum: ['fleet', 'companies', 'builders', 'ports', 'repair'],
          default: 'fleet'
        },
        page: {
          type: 'integer',
          minimum: 1,
          default: 1
        },
        page_size: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          default: 20
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'clarksons_timeseries',
    description:
      'Fetch Clarksons timeseries data by series IDs. Series IDs can be found in clarksons_search results whose group is Timeseries.',
    inputSchema: {
      type: 'object',
      properties: {
        series_ids: {
          type: 'array',
          items: {
            type: 'integer',
            minimum: 1
          },
          minItems: 1,
          maxItems: 20
        },
        from_date: {
          type: 'string',
          description: 'Optional inclusive ISO date or parseable date.'
        },
        to_date: {
          type: 'string',
          description: 'Optional inclusive ISO date or parseable date.'
        },
        max_rows: {
          type: 'integer',
          minimum: 1,
          maximum: 2000,
          default: 200
        }
      },
      required: ['series_ids'],
      additionalProperties: false
    }
  },
  {
    name: 'clarksons_market_snapshot',
    description:
      'Read the current Clarksons SIN homepage market snapshot: World Seaborne Trade, ClarkSea Index, Newbuild Price Index, GHG emissions, and latest headlines.',
    inputSchema: {
      type: 'object',
      properties: {
        include_latest_news: {
          type: 'boolean',
          default: true
        },
        latest_limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          default: 5
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'clarksons_page',
    description:
      'Read visible text from any Clarksons SIN page, report, dashboard, or register URL using the existing Chrome session. Only clarksons.net.cn URLs are allowed.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Clarksons URL to read.'
        },
        selector: {
          type: 'string',
          description: 'Optional CSS selector. Defaults to body.'
        },
        max_chars: {
          type: 'integer',
          minimum: 500,
          maximum: 120000,
          default: 20000
        }
      },
      required: ['url'],
      additionalProperties: false
    }
  }
];

const TOOL_HANDLERS = {
  clarksons_status: () => service.getStatus(client),
  clarksons_search: (args) => service.search(client, args),
  clarksons_latest_news: (args) => service.latestNews(client, args),
  clarksons_article: (args) => service.article(client, args),
  clarksons_register_search: (args) => service.registerSearch(client, args),
  clarksons_timeseries: (args) => service.timeseries(client, args),
  clarksons_market_snapshot: (args) => service.marketSnapshot(client, args),
  clarksons_page: (args) => service.page(client, args)
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result, isError = false) {
  result = sanitizeOutput(result);
  send({
    jsonrpc: '2.0',
    id,
    result: {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ],
      structuredContent: result,
      isError
    }
  });
}

function sendError(id, code, message, data = undefined) {
  send({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message: sanitizeOutput(message),
      ...(data === undefined ? {} : { data: sanitizeOutput(data) })
    }
  });
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL_VERSION,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION
        },
        instructions:
          'Use clarksons_* tools first for shipping, freight, vessel, fleet, shipbuilding, port, company, and maritime-market research. Check clarksons_status when access fails. Never request usernames, passwords, cookies, or tokens. If loginRequired or accessLimited is returned, disclose the limitation and do not present a public synopsis or Please Login value as full data. Cite the public Clarksons URL and retrieval date for material facts. Direct mode reads public data only.'
      }
    });
    return;
  }

  if (!id && method?.startsWith('notifications/')) {
    return;
  }

  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
    return;
  }

  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }

  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    const handler = TOOL_HANDLERS[name];
    if (!handler) {
      sendError(id, -32602, `Unknown tool: ${name}`);
      return;
    }

    try {
      const result = await handler(args);
      sendResult(id, result, false);
    } catch (error) {
      if (error instanceof BrowserBridgeError) {
        sendResult(
          id,
          {
            ok: false,
            errorCode: error.code,
            message: 'Clarksons request failed. Check errorCode and the connection or access state.',
            details: { status: error.details?.status || null },
            action:
              error.code === 'CLARKS_TAB_NOT_FOUND'
                ? 'Open https://www.clarksons.net.cn/sin/ in Chrome and sign in.'
                : error.code === 'CHROME_BRIDGE_UNREACHABLE'
                  ? 'Confirm the chrome-mcp-server MCP is enabled and running.'
                  : null
          },
          false
        );
      } else {
        sendResult(
          id,
          {
            ok: false,
            errorCode: 'INTERNAL_ERROR',
            message: 'Unexpected error while querying Clarksons.'
          },
          true
        );
      }
    }
    return;
  }

  if (method === 'resources/list') {
    send({ jsonrpc: '2.0', id, result: { resources: [] } });
    return;
  }

  if (method === 'prompts/list') {
    send({ jsonrpc: '2.0', id, result: { prompts: [] } });
    return;
  }

  if (method === 'shutdown') {
    send({ jsonrpc: '2.0', id, result: null });
    return;
  }

  if (method === 'exit') {
    process.exit(0);
  }

  if (id) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

function start() {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      process.stderr.write('Invalid MCP JSON\n');
      return;
    }

    handleRequest(message).catch((error) => {
      process.stderr.write('MCP request failed\n');
      if (message.id !== undefined) {
        sendError(message.id, -32603, 'Internal server error');
      }
    });
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

start();

