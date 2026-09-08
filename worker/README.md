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

## 2. Zugangsdaten hinterlegen (Secrets Store)

Die Zugangsdaten liegen im kontoweiten **Secrets Store** von Cloudflare;
`wrangler.toml` verweist per `[[secrets_store_secrets]]` nur darauf. Dadurch
steht die Zuordnung reproduzierbar in der Konfiguration (jeder Deploy setzt
dieselben Bindings), ohne dass ein Geheimnis ins Repository wandert.

Im Dashboard unter **Account → Secrets Store** einen Store anlegen und dort
eintragen:

| Name                    | Wert                                      |
| ----------------------- | ----------------------------------------- |
| `APP_SHARED_SECRET`     | frei wählbar, z. B. `crypto.randomUUID()` |
| `NEXTCLOUD_BASE_URL`    | z. B. `https://cloud.example.org`         |
| `NEXTCLOUD_SHARE_TOKEN` | der Teil hinter `/s/`                     |

Die Store-ID aus der Adresszeile in die drei `store_id`-Felder in
`wrangler.toml` eintragen (sie ist nur eine Kennung, kein Geheimnis).

> Von Hand im Dashboard am Worker angelegte Bindings funktionieren ebenfalls –
> der Worker akzeptiert beide Formen. Sie sind aber unsichtbar für dieses
> Repository und leicht am falschen Ort gesetzt: Die Karte „Variables and
> secrets“ unter **Build** sieht genauso aus, ihre Werte erreichen den Worker
> zur Laufzeit aber nie. Laufzeit-Bindings hängen am Worker unter
> **Bindings → Add a binding**.

## 3. Worker deployen

Läuft der Worker über Workers Builds, genügt ein Push auf den verbundenen
Branch. Lokal:

```bash
cd worker
npm install
npx wrangler login          # einmalig, öffnet den Browser
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

### Secrets und Workers Builds (Git-Integration)

Zwei Fallen, wenn der Worker über **Workers Builds** statt lokal per
`wrangler deploy` läuft:

**1. Secrets müssen am richtigen Worker hängen.** `wrangler.toml` ist beim
Deploy die Quelle der Wahrheit für die Konfiguration: im Dashboard gesetzte
**`vars`** überschreibt bzw. löscht ein Deploy, sofern nicht `keep_vars =
true` gesetzt ist (steht deshalb in `wrangler.toml`, und zwar oberhalb von
`[vars]` – darunter würde TOML es als Variable innerhalb dieser Tabelle
lesen). **Secrets** bleiben davon unberührt, die überstehen einen Deploy.

Sind die Secrets trotzdem nicht im `env`, hängen sie an der falschen Stelle
– klassischerweise an einem zweiten, gleichnamig gemeinten Worker (etwa
wenn `name` in `wrangler.toml` einmal von dem Namen abwich, unter dem der
Git-verbundene Worker läuft) oder in den Build-Variablen statt bei den
Laufzeit-Bindings. Was tatsächlich ankommt, zeigt der Header
`X-Diagnose-Env-Schluessel` (siehe „401 einordnen“).

**2. Nur der Produktions-Branch bedient die Produktions-URL.** Builds von
einem Feature-Branch sind Preview-Deployments (`wrangler versions upload`)
und bekommen eigene Preview-URLs
(`https://<commit>-<worker>.<account>.workers.dev`); die eigentliche
`https://<worker>.<account>.workers.dev` fassen sie nicht an. Zum Testen
einer Änderung vor dem Merge also die Preview-URL aus dem
Cloudflare-Kommentar am Pull Request verwenden.

## 4. Verifizieren

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

Jede 401-Antwort trägt Diagnose-Header. Sie verraten nie einen Wert, nur ob
und in welcher Länge einer ankommt:

| Header                       | Bedeutung                                                            |
| ---------------------------- | -------------------------------------------------------------------- |
| `X-Diagnose-Secret-Gebunden` | `nein` = `APP_SHARED_SECRET` ist im laufenden Worker nicht auflösbar |
| `X-Diagnose-Token-Empfangen` | `nein` = die Anfrage kam ohne `X-Auth-Token` an                      |
| `X-Diagnose-Vergleich`       | Längen beider Seiten und ob sie nach dem Trimmen gleich wären        |
| `X-Diagnose-Env-Schluessel`  | Namen aller gebundenen Werte                                         |

So liest man sie:

- **`Secret-Gebunden: nein`** – der Schlüssel erreicht den Worker gar nicht,
  dann wird **jeder** Wert abgelehnt. Steht in `X-Diagnose-Env-Schluessel`
  nur `ALLOWED_ORIGIN`, fehlen sämtliche Bindings (falsche Dashboard-Karte
  oder fehlender Store-Eintrag); fehlt nur dieser eine Name, hakt es allein
  an ihm.
- **`nach-trim-gleich=ja`** bei unterschiedlichen Längen – im hinterlegten
  Wert steckt ein Leerzeichen oder Zeilenumbruch, typischerweise beim
  Einfügen mitkopiert.
- **`nach-trim-gleich=nein`** – die Werte sind tatsächlich verschieden.

## Sicherheitshinweis

`APP_SHARED_SECRET` ist die **einzige** Hürde vor dem Worker – und der hat
Lese- und Schreibzugriff auf die freigegebene Datei. Wer den Schlüssel und
die Worker-URL kennt, kann den Rahmenplan lesen und überschreiben. Er gehört
deshalb weder ins Repository noch in eine `[vars]`-Zeile, sondern in den
Secrets Store (bzw. in ein Laufzeit-Binding am Worker).

Eingegeben wird er in der App und liegt dann im localStorage des Browsers –
also nicht im ausgelieferten Bundle, aber auch nicht besonders geschützt.
Entsprechend gilt: nur an Leute weitergeben, die den Plan bearbeiten dürfen,
und bei Verdacht rotieren (Wert im Secrets Store ersetzen, danach in der App
neu eintragen). Die NextCloud-Freigabe selbst lässt sich unabhängig davon
jederzeit widerrufen.
