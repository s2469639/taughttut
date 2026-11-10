import type { PoseDefinition } from '../data/poses'
import type { TrackingSnapshot } from '../hooks/usePoseTracking'
import type { Verdict } from '../services/poseEvaluator'

export const VERDICT_LABEL: Record<Verdict, string> = {
  perfect: 'PERFECT',
  good: 'GOOD',
  adjust: 'ADJUST',
}

const VERDICT_STYLE: Record<Verdict, string> = {
  perfect: 'bg-teal-400 text-teal-950',
  good: 'bg-amber-300 text-amber-950',
  adjust: 'bg-orange-500 text-white',
}

interface Props {
  pose: PoseDefinition
  snapshot: TrackingSnapshot
  onRetry: () => void
}

export default function FeedbackPanel({ pose, snapshot, onRetry }: Props) {
  const { arms, evaluation, hold } = snapshot
  const tracked = arms.tracking.status === 'ok' && evaluation
  const progress = Math.round((hold.heldMs / pose.holdDurationMs) * 100)

  let headline: string
  if (hold.cleared) headline = '성공! 자세를 해냈어요 🎉'
  else if (tracked) headline = evaluation.hint
  else headline = arms.tracking.message

  return (
    <section className="rounded-2xl bg-white p-5 shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Lesson 01</p>
          <h2 className="text-xl font-extrabold">{pose.name}</h2>
        </div>
        {tracked && !hold.cleared && (
          <span className={`rounded-full px-3 py-1 text-sm font-extrabold ${VERDICT_STYLE[evaluation.verdict]}`}>
            {VERDICT_LABEL[evaluation.verdict]}
          </span>
        )}
        {hold.cleared && (
          <span className="rounded-full bg-teal-400 px-3 py-1 text-sm font-extrabold text-teal-950">CLEAR</span>
        )}
        {!tracked && !hold.cleared && hold.paused && (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-extrabold text-slate-600">판정 보류</span>
        )}
      </div>

      <p className="mt-2 text-sm text-slate-600">{pose.description}</p>

      <div className="mt-4 flex items-end gap-2">
        <span className="text-5xl font-black tabular-nums text-brand">
          {arms.right ? Math.round(arms.right.elbowAngleDeg) : '--'}°
        </span>
        <span className="pb-1 text-sm text-slate-500">/ 목표 {pose.target.elbowAngleDeg}° (오른쪽 팔꿈치)</span>
      </div>

      <p
        className={`mt-3 rounded-xl px-4 py-3 text-base font-semibold ${
          hold.cleared
            ? 'bg-teal-50 text-teal-800'
            : tracked && evaluation.inTolerance
              ? 'bg-teal-50 text-teal-800'
              : 'bg-orange-50 text-orange-800'
        }`}
        aria-live="polite"
      >
        {headline}
      </p>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>자세 유지</span>
          <span>
            {(hold.heldMs / 1000).toFixed(1)} / {(pose.holdDurationMs / 1000).toFixed(1)}초
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-brand-soft">
          <div
            className={`h-full rounded-full transition-[width] duration-100 ${hold.cleared ? 'bg-teal-400' : 'bg-brand'}`}
            style={{ width: `${hold.cleared ? 100 : progress}%` }}
          />
        </div>
      </div>

      {hold.cleared && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 w-full rounded-xl bg-brand px-4 py-3 font-bold text-white hover:bg-violet-700"
        >
          다시 도전하기
        </button>
      )}
    </section>
  )
}
