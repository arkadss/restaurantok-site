/* Editarea conținutului site-ului prin Telegram (M8): comenzile lui Sorin → modificări în data/program.json,
   data/catering.json și data/torturi.json. Fișierul este inserat de n8n/genereaza.js în nodurile Code
   „Interpretează mesajul" (recunoaște comanda) și „Aplică modificarea" (o aplică pe JSON-ul citit din GitHub)
   din n8n/meniu-zilei.json și se testează separat: node tests/editare.test.js.
   Fără dependențe; rulează în Node 18+ (n8n) și în browser.

   Comenzi (diacriticele sunt opționale; data: 25.12, 25.12.2026, 25 decembrie):
     închis 25.12 Crăciun                      zi închisă (ambele unități); „restaurant" / „cofetărie" o limitează la una
     închis 24.12 - 26.12 cofetărie Sărbători   interval de zile
     deschis 31.12 9:00-15:00 Revelion          program special într-o zi (una sau mai multe perechi de ore)
     șterge 25.12                               scoate excepțiile din ziua aceea
     program cofetărie: luni-sâmbătă 9-20, duminică închis      programul săptămânal al unei unități (toate zilele)
     săptămâna: luni ciorbă de legume, pui la cuptor; marți …   meniul săptămânii pentru prânzul la birou (+ „de la 3.11", „26 lei")
     tort diplomat: 120 lei/kg, 3 zile          preț „de la", unitatea (kg / bucată) și termenul unui tort din catalog
     torturi termen 3 zile                      termenul minim general de comandă
     catering pomeni: 35 lei                    prețul „de la" al unei oferte (evenimente / pomeni / prânz)
     arată program | excepții | săptămâna | torturi | catering     ce e acum în fișiere */
(function (root) {
  'use strict';

  var LUNI = { ianuarie: 1, ian: 1, februarie: 2, feb: 2, martie: 3, mar: 3, aprilie: 4, apr: 4, mai: 5, iunie: 6, iun: 6, iulie: 7, iul: 7,
    august: 8, aug: 8, septembrie: 9, sept: 9, sep: 9, octombrie: 10, oct: 10, noiembrie: 11, noi: 11, nov: 11, decembrie: 12, dec: 12 };
  var LUNI_LUNG = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  var ZILE = ['duminica', 'luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata']; // cheile din program.json (fără diacritice)
  var ZILE_AFISATE = { luni: 'luni', marti: 'marți', miercuri: 'miercuri', joi: 'joi', vineri: 'vineri', sambata: 'sâmbătă', duminica: 'duminică' };
  var ORDINE_ZILE = ['luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata', 'duminica'];
  var UNITATI = { 'gastro-pub': 'Gastro-pub OK', cofetaria: 'Cofetăria OK' };
  var FISIERE = { program: 'data/program.json', catering: 'data/catering.json', torturi: 'data/torturi.json' };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function norm(s) { // minuscule, fără diacritice (și variantele cu sedilă), spații simple
    return String(s || '').toLowerCase().replace(/[șş]/g, 's').replace(/[țţ]/g, 't').replace(/[ăâ]/g, 'a').replace(/î/g, 'i').replace(/\s+/g, ' ').trim();
  }
  function isoZi(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function plusZile(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoZi(d); }
  function ziSapt(iso) { return new Date(iso + 'T00:00:00Z').getUTCDay(); }
  function dataValida(an, luna, zi) { var d = new Date(Date.UTC(an, luna - 1, zi)); return d.getUTCMonth() === luna - 1 && d.getUTCDate() === zi ? isoZi(d) : null; }
  function dataRo(iso, cuAn) { var p = String(iso || '').split('-'); return p.length === 3 ? (+p[2]) + ' ' + LUNI_LUNG[+p[1] - 1] + (cuAn ? ' ' + p[0] : '') : iso; }

  // data/ora locală a restaurantului → { data: 'YYYY-MM-DD', offset: '+03:00' }
  function localRo(acum, fus) {
    acum = acum || new Date(); fus = fus || 'Europe/Bucharest';
    try {
      var p = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: fus, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(acum).forEach(function (x) { p[x.type] = x.value; });
      var offset = '+02:00';
      try {
        var o = new Intl.DateTimeFormat('en-GB', { timeZone: fus, timeZoneName: 'longOffset' }).formatToParts(acum).filter(function (x) { return x.type === 'timeZoneName'; })[0].value;
        var m = /GMT([+-]\d{2}:\d{2})/.exec(o); if (m) offset = m[1];
      } catch (e) {}
      var ora = +p.hour % 24;
      return { data: p.year + '-' + p.month + '-' + p.day, offset: offset, iso: p.year + '-' + p.month + '-' + p.day + 'T' + pad(ora) + ':' + p.minute + ':' + p.second + offset };
    } catch (e) {
      return { data: acum.toISOString().slice(0, 10), offset: '+02:00', iso: acum.toISOString() };
    }
  }

  // ---------- date ----------
  // Găsește datele din text (normalizat): „25.12", „25.12.2026", „25/12", „25 decembrie", „25 dec"; „25.12 - 27.12" și „25-27.12" sunt intervale.
  // Anul lipsă = anul curent, sau următorul dacă ziua ar fi cu peste 30 de zile în trecut. Întoarce { zile: [...iso], rest: textul fără date }.
  function extrageDate(n, azi) {
    var anAzi = +azi.slice(0, 4);
    var zile = [], preaLung = false;
    function completeaza(zi, luna, an) {
      zi = +zi; luna = +luna;
      if (!an) {
        an = anAzi;
        var iso = dataValida(an, luna, zi);
        if (iso && (new Date(iso + 'T00:00:00Z') - new Date(azi + 'T00:00:00Z')) / 864e5 < -30) an++;
      } else { an = +an; if (an < 100) an += 2000; }
      return dataValida(an, luna, zi);
    }
    var reNum = '(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?';
    var reLuna = '(\\d{1,2})\\s+(ianuarie|ian|februarie|feb|martie|mar|aprilie|apr|mai|iunie|iun|iulie|iul|august|aug|septembrie|sept|sep|octombrie|oct|noiembrie|noi|nov|decembrie|dec)\\b(?:\\s+(\\d{4}))?';
    var rest = n;
    // interval „25.12 - 27.12" / „25 - 27.12" / „25 decembrie - 3 ianuarie"
    rest = rest.replace(new RegExp('\\b(?:' + reNum + '|' + reLuna + '|(\\d{1,2}))\\s*(?:-|–|pana la|pana|până la)\\s*(?:' + reNum + '|' + reLuna + ')', 'g'), function () {
      var a = arguments;
      // grupuri: 1-3 num1, 4-6 luna1, 7 doarZi, 8-10 num2, 11-13 luna2
      var b = a[8] ? completeaza(a[8], a[9], a[10]) : completeaza(a[11], LUNI[a[12]], a[13]);
      var s = a[1] ? completeaza(a[1], a[2], a[3]) : a[4] ? completeaza(a[4], LUNI[a[5]], a[6]) : (b ? completeaza(a[7], b.slice(5, 7), b.slice(0, 4)) : null);
      if (!s || !b || b < s) { zile.push(null); return ' '; }
      if ((new Date(b + 'T00:00:00Z') - new Date(s + 'T00:00:00Z')) / 864e5 > 62) { preaLung = true; return ' '; }
      for (var d = s; d <= b; d = plusZile(d, 1)) zile.push(d);
      return ' ';
    });
    if (preaLung) return { eroare: 'Intervalul e prea lung (cel mult 62 de zile).' };
    rest = rest.replace(new RegExp('\\b' + reNum + '\\b', 'g'), function (_, zi, luna, an) { zile.push(completeaza(zi, luna, an)); return ' '; });
    rest = rest.replace(new RegExp('\\b' + reLuna, 'g'), function (_, zi, luna, an) { zile.push(completeaza(zi, LUNI[luna], an)); return ' '; });
    if (zile.some(function (z) { return !z; })) return { eroare: 'Nu înțeleg data. Datele se scriu cu punct (25.12, 25.12.2026 sau 25 decembrie), orele cu două puncte (9:00-15:00).' };
    var unice = []; zile.forEach(function (z) { if (unice.indexOf(z) < 0) unice.push(z); });
    unice.sort();
    return { zile: unice, rest: rest.replace(/\s+/g, ' ').trim() };
  }

  // „9-15", „9:00-15:00", „09.30 - 23.30", „10–22" → [['09:00','15:00'], ...]; întoarce { intervale, rest }
  function extrageIntervale(n) {
    var intervale = [], eroare = null;
    // orele: „9-15", „9:00-15:00", „08:30 - 23:30"; minutele doar cu două puncte (punctul e al datelor: 25.12), fără cifre/punct lipite înainte sau după
    var rest = n.replace(/(?<![\d.:])(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?(?![\d.:])/g, function (_, h1, m1, h2, m2) {
      h1 = +h1; h2 = +h2; m1 = m1 ? +m1 : 0; m2 = m2 ? +m2 : 0;
      if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59) { eroare = 'Ora nu e validă (' + h1 + ':' + pad(m1) + '–' + h2 + ':' + pad(m2) + ').'; return ' '; }
      intervale.push([pad(h1 % 24) + ':' + pad(m1), pad(h2 % 24) + ':' + pad(m2)]);
      return ' ';
    });
    if (eroare) return { eroare: eroare };
    return { intervale: intervale, rest: rest.replace(/\s+/g, ' ').trim() };
  }
  function textIntervale(iv) { return iv && iv.length ? iv.map(function (x) { return x[0] + '–' + x[1]; }).join(', ') : 'închis'; }

  // cuvântul care alege unitatea; întoarce { unitate: 'gastro-pub' | 'cofetaria' | null, rest }
  function extrageUnitate(n) {
    var unitate = null;
    var rest = n.replace(/\b(restaurant(?:ul)?|gastro[- ]?pub(?:ul)?|terasa|pub(?:ul)?)\b/g, function () { unitate = 'gastro-pub'; return ' '; })
      .replace(/\b(cofetari[ae](?:ia)?|cofetarie|cofetaria)\b/g, function () { unitate = unitate === 'gastro-pub' ? 'ambele' : 'cofetaria'; return ' '; })
      .replace(/\b(ambele|peste tot|tot|toate)\b/g, function () { unitate = 'ambele'; return ' '; });
    return { unitate: unitate === 'ambele' ? null : unitate, rest: rest.replace(/\s+/g, ' ').trim() };
  }
  function curataMotiv(original, consumat) {
    // motivul = cuvintele din textul original care au rămas după extragerea datelor/orelor/unității (comparate fără diacritice)
    var curat = function (x) { return x.replace(/^[\s:,;.()-]+|[\s:,;.()-]+$/g, ''); };
    var ramase = consumat.split(' ').map(curat).filter(Boolean);
    if (!ramase.length) return '';
    var cuvinte = String(original).replace(/\s+/g, ' ').trim().split(' ');
    var out = [];
    cuvinte.forEach(function (c) { var k = curat(norm(c)); var i = ramase.indexOf(k); if (k && i >= 0) { ramase.splice(i, 1); out.push(c.replace(/^[,;:()]+|[,;:()]+$/g, '')); } });
    return out.join(' ').trim();
  }

  // zilele săptămânii dintr-un segment (normalizat, fără ore): „luni-vineri", „sambata si duminica", „zilnic" → ['luni', ...]
  function extrageZile(n) {
    var zile = [];
    var alias = { duminica: 'duminica', dum: 'duminica', luni: 'luni', lun: 'luni', marti: 'marti', mar: 'marti', miercuri: 'miercuri', mie: 'miercuri', joi: 'joi', vineri: 'vineri', vin: 'vineri', sambata: 'sambata', simbata: 'sambata', sam: 'sambata' };
    var reZi = '(duminica|dum|luni|lun|marti|mar|miercuri|mie|joi|vineri|vin|sambata|simbata|sam)';
    if (/\b(zilnic|toate zilele|in fiecare zi|luni ?- ?duminica)\b/.test(n)) return ORDINE_ZILE.slice();
    var rest = n.replace(new RegExp('\\b(?:de )?' + reZi + '\\s*(?:-|–|pana la|pana|până la|pana in|pana)\\s*' + reZi + '\\b', 'g'), function (_, a, b) {
      var i = ORDINE_ZILE.indexOf(alias[a]), j = ORDINE_ZILE.indexOf(alias[b]);
      if (i < 0 || j < 0) return ' ';
      for (var k = i; ; k = (k + 1) % 7) { zile.push(ORDINE_ZILE[k]); if (k === j) break; }
      return ' ';
    });
    rest.replace(new RegExp('\\b' + reZi + '\\b', 'g'), function (_, a) { zile.push(alias[a]); return ' '; });
    var unice = []; zile.forEach(function (z) { if (unice.indexOf(z) < 0) unice.push(z); });
    return unice;
  }

  // ---------- recunoașterea comenzii ----------
  /* interpreteaza(text, acum, opt) → null dacă textul NU este o comandă de editare (rămâne meniu al zilei),
     altfel { fisier, tip, ... } sau { fisier: null, tip: 'eroare', eroare } */
  function interpreteaza(text, acum, opt) {
    opt = opt || {};
    var t = localRo(acum, opt.fus);
    var azi = t.data;
    var original = String(text || '').trim();
    var n = norm(original).replace(/^\//, '');
    var m;

    // arată …
    if ((m = /^(arata|vezi|afiseaza)\s+(.+)$/.exec(n))) {
      var ce = m[2].replace(/\bde\b|\bzilele\b|\bcurent[a]?\b|\bactual[a]?\b/g, ' ').trim();
      if (/^(program(ul)?|orar(ul)?)/.test(ce)) return { fisier: FISIERE.program, tip: 'arata', ce: 'program' };
      if (/^(exceptii(le)?|inchis|zile inchise|zile libere|special)/.test(ce)) return { fisier: FISIERE.program, tip: 'arata', ce: 'exceptii' };
      if (/^(saptamana|meniul saptamanii|pranz(ul)?( la birou)?)/.test(ce)) return { fisier: FISIERE.catering, tip: 'arata', ce: 'saptamana' };
      if (/^(torturi(le)?|tort(uri)?|catalog(ul)?|cofetari[ae])/.test(ce)) return { fisier: FISIERE.torturi, tip: 'arata', ce: 'torturi' };
      if (/^(catering(ul)?|oferte(le)?)/.test(ce)) return { fisier: FISIERE.catering, tip: 'arata', ce: 'catering' };
      return { fisier: null, tip: 'eroare', eroare: 'Pot arăta: program, excepții, săptămâna, torturi, catering.' };
    }

    // închis / deschis (program special) / șterge
    if ((m = /^(inchis|inchidem|liber|deschis|program special|orar special|sterge|anuleaza|scoate|anulati?)\b\s*:?\s*(.*)$/.exec(n))) {
      var verb = m[1], restN = m[2];
      var tip = /^(inchis|inchidem|liber)/.test(verb) ? 'inchis' : /^(deschis|program|orar)/.test(verb) ? 'orar_special' : 'sterge';
      var iv = { intervale: [], rest: restN };
      if (tip === 'orar_special') { // orele întâi (9:00-15:00), ca să nu fie luate drept date
        iv = extrageIntervale(restN);
        if (iv.eroare) return { fisier: null, tip: 'eroare', eroare: iv.eroare };
        if (!iv.intervale.length) return { fisier: null, tip: 'eroare', eroare: 'Lipsesc orele. Exemplu: deschis 31.12 9:00-15:00 Revelion.' };
      }
      var d = extrageDate(iv.rest, azi);
      if (d.eroare) return { fisier: null, tip: 'eroare', eroare: d.eroare };
      if (!d.zile.length) return { fisier: null, tip: 'eroare', eroare: 'Lipsește data. Exemplu: ' + (tip === 'inchis' ? 'închis 25.12 Crăciun' : tip === 'orar_special' ? 'deschis 31.12 9:00-15:00 Revelion' : 'șterge 25.12') + '.' };
      if (d.zile.length > 62) return { fisier: null, tip: 'eroare', eroare: 'Intervalul e prea lung (max 62 de zile).' };
      var u = extrageUnitate(d.rest);
      var motiv = tip === 'sterge' ? '' : curataMotiv(original.replace(/^\/?\S+\s*:?\s*/, ''), u.rest);
      return { fisier: FISIERE.program, tip: tip, zile: d.zile, orar: iv.intervale, unitate: u.unitate, motiv: motiv };
    }

    // program <unitate>: luni-vineri 8:30-23:30; sâmbătă …; duminică închis
    if ((m = /^(program(ul)?|orar(ul)?)\s+(restaurant(?:ul)?|gastro[- ]?pub(?:ul)?|terasa|cofetari[ae](?:ia)?|cofetarie|cofetaria)\s*[:\-]?\s*([\s\S]*)$/.exec(n))) {
      var unitate = /cofet/.test(m[4]) ? 'cofetaria' : 'gastro-pub';
      var corp = m[5].trim();
      if (!corp) return { fisier: null, tip: 'eroare', eroare: 'Scrie programul pe zile. Exemplu: program cofetărie: luni-sâmbătă 9:00-20:00, duminică închis.' };
      var orar = {}, segmente = corp.split(/[;,\n]+/);
      for (var i = 0; i < segmente.length; i++) {
        var seg = segmente[i].trim(); if (!seg) continue;
        var ivs = extrageIntervale(seg);
        if (ivs.eroare) return { fisier: null, tip: 'eroare', eroare: ivs.eroare };
        var inchis = /\b(inchis|liber|nu lucram|pauza)\b/.test(ivs.rest);
        var zile = extrageZile(ivs.rest.replace(/\b(inchis|liber|nu lucram|pauza)\b/g, ' '));
        if (!zile.length) return { fisier: null, tip: 'eroare', eroare: 'Nu înțeleg zilele din „' + segmente[i].trim() + '". Exemplu: luni-vineri 9-20.' };
        if (!inchis && !ivs.intervale.length) return { fisier: null, tip: 'eroare', eroare: 'Lipsesc orele pentru „' + segmente[i].trim() + '" (sau scrie „închis").' };
        zile.forEach(function (z) { orar[z] = inchis ? [] : ivs.intervale; });
      }
      var lipsa = ORDINE_ZILE.filter(function (z) { return !(z in orar); });
      if (lipsa.length) return { fisier: null, tip: 'eroare', eroare: 'Lipsesc zilele: ' + lipsa.map(function (z) { return ZILE_AFISATE[z]; }).join(', ') + '. Scrie programul pentru toate cele 7 zile (sau „duminică închis").' };
      var ordonat = {}; ORDINE_ZILE.forEach(function (z) { ordonat[z] = orar[z]; });
      return { fisier: FISIERE.program, tip: 'program', unitate: unitate, orar: ordonat };
    }

    // săptămâna: luni …; marți … (meniul săptămânii, prânz la birou)
    if ((m = /^(saptamana|meniul saptamanii|pranz(?:ul)? la birou)\s*[:\-]?\s*([\s\S]*)$/.exec(n))) {
      var corpS = original.replace(/^\/?\s*(s[ăa]pt[ăa]m[âa]na|meniul s[ăa]pt[ăa]m[âa]nii|pr[âa]nz(?:ul)? la birou)\s*[:\-]?\s*/i, ''); // originalul, cu diacritice, fără cuvântul-cheie
      var pret = null, start = null;
      var nS = norm(corpS);
      var mp = /\b(\d{2,3})\s*(?:lei|ron)\b/.exec(nS); if (mp) pret = +mp[1];
      var md = /\b(?:de la|din|incepand cu|incepand)\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|\d{1,2}\s+[a-z]+)/.exec(nS);
      if (md) {
        var dd = extrageDate(md[1], azi);
        if (dd.eroare || !dd.zile.length) return { fisier: null, tip: 'eroare', eroare: 'Nu înțeleg data de început („de la 3.11").' };
        start = dd.zile[0];
      }
      var segmenteS = corpS.split(/[;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      var zileS = {}, reZiStart = /^(luni|lun|marti|marți|mar|miercuri|mie|joi|vineri|vin|sambata|sâmbătă|simbata|sam|duminica|duminică|dum)\b\s*[:\-]?\s*(.*)$/i;
      var aliasS = { luni: 'luni', lun: 'luni', marti: 'marti', mar: 'marti', miercuri: 'miercuri', mie: 'miercuri', joi: 'joi', vineri: 'vineri', vin: 'vineri', sambata: 'sambata', simbata: 'sambata', sam: 'sambata', duminica: 'duminica', dum: 'duminica' };
      segmenteS.forEach(function (s) {
        var ms = reZiStart.exec(s); if (!ms) return;
        var preparate = ms[2].replace(/\b(de la|din|începând cu|incepand cu|începând|incepand)\s+\S+/gi, '').replace(/\b\d{2,3}\s*(lei|ron)\b/gi, '').split(/\s*,\s*/).map(function (p) { return p.replace(/[.\s]+$/, '').trim(); }).filter(Boolean)
          .map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); });
        if (preparate.length) zileS[aliasS[norm(ms[1])]] = preparate;
      });
      if (!Object.keys(zileS).length) return { fisier: null, tip: 'eroare', eroare: 'Scrie câte o zi pe rând sau desparte zilele cu „;". Exemplu: săptămâna: luni ciorbă de legume, pui la cuptor; marți ciorbă de burtă, sarmale.' };
      if (!start) { var zs = ziSapt(azi); start = zs === 0 ? plusZile(azi, 1) : zs === 6 ? plusZile(azi, 2) : plusZile(azi, 1 - zs); } // luni din săptămâna curentă; sâmbăta/duminica → lunea următoare
      else start = plusZile(start, ziSapt(start) === 0 ? -6 : 1 - ziSapt(start)); // lunea săptămânii în care cade data
      var zileOut = ORDINE_ZILE.filter(function (z) { return zileS[z]; }).map(function (z) { return { data: plusZile(start, ORDINE_ZILE.indexOf(z)), preparate: zileS[z] }; });
      return { fisier: FISIERE.catering, tip: 'saptamana', saptamana: start, pret: pret, zile: zileOut };
    }

    // torturi termen 3 zile
    if ((m = /^torturi(?:le)?\s*[:\-]?\s*termen(?:ul)?(?: minim)?\s*[:\-]?\s*(\d{1,2})\s*zile?\b/.exec(n))) return { fisier: FISIERE.torturi, tip: 'torturi_termen', zile: +m[1] };

    // tort diplomat: 120 lei/kg, 3 zile   |   tort nuntă: la cerere
    if ((m = /^tort(?:ul)?\s+(.+?)\s*[:\-]\s*(.+)$/.exec(n)) || (m = /^tort(?:ul)?\s+([a-z][a-z -]*?)\s+(\d{1,4}\s*(?:lei|ron).*)$/.exec(n))) {
      var cheie = m[1].trim(), valoare = m[2].trim(), rez = { fisier: FISIERE.torturi, tip: 'tort', cheie: cheie };
      if (/\b(la cerere|fara pret|fără preț)\b/.test(valoare)) rez.pret_de_la = null;
      else {
        var mpret = /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:lei|ron)?/.exec(valoare);
        if (!mpret) return { fisier: null, tip: 'eroare', eroare: 'Lipsește prețul. Exemplu: tort diplomat: 120 lei/kg, 3 zile.' };
        rez.pret_de_la = +mpret[1].replace(',', '.');
      }
      if (/\b(kg|kilogram(ul)?)\b/.test(valoare)) rez.per = 'kg';
      else if (/\b(buc|bucata|bucati|felie|felia|portie|portia)\b/.test(valoare)) rez.per = 'bucată';
      var mt = /(\d{1,2})\s*zile?\b/.exec(valoare); if (mt) rez.termen_minim_zile = +mt[1];
      return rez;
    }

    // catering pomeni: 35 lei   |   catering prânz: 24 lei   |   catering evenimente: la cerere
    if ((m = /^catering\s+(evenimente?|pomeni|pomana|parastas(?:e)?|pranz(?: la birou)?|birou)\s*[:\-]?\s*(.+)$/.exec(n))) {
      var idOferta = /^even/.test(m[1]) ? 'evenimente' : /^(pomen|poman|parast)/.test(m[1]) ? 'pomeni' : 'pranz-birou';
      var val = m[2].trim();
      if (/\b(la cerere|fara pret)\b/.test(val)) return { fisier: FISIERE.catering, tip: 'catering_pret', oferta: idOferta, pret_de_la: null };
      var mc = /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:lei|ron)?/.exec(val);
      if (!mc) return { fisier: null, tip: 'eroare', eroare: 'Lipsește prețul. Exemplu: catering pomeni: 35 lei.' };
      return { fisier: FISIERE.catering, tip: 'catering_pret', oferta: idOferta, pret_de_la: +mc[1].replace(',', '.') };
    }

    return null; // nu e comandă de editare
  }

  // ---------- aplicarea pe JSON ----------
  /* aplica(cmd, existent, acum, opt) → { scrie, continut (obiect sau null), commit, mesaj } — existent = JSON-ul curent din GitHub (sau null) */
  function aplica(cmd, existent, acum, opt) {
    opt = opt || {};
    var t = localRo(acum, opt.fus);
    var actualizat = t.iso;
    var out = { scrie: false, continut: null, commit: '', mesaj: '' };
    var ok = function (mesaj, nou, commit) { out.scrie = true; out.continut = nou; out.commit = commit; out.mesaj = mesaj + '\nPe site în ~1 minut.'; return out; };
    var nu = function (mesaj) { out.mesaj = mesaj; return out; };
    if (!cmd || cmd.tip === 'eroare') return nu('⚠️ ' + ((cmd && cmd.eroare) || 'Comandă necunoscută.'));
    if (!existent || typeof existent !== 'object') return nu('⚠️ Nu am putut citi ' + cmd.fisier + ' din repo. Fișierul trebuie să existe deja (vezi n8n/README.md).');
    var nou = JSON.parse(JSON.stringify(existent));
    nou.actualizat = actualizat;
    var numeU = function (u) { return u ? (UNITATI[u] || u) : 'ambele unități'; };
    var zileText = function (zile) { return zile.length === 1 ? dataRo(zile[0], true) : dataRo(zile[0]) + ' – ' + dataRo(zile[zile.length - 1], true) + ' (' + zile.length + ' zile)'; };

    switch (cmd.tip) {
      case 'arata': return nu(arata(cmd.ce, existent, t.data));

      case 'inchis': case 'orar_special': {
        nou.exceptii = Array.isArray(nou.exceptii) ? nou.exceptii : [];
        cmd.zile.forEach(function (zi) {
          nou.exceptii = nou.exceptii.filter(function (e) { return !(e && e.data === zi && (e.unitate || null) === (cmd.unitate || null)); });
          var e = { data: zi };
          if (cmd.unitate) e.unitate = cmd.unitate;
          if (cmd.tip === 'inchis') e.inchis = true; else e.orar = cmd.orar;
          if (cmd.motiv) e.motiv = cmd.motiv;
          nou.exceptii.push(e);
        });
        nou.exceptii.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
        var ce = cmd.tip === 'inchis' ? '🚫 Închis' : '🕓 Program special ' + textIntervale(cmd.orar);
        return ok('✅ ' + ce + ' pe ' + zileText(cmd.zile) + (cmd.motiv ? ' (' + cmd.motiv + ')' : '') + ' — ' + numeU(cmd.unitate) + '.' + (cmd.zile.length === 1 ? '' : '') + '\nAnulezi cu <code>șterge ' + cmd.zile[0].slice(8, 10) + '.' + cmd.zile[0].slice(5, 7) + '</code>.',
          nou, 'data: program.json — ' + (cmd.tip === 'inchis' ? 'închis' : 'program special') + ' ' + cmd.zile[0] + (cmd.zile.length > 1 ? '…' + cmd.zile[cmd.zile.length - 1] : ''));
      }

      case 'sterge': {
        var inainte = Array.isArray(nou.exceptii) ? nou.exceptii.length : 0;
        nou.exceptii = (nou.exceptii || []).filter(function (e) { return !(e && cmd.zile.indexOf(e.data) >= 0 && (!cmd.unitate || (e.unitate || null) === cmd.unitate)); });
        var scoase = inainte - nou.exceptii.length;
        if (!scoase) return nu('Nu era nicio excepție pe ' + zileText(cmd.zile) + (cmd.unitate ? ' pentru ' + numeU(cmd.unitate) : '') + '.');
        return ok('✅ ' + scoase + (scoase === 1 ? ' excepție scoasă' : ' excepții scoase') + ' (' + zileText(cmd.zile) + '); rămâne programul obișnuit.', nou, 'data: program.json — fără excepții ' + cmd.zile[0]);
      }

      case 'program': {
        nou.unitati = nou.unitati || {};
        var u = nou.unitati[cmd.unitate] = nou.unitati[cmd.unitate] || { nume: UNITATI[cmd.unitate] };
        u.orar = cmd.orar;
        delete u._exemplu; delete u._nota; // programul nu mai e exemplu → site-ul scoate „orientativ", build.js îl pune în schema.org
        if (typeof nou._nota === 'string') nou._nota = nou._nota.replace(/\s*Programul cofetăriei este încă EXEMPLU[^.]*\.(\s*TODO-Sorin\.)?/, '').trim();
        if (nou._exemplu && Object.keys(nou.unitati).every(function (k) { return !nou.unitati[k]._exemplu; })) delete nou._exemplu;
        var linii = ORDINE_ZILE.map(function (z) { return ZILE_AFISATE[z] + ': ' + textIntervale(cmd.orar[z]); });
        return ok('✅ Programul pentru <b>' + numeU(cmd.unitate) + '</b>:\n' + linii.join('\n'), nou, 'data: program.json — programul ' + numeU(cmd.unitate));
      }

      case 'saptamana': {
        var ms = nou.meniu_saptamana && typeof nou.meniu_saptamana === 'object' ? nou.meniu_saptamana : {};
        var pretVechi = typeof ms.pret === 'number' ? ms.pret : null;
        var ofertaPranz = (nou.oferte || []).filter(function (o) { return o && o.id === 'pranz-birou'; })[0];
        var pret = cmd.pret != null ? cmd.pret : pretVechi != null ? pretVechi : (ofertaPranz && typeof ofertaPranz.pret_de_la === 'number' ? ofertaPranz.pret_de_la : null);
        nou.meniu_saptamana = { saptamana: cmd.saptamana, pret: pret, moneda: ms.moneda || 'lei', zile: cmd.zile };
        if (cmd.pret != null && ofertaPranz) { ofertaPranz.pret_de_la = cmd.pret; delete ofertaPranz._nota; }
        delete nou._exemplu; // meniul e scris de Sorin, nu mai e exemplu
        var liniiS = cmd.zile.map(function (z) { return ZILE_AFISATE[ORDINE_ZILE[(ziSapt(z.data) + 6) % 7]] + ' ' + (+z.data.slice(8, 10)) + '.' + z.data.slice(5, 7) + ': ' + z.preparate.join(', '); });
        return ok('✅ Meniul săptămânii de la ' + dataRo(cmd.saptamana, true) + (pret != null ? ', ' + pret + ' lei/porție' : ', fără preț afișat') + ':\n' + liniiS.join('\n'), nou, 'data: catering.json — meniul săptămânii ' + cmd.saptamana);
      }

      case 'catering_pret': {
        var of = (nou.oferte || []).filter(function (o) { return o && o.id === cmd.oferta; })[0];
        if (!of) return nu('⚠️ Nu există oferta „' + cmd.oferta + '" în catering.json.');
        of.pret_de_la = cmd.pret_de_la; delete of._nota;
        if (cmd.oferta === 'pranz-birou' && nou.meniu_saptamana && cmd.pret_de_la != null) nou.meniu_saptamana.pret = cmd.pret_de_la;
        return ok('✅ ' + of.nume + ': ' + (cmd.pret_de_la == null ? 'preț la cerere' : 'de la ' + cmd.pret_de_la + ' lei / ' + (of.per || 'persoană')) + '.', nou, 'data: catering.json — preț ' + cmd.oferta);
      }

      case 'torturi_termen': {
        nou.termen_minim_zile = cmd.zile;
        return ok('✅ Termenul minim de comandă pentru torturi: ' + cmd.zile + (cmd.zile === 1 ? ' zi' : ' zile') + '.', nou, 'data: torturi.json — termen ' + cmd.zile + ' zile');
      }

      case 'tort': {
        var lista = Array.isArray(nou.torturi) ? nou.torturi : [];
        var k = norm(cmd.cheie);
        var tort = lista.filter(function (x) { return x && norm(x.id) === k; })[0]
          || lista.filter(function (x) { return x && norm(x.nume).indexOf(k) >= 0; })[0]
          || lista.filter(function (x) { return x && k.split(' ').every(function (w) { return norm(x.nume + ' ' + x.id).indexOf(w) >= 0; }); })[0];
        if (!tort) return nu('⚠️ Nu găsesc tortul „' + cmd.cheie + '". În catalog: ' + lista.map(function (x) { return x.id; }).join(', ') + '.');
        tort.pret_de_la = cmd.pret_de_la;
        if (cmd.per) tort.per = cmd.per;
        if (cmd.termen_minim_zile != null) tort.termen_minim_zile = cmd.termen_minim_zile;
        delete tort._nota;
        if (nou._exemplu && lista.every(function (x) { return !x._nota; })) delete nou._exemplu;
        return ok('✅ ' + tort.nume + ': ' + (cmd.pret_de_la == null ? 'preț la cerere' : 'de la ' + cmd.pret_de_la + ' lei / ' + (tort.per || 'kg'))
          + (tort.termen_minim_zile != null ? ', comandă cu minimum ' + tort.termen_minim_zile + ' zile înainte' : '') + '.', nou, 'data: torturi.json — ' + tort.id);
      }

      default: return nu('⚠️ Comandă necunoscută.');
    }
  }

  // „arată …" → text pentru Telegram
  function arata(ce, json, azi) {
    var lin = [];
    if (ce === 'program') {
      Object.keys(json.unitati || {}).forEach(function (k) {
        var u = json.unitati[k]; if (!u || !u.orar) return;
        lin.push('<b>' + (u.nume || k) + '</b>' + (u._exemplu ? ' (încă exemplu — trimite „program ' + (k === 'cofetaria' ? 'cofetărie' : 'restaurant') + ': …")' : ''));
        ORDINE_ZILE.forEach(function (z) { lin.push('  ' + ZILE_AFISATE[z] + ': ' + textIntervale(u.orar[z])); });
      });
      return lin.length ? lin.join('\n') : 'Nu există program în program.json.';
    }
    if (ce === 'exceptii') {
      var exc = (json.exceptii || []).filter(function (e) { return e && e.data >= azi; });
      if (!exc.length) return 'Nu sunt zile închise sau cu program special de azi încolo.';
      return '<b>Excepții de azi încolo</b>\n' + exc.map(function (e) { return dataRo(e.data, true) + ': ' + (e.inchis ? 'închis' : textIntervale(e.orar)) + (e.motiv ? ' (' + e.motiv + ')' : '') + (e.unitate ? ' — ' + (UNITATI[e.unitate] || e.unitate) : ''); }).join('\n');
    }
    if (ce === 'saptamana') {
      var ms = json.meniu_saptamana;
      if (!ms || !Array.isArray(ms.zile) || !ms.zile.length) return 'Nu e scris niciun meniu al săptămânii.';
      return '<b>Meniul săptămânii de la ' + dataRo(ms.saptamana, true) + '</b>' + (typeof ms.pret === 'number' ? ', ' + ms.pret + ' ' + (ms.moneda || 'lei') + '/porție' : '') + (json._exemplu ? ' (exemplu)' : '') + '\n'
        + ms.zile.map(function (z) { return (+z.data.slice(8, 10)) + '.' + z.data.slice(5, 7) + ': ' + (z.preparate || []).join(', '); }).join('\n');
    }
    if (ce === 'torturi') {
      var l = json.torturi || [];
      if (!l.length) return 'Catalogul de torturi e gol.';
      return '<b>Torturi</b> (termen minim ' + (json.termen_minim_zile || '?') + ' zile)\n' + l.map(function (x) { return x.id + ' — ' + x.nume + ': ' + (typeof x.pret_de_la === 'number' ? 'de la ' + x.pret_de_la + ' lei/' + (x.per || 'kg') : 'preț la cerere') + (x.termen_minim_zile ? ', ' + x.termen_minim_zile + ' zile' : ''); }).join('\n')
        + '\nSchimbi cu <code>tort diplomat: 120 lei/kg, 3 zile</code>.';
    }
    if (ce === 'catering') {
      var o = json.oferte || [];
      if (!o.length) return 'Nu sunt oferte în catering.json.';
      return '<b>Oferte catering</b>\n' + o.map(function (x) { return x.id + ' — ' + x.nume + ': ' + (typeof x.pret_de_la === 'number' ? 'de la ' + x.pret_de_la + ' lei/' + (x.per || 'persoană') : 'preț la cerere'); }).join('\n') + '\nSchimbi cu <code>catering pomeni: 35 lei</code>.';
    }
    return 'Pot arăta: program, excepții, săptămâna, torturi, catering.';
  }

  var AJUTOR = [
    '<b>Editarea site-ului de pe telefon</b> (diacriticele nu contează):',
    '<code>închis 25.12 Crăciun</code> — zi închisă; <code>închis 24.12 - 26.12 cofetărie Sărbători</code> — interval, doar o unitate',
    '<code>deschis 31.12 9:00-15:00 Revelion</code> — program special într-o zi',
    '<code>șterge 25.12</code> — scoate excepția',
    '<code>program cofetărie: luni-sâmbătă 9-20, duminică închis</code> — programul săptămânal (toate zilele)',
    '<code>săptămâna: luni ciorbă de legume, pui la cuptor; marți …</code> — meniul săptămânii la birou (+ <code>de la 3.11</code>, <code>26 lei</code>)',
    '<code>tort diplomat: 120 lei/kg, 3 zile</code> · <code>torturi termen 3 zile</code> · <code>catering pomeni: 35 lei</code>',
    '<code>arată program</code> / <code>excepții</code> / <code>săptămâna</code> / <code>torturi</code> / <code>catering</code>'
  ].join('\n');

  var api = { interpreteaza: interpreteaza, aplica: aplica, arata: arata, norm: norm, extrageDate: extrageDate, extrageIntervale: extrageIntervale, extrageZile: extrageZile, localRo: localRo, AJUTOR: AJUTOR, FISIERE: FISIERE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Editare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
