import { BOOKS, SEED_COMMENTS, READER_NAMES } from './data.js';
import { getCloudText } from './content.js';

const LS_KEY = 'paperlantern.state.v1';
const DB_NAME = 'paperlantern.reader';
const DB_VERSION = 2;
const CH_STORE = 'chapters';
const BOOK_STORE = 'localBooks';
const SOURCE_STORE = 'sources';

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  fontSize: 18,
  lineHeight: 1.9,
  fontFamily: 'serif',
  readerBg: 'night',
  pageMode: 'scroll',
  script: 'simplified',
  autoCache: true,
  wifiOnly: true,
  offlineDemo: false
};

function initialState() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    shelf: ['b3'],
    progress: {},
    comments: {},
    likes: {},
    imported: [],
    recent: [],
    cacheIndex: {},
    sources: []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    const base = initialState();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) }
    };
  } catch (e) {
    return initialState();
  }
}

let state = loadState();
let saveTimer = 0;

function persist() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {
    }
  }, 120);
}

export function getState() {
  return state;
}

export function flush() {
  window.clearTimeout(saveTimer);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
  }
}

export function getSettings() {
  return { ...state.settings };
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist();
  return { ...state.settings };
}

export function allBooks() {
  return BOOKS.concat(state.imported);
}

export function findBook(id) {
  return allBooks().find((b) => b.id === id) || null;
}

export function isOnShelf(id) {
  return state.shelf.includes(id);
}

export function toggleShelf(id) {
  if (state.shelf.includes(id)) {
    state.shelf = state.shelf.filter((x) => x !== id);
  } else {
    state.shelf = [id, ...state.shelf];
  }
  persist();
  return state.shelf.includes(id);
}

export function getShelf() {
  return state.shelf.map((id) => findBook(id)).filter(Boolean);
}

export function getProgress(id) {
  return state.progress[id] || null;
}

export function setProgress(id, chapter, ratio) {
  const book = findBook(id);
  state.progress[id] = {
    chapter,
    ratio: Math.max(0, Math.min(1, ratio || 0)),
    at: Date.now(),
    title: book ? book.chapters[chapter] ? book.chapters[chapter].title : '' : ''
  };
  state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 12);
  persist();
}

export function lastRead() {
  let best = null;
  for (const id of state.recent) {
    const p = state.progress[id];
    if (p && (!best || p.at > best.at)) best = { id, ...p };
  }
  if (!best) {
    for (const id of Object.keys(state.progress)) {
      const p = state.progress[id];
      if (!best || p.at > best.at) best = { id, ...p };
    }
  }
  if (!best) return null;
  const book = findBook(best.id);
  return book ? { book, progress: best } : null;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function seededComments(bookId, chapterIndex) {
  const seedBase = hash(`${bookId}:${chapterIndex}`);
  const count = (seedBase % 3) + 2;
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const item = SEED_COMMENTS[(seedBase + i * 3) % SEED_COMMENTS.length];
    const id = `seed:${bookId}:${chapterIndex}:${i}`;
    result.push({
      id,
      name: item[0],
      text: item[1],
      base: item[2] + ((seedBase + i * 17) % 60),
      time: `${(seedBase + i) % 23 + 1} 小时前`,
      official: false
    });
  }
  return result;
}

export function getComments(bookId, chapterIndex) {
  const key = `${bookId}:${chapterIndex}`;
  const seeded = seededComments(bookId, chapterIndex);
  const extra = state.comments[key] || [];
  return extra.concat(seeded).map((c) => {
    const liked = !!state.likes[c.id];
    return {
      ...c,
      liked,
      count: (c.base || 0) + (liked ? 1 : 0)
    };
  });
}

export function addComment(bookId, chapterIndex, text, name) {
  const key = `${bookId}:${chapterIndex}`;
  const comment = {
    id: `user:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    name: name || '路过的读者',
    text,
    base: 0,
    time: '刚刚',
    official: false
  };
  state.comments[key] = [comment, ...(state.comments[key] || [])];
  persist();
  return comment;
}

export function toggleLike(commentId) {
  if (state.likes[commentId]) delete state.likes[commentId];
  else state.likes[commentId] = 1;
  persist();
  return !!state.likes[commentId];
}

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('NO_INDEXEDDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CH_STORE)) db.createObjectStore(CH_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(BOOK_STORE)) db.createObjectStore(BOOK_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SOURCE_STORE)) db.createObjectStore(SOURCE_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbPut(store, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(store, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(store, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

function updateCacheIndex(bookId, index, add) {
  const list = new Set(state.cacheIndex[bookId] || []);
  if (add) list.add(index);
  else list.delete(index);
  state.cacheIndex[bookId] = Array.from(list).sort((a, b) => a - b);
  persist();
}

export function cachedCount(bookId) {
  return (state.cacheIndex[bookId] || []).length;
}

export function isBookCached(book, bookId) {
  const target = book || findBook(bookId);
  if (!target) return false;
  if (target.local) return true;
  return cachedCount(target.id) >= target.chapters.length;
}

export async function getCachedChapter(bookId, index) {
  if (!('indexedDB' in window)) return null;
  try {
    const row = await idbGet(CH_STORE, `${bookId}:${index}`);
    return row ? row.text : null;
  } catch (e) {
    return null;
  }
}

export async function cacheChapter(bookId, index, text, title) {
  await idbPut(CH_STORE, { key: `${bookId}:${index}`, text, title: title || '' });
  updateCacheIndex(bookId, index, true);
}

export function connectionIsWifi() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return null;
  if (conn.type) return conn.type === 'wifi';
  const types = conn.effectiveType || '';
  return types.includes('4g') || types === 'wifi';
}

export function isOffline() {
  if (state.settings.offlineDemo) return true;
  return navigator.onLine === false;
}

export async function loadChapterText(book, index) {
  if (!book) throw new Error('NO_BOOK');
  if (book.local) {
    const rec = await getLocalBook(book.id);
    if (!rec || !rec.chapters[index]) throw new Error('NO_CONTENT');
    return rec.chapters[index].paragraphs;
  }
  const cached = await getCachedChapter(book.id, index);
  if (cached) return cached;
  if (isOffline()) throw new Error('OFFLINE_UNCACHED');
  if (book.remote) {
    const paragraphs = await fetchRemoteChapter(book, index);
    await cacheChapter(book.id, index, paragraphs, book.chapters[index].title);
    return paragraphs;
  }
  await new Promise((r) => setTimeout(r, 280));
  const text = getCloudText(book.id, index);
  if (!text) throw new Error('NO_CONTENT');
  return text;
}

async function fetchRemoteChapter(book, index) {
  const meta = state.sources.find((item) => item.id === book.sourceId);
  if (!meta) throw new Error('SOURCE_MISSING');
  if (!meta.enabled) throw new Error('SOURCE_DISABLED');
  const data = await getSourceData(book.sourceId);
  if (!data) throw new Error('SOURCE_MISSING');
  const chapter = book.chapters[index];
  if (!chapter || !chapter.url) throw new Error('NO_CONTENT');
  const { fetchContent } = await import('./source.js');
  return fetchContent(data, chapter.url);
}

export async function cacheBook(book, onProgress) {
  const total = book.chapters.length;
  if (book.local) return { done: total, failed: 0 };
  const conn = connectionIsWifi();
  if (state.settings.wifiOnly && conn === false) {
    throw new Error('NEED_WIFI');
  }
  if (book.remote && isOffline()) throw new Error('OFFLINE');

  let failed = 0;
  for (let i = 0; i < total; i += 1) {
    const already = (state.cacheIndex[book.id] || []).includes(i);
    if (!already) {
      try {
        const text = book.remote ? await fetchRemoteChapter(book, i) : getCloudText(book.id, i);
        if (text && text.length) {
          await cacheChapter(book.id, i, text, book.chapters[i].title);
        }
      } catch (e) {
        if (book.remote) failed += 1;
        else throw e;
      }
      await new Promise((r) => setTimeout(r, book.remote ? 240 : 180));
    }
    if (onProgress) onProgress(i + 1, total);
  }
  return { done: total - failed, failed };
}

export async function cacheSingleChapter(book, index) {
  if (!book) throw new Error('NO_BOOK');
  if (book.local) return true;
  if (isOffline()) throw new Error('OFFLINE');
  if (book.remote) {
    const paragraphs = await fetchRemoteChapter(book, index);
    await cacheChapter(book.id, index, paragraphs, book.chapters[index].title);
    return true;
  }
  const text = getCloudText(book.id, index);
  if (!text) throw new Error('NO_CONTENT');
  await cacheChapter(book.id, index, text, book.chapters[index].title);
  return true;
}

export function getNickname() {
  let name = '';
  try {
    name = localStorage.getItem('paperlantern.nick') || '';
  } catch (e) {
    name = '';
  }
  if (!name) {
    name = READER_NAMES[Math.floor(Math.random() * READER_NAMES.length)];
    try {
      localStorage.setItem('paperlantern.nick', name);
    } catch (e) {
    }
  }
  return name;
}

export async function removeBookCache(bookId) {
  const list = state.cacheIndex[bookId] || [];
  for (const index of list) {
    try {
      await idbDelete(CH_STORE, `${bookId}:${index}`);
    } catch (e) {
    }
  }
  state.cacheIndex[bookId] = [];
  persist();
}

function makeImportId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function importLocalBook(book, chapters) {
  const id = makeImportId();
  const paletteList = [
    ['#2b343c', '#9aa7b2'],
    ['#3a2f2a', '#c39a7c'],
    ['#2c3530', '#8fae9b'],
    ['#302c38', '#9c92b0']
  ];
  const palette = paletteList[Math.floor(Math.random() * paletteList.length)];
  const meta = {
    id,
    title: book.title,
    author: book.author || '本地导入',
    tags: ['本地导入', book.format === 'epub' ? 'EPUB' : 'TXT'],
    status: 'local',
    words: chapters.reduce((sum, ch) => sum + ch.paragraphs.join('').length, 0),
    rating: 0,
    heat: 0,
    reads: '本地',
    trend: 0,
    updated: '本地文件',
    palette,
    pattern: 'import',
    desc: book.desc || `从本地导入的${book.format === 'epub' ? ' EPUB ' : ' TXT '}电子书，共 ${chapters.length} 章。正文保存在设备内，无需联网即可阅读。`,
    chapters: chapters.map((ch, i) => ({ id: i, title: ch.title })),
    local: true,
    format: book.format || 'txt'
  };
  await idbPut(BOOK_STORE, { id, chapters });
  state.imported = [meta, ...state.imported];
  state.shelf = [id, ...state.shelf];
  state.cacheIndex[id] = chapters.map((_, i) => i);
  persist();
  return meta;
}

export function sourceMetas() {
  return state.sources.slice();
}

export async function getSourceData(id) {
  if (!('indexedDB' in window)) return null;
  try {
    const row = await idbGet(SOURCE_STORE, id);
    return row ? row.data : null;
  } catch (e) {
    return null;
  }
}

export async function addSources(items) {
  const added = [];
  for (const item of items) {
    const meta = item.meta;
    const exists = state.sources.some((s) => s.id === meta.id || (s.name === meta.name && s.url === meta.url));
    if (exists) continue;
    await idbPut(SOURCE_STORE, { id: meta.id, data: item.data });
    state.sources.push(meta);
    added.push(meta);
  }
  persist();
  return added;
}

export function toggleSourceEnabled(id) {
  const meta = state.sources.find((s) => s.id === id);
  if (!meta) return false;
  meta.enabled = !meta.enabled;
  persist();
  return meta.enabled;
}

export async function deleteSource(id) {
  state.sources = state.sources.filter((s) => s.id !== id);
  try {
    await idbDelete(SOURCE_STORE, id);
  } catch (e) {
  }
  persist();
}

export async function addRemoteBook(book) {
  const existing = state.imported.find((b) => b.id === book.id);
  if (existing) {
    state.imported = state.imported.map((b) => (b.id === book.id ? book : b));
  } else {
    state.imported = [book, ...state.imported];
  }
  if (!state.shelf.includes(book.id)) state.shelf = [book.id, ...state.shelf];
  persist();
  return book;
}

export async function getLocalBook(id) {
  if (!('indexedDB' in window)) return null;
  try {
    return await idbGet(BOOK_STORE, id);
  } catch (e) {
    return null;
  }
}

export async function removeLocalBook(id) {
  try {
    await idbDelete(BOOK_STORE, id);
  } catch (e) {
  }
  try {
    await removeBookCache(id);
  } catch (e) {
  }
  state.imported = state.imported.filter((b) => b.id !== id);
  state.shelf = state.shelf.filter((x) => x !== id);
  delete state.cacheIndex[id];
  delete state.progress[id];
  state.recent = state.recent.filter((x) => x !== id);
  persist();
}

export function totalCachedBooks() {
  return Object.keys(state.cacheIndex).filter((id) => state.cacheIndex[id].length > 0).length;
}

export function clearAllData() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch (e) {
  }
  state = initialState();
  persist();
}