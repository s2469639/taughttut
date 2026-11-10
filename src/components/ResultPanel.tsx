import type { ChallengeDef } from '../data/challenge'
import { maxScoreOf, rankOf, type ChallengeState } from '../services/challengeRunner'

interface Props {
  def: ChallengeDef
  state: ChallengeState
  bestBefore: number | null
  debug: boolean
  onRetry: () => void
  onSaveRecording: () => void
}

const RANK_COLOR: Record<string, string> = {
  S: 'text-neon-yellow glow-pink',
  A: 'text-neon-ice glow-ice',
  B: 'text-neon-cyan glow-cyan',
  C: 'text-neon-violet',
}

const KIND_LABEL: Record<string, string> = {
  slide: '손목 이동 방향·거리',
  box: '양팔 자세',
  rotate: '팔 방향 변화',
  wave: '관절 움직임 순서',
  fold: '팔꿈치 각도 변화',
  hit: '최종 자세',
}

const fmtOffset = (ms: number) => `${ms > 0 ? '+' : ''}${Math.round(ms)}ms ${Math.abs(ms) < 30 ? '' : ms < 0 ? '(빠름)' : '(늦음)'}`

export default function ResultPanel({ def, state, bestBefore, debug, onRetry, onSaveRecording }: Props) {
  const max = maxScoreOf(def)
  const rank = rankOf(state.score, max)
  // 0점(전부 Miss)은 최고 기록으로 치지 않음
  const newBest = state.score > 0 && (bestBefore === null || state.score > bestBefore)
  const total = state.counts.perfect + state.counts.good + state.counts.miss
  const allMiss = total > 0 && state.counts.miss === total

  return (
    <section className="neon-card p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-neon-pink">Result · {def.title}</p>

      <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <p className="neon-title text-5xl font-black tabular-nums">{state.score.toLocaleString()}</p>
          <p className="text-xs text-slate-400">만점 {max.toLocaleString()} 중</p>
        </div>
        <p className={`text-6xl font-black ${RANK_COLOR[rank]}`} aria-label={`등급 ${rank}`}>
          {rank}
        </p>
        <div className="text-sm text-slate-200">
          <p>최대 콤보 <b className="text-neon-cyan">{state.maxCombo}</b></p>
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

      {allMiss && (
        <p className="mt-3 rounded-xl border border-neon-orange/60 bg-neon-orange/10 px-4 py-3 text-sm text-neon-orange">
          전부 Miss예요. 인식이 안 됐을 수 있어요. 카메라 정면에서 어깨~손목이 모두 보이게 서서 다시 해 보세요.
        </p>
      )}

      <h3 className="mt-5 text-sm font-bold text-neon-violet">동작별 결과</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="py-1 pr-3 font-semibold">동작</th>
              <th className="py-1 pr-3 font-semibold">평가한 것</th>
              <th className="py-1 pr-3 font-semibold">P / G / M</th>
              <th className="py-1 pr-3 font-semibold">평균 완성도</th>
              <th className="py-1 font-semibold">평균 박자</th>
            </tr>
          </thead>
          <tbody>
            {def.moves.map((m) => {
              const rs = state.results.filter((r) => r.moveId === m.id)
              const c = (j: string) => rs.filter((r) => r.judgement === j).length
              const q = rs.length ? rs.reduce((a, r) => a + r.quality, 0) / rs.length : 0
              const offs = rs.map((r) => r.offsetMs).filter((v): v is number => v !== null)
              const off = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : null
              return (
                <tr key={m.id} className="border-t border-white/10">
                  <td className="py-2 pr-3 font-bold text-white">
                    {m.name}
                    <span className="block text-[10px] font-normal text-slate-400">{m.koreanName}</span>
                  </td>
                  <td className="py-2 pr-3 text-slate-300">{KIND_LABEL[m.kind]}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    <span className="text-neon-ice">{c('perfect')}</span> / <span className="text-neon-yellow">{c('good')}</span> /{' '}
                    <span className="text-neon-pink">{c('miss')}</span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{q.toFixed(0)}</td>
                  <td className="py-2 tabular-nums text-slate-300">{off === null ? '--' : fmtOffset(off)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-slate-300">
        <p className="font-bold text-neon-orange">점수에 반영되지 않은 것</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {def.moves.map((m) => (
            <li key={m.id}>
              <b className="text-white">{m.name}</b>: {m.notMeasured.join(', ')}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-slate-400">
          안무와 평가 기준은 기획 초안이며, 실제 시범 데이터로 검증하기 전이라 점수가 정확하지 않을 수 있어요.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 rounded-xl bg-neon-pink px-4 py-3 font-bold text-white hover:brightness-110"
          style={{ boxShadow: '0 0 18px rgba(255,42,109,.6)' }}
        >
          다시 도전하기
        </button>
        {debug && (
          <button
            type="button"
            onClick={onSaveRecording}
            className="rounded-xl border border-neon-cyan px-4 py-3 text-sm font-bold text-neon-cyan hover:bg-neon-cyan/10"
          >
            기준 데이터 저장 (JSON)
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">영상 저장·SNS 공유는 아직 지원하지 않아요 (다음 단계).</p>
    </section>
  )
}
