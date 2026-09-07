import { KATEGORIEN, Kategorie } from '../models/plan.model';

/**
 * Schreibweisen, die in der gewachsenen Excel-Mappe vorkommen, auf die
 * kanonische Kategorie abbilden. Schlüssel sind normalisiert (siehe `normalisiere`).
 */
const ALIASE: Record<string, Kategorie> = {
  san: 'SAN',
  sanitaet: 'SAN',
  'bt/vp': 'Bt/Vp',
  btvp: 'Bt/Vp',
  bt: 'Bt/Vp',
  vp: 'Bt/Vp',
  betreuung: 'Bt/Vp',
  verpflegung: 'Bt/Vp',
  'tesi/iuk': 'TeSi/Iuk',
  tesiiuk: 'TeSi/Iuk',
  tesi: 'TeSi/Iuk',
  iuk: 'TeSi/Iuk',
  technik: 'TeSi/Iuk',
  uf: 'UF',
  unterfuehrer: 'UF',
  fuehrung: 'Führung',
  fuehrungsgruppe: 'Führung',
  sonstiges: 'Sonstiges',
};

export const KATEGORIE_FARBEN: Record<Kategorie | '', string> = {
  SAN: 'var(--kat-san)',
  'Bt/Vp': 'var(--kat-btvp)',
  'TeSi/Iuk': 'var(--kat-tesi)',
  UF: 'var(--kat-uf)',
  Führung: 'var(--kat-fuehrung)',
  Sonstiges: 'var(--kat-sonstiges)',
  '': 'var(--kat-ereignis)',
};

function normalisiere(wert: string): string {
  return wert
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[\s ._-]/g, '');
}

/** Liefert die kanonische Kategorie oder `''`, wenn nichts erkannt wurde. */
export function normalisiereKategorie(wert: unknown): Kategorie | '' {
  if (typeof wert !== 'string') {
    return '';
  }
  const roh = wert.trim();
  if (!roh) {
    return '';
  }
  const treffer = KATEGORIEN.find((k) => normalisiere(k) === normalisiere(roh));
  if (treffer) {
    return treffer;
  }
  return ALIASE[normalisiere(roh)] ?? 'Sonstiges';
}

/** Erkennt, ob ein Zellwert eine Kategorie meint (für das Aufräumen des Ideen-Blatts). */
export function istKategorieToken(wert: unknown): boolean {
  if (typeof wert !== 'string') {
    return false;
  }
  const norm = normalisiere(wert.trim());
  if (!norm) {
    return false;
  }
  return KATEGORIEN.some((k) => normalisiere(k) === norm) || norm in ALIASE;
}
