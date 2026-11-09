/* Telemetri görünümü: telemetryParser (v4.6) tabanlı çerçeve tipli binary çözme, dosyadan canlı oynatma ve kamera
   (RTP / H.264) videosu. Modül src/tlm/telemetri.html'dir; build.py onu __TLM_HTML olarak gömer ve burada bir
   iframe (srcdoc) içinde açılır — kendi stil ve betikleri MATView'e karışmaz. Köprü:
     MATView → modül : TLM.win.TPHost (addFiles, playFiles, playVideo, setTheme, importSettingsText…)
     modül → MATView : window.MATViewTLM (ready, addSessions, saveFile, dropFiles)
   "Çöz ve MATView'de aç" sonucunda her kayıt bir MATView dosyası olur; kanal verisi çözümü yapan işçideki
   geçici depodan, kanal seçildikçe okunur (bellekte yalnız çizilen kanallar tutulur). */
/*TLMSRC*/
const TLM = {frame: null, win: null, ready: false, wait: [], lsKey: 'telemetryParser.settings.v1'};

// modülde kullanılabilir template var mı? (iframe yüklenmeden de tarayıcı deposundan bakılır)
function tlmHasTemplates() {
  try { if (TLM.ready && TLM.win.TPHost) return TLM.win.TPHost.hasTemplates(); } catch (_) {}
  try { const o = JSON.parse(localStorage.getItem(TLM.lsKey) || 'null'); return !!(o && Array.isArray(o.frameTypes) && o.frameTypes.some(ft => ft && ft.templateRows)); } catch (_) { return false; }
}
function tlmEnsure() {
  if (TLM.frame) return;
  const box = $('#v-tlm');
  const fr = h('iframe', {id: 'tlmFrame', title: 'Telemetri', allow: 'fullscreen'});
  box.append(fr); TLM.frame = fr;
  fr.srcdoc = __TLM_HTML;
}
// modül hazır olunca fn(TPHost) çalıştırılır
function tlmCall(fn) {
  tlmEnsure();
  if (TLM.ready) { try { return fn(TLM.win.TPHost); } catch (e) { toast('Telemetri: ' + (e.message || e), 7000); } return; }
  TLM.wait.push(fn);
}
function tlmShow(tab) { tlmEnsure(); switchView('tlm'); if (tab) tlmCall(H => H.showTab(tab)); }
function tlmShown() { tlmEnsure(); }
// binary dosyalar: çözme listesine (how = 'decode') ya da dosyadan canlı oynatmaya (how = 'play')
function tlmOpenBins(files, how) {
  files = [...files]; if (!files.length) return;
  tlmShow(how === 'play' ? 'live' : 'file');
  tlmCall(H => {
    if (how === 'play') { if (H.playFiles(files)) toast(files.length + ' dosya canlı oynatmaya yüklendi · ▶ Oynat', 5000); }
    else { H.addFiles(files); toast(files.map(f => f.name).join(', ') + ' çözme listesine eklendi' + (H.hasTemplates() ? '' : ' · önce Çerçeve Ayarları’ndan çerçeve tipi / template ekleyin'), 6000); }
  });
}
// telemetryParser biçimli template'ler (Birim / Index / Değişken / Tip …) çerçeve tipi olarak eklenir
async function tlmAddTemplates(files) {
  tlmShow('file');
  await new Promise(res => tlmCall(async H => { try { const n = await H.addTemplateFiles(files); if (n) toast(n + ' template çerçeve tipi olarak yüklendi (Telemetri › Çerçeve Ayarları)', 7000); } catch (e) { toast('Template yüklenemedi: ' + (e.message || e), 8000); } res(); }));
}
function tlmPlayVideo(file) { tlmShow('video'); tlmCall(H => H.playVideo(file)); }
async function tlmImportSettings(file) {
  const text = await file.text(); let n = 0;
  await new Promise(res => tlmCall(H => { try { n = H.importSettingsText(text); toast(file.name + ': telemetri ayarları yüklendi (' + n + ' template)', 6000); } catch (e) { toast('Telemetri ayarları okunamadı: ' + (e.message || e), 8000); } res(); }));
  tlmShow('file');
}
function tlmIsSettingsJson(text) { try { const o = JSON.parse(text); return !!(o && (o.app === 'telemetryParser' || ('frameTypes' in o && 'cols' in o))); } catch (_) { return false; } }
// .bin / template yönlendirmesi: Telemetri'de çerçeve tipi (template) tanımlıysa ya da Telemetri görünümü açıksa Telemetri;
// değilse önceki davranış (Excel çerçeve akışı). Klasör paneli sağ tık menüsü ve Aç menüsü her ikisini de doğrudan sunar.
function tlmPrefers() { return tlmHasTemplates() || S.view === 'tlm'; }

/* ---------- çözüm oturumu → MATView dosyası ---------- */
function tlmAddSession(ss, client) {
  const T = ss.T, f = {id: 'f' + (importFile.seq++), name: ss.label + ' · telemetri', table: true, tlm: {ss, client, rowT: new Map()}, mat: null, vars: [], channels: [], mcache: new Map(), Tpkt: T, baseFs: 1 / T, cnts: {}, baseN: 0, cols: []};
  const rowT = ui => { let p = f.tlm.rowT.get(ui); if (!p) { p = client.request('rowt', {sid: ss.id, u: ui}).then(r => r.v); f.tlm.rowT.set(ui, p); } return p; };
  let maxSpp = 1, nCh = 0, skipped = 0;
  ss.units.forEach((u, ui) => {
    u.cols.forEach(col => {
      if (col.kind === 'bytes') { skipped++; return; }   // byte array: tek .mat'te uint8 matris
      if (!col.n) return;
      const nm = u.name + '/' + col.name, spp = Math.max(1, col.perFrame | 0);
      const c = new Channel({name: nm, rest: col.name, base: col.group, comp: '', dev: u.name, kind: col.counter ? 'other' : kindOf(u.name, col.name), n: col.n, file: f, label: nm, varIdx: -1, bin: true, tbl: true, unit: ''});
      c.dtS = col.ownT ? (ss.span * T) / col.n : T / spp; c.Tpkt = c.dtS; c.t0 = 0; c.spp = 1; c.tlmCol = col;
      c.binLoad = async () => {
        const r = await client.request('col', {sid: ss.id, u: ui, c: col.i});
        if (col.ownT && r.t && r.t.length === r.v.length) { c.g = r.t; c.spp = 1; c.Tpkt = T; }
        else if (col.ctx === 'frame' && !col.timeBad && !col.conditional) {
          const g = await rowT(ui);
          if (g.length * spp === r.v.length) { c.g = g; c.spp = spp; c.Tpkt = T; }
          else { c.g = null; c.dtS = (ss.span * T) / Math.max(1, r.v.length); }
        } else { c.g = null; c.dtS = (ss.span * T) / Math.max(1, r.v.length); }
        return r.v;
      };
      maxSpp = Math.max(maxSpp, spp); nCh++;
      f.channels.push(c);
    });
  });
  f.Tpkt = T / maxSpp; f.baseFs = maxSpp / T; f.baseN = ss.frames * maxSpp;
  S.files.push(f); S.fopen.add(f.id); renderChips(); renderTree();
  return {nCh, skipped};
}
function tlmSessionMenu(f, items) {   // ağaçta dosya sağ tık menüsüne ek
  if (!f || !f.tlm) return;
  items.push('-', {t: 'Tüm kaydı tek .mat olarak kaydet…', ic: 'download', fn: () => tlmSaveSingleMat(f)}, {t: 'Telemetri görünümünü aç', ic: 'bin', fn: () => tlmShow('file')});
}
async function tlmSaveSingleMat(f) {
  await busy('Tek .mat yazılıyor: ' + f.tlm.ss.label, async () => {
    const r = await f.tlm.client.request('mat', {sid: f.tlm.ss.id});
    await window.MATViewTLM.saveFile(r.name, r.blob);
  });
}
// dosya kapatılınca oturumun geçici deposu da bırakılır
const _tlmCloseFile = closeFile;
closeFile = function (f) { if (f && f.tlm) { try { f.tlm.client.close(f.tlm.ss.id); } catch (_) {} } return _tlmCloseFile(f); };

window.MATViewTLM = {
  ready(w) {
    TLM.win = w; TLM.ready = true;
    try { w.TPHost.setTheme(document.documentElement.dataset.theme || ''); } catch (_) {}
    const q = TLM.wait.splice(0); for (const fn of q) { try { fn(w.TPHost); } catch (e) { toast('Telemetri: ' + (e.message || e), 7000); } }
  },
  addSessions(sessions, client, videos) {
    let n = 0, sk = 0;
    for (const ss of sessions) { const r = tlmAddSession(ss, client); n += r.nCh; sk += r.skipped; }
    const vid = videos && videos.length ? ` · ${videos.length} kamera videosu (Telemetri › Video)` : '';
    toast(`${sessions.map(s => s.label).join(', ')}: ${fmtCnt(n)} kanal MATView’e eklendi` + (sk ? ` (${sk} byte array kanal yalnız tek .mat’te)` : '') + vid, 9000, {t: 'Kanalları göster', fn: () => { if (typeof wspShowPane === 'function') wspShowPane('data'); switchView('time'); }});
    if (typeof wspShowPane === 'function') wspShowPane('data');
  },
  // klasör paneli yazılabilir bir klasördeyse oraya, değilse kaydetme penceresi / indirme
  async saveFile(name, blob) {
    if (typeof WSP !== 'undefined' && WSP.writeOk && typeof wspWriteIn === 'function') {
      try { await wspWriteIn(wspCur().h, name, blob); toast(name + ' çalışma klasörüne yazıldı (' + wspDir() + ')', 6000); wspLoad(); return true; } catch (_) {}
    }
    return saveBlob(blob, name);
  },
  dropFiles(list) { openFiles(list); },
  // canlı grafik: telemetri sinyalleri MATView Zaman sekmesinde canlı kanal olarak çizilir
  liveChart(list, where) { tlmLiveChart(list, where); },
  writeXlsx(sheets) { return XLSX.write(sheets); },
  liveAxes() { return S.plot.axes.map(a => a.traces.map(t => t.label).slice(0, 3).join(', ') + (a.traces.length > 3 ? ' …' : '') || 'boş'); }
};

/* ---------- canlı telemetri kanalları (Zaman sekmesi) ----------
   Kanal verisi telemetri modülünün geçmiş tamponundan 250 ms'de bir çekilir ve büyüyen dizilere eklenir. Zaman, oynatma
   başlangıcından itibaren saniyedir. Alt grafik son "pencere" kadarı izler; kullanıcı yakınlaştırır / kaydırırsa izleme
   durur, Sığdır (Home) ile yeniden başlar. Oynatma yeniden başlatılırsa (yeni oturum) kanallar sıfırlanır. */
const TLV = {file: null, chans: new Map(), timer: 0, gen: null, follow: new Set()};
function tlvFile() {
  if (TLV.file && S.files.includes(TLV.file)) return TLV.file;
  const f = {id: 'f' + (importFile.seq++), name: 'Canlı telemetri', table: true, tlmLive: true, mat: null, vars: [], channels: [], mcache: new Map(), Tpkt: 1, baseFs: 1, cnts: {}, baseN: 0, cols: []};
  S.files.push(f); S.fopen.add(f.id); TLV.file = f; TLV.chans.clear(); return f;
}
function tlvChannel(sig) {
  let c = TLV.chans.get(sig.key); if (c && TLV.file && TLV.file.channels.includes(c)) { tlvSubSet(c, true); return c; }
  const L = TLM.win.TPLive, info = L.liveSub(sig), f = tlvFile();
  const nm = (info.name || sig.key).replace(/\s*\/\s*/, '/');
  c = new Channel({name: nm, rest: nm.split('/').slice(1).join('/') || nm, base: nm, comp: '', dev: info.ft || 'canlı', kind: kindOf(nm, nm), n: 0, file: f, label: nm, varIdx: -1, tbl: true, unit: ''});
  c.data = new Float64Array(0); c.g = new Float64Array(0); c.spp = 1; c.Tpkt = 1e-3; c.tlvDt = 0; c.t0 = 0; c.tlvKey = sig.key; c.tlvBuf = {v: new Float64Array(1024), g: new Float64Array(1024), n: 0, last: null};
  c.tlvSub = true; c.tlvSig = sig; f.channels.push(c); TLV.chans.set(sig.key, c); return c;
}
function tlvAppend(c, t, v, t0) {
  const B = c.tlvBuf, n = t.length; if (!n) return false;
  if (B.n + n > B.v.length) { let cap = B.v.length; while (cap < B.n + n) cap *= 2; const nv = new Float64Array(cap), ng = new Float64Array(cap); nv.set(B.v.subarray(0, B.n)); ng.set(B.g.subarray(0, B.n)); B.v = nv; B.g = ng; }
  const dt = c.tlvDt || 1;   // g birimi: örnek periyodu (Tpkt); ilk örneklerden kestirilir, böylece kanal fs'i doğru olur
  for (let i = 0; i < n; i++) { B.v[B.n + i] = +v[i]; B.g[B.n + i] = (t[i] - t0) / dt; }
  B.n += n; B.last = t[n - 1];
  if (!c.tlvDt && B.n >= 24) { const d = []; for (let i = 1; i < B.n; i++) { const x = B.g[i] - B.g[i - 1]; if (x > 0) d.push(x); } d.sort((p, q) => p - q); const md = d.length ? d[d.length >> 1] : 1; if (md > 0) { for (let i = 0; i < B.n; i++) B.g[i] /= md; c.tlvDt = md; c.Tpkt = md / 1000; } }
  if (B.n > 4e6) { const k = B.n - 3e6; B.v.copyWithin(0, k, B.n); B.g.copyWithin(0, k, B.n); B.n -= k; }   // bellek sınırı: en eski örnekler düşer
  c.data = B.v.subarray(0, B.n); c.g = B.g.subarray(0, B.n); c.n = B.n; c.pyr = null; c._mm = null; return true;
}
function tlvReset() { for (const c of TLV.chans.values()) { const B = c.tlvBuf; B.n = 0; B.last = null; c.tlvDt = 0; c.Tpkt = 1e-3; c.data = B.v.subarray(0, 0); c.g = B.g.subarray(0, 0); c.n = 0; c.pyr = null; } }
// abonelik = kanal bir alt grafikte çiziliyor mu: grafik temizlenince / iz kaldırılınca telemetri tablosundaki işaret de söner
function tlvSubSet(c, on) {
  if (!!c.tlvSub === on) return; c.tlvSub = on;
  try { if (on) TLM.win.TPLive.liveSub(c.tlvSig); else TLM.win.TPLive.liveUnsub(c.tlvKey); } catch (_) {}
}
function tlvSyncSubs() {
  const on = new Set(); for (const ax of S.plot.axes) for (const t of ax.traces) if (t.ch && t.ch.tlvKey) on.add(t.ch);
  for (const c of TLV.chans.values()) tlvSubSet(c, on.has(c));
}
function tlvPoll() {
  if (!TLM.ready || !TLV.chans.size) return;
  tlvSyncSubs();
  const L = TLM.win.TPLive; let st; try { st = L.liveState(); } catch (_) { return; }
  if (TLV.gen !== st.t0) { if (TLV.gen != null) tlvReset(); TLV.gen = st.t0; }
  let any = false, tmax = -Infinity;
  for (const c of TLV.chans.values()) {
    if (!TLV.file || !TLV.file.channels.includes(c) || !c.tlvSub) continue;
    let r; try { r = L.liveData(c.tlvKey, c.tlvBuf.last); } catch (_) { continue; }
    if (tlvAppend(c, r.t, r.v, st.t0)) any = true;
    if (c.n) tmax = Math.max(tmax, c.t(c.n - 1));
  }
  if (!any) return;
  const win = (st.win || 10000) / 1000;
  for (const ax of S.plot.axes) if (TLV.follow.has(ax) && ax.traces.some(t => t.ch && t.ch.tlvKey) && isFinite(tmax)) ax.xlim = [Math.max(0, tmax - win), Math.max(tmax, win)];
  if (S.view === 'time') S.plot.invalidate();
}
function tlmLiveChart(list, where) {
  if (!TLM.ready) return;
  const chs = list.map(tlvChannel);
  let ax;
  if (where === 'new' || !S.plot.axes[where]) { ax = S.plot.addAxes(); }
  else ax = S.plot.axes[where];
  for (const c of chs) if (!ax.traces.some(t => t.ch === c)) ax.traces.push(makeTrace(c));
  if (typeof assignYAxes === 'function') assignYAxes(ax, ax.traces.slice(-chs.length));
  if (typeof axisLabelFor === 'function') axisLabelFor(ax);
  TLV.follow.add(ax); S.plot.active = ax;
  if (!TLV.timer) TLV.timer = setInterval(tlvPoll, 250);
  tlvPoll(); renderChips(); renderTree(); switchView('time'); refreshAll();
  if (!TLV.hinted) { TLV.hinted = true; toast('Canlı telemetri Zaman sekmesinde · yakınlaştırınca izleme durur, Sığdır (Home) ile sürer · Telemetri sekmesine dönünce oynatma kaldığı yerden devam eder', 9000, {t: 'Telemetriye dön', fn: () => tlmShow('live')}); }
}
// kullanıcı yakınlaştırır / kaydırırsa o alt grafikte izleme durur; Sığdır izlemeyi yeniden açar
(function () {
  const hook = () => {
    if (!S.plot || S.plot._tlvHooked) return; S.plot._tlvHooked = true;
    const oc = S.plot.onChange; S.plot.onChange = k => { if (k === 'view' && S.plot._userView) { const a = S.plot.active; if (a) TLV.follow.delete(a); } oc(k); };
    const cv = S.plot.cv; ['pointerdown', 'wheel'].forEach(ev => cv.addEventListener(ev, () => { S.plot._userView = true; setTimeout(() => { S.plot._userView = false; }, 400); }, {capture: true, passive: true}));
    const fa = S.plot.fitAll.bind(S.plot); S.plot.fitAll = xOnly => { for (const a of S.plot.axes) if (a.traces.some(t => t.ch && t.ch.tlvKey)) TLV.follow.add(a); fa(xOnly); tlvPoll(); };
  };
  window.addEventListener('DOMContentLoaded', () => setTimeout(hook, 0)); if (document.readyState !== 'loading') setTimeout(hook, 0);
})();
// canlı kanal dosyası kapatılınca abonelikler bırakılır
const _tlvClose = closeFile;
closeFile = function (f) { if (f && f.tlmLive) { for (const c of TLV.chans.values()) { if (c.tlvSub) { try { TLM.win.TPLive.liveUnsub(c.tlvKey); } catch (_) {} } } TLV.chans.clear(); TLV.file = null; clearInterval(TLV.timer); TLV.timer = 0; } return _tlvClose(f); };

// tema eşitleme
new MutationObserver(() => { if (TLM.ready) { try { TLM.win.TPHost.setTheme(document.documentElement.dataset.theme || ''); } catch (_) {} } }).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});

(function tlmBind() {
  const b = document.getElementById('btnTlm'); if (b) b.onclick = () => tlmShow('file');
  const p = document.getElementById('btnTlmPlay'); if (p) p.onclick = () => { tlmShow('live'); tlmCall(H => H.liveSource && H.liveSource('sim')); };
  const la = document.getElementById('btnLiveAud'); if (la) la.onclick = () => LAUD.open();
  const lc = document.getElementById('btnTlmLive'); if (lc) lc.onclick = () => { tlmShow('live'); tlmCall(H => { if (H.liveSource && !H.liveSource('live')) toast('Önce mevcut bağlantıyı / oynatmayı durdurun', 5000); }); };
  const w = document.getElementById('wTlm'); if (w) w.onclick = () => tlmShow('file');
})();
// "Grafiği temizle" sonrası telemetri tablosundaki grafik işaretleri hemen söner
if (typeof clearPlot === 'function') { const _tlvClearPlot = clearPlot; clearPlot = function () { const r = _tlvClearPlot.apply(this, arguments); try { if (TLV.chans.size) tlvSyncSubs(); } catch (_) {} return r; }; }
