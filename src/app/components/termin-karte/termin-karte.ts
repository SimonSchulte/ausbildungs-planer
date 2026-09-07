import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { KATEGORIE_FARBEN } from '../../data/kategorien';
import { KatsThema, NACHWEISE, Termin, terminArt } from '../../models/plan.model';
import { formatiereDatum, wochentag } from '../../utils/datum';

/** Darstellung eines Termins bzw. einer Idee – identisch in Plan und Backlog. */
@Component({
  selector: 'app-termin-karte',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  templateUrl: './termin-karte.html',
  styleUrl: './termin-karte.less',
  host: {
    '[class.ereignis]': 'art() === "ereignis"',
    '[class.frei]': 'istFrei()',
  },
})
export class TerminKarte {
  readonly termin = input.required<Termin>();
  readonly katsThema = input<KatsThema | null>(null);
  readonly kompakt = input(false);

  readonly bearbeiten = output<void>();
  readonly loeschen = output<void>();
  readonly verschieben = output<void>();

  readonly art = computed(() => terminArt(this.termin()));
  readonly istFrei = computed(() => this.art() === 'ausbildung' && !this.termin().thema.trim());
  readonly farbe = computed(() => KATEGORIE_FARBEN[this.termin().kategorie]);
  readonly datumText = computed(() => {
    const datum = this.termin().datum;
    return datum ? formatiereDatum(datum) : '';
  });
  readonly tagText = computed(() => {
    const datum = this.termin().datum;
    return datum ? wochentag(datum) : '';
  });
  readonly nachweisKuerzel = computed(() =>
    NACHWEISE.filter((n) => this.termin().nachweise.includes(n.key)).map((n) => n.kurz),
  );
  readonly katsAnzeige = computed(() => {
    const thema = this.katsThema();
    if (thema) {
      return `${thema.nummer ? thema.nummer + ' · ' : ''}${thema.titel}`;
    }
    return this.termin().katsTitel.replace(/\s+/g, ' ').trim();
  });
}
