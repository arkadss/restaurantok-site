// Nod Code „Calculează disponibilitatea" (workflow sala-disponibilitate, M2). Rulează în n8n (sandbox: fără require).
// Intrare: toate evenimentele din calendarul Google „Sala de bal OK" pentru următoarele `orizont_zile` zile
//   (nodul Google Calendar, getAll, singleEvents) — câte un item per eveniment; sau niciun item când calendarul e gol.
// Ieșire (un singur item): continut (JSON-ul pentru data/sala-disponibilitate.json), commit (mesajul), ocupate, partiale
// Reguli:
//   - eveniment de o zi întreagă (start.date) → zi „ocupat"
//   - eveniment cu ore: durata ≥ Config.ore_ocupat (implicit 6) → „ocupat"; altfel „parțial" cu nota „ocupat HH:MM–HH:MM"
//   - un eveniment care trece peste miezul nopții ocupă fiecare zi atinsă
//   - evenimentele anulate (status cancelled) și cele „liber" (transparency transparent) se ignoră
//   - titlul NU ajunge pe site (ar fi numele clienților): JSON-ul conține doar date și note generice
const cfg = $('Config').first().json;
const FUS = cfg.fus_orar || 'Europe/Bucharest';
const ORE_OCUPAT = Number(cfg.ore_ocupat) > 0 ? Number(cfg.ore_ocupat) : 6;
const ORIZONT = Number(cfg.orizont_zile) > 0 ? Number(cfg.orizont_zile) : 365;

function parti(d) { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: FUS, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset' }).formatToParts(d).forEach(x => { p[x.type] = x.value; }); return p; }
function ziLocala(d) { const p = parti(d); return `${p.year}-${p.month}-${p.day}`; }
function oraLocala(d) { const p = parti(d); return `${p.hour}:${p.minute}`; }
function acumIso() { const p = parti(new Date()); const off = (p.timeZoneName || '').replace('GMT', ''); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${/^[+-]\d{2}:\d{2}$/.test(off) ? off : '+00:00'}`; }
function ziPlus(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

const azi = ziLocala(new Date());
const ultima = ziPlus(azi, ORIZONT);
const ocupat = new Set();
const partial = {}; // zi → [note]

for (const item of $input.all()) {
  const e = item.json || {};
  if (!e.start || e.status === 'cancelled' || e.transparency === 'transparent') continue;
  if (e.start.date) { // toată ziua (end.date este exclusiv)
    let z = e.start.date; const sfarsit = (e.end && e.end.date) || ziPlus(z, 1);
    for (let i = 0; z < sfarsit && i < 60; i++, z = ziPlus(z, 1)) if (z >= azi && z <= ultima) ocupat.add(z);
    continue;
  }
  const a = new Date(e.start.dateTime), b = new Date((e.end && e.end.dateTime) || e.start.dateTime);
  if (isNaN(a) || isNaN(b)) continue;
  const ore = (b - a) / 36e5;
  const ziA = ziLocala(a), ziB = ziLocala(new Date(b.getTime() - 1));
  if (ore >= ORE_OCUPAT) {
    for (let z = ziA, i = 0; z <= ziB && i < 60; i++, z = ziPlus(z, 1)) if (z >= azi && z <= ultima) ocupat.add(z);
  } else {
    for (let z = ziA, i = 0; z <= ziB && i < 60; i++, z = ziPlus(z, 1)) {
      if (z < azi || z > ultima) continue;
      const nota = z === ziA && z === ziB ? `ocupat ${oraLocala(a)}–${oraLocala(b)}` : z === ziA ? `ocupat de la ${oraLocala(a)}` : `ocupat până la ${oraLocala(b)}`;
      (partial[z] = partial[z] || []).push(nota);
    }
  }
}
for (const z of ocupat) delete partial[z];

const json = {
  actualizat: acumIso(), fus_orar: FUS, orizont_zile: ORIZONT, sursa: 'Google Calendar „Sala de bal OK"',
  ocupat: [...ocupat].sort(),
  partial: Object.keys(partial).sort().map(z => ({ data: z, nota: partial[z].join('; ') }))
};
return [{ json: {
  continut: JSON.stringify(json, null, 2) + '\n',
  commit: `data: sala-disponibilitate.json ${azi}`,
  ocupate: json.ocupat.length, partiale: json.partial.length,
  rezumat: `Calendarul sălii: ${json.ocupat.length} zile ocupate, ${json.partial.length} parțial, orizont ${ORIZONT} zile.`
} }];
