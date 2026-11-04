// Teste pentru limbi (M8): dicționarele src/i18n/*.json, textele componentelor vii din site.js pe ro/en/bg
// și paginile generate în dist/en/, dist/bg/ (hreflang, rădăcina, comutatorul de limbă, sitemap). Rulează după `node build.js`:
//   node tests/i18n.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const ok = require(path.join(ROOT, 'src', 'assets', 'js', 'site.js'));
const citeste = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }
console.log('i18n (M8):');

caz('dicționarele ro/en/bg au aceleași chei și niciun text gol (în afară de nota opțională)', () => {
  const d = {}; for (const l of ['ro', 'en', 'bg']) d[l] = JSON.parse(citeste('src/i18n/' + l + '.json'));
  const chei = Object.keys(d.ro).filter(k => k !== '_nota').sort();
  for (const l of ['en', 'bg']) {
    assert.deepEqual(Object.keys(d[l]).filter(k => k !== '_nota').sort(), chei, l);
    for (const k of chei) if (k !== 'nota_traducere') assert.ok(typeof d[l][k] === 'string' && d[l][k].trim(), l + '.' + k);
  }
  assert.equal(d.en.og_locale, 'en_GB'); assert.equal(d.bg.og_locale, 'bg_BG');
});

caz('TEXTE din site.js au aceleași chei pe ro/en/bg', () => {
  const chei = Object.keys(ok.TEXTE.ro).sort();
  for (const l of ['en', 'bg']) assert.deepEqual(Object.keys(ok.TEXTE[l]).sort(), chei, l);
  for (const l of ['ro', 'en', 'bg']) { assert.equal(ok.TEXTE[l].luni.length, 12); assert.equal(Object.keys(ok.TEXTE[l].zile).length, 7); }
});

const program = {
  fus_orar: 'Europe/Bucharest',
  unitati: { cofetaria: { nume: 'Cofetăria OK', orar: { luni: [['09:00', '20:00']], marti: [['09:00', '20:00']], miercuri: [['09:00', '20:00']], joi: [['09:00', '20:00']], vineri: [['09:00', '20:00']], sambata: [['09:00', '14:00']], duminica: [] } } },
  exceptii: [{ data: '2026-12-25', unitate: 'cofetaria', inchis: true, motiv: 'Crăciun' }]
};
const la = (iso, off) => new Date(iso + off);
const asteptari = {
  ro: ['Deschis', 'până la 20:00', 'Se închide în 30 min', 'la 20:00', 'Închis', 'deschide la 09:00', 'Închis', 'deschide mâine la 09:00', 'Închis', 'deschide luni la 09:00', 'Închis azi', 'marți, 20 octombrie', '20 octombrie', 'Bună! Vreau 3 × meniul zilei de mâine, 20 octombrie.'],
  en: ['Open', 'until 20:00', 'Closing in 30 min', 'at 20:00', 'Closed', 'opens at 09:00', 'Closed', 'opens tomorrow at 09:00', 'Closed', 'opens Monday at 09:00', 'Closed today', 'Tuesday, 20 October', '20 October', 'Hello! I would like 3 × the menu of the day for tomorrow, 20 October.'],
  bg: ['Отворено', 'до 20:00', 'Затваря след 30 мин', 'в 20:00', 'Затворено', 'отваря в 09:00', 'Затворено', 'отваря утре в 09:00', 'Затворено', 'отваря в понеделник в 09:00', 'Затворено днес', 'вторник, 20 октомври', '20 октомври', 'Здравейте! Искам 3 × менюто на деня за утре, 20 октомври.'],
};
for (const l of ['ro', 'en', 'bg']) caz('deschis-acum, data și textul WhatsApp în ' + l, () => {
  assert.equal(ok.setLimba(l), l);
  const a = ok.stareDeschis(program, 'cofetaria', la('2026-10-20T12:00:00', '+03:00')); // deschis
  const b = ok.stareDeschis(program, 'cofetaria', la('2026-10-20T19:30:00', '+03:00')); // se închide curând
  const c = ok.stareDeschis(program, 'cofetaria', la('2026-10-20T08:00:00', '+03:00')); // deschide azi
  const d = ok.stareDeschis(program, 'cofetaria', la('2026-10-20T21:00:00', '+03:00')); // deschide mâine
  const e = ok.stareDeschis(program, 'cofetaria', la('2026-10-24T15:00:00', '+03:00')); // sâmbătă după 14 → luni
  const f = ok.stareDeschis(program, 'cofetaria', la('2026-12-25T12:00:00', '+02:00')); // excepție: închis azi
  const got = [a.mesaj, a.detaliu, b.mesaj, b.detaliu, c.mesaj, c.detaliu, d.mesaj, d.detaliu, e.mesaj, e.detaliu, f.mesaj, ok.dataLunga('2026-10-20'), ok.dataScurta('2026-10-20'), ok.textWhatsApp(3, 'maine', '2026-10-20')];
  assert.deepEqual(got, asteptari[l]);
  assert.equal(e.deschide.cand, 'luni'); // valoarea internă rămâne în română, indiferent de limbă
});
caz('o limbă necunoscută cade pe română', () => { assert.equal(ok.setLimba('de'), 'ro'); assert.equal(ok.stareDeschis(program, 'cofetaria', la('2026-10-20T12:00:00', '+03:00')).mesaj, 'Deschis'); });
ok.setLimba('ro');

// ---- dist/ (după build) ----
const DIST = path.join(ROOT, 'dist');
if (!fs.existsSync(path.join(DIST, 'en', 'index.html'))) { console.log('  (dist/en lipsește — rulează `node build.js` înainte; verificările pe dist/ sunt sărite)'); }
else {
  caz('fiecare pagină tradusă are o pagină în română cu același nume', () => {
    for (const l of ['en', 'bg']) for (const f of fs.readdirSync(path.join(DIST, l))) assert.ok(fs.existsSync(path.join(DIST, f)), l + '/' + f);
  });
  caz('paginile en/bg: <html lang>, og:locale, rădăcina ../, hreflang complet, canonical curat, fără {{ }} rămase', () => {
    for (const l of ['en', 'bg']) for (const f of fs.readdirSync(path.join(DIST, l))) {
      const h = fs.readFileSync(path.join(DIST, l, f), 'utf8'), slug = f.replace('.html', '');
      assert.ok(h.startsWith('<!DOCTYPE html>\n<html lang="' + l + '">'), l + '/' + f + ' lang');
      assert.ok(h.includes('<meta property="og:locale" content="' + (l === 'en' ? 'en_GB' : 'bg_BG') + '">'), 'og:locale');
      assert.ok(h.includes('<meta name="ok-radacina" content="../">'), 'ok-radacina');
      assert.ok(h.includes('href="../assets/css/site.css"') && h.includes('src="../assets/js/site.js"'), 'assets relative la rădăcină');
      assert.ok(!/\{\{[^}]*\}\}/.test(h), 'variabile nerezolvate');
      const canonical = 'https://restaurantok.com/' + l + '/' + (slug === 'index' ? '' : slug);
      assert.ok(h.includes('<link rel="canonical" href="' + canonical + '">'), 'canonical ' + canonical);
      for (const x of ['ro', 'en', 'bg']) assert.ok(h.includes('hreflang="' + x + '" href="https://restaurantok.com/' + (x === 'ro' ? '' : x + '/') + (slug === 'index' ? '' : slug) + '"'), 'hreflang ' + x);
      assert.ok(h.includes('hreflang="x-default" href="https://restaurantok.com/' + (slug === 'index' ? '' : slug) + '"'), 'x-default');
      assert.ok(h.includes('"inLanguage":"' + l + '"'), 'schema inLanguage');
      assert.ok(!/lorem ipsum/i.test(h));
    }
  });
  caz('pagina în română are hreflang doar unde există traducere și comutatorul pe toate paginile', () => {
    const idx = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'), sala = fs.readFileSync(path.join(DIST, 'sala-de-bal.html'), 'utf8');
    assert.ok(idx.includes('hreflang="en" href="https://restaurantok.com/en/"') && idx.includes('hreflang="x-default"'));
    assert.ok(!sala.includes('rel="alternate" hreflang'), 'sala-de-bal nu are traducere → fără hreflang');
    assert.ok(sala.includes('class="limbi"') && sala.includes('href="en/index.html" hreflang="en"'), 'comutatorul duce la acasă în engleză');
    assert.ok(idx.includes('<html lang="ro">') && idx.includes('<meta name="ok-radacina" content="">'));
  });
  caz('în meniul paginilor traduse, linkurile spre pagini doar în română poartă hreflang="ro" și duc la ../', () => {
    const h = fs.readFileSync(path.join(DIST, 'en', 'index.html'), 'utf8');
    assert.ok(h.includes('href="../cofetaria.html" hreflang="ro">Pastry shop</a>'));
    assert.ok(h.includes('href="gastro-pub.html">Gastro-pub</a>') && h.includes('href="contact.html">Contact</a>'));
    assert.ok(h.includes('href="../alergeni.html" hreflang="ro">Allergen information</a>'));
  });
  caz('sitemap.xml: paginile en/bg cu xhtml:link către toate variantele', () => {
    const sm = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
    assert.ok(sm.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'));
    for (const u of ['https://restaurantok.com/en/', 'https://restaurantok.com/bg/', 'https://restaurantok.com/en/gastro-pub', 'https://restaurantok.com/bg/contact']) assert.ok(sm.includes('<loc>' + u + '</loc>'), u);
    assert.ok(sm.includes('<loc>https://restaurantok.com/</loc><xhtml:link rel="alternate" hreflang="ro" href="https://restaurantok.com/"/><xhtml:link rel="alternate" hreflang="en" href="https://restaurantok.com/en/"/><xhtml:link rel="alternate" hreflang="bg" href="https://restaurantok.com/bg/"/>'));
    assert.ok(!/<xhtml:link[^>]*sala-de-bal/.test(sm), 'sala-de-bal fără alternative');
  });
  caz('fonturile chirilice sunt în dist/ și declarate în CSS', () => {
    assert.ok(fs.existsSync(path.join(DIST, 'assets', 'fonts', 'playfair-normal-cyrillic.woff2')) && fs.existsSync(path.join(DIST, 'assets', 'fonts', 'playfair-italic-cyrillic.woff2')));
    assert.ok(/playfair-normal-cyrillic\.woff2[\s\S]*unicode-range: U\+0301, U\+0400-045F/.test(fs.readFileSync(path.join(DIST, 'assets', 'css', 'site.css'), 'utf8')));
  });
}
console.log(n + ' cazuri trecute.');
