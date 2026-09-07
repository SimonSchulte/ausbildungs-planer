import { Termin } from '../models/plan.model';
import {
  Wochentag,
  isoWochennummer,
  jahrVon,
  versetzeTage,
  wochenImJahr,
  wochentag,
} from '../utils/datum';

/**
 * Ein Tag im Wochenraster.
 *
 * Das Raster ist abgeleitet, nicht gespeichert: Es entsteht aus allen Kalenderwochen
 * des Jahres, allen Terminen der Mappe und allen Feiertagen. Anders als die Excel
 * (die nur die Diensttage als echte Zeilen führt) zeigt der Raster **jeden** Tag
 * jeder Woche – nur so lassen sich Wochen als Ganzes erkennen und Termine auch auf
 * einen anderen Wochentag als den Diensttag legen.
 */
export interface PlanSlot {
  datum: string;
  tag: Wochentag;
  istDiensttag: boolean;
  /** `false` an den Rändern des Jahres, wenn die Woche ins Nachbarjahr hineinragt. */
  imJahr: boolean;
  feiertag: string | null;
  /** 0..n Einträge der Mappe an diesem Datum. */
  termine: Termin[];
  /** Diensttag ohne Feiertag und ohne Ausbildungsthema – die rot markierte Lücke. */
  luecke: boolean;
}

export interface WochenZeile {
  nummer: number;
  start: string;
  ende: string;
  /** Genau 7 Slots, Montag bis Sonntag. */
  tage: PlanSlot[];
  luecken: number;
}

export function baueWochenraster(
  jahr: number,
  termine: readonly Termin[],
  feiertage: ReadonlyMap<string, string>,
  diensttag: Wochentag,
): WochenZeile[] {
  const nachDatum = indexiereNachDatum(termine);

  return wochenImJahr(jahr).map(({ start, ende }) => {
    const tage: PlanSlot[] = [];
    for (let datum = start; datum <= ende; datum = versetzeTage(datum, 1)) {
      tage.push(baueSlot(datum, jahr, diensttag, nachDatum.get(datum) ?? [], feiertage));
    }
    return {
      nummer: isoWochennummer(start),
      start,
      ende,
      tage,
      // Randtage des Nachbarjahres zählen nicht mit – sonst wirkt die erste
      // oder letzte Wochenzeile fälschlich unvollständig.
      luecken: tage.filter((t) => t.luecke && t.imJahr).length,
    };
  });
}

function baueSlot(
  datum: string,
  jahr: number,
  diensttag: Wochentag,
  eintraege: Termin[],
  feiertage: ReadonlyMap<string, string>,
): PlanSlot {
  const feiertagName = feiertage.get(datum) ?? null;
  const istDiensttag = wochentag(datum) === diensttag;
  return {
    datum,
    tag: wochentag(datum),
    istDiensttag,
    imJahr: jahrVon(datum) === jahr,
    feiertag: feiertagName,
    termine: eintraege,
    luecke: istDiensttag && !feiertagName && !eintraege.some((t) => t.thema.trim()),
  };
}

function indexiereNachDatum(termine: readonly Termin[]): Map<string, Termin[]> {
  const nachDatum = new Map<string, Termin[]>();
  for (const termin of termine) {
    if (!termin.datum) {
      continue;
    }
    const vorhanden = nachDatum.get(termin.datum);
    if (vorhanden) {
      vorhanden.push(termin);
    } else {
      nachDatum.set(termin.datum, [termin]);
    }
  }
  return nachDatum;
}
