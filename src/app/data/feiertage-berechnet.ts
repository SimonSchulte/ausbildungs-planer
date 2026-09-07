import { BundeslandCode } from './bundeslaender';

/**
 * Lokale Berechnung der gesetzlichen Feiertage.
 *
 * Dient als Rückfallebene, wenn feiertage-api.de nicht erreichbar ist – etwa
 * weil die Instanz keine CORS-Header sendet oder der Rechner offline ist. Ohne
 * diese Ebene würde ein Feiertag fälschlich als Ausbildungslücke rot markiert.
 */

const TAG_MS = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function iso(datum: Date): string {
  return `${datum.getUTCFullYear()}-${pad(datum.getUTCMonth() + 1)}-${pad(datum.getUTCDate())}`;
}

/** Ostersonntag nach der anonymen gregorianischen Osterformel (Meeus/Jones/Butcher). */
export function ostersonntag(jahr: number): Date {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(jahr, monat - 1, tag));
}

/** Buß- und Bettag: der letzte Mittwoch vor dem 23. November. */
function bussUndBettag(jahr: number): Date {
  const stichtag = new Date(Date.UTC(jahr, 10, 23));
  // 3 = Mittwoch; fällt der 23. selbst auf einen Mittwoch, zählt der davor.
  const rueckwaerts = (stichtag.getUTCDay() - 3 + 7) % 7 || 7;
  return new Date(stichtag.getTime() - rueckwaerts * TAG_MS);
}

interface Regel {
  name: string;
  /** Fester Termin als `MM-TT` … */
  fest?: string;
  /** … oder Abstand in Tagen zum Ostersonntag. */
  zuOstern?: number;
  /** Leer = bundesweit, sonst nur in diesen Ländern. */
  laender?: readonly BundeslandCode[];
}

const REGELN: readonly Regel[] = [
  { name: 'Neujahrstag', fest: '01-01' },
  { name: 'Heilige Drei Könige', fest: '01-06', laender: ['BW', 'BY', 'ST'] },
  { name: 'Internationaler Frauentag', fest: '03-08', laender: ['BE', 'MV'] },
  { name: 'Karfreitag', zuOstern: -2 },
  { name: 'Ostersonntag', zuOstern: 0, laender: ['BB'] },
  { name: 'Ostermontag', zuOstern: 1 },
  { name: 'Tag der Arbeit', fest: '05-01' },
  { name: 'Christi Himmelfahrt', zuOstern: 39 },
  { name: 'Pfingstsonntag', zuOstern: 49, laender: ['BB'] },
  { name: 'Pfingstmontag', zuOstern: 50 },
  { name: 'Fronleichnam', zuOstern: 60, laender: ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'] },
  { name: 'Mariä Himmelfahrt', fest: '08-15', laender: ['SL'] },
  { name: 'Weltkindertag', fest: '09-20', laender: ['TH'] },
  { name: 'Tag der Deutschen Einheit', fest: '10-03' },
  {
    name: 'Reformationstag',
    fest: '10-31',
    laender: ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'],
  },
  { name: 'Allerheiligen', fest: '11-01', laender: ['BW', 'BY', 'NW', 'RP', 'SL'] },
  { name: '1. Weihnachtstag', fest: '12-25' },
  { name: '2. Weihnachtstag', fest: '12-26' },
];

/** Gesetzliche Feiertage eines Jahres für ein Bundesland: ISO-Datum → Name. */
export function berechneFeiertage(jahr: number, land: BundeslandCode): Map<string, string> {
  const ostern = ostersonntag(jahr);
  const feiertage = new Map<string, string>();

  for (const regel of REGELN) {
    if (regel.laender && !regel.laender.includes(land)) {
      continue;
    }
    const datum = regel.fest
      ? `${jahr}-${regel.fest}`
      : iso(new Date(ostern.getTime() + (regel.zuOstern ?? 0) * TAG_MS));
    feiertage.set(datum, regel.name);
  }

  if (land === 'SN') {
    feiertage.set(iso(bussUndBettag(jahr)), 'Buß- und Bettag');
  }
  return feiertage;
}
