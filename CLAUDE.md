# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Keep your replies extremely concise and focus on conveying the key information. No unnecessary fluff, no long code snippets.

When working with any third-party library, look up the official documentation to ensure you are working with up-to-date information.

## Commands

```bash
npm start          # ng serve — Dev-Server auf http://localhost:4200
npm run build      # Produktions-Build → dist/ausbildungs-planer/browser
npm run build:pages # Build mit base-href für GitHub Pages
npm test           # Unit-Tests (Vitest über @angular/build:unit-test)
npm run format     # Prettier über src/
```

Einzelne Testdatei:

```bash
npx ng test --include src/app/services/plan-store.spec.ts
```

> Die Umgebung braucht npm ≥ 11 (`npx npm@11 install`); npm 10 bricht beim
> Auflösen der vitest-Peer-Abhängigkeiten ab.

## Projektkontext

Ausbildungsplaner für eine Katastrophenschutz-Einheit. Die App bildet den Jahresplan
einer bestehenden Excel-Arbeitsmappe ab und ergänzt Drag & Drop, ein aufgeräumtes
Ideen-Backlog, Auswertungen und Querverweise auf den KatS-Ausbildungsplan.
Vollständig clientseitig – kein Backend, keine Anmeldung. Läuft als statische Seite
auf GitHub Pages. Fachsprache und Oberfläche sind deutsch; Bezeichner im Code
ebenfalls (siehe _Konventionen_).

## Architektur

Eine Route (`''` → `Jahresplan`), Hash-Routing wegen GitHub Pages.

```
src/app/
  models/plan.model.ts     Domänenmodell (Termin, KatsThema, PlanDocument, NACHWEISE)
  data/kategorien.ts       Rollen-Normalisierung + Farben
  data/bundeslaender.ts    Bundesland-Codes der feiertage-api
  data/feiertage-berechnet.ts  Osterformel + Feiertagsregeln (Rückfallebene)
  data/wochentage.ts       Diensttag-Auswahlliste + Standardwert (Montag)
  utils/datum.ts           ISO ↔ Excel-Serial, Wochentag, Kalenderwochen, KW-Nummer
  storage/                 Persistenz-Abstraktion (WorkbookStorage) + Implementierungen
                            (lokale Datei, NextCloud direkt, NextCloud über Worker-Proxy)
  services/
    excel-schema.ts        Spaltenüberschriften ↔ Feldnamen, Kreuzchen-Erkennung
    excel-lesen.ts         Arbeitsmappe → PlanDocument (inkl. Aufräumen der Alt-Layouts)
    excel-schreiben.ts     PlanDocument → Arbeitsmappe (3 Blätter)
    plan-store.ts          Zustand (Signals) + Undo/Redo
    workbook.service.ts    Bindeglied Storage ↔ Store
    feiertage.service.ts   Feiertage: API → Cache → Berechnung
    diensttag.service.ts   Regulärer Ausbildungstag (Browser-Einstellung, Standard Mo)
    plan-raster.ts         Wochenraster aus Kalenderwochen, Terminen und Feiertagen
    auswertung.ts          Statistiken (reine Funktionen)
  components/              Karte, Dialoge, Seitenbereiche
  pages/jahresplan/        Hauptansicht (Toolbar, Plan, Seitenleiste)
```

### Zentrale Entscheidungen

- **Die Excel-Mappe ist das führende Format.** Es gibt kein eigenes JSON-Format;
  gespeichert wird immer eine vollständige `.xlsx`.
- **Persistenz ist abstrahiert.** Views und Store kennen nur `WorkbookStorage`
  (`laden`/`speichern` + `faehigkeiten`). Eine neue Quelle heißt: eine Klasse
  implementieren und im `QuelleDialog` anbieten – sonst nichts.
- **NextCloud direkt scheitert an CORS, wenn die Instanz keine passenden
  `Access-Control-Allow-Origin`-Header sendet – GitHub Pages kann das nicht
  reparieren (reines statisches Hosting, kein Server, der Header umschreiben
  könnte).** Deshalb gibt es zusätzlich `NextcloudWorkerStorage`
  (`src/app/storage/nextcloud-worker.storage.ts`): sie spricht statt direkt mit
  NextCloud mit einem eigenen Cloudflare Worker (`worker/`), der serverseitig
  (ohne Browser-CORS-Beschränkung) mit dem NextCloud-Freigabelink spricht und
  die Antwort mit eigenen CORS-Headern zurückgibt. Die echten NextCloud-
  Zugangsdaten liegen dabei nur als Worker-Secret, nie im Browser. Setup und
  Sicherheitshinweise: `worker/README.md`.
- **Termine und Ideen sind derselbe Typ.** `Termin.datum === null` bedeutet Backlog.
  Dadurch nutzen Jahresplan und „Offene Ideen“ dieselbe Karte, denselben Dialog und
  dasselbe Excel-Schema.
- **Alle Mutationen laufen über `PlanStore.mutiere`**, damit Undo/Redo und das
  „ungespeichert“-Kennzeichen ohne Zutun der Views funktionieren. Nie direkt am
  Signal-Zustand vorbeischreiben.
- **Der Excel-Code wird dynamisch importiert** (`await import('./excel-lesen')`),
  weil SheetJS sonst das Startbundle dominiert.
- **Der Diensttag ist konfigurierbar, nicht hartkodiert.** `DiensttagService` hält
  den regulären Ausbildungsabend (Standard Montag) als Browser-Einstellung – die
  Excel-Mappe kennt dafür kein Feld, jede Einheit tagt aber nicht zwingend
  montags. Sämtliche früher Montag-spezifische Logik (`istMontag`, `montageImJahr`
  …) ist auf einen Parameter `Wochentag` generalisiert (`wochentageImJahr`,
  `PlanSlot.istDiensttag`).
- **Jeder Diensttag bekommt eine echte Zeile.** `PlanStore.ergaenzeFehlendeDiensttage`
  legt beim Laden (und bei „Neuer Plan“) für jeden Diensttag ohne Eintrag einen
  leeren `Termin` an. Das ist bewusst keine reine Anzeigehilfe: Die Zeilen landen
  in `store.termine` und damit beim Speichern auch in der Excel – so ist
  programmatisch sichergestellt, dass kein Diensttag im Jahr fehlt, ohne dass
  jemand von Hand 52 Zeilen pflegen muss. Wiederholte Aufrufe sind idempotent
  (Prüfung über `Set` der vorhandenen Daten). Beim Wechsel des Diensttags in der
  Werkzeugleiste läuft das sofort erneut, für den neu gewählten Wochentag.
- **Der Wochenraster ist trotzdem abgeleitet, nicht gespeichert.** `baueWochenraster`
  mischt alle Kalenderwochen des Jahres, alle Termine der Mappe und alle Feiertage
  zu `WochenZeile`s mit je 7 `PlanSlot`s (Montag–Sonntag) – anders als die Excel
  (die nur Diensttage als Zeilen führt) zeigt die Ansicht **jeden** Tag, damit
  Wochen als Ganzes erkennbar sind und sich Termine auch auf andere Wochentage
  legen lassen. Rand-Tage, die ins Nachbarjahr hineinragen (falls der 1. Januar
  kein Montag ist), tragen `imJahr: false` und sind nicht interaktiv – nur zur
  Orientierung sichtbar, kein Drop-Ziel, zählen nicht in Statistiken mit. Ein
  `PlanSlot` ist eine Lücke, wenn er Diensttag ist, kein Feiertag und kein Thema
  hat – genau das wird rot markiert, egal ob der Slot ein synthetischer oder ein
  echter, leerer Termin ist.
- **Feiertage sind abgeleitet und wandern nicht in die Mappe.** Sie sind aus Jahr
  und Bundesland reproduzierbar; die Mappe bleibt damit frei von generierten
  Zeilen. Das gilt nur für Feiertage – die Diensttags-Zeilen selbst sind gewollt
  echte Daten (siehe oben).

### Wochenraster-Ansicht (Eigenbau-Scheduler)

`jahresplan.html` rendert `store` und `plan-raster` nicht mehr als Monatsliste,
sondern als ein **einziges CSS-Grid** über das ganze Jahr: eine KW-Spalte plus
sieben Wochentagsspalten (Mo–So), eine Zeile je Kalenderwoche. Monatswechsel
erscheinen als schmale Markerzeile (`istMonatswechsel`), Wochentags- und
KW-Kopf sind `position: sticky`. Bewusst kein Fremd-Scheduler (angular-calendar,
FullCalendar, …) – siehe die Bewertung im Session-Verlauf: keine der geprüften
Bibliotheken passte zu zoneless + zwei Diensttag-Zeilen pro Woche, ohne das
bestehende CDK-Drag-&-Drop komplett umzubauen.

Jede Zelle (`.tag-zelle`) zeigt entweder gestapelte `app-termin-karte[kompakt]`
(eine `cdkDropList` je Termin, wie zuvor) oder – wenn leer – `app-leerer-tag`.
Der `kompakt`-Modus von `TerminKarte` blendet Datum/Tag aus (die Zellposition
trägt das schon) und kürzt Platzhaltertexte („Ausbildung fehlt“ → „fehlt“ +
Tooltip), damit eine ~90–140px schmale Spalte reicht.

**Mobil (`@media (max-width: 780px)` in `jahresplan.less`):** Plan und
Seitenleiste passen nicht mehr nebeneinander, deshalb zeigt `Jahresplan` nur
eine der beiden Ansichten – gesteuert über das Signal `mobilAnsicht` (`'plan'
| 'liste'`) und `[hidden]` auf `.plan`/`.seitenleiste`. Eine neue `.mobil-nav`
(nur per Media Query sichtbar) schaltet um. Wichtige Falle dabei: `[hidden]`
hat dieselbe CSS-Spezifität wie eine einzelne Klasse – `.plan { display: flex
}` würde das Attribut sonst überschreiben. Die Regel `.plan[hidden],
.seitenleiste[hidden] { display: none }` (zwei Selektoren = höhere Spezifität)
steht deshalb **innerhalb** der Media Query, nicht global, sonst bliebe die
Seitenleiste auch auf Desktop-Breite unsichtbar. Das Wochenraster selbst wird
auf Mobil nicht umgebaut, sondern bleibt horizontal scrollbar
(`.raster-bereich { overflow: auto }`) – Kompromiss, kein Tages-Agenda-Ansicht.

### Drag & Drop (Angular CDK)

`cdkDropListGroup` umschließt Plan und Seitenleiste. Jede Termin-Karte im Plan ist
eine **eigene** `cdkDropList` mit genau einem Element – nur so ist „auf diesen Termin
ziehen“ eindeutig. Die Quelle wird nicht über Container ermittelt, sondern über
`termin.datum === null`:

| Zug                    | Wirkung                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| Termin → Termin        | beide tauschen ihr Datum (`tauscheDatum`)                          |
| Termin → leerer Tag    | Termin bekommt das Datum (`verschiebeAufDatum`)                    |
| Idee → leerer Tag      | Idee wird eingeplant (`ausBacklogAufDatum`)                        |
| Idee → belegter Termin | Idee übernimmt das Datum, der bisherige Termin wandert ins Backlog |
| Idee → freier Slot     | Slot wird befüllt, ein vorhandener Hinweis bleibt am Datum         |
| Termin → Backlog       | Termin verliert sein Datum (`zuBacklog`)                           |
| Idee → Idee            | Umsortieren (nur ungefiltert)                                      |

### Feiertage

`FeiertagService` lädt von `https://feiertage-api.de/api/?jahr=…&nur_land=…`,
legt Treffer im localStorage ab und rechnet bei Bedarf lokal
(`data/feiertage-berechnet.ts`). Diese Rückfallebene ist **nicht optional**: Ohne
Feiertage würde Ostermontag als rote Ausbildungslücke erscheinen. Ob die API
CORS für die GitHub-Pages-Origin erlaubt, ist ungeprüft – deshalb muss die
Berechnung korrekt bleiben. Änderungen an den Feiertagsregeln gehören in
`feiertage-berechnet.spec.ts` abgesichert.

### Excel-Rundlauf

`excel-schema.ts` bildet Überschriften auf Feldnamen ab – Zeilenumbrüche, geschützte
Leerzeichen und Groß/Kleinschreibung werden dabei ignoriert. Der Reader findet die
Kopfzeile selbst (die Vorlage hat eine Titelzeile darüber).

„Offene Ideen“ gilt nur dann als bereits standardisiert, wenn es neben `Thema` auch
`Ausbilder` oder `KatS-A-plan Nr.` enthält – sonst greifen die Heuristiken für die
beiden gewachsenen Alt-Layouts (`leseAltIdee`).

Die Verknüpfung Termin ↔ KatS-Thema überlebt den Excel-Umlauf über Nummer bzw. Titel.
Deshalb zieht `aktualisiereKatsThema` einen geänderten Titel in alle verweisenden
Einträge nach – diese Invariante nicht aufweichen.

Datumszellen werden als echte Excel-Seriennummern geschrieben (`isoZuSerial`), nie als
`Date`-Objekte: Letztere würden über die Zeitzone verschoben.

## Konventionen

- **Deutsch als Codesprache.** Domänenbegriffe, Methoden und Felder sind deutsch
  (`termin`, `laden`, `zuBacklog`). Angular-APIs bleiben englisch. Neue Namen dem
  bestehenden Vokabular anpassen, nicht mischen.
- Standalone-Komponenten, `ChangeDetectionStrategy.OnPush`, **zoneless** – Zustand
  über `signal()`/`computed()`, kein `async`-Pipe-Zoo, kein `NgModule`.
- Klassennamen ohne `Component`-Suffix (`TerminKarte`, `Jahresplan`).
- Template- und Stildateien getrennt: `<name>.html`, `<name>.less`.
- Styles: LESS, Farben und Abstände ausschließlich über die CSS-Variablen aus
  `src/styles.less` (`--kat-*`, `--space-*`, `--surface-*`).
- Prettier: `printWidth: 100`, `singleQuote: true`, Angular-Parser für HTML.
  `npm run format` vor dem Commit – CI prüft mit `prettier --check`.
- Strict TypeScript inkl. `strictTemplates`, `noPropertyAccessFromIndexSignature`.

## Tests

Vitest, jsdom. Schwerpunkt liegt auf dem Excel-Rundlauf (`excel-lesen.spec.ts`),
den Plan-Operationen (`plan-store.spec.ts`), dem Wochenraster (`plan-raster.spec.ts`),
den Kalenderfunktionen (`datum.spec.ts`) und den Feiertagen (`feiertage-berechnet.spec.ts`).

**Keine echten Planungsdaten ins Repository.** Testmappen werden im Test selbst mit
`XLSX.utils.aoa_to_sheet` erzeugt; die Fixture in `excel-lesen.spec.ts` bildet die
Struktur der Originalmappe (Titelzeile, umbrochene Überschriften, beide Alt-Layouts
der Ideen) mit erfundenen Inhalten nach.

## Deployment

`.github/workflows/deploy.yml` baut bei Push auf `main` und veröffentlicht über
GitHub Pages (Quelle: GitHub Actions). Base-Href ist `/ausbildungs-planer/`; bei
Umbenennung des Repositories muss `build:pages` in `package.json` angepasst werden.
