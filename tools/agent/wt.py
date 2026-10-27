"""작업 하나 = worktree 하나 = 브랜치 하나. 원본: Keunil/agent-kit tools/repo/wt.py

  python tools/agent/wt.py new <작업 ID> [--agent claude|codex] [--base <ref>]
  python tools/agent/wt.py pair <작업 ID>            # docs/agent-review/<작업 ID>/INDEX.md 만들기
  python tools/agent/wt.py check <작업 ID>           # 리뷰 요청 직전 점검(기록 커밋·머리·판정·폭 없는 글자)
  python tools/agent/wt.py finish <작업 ID>          # 점검·교훈 확인 후 페어 기록을 지우는 마무리 커밋
  python tools/agent/wt.py clean <작업 ID>           # 머지 확인 후 worktree·브랜치·.tmp 정리
  python tools/agent/wt.py prune [--apply]           # 머지되고 손대지 않은 worktree 찾기(기본은 목록만)
  python tools/agent/wt.py list
"""
import argparse
import datetime as dt
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True  # worktree에 __pycache__를 남기지 않는다(정리 때 '변경 있음'이 되지 않게)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import config, git, main_root, same_path, worktrees  # noqa: E402

ID_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]*$')
PLACEHOLDER = re.compile(r'^\s*[-*]\s*(\(없음\)|없음|<.*>)\s*$')
# 셸이 풀어 버린 이스케이프 글이 남기는 폭 없는 글자(교훈 20261014-escape-text-decoded-into-zero-width-chars)
ZERO_WIDTH = {0x200B: 'ZWSP', 0x200C: 'ZWNJ', 0x200D: 'ZWJ', 0x2060: 'WJ', 0xFEFF: 'BOM', 0x00AD: 'SHY'}
CP949_SUFFIXES = ('.bas', '.cls', '.frm')  # VBA 원본은 CP949라 UTF-8로 풀면 엉뚱한 글자로 보인다
UNEXPANDED = re.compile(r'\$[A-Za-z_{]')  # Git Bash가 전개하지 않은 변수(교훈 20261014-git-bash-backslash-…)
META_LINE = re.compile(r'^\s*(?:[-*]\s*)?[^:：`]{1,40}[:：]\s*\S')  # 머리의 '키: 값' 줄(전각 콜론도)
REVIEW_FILE = re.compile(r'^r\d+-review\.md$')
REQUEST_FILE = re.compile(r'^r(\d+)-request\.md$')
HEADING = re.compile(r'^#{2,6}\s')
HEADER_MAX_LINES = 25  # 제목이 없는 파일도 앞 25줄까지만 머리로 본다
# 판정 줄은 줄 맨 앞(목록·인용·제목 표시 뒤)의 라벨로만 읽는다. 문장 중간의 "status: blocked"는 판정이 아니다.
_LABEL = r'(?:(?:최종|종합|final|overall)\s*)?(?:판정|verdict|result|status|judg(?:e)?ment)'
VERDICT_LINE = re.compile(r'^[\s>#*_+|-]*(?:\d+[.)]\s*)?' + _LABEL + r'[*_\s]*[:：|](.*)', re.I)
VERDICT_HEAD = re.compile(r'^[\s>#*_+-]*(?:\d+[.)]\s*)?' + _LABEL + r'[*_\s]*$', re.I)
# 판정 어휘(docs/agent-review/README.md). 한국어는 줄의 첫머리 낱말만 같은 뜻으로 읽는다("지적 없음"은 통과).
VERDICT_WORDS = re.compile(r'\b(issue|cleared|blocked)\b', re.I)
VERDICT_KO = ((re.compile(r'^(?:통과|지적\s*없음)'), 'cleared'),
              (re.compile(r'^(?:수정\s*필요|지적\s*(?:있음|\d+\s*건))'), 'issue'),
              (re.compile(r'^(?:근거\s*부족|보류|차단)'), 'blocked'))
# 요청서 대상 줄: "- 대상: <브랜치> @ <해시>". 해시는 코드 조각·괄호로 감싸도, 상단 25줄·첫 본문 ## 전의 표·번호 목록 안에서도 읽는다.
TARGET_SHA = re.compile(r'^[\s>*_+|-]*(?:\d+[.)]\s*)?(?:대상|target)[^:：|\n]*[:：|].*?@\s*[`\[(]?([0-9a-fA-F]{7,40})\b',
                        re.I | re.M)
CLI_SHORT_TEXT = 800  # 이보다 짧은 파일이 실패 문구를 담으면 판정이 있어도 CLI 실패 출력으로 본다
REVIEW_TARGET_SHA = re.compile(r'^[\s>*_+|-]*(?:\d+[.)]\s*)?(?:대상\s*커밋|(?:target|reviewed)\s+commit)[^:：|\n]*[:：|]\s*[`\[(]?([0-9a-fA-F]{7,40})\b', re.I | re.M)
# 검토자 CLI가 판정 없이 끝난 출력(교훈 20260916-reviewer-cli-failure-is-not-a-review)
CLI_FAILURES = ('hit your weekly limit', 'failed to authenticate', 'oauth session expired')


def check_id(task_id):
    if not ID_RE.match(task_id):
        raise SystemExit(f'작업 ID에는 영문·숫자·.-_만 쓴다: {task_id}')


def wt_path(root, task_id):
    return root / '.worktrees' / task_id


def find_wt(root, task_id):
    target = wt_path(root, task_id)
    for w in worktrees(root):
        if same_path(w['path'], target):
            return w
    raise SystemExit(f'worktree가 없다: {target}')


def base_ref(cfg, base=None):
    return base or f"{cfg['remote']}/{cfg['base']}"


def cmd_new(a):
    check_id(a.id)
    root, cfg = main_root(), config()
    path = wt_path(root, a.id)
    if path.exists():
        raise SystemExit(f'이미 있다: {path}')
    ignored = git('check-ignore', '-q', f'.worktrees/{a.id}', cwd=root, check=False).returncode == 0
    if not ignored:
        raise SystemExit('.worktrees/ 가 .gitignore에 없다. agent-kit apply를 먼저 실행한다.')
    branch = f'{a.agent}/{a.id}'
    if git('rev-parse', '--verify', '--quiet', f'refs/heads/{branch}', cwd=root, check=False).returncode == 0:
        raise SystemExit(f'브랜치가 이미 있다: {branch}')
    git('fetch', cfg['remote'], '--prune', cwd=root)
    ref = base_ref(cfg, a.base)
    git('worktree', 'add', str(path), '-b', branch, ref, cwd=root)
    git('branch', '--unset-upstream', branch, cwd=root, check=False)
    print(f'worktree: {path}\n브랜치: {branch} (기준 {ref} = {git("rev-parse", "--short", ref, cwd=root).stdout.strip()})')
    print(f'페어 기록이 필요하면: python tools/agent/wt.py pair {a.id}')


def cmd_pair(a):
    check_id(a.id)
    root = main_root()
    w = find_wt(root, a.id)
    wt = w['path']
    rec = wt / 'docs' / 'agent-review' / a.id
    tpl = wt / 'docs' / 'agent-review' / '_templates' / 'INDEX.md'
    if (rec / 'INDEX.md').exists():
        print(f'이미 있다: {rec / "INDEX.md"}')
        return
    if not tpl.exists():
        raise SystemExit(f'양식이 없다: {tpl}')
    head = git('rev-parse', '--short', 'HEAD', cwd=wt).stdout.strip()
    text = tpl.read_text(encoding='utf-8')
    text = (text.replace('<작업 ID>', a.id).replace('<브랜치>', w['branch_name'] or '(detached)')
            .replace('<기준 커밋>', head).replace('<YYYY-MM-DD>', dt.date.today().isoformat()))
    rec.mkdir(parents=True, exist_ok=True)
    (rec / 'INDEX.md').write_text(text, encoding='utf-8', newline='\n')
    print(f'만들었다: {rec / "INDEX.md"}')


def lesson_candidates(index_md):
    """INDEX.md의 '## 교훈 후보' 절에서 실제 후보 줄만 뽑는다."""
    out, on = [], False
    for line in index_md.splitlines():
        if line.startswith('## '):
            on = line.strip().startswith('## 교훈 후보')
            continue
        if on and line.strip().startswith(('-', '*')) and not PLACEHOLDER.match(line):
            out.append(line.strip())
    return out


def lessons_mentioning(wt, cfg, task_id):
    """교훈 폴더(파일 하나 = 교훈 하나) 또는 등록부 파일(lessons_dir가 .md)에서 작업 ID를 근거로 단 것."""
    d = wt / cfg['lessons_dir']
    files = [d] if d.is_file() else (list(d.rglob('*.md')) if d.is_dir() else [])
    return sorted(str(p.relative_to(wt)).replace('\\', '/') for p in files
                  if task_id in p.read_text(encoding='utf-8', errors='replace'))


def header_lines(text):
    """첫 소제목('## ' 이상) 앞, 또는 앞 25줄까지의 머리 줄(코드 블록 밖)을 (줄 번호, 줄)로."""
    out, fence = [], False
    for n, line in enumerate(text.splitlines(), 1):
        if n > HEADER_MAX_LINES:
            break
        if line.lstrip().startswith('```'):
            fence = not fence
            continue
        if fence:
            continue
        if HEADING.match(line):
            break
        out.append((n, line))
    return out


def header_problems(rel_name, text):
    """기록 머리: 전개 안 된 $변수, SHA256 값이 64자리 16진수 하나가 아닌 줄. '.worktrees$'는 머리에서는 어디서든,
    본문에서는 코드 조각·코드 블록 밖에서만 본다(이 결함을 설명하는 글이 따옴표로 인용할 수 있어야 한다)."""
    out = []
    head = {n for n, _ in header_lines(text)}
    fence = False
    for n, line in enumerate(text.splitlines(), 1):
        if line.lstrip().startswith('```'):
            fence = not fence
            continue
        probe = line if n in head else '' if fence else re.sub(r'`[^`]*`', '', line)
        if '.worktrees$' in probe:
            out.append(f'{rel_name}:{n}: 전개 안 된 경로 {line.strip()[:160]}')
    for n, line in header_lines(text):
        if not META_LINE.match(line):
            continue
        plain = re.sub(r'`[^`]*`', '', line)  # 코드 조각 안의 `$`(VBA `Format$` 등)는 본문이다
        if UNEXPANDED.search(plain) and '.worktrees$' not in line:
            out.append(f'{rel_name}:{n}: 전개 안 된 변수 {line.strip()[:160]}')
        kv = re.match(r'([^:：]*)[:：](.*)', line)
        key, value = kv.groups() if kv else (line, '')
        if re.search(r'sha-?256', key, re.I):
            # 값이 다음 줄에 이어지면(값이 없으면) 보지 않는다. 16진수 토큰은 모두 정확히 64자리여야 한다(Get-FileHash는 대문자).
            # 40자 넘는 영숫자라도 16진수가 아니면(긴 파일 이름 등) 해시로 보지 않는다.
            bad = [t for t in re.findall(r'[0-9A-Za-z\\]{40,}', value)
                   if re.fullmatch(r'[0-9a-fA-F]+', t.strip('\\')) and not re.fullmatch(r'[0-9a-fA-F]{64}', t)]
            if bad:
                out.append(f'{rel_name}:{n}: SHA256 값이 64자리 16진수가 아니다 {line.strip()[:160]}')
            elif len(value.replace('`', ' ').split()) == 1 \
                    and not re.search(r'(?<![0-9A-Za-z\\])[0-9a-fA-F]{64}(?![0-9A-Za-z])', value) \
                    and re.search(r'<[^>]*>|(?<![0-9A-Za-z])[0-9a-fA-F]{6,63}(?![0-9A-Za-z])', value):
                # 값이 토큰 하나뿐일 때만 본다(산문에 든 커밋 해시·숫자는 해시 값이 아니다)
                out.append(f'{rel_name}:{n}: SHA256 값이 자리표시자이거나 짧은 해시다 {line.strip()[:160]}')
    return out


def verdict_in(value):
    """판정 줄의 값에서 판정을 읽는다. 'issue'|'cleared'|'blocked', 양식 그대로면 'unfilled', 판정이 없으면 None."""
    value = re.sub(r'<!--.*?-->', ' ', value)
    value = re.sub(r'[*_`]+', ' ', value).strip()
    words = VERDICT_WORDS.findall(value)
    listed = len(words) > 1 and (not re.search(r'[\w가-힣]', VERDICT_WORDS.sub(' ', value)) or '중 하나' in value)
    if listed or re.match(r'<.*>$', value):
        return 'unfilled'  # "issue | cleared | blocked", "issue / cleared / blocked", "<판정>"
    for pat, verdict in VERDICT_KO:  # 한국어 첫머리 낱말이 영어 낱말보다 먼저다("통과(issue 0)"는 통과)
        if pat.match(value):
            return verdict
    if words:
        return words[0].lower()
    return None


def verdict_of(text):
    """리뷰 파일의 판정(issue|cleared|blocked). 줄 맨 앞 '판정|verdict|result|status|judgment:' 라벨(앞에 최종·종합·final·
    overall, 번호 목록, 표 칸 가능)의 값에서 읽는다. 한국어는 첫머리 낱말(통과·수정 필요·지적 없음·근거 부족·보류·차단)만
    같은 뜻으로 읽는다. 없거나 양식 그대로면 None. 판정 줄이 있는지 보는 점검이지 문장의 뜻을 따지지 않는다."""
    if text[:1] == chr(0xFEFF):  # UTF-8 BOM으로 시작하는 파일
        text = text[1:]
    lines = text.splitlines()
    for i, line in enumerate(lines):
        value = None
        m = VERDICT_LINE.match(line)
        if m and m.group(1).strip(' *_`'):
            value = m.group(1)
        elif VERDICT_HEAD.match(line.strip()):
            value = next((l for l in lines[i + 1:] if l.strip()), '')
        if value is None:
            continue
        verdict = verdict_in(value)
        if verdict == 'unfilled':
            return None  # 양식을 채우지 않았다
        if verdict:
            return verdict
    return None


def review_problems(rel_name, text):
    """리뷰 파일: 판정 줄이 있어야 하고, CLI 실패 문구는 판정이 없거나 파일이 짧을 때만 실패로 본다
    (검토가 그 문구를 인용할 수 있다)."""
    out = []
    low = text.lower()
    verdict = verdict_of(text)
    if verdict is None or len(text) < CLI_SHORT_TEXT:
        for s in CLI_FAILURES:
            if s in low:
                out.append(f"{rel_name}: 검토자 CLI 실패 문구('{s}') — 리뷰가 아니다. INDEX에 '검토 미실행'으로 적고 같은 라운드로 다시 요청한다")
    if verdict is None:
        out.append(f'{rel_name}: 판정 줄이 없다(`판정: issue` / `판정: cleared` / `판정: blocked` 중 하나)')
    return out


def zero_width_problems(wt, base, skip_prefix=None):
    """기준 이후 더한 줄의 폭 없는 글자. CP949 VBA 원본과 UTF-8이 아닌 줄, 파일 첫 글자의 BOM(UTF-8 BOM 파일),
    skip_prefix 아래 파일(마무리 커밋에서 지워질 기록)은 건너뛴다."""
    r = git('-c', 'core.quotepath=false', 'diff', '--no-color', '--no-ext-diff', '-U0', f'{base}...HEAD',
            cwd=wt, binary=True)
    out, path, n, in_head = [], None, 0, False
    for raw in r.stdout.split(b'\n'):
        if raw.startswith(b'diff --git '):
            in_head, path = True, None
            continue
        if in_head:
            if raw.startswith(b'+++ '):
                # 경로에 공백이 있으면 git이 뒤에 탭을 붙이고, 탭·따옴표가 있으면 따옴표로 감싼다
                p = raw[4:].rstrip(b'\r\t').decode('utf-8', 'replace')
                if len(p) > 1 and p[0] == p[-1] == '"':
                    p = p[1:-1]
                path = None if p == '/dev/null' else p[2:] if p.startswith('b/') else p
                if path and skip_prefix and path.startswith(skip_prefix):
                    path = None
            elif raw.startswith(b'@@ '):
                in_head = False
            if in_head:
                continue
        if raw.startswith(b'@@ '):
            m = re.match(rb'@@ -\S+ \+(\d+)', raw)
            n = int(m.group(1)) if m else 0
            continue
        if not raw.startswith(b'+') or path is None:
            continue
        if not path.lower().endswith(CP949_SUFFIXES):
            try:
                line = raw[1:].decode('utf-8')
            except UnicodeDecodeError:
                line = ''
            hits = [(i, ord(c)) for i, c in enumerate(line) if ord(c) in ZERO_WIDTH and not (ord(c) == 0xFEFF and i == 0 and n == 1)]
            if hits:
                names = '·'.join(sorted({ZERO_WIDTH[cp] for _, cp in hits}))
                i = hits[0][0]
                out.append(f"{path}:{n}: 폭 없는 글자 {names} …{ascii(line[max(0, i - 20):i + 21])}…")
        n += 1
    return out


def latest_request(rec):
    reqs = sorted((int(m.group(1)), p) for p in rec.glob('r*-request.md') if (m := REQUEST_FILE.match(p.name)))
    return reqs[-1][1] if reqs else None


def metadata_header(text):
    """Current metadata precedes the first body heading; quoted history is not a verdict."""
    lines, fence = [], False
    for line in text.splitlines()[:HEADER_MAX_LINES]:
        if line.strip().startswith(('```', '~~~')):
            fence = not fence
            continue
        if fence:
            continue
        if HEADING.match(line):
            break
        lines.append(line)
    return '\n'.join(lines)


def review_metadata(text):
    header = metadata_header(text)
    verdicts = {value for line in header.splitlines() if (value := verdict_of(line)) is not None}
    hashes = {m[1] for pattern in (TARGET_SHA, REVIEW_TARGET_SHA) for m in pattern.finditer(header)}
    return verdicts, hashes


def finish_review_problems(wt, rel, rec, texts):
    request = latest_request(rec)
    if request is None:
        return []
    review = request.with_name(request.name.replace('-request.md', '-review.md'))
    verdicts, reviewed = review_metadata(texts.get(review, ''))
    if verdicts != {'cleared'}:
        return [f'{rel}/{review.name}: 마지막 요청 라운드의 cleared 리뷰가 없다. '
                '리뷰 파일은 요청과 같은 rNN-review.md 이름, 상단 메타데이터의 판정은 cleared 하나여야 한다']
    if not reviewed:
        return [f'{rel}/{review.name}: 리뷰의 대상 커밋 해시가 없다. 검토자에게 새 라운드에서 상단 대상 메타데이터를 포함해 확인받는다']
    expected = TARGET_SHA.search(metadata_header(texts.get(request, '')))
    if expected:
        wanted = git('rev-parse', '--verify', '-q', f'{expected[1]}^{{commit}}', cwd=wt, check=False)
        actual = set()
        for sha in reviewed:
            value = git('rev-parse', '--verify', '-q', f'{sha}^{{commit}}', cwd=wt, check=False)
            actual.add(value.stdout.strip() if value.returncode == 0 else None)
        if wanted.returncode or actual != {wanted.stdout.strip()}:
            return [f'{rel}/{review.name}: 리뷰 대상과 최신 요청 대상 커밋이 다르다(또는 상단 대상이 모호하다)']
    return []


def request_problems(wt, rel, rec):
    """가장 나중 rNN-request.md의 대상 커밋(`@ <해시>`)이 있고, HEAD의 조상이며, 그 뒤 커밋이 기록만 바꾸는지."""
    p = latest_request(rec)
    if p is None:
        return []
    name = f'{rel}/{p.name}'
    m = TARGET_SHA.search(metadata_header(p.read_text(encoding='utf-8-sig', errors='replace')))
    if not m:
        return [f'{name}: 대상 줄에 커밋 해시가 없다. "- 대상: <브랜치> @ <해시>" 꼴로 처음 25줄·첫 본문 ## 전 상단에 적는다(그 범위 안에서는 해시를 코드 조각·괄호로 감싸도 되고 '
                '표 칸이어도 되며 코드 블록 안은 읽지 않는다). 기록을 담는 커밋이 아니라 그 앞의 코드 커밋이다']
    v = git('rev-parse', '--verify', '-q', f'{m.group(1)}^{{commit}}', cwd=wt, check=False)
    if v.returncode != 0:
        return [f'{name}: 대상 커밋 {m.group(1)} 이 저장소에 없다']
    sha = v.stdout.strip()
    if git('merge-base', '--is-ancestor', sha, 'HEAD', cwd=wt, check=False).returncode != 0:
        return [f'{name}: 대상 커밋 {sha[:12]} 이 HEAD의 조상이 아니다']
    changed = [f for f in git('-c', 'core.quotepath=false', 'diff', '--name-only', f'{sha}..HEAD', cwd=wt).stdout.split('\n')
               if f and not f.startswith(rel + '/')]
    if changed:
        return [f'{name}: 대상 {sha[:12]} 뒤에 기록 밖 파일 {len(changed)}개가 바뀌었다({", ".join(changed[:3])}). '
                '요청 뒤에는 대상 바이트를 고치지 않는다 — 보충은 새 라운드(r(NN+1)-request.md)로 대상을 다시 고정한다']
    return []


def run_checks(wt, cfg, task_id, *, committed=True, require_record=False, allow_zero_width=None, main=None):
    """리뷰 요청 직전(check)·마무리 전(finish) 점검. (문제 목록, --allow-zero-width로 넘긴 목록)을 돌려준다.
    committed=False(finish)면 지워질 기록의 폭 없는 글자만 제외한다. 미커밋 변경은 항상 검사한다.
    요청 대상 이후 코드 변경 검사는 두 경로 모두 수행한다."""
    rel = f'docs/agent-review/{task_id}'
    rec = wt / rel
    problems = []
    st = git('-c', 'core.quotepath=false', 'status', '--porcelain', '--untracked-files=all', cwd=wt).stdout.splitlines()
    mine = [l for l in st if l[3:].strip('"').startswith(rel + '/')]
    other = [l for l in st if l not in mine]
    if mine:
        problems.append(f'{rel} 에 커밋 안 된 기록이 있다(리뷰어는 대상 커밋만 읽는다):\n    ' + '\n    '.join(mine))
    if other:
        problems.append(f'기록 밖에 커밋 안 된 변경이 {len(other)}개 있다(요청 대상은 커밋된 바이트다): ' + ', '.join(l[3:] for l in other[:5]))
    if rec.exists() and git('cat-file', '-e', f'HEAD:{rel}/INDEX.md', cwd=wt, check=False).returncode != 0:
        problems.append(f'HEAD에 {rel}/INDEX.md 가 없다')
    if require_record and not rec.exists():
        hint = ' 주 작업 폴더에만 있다 — 기록은 이 worktree 안에 둔다.' if main and (main / rel).exists() else \
            f' `wt.py pair {task_id}`로 만들고 커밋한다.'
        problems.append(f'이 worktree에 {rel} 이 없다.' + hint)
    if rec.exists():
        texts = {}
        for p in sorted(rec.rglob('*.md')):
            name = str(p.relative_to(wt)).replace('\\', '/')
            try:
                text = p.read_text(encoding='utf-8-sig')
            except UnicodeDecodeError:
                problems.append(f'{name}: UTF-8 기록이 아니다')
                continue
            texts[p] = text
            problems += header_problems(name, text)
            if REVIEW_FILE.match(p.name):
                problems += review_problems(name, text)
        problems += request_problems(wt, rel, rec)
        if not committed:
            problems += finish_review_problems(wt, rel, rec, texts)
    zw = zero_width_problems(wt, base_ref(cfg), skip_prefix=None if committed else rel + '/')
    allowed = []
    if zw and allow_zero_width:
        allowed = zw
        print(f'폭 없는 글자 {len(zw)}곳 — 넘김: {allow_zero_width}')
        print('\n'.join('  ' + z for z in zw[:10]))
    else:
        problems += zw
    return problems, allowed


def cmd_check(a):
    check_id(a.id)
    root, cfg = main_root(), config()
    wt = find_wt(root, a.id)['path']
    problems, _ = run_checks(wt, cfg, a.id, require_record=True, allow_zero_width=a.allow_zero_width, main=root)
    head = git('rev-parse', 'HEAD', cwd=wt).stdout.strip()
    if problems:
        print('\n'.join('- ' + p for p in problems))
        raise SystemExit(f'점검 실패 {len(problems)}건 (HEAD {head[:12]})')
    print(f'점검 통과. HEAD(기록 포함): {head}\n'
          '요청서의 대상(@ 뒤)에는 기록을 담는 커밋이 아니라 그 앞의 코드 커밋을 적고, 리뷰어에게는 HEAD를 읽게 한다.')


def cmd_finish(a):
    check_id(a.id)
    root, cfg = main_root(), config()
    wt = find_wt(root, a.id)['path']
    rel = f'docs/agent-review/{a.id}'
    rec = wt / rel
    if not rec.exists():
        print(f'{rel} 이 없다. 정리할 페어 기록이 없다.')
        return
    if git('status', '--porcelain', '--', rel, cwd=wt).stdout.strip():
        raise SystemExit(f'{rel} 에 커밋 안 된 변경이 있다. 기록을 먼저 커밋한다.')
    if git('status', '--porcelain', '--', cfg['lessons_dir'], cwd=wt).stdout.strip():
        raise SystemExit(f"{cfg['lessons_dir']} 에 커밋 안 된 교훈이 있다. 먼저 커밋한다.")
    sha = git('log', '-1', '--format=%H', '--', rel, cwd=wt).stdout.strip()
    if not sha:
        raise SystemExit(f'{rel} 이 커밋된 적이 없다. 기록을 먼저 커밋한다.')
    problems, allowed = run_checks(wt, cfg, a.id, committed=False, allow_zero_width=a.allow_zero_width)
    if problems:
        print('\n'.join('- ' + p for p in problems))
    if problems and not a.skip_check:
        raise SystemExit(f'점검 실패 {len(problems)}건. 고쳐서 커밋하거나, 넘길 이유를 --skip-check "<이유>" 로 적는다.')
    idx = rec / 'INDEX.md'
    cands = lesson_candidates(idx.read_text(encoding='utf-8', errors='replace')) if idx.exists() else []
    moved = lessons_mentioning(wt, cfg, a.id)
    if cands and not moved and not a.skip_lessons:
        print('INDEX.md 교훈 후보:')
        for c in cands:
            print('  ' + c)
        raise SystemExit(f"교훈 후보가 있는데 {cfg['lessons_dir']} 에 '{a.id}'를 근거로 단 교훈 파일이 없다.\n"
                         "교훈으로 옮기거나, 옮기지 않는 이유를 --skip-lessons \"<이유>\" 로 적는다.")
    msg = [f'chore(agent-review): {a.id} 페어 기록 정리', '',
           f'기록 원문: {sha}', f'  git show {sha}:{rel}/INDEX.md',
           '교훈: ' + (', '.join(moved) if moved else '없음' + (f' ({a.skip_lessons})' if a.skip_lessons else ''))]
    # 기록은 이 커밋에서 지워지므로, 넘긴 이유와 항목(경로:줄)은 커밋 메시지에만 남는다
    if problems:
        msg.append(f'점검 넘김({len(problems)}건): {a.skip_check}')
        msg += ['  ' + p.splitlines()[0][:120] for p in problems[:10]]
    if allowed:
        msg.append(f'폭 없는 글자 넘김({len(allowed)}곳): {a.allow_zero_width}')
        msg += ['  ' + z.split(' …')[0][:120] for z in allowed[:10]]
    if a.dry_run:
        print('\n'.join(['[dry-run] git rm -r ' + rel, '[dry-run] 커밋 메시지:'] + ['  ' + m for m in msg]))
        return
    git('rm', '-r', '-q', '--', rel, cwd=wt)
    git('commit', '-q', '-m', '\n'.join(msg), '--', rel, cwd=wt)
    print('\n'.join(msg))
    print('\n다음: push → PR(merge commit, PR 본문에 위 "기록 원문" 줄을 붙인다) → 머지 확인 후 '
          f'python tools/agent/wt.py clean {a.id}')


def merged_state(root, cfg, branch, tip):
    """('ancestor'|'pr'|None, PR 번호). squash 머지는 gh로 PR head가 tip과 같은지 확인한다."""
    ref = base_ref(cfg)
    if git('merge-base', '--is-ancestor', tip, ref, cwd=root, check=False).returncode == 0:
        return 'ancestor', None
    if not branch or not shutil.which('gh'):
        return None, None
    r = subprocess.run(['gh', 'pr', 'list', '--head', branch, '--state', 'merged', '--json', 'number,headRefOid'],
                       cwd=root, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        return None, None
    for pr in json.loads(r.stdout or '[]'):
        if pr.get('headRefOid') == tip:
            return 'pr', pr['number']
    return None, None


def status_lines(path):
    # --no-optional-locks: status가 index를 다시 써서 idle 시각을 바꾸지 않게 한다.
    return [l for l in git('--no-optional-locks', 'status', '--porcelain', cwd=path, check=False).stdout.splitlines() if l]


def dirty(path):
    """실제 변경만. 줄바꿈(CRLF/LF)만 다른 수정은 내용이 같으므로 변경으로 보지 않는다."""
    lines = status_lines(path)
    eol_only = set()
    mods = [l[3:] for l in lines if l[:2] in (' M', 'M ', 'MM')]
    if mods:
        r = git('--no-optional-locks', 'diff', '--ignore-cr-at-eol', '--name-only', 'HEAD', '--', *mods, cwd=path, check=False)
        real = set(r.stdout.splitlines())
        eol_only = {m for m in mods if m not in real}
    return '\n'.join(l for l in lines if l[3:] not in eol_only)


def idle_hours(w):
    """마지막 git 활동(커밋·체크아웃·스테이징)과 최상위 항목 변경 뒤로 지난 시간."""
    gitdir = Path(git('rev-parse', '--absolute-git-dir', cwd=w['path']).stdout.strip())
    marks = (gitdir / 'index', gitdir / 'HEAD', gitdir / 'logs' / 'HEAD', w['path'])
    stamps = [p.stat().st_mtime for p in marks if p.exists()]
    stamps += [p.stat().st_mtime for p in w['path'].iterdir()]
    return (time.time() - max(stamps)) / 3600


def clean_one(root, cfg, w, task_id, dry_run=False, keep_remote=False):
    path, branch, tip = w['path'], w['branch_name'], w.get('HEAD')
    how, pr = merged_state(root, cfg, branch, tip)
    if not how:
        raise SystemExit(f'{task_id}: {branch or tip[:8]} 가 {base_ref(cfg)} 에 머지되지 않았다. 정리하지 않는다.')
    d = dirty(path)
    if d:
        raise SystemExit(f'{task_id}: 커밋 안 된 변경이 있다. 정리하지 않는다.\n{d}')
    steps = [f'git worktree remove {path}']
    if branch:
        # 머지 여부는 위에서 원격 기준으로 확인했다. -d는 지금 HEAD 기준이라 main 체크아웃이 뒤처지면 거부한다.
        steps.append(f'git branch -D {branch}')
        remote_has = git('ls-remote', '--heads', cfg['remote'], branch, cwd=root, check=False).stdout.strip()
        if remote_has and not keep_remote:
            steps.append(f"git push {cfg['remote']} --delete {branch}")
    tmp = root / '.tmp' / task_id
    if tmp.exists():
        steps.append(f'rmdir /s {tmp}')
    print(f'{task_id}: 머지 확인({"main 이력" if how == "ancestor" else f"PR #{pr}"}), 변경 없음')
    for s in steps:
        print(('  [dry-run] ' if dry_run else '  ') + s)
    if dry_run:
        return
    # 다른 세션이 먼저 지웠으면 건너뛴다.
    if not any(same_path(w['path'], path) for w in worktrees(root)):
        print(f'  {task_id}: 이미 정리됨(다른 세션) — 건너뜀')
        return
    # 남은 것이 줄바꿈만 다른 파일뿐이면(dirty()가 비었으므로) --force가 지우는 내용 변경은 없다.
    git('worktree', 'remove', *(['--force'] if status_lines(path) else []), str(path), cwd=root)
    if branch:
        git('branch', '-D', branch, cwd=root)
        if any(s.startswith('git push') for s in steps):
            git('push', cfg['remote'], '--delete', branch, cwd=root, check=False)
    if tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)
        if tmp.exists():
            # 잠긴 파일·정책 거부로 남은 것은 다른 명령으로 우회하지 않는다(교훈 20261014-tmp-delete-blocked-by-policy).
            size = 0
            for p in tmp.rglob('*'):
                try:
                    size += p.stat().st_size if p.is_file() else 0
                except OSError:
                    pass
            print(f'  남음: {tmp} ({size / 1048576:.1f}MB) — 삭제를 사용자에게 맡긴다. 고객 자료 사본이 있는지 함께 알린다.')
    git('worktree', 'prune', cwd=root)


def cmd_clean(a):
    check_id(a.id)
    root, cfg = main_root(), config()
    git('fetch', cfg['remote'], '--prune', cwd=root)
    clean_one(root, cfg, find_wt(root, a.id), a.id, a.dry_run, a.keep_remote)


def classify(root, w):
    p = w['path']
    if same_path(p, root):
        return 'main'
    if same_path(p.parent, root / '.worktrees'):
        return 'managed'
    s = str(p).replace('\\', '/').lower()
    if '/.claude/worktrees/' in s or '/.codex/worktrees/' in s:
        return 'tool'
    return 'other'


def cmd_prune(a):
    root, cfg = main_root(), config()
    git('fetch', cfg['remote'], '--prune', cwd=root)
    rows, cands = [], []
    for w in worktrees(root):
        kind = classify(root, w)
        if kind == 'main' or w.get('prunable'):
            continue
        exists = w['path'].exists()
        idle = idle_hours(w) if exists and kind == 'managed' else 0
        how, _ = merged_state(root, cfg, w['branch_name'], w.get('HEAD'))
        is_dirty = bool(dirty(w['path'])) if exists else False
        name = w['path'].name
        ok = kind == 'managed' and how and not is_dirty and idle >= a.idle_hours
        rows.append((kind, name, w['branch_name'] or '(detached)', 'merged' if how else '-',
                     'dirty' if is_dirty else 'clean', f'{idle:.0f}h', '정리 대상' if ok else ''))
        if ok:
            cands.append((w, name))
    for r in sorted(rows):
        print('  '.join(r))
    print(f'\n정리 대상 {len(cands)}개 (머지됨·변경 없음·{a.idle_hours}시간 이상 손대지 않은 .worktrees/ 항목). '
          '도구 관리(tool) worktree는 각 앱이 정리하므로 건드리지 않는다.')
    if not a.apply:
        if cands:
            print('지우려면 --apply')
        return
    for w, name in cands:
        clean_one(root, cfg, w, name, keep_remote=a.keep_remote)


def cmd_list(a):
    root = main_root()
    for w in worktrees(root):
        print(f"{classify(root, w):8} {w['path']}  {w['branch_name'] or '(detached)'}  {str(w.get('HEAD', ''))[:8]}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('new'); p.add_argument('id'); p.add_argument('--agent', choices=['claude', 'codex'], default='claude')
    p.add_argument('--base'); p.set_defaults(fn=cmd_new)
    p = sub.add_parser('pair'); p.add_argument('id'); p.set_defaults(fn=cmd_pair)
    p = sub.add_parser('check'); p.add_argument('id'); p.add_argument('--allow-zero-width', metavar='이유')
    p.set_defaults(fn=cmd_check)
    p = sub.add_parser('finish'); p.add_argument('id'); p.add_argument('--dry-run', action='store_true')
    p.add_argument('--skip-lessons', metavar='이유'); p.add_argument('--skip-check', metavar='이유')
    p.add_argument('--allow-zero-width', metavar='이유'); p.set_defaults(fn=cmd_finish)
    p = sub.add_parser('clean'); p.add_argument('id'); p.add_argument('--dry-run', action='store_true')
    p.add_argument('--keep-remote', action='store_true'); p.set_defaults(fn=cmd_clean)
    p = sub.add_parser('prune'); p.add_argument('--apply', action='store_true'); p.add_argument('--idle-hours', type=float, default=12)
    p.add_argument('--keep-remote', action='store_true'); p.set_defaults(fn=cmd_prune)
    p = sub.add_parser('list'); p.set_defaults(fn=cmd_list)
    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
