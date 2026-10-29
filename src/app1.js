/* ===== Uygulama: çekirdek (durum, ağaç, grafik yönetimi, araç çubuğu) ===== */
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else if (k === 'checked') e.checked = !!v; else e.setAttribute(k, v === true ? '' : v); }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const S = {
  files: [], derived: null, plot: null, specPlot: null, specView: null, view: 'time',
  undo: [], redo: [], kinds: new Set(), q: '', selCh: new Set(), open: new Set(), tab: 'traces',
  colorIdx: 0, noise: null, audio: null, pref: {dbl: 'new'}, fopen: new Set(), seenF: new Set(), collapsed: new Set(), rowOrder: []
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
function toast(msg, ms = 3500, act) { const t = $('#toast'); t.replaceChildren(msg); if (act) t.append(' ', h('button', {class: 'tact', onclick: () => { t.classList.add('hidden'); act.fn(); }}, act.t)); t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms); }
function errHint(m) { m = String(m || ''); if (/memory|bellek|allocation|array length/i.test(m)) return ' — Bellek yetmedi: Ayarlar ▸ Belleği boşalt ile kullanılmayan kanalları atıp tekrar deneyin.'; if (/not a valid|geçersiz|unsupported|desteklen/i.test(m)) return ' — Dosya biçimi tanınmadı: .mat (v5/v7.3), .unv ya da Excel çerçeveli binary olmalı.'; return ' — Sorun sürerse dosyayı yeniden açın.'; }
async function busy(txt, fn, opt) {
  const b = $('#busy'); $('#busytxt').textContent = txt; $('#busybar').style.width = '0%'; b.classList.remove('hidden'); S.cancel = false;
  const cb = $('#busycancel'); if (cb) { cb.style.display = opt && opt.cancel ? '' : 'none'; $('#busyCancelBtn').disabled = false; } await sleep(30);
  try { return await fn(p => { $('#busybar').style.width = Math.round(p * 100) + '%'; }); }
  catch (e) { console.error(e); if (typeof logErr === 'function') logErr('işlem', (e && e.message) || e, e && e.stack); toast('Hata: ' + (e.message || e) + errHint(e.message || e), 9000); }
  finally { b.classList.add('hidden'); }
}
function modal(title, body, buttons) {
  $('#mtitle').textContent = title; const mb = $('#mbody'); mb.replaceChildren(body); const f = $('#mfoot'); f.replaceChildren();
  const close = () => $('#modal').classList.add('hidden');
  for (const b of buttons || [{t: 'Kapat'}]) f.append(h('button', {class: b.primary ? 'primary' : '', onclick: () => { if (!b.fn || b.fn() !== false) close(); }}, b.t));
  $('#mclose').onclick = close; $('#modal').classList.remove('hidden');
}
async function saveBlob(blob, name) {
  try {
    if (window.showSaveFilePicker) { const hd = await showSaveFilePicker({suggestedName: name}); const w = await hd.createWritable(); await w.write(blob); await w.close(); return true; }
  } catch (e) { if (e && e.name === 'AbortError') return false; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); return true;
}
const fmtDur = s => s >= 3600 ? (s / 3600).toFixed(2) + ' sa' : s >= 60 ? (s / 60).toFixed(2) + ' dk' : s.toFixed(3) + ' s';
const fmtCnt = n => n.toLocaleString('tr-TR');

/* ---------- veri yükleme ---------- */
async function ensureLoaded(ch) {
  if (ch.data) return;
  if (ch.loading) return ch.loading;
  ch.loading = (async () => {
    if (ch.binLoad) { ch.data = await ch.binLoad(); ch.n = ch.data.length; uiChanged(); return; }
    const f = ch.file, v = f.vars[ch.varIdx];
    if (ch.row != null) {
      let m = f.mcache.get(ch.varIdx); if (!m) { m = await MAT.load(f.mat, v); f.mcache.set(ch.varIdx, m); }
      const out = new Float64Array(ch.n);
      if (ch.rowMode === 'row') for (let j = 0; j < ch.n; j++) out[j] = m[ch.row + ch.R * j]; else out.set(m.subarray(ch.row * ch.R, (ch.row + 1) * ch.R));
      ch.data = out;
    } else ch.data = await MAT.load(f.mat, v);
    ch.n = ch.data.length;
  })();
  try { await ch.loading; } finally { ch.loading = null; uiChanged(); }
}

/* ---------- ağaç ---------- */
function renderChips() {
  const kinds = new Set(); for (const f of allFiles()) for (const c of f.channels) kinds.add(c.kind);
  const box = $('#chips'); box.replaceChildren();
  for (const k of Object.keys(KIND)) if (kinds.has(k)) box.append(h('span', {class: 'chip' + (S.kinds.has(k) ? ' on' : ''), title: KIND[k].name + ' kanallarını süz', role: 'button', 'aria-label': KIND[k].name, tabindex: 0, onkeydown: e => { if (e.key === 'Enter') e.target.click(); }, onclick: () => { S.kinds.has(k) ? S.kinds.delete(k) : S.kinds.add(k); renderChips(); renderTree(); }}, kic(k, 15)));
}
const allFiles = () => S.derived && S.derived.channels.length ? [...S.files, S.derived] : S.files;
function chMatches(c) { if (S.kinds.size && !S.kinds.has(c.kind)) return false; if (S.q && !c.name.toLowerCase().includes(S.q)) return false; return true; }
function renderTree() {
  const box = $('#tree'); const scs = {}; box.querySelectorAll('.tbody').forEach(x => scs[x.dataset.f] = x.scrollTop); box.replaceChildren(); S.rowOrder = [];
  const filtering = S.q || S.kinds.size;
  for (const f of allFiles()) {
    const chs = f.channels.filter(chMatches);
    if (!S.seenF.has(f.id)) { S.seenF.add(f.id); S.fopen.add(f.id); }
    const fop = filtering || S.fopen.has(f.id), grp = h('div', {class: 'fgrp' + (fop ? ' open' : '')}), body = h('div', {class: 'tbody', 'data-f': f.id});
    const tog = () => { S.fopen.has(f.id) ? S.fopen.delete(f.id) : S.fopen.add(f.id); renderTree(); };
    grp.append(h('div', {class: 'tfile', tabindex: 0, role: 'button', 'aria-expanded': fop, title: f.name + ' — aç/kapat (sağ tık: dışa aktar)', oncontextmenu: e => { e.preventDefault(); fileMenu(f, e.clientX, e.clientY); }, onclick: e => { if (!e.target.closest('button')) tog(); }, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } }},
      h('span', {class: 'twisty'}, fop ? '▼' : '▶'), h('span', {class: 'nm'}, f.name), h('span', {class: 'muted'}, chs.length + '/' + f.channels.length),
      f.binary ? h('button', {title: 'Çözülmüş alanları .mat olarak kaydet', onclick: () => matDlg(f, {t: 'all'})}, '.mat') : null,
      f.derived ? null : h('button', {title: 'Dosyayı kapat', onclick: () => closeFile(f)}, '×')));
    const devs = new Map();
    for (const c of chs) { if (!devs.has(c.dev)) devs.set(c.dev, new Map()); const bm = devs.get(c.dev); if (!bm.has(c.base)) bm.set(c.base, []); bm.get(c.base).push(c); }
    for (const [dev, bm] of devs) {
      const dk = f.id + '/' + dev, open = filtering || S.open.has(dk);
      const total = [...bm.values()].reduce((a, b) => a + b.length, 0);
      body.append(h('div', {class: 'tdev', oncontextmenu: e => { e.preventDefault(); devMenu(f, dev, e.clientX, e.clientY); }, onclick: () => { S.open.has(dk) ? S.open.delete(dk) : S.open.add(dk); renderTree(); }}, h('span', {class: 'twisty'}, open ? '▼' : '▶'), dev, h('span', {class: 'meta'}, '(' + total + ')')));
      if (!open) continue;
      for (const [base, list] of bm) {
        if (list.length > 1 && list.every(c => c.base === base)) {
          const bk = dk + '/' + base, bo = filtering || S.open.has(bk);
          body.append(h('div', {class: 'trow', ondblclick: e => e.shiftKey ? addToNewAxes(list, false) : addGroup(list), onclick: e => { if (e.target.closest('button')) return; S.open.has(bk) ? S.open.delete(bk) : S.open.add(bk); renderTree(); }, draggable: 'true', ondragstart: e => dragStart(e, list)},
            h('span', {class: 'twisty'}, bo ? '▼' : '▶'), kic(list[0].kind), h('span', {class: 'nm'}, hl(base)), h('span', {class: 'meta'}, list.length + ' kanal'),
            h('button', {class: 'add', 'data-ic': 'stack', title: 'Her kanalı ayrı alt grafiğe ekle', onclick: e => { e.stopPropagation(); addToNewAxes(list, false); }}), h('button', {class: 'add', 'data-ic': 'layers', title: 'Hepsini tek (yeni) grafiğe aynı eksende ekle', onclick: e => { e.stopPropagation(); addGroup(list); }}), h('button', {class: 'add', 'data-ic': 'swap', title: 'Mevcut grafiği kaldırıp bu kanalları tek grafikte çiz', onclick: e => { e.stopPropagation(); replacePlot(list, true); }})));
          if (bo) for (const c of list) body.append(chRow(c, c.comp || c.rest, true));
        } else { if ((f.binary || f.unv) && !S.q && (bm._n = (bm._n || 0) + 1) > 150) { if (bm._n === 151) body.append(h('div', {class: 'note', style: 'padding:2px 14px'}, '… ' + (bm.size - 150) + ' kanal daha (Ara kutusuyla bulun)')); continue; } for (const c of list) body.append(chRow(c, c.rest, false)); }
      }
    }
    if (fop) grp.append(body); box.append(grp);
  }
  if (!S.files.length) box.append(h('div', {class: 'note', style: 'padding:14px'}, 'Henüz dosya yok. "Dosya aç…" düğmesini kullanın veya .mat dosyalarını pencereye sürükleyin.'));
  if (typeof syncFeatUI === 'function' && S.xyPlot) syncFeatUI(); if (typeof syncWelcome === 'function') syncWelcome();
  for (const x of box.querySelectorAll('.tbody')) if (scs[x.dataset.f]) x.scrollTop = scs[x.dataset.f]; updateSelInfo();
  uiChanged();
}
const hl = label => { const q = S.q, i = q ? String(label).toLowerCase().indexOf(q) : -1; return i < 0 ? [label] : [label.slice(0, i), h('mark', null, label.slice(i, i + q.length)), label.slice(i + q.length)]; };
function dblAct(e, list) {
  if (list.length && list.every(c => c.file && c.file.feature)) return featAdd(list); const same = (S.pref.dbl === 'same') !== !!e.shiftKey; return same ? addToAxes(activeAxes(), list) : addToNewAxes(list, false); }
function chMM(c) { if (!c.data) return ''; if (!c._mm) { let lo = Infinity, hi = -Infinity; const d = c.data; for (let i = 0; i < d.length; i++) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v; } c._mm = [lo, hi]; } return '\nmin ' + fmtNum(c._mm[0], 5) + ' · max ' + fmtNum(c._mm[1], 5); }
function chRow(c, label, sub) {
  S.rowOrder.push(c);
  const row = h('div', {class: 'trow' + (sub ? ' sub' : '') + (S.selCh.has(c.uid) ? ' sel' : ''), draggable: 'true', tabindex: 0,
    onclick: e => {
      if (e.target.closest('button')) return;
      if (e.shiftKey && S.lastSel) { const o = S.rowOrder.map(x => x.uid), a = o.indexOf(S.lastSel), b = o.indexOf(c.uid); if (a >= 0 && b >= 0) { for (let i = Math.min(a, b); i <= Math.max(a, b); i++) S.selCh.add(o[i]); } else S.selCh.add(c.uid); }
      else if (e.ctrlKey || e.metaKey) { S.selCh.has(c.uid) ? S.selCh.delete(c.uid) : S.selCh.add(c.uid); S.lastSel = c.uid; } else { S.selCh = new Set([c.uid]); S.lastSel = c.uid; }
      renderTree(); const r = [...document.querySelectorAll('#tree .trow')].find(x => x._uid === c.uid); if (r && e.detail === 0) r.focus();
    },
    oncontextmenu: e => { e.preventDefault(); if (!S.selCh.has(c.uid)) { S.selCh = new Set([c.uid]); S.lastSel = c.uid; renderTree(); } chMenu(c, e.clientX, e.clientY); }, ondblclick: e => dblAct(e, [c]), ondragstart: e => dragStart(e, S.selCh.has(c.uid) ? chsFromSel() : [c]), ondragend: () => hideDZ(),
    onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); dblAct(e, S.selCh.size > 1 && S.selCh.has(c.uid) ? chsFromSel() : [c]); } else if (e.key === ' ') { e.preventDefault(); S.selCh.has(c.uid) ? S.selCh.delete(c.uid) : S.selCh.add(c.uid); S.lastSel = c.uid; const u = c.uid; renderTree(); const r = [...document.querySelectorAll('#tree .trow')].find(x => x._uid === u); if (r) r.focus(); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const rows = [...document.querySelectorAll('#tree .trow')], i = rows.indexOf(row), n = rows[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) n.focus(); } },
    title: c.name + '\n' + fmtCnt(c.n) + ' örnek · ' + fmtNum(c.fs, 6) + ' Hz' + chMM(c)},
    kic(c.kind), h('span', {class: 'nm'}, hl(label)), h('span', {class: 'meta'}, c.n >= 1e6 ? (c.n / 1e6).toFixed(1) + 'M' : c.n >= 1e3 ? (c.n / 1e3).toFixed(0) + 'k' : c.n),
    h('button', {class: 'add', 'data-ic': 'stack', title: 'Yeni alt grafik olarak ekle', onclick: e => { e.stopPropagation(); addToNewAxes([c]); }}),
    h('button', {class: 'add', 'data-ic': 'layers', title: 'Aktif grafiğe aynı eksende ekle', onclick: e => { e.stopPropagation(); addToAxes(activeAxes(), [c]); }}),
    h('button', {class: 'add', 'data-ic': 'swap', title: 'Mevcut grafiği kaldırıp yerine bunu çiz', onclick: e => { e.stopPropagation(); replacePlot([c]); }}));
  row._uid = c.uid; return row;
}
function chsFromSel() { const out = []; for (const f of allFiles()) for (const c of f.channels) if (S.selCh.has(c.uid)) out.push(c); return out; }
function updateSelInfo() { let a = ''; if (S.plot && S.plot.axes.length) { const i = S.plot.axes.indexOf(activeAxes()); a = ' · aktif: ' + (i + 1) + '. grafik'; } $('#selinfo').textContent = 'Seçili: ' + S.selCh.size + a; }
function dragStart(e, list) { e.dataTransfer.setData('text/matview', JSON.stringify(list.map(c => c.uid))); e.dataTransfer.effectAllowed = 'copy'; }
function chByUid(u) { for (const f of allFiles()) for (const c of f.channels) if (c.uid === u) return c; return null; }

/* ---------- dosya işlemleri ---------- */
async function openFiles(files) {
  files = [...files];
  { // Telemetri: çerçeve tipli binary, telemetryParser ayar JSON'u, kamera videosu
    const vids = files.filter(f => /\.(h264|264|mp4)$/i.test(f.name)); if (vids.length && typeof tlmPlayVideo === 'function') { tlmPlayVideo(vids[0]); files = files.filter(f => !vids.includes(f)); }
    const js = files.filter(f => /\.json$/i.test(f.name)); for (const j of js) { files = files.filter(f => f !== j); if (tlmIsSettingsJson(await j.text())) await tlmImportSettings(j); else toast(j.name + ': tanınmayan JSON (telemetri ayar dosyası değil)', 6000); }
    // telemetryParser biçimli template: Telemetri'de çerçeve tipi tanımlıysa ya da görünüm açıksa oraya, değilse (geriye uyum) Excel çerçeve akışına
    const tpl = [], toTlm = typeof tlmPrefers === 'function' && tlmPrefers();
    if (toTlm) for (const f of files.filter(f => /\.xlsx$/i.test(f.name))) { try { const sh = await XLSX.read(f); if (FRM.isFrameBook(sh) && !sh.some(x => /cerceve_?ayar/.test(FRM.fold(x.name)) || /^(cerceve|çerçeve|frame)/i.test(x.name))) tpl.push(f); } catch (_) {} }
    if (tpl.length && typeof tlmAddTemplates === 'function') { await tlmAddTemplates(tpl); files = files.filter(f => !tpl.includes(f)); }
    const bins = files.filter(f => /\.(bin|binary)$/i.test(f.name)), oldFrm = files.some(f => /\.xlsx$/i.test(f.name)) && bins.length;
    if (bins.length && !oldFrm && toTlm) { tlmOpenBins(bins, 'decode'); files = files.filter(f => !bins.includes(f)); }
    if (!files.length) return; } { const ms = files.filter(f => /\.(m|fig)$/i.test(f.name)); if (ms.length) { files = files.filter(f => !ms.includes(f)); if (typeof codeOpenM === 'function') codeOpenM(ms); if (!files.length) return; } } if (files.some(f => /\.tdms_index$/i.test(f.name))) { toast('.tdms_index dosyası atlandı (yalnızca dizin; .tdms dosyası okunur)', 5000); files = files.filter(f => !/\.tdms_index$/i.test(f.name)); } const unvs = files.filter(f => /\.(unv|uff)$/i.test(f.name)); const tdmss = files.filter(f => /\.tdms$/i.test(f.name)), mdfs = files.filter(f => /\.(mf4|mdf)$/i.test(f.name)); let other = files.filter(f => !/\.(mat|unv|uff|tdms|mf4|mdf)$/i.test(f.name)); files = files.filter(f => /\.mat$/i.test(f.name));
  const tabs = other.filter(f => /\.(csv|tsv|txt)$/i.test(f.name)), wavs = other.filter(f => /\.wav$/i.test(f.name)); other = other.filter(f => !tabs.includes(f) && !wavs.includes(f)); for (const w of wavs) await wavOpen(w); for (const t of tdmss) await tdmsOpen(t); for (const m of mdfs) await mdfOpen(m); const tabsX = [];
  const frmX = []; { const xls = other.filter(f => /\.xlsx$/i.test(f.name)), nonx = other.filter(f => !/\.xlsx$/i.test(f.name)), keep = [];
    for (const f of xls) { try { const sh = await XLSX.read(f); if (FRM.isFrameBook(sh) && !sh.some(s => /^(cerceve|çerçeve|frame)/i.test(s.name))) frmX.push(f); else if (nonx.length || sh.some(s => /cerceve|çerçeve|frame/i.test(s.name))) keep.push(f); else tabsX.push([f, sh]); } catch (e) { toast('Excel okunamadı: ' + (e.message || e), 7000); } }
    other = [...nonx, ...keep]; }
  for (const u of unvs) await unvOpen(u);
  for (const t of tabs) await tableOpen(t); for (const [f, sh] of tabsX) await tableOpen(f, sh);
  if (frmX.length) { const nb = other.filter(f => !/\.xlsx$/i.test(f.name)); if (await frmLoadExcel(frmX[0])) { if (nb.length) { FS.bin = nb[0]; other = other.filter(f => f !== nb[0]); } frmDialog(); } }
  if (other.length && FS.def && !other.some(f => /\.xlsx$/i.test(f.name))) { frmDropBin(other); other = []; }
  if (other.length) await binFilesIn(other);
  for (const file of files) {
    await busy('Dosya taranıyor: ' + file.name, async () => {
      const f = await importFile(file);
      S.files.push(f); for (const d of new Set(f.channels.map(c => f.id + '/' + c.dev))) { if (S.files.length === 1 && f.channels.length < 400) S.open.add(d); }
      toast(file.name + ': ' + f.channels.length + ' kanal');
    });
  }
  renderChips(); renderTree(); if (typeof qualAuto === 'function') qualAuto(S.files.filter(f => !_seenFiles.has(f)));
  S.files.forEach(f => _seenFiles.add(f));
}
const _seenFiles = new Set();
function closeFile(f) {
  for (const ax of [...S.plot.axes]) { ax.traces = ax.traces.filter(t => t.ch.file !== f); if (!ax.traces.length) S.plot.removeAxes(ax); }
  S.undo = S.undo.filter(g => g.every(e => e.ch.file !== f)); S.redo = [];
  S.files = S.files.filter(x => x !== f); renderChips(); renderTree(); refreshAll();
}
function freeMemory() {
  const used = new Set(); for (const p of [S.plot]) for (const ax of p.axes) for (const t of ax.traces) used.add(t.ch);
  let n = 0; for (const f of allFiles()) { f.mcache.clear(); for (const c of f.channels) if (c.data && !used.has(c) && !c.derived && !c.delCount) { c.data = null; c.pyr = null; n++; } }
  toast(n + ' kanal bellekten atıldı');
}

/* ---------- grafik yönetimi ---------- */
function nextColor() { return PAL[S.colorIdx++ % PAL.length]; }
function makeTrace(ch, color) { return {kind: 'ts', ch, label: ch.name, color: color || nextColor(), width: 1, visible: true}; }
function axisLabelFor(ax) { const ks = new Set(ax.traces.map(t => t.ch.kind)), us = new Set(ax.traces.map(t => t.ch.unit || '')); ax.ylabel = us.size === 1 && [...us][0] ? [...us][0] : ks.size === 1 ? KIND[[...ks][0]].ylabel : ''; }
async function addToNewAxes(chs, one) {
  if (chs.length && chs.every(c => c.file && c.file.feature)) return featAdd(chs);
  { const sp = chs.filter(c => c.spec); if (sp.length) { await addSpec(sp); chs = chs.filter(c => !c.spec); if (!chs.length) return; } }
  const first = !S.plot.axes.length;
  if (one) { const ax = S.plot.addAxes(); for (const c of chs) ax.traces.push(makeTrace(c)); axisLabelFor(ax); S.plot.active = ax; }
  else for (const c of chs) { const ax = S.plot.addAxes(); ax.traces.push(makeTrace(c)); axisLabelFor(ax); S.plot.active = ax; }
  switchView('time'); refreshAll();
  await loadForPlot(chs, first);
}
async function addToAxes(ax, chs) {
  if (chs.length && chs.every(c => c.file && c.file.feature)) return featAdd(chs);
  { const sp = chs.filter(c => c.spec); if (sp.length) { await addSpec(sp); chs = chs.filter(c => !c.spec); if (!chs.length) return; } }
  if (!ax) return addToNewAxes(chs, true);
  const first = !S.plot.axes.length; for (const c of chs) ax.traces.push(makeTrace(c)); axisLabelFor(ax);
  switchView('time'); refreshAll(); await loadForPlot(chs, first);
}
function replacePlot(chs, one) { clearPlot(); S.plot.invalidate(); return addToNewAxes(chs, one); }
const addGroup = list => addToNewAxes(list, true);
async function loadForPlot(chs, fit) {
  await busy('Veri yükleniyor…', async prog => {
    let k = 0; for (const c of chs) { if (S.cancel) break; await ensureLoaded(c); prog(++k / chs.length); }
  }, {cancel: chs.length > 1});
  if (S.cancel) { const miss = new Set(chs.filter(c => !c.data)); if (miss.size) { for (const ax of [...S.plot.axes]) { ax.traces = ax.traces.filter(t => !miss.has(t.ch)); if (!ax.traces.length) S.plot.removeAxes(ax); } toast('Yükleme iptal edildi: ' + miss.size + ' kanal grafiğe eklenmedi'); } }
  if (fit || S.plot.axes.length) { if (fit || S.plot.axes.every(a => a.xlim[0] === 0 && a.xlim[1] === 1)) S.plot.fitAll(); }
  refreshAll();
}
function activeAxes() { const p = S.plot; return p.active && p.axes.includes(p.active) ? p.active : p.axes[p.axes.length - 1] || null; }
function activeTrace() { const ax = activeAxes(); if (!ax || !ax.traces.length) return null; return ax.traces[Math.min(ax.active || 0, ax.traces.length - 1)]; }
function visRange(tr, ax) { const ch = tr.ch; const a = Math.max(0, Math.floor(ch.timeIdx(ax.xlim[0]))), b = Math.min(ch.n, Math.ceil(ch.timeIdx(ax.xlim[1])) + 1); return [a, Math.max(a, b)]; }

/* ---------- silme / geri al ---------- */
function selectionHits() { return S.plot.sel && S.plot.sel.hits ? S.plot.sel.hits : []; }
function selCount() { return selectionHits().reduce((a, h) => a + h.idx.length, 0); }
function deleteSelection() {
  if (S.rawOn) return toast('Ham veri görünümünde silme kapalı — önce “İşlenmiş görünüme dön”');
  const hits = selectionHits(); if (!hits.length) { toast('Silinecek seçim yok'); return; }
  const group = [];
  for (const hh of hits) { const done = hh.tr.ch.applyDelete(hh.idx); if (done.length) { group.push({ch: hh.tr.ch, idx: done}); logOp('delete', {ch: hh.tr.ch.name, n: done.length}); } }
  S.plot.clearSelection(); if (group.length) { S.undo.push(group); S.redo = []; }
  toast(fmtCnt(group.reduce((a, g) => a + g.idx.length, 0)) + ' nokta silindi (Ctrl+Z ile geri alınır)'); afterEdit();
}
function undo() { const g = S.undo.pop(); if (!g) return toast('Geri alınacak işlem yok'); for (const e of g) e.inverse ? e.ch.applyDelete(e.idx) : e.ch.restore(e.idx); S.redo.push(g); afterEdit(); }
function redo() { const g = S.redo.pop(); if (!g) return toast('Yinelenecek işlem yok'); for (const e of g) e.inverse ? e.ch.restore(e.idx) : e.ch.applyDelete(e.idx); S.undo.push(g); afterEdit(); }
function restoreChannel(ch) {
  if (!ch.delCount) return; const idx = []; for (let i = 0; i < ch.n; i++) if (ch.del[i]) idx.push(i);
  const u = Uint32Array.from(idx); ch.restore(u); S.undo.push([{ch, idx: u, inverse: true}]); afterEdit();
}
function afterEdit() { S.plot.invalidate(); updateStats(); refreshCleanInfo(); }

/* ---------- araç çubuğu ---------- */
const ICON = {
  pan: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 1v14M1 8h14M8 1l-2 2M8 1l2 2M8 15l-2-2M8 15l2-2M1 8l2-2M1 8l2 2M15 8l-2-2M15 8l-2 2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  zoom: '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 10.5L14 14M5 7h4M7 5v4" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>',
  cursor: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  box: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 2"/></svg>',
  lasso: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 9C1 5 6 2 10 3s5 4 2 6-6 1-5 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 2"/></svg>',
  zout: '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 7h4M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.3"/></svg>',
  zin: '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 7h4M7 5v4M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.3"/></svg>',
  fit: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  undo: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M5 3L2 6l3 3M2 6h7a4 4 0 010 8H6" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  redo: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M11 3l3 3-3 3M14 6H7a4 4 0 000 8h3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  del: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 4h10M6 4V2h4v2M5 4l.5 10h5L11 4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'
};
const TOOLS = [['pan', 'Gez', 'Sürükleyerek kaydır. Tekerlek: X yakınlaştır, Shift+tekerlek: Y, Ctrl+tekerlek: ikisi (P)'], ['zoom', 'Yakınlaştır', 'Kutu çiz = yakınlaştır, tıkla = 2×, Shift+tıkla = uzaklaştır (Z)'], ['cursor', 'İmleç', 'Tıkla: en yakın örnek. Shift+tıkla: ikinci imleç ve ΔX/ΔY (C)'], ['box', 'Kutu seç', 'Silinecek noktaları kutuyla seç (B)'], ['lasso', 'Kement', 'Silinecek noktaları serbest çizimle seç (L)']];
function buildToolbar() {
  const tb = $('#toolbar'); tb.replaceChildren();
  for (const [m, name, tip] of TOOLS) tb.append(h('button', {id: 'tool-' + m, title: tip, class: S.plot.mode === m ? 'on' : '', onclick: () => setMode(m), html: 0}, ...[(() => { const s = document.createElement('span'); s.innerHTML = ICON[m]; s.style.display = 'flex'; return s; })(), h('span', {class: 'lbl'}, name)]));
  const ib = (id, ico, name, tip, fn) => { const b = h('button', {id, title: tip, onclick: fn}); const s = document.createElement('span'); s.innerHTML = ICON[ico]; s.style.display = 'flex'; b.append(s, h('span', {class: 'lbl'}, name)); return b; };
  tb.append(h('span', {class: 'sep'}), ib('tb-zin', 'zin', 'Yaklaş', 'Görünümü 2× yakınlaştır (+)', () => curPlot().zoomIn()), ib('tb-zout', 'zout', 'Uzaklaş', 'Görünümü 2× uzaklaştır (−)', () => curPlot().zoomOut()),
    ib('tb-fit', 'fit', 'Sığdır', 'Tümünü sığdır: tüm veriyi göster (Home / çift tık)', () => curPlot().fitAll()),
    h('span', {class: 'sep'}), ib('tb-undo', 'undo', 'Geri al', 'Ctrl+Z', undo), ib('tb-redo', 'redo', 'Yinele', 'Ctrl+Y', redo),
    h('span', {class: 'sep'}), ib('tb-del', 'del', 'Sil', 'Seçili noktaları sil (Delete)', deleteSelection));
  $('#tb-del').disabled = true;
}
function curPlot() { return S.view === 'spec' ? S.specPlot : S.view === 'xy' ? S.xyPlot : S.plot; }
function setMode(m) {
  S.plot.mode = m; S.specPlot.mode = ['box', 'lasso'].includes(m) ? 'pan' : m; if (S.xyPlot) S.xyPlot.mode = ['box', 'lasso'].includes(m) ? 'pan' : m;
  for (const [k] of TOOLS) { const b = $('#tool-' + k); if (b) b.classList.toggle('on', k === m); }
  if (m !== 'box' && m !== 'lasso') { /* seçim kalsın */ }
}
function switchView(v) {
  S.view = v; for (const b of $('#viewtabs').children) b.classList.toggle('on', b.dataset.v === v);
  for (const id of ['time', 'spec', 'sgram', 'xy', 'code', 'fig', 'gui', 'tlm']) $('#v-' + id).classList.toggle('hidden', id !== v);
  $('#toolbar').style.display = (v === 'sgram' || v === 'code' || v === 'fig' || v === 'gui' || v === 'tlm') ? 'none' : '';
  document.body.classList.toggle('tlm-on', v === 'tlm'); if (v === 'tlm' && typeof tlmShown === 'function') tlmShown();
  S.plot.resize(); S.specPlot.resize(); S.specView.resize(); if (S.xyPlot) S.xyPlot.resize(); if (v === 'fig' && typeof figShown === 'function') figShown(); if (v === 'code' && typeof codeShown === 'function') codeShown(); if (v === 'gui' && typeof guiShown === 'function') guiShown(); if (typeof syncWelcome === 'function') syncWelcome(); updateStats();
}
