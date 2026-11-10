import { useEffect, useRef, useState } from 'react'
import CameraView from '../components/CameraView'
import FreestyleResult from '../components/FreestyleResult'
import HighwayCanvas from '../components/HighwayCanvas'
import { FREESTYLE_DEF, FREESTYLE_NOT_MEASURED, FREESTYLE_PARAMS, FREESTYLE_PRINCIPLES } from '../data/freestyle'
import { useCamera } from '../hooks/useCamera'
import { useFreestyle } from '../hooks/useFreestyle'
import { songPosition, type Judgement } from '../services/challengeRunner'

const def = FREESTYLE_DEF
const LS_LATENCY = 'taughttut.latencyMs' // 가이드 챌린지와 같은 설정을 공유
const LS_BEST = 'taughttut.best.freestyle'
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
    /* 저장할 수 없는 환경에서도 동작해야 함 */
  }
}

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

export default function Freestyle() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { videoRef, status, error, start: startCamera } = useCamera()
  const [latencyMs, setLatencyMs] = useState(() => readNumber(LS_LATENCY) ?? DEFAULT_LATENCY_MS)
  const [bestBefore, setBestBefore] = useState<number | null>(() => readNumber(LS_BEST))
  const [popup, setPopup] = useState<{ r: NonNullable<ReturnType<typeof useFreestyle>['lastResult']> } | null>(null)
  const [debug] = useState(() => new URLSearchParams(location.search).has('debug'))

  const cameraReady = status === 'ready'
  const fs = useFreestyle({ load: status !== 'idle', cameraReady, videoRef, canvasRef, latencyMs })
  const { phase, snapshot, lastResult } = fs
  const { live } = snapshot.state

  useTicker() // 화면(카운트다운·진행률)을 부드럽게 갱신
  const songMs = fs.getSongMs()
  const playing = phase === 'playing'
  const pos = songPosition(def, songMs ?? -1)

  useEffect(() => {
    if (!lastResult) return
    setPopup({ r: lastResult })
    const id = setTimeout(() => setPopup(null), 1000)
    return () => clearTimeout(id)
  }, [lastResult])

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

  const changeLatency = (v: number) => {
    setLatencyMs(v)
    writeNumber(LS_LATENCY, v)
  }

  const busy = status === 'requesting' || (cameraReady && fs.modelStatus === 'loading')
  const ready = cameraReady && fs.modelStatus === 'ready'
  let overlay: string | null = null
  if (status === 'requesting') overlay = '카메라 권한을 허용해 주세요…'
  else if (cameraReady && fs.modelStatus === 'loading') overlay = '동작 인식 모델을 불러오는 중…'

  const lowFps = playing && pos.phase === 'dance' && live.fps > 0 && live.fps < FREESTYLE_PARAMS.minFps
  const lost = playing && pos.phase === 'dance' && !live.usable
  const progress = playing && songMs !== null ? Math.min(100, Math.max(0, (songMs / (38 * 600)) * 100)) : 0

  if (phase === 'finished') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <Header />
        <FreestyleResult state={snapshot.state} bestBefore={bestBefore} onRetry={() => void fs.start()} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <Header />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="relative">
            <CameraView
              videoRef={videoRef}
              canvasRef={canvasRef}
              active={cameraReady}
              overlayMessage={overlay}
              ringClass={popup?.r.judgement === 'perfect' ? 'ring-glow-ice' : popup?.r.judgement === 'good' ? 'ring-glow-yellow' : 'ring-glow-idle'}
            />
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(90,20,170,0.34) 0%, rgba(255,42,109,0.12) 55%, rgba(20,4,40,0.5) 100%)' }}
              />
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(10,2,26,0.7) 100%)' }} />
              <HighwayCanvas def={def} getSongMs={fs.getSongMs} results={snapshot.state.results} />
            </div>

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
                    <p className="mt-2 text-sm font-bold text-white">팔이 보이게 서서, 자유롭게 준비!</p>
                  </div>
                )}

                {popup && (
                  <div className="absolute inset-x-0 top-[13%] text-center">
                    <p className={`text-5xl font-black uppercase italic ${JUDGE_STYLE[popup.r.judgement]}`}>{popup.r.judgement}</p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {popup.r.moveName}
                      {popup.r.points > 0 && <span className="ml-2 text-neon-cyan">+{popup.r.points}</span>}
                      {popup.r.combo >= 2 && <span className="ml-2 text-neon-yellow">{popup.r.combo} COMBO</span>}
                    </p>
                    <p className="text-xs text-slate-200">
                      직각 {Math.round(popup.r.detail.shape)} · 멈춤 {Math.round(popup.r.detail.sharp)} · 경로 {Math.round(popup.r.detail.path)}
                      {popup.r.offsetMs !== null && ` · ${popup.r.offsetMs > 0 ? '+' : ''}${Math.round(popup.r.offsetMs)}ms`}
                    </p>
                    {popup.r.reason && <p className="text-xs text-neon-orange">{popup.r.reason}</p>}
                  </div>
                )}

                {(lost || lowFps) && (
                  <p className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-neon-orange/90 px-4 py-1 text-xs font-bold text-ink">
                    {lost
                      ? '양쪽 어깨~손목이 화면에 보이게 서 주세요'
                      : `인식 속도가 낮아요 (${Math.round(live.fps)}fps) — 멈춤 감지가 부정확할 수 있어요`}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 실시간 계기판 */}
          <div className="neon-card grid gap-3 p-4 sm:grid-cols-3">
            <Meter label="직각성 (지금 팔 모양)" value={live.angularity} hint="수평·수직에 가까울수록 높아요" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-neon-violet">움직임</p>
              <p className={`mt-1 text-2xl font-black ${live.moving ? 'text-neon-pink glow-pink' : 'text-neon-ice glow-ice'}`}>
                {!playing ? '--' : !live.usable ? '인식 안 됨' : live.moving ? 'MOVE' : 'HOLD'}
              </p>
              <p className="text-[11px] text-slate-500">움직이다 멈추는 순간이 히트예요</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-neon-violet">진행</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-neon-pink" style={{ width: `${progress}%`, boxShadow: '0 0 10px #ff2a6d' }} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                히트 {snapshot.state.results.length}번 · {pos.phase === 'dance' ? `${pos.loop}/${def.repeatCount}바퀴 ${pos.count}카운트` : '—'}
              </p>
            </div>
          </div>

          {playing && (
            <button type="button" onClick={fs.quit} className="w-full rounded-xl border border-white/20 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
              그만하기
            </button>
          )}

          {!playing && (
            <div className="neon-card p-5">
              {(error || fs.abortReason) && (
                <p className="mb-4 rounded-xl border border-neon-orange/60 bg-neon-orange/10 px-4 py-3 text-sm font-semibold text-neon-orange" role="alert">
                  {error?.message ?? fs.abortReason}
                </p>
              )}
              {fs.modelStatus === 'error' && fs.modelError && (
                <p className="mb-4 rounded-xl border border-neon-orange/60 bg-neon-orange/10 px-4 py-3 text-sm font-semibold text-neon-orange" role="alert">
                  {fs.modelError}
                </p>
              )}
              <ul className="mb-4 space-y-1 text-sm text-slate-300">
                <li>· 소리를 켜 주세요 (직접 만든 100BPM 비트)</li>
                <li>· 카메라에서 2~3m 떨어져 <b className="text-white">어깨부터 손목까지</b> 보이게 서 주세요</li>
                <li>· 정해진 동작은 없어요. 팔을 움직이다가 <b className="text-white">박자에 맞춰 딱 멈추면</b> 점수를 받아요</li>
                <li>· 멈췄을 때 팔이 <b className="text-white">수평·수직</b>에 가까울수록 높은 점수예요</li>
                <li>· 팔을 아래로 내리고 있으면 점수를 주지 않아요</li>
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
                  onClick={() => void fs.start()}
                  disabled={!ready}
                  className="w-full rounded-xl bg-neon-pink px-6 py-4 text-lg font-extrabold text-white hover:brightness-110 disabled:opacity-60"
                  style={{ boxShadow: '0 0 24px rgba(255,42,109,.55)' }}
                >
                  {ready ? 'START' : '모델 불러오는 중…'}
                </button>
              )}

              <div className="mt-4 border-t border-white/10 pt-3">
                <label className="flex items-center justify-between text-xs text-slate-300" htmlFor="fs-latency">
                  <span>카메라 지연 보정 <span className="text-slate-500">(박자가 계속 어긋나면 조정, 가이드 모드와 공유)</span></span>
                  <span className="font-bold tabular-nums text-neon-cyan">{latencyMs}ms</span>
                </label>
                <input
                  id="fs-latency"
                  type="range"
                  min={0}
                  max={300}
                  step={10}
                  value={latencyMs}
                  onChange={(e) => changeLatency(Number(e.target.value))}
                  className="mt-1 w-full accent-neon-pink"
                />
                <p className="mt-1 text-[11px] text-slate-500">기본값 {DEFAULT_LATENCY_MS}ms는 가정값이에요. 내 기기에서의 실제 지연은 확인 필요.</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <section className="neon-card p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-neon-pink">평가하는 원칙</p>
            <ul className="mt-2 space-y-3 text-sm">
              {FREESTYLE_PRINCIPLES.map((p) => (
                <li key={p.key}>
                  <p className="font-extrabold text-white">{p.title}</p>
                  <p className="text-xs text-slate-300">{p.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="neon-card p-4 text-xs text-slate-300">
            <p className="font-bold uppercase tracking-widest text-neon-orange">측정하지 못해요</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {FREESTYLE_NOT_MEASURED.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="mt-3 text-slate-400">
              팔이 얼굴이나 몸을 가리면 인식이 틀릴 수 있어요. 팔 길이가 갑자기 변하는 프레임은 제외하지만 완벽하지 않아요.
            </p>
          </section>

          {debug && playing && (
            <pre className="neon-card max-h-48 overflow-auto p-3 text-[11px] text-slate-300">
              {JSON.stringify({ live, last: lastResult && { q: Math.round(lastResult.quality), off: lastResult.offsetMs && Math.round(lastResult.offsetMs), detail: lastResult.detail } }, null, 1)}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

function Header() {
  return (
    <>
      <header className="mb-4">
        <h1 className="neon-title text-4xl font-black tracking-tight">{def.title}</h1>
        <p className="glow-cyan text-sm font-semibold tracking-wide text-neon-cyan">{def.subtitle}</p>
      </header>
      <p className="mb-5 inline-block rounded-md border border-neon-yellow/60 px-2 py-1 text-[11px] font-bold text-neon-yellow">
        임시 평가 기준 — 실제 사람 데이터로 조율하기 전이에요
      </p>
    </>
  )
}

function Meter({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-neon-violet">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-neon-cyan glow-cyan">{value === null ? '--' : Math.round(value)}</p>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{
            width: `${value ?? 0}%`,
            background: 'linear-gradient(90deg, #ff2a6d, #b967ff 50%, #05d9e8)',
            transition: 'width 80ms linear',
          }}
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    </div>
  )
}
