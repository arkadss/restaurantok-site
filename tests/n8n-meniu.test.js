// Simulează nodurile Code din n8n/meniu-zilei.json (Interpretează mesajul → Îmbină) cu un mediu n8n fals:
//   node tests/n8n-meniu.test.js
// Verifică: text de meniu → JSON scris; poză → adăugată la JSON-ul existent; „gata" → valabil_pana trecut;
// „alergeni N:" → corecție; trigger 16:00 fără meniu → nimic; mesaj greșit → ajutor cu eroare; alt chat → ignorat.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const w = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'meniu-zilei.json'), 'utf8'));
const cod = n => w.nodes.find(x => x.name === n).parameters.jsCode;

const config = { github_owner: 'o', github_repo: 'r', telegram_chat_id: '12345', site_url: 'https://restaurantok.com', fus_orar: 'Europe/Bucharest', pret_implicit: 24, ora_inchidere: '16:00', telefon_afisat: '0785255855' };
function ruleaza(nume, inputJson, noduri) { // execută codul unui nod Code cu $ / $input false
  const $ = n => ({ first: () => ({ json: noduri[n] }) });
  const $input = { first: () => ({ json: inputJson }) };
  return new Function('$', '$input', 'Buffer', cod(nume))($, $input, Buffer);
}
const interpreteaza = (update) => ruleaza('Interpretează mesajul', update, { Config: config })[0].json;
const imbina = (cmd, existent) => ruleaza('Îmbină', existent ? { content: Buffer.from(JSON.stringify(existent)).toString('base64'), sha: 'x' } : { error: 'Not Found' }, { Config: config, 'Interpretează mesajul': cmd });
const mesaj = (text, extra) => ({ message: Object.assign({ chat: { id: 12345 }, text }, extra || {}) });
const esteSorin = w.nodes.find(n => n.name === 'Este Sorin?').parameters.conditions.conditions[0].leftValue;

let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }
console.log('n8n meniu-zilei (noduri Code):');

let scris;
caz('text de meniu → actiune „meniu", JSON complet scris, confirmare cu alergeni', () => {
  const cmd = interpreteaza(mesaj('Meniul zilei: ciorbă de perișoare, crap prăjit cu mămăligă și mujdei, salată de varză. 24 lei.'));
  assert.equal(cmd.actiune, 'meniu'); assert.equal(cmd.chat_id, '12345'); assert.ok(cmd.meniu.text_facebook.startsWith('Meniul zilei, '));
  const r = imbina(cmd, null)[0].json;
  assert.equal(r.scrie, true); assert.equal(r.are_poza, false);
  scris = JSON.parse(r.continut);
  assert.equal(scris.preparate.length, 3); assert.deepEqual(scris.poze, []); assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(scris.actualizat));
  assert.ok(/^data: meniu-zilei\.json \d{4}-\d{2}-\d{2}$/.test(r.commit));
  assert.ok(/✅ Meniul pentru/.test(r.mesaj) && /gluten, ou, țelină/.test(r.mesaj));
  assert.equal(scris._exemplu, undefined);
});

caz('același meniu retrimis păstrează pozele deja urcate', () => {
  const cmd = interpreteaza(mesaj('Ciorbă de perișoare, crap prăjit, salată'));
  const existent = Object.assign({}, scris, { poze: ['data/poze/' + scris.data + '-1.jpg'] });
  const r = JSON.parse(imbina(cmd, existent)[0].json.continut);
  assert.deepEqual(r.poze, existent.poze);
});

caz('poză → se adaugă data/poze/<data>-N.jpg la JSON-ul existent; fără meniu → avertisment, fără scriere', () => {
  const cmd = interpreteaza(mesaj(undefined, { photo: [{ file_id: 'mic' }, { file_id: 'mare' }], caption: '' }));
  assert.equal(cmd.actiune, 'poza'); assert.equal(cmd.file_id, 'mare');
  const r = imbina(cmd, scris)[0].json;
  assert.equal(r.scrie, true); assert.equal(r.are_poza, true); assert.equal(r.cale_poza, 'data/poze/' + scris.data + '-1.jpg');
  assert.deepEqual(JSON.parse(r.continut).poze, [r.cale_poza]);
  const r2 = imbina(cmd, null)[0].json;
  assert.equal(r2.scrie, false); assert.ok(/întâi textul/.test(r2.mesaj));
});

caz('„gata" → valabil_pana devine acum; a doua oară „era deja închis"', () => {
  const cmd = interpreteaza(mesaj('gata'));
  assert.equal(cmd.actiune, 'gata');
  const viitor = Object.assign({}, scris, { valabil_pana: new Date(Date.now() + 3600e3).toISOString() });
  const r = imbina(cmd, viitor)[0].json;
  assert.equal(r.scrie, true); assert.ok(Date.parse(JSON.parse(r.continut).valabil_pana) <= Date.now() + 1000);
  const r2 = imbina(cmd, JSON.parse(r.continut))[0].json;
  assert.equal(r2.scrie, false); assert.ok(/deja închis/.test(r2.mesaj));
});

caz('trigger 16:00 (fără message): meniu deja închis → niciun item; meniu deschis → închis + mesaj', () => {
  const cmd = interpreteaza({ timestamp: '2026-10-20T13:00:00.000Z' });
  assert.equal(cmd.actiune, 'gata'); assert.equal(cmd.sursa, 'program'); assert.equal(cmd.chat_id, '12345');
  assert.deepEqual(imbina(cmd, null), []);
  assert.deepEqual(imbina(cmd, Object.assign({}, scris, { valabil_pana: '2020-01-01T16:00:00+02:00' })), []);
  const r = imbina(cmd, Object.assign({}, scris, { valabil_pana: new Date(Date.now() + 3600e3).toISOString() }))[0].json;
  assert.equal(r.scrie, true); assert.ok(/închis automat/.test(r.mesaj));
});

caz('„alergeni 2: gluten, lapte" → corectează preparatul 2 și scoate marcajul automat', () => {
  const cmd = interpreteaza(mesaj('alergeni 2: gluten, lapte'));
  assert.equal(cmd.actiune, 'alergeni'); assert.equal(cmd.index, 1); assert.deepEqual(cmd.alergeni, ['gluten', 'lapte']);
  const r = JSON.parse(imbina(cmd, scris)[0].json.continut);
  assert.deepEqual(r.preparate[1].alergeni, ['gluten', 'lapte']); assert.equal(r.preparate[1].alergeni_automat, undefined);
  assert.ok(/Nu există preparatul 9/.test(imbina(interpreteaza(mesaj('alergeni 9: ou')), scris)[0].json.mesaj));
});

caz('„/start", „?" și un mesaj neînțeles → ajutor (cu eroare când e cazul)', () => {
  assert.equal(interpreteaza(mesaj('/start')).actiune, 'ajutor');
  assert.equal(interpreteaza(mesaj('?')).actiune, 'ajutor');
  const c = interpreteaza(mesaj('a, b, c, d, e, f, g, h, i'));
  assert.equal(c.actiune, 'ajutor'); assert.ok(/cel mult 8/.test(c.eroare));
});

caz('condiția „Este Sorin?" lasă să treacă doar chat-ul configurat și trigger-ul de la 16:00', () => {
  const ev = (json) => new Function('$json', '$', 'return ' + esteSorin.replace(/^=\{\{|\}\}$/g, ''))(json, n => ({ first: () => ({ json: config }) }));
  assert.equal(ev({ message: { chat: { id: 12345 } } }), true);
  assert.equal(ev({ message: { chat: { id: 999 } } }), false);
  assert.equal(ev({ timestamp: 'x' }), true);
});

caz('JSON-ul scris respectă contractul din PLAN.md (câmpurile obligatorii)', () => {
  for (const k of ['actualizat', 'data', 'valabil_pana', 'pret', 'moneda', 'preparate', 'poze']) assert.ok(k in scris, k);
  scris.preparate.forEach(p => { assert.ok(p.categorie && p.nume && Array.isArray(p.alergeni)); });
});

console.log(`${n} cazuri trecute.`);
