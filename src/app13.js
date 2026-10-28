/* ===== Kod sekmesi: MATLAB alt kümesi çalıştırma, figür görünümü ===== */
/*MLSRC*/
const CODE = {worker: null, running: false, text: '', ws: [], figs: [], figIdx: 0, figPlots: [], runId: 0, fnNames: null, errLine: 0};
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
x  = ch('ts41_X');          % sütun vektörü
fs = chfs('ts41_X');        % örnekleme frekansı (Hz)
t  = (0:numel(x)-1)'/fs;
[b, a] = butter(4, 2*100/fs);   % 100 Hz alçak geçiren
y = filtfilt(b, a, x);
figure(1)
subplot(2,1,1); plot(t, x, 'r', t, y, 'b'); grid on
xlabel('t (s)'); ylabel('g'); legend('ham', 'süzülmüş')
subplot(2,1,2); plot(t, x - y); grid on; title('Fark')
addch('ts41_X_lp100', y, fs);   % sonucu kanal olarak ağaca ekle
`],
  ['PSD (pwelch)', `x  = ch('ts41_X');
fs = chfs('ts41_X');
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
const CODE_LIB_KEY = 'mv.code.lib', CODE_CUR_KEY = 'mv.code.cur';
const codeLibGet = () => { try { return JSON.parse(localStorage.getItem(CODE_LIB_KEY) || '[]'); } catch (_) { return []; } };
const codeLibSet = v => { try { localStorage.setItem(CODE_LIB_KEY, JSON.stringify(v)); } catch (_) { toast('Tarayıcı depolaması kullanılamıyor; kitaplık kaydedilemedi'); } };

function codeBuildView() {
  const root = $('#v-code'); if (!root || root.dataset.built) return; root.dataset.built = '1';
  root.classList.add('codeview');
  const tb = h('div', {class: 'codebar'},
    btn('Çalıştır (F5)', () => codeRun(false), 'primary', 'codeRun'), btn('Seçimi çalıştır (Ctrl+Enter)', () => codeRun(true), '', 'codeRunSel'), btn('Durdur', codeStop, '', 'codeStop'),
    h('span', {class: 'sp'}),
    h('select', {id: 'codeEx', title: 'Örnek betikler', onchange: e => { const i = +e.target.value; e.target.value = ''; if (i >= 0 && CODE_EXAMPLES[i]) codeSetText(CODE_EXAMPLES[i][1]); }}, h('option', {value: ''}, 'Örnekler…'), CODE_EXAMPLES.map((e, i) => h('option', {value: i}, e[0]))),
    h('select', {id: 'codeLib', title: 'Kayıtlı betiklerim', onchange: e => { const v = e.target.value; e.target.value = ''; const l = codeLibGet().find(x => x.name === v); if (l) codeSetText(l.code); }}),
    btn('Kaydet…', codeSaveLib, '', 'codeSaveLib'), btn('.m aç', () => { const i = h('input', {type: 'file', accept: '.m,.txt', onchange: e => { codeOpenM(e.target.files); }}); i.click(); }), btn('.m kaydet', () => saveBlob(new Blob([$('#codeEd').value], {type: 'text/plain'}), 'betik.m')),
    btn('Çalışma alanını temizle', codeReset), btn('Konsolu temizle', () => { $('#codeOut').textContent = ''; }), btn('İşlevler', codeFuncDialog));
  const gut = h('pre', {id: 'codeGut', class: 'codegut', 'aria-hidden': 'true'}, '1');
  const ed = h('textarea', {id: 'codeEd', class: 'codeed', spellcheck: 'false', wrap: 'off', placeholder: "% MATLAB kodunuzu buraya yazın. F5 ile çalıştırın.\n% ch('kanal_adı') açık kanalı alır, addch('ad', y, fs) sonucu ağaca ekler."});
  const edwrap = h('div', {class: 'codewrap'}, gut, ed);
  const out = h('pre', {id: 'codeOut', class: 'codeout'});
  const ws = h('div', {id: 'codeWs', class: 'codews'});
  const lower = h('div', {class: 'codelower'}, h('div', {class: 'codecol'}, h('div', {class: 'codehd'}, 'Konsol'), out), h('div', {class: 'codecol ws'}, h('div', {class: 'codehd'}, 'Çalışma alanı'), ws));
  root.append(tb, edwrap, lower);
  ed.value = (() => { try { return localStorage.getItem(CODE_CUR_KEY) || ''; } catch (_) { return ''; } })() || CODE_EXAMPLES[1][1];
  const syncGut = () => { const n = ed.value.split('\n').length; let s = ''; for (let i = 1; i <= n; i++) s += (i === CODE.errLine ? '▶' : '') + i + '\n'; gut.textContent = s; gut.scrollTop = ed.scrollTop; };
  CODE.syncGut = syncGut;
  ed.addEventListener('input', () => { CODE.errLine = 0; syncGut(); try { localStorage.setItem(CODE_CUR_KEY, ed.value); } catch (_) {} });
  ed.addEventListener('scroll', () => { gut.scrollTop = ed.scrollTop; });
  ed.addEventListener('keydown', e => {
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) { e.preventDefault(); codeRun(e.key !== 'F5' && true); return; }
    if (e.key === 'Tab') { e.preventDefault(); const a = ed.selectionStart, b = ed.selectionEnd; ed.setRangeText('  ', a, b, 'end'); ed.dispatchEvent(new Event('input')); }
    if (e.key === 'Escape' && CODE.running) codeStop();
  });
  window.addEventListener('keydown', e => { if (e.key === 'F5' && S.view === 'code') { e.preventDefault(); codeRun(false); } });
  syncGut(); codeLibRefresh(); codeRunUI(false); codeRenderWs();
}
function codeShown() { codeBuildView(); codeLibRefresh(); setTimeout(() => { const e = $('#codeEd'); if (e) CODE.syncGut(); }, 0); }
function codeSetText(t) { codeBuildView(); const e = $('#codeEd'); e.value = t; e.dispatchEvent(new Event('input')); }
function codeLibRefresh() { const s = $('#codeLib'); if (!s) return; s.replaceChildren(h('option', {value: ''}, 'Kitaplığım…'), codeLibGet().map(l => h('option', {value: l.name}, l.name))); }
function codeSaveLib() {
  const inp = h('input', {type: 'text', id: 'codeLibName', value: '', placeholder: 'Betik adı', style: 'width:100%'});
  const list = codeLibGet();
  modal('Betiği kitaplığa kaydet', h('div', null, inp, h('div', {class: 'note'}, 'Kayıtlar yalnızca bu tarayıcıda (bu bilgisayarda) tutulur. Aynı adla kayıt üzerine yazar.'),
    list.length ? h('div', {style: 'margin-top:8px'}, h('b', null, 'Mevcut: '), list.map(l => h('span', {class: 'chip', style: 'margin:2px', onclick: () => { inp.value = l.name; }}, l.name, h('button', {title: 'Sil', onclick: ev => { ev.stopPropagation(); codeLibSet(codeLibGet().filter(x => x.name !== l.name)); codeLibRefresh(); ev.target.parentElement.remove(); }}, '×')))) : null),
    [{t: 'Kaydet', primary: true, fn: () => { const n = inp.value.trim(); if (!n) { toast('Ad girin'); return false; } const l = codeLibGet().filter(x => x.name !== n); l.push({name: n, code: $('#codeEd').value}); codeLibSet(l); codeLibRefresh(); toast('Kaydedildi: ' + n); } }, {t: 'Vazgeç'}]);
  setTimeout(() => inp.focus(), 50);
}
async function codeOpenM(files) {
  files = [...files]; if (!files.length) return; const f = files[0];
  let txt; try { txt = await readTextSmart(f); } catch (e) { toast('Okunamadı: ' + e.message); return; }
  codeSetText(txt.replace(/\r\n?/g, '\n')); switchView('code'); toast(f.name + ' kod alanına yüklendi' + (files.length > 1 ? ' (ilk dosya; diğerleri yoksayıldı)' : ''));
}
function codeOut(s, kind) {
  const o = $('#codeOut'); if (!o) return; if (kind === 'clc') { o.textContent = ''; return; }
  let sp; if (kind === 'err' || kind === 'warn') { sp = h('span', {class: 'cerr'}, s); } else sp = document.createTextNode(s);
  o.append(sp); if (o.childNodes.length > 4000) { while (o.childNodes.length > 3000) o.removeChild(o.firstChild); }
  o.scrollTop = o.scrollHeight;
}
function codeRunUI(run) { CODE.running = run; const r = $('#codeRun'), r2 = $('#codeRunSel'), s = $('#codeStop'); if (r) { r.disabled = run; r2.disabled = run; s.disabled = !run; } }
function codeRenderWs() {
  const w = $('#codeWs'); if (!w) return;
  if (!CODE.ws.length) { w.replaceChildren(h('div', {class: 'note', style: 'padding:6px'}, 'Değişken yok. Kod çalıştırınca burada listelenir.')); return; }
  const t = h('table', {class: 'wst'}, h('tr', null, h('th', null, 'Ad'), h('th', null, 'Boyut'), h('th', null, 'Sınıf'), h('th', null, 'Değer')),
    CODE.ws.map(v => h('tr', null, h('td', {class: 'b'}, v.n), h('td', null, v.sz), h('td', null, v.cls), h('td', {title: v.val}, v.val))));
  w.replaceChildren(t);
}
/* ---------- işçi ---------- */
function codeWorkerSrc() {
  return __ML_SRC + `
;(function(){
  let it = null, cur = null, added = [], pend = '', pendKind = 'o', total = 0, lastT = 0;
  const flush = () => { if (pend) { postMessage({t: 'out', s: pend, k: pendKind}); pend = ''; } };
  const out = (s, k) => { k = k || 'o'; if (k === 'clc') { flush(); postMessage({t: 'out', s: '', k: 'clc'}); return; } total += s.length; if (total > 3e6) { if (total - s.length <= 3e6) { pend += '\\n[Çıktı sınırı aşıldı; kalan çıktı gösterilmeyecek]\\n'; } return; } if (k !== pendKind) { flush(); pendKind = k; } pend += s; if (pend.length > 20000) flush(); };
  const toM = o => { const m = new MLAB.M(o.r, o.c, o.data, null, 'd'); return m; };
  const summarize = (v) => { const sz = MLAB.sizeOf(v); let val = ''; try { if (v instanceof MLAB.M) { if (v.t === 'c' && v.r <= 1) val = "'" + MLAB.toStr(v).slice(0, 60) + "'"; else if (v.re.length === 1) val = MLAB.fmtScalar(v, 0); else if (v.re.length === 0) val = '[]'; else { const k = Math.min(v.re.length, 6), p = []; for (let i = 0; i < k; i++) p.push(MLAB.fmtNumShort(v.re[i])); val = '[' + p.join(' ') + (v.re.length > k ? ' …' : '') + ']'; } } else if (MLAB.isFH(v)) val = MLAB.fhText(v); else if (MLAB.isCell(v)) val = '{' + sz[0] + '×' + sz[1] + ' cell}'; else if (MLAB.isSA(v)) val = Object.keys(v.v[0] || {}).join(', '); } catch (e) {} return {n: '', sz: sz[0] + '×' + sz[1], cls: MLAB.classOf(v), val}; };
  onmessage = ev => {
    const d = ev.data;
    if (d.t === 'reset') { it = null; return; }
    if (d.t === 'info') { postMessage({t: 'info', names: Object.keys(MLAB.builtins).filter(n => !/_$/.test(n)).sort()}); return; }
    cur = d; added = []; total = 0; pend = ''; pendKind = 'o';
    const ctx = {
      getChannel: n => cur.chans[n] || null, listChannels: () => cur.names,
      addChannel: (n, y, fs) => { added.push({n, y, fs}); },
      loadMat: n => { const m = cur.mats[n]; if (!m) return null; const o = Object.create(null); for (const k in m) o[k] = toM(m[k]); return o; },
    };
    if (!it) it = new MLAB.Interp({out, ctx}); else { it.ctx = ctx; it.out = out; }
    it.stop = false; it.deadline = Date.now() + (d.timeout || 600000); it.figs = it.figs || new Map();
    let err = null;
    try { it.funcs = it.funcs; it.run(d.code); }
    catch (e) { if (e instanceof MLAB.MLError) { err = {msg: e.message, line: (e.mline || it.cur || 0) + (e.mline || it.cur ? d.lineOff : 0), id: e.mid}; } else if (e instanceof RangeError) { err = {msg: 'Özyineleme/bellek sınırı aşıldı: ' + e.message, line: (it.cur || 0) + d.lineOff}; } else { err = {msg: 'İç hata: ' + (e && e.message || e), line: 0}; } }
    flush();
    const ws = []; for (const [k, v] of it.base.vars) { const s = summarize(v); s.n = k; ws.push(s); } ws.sort((a, b) => a.n < b.n ? -1 : 1);
    const figs = []; if (it.figs) for (const [id, f] of it.figs) figs.push({id, rows: f.rows, cols: f.cols, title: f.title, axes: f.axes.map(a => ({r: a.r, c: a.c, p: a.p, title: a.title, xlabel: a.xlabel, ylabel: a.ylabel, xlim: a.xlim, ylim: a.ylim, grid: a.grid, legend: a.legend, xscale: a.xscale, yscale: a.yscale, traces: a.traces.map(t => ({x: t.x, y: t.y, name: t.name, color: t.color, dash: t.dash, marker: t.marker, noLine: t.noLine, lw: t.lw, kind: t.kind}))}))});
    postMessage({t: 'done', id: d.id, err, ws, figs, added, curFig: it.curFig || 0});
  };
})();`;
}
function codeEnsureWorker() {
  if (CODE.worker || CODE.noWorker) return CODE.worker;
  try {
    if (typeof Worker === 'undefined' || typeof __ML_SRC !== 'string') throw new Error('yok');
    const w = new Worker(URL.createObjectURL(new Blob([codeWorkerSrc()], {type: 'text/javascript'})));
    w.onmessage = e => codeOnMsg(e.data); w.onerror = e => { logErr('kod-işçi', e.message || 'hata'); CODE.noWorker = true; CODE.worker = null; try { w.terminate(); } catch (_) {} if (CODE.pendingRun) { codeOut('İşçi başlatılamadı; ana iş parçacığında çalıştırılıyor.\n', 'warn'); const p = CODE.pendingRun; CODE.pendingRun = null; codeRunMain(p); } };
    CODE.worker = w;
  } catch (e) { CODE.noWorker = true; CODE.worker = null; }
  return CODE.worker;
}
function codeOnMsg(m) {
  if (m.t === 'out') { codeOut(m.s, m.k === 'e' ? 'err' : m.k); return; }
  if (m.t === 'info') { CODE.fnNames = m.names; if (CODE.fnCb) CODE.fnCb(); return; }
  if (m.t === 'done') codeFinish(m);
}
function codeFinish(m) {
  CODE.pendingRun = null; codeRunUI(false);
  if (m.err) { CODE.errLine = m.err.line || 0; codeOut(`Hata${m.err.line ? ' (satır ' + m.err.line + ')' : ''}: ${m.err.msg}\n`, 'err'); if (CODE.errLine && CODE.syncGut) { CODE.syncGut(); const ed = $('#codeEd'); const lines = ed.value.split('\n'); let pos = 0; for (let i = 0; i < CODE.errLine - 1 && i < lines.length; i++) pos += lines[i].length + 1; ed.setSelectionRange(pos, pos + (lines[CODE.errLine - 1] || '').length); } } else { CODE.errLine = 0; CODE.syncGut && CODE.syncGut(); }
  CODE.ws = m.ws || []; codeRenderWs();
  if (m.added && m.added.length) { let n = 0; for (const a of m.added) { const src = CODE.srcFor && CODE.srcFor.find(c => c.n === a.y.length); const c = addDerived(cleanName(a.n), a.y, null); if (src && src.n === a.y.length && Math.abs(src.fs - a.fs) < 1e-9 * Math.max(1, a.fs)) c.copyTiming(src); else { c.g = null; c.t0 = 0; c.dtS = 1 / a.fs; } if (src && src.unit) c.unit = src.unit; n++; } toast(n + ' kanal eklendi (Türetilmiş kanallar)'); }
  if (m.figs) { CODE.figs = m.figs; CODE.figIdx = Math.max(0, m.figs.findIndex(f => f.id === m.curFig)); const fb = document.querySelector('#viewtabs button[data-v=fig]'); if (fb) fb.classList.toggle('hidden', !m.figs.length); if (m.figs.length && CODE.figsTouched) { switchView('fig'); } }
  CODE.figsTouched = false;
}
function codeStop() {
  if (!CODE.running) return;
  if (CODE.worker) { try { CODE.worker.terminate(); } catch (_) {} CODE.worker = null; CODE.ws = []; codeRenderWs(); codeOut('Durduruldu. (Çalışma alanı sıfırlandı.)\n', 'warn'); codeRunUI(false); CODE.pendingRun = null; }
  else if (CODE.mainIt) CODE.mainIt.stop = true;
}
function codeReset() { if (CODE.running) return toast('Önce çalışmayı durdurun'); if (CODE.worker) CODE.worker.postMessage({t: 'reset'}); CODE.mainIt = null; CODE.ws = []; CODE.figs = []; const fb = document.querySelector('#viewtabs button[data-v=fig]'); if (fb) fb.classList.add('hidden'); codeRenderWs(); codeOut('Çalışma alanı temizlendi.\n', 'warn'); }
/* ---------- çalıştırma ---------- */
function codeStrings(src) { const s = new Set(); const re = /'((?:[^'\n]|'')*)'|"((?:[^"\n]|"")*)"/g; let m; while ((m = re.exec(src))) { const v = (m[1] != null ? m[1].replace(/''/g, "'") : m[2].replace(/""/g, '"')); if (v && v.length < 200) s.add(v); } return [...s]; }
async function codeGather(src) {
  const chans = {}, srcFor = []; const names = []; let all = []; for (const f of allFiles()) for (const c of f.channels) { all.push(c); if (names.length < 20000) names.push(c.name); }
  const lits = codeStrings(src), mats = {};
  for (const lit of lits) {
    if (/\.mat$/i.test(lit)) { const f = S.files.find(x => x.name === lit || x.name.toLowerCase() === lit.toLowerCase()); if (f && f.vars && !mats[lit]) { const o = {}; for (const v of f.vars) { if (!v.numeric || /[.{(]/.test(v.name) || !v.dims || v.dims.length > 2 || v.count > 5e7) continue; try { const d = await MAT.load(f.mat, v); o[v.name] = {r: v.dims[0], c: v.dims[1], data: Float64Array.from(d)}; } catch (_) {} } mats[lit] = o; } continue; }
    if (chans[lit]) continue; let c = null; try { c = resolveChannel(lit); } catch (_) { continue; }
    await ensureLoaded(c); const d = new Float64Array(c.data); if (c.del) for (let i = 0; i < d.length; i++) if (c.del[i]) d[i] = NaN;
    let time = null; if (c.g) { time = new Float64Array(d.length); for (let i = 0; i < d.length; i++) time[i] = c.t(i); }
    chans[lit] = {data: d, fs: c.fs, time}; srcFor.push(c);
  }
  return {chans, names, mats, srcFor};
}
async function codeRun(selOnly) {
  codeBuildView(); if (CODE.running) return;
  const ed = $('#codeEd'); let code = ed.value, lineOff = 0;
  if (selOnly) { const a = ed.selectionStart, b = ed.selectionEnd; if (b > a) { code = ed.value.slice(a, b); lineOff = ed.value.slice(0, a).split('\n').length - 1; } else { const before = ed.value.slice(0, a), ls = before.lastIndexOf('\n') + 1; let le = ed.value.indexOf('\n', a); if (le < 0) le = ed.value.length; code = ed.value.slice(ls, le); lineOff = before.split('\n').length - 1; } }
  if (!code.trim()) return toast('Çalıştırılacak kod yok');
  codeRunUI(true); CODE.errLine = 0; CODE.syncGut && CODE.syncGut();
  codeOut('>> ' + (selOnly ? 'seçim çalıştırılıyor' : 'betik çalıştırılıyor') + '\n', 'warn');
  let g; try { g = await codeGather(code); } catch (e) { codeOut('Hata: ' + e.message + '\n', 'err'); codeRunUI(false); return; }
  CODE.srcFor = g.srcFor; CODE.figsTouched = /\b(plot|figure|subplot|semilogx|semilogy|loglog|bar|hist|histogram|stem|scatter|nexttile)\s*[\(\s]/.test(code);
  const msg = {t: 'run', id: ++CODE.runId, code, lineOff, chans: g.chans, names: g.names, mats: g.mats, timeout: 600000};
  if (codeEnsureWorker()) { CODE.pendingRun = msg; CODE.worker.postMessage(msg); } else codeRunMain(msg);
}
function codeMainLib() { return MLAB; }
async function codeRunMain(msg) {
  await new Promise(r => setTimeout(r, 20)); const ML = codeMainLib();
  const ctx = {getChannel: n => msg.chans[n] || null, listChannels: () => msg.names, addChannel: (n, y, fs) => added.push({n, y, fs}), loadMat: n => { const m = msg.mats[n]; if (!m) return null; const o = Object.create(null); for (const k in m) o[k] = new ML.M(m[k].r, m[k].c, m[k].data, null, 'd'); return o; }};
  const added = []; let err = null;
  if (!CODE.mainIt) CODE.mainIt = new ML.Interp({out: (s, k) => codeOut(s, k === 'e' ? 'err' : k), ctx}); const it = CODE.mainIt; it.ctx = ctx; it.stop = false; it.deadline = Date.now() + 60000; it.figs = it.figs || new Map();
  try { it.run(msg.code); } catch (e) { if (e instanceof ML.MLError) err = {msg: e.message, line: (e.mline || it.cur || 0) + msg.lineOff}; else err = {msg: 'İç hata: ' + e.message, line: 0}; }
  const ws = []; for (const [k, v] of it.base.vars) { const sz = ML.sizeOf(v); let val = ''; if (v instanceof ML.M && v.re.length === 1) val = ML.fmtScalar(v, 0); else if (v instanceof ML.M && v.t === 'c') val = "'" + ML.toStr(v).slice(0, 60) + "'"; ws.push({n: k, sz: sz[0] + '×' + sz[1], cls: ML.classOf(v), val}); } ws.sort((a, b) => a.n < b.n ? -1 : 1);
  const figs = []; for (const [id, f] of it.figs) figs.push({id, rows: f.rows, cols: f.cols, title: f.title, axes: f.axes});
  codeFinish({err, ws, figs, added, curFig: it.curFig || 0});
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
      const cv = cells[i].firstChild; const P = new Plot(cv, {xName: 'x', emptyText: 'Boş eksen', onHover: p => { $('#hoverinfo').textContent = p ? `x = ${fmtNum(p.x, 7)}    y = ${fmtNum(p.y, 6)}` : ''; }}); P.grms = {mode: 'off', dc: true}; P.grid = !!ax.grid; P.legend = ax.legend === true || (ax.legend == null && ax.traces.length > 1 && ax.traces.some(t => t.name));
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
