/* ===== Faz 5: Arka plan işçisi (D1), hata günlüğü / sürüm / yardım (D3, D4), analiz şablonları (C3), toplu özet (C4) ===== */

/*DSPSRC*/
/* ---------- D1: DSP için Web Worker (yoksa ana iş parçacığına düşer) ---------- */
const DSPW = (() => {
  let w = null, dead = false, seq = 0; const pend = new Map();
  function fallback(fn, args) { return DSP[fn](...args); }
  function start() {
    if (w || dead) return !!w;
    try {
      if (typeof Worker === 'undefined' || typeof __DSP_SRC !== 'string') throw new Error('worker yok');
      const src = __DSP_SRC + '\nonmessage = e => { const {id, fn, args} = e.data; try { postMessage({id, r: DSP[fn](...args)}); } catch (err) { postMessage({id, err: String(err && err.message || err)}); } };';
      w = new Worker(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
      w.onmessage = e => { const p = pend.get(e.data.id); if (!p) return; pend.delete(e.data.id); if (e.data.err) p.rej(new Error(e.data.err)); else p.res(e.data.r); };
      w.onerror = e => { dead = true; try { w.terminate(); } catch (_) {} w = null; if (typeof logErr === 'function') logErr('worker', e && e.message || 'worker hatası'); for (const [, p] of pend) { try { p.res(fallback(p.fn, p.args)); } catch (er) { p.rej(er); } } pend.clear(); };
    } catch (_) { dead = true; w = null; }
    return !!w;
  }
  // büyük bir tamponun küçük bir görünümü klonlanırken tüm tampon kopyalanmasın
  const slim = a => (ArrayBuffer.isView(a) && a.buffer.byteLength > a.byteLength * 1.5) ? a.slice() : a;
  function run(fn, args) {
    if (!start()) return Promise.resolve().then(() => fallback(fn, args));
    return new Promise((res, rej) => { const id = ++seq; pend.set(id, {res, rej, fn, args}); try { w.postMessage({id, fn, args: args.map(slim)}); } catch (e) { pend.delete(id); try { res(fallback(fn, args)); } catch (er) { rej(er); } } });
  }
  return {run, get active() { return !!w; }, get dead() { return dead; }, start};
})();

/* ---------- D3: hata günlüğü ---------- */
S.errLog = (() => { try { return JSON.parse(sessionStorage.getItem('mv.errlog') || '[]'); } catch (_) { return []; } })();
function logErr(kind, msg, stack) {
  S.errLog.push({t: Date.now(), kind, msg: String(msg == null ? '' : msg).slice(0, 400), stack: String(stack || '').slice(0, 1200)}); if (S.errLog.length > 100) S.errLog.shift();
  try { sessionStorage.setItem('mv.errlog', JSON.stringify(S.errLog)); } catch (_) {}
}
window.addEventListener('error', e => logErr('hata', e.message, e.error && e.error.stack));
window.addEventListener('unhandledrejection', e => logErr('söz', e.reason && e.reason.message || e.reason, e.reason && e.reason.stack));

const CHANGELOG = [
  {v: '2.0', d: 'Kapsamlı güncelleme', items: [
    'Güvenilirlik: Welch (periyodik pencere, scipy/MATLAB ile 1e-15 uyumlu), etkin ortalama sayısı, serbestlik derecesi ve güven aralığı; Kalite sekmesi (kırpılma, sıçrama, kopma, sabit kanal, DC kayması).',
    'Test mühendisliği: şartname uygunluk (MIL-STD-810 / ISO / özel tolerans şablonları), faz/seviye tespiti, kontrol kanalı rolleri, transmisibilite/FRF, akustik bant tablosu (OASPL), şok analizi (SRS, süre, ΔV, şekil), termal analiz.',
    'Araçlar: yeniden örnekleme / ortak ızgara, kanallar arası korelasyon ve gecikme, olay/anomali listesi, tonal bileşen, notlar.',
    'İzlenebilirlik: işlem günlüğü (rapor "Yöntem" metni, MAT çıktısına eklenir), silme geçmişi, ham veri görünümü.',
    'İş akışı: analiz şablonları, toplu (çoklu dosya) özet, TDMS desteği, arka plan işçisi, hata günlüğü ve kılavuz.']},
  {v: '1.x', d: 'Önceki sürümler', items: ['MAT / HDF5 / UNV (58) / ikili telemetri (Excel çerçeve tanımı) / CSV-Excel / WAV okuma; zaman, spektrum, spektrogram, oktav, SRS, filtre, Hampel, temizleme; profil karşılaştırma; rapor ve PNG/SVG çıktısı.']}];

/* ---------- D4: kılavuz / sürüm / sorun bildir ---------- */
function diagBundle(withNames) {
  const files = allFiles().map(f => ({ext: (f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase(), name: withNames ? f.name : undefined, channels: f.channels.length, maxN: Math.max(0, ...f.channels.map(c => c.n || 0))}));
  return {app: 'MATView', ver: APP_VER, time: new Date().toISOString(), ua: navigator.userAgent, worker: DSPW.active ? 'etkin' : (DSPW.dead ? 'yok (ana iş parçacığı)' : 'başlamadı'), files, errors: S.errLog, methodLog: (S.methodLog || []).slice(-100), note: 'Bu pakette ölçüm verisi yoktur.'};
}
function helpDialog(start) {
  const pages = {};
  const sec = (t, ...c) => [h('h4', {style: 'margin:12px 0 4px'}, t), ...c];
  pages['Genel'] = helpBody();
  pages['İş akışı'] = h('div', {style: 'line-height:1.65'}, ...sec('1 · Aç ve doğrula', h('div', null, 'Dosyaları açın (sürükle-bırak). Kalite sekmesi kırpılma, sıçrama, kopma ve sabit kanalları otomatik tarar; bulguları inceleyin, gerekirse Temizle sekmesiyle düzeltin (silme geçmişi tutulur).')),
    ...sec('2 · Seviye ve fazlar', h('div', null, 'UNV/Profil sekmesinde şartname profilini girin; Test sekmesinde “Seviye algıla” ile fazlar çıkar. Uygunluk kartı her faz için ASD, Grms, tolerans dışı bant payı ve serbestlik derecesini hesaplar.')),
    ...sec('3 · Kontrol ve cevap', h('div', null, 'Kanal adları testten teste değişir: soldan seçip “Seçili → Kontrol / Cevap” ile rol atayın. Kontrol ortalaması/zarfı, transmisibilite ve koherans rollere göre hesaplanır.')),
    ...sec('4 · Şablon ve toplu çalışma', h('div', null, 'Ayarlarınızı Araçlar ▸ Analiz şablonları ile kaydedin (profil, tolerans, parametreler, rol kalıpları). Toplu özet kartı aynı analizi tüm açık dosyalara uygular ve tek tabloda toplar.')),
    ...sec('5 · Raporla', h('div', null, 'Sonuçlar “Rapora ekle” ile rapora girer; Çıktı sekmesindeki Yöntem metni uygulanan işlemleri (parametreleriyle) otomatik yazar.')));
  pages['Kısayollar'] = h('table', {class: 'kv'}, ...[['Delete', 'Seçili noktaları sil'], ['Ctrl+Z / Ctrl+Y', 'Geri al / yinele'], ['P · Z · C · B · L', 'Gez · Yakınlaştır · İmleç · Kutu · Kement'], ['+ / −', 'Yakınlaş / uzaklaş'], ['Home', 'Tümünü sığdır'], ['Esc', 'Seçimi kaldır / menüyü kapat'], ['Ctrl+S', 'Oturumu kaydet'], ['Ctrl+O', 'Dosya aç'], ['Ctrl+E', 'Görünümü PNG kaydet'], ['Ctrl+Shift+R', 'Görünümü rapora ekle'], ['N', 'İmleç konumuna not ekle'], ['F1  ·  ?', 'Bu pencere']].map(r => h('tr', null, h('td', null, h('kbd', null, r[0])), h('td', null, r[1]))));
  pages['Sürüm'] = h('div', {style: 'line-height:1.6'}, h('div', null, h('b', null, 'MATView ' + APP_VER), ' — çevrimdışı, kurulum gerektirmeyen test verisi görüntüleyici/işleyici.'), h('div', {class: 'note'}, 'Arka plan işçisi: ' + (DSPW.active ? 'etkin' : (DSPW.dead ? 'kullanılamıyor (ana iş parçacığı)' : 'ilk hesaplamada başlar'))),
    ...CHANGELOG.flatMap(c => [h('h4', {style: 'margin:10px 0 3px'}, `${c.v} — ${c.d}`), h('ul', {style: 'margin:0 0 0 18px'}, ...c.items.map(t => h('li', null, t)))]));
  const nm = h('input', {type: 'checkbox', id: 'dgNames'}), er = () => S.errLog.length ? S.errLog.slice().reverse().map(e => `[${new Date(e.t).toLocaleTimeString('tr-TR')}] ${e.kind}: ${e.msg}`).join('\n') : 'Kayıtlı hata yok.';
  pages['Sorun bildir'] = h('div', {style: 'line-height:1.6'}, h('div', {class: 'note'}, 'Tanı paketi sürüm, tarayıcı, işlem günlüğü ve hata kayıtlarını içerir; ölçüm verisi içermez. Dosya adlarını eklemek isteğe bağlıdır.'),
    h('label', {class: 'chk'}, nm, ' Dosya adlarını da ekle'), h('div', {class: 'btns'}, btn('Tanı paketini kaydet', async () => { await saveBlob(new Blob([JSON.stringify(diagBundle(nm.checked), null, 1)], {type: 'application/json'}), 'matview_tani.json'); }, 'primary'), btn('Hata kaydını temizle', () => { S.errLog.length = 0; logErr('bilgi', 'günlük temizlendi'); S.errLog.length = 0; try { sessionStorage.removeItem('mv.errlog'); } catch (_) {} pre.textContent = er(); })),
    h('h4', {style: 'margin:10px 0 3px'}, 'Hata kaydı'));
  const pre = h('pre', {style: 'max-height:28vh;overflow:auto;font-size:11px;white-space:pre-wrap;background:#f6f7f9;padding:6px;border:1px solid #d5d9de'}, er()); pages['Sorun bildir'].append(pre);
  const wrap = h('div'), tabs = h('div', {class: 'btns', style: 'margin:0 0 8px'}), body = h('div', {style: 'max-height:62vh;overflow:auto'});
  const show = k => { body.replaceChildren(pages[k]); for (const b of tabs.children) b.classList.toggle('primary', b.textContent === k); };
  for (const k of Object.keys(pages)) tabs.append(btn(k, () => show(k))); wrap.append(tabs, body); show(start && pages[start] ? start : 'Genel'); modal('Yardım ve hakkında', wrap, [{t: 'Kapat', primary: true}]);
}

/* ---------- C3: analiz şablonları ---------- */
const TPLKEY = 'mv.tpl', TPL_SKIP = /^(tpl|batTpl|fileIn|binIn)/;
const tplLoad = () => { try { return JSON.parse(localStorage.getItem(TPLKEY) || '[]'); } catch (_) { return []; } };
const tplStore = l => { try { localStorage.setItem(TPLKEY, JSON.stringify(l)); } catch (_) { toast('Şablonlar kaydedilemedi (depolama kapalı)'); } };
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function tplSnapshot(name) {
  const ui = {}, profNames = new Set();
  document.querySelectorAll('#rbody input[id], #rbody select[id], #rbody textarea[id]').forEach(e => {
    if (e.type === 'file' || e.type === 'button' || TPL_SKIP.test(e.id)) return;
    if (e.type === 'checkbox') ui[e.id] = {c: e.checked};
    else if (e.tagName === 'SELECT') { const p = S.profiles.find(x => x.id === e.value); if (p) { ui[e.id] = {prof: p.name}; profNames.add(p.name); } else ui[e.id] = {v: e.value}; }
    else ui[e.id] = {v: e.value};
  });
  const pat = k => { const el = $('#tplRole' + k); return el ? el.value.trim() : ''; };
  return {name, created: Date.now(), ver: APP_VER, ui, roles: {ctl: pat('Ctl'), resp: pat('Resp')}, profiles: S.profiles.filter(p => profNames.has(p.name)).map(p => ({name: p.name, pts: p.pts, tol: p.tol, color: p.color}))};
}
function tplApply(t) {
  let added = 0; const byName = n => S.profiles.find(p => p.name === n);
  for (const p of t.profiles || []) if (!byName(p.name)) { S.profiles.push({id: 'p' + Date.now() + (added++), name: p.name, pts: p.pts, tol: p.tol, color: p.color}); }
  if (added) { saveProfiles(); refreshUnvPanel(); if (typeof cpFillProf === 'function') cpFillProf(); }
  let miss = 0; const entries = Object.entries(t.ui || {}), sels = entries.filter(([id]) => { const e = document.getElementById(id); return e && e.tagName === 'SELECT'; }), rest = entries.filter(([id]) => !sels.some(s => s[0] === id));
  const setOne = ([id, o]) => { const e = document.getElementById(id); if (!e) { miss++; return; } if (o.prof) { const p = byName(o.prof); if (!p) { miss++; return; } if (![...e.options].some(x => x.value === p.id)) { fillProfSelects(); } e.value = p.id; }
    else if ('c' in o) e.checked = o.c; else { if (e.tagName === 'SELECT' && ![...e.options].some(x => x.value === o.v)) { miss++; return; } e.value = o.v; }
    e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); };
  fillProfSelects(); sels.forEach(setOne); rest.forEach(setOne);   // önce seçimler (tolerans şablonu alanları ezer), sonra sayılar
  const all = []; for (const f of allFiles()) for (const c of f.channels) all.push(c);
  for (const [k, pat] of Object.entries(t.roles || {})) { if (!pat) continue; let re; try { re = new RegExp(pat, 'i'); } catch (_) { toast('Rol kalıbı geçersiz: ' + pat); continue; } S.roles[k] = all.filter(c => re.test(c.name)).map(c => c.uid); }
  if (typeof roleRender === 'function') roleRender(); logOp('template', {name: t.name}); return {miss, roles: {ctl: S.roles.ctl.length, resp: S.roles.resp.length}};
}
function fillProfSelects() { if (typeof cpFillProf === 'function') cpFillProf(); for (const id of ['ctProf', 'batProf', 'lvRef']) { const s = document.getElementById(id); if (!s) continue; const v = s.value; if (id === 'lvRef') { fillLvRef(s); continue; } s.replaceChildren(h('option', {value: ''}, '(yok)'), ...S.profiles.map(p => h('option', {value: p.id}, p.name))); if ([...s.options].some(o => o.value === v)) s.value = v; } }
function tplRender() {
  const box = $('#tplBox'); if (!box) return; const list = tplLoad(); box.replaceChildren();
  if (!list.length) box.append(h('div', {class: 'note'}, 'Kayıtlı şablon yok.'));
  list.forEach((t, i) => box.append(h('div', {class: 'btns', style: 'align-items:center'}, h('b', {style: 'flex:1'}, t.name), h('span', {class: 'note'}, new Date(t.created).toLocaleDateString('tr-TR')),
    btn('Uygula', () => { const r = tplApply(t); toast(`Şablon uygulandı: ${t.name}` + (r.miss ? ` (${r.miss} alan bulunamadı)` : '') + ((t.roles && (t.roles.ctl || t.roles.resp)) ? ` · rol: kontrol ${r.roles.ctl}, cevap ${r.roles.resp}` : ''), 6000); }),
    btn('Dışa aktar', () => saveBlob(new Blob([JSON.stringify(t, null, 1)], {type: 'application/json'}), 'sablon_' + t.name.replace(/[^\w\-]+/g, '_') + '.json')),
    btn('Sil', () => { const l = tplLoad(); l.splice(i, 1); tplStore(l); tplRender(); }))));
}
function tplSave() {
  const name = ($('#tplName').value || '').trim(); if (!name) return toast('Şablon adı girin');
  const l = tplLoad(), t = tplSnapshot(name), k = l.findIndex(x => x.name === name); if (k >= 0) l[k] = t; else l.push(t); tplStore(l); tplRender(); toast('Şablon kaydedildi: ' + name);
}
function tplFillRoles() { const nm = k => [...new Set(roleChs(k).map(c => c.name))].map(reEsc).join('|'); $('#tplRoleCtl').value = nm('ctl'); $('#tplRoleResp').value = nm('resp'); }
async function tplImport(file) { try { const t = JSON.parse(await file.text()); if (!t || !t.ui || !t.name) throw new Error('şablon dosyası değil'); const l = tplLoad(), k = l.findIndex(x => x.name === t.name); if (k >= 0) l[k] = t; else l.push(t); tplStore(l); tplRender(); toast('Şablon içe aktarıldı: ' + t.name); } catch (e) { toast('Şablon okunamadı: ' + e.message); } }
function tplCard() {
  const imp = h('input', {type: 'file', accept: '.json', style: 'display:none', id: 'tplFile', onchange: e => { if (e.target.files[0]) tplImport(e.target.files[0]); e.target.value = ''; }});
  return card('Analiz şablonları', h('div', {class: 'note'}, 'Şablon; tüm sekmelerdeki mevcut ayarları (profil, tolerans, parametreler) ve kanal rol kalıplarını saklar. Başka dosyada tek tıkla uygulanır; .json olarak başka bilgisayara taşınır.'),
    fr('Şablon adı', h('input', {type: 'text', id: 'tplName', placeholder: 'örn. Rastgele titreşim — Faz 2'})),
    fr('Kontrol kanalı kalıbı (regex)', h('input', {type: 'text', id: 'tplRoleCtl', placeholder: 'örn. ctrl|kontrol|^CH1$'})), fr('Cevap kanalı kalıbı (regex)', h('input', {type: 'text', id: 'tplRoleResp', placeholder: 'örn. resp|cevap'})),
    h('div', {class: 'btns'}, btn('Kalıpları mevcut rollerden doldur', tplFillRoles), btn('Şablon olarak kaydet', tplSave, 'primary'), btn('İçe aktar…', () => imp.click()), imp), h('div', {id: 'tplBox'}));
}

/* ---------- C4: toplu (çoklu dosya) özet ---------- */
let _bat = null;
async function batchRun() {
  let re; try { re = new RegExp(sv('batPat') || '.', 'i'); } catch (e) { return toast('Kanal kalıbı geçersiz: ' + e.message); }
  const prof = S.profiles.find(p => p.id === sv('batProf')), t = prof ? tolFromUI() : null, onlyVib = ck('batVib'), lvl = num('batLvl') || 0, dfReq = num('batDf') || 2.5, files = allFiles();
  const todo = []; for (const f of files) for (const c of f.channels) if (re.test(c.name) && (!onlyVib || c.kind === 'vib') && c.n >= 512) todo.push([f, c]);
  if (!todo.length) return toast('Kalıba uyan kanal bulunamadı');
  await busy('Toplu özet hesaplanıyor…', async prog => {
    const rows = [], P = specAxesReset(), sa = P.addAxes({xlog: true, ylog: true, title: 'Toplu özet — PSD karşılaştırması'}); sa.xlabel = 'Frekans (Hz)'; sa.ylabel = 'PSD'; sa.xlim = [1, 1000]; sa.ylim = [1e-6, 1];
    let k = 0, tgDone = false; const fcol = new Map();
    for (const [f, c] of todo) {
      await ensureLoaded(c); const seg = DSP.segment(c.data, c.del, 0, c.n); if (seg.length < 512) { prog(++k / todo.length); continue; }
      const nfft = Math.min(DSP.nextPow2(Math.ceil(c.fs / dfReq)), DSP.nextPow2(seg.length)), r = await DSPW.run('welch', [seg, c.fs, {nfft, win: 'hann', overlap: 0.5, scale: 'psd', maxSeg: 8000}]), st = DSP.stats(seg, null, 0, seg.length);
      const f1 = prof ? prof.pts[0][0] : (num('batF1') || 1), f2 = prof ? prof.pts[prof.pts.length - 1][0] : (num('batF2') || c.fs / 2.56); let sm = 0, sT = 0, nb = 0, outN = 0, maxDev = 0, fMax = 0; const fa = [], ya = [], ta = [];
      for (let i = 0; i < r.f.length; i++) { const fq = r.f[i]; if (fq < f1 || fq > f2 || !(r.y[i] > 0)) continue; sm += r.y[i] * r.df; nb++; fa.push(fq); ya.push(r.y[i]);
        if (prof) { const tg = profAt(prof.pts, fq) * Math.pow(10, lvl / 10); sT += tg * r.df; ta.push(tg); const dv = 10 * Math.log10(r.y[i] / tg), [lo, hi] = cpTolAt(t, fq); if (dv > hi || dv < -lo) outN++; if (Math.abs(dv) > Math.abs(maxDev)) { maxDev = dv; fMax = fq; } } }
      const row = {file: f.name, ch: c.name, unit: c.unit || '', dur: c.n / c.fs, fs: c.fs, rms: st.std, peak: Math.max(Math.abs(st.min), Math.abs(st.max)), gm: Math.sqrt(sm), dof: r.dof, df: r.df};
      if (prof) { row.gt = Math.sqrt(sT); row.gpct = 100 * (row.gm / row.gt - 1); row.outPct = nb ? 100 * outN / nb : 0; row.maxDev = maxDev; row.fMax = fMax; row.gOk = row.gpct <= t.gHi && row.gpct >= -t.gLo; row.sOk = row.outPct <= t.pctOut; row.ok = row.gOk && row.sOk; }
      rows.push(row); if (!fcol.has(f.name)) fcol.set(f.name, SUBPAL[fcol.size % SUBPAL.length]);
      sa.traces.push({kind: 'xy', x: Float64Array.from(fa), y: Float64Array.from(ya), label: `${f.name} · ${c.name}`, color: fcol.get(f.name), width: 1.1, visible: true, raw: Float64Array.from(ya), scale: 'psd', df: r.df, srcKind: c.kind});
      if (prof && !tgDone) { tgDone = true; sa.traces.push({kind: 'xy', x: Float64Array.from(fa), y: Float64Array.from(ta), label: 'Hedef ' + prof.name, color: '#222', width: 2, visible: true, profileId: prof.id}); }
      prog(++k / todo.length); await sleep(0);
    }
    if (!rows.length) { P.removeAxes(sa); return toast('Hesaplanacak veri yok'); }
    _bat = {rows, prof, t, lvl, when: Date.now()}; logOp('batch', {files: new Set(rows.map(r => r.file)).size, n: rows.length, prof: prof ? prof.name : '-', tol: t ? t.name : '-', df: dfReq}); P.fitAll(); switchView('spec'); batShow();
  });
}
function batHead() { return _bat.prof ? ['Dosya', 'Kanal', 'Süre (s)', 'RMS', 'Tepe', 'Grms (bant)', 'Grms (hedef)', 'Fark', 'Tol. dışı', 'En büyük sapma', 'SD', 'Karar'] : ['Dosya', 'Kanal', 'Süre (s)', 'RMS', 'Tepe', 'Grms (bant)', 'SD']; }
function batCells(r) { const f = (v, d = 4) => Number.isFinite(v) ? fmtNum(v, d) : '-'; const b = [r.file, r.ch + (r.unit ? ' [' + r.unit + ']' : ''), f(r.dur, 5), f(r.rms), f(r.peak), f(r.gm)]; return _bat.prof ? [...b, f(r.gt), (r.gpct > 0 ? '+' : '') + r.gpct.toFixed(1) + ' %', r.outPct.toFixed(1) + ' %', (r.maxDev > 0 ? '+' : '') + r.maxDev.toFixed(1) + ' dB @ ' + fmtNum(r.fMax, 5) + ' Hz', r.dof.toFixed(0), r.ok ? 'GEÇTİ' : 'KALDI'] : [...b, r.dof.toFixed(0)]; }
function batShow() {
  const box = $('#batBox'); if (!box || !_bat) return; const B = _bat, ok = B.rows.filter(r => r.ok).length;
  box.replaceChildren(h('div', {class: 'note'}, `${new Set(B.rows.map(r => r.file)).size} dosya, ${B.rows.length} kanal` + (B.prof ? ` · ${B.t.name} · ${B.prof.name}: ${ok}/${B.rows.length} geçti` : '')), h('div', {style: 'max-height:36vh;overflow:auto'}, tblEl(batHead(), B.rows.map(r => ({cls: B.prof && !r.ok ? 'q2' : '', cells: batCells(r)})))));
}
function batToReport() { if (!_bat) return toast('Önce toplu özeti hesaplayın'); const B = _bat; REP.items.push({type: 'table', title: 'Toplu özet' + (B.prof ? ' — ' + B.prof.name : ''), head: batHead(), rows: B.rows.map(batCells), note: B.prof ? `Tolerans kümesi: ${B.t.name}. Hedef seviye ${B.lvl >= 0 ? '+' : ''}${B.lvl} dB. Her kanalın tüm süresi tek parça Welch (Hann, %50 örtüşme) ile değerlendirildi; fazlı değerlendirme için Test sekmesini kullanın.` : 'Grms yalnız belirtilen bantta PSD integralidir; RMS ham sinyalin standart sapmasıdır.'}); repRefreshList(); toast('Rapora eklendi'); }
async function batCsv() { if (!_bat) return toast('Önce toplu özeti hesaplayın'); const q = v => '"' + String(v).replace(/"/g, '""') + '"'; const csv = '﻿' + [batHead(), ..._bat.rows.map(batCells)].map(r => r.map(q).join(';')).join('\r\n'); await saveBlob(new Blob([csv], {type: 'text/csv'}), 'toplu_ozet.csv'); }
function batCard() {
  const tplSel = h('select', {id: 'batTpl'}), refill = () => { const v = tplSel.value; tplSel.replaceChildren(h('option', {value: ''}, '(şablon uygulama)'), ...tplLoad().map((t, i) => h('option', {value: String(i)}, t.name))); tplSel.value = v; };
  refill(); tplSel.onfocus = refill;
  return card('Toplu özet (çoklu dosya)', h('div', {class: 'note'}, 'Açık tüm dosyalarda kalıba uyan kanalları aynı yöntemle işler; Grms, tepe ve (profil seçilirse) şartname uygunluğunu tek tabloda toplar, PSD’leri üst üste çizer. Kanal adları dosyadan dosyaya değiştiği için kalıp düzenli ifadedir.'),
    fr('Şablon', tplSel), fr('Kanal kalıbı (regex)', h('input', {type: 'text', id: 'batPat', placeholder: 'örn. ctrl|kontrol|ch1'})), h('div', {class: 'btns'}, btn('Kalıbı kontrol rollerinden al', () => { const n = [...new Set(roleChs('ctl').map(c => c.name))].map(reEsc).join('|'); if (!n) return toast('Önce kontrol rolü atayın (Test sekmesi)'); $('#batPat').value = n; })),
    chkIn('batVib', 'Yalnız titreşim kanalları', true), fr('Profil', h('select', {id: 'batProf'}, h('option', {value: ''}, '(yok)'), ...S.profiles.map(p => h('option', {value: p.id}, p.name)))), fr('Seviye (dB)', numIn('batLvl', 0, {step: 'any'})),
    fr('Bant (Hz) — profil yoksa', h('span', null, numIn('batF1', 20, {min: 0}), ' – ', numIn('batF2', 2000, {min: 0}))), fr('Çözünürlük (Hz)', numIn('batDf', 2.5, {min: 0.01, step: 'any'})),
    h('div', {class: 'btns'}, btn('Hesapla', async () => { const i = sv('batTpl'); if (i !== '') { const t = tplLoad()[+i]; if (t) tplApply(t); } await batchRun(); }, 'primary'), btn('Rapora ekle', batToReport), btn('CSV kaydet', batCsv)),
    h('div', {class: 'note'}, 'Tolerans kümesi, Test sekmesindeki “Tolerans şablonu” alanlarından alınır.'), h('div', {id: 'batBox'}));
}
function extraToolCards() { return [tplCard(), batCard()]; }

window.addEventListener('keydown', e => {
  const t = e.target, inp = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName), k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (e.key === 'F1') { e.preventDefault(); helpDialog('Kısayollar'); }
  else if (mod && k === 's' && !e.shiftKey) { e.preventDefault(); saveSession(); }
  else if (mod && k === 'o') { e.preventDefault(); $('#btnOpen').click(); }
  else if (mod && k === 'e') { e.preventDefault(); savePng(); }
  else if (mod && e.shiftKey && k === 'r') { e.preventDefault(); repAddView(); }
  else if (!mod && !inp && k === 'n') { e.preventDefault(); noteAtView(); }
});
