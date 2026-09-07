import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PlanSlot } from '../../services/plan-raster';
import { formatiereDatum } from '../../utils/datum';

/**
 * Ein Tag ohne Eintrag in der Mappe.
 *
 * Bewusst schmaler als eine Termin-Karte: Ein Jahr hat viele davon, und sie
 * sollen den Plan nicht dominieren – außer sie sind eine Lücke, dann fallen sie
 * rot auf.
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
  },
})
export class LeererTag {
  readonly slot = input.required<PlanSlot>();
  readonly anlegen = output<void>();

  readonly datumText = computed(() => formatiereDatum(this.slot().datum));
}
