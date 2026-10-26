import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import { useAuth } from '../lib/auth'
import { isDue } from '../lib/cards'
import { pdfToMarkdown } from '../lib/pdfToMarkdown'
import {
  addBook,
  deleteBook,
  getBook,
  getProgress,
  listBooks,
  listCards,
  type BookMeta,
  type Settings,
} from '../lib/storage'
import { formatMinutes, parseMarkdown } from '../lib/text'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

interface Pending {
  title: string
  markdown: string
  source: 'md' | 'pdf'
  stats?: { words: number; chapters: number }
}

function titleFrom(markdown: string, fileName: string): string {
  const h1 = /^#\s+(.+)$/m.exec(markdown)
  return (h1?.[1] ?? fileName.replace(/\.(md|markdown|txt|pdf)$/i, '')).trim()
}

function downloadMarkdown(title: string, markdown: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${title.replace(/[^\p{L}\d -]+/gu, '').trim() || 'buch'}.md`
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function LibraryPage({ settings, update }: Props) {
  const [books, setBooks] = useState<BookMeta[]>([])
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [due, setDue] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(true)
  const { session, notice, clearNotice } = useAuth()

  const refresh = useCallback(async () => {
    try {
      const list = await listBooks()
      setBooks(list)
      const entries = await Promise.all(list.map(async (b) => [b.id, (await getProgress(b.id)).pos / Math.max(1, b.wordCount)] as const))
      setProgress(Object.fromEntries(entries))
      setDue((await listCards()).filter((c) => isDue(c)).length)
    } catch (e) {
      setError(`Bibliothek konnte nicht geladen werden: ${e instanceof Error ? e.message : e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleFiles(files: FileList | File[]) {
    setError(null)
    const file = [...files][0]
    if (!file) return
    try {
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        setBusy('PDF wird gelesen …')
        const title = file.name.replace(/\.pdf$/i, '')
        const markdown = await pdfToMarkdown(await file.arrayBuffer(), title, (p, n) => setBusy(`PDF wird umgewandelt: Seite ${p} von ${n}`))
        const parsed = parseMarkdown(markdown)
        setPending({ title, markdown, source: 'pdf', stats: { words: parsed.wordCount, chapters: parsed.chapters.length } })
      } else {
        const markdown = await file.text()
        await save({ title: titleFrom(markdown, file.name), markdown, source: 'md' })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function save(p: Pending) {
    const parsed = parseMarkdown(p.markdown)
    if (parsed.wordCount < 10) throw new Error('In der Datei wurde kaum Text gefunden.')
    setBusy(session ? 'Buch wird in dein Konto hochgeladen …' : 'Buch wird gespeichert …')
    await addBook(
      {
        id: crypto.randomUUID(),
        title: p.title,
        wordCount: parsed.wordCount,
        chapters: parsed.chapters.length,
        source: p.source,
        added: Date.now(),
      },
      p.markdown,
    )
    setPending(null)
    setBusy(null)
    await refresh()
  }

  async function remove(b: BookMeta) {
    if (!confirm(`„${b.title}“ wirklich aus der Bibliothek entfernen?`)) return
    try {
      await deleteBook(b.id)
    } catch (e) {
      setError(`Entfernen fehlgeschlagen: ${e instanceof Error ? e.message : e}`)
    }
    await refresh()
  }

  async function download(b: BookMeta) {
    const book = await getBook(b.id)
    if (book) downloadMarkdown(b.title, book.markdown)
  }

  return (
    <div className="page">
      <Header settings={settings} update={update} dueCards={due} />
      <main className="container">
        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button className="ghost small" onClick={clearNotice}>
              OK
            </button>
          </div>
        )}
        <section className="intro">
          <h1>Deine Bibliothek</h1>
          <p className="muted">Lade ein Buch als PDF oder Markdown hoch und lies es mit der 8-Sync-Technik: Wortgruppen im Takt, mit Vorschau, Abruf-Fragen und Lernkarten, damit mehr hängen bleibt.</p>
        </section>

        <label
          className={`dropzone${dragging ? ' dragging' : ''}${busy ? ' busy' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            handleFiles(e.dataTransfer.files)
          }}
        >
          <input
            type="file"
            accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files)
              e.target.value = ''
            }}
            disabled={!!busy}
          />
          <strong>{busy ?? 'Datei hierher ziehen oder klicken'}</strong>
          {!busy && <span className="muted">PDF (E-Book mit Text) oder .md</span>}
        </label>
        {error && <p className="error">{error}</p>}

        {pending && (
          <section className="card preview">
            <h2>PDF umgewandelt</h2>
            <label className="field">
              Titel
              <input value={pending.title} onChange={(e) => setPending({ ...pending, title: e.target.value })} />
            </label>
            <p className="muted">
              {pending.stats?.words.toLocaleString('de-DE')} Wörter, {pending.stats?.chapters} Kapitel erkannt. Vorschau:
            </p>
            <pre className="md-preview">{pending.markdown.slice(0, 2500)}</pre>
            <div className="row">
              <button
                disabled={!!busy}
                onClick={() =>
                  save(pending).catch((e) => {
                    setBusy(null)
                    setError(String(e.message ?? e))
                  })
                }
              >
                In Bibliothek speichern
              </button>
              <button className="ghost" onClick={() => downloadMarkdown(pending.title, pending.markdown)}>
                .md herunterladen
              </button>
              <button className="ghost" onClick={() => setPending(null)}>
                Verwerfen
              </button>
            </div>
          </section>
        )}

        {loading ? (
          <p className="muted empty">Bibliothek wird geladen …</p>
        ) : books.length === 0 && !pending ? (
          <p className="muted empty">Noch keine Bücher. Lade oben deine erste Datei hoch.</p>
        ) : (
          <ul className="books">
            {books.map((b) => {
              const p = Math.min(1, progress[b.id] ?? 0)
              return (
                <li key={b.id} className="card book">
                  <div className="book-main">
                    <Link to={`/lesen/${b.id}`} className="book-title">
                      {b.title}
                    </Link>
                    <span className="muted">
                      {b.wordCount.toLocaleString('de-DE')} Wörter · {b.chapters} Kapitel · noch {formatMinutes(b.wordCount * (1 - p), settings.wpm)} bei {settings.wpm} WpM
                    </span>
                    <div className="bar" aria-label={`${Math.round(p * 100)} % gelesen`}>
                      <div style={{ width: `${p * 100}%` }} />
                    </div>
                  </div>
                  <div className="row">
                    <Link to={`/lesen/${b.id}`} className="button">
                      {p > 0 ? 'Weiterlesen' : 'Lesen'}
                    </Link>
                    <button className="ghost small" onClick={() => download(b)} title="Als Markdown herunterladen">
                      .md
                    </button>
                    <button className="ghost small danger" onClick={() => remove(b)} title="Entfernen">
                      Entfernen
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="muted footnote">
          {session
            ? `Angemeldet als ${session.user.email}: Bücher, Lesestand und Lernkarten sind auf allen deinen Geräten gleich.`
            : 'Ohne Anmeldung bleiben deine Bücher nur in diesem Browser. Melde dich oben an, um sie auf allen Geräten zu haben.'}
        </p>
      </main>
    </div>
  )
}
