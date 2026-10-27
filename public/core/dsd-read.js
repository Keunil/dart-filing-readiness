
import { entryBytes, readZip } from './dsd-xlsx.js';

const utf8 = new TextDecoder('utf-8');

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** 아는 엔터티만 푼다. DART 줄바꿈 `&cr;`는 글로 남긴다(textOf가 줄바꿈으로 바꾼다). */
function decode(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : m;
    }
    const key = e.toLowerCase();
    return key in ENTITY ? ENTITY[key] : m;
  });
}

function parseAttrs(src) {
  const attrs = {};
  if (!src) return attrs;
  for (const m of src.matchAll(/([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toUpperCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

const TAG = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\/([A-Za-z][\w.:-]*)\s*>|<([A-Za-z][\w.:-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;

/** 요소 = {tag, attrs, children(요소 또는 글), parent}. 영문자로 시작하지 않는 `<당반기>` 같은 것은 글로 둔다. 짝 없는 닫는 태그는 버린다. */
export function parseXml(text) {
  const root = { tag: '#ROOT', attrs: {}, children: [], parent: null };
  let node = root, last = 0;
  const add = (s) => { if (s) node.children.push(s); };
  TAG.lastIndex = 0;
  for (let m; (m = TAG.exec(text));) {
    if (m.index > last) add(decode(text.slice(last, m.index)));
    last = TAG.lastIndex;
    if (m[1] !== undefined) add(m[1]);
    else if (m[2]) {
      const tag = m[2].toUpperCase();
      let open = node;
      while (open !== root && open.tag !== tag) open = open.parent;
      if (open !== root) node = open.parent;
    } else if (m[3]) {
      const el = { tag: m[3].toUpperCase(), attrs: parseAttrs(m[4]), children: [], parent: node };
      node.children.push(el);
      if (!m[5]) node = el;
    }
  }
  if (last < text.length) add(decode(text.slice(last)));
  return root;
}

const isEl = (x) => typeof x === 'object' && x !== null;
export const kids = (node, tag) => (node?.children || []).filter((c) => isEl(c) && (!tag || c.tag === tag));
export function find(node, tag) {
  for (const c of node?.children || []) {
    if (!isEl(c)) continue;
    if (c.tag === tag) return c;
    const hit = find(c, tag);
    if (hit) return hit;
  }
  return null;
}
export function findAll(node, tag, out = []) {
  for (const c of node?.children || []) {
    if (!isEl(c)) continue;
    if (c.tag === tag) out.push(c);
    findAll(c, tag, out);
  }
  return out;
}

const NOT_TEXT = new Set(['COMMENT', 'LIBRARYLIST', 'FILENAME', 'WARNING', 'EXTRACTION', 'DOCUMENT-HEADER']);

/** 요소의 글. 원문 줄바꿈·탭은 칸으로, DART 줄바꿈(&cr;)은 \n으로. 줄마다 칸을 하나로 줄인다. */
export function textOf(node) {
  const parts = [];
  (function walk(n) {
    for (const c of n.children) {
      if (typeof c === 'string') parts.push(c);
      else if (!NOT_TEXT.has(c.tag)) walk(c);
    }
  })(node);
  return parts.join('').replace(/[\r\n\t]+/g, ' ').replace(/&cr;/gi, '\n')
    .split('\n').map((line) => line.replace(/[  　]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 칸 없이(제목 "재 무 상 태 표" 비교용). */
export const tight = (s) => String(s ?? '').replace(/[\s 　]+/g, '');
/** 한 줄로. */
export const flat = (s) => String(s ?? '').replace(/[\s 　]+/g, ' ').trim();

/** 제목 자체 또는 제목 뒤 구분자. '검토의견에는...' 같은 본문 문장과 구분한다. */
export function isHeadingLine(text, title) {
  const value = tight(text), head = tight(title);
  return !!head && (value === head || value.startsWith(head) && /^[:：\-\u2013\u2014]/.test(value.slice(head.length))); // 줄표 허용
}

/** ClsDSDText.Paragraphs와 같은 읽기 경계: 문단을 합치지 않고 원래 블록/줄 위치를 보존한다. */
export function paragraphsOf(block) {
  return String(block?.text ?? '').split(/\r\n|\r|\n/).map((text, index) => ({
    text: text.replace(/[\t 　]/g, ' ').replace(/^ +| +$/g, ''), block: block?.i, line: index + 1,
  })).filter((p) => p.text);
}

/** 칸 금액. 괄호·△·-는 음수, 단독 '-'는 0. 숫자가 아니면 null. 원문 그대로 반올림하지 않는다. */
export function parseAmount(text) {
  let s = tight(text);
  if (!s) return null;
  if (/^[-–—]$/.test(s)) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/^[△▲-]/.test(s)) { neg = true; s = s.slice(1); }
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return neg ? -n : n;
}

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (y, m, d) => `${y}${pad(m)}${pad(d)}`;
/** 'YYYYMMDD' → '2025년 12월 31일'. */
export const dateText = (s) => (/^\d{8}$/.test(s || '') ? `${s.slice(0, 4)}년 ${Number(s.slice(4, 6))}월 ${Number(s.slice(6, 8))}일` : String(s || ''));

/** 글 속 날짜를 'YYYYMMDD'로(문서 순서). '2025년 12월 31일', '2025.12.31', '2025-12-31'. */
export function findDates(text) {
  const out = [];
  const re = /(\d{4})\s*(?:년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일|[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2}))/g;
  for (const m of String(text || '').matchAll(re)) {
    const y = Number(m[1]), mo = Number(m[2] ?? m[4]), d = Number(m[3] ?? m[5]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.push({ date: ymd(y, mo, d), text: m[0], index: m.index });
  }
  return out;
}

const CELL = new Set(['TD', 'TH', 'TE', 'TU']);

/** 이 표 자신의 행(안에 든 표의 행은 빼고). */
function ownRows(table) {
  const rows = [];
  for (const c of kids(table)) {
    if (c.tag === 'TR') rows.push(c);
    else if (c.tag === 'THEAD' || c.tag === 'TBODY' || c.tag === 'TFOOT') rows.push(...kids(c, 'TR'));
  }
  return rows;
}

/** 표 → 칸 격자. 칸 = {tag, text, acode, aunit, value, colspan, rowspan, col, node}. col은 병합을 반영한 시작 열. */
export function tableGrid(table) {
  const taken = [];
  return ownRows(table).map((tr, r) => {
    const row = [];
    let col = 0;
    for (const td of kids(tr)) {
      if (!CELL.has(td.tag)) continue;
      while (taken[r]?.[col]) col++;
      const colspan = Math.max(1, Number(td.attrs.COLSPAN) || 1), rowspan = Math.max(1, Number(td.attrs.ROWSPAN) || 1);
      for (let rr = r; rr < r + rowspan; rr++) for (let cc = col; cc < col + colspan; cc++) (taken[rr] ||= [])[cc] = true;
      row.push({ tag: td.tag, text: textOf(td), acode: td.attrs.ACODE || '', aunit: td.attrs.AUNIT || '', value: td.attrs.AUNITVALUE ?? '',
        colspan, rowspan, col, node: td });
      col += colspan;
    }
    return row;
  });
}

/** SECTION-1 제목 → 구역. 칸을 뺀 제목으로 본다. */
function partOfTitle(title, parent) {
  const t = tight(title);
  if (/(?:감사인의)?(?:감사|검토)보고서$/.test(t) && !t.includes('내부회계')) return 'audit';
  if (t.includes('내부회계관리제도')) return 'icfr';
  if (t.includes('외부감사실시내용')) return 'external';
  if (t.includes('부속명세서')) return 'appendix';
  if (parent === 'SECTION-2' && t === '주석') return 'notes';
  if (/^\(첨부\)/.test(t) && t.includes('재무제표')) return 'fs';
  return null;
}

/** contents.xml(글) + meta.xml(글)로 문서 모형을 만든다. */
export function buildDoc(contentsXml, metaXml = '', info = {}) {
  const xml = parseXml(contentsXml);
  const docEl = find(xml, 'DOCUMENT') || xml;
  const head = find(docEl, 'DOCUMENT-HEADER');
  const body = find(docEl, 'BODY');
  if (!body) throw new Error('DSD 본문(BODY)을 찾을 수 없습니다.');

  const nameEl = find(head, 'DOCUMENT-NAME'), companyEl = find(head, 'COMPANY-NAME'), versionEl = find(head, 'FORMULA-VERSION');
  const summary = {};
  for (const e of findAll(find(head, 'SUMMARY'), 'EXTRACTION')) if (e.attrs.ACODE) summary[e.attrs.ACODE] = textOf(e);
  const header = {
    docName: nameEl ? textOf(nameEl) : '', docCode: nameEl?.attrs.ACODE || '',
    formVersion: versionEl ? textOf(versionEl) : '', formSub: versionEl?.attrs.SUBVER || '', formDate: versionEl?.attrs.ADATE || '',
    company: companyEl ? textOf(companyEl) : '',
    regcik: companyEl?.attrs.AREGCIK || '', summary,
  };

  const metaXmlEl = metaXml ? parseXml(metaXml) : null;
  const pick = (tag, attr) => find(metaXmlEl, tag)?.attrs[attr] ?? '';
  const meta = {
    editver: pick('GENERATOR', 'EDITVER'), docver: pick('DOCUMENT-INFO', 'DOCVER'), docId: pick('DOCUMENT-INFO', 'DOC-ID'),
    regcik: pick('DOCUMENT-HEADER', 'REGCIK'), regname: pick('DOCUMENT-HEADER', 'REGNAME'),
    images: findAll(metaXmlEl, 'IMG').map((i) => i.attrs.FILENAME || ''),
  };

  const blocks = [], tables = [], insertions = [];
  let part = 'front';
  const titles = [];

  const addBlock = (kind, node, extra = {}) => {
    const block = { i: blocks.length, kind, node, part, section: titles.at(-1) || '', text: textOf(node), ...extra };
    blocks.push(block);
    return block;
  };

  function addTable(node, group, nested) {
    const block = addBlock('table', node, { nested, aclass: node.attrs.ACLASS || '', group: group || '', border: node.attrs.BORDER || '' });
    block.grid = tableGrid(node);
    tables.push(block);
    for (const row of block.grid) for (const cell of row) walkInline(cell.node, group);
    return block;
  }

  function walkInline(node, group) {
    for (const c of kids(node)) {
      if (c.tag === 'TABLE') addTable(c, group, true);
      else walkInline(c, group);
    }
  }

  function walk(node, group = '') {
    for (const c of kids(node)) {
      switch (c.tag) {
        case 'COMMENT': case 'LIBRARYLIST': case 'FILENAME': case 'WARNING': case 'EXTRACTION': case 'DOCUMENT-HEADER':
          break;
        case 'INSERTION': {
          const ins = { comment: textOf(find(c, 'COMMENT') || { children: [] }), list: textOf(find(c, 'LIBRARYLIST') || { children: [] }),
            inserted: !!find(c, 'LIBRARY'), start: blocks.length, part };
          insertions.push(ins);
          walk(c, group);
          ins.end = blocks.length;
          break;
        }
        case 'COVER': case 'TOC': {
          const saved = part;
          part = c.tag === 'COVER' ? 'cover' : 'toc';
          walk(c, group);
          part = saved;
          break;
        }
        case 'SECTION-1': case 'SECTION-2': case 'SECTION-3': case 'PART': {
          const saved = part;
          const titleEl = kids(c, 'TITLE')[0];
          const next = titleEl ? partOfTitle(textOf(titleEl), c.tag) : null;
          if (next) part = next;
          walk(c, group);
          if (next && c.tag !== 'SECTION-1') part = saved;
          break;
        }
        case 'TITLE': case 'COVER-TITLE': {
          const block = addBlock('title', c, { level: node.tag });
          titles.push(block.text);
          break;
        }
        case 'P':
          addBlock('p', c);
          walkInline(c, group);
          break;
        case 'TABLE':
          addTable(c, group, false);
          break;
        case 'TABLE-GROUP':
          walk(c, c.attrs.ACLASS || group);
          break;
        case 'IMAGE': case 'IMG': {
          const img = c.tag === 'IMG' ? c : find(c, 'IMG');
          addBlock('image', c, { file: img ? (img.attrs.FILENAME || textOf(img)) : textOf(c) });
          break;
        }
        case 'APPENDIX': {
          const file = textOf(find(c, 'FILENAME') || { children: [] }).trim();
          if (file) addBlock('image', c, { file, appendix: c.attrs.ATYPE || 'PDF', text: textOf(find(c, 'DESCRIPTION') || { children: [] }) });
          break;
        }
        case 'PGBRK':
          break;
        default:
          walk(c, group);
      }
    }
  }
  walk(body);
  const seen = new Set(), colors = [];
  const ownColor = (n) => /(?:^|\s)0X[0-9A-F]{6}(?:\s|$)/i.test(n.attrs?.USERMARK || '');
  const inherited = (n) => ({ ...n, children: (n.children || []).flatMap((c) => !isEl(c) ? [c] : ownColor(c) ? [] : [inherited(c)]) });
  for (const block of blocks) {
    (function scan(n) {
      if (!isEl(n) || seen.has(n)) return;
      seen.add(n);
      const mark = n.attrs?.USERMARK;
      const text = mark && ownColor(n) ? textOf(inherited(n)) : '';
      if (/[^\s 　]/.test(text)) {
        for (const token of mark.split(/\s+/)) {
          const m = /^0X([0-9A-F]{6})$/i.exec(token);
          if (m && m[1].toUpperCase() !== '000000') colors.push({ color: `#${m[1].toUpperCase()}`, text, block: block.i });
        }
      }
      for (const c of n.children || []) if (isEl(c) && !(c.tag === 'TABLE' && n !== block.node)) scan(c);
    })(block.node);
  }

  return { name: info.name || '', size: info.size || 0, sha256: info.sha256 || '', header, meta, body, blocks, tables, insertions, colors, images: [] };
}

const IMAGE_TYPE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp' };

/** ZIP 항목 이름. UTF-8 표시가 없으면 CP949(DART 편집기)로 푼다. */
function entryName(entry) {
  if (entry.flags & 0x0800 || !entry.rawName) return entry.name;
  try {
    return new TextDecoder('euc-kr', { fatal: true }).decode(entry.rawName);
  } catch {
    return entry.name;
  }
}

async function sha256(bytes) {
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

/** .dsd 파일 바이트 → 문서 모형. */
export async function readDsd(buffer, name = '') {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let entries;
  try {
    entries = readZip(bytes);
  } catch {
    throw new Error('DSD 파일이 아닙니다. DART 편집기에서 저장한 .dsd 파일을 올려 주세요.');
  }
  const byName = (n) => entries.find((e) => e.name.toLowerCase() === n);
  const contents = byName('contents.xml');
  if (!contents) throw new Error('DSD 파일을 읽을 수 없습니다(contents.xml 없음).');
  const metaEntry = byName('meta.xml');
  const contentsXml = utf8.decode(await entryBytes(contents));
  const metaXml = metaEntry ? utf8.decode(await entryBytes(metaEntry)) : '';
  const doc = buildDoc(contentsXml, metaXml, { name, size: bytes.length, sha256: await sha256(bytes) });
  for (const entry of entries) {
    const file = entryName(entry), type = IMAGE_TYPE[file.split('.').pop().toLowerCase()];
    if (!type) continue;
    try {
      doc.images.push({ name: file, type, bytes: await entryBytes(entry) });
    } catch { /* 깨진 그림은 빼고 본문만 본다 */ }
  }
  return doc;
}
