import { useRef, useState } from 'react'
import CameraView from '../components/CameraView'
import DebugPanel from '../components/DebugPanel'
import FeedbackPanel from '../components/FeedbackPanel'
import { RIGHT_ANGLE } from '../data/poses'
import { useCamera } from '../hooks/useCamera'
import { usePoseTracking } from '../hooks/usePoseTracking'

const pose = RIGHT_ANGLE

export default function Practice() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { videoRef, status, error, start } = useCamera()
  const [debug, setDebug] = useState(() => new URLSearchParams(location.search).has('debug'))

  const cameraReady = status === 'ready'
  const { modelStatus, modelError, snapshot, resetHold } = usePoseTracking({
    load: status !== 'idle',
    running: cameraReady,
    videoRef,
    canvasRef,
    pose,
  })

  const modelReady = modelStatus === 'ready'
  const busy = status === 'requesting' || (cameraReady && modelStatus === 'loading')

  let overlay: string | null = null
  if (status === 'requesting') overlay = '카메라 권한을 허용해 주세요…'
  else if (cameraReady && modelStatus === 'loading') overlay = '동작 인식 모델을 불러오는 중…'

  const verdict = snapshot.evaluation?.verdict
  const borderClass = snapshot.hold.cleared
    ? 'ring-teal-400'
    : verdict === 'perfect'
      ? 'ring-teal-300'
      : verdict === 'good'
        ? 'ring-amber-300'
        : 'ring-white'

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-brand">TAUGHT TUT</h1>
          <p className="text-sm font-semibold text-slate-500">Learn the Angles. Feel the Beat.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
          디버그 모드
        </label>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <CameraView
            videoRef={videoRef}
            canvasRef={canvasRef}
            active={cameraReady}
            overlayMessage={overlay}
            borderClass={borderClass}
          />

          {(status === 'idle' || status === 'error') && (
            <div className="rounded-2xl bg-white p-5 shadow-md">
              {status === 'error' && error && (
                <p className="mb-4 rounded-xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800" role="alert">
                  {error.message}
                </p>
              )}
              <p className="mb-4 text-sm text-slate-600">
                웹캠으로 내 팔 각도를 확인해요. 영상은 이 브라우저 안에서만 처리되고 어디에도 전송·저장되지 않아요.
                카메라 정면에서, 어깨부터 손목까지 화면에 보이게 서 주세요.
              </p>
              <button
                type="button"
                onClick={start}
                disabled={busy}
                className="w-full rounded-xl bg-brand px-6 py-4 text-lg font-extrabold text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {status === 'error' ? '다시 시도' : '카메라 켜고 시작하기'}
              </button>
            </div>
          )}

          {modelStatus === 'error' && modelError && (
            <p className="rounded-xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800" role="alert">
              {modelError}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <FeedbackPanel pose={pose} snapshot={snapshot} onRetry={resetHold} />
          {!modelReady && cameraReady && modelStatus !== 'error' && (
            <p className="text-center text-xs text-slate-500">모델을 불러오는 중이에요…</p>
          )}
        </div>
      </div>

      {debug && (
        <div className="mt-6">
          <DebugPanel pose={pose} snapshot={snapshot} />
        </div>
      )}
    </div>
  )
}
