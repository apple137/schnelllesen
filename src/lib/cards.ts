// Lernkarten mit Wiederholung in wachsenden Abständen (Spaced Repetition).

export interface Card {
  id: string
  bookId: string
  bookTitle: string
  front: string
  back: string
  /** Stufe 0 … INTERVALS.length; bestimmt den nächsten Abstand */
  step: number
  due: number
  created: number
}

/** Abstände in Tagen: 1, 3, 7, 21, danach 60 */
export const INTERVALS = [1, 3, 7, 21, 60]

const DAY = 24 * 60 * 60 * 1000

export function newCard(bookId: string, bookTitle: string, front: string, back: string, now = Date.now()): Card {
  return {
    id: crypto.randomUUID(),
    bookId,
    bookTitle,
    front,
    back,
    step: 0,
    due: now + INTERVALS[0] * DAY,
    created: now,
  }
}

/** Nach einer Wiederholung: gewusst → nächste Stufe, nicht gewusst → in 10 Minuten noch einmal, Stufe zurück auf 0. */
export function review(card: Card, knew: boolean, now = Date.now()): Card {
  if (!knew) return { ...card, step: 0, due: now + 10 * 60 * 1000 }
  const step = Math.min(card.step + 1, INTERVALS.length - 1)
  return { ...card, step, due: now + INTERVALS[step] * DAY }
}

export function isDue(card: Card, now = Date.now()): boolean {
  return card.due <= now
}
