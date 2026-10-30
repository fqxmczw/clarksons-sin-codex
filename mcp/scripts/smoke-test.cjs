'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const serverPath = path.resolve(__dirname, '..', 'src', 'server.cjs');
const transport = String(process.env.CLARKS_TRANSPORT || 'direct').toLowerCase();
const child = spawn(process.execPath, [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true
});

let nextId = 1;
let buffer = '';
const pending = new Map();

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) {
      continue;
    }
    const message = JSON.parse(line);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  }
});

child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

function request(method, params = {}) {
  const id = nextId++;
  const message = { jsonrpc: '2.0', id, method, params };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

function parseToolResult(result) {
  const text = (result.content || [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
  return JSON.parse(text);
}

async function main() {
  const initialize = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'clarksons-smoke-test', version: '1.0.0' }
  });
  assert.equal(initialize.serverInfo.name, 'clarksons-sin');
  assert.equal(initialize.serverInfo.version, '1.2.0');
  assert(initialize.instructions.includes('clarksons_status'));
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`
  );

  const tools = await request('tools/list');
  assert.equal(tools.tools.length, 8);
  assert(tools.tools.some((tool) => tool.name === 'clarksons_search'));
  assert(tools.tools.some((tool) => tool.name === 'clarksons_article'));

  const status = parseToolResult(
    await request('tools/call', {
      name: 'clarksons_status',
      arguments: {}
    })
  );
  assert.equal(status.ok, true);
  if (transport === 'direct') {
    assert.equal(status.browser.mode, 'direct');
  } else {
    assert.equal(status.browser.tabFound, true);
  }

  const search = parseToolResult(
    await request('tools/call', {
      name: 'clarksons_search',
      arguments: { query: 'Panamax', page_size: 5, scope: 'all' }
    })
  );
  assert.equal(search.ok, true, JSON.stringify(search));
  assert(search.results.length > 0);

  const latest = parseToolResult(
    await request('tools/call', {
      name: 'clarksons_latest_news',
      arguments: { tab: 'latest', limit: 3 }
    })
  );
  assert.equal(latest.ok, true);
  assert(latest.results.length > 0);

  const article = parseToolResult(
    await request('tools/call', {
      name: 'clarksons_article',
      arguments: { article_id: '230162', max_chars: 5000 }
    })
  );
  assert.equal(article.ok, true);
  assert(article.title.includes('Tanker'));
  if (transport === 'direct') {
    assert.equal(article.accessLimited, true);
  } else {
    assert(article.body.length > 100);
  }

  const snapshot = parseToolResult(
    await request('tools/call', {
      name: 'clarksons_market_snapshot',
      arguments: { latest_limit: 2 }
    })
  );
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.indicators.length, transport === 'direct' ? 0 : 4);
  assert(snapshot.latestNews.length > 0);

  const registerSearch = parseToolResult(
    await request('tools/call', {
      name: 'clarksons_register_search',
      arguments: { query: 'Maersk', category: 'companies', page_size: 3 }
    })
  );
  assert(
    registerSearch.ok === true || registerSearch.errorCode === 'LOGIN_REQUIRED',
    JSON.stringify(registerSearch)
  );
  if (registerSearch.ok) {
    assert(Array.isArray(registerSearch.results));
  }

  const page = parseToolResult(
    await request('tools/call', {
      name: 'clarksons_page',
      arguments: {
        url: 'https://www.clarksons.net.cn/sin/',
        selector: 'body',
        max_chars: 1000
      }
    })
  );
  if (transport === 'direct') {
    assert.equal(page.errorCode, 'CLARKS_DIRECT_BROWSER_REQUIRED');
  } else {
    assert.equal(page.ok, true);
    assert(page.text.length > 0);
  }

  const timeseries = parseToolResult(
    await request('tools/call', {
      name: 'clarksons_timeseries',
      arguments: { series_ids: [540613], max_rows: 3 }
    })
  );
  assert.equal(timeseries.ok, true);
  assert.equal(typeof timeseries.accessLimited, 'boolean');

  console.log(
    JSON.stringify(
      {
        tools: tools.tools.length,
        transport,
        statusAuthenticated: status.session.authenticated,
        searchResults: search.results.length,
        latestArticles: latest.results.length,
        articleId: article.articleId,
        articleBodyChars: article.body.length,
        articleAccessLimited: article.accessLimited,
        marketIndicators: snapshot.indicators.length,
        marketNews: snapshot.latestNews.length,
        registerAccess: registerSearch.ok ? 'available' : registerSearch.errorCode,
        pageAccess: page.ok ? `${page.text.length} chars` : page.errorCode,
        timeseriesAccessLimited: timeseries.accessLimited
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    child.stdin.end();
    setTimeout(() => child.kill(), 500).unref();
  });

