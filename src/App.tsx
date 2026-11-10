import { useState } from 'react'
import Perform from './pages/Perform'
import Practice from './pages/Practice'

type Mode = 'learn' | 'perform'

// LEARN(레슨) / PERFORM(리듬 챌린지) 전환. 화면을 바꾸면 카메라는 자동으로 꺼집니다.
export default function App() {
  const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(location.search).get('mode') === 'perform' ? 'perform' : 'learn'))

  const tab = (m: Mode, label: string) => (
    <button
      key={m}
      type="button"
      onClick={() => setMode(m)}
      aria-current={mode === m ? 'page' : undefined}
      className={`rounded-full px-5 py-1.5 text-sm font-extrabold tracking-widest transition ${
        mode === m
          ? 'bg-neon-pink text-white shadow-[0_0_16px_rgba(255,42,109,0.6)]'
          : 'border border-white/20 text-slate-300 hover:bg-white/5'
      }`}
    >
      {label}
    </button>
  )

  return (
    <>
      <nav className="mx-auto flex max-w-6xl items-center gap-2 px-4 pt-4" aria-label="모드 선택">
        {tab('learn', 'LEARN')}
        {tab('perform', 'PERFORM')}
      </nav>
      {mode === 'learn' ? <Practice /> : <Perform />}
    </>
  )
}
