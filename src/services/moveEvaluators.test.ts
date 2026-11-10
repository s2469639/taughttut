import { describe, expect, it } from 'vitest'
import { FIRST_TUT_FLOW, type MoveDef } from '../data/challenge'
import { anglesAtBeat, frameFromAngles, type ArmAngles } from './challengeTestUtils'
import type { Frame } from './motionFrame'
import { evaluateMove } from './moveEvaluators'

const move = (id: string): MoveDef => FIRST_TUT_FLOW.moves.find((m) => m.id === id)!
const FRAME_POSE: ArmAngles = { right: { upper: 0, fore: 90 }, left: { upper: 180, fore: 90 } }

/** 일정 간격으로 각도를 만들어 프레임 목록 생성 */
function seq(fromMs: number, toMs: number, at: (t: number) => ArmAngles): Frame[] {
  const out: Frame[] = []
  for (let t = fromMs; t <= toMs; t += 33) out.push(frameFromAngles(at(t), t))
  return out
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

describe('Slide (손목 이동 경로와 방향)', () => {
  const m = move('open-slide')
  const open = (t: number): ArmAngles => {
    const k = Math.min(1, Math.max(0, t / 1200))
    return { right: { upper: lerp(180, 0, k), fore: 90 }, left: { upper: lerp(0, 180, k), fore: 90 } }
  }
  it('양옆으로 열면 높은 완성도', () => {
    const r = evaluateMove(m, seq(0, 1300, open), { targetMs: 1200 })
    expect(r.valid).toBe(true)
    expect(r.quality).toBeGreaterThan(80)
  })
  it('반대로 모으면(안쪽으로 이동) 낮음', () => {
    const r = evaluateMove(m, seq(0, 1300, (t) => open(1200 - t)), { targetMs: 1200 })
    expect(r.quality).toBeLessThan(50)
  })
  it('움직이지 않으면 낮음', () => {
    const r = evaluateMove(m, seq(0, 1300, () => FRAME_POSE), { targetMs: 1200 })
    expect(r.quality).toBeLessThan(50)
  })
})

describe('Rotate (팔 방향 변화)', () => {
  const m = move('rotate')
  const rot = (sign: 1 | -1) => (t: number): ArmAngles => {
    const k = Math.min(1, Math.max(0, t / 500)) * sign
    return {
      right: { upper: lerp(0, -90, k), fore: lerp(90, 0, k) },
      left: { upper: lerp(180, 270, k), fore: lerp(90, 180, k) },
    }
  }
  it('정해진 방향으로 90° 돌리면 높음', () => {
    const r = evaluateMove(m, seq(0, 700, rot(1)), { targetMs: 600 })
    expect(r.quality).toBeGreaterThan(85)
  })
  it('반대 방향으로 돌리면 낮음', () => {
    const r = evaluateMove(m, seq(0, 700, rot(-1)), { targetMs: 600 })
    expect(r.quality).toBeLessThan(60)
  })
})

describe('Fold (관절 각도 변화)', () => {
  const m = move('fold')
  const fold = (t: number): ArmAngles => {
    const k = Math.min(1, Math.max(0, t / 500))
    // 팔꿈치 150° → 90°
    return {
      right: { upper: 0, fore: lerp(30, 90, k) }, // 어깨 방향 180°와의 각 = 150 → 90
      left: { upper: 180, fore: lerp(150, 90, k) },
    }
  }
  it('150° → 90°로 접으면 높음', () => {
    const r = evaluateMove(m, seq(0, 700, fold), { targetMs: 600 })
    expect(Math.abs(r.detail.right_startDeg - 150)).toBeLessThan(6) // 시작 직후 3프레임 평균이라 약간 접힌 값
    expect(r.detail.right_endDeg).toBeCloseTo(90, 0)
    expect(r.quality).toBeGreaterThan(90)
  })
  it('접지 않고 그대로 있으면 낮음', () => {
    const r = evaluateMove(m, seq(0, 700, () => fold(0)), { targetMs: 600 })
    expect(r.quality).toBeLessThan(60)
  })
})

describe('Arm Wave (시간 순서)', () => {
  const m = move('arm-wave')
  const BUMP_AT = { rw: 300, re: 500, le: 700, lw: 900 } // 오른손 → 오른 팔꿈치 → 왼 팔꿈치 → 왼손
  const bump = (t: number, at: number, amp: number) => amp * Math.exp(-(((t - at) / 150) ** 2))

  function waveFrames(order: Record<'rw' | 're' | 'le' | 'lw', number>): Frame[] {
    const out: Frame[] = []
    for (let t = 0; t <= 1200; t += 33) {
      const j = (x: number, y: number) => ({ x, y })
      out.push({
        tMs: t,
        tracked: true,
        arms: { right: null, left: null },
        joints: {
          rs: j(0.5, 0), ls: j(-0.5, 0),
          re: j(1.1, -0.6 + bump(t, order.re, 0.4)),
          rw: j(1.5, -0.6 + bump(t, order.rw, 0.5)),
          le: j(-1.1, -0.6 + bump(t, order.le, 0.4)),
          lw: j(-1.5, -0.6 + bump(t, order.lw, 0.5)),
        },
      })
    }
    return out
  }

  it('정해진 순서(오른손→왼손)로 물결이 지나가면 높음', () => {
    const r = evaluateMove(m, waveFrames(BUMP_AT), { targetMs: 1000 })
    expect(r.detail.orderScore).toBe(1)
    expect(r.quality).toBeGreaterThan(80)
  })
  it('반대 순서(왼손→오른손)면 낮음', () => {
    const r = evaluateMove(m, waveFrames({ lw: 300, le: 500, re: 700, rw: 900 }), { targetMs: 1000 })
    expect(r.detail.orderScore).toBeLessThan(0.5)
    expect(r.quality).toBeLessThan(60)
  })
  it('관절이 거의 안 움직이면 낮음 (웨이브로 보지 않음)', () => {
    const flat = waveFrames(BUMP_AT).map((f) => ({
      ...f,
      joints: { ...f.joints!, rw: { x: 1.5, y: -0.6 }, re: { x: 1.1, y: -0.6 }, le: { x: -1.1, y: -0.6 }, lw: { x: -1.5, y: -0.6 } },
    }))
    expect(evaluateMove(m, flat, { targetMs: 1000 }).quality).toBeLessThan(31)
  })
})

describe('자세형 (Box, Final Hit)', () => {
  it('Box: 양팔 프레임이면 100', () => {
    const r = evaluateMove(move('box'), seq(0, 800, () => FRAME_POSE), { targetMs: 400 })
    expect(r.quality).toBeCloseTo(100, 3)
  })
  it('Final Hit: 박스 자세로는 Good에도 못 미침 (왼팔 아랫팔 방향이 반대)', () => {
    const r = evaluateMove(move('final-hit'), seq(0, 800, () => FRAME_POSE), { targetMs: 400 })
    expect(r.quality).toBeLessThan(70)
  })
  it('Final Hit: 시범 마지막 자세는 높음', () => {
    const last = anglesAtBeat(
      [{ beat: 0, right: { upper: 0, fore: 90 }, left: { upper: 180, fore: -90 } }, { beat: 8, right: { upper: 0, fore: 90 }, left: { upper: 180, fore: -90 } }],
      1,
    )
    const r = evaluateMove(move('final-hit'), seq(0, 800, () => last), { targetMs: 400 })
    expect(r.quality).toBeGreaterThan(95)
  })
})

describe('인식 실패', () => {
  it('추적된 프레임이 너무 적으면 valid=false', () => {
    const frames = seq(0, 600, () => FRAME_POSE).map((f, i) => (i % 4 === 0 ? f : { ...f, tracked: false, joints: null }))
    const r = evaluateMove(move('box'), frames.slice(0, 5), { targetMs: 300 })
    expect(r.valid).toBe(false)
  })
})
