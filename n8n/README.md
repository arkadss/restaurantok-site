# n8n pe orca — workflow-urile site-ului restaurantok.com

Starea: **toate workflow-urile sunt scrise și validate structural: M1 `meniu-zilei`, M2 `site-cerere` (extins la M3 cu tipul `catering` și la M4 cu tipul `tort` + poza-model), `sala-disponibilitate`, M5 `recenzii-google` și `postari-facebook`, M6 `evenimente`; M8 adaugă în `meniu-zilei` traducerile și editarea conținutului, iar în `site-cerere` notificările WhatsApp Business (oprite implicit). Nimic nu este instalat încă**, exportate ca JSON importabil în n8n. Instalarea pe orca (M7) se face într-o sesiune interactivă cu Sorin, cu `orca/install.sh` și checklist-ul `orca/go-live.md`, nu noaptea.

## M7 — instalarea pe orca, pe scurt

Pașii compleți sunt în `orca/README.md` (n8n, tunel) și `orca/go-live.md` (Cloudflare, DNS, Pages, WordPress). Pentru n8n:

1. `orca/.env` cu `N8N_URL` și `N8N_API_KEY` (Settings → n8n API), apoi `cd orca && ./install.sh --simulare && ./install.sh`: creează cele 9 credențiale din tabelul de mai jos cu valori `<<TODO>>` și importă cele 6 workflow-uri cu referințele la credențiale legate deja de id-urile reale; workflow-urile rămân inactive. Rulat din nou, actualizează (PUT), nu dublează. Test fără n8n: `node tests/install-orca.test.js`.
2. În interfață: valorile reale ale credențialelor (secțiunile fiecărui modul spun cum se obțin), nodul `Config` din fiecare workflow, apoi o rulare manuală și activarea, în ordinea: `site-cerere` (după tunel) → `meniu-zilei` → `sala-disponibilitate` → `evenimente` → `recenzii-google` → `postari-facebook`.
3. n8n are nevoie de `WEBHOOK_URL=https://hooks.restaurantok.com/`, `GENERIC_TIMEZONE=Europe/Bucharest` și volumul pentru pozele-model (M4) în `docker-compose`-ul lui; tunelul `cloudflared` (`orca/docker-compose.cloudflared.yml`) lasă să treacă doar `/webhook/*`.

## Credențiale (doar placeholder-e; valorile reale nu se scriu niciodată în repo)

| Nume în n8n | Folosit de | Valoare |
|---|---|---|
| `GITHUB_PAT` (credențiala „GitHub PAT site") | toate workflow-urile care scriu în `data/` | `<<TODO: fine-grained PAT, doar repo-ul site-ului, permisiunea Contents: Read and write>>` |
| `TELEGRAM_BOT_TOKEN` (credențiala „Telegram OK bot") / `TELEGRAM_CHAT_ID` | M1 trigger + notificări către Sorin | `<<TODO>>` |
| `SMTP_*` (credențiala „SMTP contact@restaurantok.com") | emailurile de confirmare către clienți (M2) | `<<TODO: host, port, utilizator, parolă, de la furnizorul de email al domeniului>>` |
| `POSTGRES` (credențiala „Postgres n8n (orca)") | log-ul cererilor, tabelul `cereri` (M2) | `<<TODO: aceeași bază ca n8n sau una separată; vezi n8n/sql/cereri.sql>>` |
| `GOOGLE_CALENDAR_OAUTH` (credențiala „Google Calendar OK") | sală (M2), evenimente (M6) | `<<TODO: OAuth2 în n8n, proiect Google Cloud cu Calendar API>>` |
| `CLOUDFLARE_ANALYTICS_TOKEN` | statistici fără cookie-uri (M6) | `<<TODO: nu e secret; se scrie în data/program.json → site.cloudflare_analytics_token>>` |
| `GOOGLE_PLACES_API_KEY` (credențiala „Google Places API key", Header Auth `X-Goog-Api-Key`); Place ID-urile sunt deja în `Config` | recenzii (M5) | `<<TODO: cheie API din Google Cloud, restricționată la Places API (New)>>` |
| `META_PAGE_TOKEN` (credențiala „Meta Page token", Query Auth `access_token`) + Page ID în `Config` | postări Facebook (M5) | `<<TODO: Page access token long-lived al paginii OkCalafat>>` |
| `DEEPL_API_KEY` (credențiala „DeepL API key", Header Auth `Authorization: DeepL-Auth-Key <cheie>`) | traducerile EN/BG ale meniului zilei (M8), doar dacă `Config.traducere = deepl`; implicit se folosește glosarul local, fără cheie | `<<TODO: cheie DeepL API Free (deepl.com/pro-api, gratuit până la 500.000 de caractere/lună); opțional>>` |
| `META_WHATSAPP_TOKEN` (credențiala „Meta WhatsApp token", Header Auth `Authorization: Bearer <token>`) + Phone number ID și numărul lui Sorin în `Config` | notificările WhatsApp Business ale cererilor (M8), doar dacă `Config.whatsapp` ≠ `nu`; implicit oprit | `<<TODO: System User token permanent din Meta Business, cu permisiunea whatsapp_business_messaging; după go-live, opțional>>` |
| `SITE_WEBHOOK_TOKEN` | header `X-Site-Token` pe `/webhook/site-cerere` | `<<TODO: generat la instalare; același text în nodul Config (site_token) și în src/partials/head.html (meta ok-webhook-token)>>` |

## Convenții

- Fiecare workflow scrie un singur fișier din `data/` și pune `actualizat` (ISO 8601 cu offset) la fiecare rulare.
- Commit-urile se fac pe branch-ul principal, cu mesaj `data: <fișier> <data>`; Cloudflare Pages redeploy automat (~1 minut).
- Site-ul nu știe de orca: formularele lovesc `https://hooks.restaurantok.com/webhook/...` (tunel cloudflared, vezi `orca/`).
- Fiecare workflow are un singur nod `Config` (Set) cu tot ce e de completat; secretele stau în credențialele n8n, nu în noduri.
- Fișierele JSON se generează din surse testabile: `node n8n/genereaza.js` (rescrie `n8n/*.json` din `n8n/cod/` și `n8n/def/`), `node n8n/valideaza.js` (verificarea de import), testele din `tests/`.

## M1 — `meniu-zilei.json` (Telegram → `data/meniu-zilei.json` → GitHub → site)

**Ce face.** Sorin trimite botului Telegram textul meniului (seara, ca pe Facebook) și pozele (în jurul orei 11). Workflow-ul parsează textul, detectează alergenii, scrie `data/meniu-zilei.json`, redimensionează pozele (max 1200 px, JPEG) și le urcă în `data/poze/`, face commit pe GitHub și confirmă pe Telegram. La ora închiderii (`Config.ora_inchidere`, implicit 16:00, luni–sâmbătă) un al doilea trigger marchează `valabil_pana` ca trecut; site-ul oricum se închide singur când trece `valabil_pana`, deci trigger-ul este doar plasa de siguranță.

**Comenzi acceptate în chat** (orice alt text este tratat ca meniu):

| Mesaj | Efect |
|---|---|
| textul meniului (un rând sau câte un preparat pe rând; opțional data, prețul, „(gluten, ou)" după preparat) | scrie meniul; fără dată: după ora 14:00 înseamnă *mâine*, altfel *azi* |
| o poză (sau mai multe, ca album) | se adaugă la meniul curent: `data/poze/<data>-<n>.jpg`; site-ul arată primele 3 |
| `alergeni 2: gluten, lapte` / `alergeni 3: fără` | corectează alergenii preparatului 2 / 3 |
| `gata` | închide meniul mai devreme (site-ul trece pe mesajul de rezervă) |
| `en 2: Fried carp with polenta` / `bg 2: Пържен шаран с качамак` | corectează traducerea preparatului 2 (M8); traducerile automate vin din glosar sau DeepL, vezi secțiunea M8 |
| `închis 25.12 Crăciun`, `deschis 31.12 9:00-15:00`, `program cofetărie: …`, `săptămâna: …`, `tort …`, `catering …`, `arată …` | editarea conținutului site-ului (M8): program, zile închise, meniul săptămânii, prețuri — vezi secțiunea „M8 — editarea conținutului" |
| `/start`, `/ajutor`, `?` | explică formatul; `editare` explică comenzile de editare |

**Noduri** (26): `Telegram Trigger` și `Trigger 16:00` → `Config` → `Este Sorin?` (ignoră alte chat-uri) → `Interpretează mesajul` (Code; parserul din `n8n/cod/parseaza-meniu.js`) → `Ce facem?` (Switch) → pentru meniu `Traducem cu DeepL?` → (`DeepL EN` → `DeepL BG`) → `Traduceri` (Code, M8; `n8n/cod/traduceri.js` + `glosar-meniu.js`); pentru poze `Descarcă poza` → `Redimensionează` → apoi comun `Citește JSON curent` (GitHub get, continuă și când fișierul lipsește) → `Îmbină` (Code; `n8n/cod/imbina.js`) → `Scriem?` → `Scrie meniu-zilei.json` (GitHub edit) → `Are poză?` → `Pregătește poza` → `Urcă poza` (GitHub create, binar) → `Confirmă` (Telegram). Răspunsurile de ajutor/eroare merg prin `Răspunde ajutor`. Ramura „editare" (M8): `Citește fișierul de editat` (GitHub get) → `Aplică modificarea` (Code; `n8n/cod/aplica-editare.js` + `editare.js`) → `Scriem modificarea?` → `Scrie fișierul editat` (GitHub edit) → `Confirmă editarea` (Telegram).

**Instalare (la M7, cu Sorin):**

1. Creează credențialele „Telegram OK bot" (token-ul botului existent) și „GitHub PAT site" (PAT cu scriere pe repo).
2. Importă `n8n/meniu-zilei.json` (Workflows → Import from file) și alege cele două credențiale în nodurile care le cer (nodurile au placeholder `<<TODO: id credențială>>`).
3. Completează nodul `Config`: `github_owner`, `github_repo`, `telegram_chat_id` (chat ID-ul lui Sorin; îl afli trimițând un mesaj botului și citind execuția trigger-ului), restul au valori implicite.
4. Repo-ul trebuie să conțină deja `data/meniu-zilei.json` (nodul folosește operația *edit*); dacă nu există, fă un commit manual cu exemplul din `data/`.
5. Verificări: trimite `?` → primești ajutorul; trimite un meniu de test cu `mâine` → apare commit `data: meniu-zilei.json <data>` și site-ul îl arată marcat „Mâine"; trimite o poză → commit cu `data/poze/...`; `gata` → site-ul trece pe mesajul de rezervă.
6. Imaginea Docker oficială n8n include GraphicsMagick (necesar nodului `Redimensionează`). Dacă pozele depășesc 200 KB, scade `quality` la 75 în acel nod.

**Limite cunoscute / de confirmat cu Sorin:** detectarea alergenilor este după cuvinte-cheie (marcată `alergeni_automat: true` în JSON) și trebuie confirmată de el la fiecare meniu (confirmarea de pe Telegram arată lista); ciorbele și supele sunt marcate automat cu *țelină*. Traducerile EN/BG din contract (`traduceri`) se generează automat din glosarul local (sau DeepL, dacă e configurat), vezi secțiunea M8; ce nu e în glosar rămâne în română pe site. Albumele Telegram sosesc ca mesaje separate, deci fiecare poză face un commit.

**Testare locală fără n8n:** `node tests/parseaza-meniu.test.js` (parserul), `node tests/n8n-meniu.test.js` (nodurile Code cu un mediu n8n simulat), `node tests/traduceri.test.js` (glosarul și nodul „Traduceri", M8), `node n8n/valideaza.js` (structura de import).

## M2 — `site-cerere.json` (formularele site-ului → Telegram + email + Postgres)

**Ce face.** Site-ul face `POST https://hooks.restaurantok.com/webhook/site-cerere` cu payload-ul din PLAN.md (`tip`, `nume`, `telefon`, `email`, `data_eveniment`, `persoane`, `mesaj`, `detalii`, `consimtamant`, `website`) și header-ul `X-Site-Token`. Workflow-ul validează (aceleași reguli ca în browser: `n8n/cod/valideaza-cerere.js` ↔ `src/assets/js/site.js`), filtrează spam-ul (honeypot `website` ≠ gol sau token greșit → răspunde `200 {ok:true}` cu un id fals, fără notificare), trimite cererea pe Telegram lui Sorin (HTML, cu link `tel:` și WhatsApp către client), trimite clientului un email de confirmare în text simplu de la `contact@restaurantok.com` (cu copie la restaurant) dacă a lăsat email, scrie rândul în Postgres (`cereri`) și răspunde `{ "ok": true, "id": "sala-20261021-k3f9" }`. Id-ul apare în confirmarea din pagină, în email și în Postgres, ca să se poată căuta.

**Noduri** (11): `Webhook site-cerere` (POST, răspuns prin nod, `allowedOrigins` = restaurantok.com pentru preflight-ul CORS) → `Config` → `Validează cererea` (Code) → `Este validă?` → `Anunță pe Telegram` → `Are email?` → `Email de confirmare` (SMTP) → `Rândul pentru Postgres` (Code) → `Salvează în Postgres` (insert, mapare automată) → `Răspunde OK`; ramura de eroare: `Răspunde cu eroare` (400 cu `{ok:false, eroare:"câmpuri invalide: …"}`). Telegram, email și Postgres au `onError: continue`: dacă unul cade, clientul tot primește confirmarea și cererea ajunge pe celelalte canale.

**Ce face site-ul dacă webhook-ul nu răspunde** (înainte de go-live, tunel căzut, timeout 12 s): afișează „Nu am reușit să trimitem cererea" cu un buton WhatsApp care conține cererea gata scrisă (eveniment, dată, persoane, nume, detalii) și numărul de telefon. Nicio cerere nu se pierde în tăcere.

**Instalare (la M7, cu Sorin):**

1. Rulează `n8n/sql/cereri.sql` în Postgres (o singură dată) și creează credențiala „Postgres n8n (orca)".
2. Creează credențiala „SMTP contact@restaurantok.com" (datele SMTP ale furnizorului de email al domeniului; SPF/DKIM existente trebuie să acopere serverul folosit, altfel confirmările ajung în spam).
3. Importă `n8n/site-cerere.json`, alege credențialele (Telegram, SMTP, Postgres), completează `Config`: `site_token` (un text aleatoriu lung; același se scrie în `src/partials/head.html`, meta `ok-webhook-token`, apoi build + deploy), `telegram_chat_id`, `origine_permisa` (`https://restaurantok.com`).
4. Activează workflow-ul; URL-ul de producție este `https://<n8n>/webhook/site-cerere`; tunelul cloudflared de pe orca expune doar `/webhook/*` ca `hooks.restaurantok.com` (vezi `orca/` la M7). În Cloudflare: regulă WAF de rate limit pe `hooks.restaurantok.com/webhook/*` (ex. 10 cereri / minut / IP).
5. Verificări: `curl -X POST https://hooks.restaurantok.com/webhook/site-cerere -H 'Content-Type: application/json' -H 'X-Site-Token: <token>' -d @tests/exemplu-cerere.json` → `{"ok":true,"id":"sala-…"}`, mesaj pe Telegram, email la adresa din exemplu, rând în `cereri`; același payload cu `"website":"x"` → `{"ok":true}` dar nimic pe Telegram; fără token → la fel (tăcut); cu `"telefon":"123"` → 400.

**Limite cunoscute:** token-ul din site este public (stă în HTML), deci oprește doar roboții generici; protecția reală este rate limit-ul din Cloudflare + honeypot-ul. Emailul este text simplu (fără HTML, fără logo), intenționat: ajunge mai sigur în Inbox. Tipul `tort` (M4) are regulile și textele lui mai jos.

**Testare locală fără n8n:** `node tests/n8n-cerere.test.js` (nodurile Code: validare, texte, rând Postgres, honeypot, token), `node tests/sala-de-bal.test.js` (regulile din browser), `node tests/browser.test.js` (formularul real în Chromium cu webhook simulat: succes, 500, DNS inexistent, respins).

## M3 — `site-cerere.json`, tipul `catering` (formularul de pe pagina Catering)

**Ce face.** Același webhook și același workflow ca la M2; nu se importă nimic nou, doar se reimportă `n8n/site-cerere.json` (regenerat) peste cel existent. Pagina `catering` trimite `tip: "catering"` cu `detalii: { tip_comanda: "eveniment" | "pomana" | "pranz-birou", livrare: "adresa" | "ridicare", adresa, ora }`, pe lângă câmpurile comune (`data_eveniment` = data livrării sau, la prânzul la birou, prima zi; `persoane` = persoane / pachete / porții pe zi). Nodul `Validează cererea` cere `tip_comanda` valid, adresa (minimum 5 caractere) când livrarea e la adresă, ora în formatul `HH:MM` dacă e completată; detaliile se normalizează (textele sunt tăiate, adresa dispare la ridicare) și așa ajung în Postgres (`cereri.detalii`, JSON). Id-ul cererii începe cu `catering-`.

**Telegram:** „Comandă nouă · Catering", cu `Comandă:` (tipul), `Data:` / `De la:` (+ ora), `Persoane:` / `Pachete:` / `Porții pe zi:`, `Livrare la: <adresa>` sau „Ridicare de la restaurant", apoi nume, telefon (link), email, mesaj și link-ul WhatsApp către client — la fel ca la sală.

**Email de confirmare (șablon per tip):** subiect „Am primit comanda ta de catering (id)"; textul diferă pentru prânz la birou (porții/zi, de când, unde; „prețul porției este cel al meniului zilei"), pomană (pachete, dată, livrare/ridicare, condoleanțe) și eveniment (persoane, dată, „te sunăm ca să stabilim meniul și prețul"). Șabloanele stau în `n8n/cod/valideaza-cerere.js`, obiectul `SABLOANE`; M4 adaugă acolo tipul `tort`.

**Meniul săptămânii (`data/catering.json`)** este deocamdată scris manual (Sorin sau Claude, commit în repo): `meniu_saptamana.zile[] = { data, preparate[] }`, `pret`, iar `actualizat` se pune la data scrierii. Site-ul arată doar zilele de azi încolo și ascunde tot dacă `actualizat` are peste 14 zile sau toate zilele au trecut; ofertele de pe pagină rămân oricum. O comandă Telegram pentru meniul săptămânii (ex. `săptămâna: luni …; marți …`) se poate adăuga în workflow-ul `meniu-zilei` dacă Sorin vrea (întrebare deschisă în STATUS.md).

**Verificare după import:** `curl` ca la M2, dar cu `tests/exemplu-cerere-catering.json` → `{"ok":true,"id":"catering-…"}`, mesaj pe Telegram cu „Comandă nouă · Catering", email cu subiectul de mai sus; același payload cu `"livrare":"adresa"` și fără `adresa` → 400 `câmpuri invalide: adresa`.

**Testare locală fără n8n:** `node tests/n8n-cerere.test.js` (cazurile de catering: prânz la birou, pomană, eveniment, erori), `node tests/catering.test.js` (regulile din browser + meniul săptămânii), `node tests/browser.test.js` (pagina reală în Chromium).

## M4 — `site-cerere.json`, tipul `tort` (formularul de pe pagina Cofetăriei, cu poza-model)

**Ce face.** Același webhook și workflow; se reimportă `n8n/site-cerere.json` regenerat (15 noduri acum). Pagina `cofetaria` trimite `tip: "tort"` cu `detalii: { tort: "<id din data/torturi.json sau personalizat>", tort_text, poza_model: { nume, tip, marime, latime, inaltime, base64 } | null }`, `data_eveniment` (data pentru care e tortul) și `persoane`. Poza este redimensionată în browser la max 1600 px și recomprimată JPEG (de obicei 100–300 KB), deci payload-ul rămâne mic; browserul refuză fișierele peste 5 MB. `Validează cererea` cere `tort` și data/persoanele, verifică base64-ul (≤ ~6 MB decodat) și scoate base64-ul din `detalii`: în Postgres și pe Telegram ajung doar metadatele pozei.

**Fluxul pozei (noduri noi):** `Anunță pe Telegram` → `Are poză?` → `Pregătește poza` (Code, `n8n/cod/pregateste-poza.js`: base64 → binar cu `this.helpers.prepareBinaryData`, nume `<id>-<nume>.jpg`, legendă cu tortul, persoanele, data, clientul) → `Trimite poza pe Telegram` (sendPhoto, imediat după mesajul comenzii) → `Salvează poza pe orca` (Read/Write File, write în `Config.director_poze`, implicit `/home/node/.n8n/poze-model`) → `Are email?` → restul ca la M2. Telegram și scrierea pe disc au `onError: continue`.

**Email de confirmare:** subiect „Am primit comanda ta de tort (id)"; textul spune tortul, data, persoanele, „după modelul din poza trimisă" când există, și că sunăm pentru greutate, decor, preț și ora ridicării.

**Catalogul (`data/torturi.json`)** se scrie manual, fără prag de vechime: `torturi[] = { id, nume, poza (assets/img/torturi/<id>.jpg), pret_de_la (null = „preț la cerere"), per: "kg" | "bucată", descriere, alergeni[], termen_minim_zile? }`, plus `termen_minim_zile` general. Site-ul umple din el și lista „Ce tort" din formular; sub termenul minim avertizează, dar nu blochează comanda.

**Instalare (la M7, cu Sorin):** în `docker-compose` al n8n se montează un volum pentru pozele-model (ex. `./poze-model:/home/node/.n8n/poze-model`) și se creează directorul cu drepturi pentru utilizatorul `node`; `Config.director_poze` se potrivește cu calea din container. Verificare: `curl` cu `tests/exemplu-cerere-tort.json` → `{"ok":true,"id":"tort-…"}`, două mesaje pe Telegram (text + poză), fișierul în directorul de poze, rând în `cereri` cu `detalii` fără base64.

**Testare locală fără n8n:** `node tests/n8n-cerere.test.js` (cazurile de tort, inclusiv nodul „Pregătește poza" cu `prepareBinaryData` simulat), `node tests/cofetaria.test.js`, `node tests/browser.test.js` (upload real în Chromium: redimensionare, >5 MB, POST cu base64, rezervă).

## M5 — `recenzii-google.json` (Google Places → `data/recenzii.json`)

**Ce face.** Luni la 06:20 cere de la Google Places API (New), Place Details, câmpurile `rating, userRatingCount, googleMapsUri, reviews` (în română) și scrie `data/recenzii.json`: nota medie, numărul de recenzii, cele mai relevante 5 recenzii (Google nu dă mai multe) cu autorul scurtat la „Prenume I.", data și textul (max 600 de caractere), plus linkul „Lasă o recenzie" construit din Place ID. Site-ul arată secțiunea pe acasă și pe gastro-pub doar dacă `actualizat` are sub 30 de zile. Dacă API-ul nu întoarce nimic util, nodul Code aruncă eroare și fișierul bun rămâne neatins; eroarea ajunge pe Telegram.

**Noduri** (6): `Săptămânal, luni 06:20` → `Config` (`place_id`, GitHub, Telegram) → `Citește recenziile` (HTTP, Header Auth) → `Transformă recenziile` (Code, `n8n/cod/recenzii.js`; acceptă și formatul vechi `result.reviews`) → `Scrie recenzii.json` (GitHub edit) → la eroare `Anunță eroarea`.

**Cum obții Place ID-ul și cheia (Sorin, ~15 minute, o singură dată):**

1. *Place ID:* **gata** — Restaurant OK: `ChIJh_Ql7G16U0cRS6gH1eRpkXQ`, Sala de bal OK: `ChIJUTLVbPp7U0cRm8XEqzEZbms` (date de Sorin, 21 oct 2026; sunt deja în `Config` și în `data/program.json`). Dacă vreodată trebuie regăsite: [Place ID Finder](https://developers.google.com/maps/documentation/places/web-service/place-id).
2. *Cheia API:* [console.cloud.google.com](https://console.cloud.google.com) → proiect nou (ex. „restaurantok") → „APIs & Services → Library" → activează **Places API (New)** → „Credentials → Create credentials → API key". La cheie: „Restrict key → API restrictions → Places API (New)". Facturarea trebuie activată (card), dar Google oferă lunar credit gratuit care acoperă de departe 4–5 apeluri pe lună.
3. În n8n: „Credentials → New → Header Auth": Name `X-Goog-Api-Key`, Value = cheia; salvează ca „Google Places API key". Importă `n8n/recenzii-google.json`, alege credențialele (Header Auth, GitHub, Telegram), completează `Config.place_id`, rulează manual o dată: apare commit-ul `data: recenzii.json <data>` și secțiunea „Recenzii pe Google" pe site.

**Testare locală fără n8n:** `node tests/n8n-recenzii-postari.test.js` (nodul Code cu răspunsuri Google false, format nou și vechi), `node tests/recenzii-postari.test.js` (regulile din site).

## M5 — `postari-facebook.json` (Facebook Graph API → `data/postari.json` + `data/poze/`)

**Ce face.** Zilnic la 07:05 citește ultimele 10 postări ale paginii (`message, full_picture, permalink_url, created_time`), păstrează 3 (configurabil), scrie `data/postari.json` și, pentru postările cu poză pe care nu le are încă, descarcă poza, o redimensionează (max 1200 px, JPEG) și o urcă în repo la `data/poze/post-<id>.jpg` (URL-urile de poze de pe Facebook expiră, de aceea nu se leagă direct). Site-ul arată „Ultimele postări de pe Facebook" pe acasă doar dacă `actualizat` are sub 14 zile.

**Noduri** (12): `Zilnic 07:05` → `Config` (`page_id`, `max_postari`, `graph_versiune`, GitHub, Telegram) → `Citește postările` (HTTP, Query Auth) → `Citește JSON curent` (GitHub get, ca să știe ce poze există) → `Transformă postările` (Code, `n8n/cod/postari.js`) → `Scrie postari.json` (GitHub edit) → `Are poze noi?` → `Desfă pozele` → `Descarcă poza` → `Redimensionează` → `Urcă poza` (GitHub create; 422 dacă există deja → se sare). Eroarea de scriere → `Anunță eroarea`.

**Cum obții Page ID-ul și token-ul (Sorin, ~20 minute; token-ul long-lived al paginii nu expiră cât timp rămâi admin al paginii):**

1. *Page ID:* pe pagina OkCalafat, „Despre → Transparența paginii" (sau în Meta Business Suite → Setări → Pagini) e „ID pagină", un număr lung.
2. *Aplicație Meta:* [developers.facebook.com](https://developers.facebook.com) → „My Apps → Create App" (tip „Business"), nume ex. „restaurantok site". Nu trebuie publicată: token-ul unui admin funcționează pentru propria pagină și în modul Development.
3. *Token:* „Tools → Graph API Explorer" → alege aplicația → „User Token" cu permisiunile `pages_show_list`, `pages_read_engagement`, `pages_read_user_content` → „Generate Access Token" (te loghezi cu contul care administrează pagina). Apoi transformă-l în long-lived: „Tools → Access Token Debugger" → lipește token-ul → „Extend Access Token". Cu token-ul extins, în Graph API Explorer cere `GET /me/accounts`: în răspuns, la pagina OkCalafat, câmpul `access_token` este **Page token-ul long-lived** (nu expiră). Acesta se pune în n8n.
4. În n8n: „Credentials → New → Query Auth": Name `access_token`, Value = Page token; salvează ca „Meta Page token". Importă `n8n/postari-facebook.json`, alege credențialele (Query Auth, GitHub, Telegram), completează `Config.page_id`, rulează manual: apar commit-urile `data: postari.json …` și `data: poză postare …`, iar secțiunea „Noutăți" apare pe site.

**Limite cunoscute:** Graph API întoarce doar postările publicate de pagină (nu și cele în care pagina e etichetată); textul se taie la 1000 de caractere în fișier și la 280 pe site, cu link spre postare. Dacă token-ul expiră (ex. parola contului schimbată), workflow-ul anunță eroarea pe Telegram, iar după 14 zile site-ul ascunde secțiunea singur.

**Testare locală fără n8n:** `node tests/n8n-recenzii-postari.test.js`, `node tests/recenzii-postari.test.js`, `node tests/browser.test.js`.

## M6 — `evenimente.json` (Google Calendar „Evenimente OK" → `data/evenimente.json`)

**Ce face.** Zilnic la 06:15 citește calendarul „Evenimente OK" pentru următoarele 90 de zile și scrie `data/evenimente.json`: titlu, început/sfârșit, loc (câmpul „Unde" din eveniment; gol → „Gastro-pub OK"), descriere (fără HTML, max 600 de caractere), iar un link `https://…` din descriere devine butonul „Detalii". Spre deosebire de calendarul sălii, aici **titlul și descrierea ajung pe site**: calendarul e pentru evenimente publice (seri cu DJ, degustări, Revelion), nu pentru rezervările clienților. Site-ul arată „Evenimente la OK" pe acasă și pe gastro-pub doar dacă `actualizat` are sub 7 zile și există evenimente viitoare (cele trecute dispar singure); în pagină se injectează și JSON-LD `schema.org/Event`, ca Google să le poată afișa în rezultate.

**Noduri** (6): `Zilnic 06:15` → `Config` (`calendar_id`, `orizont_zile`, `loc_implicit`, GitHub, Telegram) → `Citește calendarul` (Google Calendar getAll, `singleEvents`, `alwaysOutputData`) → `Transformă evenimentele` (Code, `n8n/cod/evenimente.js`) → `Scrie evenimente.json` (GitHub edit) → la eroare `Anunță eroarea`.

**Instalare (la M7, cu Sorin):** în contul Google al restaurantului se creează calendarul „Evenimente OK" (separat de „Sala de bal OK"); în n8n se refolosește credențiala „Google Calendar OK"; importă `n8n/evenimente.json`, completează `Config.calendar_id`, rulează manual: commit `data: evenimente.json <data>` și secțiunea apare pe site. Cum se scrie un eveniment: titlul = ce apare pe site; „Unde" = Gastro-pub OK / Terasa OK / Sala Vidin / Sala de bal OK; descrierea = textul de pe site (poate conține un link spre evenimentul de pe Facebook). Evenimentele marcate „Afișează-mă ca: liber" sau anulate nu apar.

**Testare locală fără n8n:** `node tests/evenimente-seo.test.js` (nodul Code cu evenimente false + verificările SEO din `dist/`), `node tests/browser.test.js`.

## M6 — SEO și tehnic (fără n8n)

Generate de `node build.js`, din `src/partials/head.html` și `data/program.json`:

- **Open Graph / Twitter** pe fiecare pagină (titlu, descriere, URL canonic, imagine = sigla), pentru previzualizări corecte pe Facebook și WhatsApp.
- **JSON-LD schema.org:** `Organization` (SC Sorlir Impex SRL) pe acasă și despre; `Restaurant` (Gastro-pub OK, A.I. Cuza 26), `Bakery` (Cofetăria OK), `EventVenue` (Sala de bal OK, Traian 2, capacitate 140), `FoodService` (catering), `WebPage` pe fiecare pagină indexabilă; `Event` pentru evenimentele viitoare (injectat de JS). Programul intră în schema (`openingHoursSpecification`) **doar după ce `data/program.json` nu mai este marcat `_exemplu`**: nu dăm Google un program inventat.
- **`sitemap.xml`** cu paginile indexabile și URL-urile curate (`/sala-de-bal`), `lastmod` = data build-ului; **`robots.txt`** permite tot și indică sitemap-ul; pagina 404 are `noindex`.
- **`_headers`** (Cloudflare Pages): `Content-Security-Policy` (scripturi doar de pe site + beacon-ul Cloudflare; `connect-src` doar `hooks.restaurantok.com`; `img-src 'self' data:` pentru previzualizarea pozei-model), `nosniff`, `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`, `Permissions-Policy`; cache 7 zile pentru `assets/`, `no-cache` pentru `data/`.
- **Cloudflare Web Analytics** (fără cookie-uri): snippetul se adaugă automat când `data/program.json` → `site.cloudflare_analytics_token` are token-ul (Cloudflare → Web Analytics → Add a site → copiezi `token` din snippet). Cât e `TODO-Sorin`, în pagină e doar un comentariu.
- **Favicon** (`assets/img/favicon.svg`) și pagina **404** există din M0.

**La go-live (M7):** după ce DNS-ul arată spre Pages, în [Google Search Console](https://search.google.com/search-console) se adaugă domeniul și se trimite `https://restaurantok.com/sitemap.xml`; în fișele Google Business ale restaurantului și sălii se pune site-ul `https://restaurantok.com` (respectiv `/sala-de-bal`). Verificarea datelor structurate: [Rich Results Test](https://search.google.com/test/rich-results) pe fiecare pagină.

## M2 — `sala-disponibilitate.json` (Google Calendar → `data/sala-disponibilitate.json`)

**Ce face.** Zilnic la 06:10 citește calendarul Google „Sala de bal OK" pentru următoarele 365 de zile și scrie `data/sala-disponibilitate.json`: `ocupat` (zile întregi sau evenimente de cel puțin `ore_ocupat` = 6 ore), `partial` (evenimente mai scurte, cu nota „ocupat 10:00–13:00"), `actualizat`. Site-ul arată calendarul doar dacă `actualizat` are sub 7 zile, deci commit-ul zilnic este necesar chiar fără schimbări. **Titlurile evenimentelor (numele clienților) nu ajung în fișier**, doar datele și orele.

**Cum se ține calendarul:** Sorin pune fiecare rezervare confirmată în calendarul „Sala de bal OK" (din telefon): eveniment de o zi întreagă = sala ocupată toată ziua; eveniment cu ore = ocupată doar atunci. Rezervările „în discuție" se pot marca „Afișează-mă ca: liber" ca să nu apară pe site. Un eveniment peste miezul nopții (Revelion) ocupă ambele zile.

**Noduri** (6): `Zilnic 06:10` → `Config` (`calendar_id`, GitHub, `orizont_zile`, `ore_ocupat`) → `Citește calendarul` (Google Calendar getAll, `singleEvents`, `alwaysOutputData`) → `Calculează disponibilitatea` (Code, `n8n/cod/disponibilitate.js`) → `Scrie sala-disponibilitate.json` (GitHub edit) → la eroare `Anunță eroarea` (Telegram). Rularea reușită nu trimite nimic.

**Instalare (la M7, cu Sorin):** creează calendarul „Sala de bal OK" în contul Google al restaurantului; în n8n creează credențiala „Google Calendar OK" (OAuth2, proiect Google Cloud cu Calendar API; redirect URL-ul dat de n8n); importă `n8n/sala-disponibilitate.json`, alege credențialele (Google, GitHub, Telegram), completează `Config.calendar_id` (Setări calendar → „ID calendar"). Verificare: adaugă un eveniment de test, rulează manual → commit `data: sala-disponibilitate.json <data>` și ziua apare roșie pe `restaurantok.com/sala-de-bal`.

**Testare locală fără n8n:** `node tests/n8n-sala.test.js` (nodul Code cu evenimente false: zi întreagă, lung, scurt, peste miezul nopții, anulat, „liber", calendar gol).

## M8 — limbi EN/BG: paginile site-ului și traducerea meniului zilei (`meniu-zilei.json`)

Site-ul are de la M8 paginile `en/` și `bg/` (acasă, gastro-pub, contact), cu `hreflang` și comutator RO · EN · BG în meniu. Componentele vii de pe ele (deschis acum, program, meniul zilei) își traduc singure etichetele; **numele preparatelor** din meniul zilei apar în engleză/bulgară doar dacă `data/meniu-zilei.json` are `traduceri.en.preparate` / `traduceri.bg.preparate` (câte un text pentru fiecare preparat, în aceeași ordine; `null` = netradus), altfel rămân în română, marcate `lang="ro"`.

**Ce face workflow-ul `meniu-zilei` (de la sesiunea 7).** Pe ramura „meniu", după `Ce facem?`, nodul `Traducem cu DeepL?` citește `Config.traducere`:

| `Config.traducere` | Ce se întâmplă | Are nevoie de |
|---|---|---|
| `glosar` (implicit) | nodul Code `Traduceri` traduce fiecare preparat cu glosarul local RO→EN/BG din `n8n/cod/glosar-meniu.js` (≈290 de chei: ciorbe, feluri principale, garnituri, salate, murături, deserturi) și cu reguli de compunere („X cu Y și Z", „X la cuptor / la grătar / pane", „X prăjit" cu acordul adjectivului în bulgară, „cu"→„с/със"). Ce nu e în glosar rămâne `null` (româna pe site); nimic nu se inventează. | nimic (fără internet, fără cheie) |
| `deepl` | `DeepL EN` și `DeepL BG` (HTTP, `POST {deepl_url}` cu `text[]`, `source_lang: RO`, `target_lang: EN-GB` / `BG`), apoi `Traduceri` ia răspunsurile DeepL și completează cu glosarul ce lipsește; la eroare DeepL (cheie greșită, limită depășită) nodurile continuă și totul cade pe glosar | credențiala „DeepL API key" (Header Auth: `Authorization` = `DeepL-Auth-Key <cheie>`); `Config.deepl_url` = `https://api-free.deepl.com/v2/translate` (Free) sau `https://api.deepl.com/v2/translate` (Pro) |
| `nu` | fără traduceri; JSON-ul se scrie fără `traduceri`, site-ul arată româna | — |

Confirmarea de pe Telegram arată sursa („🌐 EN/BG: tradus automat (glosar)") sau ce a rămas netradus; Sorin corectează cu `en 2: …` / `bg 2: …` (nodul `Îmbină` scrie corecția în JSON-ul existent, chiar dacă nu existau traduceri). Glosarul se extinde în `n8n/cod/glosar-meniu.js` (funcția `f('cheie ro|sinonim', 'en', 'bg', gen_bg)`), apoi `node n8n/genereaza.js` și `node tests/traduceri.test.js`.

**Instalare (la M7):** nimic în plus pentru `glosar`. Pentru DeepL: cont gratuit la deepl.com/pro-api (cere un card, nu taxează sub limită), cheia în credențiala „DeepL API key" (creată placeholder de `orca/install.sh`), `Config.traducere = deepl`, apoi un meniu de test; dacă în confirmare apare „(DeepL)", merge.

**Rămân (decizii ale lui Sorin):** traducerea paginilor sala-de-bal, cofetăria, catering (cu formularele). WhatsApp Business: pregătit (secțiunea de mai jos), se pornește după go-live.

## M8 — editarea conținutului prin Telegram (`meniu-zilei.json`, ramura „editare")

**Ce face.** Același bot Telegram (un bot are un singur webhook, deci comenzile intră prin `Telegram Trigger`-ul workflow-ului `meniu-zilei`) primește comenzi scurte, în română, cu sau fără diacritice, și modifică fișierele din `data/` cu commit pe GitHub → Cloudflare Pages redeploy (~1 minut). Fără Decap CMS, fără cont nou: se refolosesc credențialele „Telegram OK bot" și „GitHub PAT site". Orice text care nu e comandă rămâne, ca până acum, meniul zilei.

| Comandă | Fișier | Efect |
|---|---|---|
| `închis 25.12 Crăciun` · `închis 24.12 - 26.12 cofetărie Sărbători` · `închis 1 ianuarie` | `program.json` → `exceptii` | zi (sau interval ≤ 62 de zile) închisă; implicit ambele unități, „restaurant" / „cofetărie" o limitează la una; motivul apare pe site; anul lipsă = anul curent sau următorul |
| `deschis 31.12 9:00-15:00 Revelion` (și `10-16`, mai multe intervale cu virgulă) | `program.json` → `exceptii` | program special într-o zi; orele cu două puncte sau întregi (punctul e al datelor) |
| `șterge 25.12` | `program.json` | scoate excepțiile din ziua aceea |
| `program cofetărie: luni-sâmbătă 9-20, duminică închis` · `program restaurant: luni-vineri 8:30-23:30; sâmbătă 9-23; duminică 9:30-23:30` | `program.json` → `unitati.<u>.orar` | programul săptămânal; cere toate cele 7 zile (`zilnic`, `luni-vineri`, `sâmbătă și duminică`, `închis`); scoate `_exemplu` → dispare „orientativ" de pe site și programul intră în schema.org la următorul build |
| `săptămâna: luni ciorbă de legume, pui la cuptor; marți …` (+ `de la 3.11`, `26 lei`) | `catering.json` → `meniu_saptamana` | meniul săptămânii pentru prânzul la birou; zilele despărțite cu `;` sau pe rânduri, preparatele cu virgulă; fără `de la` = săptămâna curentă (sâmbăta/duminica: următoarea); prețul nou intră și în oferta „prânz la birou" |
| `tort diplomat: 120 lei/kg, 3 zile` · `tort prăjituri: 8 lei bucata` · `tort nuntă: la cerere` | `torturi.json` | preț „de la", unitatea (kg / bucată) și termenul unui tort, găsit după id sau după nume; scoate nota TODO a tortului |
| `torturi termen 3 zile` | `torturi.json` → `termen_minim_zile` | termenul minim general |
| `catering pomeni: 35 lei` · `catering prânz: 26 lei` · `catering evenimente: la cerere` | `catering.json` → `oferte` | prețul „de la" al ofertei |
| `arată program` / `excepții` / `săptămâna` / `torturi` / `catering` | — | răspunde cu ce e acum în fișier, fără să scrie |
| `editare` | — | lista comenzilor |

Confirmarea de pe Telegram spune exact ce s-a scris (și cum se anulează); o comandă greșită primește explicația și exemplul potrivit, fără să scrie nimic. Fiecare scriere actualizează `actualizat` și face un commit `data: <fișier> — …`. Dacă GitHub refuză scrierea, Sorin primește eroarea pe Telegram.

**Ce NU se editează de aici (deocamdată):** textele paginilor, pozele (pozele meniului zilei vin pe fluxul M1), descrierile torturilor și ale ofertelor, datele de contact — se schimbă în repo. Pozele torturilor: `assets/img/torturi/<id>.jpg` + câmpul `poza` în `torturi.json`, manual.

**Instalare (la M7):** nimic în plus față de M1 — fișierele `data/program.json`, `data/catering.json`, `data/torturi.json` trebuie să existe în repo (nodul GitHub folosește *edit*). Verificare după import: `arată program` → răspunde cu programul; `închis 25.12 test` → commit `data: program.json — închis 2026-12-25` și ziua apare la „Program" pe `contact`; `șterge 25.12` o scoate.

**Testare locală fără n8n:** `node tests/editare.test.js` (comenzile, aplicarea pe JSON-urile din `data/`, nodurile Code simulate, legăturile din workflow) și `node build.js && node tests/editare-site.test.js` (JSON-urile rezultate randate în Chromium la 400 px).

## M8 — WhatsApp Business pentru notificări (`site-cerere.json`, ramura „WhatsApp")

**Ce face.** După Telegram și email, workflow-ul `site-cerere` poate trimite fiecare cerere validată și pe WhatsApp, prin **WhatsApp Business Platform (Cloud API)** de la Meta: lui Sorin un mesaj scurt (`cerere_noua`) și, opțional, clientului o confirmare (`confirmare_cerere`, echivalentul emailului). Telegram rămâne canalul principal și nu se schimbă nimic la el; WhatsApp e un plus, **oprit implicit** (`Config.whatsapp = nu`), iar la orice eroare (token expirat, șablon neaprobat, număr fără WhatsApp) nodul `Trimite pe WhatsApp` continuă: cererea e deja pe Telegram, în email și ajunge în Postgres.

Noduri: `Trimitem pe WhatsApp?` (citește `Config.whatsapp`; sare ramura cât Phone number ID sau numărul lui Sorin sunt `<<TODO>>`) → `Pregătește WhatsApp` (Code, `n8n/cod/whatsapp.js`: un item pe destinatar cu corpul JSON al mesajului de tip *template*; parametrii fără rânduri noi, fără spații multiple, niciodată goi, max 200 de caractere) → `Avem mesaje?` → `Trimite pe WhatsApp` (HTTP `POST {whatsapp_api_url}/{whatsapp_phone_number_id}/messages`, Header Auth „Meta WhatsApp token") → `Rândul pentru Postgres`.

| `Config` | Valoare |
|---|---|
| `whatsapp` | `nu` (implicit) · `sorin` (doar Sorin) · `sorin+client` (și confirmarea către client, la numărul din formular) |
| `whatsapp_phone_number_id` | **Phone number ID** din Meta → WhatsApp → API Setup (un id numeric, nu numărul de telefon) |
| `whatsapp_sorin` | numărul lui Sorin, internațional fără `+` (ex. `407xxxxxxxx`); numerele clienților `07…` se convertesc automat în `407…` |
| `whatsapp_sablon_sorin` / `whatsapp_sablon_client` | numele șabloanelor aprobate: `cerere_noua` / `confirmare_cerere` |
| `whatsapp_limba` | codul de limbă al șabloanelor, `ro` |
| `whatsapp_api_url` | `https://graph.facebook.com/v21.0` (se schimbă doar când Meta retrage versiunea) |

**Șabloanele (obligatorii).** Un business poate scrie unui număr care nu i-a scris în ultimele 24 de ore doar cu un *message template* aprobat de Meta. Se creează în WhatsApp Manager → Message templates → Create, categoria **Utility**, limba **Romanian**, exact cu aceste texte (parametrii `{{n}}` sunt în ordinea în care îi pune `whatsapp.js`; aprobarea durează de obicei minute–ore):

- `cerere_noua` (6 parametri, către Sorin): `Pe restaurantok.com a intrat o {{1}}: {{2}}. Client: {{3}}, tel. {{4}}. {{5}}. Nr. {{6}}. Detaliile complete sunt pe Telegram și pe email.` — exemplu pentru aprobare: `cerere nouă` · `Sala de bal — Nuntă / cununie (Sala de bal OK)` · `Ion Popescu` · `0722 123 456` · `sâmbătă, 14 noiembrie 2026, 120 persoane` · `sala-20261028-k3f9`.
- `confirmare_cerere` (4 parametri, către client): `Bună, {{1}}! Am primit {{2}} (nr. {{3}}). Te sunăm la {{4}} cu un răspuns, de obicei în aceeași zi lucrătoare. Dacă e urgent, ne găsești la 0785255855. Restaurant OK Calafat.` — exemplu: `Ion` · `cererea ta de ofertă pentru Sala de bal OK, sâmbătă, 14 noiembrie 2026` · `sala-20261028-k3f9` · `0722 123 456`.

Dacă Sorin schimbă textul unui șablon, numărul și ordinea parametrilor trebuie să rămână; altfel se modifică și `n8n/cod/whatsapp.js` (+ `node n8n/genereaza.js`, `node tests/n8n-whatsapp.test.js`).

**Instalare (după go-live, ~30–60 min, împreună):**

1. Meta Business Suite al paginii OkCalafat → WhatsApp → *Get started*: un cont WhatsApp Business (WABA) și un **număr de telefon dedicat** pentru API (numărul nu poate fi în același timp în aplicația WhatsApp / WhatsApp Business de pe telefon; Meta oferă și un număr de test gratuit, bun pentru verificare). Sorin primește mesajele pe numărul lui personal (`whatsapp_sorin`), care rămâne în aplicația normală.
2. WhatsApp → API Setup: notează **Phone number ID** → `Config.whatsapp_phone_number_id`. În *Business settings → System users*: un system user cu rol Admin, *Add assets* → aplicația și WABA-ul, *Generate token* cu permisiunile `whatsapp_business_messaging` și `whatsapp_business_management`, fără expirare → credențiala „Meta WhatsApp token" (creată placeholder de `orca/install.sh`; valoarea `Bearer <token>`).
3. Cele două șabloane de mai sus, aprobate. Meta oferă un număr de conversații gratuite pe lună pentru testare; după verificarea businessului taxează pe conversație, cu tarif pe țară — pentru volumul restaurantului, nesemnificativ (tarifele exacte: business.whatsapp.com/products/platform-pricing).
4. `Config.whatsapp = sorin`, o cerere de test de pe site → Sorin primește mesajul; apoi, dacă vrea și clienții notificați, `sorin+client`. Verificare negativă: `Config.whatsapp = nu` → nicio cerere de WhatsApp în execuție, fluxul ajunge tot la `Răspunde OK`.

**De ce nu nodul WhatsApp al n8n:** nodul oficial `WhatsApp Business Cloud` cere aceeași credențială (token + Phone number ID) și are aceleași limite; HTTP Request-ul ține corpul mesajului în cod testabil (`whatsapp.js`) și nu depinde de versiunea nodului. Dacă Sorin preferă nodul, se înlocuiește doar `Trimite pe WhatsApp` (același `$json.body`).

**Testare locală fără n8n:** `node tests/n8n-whatsapp.test.js` (13 cazuri: oprit implicit, placeholder → sărit, mesajele pentru sală / catering / tort, parametrii curățați, structura ramurii, credențiala din `install.sh`).
