import { describe, expect, it } from 'vitest'
import { FRAME, LEFT_ANGLE, RIGHT_ANGLE } from '../data/poses'
import { LessonRunner } from './lessonRunner'
import { measureArms } from './poseEvaluator'
import { H, LEFT_L, RIGHT_L, W, makeLandmarks } from './testUtils'

/** 러너에게 일정 시간 동안 같은 자세를 보여 줌 (100ms 간격) */
function feed(runner: LessonRunner, from: number, toMs: number, arms: Parameters<typeof makeLandmarks>[0]) {
  let t = from
  let s = runner.state
  for (; t <= toMs; t += 100) {
    s = runner.update(t, measureArms(makeLandmarks(arms), W, H, runner.required))
  }
  return { t, s }
}

describe('LessonRunner', () => {
  it('포즈 1개 레슨: 0.7초 유지하면 done', () => {
    const r = new LessonRunner([RIGHT_ANGLE])
    expect(feed(r, 0, 500, RIGHT_L).s.done).toBe(false)
    expect(feed(r, 600, 900, RIGHT_L).s.done).toBe(true)
  })

  it('틀린 자세에서는 진행하지 않음', () => {
    const r = new LessonRunner([RIGHT_ANGLE])
    expect(feed(r, 0, 3000, LEFT_L).s.done).toBe(false)
  })

  it('플로우: 정해진 순서대로 통과해야 하고, 단계별 걸린 시간을 기록', () => {
    const r = new LessonRunner([RIGHT_ANGLE, LEFT_ANGLE, FRAME])
    let { t, s } = feed(r, 0, 900, RIGHT_L)
    expect(s.stepIndex).toBe(1) // 첫 자세 통과 → 두 번째로
    expect(s.pose.id).toBe('left-angle')
    expect(s.stepTimesMs).toHaveLength(1)

    // 순서를 건너뛰어 프레임(양팔)부터 하면, 왼팔 ㄱ자 조건이 아니므로 진행 안 함
    ;({ t, s } = feed(r, t, t + 2000, RIGHT_L))
    expect(s.stepIndex).toBe(1)

    ;({ t, s } = feed(r, t, t + 900, LEFT_L))
    expect(s.stepIndex).toBe(2)
    expect(s.pose.id).toBe('frame')
    expect(s.done).toBe(false)

    ;({ s } = feed(r, t, t + 900, { ...RIGHT_L, ...LEFT_L }))
    expect(s.done).toBe(true)
    expect(s.stepTimesMs).toHaveLength(3)
  })

  it('단계마다 필요한 팔이 바뀜 (오른팔 → 왼팔 → 양팔)', () => {
    const r = new LessonRunner([RIGHT_ANGLE, LEFT_ANGLE, FRAME])
    expect(r.required).toEqual(['right'])
    const { t } = feed(r, 0, 900, RIGHT_L)
    expect(r.required).toEqual(['left'])
    feed(r, t, t + 900, LEFT_L)
    expect(r.required).toEqual(['right', 'left'])
  })

  it('reset 하면 처음부터', () => {
    const r = new LessonRunner([RIGHT_ANGLE])
    feed(r, 0, 900, RIGHT_L)
    expect(r.state.done).toBe(true)
    r.reset()
    expect(r.state.done).toBe(false)
    expect(r.state.stepIndex).toBe(0)
  })
})
