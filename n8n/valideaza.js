#!/usr/bin/env node
// Validare structurală a workflow-urilor exportate (ce verifică și importul n8n înainte de a le accepta):
//   node n8n/valideaza.js [fișier.json ...]      (implicit: toate n8n/*.json)
// - JSON valid, cu `name`, `nodes` (listă) și `connections` (obiect)
// - fiecare nod are name unic, type, typeVersion numeric, position [x, y], parameters obiect
// - toate legăturile pornesc și ajung în noduri existente; niciun nod (în afară de trigger-e) nu rămâne fără intrare
// - codul din nodurile Code se compilează (new Function) și nu conține secrete evidente
// - plasările de credențiale sunt placeholder-e, nu valori reale
'use strict';
const fs = require('fs');
const path = require('path');

const fisiere = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(__dirname).filter(f => f.endsWith('.json')).map(f => path.join(__dirname, f));
let probleme = 0;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor; // n8n rulează codul nodurilor Code într-o funcție async (await e permis)
const rau = (f, m) => { probleme++; console.log(`  ✗ ${path.basename(f)}: ${m}`); };

for (const f of fisiere) {
  let w;
  try { w = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { rau(f, 'JSON invalid: ' + e.message); continue; }
  if (!w.name || !Array.isArray(w.nodes) || typeof w.connections !== 'object') { rau(f, 'lipsesc name / nodes / connections'); continue; }
  const nume = new Set();
  const triggere = new Set();
  for (const n of w.nodes) {
    if (!n.name || nume.has(n.name)) rau(f, `nod fără nume sau cu nume dublat: ${n.name}`);
    nume.add(n.name);
    if (typeof n.type !== 'string' || !/^n8n-nodes-base\./.test(n.type)) rau(f, `${n.name}: type lipsă sau neașteptat (${n.type})`);
    if (typeof n.typeVersion !== 'number') rau(f, `${n.name}: typeVersion lipsă`);
    if (!Array.isArray(n.position) || n.position.length !== 2) rau(f, `${n.name}: position lipsă`);
    if (typeof n.parameters !== 'object') rau(f, `${n.name}: parameters lipsă`);
    if (/trigger/i.test(n.type) || n.type === 'n8n-nodes-base.webhook') triggere.add(n.name); // nodul Webhook este și el un punct de pornire
    if (n.type === 'n8n-nodes-base.code') {
      try { new AsyncFunction('$', '$input', '$json', 'Buffer', n.parameters.jsCode); } catch (e) { rau(f, `${n.name}: codul nu se compilează: ${e.message}`); }
      if (/ghp_[A-Za-z0-9]{20,}|\b\d{9,10}:[A-Za-z0-9_-]{30,}\b/.test(n.parameters.jsCode)) rau(f, `${n.name}: pare să conțină un token`);
    }
    for (const [tip, c] of Object.entries(n.credentials || {})) {
      if (!/<<TODO/.test(c.id || '')) rau(f, `${n.name}: credențiala ${tip} nu este placeholder`);
    }
  }
  const cuIntrare = new Set();
  for (const [de, m] of Object.entries(w.connections)) {
    if (!nume.has(de)) rau(f, `legătură dintr-un nod inexistent: ${de}`);
    for (const iesire of (m.main || [])) for (const l of iesire) {
      if (!nume.has(l.node)) rau(f, `legătură către un nod inexistent: ${de} → ${l.node}`);
      cuIntrare.add(l.node);
    }
  }
  for (const n of nume) if (!triggere.has(n) && !cuIntrare.has(n)) rau(f, `nodul „${n}" nu are nicio intrare`);
  if (!triggere.size) rau(f, 'niciun trigger');
  const s = JSON.stringify(w);
  if (/ghp_[A-Za-z0-9]{20,}|\b\d{9,10}:[A-Za-z0-9_-]{30,}\b/.test(s)) rau(f, 'fișierul pare să conțină un token');
  console.log(`  ${probleme ? '·' : '✓'} ${path.basename(f)}: ${w.nodes.length} noduri, ${triggere.size} trigger(e), ${Object.keys(w.connections).length} noduri cu ieșiri`);
}
console.log(probleme ? `✗ ${probleme} probleme` : '✓ toate workflow-urile sunt structural valide');
process.exit(probleme ? 1 : 0);
