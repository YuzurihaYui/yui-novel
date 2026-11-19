const ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  rank: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  shelf: '<path d="M6 4h12v17l-6-4.4L6 21z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/>',
  back: '<path d="m14.5 5-7 7 7 7"/>',
  next: '<path d="m9.5 5 7 7-7 7"/>',
  more: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  font: '<path d="M4 19 10 5h1.5L18 19"/><path d="M6.8 14h8.4"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  download: '<path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M4 19h16"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  wifi: '<path d="M3.5 9.5a13 13 0 0 1 17 0M6.8 13a8.5 8.5 0 0 1 10.4 0M10 16.3a3.4 3.4 0 0 1 4 0"/><circle cx="12" cy="19.5" r="1"/>',
  upload: '<path d="M12 16V5m0 0 4 4m-4-4L8 9"/><path d="M4 19h16"/>',
  trash: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".9"/>',
  heart: '<path d="M12 20s-7-4.4-7-9.4A3.9 3.9 0 0 1 12 7a3.9 3.9 0 0 1 7 3.6c0 5-7 9.4-7 9.4z"/>',
  message: '<path d="M4 5.5h16v11H9l-5 4z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  sparkle: '<path d="M12 3.5 13.8 9l5.7 1.8L13.8 12.6 12 18l-1.8-5.4L4.5 10.8 10.2 9z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"/>',
  fire: '<path d="M12 21c3.8 0 6-2.5 6-5.6 0-4-3.4-6.2-5-9.4-1 3-2.2 4-2.2 6.2 0 1.2-.7 1.8-1.4 1.8-.9 0-1.4-.7-1.4-1.9C6.6 13.6 6 14.8 6 16c0 2.6 2.2 5 6 5z"/>',
  cloud: '<path d="M7 18h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6.7A3.2 3.2 0 0 0 7 18z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5z"/><path d="M5 18.5V5.5"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5S14.4 18.2 12 20.5M12 3.5C9.6 5.8 8.4 8.6 8.4 12s1.2 6.2 3.6 8.5"/>',
  file: '<path d="M6 3.5h8L19 8v12.5H6z"/><path d="M14 3.5V8h5"/>',
  folder: '<path d="M3.5 7h6l2 2.5h9V19H3.5z"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M19 8.5A7.5 7.5 0 1 0 19.5 15"/><path d="M19 4v5h-5"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19"/>',
  arrowUp: '<path d="M12 19V5m0 0-5 5m5-5 5 5"/>',
  arrowDown: '<path d="M12 5v14m0 0 5-5m-5 5-5-5"/>',
  quote: '<path d="M9 7c-2.5 0-4 1.8-4 4s1.6 3.6 3.5 3.6c.6 0 1.1-.1 1.5-.3-.4 1.8-1.7 3-3.4 3.4M18 7c-2.5 0-4 1.8-4 4s1.6 3.6 3.5 3.6c.6 0 1.1-.1 1.5-.3-.4 1.8-1.7 3-3.4 3.4"/>'
};

export function icon(name, size = 20, stroke = 1.7) {
  const path = ICON_PATHS[name] || ICON_PATHS.info;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function esc(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

export function fmtWords(n) {
  if (!n) return '—';
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万字`;
  return `${n} 字`;
}

export function fmtHeat(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  return String(n);
}

export function initials(name) {
  return String(name || '读').slice(0, 1);
}

export function avatarTone(name) {
  let h = 0;
  for (let i = 0; i < String(name).length; i += 1) h = (h * 31 + String(name).charCodeAt(i)) % 997;
  const list = ['', 'warm', 'jade'];
  return list[h % 3];
}

export function throttle(fn, wait) {
  let last = 0;
  let timer = 0;
  return (...args) => {
    const now = Date.now();
    const remain = wait - (now - last);
    if (remain <= 0) {
      last = now;
      fn(...args);
    } else {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        last = Date.now();
        fn(...args);
      }, remain);
    }
  };
}

export function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export function $(sel, scope = document) {
  return scope.querySelector(sel);
}

export function $$(sel, scope = document) {
  return Array.from(scope.querySelectorAll(sel));
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}