# Project Memory

검증된 교훈 (빌드 완료, 30/30 통과 시점 확정):

- **jscanify 1.4.0 `extractPaper`**: 내부 `srcTri`/`dstTri`/`M` Mat 3개를 해제하지 않는다
  (큰 `img`/`warpedDst`는 해제함). 페이지당 1회면 무시 가능하나 루프에서 부르면 누수.
  `cornerPoints` 키는 `*Corner`(`topLeftCorner` 등) — 내부 코너 객체 키
  `topLeft/topRight/bottomRight/bottomLeft`와 다르므로 경계에서만 변환한다.
- **`withMats` 정리**: `m.delete()`는 `cv.Mat`과 `cv.MatVector` 양쪽에 통한다.
  `new cv.Size(...)`/`new cv.Scalar(...)`는 값 객체라 track/delete 불필요.
- **OpenCV.js는 4.9.0으로 고정**(`docs.opencv.org/4.9.0/opencv.js`, ~10MB). 이 버전에서
  `MatVector`+`cv.merge`+`cv.mean`+`cv.divide`로 조명 나눗셈(색 유지 보정)이 정상 동작.
  10MB 스크립트를 정적 `<script>`로 넣으면 페이지 load가 늦어지므로 동적 주입.
- **Playwright `setInputFiles` 같은 파일 재선택**: Chromium이 동일 경로를 두 번 넣으면
  `change`를 다시 쏘지 않는다. 파일 선택 경로를 반복 테스트하려면 매번 `el.value=''` 후 호출.
- **라이브 오버레이 캔버스**: `overlay.width = clientWidth`를 매 틱 대입하면 캔버스가 통째로
  clear 된다 — 크기가 바뀔 때만(`!==`) 대입하고 clear는 명시적 `clearRect`에 맡긴다.
  `<video object-fit:contain>` 위 쿼드는 `videoDisplayRect = scale·min + 가운데정렬`로
  레터박스 보정해야 실제 종이와 안 어긋난다.
- **드래그 핸들(SVG 매 pointermove 재생성)**: move/up 리스너는 대상/‌svg가 아니라 `window`에
  건다(안 끊김). `setPointerCapture`는 마우스 합성 이벤트에서 throw 가능 → try/catch 필수.
- **전역 리스너로 화면 재구성**(`resize`→`openAdjust` 등): (1) 화면 이탈 시
  `removeEventListener` (2) 디바운스 콜백에도 `state.screen` 가드 — 둘 다 걸어야 낡은 상태
  재호출을 막는다.
- **resize 디바운스는 사용자의 진행 중 편집을 지우면 안 된다**(I6 회귀): `resize`가
  `openAdjust(_adjSource)`를 다시 부르면 사용자가 옮긴 핸들이 저장된 corners 로 되돌아간다
  (폰 회전 시 보정 날아감). 해결: `_remeasureAdjRects` — 현재 핸들을 `readHandles()`로
  SOURCE 좌표로 읽어 두고, 표시 좌표계(`_adjRects`)만 다시 잰 뒤 그 좌표를 새 화면에
  재투영한다. 측정 코드(`_measureAdjRects`)는 openAdjust rAF 와 공유. 추가로
  `_removeAdjResize`에서 디바운스 타이머(`clearTimeout`)까지 취소해야 — adjust 이탈 직후
  재편집으로 곧장 들어오면 낡은 타이머가 뒤늦게 터져 핸들을 흔든다.
- **재편집 진입 테스트**: 직전 보정 세션의 핸들 DOM 이 남아 있어 `.handle` 4개 대기만으로는
  openAdjust rAF 완료를 못 보장한다 — `readHandles()`가 저장 코너에 수렴할 때까지 기다린
  뒤에 `_setHandles`.
