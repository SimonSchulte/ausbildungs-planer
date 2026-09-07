import * as XLSX from '@e965/xlsx';
import { istKategorieToken, normalisiereKategorie } from '../data/kategorien';
import {
  KatsThema,
  NachweisKey,
  PlanDocument,
  Termin,
  leererTermin,
  leeresDocument,
  neueId,
} from '../models/plan.model';
import { zuIsoDatum } from '../utils/datum';
import {
  BLATT_MUSTER,
  SpaltenFeld,
  alsText,
  erkenneSpalte,
  istWahr,
  normHeader,
} from './excel-schema';

type Zeile = unknown[];

export interface LeseErgebnis {
  dokument: PlanDocument;
  /** Hinweise für den Nutzer, z. B. zu bereinigten Alt-Zeilen. */
  meldungen: string[];
}

/** Liest eine Excel-Arbeitsmappe in das Domänenmodell ein. */
export function leseArbeitsmappe(daten: ArrayBuffer): LeseErgebnis {
  const wb = XLSX.read(new Uint8Array(daten), { type: 'array' });
  const meldungen: string[] = [];

  const jahresplanBlatt = findeBlatt(wb, BLATT_MUSTER.jahresplan) ?? wb.SheetNames[0];
  if (!jahresplanBlatt) {
    throw new Error('Die Arbeitsmappe enthält keine Blätter.');
  }
  const planZeilen = zeilen(wb, jahresplanBlatt);
  const kopf = findeKopfzeile(planZeilen);
  const zuordnung = spaltenZuordnung(planZeilen[kopf] ?? []);
  if (!zuordnung.has('thema') && !zuordnung.has('datum')) {
    throw new Error(
      `Im Blatt "${jahresplanBlatt}" wurde keine Kopfzeile mit "Datum"/"Thema" gefunden.`,
    );
  }

  const termine: Termin[] = [];
  const ohneDatum: Termin[] = [];
  for (const zeile of planZeilen.slice(kopf + 1)) {
    if (istLeer(zeile)) {
      continue;
    }
    const termin = leseTerminZeile(zeile, zuordnung);
    if (istInhaltslos(termin)) {
      continue;
    }
    (termin.datum ? termine : ohneDatum).push(termin);
  }
  if (ohneDatum.length) {
    meldungen.push(
      `${ohneDatum.length} Zeile(n) aus "${jahresplanBlatt}" hatten kein Datum und ` +
        'wurden in die offenen Ideen übernommen.',
    );
  }

  const backlogBlatt = findeBlatt(wb, BLATT_MUSTER.backlog);
  const backlog = [...ohneDatum];
  if (backlogBlatt) {
    const ergebnis = leseBacklog(zeilen(wb, backlogBlatt));
    backlog.push(...ergebnis.eintraege);
    if (ergebnis.aufgeraeumt > 0) {
      meldungen.push(
        `"${backlogBlatt}": ${ergebnis.aufgeraeumt} Zeile(n) in unterschiedlichen Alt-Formaten ` +
          'erkannt und auf das Schema des Jahresplans vereinheitlicht.',
      );
    }
  }

  const katsBlatt = findeBlatt(wb, BLATT_MUSTER.kats);
  let katsThemen = katsBlatt ? leseKatsThemen(zeilen(wb, katsBlatt)) : [];
  if (!katsThemen.length) {
    katsThemen = leiteKatsThemenAb([...termine, ...backlog]);
    if (katsThemen.length) {
      meldungen.push(
        `Die KatS-A-Plan-Liste wurde aus ${katsThemen.length} Titeln der Mappe aufgebaut ` +
          'und kann jetzt in der App gepflegt werden.',
      );
    }
  }
  verknuepfeKatsThemen([...termine, ...backlog], katsThemen);

  const jahr = ermittleJahr(jahresplanBlatt, termine);
  return {
    dokument: {
      ...leeresDocument(jahr),
      titel: findeTitel(planZeilen, kopf) || `Jahresplan ${jahr}`,
      termine: sortiereNachDatum(termine),
      backlog,
      katsThemen,
    },
    meldungen,
  };
}

function findeBlatt(wb: XLSX.WorkBook, muster: RegExp): string | undefined {
  return wb.SheetNames.find((name) => muster.test(name));
}

function zeilen(wb: XLSX.WorkBook, blatt: string): Zeile[] {
  const ws = wb.Sheets[blatt];
  if (!ws) {
    return [];
  }
  return XLSX.utils.sheet_to_json<Zeile>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
    raw: true,
  });
}

function istLeer(zeile: Zeile): boolean {
  return !zeile.some((z) => alsText(z) !== '');
}

function findeKopfzeile(zeilen: Zeile[]): number {
  const index = zeilen.findIndex((zeile) =>
    zeile.some((zelle) => {
      const feld = erkenneSpalte(zelle);
      return feld === 'datum' || feld === 'thema';
    }),
  );
  return index >= 0 ? index : 0;
}

/** Überschrift oberhalb der Kopfzeile (z. B. "(Jahres)Dienstplan BI EE 04"). */
function findeTitel(zeilen: Zeile[], kopf: number): string {
  for (let i = kopf - 1; i >= 0; i--) {
    const text = (zeilen[i] ?? []).map(alsText).find((t) => t !== '');
    if (text) {
      return text;
    }
  }
  return '';
}

function spaltenZuordnung(kopfzeile: Zeile): Map<SpaltenFeld, number> {
  const zuordnung = new Map<SpaltenFeld, number>();
  kopfzeile.forEach((zelle, index) => {
    const feld = erkenneSpalte(zelle);
    if (feld && !zuordnung.has(feld)) {
      zuordnung.set(feld, index);
    }
  });
  return zuordnung;
}

function leseTerminZeile(zeile: Zeile, zuordnung: Map<SpaltenFeld, number>): Termin {
  const wert = (feld: SpaltenFeld): unknown => {
    const index = zuordnung.get(feld);
    return index === undefined ? null : zeile[index];
  };
  const text = (feld: SpaltenFeld): string => alsText(wert(feld));

  const nachweise: NachweisKey[] = [];
  for (const [feld, index] of zuordnung) {
    if (feld.startsWith('nachweis:') && istWahr(zeile[index])) {
      nachweise.push(feld.slice('nachweis:'.length) as NachweisKey);
    }
  }

  return {
    ...leererTermin(zuIsoDatum(wert('datum'))),
    hinweis: text('hinweis'),
    kategorie: normalisiereKategorie(text('kategorie')),
    thema: text('thema'),
    ausbilder: text('ausbilder'),
    katsTitel: text('katsTitel'),
    katsPflicht: istWahr(wert('katsPflicht')) || text('katsTitel') !== '',
    hgmInhalt: text('hgmInhalt'),
    hgmTitel: text('hgmTitel'),
    nachweise,
    material: text('material'),
    anforderungen: text('anforderungen'),
    notizen: text('notizen'),
    // Nummer wird nach dem Aufbau der Themenliste in eine ID übersetzt.
    katsThemaId: text('katsNummer') ? `nr:${text('katsNummer')}` : null,
  };
}

function istInhaltslos(termin: Termin): boolean {
  return (
    !termin.datum &&
    !termin.thema &&
    !termin.hinweis &&
    !termin.kategorie &&
    !termin.katsTitel &&
    !termin.material
  );
}

interface BacklogErgebnis {
  eintraege: Termin[];
  aufgeraeumt: number;
}

/**
 * Liest "Offene Ideen".
 *
 * Das Blatt ist historisch gewachsen und enthält zwei Layouts:
 *   A: Thema | Fachgruppe | Pflicht
 *   B: Fachgruppe | Thema | Ausbilder | Material/Pflicht | Anforderungen | … | Material
 * Beide werden erkannt und auf das Schema des Jahresplans gebracht. Wurde das
 * Blatt bereits von dieser App geschrieben, greift der reguläre Kopfzeilen-Weg.
 */
function leseBacklog(zeilen: Zeile[]): BacklogErgebnis {
  if (!zeilen.length) {
    return { eintraege: [], aufgeraeumt: 0 };
  }
  const kopf = findeKopfzeile(zeilen);
  const zuordnung = spaltenZuordnung(zeilen[kopf] ?? []);
  // Nur Blätter, die diese App geschrieben hat, tragen zusätzlich Ausbilder- bzw.
  // KatS-Nummern-Spalten. Alles andere ist eines der gewachsenen Alt-Layouts.
  const standardisiert =
    zuordnung.has('thema') && (zuordnung.has('ausbilder') || zuordnung.has('katsNummer'));

  if (standardisiert) {
    const eintraege = zeilen
      .slice(kopf + 1)
      .filter((z) => !istLeer(z))
      .map((z) => ({ ...leseTerminZeile(z, zuordnung), datum: null }))
      .filter((t) => !istInhaltslos(t));
    return { eintraege, aufgeraeumt: 0 };
  }

  const eintraege: Termin[] = [];
  for (const zeile of zeilen.slice(kopf + 1)) {
    if (istLeer(zeile)) {
      continue;
    }
    const eintrag = leseAltIdee(zeile);
    if (eintrag) {
      eintraege.push(eintrag);
    }
  }
  return { eintraege, aufgeraeumt: eintraege.length };
}

function leseAltIdee(zeile: Zeile): Termin | null {
  const spalte = (i: number): string => alsText(zeile[i]);
  const termin = leererTermin(null);

  if (istKategorieToken(spalte(0)) && spalte(1)) {
    // Layout B – Fachgruppe steht vorn, das Thema in Spalte B.
    termin.kategorie = normalisiereKategorie(spalte(0));
    termin.thema = spalte(1);
    termin.ausbilder = spalte(2);
    if (istWahr(zeile[3])) {
      termin.katsPflicht = true;
    } else {
      termin.material = spalte(3);
    }
    termin.anforderungen = spalte(4);
    const nachzuegler = zeile.slice(5).map(alsText).filter(Boolean);
    termin.material = [termin.material, ...nachzuegler].filter(Boolean).join(' · ');
  } else {
    // Layout A – Thema vorn, Fachgruppe und Pflichtkennzeichen dahinter.
    termin.thema = spalte(0);
    termin.kategorie = normalisiereKategorie(spalte(1));
    termin.katsPflicht = istWahr(zeile[2]);
    if (!termin.katsPflicht && spalte(2)) {
      termin.ausbilder = spalte(2);
    }
    termin.material = [spalte(3), spalte(4)].filter(Boolean).join(' · ');
  }

  if (!termin.thema) {
    return null;
  }
  if (termin.katsPflicht && !termin.katsTitel) {
    termin.katsTitel = termin.thema;
  }
  return termin;
}

function leseKatsThemen(zeilen: Zeile[]): KatsThema[] {
  if (!zeilen.length) {
    return [];
  }
  const kopf = zeilen.findIndex((z) => z.some((c) => /titel|thema/i.test(alsText(c))));
  const kopfzeile = zeilen[kopf >= 0 ? kopf : 0] ?? [];
  const index = (muster: RegExp): number => kopfzeile.findIndex((c) => muster.test(normHeader(c)));
  const iNr = index(/^(nr\.?|nummer)$/);
  const iTitel = index(/^(titel|thema)$/);
  const iPflicht = index(/^pflicht/);
  const iBeschreibung = index(/^(beschreibung|inhalt|hinweis)/);

  const themen: KatsThema[] = [];
  for (const zeile of zeilen.slice((kopf >= 0 ? kopf : 0) + 1)) {
    const titel = alsText(zeile[iTitel >= 0 ? iTitel : 1]);
    if (!titel) {
      continue;
    }
    themen.push({
      id: neueId(),
      nummer: iNr >= 0 ? alsText(zeile[iNr]) : '',
      titel,
      beschreibung: iBeschreibung >= 0 ? alsText(zeile[iBeschreibung]) : '',
      pflicht: iPflicht >= 0 ? istWahr(zeile[iPflicht]) : true,
    });
  }
  return themen;
}

/** Ohne eigenes Blatt: Themenliste aus den Titeln der Spalte "KatS-A-plan Titel" aufbauen. */
function leiteKatsThemenAb(termine: Termin[]): KatsThema[] {
  const gesehen = new Map<string, KatsThema>();
  for (const termin of termine) {
    const titel = einzeilig(termin.katsTitel);
    if (!titel) {
      continue;
    }
    const schluessel = vergleichsSchluessel(titel);
    if (!gesehen.has(schluessel)) {
      gesehen.set(schluessel, {
        id: neueId(),
        nummer: '',
        titel,
        beschreibung: '',
        pflicht: true,
      });
    }
  }
  return [...gesehen.values()].sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
}

function verknuepfeKatsThemen(termine: Termin[], themen: KatsThema[]): void {
  const nachNummer = new Map(themen.filter((t) => t.nummer).map((t) => [t.nummer, t.id]));
  const nachTitel = new Map(themen.map((t) => [vergleichsSchluessel(t.titel), t.id]));
  for (const termin of termine) {
    const nummer = termin.katsThemaId?.startsWith('nr:') ? termin.katsThemaId.slice(3) : null;
    termin.katsThemaId =
      (nummer ? nachNummer.get(nummer) : undefined) ??
      nachTitel.get(vergleichsSchluessel(termin.katsTitel)) ??
      null;
  }
}

function einzeilig(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function vergleichsSchluessel(text: string): string {
  return einzeilig(text).toLowerCase();
}

function ermittleJahr(blattname: string, termine: Termin[]): number {
  const ausName = /(20\d{2})/.exec(blattname);
  if (ausName) {
    return Number(ausName[1]);
  }
  const jahre = new Map<number, number>();
  for (const termin of termine) {
    if (termin.datum) {
      const jahr = Number(termin.datum.slice(0, 4));
      jahre.set(jahr, (jahre.get(jahr) ?? 0) + 1);
    }
  }
  const haeufigstes = [...jahre.entries()].sort((a, b) => b[1] - a[1])[0];
  return haeufigstes ? haeufigstes[0] : new Date().getFullYear();
}

export function sortiereNachDatum(termine: Termin[]): Termin[] {
  return [...termine].sort((a, b) => (a.datum ?? '').localeCompare(b.datum ?? ''));
}
