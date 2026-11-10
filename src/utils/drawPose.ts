// 관절 오버레이 그리기. 캔버스는 CSS로 뒤집지 않고, 좌표를 직접 거울 처리((1-x))해서 그립니다.
// (그래야 각도 숫자 같은 글자가 뒤집혀 보이지 않습니다)

import type { ArmSide, ArmTarget, PoseDefinition } from '../data/poses'
import { POSE_INDEX, type ArmsMeasurement, type Verdict } from '../services/poseEvaluator'
import type { RawLandmark } from './geometry'

// 네오펑크 팔레트
const COLORS = {
  perfect: '#05ffa1', // 네온 민트
  good: '#f9f002', // 네온 옐로
  adjust: '#ff9f1c', // 오렌지
  neutral: '#b967ff', // 네온 바이올렛
  idle: '#9aa0c8',
  guide: 'rgba(5,217,232,0.9)', // 시안 점선 가이드
}

type Pt = { x: number; y: number }

function px(lm: RawLandmark, w: number, h: number): Pt {
  return { x: (1 - lm.x) * w, y: lm.y * h }
}

/** 화면 각도(0°=오른쪽, 90°=위)로 길이만큼 이동 */
function along(p: Pt, deg: number, len: number): Pt {
  const r = (deg * Math.PI) / 180
  return { x: p.x + Math.cos(r) * len, y: p.y - Math.sin(r) * len }
}

export function drawPose(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  landmarks: readonly RawLandmark[] | undefined,
  arms: ArmsMeasurement,
  pose: PoseDefinition,
  verdict: Verdict | null,
): void {
  ctx.clearRect(0, 0, w, h)
  if (!landmarks || landmarks.length < 17) return

  const line = Math.max(3, w * 0.006)
  const dot = line * 1.6

  const pts: Record<ArmSide, { s: Pt; e: Pt; w: Pt }> = {
    right: {
      s: px(landmarks[POSE_INDEX.rightShoulder], w, h),
      e: px(landmarks[POSE_INDEX.rightElbow], w, h),
      w: px(landmarks[POSE_INDEX.rightWrist], w, h),
    },
    left: {
      s: px(landmarks[POSE_INDEX.leftShoulder], w, h),
      e: px(landmarks[POSE_INDEX.leftElbow], w, h),
      w: px(landmarks[POSE_INDEX.leftWrist], w, h),
    },
  }

  const targetColor = verdict ? COLORS[verdict] : COLORS.idle
  const targets = pose.arms as Partial<Record<ArmSide, ArmTarget>>

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 목표 가이드: 내 팔 길이에 맞춘 점선 ㄱ자 (목표 방향대로)
  for (const side of ['right', 'left'] as ArmSide[]) {
    const t = targets[side]
    if (!t) continue
    const { s, e, w: wr } = pts[side]
    const upperLen = Math.hypot(e.x - s.x, e.y - s.y)
    const foreLen = Math.hypot(wr.x - e.x, wr.y - e.y)
    if (upperLen === 0 || foreLen === 0) continue
    const elbowGhost = along(s, t.upperArmDirectionDeg, upperLen)
    const wristGhost = along(elbowGhost, t.forearmDirectionDeg, foreLen)
    ctx.save()
    ctx.setLineDash([line * 2, line * 2])
    ctx.strokeStyle = COLORS.guide
    ctx.shadowColor = COLORS.guide
    ctx.shadowBlur = line * 3
    ctx.lineWidth = line
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(elbowGhost.x, elbowGhost.y)
    ctx.lineTo(wristGhost.x, wristGhost.y)
    ctx.stroke()
    ctx.restore()
  }

  // 어깨선
  ctx.strokeStyle = COLORS.neutral
  ctx.lineWidth = line
  ctx.beginPath()
  ctx.moveTo(pts.right.s.x, pts.right.s.y)
  ctx.lineTo(pts.left.s.x, pts.left.s.y)
  ctx.stroke()

  // 팔: 평가하는 팔은 굵게 + 판정 색, 자유 팔은 연하게
  for (const side of ['right', 'left'] as ArmSide[]) {
    const evaluated = Boolean(targets[side])
    const { s, e, w: wr } = pts[side]
    const color = evaluated ? targetColor : COLORS.neutral
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = evaluated ? line * 1.8 : line
    if (evaluated) {
      ctx.shadowColor = color
      ctx.shadowBlur = line * 3
    }
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(e.x, e.y)
    ctx.lineTo(wr.x, wr.y)
    ctx.stroke()
    ctx.restore()

    for (const p of [s, e, wr]) {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(p.x, p.y, dot + 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(p.x, p.y, dot, 0, Math.PI * 2)
      ctx.fill()
    }

    // 평가하는 팔의 팔꿈치 각도 숫자
    const m = arms[side]
    if (evaluated && m) {
      const fontPx = Math.max(16, w * 0.026)
      ctx.font = `700 ${fontPx}px system-ui, sans-serif`
      ctx.textBaseline = 'middle'
      ctx.textAlign = side === 'right' ? 'left' : 'right'
      const label = `${Math.round(m.elbowAngleDeg)}°`
      const dx = (side === 'right' ? 1 : -1) * dot * 2
      ctx.lineWidth = fontPx * 0.25
      ctx.strokeStyle = 'rgba(10,6,24,0.9)'
      ctx.strokeText(label, e.x + dx, e.y)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, e.x + dx, e.y)
    }
  }
}
