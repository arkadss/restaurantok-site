// Simulează nodurile Code din n8n/recenzii-google.json („Transformă recenziile") și n8n/postari-facebook.json („Transformă postările"):
//   node tests/n8n-recenzii-postari.test.js
// Verifică: răspunsul Places API (New) și formatul vechi → recenzii.json valid (max 5, autor scurtat, sortare); API gol → eroare;
// răspunsul Graph API + JSON-ul curent din repo → postari.json valid, pozele noi detectate o singură dată; JSON-urile produse trec de site.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OK = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'site.js'));
const wR = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'recenzii-google.json'), 'utf8'));
const wP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'postari-facebook.json'), 'utf8'));
const cod = (w, n) => w.nodes.find(x => x.name === n).parameters.jsCode;
function ruleaza(js, inputJson, noduri) {
  const $ = n => ({ first: () => ({ json: noduri[n] }) });
  const $input = { first: () => ({ json: inputJson }), all: () => [{ json: inputJson }] };
  return new Function('$', '$input', 'Buffer', js)($, $input, Buffer);
}
let n = 0;
function caz(nume, fn) { fn(); n++; console.log('  ✓ ' + nume); }

console.log('n8n recenzii-google (nodul Code):');
const cfgR = { place_id: 'ChIJtest123', github_owner: 'o', github_repo: 'r', telegram_chat_id: '1', url_google: 'https://maps.google.com/?q=x', fus_orar: 'Europe/Bucharest' };
const nou = { rating: 4.5, userRatingCount: 183, googleMapsUri: 'https://maps.google.com/?cid=1', reviews: [
  { rating: 5, text: { text: 'Ciorba de pește a fost excelentă.', languageCode: 'ro' }, authorAttribution: { displayName: 'Ana Maria Popescu' }, publishTime: '2026-10-02T10:00:00Z' },
  { rating: 4, text: { text: 'Meniul zilei bun și rapid.' }, authorAttribution: { displayName: 'Dan' }, publishTime: '2026-09-20T10:00:00Z' },
  { rating: 5, originalText: { text: 'Great food near the bridge.' }, authorAttribution: { displayName: 'John Smith' }, publishTime: '2026-10-10T10:00:00Z' },
  { rating: 3, text: { text: '' }, authorAttribution: { displayName: 'Fără text' }, publishTime: '2026-10-11T10:00:00Z' },
  { rating: 9, text: { text: 'notă invalidă' }, authorAttribution: { displayName: 'X' }, publishTime: '2026-10-12T10:00:00Z' },
  { rating: 5, text: { text: '<b>html</b>\u0000 și   spații ' + 'x'.repeat(700) }, authorAttribution: { displayName: 'Lung' }, publishTime: '2026-07-01T10:00:00Z' },
  { rating: 4, text: { text: 'A șasea' }, authorAttribution: { displayName: 'Șase' }, publishTime: '2026-06-01T10:00:00Z' }
] };

caz('Places API (New) → recenzii.json: nota, numărul, max 5 recenzii sortate descrescător, autor „Prenume I.", text curățat, link de recenzie nouă din place_id', () => {
  const out = ruleaza(cod(wR, 'Transformă recenziile'), nou, { Config: cfgR })[0].json;
  const j = JSON.parse(out.continut);
  assert.equal(j.rating, 4.5); assert.equal(j.numar, 183); assert.equal(j.place_id, 'ChIJtest123'); assert.equal(j.url_google, 'https://maps.google.com/?cid=1');
  assert.equal(j.url_recenzie_noua, 'https://search.google.com/local/writereview?placeid=ChIJtest123');
  assert.equal(j.recenzii.length, 5);
  assert.deepEqual(j.recenzii.map(r => r.data), ['2026-10-10', '2026-10-02', '2026-09-20', '2026-07-01', '2026-06-01']);
  assert.equal(j.recenzii[1].autor, 'Ana P.'); assert.equal(j.recenzii[2].autor, 'Dan'); assert.equal(j.recenzii[0].text, 'Great food near the bridge.');
  assert.ok(j.recenzii[3].text.length <= 600 && !/\u0000/.test(j.recenzii[3].text) && !/\s{2}/.test(j.recenzii[3].text));
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(j.actualizat)); assert.ok(/^data: recenzii\.json \d{4}-\d{2}-\d{2}$/.test(out.commit));
  const s = OK.stareRecenzii(j, new Date());
  assert.equal(s.stare, 'ok'); assert.equal(s.recenzii.length, 5); assert.equal(s.url_recenzie_noua, j.url_recenzie_noua);
});

caz('formatul vechi (result.reviews cu author_name și time în secunde) → același JSON', () => {
  const vechi = { result: { rating: 4.2, user_ratings_total: 50, url: 'https://maps.google.com/?cid=2', reviews: [{ rating: 4, text: 'Bun.', author_name: 'Ion Popescu', time: 1759392000 }] } };
  const j = JSON.parse(ruleaza(cod(wR, 'Transformă recenziile'), vechi, { Config: cfgR })[0].json.continut);
  assert.equal(j.rating, 4.2); assert.equal(j.numar, 50); assert.equal(j.recenzii[0].autor, 'Ion P.'); assert.equal(j.recenzii[0].data, '2025-10-02'); assert.equal(j.url_google, 'https://maps.google.com/?cid=2');
});

caz('răspuns gol / eroare API → nodul aruncă (nu scriem un fișier gol peste cel bun)', () => {
  assert.throws(() => ruleaza(cod(wR, 'Transformă recenziile'), { error: { message: 'API key invalid' } }, { Config: cfgR }), /Place ID/);
  assert.throws(() => ruleaza(cod(wR, 'Transformă recenziile'), {}, { Config: cfgR }));
});

caz('workflow-ul: cheia API doar în credențială (Header Auth), nu în Config; trigger săptămânal; GitHub edit pe data/recenzii.json', () => {
  const cfg = wR.nodes.find(x => x.name === 'Config').parameters.assignments.assignments;
  assert.ok(!cfg.some(a => /key|cheie|token/i.test(a.name)));
  const http = wR.nodes.find(x => x.type === 'n8n-nodes-base.httpRequest');
  assert.equal(http.parameters.genericAuthType, 'httpHeaderAuth'); assert.ok(/<<TODO/.test(http.credentials.httpHeaderAuth.id));
  assert.equal(wR.nodes.find(x => x.type === 'n8n-nodes-base.github').parameters.filePath, 'data/recenzii.json');
  assert.equal(wR.nodes.find(x => x.type === 'n8n-nodes-base.scheduleTrigger').parameters.rule.interval[0].expression, '20 6 * * 1');
});

console.log('n8n postari-facebook (nodul Code):');
const cfgP = { page_id: '123', github_owner: 'o', github_repo: 'r', telegram_chat_id: '1', url_pagina: 'https://www.facebook.com/OkCalafat', max_postari: 3, graph_versiune: 'v21.0', fus_orar: 'Europe/Bucharest' };
const graph = { data: [
  { id: '123_900', message: 'Meniul zilei de luni: ciorbă, sarmale.   24 lei.\n\n\n\nComenzi: 0785255855', full_picture: 'https://scontent.example/900.jpg?sig=a', permalink_url: 'https://www.facebook.com/OkCalafat/posts/900', created_time: '2026-10-20T08:10:00+0000' },
  { id: '123_800', message: 'Muzică live vineri.', permalink_url: 'https://www.facebook.com/OkCalafat/posts/800', created_time: '2026-10-18T18:30:00+0000' },
  { id: '123_700', full_picture: 'https://scontent.example/700.jpg?sig=b', permalink_url: 'https://www.facebook.com/OkCalafat/posts/700', created_time: '2026-10-17T12:00:00+0000' },
  { id: '123_600', permalink_url: 'https://www.facebook.com/OkCalafat/posts/600', created_time: '2026-10-16T12:00:00+0000' },
  { id: '123_500', message: 'Veche, a cincea', full_picture: 'https://scontent.example/500.jpg', permalink_url: 'https://www.facebook.com/OkCalafat/posts/500', created_time: '2026-10-10T12:00:00+0000' }
] };
const repo = (postari) => ({ content: Buffer.from(JSON.stringify({ postari })).toString('base64') });

caz('Graph API + repo gol → postari.json cu 3 postări (fără cele goale), poze noi pentru cele cu full_picture, text curățat', () => {
  const out = ruleaza(cod(wP, 'Transformă postările'), { error: 'nu există' }, { Config: cfgP, 'Citește postările': graph, 'Citește JSON curent': { error: 'nu există' } })[0].json;
  const j = JSON.parse(out.continut);
  assert.deepEqual(j.postari.map(p => p.id), ['900', '800', '700']);
  assert.equal(j.postari[0].poza, 'data/poze/post-900.jpg'); assert.equal(j.postari[1].poza, null); assert.equal(j.postari[2].text, '');
  assert.equal(j.postari[0].text, 'Meniul zilei de luni: ciorbă, sarmale. 24 lei.\n\nComenzi: 0785255855');
  assert.equal(j.postari[0].data, '2026-10-20T08:10:00.000Z'); assert.equal(j.url_pagina, 'https://www.facebook.com/OkCalafat');
  assert.deepEqual(out.poze_noi.map(z => z.cale), ['data/poze/post-900.jpg', 'data/poze/post-700.jpg']); assert.equal(out.are_poze_noi, true);
  assert.ok(/^data: postari\.json \d{4}-\d{2}-\d{2}$/.test(out.commit));
  const s = OK.starePostari(j, new Date());
  assert.equal(s.stare, 'ok'); assert.equal(s.postari.length, 3);
});

caz('pozele deja din repo nu se descarcă din nou; max_postari din Config; fără postări → eroare', () => {
  const out = ruleaza(cod(wP, 'Transformă postările'), repo([{ id: '900', poza: 'data/poze/post-900.jpg' }]), { Config: cfgP, 'Citește postările': graph, 'Citește JSON curent': repo([{ id: '900', poza: 'data/poze/post-900.jpg' }]) })[0].json;
  assert.deepEqual(out.poze_noi.map(z => z.id), ['700']);
  const doua = ruleaza(cod(wP, 'Transformă postările'), {}, { Config: Object.assign({}, cfgP, { max_postari: 2 }), 'Citește postările': graph, 'Citește JSON curent': {} })[0].json;
  assert.equal(JSON.parse(doua.continut).postari.length, 2); assert.equal(doua.are_poze_noi, true); assert.deepEqual(doua.poze_noi.map(z => z.id), ['900']);
  assert.throws(() => ruleaza(cod(wP, 'Transformă postările'), {}, { Config: cfgP, 'Citește postările': { data: [] }, 'Citește JSON curent': {} }), /Page ID/);
  assert.throws(() => ruleaza(cod(wP, 'Transformă postările'), {}, { Config: cfgP, 'Citește postările': { error: { message: 'token expirat' } }, 'Citește JSON curent': {} }));
});

caz('workflow-ul: token-ul doar în credențială (Query Auth); pozele se descarcă, se redimensionează și se urcă în data/poze/; trigger zilnic', () => {
  const cfg = wP.nodes.find(x => x.name === 'Config').parameters.assignments.assignments;
  assert.ok(!cfg.some(a => /token|secret/i.test(a.name)));
  const http = wP.nodes.find(x => x.name === 'Citește postările');
  assert.equal(http.parameters.genericAuthType, 'httpQueryAuth'); assert.ok(/<<TODO/.test(http.credentials.httpQueryAuth.id));
  assert.ok(wP.nodes.some(x => x.name === 'Descarcă poza') && wP.nodes.some(x => x.type === 'n8n-nodes-base.editImage') && wP.nodes.some(x => x.name === 'Urcă poza' && x.parameters.operation === 'create'));
  assert.equal(wP.nodes.find(x => x.name === 'Scrie postari.json').parameters.filePath, 'data/postari.json');
  assert.equal(wP.nodes.find(x => x.type === 'n8n-nodes-base.scheduleTrigger').parameters.rule.interval[0].expression, '5 7 * * *');
});

console.log(n + ' cazuri trecute.');
