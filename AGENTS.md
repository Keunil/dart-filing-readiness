# dart-filing-readiness — 작업 규칙

과제 2 제출용 DART Filing Readiness. DSD를 브라우저에서 읽어 감사·검토보고서 구조를 점검하는 독립 정적 앱이다. 구조는 README.md.

Claude Code는 `CLAUDE.md`가 이 파일을 불러오고(`@AGENTS.md`), Codex는 이 파일을 바로 읽는다. 규칙은 여기 한 곳에 둔다.

## 저장소 규칙

- 앱 파일은 public/에 둔다. 원본 DSD와 분석 결과를 서버로 보내거나 저장하지 않는다.
- 실제 고객 자료, 사내 링크, 비밀값을 공개본에 넣지 않는다. 체험 자료는 합성 DSD만 쓴다.
- 2026-10-28 21시대 사용자 요청에 따라 로고 없이 PwC 디자인 가이드의 색상·여백·글꼴을 적용한다. 홈페이지는 실제 DSD 파일 선택 중심으로 구성하며 가상 체험과 불필요한 주기를 표시하지 않는다. 보고서는 요약·문제·기능·화면·AI 문제 해결·실제 실행 결과를 간결하게 담는다.
- 기존 점검 엔진 재사용 출처와 변경을 docs/provenance.md에 기록한다. 수동 확인을 자동 통과로 바꾸지 않는다.

## 저장소 스킬

`.claude/skills/`와 `.agents/skills/`에 같은 내용으로 둔다(공통 규칙 5절).

- (아직 없음)

<!-- agent-kit:begin v2026.10.20 -->
## 공통 작업 규칙 (agent-kit)

이 절은 모든 저장소가 같이 쓰는 규칙이다. 원본은 `Keunil/agent-kit`의 `common/AGENTS.block.md`이고, 여기서 직접 고치지 않는다. 바꿀 때는 agent-kit을 고친 뒤 `python <agent-kit>/tools/agentkit.py apply <저장소>`로 반영한다. 저장소 고유 규칙이 이 절과 다르면 저장소 규칙이 우선한다.

### 1. 작업 하나 = worktree 하나 = 브랜치 하나

- 주 작업 폴더(main 체크아웃)는 기준점이다. 코드를 직접 고치지 않고 `git pull --ff-only`만 한다.
- 작업은 `python tools/agent/wt.py new <작업 ID> --agent <claude|codex>`로 시작한다. 결과는 `.worktrees/<작업 ID>/`, 브랜치 `<claude|codex>/<작업 ID>`, 기준 `origin/main`이다. 작업 ID는 `<주제>-<YYYYMMDD>` 또는 `PAIR-<YYYYMMDD>-<주제>`로 쓴다.
- `.claude/worktrees/`와 `~/.codex/worktrees/`는 각 앱이 회수하는 영역이다. 페어 작업이나 오래 가는 작업에 쓰지 않는다.
- 임시 산출물은 `.tmp/<작업 ID>/`에 둔다. 머지 뒤 `wt.py clean`이 지운다(4절). 남길 증거는 그 전에 추적 위치로 옮긴다. `.worktrees/`와 `.tmp/`는 `.gitignore` 대상이다.
- `.tmp`를 `Remove-Item -Recurse`·`rm -rf`로 직접 지우지 않는다. 지우기가 거부되거나 `clean`이 "남음"을 알리면 다른 명령으로 우회하지 않는다. 남은 경로·크기·고객 자료 사본 여부를 사용자에게 보고하고 삭제를 맡긴다(`finish` 뒤에는 INDEX가 없다).

### 2. 작성–리뷰 페어 기록은 worktree 안에 둔다

- 기록 위치는 그 worktree의 `docs/agent-review/<작업 ID>/`다. `python tools/agent/wt.py pair <작업 ID>`가 양식(`docs/agent-review/_templates/`)으로 INDEX를 만든다.
  - `INDEX.md`: 목적, 완료 기준, 대상 커밋, 라운드 표, 남은 지적, 교훈 후보
  - `rNN-request.md`: 리뷰 요청(완료 기준, 범위, 이미 한 검증)
  - `rNN-review.md`: 리뷰 결과(지적 / 통과 / 근거 부족, 지적마다 재현 근거와 해결 조건)
  - `rNN-resolution.md`: 지적마다 수용·반박·보류와 이유
- 작성 Agent만 코드, INDEX, request, resolution을 쓴다. 리뷰 Agent는 읽기 전용이고 자기 `rNN-review.md`만 쓴다.
- 리뷰 대상 커밋을 고정해 적는다. 코드가 바뀌면 다시 리뷰한다. 요청 직전에 `python tools/agent/wt.py check <작업 ID>`로 기록이 대상 커밋에 들어갔는지 점검한다. 다른 모델 리뷰를 못 했으면 보고에 그대로 적는다.
- 리뷰 CLI가 실패했거나 판정이 없는 응답은 리뷰가 아니다. 리뷰 파일로 저장하지 않고 INDEX에 "검토 미실행(사유, 시각)"을 적는다.
- 소스 사본, 대용량 로그, 증거 번들은 넣지 않는다. 커밋 해시와 경로로 가리킨다. 비밀값, 고객 원본, 대화 전체도 넣지 않는다.
- 다른 worktree의 기록은 읽기만 한다.

### 3. 전파할 교훈만 저장소 공용으로 올린다

- 작업 중 다른 worktree, 다음 작업, 다른 세션에도 쓸 발견이 생기면 INDEX의 `## 교훈 후보`에 적는다.
- 마무리할 때 후보를 저장소 교훈 위치(`.agent-kit.json`의 `lessons_dir`, 기본 `docs/lessons/`)로 옮기고 근거에 작업 ID를 적는다. 폴더면 교훈 하나 = 파일 하나, 등록부 파일이면 항목 하나다. 형식은 `X 하면 Y 된다 → 그러니 Z 한다`, 숫자 근거, 해당하지 않는 경우, 확인 횟수다. 양식과 상태(observed → confirmed → codified → retired)는 교훈 위치의 README나 등록부 머리말을 따른다.
- 작업을 시작할 때 `python tools/agent/lessons.py <키워드>`로 관련 교훈을 찾는다. 이 명령은 `origin/main`의 교훈, 현재 worktree의 새 교훈, agent-kit의 여러 저장소 공통 교훈을 함께 보여 준다.
- 진행 중인 다른 작업에 바로 필요한 교훈은 교훈 파일만 담은 작은 PR로 먼저 머지한다.
- 두 번 이상 확인된 교훈은 어느 스킬의 어느 절에 넣을지 제안만 한다. 사용자가 승인하면 반영하고 `codified`로 바꾼다. 여러 저장소에 해당하는 교훈은 agent-kit `lessons/`나 공용 스킬로 올린다.

### 4. 마무리, 머지, 정리

1. 공용 교훈 파일까지 마지막 리뷰 대상에 포함하고, 통과한 뒤 `python tools/agent/wt.py finish <작업 ID>`를 실행한다. 대상 이후 기록 밖 변경과 교훈 후보 이관을 확인하고, 페어 폴더를 지우는 마무리 커밋을 만든다. 통과 뒤 코드·스킬·교훈을 고치면 새 라운드로 다시 검토한다. 커밋 메시지에 기록 원문 해시를 적는다. 원문은 `git show <해시>:docs/agent-review/<작업 ID>/INDEX.md`로 찾는다.
2. PR은 merge commit으로 머지한다. squash는 기록 원문 커밋을 main 이력에서 지우므로 쓰지 않는다.
3. 머지를 확인하면 바로 `python tools/agent/wt.py clean <작업 ID>`를 실행한다. worktree, 로컬 브랜치, 원격 브랜치, `.tmp/<작업 ID>/`를 지운다. 머지되지 않았거나 커밋 안 된 변경이 있으면 멈춘다.
4. 남은 worktree는 `python tools/agent/wt.py prune`으로 점검한다. 기본은 목록만 보여 주고, `--apply`를 붙여야 지운다.

### 5. Claude와 Codex가 같은 스킬을 본다

- 저장소 스킬은 `.claude/skills/`(Claude Code)와 `.agents/skills/`(Codex)에 바이트까지 같게 두고, 둘 다 Git으로 추적한다.
- 어느 쪽을 고쳐도 커밋 전에 `python tools/agent/sync_skills.py`를 실행한다. 바뀐 쪽을 다른 쪽으로 복사한다. 양쪽이 다르게 바뀌었으면 멈추고 알린다. `--check`가 실패하면 커밋하지 않는다.
- 저장소와 무관한 공용 스킬(`pair-review`, `worktree-flow`, `lesson-capture`, `test-strategy`, `karpathy-guidelines`)은 agent-kit이 원본이다. `~/.claude/skills/`와 `~/.agents/skills/`에 설치되므로 저장소에 사본을 두지 않는다.
- 여러 저장소가 쓰는 도메인 스킬은 agent-kit `skills/registry.json`에 정한 소유 저장소에서만 고친다. 다른 저장소의 사본은 `agentkit.py check`로 차이를 확인한다.
- 같은 지시를 세 번째 하고 있으면 스킬로 남긴다(`lesson-capture` 참고).
<!-- agent-kit:end -->
