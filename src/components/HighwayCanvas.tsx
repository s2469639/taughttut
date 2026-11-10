import { useEffect, useRef } from 'react'
import type { ChallengeDef, MoveKind } from '../data/challenge'
import { beatMsOf, buildSchedule, type Judgement, type MoveResult } from '../services/challengeRunner'
import { HIGHWAY, depthProgress, halfWidthAt, projectY, scaleAt } from '../utils/highway'

// 리듬게임 하이웨이: 웹캠 영상 위에 겹치는 투명 캔버스.
//  - 소실점으로 모이는 네온 레인, 박자에 맞춰 다가오는 격자, 소실점에서 퍼지는 빛줄기
//  - 동작 = 타일. 길게 이어지는 동작은 롱노트(긴 타일), 자세는 짧은 타일
//  - 타일이 판정선에 닿는 순간 = 목표 박자
//  - 판정이 나오면 판정선에서 링과 파티클이 터짐

const KIND_COLOR: Record<MoveKind, string> = {
  slide: '#ff2a6d',
  box: '#b967ff',
  rotate: '#05d9e8',
  wave: '#ff4fd8',
  fold: '#ff8a5b',
  hit: '#f9f002',
}

const JUDGE_COLOR: Record<Judgement, string> = {
  perfect: '#ffffff',
  good: '#f9f002',
  miss: '#ff2a6d',
}

/** 자세 타일의 두께(박자 단위) */
const POSE_TILE_BEATS = 0.35
const BURST_MS = 600

interface Burst {
  t0: number
  color: string
  judgement: Judgement
}

interface Props {
  def: ChallengeDef
  /** 노래 시각(ms). 시작 전이면 null → 미리보기 애니메이션 */
  getSongMs: () => number | null
  /** 지금까지의 판정 결과 (새로 늘어날 때마다 효과를 터뜨림) */
  results: readonly MoveResult[]
}

/** 같은 입력 → 같은 값의 간단한 의사 난수 (파티클 모양 고정) */
function rand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export default function HighwayCanvas({ def, getSongMs, results }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const burstsRef = useRef<Burst[]>([])
  const seenRef = useRef(0)
  const getSongMsRef = useRef(getSongMs)
  getSongMsRef.current = getSongMs

  // 새 판정이 생기면 효과 추가
  useEffect(() => {
    if (results.length < seenRef.current) seenRef.current = 0 // 새 판이 시작됨
    for (let i = seenRef.current; i < results.length; i++) {
      const j = results[i].judgement
      burstsRef.current.push({ t0: performance.now(), color: JUDGE_COLOR[j], judgement: j })
    }
    seenRef.current = results.length
  }, [results])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const schedule = buildSchedule(def)
    const beatMs = beatMsOf(def)
    const loopLenMs = (def.countdownBeats + def.beatsPerSequence) * beatMs + HIGHWAY.lookaheadMs

    // 타일이 판정선을 지나는 구간 [startMs, endMs].
    //  - 동작형(길게 이어지는 동작): 시작 박자 ~ 목표 박자. 앞쪽 끝이 먼저 닿고, 뒤쪽 끝이 닿는 순간 = 동작 완료
    //  - 자세형(Box, Final Hit): 목표 박자를 가운데에 둔 짧은 타일
    const tiles = schedule.map((ev) => {
      const isPose = ev.move.kind === 'box' || ev.move.kind === 'hit'
      const base = ev.targetMs - ev.move.targetBeat * beatMs
      const startMs = isPose ? ev.targetMs - (POSE_TILE_BEATS / 2) * beatMs : base + ev.move.startBeat * beatMs
      const endMs = isPose ? ev.targetMs + (POSE_TILE_BEATS / 2) * beatMs : ev.targetMs
      return { ev, startMs, endMs }
    })

    let W = 0
    let H = 0
    let dpr = 1
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(W * dpr))
      canvas.height = Math.max(1, Math.round(H * dpr))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const ctx = canvas.getContext('2d')
      if (!ctx || W === 0 || H === 0) return
      const nowPerf = performance.now()
      const live = getSongMsRef.current()
      const songMs = live ?? nowPerf % loopLenMs // 시작 전에는 한 바퀴를 반복해서 미리보기
      const beatPhase = ((songMs % beatMs) + beatMs) % beatMs / beatMs
      const pulse = Math.exp(-beatPhase * 5)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      const cx = W / 2
      const vpY = HIGHWAY.vpY * H
      const hitY = HIGHWAY.hitY * H
      const hwHit = HIGHWAY.halfWidthHit * W
      const hwBottom = halfWidthAt(HIGHWAY.bottomY) * W
      const idleAlpha = live === null ? 0.8 : 1

      // 1) 소실점에서 퍼지는 빛줄기
      const rays = 11
      for (let i = 0; i < rays; i++) {
        const f = i / (rays - 1)
        const tx = -0.25 * W + f * 1.5 * W
        const ty = f < 0.15 || f > 0.85 ? H * 0.55 : -0.05 * H
        const g = ctx.createLinearGradient(cx, vpY, tx, ty)
        const c = i % 2 === 0 ? '255,42,109' : '5,217,232'
        g.addColorStop(0, `rgba(${c},0)`)
        g.addColorStop(0.35, `rgba(${c},${0.1 + 0.28 * pulse})`)
        g.addColorStop(1, `rgba(${c},0)`)
        ctx.strokeStyle = g
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cx, vpY)
        ctx.lineTo(tx, ty)
        ctx.stroke()
      }

      // 2) 레인 바닥(어두운 보라 → 핑크 빛)
      const lane = ctx.createLinearGradient(0, vpY, 0, H)
      lane.addColorStop(0, 'rgba(120,40,200,0)')
      lane.addColorStop(0.6, 'rgba(150,40,200,0.16)')
      lane.addColorStop(1, 'rgba(255,42,109,0.28)')
      ctx.fillStyle = lane
      ctx.beginPath()
      ctx.moveTo(cx, vpY)
      ctx.lineTo(cx + hwBottom, H)
      ctx.lineTo(cx - hwBottom, H)
      ctx.closePath()
      ctx.fill()

      // 3) 다가오는 가로 격자 (반 박자마다, 박자에 맞춰 흐름)
      const spacing = beatMs / 2
      const first = (spacing - (((songMs % spacing) + spacing) % spacing)) % spacing
      for (let tau = first; tau <= HIGHWAY.lookaheadMs; tau += spacing) {
        const p = depthProgress(tau)
        const y = projectY(p) * H
        const hw = halfWidthAt(y / H) * W
        const onBeat = Math.abs(((songMs + tau) % beatMs) / beatMs) < 0.02 || Math.abs(((songMs + tau) % beatMs) / beatMs - 1) < 0.02
        ctx.strokeStyle = `rgba(255,120,220,${(onBeat ? 0.5 : 0.22) * Math.min(1, 0.25 + p)})`
        ctx.lineWidth = onBeat ? 2 : 1
        ctx.beginPath()
        ctx.moveTo(cx - hw, y)
        ctx.lineTo(cx + hw, y)
        ctx.stroke()
      }

      // 4) 레인 가장자리와 구분선
      ctx.save()
      ctx.shadowColor = '#ff2a6d'
      ctx.shadowBlur = 14
      ctx.strokeStyle = `rgba(255,70,150,${0.75 + 0.25 * pulse})`
      ctx.lineWidth = 3
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(cx, vpY)
        ctx.lineTo(cx + s * hwBottom, H)
        ctx.stroke()
      }
      ctx.restore()
      ctx.strokeStyle = 'rgba(185,103,255,0.35)'
      ctx.lineWidth = 1
      for (const s of [-1 / 3, 1 / 3]) {
        ctx.beginPath()
        ctx.moveTo(cx, vpY)
        ctx.lineTo(cx + s * hwBottom, H)
        ctx.stroke()
      }

      // 5) 타일 (먼 것부터 그려서 가까운 것이 위에 오게)
      const visible = tiles
        .filter(({ startMs, endMs }) => endMs - songMs > 0 && startMs - songMs < HIGHWAY.lookaheadMs)
        .sort((a, b) => b.endMs - a.endMs)

      for (const { ev, startMs, endMs } of visible) {
        // 앞쪽 끝(먼저 닿는 쪽)은 판정선에서 멈추고, 뒤쪽 끝이 닿으면 타일이 다 소비됨
        const pNear = Math.min(1, depthProgress(startMs - songMs))
        const pFar = Math.min(1, Math.max(0, depthProgress(endMs - songMs)))
        if (pNear <= 0 || pNear <= pFar) continue
        const yN = projectY(pNear) * H
        const yF = projectY(pFar) * H
        const hwN = halfWidthAt(yN / H) * W * 0.9
        const hwF = halfWidthAt(yF / H) * W * 0.9
        const sc = scaleAt(yN / H)
        const color = KIND_COLOR[ev.move.kind]
        const active = startMs <= songMs
        const heightPx = Math.max(6, yN - yF)

        ctx.save()
        ctx.globalAlpha = Math.min(1, 0.3 + pNear * 1.2) * idleAlpha
        ctx.shadowColor = color
        ctx.shadowBlur = (active ? 30 : 18) * sc
        const g = ctx.createLinearGradient(0, yF, 0, yN)
        g.addColorStop(0, `${color}55`)
        g.addColorStop(1, `${color}${active ? 'ff' : 'dd'}`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(cx - hwF, yF)
        ctx.lineTo(cx + hwF, yF)
        ctx.lineTo(cx + hwN, yN)
        ctx.lineTo(cx - hwN, yN)
        ctx.closePath()
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = active ? '#ffffff' : 'rgba(255,255,255,0.75)'
        ctx.lineWidth = Math.max(1.5, 3 * sc)
        ctx.stroke()
        // 윗면 하이라이트
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = Math.max(1, 2 * sc)
        ctx.beginPath()
        ctx.moveTo(cx - hwN * 0.96, yN - 2 * sc)
        ctx.lineTo(cx + hwN * 0.96, yN - 2 * sc)
        ctx.stroke()

        // 이름 (타일이 충분히 크면)
        if (heightPx > 22 && sc > 0.35) {
          const fs = Math.min(30 * sc, heightPx * 0.42)
          ctx.fillStyle = '#ffffff'
          ctx.shadowColor = color
          ctx.shadowBlur = 8
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.font = `800 ${Math.max(10, fs)}px system-ui, sans-serif`
          ctx.fillText(ev.move.name.toUpperCase(), cx, yN - heightPx / 2 - (heightPx > 70 ? fs * 0.45 : 0))
          if (heightPx > 70) {
            ctx.font = `600 ${Math.max(9, fs * 0.55)}px system-ui, sans-serif`
            ctx.fillText(ev.move.koreanName, cx, yN - heightPx / 2 + fs * 0.55)
          }
        }
        ctx.restore()
      }

      // 6) 판정선
      ctx.save()
      ctx.shadowColor = '#05d9e8'
      ctx.shadowBlur = 16 + 18 * pulse
      ctx.strokeStyle = `rgba(190,250,255,${0.85 + 0.15 * pulse})`
      ctx.lineWidth = 4 + 3 * pulse
      ctx.beginPath()
      ctx.moveTo(cx - hwHit * 1.08, hitY)
      ctx.lineTo(cx + hwHit * 1.08, hitY)
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(cx + s * hwHit * 1.08, hitY, 6 + 3 * pulse, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // 7) 판정 효과 (링 + 파티클)
      burstsRef.current = burstsRef.current.filter((b) => nowPerf - b.t0 < BURST_MS)
      for (const b of burstsRef.current) {
        const age = (nowPerf - b.t0) / BURST_MS
        const ease = 1 - Math.pow(1 - age, 3)
        const small = b.judgement === 'miss' ? 0.55 : 1
        ctx.save()
        ctx.globalAlpha = 1 - age
        ctx.strokeStyle = b.color
        ctx.shadowColor = b.color
        ctx.shadowBlur = 20
        ctx.lineWidth = 7 * (1 - age) + 1
        ctx.beginPath()
        ctx.ellipse(cx, hitY, ease * W * 0.2 * small, ease * W * 0.06 * small, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = b.color
        const n = b.judgement === 'perfect' ? 22 : b.judgement === 'good' ? 14 : 8
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rand(i) * 0.6
          const d = ease * W * (0.06 + 0.16 * rand(i + 9)) * small
          ctx.beginPath()
          ctx.arc(cx + Math.cos(a) * d * 1.4, hitY - Math.abs(Math.sin(a)) * d * 1.3, 4 * (1 - age) + 1, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }

      // 8) 박자에 맞춰 화면 가장자리가 번쩍임
      const edge = ctx.createRadialGradient(cx, H * 0.55, H * 0.35, cx, H * 0.55, W * 0.62)
      edge.addColorStop(0, 'rgba(255,42,109,0)')
      edge.addColorStop(1, `rgba(255,42,109,${0.1 + 0.16 * pulse})`)
      ctx.fillStyle = edge
      ctx.fillRect(0, 0, W, H)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [def])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
}
