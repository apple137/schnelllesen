import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '../components/Header'
import { INTERVALS, isDue, review, type Card } from '../lib/cards'
import { deleteCard, listCards, saveCard, type Settings } from '../lib/storage'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

function dueLabel(card: Card): string {
  const days = Math.ceil((card.due - Date.now()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'fällig'
  if (days === 1) return 'morgen'
  return `in ${days} Tagen`
}

export default function CardsPage({ settings, update }: Props) {
  const [cards, setCards] = useState<Card[]>([])
  const [revealed, setRevealed] = useState(false)

  const refresh = useCallback(async () => setCards(await listCards()), [])
  useEffect(() => {
    refresh()
  }, [refresh])

  const due = useMemo(() => cards.filter((c) => isDue(c)).sort((a, b) => a.due - b.due), [cards])
  const current = due[0]

  async function answer(knew: boolean) {
    if (!current) return
    await saveCard(review(current, knew))
    setRevealed(false)
    await refresh()
  }

  async function remove(c: Card) {
    if (!confirm('Diese Lernkarte löschen?')) return
    await deleteCard(c.id)
    await refresh()
  }

  const byBook = useMemo(() => {
    const groups = new Map<string, Card[]>()
    for (const c of [...cards].sort((a, b) => a.due - b.due)) groups.set(c.bookTitle, [...(groups.get(c.bookTitle) ?? []), c])
    return [...groups.entries()]
  }, [cards])

  return (
    <div className="page">
      <Header settings={settings} update={update} dueCards={due.length} />
      <main className="container">
        <section className="intro">
          <h1>Lernkarten</h1>
          <p className="muted">
            Karten entstehen aus deinen Antworten auf die Abruf-Fragen und aus Sätzen, die du beim Lesen mit „Merken“ markierst. Sie kommen nach {INTERVALS.slice(0, 4).join(', ')} Tagen wieder, bei „Nochmal“ noch am selben Tag.
          </p>
        </section>

        {current ? (
          <section className="card review">
            <span className="eyebrow">
              {due.length} fällig · {current.bookTitle}
            </span>
            <p className="front">{current.front}</p>
            {revealed ? (
              <>
                <p className="back">{current.back}</p>
                <div className="row">
                  <button onClick={() => answer(true)}>Gewusst</button>
                  <button className="ghost" onClick={() => answer(false)}>
                    Nochmal
                  </button>
                </div>
              </>
            ) : (
              <button onClick={() => setRevealed(true)}>Antwort zeigen</button>
            )}
          </section>
        ) : (
          <p className="card done">{cards.length ? 'Alles wiederholt für heute. Gut gemacht!' : 'Noch keine Lernkarten. Sie entstehen beim Lesen.'}</p>
        )}

        {byBook.map(([title, list]) => (
          <section key={title}>
            <h2>{title}</h2>
            <ul className="card-list">
              {list.map((c) => (
                <li key={c.id}>
                  <span className="front-small">{c.front}</span>
                  <span className="muted">{dueLabel(c)}</span>
                  <button className="ghost small danger" onClick={() => remove(c)} aria-label="Karte löschen">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  )
}
