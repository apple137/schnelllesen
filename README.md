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

## Speicher

Version 1 speichert Bücher, Lesestand und Lernkarten im Browser (IndexedDB). Der Zugriff läuft über `src/lib/storage.ts`, damit dort später Supabase für die Synchronisation über mehrere Geräte eingesetzt werden kann.

## Entwicklung

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Unit-Tests (vitest)
npm run build    # Produktions-Build nach dist/
```

## Veröffentlichen

Gedacht für [Vercel](https://vercel.com): Repository importieren, Framework „Vite“ wird erkannt. `vercel.json` leitet alle Pfade auf `index.html`, damit `/lesen/<buch>` direkt aufrufbar ist.
