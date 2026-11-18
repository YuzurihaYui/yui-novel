import * as store from './store.js';
import { icon, esc, throttle, clamp } from './utils.js';
import { convertScript } from './convert.js';

const root = document.getElementById('reader');
const appEl = document.getElementById('app');

let book = null;
let chapter = 0;
let isOpen = false;
let built = false;
let settings = store.getSettings();
let loadToken = 0;
let panelOpen = false;
let savedAppScroll = 0;
let hideTimer = 0;
let lastRatio = 0;

let stageEl;
let scrollEl;
let pagedEl;
let articleScroll;
let articlePaged;
let chromeTop;
let chromeBottom;
let panelLayer;

const FONT_MAP = {
  serif: 'var(--serif)',
  sans: 'var(--sans)',
  kai: '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif CJK SC", serif'
};

function build() {
  if (built) return;
  root.innerHTML = `
    <div class="r-stage" id="rStage">
      <div class="r-scroll" id="rScroll"><article class="r-article" id="rArticleScroll"></article></div>
      <div class="r-paged" id="rPaged"><article class="r-article" id="rArticlePaged"></article></div>
    </div>
    <div class="r-top" id="rTop"></div>
    <div class="r-bottom" id="rBottom"></div>
    <div id="rPanelLayer"></div>
  `;
  stageEl = root.querySelector('#rStage');
  scrollEl = root.querySelector('#rScroll');
  pagedEl = root.querySelector('#rPaged');
  articleScroll = root.querySelector('#rArticleScroll');
  articlePaged = root.querySelector('#rArticlePaged');
  chromeTop = root.querySelector('#rTop');
  chromeBottom = root.querySelector('#rBottom');
  panelLayer = root.querySelector('#rPanelLayer');

  root.addEventListener('click', onRootClick);
  stageEl.addEventListener('click', onStageClick);
  scrollEl.addEventListener('scroll', onScroll, { passive: true });
  pagedEl.addEventListener('scroll', onPagedScroll, { passive: true });
  built = true;
}

function onRootClick(event) {
  const el = event.target.closest('[data-r-act]');
  if (!el) return;
  const act = el.dataset.rAct;
  if (act === 'back') {
    closeReader();
    return;
  }
  if (act === 'toc') {
    openToc();
    return;
  }
  if (act === 'settings') {
    openSettingsPanel();
    return;
  }
  if (act === 'script') {
    toggleScript();
    return;
  }
  if (act === 'close-panel') {
    closePanel();
    return;
  }
  if (act === 'prev-ch') {
    if (chapter > 0) loadChapter(chapter - 1);
    return;
  }
  if (act === 'next-ch') {
    if (book && chapter < book.chapters.length - 1) loadChapter(chapter + 1);
    return;
  }
  if (act === 'retry') {
    loadChapter(chapter, true);
    return;
  }
  if (act === 'cache-now') {
    cacheCurrentChapter();
    return;
  }
  if (act === 'comments') {
    openCommentsPanel();
    return;
  }
  if (act === 'send-comment') {
    sendComment();
    return;
  }
  if (act === 'like') {
    store.toggleLike(el.dataset.id);
    openCommentsPanel();
    return;
  }
  if (act === 'set') {
    applyOption(el.dataset.key, el.dataset.value);
    return;
  }
  if (act === 'toc-go') {
    const index = Number(el.dataset.index);
    closePanel();
    loadChapter(index);
    return;
  }
  if (act === 'toggle-ui') {
    toggleUI();
  }
}

function onStageClick(event) {
  if (event.target.closest('button, a, textarea, input, [data-r-act]')) return;
  if (panelOpen) return;
  const selection = window.getSelection();
  if (selection && String(selection).length > 0) return;
  const rect = stageEl.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  if (settings.pageMode === 'paged' && x < 0.28) {
    pageStep(-1);
    return;
  }
  if (settings.pageMode === 'paged' && x > 0.72) {
    pageStep(1);
    return;
  }
  if (y > 0.18 && y < 0.82) toggleUI();
}

function pageStep(dir) {
  const width = pagedEl.clientWidth;
  pagedEl.scrollBy({ left: dir * width, behavior: 'smooth' });
}

function onScroll() {
  updateProgressUI();
  scheduleSave();
}

function onPagedScroll() {
  updateProgressUI();
  scheduleSave();
}

const scheduleSave = throttle(() => {
  if (!book || !isOpen) return;
  lastRatio = currentRatio();
  store.setProgress(book.id, chapter, lastRatio);
}, 700);

function currentRatio() {
  if (settings.pageMode === 'paged') {
    const max = pagedEl.scrollWidth - pagedEl.clientWidth;
    return max > 0 ? clamp(pagedEl.scrollLeft / max, 0, 1) : 0;
  }
  const max = scrollEl.scrollHeight - scrollEl.clientHeight;
  return max > 0 ? clamp(scrollEl.scrollTop / max, 0, 1) : 0;
}

function applyRatio(ratio) {
  if (settings.pageMode === 'paged') {
    const max = pagedEl.scrollWidth - pagedEl.clientWidth;
    pagedEl.scrollLeft = ratio * max;
  } else {
    const max = scrollEl.scrollHeight - scrollEl.clientHeight;
    scrollEl.scrollTop = ratio * max;
  }
}

function applySettings() {
  root.dataset.bg = settings.readerBg || 'night';
  root.classList.toggle('paged', settings.pageMode === 'paged');
  root.classList.toggle('hide-ui', false);
  root.style.setProperty('--reader-size', `${settings.fontSize || 18}px`);
  root.style.setProperty('--reader-line', String(settings.lineHeight || 1.9));
  root.style.setProperty('--reader-font', FONT_MAP[settings.fontFamily] || FONT_MAP.serif);
}

function updateChrome() {
  if (!book) return;
  const total = book.chapters.length;
  const chapterTitle = store.getSettings().script === 'traditional'
    ? convertScript(book.chapters[chapter].title, 'traditional')
    : convertScript(book.chapters[chapter].title, 'simplified');
  chromeTop.innerHTML = `
    <button class="r-icon" data-r-act="back" aria-label="返回">${icon('back', 20)}</button>
    <div class="r-title">${esc(book.title)}<small>${esc(chapterTitle)}</small></div>
    <button class="r-icon text" data-r-act="script" aria-label="切换简繁">${settings.script === 'traditional' ? '繁' : '简'}</button>
    <button class="r-icon" data-r-act="toc" aria-label="目录">${icon('list', 20)}</button>
    <button class="r-icon" data-r-act="settings" aria-label="阅读设置">${icon('font', 20)}</button>
  `;
  chromeBottom.innerHTML = `
    <div class="r-progress-row">
      <span id="rPct">0%</span>
      <div class="r-progress-track"><span id="rBar" style="width:0%"></span></div>
      <span>${chapter + 1} / ${total}</span>
    </div>
    <div class="r-nav">
      <button data-r-act="prev-ch" ${chapter <= 0 ? 'disabled' : ''}>${icon('back', 15)} 上一章</button>
      <button data-r-act="settings">${icon('settings', 15)} 设置</button>
      <button data-r-act="next-ch" ${chapter >= total - 1 ? 'disabled' : ''}>下一章 ${icon('next', 15)}</button>
    </div>
  `;
  updateProgressUI();
}

function updateProgressUI() {
  if (!book) return;
  const pctEl = root.querySelector('#rPct');
  const barEl = root.querySelector('#rBar');
  if (!pctEl || !barEl) return;
  const ratio = currentRatio();
  const pct = Math.round(ratio * 100);
  pctEl.textContent = `${pct}%`;
  barEl.style.width = `${pct}%`;
}

function showLoading() {
  const skeleton = '<div class="r-loading">' +
    '<div class="line" style="width:40%"></div>' +
    '<div class="line" style="width:96%"></div>' +
    '<div class="line" style="width:88%"></div>' +
    '<div class="line" style="width:94%"></div>' +
    '<div class="line" style="width:70%"></div>' +
    '</div>';
  articleScroll.innerHTML = skeleton;
  articlePaged.innerHTML = skeleton;
  scrollEl.scrollTop = 0;
  pagedEl.scrollLeft = 0;
}

function chapterCommentsPreview(index) {
  const comments = store.getComments(book.id, index);
  if (!comments.length) {
    return `<div class="r-end-comments" data-r-act="comments">
      <div class="head"><span>本章讨论</span><span>来说第一句 ${icon('next', 12)}</span></div>
    </div>`;
  }
  const first = comments[0];
  return `<div class="r-end-comments" data-r-act="comments">
    <div class="head"><span>本章讨论 · ${comments.length}</span><span>查看全部 ${icon('next', 12)}</span></div>
    <div class="quote">${esc(first.name)}：${esc(first.text)}</div>
  </div>`;
}

function renderContent(paragraphs) {
  const script = settings.script;
  const rawTitle = book.chapters[chapter].title;
  const title = convertScript(rawTitle, script);
  const body = paragraphs
    .map((p) => `<p class="r-p">${esc(convertScript(p, script))}</p>`)
    .join('');
  const total = book.chapters.length;
  const isLast = chapter >= total - 1;
  const html = `
    <header class="r-chapter-head">
      <div class="r-chapter-no">第 ${chapter + 1} 章 / 共 ${total} 章</div>
      <h2 class="r-chapter-title">${esc(title)}</h2>
    </header>
    ${body}
    <div class="r-end">
      <p class="r-end-note">— 本章完 —</p>
      <div class="r-end-actions">
        <button class="btn btn-soft" data-r-act="toc">目录</button>
        <button class="btn btn-primary" data-r-act="${isLast ? 'comments' : 'next-ch'}">${isLast ? '留下感想' : '下一章'}</button>
      </div>
      ${chapterCommentsPreview(chapter)}
    </div>
  `;
  articleScroll.innerHTML = html;
  articlePaged.innerHTML = html;
  scrollEl.scrollTop = 0;
  pagedEl.scrollLeft = 0;
}

function renderError(error) {
  const code = error && error.message ? error.message : '';
  const offline = code === 'OFFLINE_UNCACHED';
  const sourceDisabled = code === 'SOURCE_DISABLED';
  const sourceMissing = code === 'SOURCE_MISSING';
  const unsupported = code === 'UNSUPPORTED_JS' || code === 'UNSUPPORTED_XPATH';
  let title = '内容暂时加载不了。';
  let desc = '请检查网络后重试，或先缓存本书。';
  if (offline) {
    title = '这一章还没有缓存。';
    desc = '离线状态下只能阅读已缓存的章节。';
  } else if (sourceDisabled) {
    title = '这个书源已停用。';
    desc = '在书源管理里重新启用它，或先缓存本章。';
  } else if (sourceMissing) {
    title = '这个书源已被移除。';
    desc = '重新导入书源后可以继续阅读。';
  } else if (unsupported) {
    title = '这个书源的规则暂不支持。';
    desc = '当前版本支持 CSS 与 JSON 规则，暂不支持 JS 或 XPath。';
  }
  const html = `<div class="r-empty">
    <p>${title}</p>
    <p style="font-size:11px;opacity:.7">${desc}</p>
    <div class="r-end-actions" style="margin-top:18px">
      <button class="btn btn-soft" data-r-act="cache-now">缓存本章</button>
      <button class="btn btn-primary" data-r-act="retry">重试</button>
    </div>
  </div>`;
  articleScroll.innerHTML = html;
  articlePaged.innerHTML = html;
}

async function loadChapter(index, forceScrollTop = false) {
  if (!book) return;
  if (index < 0 || index >= book.chapters.length) return;
  if (index !== chapter || forceScrollTop) saveNow();
  const token = ++loadToken;
  chapter = index;
  updateChrome();
  showLoading();
  try {
    const paragraphs = await store.loadChapterText(book, index);
    if (token !== loadToken) return;
    renderContent(paragraphs);
    const saved = store.getProgress(book.id);
    const ratio = saved && saved.chapter === index && !forceScrollTop ? saved.ratio : 0;
    requestAnimationFrame(() => applyRatio(ratio));
  } catch (error) {
    if (token !== loadToken) return;
    renderError(error);
  }
}

function saveNow() {
  if (!book) return;
  lastRatio = currentRatio();
  store.setProgress(book.id, chapter, lastRatio);
}

function rerenderCurrent() {
  const token = ++loadToken;
  const ratio = currentRatio();
  showLoading();
  store.loadChapterText(book, chapter).then((paragraphs) => {
    if (token !== loadToken) return;
    renderContent(paragraphs);
    requestAnimationFrame(() => applyRatio(ratio));
  }).catch(() => {
    if (token === loadToken) renderError(new Error('NO_CONTENT'));
  });
}

function toggleScript() {
  const next = settings.script === 'traditional' ? 'simplified' : 'traditional';
  settings = store.updateSettings({ script: next });
  const ratio = currentRatio();
  updateChrome();
  const token = ++loadToken;
  store.loadChapterText(book, chapter).then((paragraphs) => {
    if (token !== loadToken) return;
    renderContent(paragraphs);
    requestAnimationFrame(() => applyRatio(ratio));
    if (panelOpen) openSettingsPanel();
  }).catch(() => {});
}

function openPanel(html) {
  panelOpen = true;
  root.classList.remove('hide-ui');
  panelLayer.innerHTML = `<div class="r-backdrop" data-r-act="close-panel"></div><div class="r-panel">${html}</div>`;
}

function closePanel() {
  panelOpen = false;
  panelLayer.innerHTML = '';
}

function openToc() {
  const cached = store.getState().cacheIndex[book.id] || [];
  const rows = book.chapters.map((ch, i) => {
    const isCached = book.local || cached.includes(i);
    return `<div class="r-toc-item ${i === chapter ? 'current' : ''}" data-r-act="toc-go" data-index="${i}">
      <span class="idx">${String(i + 1).padStart(2, '0')}</span>
      <span class="nm">${esc(convertScript(ch.title, settings.script))}</span>
      <span class="st">${isCached ? '已缓存' : ''}</span>
    </div>`;
  }).join('');
  openPanel(`<h3>目录</h3><div style="font-size:10.5px;opacity:.6;margin-bottom:6px">${esc(book.title)} · 共 ${book.chapters.length} 章</div>${rows}`);
}

function openSettingsPanel() {
  const fontOptions = [
    ['serif', '衬线'],
    ['sans', '黑体'],
    ['kai', '楷体']
  ].map(([v, label]) => `<button class="r-opt ${settings.fontFamily === v ? 'active' : ''}" data-r-act="set" data-key="fontFamily" data-value="${v}">${label}</button>`).join('');

  const lineOptions = [1.6, 1.8, 2.0, 2.2].map((v) => `<button class="r-opt ${Number(settings.lineHeight) === v ? 'active' : ''}" data-r-act="set" data-key="lineHeight" data-value="${v}">${v.toFixed(1)}</button>`).join('');

  const bgs = [
    ['night', '#14171c'],
    ['paper', '#f7f3ea'],
    ['parchment', '#efe4d1'],
    ['green', '#cbdcc8'],
    ['ink', '#0a0b0d']
  ].map(([v, color]) => `<button class="r-opt swatch ${settings.readerBg === v ? 'active' : ''}" style="background:${color}" data-r-act="set" data-key="readerBg" data-value="${v}" aria-label="${v}"></button>`).join('');

  openPanel(`
    <h3>阅读设置</h3>
    <div class="r-setting">
      <span>字号</span>
      <div class="option-row">
        <button class="r-opt" data-r-act="set" data-key="fontSize" data-value="-1">A-</button>
        <button class="r-opt" style="min-width:44px">${settings.fontSize}</button>
        <button class="r-opt" data-r-act="set" data-key="fontSize" data-value="1">A+</button>
      </div>
    </div>
    <div class="r-setting"><span>行距</span><div class="option-row">${lineOptions}</div></div>
    <div class="r-setting"><span>字体</span><div class="option-row">${fontOptions}</div></div>
    <div class="r-setting"><span>背景</span><div class="option-row">${bgs}</div></div>
    <div class="r-setting">
      <span>翻页</span>
      <div class="option-row">
        <button class="r-opt ${settings.pageMode === 'scroll' ? 'active' : ''}" data-r-act="set" data-key="pageMode" data-value="scroll">上下滚动</button>
        <button class="r-opt ${settings.pageMode === 'paged' ? 'active' : ''}" data-r-act="set" data-key="pageMode" data-value="paged">左右翻页</button>
      </div>
    </div>
    <div class="r-setting">
      <span>简繁</span>
      <div class="option-row">
        <button class="r-opt ${settings.script === 'simplified' ? 'active' : ''}" data-r-act="set" data-key="script" data-value="simplified">简体</button>
        <button class="r-opt ${settings.script === 'traditional' ? 'active' : ''}" data-r-act="set" data-key="script" data-value="traditional">繁體</button>
      </div>
    </div>
  `);
}

function openCommentsPanel() {
  const comments = store.getComments(book.id, chapter);
  const rows = comments.map((c) => `<div class="r-comment">
    <div class="r-comment-head">
      <span class="r-comment-name">${esc(c.name)}</span>
      <span class="r-comment-time">${esc(c.time)}</span>
    </div>
    <div class="r-comment-text">${esc(convertScript(c.text, settings.script))}</div>
    <button class="r-comment-like ${c.liked ? 'liked' : ''}" data-r-act="like" data-id="${c.id}">${icon('heart', 13)} ${c.count}</button>
  </div>`).join('');
  openPanel(`
    <h3>本章讨论</h3>
    <div class="sheet-sub">${esc(book.chapters[chapter].title)} · 以 ${esc(store.getNickname())} 的身份留言</div>
    <div class="comment-input" style="padding-bottom:14px">
      <textarea id="rCommentBox" maxlength="240" placeholder="说说这一章让你停下来的地方"></textarea>
      <button class="comment-send" data-r-act="send-comment">发送</button>
    </div>
    ${rows || '<div class="r-empty">还没有人说话。</div>'}
  `);
}

function sendComment() {
  const box = panelLayer.querySelector('#rCommentBox');
  if (!box) return;
  const text = box.value.trim();
  if (!text) return;
  store.addComment(book.id, chapter, text, store.getNickname());
  openCommentsPanel();
  refreshEndComments();
}

function refreshEndComments() {
  const holder = articleScroll.querySelector('.r-end');
  if (!holder) return;
  const old = holder.querySelector('.r-end-comments');
  if (!old) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = chapterCommentsPreview(chapter);
  holder.replaceChild(wrapper.firstElementChild, old);
  const holderB = articlePaged.querySelector('.r-end');
  if (holderB) {
    const oldB = holderB.querySelector('.r-end-comments');
    if (oldB) {
      const wrapperB = document.createElement('div');
      wrapperB.innerHTML = chapterCommentsPreview(chapter);
      holderB.replaceChild(wrapperB.firstElementChild, oldB);
    }
  }
}

function applyOption(key, value) {
  const ratio = currentRatio();
  if (key === 'fontSize') {
    const next = clamp(Number(settings.fontSize) + Number(value), 15, 28);
    settings = store.updateSettings({ fontSize: next });
    applySettings();
    requestAnimationFrame(() => applyRatio(ratio));
  } else if (key === 'lineHeight') {
    settings = store.updateSettings({ lineHeight: Number(value) });
    applySettings();
    requestAnimationFrame(() => applyRatio(ratio));
  } else if (key === 'pageMode') {
    settings = store.updateSettings({ pageMode: value });
    applySettings();
    requestAnimationFrame(() => applyRatio(ratio));
  } else if (key === 'script') {
    settings = store.updateSettings({ script: value });
    updateChrome();
    rerenderCurrent();
    closePanel();
    return;
  } else {
    settings = store.updateSettings({ [key]: value });
    applySettings();
  }
  openSettingsPanel();
}

function toggleUI() {
  if (panelOpen) return;
  root.classList.toggle('hide-ui');
  window.clearTimeout(hideTimer);
  if (!root.classList.contains('hide-ui')) {
    hideTimer = window.setTimeout(() => {
      if (isOpen && !panelOpen) root.classList.add('hide-ui');
    }, 6000);
  }
}

async function cacheCurrentChapter() {
  try {
    await store.cacheSingleChapter(book, chapter);
    toast('本章已缓存到本机');
    loadChapter(chapter, true);
  } catch (e) {
    toast('缓存失败，请检查网络');
  }
}

let toastTimer = 0;
function toast(message) {
  let el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
}

export function openReader(bookId, index = 0) {
  const target = store.findBook(bookId);
  if (!target) return;
  build();
  book = target;
  settings = store.getSettings();
  savedAppScroll = document.getElementById('view').scrollTop;
  appEl.style.display = 'none';
  root.hidden = false;
  isOpen = true;
  applySettings();
  history.pushState({ reader: true }, '');
  loadChapter(clamp(index, 0, book.chapters.length - 1));
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (isOpen && !panelOpen) root.classList.add('hide-ui');
  }, 4200);
}

export function closeReader() {
  if (!isOpen) return;
  saveNow();
  isOpen = false;
  panelOpen = false;
  panelLayer.innerHTML = '';
  root.hidden = true;
  appEl.style.display = 'flex';
  document.getElementById('view').scrollTop = savedAppScroll;
  window.clearTimeout(hideTimer);
  if (history.state && history.state.reader) history.back();
  window.dispatchEvent(new CustomEvent('paperlantern:reader-close'));
}

export function isReaderOpen() {
  return isOpen;
}

export function readerBack() {
  if (panelOpen) {
    closePanel();
    return true;
  }
  if (isOpen) {
    closeReader();
    return true;
  }
  return false;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && isOpen) saveNow();
});

window.addEventListener('pagehide', () => {
  if (isOpen) saveNow();
});