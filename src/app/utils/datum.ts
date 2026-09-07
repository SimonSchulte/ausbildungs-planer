/** Wochentag in ISO-Reihenfolge, Montag zuerst – die Reihenfolge, in der Wochen dargestellt werden. */
export const WOCHENTAGE_ISO = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

export type Wochentag = (typeof WOCHENTAGE_ISO)[number];

const WOCHENTAGE = [
  'So',
  'Mo',
  'Di',
  'Mi',
  'Do',
  'Fr',
  'Sa',
] as const satisfies readonly Wochentag[];

export const MONATSNAMEN = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

const EXCEL_EPOCHE_MS = Date.UTC(1899, 11, 30);
const TAG_MS = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ausUtcTagen(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function utcMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Excel-Seriennummer → ISO-Datum (`YYYY-MM-DD`), zeitzonenunabhängig. */
export function serialZuIso(serial: number): string {
  return ausUtcTagen(EXCEL_EPOCHE_MS + Math.round(serial) * TAG_MS);
}

/** ISO-Datum → Excel-Seriennummer. */
export function isoZuSerial(iso: string): number {
  return Math.round((utcMs(iso) - EXCEL_EPOCHE_MS) / TAG_MS);
}

/**
 * Nimmt alles entgegen, was in der Mappe als Datum auftauchen kann
 * (Seriennummer, JS-Date, `05.01.2026`, `2026-01-05`) und liefert ISO oder `null`.
 */
export function zuIsoDatum(wert: unknown): string | null {
  if (wert === null || wert === undefined || wert === '') {
    return null;
  }
  if (typeof wert === 'number' && Number.isFinite(wert)) {
    return serialZuIso(wert);
  }
  if (wert instanceof Date && !Number.isNaN(wert.getTime())) {
    return `${wert.getFullYear()}-${pad(wert.getMonth() + 1)}-${pad(wert.getDate())}`;
  }
  if (typeof wert !== 'string') {
    return null;
  }
  const text = wert.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const deutsch = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(text);
  if (deutsch) {
    const jahr = Number(deutsch[3]);
    return `${jahr < 100 ? 2000 + jahr : jahr}-${pad(Number(deutsch[2]))}-${pad(Number(deutsch[1]))}`;
  }
  return null;
}

/** Wochentagskürzel (`Mo`, `Di`, …) – wird nie aus der Datei übernommen, sondern berechnet. */
export function wochentag(iso: string): Wochentag {
  return WOCHENTAGE[new Date(utcMs(iso)).getUTCDay()];
}

/** Index in ISO-Reihenfolge: Montag = 0 … Sonntag = 6. Grundlage für Wochenraster. */
export function wochentagIndex(iso: string): number {
  return WOCHENTAGE_ISO.indexOf(wochentag(iso));
}

export function monatIndex(iso: string): number {
  return Number(iso.slice(5, 7)) - 1;
}

export function jahrVon(iso: string): number {
  return Number(iso.slice(0, 4));
}

export function formatiereDatum(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Verschiebt ein ISO-Datum um `anzahl` Tage (negativ = rückwärts). */
export function versetzeTage(iso: string, anzahl: number): string {
  return ausUtcTagen(utcMs(iso) + anzahl * TAG_MS);
}

/** Montag der Kalenderwoche, die `iso` enthält (kann vor `iso` liegen oder `iso` selbst sein). */
export function wochenbeginn(iso: string): string {
  return versetzeTage(iso, -wochentagIndex(iso));
}

/**
 * Alle Vorkommen eines Wochentags in einem Jahr, als ISO-Daten – das Gerüst
 * des Jahresplans (standardmäßig Montage, der reguläre Dienstabend).
 */
export function wochentageImJahr(jahr: number, tag: Wochentag): string[] {
  const ersterTagDesJahres = `${jahr}-01-01`;
  const versatz = (WOCHENTAGE_ISO.indexOf(tag) - wochentagIndex(ersterTagDesJahres) + 7) % 7;
  const daten: string[] = [];
  for (
    let datum = versetzeTage(ersterTagDesJahres, versatz);
    jahrVon(datum) === jahr;
    datum = versetzeTage(datum, 7)
  ) {
    daten.push(datum);
  }
  return daten;
}

export interface WochenBereich {
  /** Montag der Kalenderwoche (kann knapp vor dem 1. Januar liegen). */
  start: string;
  /** Sonntag der Kalenderwoche (kann knapp nach dem 31. Dezember liegen). */
  ende: string;
}

/**
 * Alle Kalenderwochen, die das Jahr berühren – vollständige Montag-bis-Sonntag-
 * Zeilen für den Wochenraster. Die erste und letzte Woche können dabei ein paar
 * Tage des Nachbarjahres enthalten (z. B. Neujahr, wenn der 1. Januar kein
 * Montag ist); diese Randtage bleiben trotzdem sichtbar, statt in einer
 * unvollständigen Woche zu verschwinden.
 */
export function wochenImJahr(jahr: number): WochenBereich[] {
  const bereiche: WochenBereich[] = [];
  for (
    let start = wochenbeginn(`${jahr}-01-01`);
    jahrVon(start) <= jahr;
    start = versetzeTage(start, 7)
  ) {
    bereiche.push({ start, ende: versetzeTage(start, 6) });
  }
  return bereiche;
}

/** ISO-8601-Kalenderwochennummer (Woche mit dem ersten Donnerstag des Jahres ist KW 1). */
export function isoWochennummer(iso: string): number {
  const donnerstag = versetzeTage(wochenbeginn(iso), 3);
  // KW 1 ist die Woche, deren Donnerstag im Jahr des 4. Januar liegt.
  const donnerstagKw1 = versetzeTage(wochenbeginn(`${jahrVon(donnerstag)}-01-04`), 3);
  return Math.round((utcMs(donnerstag) - utcMs(donnerstagKw1)) / (7 * TAG_MS)) + 1;
}

export function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
