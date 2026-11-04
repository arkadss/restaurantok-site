// Nodul Code „Interpretează mesajul" (n8n). Primește fie update-ul de la Telegram Trigger, fie
// item-ul de la „Trigger 16:00" (fără `message`) și întoarce un singur item:
//   { actiune: 'meniu' | 'poza' | 'gata' | 'alergeni' | 'traducere' | 'editare' | 'ajutor', sursa, chat_id, text, meniu?, file_id?, index?, alergeni?, limba?, traducere?, editare?, fisier?, ajutor_editare?, eroare? }
// Parserul (ParsareMeniu) este inserat mai jos de n8n/genereaza.js din n8n/cod/parseaza-meniu.js.
const ParsareMeniu = (function () { const module = { exports: {} };
/*__PARSER__*/
return module.exports; })();
// Editarea conținutului prin Telegram (M8): program, zile închise, meniul săptămânii, torturi, catering (n8n/cod/editare.js).
const Editare = (function () { const module = { exports: {} };
/*__EDITARE__*/
return module.exports; })();

const cfg = $('Config').first().json;
const item = $input.first().json || {};
const msg = item.message || null;
const acum = new Date();
const out = { actiune: 'gata', sursa: 'program', chat_id: String(cfg.telegram_chat_id || ''), text: '' };

if (msg) {
  out.sursa = 'telegram';
  out.chat_id = String(msg.chat && msg.chat.id);
  const text = String(msg.text || msg.caption || '').trim();
  out.text = text;
  let m;
  if (Array.isArray(msg.photo) && msg.photo.length) {
    out.actiune = 'poza';
    out.file_id = msg.photo[msg.photo.length - 1].file_id; // cea mai mare variantă trimisă de Telegram
    out.media_group_id = msg.media_group_id || null;
  } else if (msg.document && /^image\//.test(msg.document.mime_type || '')) {
    out.actiune = 'poza';
    out.file_id = msg.document.file_id;
  } else if (/^\/?(gata|inchide|închide|stop|terminat|s-a terminat)\b/i.test(text)) {
    out.actiune = 'gata';
  } else if ((m = /^\/?alergeni\s+(\d)\s*[:\-]\s*(.*)$/i.exec(text))) {
    out.actiune = 'alergeni';
    out.index = parseInt(m[1], 10) - 1;
    out.alergeni = ParsareMeniu.alergeniExpliciti(m[2]);
  } else if ((m = /^\/?(en|bg)\s+(\d)\s*[:\-]\s*(.+)$/i.exec(text))) { // „en 2: Fried carp with polenta" corectează traducerea preparatului 2 (M8)
    out.actiune = 'traducere';
    out.limba = m[1].toLowerCase();
    out.index = parseInt(m[2], 10) - 1;
    out.traducere = m[3].trim();
  } else if (/^\/?(editare|ajutor editare|editare ajutor|comenzi)\s*$/i.test(text)) { // ajutorul pentru comenzile de editare (M8)
    out.actiune = 'ajutor';
    out.ajutor_editare = true;
  } else if (!text || text === '?' || /^\/(start|help|ajutor|meniu|status)\b/i.test(text)) {
    out.actiune = 'ajutor';
  } else if ((m = Editare.interpreteaza(text, acum, { fus: cfg.fus_orar || 'Europe/Bucharest' }))) { // comandă de editare (M8): „închis 25.12", „program cofetărie: …", „tort diplomat: …"
    if (m.tip === 'eroare') { out.actiune = 'ajutor'; out.ajutor_editare = true; out.eroare = m.eroare; }
    else { out.actiune = 'editare'; out.editare = m; out.fisier = m.fisier; }
  } else {
    const meniu = ParsareMeniu.parseazaMeniu(text, acum, {
      pret_implicit: Number(cfg.pret_implicit) || 24,
      ora_inchidere: cfg.ora_inchidere || '16:00',
      fus: cfg.fus_orar || 'Europe/Bucharest'
    });
    if (meniu.eroare) { out.actiune = 'ajutor'; out.eroare = meniu.eroare; }
    else {
      meniu.text_facebook = ParsareMeniu.textFacebook(meniu, cfg.telefon_afisat || '');
      out.actiune = 'meniu';
      out.meniu = meniu;
    }
  }
}
return [{ json: out }];
