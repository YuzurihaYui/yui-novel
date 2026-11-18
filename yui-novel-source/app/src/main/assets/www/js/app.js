import * as store from './store.js';
import { BOOKS, CATEGORIES, HOT_SEARCH } from './data.js';
import {
  icon, esc, fmtNum, fmtWords, fmtHeat, initials, avatarTone, clamp
} from './utils.js';
import { openReader, isReaderOpen, readerBack } from './reader.js';
import { convertScript } from './convert.js';
import { readTextFile, parseTxt, parseEpub } from './epub.js';
import { parseImportPayload, searchSource, fetchDetail, fetchToc } from './source.js';

const view = document.getElementById('view');
const topbarEl = document.getElementById('topbar');
const tabbarEl = document.getElementById('tabbar');
const sheetLayer = document.getElementById('sheet-layer');
const appEl = document.getElementById('app');

const TABS = [
  { key: 'home', href: '#/home', label: '发现', icon: 'home' },
  { key: 'rank', href: '#/rank', label: '榜单', icon: 'rank' },
  { key: 'category', href: '#/category', label: '分类', icon: 'grid' },
  { key: 'shelf', href: '#/shelf', label: '书架', icon: 'shelf' }
];

const scrollMemory = {};
let lastKey = '';
let sheetMode = '';
const exploreState = { keyword: '', started: false, loading: false, groups: [] };
let pendingRemote = null;

function tx(text) {
  return convertScript(text, store.getSettings().script);
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/home';
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart || '');
  return { segments, query, name: segments[0] || 'home' };
}

function routeKey(route) {
  const name = route.name;
  if (name === 'book') return `book:${route.segments[1] || ''}`;
  if (name === 'me') return 'me';
  if (name === 'sources') return 'sources';
  if (name === 'explore') return `explore:${route.query.get('q') || ''}`;
  if (name === 'category') return `category:${route.query.get('cat') || ''}`;
  if (name === 'rank') return `rank:${route.query.get('type') || 'hot'}`;
  return name;
}

function coverHTML(book, opts = {}) {
  if (!book) return '';
  const badge = opts.badge ? `<span class="cover-badge">${esc(opts.badge)}</span>` : '';
  const titleCls = opts.large ? 'cover-title lg' : 'cover-title';
  const photo = book.coverUrl
    ? `<img class="cover-photo-img" src="${esc(book.coverUrl)}" alt="" loading="lazy" onerror="this.remove()" />`
    : '';
  return `<div class="cover ${opts.className || ''} ${photo ? 'has-photo' : ''}" data-pattern="${book.pattern || 'grid'}" style="--c1:${book.palette[0]};--c2:${book.palette[1]}">
    ${photo}
    <span class="cover-spine"></span>
    ${badge}
    <span class="${titleCls}">${esc(tx(book.title))}</span>
    <span class="cover-author">${esc(tx(book.author))}</span>
  </div>`;
}

function rankRow(book, index, metric) {
  const trend = book.trend || 0;
  const trendHTML = trend > 0
    ? `<div class="rank-trend up">${icon('arrowUp', 9)} ${trend}</div>`
    : trend < 0
      ? `<div class="rank-trend down">${icon('arrowDown', 9)} ${Math.abs(trend)}</div>`
      : '<div class="rank-trend">持平</div>';
  let metricMain = fmtHeat(book.heat);
  let metricSub = trendHTML;
  if (metric === 'new') {
    metricMain = book.updated;
    metricSub = '<div class="rank-trend">新章</div>';
  }
  if (metric === 'finished') {
    metricMain = book.rating.toFixed(1);
    metricSub = '<div class="rank-trend">完结</div>';
  }
  if (metric === 'rating') {
    metricMain = book.rating.toFixed(1);
    metricSub = '<div class="rank-trend">评分</div>';
  }
  return `<div class="rank-row" data-act="open" data-id="${book.id}">
    <div class="rank-no">${index + 1}</div>
    ${coverHTML(book, { className: 'rank-cover' })}
    <div class="rank-main">
      <div class="rank-title">${esc(tx(book.title))}</div>
      <div class="rank-sub"><span>${esc(tx(book.author))}</span><span>·</span><span>${esc(book.tags.join(' / '))}</span></div>
    </div>
    <div class="rank-heat">
      <strong>${esc(metricMain)}</strong>
      ${metricSub}
    </div>
  </div>`;
}

function heroHTML() {
  const last = store.lastRead();
  if (last) {
    const { book, progress } = last;
    const pct = Math.round(((progress.chapter + progress.ratio) / book.chapters.length) * 100);
    const chapterTitle = book.chapters[progress.chapter] ? book.chapters[progress.chapter].title : '';
    return `<div class="hero">
      <div class="hero-cover">${coverHTML(book)}</div>
      <div class="hero-body">
        <div class="hero-eyebrow">${icon('book', 12)} 继续阅读</div>
        <div class="hero-title">${esc(tx(book.title))}</div>
        <div class="hero-meta"><span>${esc(tx(chapterTitle))}</span><span class="dot"></span><span>${book.chapters.length} 章</span></div>
        <div class="hero-spacer"></div>
        <div class="hero-progress-row"><span>已读 ${pct}%</span><strong>${pct}%</strong></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <button class="btn btn-primary" style="margin-top:12px" data-act="read" data-id="${book.id}" data-ch="${progress.chapter}">接着往下读</button>
      </div>
    </div>`;
  }
  const pick = store.findBook('b3') || BOOKS[0];
  return `<div class="hero">
    <div class="hero-cover">${coverHTML(pick)}</div>
    <div class="hero-body">
      <div class="hero-eyebrow">${icon('sparkle', 12)} 编辑赠阅</div>
      <div class="hero-title">${esc(tx(pick.title))}</div>
      <div class="hero-meta"><span>${esc(tx(pick.author))}</span><span class="dot"></span><span>${fmtWords(pick.words)}</span></div>
      <div class="hero-spacer"></div>
      <div class="hero-progress-row"><span>${esc(tx(pick.tags.join(' · ')))}</span><strong>${pick.rating.toFixed(1)}</strong></div>
      <div class="progress-track"><div class="progress-fill" style="width:${Math.round(pick.rating * 10)}%"></div></div>
      <button class="btn btn-primary" style="margin-top:12px" data-act="read" data-id="${pick.id}" data-ch="0">从这一本开始</button>
    </div>
  </div>`;
}

function featureHTML() {
  const main = store.findBook('b5') || BOOKS[0];
  const sideA = store.findBook('b9') || BOOKS[1];
  const sideB = store.findBook('b7') || BOOKS[2];
  return `<div class="feature">
    <button class="feature-main" data-act="open" data-id="${main.id}">
      <div class="feature-bg" style="--c1:${main.palette[0]};--c2:${main.palette[1]}"></div>
      <div class="feature-content">
        <div class="feature-tag">编辑推荐 · ${main.status === 'finished' ? '已完结' : '连载中'}</div>
        <div class="feature-title">${esc(tx(main.title))}</div>
        <div class="feature-desc">${esc(tx(main.desc))}</div>
      </div>
    </button>
    <button class="feature-side" data-act="open" data-id="${sideA.id}">
      ${coverHTML(sideA)}
      <div class="feature-side-body">
        <div class="feature-side-title">${esc(tx(sideA.title))}</div>
        <div class="feature-side-sub">${esc(tx(sideA.tags[0]))} · 评分 ${sideA.rating.toFixed(1)}</div>
      </div>
    </button>
    <button class="feature-side" data-act="open" data-id="${sideB.id}">
      ${coverHTML(sideB)}
      <div class="feature-side-body">
        <div class="feature-side-title">${esc(tx(sideB.title))}</div>
        <div class="feature-side-sub">${esc(tx(sideB.tags[0]))} · 今日更新</div>
      </div>
    </button>
  </div>`;
}

function homePage() {
  const newest = BOOKS.slice(0, 6);
  const top = [...BOOKS].sort((a, b) => b.heat - a.heat).slice(0, 5);
  return `<div class="page">
    <section class="section" style="--i:0; margin-top:4px">${heroHTML()}</section>
    <section class="section" style="--i:1">
      <div class="section-head">
        <h2 class="section-title">本周新上</h2>
        <button class="section-more" data-act="nav" data-href="#/rank?type=new">查看全部 ${icon('next', 11)}</button>
      </div>
      <div class="rail">
        ${newest.map((b) => `<button class="rail-item" data-act="open" data-id="${b.id}">
          ${coverHTML(b)}
          <div class="rail-title">${esc(tx(b.title))}</div>
          <div class="rail-sub">${esc(tx(b.author))}</div>
        </button>`).join('')}
      </div>
    </section>
    <section class="section" style="--i:2">
      <div class="section-head">
        <h2 class="section-title">编辑精选</h2>
        <span class="section-more">本周 8 本入池</span>
      </div>
      ${featureHTML()}
    </section>
    <section class="section" style="--i:3">
      <div class="section-head">
        <h2 class="section-title">热度榜</h2>
        <button class="section-more" data-act="nav" data-href="#/rank?type=hot">完整榜单 ${icon('next', 11)}</button>
      </div>
      <div class="rank-list">
        ${top.map((b, i) => rankRow(b, i, 'hot')).join('')}
      </div>
    </section>
    <section class="section" style="--i:4">
      <div class="section-head">
        <h2 class="section-title">按口味找书</h2>
      </div>
      <div class="chips">
        ${CATEGORIES.slice(0, 7).map((c) => `<button class="chip" data-act="nav" data-href="#/category?cat=${encodeURIComponent(c.name)}">${c.name}</button>`).join('')}
      </div>
    </section>
    <div style="padding:34px 0 10px;text-align:center;color:var(--text-3);font-size:10px;letter-spacing:.16em">yuiの轻小说 · 深夜也有灯亮着</div>
  </div>`;
}

function rankPage(route) {
  const type = route.query.get('type') || 'hot';
  let list = [...BOOKS];
  if (type === 'finished') list = list.filter((b) => b.status === 'finished').sort((a, b) => b.rating - a.rating);
  else if (type === 'new') list = list.sort((a, b) => {
    const weight = (b.updated.includes('今天') ? 2 : b.updated.includes('昨天') ? 1 : 0) - (a.updated.includes('今天') ? 2 : a.updated.includes('昨天') ? 1 : 0);
    return weight !== 0 ? weight : b.heat - a.heat;
  });
  else list = list.sort((a, b) => b.heat - a.heat);

  const descriptions = {
    hot: '按近 24 小时阅读热度排位，每小时更新一次。',
    new: '新上架与刚刚更新的作品，优先看新章。',
    finished: '已经可以一口气读到结尾的作品。'
  };

  return `<div class="page">
    <div class="page-head" style="--i:0">
      <div class="page-kicker">RANKING</div>
      <h1 class="page-title">排行榜</h1>
      <p class="page-desc">${descriptions[type] || descriptions.hot}</p>
    </div>
    <div style="--i:1">
      <div class="seg">
        <button class="${type === 'hot' ? 'active' : ''}" data-act="nav" data-href="#/rank?type=hot">热度</button>
        <button class="${type === 'new' ? 'active' : ''}" data-act="nav" data-href="#/rank?type=new">新书</button>
        <button class="${type === 'finished' ? 'active' : ''}" data-act="nav" data-href="#/rank?type=finished">完结</button>
      </div>
    </div>
    <div class="section" style="--i:2">
      <div class="rank-list">
        ${list.map((b, i) => rankRow(b, i, type)).join('')}
      </div>
    </div>
  </div>`;
}

function categoryPage(route) {
  const cat = route.query.get('cat') || '';
  const search = route.query.get('q') || '';
  let list = [...BOOKS];
  if (cat) list = list.filter((b) => b.tags.includes(cat));
  if (search) {
    const term = search.toLowerCase();
    list = list.filter((b) => (b.title + b.author + b.tags.join('') + b.desc).toLowerCase().includes(term));
  }
  list = list.sort((a, b) => b.rating - a.rating);

  const head = `<div class="page-head" style="--i:0">
    <div class="page-kicker">CATEGORY</div>
    <h1 class="page-title">${cat ? esc(cat) : '分类书库'}</h1>
    <p class="page-desc">${cat ? `共 ${list.length} 本 ${esc(cat)} 作品在架，按评分排序。` : '异世界、校园、奇幻、恋爱，总有一个世界在等你推开。'}</p>
  </div>
  <button class="search-bar" style="--i:1;width:100%;text-align:left" data-act="search">
    ${icon('search', 16)}
    <span style="flex:1">搜索书名、作者或标签</span>
    <span style="font-size:10px;color:var(--text-3)">${list.length} 本</span>
  </button>`;

  if (!cat) {
    return `<div class="page">
      ${head}
      <div class="section" style="--i:2">
        <div class="section-head"><h2 class="section-title">全部题材</h2></div>
        <div class="cat-grid">
          ${CATEGORIES.map((c, i) => `<button class="cat-card" data-act="nav" data-href="#/category?cat=${encodeURIComponent(c.name)}" style="--i:${i + 2}">
            <div class="cat-name">${esc(c.name)}</div>
            <div class="cat-hint">${esc(c.hint)}</div>
            <div class="cat-count">${fmtNum(c.count)} 本</div>
          </button>`).join('')}
        </div>
      </div>
    </div>`;
  }

  return `<div class="page">
    ${head}
    <div class="section" style="--i:2">
      <div class="chips" style="margin-bottom:14px">
        <button class="chip ${!cat ? 'active' : ''}" data-act="nav" data-href="#/category">全部</button>
        ${CATEGORIES.map((c) => `<button class="chip ${cat === c.name ? 'active' : ''}" data-act="nav" data-href="#/category?cat=${encodeURIComponent(c.name)}">${c.name}</button>`).join('')}
      </div>
      ${list.length ? `<div class="rank-list">${list.map((b, i) => rankRow(b, i, 'rating')).join('')}</div>` : `<div class="empty"><div class="empty-icon">${icon('search', 24)}</div><div class="empty-title">这一类还没有书</div><div class="empty-desc">换个题材看看，或者用搜索找找。</div></div>`}
    </div>
  </div>`;
}

function shelfPage() {
  const shelf = store.getShelf();
  const state = store.getState();
  const recent = state.recent.map((id) => store.findBook(id)).filter(Boolean).slice(0, 8);
  const localBooks = shelf.filter((b) => b.local);
  const cached = Object.keys(state.cacheIndex).filter((id) => (state.cacheIndex[id] || []).length > 0).length;

  return `<div class="page">
    <div class="page-head" style="--i:0">
      <div class="page-kicker">MY LIBRARY</div>
      <h1 class="page-title">我的书架</h1>
      <p class="page-desc">${shelf.length ? `在追 ${shelf.length} 本，${cached} 本已有离线内容。` : '收藏一本书，它就会一直在这里等你。'}</p>
    </div>

    ${recent.length ? `<section class="section" style="--i:1">
      <div class="section-head"><h2 class="section-title">继续阅读</h2><span class="section-more">${recent.length} 本</span></div>
      <div class="rail">
        ${recent.map((b) => {
          const p = store.getProgress(b.id);
          const pct = p ? Math.round(((p.chapter + p.ratio) / b.chapters.length) * 100) : 0;
          return `<button class="rail-item" data-act="read" data-id="${b.id}" data-ch="${p ? p.chapter : 0}">
            ${coverHTML(b)}
            <div class="rail-title">${esc(tx(b.title))}</div>
            <div class="rail-sub">已读 ${pct}%</div>
            <div class="progress-track" style="margin-top:6px"><div class="progress-fill" style="width:${pct}%"></div></div>
          </button>`;
        }).join('')}
      </div>
    </section>` : ''}

    <section class="section" style="--i:2">
      <div class="section-head"><h2 class="section-title">收藏</h2><span class="section-more">${shelf.length} 本</span></div>
      ${shelf.length ? `<div class="grid-3">
        ${shelf.map((b) => {
          const cachedAll = store.isBookCached(b);
          return `<button class="book-cell" data-act="open" data-id="${b.id}">
            ${coverHTML(b, { badge: cachedAll ? '离线' : '' })}
            <div class="book-cell-title">${esc(tx(b.title))}</div>
            <div class="book-cell-sub">${b.local ? '本地导入' : esc(tx(b.author))}</div>
          </button>`;
        }).join('')}
      </div>` : `<div class="empty">
        <div class="empty-icon">${icon('shelf', 24)}</div>
        <div class="empty-title">书架还是空的</div>
        <div class="empty-desc">去发现页挑一本，或者导入自己的电子书。</div>
        <button class="btn btn-soft" style="margin-top:14px" data-act="nav" data-href="#/home">去逛逛</button>
      </div>`}
    </section>

    <section class="section" style="--i:3">
      <div class="section-head"><h2 class="section-title">本地导入</h2><span class="section-more">${localBooks.length} 本</span></div>
      <div class="list-card">
        <button class="list-row" data-act="import">
          <span class="icon-btn" style="width:34px;height:34px;border-radius:10px">${icon('upload', 17)}</span>
          <div class="list-main">
            <div class="list-title">导入电子书</div>
            <div class="list-sub">支持 TXT 与 EPUB，正文保存在设备内</div>
          </div>
          ${icon('next', 15)}
        </button>
        ${localBooks.map((b) => `<button class="list-row" data-act="open" data-id="${b.id}">
          <span class="icon-btn" style="width:34px;height:34px;border-radius:10px">${icon('file', 17)}</span>
          <div class="list-main">
            <div class="list-title">${esc(tx(b.title))}</div>
            <div class="list-sub">${esc(b.format ? b.format.toUpperCase() : 'TXT')} · ${b.chapters.length} 章 · ${fmtWords(b.words)}</div>
          </div>
          ${icon('next', 15)}
        </button>`).join('')}
      </div>
    </section>

    <section class="section" style="--i:4">
      <div class="stat-grid">
        <div class="stat"><b>${shelf.length}</b><span>在追作品</span></div>
        <div class="stat"><b>${cached}</b><span>已缓存</span></div>
        <div class="stat"><b>${localBooks.length}</b><span>本地书籍</span></div>
      </div>
    </section>
  </div>`;
}

function commentListHTML(bookId, chapterIndex) {
  const comments = store.getComments(bookId, chapterIndex);
  if (!comments.length) {
    return `<div class="empty" style="padding:26px 0"><div class="empty-title">还没有书评</div><div class="empty-desc">说说你为什么想读这本书。</div></div>`;
  }
  return comments.map((c) => `<div class="review">
    <div class="review-head">
      <span class="avatar ${avatarTone(c.name)}">${esc(initials(c.name))}</span>
      <span class="review-name">${esc(c.name)}${c.official ? '<span class="badge accent">编辑</span>' : ''}</span>
      <span class="review-time">${esc(c.time)}</span>
    </div>
    <div class="review-text">${esc(tx(c.text))}</div>
    <div class="review-actions">
      <button class="${c.liked ? 'liked' : ''}" data-act="like" data-id="${c.id}">${icon('heart', 13)} ${c.count}</button>
      <span>${icon('message', 13)} 回复</span>
    </div>
  </div>`).join('');
}

function detailPage(route) {
  const book = store.findBook(route.segments[1]);
  if (!book) {
    return `<div class="page"><div class="empty"><div class="empty-icon">${icon('book', 24)}</div><div class="empty-title">这本书不在了</div><div class="empty-desc">可能已被移除，回到书架看看吧。</div></div></div>`;
  }
  const onShelf = store.isOnShelf(book.id);
  const progress = store.getProgress(book.id);
  const cachedAll = store.isBookCached(book);
  const cacheCount = book.local ? book.chapters.length : store.cachedCount(book.id);
  const state = store.getState();
  const readChapters = progress ? progress.chapter : -1;
  const comments = store.getComments(book.id, -1);
  const related = BOOKS.filter((b) => b.id !== book.id && b.tags.some((t) => book.tags.includes(t))).slice(0, 3);
  const isRemote = !!book.remote;

  const toc = book.chapters.map((ch, i) => {
    const isCached = book.local || (state.cacheIndex[book.id] || []).includes(i);
    return `<button class="toc-row ${i === readChapters ? 'current' : ''}" data-act="read" data-id="${book.id}" data-ch="${i}">
      <span class="toc-index">${String(i + 1).padStart(2, '0')}</span>
      <span class="toc-title">${esc(tx(ch.title))}</span>
      <span class="toc-state ${isCached ? 'cached' : ''}">${isCached ? '已缓存' : ''}</span>
    </button>`;
  }).join('');

  return `<div class="page">
    <div class="detail-hero" style="--i:0">
      <div class="detail-cover-wrap">${coverHTML(book, { large: true })}</div>
      <div class="detail-info">
        <div class="detail-title">${esc(tx(book.title))}</div>
        <div class="detail-author">${esc(tx(book.author))}${isRemote ? `<span class="detail-source">来自 ${esc(book.sourceName || '在线书源')}</span>` : ''}</div>
        <div class="tags" style="margin-top:9px">
          ${book.tags.map((t) => `<span class="badge">${esc(t)}</span>`).join('')}
          <span class="badge ${book.status === 'finished' ? 'jade' : book.local ? 'gold' : 'accent'}">${book.status === 'finished' ? '已完结' : book.local ? '本地' : isRemote ? '书源' : '连载中'}</span>
        </div>
        <div class="detail-stats">
          <div><b>${book.local || isRemote ? '—' : book.rating.toFixed(1)}</b>评分</div>
          <div><b>${book.local || isRemote ? book.chapters.length : Math.round(book.words / 1000) + 'k'}</b>${book.local || isRemote ? '章节' : '字数'}</div>
          <div><b>${book.local ? '本地' : isRemote ? '在线' : book.reads}</b>阅读</div>
        </div>
      </div>
    </div>

    <div class="detail-actions" style="--i:1">
      <button class="btn btn-primary" data-act="read" data-id="${book.id}" data-ch="${progress ? progress.chapter : 0}">${progress ? '继续阅读' : '开始阅读'}</button>
      <button class="btn btn-soft" data-act="shelf-toggle" data-id="${book.id}">${icon(onShelf ? 'check' : 'plus', 15)} ${onShelf ? '已在书架' : '加入书架'}</button>
    </div>

    <div class="detail-actions" style="margin-top:9px;--i:2">
      ${book.local
        ? `<button class="btn btn-ghost btn-block" data-act="remove-local" data-id="${book.id}">${icon('trash', 14)} 从设备移除</button>`
        : `<button class="btn btn-ghost btn-block" data-act="cache" data-id="${book.id}" ${cachedAll ? 'disabled' : ''}>${icon(cachedAll ? 'check' : 'download', 15)} ${cachedAll ? `已缓存全部 ${book.chapters.length} 章` : `缓存全书（已缓存 ${cacheCount}/${book.chapters.length}）`}</button>`}
    </div>

    ${isRemote ? `<div class="detail-actions" style="margin-top:9px;--i:2">
      <button class="btn btn-ghost btn-block" data-act="remove-local" data-id="${book.id}">${icon('trash', 14)} 从书架移除</button>
    </div>` : ''}

    <div class="section" style="--i:3">
      <div class="section-head"><h2 class="section-title">简介</h2></div>
      <div class="desc-block" style="border-top:0;padding-top:0">
        <p class="desc-text clamp">${esc(tx(book.desc))}</p>
        <button class="desc-toggle" data-act="expand-desc">展开全文</button>
      </div>
    </div>

    <div class="section" style="--i:4">
      <div class="section-head"><h2 class="section-title">目录</h2><span class="section-more">共 ${book.chapters.length} 章</span></div>
      <div>${toc}</div>
    </div>

    <div class="section" style="--i:5">
      <div class="section-head"><h2 class="section-title">书评</h2><span class="section-more">${comments.length} 条</span></div>
      <div class="comment-input">
        <textarea id="bookCommentBox" maxlength="240" placeholder="以 ${esc(store.getNickname())} 的身份写一句"></textarea>
        <button class="comment-send" data-act="post-book-comment" data-id="${book.id}">发布</button>
      </div>
      ${commentListHTML(book.id, -1)}
    </div>

    ${related.length ? `<div class="section" style="--i:6">
      <div class="section-head"><h2 class="section-title">你可能也会喜欢</h2></div>
      <div class="grid-3">
        ${related.map((b) => `<button class="book-cell" data-act="open" data-id="${b.id}">
          ${coverHTML(b)}
          <div class="book-cell-title">${esc(tx(b.title))}</div>
          <div class="book-cell-sub">${b.rating.toFixed(1)} 分</div>
        </button>`).join('')}
      </div>
    </div>` : ''}
  </div>`;
}

function mePage() {
  const state = store.getState();
  const shelf = store.getShelf();
  const cached = Object.keys(state.cacheIndex).filter((id) => (state.cacheIndex[id] || []).length > 0).length;
  const settings = store.getSettings();
  const enabledSources = state.sources.filter((s) => s.enabled).length;
  const localCount = state.imported.filter((b) => b.local).length;
  return `<div class="page">
    <div class="profile" style="--i:0">
      <div class="profile-avatar">${icon('user', 24)}</div>
      <div>
        <div class="profile-name">${esc(store.getNickname())}</div>
        <div class="profile-sub">在这里读了 ${state.recent.length} 本 · ${settings.script === 'traditional' ? '繁體模式' : '简体模式'}</div>
      </div>
    </div>

    <div class="section" style="--i:1">
      <div class="stat-grid">
        <div class="stat"><b>${shelf.length}</b><span>在追</span></div>
        <div class="stat"><b>${cached}</b><span>离线缓存</span></div>
        <div class="stat"><b>${enabledSources}</b><span>启用书源</span></div>
      </div>
    </div>

    <div class="section" style="--i:2">
      <div class="section-head"><h2 class="section-title">阅读</h2></div>
      <div class="list-card">
        <button class="list-row" data-act="reader-settings">
          <span class="icon-btn" style="width:34px;height:34px;border-radius:10px">${icon('font', 17)}</span>
          <div class="list-main"><div class="list-title">阅读偏好</div><div class="list-sub">字号 ${settings.fontSize} · 行距 ${settings.lineHeight} · ${settings.pageMode === 'paged' ? '左右翻页' : '上下滚动'}</div></div>
          ${icon('next', 15)}
        </button>
        <button class="list-row" data-act="toggle-theme">
          <span class="icon-btn" style="width:34px;height:34px;border-radius:10px">${icon(settings.theme === 'light' ? 'sun' : 'moon', 17)}</span>
          <div class="list-main"><div class="list-title">界面主题</div><div class="list-sub">${settings.theme === 'light' ? '暖白纸页' : '深夜墨色'}</div></div>
          <span class="list-value">${settings.theme === 'light' ? '浅色' : '深色'}</span>
        </button>
        <button class="list-row" data-act="toggle-script">
          <span class="icon-btn" style="width:34px;height:34px;border-radius:10px">${icon('globe', 17)}</span>
          <div class="list-main"><div class="list-title">简繁显示</div><div class="list-sub">书名与正文的字体转换</div></div>
          <span class="list-value">${settings.script === 'traditional' ? '繁體' : '简体'}</span>
        </button>
      </div>
    </div>

    <div class="section" style="--i:3">
      <div class="section-head"><h2 class="section-title">在线书源</h2></div>
      <div class="list-card">
        <button class="list-row" data-act="nav" data-href="#/sources">
          <span class="icon-btn" style="width:34px;height:34px;border-radius:10px">${icon('globe', 17)}</span>
          <div class="list-main"><div class="list-title">书源管理</div><div class="list-sub">兼容「阅读」书源 JSON · 已启用 ${enabledSources} 个</div></div>
          <span class="list-value">${state.sources.length}</span>
        </button>
        <button class="list-row" data-act="nav" data-href="#/explore">
          <span class="icon-btn" style="width:34px;height:34px;border-radius:10px">${icon('search', 17)}</span>
          <div class="list-main"><div class="list-title">书源搜索</div><div class="list-sub">跨书源搜索书名、作者</div></div>
          ${icon('next', 15)}
        </button>
      </div>
    </div>

    <div class="section" style="--i:4">
      <div class="section-head"><h2 class="section-title">离线与存储</h2></div>
      <div class="list-card">
        <div class="list-row">
          <span class="icon-btn" style="width:34px;height:34px;border-radius:10px">${icon('wifi', 17)}</span>
          <div class="list-main"><div class="list-title">WiFi 下自动缓存</div><div class="list-sub">只在使用 WiFi 时下载章节</div></div>
          <button class="switch ${settings.wifiOnly ? 'on' : ''}" data-act="toggle-wifi"></button>
        </div>
        <div class="list-row">
          <span class="icon-btn" style="width:34px;height:34px;border-radius:10px">${icon('cloud', 17)}</span>
          <div class="list-main"><div class="list-title">离线模式演示</div><div class="list-sub">开启后模拟断网，只能读已缓存章节</div></div>
          <button class="switch ${settings.offlineDemo ? 'on' : ''}" data-act="toggle-offline"></button>
        </div>
        <button class="list-row" data-act="import">
          <span class="icon-btn" style="width:34px;height:34px;border-radius:10px">${icon('upload', 17)}</span>
          <div class="list-main"><div class="list-title">导入本地电子书</div><div class="list-sub">TXT / EPUB，已导入 ${localCount} 本</div></div>
          ${icon('next', 15)}
        </button>
        <button class="list-row" data-act="clear-cache">
          <span class="icon-btn" style="width:34px;height:34px;border-radius:10px">${icon('trash', 17)}</span>
          <div class="list-main"><div class="list-title">清除离线缓存</div><div class="list-sub">不会删除书架与本地导入的书</div></div>
          <span class="list-value">${cached} 本</span>
        </button>
      </div>
    </div>

    <div class="section" style="--i:5">
      <div class="section-head"><h2 class="section-title">关于</h2></div>
      <div class="list-card">
        <button class="list-row" data-act="about">
          <span class="icon-btn" style="width:34px;height:34px;border-radius:10px">${icon('info', 17)}</span>
          <div class="list-main"><div class="list-title">yuiの轻小说</div><div class="list-sub">一个安静的轻小说阅读器</div></div>
          <span class="list-value">v1.1.0</span>
        </button>
      </div>
    </div>
    <div style="padding:26px 0 10px;text-align:center;color:var(--text-3);font-size:9.5px;letter-spacing:.18em">NO ADS · OFFLINE FIRST · MADE FOR READERS</div>
  </div>`;
}

function renderTopbar(route) {
  const settings = store.getSettings();
  const searchBtn = `<button class="icon-btn" data-act="search" aria-label="搜索">${icon('search', 18)}</button>`;
  const scriptBtn = `<button class="pill ${settings.script === 'traditional' ? 'on' : ''}" data-act="toggle-script">${settings.script === 'traditional' ? '繁' : '简'}</button>`;
  const subTitles = { book: '书籍详情', me: '我的', sources: '书源管理', explore: '书源搜索' };

  if (subTitles[route.name]) {
    const action = route.name === 'sources'
      ? `<button class="icon-btn" data-act="source-paste" aria-label="粘贴书源">${icon('plus', 18)}</button>`
      : scriptBtn;
    topbarEl.innerHTML = `
      <button class="icon-btn" data-act="back" aria-label="返回">${icon('back', 18)}</button>
      <div class="brand" style="flex:1;justify-content:center">
        <span class="brand-name" style="font-size:14px;letter-spacing:.1em">${subTitles[route.name]}</span>
      </div>
      <div class="topbar-actions">${action}</div>
    `;
    return;
  }
  topbarEl.innerHTML = `
    <div class="brand">
      <span class="brand-mark">${icon('book', 17)}</span>
      <div>
        <div class="brand-name">yuiの轻小说</div>
        <div class="brand-sub">YUI NOVEL</div>
      </div>
    </div>
    <div class="topbar-actions">
      ${searchBtn}
      ${scriptBtn}
      <button class="icon-btn" data-act="nav" data-href="#/me" aria-label="我的">${icon('user', 18)}</button>
    </div>
  `;
}

function renderTabbar(route) {
  const visible = !['book', 'sources', 'explore'].includes(route.name);
  tabbarEl.hidden = !visible;
  view.classList.toggle('no-tabs', !visible);
  const active = ['book', 'me'].includes(route.name) ? '' : route.name;
  tabbarEl.innerHTML = TABS.map((tab) => `<button class="tab ${active === tab.key ? 'active' : ''}" data-act="nav" data-href="${tab.href}">
    ${icon(tab.icon, 20)}
    <span>${tab.label}</span>
  </button>`).join('');
}

function render() {
  const route = parseRoute();
  const key = routeKey(route);
  scrollMemory[lastKey] = view.scrollTop;
  lastKey = key;

  const settings = store.getSettings();
  document.documentElement.dataset.theme = settings.theme === 'light' ? 'light' : 'dark';

  let html = '';
  if (route.name === 'home') html = homePage();
  else if (route.name === 'rank') html = rankPage(route);
  else if (route.name === 'category') html = categoryPage(route);
  else if (route.name === 'shelf') html = shelfPage();
  else if (route.name === 'book') html = detailPage(route);
  else if (route.name === 'me') html = mePage();
  else if (route.name === 'sources') html = sourcesPage();
  else if (route.name === 'explore') html = explorePage(route);
  else html = homePage();

  renderTopbar(route);
  renderTabbar(route);
  view.innerHTML = html;
  requestAnimationFrame(() => {
    view.scrollTop = scrollMemory[key] || 0;
  });
  if (route.name === 'explore') {
    const keyword = route.query.get('q') || '';
    if (keyword && (!exploreState.started || exploreState.keyword !== keyword)) {
      exploreState.keyword = keyword;
      exploreState.started = true;
      exploreState.loading = true;
      exploreState.groups = [];
      window.setTimeout(() => startExplore(keyword), 0);
    }
  }
  closeSearchIfNeeded();
}

function navigate(href) {
  if (location.hash === href) {
    render();
  } else {
    location.hash = href;
  }
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toast._timer);
  toast._timer = window.setTimeout(() => el.classList.remove('show'), 2300);
}

function openSheet(html, mode) {
  sheetMode = mode || '';
  sheetLayer.innerHTML = `<div class="sheet">${html}</div>`;
  sheetLayer.hidden = false;
}

function closeSheet() {
  sheetLayer.hidden = true;
  sheetLayer.innerHTML = '';
  sheetMode = '';
}

function isSheetOpen() {
  return !sheetLayer.hidden;
}

function searchResultsHTML(term) {
  const q = term.trim().toLowerCase();
  const books = store.allBooks();
  const list = q
    ? books.filter((b) => (b.title + b.author + b.tags.join('') + b.desc).toLowerCase().includes(q))
    : books.slice(0, 5);
  if (!list.length) {
    return `<div class="empty"><div class="empty-icon">${icon('search', 24)}</div><div class="empty-title">没有找到「${esc(term)}」</div><div class="empty-desc">试试作者名，或换个更短的词。</div></div>`;
  }
  return `<div class="rank-list">${list.map((b, i) => rankRow(b, i, 'rating')).join('')}</div>`;
}

function openSearch(term = '') {
  const enabledSources = store.sourceMetas().filter((s) => s.enabled).length;
  openSheet(`
    <div class="sheet-handle"></div>
    <div class="sheet-title">搜索</div>
    <div class="sheet-sub">书名、作者、标签都可以</div>
    <div class="search-bar">
      ${icon('search', 16)}
      <input id="searchInput" value="${esc(term)}" placeholder="想读点什么？" autocomplete="off" />
      ${term ? `<button data-act="clear-search" style="color:var(--text-3)">${icon('close', 15)}</button>` : ''}
    </div>
    <div class="chips" style="margin:14px -20px 4px;padding:0 20px">
      ${HOT_SEARCH.map((w) => `<button class="chip" data-act="hot-word" data-word="${esc(w)}">${esc(w)}</button>`).join('')}
    </div>
    <div id="searchResults" style="margin-top:10px">${searchResultsHTML(term)}</div>
    ${enabledSources ? `<button class="btn btn-soft btn-block" style="margin-top:14px" data-act="explore-from-search">用 ${enabledSources} 个书源搜索「${esc(term || '轻小说')}」</button>` : ''}
  `, 'search');
  requestAnimationFrame(() => {
    const input = document.getElementById('searchInput');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
}

function updateSearchResults(term) {
  const box = document.getElementById('searchResults');
  if (box) box.innerHTML = searchResultsHTML(term);
}

function hashId(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h).toString(36);
}

function sourceHost(value) {
  const raw = String(value || '');
  if (!raw) return '本地';
  if (!/^https?:\/\//i.test(raw)) return raw;
  try {
    return new URL(raw).host;
  } catch (e) {
    return raw;
  }
}

function sourceErrorText(code) {
  const text = String(code || '');
  const httpMatch = /^HTTP_(\d+)$/.exec(text);
  if (httpMatch) return `网站返回 HTTP ${httpMatch[1]}`;
  const map = {
    INVALID_JSON: '不是有效的 JSON 文本',
    INVALID_SOURCE: '书源结构不正确',
    NO_NAME: '书源缺少 bookSourceName',
    NO_URL: '书源缺少 bookSourceUrl',
    NO_RULES: '书源没有可用的搜索 / 详情 / 目录 / 正文规则',
    NO_SOURCE: '没有找到可导入的书源',
    NO_SEARCH: '这个书源没有配置搜索规则',
    NO_SEARCH_URL: '这个书源没有 searchUrl',
    NO_CHAPTERS: '目录规则没有解析到章节',
    NO_CONTENT: '正文规则没有解析到内容',
    UNSUPPORTED_JS: '该规则使用了 JS，当前版本暂不支持',
    UNSUPPORTED_XPATH: '该规则使用了 XPath，当前版本暂不支持',
    EMPTY_RESPONSE: '书源返回了空页面',
    TIMEOUT: '请求超时',
    NETWORK_OR_CORS: '网络请求失败（浏览器预览受跨域限制，APK 内可正常请求）',
    NETWORK_ERROR: '网络请求失败',
    BRIDGE_ERROR: '原生网络桥接不可用',
    SOURCE_MISSING: '书源不存在，可能已被删除',
    SOURCE_DISABLED: '书源已停用',
    RESPONSE_TOO_LARGE: '响应内容过大',
    OFFLINE: '当前离线'
  };
  return map[text] || `加载失败：${text || '未知错误'}`;
}

function sourcesPage() {
  const sources = store.sourceMetas();
  const enabled = sources.filter((s) => s.enabled).length;
  return `<div class="page">
    <div class="page-head" style="--i:0">
      <div class="page-kicker">BOOK SOURCES</div>
      <h1 class="page-title">书源</h1>
      <p class="page-desc">兼容「阅读」App 的书源 JSON 规范，按 search / detail / toc / content 四个流程解析。规则支持 CSS 选择器与 JSON Path。</p>
    </div>
    <div class="detail-actions" style="--i:1">
      <button class="btn btn-primary" data-act="source-import-file">导入 JSON</button>
      <button class="btn btn-soft" data-act="source-paste">粘贴 JSON</button>
    </div>
    <div class="detail-actions" style="margin-top:9px;--i:2">
      <button class="btn btn-ghost btn-block" data-act="source-demo">导入内置示例书源</button>
    </div>
    <div class="source-summary" style="--i:3">
      <span>共 ${sources.length} 个书源</span>
      <span>${enabled} 个已启用</span>
    </div>
    ${sources.length
      ? sources.map((source, index) => sourceCardHTML(source, index)).join('')
      : `<div class="empty" style="--i:3">
          <div class="empty-icon">${icon('globe', 24)}</div>
          <div class="empty-title">还没有书源</div>
          <div class="empty-desc">先导入内置示例书源，或粘贴你已有的 Legado 书源 JSON。</div>
        </div>`}
    <div class="section" style="--i:5">
      <div class="section-head"><h2 class="section-title">支持范围</h2></div>
      <div class="list-card" style="padding:16px">
        <p class="desc-text" style="font-size:12px">支持：class. / id. / tag. / text. 选择器、@text / @html / @href / @src 后缀、@css: 与 @json: 前缀、## 正则替换。</p>
        <p class="desc-text" style="font-size:12px;margin-top:9px">暂不支持：JS 规则、XPath 规则、需要登录或加密的站点。遇到这类书源会给出明确提示。</p>
      </div>
    </div>
  </div>`;
}

function sourceCardHTML(source, index) {
  const labels = [['search', '搜索'], ['detail', '详情'], ['toc', '目录'], ['content', '正文']];
  return `<div class="source-card" style="--i:${Math.min(index + 3, 8)}">
    <div class="source-card-head">
      <div class="source-card-title">${esc(source.name)}</div>
      <button class="switch ${source.enabled ? 'on' : ''}" data-act="source-toggle" data-id="${source.id}" aria-label="启用书源"></button>
    </div>
    <div class="source-card-url">${esc(sourceHost(source.url))}</div>
    <div class="source-rules">
      ${labels.map(([key, label]) => `<span class="source-rule ${source.rules.includes(key) ? 'on' : ''}">${label}</span>`).join('')}
    </div>
    <div class="source-card-foot">
      <span>${esc(source.group || '未分组')} · ${source.enabled ? '已启用' : '已停用'}</span>
      <button class="source-remove" data-act="source-delete" data-id="${source.id}">移除</button>
    </div>
  </div>`;
}

function explorePage(route) {
  const keyword = route.query.get('q') || '';
  const enabled = store.sourceMetas().filter((s) => s.enabled);
  let body = '';
  if (!enabled.length) {
    body = `<div class="empty">
      <div class="empty-icon">${icon('globe', 24)}</div>
      <div class="empty-title">没有启用的书源</div>
      <div class="empty-desc">先去书源管理导入一个书源，再回来搜索。</div>
      <button class="btn btn-soft" style="margin-top:14px" data-act="nav" data-href="#/sources">去导入</button>
    </div>`;
  } else if (!keyword) {
    body = `<div class="source-hint">已启用 ${enabled.length} 个书源：${enabled.map((s) => esc(s.name)).join('、')}</div>`;
  } else if (exploreState.keyword === keyword && exploreState.groups.length) {
    body = exploreGroupsHTML();
  } else {
    body = `<div class="source-loading">${icon('search', 18)} 正在向 ${enabled.length} 个书源发起搜索…</div>`;
  }
  return `<div class="page">
    <div class="page-head" style="--i:0">
      <div class="page-kicker">CROSS SOURCE</div>
      <h1 class="page-title">书源搜索</h1>
      <p class="page-desc">把关键词同时发给所有启用的书源，结果按来源分组。</p>
    </div>
    <div class="search-bar" style="--i:1">
      ${icon('search', 16)}
      <input id="exploreInput" value="${esc(keyword)}" placeholder="输入书名或作者" autocomplete="off" />
      <button class="btn btn-sm btn-primary" data-act="explore-search">搜索</button>
    </div>
    <div id="exploreResults" style="margin-top:16px;--i:2">${body}</div>
  </div>`;
}

function exploreGroupsHTML() {
  if (!exploreState.groups.length) {
    return `<div class="source-hint">没有启用的书源可执行搜索。</div>`;
  }
  return exploreState.groups.map((group, gi) => {
    const status = group.status === 'loading'
      ? '搜索中'
      : group.status === 'error'
        ? '失败'
        : `${group.items.length} 本`;
    const results = group.items.length
      ? group.items.map((item, ii) => `<button class="source-result" data-act="remote-preview" data-gi="${gi}" data-ii="${ii}">
          <span class="source-result-cover">
            ${item.coverUrl
              ? `<img src="${esc(item.coverUrl)}" alt="" loading="lazy" onerror="this.remove()" />`
              : `<span class="source-result-fallback">${esc(String(item.name).slice(0, 1))}</span>`}
          </span>
          <span class="source-result-body">
            <span class="source-result-title">${esc(tx(item.name))}</span>
            <span class="source-result-sub">${esc(tx(item.author || '佚名'))}${item.kind ? ` · ${esc(tx(item.kind))}` : ''}</span>
            <span class="source-result-intro">${esc(tx(item.intro || '暂无简介'))}</span>
          </span>
          ${icon('next', 14)}
        </button>`).join('')
      : (group.status === 'done' ? `<div class="source-empty">这个书源没有找到匹配结果</div>` : '');
    return `<div class="source-group">
      <div class="source-group-head">
        <span class="source-group-name">${esc(group.meta.name)}</span>
        <span class="source-group-status ${group.status}">${status}</span>
      </div>
      ${group.status === 'error' ? `<div class="source-error">${esc(sourceErrorText(group.error))}</div>` : ''}
      ${group.status === 'loading' ? '<div class="source-loading small">正在读取…</div>' : ''}
      ${results}
    </div>`;
  }).join('');
}

function renderExploreResults() {
  const box = document.getElementById('exploreResults');
  if (box) box.innerHTML = exploreGroupsHTML();
}

async function startExplore(keyword) {
  const metas = store.sourceMetas().filter((s) => s.enabled && s.rules.includes('search'));
  exploreState.loading = true;
  exploreState.keyword = keyword;
  exploreState.started = true;
  exploreState.groups = metas.map((meta) => ({ meta, status: 'loading', items: [], error: '' }));
  renderExploreResults();
  if (!metas.length) {
    exploreState.loading = false;
    renderExploreResults();
    return;
  }
  await Promise.all(metas.map(async (meta) => {
    const group = exploreState.groups.find((g) => g.meta.id === meta.id);
    try {
      const data = await store.getSourceData(meta.id);
      if (!data) throw new Error('SOURCE_MISSING');
      group.items = await searchSource(data, keyword, 1);
      group.status = 'done';
    } catch (e) {
      group.status = 'error';
      group.error = e.message || 'UNKNOWN';
    }
    if (exploreState.keyword === keyword) renderExploreResults();
  }));
  exploreState.loading = false;
  if (exploreState.keyword === keyword) renderExploreResults();
}

async function previewRemote(gi, ii) {
  const group = exploreState.groups[gi];
  if (!group || !group.items[ii]) return;
  const item = group.items[ii];
  openSheet(`
    <div class="sheet-handle"></div>
    <div class="sheet-title">正在读取书源</div>
    <div class="sheet-sub">${esc(item.name)} · ${esc(group.meta.name)}</div>
    <div class="r-loading" style="padding:18px 0">
      <div class="line" style="width:62%"></div>
      <div class="line" style="width:88%"></div>
      <div class="line" style="width:44%"></div>
    </div>
  `, 'remote');
  try {
    const data = await store.getSourceData(group.meta.id);
    if (!data) throw new Error('SOURCE_MISSING');
    const detail = await fetchDetail(data, item.bookUrl, item);
    const chapters = await fetchToc(data, detail.tocUrl);
    pendingRemote = { meta: group.meta, detail, chapters, item };
    openSheet(remotePreviewHTML(pendingRemote), 'remote');
  } catch (e) {
    openSheet(`
      <div class="sheet-handle"></div>
      <div class="sheet-title">书源读取失败</div>
      <div class="sheet-sub">${esc(group.meta.name)}</div>
      <p class="desc-text" style="margin-top:10px">${esc(sourceErrorText(e.message))}</p>
      <div style="display:flex;gap:9px;margin-top:16px">
        <button class="btn btn-ghost" style="flex:1" data-act="close-sheet">关闭</button>
        <button class="btn btn-primary" style="flex:1" data-act="remote-retry" data-gi="${gi}" data-ii="${ii}">重试</button>
      </div>
    `, 'remote-error');
  }
}

function parseKinds(kind) {
  return String(kind || '')
    .split(/[\/、,，|·]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function remotePreviewHTML(pending) {
  const { meta, detail, chapters, item } = pending;
  const title = detail.name || item.name;
  const author = detail.author || item.author || '佚名';
  const tags = parseKinds(detail.kind || item.kind);
  return `<div class="sheet-handle"></div>
    <div class="remote-preview">
      <div class="remote-preview-cover">
        ${detail.coverUrl
          ? `<img src="${esc(detail.coverUrl)}" alt="" onerror="this.remove()" />`
          : `<span>${esc(String(title).slice(0, 1))}</span>`}
      </div>
      <div class="remote-preview-info">
        <div class="sheet-title">${esc(tx(title))}</div>
        <div class="sheet-sub">${esc(tx(author))} · ${chapters.length} 章</div>
        <div class="tags" style="margin-top:8px">
          ${tags.map((t) => `<span class="badge">${esc(t)}</span>`).join('')}
          <span class="badge accent">书源</span>
        </div>
      </div>
    </div>
    <p class="desc-text clamp" style="margin-top:12px">${esc(tx(detail.intro || item.intro || '暂无简介'))}</p>
    <div class="source-preview-note">来源：${esc(meta.name)} · ${esc(sourceHost(meta.url))}</div>
    <button class="btn btn-primary btn-block" style="margin-top:14px" data-act="remote-add">加入书架并阅读</button>
  `;
}

async function saveRemoteBook() {
  if (!pendingRemote) return;
  const { meta, detail, chapters, item } = pendingRemote;
  if (!chapters.length) {
    toast('没有解析到章节');
    return;
  }
  const title = detail.name || item.name;
  const id = `remote-${hashId(`${meta.id}|${detail.bookUrl}`)}`;
  const existing = store.findBook(id);
  if (existing) {
    closeSheet();
    pendingRemote = null;
    navigate(`#/book/${id}`);
    return;
  }
  const palettes = [
    ['#26333f', '#c58b6e'],
    ['#2a3432', '#93b3a5'],
    ['#332a3d', '#a8837a'],
    ['#3a3126', '#c9a86a'],
    ['#1f2b3a', '#8fa8c4']
  ];
  const palette = palettes[HashRandom(`${meta.id}${detail.bookUrl}`) % palettes.length];
  const tags = parseKinds(detail.kind || item.kind);
  const book = {
    id,
    title: title || '未命名作品',
    author: detail.author || item.author || '佚名',
    tags: tags.length ? tags : ['书源'],
    status: 'ongoing',
    words: 0,
    rating: 0,
    heat: 0,
    reads: '在线',
    trend: 0,
    updated: detail.lastChapter || '在线连载',
    palette,
    pattern: 'import',
    desc: detail.intro || item.intro || '来自在线书源的作品，正文按需加载。',
    chapters: chapters.slice(0, 2000).map((chapter, index) => ({ id: index, title: chapter.title, url: chapter.url })),
    remote: true,
    local: false,
    sourceId: meta.id,
    sourceName: meta.name,
    bookUrl: detail.bookUrl,
    tocUrl: detail.tocUrl,
    coverUrl: detail.coverUrl || item.coverUrl || ''
  };
  await store.addRemoteBook(book);
  pendingRemote = null;
  closeSheet();
  toast(`《${book.title}》已加入书架`);
  navigate(`#/book/${id}`);
}

function HashRandom(seed) {
  let value = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i += 1) value = (value * 31 + str.charCodeAt(i)) >>> 0;
  return value;
}

async function importSourcesText(text) {
  try {
    const { items, errors } = parseImportPayload(text);
    const added = await store.addSources(items);
    if (added.length) {
      toast(`已导入 ${added.length} 个书源${errors.length ? `，跳过 ${errors.length} 个` : ''}`);
    } else {
      toast('书源已存在，没有新增');
    }
    render();
  } catch (e) {
    toast(sourceErrorText(e.message));
  }
}

function openSourcePaste() {
  openSheet(`
    <div class="sheet-handle"></div>
    <div class="sheet-title">粘贴书源 JSON</div>
    <div class="sheet-sub">支持单个书源或书源数组，格式与「阅读」App 一致</div>
    <textarea id="sourceJsonBox" class="paste-area" placeholder='{"bookSourceName":"我的书源","bookSourceUrl":"https://example.com","searchUrl":"/search?q={{key}}","ruleSearch":{"bookList":"class.list@tag.a","name":"text","bookUrl":"href"},"ruleBookInfo":{"tocUrl":"class.toc@href"},"ruleToc":{"chapterList":"class.chapters@tag.a","chapterName":"text","chapterUrl":"href"},"ruleContent":{"content":"id.content@html"}}'></textarea>
    <div style="display:flex;gap:9px;margin-top:12px">
      <button class="btn btn-ghost" style="flex:1" data-act="close-sheet">取消</button>
      <button class="btn btn-primary" style="flex:1" data-act="source-paste-submit">导入</button>
    </div>
  `, 'source-paste');
}

function bindSourceFileInput() {
  let input = document.getElementById('paperlanternSourceFile');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'paperlanternSourceFile';
    input.accept = '.json,application/json,text/plain';
    input.hidden = true;
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      try {
        await importSourcesText(await file.text());
      } catch (e) {
        toast('读取文件失败');
      }
    });
    document.body.appendChild(input);
  }
  input.click();
}

async function loadDemoSource() {
  try {
    const response = await fetch('./mock-source/source.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP');
    await importSourcesText(await response.text());
  } catch (e) {
    toast('示例书源加载失败');
  }
}

function runExploreFromInput() {
  const input = document.getElementById('exploreInput');
  const keyword = input ? input.value.trim() : '';
  if (!keyword) {
    toast('先输入关键词');
    return;
  }
  const target = `#/explore?q=${encodeURIComponent(keyword)}`;
  if (location.hash === target) {
    exploreState.started = false;
    render();
  } else {
    navigate(target);
  }
}

function readerSettingsSheet() {
  const s = store.getSettings();
  const fonts = [['serif', '衬线'], ['sans', '黑体'], ['kai', '楷体']]
    .map(([v, n]) => `<button class="option ${s.fontFamily === v ? 'active' : ''}" data-act="app-set" data-key="fontFamily" data-value="${v}">${n}</button>`).join('');
  const lines = [1.6, 1.8, 2.0, 2.2]
    .map((v) => `<button class="option ${Number(s.lineHeight) === v ? 'active' : ''}" data-act="app-set" data-key="lineHeight" data-value="${v}">${v.toFixed(1)}</button>`).join('');
  const bgs = [['night', '#14171c'], ['paper', '#f7f3ea'], ['parchment', '#efe4d1'], ['green', '#cbdcc8'], ['ink', '#0a0b0d']]
    .map(([v, c]) => `<button class="option ${s.readerBg === v ? 'active' : ''}" data-act="app-set" data-key="readerBg" data-value="${v}" style="background:${c};border-color:rgba(128,128,128,.4);width:34px;padding:0;color:transparent">.</button>`).join('');
  openSheet(`
    <div class="sheet-handle"></div>
    <div class="sheet-title">阅读偏好</div>
    <div class="sheet-sub">修改后立即生效，下次打开阅读器沿用</div>
    <div class="setting-row">
      <span class="setting-name" style="flex:none">字号</span>
      <div class="option-row" style="flex:1;justify-content:flex-end">
        <button class="option font-btn" data-act="app-set" data-key="fontSize" data-value="-1">A-</button>
        <span class="option active" style="min-width:52px;justify-content:center">${s.fontSize}</span>
        <button class="option font-btn" data-act="app-set" data-key="fontSize" data-value="1">A+</button>
      </div>
    </div>
    <div class="setting-row"><span class="setting-name">行距</span><div class="option-row">${lines}</div></div>
    <div class="setting-row"><span class="setting-name">字体</span><div class="option-row">${fonts}</div></div>
    <div class="setting-row"><span class="setting-name">护眼背景</span><div class="option-row">${bgs}</div></div>
    <div class="setting-row">
      <span class="setting-name">翻页</span>
      <div class="option-row">
        <button class="option ${s.pageMode === 'scroll' ? 'active' : ''}" data-act="app-set" data-key="pageMode" data-value="scroll">上下滚动</button>
        <button class="option ${s.pageMode === 'paged' ? 'active' : ''}" data-act="app-set" data-key="pageMode" data-value="paged">左右翻页</button>
      </div>
    </div>
    <div class="setting-row">
      <span class="setting-name">简繁</span>
      <div class="option-row">
        <button class="option ${s.script === 'simplified' ? 'active' : ''}" data-act="app-set" data-key="script" data-value="simplified">简体</button>
        <button class="option ${s.script === 'traditional' ? 'active' : ''}" data-act="app-set" data-key="script" data-value="traditional">繁體</button>
      </div>
    </div>
  `, 'reader-settings');
}

function aboutSheet() {
  openSheet(`
    <div class="sheet-handle"></div>
    <div class="sheet-title">yuiの轻小说</div>
    <div class="sheet-sub">v1.1.0 · 离线优先的轻小说阅读器</div>
    <p class="desc-text" style="margin-top:10px">所有书架、阅读进度、评论与缓存都保存在这台设备上，不上传服务器。没有开屏广告，没有弹窗。</p>
    <div style="height:1px;background:var(--line);margin:16px 0"></div>
    <p class="desc-text">支持导入「阅读」App 格式的书源 JSON，按 search / detail / toc / content 四个规则从第三方站点获取内容。书源由你自行选择，请确认其内容来源合法。</p>
    <div style="height:1px;background:var(--line);margin:16px 0"></div>
    <p class="desc-text" style="font-size:11px;color:var(--text-3)">Android 客户端基于本地 WebView 运行，断网也能打开已缓存的章节。</p>
    <button class="btn btn-soft btn-block" style="margin-top:18px" data-act="close-sheet">知道了</button>
  `, 'about');
}

function confirmSheet(title, desc, confirmText, action) {
  openSheet(`
    <div class="sheet-handle"></div>
    <div class="sheet-title">${esc(title)}</div>
    <div class="sheet-sub">${esc(desc)}</div>
    <div style="display:flex;gap:9px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" data-act="close-sheet">先不了</button>
      <button class="btn btn-primary" style="flex:1" data-act="${action}">${esc(confirmText)}</button>
    </div>
  `, 'confirm');
}

async function cacheBookFlow(bookId) {
  const book = store.findBook(bookId);
  if (!book) return;
  if (book.local) {
    toast('本地书籍已经在设备里了');
    return;
  }
  if (store.isBookCached(book)) {
    toast('全书已缓存');
    return;
  }
  if (store.isOffline()) {
    toast('当前离线，无法下载新章节');
    return;
  }
  const btn = view.querySelector('[data-act="cache"]');
  const original = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `${icon('download', 15)} 正在缓存 0%`;
  }
  try {
    const result = await store.cacheBook(book, (done, total) => {
      const pct = Math.round((done / total) * 100);
      if (btn) btn.innerHTML = `${icon('download', 15)} 正在缓存 ${pct}%`;
    });
    if (result && result.failed) {
      toast(`已缓存 ${result.done} 章，${result.failed} 章失败`);
    } else {
      toast(`已缓存 ${book.chapters.length} 章，可以离线阅读`);
    }
    render();
  } catch (e) {
    if (e.message === 'NEED_WIFI') toast('已开启「仅 WiFi 缓存」，当前不是 WiFi 网络');
    else if (e.message === 'OFFLINE') toast('当前离线，无法下载章节');
    else toast('缓存失败，请稍后再试');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
}

async function removeCacheFlow() {
  const state = store.getState();
  const ids = Object.keys(state.cacheIndex).filter((id) => (state.cacheIndex[id] || []).length > 0);
  for (const id of ids) {
    await store.removeBookCache(id);
  }
  await store.flush();
  toast(`已清除 ${ids.length} 本书的缓存`);
  closeSheet();
  render();
}

function readBack() {
  if (isReaderOpen()) {
    readerBack();
    return;
  }
  if (isSheetOpen()) {
    closeSheet();
    return;
  }
  if (location.hash && location.hash !== '#/home') {
    if (history.length > 1) history.back();
    else navigate('#/home');
  }
}

async function handleImport(file) {
  if (!file) return;
  const isEpub = /\.epub$/i.test(file.name);
  if (file.size > 40 * 1024 * 1024) {
    toast('文件超过 40MB，换个小一点的吧');
    return;
  }
  openSheet(`
    <div class="sheet-handle"></div>
    <div class="sheet-title">正在解析</div>
    <div class="sheet-sub">${esc(file.name)} · ${(file.size / 1024).toFixed(0)} KB</div>
    <div class="r-loading" style="padding:18px 0">
      <div class="line" style="width:70%"></div>
      <div class="line" style="width:92%"></div>
      <div class="line" style="width:48%"></div>
    </div>
  `, 'import');
  try {
    let parsed;
    if (isEpub) {
      parsed = await parseEpub(await file.arrayBuffer(), file.name);
    } else {
      parsed = parseTxt(await readTextFile(file), file.name);
    }
    const meta = await store.importLocalBook(parsed, parsed.chapters);
    closeSheet();
    toast(`《${meta.title}》已加入书架`);
    setTimeout(() => navigate(`#/book/${meta.id}`), 260);
  } catch (error) {
    closeSheet();
    const map = {
      EMPTY_FILE: '这个文件里没有可读的文字',
      EMPTY_EPUB: 'EPUB 里没有找到可用章节',
      ZIP_INVALID: '这个文件不是有效的 EPUB',
      NO_DEFLATE_SUPPORT: '当前系统版本不支持该 EPUB 的压缩格式，试试转成 TXT',
      ZIP_METHOD_UNSUPPORTED: '这个 EPUB 使用了暂不支持的压缩方式',
      NO_INDEXEDDB: '设备存储不可用，无法导入'
    };
    toast(map[error.message] || '解析失败，换一个文件试试');
  }
}

function bindFileInput() {
  let input = document.getElementById('paperlanternFile');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'paperlanternFile';
    input.accept = '.txt,.epub,text/plain,application/epub+zip';
    input.hidden = true;
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.value = '';
      handleImport(file);
    });
    document.body.appendChild(input);
  }
  input.click();
}

function setOption(key, value) {
  const s = store.getSettings();
  if (key === 'fontSize') {
    store.updateSettings({ fontSize: clamp(Number(s.fontSize) + Number(value), 15, 28) });
  } else if (key === 'lineHeight') {
    store.updateSettings({ lineHeight: Number(value) });
  } else {
    store.updateSettings({ [key]: value });
  }
  readerSettingsSheet();
  if (key === 'script') render();
}

function onClick(event) {
  const el = event.target.closest('[data-act]');
  if (!el) {
    if (event.target.closest('.sheet-layer') && event.target === sheetLayer) closeSheet();
    return;
  }
  const act = el.dataset.act;

  if (act === 'nav') {
    closeSheet();
    navigate(el.dataset.href);
    return;
  }
  if (act === 'open') {
    closeSheet();
    navigate(`#/book/${el.dataset.id}`);
    return;
  }
  if (act === 'read') {
    closeSheet();
    openReader(el.dataset.id, Number(el.dataset.ch || 0));
    return;
  }
  if (act === 'back') {
    readBack();
    return;
  }
  if (act === 'shelf-toggle') {
    const added = store.toggleShelf(el.dataset.id);
    toast(added ? '已加入书架' : '已从书架移除');
    render();
    return;
  }
  if (act === 'cache') {
    cacheBookFlow(el.dataset.id);
    return;
  }
  if (act === 'search') {
    openSearch('');
    return;
  }
  if (act === 'hot-word') {
    const word = el.dataset.word;
    openSearch(word);
    return;
  }
  if (act === 'clear-search') {
    openSearch('');
    return;
  }
  if (act === 'close-sheet') {
    closeSheet();
    return;
  }
  if (act === 'toggle-script') {
    const s = store.getSettings();
    store.updateSettings({ script: s.script === 'traditional' ? 'simplified' : 'traditional' });
    render();
    return;
  }
  if (act === 'toggle-theme') {
    const s = store.getSettings();
    store.updateSettings({ theme: s.theme === 'light' ? 'dark' : 'light' });
    render();
    return;
  }
  if (act === 'toggle-wifi') {
    const s = store.getSettings();
    store.updateSettings({ wifiOnly: !s.wifiOnly });
    render();
    return;
  }
  if (act === 'toggle-offline') {
    const s = store.getSettings();
    store.updateSettings({ offlineDemo: !s.offlineDemo });
    render();
    toast(s.offlineDemo ? '已退出离线演示' : '已进入离线演示：只能读已缓存章节');
    return;
  }
  if (act === 'reader-settings') {
    readerSettingsSheet();
    return;
  }
  if (act === 'app-set') {
    setOption(el.dataset.key, el.dataset.value);
    return;
  }
  if (act === 'import') {
    bindFileInput();
    return;
  }
  if (act === 'source-import-file') {
    bindSourceFileInput();
    return;
  }
  if (act === 'source-paste') {
    openSourcePaste();
    return;
  }
  if (act === 'source-demo') {
    loadDemoSource();
    return;
  }
  if (act === 'source-toggle') {
    const enabled = store.toggleSourceEnabled(el.dataset.id);
    toast(enabled ? '书源已启用' : '书源已停用');
    render();
    return;
  }
  if (act === 'source-delete') {
    const meta = store.sourceMetas().find((s) => s.id === el.dataset.id);
    confirmSheet(
      '移除书源',
      meta
        ? `「${meta.name}」将从书源列表移除。已加入书架的书会保留，但可能无法继续加载新章节。`
        : '该操作会从书源列表移除这个书源。',
      '移除书源',
      'do-source-delete'
    );
    sheetLayer.dataset.pendingSource = el.dataset.id;
    return;
  }
  if (act === 'do-source-delete') {
    const id = sheetLayer.dataset.pendingSource;
    closeSheet();
    if (id) {
      store.deleteSource(id).then(() => {
        toast('书源已移除');
        render();
      });
    }
    return;
  }
  if (act === 'source-paste-submit') {
    const box = document.getElementById('sourceJsonBox');
    const text = box ? box.value.trim() : '';
    if (!text) {
      toast('先粘贴书源 JSON');
      return;
    }
    closeSheet();
    importSourcesText(text);
    return;
  }
  if (act === 'explore-from-search') {
    const input = document.getElementById('searchInput');
    const keyword = (input && input.value.trim()) || '轻小说';
    closeSheet();
    navigate(`#/explore?q=${encodeURIComponent(keyword)}`);
    return;
  }
  if (act === 'explore-search') {
    runExploreFromInput();
    return;
  }
  if (act === 'remote-preview') {
    previewRemote(Number(el.dataset.gi), Number(el.dataset.ii));
    return;
  }
  if (act === 'remote-retry') {
    previewRemote(Number(el.dataset.gi), Number(el.dataset.ii));
    return;
  }
  if (act === 'remote-add') {
    saveRemoteBook();
    return;
  }
  if (act === 'clear-cache') {
    confirmSheet('清除离线缓存', '已下载的章节会被删除，书架与本地导入的书籍保留。', '清除缓存', 'do-clear-cache');
    return;
  }
  if (act === 'do-clear-cache') {
    removeCacheFlow();
    return;
  }
  if (act === 'about') {
    aboutSheet();
    return;
  }
  if (act === 'expand-desc') {
    const p = view.querySelector('.desc-text');
    if (p) {
      p.classList.remove('clamp');
      el.remove();
    }
    return;
  }
  if (act === 'like') {
    store.toggleLike(el.dataset.id);
    render();
    return;
  }
  if (act === 'post-book-comment') {
    const box = view.querySelector('#bookCommentBox');
    if (!box) return;
    const text = box.value.trim();
    if (!text) {
      toast('写点什么再发布吧');
      return;
    }
    store.addComment(el.dataset.id, -1, text, store.getNickname());
    toast('书评已发布');
    render();
    return;
  }
  if (act === 'remove-local') {
    const target = store.findBook(el.dataset.id);
    const isRemote = target && target.remote;
    confirmSheet(
      isRemote ? '移出书架' : '移除本地书籍',
      isRemote
        ? '章节缓存与阅读进度会一起删除，之后仍可通过书源重新加入。'
        : '书籍正文与阅读进度会一起删除，无法恢复。',
      '移除',
      'do-remove-local'
    );
    sheetLayer.dataset.pendingId = el.dataset.id;
    return;
  }
  if (act === 'do-remove-local') {
    const id = sheetLayer.dataset.pendingId;
    closeSheet();
    if (id) {
      store.removeLocalBook(id).then(() => {
        toast('已移除');
        navigate('#/shelf');
        setTimeout(render, 40);
      });
    }
    return;
  }
}

document.addEventListener('click', onClick);

document.addEventListener('input', (event) => {
  if (event.target && event.target.id === 'searchInput') {
    updateSearchResults(event.target.value);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  if (event.target && event.target.id === 'exploreInput') {
    event.preventDefault();
    runExploreFromInput();
  }
});

window.addEventListener('hashchange', () => {
  render();
});

window.addEventListener('paperlantern:reader-close', () => {
  render();
});

window.addEventListener('online', () => {
  if (store.getSettings().offlineDemo) return;
  toast('网络已恢复');
});

window.addEventListener('offline', () => {
  if (store.getSettings().offlineDemo) return;
  toast('已断开网络，只能阅读已缓存章节');
});

window.__paperlanternBack = function paperlanternBack() {
  if (isReaderOpen()) {
    readerBack();
    return 'true';
  }
  if (isSheetOpen()) {
    closeSheet();
    return 'true';
  }
  if (location.hash && location.hash !== '#/home') {
    if (history.length > 1) history.back();
    else navigate('#/home');
    return 'true';
  }
  return 'false';
};

function closeSearchIfNeeded() {
  if (sheetMode === 'search') closeSheet();
}

function boot() {
  if (!location.hash) {
    location.hash = '#/home';
  } else {
    render();
  }
  const settings = store.getSettings();
  document.documentElement.dataset.theme = settings.theme === 'light' ? 'light' : 'dark';
}

boot();