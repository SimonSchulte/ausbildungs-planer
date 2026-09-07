import { Injectable, signal } from '@angular/core';
import { BundeslandCode, STANDARD_BUNDESLAND, istBundeslandCode } from '../data/bundeslaender';
import { berechneFeiertage } from '../data/feiertage-berechnet';

const API = 'https://feiertage-api.de/api/';
const LAND_SCHLUESSEL = 'ausbildungsplaner.bundesland';
const CACHE_PRAEFIX = 'ausbildungsplaner.feiertage.';

/** Woher die aktuell angezeigten Feiertage stammen. */
export type FeiertagQuelle = 'api' | 'zwischenspeicher' | 'berechnet';

/**
 * Gesetzliche Feiertage.
 *
 * Führende Quelle ist feiertage-api.de; erfolgreiche Abrufe landen im
 * localStorage. Ist die API nicht erreichbar (kein Netz, oder sie sendet keine
 * CORS-Header für diese Origin), wird lokal gerechnet – die Termine sind
 * deterministisch, die App bleibt also auch offline korrekt. Ohne Feiertage
 * würde Ostermontag sonst fälschlich als Ausbildungslücke rot erscheinen.
 */
@Injectable({ providedIn: 'root' })
export class FeiertagService {
  readonly bundesland = signal<BundeslandCode>(gespeichertesLand());
  /** ISO-Datum → Name des Feiertags. */
  readonly feiertage = signal<ReadonlyMap<string, string>>(new Map());
  readonly quelle = signal<FeiertagQuelle>('berechnet');
  readonly laedt = signal(false);

  private geladen = '';

  name(datum: string): string | null {
    return this.feiertage().get(datum) ?? null;
  }

  /** Das Bundesland ist Teil des Ladeschlüssels – die Ansicht lädt daraufhin neu. */
  setzeBundesland(land: BundeslandCode): void {
    if (land === this.bundesland()) {
      return;
    }
    this.geladen = '';
    this.bundesland.set(land);
    merkeLand(land);
  }

  /** Lädt die Feiertage eines Jahres; wiederholte Aufrufe für dasselbe Jahr sind billig. */
  async lade(jahr: number, erzwingen = false): Promise<void> {
    const land = this.bundesland();
    const schluessel = `${jahr}.${land}`;
    if (!erzwingen && this.geladen === schluessel) {
      return;
    }

    // Sofort rechnen, damit die Ansicht nie ohne Feiertage dasteht.
    this.feiertage.set(berechneFeiertage(jahr, land));
    this.quelle.set('berechnet');

    const zwischengespeichert = ausCache(schluessel);
    if (zwischengespeichert) {
      this.feiertage.set(zwischengespeichert);
      this.quelle.set('zwischenspeicher');
    }

    this.laedt.set(true);
    try {
      const vonApi = await holeVonApi(jahr, land);
      if (vonApi.size) {
        this.feiertage.set(vonApi);
        this.quelle.set('api');
        inCache(schluessel, vonApi);
      }
    } catch {
      // Berechnung bzw. Zwischenspeicher bleiben stehen – kein Grund zu scheitern.
    } finally {
      this.laedt.set(false);
      this.geladen = schluessel;
    }
  }
}

/** Antwortform: `{ "Neujahrstag": { "datum": "2026-01-01", "hinweis": "" }, … }`. */
async function holeVonApi(jahr: number, land: BundeslandCode): Promise<Map<string, string>> {
  const antwort = await fetch(`${API}?jahr=${jahr}&nur_land=${land}`, {
    headers: { Accept: 'application/json' },
  });
  if (!antwort.ok) {
    throw new Error(`feiertage-api antwortete mit ${antwort.status}`);
  }
  return leseAntwort(await antwort.json());
}

/** Die API liefert je nach Aufruf ein Objekt mit `datum` oder direkt den Datumsstring. */
export function leseAntwort(rohdaten: unknown): Map<string, string> {
  const feiertage = new Map<string, string>();
  if (!rohdaten || typeof rohdaten !== 'object') {
    return feiertage;
  }
  for (const [name, wert] of Object.entries(rohdaten as Record<string, unknown>)) {
    const datum =
      typeof wert === 'string'
        ? wert
        : typeof (wert as { datum?: unknown })?.datum === 'string'
          ? (wert as { datum: string }).datum
          : null;
    if (datum && /^\d{4}-\d{2}-\d{2}$/.test(datum)) {
      feiertage.set(datum, name);
    }
  }
  return feiertage;
}

function gespeichertesLand(): BundeslandCode {
  try {
    const wert = localStorage.getItem(LAND_SCHLUESSEL);
    return istBundeslandCode(wert) ? wert : STANDARD_BUNDESLAND;
  } catch {
    return STANDARD_BUNDESLAND;
  }
}

function merkeLand(land: BundeslandCode): void {
  try {
    localStorage.setItem(LAND_SCHLUESSEL, land);
  } catch {
    // Privater Modus – die Auswahl gilt dann nur für diese Sitzung.
  }
}

function ausCache(schluessel: string): Map<string, string> | null {
  try {
    const roh = localStorage.getItem(CACHE_PRAEFIX + schluessel);
    if (!roh) {
      return null;
    }
    const eintraege = JSON.parse(roh) as [string, string][];
    return Array.isArray(eintraege) && eintraege.length ? new Map(eintraege) : null;
  } catch {
    return null;
  }
}

function inCache(schluessel: string, feiertage: Map<string, string>): void {
  try {
    localStorage.setItem(CACHE_PRAEFIX + schluessel, JSON.stringify([...feiertage]));
  } catch {
    // Kein Platz oder kein Zugriff – der nächste Start rechnet eben wieder.
  }
}
