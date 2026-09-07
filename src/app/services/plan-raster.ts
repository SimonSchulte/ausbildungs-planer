import { Termin } from '../models/plan.model';
import { MONATSNAMEN, istMontag, monatIndex, montageImJahr, wochentag } from '../utils/datum';

/**
 * Ein Tag im Jahresplan.
 *
 * Das Raster ist abgeleitet, nicht gespeichert: Es entsteht aus allen Montagen
 * des Jahres, allen Terminen der Mappe und allen Feiertagen. Dadurch ist jeder
 * Montag garantiert sichtbar, ohne dass leere Zeilen in die Excel wandern.
 */
export interface PlanSlot {
  datum: string;
  tag: string;
  istMontag: boolean;
  feiertag: string | null;
  /** 0..n Einträge der Mappe an diesem Datum. */
  termine: Termin[];
  /** Montag ohne Feiertag und ohne Ausbildungsthema – die rot markierte Lücke. */
  luecke: boolean;
}

export interface MonatsRaster {
  index: number;
  name: string;
  slots: PlanSlot[];
  montage: number;
  luecken: number;
}

export function baueRaster(
  jahr: number,
  termine: readonly Termin[],
  feiertage: ReadonlyMap<string, string>,
): PlanSlot[] {
  const nachDatum = new Map<string, Termin[]>();
  for (const termin of termine) {
    if (termin.datum) {
      const vorhanden = nachDatum.get(termin.datum);
      if (vorhanden) {
        vorhanden.push(termin);
      } else {
        nachDatum.set(termin.datum, [termin]);
      }
    }
  }

  const daten = new Set([...montageImJahr(jahr), ...nachDatum.keys(), ...feiertage.keys()]);

  return [...daten]
    .sort()
    .map((datum) => {
      const eintraege = nachDatum.get(datum) ?? [];
      const feiertag = feiertage.get(datum) ?? null;
      const montag = istMontag(datum);
      return {
        datum,
        tag: wochentag(datum),
        istMontag: montag,
        feiertag,
        termine: eintraege,
        luecke: montag && !feiertag && !eintraege.some((t) => t.thema.trim()),
      };
    })
    .filter((slot) => slot.termine.length > 0 || slot.istMontag || slot.feiertag !== null);
}

export function gruppiereNachMonat(slots: readonly PlanSlot[]): MonatsRaster[] {
  const gruppen = new Map<number, PlanSlot[]>();
  for (const slot of slots) {
    const index = monatIndex(slot.datum);
    const vorhanden = gruppen.get(index);
    if (vorhanden) {
      vorhanden.push(slot);
    } else {
      gruppen.set(index, [slot]);
    }
  }
  return [...gruppen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, monatsSlots]) => ({
      index,
      name: MONATSNAMEN[index] ?? 'Unbekannt',
      slots: monatsSlots,
      montage: monatsSlots.filter((s) => s.istMontag).length,
      luecken: monatsSlots.filter((s) => s.luecke).length,
    }));
}
