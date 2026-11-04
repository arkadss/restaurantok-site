// Simulează nodul Code „Calculează disponibilitatea" din n8n/sala-disponibilitate.json cu evenimente Google Calendar false:
//   node tests/n8n-sala.test.js
// Verifică: zi întreagă → ocupat; eveniment lung → ocupat; eveniment scurt → parțial cu ora; peste miezul nopții; anulate/„liber" ignorate;
// calendar gol → fișier valid; JSON-ul produs trece de stareDisponibilitate din site.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const w = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'sala-disponibilitate.json'), 'utf8'));
const cod = w.nodes.find(x => x.name === 'Calculează disponibilitatea').parameters.jsCode;
const OK = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'site.js'));

const config = { calendar_id: 'x', github_owner: 'o', github_repo: 'r', telegram_chat_id: '1', orizont_zile: 365, ore_ocupat: 6, fus_orar: 'Europe/Bucharest' };
function ruleaza(evenimente, cfg) {
  const $ = () => ({ first: () => ({ json: cfg || config }) });
  const $input = { all: () => evenimente.map(e => ({ json: e })), first: () => ({ json: evenimente[0] || {} }) };
  return new Function('$', '$input', 'Buffer', cod)($, $input, Buffer)[0].json;
}
const aziRo = (d) => { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Date.now() + (d || 0) * 864e5)).forEach(x => { p[x.type] = x.value; }); return `${p.year}-${p.month}-${p.day}`; };
const offset = (zi) => { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', timeZoneName: 'longOffset' }).formatToParts(new Date(zi + 'T12:00:00Z')).forEach(x => { p[x.type] = x.value; }); return p.timeZoneName.replace('GMT', ''); };
const ora = (zi, hhmm) => ({ dateTime: `${zi}T${hhmm}:00${offset(zi)}` }); // offset-ul corect (vară +03:00 / iarnă +02:00), ca Google Calendar

let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }
console.log('n8n sala-disponibilitate (nodul Code):');

const z = (d) => aziRo(d);
const evenimente = [
  { summary: 'Nuntă Popescu', start: { date: z(10) }, end: { date: z(11) } },                                   // zi întreagă → ocupat
  { summary: 'Botez', start: ora(z(12), '13:00'), end: ora(z(12), '22:00') },                                    // 9 h → ocupat
  { summary: 'Ședință firmă', start: ora(z(14), '10:00'), end: ora(z(14), '13:00') },                            // 3 h → parțial
  { summary: 'Revelion', start: ora(z(16), '20:00'), end: ora(z(17), '04:00') },                                 // 8 h, peste miezul nopții → ambele zile ocupate
  { summary: 'Anulat', start: { date: z(20) }, end: { date: z(21) }, status: 'cancelled' },                      // ignorat
  { summary: 'Liber', start: ora(z(21), '10:00'), end: ora(z(21), '20:00'), transparency: 'transparent' },       // ignorat
  { summary: 'Trecut', start: { date: z(-3) }, end: { date: z(-2) } },                                           // în trecut → ignorat
  { summary: 'Cumetrie', start: ora(z(14), '18:00'), end: ora(z(14), '21:00') },                                 // a doua parțială în aceeași zi
  { summary: 'Expo 3 zile', start: { date: z(30) }, end: { date: z(33) } }                                       // zile întregi multiple
];

let r;
caz('evenimentele de test → 7 zile ocupate, 1 parțială, note cu ore; titlurile nu ajung în JSON', () => {
  r = ruleaza(evenimente);
  const j = JSON.parse(r.continut);
  assert.deepEqual(j.ocupat, [z(10), z(12), z(16), z(17), z(30), z(31), z(32)]);
  assert.deepEqual(j.partial, [{ data: z(14), nota: 'ocupat 10:00–13:00; ocupat 18:00–21:00' }]);
  assert.equal(r.ocupate, 7); assert.equal(r.partiale, 1);
  assert.ok(!/Popescu|Botez|Cumetrie/.test(r.continut));
  assert.ok(/^data: sala-disponibilitate\.json \d{4}-\d{2}-\d{2}$/.test(r.commit));
});

caz('JSON-ul produs respectă contractul (actualizat ISO cu offset, orizont, sursa) și e „ok" pentru site', () => {
  const j = JSON.parse(r.continut);
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(j.actualizat), j.actualizat);
  assert.equal(j.orizont_zile, 365); assert.equal(j.fus_orar, 'Europe/Bucharest'); assert.equal(j._exemplu, undefined);
  const s = OK.stareDisponibilitate(j, new Date());
  assert.equal(s.stare, 'ok'); assert.equal(s.zile[z(10)].stare, 'ocupat'); assert.equal(s.zile[z(14)].stare, 'partial');
});

caz('o zi și ocupată și parțială rămâne doar ocupată', () => {
  const j = JSON.parse(ruleaza([{ start: { date: z(5) }, end: { date: z(6) } }, { start: ora(z(5), '10:00'), end: ora(z(5), '12:00') }]).continut);
  assert.deepEqual(j.ocupat, [z(5)]); assert.deepEqual(j.partial, []);
});

caz('pragul ore_ocupat din Config: 3 ore cu ore_ocupat=3 → ocupat', () => {
  const j = JSON.parse(ruleaza([{ start: ora(z(14), '10:00'), end: ora(z(14), '13:00') }], Object.assign({}, config, { ore_ocupat: 3 })).continut);
  assert.deepEqual(j.ocupat, [z(14)]);
});

caz('calendar gol (itemul gol din alwaysOutputData) → fișier valid, liste goale', () => {
  const j = JSON.parse(ruleaza([{}]).continut);
  assert.deepEqual(j.ocupat, []); assert.deepEqual(j.partial, []); assert.ok(j.actualizat);
});

caz('evenimente peste orizont sunt ignorate; date stricate nu aruncă excepție', () => {
  const j = JSON.parse(ruleaza([{ start: { date: z(400) }, end: { date: z(401) } }, { start: { dateTime: 'nimic' }, end: { dateTime: 'nimic' } }]).continut);
  assert.deepEqual(j.ocupat, []); assert.deepEqual(j.partial, []);
});

caz('nodul GitHub trimite eroarea la Telegram (ieșirea 1), nu oprește workflow-ul', () => {
  const g = w.nodes.find(x => x.name === 'Scrie sala-disponibilitate.json');
  assert.equal(g.onError, 'continueErrorOutput');
  assert.equal(w.connections['Scrie sala-disponibilitate.json'].main[1][0].node, 'Anunță eroarea');
  assert.equal(w.connections['Scrie sala-disponibilitate.json'].main[0].length, 0);
});

console.log(n + ' cazuri trecute.');
