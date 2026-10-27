import { tight, isHeadingLine } from './dsd-read.js';

const indexes = new WeakMap();
const opinionKind = text => {
  const t = tight(text).toLowerCase();
  for (const [kind,names] of Object.entries({
    unmodified:['적정','적정의견','unqualifiedopinion','unmodifiedopinion'],
    qualified:['한정','한정의견','qualifiedopinion'],adverse:['부적정','부적정의견','adverseopinion'],
    disclaimer:['의견거절','disclaimerofopinion'],
  })) if (names.includes(t)) return kind;
  return '';
};
const opinionNames = {unmodified:'적정',qualified:'한정',adverse:'부적정',disclaimer:'의견거절'};
const isoDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+d) && d.toISOString().slice(0,10) === value ? value : '';
};
const key = (company, period, scope) => `${company}/${period}/${scope}`;
function indexOf(catalog) {
  if (indexes.has(catalog)) return indexes.get(catalog);
  const result = new Map();
  for (const row of catalog.records) {
    if (!row || !/^\d{8}$/.test(row.corp_code || '') || !['2024-12-31','2025-12-31'].includes(row.period_end)
        || !['separate','consolidated','unspecified'].includes(row.scope) || !['audit','unaudited','unknown','conflict'].includes(row.state)) {
      indexes.set(catalog,null); return null;
    }
    const k = key(row.corp_code,row.period_end,row.scope);
    result.set(k,result.has(k) ? null : row); // Duplicate identities are never resolved by row order.
  }
  indexes.set(catalog,result); return result;
}
function recordOf(row) {
  if (!row || row.has_unresolved || !['audit','unaudited'].includes(row.state) || !Array.isArray(row.evidence) || !row.evidence.length) return null;
  const evidence = row.evidence;
  if (evidence.some(e => !e || e.assurance !== row.state || !['dart_annual_xbrl_gcd','opendart_annual_disclosure'].includes(e.source?.type)
      || !/^[a-f0-9]{64}$/.test(e.source?.sha256 || '') || e.report_date && !isoDate(e.report_date))) return null;
  if (row.state === 'unaudited') return {state:'unaudited'};
  if (evidence.some(e => !tight(e.auditor) || !opinionKind(e.opinion) || e.auditor_cik != null && (!/^\d{8}$/.test(e.auditor_cik) || e.auditor_cik === '00000000'))) return null;
  const identities = new Set(evidence.map(e => JSON.stringify([tight(e.auditor),opinionKind(e.opinion),e.report_date || null])));
  const codes = new Set(evidence.map(e=>e.auditor_cik).filter(Boolean));
  if (identities.size !== 1 || codes.size > 1) return null;
  return {...evidence[0],state:'audit',opinion_kind:opinionKind(evidence[0].opinion),auditor_cik:[...codes][0] || null};
}

function otherMatter(doc) {
  const lines = []; let block = null, active = false;
  const heads = ['강조사항','핵심감사사항','감사의견','한정의견','부적정의견','의견거절','계속기업관련중요한불확실성'];
  for (const b of doc.blocks.filter(b=>!b.nested && b.part === 'audit')) {
    for (const line of String(b.text).split('\n')) {
      const h = line.replace(/^\s*(?:\(\d+\)|\d+[.)])\s*/,'');
      if (isHeadingLine(h,'기타사항')) {
        if (active) return {block,text:lines.join('\n'),multiple:true};
        active = true; block = b;
        const tail = h.replace(/^[^:：\-\u2013\u2014]*[:：\-\u2013\u2014]\s*/, ''); // 줄표 허용
        if (tail !== h) lines.push(tail);
      } else if (active) {
        const t = tight(h);
        if (heads.some(title=>isHeadingLine(h,title)) || /^(?:(?:연결)?재무제표에대한경영진(?:과지배기구)?의책임|(?:연결)?재무제표감사에대한감사인의책임)$/.test(t)) return {block,text:lines.join('\n')};
        lines.push(line);
      }
    }
  }
  return {block,text:lines.join('\n')};
}

export function auditHistoryResult(doc, ctx, catalog) {
  const findings = [];
  const add = (level,text,block=null) => findings.push({level,text,block:block?.i ?? null,quote:''});
  const result = () => ({no:58,group:'독립된 감사인의 감사보고서(본문)',item:'전기 감사인·감사의견과 기타사항',kind:'assist',
    desc:'2024·2025년말 공시 기본정보의 회사·기말·별도/연결을 맞춰 참고합니다. 전기 실제 보고서 대조와 비교정보 유형·재발행 예외는 사람이 확인합니다.',
    manualPart:'전기 실제 감사보고서와 비교정보 유형·재발행 여부 확인',
    status:findings.some(f=>f.level==='warn') ? 'warn' : 'manual',findings,
    ...(catalog?.available && /^[a-f0-9]{64}$/.test(catalog.source_sha256 || '') && /^[a-f0-9]{64}$/.test(catalog.reference_sha256 || '')
      ? {reference_sha256:catalog.reference_sha256,reference_source_sha256:catalog.source_sha256} : {})});
  if (!catalog?.available) { add('info','연차 감사 이력 참고자료가 연결되지 않았습니다. 전기 감사인·감사의견은 실제 전기 보고서로 확인하세요. 자료가 없다는 이유로 미감사·초도감사로 판단하지 않습니다.'); return result(); }
  if (catalog.format !== 'audit-history-reference-1' || !Array.isArray(catalog.records) || !/^[a-f0-9]{64}$/.test(catalog.source_sha256 || '') || !/^[a-f0-9]{64}$/.test(catalog.reference_sha256 || '')) {
    add('warn','연차 감사 이력 참고자료의 형식을 확인할 수 없습니다. 실제 전기 보고서로 확인하세요.'); return result();
  }
  const codes = [doc.header?.regcik,doc.meta?.regcik].filter(Boolean).map(tight);
  if (!codes.length || codes.some(c=>!/^\d{8}$/.test(c) || c === '00000000') || new Set(codes).size !== 1) {
    add('warn','파일의 회사 고유번호를 하나로 확인하지 못해 연차 감사 이력과 자동 대조하지 않았습니다. 회사 이름만으로 다른 회사의 이력을 연결하지 않습니다.'); return result();
  }
  const year = ctx.period?.to?.slice(0,4);
  const headerCode = doc.header?.docCode, metaCode = doc.meta?.docId;
  const code = headerCode || metaCode, scopeMismatch = ['00760','00761'].includes(code) && ((code === '00761') !== !!ctx.consolidated);
  if (headerCode && metaCode && headerCode !== metaCode || scopeMismatch) {
    add('warn','파일의 문서 코드와 별도/연결 구분이 일치하는지 확인하지 못했습니다. 한쪽 이력을 임의로 선택하지 않습니다.'); return result();
  }
  if (!['2024','2025'].includes(year) || ctx.period.to !== `${year}1231` || ctx.period.from !== `${year}0101`) {
    add('warn','파일의 보고기간이 2024·2025년의 1월 1일~12월 31일 연차 이력과 일치하는지 확인하지 못했습니다. 다른 기간의 이력을 대신 연결하지 않습니다.'); return result();
  }
  const scope = ctx.consolidated ? 'consolidated' : 'separate', company = codes[0], index = indexOf(catalog);
  if (!index) { add('warn','연차 감사 이력의 회사·기간·별도/연결 구분을 읽지 못했습니다. 실제 전기 보고서로 확인하세요.'); return result(); }
  const currentRow = index.get(key(company,`${year}-12-31`,scope)), current = recordOf(currentRow);
  const describe = (period,value) => {
    if (value?.state === 'audit') add('info',`${period} ${scope === 'consolidated' ? '연결' : '별도'} 공시 이력: ${value.auditor} · ${opinionNames[value.opinion_kind]} · 감사보고서일 ${value.report_date || '미확인'}.`);
    else if (value?.state === 'unaudited') add('info',`${period} ${scope === 'consolidated' ? '연결' : '별도'} 공시 이력에는 미감사로 기재되어 있습니다. 실제 원문 확인이 필요합니다.`);
  };
  describe(`${year}-12-31`,current);
  if (!current || current.state !== 'audit') {
    const unspecified = index.has(key(company,`${year}-12-31`,'unspecified'));
    add('warn',unspecified ? '별도·연결 구분이 없는 회사 수준의 이력은 이 파일에 자동 적용하지 않습니다. 같은 구분의 당기 이력을 확인하세요.' : '같은 회사·기간·별도/연결의 당기 감사 이력이 누락되었거나 상충·미확인입니다. 감사인 변경이나 미감사를 추정하지 않습니다.'); return result();
  }
  if (year === '2024') { add('info','2024년말은 이번 이력의 기준 연도입니다. 2023년 이력이 없어 2024년의 감사인 변경·초도 여부를 판단하지 않습니다.'); return result(); }
  const priorRow = index.get(key(company,'2024-12-31',scope)), prior = recordOf(priorRow);
  describe('2024-12-31',prior);
  if (!prior) { add('warn','같은 회사·별도/연결의 2024년말 이력이 누락되었거나 상충·미확인입니다. 이를 전기 미감사나 신규 수임의 근거로 사용하지 않습니다.'); return result(); }
  const headerCik = tight(doc.header?.summary?.AUDIT_CIK), headerOpinion = {10:'unmodified',20:'qualified',30:'adverse',40:'disclaimer'}[String(doc.header?.summary?.SUPV_OPIN || '').slice(0,2)];
  if (!current.auditor_cik || headerCik !== current.auditor_cik || headerOpinion !== current.opinion_kind) {
    add('warn','현재 파일의 감사인·헤더 감사의견과 수집한 2025년말 이력이 일치하는지 확인되지 않았습니다. 정정 여부와 판본을 확인한 뒤 전기 이력을 대조하세요.'); return result();
  }
  add('info','참고자료는 연차 공시의 감사 기본정보입니다. 전기 실제 감사보고서를 직접 검증한 결과가 아닙니다.');
  const other = otherMatter(doc), text = tight(other.text);
  if (prior.state === 'unaudited') {
    add('warn',/감사받지|감사를받지|미감사/.test(text) ? '전기 미감사 관련 문구를 찾았습니다. 실제 미감사 근거와 비교정보 표시를 확인하세요.' : '이력에는 전기 미감사로 기재되어 있으나 기타사항의 관련 문구를 찾지 못했습니다. 실제 원문과 비교정보 유형을 확인하세요.',other.block); return result();
  }
  const same = prior.auditor_cik && current.auditor_cik ? prior.auditor_cik === current.auditor_cik : tight(prior.auditor) === tight(current.auditor);
  if (same) { add('info','공시 이력에서는 전기·당기 감사인 변경을 찾지 못했습니다. 이 사실만으로 기타사항 전체가 적절하다고 승인하지 않습니다.'); return result(); }
  if (!other.block) { add('warn','공시 이력에 감사인 변경 후보가 있으나 기타사항 문단을 찾지 못했습니다. 비교정보 유형과 전임보고서 재발행 예외를 확인하고 실제 전기 보고서와 대조하세요.'); return result(); }
  if (other.multiple) { add('warn','기타사항 문단을 여럿 식별해 전임감사인 정보를 하나로 대조하지 않았습니다.',other.block); return result(); }
  const before = findings.length;
  if (!/(?:타|다른|전임)감사인|회계법인이/.test(text) || !/감사하였|감사를수행|감사를실시/.test(text)) add('warn','감사인 변경 후보가 있으나 기타사항에서 전임감사 사실을 확인하지 못했습니다. 실제 전기 보고서와 대조하세요.',other.block);
  const firms = [...new Set([...String(other.text).matchAll(/([가-힣A-Za-z]+)\s*회계\s*법인/g)].map(m=>`${m[1]}회계법인`))];
  if (firms.length && !text.includes(tight(prior.auditor))) add('warn',`기타사항의 전기 감사인(${firms.join(', ')})과 공시 기본정보의 전기 감사인(${prior.auditor})이 다릅니다. 실제 전기 보고서를 확인하세요.`,other.block);
  const stated = [...new Set([...text.matchAll(/의견거절|부적정의견|한정의견|(?<!부)적정의견/g)].map(m=>opinionKind(m[0])))];
  if (stated.length !== 1) add('warn','기타사항의 전기 감사의견 유형을 하나로 식별하지 못했습니다. 실제 전기 보고서와 대조하세요.',other.block);
  else if (stated[0] !== prior.opinion_kind) add('warn',`기타사항의 의견 유형과 공시 기본정보의 전기 의견(${opinionNames[prior.opinion_kind]})이 다릅니다. 정정 여부와 실제 전기 보고서를 확인하세요.`,other.block);
  const dates = [...new Set([...text.matchAll(/(\d{4})년(\d{1,2})월(\d{1,2})일자?(?:의)?감사보고서/g)].map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`))];
  if (!prior.report_date || dates.length !== 1) add('warn','기타사항의 전기 감사보고서일을 공시 이력과 하나로 대조하지 못했습니다. 재무제표 기준일과 구분하여 확인하세요.',other.block);
  else if (dates[0] !== prior.report_date) add('warn',`기타사항의 감사보고서일과 공시 기본정보의 전기 보고서일(${prior.report_date})이 다릅니다. 실제 서명 원문과 정정 여부를 확인하세요.`,other.block);
  if (findings.length === before) add('info',`기타사항의 전기 ${firms.length ? `감사인(${firms[0]})·` : ''}감사보고서일(${prior.report_date})·의견(${opinionNames[prior.opinion_kind]})이 공시 기본정보와 같습니다.`,other.block);
  add('warn','감사인 변경 후보의 기타사항을 검토하세요. 문구·날짜가 맞아도 비교정보 유형·변형사유·재발행 예외는 실제 전기 보고서와 별도로 판단해야 합니다.',other.block);
  return result();
}
