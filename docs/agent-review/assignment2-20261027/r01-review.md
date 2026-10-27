# r01 소스 검토

- 대상: codex/assignment2-20261027 @ 6732e9d05e5e23da1c7077e439432f2f106312eb
- 판정: issue
- 검토자: Codex 서브 Agent, 작성자와 동일 모델의 별도 컨텍스트
- 범위: public/, tests/, tools/serve.mjs, vercel.json, .openai/hosting.json
- 실행: Node v24.19.0, node --test tests/engine.test.mjs tests/export.test.mjs

## 지적

### P2. 문서 비우기와 새 점검 초기화가 문서별 DOM을 남긴다

위치: public/app.js:42의 clearDocument, :61의 run 초기화.

문서를 점검하고 근거를 연 뒤 '문서 비우기'를 실행하면 state와 source-view는 비워지지만 result-rows, evidence-findings, header-rows, file-meta의 내용은 그대로 남는다. 결과는 hidden 속성으로 가려질 뿐이다. result-rows의 이벤트 리스너는 해당 행과 원문 인용이 들어 있는 findings 객체도 계속 붙잡는다. 새 파일을 읽기 시작하거나 파일 읽기가 실패할 때에도 같은 잔존 경로가 있다. 이는 화면의 '새로고침하거나 비우면 사라집니다' 안내와 맞지 않으며 미공시 보고서의 결과와 원문 인용이 문서 비우기 후에도 탭 메모리에 남게 한다.

재현: 고정 커밋의 app.js를 Node vm.SourceTextModule로 읽고 외부 의존성·DOM을 메모리 대역으로 제공했다. 네 문서별 컨테이너의 textContent를 SECRET으로 놓고 실제 clearDocument를 실행한 결과, results.hidden은 true였지만 네 컨테이너의 SECRET 텍스트가 전부 유지됐다. 제품 파일은 수정하지 않았다. UI 코드의 남은 DOM 경로가 분명하므로 별도 브라우저에서 원문 점검→근거 열기→닫기→비우기 후 같은 내용을 확인할 수 있다.

완료 조건: 결과행·근거·헤더·파일 메타·요약 등 문서별 DOM을 비우는 공용 초기화 경로를 두고 clearDocument와 새 점검 시작에 함께 적용한다. 문서 비우기 후 및 실패한 교체 점검 후 기존 문서 텍스트와 행 이벤트 리스너가 남지 않는 회귀 확인이 필요하다.

## 통과한 확인

- 자동 시험 9개를 직접 실행했다. 실패·취소·건너뜀은 0개다.
- 고정 소스에서 외부 네트워크 전송과 브라우저 저장 API 호출을 찾지 못했다. 점검은 브라우저 모듈에 있고 CSP에 connect-src 'none'이 있다.
- 프로필 지정은 비동기 파일 읽기 뒤의 동기 점검 직전에 적용되며, 각 결과의 설명 문자열이 해당 프로필로 고정된다. 동시 읽기 시험도 재실행했다.
- 지원 코드를 모르는 문서는 result:null로 제한하며 감사·검토보고서를 분리한다.
- CSV의 수식 접두 보호와 XLSX 문자열 셀·XML 이스케이프, 수동 확인 후 자동 오류 판정 보존 시험이 통과했다.
- 원문 화면은 textContent와 DOM 생성으로 만들고 원본의 임의 HTML이나 script를 삽입하지 않는다. 원문 그림도 포함된 바이트의 Blob URL만 사용한다.

## 검증 한계

이 라운드는 고정 소스와 메모리 시험에 한정한다. 브라우저 UI, 공개 URL, 실제 업무 자료, 보고서 PDF, 캡처, LearnUs 제출 및 현업 품질 승인은 검토하지 않았다. 다른 모델 리뷰는 수행하지 않았다. 검토 도중 작성자가 수정을 시작했으므로 이 판정은 git show로 읽은 고정 대상에만 적용되며 진행 중인 수정본은 포함하지 않는다.
