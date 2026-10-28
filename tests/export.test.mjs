import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvText, exportRows, xlsxBytes } from '../public/export.js';
import { readZip, entryBytes } from '../public/core/dsd-xlsx.js';
const results = [{ no: 7, group: '주석', item: '=HYPERLINK("https://invalid.example")', status: 'fail', findings: [{ text: '<가상>&회사', block: 3 }], manualPart: '직접 대조' }];
test('CSV neutralizes spreadsheet formulas and preserves the failed verdict after manual review', () => {
  const text = csvText(results, new Set([7]));
  assert.ok(text.startsWith('\uFEFF'));
  assert.ok(text.includes('"\'=HYPERLINK(""https://invalid.example"")"'));
  assert.equal(exportRows(results, new Set([7]))[0][3], '오류 후보');
  assert.equal(exportRows(results, new Set([7]))[0][4], '확인함 (자동 판정 유지)');
});
test('XLSX is a real ZIP workbook, escapes XML, uses text cells and preserves evidence', async () => {
  const zip = readZip(await xlsxBytes(results, new Set(), { name: '가상.dsd', code: '00760' }));
  assert.equal(zip.length, 6);
  const sheet = new TextDecoder().decode(await entryBytes(zip.find(e => e.name === 'xl/worksheets/sheet1.xml')));
  assert.match(sheet, /&lt;가상&gt;&amp;회사/);
  assert.match(sheet, /HYPERLINK/);
  assert.ok(!sheet.includes('<f>'));
  assert.match(sheet, /오류/);
  assert.match(sheet, /원문 블록 4/);
});
