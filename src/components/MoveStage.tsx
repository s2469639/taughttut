import { DEMO_KEYS, type ChallengeDef, type MoveDef } from '../data/challenge'
import type { SongPosition } from '../services/challengeRunner'
import { demoAtBeat } from '../services/demo'
import ArmFigure from './ArmFigure'

interface Props {
  def: ChallengeDef
  pos: SongPosition
  /** 아직 시작 전이라 미리보기 중인가 */
  preview: boolean
  /** 미리보기에서 쓰는 박자 위치(0~8) */
  previewBeat: number
}

function currentMove(def: ChallengeDef, beat: number): { current: MoveDef; next: MoveDef } {
  const i = def.moves.findIndex((m) => beat >= m.startBeat && beat < m.startBeat + m.spanCounts)
  const idx = i < 0 ? 0 : i
  return { current: def.moves[idx], next: def.moves[(idx + 1) % def.moves.length] }
}

/** 시범 그림 + 지금/다음 동작 안내. 시범은 박자보다 반 박자 앞서 보여줘요. */
export default function MoveStage({ def, pos, preview, previewBeat }: Props) {
  const beat = preview
    ? previewBeat
    : pos.phase === 'dance'
      ? pos.beatInSequence
      : pos.phase === 'ending'
        ? def.beatsPerSequence - 0.01
        : 0
  const { current, next } = currentMove(def, beat)
  const counting = !preview && (pos.phase === 'precount' || pos.phase === 'countdown')
  const angles = demoAtBeat(DEMO_KEYS, counting ? 0 : beat + 0.5)
  const shown = counting ? def.moves[0] : current

  return (
    <section className="neon-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-neon-pink">
          {preview ? '시범 미리보기' : counting ? '준비!' : 'NOW'}
        </p>
        <p className="text-[11px] text-slate-400">시범은 박자보다 살짝 앞서 나와요</p>
      </div>

      <div className="mt-1 flex items-center gap-3">
        <div className="shrink-0 rounded-xl bg-black/30 p-1">
          <ArmFigure angles={angles} label={`${shown.name} 시범`} />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-extrabold leading-tight text-white">{shown.name}</p>
          <p className="text-xs text-neon-violet">{shown.koreanName}</p>
          <p className="mt-1 text-xs text-slate-300">{shown.description}</p>
        </div>
      </div>

      {!preview && !counting && (
        <p className="mt-3 text-xs text-slate-400">
          NEXT · <span className="font-bold text-neon-cyan">{next.name}</span> ({next.koreanName})
        </p>
      )}

      <details className="mt-3 text-xs text-slate-300">
        <summary className="cursor-pointer font-bold text-neon-violet">이 동작은 무엇을 평가하나요?</summary>
        <p className="mt-2 font-bold text-neon-ice">측정해요</p>
        <ul className="ml-4 list-disc">
          {shown.measures.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <p className="mt-2 font-bold text-neon-orange">측정하지 못해요 (점수에 반영 안 됨)</p>
        <ul className="ml-4 list-disc">
          {shown.notMeasured.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </details>
    </section>
  )
}
