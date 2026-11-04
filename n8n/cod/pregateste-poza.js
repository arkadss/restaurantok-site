// Nod Code „Pregătește poza-model" (workflow site-cerere, M4). Rulează în n8n (sandbox: fără require; Buffer și this.helpers sunt disponibile).
// Intrare: item-ul de la „Validează cererea" (are_poza = true): poza_base64, poza_nume, poza_tip, id.
// Ieșire: un item cu proprietatea binară `poza` (pentru Telegram sendPhoto și pentru scrierea pe disc) + json { id, nume_fisier, legenda }.
const v = $('Validează cererea').first().json;
if (!v.are_poza || !v.poza_base64) return [];
const buffer = Buffer.from(v.poza_base64, 'base64');
const numeFisier = v.poza_nume || `${v.id}-model.jpg`;
const binar = await this.helpers.prepareBinaryData(buffer, numeFisier, v.poza_tip || 'image/jpeg');
const c = v.cerere || {};
const legenda = `Model tort · ${v.id}\n${c.detalii && c.detalii.tort_text ? c.detalii.tort_text + ' · ' : ''}${c.persoane ? c.persoane + ' persoane · ' : ''}${c.data_eveniment || ''}\n${c.nume || ''} · ${c.telefon || ''}`;
return [{ json: { id: v.id, nume_fisier: numeFisier, marime: buffer.length, legenda }, binary: { poza: binar } }];
