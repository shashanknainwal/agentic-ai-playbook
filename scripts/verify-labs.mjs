#!/usr/bin/env node
// Checks every lab with the local python3:
//   1. the worked solution passes all tests
//   2. the starter loads cleanly but fails at least one test
//   3. the solution's __main__ demo (the Run button) runs without errors
//   4. every study note points at a real line in the solution
//   5. python code blocks in lesson text compile
// Usage: node scripts/verify-labs.mjs [lessonId...]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES, LESSONS } from '../js/content/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'labs-'));
const only = process.argv.slice(2);

writeFileSync(join(dir, 'driver.py'), `
import asyncio, sys
sys.path.insert(0, ${JSON.stringify(join(root, 'js'))})
import harness
mode, code_path = sys.argv[1], sys.argv[2]
code = open(code_path).read()
if mode == "lab":
    print(asyncio.run(harness.run_lab(code, open(sys.argv[3]).read())))
elif mode == "script":
    print(asyncio.run(harness.run_script(code)))
else:
    import json
    try:
        compile(code, "block.py", "exec")
        print(json.dumps({"ok": True}))
    except SyntaxError as e:
        print(json.dumps({"ok": False, "error": str(e)}))
`);

function py(mode, code, tests = '') {
  writeFileSync(join(dir, 'code.py'), code);
  writeFileSync(join(dir, 'tests.py'), tests);
  const out = execFileSync('python3', ['-I', join(dir, 'driver.py'), mode, join(dir, 'code.py'), join(dir, 'tests.py')], {
    encoding: 'utf8', timeout: 60000,
  });
  return JSON.parse(out.trim().split('\n').pop());
}

let failures = 0;
let labs = 0;
const fail = (msg) => { failures++; console.log('   ' + msg); };
const ids = new Set();
for (const m of MODULES) if (!m.lessons.length) { console.log(`✗ module ${m.id} has no lessons`); failures++; }

for (const lesson of LESSONS) {
  if (only.length && !only.includes(lesson.id)) continue;
  for (const q of lesson.quiz || []) {
    if (!(q.answer >= 0 && q.answer < q.options.length)) { console.log(`✗ ${lesson.id} quiz answer out of range: ${q.q}`); failures++; }
  }
  for (const block of (lesson.extra || '').matchAll(/```python\n([\s\S]*?)```/g)) {
    const code = block[1].replace(/^ {6}/gm, '');
    const r = py('compile', code);
    if (!r.ok) { console.log(`✗ ${lesson.id} code block does not compile: ${r.error}`); failures++; }
  }
  for (const lab of lesson.labs || []) {
    labs++;
    const before = failures;
    if (ids.has(lab.id)) fail(`duplicate lab id ${lab.id}`);
    ids.add(lab.id);

    const sol = py('lab', lab.solution, lab.tests);
    if (!sol.ok) {
      fail(`solution fails ${sol.total - sol.passed}/${sol.total} tests`);
      if (sol.load_error) fail('load error:\n' + sol.load_error);
      for (const t of sol.tests.filter((x) => !x.passed)) fail(`- ${t.name}: ${t.error}`);
    }
    const st = py('lab', lab.starter, lab.tests);
    if (st.load_error) fail('starter does not load:\n' + st.load_error);
    else if (st.ok) fail('starter passes all tests: tests are too weak');

    const demo = py('script', lab.solution);
    if (!demo.ok) fail('solution demo (Run button) errors:\n' + demo.error);
    else if (!demo.stdout.trim()) fail('solution demo prints nothing');

    const lines = lab.solution.split('\n');
    if (!lab.notes || lab.notes.length < 3) fail(`needs at least 3 study notes (has ${lab.notes?.length || 0})`);
    for (const n of lab.notes || []) if (!lines.some((l) => l.includes(n.at))) fail(`note not found in solution: ${n.at}`);

    const mark = failures === before ? '✓' : '✗';
    console.log(`${mark} ${lab.id.padEnd(20)} solution ${sol.passed}/${sol.total} · starter ${st.passed}/${st.total} · demo ${demo.ok ? 'ok' : 'ERR'} · notes ${lab.notes?.length || 0}`);
  }
}
console.log(`\n${labs} labs checked, ${failures} problem(s).`);
process.exit(failures ? 1 : 0);
