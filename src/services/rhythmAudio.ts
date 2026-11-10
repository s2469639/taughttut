// 오리지널 Electro Funk 비트를 Web Audio로 직접 합성합니다. (외부 음원·저작권 이슈 없음)
//  - 카운트다운: 박마다 틱 (마지막 박은 높은 소리)
//  - 안무 구간: 킥(매 박), 스네어(2·4·6·8카운트), 하이햇(8분·16분), 베이스라인, 신스 스탭
//  - 동작 목표 박자에는 짧은 효과음(전환 타이밍 신호)
// 전체 길이가 짧아(약 24초) 시작할 때 한꺼번에 예약합니다 → 박자가 흔들리지 않음.

import type { ChallengeDef } from '../data/challenge'

// 베이스 음 (Hz) — E 마이너 펜타토닉 계열
const E1 = 41.2
const G1 = 49.0
const A1 = 55.0
const B1 = 61.74
const D2 = 73.42

/** 16스텝 = 한 마디(4박). 0은 쉼표. 8카운트 = 2마디 */
const BASS_BAR_A = [E1, 0, 0, E1, 0, G1, 0, E1, 0, 0, A1, 0, G1, 0, E1, 0]
const BASS_BAR_B = [E1, 0, 0, E1, 0, G1, 0, A1, 0, B1, 0, A1, G1, 0, E1, D2]
/** 신스 스탭을 치는 16분 스텝 (마디 안 위치) */
const STAB_STEPS = new Set([2, 7, 10, 14])
const STAB_NOTES = [164.81, 196.0, 246.94] // E3, G3, B3

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.5)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  // 재현 가능한 의사 난수 (소리가 매번 같도록)
  let seed = 1234567
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    data[i] = (seed / 0xffffffff) * 2 - 1
  }
  return buf
}

function env(g: GainNode, t: number, peak: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
}

function kick(ctx: BaseAudioContext, out: AudioNode, t: number) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.frequency.setValueAtTime(160, t)
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
  env(g, t, 0.95, 0.28)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.3)
}

function snare(ctx: BaseAudioContext, out: AudioNode, t: number, noise: AudioBuffer) {
  const n = ctx.createBufferSource()
  n.buffer = noise
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1900
  const ng = ctx.createGain()
  env(ng, t, 0.5, 0.18)
  n.connect(bp).connect(ng).connect(out)
  n.start(t)
  n.stop(t + 0.2)
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(220, t)
  o.frequency.exponentialRampToValueAtTime(140, t + 0.08)
  const og = ctx.createGain()
  env(og, t, 0.35, 0.12)
  o.connect(og).connect(out)
  o.start(t)
  o.stop(t + 0.15)
}

function hat(ctx: BaseAudioContext, out: AudioNode, t: number, noise: AudioBuffer, level: number) {
  const n = ctx.createBufferSource()
  n.buffer = noise
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 7500
  const g = ctx.createGain()
  env(g, t, level, 0.045)
  n.connect(hp).connect(g).connect(out)
  n.start(t)
  n.stop(t + 0.06)
}

function bass(ctx: BaseAudioContext, out: AudioNode, t: number, freq: number, dur: number) {
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.value = freq
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(900, t)
  lp.frequency.exponentialRampToValueAtTime(220, t + dur)
  const g = ctx.createGain()
  env(g, t, 0.42, dur)
  o.connect(lp).connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function stab(ctx: BaseAudioContext, out: AudioNode, t: number) {
  for (const f of STAB_NOTES) {
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = f
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1800
    const g = ctx.createGain()
    env(g, t, 0.05, 0.11)
    o.connect(lp).connect(g).connect(out)
    o.start(t)
    o.stop(t + 0.13)
  }
}

function tick(ctx: BaseAudioContext, out: AudioNode, t: number, accent: boolean) {
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.value = accent ? 1760 : 1100
  const g = ctx.createGain()
  env(g, t, accent ? 0.5 : 0.35, 0.09)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.11)
}

/** 동작 목표 박자 효과음 (짧은 상승음) */
function zap(ctx: BaseAudioContext, out: AudioNode, t: number) {
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(500, t)
  o.frequency.exponentialRampToValueAtTime(1500, t + 0.07)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 3200
  const g = ctx.createGain()
  env(g, t, 0.14, 0.12)
  o.connect(lp).connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.14)
}

/**
 * 노래 전체를 예약합니다.
 * @param t0 노래 시작(0ms)에 해당하는 AudioContext 시각(초)
 * @returns 예약한 박자 수
 */
export function scheduleSong(ctx: BaseAudioContext, t0: number, def: ChallengeDef): number {
  const beat = 60 / def.bpm
  const sixteenth = beat / 4
  const master = ctx.createGain()
  master.gain.value = 0.8
  const comp = ctx.createDynamicsCompressor()
  master.connect(comp).connect(ctx.destination)
  const noise = noiseBuffer(ctx)

  const accentBeats = new Set(def.moves.map((m) => Math.round(m.targetBeat)))
  const danceBeats = def.beatsPerSequence * def.repeatCount
  const totalBeats = def.countdownBeats + danceBeats + def.endingBeats

  for (let b = 0; b < totalBeats; b++) {
    const t = t0 + b * beat
    if (b < def.countdownBeats) {
      tick(ctx, master, t, b === def.countdownBeats - 1)
      continue
    }
    const db = b - def.countdownBeats // 안무 시작 기준 박자
    if (db >= danceBeats) {
      // 엔딩: 마지막에 킥 한 번 + 스탭으로 마무리
      if (db === danceBeats) {
        kick(ctx, master, t)
        stab(ctx, master, t)
      }
      continue
    }
    const inSeq = db % def.beatsPerSequence

    kick(ctx, master, t)
    if (inSeq % 2 === 1) snare(ctx, master, t, noise) // 2·4·6·8 카운트
    if (accentBeats.has(inSeq)) zap(ctx, master, t)

    for (let s = 0; s < 4; s++) {
      const st = t + s * sixteenth
      hat(ctx, master, st, noise, s % 2 === 0 ? (s === 2 ? 0.2 : 0.1) : 0.06)
      const barStep = (inSeq % 4) * 4 + s
      const pattern = Math.floor(inSeq / 4) === 0 ? BASS_BAR_A : BASS_BAR_B
      const f = pattern[barStep]
      if (f) bass(ctx, master, st, f, sixteenth * 1.6)
      if (STAB_STEPS.has(barStep) && Math.floor(inSeq / 4) === 1) stab(ctx, master, st)
    }
  }
  return totalBeats
}

/** AudioContext 시각 → performance.now() 시각 대응 (프레임 시간과 노래 시간을 맞추기 위함) */
export function contextTimeToPerf(ctx: AudioContext, contextTime: number): number {
  const ts = ctx.getOutputTimestamp?.()
  if (ts && ts.performanceTime && ts.contextTime !== undefined) {
    return ts.performanceTime + (contextTime - ts.contextTime) * 1000
  }
  // 지원하지 않으면 지금 시각 기준으로 근사
  return performance.now() + (contextTime - ctx.currentTime) * 1000
}
