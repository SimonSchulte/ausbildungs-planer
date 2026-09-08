import {
  StorageFaehigkeiten,
  StorageFehler,
  WorkbookInhalt,
  WorkbookStorage,
} from './workbook-storage';

export interface NextcloudKonfiguration {
  /** Basis-URL der Instanz, z. B. `https://cloud.example.org`. */
  serverUrl: string;
  /** Pfad der Datei innerhalb des Ziels, z. B. `Ausbildung/Rahmenplan_2026.xlsx`. */
  pfad: string;
  /**
   * `benutzer`: WebDAV über das persönliche Verzeichnis (Benutzername + App-Passwort).
   * `freigabe`: öffentlicher Freigabelink; `token` ist der Teil hinter `/s/`.
   * `worker`: über den Cloudflare-Worker-CORS-Proxy (siehe `worker/README.md`) – die
   * NextCloud-Zugangsdaten liegen dabei nur im Worker, nicht im Browser.
   */
  modus: 'benutzer' | 'freigabe' | 'worker';
  benutzer: string;
  /** App-Passwort bzw. Passwort der Freigabe (leer, wenn die Freigabe offen ist). */
  passwort: string;
  token: string;
  /** URL des Cloudflare Workers, nur für `modus: 'worker'`. */
  workerUrl: string;
  /** Von der App im Header `X-Auth-Token` mitgeschickter Wert, nur für `modus: 'worker'`. */
  workerSchluessel: string;
}

export function leereNextcloudKonfiguration(): NextcloudKonfiguration {
  return {
    serverUrl: '',
    pfad: '',
    modus: 'worker',
    benutzer: '',
    passwort: '',
    token: '',
    workerUrl: '',
    workerSchluessel: '',
  };
}

/**
 * NextCloud über WebDAV – direkter Browser-Zugriff (`benutzer`/`freigabe`).
 *
 * Hinweis: Der Browser muss die Instanz per CORS erlauben. Ohne passende
 * `Access-Control-Allow-Origin`-Header der NextCloud (bzw. ohne Reverse Proxy
 * unter derselben Origin) scheitert der Zugriff aus einer GitHub-Pages-App.
 * Für `modus: 'worker'` siehe stattdessen `NextcloudWorkerStorage`.
 */
export class NextcloudStorage implements WorkbookStorage {
  readonly art = 'nextcloud' as const;
  readonly faehigkeiten: StorageFaehigkeiten = { direktesSpeichern: true, neuLaden: true };

  constructor(private readonly konfig: NextcloudKonfiguration) {
    if (konfig.modus === 'worker') {
      throw new StorageFehler(
        'Interner Fehler: modus "worker" wird von NextcloudWorkerStorage behandelt, nicht von NextcloudStorage.',
      );
    }
    if (!konfig.serverUrl.trim()) {
      throw new StorageFehler('Es wurde keine Server-URL angegeben.');
    }
    if (!konfig.pfad.trim()) {
      throw new StorageFehler('Es wurde kein Dateipfad angegeben.');
    }
    if (konfig.modus === 'benutzer' && !konfig.benutzer.trim()) {
      throw new StorageFehler('Für den Benutzer-Modus wird ein Benutzername benötigt.');
    }
    if (konfig.modus === 'freigabe' && !konfig.token.trim()) {
      throw new StorageFehler('Für den Freigabe-Modus wird ein Freigabe-Token benötigt.');
    }
  }

  get bezeichnung(): string {
    return `NextCloud · ${this.dateiname}`;
  }

  get dateiname(): string {
    return this.konfig.pfad.split('/').filter(Boolean).pop() ?? 'Rahmenplan.xlsx';
  }

  async laden(): Promise<WorkbookInhalt> {
    const antwort = await this.anfrage('GET');
    return { daten: await antwort.arrayBuffer(), dateiname: this.dateiname };
  }

  async speichern(daten: ArrayBuffer): Promise<void> {
    await this.anfrage('PUT', daten);
  }

  private async anfrage(methode: 'GET' | 'PUT', koerper?: ArrayBuffer): Promise<Response> {
    let antwort: Response;
    try {
      antwort = await fetch(this.url(), {
        method: methode,
        headers: this.header(koerper !== undefined),
        body: koerper,
      });
    } catch (ursache) {
      throw new StorageFehler(
        'NextCloud ist nicht erreichbar. Häufigste Ursache: die Instanz erlaubt keine ' +
          'CORS-Anfragen von dieser Adresse.',
        ursache,
      );
    }
    if (!antwort.ok) {
      throw new StorageFehler(`NextCloud antwortete mit ${antwort.status} ${antwort.statusText}.`);
    }
    return antwort;
  }

  private url(): string {
    const basis = this.konfig.serverUrl.trim().replace(/\/+$/, '');
    const pfad = this.konfig.pfad
      .trim()
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    return this.konfig.modus === 'freigabe'
      ? `${basis}/public.php/webdav/${pfad}`
      : `${basis}/remote.php/dav/files/${encodeURIComponent(this.konfig.benutzer.trim())}/${pfad}`;
  }

  private header(mitKoerper: boolean): Record<string, string> {
    const nutzer =
      this.konfig.modus === 'freigabe' ? this.konfig.token.trim() : this.konfig.benutzer.trim();
    const header: Record<string, string> = {
      Authorization: `Basic ${btoa(unescape(encodeURIComponent(`${nutzer}:${this.konfig.passwort}`)))}`,
    };
    if (mitKoerper) {
      header['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    return header;
  }
}
