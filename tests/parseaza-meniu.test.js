// Teste pentru parsarea textului de pe Telegram (n8n/cod/parseaza-meniu.js):
//   node tests/parseaza-meniu.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const { parseazaMeniu, textFacebook, alergeniExpliciti } = require(path.join(__dirname, '..', 'n8n', 'cod', 'parseaza-meniu.js'));

function ro(iso, offset) { return new Date(iso + (offset || '+03:00')); }
let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }
const seara = ro('2026-10-19T19:30:00'); // luni seara → meniul e pentru marți
const dimineata = ro('2026-10-20T09:00:00');

console.log('parsarea meniului:');

caz('postarea tipică de Facebook, pe un rând, cu preț și telefon', () => {
  const m = parseazaMeniu('Meniul zilei, 20 octombrie: ciorbă de perișoare, crap prăjit cu mămăligă și mujdei, salată de varză. 24 lei. Comenzi: 0785255855.', seara);
  assert.equal(m.eroare, undefined);
  assert.equal(m.data, '2026-10-20'); assert.equal(m.pret, 24); assert.equal(m.valabil_pana, '2026-10-20T16:00:00+03:00');
  assert.deepEqual(m.preparate.map(p => p.nume), ['Ciorbă de perișoare', 'Crap prăjit cu mămăligă și mujdei', 'Salată de varză']);
  assert.deepEqual(m.preparate.map(p => p.categorie), ['ciorbă', 'fel principal', 'garnitură']);
  assert.deepEqual(m.preparate[0].alergeni, ['gluten', 'ou', 'țelină']);
  assert.deepEqual(m.preparate[1].alergeni, ['pește']);
  assert.deepEqual(m.preparate[2].alergeni, []);
  assert.equal(m.preparate[0].alergeni_automat, true);
});

caz('câte un preparat pe rând, fără antet: seara → data de mâine', () => {
  const m = parseazaMeniu('Ciorbă de legume\nPui la cuptor cu cartofi\nMurături', seara);
  assert.equal(m.data, '2026-10-20'); assert.equal(m.data_explicita, false); assert.equal(m.preparate.length, 3);
  assert.equal(m.preparate[2].categorie, 'garnitură');
});

caz('dimineața fără dată → azi', () => {
  assert.equal(parseazaMeniu('Ciorbă de burtă, sarmale cu mămăligă, salată', dimineata).data, '2026-10-20');
});

caz('„mâine" și „azi" și zile ale săptămânii', () => {
  assert.equal(parseazaMeniu('Mâine: ciorbă de văcuță, tochitură cu mămăligă', dimineata).data, '2026-10-21');
  assert.equal(parseazaMeniu('Azi avem: ciorbă de văcuță, tochitură cu mămăligă', seara).data, '2026-10-19');
  assert.equal(parseazaMeniu('Meniul de joi: ciorbă de fasole, pulpe de pui cu orez', dimineata).data, '2026-10-22');
});

caz('data numerică 21.10 și anul la trecerea în ianuarie', () => {
  assert.equal(parseazaMeniu('21.10: ciorbă de fasole, pulpe de pui cu orez', dimineata).data, '2026-10-21');
  assert.equal(parseazaMeniu('Meniul zilei 3 ianuarie: ciorbă de fasole, pulpe de pui cu orez', ro('2026-12-31T19:00:00', '+02:00')).data, '2027-01-03');
});

caz('alergeni expliciți în paranteză înlocuiesc detectarea automată; „fără" → listă goală', () => {
  const m = parseazaMeniu('Ciorbă de perișoare (gluten, ou)\nȘnițel de pui cu piure (fără)\nSalată de varză', dimineata);
  assert.deepEqual(m.preparate[0].alergeni, ['gluten', 'ou']); assert.equal(m.preparate[0].alergeni_automat, undefined);
  assert.deepEqual(m.preparate[1].alergeni, []); assert.equal(m.preparate[1].nume, 'Șnițel de pui cu piure');
  assert.equal(m.preparate[2].alergeni_automat, true);
});

caz('o paranteză care nu e listă de alergeni rămâne în nume', () => {
  const m = parseazaMeniu('Ciorbă de pește (din Dunăre)\nSaramură de crap', dimineata);
  assert.equal(m.preparate[0].nume, 'Ciorbă de pește (din Dunăre)');
  assert.deepEqual(m.preparate[0].alergeni, ['pește', 'țelină']);
});

caz('preț diferit și categorii explicite „Desert:"', () => {
  const m = parseazaMeniu('Ciorbă: ciorbă rădăuțeană\nFel: pulpe de pui cu cartofi\nDesert: papanași\n27 lei', dimineata);
  assert.equal(m.pret, 27); assert.equal(m.preparate.length, 3);
  assert.equal(m.preparate[2].categorie, 'desert'); assert.equal(m.preparate[2].nume, 'Papanași');
  assert.deepEqual(m.preparate[2].alergeni, ['gluten', 'ou', 'lapte']);
});

caz('erori prietenoase: mesaj gol, prea multe preparate', () => {
  assert.ok(parseazaMeniu('', dimineata).eroare);
  assert.ok(parseazaMeniu('   \n ', dimineata).eroare);
  assert.ok(/cel mult 8/.test(parseazaMeniu('a1, b2, c3, d4, e5, f6, g7, h8, i9', dimineata).eroare));
});

caz('iarna valabil_pana are offset +02:00; ora de închidere configurabilă', () => {
  const m = parseazaMeniu('Ciorbă de legume, pui la cuptor', ro('2026-12-10T09:00:00', '+02:00'), { ora_inchidere: '15:30' });
  assert.equal(m.valabil_pana, '2026-12-10T15:30:00+02:00');
});

caz('textul pentru Facebook / confirmare', () => {
  const m = parseazaMeniu('Meniul zilei, 20 octombrie: ciorbă de perișoare, crap prăjit cu mămăligă și mujdei, salată de varză. 24 lei.', seara);
  assert.equal(textFacebook(m, '0785255855'), 'Meniul zilei, 20 octombrie: ciorbă de perișoare, crap prăjit cu mămăligă și mujdei, salată de varză. 24 lei. Comenzi: 0785255855.');
});

caz('alergeniExpliciti normalizează diacriticele și sinonimele', () => {
  assert.deepEqual(alergeniExpliciti('Gluten, oua, telina si lactoza'), ['gluten', 'ou', 'țelină', 'lapte']);
});

console.log(`${n} cazuri trecute.`);
