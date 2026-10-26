import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { newCard } from '../lib/cards'
import { getBook, getProgress, saveCard, saveProgress, touchBook, type BookMeta, type Progress, type Settings } from '../lib/storage'
import { buildChunks, chunkDuration, formatMinutes, orpIndex, parseMarkdown, type ParsedBook } from '../lib/text'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

type Overlay =
  | { kind: 'preview'; chapter: number }
  | { kind: 'recall'; section: number }
  | { kind: 'stage' }
  | { kind: 'settings' }
  | null

/** Abschnitte unter dieser Länge bekommen keine Abruf-Frage. */
const MIN_RECALL_WORDS = 150
const PREVIEW_SECONDS = 20

function findChunk(starts: number[], pos: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= pos) lo = mid
    else hi = mid - 1
  }
  return lo
}

function sentenceBounds(book: ParsedBook, pos: number): [number, number] {
  const t = book.tokens
  let start = pos
  while (start > 0 && !t[start - 1].sentenceEnd && !t[start - 1].paraEnd) start--
  let end = pos
  while (end < t.length - 1 && !t[end].sentenceEnd && !t[end].paraEnd) end++
  return [start, end + 1]
}

export default function ReaderPage({ settings, update }: Props) {
  const { id = '' } = useParams()
  const [meta, setMeta] = useState<BookMeta | null>(null)
  const [book, setBook] = useState<ParsedBook | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [missing, setMissing] = useState(false)
  const [chunkIdx, setChunkIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [answer, setAnswer] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)
  const activeMs = useRef(0)
  const lastTick = useRef(0)

  // Buch laden
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await getBook(id)
      if (cancelled) return
      if (!data) {
        setMissing(true)
        return
      }
      const parsed = parseMarkdown(data.markdown)
      const p = await getProgress(id)
      if (cancelled) return
      setMeta(data.meta)
      setBook(parsed)
      setProgress(p)
      touchBook(id)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const size = settings.mode === 'rsvp' ? 1 : settings.chunkSize
  const starts = useMemo(() => (book ? buildChunks(book.tokens, size) : []), [book, size])

  // Beim Wechsel von Modus/Chunk-Größe an derselben Textstelle bleiben
  const pos = starts[chunkIdx] ?? 0
  const posRef = useRef(0)
  posRef.current = pos
  useEffect(() => {
    if (!starts.length || !progress) return
    setChunkIdx(findChunk(starts, posRef.current || progress.pos))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starts])

  const chunkEnd = starts[chunkIdx + 1] ?? book?.tokens.length ?? 0
  const section = book?.tokens[pos]?.section ?? 0
  const chapterIdx = book ? Math.max(0, book.chapters.findLastIndex((c) => c.start <= pos)) : 0
  const chapter = book?.chapters[chapterIdx]

  // Lesestand speichern (gedrosselt)
  const progressRef = useRef(progress)
  progressRef.current = progress
  useEffect(() => {
    if (!progress) return
    const t = setTimeout(() => saveProgress(id, { ...progress, pos }), 1500)
    return () => clearTimeout(t)
  }, [id, pos, progress])
  useEffect(
    () => () => {
      if (progressRef.current) saveProgress(id, { ...progressRef.current, pos: posRef.current })
    },
    [id],
  )

  const markProgress = useCallback((patch: Partial<Progress>) => {
    setProgress((p) => (p ? { ...p, ...patch } : p))
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  /** Prüft vor dem Anzeigen eines Chunks, ob eine Vorschau fällig ist. */
  const previewDue = useCallback(
    (idx: number) => {
      if (!book || !progress || !settings.preview) return -1
      const p = starts[idx]
      const ch = book.chapters.findIndex((c) => c.start === p)
      return ch >= 0 && !progress.previewed.includes(ch) ? ch : -1
    },
    [book, progress, settings.preview, starts],
  )

  const play = useCallback(() => {
    const ch = previewDue(chunkIdx)
    if (ch >= 0) {
      setOverlay({ kind: 'preview', chapter: ch })
      return
    }
    setOverlay(null)
    lastTick.current = performance.now()
    setPlaying(true)
  }, [chunkIdx, previewDue])

  const pause = useCallback(() => setPlaying(false), [])

  // Taktgeber
  useEffect(() => {
    if (!playing || !book) return
    if (chunkIdx >= starts.length - 1 && pos >= book.tokens.length - 1) {
      setPlaying(false)
      return
    }
    const ms = chunkDuration(book.tokens, pos, chunkEnd, settings.wpm)
    const t = setTimeout(() => {
      const now = performance.now()
      activeMs.current += now - lastTick.current
      lastTick.current = now
      const next = chunkIdx + 1
      if (next >= starts.length) {
        setPlaying(false)
        return
      }
      const nextSection = book.tokens[starts[next]].section
      // Ende eines Abschnitts: Abruf-Frage
      if (nextSection !== section && settings.recall && progress && !progress.recalled.includes(section)) {
        const s = book.sections[section]
        if (s && s.end - s.start >= MIN_RECALL_WORDS) {
          setPlaying(false)
          setChunkIdx(next)
          setAnswer('')
          setOverlay({ kind: 'recall', section })
          return
        }
      }
      // Etappe vorbei: Pause vorschlagen
      if (settings.stageMinutes > 0 && activeMs.current >= settings.stageMinutes * 60000) {
        activeMs.current = 0
        setPlaying(false)
        setChunkIdx(next)
        setOverlay({ kind: 'stage' })
        return
      }
      const ch = previewDue(next)
      if (ch >= 0) {
        setPlaying(false)
        setChunkIdx(next)
        setOverlay({ kind: 'preview', chapter: ch })
        return
      }
      setChunkIdx(next)
    }, ms)
    return () => clearTimeout(t)
  }, [playing, book, chunkIdx, starts, pos, chunkEnd, section, settings.wpm, settings.recall, settings.stageMinutes, progress, previewDue])

  // Countdown für Vorschau und Pause
  useEffect(() => {
    if (overlay?.kind === 'preview') setCountdown(PREVIEW_SECONDS)
    else if (overlay?.kind === 'stage') setCountdown(30)
    else setCountdown(0)
  }, [overlay])
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const finishPreview = useCallback(() => {
    if (overlay?.kind !== 'preview' || !progress) return
    markProgress({ previewed: [...progress.previewed, overlay.chapter] })
    setOverlay(null)
    lastTick.current = performance.now()
    setPlaying(true)
  }, [overlay, progress, markProgress])

  async function finishRecall(save: boolean) {
    if (overlay?.kind !== 'recall' || !book || !meta || !progress) return
    const s = book.sections[overlay.section]
    if (save && answer.trim()) {
      await saveCard(newCard(meta.id, meta.title, `Was ist der Kernpunkt von „${s.title}“?`, answer.trim()))
      showToast('Lernkarte gespeichert')
    }
    markProgress({ recalled: [...progress.recalled, overlay.section] })
    setOverlay(null)
    play()
  }

  const seek = useCallback(
    (tokenPos: number) => {
      setChunkIdx(findChunk(starts, tokenPos))
    },
    [starts],
  )

  const jumpSentence = useCallback(
    (dir: -1 | 1) => {
      if (!book) return
      const [s, e] = sentenceBounds(book, pos)
      if (dir === 1) seek(Math.min(e, book.tokens.length - 1))
      else seek(pos - s > 1 || s === 0 ? s : sentenceBounds(book, s - 1)[0])
    },
    [book, pos, seek],
  )

  const remember = useCallback(async () => {
    if (!book || !meta) return
    const [s, e] = sentenceBounds(book, pos)
    const words = book.tokens.slice(s, e).map((t) => t.w)
    const clean = (w: string) => w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '')
    let gap = 0
    words.forEach((w, i) => {
      if (clean(w).length > clean(words[gap]).length) gap = i
    })
    const hidden = clean(words[gap])
    const front = words.map((w, i) => (i === gap ? w.replace(hidden, '_____') : w)).join(' ')
    await saveCard(newCard(meta.id, meta.title, front, `${hidden}\n\n${words.join(' ')}`))
    showToast('Satz als Lernkarte gemerkt')
  }, [book, meta, pos])

  // Tastatur
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if (overlay && overlay.kind !== 'settings') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (overlay.kind === 'preview') finishPreview()
          if (overlay.kind === 'stage') play()
        }
        return
      }
      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (playing) pause()
          else play()
          break
        case 'ArrowLeft':
          e.preventDefault()
          jumpSentence(-1)
          break
        case 'ArrowRight':
          e.preventDefault()
          jumpSentence(1)
          break
        case 'ArrowUp':
          e.preventDefault()
          update({ wpm: Math.min(1000, settings.wpm + 25) })
          break
        case 'ArrowDown':
          e.preventDefault()
          update({ wpm: Math.max(100, settings.wpm - 25) })
          break
        case 'm':
        case 'M':
          remember()
          break
        case 'Escape':
          setOverlay(null)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay, playing, play, pause, jumpSentence, remember, finishPreview, settings.wpm, update])

  if (missing) {
    return (
      <div className="page reader">
        <main className="container">
          <p>Dieses Buch wurde nicht gefunden.</p>
          <Link to="/">Zur Bibliothek</Link>
        </main>
      </div>
    )
  }
  if (!book || !meta || !progress) return <div className="page reader loading">Buch wird geladen …</div>

  const words = book.tokens.slice(pos, chunkEnd).map((t) => t.w)
  const fraction = pos / Math.max(1, book.tokens.length - 1)
  const remaining = book.tokens.length - pos
  const [sStart, sEnd] = sentenceBounds(book, pos)
  const chapterProgress = chapter ? (pos - chapter.start) / Math.max(1, chapter.end - chapter.start) : 0

  return (
    <div className="page reader">
      <header className="reader-top">
        <Link to="/" className="ghost small button" onClick={pause}>
          ← Bibliothek
        </Link>
        <div className="reader-title">
          <strong>{meta.title}</strong>
          <select
            value={chapterIdx}
            onChange={(e) => {
              pause()
              seek(book.chapters[Number(e.target.value)].start)
            }}
            aria-label="Kapitel wählen"
          >
            {book.chapters.map((c, i) => (
              <option key={i} value={i}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <button className="ghost small" onClick={() => setOverlay(overlay?.kind === 'settings' ? null : { kind: 'settings' })}>
          Einstellungen
        </button>
      </header>

      <div className="bar chapter-bar" aria-hidden="true">
        <div style={{ width: `${chapterProgress * 100}%` }} />
      </div>

      <main
        className={`stage-area${playing ? ' playing' : ''}`}
        onClick={() => {
          if (overlay) return
          if (playing) pause()
          else play()
        }}
      >
        <div className="fixation" aria-hidden="true" />
        {settings.mode === 'rsvp' ? (
          <Rsvp word={words[0] ?? ''} />
        ) : (
          <div className="chunk" aria-live="off">
            {words.join(' ')}
          </div>
        )}
        <div className="fixation bottom" aria-hidden="true" />
        {!playing && !overlay && (
          <div className="context">
            <p>
              {book.tokens.slice(sStart, sEnd).map((t, i) => {
                const idx = sStart + i
                return (
                  <span key={idx} className={idx >= pos && idx < chunkEnd ? 'current' : undefined}>
                    {t.w}{' '}
                  </span>
                )
              })}
            </p>
            <span className="muted hint">Leertaste oder Tippen: Start · ← → Satz · ↑ ↓ Tempo · M: Satz merken</span>
          </div>
        )}
      </main>

      <footer className="controls">
        <div className="row center">
          <button className="ghost" onClick={() => jumpSentence(-1)} aria-label="Satz zurück">
            ⏮
          </button>
          <button className="play" onClick={() => (playing ? pause() : play())}>
            {playing ? 'Pause' : 'Lesen'}
          </button>
          <button className="ghost" onClick={() => jumpSentence(1)} aria-label="Satz vor">
            ⏭
          </button>
          <button className="ghost" onClick={remember} title="Aktuellen Satz als Lernkarte merken (M)">
            Merken
          </button>
        </div>
        <div className="sliders">
          <label>
            <span>
              Tempo <b>{settings.wpm}</b> WpM
            </span>
            <input type="range" min={100} max={1000} step={25} value={settings.wpm} onChange={(e) => update({ wpm: Number(e.target.value) })} />
          </label>
          {settings.mode === 'sync' && (
            <label>
              <span>
                Wortgruppe bis <b>{settings.chunkSize}</b> {settings.chunkSize === 1 ? 'Wort' : 'Wörter'}
              </span>
              <input type="range" min={1} max={8} step={1} value={settings.chunkSize} onChange={(e) => update({ chunkSize: Number(e.target.value) })} />
            </label>
          )}
        </div>
        <div
          className="bar seek"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            pause()
            seek(Math.round(((e.clientX - r.left) / r.width) * (book.tokens.length - 1)))
          }}
          title="Springen"
        >
          <div style={{ width: `${fraction * 100}%` }} />
        </div>
        <div className="row between muted small-text">
          <span>{Math.round(fraction * 100)} % gelesen</span>
          {settings.wpm > 500 && <span className="warn">Über 500 WpM sinkt das Verständnis messbar</span>}
          <span>noch {formatMinutes(remaining, settings.wpm)}</span>
        </div>
      </footer>

      {overlay?.kind === 'preview' && book.chapters[overlay.chapter] && (
        <div className="overlay">
          <div className="dialog">
            <span className="eyebrow">Vorschau · Kapitel {overlay.chapter + 1} von {book.chapters.length}</span>
            <h2>{book.chapters[overlay.chapter].title}</h2>
            {book.chapters[overlay.chapter].subheadings.length > 0 && (
              <>
                <h3>Darum geht es</h3>
                <ul className="subheadings">
                  {book.chapters[overlay.chapter].subheadings.slice(0, 12).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {book.chapters[overlay.chapter].keyTerms.length > 0 && (
              <>
                <h3>Kernbegriffe</h3>
                <div className="chips">
                  {book.chapters[overlay.chapter].keyTerms.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
              </>
            )}
            <p className="muted">Überfliege die Punkte kurz. So hat dein Gehirn ein Gerüst, in das es das Neue einsortieren kann.</p>
            <div className="row">
              <button onClick={finishPreview}>{countdown > 0 ? `Los geht's (${countdown})` : "Los geht's"}</button>
              <button className="ghost" onClick={() => setOverlay(null)}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {overlay?.kind === 'recall' && (
        <div className="overlay">
          <div className="dialog">
            <span className="eyebrow">Abruf-Frage</span>
            <h2>Was war der Kernpunkt von „{book.sections[overlay.section]?.title}“?</h2>
            <p className="muted">Schreib ein bis zwei Sätze aus dem Gedächtnis, ohne zurückzublättern. Das Abrufen festigt das Gelesene stärker als nochmal lesen.</p>
            <textarea autoFocus rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="In eigenen Worten …" />
            <div className="row">
              <button onClick={() => finishRecall(true)} disabled={!answer.trim()}>
                Speichern und weiterlesen
              </button>
              <button className="ghost" onClick={() => finishRecall(false)}>
                Überspringen
              </button>
            </div>
          </div>
        </div>
      )}

      {overlay?.kind === 'stage' && (
        <div className="overlay">
          <div className="dialog">
            <span className="eyebrow">Etappe geschafft</span>
            <h2>Kurze Pause</h2>
            <p>Schau 30 Sekunden in die Ferne und atme ruhig durch. Kurze Pausen halten die Aufmerksamkeit hoch.</p>
            <div className="row">
              <button onClick={play}>{countdown > 0 ? `Weiterlesen (${countdown})` : 'Weiterlesen'}</button>
              <button className="ghost" onClick={() => setOverlay(null)}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {overlay?.kind === 'settings' && (
        <div className="overlay" onClick={() => setOverlay(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Einstellungen</h2>
            <div className="segmented" role="radiogroup" aria-label="Modus">
              <button className={settings.mode === 'sync' ? 'active' : ''} onClick={() => update({ mode: 'sync' })}>
                8-Sync (Wortgruppen)
              </button>
              <button className={settings.mode === 'rsvp' ? 'active' : ''} onClick={() => update({ mode: 'rsvp' })}>
                RSVP (ein Wort)
              </button>
            </div>
            <label className="check">
              <input type="checkbox" checked={settings.preview} onChange={(e) => update({ preview: e.target.checked })} />
              Vorschau vor jedem Kapitel
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.recall} onChange={(e) => update({ recall: e.target.checked })} />
              Abruf-Frage nach jedem Abschnitt
            </label>
            <label className="field">
              Pause nach
              <select value={settings.stageMinutes} onChange={(e) => update({ stageMinutes: Number(e.target.value) })}>
                <option value={0}>nie</option>
                <option value={5}>5 Minuten</option>
                <option value={8}>8 Minuten</option>
                <option value={10}>10 Minuten</option>
                <option value={15}>15 Minuten</option>
              </select>
            </label>
            <div className="row">
              <button className="ghost" onClick={() => markProgress({ previewed: [], recalled: [] })}>
                Vorschauen und Fragen zurücksetzen
              </button>
              <button onClick={() => setOverlay(null)}>Fertig</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function Rsvp({ word }: { word: string }) {
  const i = orpIndex(word)
  return (
    <div className="rsvp">
      <span className="pre">{word.slice(0, i)}</span>
      <span className="orp">{word[i] ?? ''}</span>
      <span className="post">{word.slice(i + 1)}</span>
    </div>
  )
}
