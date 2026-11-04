// Workflow `sala-disponibilitate` (M2): zilnic, calendarul Google „Sala de bal OK" → data/sala-disponibilitate.json → commit GitHub.
// Site-ul ascunde calendarul dacă `actualizat` e mai vechi de 7 zile, deci rularea zilnică (chiar fără schimbări) ține calendarul „viu".
'use strict';
module.exports = function ({ nod: fabrica, expr, CFG, rl, c, leaga, COD }) {
  const nod = fabrica('m2s');
  const GITHUB = { githubApi: { id: '<<TODO: id credențială>>', name: 'GitHub PAT site' } };
  const TELEGRAM = { telegramApi: { id: '<<TODO: id credențială>>', name: 'Telegram OK bot' } };

  const nodes = [
    nod('Zilnic 06:10', 'n8n-nodes-base.scheduleTrigger', 1.2, [-620, 300], { rule: { interval: [{ field: 'cronExpression', expression: '10 6 * * *' }] } },
      { notes: 'Fusul orar din setările workflow-ului: Europe/Bucharest. Poți rula și manual după ce ai schimbat ceva în calendar.' }),
    nod('Config', 'n8n-nodes-base.set', 3.4, [-400, 300], {
      assignments: { assignments: [
        { id: 'a1', name: 'calendar_id', type: 'string', value: '<<TODO: ID-ul calendarului „Sala de bal OK" (Setări calendar → Integrare), ex. abc123@group.calendar.google.com>>' },
        { id: 'a2', name: 'github_owner', type: 'string', value: '<<TODO: utilizatorul/organizația GitHub>>' },
        { id: 'a3', name: 'github_repo', type: 'string', value: '<<TODO: restaurantok-site>>' },
        { id: 'a4', name: 'telegram_chat_id', type: 'string', value: '<<TODO: chat ID-ul lui Sorin>>' },
        { id: 'a5', name: 'orizont_zile', type: 'number', value: 365 },
        { id: 'a6', name: 'ore_ocupat', type: 'number', value: 6 },
        { id: 'a7', name: 'fus_orar', type: 'string', value: 'Europe/Bucharest' }
      ] },
      includeOtherFields: true, options: {}
    }, { notes: 'ore_ocupat: un eveniment cu ore care durează cel puțin atât marchează ziua ca ocupată; mai scurt → „parțial ocupat". Evenimentele de o zi întreagă sunt mereu „ocupat".' }),
    nod('Citește calendarul', 'n8n-nodes-base.googleCalendar', 1.3, [-180, 300], {
      resource: 'event', operation: 'getAll', returnAll: true,
      calendar: { __rl: true, mode: 'id', value: expr(`{{ ${CFG('calendar_id')} }}`) },
      timeMin: '={{ $now.startOf(\'day\').toISO() }}', timeMax: expr(`{{ $now.plus({ days: ${CFG('orizont_zile')} }).toISO() }}`),
      options: { singleEvents: true, orderBy: 'startTime' }
    }, { credentials: { googleCalendarOAuth2Api: { id: '<<TODO: id credențială>>', name: 'Google Calendar OK' } }, alwaysOutputData: true, notes: 'singleEvents desface evenimentele recurente în apariții. alwaysOutputData: calendarul gol produce tot un item, ca fișierul să se actualizeze.' }),
    nod('Calculează disponibilitatea', 'n8n-nodes-base.code', 2, [40, 300], { jsCode: COD('disponibilitate.js') }),
    nod('Scrie sala-disponibilitate.json', 'n8n-nodes-base.github', 1, [280, 300], {
      resource: 'file', operation: 'edit', owner: rl(expr(`{{ ${CFG('github_owner')} }}`)), repository: rl(expr(`{{ ${CFG('github_repo')} }}`)),
      filePath: 'data/sala-disponibilitate.json', fileContent: '={{ $json.continut }}', commitMessage: '={{ $json.commit }}'
    }, { credentials: GITHUB, onError: 'continueErrorOutput', notes: 'Operația „edit" cere ca fișierul să existe deja în repo (exemplul din data/ e de ajuns). Ieșirea de eroare merge la Telegram.' }),
    nod('Anunță eroarea', 'n8n-nodes-base.telegram', 1.2, [520, 420], {
      chatId: expr(`{{ ${CFG('telegram_chat_id')} }}`),
      text: '=⚠️ Calendarul sălii nu s-a putut publica pe site: {{ $json.error ? ($json.error.message || JSON.stringify($json.error)) : "eroare necunoscută" }}',
      additionalFields: { appendAttribution: false }
    }, { credentials: TELEGRAM, notes: 'Doar la eroare. Rularea reușită nu trimite nimic (ar fi un mesaj pe zi degeaba).' })
  ];

  const legaturi = [
    c('Zilnic 06:10', 'Config'), c('Config', 'Citește calendarul'), c('Citește calendarul', 'Calculează disponibilitatea'),
    c('Calculează disponibilitatea', 'Scrie sala-disponibilitate.json'), c('Scrie sala-disponibilitate.json', 'Anunță eroarea', 1)
  ];

  return {
    name: 'OK · disponibilitatea sălii (M2)',
    nodes, connections: leaga(legaturi),
    settings: { executionOrder: 'v1', timezone: 'Europe/Bucharest', saveManualExecutions: true, callerPolicy: 'workflowsFromSameOwner' },
    staticData: null, pinData: {}, tags: [],
    meta: { templateCredsSetupCompleted: false, descriere: 'Zilnic: Google Calendar „Sala de bal OK" → data/sala-disponibilitate.json → commit GitHub → Cloudflare Pages. Vezi n8n/README.md.' }
  };
};
