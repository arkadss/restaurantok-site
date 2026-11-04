# Plan: site nou restaurantok.com

Versiunea 1 — 18 octombrie 2026. Acest fișier este sursa de adevăr pentru sesiunile de lucru nocturne. Se modifică doar cu acordul lui Sorin.

## Context

- Firma: SC Sorlir Impex SRL, Calafat (jud. Dolj). Branduri sub umbrela „OK": **Gastro-pub OK** (restaurantul, str. A.I. Cuza nr. 26, în centru; tel. 0785255855; contact@restaurantok.com; facebook.com/OkCalafat), **Cofetăria OK**, **Sala de bal OK**. Cel mai vechi restaurant din Calafat, înființat în 1993 de Constantin Chirițescu, pornit dintr-un bar la subsolul clădirii.
- Spațiile (corectat de Sorin, 21 oct 2026). La A.I. Cuza nr. 26: **Terasa OK** = spațiul principal al Gastro-pub-ului (în aer liber, acoperiș retractabil, adăpost de ploaie, soare și vânt; în fața localului e un totem „Gastro-pub OK"); **Sala Vidin** = vechiul restaurant de iarnă, azi sală de închiriat și pentru evenimente mici, până la 35 de persoane; **terasa mică din față**, 16–20 de locuri, însorită dimineața, primăvara–toamna. **Sala de bal OK** este la altă adresă: **Str. Traian nr. 2, în curtea Liceului „Ștefan Milcu"** (capacitatea exactă: TODO-Sorin; pe site „până la 140"). Sorin vrea analizată și oportunitatea unui rebranding al sălii de bal.
- Catering: evenimente, pomeni/parastase, prânz la birou pentru firme și instituții. Contractul de catering spitalicesc din Craiova nu apare pe site.
- Renia Bascov (terasa de pe plaja Bascov, pe Dunăre: plajă cu șezlonguri, ponton, pizza la cuptor cu lemne, muzică live vara; vedere spre podul Calafat–Vidin) este brand separat; pe site apare ca secțiune separată pe acasă, cu 4 poze reale (21 oct 2026) și link când îl dă Sorin (sezon, program, link: TODO-Sorin).
- Site-ul actual: WordPress + WooCommerce 4.0.4 din 2020, abandonat (anunț de lockdown, lorem ipsum, meniu gol). Se înlocuiește complet, nu se repară.
- Orchestrator: serverul **orca** (Debian 13, Docker, n8n + Postgres 16, acces doar prin Tailscale). Site-ul nu poate ajunge direct la orca; orca poate ieși spre internet (outbound).
- Meniul zilei: 24 lei. Flux planificat în n8n: textul meniului vine seara, pozele în jurul orei 11:00.

## Obiective, în ordinea valorii

1. Cereri de ofertă pentru Sala de bal (formular + calendar de disponibilitate).
2. Cereri de catering, pomeni, prânz la birou.
3. Comenzi de torturi la Cofetăria OK.
4. Trafic de tranzit (podul Calafat–Vidin, EuroVelo 6): fișă credibilă, meniul zilei, variantă EN/BG.
5. Site „viu" fără efort manual: meniul zilei, deschis acum, recenzii, postări, evenimente.

## Principii

- Static. Fără CMS, fără bază de date, fără plugin-uri. Nimic de actualizat la nivel de platformă.
- Conținutul viu = fișiere JSON scrise de n8n. Site-ul citește `data/*.json` la încărcare.
- Fiecare componentă vie are fallback obligatoriu: dacă datele sunt mai vechi decât pragul, componenta se ascunde sau afișează mesajul de rezervă. Niciodată date vechi prezentate ca actuale, niciodată erori vizibile pentru vizitator.
- Fără lorem ipsum. Fără poze generate de AI. Unde lipsesc pozele reale se pune un placeholder neutru marcat `TODO-poza`.
- Diacritice corecte (ș, ț, ă, â, î). Română ca limbă principală.
- Fără cookie-uri și fără tracking terț. Pixelul Facebook de pe site-ul vechi NU se reia. Statistici: Cloudflare Web Analytics (fără cookie).
- Mobile-first: vizitatorii vin de pe telefon, din Google și Facebook.
- Toate URL-urile sunt relative (fără `/` la început), ca preview-ul să meargă și dintr-un subdirector.
- Date de business (prețuri, program, capacități) se iau din PLAN/STATUS/data sau se marchează `TODO-Sorin`. Nu se inventează.

## Arhitectură

### Structura repo-ului (`restaurantok-site`)

```
src/pages/*.html        pagini (conținut + marcaje de partial)
src/partials/*.html     head, header, footer
src/assets/             css, js, imagini
data/*.json             contractele de date (scrise de n8n sau manual)
n8n/*.json              workflow-uri n8n exportate, importabile
n8n/README.md           instalare pe orca: credențiale, pași, verificări
orca/                   docker-compose pentru cloudflared, install.sh
build.js                Node fără dependențe: partial-uri → dist/, copiază assets + data
dist/                   ce se publică
PLAN.md  STATUS.md
```

### Hosting și livrare

- Cloudflare Pages (gratuit): build `node build.js`, output `dist`. Clean URLs: `sala-de-bal.html` → `/sala-de-bal`.
- DNS la Cloudflare. Înregistrările MX/SPF/DKIM pentru contact@restaurantok.com se păstrează identic (verificare `dig MX restaurantok.com` înainte și după mutare).
- Până la conectarea unui repo GitHub, artefactul Claude **„Site Restaurant OK"** ține toate fișierele: pagina artefactului este `progres.html`, iar sub `site/` stă conținutul din `dist/`, plus `PLAN.md`, `STATUS.md`, `data/`, `n8n/`. Sesiunile nocturne citesc de acolo și republică la aceeași adresă. Când apare repo-ul, aceleași fișiere se împing și acolo.

### Fluxuri de date

- **n8n → site:** nodul GitHub din n8n (PAT cu drept de scriere pe repo) face commit în `data/` → Cloudflare Pages redeploy automat (~1 minut). Doar trafic outbound din orca.
- **Formulare → orca:** site-ul face POST la `https://hooks.restaurantok.com/webhook/site-cerere` → tunel `cloudflared` (container pe orca, doar outbound) → webhook n8n. Protecție: rate limit în Cloudflare WAF, token secret în header, câmp honeypot. Alternativă fără tunel: Cloudflare Pages Function care trimite direct la Telegram Bot API.
- **n8n → Sorin:** Telegram (botul existent) pentru fiecare cerere. WhatsApp Business API ulterior.

## Contractele de date

Toate fișierele au câmpul `actualizat` (ISO 8601 cu offset, ex. `2026-10-19T11:04:00+03:00`). Exemplele din `data/` sunt date de test și poartă `"_exemplu": true`; se înlocuiesc cu date reale la instalare.

| Fișier | Scris de | Prag de vechime | Fallback |
|---|---|---|---|
| `program.json` | manual (Sorin/Claude) | — | — |
| `meniu-zilei.json` | n8n (M1) | `data` ≠ azi sau `valabil_pana` trecut | „Meniul zilei: sună sau scrie pe WhatsApp" |
| `sala-disponibilitate.json` | n8n (M2), Google Calendar | 7 zile | calendarul nu se afișează, rămâne formularul |
| `catering.json` | manual + n8n (M3) | 14 zile | se ascunde meniul săptămânii, rămân ofertele |
| `torturi.json` | manual (M4) | — | — |
| `recenzii.json` | n8n (M5), Google Places API | 30 zile | secțiunea se ascunde |
| `postari.json` | n8n (M5), Facebook Graph API | 14 zile | secțiunea se ascunde |
| `evenimente.json` | n8n (M6), Google Calendar | 7 zile | secțiunea se ascunde |

Payload-ul formularelor (POST JSON la webhook): `{ "tip": "sala" | "catering" | "tort" | "rezervare", "nume", "telefon", "email", "data_eveniment", "persoane", "mesaj", "detalii": {...specifice tipului}, "consimtamant": true, "website": "" }` — `website` este honeypot și trebuie să rămână gol. Răspuns așteptat: `{ "ok": true, "id": "..." }`.

## Module, în ordinea de execuție (un modul pe noapte)

### M0 — Schelet, identitate vizuală, pagini statice
Livrabile: `build.js`; partial-uri; paginile `index` (acasă), `gastro-pub`, `cofetaria`, `sala-de-bal`, `catering`, `despre`, `contact`, `alergeni`, `politica-de-confidentialitate`, `404`; CSS cu tokens de brand (logo OK negru pe fond deschis; se încearcă preluarea logo-ului vechi de la `http://restaurantok.com/wp-content/uploads/2020/03/Logo-OK-Black-Wide.png`, altfel wordmark tipografic „OK"); componenta `deschis-acum` din `program.json` (deschis / se închide în X min / închis, deschide la ...); butoane telefon și WhatsApp; harta ca link către Google Maps (nu iframe); pagina „Despre" cu povestea din 1993; `_redirects` pentru URL-urile vechi: `/meniu/`→`/gastro-pub`, `/despre-noi/`→`/despre`, `/contact/`→`/contact`, `/livrari-la-domiciliu/`→`/gastro-pub`, `/informatii-alergeni/`→`/alergeni`, `/politica-de-confidentialitate/`→`/politica-de-confidentialitate`, `/acasa/`, `/blog/`, `/personal/`, `/cos/`, `/contul-meu/`, `/finalizare/`, `/categorie-produs/*`, `/termeni-si-conditii/` → `/`. Pagina de progres se mută în `progres.html` și devine pagina artefactului.
Acceptare: toate paginile se deschid pe telefon fără scroll orizontal; zero lorem ipsum; `deschis-acum` corect pe trei cazuri de test (deschis, închis, excepție din `exceptii`).

### M1 — Meniul zilei
Site: componentă pe acasă și pe `gastro-pub`: data, preparate cu alergeni, preț, poze, ora actualizării; buton WhatsApp cu text precompletat („Bună! Vreau N × meniul zilei de azi, [data]"); fallback când datele sunt vechi.
n8n: workflow `meniu-zilei`: trigger (Telegram/mail/WhatsApp, aliniat cu fluxul de postare pe Facebook) → parsare text → opțional traducere EN/BG → scrie `data/meniu-zilei.json` + poze redimensionate (max 1200 px, ≤200 KB) → commit GitHub. La ora 16:00 un al doilea trigger marchează `valabil_pana` ca trecut. Exportat ca `n8n/meniu-zilei.json`, cu secțiunea lui în `n8n/README.md`.
Acceptare: pagina randează corect din JSON-ul de exemplu; JSON vechi → fallback; workflow-ul trece validarea de import n8n.

### M2 — Sala de bal
Site: pagina cu sălile (14–140 persoane), galerie (placeholder până vin pozele reale), tipuri de evenimente, ce este inclus, formular de cerere de ofertă (tip eveniment, dată, număr persoane, nume, telefon, email, mesaj, consimțământ GDPR, honeypot) → POST la webhook; calendar de disponibilitate (luna curentă + 11) din `sala-disponibilitate.json`; confirmare afișată în pagină.
n8n: `site-cerere` (webhook: validare, verificare honeypot și token, Telegram către Sorin, email de confirmare către client prin SMTP, log în Postgres tabelul `cereri`); `sala-disponibilitate` (zilnic: Google Calendar → JSON → commit).
Acceptare: formularul validează și afișează confirmarea; webhook-ul răspunde 200 la payload-ul de exemplu (test local cu n8n în Docker dacă e posibil, altfel validare de schemă).

### M3 — Catering, pomeni, prânz la birou
Site: pagina cu cele trei oferte, meniul săptămânii din `catering.json`, formular (tip: eveniment / pomană / prânz firmă; dată; persoane; livrare la adresă; telefon), același webhook cu `tip: "catering"`.
n8n: extinderea `site-cerere`; șablon de email per tip.

### M4 — Cofetăria
Site: catalog de torturi din `torturi.json` (poză, preț de la, per kg sau bucată, termen de comandă), formular de comandă (dată, persoane, model — upload poză ≤5 MB, telefon, mesaj) → webhook cu `tip: "tort"`; buton WhatsApp ca alternativă.
n8n: tipul `tort` în `site-cerere`, salvarea pozei-model.

### M5 — Recenzii Google și postări Facebook
Site: secțiune recenzii (nota medie, număr, cele 5 recente, link „Lasă o recenzie"); secțiune „Noutăți" cu ultimele postări de pe Facebook (text + poză + link); ambele cu auto-ascundere.
n8n: `recenzii-google` (săptămânal: Places API Place Details → JSON → commit); `postari-facebook` (zilnic: Graph API `/{page-id}/posts?fields=message,full_picture,permalink_url,created_time` → JSON → commit). README: cum se obțin Place ID, cheia API și un Page token long-lived.

### M6 — Evenimente și SEO/tehnic
Site: evenimente viitoare din `evenimente.json` pe acasă și `gastro-pub`; schema.org (Restaurant, LocalBusiness/EventVenue, Event), meta Open Graph, `sitemap.xml`, `robots.txt`, `_headers` (securitate), favicon, snippet Cloudflare Web Analytics (token de completat), pagina 404.
n8n: `evenimente` (zilnic: calendarul Google „Evenimente OK" → JSON → commit).

### M7 — Pregătire go-live și instalare pe orca
Livrabile: `n8n/README.md` complet; `orca/docker-compose.cloudflared.yml`; `orca/install.sh` (import workflow-uri prin n8n REST API cu `N8N_API_KEY`, creare credențiale placeholder); checklist DNS (A/CNAME către Pages, MX/SPF/DKIM neschimbate); export imagini utile de pe WP-ul vechi; plan de oprire a WP-ului.
Instalarea efectivă pe orca se face într-o sesiune interactivă cu Sorin (are nevoie de credențiale), nu noaptea.

### M8 — După go-live
EN/BG pentru meniul zilei și paginile principale; editare conținut prin Telegram sau Decap CMS; WhatsApp Business API pentru notificări.

## Reguli pentru sesiunile nocturne

1. Citește `STATUS.md`. Dacă în primele rânduri apare `PAUZĂ`, oprește-te fără să faci nimic.
2. Ia primul modul cu starea `todo`, în ordinea de mai sus. Nu sări peste dependențe.
3. Construiește, testează (build-ul rulează, HTML valid, JSON valid, fiecare componentă vie verificată cu date bune, date vechi și date lipsă), republică artefactul (pagina = `progres.html`; fișierele site-ului sub `site/`), iar dacă există un repo GitHub conectat, împinge și acolo.
4. Actualizează `STATUS.md`: starea, data, ce s-a făcut, ce lipsește de la Sorin (credențiale, poze, texte), întrebări deschise. Cel mult 10 rânduri pe modul.
5. Trimite-i lui Sorin un mesaj scurt în română: ce s-a făcut, link de preview, ce ai nevoie de la el. Fără narațiune.
6. Un singur modul pe noapte. Dacă nu se termină, marchează `în lucru` cu ce rămâne și continuă noaptea următoare.
7. Nu atinge DNS, hosting, conturi, credențiale. Nu inventa date de business.
8. Oprește-te după cel mult ~90 de minute de lucru efectiv.

## De la Sorin (urmărit în STATUS.md)

- Cont GitHub și conectarea lui în claude.ai (Settings → Connectors) — necesar pentru fluxul real n8n → site.
- Cont Cloudflare și unde este DNS-ul domeniului acum (registrar) — necesar la M7.
- Programul exact, pe zile, pentru restaurant și cofetărie.
- Poze reale: sală, terasă, interior, preparate, torturi.
- Prețuri sau pachete orientative pentru sală și catering.
- API: Google Places (Place ID + cheie), Meta (Page token), Google Calendar (OAuth în n8n), SMTP pentru emailurile de confirmare.
- Chat ID Telegram (botul existent) pentru notificări.
