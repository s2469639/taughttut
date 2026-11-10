# TAUGHT TUT

*Learn the Angles. Feel the Beat.* — 웹캠으로 텃팅 자세를 배우는 웹서비스 (King Tutting 계열, 팔 중심)

## 실행

```bash
npm install
npm run dev        # http://localhost:5173  (디버그 패널: /?debug=1)
npm test           # 각도 계산·포즈 판정 단위 테스트
npm run build      # 타입 검사 + 빌드
```

카메라는 HTTPS 또는 localhost에서만 동작합니다. 영상과 관절 데이터는 브라우저 안에서만 처리되며 서버로 전송되지 않습니다.

## 현재 구현 범위

- 사용자가 버튼을 누른 뒤에만 카메라 권한 요청 (거부·장치 없음·사용 중·연결 끊김 안내)
- MediaPipe Pose Landmarker(Lite)로 어깨·팔꿈치·손목 추적, 거울 화면 표시
- 레슨 3개 (아래 표), 포즈 데이터 기반 판정 (양팔 지원)
- Perfect / Good / Adjust 피드백과 교정 안내, 목표 자세 미리보기, 디버그 모드
- 네오펑크 테마

아직 없음: 리듬 챌린지(박자·점수·콤보), 결과 카드·영상 녹화, 학습 진도 저장.

## 레슨과 포즈 — ⚠️ 모두 "임시 테스트 포즈"

검증된 텃팅 시범 자료를 확인하지 못해(작업 환경에서 외부 자료 사이트 접속 불가), 아래 포즈는
**MVP 테스트용으로 직접 정의한 것이며 전문 텃팅의 표준 동작이 아닙니다.** 화면에도 "임시 테스트 포즈"로 표시됩니다.
실제 기준 동작을 확보하면 `src/data/poses.ts`의 숫자만 바꾸면 됩니다.

| 레슨 | 방식 | 포즈 (임시) |
|---|---|---|
| 01 King Tut Basics (킹텃 기초) | 자세 유지 | 오른팔 ㄱ자 |
| 02 Box Tutting (박스 텃팅) | 자세 유지 | 양팔 프레임 (양팔 ㄱ자, 대칭) |
| 03 Tutting Flow (텃팅 플로우) | 순서대로 도달 | 오른팔 ㄱ자 → 왼팔 ㄱ자 → 양팔 프레임 |

Lesson 03은 지금은 박자 없이 "순서대로 도달 + 단계별 걸린 시간"만 봅니다. 박자(비트) 타이밍 평가는 리듬 챌린지 단계에서 추가합니다.

## 판정 기준 (`src/data/poses.ts`)

방향은 **거울 화면 기준 절대 각도**: 0° = 화면 오른쪽, 90° = 위, 180° = 화면 왼쪽.
(사용자의 오른팔이 바깥으로 뻗으면 0°, 왼팔이 바깥으로 뻗으면 180°)
용어: **윗팔** = 어깨→팔꿈치, **아랫팔** = 팔꿈치→손목.

| 항목 | 허용 범위 | 비고 |
|---|---|---|
| 팔꿈치 각도 (목표 90°) | ±15° | 확정값 |
| 윗팔 방향 | ±20° | 초기 가정값, 조정 필요 |
| 아랫팔 방향 | ±20° | 초기 가정값, 조정 필요 |
| 좌우 균형 (양팔 포즈만) | 팔꿈치 각도 차 15°, 손목 높이 차 25% | 초기 가정값 |

- 팔 하나의 점수: 팔꿈치 40% + 윗팔 방향 30% + 아랫팔 방향 30%. 양팔 포즈는 두 팔 평균 90% + 좌우 균형 10%.
- **Perfect**: 모든 항목이 허용 범위 이내 (이 상태로 0.7초 유지하면 성공)
- **Good**: 일치도 70 이상이고, 어떤 항목도 허용 범위의 2배를 넘지 않음
- **Adjust**: 그 외
- 평가하지 않는 팔은 자유. 추적이 끊기면 0.5초 유예 후 판정 보류.
- "손목 상대 위치"는 윗팔·아랫팔 방향과 같은 정보라 별도 점수로 이중 계산하지 않았습니다.
  (양팔 포즈에서는 좌우 손목 높이 차이로 반영)

## MediaPipe로 판정 가능 / 불가능

| 가능 (Pose Landmarker, 정면 2D) | 불가능·제외 |
|---|---|
| 어깨·팔꿈치·손목 위치, 팔꿈치 각도, 팔 방향 | 손가락 개별 동작, 손바닥 방향 (Hand Landmarker 필요) |
| 좌우 대칭·높이 차이 | 카메라 앞뒤로 움직이는 동작 (2D로는 각도 왜곡) |
| 자세 유지 시간, 순서·도달 시간 | 동작의 예술적 완성도, 전문가 수준 평가 |

## 좌우 처리 원칙

판정은 MediaPipe의 **몸 기준** 인덱스(오른쪽 어깨 12, 팔꿈치 14, 손목 16)를 사용하고, 화면 표시만 거울 처리합니다.
카메라 원본 좌표 → `toUserView()`(x 반전 + 가로세로 비율 보정) → 각도 계산.

## 모델·리소스

- `public/models/pose_landmarker_lite.task` — 공식 배포 파일
  (`storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/`)에서 받음.
  **라이선스·재배포 조건: 확인 필요** (작업 환경에서 공식 문서 사이트 접속 불가로 미확인)
- `public/wasm/` — `npm run dev/build` 시 `node_modules/@mediapipe/tasks-vision/wasm`에서 자동 복사 (git 제외).
  `@mediapipe/tasks-vision`은 Apache-2.0.
- 외부 CDN을 쓰지 않으므로 오프라인/사내망에서도 로딩됩니다.

## 폴더 구조

```
src/
├── components/  CameraView, FeedbackPanel, DebugPanel, PoseGuide(목표 자세 그림)
├── pages/       Practice (레슨 선택 + 카메라 + 피드백)
├── services/    mediapipe.ts(모델 로딩), poseEvaluator.ts(측정·판정·유지시간), lessonRunner.ts(레슨 진행)
├── data/        poses.ts(포즈 정의), lessons.ts(레슨 구성)
├── hooks/       useCamera, usePoseTracking
└── utils/       geometry.ts(각도 계산), drawPose.ts(오버레이)
```
