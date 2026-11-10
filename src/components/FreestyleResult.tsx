import { FREESTYLE_DEF, FREESTYLE_NOT_MEASURED } from '../data/freestyle'
import { pointsFor, rankOf, type Judgement } from '../services/challengeRunner'
import type { FreestyleState } from '../services/freestyleRunner'

interface Props {
  state: FreestyleState
  bestBefore: number | null
  onRetry: () => void
}

const RANK_COLOR: Record<string, string> = {
  S: 'text-neon-yellow glow-pink',
  A: 'text-neon-ice glow-ice',
  B: 'text-neon-cyan glow-cyan',
  C: 'text-neon-violet',
}

const CELL: Record<Judgement, string> = {
  perfect: 'border-neon-ice bg-neon-ice/25 text-neon-ice',
  good: 'border-neon-yellow bg-neon-yellow/20 text-neon-yellow',
  miss: 'border-neon-pink bg-neon-pink/20 text-neon-pink',
}
const RANK_ORDER: Record<Judgement, number> = { perfect: 2, good: 1, miss: 0 }

/** 기준 점수: 24번 히트를 모두 Perfect로 이어 갔을 때 (가이드 챌린지 만점과 같은 규모) */
const REFERENCE_HITS = 24
export const FREESTYLE_REFERENCE_SCORE = Array.from({ length: REFERENCE_HITS }, (_, i) => pointsFor('perfect', i)).reduce(
  (a, b) => a + b,
  0,
)

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const fmt = (v: number | null, d = 0) => (v === null ? '--' : v.toFixed(d))

export default function FreestyleResult({ state, bestBefore, onRetry }: Props) {
  const total = state.results.length
  const rank = rankOf(state.score, FREESTYLE_REFERENCE_SCORE)
  const newBest = state.score > 0 && (bestBefore === null || state.score > bestBefore)

  const shapes = state.results.map((r) => r.detail.shape)
  const sharps = state.results.map((r) => r.detail.sharp)
  const paths = state.results.map((r) => r.detail.path)
  const offs = state.results.map((r) => r.offsetMs).filter((v): v is number => v !== null)
  const meanOff = avg(offs)
  const meanAbsOff = avg(offs.map(Math.abs))

  // 히트 맵: 박자(0~31)마다 그 박자의 가장 좋은 판정
  const danceBeats = FREESTYLE_DEF.beatsPerSequence * FREESTYLE_DEF.repeatCount
  const cells: Array<Judgement | null> = Array.from({ length: danceBeats }, () => null)
  for (const r of state.results) {
    const idx = r.detail.beatIndex
    if (idx < 0 || idx >= danceBeats) continue
    const cur = cells[idx]
    if (cur === null || RANK_ORDER[r.judgement] > RANK_ORDER[cur]) cells[idx] = r.judgement
  }

  return (
    <section className="neon-card p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-neon-pink">Result · {FREESTYLE_DEF.title}</p>

      <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <p className="neon-title text-5xl font-black tabular-nums">{state.score.toLocaleString()}</p>
          <p className="text-xs text-slate-400">기준 {FREESTYLE_REFERENCE_SCORE.toLocaleString()} (24히트 모두 Perfect)</p>
        </div>
        <p className={`text-6xl font-black ${RANK_COLOR[rank]}`} aria-label={`등급 ${rank}`}>
          {rank}
        </p>
        <div className="text-sm text-slate-200">
          <p>히트 <b className="text-neon-cyan">{total}</b>번 · 최대 콤보 <b className="text-neon-cyan">{state.maxCombo}</b></p>
          <p className="text-neon-ice">PERFECT {state.counts.perfect}</p>
          <p className="text-neon-yellow">GOOD {state.counts.good}</p>
          <p className="text-neon-pink">MISS {state.counts.miss}</p>
        </div>
      </div>

      {(newBest || bestBefore !== null) && (
        <p className="mt-3 text-sm text-slate-300">
          {newBest ? (
            <span className="font-bold text-neon-yellow">NEW BEST! {bestBefore !== null && `(이전 ${bestBefore.toLocaleString()})`}</span>
          ) : (
            <>내 최고 점수 {bestBefore!.toLocaleString()}</>
          )}
        </p>
      )}

      {total === 0 && (
        <p className="mt-3 rounded-xl border border-neon-orange/60 bg-neon-orange/10 px-4 py-3 text-sm text-neon-orange">
          히트가 하나도 없었어요. 팔을 빠르게 움직이다가 박자에 맞춰 <b>딱 멈추는</b> 순간이 필요해요. 또 어깨~손목이 계속 화면에 보여야 해요.
        </p>
      )}

      <h3 className="mt-5 text-sm font-bold text-neon-violet">원칙별 평균 (히트 {total}번 기준)</h3>
      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-white/15 bg-white/5 p-3">
          <p className="text-xs text-slate-400">직각·직선 (멈췄을 때 팔이 수평·수직)</p>
          <p className="text-2xl font-black tabular-nums text-neon-cyan">{fmt(avg(shapes))}</p>
        </div>
        <div className="rounded-xl border border-white/15 bg-white/5 p-3">
          <p className="text-xs text-slate-400">딱 멈추기 (날카로움)</p>
          <p className="text-2xl font-black tabular-nums text-neon-cyan">{fmt(avg(sharps))}</p>
        </div>
        <div className="rounded-xl border border-white/15 bg-white/5 p-3">
          <p className="text-xs text-slate-400">곧은 이동 (실험적)</p>
          <p className="text-2xl font-black tabular-nums text-neon-cyan">{fmt(avg(paths))}</p>
        </div>
        <div className="rounded-xl border border-white/15 bg-white/5 p-3">
          <p className="text-xs text-slate-400">평균 박자 오차</p>
          <p className="text-2xl font-black tabular-nums text-neon-cyan">
            {meanAbsOff === null ? '--' : `${Math.round(meanAbsOff)}ms`}
            {meanOff !== null && Math.abs(meanOff) >= 30 && (
              <span className="ml-2 text-xs font-normal text-slate-300">{meanOff < 0 ? '대체로 빠름' : '대체로 늦음'}</span>
            )}
          </p>
        </div>
      </div>

      <h3 className="mt-5 text-sm font-bold text-neon-violet">히트 맵 (카운트별)</h3>
      <div className="mt-2 grid grid-cols-8 gap-1" role="list" aria-label="카운트별 히트 판정">
        {cells.map((j, i) => (
          <div
            key={i}
            role="listitem"
            className={`rounded-md border py-1 text-center text-[10px] font-bold ${j ? CELL[j] : 'border-white/10 text-white/25'}`}
          >
            {(i % 8) + 1}
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">한 줄이 한 바퀴(8카운트)예요. 색이 있는 칸이 그 카운트에서 멈춘 히트예요.</p>

      <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-slate-300">
        <p className="font-bold text-neon-orange">점수에 반영되지 않은 것</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {FREESTYLE_NOT_MEASURED.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="mt-2 text-slate-400">
          평가 기준은 모두 임시값이에요. 실제 사람의 동작 데이터로 조율하기 전이라 점수가 정확하지 않을 수 있어요.
        </p>
      </div>

      <button
        type="button"
        onClick={onRetry}
        className="mt-5 w-full rounded-xl bg-neon-pink px-4 py-3 font-bold text-white hover:brightness-110"
        style={{ boxShadow: '0 0 18px rgba(255,42,109,.6)' }}
      >
        다시 도전하기
      </button>
    </section>
  )
}
