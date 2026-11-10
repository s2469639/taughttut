# TAUGHT TUT

*Learn the Angles. Feel the Beat.* — 웹캠으로 텃팅 자세를 배우는 웹서비스 (현재 **Phase 1: 동작 인식 MVP**)

## 실행

```bash
npm install
npm run dev        # http://localhost:5173  (디버그 패널: /?debug=1)
npm test           # 각도 계산·포즈 판정 단위 테스트
npm run build      # 타입 검사 + 빌드
```

카메라는 HTTPS 또는 localhost에서만 동작합니다. 영상과 관절 데이터는 브라우저 안에서만 처리되며 서버로 전송되지 않습니다.

## Phase 1 구현 범위

- 사용자가 버튼을 누른 뒤에만 카메라 권한 요청 (거부·장치 없음·사용 중·연결 끊김 안내)
- MediaPipe Pose Landmarker(Lite)로 어깨·팔꿈치·손목 추적, 거울 화면 표시
- **Right Angle** 포즈 1개 판정 (오른팔 ㄱ자: 상완 수평·전완 수직, 팔꿈치 90° ±15°, 0.7초 유지)
- Perfect / Good / Adjust 피드백, 교정 안내 문구
- 디버그 모드 (각도·방향·추적 여부·유사도·유지 시간·판정)

## 판정 기준 (`src/data/poses.ts`)

방향은 "거울 화면 기준, 0° = 사용자의 오른쪽(바깥), 90° = 위".

| 항목 | 목표 | 허용 오차 | 가중치 |
|---|---|---|---|
| 오른쪽 팔꿈치 각도 | 90° | ±15° (확정) | 40% |
| 상완 방향 (어깨→팔꿈치) | 0° | ±20° (초기 가정, 조정 필요) | 30% |
| 전완 방향 (팔꿈치→손목) | 90° | ±20° (초기 가정, 조정 필요) | 30% |

- **Perfect**: 세 항목 모두 허용 오차 이내 (이 상태로 0.7초 유지하면 성공)
- **Good**: 유사도 70 이상이고, 어떤 항목도 허용 오차의 2배를 넘지 않음
- **Adjust**: 그 외
- 왼팔은 평가하지 않음. 추적이 끊기면 0.5초 유예 후 판정 보류.

이 포즈는 MVP용으로 정의한 입문 동작이며, 전문 텃팅 표준 동작이 아닙니다. 위 수치는 테스트용 가정값입니다.

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
├── components/  CameraView, FeedbackPanel, DebugPanel
├── pages/       Practice (Phase 1 단일 화면)
├── services/    mediapipe.ts(모델 로딩), poseEvaluator.ts(측정·판정·유지시간)
├── data/        poses.ts (포즈 정의 데이터)
├── hooks/       useCamera, usePoseTracking
└── utils/       geometry.ts(각도 계산), drawPose.ts(오버레이)
```
