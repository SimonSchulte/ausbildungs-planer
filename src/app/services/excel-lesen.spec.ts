import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { leseArbeitsmappe } from './excel-lesen';
import { schreibeArbeitsmappe } from './excel-schreiben';
import { isoZuSerial } from '../utils/datum';

/**
 * Baut eine Mappe im Zustand der gewachsenen Vorlage nach: Titelzeile über der
 * Kopfzeile, Zeilenumbrüche in den Überschriften und ein "Offene Ideen"-Blatt
 * mit zwei unterschiedlichen Alt-Layouts.
 */
function beispielMappe(): ArrayBuffer {
  const plan = XLSX.utils.aoa_to_sheet([
    [],
    ['(Jahres)Dienstplan BI EE 04'],
    [
      'Datum',
      'Tag',
      'Hinweis',
      'Rolle',
      'Thema',
      'Ausbilder/\nVerantw.',
      'KatS-A-plan\nBezug',
      'KatS-A-plan\nTitel',
      ' HGM 4\nInhalt',
      'HGM 4\nOriginal Titel',
      '§35/38 StVO',
      'Elektrosicherheitsunterweisung',
      'Gas',
      'IfSG Folge',
      'FS-Kontrolle',
      'AED Einw.',
      'BLS',
      'Fahreinweisung JUH',
      'UF Sitzung',
      'Gesellschaft',
      'Benötigtes Material ',
      'besondere Anforderungen ',
    ],
    [
      null,
      'Mo',
      '',
      'SAN',
      'Blaulicht­unterweisung',
      'A. Beispiel',
      'X',
      'Blaulicht- und\nInfektionsschutzunterweisung',
      '',
      '',
      'X',
      '',
      '',
      'x',
      'x',
      '',
      '',
      '',
      '',
      '',
      'Fahrtenbuch',
      '',
    ],
    [
      null,
      'Sa',
      'Übung der Einheit',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
    [
      null,
      'Mo',
      '',
      'Bt/Vp',
      'Wasserversorgung Bt-LKW',
      '',
      'X',
      'Wasserversorgung-\nund Entsorgung Bt-LKW',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
  ]);
  // Datumszellen als echte Excel-Seriennummern setzen.
  plan['A4'] = { t: 'n', v: isoZuSerial('2026-01-05'), z: 'DD.MM.YYYY' };
  plan['A5'] = { t: 'n', v: isoZuSerial('2026-03-21'), z: 'DD.MM.YYYY' };
  plan['A6'] = { t: 'n', v: isoZuSerial('2026-05-11'), z: 'DD.MM.YYYY' };

  const ideen = XLSX.utils.aoa_to_sheet([
    ['Thema', 'Fachgruppe', 'KatS-A-plan\nBezug (= Pflicht', 'Spalte1', 'Spalte2'],
    ['Die Kolonnenfahrt', null, 'x'],
    ['Sprechfunkausbildung praktisch', 'Iuk ', 'x'],
    ['Umgang mit Menschen in Krisensituationen', 'Betreuung'],
    [],
    // Zweites Layout: Fachgruppe vorne, Thema in Spalte B.
    [
      'SAN',
      'Dokumentation im Sanitätsdienst',
      'C. Muster',
      'Protokolle, MANV-Karten',
      'Aus der Übung',
    ],
    [
      'SAN',
      'Fahrzeugkunde/Rallye',
      'C. Muster',
      'X',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      'KTW-Land, GWSAN',
    ],
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, plan, 'Jahresplan 2026');
  XLSX.utils.book_append_sheet(wb, ideen, 'Offene Ideen');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

describe('leseArbeitsmappe', () => {
  it('liest den Jahresplan inklusive Kopfzeile unterhalb der Überschrift', () => {
    const { dokument } = leseArbeitsmappe(beispielMappe());

    expect(dokument.jahr).toBe(2026);
    expect(dokument.titel).toBe('(Jahres)Dienstplan BI EE 04');
    expect(dokument.termine).toHaveLength(3);

    const ersterTermin = dokument.termine[0];
    expect(ersterTermin.datum).toBe('2026-01-05');
    expect(ersterTermin.kategorie).toBe('SAN');
    expect(ersterTermin.ausbilder).toBe('A. Beispiel');
    expect(ersterTermin.nachweise).toEqual(['stvo', 'ifsg', 'fsKontrolle']);
    expect(ersterTermin.material).toBe('Fahrtenbuch');
  });

  it('behält reine Veranstaltungen als Kalendereinträge', () => {
    const { dokument } = leseArbeitsmappe(beispielMappe());
    const ereignis = dokument.termine.find((t) => t.datum === '2026-03-21');

    expect(ereignis?.hinweis).toBe('Übung der Einheit');
    expect(ereignis?.thema).toBe('');
    expect(ereignis?.kategorie).toBe('');
  });

  it('vereinheitlicht beide Alt-Layouts des Ideen-Blatts', () => {
    const { dokument, meldungen } = leseArbeitsmappe(beispielMappe());

    expect(dokument.backlog).toHaveLength(5);
    expect(meldungen.some((m) => m.includes('vereinheitlicht'))).toBe(true);

    const kolonnenfahrt = dokument.backlog.find((i) => i.thema === 'Die Kolonnenfahrt');
    expect(kolonnenfahrt?.katsPflicht).toBe(true);
    expect(kolonnenfahrt?.datum).toBeNull();

    const funk = dokument.backlog.find((i) => i.thema === 'Sprechfunkausbildung praktisch');
    expect(funk?.kategorie).toBe('TeSi/Iuk');

    const betreuung = dokument.backlog.find((i) => i.thema.startsWith('Umgang mit Menschen'));
    expect(betreuung?.kategorie).toBe('Bt/Vp');

    // Layout B: Rolle steht vorn, Thema in Spalte B.
    const doku = dokument.backlog.find((i) => i.thema === 'Dokumentation im Sanitätsdienst');
    expect(doku?.kategorie).toBe('SAN');
    expect(doku?.ausbilder).toBe('C. Muster');
    expect(doku?.material).toBe('Protokolle, MANV-Karten');
    expect(doku?.anforderungen).toBe('Aus der Übung');

    const rallye = dokument.backlog.find((i) => i.thema === 'Fahrzeugkunde/Rallye');
    expect(rallye?.katsPflicht).toBe(true);
    expect(rallye?.material).toBe('KTW-Land, GWSAN');
  });

  it('baut die KatS-A-Plan-Liste aus Plan und Pflicht-Ideen auf und verknüpft sie', () => {
    const { dokument } = leseArbeitsmappe(beispielMappe());

    // Zwei Titel aus dem Jahresplan plus drei als Pflicht markierte Ideen.
    expect(dokument.katsThemen).toHaveLength(5);

    const verknuepft = dokument.termine.filter((t) => t.katsThemaId !== null);
    expect(verknuepft).toHaveLength(2);

    const thema = dokument.katsThemen.find((t) => t.id === verknuepft[0].katsThemaId);
    expect(thema?.titel).toContain('Blaulicht');
    // Mehrzeilige Titel werden für die Liste zu einer Zeile normalisiert.
    expect(thema?.titel).not.toContain('\n');
    expect(thema?.pflicht).toBe(true);

    const kolonnenfahrt = dokument.backlog.find((i) => i.thema === 'Die Kolonnenfahrt');
    expect(kolonnenfahrt?.katsThemaId).not.toBeNull();
  });
});

describe('schreibeArbeitsmappe', () => {
  it('erzeugt eine Mappe, die sich verlustfrei wieder einlesen lässt', () => {
    const original = leseArbeitsmappe(beispielMappe()).dokument;
    const wieder = leseArbeitsmappe(schreibeArbeitsmappe(original)).dokument;

    expect(wieder.jahr).toBe(original.jahr);
    expect(wieder.titel).toBe(original.titel);
    expect(wieder.termine.map((t) => t.datum)).toEqual(original.termine.map((t) => t.datum));
    expect(wieder.termine.map((t) => t.thema)).toEqual(original.termine.map((t) => t.thema));
    expect(wieder.termine.map((t) => t.nachweise)).toEqual(
      original.termine.map((t) => t.nachweise),
    );
    expect(wieder.backlog.map((i) => i.thema).sort()).toEqual(
      original.backlog.map((i) => i.thema).sort(),
    );
    expect(wieder.katsThemen.map((t) => t.titel).sort()).toEqual(
      original.katsThemen.map((t) => t.titel).sort(),
    );
  });

  it('legt das Ideen-Blatt im Schema des Jahresplans an', () => {
    const original = leseArbeitsmappe(beispielMappe()).dokument;
    const wb = XLSX.read(new Uint8Array(schreibeArbeitsmappe(original)), { type: 'array' });

    expect(wb.SheetNames).toEqual(['Jahresplan 2026', 'Offene Ideen', 'KatS-A-Plan']);

    const kopf = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Offene Ideen'], {
      header: 1,
    })[0];
    expect(kopf.slice(0, 6)).toEqual([
      'Hinweis',
      'Rolle',
      'Thema',
      'Ausbilder/Verantw.',
      'KatS-A-plan Bezug',
      'KatS-A-plan Nr.',
    ]);
  });
});
