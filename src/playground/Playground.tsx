import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Kbd, Slider, Switch, Toaster, TooltipProvider, UI_SIZES, UiRoot, cn, type UiTheme } from '../ui'
import { STORIES } from './stories'
import type { Control, Story } from './types'

const BACKDROPS = {
  day: 'Game · day',
  night: 'Game · night',
  rain: 'Game · rain',
  ink: 'Ink',
  grid: 'Grid',
  paper: 'Paper',
} as const
type Backdrop = keyof typeof BACKDROPS

const BASE = import.meta.env.BASE_URL

function backdropStyle(b: Backdrop): React.CSSProperties {
  if (b === 'day' || b === 'night' || b === 'rain') return { background: `#111 url(${BASE}playground/${b}.webp) center / cover` }
  if (b === 'grid')
    return {
      backgroundColor: '#1a1822',
      backgroundImage: 'linear-gradient(#2a2733 1px, transparent 1px), linear-gradient(90deg, #2a2733 1px, transparent 1px)',
      backgroundSize: '16px 16px',
    }
  if (b === 'paper') return { background: '#e9dfc6' }
  return { background: '#0d0c12' }
}

function defaults(s: Story) {
  return Object.fromEntries(Object.entries(s.controls).map(([k, c]) => [k, c.default]))
}

function readHash() {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, ''))
  return STORIES.find((s) => s.id === id) ?? STORIES[0]
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`japango.pg.${key}`)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(`japango.pg.${key}`, JSON.stringify(v))
  } catch {
    // ignore
  }
}

/** JSX for the current props, leaving out ones still at their default. */
function snippet(s: Story, props: Record<string, unknown>) {
  const parts: string[] = []
  let children: string | null = null
  for (const [k, c] of Object.entries(s.controls)) {
    const v = props[k]
    if (k === 'children') {
      children = String(v)
      continue
    }
    if (v === c.default) continue
    if (typeof v === 'boolean') parts.push(v ? k : `${k}={false}`)
    else if (typeof v === 'number') parts.push(`${k}={${v}}`)
    else parts.push(`${k}=${JSON.stringify(v)}`)
  }
  const attrs = parts.length ? ' ' + parts.join(' ') : ''
  if (s.component === 'toast') return `toast({ kind: ${JSON.stringify(props.kind)}, title: ${JSON.stringify(props.title)}, body: ${JSON.stringify(props.body)} })`
  return children !== null ? `<${s.component}${attrs}>${children}</${s.component}>` : `<${s.component}${attrs} />`
}

interface LogLine {
  n: number
  t: string
  name: string
  args: string
}

export function Playground() {
  const [current, setCurrent] = useState<Story>(readHash)
  const [props, setProps] = useState<Record<string, unknown>>(() => defaults(current))
  const [scale, setScale] = useState(() => load('scale', window.innerWidth < 700 ? 1 : 1.5))
  const [backdrop, setBackdrop] = useState<Backdrop>(() => load('backdrop', 'night'))
  const [theme, setTheme] = useState<UiTheme>(() => load('theme', 'dark'))
  const [query, setQuery] = useState('')
  const [log, setLog] = useState<LogLine[]>([])
  const [menu, setMenu] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onHash = () => {
      const s = readHash()
      setCurrent(s)
      setProps(defaults(s))
      setLog([])
      setMenu(false)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => save('scale', scale), [scale])
  useEffect(() => save('backdrop', backdrop), [backdrop])
  useEffect(() => save('theme', theme), [theme])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const m = new Map<string, Story[]>()
    for (const s of STORIES) {
      if (q && !`${s.name} ${s.group} ${s.description}`.toLowerCase().includes(q)) continue
      m.set(s.group, [...(m.get(s.group) ?? []), s])
    }
    return [...m]
  }, [query])

  const logN = useRef(0)
  const logFn = useMemo(
    () => (name: string, ...args: unknown[]) =>
      setLog((l) => [{ n: ++logN.current, t: new Date().toLocaleTimeString(), name, args: args.map((a) => JSON.stringify(a)).join(', ') }, ...l].slice(0, 40)),
    [],
  )

  const code = snippet(current, props)
  const fill = current.layout === 'fill'
  const controls = Object.entries(current.controls)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="jg-ui flex h-dvh flex-col bg-ink text-paper" data-theme={theme}>
        {/* Top bar */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-4 border-shu bg-ink-2 px-4 py-2">
          <button className="corner-sm bg-ink-3 px-2 py-1 md:hidden" onClick={() => setMenu((m) => !m)} aria-label="Components">
            ☰
          </button>
          <a href={BASE} className="font-arcade text-sm text-paper [text-shadow:2px_2px_0_var(--color-shu)]">
            JAPANGO
          </a>
          <span className="text-sm text-paper-dim">UI kit · 遊び場</span>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
            <div className="flex rounded-full bg-ink-3 p-0.5" role="radiogroup" aria-label="Theme">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={theme === t}
                  onClick={() => setTheme(t)}
                  className={cn('rounded-full px-2.5 py-0.5 capitalize text-paper-dim', theme === t && 'bg-paper font-semibold text-ink')}
                >
                  {t === 'dark' ? '☾ Dark' : t === 'light' ? '☀ Light' : 'System'}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2">
              <span className="text-paper-dim">Backdrop</span>
              <select
                value={backdrop}
                onChange={(e) => setBackdrop(e.target.value as Backdrop)}
                className="corner-sm bg-ink-3 px-2 py-1 text-paper outline-none"
              >
                {Object.entries(BACKDROPS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <Button size="sm" onClick={() => setScale((s) => UI_SIZES[Math.max(0, UI_SIZES.indexOf(s as 1) - 1)] ?? 1)} disabled={scale <= 1}>
                A−
              </Button>
              <span className="w-10 text-center font-arcade text-[10px] text-gold">{scale}×</span>
              <Button size="sm" onClick={() => setScale((s) => UI_SIZES[Math.min(UI_SIZES.length - 1, UI_SIZES.indexOf(s as 1) + 1)] ?? 1)} disabled={scale >= 4}>
                A+
              </Button>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <nav
            className={cn(
              'w-60 shrink-0 overflow-y-auto border-r-2 border-ink-3 bg-ink-2 p-3 max-md:absolute max-md:inset-y-0 max-md:top-[52px] max-md:z-30 max-md:shadow-[8px_0_0_rgb(0_0_0/0.5)]',
              !menu && 'max-md:hidden',
            )}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="corner-sm mb-3 w-full bg-ink px-2 py-1.5 text-sm text-paper outline-none placeholder:text-paper-dim/60 focus:bg-ink-3"
            />
            {groups.map(([g, list]) => (
              <div key={g} className="mb-4">
                <div className="mb-1 font-arcade text-[9px] tracking-widest text-gold uppercase">{g}</div>
                {list.map((s) => (
                  <a
                    key={s.id}
                    href={`#/${s.id}`}
                    className={cn(
                      'relative block py-1 pr-2 pl-5 text-sm hover:bg-ink-3',
                      s.id === current.id && 'bg-paper text-ink hover:bg-paper',
                    )}
                  >
                    {s.id === current.id && <span className="absolute left-1 animate-blink text-shu">▶</span>}
                    {s.name}
                  </a>
                ))}
              </div>
            ))}
          </nav>

          <main className="flex min-w-0 flex-1 flex-col max-lg:overflow-y-auto lg:flex-row">
            {/* Stage */}
            <section className="flex min-w-0 flex-1 flex-col max-lg:h-[78dvh] max-lg:shrink-0">
              <div className="border-b-2 border-ink-3 px-4 py-2">
                <div className="flex items-baseline gap-2">
                  <h1 className="text-xl">{current.name}</h1>
                  <Badge variant="outline" className="text-xs text-paper-dim">
                    {current.group}
                  </Badge>
                </div>
                <p className="text-sm text-paper-dim">{current.description}</p>
              </div>
              <div className="relative min-h-0 flex-1 overflow-auto" style={backdropStyle(backdrop)}>
                <UiRoot theme={theme} scale={scale} onScaleChange={setScale} className={cn('min-h-full', fill ? 'h-full' : 'grid grid-cols-[minmax(0,1fr)] place-items-center p-8')} style={fill ? { height: `${100 / scale}%` } : { minHeight: `${100 / scale}%` }}>
                  {current.render(props as never, logFn)}
                  <Toaster />
                </UiRoot>
              </div>
            </section>

            {/* Props + actions */}
            <aside className="flex w-full shrink-0 flex-col border-t-2 border-ink-3 bg-ink-2 lg:overflow-y-auto lg:w-80 lg:border-t-0 lg:border-l-2">
              <div className="p-3">
                <div className="mb-2 flex items-center">
                  <span className="font-arcade text-[9px] tracking-widest text-gold">PROPS</span>
                  {controls.length > 0 && (
                    <button className="ml-auto text-xs text-paper-dim hover:text-paper" onClick={() => setProps(defaults(current))}>
                      ↺ reset
                    </button>
                  )}
                </div>
                {controls.length === 0 && <p className="text-sm text-paper-dim">No props to tweak. Play with it on the stage.</p>}
                <div className="grid gap-2.5">
                  {controls.map(([k, c]) => (
                    <ControlField key={`${current.id}.${k}`} name={k} control={c} value={props[k]} onChange={(v) => setProps((p) => ({ ...p, [k]: v }))} />
                  ))}
                </div>
              </div>
              <div className="border-t-2 border-ink-3 p-3">
                <div className="mb-2 flex items-center">
                  <span className="font-arcade text-[9px] tracking-widest text-gold">CODE</span>
                  <button
                    className="ml-auto text-xs text-paper-dim hover:text-paper"
                    onClick={() => {
                      navigator.clipboard?.writeText(code).then(() => {
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1200)
                      })
                    }}
                  >
                    {copied ? '✓ copied' : '⧉ copy'}
                  </button>
                </div>
                <pre className="overflow-x-auto bg-ink p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-sora">{code}</pre>
                <p className="mt-1 text-xs text-paper-dim">
                  import {'{'} {current.component} {'}'} from './ui'
                </p>
              </div>
              <div className="border-t-2 border-ink-3 p-3">
                <div className="mb-2 flex items-center">
                  <span className="font-arcade text-[9px] tracking-widest text-gold">ACTIONS</span>
                  {log.length > 0 && (
                    <button className="ml-auto text-xs text-paper-dim hover:text-paper" onClick={() => setLog([])}>
                      clear
                    </button>
                  )}
                </div>
                {log.length === 0 ? (
                  <p className="text-sm text-paper-dim">Callbacks show up here when you click things.</p>
                ) : (
                  <ul className="grid gap-0.5 font-mono text-xs">
                    {log.map((l) => (
                      <li key={l.n} className="flex gap-2">
                        <span className="text-paper-dim">{l.t}</span>
                        <span className="text-gold">{l.name}</span>
                        <span className="truncate">{l.args}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-auto border-t-2 border-ink-3 p-3 text-xs text-paper-dim">
                <Kbd>Tab</Kbd> through controls · stage scales with <Kbd>A−</Kbd>/<Kbd>A+</Kbd>
              </div>
            </aside>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}

function ControlField({ name, control, value, onChange }: { name: string; control: Control; value: unknown; onChange: (v: unknown) => void }) {
  const label = <span className="text-xs text-paper-dim">{name}</span>
  const input = 'corner-sm w-full bg-ink px-2 py-1.5 text-sm text-paper outline-none focus:bg-ink-3'
  switch (control.type) {
    case 'boolean':
      return (
        <label className="flex cursor-pointer items-center justify-between gap-2">
          {label}
          <Switch checked={value as boolean} onCheckedChange={onChange} />
        </label>
      )
    case 'select':
      return (
        <label className="grid gap-1">
          {label}
          <select className={input} value={value as string} onChange={(e) => onChange(e.target.value)}>
            {control.options.map((o) => (
              <option key={o} value={o}>
                {o || '(none)'}
              </option>
            ))}
          </select>
        </label>
      )
    case 'number':
      return (
        <label className="grid gap-1">
          <span className="flex justify-between">
            {label}
            <span className="font-arcade text-[9px] text-gold">{String(value)}</span>
          </span>
          <Slider value={[value as number]} min={control.min} max={control.max} step={control.step ?? 1} onValueChange={(v) => onChange(v[0])} />
        </label>
      )
    case 'color':
      return (
        <label className="flex items-center justify-between gap-2">
          {label}
          <input type="color" value={value as string} onChange={(e) => onChange(e.target.value)} className="h-7 w-12 cursor-pointer bg-transparent" />
        </label>
      )
    default:
      return (
        <label className="grid gap-1">
          {label}
          {control.multiline ? (
            <textarea className={cn(input, 'min-h-16 resize-y')} value={value as string} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <input className={input} value={value as string} onChange={(e) => onChange(e.target.value)} />
          )}
        </label>
      )
  }
}
