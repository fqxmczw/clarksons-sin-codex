'use strict';

const { BrowserBridgeError } = require('./chrome-client.cjs');

const ORIGIN = 'https://www.clarksons.net.cn';
const HOME_URL = `${ORIGIN}/sin/`;
const SEARCH_BASE = `${ORIGIN}/api/agg/SIN/search/root`;
const REGISTER_SEARCH_URL = `${ORIGIN}/sin/RegisterSearch/GetSearchResults`;
const TIMESERIES_URL = `${ORIGIN}/api/timeseries/SIN//markets/data`;

const REGISTER_CATEGORIES = {
  fleet: { searchTypeId: 1, label: 'Fleet' },
  companies: { searchTypeId: 2, label: 'Companies' },
  ports: { searchTypeId: 3, label: 'Ports' },
  builders: { searchTypeId: 4, label: 'Builders' },
  repair: { searchTypeId: 5, label: 'Repair' }
};

const NEWS_TABS = {
  latest: 'Latest',
  analysis: 'Analysis',
  briefings: 'Briefings',
  chinese: '中文',
  middle_east: 'Middle East',
  us_policy: 'US Policy',
  green: 'Green',
  new_content: 'New Content',
  all: null
};

async function getStatus(client) {
  if (client.directMode) {
    const searchAccess = await searchAccessProbe(client, null);
    return {
      ok: true,
      source: 'Clarksons Shipping Intelligence Network',
      retrievedAt: nowIso(),
      transport: 'direct-public',
      browser: {
        tabFound: false,
        mode: 'direct'
      },
      session: {
        authenticated: false,
        accountLabel: null,
        searchAccess: searchAccess.accessible,
        searchAccessEvidence: searchAccess.evidence,
        loginMarker: true,
        logoutMarker: false
      },
      timeseriesAccess: 'unknown',
      action:
        'Direct mode reads public Clarksons data only. For restricted pages, open Clarksons in the Minis browser and sign in there.'
    };
  }

  const result = await client.withClarksonsTab(async ({ tabId }) => {
    const page = await client.javascript(
      `
        const text = document.body ? document.body.innerText : '';
        let user = null;
        try {
          const injector = window.angular && window.angular.element(document.body).injector();
          user = injector ? injector.get('SiteConstants').User : null;
        } catch {}
        return {
          url: location.href,
          title: document.title,
          account: user && user.GreetingName ? user.GreetingName : null,
          authFlag: user && user.IsAuthenticated ? 1 : 0,
          logoutMarker: /Logout|注销/i.test(text) ? 1 : 0,
          loginMarker: /Login \\/ Sign up|登录 \\/注册/i.test(text) ? 1 : 0,
          detectedLogoutMarker: /Logout/i.test(text) ? 1 : 0,
          detectedLoginMarker: /Login \\/ Sign up|登录/i.test(text) ? 1 : 0
        };
      `,
      tabId,
      15000
    );

    const searchCheck = await searchAccessProbe(client, tabId);
    return { page, searchCheck };
  });

  const searchAccess = result.searchCheck;
  const authenticated = Boolean(
    result.page.authFlag === 1 ||
      (result.page.detectedLogoutMarker === 1 && result.page.detectedLoginMarker === 0)
  );

  return {
    ok: true,
    source: 'Clarksons Shipping Intelligence Network',
    retrievedAt: nowIso(),
    browser: {
      tabFound: true,
      url: result.page.url,
      title: result.page.title
    },
    session: {
      authenticated,
      accountLabel: result.page.account || null,
      searchAccess: searchAccess.accessible,
      searchAccessEvidence: searchAccess.evidence,
      loginMarker: result.page.detectedLoginMarker === 1,
      logoutMarker: result.page.detectedLogoutMarker === 1
    },
    timeseriesAccess: 'unknown',
    action: authenticated
      ? null
      : 'Open the Clarksons tab in Chrome, sign in, and retry the tool.'
  };
}

async function searchAccessProbe(client, tabId) {
  const url = new URL(`${SEARCH_BASE}/1/1/contains`);
  url.searchParams.set('searchText', 'Maersk');
  const response = await client.fetchJson(url.href, {
    headers: { Accept: 'application/json' },
    timeout: 30000,
    tabId
  });

  const body = response.body;
  if (Array.isArray(body)) {
    const resultCount = body.reduce((total, group) => total + (group.results || []).length, 0);
    return {
      accessible: resultCount > 0,
      evidence: `AGGREGATRIX returned ${resultCount} result(s).`
    };
  }

  const text = typeof body === 'string' ? body : JSON.stringify(body);
  if (isLoginText(text)) {
    return {
      accessible: false,
      evidence: text.slice(0, 300)
    };
  }

  return {
    accessible: false,
    evidence: `Unexpected AGGREGATRIX response: ${text.slice(0, 300)}`
  };
}

async function search(client, args = {}) {
  const query = requiredString(args.query, 'query', 1, 300);
  const page = clampInt(args.page, 1, 1, 1000);
  const pageSize = clampInt(args.page_size, 25, 1, 50);
  const searchType = normalizeSearchType(args.search_type);
  const scope = normalizeScope(args.scope);

  const url = new URL(`${SEARCH_BASE}/${pageSize}/${page}/${searchType}`);
  url.searchParams.set('searchText', query);

  const response = await client.withClarksonsTab(async ({ tabId }) =>
    client.fetchJson(url.href, {
      headers: { Accept: 'application/json' },
      timeout: 45000,
      tabId
    })
  );

  if (!Array.isArray(response.body)) {
    const text = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
    if (isLoginText(text)) {
      return loginRequiredResult('clarksons_search', query);
    }
    throw new BrowserBridgeError(
      'CLARKS_SEARCH_RESPONSE_INVALID',
      'Clarksons returned an unexpected search response.',
      { body: text.slice(0, 2000) }
    );
  }

  const groups = response.body.map((group) => normalizeSearchGroup(group));
  const filteredGroups = groups.filter((group) => matchesScope(group.name, scope));
  const results = filteredGroups.flatMap((group) =>
    (group.results || []).map((item) => ({ ...item, group: group.name }))
  );

  return {
    ok: true,
    query,
    searchType,
    page,
    pageSize,
    scope,
    sourceUrl: humanSearchUrl(query, searchType, page, pageSize),
    apiUrl: url.href,
    retrievedAt: nowIso(),
    groups: filteredGroups.map((group) => ({
      name: group.name,
      providerType: group.providerType,
      page: group.page,
      pageSize: group.pageSize,
      moreResults: group.moreResults,
      recordCount: group.recordCount,
      resultCount: group.results.length
    })),
    results,
    notes: [
      'Results are grouped by the Clarksons site-wide search endpoint.',
      'Empty source URLs for reports or timeseries are normal; use their nodeId or seriesIds with the specialized tools.'
    ]
  };
}

function normalizeSearchGroup(group = {}) {
  return {
    name: String(group.pageName || 'Unknown'),
    providerType: group.searchProviderType || null,
    page: group.page ?? null,
    pageSize: group.pageSize ?? null,
    moreResults: Boolean(group.moreResults),
    recordCount: group.recordCount ?? null,
    results: (group.results || []).map((result) => ({
      title: String(result.display || '').trim(),
      url: result.url || '',
      id: result.id || null,
      additionalInfo: parseJsonLoose(result.additionalInfoJson),
      sortOrder: result.sortOrder ?? null,
      pageSortOrder: result.pageSortOrder ?? null
    }))
  };
}

async function latestNews(client, args = {}) {
  const tabKey = String(args.tab || 'latest').toLowerCase();
  if (!(tabKey in NEWS_TABS)) {
    throw new BrowserBridgeError('INVALID_ARGUMENT', `Unknown news tab: ${tabKey}`);
  }
  const tabName = NEWS_TABS[tabKey];
  const limit = clampInt(args.limit, 20, 1, 100);
  const language = normalizeLanguage(args.language);
  const query = args.query ? String(args.query).trim().toLowerCase() : '';
  const category = args.category ? String(args.category).trim().toLowerCase() : '';

  if (client.directMode) {
    return directLatestNews(client, {
      tabKey,
      limit,
      language,
      query,
      category
    });
  }

  const home = await fetchHomeModel(client);
  let articles = collectHomeArticles(home);

  if (tabName) {
    articles = articles.filter((article) => article.feedTab === tabName);
  }
  if (language !== 'all') {
    articles = articles.filter((article) => article.language === language);
  }
  if (query) {
    articles = articles.filter((article) =>
      [article.title, article.synopsis, ...article.categories]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }
  if (category) {
    articles = articles.filter((article) =>
      article.categories.some((item) => item.toLowerCase().includes(category))
    );
  }

  articles.sort((a, b) => b.sortDate - a.sortDate);
  const availableCount = articles.length;
  articles = articles.slice(0, limit);

  return {
    ok: true,
    tab: tabKey,
    language,
    sourceUrl: HOME_URL,
    retrievedAt: nowIso(),
    availableCount,
    returnedCount: articles.length,
    feedCoverage: 'Clarksons SIN homepage feed; use clarksons_search for broader archive search.',
    results: articles.map(toPublicArticleSummary)
  };
}

async function article(client, args = {}) {
  const articleUrl = resolveArticleUrl(args.article_id, args.url);
  const articleId = extractArticleId(articleUrl);
  const maxChars = clampInt(args.max_chars, 30000, 1000, 120000);
  const includeBody = args.include_body !== false;

  if (client.directMode) {
    return articleSummaryFallback(client, {
      articleId,
      articleUrl,
      maxChars,
      includeBody,
      loginRequired: true
    });
  }

  let content = null;
  let loginRequired = false;

  try {
    content = await client.withClarksonsTab(async ({ tabId }) =>
      readClarksonsPage(client, tabId, articleUrl, '#newsArticle')
    );
  } catch (error) {
    if (!isArticleAccessError(error)) {
      throw error;
    }
    loginRequired = true;
  }

  if (!content) {
    return articleSummaryFallback(client, {
      articleId,
      articleUrl,
      maxChars,
      includeBody,
      loginRequired
    });
  }

  const text = String(content.textContent || '');
  const parsed = parseArticleContent(text);
  const accessLimited = detectAccessLimited(text) || loginRequired;
  const body = includeBody ? truncateText(parsed.body, maxChars) : '';

  return {
    ok: true,
    articleId,
    sourceUrl: articleUrl,
    retrievedAt: nowIso(),
    title: parsed.title,
    authors: parsed.author ? [parsed.author] : [],
    publishedDate: parsed.date,
    accessLimited,
    loginRequired: loginRequired || isLoginText(text),
    body,
    truncated: includeBody && parsed.body.length > body.length,
    notes: accessLimited
      ? ['Clarksons page text indicates that the current session or subscription may not have full access to this article.']
      : []
  };
}

async function articleSummaryFallback(
  client,
  { articleId, articleUrl, maxChars, includeBody, loginRequired }
) {
  if (client.directMode) {
    return directArticleSummary(client, {
      articleId,
      articleUrl,
      maxChars,
      includeBody,
      loginRequired
    });
  }

  const home = await fetchHomeModel(client);
  const summary = collectHomeArticles(home).find(
    (item) => String(item.articleId) === String(articleId)
  );

  if (!summary) {
    return {
      ok: true,
      articleId,
      sourceUrl: articleUrl,
      retrievedAt: nowIso(),
      title: '',
      authors: [],
      publishedDate: '',
      accessLimited: true,
      loginRequired,
      body: '',
      truncated: false,
      notes: [
        'The full article requires a Clarksons login or subscription, and no matching homepage summary was available.'
      ]
    };
  }

  return {
    ok: true,
    articleId,
    sourceUrl: articleUrl,
    retrievedAt: nowIso(),
    title: summary.title,
    authors: summary.authors,
    publishedDate: summary.publishedOn,
    accessLimited: true,
    loginRequired,
    body: includeBody ? truncateText(summary.synopsis, maxChars) : '',
    synopsis: summary.synopsis,
    categories: summary.categories,
    truncated: false,
    notes: [
      'Full text was not available from the current Clarksons session. This result is the public homepage summary and must not be cited as the full article.'
    ]
  };
}

async function registerSearch(client, args = {}) {
  const query = requiredString(args.query, 'query', 1, 300);
  const category = String(args.category || 'fleet').toLowerCase();
  const config = REGISTER_CATEGORIES[category];
  if (!config) {
    throw new BrowserBridgeError('INVALID_ARGUMENT', `Unknown register category: ${category}`);
  }
  const page = clampInt(args.page, 1, 1, 1000);
  const pageSize = clampInt(args.page_size, 20, 1, 20);

  const url = new URL(REGISTER_SEARCH_URL);
  url.searchParams.set('search', query);
  url.searchParams.set('searchTypeId', String(config.searchTypeId));
  url.searchParams.set('page', String(page));
  url.searchParams.set('pageSize', String(pageSize));

  const response = await client.withClarksonsTab(async ({ tabId }) =>
    client.fetchJson(url.href, {
      headers: { Accept: 'application/json' },
      timeout: 45000,
      tabId
    })
  );

  const body = response.body;
  if (!body || typeof body !== 'object') {
    return loginRequiredResult('clarksons_register_search', query, category);
  }

  const flatResults = (body.Results || []).flat().filter(Boolean);
  if (
    flatResults.length === 1 &&
    !flatResults[0].Title &&
    isLoginText(String(flatResults[0].SubTitle || ''))
  ) {
    return loginRequiredResult('clarksons_register_search', query, category);
  }

  return {
    ok: true,
    query,
    category,
    sourceUrl: url.href,
    retrievedAt: nowIso(),
    page: body.Page ?? page,
    pageSize: body.PageSize ?? pageSize,
    recordCount: body.RecordCount ?? flatResults.length,
    moreResults: Boolean(body.MoreResults),
    results: flatResults.map((item) => ({
      title: item.Title || '',
      subtitle: item.SubTitle || '',
      url: item.Url || '',
      docId: item.DocId ?? null,
      navId: item.NavId ?? null,
      trackId: item.TrackId ?? null
    }))
  };
}

async function timeseries(client, args = {}) {
  const ids = normalizeSeriesIds(args.series_ids);
  const maxRows = clampInt(args.max_rows, 200, 1, 2000);
  const fromDate = parseDateBoundary(args.from_date);
  const toDate = parseDateBoundary(args.to_date);

  const url = new URL(TIMESERIES_URL);
  for (const id of ids) {
    url.searchParams.append('tsSeriesIds', String(id));
  }
  url.searchParams.set('useShortName', 'false');

  const response = await client.withClarksonsTab(async ({ tabId }) =>
    client.fetchJson(url.href, {
      headers: { Accept: 'application/json' },
      timeout: 45000,
      tabId
    })
  );

  const body = response.body;
  if (!Array.isArray(body)) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    if (isLoginText(text)) {
      return loginRequiredResult('clarksons_timeseries', ids.join(','));
    }
    throw new BrowserBridgeError(
      'CLARKS_TIMESERIES_RESPONSE_INVALID',
      'Clarksons returned an unexpected timeseries response.',
      { body: text.slice(0, 2000) }
    );
  }

  const series = body.map((item) => {
    const info = item.series || {};
    const seriesId = Number(info.tsSeriesId || 0);
    const column = `col${seriesId}`;
    const rawRows = Array.isArray(item.results) ? item.results : [];
    const allRows = rawRows
      .map((row) => ({
        date: row.date || null,
        value: row[column],
        isForecast: Boolean(row.isForecast),
        parsedDate: parseDisplayDate(row.date)
      }))
      .filter((row) => row.date);
    const filteredRows = allRows.filter((row) => {
      if (fromDate && row.parsedDate && row.parsedDate < fromDate) {
        return false;
      }
      if (toDate && row.parsedDate && row.parsedDate > toDate) {
        return false;
      }
      return true;
    });
    const rows = filteredRows.slice(-maxRows).map(({ parsedDate, ...row }) => row);
    const loginLimited = rows.some((row) => /please log ?in/i.test(String(row.value)));

    return {
      seriesId,
      title: item.title || info.name || '',
      name: info.name || '',
      shortName: info.shortName || '',
      unit: info.unit?.description || '',
      frequency: info.frequency ?? null,
      latest: rows.length ? rows[rows.length - 1] : null,
      accessLimited: loginLimited,
      rows
    };
  });

  const accessLimited = series.some((item) => item.accessLimited);
  return {
    ok: true,
    requestedSeriesIds: ids,
    sourceUrl: url.href,
    retrievedAt: nowIso(),
    accessLimited,
    series,
    notes: accessLimited
      ? ['Clarksons returned "Please Login" for one or more series. Check the browser session and subscription entitlement.']
      : []
  };
}

async function marketSnapshot(client, args = {}) {
  const includeLatest = args.include_latest_news !== false;
  const latestLimit = clampInt(args.latest_limit, 5, 1, 20);

  if (client.directMode) {
    const latest = await directLatestNews(client, {
      tabKey: 'latest',
      limit: latestLimit,
      language: 'all',
      query: '',
      category: ''
    });
    return {
      ok: true,
      sourceUrl: HOME_URL,
      retrievedAt: nowIso(),
      indicators: [],
      latestNews: includeLatest ? latest.results : [],
      accessLimited: true,
      notes: [
        'Direct public mode can read the Clarksons search API but cannot bypass the homepage Cloudflare challenge.',
        'Use the Minis browser to open the Clarksons homepage for the four headline indicators.'
      ]
    };
  }

  const content = await client.withClarksonsTab(async ({ tabId }) =>
    readClarksonsPage(client, tabId, HOME_URL, 'body')
  );

  const text = String(content.textContent || '');
  const indicators = parseMarketIndicators(text);
  const home = await fetchHomeModel(client);
  const articles = collectHomeArticles(home)
    .filter((item) => item.feedTab === 'Latest')
    .sort((a, b) => b.sortDate - a.sortDate)
    .slice(0, latestLimit)
    .map(toPublicArticleSummary);

  return {
    ok: true,
    sourceUrl: HOME_URL,
    retrievedAt: nowIso(),
    indicators,
    latestNews: includeLatest ? articles : [],
    accessLimited: detectAccessLimited(text),
    notes: [
      'Indicators are the values displayed on the Clarksons SIN home page at retrieval time.',
      'Use clarksons_timeseries for historical series when the account has entitlement.'
    ]
  };
}

async function page(client, args = {}) {
  const rawUrl = requiredString(args.url, 'url', 1, 2000);
  const url = validateClarksonsUrl(rawUrl);
  const selector = args.selector ? String(args.selector) : 'body';
  const maxChars = clampInt(args.max_chars, 20000, 500, 120000);

  const content = await client.withClarksonsTab(async ({ tabId }) =>
    readClarksonsPage(client, tabId, url, selector)
  );

  const text = String(content.textContent || '');
  if (
    client.directMode &&
    (content.status >= 400 ||
      /performing security verification|just a moment|please wait|请稍候|安全验证/i.test(text))
  ) {
    throw new BrowserBridgeError(
      'CLARKS_DIRECT_BROWSER_REQUIRED',
      'Clarksons blocked the direct page request with a browser verification challenge.',
      { url, status: content.status || null }
    );
  }
  const output = truncateText(text, maxChars);
  return {
    ok: true,
    sourceUrl: url,
    title: content.title || '',
    selector,
    retrievedAt: nowIso(),
    text: output,
    truncated: text.length > output.length,
    accessLimited: detectAccessLimited(text)
  };
}

async function fetchHomeModel(client) {
  const response = await client.withClarksonsTab(async () =>
    client.networkRequest(HOME_URL, {
      headers: { Accept: 'text/html' },
      timeout: 45000
    })
  );
  const html = typeof response.body === 'string' ? response.body : String(response.body || '');
  return parseHomeModel(html);
}

async function directLatestNews(
  client,
  { tabKey, limit, language, query, category }
) {
  const searchText = query || 'shipping';
  const url = new URL(`${SEARCH_BASE}/50/1/contains`);
  url.searchParams.set('searchText', searchText);
  const response = await client.fetchJson(url.href, {
    headers: { Accept: 'application/json' },
    timeout: 45000
  });
  if (!Array.isArray(response.body)) {
    throw new BrowserBridgeError(
      'CLARKS_DIRECT_SEARCH_INVALID',
      'Clarksons direct search returned an unexpected response.',
      { status: response.status }
    );
  }

  let articles = response.body
    .filter((group) => group.pageName === 'Intelligence')
    .flatMap((group) => group.results || [])
    .map((item) => {
      const display = String(item.display || '').trim();
      const dateMatch = display.match(/\[([^\]]+)\]/);
      const publishedOn = dateMatch ? dateMatch[1].trim() : '';
      const title = display.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
      const articleId = extractArticleId(item.url);
      return {
        articleId,
        title,
        synopsis: '',
        authors: [],
        categories: [],
        publishedOn,
        sortDate: parseDisplayDate(publishedOn) || 0,
        language: /[\u3400-\u9fff]/.test(title) ? 'zh' : 'en',
        feedTab: tabKey === 'all' ? 'Latest' : tabKey,
        url: item.url,
        requiresSubscription: true
      };
    })
    .filter((article) => article.articleId && article.title);

  if (language !== 'all') {
    articles = articles.filter((article) => article.language === language);
  }
  if (query) {
    articles = articles.filter((article) =>
      article.title.toLowerCase().includes(query)
    );
  }
  if (category) {
    articles = articles.filter((article) =>
      article.title.toLowerCase().includes(category)
    );
  }

  articles.sort((a, b) => b.sortDate - a.sortDate);
  const availableCount = articles.length;
  articles = articles.slice(0, limit);

  return {
    ok: true,
    tab: tabKey,
    language,
    sourceUrl: HOME_URL,
    retrievedAt: nowIso(),
    availableCount,
    returnedCount: articles.length,
    feedCoverage:
      'Direct public mode fallback: Intelligence search results sorted by the date embedded in each title.',
    results: articles.map(toPublicArticleSummary),
    notes: [
      'Direct mode cannot read the personalized homepage feed or distinguish every homepage tab.',
      'Use the Minis browser for the full homepage feed and restricted article text.'
    ]
  };
}

async function directArticleSummary(
  client,
  { articleId, articleUrl, maxChars, includeBody, loginRequired }
) {
  const url = new URL(`${SEARCH_BASE}/20/1/contains`);
  url.searchParams.set('searchText', String(articleId));
  const response = await client.fetchJson(url.href, {
    headers: { Accept: 'application/json' },
    timeout: 45000
  });
  const hits = Array.isArray(response.body)
    ? response.body.flatMap((group) =>
        (group.results || []).map((item) => ({ group: group.pageName, ...item }))
      )
    : [];
  const match = hits.find(
    (item) => String(extractArticleId(item.url)) === String(articleId)
  );

  if (!match) {
    return {
      ok: true,
      articleId,
      sourceUrl: articleUrl,
      retrievedAt: nowIso(),
      title: '',
      authors: [],
      publishedDate: '',
      accessLimited: true,
      loginRequired,
      body: '',
      truncated: false,
      notes: [
        'Direct public mode found no Clarksons search summary for this article. Open it in the Minis browser to read or sign in.'
      ]
    };
  }

  const display = String(match.display || '').trim();
  const dateMatch = display.match(/\[([^\]]+)\]/);
  const title = display.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
  const publishedOn = dateMatch ? dateMatch[1].trim() : '';

  return {
    ok: true,
    articleId,
    sourceUrl: articleUrl,
    retrievedAt: nowIso(),
    title,
    authors: [],
    publishedDate: publishedOn,
    accessLimited: true,
    loginRequired,
    body: includeBody ? truncateText('', maxChars) : '',
    synopsis: '',
    categories: [],
    truncated: false,
    notes: [
      'Direct public mode recovered the article title and date from Clarksons search, but not the article body.',
      'Open the article in the Minis browser and sign in there for full text.'
    ]
  };
}

async function readClarksonsPage(client, tabId, targetUrl, selector) {
  if (client.directMode) {
    return client.getWebContent(targetUrl, {
      selector,
      textContent: true
    });
  }

  const tab = findCurrentTab(await client.getWindowsAndTabs(), tabId);
  if (!tab) {
    throw new BrowserBridgeError('CLARKS_TAB_NOT_FOUND', 'The selected Clarksons tab is no longer available.');
  }

  const originalUrl = tab.url;
  const shouldNavigate = normalizeComparableUrl(originalUrl) !== normalizeComparableUrl(targetUrl);

  try {
    if (shouldNavigate) {
      await client.navigate(targetUrl, tabId);
      await client.waitForTabUrl(tabId, targetUrl);
    }
    await client.waitForSelector(tabId, selector);
    return await client.getWebContent(targetUrl, {
      tabId,
      selector,
      textContent: true
    });
  } finally {
    if (shouldNavigate) {
      try {
        await client.navigate(originalUrl, tabId);
      } catch {
        // Page restoration is best-effort; the read result must still be returned.
      }
    }
  }
}

function parseHomeModel(html) {
  const marker = '"HomePageType"';
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    throw new BrowserBridgeError(
      'CLARKS_HOME_MODEL_MISSING',
      'Could not find the Clarksons homepage model in the returned HTML.'
    );
  }
  const start = html.lastIndexOf('{', markerIndex);
  if (start < 0) {
    throw new BrowserBridgeError(
      'CLARKS_HOME_MODEL_MISSING',
      'Could not locate the start of the Clarksons homepage model.'
    );
  }
  const json = extractBalancedJson(html, start);
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new BrowserBridgeError(
      'CLARKS_HOME_MODEL_INVALID',
      'The Clarksons homepage model was not valid JSON.',
      { cause: error.message }
    );
  }
}

function collectHomeArticles(home) {
  const intelligence = (home.Pods || []).find((pod) => pod.Name === 'Intelligence');
  const articles = [];

  for (const tab of intelligence?.Tabs || []) {
    const results = tab.Content?.Articles?.Results || [];
    for (const item of results) {
      const article = toArticleSummary(item, tab.Name);
      if (article) {
        articles.push(article);
      }
    }
  }

  const deduped = new Map();
  for (const article of articles) {
    const key = article.url || `id:${article.articleId}`;
    if (!deduped.has(key)) {
      deduped.set(key, article);
    }
  }
  return Array.from(deduped.values());
}

function toArticleSummary(item, feedTab) {
  if (!item || !item.Url || !item.Title) {
    return null;
  }
  const categories = (item.ArticleEntityLinks || [])
    .filter((link) => link.Type === 1 && link.Title)
    .map((link) => String(link.Title).trim());
  const published = item.PublishedOn || item.LastUpdated || null;
  const sortDate = parseDisplayDate(published) || 0;
  const language = feedTab === '中文' || /[\u3400-\u9fff]/.test(item.Title) ? 'zh' : 'en';

  return {
    articleId: item.ArticleId ?? extractArticleId(item.Url),
    title: String(item.Title).trim(),
    synopsis: cleanText(item.Synopsis || ''),
    authors: (item.Authors || []).map((author) => author.Name).filter(Boolean),
    categories: Array.from(new Set(categories)),
    publishedOn: published,
    sortDate,
    language,
    feedTab,
    url: item.Url,
    requiresSubscription: Boolean(item.RequiresTrialistOrSubscriberAccess)
  };
}

function toPublicArticleSummary(article) {
  return {
    articleId: article.articleId,
    title: article.title,
    synopsis: article.synopsis,
    authors: article.authors,
    categories: article.categories,
    publishedOn: article.publishedOn,
    language: article.language,
    feedTab: article.feedTab,
    sourceUrl: article.url,
    requiresSubscription: article.requiresSubscription
  };
}

function parseMarketIndicators(text) {
  const normalized = text.replace(/\s+/g, ' ');
  const indicators = [];

  addIndicator(
    indicators,
    'world_seaborne_trade',
    'World Seaborne Trade',
    normalized,
    /World Seaborne Trade:\s*([0-9.,]+)\s*(bt|mt|billion tonnes|million tonnes)(?:\s*\(([^)]+)\))?/i
  );
  addIndicator(
    indicators,
    'clarksea_index',
    'ClarkSea Index',
    normalized,
    /ClarkSea Index:\s*(\$[0-9,]+(?:\/day)?)/i
  );
  addIndicator(
    indicators,
    'newbuild_price_index',
    'Newbuild Price Index',
    normalized,
    /Newbuild Price Index:\s*([0-9.]+)/i
  );
  addIndicator(
    indicators,
    'ghg_emissions_wtw',
    'GHG Emissions (WTW)',
    normalized,
    /GHG Emissions \(WTW\):\s*([0-9,.]+)\s*(Million Tonnes CO2 eq\.?)/i
  );

  return indicators;
}

function addIndicator(output, key, label, text, regex) {
  const match = text.match(regex);
  if (!match) {
    output.push({ key, label, value: null, change: null, raw: null });
    return;
  }
  output.push({
    key,
    label,
    value: match[1] || null,
    change: match[3] || null,
    raw: match[0]
  });
}

function parseArticleContent(text) {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const title = lines[0] || '';
  let author = '';
  let date = '';
  let dateIndex = -1;

  for (let index = 1; index < Math.min(lines.length, 15); index += 1) {
    const line = lines[index];
    if (!author && /^By\s+/i.test(line)) {
      author = line.replace(/^By\s+/i, '').trim();
      continue;
    }
    if (!author && /^作者[:：]\s*/i.test(line)) {
      author = line.replace(/^作者[:：]\s*/i, '').trim();
      continue;
    }
    if (isDateLine(line)) {
      date = line;
      dateIndex = index;
      break;
    }
  }

  const bodyLines = lines
    .slice(dateIndex >= 0 ? dateIndex + 1 : Math.min(1, lines.length))
    .filter((line) => !/^(Back|Print|Contact Us|Terms of Use|Disclaimer|Privacy Policy|Cookie Policy|Security Statement)$/i.test(line));

  return {
    title,
    author,
    date,
    body: bodyLines.join('\n\n').trim()
  };
}

function isDateLine(value) {
  return (
    /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(value) ||
    /^[A-Za-z]+\s+\d{1,2},\s+\d{4}$/.test(value) ||
    /^\d{4}-\d{2}-\d{2}/.test(value) ||
    /^\d{4}年\d{1,2}月\d{1,2}日$/.test(value)
  );
}

function parseDisplayDate(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDateBoundary(value) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) {
    throw new BrowserBridgeError('INVALID_ARGUMENT', `Invalid date: ${value}`);
  }
  return parsed;
}

function detectAccessLimited(text) {
  const source = String(text || '');
  return (
    isLoginText(source) ||
    /您的订阅不允许|subscription does not allow|not have access|upgrade your subscription|read full story|full article/i.test(
      source
    )
  );
}

function isLoginText(value) {
  return /please log ?in|login required|请登录|登录|注册/i.test(String(value || ''));
}

function isArticleAccessError(error) {
  return (
    error instanceof BrowserBridgeError &&
    [
      'CLARKS_LOGIN_REQUIRED',
      'CLARKS_NAVIGATION_TIMEOUT',
      'CLARKS_SELECTOR_TIMEOUT'
    ].includes(error.code)
  );
}

function loginRequiredResult(tool, query, category = null) {
  return {
    ok: false,
    errorCode: 'LOGIN_REQUIRED',
    tool,
    query,
    category,
    message: 'Clarksons returned a login-required response. The Chrome tab is not authenticated or the session expired.',
    action: 'Open the Clarksons tab in Chrome, sign in, then retry the same tool.'
  };
}

function normalizeSearchType(value) {
  const normalized = String(value || 'contains').toLowerCase();
  if (!['contains', 'startswith'].includes(normalized)) {
    throw new BrowserBridgeError('INVALID_ARGUMENT', 'search_type must be contains or startswith.');
  }
  return normalized;
}

function normalizeScope(value) {
  const normalized = String(value || 'all').toLowerCase();
  const allowed = [
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
  ];
  if (!allowed.includes(normalized)) {
    throw new BrowserBridgeError('INVALID_ARGUMENT', `Unknown search scope: ${normalized}`);
  }
  return normalized;
}

function matchesScope(groupName, scope) {
  if (scope === 'all') {
    return true;
  }
  return String(groupName || '').toLowerCase() === scope;
}

function normalizeLanguage(value) {
  const normalized = String(value || 'all').toLowerCase();
  if (!['all', 'en', 'zh'].includes(normalized)) {
    throw new BrowserBridgeError('INVALID_ARGUMENT', 'language must be all, en, or zh.');
  }
  return normalized;
}

function normalizeSeriesIds(value) {
  if (!Array.isArray(value) || !value.length) {
    throw new BrowserBridgeError('INVALID_ARGUMENT', 'series_ids must be a non-empty array.');
  }
  const ids = value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
  if (!ids.length || ids.length !== value.length || ids.length > 20) {
    throw new BrowserBridgeError('INVALID_ARGUMENT', 'series_ids must contain 1-20 positive integer IDs.');
  }
  return Array.from(new Set(ids));
}

function resolveArticleUrl(articleId, rawUrl) {
  if (articleId !== undefined && articleId !== null && String(articleId).trim() !== '') {
    const id = String(articleId).trim();
    if (!/^\d+$/.test(id)) {
      throw new BrowserBridgeError('INVALID_ARGUMENT', 'article_id must be numeric.');
    }
    return `${ORIGIN}/sin/News/Article/${id}`;
  }
  const url = validateClarksonsUrl(requiredString(rawUrl, 'url or article_id', 1, 2000));
  if (!/\/sin\/News\/Article\/\d+/.test(url)) {
    throw new BrowserBridgeError('INVALID_ARGUMENT', 'url must point to a /sin/News/Article/<id> page.');
  }
  return url;
}

function extractArticleId(url) {
  const match = String(url || '').match(/\/sin\/News\/Article\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

function validateClarksonsUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl, ORIGIN);
  } catch {
    throw new BrowserBridgeError('INVALID_ARGUMENT', 'Invalid URL.');
  }
  if (!/^(www\.)?clarksons\.net\.cn$/i.test(url.hostname)) {
    throw new BrowserBridgeError('INVALID_ARGUMENT', 'Only clarksons.net.cn URLs are allowed.');
  }
  return url.href;
}

function humanSearchUrl(query, searchType, page, pageSize) {
  return `${ORIGIN}/n/#/SIN/search/root/${searchType}/${pageSize}/${page};searchText=${encodeURIComponent(query)}`;
}

function extractBalancedJson(source, start) {
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
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new BrowserBridgeError('CLARKS_HOME_MODEL_INVALID', 'The Clarksons homepage model was truncated.');
}

function parseJsonLoose(value) {
  if (!value || typeof value !== 'string') {
    return value ?? null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function findCurrentTab(tabInfo, tabId) {
  for (const window of tabInfo?.windows || []) {
    const tab = (window.tabs || []).find((item) => item.tabId === tabId);
    if (tab) {
      return { ...tab, windowId: window.windowId };
    }
  }
  return null;
}

function normalizeComparableUrl(value) {
  try {
    const url = new URL(value);
    const pathname = url.pathname !== '/' ? url.pathname.replace(/\/+$/, '') : url.pathname;
    return `${url.origin}${pathname}${url.search}${url.hash}`;
  } catch {
    return String(value || '').replace(/\/+$/, '');
  }
}

function truncateText(value, maxChars) {
  const text = String(value || '');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...[truncated]` : text;
}

function requiredString(value, name, min, max) {
  const text = String(value ?? '').trim();
  if (text.length < min || text.length > max) {
    throw new BrowserBridgeError('INVALID_ARGUMENT', `${name} must be ${min}-${max} characters.`);
  }
  return text;
}

function clampInt(value, fallback, min, max) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  getStatus,
  search,
  latestNews,
  article,
  registerSearch,
  timeseries,
  marketSnapshot,
  page
};

