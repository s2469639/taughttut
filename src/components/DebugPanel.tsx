import type { ArmSide } from '../data/poses'
import type { TrackingSnapshot } from '../hooks/usePoseTracking'
import { VERDICT_LABEL } from './FeedbackPanel'

const fmt = (v: number | null | undefined, digits = 0) => (v == null ? '--' : `${v.toFixed(digits)}°`)
const SIDE_LABEL: Record<ArmSide, string> = { right: '오른팔', left: '왼팔' }

interface Props {
  snapshot: TrackingSnapshot
}

/** 개발·테스트용 디버그 패널. 판정에 쓰이는 모든 수치를 그대로 보여줍니다. */
export default function DebugPanel({ snapshot }: Props) {
  const { arms, runner, fps } = snapshot
  const { pose, evaluation, hold, tracking } = { ...runner, tracking: arms.tracking }
  const tol = pose.tolerance

  const rows: Array<[string, string, boolean?]> = [
    ['현재 포즈 / 단계', `${pose.koreanName} (${runner.stepIndex + 1}/${runner.totalSteps})${runner.done ? ' · DONE' : ''}`],
    ['관절 추적', `${tracking.status} — ${tracking.message}`, tracking.status === 'ok'],
  ]

  for (const side of ['right', 'left'] as ArmSide[]) {
    const m = arms[side]
    const t = pose.arms[side]
    const e = evaluation?.errors[side]
    const label = SIDE_LABEL[side]
    if (t) {
      rows.push(
        [`${label} 팔꿈치 각도`, `${fmt(m?.elbowAngleDeg, 1)} · 목표 ${t.elbowAngleDeg}° ±${tol.elbowAngleDeg}° · 오차 ${fmt(e?.elbowAngleDeg, 1)}`],
        [`${label} 윗팔 방향 (어깨→팔꿈치)`, `${fmt(m?.upperArmDirectionDeg, 1)} · 목표 ${t.upperArmDirectionDeg}° ±${tol.upperArmDirectionDeg}° · 오차 ${fmt(e?.upperArmDirectionDeg, 1)}`],
        [`${label} 아랫팔 방향 (팔꿈치→손목)`, `${fmt(m?.forearmDirectionDeg, 1)} · 목표 ${t.forearmDirectionDeg}° ±${tol.forearmDirectionDeg}° · 오차 ${fmt(e?.forearmDirectionDeg, 1)}`],
      )
    } else {
      rows.push([`${label} (자유, 평가 안 함)`, `팔꿈치 ${fmt(m?.elbowAngleDeg, 0)} · 윗팔 ${fmt(m?.upperArmDirectionDeg, 0)} · 아랫팔 ${fmt(m?.forearmDirectionDeg, 0)}`])
    }
  }

  if (pose.balance) {
    const b = evaluation?.balance
    rows.push([
      '좌우 균형',
      b
        ? `팔꿈치 각도 차이 ${b.elbowDiffDeg.toFixed(1)}° (허용 ${pose.balance.elbowDiffTolDeg}°) · 손목 높이 차이 ${(b.wristHeightDiffRatio * 100).toFixed(0)}% (허용 ${(pose.balance.wristHeightTolRatio * 100).toFixed(0)}%)`
        : '--',
    ])
  }

  rows.push(
    ['일치도 (자세 유사도)', evaluation ? `${evaluation.similarity.toFixed(1)} / 100` : '--'],
    ['허용 범위 안?', evaluation ? (evaluation.inTolerance ? 'YES' : 'NO') : '--', evaluation?.inTolerance],
    ['자세 유지 시간', `${hold.heldMs.toFixed(0)} / ${pose.holdDurationMs} ms${hold.cleared ? ' (CLEARED)' : ''}${hold.paused ? ' (PAUSED)' : ''}`],
    ['현재 판정', evaluation ? VERDICT_LABEL[evaluation.verdict] : '보류'],
    ['단계별 걸린 시간', runner.stepTimesMs.length ? runner.stepTimesMs.map((t) => `${(t / 1000).toFixed(1)}s`).join(' → ') : '--'],
    ['추론 속도', `${fps.toFixed(0)} fps`],
  )

  return (
    <section className="rounded-2xl border border-neon-cyan/40 bg-black/70 p-4 font-mono text-xs text-slate-100">
      <h3 className="glow-cyan mb-1 text-sm font-bold text-neon-cyan">DEBUG</h3>
      <p className="mb-3 text-[11px] text-slate-400">
        방향 기준: 거울 화면 · 0° = 화면 오른쪽, 90° = 위, 180° = 화면 왼쪽, -90° = 아래
      </p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,16rem)_1fr]">
        {rows.map(([k, v, ok]) => (
          <div key={k} className="contents">
            <dt className="text-slate-400">{k}</dt>
            <dd className={ok === undefined ? '' : ok ? 'text-neon-mint' : 'text-neon-orange'}>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
