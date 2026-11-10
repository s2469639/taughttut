import { describe, expect, it } from 'vitest'
import { FREESTYLE_DEF, FREESTYLE_PARAMS } from '../data/freestyle'
import { BoneGate, axisDeviationDeg, axisPathRatio, frameAngularity, nearestBeat, pathScore, sharpnessScore } from './freestyleMetrics'
import type { JointName, Pt } from './motionFrame'

type J = Record<JointName, Pt>
const p = (x: number, y: number): Pt => ({ x, y })
/** 양팔 ㄱ자 (윗팔 수평, 아랫팔 수직) */
const L_SHAPE: J = { rs: p(0.5, 0), re: p(1.3, 0), rw: p(1.3, 0.8), ls: p(-0.5, 0), le: p(-1.3, 0), lw: p(-1.3, 0.8) }

describe('axisDeviationDeg', () => {
  it('수평·수직은 0, 대각선은 45', () => {
    for (const a of [0, 90, 180, -90, 270, -180]) expect(axisDeviationDeg(a)).toBeCloseTo(0, 9)
    for (const a of [45, 135, -45, -135]) expect(axisDeviationDeg(a)).toBeCloseTo(45, 9)
    expect(axisDeviationDeg(100)).toBeCloseTo(10, 9)
    expect(axisDeviationDeg(-100)).toBeCloseTo(10, 9)
  })
})

describe('frameAngularity (직각성)', () => {
  const tol = FREESTYLE_PARAMS.angleTolDeg
  const minY = FREESTYLE_PARAMS.activeWristMinY

  it('수평·수직으로 이루어진 팔은 만점, 쓰는 팔 2개', () => {
    const r = frameAngularity(L_SHAPE, tol, minY)
    expect(r.score).toBeCloseTo(1, 9)
    expect(r.activeArms).toBe(2)
  })

  it('어떤 모양이든 각이 수평·수직이면 높음 (자세가 정해져 있지 않음)', () => {
    // 한 팔은 위로 곧게, 다른 팔은 옆으로 곧게
    const j: J = { ...L_SHAPE, re: p(0.5, 0.8), rw: p(0.5, 1.6), le: p(-0.5, -0.0), lw: p(-1.3, 0) }
    // ls→le 방향이 0(길이 0)이 되지 않게 보정
    const j2: J = { ...j, le: p(-1.3, 0), lw: p(-2.1, 0) }
    expect(frameAngularity(j2, tol, minY).score).toBeCloseTo(1, 9)
  })

  it('대각선 팔은 낮음', () => {
    const j: J = { ...L_SHAPE, re: p(1.07, 0.57), rw: p(1.64, 1.14), le: p(-1.07, 0.57), lw: p(-1.64, 1.14) }
    expect(frameAngularity(j, tol, minY).score).toBeCloseTo(0, 6)
  })

  it('팔을 내리고 있는 쪽은 "쓰는 팔"에서 제외 (수직이라고 공짜 점수를 주지 않음)', () => {
    const j: J = { ...L_SHAPE, le: p(-0.5, -0.8), lw: p(-0.5, -1.6) } // 왼팔을 아래로 내림
    const r = frameAngularity(j, tol, minY)
    expect(r.activeArms).toBe(1)
  })

  it('양팔을 모두 내리면 평가 대상 없음', () => {
    const j: J = { rs: p(0.5, 0), re: p(0.5, -0.8), rw: p(0.5, -1.6), ls: p(-0.5, 0), le: p(-0.5, -0.8), lw: p(-0.5, -1.6) }
    expect(frameAngularity(j, tol, minY)).toEqual({ score: null, activeArms: 0 })
  })
})

describe('axisPathRatio (곧은 이동)', () => {
  const step = FREESTYLE_PARAMS.minStepDist
  const tol = FREESTYLE_PARAMS.pathAxisTolDeg
  const line = (a: Pt, b: Pt, n = 20): Pt[] => Array.from({ length: n + 1 }, (_, i) => p(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n))

  it('수평 직선, ㄱ자 경로(직선+90° 꺾임)는 1', () => {
    expect(axisPathRatio(line(p(0, 0), p(1, 0)), step, tol)).toBeCloseTo(1, 9)
    const L = [...line(p(0, 0), p(1, 0)), ...line(p(1, 0), p(1, 1)).slice(1)]
    expect(axisPathRatio(L, step, tol)).toBeCloseTo(1, 9)
  })

  it('대각선은 0, 원은 낮음', () => {
    expect(axisPathRatio(line(p(0, 0), p(1, 1)), step, tol)).toBeCloseTo(0, 9)
    const circle = Array.from({ length: 73 }, (_, i) => p(Math.cos((i / 72) * 2 * Math.PI), Math.sin((i / 72) * 2 * Math.PI)))
    const r = axisPathRatio(circle, step, tol)!
    expect(r).toBeGreaterThan(0.3)
    expect(r).toBeLessThan(0.6)
  })

  it('떨림 수준의 작은 이동만 있으면 null', () => {
    expect(axisPathRatio([p(0, 0), p(0.001, 0), p(0.001, 0.002)], step, tol)).toBeNull()
  })

  it('pathScore: 0.8↑ 만점, 0.3↓ 0점', () => {
    expect(pathScore(0.9)).toBe(1)
    expect(pathScore(0.8)).toBeCloseTo(1, 9)
    expect(pathScore(0.3)).toBe(0)
    expect(pathScore(0.55)).toBeCloseTo(0.5, 9)
  })
})

describe('sharpnessScore', () => {
  it('100ms 이내면 만점, 300ms 이상이면 0', () => {
    expect(sharpnessScore(50, 100, 300)).toBe(1)
    expect(sharpnessScore(100, 100, 300)).toBe(1)
    expect(sharpnessScore(200, 100, 300)).toBeCloseTo(0.5, 9)
    expect(sharpnessScore(400, 100, 300)).toBe(0)
  })
})

describe('nearestBeat', () => {
  const d = FREESTYLE_DEF // 100BPM → 600ms, 카운트다운 4박 = 2400ms
  it('안무 첫 박자(2400ms)는 1카운트, 반복 0', () => {
    expect(nearestBeat(d, 2400)).toMatchObject({ index: 0, offsetMs: 0, inDance: true, count: 1, loop: 0 })
  })
  it('박자보다 빠르면 음수, 늦으면 양수', () => {
    expect(nearestBeat(d, 3600 - 80).offsetMs).toBe(-80)
    expect(nearestBeat(d, 3600 + 120).offsetMs).toBe(120)
  })
  it('가장 가까운 박자로 붙음 (두 박자 사이 중간 근처)', () => {
    expect(nearestBeat(d, 3600 + 290).index).toBe(2)
    expect(nearestBeat(d, 3600 + 310).index).toBe(3)
  })
  it('카운트다운·엔딩은 안무 구간 밖', () => {
    expect(nearestBeat(d, 1200).inDance).toBe(false)
    expect(nearestBeat(d, 2400 + 32 * 600 + 50).inDance).toBe(false)
  })
  it('9번째 박자 = 2회차 1카운트', () => {
    expect(nearestBeat(d, 2400 + 8 * 600)).toMatchObject({ count: 1, loop: 1 })
  })
})

describe('BoneGate (팔 길이 급변 감지)', () => {
  const gate = () => new BoneGate(FREESTYLE_PARAMS.boneGate)
  it('정상 프레임이 쌓이면 통과, 갑자기 팔 길이가 짧아지면 불신', () => {
    const g = gate()
    for (let i = 0; i < 30; i++) expect(g.check(L_SHAPE)).toBe(true)
    const shrunk: J = { ...L_SHAPE, rw: p(1.3, 0.2) } // 아랫팔 0.8 → 0.2
    expect(g.check(shrunk)).toBe(false)
    expect(g.check(L_SHAPE)).toBe(true) // 정상으로 돌아오면 다시 통과
  })
  it('처음 몇 프레임은 기준이 없어서 통과', () => {
    const g = gate()
    expect(g.check({ ...L_SHAPE, rw: p(1.3, 0.2) })).toBe(true)
  })
})
