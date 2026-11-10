// MediaPipe의 "관절 인식"과 텃팅 "자세 정답 판정"을 분리한 로직입니다.
// 입력은 좌표뿐이라 카메라 없이도 테스트할 수 있습니다.

import { JUDGE, type ArmSide, type PoseDefinition } from '../data/poses'
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
  /** 손목의 화면 y 위치(픽셀, 아래로 증가) — 좌우 균형 비교용 */
  wristYPx: number
  /** 아랫팔 길이(픽셀) — 비율 계산용 */
  forearmLenPx: number
}

export type TrackingStatus = 'ok' | 'no-person' | 'out-of-frame' | 'unstable'

export interface TrackingReport {
  status: TrackingStatus
  message: string
}

export interface ArmsMeasurement {
  tracking: TrackingReport
  /** 오른팔. 판정에 필요한 팔이 추적 실패면 null (필요 없는 팔은 좌표만 있으면 항상 계산) */
  right: ArmMeasure | null
  /** 왼팔. 위와 동일 */
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
  return {
    elbowAngleDeg: elbowAngle,
    upperArmDirectionDeg: upper,
    forearmDirectionDeg: fore,
    wristYPx: w.y,
    forearmLenPx: Math.hypot(w.x - e.x, w.y - e.y),
  }
}

/**
 * 33개 랜드마크에서 양팔을 측정합니다.
 * @param width,height 영상 픽셀 크기 (각도 왜곡 방지용 가로세로 비율 보정)
 * @param required 이번 포즈 판정에 필요한 팔. 이 팔들이 화면 밖이거나 신뢰도가 낮으면 추적 실패로 봅니다.
 */
export function measureArms(
  landmarks: readonly RawLandmark[] | undefined,
  width: number,
  height: number,
  required: readonly ArmSide[] = ['right'],
): ArmsMeasurement {
  const fail = (status: TrackingStatus): ArmsMeasurement => ({
    tracking: { status, message: TRACKING_MESSAGES[status] },
    right: null,
    left: null,
  })

  if (!landmarks || landmarks.length < 17 || width <= 0 || height <= 0) return fail('no-person')

  const joints: Record<ArmSide, [RawLandmark, RawLandmark, RawLandmark]> = {
    right: [landmarks[POSE_INDEX.rightShoulder], landmarks[POSE_INDEX.rightElbow], landmarks[POSE_INDEX.rightWrist]],
    left: [landmarks[POSE_INDEX.leftShoulder], landmarks[POSE_INDEX.leftElbow], landmarks[POSE_INDEX.leftWrist]],
  }

  const requiredJoints = required.flatMap((side) => joints[side])
  let status: TrackingStatus = 'ok'
  if (!requiredJoints.every(inFrame)) {
    status = 'out-of-frame'
  } else if (requiredJoints.some((j) => (j.visibility ?? 1) < JUDGE.minVisibility)) {
    status = 'unstable'
  }

  const measure = (side: ArmSide): ArmMeasure | null => {
    // 판정에 필요한 팔이 추적 실패면 값을 주지 않음 (잘못된 값으로 판정 방지)
    if (status !== 'ok' && required.includes(side)) return null
    return measureArm(...joints[side], width, height)
  }
  const right = measure('right')
  const left = measure('left')

  if (status === 'ok' && required.some((side) => (side === 'right' ? right : left) === null)) {
    return { tracking: { status: 'unstable', message: TRACKING_MESSAGES.unstable }, right, left }
  }
  return { tracking: { status, message: TRACKING_MESSAGES[status] }, right, left }
}

// ───────────────────────── 자세 판정 ─────────────────────────

export type Verdict = 'perfect' | 'good' | 'adjust'

export interface ArmErrors {
  elbowAngleDeg: number
  upperArmDirectionDeg: number
  forearmDirectionDeg: number
}

export interface PoseEvaluation {
  /** 일치도(유사도) 0~100 */
  similarity: number
  verdict: Verdict
  /** 모든 항목이 허용 범위 안이면 true (유지 시간 측정 대상) */
  inTolerance: boolean
  /** 팔별 부호 있는 오차 (측정값 - 목표값). 평가하는 팔만 있음 */
  errors: Partial<Record<ArmSide, ArmErrors>>
  /** 좌우 균형 (양팔 포즈만) */
  balance?: { elbowDiffDeg: number; wristHeightDiffRatio: number }
  /** 사용자에게 보여줄 교정 안내 */
  hint: string
}

/** 허용 범위 이내면 1점, 허용 범위의 2배에서 0점이 되도록 선형 감소 */
function componentScore(absErr: number, tol: number): number {
  if (absErr <= tol) return 1
  return Math.max(0, 1 - (absErr - tol) / tol)
}

const SIDE_LABEL: Record<ArmSide, string> = { right: '오른팔', left: '왼팔' }

/** 허용 범위 대비 오차 비율 하나 (안내 문구 선택용) */
interface Issue {
  ratio: number
  text: string
}

/**
 * 목표 포즈와 측정값을 비교합니다. 평가해야 하는 팔의 측정값이 없으면 null.
 * 팔꿈치 각도만으로 판정하지 않고 윗팔·아랫팔 방향, (양팔이면) 좌우 균형까지 함께 봅니다.
 */
export function evaluatePose(
  def: PoseDefinition,
  arms: { right: ArmMeasure | null; left: ArmMeasure | null },
): PoseEvaluation | null {
  const { tolerance, weights } = def
  const sides = (Object.keys(def.arms) as ArmSide[]).filter((side) => def.arms[side])
  if (sides.length === 0) return null

  const errors: Partial<Record<ArmSide, ArmErrors>> = {}
  const armScores: number[] = []
  const issues: Issue[] = []
  let inTolerance = true
  let grossMiss = false
  const prefix = (side: ArmSide) => (sides.length > 1 ? `${SIDE_LABEL[side]} ` : '')

  for (const side of sides) {
    const m = arms[side]
    const t = def.arms[side]!
    if (!m) return null

    const e: ArmErrors = {
      elbowAngleDeg: m.elbowAngleDeg - t.elbowAngleDeg,
      upperArmDirectionDeg: angleDiffDeg(m.upperArmDirectionDeg, t.upperArmDirectionDeg),
      forearmDirectionDeg: angleDiffDeg(m.forearmDirectionDeg, t.forearmDirectionDeg),
    }
    errors[side] = e
    const abs = {
      elbow: Math.abs(e.elbowAngleDeg),
      upper: Math.abs(e.upperArmDirectionDeg),
      fore: Math.abs(e.forearmDirectionDeg),
    }

    armScores.push(
      weights.elbowAngle * componentScore(abs.elbow, tolerance.elbowAngleDeg) +
        weights.upperArmDirection * componentScore(abs.upper, tolerance.upperArmDirectionDeg) +
        weights.forearmDirection * componentScore(abs.fore, tolerance.forearmDirectionDeg),
    )

    if (abs.elbow > tolerance.elbowAngleDeg || abs.upper > tolerance.upperArmDirectionDeg || abs.fore > tolerance.forearmDirectionDeg) {
      inTolerance = false
    }
    // 한 항목이라도 허용 범위의 2배를 넘으면 "다른 동작"으로 보고 Good이 될 수 없음
    // (예: 팔꿈치는 90°지만 아랫팔이 아래를 향한 자세)
    if (abs.elbow > tolerance.elbowAngleDeg * 2 || abs.upper > tolerance.upperArmDirectionDeg * 2 || abs.fore > tolerance.forearmDirectionDeg * 2) {
      grossMiss = true
    }

    issues.push(
      {
        ratio: abs.elbow / tolerance.elbowAngleDeg,
        text: `${prefix(side)}${e.elbowAngleDeg > 0 ? '팔꿈치를 조금 더 굽혀 보세요' : '팔꿈치를 조금 더 펴 보세요'}`,
      },
      {
        ratio: abs.upper / tolerance.upperArmDirectionDeg,
        // 방향 각도는 "바깥쪽 수평"이 기준. 팔마다 바깥 방향이 달라 부호 해석이 다름
        text: `${prefix(side)}${
          (side === 'right' ? e.upperArmDirectionDeg > 0 : e.upperArmDirectionDeg < 0)
            ? '팔꿈치를 어깨 높이까지 내려 주세요'
            : '팔꿈치를 어깨 높이까지 올려 주세요'
        }`,
      },
      {
        ratio: abs.fore / tolerance.forearmDirectionDeg,
        text: `${prefix(side)}아랫팔(팔꿈치~손목)을 위로 곧게 세워 주세요`,
      },
    )
  }

  // 좌우 균형 (양팔 포즈)
  let balanceScore = 1
  let balance: PoseEvaluation['balance']
  if (def.balance && arms.right && arms.left && sides.length === 2) {
    const b = def.balance
    const elbowDiff = Math.abs(arms.right.elbowAngleDeg - arms.left.elbowAngleDeg)
    const avgFore = (arms.right.forearmLenPx + arms.left.forearmLenPx) / 2
    const wristRatio = avgFore > 0 ? Math.abs(arms.right.wristYPx - arms.left.wristYPx) / avgFore : 0
    balance = { elbowDiffDeg: elbowDiff, wristHeightDiffRatio: wristRatio }
    balanceScore = (componentScore(elbowDiff, b.elbowDiffTolDeg) + componentScore(wristRatio, b.wristHeightTolRatio)) / 2
    if (elbowDiff > b.elbowDiffTolDeg || wristRatio > b.wristHeightTolRatio) inTolerance = false
    if (elbowDiff > b.elbowDiffTolDeg * 2 || wristRatio > b.wristHeightTolRatio * 2) grossMiss = true
    issues.push(
      { ratio: elbowDiff / b.elbowDiffTolDeg, text: '양쪽 팔꿈치 각도를 비슷하게 맞춰 주세요' },
      { ratio: wristRatio / b.wristHeightTolRatio, text: '양쪽 손 높이를 맞춰 주세요' },
    )
  }

  const balanceWeight = balance ? def.balance!.weight : 0
  const armsAvg = armScores.reduce((a, b) => a + b, 0) / armScores.length
  const similarity = 100 * ((1 - balanceWeight) * armsAvg + balanceWeight * balanceScore)

  const verdict: Verdict = inTolerance
    ? 'perfect'
    : similarity >= JUDGE.goodSimilarity && !grossMiss
      ? 'good'
      : 'adjust'

  const worst = issues.reduce((a, b) => (b.ratio > a.ratio ? b : a))
  const hint = worst.ratio <= 1 ? '좋아요! 그대로 유지하세요' : worst.text

  return { similarity, verdict, inTolerance, errors, balance, hint }
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

/** 이 포즈를 판정하는 데 필요한 팔 (목표가 있는 팔) */
export function requiredArms(def: PoseDefinition): ArmSide[] {
  return (Object.keys(def.arms) as ArmSide[]).filter((side) => def.arms[side])
}
