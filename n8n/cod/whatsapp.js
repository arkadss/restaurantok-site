// Nod Code „Pregătește WhatsApp" (workflow site-cerere, M8). Rulează în n8n (sandbox: fără require).
// Intrare: item-ul curent (ignorat) + nodurile „Validează cererea" (cererea validată) și „Config" (whatsapp, whatsapp_phone_number_id,
//   whatsapp_sorin, whatsapp_sablon_sorin, whatsapp_sablon_client, whatsapp_limba, whatsapp_api_url).
// Ieșire: un item pentru fiecare mesaj de trimis prin WhatsApp Cloud API (POST {api_url}/{phone_number_id}/messages):
//   { catre: 'sorin' | 'client', url, to, sablon, body }   — body este corpul JSON gata de trimis (mesaj de tip „template").
// Cine primește: Config.whatsapp = 'sorin' → doar Sorin; 'sorin+client' → Sorin și clientul (confirmarea comenzii, ca emailul);
//   'nu' sau Phone number ID încă <<TODO>> → niciun mesaj, dar se întoarce un item { sari: true } ca fluxul să continue spre Postgres.
// Mesajele către un număr care nu a scris businessului în ultimele 24 h trebuie să fie ȘABLOANE aprobate în WhatsApp Manager
//   (categoria Utility); textele exacte ale celor două șabloane sunt în n8n/README.md, secțiunea „M8 — WhatsApp Business".
// Parametrii de șablon nu pot conține rânduri noi, taburi sau mai mult de 4 spații consecutive și nu pot fi goi (Meta refuză mesajul).
const cfg = $('Config').first().json;
const v = $('Validează cererea').first().json;
const c = v.cerere || {};
const d = c.detalii || {};

const mod = String(cfg.whatsapp || 'nu').trim().toLowerCase();
const phoneNumberId = String(cfg.whatsapp_phone_number_id || '').trim();
const apiUrl = String(cfg.whatsapp_api_url || 'https://graph.facebook.com/v21.0').replace(/\/+$/, '');
const limba = String(cfg.whatsapp_limba || 'ro').trim() || 'ro';
const sari = (motiv) => [{ json: { sari: true, motiv } }];
if (!v.ok || mod === 'nu' || mod === '') return sari('whatsapp dezactivat (Config.whatsapp = nu)');
if (!phoneNumberId || /<<TODO/.test(phoneNumberId)) return sari('Config.whatsapp_phone_number_id este încă placeholder');

// numere în format internațional fără „+" (așa le cere Cloud API): 0722… → 40722…, +40… → 40…
const e164 = t => { const s = String(t || '').replace(/[\s.\-()]/g, ''); if (/^\+?40\d{9}$/.test(s)) return s.replace(/^\+/, ''); if (/^0040\d{9}$/.test(s)) return s.slice(2); if (/^0[237]\d{8}$/.test(s)) return '4' + s; if (/^\+\d{8,15}$/.test(s)) return s.slice(1); return ''; };
// text sigur pentru un parametru de șablon: fără rânduri noi/taburi, un singur spațiu între cuvinte, niciodată gol, scurt
const param = (s, max) => { const t = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max || 200); return t || '-'; };

const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const ZILE = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const dataLunga = iso => { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return ''; const p = iso.split('-'); const dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return ZILE[dt.getUTCDay()] + ', ' + (+p[2]) + ' ' + LUNI[+p[1] - 1] + ' ' + p[0]; };

// ce s-a cerut, pe scurt (același vocabular ca pe Telegram și în email)
const tip = c.tip;
const comanda = tip === 'catering' || tip === 'tort';
const pranz = tip === 'catering' && d.tip_comanda === 'pranz-birou', pomana = tip === 'catering' && d.tip_comanda === 'pomana';
let ce;
if (tip === 'sala') ce = 'Sala de bal' + (d.tip_eveniment_text ? ' — ' + d.tip_eveniment_text : '') + (d.sala_text ? ' (' + d.sala_text.replace(/\s*\(.*\)$/, '') + ')' : '');
else if (tip === 'catering') ce = 'Catering — ' + (d.tip_comanda_text || 'comandă') + (d.livrare === 'ridicare' ? ', ridicare' : d.adresa ? ', livrare la ' + d.adresa : '');
else if (tip === 'tort') ce = 'Tort — ' + (d.tort_text || d.tort || 'tort') + (d.poza_model ? ', cu poză-model' : '');
else ce = 'Rezervare';
const cand = [c.data_eveniment ? (pranz ? 'de ' : tip === 'tort' ? 'pentru ' : '') + dataLunga(c.data_eveniment) + (tip === 'catering' && d.ora ? ', ora ' + d.ora : '') : '',
  c.persoane ? c.persoane + (pranz ? ' porții pe zi' : pomana ? ' pachete' : ' persoane') : ''].filter(Boolean).join(', ') || 'fără dată';

const mesaje = [];
const corp = (to, sablon, parametri) => ({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
  template: { name: sablon, language: { code: limba }, components: [{ type: 'body', parameters: parametri.map(t => ({ type: 'text', text: param(t) })) }] } });
const url = apiUrl + '/' + encodeURIComponent(phoneNumberId) + '/messages';

// 1. Sorin: șablonul „cerere_noua" cu 6 parametri — {{1}} cerere nouă/comandă nouă, {{2}} ce, {{3}} nume, {{4}} telefon, {{5}} când + câți, {{6}} id
const sorin = e164(cfg.whatsapp_sorin);
if (sorin) mesaje.push({ json: { catre: 'sorin', url, to: sorin, sablon: String(cfg.whatsapp_sablon_sorin || 'cerere_noua'),
  body: corp(sorin, String(cfg.whatsapp_sablon_sorin || 'cerere_noua'), [comanda ? 'comandă nouă' : 'cerere nouă', ce, c.nume, c.telefon, cand, v.id]) } });

// 2. clientul (doar în modul sorin+client): șablonul „confirmare_cerere" cu 4 parametri — {{1}} prenume, {{2}} ce am primit, {{3}} id, {{4}} telefonul la care sunăm
if (mod === 'sorin+client') {
  const client = e164(c.telefon);
  const prenume = String(c.nume || '').split(/\s+/)[0] || 'ziua bună';
  const primit = tip === 'sala' ? 'cererea ta de ofertă pentru Sala de bal OK' + (c.data_eveniment ? ', ' + dataLunga(c.data_eveniment) : '')
    : tip === 'tort' ? 'comanda ta de tort' + (d.tort_text ? ' (' + d.tort_text + ')' : '') + (c.data_eveniment ? ' pentru ' + dataLunga(c.data_eveniment) : '')
    : pranz ? 'comanda ta de prânz la birou' + (c.data_eveniment ? ', de ' + dataLunga(c.data_eveniment) + ' încolo' : '')
    : pomana ? 'comanda ta de pachete pentru pomană / parastas' + (c.data_eveniment ? ', ' + dataLunga(c.data_eveniment) : '')
    : tip === 'catering' ? 'cererea ta de catering' + (c.data_eveniment ? ', ' + dataLunga(c.data_eveniment) : '') : 'cererea ta';
  if (client && client !== sorin) mesaje.push({ json: { catre: 'client', url, to: client, sablon: String(cfg.whatsapp_sablon_client || 'confirmare_cerere'),
    body: corp(client, String(cfg.whatsapp_sablon_client || 'confirmare_cerere'), [prenume, primit, v.id, c.telefon]) } });
}

if (!mesaje.length) return sari('niciun destinatar valid (Config.whatsapp_sorin lipsește sau e placeholder)');
return mesaje;
