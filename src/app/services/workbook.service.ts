import { Injectable, inject, signal } from '@angular/core';
import { diensttagName } from '../data/wochentage';
import { PlanDocument } from '../models/plan.model';
import { StorageFehler, WorkbookStorage } from '../storage/workbook-storage';
import { DiensttagService } from './diensttag.service';
import { PlanStore } from './plan-store';

export interface LadeErgebnis {
  meldungen: string[];
}

/**
 * Bindeglied zwischen Persistenz (`WorkbookStorage`) und Zustand (`PlanStore`).
 *
 * Die Views kennen nur diesen Service; ob dahinter eine hochgeladene Datei
 * oder eine NextCloud steckt, spielt für sie keine Rolle.
 */
@Injectable({ providedIn: 'root' })
export class WorkbookService {
  private readonly store = inject(PlanStore);
  private readonly diensttag = inject(DiensttagService);

  private readonly aktivesZiel = signal<WorkbookStorage | null>(null);
  readonly ziel = this.aktivesZiel.asReadonly();
  readonly beschaeftigt = signal(false);

  async laden(storage: WorkbookStorage): Promise<LadeErgebnis> {
    this.beschaeftigt.set(true);
    try {
      const inhalt = await storage.laden();
      const { leseArbeitsmappe } = await import('./excel-lesen');
      const { dokument, meldungen } = leseArbeitsmappe(inhalt.daten);
      this.store.setzeDokument(dokument);
      this.aktivesZiel.set(storage);
      const ergaenzt = this.store.ergaenzeFehlendeDiensttage(this.diensttag.wochentag());
      return {
        meldungen: ergaenzt
          ? [
              ...meldungen,
              `${ergaenzt} fehlende(r) ${diensttagName(this.diensttag.wochentag())} als Zeilen ergänzt.`,
            ]
          : meldungen,
      };
    } finally {
      this.beschaeftigt.set(false);
    }
  }

  /** Lädt vom aktiven Ziel neu und verwirft ungespeicherte Änderungen. */
  async neuLaden(): Promise<LadeErgebnis> {
    const storage = this.aktivesZiel();
    if (!storage) {
      throw new StorageFehler('Es ist keine Quelle geöffnet.');
    }
    return this.laden(storage);
  }

  async speichern(): Promise<void> {
    const storage = this.aktivesZiel();
    if (!storage) {
      throw new StorageFehler('Es ist keine Quelle geöffnet.');
    }
    await this.speichernIn(storage);
  }

  /** Speichert den aktuellen Stand in ein beliebiges Ziel (z. B. "Kopie ablegen"). */
  async speichernIn(storage: WorkbookStorage): Promise<void> {
    this.beschaeftigt.set(true);
    try {
      const daten = await this.baueArbeitsmappe();
      await storage.speichern(daten, this.dateiname());
      if (storage === this.aktivesZiel()) {
        this.store.alsGespeichertMarkieren();
      }
    } finally {
      this.beschaeftigt.set(false);
    }
  }

  /** Erzeugt die Arbeitsmappe ohne sie abzulegen – für Download/Export. */
  async exportieren(): Promise<{ daten: ArrayBuffer; dateiname: string }> {
    return { daten: await this.baueArbeitsmappe(), dateiname: this.dateiname() };
  }

  /** Der Excel-Code wird erst bei Bedarf geladen – er dominiert sonst das Startbundle. */
  private async baueArbeitsmappe(): Promise<ArrayBuffer> {
    const { schreibeArbeitsmappe } = await import('./excel-schreiben');
    return schreibeArbeitsmappe(this.store.dokument());
  }

  /** Startet mit einem leeren Plan, ohne Datei. */
  neuesDokument(dokument: PlanDocument): void {
    this.store.setzeDokument(dokument);
    this.aktivesZiel.set(null);
    this.store.ergaenzeFehlendeDiensttage(this.diensttag.wochentag());
  }

  private dateiname(): string {
    const vorhanden = this.aktivesZiel()?.bezeichnung ?? '';
    const treffer = /([^/\\·\s]+\.xlsx)$/i.exec(vorhanden.trim());
    return treffer ? treffer[1] : `Rahmenplan_${this.store.jahr()}.xlsx`;
  }
}
