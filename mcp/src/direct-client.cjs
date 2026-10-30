'use strict';

const { BrowserBridgeError } = require('./chrome-client.cjs');

const DEFAULT_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'
};

class DirectClarksonsClient {
  constructor() {
    this.mode = 'direct';
    this.directMode = true;
    this.queue = Promise.resolve();
  }

  async ensureConnected() {}

  async withClarksonsTab(operation) {
    const run = this.queue.then(
      () =>
        operation({
          tabId: null,
          windowId: null,
          previousActive: null,
          url: 'https://www.clarksons.net.cn/sin/',
          direct: true
        }),
      () =>
        operation({
          tabId: null,
          windowId: null,
          previousActive: null,
          url: 'https://www.clarksons.net.cn/sin/',
          direct: true
        })
    );
    this.queue = run.catch(() => {});
    return run;
  }

  async networkRequest(url, options = {}) {
    let response = null;
    let text = '';
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.max(1000, Number(options.timeout) || 30000)
      );
      try {
        response = await fetch(url, {
          method: options.method || 'GET',
          headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) },
          body: options.body,
          redirect: 'follow',
          signal: controller.signal
        });
        text = await response.text();
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt === 2) {
          throw new BrowserBridgeError(
            'CLARKS_DIRECT_FETCH_FAILED',
            `Direct Clarksons request failed: ${error.message}`,
            { url }
          );
        }
        await delay(750 * (attempt + 1));
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!response || lastError) {
      throw new BrowserBridgeError(
        'CLARKS_DIRECT_FETCH_FAILED',
        'Direct Clarksons request failed.',
        { url }
      );
    }

    const headers = Object.fromEntries(response.headers.entries());
    const contentType = headers['content-type'] || '';
    let body = text;

    if (/application\/json/i.test(contentType) || /^[\[{]/.test(text.trim())) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body
    };
  }

  async fetchJson(url, options = {}) {
    return this.networkRequest(url, {
      ...options,
      headers: { Accept: 'application/json', ...(options.headers || {}) }
    });
  }

  async getWebContent(url, options = {}) {
    const response = await this.networkRequest(url, {
      timeout: options.timeout || 45000,
      headers: { Accept: 'text/html,application/xhtml+xml' }
    });
    const html = typeof response.body === 'string' ? response.body : String(response.body || '');
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

    return {
      success: response.status >= 200 && response.status < 400,
      status: response.status,
      url,
      title: titleMatch ? decodeHtml(titleMatch[1]).trim() : '',
      textContent: htmlToText(html)
    };
  }

  async getWindowsAndTabs() {
    return { windowCount: 0, tabCount: 0, windows: [] };
  }

  async switchTab() {
    return { success: true, mode: 'direct' };
  }

  async navigate() {
    return { success: true, mode: 'direct' };
  }

  async waitForTabUrl() {
    return { mode: 'direct' };
  }

  async waitForSelector() {
    return { found: true, mode: 'direct' };
  }

  async javascript() {
    throw new BrowserBridgeError(
      'CLARKS_DIRECT_JAVASCRIPT_UNSUPPORTED',
      'JavaScript execution is not available in direct mode.'
    );
  }

  async toolJson() {
    throw new BrowserBridgeError(
      'CLARKS_DIRECT_TOOL_UNSUPPORTED',
      'Chrome bridge tools are not available in direct mode.'
    );
  }
}

function htmlToText(html) {
  const cleaned = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return decodeHtml(cleaned);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  DirectClarksonsClient
};

