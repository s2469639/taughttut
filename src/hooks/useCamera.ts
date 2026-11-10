import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'idle' | 'requesting' | 'ready' | 'error'
export type CameraErrorKind = 'denied' | 'not-found' | 'in-use' | 'insecure' | 'disconnected' | 'unknown'

export interface CameraError {
  kind: CameraErrorKind
  message: string
}

const ERROR_MESSAGES: Record<CameraErrorKind, string> = {
  denied:
    '카메라 권한이 거부되었어요. 주소창 왼쪽의 자물쇠(또는 카메라) 아이콘에서 카메라를 "허용"으로 바꾼 뒤 다시 시도해 주세요.',
  'not-found': '카메라를 찾을 수 없어요. 웹캠이 연결되어 있는지 확인해 주세요.',
  'in-use': '다른 프로그램(화상회의 등)이 카메라를 사용 중이에요. 그 프로그램을 끄고 다시 시도해 주세요.',
  insecure: '카메라는 HTTPS 또는 localhost 주소에서만 쓸 수 있어요.',
  disconnected: '카메라 연결이 끊어졌어요. 다시 연결한 뒤 시작해 주세요.',
  unknown: '카메라를 시작하지 못했어요. 다시 시도해 주세요.',
}

function toCameraError(err: unknown): CameraError {
  let kind: CameraErrorKind = 'unknown'
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') kind = 'denied'
  else if (name === 'NotFoundError' || name === 'OverconstrainedError') kind = 'not-found'
  else if (name === 'NotReadableError' || name === 'AbortError') kind = 'in-use'
  return { kind, message: ERROR_MESSAGES[kind] }
}

/**
 * 웹캠 연결. start()를 호출(사용자가 버튼을 누름)한 뒤에만 권한을 요청합니다.
 * 영상은 <video>에만 연결되며 어디로도 전송·저장되지 않습니다.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<CameraError | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const start = useCallback(async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError({ kind: 'insecure', message: ERROR_MESSAGES.insecure })
      setStatus('error')
      return
    }
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      // 카메라가 중간에 빠지면(USB 분리 등) 오류 상태로 전환
      stream.getVideoTracks().forEach((track) =>
        track.addEventListener('ended', () => {
          stop()
          setError({ kind: 'disconnected', message: ERROR_MESSAGES.disconnected })
          setStatus('error')
        }),
      )
      const video = videoRef.current
      if (!video) throw new Error('video element missing')
      video.srcObject = stream
      await video.play()
      setStatus('ready')
    } catch (err) {
      stop()
      setError(toCameraError(err))
      setStatus('error')
    }
  }, [stop])

  // 화면을 떠날 때 카메라를 끕니다
  useEffect(() => stop, [stop])

  return { videoRef, status, error, start, stop }
}
