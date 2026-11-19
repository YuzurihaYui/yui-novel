const pending = new Map();
let seq = 0;

window.__plHttpDone = function __plHttpDone(id, ok, body, error) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  window.clearTimeout(entry.timer);
  if (ok) entry.resolve(body);
  else entry.reject(new Error(error || 'NETWORK_ERROR'));
};

export function hasNativeBridge() {
  return !!(window.PaperLanternNative && typeof window.PaperLanternNative.httpGet === 'function');
}

function isLocalTarget(url) {
  try {
    const parsed = new URL(url, location.href);
    return parsed.origin === location.origin;
  } catch (e) {
    return true;
  }
}

function decodeBuffer(buffer, contentType) {
  const match = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType || '');
  const bytes = new Uint8Array(buffer);
  if (match) {
    try {
      return new TextDecoder(match[1]).decode(buffer);
    } catch (e) {
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (e) {
  }
  try {
    return new TextDecoder('gbk').decode(buffer);
  } catch (e) {
  }
  return new TextDecoder('utf-8').decode(buffer);
}

export async function requestText(url, headers = {}, options = {}) {
  const target = String(url || '').trim();
  if (!target) throw new Error('EMPTY_URL');

  const method = String(options.method || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
  const payload = options.body == null ? '' : String(options.body);
  const nativeOptions = {
    method,
    body: payload,
    charset: options.charset || 'UTF-8'
  };
  if (options.headers && typeof options.headers === 'object') {
    nativeOptions.headers = options.headers;
  }

  if (hasNativeBridge() && !isLocalTarget(target)) {
    return new Promise((resolve, reject) => {
      const id = `pl${Date.now().toString(36)}${++seq}`;
      const timer = window.setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error('TIMEOUT'));
        }
      }, 34000);
      pending.set(id, { resolve, reject, timer });
      try {
        window.PaperLanternNative.httpGet(
          id,
          target,
          JSON.stringify(headers || {}),
          JSON.stringify(nativeOptions)
        );
      } catch (e) {
        pending.delete(id);
        window.clearTimeout(timer);
        reject(new Error('BRIDGE_ERROR'));
      }
    });
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30000);
  const requestHeaders = { ...(headers || {}) };
  const hasContentType = Object.keys(requestHeaders).some((key) => key.toLowerCase() === 'content-type');
  if (method === 'POST' && !hasContentType) {
    requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  try {
    const response = await fetch(target, {
      method,
      body: method === 'POST' ? payload : undefined,
      headers: requestHeaders,
      credentials: 'omit',
      signal: controller.signal,
      mode: 'cors'
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const buffer = await response.arrayBuffer();
    return decodeBuffer(buffer, response.headers.get('content-type'));
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('TIMEOUT');
    if (String(e.message || '').startsWith('HTTP_')) throw e;
    throw new Error('NETWORK_OR_CORS');
  } finally {
    window.clearTimeout(timer);
  }
}