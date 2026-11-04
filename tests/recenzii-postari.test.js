// Teste pentru recenzii Google + postări Facebook (M5), fără dependențe:
//   node tests/recenzii-postari.test.js
// - stareRecenzii: date bune / vechi (peste 30 zile) / lipsă / invalide, previzualizare, link „lasă o recenzie" doar dacă e real
// - starePostari: date bune / vechi (peste 14 zile) / lipsă / invalide, max 3, sortare
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const OK = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'site.js'));
const recenzii = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'recenzii.json'), 'utf8'));
const postari = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'postari.json'), 'utf8'));
function ro(iso) { return new Date(iso + '+03:00'); }
let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }

console.log('recenzii Google:');
caz('exemplul (actualizat 19 oct) văzut pe 21 oct → „ok": nota 4,5, 180 recenzii, 5 afișate, cea mai nouă prima; link real de recenzie din Place ID', () => {
  const s = OK.stareRecenzii(recenzii, ro('2026-10-21T12:00:00'));
  assert.equal(s.stare, 'ok'); assert.equal(s.rating, 4.5); assert.equal(s.numar, 180); assert.equal(s.recenzii.length, 5);
  assert.equal(s.recenzii[0].autor, 'Ana M.'); assert.equal(s.recenzii[0].data, '2026-10-02');
  assert.equal(s.url_recenzie_noua, 'https://search.google.com/local/writereview?placeid=ChIJh_Ql7G16U0cRS6gH1eRpkXQ'); assert.equal(s.url_google, 'https://www.google.com/maps/place/?q=place_id:ChIJh_Ql7G16U0cRS6gH1eRpkXQ'); assert.equal(s.previzualizare, false);
  assert.equal(OK.stareRecenzii(Object.assign({}, recenzii, { url_recenzie_noua: 'https://search.google.com/local/writereview?placeid=TODO' }), ro('2026-10-21T12:00:00')).url_recenzie_noua, ''); // un link cu TODO nu se folosește
});
caz('pragul de 30 de zile: 18 nov → „ok"; 19 nov → „vechi"; previzualizare + _exemplu → „ok" marcat', () => {
  assert.equal(OK.stareRecenzii(recenzii, ro('2026-11-18T05:00:00')).stare, 'ok');
  assert.equal(OK.stareRecenzii(recenzii, ro('2026-11-19T12:00:00')).stare, 'vechi');
  const p = OK.stareRecenzii(recenzii, ro('2027-01-01T12:00:00'), { previzualizare: true });
  assert.equal(p.stare, 'ok'); assert.equal(p.previzualizare, true);
});
caz('JSON lipsă / invalid / fără recenzii și fără notă → „lipsa"; recenziile stricate se ignoră; link real acceptat', () => {
  assert.equal(OK.stareRecenzii(null).stare, 'lipsa'); assert.equal(OK.stareRecenzii('x').stare, 'lipsa');
  assert.equal(OK.stareRecenzii({ actualizat: new Date().toISOString(), recenzii: [] }).stare, 'lipsa');
  const s = OK.stareRecenzii({ actualizat: new Date().toISOString(), rating: 4.26, numar: 12.4, url_recenzie_noua: 'https://search.google.com/local/writereview?placeid=ChIJx',
    recenzii: [{ autor: '', nota: 5, data: '2026-10-01', text: ' ok ' }, { nota: 0, text: 'notă 0' }, { nota: 4, text: '' }, { nota: 4.4, data: 'ieri', text: 'fără dată validă' }, null, { nota: 5, data: '2026-10-05', text: 'a' }, { nota: 5, data: '2026-10-04', text: 'b' }, { nota: 5, data: '2026-10-03', text: 'c' }, { nota: 5, data: '2026-10-02', text: 'd' }] }, new Date());
  assert.equal(s.stare, 'ok'); assert.equal(s.rating, 4.3); assert.equal(s.numar, 12); assert.equal(s.recenzii.length, 5);
  assert.equal(s.recenzii[0].data, '2026-10-05'); assert.equal(s.recenzii[4].autor, 'Client Google'); assert.equal(s.recenzii[4].data, '2026-10-01'); assert.equal(s.url_recenzie_noua, 'https://search.google.com/local/writereview?placeid=ChIJx');
  assert.equal(OK.stareRecenzii({ actualizat: new Date().toISOString(), rating: 4.1, recenzii: [] }).stare, 'ok'); // doar nota, fără texte
});

console.log('postări Facebook:');
caz('exemplul (actualizat 19 oct) văzut pe 21 oct → „ok": 3 postări, cea mai nouă prima, poza și linkul păstrate', () => {
  const s = OK.starePostari(postari, ro('2026-10-21T12:00:00'));
  assert.equal(s.stare, 'ok'); assert.equal(s.postari.length, 3); assert.equal(s.postari[0].id, '1'); assert.equal(s.postari[0].poza, 'data/poze/post-1.jpg'); assert.equal(s.postari[1].poza, '');
  assert.equal(s.url_pagina, 'https://www.facebook.com/OkCalafat');
});
caz('pragul de 14 zile: 2 nov → „ok"; 3 nov → „vechi"; lipsă / invalid / fără postări → „lipsa"; max 3 sortate; postările goale ignorate', () => {
  assert.equal(OK.starePostari(postari, ro('2026-11-02T05:00:00')).stare, 'ok');
  assert.equal(OK.starePostari(postari, ro('2026-11-03T12:00:00')).stare, 'vechi');
  assert.equal(OK.starePostari(null).stare, 'lipsa'); assert.equal(OK.starePostari({ postari: [{ text: '' }, null] }).stare, 'lipsa');
  const s = OK.starePostari({ actualizat: new Date().toISOString(), postari: [{ id: 'a', data: '2026-10-01T10:00:00Z', text: 'a' }, { id: 'd', data: '2026-10-04T10:00:00Z', text: 'd', url: 'ftp://nu' }, { id: 'b', data: '2026-10-02T10:00:00Z', text: 'b' }, { id: 'c', data: '2026-10-03T10:00:00Z', poza: 'x.jpg' }] }, new Date());
  assert.deepEqual(s.postari.map(p => p.id), ['d', 'c', 'b']); assert.equal(s.postari[0].url, ''); assert.equal(s.postari[1].text, '');
});

console.log(n + ' cazuri trecute.');
