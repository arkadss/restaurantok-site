#!/usr/bin/env node
// Generează workflow-urile importabile în n8n din sursele din n8n/cod/ și n8n/def/:
//   node n8n/genereaza.js        → scrie n8n/meniu-zilei.json (M1 + traducerile și editarea conținutului M8), n8n/site-cerere.json și n8n/sala-disponibilitate.json (M2), M5, M6
//   node n8n/valideaza.js        → verifică structura fișierelor generate
// Codul nodurilor Code stă în fișiere separate ca să poată fi testat (tests/parseaza-meniu.test.js, tests/n8n-cerere.test.js, tests/n8n-sala.test.js).
// Definițiile M2 stau în n8n/def/*.js și primesc utilitarele de mai jos (nod, expr, CFG, rl, leaga).
'use strict';
const fs = require('fs');
const path = require('path');

const COD = p => fs.readFileSync(path.join(__dirname, 'cod', p), 'utf8');
const parser = COD('parseaza-meniu.js');
const editare = COD('editare.js'); // M8: editarea conținutului prin Telegram
const interpreteaza = COD('interpreteaza.js').replace('/*__PARSER__*/', parser).replace('/*__EDITARE__*/', editare);
const aplicaEditare = COD('aplica-editare.js').replace('/*__EDITARE__*/', editare);
const imbina = COD('imbina.js');
const traduceri = COD('traduceri.js').replace('/*__GLOSAR__*/', COD('glosar-meniu.js')); // M8

const AJUTOR = [
  'Scrie meniul zilei ca pe Facebook, pe un rând sau câte un preparat pe rând. Exemple:',
  '',
  '<code>Meniul zilei, 20 octombrie: ciorbă de perișoare, crap prăjit cu mămăligă și mujdei, salată de varză. 24 lei.</code>',
  '',
  '<code>Mâine\nCiorbă de legume\nPui la cuptor cu cartofi (gluten, lapte)\nMurături (fără)</code>',
  '',
  '• fără dată: seara (după 14:00) înseamnă mâine, dimineața înseamnă azi;',
  '• alergenii se detectează automat; îi corectezi cu <code>alergeni 2: gluten, ou</code> sau îi scrii în paranteză după preparat;',
  '• pozele le trimiți separat, după text; apar pe site în ~1 minut;',
  '• <code>gata</code> închide meniul mai devreme de ora stabilită;',
  '• traducerile EN/BG se fac automat (glosar sau DeepL); le corectezi cu <code>en 2: Fried carp with polenta</code> sau <code>bg 2: …</code>;',
  '• programul, zilele închise, meniul săptămânii, prețurile torturilor și ale cateringului se schimbă tot de aici: scrie <code>editare</code> pentru comenzi.'
].join('\n');
// M8: ajutorul pentru comenzile de editare vine din n8n/cod/editare.js (Editare.AJUTOR), ca să fie același în test și în workflow
const AJUTOR_EDITARE = (function () { const module = { exports: {} }; new Function('module', editare)(module); return module.exports.AJUTOR; })();

let id = 0;
const nod = (name, type, typeVersion, position, parameters, extra) => Object.assign({ parameters, id: `m1-${String(++id).padStart(2, '0')}`, name, type, typeVersion, position }, extra || {});
const expr = s => '=' + s;
const CFG = k => `$('Config').first().json.${k}`;
const rl = v => ({ __rl: true, mode: 'name', value: v });

const nodes = [
  nod('Telegram Trigger', 'n8n-nodes-base.telegramTrigger', 1.1, [-620, 200], { updates: ['message'], additionalFields: {} },
    { credentials: { telegramApi: { id: '<<TODO: id credențială>>', name: 'Telegram OK bot' } } }),
  nod('Trigger 16:00', 'n8n-nodes-base.scheduleTrigger', 1.2, [-620, 440], { rule: { interval: [{ field: 'cronExpression', expression: '0 16 * * 1-6' }] } },
    { notes: 'Marchează valabil_pana ca trecut la ora închiderii (luni–sâmbătă). Fusul orar vine din setările workflow-ului: Europe/Bucharest.' }),
  nod('Config', 'n8n-nodes-base.set', 3.4, [-380, 320], {
    assignments: { assignments: [
      { id: 'a1', name: 'github_owner', type: 'string', value: '<<TODO: utilizatorul/organizația GitHub>>' },
      { id: 'a2', name: 'github_repo', type: 'string', value: '<<TODO: restaurantok-site>>' },
      { id: 'a3', name: 'telegram_chat_id', type: 'string', value: '<<TODO: chat ID-ul lui Sorin>>' },
      { id: 'a4', name: 'site_url', type: 'string', value: 'https://restaurantok.com' },
      { id: 'a5', name: 'fus_orar', type: 'string', value: 'Europe/Bucharest' },
      { id: 'a6', name: 'pret_implicit', type: 'number', value: 24 },
      { id: 'a7', name: 'ora_inchidere', type: 'string', value: '16:00' },
      { id: 'a8', name: 'telefon_afisat', type: 'string', value: '0785255855' },
      { id: 'a9', name: 'traducere', type: 'string', value: 'glosar' },
      { id: 'a10', name: 'deepl_url', type: 'string', value: 'https://api-free.deepl.com/v2/translate' }
    ] },
    includeOtherFields: true, options: {}
  }, { notes: 'Singurul loc de configurat. Secretele (token-uri) stau în credențialele n8n, nu aici. M8: traducere = glosar (implicit, fără internet) | deepl (cheia în credențiala „DeepL API key"; deepl_url = api-free.deepl.com pentru planul gratuit, api.deepl.com pentru Pro) | nu.' }),
  nod('Este Sorin?', 'n8n-nodes-base.if', 2, [-160, 320], {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [
      { id: 'c1', leftValue: expr(`{{ !$json.message || String($json.message.chat.id) === String(${CFG('telegram_chat_id')}) }}`), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }
    ] }, options: {}
  }, { notes: 'Mesajele din alte chat-uri sunt ignorate. Trigger-ul de la 16:00 (fără message) trece mai departe.' }),
  nod('Interpretează mesajul', 'n8n-nodes-base.code', 2, [60, 320], { jsCode: interpreteaza }),
  nod('Ce facem?', 'n8n-nodes-base.switch', 3, [280, 320], {
    rules: { values: ['meniu', 'poza', 'gata', 'alergeni', 'ajutor', 'traducere', 'editare'].map((k, i) => ({
      conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and', conditions: [
        { id: `s${i}`, leftValue: '={{ $json.actiune }}', rightValue: k, operator: { type: 'string', operation: 'equals' } }
      ] }, renameOutput: true, outputKey: k
    })) }, options: {}
  }),
  // ---- M8: traduceri EN/BG pentru numele preparatelor (doar ramura „meniu") ----
  nod('Traducem cu DeepL?', 'n8n-nodes-base.if', 2, [520, 320], {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [
      { id: 't1', leftValue: expr(`{{ String(${CFG('traducere')} || '').trim().toLowerCase() === 'deepl' }}`), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }
    ] }, options: {}
  }, { notes: 'Config.traducere = deepl → cele două noduri DeepL; altfel direct la „Traduceri" (glosarul local sau nimic).' }),
  nod('DeepL EN', 'n8n-nodes-base.httpRequest', 4.2, [740, 240], {
    method: 'POST', url: expr(`{{ ${CFG('deepl_url')} }}`),
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendBody: true, specifyBody: 'json',
    jsonBody: expr(`{{ JSON.stringify({ text: $('Interpretează mesajul').first().json.meniu.preparate.map(p => p.nume), source_lang: 'RO', target_lang: 'EN-GB', context: 'Numele preparatelor din meniul zilei al unui restaurant din România.' }) }}`),
    options: { timeout: 20000 }
  }, { onError: 'continueRegularOutput', credentials: { httpHeaderAuth: { id: '<<TODO: id credențială>>', name: 'DeepL API key' } }, notes: 'DeepL API: antetul Authorization: DeepL-Auth-Key <cheie> stă în credențiala „DeepL API key" (Header Auth). La eroare continuă: „Traduceri" cade pe glosar.' }),
  nod('DeepL BG', 'n8n-nodes-base.httpRequest', 4.2, [960, 240], {
    method: 'POST', url: expr(`{{ ${CFG('deepl_url')} }}`),
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendBody: true, specifyBody: 'json',
    jsonBody: expr(`{{ JSON.stringify({ text: $('Interpretează mesajul').first().json.meniu.preparate.map(p => p.nume), source_lang: 'RO', target_lang: 'BG', context: 'Numele preparatelor din meniul zilei al unui restaurant din România.' }) }}`),
    options: { timeout: 20000 }
  }, { onError: 'continueRegularOutput', credentials: { httpHeaderAuth: { id: '<<TODO: id credențială>>', name: 'DeepL API key' } } }),
  nod('Traduceri', 'n8n-nodes-base.code', 2, [1180, 320], { jsCode: traduceri },
    { notes: 'Glosar RO→EN/BG local (n8n/cod/glosar-meniu.js) sau răspunsurile DeepL; ce nu se poate traduce rămâne null (site-ul arată româna). Corecții manuale: „en 2: …" / „bg 2: …".' }),
  nod('Descarcă poza', 'n8n-nodes-base.telegram', 1.2, [520, 100], { resource: 'file', fileId: '={{ $json.file_id }}', additionalFields: {} },
    { credentials: { telegramApi: { id: '<<TODO: id credențială>>', name: 'Telegram OK bot' } } }),
  nod('Redimensionează', 'n8n-nodes-base.editImage', 1, [740, 100], { operation: 'resize', width: 1200, height: 1200, resizeOption: 'onlyIfLarger', options: { format: 'jpeg', quality: 82 } },
    { notes: 'Max 1200 px pe latura mare, JPEG 82%. Pentru ≤200 KB garantat, scade quality la 75.' }),
  nod('Citește JSON curent', 'n8n-nodes-base.github', 1, [1420, 320], {
    resource: 'file', operation: 'get', owner: rl(expr(`{{ ${CFG('github_owner')} }}`)), repository: rl(expr(`{{ ${CFG('github_repo')} }}`)),
    filePath: 'data/meniu-zilei.json', asBinaryProperty: false, additionalParameters: {}
  }, { onError: 'continueRegularOutput', credentials: { githubApi: { id: '<<TODO: id credențială>>', name: 'GitHub PAT site' } }, notes: 'Dacă fișierul nu există încă, continuă cu eroarea în item; „Îmbină" tratează cazul.' }),
  nod('Îmbină', 'n8n-nodes-base.code', 2, [1640, 320], { jsCode: imbina }),
  nod('Scriem?', 'n8n-nodes-base.if', 2, [1860, 320], {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [
      { id: 'w1', leftValue: '={{ $json.scrie }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }
    ] }, options: {}
  }),
  nod('Scrie meniu-zilei.json', 'n8n-nodes-base.github', 1, [2100, 240], {
    resource: 'file', operation: 'edit', owner: rl(expr(`{{ ${CFG('github_owner')} }}`)), repository: rl(expr(`{{ ${CFG('github_repo')} }}`)),
    filePath: 'data/meniu-zilei.json', fileContent: '={{ $json.continut }}', commitMessage: '={{ $json.commit }}'
  }, { credentials: { githubApi: { id: '<<TODO: id credențială>>', name: 'GitHub PAT site' } }, notes: 'Dacă fișierul nu există deloc în repo (prima rulare), creează-l o dată manual sau schimbă operația în „create".' }),
  nod('Are poză?', 'n8n-nodes-base.if', 2, [2340, 240], {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [
      { id: 'p1', leftValue: expr("{{ $('Îmbină').first().json.are_poza }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }
    ] }, options: {}
  }),
  nod('Pregătește poza', 'n8n-nodes-base.code', 2, [2580, 140], {
    jsCode: "// Pune binarul redimensionat lângă datele din „Îmbină\" pentru nodul GitHub de încărcare.\nreturn [{ json: $('Îmbină').first().json, binary: $('Redimensionează').first().binary }];"
  }),
  nod('Urcă poza', 'n8n-nodes-base.github', 1, [2820, 140], {
    resource: 'file', operation: 'create', owner: rl(expr(`{{ ${CFG('github_owner')} }}`)), repository: rl(expr(`{{ ${CFG('github_repo')} }}`)),
    filePath: '={{ $json.cale_poza }}', binaryData: true, binaryPropertyName: 'data', commitMessage: '=data: poză meniul zilei {{ $json.cale_poza }}'
  }, { credentials: { githubApi: { id: '<<TODO: id credențială>>', name: 'GitHub PAT site' } } }),
  nod('Confirmă', 'n8n-nodes-base.telegram', 1.2, [3060, 320], {
    chatId: expr(`{{ ${CFG('telegram_chat_id')} }}`), text: "={{ $('Îmbină').first().json.mesaj }}",
    additionalFields: { parse_mode: 'HTML', appendAttribution: false, disable_web_page_preview: true }
  }, { credentials: { telegramApi: { id: '<<TODO: id credențială>>', name: 'Telegram OK bot' } } }),
  // ---- M8: editarea conținutului (program.json / catering.json / torturi.json) din comenzi Telegram ----
  nod('Citește fișierul de editat', 'n8n-nodes-base.github', 1, [520, 760], {
    resource: 'file', operation: 'get', owner: rl(expr(`{{ ${CFG('github_owner')} }}`)), repository: rl(expr(`{{ ${CFG('github_repo')} }}`)),
    filePath: '={{ $json.fisier }}', asBinaryProperty: false, additionalParameters: {}
  }, { onError: 'continueRegularOutput', credentials: { githubApi: { id: '<<TODO: id credențială>>', name: 'GitHub PAT site' } }, notes: 'Fișierul ales de comandă: data/program.json, data/catering.json sau data/torturi.json. Dacă lipsește, „Aplică modificarea" răspunde cu eroare (fișierele din data/ trebuie să existe în repo).' }),
  nod('Aplică modificarea', 'n8n-nodes-base.code', 2, [740, 760], { jsCode: aplicaEditare },
    { notes: 'n8n/cod/aplica-editare.js + editare.js: aplică comanda („închis 25.12", „program cofetărie: …", „săptămâna: …", „tort …", „catering …") pe JSON-ul citit; „arată …" doar răspunde.' }),
  nod('Scriem modificarea?', 'n8n-nodes-base.if', 2, [960, 760], {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [
      { id: 'e1', leftValue: '={{ $json.scrie }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }
    ] }, options: {}
  }),
  nod('Scrie fișierul editat', 'n8n-nodes-base.github', 1, [1180, 680], {
    resource: 'file', operation: 'edit', owner: rl(expr(`{{ ${CFG('github_owner')} }}`)), repository: rl(expr(`{{ ${CFG('github_repo')} }}`)),
    filePath: '={{ $json.fisier }}', fileContent: '={{ $json.continut }}', commitMessage: '={{ $json.commit }}'
  }, { credentials: { githubApi: { id: '<<TODO: id credențială>>', name: 'GitHub PAT site' } }, onError: 'continueErrorOutput', notes: 'Commit în data/<fișier>.json → Cloudflare Pages redeploy. Ieșirea de eroare merge la „Confirmă editarea" cu mesaj de eroare.' }),
  nod('Confirmă editarea', 'n8n-nodes-base.telegram', 1.2, [1420, 760], {
    chatId: expr(`{{ ${CFG('telegram_chat_id')} }}`),
    text: "={{ $json.error ? '⚠️ Nu am putut scrie ' + $('Aplică modificarea').first().json.fisier + ' în repo: ' + ($json.error.message || JSON.stringify($json.error)) : $('Aplică modificarea').first().json.mesaj }}",
    additionalFields: { parse_mode: 'HTML', appendAttribution: false, disable_web_page_preview: true }
  }, { credentials: { telegramApi: { id: '<<TODO: id credențială>>', name: 'Telegram OK bot' } } }),
  nod('Răspunde ajutor', 'n8n-nodes-base.telegram', 1.2, [520, 540], {
    chatId: expr(`{{ ${CFG('telegram_chat_id')} }}`),
    text: expr(`{{ ($json.eroare ? '⚠️ ' + $json.eroare + '\\n\\n' : '') + ($json.ajutor_editare ? ${JSON.stringify(AJUTOR_EDITARE)} : ${JSON.stringify(AJUTOR)}) }}`),
    additionalFields: { parse_mode: 'HTML', appendAttribution: false }
  }, { credentials: { telegramApi: { id: '<<TODO: id credențială>>', name: 'Telegram OK bot' } } })
];

const c = (from, to, out = 0) => ({ from, to, out });
const legaturi = [
  c('Telegram Trigger', 'Config'), c('Trigger 16:00', 'Config'),
  c('Config', 'Este Sorin?'), c('Este Sorin?', 'Interpretează mesajul', 0),
  c('Interpretează mesajul', 'Ce facem?'),
  c('Ce facem?', 'Traducem cu DeepL?', 0), c('Ce facem?', 'Descarcă poza', 1), c('Ce facem?', 'Citește JSON curent', 2), c('Ce facem?', 'Citește JSON curent', 3), c('Ce facem?', 'Răspunde ajutor', 4), c('Ce facem?', 'Citește JSON curent', 5),
  c('Ce facem?', 'Citește fișierul de editat', 6), // M8 editare
  c('Citește fișierul de editat', 'Aplică modificarea'), c('Aplică modificarea', 'Scriem modificarea?'),
  c('Scriem modificarea?', 'Scrie fișierul editat', 0), c('Scriem modificarea?', 'Confirmă editarea', 1),
  c('Scrie fișierul editat', 'Confirmă editarea', 0), c('Scrie fișierul editat', 'Confirmă editarea', 1),
  c('Traducem cu DeepL?', 'DeepL EN', 0), c('Traducem cu DeepL?', 'Traduceri', 1), c('DeepL EN', 'DeepL BG'), c('DeepL BG', 'Traduceri'), c('Traduceri', 'Citește JSON curent'),
  c('Descarcă poza', 'Redimensionează'), c('Redimensionează', 'Citește JSON curent'),
  c('Citește JSON curent', 'Îmbină'), c('Îmbină', 'Scriem?'),
  c('Scriem?', 'Scrie meniu-zilei.json', 0), c('Scriem?', 'Confirmă', 1),
  c('Scrie meniu-zilei.json', 'Are poză?'), c('Are poză?', 'Pregătește poza', 0), c('Are poză?', 'Confirmă', 1),
  c('Pregătește poza', 'Urcă poza'), c('Urcă poza', 'Confirmă')
];
function leaga(legaturi) {
  const connections = {};
  for (const l of legaturi) {
    const m = (connections[l.from] = connections[l.from] || { main: [] });
    while (m.main.length <= l.out) m.main.push([]);
    m.main[l.out].push({ node: l.to, type: 'main', index: 0 });
  }
  return connections;
}
const connections = leaga(legaturi);

const workflow = {
  name: 'OK · meniul zilei (M1)',
  nodes, connections,
  settings: { executionOrder: 'v1', timezone: 'Europe/Bucharest', saveManualExecutions: true, callerPolicy: 'workflowsFromSameOwner' },
  staticData: null, pinData: {}, tags: [],
  meta: { templateCredsSetupCompleted: false, descriere: 'Telegram → data/meniu-zilei.json (+ poze) → commit GitHub → Cloudflare Pages; de la M8 și editarea program.json / catering.json / torturi.json din comenzi Telegram. Vezi n8n/README.md.' }
};
function scrie(nume, w) {
  const out = path.join(__dirname, nume);
  fs.writeFileSync(out, JSON.stringify(w, null, 2) + '\n');
  console.log(`OK: ${w.nodes.length} noduri, ${Object.keys(w.connections).length} noduri cu ieșiri → ${path.relative(process.cwd(), out)}`);
}
scrie('meniu-zilei.json', workflow);

// ---- M2: definițiile din n8n/def/ primesc aceleași utilitare ----
const utilitare = { nod: (prefix) => { let k = 0; return (name, type, typeVersion, position, parameters, extra) => Object.assign({ parameters, id: `${prefix}-${String(++k).padStart(2, '0')}`, name, type, typeVersion, position }, extra || {}); }, expr, CFG, rl, c, leaga, COD };
scrie('site-cerere.json', require('./def/site-cerere.js')(utilitare));
scrie('sala-disponibilitate.json', require('./def/sala-disponibilitate.js')(utilitare));
scrie('recenzii-google.json', require('./def/recenzii-google.js')(utilitare));
scrie('postari-facebook.json', require('./def/postari-facebook.js')(utilitare));
scrie('evenimente.json', require('./def/evenimente.js')(utilitare));
