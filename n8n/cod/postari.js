// Nod Code „Transformă postările" (workflow postari-facebook, M5). Rulează în n8n (sandbox: fără require).
// Intrare: răspunsul nodului HTTP „Citește postările" — Graph API /{page-id}/posts?fields=message,full_picture,permalink_url,created_time:
//   { data: [{ id, message, full_picture, permalink_url, created_time }] }
// Citește și JSON-ul curent din repo ($('Citește JSON curent'): `content` base64, sau eroare dacă lipsește) ca să știe ce poze sunt deja urcate:
//   pozele de pe Facebook (full_picture) sunt URL-uri semnate care expiră, așa că se descarcă o singură dată și se țin în repo la data/poze/post-<id>.jpg.
// Ieșire (un singur item): continut (JSON-ul pentru data/postari.json), commit, poze_noi: [{ id, url, cale }], are_poze_noi, rezumat.
// Reguli: cel mult 3 postări, cele mai noi primele; doar postări cu text sau poză; textul tăiat la 1000 de caractere; fără postări → eroare (nu scriem gol).
const cfg = $('Config').first().json;
const FUS = cfg.fus_orar || 'Europe/Bucharest';
const MAX = Number(cfg.max_postari) > 0 ? Number(cfg.max_postari) : 3;
const raspuns = $('Citește postările').first().json || {}; // nodul primește ca intrare „Citește JSON curent”, răspunsul HTTP îl ia direct de la nodul lui
const lista = Array.isArray(raspuns.data) ? raspuns.data : [];

function acumIso() { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: FUS, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset' }).formatToParts(new Date()).forEach(x => { p[x.type] = x.value; }); const off = (p.timeZoneName || '').replace('GMT', ''); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${/^[+-]\d{2}:\d{2}$/.test(off) ? off : '+00:00'}`; }
const curat = s => String(s || '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1000);
const idScurt = id => String(id || '').replace(/[^0-9A-Za-z_-]/g, '').split('_').pop() || String(Date.now()); // „<page>_<post>" → „<post>"

let existent = null;
try { const g = $('Citește JSON curent').first().json; if (g && g.content) existent = JSON.parse(Buffer.from(String(g.content).replace(/\n/g, ''), 'base64').toString('utf8')); } catch (e) { existent = null; }
const pozeExistente = new Set(((existent && Array.isArray(existent.postari)) ? existent.postari : []).filter(p => p && p.poza).map(p => String(p.poza)));

const pozeNoi = [];
const postari = lista.filter(p => p && (curat(p.message) || p.full_picture)).map(p => {
  const id = idScurt(p.id);
  const cale = p.full_picture ? `data/poze/post-${id}.jpg` : null;
  if (cale && !pozeExistente.has(cale)) pozeNoi.push({ id, url: String(p.full_picture), cale });
  return { id, data: new Date(Date.parse(p.created_time || '') || Date.now()).toISOString(), text: curat(p.message), poza: cale, url: String(p.permalink_url || cfg.url_pagina || '') };
}).sort((a, b) => Date.parse(b.data) - Date.parse(a.data)).slice(0, MAX);

if (!postari.length) throw new Error('Facebook nu a întors nicio postare cu text sau poză — verifică Page ID-ul, token-ul (permisiunea pages_read_engagement) și câmpurile cerute.');
const idsPastrate = new Set(postari.map(p => p.id));
const pozeDeUrcat = pozeNoi.filter(z => idsPastrate.has(z.id));

const json = { actualizat: acumIso(), sursa: 'Facebook Graph API, pagina OkCalafat', url_pagina: String(cfg.url_pagina || 'https://www.facebook.com/OkCalafat'), postari };
return [{ json: {
  continut: JSON.stringify(json, null, 2) + '\n',
  commit: `data: postari.json ${json.actualizat.slice(0, 10)}`,
  poze_noi: pozeDeUrcat, are_poze_noi: pozeDeUrcat.length > 0,
  rezumat: `Postări Facebook: ${postari.length} publicate pe site, ${pozeDeUrcat.length} poze noi de urcat.`
} }];
