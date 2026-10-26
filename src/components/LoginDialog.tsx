import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function LoginDialog({ onClose }: { onClose: () => void }) {
  const { sendLink } = useAuth()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setState('sending')
    try {
      await sendLink(email.trim())
      setState('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('idle')
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <span className="eyebrow">Anmelden</span>
        {state === 'sent' ? (
          <>
            <h2>Schau in dein Postfach</h2>
            <p>
              Wir haben dir einen Anmelde-Link an <b>{email}</b> geschickt. Öffne ihn auf dem Gerät, auf dem du lesen möchtest. Ein Passwort brauchst du nicht.
            </p>
            <div className="row">
              <button type="button" onClick={onClose}>
                Schließen
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Bücher auf allen Geräten</h2>
            <p className="muted">Mit deiner E-Mail-Adresse anmelden, dann sind Bücher, Lesestand und Lernkarten auf Handy, Laptop und Tablet gleich. Bücher, die schon in diesem Browser liegen, werden übernommen.</p>
            <label className="field">
              E-Mail
              <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button type="submit" disabled={state === 'sending'}>
                {state === 'sending' ? 'Wird gesendet …' : 'Anmelde-Link senden'}
              </button>
              <button type="button" className="ghost" onClick={onClose}>
                Abbrechen
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
