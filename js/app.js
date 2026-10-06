import { MODULES, LESSONS, lessonById } from './content/index.js';
import { md, inline } from './md.js';
import { store } from './store.js';
import * as py from './py.js';
import { createEditor, createViewer } from './editor.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const main = $('#main');
const sidebar = $('#sidebar');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TABS = [['learn', 'Learn'], ['practice', 'Practice'], ['quiz', 'Quiz'], ['ship', 'Ship']];

// ---------- progress ----------
const labState = (id) => store.get().labs[id] || {};

function lessonProgress(lesson) {
  const s = store.get();
  const labsPassed = lesson.labs.filter((l) => labState(l.id).passed).length;
  const mastered = lesson.labs.filter((l) => labState(l.id).mastered).length;
  const quiz = s.quizzes[lesson.id];
  const quizDone = !!quiz && quiz.answered === lesson.quiz.length;
  const units = lesson.labs.length + 1;
  const doneUnits = labsPassed + (quizDone ? 1 : 0);
  const done = !!s.done[lesson.id] || doneUnits === units;
  return { labsPassed, labsTotal: lesson.labs.length, mastered, quizDone, quiz, done, started: doneUnits > 0 };
}

function courseProgress() {
  let done = 0, labsPassed = 0, labsTotal = 0, mastered = 0;
  for (const l of LESSONS) {
    const p = lessonProgress(l);
    done += p.done; labsPassed += p.labsPassed; labsTotal += p.labsTotal; mastered += p.mastered;
  }
  return { done, total: LESSONS.length, labsPassed, labsTotal, mastered };
}

const stateDot = (lesson) => {
  const p = lessonProgress(lesson);
  return `<span class="dot-state ${p.done ? 'done' : p.started ? 'partial' : ''}" aria-hidden="true"></span>`;
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- shell ----------
const openModules = new Set();
let shellModule = null;

function renderShell(route) {
  const current = route.view === 'lesson' ? lessonById(route.id) : null;
  if (current && current.module.id !== shellModule) {
    // Entering a different module: collapse the rest so the sidebar stays short.
    shellModule = current.module.id;
    openModules.clear();
    openModules.add(shellModule);
  }
  if (!openModules.size) {
    const next = LESSONS.find((l) => !lessonProgress(l).done) || LESSONS[0];
    openModules.add(next.module.id);
  }
  sidebar.innerHTML = `
    ${MODULES.map((m) => {
      const done = m.lessons.filter((l) => lessonProgress(l).done).length;
      return `
      <div class="nav-mod ${openModules.has(m.id) ? 'open' : ''}" data-mod="${m.id}">
        <button class="nav-mod-btn" aria-expanded="${openModules.has(m.id)}">
          <svg class="chev" viewBox="0 0 16 16" fill="currentColor"><path d="M6 3l5 5-5 5z"/></svg>
          <span class="name">${esc(m.title)}</span><span class="count">${done}/${m.lessons.length}</span>
        </button>
        <div class="nav-lessons">
          ${m.lessons.map((l) => `<a class="nav-lesson ${current?.id === l.id ? 'active' : ''}" href="#/l/${l.id}">${stateDot(l)}<span>${l.num}. ${esc(l.title)}</span></a>`).join('')}
        </div>
      </div>`;
    }).join('')}
    <div class="nav-foot">
      <a href="#/playground" class="${route.view === 'playground' ? 'active' : ''}">Playground</a>
      <a href="#/progress" class="${route.view === 'progress' ? 'active' : ''}">Progress & backup</a>
    </div>`;
  $$('.nav-mod-btn', sidebar).forEach((b) => b.addEventListener('click', () => {
    const mod = b.parentElement;
    const id = mod.dataset.mod;
    openModules.has(id) ? openModules.delete(id) : openModules.add(id);
    mod.classList.toggle('open');
    b.setAttribute('aria-expanded', mod.classList.contains('open'));
  }));
  const cp = courseProgress();
  $('#topProgress').innerHTML = `<span>${cp.done} of ${cp.total} lessons</span><div class="bar"><span style="width:${(cp.done / cp.total) * 100}%"></span></div>`;
}

const themeBtn = $('#themeBtn');
const paintTheme = () => {
  const dark = (document.documentElement.dataset.theme || 'dark') === 'dark';
  themeBtn.textContent = dark ? '☀' : '☾';
  themeBtn.title = dark ? 'Light theme' : 'Dark theme';
};
paintTheme();
themeBtn.addEventListener('click', () => {
  const next = (document.documentElement.dataset.theme || 'dark') === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.update((s) => { s.theme = next; });
  paintTheme();
});
const closeNav = () => document.body.classList.remove('nav-open');
$('#menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
$('#scrim').addEventListener('click', closeNav);
sidebar.addEventListener('click', (e) => { if (e.target.closest('a')) closeNav(); });

// Python status shows inside editor toolbars only.
const PY_LABEL = { idle: 'Python', loading: 'Loading Python…', ready: 'Python ready', busy: 'Running…', error: 'Python failed to load' };
py.onStatus((s) => $$('.py-state').forEach((el) => {
  el.className = `py-state ${s}`;
  el.querySelector('.t').textContent = PY_LABEL[s] || s;
}));
const pyStateHTML = () => `<span class="py-state ${py.status}"><span class="d"></span><span class="t">${PY_LABEL[py.status]}</span></span>`;

// ---------- router ----------
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'l' && lessonById(parts[1])) {
    let tab = parts[2] === 'build' ? 'practice' : parts[2];
    if (!TABS.some((t) => t[0] === tab)) tab = 'learn';
    return { view: 'lesson', id: parts[1], tab, lab: Number(parts[3]) || 0 };
  }
  if (parts[0] === 'playground') return { view: 'playground' };
  if (parts[0] === 'progress') return { view: 'progress' };
  return { view: 'home' };
}

let cleanup = [];
let lastKey = '';
function render({ keepScroll = false } = {}) {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  const route = parseRoute();
  renderShell(route);
  if (route.view === 'lesson') renderLesson(route);
  else if (route.view === 'playground') renderPlayground();
  else if (route.view === 'progress') renderProgress();
  else renderHome();
  const key = `${route.view}/${route.id}/${route.tab}`;
  if (!keepScroll && key !== lastKey) window.scrollTo(0, 0);
  lastKey = key;
}
window.addEventListener('hashchange', () => render());

// ---------- home ----------
function resumeTarget() {
  const s = store.get();
  const last = s.last && lessonById(s.last.id);
  if (last && !lessonProgress(last).done) return { lesson: last, tab: s.last.tab };
  const l = LESSONS.find((x) => !lessonProgress(x).done);
  return l ? { lesson: l, tab: 'learn' } : null;
}

function renderHome() {
  const cp = courseProgress();
  const r = resumeTarget();
  main.innerHTML = `
  <div class="page">
    <section class="hero">
      <h1>Learn to build production AI agents by writing the code yourself.</h1>
      <p class="lede">${LESSONS.length} lessons. For each one, read the concept, study a worked answer, then rewrite it from memory while tests check your work. Python runs right in your browser.</p>
    </section>
    ${r ? `
    <div class="resume">
      <div><div class="label">${cp.done ? 'Continue where you left off' : 'Start here'}</div><h3>${r.lesson.num}. ${esc(r.lesson.title)}</h3></div>
      <a class="btn primary lg" href="#/l/${r.lesson.id}/${r.tab}">${cp.done || store.get().last ? 'Continue' : 'Start lesson 1'} →</a>
    </div>` : '<div class="callout ok"><b>Course complete.</b> Revisit any lab and recall it again to keep it fresh.</div>'}
    <p class="stats-line"><b>${cp.done}</b>/${cp.total} lessons · <b>${cp.labsPassed}</b>/${cp.labsTotal} labs passed · <b>${cp.mastered}</b> recalled with no peeks</p>

    ${MODULES.map((m) => {
      const done = m.lessons.filter((l) => lessonProgress(l).done).length;
      return `
      <section class="toc-mod">
        <div class="toc-head"><h2>${m.num}. ${esc(m.title)}</h2><span class="count">${done}/${m.lessons.length}</span></div>
        <p class="toc-blurb">${esc(m.blurb)}</p>
        <ul class="toc-list">${m.lessons.map((l) => `
          <li><a href="#/l/${l.id}"><span class="num">${l.num}</span><span class="t">${esc(l.title)}</span><span class="m">${l.minutes} min</span>${stateDot(l)}</a></li>`).join('')}
        </ul>
      </section>`;
    }).join('')}
  </div>`;
}

// ---------- lesson ----------
function renderLesson(route) {
  const lesson = lessonById(route.id);
  store.update((s) => { s.last = { id: lesson.id, tab: route.tab }; });
  const p = lessonProgress(lesson);
  const done = {
    practice: p.labsPassed === p.labsTotal,
    quiz: p.quizDone,
    ship: !!store.get().done[lesson.id],
  };
  main.innerHTML = `
  <div class="page ${route.tab === 'practice' ? 'wide' : ''}">
    <div class="eyebrow">Module ${lesson.module.num} · ${esc(lesson.module.title)}</div>
    <h1>${lesson.num}. ${esc(lesson.title)}</h1>
    <p class="lede">${inline(lesson.tagline)}</p>
    <div class="meta"><span>~${lesson.minutes} min</span><span class="sep"></span><span>${lesson.labs.length} lab${lesson.labs.length > 1 ? 's' : ''}</span><span class="sep"></span><a href="${lesson.repo}" target="_blank" rel="noopener">reference project ↗</a></div>
    <nav class="tabs">
      ${TABS.map(([k, label]) => `<a class="tab ${k === route.tab ? 'active' : ''}" href="#/l/${lesson.id}/${k}">${label}${done[k] ? '<span class="tick">✓</span>' : ''}</a>`).join('')}
    </nav>
    <div id="tabBody"></div>
  </div>`;
  const body = $('#tabBody');
  ({ learn: renderLearn, practice: renderPractice, quiz: renderQuiz, ship: renderShip })[route.tab](body, lesson, route);
}

const nextBlock = (label, title, href, cta) =>
  `<div class="next"><div><div class="label">${label}</div><b>${title}</b></div><a class="btn primary" href="${href}">${cta} →</a></div>`;

function renderLearn(body, lesson) {
  const idx = LESSONS.indexOf(lesson);
  const prev = LESSONS[idx - 1];
  body.innerHTML = `
    ${md(lesson.summary)}
    <h2>What you'll build</h2>
    <ul class="list-ok">${lesson.build.map((b) => `<li>${inline(b)}</li>`).join('')}</ul>
    <h2>Why it matters</h2>
    <div class="note">${md(lesson.problem)}</div>
    ${prev ? `<p class="muted small">Builds on <a href="#/l/${prev.id}">Lesson ${prev.num}: ${esc(prev.title)}</a>.</p>` : ''}
    <h2>How a request flows</h2>
    <ol class="flow">${lesson.flow.map(([t, d]) => `<li><b>${inline(t)}</b><span>${inline(d)}</span></li>`).join('')}</ol>
    <h2>Core concepts</h2>
    <dl class="defs">${lesson.concepts.map(([t, d]) => `<div><dt>${inline(t)}</dt><dd>${inline(d)}</dd></div>`).join('')}</dl>
    <div class="split">
      <div><h2>Key insights</h2><ul>${lesson.insights.map((x) => `<li>${inline(x)}</li>`).join('')}</ul></div>
      <div><h2>Common mistakes</h2><ul class="list-bad">${lesson.pitfalls.map((x) => `<li>${inline(x)}</li>`).join('')}</ul></div>
    </div>
    <details class="more"><summary>Real-world examples</summary>
      <dl class="defs">${lesson.examples.map(([t, d]) => `<div><dt>${inline(t)}</dt><dd>${inline(d)}</dd></div>`).join('')}</dl>
    </details>
    ${lesson.extra ? `<details class="more"><summary>Going further</summary>${md(lesson.extra)}</details>` : ''}
    ${nextBlock('Next', `Practice: ${esc(lesson.labs[0].title)}`, `#/l/${lesson.id}/practice`, 'Start practice')}
  `;
}

// ---------- practice: study → recall ----------
function renderResult(out, r, kind) {
  if (kind === 'script') {
    out.innerHTML = `
      <div class="res-head ${r.ok ? 'ok' : 'bad'}">${r.ok ? 'Output' : 'Error'} <span class="muted small" style="font-weight:400">· ${r.ms} ms</span></div>
      ${r.stdout ? `<pre>${esc(r.stdout)}</pre>` : r.ok ? '<pre>(nothing printed)</pre>' : ''}
      ${r.error ? `<div class="err"><pre>${esc(r.error)}</pre></div>` : ''}
      ${r.error && /NotImplementedError/.test(r.error) ? '<p class="muted small" style="margin:8px 0 0">A function still raises NotImplementedError. That is the part you need to write.</p>' : ''}`;
    return;
  }
  if (r.load_error) {
    out.innerHTML = `<div class="res-head bad">Your code didn't load</div><div class="err"><pre>${esc(r.load_error)}</pre></div>`;
    return;
  }
  out.innerHTML = `
    <div class="res-head ${r.ok ? 'ok' : 'bad'}">${r.ok ? `All ${r.total} tests pass` : `${r.passed} of ${r.total} tests pass`}</div>
    ${r.tests.map((t) => `<div class="test ${t.passed ? 'pass' : 'fail'}"><span class="m">${t.passed ? '✓' : '✗'}</span><span>${esc(t.label)}</span>${t.error ? `<pre>${esc(t.error)}</pre>` : ''}</div>`).join('')}
    ${r.stdout ? `<details style="margin-top:8px"><summary class="muted small">Printed output</summary><pre>${esc(r.stdout)}</pre></details>` : ''}`;
}

function setLab(lab, patch) {
  store.update((s) => { s.labs[lab.id] = { ...(s.labs[lab.id] || {}), ...patch }; });
}

function renderPractice(body, lesson, route) {
  const labIdx = Math.min(route.lab, lesson.labs.length - 1);
  const lab = lesson.labs[labIdx];
  const st = labState(lab.id);
  const stage = st.stage || (st.passed ? 'recall' : 'study');

  const switcher = lesson.labs.length > 1 ? `
    <div class="lab-switch">${lesson.labs.map((l, i) => `
      <button class="${i === labIdx ? 'active' : ''}" data-lab="${i}">Lab ${i + 1}${labState(l.id).passed ? '<span class="tick">✓</span>' : ''}</button>`).join('')}
    </div>` : '';

  const stepCls = (s) => {
    if (s === 'study') return stage === 'study' ? 'active' : 'done';
    if (s === 'recall') return stage === 'recall' ? (st.passed ? 'done' : 'active') : '';
    return st.passed ? 'done' : '';
  };

  body.innerHTML = `
    ${switcher}
    <div class="lab-title">
      <div>
        <h2>${esc(lab.title)}</h2>
        <p class="muted" style="margin:0">${inline(lab.goal)}</p>
      </div>
      <div class="row">
        ${st.mastered ? '<span class="badge ok">Recalled with no peeks</span>' : st.passed ? '<span class="badge ok">Passed</span>' : ''}
        <span class="badge">~${lab.minutes} min</span>
      </div>
    </div>
    <div class="steps">
      <button class="step ${stepCls('study')}" data-step="study" ${stage === 'study' ? 'aria-current="step"' : ''} title="${stage === 'study' ? 'You are here' : st.passed ? 'Review the worked answer' : 'Going back counts as a peek and resets your code'}"><span class="n">${stepCls('study') === 'done' ? '✓' : 1}</span>Study the answer</button>
      <span class="step-sep"></span>
      <button class="step ${stepCls('recall')}" data-step="recall" ${stage === 'recall' ? 'aria-current="step"' : ''} title="${stage === 'recall' ? 'You are here' : 'Hide the answer and write it yourself'}"><span class="n">${stepCls('recall') === 'done' ? '✓' : 2}</span>Write it from memory</button>
    </div>
    <div id="stage"></div>`;

  $$('.lab-switch button', body).forEach((b) => b.addEventListener('click', () => {
    location.hash = `#/l/${lesson.id}/practice/${b.dataset.lab}`;
  }));

  $$('[data-step]', body).forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.step === stage) return;
    if (b.dataset.step === 'recall') goRecall(lab);
    else goStudy(lab);
  }));

  const stageEl = $('#stage');
  if (stage === 'study') renderStudy(stageEl, lesson, lab, labIdx);
  else renderRecall(stageEl, lesson, lab, labIdx);
}

// Study → Recall always starts from a clean starter.
function goRecall(lab) {
  setLab(lab, { stage: 'recall' });
  if (!labState(lab.id).passed) store.update((s) => { delete s.drafts[lab.id]; });
  render({ keepScroll: true });
}

// Recall → Study is free once the lab is passed; before that it is a peek.
function goStudy(lab) {
  if (labState(lab.id).passed) {
    setLab(lab, { stage: 'study' });
    render({ keepScroll: true });
    return;
  }
  if (!confirm('Going back to the answer counts as a peek and resets your code to the starter. Continue?')) return;
  setLab(lab, { stage: 'study', peeks: (labState(lab.id).peeks || 0) + 1, attemptPeeked: true });
  store.update((s) => { delete s.drafts[lab.id]; });
  render({ keepScroll: true });
}

function renderStudy(el, lesson, lab) {
  const lines = lab.solution.trim().split('\n');
  const marks = lab.notes.map((n, i) => ({ n: i + 1, line: lines.findIndex((l) => l.includes(n.at)) }));
  el.innerHTML = `
    <p class="muted">Read the worked answer slowly. Click a note to jump to its line. When you understand <em>why</em> each line exists, hide the answer and write it yourself.</p>
    <div class="study">
      <div class="answer" id="answer"></div>
      <ol class="notes">${lab.notes.map((n, i) => `<li data-line="${marks[i].line}"><div>${inline(n.note)}<div class="ln-ref">line ${marks[i].line + 1}</div></div></li>`).join('')}</ol>
    </div>
    <div class="study-cta">
      <div><b>Ready?</b> <span class="muted">The answer will be hidden. Peeking later resets your code.</span></div>
      <div class="row">
        <button class="btn primary lg" id="ready">Hide the answer and start writing</button>
      </div>
    </div>`;
  const viewer = createViewer($('#answer', el), lines.join('\n'), marks);
  $$('.notes li', el).forEach((li) => li.addEventListener('click', () => {
    $$('.notes li', el).forEach((x) => x.classList.remove('focus'));
    li.classList.add('focus');
    viewer.focus(Number(li.dataset.line));
  }));
  $('#ready', el).onclick = () => goRecall(lab);
}

function renderRecall(el, lesson, lab, labIdx) {
  const st = labState(lab.id);
  const draft = store.get().drafts[lab.id];
  el.innerHTML = `
    <details class="spec" ${st.passed ? '' : 'open'}><summary>What to implement (${lab.steps.length} steps)</summary>
      <ol>${lab.steps.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>
    </details>
    <div class="editor-card">
      <div class="editor-bar">
        <div class="left"><span class="file">solution.py</span>${pyStateHTML()}</div>
        <div class="right">
          <button class="btn quiet" data-act="hint">Hint</button>
          <button class="btn quiet" data-act="peek">Peek at answer</button>
          <button class="btn quiet" data-act="reset">Reset</button>
          <button class="btn quiet" data-act="stop" hidden>Stop</button>
          <button class="btn" data-act="run">Run</button>
          <button class="btn primary" data-act="test">Run tests</button>
        </div>
      </div>
      <div class="editor-host"></div>
      <div class="output" aria-live="polite"></div>
    </div>
    <div class="peek-strip">${st.peeks ? `Peeked ${st.peeks} time${st.peeks > 1 ? 's' : ''} on this lab. ` : ''}<span class="kbd">Ctrl/⌘ Enter</span> runs tests.</div>
    <div class="hint-box"></div>
    <div id="win"></div>`;

  const out = $('.output', el);
  const editor = createEditor($('.editor-host', el), draft ?? lab.starter.trim() + '\n', {
    onChange: (code) => store.update((s) => { s.drafts[lab.id] = code; }),
    onRunTests: () => act('test'),
  });
  cleanup.push(() => editor.destroy());

  let hints = 0;
  const hintBtn = $('[data-act="hint"]', el);
  const paintHint = () => {
    hintBtn.textContent = hints >= lab.hints.length ? 'No more hints' : `Hint (${lab.hints.length - hints} left)`;
    hintBtn.disabled = hints >= lab.hints.length;
  };
  paintHint();

  const showWin = () => {
    const nextLab = lesson.labs[labIdx + 1];
    const s = labState(lab.id);
    $('#win', el).innerHTML = `
      <div class="win">
        <div><b>${s.mastered ? 'Recalled from memory ✓' : 'Tests pass ✓'}</b><div class="muted small">${s.mastered ? 'No peeks. That is how it sticks.' : 'You peeked this time. Come back tomorrow and recall it cold.'}</div></div>
        <div class="row">
          <button class="btn quiet" data-act="again">Start over</button>
          ${nextLab ? `<a class="btn primary" href="#/l/${lesson.id}/practice/${labIdx + 1}">Next lab →</a>` : `<a class="btn primary" href="#/l/${lesson.id}/quiz">Take the quiz →</a>`}
        </div>
      </div>`;
    $('[data-act="again"]', el).onclick = () => act('again');
  };
  const busy = (b) => {
    $$('[data-act="run"],[data-act="test"]', el).forEach((x) => { x.disabled = b; });
    $('[data-act="stop"]', el).hidden = !b;
  };

  async function act(kind) {
    if (kind === 'hint') {
      if (hints >= lab.hints.length) return;
      $('.hint-box', el).insertAdjacentHTML('beforeend', `<div class="callout warn small"><b>Hint ${hints + 1}.</b> ${inline(lab.hints[hints])}</div>`);
      hints++;
      paintHint();
      return;
    }
    if (kind === 'peek') { goStudy(lab); return; }
    if (kind === 'reset' || kind === 'again') {
      if (kind === 'reset' && !confirm('Clear your code back to the starter?')) return;
      editor.setValue(lab.starter.trim() + '\n');
      store.update((s) => { delete s.drafts[lab.id]; });
      if (kind === 'again') setLab(lab, { attemptPeeked: false });
      out.innerHTML = '';
      $('#win', el).innerHTML = '';
      editor.focus();
      return;
    }
    if (kind === 'stop') { py.stop(); return; }
    editor.flush();
    busy(true);
    out.innerHTML = `<div class="muted small">${py.status === 'ready' ? 'Running…' : 'Starting Python (first time takes a few seconds)…'}</div>`;
    try {
      if (kind === 'run') {
        renderResult(out, await py.runScript(editor.getValue()), 'script');
      } else {
        const r = await py.runLab(editor.getValue(), lab.tests);
        renderResult(out, r, 'lab');
        if (r.ok) {
          const prev = labState(lab.id);
          const clean = !prev.attemptPeeked;
          setLab(lab, { passed: true, at: Date.now(), mastered: prev.mastered || clean });
          toast(clean ? 'Recalled from memory ✓' : 'Tests pass ✓');
          renderShell(parseRoute());
          showWin();
        }
      }
    } catch (err) {
      out.innerHTML = `<div class="res-head bad">${esc(err.message)}</div>${py.status === 'error' ? '<p class="muted small">Python could not load. It is downloaded from cdn.jsdelivr.net; check your connection and try again.</p>' : ''}`;
    } finally {
      busy(false);
    }
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && b.closest('.editor-bar')) act(b.dataset.act);
  });
  py.ensureReady().catch(() => {});
}

// ---------- quiz ----------
function renderQuiz(body, lesson) {
  const answers = { ...(store.get().quizzes[lesson.id]?.answers || {}) };
  const draw = () => {
    const answered = Object.keys(answers).length;
    const correct = lesson.quiz.filter((q, i) => answers[i] === q.answer).length;
    body.innerHTML = `
      ${lesson.quiz.map((q, i) => {
        const a = answers[i];
        const locked = a !== undefined;
        return `
        <div class="q">
          <h3><span class="qn">${i + 1}.</span>${inline(q.q)}</h3>
          ${q.options.map((o, j) => `<button class="opt ${locked && j === q.answer ? 'right' : locked && j === a ? 'wrong' : ''}" data-q="${i}" data-o="${j}" ${locked ? 'disabled' : ''}><span class="k">${'ABCD'[j]}</span><span>${inline(o)}</span></button>`).join('')}
          ${locked ? `<div class="why"><b>${a === q.answer ? 'Correct.' : 'Not quite.'}</b> ${inline(q.why)}</div>` : ''}
        </div>`;
      }).join('')}
      ${answered === lesson.quiz.length
        ? `${nextBlock(`You got ${correct} of ${lesson.quiz.length}`, 'Next: run the real project and tick the checklist', `#/l/${lesson.id}/ship`, 'Continue')}
           <p style="margin-top:12px"><button class="btn quiet" id="retry">Retake quiz</button></p>`
        : `<p class="muted small">${answered} of ${lesson.quiz.length} answered</p>`}`;
    $$('.opt', body).forEach((b) => b.addEventListener('click', () => {
      answers[b.dataset.q] = +b.dataset.o;
      const ans = Object.keys(answers).length;
      const cor = lesson.quiz.filter((q, i) => answers[i] === q.answer).length;
      store.update((s) => { s.quizzes[lesson.id] = { answers: { ...answers }, answered: ans, correct: cor }; });
      if (ans === lesson.quiz.length) renderShell(parseRoute());
      draw();
    }));
    const retry = $('#retry', body);
    if (retry) retry.onclick = () => {
      Object.keys(answers).forEach((k) => delete answers[k]);
      store.update((s) => { delete s.quizzes[lesson.id]; });
      renderShell(parseRoute());
      draw();
    };
  };
  draw();
}

// ---------- ship ----------
function renderShip(body, lesson) {
  const s = store.get();
  const next = LESSONS[LESSONS.indexOf(lesson) + 1];
  const [repoRoot, path] = lesson.repo.split('/tree/main/');
  const checks = s.checklist[lesson.id] || {};
  const done = !!s.done[lesson.id];
  body.innerHTML = `
    <p class="muted">The full Dockerized service (FastAPI, dashboard, tests) is in the reference repo. About 10 minutes if Docker is installed.</p>
    <pre class="code"><code>git clone ${esc(repoRoot)}.git
cd ${esc(repoRoot.split('/').pop())}/${esc(path)}
./start.sh       # start the service + dashboard
./demo.sh        # send demo traffic; metrics should move
./run_tests.sh   # tests + smoke checks
./cleanup.sh     # stop and remove everything</code></pre>
    <h2>Production checklist</h2>
    <div>${lesson.checklist.map((c, i) => `<label class="checkline"><input type="checkbox" data-i="${i}" ${checks[i] ? 'checked' : ''}/><span>${inline(c)}</span></label>`).join('')}</div>
    <h2>Your notes</h2>
    <textarea class="notes-box" id="notes" placeholder="What surprised you? What would you do differently in production?">${esc(s.notes[lesson.id] || '')}</textarea>
    <div class="next">
      <div><div class="label">${done ? 'Done' : 'Finish'}</div><b>${done ? `Lesson ${lesson.num} complete ✓` : 'Mark this lesson complete'}</b></div>
      <div class="row">
        <button class="btn ${done ? 'quiet' : 'ok'}" id="markDone">${done ? 'Mark incomplete' : 'Mark complete'}</button>
        ${next ? `<a class="btn primary" href="#/l/${next.id}">Lesson ${next.num} →</a>` : '<a class="btn primary" href="#/">Home →</a>'}
      </div>
    </div>`;
  $$('.checkline input', body).forEach((cb) => cb.addEventListener('change', () => {
    store.update((st) => { (st.checklist[lesson.id] ||= {})[cb.dataset.i] = cb.checked; });
  }));
  let t;
  $('#notes', body).addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => store.update((st) => { st.notes[lesson.id] = e.target.value; }), 300);
  });
  $('#markDone', body).onclick = () => {
    store.update((st) => { if (done) delete st.done[lesson.id]; else st.done[lesson.id] = true; });
    if (!done) toast(`Lesson ${lesson.num} complete ✓`);
    render({ keepScroll: true });
  };
}

// ---------- playground ----------
const PLAYGROUND_DEFAULT = `# Scratchpad. Standard-library Python runs here; top-level await works.
import asyncio

async def tool(name, delay):
    await asyncio.sleep(delay)
    return f"{name} done in {int(delay * 1000)} ms"

for line in await asyncio.gather(tool("search", 0.2), tool("lookup", 0.1)):
    print(line)
`;

function renderPlayground() {
  main.innerHTML = `
  <div class="page wide">
    <h1>Playground</h1>
    <p class="lede" style="margin-bottom:24px">Try ideas from any lesson. Your code is saved in this browser.</p>
    <div class="editor-card">
      <div class="editor-bar"><div class="left"><span class="file">scratch.py</span>${pyStateHTML()}</div>
        <div class="right"><button class="btn quiet" id="pgReset">Reset</button><button class="btn quiet" id="pgStop" hidden>Stop</button><button class="btn primary" id="pgRun">Run</button></div>
      </div>
      <div class="editor-host"></div>
      <div class="output"></div>
    </div>
  </div>`;
  const out = $('.output', main);
  const ed = createEditor($('.editor-host', main), store.get().drafts.__playground ?? PLAYGROUND_DEFAULT, {
    onChange: (c) => store.update((s) => { s.drafts.__playground = c; }),
    onRunTests: () => run(),
  });
  cleanup.push(() => ed.destroy());
  async function run() {
    $('#pgRun').disabled = true;
    $('#pgStop').hidden = false;
    out.innerHTML = '<div class="muted small">Running…</div>';
    try { renderResult(out, await py.runScript(ed.getValue()), 'script'); }
    catch (err) { out.innerHTML = `<div class="res-head bad">${esc(err.message)}</div>`; }
    finally { $('#pgRun').disabled = false; $('#pgStop').hidden = true; }
  }
  $('#pgRun').onclick = run;
  $('#pgStop').onclick = () => py.stop();
  $('#pgReset').onclick = () => ed.setValue(PLAYGROUND_DEFAULT);
  py.ensureReady().catch(() => {});
}

// ---------- progress & backup ----------
function renderProgress() {
  const cp = courseProgress();
  main.innerHTML = `
  <div class="page">
    <h1>Progress & backup</h1>
    <p class="stats-line" style="margin-bottom:24px"><b>${cp.done}</b>/${cp.total} lessons · <b>${cp.labsPassed}</b>/${cp.labsTotal} labs passed · <b>${cp.mastered}</b> recalled with no peeks</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Lesson</th><th>Labs</th><th>Quiz</th><th></th></tr></thead>
      <tbody>${LESSONS.map((l) => { const p = lessonProgress(l); return `<tr><td><a href="#/l/${l.id}">${l.num}. ${esc(l.title)}</a></td><td>${p.labsPassed}/${p.labsTotal}</td><td>${p.quizDone ? `${p.quiz.correct}/${l.quiz.length}` : '–'}</td><td>${p.done ? '<span class="badge ok">done</span>' : ''}</td></tr>`; }).join('')}</tbody>
    </table></div>
    <h2>Backup</h2>
    <p class="muted">Everything is stored in this browser. Export it to move to another device.</p>
    <div class="row">
      <button class="btn" id="exp">Export JSON</button>
      <label class="btn">Import JSON<input type="file" accept="application/json" id="imp" hidden /></label>
      <button class="btn quiet" id="rst" style="color:var(--bad)">Reset everything</button>
    </div>
  </div>`;
  $('#exp').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' }));
    a.download = `agentic-playbook-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  $('#imp').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { store.importJSON(await f.text()); toast('Progress imported ✓'); render(); }
    catch { alert('That file is not a valid progress export.'); }
  };
  $('#rst').onclick = () => { if (confirm('Delete ALL progress, drafts and notes in this browser?')) { store.reset(); render(); } };
}

render();
