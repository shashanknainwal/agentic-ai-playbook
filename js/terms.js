// Auto-link glossary terms (first mention per container) and show a small definition popover.
import { GLOSSARY } from './content/index.js';
import { inline } from './md.js';

const SKIP = new Set(['CODE', 'PRE', 'A', 'BUTTON', 'TEXTAREA', 'INPUT', 'H1', 'SCRIPT', 'STYLE']);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

const byPhrase = new Map();
for (const g of GLOSSARY) for (const m of g.match) byPhrase.set(m.toLowerCase(), g);
const phrases = [...byPhrase.keys()].sort((a, b) => b.length - a.length);
const RE = new RegExp(`(?<![\\w-])(${phrases.map(escRe).join('|')})(?![\\w-])`, 'gi');

export function linkTerms(root) {
  if (!root) return;
  const used = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
        if (SKIP.has(el.tagName) || el.classList.contains('term') || el.dataset.noterms !== undefined) return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    RE.lastIndex = 0;
    let m;
    let last = 0;
    const frag = document.createDocumentFragment();
    let changed = false;
    while ((m = RE.exec(text))) {
      const g = byPhrase.get(m[1].toLowerCase());
      if (!g || used.has(g)) continue;
      used.add(g);
      changed = true;
      frag.append(text.slice(last, m.index));
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'term';
      b.textContent = m[1];
      b.dataset.term = g.match[0];
      frag.append(b);
      last = m.index + m[1].length;
    }
    if (!changed) continue;
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
}

// One shared popover for every term on the page.
const pop = document.createElement('div');
pop.className = 'term-pop';
pop.setAttribute('role', 'tooltip');
pop.hidden = true;
document.body.append(pop);
let anchor = null;
let hideTimer;

function show(btn) {
  const g = byPhrase.get(btn.dataset.term);
  if (!g) return;
  clearTimeout(hideTimer);
  anchor = btn;
  const name = btn.textContent.replace(/^./, (c) => c.toUpperCase());
  pop.innerHTML = `<b>${name.replace(/[<&]/g, '')}</b><span>${inline(g.def)}</span>`;
  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 24);
  pop.style.width = `${w}px`;
  const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12));
  const below = r.bottom + 8 + pop.offsetHeight < window.innerHeight;
  pop.style.left = `${left + window.scrollX}px`;
  pop.style.top = `${(below ? r.bottom + 8 : r.top - pop.offsetHeight - 8) + window.scrollY}px`;
}
function hide() {
  hideTimer = setTimeout(() => { pop.hidden = true; anchor = null; }, 120);
}

document.addEventListener('mouseover', (e) => { const t = e.target.closest?.('.term'); if (t) show(t); });
document.addEventListener('mouseout', (e) => { if (e.target.closest?.('.term')) hide(); });
document.addEventListener('focusin', (e) => { const t = e.target.closest?.('.term'); if (t) show(t); });
document.addEventListener('focusout', (e) => { if (e.target.closest?.('.term')) hide(); });
document.addEventListener('click', (e) => {
  const t = e.target.closest?.('.term');
  if (t) { e.preventDefault(); anchor === t && !pop.hidden ? hide() : show(t); }
  else if (!e.target.closest?.('.term-pop')) { pop.hidden = true; anchor = null; }
});
window.addEventListener('scroll', () => { if (!pop.hidden && anchor) show(anchor); }, { passive: true });
window.addEventListener('hashchange', () => { pop.hidden = true; anchor = null; });
