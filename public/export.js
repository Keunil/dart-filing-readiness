import { writeZip } from './core/dsd-xlsx.js';

export const COLUMNS = ['번호', '구분', '점검 항목', '자동 판정', '직접 확인', '근거', '수동 확인 사항'];
const STATUS = { fail: '오류', warn: '확인 필요', manual: '수동 확인', pass: '통과', na: '해당 없음' };
export function exportRows(results, checked = new Set()) {
  return results.map(r => [r.no, r.group, r.item, STATUS[r.status], checked.has(r.no) ? '확인함 (자동 판정 유지)' : '미확인',
    r.findings.map(f => f.text + (Number.isInteger(f.block) ? ' [원문 블록 ' + (f.block + 1) + ']' : '')).join('\n'), r.manualPart || '']);
}
// Excel must treat source text as text even when it starts with a formula prefix.
export function csvCell(value) {
  const raw = String(value ?? '');
  const safe = /^[\s]*[=+\-@]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function csvText(results, checked) {
  return '\uFEFF' + [COLUMNS, ...exportRows(results, checked)].map(row => row.map(csvCell).join(',')).join('\r\n');
}
const xml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
export async function xlsxBytes(results, checked, metadata = {}) {
  const rows = [
    ['DART Filing Readiness', '자동 점검은 제출 승인이 아닙니다.'],
    ['문서', metadata.name || '', '서식 코드', metadata.code || ''],
    ['점검 시각', metadata.checkedAt || '', '감사인 기준', metadata.profile || ''],
    [],
    COLUMNS,
    ...exportRows(results, checked),
  ];
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="3" width="34" customWidth="1"/><col min="4" max="5" width="22" customWidth="1"/><col min="6" max="7" width="72" customWidth="1"/></cols><sheetData>' +
    rows.map((row, i) => '<row r="' + (i + 1) + '">' + row.map((value, j) => '<c r="' + letters[j] + (i + 1) + '" t="inlineStr" s="1"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>').join('') + '</row>').join('') +
    '</sheetData><autoFilter ref="A5:G' + rows.length + '"/></worksheet>';
  const files = new Map([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="제출 전 점검" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ['xl/worksheets/sheet1.xml', sheet],
  ]);
  return writeZip([...files].map(([name, text]) => ({ name, data: new TextEncoder().encode(text) })));
}
