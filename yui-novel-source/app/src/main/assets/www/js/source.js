import { requestText } from './net.js';

const ATTRS = new Set(['text', 'href', 'src', 'value', 'html', 'ownText', 'title', 'alt', 'data-src']);
const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'BLOCKQUOTE', 'PRE']);
const RULE_KEYS = ['search', 'detail', 'toc', 'content'];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h).toString(36);
}

function resolveBase(raw) {
  const value = String(raw || '').trim();
  if (!value) return location.href;
  try {
    return new URL(value, location.href).href;
  } catch (e) {
    return location.href;
  }
}

export function resolveUrl(base, value) {
  const url = String(value == null ? '' : value).trim();
  if (!url) return '';
  if (/^(javascript|data|mailto|tel|about):/i.test(url)) return '';
  try {
    return new URL(url, base || location.href).href;
  } catch (e) {
    return url;
  }
}

function parseHeaders(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const obj = JSON.parse(raw);
    const out = {};
    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] === 'string' && obj[key]) out[key] = obj[key];
    });
    return out;
  } catch (e) {
    return {};
  }
}

function fillTemplate(template, vars) {
  return String(template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    return vars[key] == null ? match : String(vars[key]);
  });
}

function splitRule(rule) {
  let body = String(rule == null ? '' : rule).trim();
  let replace = null;
  const index = body.indexOf('##');
  if (index > 0) {
    const tail = body.slice(index + 2);
    body = body.slice(0, index);
    const parts = tail.split('##');
    replace = { pattern: parts[0] || '', replacement: parts.length > 1 ? parts[1] : '' };
  }
  return { body, replace };
}

function applyReplace(text, replace) {
  if (!replace || !replace.pattern) return text;
  try {
    return String(text).replace(new RegExp(replace.pattern, 'g'), replace.replacement);
  } catch (e) {
    return text;
  }
}

function parsePrefix(body) {
  const match = /^@?(css|json|xpath|js|javascript)[:：]/i.exec(body);
  if (match) return { mode: match[1].toLowerCase(), rest: body.slice(match[0].length) };
  return { mode: '', rest: body };
}

function cssEscape(value) {
  if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value).replace(/[^\w-]/g, (c) => `\\${c}`);
}

function qsa(root, selector) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch (e) {
    return [];
  }
}

function selectBySegment(root, segment) {
  let selector = String(segment || '').trim();
  if (!selector) return [];
  let index = null;
  const indexMatch = selector.match(/\[(-?\d+)\]$/);
  if (indexMatch) {
    index = Number(indexMatch[1]);
    selector = selector.slice(0, indexMatch.index).trim();
  }

  let nodes = [];
  if (selector.startsWith('class.')) {
    const cls = selector.slice(6).trim().split(/\s+/)[0];
    if (cls) nodes = qsa(root, `.${cssEscape(cls)}`);
  } else if (selector.startsWith('id.')) {
    const id = selector.slice(3).trim().split(/\s+/)[0];
    if (id) nodes = qsa(root, `#${cssEscape(id)}`);
  } else if (selector.startsWith('tag.')) {
    const tag = selector.slice(4).trim();
    if (tag) nodes = qsa(root, tag);
  } else if (selector.startsWith('text.')) {
    const needle = selector.slice(5);
    const scope = root.querySelectorAll ? root : null;
    if (scope) {
      nodes = Array.from(scope.querySelectorAll('*')).filter((el) => {
        return el.children.length === 0 && (el.textContent || '').includes(needle);
      }).slice(0, 1);
    }
  } else if (selector === 'children') {
    nodes = root && root.children ? Array.from(root.children) : [];
  } else {
    nodes = qsa(root, selector);
  }

  if (index !== null) {
    const picked = index < 0 ? nodes[nodes.length + index] : nodes[index];
    return picked ? [picked] : [];
  }
  return nodes;
}

function selectAll(root, rule) {
  const { body } = splitRule(rule);
  const { mode, rest } = parsePrefix(body);
  if (mode === 'js' || mode === 'javascript') throw new Error('UNSUPPORTED_JS');
  if (mode === 'xpath') throw new Error('UNSUPPORTED_XPATH');
  if (mode === 'json') return [];
  const segments = rest.split('@').map((s) => s.trim()).filter(Boolean);
  if (!segments.length) return [root];

  let nodes = [root];
  for (const segment of segments) {
    if (ATTRS.has(segment) || segment.startsWith('attr.')) break;
    const next = [];
    for (const node of nodes) next.push(...selectBySegment(node, segment));
    nodes = Array.from(new Set(next)).slice(0, 1200);
    if (!nodes.length) break;
  }
  return nodes;
}

function ownText(node) {
  let text = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) text += child.nodeValue || '';
  });
  return text;
}

function nodeText(node) {
  return node ? node.textContent || '' : '';
}

function extract(node, rule) {
  if (!node) return '';
  if (rule == null || rule === '') return nodeText(node).trim();
  const { body, replace } = splitRule(rule);
  const { mode, rest } = parsePrefix(body);
  if (mode === 'js' || mode === 'javascript') throw new Error('UNSUPPORTED_JS');
  if (mode === 'xpath') throw new Error('UNSUPPORTED_XPATH');
  if (mode === 'json') return '';
  const segments = rest.split('@').map((s) => s.trim()).filter(Boolean);
  if (!segments.length) return applyReplace(nodeText(node).trim(), replace);

  let current = [node];
  let attr = '';
  for (const segment of segments) {
    if (ATTRS.has(segment) || segment.startsWith('attr.')) {
      attr = segment.startsWith('attr.') ? segment.slice(5) : segment;
      break;
    }
    const next = [];
    for (const item of current) next.push(...selectBySegment(item, segment));
    current = next;
    if (!current.length) break;
  }

  const target = current[0];
  if (!target) return '';
  let value = '';
  if (!attr || attr === 'text') value = nodeText(target);
  else if (attr === 'html') value = target.innerHTML || '';
  else if (attr === 'ownText') value = ownText(target);
  else if (attr === 'value') value = target.value || target.getAttribute('value') || '';
  else if (attr === 'content') value = target.getAttribute('content') || '';
  else value = target.getAttribute(attr) || '';
  return applyReplace(value.trim(), replace);
}

function jsonSelect(root, path) {
  let clean = String(path == null ? '' : path).trim();
  clean = clean.replace(/^@?json[:：]/i, '').replace(/^\$/, '');
  if (!clean || clean === '.') {
    if (root == null) return [];
    return Array.isArray(root) ? root : [root];
  }
  const segments = [];
  const pattern = /([^.[\]]+)|\[([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(clean))) {
    segments.push(match[1] ? match[1] : `[${match[2]}]`);
  }

  let current = [root];
  for (const segment of segments) {
    const next = [];
    for (const item of current) {
      if (item == null) continue;
      if (segment.startsWith('[')) {
        const inner = segment.slice(1, -1).trim();
        if (inner === '*') {
          if (Array.isArray(item)) next.push(...item);
          else if (typeof item === 'object') next.push(...Object.values(item));
        } else if (/^-?\d+$/.test(inner)) {
          if (Array.isArray(item)) {
            const index = Number(inner);
            const value = index < 0 ? item[item.length + index] : item[index];
            if (value !== undefined) next.push(value);
          }
        }
      } else if (segment === '*') {
        if (Array.isArray(item)) next.push(...item);
        else if (typeof item === 'object') next.push(...Object.values(item));
      } else if (typeof item === 'object' && segment in item) {
        next.push(item[segment]);
      }
    }
    current = next;
  }
  return current;
}

function fieldJson(item, rule) {
  if (rule == null || rule === '') return typeof item === 'string' ? item : '';
  const { body, replace } = splitRule(rule);
  const { mode, rest } = parsePrefix(body);
  if (mode === 'js' || mode === 'javascript') throw new Error('UNSUPPORTED_JS');
  if (mode === 'xpath') throw new Error('UNSUPPORTED_XPATH');
  const path = (mode === 'json' ? rest : body).trim();
  if (!path || path === '$') return typeof item === 'string' ? item : '';
  const values = jsonSelect(item, path);
  if (!values.length) return '';
  const value = values[0];
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return applyReplace(text, replace);
}

function parseResponse(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('EMPTY_RESPONSE');
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return { root: JSON.parse(text), isJson: true };
    } catch (e) {
    }
  }
  return { root: new DOMParser().parseFromString(text, 'text/html'), isJson: false };
}

function splitParagraphs(value) {
  return String(value == null ? '' : value)
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.replace(/[ \t\u3000]+/g, ' ').trim())
    .filter((line) => line.length > 1);
}

function htmlToParagraphs(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(`<div id="__pl_wrap">${html}</div>`, 'text/html');
  const wrap = doc.getElementById('__pl_wrap');
  if (!wrap) return [];
  wrap.querySelectorAll('br').forEach((br) => {
    br.replaceWith(doc.createTextNode('\n'));
  });
  const output = [];
  const push = (text) => {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (cleaned.length > 1) output.push(cleaned);
  };
  let buffer = '';
  const walk = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 3) {
        buffer += child.nodeValue || '';
        return;
      }
      if (child.nodeType !== 1) return;
      if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') return;
      if (BLOCK_TAGS.has(child.tagName)) {
        push(buffer);
        buffer = '';
        walk(child);
        push(buffer);
        buffer = '';
      } else {
        walk(child);
      }
    });
  };
  walk(wrap);
  push(buffer);
  return output;
}

function buildSearchUrl(source, keyword, page, base) {
  const raw = String(source.searchUrl || '').trim();
  if (!raw) throw new Error('NO_SEARCH_URL');
  const filled = fillTemplate(raw, {
    key: encodeURIComponent(keyword),
    page: String(page || 1),
    baseUrl: base
  });
  return resolveUrl(base, filled);
}

export function normalizeSource(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_SOURCE');
  const name = String(raw.bookSourceName || raw.name || '').trim();
  const url = String(raw.bookSourceUrl || raw.url || '').trim();
  if (!name) throw new Error('NO_NAME');
  if (!url) throw new Error('NO_URL');

  const rules = [];
  if (raw.searchUrl || (raw.ruleSearch && raw.ruleSearch.bookList)) rules.push('search');
  if (raw.ruleBookInfo && Object.values(raw.ruleBookInfo).some(Boolean)) rules.push('detail');
  if (raw.ruleToc && raw.ruleToc.chapterList) rules.push('toc');
  if (raw.ruleContent && raw.ruleContent.content) rules.push('content');
  if (!rules.length) throw new Error('NO_RULES');

  const data = { ...raw, bookSourceName: name, bookSourceUrl: url };
  const meta = {
    id: `src-${hash(`${name}|${url}`)}`,
    name,
    url,
    group: String(raw.bookSourceGroup || '未分组'),
    enabled: raw.enabled !== false,
    rules,
    addedAt: Date.now()
  };
  return { meta, data };
}

export function parseImportPayload(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || '').replace(/^\uFEFF/, '').trim());
  } catch (e) {
    throw new Error('INVALID_JSON');
  }
  let list = [];
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && Array.isArray(parsed.bookSources)) list = parsed.bookSources;
  else if (parsed && typeof parsed === 'object') list = [parsed];
  if (!list.length) throw new Error('NO_SOURCE');

  const items = [];
  const errors = [];
  list.forEach((raw) => {
    try {
      items.push(normalizeSource(raw));
    } catch (e) {
      errors.push({ name: (raw && (raw.bookSourceName || raw.name)) || '未命名书源', message: e.message });
    }
  });
  if (!items.length) throw new Error(errors[0] ? errors[0].message : 'NO_SOURCE');
  return { items, errors };
}

export function sourceCapabilities(source) {
  const rules = source && source.meta ? source.meta.rules : [];
  return RULE_KEYS.filter((key) => rules.includes(key));
}

export async function searchSource(source, keyword, page = 1) {
  const rule = source.ruleSearch || {};
  if (!source.searchUrl && !rule.bookList) throw new Error('NO_SEARCH');
  const base = resolveBase(source.bookSourceUrl);
  const url = buildSearchUrl(source, keyword, page, base);
  const text = await requestText(url, parseHeaders(source.header));
  const { root, isJson } = parseResponse(text);

  let nodes = [];
  if (isJson) nodes = rule.bookList ? jsonSelect(root, rule.bookList) : (Array.isArray(root) ? root : [root]);
  else nodes = rule.bookList ? selectAll(root, rule.bookList) : [root];

  const items = [];
  for (const node of nodes.slice(0, 80)) {
    const item = isJson
      ? {
        name: fieldJson(node, rule.name),
        author: fieldJson(node, rule.author),
        bookUrl: resolveUrl(url, fieldJson(node, rule.bookUrl)),
        coverUrl: resolveUrl(url, fieldJson(node, rule.coverUrl)),
        intro: fieldJson(node, rule.intro),
        kind: fieldJson(node, rule.kind),
        lastChapter: fieldJson(node, rule.lastChapter)
      }
      : {
        name: extract(node, rule.name),
        author: extract(node, rule.author),
        bookUrl: resolveUrl(url, extract(node, rule.bookUrl)),
        coverUrl: resolveUrl(url, extract(node, rule.coverUrl)),
        intro: extract(node, rule.intro),
        kind: extract(node, rule.kind),
        lastChapter: extract(node, rule.lastChapter)
      };
    if (item.name && item.bookUrl) items.push(item);
  }

  const checkKeyWord = fillTemplate(String(rule.checkKeyWord || '').trim(), { key: keyword });
  if (checkKeyWord) {
    return items.filter((item) => `${item.name}${item.author}`.includes(checkKeyWord));
  }
  return items;
}

export async function fetchDetail(source, bookUrl, fallback = {}) {
  const rule = source.ruleBookInfo || {};
  const hasRules = Object.values(rule).some(Boolean);
  let root = null;
  let isJson = false;
  if (hasRules) {
    const text = await requestText(bookUrl, parseHeaders(source.header));
    const parsed = parseResponse(text);
    root = parsed.root;
    isJson = parsed.isJson;
  }
  const get = (key) => {
    if (!root || !rule[key]) return '';
    return isJson ? fieldJson(root, rule[key]) : extract(root, rule[key]);
  };

  return {
    name: get('name') || fallback.name || '',
    author: get('author') || fallback.author || '',
    coverUrl: resolveUrl(bookUrl, get('coverUrl') || fallback.coverUrl || ''),
    intro: get('intro') || fallback.intro || '',
    kind: get('kind') || fallback.kind || '',
    lastChapter: get('lastChapter') || fallback.lastChapter || '',
    wordCount: get('wordCount') || '',
    tocUrl: resolveUrl(bookUrl, get('tocUrl')) || bookUrl,
    bookUrl
  };
}

export async function fetchToc(source, tocUrl) {
  const rule = source.ruleToc || {};
  const text = await requestText(tocUrl, parseHeaders(source.header));
  const { root, isJson } = parseResponse(text);
  const listRule = String(rule.chapterList || '');
  let nodes = [];
  if (isJson) nodes = listRule ? jsonSelect(root, listRule) : [];
  else {
    nodes = listRule ? selectAll(root, listRule) : [];
    if (!nodes.length) nodes = qsa(root, 'a');
  }

  const chapters = [];
  for (const node of nodes.slice(0, 3000)) {
    const title = isJson ? fieldJson(node, rule.chapterName) : extract(node, rule.chapterName || 'text');
    const href = isJson ? fieldJson(node, rule.chapterUrl) : extract(node, rule.chapterUrl || 'href');
    if (!href) continue;
    chapters.push({
      title: String(title || '').trim() || '未命名章节',
      url: resolveUrl(tocUrl, href)
    });
  }
  if (!chapters.length) throw new Error('NO_CHAPTERS');
  return chapters;
}

export async function fetchContent(source, chapterUrl) {
  const rule = source.ruleContent || {};
  const contentRule = String(rule.content || '');
  const text = await requestText(chapterUrl, parseHeaders(source.header));
  const { root, isJson } = parseResponse(text);

  if (isJson) {
    return splitParagraphs(fieldJson(root, contentRule));
  }

  if (!contentRule) {
    return splitParagraphs(root.body ? root.body.textContent : '');
  }

  const { body } = splitRule(contentRule);
  const { mode } = parsePrefix(body);
  if (mode === 'js' || mode === 'javascript') throw new Error('UNSUPPORTED_JS');
  if (mode === 'xpath') throw new Error('UNSUPPORTED_XPATH');

  const nodes = selectAll(root, contentRule);
  if (!nodes.length) throw new Error('NO_CONTENT');

  const wantsHtml = /@(?:html)\b/i.test(contentRule) || !/@(?:text|ownText)\b/i.test(contentRule);
  let paragraphs = [];
  if (wantsHtml) {
    paragraphs = htmlToParagraphs(nodes.map((node) => node.innerHTML || '').join('\n'));
  }
  if (!paragraphs.length) {
    paragraphs = splitParagraphs(nodes.map((node) => node.textContent || '').join('\n'));
  }
  if (!paragraphs.length) throw new Error('NO_CONTENT');
  return paragraphs;
}