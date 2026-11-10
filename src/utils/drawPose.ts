// 관절 오버레이 그리기. 캔버스는 CSS로 뒤집지 않고, 좌표를 직접 거울 처리((1-x))해서 그립니다.
// (그래야 각도 숫자 같은 글자가 뒤집혀 보이지 않습니다)

import { POSE_INDEX, type ArmsMeasurement, type Verdict } from '../services/poseEvaluator'
import type { RawLandmark } from './geometry'

const COLORS = {
  perfect: '#2dd4bf',
  good: '#fbbf24',
  adjust: '#f97316',
  neutral: '#c4b5fd',
  idle: '#9ca3af',
  guide: 'rgba(124,58,237,0.75)',
}

function px(lm: RawLandmark, w: number, h: number) {
  return { x: (1 - lm.x) * w, y: lm.y * h }
}

export function drawPose(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  landmarks: readonly RawLandmark[] | undefined,
  arms: ArmsMeasurement,
  verdict: Verdict | null,
): void {
  ctx.clearRect(0, 0, w, h)
  if (!landmarks || landmarks.length < 17) return

  const line = Math.max(3, w * 0.006)
  const dot = line * 1.6

  const rs = px(landmarks[POSE_INDEX.rightShoulder], w, h)
  const re = px(landmarks[POSE_INDEX.rightElbow], w, h)
  const rw = px(landmarks[POSE_INDEX.rightWrist], w, h)
  const ls = px(landmarks[POSE_INDEX.leftShoulder], w, h)
  const le = px(landmarks[POSE_INDEX.leftElbow], w, h)
  const lw = px(landmarks[POSE_INDEX.leftWrist], w, h)

  const rightColor = arms.right && verdict ? COLORS[verdict] : COLORS.idle

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 목표 가이드(ㄱ자): 내 오른쪽 어깨에서 바깥 수평 + 위 수직. 팔 길이는 내 팔 길이에 맞춤
  const upperLen = Math.hypot(re.x - rs.x, re.y - rs.y)
  const foreLen = Math.hypot(rw.x - re.x, rw.y - re.y)
  if (upperLen > 0 && foreLen > 0) {
    ctx.save()
    ctx.setLineDash([line * 2, line * 2])
    ctx.strokeStyle = COLORS.guide
    ctx.lineWidth = line
    ctx.beginPath()
    ctx.moveTo(rs.x, rs.y)
    ctx.lineTo(rs.x + upperLen, rs.y) // 거울 화면에서 사용자의 오른쪽 = 화면 오른쪽
    ctx.lineTo(rs.x + upperLen, rs.y - foreLen)
    ctx.stroke()
    ctx.restore()
  }

  // 어깨선 + 왼팔(평가 안 함, 연하게)
  ctx.strokeStyle = COLORS.neutral
  ctx.lineWidth = line
  ctx.beginPath()
  ctx.moveTo(rs.x, rs.y)
  ctx.lineTo(ls.x, ls.y)
  ctx.lineTo(le.x, le.y)
  ctx.lineTo(lw.x, lw.y)
  ctx.stroke()

  // 오른팔(평가 대상, 굵게)
  ctx.strokeStyle = rightColor
  ctx.lineWidth = line * 1.8
  ctx.beginPath()
  ctx.moveTo(rs.x, rs.y)
  ctx.lineTo(re.x, re.y)
  ctx.lineTo(rw.x, rw.y)
  ctx.stroke()

  // 관절 점
  const joints: Array<[typeof rs, string]> = [
    [rs, rightColor], [re, rightColor], [rw, rightColor],
    [ls, COLORS.neutral], [le, COLORS.neutral], [lw, COLORS.neutral],
  ]
  for (const [p, color] of joints) {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(p.x, p.y, dot + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(p.x, p.y, dot, 0, Math.PI * 2)
    ctx.fill()
  }

  // 오른쪽 팔꿈치 각도 숫자
  if (arms.right) {
    const fontPx = Math.max(16, w * 0.026)
    ctx.font = `700 ${fontPx}px system-ui, sans-serif`
    ctx.textBaseline = 'middle'
    const label = `${Math.round(arms.right.elbowAngleDeg)}°`
    ctx.lineWidth = fontPx * 0.25
    ctx.strokeStyle = 'rgba(30,27,75,0.85)'
    ctx.strokeText(label, re.x + dot * 2, re.y)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, re.x + dot * 2, re.y)
  }
}
