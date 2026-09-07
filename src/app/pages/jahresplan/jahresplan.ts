import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuswertungPanel } from '../../components/auswertung-panel/auswertung-panel';
import { BacklogPanel } from '../../components/backlog-panel/backlog-panel';
import { DatumDialog, DatumDialogDaten } from '../../components/datum-dialog/datum-dialog';
import { KatsPanel } from '../../components/kats-panel/kats-panel';
import { LeererTag } from '../../components/leerer-tag/leerer-tag';
import { QuelleDialog } from '../../components/quelle-dialog/quelle-dialog';
import { TerminDialog, TerminDialogDaten } from '../../components/termin-dialog/termin-dialog';
import { TerminKarte } from '../../components/termin-karte/termin-karte';
import { BUNDESLAENDER, BundeslandCode } from '../../data/bundeslaender';
import { WOCHENTAG_OPTIONEN, diensttagName } from '../../data/wochentage';
import { Termin, leeresDocument } from '../../models/plan.model';
import { DiensttagService } from '../../services/diensttag.service';
import { FeiertagService } from '../../services/feiertage.service';
import { PlanSlot, WochenZeile, baueWochenraster } from '../../services/plan-raster';
import { PlanStore } from '../../services/plan-store';
import { WorkbookService } from '../../services/workbook.service';
import { herunterladen } from '../../storage/lokale-datei.storage';
import { WorkbookStorage } from '../../storage/workbook-storage';
import {
  MONATSNAMEN,
  WOCHENTAGE_ISO,
  Wochentag,
  formatiereDatum,
  heuteIso,
  monatIndex,
} from '../../utils/datum';

/** Hauptansicht: Wochenraster links, Ideen/Auswertung/KatS-A-Plan rechts. */
@Component({
  selector: 'app-jahresplan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AuswertungPanel,
    BacklogPanel,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    KatsPanel,
    LeererTag,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTabsModule,
    MatToolbarModule,
    MatTooltipModule,
    TerminKarte,
  ],
  templateUrl: './jahresplan.html',
  styleUrl: './jahresplan.less',
  host: {
    '(window:keydown)': 'tastendruck($event)',
    '(window:beforeunload)': 'vorVerlassen($event)',
  },
})
export class Jahresplan {
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  readonly store = inject(PlanStore);
  readonly workbook = inject(WorkbookService);
  readonly feiertage = inject(FeiertagService);
  readonly diensttagService = inject(DiensttagService);

  readonly bundeslaender = BUNDESLAENDER;
  readonly wochentagOptionen = WOCHENTAG_OPTIONEN;
  readonly wochentageIso = WOCHENTAGE_ISO;
  readonly ziel = this.workbook.ziel;
  readonly beschaeftigt = this.workbook.beschaeftigt;

  readonly suche = signal('');
  readonly nurLuecken = signal(false);
  /** Nur auf schmalen Bildschirmen relevant: Plan und Seitenleiste teilen sich dort den Platz. */
  readonly mobilAnsicht = signal<'plan' | 'liste'>('plan');

  readonly quelleBeschreibung = computed(() => this.ziel()?.bezeichnung ?? 'Keine Quelle geöffnet');
  readonly kannSpeichern = computed(() => this.ziel() !== null);
  readonly direktesSpeichern = computed(() => this.ziel()?.faehigkeiten.direktesSpeichern ?? false);
  readonly diensttagLabel = computed(() => diensttagName(this.diensttagService.wochentag()));

  /** Vollständiges Wochenraster: jede Kalenderwoche mit allen 7 Tagen. */
  readonly wochen = computed<WochenZeile[]>(() =>
    baueWochenraster(
      this.store.jahr(),
      this.store.termine(),
      this.feiertage.feiertage(),
      this.diensttagService.wochentag(),
    ),
  );

  /**
   * Diensttage im Plan-Jahr. Das Wochenraster zeigt an den Rändern auch ein paar
   * Tage des Nachbarjahres (vollständige Wochenzeilen) – die zählen hier nicht
   * mit, sonst käme z. B. ein Jahr mit 52 Montagen fälschlich auf 53.
   */
  readonly diensttagSlots = computed<PlanSlot[]>(() =>
    this.wochen()
      .flatMap((w) => w.tage)
      .filter((s) => s.istDiensttag && s.imJahr),
  );
  readonly luecken = computed(() => this.diensttagSlots().filter((s) => s.luecke));
  readonly belegteDiensttage = computed(() => this.diensttagSlots().length - this.luecken().length);

  readonly sichtbareWochen = computed<WochenZeile[]>(() => {
    const suche = this.suche().trim().toLowerCase();
    const nurLuecken = this.nurLuecken();
    return this.wochen().filter((woche) => {
      if (nurLuecken && woche.luecken === 0) {
        return false;
      }
      if (!suche) {
        return true;
      }
      return woche.tage.some((slot) =>
        slot.termine.some((t) =>
          [t.thema, t.hinweis, t.ausbilder, t.katsTitel, t.kategorie]
            .join(' ')
            .toLowerCase()
            .includes(suche),
        ),
      );
    });
  });

  constructor() {
    // Die Feiertage hängen am Jahr des Plans und am gewählten Bundesland.
    effect(() => {
      this.feiertage.bundesland();
      void this.feiertage.lade(this.store.jahr());
    });
  }

  katsThema(termin: Termin) {
    return termin.katsThemaId
      ? (this.store.katsThemaNachId().get(termin.katsThemaId) ?? null)
      : null;
  }

  setzeBundesland(land: BundeslandCode): void {
    this.feiertage.setzeBundesland(land);
  }

  /** Wechselt den Diensttag und ergänzt sofort dessen fehlende Zeilen im Store. */
  setzeDiensttag(wochentag: Wochentag): void {
    this.diensttagService.setze(wochentag);
    const ergaenzt = this.store.ergaenzeFehlendeDiensttage(wochentag);
    if (ergaenzt) {
      this.melde(`${ergaenzt} fehlende(r) ${diensttagName(wochentag)} als Zeilen ergänzt.`);
    }
  }

  /** Kurzes Datum ohne Jahr, für die Wochenkopfzeile (z. B. „05.01.“). */
  formatKurz(iso: string): string {
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
  }

  monatsName(woche: WochenZeile): string {
    const ersterTagImJahr = woche.tage.find((t) => t.imJahr)?.datum ?? woche.start;
    return MONATSNAMEN[monatIndex(ersterTagImJahr)];
  }

  istMonatswechsel(index: number): boolean {
    const wochen = this.sichtbareWochen();
    return index === 0 || this.monatsName(wochen[index]) !== this.monatsName(wochen[index - 1]);
  }

  // ------------------------------------------------------------ Drag & Drop

  /**
   * Ablage auf einem Termin. Aus dem Plan gezogene Termine tauschen ihr Datum,
   * aus den Ideen gezogene Einträge übernehmen den Platz (der bisherige Termin
   * wandert dafür in die Ideen).
   */
  aufTerminAbgelegt(event: CdkDragDrop<unknown>, ziel: Termin): void {
    const gezogen = event.item.data as Termin;
    if (gezogen.id === ziel.id) {
      return;
    }
    if (gezogen.datum === null) {
      this.store.ausBacklogAufTermin(gezogen.id, ziel.id);
      this.melde(`„${kurz(gezogen.thema)}“ auf ${formatiereDatum(ziel.datum!)} eingeplant.`);
    } else {
      this.store.tauscheDatum(gezogen.id, ziel.id);
    }
  }

  /** Ablage auf einem Tag ohne Eintrag – der Zug belegt das Datum einfach. */
  aufLeeremTagAbgelegt(event: CdkDragDrop<unknown>, datum: string): void {
    const gezogen = event.item.data as Termin;
    if (gezogen.datum === null) {
      this.store.ausBacklogAufDatum(gezogen.id, datum);
    } else {
      this.store.verschiebeAufDatum(gezogen.id, datum);
    }
    this.melde(`„${kurz(gezogen.thema)}“ auf ${formatiereDatum(datum)} gelegt.`);
  }

  // ----------------------------------------------------------------- Termine

  neuerTermin(): void {
    this.dialog
      .open(DatumDialog, {
        data: { titel: 'Neuer Termin', vorgabe: heuteIso() } satisfies DatumDialogDaten,
      })
      .afterClosed()
      .subscribe((datum?: string) => {
        if (datum) {
          this.terminAnlegen(datum);
        }
      });
  }

  terminAnlegen(datum: string): void {
    this.oeffneDialog({ datum });
  }

  bearbeiten(id: string): void {
    this.oeffneDialog({ terminId: id });
  }

  private oeffneDialog(daten: TerminDialogDaten): void {
    this.dialog.open(TerminDialog, { data: daten, width: '760px', maxWidth: '94vw' });
  }

  zuBacklog(termin: Termin): void {
    this.store.zuBacklog(termin.id);
    this.melde(`„${kurz(termin.thema || termin.hinweis)}“ in die offenen Ideen verschoben.`);
  }

  loeschen(id: string): void {
    this.store.loescheTermin(id);
  }

  // --------------------------------------------------------------- Persistenz

  oeffnen(): void {
    this.dialog
      .open(QuelleDialog, { width: '600px', maxWidth: '94vw' })
      .afterClosed()
      .subscribe(async (storage?: WorkbookStorage) => {
        if (!storage) {
          return;
        }
        try {
          const { meldungen } = await this.workbook.laden(storage);
          const luecken = this.luecken().length;
          const hinweis = luecken
            ? ` ${luecken} ${this.diensttagLabel()}(e) ohne Ausbildung sind rot markiert.`
            : ` Alle ${this.diensttagLabel()}e sind belegt.`;
          this.melde((meldungen.join(' ') || 'Arbeitsmappe geladen.') + hinweis, 9000);
        } catch (ursache) {
          this.melde(fehlertext(ursache), 10000, true);
        }
      });
  }

  neuerPlan(): void {
    if (this.store.ungespeichert() && !confirm('Ungespeicherte Änderungen verwerfen?')) {
      return;
    }
    this.workbook.neuesDokument(leeresDocument());
  }

  async speichern(): Promise<void> {
    if (!this.kannSpeichern()) {
      await this.herunterladen();
      return;
    }
    try {
      await this.workbook.speichern();
      this.melde(
        this.direktesSpeichern()
          ? 'Gespeichert.'
          : 'Arbeitsmappe heruntergeladen – bitte am Ablageort ersetzen.',
      );
    } catch (ursache) {
      this.melde(fehlertext(ursache), 10000, true);
    }
  }

  async herunterladen(): Promise<void> {
    const { daten, dateiname } = await this.workbook.exportieren();
    herunterladen(daten, dateiname);
    this.store.alsGespeichertMarkieren();
  }

  async neuLaden(): Promise<void> {
    if (this.store.ungespeichert() && !confirm('Ungespeicherte Änderungen verwerfen?')) {
      return;
    }
    try {
      const { meldungen } = await this.workbook.neuLaden();
      this.melde(meldungen.length ? meldungen.join(' ') : 'Neu geladen.');
    } catch (ursache) {
      this.melde(fehlertext(ursache), 10000, true);
    }
  }

  // --------------------------------------------------------------- Sonstiges

  tastendruck(event: KeyboardEvent): void {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    const taste = event.key.toLowerCase();
    if (taste === 's') {
      event.preventDefault();
      void this.speichern();
    } else if (taste === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.store.rueckgaengig();
    } else if ((taste === 'z' && event.shiftKey) || taste === 'y') {
      event.preventDefault();
      this.store.wiederholen();
    }
  }

  vorVerlassen(event: BeforeUnloadEvent): void {
    if (this.store.ungespeichert()) {
      event.preventDefault();
    }
  }

  private melde(text: string, dauer = 5000, fehler = false): void {
    this.snackBar.open(text, 'OK', {
      duration: dauer,
      panelClass: fehler ? 'fehler-snack' : undefined,
    });
  }
}

function kurz(text: string): string {
  const einzeilig = text.replace(/\s+/g, ' ').trim();
  return einzeilig.length > 42 ? `${einzeilig.slice(0, 40)}…` : einzeilig || 'Eintrag';
}

function fehlertext(ursache: unknown): string {
  return ursache instanceof Error ? ursache.message : String(ursache);
}
