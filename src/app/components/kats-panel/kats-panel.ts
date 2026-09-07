import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { KatsThema, Termin } from '../../models/plan.model';
import { PlanStore } from '../../services/plan-store';
import { formatiereDatum } from '../../utils/datum';

interface ThemaZeile {
  thema: KatsThema;
  geplant: Termin[];
  ideen: Termin[];
}

/**
 * Eigene KatS-Ausbildungsplan-Liste.
 *
 * Sie ist die Referenzliste für die Querverweise: jeder Termin und jede Idee
 * kann genau einem Thema zugeordnet werden, und hier ist umgekehrt sichtbar,
 * welche Termine ein Thema abdecken.
 */
@Component({
  selector: 'app-kats-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
  templateUrl: './kats-panel.html',
  styleUrl: './kats-panel.less',
})
export class KatsPanel {
  private readonly store = inject(PlanStore);

  readonly suche = signal('');
  readonly nurOffene = signal(false);

  readonly zeilen = computed<ThemaZeile[]>(() => {
    const termine = this.store.termine();
    const backlog = this.store.backlog();
    return this.store.katsThemen().map((thema) => ({
      thema,
      geplant: termine.filter((t) => t.katsThemaId === thema.id),
      ideen: backlog.filter((t) => t.katsThemaId === thema.id),
    }));
  });

  readonly gefiltert = computed(() => {
    const suche = this.suche().trim().toLowerCase();
    return this.zeilen().filter((zeile) => {
      if (this.nurOffene() && zeile.geplant.length > 0) {
        return false;
      }
      if (!suche) {
        return true;
      }
      return `${zeile.thema.nummer} ${zeile.thema.titel} ${zeile.thema.beschreibung}`
        .toLowerCase()
        .includes(suche);
    });
  });

  readonly offeneAnzahl = computed(
    () => this.zeilen().filter((z) => z.thema.pflicht && z.geplant.length === 0).length,
  );

  datum(termin: Termin): string {
    return termin.datum ? formatiereDatum(termin.datum) : '–';
  }

  neuesThema(): void {
    this.store.neuesKatsThema({ titel: 'Neues Thema' });
  }

  aktualisiere(id: string, aenderung: Partial<KatsThema>): void {
    this.store.aktualisiereKatsThema(id, aenderung);
  }

  loeschen(id: string): void {
    this.store.loescheKatsThema(id);
  }

  /** Legt eine Idee an, die bereits auf dieses Thema verweist. */
  alsIdeeAufnehmen(thema: KatsThema): void {
    this.store.neueIdee({
      thema: thema.titel,
      katsThemaId: thema.id,
      katsTitel: thema.titel,
      katsPflicht: true,
    });
  }
}
