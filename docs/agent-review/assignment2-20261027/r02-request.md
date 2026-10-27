# assignment2-20261027 r02 최종 재검토 요청

- 대상: codex/assignment2-20261027 @ bb36148d5f1a1587a72cb927a6b5dbd665b9f4e3
- 요청자 / 리뷰어: Codex / 동일 모델 별도 컨텍스트 독립 Codex 서브 Agent
- 기준: r01 대상 6732e9d, DOM 수정 25712a1, 공개 배포 a28f0b1
- 답 형식: 판정 cleared / issue / blocked, 대상 전체 SHA, 실제 실행과 미검증 범위

## 요구사항과 완료 기준

1. 브라우저에서 DSD를 읽고 지원 서식별 점검·원문 근거·CSV/XLSX·수동 확인을 제공한다.
2. 파일과 결과를 서버 전송/저장하지 않고, 비우기와 새 점검 실패에서 이전 문서별 DOM까지 제거한다.
3. 과제 제출물인 공개 URL·GitHub·소개·캡처·AI 과정 기록을 보고서에 담고, 기존 구현 재사용과 이번 변경을 구분한다.
4. 수동 확인과 자동 판정, 합성 시험과 업무 품질 승인을 혼동하지 않는다.

## 볼 범위

r01 지적의 수정, 실제 app.js를 실행하는 UI 회귀 시험, 모바일 폭 CSS, source manifest 및 최종 보고서/검증 기록의 과장·누락을 본다. 공개 호스트의 보안 운영이나 회계적 판단, 실제 업무 자료 전체의 정확도, LearnUs 제출을 승인하는 검토가 아니다.

## 읽기 전용 재현

- C:/Users/keunil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --test tests/engine.test.mjs tests/export.test.mjs tests/ui-reset.test.mjs
- Python pypdf로 submission/DART-Filing-Readiness-과제2.pdf 10쪽과 모든 쪽 번호 확인.
- Python zipfile로 제출 묶음 12개 멤버의 파일 대조.
- git diff a28f0b1..bb36148 -- public 으로 공개 배포 제품 바이트 이후 변경 없음 확인.

## 작성자 검증 근거

Node 11/11, 실패·건너뜀 0. UI 회귀 2개는 수정 전 6732e9d 소스에서 실패하고 최종 소스에서 통과한다. 브라우저에서도 문서 비우기 뒤 회사명 잔존 false, 근거·헤더·원문·메타 텍스트 길이 0을 관측했다. 모바일 결과 페이지 폭=문서 폭=375px이며 표 내부에서만 스크롤한다.

Sites 버전 1 공개 배포 성공. 인증 쿠키 없는 HTTP에서 app.js/engine.js/app.css가 200이며 원본과 SHA-256 일치. 공개 주소의 오류 샘플 4/2/8/36/8 및 console error/warn 0을 확인했다.

PDF 10쪽, 화면 캡처 4개 로드, Poppler 렌더링 후 빈 쪽·넘침을 수정했다. 제출자 이름·학번은 사용자 응답 대기 중 공란이며 실제 업무 UAT·품질 승인·LearnUs 제출은 미실행이다.

## r01 대응

P2 DOM 잔존 수용. 두 초기화 경로를 discardReport()로 통합하고 문서별 요소와 행 이벤트 참조를 제거했다. 자세한 대응은 r01-resolution.md. 교훈은 docs/lessons/20261027-hidden-report-is-not-erased.md로 이관했다.
