import { describe, expect, it } from 'vitest';
import { berechneFeiertage } from '../data/feiertage-berechnet';
import { PlanDocument, Termin, leererTermin, leeresDocument } from '../models/plan.model';
import { wochentageImJahr } from '../utils/datum';
import { werteAus } from './auswertung';

const FEIERTAGE_NRW = berechneFeiertage(2026, 'NW');

function termin(datum: string, aenderung: Partial<Termin> = {}): Termin {
  return { ...leererTermin(datum), ...aenderung };
}

function dokument(termine: Termin[]): PlanDocument {
  return { ...leeresDocument(2026), termine };
}

describe('werteAus · Diensttage', () => {
  it('zählt Diensttage, Feiertage und Lücken für den Standard-Diensttag Montag', () => {
    const a = werteAus(dokument([termin('2026-01-05', { thema: 'Auftakt' })]), 'Mo', FEIERTAGE_NRW);

    expect(a.diensttage.diensttage).toBe(52);
    // 05.01. (Thema) + Ostermontag + Pfingstmontag – beide fallen 2026 auf einen Montag.
    expect(a.diensttage.belegt).toBe(3);
    expect(a.diensttage.feiertage).toBe(2);
    expect(a.diensttage.luecken).toHaveLength(49);
    expect(a.diensttage.luecken).not.toContain('2026-01-05');
    expect(a.diensttage.luecken).not.toContain('2026-04-06');
  });

  it('rechnet für einen anderen konfigurierten Diensttag', () => {
    const a = werteAus(
      dokument([termin('2026-01-07', { thema: 'Erster Mittwoch' })]),
      'Mi',
      new Map(),
    );

    expect(a.diensttage.diensttage).toBe(52);
    expect(a.diensttage.belegt).toBe(1);
    expect(a.diensttage.luecken).toContain('2026-01-14');
    expect(a.diensttage.luecken).not.toContain('2026-01-07');
  });

  it('liefert eine Quote von 1, wenn jeder Diensttag ein Thema oder ein Feiertag ist', () => {
    const termine = wochentageImJahr(2026, 'Mo')
      .filter((d) => !FEIERTAGE_NRW.has(d))
      .map((d) => termin(d, { thema: 'Ausbildung' }));

    const a = werteAus(dokument(termine), 'Mo', FEIERTAGE_NRW);

    expect(a.diensttage.luecken).toHaveLength(0);
    expect(a.diensttage.quote).toBe(1);
  });

  it('liefert eine Quote von 0, wenn kein Diensttag belegt ist', () => {
    const a = werteAus(dokument([]), 'Mo', new Map());

    expect(a.diensttage.belegt).toBe(0);
    expect(a.diensttage.quote).toBe(0);
  });
});
