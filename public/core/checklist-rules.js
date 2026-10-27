
import { dateText, find, findAll, findDates, flat, isHeadingLine, paragraphsOf, parseAmount, textOf, tight } from './dsd-read.js';

import { isInterimReview, interimResults } from './checklist-interim.js';
import { noteNumberFindings, reportNoteFindings } from './checklist-notes.js';
import { auditHistoryResult } from './checklist-history.js';
import { styleOf } from './dsd-view.js';

/** 사용자 지정 감사인 프로필. engine.js가 점검 직전에 설정한다. */
export const AUDITOR = { name: '가상회계법인', cik: '00999999', address: '서울특별시 중구 가상로 10', ceo: '김가상' };
/** 파일형식 검사(2번) 오류 때 붙이는 공시팀 안내 문구(공시팀 2026-10 추가 요청, 문구 그대로). */
export const FILE_CHECK_GUIDE = 'dsd파일 - 도구메뉴 - 파일형식검사 클릭한 후 하단에 안내된 오류를 모두 해결처리 요청드립니다.';
/**
 * 운영실태보고서가 그림이라 자동 점검이 어려울 때 붙이는 공시팀 안내(공시팀 2026-10 추가 요청 사진 2, 문구 그대로).
 * 링크는 적용 중인 내부회계관리제도 운영실태 보고기준(사용자 2026-10-27). 비우면 글만 보인다.
 */
export const ICFR_GUIDE = { text: '적용 중인 내부회계관리제도 운영실태 보고기준과 원문을 직접 대조하세요.', label: '', href: '' };
/** 최신 서식 버전(DART 편집기 서식 확인 결과). */
export const LATEST_FORM = '6.0';
/** 점검 범위 = 감사보고서(00760)·연결감사보고서(00761)(설계 머리 '사용자 결정': 분·반기 검토보고서는 나중). */
export const SCOPE_CODES = ['00760', '00761'];

/**
 * 문서 종류가 점검 범위 안인가. 코드는 DOCUMENT-NAME@ACODE, 없으면 meta.xml DOC-ID.
 * inScope: true(범위 안) · false(범위 밖 — 화면은 막고 안내, 1번 오류) · null(코드를 못 읽음 — 막지 않고 1번 확인 필요).
 */
export function scopeOf(doc) {
  const code = doc.header?.docCode || doc.meta?.docId || '';
  const name = doc.header?.docName || '';
  return { code, name, label: `${name || '문서명 없음'}${code ? `(${code})` : ''}`, inScope: code ? (SCOPE_CODES.includes(code) || isInterimReview(doc)) : null };
}
/** 견본 이름 — 실제 이름으로 바꾸지 않은 것. */
const PLACEHOLDER_NAMES = ['홍길동', '○○○', 'OOO', 'XXX', '김OO'];

/** 구분 = R&Q 엑셀 「Checklist(관련오류사례)」 시트의 '구분' 15개 그대로(사용자 2026-10-15) */
export const GROUPS = ['서식버전', '서식오류점검 기능', '전체 텍스트 점검', '헤더정보', '감사보고서 표지', '검토보고서 표지', '감사보고서 목차', '검토보고서 목차',
  '독립된 감사인의 감사보고서(본문)', '독립된 감사인의 검토보고서(본문)', '회사의 (첨부)재무제표의 표지', '회사의 (첨부)재무제표', '주석', '내부회계관리제도 감사 또는 검토의견',
  '(1) 독립된 감사인의 내부회계관리제도 감사보고서', '(2) 독립된 감사인의 내부회계관리제도 검토보고서', '회사의 내부회계관리제도 운영실태보고서', '외부감사 실시내용'];

export const STATUS_TEXT = { pass: '통과', fail: '오류', warn: '확인 필요', na: '해당 없음', manual: '수동 확인' };

/** 헤더 선택지(00760@6_0.dss <REF-UNIT>). 감사의견(SUPV_OPIN 12자리)은 앞 두 자리가 의견 종류. */
export const HEADER_CODES = {
  opinion: { 10: '적정', 20: '한정', 30: '부적정', 40: '의견거절' },
  icfrOpinion: { 1: '적정', 2: '비적정', 3: '미제출', 4: '제출대상 아님' },
  corpClass: { P: '유가증권시장주권상장법인', A: '코스닥시장주권상장법인', X: '코넥스시장주권상장법인', U: '사업보고서제출비상장법인', E: '기타' },
  omission: { N: '누락없음', P: '사실상폐업', D: '연락두절', J: '제출거부', K: '기타' },
};
const LISTED = ['P', 'A', 'X'];

/** [문서 헤더정보] 칸 — 편집기 대화상자 순서(기본 정보, 추가 정보 = 00760@6_0.dss <HEADER>). 오류 근거의 head가 이 코드다. */
export const HEADER_FIELDS = [
  ['DOC', '문서명'], ['FORM', '서식버전'], ['COMPANY', '회사명'], ['REGCIK', '회사 고유번호'], ['AUDIT_CIK', '감사인 고유번호'],
  ['FIN_STAT', '작성(검사)하지 않는 서식'], ['CRP_RGS_NO', '감사대상회사의 법인등록번호'], ['TOT_ASSETS', '자산총계(단위: 백만원)'],
  ['TOT_DEBTS', '부채총계(단위: 백만원)'], ['TOT_SALES', '매출액총계(단위: 백만원)'], ['TOT_EMPL', '종업원 수'], ['GMSH_DATE', '정기주주총회일자'],
  ['SUPV_OPIN', '감사의견의 종류 및 내용'], ['ETC_OTHR_YN', '기타사항의 유무'], ['POW_OTHR_YN', '강조사항의 유무'], ['ACC_PROF_YN', '회계변경의 유무'],
  ['IFRS_YN', 'IFRS 적용유무'], ['FIN_YN', '재무제표 누락유무'], ['CRP_RGS_CLS', '법인구분'], ['LINK_FLAG', '연결 재무제표 작성여부'],
  ['PREV_IACS', '내부회계관리제도 감사 또는 검토의견'], ['PREV_YN', '내부회계관리제도 감사(검토)보고서 첨부 여부'],
];

/** 헤더정보 칸마다 {code, label, value(원래 값), text(뜻을 붙인 값)}. */
export function headerRows(doc) {
  const s = doc.header.summary;
  const yn = (v, y, n) => (v === 'Y' ? `${y}(Y)` : v === 'N' ? `${n}(N)` : v);
  const amount = (v) => (/^-?\d+$/.test(v || '') ? Number(v).toLocaleString('ko-KR') : v);
  const raw = { DOC: doc.header.docName ? `${doc.header.docName}${doc.header.docCode ? ` (${doc.header.docCode})` : ''}` : '', FORM: doc.meta.docver || doc.header.formVersion,
    COMPANY: doc.header.company || doc.meta.regname, REGCIK: doc.header.regcik || doc.meta.regcik };
  const meaning = {
    CRP_RGS_NO: (v) => (/^\d{13}$/.test(v) ? `${v.slice(0, 6)}-${v.slice(6)}` : v),
    TOT_ASSETS: amount, TOT_DEBTS: amount, TOT_SALES: amount, TOT_EMPL: amount,
    GMSH_DATE: (v) => (/^\d{8}$/.test(v) ? dateText(v) : v),
    SUPV_OPIN: (v) => { const o = HEADER_CODES.opinion[Number(String(v).slice(0, 2))]; return o ? `${o} (${v})` : v; },
    ETC_OTHR_YN: (v) => yn(v, '있음', '없음'), POW_OTHR_YN: (v) => yn(v, '있음', '없음'), ACC_PROF_YN: (v) => yn(v, '있음', '없음'),
    IFRS_YN: (v) => yn(v, '적용', '미적용'), LINK_FLAG: (v) => yn(v, '예', '아니오'), PREV_YN: (v) => yn(v, '첨부', '첨부 안 함'),
    FIN_YN: (v) => (HEADER_CODES.omission[v] ? `${HEADER_CODES.omission[v]}(${v})` : v),
    CRP_RGS_CLS: (v) => (HEADER_CODES.corpClass[v] ? `${HEADER_CODES.corpClass[v]}(${v})` : v),
    PREV_IACS: (v) => (HEADER_CODES.icfrOpinion[v] ? `${HEADER_CODES.icfrOpinion[v]}(${v})` : v),
  };
  return HEADER_FIELDS.map(([code, label]) => {
    const value = (code in raw ? raw[code] : s[code]) ?? '';
    return { code, label, value, text: value ? (meaning[code]?.(value) ?? value) : '' };
  });
}

const f = (level) => (text, block = null, quote = '') => ({ level, text, block, quote });
const ok = f('ok'), bad = f('fail'), warn = f('warn'), info = f('info');
/** 헤더정보 칸(코드)을 가리키는 근거 — 본문 위치가 없는 헤더 오류를 화면이 [문서 헤더정보]의 그 칸에서 짚는다. 규칙의 head는 기본값. */
const onHead = (finding, code) => Object.assign(finding, { head: code });
/** 운영실태보고서가 그림일 때 붙이는 공시팀 안내(기준 안내가 있으면 화면이 링크로 보인다). */
const icfrGuide = (block = null) => Object.assign(info(ICFR_GUIDE.text, block), { link: ICFR_GUIDE.href ? { href: ICFR_GUIDE.href, label: ICFR_GUIDE.label } : null });
/** 근거가 여러 블록에 걸칠 때 끝 블록(upto) — 화면이 첫 블록부터 끝 블록까지 한 테두리로 짚는다(사용자 2026-10-21 "끝까지"). */
const spanTo = (finding, last) => (Number.isInteger(last) && Number.isInteger(finding.block) && last > finding.block ? Object.assign(finding, { upto: last }) : finding);
/** 블록에 내용이 있는가(빈 문단은 아니다) — 테두리 끝을 빈 줄까지 늘리지 않게. */
const filled = (b) => !!b && (b.kind === 'table' || b.kind === 'image' || !!tight(b.text));
/** from~to 블록 중 내용이 있는 마지막 블록 번호(없으면 from). */
const filledEnd = (doc, from, to) => { for (let i = to; i > from; i--) if (filled(doc.blocks[i])) return i; return from; };
/** 근거 글이 든 블록을 from~to에서 찾아 근거 자리로 — 제목을 가리키면 그 아래 표의 근거 글이 칠해지지 않았다(2026-10-22). 없으면 그대로. */
const toQuote = (doc, finding, from, to) => {
  const want = tight(finding.quote);
  if (!want) return finding;
  for (let i = from; i <= to; i++) if (tight(doc.blocks[i]?.text).includes(want)) return Object.assign(finding, { block: i });
  return finding;
};
/** 목차 근거: 근거 글이 든 목차 블록, 근거 글이 없으면 목차 전체(제목~마지막 내용 블록) 한 테두리. 목차 글은 '목 차' 제목 아래 표에 있다. */
const atToc = (doc, facts, finding) => {
  if (!facts.toc.length) return finding;
  const from = facts.toc[0].i, to = facts.toc.at(-1).i;
  return finding.quote ? toQuote(doc, finding, from, to) : spanTo(finding, filledEnd(doc, from, to));
};
/**
 * 두 곳 이상을 맞대 보는 근거('A와 B가 다릅니다'): label = 이 근거 위치의 이름, also = 맞대 볼 다른 위치 [{label, block | head, quote}].
 * 화면은 [비교]로 이 위치들만 팝업에 나란히 띄운다(사용자 2026-10-15 "하나만 보고는 알기 힘드니까").
 */
const vs = (finding, label, ...also) => Object.assign(finding, { label, also: also.filter((x) => x && ((x.block !== null && x.block !== undefined) || x.head)) });
const top = (blocks) => blocks.filter((b) => !b.nested);
const inPart = (doc, ...parts) => doc.blocks.filter((b) => parts.includes(b.part));
const startsWith = (b, word) => tight(b.text).startsWith(tight(word));
/**
 * 블록 안 줄(DART 줄바꿈 &cr;) 가운데 word로 시작하는 줄이 있는가. 감사의견·근거·기타사항·핵심감사사항을 한 문단에 줄바꿈으로
 * 이어 쓴 문서가 있어 블록 첫머리만 보면 놓친다(UAT 2026-10-21: 39개 중 6개).
 */
const lineStarts = (b, word) => String(b?.text || '').split('\n').some((l) => tight(l).startsWith(tight(word)));
/** 렌더러와 같은 USERMARK 선언 순서·상속으로 후보 글의 실제 굵기를 확인한다. */
function hasBoldStyle(node) {
  let inherited = false;
  for (let current = node; current; current = current.parent) {
    const weights = [...styleOf(current).matchAll(/(?:^|;)font-weight:(bold|normal)(?=;|$)/g)];
    if (weights.length) { inherited = weights.at(-1)[1] === 'bold'; break; }
  }
  const visible = [];
  const visit = (current, bold) => {
    if (typeof current === 'string') {
      if (current.replace(/&cr;/gi, '').trim()) visible.push(bold);
      return;
    }
    if (['COMMENT', 'LIBRARYLIST', 'FILENAME', 'WARNING', 'EXTRACTION', 'DOCUMENT-HEADER'].includes(current.tag)) return;
    const weights = [...styleOf(current).matchAll(/(?:^|;)font-weight:(bold|normal)(?=;|$)/g)];
    if (weights.length) bold = weights.at(-1)[1] === 'bold';
    for (const child of current.children || []) visit(child, bold);
  };
  visit(node, inherited);
  return visible.length > 0 && visible.every(Boolean);
}
/** 굵은 제목 후보가 실제 줄 없이 본문과 붙었는가. 줄을 만들거나 문단의 역할을 추정하지 않는다. */
function inlineFormattedHeading(node, blockNode) {
  const ignored = new Set(['COMMENT', 'LIBRARYLIST', 'FILENAME', 'WARNING', 'EXTRACTION', 'DOCUMENT-HEADER']);
  const fragment = (n) => typeof n === 'string' ? n.replace(/[\r\n\t]+/g, ' ').replace(/&cr;/gi, '\n')
    : ignored.has(n.tag) ? '' : (n.children || []).map(fragment).join('');
  let left = '', right = '', current = node;
  while (current && current !== blockNode) {
    const parent = current.parent;
    if (!parent || ignored.has(parent.tag)) return false;
    const at = parent.children.indexOf(current);
    left = parent.children.slice(0, at).map(fragment).join('') + left;
    right += parent.children.slice(at + 1).map(fragment).join('');
    current = parent;
  }
  if (current !== blockNode) return false;
  const own = fragment(node);
  const before = /^[^\S\n]*\n/.test(own) ? '' : left.split('\n').at(-1).trim();
  const after = /\n[^\S\n]*$/.test(own) ? '' : right.split('\n')[0].trim();
  if ((!before || /^(?:\(\d+\)|\d+[.)])$/.test(before)) && /^[:：\-\u2013\u2014]/.test(after)) return false; // 줄표 허용
  return !!(before || after);
}
/** 감사보고서 본문의 문단 머리(이 줄이 나오면 앞 문단이 끝난다). */
const SECTION_HEADS = ['감사의견', '강조사항', '기타사항', '핵심감사사항', '계속기업관련중요한불확실성', '재무제표에대한경영진', '연결재무제표에대한경영진', '재무제표감사에대한감사인', '연결재무제표감사에대한감사인'];
/** word로 시작하는 줄부터 다음 문단 머리 앞까지의 글 → {block, text}. 블록이 나뉘어 있으면 다음 블록(6개까지)으로 이어 읽는다. */
function sectionText(blocks, word) {
  const k = blocks.findIndex((b) => lineStarts(b, word));
  if (k < 0) return null;
  const w = tight(word), out = [];
  for (const b of blocks.slice(k, k + 6)) {
    for (const l of String(b.text).split('\n')) {
      const t = tight(l);
      if (!out.length) { if (t.startsWith(w)) out.push(l); continue; }
      if (SECTION_HEADS.some((h) => !w.startsWith(h) && !h.startsWith(w) && t.startsWith(h))) return { block: blocks[k], text: out.join('\n') };
      out.push(l);
    }
  }
  return { block: blocks[k], text: out.join('\n') };
}
/** 서식에 그 헤더 칸이 있는가. 연결감사보고서 서식(00761)에는 법인등록번호·정기총회일·연결 작성여부·내부회계 칸이 아예 없다(UAT 2026-10-21, 연결 10개 모두). */
const hasHead = (doc, code) => Object.prototype.hasOwnProperty.call(doc.header.summary, code);
/** 헤더 칸을 점검하나: 서식에 칸이 있거나, 연결 서식에 별도 내용을 쓴 문서(칸이 없는 것 자체가 오류 - R&Q 오류사례 '연결서식 작성')면 점검한다. */
const checksHead = (doc, facts, code) => hasHead(doc, code) || !facts.fsConsolidated;
/** 감사의견 문장('우리의 의견으로는 … 공정하게 표시')의 회계기준: 'Y'(한국채택국제회계기준) · 'N'(일반기업회계기준) · ''. 같은 문단의 기타사항은 보지 않는다. */
function opinionStandard(text) {
  const t = tight(text), at = t.indexOf('우리의의견으로는');
  if (at < 0) return '';
  const seg = t.slice(at, at + 400);
  const end = seg.indexOf('공정하게표시');
  const s = end > 0 ? seg.slice(0, end) : seg;
  return s.includes('한국채택국제회계기준') ? 'Y' : s.includes('일반기업회계기준') ? 'N' : '';
}
const firstLine = (s) => String(s || '').split('\n').find((l) => l.trim()) || '';
const short = (s, n = 80) => { const t = flat(s); return t.length > n ? `${t.slice(0, n)}…` : t; };
/** 근거 글(quote)용 앞부분 — 원문에서 그대로 찾아 칠하므로 '…'을 붙이지 않는다(붙이면 칠하기가 조용히 실패했다, 2026-10-22). */
const clip = (s, n = 80) => flat(s).slice(0, n);
const num = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : String(n));
/** 'YYYYMMDD' 한 해 앞. */
const yearBefore = (d) => (d ? `${Number(d.slice(0, 4)) - 1}${d.slice(4)}` : '');
/** YYYYMMDD가 실제 달력의 날짜인가. 윤년·월별 일수의 자동 보정을 허용하지 않는다. */
const calendarDate = (d) => {
  if (!/^\d{8}$/.test(d || '')) return false;
  const parsed = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10).replaceAll('-', '') === d;
};
/** '제 78 기'·'제 16(당) 기'의 기수. 없으면 null. */
const GI = /제\s*(\d+)\s*(?:\(\s*[당전]\s*\)\s*)?기/;
const giOf = (text) => { const m = GI.exec(text || ''); return m ? Number(m[1]) : null; };
/**
 * 서식 날짜 칸(TU AUNIT=PERIOD…·COMM_DATE) → 'YYYYMMDD'. 날짜 비교는 칸에 보이는 글자로 한다(사용자 2026-10-19) —
 * 숨은 저장값(AUNITVALUE)은 storedDateErrors가 따로 본다. 보이는 날짜가 없을 때만 저장값을 쓴다(견본 'XXXX년 XX월 XX일'이고 저장값도 없으면 '').
 */
const dateOf = (c) => findDates(c?.text || '')[0]?.date || (/^\d{8}$/.test(c?.value || '') ? c.value : '');
/**
 * 날짜 칸의 저장값(AUNITVALUE) 오류 — 날짜가 보이는데 저장값이 비었거나, 보이는 날짜와 다름. 편집기는 날짜를 고르면 둘을 같이 쓰지만
 * DSD-Wizard 파일은 글자만 쓰고 저장값을 비워 둔다(이 PC의 DSD-Wizard 파일 약 20개가 전부, 2026-10-19). 보이는 날짜가 없는 칸은 빈칸 점검이 따로 잡는다.
 */
function storedDateErrors(cells, label, block) {
  const empty = [], differ = [];
  for (const c of cells) {
    const shown = findDates(c?.text || '')[0]?.date;
    if (!shown) continue;
    if (!/^\d{8}$/.test(c.value || '')) empty.push(c);
    else if (c.value !== shown) differ.push(c);
  }
  const out = [];
  if (empty.length) out.push(bad(`${label} 날짜 칸의 저장값(AUNITVALUE)이 비어 있습니다(${empty.map((c) => `${c.aunit} '${flat(c.text)}'`).join(', ')}). 보이는 날짜는 점검에 썼습니다. DART 편집기에서 날짜를 다시 선택해 저장하세요.`, block, empty[0].text));
  for (const c of differ) out.push(bad(`${label} 날짜 칸의 저장값(${dateText(c.value)})이 보이는 날짜('${flat(c.text)}')와 다릅니다(${c.aunit}). DART 편집기에서 날짜를 다시 선택해 저장하세요.`, block, c.text));
  return out;
}
const periodCells = (table) => (table?.grid.flat() || []).filter((c) => /PERIOD(FROM|TO)/.test(c.aunit));
/**
 * 검정으로 보는 글자색: R·G·B가 모두 0x40 이하(#2D2D2D · #333333 등, 사용자 2026-10-21), 또는 무채색 진회색 - R·G·B 차이 0x10 이하이고
 * 가장 밝은 값이 0x70 이하(#464646 · #666666). 공시팀 개선요청 '육안으로 구분 불가능한 색(진회색, 회색 등)은 허용', 2512 공시본 4,597건에서
 * #464646 14건 · #666666 30건(2026-10-27). 더 밝은 회색(#808080 등)과 색이 섞인 어두운 색(#584A32 갈색 등)은 그대로 알린다.
 */
export const nearBlack = (color) => {
  const m = /^#?([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(color || '');
  if (!m) return false;
  const v = m.slice(1).map((h) => parseInt(h, 16)), hi = Math.max(...v);
  return hi <= 0x40 || (hi - Math.min(...v) <= 0x10 && hi <= 0x70);
};
/** 회사 이름 비교: (주)·주식회사·유한회사·(유)·칸, 연결 회사명 끝의 '와(과·및) 그 종속기업(종속회사)'을 뺀다. */
const companyKey = (s, consolidated = false) => (consolidated ? tight(s).replace(/(?:와|과|및)?그?종속(?:기업|회사)들?$/, '') : tight(s)).replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, '');
/** '주식회사 가나다' → '주식회사 가나다와 그 종속회사(종속기업)', 받침이 있으면 '과'('아모레퍼시픽과'). */
const withSubsidiary = (name) => {
  const last = tight(name).replace(/[^가-힣]+$/, '').slice(-1);
  const code = last ? last.charCodeAt(0) - 0xAC00 : -1;
  return `${name}${code >= 0 && code % 28 ? '과' : '와'} 그 종속회사(종속기업)`;
};
/** 받침에 맞는 조사: josa('자산총계', '을', '를') → '자산총계를'(옛 '자산총계을(를)', 2026-10-26). */
const josa = (word, withFinal, without) => {
  const last = tight(word).replace(/[^가-힣]+$/, '').slice(-1);
  const code = last ? last.charCodeAt(0) - 0xAC00 : -1;
  return `${word}${code >= 0 && code % 28 ? withFinal : without}`;
};
/** 연결 회사명 끝의 '종속기업'·'종속회사'(없으면 ''). 표지와 재무제표 표지가 섞어 쓰면 경고한다(사용자 2026-10-21). */
const subsidiaryWord = (s) => /종속(기업|회사)들?$/.exec(tight(s))?.[0].replace(/들$/, '') || '';
/** 내부회계 보고서 이름의 앞말: 연결내부회계관리제도 보고서면 '연결내부회계관리제도', 아니면 '내부회계관리제도'(ctx.icfrConsolidated). */
const icfrTerm = (ctx) => (ctx?.icfrConsolidated ? '연결내부회계관리제도' : '내부회계관리제도');
/** 비교용: 칸·따옴표·문장부호를 뺀다(표준 문구 대조). */
const loose = (s) => tight(s).replace(/["'“”‘’「」『』.,·ㆍ]/g, '');
/** 날짜 'YYYYMMDD' → Date(UTC). */
const toDate = (d) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8))));
const dayDiff = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
/**
 * 수행시기 글 → 기간 목록 [{ from, to }]. ','(、·및)는 따로 센 날짜, '~'는 기간이다. 줄임 표기는 앞 날짜의 연·월을 잇는다:
 * '2025.12.29, 30, 31' → 하루씩 셋, '2025.11.11 ~ 13' → 기간 하나, '2025.11.28 ~ 12.2'(UAT 2026-10-21 엠에이치앤코)·'2025-09-29,30,10-01'.
 * 전에는 쉼표 나열을 둘까지만 폈다(공시팀 2026-10 추가 요청 '외감실시내용 일자 기재 방식에 따라 일수 계산이 안 되는 경우').
 */
export function workRuns(text) {
  const runs = [];
  let y = 0, m = 0, range = false;
  const re = /(\d{4})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})\s*일?|(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})\s*일?|(\d{1,2})\s*일?|([~∼～]|부터)|([,，、]|및)/g;
  for (const t of String(text || '').matchAll(re)) {
    if (t[7]) { range = runs.length > 0; continue; }
    if (t[8]) { range = false; continue; }
    let d = 0;
    if (t[1]) { y = Number(t[1]); m = Number(t[2]); d = Number(t[3]); }
    else if (t[4] && y) { m = Number(t[4]); d = Number(t[5]); }
    else if (t[6] && y && m) d = Number(t[6]);
    if (!d || m < 1 || m > 12 || d > 31) continue;
    const date = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
    if (range && runs.length) runs.at(-1).to = date;
    else runs.push({ from: date, to: date });
    range = false;
  }
  return runs;
}
/** 기간 목록의 모든 끝 날짜(사업연도·보고서일 사이 점검용). */
const runDates = (text) => workRuns(text).flatMap((r) => (r.from === r.to ? [r.from] : [r.from, r.to]));

/**
 * '제 N (당|전) 기' 표시가 기수와 어긋난 곳: 전기 기수에 '(당)', 당기 기수에 '(전)'. 공시팀 메일(2026-03, 서울-춘천고속도로 현금흐름표·결손금처리계산서
 * '제 23(당) 기', 앤디포스 연결 표지 '제 15(당) 기')이 짚은 오류 — 기수 숫자는 맞고 표시만 틀려 기수 대조로는 못 잡았다(DART 제출 점검 2026-10-23).
 */
function markErrors(text, gi) {
  if (!gi) return [];
  const out = [];
  for (const m of String(text || '').matchAll(/제\s*(\d+)\s*\(\s*(당|전)\s*\)\s*(?:기|분기|반기)/g)) {
    const n = Number(m[1]);
    if ((n === gi - 1 && m[2] === '당') || (n === gi && m[2] === '전')) out.push({ text: m[0], want: n === gi ? '당' : '전' });
  }
  return out;
}
/** 표 머리(앞 3행) 글. */
const headText = (table) => (table?.grid || []).slice(0, 3).flat().map((c) => c.text).join(' ');

export const STATEMENTS = ['재무상태표', '포괄손익계산서', '손익계산서', '자본변동표', '현금흐름표', '이익잉여금처분계산서', '결손금처리계산서'];
const MAIN_STATEMENTS = ['재무상태표', '포괄손익계산서', '손익계산서', '자본변동표', '현금흐름표'];
const STATEMENT_RE = /(연결)?(포괄손익계산서|손익계산서|재무상태표|자본변동표|현금흐름표|이익잉여금처분계산서|결손금처리계산서)/g;

/** 글 속 재무제표 이름(연결 포함, 긴 이름 먼저). */
export function statementNames(text) {
  return [...tight(text).matchAll(STATEMENT_RE)].map((m) => m[0]);
}

function statementTitle(b) {
  const head = b.kind === 'title' || b.kind === 'p' ? tight(b.text) : b.kind === 'table' && b.border !== '1' ? tight((b.grid[0] || []).map((c) => c.text).join('')) : '';
  const m = /^(연결)?(재무상태표|포괄손익계산서|손익계산서|자본변동표|현금흐름표)$/.exec(head);
  return m ? { name: m[0], base: m[2], consolidated: !!m[1] } : null;
}

/** (첨부)재무제표 구역의 기본 재무제표 4~5개: 제목·기수 줄·본표·'별첨 주석' 줄·단위. */
export function statementsOf(doc) {
  const fs = top(inPart(doc, 'fs'));
  const out = [];
  for (let k = 0; k < fs.length; k++) {
    const title = statementTitle(fs[k]);
    if (!title) continue;
    const st = { ...title, titleBlock: fs[k], lines: [], unit: null, unitText: '', main: null, after: null };
    if (fs[k].kind === 'table') st.lines.push(...fs[k].grid.slice(1).map((row) => row.map((c) => c.text).join(' ')));
    let j = k + 1;
    for (; j < fs.length && j <= k + 4; j++) {
      const b = fs[j];
      if (statementTitle(b)) break;
      if (b.kind === 'table' && b.border === '1') { st.main = b; break; }
      if (b.kind === 'table') st.lines.push(...b.grid.map((row) => row.map((c) => c.text).join(' ')));
    }
    if (st.main) {
      const next = fs.slice(j + 1, j + 3).find((b) => b.kind === 'table' || (b.kind === 'p' && flat(b.text)) || statementTitle(b));
      st.after = next && !statementTitle(next) ? next : null;
      if (!st.after && fs[j + 1] && !statementTitle(fs[j + 1])) st.after = fs[j + 1];
    }
    const unitSource = `${st.lines.join(' ')} ${st.titleBlock.text}`;
    const u = /단위\s*[:：]?\s*(백만원|천원|원)/.exec(unitSource);
    if (u) { st.unitText = u[1]; st.unit = { 원: 1, 천원: 1e3, 백만원: 1e6 }[u[1]]; }
    out.push(st);
  }
  return out;
}

/** 본표 머리 행에서 당기·주석 열 범위. */
function columns(grid) {
  const spans = { current: null, note: null };
  for (const row of grid.slice(0, 3)) {
    for (const cell of row) {
      const t = tight(cell.text);
      const range = [cell.col, cell.col + cell.colspan];
      if (!spans.note && t === '주석') spans.note = range;
      if (!spans.current && /\(당\)|당기|당반기|당분기/.test(t)) spans.current = range;
    }
    if (spans.current) break;
  }
  if (!spans.current) {
    for (const row of grid.slice(0, 3)) {
      const cell = row.slice(1).find((c) => !(spans.note && c.col >= spans.note[0] && c.col < spans.note[1]) && /^제\d+기|^\d{4}(년|\.)/.test(tight(c.text)));
      if (cell) { spans.current = [cell.col, cell.col + cell.colspan]; break; }
    }
  }
  return spans;
}

/** 손익계산서의 매출 행 이름(보험사 '보험영업수익'·'보험수익' 포함, UAT 2026-10-21 IBK). */
const SALES_ROW = /^(매출액|매출|수익\(매출액\)|영업수익|수익|보험영업수익|보험수익)$/;

const rowLabel = (row) => tight(row[0]?.text || '').replace(/\(주석?[\d,.\s]*\)|<주석?[\d,.\s]*>/g, '').replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVXl\d]+[.)]/, '').replace(/^[.\-·ㆍ]+/, '');

/** 금액 칸 끝의 합계 밑줄('584,934,967' 다음 줄 '=====')은 뺀다(공시팀 오류사례 2026 국민은행 자산총계, 2026-10-26). */
const underlineless = (s) => String(s || '').replace(/\s*(?:[=＝]{3,}|[-─━]{3,})\s*$/, '');

/** 본표에서 행 이름이 맞는 행의 당기 금액(원문 단위). */
function currentAmount(st, labelRe) {
  if (!st?.main) return null;
  const grid = st.main.grid, { current, note } = columns(grid);
  for (const row of grid) {
    if (!labelRe.test(rowLabel(row))) continue;
    const values = row.slice(1).filter((c) => !(note && c.col >= note[0] && c.col < note[1]))
      .filter((c) => !current || (c.col >= current[0] && c.col < current[1]))
      .map((c) => ({ c, v: parseAmount(underlineless(c.text)) })).filter((x) => x.v !== null && tight(x.c.text) !== '');
    if (values.length) return { value: values.at(-1).v, cell: values.at(-1).c, label: row[0].text };
  }
  return null;
}

/** 서명 표(감사인 주소·회계법인·대표이사·보고서일). 표 안에 날짜가 없으면 바로 뒤 문단에서 찾는다. */
function signatureOf(doc, part) {
  const blocks = top(inPart(doc, part));
  const effectiveAt = blocks.findIndex((b) => tight(b.text).includes('현재로유효한것입니다'));
  const before = effectiveAt >= 0 ? blocks.slice(0, effectiveAt) : blocks;
  let k = -1;
  for (let i = before.length - 1; i >= 0; i--) {
    const b = before[i];
    if (b.kind === 'table' && b.border !== '1' && (/회계법인|대표이사|서울특별시/.test(tight(b.text)) || (b.grid.length >= 3 && b.grid.length <= 5 && i >= before.length - 4))) { k = i; break; }
  }
  if (k < 0) return null;
  const table = before[k];
  const lines = table.grid.map((row) => row.map((c) => c.text).join(' ').trim());
  let date = findDates(table.text)[0] || null, dateBlock = table;
  if (!date) {
    for (const b of before.slice(k + 1, k + 3)) {
      const d = findDates(b.text)[0];
      if (d && (b.kind === 'p' || (b.kind === 'table' && b.border !== '1'))) { date = d; dateBlock = b; break; }
    }
  }
  const firstRow = lines[0] || '';
  const address = /대\s*표\s*이\s*사/.test(firstRow) || findDates(firstRow).length ? '' : firstRow.replace(/[가-힣\s]*회\s*계\s*법\s*인.*$/, '').trim();
  return { table, lines, address, firm: lines.find((l) => tight(l).includes('회계법인')) || '',
    ceo: lines.find((l) => tight(l).includes('대표이사')) || '', date: date?.date || '', dateText: date?.text || '', dateBlock };
}

/** 유효시점 문구(감사·검토보고서일). */
function effectiveOf(doc, part) {
  const b = top(inPart(doc, part)).find((x) => tight(x.text).includes('현재로유효한것입니다'));
  if (!b) return null;
  const m = /보고서일\s*\(([^)]*)\)/.exec(flat(b.text));
  const d = findDates(m ? m[1] : b.text)[0];
  return { block: b, date: d?.date || '', dateText: d?.text || '', text: flat(b.text) };
}

function firmOpinion(text) {
  const t = tight(text);
  const disclaimed = /우리는.*재무제표.*의견을표명하지(?:않습니다|아니합니다)/.test(t);
  const positive = t.includes('공정하게표시하고있습니다'), negative = t.includes('공정하게표시하고있지않습니다');
  if (disclaimed) return positive || negative ? '' : '의견거절';
  if (positive && negative) return '';
  const statements = t.split(/(?=우리의의견으로는)/).filter(s => s.startsWith('우리의의견으로는'));
  if (statements.length > 1) {
    const types = new Set(statements.map(s => firmOpinion(s)));
    return types.size === 1 ? [...types][0] : '';
  }
  if (!t.includes('우리의의견으로는')) return '';
  if (negative) return '부적정';
  if (positive) {
    if (t.includes('부적정의견') || t.includes('의견거절')) return '';
    return t.includes('한정의견') ? '한정' : '적정';
  }
  return '';
}

/** 헤더 대조용 당기 의견 본문. 한 P에 이어 쓴 근거·기타사항은 읽지 않고 제목만으로 의견을 추정하지 않는다. */
function currentAuditOpinion(doc) {
  const titles = ['감사의견', '한정의견', '부적정의견', '의견거절'];
  const stops = [...titles.flatMap(t => [`${t}근거`, `${t}의근거`]), '강조사항', '기타사항', '핵심감사사항',
    '계속기업관련중요한불확실성', '재무제표에대한경영진과지배기구의책임', '연결재무제표에대한경영진과지배기구의책임',
    '재무제표에대한경영진의책임', '연결재무제표에대한경영진의책임', '재무제표감사에대한감사인의책임', '연결재무제표감사에대한감사인의책임'];
  const lines = []; let block = null, headingBlock = null, active = false, closed = false;
  const result = () => ({ block: block || headingBlock, text: lines.join('\n') });
  for (const b of top(inPart(doc, 'audit'))) {
    for (const line of String(b.text).split('\n')) {
      const heading = line.replace(/^\s*(?:\(\d+\)|\d+[.)])\s*/, '');
      if (stops.some(h => isHeadingLine(heading, h))) { closed = true; continue; }
      const title = titles.find(h => isHeadingLine(heading, h));
      if (title) {
        if (active) return { ...result(), multiple: true };
        if (closed) continue;
        active = true; headingBlock = b;
        const tail = line.replace(/^[^:：\-\u2013\u2014]*[:：\-\u2013\u2014]\s*/, ''); // 줄표 허용
        if (tail !== line) { lines.push(tail); block = b; }
      } else if (!closed && (active || tight(line).startsWith('우리의의견으로는') || /^우리는.*재무제표.*의견을표명하지(?:않습니다|아니합니다)/.test(tight(line)))) {
        active = true;
        if (/우리의의견으로는|의견을표명하지/.test(tight(line))) block ||= b;
        lines.push(line);
      }
    }
  }
  return result();
}

export function contextOf(doc, overrides = {}) {
  const s = doc.header.summary;
  const consolidated = scopeOf(doc).code === '00761' || /연결/.test(doc.header.docName);
  const auditText = inPart(doc, 'audit').map((b) => b.text).join('\n');
  const opinionStd = opinionStandard(auditText);
  const ifrs = opinionStd ? opinionStd === 'Y' : s.IFRS_YN === 'Y' ? true : s.IFRS_YN === 'N' ? false : /한국채택국제회계기준/.test(auditText);
  const icfrTight = tight(inPart(doc, 'icfr').map((b) => b.text).join(''));
  const countOf = (w) => icfrTight.split(w).length - 1;
  const icfrAudit = countOf('내부회계관리제도감사보고서'), icfrReview = countOf('내부회계관리제도검토보고서');
  const icfr = !icfrTight ? 'none' : icfrReview > icfrAudit ? 'review' : icfrAudit ? 'audit' : icfrReview ? 'review' : 'none';
  const icfrConsolidated = consolidated && tight(top(inPart(doc, 'icfr')).filter((b) => b.kind !== 'title').map((b) => b.text).join('')).includes('연결내부회계관리제도');
  const other = sectionText(top(inPart(doc, 'audit')), '기타사항');
  const otherText = tight(other?.text || '');
  const unauditedPrior = [...otherText.matchAll(/감사(?:를)?받지(?:아니|않)/g)].some((m) => {
    const before = otherText.slice(0, m.index), at = before.lastIndexOf('재무제표');
    if (at < 0 || m.index - at > 40 || /다\.|。/.test(before.slice(at))) return false;
    const head = before.slice(0, at);
    const from = Math.max(0, ...['다.', '。', ','].map((d) => { const i = head.lastIndexOf(d); return i < 0 ? 0 : i + d.length; }));
    const subject = `${head.slice(from)}재무제표`;
    const own = subject.replace(/(?:회사|당사|지배기업)(?:와|과|및)(?:그)?종속(?:기업|회사)/g, '');
    return /전기|비교|직전|전년|\d{4}년|보고기간|사업연도|회계연도/.test(subject) && !/당기|중간|반기|분기/.test(subject)
      && !/관계(?:기업|회사)|공동기업|피투자|종속(?:기업|회사)|자회사/.test(own);
  });
  const priorByOther = (t) => /(?:타|다른|전임|전기)감사인이|회계법인이/.test(t) && /감사하였으며|감사를수행하였으며|감사하였고/.test(t) && !t.includes(tight(AUDITOR.name));
  const externalNote = tight(inPart(doc, 'external').map((b) => b.text).join(''));
  const priorNoted = unauditedPrior || priorByOther(otherText);
  const newEngagement = priorNoted || /전기재무제표는(?:타|다른|전임)감사인이감사하였으며/.test(externalNote);
  const cover = inPart(doc, 'cover').find((b) => b.kind === 'table' && b.aclass === 'EXTRACTION');
  const cell = (aunit) => dateOf(cover?.grid.flat().find((c) => c.aunit === aunit));
  const sub = externalTable(doc, 'INS_SUB');
  const subCell = (aunit) => dateOf(sub?.grid.flat().find((c) => c.aunit === aunit));
  const period = { from: cell('PERIODFROM') || subCell('SUB_PERIODFROM'), to: cell('PERIODTO') || subCell('SUB_PERIODTO'), gi: giOf(cover?.text) };
  const cls = s.CRP_RGS_CLS || '';
  const ifrsHeader = s.IFRS_YN === 'Y' ? true : s.IFRS_YN === 'N' ? false : null;
  return { consolidated, listed: LISTED.includes(cls), listedCode: cls, ifrs, ifrsHeader, icfr, icfrConsolidated, newEngagement, unauditedPrior, priorNoted, period, ...overrides };
}

/** 서식 입력칸(TE·TU)이 있는 표 이름(빈 칸 안내용). */
const FORM_TABLES = { COVER: '표지 사업연도', COVER2: '재무제표 표지 사업연도', INS_SUB: '1. 감사대상업무', INS_NUT: '2. 감사참여자 구분별 인원수 및 감사시간',
  INS_CONT: '3. 주요 감사실시내용', INS_COMM: '4. 감사(감사위원회)와의 커뮤니케이션', INS_IMPT: '5. 감사인의 중요성 금액' };

/**
 * 편집기 파일형식 검사(F7) 규칙 중 이 서식(00760@6_0.dss <VERIFY>)에 적힌 것: 사업연도 일치·1년 이내, 투입 인원·시간 합계.
 * 문구는 편집기 오류 내용 그대로. 빈 입력칸('빈 칸을 기재하여야 합니다.')은 편집기가 서식 입력칸(TE·TU)마다 본다 — 재무제표 서식(Click) 표는 뺀다.
 */
function editorVerify(doc) {
  const cell = (pred) => doc.tables.flatMap((t) => t.grid.flat()).find(pred);
  const unit = (name) => cell((c) => c.aunit === name)?.value || '';
  const blockOf = (pred) => doc.tables.find((t) => t.grid.flat().some(pred))?.i ?? null;
  const cellText = (aunit) => cell((c) => c.aunit === aunit)?.text || '';
  const out = [];
  const periods = [['표지의', 'PERIODFROM', 'PERIODTO'], ['재무제표 표지의', 'PERIODFROM2', 'PERIODTO2'], ['감사대상', 'SUB_PERIODFROM', 'SUB_PERIODTO']]
    .map(([label, f, t]) => ({ label, f, t, from: unit(f), to: unit(t) })).filter((p) => p.from && p.to);
  for (const p of periods) {
    if (!(Number(p.to) >= Number(p.from) && Number(p.to) < Number(p.from) + 10000)) out.push({ text: `${p.label} 사업연도 종료일('까지')은 시작일('부터')보다 1년 이내로 커야합니다(${dateText(p.from)} ~ ${dateText(p.to)}).`, block: blockOf((c) => c.aunit === p.t) });
  }
  const [cover] = periods;
  for (const p of periods.slice(1)) {
    if (cover?.f !== 'PERIODFROM') break;
    const pair = (mine, theirs) => ({ label: `${p.label.replace(/의$/, '')} 사업연도`, quote: cellText(mine), also: [{ label: '표지 사업연도', block: blockOf((c) => c.aunit === theirs), quote: cellText(theirs) }] });
    if (p.from !== cover.from) out.push({ text: `표지의 사업연도 시작일(${dateText(cover.from)})과 ${p.label} 사업연도 시작일(${dateText(p.from)})은 서로 동일해야 합니다.`, block: blockOf((c) => c.aunit === p.f), ...pair(p.f, 'PERIODFROM') });
    if (p.to !== cover.to) out.push({ text: `표지의 사업연도 종료일(${dateText(cover.to)})과 ${p.label} 사업연도 종료일(${dateText(p.to)})은 서로 동일해야 합니다.`, block: blockOf((c) => c.aunit === p.t), ...pair(p.t, 'PERIODTO') });
  }
  const v = (code) => parseAmount(cell((c) => c.acode === code)?.text ?? '') ?? 0;
  const nut = blockOf((c) => c.acode === 'NUM_TOT_TH');
  if (nut !== null) {
    const cats = ['QLT', 'ACT', 'ACR', 'ACP', 'COT', 'EXP'];
    const NAMES = { QLT: '품질관리검토자', ACT: '담당이사', ACR: '등록공인회계사', ACP: '수습공인회계사', EXP: '전산감사ㆍ세무ㆍ가치평가 등 전문가', COT: '건설계약 등 수주산업 전문가', TOT: '합계' };
    for (const p of ['TH', 'LA']) {
      const when = p === 'TH' ? '당기' : '전기';
      for (const row of ['NUM', 'TMA', 'TMY']) if (v(`${row}_TOT_${p}`) !== cats.reduce((a, c) => a + v(`${row}_${c}_${p}`), 0)) out.push({ text: `외부감사 실시내용의 ${when}[${row === 'NUM' ? '투입인원수' : row === 'TMA' ? '투입시간(분ㆍ반기검토)' : '투입시간(감사)'}] 합계가 잘못 되었습니다.`, block: nut });
      for (const c of [...cats, 'TOT']) if (v(`TMT_${c}_${p}`) !== v(`TMA_${c}_${p}`) + v(`TMY_${c}_${p}`)) out.push({ text: `외부감사 실시내용의 ${when}[투입시간(${NAMES[c]})] 합계가 잘못 되었습니다.`, block: nut });
    }
  }
  let inputs = 0;
  for (const t of doc.tables.filter((x) => x.aclass !== 'FINANCE' && x.group !== 'INS_IMPT')) {
    const cells = t.grid.flat().filter((c) => c.tag === 'TE' || c.tag === 'TU');
    inputs += cells.length;
    const blank = cells.filter((c) => !tight(c.text));
    if (blank.length) out.push({ text: `빈 칸을 기재하여야 합니다. 기재할 내용이 없으면 '-'(하이픈)을 입력하십시오. ${FORM_TABLES[t.group] || '서식 입력칸'} ${blank.length}칸이 비어 있습니다.`, block: t.i });
  }
  const unset = new Map();
  for (const t of doc.tables) for (const c of t.grid.flat().filter((x) => x.aunit && !String(x.value ?? '').trim())) {
    if (!unset.has(c.aunit)) unset.set(c.aunit, { t, c, n: 0 });
    unset.get(c.aunit).n++;
  }
  for (const [code, { t, c, n }] of unset) {
    const name = UNIT_NAME[code] || `입력칸(${code})`;
    out.push({ text: `${josa(name, '을', '를')} 편집기에서 선택하지 않았습니다(글 '${flat(c.text) || '빈칸'}'${n > 1 ? ` 외 ${n - 1}칸` : ''}). 편집기 문구: '선택상자 항목에 문제가 발생했습니다. 입력값을 다시 선택하시기 바랍니다.'`, block: t.i, quote: c.text });
  }
  const summary = doc.header?.summary || {}, label = Object.fromEntries(HEADER_FIELDS);
  for (const [code, value] of Object.entries(summary)) {
    if (!String(value ?? '').trim()) out.push({ text: `헤더정보 '${label[code] || code}' 칸이 비어 있습니다. 도구 - 문서 헤더정보에서 입력해야 합니다.`, block: null, head: code });
  }
  const cf = cashFlowCodeCheck(doc);
  const units = doc.tables.reduce((n, t) => n + t.grid.flat().filter((x) => x.aunit).length, 0);
  return { count: periods.length * 3 + (nut !== null ? 30 : 0) + inputs + units + Object.keys(summary).length + cf.count, problems: out, cautions: cf.cautions };
}

/**
 * 편집기 재무제표 검사('최종 재무제표 검사', 파일형식검사 창에서 이어 돈다)의 '신설이 불가능한 계정과목' 오류 후보.
 * 표준계정 현금흐름표 서식(PCF-I:A · LCF-I:A 등)에서 이름칸 · 금액칸 모두 계정코드(ACODE)가 없고 금액이 적힌 계정 행을 찾는다.
 * 공시팀 2026-10-26 인피니움코리아(현금흐름표 '환율변동효과' 등, 해결: 헤더 '작성(검사)하지 않는 서식'에 현금흐름표 체크).
 * 코드가 없다고 곧 신설 불가는 아니므로(Code\A\PCFI.cod의 '신설불가'는 목록에 있는 표준계정에만 붙는다) 확인 필요로만 알린다.
 * 정상 공시본 20개에는 코드 없는 계정 행이 없다. 손익계산서 · 재무상태표는 근거 사례가 없어 보지 않는다(사용자 2026-10-27).
 * 편집기가 검사를 건너뛰는 경우(DartMain.exe 문구): 헤더 IFRS 적용, 재무제표 누락있음, '작성(검사)하지 않는 서식'에 고른 서식
 * (FIN_STAT 2번째 = 현금흐름표, 3번째 = 전체 단위서식). 이지템 2025는 같은 행이 있어도 현금흐름표를 골라 공시팀 사유에 없었다.
 */
function cashFlowCodeCheck(doc) {
  const s = doc.header?.summary || {}, fin = String(s.FIN_STAT || '');
  if (s.IFRS_YN !== 'N' || s.FIN_YN === 'Y' || fin[1] === '1' || fin[2] === '1') return { count: 0, cautions: [] };
  const cautions = [];
  let count = 0;
  for (const t of doc.tables.filter((x) => x.aclass === 'FINANCE' && /^[PL]CF-[^:]*:A$/.test(x.group || ''))) {
    const rows = [];
    for (const row of t.grid) {
      const cells = row.filter((c) => c.tag === 'TE');
      const name = cells.find((c) => c.node?.attrs?.ADELIM === '0');
      if (!name) continue;
      count++;
      const amounts = cells.filter((c) => c !== name);
      if (name.acode || amounts.some((c) => c.acode) || !amounts.some((c) => !['', '-'].includes(tight(c.text)))) continue;
      rows.push(name);
    }
    if (!rows.length) continue;
    cautions.push({ text: `현금흐름표의 '${flat(rows[0].text)}'${rows.length > 1 ? ` 외 ${rows.length - 1}개` : ''} 계정에 계정코드가 없습니다. DART 편집기에서 재무제표 검사를 실행하세요. '신설이 불가능한 계정과목' 오류가 확인되면 헤더 '작성(검사)하지 않는 서식'에 현금흐름표를 체크하세요.`, block: t.i, quote: rows[0].text });
  }
  return { count, cautions };
}
/** 선택 입력칸(AUNIT) 이름 - 편집기 선택값이 빈 곳을 알릴 때. */
const UNIT_NAME = { PERIODFROM: '표지 사업연도 시작일', PERIODTO: '표지 사업연도 종료일', PERIODFROM2: '재무제표 표지 사업연도 시작일', PERIODTO2: '재무제표 표지 사업연도 종료일',
  SUB_PERIODFROM: '감사대상 사업연도 시작일', SUB_PERIODTO: '감사대상 사업연도 종료일', COMM_DATE: '감사(감사위원회)와의 커뮤니케이션 일자' };

/** 운영실태보고서: 내부회계 구역에서 유효시점 문구 뒤. 그림이면 text가 비고, 글로 붙었으면 text가 있다. */
function operatingReport(doc) {
  const blocks = top(inPart(doc, 'icfr'));
  const after = blocks.findLastIndex((b) => tight(b.text).includes('현재로유효한것입니다'));
  const body = (b) => flat(String(b.text).replace(/[=＝\-─━_]{3,}/g, ' ').replace(/회사의\s*내부회계관리제도\s*운영실태보고서/g, ' '));
  const hasImage = (b) => {
    if (b.kind !== 'table') return false;
    const n = findAll(b.node, 'IMG').length || (find(b.node, 'IMAGE') ? 1 : 0);
    return n > 0 && body(b).replace(/\S+\.(jpe?g|png|gif|bmp|pdf)/gi, '').trim().length < 60 * n;
  };
  const startAt = blocks[after]?.i ?? -1;
  const images = inPart(doc, 'icfr').filter((b) => b.i > startAt && (b.kind === 'image' || hasImage(b)));
  const rest = blocks.slice(after + 1).filter((b) => b.kind !== 'image' && !hasImage(b) && body(b));
  const text = rest.map((b) => b.text).join('\n');
  const media = images.length && images.every((b) => b.appendix) ? 'PDF' : images.some((b) => b.appendix) ? '그림·PDF' : '그림';
  return { images, media, blocks: rest, text: flat(rest.map(body).join(' ')).length >= 80 ? text : '' };
}

/**
 * 운영실태보고서가 그림·PDF일 때 화면에서 OCR로 읽은 글(options.ocr = {text, source}) - 24·46·47번이 함께 쓴다(사용자 2026-10-27).
 * 원문 글 보고서(report.text)와 섞지 않는다(섞으면 '문구 없음 → 오류' 경로를 탄다). OCR 근거로는 확인 필요·참고만 낸다(공시팀 2026-10-26: 그림은 수동확인).
 * 글 보고서이거나 OCR을 돌리지 않았으면 null.
 */
function ocrOfReport(report, options) {
  if (report.text || !report.images.length || options?.ocr?.text === undefined) return null;
  return { text: String(options.ocr.text || ''), from: `${options.ocr.source || '운영실태보고서 그림'}(OCR)` };
}

/** 운영실태보고서가 그림·PDF인가(글로 읽을 수 없다) - 화면이 46·47번에 OCR 안내를 붙일지 정한다. */
export function operatingReportIsPicture(doc) {
  const report = operatingReport(doc);
  return !report.text && report.images.length > 0;
}

/** 운영실태보고서 그림 파일 이름(DSD 안 그림, 순서대로) — 화면이 이 그림들을 OCR로 읽어 24번에 넘긴다. 글 보고서면 빈 목록. */
export function operatingReportFiles(doc) {
  const report = operatingReport(doc);
  if (report.text) return [];
  const names = report.images.flatMap((b) => (b.kind === 'image' ? [b.file] : findAll(b.node, 'IMG').map((img) => img.attrs.FILENAME || textOf(img))));
  return [...new Set(names.filter(Boolean))];
}

/** 재무제표 표지 블록(첨부 재무제표 구역에서 첫 재무제표 제목 앞). */
const fsCoverOf = (doc, facts) => {
  const firstSt = facts.statements[0]?.titleBlock.i ?? Infinity;
  return top(inPart(doc, 'fs')).filter((b) => b.i < firstSt);
};

/**
 * '대표이사' 뒤의 이름들. 공동·각자 대표이사는 ','(、·및)로 이어 적는다 — '대표이사 홍길동, 김철수', '각자대표이사 홍길동, 대표이사 김철수',
 * 글자 사이를 띄운 '대 표 이 사  홍 길 동'도 읽는다(사용자 2026-10-27 '1명까지만 찾아주는데 , 기준으로 다 찾도록'). 순서대로, 같은 이름은 한 번.
 */
export function ceoNamesOf(text) {
  const names = [];
  for (const line of String(text || '').split('\n')) {
    const at = line.search(/대\s*표\s*이\s*사/);
    if (at < 0) continue;
    const rest = line.slice(at).replace(/^대\s*표\s*이\s*사/, '');
    for (let part of rest.split(/[,，、]|\s및\s/)) {
      part = part.replace(/(?:각\s*자|공\s*동)?\s*대\s*표\s*이\s*사/g, ' ').replace(/\(\s*(?:인|서명|직인)\s*\)|\(\s*\)/g, ' ').trim();
      const spaced = /^[가-힣]{1,2}(?:\s+[가-힣]{1,2}){1,3}(?![가-힣])/.exec(part);
      const joined = spaced?.[0].replace(/\s+/g, '') || '';
      const word = joined.length >= 2 && joined.length <= 5 ? joined : part.split(/\s+/)[0] || '';
      const name = word.replace(/[^가-힣A-Za-z○]+$/, '');
      if (/^[가-힣A-Za-z○]{2,20}$/.test(name) && !/관리자|회계|이사|위원|회사|감사/.test(name) && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/**
 * OCR 글에서 이름 찾기 — 칸·줄바꿈을 지우고 그대로 있으면 found, 한 글자만 다른 글이 있으면 similar(OCR이 글자를 잘못 읽을 수 있다).
 * 반환: [{ name, found, similar }]. 간단한 대조라 '없음'이 곧 오류는 아니다(원본 그림을 사람이 본다).
 */
export function matchCeoNames(names, text) {
  const t = tight(text || '');
  return names.map((name) => {
    if (t.includes(name)) return { name, found: true, similar: '' };
    let similar = '';
    if (name.length >= 3) {
      for (let k = 0; k + name.length <= t.length && !similar; k++) {
        const w = t.slice(k, k + name.length);
        if (/^[가-힣]+$/.test(w) && [...w].filter((ch, j) => ch !== name[j]).length === 1) similar = w;
      }
    }
    return { name, found: false, similar };
  });
}

/** 24번: OCR로 읽은 운영실태보고서 그림·PDF 글과 재무제표 표지 대표이사 대조. ocr = { text, source }. */
function ocrCeoFindings(names, ocr, block) {
  const from = ocr.source || '운영실태보고서 그림';
  if (!tight(ocr.text)) return [warn(`${from}에서 글을 읽지 못했습니다(OCR). 운영실태보고서 서명란의 대표이사를 직접 확인하세요.`, block)];
  const hits = matchCeoNames(names, ocr.text);
  const found = hits.filter((m) => m.found).map((m) => m.name);
  const near = hits.filter((m) => !m.found && m.similar);
  const none = hits.filter((m) => !m.found && !m.similar).map((m) => m.name);
  const out = [];
  if (found.length) out.push(ok(`${from}(OCR)에서 대표이사 ${found.join(', ')}을(를) 찾았습니다.`, block, found[0]));
  for (const m of near) out.push(warn(`${from}(OCR)에서 대표이사 '${m.name}'과 한 글자만 다른 '${m.similar}'을(를) 찾았습니다. OCR이 잘못 읽었는지 원본에서 확인하세요.`, block, m.name));
  if (none.length) out.push(warn(`${from}(OCR)에서 대표이사 ${none.join(', ')}을(를) 찾지 못했습니다. ${names.length > 1 ? '각자·공동 대표이사가 모두 서명했는지, ' : ''}운영실태보고서 서명란을 직접 확인하세요.`, block, none[0]));
  const lines = String(ocr.text).replace(/대\s*프\s*이\s*사/g, '대표이사').split('\n').filter((l) => flat(l).length <= 40);
  const near1 = (a, b) => a.length === b.length && [...a].filter((ch, j) => ch !== b[j]).length <= 1;
  const extra = ceoNamesOf(lines.join('\n')).filter((n) => !names.some((x) => near1(x, n)));
  if (extra.length) out.push(warn(`${from}(OCR) 서명란에 재무제표 표지에 없는 대표이사(${extra.join(', ')})가 있습니다. 각자·공동 대표이사라면 재무제표 표지에도 모두 적었는지 확인하세요(OCR 글이라 이름이 틀릴 수 있습니다).`, block, names[0]));
  return out;
}

/**
 * 46번: 검토보고서 범위 문단(b: 중소기업·비상장대기업 문구)과 OCR로 읽은 운영실태보고서 그림의 준거기준·평가기준 대조.
 * OCR은 글자를 빠뜨리거나 잘못 읽으므로 확인 필요·참고만 낸다(오류 아님).
 */
function ocrScopeFindings(ocr, b, quote, at) {
  if (!ocr) return [];
  const t = tight(ocr.text);
  if (!t) return [info(`${ocr.from}에서 글을 읽지 못해 준거기준·평가기준을 대조하지 못했습니다. 원본에서 확인하세요.`, at)];
  const chapter = /제4장|중소기업에대한적용|완화/.exec(t)?.[0] || '';
  const eased = /중소기업에대한적용|완화된방식/.test(t);
  const general = /개념[^가-힣]{0,2}체계[^가-힣]{0,3}를[^가-힣]{0,2}준거기준으로/.test(t);
  if (b && !chapter) {
    return [general
      ? warn(`검토보고서 범위 문단에 '${quote}' 문구가 있는데 ${ocr.from}에서 '제4장 중소기업에 대한 적용'·'완화된 방식' 문구를 찾지 못했습니다. OCR이 빠뜨렸을 수도 있으니 기준 불일치 여부를 원본에서 확인하세요.`, b.i, quote)
      : info(`${ocr.from} 글에서 준거기준 문장을 끝까지 읽지 못해 대조 근거가 부족합니다. 원본에서 확인하세요.`, b.i, quote)];
  }
  if (!b && eased) return [warn(`${ocr.from}에서 '중소기업에 대한 적용'(완화된 방식) 문구를 찾았는데 검토보고서 범위 문단에 '중소기업 등에 대한 검토특례' 문구가 없습니다. 기준 불일치 여부를 원본에서 확인하세요.`, at)];
  return [info(chapter ? `${ocr.from} 글에서 완화 적용 단서('제4장 중소기업에 대한 적용' 등)를 찾았습니다. 준거기준·평가기준 각각이 검토보고서와 같은지는 원본에서 확인하세요.`
    : `${ocr.from} 글에서 완화 적용 단서를 찾지 못했습니다. 준거기준·평가기준이 검토보고서와 같은지는 원본에서 확인하세요.`, b ? b.i : at, b ? quote : '')];
}

/** 47번: OCR로 읽은 운영실태보고서 그림의 평가기준. '모범규준'은 과거 평가기준 의심(확인 필요), '평가 및 보고 기준'이 함께 있어도 지우지 않는다. */
function ocrStandardFindings(ocr, at) {
  if (!ocr) return [];
  const t = tight(ocr.text);
  if (!t) return [info(`${ocr.from}에서 글을 읽지 못해 평가기준 문구를 대조하지 못했습니다. 원본에서 확인하세요.`, at)];
  const current = /평가및보고기준/.test(t);
  if (/모범규준|보고모범기준/.test(t)) return [warn(`${ocr.from}에 '모범규준' 문구가 있습니다${current ? "('평가 및 보고 기준'도 함께 있음)" : ''}. 과거 평가기준으로 적었는지 원본에서 확인하고 '내부회계관리제도 평가 및 보고 기준'으로 적어야 합니다.`, at)];
  return [info(current ? `${ocr.from}에서 평가기준 '평가 및 보고 기준'을 찾았습니다.`
    : `${ocr.from}에서 평가기준 문구('평가 및 보고 기준')를 찾지 못했습니다. OCR이 빠뜨렸을 수도 있으니 원본에서 확인하세요.`, at)];
}

/** 외부감사 실시내용 칸 값(코드 → 글). 별도·연결 비교용. */
function externalValues(doc) {
  const values = new Map();
  for (const t of doc.tables.filter((x) => x.part === 'external' && /^INS_(NUT|CONT|COMM)$/.test(x.group))) {
    const seen = {};
    for (const c of t.grid.flat()) {
      const code = c.acode || c.aunit;
      if (!code || code === 'SUB_COMPY') continue;
      seen[code] = (seen[code] || 0) + 1;
      const show = c.aunit && c.value ? c.value : flat(c.text);
      values.set(seen[code] > 1 ? `${code}#${seen[code]}` : code, { show, cmp: tight(show) });
    }
  }
  return values;
}

/** 4. 커뮤니케이션 표의 빈 행: 번호 말고는 일자·참석자·논의 내용이 모두 비었거나 '-'. */
const commRowEmpty = (row) => row.filter((c) => c.acode !== 'COMM_NO' && (c.acode || c.aunit)).every((c) => ['', '-'].includes(tight(c.text)));

function externalTable(doc, group) {
  return doc.tables.find((t) => t.part === 'external' && t.group === group && t.grid.length > 1)
    || doc.tables.find((t) => t.part === 'external' && t.group === group);
}

const insertion = (doc, word) => doc.insertions.find((i) => tight(i.list).includes(word));

function factsOf(doc, ctx) {
  const statements = statementsOf(doc);
  return {
    statements,
    /** 첨부 재무제표가 연결인가(서식 종류가 아니라 실제 내용). */
    fsConsolidated: statements.length ? statements.some((s) => s.consolidated) : ctx.consolidated,
    auditSign: signatureOf(doc, 'audit'), auditEffective: effectiveOf(doc, 'audit'),
    icfrSign: ctx.icfr !== 'none' ? signatureOf(doc, 'icfr') : null, icfrEffective: ctx.icfr !== 'none' ? effectiveOf(doc, 'icfr') : null,
    toc: inPart(doc, 'toc'), cover: inPart(doc, 'cover'),
  };
}

/** 재무제표 이름 목록 문장 대조(감사의견·내부회계 감사의견). */
function statementListFindings(text, block, facts, label) {
  const out = [];
  const listed = new Set(statementNames(text).map((n) => n.replace(/^연결/, '')));
  const actual = new Set(facts.statements.map((s) => s.base));
  for (const name of actual) {
    if (!listed.has(name)) out.push(bad(`${label}에 '${name}'이(가) 없습니다.`, block.i, clip(text, 60)));
  }
  for (const name of listed) {
    if (MAIN_STATEMENTS.includes(name) && !actual.has(name)) out.push(bad(`${label}에 '${name}'이(가) 있으나 첨부 재무제표에는 없습니다.`, block.i, name));
  }
  if (!out.length && actual.size) out.push(ok(`${label}의 재무제표 명칭이 첨부 재무제표(${[...actual].join(', ')})와 같습니다.`, block.i));
  return out;
}

/** 회계기준 표기: '한국채택국제회계기준' 또는 '대한민국의 일반기업회계기준'('일반기업회계기준'만 적은 오류). */
function standardFindings(block, label) {
  const t = tight(block.text);
  const general = [...t.matchAll(/(.{0,5})일반기업회계기준/g)];
  const bare = general.filter((m) => !m[1].endsWith('대한민국의'));
  if (bare.length) return [bad(`${label}에 '일반기업회계기준'으로 적었습니다. '대한민국의 일반기업회계기준'으로 적어야 합니다.`, block.i, '일반기업회계기준')];
  if (general.length) return [ok(`${label} 회계기준: 대한민국의 일반기업회계기준`, block.i, '일반기업회계기준')];
  if (t.includes('한국채택국제회계기준')) return [ok(`${label} 회계기준: 한국채택국제회계기준`, block.i, '한국채택국제회계기준')];
  return [];
}

/**
 * 감사보고서 본문 표준 문구(M&T 표준 감사보고서, 공시팀 메일 2026-03·04): 18번(감사의견)에 덧붙인다.
 * - '동일로 종료되는 양 보고기간의'(당기·전기 의견) / '보고기간의'(신규 수임) — 더블하트
 * - 회계정책 문구: 일반기업회계기준은 '유의적인 회계정책의 요약', 한국채택국제회계기준은 '중요한 회계정책 정보' — 디에스엔피엘
 * - 감사의견근거 '우리는 대한민국의 회계감사기준에 따라'(오류사례 2026 추가기능)
 * - 경영진 책임 문단의 회계기준: '한국채택국제회계기준'(앞에 '대한민국의' 없음) · '대한민국의 일반기업회계기준' — 더블하트·디에스엔피엘
 * - 별도감사보고서에 연결 전용 문구('그룹감사')를 쓰지 않음 — 라인게임즈
 */
function auditWordingFindings(doc, ctx, facts, list, listText, opinion, opinionText) {
  const out = [];
  const lt = tight(listText);
  for (const [b, text] of [[list, listText], [opinion, opinionText]]) {
    if (!b || !text) continue;
    const t = tight(text);
    if (!t.includes('동일로종료되는')) continue;
    const both = t.includes('양보고기간') || t.includes('양회계연도');
    if (!ctx.newEngagement && !both) out.push(bad("당기·전기 의견인데 '동일로 종료되는 보고기간의'로 적었습니다. '동일로 종료되는 양 보고기간의'로 적어야 합니다.", b.i, '보고기간의'));
    if (ctx.newEngagement && both) out.push(bad("당기만 의견 표명 대상(신규 수임)인데 '양 보고기간의'로 적었습니다. '동일로 종료되는 보고기간의'로 적어야 합니다.", b.i, '양 보고기간'));
  }
  const policyIfrs = lt.includes('중요한회계정책정보'), policyGaap = /유의적(?:인)?회계정책(?:의|에대한)요약/.test(lt);
  if (!ctx.ifrs && policyIfrs) out.push(bad("일반기업회계기준 회사인데 '중요한 회계정책 정보'로 적었습니다. '유의적인 회계정책의 요약'으로 적어야 합니다.", list.i, '중요한 회계정책 정보'));
  if (ctx.ifrs && policyGaap) out.push(warn("한국채택국제회계기준 회사인데 '유의적인 회계정책의 요약'으로 적었습니다. 지금 표준은 '중요한 회계정책 정보'입니다.", list.i, '회계정책'));
  const blocks = top(inPart(doc, 'audit'));
  const lineOf = (re) => { for (const b of blocks) for (const l of String(b.text).split('\n')) if (re.test(tight(l))) return { b, l }; return null; };
  const basis = lineOf(/^우리는.*회계감사기준에따라감사를수행/);
  if (basis && !tight(basis.l).includes('대한민국의회계감사기준에따라')) out.push(bad("감사의견근거에 '대한민국의 회계감사기준에 따라'가 없습니다.", basis.b.i, clip(basis.l, 40)));
  const mgmt = lineOf(/^(?:회사의?|연결회사의?)?경영진은.*(?:회계기준|국제회계기준)에따라/);
  if (mgmt) {
    const t = tight(mgmt.l), label = '경영진 책임 문단';
    if (t.includes('대한민국의한국채택국제회계기준')) out.push(bad(`${label}에 '대한민국의 한국채택국제회계기준'으로 적었습니다. '대한민국의'를 지우고 '한국채택국제회계기준'으로 적어야 합니다.`, mgmt.b.i, '대한민국의'));
    else if (ctx.ifrs && t.includes('일반기업회계기준')) out.push(bad(`${label}의 회계기준이 '일반기업회계기준'입니다. 감사의견과 같은 '한국채택국제회계기준'으로 적어야 합니다.`, mgmt.b.i, '일반기업회계기준'));
    else if (!ctx.ifrs && t.includes('한국채택국제회계기준')) out.push(bad(`${label}의 회계기준이 '한국채택국제회계기준'입니다. 감사의견과 같은 '대한민국의 일반기업회계기준'으로 적어야 합니다.`, mgmt.b.i, '한국채택국제회계기준'));
    else out.push(...standardFindings({ text: mgmt.l, i: mgmt.b.i }, label));
  }
  if (!ctx.consolidated && !facts.fsConsolidated) {
    const group = lineOf(/그룹감사|그룹내의사업활동/);
    if (group) out.push(bad("별도감사보고서에 연결감사보고서 문구('그룹감사의 지휘, 감독 및 수행')가 있습니다. 감사인의 책임 문단을 별도 표준 문구로 고쳐야 합니다.", group.b.i, /그룹감사/.test(group.l) ? '그룹감사' : '그룹'));
  }
  return out;
}

/** 서명 표 점검(감사인 주소·대표이사·보고서일). */
function signatureFindings(sign, label) {
  if (!sign) return [bad(`${label}의 감사인 주소·대표이사·보고서일 표를 찾지 못했습니다.`)];
  const out = [], i = sign.table.i;
  if (!sign.lines.some((l) => tight(l))) return [bad(`${label}의 감사인 주소·대표이사·보고서일이 비어 있습니다.`, i)];
  if (!tight(sign.address)) out.push(bad(`감사인 주소가 비어 있습니다. '${AUDITOR.address}'로 적어야 합니다.`, i));
  else if (tight(sign.address) !== tight(AUDITOR.address)) out.push(bad(`감사인 주소가 '${sign.address}'입니다. '${AUDITOR.address}'로 적어야 합니다.`, i, sign.address));
  else out.push(ok(`감사인 주소: ${sign.address}`, i));
  if (!tight(sign.firm).includes(tight(AUDITOR.name))) out.push(bad(`감사인 명칭(${AUDITOR.name})이 없습니다.`, i));
  if (!sign.ceo) out.push(bad('대표이사명이 없습니다.', i));
  else if (!tight(sign.ceo).includes(tight(AUDITOR.ceo))) out.push(warn(`대표이사명이 '${flat(sign.ceo)}'입니다. 현재 대표이사(${AUDITOR.ceo})와 같은지 확인하세요.`, i, sign.ceo));
  if (!sign.date) out.push(bad('보고서일자가 없습니다.', i));
  else out.push(ok(`보고서일: ${dateText(sign.date)}`, sign.dateBlock.i, sign.dateText));
  return out;
}

/** 유효시점 문구 점검: 있음·날짜·표준 문구. report = {date, label}(대조할 보고서일). */
function effectiveFindings(eff, report, kind, scope) {
  if (!eff) return [bad(`유효시점 문구(이 ${kind}는 … 수정될 수도 있습니다.)가 없습니다.`)];
  const out = [], i = eff.block.i;
  if (!eff.date) out.push(bad('유효시점 문구에 보고서일이 없습니다.', i));
  else if (report?.date && eff.date !== report.date) out.push(vs(bad(`유효시점 문구의 날짜(${dateText(eff.date)})가 ${report.label}(${dateText(report.date)})과 다릅니다.`, i, eff.dateText),
    '유효시점 문구', { label: report.label, block: report.block, quote: report.quote }));
  else out.push(ok(`유효시점 문구 날짜: ${dateText(eff.date)}`, i, eff.dateText));
  const word = kind.replace(/^이 /, '');
  const standard = `이 ${word}는 ${word}일(${dateText(eff.date)}) 현재로 유효한 것입니다. 따라서 ${word}일 후 이 보고서를 열람하는 시점 사이에 ${scope}에 중요한 영향을 미칠 수 있는 사건이나 상황이 발생할 수도 있으며, 이로 인하여 이 ${word}가 수정될 수도 있습니다.`;
  const body = flat(eff.text).replace(/\(([^)]*)\)/, `(${dateText(eff.date)})`);
  if (!loose(body).includes(loose(standard))) {
    const core = scope.split(' ').at(-1);
    const wrongScope = (!loose(body).includes(loose(`${core}에중요한영향`)) && !loose(body).includes(loose(`${core}에중대한영향`)))
      || (core === '재무제표' && /연결재무제표에중[요대]한영향/.test(loose(body)));
    const after = new RegExp(`${[...`${word}일`].join('\\s*')}\\s*이\\s*후`).exec(eff.text)?.[0] || '';
    const until = /시\s*점\s*까\s*지\s*의\s*기\s*간\s*사\s*이\s*에/.exec(eff.text)?.[0] || '';
    const fixes = [after && `'${word}일 이후' → '${word}일 후'`, until && "'시점까지의 기간 사이에' → '시점 사이에'"].filter(Boolean);
    if (fixes.length) out.push(bad(`유효시점 문구를 고쳐야 합니다(${fixes.join(', ')}). 표준: "${standard}"`, i, after || until));
    else if (wrongScope) out.push(warn(`유효시점 문구의 대상이 '${core}'가 아닙니다. 표준: "${standard}"`, i, clip(eff.text, 120)));
    else out.push(warn(`유효시점 문구가 표준 문구와 다릅니다. 표준: "${standard}"`, i, clip(eff.text, 120)));
  }
  return out;
}

/** 내부회계 첨부 서한(감사·검토 공통). */
function icfrLetterFindings(doc, ctx, kind) {
  const word = kind === 'audit' ? '감사' : '검토';
  const icfrBlocks = top(inPart(doc, 'icfr'));
  const b = icfrBlocks.find((x) => tight(x.text).includes('첨부하는것입니다'));
  if (!b) {
    const near = icfrBlocks.find((x) => /외부감사에관한법률제8조에따라/.test(tight(x.text)));
    return [bad(near ? "첨부 서한의 '… 제8조에 따라 첨부하는 것입니다.' 문구가 표준과 다릅니다." : '첨부 서한 문구(… 첨부하는 것입니다.)를 찾지 못했습니다.', near?.i ?? null, near ? clip(near.text, 60) : '')];
  }
  const k = icfrBlocks.indexOf(b);
  const tail = [];
  for (const x of icfrBlocks.slice(k + 1, k + 5)) {
    if (x.kind === 'title' || /귀중|귀하/.test(tight(x.text))) break;
    tail.push(x.text);
  }
  const t = tight([b.text, ...tail].join('\n')), out = [];
  const T = icfrTerm(ctx), con = ctx.icfrConsolidated, who = con ? '연결회사의' : '회사의';
  const need = [
    [`독립된감사인의${T}${word}보고서는`, `"독립된 감사인의 ${T} ${word}보고서는"`],
    [`${T}를${word}한결과`, `"${who} ${T}를 ${word}한 결과"`],
    [`1.독립된감사인의${T}${word}보고서`, `"첨부 : 1. 독립된 감사인의 ${T} ${word}보고서"`],
    [con ? /2\.(?:연결)?(?:회사|실체)의연결내부회계관리제도운영실태보고서/ : '2.회사의내부회계관리제도운영실태보고서', `"2. 회사의 ${T} 운영실태보고서"`],
  ];
  const listed = flat([b.text, ...tail].join('\n'));
  const written = (n) => new RegExp(`(?:^|[\\s:])${n}\\s*[.)]\\s*([^\\n]*?보고서)`).exec(listed)?.[1];
  need.forEach(([w, label], k) => {
    if (typeof w === 'string' ? t.includes(w) : w.test(t)) return;
    const n = k === 2 ? 1 : k === 3 ? 2 : 0, got = n ? written(n) : '';
    const plain = con && !n && t.includes((typeof w === 'string' ? w : '').replace('연결내부회계관리제도', '내부회계관리제도'));
    out.push(got ? bad(`첨부 목록에 "${n}. ${got}"로 적었습니다. ${label.replace(/^"첨부 : /, '"')}로 적어야 합니다.`, b.i, got)
      : plain ? bad(`서한의 '내부회계관리제도' 앞에 '연결'이 없습니다. ${label}로 적어야 합니다.`, b.i, clip(b.text, 80))
      : bad(`표준 기재내용 ${label}이(가) 없습니다.`, b.i, clip(b.text, 80)));
  });
  if (!con && t.includes(`첨부된독립된감사인의${T}${word}보고서는`)) out.push(bad(`서한 첫머리의 '첨부된'을 지워야 합니다. '독립된 감사인의 ${T} ${word}보고서는 …'으로 시작합니다.`, b.i, '첨부된'));
  const law = /주식회사[^\s]*\s*(?:등의\s*)?외부감사에\s*관한\s*법률\s*제\s*\d+\s*조(?:\s*의\s*\d+)?/.exec(flat(b.text));
  if (law && tight(law[0]) !== '주식회사등의외부감사에관한법률제8조') out.push(bad(`법률 이름·조항을 '주식회사 등의 외부감사에 관한 법률 제8조'로 적어야 합니다('${law[0]}').`, b.i, law[0]));
  const company = doc.header.company || doc.meta.regname;
  if (company && !companyKey(b.text).includes(companyKey(company))) out.push(bad(`회사명(${company})이 서한에 없습니다.`, b.i));
  const blocks = icfrBlocks;
  const title = blocks.find((x) => x.i < b.i && tight(x.text).includes('내부회계관리제도감사또는검토의견'));
  if (title) {
    const lines = blocks.filter((x) => x.i > title.i && x.i < b.i && flat(x.text)).map((x) => x.text);
    if (String(b.text).split('\n').filter((l) => l.trim()).length > 1) lines.push(firstLine(b.text));
    const line = lines.find((s) => (company ? companyKey(s) === companyKey(company) : /주식회사|\(주\)|㈜|유한회사/.test(tight(s)) && flat(s).length < 40));
    if (!line) out.push(bad(`제목 아래 회사명 줄(${company || '주식회사 ○○'})이 없습니다. 서한 앞에 회사명을 적어야 합니다.`, title.i, title.text));
  }
  const end = /(\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일)\s*자로\s*종료되는/.exec(flat(b.text));
  if (end && findDates(end[1])[0]?.date !== ctx.period.to) out.push(bad(`서한의 회계연도 종료일(${end[1]})이 당기말(${dateText(ctx.period.to)})과 다릅니다.`, b.i, end[1]));
  const standard = con
    ? `독립된 감사인의 연결내부회계관리제도 ${word}보고서는 ${company || '회사'}와 그 종속기업의 ${dateText(ctx.period.to)}자로 종료되는 회계연도의 연결재무제표에 대한 감사업무를 수행하고 연결회사의 연결내부회계관리제도를 ${word}한 결과 주식회사 등의 외부감사에 관한 법률 제8조에 따라 첨부하는 것입니다.`
    : `독립된 감사인의 내부회계관리제도 ${word}보고서는 ${company || '회사'}의 ${dateText(ctx.period.to)}자로 종료되는 회계연도의 재무제표에 대한 감사업무를 수행하고 회사의 내부회계관리제도를 ${word}한 결과 주식회사 등의 외부감사에 관한 법률 제8조에 따라 첨부하는 것입니다.`;
  const sentence = flat(b.text).split(/첨\s*부\s*:/)[0];
  const norm = (s) => loose(s).replace(/(\d{4})년0?(\d{1,2})월0?(\d{1,2})일/g, '$1년$2월$3일').replace(/보고서는.*?의(\d{4}년)/, '보고서는$1');
  if (!out.length && !norm(sentence).includes(norm(standard))) out.push(warn(`표준 문장과 다릅니다. 표준: "${standard}"`, b.i, clip(sentence, 60)));
  if (!out.length) out.push(ok('첨부 서한 문구가 표준 기재내용과 같습니다.', b.i));
  return out;
}

/**
 * 감사보고서 머리(제목 아래 ~ '감사의견' 앞)의 수신 표: 회사명 줄 + '주주 및 이사회 귀중'(공시팀 2026-10 추가 요청).
 * 회사명이 헤더·표지와 같은지는 14번이 본다 — 여기서는 있는지만.
 */
function addresseeFindings(doc) {
  const blocks = top(inPart(doc, 'audit'));
  const opinionAt = blocks.findIndex((b) => b.kind !== 'title' && /^(?:감사의견|한정의견|부적정의견|의견거절)/.test(tight(b.text)));
  const head = (opinionAt >= 0 ? blocks.slice(0, opinionAt) : blocks.slice(0, 4)).filter((b) => b.kind !== 'title');
  const at = head.findIndex((b) => /귀중|귀하/.test(tight(b.text)));
  if (at < 0) return [bad("감사보고서 제목 아래에 수신처('회사명 / 주주 및 이사회 귀중')가 없습니다.", head[0]?.i ?? blocks[0]?.i ?? null)];
  const to = head[at], out = [];
  const linesOf = (b) => (b.kind === 'table' ? b.grid.flatMap((row) => row.flatMap((c) => String(c.text).split('\n'))) : String(b.text).split('\n')).map(flat).filter(Boolean);
  const lines = linesOf(to);
  const k = lines.findIndex((l) => /귀중|귀하/.test(tight(l)));
  const line = lines[k];
  if (/^(?:주주|사원)및이사회귀중$/.test(tight(line))) out.push(ok('수신처: 주주 및 이사회 귀중', to.i, line));
  else out.push(bad(`감사보고서 수신처가 '${line}'입니다. '주주 및 이사회 귀중'으로 적어야 합니다.`, to.i, line));
  const name = k > 0 ? lines[k - 1] : at > 0 ? linesOf(head[at - 1]).at(-1) || '' : '';
  if (!tight(name) || /귀중|귀하/.test(tight(name))) out.push(bad("수신처('주주 및 이사회 귀중') 위에 회사명이 없습니다.", to.i, line));
  else out.push(ok(`수신 회사명: ${name}`, to.i, name));
  return out;
}

function icfrCoverFindings(doc) {
  const blocks = top(inPart(doc, 'icfr'));
  const b = blocks.find((x) => /귀중|귀하/.test(tight(x.text)) && x.kind === 'table') || blocks.find((x) => /귀중|귀하/.test(tight(x.text)));
  if (!b) return [bad("수신처('주주 및 이사회 귀중')를 찾지 못했습니다.")];
  const t = tight(b.text);
  if (t.includes('주주및이사회귀중')) return [ok("수신처: 주주 및 이사회 귀중", b.i, '귀중')];
  const m = /([가-힣\s]*귀하|[가-힣\s]*귀중)/.exec(flat(b.text));
  return [bad(`수신처가 '${m ? m[1].trim() : short(b.text, 30)}'입니다. '주주 및 이사회 귀중'으로 적어야 합니다.`, b.i, m ? m[1].trim() : '')];
}

function partnerOf(doc, part) {
  const b = top(inPart(doc, part)).find((x) => tight(x.text).includes('업무수행이사는'));
  if (!b) return null;
  const m = /업무수행이사는\s*(공인회계사)?\s*([가-힣](?:\s?[가-힣]){1,4})?\s*입\s*니\s*다/.exec(flat(b.text));
  return { block: b, name: (m?.[2] || '').replace(/\s/g, ''), title: !!m?.[1], text: flat(b.text) };
}

/**
 * 주석의 재무제표 확정(승인) 문장 → {block, text, date, organ, boardDate}. '…일의 이사회', '발행이 승인', '…에 개최되는 정기주주총회에서 최종확정 및 승인될 예정',
 * '…자로 정기주주총회에서 수정 승인될 수 있습니다'(더블하트), 유한회사 '사원총회'도 받는다. boardDate = 같은 주석의 이사회 날짜(없으면 '').
 */
const APPROVAL = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:자로|자|에|의)?\s*(?:개최된\s*|열린\s*|개최되는\s*|개최될\s*)?(이사회|정기주주총회|임시주주총회|주주총회|사원총회|감사위원회)에서\s*(?:발행이?\s*)?(?:사실상\s*)?(?:최종\s*확정\s*및\s*)?(?:최종\s*|수정\s*)?(승인|확정)/;
function approvalOf(doc) {
  for (const b of inPart(doc, 'notes')) {
    const t = flat(b.text), m = APPROVAL.exec(t);
    if (!m) continue;
    const board = /(\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일)\s*(?:자로|자|에|의)?\s*(?:개최된\s*|열린\s*)?이사회에서/.exec(t);
    return { block: b, text: m[0], date: `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}`, organ: m[4], boardDate: board ? findDates(board[1])[0]?.date || '' : '' };
  }
  return null;
}

const auditOpinionBlocks = (doc) => {
  const blocks = top(inPart(doc, 'audit'));
  const list = blocks.find((b) => tight(b.text).includes('해당재무제표는') || tight(b.text).includes('해당연결재무제표는'));
  const alt = list ? null : blocks.find((b) => /동(연결)?재무제표는/.test(tight(b.text)));
  const opinion = blocks.find((b) => tight(b.text).includes('우리의의견으로는'));
  return { list: list || alt, opinion, altWording: !!alt };
};

const FS_NOTE = (consolidated) => (consolidated ? '별첨주석은본연결재무제표의일부입니다' : '별첨주석은본재무제표의일부입니다');

/** 'YYYYMMDD'(월초)부터 n개월 기간의 마지막 날. */
const monthsEnd = (from, n) => new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(4, 6)) - 1 + n, 1) - 86400000).toISOString().slice(0, 10).replace(/-/g, '');

/**
 * 감사보고서 서식(00760·00761)에 분·반기 검토보고서를 쓴 흔적: 표지에 '반기'·'분기'·'검토보고서', 또는 표지 사업연도가 월초부터 3·6·9개월(분·반기 기간).
 * 문서 코드만으로는 못 잡는다(262Q 코퍼스의 연결감사보고서 서식 검토보고서 1건). '12개월이 아님'으로 보면 첫 사업연도(설립일부터 결산일까지)가 걸려
 * 분·반기 기간만 본다. 결산기 변경 등으로 맞을 수 있어 확인 필요로만 둔다.
 */
function reviewHints(ctx, facts) {
  const out = [];
  const word = facts.cover.map((b) => ({ b, m: /반기|분기|검토보고서/.exec(tight(b.text)) })).find((x) => x.m);
  if (word) out.push({ text: `표지에 '${word.m[0]}'`, block: word.b.i, quote: word.m[0] });
  const { from, to } = ctx.period;
  const months = /^\d{6}01$/.test(from) && /^\d{8}$/.test(to) ? [3, 6, 9].find((n) => monthsEnd(from, n) === to) : undefined;
  if (months) {
    const cover = facts.cover.find((b) => b.kind === 'table' && b.aclass === 'EXTRACTION');
    out.push({ text: `사업연도 ${dateText(from)} ~ ${dateText(to)}(${months}개월)`, block: cover?.i ?? null, quote: '' });
  }
  return out;
}

export const RULES = [
  { no: 1, group: '서식버전', item: '최신서식 확인(6.0)', kind: 'auto',
    desc: '서식 버전과 문서 종류(감사보고서·연결감사보고서)가 내용과 맞는지 확인',
    check(doc, ctx, facts) {
      const out = [];
      const scope = scopeOf(doc);
      if (scope.inScope === false) out.push(onHead(bad(`점검 서식이 아닙니다. 이 파일은 ${scope.label}입니다. DART 제출 점검은 감사보고서(00760·00761)와 분·반기 검토보고서(90020·90220·90320·90420)만 점검합니다.`), 'DOC'));
      else if (scope.inScope === null) out.push(onHead(warn('문서 코드를 읽지 못했습니다. 감사보고서(00760)·연결감사보고서(00761)인지 확인하세요.'), 'DOC'));
      else {
        const hints = reviewHints(ctx, facts);
        if (hints.length) out.push(warn(`분·반기 검토보고서로 보입니다. ${hints.map((x) => x.text).join(' · ')}. 검토보고서이면 분·반기 검토보고서 서식으로 작성해야 합니다(결산기 변경 등으로 실제 감사보고서이면 그대로 둡니다).`, hints[0].block, hints[0].quote));
      }
      const ver = doc.meta.docver || doc.header.formVersion;
      const line = `문서명: ${doc.header.docName || '없음'} · 서식버전: ${ver || '없음'}`;
      const title = facts.cover.find((b) => b.kind === 'title') || inPart(doc, 'audit').find((b) => b.kind === 'title');
      out.push(ver === LATEST_FORM ? ok(line, title?.i ?? null, title?.text || '') : bad(`${line}. 최신 서식(${LATEST_FORM})으로 작성해야 합니다.`, title?.i ?? null, title?.text || ''));
      const names = facts.statements;
      const fsTitle = inPart(doc, 'fs').find((b) => b.kind === 'title');
      if (names.length) {
        const consolidatedFs = names.filter((s) => s.consolidated).length, separateFs = names.length - consolidatedFs;
        if (ctx.consolidated && separateFs > consolidatedFs) out.push(bad('연결감사보고서 서식에 별도감사보고서를 작성했습니다.', title?.i ?? names[0].titleBlock.i, title?.text || names[0].titleBlock.text));
        else if (!ctx.consolidated && consolidatedFs > separateFs) out.push(bad('감사보고서 서식에 연결감사보고서를 작성했습니다.', title?.i ?? names[0].titleBlock.i, title?.text || ''));
        else out.push(ok(`문서명(${doc.header.docName || (ctx.consolidated ? '연결감사보고서' : '감사보고서')})과 첨부 재무제표(${ctx.consolidated ? '연결' : '별도'})가 맞습니다.`, fsTitle?.i ?? null));
      }
      return out;
    } },
  { no: 2, group: '서식오류점검 기능', item: '파일형식 검사(F7)', kind: 'manual',
    desc: 'DART 편집기 [파일형식 검사]에서 오류가 없는지 확인. 오류가 있으면 공시용 DRT 파일을 만들 수 없습니다',
    check(doc) {
      const { count, problems, cautions } = editorVerify(doc);
      const careful = cautions.map((p) => warn(p.text, p.block, p.quote || ''));
      if (problems.length) return [bad(`파일형식검사 오류가 있습니다(아래 ${problems.length}건). ${FILE_CHECK_GUIDE}`),
        ...problems.map((p) => { const x = p.also ? vs(bad(p.text, p.block, p.quote), p.label, ...p.also) : bad(p.text, p.block, p.quote || ''); return p.head ? onHead(x, p.head) : x; }), ...careful];
      return [...careful, info(`${count && !careful.length ? `서식에 정의된 편집기 검사 규칙 ${count}개(사업연도 일치·선택값·투입 인원·시간 합계·빈 입력칸·헤더 빈칸·현금흐름표 계정코드)는 통과했습니다. 나머지는 ` : ''}${FILE_CHECK_GUIDE}`)];
    } },
  { no: 3, group: '전체 텍스트 점검', item: '본문/재무제표/주석', kind: 'auto',
    desc: '본문·재무제표·주석의 글자가 검은색이 아닌 곳(눈으로 검정과 구분되지 않는 진회색은 허용), DART 서식 견본 문구(XXXX·감사대상회사의 명칭 등)가 남은 곳',
    check(doc) {
      const out = [];
      const colors = doc.colors.filter((c) => !nearBlack(c.color));
      if (!colors.length) out.push(ok('검은색이 아닌 글자가 없습니다.'));
      else {
        out.push(...colors.slice(0, 30).map((c) => bad(`글자색 ${c.color}: "${short(c.text, 40) || '(빈 글)'}"`, c.block, c.text)));
        if (colors.length > 30) out.push(info(`외 ${colors.length - 30}곳`));
      }
      const left = templateLeftovers(doc);
      out.push(...left.slice(0, 20).map((l) => bad(`견본 문구가 남아 있습니다: "${l.text}"`, l.block, l.text)));
      if (left.length > 20) out.push(info(`외 ${left.length - 20}곳`));
      if (!left.length) out.push(ok('DART 서식 견본 문구가 남아 있지 않습니다.'));
      return out;
    } },
  { no: 4, group: '헤더정보', item: '기본정보', kind: 'auto',
    get desc() { return `회사 고유번호와 감사인 고유번호(${AUDITOR.cik})`; },
    check(doc) {
      const s = doc.header.summary, out = [];
      out.push(onHead(s.AUDIT_CIK === AUDITOR.cik ? ok(`감사인 고유번호 ${s.AUDIT_CIK}`) : bad(`감사인 고유번호가 '${s.AUDIT_CIK || '빈칸'}'입니다. ${AUDITOR.cik}로 입력해야 합니다.`, null, s.AUDIT_CIK), 'AUDIT_CIK'));
      const cik = doc.header.regcik || doc.meta.regcik;
      if (!/^\d{8}$/.test(cik || '')) out.push(onHead(bad(`회사 고유번호가 '${cik || '빈칸'}'입니다.`), 'REGCIK'));
      else out.push(onHead(ok(`회사 고유번호 ${cik} (${doc.header.company || doc.meta.regname})`), 'REGCIK'));
      if (doc.meta.regcik && doc.header.regcik && doc.meta.regcik !== doc.header.regcik) out.push(onHead(warn(`문서 정보(${doc.meta.regcik})와 헤더(${doc.header.regcik})의 고유번호가 다릅니다.`), 'REGCIK'));
      return out;
    } },
  { no: 5, group: '헤더정보', item: '추가정보: 법인등록번호', kind: 'auto', head: 'CRP_RGS_NO',
    desc: '법인등록번호 13자리와 검증번호',
    applies: (ctx, facts, doc) => checksHead(doc, facts, 'CRP_RGS_NO'),
    check(doc) {
      const v = doc.header.summary.CRP_RGS_NO || '';
      if (!/^\d{13}$/.test(v)) return [bad(`법인등록번호가 '${v || '빈칸'}'입니다. 13자리로 입력해야 합니다.`)];
      const sum = [...v.slice(0, 12)].reduce((a, d, i) => a + Number(d) * (i % 2 ? 2 : 1), 0);
      const check = (10 - (sum % 10)) % 10;
      const shown = `${v.slice(0, 6)}-${v.slice(6)}`;
      return check === Number(v[12]) ? [ok(`법인등록번호 ${shown}`)]
        : [bad(`법인등록번호 ${shown}의 검증번호(끝자리)가 맞지 않습니다. 등기부등본과 대조해 고쳐야 합니다.`)];
    } },
  { no: 6, group: '헤더정보', item: '추가정보: 재무정보(백만원 단위)', kind: 'auto', head: 'TOT_ASSETS',
    desc: '헤더 자산총계·부채총계·매출액과 첨부 재무제표 대조(반올림·버림 모두 인정)',
    check(doc, ctx, facts) {
      const s = doc.header.summary, out = [];
      const bs = facts.statements.find((x) => x.base === '재무상태표');
      const pl = facts.statements.find((x) => x.base === '포괄손익계산서' || x.base === '손익계산서');
      const items = [
        ['자산총계', 'TOT_ASSETS', bs, /^자산총계$/],
        ['부채총계', 'TOT_DEBTS', bs, /^부채총계$/],
        ['매출액', 'TOT_SALES', pl, SALES_ROW],
      ];
      for (const [label, code, st, re] of items) {
        const h = s[code];
        if (!/^-?\d+$/.test(h || '')) { out.push(onHead(bad(`헤더 ${label}이(가) '${h || '빈칸'}'입니다.`), code)); continue; }
        const found = currentAmount(st, re);
        if (!found || !st?.unit) { out.push(onHead(warn(`첨부 재무제표에서 ${josa(`${label}${!st?.unit && found ? ' 단위' : ''}`, '을', '를')} 찾지 못했습니다. 헤더 ${num(Number(h))}백만원을 직접 대조하세요.`, st?.main?.i ?? null), code)); continue; }
        const mil = (found.value * st.unit) / 1e6;
        const okValues = new Set([Math.round(mil), Math.trunc(mil), Math.floor(mil)]);
        if (okValues.has(Number(h))) out.push(ok(`${label}: 헤더 ${num(Number(h))}백만원 = 재무제표 ${num(found.value)}${st.unitText}`, st.main.i, found.cell.text));
        else out.push(vs(bad(`${label}: 헤더 ${num(Number(h))}백만원 ≠ 재무제표 ${num(found.value)}${st.unitText}(${num(Math.round(mil))}백만원)`, st.main.i, found.cell.text),
          `${st.name} ${label}`, { label: `헤더 ${label}`, head: code }));
      }
      return out;
    } },
  { no: 7, group: '헤더정보', item: '추가정보: 정기총회일 항목', kind: 'auto', head: 'GMSH_DATE',
    desc: '헤더 정기총회일과 이익잉여금처분계산서(결손금처리계산서)의 처분(처리)예정일 대조',
    applies: (ctx, facts, doc) => checksHead(doc, facts, 'GMSH_DATE'),
    check(doc) {
      const g = doc.header.summary.GMSH_DATE || '';
      if (!/^\d{8}$/.test(g)) return [bad(`헤더 정기총회일이 '${g || '빈칸'}'입니다.`)];
      const plan = appropriationOf(doc);
      if (!plan?.current) return [warn(`처분(처리)예정일을 찾지 못했습니다. 정기총회일 ${dateText(g)}을 주석과 직접 대조하세요.`)];
      return plan.current.date === g ? [ok(`정기총회일 ${dateText(g)} = ${plan.current.label} ${dateText(plan.current.date)}`, plan.block.i, plan.current.text)]
        : [vs(warn(`헤더 정기총회일(${dateText(g)})과 ${plan.current.label}(${dateText(plan.current.date)})이 다릅니다. 정기주주총회 또는 이사회 중 실제 처분(처리) 승인기관과 승인예정일을 확인하세요. 이사회 승인은 정관과 관련 승인요건을 별도로 대조해야 합니다.`, plan.block.i, plan.current.text), plan.current.label, { label: '헤더 정기주주총회일자', head: 'GMSH_DATE' })];
    } },
  { no: 8, group: '헤더정보', item: '기타사항 및 강조사항 선택항목', kind: 'auto',
    desc: '헤더의 기타사항 유무·강조사항 유무 선택이 감사보고서 본문과 같은지, 입력하지 않은 항목은 없는지',
    check(doc) {
      const s = doc.header.summary;
      const blocks = top(inPart(doc, 'audit'));
      const out = [];
      for (const [code, word] of [['ETC_OTHR_YN', '기타사항'], ['POW_OTHR_YN', '강조사항']]) {
        const v = s[code] || '';
        const b = blocks.find((x) => lineStarts(x, word));
        if (!/^[YN]$/.test(v)) { out.push(onHead(bad(`헤더 '${word}의 유무'를 입력하지 않았습니다.`), code)); continue; }
        if (b && v === 'N') out.push(vs(bad(`본문에 ${word} 문단이 있는데 헤더 '${word}의 유무'를 '없음(N)'으로 선택했습니다.`, b.i, word), `본문 ${word}`, { label: `헤더 ${word}의 유무`, head: code }));
        else if (!b && v === 'Y') out.push(onHead(bad(`헤더 '${word}의 유무'를 '있음(Y)'으로 선택했는데 본문에 ${word} 문단이 없습니다.`), code));
        else out.push(onHead(ok(`${word}: 헤더 ${v === 'Y' ? '있음' : '없음'} = 본문 ${b ? '있음' : '없음'}`, b?.i ?? null, b ? word : ''), code));
      }
      const acc = s.ACC_PROF_YN || '';
      if (!/^[YN]$/.test(acc)) out.push(onHead(bad("헤더 '회계변경의 유무'를 입력하지 않았습니다."), 'ACC_PROF_YN'));
      else out.push(onHead(info(`헤더 회계변경의 유무: ${acc === 'Y' ? '있음' : '없음'}. 주석의 회계정책 변경과 같은지 확인하세요.`), 'ACC_PROF_YN'));
      return out;
    } },
  { no: 9, group: '헤더정보', item: 'IFRS 적용유무', kind: 'auto', head: 'IFRS_YN',
    desc: "IFRS 적용유무가 감사의견의 회계기준과 같은지. 'IFRS 미적용'이면 재무제표 검사 후 생성된 dat 파일(C:\\DART\\User)을 공시신청 때 첨부. '작성(검사)하지 않는 서식'을 골랐으면 그 사유",
    manualPart: (ctx) => (ctx.ifrsHeader === false || (ctx.ifrsHeader === null && !ctx.ifrs) ? '재무제표 검사(F9) 완료, dat 파일 첨부' : ''),
    check(doc, ctx) {
      const v = doc.header.summary.IFRS_YN || '';
      if (!/^[YN]$/.test(v)) return [bad(`헤더 IFRS 적용유무가 '${v || '빈칸'}'입니다.`)];
      const { opinion } = auditOpinionBlocks(doc);
      const body = opinionStandard(opinion?.text || '');
      const out = [];
      if (!body) out.push(warn('감사의견 문단에서 회계기준을 찾지 못했습니다.', opinion?.i ?? null));
      else if (body !== v) out.push(vs(bad(`헤더 IFRS 적용유무(${v})와 감사의견의 회계기준(${body === 'Y' ? '한국채택국제회계기준' : '일반기업회계기준'})이 다릅니다.`, opinion.i, body === 'Y' ? '한국채택국제회계기준' : '일반기업회계기준'),
        '감사의견', { label: '헤더 IFRS 적용유무', head: 'IFRS_YN' }));
      else out.push(ok(`IFRS ${v === 'Y' ? '적용' : '미적용'}. 감사의견의 회계기준과 같습니다.`, opinion.i, v === 'Y' ? '한국채택국제회계기준' : '일반기업회계기준'));
      if (v === 'N') out.push(info('IFRS 미적용: DART 편집기 재무제표 검사로 생성된 dat 파일(C:\\DART\\User)을 공시신청 때 첨부하세요.'));
      const fin = String(doc.header.summary.FIN_STAT || '');
      if (fin[1] === '1') out.push(onHead(warn("헤더 '작성(검사)하지 않는 서식'에 현금흐름표를 골랐습니다. 재무제표 검사에서 신설할 수 없는 계정(환율변동효과 등) 때문인지 확인하세요."), 'FIN_STAT'));
      if (fin[2] === '1') out.push(onHead(warn("헤더 '작성(검사)하지 않는 서식'에 '전체 단위서식(외국법인의 경우)'을 골랐습니다. 외국법인인지 확인하세요."), 'FIN_STAT'));
      return out;
    } },
  { no: 10, group: '헤더정보', item: '연결재무제표 작성여부', kind: 'auto', head: 'LINK_FLAG',
    desc: "헤더 '연결 재무제표 작성여부'가 연결감사보고서 작성 여부(종속기업 유무)와 같은지, 재무제표 누락유무",
    applies: (ctx, facts, doc) => checksHead(doc, facts, 'LINK_FLAG'),
    check(doc, ctx, facts, options) {
      const s = doc.header.summary, out = [];
      const link = s.LINK_FLAG || '';
      const notes = inPart(doc, 'notes');
      const found = notes.find((b) => /회사의종속기업|종속기업현황|종속기업투자|별도재무제표/.test(tight(b.text)));
      const sub = found || (link === 'Y' && (notes.find((b) => b.kind === 'table' && b.grid?.some((row) => row.some((c) => /^종속(?:기업|회사)들?$/.test(tight(c.text)))))
        || (options?.other && contextOf(options.other).consolidated && { i: null })));
      if (!/^[YN]$/.test(link)) out.push(bad("헤더 '연결 재무제표 작성여부'를 입력하지 않았습니다."));
      else if (ctx.consolidated && link === 'N') out.push(bad("연결감사보고서인데 헤더 '연결 재무제표 작성여부'를 '아니오(N)'로 선택했습니다."));
      else if (!ctx.consolidated && link === 'Y' && !sub) out.push(warn("헤더 '연결 재무제표 작성여부'가 '예(Y)'인데 주석에서 종속기업을 찾지 못했습니다. 연결감사보고서 작성 대상인지 확인하세요."));
      else if (!ctx.consolidated && link === 'N' && sub) out.push(vs(bad("주석에 종속기업이 있는데 헤더 '연결 재무제표 작성여부'를 '아니오(N)'로 선택했습니다. 연결감사보고서를 작성하는 회사는 '예(Y)'로 선택해야 합니다.", sub.i, '종속기업'), '주석 종속기업', { label: '헤더 연결 재무제표 작성여부', head: 'LINK_FLAG' }));
      else out.push(ok(`연결 재무제표 작성여부: ${link === 'Y' ? '예' : '아니오'}${!ctx.consolidated && link === 'Y' ? '. 연결감사보고서도 공시 대상입니다.' : ''}`, sub?.i ?? null, found ? '종속기업' : ''));
      const fin = s.FIN_YN || '';
      if (fin && fin !== 'N') out.push(onHead(warn(`헤더 '재무제표 누락유무'가 '누락있음(${HEADER_CODES.omission[fin] || fin})'입니다.`), 'FIN_YN'));
      return out;
    } },
  { no: 11, group: '헤더정보', item: '감사의견 및 내부회계관리제도 감사 또는 검토의견', kind: 'auto',
    desc: '헤더 감사의견·내부회계관리제도 감사(검토)의견을 입력했는지, 보고서 내용과 같은지',
    check(doc, ctx, facts) {
      const s = doc.header.summary, out = [];
      const current = currentAuditOpinion(doc), opinion = current.block;
      const body = current.multiple ? '' : firmOpinion(current.text);
      const head = HEADER_CODES.opinion[Number(String(s.SUPV_OPIN || '').slice(0, 2))] || '';
      if (!s.SUPV_OPIN) out.push(bad('헤더 감사의견을 입력하지 않았습니다.'));
      else if (!head) out.push(bad(`헤더 감사의견 값(${s.SUPV_OPIN})을 읽을 수 없습니다.`));
      else if (body && body !== head) out.push(vs(bad(`헤더 감사의견(${head})과 감사보고서 의견(${body})이 다릅니다.`, opinion.i), '감사의견 문단', { label: '헤더 감사의견', head: 'SUPV_OPIN' }));
      else if (current.multiple) out.push(warn(`헤더 감사의견은 ${head}이지만 당기 의견 제목을 여럿 식별했습니다. 분리 의견과 헤더의 일치 여부를 직접 확인하세요.`, opinion?.i ?? null));
      else if (!body) out.push(warn(`헤더 감사의견은 ${head}이지만 당기 감사의견 본문을 식별하지 못했습니다. 본문과 헤더의 일치 여부를 직접 확인하세요.`, opinion?.i ?? null));
      else out.push(ok(`감사의견: 헤더 ${head} = 본문 ${body}`, opinion?.i ?? null));
      const mark = (from, code) => out.slice(from).forEach((x) => onHead(x, code));
      mark(0, 'SUPV_OPIN');
      let from = out.length;
      if (!checksHead(doc, facts, 'PREV_IACS')) return out;
      const ic = s.PREV_IACS || '', icName = HEADER_CODES.icfrOpinion[ic];
      if (!ic) out.push(bad('헤더 내부회계관리제도 감사(검토)의견을 입력하지 않았습니다.'));
      else if (!icName) out.push(bad(`헤더 내부회계관리제도 의견 값(${ic})을 읽을 수 없습니다.`));
      else if (ctx.icfr !== 'none') {
        const t = tight(inPart(doc, 'icfr').map((b) => b.text).join(''));
        const icBody = ctx.icfr === 'audit'
          ? (t.includes('효과적으로설계및운영되고있지않') || t.includes('중요한취약점이존재합니다') ? '비적정' : t.includes('효과적으로설계및운영되고있습니다') ? '적정' : '')
          : (t.includes('발견되지아니하였습니다') || t.includes('발견되지않았습니다') ? '적정' : t ? '비적정' : '');
        const block = inPart(doc, 'icfr')[0]?.i ?? null;
        if (ic === '3' || ic === '4') out.push(bad(`내부회계관리제도 ${ctx.icfr === 'audit' ? '감사' : '검토'}보고서가 첨부되어 있는데 헤더 의견을 '${icName}'으로 선택했습니다.`, block));
        else if (icBody && icBody !== icName) out.push(vs(bad(`헤더 내부회계 의견(${icName})과 보고서 내용(${icBody})이 다릅니다.`, block), '내부회계 보고서', { label: '헤더 내부회계 의견', head: 'PREV_IACS' }));
        else out.push(ok(`내부회계관리제도 의견: 헤더 ${icName}${icBody ? ` = 보고서 ${icBody}` : ''}`, block));
      } else if (ic === '1' || ic === '2') out.push(bad(`헤더 내부회계 의견이 '${icName}'인데 내부회계관리제도 감사(검토)보고서가 없습니다.`));
      else out.push(ok(`내부회계관리제도 의견: ${icName}`));
      mark(from, 'PREV_IACS');
      from = out.length;
      const yn = s.PREV_YN;
      if (icName && /^[YN]$/.test(yn || '') && ((ic === '1' || ic === '2') !== (yn === 'Y'))) out.push(bad(`헤더 내부회계 의견(${icName})과 보고서 첨부 여부(${yn})가 맞지 않습니다. 적정·비적정이면 Y, 미제출·제출대상 아님이면 N이어야 합니다.`));
      mark(from, 'PREV_YN');
      for (const x of out.slice(from)) if (x.level === 'fail') vs(x, '헤더 첨부 여부', { label: '헤더 내부회계 의견', head: 'PREV_IACS' });
      return out;
    } },
  { no: 12, group: '헤더정보', item: '내부회계관리제도 감사(검토)보고서 첨부여부(Y or N)', kind: 'auto', head: 'PREV_YN',
    desc: '헤더 첨부여부(Y/N)와 실제 첨부(내부회계관리제도 감사 또는 검토의견 단위서식) 대조',
    applies: (ctx, facts, doc) => checksHead(doc, facts, 'PREV_YN'),
    check(doc) {
      const v = doc.header.summary.PREV_YN || '';
      const ins = insertion(doc, '내부회계관리제도감사또는검토의견');
      const attached = !!ins?.inserted || inPart(doc, 'icfr').length > 0;
      if (!/^[YN]$/.test(v)) return [bad(`헤더 내부회계 보고서 첨부여부가 '${v || '빈칸'}'입니다.`)];
      const block = inPart(doc, 'icfr')[0]?.i ?? null;
      if (v === 'N' && attached) return [vs(bad("첨부여부를 'N'으로 선택했으나 내부회계관리제도 감사(검토)보고서가 첨부되어 있습니다.", block), '첨부된 내부회계 보고서', { label: '헤더 첨부 여부', head: 'PREV_YN' })];
      if (v === 'Y' && !attached) return [bad("첨부여부를 'Y'로 선택했으나 내부회계관리제도 감사(검토)보고서가 첨부되지 않았습니다.")];
      return [ok(`첨부여부 ${v}(실제 ${attached ? '첨부됨' : '첨부 없음'})`, block)];
    } },
  { no: 13, group: '감사보고서 표지', item: '표지 사업연도', kind: 'auto',
    desc: '표지 Click 사업연도는 당기 필수. 당기 의견만 표명하는 보고서(신규 수임)는 전기 사업연도를 표시하지 않음',
    check(doc, ctx, facts) {
      const out = [];
      const click = facts.cover.find((b) => b.kind === 'table' && b.aclass === 'EXTRACTION');
      if (!click || !ctx.period.to) return [bad('표지 사업연도(Click)를 찾지 못했습니다.')];
      const { list } = auditOpinionBlocks(doc);
      const firstDate = findDates(list?.text || '')[0]?.date;
      if (firstDate && firstDate !== ctx.period.to) out.push(vs(bad(`표지 사업연도 종료일(${dateText(ctx.period.to)})이 감사의견의 당기말(${dateText(firstDate)})과 다릅니다.`, click.i), '표지 사업연도',
        { label: '감사의견', block: list.i, quote: findDates(list.text)[0]?.text }));
      else out.push(ok(`표지 사업연도: 제 ${ctx.period.gi ?? '?'} 기 ${dateText(ctx.period.from)} ~ ${dateText(ctx.period.to)}`, click.i));
      out.push(...storedDateErrors(periodCells(click), '표지 사업연도', click.i));
      const others = facts.cover.filter((b) => b.kind === 'table' && b !== click && GI.test(b.text) && findDates(b.text).length);
      if (ctx.newEngagement && others.length) out.push(bad('당기 의견만 표명하는 보고서(신규 수임)인데 표지에 전기 사업연도를 표시했습니다.', others[0].i, firstLine(others[0].text)));
      else if (!ctx.newEngagement && ctx.period.gi > 1 && !others.length) out.push(bad(`당기·전기 의견을 표명하는 보고서인데 표지에 전기(제 ${ctx.period.gi - 1} 기) 사업연도가 없습니다.`, click.i));
      else if (others.length) {
        const prev = others[0], gi = giOf(prev.text), end = findDates(prev.text).at(-1)?.date;
        if ((ctx.period.gi && gi !== ctx.period.gi - 1) || (end && end !== yearBefore(ctx.period.to))) out.push(bad(`표지 전기 사업연도가 '제 ${gi} 기 ~${dateText(end)}'입니다. 제 ${ctx.period.gi - 1} 기 ~${dateText(yearBefore(ctx.period.to))}로 적어야 합니다.`, prev.i, firstLine(prev.text)));
        else out.push(ok(`표지 전기 사업연도: 제 ${gi} 기 ~${dateText(end)}`, prev.i));
      }
      for (const b of [click, ...others]) for (const m of markErrors(b.text, ctx.period.gi)) out.push(bad(`표지 사업연도에 '${m.text}'로 적었습니다. ${m.want === '전' ? '전기' : '당기'}는 '(${m.want})'입니다.`, b.i, m.text));
      return out;
    } },
  { no: 14, group: '감사보고서 표지', item: '표지하단 "감사인명" 기재항목', kind: 'auto',
    get desc() { return `표지 하단 감사인 명칭(${AUDITOR.name}) 기재·견본 문구 '감사인 명칭' 삭제, 표지 보고서명(내부회계관리제도 감사보고서 포함 여부), 표지·본문·재무제표 표지의 회사명 일치`; },
    check(doc, ctx, facts) {
      const out = [];
      const cover = facts.cover.filter((b) => flat(b.text));
      const hit = cover.find((b) => tight(b.text).includes(tight(AUDITOR.name)));
      out.push(hit ? ok(`표지 감사인명: ${AUDITOR.name}`, hit.i, hit.text) : bad(`표지에 감사인 명칭(${AUDITOR.name})이 없습니다.`, facts.cover.at(-1)?.i ?? null));
      const sample = cover.find((b) => tight(b.text).includes('감사인명칭'));
      if (sample) out.push(bad("표지에 견본 문구 '감사인 명칭'이 남아 있습니다.", sample.i, '감사인 명칭'));
      const sub = cover.find((b) => tight(b.text).endsWith('에대한'));
      if (!sub) out.push(warn("표지 보고서명('… 에 대한 감사보고서')을 찾지 못했습니다."));
      else {
        const name = `${flat(sub.text).replace(/\s+/g, ' ')} 감사보고서`;
        const withIcfr = tight(sub.text).includes('내부회계관리제도');
        if (ctx.icfr === 'audit' && !withIcfr) out.push(bad(`내부회계관리제도 감사보고서를 첨부했는데 표지 보고서명이 '${name}'입니다. '재무제표 및 내부회계관리제도에 대한 감사보고서'로 적어야 합니다.`, sub.i, sub.text));
        else if (ctx.icfr !== 'audit' && withIcfr) out.push(bad(`내부회계관리제도 감사보고서가 없는데 표지 보고서명에 '내부회계관리제도'가 있습니다('${name}').`, sub.i, sub.text));
        else out.push(ok(`표지 보고서명: ${name}${ctx.icfr === 'audit' ? '' : '. 내부회계관리제도 감사보고서가 없어 맞습니다.'}`, sub.i, sub.text));
      }
      const names = [];
      const headName = doc.header.company || doc.meta.regname;
      if (headName) names.push(['헤더', headName, null]);
      const looksCompany = (s) => /주식회사|\(주\)|㈜|유한회사|유한책임회사/.test(tight(s)) && !/제\d+기|\d{4}년|귀중|귀하|특별시|광역시|[시군구]\s/.test(flat(s));
      const companyCell = (blocks) => {
        for (const b of blocks) {
          const cell = b.kind === 'table' ? b.grid.flat().find((c) => looksCompany(c.text)) : null;
          if (cell) return { text: flat(cell.text), i: b.i };
        }
        return null;
      };
      const coverName = cover.find((b) => b.kind === 'p' && looksCompany(b.text));
      if (coverName) names.push(['표지', flat(coverName.text), coverName.i]);
      const auditTo = companyCell(top(inPart(doc, 'audit')).filter((b) => b.kind === 'table').slice(0, 2));
      if (auditTo) names.push(['감사보고서', auditTo.text, auditTo.i]);
      const firstStatement = facts.statements[0]?.titleBlock.i ?? Infinity;
      const fsCover = companyCell(top(inPart(doc, 'fs')).filter((b) => b.kind === 'table' && b.i < firstStatement).slice(0, 3));
      if (fsCover) names.push(['재무제표 표지', fsCover.text, fsCover.i]);
      const base = names.find(([, n]) => n)?.[1] || '';
      const differ = names.filter(([, n]) => n && companyKey(n, ctx.consolidated) !== companyKey(base, ctx.consolidated));
      const body = names.filter(([where, n]) => where !== '헤더' && n);
      const headerOnly = names[0]?.[0] === '헤더' && body.length > 0 && differ.length === body.length
        && body.every(([, n]) => companyKey(n, ctx.consolidated) === companyKey(body[0][1], ctx.consolidated));
      if (!names.length) out.push(warn('회사명을 찾지 못했습니다.'));
      else if (headerOnly) out.push(vs(warn(`표지·본문의 회사명 '${body[0][1]}'이(가) 헤더 회사명(DART 등록 이름 '${base}')과 다릅니다. 헤더와 본문 중 어떤 정보가 맞는지 확인하세요. 상호 변경이 아니면 회사명 오류입니다.`, body[0][2], body[0][1]),
        `${body[0][0]} 회사명`, { label: '헤더 회사명', head: 'COMPANY' }));
      else if (differ.length) {
        const [baseWhere, , baseAt] = names.find(([, n]) => n);
        const baseLoc = baseAt === null ? { label: `${baseWhere} 회사명`, head: 'COMPANY' } : { label: `${baseWhere} 회사명`, block: baseAt, quote: base };
        out.push(...differ.map(([where, n, i]) => vs(bad(`${where}의 회사명 '${n}'이(가) '${base}'와 다릅니다.`, i, n), `${where} 회사명`, baseLoc)));
      }
      else out.push(ok(`회사명 일치(${base}): ${names.map(([where]) => where).join(' · ')}`, coverName?.i ?? null, coverName ? flat(coverName.text) : ''));
      if (facts.fsConsolidated) {
        if (coverName && !subsidiaryWord(coverName.text)) out.push(bad(`연결감사보고서 표지 회사명을 '${withSubsidiary(flat(coverName.text))}'처럼 적어야 합니다.`, coverName.i, flat(coverName.text)));
        if (auditTo && subsidiaryWord(auditTo.text)) out.push(bad(`감사보고서 수신('주주 및 이사회 귀중') 위에는 회사명만 적습니다('${auditTo.text}'에서 '와 그 ${subsidiaryWord(auditTo.text)}'를 지우세요).`, auditTo.i, auditTo.text));
      }
      const words = names.filter(([, n]) => subsidiaryWord(n));
      const mixed = words.find(([, n]) => subsidiaryWord(n) !== subsidiaryWord(words[0][1]));
      if (mixed) out.push(vs(warn(`${josa(mixed[0], '은', '는')} '${subsidiaryWord(mixed[1])}', ${josa(words[0][0], '은', '는')} '${subsidiaryWord(words[0][1])}'로 적었습니다. 한 가지로 맞추세요.`, mixed[2], mixed[1]),
        `${mixed[0]} 회사명`, words[0][2] === null ? { label: `${words[0][0]} 회사명`, head: 'COMPANY' } : { label: `${words[0][0]} 회사명`, block: words[0][2], quote: words[0][1] }));
      return out;
    } },
  { no: 15, group: '감사보고서 목차', item: '목차 서식 이용여부', kind: 'auto',
    desc: "도구 > '자동목차생성'으로 만든 목차인지",
    check(doc, ctx, facts) {
      if (facts.toc.length) return [ok('자동목차생성 목차가 있습니다.', facts.toc[0].i)];
      const typed = facts.cover.find((b) => tight(b.text) === '목차');
      return [bad(typed ? '목차를 표지에 직접 입력했습니다. 도구 > 자동목차생성으로 만들어야 합니다.' : '목차가 없습니다. 도구 > 자동목차생성으로 만들어야 합니다.', typed?.i ?? null, typed?.text || '')];
    } },
  { no: 16, group: '감사보고서 목차', item: '"독립된 감사인" 표기', kind: 'auto',
    desc: "'독립된 감사인의 감사보고서', '독립된 감사인의 내부회계관리제도 감사(검토)보고서'로 기재",
    check(doc, ctx, facts) {
      const out = [];
      const title = inPart(doc, 'audit').find((b) => b.kind === 'title');
      if (!title) out.push(bad('감사보고서 제목을 찾지 못했습니다.'));
      else if (tight(title.text) !== '독립된감사인의감사보고서') out.push(bad(`감사보고서 제목이 '${title.text}'입니다. '독립된 감사인의 감사보고서'로 적어야 합니다.`, title.i, title.text));
      else out.push(ok('감사보고서 제목: 독립된 감사인의 감사보고서', title.i));
      const tocText = tight(facts.toc.map((b) => b.text).join(''));
      if (facts.toc.length && !tocText.includes('독립된감사인의감사보고서')) {
        const wrong = /외부감사인의감사보고서/.test(tocText) ? '외부감사인의 감사보고서' : '';
        out.push(bad(`목차에 '독립된 감사인의 감사보고서'가 없습니다${wrong ? `('${wrong}'로 적음)` : ''}.`, facts.toc[0].i, wrong));
      }
      if (ctx.icfr !== 'none') {
        const word = ctx.icfr === 'audit' ? '감사' : '검토', T = icfrTerm(ctx);
        const name = `독립된감사인의${T}${word}보고서`;
        const icfrTitle = top(inPart(doc, 'icfr')).find((b) => lineStarts(b, name));
        if (!icfrTitle) out.push(bad(`'독립된 감사인의 ${T} ${word}보고서' 제목을 찾지 못했습니다.`));
        else out.push(ok(`내부회계 제목: 독립된 감사인의 ${T} ${word}보고서`, icfrTitle.i));
        if (facts.toc.length && !tocText.includes(name)) {
          const near = tocText.includes(`${T}${word}보고서`);
          if (!near && tocText.includes('내부회계관리제도감사또는검토의견')) out.push(ok("목차: '내부회계관리제도 감사 또는 검토의견'(보고서 이름은 생략)", facts.toc[0].i, '내부회계관리제도 감사 또는 검토의견'));
          else out.push(bad(near ? `목차에 '${T} ${word}보고서'로 적었습니다. '독립된 감사인의 ${T} ${word}보고서'로 적어야 합니다.`
            : `목차에 '독립된 감사인의 ${T} ${word}보고서'가 없습니다.`, facts.toc[0].i, near ? `${T} ${word}보고서` : ''));
        } else if (facts.toc.length) out.push(ok(`목차: 독립된 감사인의 ${T} ${word}보고서`, facts.toc[0].i));
        if (tocText.includes('운영실태평가보고서')) out.push(bad("목차에 옛 이름 '운영실태평가보고서'로 적었습니다. '회사의 내부회계관리제도 운영실태보고서'로 적어야 합니다.", facts.toc[0].i, '운영실태평가보고서'));
      }
      return out.map((x) => (facts.toc.length && x.block === facts.toc[0].i ? atToc(doc, facts, x) : x));
    } },
  { no: 17, group: '감사보고서 목차', item: '주석 표기(재무제표 명칭)', kind: 'auto',
    desc: '목차와 첨부 재무제표의 재무제표 명칭 비교',
    applies: (ctx, facts) => facts.toc.length > 0,
    check(doc, ctx, facts) {
      const toc = new Set(statementNames(facts.toc.map((b) => b.text).join('')).filter((n) => MAIN_STATEMENTS.includes(n.replace(/^연결/, ''))));
      const fs = new Set(facts.statements.map((s) => s.name));
      const out = [];
      for (const n of fs) if (!toc.has(n)) out.push(bad(`첨부 재무제표 '${n}'이(가) 목차에 없습니다.`, facts.toc[0].i));
      for (const n of toc) if (!fs.has(n)) out.push(bad(`목차의 '${n}'이(가) 첨부 재무제표에 없습니다.`, facts.toc[0].i, n));
      if (!out.length) out.push(ok(`목차와 첨부 재무제표 명칭이 같습니다(${[...fs].join(', ')}).`, facts.toc[0].i));
      return out.map((x) => atToc(doc, facts, x));
    } },
  { no: 18, group: '독립된 감사인의 감사보고서(본문)', item: '감사의견', kind: 'auto',
    desc: "보고서 머리의 '회사명 / 주주 및 이사회 귀중', 의견 표명 대상 사업연도(신규 수임은 당기만)와 재무제표 명칭이 모두 들어 있는지",
    check(doc, ctx, facts) {
      const { list, opinion, altWording } = auditOpinionBlocks(doc);
      const to = addresseeFindings(doc);
      if (!list) return [...to, bad("감사의견 문단('해당 재무제표는 …')을 찾지 못했습니다.")];
      const out = [...to];
      if (altWording) out.push(bad("감사의견에 '동 재무제표는'으로 적었습니다. '해당 재무제표는'으로 적어야 합니다.", list.i, '동 재무제표는'));
      const cur = ctx.period.to, prev = yearBefore(cur);
      const sentence = (block, start) => { const t = flat(paragraphsOf(block).map((p) => p.text).join(' ')), at = t.indexOf(start); if (at < 0) return ''; const s = t.slice(at); const end = s.search(/습니다\.|있습니다/); return end > 0 ? s.slice(0, end + 4) : s.slice(0, 300); };
      const listText = sentence(list, '해당 ') || sentence(list, '해당') || sentence(list, '동 '), opinionText = sentence(opinion, '우리의 의견으로는');
      const dates = new Set(findDates(listText || list.text).map((d) => d.date).concat(findDates(opinionText).map((d) => d.date)));
      const both = dates.has(cur) && dates.has(prev);
      if (!dates.has(cur)) out.push(bad(`감사의견에 당기말(${dateText(cur)})이 없습니다.`, list.i));
      if (ctx.newEngagement && both) out.push(bad(`당기만 의견 표명 대상(신규 수임)인데 감사의견에 전기(${dateText(prev)})까지 적었습니다.`, list.i, dateText(prev)));
      else if (!ctx.newEngagement && !both) out.push(bad(`당기·전기가 모두 의견 표명 대상인데 감사의견에 당기만 적었습니다.`, list.i));
      else out.push(ok(`의견 표명 대상: ${ctx.newEngagement ? '당기' : '당기·전기'}`, list.i));
      out.push(...statementListFindings(list.text, list, facts, '감사의견'));
      if (opinion) out.push(...standardFindings(opinion, '감사의견'));
      out.push(...auditWordingFindings(doc, ctx, facts, list, listText, opinion, opinionText));
      return out;
    } },
  { no: 19, group: '독립된 감사인의 감사보고서(본문)', item: '기타사항 및 강조사항', kind: 'auto',
    desc: '강조사항 → 기타사항 순서, 계속기업 관련 중요한 불확실성 → 핵심감사사항 순서',
    check(doc, ctx) {
      const blocks = top(inPart(doc, 'audit'));
      const lines = blocks.flatMap((b) => paragraphsOf(b)).map((p, position) => ({ ...p, position,
        heading: p.text.replace(/^\s*(?:\(\d+\)|\d+[.)])\s*/, '') }));
      const at = (w) => lines.find((p) => isHeadingLine(p.heading, w));
      const emphasis = at('강조사항'), other = at('기타사항'), going = at('계속기업 관련 중요한 불확실성'), kam = at('핵심감사사항');
      const out = [];
      for (const name of ['강조사항', '기타사항', '계속기업 관련 중요한 불확실성', '핵심감사사항']) {
        for (const b of blocks) {
          const ambiguous = b.node && findAll(b.node, 'SPAN').find((n) => hasBoldStyle(n)
            && isHeadingLine(textOf(n).replace(/^\s*(?:\(\d+\)|\d+[.)])\s*/, ''), name) && inlineFormattedHeading(n, b.node));
          if (ambiguous) out.push({ ...warn(`서식 글에서 '${name}' 제목 후보를 찾았으나 문단 경계를 확인하지 못했습니다. 실제 제목인지, 내용과 순서가 적절한지 원문에서 확인하세요.`, b.i, textOf(ambiguous)), unresolvedReportHeading: name });
        }
        const repeated = lines.filter((p) => isHeadingLine(p.heading, name));
        if (repeated.length > 1) out.push(warn(`${name} 제목이 ${repeated.length}번 나옵니다. 각 문단의 내용과 제목 구분이 적절한지 확인하세요.`, repeated[1].block, name));
      }
      if (emphasis && other && emphasis.position > other.position) out.push(warn('기타사항이 강조사항보다 앞에 있습니다. 문단의 성격과 감사인의 판단에 따른 배치인지 확인하세요.', other.block, '기타사항'));
      if (going && kam && going.position > kam.position) out.push(bad('계속기업 관련 중요한 불확실성이 핵심감사사항보다 뒤에 있습니다.', going.block, '계속기업'));
      const boundaries = ['감사의견', '한정의견', '부적정의견', '의견거절', '감사의견근거', '감사의견의근거',
        '한정의견근거', '한정의견의근거', '부적정의견근거', '부적정의견의근거', '의견거절근거', '의견거절의근거',
        '강조사항', '기타사항', '핵심감사사항', '계속기업관련중요한불확실성',
        '재무제표에대한경영진의책임', '연결재무제표에대한경영진의책임',
        '재무제표에대한경영진과지배기구의책임', '연결재무제표에대한경영진과지배기구의책임',
        '재무제표감사에대한감사인의책임', '연결재무제표감사에대한감사인의책임'];
      for (const other of lines.filter((p) => isHeadingLine(p.heading, '기타사항'))) {
        const following = lines.slice(other.position + 1);
        const stop = following.findIndex((p) => boundaries.some((h) => isHeadingLine(p.heading, h)));
        const otherText = [other, ...(stop < 0 ? following : following.slice(0, stop))].map((p) => p.text).join('\n');
        if (/(?:전임|타|다른)감사인|회계법인이.*감사/.test(tight(otherText))) {
          if (!/적정|한정|부적정|의견거절/.test(tight(otherText))) out.push(warn('전임감사인 기타사항에서 전기 감사의견 유형을 찾지 못했습니다. 비교정보 유형과 재발행 예외를 확인하고 전기 보고서와 대조하세요.', other.block, '기타사항'));
          if (!/\d{4}년\d{1,2}월\d{1,2}일자?(?:의)?감사보고서/.test(tight(otherText))) out.push(warn('전임감사인 기타사항에서 전기 감사보고서일을 찾지 못했습니다. 재무제표 기준일과 구분하여 전기 보고서와 대조하세요.', other.block, '기타사항'));
          if (/한정|부적정|의견거절/.test(tight(otherText)) && !/사유|이유|근거|때문|제외|제한/.test(tight(otherText))) out.push(warn('전임감사인의 변형의견 사유가 기재되었는지 전기 보고서와 대조하세요.', other.block, '기타사항'));
        }
        if (!going && /계속기업.*불확실성/.test(tight(otherText))) out.push(warn('기타사항의 계속기업 불확실성이 전기 감사의견 인용인지 당기 사항인지 확인하세요. 당기 사항이면 의견 유형과 공시 적정성에 따라 별도 문단 또는 변형의견 근거에 기재할지 검토하세요.', other.block, '계속기업'));
      }
      if (!out.length) {
        const order = [['계속기업', going], ['강조사항', emphasis], ['핵심감사사항', kam], ['기타사항', other]].filter(([, b]) => b).sort((a, b) => a[1].position - b[1].position);
        out.push(ok(`문단 순서: ${order.map(([name]) => name).join(' → ') || '해당 문단 없음'}`, order[0]?.[1].block ?? null));
      }
      return out;
    } },
  { no: 20, group: '독립된 감사인의 감사보고서(본문)', item: '핵심감사사항', kind: 'auto',
    desc: '주석번호 기재, 3가지 구성요소(소제목·결정된 이유·다루어진 방법), 주석번호가 실제 주석과 맞는지',
    manualPart: () => '핵심감사사항 금액·내용이 주석과 같은지',
    applies: (ctx, facts, doc) => ctx.listed || top(inPart(doc, 'audit')).some((b) => lineStarts(b, '핵심감사사항')),
    check(doc) {
      const blocks = top(inPart(doc, 'audit'));
      const start = blocks.findIndex((b) => lineStarts(b, '핵심감사사항'));
      if (start < 0) return [warn('핵심감사사항이 기재되어 있지 않습니다. 기재 대상인지 확인하세요.')];
      const stops = ['기타사항', '강조사항', '재무제표에대한경영진', '연결재무제표에대한경영진', '계속기업관련중요한불확실성'];
      const lines = [];
      blocks.slice(start).forEach((b, k) => {
        const ls = String(b.text).split('\n').filter((l) => l.trim());
        const from = k ? 0 : ls.findIndex((l) => tight(l).startsWith('핵심감사사항')) + 1;
        for (const l of ls.slice(from)) lines.push({ b, l });
      });
      const stop = lines.findIndex((x) => stops.some((w) => tight(x.l).startsWith(w)));
      const body = stop < 0 ? lines : lines.slice(0, stop);
      const end = body.length ? body.at(-1).b.i : blocks[start].i;
      const items = [];
      const heads = new Set();
      const part = (l) => tight(l).replace(/^(?:\(?[가-하]\)|[가-하][.)]|[①-⑳]|[-·ㆍ•])/, '');
      body.forEach((x, k) => {
        const t = part(x.l);
        if (/^\(\d+\)/.test(flat(x.l)) && /핵심감사사항으로결정[된한]이유/.test(t)) { heads.add(k); return; }
        if (!/^핵심감사사항으로결정[된한]이유/.test(t)) return;
        let at = -1;
        for (let j = k - 1; j >= Math.max(0, k - 3); j--) {
          const tj = part(body[j].l);
          if (/^핵심감사사항|감사에서다루어진방법/.test(tj)) break;
          if (/^\(\d+\)/.test(flat(body[j].l))) { at = j; break; }
        }
        if (at < 0 && k > 0 && !/^핵심감사사항/.test(part(body[k - 1].l))) at = k - 1;
        if (at >= 0) heads.add(at);
      });
      body.forEach((x, k) => {
        if (heads.has(k)) items.push({ head: { i: x.b.i, text: x.l }, text: x.l, last: x.b.i });
        else if (items.length) Object.assign(items.at(-1), { text: `${items.at(-1).text}\n${x.l}`, last: x.b.i });
      });
      if (!items.length) return [warn('핵심감사사항 항목(소제목)을 찾지 못했습니다.', blocks[start].i)];
      const out = [];
      for (const it of items) {
        const t = tight(it.text), name = firstLine(it.head.text);
        const refs = [...new Set([...flat(it.text).matchAll(/주석\s*(\d+)(?:\.\d+)*/g)].map((m) => Number(m[1])))];
        if (!refs.length) out.push(spanTo(bad(`'${name}'에 주석번호가 없습니다.`, it.head.i, name), it.last));
        if (!/핵심감사사항으로결정[된한]이유/.test(t)) out.push(spanTo(bad(`'${name}'에 '핵심감사사항으로 결정된 이유'가 없습니다.`, it.head.i), it.last));
        if (!t.includes('감사에서다루어진방법')) out.push(spanTo(bad(`'${name}'에 '핵심감사사항이 감사에서 다루어진 방법'이 없습니다.`, it.head.i), it.last));

        out.push(spanTo(info(`'${name}'의 주석 참조는 57번에서 원문과 대조합니다.`, it.head.i, name), it.last));
      }
      if (!out.some((x) => x.level === 'fail' || x.level === 'warn')) out.unshift(spanTo(ok(`핵심감사사항 ${items.length}개에 주석번호·구성요소가 있습니다.`, blocks[start].i), end));
      return out;
    } },
  { no: 21, group: '독립된 감사인의 감사보고서(본문)', item: '(상장법인) 업무수행이사', kind: 'auto',
    desc: "'이 감사보고서의 근거가 된 감사를 실시한 업무수행이사는 공인회계사 [이름]입니다.'",
    applies: (ctx, facts, doc) => ctx.listed || !!partnerOf(doc, 'audit'),
    check(doc) {
      const p = partnerOf(doc, 'audit');
      if (!p) return [bad('업무수행이사 문장이 없습니다.')];
      if (!p.name) return [bad('업무수행이사 이름이 없습니다.', p.block.i, '공인회계사')];
      if (PLACEHOLDER_NAMES.includes(p.name)) return [bad(`업무수행이사 이름이 견본(${p.name})입니다.`, p.block.i, p.name)];
      if (!p.title) return [bad(`업무수행이사 이름(${p.name}) 앞에 '공인회계사'가 빠졌습니다. '업무수행이사는 공인회계사 ${p.name}입니다.'로 적어야 합니다.`, p.block.i, p.name)];
      return [ok(`업무수행이사: 공인회계사 ${p.name}`, p.block.i, p.name)];
    } },
  { no: 22, group: '독립된 감사인의 감사보고서(본문)', item: '감사인주소 및 대표이사명/보고서일자기재', kind: 'auto',
    desc: '감사인 주소·대표이사명·보고서일 기재, 감사보고서 본문 = 유효시점 문구 = 내부회계 보고서 날짜',
    check(doc, ctx, facts) {
      const out = signatureFindings(facts.auditSign, '감사보고서');
      const d = facts.auditSign?.date;
      const signAt = { label: '감사보고서일', block: facts.auditSign?.dateBlock.i, quote: facts.auditSign?.dateText };
      if (d && facts.auditEffective?.date && facts.auditEffective.date !== d) out.push(vs(bad(`보고서일(${dateText(d)})과 유효시점 문구 날짜(${dateText(facts.auditEffective.date)})가 다릅니다.`, facts.auditEffective.block.i, facts.auditEffective.dateText), '유효시점 문구', signAt));
      if (d && ctx.icfr !== 'none') {
        const other = facts.icfrSign?.date || facts.icfrEffective?.date;
        if (other && other !== d) out.push(vs(bad(`감사보고서일(${dateText(d)})과 내부회계 ${ctx.icfr === 'audit' ? '감사' : '검토'}보고서일(${dateText(other)})이 다릅니다.`, (facts.icfrSign?.date ? facts.icfrSign.dateBlock : facts.icfrEffective.block).i, facts.icfrSign?.date ? facts.icfrSign.dateText : facts.icfrEffective.dateText),
          `내부회계 ${ctx.icfr === 'audit' ? '감사' : '검토'}보고서일`, signAt));
      }
      return out;
    } },
  { no: 23, group: '독립된 감사인의 감사보고서(본문)', item: '유효시점 문구', kind: 'auto',
    desc: '유효시점 문구 기재, 문구의 감사보고서일 = 감사보고서일자',
    check(doc, ctx, facts) {
      return effectiveFindings(facts.auditEffective, { date: facts.auditSign?.date, label: '감사보고서일', block: facts.auditSign?.dateBlock.i, quote: facts.auditSign?.dateText }, '감사보고서',
        facts.fsConsolidated ? '별첨된 연결회사의 연결재무제표' : '별첨된 회사의 재무제표');
    } },
  { no: 24, group: '회사의 (첨부)재무제표의 표지', item: '주소(도로명) 기재/회사 대표이사명', kind: 'auto',
    desc: '회사정보(도로명주소·전화번호)와 대표이사명 기재. 내부회계 검토 대상은 운영실태보고서 서명 대표이사와 같은지 확인',
    manualPart: (ctx, options = {}, doc = null, facts = null) => {
      if (ctx.icfr === 'none') return '';
      const names = doc && facts ? ceoNamesOf(fsCoverOf(doc, facts).find((b) => tight(b.text).includes('대표이사'))?.text || '') : [];
      const done = names.length && options.ocr?.text && matchCeoNames(names, options.ocr.text).every((m) => m.found);
      return done ? '' : '운영실태보고서(그림)에 서명한 대표이사와 같은지';
    },
    check(doc, ctx, facts, options = {}) {
      const cover = fsCoverOf(doc, facts);
      const out = [];
      const addr = cover.find((b) => tight(b.text).includes('본점소재지'));
      if (!addr) out.push(bad('본점 소재지(도로명주소·전화)를 찾지 못했습니다.'));
      else {
        const road = addr.grid.flat().find((c) => tight(c.text).includes('도로명주소'));
        const roadValue = road ? addr.grid.flat().find((c) => c.col > road.col && c.node.parent === road.node.parent)?.text : '';
        const phone = addr.grid.flat().find((c) => tight(c.text).includes('전화'));
        const phoneValue = phone ? addr.grid.flat().find((c) => c.col > phone.col && c.node.parent === phone.node.parent)?.text : '';
        if (!tight(roadValue)) out.push(bad('도로명주소가 비어 있습니다.', addr.i));
        else out.push(ok(`본점 소재지: ${flat(roadValue)}`, addr.i, roadValue));
        if (!tight(phoneValue)) out.push(bad('전화번호가 비어 있습니다.', addr.i));
      }
      const ceo = cover.find((b) => tight(b.text).includes('대표이사'));
      const names = ceo ? ceoNamesOf(ceo.text) : [];
      const shown = names.join(', ');
      const placeholder = names.find((n) => PLACEHOLDER_NAMES.includes(n));
      if (!ceo || !names.length) out.push(bad('재무제표 표지에 대표이사명이 없습니다.', ceo?.i ?? null));
      else if (placeholder) out.push(bad(`대표이사명이 견본(${placeholder})입니다.`, ceo.i, placeholder));
      else {
        const report = ctx.icfr !== 'none' ? operatingReport(doc) : null;
        const signed = report?.text ? ceoNamesOf(report.text.split('\n').filter((l) => flat(l).length <= 60).join('\n')) : [];
        const missing = names.filter((n) => !signed.includes(n));
        if (signed.length && missing.length === names.length) out.push(bad(`재무제표 표지 대표이사(${shown})가 운영실태보고서에 서명한 대표이사(${signed.join(', ')})와 다릅니다.`, ceo.i, names[0]));
        else if (signed.length && missing.length) out.push(warn(`재무제표 표지 대표이사는 ${shown}인데 운영실태보고서에는 ${signed.join(', ')}만 서명했습니다. 각자·공동 대표이사의 서명 범위를 확인하세요.`, ceo.i, missing[0]));
        else out.push(ok(`대표이사: ${shown}${signed.length ? '. 운영실태보고서 서명과 같습니다.' : ''}`, ceo.i, names[0]));
        if (report && !report.text && options.ocr?.text !== undefined) out.push(...ocrCeoFindings(names, options.ocr, ceo.i));
      }
      return out;
    } },
  { no: 25, group: '회사의 (첨부)재무제표의 표지', item: '사업연도 표기', kind: 'auto',
    desc: 'Click 사업연도는 당기 필수. 1기(설립)가 아니면 전기·당기 모두 표시',
    check(doc, ctx, facts) {
      const firstSt = facts.statements[0]?.titleBlock.i ?? Infinity;
      const cover = top(inPart(doc, 'fs')).filter((b) => b.i < firstSt);
      const click = cover.find((b) => b.kind === 'table' && b.group === 'COVER2');
      const periods = cover.filter((b) => b.kind === 'table' && GI.test(b.text) && findDates(b.text).length);
      const out = [];
      if (!click) out.push(bad('재무제표 표지의 사업연도(Click)를 찾지 못했습니다.'));
      else {
        const cells = click.grid.flat();
        const to = dateOf(cells.find((c) => /^PERIODTO/.test(c.aunit)));
        const gi = giOf(click.text);
        if (to !== ctx.period.to || (ctx.period.gi && gi !== ctx.period.gi)) out.push(bad(`Click 사업연도가 '제 ${gi ?? '?'} 기 ~${dateText(to)}'입니다. 당기(제 ${ctx.period.gi} 기 ~${dateText(ctx.period.to)})를 적어야 합니다.`, click.i, firstLine(click.text)));
        else out.push(ok(`Click 사업연도: 제 ${gi} 기 ~${dateText(to)}`, click.i));
        out.push(...storedDateErrors(periodCells(click), '재무제표 표지 사업연도', click.i));
      }
      if (ctx.period.gi > 1 && periods.length < 2) out.push(bad('전기 사업연도가 없습니다(1기 설립이 아니면 전기·당기 모두 표시).', click?.i ?? null));
      const prev = periods.find((b) => b !== click);
      if (prev && ctx.period.gi > 1) {
        const gi = giOf(prev.text), end = findDates(prev.text).at(-1)?.date;
        if (gi !== ctx.period.gi - 1 || (end && end !== yearBefore(ctx.period.to))) out.push(bad(`전기 사업연도가 '제 ${gi} 기 ~${dateText(end)}'입니다. 제 ${ctx.period.gi - 1} 기 ~${dateText(yearBefore(ctx.period.to))}로 적어야 합니다.`, prev.i, firstLine(prev.text)));
        else out.push(ok(`전기 사업연도: 제 ${gi} 기 ~${dateText(end)}`, prev.i));
      }
      for (const b of periods) for (const m of markErrors(b.text, ctx.period.gi)) out.push(bad(`재무제표 표지 사업연도에 '${m.text}'로 적었습니다. ${m.want === '전' ? '전기' : '당기'}는 '(${m.want})'입니다.`, b.i, m.text));
      return out;
    } },
  { no: 26, group: '회사의 (첨부)재무제표', item: '재무제표서식(Click) 필수작성 대상', kind: 'auto',
    desc: 'IFRS 미적용 회사는 모든 재무제표를 재무제표 서식(Click)으로, IFRS 적용 회사는 일반 표로 작성',
    check(doc, ctx, facts) {
      if (!facts.statements.length) return [bad('첨부 재무제표를 찾지 못했습니다.')];
      if (ctx.ifrs) return facts.statements.map((st) => (st.main?.aclass === 'FINANCE'
        ? bad(`IFRS 적용 회사인데 ${josa(st.name, '을', '를')} 재무제표 서식(Click)으로 작성했습니다. 일반 표로 작성해야 합니다.`, st.main.i)
        : ok(`${st.name}: 일반 표(IFRS 적용)`, st.main?.i ?? st.titleBlock.i)));
      return facts.statements.map((st) => (st.main?.aclass === 'FINANCE'
        ? ok(`${st.name}: 재무제표 서식(Click)`, st.main.i)
        : bad(`${josa(st.name, '을', '를')} 재무제표 서식(Click)이 아닌 일반 표로 작성했습니다.`, st.main?.i ?? st.titleBlock.i)));
    } },
  { no: 27, group: '회사의 (첨부)재무제표', item: '사업연도 표기', kind: 'auto',
    desc: '재무제표마다 당기·전기 기수와 기간(전기를 당기로 적은 오류 등), 상단 회사명',
    check(doc, ctx, facts) {
      const out = [];
      const cur = ctx.period, prevTo = yearBefore(cur.to), prevFrom = yearBefore(cur.from);
      const company = doc.header.company || doc.meta.regname;
      for (const st of facts.statements) {
        for (const m of markErrors(headText(st.main), cur.gi)) out.push(bad(`${st.name} 머리에 '${m.text}'로 적었습니다. ${m.want === '전' ? '전기' : '당기'}는 '(${m.want})'입니다.`, st.main.i, m.text));
        const spacedMarks = new Set([...[headText(st.main), ...st.lines].join('\n').matchAll(/제\s*\d+\s*\((?:\s+(?:당|전)\s*|(?:당|전)\s+)\)\s*(?:기|분기|반기)/g)].map((m) => m[0]));
        for (const text of spacedMarks) out.push(bad(`${st.name} 머리에 '${flat(text)}'로 괄호 안에 칸이 있습니다. '${flat(text.replace(/\(\s*(당|전)\s*\)/, '($1)'))}'로 적어야 합니다.`, st.main?.i ?? st.titleBlock.i, text));
        if (company) {
          const line = st.lines.find((l) => companyKey(l, true).includes(companyKey(company, true)) || /주식회사|\(주\)|㈜|유한회사/.test(tight(l)));
          const name = line ? flat(line).replace(/\(\s*단\s*위.*$/, '').trim() : '';
          const upto = st.main ? st.main.i - 1 : st.titleBlock.i + 4;
          if (!line) out.push(bad(`${st.name} 상단에 회사명이 없습니다.`, st.titleBlock.i));
          else if (st.consolidated && !subsidiaryWord(name)) out.push(toQuote(doc, bad(`${st.name} 상단 회사명을 '${withSubsidiary(company)}'처럼 적어야 합니다('${name}').`, st.titleBlock.i, name), st.titleBlock.i, upto));
        }
        const lines = st.lines.filter((l) => /제\s*\d+/.test(l));
        if (lines.length < 1) { out.push(warn(`${st.name}: 기수·기간 줄을 찾지 못했습니다.`, st.titleBlock.i)); continue; }
        const expect = [
          { gi: cur.gi, mark: '당', from: cur.from, to: cur.to },
          { gi: cur.gi ? cur.gi - 1 : null, mark: '전', from: prevFrom, to: prevTo },
        ];
        let bad1 = false;
        lines.slice(0, 2).forEach((line, k) => {
          const e = expect[k];
          const m = /제\s*(\d+)\s*(?:\(\s*(당|전)\s*\))?\s*(?:기|분기|반기)/.exec(line);
          const dates = findDates(line).map((d) => d.date);
          const problems = [];
          if (m && e.gi && Number(m[1]) !== e.gi) problems.push(`기수 ${m[1]} (→ ${e.gi})`);
          if (m?.[2] && m[2] !== e.mark) problems.push(`(${m[2]})기 (→ (${e.mark})기)`);
          const end = dates.at(-1);
          if (end && end !== e.to) problems.push(`종료일 ${dateText(end)} (→ ${dateText(e.to)})`);
          if (dates.length >= 2 && !calendarDate(dates[0])) problems.push(`시작일 ${dateText(dates[0])}은(는) 유효하지 않은 날짜입니다`);
          else if (dates.length >= 2 && dates[0] !== e.from) {
            if (k === 1 && dates[0] <= end) {
              bad1 = true;
              out.push(toQuote(doc, warn(`${st.name} 전기 시작일은 ${dateText(dates[0])}입니다. 당기에서 한 해를 뺀 참조일(${dateText(e.from)})과 다르므로 전기 보고서·설립일·결산기 변경 여부를 대조하세요. 참조일로 자동 수정하지 마세요.`, st.titleBlock.i, firstLine(line).trim()), st.titleBlock.i, st.main ? st.main.i - 1 : st.titleBlock.i + 4));
            } else if (k === 1) problems.push(`시작일(${dateText(dates[0])})이 표시된 종료일(${dateText(end)})보다 늦습니다`);
            else problems.push(`시작일 ${dateText(dates[0])} (→ ${dateText(e.from)})`);
          }
          if (problems.length) { bad1 = true; out.push(toQuote(doc, bad(`${st.name} ${k ? '전기' : '당기'}: ${problems.join(', ')}`, st.titleBlock.i, firstLine(line).trim()), st.titleBlock.i, st.main ? st.main.i - 1 : st.titleBlock.i + 4)); }
        });
        if (!bad1) out.push(ok(`${st.name}: ${lines.slice(0, 2).map((l) => flat(l)).join(' / ')}`, st.titleBlock.i));
        if (st.base === '자본변동표' && st.main) {
          const want = { 전기초: prevFrom, 전기말: prevTo, 당기초: cur.from, 당기말: cur.to };
          const named = Object.fromEntries(Object.entries(want).map(([k, v]) => [v, k]));
          const DATE_ROW = /(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})\s*일?\s*\.?/;
          const unmarked = [];
          for (const row of st.main.grid) {
            const label = flat(row[0]?.text || '');
            const dm = DATE_ROW.exec(label);
            if (!dm) continue;
            const d = `${dm[1]}${dm[2].padStart(2, '0')}${dm[3].padStart(2, '0')}`;
            const mark = /([전당])\s*기\s*([초말])/.exec(label.replace(dm[0], ' '));
            if (!mark) { unmarked.push({ d, label }); continue; }
            const term = `${mark[1]}기${mark[2]}`;
            if (term === '전기초' && !calendarDate(d)) out.push(bad(`${st.name}: '${label}'. 전기초가 유효하지 않은 날짜입니다. 원문과 실제 전기 시작일을 대조하세요.`, st.main.i, label));
            else if (want[term] && d !== want[term]) {
              if (term === '전기초' && d <= prevTo) out.push(warn(`${st.name}: '${label}'. 당기에서 계산한 전기초 참조일(${dateText(prevFrom)})과 다릅니다. 전기 보고서·설립일·결산기 변경 여부를 대조하고 참조일로 자동 수정하지 마세요.`, st.main.i, label));
              else out.push(bad(`${st.name}: '${label}'. ${term}은(는) ${dateText(want[term])}${named[d] ? `, ${dateText(d)}은(는) ${named[d]}` : ''}입니다.`, st.main.i, label));
            }
          }
          if (unmarked.length === 4) {
            const order = ['전기초', '전기말', '당기초', '당기말'];
            unmarked.forEach((x, k) => {
              if (k && x.d !== want[order[k]]) out.push(bad(`${st.name}: '${x.label}'. ${k + 1}번째 날짜 행(${order[k]})은 ${dateText(want[order[k]])}${named[x.d] ? `, ${dateText(x.d)}은(는) ${named[x.d]}` : ''}입니다.`, st.main.i, x.label));
            });
          }
        }
        const unaudited = (t) => /감사(?:를)?받지/.test(tight(t));
        const grid = st.main?.grid || [];
        const headRows = grid.slice(0, 2).filter((row) => !row.slice(1).some((c) => parseAmount(c.text) !== null));
        const headMarked = unaudited(`${st.lines.join('')}${headRows.flat().map((c) => c.text).join('')}`);
        const markedRows = grid.filter((row) => !headRows.includes(row)).map((row) => row[0]?.text || '').filter(unaudited);
        const priorMarkedRows = st.base === '자본변동표' ? markedRows.filter((l) => {
          const d = findDates(l)[0]?.date;
          return /전기초|전기말/.test(tight(l)) && !/당기/.test(tight(l)) && d && calendarDate(d) && d <= prevTo;
        }) : [];
        if (ctx.unauditedPrior && !headMarked && !priorMarkedRows.length) out.push(bad(`${st.name}: 전기 재무제표가 감사받지 않았는데 '감사받지 아니한 재무제표' 표시가 없습니다.`, st.titleBlock.i));
        const priorOpeningOnly = markedRows.length && priorMarkedRows.length === markedRows.length && markedRows.every((l) => /전기초/.test(tight(l)));
        if (!ctx.unauditedPrior && (headMarked || (markedRows.length && !priorOpeningOnly))) out.push(warn(`${st.name}: '감사받지 아니한' 표시가 있습니다. 감사보고서 기타사항과 같은지 확인하세요.`, st.titleBlock.i, '감사받지'));
      }
      return out.length ? out : [bad('첨부 재무제표를 찾지 못했습니다.')];
    } },
  { no: 28, group: '회사의 (첨부)재무제표', item: '금액단위 표기', kind: 'auto',
    desc: '재무제표 금액단위 통일, 세자리 콤마 구분(예: 123,5678,900 오류)',
    check(doc, ctx, facts) {
      const out = [];
      const units = new Set();
      for (const st of facts.statements) {
        if (!st.unit) out.push(bad(`${st.name}에 금액단위가 없습니다.`, st.titleBlock.i));
        else units.add(st.unitText);
      }
      if (units.size > 1) {
        const odd = facts.statements.find((st) => st.unit && st.unitText !== facts.statements.find((x) => x.unit)?.unitText);
        out.push(bad(`재무제표 금액단위가 다릅니다(${[...units].join(', ')}).`, odd?.titleBlock.i ?? null, odd?.unitText || ''));
      }
      else if (units.size === 1 && !out.length) out.push(ok(`금액단위: ${[...units][0]}`));
      const UNIT_NAME = { 1: '원', 1000: '천원', 1000000: '백만원' };
      const s = doc.header.summary;
      for (const [base, code, re] of [['재무상태표', 'TOT_ASSETS', /^자산총계$/], ['손익', 'TOT_SALES', SALES_ROW]]) {
        const st = facts.statements.find((x) => x.base.includes(base));
        const found = currentAmount(st, re), h = Number(s[code]);
        if (!st?.unit || !found?.value || !(h > 0)) continue;
        const implied = (h * 1e6) / Math.abs(found.value);
        const near = [1, 1e3, 1e6].find((u) => Math.abs(implied / u - 1) < 0.01);
        if (near && near !== st.unit) out.push(bad(`${st.name} 단위가 '${st.unitText}'인데 금액은 ${UNIT_NAME[near]} 단위로 보입니다(헤더 ${num(h)}백만원 기준).`, st.titleBlock.i, st.unitText));
      }
      const wrong = commaErrors(doc);
      for (const w of wrong.slice(0, 20)) out.push(bad(`세자리 콤마 오류: ${w.text}`, w.block, w.text));
      if (wrong.length > 20) out.push(info(`외 ${wrong.length - 20}곳`));
      if (!wrong.length) out.push(ok('재무제표·주석 표에 세자리 콤마 오류가 없습니다.'));
      return out;
    } },
  { no: 29, group: '회사의 (첨부)재무제표', item: "'별첨 주석은 본 재무제표의 일부입니다.' 문구", kind: 'auto',
    desc: "재무제표마다 하단에 '별첨 주석은 본 재무제표의 일부입니다.'('별첨 재무제표에 대한 주석은' 오류)",
    check(doc, ctx, facts) {
      if (!facts.statements.length) return [bad('첨부 재무제표를 찾지 못했습니다.')];
      return facts.statements.map((st) => {
        const t = loose(st.after?.text || '');
        const same = /^(?:별첨|첨부된)주석은(?:본)?(연결)?재무제표의일부(?:입니다|임)$/.exec(t);
        if (same && !!same[1] === !!st.consolidated) return ok(`${st.name}: 있음`, st.after.i);
        if (t.includes('별첨재무제표에대한주석은')) return bad(`${st.name}: '별첨 재무제표에 대한 주석은'으로 잘못 적었습니다.`, st.after.i, st.after.text);
        if (same || t.includes('별첨주석은') || t.includes('첨부된주석은')) return bad(`${st.name}: 문구가 다릅니다("${short(st.after.text, 40)}").`, st.after.i, st.after.text);
        return bad(`${st.name}: 하단에 '별첨 주석은 본 ${st.consolidated ? '연결' : ''}재무제표의 일부입니다.' 문구가 없습니다.`, (st.after || st.main || st.titleBlock).i);
      });
    } },
  { no: 30, group: '주석', item: '이익잉여금 처분계산서/결손금처리계산서', kind: 'auto',
    desc: '당기 처분(처리)예정일·전기 처분(처리)확정일, 헤더 정기총회일 및 주석 승인일과 대조',
    manualPart: () => '처분(처리) 승인기관, 정관 및 관련 승인요건의 충족 여부',
    applies: (ctx) => !ctx.consolidated,
    check(doc, ctx, facts) {
      const plan = appropriationOf(doc);
      if (!plan) return [warn('이익잉여금처분계산서(결손금처리계산서)를 찾지 못했습니다.')];
      const out = [], i = plan.block.i;
      const c = plan.current, p = plan.previous;
      if (!/예정일$/.test(c.label)) out.push(bad(`당기를 '${c.label}'로 적었습니다. '처분예정일'(또는 '처리예정일')이어야 합니다.`, i, c.label));
      if (p && !/확정일$/.test(p.label)) out.push(bad(`전기를 '${p.label}'로 적었습니다. '처분확정일'(또는 '처리확정일')이어야 합니다.`, i, p.label));
      if (plan.kind && !c.label.startsWith(plan.kind)) out.push(bad(`${plan.title}인데 당기를 '${c.label}'로 적었습니다.`, i, c.label));
      const amountTable = appropriationUnit(doc, facts).table;
      const priorKind = appropriationPriorKind(amountTable);
      if (priorKind && p && /확정일$/.test(p.label) && !p.label.startsWith(priorKind)) out.push(bad(`전기가 ${priorKind === '처리' ? '결손(미처리결손금)' : '잉여(미처분이익잉여금)'}인데 '${p.label}'로 적었습니다. '${priorKind}확정일'이어야 합니다.`, i, p.label));
      const tables = [...new Set([plan.block, amountTable])].filter((b) => b?.kind === 'table'
        && (b === plan.block || b.grid.some((row) => /미처분이익잉여금|미처리결손금/.test(rowLabel(row)))));
      for (const t of tables) for (const m of markErrors(headText(t), ctx.period.gi)) out.push(bad(`${plan.title || '처분(처리)계산서'} 머리에 '${m.text}'로 적었습니다. 제 ${ctx.period.gi - (m.want === '전' ? 1 : 0)} 기는 '(${m.want})'입니다.`, t.i, m.text));
      const g = doc.header.summary.GMSH_DATE;
      if (/^\d{8}$/.test(g || '') && c.date !== g) out.push(vs(warn(`${c.label}(${dateText(c.date)})이 헤더 정기총회일(${dateText(g)})과 다릅니다. 정기주주총회 또는 이사회 중 실제 처분(처리) 승인기관과 승인예정일을 확인하세요. 이사회 승인은 정관과 관련 승인요건을 별도로 대조해야 합니다.`, i, c.text), c.label, { label: '헤더 정기주주총회일자', head: 'GMSH_DATE' }));
      const approval = approvalOf(doc);
      if (approval?.boardDate && approval.boardDate === c.date) out.push(vs(warn(`${c.label}(${dateText(c.date)})이 주석의 이사회 승인일과 같습니다. 정기주주총회 또는 이사회 중 실제 처분(처리) 승인기관을 확인하고, 이사회 승인요건은 정관과 관련 근거를 대조하세요.`, i, c.text),
        c.label, { label: '이사회 승인일', block: approval.block.i, quote: approval.text }));
      if (!out.length) out.push(ok(`${c.label} ${dateText(c.date)}${p ? `, 전기 ${p.label} ${dateText(p.date)}` : ''}`, i));
      return out;
    } },
  { no: 31, group: '주석', item: '재무제표 확정(승인)일과 기관 표기', kind: 'auto',
    desc: '재무제표 확정(승인)일과 기관(이사회 등) 문구, 승인일 연도 오타',
    check(doc, ctx, facts, options) {
      const hit = approvalOf(doc);
      if (!hit) {
        const near = inPart(doc, 'notes').find((b) => /재무제표의(승인|확정|발행승인)/.test(tight(b.text)));
        return [(ctx.ifrs ? bad : warn)('재무제표 확정(승인)일과 기관(이사회 등) 문구를 찾지 못했습니다.', near?.i ?? null)];
      }
      const y = Number(hit.date.slice(0, 4)), report = facts.auditSign?.date || facts.auditEffective?.date;
      const i = hit.block.i, text = hit.text;
      if (report && y !== Number(report.slice(0, 4))) return [vs(bad(`승인일 연도(${y}년)가 감사보고서일(${dateText(report)})과 다릅니다. 연도 오타인지 확인하세요.`, i, text), '재무제표 승인일',
        { label: '감사보고서일', block: facts.auditSign?.dateBlock.i, quote: facts.auditSign?.dateText })];
      const out = [ok(`${short(text, 60)}`, i, text)];
      if (hit.organ !== '이사회' && !hit.boardDate) out.push(warn(`재무제표 확정(승인) 기관이 '${hit.organ}'입니다. 이사회에서 승인(사실상 확정)한 날짜가 있으면 함께 적었는지 확인하세요.`, i, text));
      const other = options?.other && approvalOf(options.other);
      const mine = hit.boardDate || hit.date, theirs = other && (other.boardDate || other.date);
      if (theirs && mine && theirs !== mine) {
        const otherKind = contextOf(options.other).consolidated ? '연결' : '별도';
        out.push(warn(`${otherKind}감사보고서의 재무제표 승인일(${dateText(theirs)})과 다릅니다(이 보고서 ${dateText(mine)}). 맞는지 확인하세요.`, i, text));
      }
      return out;
    } },
  { no: 32, group: '주석', item: '주석 금액단위 표기오류', kind: 'assist',
    desc: '이익잉여금처분계산서(결손금처리계산서) 금액단위 기재·재무상태표와 같은 단위, 주석 표의 금액단위 기재',
    check(doc, ctx, facts) {
      const blocks = doc.blocks;
      const ap = appropriationUnit(doc, facts);
      const out = ap.findings;
      const missing = [];
      for (const t of doc.tables.filter((x) => x.part === 'notes' && x.border === '1' && x !== ap.table)) {
        const bigCells = t.grid.flat().filter((c) => Math.abs(parseAmount(c.text) ?? 0) >= 1000);
        if (!bigCells.length) continue;
        if (bigCells.some((c) => /\d\s*(원|주|%)$/.test(flat(c.text)))) continue;
        const bigRows = t.grid.filter((row) => row.slice(1).some((c) => Math.abs(parseAmount(c.text) ?? 0) >= 1000));
        if (bigRows.length && bigRows.every((row) => /^(?:부여수량|수량|(?:부여|행사가능|미행사|가득|미가득|기초|기말)?주식수|주수|(?:가중평균)?행사가격?|가격|(?:부여일)?주가|주당(?:공정가치|행사가격|가격)|단가)$/.test(tight(row[0]?.text || '')))) continue;
        const head = tight(t.grid.slice(0, 2).flat().map((c) => c.text).join(''));
        if (/주식수|주식주|지분율|수량|USD|달러|주\)$|\(주\)/.test(head) && !/\((천원|백만원|원)\)/.test(head)) continue;
        const back = [];
        for (let k = t.i - 1; k >= Math.max(0, t.i - 6); k--) {
          const b = blocks[k];
          if (!b || b.part !== 'notes') break;
          back.push(b.text);
          if (/^\s*\d{1,3}\.\s*[가-힣]/.test(String(b.text)) && !b.nested) break;
        }
        const around = [t.text, ...back].join(' ');
        if (!/단위|\((천원|백만원|원|USD|달러)\)|원화\s*[:：]/.test(around)) missing.push(t);
      }
      if (!missing.length) return out.concat(ok('금액이 있는 주석 표에 단위가 있습니다.'));
      return out.concat(warn(`금액단위를 찾지 못한 주석 표가 ${missing.length}개입니다. 표 위·안에 단위가 있는지 확인하세요.`),
        missing.slice(0, 15).map((t) => warn(`단위 없음: ${short(t.grid[0]?.map((c) => c.text).join(' | '), 50)}`, t.i)));
    } },
  { no: 33, group: '내부회계관리제도 감사 또는 검토의견', item: '삽입 서식 이용여부', kind: 'auto',
    desc: '『내부회계관리제도 감사 또는 검토의견』 단위서식을 ◆click◆으로 삽입해 작성했는지',
    applies: (ctx, facts, doc) => ctx.icfr !== 'none' || doc.header.summary.PREV_YN === 'Y',
    check(doc) {
      const ins = insertion(doc, '내부회계관리제도감사또는검토의견');
      if (ins?.inserted) return [ok('『내부회계관리제도 감사 또는 검토의견』 단위서식을 삽입했습니다.', doc.blocks[ins.start]?.i ?? null)];
      return [bad('『내부회계관리제도 감사 또는 검토의견』 단위서식을 ◆click◆으로 삽입하지 않았습니다.', inPart(doc, 'icfr')[0]?.i ?? null)];
    } },
  ...icfrRules('audit', 34),
  ...icfrRules('review', 40),
  { no: 46, group: '(2) 독립된 감사인의 내부회계관리제도 검토보고서', item: '검토보고서와 회사 운영실태보고서(준거기준·평가기준) 일치여부', kind: 'manual',
    desc: "상장중소기업·비상장대기업: 검토보고서 범위문단과 운영실태보고서의 준거기준('개념체계 제4장 중소기업에 대한 적용')·평가기준(완화된 방식) 일치",
    applies: (ctx) => ctx.icfr === 'review',
    check(doc, ctx, facts, options = {}) {
      const report = operatingReport(doc);
      const reportAt = Math.min(report.blocks[0]?.i ?? Infinity, report.images[0]?.i ?? Infinity);
      const b = top(inPart(doc, 'icfr')).find((x) => x.i < reportAt && /비상장대기업|중소기업/.test(tight(x.text)));
      const quote = b ? (/비상장대기업/.test(b.text) ? '비상장대기업' : '중소기업') : '';
      if (report.text) {
        const eased = /중소기업에대한적용|완화된방식/.test(tight(report.text));
        if (eased && !b) return [bad("운영실태보고서는 '제4장 중소기업에 대한 적용'(완화된 방식)을 기준으로 했는데 검토보고서 범위 문단에 '중소기업 등에 대한 검토특례' 문구가 없습니다.", report.blocks[0].i, '중소기업에 대한 적용')];
        if (!eased && b) return [bad("검토보고서 범위 문단에 중소기업·비상장대기업 문구가 있는데 운영실태보고서에는 '중소기업에 대한 적용'(완화된 방식)이 없습니다.", b.i, quote)];
        return [ok(eased ? '검토보고서와 운영실태보고서 모두 완화된 방식(중소기업에 대한 적용)입니다.' : '검토보고서와 운영실태보고서 모두 일반 기준입니다.', b?.i ?? report.blocks[0].i)];
      }
      const at = report.images[0]?.i ?? null;
      return [b ? info('검토보고서에 중소기업·비상장대기업 관련 문구가 있습니다. 운영실태보고서(그림)의 준거기준·평가기준과 같은지 확인하세요.', b.i, quote)
        : info("운영실태보고서(그림)가 '제4장 중소기업에 대한 적용'(완화된 방식)을 기준으로 했다면 검토보고서 범위 문단에 '중소기업 등에 대한 검토특례' 문구가 있어야 합니다.", at),
      ...ocrScopeFindings(ocrOfReport(report, options), b, quote, at),
      icfrGuide(at)];
    } },
  { no: 47, group: '회사의 내부회계관리제도 운영실태보고서', item: '운영실태보고서 내용', kind: 'manual',
    desc: "평가기준을 '내부회계관리제도 평가 및 보고 기준'으로 기재(모범규준·보고모범기준 아님)",
    applies: (ctx) => ctx.icfr !== 'none',
    check(doc, ctx, facts, options = {}) {
      const report = operatingReport(doc);
      const t = top(inPart(doc, 'icfr')).find((b) => /모범규준|보고모범기준/.test(tight(b.text)));
      const reportAt = Math.min(report.blocks[0]?.i ?? Infinity, report.images[0]?.i ?? Infinity);
      const at = report.images[0]?.i ?? null;
      const picture = !report.text ? [...ocrStandardFindings(ocrOfReport(report, options), at), icfrGuide(at)] : [];
      if (t) return [bad(`${t.i < reportAt ? '감사인의 내부회계관리제도 감사(검토)보고서' : '운영실태보고서'}에 '모범규준' 문구가 있습니다. '내부회계관리제도 평가 및 보고 기준'으로 적어야 합니다.`, t.i, '모범규준'), ...picture];
      if (!report.text) return [info(`운영실태보고서가 ${report.media}(${report.images.length}개)이라 글을 읽을 수 없습니다. ${report.media}에서 평가기준 문구를 확인하세요.`, at), ...picture];
      return tight(report.text).includes('내부회계관리제도평가및보고기준')
        ? [ok("평가기준: '내부회계관리제도 평가 및 보고 기준'", report.blocks[0].i, '평가 및 보고 기준')]
        : [bad("운영실태보고서에 '내부회계관리제도 평가 및 보고 기준'이 없습니다.", report.blocks[0].i)];
    } },
  { no: 48, group: '회사의 내부회계관리제도 운영실태보고서', item: '운영실태보고서의 보고서일자', kind: 'manual',
    desc: '보고서일자 기재, 사업연도 이후 일자, 대표이사·내부회계관리자 서명(날인)',
    applies: (ctx) => ctx.icfr !== 'none',
    check(doc, ctx) {
      const report = operatingReport(doc);
      if (!report.images.length && !report.text) return [bad('운영실태보고서(그림·PDF·글)가 없습니다.')];
      if (!report.text) return [info(`운영실태보고서가 ${report.media} ${report.images.length}개입니다. ${report.media}에서 일자·서명을 확인하세요.`, report.images[0].i, report.images[0].file), icfrGuide(report.images[0].i)];
      const out = [], i = report.blocks[0].i;
      const dates = findDates(report.text).map((d) => d.date).filter((d) => d > ctx.period.to);
      if (!dates.length) out.push(bad(`운영실태보고서 일자가 없거나 사업연도 종료일(${dateText(ctx.period.to)}) 이전입니다.`, i));
      else out.push(ok(`보고서일자: ${dateText(dates.at(-1))}`, i));
      for (const who of ['대표이사', '내부회계관리자']) if (!tight(report.text).includes(who)) out.push(bad(`${who} 서명란이 없습니다.`, i));
      out.push(info('서명(날인)은 원본 그림·PDF에서 확인하세요.'));
      return out;
    } },
  { no: 49, group: '회사의 내부회계관리제도 운영실태보고서', item: '운영실태보고서 붙임파일(내부회계 감사대상은 필수)', kind: 'manual',
    desc: '내부회계 감사 대상: 운영실태보고서 하단 붙임(횡령 등 자금 관련 부정위험에 대응한 내부통제 활동) 필수',
    applies: (ctx) => ctx.icfr === 'audit',
    check(doc) {
      const report = operatingReport(doc);
      if (!report.text) return [info(`운영실태보고서가 ${report.media}(${report.images.length}개)입니다. 마지막 쪽에 자금 관련 부정위험 통제활동 붙임이 있는지 확인하세요.`, report.images.at(-1)?.i ?? null), icfrGuide(report.images.at(-1)?.i ?? null)];
      return /횡령|자금.*부정|부정위험/.test(tight(report.text)) ? [ok('자금 관련 부정위험 통제활동 붙임이 있습니다.', report.blocks.at(-1).i)]
        : [bad('운영실태보고서에 자금 관련 부정위험 통제활동 붙임이 없습니다.', report.blocks[0].i)];
    } },
  { no: 50, group: '외부감사 실시내용', item: '1. 감사대상업무', kind: 'auto',
    desc: '회사명·당기 사업연도 일치',
    check(doc, ctx) {
      const t = externalTable(doc, 'INS_SUB');
      if (!t) return [bad('1. 감사대상업무 표를 찾지 못했습니다.')];
      const cells = t.grid.flat(), out = [];
      const company = cells.find((c) => c.acode === 'SUB_COMPY')?.text || '';
      const headerName = doc.header.company || doc.meta.regname;
      const coverName = inPart(doc, 'cover').find((b) => b.kind === 'p' && /주식회사|\(주\)|㈜|유한회사|유한책임회사/.test(tight(b.text)));
      const sameAsCover = coverName && companyKey(company, true) === companyKey(coverName.text, true);
      if (!tight(company)) out.push(bad('회사명이 비어 있습니다.', t.i));
      else if (!headerName) out.push(warn(`헤더 회사명이 비어 있어 회사명 '${company}'을(를) 대조하지 못했습니다.`, t.i, company));
      else if (companyKey(company, true) !== companyKey(headerName, true)) {
        const found = sameAsCover ? warn(`회사명 '${company}'이(가) 헤더 회사명(DART 등록 이름 ${headerName})과 다릅니다. 표지와는 같으니 헤더와 본문 중 어떤 정보가 맞는지 확인하세요. 상호 변경이 아니면 회사명 오류입니다.`, t.i, company)
          : bad(`회사명 '${company}'이(가) 헤더 회사명(${headerName})과 다릅니다.`, t.i, company);
        out.push(vs(found, '감사대상업무 회사명', { label: '헤더 회사명', head: 'COMPANY' }));
      } else out.push(ok(`회사명: ${company}`, t.i));
      if (subsidiaryWord(company)) out.push(bad(`감사대상업무 회사명은 회사명만 적습니다('${company}'에서 '와 그 ${subsidiaryWord(company)}'를 지우세요).`, t.i, company));
      const fromCell = cells.find((c) => c.aunit === 'SUB_PERIODFROM'), toCell = cells.find((c) => c.aunit === 'SUB_PERIODTO');
      const from = dateOf(fromCell), to = dateOf(toCell);
      const coverClick = inPart(doc, 'cover').find((b) => b.kind === 'table' && b.aclass === 'EXTRACTION');
      if (!from && !to) out.push(bad(`감사대상 사업연도가 비어 있습니다('${flat(fromCell?.text || '')} ~ ${flat(toCell?.text || '')}').`, t.i, fromCell?.text || ''));
      else if (from !== ctx.period.from || to !== ctx.period.to) out.push(vs(bad(`감사대상 사업연도(${dateText(from)} ~ ${dateText(to)})가 당기(${dateText(ctx.period.from)} ~ ${dateText(ctx.period.to)})와 다릅니다.`, t.i, (to !== ctx.period.to ? toCell : fromCell)?.text || ''),
        '감사대상 사업연도', { label: '표지 사업연도', block: coverClick?.i ?? null }));
      else out.push(ok(`감사대상 사업연도: ${dateText(from)} ~ ${dateText(to)}`, t.i));
      out.push(...storedDateErrors([fromCell, toCell].filter(Boolean), '감사대상 사업연도', t.i));
      return out;
    } },
  { no: 51, group: '외부감사 실시내용', item: '2. 감사참여자 구분별 인원수 및 감사시간', kind: 'auto',
    desc: "공란 없이 '-', 인원수가 있으면 시간도, 합계 일치, 담당이사·등록공인회계사 필수, 품질관리검토자가 있으면 기재. 전기 값은 DART 조회본과 대조",
    manualPart: () => '전기 인원수·시간이 DART에 공시된 전기 감사보고서와 같은지',
    check(doc, ctx) {
      const t = externalTable(doc, 'INS_NUT');
      if (!t) return [bad('2. 감사참여자 구분별 인원수 및 감사시간 표를 찾지 못했습니다.')];
      const cells = t.grid.flat().filter((c) => c.acode);
      const by = Object.fromEntries(cells.map((c) => [c.acode, c]));
      const v = (code) => parseAmount(by[code]?.text ?? '') ?? 0;
      const out = [];
      const blank = cells.filter((c) => !tight(c.text));
      if (blank.length) out.push(bad(`공란이 ${blank.length}칸입니다. 해당 없으면 '-'로 적어야 합니다(${blank.slice(0, 6).map((c) => c.acode).join(', ')}).`, t.i));
      const cats = ['QLT', 'ACT', 'ACR', 'ACP', 'EXP', 'COT'];
      const NAMES = { QLT: '품질관리검토자', ACT: '담당이사', ACR: '등록공인회계사', ACP: '수습공인회계사', EXP: '전문가', COT: '수주산업전문가' };
      for (const p of ['TH', 'LA']) {
        const when = p === 'TH' ? '당기' : '전기';
        for (const c of cats) {
          const n = v(`NUM_${c}_${p}`), h = v(`TMT_${c}_${p}`) || v(`TMY_${c}_${p}`) + v(`TMA_${c}_${p}`);
          if (n > 0 && !h) out.push(bad(`${when} ${NAMES[c]}: 인원수(${n})가 있는데 투입시간이 없습니다.`, t.i, by[`NUM_${c}_${p}`]?.text));
          if (!n && h > 0) out.push(bad(`${when} ${NAMES[c]}: 투입시간(${num(h)})이 있는데 인원수가 없습니다.`, t.i));
          const tmt = v(`TMT_${c}_${p}`), sum = v(`TMA_${c}_${p}`) + v(`TMY_${c}_${p}`);
          if (tmt !== sum) out.push(bad(`${when} ${NAMES[c]}: 시간 합계(${num(tmt)}) ≠ 분ㆍ반기검토(${num(v(`TMA_${c}_${p}`))}) + 감사(${num(v(`TMY_${c}_${p}`))})`, t.i, by[`TMT_${c}_${p}`]?.text));
        }
        for (const row of ['NUM', 'TMA', 'TMY', 'TMT']) {
          const total = v(`${row}_TOT_${p}`), sum = cats.reduce((a, c) => a + v(`${row}_${c}_${p}`), 0);
          const label = { NUM: '투입 인원수', TMA: '분ㆍ반기검토 시간', TMY: '감사 시간', TMT: '시간 합계' }[row];
          if (total !== sum) out.push(bad(`${when} ${label}: 합계(${num(total)}) ≠ 구분별 합(${num(sum)})`, t.i, by[`${row}_TOT_${p}`]?.text));
        }
      }
      for (const c of ['ACT', 'ACR']) if (!v(`NUM_${c}_TH`)) out.push(bad(`당기 ${NAMES[c]} 투입 인원수·시간은 반드시 기재해야 합니다.`, t.i));
      if (['P', 'A'].includes(doc.header.summary?.CRP_RGS_CLS) && !v('TMA_TOT_TH')) out.push(bad(`${doc.header.summary.CRP_RGS_CLS === 'P' ? '유가증권' : '코스닥'} 상장법인은 분·반기 검토 의무대상인데 당기 분ㆍ반기검토 시간이 없습니다. 투입 인원수·시간을 기재해야 합니다.`, t.i, by.TMA_TOT_TH?.text));
      if (ctx.listed && !v('NUM_QLT_TH')) out.push(warn('상장법인인데 당기 품질관리검토자(심리실 등) 투입이 없습니다. 품질관리검토자가 있었다면 인원수·시간을 기재해야 합니다.', t.i, by.NUM_QLT_TH?.text));
      if (ctx.newEngagement && !ctx.unauditedPrior && v('NUM_TOT_LA') > 0) {
        const near = doc.blocks.slice(t.i, t.i + 6).filter((b) => b.part === 'external' && !/^3\.주요감사실시내용/.test(tight(b.text)));
        const note = near.find((b) => /타감사인|전기감사인|다른감사인|전임감사인/.test(tight(b.text)));
        if (!note) out.push(bad("전기 재무제표를 다른 감사인이 감사했는데 표 아래에 '(*) 회사의 전기 재무제표는 타감사인이 감사하였으며, 비교표시된 전기 투입 인원수 및 시간은 전기 감사인이 작성한 외부감사실시내용에 기재된 내용입니다.' 문구가 없습니다.", t.i));
        else out.push(ok('전기 투입 인원수·시간: 전기 감사인 작성분이라는 주석이 있습니다.', note.i, /타감사인|전기감사인|다른감사인|전임감사인/.exec(tight(note.text))[0]));
      }
      const footnote = doc.blocks.slice(t.i + 1, t.i + 6).find((b) => b.part === 'external' && /전기재무제표는.*(?:감사인|회계법인)이감사하였으며/.test(tight(b.text)));
      if (footnote && !ctx.priorNoted) out.push(warn('표 아래에 전기 타감사인 각주가 있는데 감사보고서 기타사항에는 전기 감사인 문단이 없습니다. 전기도 같은 감사인이 감사했으면 각주를 지우세요.', footnote.i, clip(footnote.text, 30)));
      const notes = doc.blocks.filter((b) => !b.nested && b.part === 'external' && /전기재무제표는.*(?:감사인|회계법인)이감사하였으며/.test(tight(b.text)));
      if (notes.length > 1) out.push(bad(`전기 타감사인 각주를 ${notes.length}번 적었습니다. '2. 감사참여자 구분별 인원수 및 감사시간' 표 아래에 한 번만 적어야 합니다.`, notes[1].i, clip(notes[1].text, 30)));
      if (!out.some((x) => x.level !== 'ok')) out.unshift(ok(`당기 ${v('NUM_TOT_TH')}명 ${num(v('TMT_TOT_TH'))}시간, 전기 ${v('NUM_TOT_LA')}명 ${num(v('TMT_TOT_LA'))}시간, 합계가 맞습니다.`, t.i));
      return out;
    } },
  { no: 52, group: '외부감사 실시내용', item: '3. 주요 감사실시내용', kind: 'auto',
    desc: "해당 없으면 '-', 수행시기는 일 단위·당기 사업연도 시작일부터 감사보고서일 사이, 일수 ≤ 수행기간, 커뮤니케이션 횟수 = 수행시기 수",
    check(doc, ctx, facts) {
      const t = externalTable(doc, 'INS_CONT');
      if (!t) return [bad('3. 주요 감사실시내용 표를 찾지 못했습니다.')];
      const out = [];
      const cells = t.grid.flat().filter((c) => c.acode || c.aunit);
      const blank = cells.filter((c) => !tight(c.text));
      if (blank.length) out.push(bad(`공란이 ${blank.length}칸입니다. 해당 없으면 '-'로 적어야 합니다(${blank.slice(0, 6).map((c) => c.acode || c.aunit).join(', ')}).`, t.i));
      const pairs = [];
      for (const row of t.grid) {
        const tim = row.find((c) => /_(TIM|SPE)$/.test(c.acode) && c.acode !== 'COM_TIM'), day = row.find((c) => /_DAY$/.test(c.acode));
        if (tim && day) pairs.push({ tim, day });
      }
      const LABEL = { PLN: '전반감사계획', PLC: '현장감사', STK: '재고자산실사', FIN: '금융자산실사', EXT: '외부전문가 활용' };
      for (const { tim, day } of pairs) {
        const what = LABEL[tim.acode.slice(0, 3)] || tim.acode;
        const tt = tight(tim.text), dd = tight(day.text);
        if (tt === '-' || !tt) { if (dd && dd !== '-' && dd !== '0') out.push(bad(`${what}: 수행시기가 없는데 일수(${dd})가 있습니다.`, t.i, day.text)); continue; }
        if (!/\d/.test(tt)) { out.push(bad(`${what}: 수행시기가 '${flat(tim.text)}'입니다. 해당 없으면 '-'로 적어야 합니다.`, t.i, tim.text)); continue; }
        const runs = workRuns(tim.text);
        if (!runs.length) { out.push(bad(`${what}: 수행시기 '${flat(tim.text)}'를 일 단위까지 적어야 합니다.`, t.i, tim.text)); continue; }
        const n = parseAmount(day.text);
        if (n === null) { out.push(bad(`${what}: 일수 '${day.text}'가 숫자가 아닙니다.`, t.i, day.text)); continue; }
        const cal = runs.reduce((a, r) => a + (r.to >= r.from ? dayDiff(r.from, r.to) + 1 : 1), 0);
        const listed = runs.length > 1 && runs.every((r) => r.from === r.to);
        if (runs.some((r) => r.to < r.from)) out.push(bad(`${what}: 수행시기 '${flat(tim.text)}'의 끝 날짜가 시작 날짜보다 이릅니다.`, t.i, tim.text));
        else if (listed && n > cal) out.push(bad(`${what}: 수행시기 '${flat(tim.text)}'는 날짜 ${cal}개를 ','로 나열했는데 일수가 ${n}일입니다. 기간이면 '${dateText(runs[0].from)} ~ ${dateText(runs.at(-1).to)}'처럼 '~'로 적고, 나열한 날짜라면 일수를 ${cal}일로 적어야 합니다.`, t.i, tim.text));
        else if (n > cal) out.push(bad(`${what}: ${flat(tim.text)} 기간(${cal}일)보다 일수(${n}일)가 큽니다.`, t.i, tim.text));
        else if (listed && n < cal) out.push(warn(`${what}: 수행시기 '${flat(tim.text)}'는 날짜 ${cal}개를 나열했는데 일수가 ${n}일입니다. 일수를 확인하세요.`, t.i, tim.text));
      }
      const field = pairs.filter((x) => x.tim.acode === 'PLC_TIM').map((x) => ({ x, from: workRuns(x.tim.text)[0]?.from })).filter((x) => x.from);
      const signed = facts.auditSign?.date || facts.auditEffective?.date || '';
      for (let k = 1; k < field.length; k++) {
        const typo = !signed || `${Number(field[k].from.slice(0, 4)) + 1}${field[k].from.slice(4)}` <= signed;
        if (field[k].from < field[k - 1].from && typo) out.push(warn(`현장감사 ${k + 1}번째 행(${flat(field[k].x.tim.text)})이 앞 행(${flat(field[k - 1].x.tim.text)})보다 이릅니다. 연도를 확인하세요.`, t.i, field[k].x.tim.text));
      }
      for (const c of cells.filter((x) => x.acode === 'PLC_CNT')) {
        const review = /(?:분\s*[ㆍ·.]?\s*)?(?:분기|반기)\s*검토/.exec(c.text)?.[0];
        if (review) out.push(bad(`현장감사 수행내용에 '${flat(review)}'를 적었습니다. 분·반기 검토는 현장감사(감사) 수행내용에 적지 않습니다('${flat(c.text)}').`, t.i, c.text));
        if (/^(?:\d+차)?(?:중간|기말|조기|본|최종)?감사(?:\d+차)?$/.test(tight(c.text).replace(/[()]/g, ''))) out.push(warn(`현장감사 수행내용이 '${flat(c.text)}'입니다. '내부통제 이해와 평가, 분석적 절차, 표본점검(문서검증, 재계산 등)'처럼 수행한 업무를 적었는지 확인하세요.`, t.i, c.text));
      }
      const by = Object.fromEntries(cells.map((c) => [c.acode || c.aunit, c]));
      const comNum = parseAmount(by.COM_NUM?.text ?? '');
      const comDates = workRuns(by.COM_TIM?.text || '');
      const comm = externalTable(doc, 'INS_COMM');
      const commRows = comm ? comm.grid.filter((row) => row.some((c) => c.acode === 'COMM_NO' && tight(c.text) && tight(c.text) !== '-') && !commRowEmpty(row)).length : null;
      if (comNum !== null && comNum !== comDates.length) out.push(bad(`커뮤니케이션 횟수(${comNum}회)와 수행시기 날짜 수(${comDates.length}개)가 다릅니다.`, t.i, by.COM_NUM?.text));
      if (comNum !== null && commRows !== null && comNum !== commRows) out.push(vs(bad(`커뮤니케이션 횟수(${comNum}회)와 '4. 감사와의 커뮤니케이션' 표의 행 수(${commRows}개)가 다릅니다.`, t.i, by.COM_NUM?.text),
        '3. 커뮤니케이션 횟수', { label: '4. 감사와의 커뮤니케이션', block: comm?.i ?? null }));
      const report = facts.auditSign?.date || facts.auditEffective?.date;
      const dated = cells.filter((c) => /_(TIM|SPE)$/.test(c.acode)).flatMap((c) => runDates(c.text).map((date) => ({ date, text: c.text })));
      for (const c of (comm?.grid.flat() || []).filter((x) => x.aunit === 'COMM_DATE')) if (dateOf(c)) dated.push({ date: dateOf(c), text: c.text });
      const early = dated.filter((d) => ctx.period.from && d.date < ctx.period.from), late = dated.filter((d) => report && d.date > report);
      if (early.length) out.push(warn(`당기 사업연도 시작일(${dateText(ctx.period.from)}) 전 날짜가 있습니다: ${[...new Set(early.map((d) => dateText(d.date)))].join(', ')}`, t.i, early[0].text));
      if (late.length) out.push(warn(`감사보고서일(${dateText(report)}) 뒤 날짜가 있습니다: ${[...new Set(late.map((d) => dateText(d.date)))].join(', ')}`, t.i, late[0].text));
      if (dated.length && !early.length && !late.length) out.push(ok(`수행시기 날짜 ${dated.length}개가 모두 당기 사업연도 시작일부터 감사보고서일 사이입니다.`, t.i));
      const nut = externalTable(doc, 'INS_NUT');
      const hours = parseAmount(nut?.grid.flat().find((c) => c.acode === 'TMT_TOT_TH')?.text ?? '') ?? 0;
      if (hours > 0) for (const code of ['PLN_TIM', 'PLC_TIM']) if (['', '-'].includes(tight(by[code]?.text || ''))) out.push(bad(`당기 투입시간(${num(hours)}시간)이 있는데 ${LABEL[code.slice(0, 3)]} 수행시기가 없습니다.`, t.i));
      if (!out.length) out.push(ok(`수행시기·일수·커뮤니케이션 횟수(${comNum ?? '-'}회)가 맞습니다.`, t.i));
      return out;
    } },
  { no: 53, group: '외부감사 실시내용', item: '4. 감사(감사위원회)와의 커뮤니케이션', kind: 'auto',
    desc: '3. 지배기구와의 커뮤니케이션 수행시기와 일치, 참석자(회사측·감사인측), 주요 논의 내용',
    check(doc) {
      const t = externalTable(doc, 'INS_COMM');
      if (!t) return [bad('4. 감사(감사위원회)와의 커뮤니케이션 표를 찾지 못했습니다.')];
      const all = t.grid.filter((row) => row.some((c) => c.acode === 'COMM_NO'));
      const out = [];
      const empty = all.filter(commRowEmpty);
      if (empty.length && empty.length < all.length) out.push(bad(`빈 행이 ${empty.length}개 있습니다. 쓰지 않는 행은 지워야 합니다.`, t.i));
      const rows = empty.length < all.length ? all.filter((row) => !commRowEmpty(row)) : all;
      const dateCells = rows.map((row) => row.find((c) => c.aunit === 'COMM_DATE')).filter(Boolean);
      const dates = dateCells.map(dateOf);
      const cont = externalTable(doc, 'INS_CONT');
      const planned = runDates(cont?.grid.flat().find((c) => c.acode === 'COM_TIM')?.text || '');
      const missing = dates.filter((d) => d && !planned.includes(d)), extra = planned.filter((d) => !dates.includes(d));
      if (missing.length || extra.length) out.push(vs(bad(`3. 주요 감사실시내용의 커뮤니케이션 수행시기와 다릅니다(${[...missing.map((d) => `표에만 ${dateText(d)}`), ...extra.map((d) => `수행시기에만 ${dateText(d)}`)].join(', ')}).`, t.i),
        '4. 감사와의 커뮤니케이션', { label: '3. 커뮤니케이션 수행시기', block: cont?.i ?? null, quote: cont?.grid.flat().find((c) => c.acode === 'COM_TIM')?.text }));
      rows.forEach((row, k) => {
        const attn = row.find((c) => c.acode === 'COMM_ATTN')?.text || '', dis = row.find((c) => c.acode === 'COMM_DIS')?.text || '';
        const ta = tight(attn), td = tight(dis);
        const labelled = /(?:외부)?감사인(?:측)?\s*[:：]|감사인측/.exec(ta);
        const lines = String(attn).split('\n').map(tight).filter(Boolean);
        const at = labelled ? -1 : lines.findIndex((l, n) => n > 0 && /^(?:업무수행|담당회계사|회계사|파트너|매니저|감사팀|회계법인|감사인)/.test(l));
        const side = labelled || (at > 0 ? { index: lines.slice(0, at).join('').length, 0: '' } : null);
        const companyPart = side ? ta.slice(0, side.index) : '';
        const companyLabel = /회사(?:측)?\s*[:：]|회사측|^(?:감사위원회|감사|경영진|지배기구)\s*[:：]/.test(ta);
        const companySide = companyLabel || (labelled && /감사|위원|이사|경영진|지배기구|대표|임원|재무|담당/.test(companyPart));
        if (!ta) out.push(bad(`${k + 1}회차 참석자가 비어 있습니다.`, t.i));
        else if (!companySide || !side) out.push(bad(`${k + 1}회차 참석자에 회사측·감사인측을 나눠 적어야 합니다('${short(attn, 40)}').`, t.i, attn));
        else {
          const company = companyPart, auditor = ta.slice(side.index + side[0].length);
          if (!/\d+\s*(인|명)/.test(auditor) && !/외\d|등\d/.test(auditor) && /(?:등|외|다수)$/.test(auditor)) out.push(warn(`${k + 1}회차 감사인측 참석인원(예: 업무수행이사 외 1인)이 없습니다('${short(attn, 40)}').`, t.i, attn));
          if (!/감사|이사|위원|담당|팀장|사장|대표|임원|회계사|매니저/.test(company) || !/이사|회계사|파트너|매니저|담당|감사/.test(auditor)) out.push(warn(`${k + 1}회차 참석자에 직위가 없습니다('${short(attn, 40)}').`, t.i, attn));
        }
        if (!td || td === '-') out.push(bad(`${k + 1}회차 주요 논의 내용이 없습니다.`, t.i));
        else if (td.length < 8) out.push(warn(`${k + 1}회차 주요 논의 내용('${flat(dis)}')을 '회계감사 수행계획', '재무제표에 대한 분석적 절차 수행 결과' 등으로 자세히 적었는지 확인하세요.`, t.i, dis));
      });
      out.push(...storedDateErrors(dateCells, '커뮤니케이션 일자', t.i));
      if (!out.length) out.push(ok(`${rows.length}회 모두 수행시기·참석자·논의 내용이 맞습니다.`, t.i));
      return out;
    } },
  { no: 54, group: '외부감사 실시내용', item: '5. 감사인의 중요성 금액', kind: 'auto',
    desc: '『감사인의 중요성 금액』 삽입·작성 금지',
    check(doc) {
      const ins = insertion(doc, '감사인의중요성금액');
      if (ins?.inserted) return [spanTo(bad('『감사인의 중요성 금액』을 삽입했습니다. 삭제해야 합니다.', doc.blocks[ins.start]?.i ?? null, '감사인의 중요성 금액'), filledEnd(doc, ins.start, ins.end - 1))];
      return [ok('『감사인의 중요성 금액』을 삽입하지 않았습니다.')];
    } },
  { no: 55, group: '외부감사 실시내용', item: '감사보고서와 연결감사보고서(연결이 있는 경우)', kind: 'auto',
    desc: '연결감사보고서가 있으면 별도·연결의 외부감사 실시내용이 다르게 적히지 않았는지(IFRS 미적용 선택 회사는 제외). 비교할 DSD를 함께 올린다',
    applies: (ctx, facts, doc) => ctx.ifrs && (ctx.consolidated || doc.header.summary.LINK_FLAG === 'Y'),
    check(doc, ctx, facts, options) {
      const other = options?.other;
      if (!other) return [warn(`${ctx.consolidated ? '별도' : '연결'}감사보고서 DSD를 함께 올리면 외부감사 실시내용을 비교합니다. [${ctx.consolidated ? '별도' : '연결'}보고서 함께 점검]으로 올리세요.`)];
      const otherConsolidated = contextOf(other).consolidated;
      if (otherConsolidated === ctx.consolidated) return [bad(`비교 파일(${other.name})도 ${ctx.consolidated ? '연결' : '별도'}감사보고서입니다. ${ctx.consolidated ? '별도' : '연결'}감사보고서를 올리세요.`)];
      if (companyKey(other.header.company || other.meta.regname) !== companyKey(doc.header.company || doc.meta.regname)) return [bad(`비교 파일의 회사(${other.header.company || other.meta.regname || '빈칸'})가 다릅니다.`)];
      const a = externalValues(doc), b = externalValues(other);
      const diff = [...new Set([...a.keys(), ...b.keys()])].filter((k) => (a.get(k)?.cmp ?? '') !== (b.get(k)?.cmp ?? ''));
      const t = externalTable(doc, 'INS_NUT');
      if (!diff.length) return [ok(`${other.name}와 외부감사 실시내용 ${a.size}칸이 같습니다.`, t?.i ?? null)];
      const mine = facts.auditSign?.date || facts.auditEffective?.date;
      const theirs = signatureOf(other, 'audit')?.date || effectiveOf(other, 'audit')?.date;
      const later = mine && theirs && mine !== theirs;
      const wording = diff.every((k) => /^(?:[A-Z]{3}_(?:CNT|PNT|TAG)|ASK_ETC|EXT_SPE|COMM_(?:ATTN|WAY|DIS))(?:#\d+)?$/.test(k)
        && !/\p{N}/u.test(`${a.get(k)?.show || ''}${b.get(k)?.show || ''}`));
      if (wording && !later) return [warn(`${other.name}와 외부감사 실시내용의 글 칸 ${diff.length}개가 다릅니다(수치·날짜는 같음). 별도·연결의 실사 대상·수행내용 등이 실제로 다른지, 표현만 다른지 확인하세요.`, t?.i ?? null)]
        .concat(diff.slice(0, 15).map((k) => warn(`${k}: 이 파일 '${a.get(k)?.show ?? '없음'}' / 비교 파일 '${b.get(k)?.show ?? '없음'}'`, null, a.get(k)?.show || '')));
      const head = later ? warn(`${other.name}와 외부감사 실시내용이 ${diff.length}칸 다릅니다. 보고서일이 달라(이 파일 ${dateText(mine)}, 비교 파일 ${dateText(theirs)}) 나중 보고서에 투입 내용을 더했으면 다를 수 있습니다. 맞는지 확인하세요.`, t?.i ?? null)
        : bad(`${other.name}와 외부감사 실시내용이 ${diff.length}칸 다릅니다.${mine && theirs ? ` 두 보고서일이 같습니다(${dateText(mine)}).` : ''}`, t?.i ?? null);
      return [head].concat(diff.slice(0, 15).map((k) => warn(`${k}: 이 파일 '${a.get(k)?.show ?? '없음'}' / 비교 파일 '${b.get(k)?.show ?? '없음'}'`, null, a.get(k)?.show || '')));
    } },
];

/** 내부회계 감사(34~39)·검토(40~45) 규칙. */
function icfrRules(kind, start) {
  const word = kind === 'audit' ? '감사' : '검토';
  const group = kind === 'audit' ? '(1) 독립된 감사인의 내부회계관리제도 감사보고서' : '(2) 독립된 감사인의 내부회계관리제도 검토보고서';
  const applies = (ctx) => ctx.icfr === kind;
  const rules = [
    { item: '첨부 서한문구', kind: 'auto', desc: `'독립된 감사인의 내부회계관리제도 ${word}보고서는 … 첨부하는 것입니다.'와 첨부 목록이 표준과 같은지`,
      check: (doc, ctx) => icfrLetterFindings(doc, ctx, kind) },
    { item: `내부회계관리제도 ${word}보고서 표지`, kind: 'auto', desc: "'주주 및 이사회 귀중'('대표이사 귀하' 오류)", check: (doc) => icfrCoverFindings(doc) },
  ];
  if (kind === 'audit') {
    rules.push(
      { item: '내부회계관리제도에 대한 감사의견', kind: 'auto', desc: '당기 사업연도, 재무제표 명칭, 감사보고서일 일치',
        check(doc, ctx, facts) {
          const blocks = top(inPart(doc, 'icfr'));
          const out = [];
          const opinion = blocks.find((b) => tight(b.text).includes('효과적으로설계및운영되고있습니다'));
          if (!opinion) out.push(bad('내부회계관리제도 감사의견 문단을 찾지 못했습니다.'));
          else if (!findDates(opinion.text).some((d) => d.date === ctx.period.to)) out.push(bad(`감사의견에 당기말(${dateText(ctx.period.to)})이 없습니다.`, opinion.i));
          else out.push(ok(`당기말 ${dateText(ctx.period.to)} 현재`, opinion.i));
          if (ctx.icfrConsolidated) {
            const scope = blocks.find((b) => tight(b.text).includes('내부회계관리제도를감사하였습니다'));
            if (scope && !tight(scope.text).includes('연결내부회계관리제도를감사하였습니다')) out.push(bad("감사 대상 문장의 '내부회계관리제도' 앞에 '연결'이 없습니다. '… (이하 \"연결회사\")의 연결내부회계관리제도를 감사하였습니다'로 적어야 합니다.", scope.i, '내부회계관리제도를감사하였습니다'));
            const said = opinion && /우리의의견으로는.{0,20}?(연결)?내부회계관리제도[는가은]/.exec(tight(opinion.text));
            if (said && !said[1]) out.push(bad("감사의견 문장의 '내부회계관리제도' 앞에 '연결'이 없습니다. '우리의 의견으로는 연결회사의 연결내부회계관리제도는 …'으로 적어야 합니다.", opinion.i, said[0]));
          }
          const also = blocks.find((b) => tight(b.text).includes('감사하였으며') && tight(b.text).includes('감사보고서에서'));
          const typo = !also && blocks.find((b) => tight(b.text).includes('감사하였으며') && /보고서에서.*의견을표명/.test(tight(b.text)));
          if (typo) out.push(bad("'… 자 감사보고서에서 적정의견을 표명하였습니다.' 문구가 표준과 다릅니다('감사보고서' 표기를 확인하세요).", typo.i, clip(typo.text, 60)));
          else if (!also) out.push(bad("'우리는 또한 … 감사보고서에서 적정의견을 표명하였습니다.' 문단을 찾지 못했습니다."));
          else {
            const m = /(\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일)\s*자\s*감사보고서/.exec(flat(also.text));
            const d = m ? findDates(m[1])[0]?.date : '';
            const report = facts.auditSign?.date || facts.auditEffective?.date;
            if (!d) out.push(bad('재무제표 감사보고서 일자가 없습니다.', also.i));
            else if (report && d !== report) out.push(vs(bad(`인용한 감사보고서 일자(${dateText(d)})가 감사보고서일(${dateText(report)})과 다릅니다.`, also.i, m[1]), '인용한 감사보고서 일자',
              { label: '감사보고서일', block: facts.auditSign?.dateBlock.i, quote: facts.auditSign?.dateText }));
            else out.push(ok(`인용한 감사보고서 일자: ${dateText(d)}`, also.i, m[1]));
            out.push(...statementListFindings(also.text, also, facts, '내부회계 감사의견'));
          }
          return out;
        } },
      { item: '업무수행이사', kind: 'auto', desc: "'이 독립된 감사인의 (연결)내부회계관리제도 감사보고서의 근거가 된 감사를 실시한 업무수행이사는 공인회계사 [이름]입니다.'",
        check(doc, ctx) {
          const p = partnerOf(doc, 'icfr');
          if (!p) return [bad('업무수행이사 문장이 없습니다.')];
          const out = [];
          if (!p.name) out.push(bad('업무수행이사 이름이 없습니다.', p.block.i));
          const audit = partnerOf(doc, 'audit');
          if (p.name && audit?.name && audit.name !== p.name) out.push(vs(bad(`감사보고서 업무수행이사(${audit.name})와 다릅니다(${p.name}).`, p.block.i, p.name), '내부회계 업무수행이사', { label: '감사보고서 업무수행이사', block: audit.block.i, quote: audit.name }));
          const T = icfrTerm(ctx);
          if (!tight(p.text).includes(`${T}감사보고서의근거가된`)) {
            const plain = tight(p.text).includes('감사보고서의근거가된');
            out.push(bad(`${plain ? `'이 독립된 감사인의 ${tight(p.text).includes('내부회계관리제도감사보고서의근거가된') ? '내부회계관리제도 ' : ''}감사보고서의 근거가 된'으로 적었습니다. ` : ''}'이 독립된 감사인의 ${T} 감사보고서의 근거가 된 …'으로 적어야 합니다.`, p.block.i, plain ? '감사보고서의 근거가 된' : clip(p.text, 40)));
          }
          if (!out.length) out.push(ok(`업무수행이사: 공인회계사 ${p.name}`, p.block.i, p.name));
          return out;
        } },
    );
  } else {
    rules.push(
      { item: '검토 보고서 일자', kind: 'auto', desc: '내부회계관리제도 검토보고서 일자 = 감사보고서 일자(다르면 사전 통보)',
        check(doc, ctx, facts) {
          const d = facts.icfrSign?.date || facts.icfrEffective?.date, report = facts.auditSign?.date || facts.auditEffective?.date;
          if (!d) return [bad('검토보고서 일자를 찾지 못했습니다.')];
          if (report && d !== report) return [vs(bad(`검토보고서 일자(${dateText(d)})가 감사보고서 일자(${dateText(report)})와 다릅니다.`, (facts.icfrSign?.date ? facts.icfrSign.dateBlock : facts.icfrEffective.block).i, facts.icfrSign?.date ? facts.icfrSign.dateText : facts.icfrEffective.dateText),
            '검토보고서 일자', { label: '감사보고서일', block: facts.auditSign?.dateBlock.i, quote: facts.auditSign?.dateText })];
          return [ok(`검토보고서 일자: ${dateText(d)}`)];
        } },
      { item: '내부회계관리제도 검토보고서 본문(도입문단)', kind: 'auto', desc: '당기 사업연도, 정의 문단의 회계기준이 감사보고서 본문과 같은지',
        check(doc, ctx) {
          const blocks = top(inPart(doc, 'icfr'));
          const out = [];
          const intro = blocks.find((b) => tight(b.text).includes('운영실태보고서에대하여검토를실시하였습니다'));
          const old = !intro && blocks.find((b) => tight(b.text).includes('운영실태평가보고서에대하여검토'));
          if (old) out.push(bad("도입 문단이 옛 서식 문구('운영실태평가보고서에 대하여 검토')입니다. '… 운영실태보고서에 대하여 검토를 실시하였습니다.'로 적어야 합니다.", old.i, '운영실태평가보고서'));
          else if (!intro) out.push(bad("도입 문단('… 운영실태보고서에 대하여 검토를 실시하였습니다.')을 찾지 못했습니다."));
          else {
            const t = tight(intro.text), company = doc.header.company || doc.meta.regname;
            if (!findDates(intro.text).some((d) => d.date === ctx.period.to)) out.push(bad(`도입 문단에 당기말(${dateText(ctx.period.to)})이 없습니다.`, intro.i));
            else out.push(ok(`도입 문단: ${dateText(ctx.period.to)} 현재`, intro.i));
            if (!t.includes('첨부된')) out.push(bad("도입 문단에 '첨부된 (회사)의 … 운영실태보고서'가 없습니다.", intro.i));
            if (!t.includes('경영진에게있으며')) out.push(bad("도입 문단에 '운영실태보고서를 작성할 책임은 … 경영진에게 있으며'가 없습니다.", intro.i));
            if (company && !companyKey(t).includes(companyKey(company))) out.push(bad(`도입 문단에 회사명(${company})이 없습니다.`, intro.i));
          }
          const want = ctx.ifrs ? '한국채택국제회계기준' : '일반기업회계기준', other = ctx.ifrs ? '일반기업회계기준' : '한국채택국제회계기준';
          const def = blocks.find((b) => tight(b.text).includes('내부회계관리제도는지배기구와경영진'));
          if (!def) out.push(warn('정의 문단을 찾지 못했습니다.'));
          else if (tight(def.text).includes(other)) out.push(bad(`정의 문단의 회계기준이 '${other}'입니다. 감사보고서 본문과 같은 '${ctx.ifrs ? want : `대한민국의 ${want}`}'로 적어야 합니다.`, def.i, other));
          else out.push(...standardFindings(def, '정의 문단'));
          const report = operatingReport(doc);
          const reportAt = Math.min(report.blocks[0]?.i ?? Infinity, report.images[0]?.i ?? Infinity);
          const letterAt = blocks.find((b) => tight(b.text).includes('첨부하는것입니다'))?.i ?? -1;
          const body = blocks.filter((b) => b.i > letterAt && b.i < reportAt);
          const once = (re) => body.find((b) => re.test(tight(b.text)));
          const result = once(/검토결과를표명/);
          if (result) out.push(bad("'검토 결과를 표명'으로 적었습니다. '검토 결론을 표명'으로 적어야 합니다.", result.i, '결과를 표명'));
          const oldName = body.find((b) => b !== old && /운영실태평가보고(?!는)/.test(tight(b.text)));
          if (oldName) out.push(bad("검토보고서에 옛 이름 '운영실태평가보고(서)'가 있습니다. '운영실태보고(서)'로 적어야 합니다.", oldName.i, '운영실태평가보고'));
          const manager = once(/경영자(?:는|의|가|에게|와)/);
          if (manager) out.push(bad("검토보고서에 '경영자'로 적었습니다. '경영진'으로 적어야 합니다.", manager.i, '경영자'));
          return out;
        } },
    );
  }
  rules.push(
    { item: '감사인주소 및 대표이사명/보고서일자기재', kind: 'auto', desc: `감사인 주소·대표이사명·보고서일 기재, 감사보고서 본문 = 유효시점 문구 = 내부회계 ${word}보고서 날짜`,
      check(doc, ctx, facts) {
        const out = signatureFindings(facts.icfrSign, `내부회계 ${word}보고서`);
        const report = facts.auditSign?.date || facts.auditEffective?.date;
        if (facts.icfrSign?.date && report && facts.icfrSign.date !== report) out.push(vs(bad(`${word}보고서일(${dateText(facts.icfrSign.date)})이 감사보고서일(${dateText(report)})과 다릅니다.`, facts.icfrSign.dateBlock.i, facts.icfrSign.dateText),
          `${word}보고서일`, { label: '감사보고서일', block: facts.auditSign?.dateBlock.i, quote: facts.auditSign?.dateText }));
        return out;
      } },
    { item: '유효시점 문구', kind: 'auto', desc: `유효시점 문구 기재, 문구의 ${word}보고서일 = ${word}보고서일자`,
      check(doc, ctx, facts) {
        const report = facts.icfrSign?.date ? { date: facts.icfrSign.date, label: `내부회계 ${word}보고서일`, block: facts.icfrSign.dateBlock.i, quote: facts.icfrSign.dateText }
          : { date: facts.auditSign?.date || facts.auditEffective?.date, label: '감사보고서일', block: facts.auditSign?.dateBlock.i, quote: facts.auditSign?.dateText };
        return effectiveFindings(facts.icfrEffective, report, `${word}보고서`, ctx.icfrConsolidated ? '연결회사의 연결내부회계관리제도' : '회사의 내부회계관리제도');
      } },
  );
  return rules.map((r, k) => ({ no: start + k, group, applies, ...r }));
}

/** 처분(처리)예정일·확정일 이름(띄어 쓴 '처 분 예 정 일'·'처분예정일자'도). */
const APPROPRIATION_DATE = /처\s*[분리]\s*(?:예\s*정|확\s*정)\s*일(?:\s*자)?/g;

/**
 * 처분(처리)예정일·확정일 표. 당기 = 행의 앞 이름, 전기 = 뒤 이름. 날짜는 이름 칸 안(이름 뒤)에서 먼저, 없으면 옆 칸에서.
 * 이름과 날짜가 한 칸에 같이 적힌 꼴('처분예정일 2025년 3월 31일' — 주석의 처분계산서에 흔하다)도 읽는다. 칸 글이 이름과 똑같을 때만
 * 읽어 이 꼴을 못 찾고 '처분(처리)예정일을 찾지 못했습니다'가 나왔다(사용자 2026-10-19).
 */
export function appropriationOf(doc) {
  for (const t of doc.tables) {
    if (t.part !== 'notes' && t.part !== 'fs') continue;
    for (const row of t.grid) {
      const labels = [];
      row.forEach((c, k) => {
        for (const m of String(c.text || '').matchAll(APPROPRIATION_DATE)) labels.push({ c, k, t: tight(m[0]).replace(/자$/, ''), start: m.index, end: m.index + m[0].length });
      });
      if (!labels.length) continue;
      const read = (x, next) => {
        const same = findDates(x.c.text).find((d) => d.index >= x.end && !(next?.c === x.c && d.index >= next.end));
        const adjacent = row.slice(x.k + 1, next ? next.k : row.length).map((c) => c.text);
        if (next && next.k > x.k) adjacent.push(String(next.c.text || '').slice(0, next.start));
        const val = same ? null : adjacent.find((text) => findDates(text).length);
        const d = same || (val ? findDates(val)[0] : null);
        return d ? { label: x.t, date: d.date, text: d.text } : null;
      };
      const current = read(labels[0], labels[1]), previous = labels[1] ? read(labels[1]) : null;
      if (!current) continue;
      const { title, kind } = appropriationTitle(doc, t.i);
      return { block: t, current, previous, title, kind };
    }
  }
  const SENTENCE = /(\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일)\s*(?:의|에)?\s*(?:개최될\s*|개최되는\s*|개최\s*예정인\s*)?(?:정기\s*)?주주총회에서\s*(?:처분|처리|승인|확정)\s*될\s*예정/;
  const notes = doc.blocks.filter((b) => b.part === 'notes' && !b.nested);
  for (const [k, b] of notes.entries()) {
    if (!/이익잉여금처분계산서|결손금처리계산서|잉여금처리계산서/.test(tight(b.text))) continue;
    for (const x of notes.slice(k, k + 4)) {
      const m = SENTENCE.exec(flat(x.text));
      const d = m && findDates(m[1])[0];
      if (!d) continue;
      const { title, kind } = appropriationTitle(doc, x.i);
      return { block: x, current: { label: kind === '처리' ? '처리예정일' : '처분예정일', date: d.date, text: d.text }, previous: null, title, kind, sentence: true };
    }
  }
  return null;
}

/** 처분계산서인지 처리계산서인지(앞 6블록의 제목). */
function appropriationTitle(doc, i) {
  const before = doc.blocks.slice(Math.max(0, i - 6), i + 1).map((b) => tight(b.text)).join('');
  const title = before.includes('결손금처리계산서') && !before.includes('이익잉여금처분계산서') ? '결손금처리계산서'
    : before.includes('이익잉여금처분계산서') && !before.includes('결손금처리계산서') ? '이익잉여금처분계산서' : '';
  return { title, kind: title === '이익잉여금처분계산서' ? '처분' : title === '결손금처리계산서' ? '처리' : '' };
}

/**
 * 전기 계산서 종류: '처리'(결손) · '처분'(잉여) · ''(모름). 금액 표 첫 행(미처분이익잉여금 · 미처리결손금)의 이름과 전기 금액 부호로 정한다.
 * '미처리결손금'만 적은 행은 부호와 상관없이 결손(서울-춘천고속도로는 결손을 양수로 적었다), '미처분이익잉여금(미처리결손금)'처럼 함께 적은 행은 부호로.
 */
function appropriationPriorKind(table) {
  const row = table?.grid.find((r) => /미처분이익잉여금|미처리결손금/.test(rowLabel(r)));
  if (!row) return '';
  const label = rowLabel(row), values = row.slice(1).map((c) => parseAmount(c.text)).filter((v) => v !== null);
  const prior = values.at(-1);
  if (prior === undefined || values.length < 2) return '';
  const deficit = /미처리결손금/.test(label), surplus = /미처분이익잉여금/.test(label);
  if (deficit && !surplus) return '처리';
  if (prior === 0) return '';
  return prior < 0 ? '처리' : '처분';
}

/**
 * 이익잉여금처분계산서(결손금처리계산서) 금액단위(엑셀 32번): 단위가 없거나, 미처분이익잉여금(미처리결손금)이 재무상태표와 같은 숫자인데 단위가 다른 것.
 * → {findings, table(금액 표)}.
 */
function appropriationUnit(doc, facts) {
  const plan = appropriationOf(doc);
  if (!plan) return { findings: [], table: null };
  const RE = /미처분이익잉여금|미처리결손금/;
  const self = plan.block.kind === 'table' && plan.block.border === '1' && plan.block.grid.some((r) => RE.test(rowLabel(r)));
  const amountTable = (b) => b.kind === 'table' && b.border === '1' && !b.nested;
  const back = plan.sentence ? doc.blocks.slice(Math.max(0, plan.block.i - 8), plan.block.i).reverse().find((b) => amountTable(b) && b.grid.some((r) => RE.test(rowLabel(r)))) : null;
  const table = self ? plan.block : back || doc.blocks.slice(plan.block.i + 1, plan.block.i + 8).find(amountTable);
  if (!table) return { findings: [], table: null };
  const name = plan.title || '이익잉여금처분계산서';
  const from = Math.min(plan.block.i, table.i);
  const around = doc.blocks.slice(Math.max(0, from - 3), table.i).map((b) => b.text).concat((table.grid[0] || []).map((c) => c.text)).join(' ');
  const u = /단위\s*[:：]?\s*(백만원|천원|원)/.exec(around);
  if (!u) return { findings: [bad(`${name}에 금액단위가 없습니다.`, table.i)], table };
  const unitAt = doc.blocks.slice(Math.max(0, from - 3), table.i).find((b) => b.text.includes(u[0]))?.i ?? table.i;
  const unit = { 원: 1, 천원: 1e3, 백만원: 1e6 }[u[1]];
  const row = table.grid.find((r) => RE.test(rowLabel(r)));
  const value = row?.slice(1).map((c) => parseAmount(c.text)).find((v) => v !== null && v !== 0);
  const bs = facts.statements.find((s) => s.base === '재무상태표');
  const fsValue = currentAmount(bs, RE);
  if (value && fsValue?.value && bs.unit) {
    const implied = (Math.abs(fsValue.value) * bs.unit) / Math.abs(value);
    const near = [1, 1e3, 1e6].find((x) => Math.abs(implied / x - 1) < 0.01);
    const NAME = { 1: '원', 1000: '천원', 1000000: '백만원' };
    if (near && near !== unit) return { findings: [bad(`${name} 단위가 '${u[1]}'인데 금액은 ${NAME[near]} 단위입니다(재무상태표 ${flat(fsValue.label)} ${num(fsValue.value)}${bs.unitText}).`, unitAt, u[0])], table };
  }
  return { findings: [ok(`${name} 금액단위: ${u[1]}`, unitAt, u[0])], table };
}

/** DART 편집기 감사보고서 서식(00760·00761@6_0)의 견본 문구 — 바꿔 쓰지 않고 남긴 자리 글. */
const TEMPLATE_LEFTOVERS = [
  /감사대상\s*회사의\s*명칭/, /감사인\s*명칭/, /대표자\s*명칭/,
  /XX+\s*주식회사|주식회사\s*XX+|XX+\s*귀중|회사명\s*[:：]\s*X{3,}/,
  /X{4}\s*년\s*X{2}\s*월\s*X{2}\s*일|X{4}\.X{2}\.X{2}|20xx\.\s*xx|xxxx\.\s*x\.\s*xx/i,
  /제\s*XX\s*(?:\(\s*[당전]\s*\))?\s*기/, /대표이사\s*XXX/, /홍길동|○○○/,
  /내부회계관리제도\s*감사\s*\(\s*검토\s*\)\s*의견\s*제출\s*대상\s*안내/,
];

/** 견본 문구가 남은 곳(블록마다 한 번). 안에 든 표는 바깥 블록 글에 이미 들어 있어 뺀다. */
export function templateLeftovers(doc) {
  const out = [];
  for (const b of doc.blocks) {
    if (b.nested || !b.text) continue;
    const text = flat(b.text);
    for (const re of TEMPLATE_LEFTOVERS) {
      const m = re.exec(text);
      if (m) { out.push({ text: m[0], block: b.i }); break; }
    }
  }
  return out;
}

/** 금액 칸의 세자리 콤마 오류. 주석번호 목록("5,7,35")처럼 모든 묶음이 두 자리 이하인 것은 뺀다. */
export function commaErrors(doc) {
  const out = [];
  for (const t of doc.tables) {
    if (t.part !== 'fs' && t.part !== 'notes') continue;
    for (const row of t.grid) {
      for (const c of row) {
        if (c.tag === 'TH') continue;
        const s = tight(c.text).replace(/^[(△▲-]+|[)]+$/g, '');
        if (!/^\d[\d,]*\d$/.test(s) || !s.includes(',')) continue;
        const groups = s.split(',');
        const rest = groups.slice(1);
        if (rest.every((g) => g.length <= 2)) continue;
        if (groups[0].length > 3 || rest.some((g) => g.length !== 3)) out.push({ text: c.text, block: t.i });
      }
    }
  }
  return out;
}

/** 오류 > (수동 항목) 수동 확인 > 확인 필요 > (수동 확인 부분이 걸린 자동 항목) 수동 확인 > 통과.
 *  수동 확인 부분(manualPart)이 걸리면 자동 점검이 다 맞아도 사람이 볼 것이 남아 '통과'가 아니다(사용자 2026-10-19, 9번 IFRS 미적용 dat 파일). */
function statusOf(rule, findings, manualPart = '') {
  if (findings.some((x) => x.level === 'fail')) return 'fail';
  if (rule.kind === 'manual') return 'manual';
  if (findings.some((x) => x.level === 'warn')) return 'warn';
  if (manualPart) return 'manual';
  return 'pass';
}

/**
 * 문서 → 규칙마다 결과. overrides는 화면에서 바꾼 적용 기준, options.other는 비교할 별도·연결 DSD(55번).
 * scope·outOfScope: 범위 밖 서식이면 화면은 결과 대신 안내를 띄우고([참고로 점검]을 누를 때만 결과), 엑셀에 '범위 밖 서식 — 참고용'을 적는다.
 */
export function runChecklist(doc, overrides = {}, options = {}) {
  const scope = scopeOf(doc);
  const ctx = contextOf(doc, overrides);
  const facts = factsOf(doc, ctx);
  const results = isInterimReview(doc) ? interimResults(doc, overrides) : RULES.map((rule) => {
    const base = { no: rule.no, group: rule.group, item: rule.item, kind: rule.kind, desc: rule.desc, manualPart: rule.manualPart?.(ctx, options, doc, facts) || '' };
    if (rule.applies && !rule.applies(ctx, facts, doc)) return { ...base, manualPart: '', status: 'na', findings: [] };
    let findings = [];
    if (rule.check) {
      try {
        findings = rule.check(doc, ctx, facts, options) || [];
      } catch (error) {
        findings = [warn(`점검 중 오류가 났습니다: ${error.message}`)];
      }
    }
    if (rule.head) for (const x of findings) if ((x.block === null || x.block === undefined) && !x.head) x.head = rule.head;
    return { ...base, status: statusOf(rule, findings, base.manualPart), findings };
  });
  const extras = [
    { no: 56, group: '주석', item: '주석 번호 순서·중복·제목 형식', check: noteNumberFindings },
    { no: 57, group: isInterimReview(doc) ? '독립된 감사인의 검토보고서(본문)' : '독립된 감사인의 감사보고서(본문)', item: '핵심·강조·기타사항 주석 참조와 관련 근거', check: reportNoteFindings },
  ];
  for (const rule of extras) {
    const findings = rule.check(doc);
    if (rule.no === 57) {
      for (const candidate of results.find((r) => r.no === 19)?.findings || []) {
        if (!['핵심감사사항', '강조사항', '기타사항'].includes(candidate.unresolvedReportHeading)) continue;
        findings.push(warn(`${candidate.unresolvedReportHeading} 제목 후보의 문단 경계를 읽지 못해 주석 참조 점검이 완전하지 않습니다. 원문에서 참조 번호와 해당 주석의 내용·금액·기간을 직접 대조하세요.`, candidate.block, candidate.quote));
      }
    }
    results.push({ no: rule.no, group: rule.group, item: rule.item, kind: 'assist', desc: '주석 번호와 원문을 대조합니다. 관련성은 사람이 확인합니다.', manualPart: '', status: findings.length ? statusOf(rule, findings) : 'na', findings });
  }
  if (!isInterimReview(doc) && scope.inScope) results.push(auditHistoryResult(doc,ctx,options.auditHistory));
  if (isInterimReview(doc)) results.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
  const counts = { fail: 0, warn: 0, manual: 0, pass: 0, na: 0 };
  for (const r of results) counts[r.status]++;
  return { ctx, facts, results, counts, scope, outOfScope: scope.inScope === false };
}
