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

## 2. Worker deployen

```bash
cd worker
npm install
npx wrangler login          # einmalig, öffnet den Browser
npx wrangler secret put NEXTCLOUD_BASE_URL       # z. B. https://cloud.example.org
npx wrangler secret put NEXTCLOUD_SHARE_TOKEN    # der Teil hinter /s/
npx wrangler secret put NEXTCLOUD_SHARE_PASSWORD # leer lassen (Enter), falls kein Passwort
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

## Sicherheitshinweis

`APP_SHARED_SECRET` steht im öffentlichen Quellcode der App (jede
statische GitHub-Pages-Seite ist für jeden einsehbar) und ist damit kein
echtes Geheimnis. Es verhindert nur zufälligen Missbrauch durch Dritte, die
die Worker-URL erraten, und lässt sich unabhängig vom NextCloud-Passwort
jederzeit rotieren (`wrangler secret put APP_SHARED_SECRET` erneut
ausführen). Echten Zugriffsschutz bietet ausschließlich die
NextCloud-Freigabe selbst (Passwort, jederzeit widerrufbar).
