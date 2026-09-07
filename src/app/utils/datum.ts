const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;

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

/** Excel-Seriennummer → ISO-Datum (`YYYY-MM-DD`), zeitzonenunabhängig. */
export function serialZuIso(serial: number): string {
  const d = new Date(EXCEL_EPOCHE_MS + Math.round(serial) * TAG_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** ISO-Datum → Excel-Seriennummer. */
export function isoZuSerial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCHE_MS) / TAG_MS);
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
export function wochentag(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WOCHENTAGE[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
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

/** Alle Montage eines Jahres als ISO-Daten – das Gerüst des Jahresplans. */
export function montageImJahr(jahr: number): string[] {
  const erster = new Date(Date.UTC(jahr, 0, 1));
  // 0 = Sonntag, 1 = Montag; von Neujahr bis zum ersten Montag vorspulen.
  const versatz = (8 - erster.getUTCDay()) % 7;
  const montage: string[] = [];
  for (let tag = new Date(erster.getTime() + versatz * TAG_MS); tag.getUTCFullYear() === jahr;) {
    montage.push(`${tag.getUTCFullYear()}-${pad(tag.getUTCMonth() + 1)}-${pad(tag.getUTCDate())}`);
    tag = new Date(tag.getTime() + 7 * TAG_MS);
  }
  return montage;
}

export function istMontag(iso: string): boolean {
  return wochentag(iso) === 'Mo';
}

export function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
