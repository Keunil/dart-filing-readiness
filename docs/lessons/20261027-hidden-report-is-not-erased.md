---
title: 결과를 hidden으로 가리면 원문과 이벤트가 남는다 - 그러니 문서별 DOM도 제거한다
scope: repo
area: product
status: observed
confirmations: 1
first_seen: 2026-10-27 assignment2-20261027
last_confirmed: 2026-10-27 assignment2-20261027
applies_to: 브라우저 메모리에서 미공시 문서를 처리하는 점검 UI
promoted_to:
---

# 문서 비우기는 표시와 참조를 함께 비운다

## 무슨 일이 있었나

상태 객체와 원문 뷰를 비우고 결과를 hidden으로 가렸지만 결과행·근거·헤더·파일 메타에 문서 텍스트가 남았다. 독립 리뷰가 실제 초기화 함수를 실행해 재현했다. 수정 전 소스에 회귀 시험 2개가 실패하고 공용 초기화 수정 뒤 통과했다.

## 왜 그런가

hidden은 화면 표시만 바꾼다. DOM 텍스트와 행 이벤트 리스너가 가리키는 findings 객체의 수명은 그대로다.

## 그러니 이렇게 한다

문서별 초기화 경로를 하나로 두고 상태, 이미지 URL, 원문 요소, 결과행과 이벤트, 근거, 헤더, 요약을 제거한다. '비우기'뿐 아니라 새 파일 교체와 읽기 실패에서 같은 경로를 사용한다. 화면이 숨겨졌는지와 문서 텍스트가 제거됐는지를 별도로 단정한다.

## 해당하지 않는 경우

단순히 잠시 접고 다시 펼치는 UI에서는 DOM 보존이 의도일 수 있다. 여기서 제거는 앱의 살아 있는 참조를 놓는 것이며 브라우저 메모리의 물리적 덮어쓰기를 보증하지 않는다.

## 근거

- assignment2-20261027, dart-filing-readiness@6732e9d:public/app.js (문제)
- dart-filing-readiness@25712a1:public/app.js (공용 초기화 수정)
- tests/ui-reset.test.mjs, docs/validation.md (되돌림과 브라우저 재확인)
