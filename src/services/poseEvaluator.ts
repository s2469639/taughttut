// MediaPipe의 "관절 인식"과 텃팅 "자세 정답 판정"을 분리한 로직입니다.
// 입력은 좌표뿐이라 카메라 없이도 테스트할 수 있습니다.

import { JUDGE, type PoseDefinition } from '../data/poses'
import {
  angleAtDeg,
  angleDiffDeg,
  directionDeg,
  toUserView,
  type RawLandmark,
} from '../utils/geometry'

/**
 * MediaPipe Pose 인덱스.
 * 중요: RIGHT/LEFT 는 "사용자 본인의 몸" 기준입니다.
 * 카메라 원본 영상에서는 사용자의 오른팔이 화면 왼쪽에 보이지만,
 * 거울 화면에서는 오른쪽에 보입니다. 판정은 인덱스(몸 기준)로 하고,
 * 화면 표시만 거울 처리(geometry.toUserView)합니다.
 */
export const POSE_INDEX = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
} as const

export interface ArmMeasure {
  elbowAngleDeg: number
  /** 어깨→팔꿈치 방향 (거울 화면 기준, 0°=사용자 오른쪽, 90°=위) */
  upperArmDirectionDeg: number
  /** 팔꿈치→손목 방향 */
  forearmDirectionDeg: number
}

export type TrackingStatus = 'ok' | 'no-person' | 'out-of-frame' | 'unstable'

export interface TrackingReport {
  status: TrackingStatus
  message: string
}

export interface ArmsMeasurement {
  tracking: TrackingReport
  /** 오른팔 (판정 대상). tracking.status 가 ok 일 때만 있음 */
  right: ArmMeasure | null
  /** 왼팔 (디버그 표시용, 판정에 사용하지 않음). 좌표가 있으면 항상 계산 */
  left: ArmMeasure | null
}

const TRACKING_MESSAGES: Record<TrackingStatus, string> = {
  ok: '관절을 잘 추적하고 있어요',
  'no-person': '카메라 앞에 서 주세요',
  'out-of-frame': '상반신 전체(어깨~손목)가 화면에 보이도록 뒤로 물러나 주세요',
  unstable: '관절이 잘 안 보여요. 조명을 밝게 하고 팔이 가려지지 않게 해 주세요',
}

const FRAME_MARGIN = 0.01

function inFrame(lm: RawLandmark): boolean {
  return (
    lm.x >= -FRAME_MARGIN && lm.x <= 1 + FRAME_MARGIN && lm.y >= -FRAME_MARGIN && lm.y <= 1 + FRAME_MARGIN
  )
}

function measureArm(
  shoulder: RawLandmark,
  elbow: RawLandmark,
  wrist: RawLandmark,
  width: number,
  height: number,
): ArmMeasure | null {
  const s = toUserView(shoulder, width, height)
  const e = toUserView(elbow, width, height)
  const w = toUserView(wrist, width, height)
  const elbowAngle = angleAtDeg(s, e, w)
  const upper = directionDeg(s, e)
  const fore = directionDeg(e, w)
  if (elbowAngle === null || upper === null || fore === null) return null
  return { elbowAngleDeg: elbowAngle, upperArmDirectionDeg: upper, forearmDirectionDeg: fore }
}

/**
 * 33개 랜드마크에서 양팔을 측정합니다.
 * @param width,height 영상 픽셀 크기 (각도 왜곡 방지용 가로세로 비율 보정)
 */
export function measureArms(
  landmarks: readonly RawLandmark[] | undefined,
  width: number,
  height: number,
): ArmsMeasurement {
  const fail = (status: TrackingStatus): ArmsMeasurement => ({
    tracking: { status, message: TRACKING_MESSAGES[status] },
    right: null,
    left: null,
  })

  if (!landmarks || landmarks.length < 17 || width <= 0 || height <= 0) return fail('no-person')

  const rs = landmarks[POSE_INDEX.rightShoulder]
  const re = landmarks[POSE_INDEX.rightElbow]
  const rw = landmarks[POSE_INDEX.rightWrist]
  const ls = landmarks[POSE_INDEX.leftShoulder]
  const le = landmarks[POSE_INDEX.leftElbow]
  const lw = landmarks[POSE_INDEX.leftWrist]

  const left = measureArm(ls, le, lw, width, height)
  const rightJoints = [rs, re, rw]

  let status: TrackingStatus = 'ok'
  if (!rightJoints.every(inFrame)) {
    status = 'out-of-frame'
  } else if (rightJoints.some((j) => (j.visibility ?? 1) < JUDGE.minVisibility)) {
    status = 'unstable'
  }

  if (status !== 'ok') {
    return { tracking: { status, message: TRACKING_MESSAGES[status] }, right: null, left }
  }
  const right = measureArm(rs, re, rw, width, height)
  if (!right) return fail('unstable')
  return { tracking: { status: 'ok', message: TRACKING_MESSAGES.ok }, right, left }
}

// ───────────────────────── 자세 판정 ─────────────────────────

export type Verdict = 'perfect' | 'good' | 'adjust'

export interface PoseEvaluation {
  /** 0~100 */
  similarity: number
  verdict: Verdict
  /** 모든 항목이 허용 오차 안이면 true (유지 시간 측정 대상) */
  inTolerance: boolean
  /** 부호 있는 오차 (측정값 - 목표값) */
  errors: { elbowAngleDeg: number; upperArmDirectionDeg: number; forearmDirectionDeg: number }
  /** 사용자에게 보여줄 교정 안내 */
  hint: string
}

/** 허용 오차 이내면 1점, 허용 오차의 2배에서 0점이 되도록 선형 감소 */
function componentScore(absErr: number, tol: number): number {
  if (absErr <= tol) return 1
  return Math.max(0, 1 - (absErr - tol) / tol)
}

export function evaluatePose(def: PoseDefinition, m: ArmMeasure): PoseEvaluation {
  const { target, tolerance, weights } = def
  const errors = {
    elbowAngleDeg: m.elbowAngleDeg - target.elbowAngleDeg,
    upperArmDirectionDeg: angleDiffDeg(m.upperArmDirectionDeg, target.upperArmDirectionDeg),
    forearmDirectionDeg: angleDiffDeg(m.forearmDirectionDeg, target.forearmDirectionDeg),
  }
  const abs = {
    elbow: Math.abs(errors.elbowAngleDeg),
    upper: Math.abs(errors.upperArmDirectionDeg),
    fore: Math.abs(errors.forearmDirectionDeg),
  }

  const similarity =
    100 *
    (weights.elbowAngle * componentScore(abs.elbow, tolerance.elbowAngleDeg) +
      weights.upperArmDirection * componentScore(abs.upper, tolerance.upperArmDirectionDeg) +
      weights.forearmDirection * componentScore(abs.fore, tolerance.forearmDirectionDeg))

  const inTolerance =
    abs.elbow <= tolerance.elbowAngleDeg &&
    abs.upper <= tolerance.upperArmDirectionDeg &&
    abs.fore <= tolerance.forearmDirectionDeg

  // 한 항목이라도 허용 오차의 2배를 넘으면 "다른 동작"으로 보고 Good이 될 수 없음
  // (예: 팔꿈치는 90°지만 전완이 아래를 향한 자세)
  const grossMiss =
    abs.elbow > tolerance.elbowAngleDeg * 2 ||
    abs.upper > tolerance.upperArmDirectionDeg * 2 ||
    abs.fore > tolerance.forearmDirectionDeg * 2

  const verdict: Verdict = inTolerance
    ? 'perfect'
    : similarity >= JUDGE.goodSimilarity && !grossMiss
      ? 'good'
      : 'adjust'

  return { similarity, verdict, inTolerance, errors, hint: buildHint(errors, tolerance) }
}

/** 허용 오차 대비 가장 많이 벗어난 항목을 골라 안내 문장을 만듭니다. */
function buildHint(
  e: PoseEvaluation['errors'],
  tol: PoseDefinition['tolerance'],
): string {
  const ratios = [
    { key: 'elbow' as const, r: Math.abs(e.elbowAngleDeg) / tol.elbowAngleDeg },
    { key: 'upper' as const, r: Math.abs(e.upperArmDirectionDeg) / tol.upperArmDirectionDeg },
    { key: 'fore' as const, r: Math.abs(e.forearmDirectionDeg) / tol.forearmDirectionDeg },
  ]
  const worst = ratios.reduce((a, b) => (b.r > a.r ? b : a))
  if (worst.r <= 1) return '좋아요! 그대로 유지하세요'

  switch (worst.key) {
    case 'elbow':
      return e.elbowAngleDeg > 0 ? '팔꿈치를 조금 더 굽혀 보세요' : '팔꿈치를 조금 더 펴 보세요'
    case 'upper':
      // 방향 각도: 0°=바깥, 양수=위쪽으로 치우침
      return e.upperArmDirectionDeg > 0
        ? '팔꿈치를 어깨 높이까지 내려 주세요'
        : '팔꿈치를 어깨 높이까지 올려 주세요'
    case 'fore':
      // 90°=위. 양수=몸 안쪽(왼쪽)으로 기울어짐
      return e.forearmDirectionDeg > 0
        ? '손을 바깥쪽으로 세워 전완을 수직으로 맞춰 주세요'
        : '손을 몸 쪽으로 세워 전완을 수직으로 맞춰 주세요'
  }
}

// ───────────────────────── 유지 시간 측정 ─────────────────────────

export type HoldInput = 'in' | 'out' | 'untracked'

export interface HoldState {
  heldMs: number
  /** 목표 유지 시간을 채워 성공했는지 (reset 전까지 유지) */
  cleared: boolean
  /** 추적이 유예 시간을 넘어 끊겨 판정을 보류 중인지 */
  paused: boolean
}

/**
 * 자세 유지 시간을 재는 상태 기계.
 *  - 'in'        : 허용 범위 안 → 시간 누적
 *  - 'out'       : 범위 밖 → 즉시 0으로
 *  - 'untracked' : 추적 실패 → 유예 시간 동안은 시간을 멈추고(누적 X, 초기화 X),
 *                  유예를 넘기면 초기화하고 '보류(paused)' 표시
 */
export class HoldTracker {
  private heldMs = 0
  private cleared = false
  private lastNow: number | null = null
  private untrackedMs = 0

  constructor(
    private readonly holdDurationMs: number,
    private readonly graceMs: number = JUDGE.trackingGraceMs,
  ) {}

  update(nowMs: number, input: HoldInput): HoldState {
    const dt = this.lastNow === null ? 0 : Math.max(0, nowMs - this.lastNow)
    this.lastNow = nowMs

    let paused = false
    if (input === 'in') {
      this.untrackedMs = 0
      this.heldMs += dt
      if (this.heldMs >= this.holdDurationMs) this.cleared = true
    } else if (input === 'out') {
      this.untrackedMs = 0
      this.heldMs = 0
    } else {
      this.untrackedMs += dt
      if (this.untrackedMs > this.graceMs) {
        this.heldMs = 0
        paused = true
      }
    }
    return { heldMs: Math.min(this.heldMs, this.holdDurationMs), cleared: this.cleared, paused }
  }

  reset(): void {
    this.heldMs = 0
    this.cleared = false
    this.lastNow = null
    this.untrackedMs = 0
  }
}
