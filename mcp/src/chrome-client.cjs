'use strict';
const { pageExtractionCode } = require('./privacy.cjs');

const DEFAULT_ENDPOINT = process.env.CHROME_MCP_URL || 'http://127.0.0.1:12306/mcp';
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

class BrowserBridgeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BrowserBridgeError';
    this.code = code;
    this.details = details;
  }
}

class ChromeMcpClient {
  constructor(endpoint = DEFAULT_ENDPOINT) {
    this.endpoint = endpoint;
    this.sessionId = null;
    this.protocolVersion = DEFAULT_PROTOCOL_VERSION;
    this.nextId = 1;
    this.queue = Promise.resolve();
    this.serverInfo = null;
  }

  async ensureConnected() {
    if (this.sessionId) {
      return;
    }
    await this.connect();
  }

  async connect() {
    const initialize = {
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'initialize',
      params: {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'clarksons-sin-mcp',
          version: '1.0.0'
        }
      }
    };

    const initialized = await this.post(initialize, { expectResponse: true, includeSession: false });
    const result = initialized.message?.result;
    if (!result) {
      throw new BrowserBridgeError(
        'CHROME_INIT_FAILED',
        'The Chrome MCP bridge did not return an initialize result.',
        { response: initialized.message }
      );
    }

    this.serverInfo = result.serverInfo || null;
    this.protocolVersion = result.protocolVersion || DEFAULT_PROTOCOL_VERSION;

    await this.post(
      {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      },
      { expectResponse: false, includeSession: true }
    );
  }

  async post(message, options = {}) {
    const expectResponse = options.expectResponse !== false;
    const includeSession = options.includeSession !== false;
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream'
    };

    if (includeSession && this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
      headers['mcp-protocol-version'] = this.protocolVersion;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 60000);

    let response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: controller.signal
      });
    } catch (error) {
      throw new BrowserBridgeError(
        'CHROME_BRIDGE_UNREACHABLE',
        `Cannot reach the Chrome MCP bridge at ${this.endpoint}.`,
        { cause: error.message }
      );
    } finally {
      clearTimeout(timeout);
    }

    const sessionId = response.headers.get('mcp-session-id');
    if (sessionId) {
      this.sessionId = sessionId;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 400 || response.status === 404) {
        this.sessionId = null;
      }
      throw new BrowserBridgeError(
        'CHROME_BRIDGE_HTTP_ERROR',
        `Chrome MCP bridge returned HTTP ${response.status}.`,
        { status: response.status, body: text.slice(0, 1000) }
      );
    }

    if (!expectResponse) {
      await response.text().catch(() => '');
      return { sessionId: this.sessionId };
    }

    const text = await response.text();
    const messageResponse = parseMcpResponse(text, response.headers.get('content-type') || '', message.id);
    return { message: messageResponse, sessionId: this.sessionId };
  }

  async withReconnect(operation) {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof BrowserBridgeError &&
        error.code === 'CHROME_BRIDGE_HTTP_ERROR' &&
        (error.details?.status === 400 || error.details?.status === 404)
      ) {
        this.sessionId = null;
        await this.connect();
        return operation();
      }
      throw error;
    }
  }

  async callTool(name, args = {}) {
    await this.ensureConnected();
    return this.withReconnect(async () => {
      const response = await this.post({
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'tools/call',
        params: {
          name,
          arguments: args
        }
      });

      const result = response.message?.result;
      if (!result) {
        throw new BrowserBridgeError(
          'CHROME_TOOL_EMPTY',
          `Chrome MCP tool ${name} returned no result.`,
          { response: response.message }
        );
      }

      if (result.isError) {
        throw new BrowserBridgeError(
          'CHROME_TOOL_ERROR',
          `Chrome MCP tool ${name} failed: ${toolText(result)}`,
          { tool: name, result }
        );
      }

      return result;
    });
  }

  async toolJson(name, args = {}) {
    const result = await this.callTool(name, args);
    return parseJsonFromText(toolText(result));
  }

  async getWindowsAndTabs() {
    return this.toolJson('get_windows_and_tabs', {});
  }

  async switchTab(tabId, windowId) {
    return this.toolJson('chrome_switch_tab', { tabId, windowId });
  }

  async navigate(url, tabId, options = {}) {
    return this.toolJson('chrome_navigate', {
      url,
      tabId,
      background: options.background !== false
    });
  }

  async waitForTabUrl(tabId, expectedUrl, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    const expected = normalizePageUrl(expectedUrl);

    while (Date.now() < deadline) {
      const tabInfo = await this.getWindowsAndTabs();
      const tab = findTabById(tabInfo, tabId);
      if (tab && isClarksonsLoginUrl(tab.url)) {
        throw new BrowserBridgeError(
          'CLARKS_LOGIN_REQUIRED',
          'Clarksons redirected the page to its login screen.',
          { tabId, expectedUrl, currentUrl: tab.url }
        );
      }
      if (tab && normalizePageUrl(tab.url) === expected) {
        return tab;
      }
      await delay(250);
    }

    throw new BrowserBridgeError(
      'CLARKS_NAVIGATION_TIMEOUT',
      'Clarksons did not finish navigating to the requested page.',
      { tabId, expectedUrl }
    );
  }

  async waitForSelector(tabId, selector, timeoutMs = 15000) {
    const result = await this.javascript(
      `
        const deadline = Date.now() + ${Math.max(1000, timeoutMs - 1000)};
        while (Date.now() < deadline) {
          if (document.querySelector(${JSON.stringify(selector)})) {
            return {
              found: true,
              url: location.href,
              title: document.title,
              readyState: document.readyState
            };
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return {
          found: false,
          url: location.href,
          title: document.title,
          readyState: document.readyState
        };
      `,
      tabId,
      timeoutMs
    );

    if (!result.found) {
      throw new BrowserBridgeError(
        'CLARKS_SELECTOR_TIMEOUT',
        `Clarksons page did not expose selector ${selector}.`,
        { tabId, selector, page: result }
      );
    }

    return result;
  }

  async javascript(code, tabId, timeoutMs = 20000) {
    const outer = await this.toolJson('chrome_javascript', {
      code,
      tabId,
      timeoutMs,
      maxOutputBytes: 100000
    });

    if (!outer.success) {
      throw new BrowserBridgeError(
        'CHROME_JAVASCRIPT_ERROR',
        outer.error?.message || 'Chrome JavaScript execution failed.',
        { outer }
      );
    }

    return parseNestedJson(outer.result);
  }

  async networkRequest(url, options = {}) {
    let outer;
    let lastError;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        outer = await this.toolJson('chrome_network_request', {
          url,
          method: options.method || 'GET',
          headers: options.headers || {},
          ...(options.body === undefined ? {} : { body: options.body }),
          timeout: options.timeout || 30000
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof BrowserBridgeError &&
          error.code === 'CHROME_TOOL_ERROR' &&
          /receiving end does not exist|failed to fetch|error replaying request/i.test(
            error.message
          );
        if (!retryable || attempt === 2) {
          throw error;
        }
        await delay(750);
      }
    }

    if (lastError) {
      throw lastError;
    }

    if (!outer.success) {
      throw new BrowserBridgeError(
        'CHROME_NETWORK_ERROR',
        outer.error?.message || 'Chrome network request failed.',
        { outer }
      );
    }

    return outer.response;
  }

  async fetchJson(url, options = {}) {
    const response = await this.networkRequest(url, options);
    if (response.body !== '[Binary data not displayed]') {
      return normalizeJsonResponse(response);
    }

    const result = await this.javascript(
      `
        const response = await fetch(${JSON.stringify(url)}, {
          method: ${JSON.stringify(options.method || 'GET')},
          credentials: 'include',
          headers: ${JSON.stringify(options.headers || { Accept: 'application/json' })}
        });
        const text = await response.text();
        return {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type') || '',
          text
        };
      `,
      options.tabId,
      options.timeout || 30000
    );

    return normalizeJsonResponse({
      status: result.status,
      statusText: result.statusText,
      headers: { 'content-type': result.contentType || '' },
      body: parseJsonText(result.text)
    });
  }

  async getWebContent(url, options = {}) {
    const outer = await this.javascript(
      pageExtractionCode(options.selector || 'body'), options.tabId
    );

    if (!outer.success) {
      throw new BrowserBridgeError(
        'CHROME_CONTENT_ERROR',
        outer.error?.message || 'Chrome page content extraction failed.',
        {}
      );
    }

    return outer;
  }

  async withClarksonsTab(operation) {
    const run = this.queue.then(
      () => this.withClarksonsTabUnlocked(operation),
      () => this.withClarksonsTabUnlocked(operation)
    );
    this.queue = run.catch(() => {});
    return run;
  }

  async withClarksonsTabUnlocked(operation) {
    await this.ensureConnected();

    const before = await this.getWindowsAndTabs();
    const candidate = findClarksonsTab(before);
    if (!candidate) {
      throw new BrowserBridgeError(
        'CLARKS_TAB_NOT_FOUND',
        'No Clarksons tab was found in Chrome. Open https://www.clarksons.net.cn/sin/ and sign in first.',
        { tabCount: countTabs(before) }
      );
    }

    const window = (before.windows || []).find((item) => item.windowId === candidate.windowId);
    const previousActive = (window?.tabs || []).find((tab) => tab.active && tab.tabId !== candidate.tabId) || null;
    let switched = false;

    if (!candidate.active) {
      await this.switchTab(candidate.tabId, candidate.windowId);
      switched = true;
    }

    try {
      return await operation({
        tabId: candidate.tabId,
        windowId: candidate.windowId,
        previousActive
      });
    } finally {
      if (switched && previousActive) {
        try {
          const after = await this.getWindowsAndTabs();
          const activeWindow = (after.windows || []).find((item) => item.windowId === candidate.windowId);
          const activeTab = (activeWindow?.tabs || []).find((tab) => tab.active);
          if (activeTab?.tabId === candidate.tabId) {
            await this.switchTab(previousActive.tabId, candidate.windowId);
          }
        } catch {
          // Restoring focus is best-effort; the tool result must still be returned.
        }
      }
    }
  }
}

function countTabs(tabInfo) {
  return (tabInfo?.windows || []).reduce((total, window) => total + (window.tabs || []).length, 0);
}

function findTabById(tabInfo, tabId) {
  for (const window of tabInfo?.windows || []) {
    const tab = (window.tabs || []).find((item) => item.tabId === tabId);
    if (tab) {
      return { ...tab, windowId: window.windowId };
    }
  }
  return null;
}

function findClarksonsTab(tabInfo) {
  const candidates = [];
  for (const window of tabInfo?.windows || []) {
    for (const tab of window.tabs || []) {
      try {
        const url = new URL(tab.url);
        if (!/clarksons\.net\.cn$/i.test(url.hostname)) {
          continue;
        }
        let score = 0;
        if (/^\/sin\/News\/Article\/\d+/i.test(url.pathname)) {
          score += 50;
        } else if (url.pathname.startsWith('/sin/')) {
          score += 20;
        }
        if (url.pathname.startsWith('/n/')) {
          score += 5;
        }
        if (/Shipping Intelligence Network|航运情报网络/i.test(tab.title || '')) {
          score += 3;
        }
        if (tab.active) {
          score += 1;
        }
        candidates.push({
          tabId: tab.tabId,
          windowId: window.windowId,
          url: tab.url,
          title: tab.title || '',
          active: Boolean(tab.active),
          score
        });
      } catch {
        // Ignore tabs without a valid URL.
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function toolText(result) {
  return (result?.content || [])
    .filter((item) => item && item.type === 'text')
    .map((item) => item.text || '')
    .join('\n')
    .trim();
}

function parseMcpResponse(text, contentType, expectedId) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new BrowserBridgeError('CHROME_EMPTY_RESPONSE', 'Chrome MCP bridge returned an empty response.');
  }

  if (contentType.includes('text/event-stream')) {
    const events = trimmed.split(/\r?\n\r?\n/);
    for (const event of events) {
      const dataLines = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());
      if (!dataLines.length) {
        continue;
      }
      const payload = dataLines.join('\n');
      try {
        const message = JSON.parse(payload);
        if (message.id === expectedId) {
          return message;
        }
      } catch {
        // Ignore keepalive or non-JSON SSE events.
      }
    }
  }

  try {
    const message = JSON.parse(trimmed);
    if (message.id === expectedId) {
      return message;
    }
  } catch {
    // Fall through to the structured error below.
  }

  throw new BrowserBridgeError(
    'CHROME_RESPONSE_PARSE_ERROR',
    'Could not parse the Chrome MCP response.',
    { contentType, sample: trimmed.slice(0, 1000) }
  );
}

function parseJsonFromText(text) {
  const value = extractFirstJsonValue(text);
  if (value === null) {
    throw new BrowserBridgeError(
      'CHROME_JSON_PARSE_ERROR',
      'Chrome MCP returned text without a JSON payload.',
      { sample: String(text).slice(0, 1000) }
    );
  }
  return value;
}

function parseNestedJson(value) {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }
  if (!/^[\[{]/.test(trimmed)) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function parseJsonText(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeJsonResponse(response) {
  if (!response || typeof response !== 'object') {
    return response;
  }
  if (typeof response.body === 'string' && /^[\[{]/.test(response.body.trim())) {
    try {
      return { ...response, body: JSON.parse(response.body) };
    } catch {
      return response;
    }
  }
  return response;
}

function normalizePageUrl(value) {
  try {
    const url = new URL(value);
    const pathname = url.pathname !== '/' ? url.pathname.replace(/\/+$/, '') : url.pathname;
    return `${url.origin}${pathname}${url.search}${url.hash}`;
  } catch {
    return String(value || '').replace(/\/+$/, '');
  }
}

function isClarksonsLoginUrl(value) {
  try {
    const url = new URL(value);
    return /(^|\/)login(\/|$)/i.test(url.pathname) || /login/i.test(url.hash);
  } catch {
    return /login/i.test(String(value || ''));
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractFirstJsonValue(text) {
  const source = String(text || '');
  let start = -1;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '{' || source[index] === '[') {
      start = index;
      break;
    }
  }
  if (start === -1) {
    return null;
  }

  const opener = source[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opener) {
      depth += 1;
      continue;
    }
    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        const candidate = source.slice(start, index + 1);
        try {
          return JSON.parse(candidate);
        } catch (error) {
          throw new BrowserBridgeError(
            'CHROME_JSON_PARSE_ERROR',
            'Chrome MCP returned malformed JSON.',
            { sample: candidate.slice(0, 1000), cause: error.message }
          );
        }
      }
    }
  }

  return null;
}

module.exports = {
  BrowserBridgeError,
  ChromeMcpClient,
  DEFAULT_ENDPOINT
};

