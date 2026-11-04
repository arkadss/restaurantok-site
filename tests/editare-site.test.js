// Capătul celălalt al editării prin Telegram (M8): JSON-urile produse de n8n/cod/editare.js se randează corect pe site.
//   node build.js && node tests/editare-site.test.js
// Servește dist/ cu data/*.json înlocuite de rezultatul comenzilor („închis 25.12 Crăciun", „program cofetărie: …",
// „săptămâna: …", „tort diplomat: …") și verifică în Chromium la 400 px: textele apar, fără scroll orizontal, fără erori în consolă.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const E = require('../n8n/cod/editare.js');

const DIST = path.join(__dirname, '..', 'dist');
const citeste = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const acum = new Date();
const azi = E.localRo(acum).data;
const pz = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ddmm = iso => (+iso.slice(8, 10)) + '.' + iso.slice(5, 7);
const maine = pz(azi, 1), poimaine = pz(azi, 2);

// comenzile, aplicate în lanț ca în n8n (fiecare pe JSON-ul rezultat din precedenta)
const lant = (fisier, comenzi) => comenzi.reduce((json, c) => { const r = E.aplica(E.interpreteaza(c, acum), json, acum); assert.ok(r.scrie, c + ' → ' + r.mesaj); return r.continut; }, citeste(fisier));
const program = lant('program.json', [`închis ${ddmm(maine)} Inventar`, `deschis ${ddmm(poimaine)} 10:00-16:00 cofetărie Eveniment privat`, 'program cofetărie: luni-sâmbătă 9-20, duminică închis']);
const zs = new Date(azi + 'T00:00:00Z').getUTCDay(); // meniul săptămânii: săptămâna în care cade „azi" (ca să fie zile de azi încolo), fără sâmbătă/duminică
const luniCurent = pz(azi, zs === 0 ? -6 : 1 - zs);
const ziCmd = ['luni', 'marți', 'miercuri', 'joi', 'vineri'];
const catering = lant('catering.json', [`săptămâna de la ${ddmm(luniCurent)}: ` + ziCmd.map((z, i) => `${z} ciorbă de test ${i + 1}, fel principal ${i + 1}`).join('; ') + '; 26 lei']);
const torturi = lant('torturi.json', ['tort diplomat: 120 lei/kg, 3 zile', 'tort prăjituri: 8 lei bucata']);
const date = { 'program.json': program, 'catering.json': catering, 'torturi.json': torturi };

const TIP = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const m = /^\/data\/([a-z-]+\.json)$/.exec(url);
  if (m && date[m[1]]) { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(date[m[1]])); }
  const f = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nu'); }
  res.writeHead(200, { 'Content-Type': TIP[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

let n = 0;
const ok = (nume) => { n++; console.log('  ✓ ' + nume); };
(async () => {
  await new Promise(r => server.listen(0, r));
  const baza = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, locale: 'ro-RO', timezoneId: 'Europe/Bucharest' });
  const page = await ctx.newPage();
  const erori = [];
  page.on('console', m => { if (m.type() === 'error') erori.push(m.text()); });
  page.on('pageerror', e => erori.push(String(e)));
  const deschide = async (p) => {
    await page.goto(baza + '/' + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.ok(!scroll, p + ': scroll orizontal la 400 px');
  };
  console.log('editare prin Telegram → site (Chromium, 400 px):');

  await deschide('contact.html');
  let text = await page.locator('[data-program-lista="gastro-pub"]').first().innerText();
  assert.ok(text.includes(ddmm(maine).replace(/^(\d)\./, '0$1.') + ': ') || text.includes(ddmm(maine) + ': '), 'excepția de mâine apare în programul restaurantului: ' + text);
  assert.ok(/Inventar/.test(text), 'motivul apare');
  assert.ok(!/Eveniment privat/.test(text), 'excepția marcată „cofetărie" nu apare la restaurant');
  text = await page.locator('[data-program-lista="cofetaria"]').first().innerText();
  assert.ok(/09:00–20:00/.test(text) && /Eveniment privat/.test(text) && /10:00–16:00/.test(text), 'programul nou și excepția cofetăriei: ' + text);
  assert.ok(!/orientativ/i.test(text), 'după „program cofetărie: …" dispare nota „orientativ"');
  assert.ok(/Inventar/.test(text), 'ziua închisă fără unitate apare și la cofetărie');
  ok('contact: zi închisă (ambele unități), program special doar la cofetărie și programul ei nou, fără „orientativ"');

  await deschide('cofetaria.html');
  const stare = await page.locator('[data-deschis-acum="cofetaria"]').first();
  assert.ok(!(await stare.getAttribute('title') || '').match(/orientativ/i), 'eticheta „deschis acum" a cofetăriei nu mai e orientativă');
  text = await page.locator('#torturi').innerText();
  assert.ok(/de la\s*120 lei\s*\/\s*kg/.test(text), 'prețul tortului diplomat: ' + text.slice(0, 400));
  assert.ok(/de la\s*8 lei\s*\/\s*bucată/.test(text), 'prețul prăjiturilor la bucată');
  assert.ok(/preț la cerere/.test(text), 'torturile fără preț rămân „la cerere"');
  ok('cofetăria: catalogul arată prețurile scrise din Telegram, restul „la cerere"');

  await deschide('catering.html');
  text = await page.locator('#meniul-saptamanii').innerText();
  assert.ok(/ciorbă de test/i.test(text), 'meniul săptămânii din comandă apare: ' + text.slice(0, 200));
  assert.ok(/26/.test(text), 'prețul din comandă');
  assert.ok(!/exemplu/i.test(text), 'nu mai e marcat exemplu');
  ok('catering: meniul săptămânii scris din Telegram, cu prețul nou, fără marcajul de exemplu');

  await deschide('index.html');
  ok('acasă se deschide cu program.json editat (deschis-acum citește excepțiile)');

  assert.deepEqual(erori, [], 'erori în consolă: ' + erori.join(' | '));
  ok('fără erori în consolă, fără scroll orizontal pe cele 4 pagini');

  await browser.close(); server.close();
  console.log(`${n} verificări trecute.`);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
