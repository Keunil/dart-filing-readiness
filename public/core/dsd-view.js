
import { find, kids } from './dsd-read.js';

const SKIP = new Set(['COMMENT', 'LIBRARYLIST', 'FILENAME', 'WARNING', 'EXTRACTION', 'DOCUMENT-HEADER', 'IMG-CAPTION']);
const CELL = new Set(['TD', 'TH', 'TE', 'TU']);
/** 종이 기본 폭(px). 쪽(PGBRK 사이)에 이보다 넓은 표가 있으면 그 쪽만 표 폭까지 넓힌다. */
const PAGE = 600;

/** 표의 원래 폭(px): TABLE WIDTH와 COL 폭 합 중 큰 것(표 고정 배치에서는 둘 중 큰 쪽으로 그려진다). */
function naturalWidth(node) {
  const cols = kids(node).filter((s) => s.tag === 'COLGROUP').flatMap((s) => kids(s, 'COL'));
  return Math.max(Number(node.attrs.WIDTH) || 0, cols.reduce((a, c) => a + (Number(c.attrs.WIDTH) || 0), 0));
}

/** USERMARK → CSS (SR_FileDSD.GetStyleText). */
export function styleOf(node, { span = false, noBack = false } = {}) {
  const mark = node.attrs?.USERMARK;
  if (!mark) return '';
  const css = [];
  let fontSize = false;
  for (const token of mark.split(/\s+/).filter(Boolean)) {
    if (token === 'B') css.push('font-weight:bold');
    else if (token === 'BI' || token === 'IB') css.push('font-weight:bold', 'font-style:italic');
    else if (token === 'I') css.push('font-style:italic');
    else if (token === 'U') css.push('text-decoration:underline');
    else if (token === '!B') css.push('font-weight:normal');
    else if (token === '!I') css.push('font-style:normal');
    else if (token === '!U') css.push('text-decoration:none');
    else if (token === 'A-C') css.push('text-align:center');
    else if (token === 'A-R') css.push('text-align:right');
    else if (token === 'A-L') css.push('text-align:left');
    else if (/^BC0X[0-9A-F]{6}$/i.test(token)) { if (!noBack) css.push(`background-color:#${token.slice(4)}`); }
    else if (/^0X[0-9A-F]{6}$/i.test(token)) css.push(`color:#${token.slice(2)}`);
    else {
      const m = /^F-([A-Z]*)(\d+)$/.exec(token);
      if (m) {
        if (m[1] === 'BT') css.push("font-family:'Batang','바탕',serif");
        if (m[1] === 'GL') css.push("font-family:'Gulim','굴림',sans-serif");
        css.push(`font-size:${(Number(m[2]) * 1.2).toFixed(1)}px`);
        fontSize = true;
      }
    }
  }
  if (span && fontSize) css.push('line-height:1.6em');
  return css.join(';');
}

/** 문서를 그린다. images: 파일 이름 → 그림 주소(blob:). 반환: {root, byBlock: Map(블록 번호 → 요소)}. */
export function renderDsd(doc, { images = new Map() } = {}) {
  const index = new Map(doc.blocks.map((b) => [b.node, b.i]));
  const byBlock = new Map();
  const make = (tag, cls, style) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (style) el.setAttribute('style', style);
    return el;
  };
  const register = (node, el) => {
    const i = index.get(node);
    if (i !== undefined) { byBlock.set(i, el); el.dataset.block = String(i); }
    return el;
  };

  /** 글: 원문 줄바꿈·탭은 버리고(태그 사이 들여쓰기), DART 줄바꿈 &cr;는 <br>. 칸은 그대로 둔다(white-space: pre-wrap). */
  function text(target, value) {
    const s = /^[\s]*$/.test(value) ? value.replace(/[\r\n\t]+/g, '') : value.replace(/[\r\n\t]+/g, ' ');
    s.split(/&cr;/i).forEach((part, k) => {
      if (k) target.append(document.createElement('br'));
      if (part) target.append(document.createTextNode(part));
    });
  }

  function inline(node, target) {
    for (const c of node.children) {
      if (typeof c === 'string') { text(target, c); continue; }
      if (SKIP.has(c.tag)) continue;
      if (c.tag === 'SPAN') { const span = make('span', null, styleOf(c, { span: true })); inline(c, span); target.append(span); }
      else if (c.tag === 'P') target.append(register(c, paragraph(c)));
      else if (c.tag === 'TABLE') target.append(register(c, table(c, true)));
      else if (c.tag === 'IMAGE') target.append(register(c, image(c)));
      else inline(c, target);
    }
  }

  function paragraph(node) {
    const p = make('p', 'dv-p', styleOf(node));
    inline(node, p);
    if (!p.childNodes.length) p.append(document.createElement('br'));
    return p;
  }

  function title(node, parentTag) {
    const level = /^SECTION-/.test(parentTag) ? parentTag.toLowerCase() : node.tag === 'COVER-TITLE' ? 'cover-title' : parentTag === 'TOC' ? 'toc' : 'section-1';
    const p = make('p', `dv-title is-${level}`, styleOf(node));
    inline(node, p);
    return p;
  }

  /**
   * 표: 원래 폭(px)으로 그리되 원문 칸보다 넓으면 칸 폭까지 줄인다(사용자 2026-10-15: 옆으로 넘겨 보기 힘듦).
   * 칸 너비는 비율(%)이라 표가 줄어도 칸 비율은 원문 그대로다. 칸 안에 든 표(nested)는 칸 폭에 맞춘다.
   */
  function table(node, nested = false) {
    const border = node.attrs.BORDER && node.attrs.BORDER !== '0';
    const width = naturalWidth(node);
    const t = make('table', `dv-table${border ? ' has-border' : ''}`, width ? (nested ? 'width:100%' : `width:min(${width}px,100%)`) : '');
    for (const section of kids(node)) {
      if (section.tag === 'COLGROUP') {
        const group = make('colgroup');
        const cols = kids(section, 'COL');
        const sum = cols.reduce((a, c) => a + (Number(c.attrs.WIDTH) || 0), 0);
        for (const col of cols) {
          const c = make('col');
          const w = Number(col.attrs.WIDTH);
          if (w && sum) c.style.width = `${(w / sum) * 100}%`;
          group.append(c);
        }
        t.append(group);
      } else if (section.tag === 'THEAD' || section.tag === 'TBODY' || section.tag === 'TR') {
        const body = section.tag === 'TR' ? t.tBodies[0] || t.appendChild(make('tbody')) : t.appendChild(make(section.tag.toLowerCase()));
        for (const tr of section.tag === 'TR' ? [section] : kids(section, 'TR')) {
          const row = make('tr');
          for (const cell of kids(tr)) {
            if (!CELL.has(cell.tag)) continue;
            const td = make(cell.tag === 'TH' ? 'th' : 'td', cell.tag === 'TU' ? 'is-tu' : null, styleOf(cell, { noBack: cell.tag === 'TH' }));
            if (Number(cell.attrs.COLSPAN) > 1) td.colSpan = Number(cell.attrs.COLSPAN);
            if (Number(cell.attrs.ROWSPAN) > 1) td.rowSpan = Number(cell.attrs.ROWSPAN);
            const align = (cell.attrs.ALIGN || '').toLowerCase();
            if (['left', 'center', 'right', 'justify'].includes(align)) td.style.textAlign = align;
            const valign = (cell.attrs.VALIGN || '').toLowerCase();
            td.style.verticalAlign = valign === 'middle' ? 'middle' : valign === 'bottom' ? 'bottom' : 'top';
            inline(cell, td);
            row.append(td);
          }
          body.append(row);
        }
      }
    }
    return t;
  }

  function image(node) {
    const img = node.tag === 'IMG' ? node : find(node, 'IMG');
    const name = img ? (img.attrs.FILENAME || img.children.filter((c) => typeof c === 'string').join('').trim()) : '';
    const url = images.get(name);
    if (!url) {
      const box = make('div', 'dv-image is-missing');
      box.textContent = `그림: ${name || '(이름 없음)'}`;
      return box;
    }
    const wrap = make('div', 'dv-image');
    const el = make('img');
    el.src = url;
    el.alt = name;
    const w = Number(img?.attrs.WIDTH), h = Number(img?.attrs.HEIGHT);
    if (w && h) { const scale = Math.min(1, 600 / w); el.width = Math.round(w * scale); el.height = Math.round(h * scale); }
    wrap.append(el);
    return wrap;
  }
  const root = make('div', 'dv-page');
  let sheet = null, widest = PAGE;
  const openSheet = () => { sheet = root.appendChild(make('div', 'dv-sheet')); widest = PAGE; };
  const closeSheet = () => { if (widest > PAGE) sheet.style.width = `${widest}px`; };

  function blocks(node) {
    for (const c of kids(node)) {
      if (SKIP.has(c.tag)) continue;
      switch (c.tag) {
        case 'P': sheet.append(register(c, paragraph(c))); break;
        case 'TITLE': case 'COVER-TITLE': sheet.append(register(c, title(c, node.tag))); break;
        case 'TABLE': widest = Math.max(widest, naturalWidth(c)); sheet.append(register(c, table(c))); break;
        case 'IMAGE': sheet.append(register(c, image(c))); break;
        case 'PGBRK': closeSheet(); root.append(make('hr', 'dv-pgbrk')); openSheet(); break;
        default: blocks(c);
      }
    }
  }

  openSheet();
  blocks(doc.body);
  closeSheet();
  return { root, byBlock };
}

/** 요소 안에서 글(칸 무시)을 찾아 Range로. 없으면 null. */
export function rangeOf(el, quote) {
  const want = String(quote || '').replace(/\s+/g, '');
  if (!want) return null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const map = [];
  let compact = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const v = n.nodeValue;
    for (let i = 0; i < v.length; i++) if (!/\s/.test(v[i])) { map.push([n, i]); compact += v[i]; }
  }
  const at = compact.indexOf(want);
  if (at < 0) return null;
  const [sn, so] = map[at], [en, eo] = map[at + want.length - 1];
  const range = document.createRange();
  range.setStart(sn, so);
  range.setEnd(en, eo + 1);
  return range;
}
