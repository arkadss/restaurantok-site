// Nod Code „Validează cererea" (workflow site-cerere, M2; M3 adaugă tipul catering, M4 tipul tort cu poza-model). Rulează în n8n (sandbox: fără require).
// Intrare: item-ul produs de nodul Webhook + Config: { headers, body, ... , site_token, origine_permisa, ... }
// Ieșire (un singur item):
//   ok: true  → cererea e bună: cerere (normalizată), id, telegram (HTML), email_subiect, email_text, rand (pentru Postgres), raspuns {ok:true,id}, status 200
//   ok: false → status + raspuns {ok:false, eroare} ; pentru honeypot/token greșit `tacut: true` (răspundem ca și cum ar fi mers, fără notificare)
// Regulile sunt aceleași ca în site (src/assets/js/site.js → validareCerere), ca browserul și serverul să respingă aceleași lucruri.
const cfg = $('Config').first().json;
const item = $input.first().json;
const headers = item.headers || {};
const b = (item.body && typeof item.body === 'object') ? item.body : {};

const TIPURI = { sala: 'Sala de bal', catering: 'Catering', tort: 'Tort', rezervare: 'Rezervare' };
const TIP_EVENIMENT = { nunta: 'Nuntă / cununie', botez: 'Botez / cumetrie', aniversare: 'Aniversare / majorat', 'masa-festiva': 'Masă festivă', firma: 'Petrecere de firmă / conferință', pomana: 'Pomană / parastas', altul: 'Altceva' };
// M3: tipurile de comandă de catering (aceleași chei ca în site: TIPURI_CATERING) și felul livrării
const TIP_COMANDA = { eveniment: 'Catering pentru eveniment', pomana: 'Pachete pentru pomană / parastas', 'pranz-birou': 'Prânz la birou' };
const LIVRARE = { adresa: 'Livrare la adresă', ridicare: 'Ridicare de la restaurant' };
const SALI = { 'sala-de-bal': 'Sala de bal OK (Str. Traian nr. 2)', 'sala-vidin': 'Sala Vidin (la restaurant)' };
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const ZILE = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];

const text = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max || 200);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ziValida = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z'));
const telefonValid = t => /^(\+40|0040|0)?[237]\d{8}$/.test(String(t || '').replace(/[\s.\-()]/g, ''));
const emailValid = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const dataLunga = iso => { const p = iso.split('-'); const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return ZILE[d.getUTCDay()] + ', ' + (+p[2]) + ' ' + LUNI[+p[1] - 1] + ' ' + p[0]; };
const aziRo = () => { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: cfg.fus_orar || 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).forEach(x => { p[x.type] = x.value; }); return `${p.year}-${p.month}-${p.day}`; };
const acumIso = () => { const d = new Date(); const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: cfg.fus_orar || 'Europe/Bucharest', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset' }).formatToParts(d).forEach(x => { p[x.type] = x.value; }); const off = (p.timeZoneName || 'GMT+00:00').replace('GMT', '') || '+00:00'; return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off.length === 6 ? off : '+00:00'}`; };

const tacut = (motiv) => [{ json: { ok: false, tacut: true, motiv, status: 200, raspuns: { ok: true, id: 'x-' + Date.now().toString(36) } } }];
const respinge = (eroare, status) => [{ json: { ok: false, status: status || 400, raspuns: { ok: false, eroare } } }];

// 1. filtrele anti-spam: honeypot-ul trebuie să fie gol; token-ul din header trebuie să fie cel din site
if (typeof b.website === 'string' && b.website.trim() !== '') return tacut('honeypot completat');
if (cfg.site_token && !/<<TODO/.test(cfg.site_token) && String(headers['x-site-token'] || '') !== String(cfg.site_token)) return tacut('token greșit');

// 2. validarea câmpurilor
const tip = text(b.tip, 20);
if (!TIPURI[tip]) return respinge('tip necunoscut');
const c = {
  tip, nume: text(b.nume, 80), telefon: text(b.telefon, 30), email: text(b.email, 120).toLowerCase(),
  data_eveniment: text(b.data_eveniment, 10), persoane: parseInt(b.persoane, 10) || 0, mesaj: text(b.mesaj, 1500),
  detalii: (b.detalii && typeof b.detalii === 'object' && !Array.isArray(b.detalii)) ? b.detalii : {},
  consimtamant: b.consimtamant === true, pagina: text(b.pagina, 120)
};
const erori = [];
if (c.nume.length < 2) erori.push('nume');
if (!telefonValid(c.telefon)) erori.push('telefon');
if (!emailValid(c.email)) erori.push('email');
if (!c.consimtamant) erori.push('consimtamant');
if (tip === 'sala' || tip === 'catering' || tip === 'tort') {
  if (!ziValida(c.data_eveniment)) erori.push('data_eveniment');
  else if (c.data_eveniment < aziRo()) erori.push('data_eveniment');
  if (!(c.persoane >= 1 && c.persoane <= 999)) erori.push('persoane');
}
// M3: detaliile comenzii de catering (tip_comanda, livrare + adresa, ora), normalizate; aceleași reguli ca în site
let cat = null;
if (tip === 'sala') { // spațiul dorit (opțional): sala de bal de pe Traian sau Sala Vidin de la restaurant
  const d = c.detalii, sala = SALI[d.sala] ? d.sala : '';
  c.detalii = { tip_eveniment: text(d.tip_eveniment, 20), tip_eveniment_text: TIP_EVENIMENT[d.tip_eveniment] || text(d.tip_eveniment_text, 60), sala, sala_text: SALI[sala] || '' };
}
if (tip === 'catering') {
  const d = c.detalii;
  cat = { tip_comanda: text(d.tip_comanda, 20), livrare: d.livrare === 'ridicare' ? 'ridicare' : 'adresa', adresa: text(d.adresa, 200), ora: text(d.ora, 5) };
  cat.tip_comanda_text = TIP_COMANDA[cat.tip_comanda] || ''; cat.livrare_text = LIVRARE[cat.livrare];
  if (cat.livrare === 'ridicare') cat.adresa = '';
  if (!TIP_COMANDA[cat.tip_comanda]) erori.push('tip_comanda');
  if (cat.livrare === 'adresa' && cat.adresa.length < 5) erori.push('adresa');
  if (cat.ora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cat.ora)) erori.push('ora');
  c.detalii = cat;
}
// M4: comanda de tort — tortul ales (id din data/torturi.json sau „personalizat") și poza-model (base64, redimensionată în browser)
let tort = null, pozaBase64 = '';
if (tip === 'tort') {
  const d = c.detalii, pm = d.poza_model && typeof d.poza_model === 'object' ? d.poza_model : null;
  tort = { tort: text(d.tort, 40), tort_text: text(d.tort_text, 80), poza_model: null };
  if (!tort.tort) erori.push('tort');
  if (!tort.tort_text) tort.tort_text = tort.tort;
  if (pm) {
    const b64 = typeof pm.base64 === 'string' ? pm.base64.replace(/\s+/g, '') : '';
    const tipPoza = /^image\/(jpeg|png|webp|heic|heif|gif)$/.test(String(pm.tip || '')) ? String(pm.tip) : 'image/jpeg';
    if (b64.length > 8 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(b64)) erori.push('poza_model'); // ≤ ~6 MB decodat
    else if (b64) { pozaBase64 = b64; tort.poza_model = { nume: text(pm.nume, 80) || 'model', tip: tipPoza, marime: Math.round(b64.length * 3 / 4), latime: parseInt(pm.latime, 10) || 0, inaltime: parseInt(pm.inaltime, 10) || 0 }; }
  }
  c.detalii = tort; // fără base64: în Postgres și pe Telegram ajung doar metadatele; poza pleacă separat (binar)
}
if (erori.length) return respinge('câmpuri invalide: ' + erori.join(', '));

// 3. id-ul cererii: <tip>-<AAAALLZZ>-<4 caractere>; apare în confirmare, pe Telegram, în email și în Postgres
const id = `${tip}-${aziRo().replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
const tipEv = TIP_EVENIMENT[c.detalii.tip_eveniment] || text(c.detalii.tip_eveniment_text, 60) || '';
const telefonCurat = c.telefon.replace(/[\s.\-()]/g, '');
const ip = text(headers['cf-connecting-ip'] || headers['x-forwarded-for'] || '', 60).split(',')[0];

// 4. textele: Telegram (HTML) către Sorin, email de confirmare către client
const pranz = cat && cat.tip_comanda === 'pranz-birou', pomana = cat && cat.tip_comanda === 'pomana';
const etData = pranz ? 'De la' : tort ? 'Pentru' : 'Data', etPersoane = pranz ? 'Porții pe zi' : pomana ? 'Pachete' : 'Persoane';
const randuri = [`<b>${cat || tort ? 'Comandă nouă' : 'Cerere nouă'} · ${TIPURI[tip]}</b> <code>${id}</code>`];
if (tort) randuri.push(`Tort: ${esc(tort.tort_text)}`, tort.poza_model ? `Model: poza vine în mesajul următor (${esc(tort.poza_model.nume)}, ${Math.round(tort.poza_model.marime / 1024)} KB)` : 'Model: fără poză');
if (tipEv) randuri.push(`Eveniment: ${esc(tipEv)}`);
if (tip === 'sala') randuri.push(`Spațiul: ${esc(c.detalii.sala_text || 'nu a ales (de recomandat: Sala de bal sau Sala Vidin)')}`);
if (cat) randuri.push(`Comandă: ${esc(cat.tip_comanda_text)}`);
if (c.data_eveniment) randuri.push(`${etData}: ${esc(dataLunga(c.data_eveniment))}${cat && cat.ora ? ', ora ' + esc(cat.ora) : ''}`);
if (c.persoane) randuri.push(`${etPersoane}: ${c.persoane}`);
if (cat) randuri.push(cat.livrare === 'ridicare' ? 'Ridicare de la restaurant' : `Livrare la: ${esc(cat.adresa)}`);
randuri.push(`Nume: ${esc(c.nume)}`);
randuri.push(`Telefon: <a href="tel:+4${telefonCurat.replace(/^(\+40|0040)/, '0')}">${esc(c.telefon)}</a>`);
if (c.email) randuri.push(`Email: ${esc(c.email)}`);
if (c.mesaj) randuri.push('', `<i>${esc(c.mesaj)}</i>`);
randuri.push('', `Sună înapoi: <a href="https://wa.me/${telefonCurat.replace(/^(\+40|0040|0)/, '40')}">WhatsApp</a> · ${esc(c.pagina || '')}`);
const telegram = randuri.join('\n');

const prenume = c.nume.split(/\s+/)[0];
// șablonul de email, per tip (M2 sala, M3 catering: eveniment / pomană / prânz la birou; M4 adaugă tort)
const SABLOANE = {
  sala: { subiect: `Am primit cererea ta pentru Sala de bal OK (${id})`,
    intro: `Am primit cererea ta de ofertă pentru ${tipEv ? tipEv.toLowerCase() : 'eveniment'}${c.data_eveniment ? ', ' + dataLunga(c.data_eveniment) : ''}${c.persoane ? ', ' + c.persoane + ' persoane' : ''}.`,
    urmeaza: `Te sunăm la ${c.telefon} cu o ofertă, de obicei în aceeași zi lucrătoare.` },
  catering: { subiect: `Am primit comanda ta de catering (${id})`,
    intro: pranz ? `Am primit comanda ta de prânz la birou: ${c.persoane} porții pe zi, de ${c.data_eveniment ? dataLunga(c.data_eveniment) : ''} încolo${cat && cat.livrare === 'adresa' ? ', livrate la ' + cat.adresa : ', cu ridicare de la restaurant'}${cat && cat.ora ? ', în jurul orei ' + cat.ora : ''}.`
      : pomana ? `Am primit comanda ta de ${c.persoane} pachete pentru pomană / parastas, ${c.data_eveniment ? dataLunga(c.data_eveniment) : ''}${cat && cat.livrare === 'adresa' ? ', cu livrare la ' + cat.adresa : ', cu ridicare de la restaurant'}${cat && cat.ora ? ', la ora ' + cat.ora : ''}.`
      : `Am primit cererea ta de catering pentru ${c.persoane} persoane, ${c.data_eveniment ? dataLunga(c.data_eveniment) : ''}${cat && cat.livrare === 'adresa' ? ', cu livrare la ' + cat.adresa : ', cu ridicare de la restaurant'}${cat && cat.ora ? ', la ora ' + cat.ora : ''}.`,
    urmeaza: pranz ? `Te sunăm la ${c.telefon} ca să stabilim meniul săptămânii și ora livrării. Prețul porției este cel al meniului zilei.`
      : pomana ? `Te sunăm la ${c.telefon} ca să stabilim conținutul pachetelor și prețul. Condoleanțe din partea noastră.`
      : `Te sunăm la ${c.telefon} ca să stabilim meniul și prețul, de obicei în aceeași zi lucrătoare.` }
};
SABLOANE.tort = { subiect: `Am primit comanda ta de tort (${id})`,
  intro: `Am primit comanda ta: ${tort ? tort.tort_text.toLowerCase() : 'tort'}, pentru ${c.data_eveniment ? dataLunga(c.data_eveniment) : ''}, ${c.persoane} persoane${tort && tort.poza_model ? ', după modelul din poza trimisă' : ''}.`,
  urmeaza: `Te sunăm la ${c.telefon} ca să stabilim greutatea, decorul, prețul și ora la care îl ridici de la cofetărie.` };
const sablon = SABLOANE[tip] || { subiect: `Am primit cererea ta (${id})`, intro: `Am primit cererea ta (${TIPURI[tip].toLowerCase()}).`, urmeaza: `Te sunăm la ${c.telefon} cu un răspuns, de obicei în aceeași zi lucrătoare.` };
const subiect = sablon.subiect;
const emailText = [
  `Bună, ${prenume}!`, '',
  sablon.intro,
  sablon.urmeaza, '',
  c.mesaj ? `Ce ne-ai scris: „${c.mesaj}"` : '', c.mesaj ? '' : '',
  `Dacă e urgent, ne găsești la ${cfg.telefon_afisat || '0785255855'}.`, '',
  'Restaurant OK Calafat', cfg.adresa_afisata || 'Str. A.I. Cuza nr. 26, Calafat', cfg.site_url || 'https://restaurantok.com', '',
  `Numărul cererii: ${id}. Datele tale le folosim doar ca să-ți răspundem la această cerere.`
].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');

// 5. rândul pentru Postgres (tabelul `cereri`, vezi n8n/sql/cereri.sql)
const rand = {
  id, tip, nume: c.nume, telefon: c.telefon, email: c.email || null, data_eveniment: c.data_eveniment || null,
  persoane: c.persoane || null, mesaj: c.mesaj || null, detalii: JSON.stringify(c.detalii), pagina: c.pagina || null,
  ip: ip || null, user_agent: text(headers['user-agent'], 300) || null, creat: acumIso()
};

return [{ json: { ok: true, status: 200, id, cerere: c, are_email: !!c.email, are_poza: !!pozaBase64, poza_base64: pozaBase64 || undefined,
  poza_nume: pozaBase64 ? `${id}-${(tort.poza_model.nume || 'model').replace(/[^A-Za-z0-9._-]+/g, '_')}` : undefined, poza_tip: pozaBase64 ? tort.poza_model.tip : undefined,
  telegram, email_subiect: subiect, email_text: emailText, rand, raspuns: { ok: true, id } } }];
