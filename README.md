# Ausbildungsplaner

Angular-App zur Jahres-Ausbildungsplanung einer Katastrophenschutz-Einheit.
Sie liest und schreibt die bestehende Excel-Arbeitsmappe (Blatt „Jahresplan“ und
„Offene Ideen“) – die Mappe bleibt das führende Format, die App bringt Drag & Drop,
ein aufgeräumtes Backlog, Auswertungen und Querverweise auf den KatS-Ausbildungsplan.

Läuft vollständig im Browser: kein Backend, keine Anmeldung, keine Datenübertragung
an Dritte.

## Was die App kann

- **Wochenraster als echter Scheduler** (Eigenbau auf Basis des Angular CDK, kein
  Fremd-Paket): eine Zeile je Kalenderwoche mit Kalenderwochen-Nummer und
  Datumsspanne, sieben Spalten Montag bis Sonntag. Termine lassen sich damit nicht
  nur auf den Diensttag legen, sondern auf jeden beliebigen Wochentag.
- **Der reguläre Diensttag ist einstellbar** (Werkzeugleiste → Kalender-Symbol),
  Standard ist Montag. Beim Öffnen einer Mappe (und bei „Neuer Plan“) legt die App
  für jeden Diensttag ohne Eintrag automatisch eine leere Zeile an – programmatisch
  abgesichert, dass kein Diensttag im Jahresplan fehlt. Die Zeilen werden beim
  Speichern mit in die Excel geschrieben. Ein Diensttag ohne Ausbildungsthema wird
  rot als Lücke markiert; über den Zähler „x/52 Montage belegt“ (bzw. der
  gewählte Wochentag) lässt sich der Plan auf genau diese Lücken filtern.
- **Feiertage** werden von [feiertage-api.de](https://feiertage-api.de/) geladen und im
  Plan angezeigt. Ein Diensttag, der auf einen Feiertag fällt, gilt nicht als Lücke.
- **Termine verschieben** per Drag & Drop – zwei Termine tauschen dabei ihr Datum.
- **Umbenennen und bearbeiten** über einen Dialog (Datum, Rolle, Thema, Ausbilder,
  Nachweise, Material, Anforderungen, HGM-4-Felder).
- **Offene Ideen (Backlog)**: Termine per Drag & Drop ins Backlog schieben und zurück.
  Das historisch gewachsene Ideen-Blatt wird beim Einlesen automatisch auf das Schema
  des Jahresplans vereinheitlicht.
- **Auswertungen**: Termine je Rolle, Verteilung über das Jahr, Abdeckung der
  Pflichtthemen, geplante Nachweise und Unterweisungen, offene Punkte.
- **KatS-A-Plan**: eigene Themenliste pflegen und Termine bzw. Ideen darauf verweisen
  lassen (Querverweise in beide Richtungen sichtbar).
- **Rückgängig/Wiederherstellen** (Strg+Z / Strg+Umschalt+Z), Speichern mit Strg+S.

## Feiertage

Quelle ist `https://feiertage-api.de/api/?jahr=<Jahr>&nur_land=<Land>`; das Bundesland
ist in der Werkzeugleiste umstellbar (Standard: Nordrhein-Westfalen) und wird im Browser
gemerkt. Erfolgreiche Abrufe landen im localStorage.

Ist die API nicht erreichbar – kein Netz, oder sie sendet keine CORS-Header für diese
Adresse – rechnet die App die gesetzlichen Feiertage lokal aus (Osterformel plus die
Regeln je Bundesland). Diese Rückfallebene ist bewusst eingebaut: Ohne Feiertage würde
Ostermontag fälschlich als rote Ausbildungslücke erscheinen. Welche Quelle gerade greift,
zeigt das Feiertags-Menü in der Werkzeugleiste.

Feiertage werden **nicht** in die Excel geschrieben. Sie sind aus Jahr und Bundesland
reproduzierbar; die Mappe bleibt dadurch frei von generierten Zeilen.

## Datenquellen

Die Persistenz ist hinter `WorkbookStorage` (`src/app/storage/`) abstrahiert. Aktuell
gibt es zwei Implementierungen:

| Quelle                 | Lesen                           | Schreiben                                                                      |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| **Lokale Excel-Datei** | Datei-Dialog oder Datei-Auswahl | direkt in dieselbe Datei (File System Access API, Chrome/Edge), sonst Download |
| **NextCloud (WebDAV)** | `GET` auf den Dateipfad         | `PUT` auf denselben Pfad                                                       |

NextCloud unterstützt zwei Zugänge: Benutzerkonto mit App-Passwort
(`/remote.php/dav/files/<benutzer>/<pfad>`) oder öffentlicher Freigabelink
(`/public.php/webdav/<pfad>`, Token als Benutzername).

> **Hinweis zu NextCloud und CORS:** Der Browser blockiert WebDAV-Anfragen an eine
> fremde Origin, solange die NextCloud keine passenden `Access-Control-Allow-Origin`-
> Header sendet. Für den Betrieb unter GitHub Pages muss die Instanz das entsprechend
> konfigurieren (oder hinter einem Reverse Proxy derselben Origin liegen).

Weitere Quellen (S3, SharePoint, …) lassen sich ergänzen, indem `WorkbookStorage`
implementiert wird – die Views und der Zustand müssen dafür nicht angefasst werden.

## Excel-Format

Beim Speichern schreibt die App drei Blätter:

1. **`Jahresplan <Jahr>`** – Überschrift, Kopfzeile, ein Termin je Zeile. Datum als
   echtes Datum (`DD.MM.YYYY`), Kreuzchenspalten als `X`, Autofilter gesetzt.
2. **`Offene Ideen`** – dieselben Spalten wie der Jahresplan, ohne Datum und Tag.
3. **`KatS-A-Plan`** – `Nr.`, `Titel`, `Pflicht`, `Beschreibung`.

Beim Einlesen werden Kopfzeilen anhand ihrer Beschriftung erkannt (auch mit
Zeilenumbrüchen und abweichender Spaltenreihenfolge). Für „Offene Ideen“ werden
zusätzlich die beiden Alt-Layouts der bisherigen Mappe erkannt und vereinheitlicht.
Existiert kein `KatS-A-Plan`-Blatt, wird die Themenliste aus der Spalte
„KatS-A-plan Titel“ aufgebaut.

## Entwicklung

```bash
npm install
npm start          # Dev-Server auf http://localhost:4200
npm test           # Unit-Tests (Vitest)
npm run build      # Produktions-Build nach dist/ausbildungs-planer
npm run format     # Prettier über src/
```

## Deployment (GitHub Pages)

Ein Push auf `main` baut und veröffentlicht die App über
`.github/workflows/deploy.yml`. Voraussetzung: unter _Settings → Pages_ muss als
Quelle **GitHub Actions** eingestellt sein.

Alternativ manuell aus dem Arbeitsverzeichnis:

```bash
npm run deploy     # angular-cli-ghpages, Branch gh-pages
```

Die App nutzt Hash-Routing (`/#/`), damit Deep Links ohne Server-Rewrites funktionieren.
