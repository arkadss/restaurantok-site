// Nodul Code „Aplică modificarea" (n8n, M8). Intrare: rezultatul nodului GitHub „Citește fișierul de editat"
// (câmpul `content` în base64, sau o eroare dacă fișierul lipsește). Citește comanda din „Interpretează mesajul"
// (`editare`) și întoarce ce trebuie scris și ce mesaj primește Sorin:
//   { scrie, fisier, continut, commit, mesaj, chat_id }
// Logica (recunoașterea comenzii și aplicarea pe JSON) stă în n8n/cod/editare.js, inserat mai jos de n8n/genereaza.js.
const Editare = (function () { const module = { exports: {} };
/*__EDITARE__*/
return module.exports; })();

const cfg = $('Config').first().json;
const cmd = $('Interpretează mesajul').first().json;
const r = ($input.first() && $input.first().json) || {};
let existent = null;
try { if (r && r.content) existent = JSON.parse(Buffer.from(String(r.content).replace(/\n/g, ''), 'base64').toString('utf8')); } catch (e) { existent = null; }

const rez = Editare.aplica(cmd.editare, existent, new Date(), { fus: cfg.fus_orar || 'Europe/Bucharest' });
return [{ json: {
  scrie: !!rez.scrie, fisier: (cmd.editare && cmd.editare.fisier) || '',
  continut: rez.continut ? JSON.stringify(rez.continut, null, 2) + '\n' : '',
  commit: rez.commit || '', mesaj: rez.mesaj || '', chat_id: cmd.chat_id
} }];
