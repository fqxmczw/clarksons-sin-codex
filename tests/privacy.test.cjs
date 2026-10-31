'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { sanitizeOutput, redactText, pageExtractionCode } = require('../mcp/src/privacy.cjs');
const { getStatus } = require('../mcp/src/clarksons-service.cjs');

test('nested private fields are excluded without changing authentication or market data', () => {
  const input = { session: { authenticated: true, accountLabel: 'Private Person' },
    results: [{ name: 'OCEAN STAR', displayName: 'OCEAN STAR', company: 'Example Shipping',
      imo: 9876543, dwt: 82000, dailyEarnings: 17500, date: '2026-10-30',
      email: 'person@example.com', access_token: 'private-value' }] };
  const clean = sanitizeOutput(input);
  assert.deepEqual(clean.session, { authenticated: true });
  assert.equal(clean.results[0].displayName, 'OCEAN STAR');
  assert.equal(clean.results[0].imo, 9876543);
  assert.equal(clean.results[0].dailyEarnings, 17500);
  assert.equal(clean.results[0].date, '2026-10-30');
  assert.equal('email' in clean.results[0], false);
  assert.equal('access_token' in clean.results[0], false);
  assert.equal(input.session.accountLabel, 'Private Person');
});

test('free text redaction preserves unlabelled shipping numbers and authors', () => {
  const business = 'Jane Smith: Panamax 82,000 dwt; IMO 9876543; USD 17,500/day; 2026-10-30';
  assert.equal(redactText(business), business);
  const clean = redactText('Email: person@example.com\nPhone: +86 138 1234 5678\nUser name: Private Person\nPassword: private-pass\n' + business);
  for (const secret of ['person@example.com', '138 1234', 'Private Person', 'private-pass']) assert(!clean.includes(secret));
  assert(clean.includes(business));
});

test('citation URLs retain series IDs and filters while dropping credentials', () => {
  const clean = redactText('https://www.clarksons.net.cn/sin/?series_id=540613&token=private&from=2026-10-01');
  assert.equal(clean, 'https://www.clarksons.net.cn/sin/?series_id=540613&from=2026-10-01');
  assert.equal(redactText('https://www.clarksons.net.cn/sin/News/Article/230162'), 'https://www.clarksons.net.cn/sin/News/Article/230162');
  assert(!redactText('https://private:secret@www.clarksons.net.cn/sin/').includes('private'));
});

test('status checks no longer read or return account display names', async () => {
  const client = {
    withClarksonsTab: (fn) => fn({ tabId: 1 }),
    javascript: async (code) => {
      assert(!code.includes('GreetingName'));
      return { authFlag: 1, detectedLogoutMarker: 1, detectedLoginMarker: 0, url: 'https://www.clarksons.net.cn/sin/' };
    },
    fetchJson: async () => ({ status: 200, body: [] })
  };
  const status = await getStatus(client);
  assert.equal(status.session.authenticated, true);
  assert.equal('accountLabel' in status.session, false);
});

test('browser extraction excludes personal areas and inputs before returning text', () => {
  const text = (value) => ({ nodeType: 3, nodeValue: value });
  const element = (tagName, children, excluded = false, hidden = false) => ({
    nodeType: 1, tagName, childNodes: children, matches: () => excluded, hidden
  });
  const root = element('MAIN', [
    element('NAV', [text('Private Person')], true),
    element('INPUT', [text('private-password')], true),
    element('DIV', [text('hidden-personal-data')], false, true),
    element('TR', [element('TD', [text('OCEAN STAR')]), element('TD', [text('82000')])]),
    element('P', [text('person@example.com')])
  ]);
  const context = { URL, location: { href: 'https://www.clarksons.net.cn/sin/' },
    document: { title: 'Market', querySelector: () => root },
    getComputedStyle: (el) => ({ display: el.hidden ? 'none' : 'block', visibility: 'visible' }) };
  const result = vm.runInNewContext(`(function(){${pageExtractionCode('main')}})()`, context);
  assert(result.textContent.includes('OCEAN STAR\t82000'));
  for (const secret of ['Private Person', 'private-password', 'hidden-personal-data', 'person@example.com']) assert(!result.textContent.includes(secret));
  assert.equal(root.childNodes.length, 5);
});

test('installed skill helper uses the same browser-side privacy implementation', () => {
  const source = fs.readFileSync(path.join(__dirname, '../skills/clarksons-sin/scripts/browser-extract.js'), 'utf8');
  const expected = pageExtractionCode('__CLARKSONS_CONTENT_SELECTOR__').replace('"__CLARKSONS_CONTENT_SELECTOR__"', 'selector');
  assert(source.includes(expected));
});

test('MCP protocol errors and malformed input do not echo personal text', async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '../mcp/src/server.cjs')], {
    env: { ...process.env, CLARKS_TRANSPORT: 'direct' }, windowsHide: true
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Exit ${code}`)));
  });
  child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'private@example.com' } }) + '\n{private@example.com\n');
  await done;
  assert.equal(JSON.parse(stdout.trim()).error.code, -32602);
  assert(!stdout.includes('private@example.com'));
  assert(!stderr.includes('private@example.com'));
});
