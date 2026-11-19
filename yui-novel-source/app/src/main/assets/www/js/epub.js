const HEAD_RE = /^[ \t\u3000]*((?:第[零一二三四五六七八九十百千万两0-9]{1,8}[章回节话卷部篇][^\n]{0,36})|(?:序章|序言|楔子|尾声|终章|后记|番外)[^\n]{0,36}|(?:Chapter|CHAPTER)\s+[0-9IVXLC]+[^\n]{0,40})[ \t\u3000]*$/;
const TOC_RE = /^(目录|目錄|contents|table of contents|cover|封面)$/i;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function toParagraphs(lines) {
  const hasBlank = lines.some((l) => l.trim() === '');
  const result = [];
  if (hasBlank) {
    let buffer = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) {
        if (buffer.length) {
          result.push(buffer.join(''));
          buffer = [];
        }
      } else {
        buffer.push(t);
      }
    }
    if (buffer.length) result.push(buffer.join(''));
  } else {
    let buffer = '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      buffer += t;
      if (buffer.length >= 90 || /[。！？”」』…]$/.test(t)) {
        result.push(buffer);
        buffer = '';
      }
    }
    if (buffer) result.push(buffer);
  }
  return result.map((p) => p.trim()).filter((p) => p.length > 0);
}

export function parseTxt(raw, fallbackTitle) {
  const text = stripBom(normalizeNewlines(raw));
  const lines = text.split('\n').map((l) => l.replace(/[ \t\u3000]+$/, ''));
  const marks = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.length > 1 && trimmed.length < 48 && HEAD_RE.test(trimmed)) {
      marks.push({ index, title: trimmed });
    }
  });

  const chapters = [];
  if (marks.length > 0) {
    const first = marks[0].index;
    const preface = toParagraphs(lines.slice(0, first));
    if (preface.length > 2) {
      chapters.push({ title: '序', paragraphs: preface });
    }
    for (let i = 0; i < marks.length; i += 1) {
      const start = marks[i].index + 1;
      const end = i + 1 < marks.length ? marks[i + 1].index : lines.length;
      const paragraphs = toParagraphs(lines.slice(start, end));
      if (paragraphs.length) chapters.push({ title: marks[i].title, paragraphs });
    }
  }

  if (!chapters.length) {
    const paragraphs = toParagraphs(lines);
    const chunkSize = 2600;
    if (!paragraphs.length) throw new Error('EMPTY_FILE');
    let current = [];
    let size = 0;
    let index = 1;
    for (const p of paragraphs) {
      current.push(p);
      size += p.length;
      if (size >= chunkSize) {
        chapters.push({ title: `第 ${index} 节`, paragraphs: current });
        current = [];
        size = 0;
        index += 1;
      }
    }
    if (current.length) chapters.push({ title: `第 ${index} 节`, paragraphs: current });
  }

  const firstLine = lines.map((l) => l.trim()).find((l) => l.length > 0) || '';
  let title = (fallbackTitle || '未命名作品').replace(/\.[^.]+$/, '').trim() || '未命名作品';
  if (firstLine && firstLine.length >= 2 && firstLine.length <= 32 && !HEAD_RE.test(firstLine)) {
    title = firstLine;
  }
  return {
    title,
    author: '本地导入',
    format: 'txt',
    chapters
  };
}

export async function readTextFile(file) {
  const buffer = await file.arrayBuffer();
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return utf8;
  } catch (e) {
  }
  try {
    return new TextDecoder('gbk', { fatal: false }).decode(buffer);
  } catch (e) {
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

function decodeName(bytes, flags) {
  if (flags & 0x800) return new TextDecoder('utf-8').decode(bytes);
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!utf8.includes('\ufffd')) return utf8;
  try {
    return new TextDecoder('gbk', { fatal: false }).decode(bytes);
  } catch (e) {
    return utf8;
  }
}

function readZipEntries(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  const minPos = Math.max(0, bytes.length - 65600);
  for (let i = bytes.length - 22; i >= minPos; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP_INVALID');
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decodeName(bytes.subarray(offset + 46, offset + 46 + nameLen), flags);
    entries.set(name, { method, compSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, view, bytes };
}

async function extractEntry(zip, name) {
  const entry = zip.entries.get(name);
  if (!entry) return null;
  const view = zip.view;
  const local = entry.localOffset;
  if (view.getUint32(local, true) !== 0x04034b50) throw new Error('ZIP_ENTRY_INVALID');
  const nameLen = view.getUint16(local + 26, true);
  const extraLen = view.getUint16(local + 28, true);
  const start = local + 30 + nameLen + extraLen;
  const data = zip.bytes.subarray(start, start + entry.compSize);
  if (entry.method === 0) return new Uint8Array(data);
  if (entry.method === 8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('NO_DEFLATE_SUPPORT');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error('ZIP_METHOD_UNSUPPORTED');
}

function resolvePath(baseDir, href) {
  const clean = decodeURIComponent(href.split('#')[0].split('?')[0]);
  const stack = baseDir ? baseDir.split('/').filter(Boolean) : [];
  for (const part of clean.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function dirOf(path) {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(0, idx) : '';
}

function findLocal(node, name) {
  if (node.localName === name) return node;
  const list = node.getElementsByTagName('*');
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].localName === name) return list[i];
  }
  return null;
}

function looksLikeFileName(value) {
  return /\.(x?html?|htm|xml)$/i.test(String(value || '').trim());
}

function htmlToChapter(html, fallbackTitle, tocTitle, basePath) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, nav, svg, head').forEach((el) => el.remove());
  const heading = doc.querySelector('h1, h2, h3');
  let headingText = heading ? heading.textContent.trim().replace(/\s+/g, ' ') : '';
  if (!headingText) {
    const titleNode = doc.querySelector('title');
    const titleText = titleNode ? titleNode.textContent.trim().replace(/\s+/g, ' ') : '';
    if (titleText && !looksLikeFileName(titleText) && titleText !== fallbackTitle) {
      headingText = titleText;
    }
  }

  const paragraphs = [];
  const imageRefs = [];
  const body = doc.body;
  if (body) {
    const blockTags = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'FIGURE']);
    let buffer = '';
    const flush = () => {
      const text = buffer.replace(/\s+/g, ' ').trim();
      if (text.length > 1) paragraphs.push(text);
      buffer = '';
    };
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          buffer += child.nodeValue || '';
          return;
        }
        if (child.nodeType !== 1) return;
        const tag = child.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NAV' || tag === 'FIGCAPTION') return;
        if (tag === 'IMG') {
          flush();
          const raw = String(child.getAttribute('src') || '').trim();
          if (raw) {
            const isData = /^data:image\//i.test(raw);
            const path = isData ? '' : resolvePath(dirOf(basePath || ''), raw.split('#')[0].split('?')[0]);
            if (isData || path) {
              imageRefs.push({
                after: paragraphs.length,
                path,
                dataUrl: isData ? raw : '',
                alt: String(child.getAttribute('alt') || '').trim()
              });
            }
          }
          return;
        }
        if (/^H[1-4]$/i.test(tag)) {
          flush();
          return;
        }
        if (blockTags.has(tag)) {
          flush();
          walk(child);
          flush();
        } else {
          walk(child);
        }
      });
    };
    walk(body);
    flush();
  }

  if (!paragraphs.length && !imageRefs.length && body) {
    const text = body.textContent || '';
    const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (const line of lines) {
      if (line.length > 1) paragraphs.push(line);
    }
  }

  const title = String(tocTitle || headingText || fallbackTitle || '未命名章节').trim();
  return { title: title.slice(0, 80), paragraphs, imageRefs };
}

function imageMime(path) {
  const ext = String(path || '').split('.').pop().toLowerCase();
  const types = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml'
  };
  return types[ext] || 'image/jpeg';
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function parseTocDocument(doc, baseDir) {
  const map = new Map();
  const order = [];
  const add = (title, href) => {
    const clean = String(title || '').replace(/\s+/g, ' ').trim();
    const src = String(href || '').split('#')[0].trim();
    if (!clean || !src) return;
    const path = resolvePath(baseDir, src);
    if (!path) return;
    if (!map.has(path)) map.set(path, clean);
    if (!order.includes(path)) order.push(path);
  };

  const points = Array.from(doc.getElementsByTagName('*')).filter((el) => el.localName === 'navPoint');
  if (points.length) {
    points.forEach((point) => {
      const children = Array.from(point.children || []);
      const label = children.find((el) => el.localName === 'navLabel');
      const textEl = label
        ? Array.from(label.children || []).find((el) => el.localName === 'text')
        : null;
      const contentEl = children.find((el) => el.localName === 'content');
      if (textEl && contentEl) add(textEl.textContent, contentEl.getAttribute('src'));
    });
    return { map, order };
  }

  const nav = Array.from(doc.querySelectorAll('nav')).find((el) => {
    const type = String(el.getAttribute('epub:type') || el.getAttribute('type') || '').toLowerCase();
    return type.includes('toc');
  }) || doc.querySelector('nav');
  if (nav) {
    nav.querySelectorAll('a[href]').forEach((a) => add(a.textContent, a.getAttribute('href')));
  }
  return { map, order };
}

async function imageDataUrl(zip, path) {
  try {
    const bytes = await extractEntry(zip, path);
    if (!bytes || !bytes.length || bytes.length > MAX_IMAGE_BYTES) return '';
    return `data:${imageMime(path)};base64,${bytesToBase64(bytes)}`;
  } catch (e) {
    return '';
  }
}

async function shrinkCover(dataUrl) {
  if (!dataUrl || dataUrl.length < 60000) return dataUrl;
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('IMAGE'));
      img.src = dataUrl;
    });
    const scale = Math.min(240 / image.width, 340 / image.height, 1);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (e) {
    return dataUrl;
  }
}

export async function parseEpub(buffer, fallbackTitle) {
  const zip = readZipEntries(buffer);
  let opfPath = '';
  const containerXml = await extractEntry(zip, 'META-INF/container.xml');
  if (containerXml) {
    const doc = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(containerXml), 'application/xml');
    const rootfile = findLocal(doc, 'rootfile');
    if (rootfile) opfPath = rootfile.getAttribute('full-path') || '';
  }
  if (!opfPath) {
    for (const name of zip.entries.keys()) {
      if (name.toLowerCase().endsWith('.opf')) {
        opfPath = name;
        break;
      }
    }
  }

  let title = fallbackTitle || '未命名作品';
  let author = '本地导入';
  const ordered = [];
  let tocMap = new Map();
  let tocOrder = [];
  let coverUrl = '';

  if (opfPath) {
    const opfBytes = await extractEntry(zip, opfPath);
    if (opfBytes) {
      const opf = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(opfBytes), 'application/xml');
      const titleNode = Array.from(opf.getElementsByTagName('*')).find((el) => el.localName === 'title');
      const creatorNode = Array.from(opf.getElementsByTagName('*')).find((el) => el.localName === 'creator');
      if (titleNode && titleNode.textContent.trim()) title = titleNode.textContent.trim();
      if (creatorNode && creatorNode.textContent.trim()) author = creatorNode.textContent.trim();

      const baseDir = dirOf(opfPath);
      const manifest = {};
      Array.from(opf.getElementsByTagName('*')).forEach((el) => {
        if (el.localName === 'item') {
          manifest[el.getAttribute('id')] = {
            href: el.getAttribute('href') || '',
            type: el.getAttribute('media-type') || '',
            properties: el.getAttribute('properties') || ''
          };
        }
      });
      const spine = Array.from(opf.getElementsByTagName('*')).filter((el) => el.localName === 'itemref');
      for (const ref of spine) {
        const item = manifest[ref.getAttribute('idref')];
        if (!item || !item.href) continue;
        const path = resolvePath(baseDir, item.href);
        if (!ordered.includes(path)) ordered.push(path);
      }

      let ncxPath = '';
      let navPath = '';
      Object.values(manifest).forEach((item) => {
        if (!item.href) return;
        if (item.type === 'application/x-dtbncx+xml') ncxPath = resolvePath(baseDir, item.href);
        if (String(item.properties || '').split(/\s+/).includes('nav')) navPath = resolvePath(baseDir, item.href);
      });

      for (const tocPath of [ncxPath, navPath].filter(Boolean)) {
        try {
          const tocBytes = await extractEntry(zip, tocPath);
          if (!tocBytes) continue;
          const tocText = new TextDecoder('utf-8', { fatal: false }).decode(tocBytes);
          const tocDoc = tocPath.toLowerCase().endsWith('.ncx')
            ? new DOMParser().parseFromString(tocText, 'application/xml')
            : new DOMParser().parseFromString(tocText, 'text/html');
          const parsedToc = parseTocDocument(tocDoc, dirOf(tocPath));
          if (parsedToc.order.length) {
            tocMap = parsedToc.map;
            tocOrder = parsedToc.order;
            break;
          }
        } catch (e) {
        }
      }

      let coverHref = '';
      Object.values(manifest).forEach((item) => {
        if (!coverHref && String(item.properties || '').split(/\s+/).includes('cover-image')) {
          coverHref = item.href;
        }
      });
      if (!coverHref) {
        const metaCover = Array.from(opf.getElementsByTagName('*')).find((el) => {
          return el.localName === 'meta' && String(el.getAttribute('name') || '').toLowerCase() === 'cover';
        });
        if (metaCover) {
          const id = metaCover.getAttribute('content');
          if (manifest[id]) coverHref = manifest[id].href;
        }
      }
      if (!coverHref) {
        const guideCover = Array.from(opf.getElementsByTagName('*')).find((el) => {
          return el.localName === 'reference' && String(el.getAttribute('type') || '').toLowerCase() === 'cover';
        });
        if (guideCover) coverHref = guideCover.getAttribute('href') || '';
      }

      const coverCandidates = [];
      if (coverHref) coverCandidates.push(resolvePath(baseDir, coverHref));
      Object.values(manifest).forEach((item) => {
        if (!item.href) return;
        if (/cover/i.test(item.href) && /\.(jpe?g|png|webp|gif)$/i.test(item.href)) {
          coverCandidates.push(resolvePath(baseDir, item.href));
        }
      });
      for (const name of zip.entries.keys()) {
        if (/(^|\/)(cover|封面)[^/]*\.(jpe?g|png|webp|gif)$/i.test(name)) {
          coverCandidates.push(name);
        }
      }

      for (const candidate of Array.from(new Set(coverCandidates))) {
        if (!zip.entries.has(candidate)) continue;
        if (/\.(x?html?|htm)$/i.test(candidate)) {
          try {
            const pageBytes = await extractEntry(zip, candidate);
            if (!pageBytes) continue;
            const pageHtml = new TextDecoder('utf-8', { fatal: false }).decode(pageBytes);
            const pageDoc = new DOMParser().parseFromString(pageHtml, 'text/html');
            const img = pageDoc.querySelector('img[src]');
            if (!img) continue;
            const imgPath = resolvePath(dirOf(candidate), String(img.getAttribute('src') || '').split('#')[0]);
            coverUrl = await imageDataUrl(zip, imgPath);
            if (coverUrl) break;
          } catch (e) {
          }
        } else {
          coverUrl = await imageDataUrl(zip, candidate);
          if (coverUrl) break;
        }
      }
    }
  }

  if (!ordered.length) {
    for (const name of zip.entries.keys()) {
      if (/\.(x?html?|htm)$/i.test(name)) ordered.push(name);
    }
    ordered.sort();
  }

  let paths = ordered;
  if (tocOrder.length && tocOrder.length >= Math.max(2, Math.floor(ordered.length * 0.5))) {
    const fromToc = tocOrder.filter((path) => zip.entries.has(path));
    if (fromToc.length) paths = fromToc;
  }

  const chapters = [];
  for (const path of paths.slice(0, 320)) {
    let bytes = null;
    try {
      bytes = await extractEntry(zip, path);
    } catch (e) {
      continue;
    }
    if (!bytes) continue;
    let html = '';
    try {
      html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch (e) {
      continue;
    }
    const baseName = path.split('/').pop().replace(/\.x?html?$/i, '');
    if (/^(cover|titlepage|copyright|colophon|nav|toc|contents|title)$/i.test(baseName) && !tocMap.has(path)) {
      continue;
    }
    const chapter = htmlToChapter(html, baseName, tocMap.get(path), path);
    const plain = chapter.paragraphs.join('');
    if (plain.length < 2 && !chapter.imageRefs.length) continue;
    if (TOC_RE.test(chapter.title.trim()) && plain.length < 200) continue;

    const images = [];
    for (const ref of chapter.imageRefs.slice(0, 12)) {
      if (ref.dataUrl) {
        images.push({ after: ref.after, src: ref.dataUrl, alt: ref.alt });
        continue;
      }
      if (!ref.path) continue;
      try {
        const imageBytes = await extractEntry(zip, ref.path);
        if (!imageBytes || !imageBytes.length || imageBytes.length > MAX_IMAGE_BYTES) continue;
        images.push({
          after: ref.after,
          src: `data:${imageMime(ref.path)};base64,${bytesToBase64(imageBytes)}`,
          alt: ref.alt
        });
      } catch (e) {
      }
    }

    chapters.push({
      title: chapter.title,
      paragraphs: chapter.paragraphs,
      images
    });
  }

  if (!chapters.length) throw new Error('EMPTY_EPUB');

  return {
    title: title || fallbackTitle || '未命名作品',
    author,
    format: 'epub',
    coverUrl: coverUrl ? await shrinkCover(coverUrl) : '',
    chapters
  };
}