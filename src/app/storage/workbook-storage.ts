/**
 * Persistenz-Abstraktion.
 *
 * Die App kennt nur `WorkbookStorage` – "Excel-Datei hochladen" ist lediglich
 * eine Implementierung davon. Eine NextCloud-Anbindung (WebDAV) ist eine
 * zweite; weitere (S3, SharePoint …) lassen sich ergänzen, ohne dass die
 * Views oder der Store davon erfahren.
 */

export type StorageArt = 'lokale-datei' | 'nextcloud';

export interface WorkbookInhalt {
  daten: ArrayBuffer;
  dateiname: string;
}

export interface StorageFaehigkeiten {
  /** Schreibt ohne erneute Nutzerinteraktion an dieselbe Stelle zurück. */
  direktesSpeichern: boolean;
  /** Kann den aktuellen Stand vom Ziel neu einlesen. */
  neuLaden: boolean;
}

export interface WorkbookStorage {
  readonly art: StorageArt;
  /** Kurzbeschreibung für die Oberfläche, z. B. "Rahmenplan_2026.xlsx". */
  readonly bezeichnung: string;
  readonly faehigkeiten: StorageFaehigkeiten;
  laden(): Promise<WorkbookInhalt>;
  speichern(daten: ArrayBuffer, dateiname: string): Promise<void>;
}

export class StorageFehler extends Error {
  constructor(
    message: string,
    readonly ursache?: unknown,
  ) {
    super(message);
    this.name = 'StorageFehler';
  }
}
