// Speicher für Bücher, Lesestand und Lernkarten.
// Ohne Anmeldung liegt alles im Browser (IndexedDB). Mit Anmeldung ist Supabase die Quelle,
// und der Browser hält nur eine Kopie der Buchtexte, damit sie nicht jedes Mal geladen werden.

import { createStore, del, get, set } from 'idb-keyval'
import type { Card } from './cards'
import * as cloud from './cloud'

export interface BookMeta {
  id: string
  title: string
  wordCount: number
  chapters: number
  source: 'md' | 'pdf'
  added: number
  lastRead?: number
}

export interface Progress {
  /** Index des aktuellen Wortes */
  pos: number
  /** Abschnitte, deren Abruf-Frage schon beantwortet oder übersprungen wurde */
  recalled: number[]
  /** Kapitel, deren Vorschau schon gezeigt wurde */
  previewed: number[]
  updated: number
}

export interface Settings {
  mode: 'sync' | 'rsvp'
  wpm: number
  chunkSize: number
  preview: boolean
  recall: boolean
  /** Minuten pro Etappe, 0 = aus */
  stageMinutes: number
  theme: 'auto' | 'light' | 'dark'
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'sync',
  wpm: 300,
  chunkSize: 4,
  preview: true,
  recall: true,
  stageMinutes: 8,
  theme: 'auto',
}

const store = createStore('schnelllesen', 'data')

/** Angemeldete Person; null = nur im Browser speichern */
let userId: string | null = null

export function setStorageUser(id: string | null): void {
  userId = id
}

const EMPTY_PROGRESS: Progress = { pos: 0, recalled: [], previewed: [], updated: 0 }

const sortBooks = (books: BookMeta[]) => books.sort((a, b) => (b.lastRead ?? b.added) - (a.lastRead ?? a.added))

// --- im Browser ---

async function localBooks(): Promise<BookMeta[]> {
  return (await get<BookMeta[]>('books', store)) ?? []
}

async function localProgress(id: string): Promise<Progress | undefined> {
  return get<Progress>(`progress:${id}`, store)
}

async function localCards(): Promise<Card[]> {
  return (await get<Card[]>('cards', store)) ?? []
}

// --- öffentliche Funktionen ---

export async function listBooks(): Promise<BookMeta[]> {
  return sortBooks(userId ? await cloud.cloudListBooks() : await localBooks())
}

export async function getBook(id: string): Promise<{ meta: BookMeta; markdown: string } | undefined> {
  const meta = (await listBooks()).find((b) => b.id === id)
  if (!meta) return undefined
  let markdown = await get<string>(`book:${id}`, store)
  if (markdown === undefined && userId) {
    markdown = await cloud.cloudDownloadBook(userId, id)
    await set(`book:${id}`, markdown, store)
  }
  return markdown === undefined ? undefined : { meta, markdown }
}

export async function addBook(meta: BookMeta, markdown: string): Promise<void> {
  await set(`book:${meta.id}`, markdown, store)
  if (userId) {
    await cloud.cloudAddBook(userId, meta, markdown)
    return
  }
  const books = await localBooks()
  await set('books', [...books.filter((b) => b.id !== meta.id), meta], store)
}

export async function touchBook(id: string): Promise<void> {
  if (userId) return cloud.cloudTouchBook(id)
  const books = await localBooks()
  await set(
    'books',
    books.map((b) => (b.id === id ? { ...b, lastRead: Date.now() } : b)),
    store,
  )
}

export async function deleteBook(id: string): Promise<void> {
  if (userId) await cloud.cloudDeleteBook(userId, id)
  const books = await localBooks()
  await set('books', books.filter((b) => b.id !== id), store)
  await del(`book:${id}`, store)
  await del(`progress:${id}`, store)
}

export async function getProgress(id: string): Promise<Progress> {
  if (userId) return (await cloud.cloudGetProgress(id)) ?? EMPTY_PROGRESS
  return (await localProgress(id)) ?? EMPTY_PROGRESS
}

export async function saveProgress(id: string, p: Progress): Promise<void> {
  const next = { ...p, updated: Date.now() }
  if (userId) return cloud.cloudSaveProgress(userId, id, next)
  await set(`progress:${id}`, next, store)
}

export async function listCards(): Promise<Card[]> {
  return userId ? cloud.cloudListCards() : localCards()
}

export async function saveCard(card: Card): Promise<void> {
  if (userId) return cloud.cloudSaveCards(userId, [card])
  const cards = await localCards()
  await set('cards', [...cards.filter((c) => c.id !== card.id), card], store)
}

export async function deleteCard(id: string): Promise<void> {
  if (userId) return cloud.cloudDeleteCard(id)
  const cards = await localCards()
  await set('cards', cards.filter((c) => c.id !== id), store)
}

/**
 * Nach dem Anmelden: Bücher, Lesestand und Lernkarten, die bisher nur in diesem Browser lagen,
 * in Supabase übernehmen. Was dort schon ist, bleibt; beim Lesestand gewinnt der neuere.
 * Gibt die Zahl der übernommenen Bücher zurück.
 */
export async function importLocalData(): Promise<number> {
  if (!userId) return 0
  const local = await localBooks()
  const remote = new Set((await cloud.cloudListBooks()).map((b) => b.id))
  let imported = 0
  for (const meta of local) {
    if (!remote.has(meta.id)) {
      const markdown = await get<string>(`book:${meta.id}`, store)
      if (markdown === undefined) continue
      await cloud.cloudAddBook(userId, meta, markdown)
      imported++
    }
    const lp = await localProgress(meta.id)
    if (lp) {
      const rp = await cloud.cloudGetProgress(meta.id)
      if (!rp || rp.updated < lp.updated) await cloud.cloudSaveProgress(userId, meta.id, lp)
    }
  }
  const remoteCards = new Set((await cloud.cloudListCards()).map((c) => c.id))
  await cloud.cloudSaveCards(
    userId,
    (await localCards()).filter((c) => !remoteCards.has(c.id)),
  )
  return imported
}

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('settings') ?? '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function storeSettings(s: Settings): void {
  try {
    localStorage.setItem('settings', JSON.stringify(s))
  } catch {
    // Einstellungen sind nur eine Annehmlichkeit
  }
}
