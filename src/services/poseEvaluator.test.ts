import { describe, expect, it } from 'vitest'
import { RIGHT_ANGLE } from '../data/poses'
import type { RawLandmark } from '../utils/geometry'
import { HoldTracker, POSE_INDEX, evaluatePose, measureArms } from './poseEvaluator'

const W = 1280
const H = 720
const DEG = Math.PI / 180

type Pt = [number, number]

/**
 * 33개 랜드마크를 만듭니다. 좌표는 "카메라 원본(거울 반전 전)" 기준입니다.
 * 원본에서는 사용자의 오른팔이 화면 "왼쪽"(x가 작은 쪽)에 있습니다.
 */
function makeLandmarks(arms: {
  rs?: Pt; re?: Pt; rw?: Pt; ls?: Pt; le?: Pt; lw?: Pt
}, visibility = 0.99): RawLandmark[] {
  const lms: RawLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility }))
  const set = (idx: number, p: Pt | undefined, fallback: Pt) => {
    const [x, y] = p ?? fallback
    lms[idx] = { x, y, visibility }
  }
  // 기본값: 두 팔을 자연스럽게 내린 상태
  set(POSE_INDEX.rightShoulder, arms.rs, [0.4, 0.5])
  set(POSE_INDEX.rightElbow, arms.re, [0.38, 0.7])
  set(POSE_INDEX.rightWrist, arms.rw, [0.38, 0.9])
  set(POSE_INDEX.leftShoulder, arms.ls, [0.6, 0.5])
  set(POSE_INDEX.leftElbow, arms.le, [0.62, 0.7])
  set(POSE_INDEX.leftWrist, arms.lw, [0.62, 0.9])
  return lms
}

// 오른팔 ㄱ자: 상완은 바깥(원본 x 감소)으로 수평, 전완은 위로 수직
const RIGHT_PERFECT = { rs: [0.4, 0.5] as Pt, re: [0.25, 0.5] as Pt, rw: [0.25, 0.25] as Pt }

/** 전완을 수직에서 바깥쪽으로 deg만큼 기울인 손목 위치 */
function wristTiltedOutward(deg: number): Pt {
  const dxPx = 180 * Math.tan(deg * DEG) // 전완 길이 180px (0.25*720)
  return [0.25 - dxPx / W, 0.25]
}

function evalRight(arms: Parameters<typeof makeLandmarks>[0]) {
  const m = measureArms(makeLandmarks(arms), W, H)
  expect(m.right).not.toBeNull()
  return { m, ev: evaluatePose(RIGHT_ANGLE, m.right!) }
}

describe('measureArms (좌표 → 각도)', () => {
  it('완벽한 ㄱ자: 팔꿈치 90°, 상완 0°, 전완 90°', () => {
    const m = measureArms(makeLandmarks(RIGHT_PERFECT), W, H)
    expect(m.tracking.status).toBe('ok')
    expect(m.right!.elbowAngleDeg).toBeCloseTo(90, 4)
    expect(m.right!.upperArmDirectionDeg).toBeCloseTo(0, 4)
    expect(m.right!.forearmDirectionDeg).toBeCloseTo(90, 4)
  })

  it('왼팔은 디버그용으로만 계산되고 오른팔 판정에 영향 없음', () => {
    const m = measureArms(makeLandmarks(RIGHT_PERFECT), W, H)
    expect(m.left).not.toBeNull()
    const idle = evaluatePose(RIGHT_ANGLE, m.right!)
    expect(idle.verdict).toBe('perfect')
  })

  it('사람이 없으면 no-person', () => {
    expect(measureArms(undefined, W, H).tracking.status).toBe('no-person')
    expect(measureArms([], W, H).tracking.status).toBe('no-person')
  })

  it('손목이 화면 밖이면 out-of-frame, 판정 대상 없음', () => {
    const m = measureArms(makeLandmarks({ ...RIGHT_PERFECT, rw: [0.25, 1.2] }), W, H)
    expect(m.tracking.status).toBe('out-of-frame')
    expect(m.right).toBeNull()
  })

  it('신뢰도가 낮으면 unstable', () => {
    const lms = makeLandmarks(RIGHT_PERFECT)
    lms[POSE_INDEX.rightWrist] = { x: 0.25, y: 0.25, visibility: 0.2 }
    const m = measureArms(lms, W, H)
    expect(m.tracking.status).toBe('unstable')
    expect(m.right).toBeNull()
  })

  it('왼팔 신뢰도가 낮아도 오른팔 판정은 가능', () => {
    const lms = makeLandmarks(RIGHT_PERFECT)
    lms[POSE_INDEX.leftWrist] = { x: 0.62, y: 0.9, visibility: 0.1 }
    expect(measureArms(lms, W, H).tracking.status).toBe('ok')
  })
})

describe('evaluatePose (자세 판정)', () => {
  it('정확한 자세는 perfect + 유사도 100', () => {
    const { ev } = evalRight(RIGHT_PERFECT)
    expect(ev.verdict).toBe('perfect')
    expect(ev.inTolerance).toBe(true)
    expect(ev.similarity).toBeCloseTo(100, 4)
  })

  it('허용 오차(10°) 안의 약간 틀린 자세도 perfect', () => {
    const { ev, m } = evalRight({ ...RIGHT_PERFECT, rw: wristTiltedOutward(10) })
    expect(m.right!.elbowAngleDeg).toBeCloseTo(100, 3)
    expect(ev.verdict).toBe('perfect')
  })

  it('팔꿈치 허용 오차를 살짝 넘으면 good (유사도는 높지만 정답 범위 밖)', () => {
    const { ev } = evalRight({ ...RIGHT_PERFECT, rw: wristTiltedOutward(19) })
    expect(ev.inTolerance).toBe(false)
    expect(ev.verdict).toBe('good')
    expect(ev.similarity).toBeGreaterThanOrEqual(70)
  })

  it('팔꿈치만 90°이고 전완이 아래를 향하면 adjust (각도만으로 판정하지 않음)', () => {
    const { m, ev } = evalRight({ ...RIGHT_PERFECT, rw: [0.25, 0.75] })
    expect(m.right!.elbowAngleDeg).toBeCloseTo(90, 4)
    expect(m.right!.forearmDirectionDeg).toBeCloseTo(-90, 4)
    expect(ev.verdict).toBe('adjust')
    expect(ev.hint).toContain('전완')
  })

  it('팔이 몸 안쪽을 향하는 좌우 혼동 자세는 adjust', () => {
    // 상완이 사용자 왼쪽(몸 안쪽)을 향함: 원본 x 증가
    const { m, ev } = evalRight({ rs: [0.4, 0.5], re: [0.55, 0.5], rw: [0.55, 0.25] })
    expect(Math.abs(m.right!.upperArmDirectionDeg)).toBeCloseTo(180, 3)
    expect(ev.verdict).toBe('adjust')
  })

  it('왼팔로만 ㄱ자를 만들면(오른팔은 내림) adjust', () => {
    const { m, ev } = evalRight({
      ls: [0.6, 0.5], le: [0.75, 0.5], lw: [0.75, 0.25], // 왼팔 ㄱ자 (원본 기준 오른쪽)
    })
    expect(m.left!.forearmDirectionDeg).toBeCloseTo(90, 3)
    expect(ev.verdict).toBe('adjust')
  })

  it('팔을 쭉 펴면 adjust + "굽혀" 안내', () => {
    const { m, ev } = evalRight({ ...RIGHT_PERFECT, rw: [0.1, 0.5] })
    expect(m.right!.elbowAngleDeg).toBeCloseTo(180, 3)
    expect(ev.verdict).toBe('adjust')
    expect(ev.hint).toContain('굽혀')
  })

  it('팔꿈치가 어깨보다 낮으면 "올려" 안내', () => {
    // 상완이 35° 처지고(방향 -35°), 전완은 80°로 세움 → 상완 오차가 가장 큼
    const re: Pt = [0.4 - (150 * Math.cos(35 * DEG)) / W, 0.5 + (150 * Math.sin(35 * DEG)) / H]
    const rw: Pt = [re[0] - (180 * Math.cos(80 * DEG)) / W, re[1] - (180 * Math.sin(80 * DEG)) / H]
    const { ev } = evalRight({ rs: [0.4, 0.5], re, rw })
    expect(ev.errors.upperArmDirectionDeg).toBeCloseTo(-35, 3)
    expect(ev.hint).toContain('올려')
  })

  it('가로세로 비율이 다른 영상에서도 각도가 왜곡되지 않음 (정사각 영상)', () => {
    // 정규화 좌표를 정사각 영상(1000x1000)으로 해석해도 수직/수평이 90°
    const m = measureArms(
      makeLandmarks({ rs: [0.4, 0.5], re: [0.25, 0.5], rw: [0.25, 0.35] }), 1000, 1000,
    )
    expect(m.right!.elbowAngleDeg).toBeCloseTo(90, 4)
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
    t.update(300, 'in') // 300ms 누적
    t.update(400, 'untracked')
    const s = t.update(600, 'untracked') // 실패 200ms: 아직 유예
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
