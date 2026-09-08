import {
  StorageFaehigkeiten,
  StorageFehler,
  WorkbookInhalt,
  WorkbookStorage,
} from './workbook-storage';
import { NextcloudKonfiguration } from './nextcloud.storage';

/**
 * NextCloud über den Cloudflare-Worker-CORS-Proxy (siehe `worker/README.md`).
 *
 * Im Unterschied zu `NextcloudStorage` spricht der Browser hier nicht direkt
 * mit NextCloud, sondern mit einem Worker unter eigener Origin, der seinerseits
 * (ohne CORS-Beschränkung, da kein Browser) mit dem NextCloud-Freigabelink
 * spricht. Die echten NextCloud-Zugangsdaten liegen dabei nur im Worker als
 * Secret, nicht im Browser – der `workerSchluessel` ist kein Ersatz dafür,
 * siehe Sicherheitshinweis in `worker/src/index.ts`.
 */
export class NextcloudWorkerStorage implements WorkbookStorage {
  readonly art = 'nextcloud' as const;
  readonly faehigkeiten: StorageFaehigkeiten = { direktesSpeichern: true, neuLaden: true };

  constructor(private readonly konfig: NextcloudKonfiguration) {
    if (!konfig.workerUrl.trim()) {
      throw new StorageFehler('Es wurde keine Worker-URL angegeben.');
    }
    if (!konfig.workerSchluessel.trim()) {
      throw new StorageFehler('Es wurde kein Zugriffsschlüssel angegeben.');
    }
  }

  get bezeichnung(): string {
    try {
      return `NextCloud über Worker · ${new URL(this.konfig.workerUrl.trim()).host}`;
    } catch {
      return 'NextCloud über Worker';
    }
  }

  async laden(): Promise<WorkbookInhalt> {
    const antwort = await this.anfrage('GET');
    return { daten: await antwort.arrayBuffer(), dateiname: this.dateiname };
  }

  async speichern(daten: ArrayBuffer): Promise<void> {
    await this.anfrage('PUT', daten);
  }

  private get dateiname(): string {
    return this.konfig.pfad.split('/').filter(Boolean).pop() || 'Rahmenplan.xlsx';
  }

  private async anfrage(methode: 'GET' | 'PUT', koerper?: ArrayBuffer): Promise<Response> {
    let antwort: Response;
    try {
      antwort = await fetch(this.konfig.workerUrl.trim(), {
        method: methode,
        headers: { 'X-Auth-Token': this.konfig.workerSchluessel.trim() },
        body: koerper,
      });
    } catch (ursache) {
      throw new StorageFehler('Der Worker ist nicht erreichbar.', ursache);
    }
    if (antwort.status === 401) {
      throw new StorageFehler('Der Worker hat den Zugriffsschlüssel abgelehnt.');
    }
    if (!antwort.ok) {
      throw new StorageFehler(`Der Worker antwortete mit ${antwort.status} ${antwort.statusText}.`);
    }
    return antwort;
  }
}
