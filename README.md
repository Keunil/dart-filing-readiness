# DART Filing Readiness

공시팀의 수기 DSD 점검 부담과 공시 지연 리스크를 줄이기 위한 웹 기반 체크리스트입니다. 파일을 읽어 서식별 규칙을 적용하고 결과와 원문 위치를 함께 보여 줍니다.

- [웹 앱](https://dart-filing-readiness-keunil.rmsdlf0330.chatgpt.site)
- [최종 보고서](submission/과제2_2026521505_최근일_최종.docx)
- 작성: 최근일 · 2026521505

## 기능

DSD 파일 선택·끌어놓기, 감사인 기준 편집, 서식별 점검, 상태 필터·검색, 원문 위치 확인, 검토 표시, CSV·Excel 내보내기를 제공합니다. 원본과 결과는 브라우저 메모리에서 처리합니다.

## 실행

```powershell
node tools/serve.mjs
```

브라우저에서 http://127.0.0.1:4173 을 엽니다.

## 시험

```powershell
node --test tests/engine.test.mjs tests/export.test.mjs tests/ui-reset.test.mjs
```

자동 시험 11개 통과. 실제 DSD 28건의 1,624항목 실행 결과는 [익명 집계](docs/real-dsd-validation.json)에 기록했습니다. 테스트용 합성 자료는 tests/fixtures/에만 있으며 배포 앱에는 포함하지 않습니다.

## 구성

public/은 웹 화면과 점검 모듈, tests/는 회귀 시험, docs/는 개발·검증 기록, submission/은 최종 보고서입니다. 고객 원본 ZIP은 공개 저장소에 포함하지 않습니다.
