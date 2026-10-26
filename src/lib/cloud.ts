// Supabase-Speicher: Bücher (Tabelle + Datei im Bucket „books“), Lesestand und Lernkarten.

import type { Card } from './cards'
import type { BookMeta, Progress } from './storage'
import { supabase } from './supabase'

interface BookRow {
  id: string
  title: string
  word_count: number
  chapters: number
  source: 'md' | 'pdf'
  added: number
  last_read: number | null
}

interface CardRow {
  id: string
  book_id: string
  book_title: string
  front: string
  back: string
  step: number
  due: number
  created: number
}

const toMeta = (r: BookRow): BookMeta => ({
  id: r.id,
  title: r.title,
  wordCount: r.word_count,
  chapters: r.chapters,
  source: r.source,
  added: r.added,
  lastRead: r.last_read ?? undefined,
})

const toCard = (r: CardRow): Card => ({
  id: r.id,
  bookId: r.book_id,
  bookTitle: r.book_title,
  front: r.front,
  back: r.back,
  step: r.step,
  due: r.due,
  created: r.created,
})

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const filePath = (userId: string, bookId: string) => `${userId}/${bookId}.md`

export async function cloudListBooks(): Promise<BookMeta[]> {
  return (check(await supabase.from('books').select('*')) ?? []).map((r) => toMeta(r as BookRow))
}

export async function cloudAddBook(userId: string, meta: BookMeta, markdown: string): Promise<void> {
  const file = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  check(await supabase.storage.from('books').upload(filePath(userId, meta.id), file, { upsert: true, contentType: 'text/markdown' }))
  check(
    await supabase.from('books').upsert({
      id: meta.id,
      user_id: userId,
      title: meta.title,
      word_count: meta.wordCount,
      chapters: meta.chapters,
      source: meta.source,
      added: meta.added,
      last_read: meta.lastRead ?? null,
    }),
  )
}

export async function cloudDownloadBook(userId: string, bookId: string): Promise<string> {
  const blob = check(await supabase.storage.from('books').download(filePath(userId, bookId)))
  if (!blob) throw new Error('Buchdatei nicht gefunden')
  return blob.text()
}

export async function cloudTouchBook(bookId: string): Promise<void> {
  check(await supabase.from('books').update({ last_read: Date.now() }).eq('id', bookId))
}

export async function cloudDeleteBook(userId: string, bookId: string): Promise<void> {
  check(await supabase.from('books').delete().eq('id', bookId))
  check(await supabase.storage.from('books').remove([filePath(userId, bookId)]))
}

export async function cloudGetProgress(bookId: string): Promise<Progress | undefined> {
  const row = check(await supabase.from('progress').select('*').eq('book_id', bookId).maybeSingle())
  if (!row) return undefined
  return { pos: row.pos, recalled: row.recalled, previewed: row.previewed, updated: row.updated }
}

export async function cloudSaveProgress(userId: string, bookId: string, p: Progress): Promise<void> {
  check(
    await supabase.from('progress').upsert({
      user_id: userId,
      book_id: bookId,
      pos: p.pos,
      recalled: p.recalled,
      previewed: p.previewed,
      updated: p.updated,
    }),
  )
}

export async function cloudListCards(): Promise<Card[]> {
  return (check(await supabase.from('cards').select('*')) ?? []).map((r) => toCard(r as CardRow))
}

export async function cloudSaveCards(userId: string, cards: Card[]): Promise<void> {
  if (!cards.length) return
  check(
    await supabase.from('cards').upsert(
      cards.map((c) => ({
        id: c.id,
        user_id: userId,
        book_id: c.bookId,
        book_title: c.bookTitle,
        front: c.front,
        back: c.back,
        step: c.step,
        due: c.due,
        created: c.created,
      })),
    ),
  )
}

export async function cloudDeleteCard(id: string): Promise<void> {
  check(await supabase.from('cards').delete().eq('id', id))
}
