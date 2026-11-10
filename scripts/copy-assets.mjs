// MediaPipe 실행 파일(wasm)을 node_modules에서 public/wasm으로 복사합니다.
// 외부 CDN 없이 로컬에서 불러오기 위해서입니다. (public/wasm은 git에 올리지 않음)
import { cpSync, mkdirSync, existsSync } from 'node:fs'

const src = 'node_modules/@mediapipe/tasks-vision/wasm'
const dst = 'public/wasm'

if (!existsSync(src)) {
  console.error(`[copy-assets] ${src} 가 없습니다. 먼저 npm install 을 실행하세요.`)
  process.exit(1)
}
mkdirSync(dst, { recursive: true })
cpSync(src, dst, { recursive: true })
console.log(`[copy-assets] ${src} -> ${dst}`)
