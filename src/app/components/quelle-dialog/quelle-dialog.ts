import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { LokaleDateiStorage, unterstuetztDateiZugriff } from '../../storage/lokale-datei.storage';
import {
  NextcloudKonfiguration,
  NextcloudStorage,
  leereNextcloudKonfiguration,
} from '../../storage/nextcloud.storage';
import { NextcloudWorkerStorage } from '../../storage/nextcloud-worker.storage';
import { WorkbookStorage } from '../../storage/workbook-storage';

const SPEICHER_SCHLUESSEL = 'ausbildungsplaner.nextcloud';

/**
 * Auswahl der Datenquelle. Jede Registerkarte erzeugt lediglich ein
 * `WorkbookStorage` – die App verarbeitet danach alle Quellen gleich.
 */
@Component({
  selector: 'app-quelle-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTabsModule,
  ],
  templateUrl: './quelle-dialog.html',
  styleUrl: './quelle-dialog.less',
})
export class QuelleDialog {
  private readonly dialogRef = inject(MatDialogRef<QuelleDialog, WorkbookStorage>);

  readonly dateiZugriff = unterstuetztDateiZugriff();
  readonly fehler = signal('');
  readonly konfig = signal<NextcloudKonfiguration>(ladeKonfiguration());
  readonly merken = signal(hatGespeicherteKonfiguration());

  setze<K extends keyof NextcloudKonfiguration>(feld: K, wert: NextcloudKonfiguration[K]): void {
    this.konfig.update((k) => ({ ...k, [feld]: wert }));
  }

  dateiGewaehlt(event: Event): void {
    const datei = (event.target as HTMLInputElement).files?.[0];
    if (datei) {
      this.dialogRef.close(LokaleDateiStorage.ausDatei(datei));
    }
  }

  async dateiOeffnen(): Promise<void> {
    this.fehler.set('');
    try {
      this.dialogRef.close(await LokaleDateiStorage.auswaehlen());
    } catch (ursache) {
      if ((ursache as DOMException)?.name !== 'AbortError') {
        this.fehler.set(meldung(ursache));
      }
    }
  }

  nextcloudVerbinden(): void {
    this.fehler.set('');
    try {
      const storage: WorkbookStorage =
        this.konfig().modus === 'worker'
          ? new NextcloudWorkerStorage(this.konfig())
          : new NextcloudStorage(this.konfig());
      speichereKonfiguration(this.merken() ? this.konfig() : null);
      this.dialogRef.close(storage);
    } catch (ursache) {
      this.fehler.set(meldung(ursache));
    }
  }
}

function meldung(ursache: unknown): string {
  return ursache instanceof Error ? ursache.message : String(ursache);
}

function ladeKonfiguration(): NextcloudKonfiguration {
  try {
    const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
    return roh
      ? { ...leereNextcloudKonfiguration(), ...(JSON.parse(roh) as NextcloudKonfiguration) }
      : leereNextcloudKonfiguration();
  } catch {
    return leereNextcloudKonfiguration();
  }
}

function hatGespeicherteKonfiguration(): boolean {
  try {
    return localStorage.getItem(SPEICHER_SCHLUESSEL) !== null;
  } catch {
    return false;
  }
}

function speichereKonfiguration(konfig: NextcloudKonfiguration | null): void {
  try {
    if (konfig) {
      localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(konfig));
    } else {
      localStorage.removeItem(SPEICHER_SCHLUESSEL);
    }
  } catch {
    // Privater Modus o. Ä. – die Konfiguration bleibt dann eben flüchtig.
  }
}
