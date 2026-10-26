import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import type { Settings } from '../lib/storage'
import LoginDialog from './LoginDialog'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  dueCards?: number
}

const THEMES: Settings['theme'][] = ['auto', 'light', 'dark']
const THEME_LABEL = { auto: 'Auto', light: 'Hell', dark: 'Dunkel' }

export default function Header({ settings, update, dueCards }: Props) {
  const nextTheme = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length]
  const { session, signOut } = useAuth()
  const [login, setLogin] = useState(false)
  const email = session?.user.email
  return (
    <header className="topbar">
      <NavLink to="/" className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-text">Schnelllesen</span>
      </NavLink>
      <nav>
        <NavLink to="/" end>
          Bibliothek
        </NavLink>
        <NavLink to="/karten">
          Lernkarten
          {dueCards ? <span className="badge">{dueCards}</span> : null}
        </NavLink>
        <button className="ghost small" onClick={() => update({ theme: nextTheme })} title="Farbschema wechseln">
          {THEME_LABEL[settings.theme]}
        </button>
        {email ? (
          <button
            className="ghost small account"
            onClick={() => {
              if (confirm(`Als ${email} angemeldet. Abmelden?`)) signOut()
            }}
            title={`Angemeldet als ${email}`}
          >
            <span className="avatar" aria-hidden="true">
              {email[0].toUpperCase()}
            </span>
            <span className="account-label">Abmelden</span>
          </button>
        ) : (
          <button className="small" onClick={() => setLogin(true)}>
            Anmelden
          </button>
        )}
      </nav>
      {login && <LoginDialog onClose={() => setLogin(false)} />}
    </header>
  )
}
