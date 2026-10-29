/* ===== Faz 4: hizalama/korelasyon (C1), olay listesi (C2), notlar (C5), şok (B4), termal (B6) ===== */
const fillGaps = (d, del) => { const n = d.length, o = new Float64Array(n); let last = NaN; for (let i = 0; i < n; i++) { const bad = (del && del[i]) || !isFinite(d[i]); if (!bad) { o[i] = d[i]; if (isNaN(last) && i) for (let k = 0; k < i; k++) o[k] = d[i]; last = i; } else o[i] = NaN; } if (isNaN(last)) return o.fill(0);
  let k = 0; while (k < n) { if (!isNaN(o[k])) { k++; continue; } let j = k; while (j < n && isNaN(o[j])) j++; const a = k ? o[k - 1] : o[j], b = j < n ? o[j] : a; for (let q = k; q < j; q++) o[q] = a + (b - a) * (q - k + 1) / (j - k + 1); k = j; } return o; };
// ortak zaman ızgarasına yeniden örnekleme (alçak geçiren + doğrusal ara değer)
async function alignGrid(chs, scope, fsT) {
  for (const c of chs) await ensureLoaded(c); const ax = activeAxes(); let ts = -Infinity, te = Infinity;
  for (const c of chs) { const [a, b] = scope === 'vis' && ax ? [Math.max(0, Math.floor(c.timeIdx(ax.xlim[0]))), Math.min(c.n, Math.ceil(c.timeIdx(ax.xlim[1])) + 1)] : [0, c.n]; ts = Math.max(ts, c.t(a)); te = Math.min(te, c.t(Math.max(a, b - 1))); }
  if (!(te > ts)) throw new Error('Kanalların ortak zaman aralığı yok');
  const fs = fsT || Math.min(...chs.map(c => c.fs)), n = Math.floor((te - ts) * fs) + 1; if (n < 4) throw new Error('Ortak aralık çok kısa'); if (n > 60e6) throw new Error('Ortak ızgara çok büyük; hızı düşürün veya aralığı daraltın');
  const out = [];
  for (const c of chs) { let d = fillGaps(c.data, c.del); if (c.fs > fs * 1.05) { d = DSP.filtfilt(DSP.design('lp', {order: 4, f1: 0.4 * fs}, c.fs), d); } const y = new Float64Array(n);
    for (let k = 0; k < n; k++) { const p = c.timeIdx(ts + k / fs), i0 = Math.max(0, Math.min(c.n - 1, Math.floor(p))), i1 = Math.min(c.n - 1, i0 + 1), fr = Math.max(0, Math.min(1, p - i0)); y[k] = d[i0] * (1 - fr) + d[i1] * fr; } out.push(y); await sleep(0); }
  return {fs, t0: ts, n, arr: out};
}
async function resampleRun() {
  const chs = chsByScope(sv('rsScope')); if (!chs.length) return toast('Kanal seçin'); const fsT = num('rsFs') || 0;
  await busy('Yeniden örnekleniyor…', async () => { const g = await alignGrid(chs, sv('rsWin'), fsT || null); const ax = activeAxes() || S.plot.addAxes();
    chs.forEach((c, i) => { const d = addDerived(c.name + '_rs' + Math.round(g.fs), g.arr[i], null, 0, true); d.kind = c.kind; d.unit = c.unit; d.dtS = 1 / g.fs; d.t0 = g.t0; if (ck('rsAdd')) ax.traces.push(makeTrace(d)); }); logOp('resample', {n: chs.length, fs: g.fs, t0: g.t0, N: g.n}); refreshAll(); toast(`${chs.length} kanal ${fmtNum(g.fs, 6)} Hz ortak ızgaraya alındı (${g.n} örnek)`); });
}
function xcorr(x, y, maxLag) { const n = x.length, N = DSP.nextPow2(2 * n), ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N); let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n; let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { ar[i] = x[i] - mx; br[i] = y[i] - my; sx += ar[i] * ar[i]; sy += br[i] * br[i]; } DSP.fft(ar, ai, false); DSP.fft(br, bi, false);
  for (let k = 0; k < N; k++) { const r = ar[k] * br[k] + ai[k] * bi[k], q = ar[k] * bi[k] - ai[k] * br[k]; ar[k] = r; ai[k] = q; } DSP.fft(ar, ai, true); const den = Math.sqrt(sx * sy) * N || 1, L = Math.min(maxLag, n - 1), lag = new Float64Array(2 * L + 1), c = new Float64Array(2 * L + 1);
  for (let l = -L; l <= L; l++) { lag[l + L] = l; c[l + L] = ar[(l + N) % N] / den; } return {lag, c, r0: ar[0] / den}; }
let _co = null;
async function corrRun() {
  const chs = chsByScope(sv('coScope')); if (chs.length < 2) return toast('En az iki kanal seçin / grafiğe ekleyin');
  await busy('Korelasyon hesaplanıyor…', async () => {
    const g = await alignGrid(chs, sv('coWin'), num('coFs') || null), ml = Math.round((num('coLag') || 1) * g.fs), nm = chs.map(c => c.name), P = specAxesReset(), sa = P.addAxes({xlog: false, ylog: false, title: 'Çapraz korelasyon (ref: ' + nm[0] + ')'}); sa.xlabel = 'Gecikme (s) — pozitif: kanal referanstan SONRA'; sa.ylabel = 'Normalize korelasyon';
    const rows = [], M = chs.map(() => new Array(chs.length).fill(1));
    for (let j = 1; j < chs.length; j++) { const r = xcorr(g.arr[0], g.arr[j], ml); let bi = 0; for (let i = 0; i < r.c.length; i++) if (Math.abs(r.c[i]) > Math.abs(r.c[bi])) bi = i;
      // parabolik ara değer
      let d = 0; if (bi > 0 && bi < r.c.length - 1) { const y0 = r.c[bi - 1], y1 = r.c[bi], y2 = r.c[bi + 1], de = y0 - 2 * y1 + y2; if (de) d = 0.5 * (y0 - y2) / de; } const lagS = (r.lag[bi] + d) / g.fs;
      sa.traces.push({kind: 'xy', x: Float64Array.from(r.lag, v => v / g.fs), y: r.c, label: nm[j], color: SUBPAL[j % SUBPAL.length], width: 1.2, visible: true, raw: r.c, scale: 'corr', srcKind: 'corr'}); rows.push([nm[j], r.r0.toFixed(3), r.c[bi].toFixed(3), lagS.toPrecision(5) + ' s']); }
    for (let i = 0; i < chs.length; i++) for (let j = i + 1; j < chs.length; j++) { const r = xcorr(g.arr[i], g.arr[j], 0); M[i][j] = M[j][i] = r.r0; }
    P.fitAll(); sa.xlog = false; switchView('spec'); const mat = h('div', {style: 'overflow:auto;max-height:36vh'}, tblEl(['', ...nm], M.map((r, i) => [nm[i], ...r.map(v => h('span', {style: `display:block;padding:1px 3px;background:rgba(${v >= 0 ? '43,108,176' : '192,57,43'},${Math.min(0.55, Math.abs(v) * 0.55)})`}, v.toFixed(2))) ])));
    _co = {nm, rows, M, fs: g.fs}; logOp('correlation', {n: chs.length, fs: g.fs, lag: num('coLag')}); $('#coBox').replaceChildren(h('div', {class: 'note'}, `Ortak ızgara ${fmtNum(g.fs, 6)} Hz, ${g.n} örnek. Gecikme işareti: referansa göre kanal (pozitif = kanal geç kalır).`), tblEl(['Kanal', 'r (gecikmesiz)', 'r (en büyük)', 'Gecikme'], rows), h('div', {style: 'height:6px'}), mat);
  });
}
function coToReport() { if (!_co) return toast('Önce hesaplayın'); REP.items.push({type: 'table', title: 'Kanal korelasyonu (referans: ' + _co.nm[0] + ')', head: ['Kanal', 'r (gecikmesiz)', 'r (en büyük)', 'Gecikme'], rows: _co.rows, note: `Ortak ızgara ${fmtNum(_co.fs, 6)} Hz; normalize çapraz korelasyon.`}); REP.items.push({type: 'table', title: 'Korelasyon matrisi (gecikmesiz)', head: ['', ..._co.nm], rows: _co.M.map((r, i) => [_co.nm[i], ...r.map(v => v.toFixed(2))]), note: ''}); repRefreshList(); toast('Rapora eklendi'); }
function lagApply() { if (!_co || !_co.rows.length) return toast('Önce korelasyonu hesaplayın'); const chs = chsByScope(sv('coScope')); if (!confirm('Kanalların t0 değeri bulunan gecikmeye göre kaydırılsın mı? (Veri değişmez; geri almak için gecikme değerini ters işaretle uygulayın.)')) return; chs.slice(1).forEach((c, i) => { const l = parseFloat(_co.rows[i][3]); if (isFinite(l)) c.t0 -= l; }); logOp('lag-apply', {n: chs.length - 1}); refreshAll(); }

/* ---------- Notlar ---------- */
S.notes = S.notes || []; (function () { try { S.notes = JSON.parse(localStorage.getItem('mv.notes') || '[]'); } catch (_) {} })();
const notesSync = () => { if (S.plot) { S.plot.notes = S.notes; S.plot.invalidate(); } };
function noteSave() { try { localStorage.setItem('mv.notes', JSON.stringify(S.notes)); } catch (_) {} notesSync(); noteList(); }
function noteAdd(t0, t1, text) { S.notes.push({t0, t1: t1 > t0 ? t1 : t0, text: text || 'Not', color: '#b45309'}); S.notes.sort((a, b) => a.t0 - b.t0); noteSave(); }
function noteDialog(t0, t1, pre) { const t = h('input', {type: 'text', id: 'ntT', value: pre || '', style: 'width:100%', placeholder: 'Örn. rezonans taraması başladı'}); modal('Not ekle', h('div', null, h('div', {class: 'note'}, `Zaman: ${fmtNum(t0, 7)}${t1 > t0 ? ' – ' + fmtNum(t1, 7) : ''} s`), t), [{t: 'Ekle', primary: true, fn: () => { noteAdd(t0, t1, t.value.trim()); }}, {t: 'Vazgeç'}]); setTimeout(() => t.focus(), 50); }
function noteAtView() { const ax = activeAxes(); if (!ax) return toast('Önce grafik açın'); const c = S.plot.cursors && S.plot.cursors.length ? S.plot.cursors : null; if (c && c.length === 2) noteDialog(Math.min(c[0].x, c[1].x), Math.max(c[0].x, c[1].x)); else if (c && c.length === 1) noteDialog(c[0].x, c[0].x); else noteDialog(ax.xlim[0], ax.xlim[1]); }
function noteList() { const b = $('#ntBox'); if (!b) return; b.replaceChildren(S.notes.length ? tblEl(['Başlangıç (s)', 'Bitiş (s)', 'Not', ''], S.notes.map((n, i) => [h('a', {href: '#', onclick: e => { e.preventDefault(); zoomTo(n.t0, n.t1); }}, fmtNum(n.t0, 7)), n.t1 > n.t0 ? fmtNum(n.t1, 7) : '-', n.text, h('button', {onclick: () => { S.notes.splice(i, 1); noteSave(); }}, '×')])) : h('div', {class: 'note'}, 'Not yok')); }
function zoomTo(t0, t1) { const ax = activeAxes() || S.plot.axes[0]; if (!ax) return; const pad = Math.max((t1 - t0) * 2, (ax.xlim[1] - ax.xlim[0]) * 0.02); S.plot.setXlim(ax, t0 - pad, Math.max(t1, t0) + pad); switchView('time'); }
function noteToReport() { if (!S.notes.length) return toast('Not yok'); REP.items.push({type: 'table', title: 'Test notları', head: ['Başlangıç (s)', 'Bitiş (s)', 'Not'], rows: S.notes.map(n => [fmtNum(n.t0, 7), n.t1 > n.t0 ? fmtNum(n.t1, 7) : '-', n.text]), note: ''}); repRefreshList(); toast('Rapora eklendi'); }

/* ---------- Olay / anomali listesi ---------- */
let _ev = [];
async function evRun() {
  const chs = chsByScope(sv('evScope')); if (!chs.length) return toast('Kanal seçin / grafiğe ekleyin');
  await busy('Olaylar aranıyor…', async prog => {
    const kS = num('evSig'), kJ = num('evJump'), gap = num('evGap') || 0, lo = parseFloat(sv('evLo')), hi = parseFloat(sv('evHi')), win = num('evWin') || 0.5, dbT = num('evDb') || 6, ax = activeAxes(), sc = sv('evRange'), out = []; let k = 0;
    for (const c of chs) { await ensureLoaded(c); const [a, b] = sc === 'vis' && ax ? [Math.max(0, Math.floor(c.timeIdx(ax.xlim[0]))), Math.min(c.n, Math.ceil(c.timeIdx(ax.xlim[1])) + 1)] : [0, c.n], d = c.data, del = c.del, ev = [];
      let m = 0, q = 0, cnt = 0; for (let i = a; i < b; i++) { if (del && del[i]) continue; const v = d[i]; if (!isFinite(v)) continue; cnt++; const dl = v - m; m += dl / cnt; q += dl * (v - m); } const sd = cnt > 1 ? Math.sqrt(q / (cnt - 1)) : 0;
      const push = (type, i0, i1, val) => { const t0 = c.t(i0), t1 = c.t(i1); const L = ev[ev.length - 1]; if (L && L.type === type && t0 - L.t1 <= gap) { L.t1 = t1; if (Math.abs(val) > Math.abs(L.val)) L.val = val; } else ev.push({type, ch: c.name, t0, t1, val}); };
      if (ck('evT1') && sd > 0) for (let i = a; i < b; i++) { if (del && del[i]) continue; const v = d[i]; if (isFinite(v) && Math.abs(v - m) > kS * sd) push(`> ${kS}σ`, i, i, v); }
      if ((isFinite(lo) || isFinite(hi)) && ck('evT2')) for (let i = a; i < b; i++) { if (del && del[i]) continue; const v = d[i]; if (isFinite(hi) && v > hi) push('üst limit', i, i, v); else if (isFinite(lo) && v < lo) push('alt limit', i, i, v); }
      if (ck('evT3')) { const step = Math.max(1, Math.floor((b - a) / 20000)), df = []; for (let i = a + 1; i < b; i += step) { const x = d[i], y = d[i - 1]; if (isFinite(x) && isFinite(y)) df.push(Math.abs(x - y)); } df.sort((p, r) => p - r); const mad = df.length ? df[df.length >> 1] / 0.6745 : 0; if (mad > 0) for (let i = a + 1; i < b; i++) { if (del && (del[i] || del[i - 1])) continue; const x = d[i], y = d[i - 1]; if (isFinite(x) && isFinite(y) && Math.abs(x - y) > kJ * mad) push('ani değişim', i - 1, i, x - y); } }
      if (ck('evT4')) { const W = Math.max(8, Math.round(win * c.fs)), nw = Math.floor((b - a) / W); let prev = null; for (let w = 0; w < nw; w++) { let s = 0, s2 = 0, nn = 0; for (let i = a + w * W; i < a + (w + 1) * W; i++) { if (del && del[i]) continue; const v = d[i]; if (!isFinite(v)) continue; s += v; s2 += v * v; nn++; } if (!nn) continue; const mm = s / nn, r = Math.sqrt(Math.max(0, s2 / nn - mm * mm)); if (prev != null && prev > 0 && r > 0) { const dbv = 20 * Math.log10(r / prev); if (Math.abs(dbv) >= dbT) push(dbv > 0 ? 'seviye artışı' : 'seviye düşüşü', a + w * W, a + (w + 1) * W, dbv); } prev = r; } }
      out.push(...ev); prog(++k / chs.length); await sleep(0); }
    out.sort((x, y) => x.t0 - y.t0); _ev = out.slice(0, 2000); logOp('events', {n: out.length, kS, kJ, win, dbT}); evShow(out.length);
  });
}
function evShow(total) { const b = $('#evBox'); if (!b) return; if (!_ev.length) return b.replaceChildren(h('div', {class: 'note'}, 'Olay bulunamadı')); const rows = _ev.slice(0, 300).map(e => [e.type, e.ch, h('a', {href: '#', onclick: x => { x.preventDefault(); zoomTo(e.t0, e.t1); }}, fmtNum(e.t0, 7)), fmtNum(e.t1, 7), fmtNum(e.val, 5), h('button', {title: 'Not ekle', onclick: () => noteDialog(e.t0, e.t1, e.type + ' — ' + e.ch)}, '✎')]);
  b.replaceChildren(h('div', {class: 'note'}, `${total} olay${total > 2000 ? ' (ilk 2000 saklandı)' : ''}${_ev.length > 300 ? ' · ilk 300 gösteriliyor' : ''}. Zamana tıklayınca grafikte gösterilir.`), h('div', {style: 'max-height:40vh;overflow:auto'}, tblEl(['Tür', 'Kanal', 'Başlangıç (s)', 'Bitiş (s)', 'Değer', ''], rows))); }
function evToReport() { if (!_ev.length) return toast('Olay yok'); REP.items.push({type: 'table', title: 'Olay / anomali listesi', head: ['Tür', 'Kanal', 'Başlangıç (s)', 'Bitiş (s)', 'Değer'], rows: _ev.slice(0, 200).map(e => [e.type, e.ch, fmtNum(e.t0, 7), fmtNum(e.t1, 7), fmtNum(e.val, 5)]), note: _ev.length > 200 ? 'İlk 200 olay.' : ''}); repRefreshList(); toast('Rapora eklendi'); }
function evNotes() { if (!_ev.length) return; for (const e of _ev.slice(0, 50)) S.notes.push({t0: e.t0, t1: e.t1, text: e.type + ' — ' + e.ch, color: '#b45309'}); S.notes.sort((a, b) => a.t0 - b.t0); noteSave(); toast('İlk ' + Math.min(50, _ev.length) + ' olay nota eklendi'); }
async function tonalRun() {
  const tr = activeTrace(), ax = activeAxes(); if (!tr) return toast('Önce bir iz seçin'); await busy('Tonal bileşenler…', async () => { const ch = tr.ch; await ensureLoaded(ch); const [a, b] = specRange(tr, ax, sv('evRange')); const seg = DSP.segment(ch.data, ch.del, a, b); if (seg.length < 1024) throw new Error('Aralık çok kısa');
    const r = DSP.welch(seg, ch.fs, {nfft: Math.min(8192, DSP.nextPow2(seg.length)), win: 'hann', overlap: 0.5, scale: 'psd', maxSeg: 4000}), L = Array.from(r.y, v => 10 * Math.log10(v + 1e-300)), prom = num('evProm') || 10, R = 20, pk = [];
    for (let i = 3; i < L.length - 3; i++) { if (!(L[i] > L[i - 1] && L[i] >= L[i + 1])) continue; const lo = Math.max(0, i - R), hi = Math.min(L.length, i + R + 1), nb = Array.from(L.slice(lo, hi)).sort((x, y) => x - y), med = nb[nb.length >> 1]; if (L[i] - med >= prom) pk.push({f: r.f[i], L: L[i], prom: L[i] - med}); }
    pk.sort((x, y) => y.prom - x.prom); const top = pk.slice(0, 15); _ev = top.map(p => ({type: 'tonal', ch: tr.label, t0: p.f, t1: p.f, val: p.prom})); logOp('tonal', {ch: ch.name, prom, n: pk.length});
    $('#evBox').replaceChildren(h('div', {class: 'note'}, `${tr.label}: ${pk.length} tonal bileşen (komşu medyana göre ≥ ${prom} dB); Δf = ${fmtNum(r.df, 4)} Hz`), tblEl(['Frekans (Hz)', 'PSD (dB re 1 birim²/Hz)', 'Belirginlik (dB)'], top.map(p => [fmtNum(p.f, 5), p.L.toFixed(1), p.prom.toFixed(1)]))); _ev = []; });
}
function toolsCards() {
  const ev = card('Olay / anomali listesi',
    fr('Kanallar', selIn('evScope', [['traces', 'Grafikteki izler'], ['sel', 'Soldaki seçili'], ['all', 'Tüm kanallar']], 'traces')), fr('Aralık', selIn('evRange', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'all')),
    chkIn('evT1', 'Ortalamadan sapma (× σ)', true), fr('σ çarpanı', numIn('evSig', 6, {min: 2, step: 0.5})), chkIn('evT2', 'Mutlak limit aşımı', false), fr('Alt / üst limit', h('input', {type: 'number', id: 'evLo', step: 'any', placeholder: 'alt'}), h('input', {type: 'number', id: 'evHi', step: 'any', placeholder: 'üst'})),
    chkIn('evT3', 'Ani değişim (ardışık fark)', true), fr('Eşik (× σΔ)', numIn('evJump', 8, {min: 3, step: 1})), chkIn('evT4', 'Seviye (RMS) değişimi', false), fr('Pencere (s) / dB', numIn('evWin', 0.5, {min: 0.01, step: 'any'}), numIn('evDb', 6, {min: 1, step: 0.5})),
    fr('Birleştirme aralığı (s)', numIn('evGap', 0.05, {min: 0, step: 'any'})),
    h('div', {class: 'btns'}, btn('Olayları bul', evRun, 'primary'), btn('Rapora ekle', evToReport), btn('İlk 50’yi nota çevir', evNotes)),
    fr('Tonal bileşen belirginliği (dB)', numIn('evProm', 10, {min: 3})), h('div', {class: 'btns'}, btn('Tonal bileşenleri bul (aktif iz)', tonalRun)), h('div', {id: 'evBox'}));
  const nt = card('Notlar / işaretler', h('div', {class: 'note'}, 'İmleç(ler) veya görünen aralık için not ekleyin; grafikte dikey çizgi ve etiket olarak görünür, oturum ve rapora girer.'), h('div', {class: 'btns'}, btn('Not ekle (imleç / görünen aralık)', noteAtView, 'primary'), btn('Rapora ekle', noteToReport), btn('Tümünü sil', () => { S.notes = []; noteSave(); })), h('div', {id: 'ntBox'})); setTimeout(noteList);
  const al = card('Yeniden örnekleme / ortak ızgara', fr('Kanallar', selIn('rsScope', [['traces', 'Grafikteki izler'], ['sel', 'Soldaki seçili'], ['all', 'Tüm kanallar']], 'traces')), fr('Zaman aralığı', selIn('rsWin', [['vis', 'Görünen aralık'], ['all', 'Ortak tüm aralık']], 'all')), fr('Hedef örnekleme hızı (Hz)', numIn('rsFs', '', {min: 0, step: 'any'})), chkIn('rsAdd', 'Sonucu grafiğe ekle', true),
    h('div', {class: 'btns'}, btn('Ortak ızgaraya yeniden örnekle', resampleRun, 'primary')), h('div', {class: 'note'}, 'Boş bırakılırsa en düşük örnekleme hızı kullanılır; yüksek hızlı kanallara önce alçak geçiren süzgeç uygulanır (4. derece Butterworth, 0,4·fs). Kayıp paketli kanallar gerçek zamanına göre yerleştirilir; silinen noktalar doğrusal doldurulur.'));
  const co = card('Kanallar arası korelasyon / gecikme', fr('Kanallar', selIn('coScope', [['traces', 'Grafikteki izler (ilk = referans)'], ['sel', 'Soldaki seçili (ilk = referans)']], 'traces')), fr('Zaman aralığı', selIn('coWin', [['vis', 'Görünen aralık'], ['all', 'Ortak tüm aralık']], 'vis')), fr('Ortak hız (Hz)', numIn('coFs', '', {min: 0})), fr('En büyük gecikme (s)', numIn('coLag', 1, {min: 0, step: 'any'})),
    h('div', {class: 'btns'}, btn('Korelasyonu hesapla', corrRun, 'primary'), btn('Rapora ekle', coToReport), btn('Gecikmeyi t0’a uygula', lagApply)), h('div', {id: 'coBox'}));
  return [al, co, ev, nt];
}
