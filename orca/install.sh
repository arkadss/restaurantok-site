#!/usr/bin/env bash
# install.sh — importă în n8n (pe orca) workflow-urile din n8n/*.json și creează credențialele placeholder (M7).
#
#   cd orca && cp .env.exemplu .env && nano .env          # N8N_URL, N8N_API_KEY
#   ./install.sh                                          # import complet (idempotent: la a doua rulare actualizează)
#   ./install.sh --simulare                               # arată ce ar face, fără să scrie nimic în n8n
#   ./install.sh --fara-credentiale                       # doar workflow-urile (credențialele există deja)
#   ./install.sh site-cerere.json meniu-zilei.json        # doar anumite workflow-uri
#
# Ce face, în ordine:
#   1. verifică accesul la API-ul n8n (GET /api/v1/workflows) cu cheia din N8N_API_KEY;
#   2. creează credențialele folosite de workflow-uri (GitHub, Telegram, SMTP, Postgres, Google Calendar, Google Places,
#      Meta, DeepL, WhatsApp) cu valori PLACEHOLDER `<<TODO>>` — valorile reale le completează Sorin în interfața n8n (Credentials);
#      dacă o credențială cu același nume există deja (în fișierul de stare orca/.instalat.json sau în workflow-urile
#      deja importate), nu o creează din nou;
#   3. importă fiecare workflow: scoate câmpurile pe care API-ul public nu le acceptă (pinData, tags, meta, id),
#      înlocuiește placeholder-ele `<<TODO: id credențială>>` cu id-urile reale și face POST (nou) sau PUT (există deja
#      un workflow cu același nume). Workflow-urile rămân INACTIVE: se activează din interfață după completarea nodului Config.
#   4. scrie orca/.instalat.json (nume → id, pentru rulările următoare; nu se comite) și afișează ce mai e de completat.
#
# Niciun secret nu trece prin acest script în afară de N8N_API_KEY (care se poate șterge din n8n după instalare).
# Cerințe: bash, python3 (standard pe Debian). Nu are nevoie de curl, jq sau node.
set -euo pipefail

AICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RADACINA="$(cd "$AICI/.." && pwd)"
N8N_DIR="${N8N_DIR:-$RADACINA/n8n}"
STARE="${STARE:-$AICI/.instalat.json}"

# .env din orca/ (dacă există); variabilele deja setate în mediu au prioritate
if [ -f "$AICI/.env" ]; then
  set -a; # shellcheck disable=SC1091
  . "$AICI/.env"; set +a
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "✗ Lipsește python3 (apt install python3)." >&2; exit 2
fi
: "${N8N_URL:?Scrie N8N_URL în orca/.env (ex. http://localhost:5678)}"
: "${N8N_API_KEY:?Scrie N8N_API_KEY în orca/.env (n8n → Settings → n8n API → Create an API key)}"
case "$N8N_API_KEY" in *TODO*) echo "✗ N8N_API_KEY este încă placeholder în orca/.env." >&2; exit 2;; esac

export N8N_URL N8N_API_KEY N8N_DIR STARE
exec python3 - "$@" <<'PY'
import json, os, sys, time, urllib.request, urllib.error, urllib.parse

N8N_URL = os.environ["N8N_URL"].rstrip("/")
CHEIE = os.environ["N8N_API_KEY"]
N8N_DIR = os.environ["N8N_DIR"]
STARE = os.environ["STARE"]

argv = sys.argv[1:]
SIMULARE = "--simulare" in argv or "--dry-run" in argv
FARA_CRED = "--fara-credentiale" in argv
DOAR = [a for a in argv if not a.startswith("--")]

# Credențialele placeholder, cu numele exact folosit în noduri (n8n/def/*.js, n8n/genereaza.js) și tipul n8n.
# Valorile sunt doar ca să treacă validarea la creare; se înlocuiesc în interfață (Credentials → nume → Edit).
CREDENTIALE = [
    {"name": "GitHub PAT site", "type": "githubApi",
     "data": {"server": "https://api.github.com", "user": "<<TODO: utilizatorul GitHub>>", "accessToken": "<<TODO: fine-grained PAT, Contents: Read and write pe repo>>"}},
    {"name": "Telegram OK bot", "type": "telegramApi",
     "data": {"accessToken": "<<TODO: token-ul botului existent>>", "baseUrl": "https://api.telegram.org"}},
    {"name": "SMTP contact@restaurantok.com", "type": "smtp",
     "data": {"user": "contact@restaurantok.com", "password": "<<TODO>>", "host": "<<TODO: serverul SMTP al furnizorului de email>>", "port": 465, "secure": True, "disableStartTls": False}},
    {"name": "Postgres n8n (orca)", "type": "postgres",
     "data": {"host": "<<TODO: numele containerului Postgres>>", "database": "<<TODO>>", "user": "<<TODO>>", "password": "<<TODO>>", "port": 5432, "ssl": "disable"}},
    {"name": "Google Calendar OK", "type": "googleCalendarOAuth2Api",
     "data": {"clientId": "<<TODO: OAuth client ID din Google Cloud>>", "clientSecret": "<<TODO>>"}},
    {"name": "Google Places API key", "type": "httpHeaderAuth",
     "data": {"name": "X-Goog-Api-Key", "value": "<<TODO: cheia Places API (New)>>"}},
    {"name": "Meta Page token", "type": "httpQueryAuth",
     "data": {"name": "access_token", "value": "<<TODO: Page access token long-lived>>"}},
    {"name": "DeepL API key", "type": "httpHeaderAuth",
     "data": {"name": "Authorization", "value": "DeepL-Auth-Key <<TODO: cheia DeepL API Free; necesară doar dacă Config.traducere = deepl (M8)>>"}},
    {"name": "Meta WhatsApp token", "type": "httpHeaderAuth",
     "data": {"name": "Authorization", "value": "Bearer <<TODO: System User token permanent cu whatsapp_business_messaging; necesar doar dacă Config.whatsapp != nu (M8, după go-live)>>"}},
]
# Câmpurile de workflow și de settings acceptate de API-ul public (restul sunt refuzate cu 400).
CAMPURI_WORKFLOW = ("name", "nodes", "connections", "settings", "staticData")
CAMPURI_SETARI = ("saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution",
                  "executionTimeout", "errorWorkflow", "timezone", "executionOrder")
PLACEHOLDER_ID = "<<TODO"
# n8n este local (orca) sau în Tailscale: niciodată prin proxy-ul HTTP din mediu
DESCHIDE = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def spune(s): print(s, flush=True)

def api(metoda, cale, corp=None):
    url = N8N_URL + "/api/v1" + cale
    date = json.dumps(corp).encode("utf-8") if corp is not None else None
    cerere = urllib.request.Request(url, data=date, method=metoda, headers={
        "X-N8N-API-KEY": CHEIE, "Accept": "application/json", "Content-Type": "application/json"})
    try:
        with DESCHIDE.open(cerere, timeout=30) as r:
            text = r.read().decode("utf-8")
            return r.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")
        try: j = json.loads(text)
        except Exception: j = {"message": text[:300]}
        return e.code, j
    except urllib.error.URLError as e:
        spune(f"✗ Nu ajung la {url}: {e.reason}. Verifică N8N_URL (n8n pornit? portul? rulezi de pe orca sau prin Tailscale?).")
        sys.exit(3)

def toate_workflowurile():
    rezultat, cursor = [], None
    while True:
        cale = "/workflows?limit=100" + (f"&cursor={urllib.parse.quote(cursor)}" if cursor else "")
        stare, j = api("GET", cale)
        if stare != 200:
            spune(f"✗ GET /workflows a răspuns {stare}: {(j or {}).get('message', j)}")
            if stare == 401: spune("  Cheia N8N_API_KEY nu este acceptată (expirată sau copiată greșit). n8n → Settings → n8n API.")
            sys.exit(3)
        rezultat += j.get("data", [])
        cursor = j.get("nextCursor")
        if not cursor: break
    return rezultat

# ---------- 1. acces ----------
spune(f"→ n8n la {N8N_URL}" + (" (SIMULARE: nu scriu nimic)" if SIMULARE else ""))
existente = toate_workflowurile()
spune(f"  ✓ API ok; {len(existente)} workflow-uri există deja în n8n")
dupa_nume = {w["name"]: w for w in existente}

# ---------- 2. credențiale ----------
stare_locala = {}
if os.path.exists(STARE):
    try: stare_locala = json.load(open(STARE, encoding="utf-8"))
    except Exception: stare_locala = {}
cred_id = dict(stare_locala.get("credentiale", {}))
# id-urile reale apar și în workflow-urile deja importate (nodurile își țin credențialele ca {id, name})
for w in existente:
    for n in w.get("nodes", []):
        for tip, c in (n.get("credentials") or {}).items():
            if c.get("id") and c.get("name") and not str(c["id"]).startswith(PLACEHOLDER_ID):
                cred_id.setdefault(c["name"], c["id"])

if not FARA_CRED:
    spune("→ credențiale placeholder")
    for c in CREDENTIALE:
        if c["name"] in cred_id:
            spune(f"  · {c['name']} există (id {cred_id[c['name']]})"); continue
        if SIMULARE:
            spune(f"  + ar crea „{c['name']}” ({c['type']})"); cred_id[c["name"]] = "(simulat)"; continue
        stare, j = api("POST", "/credentials", {"name": c["name"], "type": c["type"], "data": c["data"]})
        if stare in (200, 201) and j and j.get("id"):
            cred_id[c["name"]] = j["id"]; spune(f"  ✓ creată „{c['name']}” ({c['type']}) → id {j['id']}")
        else:
            spune(f"  ✗ „{c['name']}” ({c['type']}): {stare} {(j or {}).get('message', j)}")
            spune("    Creează-o manual în n8n → Credentials, cu EXACT acest nume, apoi rulează din nou scriptul.")
else:
    spune("→ credențialele se sar (--fara-credentiale)")

lipsa = [c["name"] for c in CREDENTIALE if c["name"] not in cred_id]

# ---------- 3. workflow-uri ----------
fisiere = sorted(f for f in os.listdir(N8N_DIR) if f.endswith(".json") and (not DOAR or f in DOAR))
if not fisiere:
    spune(f"✗ Niciun workflow de importat în {N8N_DIR}" + (f" dintre {DOAR}" if DOAR else "")); sys.exit(2)
spune(f"→ workflow-uri ({len(fisiere)})")
rezumat = []
for f in fisiere:
    w = json.load(open(os.path.join(N8N_DIR, f), encoding="utf-8"))
    corp = {k: w[k] for k in CAMPURI_WORKFLOW if k in w}
    corp["settings"] = {k: v for k, v in (w.get("settings") or {}).items() if k in CAMPURI_SETARI}
    if "staticData" not in corp: corp["staticData"] = None
    neinlocuite = []
    for n in corp["nodes"]:
        n.pop("createdAt", None); n.pop("updatedAt", None)
        for tip, c in (n.get("credentials") or {}).items():
            if str(c.get("id", "")).startswith(PLACEHOLDER_ID):
                if c.get("name") in cred_id: c["id"] = cred_id[c["name"]]
                else: neinlocuite.append(f"{n['name']} → {c.get('name')}")
        # fără id valid, importul ar eșua: scoatem referința rămasă placeholder; nodul se leagă manual în interfață
        for tip in list((n.get("credentials") or {}).keys()):
            if str(n["credentials"][tip].get("id", "")).startswith(PLACEHOLDER_ID): del n["credentials"][tip]
    exista = dupa_nume.get(corp["name"])
    actiune = "PUT" if exista else "POST"
    if SIMULARE:
        spune(f"  · {f}: ar face {actiune} „{corp['name']}” ({len(corp['nodes'])} noduri)" + (f"; credențiale nelegate: {', '.join(neinlocuite)}" if neinlocuite else ""))
        rezumat.append((corp["name"], None, neinlocuite)); continue
    if exista:
        stare, j = api("PUT", f"/workflows/{exista['id']}", corp)
    else:
        stare, j = api("POST", "/workflows", corp)
    if stare in (200, 201) and j and j.get("id"):
        spune(f"  ✓ {f}: {'actualizat' if exista else 'importat'} „{corp['name']}” → id {j['id']}" + (f"; de legat manual: {', '.join(neinlocuite)}" if neinlocuite else ""))
        rezumat.append((corp["name"], j["id"], neinlocuite))
        dupa_nume[corp["name"]] = j
    else:
        spune(f"  ✗ {f}: {stare} {(j or {}).get('message', j)}")
        rezumat.append((corp["name"], None, neinlocuite + ["IMPORT EȘUAT"]))

# ---------- 4. stare + ce urmează ----------
if not SIMULARE:
    try:
        json.dump({"actualizat": time.strftime("%Y-%m-%dT%H:%M:%S"), "n8n_url": N8N_URL, "credentiale": cred_id,
                   "workflowuri": {nume: wid for nume, wid, _ in rezumat if wid}}, open(STARE, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        spune(f"  ✓ stare scrisă în {STARE} (nu se comite)")
    except Exception as e:
        spune(f"  · nu am putut scrie {STARE}: {e}")

spune("")
spune("Urmează, în interfața n8n (" + N8N_URL + "):")
spune("  1. Credentials → fiecare credențială „<<TODO>>” primește valoarea reală; la „Google Calendar OK” apeși și „Sign in with Google”.")
if lipsa: spune("     Lipsesc și trebuie create manual, cu exact aceste nume: " + ", ".join(lipsa))
spune("  2. În fiecare workflow, nodul Config: github_owner/github_repo (arkadss/restaurantok-site), telegram_chat_id, calendar_id,")
spune("     page_id, site_token (același ca în src/partials/head.html → meta ok-webhook-token), director_poze.")
spune("  3. Rulezi o dată manual fiecare workflow (Test workflow) și verifici commit-ul în repo; apoi Active → on.")
spune("  4. Webhook-ul: n8n trebuie pornit cu WEBHOOK_URL=https://hooks.restaurantok.com/ (vezi orca/README.md), iar tunelul cloudflared să ruleze.")
esuate = [nume for nume, wid, probleme in rezumat if "IMPORT EȘUAT" in probleme]
sys.exit(1 if esuate else 0)
PY
