// Generated from mcp/src/privacy.cjs; returns cleaned text without changing the page.
function extractClarksonsContent(selector = "main") {
function redactUrl(value) {
  try {
    const url = new URL(value);
    let changed = Boolean(url.username || url.password);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|password|email|username|session[_-]?id|code|signature|sig|auth)$/i.test(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (/(?:token|password|session|email|authorization|code)=/i.test(url.hash)) {
      url.hash = '';
      changed = true;
    }
    return changed ? url.href : value;
  } catch {
    return value;
  }
}
function redactText(value) {
  return value
    .replace(/https?:\/\/[^\s<>"']+/gi, (url) => redactUrl(url))
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g, '[REDACTED_CREDENTIAL]')
    .replace(/((?:password|passwd|access[_ -]?token|refresh[_ -]?token|api[_ -]?key|authorization|cookie|set-cookie)\s*["']?\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/((?:account\s*(?:name|holder)|user\s*name|display\s*name|\u7528\u6237\u540d|\u8d26\u53f7\u59d3\u540d|\u767b\u5f55\u7528\u6237)\s*[:\uff1a=]\s*)[^\r\n]+/gi, '$1[REDACTED_PERSONAL]')
    .replace(/((?:phone|telephone|mobile|tel\.?|\u7535\u8bdd|\u624b\u673a\u53f7)\s*[:\uff1a=]\s*)\+?[\d ()-]{6,}\d/gi, '$1[REDACTED_PHONE]')
    .replace(/((?:home\s*address|billing\s*address|\u5bb6\u5ead\u4f4f\u5740|\u8d26\u5355\u5730\u5740)\s*[:\uff1a=]\s*)[^\r\n]+/gi, '$1[REDACTED_ADDRESS]');
}
return (function extractPageText(selector) {
  const root = document.querySelector(selector);
  if (!root) return { success: false, error: 'Requested content selector was not found.' };
  const excluded = 'script,style,noscript,template,input,textarea,select,nav,[role="navigation"],[hidden],[aria-hidden="true"],a[href^="mailto:"],a[href^="tel:"],#account-menu,#accountMenu,.account-menu,.user-menu,.user-profile,[data-personal]';
  function visit(node) {
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1 || node.matches(excluded)) return '';
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return '';
    const content = [...node.childNodes].map(visit).join('');
    if (/^(TD|TH)$/.test(node.tagName)) return content + '\t';
    if (/^(BR|P|DIV|SECTION|ARTICLE|LI|TR|H[1-6])$/.test(node.tagName)) return content + '\n';
    return content;
  }
  return {
    success: true,
    url: redactUrl(location.href),
    title: redactText(document.title),
    textContent: redactText(visit(root)).replace(/\n{3,}/g, '\n\n').trim()
  };
})(selector);
}
