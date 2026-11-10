// 레슨 진행기: 포즈 목록을 순서대로 통과시키는 상태 기계 (카메라 없이 테스트 가능)
//  - 포즈가 1개면 "그 자세를 유지하면 통과"
//  - 여러 개면 "순서대로 각 자세에 도달하면 통과" (박자 없는 플로우 연습)
// 박자(비트)에 맞춘 타이밍 평가는 리듬 챌린지 단계에서 추가합니다.

import type { ArmSide, PoseDefinition } from '../data/poses'
import {
  HoldTracker,
  evaluatePose,
  requiredArms,
  type ArmsMeasurement,
  type HoldState,
  type PoseEvaluation,
} from './poseEvaluator'

export interface RunnerState {
  pose: PoseDefinition
  /** 현재 단계 (0부터). 모두 끝나면 마지막 단계에 머무름 */
  stepIndex: number
  totalSteps: number
  done: boolean
  evaluation: PoseEvaluation | null
  hold: HoldState
  /** 이미 통과한 단계별 걸린 시간(ms). 2번째 단계부터는 "자세를 바꾸는 데 걸린 시간" */
  stepTimesMs: number[]
}

export class LessonRunner {
  private step = 0
  private done = false
  private tracker: HoldTracker
  private stepStartMs: number | null = null
  private stepTimes: number[] = []
  private last: RunnerState

  constructor(private readonly poses: readonly PoseDefinition[]) {
    if (poses.length === 0) throw new Error('LessonRunner: poses is empty')
    this.tracker = new HoldTracker(poses[0].holdDurationMs)
    this.last = this.snapshot(null, { heldMs: 0, cleared: false, paused: false })
  }

  /** 지금 단계에서 판정에 필요한 팔 (measureArms의 required 인자로 사용) */
  get required(): ArmSide[] {
    return requiredArms(this.poses[Math.min(this.step, this.poses.length - 1)])
  }

  get state(): RunnerState {
    return this.last
  }

  update(nowMs: number, arms: ArmsMeasurement): RunnerState {
    if (this.done) return this.last
    if (this.stepStartMs === null) this.stepStartMs = nowMs

    const pose = this.poses[this.step]
    const evaluation = arms.tracking.status === 'ok' ? evaluatePose(pose, arms) : null
    const hold = this.tracker.update(nowMs, evaluation ? (evaluation.inTolerance ? 'in' : 'out') : 'untracked')

    if (hold.cleared) {
      this.stepTimes.push(nowMs - this.stepStartMs)
      if (this.step + 1 >= this.poses.length) {
        this.done = true
        this.last = this.snapshot(evaluation, hold)
        return this.last
      }
      // 다음 자세로: 유지 시간 측정을 새로 시작
      this.step++
      this.tracker = new HoldTracker(this.poses[this.step].holdDurationMs)
      this.stepStartMs = nowMs
      this.last = this.snapshot(null, { heldMs: 0, cleared: false, paused: false })
      return this.last
    }

    this.last = this.snapshot(evaluation, hold)
    return this.last
  }

  reset(): void {
    this.step = 0
    this.done = false
    this.tracker = new HoldTracker(this.poses[0].holdDurationMs)
    this.stepStartMs = null
    this.stepTimes = []
    this.last = this.snapshot(null, { heldMs: 0, cleared: false, paused: false })
  }

  private snapshot(evaluation: PoseEvaluation | null, hold: HoldState): RunnerState {
    return {
      pose: this.poses[Math.min(this.step, this.poses.length - 1)],
      stepIndex: Math.min(this.step, this.poses.length - 1),
      totalSteps: this.poses.length,
      done: this.done,
      evaluation,
      hold,
      stepTimesMs: [...this.stepTimes],
    }
  }
}
