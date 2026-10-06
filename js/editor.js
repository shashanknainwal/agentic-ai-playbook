// CodeMirror 5 when the CDN loaded it; plain fallbacks otherwise.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function createEditor(host, value, { onChange, onRunTests } = {}) {
  let debounce = null;
  let pending = null;
  const flush = () => {
    clearTimeout(debounce);
    debounce = null;
    if (pending) { const get = pending; pending = null; onChange && onChange(get()); }
  };
  const changed = (get) => {
    clearTimeout(debounce);
    pending = get;
    debounce = setTimeout(flush, 250);
  };

  if (window.CodeMirror) {
    const cm = window.CodeMirror(host, {
      value,
      mode: 'python',
      theme: 'playbook',
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      matchBrackets: true,
      autoCloseBrackets: true,
      styleActiveLine: true,
      viewportMargin: 50,
      extraKeys: {
        Tab: (c) => (c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection('    ', 'end')),
        'Shift-Tab': (c) => c.indentSelection('subtract'),
        'Ctrl-Enter': () => onRunTests && onRunTests(),
        'Cmd-Enter': () => onRunTests && onRunTests(),
      },
    });
    cm.on('change', () => changed(() => cm.getValue()));
    return {
      getValue: () => cm.getValue(),
      setValue: (v) => cm.setValue(v),
      focus: () => cm.focus(),
      flush,
      destroy: flush,
    };
  }

  const ta = document.createElement('textarea');
  ta.className = 'fallback';
  ta.spellcheck = false;
  ta.value = value;
  host.appendChild(ta);
  ta.addEventListener('input', () => changed(() => ta.value));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end');
      changed(() => ta.value);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onRunTests && onRunTests();
    }
  });
  return {
    getValue: () => ta.value,
    setValue: (v) => { ta.value = v; changed(() => ta.value); },
    focus: () => ta.focus(),
    flush,
    destroy: flush,
  };
}

// Read-only code view with highlighted, numbered note lines.
// marks: [{line (0-based), n (note number)}]. Returns { focus(line) }.
export function createViewer(host, code, marks) {
  if (window.CodeMirror) {
    const cm = window.CodeMirror(host, {
      value: code,
      mode: 'python',
      theme: 'playbook',
      readOnly: 'nocursor',
      lineNumbers: true,
      gutters: ['CodeMirror-linenumbers'],
      viewportMargin: Infinity,
    });
    cm.setSize(null, 'auto');
    for (const m of marks) cm.addLineClass(m.line, 'background', 'cm-note-line');
    let focused = null;
    return {
      focus(line) {
        if (focused !== null) cm.removeLineClass(focused, 'background', 'cm-note-focus');
        focused = line;
        if (line === null) return;
        cm.addLineClass(line, 'background', 'cm-note-focus');
        const top = cm.charCoords({ line, ch: 0 }, 'local').top;
        host.scrollTo({ top: Math.max(0, top - 80), behavior: 'smooth' });
      },
    };
  }
  const markSet = new Set(marks.map((m) => m.line));
  host.innerHTML = `<table><tbody>${code.split('\n').map((l, i) =>
    `<tr data-line="${i}" class="${markSet.has(i) ? 'marked' : ''}"><td class="ln">${i + 1}</td><td>${esc(l) || ' '}</td></tr>`).join('')}</tbody></table>`;
  let focused = null;
  return {
    focus(line) {
      focused?.classList.remove('focus');
      focused = line === null ? null : host.querySelector(`tr[data-line="${line}"]`);
      if (!focused) return;
      focused.classList.add('focus');
      host.scrollTo({ top: Math.max(0, focused.offsetTop - 80), behavior: 'smooth' });
    },
  };
}
