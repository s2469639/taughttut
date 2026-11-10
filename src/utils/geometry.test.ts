import { describe, expect, it } from 'vitest'
import { angleAtDeg, angleDiffDeg, directionDeg, normalizeAngleDeg, toUserView } from './geometry'

describe('angleAtDeg (팔꿈치 각도)', () => {
  it('직각은 90°', () => {
    expect(angleAtDeg({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 6)
  })
  it('일직선은 180°', () => {
    expect(angleAtDeg({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(180, 6)
  })
  it('완전히 접으면 0°', () => {
    expect(angleAtDeg({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 9, y: 0 })).toBeCloseTo(0, 6)
  })
  it('45° 예시', () => {
    expect(angleAtDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(45, 6)
  })
  it('두 점이 같으면 null', () => {
    expect(angleAtDeg({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 3, y: 3 })).toBeNull()
  })
})

describe('directionDeg (화면 기준 방향)', () => {
  const o = { x: 0, y: 0 }
  it('오른쪽 0°, 위 90°, 왼쪽 180°, 아래 -90°', () => {
    expect(directionDeg(o, { x: 5, y: 0 })).toBeCloseTo(0, 6)
    expect(directionDeg(o, { x: 0, y: -5 })).toBeCloseTo(90, 6) // 화면 y는 위가 작은 값
    expect(directionDeg(o, { x: -5, y: 0 })).toBeCloseTo(180, 6)
    expect(directionDeg(o, { x: 0, y: 5 })).toBeCloseTo(-90, 6)
  })
  it('같은 점이면 null', () => {
    expect(directionDeg(o, o)).toBeNull()
  })
})

describe('각도 정규화', () => {
  it('360° 래핑', () => {
    expect(normalizeAngleDeg(190)).toBeCloseTo(-170, 6)
    expect(normalizeAngleDeg(-190)).toBeCloseTo(170, 6)
    expect(angleDiffDeg(170, -170)).toBeCloseTo(-20, 6)
    expect(angleDiffDeg(-170, 170)).toBeCloseTo(20, 6)
  })
})

describe('toUserView (거울 + 비율 보정)', () => {
  it('x를 뒤집고 픽셀 크기를 곱함', () => {
    expect(toUserView({ x: 0.25, y: 0.5 }, 1000, 500)).toEqual({ x: 750, y: 250 })
  })
})
