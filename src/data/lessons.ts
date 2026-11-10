// 레슨 정의. 레슨은 "포즈 순서"로 구성됩니다.
// - 포즈가 1개: 그 자세를 유지하면 통과
// - 포즈가 여러 개(flow): 순서대로 각 자세에 도달하면 통과
//
// ※ 포즈는 모두 임시 테스트 포즈입니다 (검증된 시범 자료 확보 전).

import { FRAME, LEFT_ANGLE, RIGHT_ANGLE, type PoseDefinition } from './poses'

export interface Lesson {
  id: string
  number: number
  title: string
  koreanTitle: string
  goal: string
  difficulty: 1 | 2 | 3
  kind: 'hold' | 'flow'
  poses: PoseDefinition[]
  /** 이번 레슨에서 보는 것 (쉬운 말) */
  checks: string[]
}

export const LESSONS: Lesson[] = [
  {
    id: 'king-tut-basics',
    number: 1,
    title: 'King Tut Basics',
    koreanTitle: '킹텃 기초',
    goal: '팔로 또렷한 직각(ㄱ자)을 만들어요',
    difficulty: 1,
    kind: 'hold',
    poses: [RIGHT_ANGLE],
    checks: ['팔꿈치 각도 (약 90°)', '윗팔 방향 (어깨→팔꿈치)', '아랫팔 방향 (팔꿈치→손목)'],
  },
  {
    id: 'box-tutting',
    number: 2,
    title: 'Box Tutting',
    koreanTitle: '박스 텃팅',
    goal: '양팔로 네모에 가까운 틀(프레임)을 만들어요',
    difficulty: 2,
    kind: 'hold',
    poses: [FRAME],
    checks: ['양쪽 팔꿈치 각도', '양팔의 방향', '좌우 균형 (팔꿈치 각도 차이, 손목 높이 차이)'],
  },
  {
    id: 'tutting-flow',
    number: 3,
    title: 'Tutting Flow',
    koreanTitle: '텃팅 플로우',
    goal: '배운 자세를 순서대로 이어서 만들어요',
    difficulty: 3,
    kind: 'flow',
    poses: [RIGHT_ANGLE, LEFT_ANGLE, FRAME],
    checks: ['목표 자세에 도달했는지', '자세 순서', '자세를 바꾸는 데 걸린 시간'],
  },
]
