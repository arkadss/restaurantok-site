# orca — instalarea pe server (M7)

Fișierele de aici se rulează **cu Sorin, într-o sesiune interactivă, prin Tailscale** (de pe Mac Mini sau direct pe orca). Sesiunile nocturne nu le rulează niciodată: au nevoie de credențiale.

| Fișier | Rol |
|---|---|
| `install.sh` | importă workflow-urile din `n8n/*.json` în n8n prin API (`N8N_API_KEY`) și creează credențialele placeholder; idempotent, are `--simulare` |
| `docker-compose.cloudflared.yml` | containerul `cloudflared` (tunelul Cloudflare, doar outbound) atașat la rețeaua Docker a n8n |
| `cloudflared/config.yml` | regulile tunelului: doar `hooks.restaurantok.com/webhook/*` → `n8n:5678`; restul 404 |
| `.env.exemplu` | șablon pentru `orca/.env` (`N8N_URL`, `N8N_API_KEY`, `N8N_NETWORK`); `.env` nu se comite |
| `go-live.md` | checklist-ul complet de lansare: Cloudflare, DNS, Pages, tunel, WAF, Search Console, oprirea WordPress-ului |

Testul scriptului de instalare, fără n8n: `node tests/install-orca.test.js` (API n8n simulat).

## Ordinea instalării pe orca (rezumat; detaliile în `go-live.md`)

Premise, deja pe orca: Debian 13, Docker, n8n + Postgres 16 în `docker compose`, acces doar prin Tailscale.

1. **Repo-ul și cheia API.** Pe orca: `git clone https://github.com/arkadss/restaurantok-site.git && cd restaurantok-site/orca`, apoi `cp .env.exemplu .env` și completează `N8N_URL` (de pe orca: `http://localhost:5678`) și `N8N_API_KEY` (n8n → Settings → n8n API → Create an API key).
2. **n8n: variabile de mediu.** În `docker-compose` al n8n (serviciul n8n → `environment`) trebuie să existe, apoi `docker compose up -d`:
   - `WEBHOOK_URL=https://hooks.restaurantok.com/` — altfel nodul Webhook afișează și validează URL-ul intern;
   - `GENERIC_TIMEZONE=Europe/Bucharest` și `TZ=Europe/Bucharest`;
   - `N8N_PUBLIC_API_DISABLED=false` (implicit; API-ul este necesar doar pentru `install.sh`);
   - un volum pentru pozele-model (M4): `./poze-model:/home/node/.n8n/poze-model`, directorul creat pe gazdă cu `mkdir -p poze-model && chown 1000:1000 poze-model`.
3. **Baza de date.** `docker exec -i <container-postgres> psql -U <utilizator> -d <baza> < ../n8n/sql/cereri.sql` (tabelul `cereri`).
4. **Import.** `./install.sh --simulare`, apoi `./install.sh`. Scriptul creează cele 9 credențiale cu valori `<<TODO>>` (cea pentru WhatsApp e opțională, după go-live) și importă cele 6 workflow-uri (inactive). A doua rulare actualizează, nu dublează.
5. **Credențialele reale**, în interfața n8n (Credentials): GitHub PAT (fine-grained, doar repo-ul site-ului, Contents: Read and write), token-ul botului Telegram, SMTP-ul domeniului, Postgres (aceeași bază ca n8n), Google Calendar (OAuth: client ID/secret din Google Cloud + „Sign in with Google"), cheia Google Places, Page token-ul Meta. Pașii pentru fiecare: `n8n/README.md`.
6. **Nodul `Config`** din fiecare workflow: `github_owner` = `arkadss`, `github_repo` = `restaurantok-site`, `telegram_chat_id` (trimite un mesaj botului și citește execuția trigger-ului din `meniu-zilei`), `calendar_id` (sală, evenimente), `page_id`, `site_token` (vezi mai jos), `director_poze`.
7. **Token-ul webhook-ului.** Generează unul: `openssl rand -hex 24`. Pune-l în `Config.site_token` din `site-cerere` și în `src/partials/head.html` → `<meta name="ok-webhook-token">`, apoi commit + push: Cloudflare Pages reconstruiește site-ul cu noul token. (Token-ul este public în HTML; protecția reală este rate limit-ul din Cloudflare + honeypot-ul.)
8. **Tunelul** (secțiunea de mai jos), apoi **activarea** workflow-urilor, câte unul, cu o rulare manuală de test (vezi verificările din `n8n/README.md`, la fiecare modul).

## Tunelul cloudflared (hooks.restaurantok.com → n8n)

Tunelul este o conexiune pornită DIN orca către Cloudflare; pe orca nu se deschide niciun port. Doar `/webhook/*` trece.

1. Pe orca (o singură dată, interactiv; `cloudflared` se poate rula și din container: `docker run --rm -it -v "$PWD/cloudflared:/home/nonroot/.cloudflared" cloudflare/cloudflared:latest tunnel login`):
   - `cloudflared tunnel login` → deschide un link, alegi domeniul `restaurantok.com` → se scrie `cert.pem`;
   - `cloudflared tunnel create ok-hooks` → afișează **ID-ul tunelului** (UUID) și scrie `<ID>.json` (credențialele tunelului);
   - `cloudflared tunnel route dns ok-hooks hooks.restaurantok.com` → creează înregistrarea CNAME `hooks` → `<ID>.cfargotunnel.com` în DNS-ul Cloudflare.
2. Copiază `<ID>.json` în `orca/cloudflared/` (lângă `config.yml`; `.gitignore` îl exclude) și completează în `config.yml` ID-ul (de două ori) și numele containerului n8n (`docker ps`).
3. În `orca/.env`: `N8N_NETWORK` = rețeaua Docker a stack-ului n8n (`docker network ls`, de obicei `<director>_default`).
4. `docker compose -f docker-compose.cloudflared.yml up -d && docker compose -f docker-compose.cloudflared.yml logs -f` → „Registered tunnel connection" (de 4 ori) înseamnă că merge.
5. Verificare de pe orice calculator: `curl -i https://hooks.restaurantok.com/` → **404** (de la cloudflared, corect: interfața nu e expusă); `curl -X POST https://hooks.restaurantok.com/webhook/site-cerere -H 'Content-Type: application/json' -H 'X-Site-Token: <token>' -d @tests/exemplu-cerere.json` → `{"ok":true,"id":"sala-…"}` (după ce `site-cerere` e activ).
6. În Cloudflare → Security → WAF → Rate limiting rules: `hooks.restaurantok.com`, URI path starts with `/webhook/`, 10 cereri / minut / IP → Block 1 minut. Și o regulă care blochează orice metodă în afară de `POST` și `OPTIONS` pe acel hostname (opțional).

Alternativă fără `tunnel login`: în Cloudflare Zero Trust → Networks → Tunnels → Create tunnel (Cloudflared) → copiezi token-ul; atunci `command` din compose devine `tunnel --no-autoupdate run --token ${TUNNEL_TOKEN}` (token-ul în `.env`), iar regula „Public hostname" `hooks.restaurantok.com`, path `webhook/*` → `http://n8n:5678` se setează din dashboard, nu din `config.yml`.

## Ce nu face nimic de aici

Nu modifică DNS-ul, conturile sau credențialele; nu oprește WordPress-ul. Toate acestea sunt pași manuali, bifați în `go-live.md`.
