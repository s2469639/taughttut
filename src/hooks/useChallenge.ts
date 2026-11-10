import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import type { ChallengeDef } from '../data/challenge'
import { FRAME, type PoseDefinition } from '../data/poses'
import { ChallengeRunner, totalMsOf, type ChallengeState, type MoveResult } from '../services/challengeRunner'
import { createPoseLandmarker } from '../services/mediapipe'
import { buildFrame } from '../services/motionFrame'
import { measureArms, type ArmsMeasurement } from '../services/poseEvaluator'
import { contextTimeToPerf, scheduleSong } from '../services/rhythmAudio'
import { drawPose } from '../utils/drawPose'
import type { ModelStatus } from './usePoseTracking'

export type ChallengePhase = 'idle' | 'playing' | 'finished'

export interface ChallengeSnapshot {
  state: ChallengeState
  arms: ArmsMeasurement
  fps: number
}

/** 오버레이에 목표 가이드 없이 뼈대만 그리기 위한 빈 포즈 */
const NO_TARGET: PoseDefinition = { ...FRAME, arms: {} }

/** 추론 최대 빈도 (성능 보호) */
const MIN_INFER_INTERVAL_MS = 33
const SNAPSHOT_INTERVAL_MS = 66
/** 프레임이 늦게 도착할 수 있어, 평가 창이 끝난 뒤 이만큼 더 기다렸다가 채점 */
const EVAL_DELAY_MS = 120
/** 오디오 시작 전 여유 시간(초) */
const AUDIO_LEAD_S = 0.35

const EMPTY_ARMS: ArmsMeasurement = {
  tracking: { status: 'no-person', message: '카메라 앞에 서 주세요' },
  right: null,
  left: null,
}

interface Options {
  def: ChallengeDef
  /** true가 되면 모델을 불러옵니다 */
  load: boolean
  cameraReady: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  /** 카메라·인식 지연 보정(ms). 프레임 시각을 이만큼 앞당겨 박자와 맞춥니다 */
  latencyMs: number
  /** true면 모든 프레임을 보관해 기준 데이터로 저장할 수 있게 함 */
  keepFrames: boolean
}

export function useChallenge({ def, load, cameraReady, videoRef, canvasRef, latencyMs, keepFrames }: Options) {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [modelError, setModelError] = useState<string | null>(null)
  const [phase, setPhase] = useState<ChallengePhase>('idle')
  const [abortReason, setAbortReason] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<MoveResult | null>(null)
  const [snapshot, setSnapshot] = useState<ChallengeSnapshot>(() => ({
    state: new ChallengeRunner(def).state,
    arms: EMPTY_ARMS,
    fps: 0,
  }))

  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const runnerRef = useRef<ChallengeRunner | null>(null)
  const audioRef = useRef<{ ctx: AudioContext; perfT0: number } | null>(null)
  const latencyRef = useRef(latencyMs)
  latencyRef.current = latencyMs

  const stopAudio = useCallback(() => {
    const a = audioRef.current
    audioRef.current = null
    if (a) void a.ctx.close().catch(() => undefined)
  }, [])

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

  // 화면을 떠날 때 오디오 정리
  useEffect(() => stopAudio, [stopAudio])

  // 2) 카메라가 끊기면 진행 중인 챌린지를 중단 (일시정지 대신 안전하게 처음으로)
  useEffect(() => {
    if (phase === 'playing' && !cameraReady) {
      stopAudio()
      setAbortReason('카메라 연결이 끊겨서 챌린지를 멈췄어요. 카메라를 다시 켜고 시작해 주세요.')
      setPhase('idle')
    }
  }, [phase, cameraReady, stopAudio])

  // 3) 프레임 분석 + 채점 루프
  useEffect(() => {
    if (!cameraReady || modelStatus !== 'ready') return
    const landmarker = landmarkerRef.current
    if (!landmarker) return

    let raf = 0
    let lastVideoTime = -1
    let lastInfer = 0
    let lastPublish = 0
    let frames = 0
    let fpsStart = performance.now()
    let fps = 0
    let arms = EMPTY_ARMS

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return

      const now = performance.now()
      const runner = runnerRef.current
      const audio = audioRef.current
      let newFrame = false

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
          const frameSongMs = now - audio.perfT0 - latencyRef.current
          runner.pushFrame(buildFrame(landmarks, w, h, frameSongMs))
        }

        frames++
        if (now - fpsStart >= 1000) {
          fps = (frames * 1000) / (now - fpsStart)
          frames = 0
          fpsStart = now
        }
      }

      let fresh: MoveResult[] = []
      if (runner && audio) {
        fresh = runner.tick(now - audio.perfT0 - latencyRef.current - EVAL_DELAY_MS)
        if (fresh.length > 0) setLastResult(fresh[fresh.length - 1])
        if (runner.state.finished) {
          stopAudio()
          setSnapshot({ state: runner.state, arms, fps })
          setPhase('finished')
          return
        }
      }

      if (fresh.length > 0 || (newFrame && now - lastPublish >= SNAPSHOT_INTERVAL_MS)) {
        lastPublish = now
        setSnapshot({ state: runner?.state ?? snapshotStateFallback(def), arms, fps })
      }
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      const c = canvasRef.current
      c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraReady, modelStatus, videoRef, canvasRef, stopAudio])

  /** 사용자가 버튼을 눌렀을 때 호출 (오디오는 사용자 동작 안에서만 시작할 수 있음) */
  const start = useCallback(async () => {
    setAbortReason(null)
    setLastResult(null)
    stopAudio()
    const ctx = new AudioContext()
    await ctx.resume()
    const t0 = ctx.currentTime + AUDIO_LEAD_S
    scheduleSong(ctx, t0, def)
    audioRef.current = { ctx, perfT0: contextTimeToPerf(ctx, t0) }
    runnerRef.current = new ChallengeRunner(def, keepFrames)
    setSnapshot({ state: runnerRef.current.state, arms: EMPTY_ARMS, fps: 0 })
    setPhase('playing')
  }, [def, keepFrames, stopAudio])

  /** 중간에 그만두기 */
  const quit = useCallback(() => {
    stopAudio()
    runnerRef.current = null
    setPhase('idle')
  }, [stopAudio])

  /** 지금 노래 시각(ms). 시작 전/후에는 null */
  const getSongMs = useCallback((): number | null => {
    const a = audioRef.current
    return a ? performance.now() - a.perfT0 : null
  }, [])

  /** 기준 안무 저장용 데이터 (영상 없이 좌표만) */
  const exportRecording = useCallback((): string | null => {
    const runner = runnerRef.current
    if (!runner) return null
    return JSON.stringify({
      app: 'taught-tut',
      kind: 'reference-recording',
      version: 1,
      note: '좌표는 어깨 중점 원점, 어깨 너비 단위, x 오른쪽(+), y 위(+) 기준입니다. 영상은 포함되지 않습니다.',
      challengeId: def.id,
      bpm: def.bpm,
      countdownBeats: def.countdownBeats,
      latencyMs: latencyRef.current,
      totalMs: totalMsOf(def),
      frames: runner.recordedFrames.map((f) => ({
        t: Math.round(f.tMs),
        tracked: f.tracked,
        j: f.joints
          ? Object.fromEntries(Object.entries(f.joints).map(([k, p]) => [k, [+p.x.toFixed(3), +p.y.toFixed(3)]]))
          : null,
      })),
      results: runner.state.results,
    })
  }, [def])

  return { modelStatus, modelError, phase, abortReason, lastResult, snapshot, start, quit, getSongMs, exportRecording }
}

function snapshotStateFallback(def: ChallengeDef): ChallengeState {
  return new ChallengeRunner(def).state
}
