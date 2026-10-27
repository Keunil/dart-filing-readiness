import { tight, flat, isHeadingLine, findDates, dateText } from './dsd-read.js';
export const REVIEW_CODES = ['90020', '90220', '90320', '90420'];
export const isInterimReview = (doc) => REVIEW_CODES.includes(doc?.header?.docCode || doc?.meta?.docId);
const finding = (level, text, b, quote = '') => ({ level, text, block: b?.i ?? null, quote });
const heads = /^(?:검토대상|검토한재무제표|재무제표에대한경영진|연결재무제표에대한경영진|경영진의책임|감사인의책임|검토인의책임|기타사항|강조사항|계속기업)/;
export function interimSections(doc) {
  const sections = []; let current = { title: '검토대상', block: null, lines: [] }; sections.push(current);
  for (const b of doc.blocks.filter((b) => !b.nested && ['audit', 'front'].includes(b.part))) {
    for (const line of String(b.text).split('\n')) {
      const t = tight(line);
      if (heads.test(t.replace(/요약|분기|반기|중간/g, '')) || ['검토결론','검토의견','검토결과'].some(h => isHeadingLine(line,h))) { current = { title: t, block: b, lines: [] }; sections.push(current); }
      if (current) current.lines.push({ text: line, block: b });
    }
  }
  return sections;
}
export function interimResults(doc, options = {}) {
  const sections = interimSections(doc), active = sections.filter((s) => !/^(기타사항|강조사항)/.test(s.title));
  const report = doc.blocks.filter((b) => !b.nested && ['audit', 'front'].includes(b.part));
  const candidates = active.flatMap((s) => s.lines).concat(doc.blocks.filter((b) => !b.nested && b.part === 'notes').map((b) => ({ text: b.text, block: b })));
  const evidence = candidates.find((l) => /선별적(?:인)?(?:서술정보|주석)|요약(?:연결)?(?:분기|반기|중간)?재무제표/.test(tight(l.text)))?.block;
  const mode = options.interimPresentation || (evidence ? 'condensed' : 'unknown');
  const result = (no, item, findings, manualPart = '') => ({ no, item, group: '독립된 감사인의 검토보고서(본문)', kind: 'auto', desc: '요약중간재무제표 검토 문구 비교', manualPart,
    status: findings.some((f) => f.level === 'fail') ? 'fail' : findings.some((f) => f.level === 'warn') ? 'warn' : manualPart ? 'manual' : 'pass', findings });
  const out = [result(1, '분·반기 검토 점검 범위', [finding('info', '분·반기 검토 문구와 주석 참조를 점검합니다. 연차 감사보고서 55개 기준은 적용하지 않습니다.')], '보고기간·검토범위·변형결론 등 나머지 검토보고서 요건은 별도로 확인하세요.')];
  out.push(result(2, '요약중간재무제표 해당 여부', [finding(mode === 'unknown' ? 'warn' : 'info', mode === 'unknown' ? '전체 또는 요약재무제표인지 확인할 근거를 찾지 못했습니다. 적용 기준에서 선택하세요.' : mode === 'condensed' ? '요약재무제표로 점검합니다. 선별적 주석만 포함해도 요약재무제표에 해당합니다.' : '전체 재무제표로 선택했습니다. 전체 주석을 포함하는지 확인하세요.', evidence)], '실제 재무제표·주석의 전체/요약 여부 확인'));
  const collective = [], wording = [], individual = [];
  for (const b of report) {
    for (const s of active.filter((s) => s.lines.some((l) => l.block.i === b.i))) {
      for (const l of s.lines.filter((l) => l.block.i === b.i)) {
        const t = tight(l.text);
        if (mode === 'condensed') {
          const missing = [...t.matchAll(/(?:요약)?(?:연결)?(?:분기|반기|중간)(?:연결)?재무제표/g)].some(m =>
            !m[0].startsWith('요약') && !/^(?:검토준칙|(?:에대한)?검토보고서)/.test(t.slice(m.index + m[0].length)));
          if (missing) collective.push(finding('fail', '요약재무제표인데 전체 묶음의 명칭에 요약이 없습니다.', b, l.text));
          if (/감사인의책임|검토인의책임|검토결론|검토의견|검토결과/.test(s.title) && /공정하게/.test(t)) wording.push(finding('fail', '요약재무제표의 감사인 책임·검토결론에 공정하게 표현이 남아 있습니다.', b, '공정하게'));
          if (/기타의서술정보/.test(t)) wording.push(finding('warn', '요약재무제표 구성 설명의 기타의 서술정보를 기타의 선별적 서술정보로 확인하세요.', b, l.text));
        }
      }
    }
  }
  for (const b of doc.blocks.filter((b) => !b.nested && ['audit', 'front', 'fs'].includes(b.part))) {
    for (const line of String(b.text).split('\n')) {
      if (/요약\s*(?:연결\s*)?(?:(?:분기|반기|중간)\s*)?(?:연결\s*)?(?:재무상태표|포괄손익계산서|손익계산서|자본변동표|현금흐름표)/.test(line)) individual.push(finding('warn', '개별 재무제표 명칭에 요약을 붙였습니다. 실제 축약 작성한 예외인지 확인하세요. 통상 개별 명칭에는 요약을 붙이지 않습니다.', b, line));
    }
  }
  const incomplete = !active.some((s) => /경영진/.test(s.title)) || !active.some((s) => /^검토(?:결론|의견|결과)/.test(s.title));
  if (mode !== 'condensed') { collective.push(finding('info', '요약 명칭 필수 점검은 요약재무제표로 확인된 경우에 적용합니다.')); wording.push(finding('info', '전체/요약 여부가 확인되지 않으면 공정하게 표현을 자동 오류로 판정하지 않습니다.')); }
  else if (incomplete) { collective.push(finding('warn', '검토보고서 문단을 충분히 식별하지 못했습니다. 명칭을 직접 확인하세요.')); wording.push(finding('warn', '경영진 책임 또는 검토결론 문단을 찾지 못했습니다. 문구를 직접 확인하세요.')); }
  if (!collective.length) collective.push(finding('ok', '식별한 당기 문단의 전체 묶음 명칭에 요약 표기가 있습니다.'));
  if (!wording.length) wording.push(finding('ok', '식별한 당기 문단에 공정하게 또는 기타의 서술정보 표현이 없습니다.'));
  out.push(result(3, '전체 묶음의 요약 명칭', collective), result(4, '요약 검토보고서 책임·결론 문구', wording), result(5, '개별 재무제표 명칭의 요약 표기', individual.length ? individual : [finding('ok', '개별 재무제표 명칭에 요약 표현을 찾지 못했습니다.')]),
    result(6, '초도 검토의 전임감사인 문구', [finding('info', '기타사항에서 인용한 전기 검토결론의 요약·공정하게 표현은 전임감사인 원문과 대조하세요.')], '전임감사인의 실제 검토보고서와 비교'));
  if (mode !== 'condensed') for (const r of out.filter((r) => [3, 4].includes(r.no))) r.status = mode === 'complete' ? 'na' : 'manual';
  out.push(...sheetItems(doc, { sections, mode }));
  return out;
}
const QUARTER_CODES = ['90220', '90420'], CONSOLIDATED_CODES = ['90320', '90420'];
const LATEST = '6.0';
const STATEMENT = /^(?:\(첨부\))?(요약)?(분기|반기|중간)?(연결)?(분기|반기|중간)?(재무상태표|포괄손익계산서|손익계산서|자본변동표|현금흐름표)$/;
const NAMES = /(요약)?(분기|반기|중간)?(연결)?(분기|반기|중간)?(재무상태표|포괄손익계산서|손익계산서|자본변동표|현금흐름표)/g;
const COLLECTIVE = /(요약)?(연결)?(분기|반기|중간)(연결)?재무제표/g;
const firstLine = (s) => String(s ?? '').split('\n').find((l) => l.trim()) || '';
const clip = (s, n = 40) => { const t = flat(s); return t.length > n ? `${t.slice(0, n)}…` : t; };
const loose = (s) => tight(s).replace(/["'“”‘’「」『』.,·ㆍ]/g, '');
const spaced = (text, word) => new RegExp([...word].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s 　]*')).exec(String(text ?? ''))?.[0] || '';
const josa = (word, withFinal, without) => { const c = tight(word).replace(/[^가-힣]+$/, '').slice(-1).charCodeAt(0) - 0xAC00; return `${word}${c >= 0 && c % 28 ? withFinal : without}`; };
const statusOf = (findings) => (findings.some((f) => f.level === 'fail') ? 'fail' : findings.some((f) => f.level === 'warn') ? 'warn' : 'pass');
const sheetItem = (no, group, item, desc, findings) => ({ no, group, item, kind: 'auto', desc: `공시팀 분기(연결)검토보고서 체크리스트(2026) · ${desc}`, manualPart: '', status: statusOf(findings), findings });

/** 첨부 재무제표 제목(표 첫 칸 또는 문단 첫 줄, 글자 사이 칸은 뺀다). */
function statementTitles(doc) {
  const out = [];
  for (const b of doc.blocks) {
    if (b.nested || b.part !== 'fs') continue;
    const text = firstLine(b.kind === 'table' ? (b.grid?.[0]?.[0]?.text ?? '') : b.text);
    const m = STATEMENT.exec(tight(text));
    if (m) out.push({ block: b, text, summary: !!m[1], period: m[2] || m[4] || '', consolidated: !!m[3], conFirst: !!m[3] && !m[2] && !!m[4], kind: m[5] });
  }
  return out;
}

/**
 * 묶음 이름(…재무제표)의 요약 · 기간 말 · 연결 · 연결 자리. m = COLLECTIVE 꼴 결과([, 요약, 앞 연결, 기간, 뒤 연결]).
 * want = 바르게 쓴 이름(보이기용). 문제 없으면 [].
 */
function collectiveProblems(m, ctx, where, b, quote, want) {
  const out = [], { P, con, mode } = ctx;
  if (m[3] !== P) out.push(finding('fail', `${where}에 '${m[3]}'로 적었습니다. '${want}'로 적어야 합니다.`, b, quote));
  if (con && m[2] && !m[4]) out.push(finding('fail', `${where}에 '요약연결${P}'로 적었습니다. '${want}'로 적어야 합니다.`, b, quote));
  else if (con && !m[2] && !m[4]) out.push(finding('fail', `${where}에 '연결'이 없습니다. '${want}'로 적어야 합니다.`, b, quote));
  if (!m[1] && mode === 'condensed') out.push(finding('fail', `${where}에 '요약'이 없습니다. '${want}'로 적어야 합니다.`, b, quote));
  else if (!m[1] && mode === 'unknown') out.push(finding('warn', `${where}에 '요약'이 없습니다. 요약재무제표이면 '${want}'로 적어야 합니다.`, b, quote));
  return out;
}

function sheetItems(doc, { sections, mode }) {
  const code = doc?.header?.docCode || doc?.meta?.docId || '';
  const P = QUARTER_CODES.includes(code) ? '분기' : '반기', con = CONSOLIDATED_CODES.includes(code), C = con ? '연결' : '';
  const ctx = { P, con, mode }, S = mode === 'complete' ? '' : '요약';
  const top = (part) => doc.blocks.filter((b) => !b.nested && b.part === part);
  const cover = top('cover'), toc = top('toc'), audit = top('audit'), fs = top('fs'), notes = top('notes');
  const titles = statementTitles(doc);
  const out = [];
  {
    const f = [], ver = doc.meta?.docver || doc.header?.formVersion, title = cover.find((b) => b.kind === 'title') || audit.find((b) => b.kind === 'title');
    const line = `문서명: ${doc.header?.docName || '없음'} · 서식버전: ${ver || '없음'}`;
    f.push(ver === LATEST ? finding('ok', line, title, title?.text || '') : finding('fail', `${line}. 최신 서식(${LATEST})으로 작성해야 합니다.`, title, title?.text || ''));
    const company = cover.find((b) => flat(b.text));
    const conFs = titles.filter((t) => t.consolidated).length;
    const content = titles.length ? conFs * 2 > titles.length : company ? /종속(?:기업|회사)들?$/.test(tight(firstLine(company.text))) : null;
    if (content !== null) {
      if (con && !content) f.push(finding('fail', `${P}연결검토보고서 서식에 ${P}검토보고서(별도)를 작성했습니다.`, title, title?.text || ''));
      else if (!con && content) f.push(finding('fail', `${P}검토보고서 서식에 ${P}연결검토보고서를 작성했습니다.`, title, title?.text || ''));
      else f.push(finding('ok', `문서명과 첨부 재무제표(${con ? '연결' : '별도'})가 맞습니다.`, titles[0]?.block ?? null));
    }
    out.push(sheetItem(7, '서식버전', `최신서식 확인(${LATEST})`, `${P}${C}검토보고서 ${LATEST} 서식인지, ${con ? `${P}검토보고서` : `${P}연결검토보고서`}를 쓰지 않았는지`, f));
  }
  {
    const f = [], want = `${S}${P}${C}재무제표에 대한 검토보고서`;
    const nameBlock = cover.find((b) => /재무제표에대한/.test(tight(b.text)));
    const m = new RegExp(`${COLLECTIVE.source}에대한`).exec(tight(cover.map((b) => b.text).join('')));
    if (!m) f.push(finding('warn', `표지 보고서명('${want}')을 찾지 못했습니다.`, cover.find((b) => b.kind === 'title') ?? null));
    else {
      const problems = collectiveProblems(m, ctx, '표지 보고서명', nameBlock, nameBlock ? firstLine(nameBlock.text) : '', want);
      f.push(...(problems.length ? problems : [finding('ok', `표지 보고서명: ${want}`, nameBlock, nameBlock ? firstLine(nameBlock.text) : '')]));
    }
    if (con) {
      const c = cover.find((b) => flat(b.text) && b !== nameBlock && b.kind !== 'title');
      const line = c ? firstLine(c.text) : '';
      if (!c) f.push(finding('warn', "표지 회사명('OOO와 그 종속회사')을 찾지 못했습니다."));
      else if (/종속(?:기업|회사)들?$/.test(tight(line))) f.push(finding('ok', `표지 회사명: ${flat(line)}`, c, line));
      else f.push(finding('fail', `표지 회사명을 '${flat(line)}와 그 종속회사(종속기업)'처럼 적어야 합니다.`, c, line));
    }
    out.push(sheetItem(8, '검토보고서 표지', '표지 보고서명', con ? `'요약${P}연결재무제표에 대한 검토보고서'(X 요약연결${P}재무제표), 회사명 'OOO와 그 종속회사'` : `'요약${P}재무제표에 대한 검토보고서'(X ${P}재무제표에 대한 검토보고서)`, f));
  }
  const tocText = tight(toc.map((b) => b.text).join(''));
  const tocAt = (word) => { const b = toc.find((x) => tight(x.text).includes(word)) ?? toc[0] ?? null; return [b, b ? spaced(b.text, word) : '']; };
  {
    const f = [], want = `${S}${P}${C}재무제표 검토보고서`, m = new RegExp(`${COLLECTIVE.source}검토보고서`).exec(tocText);
    if (!toc.length) f.push(finding('warn', `목차를 찾지 못했습니다. 목차의 검토보고서 이름('${want}')을 직접 확인하세요.`));
    else if (!m) f.push(finding('warn', `목차에서 검토보고서 이름('${want}')을 찾지 못했습니다. 목차를 직접 확인하세요.`, toc[0]));
    else {
      const [b, quote] = tocAt(m[0]), problems = collectiveProblems(m, ctx, '목차의 검토보고서 이름', b, quote, want);
      f.push(...(problems.length ? problems : [finding('ok', `목차: ${want}`, b, quote)]));
    }
    out.push(sheetItem(9, '검토보고서 목차', '목차 검토보고서 명칭', `목차에 '${S}${P}${C}재무제표 검토보고서'(X '요약'을 뺀 '${P}${C}재무제표 검토보고서')`, f));
  }
  {
    const f = [], want = `${S}${P}${C}재무제표`;
    const m = /(?:\(첨부\))?(요약)?(연결)?(분기|반기|중간)?(연결)?재무제표(?!검토보고서|에대한)/.exec(tocText);
    if (m) {
      const [b, quote] = tocAt(m[0]);
      if (!m[3]) f.push(finding('fail', `목차의 재무제표 이름에 '${P}'가 없습니다('${flat(quote)}'). '${want}'로 적어야 합니다.`, b, quote));
      else { const p = collectiveProblems(m, ctx, '목차의 재무제표 이름', b, quote, want); f.push(...(p.length ? p : [finding('ok', `목차: ${want}`, b, quote)])); }
    } else if (toc.length) f.push(finding('warn', `목차에서 재무제표 이름('${want}')을 찾지 못했습니다. 목차를 직접 확인하세요.`, toc[0]));
    const fix = (kind) => `${P}${C}${kind}`;
    const names = [...titles.map((t) => ({ ...t, where: '' })), ...[...tocText.matchAll(NAMES)].map((x) => ({ text: x[0], kind: x[5], period: x[2] || x[4] || '', consolidated: !!x[3], conFirst: !!x[3] && !x[2] && !!x[4], where: '목차 ', at: tocAt(x[0]) }))];
    let good = 0;
    for (const t of names) {
      const before = f.length, [b, quote] = t.at || [t.block, t.text], name = `${t.where}${flat(t.text)}`;
      if (!t.period) f.push(finding('fail', `${name}: '${P}'가 없습니다. '${fix(t.kind)}'로 적어야 합니다.`, b, quote));
      else if (t.period !== P) f.push(finding('fail', `${name}: '${t.period}'로 적었습니다. '${fix(t.kind)}'로 적어야 합니다.`, b, quote));
      if (con && !t.consolidated) f.push(finding('fail', `${name}: '연결'이 없습니다. '${fix(t.kind)}'로 적어야 합니다.`, b, quote));
      else if (con && t.conFirst) f.push(finding('warn', `${name}: '${P}연결'로 적었는지 확인하세요('${fix(t.kind)}').`, b, quote));
      if (f.length === before) good++;
    }
    if (!titles.length) f.push(finding('warn', `첨부 재무제표 제목('${P}${C}재무상태표' 등)을 찾지 못했습니다.`, fs.find((b) => b.kind === 'title') ?? null));
    if (good) f.push(finding('ok', `재무제표 이름 ${good}개(목차 · 재무제표 제목)에 ${con ? `'${P}'·'연결'이` : `'${P}'가`} 있습니다. 개별 이름의 '요약'은 5번이 봅니다.`, (titles[0] || names[0])?.block ?? null));
    out.push(sheetItem(10, '검토보고서 목차', '재무제표 명칭', `목차에 '(첨부)요약${P}${C}재무제표', 개별 이름은 목차 · 재무제표 제목 모두 '${P}${C}재무상태표'처럼(X '재무상태표'·'${P === '분기' ? '반기' : '분기'}재무상태표'${con ? `·'${P}재무상태표'` : ''})`, f));
  }
  const section = (re) => sections.find((s) => s.block && s.title.length <= 16 && re.test(s.title.replace(/요약|분기|반기|중간/g, '')));
  const body = (s) => (s ? s.lines.filter((l) => tight(l.text) !== s.title) : []);
  {
    const f = [], s = section(/^(?:검토대상|검토한재무제표)/), lines = body(s), text = lines.map((l) => l.text).join(' ');
    const sample = audit.find((b) => /XXXX/.test(b.text));
    if (sample) f.push(finding('warn', '검토보고서 본문에 견본 글(XXXX)이 남아 있습니다. 검토보고서를 넣었는지 확인하세요.', sample, 'XXXX'));
    if (tight(text).length < 20) f.push(finding('warn', '검토대상 재무제표 문단을 찾지 못했습니다. 문구를 직접 확인하세요.', s?.block ?? audit.find((b) => b.kind === 'title') ?? null));
    else {
      const b = lines[0].block, t = tight(text);
      const ended = /(\d{4}년(?:과|와|및)?(?:\d{4}년)?\d{1,2}월\d{1,2}일로?종료(?:하|되)는)/.exec(t);
      const otherSecs = sections.filter((x) => /^기타사항/.test(x.title)), other = otherSecs.map((x) => tight(x.lines.map((l) => l.text).join(''))).join('');
      const priorUnreviewed = /검토(?:받지|하지)(?:아니|않)|(?:타감사인|전임감사인|다른감사인|회계법인)이검토/.test(other);
      if (ended && !/\d{4}년(?:과|와|및)\d{4}년/.test(ended[1]) && priorUnreviewed) f.push(finding('info', '전기는 타감사인이 검토했거나 검토받지 않아 당기 연도만 적습니다(기타사항).', b));
      else if (ended && !/\d{4}년(?:과|와|및)\d{4}년/.test(ended[1])) {
        const raw = /\d{4}\s*년[^.]{0,30}?종료(?:하|되)는/.exec(flat(text))?.[0] || ended[1];
        f.push(finding('fail', `기간에 당기 연도만 적었습니다('${flat(raw)}'). 당기·전기 모두 검토결론 대상이면 '2026년과 2025년 …로 종료하는'처럼 적어야 합니다.`, b, raw));
      }
      const year = Number(/(\d{4})년\d{1,2}월\d{1,2}일현재/.exec(t)?.[1]);
      for (const l of otherSecs.flatMap((x) => x.lines)) {
        const c = /비교표시된(\d{4})년\d{1,2}월\d{1,2}일로?종료(?:하|되)는/.exec(tight(l.text));
        if (year && c && Number(c[1]) >= year) f.push(finding('fail', `기타사항의 비교표시 기간을 '${c[1]}년'으로 적었습니다. 전기(${year - 1}년)로 적어야 합니다.`, l.block, spaced(l.text, c[0])));
      }
      const named = new Set(), quoteOf = (name) => lines.find((l) => tight(l.text).includes(name))?.text || '';
      for (const m of t.matchAll(NAMES)) {
        named.add(m[5]);
        if (con && !m[3]) f.push(finding('fail', `'${m[0]}'에 '연결'이 없습니다. '${m[2] || m[4] || ''}연결${m[5]}'로 적어야 합니다.`, b, m[0].length > 6 ? m[0] : ''));
      }
      if (con) for (const m of t.matchAll(COLLECTIVE)) {
        if (!m[2] && !m[4] && !/^(?:검토준칙|(?:에대한)?검토보고서)/.test(t.slice(m.index + m[0].length))) f.push(finding('fail', `'${m[0]}'에 '연결'이 없습니다. '${S}${P}연결재무제표'로 적어야 합니다.`, b, ''));
      }
      if (named.size) for (const k of new Set(titles.map((x) => x.kind))) {
        if (!named.has(k)) f.push(finding('fail', `첨부한 ${josa(`'${k}'`, '을', '를')} 검토대상 문단에 적지 않았습니다.`, b, quoteOf('구성되어') || ''));
      }
      if (!named.size) f.push(finding('warn', '검토대상 문단에서 재무제표 이름(재무상태표 등)을 찾지 못했습니다. 문구를 직접 확인하세요.', b));
      if (!f.some((x) => x.level !== 'info')) f.push(finding('ok', `검토대상 문단의 기간·재무제표 이름이 맞습니다(${[...named].join(', ')}).`, b));
    }
    out.push(sheetItem(11, '독립된 감사인의 검토보고서(본문)', '검토대상 재무제표', `당기·전기 연도 모두${con ? ", '연결' 누락" : ''}, 첨부 재무제표 이름 누락(손익계산서 등)`, f));
  }
  {
    const f = [], s = section(/경영진/), lines = body(s), t = tight(lines.map((l) => l.text).join(''));
    const at = (word) => lines.find((l) => tight(l.text).includes(word)) ?? lines[0];
    if (t.length < 15) f.push(finding('warn', '경영진의 책임 문단을 찾지 못했습니다. 문구를 직접 확인하세요.', s?.block ?? null));
    else if (t.includes('공정하게표시할책임')) f.push(finding('ok', "경영진의 책임: '공정하게 표시할 책임'이 있습니다.", at('공정하게').block, '공정하게'));
    else if (t.includes('작성하고표시할책임')) { const l = at('작성하고표시할책임'); f.push(finding('ok', "경영진의 책임: '작성하고 표시할 책임'이 있습니다.", l.block, spaced(l.text, '작성하고표시할책임'))); }
    else f.push(finding('fail', "경영진의 책임 문단에 '표시할 책임'이 없습니다. '… 작성하고 공정하게 표시할 책임이 있으며'로 적어야 합니다.", lines[0].block, lines[0].text));
    out.push(sheetItem(12, '독립된 감사인의 검토보고서(본문)', '재무제표에 대한 경영진의 책임', "'작성하고 (공정하게) 표시할 책임이 있으며'. 요약 명칭은 3번", f));
  }
  {
    const f = [], s = sections.find((x) => /^검토(?:결론|의견|결과)/.test(x.title) && x.title.length <= 6), lines = body(s), t = tight(lines.map((l) => l.text).join(''));
    const std = `본인의 검토결과 상기 ${S}${P}${C}재무제표가 중요성의 관점에서 회계처리기준(한국채택국제회계기준 제1034호(중간재무보고))에 따라 작성되지 않은 사항이 발견되지 아니하였습니다.`;
    if (!s) f.push(finding('warn', '검토결론 문단을 찾지 못했습니다. 문구를 직접 확인하세요.'));
    else {
      if (/^검토의견/.test(s.title)) f.push(finding('fail', "검토결론 문단 제목을 '검토의견'으로 적었습니다. '검토결론'으로 적어야 합니다.", s.block, firstLine(String(s.block.text).split('\n').find((l) => tight(l).startsWith('검토의견')) || '검토의견')));
      if (t.length < 15) f.push(finding('warn', '검토결론 문구를 찾지 못했습니다. 문구를 직접 확인하세요.', s.block));
      else if (!t.includes('공정하게') && !t.includes('작성되지않은사항이발견되지아니하였습니다') && mode !== 'complete') f.push(finding('warn', `검토결론 문구가 표준과 다릅니다. 표준: "${std}"`, lines[0].block, lines[0].text));
      else if (!f.length) f.push(finding('ok', t.includes('공정하게') ? "검토결론 제목이 맞습니다. '공정하게' 표현은 4번이 봅니다." : '검토결론: 작성되지 않은 사항이 발견되지 아니하였습니다.', lines[0].block));
    }
    out.push(sheetItem(13, '독립된 감사인의 검토보고서(본문)', '검토결론', "제목 '검토결론'(X '검토의견'), '… 작성되지 않은 사항이 발견되지 아니하였습니다'(X '공정하게 표시하지 않은 사항')", f));
  }
  {
    const f = [], eff = audit.find((b) => tight(b.text).includes('현재로유효한것입니다'));
    if (!eff) f.push(finding('fail', '유효시점 문구(이 검토보고서는 … 수정될 수도 있습니다.)가 없습니다.'));
    else {
      const text = flat(eff.text), t = tight(text);
      const dm = /검토보고서일\s*\(([^)]*)\)/.exec(text), date = dm ? findDates(dm[1])[0]?.date : null;
      const sign = audit.filter((b) => b.kind === 'table' && b.i < eff.i && /회계법인/.test(tight(b.text))).at(-1);
      const signDate = sign ? findDates(sign.text).at(-1)?.date : null;
      if (!date) f.push(finding('fail', "유효시점 문구에 검토보고서일(날짜)이 없습니다. '검토보고서일(2026년 5월 7일)'처럼 적어야 합니다.", eff, /검토보고서일/.exec(eff.text)?.[0] || ''));
      else if (signDate && date !== signDate) f.push(finding('fail', `유효시점 문구의 날짜(${dateText(date)})가 보고서일(${dateText(signDate)})과 다릅니다.`, eff, dm[1]));
      if (/검토보고서일이후/.test(t)) f.push(finding('fail', "'검토보고서일 이후'로 적었습니다. '검토보고서일 후 이 보고서를 열람하는 시점 사이에'로 적어야 합니다.", eff, '이후'));
      if (/시점까지의기간사이에/.test(t)) f.push(finding('fail', "'시점까지의 기간 사이에'로 적었습니다. '… 열람하는 시점 사이에'로 적어야 합니다.", eff, spaced(eff.text, '시점까지의기간사이에')));
      for (const m of t.matchAll(COLLECTIVE)) {
        if (/^검토보고서/.test(t.slice(m.index + m[0].length))) continue;   // '이 분기재무제표 검토보고서는'(보고서 이름)
        f.push(...collectiveProblems(m, ctx, '유효시점 문구', eff, '', `${S}${P}${C}재무제표`));
      }
      const standard = `이 검토보고서는 검토보고서일(${date ? dateText(date) : '20xx년 x월 x일'}) 현재로 유효한 것입니다. 따라서 검토보고서일 후 이 보고서를 열람하는 시점 사이에 별첨된 회사의 ${S}${P}${C}재무제표에 중요한 영향을 미칠 수 있는 사건이나 상황이 발생할 수도 있으며, 이로 인하여 이 검토보고서가 수정될 수도 있습니다.`;
      const norm = (s) => loose(s).replace(/(\d{4})년0?(\d{1,2})월0?(\d{1,2})일/g, '$1년$2월$3일').replace(/(?:별첨|첨부)된(?:회사|연결회사|은행|당사|당행)의/, '별첨된회사의');
      if (!f.length && !norm(text).includes(norm(standard))) f.push(finding('warn', `유효시점 문구가 표준 문구와 다릅니다. 표준: "${standard}"`, eff, clip(eff.text, 60)));
      if (!f.length) f.push(finding('ok', `유효시점 문구 날짜: ${dateText(date)}`, eff, dm[1]));
    }
    out.push(sheetItem(14, '독립된 감사인의 검토보고서(본문)', '유효시점 문구(disclaimer)', `검토보고서일(날짜) = 보고서일, '검토보고서일 후'(X '이후'), '${S}${P}${C}재무제표'`, f));
  }
  {
    const f = [], want = `첨부된 ${S}${P}${C}재무제표는 당사가 작성한 것입니다.`;
    const b = fs.find((x) => /작성한것입니다/.test(tight(x.text)));
    if (!b) f.push(finding('warn', `'${want}' 문구를 찾지 못했습니다.`, fs.find((x) => x.kind === 'title') ?? null));
    else {
      const raw = String(b.text).split('\n').find((l) => /작성한것입니다/.test(tight(l))) || firstLine(b.text);
      const line = /첨\s*부\s*된[^"”]*?작\s*성\s*한\s*것\s*입\s*니\s*다\.?/.exec(raw)?.[0] || raw;
      const m = /첨부된(요약)?(연결)?(분기|반기|중간)?(연결)?재무제표는/.exec(tight(line));
      if (!m) f.push(finding('fail', `문구가 '${clip(line)}'입니다. '${want}'로 적어야 합니다.`, b, line));
      else if (!m[3]) f.push(finding('fail', `'${P}'가 없습니다('${clip(line)}'). '${want}'로 적어야 합니다.`, b, line));
      else { const p = collectiveProblems(m, ctx, '첨부 재무제표 표지 문구', b, line, want); f.push(...(p.length ? p : [finding('ok', flat(line).replace(/^["“]|["”]$/g, ''), b, line)])); }
    }
    out.push(sheetItem(15, '회사의 (첨부)재무제표의 표지', '재무제표 표기', `'첨부된 ${S}${P}${C}재무제표는 당사가 작성한 것입니다.'(X '첨부된 ${P}${C}재무제표는')`, f));
  }
  {
    const f = [], want = `별첨 주석은 본 ${S}${P}${C}재무제표의 일부입니다.`, ends = loose(`본${S}${P}${C}재무제표의일부입니다`);
    titles.forEach((t, k) => {
      const end = titles[k + 1]?.block.i ?? Infinity;
      const note = fs.filter((b) => b.i > t.block.i && b.i < end && /주석/.test(tight(b.text)) && tight(b.text).length <= 60).at(-1);
      const name = flat(t.text);
      if (!note) { f.push(finding('fail', `${name}: 하단에 '${want}' 문구가 없습니다.`, t.block, t.text)); return; }
      const n = loose(note.text), short = clip(note.text, 40);
      const about = /^(?:별첨|첨부된)?(?:요약)?(?:분기|반기|중간)?(?:연결)?(?:분기|반기|중간)?재무제표에대한주석은/.exec(n);
      if (about) f.push(finding('fail', `${name}: '${/^.*?주\s*석\s*은/.exec(flat(note.text).replace(/^["“]/, ''))?.[0] || about[0]}'으로 잘못 적었습니다. '${want}'로 적어야 합니다.`, note, note.text));
      else if (!/^(?:별첨|첨부된)주석은/.test(n)) f.push(finding('fail', `${name}: 하단 문구가 '${short}'입니다. '별첨 주석은 …'으로 적어야 합니다.`, note, note.text));
      else if (con && !n.includes('연결')) f.push(finding('fail', `${name}: 하단 문구에 '연결'이 없습니다('${short}'). '${want}'로 적어야 합니다.`, note, note.text));
      else if (!n.endsWith(ends)) f.push(finding('warn', `${name}: 하단 문구는 '${want}'를 권장합니다('${short}').`, note, note.text));
      else f.push(finding('ok', `${name}: 있음`, note, note.text));
    });
    if (!titles.length) f.push(finding('warn', `첨부 재무제표 제목('${P}${C}재무상태표' 등)을 찾지 못해 하단 문구를 보지 못했습니다.`));
    out.push(sheetItem(16, '회사의 (첨부)재무제표', "'별첨 주석은 본 재무제표의 일부입니다.' 문구", `'별첨 주석은 …' 필수(X '별첨 재무제표에 대한 주석은'), '… 본 ${S}${P}${C}재무제표의 일부입니다.' 권장`, f));
  }
  {
    const f = [], other = P === '분기' ? '반기' : '분기';
    const words = [['당기말', `당${P}말`], [`${other}말`, `${P}말`]];
    let n = 0;
    for (const b of notes) {
      const text = flat(b.text);
      for (const [word, fix] of words) {
        for (const m of text.matchAll(new RegExp(word, 'g'))) {
          if (++n > 10) continue;
          f.push(finding('warn', `'${word}'로 적었습니다. '${fix}'인지 확인하세요('${clip(text.slice(Math.max(0, m.index - 12), m.index + word.length + 12), 40)}').`, b, word));
        }
      }
    }
    if (n > 10) f.push(finding('warn', `같은 표기가 ${n - 10}곳 더 있습니다.`));
    if (!n) f.push(finding('ok', `주석에 '당기말'·'${other}말' 표기가 없습니다.`));
    else f.unshift(finding('info', `주석의 '당기말'·'${other}말'은 본부에 수정 여부를 문의하고 판단합니다.`));
    out.push(sheetItem(17, '주석', '오타 확인', `'당${P}말'을 '당기말'로, '${P}말'을 '${other}말'로 적은 곳`, f));
  }
  return out;
}
