import { tight, isHeadingLine } from './dsd-read.js';
export function noteCatalog(doc) {
  const notes = []; let current = null;
  for (const b of doc.blocks.filter((b) => b.part === 'notes' && !b.nested)) {
    let offset = 0;
    for (const line of String(b.text).split('\n')) {
      const m = b.kind !== 'table' && /^\s*(\d{1,3}(?:\.\d{1,3})*)\.\s*([^\d\s].{0,90})$/.exec(line);
      if (m) { current = { no: m[1], title: m[2].trim(), block: b.i, at: offset, text: '', lines: [] }; notes.push(current); }
      if (current) { current.lines.push({ block: b.i, at: offset, text: line, table: b.kind === 'table' }); current.text += line + '\n'; }
      offset += line.length + 1;
    }
  }
  return notes;
}
export function noteCitations(text) {
  const refs = [];
  const item = String.raw`\d+(?:\.\d+)*(?:\s*-?\s*\(\s*\d+\s*\))?`;
  const list = new RegExp(String.raw`주석\s*[:：]?\s*(${item}(?:\s*(?:[,、]|및|과|와)\s*${item})*)`, 'g');
  for (const match of String(text).matchAll(list)) {
    for (const token of match[1].matchAll(new RegExp(item, 'g'))) {
      const label = token[0].replace(/\s+/g, '');
      const no = /^\d+(?:\.\d+)*/.exec(label)[0];
      if (!refs.some(ref => ref.label === label)) refs.push({ no, label });
    }
  }
  return refs;
}
export function noteReferences(text) {
  return [...new Set(noteCitations(text).map(ref => ref.no))];
}
const f = (level, text, b, quote = '', extra = {}) => ({ level, text, block: b?.i ?? null, quote, ...extra });
/** 소수점 하위 항목(주석 2.19 → 주석 2 안의 '2.19 수익인식' 줄). 끝에 마침표 없는 소제목은 noteCatalog에 없어 상위 주석 안에서 찾는다.
 *  UAT 2026-10-26 앤디포스: 핵심감사사항 '주석 2.19'를 찾지 못했다. 소제목 줄이 꼭 하나일 때만 잇는다. */
function subNote(notes, no) {
  const parts = no.split('.');
  for (let k = parts.length - 1; k > 0; k--) {
    const up = parts.slice(0, k).join('.');
    const parents = notes.filter((n) => n.no === up);
    if (parents.length !== 1) { if (parents.length) return null; continue; }
    const lines = notes.filter((n) => n.no === up || n.no.startsWith(`${up}.`)).flatMap((n) => n.lines);
    const numbered = (l) => !l.table && /^\s*(\d{1,3}(?:\.\d{1,3})+)(?:\.\s*|\s+)([가-힣A-Za-z(].{0,90})$/.exec(l.text);
    const heads = lines.flatMap((l, i) => numbered(l)?.[1] === no ? [i] : []);
    if (heads.length !== 1) return null;
    const i = heads[0];
    const end = lines.findIndex((l, j) => j > i && (m => m && m[1].startsWith(`${up}.`) && m[1] !== no && !m[1].startsWith(`${no}.`))(numbered(l)));
    return { parent: parents[0], no, title: numbered(lines[i])[2].trim(), block: lines[i].block, quote: lines[i].text.trim(),
      text: lines.slice(i, end < 0 ? undefined : end).map((l) => `${l.text}\n`).join('') };
  }
  return null;
}
export function noteNumberFindings(doc) {
  const notes = noteCatalog(doc), out = []; let previous = 0;
  const seen = new Set();
  const majorNumbers = new Set(notes.filter(n => !n.no.includes('.')).map(n => Number(n.no)));
  const lastNumber = Math.max(0, ...majorNumbers);
  for (const n of notes) {
    if (seen.has(n.no)) out.push(f('warn', `주석 ${n.no} 제목이 중복됩니다. 본문 소항목인지 주석 번호 오류인지 확인하세요.`, { i: n.block }, n.title));
    seen.add(n.no);
    if (n.no.includes('.')) continue;
    const no = Number(n.no);
    if (no !== previous + 1) out.push(f('warn', `주석 번호 순서 확인: ${previous || '시작'} 다음에 ${no}이 나옵니다. 누락·역순 또는 소항목 오인 여부를 확인하세요.`, { i: n.block }, n.title));
    previous = no;
  }
  for (const b of doc.blocks.filter((b) => b.part === 'notes' && !b.nested && b.kind !== 'table')) {
    for (const line of String(b.text).split('\n')) {
      const m = /^\s*(\d{1,3})(?:[)．。]|\s+[가-힣A-Za-z])/.exec(line);
      if (m && !majorNumbers.has(Number(m[1])) && Number(m[1]) <= lastNumber + 1)
        out.push(f('warn', '주석 제목 번호 형식 확인: N. 제목 형식과 다른 줄이 있습니다. 소항목이면 허용할 수 있습니다.', b, line));
    }
  }
  return out.length ? out : [f(notes.length ? 'ok' : 'warn', notes.length ? `식별한 주석 제목 ${notes.length}개의 번호 순서와 형식에 의심 사항이 없습니다.` : '주석 제목을 식별하지 못했습니다. 번호와 형식을 직접 확인하세요.')];
}
export function reportNoteFindings(doc) {
  const notes = noteCatalog(doc), out = []; let section = '', heading = '';
  const opinionHeads = ['감사의견','검토결론','검토의견','검토결과',
    '감사의견근거','감사의견의근거','한정의견근거','한정의견의근거',
    '부적정의견근거','부적정의견의근거','의견거절근거','의견거절의근거'];
  for (const b of doc.blocks.filter((b) => ['audit', 'front'].includes(b.part) && !b.nested)) {
    for (const line of String(b.text).split('\n')) {
      const t = tight(line);
      const start = /^(핵심감사사항|강조사항|기타사항)/.exec(t);
      if (start) { section = start[1]; heading = line; }
      else if (opinionHeads.some(h => isHeadingLine(line,h)) || /^(?:.*경영진의책임|재무제표에대한경영진|연결재무제표에대한경영진|.*감사인의책임|계속기업관련)/.test(t)) section = '';
      if (!section) continue;
      if (/^\s*(?:\(\d+\)|\d+[.)])/.test(line) && !/절차|방법/.test(line)) heading = line;
      for (const { no, label } of noteCitations(line)) {
        const targets = notes.filter((n) => n.no === no);
        const sub = !targets.length && no.includes('.') ? subNote(notes, no) : null;
        if (targets.length !== 1 && !sub) { out.push(f('warn', `${section}의 주석 ${label}: ${targets.length ? '동일 번호가 여러 개라 대상을 확정할 수 없습니다.' : '해당 주석을 찾지 못했습니다.'}`, b, line)); continue; }
        const note = sub || targets[0];
        const words = [...new Set((`${heading} ${line}`.replace(/주석\s*[\d.,\s]+/g, '').match(/[가-힣]{2,}/g) || []).filter((w) => !/^(?:핵심감사사항|강조사항|기타사항|관련|참조|회사의|회사는|주석에서|설명하는|기재된|우리는|대한|있습니다|하였습니다|따라|감사|주석)$/.test(w)))];
        const matches = words.filter((w) => tight(note.text).includes(w));
        const ref = sub ? sub.parent.no : no;
        const name = label === ref ? ref : `${label} (상위 주석 ${ref})`;
        out.push(f('warn', `${section} → 주석 ${name} ${note.title}. ${matches.length ? `공통 표현: ${matches.join(', ')}. 낱말 일치만으로 관련성이 확정되지는 않습니다.` : '직접 일치하는 표현을 찾지 못했습니다.'} 실제 내용·금액·기간을 대조하세요.`, b, line,
          { noteRef: ref, ...(label !== ref ? { noteCitation: label } : {}), noteTitle: note.title, evidenceWords: matches, also: [{ label: `주석 ${sub ? no : ref} ${note.title}`, block: note.block, quote: sub ? sub.quote : note.title }] }));
      }
    }
  }
  return out;
}
