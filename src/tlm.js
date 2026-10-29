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
    const vid = videos && videos.length ? ` · ${videos.length} kamera videosu (Telemetri › Video / Kamera)` : '';
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
  dropFiles(list) { openFiles(list); }
};

// tema eşitleme
new MutationObserver(() => { if (TLM.ready) { try { TLM.win.TPHost.setTheme(document.documentElement.dataset.theme || ''); } catch (_) {} } }).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});

(function tlmBind() {
  const b = document.getElementById('btnTlm'); if (b) b.onclick = () => tlmShow('file');
  const p = document.getElementById('btnTlmPlay'); if (p) p.onclick = () => { tlmShow('live'); };
  const w = document.getElementById('wTlm'); if (w) w.onclick = () => tlmShow('file');
})();
