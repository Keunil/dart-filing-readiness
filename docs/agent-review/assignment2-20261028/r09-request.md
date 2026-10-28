# DSD 렌더링 수정 검토
- 대상: codex/assignment2-20261028 @ c18e1c05e912bdb6d5254a897b62ef81e66c4122
- 기준: a9c6c21b4ffe1d2a847d9c0c1fd06e395dbef694
- 허용 출력: r09-review.md 하나. 제품과 제출 문서는 수정하지 않는다.

## 사용자 요구
보고서는 현재 파일로 제출하므로 그대로 두고 DSD 원문 표시를 robotic-web과 비교해 수정한다. 제출 Word/PDF/캡처는 변경하지 않는다.

## 변경
robotic_web e4001fa46a0c487742e298fe9a88bc1193005065의 web/dsd-view.js와 web/checklist.css를 읽었다. JS는 동작이 같지만 .dv-* CSS가 누락되고 app.css의 width:auto!important가 덮어쓰고 있었다. public/dsd-view.css에 원문 글꼴·문단 여백·제목·고정 표 배치·테두리·이미지·쪽 구분 스타일을 이식하고 과도한 일반 표 CSS를 제거하였다. 좁은 화면에서는 원문을 강제 압축하지 않고 패널 안에서만 좌우 스크롤한다. 엔진·app.js·제출 문서는 변경하지 않았다.

## 완료 기준 및 검사
1. 원문 문단, 제목, COLGROUP 비율, 셀 정렬·병합, BORDER 유무와 쪽 나눔이 유지된다. 가로 스크롤은 원문 패널 안에서만 일어난다.
2. 원문 근거 연결과 비우기, 기존 판정 기능에 회귀가 없다.
3. 보고서 및 캡처 파일은 기준과 바이트가 같다.

tests/dsd-rendering.browser.mjs를 수정 전 코드에 실행해 문단 여백14px≠0px 실패를 확인했다. 수정 후 통과(600px 표, 열비율2:1, bordered1px/borderless0px, 모바일390px 페이지·322px 패널)했다. 첨부 실제28건 모두58행/원문표fixed·테두리1px/페이지오류0/모바일내부스크롤/닫기버튼/비우기 원문제거를 확인했다. 기존 자동시험11/11 통과, 실패·건너뜀0. 제출 문서와 캡처는 git diff가 없다.

## 실행 경로
로컬 서버는 http://127.0.0.1:4173 이다. NODE_PATH=C:/Users/kchoi072/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules 지정 후 C:/Users/kchoi072/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe tests/dsd-rendering.browser.mjs로 독립 실행할 수 있다. Node 시험은 같은 실행파일 --test tests/engine.test.mjs tests/export.test.mjs tests/ui-reset.test.mjs 이다. 직접 재실행 여부를 표시한다.

DSD 원문은 출력하지 않는다. .tmp/assignment2-20261028/dsd-render-results.json에 익명 집계만 있다. 필요하면 로컬 robotic_web CSS를 읽어서 옮긴 규칙과 비교한다. 결함·범위 위반·검증 누락을 중점으로 본다. 대상SHA와 판정: cleared/issue/blocked를 상단에 적는다.
