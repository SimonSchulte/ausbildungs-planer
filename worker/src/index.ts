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
 * (Freigabe-Token + Passwort) liegen dabei nur hier als Worker-Secrets,
 * nie im Browser – anders als bei einer direkten WebDAV-Verbindung, bei der
 * der öffentliche Quellcode der App sie zwangsläufig im localStorage hält.
 *
 * Sicherheitshinweis: Der Zugriffsschlüssel (`APP_SHARED_SECRET`), den die
 * App im `X-Auth-Token`-Header mitschickt, ist kein echtes Geheimnis – er
 * steht im öffentlichen Quellcode der App und ist damit für jeden lesbar,
 * der die Website öffnet. Er verhindert nur zufälligen Missbrauch durch
 * Dritte, die die Worker-URL erraten, und lässt sich unabhängig vom
 * NextCloud-Passwort rotieren. Echten Zugriffsschutz bietet nur die
 * NextCloud-Freigabe selbst (Passwort, Ablaufdatum, jederzeit widerrufbar).
 */

export interface Env {
  /** Basis-URL der NextCloud-Instanz, z. B. https://cloud.example.org */
  NEXTCLOUD_BASE_URL: string;
  /** Token der öffentlichen Freigabe (der Teil hinter /s/). */
  NEXTCLOUD_SHARE_TOKEN: string;
  /** Passwort der Freigabe – Secret weglassen, wenn die Freigabe kein Passwort hat. */
  NEXTCLOUD_SHARE_PASSWORD?: string;
  /** Von der App im Header `X-Auth-Token` erwarteter Wert. */
  APP_SHARED_SECRET: string;
  /** Origin, die per CORS zugelassen wird, z. B. https://simonschulte.github.io */
  ALLOWED_ORIGIN: string;
}

const ERLAUBTE_METHODEN = ['GET', 'PUT'] as const;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeader = baueCorsHeader(env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeader });
    }

    if (request.headers.get('X-Auth-Token') !== env.APP_SHARED_SECRET) {
      // Diagnose-Header beim Einrichten: Sie unterscheiden „Secret gar nicht
      // gebunden“ (Tippfehler im Namen, Secret nur hochgeladen aber nie
      // deployt) von „Werte stimmen nicht überein“. Sie verraten keinen Wert,
      // nur ob überhaupt einer ankommt – und APP_SHARED_SECRET ist ohnehin
      // kein echtes Geheimnis (siehe Sicherheitshinweis oben).
      return antwortMitCors('Nicht autorisiert.', 401, {
        ...corsHeader,
        'X-Diagnose-Secret-Gebunden': env.APP_SHARED_SECRET ? 'ja' : 'nein',
        'X-Diagnose-Token-Empfangen': request.headers.get('X-Auth-Token') ? 'ja' : 'nein',
      });
    }

    if (!ERLAUBTE_METHODEN.includes(request.method as (typeof ERLAUBTE_METHODEN)[number])) {
      return antwortMitCors('Methode nicht erlaubt.', 405, corsHeader);
    }

    const ziel = `${env.NEXTCLOUD_BASE_URL.replace(/\/+$/, '')}/public.php/webdav/`;
    const auth = `Basic ${btoa(`${env.NEXTCLOUD_SHARE_TOKEN}:${env.NEXTCLOUD_SHARE_PASSWORD ?? ''}`)}`;

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
