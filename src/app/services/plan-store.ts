import { Injectable, computed, signal } from '@angular/core';
import {
  KatsThema,
  PlanDocument,
  Termin,
  leererTermin,
  leeresDocument,
  neueId,
} from '../models/plan.model';
import { MONATSNAMEN, monatIndex } from '../utils/datum';

export interface MonatsGruppe {
  index: number;
  name: string;
  termine: Termin[];
}

const MAX_HISTORIE = 100;

/**
 * Zentraler Zustand des Plans.
 *
 * Alle Änderungen laufen über `mutiere`, damit Undo/Redo und das
 * "ungespeichert"-Kennzeichen ohne Zutun der Views funktionieren.
 */
@Injectable({ providedIn: 'root' })
export class PlanStore {
  private readonly zustand = signal<PlanDocument>(leeresDocument());
  private readonly historie = signal<PlanDocument[]>([]);
  private readonly zukunft = signal<PlanDocument[]>([]);

  readonly dokument = this.zustand.asReadonly();
  readonly ungespeichert = signal(false);

  readonly termine = computed(() => this.zustand().termine);
  readonly backlog = computed(() => this.zustand().backlog);
  readonly katsThemen = computed(() => this.zustand().katsThemen);
  readonly jahr = computed(() => this.zustand().jahr);

  readonly hatDaten = computed(() => this.termine().length > 0 || this.backlog().length > 0);
  readonly kannRueckgaengig = computed(() => this.historie().length > 0);
  readonly kannWiederholen = computed(() => this.zukunft().length > 0);

  /** Termine nach Monat gruppiert – Grundlage der Jahresplan-Ansicht. */
  readonly monate = computed<MonatsGruppe[]>(() => {
    const gruppen = new Map<number, Termin[]>();
    for (const termin of this.sortierteTermine()) {
      const index = termin.datum ? monatIndex(termin.datum) : 12;
      (gruppen.get(index) ?? gruppen.set(index, []).get(index)!).push(termin);
    }
    return [...gruppen.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, termine]) => ({
        index,
        name: MONATSNAMEN[index] ?? 'Ohne Datum',
        termine,
      }));
  });

  readonly katsThemaNachId = computed(() => new Map(this.katsThemen().map((t) => [t.id, t])));

  private sortierteTermine(): Termin[] {
    return [...this.termine()].sort((a, b) => (a.datum ?? '').localeCompare(b.datum ?? ''));
  }

  terminNachId(id: string): Termin | undefined {
    return this.termine().find((t) => t.id === id) ?? this.backlog().find((t) => t.id === id);
  }

  // ---------------------------------------------------------------- Dokument

  setzeDokument(dokument: PlanDocument): void {
    this.zustand.set(dokument);
    this.historie.set([]);
    this.zukunft.set([]);
    this.ungespeichert.set(false);
  }

  alsGespeichertMarkieren(): void {
    this.ungespeichert.set(false);
  }

  setzeJahr(jahr: number): void {
    this.mutiere((d) => ({ ...d, jahr }));
  }

  setzeTitel(titel: string): void {
    this.mutiere((d) => ({ ...d, titel }));
  }

  // ------------------------------------------------------------------ Termine

  neuerTermin(datum: string): string {
    const termin = leererTermin(datum);
    this.mutiere((d) => ({ ...d, termine: [...d.termine, termin] }));
    return termin.id;
  }

  /** Übernimmt einen fertig ausgefüllten Entwurf (neuer Eintrag aus dem Dialog). */
  fuegeTerminEin(entwurf: Termin): string {
    const termin = { ...entwurf, id: neueId() };
    this.mutiere((d) =>
      termin.datum
        ? { ...d, termine: [...d.termine, termin] }
        : { ...d, backlog: [termin, ...d.backlog] },
    );
    return termin.id;
  }

  /** Zieht einen geplanten Termin auf ein bisher unbelegtes Datum. */
  verschiebeAufDatum(id: string, datum: string): void {
    this.mutiere((d) => ({
      ...d,
      termine: d.termine.map((t) => (t.id === id ? { ...t, datum } : t)),
    }));
  }

  aktualisiereTermin(id: string, aenderung: Partial<Termin>): void {
    const anwenden = (liste: Termin[]) =>
      liste.map((t) => (t.id === id ? { ...t, ...aenderung, id: t.id } : t));
    this.mutiere((d) => ({ ...d, termine: anwenden(d.termine), backlog: anwenden(d.backlog) }));
  }

  loescheTermin(id: string): void {
    this.mutiere((d) => ({
      ...d,
      termine: d.termine.filter((t) => t.id !== id),
      backlog: d.backlog.filter((t) => t.id !== id),
    }));
  }

  /** Zwei geplante Termine tauschen ihr Datum – die Drag-&-Drop-Grundoperation. */
  tauscheDatum(idA: string, idB: string): void {
    if (idA === idB) {
      return;
    }
    this.mutiere((d) => {
      const a = d.termine.find((t) => t.id === idA);
      const b = d.termine.find((t) => t.id === idB);
      if (!a || !b) {
        return d;
      }
      return {
        ...d,
        termine: d.termine.map((t) =>
          t.id === idA ? { ...t, datum: b.datum } : t.id === idB ? { ...t, datum: a.datum } : t,
        ),
      };
    });
  }

  /** Termin verliert sein Datum und landet in den offenen Ideen. */
  zuBacklog(id: string): void {
    this.mutiere((d) => {
      const termin = d.termine.find((t) => t.id === id);
      if (!termin) {
        return d;
      }
      return {
        ...d,
        termine: d.termine.filter((t) => t.id !== id),
        backlog: [{ ...termin, datum: null }, ...d.backlog],
      };
    });
  }

  /**
   * Idee auf einen Termin ziehen: Die Idee übernimmt das Datum, der bisherige
   * Termin wandert zurück in die Ideen. Leere Platzhalter werden dabei verworfen.
   */
  ausBacklogAufTermin(ideeId: string, zielId: string): void {
    this.mutiere((d) => {
      const idee = d.backlog.find((t) => t.id === ideeId);
      const ziel = d.termine.find((t) => t.id === zielId);
      if (!idee || !ziel || idee.id === ziel.id) {
        return d;
      }
      // Ein freier Slot wird nur befüllt; ein belegter tauscht mit der Idee.
      const zielFrei = !ziel.thema.trim();
      const uebernahme = {
        ...idee,
        datum: ziel.datum,
        hinweis: zielFrei ? ziel.hinweis || idee.hinweis : idee.hinweis,
      };
      return {
        ...d,
        termine: d.termine.map((t) => (t.id === zielId ? uebernahme : t)),
        backlog: [
          ...(zielFrei ? [] : [{ ...ziel, datum: null }]),
          ...d.backlog.filter((t) => t.id !== ideeId),
        ],
      };
    });
  }

  /** Idee auf ein freies Datum legen (z. B. über den Datumsdialog). */
  ausBacklogAufDatum(ideeId: string, datum: string): void {
    this.mutiere((d) => {
      const idee = d.backlog.find((t) => t.id === ideeId);
      if (!idee) {
        return d;
      }
      return {
        ...d,
        termine: [...d.termine, { ...idee, datum }],
        backlog: d.backlog.filter((t) => t.id !== ideeId),
      };
    });
  }

  neueIdee(vorlage: Partial<Termin> = {}): string {
    const idee = { ...leererTermin(null), ...vorlage, id: neueId(), datum: null };
    this.mutiere((d) => ({ ...d, backlog: [idee, ...d.backlog] }));
    return idee.id;
  }

  /** Reihenfolge der Ideen (reines Sortieren innerhalb des Backlogs). */
  sortiereBacklog(von: number, nach: number): void {
    this.mutiere((d) => {
      const backlog = [...d.backlog];
      const [eintrag] = backlog.splice(von, 1);
      if (!eintrag) {
        return d;
      }
      backlog.splice(nach, 0, eintrag);
      return { ...d, backlog };
    });
  }

  // -------------------------------------------------------------- KatS-A-Plan

  neuesKatsThema(vorlage: Partial<KatsThema> = {}): string {
    const thema: KatsThema = {
      id: neueId(),
      nummer: '',
      titel: '',
      beschreibung: '',
      pflicht: true,
      ...vorlage,
    };
    this.mutiere((d) => ({ ...d, katsThemen: [...d.katsThemen, thema] }));
    return thema.id;
  }

  /**
   * Ändert ein Thema. Ein neuer Titel wird auf alle verweisenden Einträge
   * übertragen – nur so bleibt die Verknüpfung über einen Excel-Umlauf hinweg
   * erhalten, denn die Mappe kennt nur Nummer und Titel.
   */
  aktualisiereKatsThema(id: string, aenderung: Partial<KatsThema>): void {
    this.mutiere((d) => {
      const katsThemen = d.katsThemen.map((t) =>
        t.id === id ? { ...t, ...aenderung, id: t.id } : t,
      );
      if (aenderung.titel === undefined) {
        return { ...d, katsThemen };
      }
      const titel = aenderung.titel;
      const nachziehen = (liste: Termin[]) =>
        liste.map((t) => (t.katsThemaId === id ? { ...t, katsTitel: titel } : t));
      return {
        ...d,
        katsThemen,
        termine: nachziehen(d.termine),
        backlog: nachziehen(d.backlog),
      };
    });
  }

  /** Löscht ein Thema und entfernt alle Querverweise darauf. */
  loescheKatsThema(id: string): void {
    const entkoppeln = (liste: Termin[]) =>
      liste.map((t) => (t.katsThemaId === id ? { ...t, katsThemaId: null } : t));
    this.mutiere((d) => ({
      ...d,
      katsThemen: d.katsThemen.filter((t) => t.id !== id),
      termine: entkoppeln(d.termine),
      backlog: entkoppeln(d.backlog),
    }));
  }

  /** Verknüpft einen Termin mit einem KatS-Thema und übernimmt dessen Titel. */
  setzeKatsBezug(terminId: string, themaId: string | null): void {
    const thema = themaId ? this.katsThemen().find((t) => t.id === themaId) : null;
    this.aktualisiereTermin(terminId, {
      katsThemaId: thema?.id ?? null,
      katsTitel: thema?.titel ?? '',
      katsPflicht: thema ? true : false,
    });
  }

  /** Legt für eine Idee/einen Termin ein neues KatS-Thema an und verknüpft es. */
  uebernehmeAlsKatsThema(terminId: string): void {
    const termin = this.terminNachId(terminId);
    if (!termin) {
      return;
    }
    const titel = (termin.katsTitel || termin.thema).replace(/\s+/g, ' ').trim();
    if (!titel) {
      return;
    }
    const id = this.neuesKatsThema({ titel });
    this.setzeKatsBezug(terminId, id);
  }

  // ------------------------------------------------------------ Undo / Redo

  rueckgaengig(): void {
    const historie = this.historie();
    const vorher = historie.at(-1);
    if (!vorher) {
      return;
    }
    this.historie.set(historie.slice(0, -1));
    this.zukunft.update((z) => [...z, this.zustand()]);
    this.zustand.set(vorher);
    this.ungespeichert.set(true);
  }

  wiederholen(): void {
    const zukunft = this.zukunft();
    const naechster = zukunft.at(-1);
    if (!naechster) {
      return;
    }
    this.zukunft.set(zukunft.slice(0, -1));
    this.historie.update((h) => [...h, this.zustand()]);
    this.zustand.set(naechster);
    this.ungespeichert.set(true);
  }

  private mutiere(fn: (dokument: PlanDocument) => PlanDocument): void {
    const vorher = this.zustand();
    const nachher = fn(vorher);
    if (nachher === vorher) {
      return;
    }
    this.historie.update((h) => [...h, vorher].slice(-MAX_HISTORIE));
    this.zukunft.set([]);
    this.zustand.set(nachher);
    this.ungespeichert.set(true);
  }
}
