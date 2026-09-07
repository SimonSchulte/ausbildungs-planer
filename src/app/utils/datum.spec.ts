import { describe, expect, it } from 'vitest';
import { isoZuSerial, istMontag, montageImJahr, serialZuIso, wochentag } from './datum';

describe('montageImJahr', () => {
  it('liefert alle Montage eines Jahres', () => {
    const montage = montageImJahr(2026);

    expect(montage).toHaveLength(52);
    expect(montage[0]).toBe('2026-01-05');
    expect(montage.at(-1)).toBe('2026-12-28');
    expect(montage.every(istMontag)).toBe(true);
  });

  it('beginnt am 1. Januar, wenn dieser ein Montag ist', () => {
    // Der 1. Januar 2024 war ein Montag – der Versatz darf ihn nicht überspringen.
    expect(montageImJahr(2024)[0]).toBe('2024-01-01');
    expect(montageImJahr(2024)).toHaveLength(53);
  });
});

describe('Excel-Seriennummern', () => {
  it('sind zeitzonenunabhängig umkehrbar', () => {
    for (const iso of ['2026-01-01', '2026-03-29', '2026-10-25', '2026-12-31']) {
      expect(serialZuIso(isoZuSerial(iso))).toBe(iso);
    }
  });

  it('berechnet den Wochentag korrekt', () => {
    expect(wochentag('2026-01-05')).toBe('Mo');
    expect(wochentag('2026-03-21')).toBe('Sa');
  });
});
