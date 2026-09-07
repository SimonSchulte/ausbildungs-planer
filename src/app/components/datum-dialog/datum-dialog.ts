import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { heuteIso } from '../../utils/datum';

export interface DatumDialogDaten {
  titel: string;
  vorgabe?: string | null;
}

/** Kleiner Dialog zum Setzen eines Datums (neuer Termin, Idee einplanen). */
@Component({
  selector: 'app-datum-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ daten.titel }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="feld">
        <mat-label>Datum</mat-label>
        <input matInput type="date" [(ngModel)]="datum" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Abbrechen</button>
      <button matButton="filled" [disabled]="!datum()" [mat-dialog-close]="datum()">
        Übernehmen
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .feld {
      width: 240px;
      margin-top: 8px;
    }
  `,
})
export class DatumDialog {
  readonly daten = inject<DatumDialogDaten>(MAT_DIALOG_DATA);
  readonly datum = signal(this.daten.vorgabe || heuteIso());
}
