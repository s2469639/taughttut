// 리듬게임 "하이웨이" 원근 계산 (순수 함수). 좌표는 스테이지 크기에 대한 비율(0~1).
//  - 소실점(vp)에서 레인 양쪽 가장자리가 뻗어 나오는 직선 원근
//  - 타일이 다가올수록(남은 시간이 줄수록) 아래로 내려오고 커짐

export const HIGHWAY = {
  /** 소실점 높이 */
  vpY: 0.3,
  /** 가장 먼 곳(타일이 처음 보이는 곳) */
  farY: 0.45,
  /** 판정선 높이 */
  hitY: 0.84,
  /** 스테이지 바닥 */
  bottomY: 1.0,
  /** 판정선에서의 레인 반폭 */
  halfWidthHit: 0.3,
  /** 타일이 보이기 시작하는 시간(ms) — 판정선까지 남은 시간 */
  lookaheadMs: 2400,
} as const

/** 0 = 가장 먼 곳, 1 = 판정선, 1 초과 = 판정선을 지나감 */
export function depthProgress(timeToTargetMs: number, lookMs = HIGHWAY.lookaheadMs): number {
  return 1 - timeToTargetMs / lookMs
}

const EASE = 1.7

/** 진행도 → 화면 y (비율). 멀수록 천천히, 가까울수록 빠르게 내려오는 원근 효과 */
export function projectY(p: number): number {
  const { farY, hitY, bottomY } = HIGHWAY
  const q = Math.max(0, p)
  const y = farY + (hitY - farY) * Math.pow(q, EASE)
  return Math.min(bottomY, y)
}

/** 화면 y에서의 레인 반폭(비율). 소실점에서 0이고 판정선에서 halfWidthHit */
export function halfWidthAt(y: number): number {
  const { vpY, hitY, halfWidthHit } = HIGHWAY
  return (halfWidthHit * (y - vpY)) / (hitY - vpY)
}

/** y에서의 타일 크기 배율 (판정선 = 1) */
export function scaleAt(y: number): number {
  return halfWidthAt(y) / HIGHWAY.halfWidthHit
}
