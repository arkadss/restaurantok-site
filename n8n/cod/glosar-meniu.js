/* Glosar RO → EN / BG pentru numele preparatelor din meniul zilei (M8).
   Traducere deterministă, fără internet și fără cheie: întâi fraze întregi din glosar, apoi compunere
   („X cu Y și Z", „X la cuptor", „X prăjit") din bucăți cunoscute. Ce nu se poate traduce complet rămâne
   null (site-ul arată atunci numele în română, marcat lang="ro"). Nu inventează: un cuvânt necunoscut
   oprește traducerea acelui preparat, nu produce o traducere pe jumătate.
   Sursa pentru nodul Code „Traduceri" din n8n/meniu-zilei.json (n8n/genereaza.js îl inserează);
   se testează separat: node tests/traduceri.test.js. Fără dependențe; Node 18+ și browser. */
(function (root) {
  'use strict';

  // ---- normalizare: minuscule, fără diacritice (acceptă și textul scris fără ă/ș/ț), spații simple ----
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[ăâ]/g, 'a').replace(/î/g, 'i').replace(/[șş]/g, 's').replace(/[țţ]/g, 't')
      .replace(/[“”„"'’]/g, '').replace(/\s*[.!]+\s*$/, '').replace(/\s+/g, ' ').trim();
  }
  function cap(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // ---- substantive / fraze: cheie RO (fără diacritice) → { en, bg, g } ; g = genul BG (m/f/n/pl) pentru acordul adjectivelor ----
  var G = {};
  function f(ro, en, bg, g) { ro.split('|').forEach(function (k) { G[norm(k)] = { en: en, bg: bg, g: g || 'm' }; }); }

  // ciorbe și supe
  f('ciorba de perisoare|bors de perisoare|ciorba cu perisoare', 'meatball sour soup', 'супа топчета', 'f');
  f('ciorba de burta', 'tripe soup', 'шкембе чорба', 'f');
  f('ciorba de vacuta|ciorba de vita|bors de vacuta', 'beef sour soup', 'телешка чорба', 'f');
  f('ciorba de pui|bors de pui', 'chicken sour soup', 'пилешка чорба', 'f');
  f('ciorba de legume|bors de legume', 'vegetable sour soup', 'зеленчукова чорба', 'f');
  f('ciorba de fasole|bors de fasole|ciorba de fasole boabe', 'bean sour soup', 'бобена чорба', 'f');
  f('ciorba de fasole cu afumatura|ciorba de fasole cu ciolan|ciorba de fasole cu costita', 'bean soup with smoked pork', 'бобена чорба с пушено месо', 'f');
  f('ciorba de peste|bors de peste', 'fish sour soup', 'рибена чорба', 'f');
  f('ciorba de cartofi', 'potato sour soup', 'картофена чорба', 'f');
  f('ciorba taraneasca|ciorba taraneasca de vacuta|ciorba taraneasca de vita', 'peasant-style beef and vegetable soup', 'селска чорба с телешко', 'f');
  f('ciorba taraneasca de pui', 'peasant-style chicken and vegetable soup', 'селска чорба с пиле', 'f');
  f('ciorba radauteana', 'Rădăuți-style chicken soup with sour cream', 'пилешка чорба по радауцки', 'f');
  f('ciorba de loboda', 'orach sour soup', 'чорба от лобода', 'f');
  f('ciorba de salata|ciorba de salata verde', 'lettuce sour soup', 'чорба от зелена салата', 'f');
  f('ciorba de miel', 'lamb sour soup', 'агнешка чорба', 'f');
  f('ciorba de porc', 'pork sour soup', 'свинска чорба', 'f');
  f('ciorba de ciuperci', 'mushroom sour soup', 'гъбена чорба', 'f');
  f('ciorba de dovlecei|ciorba de dovlecel', 'zucchini sour soup', 'чорба от тиквички', 'f');
  f('ciorba de varza', 'cabbage sour soup', 'зелева чорба', 'f');
  f('ciorba de curcan', 'turkey sour soup', 'пуешка чорба', 'f');
  f('ciorba de oase', 'bone broth sour soup', 'чорба от кокал', 'f');
  f('ciorba de sfecla', 'beetroot sour soup', 'чорба от червено цвекло', 'f');
  f('ciorba de stevie', 'sorrel sour soup', 'чорба от лапад', 'f');
  f('ciorba de curechi', 'cabbage sour soup', 'зелева чорба', 'f');
  f('ciorba', 'sour soup', 'чорба', 'f');
  f('supa de pui cu taitei|supa de pui cu taietei|supa cu taitei', 'chicken noodle soup', 'пилешка супа с фиде', 'f');
  f('supa de pui cu galuste|supa de galuste|supa cu galuste', 'chicken soup with semolina dumplings', 'пилешка супа с кнедли от грис', 'f');
  f('supa de pui', 'chicken soup', 'пилешка супа', 'f');
  f('supa de vita|supa de vacuta', 'beef soup', 'телешка супа', 'f');
  f('supa crema de legume', 'cream of vegetable soup', 'крем супа от зеленчуци', 'f');
  f('supa crema de ciuperci', 'cream of mushroom soup', 'крем супа от гъби', 'f');
  f('supa crema de dovleac', 'cream of pumpkin soup', 'крем супа от тиква', 'f');
  f('supa crema de linte', 'cream of lentil soup', 'крем супа от леща', 'f');
  f('supa de rosii', 'tomato soup', 'доматена супа', 'f');
  f('supa de legume', 'vegetable soup', 'зеленчукова супа', 'f');
  f('supa de linte', 'lentil soup', 'супа от леща', 'f');
  f('supa', 'soup', 'супа', 'f');

  // feluri principale
  f('sarmale cu mamaliga|sarmale cu mamaliguta', 'cabbage rolls with polenta', 'сарми с качамак', 'pl');
  f('sarmale|sarmalute|sarmale in foi de varza', 'cabbage rolls', 'сарми', 'pl');
  f('sarmale in foi de vita', 'vine-leaf rolls', 'лозови сарми', 'pl');
  f('mici|mititei', 'grilled minced-meat rolls (mici)', 'кебапчета (мичи)', 'pl');
  f('snitel de pui', 'chicken schnitzel', 'пилешки шницел', 'm');
  f('snitel de porc', 'pork schnitzel', 'свински шницел', 'm');
  f('snitel de curcan', 'turkey schnitzel', 'пуешки шницел', 'm');
  f('snitel', 'schnitzel', 'шницел', 'm');
  f('pui', 'chicken', 'пиле', 'n');
  f('pulpe de pui|pulpa de pui|pulpe pui', 'chicken legs', 'пилешки бутчета', 'pl');
  f('aripioare de pui|aripioare', 'chicken wings', 'пилешки крилца', 'pl');
  f('piept de pui', 'chicken breast', 'пилешко филе', 'n');
  f('ceafa de porc', 'pork neck', 'свински врат', 'm');
  f('cotlet de porc', 'pork chop', 'свинска пържола', 'f');
  f('muschi de porc|muschiulet de porc', 'pork tenderloin', 'свинско бонфиле', 'n');
  f('friptura de porc', 'roast pork', 'свинско печено', 'n');
  f('friptura de pui', 'roast chicken', 'пилешко печено', 'n');
  f('friptura de vita', 'roast beef', 'телешко печено', 'n');
  f('tocanita de pui|tocana de pui', 'chicken stew', 'пилешка яхния', 'f');
  f('tocanita de porc|tocana de porc', 'pork stew', 'свинска яхния', 'f');
  f('tocanita de vita|tocana de vita', 'beef stew', 'телешка яхния', 'f');
  f('tocanita de legume|tocana de legume', 'vegetable stew', 'зеленчукова яхния', 'f');
  f('tochitura|tochitura moldoveneasca|tochitura cu mamaliga', 'tochitură (pork stew with polenta, egg and cheese)', 'точитура (свинска яхния с качамак, яйце и сирене)', 'f');
  f('gulas|gulas de vita', 'goulash', 'гулаш', 'm');
  f('chiftele|chiftelute|parjoale', 'meatballs', 'кюфтета', 'pl');
  f('chiftele marinate|chiftelute marinate', 'meatballs in tomato sauce', 'кюфтета в доматен сос', 'pl');
  f('crap', 'carp', 'шаран', 'm');
  f('peste', 'fish', 'риба', 'f');
  f('pastrav', 'trout', 'пъстърва', 'f');
  f('somn', 'catfish', 'сом', 'm');
  f('salau', 'pikeperch', 'бяла риба', 'f');
  f('macrou', 'mackerel', 'скумрия', 'f');
  f('plachie de crap|crap plachie', 'carp plaki (baked with vegetables)', 'шаран плакия', 'm');
  f('saramura de crap', 'grilled carp in brine', 'шаран в саламура', 'm');
  f('musaca|musaca de cartofi', 'potato moussaka', 'картофена мусака', 'f');
  f('musaca de vinete', 'eggplant moussaka', 'мусака с патладжан', 'f');
  f('varza calita', 'braised cabbage', 'задушено зеле', 'n');
  f('varza calita cu ciolan|varza cu ciolan', 'braised cabbage with smoked pork knuckle', 'задушено зеле с джолан', 'n');
  f('varza calita cu carnati|varza cu carnati', 'braised cabbage with sausages', 'задушено зеле с наденица', 'n');
  f('ciolan afumat|ciolan', 'smoked pork knuckle', 'пушен джолан', 'm');
  f('fasole batuta', 'bean paste', 'бобено пюре', 'n');
  f('iahnie de fasole|fasole iahnie|mancare de fasole|fasole scazuta', 'bean stew', 'боб яхния', 'f');
  f('iahnie de fasole cu carnati|fasole cu carnati', 'bean stew with sausages', 'боб яхния с наденица', 'f');
  f('fasole cu ciolan|iahnie de fasole cu ciolan', 'bean stew with smoked pork knuckle', 'боб яхния с джолан', 'f');
  f('mancare de mazare|mazare scazuta', 'pea stew', 'грахова яхния', 'f');
  f('mancare de mazare cu pui|mazare cu pui', 'pea stew with chicken', 'грахова яхния с пиле', 'f');
  f('mancare de fasole verde|fasole verde scazuta', 'green bean stew', 'яхния от зелен фасул', 'f');
  f('mancare de cartofi|cartofi scazuti', 'potato stew', 'картофена яхния', 'f');
  f('mancare de dovlecei', 'zucchini stew', 'яхния от тиквички', 'f');
  f('mancare de ciuperci', 'mushroom stew', 'гъбена яхния', 'f');
  f('ghiveci de legume|ghiveci', 'vegetable stew (ghiveci)', 'зеленчуков гювеч', 'm');
  f('ardei umpluti', 'stuffed peppers', 'пълнени чушки', 'pl');
  f('dovlecei umpluti', 'stuffed zucchini', 'пълнени тиквички', 'pl');
  f('rosii umplute', 'stuffed tomatoes', 'пълнени домати', 'pl');
  f('paste carbonara|spaghete carbonara', 'pasta carbonara', 'паста карбонара', 'f');
  f('paste bolognese|spaghete bolognese', 'pasta bolognese', 'паста болонезе', 'f');
  f('paste cu sos de rosii|spaghete cu sos de rosii', 'pasta with tomato sauce', 'паста с доматен сос', 'f');
  f('paste cu pui', 'pasta with chicken', 'паста с пиле', 'f');
  f('paste|spaghete|macaroane', 'pasta', 'паста', 'f');
  f('pilaf de pui|pilaf cu pui', 'chicken pilaf', 'пилаф с пиле', 'm');
  f('pilaf|pilaf de orez', 'rice pilaf', 'пилаф', 'm');
  f('ostropel de pui|pui ostropel', 'chicken ostropel (in garlic and tomato sauce)', 'пиле остропел (в чеснов доматен сос)', 'n');
  f('pui cu smantana|pui in sos de smantana', 'chicken in sour-cream sauce', 'пиле със сметанов сос', 'n');
  f('pui cu ciuperci', 'chicken with mushrooms', 'пиле с гъби', 'n');
  f('ficatei de pui|ficatei', 'chicken livers', 'пилешки дробчета', 'pl');
  f('ficatei de pui cu ceapa|ficatei cu ceapa', 'chicken livers with onions', 'пилешки дробчета с лук', 'pl');
  f('drob de miel|drob', 'lamb drob (lamb offal loaf)', 'дроб сарма от агнешко', 'm');
  f('carnati|carnaciori', 'sausages', 'наденица', 'f');
  f('carnati de casa', 'homemade sausages', 'домашна наденица', 'f');
  f('rasol de vita|rasol', 'boiled beef', 'варено телешко', 'n');
  f('limba cu masline', 'beef tongue with olives', 'език с маслини', 'm');
  f('cordon bleu', 'cordon bleu', 'кордон бльо', 'n');
  f('papanasi', 'papanași (fried cheese doughnuts with sour cream and jam)', 'папанаш (пържени понички със сирене, сметана и конфитюр)', 'pl');
  f('clatite', 'pancakes', 'палачинки', 'pl');
  f('clatite cu gem|clatite cu dulceata', 'pancakes with jam', 'палачинки с конфитюр', 'pl');
  f('clatite cu ciocolata', 'pancakes with chocolate', 'палачинки с шоколад', 'pl');
  f('clatite cu branza', 'pancakes with cheese', 'палачинки със сирене', 'pl');
  f('pizza', 'pizza', 'пица', 'f');
  f('omleta', 'omelette', 'омлет', 'm');
  f('mamaliga cu branza si smantana', 'polenta with cheese and sour cream', 'качамак със сирене и сметана', 'm');
  f('bulz', 'bulz (polenta balls with cheese)', 'булз (качамак със сирене)', 'm');
  f('vinete', 'eggplant', 'патладжан', 'm');
  f('salata de vinete', 'eggplant salad', 'салата от патладжан', 'f');
  f('zacusca', 'zacuscă (vegetable spread)', 'закуска (зеленчуков пастет)', 'f');

  // garnituri
  f('cartofi prajiti', 'french fries', 'пържени картофи', 'pl');
  f('cartofi natur|cartofi fierti', 'boiled potatoes', 'варени картофи', 'pl');
  f('cartofi la cuptor|cartofi copti', 'oven-baked potatoes', 'печени картофи', 'pl');
  f('cartofi taranesti', 'country-style potatoes', 'селски картофи', 'pl');
  f('cartofi gratinati', 'potato gratin', 'картофи огретен', 'pl');
  f('cartofi wedges', 'potato wedges', 'картофи уеджис', 'pl');
  f('cartofi', 'potatoes', 'картофи', 'pl');
  f('piure de cartofi|piure|pireu|pireu de cartofi', 'mashed potatoes', 'картофено пюре', 'n');
  f('orez', 'rice', 'ориз', 'm');
  f('orez cu legume', 'rice with vegetables', 'ориз със зеленчуци', 'm');
  f('orez sarbesc', 'Serbian-style rice', 'ориз по сръбски', 'm');
  f('legume', 'vegetables', 'зеленчуци', 'pl');
  f('legume la gratar', 'grilled vegetables', 'зеленчуци на скара', 'pl');
  f('legume sote|legume la tigaie', 'sautéed vegetables', 'задушени зеленчуци', 'pl');
  f('legume mexicane', 'mixed vegetables', 'зеленчуков микс', 'm');
  f('mazare sote|mazare', 'sautéed peas', 'задушен грах', 'm');
  f('fasole verde sote|fasole verde', 'sautéed green beans', 'задушен зелен фасул', 'm');
  f('mamaliga|mamaliguta', 'polenta', 'качамак', 'm');
  f('mujdei|mujdei de usturoi', 'garlic sauce', 'чеснов сос', 'm');
  f('smantana', 'sour cream', 'сметана', 'f');
  f('branza', 'cheese', 'сирене', 'n');
  f('ardei iute', 'hot pepper', 'люта чушка', 'f');
  f('paine', 'bread', 'хляб', 'm');
  f('ceapa', 'onions', 'лук', 'm');
  f('ciuperci', 'mushrooms', 'гъби', 'pl');
  f('ciuperci sote', 'sautéed mushrooms', 'задушени гъби', 'pl');
  f('sos de rosii', 'tomato sauce', 'доматен сос', 'm');
  f('sos de usturoi', 'garlic sauce', 'чеснов сос', 'm');
  f('sos de ciuperci', 'mushroom sauce', 'гъбен сос', 'm');
  f('sos', 'sauce', 'сос', 'm');
  f('spanac', 'spinach', 'спанак', 'm');
  f('spanac cu ou', 'spinach with egg', 'спанак с яйце', 'm');
  f('ou|oua|ou ochi', 'fried egg', 'пържено яйце', 'n');
  f('broccoli', 'broccoli', 'броколи', 'n');
  f('conopida', 'cauliflower', 'карфиол', 'm');
  f('conopida pane', 'breaded cauliflower', 'паниран карфиол', 'm');
  f('cascaval pane', 'breaded cheese', 'панирано кашкавал', 'n');
  f('cascaval', 'cheese', 'кашкавал', 'm');
  f('ardei copti', 'roasted peppers', 'печени чушки', 'pl');
  f('castraveti', 'cucumbers', 'краставици', 'pl');
  f('rosii', 'tomatoes', 'домати', 'pl');
  f('masline', 'olives', 'маслини', 'pl');
  f('lamaie', 'lemon', 'лимон', 'm');

  // salate și murături
  f('salata de varza|salata de varza alba', 'cabbage salad', 'зелева салата', 'f');
  f('salata de varza rosie', 'red cabbage salad', 'салата от червено зеле', 'f');
  f('salata verde', 'green salad', 'зелена салата', 'f');
  f('salata de rosii', 'tomato salad', 'доматена салата', 'f');
  f('salata de castraveti', 'cucumber salad', 'салата от краставици', 'f');
  f('salata de rosii si castraveti|salata de rosii cu castraveti', 'tomato and cucumber salad', 'салата от домати и краставици', 'f');
  f('salata de sfecla|salata de sfecla rosie', 'beetroot salad', 'салата от червено цвекло', 'f');
  f('salata de muraturi', 'pickle salad', 'салата от туршия', 'f');
  f('salata asortata', 'mixed salad', 'салата асорти', 'f');
  f('salata de vara', 'summer salad (tomatoes, cucumbers, peppers)', 'лятна салата', 'f');
  f('salata orientala', 'potato salad with onions, olives and egg', 'ориенталска салата (картофи, лук, маслини, яйце)', 'f');
  f('salata de boeuf|salata boeuf|salata de beouf', 'boeuf salad (potatoes, vegetables, meat, mayonnaise)', 'руска салата с месо', 'f');
  f('salata de ardei copti', 'roasted pepper salad', 'салата от печени чушки', 'f');
  f('salata de ceapa', 'onion salad', 'салата от лук', 'f');
  f('salata greceasca', 'Greek salad', 'гръцка салата', 'f');
  f('salata', 'salad', 'салата', 'f');
  f('muraturi|muraturi asortate', 'mixed pickles', 'туршия', 'f');
  f('castraveti murati', 'pickled cucumbers', 'кисели краставички', 'pl');
  f('gogonele|gogonele murate', 'pickled green tomatoes', 'зелени домати туршия', 'pl');
  f('varza murata', 'sauerkraut', 'кисело зеле', 'n');
  f('ardei murati', 'pickled peppers', 'кисели чушки', 'pl');
  f('gogosari murati|gogosari', 'pickled bell peppers', 'кисели пиперки', 'pl');

  // desert
  f('prajitura|prajitura de casa', 'cake slice', 'сладкиш', 'm');
  f('tort', 'cake', 'торта', 'f');
  f('inghetata', 'ice cream', 'сладолед', 'm');
  f('fructe', 'fruit', 'плодове', 'pl');
  f('compot', 'stewed fruit (compote)', 'компот', 'm');
  f('placinta cu branza|placinta cu branza dulce', 'sweet cheese pie', 'баница със сладко сирене', 'f');
  f('placinta cu mere', 'apple pie', 'щрудел с ябълки', 'm');
  f('placinta cu dovleac', 'pumpkin pie', 'тиквеник', 'm');
  f('placinta', 'pie', 'баница', 'f');
  f('cozonac', 'cozonac (sweet bread)', 'козунак', 'm');
  f('gogosi', 'doughnuts', 'понички', 'pl');
  f('iaurt', 'yoghurt', 'кисело мляко', 'n');
  f('orez cu lapte', 'rice pudding', 'мляко с ориз', 'n');
  f('ecler', 'éclair', 'еклер', 'm');
  f('amandina', 'amandine (chocolate cream cake)', 'амандина (шоколадов сладкиш)', 'f');
  f('savarina', 'savarin (rum-soaked cake with whipped cream)', 'саварина', 'f');
  f('cafea', 'coffee', 'кафе', 'n');

  // ---- adjective: forme RO → { en, bg: { m, f, n, pl } } ; în EN și BG adjectivul stă înaintea substantivului ----
  var A = {};
  function a(ro, en, bg) { ro.split('|').forEach(function (k) { A[norm(k)] = { en: en, bg: bg }; }); }
  a('prajit|prajita|prajiti|prajite', 'fried', { m: 'пържен', f: 'пържена', n: 'пържено', pl: 'пържени' });
  a('copt|coapta|copti|coapte', 'baked', { m: 'печен', f: 'печена', n: 'печено', pl: 'печени' });
  a('umplut|umpluta|umpluti|umplute', 'stuffed', { m: 'пълнен', f: 'пълнена', n: 'пълнено', pl: 'пълнени' });
  a('afumat|afumata|afumati|afumate', 'smoked', { m: 'пушен', f: 'пушена', n: 'пушено', pl: 'пушени' });
  a('fiert|fiarta|fierti|fierte', 'boiled', { m: 'варен', f: 'варена', n: 'варено', pl: 'варени' });
  a('marinat|marinata|marinati|marinate', 'marinated', { m: 'мариновани', f: 'маринована', n: 'мариновано', pl: 'мариновани' });
  a('picant|picanta|picanti|picante', 'spicy', { m: 'лют', f: 'люта', n: 'люто', pl: 'люти' });
  a('crocant|crocanta|crocanti|crocante', 'crispy', { m: 'хрупкав', f: 'хрупкава', n: 'хрупкаво', pl: 'хрупкави' });
  a('sote|sotat|sotata|sotati|sotate', 'sautéed', { m: 'задушен', f: 'задушена', n: 'задушено', pl: 'задушени' });
  a('gratinat|gratinata|gratinati|gratinate', 'gratinated', { m: 'огретен', f: 'огретен', n: 'огретен', pl: 'огретен' });
  a('proaspat|proaspata|proaspeti|proaspete', 'fresh', { m: 'пресен', f: 'прясна', n: 'прясно', pl: 'пресни' });
  a('de casa', 'homemade', { m: 'домашен', f: 'домашна', n: 'домашно', pl: 'домашни' });
  a('taranesc|taraneasca|taranesti', 'country-style', { m: 'селски', f: 'селска', n: 'селско', pl: 'селски' });

  // ---- moduri de gătit puse DUPĂ substantiv în RO („pui la cuptor"): EN prefix, BG sufix ----
  var S = {};
  function s(ro, en, bg) { ro.split('|').forEach(function (k) { S[norm(k)] = { en: en, bg: bg }; }); }
  s('la cuptor|la cuptor cu lemne', 'oven-baked', 'на фурна');
  s('la gratar|la grill|pe gratar|pe grill|gril|grill', 'grilled', 'на скара');
  s('la tigaie|la tava', 'pan-fried', 'на тиган');
  s('pane', 'breaded', 'пане');
  s('la abur|la aburi', 'steamed', 'на пара');
  s('in sos de rosii', 'in tomato sauce', 'в доматен сос');
  s('in sos de smantana', 'in sour-cream sauce', 'в сметанов сос');
  s('in sos de ciuperci', 'in mushroom sauce', 'в гъбен сос');
  s('in sos de usturoi', 'in garlic sauce', 'в чеснов сос');
  s('cu mujdei', 'with garlic sauce', 'с чеснов сос'); // ca sufix de stil, doar când nu s-a putut despărți cu „cu"

  // în bulgară „с" devine „със" înaintea cuvintelor care încep cu с/з
  function bgCu(urmator) { return /^[сз]/i.test(urmator) ? 'със' : 'с'; }

  // ---- traducerea unei bucăți (fără „cu" / „și") ----
  function bucata(ro) {
    var k = norm(ro);
    if (!k) return null;
    if (G[k]) return { en: G[k].en, bg: G[k].bg };
    var cuv = k.split(' ');
    // 1) substantiv + mod de gătit la sfârșit: „pui la cuptor", „peste prajit" (adjectiv)
    for (var n = Math.min(4, cuv.length - 1); n >= 1; n--) {
      var coada = cuv.slice(cuv.length - n).join(' '), capul = cuv.slice(0, cuv.length - n).join(' ');
      var cap_ = G[capul];
      if (!cap_ || / (?:cu|si) /.test(capul)) continue; // o frază compusă („varză călită cu ciolan") nu primește adjective în coadă
      if (S[coada]) return { en: /^(in|with) /.test(S[coada].en) ? cap_.en + ' ' + S[coada].en : S[coada].en + ' ' + cap_.en, bg: cap_.bg + ' ' + S[coada].bg };
      if (A[coada]) return { en: A[coada].en + ' ' + cap_.en, bg: (A[coada].bg[cap_.g] || A[coada].bg.m) + ' ' + cap_.bg };
    }
    // 2) adjectiv înainte („afumat ciolan" e rar în română; „mica" listă de prefixe)
    for (var p = 1; p <= 2 && p < cuv.length; p++) {
      var pref = cuv.slice(0, p).join(' '), rest = cuv.slice(p).join(' ');
      if (A[pref] && G[rest]) return { en: A[pref].en + ' ' + G[rest].en, bg: (A[pref].bg[G[rest].g] || A[pref].bg.m) + ' ' + G[rest].bg };
    }
    return null;
  }

  // ---- un preparat întreg: „X cu Y și Z", „X, Y" ----
  function preparat(ro) {
    var k = norm(ro);
    if (!k) return null;
    var direct = bucata(k);
    if (direct) return { en: cap(direct.en), bg: cap(direct.bg) };
    var m = /^(.+?) (?:cu|si|,) (.+)$/.exec(k.replace(/,\s*/g, ' , ').replace(/\s+/g, ' '));
    if (!m) return null;
    var capul = bucata(m[1]);
    if (!capul) return null;
    var parti = m[2].split(/ (?:si|,) /).map(function (x) { return bucata(x); });
    if (parti.some(function (x) { return !x; })) return null;
    var legatura = /^(.+?) cu /.test(k) ? 'cu' : 'si';
    var en = capul.en + (legatura === 'cu' ? ' with ' : ' and ') + parti.map(function (x) { return x.en; }).join(' and ');
    var bg = capul.bg + ' ' + (legatura === 'cu' ? bgCu(parti[0].bg) : 'и') + ' ' + parti.map(function (x) { return x.bg; }).join(' и ');
    return { en: cap(en), bg: cap(bg) };
  }

  // ---- lista: întoarce { en: [..|null], bg: [..|null], complet: { en, bg }, netraduse: [...] } ----
  function traduceMeniu(nume) {
    var lista = Array.isArray(nume) ? nume : [];
    var en = [], bg = [], netraduse = [];
    lista.forEach(function (x) {
      var n = typeof x === 'string' ? x : (x && x.nume) || '';
      var t = preparat(n);
      en.push(t ? t.en : null); bg.push(t ? t.bg : null);
      if (!t) netraduse.push(n);
    });
    return { en: en, bg: bg, complet: { en: en.every(Boolean) && en.length > 0, bg: bg.every(Boolean) && bg.length > 0 }, netraduse: netraduse };
  }

  var api = { norm: norm, bucata: bucata, preparat: preparat, traduceMeniu: traduceMeniu, _glosar: G, _adjective: A, _stiluri: S };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GlosarMeniu = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
