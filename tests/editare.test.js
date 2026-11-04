// Editarea conținutului prin Telegram (M8): n8n/cod/editare.js și nodurile Code din n8n/meniu-zilei.json
// („Interpretează mesajul" → ramura „editare" → „Aplică modificarea"), cu un mediu n8n simulat:
//   node tests/editare.test.js
// Verifică: recunoașterea comenzilor (zile închise, program special, ștergere, program săptămânal, meniul săptămânii,
// torturi, catering, arată), aplicarea pe JSON-urile reale din data/, erorile prietenoase, faptul că un text de meniu
// NU este luat drept comandă, și legăturile din workflow.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../n8n/cod/editare.js');
const w = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'meniu-zilei.json'), 'utf8'));
const cod = n => w.nodes.find(x => x.name === n).parameters.jsCode;
const citeste = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));

const acum = new Date('2026-10-27T10:00:00Z'); // marți, 27 octombrie 2026, 12:00 ora României
const config = { github_owner: 'o', github_repo: 'r', telegram_chat_id: '12345', site_url: 'https://restaurantok.com', fus_orar: 'Europe/Bucharest', pret_implicit: 24, ora_inchidere: '16:00', telefon_afisat: '0785255855', traducere: 'glosar' };
function ruleaza(nume, inputJson, noduri) {
  const $ = n => ({ first: () => ({ json: noduri[n] }) });
  const $input = { first: () => ({ json: inputJson }) };
  return new Function('$', '$input', 'Buffer', cod(nume))($, $input, Buffer);
}
const interpreteaza = text => ruleaza('Interpretează mesajul', { message: { chat: { id: 12345 }, text } }, { Config: config })[0].json;
const aplicaNod = (cmd, existent) => ruleaza('Aplică modificarea', existent ? { content: Buffer.from(JSON.stringify(existent)).toString('base64'), sha: 'x' } : { error: 'Not Found' }, { Config: config, 'Interpretează mesajul': cmd })[0].json;
const cmd = text => E.interpreteaza(text, acum);
const aplica = (text, json) => E.aplica(cmd(text), json, acum);

let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }
console.log('editare conținut prin Telegram (M8):');

caz('„închis 25.12 Crăciun" → excepție pe 25 decembrie, ambele unități, motiv cu diacritice; anul următor pentru „1 ianuarie"', () => {
  const c = cmd('închis 25.12 Crăciun');
  assert.deepEqual(c, { fisier: 'data/program.json', tip: 'inchis', zile: ['2026-12-25'], orar: [], unitate: null, motiv: 'Crăciun' });
  assert.deepEqual(cmd('Închis 1 ianuarie').zile, ['2027-01-01']);
  assert.deepEqual(cmd('inchis 25.12.2027').zile, ['2027-12-25']);
  assert.equal(cmd('INCHIS 2 noiembrie restaurant inventar').unitate, 'gastro-pub');
  assert.equal(cmd('INCHIS 2 noiembrie restaurant inventar').motiv, 'inventar');
});

caz('interval de zile cu unitate: „închis 24.12 - 26.12 cofetărie Sărbători"; peste 62 de zile → eroare; fără dată → eroare', () => {
  const c = cmd('inchis 24.12 - 26.12 cofetărie Sărbători');
  assert.deepEqual(c.zile, ['2026-12-24', '2026-12-25', '2026-12-26']); assert.equal(c.unitate, 'cofetaria'); assert.equal(c.motiv, 'Sărbători');
  assert.deepEqual(cmd('închis 30.12 - 2.01').zile, ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  assert.equal(cmd('închis 1.01 - 1.06').tip, 'eroare');
  assert.ok(/Lipsește data/.test(cmd('închis mâine').eroare));
  assert.ok(/Nu înțeleg data/.test(cmd('închis 32.13').eroare));
});

caz('„deschis 31.12 9:00-15:00 Revelion" → program special; orele cu punct (9.00) nu sunt date; „10-16" fără minute merge', () => {
  const c = cmd('deschis 31.12 9:00-15:00 Revelion');
  assert.equal(c.tip, 'orar_special'); assert.deepEqual(c.orar, [['09:00', '15:00']]); assert.deepEqual(c.zile, ['2026-12-31']); assert.equal(c.motiv, 'Revelion');
  const c2 = cmd('deschis 31.12 - 2.01 10-16 restaurant');
  assert.deepEqual(c2.orar, [['10:00', '16:00']]); assert.equal(c2.zile.length, 3); assert.equal(c2.unitate, 'gastro-pub');
  assert.deepEqual(cmd('program special 1.05 10:00-14:00, 18:00-23:00').orar, [['10:00', '14:00'], ['18:00', '23:00']]);
  assert.ok(/Lipsesc orele/.test(cmd('deschis 31.12 9.00-15.00').eroare));
  assert.ok(/Ora nu e validă/.test(cmd('deschis 31.12 9:00-25:00').eroare));
});

caz('aplicare pe program.json: excepțiile se adaugă sortate, se înlocuiesc pe aceeași zi/unitate, „șterge" le scoate; site-ul le înțelege (data, inchis/orar, motiv, unitate)', () => {
  const P = citeste('program.json');
  let r = aplica('închis 25.12 Crăciun', P);
  assert.equal(r.scrie, true); assert.ok(/Închis pe 25 decembrie 2026 \(Crăciun\) — ambele unități/.test(r.mesaj)); assert.ok(/program\.json — închis 2026-12-25/.test(r.commit));
  let p = r.continut;
  assert.deepEqual(p.exceptii, [{ data: '2026-12-25', inchis: true, motiv: 'Crăciun' }]);
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(p.actualizat));
  assert.deepEqual(p.unitati, P.unitati, 'programul săptămânal nu se atinge'); assert.deepEqual(p.contact, P.contact);
  p = aplica('deschis 20.11 10:00-16:00 cofetărie eveniment privat', p).continut;
  assert.deepEqual(p.exceptii[0], { data: '2026-11-20', unitate: 'cofetaria', orar: [['10:00', '16:00']], motiv: 'eveniment privat' });
  p = aplica('închis 25.12 Crăciun și Sf. Ștefan', p).continut; // aceeași zi → înlocuire, nu dublare
  assert.equal(p.exceptii.length, 2); assert.equal(p.exceptii[1].motiv, 'Crăciun și Sf. Ștefan');
  r = aplica('șterge 25.12', p);
  assert.equal(r.scrie, true); assert.ok(/1 excepție scoasă/.test(r.mesaj)); assert.equal(r.continut.exceptii.length, 1);
  r = aplica('șterge 25.12', r.continut);
  assert.equal(r.scrie, false); assert.ok(/Nu era nicio excepție/.test(r.mesaj));
  assert.ok(/eveniment privat/.test(aplica('arată excepții', p).mesaj)); assert.equal(aplica('arată excepții', p).scrie, false);
});

caz('„program cofetărie: luni-sâmbătă 9-20, duminică închis" → orarul unității, fără _exemplu; toate cele 7 zile obligatorii', () => {
  const P = citeste('program.json');
  assert.equal(P.unitati.cofetaria._exemplu, true, 'exemplul din data/ e încă marcat');
  const r = aplica('program cofetărie: luni-sâmbătă 9-20, duminică închis', P);
  assert.equal(r.scrie, true);
  const u = r.continut.unitati.cofetaria;
  assert.equal(u._exemplu, undefined); assert.equal(u._nota, undefined); assert.equal(u.nume, 'Cofetăria OK');
  assert.deepEqual(u.orar.luni, [['09:00', '20:00']]); assert.deepEqual(u.orar.sambata, [['09:00', '20:00']]); assert.deepEqual(u.orar.duminica, []);
  assert.deepEqual(Object.keys(u.orar), ['luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata', 'duminica']);
  assert.ok(!/EXEMPLU/.test(r.continut._nota)); assert.ok(/duminică: închis/.test(r.mesaj));
  const r2 = cmd('program restaurant: luni-vineri 8:30-23:30; sâmbătă 9-23; duminică 9:30-23:30');
  assert.deepEqual(r2.orar.vineri, [['08:30', '23:30']]); assert.deepEqual(r2.orar.sambata, [['09:00', '23:00']]); assert.deepEqual(r2.orar.duminica, [['09:30', '23:30']]);
  assert.deepEqual(cmd('program cofetărie: zilnic 9-20').orar.duminica, [['09:00', '20:00']]);
  assert.deepEqual(cmd('program cofetărie: luni - vineri 9-20, sâmbătă și duminică 10-14').orar.duminica, [['10:00', '14:00']]);
  assert.ok(/Lipsesc zilele: sâmbătă, duminică/.test(cmd('program cofetărie: luni-vineri 9-20').eroare));
  assert.ok(/Lipsesc orele/.test(cmd('program cofetărie: luni-duminică').eroare) || /Lipsesc orele/.test(cmd('program cofetărie: luni-sâmbătă, duminică inchis').eroare));
});

caz('„săptămâna: luni …; marți …" → meniul săptămânii în catering.json, cu datele zilelor, preț și săptămâna aleasă', () => {
  const C = citeste('catering.json');
  const r = aplica('Săptămâna: luni ciorbă de legume, pui la cuptor cu cartofi; marți ciorbă de burtă, sarmale cu mămăligă. 26 lei, de la 3.11', C);
  assert.equal(r.scrie, true);
  const ms = r.continut.meniu_saptamana;
  assert.equal(ms.saptamana, '2026-11-02'); assert.equal(ms.pret, 26); assert.equal(ms.moneda, 'lei');
  assert.deepEqual(ms.zile, [{ data: '2026-11-02', preparate: ['Ciorbă de legume', 'Pui la cuptor cu cartofi'] }, { data: '2026-11-03', preparate: ['Ciorbă de burtă', 'Sarmale cu mămăligă'] }]);
  assert.equal(r.continut._exemplu, undefined); assert.equal(r.continut.oferte.find(o => o.id === 'pranz-birou').pret_de_la, 26);
  assert.deepEqual(r.continut.oferte.map(o => o.id), C.oferte.map(o => o.id), 'ofertele rămân');
  // fără „de la": lunea săptămânii curente (marți 27.10 → 26.10); fără preț: prețul existent
  const r2 = aplica('săptămâna luni ciorbă, crap; vineri ciorbă de fasole, pește', C);
  assert.equal(r2.continut.meniu_saptamana.saptamana, '2026-10-26'); assert.equal(r2.continut.meniu_saptamana.pret, 24);
  assert.equal(r2.continut.meniu_saptamana.zile[1].data, '2026-10-30');
  // sâmbăta → lunea următoare
  assert.equal(E.interpreteaza('săptămâna: luni ciorbă', new Date('2026-10-31T10:00:00Z')).saptamana, '2026-11-02');
  assert.ok(/Scrie câte o zi/.test(cmd('săptămâna: ciorbă, pui').eroare));
});

caz('„tort diplomat: 120 lei/kg, 3 zile", „la cerere", „torturi termen", „catering pomeni: 35 lei" → torturi.json / catering.json', () => {
  const T = citeste('torturi.json');
  let r = aplica('tort diplomat: 120 lei/kg, 3 zile', T);
  const d = r.continut.torturi.find(x => x.id === 'diplomat');
  assert.equal(d.pret_de_la, 120); assert.equal(d.per, 'kg'); assert.equal(d.termen_minim_zile, 3); assert.equal(d._nota, undefined);
  assert.equal(r.continut._exemplu, true, 'rămâne exemplu cât mai sunt torturi fără preț');
  assert.ok(/Tort Diplomat: de la 120 lei \/ kg, comandă cu minimum 3 zile/.test(r.mesaj));
  r = aplica('tort de ciocolata: la cerere', r.continut);
  assert.equal(r.continut.torturi.find(x => x.id === 'ciocolata').pret_de_la, null);
  r = aplica('tort prăjituri: 8 lei bucata', r.continut);
  assert.equal(r.continut.torturi.find(x => x.id === 'prajituri').per, 'bucată');
  assert.equal(aplica('tort nunta 150 lei kg', T).continut.torturi.find(x => x.id === 'nunta').pret_de_la, 150);
  const lipsa = aplica('tort pufos: 10 lei', T);
  assert.equal(lipsa.scrie, false); assert.ok(/Nu găsesc tortul „pufos"/.test(lipsa.mesaj));
  assert.equal(aplica('torturi termen 4 zile', T).continut.termen_minim_zile, 4);
  assert.ok(/Tort Diplomat: preț la cerere/.test(aplica('arată torturi', T).mesaj));
  const C = citeste('catering.json');
  r = aplica('catering pomeni: 35 lei', C);
  const o = r.continut.oferte.find(x => x.id === 'pomeni');
  assert.equal(o.pret_de_la, 35); assert.equal(o._nota, undefined); assert.ok(/Pomeni și parastase: de la 35 lei \/ pachet/.test(r.mesaj));
  assert.equal(aplica('catering prânz: 26 lei', C).continut.meniu_saptamana.pret, 26);
  assert.equal(aplica('catering evenimente: la cerere', C).continut.oferte[0].pret_de_la, null);
});

caz('textul meniului zilei NU este comandă de editare; „arată x" necunoscut și fișierul lipsă dau erori prietenoase', () => {
  assert.equal(cmd('Meniul zilei: ciorbă de perișoare, crap prăjit. 24 lei'), null);
  assert.equal(cmd('Ciorbă de legume\nPui la cuptor cu cartofi\nSalată'), null);
  assert.equal(cmd('Mâine\nCiorbă de burtă\nSarmale'), null);
  assert.equal(cmd('gata'), null); assert.equal(cmd('alergeni 2: gluten'), null);
  assert.ok(/Pot arăta/.test(cmd('arată vremea').eroare));
  const r = E.aplica(cmd('închis 25.12'), null, acum);
  assert.equal(r.scrie, false); assert.ok(/Nu am putut citi data\/program\.json/.test(r.mesaj));
  assert.ok(/Comandă necunoscută/.test(E.aplica(null, {}, acum).mesaj));
});

caz('nodul „Interpretează mesajul": comandă → actiune „editare" + fisier; eroare de comandă → ajutor de editare; „editare" → ajutorul; meniul rămâne „meniu"', () => {
  const c = interpreteaza('închis 25.12 Crăciun');
  assert.equal(c.actiune, 'editare'); assert.equal(c.fisier, 'data/program.json'); assert.equal(c.editare.tip, 'inchis'); assert.equal(c.chat_id, '12345');
  const e = interpreteaza('închis mâine');
  assert.equal(e.actiune, 'ajutor'); assert.equal(e.ajutor_editare, true); assert.ok(/Lipsește data/.test(e.eroare));
  assert.equal(interpreteaza('editare').ajutor_editare, true); assert.equal(interpreteaza('/editare').actiune, 'ajutor');
  assert.equal(interpreteaza('Meniul zilei: ciorbă de perișoare, crap prăjit cu mămăligă. 24 lei.').actiune, 'meniu');
  assert.equal(interpreteaza('en 2: Fried carp').actiune, 'traducere');
  assert.equal(interpreteaza('?').ajutor_editare, undefined);
});

caz('nodul „Aplică modificarea": JSON din GitHub (base64) → continut, commit, fisier; fișier lipsă → mesaj, fără scriere', () => {
  const P = citeste('program.json');
  const r = aplicaNod(interpreteaza('închis 25.12 Crăciun'), P);
  assert.equal(r.scrie, true); assert.equal(r.fisier, 'data/program.json'); assert.equal(r.chat_id, '12345');
  const scris = JSON.parse(r.continut);
  assert.deepEqual(scris.exceptii, [{ data: '2026-12-25', inchis: true, motiv: 'Crăciun' }]); assert.ok(r.continut.endsWith('\n'));
  assert.ok(/^data: program\.json — închis 2026-12-25$/.test(r.commit));
  const r2 = aplicaNod(interpreteaza('arată program'), P);
  assert.equal(r2.scrie, false); assert.ok(/Gastro-pub OK/.test(r2.mesaj)); assert.ok(/încă exemplu/.test(r2.mesaj));
  const r3 = aplicaNod(interpreteaza('tort diplomat: 120 lei/kg'), null);
  assert.equal(r3.scrie, false); assert.ok(/Nu am putut citi data\/torturi\.json/.test(r3.mesaj));
});

caz('workflow-ul: „Ce facem?" are ieșirea „editare" → Citește fișierul de editat → Aplică modificarea → Scriem modificarea? → Scrie fișierul editat → Confirmă editarea; ajutorul alege textul de editare', () => {
  const out = (from, i) => (w.connections[from].main[i] || []).map(x => x.node);
  const sw = w.nodes.find(x => x.name === 'Ce facem?').parameters.rules.values;
  assert.equal(sw[6].outputKey, 'editare'); assert.deepEqual(out('Ce facem?', 6), ['Citește fișierul de editat']);
  assert.deepEqual(out('Citește fișierul de editat', 0), ['Aplică modificarea']); assert.deepEqual(out('Aplică modificarea', 0), ['Scriem modificarea?']);
  assert.deepEqual(out('Scriem modificarea?', 0), ['Scrie fișierul editat']); assert.deepEqual(out('Scriem modificarea?', 1), ['Confirmă editarea']);
  assert.deepEqual(out('Scrie fișierul editat', 0), ['Confirmă editarea']); assert.deepEqual(out('Scrie fișierul editat', 1), ['Confirmă editarea']);
  const citire = w.nodes.find(x => x.name === 'Citește fișierul de editat'), scriere = w.nodes.find(x => x.name === 'Scrie fișierul editat');
  assert.equal(citire.parameters.filePath, '={{ $json.fisier }}'); assert.equal(citire.onError, 'continueRegularOutput');
  assert.equal(scriere.parameters.filePath, '={{ $json.fisier }}'); assert.equal(scriere.parameters.operation, 'edit'); assert.equal(scriere.onError, 'continueErrorOutput');
  assert.equal(scriere.credentials.githubApi.name, 'GitHub PAT site'); assert.ok(/<<TODO/.test(scriere.credentials.githubApi.id));
  const ajutor = w.nodes.find(x => x.name === 'Răspunde ajutor').parameters.text;
  assert.ok(/ajutor_editare/.test(ajutor) && /Editarea site-ului de pe telefon/.test(ajutor) && /Scrie meniul zilei ca pe Facebook/.test(ajutor));
  assert.ok(/<code>editare<\/code>/.test(ajutor), 'ajutorul meniului trimite la comenzile de editare');
});

console.log(`${n} cazuri trecute.`);
