import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDsd, DEFAULT_PROFILE } from '../public/engine.js';
import { sampleDsd } from '../public/samples.js';
import { readZip, entryBytes, writeZip } from '../public/core/dsd-xlsx.js';

const at = (analysis, no) => analysis.result.results.find(rule => rule.no === no);
async function replaceXml(sample, from, to) {
  const entries = readZip(sample.bytes);
  const contents = new TextDecoder().decode(await entryBytes(entries.find(entry => entry.name === 'contents.xml')));
  assert.ok(contents.includes(from), `fixture contains ${from}`);
  return writeZip([{ name: 'contents.xml', data: contents.replaceAll(from, to) }]);
}

test('injected annual errors are detected and the paired correction improves them', async () => {
  const broken = await sampleDsd('annual-issues');
  const fixed = await sampleDsd('annual-fixed');
  const before = await analyzeDsd(broken.bytes, broken.name);
  const after = await analyzeDsd(fixed.bytes, fixed.name);
  assert.equal(before.scope.inScope, true);
  assert.equal(at(before, 14).status, 'fail');
  assert.notEqual(at(after, 14).status, 'fail');
  assert.ok(at(before, 56).findings.some(finding => /순서/.test(finding.text)));
  assert.ok(!at(after, 56).findings.some(finding => /순서 확인/.test(finding.text)));
  assert.equal(at(before, 50).status, 'fail');
  assert.equal(at(after, 50).status, 'pass');
  assert.ok(before.result.counts.fail > after.result.counts.fail);
  assert.equal(after.result.counts.fail, 0);
  assert.ok(after.result.counts.manual > 0);
  assert.ok(after.result.results.some(rule => rule.status === 'manual' || rule.manualPart));
  assert.ok(after.headerRows.some(row => row.code === 'COMPANY' && row.value === '주식회사 가상테크'));
  assert.equal(after.doc.sha256.length, 64);
});

test('interim reports use the review rules and retain their own findings', async () => {
  const sample = await sampleDsd('interim-issues');
  const analysis = await analyzeDsd(sample.bytes, sample.name);
  assert.equal(analysis.scope.inScope, true);
  assert.equal(analysis.scope.code, '90020');
  assert.ok(analysis.result.results.some(rule => rule.group === '독립된 감사인의 검토보고서(본문)'));
  assert.ok(analysis.result.counts.fail + analysis.result.counts.warn > 0);
  assert.ok(analysis.result.results.length < 55);
});

test('unsupported and absent codes return no audit result', async () => {
  const sample = await sampleDsd('annual-fixed');
  for (const code of ['99999', '']) {
    const bytes = await replaceXml(sample, 'ACODE="00760"', `ACODE="${code}"`);
    const analysis = await analyzeDsd(bytes, '範囲外.dsd');
    assert.equal(analysis.result, null);
    assert.equal(analysis.scope.inScope, code ? false : null);
  }
});

test('custom auditor profiles are validated and applied per analysis', async () => {
  const sample = await sampleDsd('annual-fixed');
  const custom = { name: '예시회계법인', cik: '00888888', address: '가상시 예시로 20', ceo: '박예시' };
  const changed = await analyzeDsd(sample.bytes, sample.name, custom);
  assert.equal(at(changed, 4).status, 'fail');
  assert.ok(at(changed, 4).desc.includes(custom.cik));
  assert.equal(at(changed, 14).status, 'fail');
  const matching = await replaceXml(sample, DEFAULT_PROFILE.cik, custom.cik);
  const matchingResult = await analyzeDsd(matching, sample.name, custom);
  assert.equal(at(matchingResult, 4).status, 'pass');
  const defaultAgain = await analyzeDsd(sample.bytes, sample.name, DEFAULT_PROFILE);
  assert.notEqual(at(defaultAgain, 4).status, 'fail');
  assert.ok(at(defaultAgain, 4).desc.includes(DEFAULT_PROFILE.cik));
  await assert.rejects(analyzeDsd(sample.bytes, sample.name, { ...custom, cik: '123' }), /8자리/);
  await assert.rejects(analyzeDsd(sample.bytes, sample.name, { ...custom, name: ' ' }), /프로필|올바르게/);
});

test('concurrent reads keep the requested auditor in their own results', async () => {
  const sample = await sampleDsd('annual-fixed');
  const custom = { ...DEFAULT_PROFILE, cik: '00888888' };
  const [first, second] = await Promise.all([
    analyzeDsd(sample.bytes, sample.name, custom),
    analyzeDsd(sample.bytes, sample.name, DEFAULT_PROFILE),
  ]);
  assert.equal(at(first, 4).status, 'fail');
  assert.ok(at(first, 4).desc.includes(custom.cik));
  assert.equal(at(second, 4).status, 'pass');
  assert.ok(at(second, 4).desc.includes(DEFAULT_PROFILE.cik));
});

test('malformed ZIP, duplicate entries, and declared limits are rejected', async () => {
  await assert.rejects(analyzeDsd(new Uint8Array([1, 2, 3]), 'broken.dsd'), /ZIP/);
  await assert.rejects(analyzeDsd(new Uint8Array(20 * 1024 * 1024 + 1)), /20MB/);
  const duplicate = await writeZip([{ name: 'contents.xml', data: '<DOCUMENT/>' }, { name: 'contents.xml', data: '<DOCUMENT/>' }]);
  await assert.rejects(analyzeDsd(duplicate), /중복/);
  const many = await writeZip(Array.from({ length: 1001 }, (_, i) => ({ name: `${i}.xml`, data: '' })));
  await assert.rejects(analyzeDsd(many), /1,000/);
  const sample = await sampleDsd('annual-fixed');
  const huge = sample.bytes.slice();
  const view = new DataView(huge.buffer, huge.byteOffset, huge.byteLength);
  for (let i = 0; i < huge.length - 46; i++) {
    if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 81 * 1024 * 1024, true); break; }
  }
  await assert.rejects(analyzeDsd(huge), /80MB/);
});

test('dishonest expanded sizes stop during decompression', async () => {
  const bytes = await writeZip([{ name: 'contents.xml', data: '<DOCUMENT>' + 'A'.repeat(100000) + '</DOCUMENT>' }]);
  const entry = readZip(bytes)[0];
  await assert.rejects(entryBytes({ ...entry, size: 10 }), /해제 크기/);
});
