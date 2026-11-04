// Teste pentru Catering (M3), fără dependențe:
//   node tests/catering.test.js
// - stareMeniuSaptamana: date bune / zile trecute (încheiat) / vechi (peste 14 zile) / lipsă / invalide, previzualizare
// - validareCerere (tip catering) + payloadCerere + textWhatsAppCerere + textConfirmare: aceleași reguli ca în n8n
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const OK = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'site.js'));
const exemplu = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'catering.json'), 'utf8'));

function ro(iso) { return new Date(iso + '+03:00'); }
let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }

console.log('catering — meniul săptămânii:');

caz('exemplul (actualizat 19 oct, 5 zile) văzut miercuri 21 oct → „ok" cu zilele rămase (21–23), 21 marcată „azi", preț 24 lei', () => {
  const s = OK.stareMeniuSaptamana(exemplu, ro('2026-10-21T10:00:00'));
  assert.equal(s.stare, 'ok'); assert.equal(s.azi, '2026-10-21');
  assert.deepEqual(s.zile.map(z => z.data), ['2026-10-21', '2026-10-22', '2026-10-23']);
  assert.equal(s.zile[0].azi, true); assert.equal(s.zile[1].azi, false);
  assert.equal(s.pret, 24); assert.equal(s.moneda, 'lei'); assert.equal(s.exemplu, true); assert.equal(s.previzualizare, false);
});

caz('toate zilele au trecut (sâmbătă 24 oct) → „incheiat"; pragul de 14 zile: 2 nov → „vechi"', () => {
  assert.equal(OK.stareMeniuSaptamana(exemplu, ro('2026-10-24T10:00:00')).stare, 'incheiat');
  assert.equal(OK.stareMeniuSaptamana(exemplu, ro('2026-11-01T10:00:00')).stare, 'incheiat'); // încă în prag, dar zilele au trecut
  assert.equal(OK.stareMeniuSaptamana(exemplu, ro('2026-11-03T10:00:00')).stare, 'vechi');
  const vechiDarZileViitoare = Object.assign({}, exemplu, { actualizat: '2026-09-01T08:00:00+03:00' });
  assert.equal(OK.stareMeniuSaptamana(vechiDarZileViitoare, ro('2026-10-21T10:00:00')).stare, 'vechi');
});

caz('previzualizare (?exemplu=1 + _exemplu) → „ok" cu toate zilele, marcat; fără _exemplu rămâne vechi/încheiat', () => {
  const s = OK.stareMeniuSaptamana(exemplu, ro('2026-12-01T10:00:00'), { previzualizare: true });
  assert.equal(s.stare, 'ok'); assert.equal(s.zile.length, 5); assert.equal(s.previzualizare, true);
  const real = Object.assign({}, exemplu); delete real._exemplu;
  assert.equal(OK.stareMeniuSaptamana(real, ro('2026-12-01T10:00:00'), { previzualizare: true }).stare, 'vechi');
});

caz('JSON lipsă / invalid / fără zile / cu zile stricate → „lipsa"; zilele invalide se ignoră, se sortează, max 7', () => {
  assert.equal(OK.stareMeniuSaptamana(null).stare, 'lipsa');
  assert.equal(OK.stareMeniuSaptamana('text').stare, 'lipsa');
  assert.equal(OK.stareMeniuSaptamana({ oferte: [] }).stare, 'lipsa');
  assert.equal(OK.stareMeniuSaptamana({ meniu_saptamana: { zile: [] } }).stare, 'lipsa');
  assert.equal(OK.stareMeniuSaptamana({ actualizat: new Date().toISOString(), meniu_saptamana: { zile: [{ data: 'luni', preparate: ['x'] }, { data: '2026-10-21', preparate: [] }, { data: '2026-10-22' }] } }).stare, 'lipsa');
  const zile = []; for (let i = 9; i >= 0; i--) zile.push({ data: '2026-11-' + (10 + i), preparate: ['  Ciorbă ', 42, ''] });
  const s = OK.stareMeniuSaptamana({ actualizat: '2026-11-09T08:00:00+02:00', meniu_saptamana: { zile } }, ro('2026-11-10T10:00:00'));
  assert.equal(s.stare, 'ok'); assert.equal(s.zile.length, 7); assert.equal(s.zile[0].data, '2026-11-10'); assert.deepEqual(s.zile[0].preparate, ['Ciorbă']); assert.equal(s.pret, null);
});

console.log('catering — formularul de comandă:');
const bun = { tip_comanda: 'pranz-birou', data_eveniment: '2026-11-02', persoane: '12', livrare: 'adresa', adresa: 'Str. Traian nr. 10, Calafat', ora: '12:30', nume: 'Firma Exemplu SRL', telefon: '0722 123 456', email: '', mesaj: 'Fără porc.', consimtamant: true, website: '' };

caz('comandă corectă → ok; payload după contract cu detalii { tip_comanda, livrare, adresa, ora }', () => {
  assert.equal(OK.validareCerere(bun, '2026-10-21', 'catering').ok, true);
  const p = OK.payloadCerere('catering', bun);
  assert.equal(p.tip, 'catering'); assert.equal(p.persoane, 12); assert.equal(p.data_eveniment, '2026-11-02'); assert.equal(p.website, '');
  assert.deepEqual(p.detalii, { tip_comanda: 'pranz-birou', tip_comanda_text: 'Prânz la birou', livrare: 'adresa', livrare_text: 'Livrare la adresă', adresa: 'Str. Traian nr. 10, Calafat', ora: '12:30' });
});

caz('formular gol → 7 erori (tip_comanda, adresa, data, persoane, nume, telefon, consimțământ); textele sunt în română', () => {
  const r = OK.validareCerere({}, '2026-10-21', 'catering');
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.erori).sort(), ['adresa', 'consimtamant', 'data_eveniment', 'nume', 'persoane', 'telefon', 'tip_comanda']);
  assert.ok(/Alege ce vrei să comanzi/.test(r.erori.tip_comanda));
});

caz('ridicare de la restaurant → adresa nu e obligatorie și nu pleacă în payload; oră greșită → eroare; data din trecut → eroare', () => {
  const r = OK.validareCerere(Object.assign({}, bun, { livrare: 'ridicare', adresa: '' }), '2026-10-21', 'catering');
  assert.equal(r.ok, true);
  assert.equal(OK.payloadCerere('catering', Object.assign({}, bun, { livrare: 'ridicare' })).detalii.adresa, '');
  assert.ok(OK.validareCerere(Object.assign({}, bun, { ora: '25:00' }), '2026-10-21', 'catering').erori.ora);
  assert.ok(OK.validareCerere(Object.assign({}, bun, { data_eveniment: '2026-10-20' }), '2026-10-21', 'catering').erori.data_eveniment);
  assert.ok(OK.validareCerere(Object.assign({}, bun, { persoane: '0', tip_comanda: 'pomana' }), '2026-10-21', 'catering').erori.persoane.indexOf('pachete') > 0);
});

caz('regulile pentru sala (M2) rămân neschimbate când tip lipsește', () => {
  const r = OK.validareCerere({}, '2026-10-21');
  assert.deepEqual(Object.keys(r.erori).sort(), ['consimtamant', 'data_eveniment', 'nume', 'persoane', 'telefon', 'tip_eveniment']);
});

caz('textul WhatsApp și confirmarea din pagină, pe fiecare tip de comandă', () => {
  const p = OK.payloadCerere('catering', bun);
  const wa = OK.textWhatsAppCerere(p);
  assert.ok(/^Bună! Aș vrea să comand catering/.test(wa) && /Comandă: Prânz la birou/.test(wa) && /De la: luni, 2 noiembrie, ora 12:30/.test(wa) && /Porții pe zi: 12/.test(wa) && /Livrare la: Str\. Traian/.test(wa) && /Detalii: Fără porc\./.test(wa));
  assert.ok(/ca să confirmăm prânzul la birou de luni, 2 noiembrie încolo, 12 porții pe zi, livrare la Str\. Traian nr\. 10, Calafat\. Mulțumim, Firma!/.test(OK.textConfirmare(p)));
  const pom = OK.payloadCerere('catering', Object.assign({}, bun, { tip_comanda: 'pomana', livrare: 'ridicare', persoane: '40', nume: 'Maria Ionescu' }));
  assert.ok(/Pachete: 40/.test(OK.textWhatsAppCerere(pom)) && /Ridic eu de la restaurant\./.test(OK.textWhatsAppCerere(pom)));
  assert.ok(/pachetele de pomană din luni, 2 noiembrie, 40 pachete, ridicare de la restaurant\. Mulțumim, Maria!/.test(OK.textConfirmare(pom)));
  const ev = OK.payloadCerere('catering', Object.assign({}, bun, { tip_comanda: 'eveniment', persoane: '80', ora: '' }));
  assert.ok(/Persoane: 80/.test(OK.textWhatsAppCerere(ev)) && /Data: luni, 2 noiembrie\n/.test(OK.textWhatsAppCerere(ev)));
  assert.ok(/cateringul din luni, 2 noiembrie, 80 persoane, livrare la/.test(OK.textConfirmare(ev)));
  // sala (M2) neschimbată
  const sala = OK.payloadCerere('sala', { tip_eveniment: 'nunta', data_eveniment: '2026-11-14', persoane: '120', nume: 'Ion Popescu', telefon: '0722123456' });
  assert.ok(/^Bună! Aș vrea o ofertă pentru Sala de bal OK\./.test(OK.textWhatsAppCerere(sala)));
  assert.ok(/cu o ofertă pentru nuntă \/ cununie din sâmbătă, 14 noiembrie, 120 persoane\. Mulțumim, Ion!/.test(OK.textConfirmare(sala)));
});

console.log(n + ' cazuri trecute.');
