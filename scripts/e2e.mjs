#!/usr/bin/env node
// Browser smoke test: loads the site, passes a lab with its solution, runs the playground.
// Needs Playwright plus local copies of Pyodide and CodeMirror 5 (npm i pyodide@0.26.4 codemirror@5.65.16):
//   PYODIDE_DIR=.../node_modules/pyodide CM_DIR=.../node_modules/codemirror node scripts/e2e.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { LESSONS } from '../js/content/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { PYODIDE_DIR, CM_DIR } = process.env;
if (!PYODIDE_DIR || !CM_DIR) { console.error('Set PYODIDE_DIR and CM_DIR'); process.exit(2); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.json': 'application/json', '.py': 'text/plain', '.zip': 'application/zip' };

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = p.startsWith('/pyodide/') ? join(PYODIDE_DIR, p.slice(9)) : join(root, p === '/' ? 'index.html' : p);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/codemirror\/[^/]+\/(.*)$/, async (route) => {
  const rel = route.request().url().match(/codemirror\/[^/]+\/(.*)$/)[1].replace('.min.', '.');
  const f = rel.startsWith('codemirror.') ? join(CM_DIR, 'lib', rel) : join(CM_DIR, rel);
  try { await route.fulfill({ body: await readFile(f), contentType: TYPES[extname(f)] }); } catch { await route.abort(); }
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_FAILED/.test(m.text())) errors.push(m.text()); });

const SHOTS = process.env.SHOTS || '/tmp';
const step = (name) => console.log('•', name);
let failed = false;
const expect = (cond, msg) => { if (!cond) { failed = true; console.error('  ✗', msg); } else console.log('  ✓', msg); };

step('home renders');
await page.goto(`${base}/?pyodide=/pyodide/#/`);
await page.waitForSelector('.toc-mod');
expect((await page.locator('.toc-mod').count()) === 7, '7 modules on home');
expect((await page.locator('.nav-lesson').count()) === LESSONS.length, `${LESSONS.length} lessons in sidebar`);
await page.screenshot({ path: join(SHOTS, 'home.png') });

step('every lesson tab renders without errors');
for (const l of LESSONS) {
  for (const tab of ['learn', 'quiz', 'ship', 'practice']) {
    await page.goto(`${base}/#/l/${l.id}/${tab}`);
    await page.waitForSelector('#tabBody > *');
  }
  for (let i = 1; i < l.labs.length; i++) {
    await page.goto(`${base}/#/l/${l.id}/practice/${i}`);
    await page.waitForSelector('.answer .CodeMirror');
  }
}
expect(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);

const setCode = (code) => page.evaluate((c) => document.querySelector('.editor-host .CodeMirror').CodeMirror.setValue(c), code);
const resultText = () => page.locator('.output .res-head').innerText();
const lesson = LESSONS[0];

step('learn tab');
await page.goto(`${base}/#/l/${lesson.id}/learn`);
await page.waitForSelector('.flow');
await page.screenshot({ path: join(SHOTS, 'learn.png') });

step('study → recall → peek → pass (lab 1)');
await page.goto(`${base}/#/l/${lesson.id}/practice/0`);
await page.waitForSelector('.answer .CodeMirror');
expect((await page.locator('.notes li').count()) === lesson.labs[0].notes.length, 'study notes listed');
await page.locator('.notes li').nth(1).click();
expect((await page.locator('.answer .cm-note-focus').count()) === 1, 'clicking a note highlights its line');
await page.screenshot({ path: join(SHOTS, 'study.png') });
await page.click('#ready');
await page.waitForSelector('.editor-host .CodeMirror');
expect((await page.locator('.answer').count()) === 0, 'answer hidden in recall step');
await page.click('[data-act="test"]');
await page.locator('.output .res-head').waitFor({ timeout: 120000 });
expect(/of .* tests pass|didn't load/.test(await resultText()), 'starter fails tests');
await page.click('[data-act="run"]');
await page.waitForFunction(() => /Error/.test(document.querySelector('.output .res-head')?.innerText || ''));
expect(/NotImplementedError/.test(await page.locator('.output').innerText()), 'Run on starter explains NotImplementedError');
page.once('dialog', (d) => d.accept());
await page.click('[data-act="peek"]');
await page.waitForSelector('.answer .CodeMirror');
expect(true, 'peek returns to study view');
await page.click('#ready');
await page.waitForSelector('.editor-host .CodeMirror');
expect((await page.evaluate(() => document.querySelector('.editor-host .CodeMirror').CodeMirror.getValue())).includes('NotImplementedError'), 'peek reset code to starter');
await setCode(lesson.labs[0].solution);
await page.click('[data-act="test"]');
await page.waitForSelector('.win');
expect(/Tests pass/.test(await page.locator('.win').innerText()), 'passing after a peek is not counted as recalled');
await page.screenshot({ path: join(SHOTS, 'recall.png') });

step('clean recall (lab 2) counts as mastered');
await page.click('.win a.btn.primary');
await page.waitForSelector('.answer .CodeMirror');
await page.click('#ready');
await page.waitForSelector('.editor-host .CodeMirror');
await setCode(lesson.labs[1].solution);
await page.click('[data-act="test"]');
await page.waitForSelector('.win');
expect(/Recalled from memory/.test(await page.locator('.win').innerText()), 'no-peek pass = recalled from memory');
await page.click('[data-act="run"]');
await page.waitForFunction(() => /Output/.test(document.querySelector('.output .res-head')?.innerText || ''));
expect(/ok/.test(await page.locator('.output pre').first().innerText()), 'Run executes the demo');

step('every lab: solution passes tests AND its demo runs, inside Pyodide');
const pyResults = await page.evaluate(async () => {
  const py = await import('/js/py.js');
  const { LESSONS } = await import('/js/content/index.js');
  const out = [];
  for (const l of LESSONS) {
    for (const lab of l.labs) {
      try {
        const r = await py.runLab(lab.solution, lab.tests, 60000);
        const d = await py.runScript(lab.solution, 60000);
        const s = await py.runLab(lab.starter, lab.tests, 60000);
        out.push({ id: lab.id, ok: r.ok && d.ok && !!d.stdout.trim() && !s.ok && !s.load_error,
          err: [r.load_error, ...r.tests.filter((t) => !t.passed).map((t) => `${t.name}: ${t.error}`), d.error, s.load_error, s.ok && 'starter passes'].filter(Boolean).join('; ') });
      } catch (e) {
        out.push({ id: lab.id, ok: false, err: String(e) });
      }
    }
  }
  return out;
});
for (const r of pyResults) if (!r.ok) console.error(`    ${r.id}: ${r.err}`);
expect(pyResults.every((r) => r.ok), `${pyResults.filter((r) => r.ok).length}/${pyResults.length} labs fully working in Pyodide`);

step('progress persisted');
await page.goto(`${base}/#/`);
await page.reload();
await page.waitForSelector('.stats-line');
expect(/2<\/b>\/\d+ labs passed/.test(await page.locator('.stats-line').innerHTML()), '2 labs passed after reload');
expect(/1<\/b> recalled/.test(await page.locator('.stats-line').innerHTML()), '1 recalled with no peeks');

step('playground');
await page.goto(`${base}/#/playground`);
await page.waitForSelector('.CodeMirror');
await page.click('#pgRun');
await page.waitForFunction(() => /search done/.test(document.querySelector('.output')?.innerText || ''), null, { timeout: 30000 });
expect(true, 'async playground output');

step('light theme + mobile');
await page.click('#themeBtn');
await page.goto(`${base}/#/l/l05/learn`);
await page.waitForSelector('.flow');
await page.screenshot({ path: join(SHOTS, 'light.png') });
await page.click('#themeBtn');
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/#/l/l05/practice`);
await page.waitForSelector('.answer');
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
expect(!overflow, 'no horizontal scroll at 390px');
await page.screenshot({ path: join(SHOTS, 'mobile.png') });

expect(errors.length === 0, `no page errors overall (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
