import { useEffect, useState } from 'react'
import { Button } from '../ui'
import { DEFAULT_MODEL, aiFromKey, loadAi, openRouterModels, saveAi, signInOpenRouter, type AiSettings } from './ai'
import { canListen } from './speech'

/** Models worth suggesting for quick in-character replies. */
const GOOD = /claude-(haiku|sonnet)|gemini-[\d.]+-flash|gpt-[\d.o]+-mini|deepseek-chat|qwen3/

/** The AI settings window: connect your own AI for live conversations. */
export function AiSettingsPanel() {
  const [ai, setAi] = useState<AiSettings | null>(loadAi)
  const [key, setKey] = useState('')
  const [bad, setBad] = useState(false)
  const [models, setModels] = useState<string[]>([])
  useEffect(() => {
    if (ai?.provider !== 'openrouter') return
    openRouterModels()
      .then((all) => setModels(all.filter((m) => GOOD.test(m)).sort()))
      .catch(() => {})
  }, [ai?.provider])
  const update = (s: AiSettings | null) => {
    saveAi(s)
    setAi(s)
  }

  return (
    <div className="flex flex-col gap-4 text-[0.95em] leading-relaxed">
      <p>
        Anyone on the street answers the stock questions for free. <b>Connect your own AI</b> and they’ll answer whatever you say, in character, with a note on your
        Japanese when something could be more natural. It uses your account, so you pay your provider for what you use (a chat costs about a cent or less).
      </p>
      {ai ? (
        <div className="corner-sm flex flex-col gap-3 bg-ink-3 p-3">
          <p>
            ✅ Connected to <b>{ai.provider === 'openrouter' ? 'OpenRouter' : 'Anthropic'}</b>
            {ai.via === 'signin' ? ' (signed in)' : ` (key …${ai.key.slice(-4)})`}.
          </p>
          <label className="flex flex-col gap-1 text-[0.85em]">
            Model
            <input
              className="corner-sm h-9 bg-ink px-2 text-paper outline-none focus:shadow-[inset_0_0_0_2px_var(--color-kin)]"
              list="ai-models"
              value={ai.model}
              onChange={(e) => update({ ...ai, model: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <datalist id="ai-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => update({ ...ai, model: DEFAULT_MODEL[ai.provider] })}>
              Default model
            </Button>
            <Button size="sm" variant="outline" onClick={() => update(null)}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button variant="gold" size="lg" onClick={() => void signInOpenRouter()}>
            Sign in with OpenRouter
          </Button>
          <p className="text-[0.8em] text-paper-dim">
            OpenRouter lets one account use Claude, Gemini, GPT and others. You’ll come back here after signing in (your character and progress are kept).
          </p>
          <div className="flex flex-col gap-1 text-[0.85em]">
            <span>Or paste an API key: OpenRouter (sk-or-…) or Anthropic (sk-ant-…)</span>
            <div className="flex gap-2">
              <input
                type="password"
                className="corner-sm h-10 min-w-0 flex-1 bg-ink-3 px-3 text-paper outline-none focus:shadow-[inset_0_0_0_2px_var(--color-kin)]"
                value={key}
                placeholder="sk-…"
                autoComplete="off"
                onChange={(e) => {
                  setKey(e.target.value)
                  setBad(false)
                }}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <Button
                onClick={() => {
                  const s = aiFromKey(key)
                  if (!s) return setBad(true)
                  setKey('')
                  update(s)
                }}
              >
                Use key
              </Button>
            </div>
            {bad && <span className="text-shu">That doesn’t look like an OpenRouter or Anthropic key.</span>}
          </div>
        </div>
      )}
      <p className="text-[0.8em] text-paper-dim">
        Your key stays in this browser and goes only to the provider; the game has no server in between.
        {!canListen() && ' This browser has no speech recognition, so type your side (Chrome, Edge and Safari can listen).'}
      </p>
    </div>
  )
}
