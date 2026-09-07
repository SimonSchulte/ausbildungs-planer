import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { KATEGORIEN, Termin } from '../../models/plan.model';
import { PlanStore } from '../../services/plan-store';
import { DatumDialog, DatumDialogDaten } from '../datum-dialog/datum-dialog';
import { TerminDialog, TerminDialogDaten } from '../termin-dialog/termin-dialog';
import { TerminKarte } from '../termin-karte/termin-karte';

/** "Offene Ideen" – das Backlog, aus dem Termine in den Jahresplan gezogen werden. */
@Component({
  selector: 'app-backlog-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    CdkDropList,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    TerminKarte,
  ],
  templateUrl: './backlog-panel.html',
  styleUrl: './backlog-panel.less',
})
export class BacklogPanel {
  private readonly store = inject(PlanStore);
  private readonly dialog = inject(MatDialog);

  readonly kategorien = KATEGORIEN;
  readonly suche = signal('');
  readonly filterKategorie = signal<string>('');
  readonly nurPflicht = signal(false);

  readonly katsThemaNachId = this.store.katsThemaNachId;
  readonly alle = this.store.backlog;

  readonly gefiltert = computed(() => {
    const suche = this.suche().trim().toLowerCase();
    const kategorie = this.filterKategorie();
    const nurPflicht = this.nurPflicht();
    return this.alle().filter((idee) => {
      if (kategorie && idee.kategorie !== kategorie) {
        return false;
      }
      if (nurPflicht && !idee.katsPflicht) {
        return false;
      }
      if (!suche) {
        return true;
      }
      return [idee.thema, idee.katsTitel, idee.ausbilder, idee.material]
        .join(' ')
        .toLowerCase()
        .includes(suche);
    });
  });

  readonly gefiltertAktiv = computed(() => this.gefiltert().length !== this.alle().length);

  katsThema(idee: Termin) {
    return idee.katsThemaId ? (this.katsThemaNachId().get(idee.katsThemaId) ?? null) : null;
  }

  /**
   * Ablage im Backlog: aus dem Plan gezogene Termine verlieren ihr Datum,
   * Ideen werden lediglich umsortiert.
   */
  abgelegt(event: CdkDragDrop<unknown>): void {
    const termin = event.item.data as Termin;
    if (termin.datum === null) {
      if (!this.gefiltertAktiv()) {
        this.store.sortiereBacklog(event.previousIndex, event.currentIndex);
      }
      return;
    }
    this.store.zuBacklog(termin.id);
  }

  neueIdee(): void {
    this.bearbeiten(this.store.neueIdee());
  }

  bearbeiten(id: string): void {
    this.dialog.open(TerminDialog, {
      data: { terminId: id } satisfies TerminDialogDaten,
      width: '760px',
      maxWidth: '94vw',
    });
  }

  einplanen(idee: Termin): void {
    this.dialog
      .open(DatumDialog, {
        data: { titel: 'Idee einplanen', vorgabe: null } satisfies DatumDialogDaten,
      })
      .afterClosed()
      .subscribe((datum?: string) => {
        if (datum) {
          this.store.ausBacklogAufDatum(idee.id, datum);
        }
      });
  }

  loeschen(id: string): void {
    this.store.loescheTermin(id);
  }
}
