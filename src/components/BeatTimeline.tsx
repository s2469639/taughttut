import type { ChallengeDef } from '../data/challenge'
import type { Judgement, SongPosition } from '../services/challengeRunner'

const JUDGE_BORDER: Record<Judgement, string> = {
  perfect: 'border-neon-mint text-neon-mint',
  good: 'border-neon-yellow text-neon-yellow',
  miss: 'border-neon-pink text-neon-pink',
}

interface Props {
  def: ChallengeDef
  pos: SongPosition
  /** 동작별 가장 최근 판정 */
  latest: Record<string, Judgement>
}

/** 8카운트 타임라인: 어떤 동작이 몇 카운트에 오는지, 지금 어디인지 */
export default function BeatTimeline({ def, pos, latest }: Props) {
  const { phase, beatInSequence } = pos
  const playing = phase === 'dance'
  return (
    <div className="neon-card p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
        <span className="text-neon-violet">8 Counts · {def.bpm} BPM</span>
        <span className="text-neon-cyan">
          Loop {playing || phase === 'ending' ? pos.loop : 1} / {def.repeatCount}
        </span>
      </div>
      <div className="grid grid-cols-8 gap-1" role="list">
        {def.moves.map((m) => {
          const active = playing && beatInSequence >= m.startBeat && beatInSequence < m.startBeat + m.spanCounts
          const fill = active ? ((beatInSequence - m.startBeat) / m.spanCounts) * 100 : 0
          const j = latest[m.id]
          return (
            <div
              key={m.id}
              role="listitem"
              style={{ gridColumn: `span ${m.spanCounts}` }}
              className={`relative overflow-hidden rounded-lg border px-2 py-2 text-center ${
                active
                  ? 'border-neon-pink bg-neon-pink/15 text-white shadow-[0_0_14px_rgba(255,42,109,0.5)]'
                  : j
                    ? `bg-white/5 ${JUDGE_BORDER[j]}`
                    : 'border-white/15 bg-white/5 text-slate-300'
              }`}
            >
              <div
                className="absolute inset-y-0 left-0 bg-neon-pink/25"
                style={{ width: `${fill}%` }}
                aria-hidden
              />
              <span className="relative block text-[10px] opacity-70">
                {m.spanCounts > 1 ? `${m.startCount}~${m.startCount + m.spanCounts - 1}` : m.startCount}
              </span>
              <span className="relative block text-xs font-extrabold leading-tight sm:text-sm">{m.name}</span>
              <span className="relative block text-[10px] opacity-70">{m.koreanName}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
