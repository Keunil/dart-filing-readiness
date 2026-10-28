// Run against tools/serve.mjs with NODE_PATH pointing to the Playwright installation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:4173');
  const observations = await page.evaluate(async () => {
    const { renderDsd } = await import('/core/dsd-view.js');
    const p = (text, attrs = {}) => ({ tag: 'P', attrs, children: [text] });
    const table = (border) => ({ tag: 'TABLE', attrs: { WIDTH: '600', BORDER: border }, children: [
      { tag: 'COLGROUP', attrs: {}, children: [400, 200].map(width => ({ tag: 'COL', attrs: { WIDTH: String(width) }, children: [] })) },
      { tag: 'TBODY', attrs: {}, children: [
        { tag: 'TR', attrs: {}, children: [
          { tag: 'TH', attrs: { COLSPAN: '2' }, children: ['표 제목'] },
        ] },
        { tag: 'TR', attrs: {}, children: [
          { tag: 'TD', attrs: { ALIGN: 'right' }, children: [p('첫 줄&cr;둘째 줄')] },
          { tag: 'TD', attrs: {}, children: ['100'] },
        ] },
      ] },
    ] });
    const nodes = [
      { tag: 'COVER-TITLE', attrs: {}, children: ['감사보고서'] },
      p('간격을 유지하는    원문'), table('1'),
      { tag: 'PGBRK', attrs: {}, children: [] }, table('0'),
    ];
    const doc = { body: { tag: 'BODY', attrs: {}, children: nodes }, blocks: nodes.map((node, i) => ({ node, i })) };
    const view = renderDsd(doc);
    const source = document.getElementById('source-view');
    source.replaceChildren(view.root);
    document.getElementById('evidence-dialog').showModal();
    const style = el => getComputedStyle(el);
    const first = source.querySelector('.has-border');
    const cells = first.rows[1].cells;
    const borderless = source.querySelector('.dv-table:not(.has-border)');
    return {
      paragraphMargin: style(source.querySelector('.dv-sheet > .dv-p')).marginTop,
      whitespace: style(source.querySelector('.dv-p')).whiteSpace,
      font: style(view.root).fontFamily,
      titleSize: style(source.querySelector('.dv-title')).fontSize,
      layout: style(first).tableLayout,
      tableFontSize: style(first).fontSize,
      cellPadding: style(cells[0]).padding,
      cellLineHeight: style(cells[0]).lineHeight,
      tableWidth: first.getBoundingClientRect().width,
      ratio: cells[0].getBoundingClientRect().width / cells[1].getBoundingClientRect().width,
      border: style(cells[0]).borderTopWidth,
      borderless: style(borderless.rows[1].cells[0]).borderTopWidth,
      align: style(cells[0].querySelector('p')).textAlign,
      breaks: source.querySelectorAll('.dv-pgbrk').length,
      explicitBreaks: cells[0].querySelectorAll('br').length,
      blocks: view.byBlock.size,
    };
  });
  assert.equal(observations.paragraphMargin, '0px');
  assert.equal(observations.whitespace, 'pre-wrap');
  assert.match(observations.font, /Batang|바탕/);
  assert.equal(observations.titleSize, '28px');
  assert.equal(observations.layout, 'fixed');
  assert.equal(observations.tableFontSize, '12px');
  assert.equal(observations.cellPadding, '2px 4px');
  assert.equal(observations.cellLineHeight, '18px');
  assert.ok(Math.abs(observations.tableWidth - 600) < 2);
  assert.ok(Math.abs(observations.ratio - 2) < 0.05);
  assert.equal(observations.border, '1px');
  assert.equal(observations.borderless, '0px');
  assert.equal(observations.align, 'right');
  assert.equal(observations.breaks, 1);
  assert.equal(observations.explicitBreaks, 1);
  assert.equal(observations.blocks, 4);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const source = document.getElementById('source-view');
    return { source: source.clientWidth, content: source.scrollWidth, page: document.documentElement.scrollWidth, view: innerWidth };
  });
  assert.ok(mobile.content >= 600, JSON.stringify(mobile));
  assert.ok(mobile.content > mobile.source);
  assert.equal(mobile.page, mobile.view);
  const scrolled = await page.evaluate(() => {
    const source = document.getElementById('source-view');
    source.scrollLeft = source.scrollWidth;
    const widths = [...source.querySelector('.has-border').rows[1].cells].map(c => c.getBoundingClientRect().width);
    return { left: source.scrollLeft, ratio: widths[0] / widths[1] };
  });
  assert.ok(scrolled.left > 0);
  assert.ok(Math.abs(scrolled.ratio - 2) < 0.05);
  console.log(JSON.stringify({ observations, mobile, passed: true }));
} finally {
  await browser.close();
}
