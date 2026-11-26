import { Button, UiRoot } from '../ui'
import type { Avatar } from '../game/avatar'

/** The title over the slowly turning diorama: Start for a new player;
 *  Continue (and a fresh start) for someone who has made a character. */
export function Title({ saved, scale, width, height, onStart, onContinue }: { saved: Avatar | null; scale: number; width: number; height: number; onStart: () => void; onContinue: () => void }) {
  return (
    <UiRoot scale={scale} className="absolute top-0 left-0" style={{ width, height }}>
      {/* Soft vignette so the logo reads over the city. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,transparent_30%,rgb(13_12_18/0.6)_100%)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-between gap-6 px-6 pt-[12%] pb-[8%] text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="font-arcade text-5xl leading-none text-paper [text-shadow:4px_4px_0_var(--color-shu),8px_8px_0_rgb(13_12_18/0.8)]">JAPANGO</h1>
          <div className="corner-sm bg-ink/80 px-4 py-1.5 font-pixel text-2xl text-gold drop-hard" lang="ja">
            六本木 <span className="text-lg text-paper-dim">· Roppongi, Tokyo</span>
          </div>
        </div>
        <div className="flex w-[min(22rem,100%)] flex-col gap-3">
          {saved ? (
            <>
              <Button size="lg" variant="primary" className="h-16 w-full flex-col gap-1" onClick={onContinue} autoFocus>
                <span className="text-xl">つづける · Continue</span>
                <span className="text-sm font-normal text-white/85">
                  as <span lang="ja">{saved.kana}</span> ({saved.name})
                </span>
              </Button>
              <Button size="lg" variant="outline" className="w-full" onClick={onStart}>
                New character
              </Button>
            </>
          ) : (
            <Button size="lg" variant="primary" className="h-16 w-full flex-col gap-1" onClick={onStart} autoFocus>
              <span className="text-xl">はじめる · Start</span>
            </Button>
          )}
        </div>
      </div>
    </UiRoot>
  )
}
