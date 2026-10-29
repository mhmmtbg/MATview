/* ---------- Faz 5: Kod düzenleyici — artımlı renklendirme, Bul/Değiştir (Ctrl+F / Ctrl+H), Satıra git (Ctrl+G),
   ayraç eşleme, otomatik tamamlama (işlevler, değişkenler, kanal adları) ---------- */
const CED = {hlCache: new Map(), mask: null, maskFor: null, find: {q: '', rep: '', cs: false, ww: false, re: false, hits: [], cur: -1, open: false, mode: 'find'}, ac: null, gutSig: ''};

// tek satır renklendirme (önceki codeHighlight ile aynı kurallar); satır metni + blok yorum durumuna göre önbellek
function cedHlLine(ln) {
  let o = '', i = 0, prev = ''; const n = ln.length;
  if (/^\s*%%/.test(ln)) return '<span class="hs">' + htmlEsc(ln) + '</span>';
  while (i < n) {
    const c = ln[i];
    if (c === '%' || (c === '.' && ln.startsWith('...', i))) { o += '<span class="hc">' + htmlEsc(ln.slice(i)) + '</span>'; break; }
    if (c === '"' || (c === "'" && !/[\w)\]}'.]/.test(prev))) {
      let j = i + 1; while (j < n) { if (ln[j] === c) { if (ln[j + 1] === c) { j += 2; continue; } j++; break; } j++; }
      o += '<span class="hq">' + htmlEsc(ln.slice(i, j)) + '</span>'; i = j; prev = 'q'; continue;
    }
    if (/[A-Za-z_]/.test(c)) { let j = i + 1; while (j < n && /\w/.test(ln[j])) j++; const w = ln.slice(i, j); o += ML_KW.has(w) && prev !== '.' ? '<span class="hk">' + w + '</span>' : w; i = j; prev = 'a'; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(ln[i + 1] || ''))) { const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[ij]?/.exec(ln.slice(i)); o += '<span class="hn">' + m[0] + '</span>'; i += m[0].length; prev = '0'; continue; }
    o += htmlEsc(c); if (c !== ' ' && c !== '\t') prev = c; i++;
  }
  return o;
}
// artımlı: yalnız değişen satırlar yeniden belirteçlenir (önbellek isabeti), sonuç aynı HTML
codeHighlight = function (text) {
  const lines = text.split('\n'), out = new Array(lines.length), C = CED.hlCache; let block = false;
  for (let k = 0; k < lines.length; k++) {
    const ln = lines[k];
    if (block) { out[k] = '<span class="hc">' + htmlEsc(ln) + '</span>'; if (/^\s*%\}\s*$/.test(ln)) block = false; continue; }
    if (/^\s*%\{\s*$/.test(ln)) { block = true; out[k] = '<span class="hc">' + htmlEsc(ln) + '</span>'; continue; }
    let v = C.get(ln); if (v === undefined) { v = cedHlLine(ln); if (C.size > 20000) C.clear(); C.set(ln, v); } out[k] = v;
  }
  return out.join('\n') + '\n ';
};
// kod / dize / yorum maskesi: 1 = kod karakteri (ayraç eşleme ve tamamlama bağlamı için)
function cedMask(text) {
  if (CED.maskFor === text) return CED.mask;
  const m = new Uint8Array(text.length); let i = 0, block = false, prev = '';
  const lines = text.split('\n'); let off = 0;
  for (const ln of lines) {
    const n = ln.length;
    if (block) { if (/^\s*%\}\s*$/.test(ln)) block = false; off += n + 1; continue; }
    if (/^\s*%\{\s*$/.test(ln)) { block = true; off += n + 1; continue; }
    i = 0; prev = '';
    while (i < n) {
      const c = ln[i];
      if (c === '%' || (c === '.' && ln.startsWith('...', i))) break;
      if (c === '"' || (c === "'" && !/[\w)\]}'.]/.test(prev))) { let j = i + 1; while (j < n) { if (ln[j] === c) { if (ln[j + 1] === c) { j += 2; continue; } j++; break; } j++; } m[off + i] = 2; for (let q = i + 1; q < j; q++) m[off + q] = 2; i = j; prev = 'q'; continue; }
      m[off + i] = 1; if (c !== ' ' && c !== '\t') prev = /\w/.test(c) ? 'a' : c; i++;
    }
    off += n + 1;
  }
  CED.mask = m; CED.maskFor = text; return m;
}
function cedBracket(text, pos) {
  const m = cedMask(text), OPEN = '([{', CLOSE = ')]}';
  const at = k => k >= 0 && k < text.length && m[k] === 1 && (OPEN.includes(text[k]) || CLOSE.includes(text[k]));
  let k = at(pos - 1) ? pos - 1 : at(pos) ? pos : -1; if (k < 0) return null;
  const c = text[k], fwd = OPEN.includes(c), mate = fwd ? CLOSE[OPEN.indexOf(c)] : OPEN[CLOSE.indexOf(c)]; let d = 0;
  for (let j = k; fwd ? j < text.length : j >= 0; j += fwd ? 1 : -1) {
    if (m[j] !== 1) continue; const q = text[j];
    if (q === c) d++; else if (q === mate) { d--; if (d === 0) return [k, j]; }
    if (Math.abs(k - j) > 200000) break;
  }
  return [k, -1];
}
// imleç katmanı: bulunan eşleşmeler + ayraç çifti, saydam metinle hizalanır
function cedMarks() {
  const ed = $('#codeEd'), mk = $('#codeMk'); if (!ed || !mk) return;
  const t = ed.value, marks = [];
  if (CED.find.open && CED.find.hits.length) CED.find.hits.forEach(([a, b], i) => marks.push([a, b, i === CED.find.cur ? 'fm cur' : 'fm']));
  if (ed.selectionStart === ed.selectionEnd) { const br = cedBracket(t, ed.selectionStart); if (br) { marks.push([br[0], br[0] + 1, br[1] < 0 ? 'bm bad' : 'bm']); if (br[1] >= 0) marks.push([br[1], br[1] + 1, 'bm']); } }
  if (!marks.length) { if (mk.firstChild) mk.textContent = ''; return; }
  marks.sort((p, q) => p[0] - q[0]); let o = '', p = 0;
  for (const [a, b, cls] of marks) { if (a < p) continue; o += htmlEsc(t.slice(p, a)) + '<span class="' + cls + '">' + htmlEsc(t.slice(a, b)) + '</span>'; p = b; }
  o += htmlEsc(t.slice(p)) + '\n '; mk.innerHTML = o; mk.scrollTop = ed.scrollTop; mk.scrollLeft = ed.scrollLeft;
}
// gutter yalnız satır sayısı / hata / bölüm satırları değişince yeniden kurulur
const _codeRefreshEd0 = codeRefreshEd;
codeRefreshEd = function () {
  const ed = $('#codeEd'), hl = $('#codeHl'), gut = $('#codeGut'); if (!ed) return;
  const v = ed.value; if (hl._t !== v) { hl.innerHTML = codeHighlight(v); hl._t = v; }
  const lines = v.split('\n'), secs = []; lines.forEach((l, i) => { if (/^\s*%%/.test(l)) secs.push(i + 1); });
  const sig = lines.length + '|' + CODE.errLine + '|' + secs.join(',');
  if (sig !== CED.gutSig) { CED.gutSig = sig; let s = ''; const ss = new Set(secs); for (let i = 1; i <= lines.length; i++) s += (i === CODE.errLine ? '<span class="gerr">' + i + '</span>' : ss.has(i) ? '<span class="gsec">' + i + '</span>' : i) + '\n'; gut.innerHTML = s; }
  codeSyncScroll(); cedMarks();
  const st = $('#codePos'); if (st) { const a = ed.selectionStart, before = v.slice(0, a), l = before.split('\n').length, c = a - before.lastIndexOf('\n'); st.textContent = `${codeDoc() ? codeDoc().name : ''}  ·  Satır ${l}, Sütun ${c}  ·  ${codeIsFuncFile(v) ? 'işlev dosyası' : 'betik'}  ·  Ctrl+F bul · Ctrl+H değiştir · Ctrl+G satıra git · Ctrl+Space tamamla`; }
};
void _codeRefreshEd0;
const _codeSyncScroll0 = codeSyncScroll;
codeSyncScroll = function () { _codeSyncScroll0(); const ed = $('#codeEd'), mk = $('#codeMk'); if (ed && mk) { mk.scrollTop = ed.scrollTop; mk.scrollLeft = ed.scrollLeft; } if (CED.ac) cedAcPlace(); };

/* ---- Bul / Değiştir / Satıra git ---- */
function cedFindRe() {
  const F = CED.find; if (!F.q) return null; let src = F.re ? F.q : F.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (F.ww) src = '\\b' + src + '\\b';
  try { return new RegExp(src, 'g' + (F.cs ? '' : 'i') + 'm'); } catch (e) { return e; }
}
function cedFindRun(keep) {
  const ed = $('#codeEd'), F = CED.find, cnt = $('#cfCount'); F.hits = []; if (!ed) return;
  const re = cedFindRe(); if (re instanceof Error) { if (cnt) cnt.textContent = 'geçersiz ifade'; cedMarks(); return; }
  if (re) { let m; while ((m = re.exec(ed.value)) && F.hits.length < 20000) { if (!m[0].length) { re.lastIndex++; continue; } F.hits.push([m.index, m.index + m[0].length]); } }
  if (!keep) { const a = ed.selectionStart; F.cur = F.hits.findIndex(h => h[0] >= a); if (F.cur < 0) F.cur = F.hits.length ? 0 : -1; }
  else if (F.cur >= F.hits.length) F.cur = F.hits.length - 1;
  if (cnt) cnt.textContent = F.q ? (F.hits.length ? (F.cur + 1) + ' / ' + F.hits.length : 'bulunamadı') : '';
  cedMarks();
}
function cedReveal(a, b, focusEd) {
  const ed = $('#codeEd'); ed.setSelectionRange(a, b); const lh = parseFloat(getComputedStyle(ed).lineHeight) || 18.85, ln = ed.value.slice(0, a).split('\n').length - 1, y = ln * lh;
  if (y < ed.scrollTop || y + lh > ed.scrollTop + ed.clientHeight - 20) ed.scrollTop = Math.max(0, y - ed.clientHeight / 2);
  if (focusEd) ed.focus(); codeRefreshEd();
}
function cedFindStep(dir) {
  const F = CED.find; if (!F.hits.length) { cedFindRun(); if (!F.hits.length) return; }
  F.cur = (F.cur + dir + F.hits.length) % F.hits.length; const [a, b] = F.hits[F.cur]; cedReveal(a, b, false);
  const cnt = $('#cfCount'); if (cnt) cnt.textContent = (F.cur + 1) + ' / ' + F.hits.length;
}
function cedReplace(all) {
  const ed = $('#codeEd'), F = CED.find; cedFindRun(true); if (!F.hits.length) return;
  const re = cedFindRe(); if (!re || re instanceof Error) return;
  const sub = s => F.re ? s.replace(new RegExp(re.source, re.flags.replace('g', '')), F.rep) : F.rep;
  if (all) {
    const n = F.hits.length; let v = ed.value, o = '', p = 0; for (const [a, b] of F.hits) { o += v.slice(p, a) + sub(v.slice(a, b)); p = b; } o += v.slice(p);
    ed.focus(); ed.select(); ed.setRangeText(o, 0, ed.value.length, 'start'); ed.dispatchEvent(new Event('input')); cedFindRun(); toast(n + ' yer değiştirildi');
  } else {
    if (F.cur < 0) F.cur = 0; const [a, b] = F.hits[F.cur], r = sub(ed.value.slice(a, b));
    ed.setRangeText(r, a, b, 'end'); ed.dispatchEvent(new Event('input')); cedFindRun(true);
    const nx = F.hits.findIndex(h => h[0] >= a + r.length); F.cur = nx < 0 ? (F.hits.length ? 0 : -1) : nx; if (F.cur >= 0) cedReveal(F.hits[F.cur][0], F.hits[F.cur][1], false);
  }
}
function cedFindOpen(mode) {
  const bar = $('#codeFind'), ed = $('#codeEd'); if (!bar) return; const F = CED.find; F.open = true; F.mode = mode; bar.classList.remove('hidden'); bar.dataset.mode = mode;
  if (mode === 'line') { const li = $('#cfLine'); li.value = ''; li.placeholder = 'Satır (1–' + ed.value.split('\n').length + ')'; li.focus(); return; }
  const sel = ed.value.slice(ed.selectionStart, ed.selectionEnd); if (sel && !sel.includes('\n')) { F.q = sel; $('#cfFind').value = sel; }
  { const i = mode === 'replace' && F.q ? $('#cfRep') : $('#cfFind'); i.focus(); i.select(); } cedFindRun();
}
function cedFindClose() { const bar = $('#codeFind'); if (bar) bar.classList.add('hidden'); CED.find.open = false; CED.find.hits = []; cedMarks(); const ed = $('#codeEd'); if (ed) ed.focus(); }
function cedGoto(v) {
  const ed = $('#codeEd'), lines = ed.value.split('\n'), m = /^\s*(\d+)(?:\s*[:,]\s*(\d+))?\s*$/.exec(v || ''); if (!m) return toast('Satır numarası girin (ör. 42 ya da 42:5)');
  const L = Math.max(1, Math.min(lines.length, +m[1])), col = m[2] ? Math.max(1, Math.min(lines[L - 1].length + 1, +m[2])) : 1; let a = 0; for (let i = 0; i < L - 1; i++) a += lines[i].length + 1;
  cedFindClose(); cedReveal(a + col - 1, a + col - 1, true);
}
function cedFindBar() {
  const F = CED.find, tg = (lbl, key, tip) => { const b = h('button', {class: 'cftg noic' + (F[key] ? ' on' : ''), title: tip, 'aria-pressed': String(!!F[key]), onclick: () => { F[key] = !F[key]; b.classList.toggle('on', F[key]); b.setAttribute('aria-pressed', String(F[key])); cedFindRun(); }}, lbl); return b; };
  const fi = h('input', {type: 'text', id: 'cfFind', placeholder: 'Bul', spellcheck: 'false', oninput: e => { F.q = e.target.value; cedFindRun(); }, onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); cedFindStep(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { e.preventDefault(); cedFindClose(); } }});
  const ri = h('input', {type: 'text', id: 'cfRep', placeholder: 'Değiştir', spellcheck: 'false', oninput: e => { F.rep = e.target.value; }, onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); cedReplace(e.ctrlKey || e.altKey); } else if (e.key === 'Escape') { e.preventDefault(); cedFindClose(); } }});
  const li = h('input', {type: 'text', id: 'cfLine', spellcheck: 'false', onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); cedGoto(e.target.value); } else if (e.key === 'Escape') { e.preventDefault(); cedFindClose(); } }});
  return h('div', {id: 'codeFind', class: 'codefind hidden', 'data-mode': 'find'},
    h('span', {class: 'cf-f'}, fi, tg('Aa', 'cs', 'Büyük/küçük harf duyarlı'), tg('W', 'ww', 'Tam sözcük'), tg('.*', 're', 'Düzenli ifade'), h('span', {id: 'cfCount', class: 'cfcount'}),
      h('button', {class: 'noic', title: 'Önceki (Shift+Enter / Shift+F3)', onclick: () => cedFindStep(-1)}, '↑'), h('button', {class: 'noic', title: 'Sonraki (Enter / F3)', onclick: () => cedFindStep(1)}, '↓')),
    h('span', {class: 'cf-r'}, ri, h('button', {class: 'noic', title: 'Bunu değiştir (Enter)', onclick: () => cedReplace(false)}, 'Değiştir'), h('button', {class: 'noic', title: 'Tümünü değiştir (Ctrl+Enter)', onclick: () => cedReplace(true)}, 'Tümü')),
    h('span', {class: 'cf-l'}, h('label', null, 'Satıra git:'), li, h('button', {class: 'noic', onclick: () => cedGoto($('#cfLine').value)}, 'Git')),
    h('button', {class: 'noic cfx', title: 'Kapat (Esc)', onclick: cedFindClose}, '✕'));
}

/* ---- otomatik tamamlama ---- */
let _cedNames = null;
function cedBuiltinNames() { if (!_cedNames) { const b = (typeof MLAB !== 'undefined' && MLAB.builtins) || {}; _cedNames = Object.keys(b).filter(k => /^[A-Za-z]\w*$/.test(k)).sort(); } return _cedNames; }
function cedChannels() { const out = []; for (const f of allFiles()) for (const c of f.channels) { out.push(c.name); if (out.length > 50000) return out; } return out; }
function cedContext(ed) {
  const v = ed.value, a = ed.selectionStart, ls = v.lastIndexOf('\n', a - 1) + 1, before = v.slice(ls, a);
  const sm = /\b(ch|chan|channel|getch)\s*\(\s*(['"])([^'"]*)$/.exec(before); if (sm) return {kind: 'chan', pre: sm[3], start: a - sm[3].length};
  const m = cedMask(v); if (a > 0 && m[a - 1] === 2) return null;   // başka bir dize içinde
  if (/%/.test(before.replace(/(['"]).*?\1/g, ''))) return null;
  const w = /[A-Za-z_]\w*$/.exec(before); if (!w) return {kind: 'id', pre: '', start: a};
  if (/\.\s*$/.test(before.slice(0, before.length - w[0].length))) return {kind: 'field', pre: w[0], start: a - w[0].length};
  return {kind: 'id', pre: w[0], start: a - w[0].length};
}
function cedCandidates(ctx) {
  const pre = ctx.pre, lp = pre.toLowerCase(), out = [], seen = new Set(), add = (t, k) => { if (seen.has(t) || t === pre) return; seen.add(t); out.push({t, k}); };
  if (ctx.kind === 'chan') { const cs = cedChannels(); for (const n of cs) if (n.toLowerCase().startsWith(lp)) add(n, 'kanal'); for (const n of cs) if (out.length < 200 && n.toLowerCase().includes(lp)) add(n, 'kanal'); return out.slice(0, 200); }
  if (ctx.kind === 'field' || !pre) return out;
  const ed = $('#codeEd'), txt = ed.value;
  for (const v of CODE.ws || []) if (v.n.toLowerCase().startsWith(lp)) add(v.n, 'değişken');
  for (const d of CODE.docs || []) { const re = /^\s*function\s+(?:\[[^\]]*\]\s*=\s*|\w+\s*=\s*)?(\w+)/gm; let m; while ((m = re.exec(d.text))) if (m[1].toLowerCase().startsWith(lp)) add(m[1], 'işlev (sekme)'); }
  for (const k of ML_KW) if (k.startsWith(lp)) add(k, 'anahtar');
  for (const n of cedBuiltinNames()) if (n.toLowerCase().startsWith(lp)) add(n, 'işlev');
  const ids = new Set(); const re = /\b[A-Za-z_]\w{2,}\b/g; let m; const lim = Math.min(txt.length, 400000); const sub = txt.slice(0, lim); while ((m = re.exec(sub))) ids.add(m[0]);
  for (const n of ids) if (n.toLowerCase().startsWith(lp)) add(n, 'metin');
  out.sort((p, q) => (p.t.startsWith(pre) ? 0 : 1) - (q.t.startsWith(pre) ? 0 : 1) || p.t.length - q.t.length || p.t.localeCompare(q.t));
  return out.slice(0, 60);
}
function cedAcOpen(force) {
  const ed = $('#codeEd'); if (!ed || ed.selectionStart !== ed.selectionEnd) return cedAcClose();
  const ctx = cedContext(ed); if (!ctx || (!force && ctx.kind !== 'chan' && ctx.pre.length < 2)) return cedAcClose();
  const items = cedCandidates(ctx); if (!items.length) return cedAcClose();
  CED.ac = {ctx, items, i: 0}; cedAcRender();
}
function cedAcRender() {
  let box = $('#codeAc'); const A = CED.ac; if (!A) return;
  if (!box) { box = h('ul', {id: 'codeAc', class: 'codeac', role: 'listbox'}); $('.codearea').append(box); box.addEventListener('pointerdown', e => e.preventDefault()); }
  box.replaceChildren(...A.items.map((it, k) => h('li', {class: k === A.i ? 'on' : '', role: 'option', onclick: () => { A.i = k; cedAcAccept(); }}, h('span', {class: 'acn'}, it.t), h('span', {class: 'ack'}, it.k))));
  box.classList.remove('hidden'); cedAcPlace(); const on = box.children[A.i]; if (on) on.scrollIntoView({block: 'nearest'});
}
function cedAcPlace() {
  const box = $('#codeAc'), ed = $('#codeEd'); if (!box || !ed || !CED.ac) return;
  const cs = getComputedStyle(ed), lh = parseFloat(cs.lineHeight) || 18.85, pad = parseFloat(cs.paddingLeft) || 8, pt = parseFloat(cs.paddingTop) || 6;
  if (!CED.cw) { const g = document.createElement('canvas').getContext('2d'); g.font = cs.font; CED.cw = g.measureText('MMMMMMMMMM').width / 10; }
  const a = CED.ac.ctx.start, before = ed.value.slice(0, a), ln = before.split('\n').length - 1, col = (before.length - before.lastIndexOf('\n') - 1);
  let x = pad + col * CED.cw - ed.scrollLeft, y = pt + (ln + 1) * lh - ed.scrollTop; const area = ed.parentElement.getBoundingClientRect();
  if (y + 180 > area.height) y = Math.max(0, y - lh - Math.min(180, box.offsetHeight || 180));
  box.style.left = Math.max(0, Math.min(x, area.width - 260)) + 'px'; box.style.top = y + 'px';
}
function cedAcClose() { CED.ac = null; const b = $('#codeAc'); if (b) b.classList.add('hidden'); }
function cedAcAccept() {
  const A = CED.ac, ed = $('#codeEd'); if (!A) return; const it = A.items[A.i]; cedAcClose();
  ed.setRangeText(it.t, A.ctx.start, ed.selectionStart, 'end'); ed.dispatchEvent(new Event('input')); ed.focus();
}

/* ---- kurulum: düzenleyici oluşturulunca ---- */
const _codeBuildView0 = codeBuildView;
codeBuildView = function () {
  _codeBuildView0();
  const ed = $('#codeEd'); if (!ed || ed._ced) return; ed._ced = true;
  const area = ed.parentElement, mk = h('pre', {id: 'codeMk', class: 'codemk', 'aria-hidden': 'true'}); area.insertBefore(mk, ed);
  const wrap = area.closest('.codewrap'); wrap.parentElement.insertBefore(cedFindBar(), wrap);
  ed.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (CED.ac) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); const A = CED.ac; A.i = (A.i + (e.key === 'ArrowDown' ? 1 : -1) + A.items.length) % A.items.length; cedAcRender(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); cedAcAccept(); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cedAcClose(); return; }
    }
    if (ctrl && e.key === ' ') { e.preventDefault(); cedAcOpen(true); return; }
    if (ctrl && !e.altKey && (k === 'f' || k === 'h')) { e.preventDefault(); e.stopImmediatePropagation(); cedFindOpen(k === 'h' ? 'replace' : 'find'); return; }
    if (ctrl && !e.altKey && k === 'g') { e.preventDefault(); e.stopImmediatePropagation(); cedFindOpen('line'); return; }
    if (e.key === 'F3') { e.preventDefault(); if (!CED.find.q) cedFindOpen('find'); else { if (!CED.find.open) { CED.find.open = true; $('#codeFind').classList.remove('hidden'); } cedFindStep(e.shiftKey ? -1 : 1); } return; }
    if (e.key === 'Escape' && CED.find.open && !CODE.running) { e.preventDefault(); cedFindClose(); return; }
  }, true);
  ed.addEventListener('input', e => {
    if (CED.find.open) cedFindRun(true);
    const it = e.inputType || ''; if (it.startsWith('insert') && !it.includes('Paste')) { const c = ed.value[ed.selectionStart - 1] || ''; if (/[\w'"]/.test(c)) cedAcOpen(false); else cedAcClose(); } else if (CED.ac) cedAcOpen(false);
  });
  ed.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ed) cedAcClose(); }, 120));
  ed.addEventListener('click', () => { cedAcClose(); cedMarks(); });
  ed.addEventListener('keyup', e => { if (/^Arrow|Home|End|Page/.test(e.key) && !CED.ac) cedMarks(); });
  codeRefreshEd();
};
