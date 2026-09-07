import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlanDocument, leererTermin, leeresDocument } from '../models/plan.model';
import { PlanStore } from './plan-store';

function dokument(): PlanDocument {
  return {
    ...leeresDocument(2026),
    termine: [
      { ...leererTermin('2026-01-05'), id: 't1', thema: 'Erste Ausbildung', kategorie: 'SAN' },
      { ...leererTermin('2026-02-02'), id: 't2', thema: 'Zweite Ausbildung', kategorie: 'Bt/Vp' },
      { ...leererTermin('2026-03-02'), id: 't3', kategorie: 'UF' },
    ],
    backlog: [{ ...leererTermin(null), id: 'i1', thema: 'Kolonnenfahrt' }],
  };
}

describe('PlanStore', () => {
  let store: PlanStore;

  beforeEach(() => {
    store = TestBed.inject(PlanStore);
    store.setzeDokument(dokument());
  });

  it('tauscht beim Verschieben die Daten zweier Termine', () => {
    store.tauscheDatum('t1', 't2');

    expect(store.terminNachId('t1')?.datum).toBe('2026-02-02');
    expect(store.terminNachId('t2')?.datum).toBe('2026-01-05');
    expect(store.termine()).toHaveLength(3);
  });

  it('verschiebt einen Termin in die offenen Ideen', () => {
    store.zuBacklog('t1');

    expect(store.termine().map((t) => t.id)).toEqual(['t2', 't3']);
    expect(store.backlog()[0].id).toBe('t1');
    expect(store.backlog()[0].datum).toBeNull();
  });

  it('tauscht eine Idee gegen einen belegten Termin', () => {
    store.ausBacklogAufTermin('i1', 't1');

    expect(store.terminNachId('i1')?.datum).toBe('2026-01-05');
    expect(store.backlog().map((i) => i.id)).toEqual(['t1']);
  });

  it('befüllt einen freien Slot, ohne einen leeren Eintrag ins Backlog zu schieben', () => {
    store.ausBacklogAufTermin('i1', 't3');

    expect(store.terminNachId('i1')?.datum).toBe('2026-03-02');
    expect(store.backlog()).toHaveLength(0);
    expect(store.termine()).toHaveLength(3);
  });

  it('macht Änderungen rückgängig und stellt sie wieder her', () => {
    store.zuBacklog('t1');
    expect(store.termine()).toHaveLength(2);

    store.rueckgaengig();
    expect(store.termine()).toHaveLength(3);
    expect(store.kannWiederholen()).toBe(true);

    store.wiederholen();
    expect(store.termine()).toHaveLength(2);
  });

  it('löst Querverweise beim Entfernen eines KatS-Themas', () => {
    const themaId = store.neuesKatsThema({ titel: 'Kolonnenfahrt' });
    store.setzeKatsBezug('t1', themaId);
    expect(store.terminNachId('t1')?.katsTitel).toBe('Kolonnenfahrt');

    store.loescheKatsThema(themaId);
    expect(store.terminNachId('t1')?.katsThemaId).toBeNull();
    expect(store.katsThemen()).toHaveLength(0);
  });

  it('markiert Änderungen als ungespeichert', () => {
    expect(store.ungespeichert()).toBe(false);

    store.aktualisiereTermin('t1', { thema: 'Neu' });
    expect(store.ungespeichert()).toBe(true);

    store.alsGespeichertMarkieren();
    expect(store.ungespeichert()).toBe(false);
  });
});

describe('PlanStore · KatS-Titel', () => {
  it('zieht einen geänderten Thementitel in alle Verweise nach', () => {
    const store = TestBed.inject(PlanStore);
    store.setzeDokument(dokument());
    const themaId = store.neuesKatsThema({ titel: 'Alter Titel' });
    store.setzeKatsBezug('t1', themaId);

    store.aktualisiereKatsThema(themaId, { titel: 'Neuer Titel' });

    expect(store.terminNachId('t1')?.katsTitel).toBe('Neuer Titel');
  });
});

describe('PlanStore · fehlende Diensttage', () => {
  it('legt für jeden Montag ohne Zeile einen leeren Termin an (Standard-Diensttag)', () => {
    const store = TestBed.inject(PlanStore);
    store.setzeDokument(dokument());

    const ergaenzt = store.ergaenzeFehlendeDiensttage();

    expect(ergaenzt).toBe(49);
    expect(store.termine()).toHaveLength(52);
    const neuer = store.termine().find((t) => t.datum === '2026-01-12');
    expect(neuer?.thema).toBe('');
    expect(neuer?.id).toBeTruthy();
  });

  it('funktioniert für einen anderen konfigurierten Diensttag', () => {
    const store = TestBed.inject(PlanStore);
    store.setzeDokument(dokument());

    const ergaenzt = store.ergaenzeFehlendeDiensttage('Mi');

    expect(ergaenzt).toBe(52);
    expect(store.termine().find((t) => t.datum === '2026-01-07')).toBeTruthy();
  });

  it('verdoppelt vorhandene Diensttage nicht bei erneutem Aufruf', () => {
    const store = TestBed.inject(PlanStore);
    store.setzeDokument(dokument());

    store.ergaenzeFehlendeDiensttage();
    const zweiterAufruf = store.ergaenzeFehlendeDiensttage();

    expect(zweiterAufruf).toBe(0);
    expect(store.termine()).toHaveLength(52);
  });

  it('lässt bereits vorhandene Diensttags-Termine unangetastet', () => {
    const store = TestBed.inject(PlanStore);
    store.setzeDokument(dokument());

    store.ergaenzeFehlendeDiensttage();

    expect(store.terminNachId('t1')?.thema).toBe('Erste Ausbildung');
  });
});
