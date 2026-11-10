import { describe, expect, it } from 'vitest'
import { FREESTYLE_DEF } from '../data/freestyle'
import { FreestyleRunner } from './freestyleRunner'
import type { Frame, Pt } from './motionFrame'

const def = FREESTYLE_DEF
const BEAT = 600
const T0 = 2400 // 안무 시작 (카운트다운 4박)
const beatAt = (k: number) => T0 + k * BEAT
const p = (x: number, y: number): Pt => ({ x, y })

interface Pose {
  re: Pt
  le: Pt
}
/** 양팔 ㄱ자의 팔꿈치 위치 (윗팔 수평) */
const HORIZ: Pose = { re: p(1.3, 0), le: p(-1.3, 0) }
/** 윗팔이 대각선인 팔꿈치 위치 */
const DIAG: Pose = { re: p(1.07, 0.57), le: p(-1.07, 0.57) }

function frame(t: number, wy: number, pose: Pose = HORIZ, wx = 0.8, tracked = true): Frame {
  if (!tracked) return { tMs: t, tracked: false, joints: null, arms: { right: null, left: null } }
  // 손목은 팔꿈치 바로 위/아래(수직)에서 y만 변함. 팔 길이 검사는 끄고 테스트
  const rwx = pose.re.x + (pose === DIAG ? wx - 0.8 + 0.566 : 0)
  const lwx = pose.le.x - (pose === DIAG ? wx - 0.8 + 0.566 : 0)
  return {
    tMs: t,
    tracked: true,
    joints: { rs: p(0.5, 0), re: pose.re, rw: p(rwx, wy), ls: p(-0.5, 0), le: pose.le, lw: p(lwx, wy) },
    arms: { right: null, left: null },
  }
}

/** y(t)를 시간 함수로 받아 fps로 프레임 생성 */
function run(
  yAt: (t: number) => number,
  opts: { fps?: number; pose?: Pose; untracked?: (t: number) => boolean; to?: number; gate?: boolean } = {},
) {
  const r = new FreestyleRunner(def, undefined, opts.gate ?? false)
  const dt = 1000 / (opts.fps ?? 30)
  const out = []
  for (let t = 0; t <= (opts.to ?? 7000); t += dt) {
    out.push(...r.push(frame(t, yAt(t), opts.pose, 0.8, !(opts.untracked?.(t) ?? false))))
  }
  return { r, results: out }
}

/** endT에 정확히 멈추는 직선 이동: [endT-dur, endT] 동안 yFrom → yTo, 앞뒤는 정지 */
function sharpMove(endT: number, yFrom: number, yTo: number, dur = 200) {
  return (t: number) => {
    if (t <= endT - dur) return yFrom
    if (t >= endT) return yTo
    return yFrom + ((yTo - yFrom) * (t - (endT - dur))) / dur
  }
}

describe('FreestyleRunner — 박자에 맞춘 멈춤', () => {
  it('박자(3카운트)에 딱 맞춰 수직으로 멈추면 Perfect 한 번', () => {
    const { results } = run(sharpMove(beatAt(2), -0.1, 0.8))
    expect(results).toHaveLength(1)
    const h = results[0]
    expect(h.judgement).toBe('perfect')
    expect(Math.abs(h.offsetMs!)).toBeLessThan(60)
    expect(h.detail.shape).toBeCloseTo(100, 3)
    expect(h.detail.axisPathRatio).toBeCloseTo(1, 3)
    expect(h.moveName).toBe('HIT 3')
    expect(h.points).toBe(100)
  })

  it('박자와 반 박자 사이(300ms 어긋남)에서 멈추면 Miss, 콤보 없음', () => {
    const { results, r } = run(sharpMove(beatAt(2) + 300, -0.1, 0.8))
    expect(results).toHaveLength(1)
    expect(results[0].judgement).toBe('miss')
    expect(results[0].reason).toBe('박자에서 벗어난 멈춤')
    expect(r.state.score).toBe(0)
    expect(r.state.combo).toBe(0)
  })

  it('조금(약 150ms) 늦게 멈추면 Good 이하', () => {
    const { results } = run(sharpMove(beatAt(2) + 170, -0.1, 0.8))
    expect(results[0].judgement).not.toBe('perfect')
    expect(results[0].offsetMs!).toBeGreaterThan(100)
  })

  it('연속 두 박자에 멈추면 콤보 보너스가 붙음 (가이드 챌린지와 같은 점수 규칙)', () => {
    const up = sharpMove(beatAt(2), -0.1, 0.8)
    const down = sharpMove(beatAt(3), 0.8, -0.1)
    const { results, r } = run((t) => (t < beatAt(2) + 200 ? up(t) : down(t)))
    expect(results).toHaveLength(2)
    expect(results.map((x) => x.judgement)).toEqual(['perfect', 'perfect'])
    expect(results[1].points).toBe(110)
    expect(r.state.maxCombo).toBe(2)
  })
})

describe('FreestyleRunner — 자세는 자유, 원칙으로 평가', () => {
  it('팔이 대각선이면 같은 박자에 멈춰도 Perfect가 아님 (직각성이 낮음)', () => {
    const { results } = run(sharpMove(beatAt(2), 0.4, 1.13), { pose: DIAG })
    expect(results).toHaveLength(1)
    expect(results[0].detail.shape).toBeLessThan(10)
    expect(results[0].judgement).not.toBe('perfect')
  })

  it('서서히 멈추면(감속이 길면) 날카로움 점수가 낮음', () => {
    const smooth = (t: number) => {
      const s = beatAt(2) - 400
      if (t <= s) return -0.1
      if (t >= beatAt(2)) return 0.8
      const u = (t - s) / 400
      return -0.1 + 0.9 * (1 - (1 - u) ** 2) // ease-out
    }
    const abrupt = run(sharpMove(beatAt(2), -0.1, 0.8)).results[0]
    const soft = run(smooth).results[0]
    expect(soft).toBeDefined()
    expect(soft.detail.sharp).toBeLessThan(abrupt.detail.sharp - 15)
  })

  it('멈추지 않고 계속 움직이면 히트가 없음', () => {
    // 반지름 0.4의 원을 초당 1바퀴 (속도 약 2.5)
    const { results } = run(
      () => 0,
      {},
    )
    expect(results).toHaveLength(0)
    const circle = new FreestyleRunner(def, undefined, false)
    const got: unknown[] = []
    for (let t = 0; t <= 7000; t += 1000 / 30) {
      const a = (t / 1000) * 2 * Math.PI
      const f = frame(t, 0.3 + 0.4 * Math.sin(a))
      f.joints!.rw = p(1.3 + 0.4 * Math.cos(a), 0.3 + 0.4 * Math.sin(a))
      f.joints!.lw = p(-1.3 - 0.4 * Math.cos(a), 0.3 + 0.4 * Math.sin(a))
      got.push(...circle.push(f))
    }
    expect(got).toHaveLength(0)
  })

  it('가만히 서 있으면 히트 없음', () => {
    expect(run(() => 0.5).results).toHaveLength(0)
  })

  it('팔을 내린 채 움직이면(쉬는 팔) 히트로 치지 않음', () => {
    expect(run(sharpMove(beatAt(2), -1.8, -1.2)).results).toHaveLength(0)
  })

  it('움직임이 너무 작으면(떨림 수준) 히트 없음', () => {
    expect(run(sharpMove(beatAt(2), 0.5, 0.6)).results).toHaveLength(0)
  })

  it('카운트다운 중 멈춤은 무시', () => {
    expect(run(sharpMove(1200, -0.1, 0.8)).results).toHaveLength(0)
  })
})

describe('FreestyleRunner — 인식 문제 대응', () => {
  it('움직이는 도중 추적이 끊기면 히트로 치지 않음 (잘못된 값으로 판정 방지)', () => {
    const end = beatAt(2)
    const { results } = run(sharpMove(end, -0.1, 0.8), { untracked: (t) => t > end - 130 && t < end - 60 })
    expect(results).toHaveLength(0)
  })

  it('추적이 끊겨도 다음 움직임은 정상 평가', () => {
    const e1 = beatAt(2)
    const e2 = beatAt(5)
    const m1 = sharpMove(e1, -0.1, 0.8)
    const m2 = sharpMove(e2, 0.8, -0.1)
    const { results } = run((t) => (t < e1 + 600 ? m1(t) : m2(t)), { untracked: (t) => t > e1 - 130 && t < e1 - 60, to: 9000 })
    expect(results).toHaveLength(1)
    expect(results[0].moveName).toBe('HIT 6')
  })

  it('프레임이 너무 띄엄띄엄(5fps)이어도 오류 없이 동작', () => {
    const { results } = run(sharpMove(beatAt(2), -0.1, 0.8), { fps: 5 })
    expect(results.length).toBeLessThanOrEqual(1)
  })

  it('팔 길이 검사를 켜면, 갑자기 아랫팔이 짧아진 프레임은 사용하지 않음', () => {
    const r = new FreestyleRunner(def)
    for (let t = 0; t < 1500; t += 33.3) r.push(frame(t, 0.8))
    expect(r.state.live.usable).toBe(true)
    r.push(frame(1550, 0.2)) // 아랫팔 길이 0.8 → 0.2
    expect(r.state.live.usable).toBe(false)
  })
})

describe('FreestyleRunner — 실시간 계기판 값', () => {
  it('직각 자세에서 직각성 100, 움직일 때 moving=true', () => {
    const r = new FreestyleRunner(def, undefined, false)
    for (let t = 0; t < 1000; t += 33.3) r.push(frame(t, 0.8))
    expect(r.state.live.angularity).toBeCloseTo(100, 1)
    expect(r.state.live.moving).toBe(false)
    const mv = sharpMove(1500, 0.8, -0.1, 300)
    for (let t = 1000; t < 1400; t += 33.3) r.push(frame(t, mv(t)))
    expect(r.state.live.moving).toBe(true)
  })

  it('추정 인식 속도(fps)', () => {
    const r = new FreestyleRunner(def, undefined, false)
    for (let t = 0; t < 3000; t += 1000 / 15) r.push(frame(t, 0.8))
    expect(r.state.live.fps).toBeGreaterThan(12)
    expect(r.state.live.fps).toBeLessThan(18)
  })

  it('reset 하면 점수와 기록이 초기화', () => {
    const { r } = run(sharpMove(beatAt(2), -0.1, 0.8))
    expect(r.state.score).toBeGreaterThan(0)
    r.reset()
    expect(r.state.score).toBe(0)
    expect(r.state.results).toHaveLength(0)
  })
})
