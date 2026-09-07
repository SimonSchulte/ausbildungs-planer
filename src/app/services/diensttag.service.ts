import { Injectable, signal } from '@angular/core';
import { STANDARD_DIENSTTAG, istWochentagCode } from '../data/wochentage';
import { Wochentag } from '../utils/datum';

const SPEICHER_SCHLUESSEL = 'ausbildungsplaner.diensttag';

/**
 * Der reguläre Ausbildungs-/Dienstabend (Standard: Montag).
 *
 * Nicht jede Einheit hat ihren Diensttag am Montag – deshalb ist er hier als
 * Browser-Einstellung geführt, nicht als Teil der Excel-Mappe (die kennt dafür
 * kein Feld). Die Wahl gilt für alle Jahre und wird im Browser gemerkt, genau
 * wie das Bundesland des `FeiertagService`.
 */
@Injectable({ providedIn: 'root' })
export class DiensttagService {
  readonly wochentag = signal<Wochentag>(gespeicherterDiensttag());

  setze(wochentag: Wochentag): void {
    this.wochentag.set(wochentag);
    try {
      localStorage.setItem(SPEICHER_SCHLUESSEL, wochentag);
    } catch {
      // Privater Modus o. Ä. – die Auswahl gilt dann nur für diese Sitzung.
    }
  }
}

function gespeicherterDiensttag(): Wochentag {
  try {
    const wert = localStorage.getItem(SPEICHER_SCHLUESSEL);
    return istWochentagCode(wert) ? wert : STANDARD_DIENSTTAG;
  } catch {
    return STANDARD_DIENSTTAG;
  }
}
