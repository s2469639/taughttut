// 프리스타일 진행기 (순수 로직: 카메라·오디오 없이 테스트 가능)
//
// 정해진 자세와 비교하지 않고, "움직이다가 박자에 맞춰 딱 멈추는 순간(히트)"을 찾아서
//   - 멈췄을 때의 직각성(윗팔·아랫팔이 수평/수직에 가까운가)
//   - 멈춤의 날카로움(얼마나 순간적으로 멈췄나)
//   - 이동 경로의 곧음(실험적, 비중 작음)
// 을 평가하고, 가장 가까운 박자와의 차이로 박자 판정을 합니다.
// 판정(Perfect/Good/Miss)과 점수·콤보는 가이드 챌린지와 같은 함수를 씁니다.
//
// ⚠️ 모든 기준값은 임시입니다 (data/freestyle.ts). 손바닥·손가락은 측정하지 못합니다.

import type { ChallengeDef } from '../data/challenge'
import { FREESTYLE_PARAMS, type FreestyleParams } from '../data/freestyle'
import { judge, pointsFor, totalMsOf, type Judgement, type MoveResult } from './challengeRunner'
import {
  BoneGate,
  axisPathRatio,
  frameAngularity,
  nearestBeat,
  pathScore,
  sharpnessScore,
} from './freestyleMetrics'
import type { Frame, Pt } from './motionFrame'

export interface FreestyleLive {
  /** 지금 프레임이 쓸 수 있는 상태인가 (추적됨 + 팔 길이 정상) */
  usable: boolean
  /** 움직이는 중인가 */
  moving: boolean
  /** 손목 속도 (어깨 너비/초, 평활화) */
  speed: number
  /** 지금 직각성 0~100 (쓰고 있는 팔이 없으면 null) */
  angularity: number | null
  activeArms: number
  /** 추정 인식 속도(fps) */
  fps: number
}

export interface FreestyleState {
  score: number
  combo: number
  maxCombo: number
  counts: Record<Judgement, number>
  results: MoveResult[]
  live: FreestyleLive
}

type WristKey = 'rw' | 'lw'

interface Move {
  startT: number
  startPos: Record<WristKey, Pt>
  peak: number
  /** (시각, 속도) 기록 */
  samples: Array<{ t: number; s: number }>
  /** 움직이는 동안 손목 위치 기록 */
  path: Record<WristKey, Pt[]>
  /** 움직임 중 모든 프레임 (멈춘 뒤 자세 평가용) */
  frames: Frame[]
  /** 속도가 멈춤 기준 아래로 처음 내려간 시각 */
  belowSince: number | null
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** 프레임 간격이 이보다 크면 연속된 움직임으로 보지 않음 */
const MAX_GAP_MS = 250

export class FreestyleRunner {
  readonly totalMs: number
  private readonly gate: BoneGate
  /** 최근 연속된 프레임 (속도는 2프레임 간격으로 재서 떨림을 줄임) */
  private hist: Frame[] = []
  private speed = 0
  private liveSpeed = 0
  private move: Move | null = null
  private dtEma = 33
  private n = 0
  private angEma: number | null = null
  private _state: FreestyleState

  constructor(
    readonly def: ChallengeDef,
    private readonly p: FreestyleParams = FREESTYLE_PARAMS,
    /** false면 팔 길이 검사를 끔 (테스트용) */
    useBoneGate = true,
  ) {
    this.totalMs = totalMsOf(def)
    this.gate = new BoneGate(useBoneGate ? p.boneGate : { window: 1, minSamples: Infinity, lo: 0, hi: Infinity })
    this._state = {
      score: 0,
      combo: 0,
      maxCombo: 0,
      counts: { perfect: 0, good: 0, miss: 0 },
      results: [],
      live: { usable: false, moving: false, speed: 0, angularity: null, activeArms: 0, fps: 0 },
    }
  }

  get state(): FreestyleState {
    return this._state
  }

  reset(): void {
    this.hist = []
    this.speed = 0
    this.liveSpeed = 0
    this.move = null
    this.angEma = null
    this._state = { ...this._state, score: 0, combo: 0, maxCombo: 0, counts: { perfect: 0, good: 0, miss: 0 }, results: [] }
  }

  /** 프레임 하나를 넣고, 이번에 새로 확정된 히트 결과를 돌려줍니다 */
  push(frame: Frame): MoveResult[] {
    const j = frame.joints
    const usable = frame.tracked && j !== null && this.gate.check(j)

    if (!usable || !j) {
      // 추적이 끊기면 움직임 기록도 끊음 (잘못된 값으로 판정하지 않음)
      this.hist = []
      this.move = null
      this.speed = 0
      this.liveSpeed = 0
      this.setLive({ usable: false, moving: false, speed: 0, angularity: null, activeArms: 0 })
      return []
    }

    const ang = frameAngularity(j, this.p.angleTolDeg, this.p.activeWristMinY)
    const angPct = ang.score === null ? null : ang.score * 100
    this.angEma = angPct === null ? null : this.angEma === null ? angPct : 0.6 * this.angEma + 0.4 * angPct

    const last = this.hist[this.hist.length - 1]
    if (last && (frame.tMs - last.tMs <= 0 || frame.tMs - last.tMs > MAX_GAP_MS)) {
      // 프레임이 너무 띄엄띄엄 오면 연속된 움직임으로 볼 수 없음
      this.hist = []
      this.move = null
    }
    this.hist.push(frame)
    if (this.hist.length > 3) this.hist.shift()

    const prev = this.hist.length >= 2 ? this.hist[this.hist.length - 2] : null
    if (!prev || !prev.joints) {
      this.speed = 0
      this.setLive({ usable: true, moving: false, speed: 0, angularity: this.angEma, activeArms: ang.activeArms })
      return []
    }
    const dt1 = frame.tMs - prev.tMs
    this.dtEma = 0.9 * this.dtEma + 0.1 * dt1

    // 속도: 가능하면 2프레임 전과 비교 (프레임마다 생기는 떨림이 속도로 오인되는 것을 줄임)
    const base = this.hist.length >= 3 && this.hist[0].joints ? this.hist[0] : prev
    const bj = base.joints!
    const dtB = frame.tMs - base.tMs
    const vR = (dist(j.rw, bj.rw) / dtB) * 1000
    const vL = (dist(j.lw, bj.lw) / dtB) * 1000
    this.speed = Math.max(vR, vL)
    this.liveSpeed = 0.6 * this.liveSpeed + 0.4 * this.speed

    const fresh: MoveResult[] = []

    if (this.move === null) {
      if (this.speed >= this.p.moveOnSpeed) {
        this.move = {
          startT: base.tMs,
          startPos: { rw: bj.rw, lw: bj.lw },
          peak: this.speed,
          samples: [{ t: frame.tMs, s: this.speed }],
          path: { rw: [bj.rw, j.rw], lw: [bj.lw, j.lw] },
          frames: [frame],
          belowSince: null,
        }
      }
    } else {
      const m = this.move
      m.samples.push({ t: frame.tMs, s: this.speed })
      m.path.rw.push(j.rw)
      m.path.lw.push(j.lw)
      m.frames.push(frame)
      m.peak = Math.max(m.peak, this.speed)

      if (this.speed <= this.p.stopOnSpeed) {
        if (m.belowSince === null) m.belowSince = frame.tMs
        if (frame.tMs - m.belowSince >= this.p.minStopMs) {
          // 2프레임 간격 속도는 멈춤 판정이 약 2프레임 늦으므로 그만큼 앞당김
          const r = this.finishHit(m, m.belowSince - 2 * this.dtEma, m.belowSince)
          this.move = null
          if (r) fresh.push(r)
        }
      } else {
        m.belowSince = null
        if (frame.tMs - m.startT > this.p.maxMoveMs) this.move = null // 멈추지 않는 긴 움직임은 히트로 치지 않음
      }
    }

    this.setLive({
      usable: true,
      moving: this.move !== null,
      speed: this.liveSpeed,
      angularity: this.angEma,
      activeArms: ang.activeArms,
    })
    return fresh
  }

  private setLive(l: Omit<FreestyleLive, 'fps'>) {
    this._state = { ...this._state, live: { ...l, fps: this.dtEma > 0 ? 1000 / this.dtEma : 0 } }
    this.n++
  }

  /** 멈춤이 확정됐을 때 히트를 평가. 히트로 볼 수 없으면 null (아무 점수도 주지 않음) */
  private finishHit(m: Move, hitT: number, belowSince: number): MoveResult | null {
    const P = this.p
    if (hitT - m.startT < P.minMoveMs || m.peak < P.moveOnSpeed) return null

    // 1) 실제로 의미 있게 움직였는가
    const net = Math.max(
      dist(m.path.rw[m.path.rw.length - 1], m.startPos.rw),
      dist(m.path.lw[m.path.lw.length - 1], m.startPos.lw),
    )
    if (net < P.minNetDisplacement) return null

    // 2) 박자: 안무 구간 밖(카운트다운·엔딩)의 멈춤은 무시
    const beat = nearestBeat(this.def, hitT)
    if (!beat.inDance) return null

    // 3) 멈춘 뒤의 자세 (쓰고 있는 팔이 없으면 "쉬는 자세"라 히트로 보지 않음)
    const shapes: number[] = []
    let armsActive = 0
    for (const f of m.frames) {
      if (f.tMs < hitT || !f.joints) continue
      const a = frameAngularity(f.joints, P.angleTolDeg, P.activeWristMinY)
      if (a.score !== null) {
        shapes.push(a.score)
        armsActive = Math.max(armsActive, a.activeArms)
      }
    }
    if (shapes.length === 0) return null
    const shape = mean(shapes)

    // 4) 날카로움: 정점 속도의 절반 아래로 떨어진 뒤 멈추기까지 걸린 시간
    const peakIdx = m.samples.reduce((bi, s, i, arr) => (s.s > arr[bi].s ? i : bi), 0)
    let halfT = m.samples[peakIdx].t
    for (let i = peakIdx; i < m.samples.length; i++) {
      if (m.samples[i].t > belowSince) break
      if (m.samples[i].s >= m.peak * 0.5) halfT = m.samples[i].t
    }
    // 감속 시간은 속도 신호 안의 두 시각을 비교(둘 다 같은 지연을 가짐). 박자용 보정이 들어간 hitT는 쓰지 않음
    const decelMs = Math.max(0, belowSince - halfT)
    const sharp = sharpnessScore(decelMs, P.sharp.fullScoreMs, P.sharp.zeroScoreMs)

    // 5) 이동 경로 (손목이 충분히 움직인 쪽만)
    const ratios: number[] = []
    for (const w of ['rw', 'lw'] as WristKey[]) {
      const pts = m.path[w]
      const len = pts.slice(1).reduce((a, p, i) => a + dist(p, pts[i]), 0)
      if (len < 0.2) continue
      const r = axisPathRatio(pts, P.minStepDist, P.pathAxisTolDeg)
      if (r !== null) ratios.push(r)
    }
    const axisRatio = ratios.length ? mean(ratios) : null
    const path = axisRatio === null ? 0 : pathScore(axisRatio)

    const quality = 100 * (P.weights.shape * shape + P.weights.sharp * sharp + P.weights.path * path)
    const judgement = judge(quality, beat.offsetMs, 1)

    const s = this._state
    const points = pointsFor(judgement, s.combo)
    const combo = judgement === 'miss' ? 0 : s.combo + 1
    const result: MoveResult = {
      key: `fs:${s.results.length}`,
      loop: beat.loop,
      moveId: 'freestyle-hit',
      moveName: `HIT ${beat.count}`,
      kind: 'hit',
      judgement,
      points,
      quality,
      offsetMs: beat.offsetMs,
      reason: judgement === 'miss' && Math.abs(beat.offsetMs) > 250 ? '박자에서 벗어난 멈춤' : undefined,
      detail: {
        shape: shape * 100,
        sharp: sharp * 100,
        path: path * 100,
        axisPathRatio: axisRatio ?? -1,
        peakSpeed: m.peak,
        decelMs,
        moveMs: hitT - m.startT,
        activeArms: armsActive,
        count: beat.count,
        beatIndex: beat.index,
      },
      combo,
    }
    this._state = {
      ...s,
      score: s.score + points,
      combo,
      maxCombo: Math.max(s.maxCombo, combo),
      counts: { ...s.counts, [judgement]: s.counts[judgement] + 1 },
      results: [...s.results, result],
    }
    return result
  }
}
