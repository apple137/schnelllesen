// Speicher für Bücher, Lesestand und Lernkarten.
// Version 1 speichert im Browser (IndexedDB). Die Funktionen sind so geschnitten,
// dass später Supabase dahinter gesetzt werden kann, ohne die Seiten zu ändern.

import { createStore, del, get, set } from 'idb-keyval'
import type { Card } from './cards'

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

export async function listBooks(): Promise<BookMeta[]> {
  const books = (await get<BookMeta[]>('books', store)) ?? []
  return books.sort((a, b) => (b.lastRead ?? b.added) - (a.lastRead ?? a.added))
}

export async function getBook(id: string): Promise<{ meta: BookMeta; markdown: string } | undefined> {
  const books = await listBooks()
  const meta = books.find((b) => b.id === id)
  const markdown = await get<string>(`book:${id}`, store)
  if (!meta || markdown === undefined) return undefined
  return { meta, markdown }
}

export async function addBook(meta: BookMeta, markdown: string): Promise<void> {
  await set(`book:${meta.id}`, markdown, store)
  const books = await listBooks()
  await set('books', [...books.filter((b) => b.id !== meta.id), meta], store)
}

export async function touchBook(id: string): Promise<void> {
  const books = await listBooks()
  await set(
    'books',
    books.map((b) => (b.id === id ? { ...b, lastRead: Date.now() } : b)),
    store,
  )
}

export async function deleteBook(id: string): Promise<void> {
  const books = await listBooks()
  await set('books', books.filter((b) => b.id !== id), store)
  await del(`book:${id}`, store)
  await del(`progress:${id}`, store)
}

export async function getProgress(id: string): Promise<Progress> {
  return (await get<Progress>(`progress:${id}`, store)) ?? { pos: 0, recalled: [], previewed: [], updated: 0 }
}

export async function saveProgress(id: string, p: Progress): Promise<void> {
  await set(`progress:${id}`, { ...p, updated: Date.now() }, store)
}

export async function listCards(): Promise<Card[]> {
  return (await get<Card[]>('cards', store)) ?? []
}

export async function saveCard(card: Card): Promise<void> {
  const cards = await listCards()
  await set('cards', [...cards.filter((c) => c.id !== card.id), card], store)
}

export async function deleteCard(id: string): Promise<void> {
  const cards = await listCards()
  await set('cards', cards.filter((c) => c.id !== id), store)
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
