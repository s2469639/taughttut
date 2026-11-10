// 팔 관절 위치 계산 (순수 함수). 시범 그림과 테스트용 가상 좌표 생성에 사용합니다.
// 좌표계: 사용자 시점(거울 화면), y는 위가 +. 각도는 0°=오른쪽, 90°=위.

export interface Vec {
  x: number
  y: number
}

/** 어깨 위치와 윗팔·아랫팔 방향/길이로 팔꿈치·손목 위치를 계산 */
export function armPoints(
  shoulder: Vec,
  upperDeg: number,
  foreDeg: number,
  upperLen: number,
  foreLen: number,
): { elbow: Vec; wrist: Vec } {
  const ur = (upperDeg * Math.PI) / 180
  const fr = (foreDeg * Math.PI) / 180
  const elbow = { x: shoulder.x + Math.cos(ur) * upperLen, y: shoulder.y + Math.sin(ur) * upperLen }
  const wrist = { x: elbow.x + Math.cos(fr) * foreLen, y: elbow.y + Math.sin(fr) * foreLen }
  return { elbow, wrist }
}

/** 각도를 최단 경로로 보간 (a→b). t는 0~1 */
export function lerpAngleDeg(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180 // -180 ~ 180
  return a + diff * t
}
