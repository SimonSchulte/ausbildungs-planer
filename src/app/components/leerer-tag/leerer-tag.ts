import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PlanSlot } from '../../services/plan-raster';
import { formatiereDatum } from '../../utils/datum';

/**
 * Eine Wochenraster-Zelle ohne Eintrag – die meisten Zellen eines Jahres.
 *
 * Bewusst schmal und ruhig: nur die Tagesnummer, ein Symbol bei Feiertag oder
 * Lücke, und ein "+"-Knopf, der erst beim Hovern erscheint.
 */
@Component({
  selector: 'app-leerer-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './leerer-tag.html',
  styleUrl: './leerer-tag.less',
  host: {
    '[class.luecke]': 'slot().luecke',
    '[class.feiertag]': 'slot().feiertag !== null',
    '[class.ausserhalb]': '!slot().imJahr',
  },
})
export class LeererTag {
  readonly slot = input.required<PlanSlot>();
  readonly anlegen = output<void>();

  readonly tagNummer = computed(() => Number(this.slot().datum.slice(8, 10)));
  readonly datumText = computed(() => formatiereDatum(this.slot().datum));
}
