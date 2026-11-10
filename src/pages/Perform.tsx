import { useEffect, useMemo, useRef, useState } from 'react'
import BeatTimeline from '../components/BeatTimeline'
import CameraView from '../components/CameraView'
import HighwayCanvas from '../components/HighwayCanvas'
import MoveStage from '../components/MoveStage'
import ResultPanel from '../components/ResultPanel'
import { FIRST_TUT_FLOW } from '../data/challenge'
import { useCamera } from '../hooks/useCamera'
import { useChallenge } from '../hooks/useChallenge'
import { beatMsOf, songPosition, type Judgement, type MoveResult } from '../services/challengeRunner'

const def = FIRST_TUT_FLOW

const LS_LATENCY = 'taughttut.latencyMs'
const LS_BEST = `taughttut.best.${def.id}`
/** 기본 인식 지연 보정값 — 가정값, 사용자 조정 가능 */
const DEFAULT_LATENCY_MS = 100

function readNumber(key: string): number | null {
  try {
    const v = localStorage.getItem(key)
    return v === null ? null : Number(v)
  } catch {
    return null
  }
}
function writeNumber(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v))
  } catch {
    /* 저장 불가 환경에서도 동작해야 함 */
  }
}

/** 약 30Hz로 갱신되는 현재 시각 (시범·타임라인 애니메이션용) */
function useTicker(): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last >= 33) {
        last = t
        setNow(performance.now())
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return now
}

const JUDGE_STYLE: Record<Judgement, string> = {
  perfect: 'text-neon-ice glow-ice',
  good: 'text-neon-yellow',
  miss: 'text-neon-pink glow-pink',
}

export default function Perform() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { videoRef, status, error, start: startCamera } = useCamera()
  const [debug, setDebug] = useState(() => new URLSearchParams(location.search).has('debug'))
  const [latencyMs, setLatencyMs] = useState(() => readNumber(LS_LATENCY) ?? DEFAULT_LATENCY_MS)
  const [bestBefore, setBestBefore] = useState<number | null>(() => readNumber(LS_BEST))
  const [popup, setPopup] = useState<MoveResult | null>(null)

  const cameraReady = status === 'ready'
  const ch = useChallenge({
    def,
    load: status !== 'idle',
    cameraReady,
    videoRef,
    canvasRef,
    latencyMs,
    keepFrames: debug,
  })
  const { phase, snapshot, lastResult } = ch

  const now = useTicker()
  const beatMs = beatMsOf(def)
  const songMs = ch.getSongMs()
  const playing = phase === 'playing'
  const pos = songPosition(def, songMs ?? -1)
  const previewBeat = (now / beatMs) % def.beatsPerSequence

  // 판정 팝업: 새 결과가 오면 잠깐 보여줌
  useEffect(() => {
    if (!lastResult) return
    setPopup(lastResult)
    const id = setTimeout(() => setPopup(null), 900)
    return () => clearTimeout(id)
  }, [lastResult])

  // 끝나면 최고 점수 저장 (이전 최고는 결과 화면에서 비교하도록 따로 보관)
  const savedRef = useRef(false)
  useEffect(() => {
    if (phase === 'playing') savedRef.current = false
    if (phase === 'finished' && !savedRef.current) {
      savedRef.current = true
      const score = snapshot.state.score
      const prev = readNumber(LS_BEST)
      setBestBefore(prev)
      if (score > 0 && (prev === null || score > prev)) writeNumber(LS_BEST, score)
    }
  }, [phase, snapshot.state.score])

  const latest = useMemo(() => {
    const m: Record<string, Judgement> = {}
    for (const r of snapshot.state.results) m[r.moveId] = r.judgement
    return m
  }, [snapshot.state.results])

  const changeLatency = (v: number) => {
    setLatencyMs(v)
    writeNumber(LS_LATENCY, v)
  }

  const saveRecording = () => {
    const json = ch.exportRecording()
    if (!json) return
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `taught-tut-${def.id}-recording.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const busy = status === 'requesting' || (cameraReady && ch.modelStatus === 'loading')
  const ready = cameraReady && ch.modelStatus === 'ready'

  let overlay: string | null = null
  if (status === 'requesting') overlay = '카메라 권한을 허용해 주세요…'
  else if (cameraReady && ch.modelStatus === 'loading') overlay = '동작 인식 모델을 불러오는 중…'

  const trackingWarn = playing && pos.phase === 'dance' && snapshot.arms.tracking.status !== 'ok'

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="neon-title text-4xl font-black tracking-tight">{def.title}</h1>
          <p className="glow-cyan text-sm font-semibold tracking-wide text-neon-cyan">{def.subtitle}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} disabled={playing} />
          디버그 모드 (기준 데이터 저장)
        </label>
      </header>

      <p className="mb-5 inline-block rounded-md border border-neon-yellow/60 px-2 py-1 text-[11px] font-bold text-neon-yellow">
        임시 안무 · 임시 평가 기준 — 실제 시범 데이터로 검증하기 전이에요
      </p>

      {phase === 'finished' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <ResultPanel
            def={def}
            state={snapshot.state}
            bestBefore={bestBefore}
            debug={debug}
            onRetry={() => void ch.start()}
            onSaveRecording={saveRecording}
          />
          <div className="space-y-4">
            <MoveStage def={def} pos={pos} preview previewBeat={previewBeat} />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="relative">
              <CameraView
                videoRef={videoRef}
                canvasRef={canvasRef}
                active={cameraReady}
                overlayMessage={overlay}
                ringClass={popup?.judgement === 'perfect' ? 'ring-glow-ice' : popup?.judgement === 'good' ? 'ring-glow-yellow' : 'ring-glow-idle'}
              />

              {/* 네온 하이웨이: 색감 입히기 + 비네팅 + 레인·타일 (웹캠 위에 겹침) */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(90,20,170,0.34) 0%, rgba(255,42,109,0.12) 55%, rgba(20,4,40,0.5) 100%)',
                  }}
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(10,2,26,0.7) 100%)' }}
                />
                <HighwayCanvas def={def} getSongMs={ch.getSongMs} results={snapshot.state.results} />
              </div>

              {/* HUD */}
              {playing && (
                <div className="pointer-events-none absolute inset-0 rounded-2xl">
                  <div className="absolute left-3 top-3 rounded-lg bg-black/55 px-3 py-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neon-violet">Score</p>
                    <p className="text-2xl font-black tabular-nums text-white">{snapshot.state.score.toLocaleString()}</p>
                  </div>
                  <div className="absolute right-3 top-3 rounded-lg bg-black/55 px-3 py-1.5 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neon-violet">Combo</p>
                    <p className={`text-2xl font-black tabular-nums ${snapshot.state.combo >= 5 ? 'text-neon-yellow glow-pink' : 'text-white'}`}>
                      {snapshot.state.combo}
                    </p>
                  </div>

                  {(pos.phase === 'precount' || pos.phase === 'countdown') && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/50">
                      <p className="glow-cyan text-8xl font-black text-neon-cyan">{pos.countdownLeft}</p>
                      <p className="mt-2 text-sm font-bold text-white">팔을 가슴 앞에서 교차하고 준비!</p>
                    </div>
                  )}

                  {popup && (
                    <div className="absolute inset-x-0 top-[13%] text-center">
                      <p className={`text-5xl font-black uppercase italic ${JUDGE_STYLE[popup.judgement]}`}>{popup.judgement}</p>
                      <p className="mt-1 text-sm font-bold text-white">
                        {popup.moveName}
                        {popup.points > 0 && <span className="ml-2 text-neon-cyan">+{popup.points}</span>}
                        {popup.combo >= 2 && <span className="ml-2 text-neon-yellow">{popup.combo} COMBO</span>}
                      </p>
                      {popup.reason && <p className="text-xs text-neon-orange">{popup.reason}</p>}
                    </div>
                  )}

                  {trackingWarn && (
                    <p className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-neon-orange/90 px-4 py-1 text-xs font-bold text-ink">
                      양쪽 어깨~손목이 화면에 보이게 서 주세요
                    </p>
                  )}
                </div>
              )}
            </div>

            <BeatTimeline def={def} pos={pos} latest={latest} />

            {playing && (
              <button
                type="button"
                onClick={ch.quit}
                className="w-full rounded-xl border border-white/20 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                그만하기
              </button>
            )}

            {!playing && (
              <div className="neon-card p-5">
                {(error || ch.abortReason) && (
                  <p className="mb-4 rounded-xl border border-neon-orange/60 bg-neon-orange/10 px-4 py-3 text-sm font-semibold text-neon-orange" role="alert">
                    {error?.message ?? ch.abortReason}
                  </p>
                )}
                {ch.modelStatus === 'error' && ch.modelError && (
                  <p className="mb-4 rounded-xl border border-neon-orange/60 bg-neon-orange/10 px-4 py-3 text-sm font-semibold text-neon-orange" role="alert">
                    {ch.modelError}
                  </p>
                )}
                <ul className="mb-4 space-y-1 text-sm text-slate-300">
                  <li>· 소리를 켜 주세요 (직접 만든 100BPM 비트가 나와요)</li>
                  <li>· 카메라에서 2~3m 떨어져 <b className="text-white">어깨부터 손목까지</b> 보이게 서 주세요</li>
                  <li>· 카운트다운 동안 팔을 <b className="text-white">가슴 앞에서 교차</b>하고 있다가, 시범 그림을 따라 해요</li>
                  <li>· 영상은 이 브라우저 안에서만 처리되고 어디에도 전송·저장되지 않아요</li>
                </ul>

                {!cameraReady ? (
                  <button
                    type="button"
                    onClick={startCamera}
                    disabled={busy}
                    className="w-full rounded-xl bg-neon-pink px-6 py-4 text-lg font-extrabold text-white hover:brightness-110 disabled:opacity-60"
                    style={{ boxShadow: '0 0 24px rgba(255,42,109,.55)' }}
                  >
                    {status === 'error' ? '다시 시도' : '카메라 켜고 준비하기'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void ch.start()}
                    disabled={!ready}
                    className="w-full rounded-xl bg-neon-pink px-6 py-4 text-lg font-extrabold text-white hover:brightness-110 disabled:opacity-60"
                    style={{ boxShadow: '0 0 24px rgba(255,42,109,.55)' }}
                  >
                    {ready ? 'START' : '모델 불러오는 중…'}
                  </button>
                )}

                <div className="mt-4 border-t border-white/10 pt-3">
                  <label className="flex items-center justify-between text-xs text-slate-300" htmlFor="latency">
                    <span>카메라 지연 보정 <span className="text-slate-500">(박자가 계속 어긋나면 조정)</span></span>
                    <span className="font-bold tabular-nums text-neon-cyan">{latencyMs}ms</span>
                  </label>
                  <input
                    id="latency"
                    type="range"
                    min={0}
                    max={300}
                    step={10}
                    value={latencyMs}
                    onChange={(e) => changeLatency(Number(e.target.value))}
                    className="mt-1 w-full accent-neon-pink"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    기본값 {DEFAULT_LATENCY_MS}ms는 가정값이에요. 내 기기에서의 실제 지연은 확인 필요.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <MoveStage def={def} pos={pos} preview={!playing} previewBeat={previewBeat} />
            <div className="neon-card p-4 text-xs text-slate-300">
              <p className="font-bold uppercase tracking-widest text-neon-violet">판정 방식</p>
              <ul className="mt-2 space-y-1">
                <li><b className="text-neon-ice">PERFECT</b> — 동작이 정확하고 박자가 맞음 (100점)</li>
                <li><b className="text-neon-yellow">GOOD</b> — 조금 어긋남 (60점)</li>
                <li><b className="text-neon-pink">MISS</b> — 크게 어긋나거나 인식 실패 (0점, 콤보 끊김)</li>
              </ul>
              <p className="mt-2 text-slate-400">
                동작마다 보는 것이 달라요. 손목 굴림이나 손가락 모양처럼 이 카메라 인식으로 알 수 없는 것은 평가하지 않아요.
              </p>
            </div>
            {debug && playing && (
              <pre className="neon-card max-h-48 overflow-auto p-3 text-[11px] text-slate-300">
                {JSON.stringify(
                  { songMs: songMs && Math.round(songMs), phase: pos.phase, tracking: snapshot.arms.tracking.status, fps: Math.round(snapshot.fps), last: lastResult && { move: lastResult.moveId, q: Math.round(lastResult.quality), off: lastResult.offsetMs && Math.round(lastResult.offsetMs), detail: lastResult.detail } },
                  null,
                  1,
                )}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
