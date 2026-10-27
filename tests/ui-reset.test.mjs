import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Execute the actual UI module against an in-memory DOM. No browser, network,
// temporary file or copied reset implementation is involved.
function app() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', textContent: '', hidden: false, open: false,
      classList: { add() {}, remove() {}, toggle() {} },
      replaceChildren() { this.textContent = ''; this.handlersReleased = true; },
      addEventListener() {}, setAttribute() {}, close() { this.open = false; },
    });
    return elements.get(id);
  };
  const sourcePath = process.env.UI_SOURCE_FILE || new URL('../public/app.js', import.meta.url);
  const source = readFileSync(sourcePath, 'utf8').replace(/^import .+;$/gm, '');
  const sandbox = {
    document: { getElementById: get },
    DEFAULT_PROFILE: { name: '가상', cik: '00999999', address: '가상로', ceo: '가상' },
    URL: { revokeObjectURL() {} }, setTimeout, console,
  };
  runInNewContext(source + '\n;globalThis.ui = { clearDocument, run, state };', sandbox);
  const textContainers = ['result-rows', 'stats', 'evidence-findings', 'header-rows', 'file-meta', 'scope-banner', 'list-count', 'manual-count', 'source-view'];
  for (const id of textContainers) get(id).textContent = 'SECRET_UNRELEASED_REPORT';
  get('evidence-title').textContent = 'SECRET_UNRELEASED_REPORT';
  get('evidence-dialog').open = true;
  sandbox.ui.state.source = { name: 'SECRET.dsd', bytes: new Uint8Array([1]) };
  sandbox.ui.state.current = { doc: { company: 'SECRET' } };
  return { ...sandbox.ui, get, textContainers };
}
function assertErased(ui) {
  for (const id of ui.textContainers) assert.equal(ui.get(id).textContent, '', id + ' must release document text');
  assert.equal(ui.get('evidence-title').textContent, '원문 근거');
  assert.equal(ui.get('evidence-dialog').open, false);
  assert.equal(ui.state.current, null);
  assert.equal(ui.state.source, null);
}
test('clear releases hidden findings, header, metadata and their row handlers', () => {
  const ui = app();
  ui.clearDocument();
  assertErased(ui);
  assert.equal(ui.get('results').hidden, true);
  assert.equal(ui.get('result-rows').handlersReleased, true);
});
test('a failed replacement also releases the previous report before reading', async () => {
  const ui = app();
  await ui.run(async () => { throw new Error('읽기 실패'); });
  assertErased(ui);
  assert.equal(ui.get('message').textContent, '읽기 실패');
  assert.equal(ui.get('results').hidden, true);
});
