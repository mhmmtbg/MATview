/* ===== Canlı dinleme: telemetri canlı akışındaki bir parametreyi (akustik sensör) gerçek zamanlı ses olarak çalar =====
   Aç menüsünden açılan ayrı, taşınabilir bir penceredir; akustik sekmesinin arayüzünü değiştirmez. Veri telemetri
   modülünün canlı çözümünden gelir (seri port, UDP ya da dosyadan oynatma): dinlenen parametrenin her çerçevedeki tüm
   örnekleri (oversample elemanları) sırayla alınır, durumlu süzgeç zincirinden geçirilir ve kesintisiz çalınır.
   Süzgeçler ve şebeke (50/60 Hz) tespiti telemetryParser v4.8 ses modülüyle aynıdır. */
const LAUD = (() => {
  /* ---------- DSP: durumlu biquad bölümleri (doğrudan biçim II devrik) ---------- */
  const D = {};
  D.biquad = (type, f, fs, Q) => {
    f = Math.max(1, Math.min(f, fs * 0.49));
    const w = 2 * Math.PI * f / fs, cs = Math.cos(w), al = Math.sin(w) / (2 * Q); let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = 1; b1 = -2 * cs; b2 = 1; }
    const a0 = 1 + al; return {b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0, z1: 0, z2: 0};
  };
  D.butter = (type, f, fs, order) => { const n = Math.max(1, Math.round(order / 2)), N = 2 * n, r = []; for (let k = 1; k <= n; k++) r.push(D.biquad(type, f, fs, 1 / (2 * Math.sin((2 * k - 1) * Math.PI / (2 * N))))); return r; };
  D.AUTO_HP = 20; D.autoLp = fs => Math.min(8000, fs * 0.4); D.NOTCH_Q = 30;
  D.chain = (c, fs, mains) => {
    let s = []; const ord = 2 * Math.max(1, Math.min(8, Math.round(c.ord || 2))), ny = fs / 2;
    if (c.auto) { s = s.concat(D.butter('hp', D.AUTO_HP, fs, 4)); const lp = D.autoLp(fs); if (mains) mains.harm.forEach(hh => { const f = hh * mains.f0; if (f < Math.min(lp, ny * 0.95)) s.push(D.biquad('notch', f, fs, D.NOTCH_Q)); }); s = s.concat(D.butter('lp', lp, fs, 4)); }
    if ((c.type === 'bp' || c.type === 'hp') && c.f1 > 0 && c.f1 < ny) s = s.concat(D.butter('hp', c.f1, fs, ord));
    if ((c.type === 'bp' || c.type === 'lp') && c.f2 > 0 && c.f2 < ny * 0.98) s = s.concat(D.butter('lp', c.f2, fs, ord));
    return s;
  };
  D.run = (secs, x) => { for (const q of secs) { const {b0, b1, b2, a1, a2} = q; let z1 = q.z1, z2 = q.z2; for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + z1; z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y; x[i] = y; } q.z1 = isFinite(z1) ? z1 : 0; q.z2 = isFinite(z2) ? z2 : 0; } return x; };
  D.mean = x => { let s = 0; for (const v of x) s += v; return x.length ? s / x.length : 0; };
  D.peak = x => { let p = 0; for (const v of x) { const a = Math.abs(v); if (a > p) p = a; } return p; };
  const goertzel = (x, fs, f) => { const w = 2 * Math.PI * f / fs, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < x.length; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; } return s1 * s1 + s2 * s2 - c * s1 * s2; };
  // şebeke gürültüsü: 50 / 60 Hz temel ve harmonikleri komşu frekanslarla karşılaştırılır; belirgin olan seçilir
  D.detectMains = (x, fs) => {
    const N = Math.min(x.length, Math.round(fs * 4), 262144); if (N < fs * 0.4 || fs < 200) return null;
    const o = Math.floor((x.length - N) / 2), y = new Float64Array(N); let m = 0; for (let i = 0; i < N; i++) m += x[o + i]; m /= N;
    for (let i = 0; i < N; i++) y[i] = (x[o + i] - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
    const ny = fs / 2, dn = Math.max(4, 3 * fs / N);
    const ratio = f => { const p = goertzel(y, fs, f); let nb = 0, c = 0; for (const k of [-2.2, -1.8, -1.4, -1, 1, 1.4, 1.8, 2.2]) { const g = f + k * dn; if (g > 1 && g < ny) { nb += goertzel(y, fs, g); c++; } } return c ? p / Math.max(nb / c, 1e-30) : 0; };
    let best = null;
    for (const base of [50, 60]) {
      let f0 = base, bp = -1;
      for (let d = -0.6; d <= 0.6001; d += 0.1) { const f = base + d; let p = 0; for (let hh = 1; hh <= 3 && hh * f < ny * 0.95; hh++) p += goertzel(y, fs, hh * f); if (p > bp) { bp = p; f0 = f; } }
      let score = 0, top = 0; const harm = [];
      for (let hh = 1; hh <= 10 && hh * f0 < ny * 0.9; hh++) { const q = ratio(hh * f0); if (hh <= 6) score += Math.log10(Math.max(q, 1)); if (hh <= 3 && q > top) top = q; if (q > 3) harm.push(hh); }
      if (top > 8 && score > 3 && (!best || score > best.score)) best = {f0: +f0.toFixed(2), base, harm, score};
    }
    return best;
  };
  D.spectrum = (x, fs) => { if (x.length < 64) return null; let n = 4096; while (n > 256 && n > x.length) n >>= 1; if (n > x.length) n = 1 << Math.floor(Math.log2(x.length));
    const segs = Math.max(1, Math.min(24, Math.floor(x.length / n))), step = segs > 1 ? (x.length - n) / (segs - 1) : 0, acc = new Float64Array(n / 2 + 1), w = new Float64Array(n); let ws = 0;
    for (let i = 0; i < n; i++) { w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); ws += w[i] * w[i]; }
    for (let s = 0; s < segs; s++) { const o = Math.round(s * step); let m = 0; for (let i = 0; i < n; i++) m += x[o + i]; m /= n; const re = new Float64Array(n), im = new Float64Array(n); for (let i = 0; i < n; i++) re[i] = (x[o + i] - m) * w[i]; DSP.fft(re, im); for (let i = 0; i <= n / 2; i++) acc[i] += re[i] * re[i] + im[i] * im[i]; }
    const db = new Float32Array(n / 2 + 1); for (let i = 0; i <= n / 2; i++) db[i] = 10 * Math.log10(acc[i] / (segs * ws) + 1e-24); return {df: fs / n, db}; };

  /* ---------- durum ---------- */
  const KEY = 'matview.liveAudio';
  const TYPES = [['off', 'Kapalı'], ['bp', 'Bant geçiren'], ['lp', 'Alçak geçiren'], ['hp', 'Yüksek geçiren']];
  let cfg = {key: '', sr: 25000, srAuto: true, k: 1, norm: true, type: 'off', f1: 300, f2: 3000, ord: 3, auto: true, vol: 0.6};
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (_) {} };
  let win = null, ctx = null, gain = null, A = null, timer = 0;
  const TL = () => { try { return TLM.ready && TLM.win && TLM.win.TPLive ? TLM.win.TPLive : null; } catch (_) { return null; } };
  const hz = f => f >= 1000 ? (+(f / 1000).toFixed(f >= 10000 ? 1 : 2)) + ' kHz' : Math.round(f) + ' Hz';
  const FMIN = 10, SL = 1000, ny = () => Math.max(FMIN * 2, cfg.sr / 2);
  const toSl = f => Math.round(SL * Math.log(Math.max(FMIN, Math.min(ny(), f)) / FMIN) / Math.log(ny() / FMIN));
  const fromSl = v => FMIN * Math.pow(ny() / FMIN, v / SL);
  const q = s => win.querySelector(s);

  function build() {
    win = h('div', {id: 'laWin', class: 'la-win hidden', role: 'dialog', 'aria-label': 'Canlı dinle'});
    win.innerHTML = `<div class="la-h"><b>Canlı dinle</b><span class="la-sub">akustik sensör · telemetri canlı akışı</span><span class="la-flex"></span><button class="la-x noic" type="button" title="Kapat (dinleme sürer)">×</button></div>
<div class="la-b">
  <label class="la-r"><span>Sinyal</span><select class="la-sig"></select></label>
  <div class="la-g"><label>Örnekleme (Hz)<input class="la-sr mono" type="text"></label><label class="la-cb"><input type="checkbox" class="la-sra"> gelen hızdan</label><label>Katsayı<input class="la-k mono" type="text"></label></div>
  <div class="la-g"><label class="la-cb"><input type="checkbox" class="la-norm"> Seviyeyi normalize et</label><label class="la-vl">Ses<input type="range" class="la-vol" min="0" max="1" step="0.01"></label></div>
  <div class="la-btns"><button type="button" class="primary noic la-play">▶ Dinle</button><button type="button" class="noic la-stop">■ Durdur</button></div>
  <div class="la-st"></div><div class="la-err"></div>
  <div class="la-hd">Gürültü temizleme</div>
  <div class="seg la-seg">${TYPES.map(t => `<button type="button" class="noic" data-ft="${t[0]}">${t[1]}</button>`).join('')}</div>
  <div class="la-s" data-row="f1"><span>Alt frekans</span><input type="range" min="0" max="${SL}" class="la-f1"><b class="mono la-v1"></b></div>
  <div class="la-s" data-row="f2"><span>Üst frekans</span><input type="range" min="0" max="${SL}" class="la-f2"><b class="mono la-v2"></b></div>
  <div class="la-s" data-row="ord"><span>Yoğunluk</span><input type="range" min="1" max="8" step="1" class="la-ord"><b class="mono la-vo"></b></div>
  <div class="la-auto"><label class="la-cb"><input type="checkbox" class="la-au"> Oto temizleme</label><span class="la-ai"></span></div>
  <canvas class="la-spec" width="372" height="96"></canvas>
  <div class="la-note">Gri: ham · renkli: temizlenmiş · kesikli: şebeke harmonikleri. Veri Telemetri'de <b>Oynat / Bağlan</b> ile akarken çalınır.</div>
</div>`;
    document.body.append(win);
    // sürükle
    let dr = null; q('.la-h').addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const r = win.getBoundingClientRect(); dr = {x: e.clientX - r.left, y: e.clientY - r.top}; q('.la-h').setPointerCapture(e.pointerId); });
    q('.la-h').addEventListener('pointermove', e => { if (!dr) return; win.style.left = Math.max(0, Math.min(innerWidth - 120, e.clientX - dr.x)) + 'px'; win.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - dr.y)) + 'px'; win.style.right = 'auto'; });
    q('.la-h').addEventListener('pointerup', () => { dr = null; });
    q('.la-x').onclick = () => win.classList.add('hidden');
    q('.la-sig').onchange = e => { cfg.key = e.target.value; save(); if (A) start(); };
    q('.la-sr').onchange = e => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (v >= 100 && v <= 384000) { cfg.sr = v; cfg.srAuto = false; q('.la-sra').checked = false; save(); rebuild(); } ui(); };
    q('.la-sra').onchange = e => { cfg.srAuto = e.target.checked; save(); ui(); };
    q('.la-k').onchange = e => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (isFinite(v)) { cfg.k = v; save(); } ui(); };
    q('.la-norm').onchange = e => { cfg.norm = e.target.checked; save(); };
    q('.la-vol').oninput = e => { cfg.vol = +e.target.value; if (gain) gain.gain.value = cfg.vol; save(); };
    q('.la-play').onclick = () => start();
    q('.la-stop').onclick = () => stop();
    q('.la-seg').onclick = e => { const b = e.target.closest('button[data-ft]'); if (!b) return; cfg.type = b.dataset.ft; save(); rebuild(); ui(); };
    q('.la-f1').oninput = e => { cfg.f1 = fromSl(+e.target.value); save(); rebuild(); ui(); };
    q('.la-f2').oninput = e => { cfg.f2 = fromSl(+e.target.value); save(); rebuild(); ui(); };
    q('.la-ord').oninput = e => { cfg.ord = +e.target.value; save(); rebuild(); ui(); };
    q('.la-au').onchange = e => { cfg.auto = e.target.checked; save(); rebuild(); ui(); };
  }
  function signals() {
    const T = TL(), sel = q('.la-sig'); let list = [];
    try { list = T && T.audioSignals ? T.audioSignals() : []; } catch (_) {}
    sel.innerHTML = list.length ? '' : '<option value="">(telemetri template’i yüklü değil)</option>';
    const groups = new Map(); for (const s of list) { if (!groups.has(s.ft)) groups.set(s.ft, []); groups.get(s.ft).push(s); }
    for (const [ft, arr] of groups) { const og = document.createElement('optgroup'); og.label = ft; for (const s of arr) { const o = document.createElement('option'); o.value = s.key; o.textContent = s.name + (s.n > 1 ? `  (${s.n} örnek/çerçeve)` : ''); og.append(o); } sel.append(og); }
    if (list.length) { if (!list.some(s => s.key === cfg.key)) { const ac = list.find(s => /ses|mic|akust|acou|as\d|pa\b/i.test(s.name)) || list.find(s => s.n > 1) || list[0]; cfg.key = ac.key; } sel.value = cfg.key; }
  }
  function ui() {
    if (!win) return;
    const n2 = cfg.sr / 2; cfg.f1 = Math.min(cfg.f1, n2 * 0.95); cfg.f2 = Math.min(cfg.f2, n2 * 0.98);
    if (document.activeElement !== q('.la-sr')) q('.la-sr').value = +(+cfg.sr).toFixed(1);
    q('.la-sra').checked = !!cfg.srAuto; q('.la-k').value = cfg.k; q('.la-norm').checked = !!cfg.norm; q('.la-vol').value = cfg.vol; q('.la-au').checked = !!cfg.auto;
    win.querySelectorAll('.la-seg button').forEach(b => b.classList.toggle('active', b.dataset.ft === cfg.type));
    win.querySelector('[data-row=f1]').classList.toggle('hidden', !(cfg.type === 'bp' || cfg.type === 'hp'));
    win.querySelector('[data-row=f2]').classList.toggle('hidden', !(cfg.type === 'bp' || cfg.type === 'lp'));
    win.querySelector('[data-row=ord]').classList.toggle('hidden', cfg.type === 'off');
    q('.la-f1').value = toSl(cfg.f1); q('.la-f2').value = toSl(cfg.f2); q('.la-ord').value = cfg.ord;
    q('.la-v1').textContent = hz(cfg.f1); q('.la-v2').textContent = hz(cfg.f2); q('.la-vo').textContent = cfg.ord + ' · ' + cfg.ord * 12 + ' dB/okt';
    const m = A && A.mains;
    q('.la-ai').textContent = !cfg.auto ? '' : 'DC + ' + D.AUTO_HP + ' Hz altı + ' + hz(D.autoLp(cfg.sr)) + ' üstü' + (m ? ' + ' + m.f0 + ' Hz şebeke (' + m.harm.length + ' harmonik)' : m === null ? ' · şebeke gürültüsü yok' : '');
    q('.la-play').classList.toggle('on', !!A); q('.la-play').textContent = A ? '● Dinleniyor' : '▶ Dinle';
    status();
  }
  function status(t) {
    if (!win) return; const el = q('.la-st');
    if (t == null) {
      const T = TL(), live = T && T.audioPull ? T.connState && T.connState() : '';
      if (!A) t = live === 'connected' ? 'Akış var · ▶ Dinle ile başlayın' : 'Telemetri akışı yok: Telemetri’de Oynat (dosya) ya da Bağlan (seri port / UDP)';
      else { const lag = ctx ? Math.max(0, A.next - ctx.currentTime) : 0; t = A.rate ? 'Gelen ' + fmtCnt(Math.round(A.rate)) + ' örnek/sn · gecikme ' + lag.toFixed(2) + ' sn' + (A.drop ? ' · ' + fmtCnt(A.drop) + ' örnek atlandı' : '') + (!cfg.srAuto && Math.abs(A.rate - cfg.sr) > cfg.sr * 0.1 ? ' · örnekleme hızı gelenden farklı' : '') : (A.wait ? 'Veri bekleniyor…' : ''); }
    }
    if (el.textContent !== t) el.textContent = t;
  }
  function rebuild() { if (A) A.chain = D.chain(cfg, cfg.sr, cfg.auto ? A.mains : null); }
  function start() {
    q('.la-err').textContent = '';
    const T = TL(); if (!T || !T.audioTap) { q('.la-err').textContent = 'Telemetri modülü yüklü değil: önce telemetri ayarlarını / template’i açın.'; return; }
    if (!cfg.key) { signals(); if (!cfg.key) { q('.la-err').textContent = 'Dinlenecek sinyal yok.'; return; } }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { q('.la-err').textContent = 'Bu pencerede Web Audio yok.'; return; }
    if (!ctx || ctx.state === 'closed') { ctx = new AC(); gain = ctx.createGain(); gain.connect(ctx.destination); }
    gain.gain.value = cfg.vol; if (ctx.state === 'suspended') { try { ctx.resume(); } catch (_) {} }
    stop(true);
    if (!T.audioTap(cfg.key)) { q('.la-err').textContent = 'Seçilen sinyal canlı çözümde bulunamadı.'; return; }
    A = {next: 0, mains: undefined, chain: null, dc: null, pk: 0, hist: [], histN: 0, rate: 0, rt: performance.now(), rn: 0, drop: 0, lastDet: 0, lastSpec: 0, srSet: !cfg.srAuto, wait: true, c0: ctx.currentTime, t0: performance.now()};
    rebuild(); timer = setInterval(tick, 50); ui();
  }
  function stop(silent) {
    clearInterval(timer); timer = 0;
    const T = TL(); try { T && T.audioTap && T.audioTap(null); } catch (_) {}
    if (A && A.srcs) for (const s of A.srcs) { try { s.onended = null; s.stop(); } catch (_) {} }
    A = null; if (!silent) ui();
  }
  const join = (list, n) => { const out = new Float32Array(n); let o = n; for (let i = list.length - 1; i >= 0 && o > 0; i--) { const b = list[i], k = Math.min(b.length, o); out.set(b.subarray(b.length - k), o - k); o -= k; } return o ? out.subarray(o) : out; };
  function tick() {
    const T = TL(); if (!A || !T) return;
    const r = T.audioPull(), now = performance.now();
    if (!r) { stop(); return; }
    A.rn += r.length;
    if (now - A.rt > 1000) { A.rate = A.rn * 1000 / (now - A.rt); A.rn = 0; A.rt = now;
      // örnekleme hızı gelen veriden (ilk ölçümde ve %5'ten fazla değişince)
      if (cfg.srAuto && A.rate >= 100 && (!A.srSet || Math.abs(A.rate - cfg.sr) > cfg.sr * 0.05)) { cfg.sr = Math.round(A.rate); A.srSet = true; save(); rebuild(); ui(); }
    }
    if (!r.length) { status(); return; }
    A.wait = false;
    if (ctx.currentTime - A.c0 < 0.05 && now - A.t0 > 1500 && !A.warned) { A.warned = true; q('.la-err').textContent = 'Ses çıkışı başlamadı (ses aygıtı açılamadı ya da askıda). ▶ Dinle’ye yeniden basın; olmazsa Windows ses çıkışını denetleyin.'; }
    const sr = cfg.sr, x = r;
    A.hist.push(x); A.histN += x.length; while (A.hist.length > 1 && A.histN - A.hist[0].length > sr * 4) A.histN -= A.hist.shift().length;
    if (cfg.auto && (A.mains === undefined || now - A.lastDet > 5000) && A.histN >= sr * 0.5) { A.lastDet = now; const m = D.detectMains(join(A.hist, A.histN), sr), ch = JSON.stringify(m) !== JSON.stringify(A.mains); A.mains = m; if (ch) { rebuild(); ui(); } }
    const y = Float32Array.from(x);
    if (cfg.auto) { const mu = D.mean(y); A.dc = A.dc == null ? mu : A.dc + (mu - A.dc) * 0.05; for (let i = 0; i < y.length; i++) y[i] -= A.dc; }
    D.run(A.chain, y);
    const p = D.peak(y); A.pk = Math.max(p, A.pk * Math.pow(0.5, y.length / sr / 2));
    const g = (cfg.norm && A.pk > 0 ? 0.9 / A.pk : 1) * cfg.k; for (let j = 0; j < y.length; j++) { const v = y[j] * g; y[j] = v > 1 ? 1 : v < -1 ? -1 : v; }
    if (A.next < ctx.currentTime + 0.02) A.next = ctx.currentTime + 0.12;
    if (A.next - ctx.currentTime > 1.5) A.drop += y.length;
    else {
      const m = sr < 8000 ? Math.ceil(8000 / sr) : 1, buf = ctx.createBuffer(1, Math.max(1, y.length * m), sr * m), d = buf.getChannelData(0);
      if (m === 1) d.set(y); else for (let i = 0; i < y.length; i++) { const a0 = y[i], b0 = i + 1 < y.length ? y[i + 1] : a0; for (let j = 0; j < m; j++) d[i * m + j] = a0 + (b0 - a0) * j / m; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(gain); src.start(A.next); A.next += y.length / sr;
      (A.srcs || (A.srcs = [])).push(src); src.onended = () => { const k = A && A.srcs ? A.srcs.indexOf(src) : -1; if (k >= 0) A.srcs.splice(k, 1); };
    }
    if (now - A.lastSpec > 500 && !win.classList.contains('hidden')) { A.lastSpec = now; const raw = join(A.hist, Math.min(A.histN, sr)); const yy = Float32Array.from(raw), ch2 = D.chain(cfg, sr, cfg.auto ? A.mains : null); if (cfg.auto) { const mu = D.mean(yy); for (let i = 0; i < yy.length; i++) yy[i] -= mu; } D.run(ch2, yy); draw(D.spectrum(raw, sr), D.spectrum(yy, sr), A.mains); }
    status();
  }
  function draw(raw, out, mains) {
    const cv = q('.la-spec'); if (!cv) return;
    const dpr = devicePixelRatio || 1, W = 372, H = 96; if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    const g = cv.getContext('2d'), cs = getComputedStyle(document.documentElement), col = n => cs.getPropertyValue(n).trim();
    const n2 = cfg.sr / 2, lx = f => W * Math.log(Math.max(FMIN, f) / FMIN) / Math.log(n2 / FMIN);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.fillStyle = col('--panel') || '#fff'; g.fillRect(0, 0, W, H);
    const lo = cfg.type === 'bp' || cfg.type === 'hp' ? cfg.f1 : FMIN, hi = cfg.type === 'bp' || cfg.type === 'lp' ? cfg.f2 : n2;
    if (cfg.type !== 'off') { g.fillStyle = col('--accent') || '#0072BD'; g.globalAlpha = 0.08; g.fillRect(lx(lo), 0, lx(hi) - lx(lo), H); g.globalAlpha = 1; }
    g.strokeStyle = col('--border') || '#ddd'; g.lineWidth = 1; g.font = '10px sans-serif'; g.fillStyle = col('--muted') || '#888';
    for (const f of [100, 1000, 10000]) { if (f >= n2) continue; const x = Math.round(lx(f)) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.fillText(hz(f), x + 2, H - 3); }
    if (mains && cfg.auto) { g.save(); g.setLineDash([2, 3]); g.strokeStyle = '#D95319'; for (const hh of mains.harm) { const x = Math.round(lx(hh * mains.f0)) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H - 12); g.stroke(); } g.restore(); }
    if (!raw) { g.fillText('Spektrum için yeterli veri yok', 8, 16); return; }
    let top = -1e9; for (let i = 1; i < raw.db.length; i++) if (raw.db[i] > top) top = raw.db[i];
    const py = d => 4 + (H - 18) * Math.min(1, Math.max(0, (top - d) / 80));
    const line = (s, c, w) => { if (!s) return; g.strokeStyle = c; g.lineWidth = w; g.beginPath(); let px = -1, mn = 0; for (let j = 1; j < s.db.length; j++) { const x = Math.round(lx(j * s.df)); if (x < 0) continue; const y = py(s.db[j]); if (x === px) { if (y < mn) { mn = y; g.lineTo(x, y); } continue; } if (px < 0) g.moveTo(x, y); else g.lineTo(x, y); px = x; mn = y; } g.stroke(); };
    line(raw, col('--muted') || '#999', 1); line(out, col('--accent') || '#0072BD', 1.3);
  }
  function open() {
    if (!win) build();
    tlmEnsure();
    tlmCall(() => { signals(); ui(); });
    win.classList.remove('hidden'); signals(); ui();
    if (!timer) { const iv = setInterval(() => { if (!win || win.classList.contains('hidden') || A) { clearInterval(iv); return; } status(); }, 1000); }
  }
  return {open, stop, start, D, get state() { return A; }, get cfg() { return cfg; }};
})();
