import { describe, expect, it } from 'vitest'
import { FIRST_TUT_FLOW, RHYTHM_JUDGE } from '../data/challenge'
import { ChallengeRunner, buildSchedule, judge, maxScoreOf, rankOf, songPosition, totalMsOf } from './challengeRunner'
import { performFrames, type ArmAngles } from './challengeTestUtils'
import type { Frame } from './motionFrame'

const def = FIRST_TUT_FLOW

/** 프레임을 시간 순서대로 넣으며 tick */
function run(frames: Frame[]) {
  const r = new ChallengeRunner(def)
  for (const f of frames) {
    r.pushFrame(f)
    r.tick(f.tMs - 50) // 프레임이 도착한 뒤 약간 지연된 시각까지 평가
  }
  r.tick(totalMsOf(def) + 1000)
  return r
}

describe('타임라인 (100BPM, 8카운트 × 4회)', () => {
  it('한 카운트 = 600ms, 안무 구간 약 19.2초, 전체 약 24초', () => {
    expect(60000 / def.bpm).toBe(600)
    expect(def.beatsPerSequence * def.repeatCount * 600).toBe(19200)
    expect(totalMsOf(def)).toBe((4 + 32 + 2) * 600)
  })

  it('이벤트는 6동작 × 4회 = 24개, 평가 종료 시각순', () => {
    const s = buildSchedule(def)
    expect(s).toHaveLength(24)
    for (let i = 1; i < s.length; i++) expect(s[i].windowEndMs).toBeGreaterThanOrEqual(s[i - 1].windowEndMs)
  })

  it('첫 Box의 목표 시각 = (카운트다운 4 + 2박) × 600ms', () => {
    const box = buildSchedule(def).find((e) => e.key === '0:box')!
    expect(box.targetMs).toBe(6 * 600)
  })

  it('songPosition: 카운트다운 → 안무 → 끝', () => {
    expect(songPosition(def, -100).phase).toBe('precount')
    expect(songPosition(def, 0)).toMatchObject({ phase: 'countdown', countdownLeft: 4 })
    expect(songPosition(def, 1900)).toMatchObject({ phase: 'countdown', countdownLeft: 1 })
    expect(songPosition(def, 2400)).toMatchObject({ phase: 'dance', loop: 1, count: 1 })
    expect(songPosition(def, 2400 + 600 * 9)).toMatchObject({ phase: 'dance', loop: 2, count: 2 })
    expect(songPosition(def, 2400 + 19200 + 100).phase).toBe('ending')
    expect(songPosition(def, totalMsOf(def) + 1).phase).toBe('done')
  })
})

describe('judge (완성도 + 박자)', () => {
  it('완성도가 높고 박자가 맞으면 perfect', () => {
    expect(judge(90, 100)).toBe('perfect')
  })
  it('완성도는 높지만 박자가 어긋나면 good, 많이 어긋나면 miss', () => {
    expect(judge(95, 200)).toBe('good')
    expect(judge(95, 400)).toBe('miss')
  })
  it('박자는 맞지만 자세가 틀리면 good 또는 miss', () => {
    expect(judge(75, 0)).toBe('good')
    expect(judge(50, 0)).toBe('miss')
  })
  it('동작형은 박자 범위를 timingScale 만큼 넉넉하게', () => {
    expect(judge(95, 280, 1)).toBe('miss')
    expect(judge(95, 280, 2)).toBe('perfect')
  })
  it('박자를 알 수 없으면 최대 good', () => {
    expect(judge(99, null)).toBe('good')
    expect(judge(10, null)).toBe('miss')
  })
})

describe('점수와 등급', () => {
  it('만점 계산: 24동작, 콤보 보너스 최대 +100%', () => {
    expect(maxScoreOf(def)).toBe(4250)
  })
  it('등급', () => {
    const max = maxScoreOf(def)
    expect(rankOf(max, max)).toBe('S')
    expect(rankOf(max * 0.8, max)).toBe('A')
    expect(rankOf(max * 0.6, max)).toBe('B')
    expect(rankOf(max * 0.2, max)).toBe('C')
  })
})

describe('가상 연기자 (⚠️ 로직의 자기 일관성 확인용, 실제 사람 검증 아님)', () => {
  it('인식이 계속 안 되면 전부 miss, 점수 0', () => {
    const r = run(performFrames(def, { untrackedBetween: [[0, 1e9]] }))
    expect(r.state.counts.miss).toBe(24)
    expect(r.state.score).toBe(0)
    expect(r.state.results[0].reason).toBeTruthy()
    expect(r.state.finished).toBe(true)
  })

  it('가만히 서 있으면(팔을 내린 채) 거의 miss', () => {
    const idle: ArmAngles = { right: { upper: -90, fore: -90 }, left: { upper: -90, fore: -90 } }
    const r = run(performFrames(def, { custom: () => idle }))
    expect(r.state.counts.miss).toBeGreaterThanOrEqual(22)
  })

  it('한 자세(프레임)만 계속 취하고 있으면 움직임 동작에서 점수를 얻지 못함', () => {
    const frame: ArmAngles = { right: { upper: 0, fore: 90 }, left: { upper: 180, fore: 90 } }
    const r = run(performFrames(def, { custom: () => frame }))
    const byKind = (k: string) => r.state.results.filter((x) => x.kind === k)
    expect(byKind('slide').every((x) => x.judgement === 'miss')).toBe(true)
    expect(byKind('rotate').every((x) => x.judgement === 'miss')).toBe(true)
    expect(byKind('wave').every((x) => x.judgement === 'miss')).toBe(true)
    expect(byKind('fold').every((x) => x.judgement === 'miss')).toBe(true)
    // 박스는 정지 자세라 맞음 (정지 자세 반복만으로는 만점이 안 된다는 점 확인)
    expect(r.state.score).toBeLessThan(maxScoreOf(def) * 0.35)
  })

  it('시범 동작을 박자에 맞춰 수행하면 대부분 성공', () => {
    const r = run(performFrames(def))
    const { perfect, good, miss } = r.state.counts
    // 결과를 눈으로 확인할 수 있게 실패 사유를 메시지에 포함
    const detail = r.state.results
      .filter((x) => x.judgement === 'miss')
      .map((x) => `${x.key} q=${x.quality.toFixed(0)} off=${x.offsetMs?.toFixed(0)}`)
      .join(' | ')
    expect(miss, `miss 목록: ${detail}`).toBeLessThanOrEqual(2)
    expect(perfect + good).toBeGreaterThanOrEqual(22)
    expect(r.state.maxCombo).toBeGreaterThanOrEqual(10)
  })

  it('박자가 0.7초 늦으면 대부분 miss', () => {
    const r = run(performFrames(def, { lateMs: 700 }))
    expect(r.state.counts.miss).toBeGreaterThanOrEqual(16)
  })

  it('박자가 조금(0.1초) 늦은 정도는 대부분 통과', () => {
    const r = run(performFrames(def, { lateMs: 100 }))
    expect(r.state.counts.miss).toBeLessThanOrEqual(3)
  })

  it('콤보는 miss에서 끊기고 점수 보너스는 이전 콤보를 반영', () => {
    const r = run(performFrames(def))
    const results = r.state.results
    expect(results[0].points).toBe(results[0].judgement === 'perfect' ? 100 : results[0].judgement === 'good' ? 60 : 0)
    const J = RHYTHM_JUDGE
    const second = results[1]
    if (results[0].judgement !== 'miss' && second.judgement === 'perfect') {
      expect(second.points).toBe(Math.round(100 * (1 + J.comboBonusStep * 1)))
    }
  })
})
