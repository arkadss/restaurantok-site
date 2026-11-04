// Nod Code „Transformă evenimentele" (workflow evenimente, M6). Rulează în n8n (sandbox: fără require).
// Intrare: evenimentele din calendarul Google „Evenimente OK" pentru următoarele `orizont_zile` zile (nodul Google Calendar, getAll, singleEvents),
//   câte un item per eveniment; sau niciun item când calendarul e gol (alwaysOutputData → un item gol).
// Ieșire (un singur item): continut (JSON-ul pentru data/evenimente.json), commit, numar, rezumat.
// Reguli: titlul, descrierea și locul SUNT publice (spre deosebire de calendarul sălii); evenimentele anulate și cele marcate „liber" se ignoră;
//   locul: câmpul `location` din calendar sau, dacă lipsește, „Gastro-pub OK"; un link https în descriere devine `url`; max 20 de evenimente.
const cfg = $('Config').first().json;
const FUS = cfg.fus_orar || 'Europe/Bucharest';
const LOC_IMPLICIT = cfg.loc_implicit || 'Gastro-pub OK';
const ORIZONT = Number(cfg.orizont_zile) > 0 ? Number(cfg.orizont_zile) : 90;

function parti(d) { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: FUS, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset' }).formatToParts(d).forEach(x => { p[x.type] = x.value; }); return p; }
function iso(d) { const p = parti(d); const off = (p.timeZoneName || '').replace('GMT', ''); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${/^[+-]\d{2}:\d{2}$/.test(off) ? off : '+00:00'}`; }
function offsetZi(zi) { const p = parti(new Date(zi + 'T12:00:00Z')); const off = (p.timeZoneName || '').replace('GMT', ''); return /^[+-]\d{2}:\d{2}$/.test(off) ? off : '+00:00'; }
const curat = (s, max) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max || 600);

const acum = new Date(), limita = new Date(acum.getTime() + ORIZONT * 864e5);
const evenimente = [];
for (const item of $input.all()) {
  const e = item.json || {};
  if (!e.start || !e.summary || e.status === 'cancelled' || e.transparency === 'transparent') continue;
  let inceput, sfarsit;
  if (e.start.date) { // toată ziua: de la 00:00 local; end.date este exclusiv
    inceput = `${e.start.date}T00:00:00${offsetZi(e.start.date)}`;
    const endZi = e.end && e.end.date ? new Date(e.end.date + 'T00:00:00Z') : null; if (endZi) endZi.setUTCDate(endZi.getUTCDate() - 1);
    sfarsit = endZi ? `${endZi.toISOString().slice(0, 10)}T23:59:00${offsetZi(endZi.toISOString().slice(0, 10))}` : null;
  } else {
    const a = new Date(e.start.dateTime), b = e.end && e.end.dateTime ? new Date(e.end.dateTime) : null;
    if (isNaN(a)) continue;
    inceput = iso(a); sfarsit = b && !isNaN(b) ? iso(b) : null;
  }
  const t0 = Date.parse(inceput); if (t0 > limita.getTime()) continue;
  const descriere = curat(e.description, 600);
  const link = (String(e.description || '').match(/https:\/\/\S+/) || [])[0] || '';
  evenimente.push({ id: String(e.id || '').slice(0, 64), titlu: curat(e.summary, 120), inceput, sfarsit, loc: curat(e.location, 80) || LOC_IMPLICIT,
    descriere: descriere.replace(link, '').trim(), poza: null, url: link || null });
}
evenimente.sort((a, b) => Date.parse(a.inceput) - Date.parse(b.inceput));
const lista = evenimente.slice(0, 20);

const json = { actualizat: iso(acum), fus_orar: FUS, sursa: 'Google Calendar „Evenimente OK"', evenimente: lista };
return [{ json: {
  continut: JSON.stringify(json, null, 2) + '\n',
  commit: `data: evenimente.json ${json.actualizat.slice(0, 10)}`,
  numar: lista.length,
  rezumat: `Evenimente: ${lista.length} publicate pe site (următoarele ${ORIZONT} zile).`
} }];
