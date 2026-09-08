/**
 * CORS-Proxy für NextCloud-WebDAV.
 *
 * GitHub Pages ist reines statisches Hosting – es kann weder Header in die
 * Antwort eines fremden Servers einfügen noch Requests umleiten. Der Browser
 * spricht bei `fetch()` immer direkt mit der NextCloud-Origin, und die
 * entscheidet per CORS-Header, ob sie das erlaubt. Die meisten NextCloud-
 * Instanzen erlauben das für ihre WebDAV-Endpunkte nicht.
 *
 * Dieser Worker sitzt dazwischen: Er nimmt GET/PUT von der App entgegen,
 * spricht selbst (ohne CORS-Beschränkung, da kein Browser) mit dem
 * öffentlichen NextCloud-Freigabelink und schickt die Antwort mit eigenen,
 * passenden CORS-Headern zurück. Die echten NextCloud-Zugangsdaten
 * (Freigabe-Token + Passwort) liegen dabei nur hier, nie im Browser – anders
 * als bei einer direkten WebDAV-Verbindung, bei der die App sie im
 * localStorage halten müsste.
 *
 * Sicherheitshinweis: Der Zugriffsschlüssel (`APP_SHARED_SECRET`), den die
 * App im `X-Auth-Token`-Header mitschickt, ist die einzige Hürde vor diesem
 * Worker – und der schreibt in die freigegebene Datei. Wer Schlüssel und
 * Worker-URL kennt, kann den Rahmenplan lesen und überschreiben. Er gehört
 * deshalb in den Secrets Store, nie in die Konfigurationsdatei. In der App
 * wird er eingegeben und liegt dort im localStorage – nicht im ausgelieferten
 * Bundle, aber auch nicht besonders geschützt.
 */

/**
 * Ein Zugangsdatum kann auf zwei Wegen am Worker ankommen: als Binding aus dem
 * Secrets Store (ein Objekt mit `get()`, so deklariert es `wrangler.toml`) oder
 * als klassisches, im Dashboard gesetztes Secret (schlicht ein String). Der
 * Worker unterstützt beides, damit eine bestehende Einrichtung weiterläuft.
 */
type Zugangsdatum = string | SecretsStoreSecret | undefined;

export interface Env {
  /** Basis-URL der NextCloud-Instanz, z. B. https://cloud.example.org */
  NEXTCLOUD_BASE_URL: Zugangsdatum;
  /** Token der öffentlichen Freigabe (der Teil hinter /s/). */
  NEXTCLOUD_SHARE_TOKEN: Zugangsdatum;
  /** Passwort der Freigabe – weglassen, wenn die Freigabe kein Passwort hat. */
  NEXTCLOUD_SHARE_PASSWORD?: Zugangsdatum;
  /** Von der App im Header `X-Auth-Token` erwarteter Wert. */
  APP_SHARED_SECRET: Zugangsdatum;
  /** Origin, die per CORS zugelassen wird, z. B. https://simonschulte.github.io */
  ALLOWED_ORIGIN: string;
}

const ERLAUBTE_METHODEN = ['GET', 'PUT'] as const;

/**
 * Löst ein Zugangsdatum zu seinem Wert auf. `undefined`, wenn es nicht gebunden
 * ist oder der Eintrag im Secrets Store fehlt – `get()` wirft in dem Fall.
 */
async function leseZugangsdatum(quelle: Zugangsdatum): Promise<string | undefined> {
  if (typeof quelle === 'string') {
    return quelle;
  }
  try {
    return await quelle?.get();
  } catch {
    return undefined;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeader = baueCorsHeader(env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeader });
    }

    const erwartet = await leseZugangsdatum(env.APP_SHARED_SECRET);
    const empfangen = request.headers.get('X-Auth-Token');

    // `!erwartet` sperrt bewusst zu: Ohne hinterlegten Schlüssel darf nichts
    // durchkommen, auch keine Anfrage ganz ohne Header.
    if (!erwartet || empfangen !== erwartet) {
      // Diagnose-Header beim Einrichten: Sie unterscheiden „Schlüssel gar
      // nicht auflösbar“ (falsche Dashboard-Karte, fehlender Store-Eintrag)
      // von „Werte stimmen nicht überein“. Sie geben nur Vorhandensein und
      // Länge preis, nie den Wert selbst.
      return antwortMitCors('Nicht autorisiert.', 401, {
        ...corsHeader,
        'X-Diagnose-Secret-Gebunden': erwartet ? 'ja' : 'nein',
        'X-Diagnose-Token-Empfangen': empfangen ? 'ja' : 'nein',
        // Nur Längen und ob getrimmt gleich – nie die Werte selbst. Deckt den
        // häufigsten Fall auf: ein unsichtbares Leerzeichen oder Newline, das
        // beim Einfügen ins Dashboard mitkopiert wurde.
        'X-Diagnose-Vergleich':
          `laenge-erwartet=${erwartet?.length ?? 0},` +
          `laenge-empfangen=${empfangen?.length ?? 0},` +
          `nach-trim-gleich=${
            erwartet !== undefined && empfangen !== null && erwartet.trim() === empfangen.trim()
              ? 'ja'
              : 'nein'
          }`,
        // Nur die Namen der gebundenen Werte, nie deren Inhalt. Zeigt beim
        // Einrichten sofort, ob die Secrets überhaupt am Worker ankommen
        // (leer bzw. nur ALLOWED_ORIGIN = sie sind im falschen Bereich des
        // Dashboards gelandet, z. B. als Build- statt Laufzeit-Variable).
        'X-Diagnose-Env-Schluessel': Object.keys(env).sort().join(',') || '(keine)',
      });
    }

    if (!ERLAUBTE_METHODEN.includes(request.method as (typeof ERLAUBTE_METHODEN)[number])) {
      return antwortMitCors('Methode nicht erlaubt.', 405, corsHeader);
    }

    const basisUrl = await leseZugangsdatum(env.NEXTCLOUD_BASE_URL);
    const freigabeToken = await leseZugangsdatum(env.NEXTCLOUD_SHARE_TOKEN);
    const freigabePasswort = (await leseZugangsdatum(env.NEXTCLOUD_SHARE_PASSWORD)) ?? '';

    if (!basisUrl || !freigabeToken) {
      const fehlend = [
        basisUrl ? null : 'NEXTCLOUD_BASE_URL',
        freigabeToken ? null : 'NEXTCLOUD_SHARE_TOKEN',
      ]
        .filter(Boolean)
        .join(', ');
      return antwortMitCors(
        `Worker unvollständig konfiguriert: ${fehlend} fehlt.`,
        500,
        corsHeader,
      );
    }

    const ziel = `${basisUrl.replace(/\/+$/, '')}/public.php/webdav/`;
    const auth = `Basic ${btoa(`${freigabeToken}:${freigabePasswort}`)}`;

    let antwort: Response;
    try {
      antwort = await fetch(ziel, {
        method: request.method,
        headers: {
          Authorization: auth,
          ...(request.method === 'PUT'
            ? {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              }
            : {}),
        },
        body: request.method === 'PUT' ? request.body : undefined,
      });
    } catch (ursache) {
      return antwortMitCors(`NextCloud nicht erreichbar: ${String(ursache)}`, 502, corsHeader);
    }

    return new Response(antwort.body, {
      status: antwort.status,
      statusText: antwort.statusText,
      headers: {
        ...corsHeader,
        'Content-Type': antwort.headers.get('Content-Type') ?? 'application/octet-stream',
      },
    });
  },
};

function baueCorsHeader(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Auth-Token, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function antwortMitCors(
  text: string,
  status: number,
  corsHeader: Record<string, string>,
): Response {
  return new Response(text, { status, headers: { ...corsHeader, 'Content-Type': 'text/plain' } });
}
