import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { analyzeDsd } from '../public/engine.js';

// Reads originals in place. Only anonymous counts leave the input directory.
// Usage: node tools/validate-private-dsd.mjs INPUT_DIR PROFILE_JSON NEW_OUTPUT_DIR
const [input, profilePath, output] = process.argv.slice(2);
if (!input || !profilePath || !output) throw new Error('INPUT_DIR PROFILE_JSON NEW_OUTPUT_DIR required');
const out = resolve(output);
const inside = relative(resolve('.tmp'), out);
if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('Output must be inside repository .tmp/');
const profile = JSON.parse(await readFile(profilePath, 'utf8'));
const files = (await readdir(input)).filter(name => /\.dsd$/i.test(name)).sort();
if (!files.length) throw new Error('No DSD inputs');
await mkdir(out); // Exclusive run directory: never overwrite earlier evidence.
const cases = [], rules = new Map();
for (const [index, filename] of files.entries()) {
  const id = `DSD-${String(index + 1).padStart(2, '0')}`;
  const bytes = await readFile(resolve(input, filename));
  const record = { id, bytes: bytes.length, inputSha256: createHash('sha256').update(bytes).digest('hex') };
  try {
    const analysis = await analyzeDsd(bytes, id + '.dsd', profile);
    record.code = analysis.scope.code;
    record.analyzed = Boolean(analysis.result);
    record.blocks = analysis.doc.blocks.length;
    record.counts = analysis.result?.counts ?? null;
    record.failedRules = analysis.result?.results.filter(row => row.status === 'fail').map(row => row.no) ?? [];
    for (const row of analysis.result?.results ?? []) {
      if (!rules.has(row.no)) rules.set(row.no, { no: row.no, item: row.item, statuses: {} });
      const counter = rules.get(row.no).statuses;
      counter[row.status] = (counter[row.status] ?? 0) + 1;
    }
  } catch {
    record.analyzed = false;
    record.error = 'read-or-analysis-failed'; // Never serialize original document text or paths.
  }
  cases.push(record);
}
const sourceSha256 = {};
for (const name of ['engine.js', ...((await readdir('public/core')).filter(n => n.endsWith('.js')).map(n => 'core/' + n))]) {
  sourceSha256['public/' + name] = createHash('sha256').update(await readFile('public/' + name)).digest('hex');
}
const result = { date: '2026-10-28', node: process.version, sourceSha256, expected: files.length,
  analyzed: cases.filter(c => c.analyzed).length, failed: cases.filter(c => c.error).length,
  unsupported: cases.filter(c => !c.analyzed && !c.error).length,
  totals: Object.fromEntries(['fail', 'warn', 'manual', 'pass', 'na'].map(status => [status, cases.reduce((sum, c) => sum + (c.counts?.[status] ?? 0), 0)])),
  rules: [...rules.values()], cases };
await writeFile(resolve(out, 'summary.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ expected: result.expected, analyzed: result.analyzed, failed: result.failed, unsupported: result.unsupported, totals: result.totals, rules: result.rules.filter(r => r.statuses.fail) }, null, 2));
if (result.failed || result.unsupported || cases.some(c => !c.blocks)) process.exitCode = 1;
