import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import type { Approachable } from './life'
import { groundAt, type GameMap } from './map'

// A speech bubble bobbing over the head of whoever you're close enough to
// talk to, so it's plain who Space (or a tap) will talk to.
export function ApproachMarker({ near, map, onTap }: { near: Approachable | null; map: GameMap; onTap: () => void }) {
  const group = useRef<THREE.Group>(null)
  const at = useRef<{ x: number; y: number } | null>(null)
  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g) return
    const w = near?.where() ?? null
    g.visible = !!w
    if (!w) {
      at.current = null
      return
    }
    // Ease after walkers, so the bubble doesn't jitter.
    const s = (at.current ??= { ...w })
    const k = Math.min(1, dt * 12)
    s.x += (w.x - s.x) * k
    s.y += (w.y - s.y) * k
    g.position.set(s.x, groundAt(map, s.x, s.y) + 2.25 + Math.sin(clock.elapsedTime * 3) * 0.06, s.y)
  })
  if (!near) return null
  return (
    <group ref={group} visible={false}>
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <button
          type="button"
          onClick={onTap}
          aria-label={`Talk to ${near.person.family}${near.person.name}`}
          className="pointer-events-auto relative flex select-none items-center gap-1 whitespace-nowrap rounded-full border-2 border-white bg-[#1f2329]/90 px-2.5 py-1 font-sans text-[13px] font-bold leading-none text-white shadow-[0_2px_0_rgba(0,0,0,0.35)]"
        >
          <span aria-hidden>💬</span>
          <span>{near.group.length > 1 ? '会話に入る' : '話しかける'}</span>
          <span className="absolute -bottom-[7px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent border-t-white" />
        </button>
      </Html>
    </group>
  )
}
