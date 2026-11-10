// 각도·방향 계산용 순수 함수 모음 (카메라 없이 테스트 가능)

export interface Point {
  x: number
  y: number
}

/** MediaPipe가 주는 정규화 좌표 (0~1). x는 "카메라 원본" 기준(거울 반전 전). */
export interface RawLandmark {
  x: number
  y: number
  z?: number
  visibility?: number
}

const RAD_TO_DEG = 180 / Math.PI

/** 각도를 -180 ~ 180 범위로 맞춥니다. */
export function normalizeAngleDeg(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180
  if (d === -180) d = 180
  return d
}

/** 두 각도의 차이(a - b)를 -180 ~ 180 으로 돌려줍니다. */
export function angleDiffDeg(a: number, b: number): number {
  return normalizeAngleDeg(a - b)
}

/**
 * 점 B(팔꿈치)에서 A(어깨)와 C(손목)가 이루는 각도 (0~180°).
 * θ = acos( (BA·BC) / (|BA||BC|) )
 * 좌우 반전과 무관합니다.
 */
export function angleAtDeg(a: Point, b: Point, c: Point): number | null {
  const bax = a.x - b.x
  const bay = a.y - b.y
  const bcx = c.x - b.x
  const bcy = c.y - b.y
  const magBA = Math.hypot(bax, bay)
  const magBC = Math.hypot(bcx, bcy)
  if (magBA === 0 || magBC === 0) return null
  const cos = (bax * bcx + bay * bcy) / (magBA * magBC)
  return Math.acos(Math.min(1, Math.max(-1, cos))) * RAD_TO_DEG
}

/**
 * from -> to 방향을 "사람이 보는 화면" 기준 각도로 돌려줍니다.
 *   0° = 화면 오른쪽, 90° = 위, 180° = 왼쪽, -90° = 아래
 * (화면 y는 아래로 증가하므로 부호를 뒤집습니다)
 */
export function directionDeg(from: Point, to: Point): number | null {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return null
  // 정규화: 왼쪽(180°)이 -180°로 나오는 것을 방지
  return normalizeAngleDeg(Math.atan2(-dy, dx) * RAD_TO_DEG)
}

/**
 * 카메라 원본 좌표 -> "사용자 시점(거울 화면)" 픽셀 좌표.
 *  - x를 뒤집습니다 (거울 화면에서는 사용자의 오른팔이 화면 오른쪽에 보임)
 *  - 가로·세로 비율(aspect)을 반영해 각도가 찌그러지지 않게 합니다.
 */
export function toUserView(lm: RawLandmark, width: number, height: number): Point {
  return { x: (1 - lm.x) * width, y: lm.y * height }
}
