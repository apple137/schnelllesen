import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildChunks, chunkDuration, orpIndex, parseMarkdown, stripInline } from '../text'

const sample = `# Mein Buch

## Erstes Kapitel

Einleitung mit **Kernbegriff** und *Betonung*. Zweiter Satz, mit Komma.

### Abschnitt A

Ein Absatz mit [Link](https://example.com) und noch mehr Text.

## Zweites Kapitel

- Punkt eins
- Punkt zwei
`

describe('parseMarkdown', () => {
  const book = parseMarkdown(sample)

  it('erkennt Kapitel auf der obersten mehrfach vorkommenden Ebene und überspringt den Buchtitel', () => {
    expect(book.chapters.map((c) => c.title)).toEqual(['Erstes Kapitel', 'Zweites Kapitel'])
  })

  it('legt Abschnitte für Unterüberschriften an', () => {
    expect(book.sections.map((s) => s.title)).toEqual(['Erstes Kapitel', 'Abschnitt A', 'Zweites Kapitel'])
    expect(book.chapters[0].subheadings).toEqual(['Abschnitt A'])
  })

  it('entfernt Markdown und markiert Satz- und Absatzenden', () => {
    const words = book.tokens.map((t) => t.w)
    expect(words).toContain('Kernbegriff')
    expect(words).toContain('Link')
    expect(words.join(' ')).not.toMatch(/[*[\]]/)
    const betonung = book.tokens.find((t) => t.w === 'Betonung.')!
    expect(betonung.sentenceEnd).toBe(true)
    expect(book.tokens.find((t) => t.w === 'Komma.')!.paraEnd).toBe(true)
  })

  it('nimmt fette Begriffe als Kernbegriffe', () => {
    expect(book.chapters[0].keyTerms).toContain('Kernbegriff')
  })

  it('kommt ohne Überschriften aus', () => {
    const b = parseMarkdown('Nur ein Satz ohne alles.')
    expect(b.chapters).toHaveLength(1)
    expect(b.wordCount).toBe(5)
  })
})

describe('stripInline', () => {
  it('entfernt Auszeichnungen', () => {
    expect(stripInline('**fett** und _kursiv_ und `code` ![bild](x.png)')).toBe('fett und kursiv und code')
  })
})

describe('buildChunks', () => {
  const book = parseMarkdown('Eins zwei drei vier fünf sechs sieben acht neun zehn elf. Kurz, aber gut.')
  it('begrenzt Wortgruppen auf die gewählte Größe und bricht am Satzende', () => {
    const starts = buildChunks(book.tokens, 8)
    expect(starts.slice(0, 3)).toEqual([0, 8, 11])
  })
  it('liefert im RSVP-Modus ein Wort pro Chunk', () => {
    expect(buildChunks(book.tokens, 1)).toHaveLength(book.tokens.length)
  })
  it('bricht nach einem Komma, wenn die Gruppe halb voll ist', () => {
    const b = parseMarkdown('Das ist gut, wirklich sehr gut und schön.')
    expect(buildChunks(b.tokens, 6)).toEqual([0, 3])
  })
})

describe('chunkDuration', () => {
  const book = parseMarkdown('Kurz. Ein Satz.')
  it('entspricht bei einem kurzen Wort ohne Satzzeichen dem Grundtakt', () => {
    expect(chunkDuration(book.tokens, 2, 3, 300)).toBeCloseTo(200 + 200 * 2) // Absatzende
    expect(chunkDuration(book.tokens, 1, 2, 300)).toBeCloseTo(200)
  })
})

describe('orpIndex', () => {
  it('liegt leicht links der Wortmitte', () => {
    expect(orpIndex('a')).toBe(0)
    expect(orpIndex('Haus')).toBe(1)
    expect(orpIndex('Muskelkraft')).toBe(3)
  })
})

const testBook = '/mnt/project-files/muskelrevolution/MuskelRevolution_Toigo.md'
describe.runIf(existsSync(testBook))('MuskelRevolution', () => {
  it('ergibt die Kapitel des Buches mit Abschnitten und Kernbegriffen', () => {
    const book = parseMarkdown(readFileSync(testBook, 'utf8'))
    const numbered = book.chapters.filter((c) => /^\d+ /.test(c.title))
    expect(numbered).toHaveLength(23)
    expect(book.wordCount).toBeGreaterThan(80000)
    expect(book.sections.length).toBeGreaterThan(130)
    expect(numbered[0].keyTerms.length).toBeGreaterThan(0)
    console.log(book.chapters.length, 'Kapitel,', book.sections.length, 'Abschnitte,', book.wordCount, 'Wörter; Kernbegriffe Kap. 1:', numbered[0].keyTerms.join(', '))
  })
})
