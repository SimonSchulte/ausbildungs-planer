import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { QuelleDialog } from '../../components/quelle-dialog/quelle-dialog';
import { TerminDialog, TerminDialogDaten } from '../../components/termin-dialog/termin-dialog';
import { TerminKarte } from '../../components/termin-karte/termin-karte';
import { Termin, leeresDocument } from '../../models/plan.model';
import { PlanStore } from '../../services/plan-store';
import { WorkbookService } from '../../services/workbook.service';
import { herunterladen } from '../../storage/lokale-datei.storage';
import { WorkbookStorage } from '../../storage/workbook-storage';
import { formatiereDatum, heuteIso } from '../../utils/datum';

/** Hauptansicht: Jahresplan links, Ideen/Auswertung/KatS-A-Plan rechts. */
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

  readonly monate = this.store.monate;
  readonly ziel = this.workbook.ziel;
  readonly beschaeftigt = this.workbook.beschaeftigt;

  readonly suche = signal('');
  readonly quelleBeschreibung = computed(() => this.ziel()?.bezeichnung ?? 'Keine Quelle geöffnet');
  readonly kannSpeichern = computed(() => this.ziel() !== null);
  readonly direktesSpeichern = computed(() => this.ziel()?.faehigkeiten.direktesSpeichern ?? false);

  readonly sichtbareMonate = computed(() => {
    const suche = this.suche().trim().toLowerCase();
    if (!suche) {
      return this.monate();
    }
    return this.monate()
      .map((monat) => ({
        ...monat,
        termine: monat.termine.filter((t) =>
          [t.thema, t.hinweis, t.ausbilder, t.katsTitel, t.kategorie]
            .join(' ')
            .toLowerCase()
            .includes(suche),
        ),
      }))
      .filter((monat) => monat.termine.length > 0);
  });

  katsThema(termin: Termin) {
    return termin.katsThemaId
      ? (this.store.katsThemaNachId().get(termin.katsThemaId) ?? null)
      : null;
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

  // ----------------------------------------------------------------- Termine

  neuerTermin(): void {
    this.dialog
      .open(DatumDialog, {
        data: { titel: 'Neuer Termin', vorgabe: heuteIso() } satisfies DatumDialogDaten,
      })
      .afterClosed()
      .subscribe((datum?: string) => {
        if (datum) {
          this.bearbeiten(this.store.neuerTermin(datum));
        }
      });
  }

  bearbeiten(id: string): void {
    this.dialog.open(TerminDialog, {
      data: { terminId: id } satisfies TerminDialogDaten,
      width: '760px',
      maxWidth: '94vw',
    });
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
          this.melde(meldungen.length ? meldungen.join(' ') : 'Arbeitsmappe geladen.', 8000);
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
