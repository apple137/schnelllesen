-- Schnelllesen: Datenbank für Login und Sync über mehrere Geräte.
-- Einmal im Supabase-Dashboard unter „SQL Editor“ einfügen und „Run“ klicken.
-- Jede Person sieht nur ihre eigenen Daten (Row Level Security).

create table if not exists public.books (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  word_count integer not null,
  chapters integer not null,
  source text not null check (source in ('md', 'pdf')),
  added bigint not null,
  last_read bigint
);

create table if not exists public.progress (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.books on delete cascade,
  pos integer not null default 0,
  recalled integer[] not null default '{}',
  previewed integer[] not null default '{}',
  updated bigint not null,
  primary key (user_id, book_id)
);

create table if not exists public.cards (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null,
  book_title text not null,
  front text not null,
  back text not null,
  step integer not null default 0,
  due bigint not null,
  created bigint not null
);

create index if not exists cards_user_due on public.cards (user_id, due);

alter table public.books enable row level security;
alter table public.progress enable row level security;
alter table public.cards enable row level security;

drop policy if exists "eigene Bücher" on public.books;
create policy "eigene Bücher" on public.books
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "eigener Lesestand" on public.progress;
create policy "eigener Lesestand" on public.progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "eigene Lernkarten" on public.cards;
create policy "eigene Lernkarten" on public.cards
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Buchtexte (Markdown) liegen im privaten Speicher-Bucket „books“ unter <user-id>/<buch-id>.md
insert into storage.buckets (id, name, public)
values ('books', 'books', false)
on conflict (id) do nothing;

drop policy if exists "eigene Buchdateien" on storage.objects;
create policy "eigene Buchdateien" on storage.objects
  for all to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);
