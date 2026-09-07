import * as XLSX from '@e965/xlsx';
import { KatsThema, PlanDocument, Termin } from '../models/plan.model';
import { isoZuSerial, wochentag } from '../utils/datum';
import {
  BLATT_BACKLOG,
  BLATT_KATS,
  SPALTEN_BREITEN,
  SPALTEN_UEBERSCHRIFTEN,
  SpaltenFeld,
  blattJahresplan,
} from './excel-schema';

const DATUMS_FORMAT = 'DD.MM.YYYY';

const BACKLOG_FELDER: SpaltenFeld[] = SPALTEN_UEBERSCHRIFTEN.map((s) => s.feld).filter(
  (feld) => feld !== 'datum' && feld !== 'tag',
);

/**
 * Schreibt das Dokument als Excel-Arbeitsmappe.
 *
 * Jahresplan und "Offene Ideen" nutzen dieselbe Spaltenreihenfolge – das Ideen-Blatt
 * lässt lediglich Datum und Tag weg. Zusätzlich entsteht das Blatt "KatS-A-Plan"
 * mit der gepflegten Themenliste, über die quer referenziert wird.
 */
export function schreibeArbeitsmappe(dokument: PlanDocument): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const nummern = new Map(dokument.katsThemen.map((t) => [t.id, t.nummer]));

  XLSX.utils.book_append_sheet(
    wb,
    jahresplanBlatt(dokument, nummern),
    blattJahresplan(dokument.jahr),
  );
  XLSX.utils.book_append_sheet(wb, backlogBlatt(dokument.backlog, nummern), BLATT_BACKLOG);
  XLSX.utils.book_append_sheet(wb, katsBlatt(dokument.katsThemen), BLATT_KATS);

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

function jahresplanBlatt(dokument: PlanDocument, nummern: Map<string, string>): XLSX.WorkSheet {
  const felder = SPALTEN_UEBERSCHRIFTEN.map((s) => s.feld);
  const kopf = SPALTEN_UEBERSCHRIFTEN.map((s) => s.text);
  const daten = [...dokument.termine]
    .sort((a, b) => (a.datum ?? '').localeCompare(b.datum ?? ''))
    .map((termin) => felder.map((feld) => zelle(termin, feld, nummern)));

  const ws = XLSX.utils.aoa_to_sheet([[dokument.titel], [], kopf, ...daten]);
  const datumSpalte = felder.indexOf('datum');
  daten.forEach((_, i) => {
    const termin = sortiert(dokument.termine)[i];
    if (termin.datum) {
      setzeDatum(ws, 3 + i, datumSpalte, termin.datum);
    }
  });
  ws['!cols'] = felder.map((feld) => ({ wch: SPALTEN_BREITEN[feld] }));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.min(6, felder.length - 1) } }];
  ws['!autofilter'] = { ref: bereich(2, 0, 2 + daten.length, felder.length - 1) };
  return ws;
}

function backlogBlatt(backlog: Termin[], nummern: Map<string, string>): XLSX.WorkSheet {
  const kopf = BACKLOG_FELDER.map(
    (feld) => SPALTEN_UEBERSCHRIFTEN.find((s) => s.feld === feld)!.text,
  );
  const daten = backlog.map((termin) => BACKLOG_FELDER.map((feld) => zelle(termin, feld, nummern)));
  const ws = XLSX.utils.aoa_to_sheet([kopf, ...daten]);
  ws['!cols'] = BACKLOG_FELDER.map((feld) => ({ wch: SPALTEN_BREITEN[feld] }));
  ws['!autofilter'] = { ref: bereich(0, 0, daten.length, BACKLOG_FELDER.length - 1) };
  return ws;
}

function katsBlatt(themen: KatsThema[]): XLSX.WorkSheet {
  const kopf = ['Nr.', 'Titel', 'Pflicht', 'Beschreibung'];
  const daten = themen.map((t) => [t.nummer, t.titel, t.pflicht ? 'X' : '', t.beschreibung]);
  const ws = XLSX.utils.aoa_to_sheet([kopf, ...daten]);
  ws['!cols'] = [{ wch: 10 }, { wch: 48 }, { wch: 10 }, { wch: 60 }];
  ws['!autofilter'] = { ref: bereich(0, 0, daten.length, kopf.length - 1) };
  return ws;
}

function sortiert(termine: Termin[]): Termin[] {
  return [...termine].sort((a, b) => (a.datum ?? '').localeCompare(b.datum ?? ''));
}

function zelle(termin: Termin, feld: SpaltenFeld, nummern: Map<string, string>): string {
  if (feld.startsWith('nachweis:')) {
    return termin.nachweise.includes(feld.slice('nachweis:'.length) as never) ? 'X' : '';
  }
  switch (feld) {
    case 'datum':
      return termin.datum ?? '';
    case 'tag':
      return termin.datum ? wochentag(termin.datum) : '';
    case 'hinweis':
      return termin.hinweis;
    case 'kategorie':
      return termin.kategorie;
    case 'thema':
      return termin.thema;
    case 'ausbilder':
      return termin.ausbilder;
    case 'katsPflicht':
      return termin.katsPflicht ? 'X' : '';
    case 'katsNummer':
      return termin.katsThemaId ? (nummern.get(termin.katsThemaId) ?? '') : '';
    case 'katsTitel':
      return termin.katsTitel;
    case 'hgmInhalt':
      return termin.hgmInhalt;
    case 'hgmTitel':
      return termin.hgmTitel;
    case 'material':
      return termin.material;
    case 'anforderungen':
      return termin.anforderungen;
    case 'notizen':
      return termin.notizen;
    default:
      return '';
  }
}

/** Datum als echte Excel-Seriennummer schreiben, damit Filter und Formeln greifen. */
function setzeDatum(ws: XLSX.WorkSheet, zeile: number, spalte: number, iso: string): void {
  const adresse = XLSX.utils.encode_cell({ r: zeile, c: spalte });
  ws[adresse] = { t: 'n', v: isoZuSerial(iso), z: DATUMS_FORMAT };
}

function bereich(r1: number, c1: number, r2: number, c2: number): string {
  return `${XLSX.utils.encode_cell({ r: r1, c: c1 })}:${XLSX.utils.encode_cell({ r: r2, c: c2 })}`;
}
