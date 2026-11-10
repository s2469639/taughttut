// 테스트 전용 도우미: 가상 랜드마크 만들기 (카메라 원본 좌표 기준)
import type { PoseDefinition } from '../data/poses'
import type { RawLandmark } from '../utils/geometry'
import { POSE_INDEX, evaluatePose, measureArms, requiredArms } from './poseEvaluator'

export const W = 1280
export const H = 720
export const DEG = Math.PI / 180

export type Pt = [number, number]
export interface ArmPts { rs?: Pt; re?: Pt; rw?: Pt; ls?: Pt; le?: Pt; lw?: Pt }

/**
 * 33개 랜드마크. 좌표는 "카메라 원본(거울 반전 전)" 기준입니다.
 * 원본에서는 사용자의 오른팔이 화면 왼쪽(x 작음), 왼팔이 화면 오른쪽(x 큼)에 있습니다.
 */
export function makeLandmarks(arms: ArmPts, visibility = 0.99): RawLandmark[] {
  const lms: RawLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility }))
  const set = (idx: number, p: Pt | undefined, fallback: Pt) => {
    const [x, y] = p ?? fallback
    lms[idx] = { x, y, visibility }
  }
  // 기본값: 두 팔을 자연스럽게 내린 상태
  set(POSE_INDEX.rightShoulder, arms.rs, [0.4, 0.5])
  set(POSE_INDEX.rightElbow, arms.re, [0.38, 0.7])
  set(POSE_INDEX.rightWrist, arms.rw, [0.38, 0.9])
  set(POSE_INDEX.leftShoulder, arms.ls, [0.6, 0.5])
  set(POSE_INDEX.leftElbow, arms.le, [0.62, 0.7])
  set(POSE_INDEX.leftWrist, arms.lw, [0.62, 0.9])
  return lms
}

/** 오른팔 ㄱ자: 윗팔은 바깥(원본 x 감소)으로 수평, 아랫팔은 위로 수직 */
export const RIGHT_L = { rs: [0.4, 0.5] as Pt, re: [0.25, 0.5] as Pt, rw: [0.25, 0.25] as Pt }
/** 왼팔 ㄱ자: 윗팔은 바깥(원본 x 증가)으로 수평, 아랫팔은 위로 수직 */
export const LEFT_L = { ls: [0.6, 0.5] as Pt, le: [0.75, 0.5] as Pt, lw: [0.75, 0.25] as Pt }

/** 아랫팔을 수직에서 바깥쪽으로 deg만큼 기울인 오른팔 손목 위치 */
export function rightWristTiltedOutward(deg: number): Pt {
  return [0.25 - (180 * Math.tan(deg * DEG)) / W, 0.25]
}

/** 포즈에 필요한 팔 기준으로 측정하고 판정까지 */
export function measureAndEvaluate(def: PoseDefinition, arms: ArmPts) {
  const m = measureArms(makeLandmarks(arms), W, H, requiredArms(def))
  return { m, ev: m.tracking.status === 'ok' ? evaluatePose(def, m) : null }
}
