// Traducerile EN/BG ale meniului zilei (M8): glosarul local, nodul Code „Traduceri" (glosar / DeepL / nu) și
// integrarea în „Îmbină" (JSON-ul scris are `traduceri`; comenzile „en 2: …" / „bg 2: …" corectează):
//   node tests/traduceri.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const G = require('../n8n/cod/glosar-meniu.js');
const w = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'meniu-zilei.json'), 'utf8'));
const cod = n => w.nodes.find(x => x.name === n).parameters.jsCode;

const config = { github_owner: 'o', github_repo: 'r', telegram_chat_id: '12345', site_url: 'https://restaurantok.com', fus_orar: 'Europe/Bucharest', pret_implicit: 24, ora_inchidere: '16:00', telefon_afisat: '0785255855', traducere: 'glosar' };
function ruleaza(nume, inputJson, noduri) {
  const $ = n => ({ first: () => { if (!(n in noduri)) throw new Error(`Referenced node "${n}" is unexecuted`); return { json: noduri[n] }; } });
  const $input = { first: () => ({ json: inputJson }) };
  return new Function('$', '$input', 'Buffer', cod(nume))($, $input, Buffer);
}
const interpreteaza = (text) => ruleaza('Interpretează mesajul', { message: { chat: { id: 12345 }, text } }, { Config: config })[0].json;
const traduceri = (cmd, cfg, extra) => ruleaza('Traduceri', {}, Object.assign({ Config: cfg || config, 'Interpretează mesajul': cmd }, extra || {}))[0].json;
const imbina = (cmd, existent, extra) => ruleaza('Îmbină', existent ? { content: Buffer.from(JSON.stringify(existent)).toString('base64'), sha: 'x' } : { error: 'Not Found' }, Object.assign({ Config: config, 'Interpretează mesajul': cmd }, extra || {}));

let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }
console.log('traduceri EN/BG (M8):');

caz('glosar: cele trei preparate din exemplul data/meniu-zilei.json se traduc complet', () => {
  const ex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'meniu-zilei.json'), 'utf8'));
  const r = G.traduceMeniu(ex.preparate.map(p => p.nume));
  assert.deepEqual(r.en, ['Meatball sour soup', 'Fried carp with polenta and garlic sauce', 'Cabbage salad']);
  assert.deepEqual(r.bg, ['Супа топчета', 'Пържен шаран с качамак и чеснов сос', 'Зелева салата']);
  assert.deepEqual(r.complet, { en: true, bg: true }); assert.deepEqual(r.netraduse, []);
});

caz('glosar: compunere „X la cuptor cu Y", adjectiv acordat în BG, „și", fără diacritice, majuscule', () => {
  assert.deepEqual(G.preparat('Pui la cuptor cu cartofi'), { en: 'Oven-baked chicken with potatoes', bg: 'Пиле на фурна с картофи' });
  assert.deepEqual(G.preparat('PESTE PRAJIT CU CARTOFI'), { en: 'Fried fish with potatoes', bg: 'Пържена риба с картофи' });
  assert.deepEqual(G.preparat('Ceafă de porc la grătar cu cartofi prăjiți și salată'), { en: 'Grilled pork neck with french fries and salad', bg: 'Свински врат на скара с пържени картофи и салата' });
  assert.deepEqual(G.preparat('Pui cu smântână și mămăligă'), { en: 'Chicken with sour cream and polenta', bg: 'Пиле със сметана и качамак' }); // „със" înainte de с/з
  assert.deepEqual(G.preparat('Varză călită cu ciolan afumat.'), { en: 'Braised cabbage with smoked pork knuckle', bg: 'Задушено зеле с пушен джолан' });
});

caz('glosar: un cuvânt necunoscut → null (nu se inventează, nu se traduce pe jumătate)', () => {
  assert.equal(G.preparat('Ceva necunoscut'), null);
  assert.equal(G.preparat('Pui la cuptor cu garnitură misterioasă'), null);
  const r = G.traduceMeniu(['Ciorbă de burtă', 'Preparat inexistent']);
  assert.deepEqual(r.en, ['Tripe soup', null]); assert.deepEqual(r.netraduse, ['Preparat inexistent']); assert.equal(r.complet.en, false);
  assert.deepEqual(G.traduceMeniu([]), { en: [], bg: [], complet: { en: false, bg: false }, netraduse: [] });
});

const cmd = interpreteaza('Meniul zilei: ciorbă de perișoare, crap prăjit cu mămăligă și mujdei, salată de varză. 24 lei.');
assert.equal(cmd.actiune, 'meniu');

caz('nodul „Traduceri", modul glosar (implicit, fără internet): traduceri complete, sursa „glosar"', () => {
  const r = traduceri(cmd);
  assert.deepEqual(r.traduceri.en.preparate, ['Meatball sour soup', 'Fried carp with polenta and garlic sauce', 'Cabbage salad']);
  assert.equal(r.traduceri.bg.preparate.length, 3); assert.deepEqual(r.sursa, { en: 'glosar', bg: 'glosar' }); assert.deepEqual(r.netraduse, []);
  const r2 = traduceri(cmd, Object.assign({}, config, { traducere: undefined })); // lipsă → glosar
  assert.deepEqual(r2.sursa, { en: 'glosar', bg: 'glosar' });
});

caz('nodul „Traduceri", modul nu → traduceri null', () => {
  const r = traduceri(cmd, Object.assign({}, config, { traducere: 'nu' }));
  assert.equal(r.traduceri, null);
});

caz('nodul „Traduceri", modul deepl: răspunsurile DeepL au prioritate; la eroare DeepL cade pe glosar', () => {
  const cfg = Object.assign({}, config, { traducere: 'deepl' });
  const deepl = (texte) => ({ translations: texte.map(t => ({ detected_source_language: 'RO', text: t })) });
  const r = traduceri(cmd, cfg, { 'DeepL EN': deepl(['Meatball soup', 'Fried carp with polenta and garlic sauce', 'Cabbage salad']), 'DeepL BG': deepl(['Супа с кюфтенца', 'Пържен шаран с качамак и чесън', 'Салата от зеле']) });
  assert.equal(r.traduceri.en.preparate[0], 'Meatball soup'); assert.equal(r.traduceri.bg.preparate[0], 'Супа с кюфтенца');
  assert.deepEqual(r.sursa, { en: 'deepl', bg: 'deepl' });
  const r2 = traduceri(cmd, cfg, { 'DeepL EN': { error: { message: 'HTTP 403' } }, 'DeepL BG': { error: { message: 'HTTP 403' } } });
  assert.equal(r2.traduceri.en.preparate[0], 'Meatball sour soup'); assert.deepEqual(r2.sursa, { en: 'glosar', bg: 'glosar' });
  const r3 = traduceri(cmd, cfg, { 'DeepL EN': deepl(['', 'Fried carp with polenta', '']), 'DeepL BG': { translations: [] } }); // parțial → mixt
  assert.equal(r3.sursa.en, 'mixt'); assert.equal(r3.traduceri.en.preparate[1], 'Fried carp with polenta'); assert.equal(r3.traduceri.en.preparate[0], 'Meatball sour soup');
});

caz('nodul „Traduceri" nu rulează pe celelalte ramuri; „Îmbină" scrie JSON-ul fără traduceri și fără eroare', () => {
  const r = imbina(cmd, null)[0].json; // fără nodul „Traduceri" în mediu → $('Traduceri') aruncă, ca în n8n
  assert.equal(r.scrie, true); assert.equal(JSON.parse(r.continut).traduceri, undefined); assert.ok(!/🌐/.test(r.mesaj));
});

let scris;
caz('„Îmbină" cu „Traduceri": JSON-ul scris are traduceri.en/bg în aceeași ordine; confirmarea spune sursa', () => {
  const r = imbina(cmd, null, { Traduceri: traduceri(cmd) })[0].json;
  scris = JSON.parse(r.continut);
  assert.deepEqual(Object.keys(scris.traduceri).sort(), ['bg', 'en']);
  assert.equal(scris.traduceri.en.preparate.length, scris.preparate.length);
  assert.ok(/🌐 EN\/BG: tradus automat \(glosar\)/.test(r.mesaj));
  const rp = imbina(cmd, null, { Traduceri: traduceri(interpreteaza('Ciorbă de burtă, preparat necunoscut, salată verde')) })[0].json;
  assert.ok(/🌐 EN\/BG: parțial \(„Preparat necunoscut" rămâne în română\)/.test(rp.mesaj));
  const rn = imbina(cmd, null, { Traduceri: { traduceri: null, sursa: {}, netraduse: [] } })[0].json;
  assert.equal(JSON.parse(rn.continut).traduceri, undefined);
});

caz('„en 2: …" / „bg 1: …" corectează o traducere în JSON-ul existent, chiar fără traduceri anterioare', () => {
  const c = interpreteaza('en 2: Fried carp with polenta');
  assert.equal(c.actiune, 'traducere'); assert.equal(c.limba, 'en'); assert.equal(c.index, 1); assert.equal(c.traducere, 'Fried carp with polenta');
  const r = imbina(c, scris)[0].json;
  assert.equal(r.scrie, true); assert.ok(/✅ EN pentru „Crap prăjit/.test(r.mesaj));
  const j = JSON.parse(r.continut);
  assert.equal(j.traduceri.en.preparate[1], 'Fried carp with polenta'); assert.equal(j.traduceri.en.preparate[0], 'Meatball sour soup');
  const fara = Object.assign({}, scris); delete fara.traduceri;
  const j2 = JSON.parse(imbina(interpreteaza('BG 1 - Супа топчета'), fara)[0].json.continut);
  assert.deepEqual(j2.traduceri.bg.preparate, ['Супа топчета', null, null]);
  assert.ok(/Nu există preparatul 7/.test(imbina(interpreteaza('en 7: x'), scris)[0].json.mesaj));
});

caz('workflow-ul: ramura „meniu" trece prin „Traducem cu DeepL?" → DeepL EN → DeepL BG → „Traduceri" → „Citește JSON curent"; DeepL continuă la eroare', () => {
  const out = (from, i) => (w.connections[from].main[i] || []).map(x => x.node);
  assert.deepEqual(out('Ce facem?', 0), ['Traducem cu DeepL?']); assert.deepEqual(out('Ce facem?', 5), ['Citește JSON curent']);
  assert.deepEqual(out('Traducem cu DeepL?', 0), ['DeepL EN']); assert.deepEqual(out('Traducem cu DeepL?', 1), ['Traduceri']);
  assert.deepEqual(out('DeepL EN', 0), ['DeepL BG']); assert.deepEqual(out('DeepL BG', 0), ['Traduceri']); assert.deepEqual(out('Traduceri', 0), ['Citește JSON curent']);
  for (const nume of ['DeepL EN', 'DeepL BG']) {
    const nod = w.nodes.find(x => x.name === nume);
    assert.equal(nod.onError, 'continueRegularOutput'); assert.equal(nod.credentials.httpHeaderAuth.name, 'DeepL API key');
    assert.ok(!/DeepL-Auth-Key [^<]/.test(JSON.stringify(nod)), 'cheia nu stă în nod');
  }
  const cfgNod = w.nodes.find(x => x.name === 'Config').parameters.assignments.assignments;
  assert.equal(cfgNod.find(a => a.name === 'traducere').value, 'glosar');
  assert.equal(w.nodes.find(x => x.name === 'Ce facem?').parameters.rules.values.length, 7); // meniu, poza, gata, alergeni, ajutor, traducere, editare (M8)
});

console.log(`${n} cazuri trecute.`);
