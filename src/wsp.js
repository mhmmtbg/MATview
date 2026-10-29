/* ===== Çalışma klasörü (MATLAB “Current Folder” benzeri) =====
   İki erişim yolu:
   - handle: Chrome/Edge klasör izni (showDirectoryPicker ya da sürükle-bırak). Okuma + yazma; .m kaydı klasöre yazılır.
   - path:   MATView.exe ile açıldığında yazılan yoldan (C:\Veri, \\sunucu\paylaşım) okuma. Tarayıcı yerel dosya yazamadığı için salt okunur. */
const WSP = {mode: null, stack: [], path: '', items: [], sel: -1, filter: 'all', q: '', pane: 'data', canPath: null, writeOk: false, needPerm: null, loading: false, textCache: new Map(), matCache: new Map(), pushed: new Map(), pushedW: null, recent: []};
const WSP_TYPES = [
  [/\.m$/i, 'm', 'M', 'code'], [/\.mat$/i, 'mat', 'MAT', 'data'], [/\.fig$/i, 'fig', 'FIG', 'code'], [/\.(bin|dat|raw|tlm)$/i, 'bin', 'BIN', 'data'],
  [/\.xlsx$/i, 'xls', 'XLS', 'data'], [/\.(csv|tsv|txt)$/i, 'tab', 'TXT', 'data'], [/\.(unv|uff)$/i, 'unv', 'UNV', 'data'], [/\.tdms$/i, 'tdms', 'TDMS', 'data'],
  [/\.(mf4|mdf)$/i, 'mdf', 'MDF', 'data'], [/\.wav$/i, 'wav', 'WAV', 'data']];
const wspType = name => { for (const t of WSP_TYPES) if (t[0].test(name)) return {k: t[1], lb: t[2], grp: t[3]}; return {k: 'other', lb: '', grp: 'other'}; };
const wspFmtSize = n => n == null ? '' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';

/* ---------- küçük IndexedDB deposu (klasör izinleri kalıcı olsun diye) ---------- */
function wspDb() {
  if (wspDb.p) return wspDb.p;
  wspDb.p = new Promise((res, rej) => { try { const r = indexedDB.open('matview-ws', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
  return wspDb.p;
}
async function wspKv(key, val) {
  try {
    const db = await wspDb();
    return await new Promise((res, rej) => { const tx = db.transaction('kv', val === undefined ? 'readonly' : 'readwrite'), st = tx.objectStore('kv'); const r = val === undefined ? st.get(key) : st.put(val, key); r.onsuccess = () => res(val === undefined ? r.result : true); r.onerror = () => rej(r.error); });
  } catch (_) { return undefined; }
}
async function wspRemember() {
  const e = WSP.mode === 'path' ? {kind: 'path', name: WSP.path, path: WSP.path} : WSP.mode === 'handle' ? {kind: 'handle', name: WSP.stack[0].name, h: WSP.stack[0].h, sub: WSP.stack.slice(1).map(s => s.name)} : null;
  if (!e) return;
  const same = r => r.kind === e.kind && (e.kind === 'path' ? r.path.toLowerCase() === e.path.toLowerCase() : r.name === e.name);
  const list = [e, ...WSP.recent.filter(r => !same(r))].slice(0, 10);
  // aynı ada sahip farklı klasör tutamaçlarını ayırt et
  if (e.kind === 'handle') for (const r of WSP.recent) if (r.kind === 'handle' && r.name === e.name && r.h && e.h && !(await e.h.isSameEntry(r.h).catch(() => false))) list.push(r);
  WSP.recent = list.slice(0, 10); await wspKv('recent', WSP.recent);
}

/* ---------- yol kipi (MATView.exe: --allow-file-access-from-files) ---------- */
function wspXhr(url, type) {
  return new Promise(res => { try { const q = new XMLHttpRequest(); q.open('GET', url); if (type) q.responseType = type; q.onload = () => res({ok: true, status: q.status, r: q.response}); q.onerror = () => res({ok: false}); q.send(); } catch (e) { res({ok: false}); } });
}
async function wspPathAvail() {
  if (WSP.canPath != null) return WSP.canPath;
  WSP.canPath = location.protocol === 'file:' ? !!(await wspXhr(location.href.split('#')[0])).ok : false;
  return WSP.canPath;
}
const wspIsWin = p => /^[A-Za-z]:/.test(p) || p.startsWith('\\\\') || (p.includes('\\') && !p.includes('/'));
function wspNormPath(p) {
  p = String(p || '').trim().replace(/^["']|["']$/g, ''); if (!p) return '';
  if (/^file:\/\//i.test(p)) { try { p = decodeURIComponent(p.replace(/^file:\/\/\/?/i, '')); if (/^[A-Za-z]:/.test(p)) p = p.replace(/\//g, '\\'); else if (!p.startsWith('/')) p = '\\\\' + p.replace(/\//g, '\\'); } catch (_) {} }
  if (wspIsWin(p)) { p = p.replace(/\//g, '\\'); const unc = p.startsWith('\\\\'); p = (unc ? '\\\\' : '') + p.replace(/^\\+/, '').replace(/\\{2,}/g, '\\'); if (/^[A-Za-z]:$/.test(p)) p += '\\'; if (p.length > 3 && p.endsWith('\\')) p = p.slice(0, -1); return p; }
  p = p.replace(/\/{2,}/g, '/'); if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1); return p;
}
const wspSep = p => wspIsWin(p) ? '\\' : '/';
const wspJoin = (dir, name) => dir.endsWith('\\') || dir.endsWith('/') ? dir + name : dir + wspSep(dir) + name;
function wspParent(p) {
  const s = wspSep(p), i = p.lastIndexOf(s);
  if (p.startsWith('\\\\') && p.split('\\').filter(Boolean).length <= 2) return null;   // \\sunucu\paylaşım kökü
  if (/^[A-Za-z]:\\?$/.test(p) || p === '/') return null;
  if (i < 0) return null; const r = p.slice(0, i); return /^[A-Za-z]:$/.test(r) ? r + '\\' : r || '/';
}
function wspPathUrl(p, isDir) {
  let s = p.replace(/\\/g, '/'), u;
  if (s.startsWith('//')) u = 'file://' + s.slice(2).split('/').map(encodeURIComponent).join('/');
  else if (/^[A-Za-z]:/.test(s)) u = 'file:///' + s.split('/').map((x, i) => i ? encodeURIComponent(x) : x).join('/');
  else u = 'file://' + s.split('/').map(encodeURIComponent).join('/');
  return isDir && !u.endsWith('/') ? u + '/' : u;
}
async function wspListPath(p) {
  const r = await wspXhr(wspPathUrl(p, true));
  if (!r.ok || typeof r.r !== 'string' || !/start\(/.test(r.r)) throw new Error('Klasör açılamadı: ' + p);
  const items = [];
  for (const m of r.r.matchAll(/addRow\((.*)\);<\/script>/g)) {
    let a; try { a = JSON.parse('[' + m[1] + ']'); } catch (_) { continue; }
    const [name, , isdir, size, , mt] = a; if (name === '..' || name === '.') continue;
    items.push({name, dir: !!isdir, size: isdir ? null : +size, mtime: mt ? mt * 1000 : 0});
  }
  return items;
}
async function wspReadPath(p, name) {
  const r = await wspXhr(wspPathUrl(p), 'arraybuffer');
  if (!r.ok || !r.r) throw new Error('Dosya okunamadı: ' + p);
  return new File([r.r], name || p.split(/[\\/]/).pop());
}

/* ---------- klasör açma / gezinme ---------- */
const wspDir = () => WSP.mode === 'path' ? WSP.path : WSP.mode === 'handle' ? WSP.stack.map(s => s.name).join('\\') : '';
const wspCur = () => WSP.stack[WSP.stack.length - 1];
async function wspLoad() {
  WSP.loading = true; wspRender(); let items = [];
  try {
    if (WSP.mode === 'path') items = await wspListPath(WSP.path);
    else if (WSP.mode === 'handle') {
      const d = wspCur().h, ps = [];
      for await (const [name, hh] of d.entries()) {
        if (hh.kind === 'directory') items.push({name, dir: true, h: hh, size: null, mtime: 0});
        else { const it = {name, dir: false, h: hh, size: null, mtime: 0}; items.push(it); ps.push(hh.getFile().then(f => { it.size = f.size; it.mtime = f.lastModified; }, () => {})); }
        if (ps.length >= 64) { await Promise.all(ps); ps.length = 0; }
      }
      await Promise.all(ps);
    }
  } catch (e) { WSP.loading = false; WSP.items = []; wspRender(); toast(e.message || String(e), 6000); return false; }
  const coll = new Intl.Collator('tr', {numeric: true, sensitivity: 'base'});
  items.sort((a, b) => a.dir !== b.dir ? (a.dir ? -1 : 1) : coll.compare(a.name, b.name));
  const prev = WSP.items[WSP.sel] && WSP.items[WSP.sel].name;
  WSP.items = items; WSP.loading = false; WSP.sel = prev ? items.findIndex(x => x.name === prev) : -1;
  wspRender(); return true;
}
async function wspCheckWrite(ask) {
  WSP.writeOk = false; if (WSP.mode !== 'handle') return false;
  const h = WSP.stack[0].h; try { let st = await h.queryPermission({mode: 'readwrite'}); if (st !== 'granted' && ask) st = await h.requestPermission({mode: 'readwrite'}); WSP.writeOk = st === 'granted'; } catch (_) {}
  return WSP.writeOk;
}
async function wspOpenHandle(h, sub) {
  let st = 'granted'; try { st = await h.queryPermission({mode: 'read'}); if (st !== 'granted') st = await h.requestPermission({mode: 'readwrite'}); } catch (_) {}
  if (st !== 'granted') { WSP.needPerm = h; wspShowPane('folder'); wspRender(); return false; }
  WSP.needPerm = null; WSP.mode = 'handle'; WSP.stack = [{name: h.name, h}]; WSP.path = ''; WSP.sel = -1;
  for (const n of sub || []) { try { const c = await wspCur().h.getDirectoryHandle(n); WSP.stack.push({name: n, h: c}); } catch (_) { break; } }
  await wspCheckWrite(false); const ok = await wspLoad(); if (ok) wspRemember(); wspAfterNav(); return ok;
}
async function wspOpenPath(p) {
  p = wspNormPath(p); if (!p) return false;
  if (!(await wspPathAvail())) { toast('Yazılan yolu açmak yalnızca MATView.exe ile mümkün. Tarayıcıda “Klasör seç…” düğmesini kullanın ya da klasörü pencereye sürükleyin.', 8000); wspRender(); return false; }
  const old = {mode: WSP.mode, path: WSP.path, stack: WSP.stack, items: WSP.items};
  WSP.mode = 'path'; WSP.path = p; WSP.stack = []; WSP.sel = -1; WSP.writeOk = false; WSP.needPerm = null;
  const ok = await wspLoad();
  if (!ok) { Object.assign(WSP, old); wspRender(); return false; }
  wspRemember(); wspAfterNav(); return true;
}
function wspAfterNav() { WSP.pushed.clear(); const inp = $('#wsPath'); if (inp && document.activeElement !== inp) inp.value = wspDir(); }
async function wspPick() {
  if (!window.showDirectoryPicker) { toast('Bu tarayıcı klasör seçmeyi desteklemiyor (Chrome ya da Edge gerekir).', 6000); return; }
  try { const h = await showDirectoryPicker({id: 'matview-ws', mode: 'readwrite'}); wspShowPane('folder'); await wspOpenHandle(h); }
  catch (e) { if (e && e.name !== 'AbortError') toast('Klasör açılamadı: ' + (e.message || e), 6000); }
}
async function wspUp() {
  if (WSP.mode === 'handle') { if (WSP.stack.length > 1) { const from = WSP.stack.pop().name; await wspLoad(); WSP.sel = WSP.items.findIndex(x => x.name === from); wspRender(); wspAfterNav(); wspRemember(); } else toast('Bu, izin verilen en üst klasör. Daha yukarı çıkmak için “Klasör seç…” ile üst klasörü seçin.', 5000); }
  else if (WSP.mode === 'path') { const p = wspParent(WSP.path); if (p) { const from = WSP.path.split(/[\\/]/).pop(); if (await wspOpenPath(p)) { WSP.sel = WSP.items.findIndex(x => x.name === from); wspRender(); } } }
}
async function wspInto(item) {
  if (WSP.mode === 'handle') { WSP.stack.push({name: item.name, h: item.h}); WSP.sel = -1; if (!(await wspLoad())) WSP.stack.pop(); wspAfterNav(); wspRemember(); }
  else if (WSP.mode === 'path') await wspOpenPath(wspJoin(WSP.path, item.name));
}
async function wspGoto(text) {
  text = String(text || '').trim(); if (!text) return;
  if (WSP.mode === 'handle' && !/^([A-Za-z]:|\\\\|\/)/.test(text)) {   // tutamaç kipinde göreli gezinme: alt\klasör ya da ..
    return wspCd(text);
  }
  if (/^\.\.?([\\/]|$)/.test(text) && WSP.mode === 'path') return wspCd(text);
  await wspOpenPath(text);
}
async function wspCd(t) {
  t = String(t || '').trim(); if (!t || t === '.') return;
  if (/^([A-Za-z]:|\\\\|\/)/.test(t)) { if (await wspOpenPath(t) && S.view === 'code') codeOut(wspDir() + '\n', 'warn'); return; }
  if (!WSP.mode) { toast('Önce bir çalışma klasörü açın'); return; }
  const parts = t.split(/[\\/]+/).filter(Boolean);
  if (WSP.mode === 'path') { let p = WSP.path; for (const s of parts) { if (s === '..') { p = wspParent(p) || p; } else if (s !== '.') p = wspJoin(p, s); } if (!(await wspOpenPath(p))) return; }
  else {
    const st = WSP.stack.slice();
    for (const s of parts) {
      if (s === '.') continue;
      if (s === '..') { if (st.length > 1) st.pop(); else { toast('İzin verilen en üst klasörün dışına çıkılamaz'); break; } continue; }
      try { st.push({name: s, h: await st[st.length - 1].h.getDirectoryHandle(s)}); } catch (_) { toast(`'${s}' klasörü bulunamadı`); return; }
    }
    WSP.stack = st; WSP.sel = -1; await wspLoad(); wspAfterNav(); wspRemember();
  }
  if (typeof codeOut === 'function' && S.view === 'code') codeOut(wspDir() + '\n', 'warn');
}

/* ---------- dosya erişimi ---------- */
function wspItem(name) {
  const b = String(name).replace(/^.*[\\/]/, '').toLowerCase(); if (!b) return null;
  return WSP.items.find(x => x.name.toLowerCase() === b) || null;
}
async function wspFileOf(item) {
  if (item.dir) throw new Error(item.name + ' bir klasör');
  if (item.file) return item.file;
  const f = WSP.mode === 'handle' ? await item.h.getFile() : await wspReadPath(wspJoin(WSP.path, item.name), item.name);
  if (WSP.mode === 'handle') item.file = f;   // disk üzerindeki File: önbellek ucuz
  return f;
}
function wspStatFile(name) { const it = wspItem(name); return it && !it.dir ? {name: it.name, size: it.size || 0} : null; }
async function wspGetFile(name) { const it = wspItem(name); if (!it || it.dir) return null; try { return await wspFileOf(it); } catch (_) { return null; } }
const wspCanWrite = () => WSP.mode === 'handle' && WSP.writeOk;
async function wspWriteIn(dirH, name, blob) {
  const fh = await dirH.getFileHandle(name, {create: true}), w = await fh.createWritable(); await w.write(blob); await w.close();
}
async function wspWriteOut(name, blob) {   // kodun ürettiği dosyalar (save, fwrite…) geçerli klasöre
  name = String(name).replace(/^.*[\\/]/, '');
  try { await wspWriteIn(wspCur().h, name, blob); if (typeof codeOut === 'function') codeOut(`${name} klasöre yazıldı (${wspDir()}).\n`, 'warn'); wspLoad(); return true; }
  catch (e) { if (typeof codeOut === 'function') codeOut(`${name} klasöre yazılamadı (${e.message || e}); indiriliyor.\n`, 'warn'); return false; }
}
function wspSrcFor(name) {
  return WSP.mode === 'path' ? {mode: 'path', dir: WSP.path, name, where: wspJoin(WSP.path, name), key: ('p:' + wspJoin(WSP.path, name)).toLowerCase()}
    : {mode: 'handle', dir: wspCur().h, stack: WSP.stack.slice(), name, where: wspDir() + '\\' + name, key: ('h:' + wspDir() + '\\' + name).toLowerCase()};
}
const wspSrcKey = s => s ? s.key || ((s.mode === 'path' ? 'p:' : 'h:') + s.where).toLowerCase() : '';
async function wspSaveDoc(d, text) {
  const blob = new Blob([text], {type: 'text/plain'});
  if (d.src && d.src.mode === 'handle') {
    try {
      const root = d.src.stack && d.src.stack[0] ? d.src.stack[0].h : d.src.dir;
      let st = await root.queryPermission({mode: 'readwrite'}); if (st !== 'granted') st = await root.requestPermission({mode: 'readwrite'});
      if (st !== 'granted') throw new Error('yazma izni verilmedi');
      await wspWriteIn(d.src.dir, d.src.name, blob); toast(d.src.name + ' kaydedildi'); if (WSP.mode === 'handle' && wspCur().h === d.src.dir) { WSP.writeOk = true; wspLoad(); } return 'saved';
    } catch (e) { toast(`${d.src.name} klasöre yazılamadı (${e.message || e}); başka yere kaydedin.`, 6000); return null; }
  }
  if (d.src && d.src.mode === 'path') { toast('Bu dosya yol ile (salt okunur) açıldı; kaydetme penceresinde aynı dosyayı seçerek üzerine yazabilirsiniz.', 7000); return null; }
  if (!WSP.mode) return null;
  if (WSP.mode === 'handle' && !WSP.writeOk) await wspCheckWrite(false);
  if (!wspCanWrite()) return null;
  const exists = !!wspItem(d.name);
  return new Promise(res => {
    modal('Betiği kaydet', h('div', {style: 'min-width:320px'}, `“${d.name}” geçerli klasöre (${wspDir()}) kaydedilsin mi?`, exists ? h('div', {class: 'note', style: 'color:var(--danger);margin-top:6px'}, 'Klasörde aynı adlı dosya var; üzerine yazılacak.') : null),
      [{t: 'Klasöre kaydet', primary: true, fn: () => { (async () => { try { await wspWriteIn(wspCur().h, d.name, blob); d.src = wspSrcFor(d.name); toast(d.name + ' kaydedildi'); wspLoad(); res('saved'); } catch (e) { toast('Yazılamadı: ' + (e.message || e), 6000); res(null); } })(); }},
        {t: 'Başka yere…', fn: () => res(null)}, {t: 'Vazgeç', fn: () => res('cancel')}]);
    $('#mclose').onclick = () => { $('#modal').classList.add('hidden'); res('cancel'); };
  });
}

/* ---------- dosya açma ---------- */
async function wspOpenM(item, run) {
  let f, txt; try { f = await wspFileOf(item); txt = (await codeReadM(f)).replace(/\r\n?/g, '\n'); } catch (e) { toast('Okunamadı: ' + item.name + ' — ' + (e.message || e)); return; }
  codeBuildView(); switchView('code'); codeStoreCur();
  const src = wspSrcFor(item.name), key = wspSrcKey(src);
  let i = CODE.docs.findIndex(d => d.src && wspSrcKey(d.src) === key);
  if (i < 0) { i = CODE.docs.findIndex(d => !d.src && !d.dirty && d.name.toLowerCase() === item.name.toLowerCase()); if (i >= 0) CODE.docs[i].src = src; }
  if (i >= 0) { const d = CODE.docs[i]; if (!d.dirty) d.text = txt; d.src = src; CODE.cur = i; codeShowDoc(); codeDocsSave(); }
  else { codeNewDoc(item.name, txt); codeDoc().src = src; codeRenderTabs(); codeDocsSave(); }
  await wspFigFor(item.name);
  wspRender();
  if (run) codeRun('all');
}
async function wspFigFor(mName) {   // GUIDE: aynı klasördeki .fig düzenini yükle
  const fi = wspItem(mName.replace(/\.m$/i, '.fig')); if (!fi || CODE.figFiles.has(fi.name)) return;
  try { const m = await MAT.open(await wspFileOf(fi)); const trees = await MAT.readAll(m); const root = trees.find(t => /^hgS_/.test(t.name)); if (root) CODE.figFiles.set(fi.name, root); } catch (_) {}
}
async function wspOpenItem(item, how) {
  if (!item) return;
  if (item.dir) return wspInto(item);
  const t = wspType(item.name);
  if (t.k === 'm') return wspOpenM(item, how === 'run');
  let f; try { f = await busy('Okunuyor: ' + item.name, () => wspFileOf(item)); } catch (e) { toast('Okunamadı: ' + item.name); return; }
  if (!f) return;
  if (t.k === 'fig') { codeBuildView(); switchView('code'); return figFileOpen(f); }
  if (t.k === 'mat' && (how === 'ws' || (!how && S.view === 'code'))) return codeLoadMatFiles([f]);
  if (how === 'tlm' || how === 'play') return tlmOpenBins([f], how === 'play' ? 'play' : 'decode');
  if (/\.(h264|264|mp4)$/i.test(item.name)) return tlmPlayVideo(f);
  if (t.k === 'bin' && how !== 'bin' && tlmPrefers()) return tlmOpenBins([f], 'decode');
  if (t.k === 'other' && /\.json$/i.test(item.name) && tlmIsSettingsJson(await f.text())) return tlmImportSettings(f);
  if (t.k === 'bin' || how === 'bin' || t.k === 'other') { if (FS.def) frmDropBin([f]); else { FS.bin = f; frmDialog(); } return; }
  const before = S.files.length;
  await openFiles([f]);
  if (S.files.length > before && WSP.pane === 'folder') toast(item.name + ' açıldı', 4000, {t: 'Kanalları göster', fn: () => wspShowPane('data')});
}
async function wspNewScript() {
  const inp = h('input', {type: 'text', value: 'betik.m', style: 'width:100%'});
  modal('Yeni betik', h('div', {style: 'min-width:300px'}, inp, h('div', {class: 'note'}, wspCanWrite() ? 'Dosya geçerli klasörde oluşturulur.' : 'Klasör salt okunur açık; betik düzenleyicide açılır, kaydederken yer seçersiniz.')),
    [{t: 'Oluştur', primary: true, fn: () => { let n = inp.value.trim(); if (!n) return false; if (!/\.m$/i.test(n)) n += '.m'; if (!/^[A-Za-z]\w*\.m$/i.test(n)) { toast('Ad harfle başlamalı; yalnızca harf, rakam ve _ (MATLAB kuralı)'); return false; } if (wspItem(n)) { toast('Bu adla dosya zaten var'); return false; }
      (async () => { codeBuildView(); switchView('code'); codeStoreCur(); codeNewDoc(n, ''); if (wspCanWrite()) { try { await wspWriteIn(wspCur().h, n, new Blob([''])); codeDoc().src = wspSrcFor(n); codeRenderTabs(); await wspLoad(); } catch (e) { toast('Oluşturulamadı: ' + e.message); } } $('#codeEd') && $('#codeEd').focus(); })(); }}, {t: 'Vazgeç'}]);
  setTimeout(() => { inp.focus(); inp.setSelectionRange(0, inp.value.length - 2); }, 50);
}
function wspReveal(d) {
  if (!d || !d.src) return; wspShowPane('folder');
  const pick = () => { WSP.sel = WSP.items.findIndex(x => x.name.toLowerCase() === d.src.name.toLowerCase()); wspRender(true); };
  if (wspSrcKey(wspSrcFor(d.src.name)) === wspSrcKey(d.src)) return pick();
  if (d.src.mode === 'path') wspOpenPath(d.src.dir).then(ok => ok && pick());
  else if (d.src.stack) { WSP.mode = 'handle'; WSP.stack = d.src.stack.slice(); WSP.path = ''; wspCheckWrite(false); wspLoad().then(ok => { wspAfterNav(); ok && pick(); }); }
}

/* ---------- kod çalıştırma ile bütünleşme ---------- */
function wspFolderInfo() {
  if (!WSP.mode) return null;
  return {dir: wspDir(), items: WSP.items.map(x => ({name: x.name, dir: !!x.dir, size: x.size || 0, mtime: x.mtime || 0, date: x.mtime ? new Date(x.mtime).toLocaleString('tr-TR') : ''}))};
}
async function wspText(item) {
  const k = wspSrcKey(wspSrcFor(item.name)) + '|' + item.size + '|' + item.mtime;
  if (WSP.textCache.has(k)) return WSP.textCache.get(k);
  const t = (await codeReadM(await wspFileOf(item))).replace(/\r\n?/g, '\n');
  if (WSP.textCache.size > 400) WSP.textCache.clear(); WSP.textCache.set(k, t); return t;
}
// Klasördeki .m dosyalarını MATLAB yolu gibi kullan: koddan adıyla çağrılan işlev/betikleri ekle
async function wspCodeLibs(allSrc, libs, scripts, docIdx) {
  if (!WSP.mode || !WSP.items.length) return allSrc;
  const open = new Set(CODE.docs.map(d => d.name.replace(/\.m$/i, '')));
  const ms = new Map(); for (const it of WSP.items) if (!it.dir && /^[A-Za-z]\w*\.m$/.test(it.name)) { const b = it.name.slice(0, -2); if (!open.has(b)) ms.set(b, it); }
  const cur = CODE.docs[docIdx]; if (cur) await wspFigFor(cur.name);
  if (!ms.size) return allSrc;
  const done = new Set(); let queue = [allSrc], n = 0, bytes = 0;
  while (queue.length && n < 300 && bytes < 2e7) {
    const src = queue.shift(), words = new Set(src.match(/[A-Za-z]\w*/g) || []);
    for (const w of words) {
      const it = ms.get(w); if (!it || done.has(w)) continue; done.add(w);
      let t; try { t = await wspText(it); } catch (_) { continue; }
      n++; bytes += t.length; if (codeIsFuncFile(t)) libs.push({name: it.name, text: t}); else scripts[w] = t;
      allSrc += '\n' + t; queue.push(t); await wspFigFor(it.name);
    }
  }
  return allSrc;
}
async function wspMatTrees(lit) {
  if (!WSP.mode) return null;
  const b = String(lit).replace(/^.*[\\/]/, ''); const it = wspItem(/\.mat$/i.test(b) ? b : b + '.mat'); if (!it || it.dir) return null;
  const k = wspSrcKey(wspSrcFor(it.name)) + '|' + it.size + '|' + it.mtime;
  if (WSP.matCache.has(k)) return WSP.matCache.get(k);
  try { const f = await wspFileOf(it), m = await MAT.open(f), trees = await matTrees(m, f.name); if (WSP.matCache.size > 8) WSP.matCache.clear(); WSP.matCache.set(k, trees); return trees; } catch (_) { return null; }
}
// Paylaşımlı bellek yoksa (düz tarayıcı) kodun adını andığı klasör dosyalarını işçiye önceden gönder (fopen, fread…)
async function wspPushFiles(allSrc) {
  const w = CODE.worker; if (!w || CODE.sab || !WSP.mode) return;
  if (WSP.pushedW !== w) { WSP.pushed.clear(); WSP.pushedW = w; }
  const lits = new Set(codeStrings(allSrc).map(s => s.replace(/^.*[\\/]/, '').toLowerCase()));
  const all = /\b(dir|ls|uigetfile)\b/.test(allSrc);   // listeleyip döngüde açan kod: küçük dosyaların hepsi
  for (const it of WSP.items) {
    if (it.dir || /\.m$/i.test(it.name)) continue;
    if (!lits.has(it.name.toLowerCase()) && !(all && (it.size || 0) < 32e6)) continue;
    if ((it.size || 0) > 512e6) continue;
    const k = wspSrcKey(wspSrcFor(it.name)) + '|' + it.size + '|' + it.mtime; if (WSP.pushed.get(it.name) === k) continue;
    try { const buf = await (await wspFileOf(it)).arrayBuffer(); w.postMessage({t: 'vfs', name: it.name, buf}, [buf]); WSP.pushed.set(it.name, k); } catch (_) {}
  }
}

/* ---------- arayüz ---------- */
function wspShowPane(p) {
  WSP.pane = p; try { localStorage.setItem('mv.lp', p); } catch (_) {}
  for (const b of document.querySelectorAll('#lptabs button')) b.classList.toggle('on', b.dataset.lp === p);
  $('#lp-data').classList.toggle('hidden', p !== 'data'); $('#lp-folder').classList.toggle('hidden', p !== 'folder');
  if (p === 'folder') wspRender();
}
function wspBuild() {
  const root = $('#lp-folder'); if (!root || root.dataset.built) return; root.dataset.built = '1';
  const path = h('input', {type: 'text', id: 'wsPath', spellcheck: 'false', autocomplete: 'off', placeholder: 'Klasör yolu (ör. C:\\Veriler\\Test) — Enter', title: 'Klasör yolu yazıp Enter’a basın (MATView.exe ile). “..” üst klasör, “alt\\klasör” göreli gezinme.',
    onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); wspGoto(path.value); } else if (e.key === 'Escape') { path.value = wspDir(); path.blur(); } }});
  const bar = h('div', {class: 'wsbar'},
    h('button', {id: 'wsUp', class: 'noic', title: 'Üst klasör (Backspace)', onclick: wspUp, 'aria-label': 'Üst klasör'}), path,
    h('button', {id: 'wsRecent', class: 'noic', title: 'Son klasörler', 'aria-label': 'Son klasörler', onclick: e => wspRecentMenu(e.currentTarget)}, '▾'),
    h('button', {id: 'wsPick', class: 'noic', title: 'Klasör seç… (okuma ve yazma izniyle)', 'aria-label': 'Klasör seç', onclick: wspPick}));
  bar.querySelector('#wsUp').append(icEl('up', 14)); bar.querySelector('#wsPick').append(icEl('open', 14));
  const crumb = h('div', {class: 'wscrumb', id: 'wsCrumb'});
  const bar2 = h('div', {class: 'wsbar2'},
    h('input', {type: 'search', id: 'wsQ', placeholder: 'Süz (ad)…', oninput: e => { WSP.q = e.target.value.trim().toLowerCase(); wspRender(); }}),
    h('select', {id: 'wsFilter', title: 'Gösterilecek dosyalar', onchange: e => { WSP.filter = e.target.value; try { localStorage.setItem('mv.wsf', WSP.filter); } catch (_) {} wspRender(); }},
      h('option', {value: 'all'}, 'Tüm dosyalar'), h('option', {value: 'sup'}, 'Desteklenenler'), h('option', {value: 'data'}, 'Veri (.mat, .bin…)'), h('option', {value: 'code'}, 'Kod (.m, .fig)')),
    h('button', {id: 'wsRefresh', class: 'noic', title: 'Yenile', 'aria-label': 'Yenile', onclick: () => WSP.mode && wspLoad()}, '⟳'));
  const list = h('div', {class: 'wslist', id: 'wsList', tabindex: '0', role: 'listbox', 'aria-label': 'Klasör içeriği', onkeydown: wspKey,
    oncontextmenu: e => { if (e.target.closest('.wsrow')) return; e.preventDefault(); wspBgMenu(e.clientX, e.clientY); }});
  const foot = h('div', {class: 'wsfoot', id: 'wsFoot'});
  root.append(bar, crumb, bar2, list, foot);
  try { WSP.filter = localStorage.getItem('mv.wsf') || 'all'; } catch (_) {} $('#wsFilter').value = WSP.filter;
}
function wspVisible() {
  return WSP.items.map((it, i) => [it, i]).filter(([it]) => {
    if (WSP.q && !it.name.toLowerCase().includes(WSP.q)) return false;
    if (it.dir || WSP.filter === 'all') return true;
    const g = wspType(it.name).grp; return WSP.filter === 'sup' ? g !== 'other' : g === WSP.filter;
  });
}
function wspRender(scroll) {
  const root = $('#lp-folder'); if (!root) return; wspBuild();
  const list = $('#wsList'), foot = $('#wsFoot'), crumb = $('#wsCrumb'), inp = $('#wsPath');
  if (inp && document.activeElement !== inp) inp.value = wspDir();
  $('#wsUp').disabled = !WSP.mode || (WSP.mode === 'handle' ? WSP.stack.length < 2 : !wspParent(WSP.path));
  // kırıntı yolu
  const segs = WSP.mode === 'handle' ? WSP.stack.map((s, i) => [s.name, () => { WSP.stack = WSP.stack.slice(0, i + 1); WSP.sel = -1; wspLoad(); wspAfterNav(); wspRemember(); }])
    : WSP.mode === 'path' ? (() => { const out = [], p = WSP.path; let cur = p; const chain = []; while (cur) { chain.unshift(cur); cur = wspParent(cur); } for (const c of chain) out.push([c === chain[0] ? c : c.split(/[\\/]/).pop(), () => wspOpenPath(c)]); return out; })() : [];
  crumb.replaceChildren(...segs.flatMap(([n, fn], i) => [...(i ? [h('span', null, '›')] : []), h('a', {class: i === segs.length - 1 ? 'cur' : '', title: 'Bu klasöre git', onclick: fn}, n)]));
  crumb.classList.toggle('hidden', segs.length < 2);
  if (!WSP.mode) {
    const perm = WSP.needPerm;
    list.replaceChildren(h('div', {class: 'wsempty'},
      perm ? [h('div', null, `“${perm.name}” klasörüne erişim için yeniden izin gerekiyor.`), h('button', {class: 'primary', onclick: () => wspOpenHandle(perm, (WSP.recent.find(r => r.h === perm) || {}).sub)}, 'Erişime izin ver')]
        : [h('div', null, 'Çalışma klasörü açık değil. MATLAB’daki “Current Folder” gibi: içindeki .mat, binary ve .m dosyalarını buradan açar, kodda adlarıyla kullanırsınız.'),
          h('button', {class: 'primary', onclick: wspPick}, icEl('open', 14), 'Klasör seç…'),
          h('div', {style: 'margin-top:10px'}, WSP.canPath ? 'Ya da yukarıya bir yol yazıp Enter’a basın (ör. C:\\Veriler).' : 'Bir klasörü pencereye sürükleyip bırakarak da açabilirsiniz.')]));
    foot.replaceChildren(h('span', null, WSP.canPath ? 'Yol ile açma kullanılabilir (MATView.exe)' : ''));
    return;
  }
  if (WSP.loading && !WSP.items.length) { list.replaceChildren(h('div', {class: 'wsempty'}, 'Yükleniyor…')); return; }
  const vis = wspVisible(), openNames = new Set(CODE.docs.filter(d => d.src).map(d => wspSrcKey(d.src)));
  const rows = vis.map(([it, i]) => {
    const t = it.dir ? {k: 'd', lb: ''} : wspType(it.name), isOpen = !it.dir && t.k === 'm' && openNames.has(wspSrcKey(wspSrcFor(it.name)));
    const fi = h('span', {class: 'fi ' + t.k}); if (it.dir) fi.append(icEl('open', 14)); else fi.textContent = t.lb || '·';
    return h('div', {class: 'wsrow' + (i === WSP.sel ? ' sel' : '') + (!it.dir && t.k === 'other' ? ' dim' : '') + (isOpen ? ' open' : ''), role: 'option', 'aria-selected': i === WSP.sel ? 'true' : 'false', 'data-i': i, draggable: 'true',
      title: it.name + (it.dir ? '\nÇift tık: klasöre gir' : `\n${wspFmtSize(it.size)}${it.mtime ? ' · ' + new Date(it.mtime).toLocaleString('tr-TR') : ''}\nÇift tık: aç · Sağ tık: seçenekler · Grafiğe/editöre sürükleyebilirsiniz`),
      onclick: () => { WSP.sel = i; wspRender(); list.focus(); }, ondblclick: () => { WSP.sel = i; wspOpenItem(it); },
      oncontextmenu: e => { e.preventDefault(); WSP.sel = i; wspRender(); wspItemMenu(it, e.clientX, e.clientY); },
      ondragstart: e => { if (it.dir) { e.preventDefault(); return; } e.dataTransfer.setData('text/matview-wsp', it.name); e.dataTransfer.setData('text/plain', it.name); e.dataTransfer.effectAllowed = 'copy'; }},
      fi, h('span', {class: 'nm'}, it.name), h('span', {class: 'meta'}, it.dir ? '' : wspFmtSize(it.size)));
  });
  list.replaceChildren(...(rows.length ? rows : [h('div', {class: 'wsempty'}, WSP.items.length ? 'Süzgece uyan dosya yok.' : 'Klasör boş.')]));
  const nd = WSP.items.filter(x => x.dir).length, nf = WSP.items.length - nd;
  foot.replaceChildren(h('span', {title: wspDir()}, `${nd} klasör, ${nf} dosya${vis.length < WSP.items.length ? ` (${vis.length} gösteriliyor)` : ''}`),
    WSP.mode === 'path' ? h('span', {class: 'wsbadge', style: 'flex:none', title: 'Yol ile açılan klasörler salt okunurdur. Kaydetmek için “Klasör seç…” ile aynı klasörü seçin.'}, 'salt okunur')
      : h('span', {class: 'wsbadge', style: 'flex:none', title: WSP.writeOk ? '.m kayıtları ve koddan yazılan dosyalar bu klasöre gider' : 'Yazma izni yok; kaydederken izin istenir'}, WSP.writeOk ? 'yazılabilir' : 'okuma'));
  if (scroll) { const r = list.querySelector('.wsrow.sel'); if (r) r.scrollIntoView({block: 'nearest'}); }
}
function wspKey(e) {
  const vis = wspVisible(); if (!vis.length && e.key !== 'Backspace') return;
  let k = vis.findIndex(([, i]) => i === WSP.sel);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); k = e.key === 'ArrowDown' ? Math.min(vis.length - 1, k + 1) : Math.max(0, k < 0 ? 0 : k - 1); WSP.sel = vis[k][1]; wspRender(true); }
  else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); WSP.sel = vis[e.key === 'Home' ? 0 : vis.length - 1][1]; wspRender(true); }
  else if (e.key === 'Enter') { e.preventDefault(); if (k >= 0) wspOpenItem(WSP.items[WSP.sel]); }
  else if (e.key === 'Backspace') { e.preventDefault(); wspUp(); }
  else if (e.key === 'F5' && S.view !== 'code') { e.preventDefault(); wspLoad(); }
  else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey) {   // ilk harfle atla
    const c = e.key.toLowerCase(), start = k + 1, n = vis.length; for (let j = 0; j < n; j++) { const [it, i] = vis[(start + j) % n]; if (it.name.toLowerCase().startsWith(c)) { WSP.sel = i; wspRender(true); break; } }
  }
}
function wspItemMenu(it, x, y) {
  const t = wspType(it.name), items = [];
  if (it.dir) items.push({t: 'Aç', ic: 'open', fn: () => wspInto(it)});
  else if (t.k === 'm') items.push({t: 'Düzenleyicide aç', ic: 'file', fn: () => wspOpenM(it)}, {t: 'Çalıştır', ic: 'play', fn: () => wspOpenM(it, true)});
  else if (t.k === 'mat') items.push({t: 'Kanalları aç (grafik)', ic: 'traces', fn: () => wspOpenItem(it, 'view')}, {t: 'Kod çalışma alanına yükle', ic: 'fx', fn: () => wspOpenItem(it, 'ws')});
  else if (t.k === 'fig') items.push({t: 'Aç (arayüz önizleme)', ic: 'file', fn: () => wspOpenItem(it)});
  else if (t.k === 'bin' || t.k === 'other') items.push({t: 'Telemetri: çerçeve tipleriyle çöz', ic: 'bin', fn: () => wspOpenItem(it, 'tlm')}, {t: 'Telemetri: dosyadan canlı oynat', ic: 'play', fn: () => wspOpenItem(it, 'play')}, {t: 'Binary olarak çöz (Excel çerçeve)…', ic: 'bin', fn: () => wspOpenItem(it, 'bin')});
  else items.push({t: 'Aç', ic: 'open', fn: () => wspOpenItem(it)});
  if (!it.dir && t.k !== 'bin' && t.k !== 'other' && t.k !== 'm') items.push({t: 'Binary olarak çöz…', ic: 'bin', fn: () => wspOpenItem(it, 'bin')});
  items.push('-', {t: 'Adı kopyala', ic: 'copy', fn: () => wspCopy(it.name)});
  if (WSP.mode === 'path') items.push({t: 'Tam yolu kopyala', ic: 'copy', fn: () => wspCopy(wspJoin(WSP.path, it.name))});
  if (!it.dir && t.k !== 'm' && S.view === 'code') items.push({t: 'Komut satırına ekle', ic: 'fx', fn: () => { const c = $('#codeCmd'); if (c) { c.value += (/\.mat$/i.test(it.name) ? `load('${it.name}')` : `'${it.name}'`); c.focus(); } }});
  items.push('-', {t: 'Yeni betik (.m)…', ic: 'plus', fn: wspNewScript}, {t: 'Yenile', fn: () => wspLoad()});
  ctxMenu(x, y, items);
}
function wspBgMenu(x, y) {
  if (!WSP.mode) return ctxMenu(x, y, [{t: 'Klasör seç…', ic: 'open', fn: wspPick}]);
  ctxMenu(x, y, [{t: 'Yeni betik (.m)…', ic: 'plus', fn: wspNewScript}, {t: 'Yenile', fn: () => wspLoad()}, '-', {t: 'Başka klasör seç…', ic: 'open', fn: wspPick}, {t: 'Klasörü kapat', ic: 'close', fn: wspClose}]);
}
function wspClose() { WSP.mode = null; WSP.stack = []; WSP.path = ''; WSP.items = []; WSP.sel = -1; WSP.writeOk = false; WSP.pushed.clear(); wspRender(); }
function wspCopy(s) { try { navigator.clipboard.writeText(s).then(() => toast('Kopyalandı: ' + s), () => toast(s)); } catch (_) { toast(s); } }
function wspRecentMenu(anchor) {
  const r = anchor.getBoundingClientRect(), items = [{hd: 'Son klasörler'}];
  if (!WSP.recent.length) items.push({t: '(henüz yok)', fn: () => {}});
  for (const e of WSP.recent) items.push({t: (e.kind === 'path' ? e.path : e.name + (e.sub && e.sub.length ? '\\' + e.sub.join('\\') : '')) + (e.kind === 'handle' ? '  (izinli)' : ''), ic: 'open', fn: () => { wspShowPane('folder'); if (e.kind === 'path') wspOpenPath(e.path); else wspOpenHandle(e.h, e.sub); }});
  items.push('-', {t: 'Klasör seç…', ic: 'open', fn: wspPick});
  if (WSP.recent.length) items.push({t: 'Listeyi temizle', ic: 'clear', fn: () => { WSP.recent = []; wspKv('recent', []); }});
  ctxMenu(r.left, r.bottom + 2, items);
}

/* ---------- sürükle-bırak ---------- */
// Pencereye bırakılan klasörü çalışma klasörü yapar. true: işlendi.
function wspDropItems(dt) {
  const items = [...(dt.items || [])].filter(x => x.kind === 'file'); if (!items.length) return false;
  const dirEntry = items.some(x => { try { const en = x.webkitGetAsEntry && x.webkitGetAsEntry(); return en && en.isDirectory; } catch (_) { return false; } });
  if (!dirEntry) return false;
  if (!items[0].getAsFileSystemHandle) { toast('Bu tarayıcıda klasör bırakma desteklenmiyor; “Klasör seç…” kullanın.', 6000); return true; }
  const ps = items.map(x => x.getAsFileSystemHandle());   // olay içinde eşzamanlı istenmeli
  (async () => {
    const hs = (await Promise.all(ps.map(p => p.catch(() => null)))).filter(Boolean);
    const dir = hs.find(x => x.kind === 'directory'), files = [];
    for (const x of hs) if (x.kind === 'file') { try { files.push(await x.getFile()); } catch (_) {} }
    if (dir) { wspShowPane('folder'); await wspOpenHandle(dir); toast(`Çalışma klasörü: ${dir.name}`); }
    if (files.length) openFiles(files);
  })();
  return true;
}
async function wspDropName(name, e) {   // klasör panelinden sürüklenen dosya
  const it = wspItem(name); if (!it) return;
  const ed = $('#codeEd'), inEd = ed && e && e.target && e.target.closest && e.target.closest('.codeview');
  if (inEd && !/\.(m|mat|fig)$/i.test(it.name)) { const c = $('#codeCmd'); if (c) { c.value += `'${it.name}'`; c.focus(); } return; }
  if (inEd && /\.mat$/i.test(it.name)) return wspOpenItem(it, 'ws');
  if (/\.mat$/i.test(it.name) && S.view !== 'code') return wspOpenItem(it, 'view');
  wspOpenItem(it);
}

/* ---------- başlangıç ---------- */
// MATView.exe adres sonuna #cwd=<klasör>&open=<dosya1>\n<dosya2> ekler (exe’ye bırakılan dosyalar, başlangıç klasörü)
async function wspHash() {
  const hp = new URLSearchParams(location.hash.slice(1)), cwd = hp.get('cwd'), opens = (hp.get('open') || '').split('\n').filter(Boolean);
  if (!cwd && !opens.length) return false;
  try { history.replaceState(null, '', location.href.split('#')[0]); } catch (_) {}
  if (!WSP.canPath) return false;
  if (opens.length) { const fs = []; for (const o of opens) { try { fs.push(await wspReadPath(wspNormPath(o))); } catch (e) { toast('Açılamadı: ' + o, 6000); } } if (fs.length) openFiles(fs); }
  if (cwd) { await wspOpenPath(cwd); if (opens.length) wspShowPane('data'); }
  return !!cwd;
}
async function wspStartup() {
  wspBuild();
  let p = 'data'; try { p = localStorage.getItem('mv.lp') || 'data'; } catch (_) {}
  for (const b of document.querySelectorAll('#lptabs button')) b.onclick = () => wspShowPane(b.dataset.lp);
  const ob = $('#btnWsOpen'); if (ob) ob.onclick = () => { if (typeof closeMenus === 'function') closeMenus(); wspPick(); };
  window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'O' || e.key === 'o')) { e.preventDefault(); wspShowPane(WSP.pane === 'folder' ? 'data' : 'folder'); if (WSP.pane === 'folder') $('#wsList').focus(); } });
  wspShowPane(p);
  await wspPathAvail();
  const rec = await wspKv('recent'); WSP.recent = Array.isArray(rec) ? rec : [];
  window.addEventListener('hashchange', () => wspHash());
  if (!(await wspHash())) await wspRestore(WSP.recent[0]);
  wspRender();
}
async function wspRestore(r) {   // son klasörü yeniden aç; izin sorulması gerekiyorsa panelde “Erişime izin ver” gösterilir
  if (!r) return;
  if (r.kind === 'path' && WSP.canPath) await wspOpenPath(r.path);
  else if (r.kind === 'handle' && r.h) { let st = 'prompt'; try { st = await r.h.queryPermission({mode: 'read'}); } catch (_) {} if (st === 'granted') await wspOpenHandle(r.h, r.sub); else { WSP.needPerm = r.h; wspRender(); } }
}
window.addEventListener('DOMContentLoaded', () => { setTimeout(() => wspStartup().catch(e => console.error(e)), 0); });
