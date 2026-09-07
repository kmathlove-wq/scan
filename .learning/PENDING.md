# Pending Learning

- (Task 7, 2026-09-07) SVG 드래그 핸들을 매 pointermove 마다 재생성(`innerHTML=''`)하는
  구조에서는 move/up 리스너를 대상 엘리먼트나 svg가 아니라 `window`에 걸어야 드래그가
  안 끊긴다. `setPointerCapture`는 마우스 합성 이벤트에서 던질 수 있어 try/catch 필수.
  (검증: Task 7 드래그 테스트 통과. 재확인되면 MEMORY로 승격.)
