#!/usr/bin/env node
// build.js — generator static fără dependențe pentru restaurantok.com
//
//   node build.js            → scrie dist/
//   node build.js --check    → doar verifică (fără scriere) că toate paginile au antet și partial-urile există
//
// Ce face:
//   1. Pentru fiecare src/pages/*.html citește antetul de pagină (comentariul @page cu
//      title, descriere, nav, canonical) și înlocuiește marcajele <!-- @partial nume -->
//      cu src/partials/nume.html. În partial-uri și pagini, {{cheie}} se înlocuiește cu
//      valoarea din antet (sau din data/program.json pentru {{contact.telefon}} etc.).
//   2. Copiază src/assets → dist/assets și data → dist/data (fără fișierele _*.json).
//   3. Copiază src/_redirects, src/_headers și src/robots.txt (dacă există) în dist/.
//   5. (M8) Limbi: src/pages/en/*.html și src/pages/bg/*.html sunt traducerile de mână ale paginilor cu același nume din src/pages/
//      (scrise la dist/en/, dist/bg/). Partial-urile primesc {{lang}}, {{radacina}} („../" în subdirector), {{t.cheie}} din src/i18n/<lang>.json,
//      {{alternative|raw}} (link rel=alternate hreflang), {{limbi|raw}} (comutatorul RO/EN/BG din meniu) și {{nav_href_*}} (linkul din meniu
//      duce la pagina tradusă dacă există, altfel la cea în română, marcată hreflang="ro").
//   4. (M6) Pentru fiecare pagină generează {{schema|raw}} (JSON-LD schema.org: Restaurant / Bakery / EventVenue / WebPage),
//      {{og_image}} și {{analytics|raw}} (snippetul Cloudflare Web Analytics, doar dacă există token în data/program.json → site.cloudflare_analytics_token),
//      apoi scrie dist/sitemap.xml cu paginile indexabile (URL-uri curate, lastmod = data build-ului).
//
// Nu există alt pas de build: dist/ se publică așa cum este (Cloudflare Pages, output "dist").

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const PAGES = path.join(SRC, 'pages');
const PARTIALS = path.join(SRC, 'partials');
const DATA = path.join(ROOT, 'data');
const DIST = path.join(ROOT, 'dist');
const CHECK_ONLY = process.argv.includes('--check');

const errors = [];
function fail(msg) { errors.push(msg); }

// ---------- utilitare ----------
function read(p) { return fs.readFileSync(p, 'utf8'); }
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function copyDir(from, to, filter) {
  if (!fs.existsSync(from)) return 0;
  let n = 0;
  mkdirp(to);
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, ent.name), b = path.join(to, ent.name);
    if (ent.isDirectory()) n += copyDir(a, b, filter);
    else if (!filter || filter(a)) { fs.copyFileSync(a, b); n++; }
  }
  return n;
}
function get(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- context global (din data/program.json) ----------
let program = {};
try { program = JSON.parse(read(path.join(DATA, 'program.json'))); }
catch (e) { fail('data/program.json invalid sau lipsă: ' + e.message); }

const SITE = {
  nume: 'Restaurant OK Calafat',
  domeniu: 'https://restaurantok.com',
  contact: program.contact || {},
  an: String(new Date().getFullYear()),
  og_image: 'https://restaurantok.com/assets/img/logo-ok.png',
  azi: new Date().toISOString().slice(0, 10),
};
const ANALYTICS_TOKEN = program.site && typeof program.site.cloudflare_analytics_token === 'string' && !/TODO/.test(program.site.cloudflare_analytics_token) ? program.site.cloudflare_analytics_token : '';

// ---------- limbi (M8) ----------
const I18N = path.join(SRC, 'i18n');
const LIMBI = ['ro', 'en', 'bg']; // ro = src/pages/*.html; celelalte = src/pages/<lang>/*.html
const T = {};
for (const l of LIMBI) {
  try { T[l] = JSON.parse(read(path.join(I18N, l + '.json'))); }
  catch (e) { fail(`src/i18n/${l}.json invalid sau lipsă: ${e.message}`); T[l] = {}; }
}
for (const l of LIMBI.slice(1)) {
  for (const k of Object.keys(T.ro)) if (k !== '_nota' && !(k in T[l])) fail(`src/i18n/${l}.json: lipsește cheia „${k}"`);
  for (const k of Object.keys(T[l])) if (k !== '_nota' && !(k in T.ro)) fail(`src/i18n/${l}.json: cheia „${k}" nu există în ro.json`);
}
function existaPagina(lang, slug) { return fs.existsSync(path.join(PAGES, lang === 'ro' ? '' : lang, slug + '.html')); }
function urlPagina(lang, slug) { // URL-ul canonic (curat, ca pe Cloudflare Pages)
  const dir = lang === 'ro' ? '' : lang + '/';
  return slug === 'index' ? `${SITE.domeniu}/${dir}` : `${SITE.domeniu}/${dir}${slug}`;
}
function hrefRelativ(dinLang, spreLang, slug) { // link relativ dintr-o pagină în limba dinLang spre pagina slug în limba spreLang
  if (dinLang === spreLang) return slug + '.html';
  return (dinLang === 'ro' ? '' : '../') + (spreLang === 'ro' ? '' : spreLang + '/') + slug + '.html';
}

// ---------- schema.org (M6) ----------
// Programul din program.json → openingHoursSpecification; zilele fără interval se omit; intervalele peste miezul nopții rămân ca atare (closes "01:00").
const ZILE_SCHEMA = { luni: 'Monday', marti: 'Tuesday', miercuri: 'Wednesday', joi: 'Thursday', vineri: 'Friday', sambata: 'Saturday', duminica: 'Sunday' };
function oreDeschidere(cheie) {
  const u = program.unitati && program.unitati[cheie];
  if (!u || !u.orar || program._exemplu || u._exemplu) return undefined; // programul de exemplu nu ajunge în datele structurate (ar fi date inventate pentru Google)
  const out = [];
  for (const [zi, intervale] of Object.entries(u.orar)) for (const iv of (intervale || [])) if (iv && iv.length === 2) out.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: ZILE_SCHEMA[zi], opens: iv[0], closes: iv[1] });
  return out.length ? out : undefined;
}
const c = SITE.contact;
const telefonE164 = '+4' + String(c.telefon || '').replace(/\D/g, '');
const ADRESA_CENTRU = { '@type': 'PostalAddress', streetAddress: 'Str. A.I. Cuza nr. 26', addressLocality: 'Calafat', addressRegion: 'Dolj', postalCode: '205200', addressCountry: 'RO' };
const ADRESA_SALA = { '@type': 'PostalAddress', streetAddress: 'Str. Traian nr. 2', addressLocality: 'Calafat', addressRegion: 'Dolj', postalCode: '205200', addressCountry: 'RO' };
const comun = (tip, nume, url, extra) => Object.assign({ '@context': 'https://schema.org', '@type': tip, '@id': url + '#' + tip.toLowerCase(), name: nume, url, telephone: telefonE164, email: c.email,
  image: SITE.og_image, logo: SITE.og_image, sameAs: c.facebook ? [c.facebook] : undefined, priceRange: '$$', currenciesAccepted: 'RON' }, extra);
const RESTAURANT = comun('Restaurant', 'Gastro-pub OK', SITE.domeniu + '/gastro-pub', { address: ADRESA_CENTRU, hasMap: c.harta_url, servesCuisine: ['Romanian'], openingHoursSpecification: oreDeschidere('gastro-pub'),
  foundingDate: '1993', parentOrganization: { '@type': 'Organization', name: 'SC Sorlir Impex SRL' }, acceptsReservations: 'True' });
const COFETARIA = comun('Bakery', 'Cofetăria OK', SITE.domeniu + '/cofetaria', { address: ADRESA_CENTRU, hasMap: c.harta_url, openingHoursSpecification: oreDeschidere('cofetaria') });
const SALA = comun('EventVenue', 'Sala de bal OK', SITE.domeniu + '/sala-de-bal', { address: ADRESA_SALA, hasMap: c.harta_sala_url, maximumAttendeeCapacity: 140 });
const CATERING = comun('FoodService', 'Catering OK', SITE.domeniu + '/catering', { address: ADRESA_CENTRU, areaServed: 'Calafat' });
const ORGANIZATIE = { '@context': 'https://schema.org', '@type': 'Organization', '@id': SITE.domeniu + '/#organizatie', name: 'Restaurant OK Calafat', legalName: 'SC Sorlir Impex SRL', url: SITE.domeniu + '/', logo: SITE.og_image,
  telephone: telefonE164, email: c.email, sameAs: c.facebook ? [c.facebook] : undefined, address: ADRESA_CENTRU, foundingDate: '1993',
  subOrganization: [{ '@id': RESTAURANT['@id'] }, { '@id': COFETARIA['@id'] }, { '@id': SALA['@id'] }] };
const SCHEMA = { // slug → lista de obiecte JSON-LD
  index: [ORGANIZATIE, RESTAURANT, COFETARIA, SALA], 'gastro-pub': [RESTAURANT], cofetaria: [COFETARIA], 'sala-de-bal': [SALA], catering: [CATERING],
  contact: [RESTAURANT, SALA], despre: [ORGANIZATIE],
};
function schemaPentru(slug, meta, canonical, lang) {
  const lista = (SCHEMA[slug] || []).slice();
  if (!/noindex/.test(meta.robots || '')) lista.push({ '@context': 'https://schema.org', '@type': 'WebPage', url: canonical, name: meta.titlu_complet || meta.title, description: meta.descriere, inLanguage: lang || 'ro', isPartOf: { '@id': SITE.domeniu + '/#organizatie' } });
  return lista.map(o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/<\//g, '<\\/') + '</script>').join('\n');
}
const ANALYTICS = ANALYTICS_TOKEN ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${ANALYTICS_TOKEN}"}'></script>` : '<!-- Cloudflare Web Analytics: se activează când data/program.json → site.cloudflare_analytics_token are token-ul (M7) -->';

// ---------- antetul paginii ----------
// <!-- @page
//   title: Gastro-pub OK
//   descriere: ...
//   nav: gastro-pub
// -->
function parseHeader(html, file) {
  const m = html.match(/^\s*<!--\s*@page\s*\n([\s\S]*?)-->\s*\n?/);
  if (!m) { fail(`${file}: lipsește antetul <!-- @page ... -->`); return [{}, html]; }
  const meta = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i);
    if (mm) meta[mm[1]] = mm[2];
  }
  for (const k of ['title', 'descriere', 'nav']) if (!meta[k]) fail(`${file}: antetul nu are „${k}"`);
  return [meta, html.slice(m[0].length)];
}

// ---------- înlocuiri ----------
const partialCache = {};
function partial(name, file) {
  if (!(name in partialCache)) {
    const p = path.join(PARTIALS, name + '.html');
    if (!fs.existsSync(p)) { fail(`${file}: partial-ul „${name}" nu există (${p})`); partialCache[name] = ''; }
    else partialCache[name] = read(p);
  }
  return partialCache[name];
}

function render(html, ctx, file, depth = 0) {
  if (depth > 5) { fail(`${file}: partial-uri imbricate prea adânc`); return html; }
  html = html.replace(/<!--\s*@partial\s+([a-z0-9_-]+)\s*-->/gi, (_, name) => render(partial(name, file), ctx, file, depth + 1));
  html = html.replace(/\{\{\s*([a-z0-9_.]+)\s*(\|raw)?\s*\}\}/gi, (whole, key, raw) => {
    let v = get(ctx, key);
    if (v === undefined) { fail(`${file}: variabila {{${key}}} nu are valoare`); return ''; }
    return raw ? String(v) : escapeHtml(v);
  });
  return html;
}

// ---------- paginile ----------
function buildPages() {
  const out = [];
  for (const lang of LIMBI) {
    const dir = lang === 'ro' ? PAGES : path.join(PAGES, lang);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort();
    for (const f of files) {
      const rel = (lang === 'ro' ? '' : lang + '/') + f;
      const src = read(path.join(dir, f));
      const [meta, body] = parseHeader(src, 'src/pages/' + rel);
      const slug = f.replace(/\.html$/, '');
      if (lang !== 'ro' && !existaPagina('ro', slug)) fail(`src/pages/${rel}: nu există pagina în română src/pages/${slug}.html`);
      const t = T[lang] || T.ro;
      const limbiPagina = LIMBI.filter(l => existaPagina(l, slug)); // limbile în care există această pagină
      const canonical = meta.canonical || urlPagina(lang, slug);
      // hreflang: doar când pagina există în mai multe limbi; x-default = româna
      const alternative = limbiPagina.length > 1
        ? limbiPagina.map(l => `<link rel="alternate" hreflang="${l}" href="${urlPagina(l, slug)}">`).concat([`<link rel="alternate" hreflang="x-default" href="${urlPagina('ro', slug)}">`]).join('\n')
        : '';
      // comutatorul de limbă din meniu: spre aceeași pagină dacă e tradusă, altfel spre acasă în limba respectivă
      const limbi = '<li class="limbi"><span class="vizual-ascuns">' + escapeHtml(t.limbi_aria) + ': </span>' + LIMBI.map(l => {
        const tinta = existaPagina(l, slug) ? slug : 'index';
        const activ = l === lang;
        return `<a href="${hrefRelativ(lang, l, tinta)}" hreflang="${l}" lang="${l}"${activ ? ' class="activ" aria-current="true"' : ''} title="${escapeHtml(T[l].nume_limba)}">${l.toUpperCase()}</a>`;
      }).join('') + '</li>';
      const ctx = Object.assign({}, SITE, meta, {
        slug, lang, t,
        radacina: lang === 'ro' ? '' : '../',
        canonical,
        alternative,
        limbi,
        lang_ro: lang === 'ro' ? '' : ' hreflang="ro"',
        nota_traducere: t.nota_traducere ? '<p class="mic mut">' + escapeHtml(t.nota_traducere) + '</p>' : '',
        nav_class_acasa: meta.nav === 'acasa' ? 'activ' : '',
        nav_class_gastro: meta.nav === 'gastro-pub' ? 'activ' : '',
        nav_class_cofetaria: meta.nav === 'cofetaria' ? 'activ' : '',
        nav_class_sala: meta.nav === 'sala-de-bal' ? 'activ' : '',
        nav_class_catering: meta.nav === 'catering' ? 'activ' : '',
        nav_class_despre: meta.nav === 'despre' ? 'activ' : '',
        nav_class_contact: meta.nav === 'contact' ? 'activ' : '',
        body_class: meta.body_class || '',
        robots: meta.robots || 'index,follow',
        titlu_complet: meta.titlu_complet || (meta.title + ' · Restaurant OK Calafat'),
        analytics: ANALYTICS,
      });
      // linkurile din meniu: pagina tradusă dacă există, altfel cea în română (marcată hreflang="ro")
      for (const [cheie, tinta] of Object.entries({ acasa: 'index', gastro: 'gastro-pub', cofetaria: 'cofetaria', sala: 'sala-de-bal', catering: 'catering', despre: 'despre', contact: 'contact' })) {
        const inLimba = existaPagina(lang, tinta);
        ctx['nav_href_' + cheie] = inLimba ? hrefRelativ(lang, lang, tinta) : hrefRelativ(lang, 'ro', tinta);
        ctx['nav_lang_' + cheie] = inLimba || lang === 'ro' ? '' : ' hreflang="ro"';
      }
      ctx.schema = schemaPentru(slug, ctx, ctx.canonical, lang);
      const html = render(body, ctx, 'src/pages/' + rel);
      out.push({ name: rel, html, slug, lang, canonical: ctx.canonical, indexabil: !/noindex/.test(ctx.robots), limbi: limbiPagina });
    }
  }
  return out;
}

// ---------- rulare ----------
const pages = buildPages();

if (CHECK_ONLY) {
  if (errors.length) { console.error('Erori:\n - ' + errors.join('\n - ')); process.exit(1); }
  console.log(`OK: ${pages.length} pagini verificate.`);
  process.exit(0);
}

rmrf(DIST);
mkdirp(DIST);
for (const p of pages) { mkdirp(path.dirname(path.join(DIST, p.name))); fs.writeFileSync(path.join(DIST, p.name), p.html); }
const nAssets = copyDir(path.join(SRC, 'assets'), path.join(DIST, 'assets'));
const nData = copyDir(DATA, path.join(DIST, 'data'), p => !path.basename(p).startsWith('_'));
for (const f of ['_redirects', '_headers', 'robots.txt']) {
  const p = path.join(SRC, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(DIST, f));
}
// sitemap.xml (M6): doar paginile indexabile, cu URL-urile curate de pe Cloudflare Pages
const sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
  .concat(pages.filter(p => p.indexabil).map(p => {
    const alt = p.limbi.length > 1 ? p.limbi.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${escapeHtml(urlPagina(l, p.slug))}"/>`).join('') : '';
    const prioritate = (p.slug === 'index' ? 1.0 : p.slug === 'sala-de-bal' || p.slug === 'gastro-pub' ? 0.9 : 0.7) - (p.lang === 'ro' ? 0 : 0.2);
    return `  <url><loc>${escapeHtml(p.canonical)}</loc>${alt}<lastmod>${SITE.azi}</lastmod><changefreq>${p.slug === 'index' || p.slug === 'gastro-pub' ? 'daily' : 'weekly'}</changefreq><priority>${prioritate.toFixed(1)}</priority></url>`;
  }))
  .concat(['</urlset>', '']).join('\n');
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap);

if (errors.length) {
  console.error('Build terminat cu erori:\n - ' + errors.join('\n - '));
  process.exit(1);
}
console.log(`OK: ${pages.length} pagini, ${nAssets} fișiere în assets/, ${nData} fișiere în data/ → dist/`);
