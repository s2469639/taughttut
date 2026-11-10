// 한 프레임의 관절 위치를 "몸 크기 기준"으로 정규화한 데이터.
// 사람마다 체형·카메라 거리가 달라도 비교할 수 있게
//   원점 = 두 어깨의 중점, 단위 = 어깨 너비, x = 사용자의 오른쪽이 +, y = 위가 +.

import type { RawLandmark } from '../utils/geometry'
import { toUserView } from '../utils/geometry'
import { POSE_INDEX, measureArms, type ArmMeasure } from './poseEvaluator'

export type JointName = 'rs' | 're' | 'rw' | 'ls' | 'le' | 'lw'
export interface Pt {
  x: number
  y: number
}

export interface Frame {
  /** 노래 시작 기준 시간(ms) */
  tMs: number
  /** 6개 관절이 모두 화면 안에 있고 신뢰도가 충분한가 */
  tracked: boolean
  joints: Record<JointName, Pt> | null
  arms: { right: ArmMeasure | null; left: ArmMeasure | null }
}

/** 어깨 너비가 화면 너비의 이 비율보다 작으면 사람이 너무 멀거나 옆을 보는 것으로 보고 추적 실패 처리 */
const MIN_SHOULDER_WIDTH_RATIO = 0.05

export function untrackedFrame(tMs: number): Frame {
  return { tMs, tracked: false, joints: null, arms: { right: null, left: null } }
}

export function buildFrame(
  landmarks: readonly RawLandmark[] | undefined,
  width: number,
  height: number,
  tMs: number,
): Frame {
  const arms = measureArms(landmarks, width, height, ['right', 'left'])
  if (!landmarks || arms.tracking.status !== 'ok' || !arms.right || !arms.left) return untrackedFrame(tMs)

  const p = (idx: number) => toUserView(landmarks[idx], width, height)
  const rs = p(POSE_INDEX.rightShoulder)
  const ls = p(POSE_INDEX.leftShoulder)
  const sw = Math.hypot(rs.x - ls.x, rs.y - ls.y)
  if (sw < width * MIN_SHOULDER_WIDTH_RATIO) return untrackedFrame(tMs)

  const mid = { x: (rs.x + ls.x) / 2, y: (rs.y + ls.y) / 2 }
  const norm = (pt: { x: number; y: number }): Pt => ({ x: (pt.x - mid.x) / sw, y: (mid.y - pt.y) / sw })

  return {
    tMs,
    tracked: true,
    joints: {
      rs: norm(rs),
      re: norm(p(POSE_INDEX.rightElbow)),
      rw: norm(p(POSE_INDEX.rightWrist)),
      ls: norm(ls),
      le: norm(p(POSE_INDEX.leftElbow)),
      lw: norm(p(POSE_INDEX.leftWrist)),
    },
    arms: { right: arms.right, left: arms.left },
  }
}
