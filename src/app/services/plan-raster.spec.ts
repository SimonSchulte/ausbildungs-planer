import { describe, expect, it } from 'vitest';
import { berechneFeiertage } from '../data/feiertage-berechnet';
import { Termin, leererTermin } from '../models/plan.model';
import { baueRaster, gruppiereNachMonat } from './plan-raster';

const FEIERTAGE_NRW = berechneFeiertage(2026, 'NW');

function termin(datum: string, aenderung: Partial<Termin> = {}): Termin {
  return { ...leererTermin(datum), ...aenderung };
}

describe('baueRaster', () => {
  it('enthält jeden Montag des Jahres, auch ohne Eintrag in der Mappe', () => {
    const raster = baueRaster(2026, [termin('2026-01-05', { thema: 'Auftakt' })], new Map());

    expect(raster.filter((s) => s.istMontag)).toHaveLength(52);
    expect(raster.find((s) => s.datum === '2026-11-09')?.termine).toEqual([]);
  });

  it('markiert einen Montag ohne Thema als Lücke', () => {
    const raster = baueRaster(
      2026,
      [
        termin('2026-01-05', { thema: 'Auftakt' }),
        // Rolle gesetzt, aber kein Thema – zählt trotzdem als Lücke.
        termin('2026-01-12', { kategorie: 'SAN' }),
      ],
      new Map(),
    );

    expect(raster.find((s) => s.datum === '2026-01-05')?.luecke).toBe(false);
    expect(raster.find((s) => s.datum === '2026-01-12')?.luecke).toBe(true);
    expect(raster.find((s) => s.datum === '2026-01-19')?.luecke).toBe(true);
  });

  it('wertet einen Montag mit Feiertag nicht als Lücke', () => {
    const raster = baueRaster(2026, [], FEIERTAGE_NRW);
    const ostermontag = raster.find((s) => s.datum === '2026-04-06');

    expect(ostermontag?.feiertag).toBe('Ostermontag');
    expect(ostermontag?.istMontag).toBe(true);
    expect(ostermontag?.luecke).toBe(false);
  });

  it('nimmt Feiertage auch außerhalb der Montage in den Plan auf', () => {
    const raster = baueRaster(2026, [], FEIERTAGE_NRW);
    const karfreitag = raster.find((s) => s.datum === '2026-04-03');

    expect(karfreitag?.feiertag).toBe('Karfreitag');
    expect(karfreitag?.istMontag).toBe(false);
    expect(karfreitag?.luecke).toBe(false);
  });

  it('behält Termine an anderen Wochentagen und mehrere je Datum', () => {
    const raster = baueRaster(
      2026,
      [
        termin('2026-03-21', { hinweis: 'KatS-Übung' }),
        termin('2026-03-21', { thema: 'Nachbereitung' }),
      ],
      new Map(),
    );
    const samstag = raster.find((s) => s.datum === '2026-03-21');

    expect(samstag?.termine).toHaveLength(2);
    expect(samstag?.istMontag).toBe(false);
  });
});

describe('gruppiereNachMonat', () => {
  it('zählt Montage und Lücken je Monat', () => {
    const raster = baueRaster(2026, [termin('2026-01-05', { thema: 'Auftakt' })], FEIERTAGE_NRW);
    const monate = gruppiereNachMonat(raster);
    const januar = monate[0];

    expect(januar.name).toBe('Januar');
    expect(januar.montage).toBe(4);
    // Vier Montage, davon einer belegt – Neujahr ist kein Montag.
    expect(januar.luecken).toBe(3);
  });
});
