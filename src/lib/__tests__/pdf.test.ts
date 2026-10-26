import { describe, expect, it } from 'vitest'
import { linesToMarkdown, type PdfLine } from '../pdfToMarkdown'

const line = (text: string, y: number, size = 10, x = 50, right = 500): PdfLine => ({ text, y, size, x, right })

function page(n: number, body: PdfLine[]): PdfLine[] {
  return [line('Mein Buch – Kopfzeile', 20, 8), ...body, line(String(n), 800, 8)]
}

describe('linesToMarkdown', () => {
  const pages = [
    page(1, [
      line('1 Erstes Kapitel', 100, 18),
      line('Dies ist ein langer Satz, der über die Zei-', 140),
      line('le hinausgeht und hier endet.', 152, 10, 50, 300),
      line('Neuer Absatz nach einer kurzen Zeile.', 164),
    ]),
    page(2, [line('1.1 Ein Abschnitt', 100, 13), line('Text im Abschnitt mit genug Inhalt.', 130)]),
    page(3, [line('Weiterer Text auf Seite drei.', 100)]),
    page(4, [line('Und noch mehr Text auf Seite vier.', 100)]),
  ]
  const md = linesToMarkdown(pages, 'Mein Buch')

  it('setzt den Titel und erkennt Überschriften nach Schriftgröße', () => {
    expect(md).toMatch(/^# Mein Buch\n/)
    expect(md).toContain('## 1 Erstes Kapitel')
    expect(md).toContain('### 1.1 Ein Abschnitt')
  })

  it('entfernt Kopfzeilen und Seitenzahlen', () => {
    expect(md).not.toContain('Kopfzeile')
    expect(md).not.toMatch(/^\d+$/m)
  })

  it('fügt Silbentrennung zusammen und trennt Absätze', () => {
    expect(md).toContain('über die Zeile hinausgeht und hier endet.\n\nNeuer Absatz')
  })
})
