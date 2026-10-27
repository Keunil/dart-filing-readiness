
export const TAB_COLOR = 'FFFD5108';   // PwC Orange 500

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const asBytes = (buffer) => (buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
const utf8 = new TextDecoder('utf-8');
const encoder = new TextEncoder();

/** 중앙 디렉터리로 읽는다. 크기는 중앙 디렉터리 값을 쓴다(데이터 설명자를 쓴 항목도 맞게). */
export function readZip(buffer) {
  const bytes = asBytes(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xFFFF); i--) {
    if (view.getUint32(i, true) === 0x06054B50) { end = i; break; }
  }
  if (end < 0) throw new Error('엑셀 파일(ZIP)이 아닙니다.');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (count === 0xFFFF || at === 0xFFFFFFFF) throw new Error('4GB가 넘는 파일은 지원하지 않습니다.');
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014B50) throw new Error('ZIP 목록이 깨졌습니다.');
    const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true);
    const time = view.getUint16(at + 12, true), date = view.getUint16(at + 14, true);
    const crc = view.getUint32(at + 16, true), csize = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true), extraLen = view.getUint16(at + 30, true), commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    if (csize === 0xFFFFFFFF || size === 0xFFFFFFFF || offset === 0xFFFFFFFF) throw new Error('4GB가 넘는 파일은 지원하지 않습니다.');
    const name = utf8.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    if (offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034B50) throw new Error(`ZIP 항목이 깨졌습니다: ${name}`);
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    if (start + csize > bytes.length) throw new Error(`ZIP 항목이 잘렸습니다: ${name}`);
    entries.push({ name, rawName: bytes.subarray(at + 46, at + 46 + nameLen), method, flags, time, date, crc, size, csize, raw: bytes.subarray(start, start + csize) });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function pipe(bytes, transform, maxBytes = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('ZIP 해제 크기가 허용 범위를 넘습니다.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const out = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

/** 항목의 풀린 바이트. 0 = 저장, 8 = deflate. */
export async function entryBytes(entry) {
  let data;
  if (entry.method === 0) data = entry.raw.slice();
  else if (entry.method === 8) data = await pipe(entry.raw, new DecompressionStream('deflate-raw'), Math.min(entry.size, 80 * 1024 * 1024));
  else throw new Error(`지원하지 않는 압축 방식입니다(${entry.method}): ${entry.name}`);
  if (data.length !== entry.size || crc32(data) !== entry.crc) throw new Error(`ZIP 항목이 깨졌습니다: ${entry.name}`);
  return data;
}

const entryText = async (entry) => utf8.decode(await entryBytes(entry));

function dosNow() {
  const d = new Date();
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
           date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

/** files: readZip 항목(압축 바이트를 그대로 옮긴다) 또는 {name, data[, time, date]}(새로 압축한다). 준 순서대로 쓴다. */
export async function writeZip(files) {
  const now = dosNow();
  const items = [];
  for (const file of files) {
    const name = encoder.encode(file.name);
    const unicode = /[^\x00-\x7F]/.test(file.name) ? 0x0800 : 0;
    if (file.raw) {
      items.push({ name, flags: (file.flags & 0x0006) | unicode, method: file.method, time: file.time, date: file.date,
        crc: file.crc, size: file.size, raw: file.raw });
    } else {
      const data = typeof file.data === 'string' ? encoder.encode(file.data) : asBytes(file.data);
      items.push({ name, flags: unicode, method: 8, time: file.time ?? now.time, date: file.date ?? now.date,
        crc: crc32(data), size: data.length, raw: await pipe(data, new CompressionStream('deflate-raw')) });
    }
  }
  if (items.length >= 0xFFFF) throw new Error('파일 항목이 너무 많습니다.');
  let total = 22;
  for (const it of items) total += 30 + 46 + 2 * it.name.length + it.raw.length;
  if (total > 0xFFFFFFFF) throw new Error('4GB가 넘는 파일은 지원하지 않습니다.');
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const it of items) {
    it.offset = at;
    view.setUint32(at, 0x04034B50, true);
    view.setUint16(at + 4, 20, true);
    view.setUint16(at + 6, it.flags, true);
    view.setUint16(at + 8, it.method, true);
    view.setUint16(at + 10, it.time, true);
    view.setUint16(at + 12, it.date, true);
    view.setUint32(at + 14, it.crc, true);
    view.setUint32(at + 18, it.raw.length, true);
    view.setUint32(at + 22, it.size, true);
    view.setUint16(at + 26, it.name.length, true);
    view.setUint16(at + 28, 0, true);
    out.set(it.name, at + 30);
    out.set(it.raw, at + 30 + it.name.length);
    at += 30 + it.name.length + it.raw.length;
  }
  const dirStart = at;
  for (const it of items) {
    view.setUint32(at, 0x02014B50, true);
    view.setUint16(at + 4, 20, true);
    view.setUint16(at + 6, 20, true);
    view.setUint16(at + 8, it.flags, true);
    view.setUint16(at + 10, it.method, true);
    view.setUint16(at + 12, it.time, true);
    view.setUint16(at + 14, it.date, true);
    view.setUint32(at + 16, it.crc, true);
    view.setUint32(at + 20, it.raw.length, true);
    view.setUint32(at + 24, it.size, true);
    view.setUint16(at + 28, it.name.length, true);
    view.setUint32(at + 42, it.offset, true);   // 나머지(덧붙임·주석·디스크·속성)는 0
    out.set(it.name, at + 46);
    at += 46 + it.name.length;
  }
  view.setUint32(at, 0x06054B50, true);
  view.setUint16(at + 8, items.length, true);
  view.setUint16(at + 10, items.length, true);
  view.setUint32(at + 12, at - dirStart, true);
  view.setUint32(at + 16, dirStart, true);
  return out;
}

const xmlText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xmlUnescape = (s) => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
  const k = e.toLowerCase();
  if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : Number(k.slice(1)));
  return { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[k];
});
const prefixOf = (xml, root) => new RegExp(`<([\\w.-]+:)?${root}[\\s/>]`).exec(xml)?.[1] || '';
const attrsOf = (text) => Object.fromEntries([...text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1], xmlUnescape(m[2] ?? m[3])]));

/** 시트 탭 색. <sheetPr>는 <worksheet>의 첫 자식, <tabColor>는 <sheetPr>의 첫 자식이다. */
export function setTabColor(sheetXml, rgb) {
  const p = prefixOf(sheetXml, 'worksheet');
  const color = `<${p}tabColor rgb="${xmlText(rgb)}"/>`;
  const self = new RegExp(`<${p}sheetPr\\b([^>]*?)\\s*/>`);
  if (self.test(sheetXml)) return sheetXml.replace(self, (m, attrs) => `<${p}sheetPr${attrs}>${color}</${p}sheetPr>`);
  const open = new RegExp(`<${p}sheetPr\\b[^>]*>`).exec(sheetXml);
  if (open) {
    const closeAt = sheetXml.indexOf(`</${p}sheetPr>`, open.index);
    if (closeAt < 0) throw new Error('시트 XML이 깨졌습니다.');
    const startAt = open.index + open[0].length;
    const inner = sheetXml.slice(startAt, closeAt)
      .replace(new RegExp(`<${p}tabColor\\b[^>]*?/>|<${p}tabColor\\b[^>]*>[\\s\\S]*?</${p}tabColor>`, 'g'), '');
    return sheetXml.slice(0, startAt) + color + inner + sheetXml.slice(closeAt);
  }
  const root = new RegExp(`<${p}worksheet\\b[^>]*>`).exec(sheetXml);
  if (!root || root[0].endsWith('/>')) throw new Error('워크시트 XML이 아닙니다.');
  const at = root.index + root[0].length;
  return `${sheetXml.slice(0, at)}<${p}sheetPr>${color}</${p}sheetPr>${sheetXml.slice(at)}`;
}

/** 경로 이어 붙이기(../ 풀기). */
function joinPart(dir, target) {
  if (target.startsWith('/')) return target.slice(1);
  const out = dir.split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return out.join('/');
}

/** 시트 이름 → 부분 경로(xl/worksheets/sheet3.xml). dir은 workbook.xml이 있는 폴더. */
export function sheetParts(workbookXml, relsXml, dir = 'xl/') {
  const targets = new Map();
  for (const m of relsXml.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)>/g)) {
    const a = attrsOf(m[1]);
    if (a.Id && a.Target && a.TargetMode !== 'External') targets.set(a.Id, joinPart(dir, a.Target));
  }
  const parts = new Map();
  for (const m of workbookXml.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*)>/g)) {
    const a = attrsOf(m[1]);
    const id = Object.entries(a).find(([k]) => /(^|:)id$/.test(k) && k !== 'sheetId')?.[1];
    if (a.name !== undefined && id && targets.has(id)) parts.set(a.name, targets.get(id));
  }
  return parts;
}

/** sharedStrings.xml → 글자 배열(서식 조각 <r><t>는 이어 붙인다, 읽기 표시 <rPh>는 뺀다). */
export function sharedStrings(xml) {
  return [...xml.matchAll(/<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>/g)].map((m) => {
    const body = m[1].replace(/<(?:[\w.-]+:)?rPh\b[\s\S]*?<\/(?:[\w.-]+:)?rPh>/g, '');
    return [...body.matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g)].map((t) => xmlUnescape(t[1])).join('');
  });
}

const CELL_RE = /<(?:[\w.-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/g;
const colOf = (ref) => /^[A-Z]+/.exec(ref)?.[0] || '';
const colNumber = (col) => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/** 셀 하나의 보이는 값(글자). 공유 문자열·셀 안 글자·숫자·논리값. */
function cellValue(attrs, inner, strings) {
  const a = attrsOf(attrs);
  if (a.t === 'inlineStr') return [...(inner || '').matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g)].map((t) => xmlUnescape(t[1])).join('');
  const v = /<(?:[\w.-]+:)?v>([\s\S]*?)<\/(?:[\w.-]+:)?v>/.exec(inner || '')?.[1];
  if (v === undefined) return '';
  if (a.t === 's') return strings[Number(v)] ?? '';
  return xmlUnescape(v);
}

/** 시트 XML → 행 번호 → {열: 글자}. */
export function sheetRows(sheetXml, strings = []) {
  const rows = new Map();
  for (const m of sheetXml.matchAll(/<(?:[\w.-]+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?row>)/g)) {
    const r = Number(attrsOf(m[1]).r);
    const cells = {};
    for (const c of (m[2] || '').matchAll(CELL_RE)) {
      const ref = attrsOf(c[1]).r;
      if (ref) cells[colOf(ref)] = cellValue(c[1], c[2], strings);
    }
    if (r) rows.set(r, cells);
  }
  return rows;
}

/**
 * 셀 하나에 글자를 쓴다(셀 안 글자 inlineStr, 서식 s 등 다른 속성은 그대로). 빈 글자면 값을 지우고 서식만 남긴다.
 * 셀이 없으면 행 안에 열 순서대로 넣는다. 행이 없거나 그 셀에 수식이 있으면 오류(총괄표 행은 스마트리뷰어가 만든다).
 */
export function setCellText(sheetXml, ref, text) {
  const p = prefixOf(sheetXml, 'worksheet');
  const row = Number(/\d+$/.exec(ref)[0]);
  const rowRe = new RegExp(`<${p}row\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${p}row>)`, 'g');
  let found = false;
  const out = sheetXml.replace(rowRe, (whole, attrs, inner) => {
    if (Number(attrsOf(attrs).r) !== row) return whole;
    found = true;
    const cells = [...(inner || '').matchAll(CELL_RE)];
    const same = cells.find((c) => attrsOf(c[1]).r === ref);
    if (same && /<(?:[\w.-]+:)?f\b/.test(same[2] || '')) throw new Error(`총괄표 ${ref}에 수식이 있어 어사인을 쓰지 않았습니다.`);
    const keep = Object.entries(same ? attrsOf(same[1]) : { r: ref }).filter(([k]) => k !== 't')
      .map(([k, v]) => ` ${k}="${xmlText(v).replace(/"/g, '&quot;')}"`).join('');
    const cell = text ? `<${p}c${keep} t="inlineStr"><${p}is><${p}t xml:space="preserve">${xmlText(text)}</${p}t></${p}is></${p}c>` : `<${p}c${keep}/>`;
    let body;
    if (same) body = inner.replace(same[0], () => cell);
    else {
      const after = cells.find((c) => colNumber(colOf(attrsOf(c[1]).r || '')) > colNumber(colOf(ref)));
      body = after ? (inner || '').replace(after[0], () => cell + after[0]) : (inner || '') + cell;
    }
    return `<${p}row${attrs.replace(/\s*\/$/, '')}>${body}</${p}row>`;
  });
  if (!found) throw new Error(`총괄표에 ${row}행이 없습니다.`);
  return out;
}

/** 탭 색을 지운다(sheetPr 안의 tabColor만). */
export function clearTabColor(sheetXml) {
  const p = prefixOf(sheetXml, 'worksheet');
  return sheetXml.replace(new RegExp(`<${p}tabColor\\b[^>]*?/>|<${p}tabColor\\b[^>]*>[\\s\\S]*?</${p}tabColor>`, 'g'), '');
}

const tabColorOf = (sheetXml) => (attrsOf(/<(?:[\w.-]+:)?tabColor\b([^>]*?)\/?>/.exec(sheetXml)?.[1] || '').rgb || '').toUpperCase();

export const SUMMARY_SHEET = '스마트리뷰어 총괄표';

function relsOf(path) {
  const at = path.lastIndexOf('/');
  return `${path.slice(0, at + 1)}_rels/${path.slice(at + 1)}.rels`;
}

/**
 * 원본 xlsm을 읽는다. 돌려주는 것: { entries, byName, parts(시트 이름 → 부분 경로), version('4.4.0' 등, 없으면 ''),
 * summary: { part, column(Assign 열 글자), rows: [{ row, sheet, title, status, assign, exists }] } }.
 * 총괄표 행은 머리글 'Assign'이 있는 행 다음부터 시트 열(B)이 빌 때까지다.
 */
export async function readBook(buffer) {
  const entries = readZip(buffer);
  const byName = new Map(entries.map((e) => [e.name, e]));
  if (!byName.has('xl/vbaProject.bin')) throw new Error('매크로가 없는 파일입니다. 스마트리뷰어 원본(.xlsm)인지 확인해 주세요.');
  const rootRels = byName.get('_rels/.rels');
  const office = rootRels && [...(await entryText(rootRels)).matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)>/g)]
    .map((m) => attrsOf(m[1])).find((a) => /\/officeDocument$/.test(a.Type || ''));
  const bookPath = office ? joinPart('', office.Target) : 'xl/workbook.xml';
  const book = byName.get(bookPath), bookRels = byName.get(relsOf(bookPath));
  if (!book || !bookRels) throw new Error('workbook.xml을 찾지 못했습니다.');
  const bookXml = await entryText(book);
  const parts = sheetParts(bookXml, await entryText(bookRels), bookPath.slice(0, bookPath.lastIndexOf('/') + 1));
  const part = parts.get(SUMMARY_SHEET);
  if (!part || !byName.has(part)) throw new Error(`'${SUMMARY_SHEET}' 시트가 없습니다. 스마트리뷰어 파일인지 확인해 주세요.`);
  const ssEntry = [...byName.keys()].find((n) => /(^|\/)sharedStrings\.xml$/i.test(n));
  const strings = ssEntry ? sharedStrings(await entryText(byName.get(ssEntry))) : [];
  const rows = sheetRows(await entryText(byName.get(part)), strings);
  let headRow = 0, column = '';
  for (const [r, cells] of rows) {
    const hit = Object.entries(cells).find(([, v]) => /^assign$/i.test(String(v).trim()));
    if (hit) { headRow = r; column = hit[0]; break; }
  }
  if (!headRow) throw new Error(`'${SUMMARY_SHEET}'에서 Assign 머리글을 찾지 못했습니다.`);
  const head = rows.get(headRow);
  const colNamed = (re, fallback) => Object.entries(head).find(([, v]) => re.test(String(v).trim()))?.[0] || fallback;
  const sheetCol = colNamed(/^(시트|sheet)$/i, 'B'), titleCol = colNamed(/^보고서$/, 'C'), statusCol = colNamed(/^status$/i, '');
  const editorCol = colNamed(/^editor$/i, '');   // Status를 마지막으로 바꾼 사람 — Reviewed면 리뷰어
  const list = [];
  for (const r of [...rows.keys()].filter((n) => n > headRow).sort((a, b) => a - b)) {
    const cells = rows.get(r);
    const sheet = String(cells[sheetCol] ?? '').trim();
    if (!sheet) { if (list.length) break; continue; }
    list.push({ row: r, sheet, title: String(cells[titleCol] ?? '').trim(), status: statusCol ? String(cells[statusCol] ?? '').trim() : '',
      editor: editorCol ? String(cells[editorCol] ?? '').trim() : '',
      assign: String(cells[column] ?? '').trim(), exists: parts.has(sheet) });
  }
  if (!list.length) throw new Error(`'${SUMMARY_SHEET}'에 시트 행이 없습니다.`);
  const version = strings.map((t) => /Robotic PA\s*\((\d+(?:\.\d+)+)\)/i.exec(t)?.[1]).find(Boolean) || '';
  return { entries, byName, parts, version, summary: { part, column, rows: list } };
}

/** 파일 이름에 못 쓰는 글자를 _로. */
export function fileSafe(s) {
  return String(s ?? '').replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim()
    .replace(/[. ]+$/, '').replace(/^\.+/, '').slice(0, 60);
}

/**
 * 맡은 시트를 짧게: 재무제표는 이름 그대로(BS, PL, CE, CF), 주석은 첫 번호에만 FN(FN1, 2, 3). 준 순서(총괄표 순서)를 따른다.
 * 60자가 넘으면 이어지는 주석 번호를 '~'로 묶는다(FN1~20).
 */
export function sheetLabel(sheets) {
  const statements = sheets.filter((s) => !/^\d+$/.test(s));
  const notes = sheets.filter((s) => /^\d+$/.test(s)).map(Number);
  const plain = [...statements, ...notes.map((n, i) => (i ? String(n) : `FN${n}`))].join(', ');
  if (plain.length <= 60) return plain;
  const runs = [];
  for (const n of notes) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]);
  }
  return [...statements, ...runs.map(([a, b], i) => `${i ? '' : 'FN'}${a === b ? a : `${a}~${b}`}`)].join(', ');
}

/** 스마트리뷰어_4.4.0_BS, PL, CE, CF, FN1, 2, 3_김철수.xlsm (버전을 모르면 버전 칸을 뺀다). */
export function personFileName(version, sheets, person) {
  const label = sheetLabel(sheets).replace(/[\\/:*?"<>|\x00-\x1F]/g, '_');
  return `${['스마트리뷰어', fileSafe(version), label, fileSafe(person)].filter(Boolean).join('_')}.xlsm`;
}

/** 취합용 원본(어사인 기재본) 이름: 원본 이름 + _어사인. */
export function assignedFileName(originalName) {
  return `${fileSafe(String(originalName || '스마트리뷰어').replace(/\.xlsm$/i, '')) || '스마트리뷰어'}_어사인.xlsm`;
}

/**
 * 총괄표 Assign 열(I)에 배정을 적은 통째 사본. person을 주면 그 사람이 맡은 시트 탭만 주황(TAB_COLOR)으로 칠하고,
 * 맡지 않은 시트 가운데 같은 주황 탭(예: MasterCoA)은 탭 색을 지운다 — 주황 탭 = 내 시트로 보이게(사용자 2026-10-20).
 * assign: 시트 이름 → 담당자 이름(빈 글자면 그 행 Assign을 비운다).
 */
export async function assignedWorkbook(book, assign, person = null) {
  const changed = new Map();
  let summaryXml = await entryText(book.byName.get(book.summary.part));
  for (const row of book.summary.rows) summaryXml = setCellText(summaryXml, `${book.summary.column}${row.row}`, assign[row.sheet] || '');
  changed.set(book.summary.part, summaryXml);
  if (person !== null) {
    const mine = new Set(Object.entries(assign).filter(([, who]) => who === person).map(([sheet]) => sheet));
    for (const [sheet, path] of book.parts) {
      const entry = book.byName.get(path);
      if (!entry) continue;
      const xml = changed.get(path) ?? await entryText(entry);
      if (mine.has(sheet)) changed.set(path, setTabColor(xml, TAB_COLOR));
      else if (tabColorOf(xml) === TAB_COLOR) changed.set(path, clearTabColor(xml));
    }
  }
  const files = book.entries.map((e) => (changed.has(e.name) ? { name: e.name, data: changed.get(e.name), time: e.time, date: e.date } : e));
  return writeZip(files);
}
