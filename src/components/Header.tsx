import { NavLink } from 'react-router-dom'
import type { Settings } from '../lib/storage'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  dueCards?: number
}

const THEMES: Settings['theme'][] = ['auto', 'light', 'dark']
const THEME_LABEL = { auto: 'Auto', light: 'Hell', dark: 'Dunkel' }

export default function Header({ settings, update, dueCards }: Props) {
  const nextTheme = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length]
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
      </nav>
    </header>
  )
}
