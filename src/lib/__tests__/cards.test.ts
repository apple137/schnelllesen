import { describe, expect, it } from 'vitest'
import { INTERVALS, isDue, newCard, review } from '../cards'

const DAY = 86400000

describe('Spaced Repetition', () => {
  const now = 1_000_000
  const card = newCard('b', 'Buch', 'Frage', 'Antwort', now)

  it('ist am nächsten Tag fällig', () => {
    expect(card.due).toBe(now + DAY)
    expect(isDue(card, now)).toBe(false)
    expect(isDue(card, now + DAY)).toBe(true)
  })

  it('wandert bei „Gewusst“ durch 3, 7, 21, 60 Tage', () => {
    let c = card
    const gaps: number[] = []
    for (let i = 0; i < 5; i++) {
      c = review(c, true, now)
      gaps.push((c.due - now) / DAY)
    }
    expect(gaps).toEqual([3, 7, 21, 60, 60])
    expect(INTERVALS).toEqual([1, 3, 7, 21, 60])
  })

  it('kommt bei „Nochmal“ nach 10 Minuten wieder und startet von vorn', () => {
    const c = review(review(card, true, now), false, now)
    expect(c.step).toBe(0)
    expect(c.due).toBe(now + 10 * 60 * 1000)
  })
})
