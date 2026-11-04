// Simulează nodurile Code din n8n/site-cerere.json („Validează cererea", „Rândul pentru Postgres") cu un mediu n8n fals:
//   node tests/n8n-cerere.test.js
// Verifică: payload-ul de exemplu din PLAN.md → ok + Telegram + email + rând Postgres; honeypot / token greșit → tăcut (200, fără notificare);
// câmpuri invalide → 400 cu lista; sanitizare; data din trecut; tipurile viitoare (catering, tort) trec de validarea de bază.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const w = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'site-cerere.json'), 'utf8'));
const cod = n => w.nodes.find(x => x.name === n).parameters.jsCode;

const config = { site_token: 'secret-test', telegram_chat_id: '12345', email_expeditor: 'contact@restaurantok.com', email_copie: 'contact@restaurantok.com', origine_permisa: 'https://restaurantok.com', site_url: 'https://restaurantok.com', telefon_afisat: '0785255855', adresa_afisata: 'Str. A.I. Cuza nr. 26, Calafat, Dolj', fus_orar: 'Europe/Bucharest' };
function ruleaza(nume, inputJson, noduri) {
  const $ = n => ({ first: () => ({ json: noduri[n] }) });
  const $input = { first: () => ({ json: inputJson }), all: () => [{ json: inputJson }] };
  return new Function('$', '$input', 'Buffer', cod(nume))($, $input, Buffer);
}
const aziRo = (d) => { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Date.now() + (d || 0) * 864e5)).forEach(x => { p[x.type] = x.value; }); return `${p.year}-${p.month}-${p.day}`; };
const payload = (extra) => Object.assign({ tip: 'sala', nume: 'Ion Popescu', telefon: '0722 123 456', email: 'ion@exemplu.ro', data_eveniment: aziRo(60), persoane: 120, mesaj: 'Ora 18, meniu cu pește.', detalii: { tip_eveniment: 'nunta', tip_eveniment_text: 'Nuntă / cununie' }, consimtamant: true, website: '', pagina: '/sala-de-bal' }, extra || {});
const cerere = (body, headers) => ruleaza('Validează cererea', { headers: Object.assign({ 'x-site-token': 'secret-test', 'user-agent': 'test', 'cf-connecting-ip': '1.2.3.4' }, headers || {}), body }, { Config: config })[0].json;

let n = 0;
const asincrone = [];
function caz(nume, fn) { const r = fn(); if (r && typeof r.then === 'function') asincrone.push(r.then(() => { n++; console.log('  ✓ ' + nume); })); else { n++; console.log('  ✓ ' + nume); } }
console.log('n8n site-cerere (noduri Code):');

let bun;
caz('payload-ul din contract → ok, id „sala-AAAALLZZ-xxxx", răspuns { ok, id }', () => {
  bun = cerere(payload());
  assert.equal(bun.ok, true); assert.equal(bun.status, 200);
  assert.ok(/^sala-\d{8}-[a-z0-9]{4}$/.test(bun.id), bun.id);
  assert.deepEqual(bun.raspuns, { ok: true, id: bun.id });
  assert.equal(bun.are_email, true);
});

caz('mesajul Telegram: tip, eveniment, data în română, persoane, telefon cu link, mesajul clientului', () => {
  assert.ok(/<b>Cerere nouă · Sala de bal<\/b> <code>sala-/.test(bun.telegram));
  assert.ok(/Eveniment: Nuntă \/ cununie/.test(bun.telegram) && /Persoane: 120/.test(bun.telegram) && /Nume: Ion Popescu/.test(bun.telegram));
  assert.ok(/<a href="tel:\+40722123456">0722 123 456<\/a>/.test(bun.telegram));
  assert.ok(/<i>Ora 18, meniu cu pește\.<\/i>/.test(bun.telegram) && /wa\.me\/40722123456/.test(bun.telegram));
});

caz('emailul de confirmare: subiect cu id, text cu prenume, data, persoane, telefon, numărul cererii', () => {
  assert.equal(bun.email_subiect, `Am primit cererea ta pentru Sala de bal OK (${bun.id})`);
  assert.ok(bun.email_text.startsWith('Bună, Ion!'));
  assert.ok(/120 persoane/.test(bun.email_text) && /Te sunăm la 0722 123 456/.test(bun.email_text) && new RegExp('Numărul cererii: ' + bun.id).test(bun.email_text));
  assert.ok(/„Ora 18, meniu cu pește\."/.test(bun.email_text));
});

caz('rândul pentru Postgres are exact coloanele din n8n/sql/cereri.sql', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'n8n', 'sql', 'cereri.sql'), 'utf8');
  const coloane = [...sql.matchAll(/^\s{2}([a-z_]+)\s+(text|date|integer|jsonb|timestamptz)/gm)].map(m => m[1]);
  const rand = ruleaza('Rândul pentru Postgres', {}, { 'Validează cererea': bun })[0].json;
  assert.deepEqual(Object.keys(rand).sort(), coloane.sort());
  assert.equal(rand.id, bun.id); assert.equal(rand.persoane, 120); assert.equal(JSON.parse(rand.detalii).tip_eveniment, 'nunta'); assert.equal(rand.ip, '1.2.3.4');
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(rand.creat), rand.creat);
});

caz('fără email → are_email=false, email gol în rând (null)', () => {
  const r = cerere(payload({ email: '' }));
  assert.equal(r.ok, true); assert.equal(r.are_email, false); assert.equal(r.rand.email, null);
  assert.ok(!/Email:/.test(r.telegram));
});

caz('honeypot completat → tăcut: 200 { ok: true } cu id fals, dar ok=false (fără Telegram / email / Postgres)', () => {
  const r = cerere(payload({ website: 'http://spam' }));
  assert.equal(r.ok, false); assert.equal(r.tacut, true); assert.equal(r.status, 200); assert.equal(r.raspuns.ok, true); assert.ok(/^x-/.test(r.raspuns.id));
});

caz('token greșit → tăcut; token lipsă din Config (placeholder <<TODO>>) → nu se verifică', () => {
  assert.equal(cerere(payload(), { 'x-site-token': 'altceva' }).tacut, true);
  const fara = ruleaza('Validează cererea', { headers: {}, body: payload() }, { Config: Object.assign({}, config, { site_token: '<<TODO: ...>>' }) })[0].json;
  assert.equal(fara.ok, true);
});

caz('câmpuri invalide → 400 cu lista câmpurilor', () => {
  const r = cerere(payload({ nume: 'I', telefon: '123', email: 'ion@', consimtamant: false, persoane: 0 }));
  assert.equal(r.ok, false); assert.equal(r.status, 400); assert.equal(r.raspuns.ok, false);
  assert.equal(r.raspuns.eroare, 'câmpuri invalide: nume, telefon, email, consimtamant, persoane');
});

caz('data din trecut sau lipsă → 400; data de azi → ok', () => {
  assert.equal(cerere(payload({ data_eveniment: aziRo(-1) })).status, 400);
  assert.equal(cerere(payload({ data_eveniment: '' })).status, 400);
  assert.equal(cerere(payload({ data_eveniment: aziRo(0) })).ok, true);
});

caz('tip necunoscut sau body lipsă → 400', () => {
  assert.equal(cerere(payload({ tip: 'altceva' })).status, 400);
  assert.equal(ruleaza('Validează cererea', { headers: { 'x-site-token': 'secret-test' } }, { Config: config })[0].json.status, 400);
});

// ---- M4: tort ----
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const tort = (extra, detalii) => payload(Object.assign({ tip: 'tort', nume: 'Maria Ionescu', persoane: 12, mesaj: 'Cu mesajul „La mulți ani, Ana!"', pagina: '/cofetaria',
  detalii: Object.assign({ tort: 'personalizat', tort_text: 'Tort personalizat, după model', poza_model: { nume: 'model.jpg', tip: 'image/jpeg', marime: 70, latime: 1, inaltime: 1, base64: PNG_1PX } }, detalii || {}) }, extra || {}));

caz('tort cu poză-model → ok, id „tort-…", are_poza + poza_base64 separat, detaliile fără base64, Telegram cu „Tort:" și „Model:"', () => {
  const r = cerere(tort());
  assert.equal(r.ok, true); assert.ok(/^tort-\d{8}-[a-z0-9]{4}$/.test(r.id), r.id);
  assert.equal(r.are_poza, true); assert.equal(r.poza_base64, PNG_1PX); assert.ok(r.poza_nume.startsWith(r.id + '-model')); assert.equal(r.poza_tip, 'image/jpeg');
  assert.deepEqual(Object.keys(r.cerere.detalii.poza_model).sort(), ['inaltime', 'latime', 'marime', 'nume', 'tip']);
  assert.ok(!/base64/.test(r.rand.detalii));
  assert.ok(/<b>Comandă nouă · Tort<\/b>/.test(r.telegram) && /Tort: Tort personalizat, după model/.test(r.telegram) && /Model: poza vine în mesajul următor/.test(r.telegram) && /Pentru: /.test(r.telegram));
  assert.equal(r.email_subiect, `Am primit comanda ta de tort (${r.id})`);
  assert.ok(/12 persoane, după modelul din poza trimisă/.test(r.email_text) && /greutatea, decorul, prețul/.test(r.email_text));
});

caz('tort fără poză → ok, are_poza=false, „Model: fără poză"; tort lipsă / dată lipsă / base64 stricat → 400', () => {
  const r = cerere(tort({}, { poza_model: null }));
  assert.equal(r.ok, true); assert.equal(r.are_poza, false); assert.equal(r.poza_base64, undefined); assert.ok(/Model: fără poză/.test(r.telegram));
  assert.equal(cerere(tort({}, { tort: '' })).raspuns.eroare, 'câmpuri invalide: tort');
  assert.equal(cerere(tort({ data_eveniment: '' })).raspuns.eroare, 'câmpuri invalide: data_eveniment');
  assert.equal(cerere(tort({}, { poza_model: { base64: 'nu e base64 !!!' } })).raspuns.eroare, 'câmpuri invalide: poza_model');
});

caz('nodul „Pregătește poza": base64 → binar (prepareBinaryData simulat) cu nume de fișier din id și legendă', async () => {
  const v = cerere(tort());
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const apeluri = [];
  const self = { helpers: { prepareBinaryData: async (buf, nume, tip) => { apeluri.push({ marime: buf.length, nume, tip }); return { data: buf.toString('base64'), fileName: nume, mimeType: tip }; } } };
  const $ = n => ({ first: () => ({ json: { 'Validează cererea': v }[n] }) });
  const out = await new AsyncFunction('$', '$input', 'Buffer', cod('Pregătește poza')).call(self, $, { first: () => ({ json: v }), all: () => [{ json: v }] }, Buffer);
  assert.equal(out.length, 1); assert.equal(apeluri[0].marime, 70); assert.equal(apeluri[0].nume, v.poza_nume); assert.equal(apeluri[0].tip, 'image/jpeg');
  assert.equal(out[0].binary.poza.fileName, v.poza_nume); assert.ok(/Model tort · tort-/.test(out[0].json.legenda) && /12 persoane/.test(out[0].json.legenda));
  const gol = await new AsyncFunction('$', '$input', 'Buffer', cod('Pregătește poza')).call(self, n => ({ first: () => ({ json: cerere(tort({}, { poza_model: null })) }) }), {}, Buffer);
  assert.deepEqual(gol, []);
});

// ---- M3: catering ----
const catering = (extra, detalii) => payload(Object.assign({ tip: 'catering', nume: 'Firma Exemplu SRL', persoane: 12, mesaj: 'Fără carne de porc pentru doi colegi.', pagina: '/catering',
  detalii: Object.assign({ tip_comanda: 'pranz-birou', tip_comanda_text: 'Prânz la birou', livrare: 'adresa', livrare_text: 'Livrare la adresă', adresa: 'Str. Traian nr. 10, Calafat', ora: '12:30' }, detalii || {}) }, extra || {}));

caz('catering, prânz la birou → ok, id „catering-…", Telegram cu „Comandă nouă", porții/zi, livrare, ora; detaliile normalizate', () => {
  const r = cerere(catering());
  assert.equal(r.ok, true); assert.ok(/^catering-\d{8}-[a-z0-9]{4}$/.test(r.id), r.id);
  assert.ok(/<b>Comandă nouă · Catering<\/b>/.test(r.telegram) && /Comandă: Prânz la birou/.test(r.telegram));
  assert.ok(/De la: .*, ora 12:30/.test(r.telegram) && /Porții pe zi: 12/.test(r.telegram) && /Livrare la: Str\. Traian nr\. 10, Calafat/.test(r.telegram));
  assert.deepEqual(Object.keys(r.cerere.detalii).sort(), ['adresa', 'livrare', 'livrare_text', 'ora', 'tip_comanda', 'tip_comanda_text']);
  assert.equal(JSON.parse(r.rand.detalii).tip_comanda, 'pranz-birou');
});

caz('catering: emailul de confirmare are șablon per tip (prânz la birou / pomană / eveniment)', () => {
  const p = cerere(catering());
  assert.equal(p.email_subiect, `Am primit comanda ta de catering (${p.id})`);
  assert.ok(/12 porții pe zi/.test(p.email_text) && /livrate la Str\. Traian/.test(p.email_text) && /meniul săptămânii/.test(p.email_text));
  const o = cerere(catering({ persoane: 40 }, { tip_comanda: 'pomana', livrare: 'ridicare', adresa: '' }));
  assert.ok(/40 pachete pentru pomană/.test(o.email_text) && /ridicare de la restaurant/.test(o.email_text) && /Pachete: 40/.test(o.telegram) && /Ridicare de la restaurant/.test(o.telegram));
  assert.equal(o.cerere.detalii.adresa, '');
  const e = cerere(catering({ persoane: 80 }, { tip_comanda: 'eveniment', ora: '' }));
  assert.ok(/catering pentru 80 persoane/.test(e.email_text) && /Persoane: 80/.test(e.telegram) && !/ora/.test(e.telegram.split('\n')[2]));
});

caz('catering: tip_comanda necunoscut, adresă lipsă la livrare, oră greșită, dată/persoane lipsă → 400 cu lista', () => {
  assert.equal(cerere(catering({}, { tip_comanda: 'altceva' })).raspuns.eroare, 'câmpuri invalide: tip_comanda');
  assert.equal(cerere(catering({}, { adresa: 'x' })).raspuns.eroare, 'câmpuri invalide: adresa');
  assert.equal(cerere(catering({}, { ora: '25:99' })).raspuns.eroare, 'câmpuri invalide: ora');
  assert.equal(cerere(catering({ data_eveniment: '', persoane: 0 })).raspuns.eroare, 'câmpuri invalide: data_eveniment, persoane');
  assert.equal(cerere(catering({}, { livrare: 'ridicare', adresa: '' })).ok, true);
  assert.equal(cerere(catering({ detalii: null })).status, 400);
});

caz('sanitizare: HTML în nume/mesaj este escapat în Telegram, textele lungi sunt tăiate, caracterele de control dispar', () => {
  const r = cerere(payload({ nume: '<b>Ion</b>', mesaj: 'a\u0000b'.padEnd(2000, 'x') }));
  assert.ok(/Nume: &lt;b&gt;Ion&lt;\/b&gt;/.test(r.telegram));
  assert.equal(r.cerere.mesaj.length, 1500); assert.ok(!/\u0000/.test(r.cerere.mesaj));
});

caz('nodul Config are placeholder-e, nu secrete; webhook-ul răspunde prin nodurile Respond cu CORS', () => {
  const cfg = w.nodes.find(x => x.name === 'Config').parameters.assignments.assignments;
  assert.ok(/<<TODO/.test(cfg.find(a => a.name === 'site_token').value));
  const wh = w.nodes.find(x => x.type === 'n8n-nodes-base.webhook');
  assert.equal(wh.parameters.responseMode, 'responseNode'); assert.equal(wh.parameters.path, 'site-cerere');
  w.nodes.filter(x => x.type === 'n8n-nodes-base.respondToWebhook').forEach(x => assert.ok(x.parameters.options.responseHeaders.entries.some(h => h.name === 'Access-Control-Allow-Origin')));
});

Promise.all(asincrone).then(() => console.log(n + ' cazuri trecute.')).catch(e => { console.error(e); process.exit(1); });
