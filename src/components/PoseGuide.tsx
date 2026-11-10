import type { ArmSide, PoseDefinition } from '../data/poses'

const BONE = 34

/** 화면 각도(0°=오른쪽, 90°=위)로 이동 */
function along(p: [number, number], deg: number, len: number): [number, number] {
  const r = (deg * Math.PI) / 180
  return [p[0] + Math.cos(r) * len, p[1] - Math.sin(r) * len]
}

/**
 * 목표 자세 미리보기. 포즈 데이터의 목표 방향으로 그린 간단한 정면 그림입니다.
 * 거울 화면 기준이라 내 오른팔은 그림의 오른쪽에 나옵니다.
 */
export default function PoseGuide({ pose }: { pose: PoseDefinition }) {
  const shoulders: Record<ArmSide, [number, number]> = { right: [104, 66], left: [56, 66] }

  return (
    <svg viewBox="0 0 160 130" className="h-32 w-40" role="img" aria-label={`${pose.koreanName} 목표 자세`}>
      <circle cx="80" cy="30" r="13" fill="none" stroke="#b967ff" strokeWidth="3" />
      <line x1="80" y1="43" x2="80" y2="118" stroke="#b967ff" strokeWidth="3" strokeLinecap="round" />
      <line x1="56" y1="66" x2="104" y2="66" stroke="#b967ff" strokeWidth="3" strokeLinecap="round" />
      {(['right', 'left'] as ArmSide[]).map((side) => {
        const s = shoulders[side]
        const t = pose.arms[side]
        if (!t) {
          // 자유 팔: 편하게 내림 (연하게)
          const e: [number, number] = [s[0] + (side === 'right' ? 6 : -6), s[1] + BONE]
          const w: [number, number] = [e[0] + (side === 'right' ? 3 : -3), e[1] + BONE * 0.9]
          return (
            <polyline
              key={side}
              points={`${s} ${e} ${w}`}
              fill="none"
              stroke="#6b5f99"
              strokeWidth="3"
              strokeDasharray="4 5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        }
        const e = along(s, t.upperArmDirectionDeg, BONE)
        const w = along(e, t.forearmDirectionDeg, BONE * 0.9)
        return (
          <g key={side} style={{ filter: 'drop-shadow(0 0 4px #05d9e8)' }}>
            <polyline
              points={`${s} ${e} ${w}`}
              fill="none"
              stroke="#05d9e8"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {[s, e, w].map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="4" fill="#fff" />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
