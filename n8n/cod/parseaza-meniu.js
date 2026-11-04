/* Parsarea textului „meniul zilei" trimis de Sorin pe Telegram → obiectul din data/meniu-zilei.json.
   Fișierul este sursa pentru nodul Code „Interpretează mesajul" din n8n/meniu-zilei.json
   (n8n/genereaza.js îl inserează în workflow) și se testează separat: node tests/parseaza-meniu.test.js.
   Fără dependențe; rulează în Node 18+ (n8n) și în browser. */
(function (root) {
  'use strict';

  var LUNI = { ianuarie: 1, ian: 1, februarie: 2, feb: 2, martie: 3, mar: 3, aprilie: 4, apr: 4, mai: 5, iunie: 6, iun: 6, iulie: 7, iul: 7,
    august: 8, aug: 8, septembrie: 9, sept: 9, sep: 9, octombrie: 10, oct: 10, noiembrie: 11, noi: 11, nov: 11, decembrie: 12, dec: 12 };
  var ZILE = { duminica: 0, duminică: 0, luni: 1, marti: 2, marți: 2, miercuri: 3, joi: 4, vineri: 5, sambata: 6, sâmbătă: 6, simbata: 6 };

  // Detectare automată de alergeni după cuvinte-cheie (cele 14 categorii UE). Este un AJUTOR, nu o garanție:
  // confirmarea de pe Telegram arată ce s-a detectat, iar Sorin poate corecta cu „alergeni 2: gluten, ou"
  // sau poate scrie alergenii explicit în paranteză după preparat: „Ciorbă de perișoare (gluten, ou, țelină)".
  var ALERGENI = [
    ['gluten', /p[âa]ine|pesmet|\bpane\b|[șs]ni[țt]el|t[ăa]i[țt]ei|g[ăa]lu[șs]|\bpaste\b|spaghete|macaroane|cl[ăa]tit|aluat|pl[ăa]cint|\bgri[șs]\b|cu[șs]cu[șs]|peri[șs]oar|chiftel|p[âa]rjoal|sarmale|burger|pizza|foietaj|f[ăa]in[ăa]|crutoane|\borz\b|secar[ăa]|ov[ăa]z|bulgur|lasagna|covrig|papana[șs]|gogo[șs]|\btort\b|pr[ăa]jitur|cozonac|biscui|ecler|[șs]trudel|\bcrem[șs]nit|salat[ăa] (de )?boeuf|ciulama|rulad[ăa]/i],
    ['ou', /\bou[ăa]?\b|\bou[ăa]\b|maionez|omlet|peri[șs]oar|chiftel|p[âa]rjoal|[șs]ni[țt]el|\bpane\b|papana[șs]|cl[ăa]tit|\btort\b|pr[ăa]jitur|ecler|cozonac|g[ăa]lu[șs]|boeuf|drob|musaca|sufleu|bezea|cl[ăa]tite/i],
    ['lapte', /\blapte|sm[âa]nt[âa]n|br[âa]nz|ca[șs]caval|telemea|urd[ăa]|\bunt\b|iaurt|fri[șs]c|\bsana\b|mozzarella|parmezan|papana[șs]|gratinat|bechamel|piure|ciulama|\bcrem[ăa]\b|[îi]nghe[țt]at|ecler|\btort\b|pr[ăa]jitur|cheesecake|tiramisu|lasagna|pizza|sufleu|budinc[ăa]|m[ăa]m[ăa]lig[ăa] cu br[âa]nz/i],
    ['pește', /pe[șs]te\b|\bcrap\b|p[ăa]str[ăa]v|\bsomn\b|[șs]al[ăa]u|[șs]tiuc[ăa]|hering|macrou|scrumbie|\bton\b|somon|\bcaras\b|pl[ăa]tic[ăa]|plachie|an[șs]oa|sardin|\bcod\b|merluciu|dorad[ăa]|biban/i],
    ['țelină', /[țt]elin|ciorb[ăa]|\bsup[ăa]\b|\bbor[șs]\b|rasol|\bzeam[ăa]\b/i],
    ['soia', /\bsoia|tofu|edamame|ciocolat/i],
    ['muștar', /mu[șs]tar/i],
    ['fructe cu coajă', /\bnuc[iă]\b|\bnuc[ăa]\b|alune|migdal|fistic|caju|pecan|macadamia|baklava|cataif/i],
    ['arahide', /arahid/i],
    ['susan', /susan|tahini|hum+us/i],
    ['sulfiți', /\bvin\b|\bvin (alb|ro[șs]u)|stafid|fructe uscate|o[țt]et balsamic/i],
    ['crustacee', /creve[țt]|\braci?\b|homar|\bcrab/i],
    ['moluște', /midii|scoici|calamar|caracati[țt]|sepie|melci/i],
    ['lupin', /lupin/i]
  ];
  var NUME_ALERGENI = { gluten: 'gluten', ou: 'ou', oua: 'ou', 'ouă': 'ou', lapte: 'lapte', lactoza: 'lapte', 'lactoză': 'lapte', peste: 'pește', 'pește': 'pește',
    telina: 'țelină', 'țelină': 'țelină', soia: 'soia', mustar: 'muștar', 'muștar': 'muștar', nuci: 'fructe cu coajă', alune: 'fructe cu coajă', 'fructe cu coaja': 'fructe cu coajă',
    'fructe cu coajă': 'fructe cu coajă', arahide: 'arahide', susan: 'susan', sulfiti: 'sulfiți', 'sulfiți': 'sulfiți', crustacee: 'crustacee', moluste: 'moluște', 'moluște': 'moluște', lupin: 'lupin', fara: null, 'fără': null, niciunul: null, '-': null };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoZi(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }

  // ora locală (Europe/Bucharest) ca obiect { data:'YYYY-MM-DD', ora, minut, zi (0=duminică), offset:'+03:00' }
  function localRo(acum, fus) {
    acum = acum || new Date(); fus = fus || 'Europe/Bucharest';
    try {
      var p = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: fus, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
        .formatToParts(acum).forEach(function (x) { p[x.type] = x.value; });
      var offset = '+02:00';
      try {
        var o = new Intl.DateTimeFormat('en-GB', { timeZone: fus, timeZoneName: 'longOffset' }).formatToParts(acum).filter(function (x) { return x.type === 'timeZoneName'; })[0].value;
        var m = /GMT([+-]\d{2}:\d{2})/.exec(o); if (m) offset = m[1];
      } catch (e) {}
      return { data: p.year + '-' + p.month + '-' + p.day, ora: +p.hour % 24, minut: +p.minute, zi: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday], offset: offset };
    } catch (e) {
      return { data: acum.toISOString().slice(0, 10), ora: acum.getUTCHours(), minut: acum.getUTCMinutes(), zi: acum.getUTCDay(), offset: '+02:00' };
    }
  }
  function plusZile(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoZi(d); }
  function offsetPentru(dataIso, fus) { // offset-ul României la prânz în ziua dată (vară +03:00, iarnă +02:00)
    return localRo(new Date(dataIso + 'T10:00:00Z'), fus).offset;
  }

  function capitalizeaza(s) { s = s.trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function curata(s) { return s.replace(/\s+/g, ' ').replace(/^[\s\-–•*·\d.)]+/, '').replace(/[\s.;,]+$/, '').trim(); }

  function categorie(nume) {
    var n = nume.toLowerCase();
    if (/^desert|pr[ăa]jitur|\btort\b|papana[șs]|cl[ăa]tit|[îi]nghe[țt]at|ecler|pl[ăa]cint[ăa] cu (mere|br[âa]nz|dovleac)|g[ăa]lu[șs]te cu prune|cozonac|budinc[ăa]/.test(n)) return 'desert';
    if (/^(ciorb[ăa]|sup[ăa]|bor[șs]|zeam[ăa])/.test(n)) return /^sup[ăa]/.test(n) ? 'supă' : 'ciorbă';
    if (/^(salat[ăa]|mur[ăa]tur|garnitur|cartofi|orez|pilaf|m[ăa]m[ăa]lig[ăa]$|legume la|piure$)/.test(n)) return 'garnitură';
    return 'fel principal';
  }
  function alergeniAutomat(nume) {
    var out = [];
    ALERGENI.forEach(function (a) { if (a[1].test(nume) && out.indexOf(a[0]) < 0) out.push(a[0]); });
    return out;
  }
  function alergeniExpliciti(text) { // „gluten, ou, telina" → ['gluten','ou','țelină']; „fără" → []
    var out = [];
    text.split(/[,;/]|\s+[șs]i\s+/).forEach(function (t) {
      t = t.trim().toLowerCase().replace(/\.$/, ''); if (!t) return;
      var k = NUME_ALERGENI.hasOwnProperty(t) ? NUME_ALERGENI[t] : t;
      if (k && out.indexOf(k) < 0) out.push(k);
    });
    return out;
  }

  /* detecteazaData(text, local) → { data:'YYYY-MM-DD', rest: text fără expresia de dată, explicit: bool } */
  function detecteazaData(text, local) {
    var azi = local.data, m, data = null, rest = text;
    if ((m = /\bm[âa]ine\b/i.exec(text))) { data = plusZile(azi, 1); rest = text.replace(m[0], ' '); }
    else if ((m = /\b(azi|ast[ăa]zi)\b/i.exec(text))) { data = azi; rest = text.replace(m[0], ' '); }
    else if ((m = /\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/.exec(text))) {
      var an = m[3] ? (+m[3] < 100 ? 2000 + (+m[3]) : +m[3]) : +azi.slice(0, 4);
      data = an + '-' + pad(+m[2]) + '-' + pad(+m[1]); rest = text.replace(m[0], ' ');
      if (!m[3] && data < azi) data = (an + 1) + data.slice(4);
    } else if ((m = /\b(\d{1,2})\s+(ianuarie|ian|februarie|feb|martie|mar|aprilie|apr|mai|iunie|iun|iulie|iul|august|aug|septembrie|sept|sep|octombrie|oct|noiembrie|noi|nov|decembrie|dec)\b\.?(\s+\d{4})?/i.exec(text))) {
      var an2 = m[3] ? +m[3].trim() : +azi.slice(0, 4);
      data = an2 + '-' + pad(LUNI[m[2].toLowerCase()]) + '-' + pad(+m[1]); rest = text.replace(m[0], ' ');
      if (!m[3] && data < plusZile(azi, -3)) data = (an2 + 1) + data.slice(4);
    } else if ((m = /\b(luni|mar[țt]i|miercuri|joi|vineri|s[âa]mb[ăa]t[ăa]|simbata|duminic[ăa])\b/i.exec(text))) {
      var tinta = ZILE[m[1].toLowerCase()], d = 0;
      while (((local.zi + d) % 7) !== tinta) d++;
      if (d === 0 && local.ora >= 16) d = 7;
      data = plusZile(azi, d); rest = text.replace(m[0], ' ');
    }
    if (!data) return { data: local.ora >= 14 ? plusZile(azi, 1) : azi, rest: text, explicit: false };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || isNaN(Date.parse(data + 'T00:00:00Z'))) return { eroare: 'Nu înțeleg data „' + m[0] + '".' };
    return { data: data, rest: rest, explicit: true };
  }

  /* parseazaMeniu(text, acum, optiuni) →
       { data, valabil_pana, pret, moneda, preparate:[{categorie, nume, alergeni, alergeni_automat}], text_original, data_explicita }
       sau { eroare: '...' }
     optiuni: { pret_implicit: 24, ora_inchidere: '16:00', fus: 'Europe/Bucharest' } */
  function parseazaMeniu(text, acum, optiuni) {
    optiuni = optiuni || {};
    var local = localRo(acum, optiuni.fus);
    var t = String(text || '').replace(/\r/g, '').trim();
    if (!t) return { eroare: 'Mesajul este gol.' };

    // telefonul și „comenzi: …" nu intră în meniu
    t = t.replace(/\(?\+?4?0\s?\d{3}[\s.-]?\d{3}[\s.-]?\d{3}\)?/g, ' ').replace(/\b(comenzi|rezerv[ăa]ri|telefon|tel)\s*:?\s*(la)?\s*\.?/gi, ' ');

    // prețul
    var pret = optiuni.pret_implicit == null ? 24 : optiuni.pret_implicit, mp = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(lei|ron)\b/i.exec(t);
    if (mp) { pret = parseFloat(mp[1].replace(',', '.')); t = t.replace(mp[0], ' '); }

    // data
    var antet = t.split('\n')[0];
    var dd = detecteazaData(antet, local);
    if (dd.eroare) return dd;
    if (dd.explicit) t = dd.rest + t.slice(antet.length);

    // antetul „Meniul zilei …:" se taie
    var linii = t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    if (linii.length && /^(meniul?|meniul zilei|azi|m[âa]ine)\b[^:\n]{0,40}:/i.test(linii[0])) linii[0] = linii[0].replace(/^[^:]*:\s*/, '');
    else if (linii.length && /^(meniul?( zilei)?)\s*[,!.-]*\s*$/i.test(linii[0])) linii.shift();
    if (linii.length === 1 && /^[^:]{0,30}:\s*/.test(linii[0]) && !/\(/.test(linii[0].split(':')[0])) linii[0] = linii[0].replace(/^[^:]*:\s*/, '');

    // preparatele: câte unul pe rând sau separate prin virgulă / punct și virgulă / „•"
    var bucati = [];
    linii.forEach(function (l) {
      var parti = linii.length === 1 ? l.split(/\s*(?:;|•|\|)\s*|,(?![^(]*\))\s*/) : [l];
      parti.forEach(function (p) { p = curata(p); if (p) bucati.push(p); });
    });
    bucati = bucati.filter(function (b) { return !/^(poft[ăa] bun[ăa]|v[ăa] a[șs]tept[ăa]m|la pachet.*|livrare.*)$/i.test(b); });
    if (!bucati.length) return { eroare: 'Nu am găsit niciun preparat în mesaj.' };
    if (bucati.length > 8) return { eroare: 'Am găsit ' + bucati.length + ' preparate; scrie cel mult 8, câte unul pe rând.' };

    var preparate = bucati.map(function (b) {
      var m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(b), nume = b, alergeni, automat = true, cat = null;
      if (m && /^(f[ăa]r[ăa]|niciunul|-|[a-zăâîșț ,;/]+)$/i.test(m[2]) && alergeniExpliciti(m[2]).every(function (a) { return /^(gluten|ou|lapte|pește|țelină|soia|muștar|fructe cu coajă|arahide|susan|sulfiți|crustacee|moluște|lupin)$/.test(a); })) {
        nume = m[1]; alergeni = alergeniExpliciti(m[2]); automat = false;
      }
      var mc = /^(ciorb[ăa]|sup[ăa]|fel principal|fel|garnitur[ăa]|salat[ăa]|desert)\s*:\s*(.+)$/i.exec(nume);
      if (mc) { cat = mc[1].toLowerCase().replace('fel', 'fel principal').replace('fel principal principal', 'fel principal'); nume = mc[2]; }
      nume = capitalizeaza(curata(nume));
      if (automat) alergeni = alergeniAutomat(nume);
      var p = { categorie: cat || categorie(nume), nume: nume, alergeni: alergeni };
      if (automat) p.alergeni_automat = true;
      return p;
    }).filter(function (p) { return p.nume.length >= 3; });
    if (!preparate.length) return { eroare: 'Preparatele sunt prea scurte ca să le înțeleg.' };
    if (preparate.some(function (p) { return p.nume.length > 90; })) return { eroare: 'Un preparat are peste 90 de caractere; probabil lipsesc virgulele sau rândurile noi.' };

    var inchidere = /^(\d{1,2}):(\d{2})$/.test(optiuni.ora_inchidere || '') ? optiuni.ora_inchidere : '16:00';
    return {
      data: dd.data,
      valabil_pana: dd.data + 'T' + pad(+inchidere.split(':')[0]) + ':' + inchidere.split(':')[1] + ':00' + offsetPentru(dd.data, optiuni.fus),
      pret: pret, moneda: 'lei', preparate: preparate,
      text_original: String(text).trim(), data_explicita: dd.explicit
    };
  }

  // textul pentru Facebook / confirmare: „Meniul zilei, 20 octombrie: ciorbă …, crap …. 24 lei. Comenzi: 0785255855."
  var LUNI_LUNG = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  function textFacebook(meniu, telefon) {
    var p = meniu.data.split('-');
    var lista = meniu.preparate.map(function (x, i) { return i ? x.nume.charAt(0).toLowerCase() + x.nume.slice(1) : x.nume.charAt(0).toLowerCase() + x.nume.slice(1); }).join(', ');
    return 'Meniul zilei, ' + (+p[2]) + ' ' + LUNI_LUNG[+p[1] - 1] + ': ' + lista + '. ' + meniu.pret + ' ' + meniu.moneda + '.' + (telefon ? ' Comenzi: ' + telefon + '.' : '');
  }

  var api = { parseazaMeniu: parseazaMeniu, textFacebook: textFacebook, localRo: localRo, alergeniExpliciti: alergeniExpliciti, alergeniAutomat: alergeniAutomat, plusZile: plusZile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ParsareMeniu = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
