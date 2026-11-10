// MediaPipe Pose Landmarker 로딩. 모델과 wasm 모두 이 앱(public/)에서 불러옵니다.
// → 외부 CDN 의존이 없고, 영상이 어디로도 전송되지 않습니다.

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const base = import.meta.env.BASE_URL

export const MODEL_URL = `${base}models/pose_landmarker_lite.task`
const WASM_DIR = `${base}wasm`

export async function createPoseLandmarker(): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM_DIR)

  const create = (delegate: 'GPU' | 'CPU') =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    })

  try {
    return await create('GPU')
  } catch (gpuError) {
    // GPU를 못 쓰는 기기에서는 CPU로 대체
    console.warn('[mediapipe] GPU 초기화 실패, CPU로 전환합니다.', gpuError)
    return await create('CPU')
  }
}
