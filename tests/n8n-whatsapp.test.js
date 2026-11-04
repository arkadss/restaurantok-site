// Simulează nodul Code „Pregătește WhatsApp" din n8n/site-cerere.json (M8) cu un mediu n8n fals, pornind de la ieșirea reală a nodului
// „Validează cererea" pentru cereri de sală, catering (prânz / pomană) și tort:
//   node tests/n8n-whatsapp.test.js
// Verifică: oprit implicit (Config.whatsapp = nu) sau placeholder → un item { sari } (fluxul continuă spre Postgres, fără POST);
// „sorin" → un mesaj-șablon către Sorin cu 6 parametri curățați; „sorin+client" → și confirmarea către client cu 4 parametri;
// numerele în format internațional fără „+"; parametrii fără rânduri noi / spații multe / goi; structura ramurii în workflow.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const w = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'site-cerere.json'), 'utf8'));
const nodul = n => w.nodes.find(x => x.name === n);
const cod = n => nodul(n).parameters.jsCode;

const config = { site_token: 'secret-test', telegram_chat_id: '12345', email_expeditor: 'contact@restaurantok.com', email_copie: 'contact@restaurantok.com', origine_permisa: 'https://restaurantok.com', site_url: 'https://restaurantok.com', telefon_afisat: '0785255855', adresa_afisata: 'Str. A.I. Cuza nr. 26, Calafat, Dolj', fus_orar: 'Europe/Bucharest',
  whatsapp: 'nu', whatsapp_phone_number_id: '<<TODO: Phone number ID>>', whatsapp_sorin: '<<TODO: numărul lui Sorin>>', whatsapp_sablon_sorin: 'cerere_noua', whatsapp_sablon_client: 'confirmare_cerere', whatsapp_limba: 'ro', whatsapp_api_url: 'https://graph.facebook.com/v21.0' };
function ruleaza(nume, inputJson, noduri) {
  const $ = n => ({ first: () => ({ json: noduri[n] }) });
  const $input = { first: () => ({ json: inputJson }), all: () => [{ json: inputJson }] };
  return new Function('$', '$input', 'Buffer', cod(nume))($, $input, Buffer);
}
const aziRo = (d) => { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Date.now() + (d || 0) * 864e5)).forEach(x => { p[x.type] = x.value; }); return `${p.year}-${p.month}-${p.day}`; };
const payload = (extra) => Object.assign({ tip: 'sala', nume: 'Ion  Popescu', telefon: '0722 123 456', email: 'ion@exemplu.ro', data_eveniment: aziRo(60), persoane: 120, mesaj: 'Ora 18,\nmeniu cu pește.', detalii: { tip_eveniment: 'nunta', tip_eveniment_text: 'Nuntă / cununie', sala: 'sala-de-bal' }, consimtamant: true, website: '', pagina: '/sala-de-bal' }, extra || {});
const valideaza = (body, cfg) => ruleaza('Validează cererea', { headers: { 'x-site-token': 'secret-test', 'user-agent': 'test' }, body }, { Config: cfg || config })[0].json;
const whatsapp = (validat, cfgExtra) => ruleaza('Pregătește WhatsApp', {}, { Config: Object.assign({}, config, cfgExtra || {}), 'Validează cererea': validat });
const activ = { whatsapp: 'sorin', whatsapp_phone_number_id: '123456789012345', whatsapp_sorin: '+40 785 255 855' };
const parametri = m => m.json.body.template.components[0].parameters.map(p => p.text);

let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }
console.log('n8n site-cerere · WhatsApp Business (M8):');

const sala = valideaza(payload());
assert.equal(sala.ok, true);

caz('implicit (Config.whatsapp = nu) → un singur item { sari: true }, niciun mesaj', () => {
  const r = whatsapp(sala);
  assert.equal(r.length, 1); assert.equal(r[0].json.sari, true); assert.ok(/dezactivat/.test(r[0].json.motiv));
});

caz('whatsapp = sorin, dar Phone number ID încă placeholder → { sari } (nu se încearcă niciun POST)', () => {
  const r = whatsapp(sala, { whatsapp: 'sorin' });
  assert.equal(r.length, 1); assert.equal(r[0].json.sari, true); assert.ok(/placeholder/.test(r[0].json.motiv));
});

caz('whatsapp = sorin, număr Sorin lipsă/invalid → { sari } cu motivul', () => {
  const r = whatsapp(sala, Object.assign({}, activ, { whatsapp_sorin: 'abc' }));
  assert.equal(r.length, 1); assert.equal(r[0].json.sari, true); assert.ok(/destinatar/.test(r[0].json.motiv));
});

let s;
caz('whatsapp = sorin → exact un mesaj-șablon „cerere_noua" către Sorin, URL-ul Cloud API cu Phone number ID, număr fără +', () => {
  const r = whatsapp(sala, activ);
  assert.equal(r.length, 1); s = r[0].json;
  assert.equal(s.catre, 'sorin'); assert.equal(s.to, '40785255855'); assert.equal(s.sablon, 'cerere_noua');
  assert.equal(s.url, 'https://graph.facebook.com/v21.0/123456789012345/messages');
  assert.equal(s.body.messaging_product, 'whatsapp'); assert.equal(s.body.to, '40785255855'); assert.equal(s.body.type, 'template');
  assert.equal(s.body.template.name, 'cerere_noua'); assert.deepEqual(s.body.template.language, { code: 'ro' });
});

caz('cei 6 parametri: cerere nouă, ce (Sala de bal — Nuntă / cununie, sala), nume, telefon, când + persoane, id', () => {
  const p = parametri({ json: s });
  assert.equal(p.length, 6);
  assert.equal(p[0], 'cerere nouă');
  assert.ok(/^Sala de bal — Nuntă \/ cununie \(Sala de bal OK\)$/.test(p[1]), p[1]);
  assert.equal(p[2], 'Ion Popescu'); // spațiile duble din nume sunt reduse la unul
  assert.equal(p[3], '0722 123 456');
  assert.ok(/, \d{1,2} [a-zăâî]+ \d{4}, 120 persoane$/.test(p[4]), p[4]);
  assert.equal(p[5], sala.id);
  assert.ok(p.every(t => t && !/[\r\n\t]/.test(t) && !/ {4,}/.test(t)), 'parametrii nu au rânduri noi, taburi sau 4+ spații și nu sunt goi');
});

caz('whatsapp = sorin+client → al doilea mesaj „confirmare_cerere" către client, cu prenume, ce am primit, id, telefon', () => {
  const r = whatsapp(sala, Object.assign({}, activ, { whatsapp: 'sorin+client' }));
  assert.equal(r.length, 2);
  const cl = r[1].json;
  assert.equal(cl.catre, 'client'); assert.equal(cl.to, '40722123456'); assert.equal(cl.body.template.name, 'confirmare_cerere');
  const p = parametri(r[1]);
  assert.equal(p.length, 4); assert.equal(p[0], 'Ion'); assert.ok(/^cererea ta de ofertă pentru Sala de bal OK, /.test(p[1]), p[1]); assert.equal(p[2], sala.id); assert.equal(p[3], '0722 123 456');
});

caz('clientul cu același număr ca Sorin (test de pe telefonul lui) primește un singur mesaj', () => {
  const v = valideaza(payload({ telefon: '0785255855' }));
  const r = whatsapp(v, Object.assign({}, activ, { whatsapp: 'sorin+client' }));
  assert.equal(r.length, 1); assert.equal(r[0].json.catre, 'sorin');
});

caz('catering prânz la birou: „comandă nouă", tipul comenzii + livrarea, „de <data>, ora", porții pe zi; confirmarea clientului vorbește de prânz', () => {
  const v = valideaza(payload({ tip: 'catering', persoane: 15, detalii: { tip_comanda: 'pranz-birou', livrare: 'adresa', adresa: 'Str. Tudor Vladimirescu 10, Calafat', ora: '12:30' }, pagina: '/catering' }));
  assert.equal(v.ok, true, JSON.stringify(v.raspuns));
  const r = whatsapp(v, Object.assign({}, activ, { whatsapp: 'sorin+client' }));
  const p = parametri(r[0]);
  assert.equal(p[0], 'comandă nouă'); assert.equal(p[1], 'Catering — Prânz la birou, livrare la Str. Tudor Vladimirescu 10, Calafat');
  assert.ok(/^de [a-zăâî]+, \d{1,2} [a-zăâî]+ \d{4}, ora 12:30, 15 porții pe zi$/.test(p[4]), p[4]);
  assert.ok(/^comanda ta de prânz la birou, de .* încolo$/.test(parametri(r[1])[1]), parametri(r[1])[1]);
});

caz('catering pomană cu ridicare: „pachete", „ridicare"; condoleanțele rămân în email, șablonul WhatsApp e neutru', () => {
  const v = valideaza(payload({ tip: 'catering', persoane: 40, detalii: { tip_comanda: 'pomana', livrare: 'ridicare' }, pagina: '/catering' }));
  assert.equal(v.ok, true);
  const r = whatsapp(v, Object.assign({}, activ, { whatsapp: 'sorin+client' }));
  assert.equal(parametri(r[0])[1], 'Catering — Pachete pentru pomană / parastas, ridicare');
  assert.ok(/40 pachete$/.test(parametri(r[0])[4]));
  assert.ok(/^comanda ta de pachete pentru pomană \/ parastas, /.test(parametri(r[1])[1]));
});

caz('tort cu poză-model: „Tort — <nume>, cu poză-model", „pentru <data>"; confirmarea clientului numește tortul', () => {
  const v = valideaza(payload({ tip: 'tort', persoane: 12, detalii: { tort: 'diplomat', tort_text: 'Tort diplomat', poza_model: { nume: 'model.jpg', tip: 'image/jpeg', base64: Buffer.from('poza').toString('base64'), latime: 800, inaltime: 600 } }, pagina: '/cofetaria' }));
  assert.equal(v.ok, true, JSON.stringify(v.raspuns));
  const r = whatsapp(v, Object.assign({}, activ, { whatsapp: 'sorin+client' }));
  assert.equal(parametri(r[0])[1], 'Tort — Tort diplomat, cu poză-model');
  assert.ok(/^pentru [a-zăâî]+, \d{1,2} [a-zăâî]+ \d{4}, 12 persoane$/.test(parametri(r[0])[4]), parametri(r[0])[4]);
  assert.ok(/^comanda ta de tort \(Tort diplomat\) pentru /.test(parametri(r[1])[1]));
});

caz('text lung / cu rânduri noi în detalii → parametrul e tăiat la 200 de caractere și fără rânduri noi', () => {
  const v = valideaza(payload({ tip: 'catering', persoane: 50, detalii: { tip_comanda: 'eveniment', livrare: 'adresa', adresa: 'Comuna Maglavit,\n\nsat Hunia,\t   nr. 12, ' + 'x'.repeat(300) } }));
  assert.equal(v.ok, true);
  const p = parametri(whatsapp(v, activ)[0]);
  assert.ok(p[1].length <= 200 && !/[\r\n\t]/.test(p[1]) && !/ {4,}/.test(p[1]), p[1]);
});

caz('whatsapp_api_url cu / la final și Phone number ID cu spații → URL curat; limba din Config', () => {
  const r = whatsapp(sala, Object.assign({}, activ, { whatsapp_api_url: 'https://graph.facebook.com/v22.0/', whatsapp_phone_number_id: ' 987 ', whatsapp_limba: 'ro_RO' }));
  assert.equal(r[0].json.url, 'https://graph.facebook.com/v22.0/987/messages'); assert.equal(r[0].json.body.template.language.code, 'ro_RO');
});

caz('workflow-ul: Are email? / Email → Trimitem pe WhatsApp? → Pregătește WhatsApp → Avem mesaje? → Trimite pe WhatsApp → Rândul pentru Postgres; ieșirile „nu" merg direct la Postgres', () => {
  const spre = (de, out) => (w.connections[de].main[out] || []).map(l => l.node);
  assert.deepEqual(spre('Are email?', 1), ['Trimitem pe WhatsApp?']); assert.deepEqual(spre('Email de confirmare', 0), ['Trimitem pe WhatsApp?']);
  assert.deepEqual(spre('Trimitem pe WhatsApp?', 0), ['Pregătește WhatsApp']); assert.deepEqual(spre('Trimitem pe WhatsApp?', 1), ['Rândul pentru Postgres']);
  assert.deepEqual(spre('Pregătește WhatsApp', 0), ['Avem mesaje?']); assert.deepEqual(spre('Avem mesaje?', 0), ['Trimite pe WhatsApp']); assert.deepEqual(spre('Avem mesaje?', 1), ['Rândul pentru Postgres']);
  assert.deepEqual(spre('Trimite pe WhatsApp', 0), ['Rândul pentru Postgres']);
  const h = nodul('Trimite pe WhatsApp');
  assert.equal(h.type, 'n8n-nodes-base.httpRequest'); assert.equal(h.onError, 'continueRegularOutput'); assert.equal(h.parameters.method, 'POST');
  assert.ok(/<<TODO/.test(h.credentials.httpHeaderAuth.id) && h.credentials.httpHeaderAuth.name === 'Meta WhatsApp token');
  const cfgNod = nodul('Config').parameters.assignments.assignments;
  const val = k => cfgNod.find(a => a.name === k).value;
  assert.equal(val('whatsapp'), 'nu'); assert.ok(/<<TODO/.test(val('whatsapp_phone_number_id')) && /<<TODO/.test(val('whatsapp_sorin')));
  assert.ok(/whatsapp_phone_number_id/.test(nodul('Trimitem pe WhatsApp?').parameters.conditions.conditions[0].leftValue));
  // credențiala există și în install.sh, cu același nume
  assert.ok(/"Meta WhatsApp token", "type": "httpHeaderAuth"/.test(fs.readFileSync(path.join(__dirname, '..', 'orca', 'install.sh'), 'utf8')));
});

console.log(`${n} cazuri trecute.`);
