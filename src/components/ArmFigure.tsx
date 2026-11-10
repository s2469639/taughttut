import { armPoints } from '../utils/armKinematics'
import type { ArmAngles } from '../services/demo'

interface Props {
  angles: ArmAngles
  /** 팔 색 (기본 시안) */
  color?: string
  className?: string
  label?: string
}

const BONE = 46
const SHOULDER_Y = 72
// 거울 화면 기준: 내 오른팔은 그림의 오른쪽
const R_SHOULDER = { x: 134, y: 0 }
const L_SHOULDER = { x: 86, y: 0 }

/** 팔 각도로 그리는 정면 그림 (시범용). 각도 기준: 0°=오른쪽, 90°=위 */
export default function ArmFigure({ angles, color = '#05d9e8', className = 'h-44 w-56', label }: Props) {
  const arms = [
    { s: R_SHOULDER, a: angles.right },
    { s: L_SHOULDER, a: angles.left },
  ].map(({ s, a }) => {
    const { elbow, wrist } = armPoints(s, a.upper, a.fore, BONE, BONE * 0.95)
    // y는 위가 +인 좌표 → SVG(아래가 +)로 변환
    const toSvg = (p: { x: number; y: number }): [number, number] => [p.x, SHOULDER_Y - p.y]
    return [toSvg(s), toSvg(elbow), toSvg(wrist)]
  })

  return (
    <svg viewBox="0 0 220 170" className={className} role="img" aria-label={label ?? '시범 그림'}>
      <circle cx="110" cy="34" r="15" fill="none" stroke="#b967ff" strokeWidth="3" />
      <line x1="110" y1="49" x2="110" y2="150" stroke="#b967ff" strokeWidth="3" strokeLinecap="round" />
      <line x1="86" y1="72" x2="134" y2="72" stroke="#b967ff" strokeWidth="3" strokeLinecap="round" />
      {arms.map((pts, i) => (
        <g key={i} style={{ filter: `drop-shadow(0 0 5px ${color})` }}>
          <polyline
            points={pts.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {pts.map((p, j) => (
            <circle key={j} cx={p[0]} cy={p[1]} r="4" fill="#fff" />
          ))}
        </g>
      ))}
    </svg>
  )
}
