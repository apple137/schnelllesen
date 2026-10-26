import { Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import LibraryPage from './pages/LibraryPage'
import ReaderPage from './pages/ReaderPage'
import CardsPage from './pages/CardsPage'
import { loadSettings, storeSettings, type Settings } from './lib/storage'

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useEffect(() => {
    storeSettings(settings)
    if (settings.theme === 'auto') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = settings.theme
  }, [settings])

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))

  return (
    <Routes>
      <Route path="/" element={<LibraryPage settings={settings} update={update} />} />
      <Route path="/lesen/:id" element={<ReaderPage settings={settings} update={update} />} />
      <Route path="/karten" element={<CardsPage settings={settings} update={update} />} />
      <Route path="*" element={<LibraryPage settings={settings} update={update} />} />
    </Routes>
  )
}
