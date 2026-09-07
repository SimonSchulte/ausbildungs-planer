import { describe, expect, it } from 'vitest';
import { berechneFeiertage, ostersonntag } from './feiertage-berechnet';

function isoVon(datum: Date): string {
  return datum.toISOString().slice(0, 10);
}

describe('ostersonntag', () => {
  it('trifft bekannte Ostertermine', () => {
    expect(isoVon(ostersonntag(2024))).toBe('2024-03-31');
    expect(isoVon(ostersonntag(2025))).toBe('2025-04-20');
    expect(isoVon(ostersonntag(2026))).toBe('2026-04-05');
    expect(isoVon(ostersonntag(2027))).toBe('2027-03-28');
  });
});

describe('berechneFeiertage', () => {
  it('liefert die elf gesetzlichen Feiertage in NRW', () => {
    const nrw = berechneFeiertage(2026, 'NW');

    expect(nrw.size).toBe(11);
    expect(nrw.get('2026-01-01')).toBe('Neujahrstag');
    expect(nrw.get('2026-04-03')).toBe('Karfreitag');
    expect(nrw.get('2026-04-06')).toBe('Ostermontag');
    expect(nrw.get('2026-05-14')).toBe('Christi Himmelfahrt');
    expect(nrw.get('2026-05-25')).toBe('Pfingstmontag');
    expect(nrw.get('2026-06-04')).toBe('Fronleichnam');
    expect(nrw.get('2026-11-01')).toBe('Allerheiligen');
    expect(nrw.get('2026-12-26')).toBe('2. Weihnachtstag');
  });

  it('berücksichtigt landesspezifische Feiertage', () => {
    expect(berechneFeiertage(2026, 'NW').has('2026-10-31')).toBe(false);
    expect(berechneFeiertage(2026, 'NI').get('2026-10-31')).toBe('Reformationstag');
    expect(berechneFeiertage(2026, 'BY').get('2026-01-06')).toBe('Heilige Drei Könige');
    expect(berechneFeiertage(2026, 'SN').get('2026-11-18')).toBe('Buß- und Bettag');
    expect(berechneFeiertage(2025, 'SN').get('2025-11-19')).toBe('Buß- und Bettag');
    // 2022 fiel der 23. November selbst auf einen Mittwoch.
    expect(berechneFeiertage(2022, 'SN').get('2022-11-16')).toBe('Buß- und Bettag');
  });
});
