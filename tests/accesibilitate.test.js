#!/usr/bin/env node
// tests/accesibilitate.test.js — verificări de accesibilitate și de integritate pe dist/ (M8, sesiunea 10)
//
//   node build.js && node tests/accesibilitate.test.js
//
// 1. Fără dependențe: toate linkurile și resursele interne din paginile generate există în dist/;
//    toate <img> au alt; fiecare pagină are exact un <h1> și titlurile nu sar peste un nivel (h1 → h3).
// 2. Cu axe-core (opțional: `npm i -g axe-core` sau `npm i axe-core` în rădăcina proiectului): fiecare pagină,
//    la 400 px și 1280 px, cu datele de exemplu (?exemplu=1), fără încălcări WCAG 2.1 AA „serious”/„critical”,
//    cu o singură excepție cunoscută: numărul decorativ „404” (aria-hidden, contrast intenționat mic).
//    Dacă axe-core lipsește, partea 2 se sare cu un mesaj, nu cu eroare.

'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
let trecute = 0, picate = 0;
function ok(nume, detalii) { trecute++; console.log('  ✓ ' + nume + (detalii ? ': ' + detalii : '')); }
function nu(nume, detalii) { picate++; console.log('  ✗ ' + nume + (detalii ? ': ' + detalii : '')); }

if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('dist/ lipsește: rulează întâi `node build.js`'); process.exit(1); }

function walk(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; }
const pagini = walk(DIST).filter(f => f.endsWith('.html')).map(f => path.relative(DIST, f)).sort();

// ---- 1. integritate statică ----
console.log('integritate (fără dependențe):');
{
  const lipsa = [], faraAlt = [], h1 = [], ordine = [];
  for (const pg of pagini) {
    const html = fs.readFileSync(path.join(DIST, pg), 'utf8');
    const dir = path.dirname(path.join(DIST, pg));
    const re = /(?:href|src|poster)=["']([^"'#?]+)[^"']*["']/g; let m;
    while ((m = re.exec(html))) {
      const u = m[1];
      if (!u || /^(https?:|mailto:|tel:|data:|\/\/|javascript:)/.test(u)) continue;
      if (!fs.existsSync(path.resolve(dir, u))) lipsa.push(pg + ' → ' + u);
    }
    for (const im of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt=/.test(im[0])) faraAlt.push(pg + ': ' + im[0].slice(0, 60));
    const nH1 = (html.match(/<h1\b/g) || []).length;
    if (nH1 !== 1) h1.push(pg + ' are ' + nH1 + ' h1');
    let ultim = 0;
    for (const h of html.matchAll(/<h([1-6])\b/g)) { const n = +h[1]; if (ultim && n > ultim + 1) ordine.push(pg + ': h' + ultim + ' → h' + n); ultim = n; }
  }
  lipsa.length ? nu('linkuri și resurse interne', lipsa.join('; ')) : ok('linkuri și resurse interne', pagini.length + ' pagini, nimic rupt');
  faraAlt.length ? nu('imagini cu alt', faraAlt.join('; ')) : ok('toate <img> au alt');
  h1.length ? nu('un singur h1 pe pagină', h1.join('; ')) : ok('un singur h1 pe pagină');
  ordine.length ? nu('ordinea titlurilor', ordine.join('; ')) : ok('titlurile nu sar peste un nivel');
}

// ---- 2. axe-core în Chromium ----
let axeSrc = null;
for (const cale of ['axe-core/axe.min.js']) {
  try { axeSrc = fs.readFileSync(require.resolve(cale, { paths: [ROOT, process.cwd()].concat(require('module').globalPaths) }), 'utf8'); break; } catch (e) { /* încercăm mai departe */ }
}
if (!axeSrc) {
  try { const g = require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(); axeSrc = fs.readFileSync(path.join(g, 'axe-core', 'axe.min.js'), 'utf8'); } catch (e) { /* lipsește */ }
}
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) { try { chromium = require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')).chromium; } catch (e2) { /* lipsește */ } }

function final() {
  console.log(picate ? `\n✗ ${picate} verificări picate, ${trecute} trecute` : `\n✓ ${trecute} verificări trecute`);
  process.exit(picate ? 1 : 0);
}
if (!axeSrc || !chromium) { console.log('\naxe-core: sărit (' + (!axeSrc ? 'axe-core nu e instalat: `npm i -g axe-core`' : 'playwright lipsește') + ')'); final(); return; }

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const EXCEPTII = { '404.html': ['color-contrast'] }; // numărul decorativ „404” (aria-hidden)
(async () => {
  console.log('\naxe-core (WCAG 2.1 AA + best-practice, fără „minor”):');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch();
  for (const width of [400, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    let probleme = [];
    for (const pg of pagini) {
      await page.goto(`http://127.0.0.1:${port}/${pg}?exemplu=1`, { waitUntil: 'networkidle' });
      await page.addScriptTag({ content: axeSrc });
      const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }));
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > width) probleme.push(`${pg}: scroll orizontal (${sw} > ${width})`);
      for (const v of res.violations) {
        if (v.impact === 'minor' || (EXCEPTII[pg] || []).includes(v.id)) continue;
        probleme.push(`${pg}: ${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`);
      }
    }
    probleme.length ? nu(`${width} px`, '\n      ' + probleme.join('\n      ')) : ok(`${width} px`, pagini.length + ' pagini fără încălcări');
    await ctx.close();
  }
  await browser.close(); server.close();
  final();
})().catch(e => { console.error(e); process.exit(1); });
