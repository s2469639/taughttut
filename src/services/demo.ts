// 시범 그림용 키프레임 보간. 채점에는 쓰이지 않는 "보여주기용"입니다.
import type { DemoKey } from '../data/challenge'
import { lerpAngleDeg } from '../utils/armKinematics'

export interface ArmAngles {
  right: { upper: number; fore: number }
  left: { upper: number; fore: number }
}

/** 키프레임 사이를 각도 보간해서 beat(0~마지막 키) 시점의 팔 각도를 얻음. 범위를 넘으면 반복 */
export function demoAtBeat(keys: readonly DemoKey[], beat: number): ArmAngles {
  const total = keys[keys.length - 1].beat
  const b = ((beat % total) + total) % total
  let i = 0
  while (i < keys.length - 2 && keys[i + 1].beat <= b) i++
  const k0 = keys[i]
  const k1 = keys[i + 1]
  const t = k1.beat === k0.beat ? 0 : (b - k0.beat) / (k1.beat - k0.beat)
  const mix = (a: number, bb: number) => lerpAngleDeg(a, bb, t)
  return {
    right: { upper: mix(k0.right.upper, k1.right.upper), fore: mix(k0.right.fore, k1.right.fore) },
    left: { upper: mix(k0.left.upper, k1.left.upper), fore: mix(k0.left.fore, k1.left.fore) },
  }
}
