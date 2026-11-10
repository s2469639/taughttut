import { describe, expect, it } from 'vitest'
import { HIGHWAY, depthProgress, halfWidthAt, projectY, scaleAt } from './highway'

describe('하이웨이 원근', () => {
  it('남은 시간 0 = 판정선, 먼 끝 = farY', () => {
    expect(projectY(depthProgress(0))).toBeCloseTo(HIGHWAY.hitY, 6)
    expect(projectY(depthProgress(HIGHWAY.lookaheadMs))).toBeCloseTo(HIGHWAY.farY, 6)
  })

  it('가까워질수록 아래로 내려오고, 점점 빨라짐(원근)', () => {
    const ys = [2400, 1800, 1200, 600, 0].map((t) => projectY(depthProgress(t)))
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1])
    const steps = ys.slice(1).map((y, i) => y - ys[i])
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1])
  })

  it('판정선을 지나도 바닥을 넘지 않음', () => {
    expect(projectY(depthProgress(-5000))).toBeLessThanOrEqual(HIGHWAY.bottomY)
  })

  it('레인 반폭은 소실점에서 0, 판정선에서 halfWidthHit (직선 원근)', () => {
    expect(halfWidthAt(HIGHWAY.vpY)).toBeCloseTo(0, 9)
    expect(halfWidthAt(HIGHWAY.hitY)).toBeCloseTo(HIGHWAY.halfWidthHit, 9)
    const mid = (HIGHWAY.vpY + HIGHWAY.hitY) / 2
    expect(halfWidthAt(mid)).toBeCloseTo(HIGHWAY.halfWidthHit / 2, 9)
  })

  it('타일 배율은 판정선에서 1, 멀수록 작음', () => {
    expect(scaleAt(HIGHWAY.hitY)).toBeCloseTo(1, 9)
    expect(scaleAt(HIGHWAY.farY)).toBeLessThan(0.5)
  })
})
