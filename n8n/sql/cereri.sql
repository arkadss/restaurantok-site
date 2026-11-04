-- Tabelul `cereri`: log-ul cererilor venite prin formularele site-ului (webhook-ul site-cerere, M2).
-- Se rulează o singură dată în Postgres-ul lui n8n de pe orca (la M7, cu Sorin):
--   docker exec -i <container-postgres> psql -U <utilizator> -d <baza> < n8n/sql/cereri.sql
-- Coloanele trebuie să rămână identice cu obiectul `rand` din n8n/cod/valideaza-cerere.js (nodul Postgres mapează automat după nume).
CREATE TABLE IF NOT EXISTS cereri (
  id             text PRIMARY KEY,          -- ex. sala-20261021-k3f9 (apare și în confirmarea trimisă clientului)
  tip            text NOT NULL,             -- sala | catering | tort | rezervare
  nume           text NOT NULL,
  telefon        text NOT NULL,
  email          text,
  data_eveniment date,
  persoane       integer,
  mesaj          text,
  detalii        jsonb,                     -- câmpurile specifice tipului (ex. tip_eveniment)
  pagina         text,                      -- pagina de pe care a venit cererea
  ip             text,                      -- CF-Connecting-IP, pentru rate limit manual dacă e nevoie
  user_agent     text,
  creat          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cereri_creat_idx ON cereri (creat DESC);
CREATE INDEX IF NOT EXISTS cereri_tip_data_idx ON cereri (tip, data_eveniment);
-- Datele personale se păstrează doar cât e nevoie ca să răspundem; curățare după 2 ani (politica de confidențialitate):
--   DELETE FROM cereri WHERE creat < now() - interval '2 years';
