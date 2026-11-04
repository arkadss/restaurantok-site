// Workflow `evenimente` (M6): zilnic, calendarul Google „Evenimente OK" → data/evenimente.json → commit GitHub.
// Site-ul ascunde secțiunea „Evenimente la OK" dacă `actualizat` e mai vechi de 7 zile; rularea zilnică o ține „vie" și scoate singură evenimentele trecute.
'use strict';
module.exports = function ({ nod: fabrica, expr, CFG, rl, c, leaga, COD }) {
  const nod = fabrica('m6e');
  const GITHUB = { githubApi: { id: '<<TODO: id credențială>>', name: 'GitHub PAT site' } };
  const TELEGRAM = { telegramApi: { id: '<<TODO: id credențială>>', name: 'Telegram OK bot' } };

  const nodes = [
    nod('Zilnic 06:15', 'n8n-nodes-base.scheduleTrigger', 1.2, [-620, 300], { rule: { interval: [{ field: 'cronExpression', expression: '15 6 * * *' }] } },
      { notes: 'Fusul orar din setările workflow-ului: Europe/Bucharest. Poți rula și manual după ce ai adăugat un eveniment.' }),
    nod('Config', 'n8n-nodes-base.set', 3.4, [-400, 300], {
      assignments: { assignments: [
        { id: 'a1', name: 'calendar_id', type: 'string', value: '<<TODO: ID-ul calendarului „Evenimente OK" (Setări calendar → Integrare), ex. abc123@group.calendar.google.com>>' },
        { id: 'a2', name: 'github_owner', type: 'string', value: '<<TODO: utilizatorul/organizația GitHub>>' },
        { id: 'a3', name: 'github_repo', type: 'string', value: '<<TODO: restaurantok-site>>' },
        { id: 'a4', name: 'telegram_chat_id', type: 'string', value: '<<TODO: chat ID-ul lui Sorin>>' },
        { id: 'a5', name: 'orizont_zile', type: 'number', value: 90 },
        { id: 'a6', name: 'loc_implicit', type: 'string', value: 'Gastro-pub OK' },
        { id: 'a7', name: 'fus_orar', type: 'string', value: 'Europe/Bucharest' }
      ] },
      includeOtherFields: true, options: {}
    }, { notes: 'Calendar separat de cel al sălii: aici titlul, descrierea și locul AJUNG pe site. Locul: câmpul „Unde" din eveniment (Gastro-pub OK, Terasa OK, Sala Vidin, Sala de bal OK); gol → loc_implicit.' }),
    nod('Citește calendarul', 'n8n-nodes-base.googleCalendar', 1.3, [-180, 300], {
      resource: 'event', operation: 'getAll', returnAll: true,
      calendar: { __rl: true, mode: 'id', value: expr(`{{ ${CFG('calendar_id')} }}`) },
      timeMin: '={{ $now.startOf(\'day\').toISO() }}', timeMax: expr(`{{ $now.plus({ days: ${CFG('orizont_zile')} }).toISO() }}`),
      options: { singleEvents: true, orderBy: 'startTime' }
    }, { credentials: { googleCalendarOAuth2Api: { id: '<<TODO: id credențială>>', name: 'Google Calendar OK' } }, alwaysOutputData: true, notes: 'Aceeași credențială Google ca la calendarul sălii. alwaysOutputData: calendarul gol produce tot un item, ca fișierul să se actualizeze (secțiunea se ascunde pe site).' }),
    nod('Transformă evenimentele', 'n8n-nodes-base.code', 2, [40, 300], { jsCode: COD('evenimente.js') }),
    nod('Scrie evenimente.json', 'n8n-nodes-base.github', 1, [280, 300], {
      resource: 'file', operation: 'edit', owner: rl(expr(`{{ ${CFG('github_owner')} }}`)), repository: rl(expr(`{{ ${CFG('github_repo')} }}`)),
      filePath: 'data/evenimente.json', fileContent: '={{ $json.continut }}', commitMessage: '={{ $json.commit }}'
    }, { credentials: GITHUB, onError: 'continueErrorOutput', notes: 'Operația „edit" cere ca fișierul să existe deja în repo (exemplul din data/ e de ajuns). Ieșirea de eroare merge la Telegram.' }),
    nod('Anunță eroarea', 'n8n-nodes-base.telegram', 1.2, [520, 420], {
      chatId: expr(`{{ ${CFG('telegram_chat_id')} }}`),
      text: '=⚠️ Evenimentele nu s-au putut publica pe site: {{ $json.error ? ($json.error.message || JSON.stringify($json.error)) : "eroare necunoscută" }}',
      additionalFields: { appendAttribution: false }
    }, { credentials: TELEGRAM, notes: 'Doar la eroare.' })
  ];

  const legaturi = [
    c('Zilnic 06:15', 'Config'), c('Config', 'Citește calendarul'), c('Citește calendarul', 'Transformă evenimentele'),
    c('Transformă evenimentele', 'Scrie evenimente.json'), c('Scrie evenimente.json', 'Anunță eroarea', 1)
  ];

  return {
    name: 'OK · evenimente (M6)',
    nodes, connections: leaga(legaturi),
    settings: { executionOrder: 'v1', timezone: 'Europe/Bucharest', saveManualExecutions: true, callerPolicy: 'workflowsFromSameOwner' },
    staticData: null, pinData: {}, tags: [],
    meta: { templateCredsSetupCompleted: false, descriere: 'Zilnic: Google Calendar „Evenimente OK" → data/evenimente.json → commit GitHub → Cloudflare Pages. Vezi n8n/README.md.' }
  };
};
