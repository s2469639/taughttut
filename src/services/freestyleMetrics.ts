// 프리스타일 원칙 지표 (순수 함수). 카메라 없이 테스트할 수 있습니다.
import type { ChallengeDef } from '../data/challenge'
import type { Pt } from './motionFrame'
import type { JointName } from './motionFrame'
import { beatMsOf } from './challengeRunner'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** 방향(도)이 가장 가까운 수평/수직(0, 90, 180, -90)에서 벗어난 정도 (0~45) */
export function axisDeviationDeg(deg: number): number {
  const m = ((deg % 90) + 90) % 90
  return Math.min(m, 90 - m)
}

/** 허용 범위 이내면 1, 2배에서 0이 되도록 선형 감소 */
function tolScore(absErr: number, tol: number): number {
  if (absErr <= tol) return 1
  return clamp01(1 - (absErr - tol) / tol)
}

const dirDeg = (from: Pt, to: Pt) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI

type Joints = Record<JointName, Pt>

/**
 * 한 프레임의 직각성(0~1)과 "쓰고 있는 팔" 수.
 * 쓰고 있는 팔 = 손목이 activeWristMinY 이상인 팔 (팔을 내린 채 가만히 있는 팔은 제외)
 */
export function frameAngularity(
  j: Joints,
  tolDeg: number,
  activeWristMinY: number,
): { score: number | null; activeArms: number } {
  const arms: Array<[Pt, Pt, Pt]> = [
    [j.rs, j.re, j.rw],
    [j.ls, j.le, j.lw],
  ]
  const scores: number[] = []
  let active = 0
  for (const [s, e, w] of arms) {
    if (w.y < activeWristMinY) continue
    active++
    scores.push(tolScore(axisDeviationDeg(dirDeg(s, e)), tolDeg), tolScore(axisDeviationDeg(dirDeg(e, w)), tolDeg))
  }
  if (scores.length === 0) return { score: null, activeArms: 0 }
  return { score: scores.reduce((a, b) => a + b, 0) / scores.length, activeArms: active }
}

/**
 * 이동 경로 중 수평/수직으로 움직인 길이의 비율 (0~1).
 * 직선과 90° 꺾임(ㄱ자 경로)은 높고, 곡선·대각선은 낮습니다.
 * 너무 짧은 단계(떨림)는 무시하고, 의미 있는 이동이 없으면 null.
 */
export function axisPathRatio(points: readonly Pt[], minStep: number, tolDeg: number): number | null {
  let total = 0
  let aligned = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    const len = Math.hypot(dx, dy)
    if (len < minStep) continue
    total += len
    if (axisDeviationDeg((Math.atan2(dy, dx) * 180) / Math.PI) <= tolDeg) aligned += len
  }
  return total > 0 ? aligned / total : null
}

/** 경로 비율 → 점수. 0.8 이상이면 만점, 0.3 이하면 0 (호를 그리는 회전 동작도 너무 가혹하지 않게 관대하게) */
export function pathScore(ratio: number): number {
  return clamp01((ratio - 0.3) / 0.5)
}

/** 감속 시간(ms) → 날카로움 점수 */
export function sharpnessScore(decelMs: number, fullMs: number, zeroMs: number): number {
  return clamp01(1 - (decelMs - fullMs) / (zeroMs - fullMs))
}

export interface BeatInfo {
  /** 안무 시작부터 몇 번째 박자인지 (0부터) */
  index: number
  beatMs: number
  /** 가장 가까운 박자의 시각(ms) */
  timeMs: number
  /** 이 시각 - 박자 시각. 음수 = 빠름 */
  offsetMs: number
  /** 안무 구간 안의 박자인가 (카운트다운·엔딩은 false) */
  inDance: boolean
  /** 1~8 */
  count: number
  /** 0부터 */
  loop: number
}

/** 시각에 가장 가까운 안무 박자 */
export function nearestBeat(def: ChallengeDef, tMs: number): BeatInfo {
  const beatMs = beatMsOf(def)
  const raw = tMs / beatMs - def.countdownBeats
  const index = Math.round(raw)
  const danceBeats = def.beatsPerSequence * def.repeatCount
  const timeMs = (def.countdownBeats + index) * beatMs
  return {
    index,
    beatMs,
    timeMs,
    offsetMs: tMs - timeMs,
    inDance: index >= 0 && index < danceBeats,
    count: ((index % def.beatsPerSequence) + def.beatsPerSequence) % def.beatsPerSequence + 1,
    loop: Math.floor(index / def.beatsPerSequence),
  }
}

/**
 * 팔 길이가 갑자기 달라진 프레임을 걸러냅니다 (가려져서 추측했거나 카메라 쪽으로 뻗어 짧아진 경우).
 * 최근 프레임들의 중앙값 대비 [lo, hi]배를 벗어나면 신뢰하지 않습니다.
 * ⚠️ 완벽한 가림 감지가 아닙니다. 팔 길이가 비슷하게 추측되면 못 걸러냅니다.
 */
export class BoneGate {
  private hist: number[][] = [[], [], [], []]

  constructor(
    private readonly cfg: { window: number; minSamples: number; lo: number; hi: number },
  ) {}

  /** true면 믿을 수 있는 프레임 */
  check(j: Joints): boolean {
    const lens = [
      Math.hypot(j.re.x - j.rs.x, j.re.y - j.rs.y),
      Math.hypot(j.rw.x - j.re.x, j.rw.y - j.re.y),
      Math.hypot(j.le.x - j.ls.x, j.le.y - j.ls.y),
      Math.hypot(j.lw.x - j.le.x, j.lw.y - j.le.y),
    ]
    let ok = true
    lens.forEach((len, i) => {
      const h = this.hist[i]
      if (h.length >= this.cfg.minSamples) {
        const med = [...h].sort((a, b) => a - b)[Math.floor(h.length / 2)]
        if (med > 0 && (len < med * this.cfg.lo || len > med * this.cfg.hi)) ok = false
      }
    })
    if (ok) {
      lens.forEach((len, i) => {
        this.hist[i].push(len)
        if (this.hist[i].length > this.cfg.window) this.hist[i].shift()
      })
    }
    return ok
  }
}
