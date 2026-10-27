<!-- agent-kit:managed — 원본 Keunil/agent-kit templates/docs/agent-review/README.md. 여기서 고치지 않는다. -->
# 작성–리뷰 페어 기록

Agent의 "다 됐다"를 믿기 전에, 입력·판정·기록을 나눠 다시 확인한다. 규칙 요약은 AGENTS.md의 "공통 작업 규칙 (agent-kit)" 2~4절, 자세한 절차는 전역 스킬 `pair-review`에 있다.

## 어디에 쓰나

- 작업 하나 = worktree 하나 = 브랜치 하나. 기록은 그 worktree의 `docs/agent-review/<작업 ID>/`에 두고 브랜치와 함께 커밋한다.
- main에는 이 README와 `_templates/`만 있다. 머지 직전 `wt.py finish`가 페어 폴더를 지우고, 원문은 마무리 커밋 메시지에 적힌 해시로 찾는다.

```text
.worktrees/<작업 ID>/
└─ docs/agent-review/<작업 ID>/
   ├─ INDEX.md            작성자: 목적·완료 기준·대상 커밋·라운드·남은 지적·교훈 후보
   ├─ r01-request.md      작성자: 리뷰 요청
   ├─ r01-review.md       리뷰어: 지적 / 통과 / 근거 부족
   ├─ r01-resolution.md   작성자: 지적마다 수용·반박·보류
   └─ r02-…               고친 코드의 재검토
```

## 역할

| 누구 | 쓰는 것 | 쓰지 않는 것 |
|---|---|---|
| 작성 Agent | 코드, INDEX, rNN-request, rNN-resolution | rNN-review |
| 리뷰 Agent | 자기 rNN-review 하나 | 코드, INDEX, 다른 파일 |

완전한 읽기 전용 실행(예: `codex exec -s read-only`)이면 작성자가 리뷰 출력을 원문 그대로 `rNN-review.md`에 저장하고, 판정을 고쳐 쓰지 않는다. 판정이 있는 출력만 저장한다. 판정이 없거나 CLI가 실패한 출력은 리뷰가 아니므로 INDEX에 "검토 미실행"으로 적는다.

## 판정 어휘

- 리뷰: `issue`(지적) / `cleared`(통과) / `blocked`(근거 부족·대상 불일치)
- 리뷰 파일에는 줄 맨 앞에 `판정: <낱말>` 한 줄을 둔다. `wt.py check`가 이 줄을 읽는다(앞에 `최종`·`Final`을 붙이거나 `Verdict`·`Result`·`Judgment` 라벨, 번호 목록, 표 칸도 읽는다). 뜻은 보지 않고 판정 낱말이 있는지만 본다. 한국어로 쓰면 첫머리 낱말만 인정한다: 통과·지적 없음(cleared), 수정 필요·지적 N건(issue), 근거 부족·보류·차단(blocked).
- 지적마다: 심각도(P0~P3), 위치, 발생 조건, 기대/실제, 재현 근거, 해결 조건
- 대응: `accepted`(수용) / `rebutted`(반박, 반증 근거) / `deferred`(보류, 이유와 후속)
- 같은 쟁점이 새 근거 없이 두 번 오가면 `blocked`로 두고 사용자 판단을 요청한다.

## 순서

1. `python tools/agent/wt.py pair <작업 ID>` — INDEX 만들기, 완료 기준 먼저 적기
2. 구현과 자체 검증 → 코드를 커밋해 대상 고정 → `r01-request.md`(양식 `_templates/request.md`) 작성 → 기록 커밋 → `python tools/agent/wt.py check <작업 ID>`
   - 요청서의 대상 줄은 `- 대상: <브랜치> @ <해시>` 꼴이다. 처음 25줄·첫 본문 `##` 전의 상단 메타데이터에 둔다. 이 범위 안에서는 코드 조각·괄호·표 칸도 읽는다. 본문 `## 대상` 아래의 표는 읽지 않는다.
   - 요청서는 자기를 담는 커밋의 해시를 적을 수 없다. 해시는 그 앞의 코드 커밋이고, 기록 커밋은 그 뒤에 온다. check는 그 사이에 기록 밖 파일이 바뀌지 않았는지도 본다. 리뷰어는 HEAD를 읽는다.
   - 진행 중인 쌍이 옛 꼴의 요청서를 쓰고 있으면 가장 나중 요청서의 대상 줄을 이 꼴로 고쳐야 check가 통과한다.
3. 리뷰 Agent가 `r01-review.md` 작성(다른 세션·다른 모델 권장, 읽기 전용)
   - 파일명은 요청과 같은 번호·제로패딩의 `rNN-review.md` 하나다. 처음 25줄, 본문 `##` 시작 전 메타데이터에 `판정: cleared` 한 줄과 대상 커밋을 적는다. check의 옛 판정 파서는 제목 라벨+다음 줄 값도 읽지만 finish는 상단 한 줄 판정만 읽는다. 상단에는 예시 판정 줄을 두지 않는다. 본문의 이전 라운드 인용은 보지 않는다. 해시 없는 옛 리뷰는 작성자가 고쳐 쓰지 말고 검토자에게 새 라운드에서 메타데이터를 포함해 확인받는다.
4. `r01-resolution.md` → 고치면 `r02-request.md`로 재검토
5. 교훈 파일도 마지막 리뷰 대상에 포함한다. 최신 요청 라운드가 cleared이고 기록 밖 미커밋 변경과 대상 이후 변경이 없으면 → `python tools/agent/wt.py finish <작업 ID>` → PR(merge commit) → 머지 → `python tools/agent/wt.py clean <작업 ID>`. 통과 뒤 교훈을 새로 이관하면 새 라운드로 확인받는다.

## 넣지 않는 것

소스 사본·대용량 로그·증거 번들(커밋 해시와 경로로 가리킨다), 비밀값, 고객 원본, 대화 전체, 개인 절대 경로. 다만 요청서의 "해석기(절대 경로)"와 "리뷰어가 직접 돌릴 명령"은 재현에 필요하므로 절대 경로를 적는다.
