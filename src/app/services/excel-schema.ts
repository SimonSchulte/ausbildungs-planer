import { NACHWEISE, NachweisKey } from '../models/plan.model';

/** Blattnamen, die beim Lesen erkannt werden. */
export const BLATT_MUSTER = {
  jahresplan: /jahresplan|dienstplan|rahmenplan/i,
  backlog: /offene\s*ideen|ideen|backlog/i,
  kats: /kats/i,
};

export const BLATT_BACKLOG = 'Offene Ideen';
export const BLATT_KATS = 'KatS-A-Plan';

export function blattJahresplan(jahr: number): string {
  return `Jahresplan ${jahr}`;
}

/** Feldnamen, auf die eine Spaltenüberschrift abgebildet wird. */
export type SpaltenFeld =
  | 'datum'
  | 'tag'
  | 'hinweis'
  | 'kategorie'
  | 'thema'
  | 'ausbilder'
  | 'katsPflicht'
  | 'katsNummer'
  | 'katsTitel'
  | 'hgmInhalt'
  | 'hgmTitel'
  | 'material'
  | 'anforderungen'
  | 'notizen'
  | `nachweis:${NachweisKey}`;

export const SPALTEN_UEBERSCHRIFTEN: ReadonlyArray<{ feld: SpaltenFeld; text: string }> = [
  { feld: 'datum', text: 'Datum' },
  { feld: 'tag', text: 'Tag' },
  { feld: 'hinweis', text: 'Hinweis' },
  { feld: 'kategorie', text: 'Rolle' },
  { feld: 'thema', text: 'Thema' },
  { feld: 'ausbilder', text: 'Ausbilder/Verantw.' },
  { feld: 'katsPflicht', text: 'KatS-A-plan Bezug' },
  { feld: 'katsNummer', text: 'KatS-A-plan Nr.' },
  { feld: 'katsTitel', text: 'KatS-A-plan Titel' },
  { feld: 'hgmInhalt', text: 'HGM 4 Inhalt' },
  { feld: 'hgmTitel', text: 'HGM 4 Original Titel' },
  ...NACHWEISE.map((n) => ({ feld: `nachweis:${n.key}` as SpaltenFeld, text: n.header })),
  { feld: 'material', text: 'Benötigtes Material' },
  { feld: 'anforderungen', text: 'Besondere Anforderungen' },
  { feld: 'notizen', text: 'Notizen' },
];

/** Spaltenbreiten der geschriebenen Blätter (Reihenfolge wie oben). */
export const SPALTEN_BREITEN: Readonly<Record<SpaltenFeld, number>> = {
  datum: 12,
  tag: 6,
  hinweis: 24,
  kategorie: 10,
  thema: 52,
  ausbilder: 20,
  katsPflicht: 12,
  katsNummer: 12,
  katsTitel: 40,
  hgmInhalt: 12,
  hgmTitel: 16,
  material: 26,
  anforderungen: 26,
  notizen: 26,
  ...(Object.fromEntries(NACHWEISE.map((n) => [`nachweis:${n.key}`, 12])) as Record<
    `nachweis:${NachweisKey}`,
    number
  >),
};

/** Überschriften vergleichbar machen: Zeilenumbrüche, geschützte Leerzeichen, Groß/Klein. */
export function normHeader(wert: unknown): string {
  return String(wert ?? '')
    .toLowerCase()
    .replace(/[\s ]/g, '');
}

const ZUSATZ_ALIASE: ReadonlyArray<{ feld: SpaltenFeld; muster: RegExp }> = [
  { feld: 'ausbilder', muster: /^ausbilder/ },
  { feld: 'kategorie', muster: /^(rolle|kategorie|fachgruppe|fachdienst)$/ },
  { feld: 'katsPflicht', muster: /^kats-a-planbezug/ },
  { feld: 'katsNummer', muster: /^kats-a-plan(nr\.?|nummer)$/ },
  { feld: 'katsTitel', muster: /^kats-a-plantitel$/ },
  { feld: 'material', muster: /material/ },
  { feld: 'anforderungen', muster: /anforderungen/ },
  { feld: 'hgmInhalt', muster: /^hgm4inhalt$/ },
  { feld: 'hgmTitel', muster: /^hgm4original/ },
];

const NACH_HEADER = new Map<string, SpaltenFeld>(
  NACHWEISE.map((n) => [normHeader(n.header), `nachweis:${n.key}` as SpaltenFeld]),
);

const DIREKT = new Map<string, SpaltenFeld>(
  SPALTEN_UEBERSCHRIFTEN.map((s) => [normHeader(s.text), s.feld]),
);

/** Ordnet eine Überschrift aus der Mappe einem Feld zu (`null` = unbekannte Spalte). */
export function erkenneSpalte(ueberschrift: unknown): SpaltenFeld | null {
  const norm = normHeader(ueberschrift);
  if (!norm) {
    return null;
  }
  return (
    DIREKT.get(norm) ??
    NACH_HEADER.get(norm) ??
    ZUSATZ_ALIASE.find((a) => a.muster.test(norm))?.feld ??
    null
  );
}

/** Kreuzchen-Spalten der Mappe: `x`, `X`, `ja`, `✓`, `1`, `true`. */
export function istWahr(wert: unknown): boolean {
  if (typeof wert === 'boolean') {
    return wert;
  }
  if (typeof wert === 'number') {
    return wert !== 0;
  }
  if (typeof wert !== 'string') {
    return false;
  }
  return /^(x|ja|j|✓|✔|1|true|wahr)$/i.test(wert.trim());
}

export function alsText(wert: unknown): string {
  if (wert === null || wert === undefined) {
    return '';
  }
  return String(wert).replace(/ /g, ' ').trim();
}
