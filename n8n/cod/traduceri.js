// Nodul Code „Traduceri" (n8n, M8). Rulează doar pe ramura „meniu", după nodurile opționale „DeepL EN" / „DeepL BG".
// Citește modul din Config.traducere: 'deepl' (DeepL, cu glosarul ca rezervă), 'glosar' (implicit: doar glosarul local,
// fără internet) sau 'nu' (fără traduceri). Întoarce un singur item:
//   { traduceri: { en: { preparate: [..] }, bg: { preparate: [..] } } | null, sursa: { en: 'deepl'|'glosar'|'mixt'|null, bg: ... }, netraduse: [...] }
// Un preparat necunoscut rămâne null în listă: site-ul îi arată numele în română. Nimic nu se inventează.
// Glosarul (GlosarMeniu) este inserat mai jos de n8n/genereaza.js din n8n/cod/glosar-meniu.js.
const GlosarMeniu = (function () { const module = { exports: {} };
/*__GLOSAR__*/
return module.exports; })();

const cfg = $('Config').first().json;
const cmd = $('Interpretează mesajul').first().json;
const mod = String(cfg.traducere || 'glosar').trim().toLowerCase();
const nume = (cmd.meniu && Array.isArray(cmd.meniu.preparate) ? cmd.meniu.preparate : []).map(p => (p && p.nume) || '');

if (mod === 'nu' || !nume.length) return [{ json: { traduceri: null, sursa: { en: null, bg: null }, netraduse: [] } }];

// răspunsul DeepL: { translations: [ { detected_source_language, text }, ... ] } în aceeași ordine cu textele trimise
function dinDeepl(numeNod) {
  try {
    const j = $(numeNod).first().json;
    const t = j && Array.isArray(j.translations) ? j.translations : null;
    if (!t || t.length !== nume.length) return null;
    const out = t.map(x => (x && typeof x.text === 'string' && x.text.trim()) ? x.text.trim() : null);
    return out.some(Boolean) ? out : null;
  } catch (e) { return null; } // nodul nu a rulat (modul nu e 'deepl') sau a dat eroare → rezerva este glosarul
}

const glosar = GlosarMeniu.traduceMeniu(nume);
const rezultat = { en: null, bg: null }, sursa = { en: null, bg: null };
for (const l of ['en', 'bg']) {
  const deepl = mod === 'deepl' ? dinDeepl(l === 'en' ? 'DeepL EN' : 'DeepL BG') : null;
  const lista = nume.map((_, i) => (deepl && deepl[i]) || glosar[l][i] || null);
  if (!lista.some(Boolean)) continue;
  rezultat[l] = { preparate: lista };
  sursa[l] = deepl ? (lista.every((x, i) => deepl[i]) ? 'deepl' : 'mixt') : 'glosar';
}
const netraduse = nume.filter((_, i) => !((rezultat.en && rezultat.en.preparate[i]) && (rezultat.bg && rezultat.bg.preparate[i])));
const traduceri = (rezultat.en || rezultat.bg) ? Object.assign({}, rezultat.en ? { en: rezultat.en } : {}, rezultat.bg ? { bg: rezultat.bg } : {}) : null;
return [{ json: { traduceri, sursa, netraduse } }];
