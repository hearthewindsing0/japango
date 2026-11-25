import { Canvas } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { Block, LookProvider } from './scene'
import { LOOKS } from './styles'

// /looks/: five art-direction samples of the same street corner. Pick one
// with the buttons or keys 1-5; drag to orbit, scroll to zoom.
// URL: ?look=<id> opens one; &ui=0 hides the panel (for screenshots).

const params = new URLSearchParams(location.search)

export function Looks() {
  const [index, setIndex] = useState(() => Math.max(0, LOOKS.findIndex((l) => l.id === params.get('look'))))
  const showUi = params.get('ui') !== '0'
  const look = LOOKS[index]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= LOOKS.length) setIndex(n - 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('look', look.id)
    history.replaceState(null, '', url)
  }, [look.id])

  return (
    <div style={{ position: 'fixed', inset: 0, background: look.backdrop ?? '#000', fontFamily: "'M PLUS 1 Variable', system-ui, sans-serif" }}>
      <Canvas
        key={look.id}
        shadows={look.shadows}
        flat={look.flat}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: !!look.backdrop, preserveDrawingBuffer: true, toneMapping: look.flat ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping }}
      >
        <LookProvider value={look.style}>
          <look.Stage />
          <Block />
        </LookProvider>
      </Canvas>
      {showUi && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            top: 16,
            maxWidth: 'min(420px, calc(100vw - 32px))',
            padding: '14px 16px',
            borderRadius: 14,
            background: 'rgba(16, 15, 22, 0.86)',
            color: '#f4f1ea',
            boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>見た目 · Looks: pick a direction</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 12 }}>
            {LOOKS.map((l, i) => (
              <button
                key={l.id}
                onClick={() => setIndex(i)}
                title={l.name}
                style={{
                  height: 40,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: i === index ? '#f0b429' : 'rgba(255,255,255,0.06)',
                  color: i === index ? '#1a1712' : '#f4f1ea',
                  fontSize: 18,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {index + 1}. {look.name} <span style={{ fontWeight: 500, opacity: 0.75, fontSize: 16 }}>{look.ja}</span>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.5, marginTop: 6, opacity: 0.9 }}>{look.blurb}</div>
          <div style={{ fontSize: 12, marginTop: 10, opacity: 0.6 }}>Keys 1 to 5 switch · drag to turn · scroll to zoom</div>
        </div>
      )}
    </div>
  )
}
