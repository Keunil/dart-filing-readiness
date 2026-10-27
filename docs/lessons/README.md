<!-- agent-kit:managed — 원본 Keunil/agent-kit templates/docs/lessons/README.md. 여기서 고치지 않는다. -->
# 교훈

교훈 하나 = 파일 하나. **다음에 행동을 바꾸게 하는, 코드·문서만 읽어서는 안 보이는 발견**만 남긴다. 작업 일지, 차이 목록, 일회성 오타는 교훈이 아니다. 쓰는 법은 전역 스킬 `lesson-capture`, 서식은 [`_template.md`](_template.md).

## 찾기

```bash
python tools/agent/lessons.py <키워드>
```

`origin/main`에 머지된 교훈과 지금 worktree의 새 교훈을 함께 보여 준다. 다른 worktree에서 작업 중이어도 머지된 최신 교훈을 본다. 색인 파일은 두지 않는다(여러 브랜치가 동시에 고치면 충돌한다).

## 이름

`<YYYYMMDD>-<영문 소문자 요약>.md` — 예: `20261017-skill-path-rewrite-breaks-text.md`. 번호를 쓰지 않으므로 여러 worktree가 동시에 추가해도 겹치지 않는다.

## 상태

| status | 뜻 | 올리는 조건 |
|---|---|---|
| `observed` | 한 번 봤다 | — |
| `confirmed` | 다시 확인됐다 | 서로 다른 작업·자료 2곳 이상, 또는 재실행으로 재현. `confirmations`를 올린다 |
| `codified` | 스킬·규칙·코드로 옮겼다 | `promoted_to`에 옮긴 곳. 사용자 승인 뒤에만. 제품 코드는 머지된 뒤에만 |
| `retired` | 더는 맞지 않는다 | 지우지 말고 이유를 적는다 |

## 범위

- `scope: repo` — 이 저장소에만 해당한다.
- `scope: cross-repo` — 여러 저장소에 해당한다. agent-kit `lessons/`나 공용 스킬로 올릴 후보다.

## 흐름

1. 작업 중 발견 → worktree의 페어 INDEX `## 교훈 후보`에 한 줄
2. 마지막 리뷰 요청 전에 이 폴더에 파일로 옮기고 커밋한다. 근거에 작업 ID·커밋을 적고 리뷰 대상에 포함한다(`wt.py finish`가 이관과 대상 이후 변경을 확인한다)
3. 같은 교훈을 다시 보면 새 파일을 만들지 않고 기존 파일의 근거·`confirmations`·`last_confirmed`를 고친다
4. `confirmed`가 되면 어느 스킬의 어느 절에 넣을지 제안 → 사용자 승인 → 반영 → `codified`
