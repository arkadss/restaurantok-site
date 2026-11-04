// Teste în browser (Chromium prin Playwright):
//   node tests/browser.test.js
// - fiecare pagină din dist/ la 400 px: fără scroll orizontal, fără erori în consolă
// - componenta deschis-acum: date bune (vizibilă), date vechi/invalide și date lipsă (ascunsă, fără erori)
// - componenta meniul zilei (M1): date de azi / de mâine / expirate / vechi / lipsă / invalide, poze care nu se încarcă,
//   butonul WhatsApp precompletat, previzualizarea ?exemplu=1
// - sala de bal (M2): calendarul (date bune / vechi / lipsă / invalide) și formularul (erori, POST, webhook căzut)
// - catering (M3): meniul săptămânii (date bune / încheiat / vechi / lipsă / invalide) și formularul de comandă (tip, livrare, POST, webhook căzut)
// - cofetăria (M4): catalogul (bun / lipsă / invalid), formularul de tort cu poză-model (redimensionare, >5 MB respinsă, POST cu base64, webhook căzut)
// - recenzii Google + postări Facebook (M5): proaspete (vizibile) / vechi / lipsă / invalide (ascunse, fără erori), previzualizare ?exemplu=1
// - evenimente (M6): viitoare (vizibile, cu JSON-LD Event injectat) / toate trecute / vechi / lipsă / invalide (ascunse, fără erori)
// - capturi de ecran în tests/capturi/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, '..', 'dist');
const CAPTURI = path.join(__dirname, 'capturi');
fs.mkdirSync(CAPTURI, { recursive: true });

// server static minimal, cu „moduri" pentru data/program.json: ok | lipsa | invalid | gol
// și pentru data/meniu-zilei.json: ok (exemplu, vechi) | azi | maine | incheiat | lipsa | invalid | fara-poze | real
// și pentru data/sala-disponibilitate.json: ok (exemplu) | proaspat | vechi | lipsa | invalid; webhook-ul simulat: ok | cade | respins
let mod = 'ok';
let modMeniu = 'ok';
let modSala = 'ok';
let modWebhook = 'ok';
let modCatering = 'ok'; // ok (exemplu) | proaspat | incheiat | vechi | lipsa | invalid
let modTorturi = 'ok';  // ok (exemplu) | lipsa | invalid | real (cu poze care există și prețuri)
let modSocial = 'ok';   // recenzii.json + postari.json: ok (exemplu) | proaspat | vechi | lipsa | invalid
let modEvenimente = 'ok'; // ok (exemplu) | proaspat | trecute | vechi | lipsa | invalid
const exemplEvenimente = JSON.parse(fs.readFileSync(path.join(DIST, 'data', 'evenimente.json'), 'utf8'));
const exemplRecenzii = JSON.parse(fs.readFileSync(path.join(DIST, 'data', 'recenzii.json'), 'utf8'));
const exemplPostari = JSON.parse(fs.readFileSync(path.join(DIST, 'data', 'postari.json'), 'utf8'));
let webhookPrimit = null;
const exemplCatering = JSON.parse(fs.readFileSync(path.join(DIST, 'data', 'catering.json'), 'utf8'));
const exemplu = JSON.parse(fs.readFileSync(path.join(DIST, 'data', 'meniu-zilei.json'), 'utf8'));
const exemplSala = JSON.parse(fs.readFileSync(path.join(DIST, 'data', 'sala-disponibilitate.json'), 'utf8'));
function ziRo(decalaj) { // data de azi (+decalaj zile) la București, 'YYYY-MM-DD'
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + (decalaj || 0)));
  return d.toISOString().slice(0, 10);
}
function meniuPentru(m) {
  const j = JSON.parse(JSON.stringify(exemplu));
  const peste = new Date(Date.now() + 3600e3).toISOString(), trecut = new Date(Date.now() - 60e3).toISOString();
  if (m === 'azi') { j.data = ziRo(0); j.valabil_pana = peste; j.actualizat = new Date().toISOString(); }
  if (m === 'maine') { j.data = ziRo(1); j.valabil_pana = new Date(Date.now() + 36 * 3600e3).toISOString(); }
  if (m === 'incheiat') { j.data = ziRo(0); j.valabil_pana = trecut; }
  if (m === 'fara-poze') { j.data = ziRo(0); j.valabil_pana = peste; j.poze = []; delete j.traduceri; }
  if (m === 'real') { j.data = ziRo(0); j.valabil_pana = peste; delete j._exemplu; j.poze = ['assets/img/TODO-poza.svg', 'assets/img/TODO-poza.svg']; }
  return JSON.stringify(j);
}
const tipuri = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/data/program.json') {
    if (mod === 'lipsa') { res.writeHead(404); return res.end('nu'); }
    if (mod === 'invalid') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{ asta nu e json'); }
    if (mod === 'gol') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"actualizat":"2020-01-01T00:00:00+02:00"}'); }
  }
  if (p === '/data/meniu-zilei.json') {
    if (modMeniu === 'lipsa') { res.writeHead(404); return res.end('nu'); }
    if (modMeniu === 'invalid') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{ "preparate": [ stricat'); }
    if (modMeniu !== 'ok') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(meniuPentru(modMeniu)); }
  }
  if (p === '/data/sala-disponibilitate.json') {
    if (modSala === 'lipsa') { res.writeHead(404); return res.end('nu'); }
    if (modSala === 'invalid') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{ "ocupat": [ stricat'); }
    if (modSala === 'vechi') { const j = JSON.parse(JSON.stringify(exemplSala)); j.actualizat = '2026-01-01T06:00:00+02:00'; delete j._exemplu; res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(j)); }
    if (modSala === 'proaspat') { const j = JSON.parse(JSON.stringify(exemplSala)); j.actualizat = new Date().toISOString(); delete j._exemplu; j.ocupat = [ziRo(3)]; j.partial = [{ data: ziRo(4), nota: 'ocupat seara' }]; res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(j)); }
  }
  if (p === '/data/evenimente.json') {
    if (modEvenimente === 'lipsa') { res.writeHead(404); return res.end('nu'); }
    if (modEvenimente === 'invalid') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{ "evenimente": [ stricat'); }
    if (modEvenimente !== 'ok') {
      const j = JSON.parse(JSON.stringify(exemplEvenimente)); delete j._exemplu;
      j.actualizat = modEvenimente === 'vechi' ? '2026-01-05T06:00:00+02:00' : new Date().toISOString();
      const d = (z, h) => new Date(Date.now() + z * 864e5 + (h || 0) * 3600e3).toISOString();
      if (modEvenimente === 'proaspat') j.evenimente = [{ id: 'p1', titlu: 'Seară cu DJ', inceput: d(2), sfarsit: d(2, 4), loc: 'Gastro-pub OK', descriere: 'Intrare liberă.' }, { id: 'p2', titlu: 'Degustare', inceput: d(9), sfarsit: d(9, 3), loc: 'Sala de bal OK', url: 'https://www.facebook.com/OkCalafat', poza: 'assets/img/logo-ok.png' }, { id: 'p0', titlu: 'Trecut', inceput: d(-3), sfarsit: d(-3, 2) }];
      if (modEvenimente === 'trecute') j.evenimente = [{ id: 'p0', titlu: 'Trecut', inceput: d(-3), sfarsit: d(-3, 2) }];
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(j));
    }
  }
  if (p === '/data/recenzii.json' || p === '/data/postari.json') {
    if (modSocial === 'lipsa') { res.writeHead(404); return res.end('nu'); }
    if (modSocial === 'invalid') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{ "recenzii": [ stricat'); }
    if (modSocial !== 'ok') {
      const j = JSON.parse(JSON.stringify(p === '/data/recenzii.json' ? exemplRecenzii : exemplPostari)); delete j._exemplu;
      j.actualizat = modSocial === 'vechi' ? '2026-01-05T06:00:00+02:00' : new Date().toISOString();
      if (modSocial === 'proaspat' && p === '/data/recenzii.json') j.url_recenzie_noua = 'https://search.google.com/local/writereview?placeid=ChIJtest';
      if (modSocial === 'proaspat' && p === '/data/postari.json') { j.postari[0].poza = 'assets/img/logo-ok.png'; j.postari[1].poza = 'data/poze/nu-exista.jpg'; }
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(j));
    }
  }
  if (p === '/data/torturi.json') {
    if (modTorturi === 'lipsa') { res.writeHead(404); return res.end('nu'); }
    if (modTorturi === 'invalid') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{ "torturi": [ stricat'); }
    if (modTorturi === 'real') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ termen_minim_zile: 3, torturi: [{ id: 'diplomat', nume: 'Tort Diplomat', poza: 'assets/img/logo-ok.png', pret_de_la: 95, per: 'kg', alergeni: ['ou'] }, { id: 'x', nume: 'Tort X', poza: 'assets/img/nu-exista.jpg', pret_de_la: 120, per: 'kg' }] })); }
  }
  if (p === '/data/catering.json') {
    if (modCatering === 'lipsa') { res.writeHead(404); return res.end('nu'); }
    if (modCatering === 'invalid') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{ "meniu_saptamana": { stricat'); }
    if (modCatering !== 'ok') {
      const j = JSON.parse(JSON.stringify(exemplCatering)); delete j._exemplu;
      if (modCatering === 'proaspat') { j.actualizat = new Date().toISOString(); j.meniu_saptamana.zile = [0, 1, 2, 3, 4].map(i => ({ data: ziRo(i), preparate: ['Ciorbă ' + (i + 1), 'Fel ' + (i + 1), 'Garnitură'] })); }
      if (modCatering === 'incheiat') { j.actualizat = new Date().toISOString(); j.meniu_saptamana.zile = [-3, -2, -1].map(i => ({ data: ziRo(i), preparate: ['Ciorbă', 'Fel'] })); }
      if (modCatering === 'vechi') { j.actualizat = '2026-01-05T08:00:00+02:00'; j.meniu_saptamana.zile = [0, 1].map(i => ({ data: ziRo(i), preparate: ['Ciorbă', 'Fel'] })); }
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(j));
    }
  }
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': tipuri[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  let erori = 0;
  const pagini = fs.readdirSync(DIST).filter(f => f.endsWith('.html'))
    .concat(['en', 'bg'].flatMap(l => fs.existsSync(path.join(DIST, l)) ? fs.readdirSync(path.join(DIST, l)).filter(f => f.endsWith('.html')).map(f => l + '/' + f) : [])); // M8: paginile traduse

  async function deschide(url, viewport) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'ro-RO', timezoneId: 'Europe/Bucharest' });
    const page = await ctx.newPage();
    const console_erori = [];
    page.on('console', m => { if (m.type() === 'error') console_erori.push(m.text()); });
    page.on('pageerror', e => console_erori.push('pageerror: ' + e.message));
    page.on('requestfailed', r => console_erori.push('request failed: ' + r.url()));
    // webhook-ul formularelor (hooks.restaurantok.com) este simulat: ok | cade (500) | respins ({ok:false}) | (modWebhook 'absent' → DNS/eroare de rețea)
    await page.route('https://hooks.restaurantok.com/**', route => {
      const r = route.request();
      webhookPrimit = { headers: r.headers(), body: r.postDataJSON() };
      if (modWebhook === 'absent') return route.abort('namenotresolved');
      if (modWebhook === 'cade') return route.fulfill({ status: 500, body: 'eroare' });
      if (modWebhook === 'respins') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"eroare":"telefon"}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"test-42"}' });
    });
    const resp = await page.goto(url, { waitUntil: 'networkidle' });
    return { page, ctx, console_erori, status: resp.status() };
  }

  console.log('pagini la 400 px:');
  for (const f of pagini) {
    const { page, ctx, console_erori } = await deschide(base + '/' + f, { width: 400, height: 800 });
    const sw = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    const lorem = await page.evaluate(() => /lorem ipsum/i.test(document.body.innerText));
    const titlu = await page.title();
    const ok = sw <= 400 && console_erori.length === 0 && !lorem;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} ${f}  scrollWidth=${sw}  erori=${console_erori.length}  lorem=${lorem}  „${titlu}"`);
    console_erori.forEach(e => console.log('      ' + e));
    await page.screenshot({ path: path.join(CAPTURI, f.replace('.html', '').replace('/', '-') + '-400.png'), fullPage: true });
    await ctx.close();
  }

  // desktop: capturi pentru acasă și sală
  for (const f of ['index.html', 'sala-de-bal.html', 'despre.html']) {
    const { page, ctx } = await deschide(base + '/' + f, { width: 1280, height: 900 });
    await page.screenshot({ path: path.join(CAPTURI, f.replace('.html', '') + '-1280.png'), fullPage: true });
    await ctx.close();
  }

  console.log('deschis-acum (acasă, antet):');
  for (const m of ['ok', 'lipsa', 'invalid', 'gol']) {
    mod = m;
    const { page, ctx, console_erori } = await deschide(base + '/index.html', { width: 400, height: 800 });
    await page.waitForTimeout(300);
    const badge = await page.evaluate(() => {
      const b = document.querySelector('.antet [data-deschis-acum]');
      return { hidden: b.hidden, text: b.textContent.trim(), cls: b.className };
    });
    const program = await page.evaluate(() => {
      const el = document.querySelector('[data-program-lista]');
      return { tabel: !!el.querySelector('table'), text: el.textContent.trim().slice(0, 60) };
    });
    const asteptatVizibil = m === 'ok';
    const ok = badge.hidden === !asteptatVizibil && program.tabel === asteptatVizibil && console_erori.filter(e => !/program\.json|Failed to load resource/.test(e)).length === 0;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} mod=${m}: badge ${badge.hidden ? 'ascuns' : '„' + badge.text + '" [' + badge.cls + ']'}; program: ${program.tabel ? 'tabel' : 'fallback „' + program.text + '"'}; erori consolă (fără 404 așteptat): ${console_erori.filter(e => !/program\.json|Failed to load resource/.test(e)).length}`);
    if (m === 'ok') await page.screenshot({ path: path.join(CAPTURI, 'index-400-antet.png'), clip: { x: 0, y: 0, width: 400, height: 120 } });
    await ctx.close();
  }
  mod = 'ok';

  // meniul zilei (M1), pe acasă și pe gastro-pub
  console.log('meniul zilei:');
  const ignora = e => !/meniu-zilei\.json|data\/poze\/|Failed to load resource/.test(e);
  const cazuri = [
    // mod            pagina              card  fallback  notă-încheiat  descriere
    ['ok',            'index.html',       false, true,  false, 'exemplul datat 19 oct → vechi → fallback'],
    ['azi',           'index.html',       true,  false, false, 'date de azi → card vizibil, fallback ascuns'],
    ['azi',           'gastro-pub.html',  true,  false, false, 'date de azi pe gastro-pub'],
    ['maine',         'index.html',       true,  false, false, 'meniul de mâine → card marcat „Mâine"'],
    ['incheiat',      'index.html',       false, true,  true,  'valabil_pana trecut → fallback + „s-a încheiat"'],
    ['lipsa',         'index.html',       false, true,  false, 'JSON lipsă (404) → fallback, fără erori'],
    ['invalid',       'index.html',       false, true,  false, 'JSON stricat → fallback, fără erori'],
    ['fara-poze',     'index.html',       true,  false, false, 'fără poze și fără traduceri → card fără galerie și fără comutator'],
    ['real',          'index.html',       true,  false, false, 'două poze reale (placeholder) → galerie cu 2 imagini'],
  ];
  for (const [m, pagina, card, fallback, nota, descriere] of cazuri) {
    modMeniu = m;
    const { page, ctx, console_erori } = await deschide(base + '/' + pagina, { width: 400, height: 800 });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const c = document.querySelector('[data-meniu-zilei]'); if (c) c.scrollIntoView(); }); // pozele sunt lazy: se încarcă (sau eșuează) doar în ecran
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const c = document.querySelector('[data-meniu-zilei]');
      const card = c.querySelector('.meniu-zilei'), fb = c.querySelector('[data-meniu-zilei-fallback]');
      const wa = card && card.querySelector('.meniu-zilei-comanda a');
      return {
        stare: c.getAttribute('data-stare'), card: !!card, fallback: !!fb && !fb.hidden,
        nota: !!c.querySelector('.meniu-zilei-incheiat'), cand: card ? card.querySelector('.meniu-zilei-cand').textContent : '',
        preparate: card ? card.querySelectorAll('.meniu-zilei-lista li').length : 0,
        poze: card ? card.querySelectorAll('.meniu-zilei-poze img').length : 0,
        limbi: card ? card.querySelectorAll('.meniu-zilei-limba').length : 0,
        wa: wa ? decodeURIComponent(wa.href) : '', sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
      };
    });
    const erori_c = console_erori.filter(ignora);
    let ok = r.card === card && r.fallback === fallback && r.nota === nota && erori_c.length === 0 && r.sw <= 400;
    if (m === 'azi' || m === 'real' || m === 'fara-poze') ok = ok && r.preparate === 3 && r.cand === 'Azi' && /Bună! Vreau 1 × meniul zilei de azi, /.test(r.wa);
    if (m === 'maine') ok = ok && r.cand === 'Mâine' && /de mâine, /.test(r.wa);
    if (m === 'azi') ok = ok && r.poze === 0 /* poza din exemplu nu există → se scoate fără eroare */ && r.limbi === 3;
    if (m === 'fara-poze') ok = ok && r.poze === 0 && r.limbi === 0;
    if (m === 'real') ok = ok && r.poze === 2;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} ${descriere}: stare=${r.stare} card=${r.card} fallback=${r.fallback} notă=${r.nota} preparate=${r.preparate} poze=${r.poze} limbi=${r.limbi} sw=${r.sw} erori=${erori_c.length}`);
    erori_c.forEach(e => console.log('      ' + e));
    if (m === 'azi' && pagina === 'index.html') {
      // cantitatea: + de două ori → 3 porții în textul WhatsApp
      await page.click('.meniu-zilei-cantitate button[aria-label="Mai multe porții"]');
      await page.click('.meniu-zilei-cantitate button[aria-label="Mai multe porții"]');
      const wa3 = await page.evaluate(() => decodeURIComponent(document.querySelector('.meniu-zilei-comanda a').href));
      const ok3 = /Vreau 3 × meniul zilei de azi/.test(wa3) && /^https:\/\/wa\.me\/40785255855\?text=/.test(wa3);
      if (!ok3) erori++;
      console.log(`  ${ok3 ? '✓' : '✗'} cantitatea 3 → „${wa3.split('text=')[1]}"`);
      // comutatorul de limbă
      await page.click('.meniu-zilei-limba:nth-child(2)');
      const en = await page.evaluate(() => document.querySelector('.meniu-zilei-nume').textContent);
      const okEn = en === 'Meatball soup';
      if (!okEn) erori++;
      console.log(`  ${okEn ? '✓' : '✗'} EN → „${en}"`);
      await page.click('.meniu-zilei-limba:nth-child(1)');
      const el = await page.$('[data-meniu-zilei]');
      await el.screenshot({ path: path.join(CAPTURI, 'meniul-zilei-400.png') });
    }
    if (m === 'real' && pagina === 'index.html') { const el = await page.$('[data-meniu-zilei]'); await el.screenshot({ path: path.join(CAPTURI, 'meniul-zilei-poze-400.png') }); }
    if (m === 'maine') { const el = await page.$('[data-meniu-zilei]'); await el.screenshot({ path: path.join(CAPTURI, 'meniul-zilei-maine-400.png') }); }
    if (m === 'incheiat') { const el = await page.$('[data-meniu-zilei]'); await el.screenshot({ path: path.join(CAPTURI, 'meniul-zilei-incheiat-400.png') }); }
    await ctx.close();
  }
  // previzualizare: exemplul vechi + ?exemplu=1 → card cu eticheta de previzualizare
  {
    modMeniu = 'ok';
    const { page, ctx, console_erori } = await deschide(base + '/index.html?exemplu=1', { width: 1280, height: 900 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ card: !!document.querySelector('.meniu-zilei'), eticheta: !!document.querySelector('.meniu-zilei-sub .todo') }));
    const ok = r.card && r.eticheta && console_erori.filter(ignora).length === 0;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} ?exemplu=1 → card de previzualizare cu etichetă: card=${r.card} etichetă=${r.eticheta}`);
    const el = await page.$('#meniul-zilei');
    await el.screenshot({ path: path.join(CAPTURI, 'meniul-zilei-1280.png') });
    await ctx.close();
  }
  modMeniu = 'ok';

  // sala de bal (M2): calendarul de disponibilitate
  console.log('sala de bal — calendar:');
  const ignoraSala = e => !/sala-disponibilitate\.json|Failed to load resource|hooks\.restaurantok\.com/.test(e);
  const cazuriSala = [
    // mod         vizibil  descriere
    ['ok',         true,    'exemplul (actualizat 19 oct) → vizibil cât e în pragul de 7 zile; altfel ascuns'],
    ['proaspat',   true,    'date proaspete → calendar vizibil, zile ocupate/parțiale marcate'],
    ['vechi',      false,   'date de acum luni → calendarul se ascunde, formularul rămâne'],
    ['lipsa',      false,   'JSON lipsă (404) → ascuns, fără erori'],
    ['invalid',    false,   'JSON stricat → ascuns, fără erori'],
  ];
  for (const [m, vizibilAsteptat, descriere] of cazuriSala) {
    modSala = m;
    const { page, ctx, console_erori } = await deschide(base + '/sala-de-bal.html', { width: 400, height: 800 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const s = document.querySelector('[data-sala-disponibilitate]');
      return { stare: s.getAttribute('data-stare'), vizibil: !s.hidden, titlu: (s.querySelector('[data-calendar-titlu]') || {}).textContent,
        zile: s.querySelectorAll('.calendar-grila .zi').length, ocupate: s.querySelectorAll('.zi-ocupat').length, partiale: s.querySelectorAll('.zi-partial').length,
        libere: s.querySelectorAll('button.zi-liber').length, formular: !!document.querySelector('form[data-cerere]') && !document.querySelector('form[data-cerere]').hidden,
        sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) };
    });
    const erori_c = console_erori.filter(ignoraSala);
    let asteptat = vizibilAsteptat;
    if (m === 'ok') asteptat = (Date.now() - Date.parse(exemplSala.actualizat)) / 864e5 <= 7; // exemplul îmbătrânește singur
    let ok = r.vizibil === asteptat && r.formular && erori_c.length === 0 && r.sw <= 400;
    if (m === 'proaspat') ok = ok && r.zile >= 28 && r.libere > 0;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} ${descriere}: stare=${r.stare} vizibil=${r.vizibil} luna=„${r.titlu}" zile=${r.zile} libere=${r.libere} ocupate=${r.ocupate} parțiale=${r.partiale} formular=${r.formular} sw=${r.sw} erori=${erori_c.length}`);
    erori_c.forEach(e => console.log('      ' + e));
    if (m === 'proaspat') {
      // navigare: înainte/înapoi între cele 12 luni; zilele ocupate apar în luna lor
      const titlu0 = r.titlu;
      await page.click('[data-calendar-inainte]');
      const titlu1 = await page.textContent('[data-calendar-titlu]');
      const inapoiActiv = await page.evaluate(() => !document.querySelector('[data-calendar-inapoi]').disabled);
      await page.click('[data-calendar-inapoi]');
      const titlu2 = await page.textContent('[data-calendar-titlu]');
      const inapoiInactiv = await page.evaluate(() => document.querySelector('[data-calendar-inapoi]').disabled);
      const okNav = titlu1 !== titlu0 && titlu2 === titlu0 && inapoiActiv && inapoiInactiv;
      if (!okNav) erori++;
      console.log(`  ${okNav ? '✓' : '✗'} navigare luni: „${titlu0}" → „${titlu1}" → „${titlu2}"`);
      // ziua ocupată (azi+3) și cea parțială (azi+4) sunt în luna curentă sau în următoarea
      const marcate = await page.evaluate(async () => {
        const gaseste = () => ({ o: document.querySelectorAll('.zi-ocupat').length, p: document.querySelectorAll('.zi-partial').length });
        let g = gaseste(); if (g.o + g.p < 2) { document.querySelector('[data-calendar-inainte]').click(); const g2 = gaseste(); g = { o: g.o + g2.o, p: g.p + g2.p }; }
        return g;
      });
      const okMarcate = marcate.o >= 1 && marcate.p >= 1;
      if (!okMarcate) erori++;
      console.log(`  ${okMarcate ? '✓' : '✗'} zile marcate: ocupate=${marcate.o} parțiale=${marcate.p}`);
      // click pe o zi liberă → data ajunge în formular
      await page.click('[data-calendar-inapoi]').catch(() => {});
      const ziLibera = await page.evaluate(() => { const b = document.querySelector('button.zi-liber'); b.click(); return b.getAttribute('data-zi'); });
      const inFormular = await page.inputValue('[name="data_eveniment"]');
      const okZi = ziLibera === inFormular;
      if (!okZi) erori++;
      console.log(`  ${okZi ? '✓' : '✗'} click pe ${ziLibera} → formular: ${inFormular}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      const el = await page.$('[data-sala-disponibilitate] .calendar');
      await el.screenshot({ path: path.join(CAPTURI, 'sala-calendar-400.png') });
    }
    await ctx.close();
  }
  modSala = 'ok';

  // sala de bal (M2): formularul de cerere de ofertă
  console.log('sala de bal — formular:');
  async function completeaza(page) {
    await page.selectOption('[name="tip_eveniment"]', 'nunta');
    await page.fill('[name="data_eveniment"]', ziRo(60));
    await page.fill('[name="persoane"]', '120');
    await page.fill('[name="nume"]', 'Ion Popescu');
    await page.fill('[name="telefon"]', '0722 123 456');
    await page.fill('[name="email"]', 'ion@exemplu.ro');
    await page.fill('[name="mesaj"]', 'Ora 18, meniu cu pește.');
    await page.check('[name="consimtamant"]');
  }
  {
    // 1. formular gol → erori afișate, nimic trimis
    modWebhook = 'ok'; webhookPrimit = null;
    const { page, ctx, console_erori } = await deschide(base + '/sala-de-bal.html', { width: 400, height: 800 });
    await page.click('[data-trimite]');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ eroare: !document.querySelector('[data-eroare]').hidden, n: document.querySelectorAll('[data-eroare] li').length, invalide: document.querySelectorAll('[aria-invalid="true"]').length, focus: document.activeElement && document.activeElement.name }));
    const ok = r.eroare && r.n === 6 && r.invalide === 6 && webhookPrimit === null && r.focus === 'tip_eveniment' && console_erori.filter(ignoraSala).length === 0;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} formular gol → ${r.n} erori afișate, ${r.invalide} câmpuri marcate, focus pe „${r.focus}", nimic trimis`);
    await page.screenshot({ path: path.join(CAPTURI, 'sala-formular-erori-400.png'), fullPage: false });
    // 2. completat corect → POST cu payload-ul din contract + header token → confirmare
    await completeaza(page);
    const wa = await page.evaluate(() => decodeURIComponent(document.querySelector('[data-whatsapp-cerere]').href));
    const okWa = /Eveniment: Nuntă/.test(wa) && /Persoane: 120/.test(wa) && /Nume: Ion Popescu/.test(wa);
    if (!okWa) erori++;
    console.log(`  ${okWa ? '✓' : '✗'} butonul WhatsApp se precompletează pe măsură ce scrii`);
    await page.click('[data-trimite]');
    await page.waitForSelector('[data-confirmare]:not([hidden])', { timeout: 3000 }).catch(() => {});
    const c = await page.evaluate(() => ({ confirmare: !document.querySelector('[data-confirmare]').hidden, form: document.querySelector('form[data-cerere]').hidden,
      text: document.querySelector('[data-confirmare-text]').textContent, id: document.querySelector('[data-confirmare-id]').textContent, focus: document.activeElement && document.activeElement.hasAttribute('data-confirmare') }));
    const b = webhookPrimit && webhookPrimit.body;
    const okPost = b && b.tip === 'sala' && b.nume === 'Ion Popescu' && b.telefon === '0722 123 456' && b.email === 'ion@exemplu.ro' && b.persoane === 120 && b.data_eveniment === ziRo(60) && b.consimtamant === true && b.website === '' && b.detalii.tip_eveniment === 'nunta' && webhookPrimit.headers['x-site-token'] === 'TODO-token-site' && webhookPrimit.headers['content-type'] === 'application/json';
    const okConf = c.confirmare && c.form && /Te sunăm la 0722 123 456/.test(c.text) && /120 persoane/.test(c.text) && /Mulțumim, Ion!/.test(c.text) && /test-42/.test(c.id) && c.focus;
    if (!okPost || !okConf) erori++;
    console.log(`  ${okPost ? '✓' : '✗'} POST: payload după contract + X-Site-Token ${b ? JSON.stringify(Object.keys(b)) : '(nimic)'}`);
    console.log(`  ${okConf ? '✓' : '✗'} confirmare în pagină: „${c.text.slice(0, 80)}…" ${c.id}`);
    await page.screenshot({ path: path.join(CAPTURI, 'sala-formular-confirmare-400.png'), fullPage: false });
    await ctx.close();
  }
  for (const m of ['cade', 'absent', 'respins']) {
    // 3. webhook-ul cade / nu există (înainte de go-live) / respinge → mesaj de rezervă cu WhatsApp precompletat, fără eroare în consolă
    modWebhook = m; webhookPrimit = null;
    const { page, ctx, console_erori } = await deschide(base + '/sala-de-bal.html', { width: 400, height: 800 });
    await completeaza(page);
    await page.click('[data-trimite]');
    await page.waitForSelector('[data-rezerva]:not([hidden])', { timeout: 3000 }).catch(() => {});
    const r = await page.evaluate(() => ({ rezerva: !document.querySelector('[data-rezerva]').hidden, form: document.querySelector('form[data-cerere]').hidden, confirmare: !document.querySelector('[data-confirmare]').hidden,
      wa: decodeURIComponent(document.querySelector('[data-rezerva-whatsapp]').href) }));
    const erori_c = console_erori.filter(ignoraSala);
    const ok = r.rezerva && r.form && !r.confirmare && /^https:\/\/wa\.me\/40785255855\?text=Bună! Aș vrea o ofertă/.test(r.wa) && /Nume: Ion Popescu/.test(r.wa) && erori_c.length === 0;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} webhook ${m} → rezervă vizibilă=${r.rezerva}, formular ascuns=${r.form}, WhatsApp precompletat, erori=${erori_c.length}`);
    erori_c.forEach(e => console.log('      ' + e));
    if (m === 'absent') {
      await page.screenshot({ path: path.join(CAPTURI, 'sala-formular-rezerva-400.png'), fullPage: false });
      // „Încearcă din nou" readuce formularul cu datele intacte
      await page.click('[data-rezerva-inapoi]');
      const inapoi = await page.evaluate(() => ({ form: !document.querySelector('form[data-cerere]').hidden, nume: document.querySelector('[name="nume"]').value }));
      const okInapoi = inapoi.form && inapoi.nume === 'Ion Popescu';
      if (!okInapoi) erori++;
      console.log(`  ${okInapoi ? '✓' : '✗'} „Încearcă din nou" → formularul revine cu datele păstrate`);
    }
    await ctx.close();
  }
  modWebhook = 'ok';
  {
    // desktop: captură a paginii întregi cu calendar + formular
    modSala = 'proaspat';
    const { page, ctx } = await deschide(base + '/sala-de-bal.html?exemplu=1', { width: 1280, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(CAPTURI, 'sala-de-bal-1280.png'), fullPage: true });
    await ctx.close();
    modSala = 'ok';
  }

  // catering (M3): meniul săptămânii
  console.log('catering — meniul săptămânii:');
  const ignoraCat = e => !/catering\.json|Failed to load resource|hooks\.restaurantok\.com/.test(e);
  const cazuriCat = [
    // mod         card   descriere
    ['ok',         null,  'exemplul (19–23 oct) → vizibil cât mai are zile de azi încolo și e în pragul de 14 zile; altfel fallback'],
    ['proaspat',   true,  'date proaspete, 5 zile de azi → card cu 5 zile, azi marcată, fallback ascuns'],
    ['incheiat',   false, 'toate zilele au trecut → fallback (nu arătăm săptămâna trecută)'],
    ['vechi',      false, 'actualizat în ianuarie → fallback'],
    ['lipsa',      false, 'JSON lipsă (404) → fallback, fără erori'],
    ['invalid',    false, 'JSON stricat → fallback, fără erori'],
  ];
  for (const [m, cardAsteptat, descriere] of cazuriCat) {
    modCatering = m;
    const { page, ctx, console_erori } = await deschide(base + '/catering.html', { width: 400, height: 800 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const c = document.querySelector('[data-meniu-saptamana]');
      const card = c.querySelector('.meniu-saptamana'), fb = c.querySelector('[data-meniu-saptamana-fallback]');
      return { stare: c.getAttribute('data-stare'), card: !!card, fallback: !!fb && !fb.hidden, zile: card ? card.querySelectorAll('.meniu-saptamana-lista li').length : 0,
        azi: card ? card.querySelectorAll('.meniu-saptamana-lista li.azi').length : 0, pret: card ? (card.querySelector('.meniu-saptamana-pret') || {}).textContent : '',
        buton: card ? !!card.querySelector('[data-alege-tip="pranz-birou"]') : false, sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) };
    });
    const erori_c = console_erori.filter(ignoraCat);
    let asteptat = cardAsteptat;
    if (asteptat === null) { // exemplul îmbătrânește singur
      const zileRamase = exemplCatering.meniu_saptamana.zile.filter(z => z.data >= ziRo(0)).length;
      asteptat = zileRamase > 0 && (Date.now() - Date.parse(exemplCatering.actualizat)) / 864e5 <= 14;
    }
    let ok = r.card === asteptat && r.fallback === !asteptat && erori_c.length === 0 && r.sw <= 400;
    if (m === 'proaspat') ok = ok && r.zile === 5 && r.azi === 1 && /24 lei porția/.test(r.pret) && r.buton;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} ${descriere}: stare=${r.stare} card=${r.card} fallback=${r.fallback} zile=${r.zile} azi=${r.azi} preț=„${r.pret}" sw=${r.sw} erori=${erori_c.length}`);
    erori_c.forEach(e => console.log('      ' + e));
    if (m === 'proaspat') {
      const el = await page.$('[data-meniu-saptamana]');
      await el.screenshot({ path: path.join(CAPTURI, 'catering-saptamana-400.png') });
      // butonul din card preselectează „prânz la birou" în formular și schimbă etichetele
      await page.click('.meniu-saptamana [data-alege-tip="pranz-birou"]');
      const sel = await page.evaluate(() => ({ tip: document.querySelector('[name="tip_comanda"]').value, data: document.querySelector('[data-eticheta-data]').textContent, pers: document.querySelector('[data-eticheta-persoane]').textContent }));
      const okSel = sel.tip === 'pranz-birou' && sel.data === 'De când începem' && sel.pers === 'Porții pe zi';
      if (!okSel) erori++;
      console.log(`  ${okSel ? '✓' : '✗'} „Comandă prânzul la birou" → tip=${sel.tip}, etichete „${sel.data}" / „${sel.pers}"`);
    }
    await ctx.close();
  }
  {
    modCatering = 'ok';
    const { page, ctx, console_erori } = await deschide(base + '/catering.html?exemplu=1', { width: 1280, height: 900 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ card: !!document.querySelector('.meniu-saptamana'), zile: document.querySelectorAll('.meniu-saptamana-lista li').length, eticheta: !!document.querySelector('.meniu-saptamana-sub .todo') }));
    const ok = r.card && r.zile === 5 && r.eticheta && console_erori.filter(ignoraCat).length === 0;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} ?exemplu=1 → toate cele 5 zile din exemplu, cu etichetă de previzualizare: card=${r.card} zile=${r.zile} etichetă=${r.eticheta}`);
    await page.screenshot({ path: path.join(CAPTURI, 'catering-1280.png'), fullPage: true });
    await ctx.close();
  }
  modCatering = 'ok';

  // catering (M3): formularul de comandă
  console.log('catering — formular:');
  async function completeazaCatering(page, tip) {
    await page.selectOption('[name="tip_comanda"]', tip || 'pranz-birou');
    await page.fill('[name="data_eveniment"]', ziRo(7));
    await page.fill('[name="persoane"]', '12');
    await page.fill('[name="adresa"]', 'Str. Traian nr. 10, Calafat');
    await page.fill('[name="ora"]', '12:30');
    await page.fill('[name="nume"]', 'Firma Exemplu SRL');
    await page.fill('[name="telefon"]', '0722 123 456');
    await page.fill('[name="email"]', 'office@exemplu.ro');
    await page.fill('[name="mesaj"]', 'Fără carne de porc pentru doi colegi.');
    await page.check('[name="consimtamant"]');
  }
  {
    modWebhook = 'ok'; webhookPrimit = null;
    const { page, ctx, console_erori } = await deschide(base + '/catering.html', { width: 400, height: 800 });
    // 1. formular gol → 7 erori (adresa e obligatorie la livrare), nimic trimis
    await page.click('[data-trimite]');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ eroare: !document.querySelector('[data-eroare]').hidden, n: document.querySelectorAll('[data-eroare] li').length, invalide: document.querySelectorAll('[aria-invalid="true"]').length, focus: document.activeElement && document.activeElement.name }));
    const ok = r.eroare && r.n === 7 && r.invalide === 7 && webhookPrimit === null && r.focus === 'tip_comanda' && console_erori.filter(ignoraCat).length === 0;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} formular gol → ${r.n} erori afișate, ${r.invalide} câmpuri marcate, focus pe „${r.focus}", nimic trimis`);
    await page.screenshot({ path: path.join(CAPTURI, 'catering-formular-erori-400.png'), fullPage: false });
    // 2. „Cere ofertă" din cardul de evenimente preselectează tipul; ridicarea ascunde adresa
    await page.click('#evenimente [data-alege-tip]');
    const tipSel = await page.inputValue('[name="tip_comanda"]');
    await page.selectOption('[name="livrare"]', 'ridicare');
    const adresaAscunsa = await page.evaluate(() => document.querySelector('[data-camp-adresa]').hidden);
    await page.selectOption('[name="livrare"]', 'adresa');
    const adresaVizibila = await page.evaluate(() => !document.querySelector('[data-camp-adresa]').hidden);
    const okTip = tipSel === 'eveniment' && adresaAscunsa && adresaVizibila;
    if (!okTip) erori++;
    console.log(`  ${okTip ? '✓' : '✗'} „Cere ofertă" (evenimente) → tip=${tipSel}; ridicare ascunde adresa=${adresaAscunsa}, livrare o arată=${adresaVizibila}`);
    // 3. completat corect → POST tip catering cu detalii → confirmare
    await completeazaCatering(page, 'pranz-birou');
    const wa = await page.evaluate(() => decodeURIComponent(document.querySelector('[data-whatsapp-cerere]').href));
    const okWa = /Comandă: Prânz la birou/.test(wa) && /Porții pe zi: 12/.test(wa) && /Livrare la: Str\. Traian/.test(wa) && /ora 12:30/.test(wa);
    if (!okWa) erori++;
    console.log(`  ${okWa ? '✓' : '✗'} butonul WhatsApp se precompletează cu comanda`);
    await page.click('[data-trimite]');
    await page.waitForSelector('[data-confirmare]:not([hidden])', { timeout: 3000 }).catch(() => {});
    const c = await page.evaluate(() => ({ confirmare: !document.querySelector('[data-confirmare]').hidden, form: document.querySelector('form[data-cerere]').hidden,
      text: document.querySelector('[data-confirmare-text]').textContent, id: document.querySelector('[data-confirmare-id]').textContent }));
    const b = webhookPrimit && webhookPrimit.body;
    const okPost = b && b.tip === 'catering' && b.nume === 'Firma Exemplu SRL' && b.persoane === 12 && b.data_eveniment === ziRo(7) && b.consimtamant === true && b.website === '' && b.pagina === '/catering.html'
      && b.detalii && b.detalii.tip_comanda === 'pranz-birou' && b.detalii.livrare === 'adresa' && b.detalii.adresa === 'Str. Traian nr. 10, Calafat' && b.detalii.ora === '12:30' && webhookPrimit.headers['x-site-token'] === 'TODO-token-site';
    const okConf = c.confirmare && c.form && /Te sunăm la 0722 123 456 sau îți scriem la office@exemplu.ro ca să confirmăm prânzul la birou/.test(c.text) && /12 porții pe zi, livrare la Str\. Traian/.test(c.text) && /Mulțumim, Firma!/.test(c.text) && /test-42/.test(c.id);
    if (!okPost || !okConf) erori++;
    console.log(`  ${okPost ? '✓' : '✗'} POST: tip=catering, detalii ${b && b.detalii ? JSON.stringify(Object.keys(b.detalii)) : '(nimic)'}`);
    console.log(`  ${okConf ? '✓' : '✗'} confirmare în pagină: „${c.text.slice(0, 90)}…" ${c.id}`);
    await page.screenshot({ path: path.join(CAPTURI, 'catering-formular-confirmare-400.png'), fullPage: false });
    await ctx.close();
  }
  {
    // 4. webhook absent (înainte de go-live) → rezervă cu WhatsApp precompletat; pomană cu ridicare
    modWebhook = 'absent'; webhookPrimit = null;
    const { page, ctx, console_erori } = await deschide(base + '/catering.html', { width: 400, height: 800 });
    await completeazaCatering(page, 'pomana');
    await page.selectOption('[name="livrare"]', 'ridicare');
    await page.click('[data-trimite]');
    await page.waitForSelector('[data-rezerva]:not([hidden])', { timeout: 3000 }).catch(() => {});
    const r = await page.evaluate(() => ({ rezerva: !document.querySelector('[data-rezerva]').hidden, form: document.querySelector('form[data-cerere]').hidden, wa: decodeURIComponent(document.querySelector('[data-rezerva-whatsapp]').href) }));
    const erori_c = console_erori.filter(ignoraCat);
    const ok = r.rezerva && r.form && /^https:\/\/wa\.me\/40785255855\?text=Bună! Aș vrea să comand catering/.test(r.wa) && /Pachete: 12/.test(r.wa) && /Ridic eu de la restaurant\./.test(r.wa) && !/Livrare la:/.test(r.wa) && erori_c.length === 0;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} webhook absent → rezervă vizibilă=${r.rezerva}, WhatsApp cu pomană + ridicare, erori=${erori_c.length}`);
    erori_c.forEach(e => console.log('      ' + e));
    await page.screenshot({ path: path.join(CAPTURI, 'catering-formular-rezerva-400.png'), fullPage: false });
    await ctx.close();
    modWebhook = 'ok';
  }

  // cofetăria (M4): catalogul de torturi
  console.log('cofetăria — catalog:');
  const ignoraTort = e => !/torturi\.json|nu-exista\.jpg|Failed to load resource|hooks\.restaurantok\.com/.test(e);
  for (const [m, descriere] of [['ok', 'exemplul → 6 carduri cu placeholder și „preț la cerere", lista din formular umplută'], ['real', 'date reale: poză + preț; poza inexistentă → placeholder fără eroare'], ['lipsa', 'JSON lipsă (404) → fallback, fără erori'], ['invalid', 'JSON stricat → fallback, fără erori']]) {
    modTorturi = m;
    const { page, ctx, console_erori } = await deschide(base + '/cofetaria.html', { width: 400, height: 800 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const c = document.querySelector('[data-torturi]'), fb = c.querySelector('[data-torturi-fallback]');
      return { stare: c.getAttribute('data-stare'), carduri: c.querySelectorAll('.card.tort').length, fallback: !!fb && !fb.hidden, todo: c.querySelectorAll('.card-poza.poza-todo').length,
        poze: c.querySelectorAll('.card-poza img').length, preturi: c.querySelectorAll('.tort-pret b').length, optiuni: document.querySelectorAll('[name="tort"] option').length,
        sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) };
    });
    const erori_c = console_erori.filter(ignoraTort);
    let ok = erori_c.length === 0 && r.sw <= 400;
    if (m === 'ok') ok = ok && r.carduri === 6 && !r.fallback && r.todo === 6 && r.preturi === 0 && r.optiuni === 7;
    if (m === 'real') ok = ok && r.carduri === 2 && r.poze === 1 && r.todo === 1 && r.preturi === 2 && r.optiuni === 4;
    if (m === 'lipsa' || m === 'invalid') ok = ok && r.carduri === 0 && r.fallback && r.optiuni === 2;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} ${descriere}: stare=${r.stare} carduri=${r.carduri} fallback=${r.fallback} placeholder=${r.todo} poze=${r.poze} prețuri=${r.preturi} opțiuni=${r.optiuni} sw=${r.sw} erori=${erori_c.length}`);
    erori_c.forEach(e => console.log('      ' + e));
    if (m === 'ok') {
      await page.click('.card.tort[data-tort-id="ciocolata"] [data-alege-tort]');
      const ales = await page.inputValue('[name="tort"]');
      const okAles = ales === 'ciocolata';
      if (!okAles) erori++;
      console.log(`  ${okAles ? '✓' : '✗'} „Comandă" din card → tortul preselectat în formular: ${ales}`);
      await page.screenshot({ path: path.join(CAPTURI, 'cofetaria-400.png'), fullPage: true });
    }
    await ctx.close();
  }
  modTorturi = 'ok';

  // cofetăria (M4): formularul de comandă cu poză-model
  console.log('cofetăria — formular:');
  // o poză PNG mare (2000×1500) generată în browser, ca să verificăm redimensionarea la 1600 px; și una > 5 MB
  async function pozaTest(page, w, h) {
    const dataUrl = await page.evaluate(([w, h]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '200px serif'; x.fillText('tort', 100, 400); return c.toDataURL('image/png'); }, [w, h]);
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  }
  {
    modWebhook = 'ok'; webhookPrimit = null;
    const { page, ctx, console_erori } = await deschide(base + '/cofetaria.html', { width: 400, height: 800 });
    await page.waitForTimeout(400);
    await page.click('[data-trimite]');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ n: document.querySelectorAll('[data-eroare] li').length, invalide: document.querySelectorAll('[aria-invalid="true"]').length, focus: document.activeElement && document.activeElement.name }));
    const ok0 = r.n === 6 && r.invalide === 6 && r.focus === 'tort' && webhookPrimit === null;
    if (!ok0) erori++;
    console.log(`  ${ok0 ? '✓' : '✗'} formular gol → ${r.n} erori, focus pe „${r.focus}", nimic trimis`);
    // poză > 5 MB → respinsă cu mesaj, fără previzualizare
    await page.setInputFiles('[name="poza"]', { name: 'mare.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1) });
    await page.waitForTimeout(300);
    const mare = await page.evaluate(() => ({ ajutor: document.querySelector('[data-poza-ajutor]').textContent, ascuns: document.querySelector('[data-poza-ajutor]').hidden, prev: document.querySelector('[data-poza-previzualizare]').hidden }));
    const okMare = !mare.ascuns && /peste 5 MB/.test(mare.ajutor) && mare.prev;
    if (!okMare) erori++;
    console.log(`  ${okMare ? '✓' : '✗'} poză > 5 MB → „${mare.ajutor.slice(0, 40)}…", fără previzualizare`);
    // poză bună 2000×1500 → redimensionată la 1600 px, JPEG, previzualizare vizibilă
    await page.setInputFiles('[name="poza"]', { name: 'model.png', mimeType: 'image/png', buffer: await pozaTest(page, 2000, 1500) });
    await page.waitForFunction(() => !document.querySelector('[data-poza-previzualizare]').hidden, null, { timeout: 5000 }).catch(() => {});
    const p1 = await page.evaluate(() => { const f = document.querySelector('form[data-cerere="tort"]'); const p = f._pozaModel || {}; return { prev: !document.querySelector('[data-poza-previzualizare]').hidden, tip: p.tip, w: p.latime, h: p.inaltime, nume: p.nume, kb: Math.round((p.marime || 0) / 1024), wa: decodeURIComponent(document.querySelector('[data-whatsapp-cerere]').href) }; });
    const okPoza = p1.prev && p1.tip === 'image/jpeg' && p1.w === 1600 && p1.h === 1200 && p1.nume === 'model.jpg' && p1.kb > 0 && p1.kb < 600 && /Poza cu modelul o trimit aici/.test(p1.wa);
    if (!okPoza) erori++;
    console.log(`  ${okPoza ? '✓' : '✗'} poză 2000×1500 PNG → ${p1.w}×${p1.h} ${p1.tip} (${p1.kb} KB), previzualizare=${p1.prev}, WhatsApp menționează poza`);
    await page.screenshot({ path: path.join(CAPTURI, 'cofetaria-formular-poza-400.png'), fullPage: false });
    // completare + termen minim: data peste 2 zile la „nunta" (termen 7) → avertisment, dar nu blochează
    await page.selectOption('[name="tort"]', 'nunta');
    await page.fill('[name="data_eveniment"]', ziRo(2));
    await page.dispatchEvent('[name="data_eveniment"]', 'change');
    const avert = await page.evaluate(() => ({ text: document.querySelector('[data-data-ajutor]').textContent, hidden: document.querySelector('[data-data-ajutor]').hidden }));
    const okAvert = !avert.hidden && /7 zile/.test(avert.text);
    if (!okAvert) erori++;
    console.log(`  ${okAvert ? '✓' : '✗'} dată sub termenul minim (nuntă, 7 zile) → avertisment: „${avert.text.slice(0, 50)}…"`);
    await page.fill('[name="persoane"]', '40');
    await page.fill('[name="mesaj"]', 'Trei etaje, flori albe.');
    await page.fill('[name="nume"]', 'Maria Ionescu');
    await page.fill('[name="telefon"]', '0722 123 456');
    await page.check('[name="consimtamant"]');
    await page.click('[data-trimite]');
    await page.waitForSelector('[data-confirmare]:not([hidden])', { timeout: 5000 }).catch(() => {});
    const c = await page.evaluate(() => ({ confirmare: !document.querySelector('[data-confirmare]').hidden, text: document.querySelector('[data-confirmare-text]').textContent }));
    const b = webhookPrimit && webhookPrimit.body;
    const okPost = b && b.tip === 'tort' && b.persoane === 40 && b.data_eveniment === ziRo(2) && b.detalii && b.detalii.tort === 'nunta' && b.detalii.tort_text === 'Tort de nuntă / botez' && b.detalii.poza_model && b.detalii.poza_model.tip === 'image/jpeg' && b.detalii.poza_model.base64.length > 1000 && b.detalii.poza_model.latime === 1600 && b.pagina === '/cofetaria.html';
    const okConf = c.confirmare && /tort de nuntă \/ botez pentru/.test(c.text) && /40 persoane, după modelul din poza trimisă/.test(c.text) && /Mulțumim, Maria!/.test(c.text);
    if (!okPost || !okConf) erori++;
    console.log(`  ${okPost ? '✓' : '✗'} POST: tip=tort, tort=${b && b.detalii && b.detalii.tort}, poza_model base64 ${b && b.detalii && b.detalii.poza_model ? Math.round(b.detalii.poza_model.base64.length / 1024) + ' KB' : '(lipsă)'}`);
    console.log(`  ${okConf ? '✓' : '✗'} confirmare: „${c.text.slice(0, 90)}…"`);
    const erori_c = console_erori.filter(ignoraTort);
    if (erori_c.length) { erori++; erori_c.forEach(e => console.log('      ' + e)); }
    await ctx.close();
  }
  {
    // „Scoate poza" + webhook absent → rezervă WhatsApp, fără poză în text
    modWebhook = 'absent'; webhookPrimit = null;
    const { page, ctx, console_erori } = await deschide(base + '/cofetaria.html', { width: 400, height: 800 });
    await page.waitForTimeout(400);
    await page.setInputFiles('[name="poza"]', { name: 'model.png', mimeType: 'image/png', buffer: await pozaTest(page, 300, 200) });
    await page.waitForFunction(() => !document.querySelector('[data-poza-previzualizare]').hidden, null, { timeout: 5000 }).catch(() => {});
    await page.click('[data-poza-sterge]');
    const scoasa = await page.evaluate(() => ({ prev: document.querySelector('[data-poza-previzualizare]').hidden, model: !document.querySelector('form[data-cerere="tort"]')._pozaModel }));
    await page.selectOption('[name="tort"]', 'diplomat');
    await page.fill('[name="data_eveniment"]', ziRo(10));
    await page.fill('[name="persoane"]', '8');
    await page.fill('[name="nume"]', 'Ion Popescu');
    await page.fill('[name="telefon"]', '0722123456');
    await page.check('[name="consimtamant"]');
    await page.click('[data-trimite]');
    await page.waitForSelector('[data-rezerva]:not([hidden])', { timeout: 3000 }).catch(() => {});
    const r = await page.evaluate(() => ({ rezerva: !document.querySelector('[data-rezerva]').hidden, wa: decodeURIComponent(document.querySelector('[data-rezerva-whatsapp]').href) }));
    const okR = scoasa.prev && scoasa.model && r.rezerva && /Tort: Tort Diplomat/.test(r.wa) && /Persoane: 8/.test(r.wa) && !/Poza cu modelul/.test(r.wa) && webhookPrimit && webhookPrimit.body.detalii.poza_model === null && console_erori.filter(ignoraTort).length === 0;
    if (!okR) erori++;
    console.log(`  ${okR ? '✓' : '✗'} „Scoate poza" + webhook absent → rezervă WhatsApp cu Tort Diplomat, fără poză în payload`);
    await ctx.close();
    modWebhook = 'ok';
  }
  {
    const { page, ctx } = await deschide(base + '/cofetaria.html', { width: 1280, height: 900 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(CAPTURI, 'cofetaria-1280.png'), fullPage: true });
    await ctx.close();
  }

  // recenzii Google + postări Facebook (M5), pe acasă (ambele) și pe gastro-pub (recenzii)
  console.log('recenzii + postări:');
  const ignoraSocial = e => !/recenzii\.json|postari\.json|data\/poze\/|nu-exista|Failed to load resource/.test(e);
  for (const [m, vizibil, descriere] of [['ok', null, 'exemplele (19 oct) → vizibile cât sunt în prag (30 / 14 zile)'], ['proaspat', true, 'date proaspete → ambele secțiuni vizibile: nota, 5 recenzii, link real de recenzie; 3 postări, poza inexistentă scoasă'], ['vechi', false, 'date din ianuarie → ambele ascunse'], ['lipsa', false, 'JSON lipsă (404) → ascunse, fără erori'], ['invalid', false, 'JSON stricat → ascunse, fără erori']]) {
    modSocial = m;
    const { page, ctx, console_erori } = await deschide(base + '/index.html', { width: 400, height: 800 });
    await page.waitForTimeout(600);
    await page.evaluate(() => { const p = document.querySelector('[data-postari]'); if (p && !p.hidden) p.scrollIntoView(); }); // pozele sunt lazy: se încarcă (sau eșuează) doar când ajung în ecran
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const rec = document.querySelector('[data-recenzii]'), post = document.querySelector('[data-postari]');
      return { rec: !rec.hidden, recStare: rec.getAttribute('data-stare'), nota: (rec.querySelector('[data-recenzii-rating] b') || {}).textContent, stele: rec.querySelectorAll('[data-recenzii-rating] .stea.plina').length,
        carduri: rec.querySelectorAll('.recenzie').length, link: rec.querySelector('[data-recenzii-link]').href, linkText: rec.querySelector('[data-recenzii-link]').textContent,
        post: !post.hidden, postStare: post.getAttribute('data-stare'), postari: post.querySelectorAll('.postare').length, poze: post.querySelectorAll('.postare img').length,
        sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) };
    });
    const erori_c = console_erori.filter(ignoraSocial);
    let astR = vizibil, astP = vizibil;
    if (vizibil === null) { astR = (Date.now() - Date.parse(exemplRecenzii.actualizat)) / 864e5 <= 30; astP = (Date.now() - Date.parse(exemplPostari.actualizat)) / 864e5 <= 14; }
    let ok = r.rec === astR && r.post === astP && erori_c.length === 0 && r.sw <= 400;
    if (m === 'proaspat') ok = ok && r.nota === '4,5' && r.stele === 5 && r.carduri === 5 && /writereview\?placeid=ChIJtest/.test(r.link) && r.postari === 3 && r.poze === 1;
    if (m === 'ok' && astR) ok = ok && /writereview\?placeid=ChIJh_Ql7G16U0cRS6gH1eRpkXQ/.test(r.link) && /Lasă și tu/.test(r.linkText); // Place ID-ul real → link direct la „scrie o recenzie"
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} ${descriere}: recenzii=${r.rec} (${r.recStare}, nota ${r.nota}, ${r.carduri} carduri) postări=${r.post} (${r.postStare}, ${r.postari} postări, ${r.poze} poze) sw=${r.sw} erori=${erori_c.length}`);
    erori_c.forEach(e => console.log('      ' + e));
    if (m === 'proaspat') {
      const el = await page.$('[data-recenzii]'); await el.screenshot({ path: path.join(CAPTURI, 'recenzii-400.png') });
      const el2 = await page.$('[data-postari]'); await el2.screenshot({ path: path.join(CAPTURI, 'postari-400.png') });
      const g = await deschide(base + '/gastro-pub.html', { width: 400, height: 800 });
      await g.page.waitForTimeout(500);
      const gr = await g.page.evaluate(() => ({ rec: !document.querySelector('[data-recenzii]').hidden, carduri: document.querySelectorAll('.recenzie').length }));
      const okG = gr.rec && gr.carduri === 5 && g.console_erori.filter(ignoraSocial).length === 0;
      if (!okG) erori++;
      console.log(`  ${okG ? '✓' : '✗'} recenziile apar și pe gastro-pub: vizibil=${gr.rec}, carduri=${gr.carduri}`);
      await g.ctx.close();
    }
    await ctx.close();
  }
  {
    modSocial = 'ok';
    const { page, ctx, console_erori } = await deschide(base + '/index.html?exemplu=1', { width: 1280, height: 900 });
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({ rec: !document.querySelector('[data-recenzii]').hidden, post: !document.querySelector('[data-postari]').hidden, eticheta: !!document.querySelector('.postari-lista .todo') }));
    const vechiP = (Date.now() - Date.parse(exemplPostari.actualizat)) / 864e5 > 14; // eticheta apare doar când exemplul e deja vechi
    const ok = r.rec && r.post && r.eticheta === vechiP && console_erori.filter(ignoraSocial).length === 0;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} ?exemplu=1 → ambele vizibile oricât de vechi ar fi exemplele (etichetă de previzualizare: ${r.eticheta}, exemplu vechi: ${vechiP})`);
    await page.screenshot({ path: path.join(CAPTURI, 'index-social-1280.png'), fullPage: true });
    await ctx.close();
  }
  modSocial = 'ok';

  // evenimente (M6), pe acasă și gastro-pub
  console.log('evenimente:');
  const ignoraEv = e => !/evenimente\.json|Failed to load resource/.test(e);
  for (const [m, pagina, vizibil, descriere] of [['ok', 'index.html', null, 'exemplul (3 evenimente, actualizat 19 oct) → vizibil cât e proaspăt și mai are evenimente viitoare'], ['proaspat', 'index.html', true, 'date proaspete → 2 evenimente viitoare (cel trecut nu), JSON-LD Event în <head>'], ['proaspat', 'gastro-pub.html', true, 'la fel pe gastro-pub'], ['trecute', 'index.html', false, 'doar evenimente trecute → ascuns'], ['vechi', 'index.html', false, 'actualizat în ianuarie → ascuns'], ['lipsa', 'index.html', false, 'JSON lipsă → ascuns, fără erori'], ['invalid', 'index.html', false, 'JSON stricat → ascuns, fără erori']]) {
    modEvenimente = m;
    const { page, ctx, console_erori } = await deschide(base + '/' + pagina, { width: 400, height: 800 });
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const s = document.querySelector('[data-evenimente]'); const ld = document.getElementById('ld-evenimente');
      let ldOk = false, ldN = 0; try { const a = JSON.parse(ld ? ld.textContent : '[]'); ldOk = Array.isArray(a) && a.every(x => x['@type'] === 'Event' && x.startDate && x.location); ldN = a.length; } catch (e) {}
      return { vizibil: !s.hidden, stare: s.getAttribute('data-stare'), carduri: s.querySelectorAll('.eveniment').length, titluri: [...s.querySelectorAll('.eveniment h3')].map(h => h.textContent), ld: !!ld, ldOk, ldN, sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) };
    });
    const erori_c = console_erori.filter(ignoraEv);
    let ast = vizibil;
    if (ast === null) ast = (Date.now() - Date.parse(exemplEvenimente.actualizat)) / 864e5 <= 7 && exemplEvenimente.evenimente.some(e => Date.parse(e.sfarsit || e.inceput) >= Date.now());
    let ok = r.vizibil === ast && r.ld === ast && erori_c.length === 0 && r.sw <= 400;
    if (m === 'proaspat') ok = ok && r.carduri === 2 && r.titluri[0] === 'Seară cu DJ' && r.ldOk && r.ldN === 2;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} ${descriere}: vizibil=${r.vizibil} (${r.stare}) carduri=${r.carduri} [${r.titluri.join(', ')}] JSON-LD=${r.ld}/${r.ldOk}/${r.ldN} sw=${r.sw} erori=${erori_c.length}`);
    erori_c.forEach(e => console.log('      ' + e));
    if (m === 'proaspat' && pagina === 'index.html') { const el = await page.$('[data-evenimente]'); await el.screenshot({ path: path.join(CAPTURI, 'evenimente-400.png') }); }
    await ctx.close();
  }
  modEvenimente = 'ok';

  // meniul pe mobil se deschide
  {
    const { page, ctx } = await deschide(base + '/index.html', { width: 400, height: 800 });
    await page.click('.meniu-buton');
    const vizibil = await page.isVisible('#meniu-principal a[href="sala-de-bal.html"]');
    if (!vizibil) erori++;
    console.log(`  ${vizibil ? '✓' : '✗'} meniul pe mobil se deschide`);
    await page.screenshot({ path: path.join(CAPTURI, 'index-400-meniu.png'), clip: { x: 0, y: 0, width: 400, height: 520 } });
    await ctx.close();
  }

  // limbi (M8): paginile en/ și bg/ citesc ../data/*.json și randează componentele vii în limba paginii
  console.log('limbi (M8):');
  for (const [lang, asteptat] of [['en', { deschis: /^(Open|Closed|Closing in)/, zi: 'Monday', azi: /^(Today|Tomorrow)/, categorie: 'Soup', preparat: 'Meatball soup', buton: /^Order on WhatsApp/, whatsapp: /Hello!%20I%20would%20like%201%20%C3%97%20the%20menu/ }],
                                  ['bg', { deschis: /^(Отворено|Затворено|Затваря след)/, zi: 'Понеделник', azi: /^(Днес|Утре)/, categorie: 'Супа', preparat: 'Супа топчета', buton: /^Поръчай по WhatsApp/, whatsapp: /%D0%97%D0%B4%D1%80%D0%B0%D0%B2%D0%B5%D0%B9%D1%82%D0%B5!%20%D0%98%D1%81%D0%BA%D0%B0%D0%BC%201/ }]]) {
    mod = 'ok'; modMeniu = 'azi';
    const { page, ctx, console_erori } = await deschide(base + '/' + lang + '/index.html', { width: 400, height: 800 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      deschis: (document.querySelector('.antet .deschis-acum') || {}).textContent || '',
      deschisVizibil: !!document.querySelector('.antet .deschis-acum') && !document.querySelector('.antet .deschis-acum').hidden,
      zi: (document.querySelector('[data-program-lista] .program-tabel td') || {}).textContent || '',
      azi: (document.querySelector('.meniu-zilei-cand') || {}).textContent || '',
      categorie: (document.querySelector('.meniu-zilei-cat') || {}).textContent || '',
      preparat: (document.querySelector('.meniu-zilei-nume') || {}).textContent || '',
      listaLang: (document.querySelector('.meniu-zilei-lista') || {}).getAttribute ? document.querySelector('.meniu-zilei-lista').getAttribute('lang') : '',
      buton: (document.querySelector('.meniu-zilei-comanda .buton') || {}).textContent || '',
      whatsapp: (document.querySelector('.meniu-zilei-comanda .buton') || {}).href || '',
      alergeniHref: (document.querySelector('.meniu-zilei-sub a') || {}).getAttribute ? document.querySelector('.meniu-zilei-sub a').getAttribute('href') : '',
      fallbackAscuns: !!document.querySelector('[data-meniu-zilei-fallback]') && document.querySelector('[data-meniu-zilei-fallback]').hidden,
      comutator: Array.from(document.querySelectorAll('.meniu-zilei-limba')).map(b => b.textContent + (b.classList.contains('activ') ? '*' : '')).join(' '),
      limbi: Array.from(document.querySelectorAll('.meniu .limbi a')).map(a => a.textContent + ':' + a.getAttribute('href') + (a.classList.contains('activ') ? '*' : '')).join(' '),
      marcajeRo: document.querySelectorAll('.meniu li:not(.limbi) > a[hreflang="ro"]').length,
      hreflang: document.querySelectorAll('link[rel="alternate"][hreflang]').length,
      sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    }));
    const ok = r.lang === lang && r.deschisVizibil && asteptat.deschis.test(r.deschis) && r.zi === asteptat.zi && asteptat.azi.test(r.azi) && r.categorie === asteptat.categorie &&
      r.preparat === asteptat.preparat && r.listaLang === lang && asteptat.buton.test(r.buton) && asteptat.whatsapp.test(r.whatsapp) && r.alergeniHref === '../alergeni.html' &&
      r.fallbackAscuns && r.comutator === 'RO EN BG'.replace(lang.toUpperCase(), lang.toUpperCase() + '*') && r.marcajeRo === 4 && r.hreflang === 4 && r.sw <= 400 && console_erori.length === 0;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} ${lang}/index.html cu meniul de azi: deschis-acum „${r.deschis}" zi=${r.zi} ${r.azi} ${r.categorie}: ${r.preparat} [lang=${r.listaLang}] buton „${r.buton}" alergeni=${r.alergeniHref} comutator=${r.comutator} limbi=${r.limbi} marcajeRO=${r.marcajeRo} hreflang=${r.hreflang} sw=${r.sw} erori=${console_erori.length}`);
    console_erori.forEach(e => console.log('      ' + e));
    await page.screenshot({ path: path.join(CAPTURI, lang + '-index-400-meniu.png'), fullPage: true });
    await ctx.close();
  }
  // fără traduceri în JSON → pe pagina EN preparatele rămân în română (marcate lang="ro"), fără comutator, fără erori; JSON lipsă → fallback-ul în engleză
  for (const [m, asteapta] of [['fara-poze', { card: true, listaLang: 'ro', comutator: '' }], ['lipsa', { card: false }], ['invalid', { card: false }]]) {
    mod = 'ok'; modMeniu = m;
    const { page, ctx, console_erori } = await deschide(base + '/en/gastro-pub.html', { width: 400, height: 800 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      card: !!document.querySelector('.meniu-zilei'),
      listaLang: document.querySelector('.meniu-zilei-lista') ? document.querySelector('.meniu-zilei-lista').getAttribute('lang') : '',
      comutator: Array.from(document.querySelectorAll('.meniu-zilei-limba')).map(b => b.textContent).join(' '),
      fallbackVizibil: !!document.querySelector('[data-meniu-zilei-fallback]') && !document.querySelector('[data-meniu-zilei-fallback]').hidden,
      fallbackText: (document.querySelector('[data-meniu-zilei-fallback]') || {}).textContent || '',
      sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    }));
    const erori_c = console_erori.filter(ignora); // 404-ul așteptat pentru JSON-ul lipsă nu e o eroare a paginii
    const ok = r.card === asteapta.card && (asteapta.card ? r.listaLang === asteapta.listaLang && r.comutator === asteapta.comutator && !r.fallbackVizibil : r.fallbackVizibil && /Today’s menu/.test(r.fallbackText)) && r.sw <= 400 && erori_c.length === 0;
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} en/gastro-pub.html, meniul „${m}": card=${r.card} lang=${r.listaLang} comutator=„${r.comutator}" fallback=${r.fallbackVizibil} sw=${r.sw} erori=${erori_c.length}`);
    erori_c.forEach(e => console.log('      ' + e));
    await ctx.close();
  }
  mod = 'ok'; modMeniu = 'ok';
  // comutatorul de limbă de pe o pagină doar în română duce la acasă în limba aleasă; de pe o pagină tradusă, la aceeași pagină
  {
    const { page, ctx } = await deschide(base + '/sala-de-bal.html', { width: 1280, height: 900 });
    const l1 = await page.evaluate(() => Array.from(document.querySelectorAll('.meniu .limbi a')).map(a => a.getAttribute('href')).join(' '));
    await ctx.close();
    const { page: p2, ctx: c2 } = await deschide(base + '/gastro-pub.html', { width: 1280, height: 900 });
    const l2 = await p2.evaluate(() => Array.from(document.querySelectorAll('.meniu .limbi a')).map(a => a.getAttribute('href')).join(' '));
    await p2.screenshot({ path: path.join(CAPTURI, 'gastro-pub-1280-limbi.png'), clip: { x: 0, y: 0, width: 1280, height: 160 } });
    await c2.close();
    const ok = l1 === 'sala-de-bal.html en/index.html bg/index.html' && l2 === 'gastro-pub.html en/gastro-pub.html bg/gastro-pub.html';
    if (!ok) erori++;
    console.log(`  ${ok ? '✓' : '✗'} comutatorul de limbă: sala-de-bal → [${l1}]; gastro-pub → [${l2}]`);
  }

  await browser.close();
  server.close();
  console.log(erori ? `✗ ${erori} probleme` : '✓ toate verificările în browser au trecut');
  process.exit(erori ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
