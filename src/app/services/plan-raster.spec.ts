import { describe, expect, it } from 'vitest';
import { berechneFeiertage } from '../data/feiertage-berechnet';
import { Termin, leererTermin } from '../models/plan.model';
import { baueWochenraster } from './plan-raster';

const FEIERTAGE_NRW = berechneFeiertage(2026, 'NW');

function termin(datum: string, aenderung: Partial<Termin> = {}): Termin {
  return { ...leererTermin(datum), ...aenderung };
}

function alleSlots(wochen: ReturnType<typeof baueWochenraster>) {
  return wochen.flatMap((w) => w.tage);
}

describe('baueWochenraster', () => {
  it('deckt jede Woche mit genau 7 Tagen ab, Montag bis Sonntag', () => {
    const wochen = baueWochenraster(2026, [], new Map(), 'Mo');

    expect(wochen.length).toBeGreaterThan(50);
    for (const woche of wochen) {
      expect(woche.tage).toHaveLength(7);
      expect(woche.tage.map((t) => t.tag)).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
      expect(woche.tage[0].datum).toBe(woche.start);
      expect(woche.tage[6].datum).toBe(woche.ende);
    }
  });

  it('markiert Randtage aus dem Nachbarjahr als außerhalb des Jahres', () => {
    const wochen = baueWochenraster(2026, [], new Map(), 'Mo');
    const erste = wochen[0];

    // 2026-01-01 ist ein Donnerstag – Mo-Mi der ersten Woche liegen noch in 2025.
    expect(erste.tage.slice(0, 3).every((t) => !t.imJahr)).toBe(true);
    expect(erste.tage.slice(3).every((t) => t.imJahr)).toBe(true);
  });

  it('markiert jeden Montag ohne Ausbildungsthema als Lücke', () => {
    const wochen = baueWochenraster(
      2026,
      [
        termin('2026-01-05', { thema: 'Auftakt' }),
        // Rolle gesetzt, aber kein Thema – zählt trotzdem als Lücke.
        termin('2026-01-12', { kategorie: 'SAN' }),
      ],
      new Map(),
      'Mo',
    );
    const slots = alleSlots(wochen);

    expect(slots.find((s) => s.datum === '2026-01-05')?.luecke).toBe(false);
    expect(slots.find((s) => s.datum === '2026-01-12')?.luecke).toBe(true);
    expect(slots.find((s) => s.datum === '2026-01-19')?.luecke).toBe(true);
  });

  it('wertet einen Diensttag mit Feiertag nicht als Lücke', () => {
    const wochen = baueWochenraster(2026, [], FEIERTAGE_NRW, 'Mo');
    const ostermontag = alleSlots(wochen).find((s) => s.datum === '2026-04-06');

    expect(ostermontag?.feiertag).toBe('Ostermontag');
    expect(ostermontag?.istDiensttag).toBe(true);
    expect(ostermontag?.luecke).toBe(false);
  });

  it('zeigt Feiertage auch an anderen Wochentagen, ohne sie als Lücke zu zählen', () => {
    const wochen = baueWochenraster(2026, [], FEIERTAGE_NRW, 'Mo');
    const karfreitag = alleSlots(wochen).find((s) => s.datum === '2026-04-03');

    expect(karfreitag?.feiertag).toBe('Karfreitag');
    expect(karfreitag?.istDiensttag).toBe(false);
    expect(karfreitag?.luecke).toBe(false);
  });

  it('ordnet Termine an anderen Wochentagen dem richtigen Tag zu, auch mehrere je Datum', () => {
    const wochen = baueWochenraster(
      2026,
      [
        termin('2026-03-21', { hinweis: 'KatS-Übung' }),
        termin('2026-03-21', { thema: 'Nachbereitung' }),
      ],
      new Map(),
      'Mo',
    );
    const samstag = alleSlots(wochen).find((s) => s.datum === '2026-03-21');

    expect(samstag?.termine).toHaveLength(2);
    expect(samstag?.tag).toBe('Sa');
    expect(samstag?.istDiensttag).toBe(false);
  });

  it('unterstützt einen anderen konfigurierten Diensttag als Montag', () => {
    const wochen = baueWochenraster(
      2026,
      [termin('2026-01-07', { thema: 'Erster Mittwoch' })],
      new Map(),
      'Mi',
    );
    const slots = alleSlots(wochen);

    expect(slots.find((s) => s.datum === '2026-01-07')?.istDiensttag).toBe(true);
    expect(slots.find((s) => s.datum === '2026-01-07')?.luecke).toBe(false);
    expect(slots.find((s) => s.datum === '2026-01-05')?.istDiensttag).toBe(false);
    expect(slots.find((s) => s.datum === '2026-01-14')?.luecke).toBe(true);
  });

  it('zählt die Lücken je Woche', () => {
    const wochen = baueWochenraster(
      2026,
      [termin('2026-01-05', { thema: 'Auftakt' })],
      FEIERTAGE_NRW,
      'Mo',
    );
    const ersteVolleWoche = wochen.find((w) => w.start === '2026-01-05');

    expect(ersteVolleWoche?.luecken).toBe(0);
    const zweiteWoche = wochen.find((w) => w.start === '2026-01-12');
    expect(zweiteWoche?.luecken).toBe(1);
  });

  it('zählt Randtage des Vorjahres nicht als Lücke der Woche', () => {
    const wochen = baueWochenraster(2026, [], new Map(), 'Mo');
    // Die erste Wochenzeile beginnt am 2025-12-29 (Montag) – ein Diensttag,
    // aber außerhalb des Planjahrs, darf die Woche nicht als Lücke zählen.
    const ersteZeile = wochen[0];

    expect(ersteZeile.start).toBe('2025-12-29');
    expect(ersteZeile.tage[0].luecke).toBe(true);
    expect(ersteZeile.tage[0].imJahr).toBe(false);
    expect(ersteZeile.luecken).toBe(0);
  });
});
