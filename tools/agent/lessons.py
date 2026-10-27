"""저장소 교훈 찾기. origin/main(머지된 최신)과 현재 worktree의 새 교훈을 함께 본다.
원본: Keunil/agent-kit tools/repo/lessons.py

  python tools/agent/lessons.py                 # 전체 목록(retired 제외)
  python tools/agent/lessons.py 키워드 [키워드 …]  # 모든 키워드가 들어간 교훈만
  python tools/agent/lessons.py --status confirmed
  python tools/agent/lessons.py --no-fetch      # 원격을 새로 받지 않는다
  python tools/agent/lessons.py --no-kit        # agent-kit 공통 교훈(여러 저장소에 해당)은 빼고

agent-kit 공통 교훈은 환경 변수 AGENT_KIT(없으면 ~/Documents/agent-kit)의 lessons/에서 읽는다.
"""
import argparse
import os
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # worktree에 __pycache__를 남기지 않는다(정리 때 '변경 있음'이 되지 않게)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import config, git, ls_tree, main_root, norm, read_blobs, toplevel  # noqa: E402

SKIP = {'README.md', '_template.md'}


def front(text):
    m = re.match(r'^---\s*\n(.*?)\n---', text, re.S)
    meta = {}
    if m:
        for line in m.group(1).splitlines():
            k, _, v = line.partition(':')
            meta[k.strip()] = v.split(' #')[0].strip()
    if 'title' not in meta:
        h = re.search(r'^#\s+(.+)$', text, re.M)
        meta['title'] = h.group(1).strip() if h else ''
    return meta


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('keywords', nargs='*')
    ap.add_argument('--status')
    ap.add_argument('--all', action='store_true', help='retired 포함')
    ap.add_argument('--no-fetch', action='store_true')
    ap.add_argument('--no-kit', action='store_true', help='agent-kit 공통 교훈 빼기')
    a = ap.parse_args()
    root, here = main_root(), toplevel()
    cfg = config()
    ref = f"{cfg['remote']}/{cfg['base']}"
    ldir = cfg['lessons_dir'].strip('/')
    if not a.no_fetch:
        git('fetch', cfg['remote'], cfg['base'], '-q', cwd=root, check=False)
    if ldir.endswith('.md'):
        return register(a, root, here, ref, ldir)
    found = {}
    paths = [p for p in ls_tree(ref, ldir, cwd=root) if p.endswith('.md') and Path(p).name not in SKIP]
    for p, b in read_blobs(ref, paths, cwd=root).items():
        if b is not None:
            found[p] = (b, ref)
    base = here / ldir
    if base.is_dir():
        for f in base.rglob('*.md'):
            if f.name in SKIP:
                continue
            p = f.relative_to(here).as_posix()
            b = f.read_bytes()
            if p not in found or norm(found[p][0]) != norm(b):
                found[p] = (b, '이 worktree')
    rows = []
    for p, (b, src) in sorted(found.items()):
        text = b.decode('utf-8', 'replace')
        meta = front(text)
        st = meta.get('status', '?')
        if st == 'retired' and not a.all:
            continue
        if a.status and st != a.status:
            continue
        low = text.lower()
        if any(k.lower() not in low for k in a.keywords):
            continue
        rows.append(f"[{st}] {p} — {meta['title']}" + ('' if src == ref else f'  ({src})'))
    rows += kit_rows(a, here / ldir)
    print('\n'.join(rows) if rows else '해당 교훈 없음')
    print(f'\n({len(rows)}건, 기준 {ref} + 현재 worktree, 교훈 폴더 {ldir}/' + ('' if a.no_kit else ' + agent-kit 공통') + ')')


def kit_rows(a, own_dir):
    """agent-kit lessons/(여러 저장소에 해당하는 교훈). 이 저장소가 agent-kit이면 건너뛴다."""
    if a.no_kit:
        return []
    kit = Path(os.environ.get('AGENT_KIT') or Path.home() / 'Documents' / 'agent-kit') / 'lessons'
    if not kit.is_dir() or (own_dir.exists() and kit.resolve() == own_dir.resolve()):
        return []
    out = []
    for f in sorted(kit.glob('*.md')):
        if f.name in SKIP:
            continue
        text = f.read_text(encoding='utf-8', errors='replace')
        meta = front(text)
        st = meta.get('status', '?')
        if (st == 'retired' and not a.all) or (a.status and st != a.status):
            continue
        if any(k.lower() not in text.lower() for k in a.keywords):
            continue
        out.append(f"[{st}] agent-kit/lessons/{f.name} — {meta['title']}  (agent-kit)")
    return out


def register(a, root, here, ref, path):
    """등록부 파일 하나에 교훈을 목록(- **L-…**)으로 쌓는 저장소용. 항목 단위로 찾는다."""
    merged = (read_blobs(ref, [path], cwd=root).get(path) or b'').decode('utf-8', 'replace')
    local = (here / path).read_text(encoding='utf-8', errors='replace') if (here / path).exists() else ''
    entries, seen = [], set()
    for src, text in ((ref, merged), ('이 worktree', local)):
        section = ''
        for line in text.splitlines():
            if line.startswith('## '):
                section = line[3:].strip()
            elif line.lstrip().startswith(('- ', '* ')) and line.strip() not in seen:
                seen.add(line.strip())
                entries.append((section, line.strip(), src))
    rows = [f"[{sec}] {e[:160]}" + ('' if src == ref else f'  ({src})') for sec, e, src in entries
            if all(k.lower() in (sec + e).lower() for k in a.keywords)]
    rows += kit_rows(a, here / Path(path).parent)
    print('\n'.join(rows) if rows else '해당 교훈 없음')
    print(f'\n({len(rows)}건, 기준 {ref} + 현재 worktree, 등록부 {path}' + ('' if a.no_kit else ' + agent-kit 공통') + ')')


if __name__ == '__main__':
    main()
