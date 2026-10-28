import { readZip } from './core/dsd-xlsx.js';
import { readDsd } from './core/dsd-read.js';
import { AUDITOR, headerRows as rowsOf, runChecklist, scopeOf } from './core/checklist-rules.js';

export const DEFAULT_PROFILE = Object.freeze({
  name: '가상회계법인', cik: '00999999', address: '서울특별시 중구 가상로 10', ceo: '김가상',
});
const MAX_FILE = 20 * 1024 * 1024;
const MAX_EXPANDED = 80 * 1024 * 1024;

function validProfile(value) {
  if (!value || typeof value !== 'object') throw new Error('감사인 프로필을 입력하세요.');
  const profile = {};
  for (const key of ['name', 'cik', 'address', 'ceo']) {
    const text = value[key];
    if (typeof text !== 'string' || !text.trim() || text.length > 200 || /[\u0000-\u001f\u007f]/.test(text)) {
      throw new Error('감사인 이름·식별값·주소·대표자를 올바르게 입력하세요.');
    }
    profile[key] = text.trim();
  }
  if (!/^\d{8}$/.test(profile.cik)) throw new Error('감사인 식별값은 숫자 8자리여야 합니다.');
  return profile;
}

/** No upload, storage, or network request occurs. Results preserve every manual check. */
export async function analyzeDsd(buffer, name = '보고서.dsd', profile = DEFAULT_PROFILE) {
  const selectedProfile = validProfile(profile);
  if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) throw new Error('DSD 파일의 바이트를 읽을 수 없습니다.');
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (bytes.byteLength > MAX_FILE) throw new Error('DSD 파일은 20MB 이하로 선택하세요.');
  let entries;
  try { entries = readZip(bytes); }
  catch { throw new Error('DSD ZIP 구조를 읽을 수 없습니다. DART 편집기에서 저장한 파일을 확인하세요.'); }
  if (entries.length > 1000) throw new Error('DSD ZIP 항목은 1,000개 이하만 지원합니다.');
  if (entries.reduce((sum, entry) => sum + entry.size, 0) > MAX_EXPANDED) throw new Error('DSD 해제 크기는 80MB 이하만 지원합니다.');
  const filenames = entries.map(entry => entry.name.toLowerCase());
  if (new Set(filenames).size !== filenames.length) throw new Error('DSD ZIP에 중복된 파일 이름이 있습니다.');
  const doc = await readDsd(bytes, String(name));
  const scope = scopeOf(doc);
  const headerRows = rowsOf(doc);
  if (scope.inScope !== true) return { doc, result: null, scope, headerRows };
  // Everything after profile assignment is synchronous, so simultaneous reads cannot mix profiles.
  Object.assign(AUDITOR, selectedProfile);
  const result = runChecklist(doc);
  return { doc, result, scope, headerRows };
}
