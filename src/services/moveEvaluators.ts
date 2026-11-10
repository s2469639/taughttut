// 동작 종류별 평가기. 입력은 "시간 창 안의 프레임 목록"이라 카메라 없이 테스트할 수 있습니다.
// 팔꿈치 각도만으로 판정하지 않고, 동작마다 다른 지표를 씁니다.
//   slide : 손목 이동 방향·거리·곧음
//   box   : 양팔 자세 (각도·방향·균형)
//   rotate: 윗팔·아랫팔 방향 변화 (시작·끝·회전량)
//   wave  : 어깨·팔꿈치·손목이 움직인 시간 순서 (대략)
//   fold  : 팔꿈치 각도 변화
//   hit   : 최종 자세 + 박자
//
// ⚠️ Pose Landmarker는 손목 굴림·손가락·손바닥 움직임을 측정하지 못합니다.
//    그런 요소는 평가하지 않으며, 각 동작의 notMeasured 로 화면에 밝힙니다.

import { RHYTHM_JUDGE, type MoveDef, type RotateSpec, type SlideSpec, type WaveSpec, type FoldSpec, type PoseSpec } from '../data/challenge'
import { JUDGE, type ArmSide } from '../data/poses'
import { angleDiffDeg, normalizeAngleDeg } from '../utils/geometry'
import type { Frame, JointName, Pt } from './motionFrame'
import { evaluatePose } from './poseEvaluator'

export interface MoveEval {
  /** 동작을 평가할 만큼 프레임이 충분했는가 */
  valid: boolean
  /** 완성도 0~100 */
  quality: number
  /** (실제 완성 시각 - 목표 시각) ms. 음수 = 빠름, 양수 = 늦음. 알 수 없으면 null */
  offsetMs: number | null
  /** 디버그용 세부 수치 */
  detail: Record<string, number>
  reason?: string
}

export interface EvalContext {
  /** 목표 시각 (노래 시작 기준 ms) */
  targetMs: number
}

/** 평가에 필요한 최소 추적 프레임 수 */
export const MIN_TRACKED_FRAMES = 4

const INVALID = (reason: string): MoveEval => ({ valid: false, quality: 0, offsetMs: null, detail: {}, reason })

/** 허용 범위 이내면 1, 허용 범위의 2배에서 0이 되도록 선형 감소 */
function tolScore(absErr: number, tol: number): number {
  if (absErr <= tol) return 1
  return Math.max(0, 1 - (absErr - tol) / tol)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

function avgPt(pts: Pt[]): Pt {
  return { x: mean(pts.map((p) => p.x)), y: mean(pts.map((p) => p.y)) }
}

const WRIST: Record<ArmSide, JointName> = { right: 'rw', left: 'lw' }

/** 값이 처음으로 from→to 변화의 frac(기본 90%)에 도달한 시각 */
function reachTime(samples: Array<{ t: number; v: number }>, from: number, to: number, frac = 0.9): number | null {
  if (Math.abs(to - from) < 1e-9) return null
  for (const s of samples) {
    if ((s.v - from) / (to - from) >= frac) return s.t
  }
  return null
}

/**
 * 자세가 "완성된" 시각의 오차.
 * ok 상태가 150ms 이상 이어지기 시작한 첫 시각을 완성 시각으로 봅니다.
 * 창이 열릴 때 이미 자세가 되어 있었다면 목표 시각에 맞춘 것으로 봅니다(오차 0).
 */
function arrivalOffset(samples: Array<{ t: number; ok: boolean }>, targetMs: number, minStableMs = 150): number | null {
  if (samples.length === 0) return null
  if (samples[0].ok) {
    // 처음부터 계속 자세가 맞았다면 이미 완성 상태
    const stableAll = samples.every((s) => s.ok)
    if (stableAll) return 0
  }
  for (let i = 0; i < samples.length; i++) {
    if (!samples[i].ok) continue
    if (i > 0 && samples[i - 1].ok) continue // 구간의 시작만
    let j = i
    while (j + 1 < samples.length && samples[j + 1].ok) j++
    if (samples[j].t - samples[i].t >= minStableMs || j === samples.length - 1) {
      return samples[i].t - targetMs
    }
  }
  return null
}

// ───────────────────────── slide ─────────────────────────

function evalSlide(spec: SlideSpec, frames: Frame[], ctx: EvalContext): MoveEval {
  const sides = Object.keys(spec.arms) as ArmSide[]
  const sideQ: number[] = []
  const arrivals: number[] = []
  const detail: Record<string, number> = {}

  for (const side of sides) {
    const target = spec.arms[side]!
    const pts = frames.map((f) => f.joints![WRIST[side]])
    const start = avgPt(pts.slice(0, 3))
    const end = avgPt(pts.slice(-3))
    const dx = end.x - start.x
    const dy = end.y - start.y
    const dist = Math.hypot(dx, dy)
    const dir = (Math.atan2(dy, dx) * 180) / Math.PI
    const dirErr = dist > 1e-6 ? Math.abs(angleDiffDeg(dir, target.dirDeg)) : 180

    let pathLen = 0
    for (let i = 1; i < pts.length; i++) pathLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    const straight = pathLen > 1e-6 ? dist / pathLen : 0

    const qDir = tolScore(dirErr, spec.dirTolDeg)
    const qDist = clamp01(dist / spec.minDistance)
    const qStraight = clamp01((straight - 0.5) / 0.4)
    sideQ.push(100 * (0.5 * qDir + 0.35 * qDist + 0.15 * qStraight))

    detail[`${side}DirErrDeg`] = dirErr
    detail[`${side}Distance`] = dist
    detail[`${side}Straight`] = straight

    if (dist >= spec.minDistance * 0.5) {
      const t = reachTime(
        frames.map((f, i) => ({ t: f.tMs, v: Math.hypot(pts[i].x - start.x, pts[i].y - start.y) })),
        0,
        dist,
      )
      if (t !== null) arrivals.push(t)
    }
  }

  const arrival = arrivals.length === sides.length && arrivals.length > 0 ? Math.max(...arrivals) : null
  return { valid: true, quality: mean(sideQ), offsetMs: arrival === null ? null : arrival - ctx.targetMs, detail }
}

// ───────────────────────── box / hit (자세형) ─────────────────────────

function evalPoseMove(spec: PoseSpec, frames: Frame[], ctx: EvalContext): MoveEval {
  const samples = frames
    .filter((f) => f.arms.right && f.arms.left)
    .map((f) => {
      const ev = evaluatePose(spec.pose, f.arms)
      if (!ev) return { t: f.tMs, sim: 0 }
      // 학습 모드와 같은 규칙: 한 항목이라도 허용 범위를 벗어나면 Perfect 완성도에 못 미치고,
      // 크게 틀리면(허용 범위의 2배 초과) Good 완성도에도 못 미침 (평균 점수로 가려지지 않게)
      const cap =
        ev.verdict === 'perfect'
          ? 100
          : ev.verdict === 'good'
            ? RHYTHM_JUDGE.perfectQuality - 1
            : RHYTHM_JUDGE.goodQuality - 1
      return { t: f.tMs, sim: Math.min(ev.similarity, cap) }
    })
  if (samples.length < MIN_TRACKED_FRAMES) return INVALID('인식된 프레임이 부족해요')

  const best = Math.max(...samples.map((s) => s.sim))
  // 완성 기준: 일치도가 Good 기준 이상이면서 최고 일치도의 90% 이상
  // (자세로 "다가가는 중"을 완성으로 보지 않기 위함)
  const okThreshold = Math.max(JUDGE.goodSimilarity, best * 0.9)
  const arrival = arrivalOffset(
    samples.map((s) => ({ t: s.t, ok: s.sim >= okThreshold })),
    ctx.targetMs,
  )
  return { valid: true, quality: best, offsetMs: arrival, detail: { bestSimilarity: best } }
}

// ───────────────────────── rotate ─────────────────────────

/** 각도 시계열을 끊김 없이 이어 붙임(-180/180 경계 보정) */
function unwrap(series: number[]): number[] {
  if (series.length === 0) return []
  const out = [series[0]]
  for (let i = 1; i < series.length; i++) out.push(out[i - 1] + angleDiffDeg(series[i], series[i - 1]))
  return out
}

function evalRotate(spec: RotateSpec, frames: Frame[], ctx: EvalContext): MoveEval {
  const sides = Object.keys(spec.arms) as ArmSide[]
  const qs: number[] = []
  const arrivals: number[] = []
  const detail: Record<string, number> = {}

  for (const side of sides) {
    const segs = spec.arms[side]!
    for (const seg of ['upper', 'fore'] as const) {
      const t = segs[seg]
      const raw = frames.map((f) => {
        const m = f.arms[side]!
        return seg === 'upper' ? m.upperArmDirectionDeg : m.forearmDirectionDeg
      })
      const u = unwrap(raw)
      const start = mean(u.slice(0, 3))
      const end = mean(u.slice(-3))
      const delta = end - start
      const targetDelta = angleDiffDeg(t.toDeg, t.fromDeg)

      const startErr = Math.abs(angleDiffDeg(normalizeAngleDeg(start), t.fromDeg))
      const endErr = Math.abs(angleDiffDeg(normalizeAngleDeg(end), t.toDeg))
      const deltaErr = Math.abs(delta - targetDelta)
      qs.push(
        100 *
          (0.25 * tolScore(startErr, spec.startTolDeg) +
            0.4 * tolScore(endErr, spec.endTolDeg) +
            0.35 * tolScore(deltaErr, spec.deltaTolDeg)),
      )
      detail[`${side}_${seg}_deltaDeg`] = delta
      detail[`${side}_${seg}_targetDeltaDeg`] = targetDelta

      if (Math.abs(delta) >= 20) {
        const rt = reachTime(
          frames.map((f, i) => ({ t: f.tMs, v: u[i] })),
          start,
          end,
        )
        if (rt !== null) arrivals.push(rt)
      }
    }
  }
  const arrival = arrivals.length ? Math.max(...arrivals) : null
  return { valid: true, quality: mean(qs), offsetMs: arrival === null ? null : arrival - ctx.targetMs, detail }
}

// ───────────────────────── wave ─────────────────────────

/**
 * 시작·끝 값을 잇는 직선(전체 흐름)을 뺀 "튀어나온 정도".
 * 팔 전체가 서서히 올라가거나 내려가는 움직임과 웨이브의 물결을 구분하기 위함입니다.
 */
function detrend(values: number[], times: number[]): number[] {
  const n = values.length
  const k = Math.min(3, n)
  const v0 = mean(values.slice(0, k))
  const v1 = mean(values.slice(-k))
  const t0 = mean(times.slice(0, k))
  const t1 = mean(times.slice(-k))
  const span = t1 - t0
  return values.map((v, i) => v - (span > 0 ? v0 + ((v1 - v0) * (times[i] - t0)) / span : v0))
}

/** 웨이브 순서 판정 시, 앞 관절보다 이만큼(ms) 이상 늦게 정점이어야 "순서대로"로 인정 */
const WAVE_MIN_GAP_MS = 20

function evalWave(spec: WaveSpec, frames: Frame[], ctx: EvalContext): MoveEval {
  const sign = (side: 'right' | 'left') => (side === 'right' ? 1 : -1)
  // 신호: 손목·팔꿈치는 높이(y), 어깨는 좌우 기울기(오른쪽 어깨가 올라가면 +)
  type Sig = { name: string; kind: 'wrist' | 'elbow' | 'shoulder'; values: number[] }
  const tilt = frames.map((f) => f.joints!.rs.y - f.joints!.ls.y)
  const rtl = spec.direction === 'right-to-left'
  const chain: Sig[] = [
    { name: 'rw', kind: 'wrist', values: frames.map((f) => f.joints!.rw.y) },
    { name: 're', kind: 'elbow', values: frames.map((f) => f.joints!.re.y) },
    { name: 'rs', kind: 'shoulder', values: tilt.map((v) => v * sign('right')) },
    { name: 'ls', kind: 'shoulder', values: tilt.map((v) => v * -1 * sign('right')) },
    { name: 'le', kind: 'elbow', values: frames.map((f) => f.joints!.le.y) },
    { name: 'lw', kind: 'wrist', values: frames.map((f) => f.joints!.lw.y) },
  ]
  if (!rtl) chain.reverse()

  const active: Array<{ name: string; t: number; amp: number }> = []
  const detail: Record<string, number> = {}
  const times = frames.map((f) => f.tMs)
  for (const sig of chain) {
    const dev = detrend(sig.values, times)
    let peak = -Infinity
    let peakIdx = 0
    dev.forEach((v, i) => {
      if (v > peak) {
        peak = v
        peakIdx = i
      }
    })
    detail[`${sig.name}_amp`] = peak
    if (peak >= spec.minAmplitude[sig.kind]) active.push({ name: sig.name, t: frames[peakIdx].tMs, amp: peak })
  }

  let pairs = 0
  let ordered = 0
  for (let i = 1; i < active.length; i++) {
    pairs++
    if (active[i].t >= active[i - 1].t + WAVE_MIN_GAP_MS) ordered++
  }
  const orderScore = pairs > 0 ? ordered / pairs : 0
  const coverage = active.length / chain.length

  let quality = 100 * (0.6 * orderScore + 0.4 * coverage)
  if (active.length < 3) quality = Math.min(quality, 30) // 3개 미만 관절만 움직였으면 웨이브로 보지 않음
  detail.activeJoints = active.length
  detail.orderScore = orderScore

  const last = active.length >= 2 ? active[active.length - 1].t : null
  return { valid: true, quality, offsetMs: last === null ? null : last - ctx.targetMs, detail }
}

// ───────────────────────── fold ─────────────────────────

function evalFold(spec: FoldSpec, frames: Frame[], ctx: EvalContext): MoveEval {
  const sides = Object.keys(spec.arms) as ArmSide[]
  const qs: number[] = []
  const arrivals: number[] = []
  const detail: Record<string, number> = {}

  for (const side of sides) {
    const t = spec.arms[side]!
    const angles = frames.map((f) => f.arms[side]!.elbowAngleDeg)
    const start = mean(angles.slice(0, 3))
    const end = mean(angles.slice(-3))
    const startErr = Math.abs(start - t.fromAngleDeg)
    const endErr = Math.abs(end - t.toAngleDeg)
    const expected = t.fromAngleDeg - t.toAngleDeg
    const mono = expected !== 0 ? clamp01((start - end) / expected) : 0
    qs.push(100 * (0.3 * tolScore(startErr, spec.startTolDeg) + 0.5 * tolScore(endErr, spec.endTolDeg) + 0.2 * mono))
    detail[`${side}_startDeg`] = start
    detail[`${side}_endDeg`] = end

    if (Math.abs(start - end) >= 15) {
      const rt = reachTime(
        frames.map((f, i) => ({ t: f.tMs, v: angles[i] })),
        start,
        end,
      )
      if (rt !== null) arrivals.push(rt)
    }
  }
  const arrival = arrivals.length === sides.length && arrivals.length > 0 ? Math.max(...arrivals) : null
  return { valid: true, quality: mean(qs), offsetMs: arrival === null ? null : arrival - ctx.targetMs, detail }
}

// ───────────────────────── 진입점 ─────────────────────────

/** 시간 창 안의 프레임(추적 실패 포함)으로 동작을 평가합니다. */
export function evaluateMove(move: MoveDef, windowFrames: Frame[], ctx: EvalContext): MoveEval {
  const frames = windowFrames.filter((f) => f.tracked && f.joints)
  if (frames.length < MIN_TRACKED_FRAMES) return INVALID('인식된 프레임이 부족해요')

  switch (move.kind) {
    case 'slide':
      return evalSlide(move.spec, frames, ctx)
    case 'box':
    case 'hit':
      return evalPoseMove(move.spec, frames, ctx)
    case 'rotate':
      return evalRotate(move.spec, frames, ctx)
    case 'wave':
      return evalWave(move.spec, frames, ctx)
    case 'fold':
      return evalFold(move.spec, frames, ctx)
  }
}
