// Teste pentru componenta „meniul zilei" (src/assets/js/site.js → stareMeniu, textWhatsApp), fără dependențe:
//   node tests/meniu-zilei.test.js
// JSON-ul de test este data/meniu-zilei.json (exemplu, datat 2026-10-19, valabil până la 16:00 ora României).
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { stareMeniu, textWhatsApp, dataLunga } = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'site.js'));
const exemplu = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'meniu-zilei.json'), 'utf8'));

function ro(iso, offset) { return new Date(iso + (offset || '+03:00')); }
let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }

console.log('meniul zilei:');

caz('date bune: 19 oct 12:00 → stare „azi", 3 preparate, preț 24 lei', () => {
  const s = stareMeniu(exemplu, ro('2026-10-19T12:00:00'));
  assert.equal(s.stare, 'azi'); assert.equal(s.meniu.preparate.length, 3); assert.equal(s.meniu.pret, 24); assert.equal(s.meniu.moneda, 'lei');
});

caz('după valabil_pana: 19 oct 16:00 → „incheiat" (fallback + notă)', () => {
  assert.equal(stareMeniu(exemplu, ro('2026-10-19T16:00:00')).stare, 'incheiat');
  assert.equal(stareMeniu(exemplu, ro('2026-10-19T15:59:00')).stare, 'azi');
});

caz('seara dinainte: 18 oct 19:00 → „maine" (textul vine seara, se afișează marcat pentru mâine)', () => {
  assert.equal(stareMeniu(exemplu, ro('2026-10-18T19:00:00')).stare, 'maine');
});

caz('date vechi: 21 oct → „vechi" (fallback)', () => {
  assert.equal(stareMeniu(exemplu, ro('2026-10-21T12:00:00')).stare, 'vechi');
});

caz('fus orar: 18 oct 22:30Z este 19 oct 01:30 la București → „azi"', () => {
  assert.equal(stareMeniu(exemplu, new Date('2026-10-18T22:30:00Z')).stare, 'azi');
});

caz('previzualizare: JSON _exemplu + ?exemplu=1 → „azi" indiferent de dată; fără _exemplu nu', () => {
  assert.equal(stareMeniu(exemplu, ro('2026-12-01T12:00:00'), { previzualizare: true }).stare, 'azi');
  const real = Object.assign({}, exemplu); delete real._exemplu;
  assert.equal(stareMeniu(real, ro('2026-12-01T12:00:00'), { previzualizare: true }).stare, 'vechi');
});

caz('date lipsă / stricate → „lipsa", fără excepție', () => {
  assert.equal(stareMeniu(null).stare, 'lipsa');
  assert.equal(stareMeniu({}).stare, 'lipsa');
  assert.equal(stareMeniu({ data: '2026-10-19', preparate: 'nu e listă' }).stare, 'lipsa');
  assert.equal(stareMeniu({ data: '2026-10-19', preparate: [] }).stare, 'lipsa');
  assert.equal(stareMeniu({ data: '2026-10-19', preparate: [{ nume: '' }, null] }).stare, 'lipsa');
});

caz('valabil_pana lipsă sau invalid → meniul rămâne valabil toată ziua', () => {
  const j = Object.assign({}, exemplu, { valabil_pana: 'cândva' });
  assert.equal(stareMeniu(j, ro('2026-10-19T20:00:00')).stare, 'azi');
  delete j.valabil_pana;
  assert.equal(stareMeniu(j, ro('2026-10-19T20:00:00')).stare, 'azi');
});

caz('preparatele invalide se filtrează, pozele non-text se ignoră', () => {
  const j = Object.assign({}, exemplu, { preparate: [{ nume: 'Ciorbă' }, { nume: 42 }, 'x'], poze: ['a.jpg', null, 7] });
  const s = stareMeniu(j, ro('2026-10-19T12:00:00'));
  assert.equal(s.meniu.preparate.length, 1); assert.deepEqual(s.meniu.poze, ['a.jpg']);
});

caz('textul WhatsApp: „Bună! Vreau 3 × meniul zilei de azi, 19 octombrie."', () => {
  assert.equal(textWhatsApp(3, 'azi', '2026-10-19'), 'Bună! Vreau 3 × meniul zilei de azi, 19 octombrie.');
  assert.equal(textWhatsApp('x', 'maine', '2026-10-20'), 'Bună! Vreau 1 × meniul zilei de mâine, 20 octombrie.');
  assert.equal(textWhatsApp(500, 'azi', '2026-10-19'), 'Bună! Vreau 99 × meniul zilei de azi, 19 octombrie.');
});

caz('data lungă în română: 2026-10-19 → „luni, 19 octombrie"', () => {
  assert.equal(dataLunga('2026-10-19'), 'luni, 19 octombrie');
  assert.equal(dataLunga('2026-12-25'), 'vineri, 25 decembrie');
  assert.equal(dataLunga('??'), '??');
});

console.log(`${n} cazuri trecute.`);
