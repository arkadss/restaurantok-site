// Teste pentru Cofetăria (M4), fără dependențe:
//   node tests/cofetaria.test.js
// - stareTorturi: catalog bun / lipsă / invalid / torturi stricate
// - validareCerere (tip tort) + payloadCerere cu poza-model + textWhatsAppCerere + textConfirmare
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const OK = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'site.js'));
const exemplu = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'torturi.json'), 'utf8'));

let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }

console.log('cofetăria — catalogul de torturi:');

caz('exemplul → „ok", 6 torturi, termen 3 zile, preț la cerere (null), per kg / bucată, termen propriu la nuntă și personalizat', () => {
  const s = OK.stareTorturi(exemplu);
  assert.equal(s.stare, 'ok'); assert.equal(s.torturi.length, 6); assert.equal(s.termen_minim_zile, 3); assert.equal(s.moneda, 'lei'); assert.equal(s.exemplu, true);
  assert.equal(s.torturi[0].id, 'diplomat'); assert.equal(s.torturi[0].pret_de_la, null); assert.equal(s.torturi[0].per, 'kg');
  assert.equal(s.torturi.find(t => t.id === 'prajituri').per, 'bucată');
  assert.equal(s.torturi.find(t => t.id === 'nunta').termen_minim_zile, 7); assert.equal(s.torturi.find(t => t.id === 'diplomat').termen_minim_zile, null);
  assert.deepEqual(s.torturi[1].alergeni, ['gluten', 'ou', 'lapte', 'soia']);
});

caz('JSON lipsă / invalid / fără torturi → „lipsa"; intrările stricate se ignoră, prețurile ≤ 0 devin „la cerere"', () => {
  assert.equal(OK.stareTorturi(null).stare, 'lipsa');
  assert.equal(OK.stareTorturi('x').stare, 'lipsa');
  assert.equal(OK.stareTorturi({ torturi: [] }).stare, 'lipsa');
  assert.equal(OK.stareTorturi({ torturi: [{ nume: 'fără id' }, { id: 'x' }, null] }).stare, 'lipsa');
  const s = OK.stareTorturi({ torturi: [{ id: 'a', nume: ' A ', pret_de_la: 0, per: 'altceva', alergeni: ['ou', 3, ''] }, { id: 'b', nume: 'B', pret_de_la: 120, per: 'bucata' }] });
  assert.equal(s.stare, 'ok'); assert.equal(s.torturi[0].nume, 'A'); assert.equal(s.torturi[0].pret_de_la, null); assert.equal(s.torturi[0].per, 'kg'); assert.deepEqual(s.torturi[0].alergeni, ['ou']);
  assert.equal(s.torturi[1].pret_de_la, 120); assert.equal(s.torturi[1].per, 'bucată'); assert.equal(s.termen_minim_zile, null); assert.equal(s.moneda, 'lei');
});

console.log('cofetăria — formularul de comandă:');
const bun = { tort: 'personalizat', data_eveniment: '2026-11-07', persoane: '12', mesaj: 'La mulți ani, Ana!', nume: 'Maria Ionescu', telefon: '0722 123 456', email: '', consimtamant: true, website: '' };
const poza = { nume: 'model.jpg', tip: 'image/jpeg', marime: 1234, base64: 'QUJD', latime: 800, inaltime: 600 };

caz('comandă corectă → ok; payload cu detalii { tort, tort_text, poza_model } (poza doar dacă există)', () => {
  assert.equal(OK.validareCerere(bun, '2026-10-21', 'tort').ok, true);
  const p = OK.payloadCerere('tort', bun, { poza });
  assert.equal(p.tip, 'tort'); assert.equal(p.persoane, 12);
  assert.deepEqual(p.detalii, { tort: 'personalizat', tort_text: 'Tort personalizat, după model', poza_model: { nume: 'model.jpg', tip: 'image/jpeg', marime: 1234, latime: 800, inaltime: 600, base64: 'QUJD' } });
  assert.equal(OK.payloadCerere('tort', bun).detalii.poza_model, null);
  assert.equal(OK.payloadCerere('tort', bun, { poza: { base64: '' } }).detalii.poza_model, null);
});

caz('formular gol → 6 erori (tort, data, persoane, nume, telefon, consimțământ); data din trecut → eroare', () => {
  const r = OK.validareCerere({}, '2026-10-21', 'tort');
  assert.deepEqual(Object.keys(r.erori).sort(), ['consimtamant', 'data_eveniment', 'nume', 'persoane', 'telefon', 'tort']);
  assert.ok(/Alege un tort/.test(r.erori.tort));
  assert.ok(OK.validareCerere(Object.assign({}, bun, { data_eveniment: '2026-10-20' }), '2026-10-21', 'tort').erori.data_eveniment);
});

caz('textul WhatsApp și confirmarea din pagină', () => {
  const p = OK.payloadCerere('tort', bun, { poza });
  const wa = OK.textWhatsAppCerere(p);
  assert.ok(/^Bună! Aș vrea să comand un tort de la Cofetăria OK\./.test(wa) && /Tort: Tort personalizat, după model/.test(wa) && /Pentru: sâmbătă, 7 noiembrie/.test(wa) && /Persoane: 12/.test(wa) && /Poza cu modelul o trimit aici/.test(wa) && /Detalii: La mulți ani, Ana!/.test(wa));
  assert.ok(!/Poza cu modelul/.test(OK.textWhatsAppCerere(OK.payloadCerere('tort', bun))));
  assert.ok(/ca să confirmăm tort personalizat, după model pentru sâmbătă, 7 noiembrie, 12 persoane, după modelul din poza trimisă\. Mulțumim, Maria!/.test(OK.textConfirmare(p)));
  assert.ok(/12 persoane\. Mulțumim, Maria!/.test(OK.textConfirmare(OK.payloadCerere('tort', bun))));
});

console.log(n + ' cazuri trecute.');
