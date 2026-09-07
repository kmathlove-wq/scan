# Pending Learning

- (Task 7, 2026-09-07) SVG 드래그 핸들을 매 pointermove 마다 재생성(`innerHTML=''`)하는
  구조에서는 move/up 리스너를 대상 엘리먼트나 svg가 아니라 `window`에 걸어야 드래그가
  안 끊긴다. `setPointerCapture`는 마우스 합성 이벤트에서 던질 수 있어 try/catch 필수.
  (검증: Task 7 드래그 테스트 통과. 재확인되면 MEMORY로 승격.)

- (Task 8, 2026-09-07) Playwright `setInputFiles`로 **같은 경로의 파일을 두 번** 넣으면
  Chromium이 `change` 이벤트를 다시 쏘지 않는다. 한 세션에서 파일 선택 경로를 반복
  테스트하려면 매번 `el.value = ''`로 비운 뒤 `setInputFiles`를 호출해야 한다.
  (검증: Task 8 removePage/movePage 테스트에서 2장 담기 재현. 재확인되면 MEMORY로 승격.)
- (Task 8, 2026-09-07) jscanify 1.4.0 `extractPaper`는 내부 `srcTri/dstTri/M` Mat 3개를
  해제하지 않는다(큰 `img`/`warpedDst`는 해제함). 페이지당 1회 호출·초소형이라 방치했으나,
  루프에서 부르면 누수. cornerPoints 키는 `*Corner`(`topLeftCorner` 등).

- (Task 9, 2026-09-07) OpenCV.js 4.9.0에서 `cv.MatVector` + `cv.merge` + `cv.mean`은
  정상 동작 — 1채널 32F Mat 3개를 push_back 해 32FC3로 merge, `cv.divide(rgbF, bg3, out, scale)`로
  조명 나눗셈이 잘 된다. 색 유지 자동보정(fAuto) 구현에 문제 없었다. `withMats`의
  `m.delete()`는 Mat과 MatVector 모두에 통한다. `new cv.Size(...)`/`new cv.Scalar(...)`는
  값 객체라 track/delete 불필요. (검증: filters 3개 + 색 유지 임시 테스트 통과.)
