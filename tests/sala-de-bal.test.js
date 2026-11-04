// Teste pentru Sala de bal (M2), fără dependențe:
//   node tests/sala-de-bal.test.js
// - stareDisponibilitate: date bune / vechi (peste 7 zile) / lipsă / invalide, previzualizare
// - luniCalendar: 12 luni din luna curentă, prima zi a săptămânii, număr de zile
// - validareCerere + payloadCerere + textWhatsAppCerere: aceleași reguli ca în n8n
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const OK = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'site.js'));
const exemplu = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sala-disponibilitate.json'), 'utf8'));

function ro(iso) { return new Date(iso + '+03:00'); }
let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }

console.log('sala de bal — disponibilitate:');

caz('date bune (actualizat 19 oct, acum 20 oct) → „ok", 6 zile ocupate + 1 parțială', () => {
  const s = OK.stareDisponibilitate(exemplu, ro('2026-10-20T12:00:00'));
  assert.equal(s.stare, 'ok'); assert.equal(s.azi, '2026-10-20');
  assert.equal(Object.keys(s.zile).length, 7);
  assert.equal(s.zile['2026-11-14'].stare, 'ocupat'); assert.equal(s.zile['2026-11-28'].stare, 'partial'); assert.equal(s.zile['2026-11-28'].nota, 'ocupat seara');
  assert.equal(s.previzualizare, false);
});

caz('pragul de 7 zile: 26 oct → încă „ok"; 27 oct → „vechi"', () => {
  assert.equal(OK.stareDisponibilitate(exemplu, ro('2026-10-26T05:00:00')).stare, 'ok');
  assert.equal(OK.stareDisponibilitate(exemplu, ro('2026-10-27T12:00:00')).stare, 'vechi');
});

caz('vechi + ?exemplu=1 + _exemplu → „ok" marcat previzualizare; fără _exemplu rămâne „vechi"', () => {
  const s = OK.stareDisponibilitate(exemplu, ro('2026-12-01T12:00:00'), { previzualizare: true });
  assert.equal(s.stare, 'ok'); assert.equal(s.previzualizare, true);
  const real = Object.assign({}, exemplu); delete real._exemplu;
  assert.equal(OK.stareDisponibilitate(real, ro('2026-12-01T12:00:00'), { previzualizare: true }).stare, 'vechi');
});

caz('actualizat lipsă sau invalid → „vechi"; JSON lipsă / fără liste → „lipsa"', () => {
  assert.equal(OK.stareDisponibilitate({ ocupat: [] }, ro('2026-10-20T12:00:00')).stare, 'vechi');
  assert.equal(OK.stareDisponibilitate({ ocupat: [], actualizat: 'ieri' }, ro('2026-10-20T12:00:00')).stare, 'vechi');
  assert.equal(OK.stareDisponibilitate(null).stare, 'lipsa');
  assert.equal(OK.stareDisponibilitate('text').stare, 'lipsa');
  assert.equal(OK.stareDisponibilitate({ actualizat: '2026-10-20T06:00:00+03:00' }).stare, 'lipsa');
});

caz('zile invalide se ignoră; o zi și ocupată și parțială rămâne ocupată', () => {
  const s = OK.stareDisponibilitate({ actualizat: new Date().toISOString(), ocupat: ['2026-11-14', 'mâine', 42, '2026-13-99'], partial: [{ data: '2026-11-14', nota: 'x' }, { nota: 'fără dată' }, '2026-11-15'] }, new Date());
  assert.equal(s.stare, 'ok');
  assert.deepEqual(Object.keys(s.zile).sort(), ['2026-11-14', '2026-11-15']);
  assert.equal(s.zile['2026-11-14'].stare, 'ocupat'); assert.equal(s.zile['2026-11-15'].stare, 'partial');
});

caz('luniCalendar: 12 luni din octombrie 2026, cu trecere peste an; 1 nov 2026 e duminică (index 6); februarie 2027 are 28 de zile', () => {
  const l = OK.luniCalendar('2026-10-20');
  assert.equal(l.length, 12); assert.equal(l[0].titlu, 'Octombrie 2026'); assert.equal(l[11].titlu, 'Septembrie 2027');
  assert.equal(l[1].cheie, '2026-11'); assert.equal(l[1].primaZi, 6); assert.equal(l[4].zile, 28); assert.equal(l[0].zile, 31);
  assert.deepEqual(OK.luniCalendar('nimic'), []);
});

console.log('sala de bal — formularul de cerere:');
const bun = { tip_eveniment: 'nunta', data_eveniment: '2027-06-12', persoane: '120', nume: 'Ion Popescu', telefon: '0722 123 456', email: '', mesaj: 'Ora 18', consimtamant: true, website: '' };

caz('cerere completă → ok; payload după contractul din PLAN.md', () => {
  assert.equal(OK.validareCerere(bun, '2026-10-20').ok, true);
  const p = OK.payloadCerere('sala', bun);
  assert.equal(p.tip, 'sala'); assert.equal(p.persoane, 120); assert.equal(p.telefon, '0722 123 456'); assert.equal(p.consimtamant, true); assert.equal(p.website, '');
  assert.equal(p.detalii.tip_eveniment, 'nunta'); assert.equal(p.detalii.tip_eveniment_text, 'Nuntă / cununie');
  assert.deepEqual(Object.keys(p).sort(), ['consimtamant', 'data_eveniment', 'detalii', 'email', 'mesaj', 'nume', 'pagina', 'persoane', 'telefon', 'tip', 'website']);
});

caz('formular gol → 6 erori (tip, dată, persoane, nume, telefon, consimțământ)', () => {
  const r = OK.validareCerere({}, '2026-10-20');
  assert.equal(r.ok, false); assert.equal(Object.keys(r.erori).length, 6);
});

caz('data din trecut → eroare; data de azi → ok', () => {
  assert.ok(OK.validareCerere(Object.assign({}, bun, { data_eveniment: '2026-10-19' }), '2026-10-20').erori.data_eveniment);
  assert.equal(OK.validareCerere(Object.assign({}, bun, { data_eveniment: '2026-10-20' }), '2026-10-20').ok, true);
});

caz('telefon: 07xx, +40 7xx, 0251 (fix) acceptate; „abc" și 5 cifre respinse', () => {
  ['0722123456', '+40 722 123 456', '0040722123456', '0251-123-456', '0722.123.456'].forEach(t => assert.equal(OK.validareCerere(Object.assign({}, bun, { telefon: t }), '2026-10-20').ok, true, t));
  ['abc', '12345', '0122123456'].forEach(t => assert.ok(OK.validareCerere(Object.assign({}, bun, { telefon: t }), '2026-10-20').erori.telefon, t));
});

caz('email opțional, dar dacă e scris trebuie să fie valid; persoane 0 sau 1000 → eroare', () => {
  assert.ok(OK.validareCerere(Object.assign({}, bun, { email: 'ion@' }), '2026-10-20').erori.email);
  assert.equal(OK.validareCerere(Object.assign({}, bun, { email: 'ion@exemplu.ro' }), '2026-10-20').ok, true);
  assert.ok(OK.validareCerere(Object.assign({}, bun, { persoane: '0' }), '2026-10-20').erori.persoane);
  assert.ok(OK.validareCerere(Object.assign({}, bun, { persoane: '1000' }), '2026-10-20').erori.persoane);
});

caz('textul pentru WhatsApp conține evenimentul, data în română, persoanele și numele', () => {
  const t = OK.textWhatsAppCerere(OK.payloadCerere('sala', bun));
  assert.ok(t.startsWith('Bună! Aș vrea o ofertă pentru Sala de bal OK.'));
  assert.ok(/Eveniment: Nuntă \/ cununie/.test(t) && /Data: sâmbătă, 12 iunie/.test(t) && /Persoane: 120/.test(t) && /Nume: Ion Popescu/.test(t) && /Detalii: Ora 18/.test(t));
});

console.log(n + ' cazuri trecute.');
