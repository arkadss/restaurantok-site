// Teste pentru M6 (evenimente + SEO/tehnic), fără dependențe:
//   node tests/evenimente-seo.test.js        (rulează întâi `node build.js`)
// - stareEvenimente: viitoare / trecute / vechi / lipsă, previzualizare; jsonLdEveniment
// - nodul Code „Transformă evenimentele" din n8n/evenimente.json cu evenimente Google false
// - dist/: sitemap.xml, robots.txt, _headers, Open Graph și JSON-LD valid pe fiecare pagină, fără snippet de analytics cât timp token-ul e TODO
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const OK = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'site.js'));
const exemplu = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'evenimente.json'), 'utf8'));
const DIST = path.join(__dirname, '..', 'dist');
function ro(iso) { return new Date(iso + '+03:00'); }
let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }

console.log('evenimente (site):');
caz('exemplul (actualizat 19 oct) pe 21 oct → „ok", 3 evenimente viitoare în ordine; pe 25 oct primul a trecut → 2; pe 27 oct → „vechi"', () => {
  const s = OK.stareEvenimente(exemplu, ro('2026-10-21T12:00:00'));
  assert.equal(s.stare, 'ok'); assert.deepEqual(s.evenimente.map(e => e.id), ['ex1', 'ex2', 'ex3']); assert.equal(s.previzualizare, false);
  assert.equal(OK.stareEvenimente(exemplu, ro('2026-10-25T12:00:00')).evenimente.length, 2);
  assert.equal(OK.stareEvenimente(exemplu, ro('2026-10-27T12:00:00')).stare, 'vechi');
});
caz('un eveniment în desfășurare rămâne vizibil până la sfârșit; fără sfârșit → 3 ore; toate trecute → „niciunul"; lipsă / invalid → „lipsa"; previzualizare arată tot', () => {
  const j = { actualizat: new Date().toISOString(), evenimente: [{ id: 'a', titlu: 'În desfășurare', inceput: new Date(Date.now() - 3600e3).toISOString(), sfarsit: new Date(Date.now() + 3600e3).toISOString() }, { id: 'b', titlu: 'Fără sfârșit', inceput: new Date(Date.now() - 2 * 3600e3).toISOString() }, { id: 'c', titlu: 'Demult', inceput: '2026-01-01T10:00:00+02:00' }, { titlu: 'fără dată' }, { inceput: '2026-12-01T10:00:00Z' }] };
  const s = OK.stareEvenimente(j, new Date());
  assert.equal(s.stare, 'ok'); assert.deepEqual(s.evenimente.map(e => e.id), ['b', 'a']);
  assert.equal(OK.stareEvenimente({ actualizat: new Date().toISOString(), evenimente: [{ titlu: 'x', inceput: '2026-01-01T10:00:00Z' }] }, new Date()).stare, 'niciunul');
  assert.equal(OK.stareEvenimente(null).stare, 'lipsa'); assert.equal(OK.stareEvenimente({ evenimente: [] }).stare, 'lipsa');
  assert.equal(OK.stareEvenimente(exemplu, ro('2027-06-01T12:00:00'), { previzualizare: true }).evenimente.length, 3);
  const max = { actualizat: new Date().toISOString(), evenimente: [1, 2, 3, 4, 5, 6].map(i => ({ titlu: 't' + i, inceput: new Date(Date.now() + i * 864e5).toISOString() })) };
  assert.equal(OK.stareEvenimente(max, new Date()).evenimente.length, 4);
});
caz('jsonLdEveniment: Event cu locație și adresă după loc; fără prețuri inventate', () => {
  const s = OK.stareEvenimente(exemplu, ro('2026-10-21T12:00:00'));
  const ld = OK.jsonLdEveniment(s.evenimente[1]);
  assert.equal(ld['@type'], 'Event'); assert.equal(ld.name, 'Degustare de vin'); assert.equal(ld.startDate, '2026-11-07T19:00:00+02:00'); assert.equal(ld.endDate, '2026-11-07T22:00:00+02:00');
  assert.equal(ld.location.name, 'Sala de bal OK'); assert.equal(ld.location.address.streetAddress, 'Str. Traian nr. 2'); assert.ok(!('offers' in ld));
  assert.equal(OK.jsonLdEveniment(s.evenimente[0]).location.address.streetAddress, 'Str. A.I. Cuza nr. 26');
});

console.log('n8n evenimente (nodul Code):');
const w = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'evenimente.json'), 'utf8'));
const cod = w.nodes.find(x => x.name === 'Transformă evenimentele').parameters.jsCode;
const config = { calendar_id: 'x', github_owner: 'o', github_repo: 'r', telegram_chat_id: '1', orizont_zile: 90, loc_implicit: 'Gastro-pub OK', fus_orar: 'Europe/Bucharest' };
function ruleaza(evenimente, cfg) {
  const $ = () => ({ first: () => ({ json: cfg || config }) });
  const $input = { all: () => evenimente.map(e => ({ json: e })), first: () => ({ json: evenimente[0] || {} }) };
  return new Function('$', '$input', 'Buffer', cod)($, $input, Buffer)[0].json;
}
const peste = (zile, ore) => new Date(Date.now() + zile * 864e5 + (ore || 0) * 3600e3).toISOString();
caz('evenimente cu ore, de o zi întreagă, anulate, „liber", peste orizont → JSON valid, sortat, locul implicit, linkul din descriere devine url; trece de site', () => {
  const r = ruleaza([
    { id: 'e2', summary: 'Degustare de vin', description: 'Rezervare obligatorie. https://www.facebook.com/events/123', location: 'Sala de bal OK', start: { dateTime: peste(10) }, end: { dateTime: peste(10, 3) } },
    { id: 'e1', summary: 'Seară cu DJ', description: '<b>Intrare liberă</b>', start: { dateTime: peste(3) }, end: { dateTime: peste(3, 5) } },
    { id: 'e3', summary: 'Târg de Crăciun', start: { date: '2026-12-20' }, end: { date: '2026-12-22' } },
    { id: 'e4', summary: 'Anulat', status: 'cancelled', start: { dateTime: peste(5) } },
    { id: 'e5', summary: 'Liber', transparency: 'transparent', start: { dateTime: peste(6) } },
    { id: 'e6', summary: 'Prea departe', start: { dateTime: peste(200) } },
    { id: 'e7', start: { dateTime: peste(7) } }
  ]);
  const j = JSON.parse(r.continut);
  const ids = j.evenimente.map(e => e.id);
  assert.ok(ids.indexOf('e1') === 0 && ids.indexOf('e2') === 1, ids.join());
  assert.ok(!ids.includes('e4') && !ids.includes('e5') && !ids.includes('e6') && !ids.includes('e7'));
  const e1 = j.evenimente[0], e2 = j.evenimente[1], e3 = j.evenimente.find(e => e.id === 'e3');
  assert.equal(e1.loc, 'Gastro-pub OK'); assert.equal(e1.descriere, 'Intrare liberă'); assert.equal(e1.url, null);
  assert.equal(e2.url, 'https://www.facebook.com/events/123'); assert.equal(e2.descriere, 'Rezervare obligatorie.'); assert.equal(e2.loc, 'Sala de bal OK');
  if (e3) { assert.ok(/^2026-12-20T00:00:00\+02:00$/.test(e3.inceput), e3.inceput); assert.ok(/^2026-12-21T23:59:00\+02:00$/.test(e3.sfarsit), e3.sfarsit); }
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(e1.inceput));
  assert.ok(/^data: evenimente\.json \d{4}-\d{2}-\d{2}$/.test(r.commit));
  assert.equal(OK.stareEvenimente(j, new Date()).stare, 'ok');
});
caz('calendar gol (item gol de la alwaysOutputData) → fișier valid fără evenimente → site: „niciunul"', () => {
  const j = JSON.parse(ruleaza([{}]).continut);
  assert.deepEqual(j.evenimente, []);
  assert.ok(['niciunul', 'lipsa'].includes(OK.stareEvenimente(j, new Date()).stare));
});

console.log('SEO / tehnic (dist/):');
caz('sitemap.xml: doar paginile indexabile (fără 404), URL-uri curate, acasă = /', () => {
  const sm = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  const loc = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.ok(loc.includes('https://restaurantok.com/') && loc.includes('https://restaurantok.com/sala-de-bal') && loc.includes('https://restaurantok.com/gastro-pub'));
  assert.ok(!loc.some(l => /404|\.html/.test(l)), loc.join());
  assert.ok(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sm) && sm.startsWith('<?xml'));
});
caz('robots.txt permite tot și indică sitemap-ul; _headers are CSP, nosniff, HSTS și cache pentru assets', () => {
  const r = fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8'), h = fs.readFileSync(path.join(DIST, '_headers'), 'utf8');
  assert.ok(/Allow: \//.test(r) && /Sitemap: https:\/\/restaurantok\.com\/sitemap\.xml/.test(r));
  assert.ok(/Content-Security-Policy:.*connect-src 'self' https:\/\/hooks\.restaurantok\.com/.test(h) && /X-Content-Type-Options: nosniff/.test(h) && /Strict-Transport-Security/.test(h) && /img-src 'self' data:/.test(h));
});
caz('fiecare pagină: Open Graph complet, canonical, JSON-LD valid; acasă are Organization + Restaurant + Bakery + EventVenue; sala are EventVenue cu adresa de pe Traian; programul de exemplu NU ajunge în schema', () => {
  for (const f of fs.readdirSync(DIST).filter(f => f.endsWith('.html'))) {
    const h = fs.readFileSync(path.join(DIST, f), 'utf8');
    for (const p of ['og:title', 'og:description', 'og:url', 'og:image']) assert.ok(h.includes(`property="${p}"`), f + ' ' + p);
    assert.ok(/<link rel="canonical" href="https:\/\/restaurantok\.com\/[a-z-]*">/.test(h), f + ' canonical');
    const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    const tipuri = ld.map(o => o['@type']);
    if (f === 'index.html') { for (const t of ['Organization', 'Restaurant', 'Bakery', 'EventVenue', 'WebPage']) assert.ok(tipuri.includes(t), 'index ' + t); }
    if (f === 'sala-de-bal.html') { const s = ld.find(o => o['@type'] === 'EventVenue'); assert.equal(s.address.streetAddress, 'Str. Traian nr. 2'); assert.equal(s.maximumAttendeeCapacity, 140); }
    if (f === 'gastro-pub.html') { const r = ld.find(o => o['@type'] === 'Restaurant'); assert.equal(r.telephone, '+40785255855'); assert.equal(r.openingHoursSpecification.length, 7); assert.equal(r.openingHoursSpecification.find(o => o.dayOfWeek === 'Sunday').opens, '09:30'); }
    if (f === 'cofetaria.html') { const b = ld.find(o => o['@type'] === 'Bakery'); assert.ok(!('openingHoursSpecification' in b), 'programul de exemplu al cofetăriei a ajuns în schema'); }
    if (f === '404.html') assert.ok(/noindex/.test(h) && ld.length === 0);
    assert.ok(!/cloudflareinsights/.test(h), f + ': snippetul de analytics apare fără token'); // token TODO → doar comentariul
  }
});

console.log(n + ' cazuri trecute.');
