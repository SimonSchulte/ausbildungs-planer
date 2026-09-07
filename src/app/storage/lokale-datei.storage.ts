import {
  StorageFaehigkeiten,
  StorageFehler,
  WorkbookInhalt,
  WorkbookStorage,
} from './workbook-storage';

/** Ausschnitt der File System Access API – noch nicht in den TS-Standard-Libs. */
interface DateiHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: BufferSource): Promise<void>; close(): Promise<void> }>;
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface DateiPickerFenster {
  showOpenFilePicker?(opts?: unknown): Promise<DateiHandle[]>;
  showSaveFilePicker?(opts?: unknown): Promise<DateiHandle>;
}

const XLSX_TYP = {
  description: 'Excel-Arbeitsmappe',
  accept: {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  },
};

function fenster(): DateiPickerFenster {
  return window as unknown as DateiPickerFenster;
}

/** Browser unterstützt echtes Zurückschreiben in dieselbe Datei. */
export function unterstuetztDateiZugriff(): boolean {
  return typeof fenster().showOpenFilePicker === 'function';
}

/**
 * Lokale Excel-Datei.
 *
 * Mit File System Access API (Chrome/Edge) wird direkt in die geöffnete Datei
 * zurückgeschrieben; sonst wird beim Speichern ein Download angestoßen und die
 * Datei muss vom Nutzer wieder an ihren Platz gelegt werden.
 */
export class LokaleDateiStorage implements WorkbookStorage {
  readonly art = 'lokale-datei' as const;

  private constructor(
    private datei: File | null,
    private readonly handle: DateiHandle | null,
  ) {}

  static ausDatei(datei: File): LokaleDateiStorage {
    return new LokaleDateiStorage(datei, null);
  }

  /** Öffnet einen Dateidialog mit Schreibrecht (nur wo die API verfügbar ist). */
  static async auswaehlen(): Promise<LokaleDateiStorage> {
    const picker = fenster().showOpenFilePicker;
    if (!picker) {
      throw new StorageFehler('Dieser Browser unterstützt keinen direkten Dateizugriff.');
    }
    const [handle] = await picker.call(window, {
      types: [XLSX_TYP],
      multiple: false,
      excludeAcceptAllOption: false,
    });
    return new LokaleDateiStorage(null, handle);
  }

  get bezeichnung(): string {
    return this.handle?.name ?? this.datei?.name ?? 'Unbenannt.xlsx';
  }

  get faehigkeiten(): StorageFaehigkeiten {
    const direkt = this.handle !== null;
    return { direktesSpeichern: direkt, neuLaden: direkt };
  }

  async laden(): Promise<WorkbookInhalt> {
    if (this.handle) {
      await this.rechtePruefen('read');
      this.datei = await this.handle.getFile();
    }
    if (!this.datei) {
      throw new StorageFehler('Keine Datei ausgewählt.');
    }
    return { daten: await this.datei.arrayBuffer(), dateiname: this.datei.name };
  }

  async speichern(daten: ArrayBuffer, dateiname: string): Promise<void> {
    if (this.handle) {
      await this.rechtePruefen('readwrite');
      const writable = await this.handle.createWritable();
      await writable.write(daten);
      await writable.close();
      return;
    }
    herunterladen(daten, dateiname);
  }

  private async rechtePruefen(mode: 'read' | 'readwrite'): Promise<void> {
    const handle = this.handle;
    if (!handle?.queryPermission) {
      return;
    }
    if ((await handle.queryPermission({ mode })) === 'granted') {
      return;
    }
    if ((await handle.requestPermission?.({ mode })) !== 'granted') {
      throw new StorageFehler('Zugriff auf die Datei wurde abgelehnt.');
    }
  }
}

export function herunterladen(daten: ArrayBuffer, dateiname: string): void {
  const url = URL.createObjectURL(
    new Blob([daten], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  a.click();
  URL.revokeObjectURL(url);
}
