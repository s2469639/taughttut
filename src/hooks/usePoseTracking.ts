import { useEffect, useRef, useState, type RefObject } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import type { PoseDefinition } from '../data/poses'
import { LessonRunner, type RunnerState } from '../services/lessonRunner'
import { createPoseLandmarker } from '../services/mediapipe'
import { measureArms, type ArmsMeasurement } from '../services/poseEvaluator'
import { drawPose } from '../utils/drawPose'

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface TrackingSnapshot {
  arms: ArmsMeasurement
  runner: RunnerState
  /** 초당 추론 횟수 */
  fps: number
}

/** 추론 최대 빈도 (성능 보호). 약 30fps */
const MIN_INFER_INTERVAL_MS = 33
/** 화면 숫자 갱신 주기 (React 리렌더 보호) */
const SNAPSHOT_INTERVAL_MS = 100

const EMPTY_ARMS: ArmsMeasurement = {
  tracking: { status: 'no-person', message: '카메라 앞에 서 주세요' },
  right: null,
  left: null,
}

interface Options {
  /** true가 되면 모델을 불러옵니다 */
  load: boolean
  /** true면 카메라 프레임을 분석합니다 */
  running: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  /** 순서대로 통과해야 하는 포즈들 (1개면 유지형 레슨) */
  poses: readonly PoseDefinition[]
  /** 레슨이 바뀌면 진행 상태를 초기화하기 위한 키 */
  lessonKey: string
}

export function usePoseTracking({ load, running, videoRef, canvasRef, poses, lessonKey }: Options) {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [modelError, setModelError] = useState<string | null>(null)
  const landmarkerRef = useRef<PoseLandmarker | null>(null)

  const runnerRef = useRef<LessonRunner>(new LessonRunner(poses))
  const [snapshot, setSnapshot] = useState<TrackingSnapshot>(() => ({
    arms: EMPTY_ARMS,
    runner: runnerRef.current.state,
    fps: 0,
  }))

  // 레슨이 바뀌면 새 진행기로 교체
  useEffect(() => {
    runnerRef.current = new LessonRunner(poses)
    setSnapshot((s) => ({ arms: EMPTY_ARMS, runner: runnerRef.current.state, fps: s.fps }))
    // poses는 lessonKey에 종속된 고정 데이터라 키만 감시
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonKey])

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
    let lastStep = -1
    let lastDone = false

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

      const runner = runnerRef.current
      const result = landmarker.detectForVideo(video, now)
      const landmarks = result.landmarks[0]
      // 지금 단계의 포즈에 필요한 팔만 추적 실패 판단에 사용
      const arms = measureArms(landmarks, w, h, runner.required)
      const state = runner.update(now, arms)

      const ctx = canvas.getContext('2d')
      if (ctx) drawPose(ctx, w, h, landmarks, arms, state.pose, state.evaluation?.verdict ?? null)

      frames++
      if (now - fpsStart >= 1000) {
        fps = (frames * 1000) / (now - fpsStart)
        frames = 0
        fpsStart = now
      }

      // 단계가 바뀌거나 끝났을 때는 즉시 반영, 그 외에는 주기적으로
      const changed = state.stepIndex !== lastStep || state.done !== lastDone
      lastStep = state.stepIndex
      lastDone = state.done
      if (changed || now - lastPublish >= SNAPSHOT_INTERVAL_MS) {
        lastPublish = now
        setSnapshot({ arms, runner: state, fps })
      }
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      const c = canvasRef.current
      c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    }
  }, [running, modelStatus, videoRef, canvasRef, lessonKey])

  const resetLesson = () => {
    runnerRef.current.reset()
    setSnapshot((s) => ({ ...s, runner: runnerRef.current.state }))
  }

  return { modelStatus, modelError, snapshot, resetLesson }
}
