/** Bundesland-Codes der feiertage-api.de. */
export const BUNDESLAENDER = [
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bayern' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hessen' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NI', name: 'Niedersachsen' },
  { code: 'NW', name: 'Nordrhein-Westfalen' },
  { code: 'RP', name: 'Rheinland-Pfalz' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Sachsen' },
  { code: 'ST', name: 'Sachsen-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thüringen' },
] as const;

export type BundeslandCode = (typeof BUNDESLAENDER)[number]['code'];

export const STANDARD_BUNDESLAND: BundeslandCode = 'NW';

export function bundeslandName(code: BundeslandCode): string {
  return BUNDESLAENDER.find((l) => l.code === code)?.name ?? code;
}

export function istBundeslandCode(wert: unknown): wert is BundeslandCode {
  return BUNDESLAENDER.some((l) => l.code === wert);
}
