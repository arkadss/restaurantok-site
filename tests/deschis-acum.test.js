// Teste pentru componenta „deschis acum" (src/assets/js/site.js), fără dependențe:
//   node tests/deschis-acum.test.js
// Programul de test este un fixture propriu (cu orar peste miezul nopții, duminică închis și excepții), ca testele să nu depindă de
// programul real din data/program.json; la final se verifică și programul real (gastro-pub: 8:30–23:30, duminica de la 9:30).
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { stareDeschis } = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'site.js'));
const programReal = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'program.json'), 'utf8'));
const program = {
  fus_orar: 'Europe/Bucharest',
  unitati: {
    'gastro-pub': { nume: 'Gastro-pub OK', orar: { luni: [['10:00', '23:00']], marti: [['10:00', '23:00']], miercuri: [['10:00', '23:00']], joi: [['10:00', '23:00']], vineri: [['10:00', '01:00']], sambata: [['10:00', '01:00']], duminica: [['11:00', '22:00']] } },
    cofetaria: { nume: 'Cofetăria OK', orar: { luni: [['09:00', '20:00']], marti: [['09:00', '20:00']], miercuri: [['09:00', '20:00']], joi: [['09:00', '20:00']], vineri: [['09:00', '20:00']], sambata: [['09:00', '20:00']], duminica: [] } }
  },
  exceptii: [
    { data: '2026-12-25', unitate: 'gastro-pub', inchis: true, motiv: 'Crăciun' },
    { data: '2026-11-14', unitate: 'gastro-pub', orar: [['10:00', '16:00']], motiv: 'eveniment privat' }
  ]
};

// „2026-10-20 12:30 ora României" → Date (în octombrie e EEST, UTC+3; în decembrie EET, UTC+2)
function ro(iso, offset) { return new Date(iso + offset); }

let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }

console.log('deschis-acum:');

caz('deschis: marți 12:30 → deschis până la 23:00', () => {
  const s = stareDeschis(program, 'gastro-pub', ro('2026-10-20T12:30:00', '+03:00'));
  assert.equal(s.stare, 'deschis'); assert.equal(s.pana_la, '23:00'); assert.equal(s.mesaj, 'Deschis'); assert.equal(s.detaliu, 'până la 23:00');
});

caz('se închide curând: marți 22:35 → „Se închide în 25 min"', () => {
  const s = stareDeschis(program, 'gastro-pub', ro('2026-10-20T22:35:00', '+03:00'));
  assert.equal(s.stare, 'deschis'); assert.equal(s.minute_ramase, 25); assert.equal(s.mesaj, 'Se închide în 25 min');
});

caz('închis: marți 23:30 → deschide mâine la 10:00', () => {
  const s = stareDeschis(program, 'gastro-pub', ro('2026-10-20T23:30:00', '+03:00'));
  assert.equal(s.stare, 'inchis'); assert.equal(s.deschide.cand, 'mâine'); assert.equal(s.deschide.ora, '10:00'); assert.equal(s.detaliu, 'deschide mâine la 10:00');
});

caz('închis dimineața: marți 08:00 → deschide azi la 10:00', () => {
  const s = stareDeschis(program, 'gastro-pub', ro('2026-10-20T08:00:00', '+03:00'));
  assert.equal(s.stare, 'inchis'); assert.equal(s.deschide.cand, 'azi'); assert.equal(s.detaliu, 'deschide la 10:00');
});

caz('după miezul nopții: sâmbătă 00:30 (programul de vineri 10:00–01:00) → deschis până la 01:00', () => {
  const s = stareDeschis(program, 'gastro-pub', ro('2026-10-24T00:30:00', '+03:00'));
  assert.equal(s.stare, 'deschis'); assert.equal(s.pana_la, '01:00'); assert.equal(s.minute_ramase, 30);
});

caz('excepție închis: 25 decembrie 13:00 → „Închis azi (Crăciun)", deschide mâine', () => {
  const s = stareDeschis(program, 'gastro-pub', ro('2026-12-25T13:00:00', '+02:00'));
  assert.equal(s.stare, 'inchis'); assert.equal(s.mesaj, 'Închis azi'); assert.ok(/Crăciun/.test(s.detaliu)); assert.equal(s.deschide.cand, 'mâine');
});

caz('excepție orar special: sâmbătă 14 noiembrie 17:00 (10:00–16:00, eveniment privat) → închis, deschide mâine (duminică) 11:00', () => {
  const s = stareDeschis(program, 'gastro-pub', ro('2026-11-14T17:00:00', '+02:00'));
  assert.equal(s.stare, 'inchis'); assert.equal(s.deschide.cand, 'mâine'); assert.equal(s.deschide.ora, '11:00');
  const s2 = stareDeschis(program, 'gastro-pub', ro('2026-11-14T12:00:00', '+02:00'));
  assert.equal(s2.stare, 'deschis'); assert.equal(s2.pana_la, '16:00');
});

caz('excepția se aplică doar unității ei: cofetăria pe 25 decembrie (vineri) e după orarul normal', () => {
  const s = stareDeschis(program, 'cofetaria', ro('2026-12-25T13:00:00', '+02:00'));
  assert.equal(s.stare, 'deschis'); assert.equal(s.pana_la, '20:00');
});

caz('zi fără program: cofetăria duminică → închis, deschide mâine (luni) la 09:00', () => {
  const s = stareDeschis(program, 'cofetaria', ro('2026-10-25T12:00:00', '+02:00'));
  assert.equal(s.stare, 'inchis'); assert.equal(s.deschide.cand, 'mâine'); assert.equal(s.deschide.ora, '09:00');
  const s3 = stareDeschis(program, 'cofetaria', ro('2026-10-24T21:00:00', '+03:00')); // sâmbătă seara → luni
  assert.equal(s3.deschide.cand, 'luni');
});

caz('fus orar: 2026-10-20T21:30Z este 00:30 marți→miercuri la București → închis (marți se închide la 23:00)', () => {
  const s = stareDeschis(program, 'gastro-pub', new Date('2026-10-20T21:30:00Z'));
  assert.equal(s.stare, 'inchis');
});

caz('date lipsă / stricate → null, fără excepție', () => {
  assert.equal(stareDeschis(null, 'gastro-pub'), null);
  assert.equal(stareDeschis({}, 'gastro-pub'), null);
  assert.equal(stareDeschis({ unitati: {} }, 'gastro-pub'), null);
  assert.equal(stareDeschis({ unitati: { 'gastro-pub': { orar: { luni: [['zz', 1]] } } } }, 'gastro-pub').stare, 'inchis');
  assert.equal(stareDeschis(program, 'inexistent'), null);
});

caz('programul real: miercuri 12:00 → deschis până la 23:30; duminică 09:00 → închis, deschide la 09:30; 23:45 → închis, deschide mâine la 08:30', () => {
  assert.equal(stareDeschis(programReal, 'gastro-pub', ro('2026-10-21T12:00:00', '+03:00')).pana_la, '23:30');
  const d = stareDeschis(programReal, 'gastro-pub', ro('2026-10-25T09:00:00', '+03:00'));
  assert.equal(d.stare, 'inchis'); assert.equal(d.deschide.ora, '09:30'); assert.equal(d.deschide.cand, 'azi');
  const n2 = stareDeschis(programReal, 'gastro-pub', ro('2026-10-21T23:45:00', '+03:00'));
  assert.equal(n2.stare, 'inchis'); assert.equal(n2.detaliu, 'deschide mâine la 08:30');
  assert.ok(!programReal._exemplu && programReal.unitati.cofetaria._exemplu, 'cofetăria rămâne exemplu până vine programul ei');
});

console.log(`${n} cazuri trecute.`);
