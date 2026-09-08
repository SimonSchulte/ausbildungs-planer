# NextCloud-CORS-Proxy (Cloudflare Worker)

Löst das CORS-Problem zwischen der auf GitHub Pages gehosteten App und einer
NextCloud-Instanz, die keine passenden `Access-Control-Allow-Origin`-Header
sendet. Der Worker liegt auf einer eigenen Origin, spricht serverseitig
(ohne CORS-Beschränkung) mit NextCloud und reicht Antworten mit eigenen,
passenden CORS-Headern an den Browser weiter. Details zur Funktionsweise
stehen im Kommentar am Kopf von `src/index.ts`.

## 1. NextCloud-Freigabe anlegen

1. Datei `Rahmenplan_2026.xlsx` in NextCloud → **Teilen** → **Link** anlegen.
2. Berechtigung auf **„Hochladen und Bearbeiten erlauben“** stellen (nicht
   „Nur ansehen“, nicht „Datei-Absetzung“) – der Worker muss per `PUT`
   schreiben können.
3. Ein Passwort vergeben (empfohlen) und **kein Ablaufdatum**, sofern die
   Freigabe dauerhaft genutzt werden soll.
4. Aus dem Freigabelink (`https://cloud.example.org/s/AbCdEfGh123`) den Teil
   hinter `/s/` notieren – das ist `NEXTCLOUD_SHARE_TOKEN`.

Hat die Freigabe kein Passwort, bleibt `NEXTCLOUD_SHARE_PASSWORD` einfach
komplett ungesetzt (der Worker behandelt ein fehlendes Secret als leeres
Passwort). Nicht mit einem Platzhalterwert füllen – dann würde der Worker
diesen Text als tatsächliches Passwort an NextCloud schicken und die
Anfrage schlägt fehl.

## 2. Worker deployen

```bash
cd worker
npm install
npx wrangler login          # einmalig, öffnet den Browser
npx wrangler secret put NEXTCLOUD_BASE_URL       # z. B. https://cloud.example.org
npx wrangler secret put NEXTCLOUD_SHARE_TOKEN    # der Teil hinter /s/
npx wrangler secret put NEXTCLOUD_SHARE_PASSWORD # bei passwortloser Freigabe: Schritt weglassen
npx wrangler secret put APP_SHARED_SECRET        # frei wählbar, z. B. per `openssl rand -hex 16`
```

`ALLOWED_ORIGIN` steht als `[vars]` in `wrangler.toml` (Standard: die
GitHub-Pages-Origin des Projekts) – bei Bedarf dort anpassen, ist nicht
sensibel.

```bash
npx wrangler deploy
```

Die Ausgabe nennt die Worker-URL, z. B.
`https://ausbildungs-planer.<account>.workers.dev`. Diese URL
zusammen mit dem gewählten `APP_SHARED_SECRET` in der App unter „Quelle
wählen → NextCloud → Zugang: Über Worker (CORS-Proxy)“ eintragen.

### Secrets über das Cloudflare-Dashboard ändern

Wenn der Worker über **Workers Builds** (Git-Integration, „Import a
repository“) statt lokal per `wrangler deploy` läuft: ein Secret unter
**Settings → Variables and Secrets** zu ändern, bindet den neuen Wert nicht
sofort an die gerade aktive, bereits gebaute Version. Erst ein neuer
Build-Durchlauf (ausgelöst durch einen neuen Commit auf dem verbundenen
Branch) übernimmt den aktuellen Secret-Stand in die neu erzeugte Version.
Ein reines „Retry deployment“ der alten Version reicht dafür **nicht** –
das rollt dieselbe, bereits gebaute Version erneut aus. Nach einer
Secret-Änderung also entweder auf den nächsten ohnehin anstehenden Commit
warten oder gezielt einen neuen (auch trivialen) Commit auf den
verbundenen Branch pushen, damit ein frischer Build läuft.

## 3. Verifizieren

```bash
WORKER_URL="https://ausbildungs-planer.<account>.workers.dev"
SECRET="<APP_SHARED_SECRET>"

# Preflight
curl -i -X OPTIONS "$WORKER_URL"

# Lesen
curl -i -H "X-Auth-Token: $SECRET" "$WORKER_URL"

# Schreiben
curl -i -X PUT -H "X-Auth-Token: $SECRET" --data-binary @Rahmenplan_2026.xlsx "$WORKER_URL"

# Falscher Schlüssel → 401
curl -i -H "X-Auth-Token: falsch" "$WORKER_URL"
```

### 401 einordnen

Jede 401-Antwort trägt zwei Diagnose-Header (sie verraten keinen Wert, nur
ob überhaupt einer ankommt):

| Header                       | Bedeutung                                              |
| ---------------------------- | ------------------------------------------------------ |
| `X-Diagnose-Secret-Gebunden` | `nein` = `APP_SHARED_SECRET` fehlt im laufenden Worker |
| `X-Diagnose-Token-Empfangen` | `nein` = die Anfrage kam ohne `X-Auth-Token` an        |

`X-Diagnose-Secret-Gebunden: nein` heißt: das Secret ist im laufenden Worker
gar nicht vorhanden – dann wird **jeder** Schlüssel abgelehnt, egal welcher.
Ursachen: Tippfehler im Secret-Namen, oder die Version, die tatsächlich
Traffic bekommt, wurde erzeugt, bevor das Secret gesetzt wurde (siehe
Hinweis zu Workers Builds oben – `wrangler versions upload` lädt nur eine
Version hoch, ohne sie auf Produktions-Traffic zu schalten).

Steht dort `ja` und es kommt trotzdem 401, stimmen schlicht die Werte nicht
überein.

## Sicherheitshinweis

`APP_SHARED_SECRET` steht im öffentlichen Quellcode der App (jede
statische GitHub-Pages-Seite ist für jeden einsehbar) und ist damit kein
echtes Geheimnis. Es verhindert nur zufälligen Missbrauch durch Dritte, die
die Worker-URL erraten, und lässt sich unabhängig vom NextCloud-Passwort
jederzeit rotieren (`wrangler secret put APP_SHARED_SECRET` erneut
ausführen). Echten Zugriffsschutz bietet ausschließlich die
NextCloud-Freigabe selbst (Passwort, jederzeit widerrufbar).
