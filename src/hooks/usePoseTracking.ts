import { useEffect, useRef, useState, type RefObject } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import type { PoseDefinition } from '../data/poses'
import { createPoseLandmarker } from '../services/mediapipe'
import {
  HoldTracker,
  evaluatePose,
  measureArms,
  type ArmsMeasurement,
  type HoldState,
  type PoseEvaluation,
} from '../services/poseEvaluator'
import { drawPose } from '../utils/drawPose'

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface TrackingSnapshot {
  arms: ArmsMeasurement
  evaluation: PoseEvaluation | null
  hold: HoldState
  /** 초당 추론 횟수 */
  fps: number
}

const EMPTY_SNAPSHOT: TrackingSnapshot = {
  arms: {
    tracking: { status: 'no-person', message: '카메라 앞에 서 주세요' },
    right: null,
    left: null,
  },
  evaluation: null,
  hold: { heldMs: 0, cleared: false, paused: false },
  fps: 0,
}

/** 추론 최대 빈도 (성능 보호). 약 30fps */
const MIN_INFER_INTERVAL_MS = 33
/** 화면 숫자 갱신 주기 (React 리렌더 보호) */
const SNAPSHOT_INTERVAL_MS = 100

interface Options {
  /** true가 되면 모델을 불러옵니다 */
  load: boolean
  /** true면 카메라 프레임을 분석합니다 */
  running: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  pose: PoseDefinition
}

export function usePoseTracking({ load, running, videoRef, canvasRef, pose }: Options) {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [modelError, setModelError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<TrackingSnapshot>(EMPTY_SNAPSHOT)
  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const trackerRef = useRef(new HoldTracker(pose.holdDurationMs))
  const poseRef = useRef(pose)
  poseRef.current = pose

  // 1) 모델 로딩
  useEffect(() => {
    if (!load) return
    let cancelled = false
    setModelStatus('loading')
    setModelError(null)
    createPoseLandmarker()
      .then((lm) => {
        if (cancelled) return lm.close()
        landmarkerRef.current = lm
        setModelStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[mediapipe] 모델 로딩 실패', err)
        setModelError('동작 인식 모델을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.')
        setModelStatus('error')
      })
    return () => {
      cancelled = true
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [load])

  // 2) 프레임 분석 루프
  useEffect(() => {
    if (!running || modelStatus !== 'ready') return
    const landmarker = landmarkerRef.current
    if (!landmarker) return

    let raf = 0
    let lastVideoTime = -1
    let lastInfer = 0
    let lastPublish = 0
    let frames = 0
    let fpsStart = performance.now()
    let fps = 0
    let wasCleared = false
    trackerRef.current.reset()

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return

      const now = performance.now()
      if (now - lastInfer < MIN_INFER_INTERVAL_MS) return
      if (video.currentTime === lastVideoTime) return // 새 프레임이 아님
      lastVideoTime = video.currentTime
      lastInfer = now

      const w = video.videoWidth
      const h = video.videoHeight
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }

      const result = landmarker.detectForVideo(video, now)
      const landmarks = result.landmarks[0]
      const arms = measureArms(landmarks, w, h)
      const evaluation = arms.right ? evaluatePose(poseRef.current, arms.right) : null
      const hold = trackerRef.current.update(
        now,
        arms.right ? (evaluation!.inTolerance ? 'in' : 'out') : 'untracked',
      )

      const ctx = canvas.getContext('2d')
      if (ctx) drawPose(ctx, w, h, landmarks, arms, evaluation?.verdict ?? null)

      frames++
      if (now - fpsStart >= 1000) {
        fps = (frames * 1000) / (now - fpsStart)
        frames = 0
        fpsStart = now
      }

      const justCleared = hold.cleared && !wasCleared
      wasCleared = hold.cleared
      if (justCleared || now - lastPublish >= SNAPSHOT_INTERVAL_MS) {
        lastPublish = now
        setSnapshot({ arms, evaluation, hold, fps })
      }
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      canvasRef.current?.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
  }, [running, modelStatus, videoRef, canvasRef])

  const resetHold = () => {
    trackerRef.current.reset()
    setSnapshot((s) => ({ ...s, hold: { heldMs: 0, cleared: false, paused: false } }))
  }

  return { modelStatus, modelError, snapshot, resetHold }
}
