// FREESTYLE — 자세는 자유, "텃팅의 원칙"으로 점수를 매기는 모드
//
// ⚠️ 아래 기준값은 모두 "임시 기준"입니다. 실제 사람 데이터로 조율하기 전이며,
//    Pose Landmarker로 측정 가능한 것만 평가합니다 (손바닥·손가락·손목 굴림은 측정 불가).
//
// 좌표 규칙은 motionFrame과 같음: 원점=어깨 중점, 단위=어깨 너비, x 오른쪽(+), y 위(+).
// 속도 단위: 어깨 너비/초.

import type { ChallengeDef } from './challenge'

/** 프리스타일은 정해진 동작이 없고(moves 비어 있음) 같은 비트·같은 길이를 씁니다 */
export const FREESTYLE_DEF: ChallengeDef = {
  id: 'freestyle',
  title: 'FREESTYLE',
  subtitle: '자세는 자유 · 직각 · 멈춤 · 곧은 이동',
  bpm: 100,
  beatsPerSequence: 8,
  repeatCount: 4,
  countdownBeats: 4,
  endingBeats: 2,
  moves: [],
}

export const FREESTYLE_PARAMS = {
  /** 이 속도 이상이면 "움직이는 중" */
  moveOnSpeed: 1.2,
  /** 이 속도 이하로 떨어지면 "멈춤" 후보 */
  stopOnSpeed: 0.4,
  /** 멈춤이 이만큼(ms) 이어져야 히트로 인정 */
  minStopMs: 80,
  /** 움직임이 최소 이만큼(ms) 이어져야 함 */
  minMoveMs: 100,
  /** 손목이 최소 이만큼(어깨 너비) 움직여야 함 */
  minNetDisplacement: 0.3,
  /** 움직임이 너무 길면(ms) 히트 없이 포기 */
  maxMoveMs: 4000,
  /** 손목이 이 높이(y) 이상이어야 "쓰고 있는 팔". 팔을 내리고 있으면 직각성 점수를 공짜로 받으므로 제외 */
  activeWristMinY: -1.0,
  /** 윗팔·아랫팔이 수평/수직에서 이만큼 벗어나도 만점 */
  angleTolDeg: 20,
  /** 이동 경로가 수평/수직 방향으로 인정되는 범위 */
  pathAxisTolDeg: 20,
  /** 너무 작은 이동 단계는 떨림으로 보고 무시 (어깨 너비) */
  minStepDist: 0.01,
  /** 점수 가중치 (합계 1). 경로는 호를 그리는 회전 동작을 깎을 수 있어 낮게 둠 */
  weights: { shape: 0.55, sharp: 0.3, path: 0.15 },
  /** 날카로움: 속도가 정점의 절반 아래로 떨어진 뒤 멈추기까지 걸린 시간 */
  sharp: { fullScoreMs: 100, zeroScoreMs: 300 },
  /** 팔 길이가 갑자기 달라진 프레임(가려짐·추측 의심)을 걸러내는 장치 */
  boneGate: { window: 45, minSamples: 20, lo: 0.6, hi: 1.6 },
  /** 멈춤 감지에 필요한 최소 인식 속도(fps) */
  minFps: 12,
} as const

export type FreestyleParams = typeof FREESTYLE_PARAMS

export const FREESTYLE_PRINCIPLES = [
  {
    key: 'shape',
    title: '직각·직선',
    body: '멈췄을 때 윗팔(어깨~팔꿈치)과 아랫팔(팔꿈치~손목)이 수평이나 수직에 가까울수록 높아요. 어떤 모양이든 상관없어요.',
  },
  {
    key: 'stop',
    title: '딱 멈추기',
    body: '움직이다가 박자(카운트)에 맞춰 딱 멈추면 점수를 받아요. 천천히 서서히 멈추는 것보다 순간적으로 멈출수록 높아요.',
  },
  {
    key: 'path',
    title: '곧은 이동 (실험적)',
    body: '손이 곡선이 아니라 위아래·좌우 직선으로 움직인 비율이에요. 점수 비중은 작아요.',
  },
] as const

export const FREESTYLE_NOT_MEASURED = [
  '손바닥·손가락 모양, 손목 굴림',
  '동작이 "멋있는지", 창의성',
  '박자와 반 박자(&) 사이에서 멈춘 히트 (카운트에 맞춘 히트만 인정)',
  '카메라 쪽으로 내미는 앞뒤 움직임 (정면 2D만 봄)',
] as const
