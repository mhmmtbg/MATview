/* Kamera penceresi: sol paneldeki kamera videoları (telemetri çözümünden gelen MP4'ler ya da açılan .mp4 dosyaları)
   ayrı, taşınabilir bir pencerede oynatılır. Telemetri videolarında her karenin geldiği telemetri çerçevesi bilindiğinden
   video zamanı ↔ kanal zamanı eşlenir: oynarken Zaman grafiğinde konum çizgisi ilerler (istenirse grafik izler), video
   dururken grafikte imleç konulursa video o ana gider. */
const CAMV = (() => {
  let win = null, vid = null, cur = null, raf = 0, lastCur = null, poll = 0, mine = false;
  const q = s => win.querySelector(s);
  function build() {
    win = h('div', {id: 'cvWin', class: 'la-win cv-win hidden', role: 'dialog', 'aria-label': 'Kamera'});
    win.innerHTML = `<div class="la-h"><b class="cv-t">Kamera</b><span class="la-sub cv-sub"></span><span class="la-flex"></span><button class="la-x noic" type="button" title="Kapat">×</button></div>
<div class="la-b">
  <video class="cv-v" controls playsinline preload="auto"></video>
  <div class="la-g cv-o"><label class="la-cb" title="Oynarken Zaman grafiğinde konum çizgisi"><input type="checkbox" class="cv-sync" checked> Grafikte göster</label>
    <label class="la-cb" title="Konum çizgisi görünen aralığın dışına çıkınca grafik kaydırılır"><input type="checkbox" class="cv-follow"> Grafik izlesin</label>
    <button type="button" class="noic cv-go" title="Video, grafikteki imlecin (yoksa görünen aralığın ortasının) zamanına gider">İmlece git</button></div>
  <div class="la-st cv-st"></div>
</div>`;
    document.body.append(win);
    vid = q('.cv-v');
    q('.la-x').onclick = close;
    q('.cv-go').onclick = goCursor;
    q('.cv-sync').onchange = () => { if (!q('.cv-sync').checked) clearHead(); else tick(); };
    for (const ev of ['play', 'seeking', 'seeked', 'timeupdate', 'loadedmetadata']) vid.addEventListener(ev, () => { tick(); if (ev === 'play') loop(); });
    vid.addEventListener('error', () => { q('.cv-st').textContent = 'Video oynatılamadı: ' + ((vid.error && vid.error.message) || 'biçim desteklenmiyor'); });
    let dr = null; const hd = q('.la-h');
    hd.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const r = win.getBoundingClientRect(); dr = {x: e.clientX - r.left, y: e.clientY - r.top}; hd.setPointerCapture(e.pointerId); });
    hd.addEventListener('pointermove', e => { if (!dr) return; win.style.left = Math.max(0, Math.min(innerWidth - 80, e.clientX - dr.x)) + 'px'; win.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - dr.y)) + 'px'; win.style.right = 'auto'; });
    hd.addEventListener('pointerup', () => { dr = null; });
  }
  // video zamanı (sn) → kanal zamanı (sn) ve tersi: karelerin telemetri zamanları arasında doğrusal
  function interp(xs, ys, x) {
    const n = xs.length; if (!n) return x; if (n === 1 || x <= xs[0]) return ys[0] + (x - xs[0]); if (x >= xs[n - 1]) return ys[n - 1] + (x - xs[n - 1]);
    let a = 0, b = n - 1; while (b - a > 1) { const m = (a + b) >> 1; if (xs[m] <= x) a = m; else b = m; }
    const d = xs[b] - xs[a]; return d > 0 ? ys[a] + (ys[b] - ys[a]) * (x - xs[a]) / d : ys[a];
  }
  const vToT = (v, x) => v.sync ? interp(v.sync.vid, v.sync.tel, x) : x + (v.t0 || 0);
  const tToV = (v, t) => v.sync ? interp(v.sync.tel, v.sync.vid, t) : t - (v.t0 || 0);
  const audioOn = () => !!(S.audio && S.audio.buf && !S.audio.stopped);
  function clearHead() { if (mine && !audioOn()) { S.plot.playhead = null; S.plot.invalidate(); } mine = false; }
  function tick() {
    if (!cur || !vid) return;
    const t = vToT(cur.v, vid.currentTime || 0);
    q('.cv-st').textContent = `video ${fmtNum(vid.currentTime || 0, 5)} s · kanal zamanı ${fmtNum(t, 7)} s` + (cur.v.sync ? '' : ' (eşleme yok: video başı 0 s)');
    if (vid.seeking) q('.cv-st').textContent += ' · konuma gidiliyor…';
    if (!q('.cv-sync').checked || audioOn() || drag) return;
    S.plot.playhead = t; mine = true;
    if (q('.cv-follow').checked && !vid.paused) for (const ax of S.plot.axes) {
      const [x0, x1] = ax.xlim, w = x1 - x0; if (t < x0 || t > x1 - w * 0.05) ax.xlim = [t - w * 0.1, t + w * 0.9];
    }
    S.plot.invalidate();
  }
  function loop() { cancelAnimationFrame(raf); const f = () => { if (!vid || vid.paused || win.classList.contains('hidden')) return; tick(); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); }
  function cursorX() { const c = S.plot.cursors; return c && c.length ? c[c.length - 1].x : null; }
  function seekT(t) { if (!cur || !vid) return; const x = tToV(cur.v, t); vid.currentTime = Math.max(0, Math.min(isFinite(vid.duration) ? vid.duration : x, x)); }
  function goCursor() {
    let t = cursorX();
    if (t == null) { const ax = activeAxes() || S.plot.axes[0]; if (!ax) return toast('Grafikte imleç ya da kanal yok'); t = (ax.xlim[0] + ax.xlim[1]) / 2; }
    seekT(t);
  }
  // grafikte imleç konulur / taşınırsa video o ana gider (oynarken de; oynamaya oradan devam eder)
  function watchCursor() {
    clearInterval(poll); lastCur = cursorX();
    poll = setInterval(() => {
      if (!win || win.classList.contains('hidden')) { clearInterval(poll); return; }
      const x = cursorX(); if (x != null && x !== lastCur && !drag) seekT(x); lastCur = x;
    }, 150);
  }
  // grafikteki konum çizgisi tutulup sürüklenerek sarılır (sürüklerken video duraklar, bırakınca bıraktığı yerden sürer)
  let drag = null;
  const shown = () => !!(win && !win.classList.contains('hidden') && cur);
  function nearHead(e) {
    const P = S.plot; if (!shown() || !mine || audioOn() || P.playhead == null || S.view !== 'time' || !P.cv) return null;
    const r = P.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const ax of P.axes) { if (!ax.rect) continue; const px = P.xPx(ax, P.playhead), R = ax.rect; if (Math.abs(x - px) <= 6 && y >= R.y && y <= R.y + R.h && x >= R.x && x <= R.x + R.w) return ax; }
    return null;
  }
  function hookPlot() {
    const P = S.plot; if (!P || !P.cv || P._cvHook) return; P._cvHook = true; const cv = P.cv; let prev = null;
    cv.addEventListener('pointermove', e => {
      if (drag) return; const n = nearHead(e);
      if (n && prev === null) { prev = cv.style.cursor; cv.style.cursor = 'ew-resize'; cv.title = 'Video konumunu sürükleyin'; }
      else if (!n && prev !== null) { cv.style.cursor = prev; prev = null; cv.title = ''; }
    });
    cv.addEventListener('pointerdown', e => {
      if (e.button !== 0) return; const ax = nearHead(e); if (!ax) return;
      e.preventDefault(); e.stopImmediatePropagation();
      drag = {ax, was: !vid.paused, t: null, raf: 0}; vid.pause(); try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      const at = ev => { const r = cv.getBoundingClientRect(); return P.pxX(drag.ax, ev.clientX - r.left); };
      const mv = ev => {
        drag.t = at(ev); P.playhead = drag.t; P.invalidate();
        if (!drag.raf) drag.raf = requestAnimationFrame(() => { if (!drag) return; drag.raf = 0; const x = Math.max(0, tToV(cur.v, drag.t)); if (vid.fastSeek) vid.fastSeek(x); else vid.currentTime = x; });
      };
      const up = ev => {
        cv.removeEventListener('pointermove', mv, true); cv.removeEventListener('pointerup', up, true); cv.removeEventListener('pointercancel', up, true);
        const d = drag; drag = null; if (!d) return; cancelAnimationFrame(d.raf);
        if (d.t == null) d.t = at(ev);
        seekT(d.t); lastCur = cursorX();
        if (d.was) { const p = vid.play(); if (p && p.catch) p.catch(() => {}); }
      };
      cv.addEventListener('pointermove', mv, true); cv.addEventListener('pointerup', up, true); cv.addEventListener('pointercancel', up, true);
    }, true);
  }
  // Shift+← / Shift+→: 5 sn sar · Shift+Boşluk: oynat / duraklat (kamera penceresi açıkken, ses çalmıyorken; giriş kutularında değil)
  window.addEventListener('keydown', e => {
    if (!shown() || audioOn() || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); vid.currentTime = Math.max(0, Math.min(isFinite(vid.duration) ? vid.duration : 1e9, vid.currentTime + (e.key === 'ArrowRight' ? 5 : -5))); }
    else if (e.key === ' ') { e.preventDefault(); if (vid.paused) { const p = vid.play(); if (p && p.catch) p.catch(() => {}); } else vid.pause(); }
  });
  function open(f, v) {
    if (!win) build();
    if (!v.url) v.url = URL.createObjectURL(v.blob);
    cur = {f, v}; q('.cv-t').textContent = v.name || 'Kamera'; q('.cv-sub').textContent = [v.rec || (f && f.name) || '', v.summary || ''].filter(Boolean).join(' · ');
    q('.cv-st').textContent = '';
    if (vid.src !== v.url) vid.src = v.url;
    win.classList.remove('hidden'); watchCursor(); hookPlot(); if (typeof floatFront === 'function') floatFront(win);
    if (v.sync && S.view !== 'time' && S.plot.axes.length) switchView('time');   // konum çizgisi Zaman grafiğinde
    const p = vid.play(); if (p && p.catch) p.catch(() => {});
  }
  function close() { if (!win) return; try { vid.pause(); } catch (_) {} cancelAnimationFrame(raf); clearInterval(poll); clearHead(); win.classList.add('hidden'); }
  // dosya kapatılınca videosu açıksa pencere kapanır, nesne URL'leri bırakılır
  function release(f) { for (const v of (f && f.videos) || []) { if (cur && cur.v === v) { close(); try { vid.removeAttribute('src'); vid.load(); } catch (_) {} cur = null; } if (v.url) { URL.revokeObjectURL(v.url); v.url = null; } } }
  return {open, close, release, seekT, vToT, tToV, get video() { return vid; }, get current() { return cur; }};
})();
// açılan .mp4 dosyası: sol panelde "Kamera" altında (zaman eşlemesi yok, video başı 0 s)
function camAddFile(file) {
  const f = {id: 'f' + (importFile.seq++), name: file.name, videoOnly: true, mat: null, vars: [], channels: [], mcache: new Map(), cnts: {}, baseN: 0, cols: [], videos: [{name: file.name.replace(/\.[^.]+$/, ''), blob: file, summary: (file.size / 1048576).toFixed(1) + ' MB'}]};
  S.files.push(f); S.fopen.add(f.id); renderChips(); renderTree();
  CAMV.open(f, f.videos[0]);
  return f;
}
