import { ContactShadows } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { AvatarFigure, emptyRig, type AvatarRig } from '../game/AvatarFigure'
import { HEIGHT_SCALE, type Avatar } from '../game/avatar'

// The character creator's stage: the player's toy figure on a little
// wooden turntable that turns slowly on its own. Drag to spin it. The
// camera leans in for the face and hair, and the figure hops when you
// change something and waves when you get to the name.

export type Shot = 'full' | 'face'

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))

function Stage({ avatar, shot, wave, spin }: { avatar: Avatar; shot: Shot; wave: boolean; spin: React.RefObject<{ angle: number; vel: number; dragging: boolean }> }) {
  const table = useRef<THREE.Group>(null)
  const hop = useRef<THREE.Group>(null)
  const rig = useRef<AvatarRig>(emptyRig())
  const camera = useThree((s) => s.camera)
  const look = useRef({ y: 0.95, d: 7.6, h: 1.75 })
  const hopT = useRef(1)
  const key = JSON.stringify({ ...avatar, name: '', kana: '' })
  const last = useRef(key)
  useEffect(() => {
    if (last.current !== key) hopT.current = 0
    last.current = key
  }, [key])

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const sp = spin.current
    // Turns slowly on its own; a drag flings it, then it eases back.
    if (wave && !sp.dragging) {
      // Saying hello: turn to face the camera.
      const front = Math.round(sp.angle / (Math.PI * 2)) * Math.PI * 2
      sp.angle = damp(sp.angle, front, 3, dt)
      sp.vel = 0
    } else if (!sp.dragging) {
      sp.vel = damp(sp.vel, 0.35, 1.5, dt)
      sp.angle += sp.vel * dt
    }
    if (table.current) table.current.rotation.y = sp.angle
    // Camera: whole figure, or close on the face.
    const k = HEIGHT_SCALE[avatar.height]
    const want = shot === 'face' ? { y: 1.6 * k, d: 4.6, h: 1.85 * k } : { y: 0.95, d: 7.6, h: 1.75 }
    const l = look.current
    l.y = damp(l.y, want.y, 4, dt)
    l.d = damp(l.d, want.d, 4, dt)
    l.h = damp(l.h, want.h, 4, dt)
    camera.position.set(0, l.h, l.d)
    camera.lookAt(0, l.y, 0)
    // A little hop after each change.
    hopT.current = Math.min(1, hopT.current + dt * 2.6)
    const u = hopT.current
    if (hop.current) hop.current.position.y = u < 1 ? Math.sin(u * Math.PI) * 0.22 : 0
    const t = clock.elapsedTime
    const r = rig.current
    // Breathing, and a wave hello on the name step.
    if (r.body) r.body.position.y = Math.sin(t * 2) * 0.012
    if (r.armR) {
      const up = wave ? 1 : 0
      r.armR.rotation.z = damp(r.armR.rotation.z, up * 2.5, 6, dt)
      r.armR.rotation.x = wave ? Math.sin(t * 7) * 0.25 : damp(r.armR.rotation.x, 0, 6, dt)
    }
    if (r.armL) r.armL.rotation.z = Math.sin(t * 2) * -0.03
    if (r.legL) r.legL.rotation.x = u < 1 ? Math.sin(u * Math.PI) * 0.2 : 0
    if (r.legR) r.legR.rotation.x = u < 1 ? -Math.sin(u * Math.PI) * 0.2 : 0
  })

  return (
    <>
      <hemisphereLight args={['#fff6e8', '#c9b49a', 1.5]} />
      <directionalLight position={[3, 6, 4]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005}>
        <orthographicCamera attach="shadow-camera" args={[-2, 2, 2, -2, 0.5, 15]} />
      </directionalLight>
      <directionalLight position={[-4, 3, -2]} intensity={0.6} color="#dfe8ff" />
      <group ref={table}>
        {/* The turntable: a wooden disc on a slimmer base. */}
        <mesh position={[0, -0.08, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[1.25, 1.25, 0.16, 48]} />
          <meshLambertMaterial color="#e8c9a0" />
        </mesh>
        <mesh position={[0, -0.005, 0]} receiveShadow>
          <cylinderGeometry args={[1.13, 1.13, 0.012, 48]} />
          <meshLambertMaterial color="#f3dcbc" />
        </mesh>
        <mesh position={[0, -0.22, 0]}>
          <cylinderGeometry args={[1.05, 1.1, 0.14, 48]} />
          <meshLambertMaterial color="#c99b6d" />
        </mesh>
        <group ref={hop}>
          <AvatarFigure avatar={avatar} rig={rig} />
        </group>
      </group>
      <ContactShadows position={[0, -0.3, 0]} opacity={0.35} scale={5} blur={2.6} far={1} />
    </>
  )
}

/** The turntable in its own canvas; fills its parent. */
export function Turntable({ avatar, shot, wave }: { avatar: Avatar; shot: Shot; wave: boolean }) {
  const spin = useRef({ angle: 0.5, vel: 0.35, dragging: false })
  const drag = useRef<{ x: number; t: number } | null>(null)
  return (
    <div
      className="size-full touch-none"
      style={{ cursor: 'grab' }}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        drag.current = { x: e.clientX, t: performance.now() }
        spin.current.dragging = true
        spin.current.vel = 0
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const now = performance.now()
        const dx = e.clientX - drag.current.x
        const da = dx * 0.012
        spin.current.angle += da
        spin.current.vel = da / Math.max(0.008, (now - drag.current.t) / 1000)
        drag.current = { x: e.clientX, t: now }
      }}
      onPointerUp={() => {
        drag.current = null
        spin.current.dragging = false
        spin.current.vel = Math.max(-8, Math.min(8, spin.current.vel))
      }}
      onPointerCancel={() => {
        drag.current = null
        spin.current.dragging = false
      }}
    >
      <Canvas shadows camera={{ fov: 30, near: 0.1, far: 50, position: [0, 1.75, 7.6] }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
        <Stage avatar={avatar} shot={shot} wave={wave} spin={spin} />
      </Canvas>
    </div>
  )
}
