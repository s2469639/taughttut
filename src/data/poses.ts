// 포즈 정의 데이터. 코드에 하드코딩하지 않고 여기서만 수정합니다.
//
// ※ 아래 포즈는 모두 "임시 테스트 포즈"입니다.
//   검증된 텃팅 시범 자료로 확인하기 전까지 전문 텃팅의 표준 동작이 아닙니다.
//
// 방향 기준 (거울 화면, 사용자 시점, 절대 각도):
//   0° = 화면 오른쪽, 90° = 위, 180° = 화면 왼쪽, -90° = 아래
//   → 사용자의 오른팔이 바깥으로 뻗으면 0°, 왼팔이 바깥으로 뻗으면 180°

export type ArmSide = 'right' | 'left'

/** 한쪽 팔의 목표 */
export interface ArmTarget {
  elbowAngleDeg: number
  /** 윗팔(어깨→팔꿈치) 방향 */
  upperArmDirectionDeg: number
  /** 아랫팔(팔꿈치→손목) 방향 */
  forearmDirectionDeg: number
}

export interface PoseTolerance {
  elbowAngleDeg: number
  upperArmDirectionDeg: number
  forearmDirectionDeg: number
}

/** 양팔 포즈의 좌우 균형 평가 설정 */
export interface BalanceSpec {
  /** 전체 점수에서 차지하는 비중 (0~1) */
  weight: number
  /** 좌우 팔꿈치 각도 차이 허용 범위 */
  elbowDiffTolDeg: number
  /** 좌우 손목 높이 차이 허용 범위 (평균 아랫팔 길이 대비 비율) */
  wristHeightTolRatio: number
}

export interface PoseDefinition {
  id: string
  name: string
  /** 쉬운 한글 이름 */
  koreanName: string
  difficulty: 1 | 2 | 3
  mode: 'static-pose'
  description: string
  /** 평가할 팔. 여기에 없는 팔은 자유(평가 안 함) */
  arms: Partial<Record<ArmSide, ArmTarget>>
  tolerance: PoseTolerance
  /** 팔 하나 안에서의 항목 가중치 (합계 1) */
  weights: { elbowAngle: number; upperArmDirection: number; forearmDirection: number }
  /** 양팔 포즈일 때만 */
  balance?: BalanceSpec
  holdDurationMs: number
  /** 검증된 자료로 확정되기 전이면 true */
  provisional: boolean
}

const TOLERANCE: PoseTolerance = {
  elbowAngleDeg: 15, // 확정값 (90° ±15°)
  upperArmDirectionDeg: 20, // 초기 가정값 - 테스트 후 조정 필요
  forearmDirectionDeg: 20, // 초기 가정값 - 테스트 후 조정 필요
}
const WEIGHTS = { elbowAngle: 0.4, upperArmDirection: 0.3, forearmDirection: 0.3 }

/** ㄱ자 한 팔: 윗팔은 옆으로 수평, 아랫팔은 위로 수직 */
const rightL: ArmTarget = { elbowAngleDeg: 90, upperArmDirectionDeg: 0, forearmDirectionDeg: 90 }
const leftL: ArmTarget = { elbowAngleDeg: 90, upperArmDirectionDeg: 180, forearmDirectionDeg: 90 }

export const RIGHT_ANGLE: PoseDefinition = {
  id: 'right-angle',
  name: 'Right Angle',
  koreanName: '오른팔 ㄱ자',
  difficulty: 1,
  mode: 'static-pose',
  description: '오른팔로 ㄱ자를 만드세요. 팔꿈치는 어깨 높이로 옆에, 아랫팔은 위로 세워요. 왼팔은 자유예요.',
  arms: { right: rightL },
  tolerance: TOLERANCE,
  weights: WEIGHTS,
  holdDurationMs: 700,
  provisional: true,
}

export const LEFT_ANGLE: PoseDefinition = {
  id: 'left-angle',
  name: 'Left Angle',
  koreanName: '왼팔 ㄱ자',
  difficulty: 1,
  mode: 'static-pose',
  description: '왼팔로 ㄱ자를 만드세요. 오른팔 자세의 좌우 반대예요. 오른팔은 자유예요.',
  arms: { left: leftL },
  tolerance: TOLERANCE,
  weights: WEIGHTS,
  holdDurationMs: 700,
  provisional: true,
}

export const FRAME: PoseDefinition = {
  id: 'frame',
  name: 'The Frame',
  koreanName: '양팔 프레임',
  difficulty: 2,
  mode: 'static-pose',
  description: '두 팔 모두 ㄱ자로 만들어 대칭인 틀(프레임)을 만드세요. 양쪽 높이를 맞춰요.',
  arms: { right: rightL, left: leftL },
  tolerance: TOLERANCE,
  weights: WEIGHTS,
  balance: { weight: 0.1, elbowDiffTolDeg: 15, wristHeightTolRatio: 0.25 },
  holdDurationMs: 700,
  provisional: true,
}

export const POSES: Record<string, PoseDefinition> = {
  [RIGHT_ANGLE.id]: RIGHT_ANGLE,
  [LEFT_ANGLE.id]: LEFT_ANGLE,
  [FRAME.id]: FRAME,
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
