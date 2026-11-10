import type { Lesson } from '../data/lessons'
import type { ArmSide } from '../data/poses'
import type { TrackingSnapshot } from '../hooks/usePoseTracking'
import type { Verdict } from '../services/poseEvaluator'
import PoseGuide from './PoseGuide'

export const VERDICT_LABEL: Record<Verdict, string> = {
  perfect: 'PERFECT',
  good: 'GOOD',
  adjust: 'ADJUST',
}

const VERDICT_STYLE: Record<Verdict, string> = {
  perfect: 'bg-neon-mint text-ink',
  good: 'bg-neon-yellow text-ink',
  adjust: 'bg-neon-orange text-ink',
}

const SIDE_LABEL: Record<ArmSide, string> = { right: '오른팔', left: '왼팔' }

interface Props {
  lesson: Lesson
  snapshot: TrackingSnapshot
  onRetry: () => void
  onNext?: () => void
}

export default function FeedbackPanel({ lesson, snapshot, onRetry, onNext }: Props) {
  const { arms, runner } = snapshot
  const { pose, evaluation, hold, done } = runner
  const tracked = arms.tracking.status === 'ok' && evaluation
  const progress = Math.round((hold.heldMs / pose.holdDurationMs) * 100)
  const sides = (Object.keys(pose.arms) as ArmSide[]).filter((s) => pose.arms[s])
  const totalSec = runner.stepTimesMs.reduce((a, b) => a + b, 0) / 1000

  let headline: string
  if (done) headline = '성공! 레슨을 클리어했어요'
  else if (tracked) headline = evaluation.hint
  else headline = arms.tracking.message

  const good = done || (tracked && evaluation.inTolerance)

  return (
    <section className="neon-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-neon-pink">
            Lesson {String(lesson.number).padStart(2, '0')}
          </p>
          <h2 className="text-xl font-extrabold text-white">{lesson.title}</h2>
          <p className="text-xs text-neon-violet">{lesson.koreanTitle}</p>
        </div>
        {done ? (
          <span className="rounded-full bg-neon-mint px-3 py-1 text-sm font-extrabold text-ink">CLEAR</span>
        ) : tracked ? (
          <span className={`rounded-full px-3 py-1 text-sm font-extrabold ${VERDICT_STYLE[evaluation.verdict]}`}>
            {VERDICT_LABEL[evaluation.verdict]}
          </span>
        ) : hold.paused ? (
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-extrabold text-white/70">판정 보류</span>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-slate-300">{lesson.goal}</p>

      {pose.provisional && (
        <p className="mt-2 inline-block rounded-md border border-neon-yellow/60 px-2 py-0.5 text-[11px] font-bold text-neon-yellow">
          임시 테스트 포즈 · 검증된 시범 자료 확인 전
        </p>
      )}

      {lesson.kind === 'flow' && (
        <ol className="mt-3 flex flex-wrap gap-2">
          {lesson.poses.map((p, i) => {
            const state = i < runner.stepIndex || done ? 'done' : i === runner.stepIndex ? 'now' : 'next'
            return (
              <li
                key={p.id}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  state === 'done'
                    ? 'border-neon-mint bg-neon-mint/15 text-neon-mint'
                    : state === 'now'
                      ? 'border-neon-cyan bg-neon-cyan/15 text-neon-cyan'
                      : 'border-white/20 text-white/50'
                }`}
              >
                {i + 1}. {p.koreanName}
                {state === 'done' && runner.stepTimesMs[i] != null && ` · ${(runner.stepTimesMs[i] / 1000).toFixed(1)}초`}
              </li>
            )
          })}
        </ol>
      )}

      <div className="mt-3 flex items-center gap-4">
        <div className="shrink-0 rounded-xl bg-black/30 p-1">
          <PoseGuide pose={pose} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-neon-cyan">Target</p>
          <p className="text-lg font-extrabold text-white">{pose.koreanName}</p>
          <p className="mt-1 text-xs text-slate-400">{pose.description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        {sides.map((side) => {
          const m = arms[side]
          const target = pose.arms[side]!
          return (
            <div key={side}>
              <span className="glow-cyan text-4xl font-black tabular-nums text-neon-cyan">
                {m ? Math.round(m.elbowAngleDeg) : '--'}°
              </span>
              <span className="ml-2 text-xs text-slate-400">
                {SIDE_LABEL[side]} 팔꿈치 / 목표 {target.elbowAngleDeg}°
              </span>
            </div>
          )
        })}
      </div>

      <p
        className={`mt-3 rounded-xl border px-4 py-3 text-base font-semibold ${
          good
            ? 'border-neon-mint/60 bg-neon-mint/10 text-neon-mint'
            : 'border-neon-orange/60 bg-neon-orange/10 text-neon-orange'
        }`}
        aria-live="polite"
      >
        {headline}
      </p>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-slate-400">
          <span>자세 유지{lesson.kind === 'flow' ? ` (${runner.stepIndex + 1}/${runner.totalSteps}단계)` : ''}</span>
          <span>
            {(hold.heldMs / 1000).toFixed(1)} / {(pose.holdDurationMs / 1000).toFixed(1)}초
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-100 ${done ? 'bg-neon-mint' : 'bg-neon-pink'}`}
            style={{ width: `${done ? 100 : progress}%`, boxShadow: done ? '0 0 12px #05ffa1' : '0 0 12px #ff2a6d' }}
          />
        </div>
      </div>

      {done && (
        <div className="mt-4 space-y-3">
          {lesson.kind === 'flow' && (
            <p className="text-sm text-slate-300">
              전체 {totalSec.toFixed(1)}초 · 자세를 바꾸는 데 걸린 시간: {runner.stepTimesMs.slice(1).map((t) => `${(t / 1000).toFixed(1)}초`).join(', ')}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="flex-1 rounded-xl border border-neon-cyan px-4 py-3 font-bold text-neon-cyan hover:bg-neon-cyan/10"
            >
              다시 도전하기
            </button>
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                className="flex-1 rounded-xl bg-neon-pink px-4 py-3 font-bold text-white hover:brightness-110"
                style={{ boxShadow: '0 0 18px rgba(255,42,109,.6)' }}
              >
                다음 레슨
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
