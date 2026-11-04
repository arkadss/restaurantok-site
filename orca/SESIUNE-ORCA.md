# Sesiunea Claude Code pe orca — instrucțiuni pentru agent

Acest fișier e brief-ul pentru o sesiune **Claude Code rulată direct pe orca**, controlată de Sorin de pe laptop (Remote Control). Scopul: instalarea M7 pe orca cu cât mai puțin efort din partea lui Sorin. Agentul face tot ce se poate face singur și îl întreabă pe Sorin **doar** la pașii marcați 🔑 (au nevoie de un cont, un browser sau un secret).

## Pornire (o singură dată, Sorin, ~5 minute)

Pe orca (prin `ssh` peste Tailscale):

```bash
curl -fsSL https://claude.ai/install.sh | bash        # instalează Claude Code
git clone https://github.com/arkadss/restaurantok-site.git ~/restaurantok-site
cd ~/restaurantok-site
claude --remote-control orca                          # prima dată: login (deschide linkul afișat pe laptop)
```

Sesiunea „orca” apare apoi pe laptop sau telefon, în claude.ai/code. Ca să nu se închidă când ieși din ssh, pornește-o într-un `tmux` (`sudo apt install tmux`, `tmux new -s claude`, apoi comanda de mai sus). Primul mesaj către agent:

> Citește orca/SESIUNE-ORCA.md și execută-l. Întreabă-mă doar la pașii 🔑.

Dacă repo-ul e privat și `git clone` cere parolă: `gh auth login` sau un PAT doar pentru citire; ori clonează pe laptop și copiezi cu `scp -r`.

## Reguli pentru agent

- **Secretele nu se scriu în repo, în artefact sau în conversație.** Sorin le introduce el, direct în interfața n8n (`http://orca:5678`, Credentials → nume → Edit) sau în `orca/.env`, care e în `.gitignore`. Agentul îi spune exact unde, nu îi cere valoarea.
- Înainte să modifici `docker-compose` al n8n: fă o copie (`cp docker-compose.yml docker-compose.yml.inainte-ok`) și arată-i lui Sorin diff-ul. Repornirea n8n (`docker compose up -d`) se face doar după ce Sorin confirmă: întrerupe workflow-urile lui existente câteva secunde.
- Nu atinge alte workflow-uri, credențiale sau containere decât cele ale proiectului. Workflow-urile importate rămân **inactive** până la pasul lor de test.
- Nu schimba DNS-ul, nameserverele sau WordPress-ul: asta e ziua de go-live (`orca/go-live.md`, pașii 0–3 și 7), cu Sorin.
- Commit-urile din repo (ex. token-ul webhook în `src/partials/head.html`) se fac doar cu acordul lui Sorin și nu conțin secrete.
- La final: un rezumat scurt în română, plus actualizarea `STATUS.md` (rândul M7 și Jurnal), commit și push.

## Etapa 1 — fără Sorin (agentul singur)

1. **Inventar.** `docker ps`, `docker network ls`, locația fișierului `docker-compose` al n8n (`docker inspect <n8n> --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'`), versiunea n8n, containerul Postgres, utilizatorul și baza (din `environment` al compose-ului). Notează-le într-un fișier local `orca/.inventar.txt` (nu se comite; adaugă-l în `.gitignore` dacă lipsește).
2. **Verificări.** `node --version` (dacă lipsește Node, testele se pot sări; `install.sh` cere doar bash și python3), `python3 --version`, `bash orca/install.sh --help`.
3. **Compose-ul n8n.** Pregătește diff-ul cu variabilele din `orca/README.md`, pasul 2 (`WEBHOOK_URL`, `GENERIC_TIMEZONE`, `TZ`, volumul `poze-model`, creat cu `chown 1000:1000`). Nu porni nimic încă: îl arăți la etapa 2.
4. **Tabelul `cereri`.** `docker exec -i <postgres> psql -U <user> -d <baza> < n8n/sql/cereri.sql` (idempotent: `CREATE TABLE IF NOT EXISTS`; verifică înainte).
5. **`orca/.env`.** Din `.env.exemplu`: `N8N_URL=http://localhost:5678`, `N8N_NETWORK=<rețeaua de la pasul 1>`. `N8N_API_KEY` rămâne de completat de Sorin.
6. **`orca/cloudflared/config.yml`.** Completează numele containerului n8n. ID-ul tunelului vine la etapa 3.

## Etapa 2 — 🔑 Sorin, ~15 minute, totul din browser

Agentul îi cere, pe rând:

1. 🔑 **Aprobarea diff-ului din compose** → agentul repornește n8n și verifică `docker logs` + `curl -s localhost:5678/healthz`.
2. 🔑 **Cheia API n8n**: n8n → Settings → n8n API → Create an API key → Sorin o pune singur în `orca/.env` (`nano orca/.env`). Agentul rulează `./orca/install.sh --simulare`, îi arată rezultatul, apoi `./orca/install.sh`.
3. 🔑 **Credențialele de bază** (Sorin le completează în n8n, agentul îi dă linkurile și pașii din `n8n/README.md`):
   - **Telegram OK bot**: token-ul botului existent (de la @BotFather → /mybots → API Token);
   - **GitHub PAT site**: github.com → Settings → Developer settings → Fine-grained tokens → doar `arkadss/restaurantok-site`, Contents: Read and write;
   - **Postgres n8n (orca)**: agentul îi spune host/bază/utilizator din inventar; parola o știe Sorin (sau e în compose; atunci agentul îi spune unde s-o vadă).
4. **`Config`** în `meniu-zilei` (agentul, prin API): `github_owner=arkadss`, `github_repo=restaurantok-site`, `telegram_chat_id` (🔑 Sorin trimite un mesaj botului; agentul citește chat id-ul din execuție).
5. **Primul workflow viu: `meniu-zilei`** (inclusiv editarea prin Telegram). Activare, test: Sorin scrie botului `?`, apoi `arată program`. Commit-ul de test apare în repo. Din acest moment Sorin poate schimba programul cofetăriei, zilele închise și prețurile torturilor din Telegram, chiar înainte de go-live.

Restul credențialelor (SMTP, Google Calendar, Places, Meta) **nu** blochează nimic acum; se fac la etapa 4.

## Etapa 3 — 🔑 ziua de go-live (cere cont Cloudflare + domeniul mutat pe Cloudflare)

Tunelul `hooks.restaurantok.com` are nevoie ca domeniul să fie deja în Cloudflare. Ordinea: `orca/go-live.md` pașii 0–3 (Sorin + agent), apoi `orca/README.md` → „Tunelul cloudflared" (🔑 `tunnel login` = un link deschis de Sorin), token-ul webhook (`openssl rand -hex 24`, 🔑 commit cu acordul lui Sorin), WAF, `site-cerere` activat, testul cap-coadă de pe telefon.

## Etapa 4 — când vrea Sorin (fiecare independent, ~10 minute)

| Ce | 🔑 de la Sorin | Deblochează |
|---|---|---|
| SMTP `contact@restaurantok.com` | datele de la furnizorul de email | emailul de confirmare către clienți |
| Google Calendar OAuth | proiect Google Cloud + „Sign in with Google" | `sala-disponibilitate`, `evenimente` |
| Google Places API key | cheie în Google Cloud (cere card) | `recenzii-google` |
| Meta Page token | token long-lived pentru pagina OkCalafat | `postari-facebook` |
| DeepL (opțional) | cheie gratuită | traduceri mai bune ale meniului |
| WhatsApp (opțional) | număr dedicat + token Meta | notificări pe WhatsApp |

Pașii exacți pentru fiecare: `n8n/README.md`. După fiecare: activarea workflow-ului și verificarea din `orca/go-live.md`, pasul 5.
