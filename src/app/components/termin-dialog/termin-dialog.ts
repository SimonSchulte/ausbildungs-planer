import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { KATEGORIEN, NACHWEISE, NachweisKey, Termin, leererTermin } from '../../models/plan.model';
import { PlanStore } from '../../services/plan-store';

export interface TerminDialogDaten {
  /** Vorhandenen Eintrag bearbeiten … */
  terminId?: string;
  /** … oder einen neuen für dieses Datum anlegen (`null` = neue Idee). */
  datum?: string | null;
}

/** Bearbeitet einen Termin oder eine Idee – dasselbe Formular für beide. */
@Component({
  selector: 'app-termin-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  templateUrl: './termin-dialog.html',
  styleUrl: './termin-dialog.less',
})
export class TerminDialog {
  private readonly store = inject(PlanStore);
  private readonly dialogRef = inject(MatDialogRef<TerminDialog>);
  private readonly daten = inject<TerminDialogDaten>(MAT_DIALOG_DATA);

  readonly kategorien = KATEGORIEN;
  readonly nachweise = NACHWEISE;
  readonly katsThemen = this.store.katsThemen;

  private readonly vorhanden = this.daten.terminId
    ? this.store.terminNachId(this.daten.terminId)
    : undefined;

  readonly istNeu = this.vorhanden === undefined;
  readonly entwurf = signal<Termin>(
    this.vorhanden ? structuredClone(this.vorhanden) : leererTermin(this.daten.datum ?? null),
  );
  readonly istIdee = computed(() => this.entwurf().datum === null);
  readonly kannAlsKatsThema = computed(() => {
    const e = this.entwurf();
    return !e.katsThemaId && (e.katsTitel.trim() || e.thema.trim()).length > 0;
  });

  setze<K extends keyof Termin>(feld: K, wert: Termin[K]): void {
    this.entwurf.update((e) => ({ ...e, [feld]: wert }));
  }

  hatNachweis(key: NachweisKey): boolean {
    return this.entwurf().nachweise.includes(key);
  }

  schalteNachweis(key: NachweisKey, aktiv: boolean): void {
    this.entwurf.update((e) => ({
      ...e,
      nachweise: aktiv ? [...e.nachweise, key] : e.nachweise.filter((n) => n !== key),
    }));
  }

  waehleKatsThema(id: string | null): void {
    const thema = this.katsThemen().find((t) => t.id === id);
    this.entwurf.update((e) => ({
      ...e,
      katsThemaId: thema?.id ?? null,
      katsTitel: thema?.titel ?? e.katsTitel,
      katsPflicht: thema ? true : e.katsPflicht,
    }));
  }

  /** Legt den aktuellen Titel als neues KatS-Thema an und verknüpft ihn sofort. */
  alsKatsThemaAnlegen(): void {
    const e = this.entwurf();
    const titel = (e.katsTitel || e.thema).replace(/\s+/g, ' ').trim();
    if (!titel) {
      return;
    }
    const id = this.store.neuesKatsThema({ titel });
    this.waehleKatsThema(id);
  }

  speichern(): void {
    const entwurf = this.entwurf();
    if (this.istNeu) {
      this.store.fuegeTerminEin(entwurf);
    } else {
      const { id, ...aenderung } = entwurf;
      this.store.aktualisiereTermin(id, aenderung);
    }
    this.dialogRef.close(true);
  }
}
