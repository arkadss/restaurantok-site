// Workflow `postari-facebook` (M5): zilnic, Graph API /{page-id}/posts → data/postari.json (+ pozele noi în data/poze/) → commit GitHub.
// Site-ul ascunde secțiunea „Noutăți" dacă `actualizat` e mai vechi de 14 zile. Pozele de pe Facebook sunt URL-uri care expiră,
// așa că fiecare poză nouă se descarcă o singură dată, se redimensionează (max 1200 px, JPEG) și se urcă în repo la data/poze/post-<id>.jpg.
// Token-ul paginii stă într-o credențială n8n de tip „Query Auth" (parametrul access_token), nu în nodul Config.
'use strict';
module.exports = function ({ nod: fabrica, expr, CFG, rl, c, leaga, COD }) {
  const nod = fabrica('m5p');
  const GITHUB = { githubApi: { id: '<<TODO: id credențială>>', name: 'GitHub PAT site' } };
  const TELEGRAM = { telegramApi: { id: '<<TODO: id credențială>>', name: 'Telegram OK bot' } };
  const bool = (id, left) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [
    { id, leftValue: expr(`{{ ${left} }}`), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }
  ] }, options: {} });

  const nodes = [
    nod('Zilnic 07:05', 'n8n-nodes-base.scheduleTrigger', 1.2, [-860, 300], { rule: { interval: [{ field: 'cronExpression', expression: '5 7 * * *' }] } },
      { notes: 'Fusul orar din setările workflow-ului: Europe/Bucharest. Poți rula și manual după o postare importantă.' }),
    nod('Config', 'n8n-nodes-base.set', 3.4, [-640, 300], {
      assignments: { assignments: [
        { id: 'a1', name: 'page_id', type: 'string', value: '<<TODO: ID-ul numeric al paginii OkCalafat (vezi README, M5)>>' },
        { id: 'a2', name: 'github_owner', type: 'string', value: '<<TODO: utilizatorul/organizația GitHub>>' },
        { id: 'a3', name: 'github_repo', type: 'string', value: '<<TODO: restaurantok-site>>' },
        { id: 'a4', name: 'telegram_chat_id', type: 'string', value: '<<TODO: chat ID-ul lui Sorin>>' },
        { id: 'a5', name: 'url_pagina', type: 'string', value: 'https://www.facebook.com/OkCalafat' },
        { id: 'a6', name: 'max_postari', type: 'number', value: 3 },
        { id: 'a7', name: 'graph_versiune', type: 'string', value: 'v21.0' },
        { id: 'a8', name: 'fus_orar', type: 'string', value: 'Europe/Bucharest' }
      ] },
      includeOtherFields: true, options: {}
    }, { notes: 'Token-ul paginii NU stă aici: e în credențiala „Meta Page token" (Query Auth, parametrul access_token) a nodului HTTP.' }),
    nod('Citește postările', 'n8n-nodes-base.httpRequest', 4.2, [-420, 300], {
      method: 'GET', url: expr(`{{ 'https://graph.facebook.com/' + ${CFG('graph_versiune')} + '/' + ${CFG('page_id')} + '/posts' }}`),
      authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendQuery: true, queryParameters: { parameters: [{ name: 'fields', value: 'message,full_picture,permalink_url,created_time' }, { name: 'limit', value: '10' }] },
      options: { timeout: 20000 }
    }, { credentials: { httpQueryAuth: { id: '<<TODO: id credențială>>', name: 'Meta Page token' } }, notes: 'Permisiuni necesare pe token: pages_read_engagement, pages_show_list (și pages_read_user_content pentru pagini noi).' }),
    nod('Citește JSON curent', 'n8n-nodes-base.github', 1, [-200, 300], {
      resource: 'file', operation: 'get', owner: rl(expr(`{{ ${CFG('github_owner')} }}`)), repository: rl(expr(`{{ ${CFG('github_repo')} }}`)),
      filePath: 'data/postari.json', asBinaryProperty: false, additionalParameters: {}
    }, { credentials: GITHUB, onError: 'continueRegularOutput', notes: 'Ca să știm ce poze sunt deja în repo. Dacă fișierul lipsește, continuă (toate pozele sunt „noi").' }),
    nod('Transformă postările', 'n8n-nodes-base.code', 2, [20, 300], { jsCode: COD('postari.js') },
      { notes: 'Primește răspunsul HTTP prin $(\'Citește postările\') și JSON-ul curent prin $(\'Citește JSON curent\').' }),
    nod('Scrie postari.json', 'n8n-nodes-base.github', 1, [240, 300], {
      resource: 'file', operation: 'edit', owner: rl(expr(`{{ ${CFG('github_owner')} }}`)), repository: rl(expr(`{{ ${CFG('github_repo')} }}`)),
      filePath: 'data/postari.json', fileContent: '={{ $json.continut }}', commitMessage: '={{ $json.commit }}'
    }, { credentials: GITHUB, onError: 'continueErrorOutput', notes: 'Operația „edit" cere ca fișierul să existe deja în repo (exemplul din data/ e de ajuns).' }),
    nod('Are poze noi?', 'n8n-nodes-base.if', 2, [480, 300], bool('p1', "$('Transformă postările').first().json.are_poze_noi")),
    nod('Desfă pozele', 'n8n-nodes-base.splitOut', 1, [720, 200], { fieldToSplitOut: 'poze_noi', options: {} },
      { notes: 'Un item per poză nouă: { id, url, cale }.' }),
    nod('Descarcă poza', 'n8n-nodes-base.httpRequest', 4.2, [960, 200], {
      method: 'GET', url: '={{ $json.url }}', options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } }, timeout: 30000 }
    }, { onError: 'continueRegularOutput', notes: 'URL-ul semnat de Facebook; dacă a expirat între timp, item-ul trece mai departe fără binar și „Urcă poza" îl sare.' }),
    nod('Redimensionează', 'n8n-nodes-base.editImage', 1, [1200, 200], { operation: 'resize', width: 1200, height: 1200, resizeOption: 'onlyIfLarger', options: { format: 'jpeg', quality: 82 } },
      { onError: 'continueRegularOutput', notes: 'Max 1200 px pe latura mare, JPEG 82%.' }),
    nod('Urcă poza', 'n8n-nodes-base.github', 1, [1440, 200], {
      resource: 'file', operation: 'create', owner: rl(expr(`{{ ${CFG('github_owner')} }}`)), repository: rl(expr(`{{ ${CFG('github_repo')} }}`)),
      filePath: "={{ $('Desfă pozele').item.json.cale }}", binaryData: true, binaryPropertyName: 'data', commitMessage: "=data: poză postare {{ $('Desfă pozele').item.json.cale }}"
    }, { credentials: GITHUB, onError: 'continueRegularOutput', notes: 'Dacă fișierul există deja (rulare repetată), GitHub răspunde 422 și item-ul trece mai departe.' }),
    nod('Anunță eroarea', 'n8n-nodes-base.telegram', 1.2, [480, 460], {
      chatId: expr(`{{ ${CFG('telegram_chat_id')} }}`),
      text: '=⚠️ Postările de pe Facebook nu s-au putut publica pe site: {{ $json.error ? ($json.error.message || JSON.stringify($json.error)) : "eroare necunoscută" }}',
      additionalFields: { appendAttribution: false }
    }, { credentials: TELEGRAM, notes: 'Doar la eroare. Dacă rămâne fără actualizare 14 zile, site-ul ascunde singur secțiunea.' })
  ];

  const legaturi = [
    c('Zilnic 07:05', 'Config'), c('Config', 'Citește postările'), c('Citește postările', 'Citește JSON curent'), c('Citește JSON curent', 'Transformă postările'),
    c('Transformă postările', 'Scrie postari.json'), c('Scrie postari.json', 'Are poze noi?', 0), c('Scrie postari.json', 'Anunță eroarea', 1),
    c('Are poze noi?', 'Desfă pozele', 0), c('Desfă pozele', 'Descarcă poza'), c('Descarcă poza', 'Redimensionează'), c('Redimensionează', 'Urcă poza')
  ];

  return {
    name: 'OK · postări Facebook (M5)',
    nodes, connections: leaga(legaturi),
    settings: { executionOrder: 'v1', timezone: 'Europe/Bucharest', saveManualExecutions: true, callerPolicy: 'workflowsFromSameOwner' },
    staticData: null, pinData: {}, tags: [],
    meta: { templateCredsSetupCompleted: false, descriere: 'Zilnic: Facebook Graph API → data/postari.json + data/poze/post-<id>.jpg → commit GitHub → Cloudflare Pages. Vezi n8n/README.md.' }
  };
};
