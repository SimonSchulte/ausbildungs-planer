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
ebenfalls (siehe *Konventionen*).

## Architektur

Eine Route (`''` → `Jahresplan`), Hash-Routing wegen GitHub Pages.

```
src/app/
  models/plan.model.ts     Domänenmodell (Termin, KatsThema, PlanDocument, NACHWEISE)
  data/kategorien.ts       Rollen-Normalisierung + Farben
  data/bundeslaender.ts    Bundesland-Codes der feiertage-api
  data/feiertage-berechnet.ts  Osterformel + Feiertagsregeln (Rückfallebene)
  utils/datum.ts           ISO ↔ Excel-Serial, Wochentag, Montage eines Jahres
  storage/                 Persistenz-Abstraktion (WorkbookStorage) + Implementierungen
  services/
    excel-schema.ts        Spaltenüberschriften ↔ Feldnamen, Kreuzchen-Erkennung
    excel-lesen.ts         Arbeitsmappe → PlanDocument (inkl. Aufräumen der Alt-Layouts)
    excel-schreiben.ts     PlanDocument → Arbeitsmappe (3 Blätter)
    plan-store.ts          Zustand (Signals) + Undo/Redo
    workbook.service.ts    Bindeglied Storage ↔ Store
    feiertage.service.ts   Feiertage: API → Cache → Berechnung
    plan-raster.ts         Jahresraster aus Montagen, Terminen und Feiertagen
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
- **Termine und Ideen sind derselbe Typ.** `Termin.datum === null` bedeutet Backlog.
  Dadurch nutzen Jahresplan und „Offene Ideen“ dieselbe Karte, denselben Dialog und
  dasselbe Excel-Schema.
- **Alle Mutationen laufen über `PlanStore.mutiere`**, damit Undo/Redo und das
  „ungespeichert“-Kennzeichen ohne Zutun der Views funktionieren. Nie direkt am
  Signal-Zustand vorbeischreiben.
- **Der Excel-Code wird dynamisch importiert** (`await import('./excel-lesen')`),
  weil SheetJS sonst das Startbundle dominiert.
- **Das Jahresraster ist abgeleitet, nicht gespeichert.** `baueRaster` mischt alle
  Montage des Jahres, alle Termine der Mappe und alle Feiertage zu `PlanSlot`s.
  Dadurch ist jeder Montag sichtbar, ohne dass leere Zeilen in die Excel wandern.
  Ein `PlanSlot` ist eine Lücke, wenn er Montag ist, kein Feiertag und kein Thema
  hat – genau das wird rot markiert.
- **Feiertage sind abgeleitet und wandern nicht in die Mappe.** Sie sind aus Jahr
  und Bundesland reproduzierbar; die Mappe bleibt damit frei von generierten Zeilen.

### Drag & Drop (Angular CDK)

`cdkDropListGroup` umschließt Plan und Seitenleiste. Jede Termin-Karte im Plan ist
eine **eigene** `cdkDropList` mit genau einem Element – nur so ist „auf diesen Termin
ziehen“ eindeutig. Die Quelle wird nicht über Container ermittelt, sondern über
`termin.datum === null`:

| Zug | Wirkung |
|---|---|
| Termin → Termin | beide tauschen ihr Datum (`tauscheDatum`) |
| Termin → leerer Tag | Termin bekommt das Datum (`verschiebeAufDatum`) |
| Idee → leerer Tag | Idee wird eingeplant (`ausBacklogAufDatum`) |
| Idee → belegter Termin | Idee übernimmt das Datum, der bisherige Termin wandert ins Backlog |
| Idee → freier Slot | Slot wird befüllt, ein vorhandener Hinweis bleibt am Datum |
| Termin → Backlog | Termin verliert sein Datum (`zuBacklog`) |
| Idee → Idee | Umsortieren (nur ungefiltert) |

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
den Plan-Operationen (`plan-store.spec.ts`), dem Jahresraster (`plan-raster.spec.ts`)
und den Feiertagen (`feiertage-berechnet.spec.ts`).

**Keine echten Planungsdaten ins Repository.** Testmappen werden im Test selbst mit
`XLSX.utils.aoa_to_sheet` erzeugt; die Fixture in `excel-lesen.spec.ts` bildet die
Struktur der Originalmappe (Titelzeile, umbrochene Überschriften, beide Alt-Layouts
der Ideen) mit erfundenen Inhalten nach.

## Deployment

`.github/workflows/deploy.yml` baut bei Push auf `main` und veröffentlicht über
GitHub Pages (Quelle: GitHub Actions). Base-Href ist `/ausbildungs-planer/`; bei
Umbenennung des Repositories muss `build:pages` in `package.json` angepasst werden.
