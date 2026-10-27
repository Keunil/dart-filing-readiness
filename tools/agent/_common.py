"""agent-kit 저장소 도구의 공통 함수. 원본: Keunil/agent-kit tools/repo/ (저장소에서 직접 고치지 않는다)."""
import json
import os
import subprocess
import sys
from pathlib import Path

DEFAULTS = {'remote': 'origin', 'base': 'main', 'lessons_dir': 'docs/lessons'}

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')


def git(*args, cwd=None, check=True, binary=False, input=None):
    r = subprocess.run(['git', *args], cwd=cwd, capture_output=True, input=input,
                       **({} if binary else {'text': True, 'encoding': 'utf-8', 'errors': 'replace'}))
    if check and r.returncode != 0:
        err = r.stderr if not binary else r.stderr.decode('utf-8', 'replace')
        raise SystemExit(f'git {" ".join(args)} 실패:\n{err.strip()}')
    return r


def toplevel(cwd=None):
    return Path(git('rev-parse', '--show-toplevel', cwd=cwd).stdout.strip())


def main_root(cwd=None):
    """주 작업 폴더(main 체크아웃). 어느 worktree에서 불러도 같은 값."""
    common = git('rev-parse', '--path-format=absolute', '--git-common-dir', cwd=cwd).stdout.strip()
    return Path(common).parent


def config(root=None):
    """.agent-kit.json — 지금 worktree의 것을 먼저, 없으면 주 작업 폴더의 것을 읽는다."""
    cfg = dict(DEFAULTS)
    roots = [Path(root)] if root else [toplevel(), main_root()]
    for r in roots:
        p = r / '.agent-kit.json'
        if p.exists():
            cfg.update(json.loads(p.read_text(encoding='utf-8')))
            break
    return cfg


def norm(data):
    """텍스트는 줄바꿈을 LF로 맞춰 비교한다(core.autocrlf 차이 무시). 바이너리는 그대로."""
    if data is None or b'\0' in data:
        return data
    return data.replace(b'\r\n', b'\n')


def read_blobs(ref, paths, cwd=None):
    """ref의 여러 파일 내용을 한 번에 읽는다. 없는 파일은 None."""
    out = {}
    if not paths:
        return out
    req = ''.join(f'{ref}:{p}\n' for p in paths).encode('utf-8')
    r = subprocess.run(['git', 'cat-file', '--batch'], cwd=cwd, input=req, capture_output=True)
    buf, i = r.stdout, 0
    for p in paths:
        nl = buf.index(b'\n', i)
        header = buf[i:nl].decode('utf-8', 'replace')
        i = nl + 1
        if header.endswith(' missing') or ' ' not in header:
            out[p] = None
            continue
        size = int(header.rsplit(' ', 1)[1])
        out[p] = buf[i:i + size]
        i += size + 1
    return out


def ls_tree(ref, prefix, cwd=None):
    r = git('ls-tree', '-r', '--name-only', ref, '--', prefix, cwd=cwd, check=False)
    return [l for l in r.stdout.splitlines() if l]


def worktrees(cwd=None):
    """git worktree list --porcelain 결과를 dict 목록으로."""
    items, cur = [], {}
    for line in git('worktree', 'list', '--porcelain', cwd=cwd).stdout.splitlines():
        if not line:
            if cur:
                items.append(cur)
            cur = {}
            continue
        k, _, v = line.partition(' ')
        cur[k] = v or True
    if cur:
        items.append(cur)
    for w in items:
        w['path'] = Path(w['worktree'])
        b = w.get('branch')
        w['branch_name'] = b[len('refs/heads/'):] if isinstance(b, str) else None
    return items


def same_path(a, b):
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))
