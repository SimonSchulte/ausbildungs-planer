import { describe, expect, it } from 'vitest';
import {
  isoWochennummer,
  isoZuSerial,
  jahrVon,
  serialZuIso,
  versetzeTage,
  wochenbeginn,
  wochenImJahr,
  wochentag,
  wochentageImJahr,
} from './datum';

describe('wochentageImJahr', () => {
  it('liefert alle Montage eines Jahres', () => {
    const montage = wochentageImJahr(2026, 'Mo');

    expect(montage).toHaveLength(52);
    expect(montage[0]).toBe('2026-01-05');
    expect(montage.at(-1)).toBe('2026-12-28');
    expect(montage.every((d) => wochentag(d) === 'Mo')).toBe(true);
  });

  it('beginnt am 1. Januar, wenn dieser der gesuchte Wochentag ist', () => {
    // Der 1. Januar 2024 war ein Montag – der Versatz darf ihn nicht überspringen.
    expect(wochentageImJahr(2024, 'Mo')[0]).toBe('2024-01-01');
    expect(wochentageImJahr(2024, 'Mo')).toHaveLength(53);
  });

  it('funktioniert für einen beliebigen anderen Wochentag', () => {
    const mittwoche = wochentageImJahr(2026, 'Mi');

    expect(mittwoche[0]).toBe('2026-01-07');
    expect(mittwoche.every((d) => wochentag(d) === 'Mi')).toBe(true);
  });
});

describe('wochenbeginn / versetzeTage', () => {
  it('findet den Montag der Woche, auch wenn das Datum selbst kein Montag ist', () => {
    expect(wochenbeginn('2026-01-08')).toBe('2026-01-05');
    expect(wochenbeginn('2026-01-05')).toBe('2026-01-05');
    expect(wochenbeginn('2026-01-04')).toBe('2025-12-29');
  });

  it('verschiebt Daten auch über Monats- und Jahresgrenzen hinweg', () => {
    expect(versetzeTage('2026-01-01', -1)).toBe('2025-12-31');
    expect(versetzeTage('2026-12-31', 1)).toBe('2027-01-01');
    expect(versetzeTage('2026-02-25', 5)).toBe('2026-03-02');
  });
});

describe('wochenImJahr', () => {
  it('deckt lückenlos jeden Tag des Jahres ab, auch am Rand', () => {
    const wochen = wochenImJahr(2026);

    // 2026-01-01 ist ein Donnerstag – die erste Woche beginnt daher im Vorjahr.
    expect(wochen[0].start).toBe('2025-12-29');
    expect(wochen[0].ende).toBe('2026-01-04');
    expect(wochen.at(-1)?.start).toBe('2026-12-28');
    expect(wochen.at(-1)?.ende).toBe('2027-01-03');

    for (let i = 1; i < wochen.length; i++) {
      expect(wochen[i].start).toBe(versetzeTage(wochen[i - 1].start, 7));
    }
  });

  it('beginnt exakt am 1. Januar, wenn dieser ein Montag ist', () => {
    const wochen = wochenImJahr(2024);
    expect(wochen[0].start).toBe('2024-01-01');
  });

  it('enthält jede Kalenderwoche nur einmal', () => {
    const jahre = jahrVon(wochenImJahr(2026)[0].start);
    expect(jahre).toBe(2025);
    expect(wochenImJahr(2026)).toHaveLength(53);
  });
});

describe('isoWochennummer', () => {
  it('trifft bekannte Kalenderwochen', () => {
    // 2025-12-29 (Montag) gehört bereits zu KW 1/2026, da deren Donnerstag
    // (2026-01-01) im neuen Jahr liegt.
    expect(isoWochennummer('2025-12-29')).toBe(1);
    expect(isoWochennummer('2026-01-01')).toBe(1);
    expect(isoWochennummer('2026-01-05')).toBe(2);
    expect(isoWochennummer('2026-12-28')).toBe(53);
  });

  it('rechnet über Jahresgrenzen hinweg konsistent mit dem Wochenraster', () => {
    for (const { start } of wochenImJahr(2026)) {
      expect(isoWochennummer(start)).toBe(isoWochennummer(versetzeTage(start, 6)));
    }
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
