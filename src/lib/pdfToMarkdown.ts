// PDF → Markdown im Browser. Funktioniert für E-Book-PDFs mit echtem Text;
// gescannte PDFs (nur Bilder) liefern keinen Text und werden erkannt.

export interface PdfLine {
  text: string
  /** Schriftgröße in PDF-Punkten */
  size: number
  /** Abstand von oben auf der Seite */
  y: number
  x: number
  /** rechtes Ende der Zeile */
  right: number
}

export class ScannedPdfError extends Error {
  constructor() {
    super('Diese PDF enthält keinen Text (vermutlich eingescannt). Gescannte PDFs werden in einer späteren Version unterstützt.')
  }
}

const SENTENCE_END = /[.!?:…"“”»]$/

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Schriftgröße, in der die meisten Zeichen gesetzt sind (Fließtext). */
function bodySize(pages: PdfLine[][]): number {
  const counts = new Map<number, number>()
  for (const l of pages.flat()) {
    const k = Math.round(l.size * 2) / 2
    counts.set(k, (counts.get(k) ?? 0) + l.text.length)
  }
  let best = 0
  let max = -1
  for (const [k, c] of counts) if (c > max) [best, max] = [k, c]
  return best
}

const normalize = (s: string) => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase()

/** Wandelt erkannte Zeilen aller Seiten in Markdown um. */
export function linesToMarkdown(pages: PdfLine[][], title?: string): string {
  const body = bodySize(pages)

  // Kopf- und Fußzeilen: kleine erste/letzte Zeilen, die sich auf vielen Seiten wiederholen.
  // Große Zeilen (Kapitelüberschriften) sind nie Kopfzeilen.
  const isEdge = (p: PdfLine[], l: PdfLine) => (l === p[0] || l === p.at(-1)) && l.size <= body * 1.05
  const edgeCounts = new Map<string, number>()
  for (const p of pages) {
    for (const l of p.filter((l) => isEdge(p, l))) {
      const k = normalize(l.text)
      edgeCounts.set(k, (edgeCounts.get(k) ?? 0) + 1)
    }
  }
  const repeated = (p: PdfLine[], l: PdfLine) =>
    pages.length >= 4 && isEdge(p, l) && (edgeCounts.get(normalize(l.text)) ?? 0) >= Math.max(3, pages.length * 0.4)

  // Überschriftengrößen: deutlich größer als der Fließtext, absteigend sortiert → ##, ###, ####
  const headingSizes = [
    ...new Set(
      pages
        .flat()
        .filter((l) => l.size >= body * 1.15 && l.text.length < 120)
        .map((l) => Math.round(l.size * 2) / 2),
    ),
  ].sort((a, b) => b - a)
  // Kommt die größte von mindestens drei Überschriftgrößen nur einmal vor, ist sie der Buchtitel (#)
  const largestCount = pages.flat().filter((l) => Math.round(l.size * 2) / 2 === headingSizes[0]).length
  const firstLevel = headingSizes.length >= 3 && largestCount === 1 ? 1 : 2
  const headingLevel = (l: PdfLine) => {
    if (l.size < body * 1.15 || l.text.length >= 120 || !/\p{L}/u.test(l.text)) return 0
    const i = headingSizes.indexOf(Math.round(l.size * 2) / 2)
    return i < 0 ? 0 : Math.min(firstLevel + i, 4)
  }

  const out: string[] = []
  let para = ''
  let heading: { level: number; text: string } | null = null
  const flushPara = () => {
    if (para.trim()) out.push(para.trim())
    para = ''
  }
  const flushHeading = () => {
    if (heading) out.push(`${'#'.repeat(heading.level)} ${heading.text.trim()}`)
    heading = null
  }
  const append = (text: string) => {
    if (!para) para = text
    else if (/\p{L}[-\u2010\u00ad]$/u.test(para) && /^\p{Ll}/u.test(text)) para = para.slice(0, -1) + text // Silbentrennung
    else para += ' ' + text
  }

  for (const page of pages) {
    const lines = page.filter((l) => l.text.trim() && !/^\s*\d{1,4}\s*$/.test(l.text) && !repeated(page, l))
    const gaps = lines.slice(1).map((l, i) => l.y - lines[i].y).filter((g) => g > 0)
    const lineGap = median(gaps) || body * 1.2
    const rightEdge = Math.max(...lines.map((l) => l.right), 0)

    lines.forEach((l, i) => {
      const level = headingLevel(l)
      if (level) {
        flushPara()
        // Mehrzeilige Überschrift gleicher Größe zusammenfügen
        if (heading && heading.level === level) heading.text += ' ' + l.text
        else {
          flushHeading()
          heading = { level, text: l.text }
        }
        return
      }
      flushHeading()
      const prev = lines[i - 1]
      const bigGap = prev && l.y - prev.y > lineGap * 1.6
      const prevShort = prev && SENTENCE_END.test(prev.text.trim()) && prev.right < rightEdge * 0.85
      const indented = prev && l.x > prev.x + body * 0.8 && SENTENCE_END.test(prev.text.trim())
      if (i === 0 && para && SENTENCE_END.test(para) && !/^\p{Ll}/u.test(l.text)) flushPara()
      if (bigGap || prevShort || indented) flushPara()
      append(l.text.trim())
    })
    flushHeading()
  }
  flushPara()

  const md = out.join('\n\n')
  const t = title?.trim()
  // Nur einen Titel ergänzen, wenn die PDF selbst keinen hat
  return t && !out.some((b) => b.startsWith('# ')) ? `# ${t}\n\n${md}\n` : md + '\n'
}

/** Liest eine PDF-Datei mit pdf.js und gibt Markdown zurück. */
export async function pdfToMarkdown(data: ArrayBuffer, title: string, onProgress?: (page: number, total: number) => void): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const doc = await pdfjs.getDocument({ data }).promise
  const pages: PdfLine[][] = []
  let chars = 0
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const height = page.getViewport({ scale: 1 }).height
    const content = await page.getTextContent()
    const byLine = new Map<number, { x: number; right: number; size: number; str: string }[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue
      const [a, b, , , x, y] = item.transform as number[]
      const size = Math.hypot(a, b) || item.height
      const key = Math.round((height - y) / 2) * 2
      const row = byLine.get(key) ?? []
      row.push({ x, right: x + item.width, size, str: item.str })
      byLine.set(key, row)
    }
    const lines: PdfLine[] = [...byLine.entries()]
      .sort((p, q) => p[0] - q[0])
      .map(([y, items]) => {
        items.sort((p, q) => p.x - q.x)
        let text = ''
        let lastRight = -Infinity
        for (const it of items) {
          const gap = it.x - lastRight
          if (text && gap > it.size * 0.15 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' '
          text += it.str
          lastRight = it.right
        }
        return {
          text: text.replace(/\s+/g, ' ').trim(),
          size: Math.max(...items.map((i) => i.size)),
          y,
          x: items[0].x,
          right: lastRight,
        }
      })
      .filter((l) => l.text)
    chars += lines.reduce((s, l) => s + l.text.length, 0)
    pages.push(lines)
    page.cleanup()
    onProgress?.(n, doc.numPages)
  }
  await doc.destroy()
  if (chars < doc.numPages * 20) throw new ScannedPdfError()
  return linesToMarkdown(pages, title)
}
