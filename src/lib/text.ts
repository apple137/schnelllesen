// Markdown → Wort-Tokens, Kapitel und Abschnitte für die Leseseite.

export interface Token {
  w: string
  /** Satzende (. ! ? …) */
  sentenceEnd: boolean
  /** Absatzende */
  paraEnd: boolean
  /** Index des Abschnitts, zu dem das Wort gehört */
  section: number
}

export interface Section {
  title: string
  chapter: number
  start: number
  end: number // exklusiv
}

export interface Chapter {
  title: string
  start: number
  end: number // exklusiv
  subheadings: string[]
  keyTerms: string[]
}

export interface ParsedBook {
  tokens: Token[]
  chapters: Chapter[]
  sections: Section[]
  wordCount: number
}

/** Abschnitte ohne Unterüberschrift werden nach so vielen Wörtern geteilt. */
const SECTION_FALLBACK_WORDS = 1200

const STOPWORDS = new Set(
  (
    'aber alle allem allen aller alles also andere anderen auch auf aus bei beim bereits bis dabei damit dann darauf daher' +
    ' dass dein deine dem den denn der deren des dessen die dies diese diesem diesen dieser dieses doch dort durch eine einem' +
    ' einen einer eines einige einmal etwa etwas euch hier hinter ihre ihrem ihren ihrer immer indem jedoch jeder jedes jetzt' +
    ' kann keine können könnte machen mehr mehrere meist mit muss müssen nach nicht noch nur oder ohne sehr seine seinem seinen' +
    ' seiner sich sind sondern sowie über unter viele vielleicht vom von vor während warum weil welche welchem welchen welcher' +
    ' wenn werden wieder wird wurde wurden zwischen zum zur zwar beispielsweise allerdings deshalb natürlich wirklich'
  ).split(' '),
)

/** Entfernt Markdown-Auszeichnungen aus einer Zeile. */
export function stripInline(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/<[^>]+>/g, '')
    .trim()
}

interface Block {
  kind: 'heading' | 'para'
  level: number
  text: string
  bold: string[]
}

function toBlocks(md: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  let inFence = false
  const flush = () => {
    if (para.length) {
      const raw = para.join(' ')
      const bold = [...raw.matchAll(/\*\*(.+?)\*\*/g)].map((m) => stripInline(m[1]))
      const text = stripInline(raw)
      if (text) blocks.push({ kind: 'para', level: 0, text, bold })
      para = []
    }
  }
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      flush()
      continue
    }
    if (inFence) continue
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) {
      flush()
      blocks.push({ kind: 'heading', level: h[1].length, text: stripInline(h[2]), bold: [] })
      continue
    }
    if (!line.trim() || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) || /^\s*\|?\s*:?-{3,}/.test(line)) {
      flush()
      continue
    }
    // Listenpunkte und Tabellenzeilen werden zu eigenen Absätzen
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (item) {
      flush()
      para.push(item[1])
      flush()
      continue
    }
    if (/^\s*\|/.test(line)) {
      flush()
      para.push(line.replace(/\|/g, ' ').replace(/\s+/g, ' '))
      flush()
      continue
    }
    para.push(line.replace(/^\s*>\s?/, '').trim())
  }
  flush()
  return blocks
}

/** Häufigste lange Wörter eines Textes (Fallback, wenn es keine fetten Begriffe gibt). */
function frequentTerms(words: string[], n: number): string[] {
  const counts = new Map<string, number>()
  for (const raw of words) {
    const w = raw.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '')
    // Im Deutschen sind Substantive großgeschrieben – gute Kandidaten für Begriffe
    if (w.length < 7 || !/^\p{Lu}/u.test(w) || STOPWORDS.has(w.toLowerCase()) || /\d/.test(w)) continue
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w)
}

export function parseMarkdown(md: string): ParsedBook {
  const blocks = toBlocks(md)
  const levels = blocks.filter((b) => b.kind === 'heading').map((b) => b.level)
  // Kapitel-Ebene: die oberste Überschriftenebene, die mindestens zweimal vorkommt
  let chapterLevel = 0
  for (let l = 1; l <= 6; l++) {
    if (levels.filter((x) => x === l).length >= 2) {
      chapterLevel = l
      break
    }
  }
  const sectionLevel = chapterLevel ? chapterLevel + 1 : 0

  const tokens: Token[] = []
  const chapters: Chapter[] = []
  const sections: Section[] = []
  const chapterBold: string[][] = []
  let bookTitle: string | undefined

  const openChapter = (title: string) => {
    const last = chapters.at(-1)
    if (last && last.start === tokens.length) {
      last.title = title
      return
    }
    if (last) last.end = tokens.length
    chapters.push({ title, start: tokens.length, end: tokens.length, subheadings: [], keyTerms: [] })
    chapterBold.push([])
    openSection(title)
  }
  const openSection = (title: string) => {
    const last = sections.at(-1)
    if (last && last.start === tokens.length) {
      last.title = title
      last.chapter = chapters.length - 1
      return
    }
    if (last) last.end = tokens.length
    sections.push({ title, chapter: Math.max(0, chapters.length - 1), start: tokens.length, end: tokens.length })
  }

  for (const b of blocks) {
    if (b.kind === 'heading') {
      if (chapterLevel && b.level <= chapterLevel) {
        // Buchtitel (eine Ebene über den Kapiteln) wird nicht als eigenes Kapitel gezählt
        if (b.level < chapterLevel && chapters.length === 0) {
          bookTitle = b.text
          continue
        }
        openChapter(b.text)
      } else if (b.level === sectionLevel) {
        if (!chapters.length) openChapter(b.text)
        chapters.at(-1)!.subheadings.push(b.text)
        openSection(b.text)
      }
      // Tiefere Überschriften (Boxen usw.) werden als kurzer Absatz gelesen
      if (!(chapterLevel && b.level <= sectionLevel)) {
        pushWords(b.text, true)
      }
      continue
    }
    if (!chapters.length) openChapter(bookTitle ?? 'Anfang')
    chapterBold.at(-1)!.push(...b.bold)
    pushWords(b.text, true)
  }

  function pushWords(text: string, paraEnd: boolean) {
    const words = text.split(/\s+/).filter(Boolean)
    words.forEach((w, i) => {
      const cur = sections.at(-1)!
      // Lange Abschnitte ohne Unterüberschrift in Etappen teilen
      if (tokens.length - cur.start >= SECTION_FALLBACK_WORDS && i === 0) {
        openSection(`${chapters.at(-1)!.title} (Teil ${sections.filter((s) => s.chapter === chapters.length - 1).length + 1})`)
      }
      tokens.push({
        w,
        sentenceEnd: /[.!?…]["“”»«)]*$/.test(w),
        paraEnd: paraEnd && i === words.length - 1,
        section: sections.length - 1,
      })
    })
  }

  if (chapters.length) chapters.at(-1)!.end = tokens.length
  if (sections.length) sections.at(-1)!.end = tokens.length

  chapters.forEach((c, i) => {
    const bold = [...new Set(chapterBold[i].filter((t) => t.length > 2 && t.length < 40 && !/\d/.test(t) && !/^(Abb|Tab|Box)\b/.test(t)))]
    const words = tokens.slice(c.start, c.end).map((t) => t.w)
    c.keyTerms = (bold.length >= 3 ? bold : [...bold, ...frequentTerms(words, 8)]).slice(0, 8)
  })

  // Leere Kapitel (z. B. „Inhalt“ ohne Fließtext) entfernen
  const keep = chapters.filter((c) => c.end > c.start)
  return { tokens, chapters: keep, sections: sections.filter((s) => s.end > s.start), wordCount: tokens.length }
}

/** Gruppiert Tokens zu Chunks von höchstens `size` Wörtern (8-Sync). Ergebnis: Startindizes. */
export function buildChunks(tokens: Token[], size: number): number[] {
  const starts: number[] = []
  let count = 0
  for (let i = 0; i < tokens.length; i++) {
    if (count === 0) starts.push(i)
    count++
    const t = tokens[i]
    const next = tokens[i + 1]
    const comma = /[,;:–—]$/.test(t.w)
    if (
      count >= size ||
      t.sentenceEnd ||
      t.paraEnd ||
      (comma && count >= Math.ceil(size / 2)) ||
      (next && next.section !== t.section)
    ) {
      count = 0
    }
  }
  return starts
}

/** Gewicht eines Wortes: lange Wörter und Zahlen bekommen mehr Zeit. */
export function wordWeight(w: string): number {
  let weight = 1
  const len = w.replace(/[^\p{L}\d]/gu, '').length
  if (len > 8) weight += 0.25
  if (len > 13) weight += 0.35
  if (/\d/.test(w)) weight += 0.3
  return weight
}

/** Anzeigedauer eines Chunks in Millisekunden. */
export function chunkDuration(tokens: Token[], start: number, end: number, wpm: number): number {
  const base = 60000 / wpm
  let ms = 0
  for (let i = start; i < end; i++) ms += base * wordWeight(tokens[i].w)
  const last = tokens[end - 1]
  if (last?.paraEnd) ms += base * 2
  else if (last?.sentenceEnd) ms += base * 1.2
  else if (last && /[,;:]$/.test(last.w)) ms += base * 0.4
  // Mehrere Wörter auf einmal brauchen etwas weniger Zeit pro Wort, aber nie unter 60 %
  const n = end - start
  if (n > 1) ms *= Math.max(0.6, 1 - 0.05 * (n - 1))
  return ms
}

/** Fixpunkt-Buchstabe (Optimal Recognition Point) für ein einzelnes Wort. */
export function orpIndex(w: string): number {
  const len = w.length
  if (len <= 1) return 0
  if (len <= 5) return 1
  if (len <= 9) return 2
  if (len <= 13) return 3
  return 4
}

export function formatMinutes(words: number, wpm: number): string {
  const min = Math.round(words / wpm)
  if (min < 60) return `${min} Min.`
  return `${Math.floor(min / 60)} Std. ${min % 60} Min.`
}
