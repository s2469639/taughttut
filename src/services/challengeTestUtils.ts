// 테스트 전용: 팔 각도에서 가상 랜드마크를 만들어 "가상 연기자"를 흉내 냅니다.
// ⚠️ 시범 키프레임을 보간한 가상 입력이라, 로직이 자기 일관적인지만 확인할 수 있습니다.
//    실제 사람의 움직임으로 검증한 것이 아닙니다.
import { DEMO_KEYS, type ChallengeDef } from '../data/challenge'
import { armPoints } from '../utils/armKinematics'
import type { RawLandmark } from '../utils/geometry'
import { beatMsOf, totalMsOf } from './challengeRunner'
import { demoAtBeat, type ArmAngles } from './demo'
import { buildFrame, untrackedFrame, type Frame } from './motionFrame'
import { POSE_INDEX } from './poseEvaluator'

const W = 1280
const H = 720
const SW = 256 // 어깨 너비(px)
const MID = { x: 640, y: 324 }
const ARM_LEN = 0.8 // 어깨 너비 단위

export type { ArmAngles }

/** 사용자 시점(y 위가 +, 어깨 너비 단위) 좌표 → 카메라 원본 랜드마크 */
function toLandmark(p: { x: number; y: number }): RawLandmark {
  const userX = MID.x + p.x * SW
  const userY = MID.y - p.y * SW
  return { x: 1 - userX / W, y: userY / H, visibility: 0.99 }
}

export function anglesToLandmarks(a: ArmAngles): RawLandmark[] {
  const lms: RawLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }))
  const rs = { x: 0.5, y: 0 }
  const ls = { x: -0.5, y: 0 }
  const r = armPoints(rs, a.right.upper, a.right.fore, ARM_LEN, ARM_LEN)
  const l = armPoints(ls, a.left.upper, a.left.fore, ARM_LEN, ARM_LEN)
  lms[POSE_INDEX.rightShoulder] = toLandmark(rs)
  lms[POSE_INDEX.rightElbow] = toLandmark(r.elbow)
  lms[POSE_INDEX.rightWrist] = toLandmark(r.wrist)
  lms[POSE_INDEX.leftShoulder] = toLandmark(ls)
  lms[POSE_INDEX.leftElbow] = toLandmark(l.elbow)
  lms[POSE_INDEX.leftWrist] = toLandmark(l.wrist)
  return lms
}

export function frameFromAngles(a: ArmAngles, tMs: number): Frame {
  return buildFrame(anglesToLandmarks(a), W, H, tMs)
}

/** 키프레임 보간 (시범 그림과 같은 함수) */
export const anglesAtBeat = demoAtBeat

export interface PerformOptions {
  fps?: number
  /** 연기가 박자보다 늦은 정도(ms). 음수면 빠름 */
  lateMs?: number
  /** 이 구간에서는 사람이 인식되지 않음 */
  untrackedBetween?: Array<[number, number]>
  /** 각도 대신 이 함수로 직접 팔 각도 지정 (노래 시간 ms 기준) */
  custom?: (songMs: number) => ArmAngles
}

/** 노래 전체 동안의 프레임 목록을 만듭니다 */
export function performFrames(def: ChallengeDef, opts: PerformOptions = {}): Frame[] {
  const fps = opts.fps ?? 30
  const step = 1000 / fps
  const beatMs = beatMsOf(def)
  const frames: Frame[] = []
  for (let t = 0; t <= totalMsOf(def); t += step) {
    if (opts.untrackedBetween?.some(([a, b]) => t >= a && t < b)) {
      frames.push(untrackedFrame(t))
      continue
    }
    const angles = opts.custom
      ? opts.custom(t)
      : anglesAtBeat(DEMO_KEYS, Math.max(0, (t - (opts.lateMs ?? 0)) / beatMs - def.countdownBeats))
    frames.push(frameFromAngles(angles, t))
  }
  return frames
}
