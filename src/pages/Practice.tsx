import { useRef, useState } from 'react'
import CameraView from '../components/CameraView'
import DebugPanel from '../components/DebugPanel'
import FeedbackPanel from '../components/FeedbackPanel'
import { LESSONS } from '../data/lessons'
import { useCamera } from '../hooks/useCamera'
import { usePoseTracking } from '../hooks/usePoseTracking'

export default function Practice() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { videoRef, status, error, start } = useCamera()
  const [debug, setDebug] = useState(() => new URLSearchParams(location.search).has('debug'))
  const [lessonIndex, setLessonIndex] = useState(0)
  const lesson = LESSONS[lessonIndex]

  const cameraReady = status === 'ready'
  const { modelStatus, modelError, snapshot, resetLesson } = usePoseTracking({
    load: status !== 'idle',
    running: cameraReady,
    videoRef,
    canvasRef,
    poses: lesson.poses,
    lessonKey: lesson.id,
  })

  const busy = status === 'requesting' || (cameraReady && modelStatus === 'loading')

  let overlay: string | null = null
  if (status === 'requesting') overlay = '카메라 권한을 허용해 주세요…'
  else if (cameraReady && modelStatus === 'loading') overlay = '동작 인식 모델을 불러오는 중…'

  const { runner } = snapshot
  const verdict = runner.evaluation?.verdict
  const ringClass = runner.done
    ? 'ring-glow-mint'
    : verdict === 'perfect'
      ? 'ring-glow-mint'
      : verdict === 'good'
        ? 'ring-glow-yellow'
        : 'ring-glow-idle'

  const goNext = lessonIndex < LESSONS.length - 1 ? () => setLessonIndex(lessonIndex + 1) : undefined

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="neon-title text-4xl font-black tracking-tight">TAUGHT TUT</h1>
          <p className="glow-cyan text-sm font-semibold tracking-wide text-neon-cyan">Learn the Angles. Feel the Beat.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
          디버그 모드
        </label>
      </header>

      {/* 레슨 선택 */}
      <nav className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="레슨 선택">
        {LESSONS.map((l, i) => {
          const active = i === lessonIndex
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setLessonIndex(i)}
              aria-current={active ? 'true' : undefined}
              className={`neon-card p-3 text-left transition ${
                active ? 'border-neon-pink! shadow-[0_0_22px_rgba(255,42,109,0.45)]' : 'opacity-75 hover:opacity-100'
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-widest text-neon-pink">
                Lesson {String(l.number).padStart(2, '0')} · {'★'.repeat(l.difficulty)}
                <span className="text-white/20">{'★'.repeat(3 - l.difficulty)}</span>
              </span>
              <span className="mt-0.5 block font-extrabold text-white">{l.title}</span>
              <span className="block text-xs text-slate-400">{l.koreanTitle} · {l.goal}</span>
            </button>
          )
        })}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <CameraView
            videoRef={videoRef}
            canvasRef={canvasRef}
            active={cameraReady}
            overlayMessage={overlay}
            ringClass={ringClass}
          />

          {(status === 'idle' || status === 'error') && (
            <div className="neon-card p-5">
              {status === 'error' && error && (
                <p className="mb-4 rounded-xl border border-neon-orange/60 bg-neon-orange/10 px-4 py-3 text-sm font-semibold text-neon-orange" role="alert">
                  {error.message}
                </p>
              )}
              <p className="mb-4 text-sm text-slate-300">
                웹캠으로 내 팔 각도를 확인해요. 영상은 이 브라우저 안에서만 처리되고 어디에도 전송·저장되지 않아요.
                카메라 정면에서, 어깨부터 손목까지 화면에 보이게 서 주세요.
              </p>
              <button
                type="button"
                onClick={start}
                disabled={busy}
                className="w-full rounded-xl bg-neon-pink px-6 py-4 text-lg font-extrabold text-white hover:brightness-110 disabled:opacity-60"
                style={{ boxShadow: '0 0 24px rgba(255,42,109,.55)' }}
              >
                {status === 'error' ? '다시 시도' : '카메라 켜고 시작하기'}
              </button>
            </div>
          )}

          {modelStatus === 'error' && modelError && (
            <p className="rounded-xl border border-neon-orange/60 bg-neon-orange/10 px-4 py-3 text-sm font-semibold text-neon-orange" role="alert">
              {modelError}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <FeedbackPanel lesson={lesson} snapshot={snapshot} onRetry={resetLesson} onNext={goNext} />
          <ul className="neon-card space-y-1 p-4 text-xs text-slate-300">
            <li className="font-bold uppercase tracking-widest text-neon-violet">이번 레슨에서 보는 것</li>
            {lesson.checks.map((c) => (
              <li key={c}>· {c}</li>
            ))}
          </ul>
        </div>
      </div>

      {debug && (
        <div className="mt-6">
          <DebugPanel snapshot={snapshot} />
        </div>
      )}
    </div>
  )
}
