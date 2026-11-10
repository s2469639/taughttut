// 포즈 정의 데이터. 코드에 하드코딩하지 않고 여기서만 수정합니다.
//
// 방향 기준 (거울 화면, 사용자 시점):  0° = 사용자의 오른쪽(바깥), 90° = 위
// ※ 이 포즈는 MVP용으로 직접 정의한 "입문 동작"이며, 전문 텃팅 표준 동작이 아닙니다.

export interface PoseTarget {
  /** 평가할 팔 */
  arm: 'right'
  elbowAngleDeg: number
  /** 상완(어깨→팔꿈치) 방향 */
  upperArmDirectionDeg: number
  /** 전완(팔꿈치→손목) 방향 */
  forearmDirectionDeg: number
}

export interface PoseTolerance {
  elbowAngleDeg: number
  upperArmDirectionDeg: number
  forearmDirectionDeg: number
}

export interface PoseWeights {
  elbowAngle: number
  upperArmDirection: number
  forearmDirection: number
}

export interface PoseDefinition {
  id: string
  name: string
  difficulty: 1 | 2 | 3
  mode: 'static-pose'
  description: string
  target: PoseTarget
  tolerance: PoseTolerance
  /** 유사도 가중치 (합계 1). 이 포즈는 왼팔을 평가하지 않으므로 좌우 균형은 제외 */
  weights: PoseWeights
  holdDurationMs: number
}

export const RIGHT_ANGLE: PoseDefinition = {
  id: 'right-angle',
  name: 'Right Angle',
  difficulty: 1,
  mode: 'static-pose',
  description: '오른팔로 ㄱ자를 만드세요. 상완은 옆으로 수평, 전완은 위로 수직. 왼팔은 자유.',
  target: {
    arm: 'right',
    elbowAngleDeg: 90,
    upperArmDirectionDeg: 0,
    forearmDirectionDeg: 90,
  },
  tolerance: {
    elbowAngleDeg: 15, // 확정값(90° ±15°)
    upperArmDirectionDeg: 20, // 초기 가정값 - 테스트 후 조정 필요
    forearmDirectionDeg: 20, // 초기 가정값 - 테스트 후 조정 필요
  },
  weights: { elbowAngle: 0.4, upperArmDirection: 0.3, forearmDirection: 0.3 },
  holdDurationMs: 700,
}

/** 판정 기준값 (초기 설계용, 실측 후 조정) */
export const JUDGE = {
  /** 이 점수 이상이면 Good */
  goodSimilarity: 70,
  /** 관절 신뢰도 하한 */
  minVisibility: 0.5,
  /** 추적이 끊겨도 유예하는 시간 */
  trackingGraceMs: 500,
} as const
