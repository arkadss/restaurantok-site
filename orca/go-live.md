# Go-live restaurantok.com — checklist (M7)

Se parcurge **împreună cu Sorin, la calculator**, în această ordine. Fiecare rând se bifează când e verificat, nu când e „probabil gata". Nimic de aici nu se face din sesiunile nocturne. Timp estimat: 1–2 ore pentru Cloudflare + DNS + Pages, 1–2 ore pentru n8n (credențiale), în zile diferite dacă e nevoie.

Regula de aur: **emailul `contact@restaurantok.com` trebuie să meargă identic înainte și după.** Nu se schimbă nimic la MX/SPF/DKIM/DMARC; se copiază exact.

## 0. Înainte de orice: inventarul DNS-ului actual

- [ ] Unde e înregistrat domeniul (registrar) și cine are contul: `TODO-Sorin`. Unde e găzduit DNS-ul acum (`dig +short NS restaurantok.com`).
- [ ] Unde e găzduit emailul (de la ce furnizor vin datele SMTP/IMAP): `TODO-Sorin`. Dacă emailul e pe **același** pachet de găzduire cu WordPress-ul, pachetul **nu se închide** la secțiunea 7 până nu se mută emailul.
- [ ] Salvează înregistrările actuale într-un fișier (`orca/dns-inainte.txt`, nu se comite — poate conține date ale furnizorului):
  ```sh
  for t in NS A AAAA MX TXT CNAME; do echo "== $t"; dig +short $t restaurantok.com; done
  dig +short CNAME www.restaurantok.com; dig +short TXT _dmarc.restaurantok.com
  # selectorii DKIM depind de furnizor; cei mai des întâlniți:
  for s in default google selector1 selector2 mail dkim k1; do echo "== $s"; dig +short TXT $s._domainkey.restaurantok.com; done
  ```
- [ ] Exportă zona completă din panoul furnizorului de DNS actual (zone file / „Export"), ca sursă de adevăr pentru înregistrările pe care `dig` nu le ghicește (DKIM, autoconfig, etc.).

## 1. Cloudflare: cont și zonă

- [ ] Cont Cloudflare (gratuit) pe adresa restaurantului; 2FA activat.
- [ ] „Add a site" → `restaurantok.com` → planul Free. Cloudflare scanează DNS-ul; **compară cu exportul de la pasul 0** și adaugă ce lipsește (toate MX, TXT SPF, DKIM, DMARC, eventualele CNAME de `mail`/`autoconfig`/`autodiscover`). Înregistrările de email rămân cu norul **gri (DNS only)**, nu proxied.
- [ ] Înregistrările vechi `A`/`AAAA` pentru `@` și `www` (serverul WordPress) rămân deocamdată — se schimbă la pasul 3.
- [ ] Setări SSL/TLS: „Full (strict)"; „Always Use HTTPS" pornit; HSTS **nu** se activează din Cloudflare (este deja în `_headers`).
- [ ] Deocamdată **nu** se schimbă nameserverele la registrar; mai întâi Pages (pasul 2).

## 2. Cloudflare Pages: proiectul site-ului

- [ ] Workers & Pages → Create → Pages → „Connect to Git" → GitHub `arkadss/restaurantok-site` (repo privat; Cloudflare primește acces doar la el).
- [ ] Build: framework „None"; **Build command** `node build.js`; **Build output directory** `dist`; Node: variabila `NODE_VERSION` = `22`. Branch de producție: `main`.
- [ ] Prima construire reușește → adresa `https://<proiect>.pages.dev`. Verifică pe telefon: acasă, gastro-pub, sala-de-bal (calendarul și formularul), catering, cofetăria, contact, 404 (`/ceva-inexistent`), și că redirecturile vechi merg (`/meniu/` → `/gastro-pub`).
- [ ] Verifică antetele: `curl -sI https://<proiect>.pages.dev/ | grep -i -E 'content-security|strict-transport|x-frame'`.
- [ ] Custom domains → `restaurantok.com` și `www.restaurantok.com`. Cloudflare creează/actualizează singur înregistrările CNAME către `<proiect>.pages.dev` (la apex folosește CNAME flattening). Acceptă.
- [ ] Rules → Redirect Rules: `www.restaurantok.com/*` → `https://restaurantok.com/${1}` (301), ca să existe un singur URL canonic (cel din `sitemap.xml` și din schema.org).

## 3. Mutarea DNS-ului (momentul go-live)

- [ ] În zona Cloudflare, `@` și `www` arată acum spre Pages (de la pasul 2), MX/TXT sunt identice cu pasul 0.
- [ ] La registrar: schimbă nameserverele pe cele două date de Cloudflare. Propagarea: minute → până la 24–48 h; site-ul vechi și cel nou pot coexista în acest timp, fără probleme.
- [ ] După propagare (`dig +short NS restaurantok.com` arată Cloudflare), **verifică emailul**: `dig +short MX restaurantok.com` identic cu `dns-inainte.txt`; trimite un email de test către și de la `contact@restaurantok.com`; verifică la [mxtoolbox.com](https://mxtoolbox.com/SuperTool.aspx) SPF/DKIM/DMARC.
- [ ] `https://restaurantok.com` deschide site-ul nou, cu lacăt; `http://` redirecționează pe `https://`; `www` redirecționează pe apex.

## 4. Formularele: tunel, n8n, token

- [ ] Instalarea n8n pe orca după `orca/README.md` (credențiale, `install.sh`, `Config`, tabelul `cereri`), tunelul `cloudflared` pornit, `hooks.restaurantok.com` în DNS (creat de `cloudflared tunnel route dns`).
- [ ] Token-ul webhook generat (`openssl rand -hex 24`), pus în `Config.site_token` și în `src/partials/head.html`, commit + push → Pages reconstruiește.
- [ ] WAF: regula de rate limit pe `hooks.restaurantok.com/webhook/*` (10/min/IP).
- [ ] Test de capăt la capăt, de pe telefon, de pe site-ul real: o cerere pentru sală → confirmarea cu id în pagină, mesaj pe Telegram, email de confirmare la adresa de test, rând în `cereri`. Apoi câte una pentru catering și tort (cu poză). Payload greșit (telefon `123`) → formularul refuză local.
- [ ] Testul negativ: oprește tunelul 1 minut → formularul arată mesajul de rezervă cu butonul WhatsApp (nicio eroare „roșie").

## 5. Conținutul viu: workflow-urile n8n, unul câte unul

Fiecare se rulează manual o dată (Test workflow), se verifică commit-ul în repo și apariția pe site (~1 minut după commit), apoi se activează.

- [ ] `meniu-zilei`: `?` → ajutor; un meniu de test cu „mâine" → apare marcat „Mâine"; poză; `gata`.
- [ ] `sala-disponibilitate`: un eveniment de test în calendarul „Sala de bal OK" → ziua apare ocupată; șterge testul.
- [ ] `evenimente`: un eveniment în „Evenimente OK" → secțiunea „Evenimente la OK" pe acasă.
- [ ] `recenzii-google`: rulare manuală → secțiunea „Recenzii pe Google" cu nota reală.
- [ ] `postari-facebook`: rulare manuală → „Ultimele postări de pe Facebook" cu pozele în `data/poze/`.
- [ ] Cheia `N8N_API_KEY` se poate șterge după import (Settings → n8n API).

## 6. După lansare: Google, statistici, fișe

- [ ] Cloudflare → Web Analytics → Add a site → `restaurantok.com` → copiezi `token` din snippet în `data/program.json` → `site.cloudflare_analytics_token`; commit. Statistici fără cookie-uri, nimic de adăugat în politica de confidențialitate.
- [ ] [Google Search Console](https://search.google.com/search-console): proprietate de tip „Domeniu" (`restaurantok.com`, verificare prin TXT în Cloudflare) → Sitemaps → `https://restaurantok.com/sitemap.xml`. Inspectează acasă și `/sala-de-bal`, cere indexarea.
- [ ] [Rich Results Test](https://search.google.com/test/rich-results) pe `/`, `/gastro-pub`, `/sala-de-bal`: fără erori la `Restaurant`, `EventVenue`, `Organization`.
- [ ] Fișele Google Business: restaurantul → site `https://restaurantok.com`; Sala de bal OK → `https://restaurantok.com/sala-de-bal`. Verifică programul din fișă = cel din `program.json`.
- [ ] Pagina de Facebook OkCalafat: câmpul „Site web" → `https://restaurantok.com`; butonul paginii poate deveni „Trimite mesaj pe WhatsApp" sau „Sună".
- [ ] [PageSpeed Insights](https://pagespeed.web.dev/) pe mobil pentru acasă și sala-de-bal; țintă: toate verde (site static, fonturi self-hosted).

## 7. Oprirea WordPress-ului vechi

Situația (verificat pe 22 oct 2026, prin API-ul WP public): site-ul vechi are **13 imagini**, toate fotografii stock ale temei (`food-03.jpg`, `restaurant-hero-04.jpg`, `travel-portrait-01.jpg`…), fără legătură cu restaurantul. Singurul lucru de păstrat era sigla (`Logo-OK-Black-Wide.png`), preluată deja la M0 (`src/assets/img/logo-ok*.png`). **Nu există alte imagini utile de exportat.** Textele vechi (lorem ipsum, anunțul de lockdown) nu se păstrează.

- [ ] Imediat după go-live: WordPress-ul nu mai e vizibil prin domeniu (DNS-ul arată spre Pages), dar încă rulează la vechiul furnizor. În panoul de găzduire: dezactivează WooCommerce și pune site-ul în „maintenance", ca să nu mai trimită emailuri sau notificări. Schimbă parola de admin dacă e cea din 2020.
- [ ] Arhivă (opțional, 10 minute, pentru orice eventualitate): WP Admin → Tools → Export → „All content" (XML) + un backup al bazei din panoul de găzduire; se păstrează la Sorin, nu în repo.
- [ ] **După 30 de zile** fără probleme la site și email: dacă pachetul de găzduire servea doar WordPress-ul → se anulează; dacă servea și emailul → **rămâne**, se anulează doar partea de web (sau se mută emailul întâi — proiect separat, nu face parte din M7).
- [ ] Linkurile vechi din Google (`/meniu/`, `/despre-noi/`, `/livrari-la-domiciliu/`…) sunt acoperite de `src/_redirects`; după 2–3 luni, Search Console nu ar mai trebui să arate 404 de la URL-uri vechi.

## Întoarcere (dacă ceva merge prost la pasul 3)

Schimbarea nameserverelor înapoi la vechiul furnizor restaurează WordPress-ul în câteva minute–ore; nimic de pe serverul vechi nu a fost șters la pașii 1–5. Emailul nu depinde de nimic din cele de mai sus cât timp MX/TXT sunt copiate corect — de aceea pasul 0 este obligatoriu.
