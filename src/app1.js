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
/* Uzun işler: ilerleme penceresi ve İptal. İptal düğmesi her işte (yarım saniyeden uzun sürerse) görünür; Esc de iptal eder.
   İptal edilince: ilerleme bildirimi (prog) Cancelled fırlatır, DSP işçisi ve kayıtlı iptal kancaları (onCancel) durdurulur.
   İş en çok 1,5 sn içinde durmazsa pencere yine kapanır; iş durduğunda sonucu kullanılmaz. İç içe busy çağrısı ayrı
   pencere açmaz, dıştakinin içinde çalışır. */
class Cancelled extends Error { constructor() { super('İşlem iptal edildi'); this.name = 'Cancelled'; } }
const isCancel = e => !!e && (e.name === 'Cancelled' || (e.name === 'AbortError' && S.cancel));
function checkCancel() { if (S.cancel) throw new Cancelled(); }
function onCancel(fn) { if (S.busyDepth) S.cancelHooks.push(fn); }
function requestCancel() {
  if (!S.busyDepth || S.cancel) return;
  S.cancel = true; const btn = $('#busyCancelBtn'); btn.disabled = true; btn.textContent = 'Durduruluyor…';
  for (const f of S.cancelHooks.splice(0)) { try { f(); } catch (_) {} }
  if (typeof DSPW !== 'undefined' && DSPW.cancel) DSPW.cancel();
  if (S.cancelWake) S.cancelWake();
}
async function busy(txt, fn, opt) {
  opt = opt || {};
  const setP = p => { if (S.cancel) throw new Cancelled(); $('#busybar').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; };
  if (S.busyDepth) { $('#busytxt').textContent = txt; S.busyDepth++; try { return await fn(setP); } finally { S.busyDepth--; } }
  const b = $('#busy'); $('#busytxt').textContent = txt; $('#busybar').style.width = '0%'; b.classList.remove('hidden');
  S.cancel = false; S.cancelHooks = []; S.busyDepth = 1;
  const cb = $('#busycancel'), btn = $('#busyCancelBtn'); cb.style.display = 'none'; btn.disabled = false; btn.textContent = 'İptal';
  const showT = opt.cancel === false ? 0 : setTimeout(() => { cb.style.display = ''; }, opt.cancel ? 0 : 500);
  const woke = new Promise(r => { S.cancelWake = r; });
  await sleep(30);
  const run = Promise.resolve().then(() => fn(setP)); run.catch(() => {});
  try {
    const r = await Promise.race([run, woke.then(() => Promise.race([run, sleep(1500)]))]);
    if (S.cancel) throw new Cancelled();
    return r;
  } catch (e) {
    if (S.cancel || isCancel(e)) { toast('İşlem iptal edildi', 3500); return; }
    console.error(e); if (typeof logErr === 'function') logErr('işlem', (e && e.message) || e, e && e.stack); toast('Hata: ' + (e.message || e) + errHint(e.message || e), 9000);
  } finally { clearTimeout(showT); S.busyDepth = 0; S.cancelHooks = []; S.cancelWake = null; b.classList.add('hidden'); }
}
function modal(title, body, buttons) {
  $('#modal').classList.remove('mx-modal'); $('#mtitle').textContent = title; const mb = $('#mbody'); mb.replaceChildren(body); const f = $('#mfoot'); f.replaceChildren();
  const close = () => $('#modal').classList.add('hidden');
  for (const b of buttons || [{t: 'Kapat'}]) f.append(h('button', {class: (b.primary ? 'primary' : '') + (b.noic ? ' noic' : ''), onclick: () => { if (!b.fn || b.fn() !== false) close(); }}, b.t));
  $('#mclose').onclick = close; $('#modal').classList.remove('hidden');
}
// MATView.exe: Windows "Farklı kaydet" penceresi + yerel yazıcı (16 MB'lık parçalar). Tarayıcının kaydetme yolu büyük
// dosyaları önce geçici dosyaya yazıp sonra taşır ve tarar; yerel yazıcı doğrudan hedefe yazar.
async function nativeSaveBlob(blob, name) {
  const p = await window.mvSaveFile(name, S.saveDir || ''); if (!p) return false;
  S.saveDir = p.replace(/[\\/][^\\/]*$/, '');
  const fi = await window.mvFsInfo(), step = 16 << 20;
  const put = async (body, a) => { const r = await fetch('http://127.0.0.1:' + fi.port + '/write?t=' + fi.token + '&a=' + a + '&p=' + encodeURIComponent(p), {method: 'PUT', body}); if (!r.ok) throw new Error('Yerel yazma hatası (' + r.status + '): ' + (await r.text())); };
  if (!blob.size) await put(new Uint8Array(0), 0);
  try { for (let o = 0; o < blob.size; o += step) { checkCancel(); await put(blob.slice(o, o + step), o ? 1 : 0); } checkCancel(); }
  catch (e) { try { await fetch('http://127.0.0.1:' + fi.port + '/remove?t=' + fi.token + '&p=' + encodeURIComponent(p), {method: 'POST'}); } catch (_) {} throw e; }
  toast(p + ' kaydedildi', 5000); return true;
}
async function saveBlob(blob, name) {
  blob = await blob;   // zip yazıcıları Promise<Blob> döndürür
  if (typeof window.mvSaveFile === 'function' && typeof window.mvFsInfo === 'function') return nativeSaveBlob(blob, name);
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
// Arama sözdizimi: düz metin (alt dize, büyük/küçük harf duyarsız) · /düzenli ifade/i · [g] [°C] (birim) · fs>1000, fs<=500, fs=2000 · ★ (yalnız sık kullanılanlar)
function parseQuery(raw) {
  const q = {text: '', re: null, units: [], fs: [], fav: false, err: ''}; let s = String(raw || '').trim();
  s = s.replace(/\/((?:\\.|[^/])+)\/([gimsuy]*)/, (_, src, fl) => { try { q.re = new RegExp(src, fl.replace(/g/g, '') || 'i'); } catch (e) { q.err = 'Geçersiz düzenli ifade'; } return ' '; });
  s = s.replace(/\[([^\]]*)\]/g, (_, u) => { q.units.push(u.trim().toLowerCase()); return ' '; });
  s = s.replace(/\bfs\s*(<=|>=|=|:|<|>)\s*([\d.]+(?:e[-+]?\d+)?)\s*(k?)(?:hz)?/gi, (_, op, v, k) => { q.fs.push([op === ':' ? '=' : op, +v * (k ? 1000 : 1)]); return ' '; });
  s = s.replace(/★|\bfav:?(?=\s|$)/gi, () => { q.fav = true; return ' '; });
  q.text = s.replace(/\s+/g, ' ').trim().toLowerCase(); return q;
}
function favKey(c) { return (c.file && c.file.name || '') + '|' + c.name; }
function isFav(c) { return S.fav && S.fav.has(favKey(c)); }
function toggleFav(c, on) {
  if (!S.fav) S.fav = new Set(); const k = favKey(c); (on == null ? !S.fav.has(k) : on) ? S.fav.add(k) : S.fav.delete(k);
  try { localStorage.setItem('mv.fav', JSON.stringify([...S.fav].slice(-5000))); } catch (_) {}
  renderTree();
}
function getQF() {
  if (S._qfFor !== S.q) { const el = typeof document !== 'undefined' && document.getElementById('q'), raw = el && el.value.trim().toLowerCase() === S.q ? el.value : S.q; S.qf = S.q ? parseQuery(raw) : null; S._qfFor = S.q; }
  return S.qf;
}
function chMatches(c) {
  if (S.kinds.size && !S.kinds.has(c.kind)) return false;
  if (S.favOnly && !isFav(c)) return false;
  const q = getQF(); if (!q) return true;
  if (q.fav && !isFav(c)) return false;
  if (q.text && !c.name.toLowerCase().includes(q.text)) return false;
  if (q.re && !q.re.test(c.name)) return false;
  if (q.units.length) { const u = (c.unit || (KIND[c.kind] && KIND[c.kind].ylabel) || '').toLowerCase().replace(/[\[\]()]/g, '').trim(); if (!q.units.some(x => x === u)) return false; }
  if (q.fs.length) { const f = c.fs; if (!isFinite(f)) return false; for (const [op, v] of q.fs) { const tol = Math.max(1e-9, Math.abs(v) * 1e-6); if (op === '=' ? Math.abs(f - v) > tol : op === '<' ? !(f < v) : op === '>' ? !(f > v) : op === '<=' ? !(f <= v + tol) : !(f >= v - tol)) return false; } }
  return true;
}
// Kanal ağacı: satırlar önce tanımlayıcı listesi olarak kurulur; bir dosyada çok satır varsa yalnız görünen pencere DOM'a
// eklenir (sanal kaydırma — 10 000+ kanal akıcı). Satır yüksekliği sabittir (TREE_RH).
const TREE_RH = 22, TREE_VIRT = 250;
function renderTree() {
  const box = $('#tree'); const scs = {}; box.querySelectorAll('.tbody').forEach(x => scs[x.dataset.f] = x.scrollTop); box.replaceChildren(); S.rowOrder = []; S.treeIdx = new Map();
  const filtering = S.q || S.kinds.size || S.favOnly;
  const virt = [], files = allFiles(), multi = files.filter(f => !f.derived).length > 1;
  // yeni açılan dosya açık gelir, diğerleri kapanır (akordeon): çok dosyada her biri ayrı küçük kutuya sıkışmaz
  for (const f of files) if (!S.seenF.has(f.id)) { S.seenF.add(f.id); S.fopen.clear(); S.fopen.add(f.id); }
  syncTreeMode(multi);
  if (multi && S.treeMode === 'param') renderTreeParam(box, filtering, virt);
  else for (const f of files) {
    const chs = f.channels.filter(chMatches), vids = camVideos(f, filtering);
    const fop = S.fopen.has(f.id) || files.length === 1, grp = h('div', {class: 'fgrp' + (fop ? ' open' : '') + (filtering && !chs.length && !vids.length ? ' nomatch' : '')}), body = h('div', {class: 'tbody', 'data-f': f.id});
    // tık: yalnız bu dosya açık · Ctrl+tık: diğerlerini kapatmadan aç/kapat
    const tog = e => { if (S.fopen.has(f.id)) S.fopen.delete(f.id); else { if (!(e && (e.ctrlKey || e.metaKey))) S.fopen.clear(); S.fopen.add(f.id); } renderTree(); };
    grp.append(h('div', {class: 'tfile', tabindex: 0, role: 'button', 'aria-expanded': fop, title: f.name + ' — aç/kapat (Ctrl+tık: diğerlerini kapatmadan; sağ tık: dışa aktar)', oncontextmenu: e => { e.preventDefault(); fileMenu(f, e.clientX, e.clientY); }, onclick: e => { if (!e.target.closest('button')) tog(e); }, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(e); } }},
      h('span', {class: 'twisty'}, fop ? '▼' : '▶'), h('span', {class: 'nm'}, f.name), h('span', {class: 'muted'}, f.videoOnly ? vids.length + ' video' : chs.length + '/' + f.channels.length),
      f.binary ? h('button', {title: 'Çözülmüş alanları .mat olarak kaydet', onclick: () => matDlg(f, {t: 'all'})}, '.mat') : null,
      f.derived ? null : h('button', {title: 'Dosyayı kapat', onclick: () => closeFile(f)}, '×')));
    if (!fop) { box.append(grp); continue; }
    const items = [], devs = new Map();
    camTreeItems(f, vids, items, filtering);
    for (const c of chs) { if (!devs.has(c.dev)) devs.set(c.dev, new Map()); const bm = devs.get(c.dev); if (!bm.has(c.base)) bm.set(c.base, []); bm.get(c.base).push(c); }
    for (const [dev, bm] of devs) {
      const dk = f.id + '/' + dev, open = filtering || S.open.has(dk);
      let total = 0; for (const l of bm.values()) total += l.length;
      items.push({k: 'dev', dev, dk, open, total, f});
      if (!open) continue;
      for (const [base, list] of bm) {
        if (list.length > 1 && list.every(c => c.base === base)) {
          const bk = dk + '/' + base, bo = filtering || S.open.has(bk);
          items.push({k: 'grp', base, bk, bo, list});
          if (bo) for (const c of list) items.push({k: 'ch', c, label: c.comp || c.rest, sub: true});
        } else for (const c of list) items.push({k: 'ch', c, label: c.rest, sub: false});
      }
    }
    items.forEach((it, i) => { if (it.k === 'ch') { S.rowOrder.push(it.c); S.treeIdx.set(it.c.uid, {body, i}); } });
    body._items = items;
    if (items.length <= TREE_VIRT) { for (const it of items) body.append(treeItemEl(it)); }
    else { body.classList.add('virt'); body._top = h('div', {class: 'vsp'}); body._bot = h('div', {class: 'vsp'}); body.append(body._top, body._bot); body.addEventListener('scroll', () => { if (!body._raf) body._raf = requestAnimationFrame(() => { body._raf = 0; treeSlice(body); }); }, {passive: true}); virt.push(body); }
    grp.append(body); box.append(grp);
  }
  if (!S.files.length) box.append(h('div', {class: 'note', style: 'padding:14px'}, 'Henüz dosya yok. "Dosya aç…" düğmesini kullanın veya .mat dosyalarını pencereye sürükleyin.'));
  if (S.qf && S.qf.err) box.prepend(h('div', {class: 'note', style: 'padding:4px 10px;color:var(--danger)'}, S.qf.err));
  if (typeof syncFeatUI === 'function' && S.xyPlot) syncFeatUI(); if (typeof syncWelcome === 'function') syncWelcome();
  for (const x of box.querySelectorAll('.tbody')) { if (x._top) treeSlice(x, scs[x.dataset.f] || 0); if (scs[x.dataset.f]) x.scrollTop = scs[x.dataset.f]; if (x._top) treeSlice(x); }
  updateSelInfo();
  uiChanged();
}
// Ağaç görünümü: "Dosyaya göre" (her dosya ayrı) ya da "Parametreye göre" (aynı adlı parametre tüm dosyalarda tek satır,
// altında dosyalar). Seçenek yalnız birden çok dosya açıkken görünür ve hatırlanır.
function syncTreeMode(multi) {
  if (S.treeMode == null) { S.treeMode = 'file'; try { S.treeMode = localStorage.getItem('mv.treeMode') || 'file'; } catch (_) {} }
  const box = $('#tmode'); if (!box) return;
  box.classList.toggle('hidden', !multi);
  box.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.m === S.treeMode); b.onclick = () => { S.treeMode = b.dataset.m; try { localStorage.setItem('mv.treeMode', S.treeMode); } catch (_) {} renderTree(); }; });
}
const fileShort = f => String(f && f.name || '').replace(/\s*·\s*telemetri$/i, '').replace(/\.(mat|unv|uff|csv|tsv|txt|xlsx|tdms|mf4|mdf|wav|bin)$/i, '');
function renderTreeParam(box, filtering, virt) {
  const devs = new Map(); let nf = 0;
  for (const f of allFiles()) {
    let any = false;
    for (const c of f.channels) {
      if (!chMatches(c)) continue; any = true;
      if (!devs.has(c.dev)) devs.set(c.dev, new Map()); const pm = devs.get(c.dev), k = c.rest || c.name;
      if (!pm.has(k)) pm.set(k, []); pm.get(k).push(c);
    }
    if (any) nf++;
  }
  const items = [], body = h('div', {class: 'tbody', 'data-f': 'P'}), grp = h('div', {class: 'fgrp open pmode'});
  for (const [dev, pm] of devs) {
    const dk = 'P/' + dev, open = filtering || devs.size === 1 || S.open.has(dk);
    let tot = 0; for (const l of pm.values()) tot += l.length;
    items.push({k: 'dev', dev, dk, open, total: tot, meta: pm.size + ' parametre'});
    if (!open) continue;
    for (const [nm, list] of pm) {
      if (list.length === 1) { items.push({k: 'ch', c: list[0], label: nm + '  — ' + fileShort(list[0].file), sub: false}); continue; }
      const bk = dk + '/' + nm, bo = S.open.has(bk);
      items.push({k: 'grp', base: nm, bk, bo, list, meta: list.length + ' dosya', tip: 'Çift tık: tüm dosyalardaki ' + nm + ' aynı grafikte (karşılaştırma)'});
      if (bo) for (const c of list) items.push({k: 'ch', c, label: fileShort(c.file), sub: true});
    }
  }
  { const vv = []; for (const f of allFiles()) for (const v of camVideos(f, filtering)) vv.push({f, v}); if (vv.length) camTreeItems(null, vv, items, filtering); }
  items.forEach((it, i) => { if (it.k === 'ch') { S.rowOrder.push(it.c); S.treeIdx.set(it.c.uid, {body, i}); } });
  body._items = items;
  grp.append(h('div', {class: 'tfile static'}, h('span', {class: 'nm'}, 'Tüm dosyalar'), h('span', {class: 'muted'}, nf + ' dosya')));
  if (!items.length) body.append(h('div', {class: 'note', style: 'padding:8px 10px'}, 'Eşleşen parametre yok'));
  else if (items.length <= TREE_VIRT) { for (const it of items) body.append(treeItemEl(it)); }
  else { body.classList.add('virt'); body._top = h('div', {class: 'vsp'}); body._bot = h('div', {class: 'vsp'}); body.append(body._top, body._bot); body.addEventListener('scroll', () => { if (!body._raf) body._raf = requestAnimationFrame(() => { body._raf = 0; treeSlice(body); }); }, {passive: true}); virt.push(body); }
  grp.append(body); box.append(grp);
}
// aynı grafikte aynı adlı izler farklı dosyalardansa lejantta dosya adı da görünsün
function tagDupLabels(ax) {
  if (!ax) return; const by = new Map();
  for (const t of ax.traces) if (t.ch && t.ch.file) { const k = t.ch.name; if (!by.has(k)) by.set(k, []); by.get(k).push(t); }
  for (const [nm, ts] of by) if (new Set(ts.map(t => t.ch.file)).size > 1) for (const t of ts) if (t.label === nm) t.label = nm + ' · ' + fileShort(t.ch.file);
}
// sanal gövdede görünen pencereyi (± tampon) çiz
function treeSlice(body, st) {
  const items = body._items, n = items.length, H = body.clientHeight || 600, top = st != null ? st : body.scrollTop;
  const a = Math.max(0, Math.floor(top / TREE_RH) - 20), b = Math.min(n, Math.ceil((top + H) / TREE_RH) + 20);
  if (body._a === a && body._b === b) return; body._a = a; body._b = b;
  const foc = document.activeElement && body.contains(document.activeElement) ? document.activeElement._uid : null;
  while (body._top.nextSibling && body._top.nextSibling !== body._bot) body._top.nextSibling.remove();
  const frag = document.createDocumentFragment(); for (let i = a; i < b; i++) frag.append(treeItemEl(items[i]));
  body._top.style.height = a * TREE_RH + 'px'; body._bot.style.height = (n - b) * TREE_RH + 'px';
  body.insertBefore(frag, body._bot); if (typeof decorate === 'function') decorate(body);
  if (foc != null) { const r = [...body.querySelectorAll('.trow')].find(x => x._uid === foc); if (r) r.focus({preventScroll: true}); }
}
// kanal satırına git (sanal gövdede gerekirse kaydırıp çizer) ve odakla
function treeFocusUid(uid) {
  const e = S.treeIdx && S.treeIdx.get(uid); if (!e) return null; const {body, i} = e;
  if (body._top) { const y = i * TREE_RH; if (y < body.scrollTop || y + TREE_RH > body.scrollTop + body.clientHeight) body.scrollTop = Math.max(0, y - body.clientHeight / 2); treeSlice(body); }
  const r = [...body.querySelectorAll('.trow')].find(x => x._uid === uid); if (r) r.focus(); return r;
}
// kamera videoları: dosyanın en üstünde "Kamera" grubu; satıra tık / ▶ → kamera penceresi
function camVideos(f, filtering) {
  const vs = (f && f.videos) || []; if (!vs.length) return [];
  const q = filtering && S.q ? S.q.toLowerCase() : ''; if (filtering && !q) return [];
  return q ? vs.filter(v => (v.name || '').toLowerCase().includes(q) || 'kamera video'.includes(q)) : vs;
}
function camTreeItems(f, list, items, filtering) {
  if (!list.length) return;
  const dk = (f ? f.id : 'P') + '/#kamera', open = filtering || !S.open.has(dk + '#kapali');
  items.push({k: 'dev', dev: 'Kamera', dk: dk + '#kapali', open, total: list.length, meta: list.length + ' video', inv: true});
  if (open) for (const x of list) items.push(f ? {k: 'vid', f, v: x} : {k: 'vid', f: x.f, v: x.v, label: (x.v.name || 'video') + '  — ' + fileShort(x.f)});
}
function vidRow(it) {
  const {f, v} = it, on = typeof CAMV !== 'undefined' && CAMV.current && CAMV.current.v === v;
  const play = () => CAMV.open(f, v);
  return h('div', {class: 'trow vidrow' + (on ? ' sel' : ''), tabindex: 0, title: (v.summary || '') + (v.sync ? ' · kanal zamanıyla eşli' : '') + ' — tık: kamera penceresinde oynat', onclick: e => { if (!e.target.closest('button')) play(); }, onkeydown: e => { if (e.key === 'Enter') play(); }},
    h('span', {class: 'twisty'}), icEl('video', 14), h('span', {class: 'nm'}, it.label || v.name || 'video'), h('span', {class: 'meta'}, v.dur ? fmtNum(v.dur, 4) + ' s' : ''),
    h('button', {class: 'add', 'data-ic': 'play', title: 'Kamera penceresinde oynat', onclick: e => { e.stopPropagation(); play(); }}));
}
function treeItemEl(it) {
  if (it.k === 'ch') return chRow(it.c, it.label, it.sub);
  if (it.k === 'vid') return vidRow(it);
  if (it.k === 'dev' && it.inv) { const {dev, dk, open} = it; return h('div', {class: 'tdev', onclick: () => { S.open.has(dk) ? S.open.delete(dk) : S.open.add(dk); renderTree(); }}, h('span', {class: 'twisty'}, open ? '▼' : '▶'), dev, h('span', {class: 'meta'}, '(' + it.meta + ')')); }
  if (it.k === 'dev') { const {dev, dk, open, total, f} = it; return h('div', {class: 'tdev', oncontextmenu: e => { e.preventDefault(); if (f) devMenu(f, dev, e.clientX, e.clientY); }, onclick: () => { S.open.has(dk) ? S.open.delete(dk) : S.open.add(dk); renderTree(); }}, h('span', {class: 'twisty'}, open ? '▼' : '▶'), dev, h('span', {class: 'meta'}, '(' + (it.meta || total) + ')')); }
  const {base, bk, bo, list} = it;
  return h('div', {class: 'trow', title: it.tip || null, ondblclick: e => e.shiftKey ? addToNewAxes(list, false) : addGroup(list), onclick: e => { if (e.target.closest('button')) return; S.open.has(bk) ? S.open.delete(bk) : S.open.add(bk); renderTree(); }, draggable: 'true', ondragstart: e => dragStart(e, list)},
    h('span', {class: 'twisty'}, bo ? '▼' : '▶'), kic(list[0].kind), h('span', {class: 'nm'}, hl(base)), h('span', {class: 'meta'}, it.meta || list.length + ' kanal'),
    h('button', {class: 'add', 'data-ic': 'stack', title: 'Her kanalı ayrı alt grafiğe ekle', onclick: e => { e.stopPropagation(); addToNewAxes(list, false); }}), h('button', {class: 'add', 'data-ic': 'layers', title: 'Hepsini tek (yeni) grafiğe aynı eksende ekle', onclick: e => { e.stopPropagation(); addGroup(list); }}), h('button', {class: 'add', 'data-ic': 'swap', title: 'Mevcut grafiği kaldırıp bu kanalları tek grafikte çiz', onclick: e => { e.stopPropagation(); replacePlot(list, true); }}));
}
const hl = label => {
  label = String(label); const q = getQF(); if (!q) return [label];
  if (q.re) { const m = q.re.exec(label); if (m && m[0]) return [label.slice(0, m.index), h('mark', null, m[0]), label.slice(m.index + m[0].length)]; }
  const t = q.text, i = t ? label.toLowerCase().indexOf(t) : -1; return i < 0 ? [label] : [label.slice(0, i), h('mark', null, label.slice(i, i + t.length)), label.slice(i + t.length)];
};
function dblAct(e, list) {
  if (list.length && list.every(c => c.file && c.file.feature)) return featAdd(list); const same = (S.pref.dbl === 'same') !== !!e.shiftKey; return same ? addToAxes(activeAxes(), list) : addToNewAxes(list, false); }
function chMM(c) { if (!c.data) return ''; if (!c._mm) { let lo = Infinity, hi = -Infinity; const d = c.data; for (let i = 0; i < d.length; i++) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v; } c._mm = [lo, hi]; } return '\nmin ' + fmtNum(c._mm[0], 5) + ' · max ' + fmtNum(c._mm[1], 5); }
function chRow(c, label, sub) {
  const row = h('div', {class: 'trow' + (sub ? ' sub' : '') + (S.selCh.has(c.uid) ? ' sel' : ''), draggable: 'true', tabindex: 0,
    onclick: e => {
      if (e.target.closest('button')) return;
      if (e.shiftKey && S.lastSel) { const o = S.rowOrder.map(x => x.uid), a = o.indexOf(S.lastSel), b = o.indexOf(c.uid); if (a >= 0 && b >= 0) { for (let i = Math.min(a, b); i <= Math.max(a, b); i++) S.selCh.add(o[i]); } else S.selCh.add(c.uid); }
      else if (e.ctrlKey || e.metaKey) { S.selCh.has(c.uid) ? S.selCh.delete(c.uid) : S.selCh.add(c.uid); S.lastSel = c.uid; } else { S.selCh = new Set([c.uid]); S.lastSel = c.uid; }
      renderTree(); treeFocusUid(c.uid);
    },
    oncontextmenu: e => { e.preventDefault(); if (!S.selCh.has(c.uid)) { S.selCh = new Set([c.uid]); S.lastSel = c.uid; renderTree(); } chMenu(c, e.clientX, e.clientY); }, ondblclick: e => dblAct(e, [c]), ondragstart: e => dragStart(e, S.selCh.has(c.uid) ? chsFromSel() : [c]), ondragend: () => hideDZ(),
    onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); dblAct(e, S.selCh.size > 1 && S.selCh.has(c.uid) ? chsFromSel() : [c]); } else if (e.key === ' ') { e.preventDefault(); S.selCh.has(c.uid) ? S.selCh.delete(c.uid) : S.selCh.add(c.uid); S.lastSel = c.uid; const u = c.uid; renderTree(); treeFocusUid(u); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const o = S.rowOrder, i = o.indexOf(c), n = o[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) treeFocusUid(n.uid); } else if (e.key === '*' || (e.key.toLowerCase() === 'f' && e.altKey)) { e.preventDefault(); const u = c.uid; toggleFav(c); treeFocusUid(u); } },
    title: c.name + '\n' + fmtCnt(c.n) + ' örnek · ' + fmtNum(c.fs, 6) + ' Hz' + chMM(c)},
    h('button', {class: 'fav noic' + (isFav(c) ? ' on' : ''), title: isFav(c) ? 'Sık kullanılanlardan çıkar (*)' : 'Sık kullanılanlara ekle (*)', 'aria-label': 'Sık kullanılan', onclick: e => { e.stopPropagation(); toggleFav(c); }}, isFav(c) ? '★' : '☆'),
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
  { // Telemetri: çerçeve tipli binary, çerçeve çözücü ayar JSON'u, kamera videosu
    const mp4 = files.filter(f => /\.mp4$/i.test(f.name)); if (mp4.length) { mp4.forEach(camAddFile); files = files.filter(f => !mp4.includes(f)); }
    const vids = files.filter(f => /\.(h264|264)$/i.test(f.name)); if (vids.length && typeof tlmPlayVideo === 'function') { tlmPlayVideo(vids[0]); files = files.filter(f => !vids.includes(f)); }
    const js = files.filter(f => /\.json$/i.test(f.name)); for (const j of js) { files = files.filter(f => f !== j); if (tlmIsSettingsJson(await j.text())) await tlmImportSettings(j); else toast(j.name + ': tanınmayan JSON (telemetri ayar dosyası değil)', 6000); }
    // Çerçeve çözücü biçimli template: Telemetri'de çerçeve tipi tanımlıysa ya da görünüm açıksa oraya, değilse (geriye uyum) Excel çerçeve akışına
    const tpl = [], toTlm = typeof tlmPrefers === 'function' && tlmPrefers();
    if (toTlm) for (const f of files.filter(f => /\.xlsx$/i.test(f.name))) { try { const sh = await XLSX.read(f); if (FRM.isFrameBook(sh) && !sh.some(x => /cerceve_?ayar/.test(FRM.fold(x.name)) || /^(cerceve|çerçeve|frame)/i.test(x.name))) tpl.push(f); } catch (_) {} }
    if (tpl.length && typeof tlmAddTemplates === 'function') { await tlmAddTemplates(tpl); files = files.filter(f => !tpl.includes(f)); }
    const KNOWN = /\.(mat|unv|uff|tdms|tdms_index|mf4|mdf|csv|tsv|txt|wav|xlsx|xls|m|fig|json|h264|264|mp4|png|jpg|jpeg|pdf|docx|zip)$/i;   // telemetri şablonu varken bunların dışındaki her uzantı (.bin, .cnv, .dat …) kayıt dosyasıdır
    const bins = files.filter(f => /\.(bin|binary)$/i.test(f.name) || (toTlm && !KNOWN.test(f.name))), oldFrm = files.some(f => /\.xlsx$/i.test(f.name)) && bins.length;
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
  renderChips(); renderTree(); const fresh = S.files.filter(f => !_seenFiles.has(f)); if (typeof qualAuto === 'function') qualAuto(fresh);
  // dosyada zamanı bulunamayan kanallar: varsayılan hızla açıldı (kalite bildiriminden sonra da görünsün)
  const nt = fresh.filter(f => f.noTime); if (nt.length) { const msg = nt.map(f => `${f.name}: ${f.noTime} kanalda dosyada eşleşen zaman vektörü yok, ${fmtNum(f.baseFs, 4)} Hz varsayıldı`).join(' · ') + ' (Zaman ayarlarından değiştirilebilir)';
    S.timeWarn = msg; toast(msg, 9000); setTimeout(() => { if (S.timeWarn === msg) toast(msg, 9000); }, 3800); }
  S.files.forEach(f => _seenFiles.add(f));
}
const _seenFiles = new Set();
function closeFile(f) {
  if (f && f.videos && typeof CAMV !== 'undefined') CAMV.release(f);
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
function makeTrace(ch, color) { return {kind: 'ts', ch, label: ch.name, color: color || nextColor(), autoColor: !color, width: 1, visible: true}; }
function unitOf(ch) { return ch ? (ch.unit || (KIND[ch.kind] && KIND[ch.kind].ylabel) || '') : ''; }
function axisLabelFor(ax) {
  const lbl = trs => { const t2 = trs.filter(t => t.ch), ks = new Set(t2.map(t => t.ch.kind)), us = new Set(t2.map(t => t.ch.unit || '')); return us.size === 1 && [...us][0] ? [...us][0] : ks.size === 1 ? KIND[[...ks][0]].ylabel : ''; };
  ax.ylabel = lbl(ax.traces.filter(t => !t.yr)); ax.ylabel2 = lbl(ax.traces.filter(t => t.yr));
}
// çift Y: alt grafikte iki farklı birim varsa ikinci birimin izleri sağ eksene alınır (üçüncü birim solda kalır)
function assignYAxes(ax, added) {
  if (S.pref && S.pref.dualY === false) return;
  const left = ax.traces.filter(t => !added.includes(t) && !t.yr), lu = left.length ? unitOf(left[0].ch) : unitOf(added[0] && added[0].ch);
  let ru = (ax.traces.find(t => t.yr && !added.includes(t)) || {}).ch; ru = ru ? unitOf(ru) : null;
  for (const t of added) { const u = unitOf(t.ch); if (!u || u === lu) continue; if (ru == null) ru = u; if (u === ru) t.yr = true; }
  if (!ax.traces.some(t => !t.yr)) ax.traces.forEach(t => { t.yr = false; });
}
async function addToNewAxes(chs, one) {
  if (chs.length && chs.every(c => c.file && c.file.feature)) return featAdd(chs);
  { const sp = chs.filter(c => c.spec); if (sp.length) { await addSpec(sp); chs = chs.filter(c => !c.spec); if (!chs.length) return; } }
  const first = !S.plot.axes.length;
  if (one) { const ax = S.plot.addAxes(), nt = chs.map(c => makeTrace(c)); ax.traces.push(...nt); tagDupLabels(ax); assignYAxes(ax, nt); axisLabelFor(ax); S.plot.active = ax; }
  else for (const c of chs) { const ax = S.plot.addAxes(); ax.traces.push(makeTrace(c)); axisLabelFor(ax); S.plot.active = ax; }
  switchView('time'); refreshAll();
  await loadForPlot(chs, first);
}
async function addToAxes(ax, chs) {
  if (chs.length && chs.every(c => c.file && c.file.feature)) return featAdd(chs);
  { const sp = chs.filter(c => c.spec); if (sp.length) { await addSpec(sp); chs = chs.filter(c => !c.spec); if (!chs.length) return; } }
  if (!ax) return addToNewAxes(chs, true);
  const first = !S.plot.axes.length, nt = chs.map(c => makeTrace(c)); ax.traces.push(...nt); tagDupLabels(ax); assignYAxes(ax, nt); axisLabelFor(ax);
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
// Geri getirme: maskelenen noktaların maskesi kaldırılır; her işlem tek adımda Ctrl+Z ile yeniden silinir (inverse kayıt)
function restoreGroup(parts, what) {
  if (S.rawOn) { toast('Ham veri görünümünde düzenleme kapalı — önce “İşlenmiş görünüme dön”'); return 0; }
  const group = [];
  for (const {ch, idx} of parts) { const done = ch.restore(idx); if (done.length) { group.push({ch, idx: done, inverse: true}); logOp('restore', {ch: ch.name, n: done.length, what}); } }
  const n = group.reduce((a, g) => a + g.idx.length, 0);
  if (group.length) { S.undo.push(group); S.redo = []; }
  toast(n ? fmtCnt(n) + ' silinmiş nokta geri getirildi (Ctrl+Z ile yeniden silinir)' : 'Geri getirilecek silinmiş nokta yok'); afterEdit(); return n;
}
function restoreSelection() {
  const hits = S.plot.sel && S.plot.sel.delHits || []; if (!hits.length) return toast('Seçimde silinmiş nokta yok — “Silinenleri göster”i açıp silinen noktaları kutu / kement ile seçin');
  S.plot.clearSelection(); restoreGroup(hits.map(h => ({ch: h.tr.ch, idx: h.idx})), 'seçim');
}
// görünen aralıktaki silmeler: aktif iz ya da ("tüm izlere uygula" açıksa) grafikteki tüm zaman izleri
function restoreVisible() {
  const all = $('#applyAll') && $('#applyAll').checked, parts = [];
  const trs = all ? S.plot.axes.flatMap(ax => ax.traces.filter(t => t.visible && t.kind === 'ts').map(t => [t, ax])) : (activeTrace() ? [[activeTrace(), activeAxes()]] : []);
  if (!trs.length) return toast('Önce bir iz seçin');
  for (const [tr, ax] of trs) { const ch = tr.ch; if (!ch.del || !ch.delCount) continue; const [a, b] = visRange(tr, ax), [x0, x1] = ax.xlim, idx = []; for (let i = a; i < b; i++) if (ch.del[i]) { const t = ch.t(i); if (t >= x0 && t <= x1) idx.push(i); } if (idx.length) parts.push({ch, idx}); }
  restoreGroup(parts, 'görünen aralık');
}
function toggleShowDel(on) {
  S.plot.showDel = on == null ? !S.plot.showDel : !!on; S.plot.invalidate();
  const c = $('#showDel'); if (c) c.checked = S.plot.showDel;
  if (S.plot.showDel && !allFiles().some(f => f.channels.some(c => c.delCount))) toast('Silinmiş nokta yok');
}
function restoreChannel(ch) {
  if (!ch.delCount) return; const idx = []; for (let i = 0; i < ch.n; i++) if (ch.del[i]) idx.push(i);
  restoreGroup([{ch, idx: Uint32Array.from(idx)}], 'tüm kanal');
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
  back: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  fwd: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  xhair: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 1v14" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.5"/><rect x="9.5" y="3" width="5" height="4" rx="1" fill="none" stroke="currentColor"/><circle cx="8" cy="10" r="1.6" fill="currentColor"/></svg>',
  legend: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4 6h3M4 9h3M9 6h3M9 9h3" stroke="currentColor" stroke-width="1.2"/></svg>',
  gridl: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="2" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="9" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="9" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  del: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 4h10M6 4V2h4v2M5 4l.5 10h5L11 4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'
};
const TOOLS = [['pan', 'Gez', 'Sürükleyerek kaydır. Tekerlek: X yakınlaştır, Shift+tekerlek: Y, Ctrl+tekerlek: ikisi (P)'], ['zoom', 'Yakınlaştır', 'Kutu çiz = yakınlaştır, tıkla = 2×, Shift+tıkla = uzaklaştır (Z)'], ['cursor', 'İmleç', 'Tıkla: en yakın örnek. Shift+tıkla: yeni imleç ekle (çoklu); imlece yakın tık: taşı. Ölçüm paneli ΔX/ΔY, eğim, alan, RMS (C) · Esc: temizle'], ['box', 'Kutu seç', 'Silinecek noktaları kutuyla seç (B)'], ['lasso', 'Kement', 'Silinecek noktaları serbest çizimle seç (L)']];
function buildToolbar() {
  const tb = $('#toolbar'); tb.replaceChildren();
  for (const [m, name, tip] of TOOLS) tb.append(h('button', {id: 'tool-' + m, title: tip, class: S.plot.mode === m ? 'on' : '', onclick: () => setMode(m), html: 0}, ...[(() => { const s = document.createElement('span'); s.innerHTML = ICON[m]; s.style.display = 'flex'; return s; })(), h('span', {class: 'lbl'}, name)]));
  const ib = (id, ico, name, tip, fn) => { const b = h('button', {id, title: tip, onclick: fn}); const s = document.createElement('span'); s.innerHTML = ICON[ico]; s.style.display = 'flex'; b.append(s, h('span', {class: 'lbl'}, name)); return b; };
  tb.append(h('span', {class: 'sep'}), ib('tb-zin', 'zin', 'Yaklaş', 'Görünümü 2× yakınlaştır (+)', () => curPlot().zoomIn()), ib('tb-zout', 'zout', 'Uzaklaş', 'Görünümü 2× uzaklaştır (−)', () => curPlot().zoomOut()),
    ib('tb-fit', 'fit', 'Sığdır', 'Tümünü sığdır: tüm veriyi göster (Home / çift tık)', () => curPlot().fitAll()),
    ib('tb-back', 'back', 'Geri', 'Önceki görünüm (Alt+←)', () => viewHist(-1)), ib('tb-fwd', 'fwd', 'İleri', 'Sonraki görünüm (Alt+→)', () => viewHist(1)),
    ib('tb-legend', 'legend', 'Lejant ▾', 'Lejant seçenekleri: göster / katla, boyut, konum', e => legendMenu(e.currentTarget)),
    ib('tb-size', 'gridl', 'Düzen ▾', 'Alt grafik düzeni: sütun sayısı (ızgara), tüm alt grafiklerin genişlik / yüksekliği, eşzamanlı boyutlandırma', e => sizeMenu(e.currentTarget)),
    ib('tb-xhair', 'xhair', 'İzleme', 'Senkron dikey izleme: tüm alt grafiklerde imleç altındaki değerler (X). Açıkken grafiğe tık: o konuma çizgi sabitlenir, dışa aktarmada görünür (çizgiye yeniden tık: kalkar)', () => toggleCrosshair()),
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
