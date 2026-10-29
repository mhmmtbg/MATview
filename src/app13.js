/* ===== Kod sekmesi: MATLAB alt kümesi editörü/çalıştırıcısı, figür görünümü, .fig önizlemesi ===== */
/*MLSRC*/
const CODE = {worker: null, running: false, docs: [], cur: 0, ws: [], figs: [], figIdx: 0, figPlots: [], runId: 0, fnNames: null, errLine: 0};
const CODE_EXAMPLES = [
  ['Merhaba / temel', `% Temel işlemler
x = linspace(0, 1, 5)
y = x.^2 + 1;
fprintf('ortalama = %.4f\\n', mean(y));
A = [2 1; 1 3]; b = [3; 5];
sol = A \\ b
`],
  ['Kanal oku, süz, çiz', `% Açık bir kanalı adıyla al: ch('ad')  — ad tam ad veya benzersiz son ek olabilir
% Önce chlist ile adlara bakın.
chlist
x  = ch('ivme1_X');          % sütun vektörü
fs = chfs('ivme1_X');        % örnekleme frekansı (Hz)
t  = (0:numel(x)-1)'/fs;
[b, a] = butter(4, 2*100/fs);   % 100 Hz alçak geçiren
y = filtfilt(b, a, x);
figure(1)
subplot(2,1,1); plot(t, x, 'r', t, y, 'b'); grid on
xlabel('t (s)'); ylabel('g'); legend('ham', 'süzülmüş')
subplot(2,1,2); plot(t, x - y); grid on; title('Fark')
addch('ivme1_X_lp100', y, fs);   % sonucu kanal olarak ağaca ekle
`],
  ['PSD (pwelch)', `x  = ch('ivme1_X');
fs = chfs('ivme1_X');
x = detrend(x);
[p, f] = pwelch(x, hann(4096), 2048, 4096, fs);
figure(2)
loglog(f(2:end), p(2:end)); grid on
xlabel('Frekans (Hz)'); ylabel('PSD (g^2/Hz)'); title('Güç spektral yoğunluğu')
fprintf('Grms = %.4f\\n', rms(x));
`],
  ['Sentetik sinyal + FFT', `fs = 1000; t = (0:fs-1)'/fs;
x = sin(2*pi*50*t) + 0.5*sin(2*pi*120*t) + 0.2*randn(size(t));
X = fft(x); n = numel(x);
P = abs(X(1:n/2+1))*2/n; f = (0:n/2)'*fs/n;
subplot(2,1,1); plot(t, x); title('Zaman'); xlabel('s')
subplot(2,1,2); plot(f, P); title('Genlik spektrumu'); xlabel('Hz'); xlim([0 300])
[pk, loc] = findpeaks(P, 'MinPeakHeight', 0.3);
fprintf('Tepe: %.1f Hz (%.3f)\\n', [f(loc)'; pk']);
`],
  ['Fonksiyon, döngü, hücre', `function r = karesi(v)
  r = v.^2;
end

names = {'a', 'b', 'c'};
for i = 1:numel(names)
  fprintf('%s -> %d\\n', names{i}, karesi(i));
end
s = struct('ad', 'test', 'deger', [1 2 3]);
disp(s.deger * 2)
`],
];
const CODE_LIB_KEY = 'mv.code.lib', CODE_DOCS_KEY = 'mv.code.docs';
const codeLibGet = () => { try { return JSON.parse(localStorage.getItem(CODE_LIB_KEY) || '[]'); } catch (_) { return []; } };
const codeLibSet = v => { try { localStorage.setItem(CODE_LIB_KEY, JSON.stringify(v)); } catch (_) { toast('Tarayıcı depolaması kullanılamıyor; kitaplık kaydedilemedi'); } };

/* ---------- belgeler (sekmeler) ---------- */
let CODE_DOC_SEQ = 1;
function codeDocsLoad() {
  let d = null; try { d = JSON.parse(localStorage.getItem(CODE_DOCS_KEY) || 'null'); } catch (_) {}
  if (d && Array.isArray(d.docs) && d.docs.length) { CODE.docs = d.docs.map(x => ({id: CODE_DOC_SEQ++, name: String(x.name || 'betik.m'), text: String(x.text || ''), dirty: !!x.dirty})); CODE.cur = Math.min(Math.max(0, d.cur | 0), CODE.docs.length - 1); }
  else { let old = ''; try { old = localStorage.getItem('mv.code.cur') || ''; } catch (_) {} CODE.docs = [{id: CODE_DOC_SEQ++, name: 'betik1.m', text: old || CODE_EXAMPLES[0][1], dirty: false}]; CODE.cur = 0; }
}
function codeDocsSave() { clearTimeout(codeDocsSave._t); codeDocsSave._t = setTimeout(() => { try { localStorage.setItem(CODE_DOCS_KEY, JSON.stringify({cur: CODE.cur, docs: CODE.docs.map(d => ({name: d.name, text: d.text.length < 2e6 ? d.text : '', dirty: d.dirty}))})); } catch (_) {} }, 300); }
const codeDoc = () => CODE.docs[CODE.cur];
const codeIsFuncFile = t => /^\s*function\b/.test(String(t).replace(/^(\s*(%[^\n]*)?\n)*/, '').replace(/^\s*%\{[\s\S]*?%\}\s*/, ''));
function codeNewDoc(name, text, opt) {
  codeBuildView(); opt = opt || {};
  const ex = CODE.docs.findIndex(d => d.name.toLowerCase() === name.toLowerCase());
  if (ex >= 0 && opt.replace) { CODE.docs[ex].text = text; CODE.docs[ex].dirty = false; CODE.cur = ex; }
  else { let nm = name; if (ex >= 0) { let k = 2; const b = name.replace(/\.m$/i, ''); while (CODE.docs.some(d => d.name.toLowerCase() === (b + '_' + k + '.m').toLowerCase())) k++; nm = b + '_' + k + '.m'; } CODE.docs.push({id: CODE_DOC_SEQ++, name: nm, text, dirty: !!opt.dirty}); CODE.cur = CODE.docs.length - 1; }
  codeShowDoc(); codeDocsSave();
}
function codeCloseDoc(i) {
  const d = CODE.docs[i]; if (!d) return;
  const doIt = () => { CODE.docs.splice(i, 1); if (!CODE.docs.length) CODE.docs.push({id: CODE_DOC_SEQ++, name: 'betik1.m', text: '', dirty: false}); CODE.cur = Math.min(CODE.cur >= i ? Math.max(0, CODE.cur - 1) : CODE.cur, CODE.docs.length - 1); codeShowDoc(); codeDocsSave(); };
  if (d.dirty && d.text.trim()) modal('Sekmeyi kapat', h('div', null, `“${d.name}” kaydedilmemiş değişiklikler içeriyor. Yine de kapatılsın mı?`), [{t: 'Kaydet (.m)', fn: () => { codeSaveM(i); doIt(); }}, {t: 'Kaydetmeden kapat', primary: true, fn: doIt}, {t: 'Vazgeç'}]);
  else doIt();
}
function codeRenderTabs() {
  const tb = $('#codeTabs'); if (!tb) return;
  tb.replaceChildren(...CODE.docs.map((d, i) => h('div', {class: 'ctab' + (i === CODE.cur ? ' on' : ''), title: d.name + (codeIsFuncFile(d.text) ? ' (işlev dosyası)' : ' (betik)'), onclick: () => { if (i !== CODE.cur) { codeStoreCur(); CODE.cur = i; codeShowDoc(); codeDocsSave(); } }, ondblclick: () => codeRenameDoc(i)},
    h('span', {class: 'cti'}, codeIsFuncFile(d.text) ? 'ƒ' : 'M'), h('span', null, d.name), d.dirty ? h('span', {class: 'cdot', title: 'Kaydedilmedi'}, '•') : null,
    h('button', {class: 'cx', title: 'Kapat', onclick: e => { e.stopPropagation(); codeCloseDoc(i); }}, '×'))),
    h('button', {class: 'ctab add', title: 'Yeni betik', onclick: () => { codeStoreCur(); let k = CODE.docs.length + 1; while (CODE.docs.some(d => d.name === 'betik' + k + '.m')) k++; codeNewDoc('betik' + k + '.m', ''); }}, '+'));
}
function codeRenameDoc(i) {
  const d = CODE.docs[i], inp = h('input', {type: 'text', value: d.name, style: 'width:100%'});
  modal('Sekmeyi yeniden adlandır', h('div', null, inp, h('div', {class: 'note'}, 'Ad, betiği başka betikten çağırmak için de kullanılır (ör. analiz.m → analiz).')), [{t: 'Tamam', primary: true, fn: () => { let n = inp.value.trim(); if (!n) return false; if (!/\.m$/i.test(n)) n += '.m'; d.name = n; codeRenderTabs(); codeDocsSave(); }}, {t: 'Vazgeç'}]);
  setTimeout(() => { inp.focus(); inp.select(); }, 50);
}
function codeStoreCur() { const ed = $('#codeEd'), d = codeDoc(); if (ed && d) { d.text = ed.value; d.sel = [ed.selectionStart, ed.selectionEnd]; d.scroll = ed.scrollTop; } }
function codeShowDoc() {
  const ed = $('#codeEd'), d = codeDoc(); if (!ed || !d) return;
  ed.value = d.text; CODE.errLine = d.errLine || 0; codeRenderTabs(); codeRefreshEd();
  requestAnimationFrame(() => { ed.scrollTop = d.scroll || 0; if (d.sel) ed.setSelectionRange(d.sel[0], d.sel[1]); codeSyncScroll(); });
}

/* ---------- sözdizimi renklendirme ---------- */
const ML_KW = new Set(['if', 'elseif', 'else', 'end', 'for', 'parfor', 'while', 'switch', 'case', 'otherwise', 'try', 'catch', 'break', 'continue', 'return', 'function', 'global', 'persistent', 'do', 'until']);
const htmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function codeHighlight(text) {
  const lines = text.split('\n'), out = []; let block = false;
  for (const ln of lines) {
    if (block) { out.push('<span class="hc">' + htmlEsc(ln) + '</span>'); if (/^\s*%\}\s*$/.test(ln)) block = false; continue; }
    if (/^\s*%\{\s*$/.test(ln)) { block = true; out.push('<span class="hc">' + htmlEsc(ln) + '</span>'); continue; }
    if (/^\s*%%/.test(ln)) { out.push('<span class="hs">' + htmlEsc(ln) + '</span>'); continue; }
    let o = '', i = 0, prev = ''; const n = ln.length;
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
    out.push(o);
  }
  return out.join('\n') + '\n ';
}
function codeRefreshEd() {
  const ed = $('#codeEd'), hl = $('#codeHl'), gut = $('#codeGut'); if (!ed) return;
  hl.innerHTML = codeHighlight(ed.value);
  const lines = ed.value.split('\n'); let s = '';
  for (let i = 1; i <= lines.length; i++) s += (i === CODE.errLine ? '<span class="gerr">' + i + '</span>' : /^\s*%%/.test(lines[i - 1]) ? '<span class="gsec">' + i + '</span>' : i) + '\n';
  gut.innerHTML = s; codeSyncScroll();
  const st = $('#codePos'); if (st) { const a = ed.selectionStart, before = ed.value.slice(0, a), l = before.split('\n').length, c = a - before.lastIndexOf('\n'); st.textContent = `${codeDoc() ? codeDoc().name : ''}  ·  Satır ${l}, Sütun ${c}  ·  ${codeIsFuncFile(ed.value) ? 'işlev dosyası' : 'betik'}`; }
}
function codeSyncScroll() { const ed = $('#codeEd'), hl = $('#codeHl'), gut = $('#codeGut'); if (!ed) return; hl.scrollTop = ed.scrollTop; hl.scrollLeft = ed.scrollLeft; gut.scrollTop = ed.scrollTop; }

/* ---------- görünüm ---------- */
function codeBuildView() {
  const root = $('#v-code'); if (!root || root.dataset.built) return; root.dataset.built = '1';
  root.classList.add('codeview'); codeDocsLoad();
  const fileIn = h('input', {type: 'file', accept: '.m,.fig,.txt', multiple: true, hidden: true, onchange: e => { codeOpenM(e.target.files); e.target.value = ''; }});
  const matIn = h('input', {type: 'file', accept: '.mat', multiple: true, hidden: true, onchange: e => { codeLoadMatFiles(e.target.files); e.target.value = ''; }});
  const tb = h('div', {class: 'codebar'},
    btn('Çalıştır (F5)', () => codeRun('all'), 'primary', 'codeRun'), btn('Bölümü çalıştır (Ctrl+Enter)', () => codeRun('section'), '', 'codeRunSec'), btn('Seçimi çalıştır (F9)', () => codeRun('sel'), '', 'codeRunSel'), btn('Durdur', codeStop, '', 'codeStop'),
    h('span', {class: 'vsep'}),
    btn('Aç (.m / .fig)', () => fileIn.click()), btn('Kaydet (Ctrl+S)', () => codeSaveM(CODE.cur)), btn('.mat yükle', () => matIn.click(), '', 'codeMatLoad'),
    h('span', {class: 'sp'}),
    h('select', {id: 'codeEx', title: 'Örnek betikler', onchange: e => { const i = +e.target.value; e.target.value = ''; if (i >= 0 && CODE_EXAMPLES[i]) { codeStoreCur(); codeNewDoc('ornek' + (i + 1) + '.m', CODE_EXAMPLES[i][1]); } }}, h('option', {value: ''}, 'Örnekler…'), CODE_EXAMPLES.map((e, i) => h('option', {value: i}, e[0]))),
    h('select', {id: 'codeLib', title: 'Kitaplığım (bu tarayıcıda saklanan betikler)', onchange: e => { const v = e.target.value; e.target.value = ''; const l = codeLibGet().find(x => x.name === v); if (l) { codeStoreCur(); codeNewDoc(/\.m$/i.test(l.name) ? l.name : l.name + '.m', l.code); } }}),
    btn('Kitaplığa ekle', codeSaveLib), btn('İşlevler', codeFuncDialog), btn('Çalışma alanını temizle', codeReset), fileIn, matIn);
  const tabs = h('div', {id: 'codeTabs', class: 'codetabs'});
  const gut = h('pre', {id: 'codeGut', class: 'codegut', 'aria-hidden': 'true'});
  const hl = h('pre', {id: 'codeHl', class: 'codehl', 'aria-hidden': 'true'});
  const ed = h('textarea', {id: 'codeEd', class: 'codeed', spellcheck: 'false', wrap: 'off', autocomplete: 'off', autocapitalize: 'off', placeholder: "% MATLAB kodunuzu buraya yazın.  F5: çalıştır · Ctrl+Enter: bölüm (%%) · F9: seçim\n% ch('kanal_adı') açık kanalı alır, addch('ad', y, fs) sonucu ağaca ekler."});
  const edwrap = h('div', {class: 'codewrap'}, gut, h('div', {class: 'codearea'}, hl, ed));
  const pos = h('div', {id: 'codePos', class: 'codepos'});
  const out = h('pre', {id: 'codeOut', class: 'codeout'});
  const cmd = h('input', {type: 'text', id: 'codeCmd', class: 'codecmd', spellcheck: 'false', autocomplete: 'off', placeholder: 'Buraya komut yazın, Enter ile çalıştırın (ör. whos, size(x), plot(y))'});
  const ws = h('div', {id: 'codeWs', class: 'codews'});
  const lower = h('div', {class: 'codelower'},
    h('div', {class: 'codecol'}, h('div', {class: 'codehd'}, 'Komut penceresi', h('button', {class: 'mini', title: 'Konsolu temizle', onclick: () => { $('#codeOut').textContent = ''; }}, 'temizle')), h('div', {class: 'codecon', id: 'codeCon', onmouseup: () => { const sel = window.getSelection(); if (!sel || sel.isCollapsed) cmd.focus(); }}, out, h('div', {class: 'cmdrow'}, h('span', null, '>>'), cmd))),
    h('div', {class: 'codecol ws'}, h('div', {class: 'codehd'}, 'Çalışma alanı'), ws));
  root.append(tb, tabs, edwrap, pos, lower);
  ed.addEventListener('input', () => { const d = codeDoc(); d.text = ed.value; if (!d.dirty) { d.dirty = true; codeRenderTabs(); } CODE.errLine = 0; d.errLine = 0; codeRefreshEd(); codeDocsSave(); });
  ed.addEventListener('scroll', codeSyncScroll);
  ed.addEventListener('click', codeRefreshEd); ed.addEventListener('keyup', e => { if (/^Arrow|Home|End|Page/.test(e.key)) codeRefreshEd(); });
  ed.addEventListener('keydown', codeKey);
  cmd.addEventListener('keydown', e => {
    const H = CODE.hist || (CODE.hist = []);
    if (e.key === 'Enter') { const v = cmd.value; if (!v.trim()) return; H.push(v); CODE.histI = H.length; cmd.value = ''; codeRunText(v, 0, '>>', 'komut'); }
    else if (e.key === 'ArrowUp') { if (CODE.histI > 0) { CODE.histI--; cmd.value = H[CODE.histI]; } e.preventDefault(); }
    else if (e.key === 'ArrowDown') { if (CODE.histI < H.length - 1) { CODE.histI++; cmd.value = H[CODE.histI]; } else { CODE.histI = H.length; cmd.value = ''; } e.preventDefault(); }
  });
  window.addEventListener('keydown', e => { if (S.view !== 'code') return; if (e.key === 'F5') { e.preventDefault(); codeRun('all'); } else if (e.key === 'F9') { e.preventDefault(); codeRun('sel'); } });
  codeLibRefresh(); codeRunUI(false); codeRenderWs(); codeShowDoc();
}
function codeKey(e) {
  const ed = e.target, ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'F5') { e.preventDefault(); codeRun('all'); return; }
  if (e.key === 'F9' || (ctrl && e.shiftKey && e.key === 'Enter')) { e.preventDefault(); codeRun('sel'); return; }
  if (ctrl && e.key === 'Enter') { e.preventDefault(); codeRun(ed.selectionEnd > ed.selectionStart ? 'sel' : 'section'); return; }
  if (ctrl && (e.key === 's' || e.key === 'S')) { e.preventDefault(); codeSaveM(CODE.cur); return; }
  if (ctrl && (e.key === 'r' || e.key === 'R' || e.key === 't' || e.key === 'T' || e.key === '/')) { e.preventDefault(); codeComment(e.key === '/' ? 'toggle' : /r/i.test(e.key) ? 'add' : 'remove'); return; }
  if (e.key === 'Escape' && CODE.running) { codeStop(); return; }
  if (e.key === 'Tab') {
    e.preventDefault(); const a = ed.selectionStart, b = ed.selectionEnd, v = ed.value;
    if (a === b && !e.shiftKey) { ed.setRangeText('    ', a, b, 'end'); }
    else { const ls = v.lastIndexOf('\n', a - 1) + 1, le = v.indexOf('\n', b - 1 < a ? a : b - 1); const end = le < 0 ? v.length : le; const blk = v.slice(ls, end).split('\n').map(l => e.shiftKey ? l.replace(/^( {1,4}|\t)/, '') : '    ' + l).join('\n'); ed.setRangeText(blk, ls, end, 'select'); }
    ed.dispatchEvent(new Event('input')); return;
  }
  if (e.key === 'Enter' && !ctrl) {   // otomatik girinti
    e.preventDefault(); const a = ed.selectionStart, v = ed.value, ls = v.lastIndexOf('\n', a - 1) + 1, line = v.slice(ls, a), ind = /^[ \t]*/.exec(line)[0];
    const more = /^\s*(if|elseif|else|for|parfor|while|switch|case|otherwise|try|catch|function)\b/.test(line) && !/\bend\s*;?\s*(%.*)?$/.test(line) ? '    ' : '';
    ed.setRangeText('\n' + ind + more, a, ed.selectionEnd, 'end'); ed.dispatchEvent(new Event('input')); return;
  }
}
function codeComment(mode) {
  const ed = $('#codeEd'), v = ed.value, a = ed.selectionStart, b = ed.selectionEnd, ls = v.lastIndexOf('\n', a - 1) + 1; let le = v.indexOf('\n', Math.max(a, b - 1)); if (le < 0) le = v.length;
  const lines = v.slice(ls, le).split('\n'); const allC = lines.every(l => /^\s*%/.test(l) || !l.trim());
  const add = mode === 'add' || (mode === 'toggle' && !allC);
  const blk = lines.map(l => add ? (l.trim() ? '% ' + l : l) : l.replace(/^(\s*)% ?/, '$1')).join('\n');
  ed.setRangeText(blk, ls, le, 'select'); ed.dispatchEvent(new Event('input'));
}
function codeShown() { codeBuildView(); codeLibRefresh(); syncWelcome(); setTimeout(codeRefreshEd, 0); }
function codeSetText(t) { codeBuildView(); const ed = $('#codeEd'); ed.value = t; ed.dispatchEvent(new Event('input')); }
function codeLibRefresh() { const s = $('#codeLib'); if (!s) return; s.replaceChildren(h('option', {value: ''}, 'Kitaplığım…'), codeLibGet().map(l => h('option', {value: l.name}, l.name))); }
function codeSaveLib() {
  codeStoreCur(); const d = codeDoc();
  const inp = h('input', {type: 'text', id: 'codeLibName', value: d.name.replace(/\.m$/i, ''), placeholder: 'Betik adı', style: 'width:100%'});
  const list = codeLibGet();
  modal('Betiği kitaplığa ekle', h('div', null, inp, h('div', {class: 'note'}, 'Kitaplık yalnızca bu tarayıcıda (bu bilgisayarda) tutulur. Aynı adla kayıt üzerine yazar. Dosya olarak saklamak için “Kaydet (Ctrl+S)” kullanın.'),
    list.length ? h('div', {style: 'margin-top:8px'}, h('b', null, 'Mevcut: '), list.map(l => h('span', {class: 'chip', style: 'margin:2px', onclick: () => { inp.value = l.name; }}, l.name, h('button', {title: 'Sil', onclick: ev => { ev.stopPropagation(); codeLibSet(codeLibGet().filter(x => x.name !== l.name)); codeLibRefresh(); ev.target.parentElement.remove(); }}, '×')))) : null),
    [{t: 'Ekle', primary: true, fn: () => { const n = inp.value.trim(); if (!n) { toast('Ad girin'); return false; } const l = codeLibGet().filter(x => x.name !== n); l.push({name: n, code: d.text}); codeLibSet(l); codeLibRefresh(); toast('Kitaplığa eklendi: ' + n); } }, {t: 'Vazgeç'}]);
  setTimeout(() => inp.focus(), 50);
}
async function codeSaveM(i) {
  codeStoreCur(); const d = CODE.docs[i]; if (!d) return;
  // Windows'ta MATLAB eski sürümleri .m dosyalarını Windows-1254 bekleyebilir; UTF-8 (BOM'suz) yazılır, MATLAB R2020a+ bunu okur
  await saveBlob(new Blob([d.text.replace(/\n/g, '\r\n')], {type: 'text/plain'}), d.name);
  d.dirty = false; codeRenderTabs(); codeDocsSave();
}
async function codeReadM(f) {
  const b = new Uint8Array(await f.arrayBuffer());
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return new TextDecoder('utf-8').decode(b.subarray(3));
  if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
  try { return new TextDecoder('utf-8', {fatal: true}).decode(b); } catch (_) { return new TextDecoder('windows-1254').decode(b); }   // Türkçe Windows (ı ş ğ)
}
async function codeOpenM(files) {
  files = [...files]; if (!files.length) return; codeBuildView(); switchView('code'); codeStoreCur(); let n = 0;
  for (const f of files) {
    if (/\.fig$/i.test(f.name)) { await figFileOpen(f); continue; }
    if (/\.mat$/i.test(f.name)) { await codeLoadMatFiles([f]); continue; }
    let txt; try { txt = await codeReadM(f); } catch (e) { toast('Okunamadı: ' + f.name + ' — ' + e.message); continue; }
    codeNewDoc(f.name.replace(/\.txt$/i, '.m'), txt.replace(/\r\n?/g, '\n'), {replace: true}); n++;
  }
  if (n) toast(n === 1 ? files.find(f => /\.(m|txt)$/i.test(f.name)).name + ' açıldı' : n + ' dosya açıldı');
}
function codeOut(s, kind) {
  const o = $('#codeOut'); if (!o) return; if (kind === 'clc') { o.textContent = ''; return; }
  let sp; if (kind === 'err') sp = h('span', {class: 'cerr'}, s); else if (kind === 'warn') sp = h('span', {class: 'cwarn'}, s); else if (kind === 'cmd') sp = h('span', {class: 'ccmd'}, s); else sp = document.createTextNode(s);
  o.append(sp); if (o.childNodes.length > 4000) { while (o.childNodes.length > 3000) o.removeChild(o.firstChild); }
  const c = o.parentElement; if (c) c.scrollTop = c.scrollHeight;
}
function codeRunUI(run) { CODE.running = run; for (const id of ['codeRun', 'codeRunSec', 'codeRunSel', 'codeMatLoad']) { const b = $('#' + id); if (b) b.disabled = run; } const s = $('#codeStop'); if (s) s.disabled = !run; const c = $('#codeCmd'); if (c) c.disabled = run; }
function codeRenderWs() {
  const w = $('#codeWs'); if (!w) return;
  if (!CODE.ws.length) { w.replaceChildren(h('div', {class: 'note', style: 'padding:6px'}, 'Değişken yok. Kod çalıştırınca ya da “.mat yükle” ile burada listelenir.')); return; }
  const t = h('table', {class: 'wst'}, h('tr', null, h('th', null, 'Ad'), h('th', null, 'Boyut'), h('th', null, 'Sınıf'), h('th', null, 'Değer')),
    CODE.ws.map(v => h('tr', {title: 'Çift tık: komut penceresinde göster', ondblclick: () => codeRunText(v.n, 0, '>>', 'komut')}, h('td', {class: 'b'}, v.n), h('td', null, v.sz), h('td', null, v.cls), h('td', {title: v.val}, v.val))));
  w.replaceChildren(t);
}
/* ---------- MAT ağacı ↔ değer (işçi tarafında kullanılan kod metni) ---------- */
const ML_TREE_SRC = `
function mlFromTree(t) {
  const ML = MLAB;
  if (!t || t.k === 'skip') return null;
  if (t.k === 'num') { const m = new ML.M(1, 1, t.re, t.im && t.im.some(v => v !== 0) ? t.im : null, t.cls); ML.setDims(m, t.dims.length ? t.dims : [0, 0]); if (t.cls === 'c' && m.nd) { m.nd = undefined; } return m; }
  if (t.k === 'cell') { const d = t.dims, r = d[0] || 0, c = d.slice(1).reduce((a, b) => a * b, 1); return {cell: true, r, c, v: t.v.map(x => mlFromTree(x) || ML.empty())}; }
  if (t.k === 'struct') { const d = t.dims, r = d[0] || 0, c = d.slice(1).reduce((a, b) => a * b, 1); return {sa: true, r, c, v: t.v.map(o => { const q = Object.create(null); for (const k of t.f) { const x = mlFromTree(o[k]); q[k] = x == null ? ML.empty() : x; } return q; })}; }
  return null;
}
function mlToTree(v, skipped, path) {
  const ML = MLAB;
  if (v instanceof ML.M) return {k: 'num', cls: v.t, dims: ML.sizeOf(v), re: v.re, im: v.im};
  if (ML.isCell(v)) return {k: 'cell', dims: [v.r, v.c], v: v.v.map((x, i) => mlToTree(x, skipped, path + '{' + (i + 1) + '}') || {k: 'num', cls: 'd', dims: [0, 0], re: new Float64Array(0)})};
  if (ML.isSA(v)) { const f = v.v.length ? Object.keys(v.v[0]) : []; return {k: 'struct', dims: [v.r, v.c], f, v: v.v.map(o => { const q = {}; for (const k of f) q[k] = mlToTree(o[k], skipped, path + '.' + k) || {k: 'num', cls: 'd', dims: [0, 0], re: new Float64Array(0)}; return q; })}; }
  skipped.push(path); return null;
}`;
/* ---------- işçi ---------- */
// Engelleyen istekler (uigetfile, questdlg, dosya okuma…) için paylaşımlı bellek: MATView.exe bunu etkinleştirir.
const CODE_MAILBOX = 8 << 20;
function codeWorkerSrc() {
  return __ML_SRC + ML_TREE_SRC + `
;(function(){
  let it = null, cur = null, added = [], saved = [], pend = '', pendKind = 'o', total = 0, ctl = null, box = null, lastGuiVer = -1;
  const flush = () => { if (pend) { postMessage({t: 'out', s: pend, k: pendKind}); pend = ''; } };
  const out = (s, k) => { k = k || 'o'; if (k === 'clc') { flush(); postMessage({t: 'out', s: '', k: 'clc'}); return; } total += s.length; if (total > 3e6) { if (total - s.length <= 3e6) { pend += '\\n[Çıktı sınırı aşıldı; kalan çıktı gösterilmeyecek]\\n'; } return; } if (k !== pendKind) { flush(); pendKind = k; } pend += s; if (pend.length > 20000) flush(); };
  const summarize = (v) => { const sz = MLAB.sizeOf(v); let val = ''; try { if (v instanceof MLAB.M) { if (v.t === 'c' && v.r <= 1) val = "'" + MLAB.toStr(v).slice(0, 60) + "'"; else if (v.re.length === 1) val = MLAB.fmtScalar(v, 0); else if (v.re.length === 0) val = '[]'; else { const k = Math.min(v.re.length, 6), p = []; for (let i = 0; i < k; i++) p.push(MLAB.fmtNumShort(v.re[i])); val = '[' + p.join(' ') + (v.re.length > k ? ' …' : '') + ']'; } } else if (MLAB.isFH(v)) val = MLAB.fhText(v); else if (MLAB.isCell(v)) val = '{' + sz.join('×') + ' cell}'; else if (MLAB.isSA(v)) val = Object.keys(v.v[0] || {}).join(', '); else if (v && v.gh) val = '<' + v.cls.split('.').pop() + ' ' + v.id + '>'; } catch (e) {} return {n: '', sz: sz.join('×'), cls: MLAB.classOf(v), val}; };
  const wsList = () => { const ws = []; if (it) for (const [k, v] of it.base.vars) { const s = summarize(v); s.n = k; ws.push(s); } ws.sort((a, b) => a.n < b.n ? -1 : 1); return ws; };
  // engelleyen istek: ana iş parçacığı yanıtı paylaşımlı belleğe yazar
  const dec = new TextDecoder(), enc = new TextEncoder();
  function rpcRaw(kind, payload) {
    if (!ctl) return undefined;
    flush(); Atomics.store(ctl, 0, 0); postMessage({t: 'rpc', kind, payload});
    for (;;) { const r = Atomics.wait(ctl, 0, 0, 60000); if (Atomics.load(ctl, 0) !== 0) break; if (it && it.stop) break; }
    const st = Atomics.load(ctl, 0), len = ctl[1]; Atomics.store(ctl, 0, 0);
    if (st === 3) throw new MLAB.MLError('Çalışma durduruldu.', 0, 'MATLAB:interrupted');
    return {bin: st === 2, bytes: box.slice(0, len)};
  }
  function rpc(kind, payload) { const r = rpcRaw(kind, payload); if (r === undefined) return undefined; const v = JSON.parse(dec.decode(r.bytes)); if (v && v.err) throw new MLAB.MLError(v.err, 0, 'MATLAB:rpc'); return v ? v.v : null; }
  function readFile(name, off, len) { const o = new Uint8Array(len); let p = 0; while (p < len) { const n = Math.min(box.length, len - p); const r = rpcRaw('read', {name, off: off + p, len: n}); if (!r || !r.bin) throw new MLAB.MLError('Dosya okunamadı: ' + name, 0, 'MATLAB:fread'); o.set(r.bytes, p); p += r.bytes.length; if (r.bytes.length < n) break; } return p === len ? o : o.subarray(0, p); }
  function loadMatRpc(name) { const meta = rpc('loadmat', name); if (!meta) return null; const all = new Uint8Array(meta.size); let p = 0; while (p < meta.size) { const r = rpcRaw('blob', {off: p, len: Math.min(box.length, meta.size - p)}); all.set(r.bytes, p); p += r.bytes.length; if (!r.bytes.length) break; } const jl = new DataView(all.buffer).getUint32(0, true), js = JSON.parse(dec.decode(all.subarray(4, 4 + jl))); let off = 4 + jl; const bufs = js.bufs.map(n => { const b = new Float64Array(all.slice(off, off + n * 8).buffer); off += n * 8; return b; }); const fix = t => { if (!t) return t; if (t.k === 'num') { t.re = bufs[t.re]; if (t.im != null) t.im = bufs[t.im]; } else if (t.k === 'cell') t.v.forEach(fix); else if (t.k === 'struct') t.v.forEach(o => { for (const k in o) fix(o[k]); }); return t; }; const o = Object.create(null); for (const t of js.trees) { fix(t); const v = mlFromTree(t); if (v != null) o[t.name] = v; } return o; }
  const guiPost = force => { if (!it || !it.G) return; if (!force && it.G.ver === lastGuiVer) return; lastGuiVer = it.G.ver; const g = MLAB.guiSnapshot(it, force === 'full'); postMessage({t: 'gui', figs: g}); };
  const mkCtx = () => ({
    getChannel: n => cur.chans[n] || null, listChannels: () => cur.names, scripts: cur.scripts || {},
    addChannel: (n, y, fs) => { added.push({n, y, fs}); },
    loadMat: n => { const m = cur.mats[n] || cur.mats[n + '.mat']; if (!m) return null; const o = Object.create(null); for (const t of m) { const v = mlFromTree(t); if (v != null) o[t.name] = v; } return o; },
    loadMatRpc: n => ctl ? loadMatRpc(n) : null,
    saveMat: (n, vars) => { const sk = [], trees = []; for (const k in vars) { const t = mlToTree(vars[k], sk, k); if (t) { t.name = k; trees.push(t); } } saved.push({name: n, trees, skipped: sk}); },
    figLayout: n => { const f = cur.figs || {}; const k = Object.keys(f).find(x => x.toLowerCase() === (n + '.fig').toLowerCase() || x.toLowerCase() === n.toLowerCase()); return k ? f[k] : (ctl ? rpc('fig', n) : null); },
    notify: (kind, payload) => { flush(); if (kind === 'download') postMessage({t: 'note', kind, payload}, [payload.bytes.buffer]); else postMessage({t: 'note', kind, payload}); },
    rpc: ctl ? rpc : null, readFile: ctl ? readFile : null, statFile: n => ctl ? rpc('stat', n) : null,
    flushGui: () => { flush(); guiPost(true); }, sleep: ms => { if (ctl) { const z = new Int32Array(new SharedArrayBuffer(4)); Atomics.wait(z, 0, 0, ms); } },
  });
  function errOf(e, lineOff) {
    if (e instanceof MLAB.MLError) { const ln = e.mline || it.cur || 0; return {msg: e.message, file: e.mfile || '', fn: e.mfn || '', line: e.mfile ? ln : (ln ? ln + (lineOff || 0) : 0), id: e.mid}; }
    if (e instanceof RangeError) return {msg: 'Özyineleme/bellek sınırı aşıldı: ' + e.message, line: (it.cur || 0) + (lineOff || 0)};
    return {msg: 'İç hata: ' + (e && e.message || e), line: 0};
  }
  function finish(d, err) {
    flush();
    const gids = new Set(MLAB.guiFigIds(it));
    const figs = []; if (it.figs) for (const [id, f] of it.figs) if (!gids.has(id)) figs.push({id, rows: f.rows, cols: f.cols, title: f.title, axes: f.axes.map(a => ({r: a.r, c: a.c, p: a.p, title: a.title, xlabel: a.xlabel, ylabel: a.ylabel, xlim: a.xlim, ylim: a.ylim, grid: a.grid, legend: a.legend, xscale: a.xscale, yscale: a.yscale, traces: a.traces.map(t => ({x: t.x, y: t.y, name: t.name, color: t.color, dash: t.dash, marker: t.marker, noLine: t.noLine, lw: t.lw, kind: t.kind}))}))});
    guiPost(true);
    postMessage({t: 'done', id: d.id, err, ws: wsList(), figs, added, saved, curFig: it.curFig || 0, gui: gids.size > 0});
  }
  onmessage = ev => {
    const d = ev.data;
    if (d.t === 'init') { if (d.ctl) { ctl = new Int32Array(d.ctl); box = new Uint8Array(d.box); } return; }
    if (d.t === 'reset') { it = null; lastGuiVer = -1; postMessage({t: 'ws', ws: []}); postMessage({t: 'gui', figs: []}); return; }
    if (d.t === 'setvars') { if (!it) it = new MLAB.Interp({out, ctx: {}}); let n = 0; for (const t of d.trees) { const v = mlFromTree(t); if (v != null) { it.setVar(it.base, t.name, v); n++; } } postMessage({t: 'ws', ws: wsList(), msg: n + ' değişken yüklendi (' + d.file + ')' + (d.trees.length > n ? '; ' + (d.trees.length - n) + ' desteklenmeyen değişken atlandı' : '')}); return; }
    if (d.t === 'vfs') { if (!it) it = new MLAB.Interp({out, ctx: {}}); MLAB.vfsAdd(it, d.name, new Uint8Array(d.buf)); return; }
    if (d.t === 'cb') {   // arayüz olayı
      if (!it) { postMessage({t: 'done', id: d.id, err: {msg: 'Arayüz kapandı (çalışma alanı sıfırlanmış).', line: 0}, ws: [], figs: null, added: [], saved: []}); return; }
      cur = Object.assign({}, cur || {chans: {}, names: [], mats: {}}); added = []; saved = []; total = 0; pend = ''; pendKind = 'o';
      it.ctx = mkCtx(); it.out = out; it.stop = false; it.deadline = Date.now() + 3600000;
      let err = null;
      try { if (d.props) MLAB.guiSetFromUI(it, d.oid, d.props); MLAB.guiCallback(it, d.oid, d.kind); } catch (e) { err = errOf(e, 0); }
      finish(d, err); return;
    }
    cur = d; added = []; saved = []; total = 0; pend = ''; pendKind = 'o';
    const ctx = mkCtx();
    if (!it) it = new MLAB.Interp({out, ctx}); else { it.ctx = ctx; it.out = out; }
    it.stop = false; it.deadline = Date.now() + (d.timeout || 600000); it.figs = it.figs || new Map(); it.curFile = d.label;
    let err = null;
    try {
      for (const lib of d.libs || []) it.loadFile(lib.text, lib.name);
      it.run(d.code);
    } catch (e) { err = errOf(e, d.lineOff); }
    finish(d, err);
  };
})();`;
}
function codeEnsureWorker() {
  if (CODE.worker || CODE.noWorker) return CODE.worker;
  try {
    if (typeof Worker === 'undefined' || typeof __ML_SRC !== 'string') throw new Error('yok');
    const w = new Worker(URL.createObjectURL(new Blob([codeWorkerSrc()], {type: 'text/javascript'})));
    w.onmessage = e => codeOnMsg(e.data); w.onerror = e => { logErr('kod-işçi', e.message || 'hata'); CODE.noWorker = true; CODE.worker = null; try { w.terminate(); } catch (_) {} if (CODE.pendingRun) { codeOut('Arka plan işçisi başlatılamadı; ana iş parçacığında çalıştırılıyor.\n', 'warn'); const p = CODE.pendingRun; CODE.pendingRun = null; codeRunMain(p); } };
    CODE.worker = w;
    CODE.sab = null; try { if (typeof SharedArrayBuffer === 'function') { const c = new SharedArrayBuffer(16), b = new SharedArrayBuffer(CODE_MAILBOX); w.postMessage({t: 'init', ctl: c, box: b}); CODE.sab = {ctl: new Int32Array(c), box: new Uint8Array(b)}; } } catch (_) { CODE.sab = null; }
    for (const [name, f] of CODE.vfs) codeVfsPush(name, f);
  } catch (e) { CODE.noWorker = true; CODE.worker = null; }
  return CODE.worker;
}
function codeOnMsg(m) {
  if (m.t === 'out') { codeOut(m.s, m.k === 'e' ? 'err' : m.k); return; }
  if (m.t === 'ws') { CODE.ws = m.ws || []; codeRenderWs(); if (m.msg) codeOut(m.msg + '\n', 'warn'); return; }
  if (m.t === 'gui') { guiUpdate(m.figs || []); return; }
  if (m.t === 'note') { guiNote(m.kind, m.payload); return; }
  if (m.t === 'rpc') { guiRpc(m.kind, m.payload); return; }
  if (m.t === 'done') codeFinish(m);
}
function codeGotoLine(docIdx, line) {
  if (docIdx < 0) return; if (docIdx !== CODE.cur) { codeStoreCur(); CODE.cur = docIdx; codeShowDoc(); }
  const ed = $('#codeEd'), lines = ed.value.split('\n'); let pos = 0; for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
  CODE.errLine = line; codeDoc().errLine = line; ed.focus(); ed.setSelectionRange(pos, pos + (lines[line - 1] || '').length);
  const lh = parseFloat(getComputedStyle(ed).lineHeight) || 19; ed.scrollTop = Math.max(0, (line - 6) * lh); codeRefreshEd();
}
async function codeFinish(m) {
  const run = CODE.pendingRun; CODE.pendingRun = null; codeRunUI(false);
  if (m.err) {
    const e = m.err, fileTxt = e.file ? e.file + (e.fn && e.file.replace(/\.m$/i, '') !== e.fn ? ' › ' + e.fn : '') : (run && run.label) || '';
    codeOut(`Hata${fileTxt ? ' — ' + fileTxt : ''}${e.line ? ' (satır ' + e.line + ')' : ''}: ${e.msg}\n`, 'err');
    if (e.line && run && run.label !== '>>') { const di = e.file ? CODE.docs.findIndex(d => d.name.toLowerCase() === e.file.toLowerCase()) : run.docIdx; if (di >= 0) codeGotoLine(di, e.line); }
  } else { CODE.errLine = 0; if (codeDoc()) codeDoc().errLine = 0; codeRefreshEd(); }
  CODE.ws = m.ws || []; codeRenderWs();
  if (m.added && m.added.length) { let n = 0; for (const a of m.added) { const src = CODE.srcFor && CODE.srcFor.find(c => c.n === a.y.length); const c = addDerived(cleanName(a.n), a.y, null); if (src && src.n === a.y.length && Math.abs(src.fs - a.fs) < 1e-9 * Math.max(1, a.fs)) c.copyTiming(src); else { c.g = null; c.t0 = 0; c.dtS = 1 / a.fs; } if (src && src.unit) c.unit = src.unit; n++; } toast(n + ' kanal eklendi (Türetilmiş kanallar)'); }
  for (const sv of m.saved || []) { try { const fn = sv.name.split(/[\\/]/).pop(), a = document.createElement('a'); a.href = URL.createObjectURL(mlWriteMat(sv.trees)); a.download = fn; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); codeOut(`${fn} indirildi (tarayıcının İndirilenler klasörü).\n`, 'warn'); if (sv.skipped.length) codeOut(`Uyarı: ${sv.name} içine yazılamayan değerler atlandı: ${sv.skipped.slice(0, 8).join(', ')}${sv.skipped.length > 8 ? '…' : ''} (işlev tutamacı vb.)\n`, 'warn'); } catch (e) { codeOut('Kaydedilemedi: ' + e.message + '\n', 'err'); } }
  if (m.figs) { CODE.figs = m.figs; CODE.figIdx = Math.max(0, m.figs.findIndex(f => f.id === m.curFig)); const fb = document.querySelector('#viewtabs button[data-v=fig]'); if (fb) fb.classList.toggle('hidden', !m.figs.length); if (m.figs.length && CODE.figsTouched) switchView('fig'); }
  CODE.figsTouched = false;
  guiAfterRun();
}
function codeStop() {
  if (!CODE.running) return;
  if (CODE.worker) { try { CODE.worker.terminate(); } catch (_) {} CODE.worker = null; CODE.ws = []; codeRenderWs(); codeOut('Durduruldu. (Çalışma alanı sıfırlandı' + (CODE.gui.figs.length ? ', açık arayüz kapatıldı' : '') + '.)\n', 'warn'); codeRunUI(false); CODE.pendingRun = null; CODE.gui.queue = []; guiUpdate([]); }
  else if (CODE.mainIt) CODE.mainIt.stop = true;
}
function codeReset() { if (CODE.running) return toast('Önce çalışmayı durdurun'); if (CODE.worker) CODE.worker.postMessage({t: 'reset'}); CODE.mainIt = null; CODE.ws = []; CODE.figs = []; const fb = document.querySelector('#viewtabs button[data-v=fig]'); if (fb) fb.classList.add('hidden'); codeRenderWs(); codeOut('Çalışma alanı temizlendi.\n', 'warn'); }
/* ---------- .mat dosyalarını çalışma alanına yükleme ---------- */
CODE.matFiles = new Map();   // ad → ağaç listesi (load('ad') için)
async function matTrees(m, fname) {
  if (!m.h5) return MAT.readAll(m);
  const out = []; for (const v of m.vars) { if (!v.numeric || /[.{(]/.test(v.name) || !v.dims) continue; try { const d = await MAT.load(m, v); const dims = v.dims.slice(); out.push({k: 'num', name: v.name, cls: 'd', dims, re: Float64Array.from(d)}); } catch (_) {} } return out;
}
async function codeLoadMatFiles(files) {
  codeBuildView(); if (CODE.running) return toast('Önce çalışmayı durdurun');
  for (const f of files) {
    await busy('Yükleniyor: ' + f.name, async () => {
      try {
        const m = await MAT.open(f), trees = await matTrees(m, f.name); CODE.matFiles.set(f.name.toLowerCase(), trees);
        const w = codeEnsureWorker();
        if (w) w.postMessage({t: 'setvars', trees, file: f.name});
        else { const ML = MLAB; if (!CODE.mainIt) CODE.mainIt = new ML.Interp({out: (s, k) => codeOut(s, k), ctx: {}}); const fromTree = new Function('MLAB', ML_TREE_SRC + '; return mlFromTree;')(ML); for (const t of trees) { const v = fromTree(t); if (v != null) CODE.mainIt.setVar(CODE.mainIt.base, t.name, v); } codeOut(trees.length + ' değişken yüklendi (' + f.name + ')\n', 'warn'); }
        codeOut(`>> load('${f.name}')   % ${trees.map(t => t.name).slice(0, 12).join(', ')}${trees.length > 12 ? ' …' : ''}\n`, 'cmd');
      } catch (e) { codeOut('Yüklenemedi: ' + f.name + ' — ' + e.message + '\n', 'err'); }
    });
  }
}
/* ---------- çalıştırma ---------- */
function codeStrings(src) { const s = new Set(); const re = /'((?:[^'\n]|'')*)'|"((?:[^"\n]|"")*)"/g; let m; while ((m = re.exec(src))) { const v = (m[1] != null ? m[1].replace(/''/g, "'") : m[2].replace(/""/g, '"')); if (v && v.length < 200) s.add(v); } return [...s]; }
async function codeGather(src) {
  const chans = {}, srcFor = []; const names = []; for (const f of allFiles()) for (const c of f.channels) { if (names.length < 20000) names.push(c.name); }
  const lits = codeStrings(src), mats = {};
  for (const lit of lits) {
    const low = lit.toLowerCase(), lowM = /\.mat$/.test(low) ? low : low + '.mat';
    if (CODE.matFiles.has(lowM)) { mats[lit] = CODE.matFiles.get(lowM); continue; }
    const f = S.files.find(x => x.mat && x.name.toLowerCase() === lowM);
    if (f) { try { const trees = await matTrees(f.mat, f.name); CODE.matFiles.set(lowM, trees); mats[lit] = trees; } catch (_) {} continue; }
    if (/\.mat$/.test(low)) continue;
    if (chans[lit]) continue; let c = null; try { c = resolveChannel(lit); } catch (_) { continue; }
    await ensureLoaded(c); const d = new Float64Array(c.data); if (c.del) for (let i = 0; i < d.length; i++) if (c.del[i]) d[i] = NaN;
    let time = null; if (c.g) { time = new Float64Array(d.length); for (let i = 0; i < d.length; i++) time[i] = c.t(i); }
    chans[lit] = {data: d, fs: c.fs, time}; srcFor.push(c);
  }
  return {chans, names, mats, srcFor};
}
function codeSection(v, pos) {   // imleçteki %% bölümü
  const lines = v.split('\n'); let li = v.slice(0, pos).split('\n').length - 1, a = li, b = li;
  while (a > 0 && !/^\s*%%/.test(lines[a])) a--; if (!/^\s*%%/.test(lines[a])) a = 0;
  b = a + 1; while (b < lines.length && !/^\s*%%/.test(lines[b])) b++;
  return {code: lines.slice(a, b).join('\n'), lineOff: a};
}
async function codeRun(mode) {
  codeBuildView(); if (CODE.running) return; codeStoreCur();
  const ed = $('#codeEd'), d = codeDoc(); let code = ed.value, lineOff = 0, what = 'betik';
  if (mode === 'sel') { const a = ed.selectionStart, b = ed.selectionEnd; if (b > a) { code = ed.value.slice(a, b); lineOff = ed.value.slice(0, a).split('\n').length - 1; } else { const before = ed.value.slice(0, a), ls = before.lastIndexOf('\n') + 1; let le = ed.value.indexOf('\n', a); if (le < 0) le = ed.value.length; code = ed.value.slice(ls, le); lineOff = before.split('\n').length - 1; } what = 'seçim'; }
  else if (mode === 'section') { const s = codeSection(ed.value, ed.selectionStart); code = s.code; lineOff = s.lineOff; what = 'bölüm (satır ' + (lineOff + 1) + ')'; }
  if (!code.trim()) return toast('Çalıştırılacak kod yok');
  if (mode === 'all' && codeIsFuncFile(code)) {   // MATLAB gibi: işlev dosyası F5 ile argümansız çağrılır (GUIDE arayüzleri böyle açılır)
    const fn = (/^\s*function\s+(?:\[[^\]]*\]\s*=\s*|\w+\s*=\s*)?(\w+)/m.exec(code) || [])[1] || d.name.replace(/\.m$/i, '');
    const needs = (/^\s*function[^\n(]*\(([^)]*)\)/m.exec(code) || [])[1];
    if (needs && needs.split(',').map(x => x.trim()).filter(x => x && x !== 'varargin').length) { codeOut(`“${d.name}” giriş argümanı isteyen bir işlev; komut satırından çağırın, örn. ${fn}(...)\n`, 'warn'); return; }
    await codeRunText(fn, 0, d.name, 'işlev', CODE.cur, true); return;
  }
  await codeRunText(code, lineOff, d.name, what, CODE.cur);
}
async function codeRunText(code, lineOff, label, what, docIdx, asFunc) {
  if (CODE.running) return; codeBuildView(); codeStoreCur();
  codeRunUI(true); if (label !== '>>') { CODE.errLine = 0; if (codeDoc()) codeDoc().errLine = 0; codeRefreshEd(); }
  codeOut(label === '>>' ? '>> ' + code + '\n' : `>> ${label}: ${what} çalıştırılıyor\n`, 'cmd');
  const libs = [], scripts = {}; let allSrc = code;
  CODE.docs.forEach((x, i) => { if (i === docIdx && what === 'betik') return; const nm = x.name.replace(/\.m$/i, ''); if (codeIsFuncFile(x.text)) { libs.push({name: x.name, text: x.text}); allSrc += '\n' + x.text; } else if (/^[A-Za-z]\w*$/.test(nm)) { scripts[nm] = x.text; if (new RegExp('\\b' + nm + '\\b').test(code)) allSrc += '\n' + x.text; } });
  let g; try { g = await codeGather(allSrc); } catch (e) { codeOut('Hata: ' + e.message + '\n', 'err'); codeRunUI(false); return; }
  CODE.srcFor = g.srcFor; CODE.figsTouched = /\b(plot|figure|subplot|semilogx|semilogy|loglog|bar|hist|histogram|stem|scatter|nexttile)\s*[\(\s;,]/.test(allSrc);
  const msg = {t: 'run', id: ++CODE.runId, code, lineOff, label, docIdx: docIdx == null ? -1 : docIdx, libs, scripts, chans: g.chans, names: g.names, mats: g.mats, figs: Object.fromEntries(CODE.figFiles), timeout: 3600000};
  if (codeEnsureWorker()) { CODE.pendingRun = msg; CODE.worker.postMessage(msg); } else { CODE.pendingRun = msg; codeRunMain(msg); }
}
function codeMainLib() { return MLAB; }
async function codeRunMain(msg) {
  await new Promise(r => setTimeout(r, 20)); const ML = codeMainLib(), T = new Function('MLAB', ML_TREE_SRC + '; return {mlFromTree, mlToTree};')(ML);
  const added = [], saved = []; let err = null;
  const ctx = {getChannel: n => msg.chans[n] || null, listChannels: () => msg.names, scripts: msg.scripts, addChannel: (n, y, fs) => added.push({n, y, fs}),
    loadMat: n => { const m = msg.mats[n]; if (!m) return null; const o = Object.create(null); for (const t of m) { const v = T.mlFromTree(t); if (v != null) o[t.name] = v; } return o; },
    saveMat: (n, vars) => { const sk = [], trees = []; for (const k in vars) { const t = T.mlToTree(vars[k], sk, k); if (t) { t.name = k; trees.push(t); } } saved.push({name: n, trees, skipped: sk}); }};
  if (!CODE.mainIt) CODE.mainIt = new ML.Interp({out: (s, k) => codeOut(s, k === 'e' ? 'err' : k), ctx}); const it = CODE.mainIt; it.ctx = ctx; it.stop = false; it.deadline = Date.now() + 60000; it.figs = it.figs || new Map();
  try { for (const lib of msg.libs) it.loadFile(lib.text, lib.name); it.run(msg.code); } catch (e) { if (e instanceof ML.MLError) { const ln = e.mline || it.cur || 0; err = {msg: e.message, file: e.mfile || '', fn: e.mfn || '', line: e.mfile ? ln : (ln ? ln + msg.lineOff : 0)}; } else err = {msg: 'İç hata: ' + e.message, line: 0}; }
  const ws = []; for (const [k, v] of it.base.vars) { const sz = ML.sizeOf(v); let val = ''; if (v instanceof ML.M && v.re.length === 1) val = ML.fmtScalar(v, 0); else if (v instanceof ML.M && v.t === 'c') val = "'" + ML.toStr(v).slice(0, 60) + "'"; ws.push({n: k, sz: sz.join('×'), cls: ML.classOf(v), val}); } ws.sort((a, b) => a.n < b.n ? -1 : 1);
  const figs = []; for (const [id, f] of it.figs) figs.push({id, rows: f.rows, cols: f.cols, title: f.title, axes: f.axes});
  codeFinish({err, ws, figs, added, saved, curFig: it.curFig || 0});
}
/* ---------- MAT v5 yazıcı (ağaçtan; N boyut, tamsayı, mantıksal, karakter, hücre, yapı) ---------- */
function mlWriteMat(trees) {
  const parts = [], hdr = new Uint8Array(128), txt = 'MATLAB 5.0 MAT-file, MATView Kod sekmesi ile olusturuldu';
  for (let i = 0; i < 116; i++) hdr[i] = i < txt.length ? txt.charCodeAt(i) : 32; hdr[124] = 0; hdr[125] = 1; hdr[126] = 0x49; hdr[127] = 0x4D; parts.push(hdr);
  const CLS = {d: [6, 9, 8, Float64Array], s: [7, 7, 4, Float32Array], i8: [8, 1, 1, Int8Array], u8: [9, 2, 1, Uint8Array], i16: [10, 3, 2, Int16Array], u16: [11, 4, 2, Uint16Array], i32: [12, 5, 4, Int32Array], u32: [13, 6, 4, Uint32Array], i64: [14, 12, 8, BigInt64Array], u64: [15, 13, 8, BigUint64Array], c: [4, 4, 2, Uint16Array], l: [9, 2, 1, Uint8Array]};
  const sub = (type, bytes) => { const pad = (8 - bytes.length % 8) % 8, o = new Uint8Array(8 + bytes.length + pad), dv = new DataView(o.buffer); dv.setUint32(0, type, true); dv.setUint32(4, bytes.length, true); o.set(bytes, 8); return o; };
  const cat = arrs => { let n = 0; for (const a of arrs) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };
  const i32 = a => new Uint8Array(Int32Array.from(a).buffer), txtB = s => Uint8Array.from(Array.from(s, c => c.charCodeAt(0) & 0x7F));
  const conv = (re, ctor) => { if (ctor === BigInt64Array || ctor === BigUint64Array) return new Uint8Array(ctor.from(re, v => BigInt(Math.round(v))).buffer); return new Uint8Array(ctor.from(re).buffer); };
  function mat(t, name) {
    const flags = new Uint8Array(8), fdv = new DataView(flags.buffer); let body;
    if (t.k === 'num') {
      const c = CLS[t.cls] || CLS.d; fdv.setUint32(0, c[0] | (t.im ? 0x800 : 0) | (t.cls === 'l' ? 0x200 : 0), true);
      const dims = t.dims.length >= 2 ? t.dims : [t.dims[0] || 0, 1], ps = [sub(6, flags), sub(5, i32(dims)), sub(1, txtB(name)), sub(c[1], conv(t.re, c[3]))]; if (t.im) ps.push(sub(c[1], conv(t.im, c[3]))); body = cat(ps);
    } else if (t.k === 'cell') { fdv.setUint32(0, 1, true); body = cat([sub(6, flags), sub(5, i32(t.dims)), sub(1, txtB(name)), ...t.v.map(x => mat(x, ''))]); }
    else { fdv.setUint32(0, 2, true); const L = Math.max(...t.f.map(f => f.length), 1) + 1, nm = new Uint8Array(L * t.f.length); t.f.forEach((f, i) => nm.set(txtB(f), i * L)); const ps = [sub(6, flags), sub(5, i32(t.dims)), sub(1, txtB(name)), sub(5, i32([L])), sub(1, nm)]; for (const o of t.v) for (const f of t.f) ps.push(mat(o[f], '')); body = cat(ps); }
    const head = new Uint8Array(8), hv = new DataView(head.buffer); hv.setUint32(0, 14, true); hv.setUint32(4, body.length, true); return cat([head, body]);
  }
  for (const t of trees) parts.push(mat(t, t.name.slice(0, 63)));
  return new Blob(parts, {type: 'application/octet-stream'});
}
/* ---------- .fig (GUIDE arayüzü) önizlemesi ---------- */
async function figFileOpen(file) {
  let trees; try { const m = await MAT.open(file); trees = await MAT.readAll(m); } catch (e) { toast('.fig okunamadı: ' + e.message); return; }
  const root = trees.find(t => /^hgS_/.test(t.name)); if (root) { CODE.figFiles.set(file.name, root); codeOut(`${file.name} yüklendi (arayüz düzeni).\n`, 'warn'); }
  const mName = file.name.replace(/\.fig$/i, '.m'), di = CODE.docs.findIndex(d => d.name.toLowerCase() === mName.toLowerCase());
  if (di >= 0 && root) { CODE.cur = di; codeShowDoc(); }
  await figFilePreview(file, trees);
}
function codeRunGui(mName) { const di = CODE.docs.findIndex(d => d.name.toLowerCase() === mName.toLowerCase()); if (di < 0) return toast(mName + ' açık değil'); codeStoreCur(); CODE.cur = di; codeShowDoc(); codeRun('all'); }
async function figFilePreview(file, pre) {
  let trees = pre; if (!trees) try { const m = await MAT.open(file); trees = await MAT.readAll(m); } catch (e) { toast('.fig okunamadı: ' + e.message); return; }
  const root = trees.find(t => /^hgS_/.test(t.name));
  if (!root || root.k !== 'struct') { modal(file.name, h('div', null, 'Bu .fig dosyasında arayüz/figür yapısı bulunamadı.')); return; }
  const chr = t => { if (!t) return ''; if (t.k === 'num' && t.cls === 'c') { const r = t.dims[0] || 0, c = t.dims[1] || 0, rows = []; for (let i = 0; i < r; i++) { let s = ''; for (let j = 0; j < c; j++) s += String.fromCharCode(t.re[i + j * r]); rows.push(s.replace(/\s+$/, '')); } return rows.join('\n'); } if (t.k === 'cell') return t.v.map(chr).join('\n'); if (t.k === 'num' && t.re.length) return Array.from(t.re).slice(0, 4).map(v => +v.toFixed(3)).join(' '); return ''; };
  const numv = t => t && t.k === 'num' ? Array.from(t.re) : null;
  const prop = (o, k) => { const p = o.properties && o.properties.v && o.properties.v[0]; return p ? p[k] : null; };
  const kids = o => !o.children ? [] : o.children.k === 'struct' ? o.children.v : o.children.k === 'cell' ? o.children.v.filter(x => x.k === 'struct').flatMap(x => x.v) : [];
  const fig = root.v[0], fpos = numv(prop(fig, 'Position')) || [0, 0, 560, 420], funits = chr(prop(fig, 'Units')) || 'pixels';
  const cw = funits === 'characters' ? 5 : 1, chh = funits === 'characters' ? 13 : 1, FW = fpos[2] * cw, FH = fpos[3] * chh, scale = Math.min(1, 790 / FW, 540 / FH);
  const canvas = h('div', {class: 'figprev', style: `width:${Math.round(FW * scale)}px;height:${Math.round(FH * scale)}px`}), info = h('div', {class: 'note figinfo'}, 'Bir öğeye tıklayın.'), cbs = [];
  const rgb = t => { const v = numv(t); return v && v.length === 3 ? `rgb(${v.map(x => Math.round(x * 255)).join(',')})` : null; };
  function place(o, parent, pw, ph) {
    const type = chr(o.type), pos = numv(prop(o, 'Position')), units = chr(prop(o, 'Units')) || (type === 'axes' || type === 'uipanel' ? 'normalized' : 'pixels');
    if (!pos || pos.length < 4 || /scribe|uitoolbar|uitoggletool|uipushtool|uimenu|text|line|hggroup/.test(type)) { for (const k of kids(o)) place(k, parent, pw, ph); return; }
    let x, y, w, hh; if (units === 'normalized') { x = pos[0] * pw; y = pos[1] * ph; w = pos[2] * pw; hh = pos[3] * ph; } else { const ux = units === 'characters' ? 5 * scale : scale, uy = units === 'characters' ? 13 * scale : scale; x = pos[0] * ux; y = pos[1] * uy; w = pos[2] * ux; hh = pos[3] * uy; }
    const style = chr(prop(o, 'Style')), str = chr(prop(o, 'String')), tag = chr(prop(o, 'Tag')), title = chr(prop(o, 'Title')), bg = rgb(prop(o, 'BackgroundColor')), fs = (numv(prop(o, 'FontSize')) || [10])[0];
    const el = h('div', {class: 'fe fe-' + (style || type), style: `left:${x}px;bottom:${y}px;width:${w}px;height:${hh}px;${bg ? 'background:' + bg + ';' : ''}font-size:${Math.max(8, fs * scale * 1.05)}px`});
    const label = type === 'axes' ? 'eksen (' + tag + ')' : type === 'uitable' ? 'tablo (' + tag + ')' : type === 'uipanel' ? title : style === 'popupmenu' ? (str.split('\n')[0] || '') + ' ▾' : style === 'listbox' ? str : str;
    el.append(h('span', null, label));
    if (type === 'uicontrol' && !/^(text|frame)$/.test(style)) cbs.push([tag, style, str.split('\n')[0]]);
    el.onclick = ev => { ev.stopPropagation(); for (const q of canvas.querySelectorAll('.fe.sel')) q.classList.remove('sel'); el.classList.add('sel'); info.textContent = `${type}${style ? ' · ' + style : ''} · Tag: ${tag || '—'}${str ? ' · Metin: ' + str.replace(/\n/g, ' | ').slice(0, 120) : ''}${type === 'uicontrol' && !/^(text|frame)$/.test(style) ? ` · Geri çağırma işlevi: ${tag}_Callback (${file.name.replace(/\.fig$/i, '.m')} içinde)` : ''}`; };
    parent.append(el);
    for (const k of kids(o)) place(k, el, w, hh);
  }
  for (const k of kids(fig)) place(k, canvas, FW * scale, FH * scale);
  const mName = file.name.replace(/\.fig$/i, '.m'), have = CODE.docs && CODE.docs.some(d => d.name.toLowerCase() === mName.toLowerCase());
  modal(`${file.name} — arayüz önizlemesi (${chr(prop(fig, 'Name')) || 'figür'})`, h('div', null,
    h('div', {class: 'note'}, have ? `Arayüz düzeni (.fig) yüklendi. ${mName} açık: “Arayüzü çalıştır” ile (ya da ${mName} sekmesinde F5) arayüz açılır ve düğmeler çalışır.` : `Arayüz düzeni (.fig) yüklendi. Arayüzü çalıştırmak için düğmelerin kodunu içeren ${mName} dosyasını da açın; sonra o sekmede F5'e basın.`),
    h('div', {class: 'figprevwrap'}, canvas), info,
    cbs.length ? h('details', null, h('summary', null, `Etkileşimli öğeler (${cbs.length})`), h('table', {class: 'wst'}, h('tr', null, h('th', null, 'Tag'), h('th', null, 'Tür'), h('th', null, 'Metin'), h('th', null, 'İşlev')), cbs.map(([t, s, x]) => h('tr', null, h('td', {class: 'b'}, t), h('td', null, s), h('td', null, x), h('td', null, t + '_Callback'))))) : null),
    have ? [{t: 'Arayüzü çalıştır', primary: true, fn: () => codeRunGui(mName)}, {t: 'Kapat'}] : [{t: 'Kapat'}]);
}
/* ---------- işlev listesi ---------- */
function codeFuncDialog() {
  const show = names => {
    const q = h('input', {type: 'search', placeholder: 'Ara…', style: 'width:100%;margin-bottom:6px'}), box = h('div', {class: 'fnlist'});
    const fill = () => { const s = q.value.trim().toLowerCase(); box.replaceChildren(...names.filter(n => !s || n.toLowerCase().includes(s)).map(n => h('span', {class: 'fn'}, n))); };
    q.oninput = fill; fill();
    modal('Desteklenen işlevler (' + names.length + ')', h('div', null, q, box, h('div', {class: 'note', style: 'margin-top:8px'}, 'MATLAB alt kümesi: matris/karmaşık sayı, hücre, yapı, işlev tutamacı, if/for/while/switch/try, yerel işlevler. Toolbox işlevleri (spectrogram, designfilt, wavelet…), sınıflar, Simulink ve arayüz işlevleri yoktur. Kanal köprüsü: ch, chfs, cht, chlist, addch. Grafik: figure, subplot, plot, hold, xlabel, ylabel, title, legend, grid, xlim, ylim, semilogx/y, loglog, bar, hist, stem, scatter.')), [{t: 'Kapat'}]);
  };
  if (CODE.fnNames) return show(CODE.fnNames);
  try { const ML = codeMainLib(); CODE.fnNames = Object.keys(ML.builtins).filter(n => !/_$/.test(n)).sort(); show(CODE.fnNames); } catch (e) { toast('İşlev listesi alınamadı: ' + e.message); }
}
/* ---------- figür görünümü ---------- */
const FIG_PAL = ['#0072BD', '#D95319', '#EDB120', '#7E2F8E', '#77AC30', '#4DBEEE', '#A2142F'];
function figShown() { renderFigure(); }
function figDestroy() { for (const p of CODE.figPlots) { try { p._ro && p._ro.disconnect(); } catch (_) {} } CODE.figPlots = []; }
function renderFigure() {
  const root = $('#v-fig'); if (!root) return; figDestroy(); root.replaceChildren(); root.classList.add('figview');
  if (!CODE.figs.length) { root.append(h('div', {class: 'note', style: 'padding:16px'}, 'Henüz figür yok. Kod sekmesinde plot / subplot komutlarını çalıştırın.')); return; }
  const f = CODE.figs[Math.min(CODE.figIdx, CODE.figs.length - 1)];
  const bar = h('div', {class: 'figbar'}, CODE.figs.map((g, i) => h('button', {class: i === CODE.figIdx ? 'on' : '', onclick: () => { CODE.figIdx = i; renderFigure(); }}, 'Figür ' + g.id)), f.title ? h('b', {style: 'margin-left:10px'}, f.title) : null,
    h('span', {class: 'sp'}), btn('PNG', () => figPng(f)), btn('Kapat', () => { CODE.figs.splice(CODE.figIdx, 1); CODE.figIdx = 0; const fb = document.querySelector('#viewtabs button[data-v=fig]'); if (!CODE.figs.length) { fb.classList.add('hidden'); switchView('code'); } else renderFigure(); }));
  const grid = h('div', {class: 'figgrid', style: `grid-template-columns:repeat(${f.cols},1fr);grid-template-rows:repeat(${f.rows},1fr)`});
  root.append(bar, grid);
  for (const ax of f.axes) {
    const cell = h('div', {class: 'figcell', style: `grid-column:${((ax.p - 1) % f.cols) + 1};grid-row:${Math.floor((ax.p - 1) / f.cols) + 1}`}), cv = h('canvas'); cell.append(cv); grid.append(cell);
  }
  requestAnimationFrame(() => {
    const cells = [...grid.children];
    f.axes.forEach((ax, i) => {
      const cv = cells[i].firstChild; const P = new Plot(cv, {xName: 'x', xlabel: ' ', emptyText: 'Boş eksen', onHover: p => { $('#hoverinfo').textContent = p ? `x = ${fmtNum(p.x, 7)}    y = ${fmtNum(p.y, 6)}` : ''; }}); P.grms = {mode: 'off', dc: true}; P.grid = !!ax.grid; P.legend = ax.legend === true || (ax.legend == null && ax.traces.length > 1 && ax.traces.some(t => t.name));
      const pa = P.addAxes({xlabel: ax.xlabel, ylabel: ax.ylabel, title: ax.title, xlog: ax.xscale === 'log', ylog: ax.yscale === 'log'}); pa.fig = true;
      ax.traces.forEach((t, k) => {
        const y = t.y, n = y.length; let x = t.x; if (!x) { x = new Float64Array(n); for (let j = 0; j < n; j++) x[j] = j + 1; }
        const color = t.color || FIG_PAL[k % FIG_PAL.length], label = t.name || ('veri' + (k + 1));
        const tr = {kind: 'xy', x, y, label, color, width: t.lw || 1.2, visible: true};
        if (t.kind === 'bar') { let dx = Infinity; for (let j = 1; j < n; j++) { const d = Math.abs(x[j] - x[j - 1]); if (d > 0 && d < dx) dx = d; } tr.bars = isFinite(dx) ? dx * 0.8 : 0.8; }
        else if (t.kind === 'stem' || t.marker) { tr.marker = true; tr.msize = 4; if (!t.noLine && t.kind !== 'stem') { pa.traces.push({kind: 'xy', x, y, label, color, width: t.lw || 1.2, visible: true, dash: t.dash || null}); tr.noLegend = true; } }
        if (t.dash && !tr.marker) tr.dash = t.dash;
        pa.traces.push(tr);
      });
      P.active = pa; P.fitAll();
      if (ax.xlim) { pa.xlim = ax.xlim.slice(); } if (ax.ylim) { pa.yAuto = false; pa.ylim = ax.ylim.slice(); }
      P.invalidate(); CODE.figPlots.push(P);
    });
  });
}
function figPng(f) {
  const cells = [...document.querySelectorAll('#v-fig .figcell canvas')]; if (!cells.length) return;
  const gr = $('#v-fig .figgrid').getBoundingClientRect(), dpr = window.devicePixelRatio || 1, cv = document.createElement('canvas'); cv.width = Math.round(gr.width * dpr); cv.height = Math.round(gr.height * dpr);
  const ctx = cv.getContext('2d'); ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--panel') || '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  for (const c of cells) { const r = c.getBoundingClientRect(); ctx.drawImage(c, Math.round((r.left - gr.left) * dpr), Math.round((r.top - gr.top) * dpr)); }
  cv.toBlob(b => saveBlob(b, 'figur' + f.id + '.png'));
}
/* ---------- Arayüz (GUIDE / uicontrol) görünümü ---------- */
CODE.vfs = new Map();      // ad → File (arayüzden okunacak dosyalar)
CODE.figFiles = new Map(); // ad → .fig ağacı
CODE.gui = {figs: [], cur: 0, els: new Map(), plots: new Map(), sig: '', queue: []};
function codeVfsPush(name, file) {
  const w = CODE.worker; if (!w || CODE.sab) return;   // paylaşımlı bellek varsa dosya istendikçe okunur
  file.arrayBuffer().then(buf => { try { w.postMessage({t: 'vfs', name, buf}, [buf]); } catch (_) {} });
}
function codeAddVfs(files) {
  let n = 0; for (const f of files) { CODE.vfs.set(f.name, f); codeVfsPush(f.name, f); n++; }
  if (n) { codeOut(`${n} dosya arayüzün kullanımına eklendi: ${[...files].map(f => f.name).join(', ')}\n`, 'warn'); guiRenderBar(); }
}
function guiEnsureView() {
  let v = $('#v-gui'); if (v) return v;
  v = h('div', {class: 'view hidden guiview', id: 'v-gui'}); $('#stage').append(v);
  return v;
}
function guiShown() { guiRenderBar(); guiRender(true); }
function guiRenderBar() {
  const v = guiEnsureView(); let bar = v.querySelector('.guibar'); if (!bar) { bar = h('div', {class: 'guibar'}); v.append(bar, h('div', {class: 'guistage'})); }
  const G = CODE.gui, fin = h('input', {type: 'file', multiple: true, hidden: true, onchange: e => { codeAddVfs(e.target.files); e.target.value = ''; }});
  bar.replaceChildren(...G.figs.map((f, i) => h('button', {class: i === G.cur ? 'on' : '', onclick: () => { G.cur = i; guiRender(true); guiRenderBar(); }}, f.name || ('Figür ' + f.id))),
    h('span', {class: 'sp'}), h('span', {class: 'note', id: 'guiStatus'}, CODE.running ? 'çalışıyor…' : ''),
    btn('Dosya ekle', () => fin.click()), h('span', {class: 'note', title: [...CODE.vfs.keys()].join('\n')}, CODE.vfs.size ? CODE.vfs.size + ' dosya' : ''),
    btn(document.getElementById('app').classList.contains('wide') ? 'Panelleri göster' : 'Geniş görünüm', () => { document.getElementById('app').classList.toggle('wide'); guiRenderBar(); setTimeout(() => guiRender(true), 30); }),
    btn('Kapat', () => { const f = G.figs[G.cur]; if (!f) return; if (CODE.running) return toast('İşlem sürüyor'); codeGuiEvent(null, null, null, `close(${f.id})`); }), fin);
}
function guiUpdate(figs) {
  const G = CODE.gui, prev = G.figs; guiEnsureView();
  // eksen izleri yalnız değiştiğinde gelir: önceki izleri koru
  for (const f of figs) { const p = prev.find(x => x.id === f.id); for (const a of f.axes) if (a.traces == null) { const pa = p && p.axes.find(x => x.oid === a.oid); a.traces = pa ? pa.traces : []; a.same = !!pa; } }
  const opened = figs.filter(f => !prev.some(p => p.id === f.id));
  G.figs = figs; if (G.cur >= figs.length) G.cur = Math.max(0, figs.length - 1); if (opened.length) G.cur = figs.indexOf(opened[opened.length - 1]);
  const b = document.querySelector('#viewtabs button[data-v=gui]'); if (b) b.classList.toggle('hidden', !figs.length);
  if (opened.length) { switchView('gui'); return; }
  if (!figs.length && S.view === 'gui') { switchView('code'); return; }
  if (S.view === 'gui') { guiRenderBar(); guiRender(false); }
}
const GUI_U = {pixels: 1, characters: [5, 13], points: 4 / 3, inches: 96, centimeters: 96 / 2.54, normalized: 0};
function guiRect(o, pw, ph, sx, sy) {
  const p = o.props.Position || [0, 0, 1, 1], u = String(o.props.Units || 'pixels').toLowerCase();
  if (u === 'normalized') return [p[0] * pw, p[1] * ph, p[2] * pw, p[3] * ph];
  const k = GUI_U[u] || 1, kx = Array.isArray(k) ? k[0] : k, ky = Array.isArray(k) ? k[1] : k;
  return [p[0] * kx * sx, p[1] * ky * sy, p[2] * kx * sx, p[3] * ky * sy];
}
const guiCol = c => Array.isArray(c) && c.length === 3 ? `rgb(${c.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255)).join(',')})` : null;
const guiLines = s => Array.isArray(s) ? s : String(s == null ? '' : s).split('\n');
function guiRender(force) {
  const G = CODE.gui, v = guiEnsureView(), stage = v.querySelector('.guistage'); if (!stage) return;
  const f = G.figs[G.cur]; if (!f) { stage.replaceChildren(h('div', {class: 'note', style: 'padding:16px'}, 'Açık arayüz yok.')); G.sig = ''; return; }
  const byId = new Map(f.objs.map(o => [o.id, o])), fo = byId.get(f.id);
  const W = stage.clientWidth || 800, H = stage.clientHeight || 600;
  const sig = f.id + '|' + W + 'x' + H + '|' + f.objs.map(o => o.id + ':' + o.type + ':' + (o.props.Style || '') + ':' + (o.props.Position || []).join(',') + ':' + (o.props.Units || '') + ':' + (Array.isArray(o.props.String) ? o.props.String.length : '')).join(';');
  if (force || sig !== G.sig) { guiBuild(stage, f, byId, fo, W, H); G.sig = sig; }
  for (const o of f.objs) guiApply(o);
  for (const a of f.axes) guiAxes(a);
}
function guiBuild(stage, f, byId, fo, W, H) {
  const G = CODE.gui; for (const P of G.plots.values()) { try { P._ro && P._ro.disconnect(); } catch (_) {} } G.plots.clear(); G.els.clear();
  const fp = guiRect(fo, W, H, 1, 1), sx = W / Math.max(1, fp[2]), sy = H / Math.max(1, fp[3]), fsK = Math.max(0.6, Math.min(1.25, Math.min(sx, sy)));
  const root = h('div', {class: 'guifig', style: `width:${W}px;height:${H}px;background:${guiCol(fo.props.Color) || '#f0f0f0'}`}); stage.replaceChildren(root);
  G.els.set(fo.id, {el: root, o: fo});
  const place = (o, parentEl, pw, ph) => {
    if (o.type === 'figure') { for (const c of o.children.slice().reverse()) { const k = byId.get(c); if (k) place(k, root, W, H); } return; }
    const r = guiRect(o, pw, ph, sx, sy); const st = String(o.props.Style || '').toLowerCase(); let el, inner = null;
    const base = `left:${r[0]}px;bottom:${r[1]}px;width:${Math.max(2, r[2])}px;height:${Math.max(2, r[3])}px;`;
    const fpx = Math.max(9, Math.round((o.props.FontSize ? o.props.FontSize[0] : 8) * 4 / 3 * fsK));
    if (o.type === 'uipanel' || o.type === 'uibuttongroup') { el = h('div', {class: 'gp', style: base}); inner = h('div', {class: 'gpi'}); el.append(h('span', {class: 'gpt', style: `font-size:${fpx}px`}), inner); }
    else if (o.type === 'axes') { el = h('div', {class: 'gax', style: base}, h('canvas')); }
    else if (o.type === 'uitable') { el = h('div', {class: 'gtb', style: base + `font-size:${fpx}px`}); }
    else if (o.type === 'uicontrol') {
      const fire = (props) => codeGuiEvent(o.id, 'Callback', props);
      const sty = base + `font-size:${fpx}px;`;
      if (st === 'pushbutton') el = h('button', {class: 'gc gbtn', style: sty, onclick: () => fire()});
      else if (st === 'togglebutton') el = h('button', {class: 'gc gbtn gtog', style: sty, onclick: () => { const cur = CODE.gui.lastVal && CODE.gui.lastVal.get(o.id); const on = !(el.classList.contains('on')); el.classList.toggle('on', on); const mx = (o.props.Max || [1])[0], mn = (o.props.Min || [0])[0]; fireSel(on ? mx : mn); }});
      else if (st === 'edit') { const multi = ((o.props.Max || [1])[0] - (o.props.Min || [0])[0]) > 1; el = h(multi ? 'textarea' : 'input', {class: 'gc gedit', style: sty, type: multi ? undefined : 'text', onchange: e => fire({String: multi ? e.target.value.split('\n') : e.target.value}), onkeydown: e => { if (!multi && e.key === 'Enter') e.target.blur(); }}); }
      else if (st === 'text') el = h('div', {class: 'gc gtext', style: sty});
      else if (st === 'popupmenu') el = h('select', {class: 'gc gpop', style: sty, onchange: e => fire({Value: [e.target.selectedIndex + 1]})});
      else if (st === 'listbox') { const multi = ((o.props.Max || [1])[0] - (o.props.Min || [0])[0]) > 1; el = h('select', {class: 'gc glist', style: sty, size: 4, multiple: multi, onchange: e => fire({Value: [...e.target.options].map((x, i) => x.selected ? i + 1 : 0).filter(Boolean)})}); }
      else if (st === 'checkbox' || st === 'radiobutton') { const inp = h('input', {type: st === 'checkbox' ? 'checkbox' : 'radio'}); el = h('label', {class: 'gc gchk', style: sty}, inp, h('span')); inp.onchange = () => { const mx = (o.props.Max || [1])[0], mn = (o.props.Min || [0])[0]; const par = byId.get(o.parent); const v = inp.checked ? mx : mn; if (par && par.type === 'uibuttongroup' && st === 'radiobutton') codeGuiEvent(o.id, 'SelectionChangedFcn', {Value: [v]}); else fire({Value: [v]}); }; }
      else if (st === 'slider') { el = h('input', {class: 'gc gsl', type: 'range', style: sty, step: 'any', onchange: e => fire({Value: [+e.target.value]})}); }
      else el = h('div', {class: 'gc gframe', style: sty});
      function fireSel(v) { const par = byId.get(o.parent); if (par && par.type === 'uibuttongroup') codeGuiEvent(o.id, 'SelectionChangedFcn', {Value: [v]}); else fire({Value: [v]}); }
    } else return;
    el.dataset.oid = o.id; parentEl.append(el); G.els.set(o.id, {el, o, inner});
    const kidsEl = inner || el, cw = r[2], ch = inner ? Math.max(2, r[3] - fpx * 0.9) : r[3];
    for (const c of o.children.slice().reverse()) { const k = byId.get(c); if (k) place(k, kidsEl, cw, ch); }
  };
  place(fo, root, W, H);
}
function guiApply(o) {
  const G = CODE.gui, rec = G.els.get(o.id); if (!rec) return; const el = rec.el, p = o.props, st = String(p.Style || '').toLowerCase();
  el.style.display = String(p.Visible || 'on') === 'off' ? 'none' : '';
  const bg = guiCol(p.BackgroundColor), fg = guiCol(p.ForegroundColor); if (o.type !== 'figure' && o.type !== 'axes') { if (bg && st !== 'popupmenu' && st !== 'edit' && st !== 'listbox') el.style.background = bg; if (fg) el.style.color = fg; }
  const en = String(p.Enable || 'on'); if ('disabled' in el) el.disabled = en === 'off' || en === 'inactive';
  if (p.FontWeight === 'bold') el.style.fontWeight = '600';
  if (p.HorizontalAlignment && o.type === 'uicontrol' && /text|edit/.test(st)) el.style.textAlign = p.HorizontalAlignment;
  if (p.TooltipString) el.title = guiLines(p.TooltipString).join('\n');
  const lines = guiLines(p.String), val = p.Value || [];
  if (o.type === 'uipanel' || o.type === 'uibuttongroup') { el.querySelector('.gpt').textContent = guiLines(p.Title).join(' '); return; }
  if (o.type === 'uitable') { guiTable(el, o); return; }
  if (o.type !== 'uicontrol') return;
  if (st === 'pushbutton' || st === 'togglebutton') { el.textContent = lines.join(' '); if (st === 'togglebutton') el.classList.toggle('on', (val[0] || 0) === ((p.Max || [1])[0])); }
  else if (st === 'text') el.textContent = lines.join('\n');
  else if (st === 'edit') { if (document.activeElement !== el) el.value = el.tagName === 'TEXTAREA' ? lines.join('\n') : lines.join(' '); }
  else if (st === 'popupmenu' || st === 'listbox') {
    const cur = [...el.options].map(x => x.text).join('\n'); if (cur !== lines.join('\n')) el.replaceChildren(...lines.map(s => h('option', null, s)));
    [...el.options].forEach((x, i) => { x.selected = val.includes(i + 1); });
  }
  else if (st === 'checkbox' || st === 'radiobutton') { el.querySelector('span').textContent = lines.join(' '); el.querySelector('input').checked = (val[0] || 0) === ((p.Max || [1])[0]); }
  else if (st === 'slider') { el.min = (p.Min || [0])[0]; el.max = (p.Max || [1])[0]; el.value = val[0] || 0; }
}
function guiTable(el, o) {
  const p = o.props, data = Array.isArray(p.Data) ? p.Data : [], nC = data.length ? Math.max(...data.map(r => r.length)) : 0;
  const cn = p.ColumnName === 'numbered' || p.ColumnName == null ? Array.from({length: nC}, (_, i) => String(i + 1)) : guiLines(p.ColumnName);
  const rn = p.RowName === 'numbered' || p.RowName == null ? data.map((_, i) => String(i + 1)) : guiLines(p.RowName);
  const fmt = x => typeof x === 'number' ? (Number.isInteger(x) ? String(x) : (+x.toPrecision(6)).toString()) : typeof x === 'boolean' ? (x ? '☑' : '☐') : String(x);
  el.replaceChildren(h('table', null, h('tr', null, h('th'), ...cn.slice(0, Math.max(nC, cn.length)).map(c => h('th', null, c))), ...data.slice(0, 2000).map((r, i) => h('tr', null, h('th', null, rn[i] || ''), ...r.map(x => h('td', null, fmt(x)))))));
}
function guiAxes(a) {
  const G = CODE.gui, rec = G.els.get(a.oid); if (!rec) return; const cv = rec.el.querySelector('canvas');
  let P = G.plots.get(a.oid);
  if (P && a.same && P._ver === a.ver) return;
  if (!P) { P = new Plot(cv, {xName: 'x', xlabel: ' ', emptyText: '', onHover: q => { $('#hoverinfo').textContent = q ? `x = ${fmtNum(q.x, 7)}    y = ${fmtNum(q.y, 6)}` : ''; }}); P.grms = {mode: 'off', dc: true}; G.plots.set(a.oid, P); }
  P.axes.slice().forEach(x => P.removeAxes(x)); P._ver = a.ver;
  P.grid = !!a.grid; P.legend = a.legend === true;
  const pa = P.addAxes({xlabel: a.xlabel, ylabel: a.ylabel, title: a.title, xlog: a.xscale === 'log', ylog: a.yscale === 'log'});
  (a.traces || []).forEach((t, k) => {
    const y = t.y, n = y.length; let x = t.x; if (!x) { x = new Float64Array(n); for (let j = 0; j < n; j++) x[j] = j + 1; }
    const color = t.color || FIG_PAL[k % FIG_PAL.length], label = t.name || ('veri' + (k + 1)), tr = {kind: 'xy', x, y, label, color, width: t.lw || 1.2, visible: true};
    if (t.kind === 'bar') { let dx = Infinity; for (let j = 1; j < n; j++) { const d = Math.abs(x[j] - x[j - 1]); if (d > 0 && d < dx) dx = d; } tr.bars = isFinite(dx) ? dx * 0.8 : 0.8; }
    else if (t.kind === 'stem' || t.marker) { tr.marker = true; tr.msize = 4; if (!t.noLine && t.kind !== 'stem') { pa.traces.push({kind: 'xy', x, y, label, color, width: t.lw || 1.2, visible: true, dash: t.dash || null}); tr.noLegend = true; } }
    if (t.dash && !tr.marker) tr.dash = t.dash; pa.traces.push(tr);
  });
  P.active = pa; P.fitAll(); if (a.xlim) pa.xlim = a.xlim.slice(); if (a.ylim) { pa.yAuto = false; pa.ylim = a.ylim.slice(); } P.invalidate();
}
// kullanıcı etkileşimi → işçide geri çağırma
function codeGuiEvent(oid, kind, props, code) {
  if (CODE.running) { CODE.gui.queue.push([oid, kind, props, code]); const s = $('#guiStatus'); if (s) s.textContent = 'çalışıyor… (sırada ' + CODE.gui.queue.length + ')'; return; }
  if (!codeEnsureWorker()) return toast('Arayüz için arka plan işçisi gerekli');
  codeRunUI(true); const s = $('#guiStatus'); if (s) s.textContent = 'çalışıyor…';
  if (code) { codeRunText(code, 0, '>>', 'komut'); return; }
  const msg = {t: 'cb', id: ++CODE.runId, oid, kind, props, label: 'arayüz'}; CODE.pendingRun = msg; CODE.worker.postMessage(msg);
}
function guiAfterRun() { const s = $('#guiStatus'); if (s) s.textContent = ''; const q = CODE.gui.queue.shift(); if (q) setTimeout(() => codeGuiEvent(...q), 0); }
// işçiden bildirimler
function guiNote(kind, p) {
  if (kind === 'msg') { const icon = p.kind === 'error' ? 'Hata' : p.kind === 'warn' ? 'Uyarı' : 'Bilgi'; modal(p.title || icon, h('div', {style: 'white-space:pre-wrap;min-width:260px'}, p.text), [{t: 'Tamam', primary: true}]); if (p.kind === 'error') codeOut(`[${icon}] ${p.text}\n`, 'err'); return; }
  if (kind === 'progress') { const s = $('#guiStatus'); if (s) s.textContent = `${p.msg ? p.msg + ' ' : ''}%${Math.round((p.x || 0) * 100)}`; return; }
  if (kind === 'download') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([p.bytes])); a.download = p.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); codeOut(`${p.name} indirildi.\n`, 'warn'); return; }
  if (kind === 'guiopen') { codeOut(`Arayüz açıldı: ${p.name}\n`, 'warn'); return; }
}
// engelleyen istekler (paylaşımlı bellek)
function guiReply(obj, bin) {
  const sab = CODE.sab; if (!sab) return; let bytes;
  if (bin) bytes = bin; else bytes = new TextEncoder().encode(JSON.stringify(obj === undefined ? {v: null} : obj));
  if (bytes.length > sab.box.length) { bytes = new TextEncoder().encode(JSON.stringify({err: 'Yanıt çok büyük'})); bin = null; }
  sab.box.set(bytes); sab.ctl[1] = bytes.length; Atomics.store(sab.ctl, 0, bin ? 2 : 1); Atomics.notify(sab.ctl, 0);
}
function guiFindFile(name) { const b = String(name).replace(/^.*[\\/]/, '').toLowerCase(); for (const [k, f] of CODE.vfs) if (k.toLowerCase() === b) return f; return null; }
async function guiRpc(kind, p) {
  try {
    if (kind === 'stat') { const f = guiFindFile(p); return guiReply({v: f ? {name: f.name, size: f.size} : null}); }
    if (kind === 'read') { const f = guiFindFile(p.name); if (!f) return guiReply({err: 'Dosya yok: ' + p.name}); const b = new Uint8Array(await f.slice(p.off, p.off + p.len).arrayBuffer()); return guiReply(null, b); }
    if (kind === 'blob') { const b = CODE.blob || new Uint8Array(0); return guiReply(null, b.subarray(p.off, p.off + p.len)); }
    if (kind === 'loadmat') {
      const nm = String(p).toLowerCase(); let trees = CODE.matFiles.get(nm) || CODE.matFiles.get(nm + '.mat');
      if (!trees) { const f = guiFindFile(p) || guiFindFile(p + '.mat'); if (f) { const m = await MAT.open(f); trees = await matTrees(m, f.name); CODE.matFiles.set(f.name.toLowerCase(), trees); } }
      if (!trees) { const sf = S.files.find(x => x.mat && x.name.toLowerCase() === (/\.mat$/.test(nm) ? nm : nm + '.mat')); if (sf) trees = await matTrees(sf.mat, sf.name); }
      if (!trees) return guiReply({v: null});
      CODE.blob = guiEncodeTrees(trees); return guiReply({v: {size: CODE.blob.length}});
    }
    if (kind === 'fig') return guiReply({v: null});
    if (kind === 'uigetfile') { const r = await guiPickFile(p); return guiReply({v: r}); }
    if (kind === 'uiputfile') { const r = await guiAsk('Kaydet', [p.def], 'Dosya adı (tarayıcının İndirilenler klasörüne kaydedilir):'); return guiReply({v: r ? r[0] : null}); }
    if (kind === 'questdlg') { const r = await new Promise(res => { modal(p.title || 'Soru', h('div', {style: 'white-space:pre-wrap;min-width:260px'}, p.q), [...p.btns.map(b => ({t: b, primary: b === p.def, fn: () => res(b)})), {t: 'Kapat', fn: () => res('')}]); $('#mclose').onclick = () => { $('#modal').classList.add('hidden'); res(''); }; }); return guiReply({v: r}); }
    if (kind === 'inputdlg') { const r = await guiAsk(p.title || 'Giriş', p.defs, p.prompts); return guiReply({v: r}); }
    if (kind === 'listdlg') { const sel = h('select', {multiple: p.mode !== 'single', size: Math.min(12, Math.max(4, p.list.length)), style: 'width:100%'}, p.list.map((s, i) => h('option', {selected: p.init.includes(i + 1)}, s))); const r = await new Promise(res => { modal(p.title || 'Seçin', h('div', null, p.prompt ? h('div', {class: 'note'}, p.prompt) : null, sel), [{t: 'Tamam', primary: true, fn: () => res([...sel.options].map((x, i) => x.selected ? i + 1 : 0).filter(Boolean))}, {t: 'Vazgeç', fn: () => res(null)}]); $('#mclose').onclick = () => { $('#modal').classList.add('hidden'); res(null); }; }); return guiReply({v: r}); }
    guiReply({err: 'Bilinmeyen istek: ' + kind});
  } catch (e) { guiReply({err: String(e && e.message || e)}); }
}
function guiEncodeTrees(trees) {
  const bufs = []; const strip = t => { if (!t) return t; if (t.k === 'num') { const o = Object.assign({}, t); o.re = bufs.push(Float64Array.from(t.re)) - 1; if (t.im) o.im = bufs.push(Float64Array.from(t.im)) - 1; else delete o.im; return o; } if (t.k === 'cell') return Object.assign({}, t, {v: t.v.map(strip)}); if (t.k === 'struct') return Object.assign({}, t, {v: t.v.map(o => { const q = {}; for (const k in o) q[k] = strip(o[k]); return q; })}); return t; };
  const js = new TextEncoder().encode(JSON.stringify({trees: trees.map(strip), bufs: bufs.map(b => b.length)})); let n = 4 + js.length; for (const b of bufs) n += b.byteLength;
  const out = new Uint8Array(n); new DataView(out.buffer).setUint32(0, js.length, true); out.set(js, 4); let o = 4 + js.length; for (const b of bufs) { out.set(new Uint8Array(b.buffer), o); o += b.byteLength; } return out;
}
function guiAsk(title, defs, prompts) {
  prompts = Array.isArray(prompts) ? prompts : [prompts]; const ins = defs.map(d => h('input', {type: 'text', value: d || '', style: 'width:100%'}));
  return new Promise(res => { modal(title, h('div', {style: 'min-width:320px'}, ...ins.flatMap((inp, i) => [h('div', {class: 'note', style: 'margin-top:6px'}, prompts[i] || ''), inp])), [{t: 'Tamam', primary: true, fn: () => res(ins.map(x => x.value))}, {t: 'Vazgeç', fn: () => res(null)}]); $('#mclose').onclick = () => { $('#modal').classList.add('hidden'); res(null); }; setTimeout(() => ins[0] && ins[0].focus(), 50); });
}
function guiPickFile(p) {
  const pats = String(p.filter || '*.*').split(/[;,]/).map(x => x.trim()).filter(Boolean);
  const re = pats.map(x => new RegExp('^' + x.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i'));
  const known = [...CODE.vfs.values()].filter(f => re.some(r => r.test(f.name)));
  return new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    const inp = h('input', {type: 'file', multiple: !!p.multi, accept: pats.filter(x => /^\*\.\w+$/.test(x)).map(x => x.slice(1)).join(','), onchange: e => { const fs = [...e.target.files]; if (!fs.length) return; for (const f of fs) CODE.vfs.set(f.name, f); $('#modal').classList.add('hidden'); guiRenderBar(); fin(fs.map(f => f.name)); }});
    const list = known.length ? h('div', {style: 'margin-top:8px'}, h('div', {class: 'note'}, 'Daha önce eklenenler:'), ...known.map(f => h('button', {style: 'display:block;margin:3px 0', onclick: () => { $('#modal').classList.add('hidden'); fin([f.name]); }}, f.name + ' (' + fmtCnt(f.size) + ' bayt)'))) : null;
    modal(p.title || 'Dosya seçin', h('div', {style: 'min-width:340px'}, h('div', {class: 'note'}, 'Filtre: ' + pats.join('; ')), h('div', {style: 'margin-top:8px'}, btn('Bilgisayardan seç…', () => inp.click(), 'primary')), list, inp), [{t: 'Vazgeç', fn: () => fin(null)}]);
    $('#mclose').onclick = () => { $('#modal').classList.add('hidden'); fin(null); };
  });
}

(function codeBind() {
  const pick = () => { const i = h('input', {type: 'file', accept: '.m,.fig,.txt', multiple: true, onchange: e => codeOpenM(e.target.files)}); i.click(); };
  const b = document.getElementById('btnCodeOpen'); if (b) b.onclick = () => { if (typeof closeMenus === 'function') closeMenus(); pick(); };
  const w = document.getElementById('wCode'); if (w) w.onclick = () => switchView('code');
})();
