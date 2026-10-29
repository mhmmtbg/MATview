/* ===== Faz 1: Veri kalitesi (A1) ===== */
// Kanal kümesi seçici (Kalite / Test / Araçlar sekmelerinde ortak): traces = grafikteki izler, sel = soldaki seçim, all = tüm açık dosyalar
function chsByScope(sc) {
  const out = []; const add = c => { if (c && !out.includes(c)) out.push(c); };
  if (sc === 'traces') { for (const ax of S.plot.axes) for (const t of ax.traces) if (t.ch) add(t.ch); }
  else if (sc === 'sel') { for (const c of chsFromSel()) add(c); }
  else for (const f of allFiles()) for (const c of f.channels) add(c);
  return out;
}
const tblEl = (head, rows, cls) => h('table', {class: 'tbl ' + (cls || '')}, h('thead', null, h('tr', null, ...head.map(x => h('th', null, x)))), h('tbody', null, ...rows.map(r => h('tr', {class: r.cls || ''}, ...(r.cells || r).map(c => c instanceof Node ? h('td', null, c) : h('td', null, String(c)))))));
const QCFG = (() => { let c = {clip: 0.1, jump: 8, stuck: 1, lost: 0}; try { Object.assign(c, JSON.parse(localStorage.getItem('mv.qcfg') || '{}')); } catch (_) {} return c; })();
function qualCfgSave() { try { localStorage.setItem('mv.qcfg', JSON.stringify(QCFG)); } catch (_) {} }

// Tek kanal için kalite ölçüleri (silinen noktalar hariç tutulur)
async function qualMetrics(ch, cfg) {
  cfg = cfg || QCFG; await ensureLoaded(ch); const d = ch.data, del = ch.del, n = ch.n, sig = ['vib', 'ac', 'strain', 'press', 'volt', 'curr', 'pos', 'temp', 'calc', 'feat'].includes(ch.kind) || ch.kind === 'other';
  let cnt = 0, nan = 0, inf = 0, ndel = 0, mean = 0, M2 = 0, mn = Infinity, mx = -Infinity, run = 1, runMax = 1, prev = NaN;
  for (let i = 0; i < n; i++) {
    if (del && del[i]) { ndel++; prev = NaN; run = 1; continue; } const v = d[i];
    if (v !== v) { nan++; prev = NaN; run = 1; continue; } if (v === Infinity || v === -Infinity) { inf++; prev = NaN; run = 1; continue; }
    cnt++; const dl = v - mean; mean += dl / cnt; M2 += dl * (v - mean); if (v < mn) mn = v; if (v > mx) mx = v;
    if (v === prev) { if (++run > runMax) runMax = run; } else run = 1; prev = v;
  }
  const std = cnt > 1 ? Math.sqrt(M2 / (cnt - 1)) : 0, rng = mx - mn, flat = cnt > 1 && rng === 0;
  // kırpılma: üst/alt uçta ardışık ≥3 örnek
  let clip = 0, jumps = 0, jthr = 0;
  if (cnt > 10 && rng > 0) {
    // kırpılma: uç değerde yığılma — tam uç değerdeki örnek sayısı, hemen altındaki (aralığın %1'i) örneklerden çok büyükse
    const tol = rng * 1e-9, band = rng * 0.01; let eMax = 0, nMax = 0, eMin = 0, nMin = 0, pMax = 0, pMin = 0, pv = NaN;
    for (let i = 0; i < n; i++) { if (del && del[i]) continue; const v = d[i]; if (v !== v) continue;
      if (mx - v <= tol) { eMax++; if (mx - pv <= tol) pMax++; } else if (mx - v <= band) nMax++; if (v - mn <= tol) { eMin++; if (pv - mn <= tol) pMin++; } else if (v - mn <= band) nMin++; pv = v; }
    if (eMax >= 3 && eMax > 5 * nMax && pMax >= 1) clip += eMax; if (eMin >= 3 && eMin > 5 * nMin && pMin >= 1) clip += eMin; // ardışık uç örnek şartı: periyodik sinyallerin tam tepe değerine denk gelmesini ayıklar
    // sıçrama: ardışık fark, MAD tabanlı eşik
    const step = Math.max(1, Math.floor(n / 20000)), df = []; for (let i = 1; i < n; i += step) { if (del && (del[i] || del[i - 1])) continue; const a = d[i], b = d[i - 1]; if (isFinite(a) && isFinite(b)) df.push(Math.abs(a - b)); }
    df.sort((a, b) => a - b); const mad = df.length ? df[df.length >> 1] : 0; jthr = cfg.jump * (mad / 0.6745); // |Δ| medyanı ≈ 0.6745·σΔ → σΔ ≈ medyan/0.6745
    if (mad > 0) { let last = -9; for (let i = 1; i < n; i++) { if (del && (del[i] || del[i - 1])) continue; const a = d[i], b = d[i - 1]; if (a === a && b === b && Math.abs(a - b) > jthr) { if (i - last > 2) jumps++; last = i; } } }
  }
  let lost = 0, lostPct = 0, gaps = 0; if (ch.g && ch.g.length > 1) { const g = ch.g; for (let k = 1; k < g.length; k++) { const gp = g[k] - g[k - 1] - 1; if (gp > 0) { lost += gp; gaps++; } } lostPct = 100 * lost / (g[g.length - 1] - g[0] + 1); }
  const clipPct = cnt ? 100 * clip / cnt : 0, stuckPct = cnt ? 100 * runMax / cnt : 0, flags = []; let lvl = 0;
  const bad = t => { flags.push(t); lvl = 2; }, warn = t => { flags.push(t); lvl = Math.max(lvl, 1); };
  if (n === 0 || cnt === 0) bad('veri yok');
  if (nan) bad('NaN ' + nan); if (inf) bad('Inf ' + inf);
  if (flat && ch.kind !== 'state') (ch.kind === 'other' || ch.kind === 'feat' ? warn : bad)('sabit kanal (değişmiyor)');
  if (clipPct > cfg.clip) (clipPct > cfg.clip * 10 ? bad : warn)('kırpılma %' + clipPct.toFixed(2));
  if (jumps) warn('sıçrama ×' + jumps);
  if ((ch.kind === 'vib' || ch.kind === 'ac') && !flat && runMax >= 100 && stuckPct > cfg.stuck) warn('takılı değer %' + stuckPct.toFixed(1));
  if (lost > cfg.lost) warn('kayıp paket ' + lost + ' (%' + lostPct.toFixed(3) + ')');
  if (ndel) flags.push('silinen ' + ndel);
  const fs = ch.fs, ratio = std > 0 ? Math.abs(mean) / std : 0;
  return {ch, n, cnt, nan, inf, ndel, mean, std, rms: Math.sqrt(mean * mean + std * std), mn, mx, fs, dur: n / fs, clipPct, jumps, stuckPct, lost, lostPct, gaps, dcRatio: ratio, flags, lvl, flat, sig, thr: jthr};
}
let _qRes = [];
async function qualRun(chs, prog) {
  const out = []; let k = 0; for (const ch of chs) { if (S.cancel) break; try { out.push(await qualMetrics(ch)); } catch (e) { out.push({ch, flags: ['okunamadı: ' + (e.message || e)], lvl: 2, n: ch.n || 0}); } if (prog) prog(++k / chs.length); await sleep(0); }
  return out;
}
function qualHead() { return ['Dosya', 'Kanal', 'Durum', 'Sorun', 'N', 'fs (Hz)', 'Süre (s)', 'Min', 'Maks', 'Ort', 'RMS', 'Std', 'DC/σ', 'Kırpılma %', 'Sıçrama', 'Kayıp paket']; }
function qualRows(res, only) {
  return res.filter(r => !only || r.lvl > 0).map(r => { const c = r.ch, f = x => x == null || !isFinite(x) ? '-' : fmtNum(x, 5); return [c.file ? c.file.name : '', c.name, ['Tamam', 'Uyarı', 'Hata'][r.lvl], r.flags.join('; ') || '-', r.n, r.fs ? fmtNum(r.fs, 6) : '-', r.dur ? fmtNum(r.dur, 5) : '-', f(r.mn), f(r.mx), f(r.mean), f(r.rms), f(r.std), r.dcRatio != null ? r.dcRatio.toFixed(2) : '-', r.clipPct != null ? r.clipPct.toFixed(3) : '-', r.jumps ?? '-', r.lost ?? '-']; });
}
function qualShow(res) {
  _qRes = res; const only = ck('qOnly'), box = $('#qBox'); box.replaceChildren();
  const nb = res.filter(r => r.lvl === 2).length, nw = res.filter(r => r.lvl === 1).length;
  box.append(h('div', {class: 'note'}, `${res.length} kanal: ${res.length - nb - nw} tamam · ${nw} uyarı · ${nb} hata`));
  const rows = res.filter(r => !only || r.lvl > 0).sort((a, b) => b.lvl - a.lvl).map(r => { const c = r.ch, nm = h('a', {href: '#', onclick: e => { e.preventDefault(); addToNewAxes([c], true); }}, c.name); return {cls: 'q' + r.lvl, cells: [c.file ? c.file.name : '', nm, ['Tamam', 'Uyarı', 'Hata'][r.lvl], r.flags.join('; ') || '-', r.n, r.fs ? fmtNum(r.fs, 5) : '-', r.rms != null ? fmtNum(r.rms, 4) : '-', r.clipPct != null ? r.clipPct.toFixed(3) : '-']}; });
  box.append(h('div', {style: 'max-height:42vh;overflow:auto'}, tblEl(['Dosya', 'Kanal', 'Durum', 'Sorun', 'N', 'fs', 'RMS', 'Kırp.%'], rows)));
}
async function qualClick() {
  QCFG.clip = num('qClip'); QCFG.jump = num('qJump'); QCFG.stuck = num('qStuck'); QCFG.lost = num('qLost'); qualCfgSave();
  const chs = chsByScope(sv('qScope')); if (!chs.length) return toast('Bu kapsamda kanal yok');
  await busy('Veri kalitesi denetleniyor…', async prog => { const res = await qualRun(chs, prog); qualShow(res); (S.methodLog = S.methodLog || []).push({t: Date.now(), op: 'quality', n: res.length, cfg: Object.assign({}, QCFG)}); }, {cancel: true});
}
function qualToReport() { if (!_qRes.length) return toast('Önce kalite kontrolü yapın'); const only = ck('qOnly'); REP.items.push({type: 'table', title: 'Veri kalitesi denetimi', head: ['Dosya', 'Kanal', 'Durum', 'Sorun', 'N', 'fs (Hz)', 'RMS', 'Kırpılma %'], rows: qualRows(_qRes, only).map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[10], r[13]]), note: `Eşikler: kırpılma > %${QCFG.clip}, sıçrama > ${QCFG.jump}σ(Δ), kayıp paket > ${QCFG.lost}. Silinen noktalar hesaba katılmaz.`}); repRefreshList(); toast('Rapora eklendi'); }
async function qualCopy() { if (!_qRes.length) return toast('Önce kalite kontrolü yapın'); try { await navigator.clipboard.writeText([qualHead(), ...qualRows(_qRes, ck('qOnly'))].map(r => r.join('\t')).join('\n')); toast('Tablo panoya kopyalandı'); } catch (e) { toast('Kopyalanamadı: ' + e.message); } }
function qualSelectBad() { S.selCh.clear(); for (const r of _qRes) if (r.lvl > 0) S.selCh.add(r.ch.uid); renderTree(); updateSelInfo(); toast(S.selCh.size + ' sorunlu kanal seçildi'); }
function qualCsv() { if (!_qRes.length) return toast('Önce kalite kontrolü yapın'); const q = s => '"' + String(s).replace(/"/g, '""') + '"'; saveBlob(new Blob(['﻿' + [qualHead(), ...qualRows(_qRes, false)].map(r => r.map(q).join(';')).join('\n')], {type: 'text/csv'}), 'veri_kalitesi.csv'); }
function buildQual() {
  const r = h('div');
  r.append(card('Veri kalitesi denetimi',
    fr('Kapsam', selIn('qScope', [['traces', 'Grafikteki izler'], ['sel', 'Soldaki seçili kanallar'], ['all', 'Tüm açık dosyalar']], 'all')),
    fr('Kırpılma sınırı (%)', numIn('qClip', QCFG.clip, {min: 0, step: 0.05})), fr('Sıçrama eşiği (× σΔ)', numIn('qJump', QCFG.jump, {min: 3, step: 1})),
    fr('Takılı değer sınırı (%)', numIn('qStuck', QCFG.stuck, {min: 0, step: 0.5})), fr('Kayıp paket sınırı', numIn('qLost', QCFG.lost, {min: 0, step: 1})),
    chkIn('qOnly', 'Yalnızca sorunlu kanalları göster', false), chkIn('qAuto', 'Dosya açılınca otomatik denetle (küçük dosyalar)', QCFG.auto !== false),
    h('div', {class: 'btns'}, btn('Denetle', qualClick, 'primary'), btn('Sorunluları seç', qualSelectBad), btn('Rapora ekle', qualToReport), btn('Tabloyu kopyala', qualCopy), btn('CSV kaydet', qualCsv)),
    h('div', {class: 'note'}, 'Kontroller: NaN/Inf, sabit kanal, kırpılma (uçta ≥3 ardışık örnek), sıçrama (ardışık fark MAD tabanlı), takılı değer, kayıp paket. Silinen noktalar dışarıda bırakılır.'),
    h('div', {id: 'qBox'})));
  return r;
}
// Dosya açılınca küçük dosyalar için otomatik denetim; yalnızca sorun varsa bildirir
async function qualAuto(files) {
  try { if (!files.length) return; const el = $('#qAuto'); if (el ? !el.checked : QCFG.auto === false) return; const chs = []; let tot = 0; for (const f of files) for (const c of f.channels) { tot += c.n || 0; chs.push(c); } if (!chs.length || tot > 40e6) return;
    const res = await qualRun(chs.filter(c => c.n < 8e6), null); const bad = res.filter(r => r.lvl > 0); if (!bad.length) return; _qRes = res;
    toast(`Veri kalitesi: ${bad.length} kanalda sorun (${bad.filter(r => r.lvl === 2).length} hata)`, 9000, {t: 'Göster', fn: () => { setTab('qual'); if ($('#qBox')) qualShow(_qRes); }}); } catch (e) { console.warn('qualAuto', e); }
}
