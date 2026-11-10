// FIRST TUT FLOW — 리듬 챌린지 안무 데이터
//
// ⚠️ 이 안무와 평가 기준은 모두 "기획 초안 + 임시 기준"입니다.
//   - 실제 사람이 춘 기준 안무(MediaPipe 좌표)로 검증·교정하기 전입니다.
//   - 아래 숫자(거리, 각도, 허용 범위)는 규칙 기반으로 제가 정한 가정값입니다.
//   - 사람이 실제로 수행 가능한 움직임인지는 확인 필요입니다.
//   - 시범 그림(demo)은 보여주기용 일러스트이며 채점에는 쓰이지 않습니다.
//
// 좌표 규칙: 거울 화면 기준. 각도 0°=화면 오른쪽, 90°=위, 180°=화면 왼쪽.
//   사용자의 오른팔이 바깥으로 뻗으면 0°, 왼팔이 바깥으로 뻗으면 180°.
//   거리 단위 = 어깨 너비(몸 크기 기준).

import type { ArmSide, PoseDefinition } from './poses'
import { FRAME } from './poses'

export type MoveKind = 'slide' | 'box' | 'rotate' | 'wave' | 'fold' | 'hit'

export interface SlideSpec {
  /** 손목이 이동해야 하는 방향 */
  arms: Partial<Record<ArmSide, { dirDeg: number }>>
  /** 최소 이동 거리 (어깨 너비 단위) */
  minDistance: number
  dirTolDeg: number
}

export interface RotateSpec {
  /** 윗팔·아랫팔 각각의 시작/끝 방향. 회전량(부호 포함)은 to - from 으로 계산 */
  arms: Partial<
    Record<ArmSide, { upper: { fromDeg: number; toDeg: number }; fore: { fromDeg: number; toDeg: number } }>
  >
  startTolDeg: number
  endTolDeg: number
  deltaTolDeg: number
}

export interface WaveSpec {
  /** 웨이브가 전달되는 방향 (사용자 기준 손 이름) */
  direction: 'right-to-left' | 'left-to-right'
  /** 이 정도는 움직여야 "움직였다"고 봄 (어깨 너비 단위) */
  minAmplitude: { wrist: number; elbow: number; shoulder: number }
}

export interface FoldSpec {
  arms: Partial<Record<ArmSide, { fromAngleDeg: number; toAngleDeg: number }>>
  startTolDeg: number
  endTolDeg: number
}

export interface PoseSpec {
  pose: PoseDefinition
}

interface MoveBase {
  id: string
  name: string
  koreanName: string
  /** 8카운트 중 시작 카운트 (1~8) — 화면 표시용 */
  startCount: number
  /** 차지하는 카운트 수 — 화면 표시용 */
  spanCounts: number
  /**
   * 목표 시각(비트 단위, 시퀀스 시작=0).
   * 자세형(box, hit)은 이 박자에 자세가 완성돼야 하고, 동작형(slide, rotate, wave, fold)은 이 박자까지 동작이 끝나야 함.
   */
  targetBeat: number
  /** 동작형: 동작이 시작되는 박자 */
  startBeat: number
  /** 박자 판정 범위 배율 (동작형은 시작·끝이 흐려서 더 넉넉하게) */
  timingScale: number
  /** 한 줄 설명 */
  description: string
  /** 이 동작에서 실제로 측정하는 것 */
  measures: string[]
  /** 측정하지 못하는 것 (정확하게 평가한다고 표시하면 안 됨) */
  notMeasured: string[]
}

export type MoveDef =
  | (MoveBase & { kind: 'slide'; spec: SlideSpec })
  | (MoveBase & { kind: 'box'; spec: PoseSpec })
  | (MoveBase & { kind: 'rotate'; spec: RotateSpec })
  | (MoveBase & { kind: 'wave'; spec: WaveSpec })
  | (MoveBase & { kind: 'fold'; spec: FoldSpec })
  | (MoveBase & { kind: 'hit'; spec: PoseSpec })

/** 마지막 동작(Final Hit)용 임시 포즈: 오른팔은 ㄱ자(위), 왼팔은 아랫팔을 아래로 */
export const FINAL_HIT: PoseDefinition = {
  id: 'final-hit',
  name: 'Final Hit',
  koreanName: '마지막 포즈',
  difficulty: 2,
  mode: 'static-pose',
  description: '오른팔은 ㄱ자(아랫팔 위), 왼팔은 윗팔을 옆으로 펴고 아랫팔을 아래로.',
  arms: {
    right: { elbowAngleDeg: 90, upperArmDirectionDeg: 0, forearmDirectionDeg: 90 },
    left: { elbowAngleDeg: 90, upperArmDirectionDeg: 180, forearmDirectionDeg: -90 },
  },
  tolerance: { elbowAngleDeg: 15, upperArmDirectionDeg: 20, forearmDirectionDeg: 20 },
  weights: { elbowAngle: 0.4, upperArmDirection: 0.3, forearmDirection: 0.3 },
  holdDurationMs: 0,
  provisional: true,
}

export interface ChallengeDef {
  id: string
  title: string
  subtitle: string
  bpm: number
  beatsPerSequence: number
  repeatCount: number
  countdownBeats: number
  endingBeats: number
  moves: MoveDef[]
}

export const FIRST_TUT_FLOW: ChallengeDef = {
  id: 'first-tut-flow',
  title: 'FIRST TUT FLOW',
  subtitle: 'King Tutting 기반 · 8카운트 × 4회',
  bpm: 100, // 실습용 초기값. 플레이 테스트 후 조정
  beatsPerSequence: 8,
  repeatCount: 4,
  countdownBeats: 4,
  endingBeats: 2,
  moves: [
    {
      id: 'open-slide',
      kind: 'slide',
      name: 'Open & Slide',
      koreanName: '열고 밀기',
      startCount: 1,
      spanCounts: 2,
      startBeat: 0,
      targetBeat: 2,
      timingScale: 2,
      description: '가슴 앞에서 교차한 팔을 양옆으로 밀어 프레임을 열어요.',
      spec: {
        arms: { right: { dirDeg: 0 }, left: { dirDeg: 180 } },
        minDistance: 0.8,
        dirTolDeg: 30,
      },
      measures: ['양 손목이 움직인 방향', '손목이 움직인 거리', '움직임이 곧은 정도', '끝난 박자'],
      notMeasured: ['손목의 회전', '손가락·손바닥 모양'],
    },
    {
      id: 'box',
      kind: 'box',
      name: 'Box',
      koreanName: '박스',
      startCount: 3,
      spanCounts: 1,
      startBeat: 2,
      targetBeat: 2,
      timingScale: 1,
      description: '양팔 ㄱ자로 사각형 틀을 완성해요.',
      spec: { pose: FRAME },
      measures: ['양쪽 팔꿈치 각도', '윗팔·아랫팔 방향', '좌우 균형', '자세가 완성된 박자'],
      notMeasured: ['손목 꺾임', '손가락 모양'],
    },
    {
      id: 'rotate',
      kind: 'rotate',
      name: 'Rotate',
      koreanName: '회전',
      startCount: 4,
      spanCounts: 1,
      startBeat: 3,
      targetBeat: 4,
      timingScale: 1.5,
      description: '프레임을 90° 돌려 팔꿈치를 내리고 아랫팔을 옆으로 펴요.',
      spec: {
        arms: {
          right: { upper: { fromDeg: 0, toDeg: -90 }, fore: { fromDeg: 90, toDeg: 0 } },
          left: { upper: { fromDeg: 180, toDeg: 270 }, fore: { fromDeg: 90, toDeg: 180 } },
        },
        startTolDeg: 30,
        endTolDeg: 30,
        deltaTolDeg: 35,
      },
      measures: ['윗팔·아랫팔 방향이 바뀐 정도(시작·끝·회전량)', '회전 방향', '끝난 박자'],
      notMeasured: ['앞뒤로 도는 회전(깊이)', '손목의 세밀한 이동 경로'],
    },
    {
      id: 'arm-wave',
      kind: 'wave',
      name: 'Arm Wave',
      koreanName: '암 웨이브',
      startCount: 5,
      spanCounts: 2,
      startBeat: 4,
      targetBeat: 6,
      timingScale: 2,
      description: '오른손에서 시작해 팔꿈치, 어깨를 지나 왼손까지 물결이 이어지게 해요.',
      spec: { direction: 'right-to-left', minAmplitude: { wrist: 0.25, elbow: 0.15, shoulder: 0.04 } },
      measures: ['손목·팔꿈치·어깨가 움직인 순서 (대략)', '움직인 관절 수', '끝난 박자'],
      notMeasured: ['손목 굴림', '손가락·손바닥의 움직임', '관절 하나하나의 세밀한 곡선'],
    },
    {
      id: 'fold',
      kind: 'fold',
      name: 'Fold',
      koreanName: '접기',
      startCount: 7,
      spanCounts: 1,
      startBeat: 6,
      targetBeat: 7,
      timingScale: 1.5,
      description: '펴져 있던 팔을 접어 직각 형태로 바꿔요.',
      spec: {
        arms: {
          right: { fromAngleDeg: 150, toAngleDeg: 90 },
          left: { fromAngleDeg: 150, toAngleDeg: 90 },
        },
        startTolDeg: 30,
        endTolDeg: 20,
      },
      measures: ['양 팔꿈치 각도가 줄어든 정도', '시작·끝 각도', '끝난 박자'],
      notMeasured: ['팔이 몸에 가려질 때의 정확한 각도 (인식이 흔들릴 수 있음)'],
    },
    {
      id: 'final-hit',
      kind: 'hit',
      name: 'Final Hit',
      koreanName: '마지막 포즈',
      startCount: 8,
      spanCounts: 1,
      startBeat: 7,
      targetBeat: 7,
      timingScale: 1,
      description: '박자에 맞춰 마지막 포즈를 딱 멈춰요.',
      spec: { pose: FINAL_HIT },
      measures: ['최종 자세(팔꿈치 각도, 팔 방향)', '자세가 완성된 박자'],
      notMeasured: ['손목 꺾임', '손가락 모양'],
    },
  ],
}

/**
 * 리듬 판정 기준 (초기 설계용 테스트값, 실측 후 조정).
 * 자세/동작의 완성도(quality 0~100)와 박자 오차(ms)를 따로 보고 합칩니다.
 */
export const RHYTHM_JUDGE = {
  perfectQuality: 85,
  goodQuality: 70,
  /** 박자 오차가 이 안이면 Perfect 가능 (× 동작의 timingScale) */
  perfectTimingMs: 150,
  /** 박자 오차가 이 안이면 Good 가능, 넘으면 Miss (× timingScale) */
  goodTimingMs: 250,
  points: { perfect: 100, good: 60, miss: 0 },
  /** 콤보 보너스: 점수 × (1 + 0.1 × min(이전 콤보, 10)) */
  comboBonusStep: 0.1,
  comboBonusMax: 10,
  /** 등급 기준 (만점 대비 비율) */
  ranks: { S: 0.9, A: 0.75, B: 0.55 },
} as const

// ───────────────────────── 시범 그림 (채점에는 쓰이지 않음) ─────────────────────────

export interface DemoKey {
  beat: number
  right: { upper: number; fore: number }
  left: { upper: number; fore: number }
}

/**
 * 시범 그림용 키프레임. 보여주기용 일러스트일 뿐이며 기준 안무 데이터가 아닙니다.
 * 각도는 거울 화면 기준 (0°=오른쪽, 90°=위).
 */
export const DEMO_KEYS: DemoKey[] = [
  { beat: 0, right: { upper: 180, fore: 90 }, left: { upper: 0, fore: 90 } }, // 가슴 앞 교차 (시작 준비)
  { beat: 2, right: { upper: 0, fore: 90 }, left: { upper: 180, fore: 90 } }, // 열기: 프레임
  { beat: 3, right: { upper: 0, fore: 90 }, left: { upper: 180, fore: 90 } }, // Box 유지
  { beat: 4, right: { upper: -90, fore: 0 }, left: { upper: 270, fore: 180 } }, // 회전
  { beat: 4.5, right: { upper: -90, fore: 70 }, left: { upper: 270, fore: 180 } }, // 웨이브: 오른손이 먼저 올라감
  { beat: 5, right: { upper: -10, fore: 0 }, left: { upper: 270, fore: 180 } }, // 오른 팔꿈치
  { beat: 5.5, right: { upper: -50, fore: 0 }, left: { upper: 190, fore: 180 } }, // 왼 팔꿈치
  { beat: 5.75, right: { upper: -40, fore: 5 }, left: { upper: 205, fore: 110 } }, // 왼손
  { beat: 6, right: { upper: -20, fore: 10 }, left: { upper: 200, fore: 170 } }, // 팔 펴짐
  { beat: 7, right: { upper: 0, fore: 90 }, left: { upper: 180, fore: -90 } }, // 접기 → 마지막 포즈
  { beat: 7.55, right: { upper: 0, fore: 90 }, left: { upper: 180, fore: -90 } }, // 마지막 포즈 유지
  { beat: 7.8, right: { upper: 90, fore: 90 }, left: { upper: 90, fore: 0 } }, // 다음 반복 준비
  { beat: 8, right: { upper: 180, fore: 90 }, left: { upper: 0, fore: 90 } },
]
