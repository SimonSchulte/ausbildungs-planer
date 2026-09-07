import { describe, expect, it } from 'vitest';
import { leseAntwort } from './feiertage.service';

describe('leseAntwort', () => {
  it('liest die Objektform der feiertage-api', () => {
    const feiertage = leseAntwort({
      Neujahrstag: { datum: '2026-01-01', hinweis: '' },
      Karfreitag: { datum: '2026-04-03', hinweis: '' },
    });

    expect(feiertage.get('2026-01-01')).toBe('Neujahrstag');
    expect(feiertage.get('2026-04-03')).toBe('Karfreitag');
  });

  it('liest auch die flache Form mit nur_daten', () => {
    expect(leseAntwort({ Ostermontag: '2026-04-06' }).get('2026-04-06')).toBe('Ostermontag');
  });

  it('überspringt unbrauchbare Einträge, statt zu scheitern', () => {
    const feiertage = leseAntwort({
      Gut: { datum: '2026-05-01' },
      OhneDatum: { hinweis: 'kaputt' },
      Murks: 'kein Datum',
      Null: null,
    });

    expect([...feiertage.keys()]).toEqual(['2026-05-01']);
  });

  it('verträgt eine leere oder falsche Antwort', () => {
    expect(leseAntwort(null).size).toBe(0);
    expect(leseAntwort('Fehlerseite').size).toBe(0);
  });
});
