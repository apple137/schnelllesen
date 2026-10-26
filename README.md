# Schnelllesen

Eine Webseite zum schnelleren Lesen und besseren Behalten von Büchern.
Du lädst ein Buch als PDF (E-Book mit Text) oder Markdown hoch und liest es auf `/lesen/<buch>` mit der **8-Sync-Technik**: Wortgruppen von bis zu 8 Wörtern erscheinen im festen Takt, das Auge bleibt in der Mitte.

## Funktionen

**Lesen**
- 8-Sync-Modus (Wortgruppen 1–8 Wörter) und RSVP-Modus (ein Wort, Fixpunkt-Buchstabe rot)
- Tempo 100–1000 Wörter pro Minute; Satzenden, Absätze, lange Wörter und Zahlen bekommen mehr Zeit
- Kapitel-Auswahl, Fortschritt, Restzeit, Lesestand wird gespeichert
- Tastatur: Leertaste Start/Pause, ← → Satz zurück/vor, ↑ ↓ Tempo, M Satz merken; auf dem Handy Tippen = Start/Pause
- Hell/Dunkel/Automatisch

**Mehr behalten**
- Vorschau vor jedem Kapitel: Unterüberschriften und Kernbegriffe (Priming)
- Etappen: nach einstellbarer Zeit eine kurze Pause
- Abruf-Frage am Ende jedes Abschnitts: Kernpunkt aus dem Gedächtnis aufschreiben (Active Recall)
- Lernkarten aus den Antworten und aus gemerkten Sätzen (Lückentext), Wiederholung nach 1, 3, 7, 21 und 60 Tagen (Spaced Repetition)

**Hochladen**
- `.md` direkt, PDF wird im Browser mit pdf.js in Markdown umgewandelt (Überschriften nach Schriftgröße, Kopf-/Fußzeilen und Seitenzahlen entfernt, Silbentrennung zusammengefügt)
- Die umgewandelte `.md` lässt sich herunterladen
- Gescannte PDFs (ohne Text) werden erkannt; Texterkennung folgt später

## Speicher und Sync

- **Ohne Anmeldung** bleiben Bücher, Lesestand und Lernkarten im Browser (IndexedDB).
- **Mit Anmeldung** (E-Mail-Link, ohne Passwort) liegt alles in [Supabase](https://supabase.com) und ist auf allen Geräten gleich. Bücher, die vorher nur im Browser lagen, werden beim Anmelden übernommen. Buchtexte werden zusätzlich im Browser zwischengespeichert.
- Zugriff läuft über `src/lib/storage.ts` (lokal) und `src/lib/cloud.ts` (Supabase).

### Supabase einrichten (einmalig)

1. Im Supabase-Dashboard unter *SQL Editor* den Inhalt von [`supabase/schema.sql`](supabase/schema.sql) ausführen. Das legt die Tabellen `books`, `progress`, `cards` und den privaten Bucket `books` an, jeweils mit Row Level Security: Jede Person sieht nur ihre eigenen Daten.
2. Unter *Authentication → URL Configuration* die Vercel-Adresse als *Site URL* eintragen und die Vorschau-Adressen als *Redirect URL* erlauben (z. B. `https://*-kodi18.vercel.app/**`).
3. Projekt-URL und „publishable“-Schlüssel stehen in `src/lib/supabase.ts` und lassen sich mit `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` überschreiben. Der publishable-Schlüssel ist für den Browser gedacht und darf öffentlich sein.

## Entwicklung

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Unit-Tests (vitest)
npm run build    # Produktions-Build nach dist/
```

## Veröffentlichen

Gedacht für [Vercel](https://vercel.com): Repository importieren, Framework „Vite“ wird erkannt. `vercel.json` leitet alle Pfade auf `index.html`, damit `/lesen/<buch>` direkt aufrufbar ist.
