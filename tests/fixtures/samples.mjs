// Public synthetic DSD fixtures. Every company, person, amount and event is fictional.
import { writeZip } from '../../public/core/dsd-xlsx.js';
const META = '<METAINFO><GENERATOR schema="dart4.xsd" editver="5.115"/><DOCUMENT-HEADER regcik="00111111" regname="주식회사 가상테크"/><DOCUMENT-INFO docver="6.0" bsn-id="00760" rpt-id="00760" doc-id="00760" iscorrection="N"/></METAINFO>';
const SUMMARY = {
  AUDIT_CIK: '00999999', SUPV_OPIN: '100000000000', GMSH_DATE: '20260320', CRP_RGS_NO: '1101113471036', FIN_STAT: '000',
  TOT_ASSETS: '1234568', TOT_DEBTS: '567890', TOT_SALES: '2653725', TOT_EMPL: '10', ETC_OTHR_YN: 'N', POW_OTHR_YN: 'N', ACC_PROF_YN: 'N',
  IFRS_YN: 'Y', FIN_YN: 'N', CRP_RGS_CLS: 'P', LINK_FLAG: 'N', PREV_IACS: '1', PREV_YN: 'Y',
};

const tr = (...cells) => `<TR>${cells.join('')}</TR>`;
const td = (text, attrs = '') => `<TD${attrs ? ` ${attrs}` : ''}>${text}</TD>`;
const te = (code, text) => `<TE ACODE="${code}">${text}</TE>`;
const table = (rows, attrs = 'BORDER="0" ACLASS="NORMAL"') => `<TABLE ${attrs}><TBODY>${rows.join('')}</TBODY></TABLE>`;

const NUT = (o = {}) => {
  const v = { NUM_QLT: [1, 1], NUM_ACT: [1, 1], NUM_ACR: [3, 3], NUM_ACP: [2, 2], NUM_EXP: ['-', '-'], NUM_COT: ['-', '-'], NUM_TOT: [7, 7],
    TMA_QLT: [2, 2], TMA_ACT: [4, 4], TMA_ACR: [30, 30], TMA_ACP: [10, 10], TMA_EXP: ['-', '-'], TMA_COT: ['-', '-'], TMA_TOT: [46, 46],
    TMY_QLT: [10, 10], TMY_ACT: [20, 20], TMY_ACR: [100, 100], TMY_ACP: [50, 50], TMY_EXP: ['-', '-'], TMY_COT: ['-', '-'], TMY_TOT: [180, 180],
    TMT_QLT: [12, 12], TMT_ACT: [24, 24], TMT_ACR: [130, 130], TMT_ACP: [60, 60], TMT_EXP: ['-', '-'], TMT_COT: ['-', '-'], TMT_TOT: [226, 226], ...o };
  const row = (p) => Object.keys(v).filter((k) => k.startsWith(p)).flatMap((k) => [te(`${k}_TH`, v[k][0]), te(`${k}_LA`, v[k][1])]);
  return table([tr(td('투입 인원수', 'COLSPAN="2"'), ...row('NUM_')), tr(td('분ㆍ반기검토'), ...row('TMA_')), tr(td('감사'), ...row('TMY_')), tr(td('합계'), ...row('TMT_'))], 'ACLASS="EXTRACTION" BORDER="1"');
};

/** 원문 글을 바꿔 오류 사례를 만든다(엑셀 오류사례 그대로). 바꿀 글이 없으면 시험이 헛돌지 않게 멈춘다. */
const swapAll = (xml, pairs = []) => pairs.reduce((s, [from, to]) => {
  if (!s.includes(from)) throw new Error(`fixture에 '${from}'이 없다`);
  return s.split(from).join(to);
}, xml);

/** 감사보고서 DSD contents.xml. o로 부분을 바꾸고, o.swap([[원래 글, 바꿀 글]])으로 원문을 고친다. */
function contents(o = {}) {
  const s = { ...SUMMARY, ...(o.summary || {}) };
  for (const k of o.dropHead || []) delete s[k];   // 서식에 없는 헤더 칸(연결감사보고서 00761)
  const date = o.reportDate || '2026년 3월 18일';
  const statement = (name, rows, unit = '원', note = '"별첨 주석은 본 재무제표의 일부입니다."') => [
    table([tr(td(name)), tr(td(`제 20 기말 2025년 12월 31일 현재`)), tr(td('제 19 기말 2024년 12월 31일 현재')), tr(td('주식회사 가상테크'), td(`(단위 : ${unit})`))]),
    table([tr(td('과 목'), td('주석'), td('제 20 (당) 기 말'), td('제 19 (전) 기 말')), ...rows], 'BORDER="1" ACLASS="NORMAL"'),
    note === null ? '<P></P>' : table([tr(td(note))]),
  ].join('');
  return swapAll(`<?xml version="1.0" encoding="utf-8"?>
<DOCUMENT xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="dart4.xsd">
<DOCUMENT-HEADER AEXT-CLASS="Y"><DOCUMENT-NAME ACODE="${o.docCode || '00760'}">${o.docCode === '00761' ? '연결감사보고서' : '감사보고서'}</DOCUMENT-NAME><FORMULA-VERSION ADATE="20221027">6.0</FORMULA-VERSION>
<COMPANY-NAME AREGCIK="00111111" AACCOUNTTYPE="A">주식회사 가상테크</COMPANY-NAME>
<SUMMARY>${Object.entries(s).map(([k, v]) => `<EXTRACTION ACODE="${k}" AFEATURE="BOTH">${v}</EXTRACTION>`).join('\n')}</SUMMARY></DOCUMENT-HEADER>
<BODY>
<INSERTION><COMMENT>◆click◆ 정정문서 작성시 『정오표』 삽입</COMMENT><LIBRARYLIST>일반-정정*.LCommon</LIBRARYLIST></INSERTION>
<COVER><P USERMARK="F-18">${o.coverCompany || '주식회사 가상테크'}</P><P>${o.coverSub ?? '재무제표 및 내부회계관리제도에 대한'}</P><COVER-TITLE ATOC="Y">감 사 보 고 서</COVER-TITLE>
<TABLE-GROUP ACLASS="COVER" ADELETETABLE="N">${table([tr(td('제 20 기', 'COLSPAN="2"')), tr('<TU AUNIT="PERIODFROM" AUNITVALUE="20250101">2025년 01월 01일</TU>', td('부터')), tr('<TU AUNIT="PERIODTO" AUNITVALUE="20251231">2025년 12월 31일</TU>', td('까지'))], 'ACLASS="EXTRACTION" BORDER="0"')}</TABLE-GROUP>
${o.coverPrev === null ? '' : table([tr(td(o.coverPrev || '제 19 기', 'COLSPAN="2"')), tr(td('2024년 01월 01일'), td('부터')), tr(td('2024년 12월 31일'), td('까지'))])}
<P USERMARK="F-18${o.coverColor ? ' 0XFF0000' : ''}">${o.coverAuditor ?? '가상회계법인'}</P><PGBRK/></COVER>
${o.noToc ? '' : `<TOC><TITLE ATOC="N">목 차</TITLE>${table([tr(td('독립된 감사인의 감사보고서')), tr(td('재 무 상 태 표')), tr(td('포 괄 손 익 계 산 서')), tr(td('독립된 감사인의 내부회계관리제도 감사보고서'))])}</TOC>`}
<INSERTION><COMMENT>◆click◆ 『감사인의 감사보고서』 삽입</COMMENT><LIBRARYLIST>00760#*감사인의 감사보고서.dsl</LIBRARYLIST><LIBRARY><FILENAME>61</FILENAME>
<SECTION-1 ACLASS="MANDATORY"><TITLE ATOC="Y">독립된 감사인의 감사보고서</TITLE>
${table([tr(td('주식회사 가상테크'), td('')), tr(td('주주 및 이사회 귀중'), td(''))])}
<P USERMARK="B">감사의견</P>
<P>우리는 주식회사 가상테크(이하 "회사")의 재무제표를 감사하였습니다. 해당 재무제표는 2025년 12월 31일과 2024년 12월 31일 현재의 재무상태표, 동일로 종료되는 양 보고기간의 ${o.opinionPl || '포괄손익계산서'} 그리고 재무제표의 주석으로 구성되어 있습니다.</P>
<P>우리의 의견으로는 별첨된 회사의 재무제표는 회사의 2025년 12월 31일과 2024년 12월 31일 현재의 재무상태와 재무성과를 한국채택국제회계기준에 따라, 중요성의 관점에서 공정하게 표시하고 있습니다.</P>
<P>핵심감사사항&amp;cr;핵심감사사항은 우리의 전문가적 판단에 따라 가장 유의적인 사항들입니다.</P>
<P>(1) 수익인식&amp;cr;핵심감사사항으로 결정된 이유&amp;cr;${o.kamNote ?? '재무제표에 대한 주석 2에 기술되어 있는 바와 같이'} 회사는 수익을 인식합니다.&amp;cr;핵심감사사항이 감사에서 다루어진 방법&amp;cr;ㆍ통제 테스트</P>
${o.other ? `<P>기타사항&amp;cr;${o.other}</P>` : ''}
<P>재무제표에 대한 경영진과 지배기구의 책임&amp;cr;경영진은 책임이 있습니다.</P>
<P>이 감사보고서의 근거가 된 감사를 실시한 업무수행이사는 공인회계사 ${o.partner ?? '박가상'}입니다.</P>
${table([tr(td(o.address || '서울특별시 중구 가상로 10')), tr(td('가 상 회 계 법 인')), tr(td('대 표 이 사 김 가 상')), tr(td(date))])}
${table([tr(td(`이 감사보고서는 감사보고서일(${o.effectiveDate || date}) 현재로 유효한 것입니다. 따라서 감사보고서일 후 이 보고서를 열람하는 시점 사이에 별첨된 회사의 재무제표에 중요한 영향을 미칠 수 있는 사건이나 상황이 발생할 수도 있으며, 이로 인하여 이 감사보고서가 수정될 수도 있습니다.`))], 'BORDER="1" ACLASS="NORMAL"')}
</SECTION-1></LIBRARY></INSERTION>
<SECTION-1 ACLASS="MANDATORY"><TITLE ATOC="Y">(첨부)재 무 제 표</TITLE>
${table([tr(td('주식회사 가상테크'))])}
<TABLE-GROUP ACLASS="COVER2">${table([tr(td('제 20 기', 'COLSPAN="2"')), tr('<TU AUNIT="PERIODFROM2" AUNITVALUE="20250101">2025년 01월 01일</TU>', td('부터')), tr('<TU AUNIT="PERIODTO2" AUNITVALUE="20251231">2025년 12월 31일</TU>', td('까지'))], 'ACLASS="EXTRACTION" BORDER="0"')}</TABLE-GROUP>
${table([tr(td('제 19 기', 'COLSPAN="2"')), tr(td('2024년 01월 01일'), td('부터')), tr(td('2024년 12월 31일'), td('까지'))])}
${table([tr(td('"첨부된 재무제표는 당사가 작성한 것입니다."')), tr(td('주식회사 가상테크 대표이사 이가상'))])}
${table([tr(td('본점 소재지 :', 'ROWSPAN="2"'), td('(도로명주소)'), td('가상시 예시구 체험로 1')), tr(td('(전 화)'), td('02-000-0000'))])}
${statement('재 무 상 태 표', [tr(td('자산총계'), td(''), td(o.assets || '1,234,567,890,123'), td('1,000')), tr(td('부채총계'), td(''), td('567,890,123,456'), td('1,000')),
  ...(o.ap ? [tr(td('1. 미처분이익잉여금(미처리결손금)(주석14)'), td(''), td('9,125,569,783'), td('1,000'))] : [])])}
${statement('포 괄 손 익 계 산 서', [tr(td('매출액'), td('25'), td('2,653,725,793,231'), td(o.comma || '1,000'))], 'won' in o ? o.won : '원', 'plNote' in o ? o.plNote : undefined)}
${o.sce ? statement('자 본 변 동 표', [tr(td('2024.1.1(전기초)'), td(''), td('1,000'), td('1,000')), tr(td(o.sce), td(''), td('1,000'), td('1,000')), tr(td('2025.12.31(당기말)'), td(''), td('1,000'), td('1,000'))]) : ''}
<SECTION-2 ACLASS="MANDATORY"><TITLE ATOC="Y">주석</TITLE>
<P>1. 일반사항&amp;cr;회사는 설립되었습니다.</P><P>2. 중요한 회계정책&amp;cr;회사의 당기 재무제표는 2026년 2월 6일자로 이사회에서 승인되었습니다.</P>
<P>이익잉여금처분계산서</P>
${table([o.apInline === 'cells' ? tr(td('제20(당)기'), td(`처분예정일 ${o.appropriation || '2026년 3월 20일'}`), td('제19(전)기'), td('처분확정일 2025년 3월 25일'))
  : o.apInline === 'one' ? tr(td(`처 분 예 정 일 : ${o.appropriation || '2026년 3월 20일'} / 처분확정일 : 2025년 3월 25일`))
  : tr(td('제20(당)기'), td('처분예정일'), td(o.appropriation || '2026년 3월 20일'), td('제19(전)기'), td('처분확정일'), td('2025년 3월 25일')), ...(o.ap ? [tr(td(o.ap.unit ? `(단위: ${o.ap.unit})` : '', 'COLSPAN="6"'))] : [])])}
${o.ap ? table([tr(td('과목'), td('당기'), td('전기')), tr(td('I. 미처분이익잉여금'), td('9,125,569,783'), td('1,000'))], 'BORDER="1" ACLASS="NORMAL"') : ''}
</SECTION-2></SECTION-1>
<INSERTION><COMMENT>◆click◆ 『내부회계관리제도 감사 또는 검토의견』 삽입</COMMENT><LIBRARYLIST>00760#*내부회계관리제도감사또는검토의견.dsl</LIBRARYLIST><LIBRARY>
<SECTION-1 ACLASS="MANDATORY"><TITLE ATOC="Y">내부회계관리제도 감사 또는 검토의견</TITLE>
${o.icfrCompany === null ? '' : '<P>주식회사 가상테크</P>'}
<P>독립된 감사인의 내부회계관리제도 감사보고서는 주식회사 가상테크의 2025년 12월 31일자로 종료되는 회계연도의 재무제표에 대한 감사업무를 수행하고 회사의 내부회계관리제도를 감사한 결과 주식회사 등의 외부감사에 관한 법률 제8조에 따라 첨부하는 것입니다.&amp;cr;첨부: 1. 독립된 감사인의 내부회계관리제도 감사보고서&amp;cr;2. 회사의 내부회계관리제도 운영실태보고서</P>
<P>독립된 감사인의 내부회계관리제도 감사보고서</P>
${table([tr(td('주식회사 가상테크'), td('')), tr(td(o.icfrTo || '주주 및 이사회 귀중'), td(''))])}
<P>우리의 의견으로는 회사의 내부회계관리제도는 2025년 12월 31일 현재 중요성의 관점에서 효과적으로 설계 및 운영되고 있습니다.</P>
<P>우리는 또한 대한민국의 회계감사기준에 따라, 회사의 2025년 12월 31일 현재의 재무상태표, 동일로 종료되는 보고기간의 포괄손익계산서 그리고 재무제표의 주석을 감사하였으며, ${date}자 감사보고서에서 적정의견을 표명하였습니다.</P>
<P>이 독립된 감사인의 내부회계관리제도 감사보고서의 근거가 된 감사를 실시한 업무수행이사는 공인회계사 박가상입니다.</P>
${table([tr(td('서울특별시 중구 가상로 10')), tr(td('가 상 회 계 법 인')), tr(td('대 표 이 사 김 가 상')), tr(td(date))])}
${table([tr(td(`이 감사보고서는 감사보고서일(${o.icfrEffective || date}) 현재로 유효한 것입니다. 따라서 감사보고서일 후 이 보고서를 열람하는 시점 사이에 회사의 내부회계관리제도에 중요한 영향을 미칠 수 있는 사건이나 상황이 발생할 수도 있으며, 이로 인하여 이 감사보고서가 수정될 수도 있습니다.`))], 'BORDER="1" ACLASS="NORMAL"')}
<IMAGE><IMG FILENAME="운영실태보고서.jpg"/></IMAGE>
</SECTION-1></LIBRARY></INSERTION>
<SECTION-1 ACLASS="MANDATORY"><TITLE ATOC="Y">외부감사 실시내용</TITLE>
<SECTION-2><TITLE>1. 감사대상업무</TITLE><TABLE-GROUP ACLASS="INS_SUB">${table([tr(td('회 사 명'), te('SUB_COMPY', '주식회사 가상테크')), tr(td('감사대상 사업연도'), '<TU AUNIT="SUB_PERIODFROM" AUNITVALUE="20250101">2025년 01월 01일</TU>', td('부터'), `<TU AUNIT="SUB_PERIODTO" AUNITVALUE="${o.subTo || '20251231'}">2025년 12월 31일</TU>`, td('까지'))], 'ACLASS="EXTRACTION" BORDER="1"')}</TABLE-GROUP></SECTION-2>
<SECTION-2><TITLE>2. 감사참여자 구분별 인원수 및 감사시간</TITLE><TABLE-GROUP ACLASS="INS_NUT">${NUT(o.nut)}</TABLE-GROUP></SECTION-2>
<SECTION-2><TITLE>3. 주요 감사실시내용</TITLE><TABLE-GROUP ACLASS="INS_CONT">${table([
    tr(td('수행시기'), te('PLN_TIM', o.plnTim || '2025-09-17 ~ 2025-09-30'), te('PLN_DAY', '10'), td('일')),
    tr(te('PLC_TIM', '2025-06-30 ~ 2025-07-18'), te('PLC_DAY', o.plcDay || '15'), td('일'), te('PLC_RSD', '9'), te('PLC_NSD', '2')),
    tr(td('실사'), te('STK_TIM', '2025-12-31'), te('STK_DAY', '1'), td('일')),
    tr(td('커뮤니케이션 횟수'), te('COM_NUM', o.comNum || '2'), td('회')),
    tr(td('수행시기'), te('COM_TIM', '2025-04-22, 2026-02-23')),
  ], 'ACLASS="EXTRACTION" BORDER="1"')}</TABLE-GROUP></SECTION-2>
<SECTION-2><TITLE>4. 감사(감사위원회)와의 커뮤니케이션</TITLE><TABLE-GROUP ACLASS="INS_COMM">${table([
    tr('<TH>구분</TH>', '<TH>일자</TH>', '<TH>참석자</TH>', '<TH>방식</TH>', '<TH>주요 논의 내용</TH>'),
    tr(te('COMM_NO', '1'), '<TU AUNIT="COMM_DATE" AUNITVALUE="20250422">2025.04.22</TU>', te('COMM_ATTN', o.attn || '회사측: 감사위원 3인&amp;cr;감사인측: 업무수행이사 등 4인'), te('COMM_WAY', '대면회의'), te('COMM_DIS', '통합감사계획 및 감사 진행 경과')),
    tr(te('COMM_NO', '2'), '<TU AUNIT="COMM_DATE" AUNITVALUE="20260223">2026.02.23</TU>', te('COMM_ATTN', '회사측: 감사위원 3인&amp;cr;감사인측: 업무수행이사 등 4인'), te('COMM_WAY', '대면회의'), te('COMM_DIS', '감사 종결 보고 및 핵심감사사항')),
  ], 'ACLASS="EXTRACTION" BORDER="1"')}</TABLE-GROUP></SECTION-2>
<INSERTION><COMMENT>◆click◆ 『감사인의 중요성 금액』 삽입</COMMENT><LIBRARYLIST>00760#*감사인의중요성금액.dsl</LIBRARYLIST>${o.materiality ? '<LIBRARY><SECTION-2><TITLE>5. 감사인의 중요성 금액</TITLE></SECTION-2></LIBRARY>' : ''}</INSERTION>
</SECTION-1>
</BODY></DOCUMENT>`, o.swap);
}


const interim = () => `<DOCUMENT><DOCUMENT-HEADER><DOCUMENT-NAME ACODE="90020">반기검토보고서</DOCUMENT-NAME><FORMULA-VERSION>6.0</FORMULA-VERSION><COMPANY-NAME AREGCIK="00111111">주식회사 가상테크</COMPANY-NAME><SUMMARY><EXTRACTION ACODE="AUDIT_CIK">00999999</EXTRACTION></SUMMARY></DOCUMENT-HEADER><BODY><COVER><P>주식회사 가상테크</P><P>반기검토보고서</P><TABLE-GROUP ACLASS="COVER"><TABLE><TR><TU AUNIT="PERIODFROM" AUNITVALUE="20260101">2026년 1월 1일</TU></TR><TR><TU AUNIT="PERIODTO" AUNITVALUE="20260630">2026년 6월 30일</TU></TR></TABLE></TABLE-GROUP><P>가상회계법인</P></COVER><SECTION-1><TITLE>독립된 감사인의 검토보고서</TITLE><P>검토대상</P><P>우리는 주식회사 가상테크의 2026년 6월 30일 현재의 요약반기재무제표와 주석을 검토하였습니다.</P><P>감사의견</P><P>우리의 의견으로는 재무제표는 공정하게 표시하고 있습니다.</P><P>검토인의 책임</P><P>우리는 검토를 수행하였습니다.</P><P>가상회계법인 대표이사 김가상 2026년 8월 10일</P></SECTION-1><SECTION-1><TITLE>(첨부)재무제표</TITLE><SECTION-2><TITLE>주석</TITLE><P>1. 일반사항</P><P>가상 회사의 체험 자료입니다.</P><P>3. 회계정책</P><P>요약중간재무제표는 선별적 주석을 포함합니다.</P></SECTION-2></SECTION-1></BODY></DOCUMENT>`;
export async function sampleDsd(kind = 'annual-issues') {
  if (!['annual-issues', 'annual-fixed', 'interim-issues'].includes(kind)) throw new Error('알 수 없는 체험 자료입니다.');
  const isInterim = kind === 'interim-issues';
  const options = kind === 'annual-issues' ? { coverAuditor: '감사인 명칭', subTo: '20251230', swap: [['<P>2. 중요한 회계정책', '<P>3. 중요한 회계정책']] } : {};
  const xml = isInterim ? interim() : contents(options);
  const code = isInterim ? '90020' : '00760';
  const bytes = await writeZip([{ name: 'contents.xml', data: xml }, { name: 'meta.xml', data: META.replaceAll('00760', code) }]);
  return { name: `가상테크_${kind}.dsd`, bytes };
}
