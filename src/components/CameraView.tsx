import type { RefObject } from 'react'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  active: boolean
  /** 화면 위에 띄울 상태 문구 (로딩 등) */
  overlayMessage?: string | null
  borderClass?: string
}

/** 거울처럼 좌우 반전된 카메라 화면 + 관절 오버레이 캔버스 */
export default function CameraView({ videoRef, canvasRef, active, overlayMessage, borderClass }: Props) {
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-indigo-950 shadow-lg ring-4 transition-colors ${
        borderClass ?? 'ring-white'
      }`}
    >
      {/* 거울 화면: 표시만 반전(-scale-x-100). 판정 좌표는 반전 전 원본을 사용 */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${active ? '' : 'invisible'}`}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
      {!active && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-indigo-200">
          카메라가 꺼져 있어요
        </div>
      )}
      {overlayMessage && (
        <div className="absolute inset-0 flex items-center justify-center bg-indigo-950/70 px-6 text-center text-base font-semibold text-white">
          {overlayMessage}
        </div>
      )}
    </div>
  )
}
