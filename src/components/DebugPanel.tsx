import type { PoseDefinition } from '../data/poses'
import type { TrackingSnapshot } from '../hooks/usePoseTracking'
import { VERDICT_LABEL } from './FeedbackPanel'

const fmt = (v: number | null | undefined, digits = 0) => (v == null ? '--' : `${v.toFixed(digits)}°`)

interface Props {
  pose: PoseDefinition
  snapshot: TrackingSnapshot
}

/** 개발·테스트용 디버그 패널. 판정에 쓰이는 모든 수치를 그대로 보여줍니다. */
export default function DebugPanel({ pose, snapshot }: Props) {
  const { arms, evaluation, hold, fps } = snapshot
  const { right, left, tracking } = arms
  const e = evaluation?.errors
  const tol = pose.tolerance

  const rows: Array<[string, string, boolean?]> = [
    ['관절 추적', `${tracking.status} — ${tracking.message}`, tracking.status === 'ok'],
    ['오른쪽 팔꿈치 각도 (판정 대상)', `${fmt(right?.elbowAngleDeg, 1)}  · 목표 ${pose.target.elbowAngleDeg}° ±${tol.elbowAngleDeg}° · 오차 ${fmt(e?.elbowAngleDeg, 1)}`],
    ['왼쪽 팔꿈치 각도 (평가 안 함)', fmt(left?.elbowAngleDeg, 1)],
    ['오른쪽 상완 방향 (어깨→팔꿈치)', `${fmt(right?.upperArmDirectionDeg, 1)}  · 목표 ${pose.target.upperArmDirectionDeg}° ±${tol.upperArmDirectionDeg}° · 오차 ${fmt(e?.upperArmDirectionDeg, 1)}`],
    ['오른쪽 전완 방향 (팔꿈치→손목)', `${fmt(right?.forearmDirectionDeg, 1)}  · 목표 ${pose.target.forearmDirectionDeg}° ±${tol.forearmDirectionDeg}° · 오차 ${fmt(e?.forearmDirectionDeg, 1)}`],
    ['왼쪽 상완 방향 (평가 안 함)', fmt(left?.upperArmDirectionDeg, 1)],
    ['왼쪽 전완 방향 (평가 안 함)', fmt(left?.forearmDirectionDeg, 1)],
    ['포즈 유사도', evaluation ? `${evaluation.similarity.toFixed(1)} / 100` : '--'],
    ['허용 범위 안?', evaluation ? (evaluation.inTolerance ? 'YES' : 'NO') : '--', evaluation?.inTolerance],
    ['자세 유지 시간', `${hold.heldMs.toFixed(0)} / ${pose.holdDurationMs} ms${hold.cleared ? ' (CLEARED)' : ''}${hold.paused ? ' (PAUSED)' : ''}`],
    ['현재 판정', evaluation ? VERDICT_LABEL[evaluation.verdict] : '보류'],
    ['추론 속도', `${fps.toFixed(0)} fps`],
  ]

  return (
    <section className="rounded-2xl bg-slate-900 p-4 font-mono text-xs text-slate-100 shadow-md">
      <h3 className="mb-1 text-sm font-bold text-teal-300">DEBUG</h3>
      <p className="mb-3 text-[11px] text-slate-400">
        방향 기준: 거울 화면, 0° = 사용자의 오른쪽(바깥), 90° = 위, -90° = 아래
      </p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,15rem)_1fr]">
        {rows.map(([k, v, ok]) => (
          <div key={k} className="contents">
            <dt className="text-slate-400">{k}</dt>
            <dd className={ok === undefined ? '' : ok ? 'text-teal-300' : 'text-orange-300'}>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
