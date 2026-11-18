const HEAD_RE = /^[ \t\u3000]*((?:第[零一二三四五六七八九十百千万两0-9]{1,8}[章回节话卷部篇][^\n]{0,36})|(?:序章|序言|楔子|尾声|终章|后记|番外)[^\n]{0,36}|(?:Chapter|CHAPTER)\s+[0-9IVXLC]+[^\n]{0,40})[ \t\u3000]*$/;
const TOC_RE = /^(目录|目錄|contents|table of contents|cover|封面)$/i;

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

function htmlToChapter(html, fallbackTitle) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, nav, svg, head').forEach((el) => el.remove());
  const heading = doc.querySelector('h1, h2, h3, title');
  const headingText = heading ? heading.textContent.trim().replace(/\s+/g, ' ') : '';
  const paragraphs = [];
  const nodes = doc.body ? doc.body.querySelectorAll('p, div, li') : [];
  for (const node of nodes) {
    if (node.querySelector('p, div, li')) continue;
    const t = node.textContent.replace(/\s+/g, ' ').trim();
    if (t.length > 1) paragraphs.push(t);
  }
  if (!paragraphs.length && doc.body) {
    const text = doc.body.textContent || '';
    const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (const line of lines) {
      if (line.length > 1) paragraphs.push(line);
    }
  }
  const title = headingText || fallbackTitle || '未命名章节';
  return { title: title.slice(0, 60), paragraphs };
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
            type: el.getAttribute('media-type') || ''
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
    }
  }

  if (!ordered.length) {
    for (const name of zip.entries.keys()) {
      if (/\.(x?html?|htm)$/i.test(name)) ordered.push(name);
    }
    ordered.sort();
  }

  const chapters = [];
  for (const path of ordered.slice(0, 320)) {
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
    const chapter = htmlToChapter(html, path.split('/').pop());
    const plain = chapter.paragraphs.join('');
    if (plain.length < 2) continue;
    if (TOC_RE.test(chapter.title.trim()) && plain.length < 200) continue;
    if (/^(cover|titlepage|copyright|nav|toc)$/i.test(path.split('/').pop().replace(/\.x?html?$/i, ''))) continue;
    chapters.push(chapter);
  }

  if (!chapters.length) throw new Error('EMPTY_EPUB');

  return {
    title: title || fallbackTitle || '未命名作品',
    author,
    format: 'epub',
    chapters
  };
}