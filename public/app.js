import { DEFAULT_PROFILE, analyzeDsd } from './engine.js';
import { sampleDsd } from './samples.js';
import { renderDsd } from './core/dsd-view.js';
import { csvText, xlsxBytes } from './export.js';

const $ = id => document.getElementById(id);
const STATUS = { fail: '오류', warn: '확인 필요', manual: '수동 확인', pass: '통과', na: '해당 없음' };
const state = { current: null, source: null, checked: new Set(), images: [], view: null, operation: 0, busy: false };
const profileKeys = ['name', 'cik', 'address', 'ceo'];
const node = (tag, text, cls) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
};
function setProfile(profile) {
  for (const key of profileKeys) $('auditor-' + key).value = profile[key];
  updateProfileLabel();
}
function profile() {
  return Object.fromEntries(profileKeys.map(key => [key, $('auditor-' + key).value.trim()]));
}
function updateProfileLabel() {
  const p = profile();
  $('profile-label').textContent = (p.name || '감사인 명칭을 입력하세요') + (p.name === DEFAULT_PROFILE.name ? ' · 체험용' : '');
}
function notify(text, error = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
  $('message').hidden = !text;
}
function setBusy(busy) {
  state.busy = busy;
  for (const id of ['sample-issues', 'sample-fixed', 'sample-interim', 'sample-download', 'file-input', 'clear', 'export-csv', 'export-xlsx']) $(id).disabled = busy;
  $('rerun').disabled = busy || !state.source;
  $('dropzone').setAttribute('aria-busy', String(busy));
}
function releaseView() {
  for (const url of state.images) URL.revokeObjectURL(url);
  state.images = [];
  state.view = null;
  $('source-view').replaceChildren();
}
function clearDocument() {
  state.operation++;
  state.current = null;
  state.source = null;
  state.checked.clear();
  releaseView();
  $('file-input').value = '';
  $('results').hidden = true;
  $('search').value = '';
  $('status-filter').value = 'all';
  $('step-file').classList.add('active');
  $('step-check').classList.remove('active');
  $('step-review').classList.remove('active');
  if ($('evidence-dialog').open) $('evidence-dialog').close();
  setBusy(false);
  notify('문서와 점검 결과를 비웠습니다.');
}
async function run(sourceFactory, isSample = false) {
  if (state.busy) return;
  const op = ++state.operation;
  setBusy(true);
  // Remove the preceding report immediately so a failed replacement can never
  // leave an old result looking like the result for the newly selected file.
  state.current = null;
  state.source = null;
  state.checked.clear();
  releaseView();
  $('results').hidden = true;
  $('file-input').value = '';
  $('search').value = '';
  $('status-filter').value = 'all';
  notify('문서를 읽고 구조를 점검하고 있습니다.');
  $('step-check').classList.add('active');
  try {
    if (isSample) setProfile(DEFAULT_PROFILE);
    const selectedProfile = profile();
    const source = await sourceFactory();
    const report = await analyzeDsd(source.bytes, source.name, selectedProfile);
    if (op !== state.operation) return;
    state.source = source;
    state.current = { ...report, profile: selectedProfile, checkedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) };
    renderReport();
    notify(report.result ? '점검을 마쳤습니다. 오류 후보와 수동 확인 항목의 근거를 검토하세요.' : '지원 서식을 확인할 수 없어 자동 점검을 실행하지 않았습니다.');
    $('step-file').classList.remove('active');
    $('step-review').classList.add('active');
  } catch (error) {
    if (op !== state.operation) return;
    notify(error.message || '문서를 읽지 못했습니다. DART 편집기에서 저장한 DSD인지 확인하세요.', true);
    $('step-check').classList.remove('active');
    $('step-review').classList.remove('active');
    $('step-file').classList.add('active');
  } finally {
    if (op === state.operation) setBusy(false);
  }
}
function renderReport() {
  const report = state.current;
  $('results').hidden = false;
  const doc = report.doc;
  $('file-meta').textContent = doc.name + ' · ' + (doc.header.company || doc.meta.regname || '회사명 미확인') + ' · ' + report.checkedAt + ' (KST)';
  $('scope-banner').classList.toggle('unsupported', !report.result);
  $('scope-banner').textContent = report.result
    ? report.scope.label + ' · ' + report.profile.name + ' 기준 · 자동 점검 ' + report.result.results.length + '항목'
    : '지원 범위 밖 또는 문서 코드 미확인: ' + report.scope.label + '. 지원 서식의 DART 편집기 원본 파일을 선택하세요.';
  $('result-content').hidden = !report.result;
  if (!report.result) return;
  $('stats').replaceChildren();
  for (const [status, label] of Object.entries(STATUS)) {
    const button = node('button', undefined, 'stat ' + status);
    button.append(node('strong', String(report.result.counts[status])), node('span', label));
    button.setAttribute('aria-label', label + ' ' + report.result.counts[status] + '개 항목 보기');
    button.addEventListener('click', () => { $('status-filter').value = status; renderRows(); });
    $('stats').append(button);
  }
  renderRows();
}
function needsReview(row) {
  return !['pass', 'na'].includes(row.status) || !!row.manualPart;
}
function renderRows() {
  if (!state.current?.result) return;
  const query = $('search').value.trim().toLocaleLowerCase('ko-KR');
  const filter = $('status-filter').value;
  const results = state.current.result.results;
  const visible = results.filter(row => (filter === 'all' || row.status === filter) &&
    [row.no, row.group, row.item, row.desc, ...row.findings.map(f => f.text)].join(' ').toLocaleLowerCase('ko-KR').includes(query));
  $('result-rows').replaceChildren();
  for (const row of visible) {
    const tr = node('tr');
    tr.dataset.no = row.no;
    const item = node('td');
    item.append(node('span', row.group, 'item-group'), node('span', row.item, 'item-title'));
    const status = node('td');
    status.append(node('span', STATUS[row.status], 'status-pill ' + row.status));
    const evidence = node('td');
    const button = node('button', '보기 ↗', 'evidence-button');
    button.setAttribute('aria-label', row.no + '번 ' + row.item + ' 원문 근거 보기');
    button.addEventListener('click', () => showEvidence(row));
    evidence.append(button);
    const reviewed = node('td');
    if (needsReview(row)) {
      const checkbox = node('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'review-check';
      checkbox.checked = state.checked.has(row.no);
      checkbox.setAttribute('aria-label', row.no + '번 ' + row.item + ' 직접 확인');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.checked.add(row.no);
        else state.checked.delete(row.no);
        renderReviewCount();
      });
      reviewed.append(checkbox);
    } else reviewed.append(node('span', '·', 'check-muted'));
    tr.append(node('td', String(row.no).padStart(2, '0')), item, status, evidence, reviewed);
    $('result-rows').append(tr);
  }
  $('list-count').textContent = '전체 ' + results.length + '개 중 ' + visible.length + '개 항목';
  $('empty-results').hidden = visible.length > 0;
  renderReviewCount();
}
function renderReviewCount() {
  const rows = state.current.result.results.filter(needsReview);
  $('manual-count').textContent = '직접 확인 기록 ' + rows.filter(r => state.checked.has(r.no)).length + ' / ' + rows.length;
}
function ensureSourceView() {
  if (state.view) return;
  const images = new Map();
  for (const img of state.current.doc.images) {
    const url = URL.createObjectURL(new Blob([img.bytes], { type: img.type }));
    state.images.push(url);
    images.set(img.name, url);
  }
  state.view = renderDsd(state.current.doc, { images });
  $('source-view').append(state.view.root);
}
function highlightLocation(location) {
  for (const el of $('source-view').querySelectorAll('.source-highlight')) el.classList.remove('source-highlight');
  if (location.head) {
    $('header-details').open = true;
  }
  if (Number.isInteger(location.block)) {
    const el = state.view.byBlock.get(location.block);
    if (el) {
      el.classList.add('source-highlight');
      const view = $('source-view');
      view.scrollTop += el.getBoundingClientRect().top - view.getBoundingClientRect().top - 40;
    }
  }
}
function locationButton(location, label) {
  const b = node('button', label, 'finding-location');
  b.addEventListener('click', () => highlightLocation(location));
  return b;
}
function showEvidence(row) {
  ensureSourceView();
  $('evidence-title').textContent = row.no + '. ' + row.item;
  $('evidence-findings').replaceChildren();
  $('header-rows').replaceChildren();
  $('header-details').open = false;
  for (const header of state.current.headerRows) $('header-rows').append(node('dt', header.label), node('dd', header.text || '(빈 값)'));
  const findings = row.findings.length ? row.findings : [{ level: 'info', text: row.status === 'na' ? '현재 적용 기준에서는 해당하지 않는 항목입니다.' : row.desc || '원문을 직접 확인하세요.' }];
  for (const f of findings) {
    const box = node('div', undefined, 'finding ' + f.level);
    box.append(node('div', f.text));
    if (f.quote) box.append(node('blockquote', f.quote));
    if (Number.isInteger(f.block) || f.head) box.append(locationButton(f, f.head ? '헤더정보 ' + f.head + ' 확인' : '원문 블록 ' + (f.block + 1) + '로 이동 ↓'));
    for (const other of f.also || []) box.append(locationButton(other, (other.label || '비교 근거') + '로 이동 ↓'));
    $('evidence-findings').append(box);
  }
  if (row.manualPart) $('evidence-findings').append(node('div', '직접 확인할 사항: ' + row.manualPart, 'finding'));
  $('evidence-dialog').showModal();
  $('evidence-dialog').scrollTop = 0;
  const first = findings.find(f => Number.isInteger(f.block) || f.head);
  if (first) highlightLocation(first);
}
function download(bytes, type, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = node('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
for (const key of profileKeys) $('auditor-' + key).addEventListener('input', updateProfileLabel);
setProfile(DEFAULT_PROFILE);
$('sample-issues').addEventListener('click', () => run(() => sampleDsd('annual-issues'), true));
$('sample-fixed').addEventListener('click', () => run(() => sampleDsd('annual-fixed'), true));
$('sample-interim').addEventListener('click', () => run(() => sampleDsd('interim-issues'), true));
$('sample-download').addEventListener('click', async () => {
  try { const sample = await sampleDsd('annual-issues'); download(sample.bytes, 'application/zip', sample.name); }
  catch (error) { notify(error.message, true); }
});
function selectFile(file) {
  if (!file || state.busy) return;
  run(async () => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }));
}
$('file-input').addEventListener('change', event => selectFile(event.target.files[0]));
$('dropzone').addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) $('dropzone').classList.add('dragging'); });
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('dragging'));
$('dropzone').addEventListener('drop', event => {
  event.preventDefault();
  $('dropzone').classList.remove('dragging');
  if (event.dataTransfer.files.length > 1) { notify('한 번에 DSD 파일 하나를 선택해 주세요.', true); return; }
  selectFile(event.dataTransfer.files[0]);
});
$('rerun').addEventListener('click', () => { const source = state.source; if (source) run(async () => source); });
$('clear').addEventListener('click', clearDocument);
$('search').addEventListener('input', renderRows);
$('status-filter').addEventListener('change', renderRows);
$('evidence-close').addEventListener('click', () => $('evidence-dialog').close());
$('export-csv').addEventListener('click', () => {
  if (!state.current?.result) return;
  download(csvText(state.current.result.results, state.checked), 'text/csv;charset=utf-8', 'DART-점검결과.csv');
});
$('export-xlsx').addEventListener('click', async () => {
  if (!state.current?.result) return;
  const current = state.current;
  try {
    const bytes = await xlsxBytes(current.result.results, new Set(state.checked), { name: current.doc.name, code: current.scope.code, checkedAt: current.checkedAt, profile: current.profile.name });
    download(bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'DART-점검결과.xlsx');
  } catch (error) { notify('엑셀 파일 생성에 실패했습니다: ' + error.message, true); }
});
