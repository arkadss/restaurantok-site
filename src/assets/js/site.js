/* restaurantok.com — scripturi comune (fără dependențe)
   1. meniul pe mobil
   2. componenta „deschis acum" + lista de program, din data/program.json
   3. componenta „meniul zilei", din data/meniu-zilei.json (M1)
   4. sala de bal: calendarul de disponibilitate din data/sala-disponibilitate.json + formularul de cerere → webhook (M2)
   5. catering: meniul săptămânii din data/catering.json + formularul de comandă (același webhook, tip "catering") (M3)
   6. cofetăria: catalogul de torturi din data/torturi.json + formularul de comandă cu poză-model (același webhook, tip "tort") (M4)
   7. recenzii Google din data/recenzii.json (prag 30 zile) și postări Facebook din data/postari.json (prag 14 zile), cu auto-ascundere (M5)
   8. evenimente viitoare din data/evenimente.json (prag 7 zile) + JSON-LD schema.org/Event injectat în pagină (M6)
   9. limbi (M8): paginile din en/ și bg/ au <html lang> și <meta name="ok-radacina" content="../">; textele componentelor
      „deschis acum", program și meniul zilei vin din dicționarul TEXTE după limbă, iar fișierele se citesc relativ la rădăcină
   Totul este defensiv: dacă JSON-ul lipsește sau e stricat, componentele rămân ascunse
   sau afișează mesajul de rezervă din HTML. Nicio eroare vizibilă pentru vizitator. */
(function (root) {
  'use strict';

  var ZILE = ['duminica', 'luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata']; // ordinea Date.getDay()
  var ORDINE = ['luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata', 'duminica'];

  // ---- limba paginii (M8): ro implicit; en/bg din <html lang>. Textele componentelor vii, pe limbi. ----
  var LIMBA = 'ro';
  var TEXTE = {
    ro: {
      zile: { luni: 'Luni', marti: 'Marți', miercuri: 'Miercuri', joi: 'Joi', vineri: 'Vineri', sambata: 'Sâmbătă', duminica: 'Duminică' },
      luni: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'],
      dataLunga: function (zi, nr, luna) { return zi.toLowerCase() + ', ' + nr + ' ' + luna; },
      dataScurta: function (nr, luna) { return nr + ' ' + luna; },
      inchis: 'închis', deschis: 'Deschis', inchisMare: 'Închis', inchisAzi: 'Închis azi',
      seInchide: function (min) { return 'Se închide în ' + min + ' min'; },
      laOra: function (ora) { return 'la ' + ora; }, panaLa: function (ora) { return 'până la ' + ora; },
      deschideAzi: function (ora) { return 'deschide la ' + ora; }, deschideMaine: function (ora) { return 'deschide mâine la ' + ora; },
      deschideZi: function (zi, ora) { return 'deschide ' + zi.toLowerCase() + ' la ' + ora; },
      orientativ: 'Program orientativ — se confirmă telefonic.', orientativTitlu: 'Program orientativ — se confirmă cu restaurantul.',
      categorii: { 'ciorbă': 'Ciorbă', 'ciorba': 'Ciorbă', 'supă': 'Supă', 'supa': 'Supă', 'fel principal': 'Fel principal', 'principal': 'Fel principal', 'garnitură': 'Garnitură', 'garnitura': 'Garnitură', 'salată': 'Salată', 'salata': 'Salată', 'desert': 'Desert' },
      azi: 'Azi', maine: 'Mâine',
      whatsapp: function (n, maine, data) { return 'Bună! Vreau ' + n + ' × meniul zilei de ' + (maine ? 'mâine' : 'azi') + ', ' + data + '.'; },
      pozaAlt: 'Meniul zilei, ', alergeni: 'Alergeni', limba: 'Limba', maiPutine: 'Mai puține porții', maiMulte: 'Mai multe porții', nrPortii: 'Număr de porții',
      comanda: 'Comandă pe WhatsApp', portii: 'porții', actualizatLa: 'Actualizat la ', serviMaine: 'Se servește mâine, la prânz', laNoi: 'La noi, la pachet sau la birou',
      alergeniLink: 'alergeni', previzualizare: 'previzualizare cu date de exemplu', incheiat: 'Meniul de azi s-a încheiat. Mâine, de la prânz, un meniu nou.'
    },
    en: {
      zile: { luni: 'Monday', marti: 'Tuesday', miercuri: 'Wednesday', joi: 'Thursday', vineri: 'Friday', sambata: 'Saturday', duminica: 'Sunday' },
      luni: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      dataLunga: function (zi, nr, luna) { return zi + ', ' + nr + ' ' + luna; },
      dataScurta: function (nr, luna) { return nr + ' ' + luna; },
      inchis: 'closed', deschis: 'Open', inchisMare: 'Closed', inchisAzi: 'Closed today',
      seInchide: function (min) { return 'Closing in ' + min + ' min'; },
      laOra: function (ora) { return 'at ' + ora; }, panaLa: function (ora) { return 'until ' + ora; },
      deschideAzi: function (ora) { return 'opens at ' + ora; }, deschideMaine: function (ora) { return 'opens tomorrow at ' + ora; },
      deschideZi: function (zi, ora) { return 'opens ' + zi + ' at ' + ora; },
      orientativ: 'Indicative hours — please confirm by phone.', orientativTitlu: 'Indicative hours — please confirm with the restaurant.',
      categorii: { 'ciorbă': 'Soup', 'ciorba': 'Soup', 'supă': 'Soup', 'supa': 'Soup', 'fel principal': 'Main course', 'principal': 'Main course', 'garnitură': 'Side', 'garnitura': 'Side', 'salată': 'Salad', 'salata': 'Salad', 'desert': 'Dessert' },
      azi: 'Today', maine: 'Tomorrow',
      whatsapp: function (n, maine, data) { return 'Hello! I would like ' + n + ' × the menu of the day for ' + (maine ? 'tomorrow' : 'today') + ', ' + data + '.'; },
      pozaAlt: 'Menu of the day, ', alergeni: 'Allergens', limba: 'Language', maiPutine: 'Fewer portions', maiMulte: 'More portions', nrPortii: 'Number of portions',
      comanda: 'Order on WhatsApp', portii: 'portions', actualizatLa: 'Updated at ', serviMaine: 'Served tomorrow, at lunchtime', laNoi: 'Eat in, take away or delivered to the office',
      alergeniLink: 'allergens (RO)', previzualizare: 'preview with sample data', incheiat: "Today's menu is over. A new menu tomorrow, from lunchtime."
    },
    bg: {
      zile: { luni: 'Понеделник', marti: 'Вторник', miercuri: 'Сряда', joi: 'Четвъртък', vineri: 'Петък', sambata: 'Събота', duminica: 'Неделя' },
      luni: ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'],
      dataLunga: function (zi, nr, luna) { return zi.toLowerCase() + ', ' + nr + ' ' + luna; },
      dataScurta: function (nr, luna) { return nr + ' ' + luna; },
      inchis: 'затворено', deschis: 'Отворено', inchisMare: 'Затворено', inchisAzi: 'Затворено днес',
      seInchide: function (min) { return 'Затваря след ' + min + ' мин'; },
      laOra: function (ora) { return 'в ' + ora; }, panaLa: function (ora) { return 'до ' + ora; },
      deschideAzi: function (ora) { return 'отваря в ' + ora; }, deschideMaine: function (ora) { return 'отваря утре в ' + ora; },
      deschideZi: function (zi, ora) { return 'отваря в ' + zi.toLowerCase() + ' в ' + ora; },
      orientativ: 'Ориентировъчно работно време — потвърдете по телефона.', orientativTitlu: 'Ориентировъчно работно време — потвърдете с ресторанта.',
      categorii: { 'ciorbă': 'Супа', 'ciorba': 'Супа', 'supă': 'Супа', 'supa': 'Супа', 'fel principal': 'Основно', 'principal': 'Основно', 'garnitură': 'Гарнитура', 'garnitura': 'Гарнитура', 'salată': 'Салата', 'salata': 'Салата', 'desert': 'Десерт' },
      azi: 'Днес', maine: 'Утре',
      whatsapp: function (n, maine, data) { return 'Здравейте! Искам ' + n + ' × менюто на деня за ' + (maine ? 'утре' : 'днес') + ', ' + data + '.'; },
      pozaAlt: 'Меню на деня, ', alergeni: 'Алергени', limba: 'Език', maiPutine: 'По-малко порции', maiMulte: 'Повече порции', nrPortii: 'Брой порции',
      comanda: 'Поръчай по WhatsApp', portii: 'порции', actualizatLa: 'Обновено в ', serviMaine: 'Сервира се утре, на обяд', laNoi: 'На място, за вкъщи или в офиса',
      alergeniLink: 'алергени (RO)', previzualizare: 'предварителен преглед с примерни данни', incheiat: 'Менюто за днес приключи. Утре, от обяд, ново меню.'
    }
  };
  function T() { return TEXTE[LIMBA] || TEXTE.ro; }
  function setLimba(l) { LIMBA = TEXTE[l] ? l : 'ro'; return LIMBA; }
  // rădăcina site-ului față de pagina curentă ('' în rădăcină, '../' în en/ sau bg/) — pentru data/*.json și linkurile construite din script
  var RADACINA = '';
  function cale(p) { return RADACINA && typeof p === 'string' && !/^(https?:)?\//i.test(p) && !/^data:/i.test(p) ? RADACINA + p : p; }

  // ---- timp local în fusul restaurantului (implicit Europe/Bucharest) ----
  function acumLocal(now, fus) {
    now = now || new Date();
    try {
      var f = new Intl.DateTimeFormat('en-GB', { timeZone: fus || 'Europe/Bucharest', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
      var p = {};
      f.formatToParts(now).forEach(function (x) { p[x.type] = x.value; });
      var wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
      return { data: p.year + '-' + p.month + '-' + p.day, zi: wd, minute: (+p.hour % 24) * 60 + (+p.minute) };
    } catch (e) {
      return { data: now.toISOString().slice(0, 10), zi: now.getDay(), minute: now.getHours() * 60 + now.getMinutes() };
    }
  }
  function dataPlus(iso, zile) { // iso 'YYYY-MM-DD' → iso + zile (calcul în UTC, fără fus)
    var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + zile);
    return { data: d.toISOString().slice(0, 10), zi: d.getUTCDay() };
  }
  function minute(hhmm) { var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? (+m[1]) * 60 + (+m[2]) : NaN; }
  function hhmm(min) { min = ((min % 1440) + 1440) % 1440; var h = Math.floor(min / 60), m = min % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }

  // intervalele efective pentru o zi: excepție (închis / orar special) sau orarul săptămânal
  function intervaleZi(unitate, exceptii, cheieUnitate, zi) {
    var exc = null;
    (exceptii || []).some(function (e) {
      if (e && e.data === zi.data && (!e.unitate || e.unitate === cheieUnitate)) { exc = e; return true; }
      return false;
    });
    var brute;
    if (exc) brute = exc.inchis ? [] : (exc.orar || []);
    else brute = (unitate.orar && unitate.orar[ZILE[zi.zi]]) || [];
    var out = [];
    (brute || []).forEach(function (iv) {
      if (!iv || iv.length < 2) return;
      var a = minute(iv[0]), b = minute(iv[1]);
      if (isNaN(a) || isNaN(b)) return;
      if (b <= a) b += 1440; // trece de miezul nopții
      out.push({ a: a, b: b });
    });
    out.sort(function (x, y) { return x.a - y.a; });
    return { intervale: out, exceptie: exc };
  }

  /* stareDeschis(program, cheieUnitate, now) →
       null                                   dacă programul lipsește / e invalid
       { stare: 'deschis', pana_la: 'HH:MM', minute_ramase: n, mesaj, detaliu, exceptie }
       { stare: 'inchis', deschide: { data, ora, cand: 'azi'|'maine'|'<zi>' } | null, mesaj, detaliu, exceptie } */
  function stareDeschis(program, cheieUnitate, now) {
    try {
      if (!program || !program.unitati) return null;
      var unitate = program.unitati[cheieUnitate || 'gastro-pub'];
      if (!unitate || !unitate.orar) return null;
      var t = acumLocal(now, program.fus_orar);
      var azi = { data: t.data, zi: t.zi };
      var ieri = dataPlus(t.data, -1);
      var zAzi = intervaleZi(unitate, program.exceptii, cheieUnitate, azi);
      var zIeri = intervaleZi(unitate, program.exceptii, cheieUnitate, ieri);
      var m = t.minute, deschisPana = null, i;

      for (i = 0; i < zIeri.intervale.length; i++) { // program de aseară care continuă după miezul nopții
        var iv0 = zIeri.intervale[i];
        if (iv0.b > 1440 && m < iv0.b - 1440) deschisPana = iv0.b - 1440;
      }
      for (i = 0; i < zAzi.intervale.length && deschisPana === null; i++) {
        var iv = zAzi.intervale[i];
        if (m >= iv.a && m < iv.b) deschisPana = iv.b;
      }

      if (deschisPana !== null) {
        var ramase = deschisPana - m;
        var r = { stare: 'deschis', pana_la: hhmm(deschisPana), minute_ramase: ramase, exceptie: zAzi.exceptie };
        if (ramase <= 60) { r.mesaj = T().seInchide(ramase); r.detaliu = T().laOra(r.pana_la); }
        else { r.mesaj = T().deschis; r.detaliu = T().panaLa(r.pana_la); }
        return r;
      }

      // închis: căutăm următoarea deschidere, azi (după ora curentă) sau în următoarele 7 zile
      var urm = null;
      for (i = 0; i < zAzi.intervale.length; i++) if (zAzi.intervale[i].a > m) { urm = { data: azi.data, ora: hhmm(zAzi.intervale[i].a), cand: 'azi' }; break; }
      for (var d = 1; d <= 7 && !urm; d++) {
        var zi = dataPlus(t.data, d);
        var z = intervaleZi(unitate, program.exceptii, cheieUnitate, zi);
        if (z.intervale.length) urm = { data: zi.data, ora: hhmm(z.intervale[0].a), cand: d === 1 ? 'mâine' : TEXTE.ro.zile[ZILE[zi.zi]].toLowerCase(), zi: d === 1 ? 'maine' : ZILE[zi.zi] };
      }
      var res = { stare: 'inchis', deschide: urm, exceptie: zAzi.exceptie, mesaj: T().inchisMare };
      if (zAzi.exceptie && zAzi.exceptie.inchis && zAzi.exceptie.motiv) res.mesaj = T().inchisAzi;
      if (urm) res.detaliu = urm.cand === 'azi' ? T().deschideAzi(urm.ora) : urm.zi === 'maine' ? T().deschideMaine(urm.ora) : T().deschideZi(T().zile[urm.zi], urm.ora);
      else res.detaliu = '';
      if (zAzi.exceptie && zAzi.exceptie.inchis && zAzi.exceptie.motiv) res.detaliu = '(' + zAzi.exceptie.motiv + ')' + (res.detaliu ? ' · ' + res.detaliu : '');
      return res;
    } catch (e) { return null; }
  }

  // ---- randare ----
  function text(el, s) { el.textContent = s; }

  function randeazaDeschisAcum(el, program, now) {
    var s = stareDeschis(program, el.getAttribute('data-deschis-acum') || 'gastro-pub', now);
    if (!s) { el.hidden = true; return; }
    el.className = 'deschis-acum ' + (s.stare === 'deschis' ? (s.minute_ramase <= 60 ? 'se-inchide' : 'este-deschis') : 'este-inchis');
    el.innerHTML = '';
    el.appendChild(document.createTextNode(s.mesaj));
    if (s.detaliu) {
      el.appendChild(document.createTextNode(' '));
      var d = document.createElement('span'); d.className = 'detaliu'; text(d, s.detaliu); el.appendChild(d);
    }
    var unit = program.unitati && program.unitati[el.getAttribute('data-deschis-acum') || 'gastro-pub'];
    if (program._exemplu || (unit && unit._exemplu)) el.title = T().orientativTitlu;
    el.hidden = false;
  }

  function randeazaProgram(el, program, now) {
    try {
      var cheie = el.getAttribute('data-program-lista') || 'gastro-pub';
      var u = program && program.unitati && program.unitati[cheie];
      if (!u || !u.orar) return; // rămâne fallback-ul din HTML
      var t = acumLocal(now, program.fus_orar);
      var tabel = document.createElement('table'); tabel.className = 'program-tabel';
      var tb = document.createElement('tbody');
      ORDINE.forEach(function (zi) {
        var tr = document.createElement('tr');
        var iv = u.orar[zi] || [];
        if (ZILE[t.zi] === zi) tr.className = 'azi';
        if (!iv.length) tr.className += ' inchis';
        var td1 = document.createElement('td'); text(td1, T().zile[zi]);
        var td2 = document.createElement('td');
        text(td2, iv.length ? iv.map(function (x) { return x[0] + '–' + x[1]; }).join(', ') : T().inchis);
        tr.appendChild(td1); tr.appendChild(td2); tb.appendChild(tr);
      });
      tabel.appendChild(tb);
      el.innerHTML = '';
      el.appendChild(tabel);
      // excepții în următoarele 45 de zile
      var exc = (program.exceptii || []).filter(function (e) {
        if (!e || !e.data || (e.unitate && e.unitate !== cheie)) return false;
        var dz = (new Date(e.data + 'T00:00:00Z') - new Date(t.data + 'T00:00:00Z')) / 864e5;
        return dz >= 0 && dz <= 45;
      });
      if (exc.length) {
        var ul = document.createElement('ul'); ul.className = 'program-exceptii';
        exc.forEach(function (e) {
          var li = document.createElement('li');
          var p = e.data.split('-');
          text(li, p[2] + '.' + p[1] + ': ' + (e.inchis ? T().inchis : (e.orar || []).map(function (x) { return x[0] + '–' + x[1]; }).join(', ')) + (e.motiv ? ' (' + e.motiv + ')' : ''));
          ul.appendChild(li);
        });
        el.appendChild(ul);
      }
      if (program._exemplu || u._exemplu) {
        var n = document.createElement('p'); n.className = 'program-nota';
        text(n, T().orientativ);
        el.appendChild(n);
      } else if (typeof u.nota === 'string' && u.nota.trim()) {
        var n2 = document.createElement('p'); n2.className = 'program-nota';
        text(n2, u.nota.trim());
        el.appendChild(n2);
      }
    } catch (e) { /* rămâne fallback-ul */ }
  }


  // =====================================================================
  // 3. Meniul zilei (M1) — data/meniu-zilei.json
  // =====================================================================
  var LUNI_RO = TEXTE.ro.luni; // folosit și de celelalte componente (calendar, catering, evenimente), care rămân în română

  function dataLunga(iso) { // '2026-10-20' → 'marți, 20 octombrie' (în limba paginii)
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!p) return iso || '';
    var d = new Date(Date.UTC(+p[1], +p[2] - 1, +p[3]));
    return T().dataLunga(T().zile[ZILE[d.getUTCDay()]], +p[3], T().luni[+p[2] - 1]);
  }
  function dataScurta(iso) { // '2026-10-20' → '20 octombrie' (în limba paginii)
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return p ? T().dataScurta(+p[3], T().luni[+p[2] - 1]) : (iso || '');
  }
  function oraLocala(isoCuOffset, fus) { // '2026-10-19T11:04:00+03:00' → 'HH:MM' în fusul restaurantului, sau ''
    var t = Date.parse(isoCuOffset || '');
    if (isNaN(t)) return '';
    try {
      return new Intl.DateTimeFormat('ro-RO', { timeZone: fus || 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
    } catch (e) { var d = new Date(t); return hhmm(d.getHours() * 60 + d.getMinutes()); }
  }

  /* stareMeniu(json, now, optiuni) →
       { stare: 'azi' | 'maine' | 'incheiat' | 'vechi' | 'lipsa', meniu, azi, maine }
     'azi'      — meniul este pentru ziua de azi și valabil_pana nu a trecut → se afișează
     'maine'    — meniul este pentru mâine (textul vine seara) → se afișează marcat „pentru mâine"
     'incheiat' — meniul de azi, dar valabil_pana a trecut → fallback + notă „s-a încheiat"
     'vechi'    — alte date → fallback
     'lipsa'    — JSON lipsă / invalid / fără preparate → fallback
     optiuni.previzualizare: true → un JSON marcat _exemplu se tratează ca fiind de azi (doar pentru preview) */
  function stareMeniu(json, now, optiuni) {
    try {
      optiuni = optiuni || {};
      var t = acumLocal(now, (json && json.fus_orar) || 'Europe/Bucharest');
      var maine = dataPlus(t.data, 1).data;
      if (!json || typeof json !== 'object' || !Array.isArray(json.preparate)) return { stare: 'lipsa', azi: t.data, maine: maine };
      var preparate = json.preparate.filter(function (p) { return p && typeof p.nume === 'string' && p.nume.trim(); });
      if (!preparate.length) return { stare: 'lipsa', azi: t.data, maine: maine };
      var meniu = {
        data: json.data, pret: json.pret, moneda: json.moneda || 'lei', preparate: preparate,
        poze: Array.isArray(json.poze) ? json.poze.filter(function (x) { return typeof x === 'string' && x; }) : [],
        actualizat: json.actualizat, traduceri: json.traduceri && typeof json.traduceri === 'object' ? json.traduceri : null,
        exemplu: !!json._exemplu
      };
      var valabil = Date.parse(json.valabil_pana || '');
      var expirat = !isNaN(valabil) && (now || new Date()).getTime() >= valabil;
      if (optiuni.previzualizare && json._exemplu) return { stare: 'azi', meniu: meniu, azi: t.data, maine: maine, previzualizare: true };
      if (json.data === t.data) return { stare: expirat ? 'incheiat' : 'azi', meniu: meniu, azi: t.data, maine: maine };
      if (json.data === maine) return { stare: 'maine', meniu: meniu, azi: t.data, maine: maine };
      return { stare: 'vechi', meniu: meniu, azi: t.data, maine: maine };
    } catch (e) { return { stare: 'lipsa' }; }
  }

  // textul precompletat pentru WhatsApp: „Bună! Vreau N × meniul zilei de azi, 20 octombrie."
  function textWhatsApp(n, stare, dataIso) {
    n = Math.max(1, Math.min(99, parseInt(n, 10) || 1));
    return T().whatsapp(n, stare === 'maine', dataScurta(dataIso));
  }

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function randeazaMeniuZilei(container, json, now, optiuni) {
    var fallback = container.querySelector('[data-meniu-zilei-fallback]');
    var vechi = container.querySelector('.meniu-zilei'); if (vechi) vechi.parentNode.removeChild(vechi);
    var nota = container.querySelector('.meniu-zilei-incheiat'); if (nota) nota.parentNode.removeChild(nota);
    var s = stareMeniu(json, now, optiuni);
    container.setAttribute('data-stare', s.stare);
    if (s.stare !== 'azi' && s.stare !== 'maine') {
      if (fallback) fallback.hidden = false;
      if (s.stare === 'incheiat' && fallback) {
        var n = el('p', 'mic mut meniu-zilei-incheiat', T().incheiat);
        container.insertBefore(n, fallback);
      }
      return s;
    }
    var m = s.meniu, whatsapp = container.getAttribute('data-whatsapp') || '';
    var card = el('article', 'meniu-zilei' + (s.stare === 'maine' ? ' pentru-maine' : ''));
    card.setAttribute('aria-live', 'polite');

    // antet: data + preț
    var cap = el('header', 'meniu-zilei-cap');
    var titlu = el('div', 'meniu-zilei-data');
    titlu.appendChild(el('span', 'meniu-zilei-cand', s.stare === 'maine' ? T().maine : T().azi));
    titlu.appendChild(document.createTextNode(' ' + dataLunga(m.data)));
    cap.appendChild(titlu);
    if (typeof m.pret === 'number' && m.pret > 0) {
      var pret = el('div', 'meniu-zilei-pret');
      pret.appendChild(el('b', null, String(m.pret)));
      pret.appendChild(document.createTextNode(' ' + m.moneda));
      cap.appendChild(pret);
    }
    card.appendChild(cap);

    // poze (se ascund individual dacă nu se încarcă)
    if (m.poze.length) {
      var galerie = el('div', 'meniu-zilei-poze poze-' + Math.min(m.poze.length, 3));
      m.poze.slice(0, 3).forEach(function (src, i) {
        var fig = el('figure');
        var img = document.createElement('img');
        img.src = cale(src); img.loading = 'lazy'; img.decoding = 'async';
        img.alt = T().pozaAlt + dataScurta(m.data) + (m.poze.length > 1 ? ' (' + (i + 1) + ')' : '');
        img.addEventListener('error', function () {
          if (fig.parentNode) fig.parentNode.removeChild(fig);
          if (!galerie.children.length && galerie.parentNode) galerie.parentNode.removeChild(galerie);
        });
        fig.appendChild(img); galerie.appendChild(fig);
      });
      card.appendChild(galerie);
    }

    // preparate + alergeni (+ traduceri EN/BG dacă există)
    var lista = el('ol', 'meniu-zilei-lista');
    m.preparate.forEach(function (p, i) {
      var li = el('li');
      var cat = typeof p.categorie === 'string' ? p.categorie.trim().toLowerCase() : '';
      if (cat) li.appendChild(el('span', 'meniu-zilei-cat', T().categorii[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1))));
      var nume = el('span', 'meniu-zilei-nume', p.nume.trim());
      nume.setAttribute('data-ro', p.nume.trim());
      ['en', 'bg'].forEach(function (l) {
        var tr = m.traduceri && m.traduceri[l] && Array.isArray(m.traduceri[l].preparate) ? m.traduceri[l].preparate[i] : null;
        if (typeof tr === 'string' && tr.trim()) nume.setAttribute('data-' + l, tr.trim());
      });
      if (LIMBA !== 'ro' && !nume.getAttribute('data-' + LIMBA)) nume.setAttribute('lang', 'ro'); // fără traducere: numele rămâne în română, marcat ca atare
      li.appendChild(nume);
      var al = Array.isArray(p.alergeni) ? p.alergeni.filter(function (a) { return typeof a === 'string' && a.trim(); }) : [];
      if (al.length) {
        var a = el('span', 'meniu-zilei-alergeni');
        a.appendChild(el('span', 'vizual-ascuns', T().alergeni + ': '));
        a.appendChild(document.createTextNode(al.join(', ')));
        a.title = T().alergeni;
        li.appendChild(a);
      }
      lista.appendChild(li);
    });
    card.appendChild(lista);

    // comutator de limbă (doar dacă există cel puțin o traducere completă)
    var limbi = ['en', 'bg'].filter(function (l) {
      return m.traduceri && m.traduceri[l] && Array.isArray(m.traduceri[l].preparate) &&
        m.preparate.every(function (_, i) { return typeof m.traduceri[l].preparate[i] === 'string' && m.traduceri[l].preparate[i].trim(); });
    });
    var limbaInitiala = limbi.indexOf(LIMBA) >= 0 ? LIMBA : 'ro'; // pe paginile EN/BG lista pornește tradusă, dacă traducerea există
    function arataLimba(l) {
      lista.querySelectorAll('.meniu-zilei-nume').forEach(function (n) { n.textContent = n.getAttribute('data-' + l) || n.getAttribute('data-ro'); });
      lista.setAttribute('lang', l);
    }
    if (limbi.length) {
      var com = el('div', 'meniu-zilei-limbi');
      com.setAttribute('role', 'group'); com.setAttribute('aria-label', T().limba);
      ['ro'].concat(limbi).forEach(function (l) {
        var b = el('button', 'meniu-zilei-limba' + (l === limbaInitiala ? ' activ' : ''), l.toUpperCase());
        b.type = 'button'; b.setAttribute('aria-pressed', l === limbaInitiala ? 'true' : 'false');
        b.addEventListener('click', function () {
          arataLimba(l);
          com.querySelectorAll('button').forEach(function (x) { var on = x === b; x.classList.toggle('activ', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        });
        com.appendChild(b);
      });
      card.appendChild(com);
      if (limbaInitiala !== 'ro') arataLimba(limbaInitiala);
    } else if (LIMBA !== 'ro') lista.setAttribute('lang', 'ro'); // fără traduceri: preparatele rămân în română

    // comandă pe WhatsApp: cantitate + buton cu text precompletat
    if (whatsapp) {
      var com2 = el('div', 'meniu-zilei-comanda');
      var cant = el('div', 'meniu-zilei-cantitate');
      var minus = el('button', null, '−'); minus.type = 'button'; minus.setAttribute('aria-label', T().maiPutine);
      var inp = document.createElement('input'); inp.type = 'number'; inp.min = '1'; inp.max = '99'; inp.value = '1'; inp.inputMode = 'numeric';
      inp.setAttribute('aria-label', T().nrPortii);
      var plus = el('button', null, '+'); plus.type = 'button'; plus.setAttribute('aria-label', T().maiMulte);
      cant.appendChild(minus); cant.appendChild(inp); cant.appendChild(plus);
      var btn = el('a', 'buton buton-whatsapp');
      btn.target = '_blank'; btn.rel = 'noopener';
      function actualizeaza() {
        var n = Math.max(1, Math.min(99, parseInt(inp.value, 10) || 1));
        inp.value = String(n);
        btn.href = 'https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(textWhatsApp(n, s.stare, m.data));
        btn.textContent = T().comanda + (n > 1 ? ' (' + n + ' ' + T().portii + ')' : '');
      }
      minus.addEventListener('click', function () { inp.value = String((parseInt(inp.value, 10) || 1) - 1); actualizeaza(); });
      plus.addEventListener('click', function () { inp.value = String((parseInt(inp.value, 10) || 1) + 1); actualizeaza(); });
      inp.addEventListener('input', actualizeaza); inp.addEventListener('change', actualizeaza);
      actualizeaza();
      com2.appendChild(cant); com2.appendChild(btn);
      card.appendChild(com2);
    }

    // subsol: ora actualizării + alergeni + previzualizare
    var sub = el('footer', 'meniu-zilei-sub');
    var ora = oraLocala(m.actualizat, json && json.fus_orar);
    var parti = [];
    if (ora) parti.push(T().actualizatLa + ora);
    parti.push(s.stare === 'maine' ? T().serviMaine : T().laNoi);
    sub.appendChild(el('span', null, parti.join(' · ') + ' · '));
    var la = el('a', null, T().alergeniLink); la.href = cale('alergeni.html'); if (LIMBA !== 'ro') la.setAttribute('hreflang', 'ro'); sub.appendChild(la);
    if (s.previzualizare) sub.appendChild(el('span', 'todo', T().previzualizare + ' (' + dataScurta(m.data) + ')'));
    card.appendChild(sub);

    if (fallback) fallback.hidden = true;
    container.appendChild(card);
    return s;
  }

  // =====================================================================
  // 4. Sala de bal (M2) — calendar din data/sala-disponibilitate.json + formular de cerere de ofertă
  // =====================================================================
  var PRAG_DISPONIBILITATE_ZILE = 7; // peste 7 zile de la `actualizat` calendarul nu se mai afișează (contractul din PLAN.md)
  var LUNI_CALENDAR = 12;            // luna curentă + 11

  function ziValida(iso) { return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !isNaN(Date.parse(iso + 'T00:00:00Z')); }

  /* stareDisponibilitate(json, now, optiuni) →
       { stare: 'ok' | 'vechi' | 'lipsa', azi, zile: { 'YYYY-MM-DD': { stare: 'ocupat'|'partial', nota } }, actualizat, exemplu }
     'ok'    — `actualizat` este în ultimele 7 zile → calendarul se afișează
     'vechi' — mai vechi → calendarul se ascunde (rămâne formularul)
     'lipsa' — JSON lipsă / invalid
     optiuni.previzualizare: un JSON marcat _exemplu se tratează ca proaspăt (doar pentru preview) */
  function stareDisponibilitate(json, now, optiuni) {
    try {
      optiuni = optiuni || {};
      now = now || new Date();
      var t = acumLocal(now, (json && json.fus_orar) || 'Europe/Bucharest');
      if (!json || typeof json !== 'object' || (!Array.isArray(json.ocupat) && !Array.isArray(json.partial))) return { stare: 'lipsa', azi: t.data };
      var zile = {};
      (Array.isArray(json.ocupat) ? json.ocupat : []).forEach(function (d) { if (ziValida(d)) zile[d] = { stare: 'ocupat' }; });
      (Array.isArray(json.partial) ? json.partial : []).forEach(function (p) {
        if (!p) return;
        var d = typeof p === 'string' ? p : p.data;
        if (ziValida(d) && !zile[d]) zile[d] = { stare: 'partial', nota: typeof p.nota === 'string' ? p.nota : '' };
      });
      var act = Date.parse(json.actualizat || '');
      var vechime = isNaN(act) ? Infinity : (now.getTime() - act) / 864e5;
      var proaspat = vechime >= -1 && vechime <= PRAG_DISPONIBILITATE_ZILE;
      if (!proaspat && !(optiuni.previzualizare && json._exemplu)) return { stare: 'vechi', azi: t.data, zile: zile, actualizat: json.actualizat };
      return { stare: 'ok', azi: t.data, zile: zile, actualizat: json.actualizat, exemplu: !!json._exemplu, previzualizare: !proaspat };
    } catch (e) { return { stare: 'lipsa' }; }
  }

  // lunile afișate: [{ an, luna (1–12), cheie 'YYYY-MM', titlu 'Noiembrie 2026', zile: n, primaZi: 0=luni…6=duminică }]
  function luniCalendar(aziIso, cate) {
    var p = /^(\d{4})-(\d{2})/.exec(aziIso || '');
    if (!p) return [];
    var out = [], an = +p[1], luna = +p[2];
    for (var i = 0; i < (cate || LUNI_CALENDAR); i++) {
      var d = new Date(Date.UTC(an, luna - 1 + i, 1));
      var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
      var nume = LUNI_RO[m - 1];
      out.push({ an: y, luna: m, cheie: y + '-' + (m < 10 ? '0' : '') + m, titlu: nume.charAt(0).toUpperCase() + nume.slice(1) + ' ' + y,
        zile: new Date(Date.UTC(y, m, 0)).getUTCDate(), primaZi: (d.getUTCDay() + 6) % 7 });
    }
    return out;
  }

  function randeazaCalendar(sectiune, json, now, optiuni) {
    var s = stareDisponibilitate(json, now, optiuni);
    sectiune.setAttribute('data-stare', s.stare);
    if (s.stare !== 'ok') { sectiune.hidden = true; return s; }
    var titlu = sectiune.querySelector('[data-calendar-titlu]'), grila = sectiune.querySelector('[data-calendar-grila]');
    var inapoi = sectiune.querySelector('[data-calendar-inapoi]'), inainte = sectiune.querySelector('[data-calendar-inainte]');
    var nota = sectiune.querySelector('[data-calendar-nota]');
    var campData = document.querySelector('[data-cerere] [name="data_eveniment"]');
    if (!titlu || !grila) { sectiune.hidden = true; return s; }
    var luni = luniCalendar(s.azi), idx = 0;
    var ZILE_SCURT = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];

    function deseneaza() {
      var L = luni[idx];
      text(titlu, L.titlu);
      inapoi.disabled = idx === 0; inainte.disabled = idx === luni.length - 1;
      grila.innerHTML = '';
      ZILE_SCURT.forEach(function (z) { var h = el('div', 'calendar-cap', z); h.setAttribute('aria-hidden', 'true'); grila.appendChild(h); }); // abrevierile zilelor sunt doar vizuale; butoanele au data completă în aria-label
      for (var g = 0; g < L.primaZi; g++) grila.appendChild(el('div', 'calendar-gol'));
      for (var zi = 1; zi <= L.zile; zi++) {
        var iso = L.cheie + '-' + (zi < 10 ? '0' : '') + zi;
        var info = s.zile[iso], trecut = iso < s.azi, azi = iso === s.azi;
        var cls = 'zi ' + (trecut ? 'zi-trecut' : info ? 'zi-' + info.stare : 'zi-liber') + (azi ? ' zi-azi' : '');
        var b;
        if (trecut) { b = el('div', cls, String(zi)); b.setAttribute('aria-hidden', 'true'); }
        else {
          b = el('button', cls, String(zi)); b.type = 'button';
          b.setAttribute('data-zi', iso);
          b.setAttribute('aria-label', zi + ' ' + LUNI_RO[L.luna - 1] + ' ' + L.an + ': ' + (info ? (info.stare === 'ocupat' ? 'ocupat' : 'parțial ocupat' + (info.nota ? ' (' + info.nota + ')' : '')) : 'liber'));
          if (info && info.nota) b.title = info.nota;
          if (campData && campData.value === iso) b.classList.add('zi-aleasa');
        }
        grila.appendChild(b);
      }
    }
    grila.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-zi]') : null;
      if (!b || !campData) return;
      campData.value = b.getAttribute('data-zi');
      grila.querySelectorAll('.zi-aleasa').forEach(function (x) { x.classList.remove('zi-aleasa'); });
      b.classList.add('zi-aleasa');
      if (typeof Event === 'function') campData.dispatchEvent(new Event('change', { bubbles: true }));
      var cerere = document.getElementById('cerere');
      if (cerere && cerere.scrollIntoView) cerere.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    inapoi.addEventListener('click', function () { if (idx > 0) { idx--; deseneaza(); } });
    inainte.addEventListener('click', function () { if (idx < luni.length - 1) { idx++; deseneaza(); } });
    if (campData) campData.addEventListener('change', function () { deseneaza(); });
    deseneaza();
    if (nota) {
      var parti = ['Disponibilitatea este orientativă; data se confirmă telefonic.'];
      var ora = oraLocala(s.actualizat, json && json.fus_orar);
      if (ora) parti.push('Actualizat la ' + ora + ', ' + dataScurta(String(s.actualizat).slice(0, 10)));
      text(nota, parti.join(' · '));
      if (s.previzualizare) nota.appendChild(el('span', 'todo', ' previzualizare cu date de exemplu'));
    }
    sectiune.hidden = false;
    return s;
  }

  // ---- formularul de cerere de ofertă ----
  var TIPURI_EVENIMENT = { nunta: 'Nuntă / cununie', botez: 'Botez / cumetrie', aniversare: 'Aniversare / majorat', 'masa-festiva': 'Masă festivă', firma: 'Petrecere de firmă / conferință', pomana: 'Pomană / parastas', altul: 'Altceva' };
  // M3: tipurile de comandă de catering (aceleași chei ca în n8n/cod/valideaza-cerere.js)
  var TIPURI_CATERING = { eveniment: 'Catering pentru eveniment', pomana: 'Pachete pentru pomană / parastas', 'pranz-birou': 'Prânz la birou' };
  var LIVRARE = { adresa: 'Livrare la adresă', ridicare: 'Ridicare de la restaurant' };
  var SALI = { 'sala-de-bal': 'Sala de bal OK (Str. Traian nr. 2)', 'sala-vidin': 'Sala Vidin (la restaurant)' };

  function telefonValid(t) { var d = String(t || '').replace(/[\s.\-()]/g, ''); return /^(\+40|0040|0)?[237]\d{8}$/.test(d); }
  function emailValid(e) { return !e || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
  function oraValida(o) { return !o || /^([01]\d|2[0-3]):[0-5]\d$/.test(o); }

  /* validareCerere(valori, aziIso, tip) → { ok, erori: { camp: mesaj } } — aceleași reguli ca în n8n/cod/valideaza-cerere.js
     tip: 'sala' (implicit, M2) | 'catering' (M3) */
  function validareCerere(v, aziIso, tip) {
    var e = {};
    v = v || {}; tip = tip || 'sala';
    var catering = tip === 'catering';
    if (catering) {
      if (!TIPURI_CATERING[v.tip_comanda]) e.tip_comanda = 'Alege ce vrei să comanzi.';
      if (v.livrare !== 'ridicare' && (!v.adresa || String(v.adresa).trim().length < 5)) e.adresa = 'Scrie adresa unde livrăm (sau alege ridicarea de la restaurant).';
      if (!oraValida(String(v.ora || '').trim())) e.ora = 'Ora nu pare corectă (ex. 12:30).';
    } else if (tip === 'tort') {
      if (!v.tort || !String(v.tort).trim()) e.tort = 'Alege un tort din listă (sau „personalizat", cu poză).';
    } else if (!v.tip_eveniment) e.tip_eveniment = 'Alege tipul evenimentului.';
    if (!ziValida(v.data_eveniment)) e.data_eveniment = catering ? 'Scrie data la care livrăm.' : tip === 'tort' ? 'Scrie data pentru care vrei tortul.' : 'Scrie data evenimentului.';
    else if (aziIso && v.data_eveniment < aziIso) e.data_eveniment = 'Data a trecut deja. Alege o zi de azi încolo.';
    var n = parseInt(v.persoane, 10);
    if (!(n >= 1 && n <= 999)) e.persoane = catering && v.tip_comanda === 'pranz-birou' ? 'Scrie câte porții pe zi.' : catering && v.tip_comanda === 'pomana' ? 'Scrie numărul de pachete.' : tip === 'tort' ? 'Scrie pentru câte persoane e tortul.' : 'Scrie numărul aproximativ de persoane.';
    if (!v.nume || String(v.nume).trim().length < 2) e.nume = 'Scrie numele tău.';
    if (!telefonValid(v.telefon)) e.telefon = 'Scrie un număr de telefon la care te putem suna (ex. 0722 123 456).';
    if (!emailValid(String(v.email || '').trim())) e.email = 'Adresa de email nu pare corectă.';
    if (!v.consimtamant) e.consimtamant = 'Avem nevoie de acordul tău ca să te putem contacta.';
    return { ok: !Object.keys(e).length, erori: e };
  }

  // payload-ul din PLAN.md: { tip, nume, telefon, email, data_eveniment, persoane, mesaj, detalii, consimtamant, website }
  // extra.poza (doar tort): { nume, tip, marime, base64, latime, inaltime } — poza-model redimensionată în browser (vezi pregatestePoza)
  function payloadCerere(tip, v, extra) {
    var detalii;
    extra = extra || {};
    if (tip === 'tort') {
      var tortId = String(v.tort || '').trim();
      detalii = { tort: tortId, tort_text: (TORTURI_CATALOG[tortId] || (tortId === 'personalizat' ? 'Tort personalizat, după model' : tortId)),
        poza_model: extra.poza && extra.poza.base64 ? { nume: extra.poza.nume, tip: extra.poza.tip, marime: extra.poza.marime, latime: extra.poza.latime, inaltime: extra.poza.inaltime, base64: extra.poza.base64 } : null };
    } else if (tip === 'catering') {
      var livrare = v.livrare === 'ridicare' ? 'ridicare' : 'adresa';
      detalii = { tip_comanda: v.tip_comanda || '', tip_comanda_text: TIPURI_CATERING[v.tip_comanda] || v.tip_comanda || '',
        livrare: livrare, livrare_text: LIVRARE[livrare], adresa: livrare === 'adresa' ? String(v.adresa || '').trim() : '', ora: String(v.ora || '').trim() };
    } else detalii = { tip_eveniment: v.tip_eveniment || '', tip_eveniment_text: TIPURI_EVENIMENT[v.tip_eveniment] || v.tip_eveniment || '',
      sala: SALI[v.sala] ? v.sala : '', sala_text: SALI[v.sala] || '' };
    return {
      tip: tip, nume: String(v.nume || '').trim(), telefon: String(v.telefon || '').trim(), email: String(v.email || '').trim(),
      data_eveniment: v.data_eveniment || '', persoane: parseInt(v.persoane, 10) || 0, mesaj: String(v.mesaj || '').trim(),
      detalii: detalii, consimtamant: !!v.consimtamant, website: String(v.website || ''), pagina: typeof location !== 'undefined' ? location.pathname : ''
    };
  }

  function textWhatsAppCerere(p) {
    var d = p.detalii || {}, r;
    if (p.tip === 'tort') {
      r = ['Bună! Aș vrea să comand un tort de la Cofetăria OK.'];
      if (d.tort_text) r.push('Tort: ' + d.tort_text);
      if (p.data_eveniment) r.push('Pentru: ' + dataLunga(p.data_eveniment));
      if (p.persoane) r.push('Persoane: ' + p.persoane);
      if (d.poza_model) r.push('Poza cu modelul o trimit aici, în chat.');
    } else if (p.tip === 'catering') {
      r = ['Bună! Aș vrea să comand catering de la Restaurant OK.'];
      if (d.tip_comanda_text) r.push('Comandă: ' + d.tip_comanda_text);
      if (p.data_eveniment) r.push((d.tip_comanda === 'pranz-birou' ? 'De la: ' : 'Data: ') + dataLunga(p.data_eveniment) + (d.ora ? ', ora ' + d.ora : ''));
      if (p.persoane) r.push((d.tip_comanda === 'pranz-birou' ? 'Porții pe zi: ' : d.tip_comanda === 'pomana' ? 'Pachete: ' : 'Persoane: ') + p.persoane);
      if (d.livrare === 'ridicare') r.push('Ridic eu de la restaurant.');
      else if (d.adresa) r.push('Livrare la: ' + d.adresa);
    } else {
      r = ['Bună! Aș vrea o ofertă pentru Sala de bal OK.'];
      if (d.tip_eveniment_text) r.push('Eveniment: ' + d.tip_eveniment_text);
      if (d.sala_text) r.push('Spațiul: ' + d.sala_text);
      if (p.data_eveniment) r.push('Data: ' + dataLunga(p.data_eveniment));
      if (p.persoane) r.push('Persoane: ' + p.persoane);
    }
    if (p.nume) r.push('Nume: ' + p.nume);
    if (p.mesaj) r.push('Detalii: ' + p.mesaj);
    return r.join('\n');
  }

  // textul confirmării din pagină, după tip
  function textConfirmare(p) {
    var d = p.detalii || {}, nume = p.nume.split(/\s+/)[0];
    var contact = 'Te sunăm la ' + p.telefon + (p.email ? ' sau îți scriem la ' + p.email : '');
    if (p.tip === 'tort') {
      return contact + ' ca să confirmăm ' + (d.tort_text ? d.tort_text.toLowerCase() : 'tortul') + ' pentru ' + dataLunga(p.data_eveniment) + ', ' + p.persoane + ' persoane' + (d.poza_model ? ', după modelul din poza trimisă' : '') + '. Mulțumim, ' + nume + '!';
    }
    if (p.tip === 'catering') {
      var ce = d.tip_comanda === 'pranz-birou' ? 'prânzul la birou de ' + dataLunga(p.data_eveniment) + ' încolo, ' + p.persoane + ' porții pe zi'
        : d.tip_comanda === 'pomana' ? 'pachetele de pomană din ' + dataLunga(p.data_eveniment) + ', ' + p.persoane + ' pachete'
        : 'cateringul din ' + dataLunga(p.data_eveniment) + ', ' + p.persoane + ' persoane';
      return contact + ' ca să confirmăm ' + ce + (d.livrare === 'ridicare' ? ', ridicare de la restaurant' : d.adresa ? ', livrare la ' + d.adresa : '') + '. Mulțumim, ' + nume + '!';
    }
    return contact + ' cu o ofertă pentru ' + (d.tip_eveniment_text || 'eveniment').toLowerCase() + ' din ' + dataLunga(p.data_eveniment) + ', ' + p.persoane + ' persoane. Mulțumim, ' + nume + '!';
  }

  function valoriFormular(form) {
    var v = {};
    Array.prototype.forEach.call(form.elements, function (c) {
      if (!c.name || c.type === 'file') return;
      v[c.name] = c.type === 'checkbox' ? c.checked : c.value;
    });
    return v;
  }

  function initCerere(form) {
    var tip = form.getAttribute('data-cerere') || 'sala';
    var meta = function (n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute('content') : ''; };
    var url = form.getAttribute('action') || meta('ok-webhook'), token = meta('ok-webhook-token'), whatsapp = meta('ok-whatsapp');
    var eroare = form.querySelector('[data-eroare]'), trimite = form.querySelector('[data-trimite]');
    var confirmare = form.parentNode.querySelector('[data-confirmare]'), rezerva = form.parentNode.querySelector('[data-rezerva]');
    var waCerere = form.querySelector('[data-whatsapp-cerere]');
    var campData = form.querySelector('[name="data_eveniment"]'), ajutorData = form.querySelector('[data-data-ajutor]');
    var azi = acumLocal(new Date()).data;
    if (campData) campData.min = azi;

    function butonWhatsApp(a, p) { if (a && whatsapp) a.href = 'https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(textWhatsAppCerere(p)); }
    function actualizeazaWhatsApp() { butonWhatsApp(waCerere, payloadCerere(tip, valoriFormular(form), { poza: form._pozaModel })); }
    form.addEventListener('input', actualizeazaWhatsApp); form.addEventListener('change', actualizeazaWhatsApp);
    actualizeazaWhatsApp();

    // M3 (catering): etichetele se schimbă după tipul comenzii; adresa se ascunde la ridicarea de la restaurant;
    // butoanele „Cere ofertă" din carduri (data-alege-tip) preselectează tipul
    var tipComanda = form.querySelector('[name="tip_comanda"]'), livrare = form.querySelector('[name="livrare"]'), campAdresa = form.querySelector('[data-camp-adresa]');
    function etichete() {
      var t = tipComanda ? tipComanda.value : '';
      form.querySelectorAll('[data-eticheta-data], [data-eticheta-persoane]').forEach(function (l) {
        if (!l.hasAttribute('data-implicit')) l.setAttribute('data-implicit', l.textContent);
        text(l, (t && l.getAttribute('data-' + t)) || l.getAttribute('data-implicit'));
      });
      if (campAdresa && livrare) campAdresa.hidden = livrare.value === 'ridicare';
    }
    if (tipComanda) { tipComanda.addEventListener('change', etichete); etichete(); }
    if (livrare) livrare.addEventListener('change', etichete);
    if (tipComanda) document.addEventListener('click', function (e) { // delegat: butoanele pot apărea și după încărcarea JSON-ului (meniul săptămânii)
      var a = e.target.closest ? e.target.closest('[data-alege-tip]') : null;
      if (!a) return;
      tipComanda.value = a.getAttribute('data-alege-tip');
      if (typeof Event === 'function') tipComanda.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // M4 (tort): poza-model (≤ 5 MB) se citește și se redimensionează în browser, apoi pleacă în payload ca base64 (JPEG, max 1600 px)
    var campPoza = form.querySelector('[name="poza"]'), ajutorPoza = form.querySelector('[data-poza-ajutor]');
    var prevPoza = form.querySelector('[data-poza-previzualizare]'), imgPoza = form.querySelector('[data-poza-img]'), stergePoza = form.querySelector('[data-poza-sterge]');
    function arataPoza(p) {
      form._pozaModel = p || null;
      if (prevPoza) { prevPoza.hidden = !p; if (p && imgPoza) imgPoza.src = 'data:' + p.tip + ';base64,' + p.base64; }
      actualizeazaWhatsApp();
    }
    if (campPoza) {
      campPoza.addEventListener('change', function () {
        var f = campPoza.files && campPoza.files[0];
        if (ajutorPoza) ajutorPoza.hidden = true;
        if (!f) { arataPoza(null); return; }
        if (f.size > LIMITA_POZA) { if (ajutorPoza) { text(ajutorPoza, 'Poza are peste 5 MB. Alege una mai mică sau trimite-o pe WhatsApp.'); ajutorPoza.hidden = false; } campPoza.value = ''; arataPoza(null); return; }
        if (f.type && f.type.indexOf('image/') !== 0) { if (ajutorPoza) { text(ajutorPoza, 'Fișierul nu pare o poză (JPG, PNG, WEBP).'); ajutorPoza.hidden = false; } campPoza.value = ''; arataPoza(null); return; }
        pregatestePoza(f, function (p, eroare) {
          if (!p) { if (ajutorPoza) { text(ajutorPoza, eroare || 'Nu am putut citi poza. Trimite-o pe WhatsApp după ce dai comanda.'); ajutorPoza.hidden = false; } campPoza.value = ''; arataPoza(null); return; }
          arataPoza(p);
        });
      });
      if (stergePoza) stergePoza.addEventListener('click', function () { campPoza.value = ''; if (ajutorPoza) ajutorPoza.hidden = true; arataPoza(null); });
    }
    // M4 (tort): sub termenul minim de comandă nu blocăm, dar spunem pe loc
    if (tip === 'tort' && campData && ajutorData) campData.addEventListener('change', function () {
      var zile = TORTURI_TERMEN;
      var sel = form.querySelector('[name="tort"]'), t = sel && TORTURI_TERMENE[sel.value];
      if (t) zile = t;
      if (campData.value && zile && campData.value < dataPlus(azi, zile).data) { text(ajutorData, 'De obicei avem nevoie de ' + zile + ' zile pentru acest tort. Trimite oricum comanda: te sunăm și vedem ce se poate.'); ajutorData.hidden = false; }
      else ajutorData.hidden = true;
    });

    // ziua aleasă: dacă e ocupată în calendar, spunem pe loc (nu blocăm — sala poate avea mai multe săli)
    if (tip === 'sala' && campData && ajutorData) campData.addEventListener('change', function () {
      var b = document.querySelector('[data-calendar-grila] button[data-zi="' + campData.value + '"]');
      var ocupat = b && /zi-ocupat/.test(b.className), partial = b && /zi-partial/.test(b.className);
      if (ocupat) { text(ajutorData, 'În ziua aceasta sala mare este ocupată. Trimite oricum cererea: poate fi liberă o altă sală sau o altă oră.'); ajutorData.hidden = false; }
      else if (partial) { text(ajutorData, 'Ziua aceasta este parțial ocupată' + (b.title ? ' (' + b.title + ')' : '') + '. Scrie-ne ora dorită.'); ajutorData.hidden = false; }
      else ajutorData.hidden = true;
    });

    function arataErori(erori) {
      var chei = Object.keys(erori);
      form.querySelectorAll('.camp.invalid').forEach(function (c) { c.classList.remove('invalid'); });
      form.querySelectorAll('[aria-invalid]').forEach(function (c) { c.removeAttribute('aria-invalid'); });
      if (!chei.length) { eroare.hidden = true; return; }
      chei.forEach(function (k) {
        var c = form.querySelector('[name="' + k + '"]');
        if (c) { c.setAttribute('aria-invalid', 'true'); var camp = c.closest ? c.closest('.camp') : null; if (camp) camp.classList.add('invalid'); }
      });
      eroare.innerHTML = '';
      eroare.appendChild(el('b', null, chei.length === 1 ? 'Mai verifică un câmp:' : 'Mai verifică ' + chei.length + ' câmpuri:'));
      var ul = el('ul');
      chei.forEach(function (k) { ul.appendChild(el('li', null, erori[k])); });
      eroare.appendChild(ul);
      eroare.hidden = false;
      var primul = form.querySelector('[name="' + chei[0] + '"]');
      if (primul && primul.focus) primul.focus();
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = valoriFormular(form), r = validareCerere(v, azi, tip);
      if (!r.ok) { arataErori(r.erori); return; }
      arataErori({});
      var p = payloadCerere(tip, v, { poza: form._pozaModel });
      trimite.disabled = true; var textInitial = trimite.textContent; text(trimite, 'Se trimite…');
      var gata = false;
      function reuseste(raspuns) {
        form.hidden = true;
        text(confirmare.querySelector('[data-confirmare-text]'), textConfirmare(p));
        var idEl = confirmare.querySelector('[data-confirmare-id]');
        if (raspuns && raspuns.id) text(idEl, 'Numărul cererii: ' + raspuns.id); else idEl.hidden = true;
        confirmare.hidden = false; if (confirmare.focus) confirmare.focus();
      }
      function esueaza() {
        butonWhatsApp(rezerva.querySelector('[data-rezerva-whatsapp]'), p);
        form.hidden = true; rezerva.hidden = false; if (rezerva.focus) rezerva.focus();
        trimite.disabled = false; text(trimite, textInitial);
      }
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, 12000);
      var optiuni = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Site-Token': token || '' }, body: JSON.stringify(p) };
      if (controller) optiuni.signal = controller.signal;
      if (typeof fetch !== 'function' || !url) { esueaza(); return; }
      fetch(url, optiuni).then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json().catch(function () { return {}; });
      }).then(function (j) {
        if (j && j.ok === false) throw new Error(j.eroare || 'respins');
        gata = true; reuseste(j || {});
      }).catch(function () { clearTimeout(timer); if (!gata) esueaza(); });
    });
    var inapoi = rezerva && rezerva.querySelector('[data-rezerva-inapoi]');
    if (inapoi) inapoi.addEventListener('click', function () { rezerva.hidden = true; form.hidden = false; if (trimite.focus) trimite.focus(); });
  }

  // =====================================================================
  // 5. Catering (M3) — meniul săptămânii pentru prânzul la birou, din data/catering.json
  // =====================================================================
  var PRAG_CATERING_ZILE = 14; // peste 14 zile de la `actualizat` meniul săptămânii se ascunde (contractul din PLAN.md); ofertele rămân

  /* stareMeniuSaptamana(json, now, optiuni) →
       { stare: 'ok' | 'incheiat' | 'vechi' | 'lipsa', azi, zile: [{ data, preparate, azi }], pret, moneda, actualizat, exemplu, previzualizare }
     'ok'       — `actualizat` în ultimele 14 zile și cel puțin o zi de azi încolo → se afișează zilele rămase (max 7)
     'incheiat' — toate zilele au trecut → fallback (nu arătăm meniul săptămânii trecute ca actual)
     'vechi'    — `actualizat` lipsă / invalid / peste 14 zile → fallback
     'lipsa'    — JSON lipsă / invalid / fără zile valide → fallback
     optiuni.previzualizare: un JSON marcat _exemplu se arată întreg, oricât de vechi (doar pentru preview) */
  function stareMeniuSaptamana(json, now, optiuni) {
    try {
      optiuni = optiuni || {};
      now = now || new Date();
      var t = acumLocal(now, (json && json.fus_orar) || 'Europe/Bucharest');
      var ms = json && typeof json === 'object' && json.meniu_saptamana;
      if (!ms || typeof ms !== 'object' || !Array.isArray(ms.zile)) return { stare: 'lipsa', azi: t.data };
      var zile = ms.zile.filter(function (z) { return z && ziValida(z.data) && Array.isArray(z.preparate); })
        .map(function (z) { return { data: z.data, preparate: z.preparate.filter(function (p) { return typeof p === 'string' && p.trim(); }).map(function (p) { return p.trim(); }), azi: z.data === t.data }; })
        .filter(function (z) { return z.preparate.length; })
        .sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
      if (!zile.length) return { stare: 'lipsa', azi: t.data };
      var preview = !!(optiuni.previzualizare && json._exemplu);
      var act = Date.parse(json.actualizat || '');
      var vechime = isNaN(act) ? Infinity : (now.getTime() - act) / 864e5;
      var proaspat = vechime >= -1 && vechime <= PRAG_CATERING_ZILE;
      var comun = { azi: t.data, pret: typeof ms.pret === 'number' && ms.pret > 0 ? ms.pret : null, moneda: ms.moneda || 'lei', actualizat: json.actualizat, exemplu: !!json._exemplu, previzualizare: preview };
      if (!proaspat && !preview) return Object.assign({ stare: 'vechi', zile: zile }, comun);
      var ramase = preview ? zile : zile.filter(function (z) { return z.data >= t.data; });
      if (!ramase.length) return Object.assign({ stare: 'incheiat', zile: zile }, comun);
      return Object.assign({ stare: 'ok', zile: ramase.slice(0, 7) }, comun);
    } catch (e) { return { stare: 'lipsa' }; }
  }

  function randeazaMeniuSaptamana(container, json, now, optiuni) {
    var fallback = container.querySelector('[data-meniu-saptamana-fallback]');
    var vechi = container.querySelector('.meniu-saptamana'); if (vechi) vechi.parentNode.removeChild(vechi);
    var s = stareMeniuSaptamana(json, now, optiuni);
    container.setAttribute('data-stare', s.stare);
    if (s.stare !== 'ok') { if (fallback) fallback.hidden = false; return s; }
    var card = el('div', 'meniu-saptamana');
    var cap = el('div', 'meniu-saptamana-cap');
    cap.appendChild(el('span', 'meniu-saptamana-titlu', 'Săptămâna ' + dataScurta(s.zile[0].data) + (s.zile.length > 1 ? ' – ' + dataScurta(s.zile[s.zile.length - 1].data) : '')));
    if (s.pret) { var pret = el('span', 'meniu-saptamana-pret'); pret.appendChild(el('b', null, String(s.pret))); pret.appendChild(document.createTextNode(' ' + s.moneda + ' porția')); cap.appendChild(pret); }
    card.appendChild(cap);
    var lista = el('ol', 'meniu-saptamana-lista');
    s.zile.forEach(function (z) {
      var li = el('li', z.azi ? 'azi' : null);
      var zi = el('span', 'meniu-saptamana-zi');
      var dl = dataLunga(z.data);
      zi.textContent = dl.charAt(0).toUpperCase() + dl.slice(1);
      if (z.azi) zi.appendChild(el('span', 'meniu-saptamana-azi', 'azi'));
      li.appendChild(zi);
      li.appendChild(el('span', 'meniu-saptamana-preparate', z.preparate.join(' · ')));
      lista.appendChild(li);
    });
    card.appendChild(lista);
    var sub = el('div', 'meniu-saptamana-sub');
    var a = el('a', 'buton', 'Comandă prânzul la birou'); a.href = '#comanda'; a.setAttribute('data-alege-tip', 'pranz-birou');
    sub.appendChild(a);
    var parti = [];
    var ora = oraLocala(s.actualizat, json && json.fus_orar);
    if (ora) parti.push('Actualizat ' + dataScurta(String(s.actualizat).slice(0, 10)) + ', ' + ora);
    parti.push('alergenii preparatelor: la cerere');
    var nota = el('p', 'mic mut', parti.join(' · '));
    if (s.previzualizare) nota.appendChild(el('span', 'todo', ' previzualizare cu date de exemplu'));
    sub.appendChild(nota);
    card.appendChild(sub);
    if (fallback) fallback.hidden = true;
    container.appendChild(card);
    return s;
  }

  // =====================================================================
  // 6. Cofetăria (M4) — catalogul de torturi din data/torturi.json + poza-model din formular
  // =====================================================================
  var LIMITA_POZA = 5 * 1024 * 1024, POZA_MAX_PX = 1600, POZA_CALITATE = 0.82;
  var TORTURI_CATALOG = {}, TORTURI_TERMENE = {}, TORTURI_TERMEN = 0; // se umplu din JSON (id → nume / termen), folosite de formular

  /* stareTorturi(json) → { stare: 'ok' | 'lipsa', torturi: [...], termen_minim_zile, moneda, exemplu }
     Catalogul se scrie manual și nu are prag de vechime; 'lipsa' doar dacă JSON-ul lipsește, e stricat sau fără torturi valide. */
  function stareTorturi(json) {
    try {
      if (!json || typeof json !== 'object' || !Array.isArray(json.torturi)) return { stare: 'lipsa' };
      var torturi = json.torturi.filter(function (t) { return t && typeof t.id === 'string' && t.id.trim() && typeof t.nume === 'string' && t.nume.trim(); })
        .map(function (t) {
          return { id: t.id.trim(), nume: t.nume.trim(), descriere: typeof t.descriere === 'string' ? t.descriere.trim() : '',
            poza: typeof t.poza === 'string' && t.poza ? t.poza : '', pret_de_la: typeof t.pret_de_la === 'number' && t.pret_de_la > 0 ? t.pret_de_la : null,
            per: t.per === 'bucată' || t.per === 'bucata' ? 'bucată' : 'kg',
            alergeni: Array.isArray(t.alergeni) ? t.alergeni.filter(function (a) { return typeof a === 'string' && a.trim(); }) : [],
            termen_minim_zile: typeof t.termen_minim_zile === 'number' && t.termen_minim_zile > 0 ? t.termen_minim_zile : null, nota: typeof t._nota === 'string' ? t._nota : '' };
        });
      if (!torturi.length) return { stare: 'lipsa' };
      return { stare: 'ok', torturi: torturi, termen_minim_zile: typeof json.termen_minim_zile === 'number' && json.termen_minim_zile > 0 ? json.termen_minim_zile : null,
        moneda: json.moneda || 'lei', exemplu: !!json._exemplu };
    } catch (e) { return { stare: 'lipsa' }; }
  }

  function randeazaTorturi(container, json) {
    var fallback = container.querySelector('[data-torturi-fallback]');
    var vechi = container.querySelector('.torturi'); if (vechi) vechi.parentNode.removeChild(vechi);
    var s = stareTorturi(json);
    container.setAttribute('data-stare', s.stare);
    if (s.stare !== 'ok') { if (fallback) fallback.hidden = false; return s; }
    TORTURI_CATALOG = {}; TORTURI_TERMENE = {}; TORTURI_TERMEN = s.termen_minim_zile || 0;
    var grila = el('div', 'grila grila-3 torturi');
    s.torturi.forEach(function (t) {
      TORTURI_CATALOG[t.id] = t.nume; if (t.termen_minim_zile) TORTURI_TERMENE[t.id] = t.termen_minim_zile;
      var card = el('article', 'card tort'); card.setAttribute('data-tort-id', t.id);
      var poza = el('div', 'card-poza');
      if (t.poza && !/TODO-poza/.test(t.poza)) {
        var img = document.createElement('img'); img.src = t.poza; img.alt = t.nume; img.loading = 'lazy'; img.decoding = 'async';
        img.addEventListener('error', function () { poza.className = 'card-poza poza-todo'; poza.innerHTML = ''; poza.appendChild(el('span', null, 'TODO-poza: ' + t.nume)); });
        poza.appendChild(img);
      } else { poza.className = 'card-poza poza-todo'; poza.appendChild(el('span', null, 'TODO-poza: ' + t.nume)); }
      card.appendChild(poza);
      card.appendChild(el('h3', null, t.nume));
      if (t.descriere) card.appendChild(el('p', null, t.descriere));
      var pret = el('p', 'tort-pret');
      if (t.pret_de_la) { pret.appendChild(document.createTextNode('de la ')); pret.appendChild(el('b', null, String(t.pret_de_la) + ' ' + s.moneda)); pret.appendChild(document.createTextNode(' / ' + t.per)); }
      else { pret.appendChild(el('span', 'mut', 'preț la cerere, pe ' + t.per)); if (s.exemplu && t.nota) pret.appendChild(el('span', 'todo', t.nota)); }
      card.appendChild(pret);
      var meta = [];
      if (t.alergeni.length) meta.push('Alergeni: ' + t.alergeni.join(', '));
      var termen = t.termen_minim_zile || s.termen_minim_zile;
      if (termen) meta.push('comandă cu ' + termen + ' zile înainte');
      if (meta.length) card.appendChild(el('p', 'mic mut tort-meta', meta.join(' · ')));
      var b = el('a', 'buton buton-secundar', 'Comandă'); b.href = '#comanda'; b.setAttribute('data-alege-tort', t.id);
      card.appendChild(b);
      grila.appendChild(card);
    });
    if (fallback) fallback.hidden = true;
    container.appendChild(grila);
    // lista „Ce tort" din formular se umple din catalog (plus „personalizat" dacă nu e deja în catalog)
    var sel = document.querySelector('form[data-cerere="tort"] [name="tort"]');
    if (sel) {
      var ales = sel.value;
      sel.innerHTML = '';
      var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Alege…'; sel.appendChild(o0);
      s.torturi.forEach(function (t) { var o = document.createElement('option'); o.value = t.id; o.textContent = t.nume; sel.appendChild(o); });
      if (!TORTURI_CATALOG.personalizat) { var op = document.createElement('option'); op.value = 'personalizat'; op.textContent = 'Tort personalizat, după modelul din poză'; sel.appendChild(op); }
      if (ales && sel.querySelector('option[value="' + ales + '"]')) sel.value = ales;
    }
    return s;
  }

  /* pregatestePoza(file, cb) → cb({ nume, tip: 'image/jpeg', marime, base64, latime, inaltime }) sau cb(null, mesaj)
     Redimensionează la max 1600 px și recomprimă JPEG, ca payload-ul să rămână mic (de obicei 100–300 KB). Dacă browserul nu poate decoda
     imaginea (ex. HEIC) o trimite ca atare dacă are sub 1,5 MB, altfel cere trimiterea pe WhatsApp. */
  function pregatestePoza(file, cb) {
    try {
      var reader = new FileReader();
      reader.onerror = function () { cb(null, 'Nu am putut citi poza.'); };
      reader.onload = function () {
        var dataUrl = String(reader.result || '');
        var img = new Image();
        img.onload = function () {
          try {
            var scara = Math.min(1, POZA_MAX_PX / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
            var w = Math.max(1, Math.round((img.naturalWidth || img.width) * scara)), h = Math.max(1, Math.round((img.naturalHeight || img.height) * scara));
            var canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
            var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
            var out = canvas.toDataURL('image/jpeg', POZA_CALITATE);
            var b64 = out.split(',')[1] || '';
            if (!b64) throw new Error('canvas gol');
            cb({ nume: (file.name || 'model').replace(/\.[a-z0-9]+$/i, '') + '.jpg', tip: 'image/jpeg', marime: Math.round(b64.length * 3 / 4), base64: b64, latime: w, inaltime: h });
          } catch (e) { brut(); }
        };
        img.onerror = brut;
        function brut() { // nu se poate decoda: trimitem originalul doar dacă e mic
          if (file.size <= 1.5 * 1024 * 1024 && /^data:image\//.test(dataUrl)) {
            cb({ nume: file.name || 'model', tip: dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/jpeg', marime: file.size, base64: dataUrl.split(',')[1] || '', latime: 0, inaltime: 0 });
          } else cb(null, 'Browserul nu poate citi acest format de poză. Trimite-o pe WhatsApp după ce dai comanda.');
        }
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    } catch (e) { cb(null, 'Nu am putut citi poza.'); }
  }

  // =====================================================================
  // 7. Recenzii Google + postări Facebook (M5) — data/recenzii.json, data/postari.json
  // =====================================================================
  var PRAG_RECENZII_ZILE = 30, PRAG_POSTARI_ZILE = 14, MAX_RECENZII = 5, MAX_POSTARI = 3, MAX_TEXT_POSTARE = 280;

  function proaspat(json, now, pragZile, optiuni) { // { ok, previzualizare } după `actualizat` și pragul componentei
    var act = Date.parse((json && json.actualizat) || '');
    var vechime = isNaN(act) ? Infinity : ((now || new Date()).getTime() - act) / 864e5;
    var p = vechime >= -1 && vechime <= pragZile;
    if (p) return { ok: true, previzualizare: false };
    if (optiuni && optiuni.previzualizare && json && json._exemplu) return { ok: true, previzualizare: true };
    return { ok: false };
  }

  /* stareRecenzii(json, now, optiuni) → { stare: 'ok' | 'vechi' | 'lipsa', rating, numar, recenzii: [{ autor, nota, data, text }], url_recenzie_noua, url_google, previzualizare } */
  function stareRecenzii(json, now, optiuni) {
    try {
      if (!json || typeof json !== 'object' || !Array.isArray(json.recenzii)) return { stare: 'lipsa' };
      var recenzii = json.recenzii.filter(function (r) { return r && typeof r.text === 'string' && r.text.trim() && typeof r.nota === 'number' && r.nota >= 1 && r.nota <= 5; })
        .map(function (r) { return { autor: typeof r.autor === 'string' && r.autor.trim() ? r.autor.trim() : 'Client Google', nota: Math.round(r.nota), data: ziValida(r.data) ? r.data : '', text: r.text.trim() }; })
        .sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; }).slice(0, MAX_RECENZII);
      var rating = typeof json.rating === 'number' && json.rating > 0 && json.rating <= 5 ? Math.round(json.rating * 10) / 10 : null;
      if (!recenzii.length && !rating) return { stare: 'lipsa' };
      var f = proaspat(json, now, PRAG_RECENZII_ZILE, optiuni);
      if (!f.ok) return { stare: 'vechi' };
      var linkNou = typeof json.url_recenzie_noua === 'string' && /^https:\/\//.test(json.url_recenzie_noua) && !/TODO/.test(json.url_recenzie_noua) ? json.url_recenzie_noua : '';
      var linkGoogle = typeof json.url_google === 'string' && /^https:\/\//.test(json.url_google) ? json.url_google : '';
      return { stare: 'ok', rating: rating, numar: typeof json.numar === 'number' && json.numar > 0 ? Math.round(json.numar) : null, recenzii: recenzii,
        url_recenzie_noua: linkNou, url_google: linkGoogle, previzualizare: f.previzualizare, exemplu: !!json._exemplu };
    } catch (e) { return { stare: 'lipsa' }; }
  }

  function stele(nota) { // ★★★★☆ cu etichetă pentru cititoarele de ecran
    var s = el('span', 'stele'); s.setAttribute('aria-label', nota + ' din 5');
    var plin = Math.round(nota);
    for (var i = 1; i <= 5; i++) s.appendChild(el('i', i <= plin ? 'stea plina' : 'stea', '★'));
    return s;
  }

  function randeazaRecenzii(sectiune, json, now, optiuni) {
    var s = stareRecenzii(json, now, optiuni);
    sectiune.setAttribute('data-stare', s.stare);
    if (s.stare !== 'ok') { sectiune.hidden = true; return s; }
    var rating = sectiune.querySelector('[data-recenzii-rating]'), lista = sectiune.querySelector('[data-recenzii-lista]');
    var numar = sectiune.querySelector('[data-recenzii-numar]'), link = sectiune.querySelector('[data-recenzii-link]');
    if (rating) {
      rating.innerHTML = '';
      if (s.rating) { rating.appendChild(el('b', null, String(s.rating).replace('.', ','))); rating.appendChild(stele(s.rating)); }
      if (s.numar) rating.appendChild(el('span', 'mut', s.numar + ' de recenzii'));
    }
    if (lista) {
      lista.innerHTML = '';
      s.recenzii.forEach(function (r) {
        var card = el('blockquote', 'card recenzie');
        card.appendChild(stele(r.nota));
        card.appendChild(el('p', null, r.text));
        var f = el('footer'); f.appendChild(el('b', null, r.autor)); if (r.data) f.appendChild(el('span', 'mut', ' · ' + dataScurta(r.data) + ' ' + r.data.slice(0, 4)));
        card.appendChild(f);
        lista.appendChild(card);
      });
    }
    if (numar) text(numar, 'Recenziile sunt preluate automat de pe Google' + (s.previzualizare ? ' (previzualizare cu date de exemplu)' : '') + '.');
    if (link) { if (s.url_recenzie_noua) link.href = s.url_recenzie_noua; else if (s.url_google) { link.href = s.url_google; text(link, 'Vezi recenziile pe Google →'); } }
    sectiune.hidden = false;
    return s;
  }

  /* starePostari(json, now, optiuni) → { stare: 'ok' | 'vechi' | 'lipsa', postari: [{ id, data, text, poza, url }], url_pagina, previzualizare } */
  function starePostari(json, now, optiuni) {
    try {
      if (!json || typeof json !== 'object' || !Array.isArray(json.postari)) return { stare: 'lipsa' };
      var postari = json.postari.filter(function (p) { return p && ((typeof p.text === 'string' && p.text.trim()) || (typeof p.poza === 'string' && p.poza)); })
        .map(function (p) { return { id: String(p.id || ''), data: !isNaN(Date.parse(p.data || '')) ? p.data : '', text: typeof p.text === 'string' ? p.text.trim() : '',
          poza: typeof p.poza === 'string' && p.poza ? p.poza : '', url: typeof p.url === 'string' && /^https:\/\//.test(p.url) ? p.url : '' }; })
        .sort(function (a, b) { return Date.parse(b.data || 0) - Date.parse(a.data || 0); }).slice(0, MAX_POSTARI);
      if (!postari.length) return { stare: 'lipsa' };
      var f = proaspat(json, now, PRAG_POSTARI_ZILE, optiuni);
      if (!f.ok) return { stare: 'vechi' };
      return { stare: 'ok', postari: postari, url_pagina: typeof json.url_pagina === 'string' && /^https:\/\//.test(json.url_pagina) ? json.url_pagina : '', previzualizare: f.previzualizare, exemplu: !!json._exemplu };
    } catch (e) { return { stare: 'lipsa' }; }
  }

  function randeazaPostari(sectiune, json, now, optiuni) {
    var s = starePostari(json, now, optiuni);
    sectiune.setAttribute('data-stare', s.stare);
    if (s.stare !== 'ok') { sectiune.hidden = true; return s; }
    var lista = sectiune.querySelector('[data-postari-lista]'), link = sectiune.querySelector('[data-postari-link]');
    if (lista) {
      lista.innerHTML = '';
      s.postari.forEach(function (p) {
        var card = el('article', 'card postare');
        if (p.poza) {
          var fig = el('div', 'card-poza'); var img = document.createElement('img'); img.src = p.poza; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
          img.addEventListener('error', function () { if (fig.parentNode) fig.parentNode.removeChild(fig); });
          fig.appendChild(img); card.appendChild(fig);
        }
        if (p.data) card.appendChild(el('time', 'mic mut', dataLunga(p.data.slice(0, 10)) + (oraLocala(p.data) ? ', ' + oraLocala(p.data) : '')));
        var t = p.text.length > MAX_TEXT_POSTARE ? p.text.slice(0, MAX_TEXT_POSTARE).replace(/\s+\S*$/, '') + '…' : p.text;
        if (t) card.appendChild(el('p', null, t));
        if (p.url) { var a = el('a', 'sageata', 'Vezi pe Facebook →'); a.href = p.url; a.rel = 'noopener'; a.target = '_blank'; card.appendChild(a); }
        lista.appendChild(card);
      });
    }
    if (link && s.url_pagina) link.href = s.url_pagina;
    if (s.previzualizare && lista) lista.appendChild(el('p', 'todo', 'previzualizare cu date de exemplu'));
    sectiune.hidden = false;
    return s;
  }

  // =====================================================================
  // 8. Evenimente (M6) — data/evenimente.json
  // =====================================================================
  var PRAG_EVENIMENTE_ZILE = 7, MAX_EVENIMENTE = 4;
  var LOCURI = { 'Gastro-pub OK': { adresa: 'Str. A.I. Cuza nr. 26, Calafat' }, 'Terasa OK': { adresa: 'Str. A.I. Cuza nr. 26, Calafat' }, 'Sala Vidin': { adresa: 'Str. A.I. Cuza nr. 26, Calafat' }, 'Sala de bal OK': { adresa: 'Str. Traian nr. 2, Calafat' }, 'Cofetăria OK': { adresa: 'Str. A.I. Cuza nr. 26, Calafat' } };

  /* stareEvenimente(json, now, optiuni) → { stare: 'ok' | 'vechi' | 'lipsa' | 'niciunul', evenimente: [{ id, titlu, inceput, sfarsit, loc, descriere, poza, url }], previzualizare }
     'ok'       — `actualizat` în ultimele 7 zile și cel puțin un eveniment care nu s-a încheiat → se afișează (max 4, în ordinea datei)
     'niciunul' — date proaspete, dar niciun eveniment viitor → secțiunea se ascunde
     'vechi' / 'lipsa' — fallback (ascuns); optiuni.previzualizare + _exemplu → se arată toate, oricât de vechi */
  function stareEvenimente(json, now, optiuni) {
    try {
      now = now || new Date();
      if (!json || typeof json !== 'object' || !Array.isArray(json.evenimente)) return { stare: 'lipsa' };
      var toate = json.evenimente.filter(function (e) { return e && typeof e.titlu === 'string' && e.titlu.trim() && !isNaN(Date.parse(e.inceput || '')); })
        .map(function (e) {
          var inceput = Date.parse(e.inceput), sfarsit = Date.parse(e.sfarsit || '');
          return { id: String(e.id || ''), titlu: e.titlu.trim(), inceput: e.inceput, sfarsit: isNaN(sfarsit) || sfarsit < inceput ? '' : e.sfarsit, t0: inceput, t1: isNaN(sfarsit) || sfarsit < inceput ? inceput + 3 * 3600e3 : sfarsit,
            loc: typeof e.loc === 'string' ? e.loc.trim() : '', descriere: typeof e.descriere === 'string' ? e.descriere.trim() : '',
            poza: typeof e.poza === 'string' && e.poza ? e.poza : '', url: typeof e.url === 'string' && /^https:\/\//.test(e.url) ? e.url : '' };
        }).sort(function (a, b) { return a.t0 - b.t0; });
      if (!toate.length) return { stare: 'lipsa' };
      var f = proaspat(json, now, PRAG_EVENIMENTE_ZILE, optiuni);
      if (!f.ok) return { stare: 'vechi' };
      var viitoare = f.previzualizare ? toate : toate.filter(function (e) { return e.t1 >= now.getTime(); });
      if (!viitoare.length) return { stare: 'niciunul' };
      return { stare: 'ok', evenimente: viitoare.slice(0, MAX_EVENIMENTE), previzualizare: f.previzualizare, exemplu: !!json._exemplu, fus_orar: json.fus_orar };
    } catch (e) { return { stare: 'lipsa' }; }
  }

  function jsonLdEveniment(e, fus) { // schema.org/Event pentru Google (fără prețuri: nu inventăm oferte)
    var loc = LOCURI[e.loc] || null;
    var o = { '@context': 'https://schema.org', '@type': 'Event', name: e.titlu, startDate: e.inceput, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      organizer: { '@type': 'Organization', name: 'Restaurant OK Calafat', url: 'https://restaurantok.com/' } };
    if (e.sfarsit) o.endDate = e.sfarsit;
    if (e.descriere) o.description = e.descriere;
    if (e.poza) o.image = e.poza;
    if (e.url) o.url = e.url;
    o.location = { '@type': 'Place', name: e.loc || 'Restaurant OK Calafat', address: { '@type': 'PostalAddress', streetAddress: loc ? loc.adresa.split(', ')[0] : 'Calafat', addressLocality: 'Calafat', addressRegion: 'Dolj', addressCountry: 'RO' } };
    return o;
  }

  function randeazaEvenimente(sectiune, json, now, optiuni) {
    var s = stareEvenimente(json, now, optiuni);
    sectiune.setAttribute('data-stare', s.stare);
    var vechiLd = document.getElementById('ld-evenimente'); if (vechiLd) vechiLd.parentNode.removeChild(vechiLd);
    if (s.stare !== 'ok') { sectiune.hidden = true; return s; }
    var lista = sectiune.querySelector('[data-evenimente-lista]'), nota = sectiune.querySelector('[data-evenimente-nota]');
    if (lista) {
      lista.innerHTML = '';
      s.evenimente.forEach(function (e) {
        var card = el('article', 'card eveniment');
        var zi = e.inceput.slice(0, 10), p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(zi);
        var data = el('div', 'eveniment-data');
        if (p) { data.appendChild(el('b', null, String(+p[3]))); data.appendChild(el('span', null, LUNI_RO[+p[2] - 1].slice(0, 3))); data.setAttribute('aria-label', dataLunga(zi)); }
        card.appendChild(data);
        var corp = el('div', 'eveniment-corp');
        corp.appendChild(el('h3', null, e.titlu));
        var meta = [];
        if (p) meta.push(dataLunga(zi));
        var ora = oraLocala(e.inceput, s.fus_orar); if (ora) meta.push('ora ' + ora);
        if (e.loc) meta.push(e.loc);
        corp.appendChild(el('p', 'mic mut eveniment-meta', meta.join(' · ')));
        if (e.descriere) corp.appendChild(el('p', null, e.descriere));
        if (e.url) { var a = el('a', 'sageata', 'Detalii →'); a.href = e.url; a.rel = 'noopener'; a.target = '_blank'; corp.appendChild(a); }
        card.appendChild(corp);
        if (e.poza) { var img = document.createElement('img'); img.src = e.poza; img.alt = ''; img.loading = 'lazy'; img.className = 'eveniment-poza'; img.addEventListener('error', function () { if (img.parentNode) img.parentNode.removeChild(img); }); card.appendChild(img); }
        lista.appendChild(card);
      });
    }
    if (nota) { var tel = sectiune.getAttribute('data-telefon'); text(nota, (tel ? 'Rezervări la ' + tel + '.' : '') + (s.previzualizare ? ' Previzualizare cu date de exemplu.' : '')); }
    // JSON-LD pentru Google (Google citește și scripturile adăugate de JS)
    try {
      var ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'ld-evenimente';
      ld.textContent = JSON.stringify(s.evenimente.map(function (e) { return jsonLdEveniment(e, s.fus_orar); }));
      document.head.appendChild(ld);
    } catch (e) { /* fără JSON-LD */ }
    sectiune.hidden = false;
    return s;
  }

  function incarcaJson(caleJson, cb) {
    if (typeof fetch !== 'function') return;
    fetch(cale(caleJson), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { cb(j); })
      .catch(function () { cb(null); });
  }

  function incarcaProgram(cb) {
    if (typeof fetch !== 'function') return;
    fetch(cale('data/program.json'), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(cb)
      .catch(function () { /* componentele rămân ascunse / pe fallback */ });
  }

  function init() {
    // limba paginii și rădăcina (M8)
    try {
      setLimba((document.documentElement.getAttribute('lang') || 'ro').slice(0, 2).toLowerCase());
      var mr = document.querySelector('meta[name="ok-radacina"]');
      RADACINA = mr && typeof mr.content === 'string' ? mr.content : '';
    } catch (e) { LIMBA = 'ro'; RADACINA = ''; }
    // meniul pe mobil
    var b = document.querySelector('.meniu-buton'), nav = document.getElementById('meniu-principal');
    if (b && nav) b.addEventListener('click', function () {
      var d = nav.classList.toggle('deschis');
      b.setAttribute('aria-expanded', d ? 'true' : 'false');
    });
    // meniul zilei (M1)
    var meniuri = document.querySelectorAll('[data-meniu-zilei]');
    if (meniuri.length) {
      var previzualizare = /[?&]exemplu=1(&|$)/.test(location.search);
      incarcaJson('data/meniu-zilei.json', function (json) {
        var acumM = new Date();
        meniuri.forEach(function (c) { try { randeazaMeniuZilei(c, json, acumM, { previzualizare: previzualizare }); } catch (e) { /* rămâne fallback-ul */ } });
        // la trecerea de valabil_pana componenta se închide singură (verificare la fiecare minut)
        setInterval(function () {
          meniuri.forEach(function (c) {
            var inainte = c.getAttribute('data-stare');
            var dupa = stareMeniu(json, new Date(), { previzualizare: previzualizare }).stare;
            if (inainte !== dupa) { try { randeazaMeniuZilei(c, json, new Date(), { previzualizare: previzualizare }); } catch (e) {} }
          });
        }, 60000);
      });
    }
    // sala de bal (M2): formularul de cerere + calendarul de disponibilitate
    document.querySelectorAll('form[data-cerere]').forEach(function (f) { try { initCerere(f); } catch (e) { /* formularul rămâne un formular HTML obișnuit */ } });
    var calendar = document.querySelector('[data-sala-disponibilitate]');
    if (calendar) {
      var previzualizareC = /[?&]exemplu=1(&|$)/.test(location.search);
      incarcaJson('data/sala-disponibilitate.json', function (json) {
        try { randeazaCalendar(calendar, json, new Date(), { previzualizare: previzualizareC }); } catch (e) { calendar.hidden = true; }
      });
    }
    // evenimente (M6)
    var evenimente = document.querySelector('[data-evenimente]');
    if (evenimente) incarcaJson('data/evenimente.json', function (json) {
      try { randeazaEvenimente(evenimente, json, new Date(), { previzualizare: /[?&]exemplu=1(&|$)/.test(location.search) }); } catch (e) { evenimente.hidden = true; }
    });
    // recenzii Google + postări Facebook (M5)
    var previzualizareR = /[?&]exemplu=1(&|$)/.test(location.search);
    var recenzii = document.querySelectorAll('[data-recenzii]');
    if (recenzii.length) incarcaJson('data/recenzii.json', function (json) {
      recenzii.forEach(function (sec) { try { randeazaRecenzii(sec, json, new Date(), { previzualizare: previzualizareR }); } catch (e) { sec.hidden = true; } });
    });
    var postari = document.querySelector('[data-postari]');
    if (postari) incarcaJson('data/postari.json', function (json) {
      try { randeazaPostari(postari, json, new Date(), { previzualizare: previzualizareR }); } catch (e) { postari.hidden = true; }
    });
    // cofetăria (M4): catalogul de torturi; butoanele „Comandă" din catalog preselectează tortul în formular
    var torturi = document.querySelector('[data-torturi]');
    if (torturi) {
      incarcaJson('data/torturi.json', function (json) {
        try { randeazaTorturi(torturi, json); } catch (e) { /* rămâne fallback-ul */ }
      });
      document.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('[data-alege-tort]') : null;
        var sel = document.querySelector('form[data-cerere="tort"] [name="tort"]');
        if (!a || !sel) return;
        sel.value = a.getAttribute('data-alege-tort');
        if (typeof Event === 'function') sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    // catering (M3): meniul săptămânii
    var saptamana = document.querySelector('[data-meniu-saptamana]');
    if (saptamana) {
      var previzualizareS = /[?&]exemplu=1(&|$)/.test(location.search);
      incarcaJson('data/catering.json', function (json) {
        try { randeazaMeniuSaptamana(saptamana, json, new Date(), { previzualizare: previzualizareS }); } catch (e) { /* rămâne fallback-ul */ }
      });
    }
    // componentele vii din program.json
    var badges = document.querySelectorAll('[data-deschis-acum]');
    var liste = document.querySelectorAll('[data-program-lista]');
    if (!badges.length && !liste.length) return;
    incarcaProgram(function (program) {
      var acum = new Date();
      badges.forEach(function (el) { randeazaDeschisAcum(el, program, acum); });
      liste.forEach(function (el) { randeazaProgram(el, program, acum); });
      // reîmprospătăm eticheta la fiecare minut
      setInterval(function () { badges.forEach(function (el) { randeazaDeschisAcum(el, program, new Date()); }); }, 60000);
    });
  }

  var api = { stareDeschis: stareDeschis, acumLocal: acumLocal, stareMeniu: stareMeniu, textWhatsApp: textWhatsApp, dataLunga: dataLunga,
    stareDisponibilitate: stareDisponibilitate, luniCalendar: luniCalendar, validareCerere: validareCerere, payloadCerere: payloadCerere, textWhatsAppCerere: textWhatsAppCerere,
    textConfirmare: textConfirmare, stareMeniuSaptamana: stareMeniuSaptamana, stareTorturi: stareTorturi, stareRecenzii: stareRecenzii, starePostari: starePostari, stareEvenimente: stareEvenimente, jsonLdEveniment: jsonLdEveniment,
    setLimba: setLimba, dataScurta: dataScurta, TEXTE: TEXTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // pentru teste în Node
  else { root.OK = api; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
})(typeof window !== 'undefined' ? window : this);
