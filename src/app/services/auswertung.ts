import {
  KATEGORIEN,
  KatsThema,
  Kategorie,
  NACHWEISE,
  PlanDocument,
  Termin,
  terminArt,
} from '../models/plan.model';
import { PlanSlot } from './plan-raster';
import { MONATSNAMEN, monatIndex } from '../utils/datum';

export interface KategorieZeile {
  kategorie: Kategorie | '';
  label: string;
  anzahl: number;
  anteil: number;
}

export interface MonatsZeile {
  index: number;
  name: string;
  gesamt: number;
  ausbildungen: number;
  ereignisse: number;
  proKategorie: Map<Kategorie | '', number>;
}

export interface KatsAbdeckungZeile {
  thema: KatsThema;
  geplant: Termin[];
  imBacklog: Termin[];
}

export interface NachweisZeile {
  key: string;
  label: string;
  termine: Termin[];
}

export interface MontagsAbdeckung {
  montage: number;
  belegt: number;
  feiertage: number;
  luecken: PlanSlot[];
  quote: number;
}

export interface Auswertung {
  montage: MontagsAbdeckung;
  gesamt: number;
  ausbildungen: number;
  ereignisse: number;
  freieSlots: Termin[];
  ohneAusbilder: Termin[];
  proKategorie: KategorieZeile[];
  proMonat: MonatsZeile[];
  katsAbdeckung: KatsAbdeckungZeile[];
  katsOffen: KatsAbdeckungZeile[];
  pflichtQuote: number;
  ohneKatsBezug: Termin[];
  nachweise: NachweisZeile[];
  backlogProKategorie: KategorieZeile[];
}

const KATEGORIE_SPALTEN: ReadonlyArray<Kategorie | ''> = [...KATEGORIEN, ''];

export function werteAus(dokument: PlanDocument, raster: readonly PlanSlot[] = []): Auswertung {
  const termine = dokument.termine;
  const ausbildungen = termine.filter((t) => terminArt(t) === 'ausbildung');
  const ereignisse = termine.filter((t) => terminArt(t) === 'ereignis');

  const katsAbdeckung = dokument.katsThemen.map<KatsAbdeckungZeile>((thema) => ({
    thema,
    geplant: termine.filter((t) => t.katsThemaId === thema.id),
    imBacklog: dokument.backlog.filter((t) => t.katsThemaId === thema.id),
  }));
  const pflicht = katsAbdeckung.filter((z) => z.thema.pflicht);
  const abgedeckt = pflicht.filter((z) => z.geplant.length > 0);

  return {
    montage: werteMontageAus(raster),
    gesamt: termine.length,
    ausbildungen: ausbildungen.length,
    ereignisse: ereignisse.length,
    freieSlots: ausbildungen.filter((t) => !t.thema.trim()),
    ohneAusbilder: ausbildungen.filter((t) => t.thema.trim() && !t.ausbilder.trim()),
    proKategorie: zaehleKategorien(ausbildungen),
    proMonat: zaehleMonate(termine),
    katsAbdeckung,
    katsOffen: pflicht.filter((z) => z.geplant.length === 0),
    pflichtQuote: pflicht.length ? abgedeckt.length / pflicht.length : 1,
    ohneKatsBezug: ausbildungen.filter((t) => t.thema.trim() && !t.katsThemaId),
    nachweise: NACHWEISE.map((n) => ({
      key: n.key,
      label: n.kurz,
      termine: termine.filter((t) => t.nachweise.includes(n.key)),
    })),
    backlogProKategorie: zaehleKategorien(dokument.backlog),
  };
}

function werteMontageAus(raster: readonly PlanSlot[]): MontagsAbdeckung {
  const montage = raster.filter((s) => s.istMontag);
  const luecken = montage.filter((s) => s.luecke);
  const feiertage = montage.filter((s) => s.feiertag !== null);
  return {
    montage: montage.length,
    belegt: montage.length - luecken.length,
    feiertage: feiertage.length,
    luecken,
    quote: montage.length ? (montage.length - luecken.length) / montage.length : 1,
  };
}

function zaehleKategorien(termine: Termin[]): KategorieZeile[] {
  const zaehler = new Map<Kategorie | '', number>();
  for (const termin of termine) {
    zaehler.set(termin.kategorie, (zaehler.get(termin.kategorie) ?? 0) + 1);
  }
  const gesamt = termine.length || 1;
  return KATEGORIE_SPALTEN.filter((k) => (zaehler.get(k) ?? 0) > 0)
    .map((kategorie) => ({
      kategorie,
      label: kategorie || 'Ohne Rolle',
      anzahl: zaehler.get(kategorie) ?? 0,
      anteil: (zaehler.get(kategorie) ?? 0) / gesamt,
    }))
    .sort((a, b) => b.anzahl - a.anzahl);
}

function zaehleMonate(termine: Termin[]): MonatsZeile[] {
  return MONATSNAMEN.map((name, index) => {
    const imMonat = termine.filter((t) => t.datum && monatIndex(t.datum) === index);
    const proKategorie = new Map<Kategorie | '', number>();
    for (const termin of imMonat) {
      if (terminArt(termin) === 'ausbildung') {
        proKategorie.set(termin.kategorie, (proKategorie.get(termin.kategorie) ?? 0) + 1);
      }
    }
    return {
      index,
      name,
      gesamt: imMonat.length,
      ausbildungen: imMonat.filter((t) => terminArt(t) === 'ausbildung').length,
      ereignisse: imMonat.filter((t) => terminArt(t) === 'ereignis').length,
      proKategorie,
    };
  });
}
