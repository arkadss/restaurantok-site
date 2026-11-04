// Nod Code „Transformă recenziile" (workflow recenzii-google, M5). Rulează în n8n (sandbox: fără require).
// Intrare: răspunsul nodului HTTP „Citește recenziile" — Google Places API (New), Place Details:
//   { rating, userRatingCount, googleMapsUri, reviews: [{ rating, text: { text, languageCode }, originalText, authorAttribution: { displayName }, publishTime }] }
//   (acceptă și formatul vechi, Place Details din Maps JavaScript/Places API: { result: { rating, user_ratings_total, url, reviews: [{ rating, text, author_name, time }] } })
// Ieșire (un singur item): continut (JSON-ul pentru data/recenzii.json), commit, rezumat.
// Reguli: cel mult 5 recenzii, cele mai noi primele; doar recenzii cu text; numele autorului doar prenume + inițială (ex. „Ana M.");
//   textul se taie la 600 de caractere; notele în afara 1–5 se ignoră. Dacă API-ul nu întoarce nimic util, nodul aruncă eroare (nu scriem un fișier gol peste cel bun).
const cfg = $('Config').first().json;
const FUS = cfg.fus_orar || 'Europe/Bucharest';
const raspuns = $input.first().json || {};
const r = raspuns.result && typeof raspuns.result === 'object' ? raspuns.result : raspuns; // formatul vechi are totul sub `result`

function acumIso() { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: FUS, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset' }).formatToParts(new Date()).forEach(x => { p[x.type] = x.value; }); const off = (p.timeZoneName || '').replace('GMT', ''); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${/^[+-]\d{2}:\d{2}$/.test(off) ? off : '+00:00'}`; }
function ziDin(v) { // publishTime ISO (nou) sau `time` în secunde Unix (vechi) → 'YYYY-MM-DD'
  const t = typeof v === 'number' ? v * 1000 : Date.parse(v || '');
  if (isNaN(t)) return '';
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: FUS, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t)).forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}
function autorScurt(nume) { // „Ana Maria Popescu" → „Ana P."; un singur cuvânt → ca atare
  const parti = String(nume || '').trim().split(/\s+/).filter(Boolean);
  if (!parti.length) return 'Client Google';
  if (parti.length === 1) return parti[0];
  return `${parti[0]} ${parti[parti.length - 1][0].toUpperCase()}.`;
}
const curat = s => String(s || '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 600);

const rating = Number(r.rating);
const numar = Number(r.userRatingCount != null ? r.userRatingCount : r.user_ratings_total);
const recenzii = (Array.isArray(r.reviews) ? r.reviews : []).map(x => {
  const textObj = x.text && typeof x.text === 'object' ? x.text : null;
  const original = x.originalText && typeof x.originalText === 'object' ? x.originalText.text : '';
  const text = curat(textObj ? (textObj.text || original) : (typeof x.text === 'string' ? x.text : original));
  const autor = autorScurt(x.authorAttribution ? x.authorAttribution.displayName : x.author_name);
  return { autor, nota: Math.round(Number(x.rating)), data: ziDin(x.publishTime != null ? x.publishTime : x.time), text };
}).filter(x => x.text && x.nota >= 1 && x.nota <= 5).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)).slice(0, 5);

if (!(rating > 0) && !recenzii.length) throw new Error('Google Places nu a întors nici rating, nici recenzii — verifică Place ID-ul, cheia API și câmpurile cerute (fields).');

const placeId = String(cfg.place_id || '').trim();
const json = {
  actualizat: acumIso(), sursa: 'Google Places API, Place Details', place_id: placeId,
  url_recenzie_noua: placeId ? `https://search.google.com/local/writereview?placeid=${placeId}` : '',
  url_google: String(r.googleMapsUri || r.url || cfg.url_google || ''),
  rating: rating > 0 ? Math.round(rating * 10) / 10 : null, numar: numar > 0 ? Math.round(numar) : null, recenzii
};
return [{ json: {
  continut: JSON.stringify(json, null, 2) + '\n',
  commit: `data: recenzii.json ${json.actualizat.slice(0, 10)}`,
  rezumat: `Recenzii Google: nota ${json.rating ?? '–'}, ${json.numar ?? '?'} recenzii, ${recenzii.length} afișate.`
} }];
