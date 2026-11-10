import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { FREESTYLE_DEF } from '../data/freestyle'
import { FRAME, type PoseDefinition } from '../data/poses'
import type { MoveResult } from '../services/challengeRunner'
import { FreestyleRunner, type FreestyleState } from '../services/freestyleRunner'
import { createPoseLandmarker } from '../services/mediapipe'
import { buildFrame } from '../services/motionFrame'
import { measureArms, type ArmsMeasurement } from '../services/poseEvaluator'
import { contextTimeToPerf, scheduleSong } from '../services/rhythmAudio'
import { drawPose } from '../utils/drawPose'
import type { ChallengePhase } from './useChallenge'
import type { ModelStatus } from './usePoseTracking'

export interface FreestyleSnapshot {
  state: FreestyleState
  arms: ArmsMeasurement
  fps: number
}

const NO_TARGET: PoseDefinition = { ...FRAME, arms: {} }
const MIN_INFER_INTERVAL_MS = 33
const SNAPSHOT_INTERVAL_MS = 66
const AUDIO_LEAD_S = 0.35
const def = FREESTYLE_DEF

const EMPTY_ARMS: ArmsMeasurement = {
  tracking: { status: 'no-person', message: '카메라 앞에 서 주세요' },
  right: null,
  left: null,
}

interface Options {
  load: boolean
  cameraReady: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  /** 카메라·인식 지연 보정(ms) */
  latencyMs: number
}

/** 프리스타일 모드: 카메라 + 비트 + 원칙 기반 채점. 가이드 챌린지 훅(useChallenge)과 같은 구조입니다. */
export function useFreestyle({ load, cameraReady, videoRef, canvasRef, latencyMs }: Options) {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [modelError, setModelError] = useState<string | null>(null)
  const [phase, setPhase] = useState<ChallengePhase>('idle')
  const [abortReason, setAbortReason] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<MoveResult | null>(null)
  const [snapshot, setSnapshot] = useState<FreestyleSnapshot>(() => ({
    state: new FreestyleRunner(def).state,
    arms: EMPTY_ARMS,
    fps: 0,
  }))

  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const runnerRef = useRef<FreestyleRunner | null>(null)
  const audioRef = useRef<{ ctx: AudioContext; perfT0: number } | null>(null)
  const latencyRef = useRef(latencyMs)
  latencyRef.current = latencyMs

  const stopAudio = useCallback(() => {
    const a = audioRef.current
    audioRef.current = null
    if (a) void a.ctx.close().catch(() => undefined)
  }, [])

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

  useEffect(() => stopAudio, [stopAudio])

  useEffect(() => {
    if (phase === 'playing' && !cameraReady) {
      stopAudio()
      setAbortReason('카메라 연결이 끊겨서 멈췄어요. 카메라를 다시 켜고 시작해 주세요.')
      setPhase('idle')
    }
  }, [phase, cameraReady, stopAudio])

  useEffect(() => {
    if (!cameraReady || modelStatus !== 'ready') return
    const landmarker = landmarkerRef.current
    if (!landmarker) return

    let raf = 0
    let lastVideoTime = -1
    let lastInfer = 0
    let lastPublish = 0
    let arms = EMPTY_ARMS
    let fps = 0

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return

      const now = performance.now()
      const runner = runnerRef.current
      const audio = audioRef.current
      let newFrame = false
      let fresh: MoveResult[] = []

      if (now - lastInfer >= MIN_INFER_INTERVAL_MS && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        lastInfer = now
        newFrame = true
        const w = video.videoWidth
        const h = video.videoHeight
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        const result = landmarker.detectForVideo(video, now)
        const landmarks = result.landmarks[0]
        arms = measureArms(landmarks, w, h, ['right', 'left'])
        const ctx2d = canvas.getContext('2d')
        if (ctx2d) drawPose(ctx2d, w, h, landmarks, arms, NO_TARGET, null)
        if (runner && audio) {
          fresh = runner.push(buildFrame(landmarks, w, h, now - audio.perfT0 - latencyRef.current))
          fps = runner.state.live.fps
          if (fresh.length > 0) setLastResult(fresh[fresh.length - 1])
        }
      }

      if (runner && audio) {
        const songNow = now - audio.perfT0
        if (songNow >= runner.totalMs) {
          stopAudio()
          setSnapshot({ state: runner.state, arms, fps })
          setPhase('finished')
          return
        }
      }

      if (fresh.length > 0 || (newFrame && now - lastPublish >= SNAPSHOT_INTERVAL_MS)) {
        lastPublish = now
        if (runner) setSnapshot({ state: runner.state, arms, fps })
      }
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      const c = canvasRef.current
      c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    }
  }, [cameraReady, modelStatus, videoRef, canvasRef, stopAudio])

  const start = useCallback(async () => {
    setAbortReason(null)
    setLastResult(null)
    stopAudio()
    const ctx = new AudioContext()
    await ctx.resume()
    const t0 = ctx.currentTime + AUDIO_LEAD_S
    scheduleSong(ctx, t0, def)
    audioRef.current = { ctx, perfT0: contextTimeToPerf(ctx, t0) }
    runnerRef.current = new FreestyleRunner(def)
    setSnapshot({ state: runnerRef.current.state, arms: EMPTY_ARMS, fps: 0 })
    setPhase('playing')
  }, [stopAudio])

  const quit = useCallback(() => {
    stopAudio()
    runnerRef.current = null
    setPhase('idle')
  }, [stopAudio])

  const getSongMs = useCallback((): number | null => {
    const a = audioRef.current
    return a ? performance.now() - a.perfT0 : null
  }, [])

  return { modelStatus, modelError, phase, abortReason, lastResult, snapshot, start, quit, getSongMs }
}
