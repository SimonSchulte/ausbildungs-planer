import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { KATEGORIE_FARBEN } from '../../data/kategorien';
import { diensttagName } from '../../data/wochentage';
import { Kategorie, Termin } from '../../models/plan.model';
import { werteAus } from '../../services/auswertung';
import { DiensttagService } from '../../services/diensttag.service';
import { FeiertagService } from '../../services/feiertage.service';
import { PlanStore } from '../../services/plan-store';
import { formatiereDatum } from '../../utils/datum';

/** Auswertungen über Kategorien, Monate, KatS-Abdeckung und Nachweise. */
@Component({
  selector: 'app-auswertung-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, PercentPipe, MatIconModule, MatTooltipModule],
  templateUrl: './auswertung-panel.html',
  styleUrl: './auswertung-panel.less',
})
export class AuswertungPanel {
  private readonly store = inject(PlanStore);
  private readonly feiertage = inject(FeiertagService);
  private readonly diensttagService = inject(DiensttagService);

  readonly auswertung = computed(() =>
    werteAus(this.store.dokument(), this.diensttagService.wochentag(), this.feiertage.feiertage()),
  );
  readonly diensttagLabel = computed(() => diensttagName(this.diensttagService.wochentag()));
  readonly maxProMonat = computed(() =>
    Math.max(1, ...this.auswertung().proMonat.map((m) => m.gesamt)),
  );

  farbe(kategorie: Kategorie | ''): string {
    return KATEGORIE_FARBEN[kategorie];
  }

  datum(termin: Termin): string {
    return termin.datum ? formatiereDatum(termin.datum) : '–';
  }

  formatiere(iso: string): string {
    return formatiereDatum(iso);
  }

  monatsAnteile(
    anteile: Map<Kategorie | '', number>,
  ): Array<{ kategorie: Kategorie | ''; anzahl: number }> {
    return [...anteile.entries()].map(([kategorie, anzahl]) => ({ kategorie, anzahl }));
  }
}
