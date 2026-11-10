// 리듬 챌린지 진행기 (순수 로직: 카메라·오디오 없이 테스트 가능)
//  - 안무를 시간표(이벤트 목록)로 펼치고
//  - 프레임을 모아 두었다가, 각 동작의 평가 창이 끝나면 동작별 평가기로 채점
//  - 박자 오차 + 완성도 → Perfect / Good / Miss, 점수·콤보 계산

import { RHYTHM_JUDGE, type ChallengeDef, type MoveDef } from '../data/challenge'
import type { Frame } from './motionFrame'
import { evaluateMove, type MoveEval } from './moveEvaluators'

export type Judgement = 'perfect' | 'good' | 'miss'

export interface ScheduledMove {
  key: string
  /** 몇 번째 반복인지 (0부터) */
  loop: number
  move: MoveDef
  targetMs: number
  windowStartMs: number
  windowEndMs: number
}

export interface MoveResult {
  key: string
  loop: number
  moveId: string
  moveName: string
  kind: MoveDef['kind']
  judgement: Judgement
  points: number
  quality: number
  offsetMs: number | null
  /** 이 동작에서 측정 못 한 사유 등 */
  reason?: string
  detail: Record<string, number>
  combo: number
}

export interface ChallengeState {
  score: number
  combo: number
  maxCombo: number
  counts: Record<Judgement, number>
  results: MoveResult[]
  finished: boolean
}

/** 박자 판정: 완성도(quality)와 박자 오차를 따로 보고 합침 */
export function judge(quality: number, offsetMs: number | null, timingScale = 1): Judgement {
  const J = RHYTHM_JUDGE
  if (offsetMs === null) {
    // 박자를 알 수 없으면 최대 Good
    return quality >= J.goodQuality ? 'good' : 'miss'
  }
  const abs = Math.abs(offsetMs)
  if (quality >= J.perfectQuality && abs <= J.perfectTimingMs * timingScale) return 'perfect'
  if (quality >= J.goodQuality && abs <= J.goodTimingMs * timingScale) return 'good'
  return 'miss'
}

/** 포즈 중심 동작은 목표 시각 앞뒤로 이 만큼(ms) 살펴봄 */
const POSE_WINDOW_MS = 400
/** 동작형은 시작보다 이 만큼 먼저 프레임을 모음 */
const MOTION_LEAD_MS = 100
/** 동작형은 목표 시각 뒤로 이 만큼만 더 봄 (다음 동작과 섞이지 않게) */
const MOTION_TAIL_MS = 100
/** 오래된 프레임은 버림 (메모리) */
const KEEP_FRAMES_MS = 8000

export function beatMsOf(def: ChallengeDef): number {
  return 60000 / def.bpm
}

export function totalBeatsOf(def: ChallengeDef): number {
  return def.countdownBeats + def.beatsPerSequence * def.repeatCount + def.endingBeats
}

/** 노래 시작(0ms)부터 끝까지의 길이 */
export function totalMsOf(def: ChallengeDef): number {
  return totalBeatsOf(def) * beatMsOf(def)
}

/** 만점(모두 Perfect) 점수 — 등급 계산용 */
export function maxScoreOf(def: ChallengeDef): number {
  const J = RHYTHM_JUDGE
  let total = 0
  const n = def.moves.length * def.repeatCount
  for (let i = 0; i < n; i++) {
    total += Math.round(J.points.perfect * (1 + J.comboBonusStep * Math.min(i, J.comboBonusMax)))
  }
  return total
}

export function rankOf(score: number, maxScore: number): 'S' | 'A' | 'B' | 'C' {
  const r = maxScore > 0 ? score / maxScore : 0
  if (r >= RHYTHM_JUDGE.ranks.S) return 'S'
  if (r >= RHYTHM_JUDGE.ranks.A) return 'A'
  if (r >= RHYTHM_JUDGE.ranks.B) return 'B'
  return 'C'
}

/** 노래 시간(ms) → 지금 몇 번째 반복의 몇 카운트인지 */
export interface SongPosition {
  phase: 'precount' | 'countdown' | 'dance' | 'ending' | 'done'
  /** 시퀀스 안의 박자 위치(0~8, 소수). dance 단계에서만 의미 있음 */
  beatInSequence: number
  /** 1~8 */
  count: number
  /** 1~repeatCount */
  loop: number
  /** 카운트다운 남은 숫자 (4,3,2,1). countdown 단계에서만 */
  countdownLeft: number
}

export function songPosition(def: ChallengeDef, songMs: number): SongPosition {
  const beat = songMs / beatMsOf(def)
  const danceBeat = beat - def.countdownBeats
  const danceTotal = def.beatsPerSequence * def.repeatCount
  if (beat < 0) return { phase: 'precount', beatInSequence: 0, count: 1, loop: 1, countdownLeft: def.countdownBeats }
  if (danceBeat < 0) {
    return { phase: 'countdown', beatInSequence: 0, count: 1, loop: 1, countdownLeft: def.countdownBeats - Math.floor(beat) }
  }
  if (danceBeat >= danceTotal + def.endingBeats) {
    return { phase: 'done', beatInSequence: 0, count: def.beatsPerSequence, loop: def.repeatCount, countdownLeft: 0 }
  }
  if (danceBeat >= danceTotal) {
    return { phase: 'ending', beatInSequence: 0, count: def.beatsPerSequence, loop: def.repeatCount, countdownLeft: 0 }
  }
  const inSeq = danceBeat % def.beatsPerSequence
  return {
    phase: 'dance',
    beatInSequence: inSeq,
    count: Math.floor(inSeq) + 1,
    loop: Math.floor(danceBeat / def.beatsPerSequence) + 1,
    countdownLeft: 0,
  }
}

/** 안무 전체를 시간표로 펼침 */
export function buildSchedule(def: ChallengeDef): ScheduledMove[] {
  const beatMs = beatMsOf(def)
  const out: ScheduledMove[] = []
  for (let loop = 0; loop < def.repeatCount; loop++) {
    const base = def.countdownBeats + loop * def.beatsPerSequence
    for (const move of def.moves) {
      const targetMs = (base + move.targetBeat) * beatMs
      const isPose = move.kind === 'box' || move.kind === 'hit'
      out.push({
        key: `${loop}:${move.id}`,
        loop,
        move,
        targetMs,
        windowStartMs: isPose ? targetMs - POSE_WINDOW_MS : (base + move.startBeat) * beatMs - MOTION_LEAD_MS,
        windowEndMs: isPose ? targetMs + POSE_WINDOW_MS : targetMs + MOTION_TAIL_MS,
      })
    }
  }
  return out.sort((a, b) => a.windowEndMs - b.windowEndMs)
}

export class ChallengeRunner {
  readonly schedule: ScheduledMove[]
  readonly totalMs: number
  private frames: Frame[] = []
  private done = new Set<string>()
  private _state: ChallengeState = {
    score: 0,
    combo: 0,
    maxCombo: 0,
    counts: { perfect: 0, good: 0, miss: 0 },
    results: [],
    finished: false,
  }

  /** keepAllFrames: true면 기준 데이터 저장용으로 모든 프레임을 보관 */
  constructor(
    readonly def: ChallengeDef,
    private readonly keepAllFrames = false,
  ) {
    this.schedule = buildSchedule(def)
    this.totalMs = totalMsOf(def)
  }

  get state(): ChallengeState {
    return this._state
  }

  /** 기록된 모든 프레임 (keepAllFrames 일 때만 전체) */
  get recordedFrames(): readonly Frame[] {
    return this.frames
  }

  pushFrame(frame: Frame): void {
    this.frames.push(frame)
  }

  /** 아직 평가되지 않은 가장 가까운 동작 (미리보기용) */
  upcoming(songMs: number): ScheduledMove | null {
    return this.schedule.find((e) => !this.done.has(e.key) && e.windowEndMs > songMs) ?? null
  }

  /** 시간이 흘렀음을 알림. 평가 창이 끝난 동작을 채점하고 새 결과를 돌려줌 */
  tick(songMs: number): MoveResult[] {
    const fresh: MoveResult[] = []
    for (const ev of this.schedule) {
      if (this.done.has(ev.key) || ev.windowEndMs > songMs) continue
      this.done.add(ev.key)
      fresh.push(this.score(ev))
    }

    if (!this.keepAllFrames) {
      const cutoff = songMs - KEEP_FRAMES_MS
      if (this.frames.length > 0 && this.frames[0].tMs < cutoff) {
        this.frames = this.frames.filter((f) => f.tMs >= cutoff)
      }
    }

    if (songMs >= this.totalMs && this.done.size === this.schedule.length) {
      this._state = { ...this._state, finished: true }
    }
    return fresh
  }

  private score(ev: ScheduledMove): MoveResult {
    const windowFrames = this.frames.filter((f) => f.tMs >= ev.windowStartMs && f.tMs <= ev.windowEndMs)
    const evaluation: MoveEval = evaluateMove(ev.move, windowFrames, { targetMs: ev.targetMs })

    const judgement: Judgement = evaluation.valid
      ? judge(evaluation.quality, evaluation.offsetMs, ev.move.timingScale)
      : 'miss'

    const J = RHYTHM_JUDGE
    const s = this._state
    const base = J.points[judgement]
    const points = judgement === 'miss' ? 0 : Math.round(base * (1 + J.comboBonusStep * Math.min(s.combo, J.comboBonusMax)))
    const combo = judgement === 'miss' ? 0 : s.combo + 1

    const result: MoveResult = {
      key: ev.key,
      loop: ev.loop,
      moveId: ev.move.id,
      moveName: ev.move.name,
      kind: ev.move.kind,
      judgement,
      points,
      quality: evaluation.quality,
      offsetMs: evaluation.offsetMs,
      reason: evaluation.reason,
      detail: evaluation.detail,
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
