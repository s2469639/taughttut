import { describe, expect, it } from 'vitest'
import { FRAME, LEFT_ANGLE, RIGHT_ANGLE } from '../data/poses'
import { HoldTracker, POSE_INDEX, measureArms } from './poseEvaluator'
import { DEG, H, LEFT_L, RIGHT_L, W, makeLandmarks, measureAndEvaluate, rightWristTiltedOutward, type Pt } from './testUtils'

function right(arms: Parameters<typeof makeLandmarks>[0]) {
  const { m, ev } = measureAndEvaluate(RIGHT_ANGLE, arms)
  expect(ev).not.toBeNull()
  return { m, ev: ev! }
}

describe('measureArms (좌표 → 각도)', () => {
  it('완벽한 ㄱ자: 팔꿈치 90°, 윗팔 0°, 아랫팔 90°', () => {
    const m = measureArms(makeLandmarks(RIGHT_L), W, H)
    expect(m.tracking.status).toBe('ok')
    expect(m.right!.elbowAngleDeg).toBeCloseTo(90, 4)
    expect(m.right!.upperArmDirectionDeg).toBeCloseTo(0, 4)
    expect(m.right!.forearmDirectionDeg).toBeCloseTo(90, 4)
  })

  it('왼팔 ㄱ자: 윗팔 180°(화면 왼쪽), 아랫팔 90°', () => {
    const m = measureArms(makeLandmarks(LEFT_L), W, H)
    expect(m.left!.elbowAngleDeg).toBeCloseTo(90, 4)
    expect(m.left!.upperArmDirectionDeg).toBeCloseTo(180, 4)
    expect(m.left!.forearmDirectionDeg).toBeCloseTo(90, 4)
  })

  it('사람이 없으면 no-person', () => {
    expect(measureArms(undefined, W, H).tracking.status).toBe('no-person')
    expect(measureArms([], W, H).tracking.status).toBe('no-person')
  })

  it('손목이 화면 밖이면 out-of-frame, 판정 대상 없음', () => {
    const m = measureArms(makeLandmarks({ ...RIGHT_L, rw: [0.25, 1.2] }), W, H)
    expect(m.tracking.status).toBe('out-of-frame')
    expect(m.right).toBeNull()
  })

  it('신뢰도가 낮으면 unstable', () => {
    const lms = makeLandmarks(RIGHT_L)
    lms[POSE_INDEX.rightWrist] = { x: 0.25, y: 0.25, visibility: 0.2 }
    const m = measureArms(lms, W, H)
    expect(m.tracking.status).toBe('unstable')
    expect(m.right).toBeNull()
  })

  it('필요 없는 팔(왼팔)의 신뢰도가 낮아도 오른팔 판정은 가능', () => {
    const lms = makeLandmarks(RIGHT_L)
    lms[POSE_INDEX.leftWrist] = { x: 0.62, y: 0.9, visibility: 0.1 }
    expect(measureArms(lms, W, H, ['right']).tracking.status).toBe('ok')
  })

  it('양팔 포즈에서는 왼팔이 화면 밖이어도 추적 실패', () => {
    const m = measureArms(makeLandmarks({ ...RIGHT_L, ...LEFT_L, lw: [0.75, -0.3] }), W, H, ['right', 'left'])
    expect(m.tracking.status).toBe('out-of-frame')
    expect(m.right).toBeNull()
    expect(m.left).toBeNull()
  })
})

describe('Right Angle 판정 (오른팔, 기존 기능 유지)', () => {
  it('정확한 자세는 perfect + 일치도 100', () => {
    const { ev } = right(RIGHT_L)
    expect(ev.verdict).toBe('perfect')
    expect(ev.inTolerance).toBe(true)
    expect(ev.similarity).toBeCloseTo(100, 4)
  })

  it('허용 범위(10°) 안의 약간 틀린 자세도 perfect', () => {
    const { ev, m } = right({ ...RIGHT_L, rw: rightWristTiltedOutward(10) })
    expect(m.right!.elbowAngleDeg).toBeCloseTo(100, 3)
    expect(ev.verdict).toBe('perfect')
  })

  it('팔꿈치 허용 범위를 살짝 넘으면 good', () => {
    const { ev } = right({ ...RIGHT_L, rw: rightWristTiltedOutward(19) })
    expect(ev.inTolerance).toBe(false)
    expect(ev.verdict).toBe('good')
    expect(ev.similarity).toBeGreaterThanOrEqual(70)
  })

  it('팔꿈치만 90°이고 아랫팔이 아래를 향하면 adjust (각도만으로 판정하지 않음)', () => {
    const { m, ev } = right({ ...RIGHT_L, rw: [0.25, 0.75] })
    expect(m.right!.elbowAngleDeg).toBeCloseTo(90, 4)
    expect(m.right!.forearmDirectionDeg).toBeCloseTo(-90, 4)
    expect(ev.verdict).toBe('adjust')
    expect(ev.hint).toContain('아랫팔')
  })

  it('팔이 몸 안쪽을 향하는 좌우 혼동 자세는 adjust', () => {
    const { m, ev } = right({ rs: [0.4, 0.5], re: [0.55, 0.5], rw: [0.55, 0.25] })
    expect(Math.abs(m.right!.upperArmDirectionDeg)).toBeCloseTo(180, 3)
    expect(ev.verdict).toBe('adjust')
  })

  it('왼팔로만 ㄱ자를 만들면(오른팔은 내림) adjust', () => {
    const { m, ev } = right(LEFT_L)
    expect(m.left!.forearmDirectionDeg).toBeCloseTo(90, 3)
    expect(ev.verdict).toBe('adjust')
  })

  it('팔을 쭉 펴면 adjust + "굽혀" 안내', () => {
    const { m, ev } = right({ ...RIGHT_L, rw: [0.1, 0.5] })
    expect(m.right!.elbowAngleDeg).toBeCloseTo(180, 3)
    expect(ev.verdict).toBe('adjust')
    expect(ev.hint).toContain('굽혀')
  })

  it('팔꿈치가 어깨보다 낮으면 "올려" 안내', () => {
    const re: Pt = [0.4 - (150 * Math.cos(35 * DEG)) / W, 0.5 + (150 * Math.sin(35 * DEG)) / H]
    const rw: Pt = [re[0] - (180 * Math.cos(80 * DEG)) / W, re[1] - (180 * Math.sin(80 * DEG)) / H]
    const { ev } = right({ rs: [0.4, 0.5], re, rw })
    expect(ev.errors.right!.upperArmDirectionDeg).toBeCloseTo(-35, 3)
    expect(ev.hint).toContain('올려')
  })

  it('가로세로 비율이 다른 영상에서도 각도가 왜곡되지 않음 (정사각 영상)', () => {
    const m = measureArms(makeLandmarks({ rs: [0.4, 0.5], re: [0.25, 0.5], rw: [0.25, 0.35] }), 1000, 1000)
    expect(m.right!.elbowAngleDeg).toBeCloseTo(90, 4)
  })
})

describe('Left Angle 판정 (왼팔)', () => {
  it('왼팔 ㄱ자는 perfect, 오른팔은 자유(평가 안 함)', () => {
    const { ev } = measureAndEvaluate(LEFT_ANGLE, LEFT_L) // 오른팔은 내린 채
    expect(ev!.verdict).toBe('perfect')
    expect(ev!.errors.right).toBeUndefined()
  })

  it('오른팔로 같은 자세를 하면(왼팔은 내림) adjust — 좌우 혼동 방지', () => {
    const { ev } = measureAndEvaluate(LEFT_ANGLE, RIGHT_L)
    expect(ev!.verdict).toBe('adjust')
  })

  it('왼팔 윗팔이 처지면 "올려" 안내 (좌우 부호가 오른팔과 반대)', () => {
    // 윗팔 방향 215°(= -145°, 아래로 35° 처짐), 아랫팔 100°(바깥쪽으로 10° 기울임)
    const le: Pt = [0.6 + (150 * 0.8192) / W, 0.5 + (150 * 0.5736) / H]
    const lw: Pt = [le[0] + (180 * 0.1736) / W, le[1] - (180 * 0.9848) / H]
    const { ev } = measureAndEvaluate(LEFT_ANGLE, { ls: [0.6, 0.5], le, lw })
    expect(ev!.errors.left!.upperArmDirectionDeg).toBeCloseTo(35, 1)
    expect(ev!.hint).toContain('올려')
  })
})

describe('Frame 판정 (양팔)', () => {
  const both = { ...RIGHT_L, ...LEFT_L }

  it('대칭 ㄱ자 두 개는 perfect + 일치도 100 + 균형 오차 0', () => {
    const { ev } = measureAndEvaluate(FRAME, both)
    expect(ev!.verdict).toBe('perfect')
    expect(ev!.similarity).toBeCloseTo(100, 4)
    expect(ev!.balance!.elbowDiffDeg).toBeCloseTo(0, 4)
    expect(ev!.balance!.wristHeightDiffRatio).toBeCloseTo(0, 4)
  })

  it('한 팔만 ㄱ자이면(다른 팔은 내림) adjust', () => {
    expect(measureAndEvaluate(FRAME, RIGHT_L).ev!.verdict).toBe('adjust')
    expect(measureAndEvaluate(FRAME, LEFT_L).ev!.verdict).toBe('adjust')
  })

  it('양쪽 손 높이 차이가 허용 범위 안(약 15%)이면 perfect', () => {
    const { ev } = measureAndEvaluate(FRAME, { ...both, lw: [0.75, 0.21] })
    expect(ev!.balance!.wristHeightDiffRatio).toBeLessThan(0.25)
    expect(ev!.verdict).toBe('perfect')
  })

  it('손 높이 차이가 조금 크면(약 28%) good', () => {
    const { ev } = measureAndEvaluate(FRAME, { ...both, lw: [0.75, 0.17] })
    expect(ev!.balance!.wristHeightDiffRatio).toBeGreaterThan(0.25)
    expect(ev!.verdict).toBe('good')
    expect(ev!.similarity).toBeGreaterThanOrEqual(90)
  })

  it('한쪽 손만 많이 낮으면 adjust + "손 높이" 안내', () => {
    const { ev } = measureAndEvaluate(FRAME, { ...both, lw: [0.75, 0.4] })
    expect(ev!.verdict).toBe('adjust')
    expect(ev!.hint).toContain('높이')
  })

  it('양팔 포즈의 안내에는 어느 팔인지 표시', () => {
    const { ev } = measureAndEvaluate(FRAME, { ...both, lw: [0.95, 0.5] }) // 왼팔 쭉 폄
    expect(ev!.hint).toContain('왼팔')
    expect(ev!.hint).toContain('굽혀')
  })
})

describe('HoldTracker (유지 시간)', () => {
  it('0.7초 유지하면 cleared', () => {
    const t = new HoldTracker(700)
    let s = t.update(0, 'in')
    for (let now = 100; now <= 600; now += 100) s = t.update(now, 'in')
    expect(s.cleared).toBe(false)
    expect(s.heldMs).toBe(600)
    s = t.update(700, 'in')
    expect(s.cleared).toBe(true)
    expect(s.heldMs).toBe(700)
  })

  it('범위를 벗어나면 즉시 0으로 초기화', () => {
    const t = new HoldTracker(700)
    t.update(0, 'in')
    t.update(300, 'in')
    const s = t.update(400, 'out')
    expect(s.heldMs).toBe(0)
    expect(s.cleared).toBe(false)
  })

  it('짧은 추적 실패(유예 이내)는 시간을 멈추고 유지, 오답 처리하지 않음', () => {
    const t = new HoldTracker(700, 500)
    t.update(0, 'in')
    t.update(300, 'in')
    t.update(400, 'untracked')
    const s = t.update(600, 'untracked')
    expect(s.heldMs).toBe(300)
    expect(s.paused).toBe(false)
  })

  it('유예를 넘겨 추적이 끊기면 초기화하고 paused', () => {
    const t = new HoldTracker(700, 500)
    t.update(0, 'in')
    t.update(300, 'in')
    t.update(400, 'untracked')
    const s = t.update(1000, 'untracked')
    expect(s.heldMs).toBe(0)
    expect(s.paused).toBe(true)
  })

  it('성공은 reset 전까지 유지됨', () => {
    const t = new HoldTracker(700)
    t.update(0, 'in')
    t.update(800, 'in')
    expect(t.update(900, 'out').cleared).toBe(true)
    t.reset()
    expect(t.update(1000, 'out').cleared).toBe(false)
  })
})
