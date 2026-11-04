// Workflow `recenzii-google` (M5): săptămânal, Google Places API (New), Place Details → data/recenzii.json → commit GitHub.
// Site-ul ascunde secțiunea de recenzii dacă `actualizat` e mai vechi de 30 de zile, deci rularea săptămânală o ține „vie" chiar fără recenzii noi.
// Cheia API stă într-o credențială n8n de tip „Header Auth" (X-Goog-Api-Key), nu în nodul Config.
'use strict';
module.exports = function ({ nod: fabrica, expr, CFG, rl, c, leaga, COD }) {
  const nod = fabrica('m5r');
  const GITHUB = { githubApi: { id: '<<TODO: id credențială>>', name: 'GitHub PAT site' } };
  const TELEGRAM = { telegramApi: { id: '<<TODO: id credențială>>', name: 'Telegram OK bot' } };

  const nodes = [
    nod('Săptămânal, luni 06:20', 'n8n-nodes-base.scheduleTrigger', 1.2, [-620, 300], { rule: { interval: [{ field: 'cronExpression', expression: '20 6 * * 1' }] } },
      { notes: 'Fusul orar din setările workflow-ului: Europe/Bucharest. Google limitează Place Details la cele mai relevante 5 recenzii; o rulare pe săptămână e de ajuns.' }),
    nod('Config', 'n8n-nodes-base.set', 3.4, [-400, 300], {
      assignments: { assignments: [
        { id: 'a1', name: 'place_id', type: 'string', value: 'ChIJh_Ql7G16U0cRS6gH1eRpkXQ' },
        { id: 'a7', name: 'place_id_sala', type: 'string', value: 'ChIJUTLVbPp7U0cRm8XEqzEZbms' },
        { id: 'a2', name: 'github_owner', type: 'string', value: '<<TODO: utilizatorul/organizația GitHub>>' },
        { id: 'a3', name: 'github_repo', type: 'string', value: '<<TODO: restaurantok-site>>' },
        { id: 'a4', name: 'telegram_chat_id', type: 'string', value: '<<TODO: chat ID-ul lui Sorin>>' },
        { id: 'a5', name: 'url_google', type: 'string', value: 'https://www.google.com/maps/place/?q=place_id:ChIJh_Ql7G16U0cRS6gH1eRpkXQ' },
        { id: 'a6', name: 'fus_orar', type: 'string', value: 'Europe/Bucharest' }
      ] },
      includeOtherFields: true, options: {}
    }, { notes: 'Place ID-urile (Restaurant OK: place_id; Sala de bal OK: place_id_sala, nefolosit încă) sunt publice, date de Sorin pe 21 oct 2026. Cheia API NU stă aici: e în credențiala „Google Places API key" (Header Auth, nume X-Goog-Api-Key) a nodului HTTP.' }),
    nod('Citește recenziile', 'n8n-nodes-base.httpRequest', 4.2, [-180, 300], {
      method: 'GET', url: expr(`{{ 'https://places.googleapis.com/v1/places/' + ${CFG('place_id')} }}`),
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendQuery: true, queryParameters: { parameters: [{ name: 'languageCode', value: 'ro' }, { name: 'fields', value: 'rating,userRatingCount,googleMapsUri,reviews' }] },
      options: { timeout: 20000 }
    }, { credentials: { httpHeaderAuth: { id: '<<TODO: id credențială>>', name: 'Google Places API key' } }, notes: 'Places API (New), Place Details. Câmpurile cerute prin `fields` țin costul la nivelul „Atmosphere" (cel mai ieftin care include recenziile).' }),
    nod('Transformă recenziile', 'n8n-nodes-base.code', 2, [40, 300], { jsCode: COD('recenzii.js') }),
    nod('Scrie recenzii.json', 'n8n-nodes-base.github', 1, [280, 300], {
      resource: 'file', operation: 'edit', owner: rl(expr(`{{ ${CFG('github_owner')} }}`)), repository: rl(expr(`{{ ${CFG('github_repo')} }}`)),
      filePath: 'data/recenzii.json', fileContent: '={{ $json.continut }}', commitMessage: '={{ $json.commit }}'
    }, { credentials: GITHUB, onError: 'continueErrorOutput', notes: 'Operația „edit" cere ca fișierul să existe deja în repo (exemplul din data/ e de ajuns). Ieșirea de eroare merge la Telegram.' }),
    nod('Anunță eroarea', 'n8n-nodes-base.telegram', 1.2, [520, 420], {
      chatId: expr(`{{ ${CFG('telegram_chat_id')} }}`),
      text: '=⚠️ Recenziile Google nu s-au putut publica pe site: {{ $json.error ? ($json.error.message || JSON.stringify($json.error)) : "eroare necunoscută" }}',
      additionalFields: { appendAttribution: false }
    }, { credentials: TELEGRAM, notes: 'Doar la eroare. Dacă rămâne fără actualizare 30 de zile, site-ul ascunde singur secțiunea.' })
  ];

  const legaturi = [
    c('Săptămânal, luni 06:20', 'Config'), c('Config', 'Citește recenziile'), c('Citește recenziile', 'Transformă recenziile'),
    c('Transformă recenziile', 'Scrie recenzii.json'), c('Scrie recenzii.json', 'Anunță eroarea', 1)
  ];

  return {
    name: 'OK · recenzii Google (M5)',
    nodes, connections: leaga(legaturi),
    settings: { executionOrder: 'v1', timezone: 'Europe/Bucharest', saveManualExecutions: true, callerPolicy: 'workflowsFromSameOwner', errorWorkflow: '' },
    staticData: null, pinData: {}, tags: [],
    meta: { templateCredsSetupCompleted: false, descriere: 'Săptămânal: Google Places (Place Details) → data/recenzii.json → commit GitHub → Cloudflare Pages. Vezi n8n/README.md.' }
  };
};
