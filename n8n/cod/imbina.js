// Nodul Code „Îmbină" (n8n). Intrare: rezultatul nodului GitHub „Citește JSON curent" (câmpul `content`
// în base64, sau o eroare dacă fișierul nu există încă). Citește comanda din „Interpretează mesajul" și
// întoarce ce trebuie scris în data/meniu-zilei.json și ce mesaj primește Sorin pe Telegram:
//   { scrie, continut, commit, are_poza, cale_poza, mesaj, chat_id }
// Dacă nu e nimic de scris și nimic de spus (trigger-ul de la 16:00 când meniul e deja închis) nu întoarce niciun item.
const cfg = $('Config').first().json;
const cmd = $('Interpretează mesajul').first().json;
const r = ($input.first() && $input.first().json) || {};
const fus = cfg.fus_orar || 'Europe/Bucharest';
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

function pad(n) { return (n < 10 ? '0' : '') + n; }
function isoCuOffset(d) { // '2026-10-20T11:04:00+03:00' în fusul restaurantului
  try {
    const p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: fus, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(d).forEach(x => { p[x.type] = x.value; });
    let off = '+02:00';
    try { const o = new Intl.DateTimeFormat('en-GB', { timeZone: fus, timeZoneName: 'longOffset' }).formatToParts(d).find(x => x.type === 'timeZoneName').value; const m = /GMT([+-]\d{2}:\d{2})/.exec(o); if (m) off = m[1]; } catch (e) {}
    return `${p.year}-${p.month}-${p.day}T${p.hour % 24 === 24 ? '00' : p.hour}:${p.minute}:${p.second}${off}`;
  } catch (e) { return d.toISOString(); }
}
function dataRo(iso) { const p = String(iso || '').split('-'); return p.length === 3 ? `${+p[2]} ${LUNI[+p[1] - 1]}` : iso; }

let existent = null;
try { if (r && r.content) existent = JSON.parse(Buffer.from(String(r.content).replace(/\n/g, ''), 'base64').toString('utf8')); } catch (e) { existent = null; }

const acum = new Date();
const actualizat = isoCuOffset(acum);
let nou = null, mesaj = '', scrie = false, poza = null;

switch (cmd.actiune) {
  case 'meniu': {
    const m = cmd.meniu;
    const pastreazaPoze = existent && existent.data === m.data && Array.isArray(existent.poze);
    // traducerile EN/BG (M8) vin din nodul „Traduceri" (glosar local sau DeepL); lipsesc dacă Config.traducere = 'nu'
    let trad = null, sursaTrad = null, netraduse = [];
    try { const t = $('Traduceri').first().json; if (t && t.traduceri) { trad = t.traduceri; sursaTrad = t.sursa || null; netraduse = t.netraduse || []; } } catch (e) { trad = null; }
    nou = {
      actualizat, data: m.data, valabil_pana: m.valabil_pana, pret: m.pret, moneda: m.moneda,
      preparate: m.preparate, poze: pastreazaPoze ? existent.poze : [],
      text_facebook: m.text_facebook, text_original: m.text_original, sursa: 'telegram'
    };
    if (trad) nou.traduceri = trad;
    scrie = true;
    const linieTrad = !trad ? '' : netraduse.length
      ? `\n🌐 EN/BG: ${netraduse.length === m.preparate.length ? 'netradus' : 'parțial'} (${netraduse.map(x => '„' + x + '"').join(', ')} rămâne în română). Corectezi cu <code>en 2: …</code> / <code>bg 2: …</code>.`
      : `\n🌐 EN/BG: tradus automat (${sursaTrad && sursaTrad.en === 'deepl' ? 'DeepL' : 'glosar'}). Corectezi cu <code>en 2: …</code> / <code>bg 2: …</code>.`;
    mesaj = `✅ Meniul pentru <b>${dataRo(m.data)}</b>${m.data_explicita ? '' : ' (dată dedusă)'} ajunge pe site în ~1 minut.\n`
      + m.preparate.map((p, i) => `${i + 1}. ${p.nume}${p.alergeni.length ? ' — <i>' + p.alergeni.join(', ') + '</i>' : ' — <i>fără alergeni</i>'}${p.alergeni_automat ? ' (automat)' : ''}`).join('\n')
      + `\n${m.pret} ${m.moneda}`
      + linieTrad
      + `\n\nCorectezi alergenii cu <code>alergeni 1: gluten, ou</code>. Trimite pozele când sunt gata. <code>gata</code> închide meniul mai devreme.`
      + (cfg.site_url ? `\n${cfg.site_url}/#meniul-zilei` : '');
    break;
  }
  case 'poza': {
    if (!existent || !existent.data) { mesaj = '⚠️ Nu există un meniu pe site. Trimite întâi textul meniului, apoi pozele.'; break; }
    const n = (Array.isArray(existent.poze) ? existent.poze.length : 0) + 1;
    if (n > 6) { mesaj = '⚠️ Sunt deja 6 poze la meniul de azi; site-ul arată primele 3.'; break; }
    poza = `data/poze/${existent.data}-${n}.jpg`;
    nou = Object.assign({}, existent, { actualizat, poze: (existent.poze || []).concat([poza]) });
    scrie = true;
    mesaj = `📷 Poza ${n} a fost adăugată la meniul din ${dataRo(existent.data)}.`;
    break;
  }
  case 'gata': {
    const dinProgram = cmd.sursa === 'program';
    if (!existent || !existent.valabil_pana) { mesaj = dinProgram ? '' : 'Nu există niciun meniu de închis.'; break; }
    if (!(Date.parse(existent.valabil_pana) > acum.getTime())) { mesaj = dinProgram ? '' : 'Meniul era deja închis.'; break; }
    nou = Object.assign({}, existent, { actualizat, valabil_pana: actualizat });
    scrie = true;
    mesaj = dinProgram ? `🕓 Meniul din ${dataRo(existent.data)} s-a închis automat la ${cfg.ora_inchidere || '16:00'}.` : `🕓 Meniul din ${dataRo(existent.data)} a fost închis; site-ul arată acum mesajul de rezervă.`;
    break;
  }
  case 'alergeni': {
    if (!existent || !Array.isArray(existent.preparate) || !existent.preparate[cmd.index]) { mesaj = `⚠️ Nu există preparatul ${cmd.index + 1} în meniul curent.`; break; }
    nou = JSON.parse(JSON.stringify(existent));
    nou.actualizat = actualizat;
    nou.preparate[cmd.index].alergeni = cmd.alergeni || [];
    delete nou.preparate[cmd.index].alergeni_automat;
    scrie = true;
    mesaj = `✅ Alergenii pentru „${nou.preparate[cmd.index].nume}": ${(cmd.alergeni || []).join(', ') || 'niciunul'}.`;
    break;
  }
  case 'traducere': { // „en 2: Fried carp with polenta" (M8)
    if (!existent || !Array.isArray(existent.preparate) || !existent.preparate[cmd.index]) { mesaj = `⚠️ Nu există preparatul ${cmd.index + 1} în meniul curent.`; break; }
    nou = JSON.parse(JSON.stringify(existent));
    nou.actualizat = actualizat;
    nou.traduceri = nou.traduceri && typeof nou.traduceri === 'object' ? nou.traduceri : {};
    const lista = (nou.traduceri[cmd.limba] && Array.isArray(nou.traduceri[cmd.limba].preparate)) ? nou.traduceri[cmd.limba].preparate.slice() : [];
    while (lista.length < nou.preparate.length) lista.push(null);
    lista[cmd.index] = cmd.traducere;
    nou.traduceri[cmd.limba] = { preparate: lista.slice(0, nou.preparate.length) };
    scrie = true;
    mesaj = `✅ ${cmd.limba.toUpperCase()} pentru „${nou.preparate[cmd.index].nume}": ${cmd.traducere}`;
    break;
  }
  default:
    mesaj = '';
}

if (!scrie && !mesaj) return [];
return [{ json: {
  scrie, mesaj, chat_id: cmd.chat_id,
  continut: nou ? JSON.stringify(nou, null, 2) + '\n' : '',
  commit: nou ? `data: meniu-zilei.json ${nou.data}${poza ? ' (poză)' : ''}` : '',
  are_poza: !!poza, cale_poza: poza
} }];
