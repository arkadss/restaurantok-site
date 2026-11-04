// Workflow `site-cerere` (M2, extins la M3 și M4): webhook pentru formularele site-ului → validare → Telegram către Sorin
// → email de confirmare către client (SMTP) → (M8) WhatsApp Business către Sorin și, opțional, către client → log în Postgres (tabelul `cereri`) → răspuns { ok, id }.
// Tipuri acceptate de validare: sala (M2), catering (M3: tip_comanda, livrare, adresa, ora; șablon de email per tip), tort (M4), rezervare —
// cele viitoare trec deja de validarea de bază; M4 adaugă doar reguli și texte specifice în n8n/cod/valideaza-cerere.js.
// M8: WhatsApp e oprit implicit (Config.whatsapp = nu) și nu are nevoie de nimic la instalare; se pornește după go-live, când Sorin are
// un număr în WhatsApp Business Platform (Meta) și cele două șabloane aprobate (n8n/README.md, „M8 — WhatsApp Business").
'use strict';
module.exports = function ({ nod: fabrica, expr, CFG, c, leaga, COD }) {
  const nod = fabrica('m2c');
  // (numele nodurilor sunt stabile: testele și README-ul se referă la ele)
  const valideaza = COD('valideaza-cerere.js');
  const pregatestePoza = COD('pregateste-poza.js');
  const whatsapp = COD('whatsapp.js');
  const TELEGRAM = { telegramApi: { id: '<<TODO: id credențială>>', name: 'Telegram OK bot' } };
  const bool = (id, left) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [
    { id, leftValue: expr(`{{ ${left} }}`), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }
  ] }, options: {} });
  const cors = { entries: [{ name: 'Access-Control-Allow-Origin', value: expr(`{{ ${CFG('origine_permisa')} }}`) }, { name: 'Cache-Control', value: 'no-store' }] };

  const nodes = [
    nod('Webhook site-cerere', 'n8n-nodes-base.webhook', 2, [-620, 300], {
      httpMethod: 'POST', path: 'site-cerere', responseMode: 'responseNode',
      options: { allowedOrigins: 'https://restaurantok.com,https://www.restaurantok.com', ignoreBots: true, rawBody: false }
    }, { webhookId: '<<TODO: se generează la import>>', notes: 'URL public: https://hooks.restaurantok.com/webhook/site-cerere (prin tunelul cloudflared de pe orca, doar calea /webhook/). allowedOrigins răspunde la preflight-ul CORS al browserului.' }),
    nod('Config', 'n8n-nodes-base.set', 3.4, [-400, 300], {
      assignments: { assignments: [
        { id: 'a1', name: 'site_token', type: 'string', value: '<<TODO: același text ca în src/partials/head.html, meta ok-webhook-token>>' },
        { id: 'a2', name: 'telegram_chat_id', type: 'string', value: '<<TODO: chat ID-ul lui Sorin>>' },
        { id: 'a3', name: 'email_expeditor', type: 'string', value: 'contact@restaurantok.com' },
        { id: 'a4', name: 'email_copie', type: 'string', value: 'contact@restaurantok.com' },
        { id: 'a5', name: 'origine_permisa', type: 'string', value: 'https://restaurantok.com' },
        { id: 'a6', name: 'site_url', type: 'string', value: 'https://restaurantok.com' },
        { id: 'a7', name: 'telefon_afisat', type: 'string', value: '0785255855' },
        { id: 'a8', name: 'adresa_afisata', type: 'string', value: 'Str. A.I. Cuza nr. 26, Calafat, Dolj' },
        { id: 'a9', name: 'fus_orar', type: 'string', value: 'Europe/Bucharest' },
        { id: 'a10', name: 'director_poze', type: 'string', value: '/home/node/.n8n/poze-model' },
        // M8: WhatsApp Business (Cloud API). whatsapp = nu (implicit) | sorin | sorin+client. Token-ul stă în credențiala „Meta WhatsApp token", nu aici.
        { id: 'a11', name: 'whatsapp', type: 'string', value: 'nu' },
        { id: 'a12', name: 'whatsapp_phone_number_id', type: 'string', value: '<<TODO: Phone number ID (Meta → WhatsApp → API Setup); nu e numărul de telefon>>' },
        { id: 'a13', name: 'whatsapp_sorin', type: 'string', value: '<<TODO: numărul lui Sorin, format internațional fără +, ex. 407xxxxxxxx>>' },
        { id: 'a14', name: 'whatsapp_sablon_sorin', type: 'string', value: 'cerere_noua' },
        { id: 'a15', name: 'whatsapp_sablon_client', type: 'string', value: 'confirmare_cerere' },
        { id: 'a16', name: 'whatsapp_limba', type: 'string', value: 'ro' },
        { id: 'a17', name: 'whatsapp_api_url', type: 'string', value: 'https://graph.facebook.com/v21.0' }
      ] },
      includeOtherFields: true, options: {}
    }, { notes: 'Singurul loc de configurat. Token-ul din site este public (stă în HTML), deci e doar un filtru pentru roboți generici; protecția reală: rate limit în Cloudflare + honeypot. M8: whatsapp = nu | sorin | sorin+client; cât e „nu" sau Phone number ID e <<TODO>>, ramura WhatsApp e sărită.' }),
    nod('Validează cererea', 'n8n-nodes-base.code', 2, [-180, 300], { jsCode: valideaza }),
    nod('Este validă?', 'n8n-nodes-base.if', 2, [40, 300], bool('v1', '$json.ok')),
    nod('Anunță pe Telegram', 'n8n-nodes-base.telegram', 1.2, [280, 200], {
      chatId: expr(`{{ ${CFG('telegram_chat_id')} }}`), text: '={{ $json.telegram }}',
      additionalFields: { parse_mode: 'HTML', appendAttribution: false, disable_web_page_preview: true }
    }, { credentials: TELEGRAM, onError: 'continueRegularOutput', notes: 'Dacă Telegram cade, cererea tot ajunge în Postgres și clientul primește confirmarea.' }),
    // M4: poza-model a tortului (base64 în payload) → binar → Telegram (sendPhoto) + fișier pe orca; apoi fluxul continuă normal
    nod('Are poză?', 'n8n-nodes-base.if', 2, [520, 320], bool('p1', "$('Validează cererea').first().json.are_poza")),
    nod('Pregătește poza', 'n8n-nodes-base.code', 2, [760, 420], { jsCode: pregatestePoza }),
    nod('Trimite poza pe Telegram', 'n8n-nodes-base.telegram', 1.2, [1000, 420], {
      operation: 'sendPhoto', chatId: expr(`{{ ${CFG('telegram_chat_id')} }}`), binaryData: true, binaryPropertyName: 'poza',
      additionalFields: { caption: '={{ $json.legenda }}', appendAttribution: false }
    }, { credentials: TELEGRAM, onError: 'continueRegularOutput', notes: 'Poza-model ajunge la Sorin imediat după mesajul cu comanda.' }),
    nod('Salvează poza pe orca', 'n8n-nodes-base.readWriteFile', 1, [1240, 420], {
      operation: 'write', fileName: expr(`{{ ${CFG('director_poze')} + '/' + $('Pregătește poza').first().json.nume_fisier }}`), dataPropertyName: 'poza', options: {}
    }, { onError: 'continueRegularOutput', notes: 'Directorul (Config.director_poze) trebuie să existe în containerul n8n și să fie montat ca volum (vezi README). Dacă scrierea eșuează, fluxul continuă: poza a ajuns deja pe Telegram.' }),
    nod('Are email?', 'n8n-nodes-base.if', 2, [520, 200], bool('e1', "$('Validează cererea').first().json.are_email")),
    nod('Email de confirmare', 'n8n-nodes-base.emailSend', 2.1, [760, 100], {
      fromEmail: expr(`{{ ${CFG('email_expeditor')} }}`), toEmail: "={{ $('Validează cererea').first().json.cerere.email }}",
      subject: "={{ $('Validează cererea').first().json.email_subiect }}", emailFormat: 'text', text: "={{ $('Validează cererea').first().json.email_text }}",
      options: { ccEmail: expr(`{{ ${CFG('email_copie')} }}`), replyTo: expr(`{{ ${CFG('email_expeditor')} }}`), appendAttribution: false }
    }, { credentials: { smtp: { id: '<<TODO: id credențială>>', name: 'SMTP contact@restaurantok.com' } }, onError: 'continueRegularOutput', notes: 'Text simplu, fără HTML, de la contact@restaurantok.com; copie la restaurant. Dacă SMTP-ul nu merge, fluxul continuă.' }),
    // M8: WhatsApp Business (Cloud API) — mesaje-șablon către Sorin și, opțional, către client; oprit implicit, sărit cât Config e placeholder
    nod('Trimitem pe WhatsApp?', 'n8n-nodes-base.if', 2, [1000, 200], bool('w1',
      `String(${CFG('whatsapp')} || 'nu').trim().toLowerCase() !== 'nu' && !/<<TODO/.test(String(${CFG('whatsapp_phone_number_id')} || '')) && !/<<TODO/.test(String(${CFG('whatsapp_sorin')} || ''))`),
      { notes: 'Config.whatsapp = sorin | sorin+client și Phone number ID + numărul lui Sorin completate → ramura WhatsApp; altfel direct la Postgres. Telegram și emailul rămân oricum.' }),
    nod('Pregătește WhatsApp', 'n8n-nodes-base.code', 2, [1240, 100], { jsCode: whatsapp },
      { notes: 'n8n/cod/whatsapp.js: un item pe destinatar, cu corpul JSON al mesajului de tip „template" (parametrii curățați: fără rânduri noi, niciodată goi). Șabloanele „cerere_noua" și „confirmare_cerere" trebuie aprobate în WhatsApp Manager (textele: n8n/README.md).' }),
    nod('Avem mesaje?', 'n8n-nodes-base.if', 2, [1480, 100], bool('w2', '!$json.sari')),
    nod('Trimite pe WhatsApp', 'n8n-nodes-base.httpRequest', 4.2, [1720, 0], {
      method: 'POST', url: '={{ $json.url }}',
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}',
      options: { timeout: 15000 }
    }, { credentials: { httpHeaderAuth: { id: '<<TODO: id credențială>>', name: 'Meta WhatsApp token' } }, onError: 'continueRegularOutput',
      notes: 'POST https://graph.facebook.com/v21.0/<Phone number ID>/messages, antetul Authorization: Bearer <token> din credențiala „Meta WhatsApp token" (Header Auth). La eroare (token expirat, șablon neaprobat, număr fără WhatsApp) fluxul continuă: cererea a ajuns deja pe Telegram și în email.' }),
    nod('Rândul pentru Postgres', 'n8n-nodes-base.code', 2, [1960, 200], {
      jsCode: "// Un singur item cu exact coloanele tabelului `cereri` (n8n/sql/cereri.sql), pentru maparea automată din nodul Postgres.\nreturn [{ json: $('Validează cererea').first().json.rand }];"
    }),
    nod('Salvează în Postgres', 'n8n-nodes-base.postgres', 2.5, [2200, 200], {
      operation: 'insert', schema: { __rl: true, mode: 'list', value: 'public' }, table: { __rl: true, mode: 'list', value: 'cereri' },
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] }, options: {}
    }, { credentials: { postgres: { id: '<<TODO: id credențială>>', name: 'Postgres n8n (orca)' } }, onError: 'continueRegularOutput', notes: 'Tabelul se creează o dată cu n8n/sql/cereri.sql. Dacă tabelul lipsește, fluxul continuă (cererea a plecat deja pe Telegram).' }),
    nod('Răspunde OK', 'n8n-nodes-base.respondToWebhook', 1.1, [2440, 200], {
      respondWith: 'json', responseBody: "={{ JSON.stringify($('Validează cererea').first().json.raspuns) }}",
      options: { responseCode: 200, responseHeaders: cors }
    }),
    nod('Răspunde cu eroare', 'n8n-nodes-base.respondToWebhook', 1.1, [280, 440], {
      respondWith: 'json', responseBody: '={{ JSON.stringify($json.raspuns) }}',
      options: { responseCode: '={{ $json.status || 400 }}', responseHeaders: cors }
    }, { notes: 'Honeypot sau token greșit → tot 200 { ok: true } (roboții nu află că au fost filtrați), dar fără notificare și fără log.' })
  ];

  const legaturi = [
    c('Webhook site-cerere', 'Config'), c('Config', 'Validează cererea'), c('Validează cererea', 'Este validă?'),
    c('Este validă?', 'Anunță pe Telegram', 0), c('Este validă?', 'Răspunde cu eroare', 1),
    c('Anunță pe Telegram', 'Are poză?'), c('Are poză?', 'Pregătește poza', 0), c('Are poză?', 'Are email?', 1),
    c('Pregătește poza', 'Trimite poza pe Telegram'), c('Trimite poza pe Telegram', 'Salvează poza pe orca'), c('Salvează poza pe orca', 'Are email?'),
    c('Are email?', 'Email de confirmare', 0), c('Are email?', 'Trimitem pe WhatsApp?', 1),
    c('Email de confirmare', 'Trimitem pe WhatsApp?'),
    // M8: WhatsApp (opțional) înainte de Postgres; ambele ieșiri ajung la „Rândul pentru Postgres"
    c('Trimitem pe WhatsApp?', 'Pregătește WhatsApp', 0), c('Trimitem pe WhatsApp?', 'Rândul pentru Postgres', 1),
    c('Pregătește WhatsApp', 'Avem mesaje?'), c('Avem mesaje?', 'Trimite pe WhatsApp', 0), c('Avem mesaje?', 'Rândul pentru Postgres', 1),
    c('Trimite pe WhatsApp', 'Rândul pentru Postgres'),
    c('Rândul pentru Postgres', 'Salvează în Postgres'), c('Salvează în Postgres', 'Răspunde OK')
  ];

  return {
    name: 'OK · cereri de pe site (M2–M4, M8)',
    nodes, connections: leaga(legaturi),
    settings: { executionOrder: 'v1', timezone: 'Europe/Bucharest', saveManualExecutions: true, callerPolicy: 'workflowsFromSameOwner' },
    staticData: null, pinData: {}, tags: [],
    meta: { templateCredsSetupCompleted: false, descriere: 'POST /webhook/site-cerere (tip sala | catering | tort) → validare → Telegram (+ poza-model la tort) → email SMTP (șablon per tip) → WhatsApp Business (M8, opțional: Sorin și/sau client) → Postgres → { ok, id }. Vezi n8n/README.md.' }
  };
};
