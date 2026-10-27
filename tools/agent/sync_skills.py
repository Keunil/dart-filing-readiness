"""Claude(.claude/skills)와 Codex(.agents/skills)의 저장소 스킬을 바이트까지 같게 맞춘다.
원본: Keunil/agent-kit tools/repo/sync_skills.py

  python tools/agent/sync_skills.py            # 바뀐 쪽 → 다른 쪽으로 복사
  python tools/agent/sync_skills.py --check    # 다르면 실패(커밋 전 점검)
  python tools/agent/sync_skills.py --prefer claude|agents   # 양쪽이 다르게 바뀌었을 때 이길 쪽

어느 쪽이 바뀌었는지는 HEAD 커밋과 비교해 정한다. 한쪽만 바뀌었으면 그쪽을 복사하고(삭제 포함),
양쪽이 서로 다르게 바뀌었으면 멈춘다. 경로 문자열을 바꿔 쓰지 않는다(바꿔 쓰면 문장이 깨진다).
"""
import argparse
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # worktree에 __pycache__를 남기지 않는다(정리 때 '변경 있음'이 되지 않게)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import ls_tree, norm, read_blobs, toplevel  # noqa: E402

SIDES = {'claude': '.claude/skills', 'agents': '.agents/skills'}
SKIP_PARTS = {'__pycache__', '.DS_Store', 'Thumbs.db'}


def files(root, rel):
    base = root / rel
    if not base.is_dir():
        return {}
    out = {}
    for p in base.rglob('*'):
        if p.is_file() and not SKIP_PARTS.intersection(p.parts) and p.suffix != '.pyc':
            out[p.relative_to(base).as_posix()] = p.read_bytes()
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--prefer', choices=list(SIDES))
    a = ap.parse_args()
    root = toplevel()
    cur = {s: files(root, rel) for s, rel in SIDES.items()}
    head = {}
    for s, rel in SIDES.items():
        paths = ls_tree('HEAD', rel, cwd=root)
        blobs = read_blobs('HEAD', paths, cwd=root)
        head[s] = {p[len(rel) + 1:]: b for p, b in blobs.items()}
    names = sorted(set(cur['claude']) | set(cur['agents']))
    actions, conflicts = [], []
    for n in names:
        c, g = cur['claude'].get(n), cur['agents'].get(n)
        if norm(c) == norm(g):
            continue
        c_changed = norm(c) != norm(head['claude'].get(n))
        g_changed = norm(g) != norm(head['agents'].get(n))
        if c_changed and not g_changed:
            actions.append(('claude', n))
        elif g_changed and not c_changed:
            actions.append(('agents', n))
        elif a.prefer:
            actions.append((a.prefer, n))
        elif not c_changed and (g is None) != (c is None):
            # 한쪽에만 있고 HEAD에서도 그랬다(처음 미러를 만드는 경우): 있는 쪽을 복사한다.
            actions.append(('claude' if c is not None else 'agents', n))
        else:
            why = '양쪽이 다르게 바뀜' if c_changed else 'HEAD에서부터 다름'
            conflicts.append((n, why))
    if a.check:
        for src, n in actions:
            print(f'다름: {n} ({SIDES[src]} 쪽이 바뀜)')
        for n, why in conflicts:
            print(f'다름: {n} ({why})')
        if actions or conflicts:
            print('python tools/agent/sync_skills.py 로 맞춘 뒤 커밋한다.')
            sys.exit(1)
        print(f'스킬 동기화 OK ({len(names)}개 파일)')
        return
    for src, n in actions:
        dst = 'agents' if src == 'claude' else 'claude'
        sp, dp = root / SIDES[src] / n, root / SIDES[dst] / n
        if sp.exists():
            dp.parent.mkdir(parents=True, exist_ok=True)
            dp.write_bytes(sp.read_bytes())
            print(f'{SIDES[src]}/{n} → {SIDES[dst]}/')
        else:
            dp.unlink()
            print(f'삭제 전파: {SIDES[dst]}/{n}')
            for d in [dp.parent, *dp.parent.parents]:
                if d == root / SIDES[dst] or not d.is_dir() or any(d.iterdir()):
                    break
                d.rmdir()
    for n, why in conflicts:
        print(f'멈춤: {n} — {why}. 내용을 확인하고 --prefer claude|agents 로 정한다.')
    print(f'{len(actions)}개 맞춤, {len(conflicts)}개 보류')
    sys.exit(2 if conflicts else 0)


if __name__ == '__main__':
    main()
