import { WOCHENTAGE_ISO, Wochentag } from '../utils/datum';

/** Auswahlliste für den Diensttag-Umschalter in der Werkzeugleiste. */
export const WOCHENTAG_OPTIONEN: ReadonlyArray<{ code: Wochentag; name: string }> = [
  { code: 'Mo', name: 'Montag' },
  { code: 'Di', name: 'Dienstag' },
  { code: 'Mi', name: 'Mittwoch' },
  { code: 'Do', name: 'Donnerstag' },
  { code: 'Fr', name: 'Freitag' },
  { code: 'Sa', name: 'Samstag' },
  { code: 'So', name: 'Sonntag' },
];

/** Regulärer Ausbildungs-/Dienstabend, sofern keine andere Wahl gespeichert ist. */
export const STANDARD_DIENSTTAG: Wochentag = 'Mo';

export function diensttagName(code: Wochentag): string {
  return WOCHENTAG_OPTIONEN.find((w) => w.code === code)?.name ?? code;
}

export function istWochentagCode(wert: unknown): wert is Wochentag {
  return (WOCHENTAGE_ISO as readonly string[]).includes(wert as string);
}
