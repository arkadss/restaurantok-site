#!/usr/bin/env node
// Testează orca/install.sh împotriva unui API n8n SIMULAT (M7): un server HTTP local care imită /api/v1/workflows și /api/v1/credentials.
//   node tests/install-orca.test.js
// Verifică: refuz fără cheie (401), crearea celor 9 credențiale placeholder, importul tuturor workflow-urilor cu id-urile de credențiale
// înlocuite și câmpurile neacceptate scoase, idempotența (a doua rulare face PUT, nu POST, și nu recreează credențiale),
// modul --simulare (nicio scriere) și eroarea la URL greșit.
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const N8N_DIR = path.join(ROOT, 'n8n');
const SCRIPT = path.join(ROOT, 'orca', 'install.sh');
const CHEIE = 'cheie-de-test-123';
let teste = 0, esuate = 0;
function ok(cond, msg) { teste++; if (cond) console.log('  ✓ ' + msg); else { esuate++; console.log('  ✗ ' + msg); } }

// ---- serverul simulat ----
const stare = { credentiale: [], workflowuri: [], cereri: [] };
let idCred = 100, idWf = 200;
const PERMISE_WF = new Set(['name', 'nodes', 'connections', 'settings', 'staticData']);
const PERMISE_SETARI = new Set(['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']);
function raspunde(res, cod, obj) { res.writeHead(cod, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
const server = http.createServer((req, res) => {
  let corp = '';
  req.on('data', d => { corp += d; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    stare.cereri.push(req.method + ' ' + u.pathname);
    if (req.headers['x-n8n-api-key'] !== CHEIE) return raspunde(res, 401, { message: "'X-N8N-API-KEY' header required" });
    let j = null; if (corp) { try { j = JSON.parse(corp); } catch (e) { return raspunde(res, 400, { message: 'JSON invalid' }); } }
    if (req.method === 'GET' && u.pathname === '/api/v1/workflows') {
      // paginare: 1 pe pagină, ca să testăm cursorul
      const toate = stare.workflowuri; const start = Number(u.searchParams.get('cursor') || 0);
      const pagina = toate.slice(start, start + 1);
      return raspunde(res, 200, { data: pagina, nextCursor: start + 1 < toate.length ? String(start + 1) : null });
    }
    if (req.method === 'POST' && u.pathname === '/api/v1/credentials') {
      if (!j || !j.name || !j.type || typeof j.data !== 'object') return raspunde(res, 400, { message: 'request/body must have required property' });
      const c = { id: String(++idCred), name: j.name, type: j.type, data: j.data };
      stare.credentiale.push(c); return raspunde(res, 200, { id: c.id, name: c.name, type: c.type, createdAt: new Date().toISOString() });
    }
    const m = u.pathname.match(/^\/api\/v1\/workflows(?:\/(\w+))?$/);
    if (m && (req.method === 'POST' || req.method === 'PUT')) {
      if (!j) return raspunde(res, 400, { message: 'corp lipsă' });
      for (const k of Object.keys(j)) if (!PERMISE_WF.has(k)) return raspunde(res, 400, { message: `request/body must NOT have additional properties: ${k}` });
      for (const k of Object.keys(j.settings || {})) if (!PERMISE_SETARI.has(k)) return raspunde(res, 400, { message: `request/body/settings must NOT have additional properties: ${k}` });
      for (const k of ['name', 'nodes', 'connections', 'settings']) if (!(k in j)) return raspunde(res, 400, { message: `request/body must have required property '${k}'` });
      for (const n of j.nodes) for (const [tip, c] of Object.entries(n.credentials || {})) {
        if (!stare.credentiale.some(x => x.id === String(c.id))) return raspunde(res, 400, { message: `credential ${c.id} (${tip}) does not exist` });
      }
      if (req.method === 'PUT') {
        const w = stare.workflowuri.find(x => x.id === m[1]); if (!w) return raspunde(res, 404, { message: 'not found' });
        Object.assign(w, j, { updatedAt: new Date().toISOString() }); return raspunde(res, 200, w);
      }
      const w = Object.assign({ id: String(++idWf), active: false, createdAt: new Date().toISOString() }, j);
      stare.workflowuri.push(w); return raspunde(res, 200, w);
    }
    raspunde(res, 404, { message: 'ruta necunoscută ' + req.method + ' ' + u.pathname });
  });
});

// serverul simulat rulează în același proces, deci scriptul se pornește asincron (spawnSync ar bloca bucla de evenimente și serverul nu ar mai răspunde)
function ruleaza(args, env) {
  return new Promise(resolve => {
    const p = spawn('bash', [SCRIPT].concat(args || []), { env: Object.assign({}, process.env, env || {}) });
    let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    const t = setTimeout(() => { p.kill(); out += '\n[timeout]'; }, 60000);
    p.on('close', cod => { clearTimeout(t); resolve({ cod, out }); });
  });
}

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const URL_N8N = `http://127.0.0.1:${port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ok-install-'));
  const STARE = path.join(tmp, 'instalat.json');
  const fisiere = fs.readdirSync(N8N_DIR).filter(f => f.endsWith('.json'));
  const nrCredentiale = 9;

  console.log('install.sh: pregătire');
  ok(fs.existsSync(SCRIPT), 'orca/install.sh există');
  ok(spawnSync('bash', ['-n', SCRIPT]).status === 0, 'bash -n: sintaxă validă');

  console.log('install.sh: fără cheie / cheie greșită');
  let r = await ruleaza([], { N8N_URL: URL_N8N, N8N_API_KEY: 'gresita', STARE });
  ok(r.cod !== 0 && /401/.test(r.out) && /Settings → n8n API/.test(r.out), 'cheie greșită → oprire cu 401 și indicație');
  r = await ruleaza([], { N8N_URL: URL_N8N, N8N_API_KEY: '<<TODO>>', STARE });
  ok(r.cod !== 0 && /placeholder/.test(r.out), 'cheie placeholder → refuz');
  r = await ruleaza([], { N8N_URL: 'http://127.0.0.1:9', N8N_API_KEY: CHEIE, STARE });
  ok(r.cod !== 0 && /Nu ajung la/.test(r.out), 'URL greșit → mesaj clar, fără stack trace');
  ok(stare.credentiale.length === 0 && stare.workflowuri.length === 0, 'nimic scris în n8n până aici');

  console.log('install.sh: --simulare');
  r = await ruleaza(['--simulare'], { N8N_URL: URL_N8N, N8N_API_KEY: CHEIE, STARE });
  ok(r.cod === 0, 'simularea iese cu 0');
  ok(stare.credentiale.length === 0 && stare.workflowuri.length === 0 && !fs.existsSync(STARE), 'simularea nu scrie nimic (nici în n8n, nici fișierul de stare)');
  ok((r.out.match(/ar crea/g) || []).length === nrCredentiale && (r.out.match(/ar face POST/g) || []).length === fisiere.length, `simularea anunță ${nrCredentiale} credențiale și ${fisiere.length} workflow-uri`);

  console.log('install.sh: import complet');
  stare.cereri.length = 0;
  r = await ruleaza([], { N8N_URL: URL_N8N, N8N_API_KEY: CHEIE, STARE });
  ok(r.cod === 0, 'importul iese cu 0\n' + (r.cod === 0 ? '' : r.out));
  ok(stare.credentiale.length === nrCredentiale, `${nrCredentiale} credențiale create`);
  ok(stare.credentiale.every(c => JSON.stringify(c.data).includes('TODO')), 'toate credențialele au doar valori placeholder');
  ok(stare.workflowuri.length === fisiere.length, `${fisiere.length} workflow-uri importate`);
  ok(stare.workflowuri.every(w => w.active === false), 'workflow-urile rămân inactive');
  const toateNodurile = stare.workflowuri.flatMap(w => w.nodes);
  const refs = toateNodurile.flatMap(n => Object.values(n.credentials || {}));
  ok(refs.length > 0 && refs.every(c => !String(c.id).includes('TODO') && stare.credentiale.some(x => x.id === c.id && x.name === c.name)), `toate referințele la credențiale (${refs.length}) au id real și numele potrivit`);
  ok(stare.workflowuri.every(w => !('pinData' in w) && !('tags' in w) && !('meta' in w) && !('callerPolicy' in w.settings)), 'câmpurile neacceptate de API (pinData, tags, meta, settings.callerPolicy) au fost scoase');
  ok(stare.workflowuri.every(w => w.settings.timezone === 'Europe/Bucharest' && w.settings.executionOrder === 'v1'), 'setările păstrate: timezone, executionOrder');
  const siteCerere = stare.workflowuri.find(w => /cereri de pe site/.test(w.name));
  ok(siteCerere && siteCerere.nodes.some(n => n.type === 'n8n-nodes-base.webhook' && n.parameters.path === 'site-cerere'), 'webhook-ul site-cerere este în workflow-ul importat');
  ok(fs.existsSync(STARE) && Object.keys(JSON.parse(fs.readFileSync(STARE, 'utf8')).credentiale).length === nrCredentiale, `fișierul de stare are cele ${nrCredentiale} credențiale`);
  ok(/Urmează/.test(r.out) && /Config/.test(r.out) && /WEBHOOK_URL/.test(r.out), 'afișează pașii următori (Config, WEBHOOK_URL)');

  console.log('install.sh: a doua rulare (idempotență)');
  stare.cereri.length = 0;
  r = await ruleaza([], { N8N_URL: URL_N8N, N8N_API_KEY: CHEIE, STARE });
  ok(r.cod === 0, 'a doua rulare iese cu 0');
  ok(stare.credentiale.length === nrCredentiale, 'nu recreează credențiale');
  ok(stare.workflowuri.length === fisiere.length && stare.cereri.filter(c => c.startsWith('PUT')).length === fisiere.length && !stare.cereri.some(c => c === 'POST /api/v1/workflows'), 'actualizează prin PUT, fără duplicate');

  console.log('install.sh: fără fișierul de stare (id-urile se iau din workflow-urile existente)');
  fs.unlinkSync(STARE);
  r = await ruleaza(['--fara-credentiale', 'site-cerere.json'], { N8N_URL: URL_N8N, N8N_API_KEY: CHEIE, STARE });
  ok(r.cod === 0 && stare.credentiale.length === nrCredentiale && /actualizat „OK · cereri de pe site/.test(r.out), 'un singur workflow, PUT, credențialele regăsite din n8n');
  r = await ruleaza(['inexistent.json'], { N8N_URL: URL_N8N, N8N_API_KEY: CHEIE, STARE });
  ok(r.cod !== 0 && /Niciun workflow/.test(r.out), 'fișier inexistent → eroare clară');

  fs.rmSync(tmp, { recursive: true, force: true });
  server.close();
  console.log(esuate ? `\n✗ ${esuate}/${teste} verificări eșuate` : `\n✓ ${teste} verificări trecute`);
  process.exit(esuate ? 1 : 0);
});
