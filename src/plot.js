/* Grafik motoru: Canvas, MATLAB benzeri etkileşim, büyük veri için min/max inceltme */
const PAL = ['#0072BD', '#D95319', '#EDB120', '#7E2F8E', '#77AC30', '#4DBEEE', '#A2142F'];
const THEMES = {
  light: {bg: '#ffffff', fg: '#1b1f24', axis: '#3a3f45', grid: '#e3e6ea', minor: '#f0f2f4', muted: '#6b7280', box: '#ffffff', sel: '#d62728', acc: '#0072BD'},
  dark: {bg: '#16191d', fg: '#e6e8eb', axis: '#aab0b8', grid: '#2c3137', minor: '#22262b', muted: '#8b929b', box: '#1e2227', sel: '#ff6b6b', acc: '#3b9ae1'}
};
function curTheme() { return document.documentElement.dataset.theme === 'dark' ? THEMES.dark : THEMES.light; }

function niceNum(r, round) {
  const e = Math.floor(Math.log10(r)), f = r / Math.pow(10, e); let n;
  if (round) n = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10; else n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return n * Math.pow(10, e);
}
function niceTicks(lo, hi, max) {
  if (!(hi > lo)) return {ticks: [lo], step: 1};
  const range = niceNum(hi - lo, false), step = niceNum(range / Math.max(2, max - 1), true);
  const out = []; const s = Math.ceil(lo / step - 1e-9) * step;
  for (let v = s, k = 0; v <= hi + step * 1e-9 && k < 200; v = s + (++k) * step) out.push(+v.toPrecision(12));
  return {ticks: out, step};
}
function fmtTick(v, step) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(1).replace('e+', 'e');
  const dec = Math.min(8, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  return v.toFixed(dec);
}
function fmtNum(v, d = 5) { if (!isFinite(v)) return String(v); const a = Math.abs(v); if (a !== 0 && (a >= 1e7 || a < 1e-4)) return v.toExponential(d - 2); return +v.toPrecision(d) + ''; }
function logTicks(lo, hi) {
  const out = [], minor = []; if (!(lo > 0) || !(hi > lo) || !isFinite(hi) || Math.log10(hi / lo) > 400) return {ticks: out, minor};
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    out.push(Math.pow(10, e));
    for (let m = 2; m < 10; m++) minor.push(m * Math.pow(10, e));
  }
  return {ticks: out, minor};
}
function fmtLog(v) { if (v >= 1000 && v < 1e6) return (v / 1000) + 'k'; if (v >= 1e6) return (v / 1e6) + 'M'; return +v.toPrecision(3) + ''; }


/* ---------- Canvas2D -> SVG kaydedici: Plot/SpecView aynı çizim koduyla vektör çıktı üretir ---------- */
class SvgCtx {
  constructor(W, H) {
    this.W = W; this.H = H; this.o = []; this.cid = 0; this._m = document.createElement('canvas').getContext('2d');
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.font = '10px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic'; this.globalAlpha = 1; this.lineJoin = 'miter'; this.imageSmoothingEnabled = true;
    this.dash = []; this.tf = [1, 0, 0, 1, 0, 0]; this.stack = []; this.open = 0; this.d = '';
  }
  static esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  _n(v) { return +v.toFixed(2); }
  _p(x, y) { const m = this.tf; return [this._n(m[0] * x + m[2] * y + m[4]), this._n(m[1] * x + m[3] * y + m[5])]; }
  save() { this.stack.push({st: [this.fillStyle, this.strokeStyle, this.lineWidth, this.font, this.textAlign, this.textBaseline, this.globalAlpha, this.lineJoin, this.dash, this.tf.slice()], open: this.open}); this.open = 0; }
  restore() { for (let i = 0; i < this.open; i++) this.o.push('</g>'); const e = this.stack.pop(); if (!e) return; [this.fillStyle, this.strokeStyle, this.lineWidth, this.font, this.textAlign, this.textBaseline, this.globalAlpha, this.lineJoin, this.dash, this.tf] = e.st; this.open = e.open; }
  setTransform(a, b, c, d, e, f) { this.tf = [a, b, c, d, e, f]; }
  _mul(a, b, c, d, e, f) { const m = this.tf; this.tf = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; }
  translate(x, y) { this._mul(1, 0, 0, 1, x, y); } scale(x, y) { this._mul(x, 0, 0, y, 0, 0); } rotate(a) { const c = Math.cos(a), s = Math.sin(a); this._mul(c, s, -s, c, 0, 0); }
  setLineDash(a) { this.dash = a || []; }
  beginPath() { this.d = ''; } closePath() { this.d += 'Z'; }
  moveTo(x, y) { const p = this._p(x, y); this.d += 'M' + p[0] + ' ' + p[1]; } lineTo(x, y) { const p = this._p(x, y); this.d += 'L' + p[0] + ' ' + p[1]; }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  arc(x, y, r, a0, a1) { const p0 = this._p(x - r, y), p1 = this._p(x + r, y), rr = this._n(r * Math.hypot(this.tf[0], this.tf[1])); this.d += `M${p0[0]} ${p0[1]}A${rr} ${rr} 0 1 0 ${p1[0]} ${p1[1]}A${rr} ${rr} 0 1 0 ${p0[0]} ${p0[1]}`; }
  clip() { const id = 'c' + (this.cid++); this.o.push(`<clipPath id="${id}"><path d="${this.d}"/></clipPath><g clip-path="url(#${id})">`); this.open++; }
  _col(c) { return c; }
  _stroke() { let a = `stroke="${this.strokeStyle}" stroke-width="${this._n(this.lineWidth * Math.hypot(this.tf[0], this.tf[1]))}" fill="none" stroke-linejoin="${this.lineJoin === 'round' ? 'round' : 'miter'}"`; if (this.dash.length) a += ` stroke-dasharray="${this.dash.join(' ')}"`; if (this.globalAlpha < 1) a += ` stroke-opacity="${this.globalAlpha}"`; return a; }
  _fill() { let a = `fill="${this.fillStyle}"`; if (this.globalAlpha < 1) a += ` fill-opacity="${this.globalAlpha}"`; return a; }
  stroke() { if (this.d) this.o.push(`<path d="${this.d}" ${this._stroke()}/>`); }
  fill() { if (this.d) this.o.push(`<path d="${this.d}" ${this._fill()} stroke="none"/>`); }
  fillRect(x, y, w, h) { const s = this.d; this.beginPath(); this.rect(x, y, w, h); this.fill(); this.d = s; }
  strokeRect(x, y, w, h) { const s = this.d; this.beginPath(); this.rect(x, y, w, h); this.stroke(); this.d = s; }
  measureText(t) { this._m.font = this.font; return this._m.measureText(t); }
  fillText(t, x, y) {
    const m = this.tf, anchor = {center: 'middle', right: 'end', end: 'end'}[this.textAlign] || 'start', bl = {top: 'hanging', middle: 'central', bottom: 'text-after-edge', hanging: 'hanging'}[this.textBaseline] || 'auto';
    this.o.push(`<text transform="matrix(${m.map(v => +v.toFixed(5)).join(' ')})" x="${this._n(x)}" y="${this._n(y)}" text-anchor="${anchor}" dominant-baseline="${bl}" style="font:${SvgCtx.esc(this.font)}" ${this._fill()}>${SvgCtx.esc(t)}</text>`);
  }
  drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
    const kx = dw / sw, ky = dh / sh, a = this._p(dx - sx * kx, dy - sy * ky), url = img.toDataURL('image/png');
    this.o.push(`<image x="${a[0]}" y="${a[1]}" width="${this._n(img.width * kx)}" height="${this._n(img.height * ky)}" preserveAspectRatio="none" style="image-rendering:pixelated" href="${url}"/>`);
  }
  toString() { const close = '</g>'.repeat(this.open); return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${this.W}" height="${this.H}" viewBox="0 0 ${this.W} ${this.H}">\n${this.o.join('\n')}${close}\n</svg>\n`; }
}

const fmtHz = f => (f >= 1000 ? (f / 1000).toPrecision(4).replace(/\.?0+$/, '') + ' kHz' : (+f.toPrecision(5)) + ' Hz');
class Plot {
  constructor(canvas, opts = {}) {
    this.cv = canvas; this.opts = opts; this.mode = 'pan';
    this.axes = []; this.linkX = true; this.grid = true; this.legend = true; this.grms = {mode: 'off', dc: true};
    this.cursors = []; this.sel = null; this.playhead = null; this.hover = null;
    this.cursorOpt = {snap: 'off', max: 12}; this.crosshair = false; this.hist = {back: [], fwd: []}; this._lastWheel = 0;
    this.xBounds = null; this.dirty = true; this.dpr = window.devicePixelRatio || 1;
    this.onChange = opts.onChange || (() => {}); this.onSelect = opts.onSelect || (() => {}); this.onHover = opts.onHover || (() => {});
    this.onNeedData = opts.onNeedData || (() => {}); this.onDraw = opts.onDraw || (() => {});
    this.W = 0; this.H = 0;
    this._bind();
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(canvas.parentElement);
    this.resize();
  }
  addAxes(o = {}) {
    const ax = Object.assign({traces: [], xlim: [0, 1], ylim: [0, 1], yAuto: true, ylim2: [0, 1], yAuto2: true, ylabel2: '', xlog: false, ylog: false, ylabel: '', xlabel: '', title: '', active: 0}, o);
    if (this.axes.length && this.linkX) ax.xlim = this.axes[0].xlim.slice();
    this.axes.push(ax); this.invalidate(); return ax;
  }
  // ---------- çift Y ekseni: tr.yr = true olan izler sağ eksene (ax.ylim2, doğrusal) çizilir ----------
  hasRight(ax) { return ax.traces.some(t => t.yr); }
  _r(ax, fn) {   // sağ eksen bağlamında çalıştır: ylim/ylog geçici olarak sağ eksenin değerleri
    if (!ax.ylim2) ax.ylim2 = [0, 1];
    const yl = ax.ylim, lg = ax.ylog, ya = ax.yAuto; ax.ylim = ax.ylim2; ax.ylog = false; ax.yAuto = ax.yAuto2 !== false;
    try { return fn(); } finally { ax.ylim2 = ax.ylim; ax.yAuto2 = ax.yAuto; ax.ylim = yl; ax.ylog = lg; ax.yAuto = ya; }
  }
  // sol eksen değeri → aynı pikseldeki sağ eksen değeri
  leftToRight(ax, v) { const py = this.yPx(ax, v); return this._r(ax, () => this.pxY(ax, py)); }
  // ---------- görünüm geçmişi (Alt+← / Alt+→) ----------
  viewState() { return {axes: this.axes.slice(), v: this.axes.map(a => ({xl: a.xlim.slice(), yl: a.ylim.slice(), ya: a.yAuto, yl2: (a.ylim2 || [0, 1]).slice(), ya2: a.yAuto2 !== false}))}; }
  _sameView(p, q) { return p && q && p.axes.length === q.axes.length && p.axes.every((a, i) => a === q.axes[i]) && JSON.stringify(p.v) === JSON.stringify(q.v); }
  pushView() {
    if (!this.axes.length) return; const st = this.viewState(), b = this.hist.back;
    if (this._sameView(b[b.length - 1], st)) return;
    b.push(st); if (b.length > 100) b.shift(); this.hist.fwd = [];
  }
  _applyView(st) { st.axes.forEach((a, i) => { if (!this.axes.includes(a)) return; const v = st.v[i]; a.xlim = v.xl.slice(); a.ylim = v.yl.slice(); a.yAuto = v.ya; a.ylim2 = v.yl2.slice(); a.yAuto2 = v.ya2; }); this.invalidate(); this.onChange('view'); }
  viewBack() { const b = this.hist.back; while (b.length && !b[b.length - 1].axes.some(a => this.axes.includes(a))) b.pop(); if (!b.length) return false; const cur = this.viewState(); let st = b.pop(); if (this._sameView(st, cur) && b.length) st = b.pop(); this.hist.fwd.push(cur); this._applyView(st); return true; }
  viewFwd() { const f = this.hist.fwd; if (!f.length) return false; this.hist.back.push(this.viewState()); this._applyView(f.pop()); return true; }
  removeAxes(ax) { const i = this.axes.indexOf(ax); if (i >= 0) this.axes.splice(i, 1); this.cursors = []; this.sel = null; if (this.active === ax) this.active = null; this.invalidate(); }
  invalidate() { if (this.dirty && this._raf) return; this.dirty = true; if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = null; this.draw(); }); }
  resize() {
    const p = this.cv.parentElement, w = p.clientWidth, h = p.clientHeight;
    if (!w || !h) return;
    this.dpr = window.devicePixelRatio || 1; this.W = w; this.H = h;
    this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(h * this.dpr);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
    this.invalidate();
  }
  // ---------- yerleşim ----------
  layout(W, H) {
    const n = this.axes.length; if (!n) return;
    const L = 74, R = this.axes.some(a => this.hasRight(a)) ? 72 : 18, T = this.axes.some(a => a.title) ? 26 : 10, B = 40, gap = this.axes.some(a => a.title) ? 40 : 26;
    const avail = Math.max(60 * n, H - T - B - gap * (n - 1));
    let tw = 0; for (const a of this.axes) tw += a.hw || 1;
    let y = T;
    this.axes.forEach(ax => { const h = Math.max(50, avail * (ax.hw || 1) / tw); ax.rect = {x: L, y, w: Math.max(50, W - L - R), h}; y += h + gap; });
  }
  bounds() {
    let lo = Infinity, hi = -Infinity;
    for (const ax of this.axes) for (const tr of ax.traces) {
      const b = trBounds(tr); if (!b) continue; if (b[0] < lo) lo = b[0]; if (b[1] > hi) hi = b[1];
    }
    return isFinite(lo) ? [lo, hi] : null;
  }
  // Titreşim izleri için lejant ekini hesapla: " — 1.234 Grms" (DC çıkarılabilir; ölü noktalar ve NaN hariç)
  legendExtra(t, ax) {
    if (t.fixedExtra) return t.fixedExtra;
    const m = this.grms; if (!m || m.mode === 'off') return '';
    if (t.kind === 'xy') {   // spektrum izi: PSD/RMS/tepe genlik -> Grms (alan integrali)
      if (!t.raw || t.srcKind !== 'vib') return '';
      const f = t.x, y = t.raw, lo = m.mode === 'vis' ? ax.xlim[0] : -Infinity, hi = m.mode === 'vis' ? ax.xlim[1] : Infinity; let s = 0;
      for (let i = 0; i < f.length; i++) { if (m.dc && f[i] === 0) continue; if (f[i] < lo || f[i] > hi) continue; const v = y[i]; if (!isFinite(v)) continue; s += t.scale === 'psd' ? v * t.df : t.scale === 'amp' ? v * v / 2 : v * v; }
      return ' — ' + Math.sqrt(s).toPrecision(4) + ' Grms';
    }
    if (t.kind !== 'ts' || t.ch.kind !== 'vib' || !t.ch.data) return '';
    const ch = t.ch; let a = 0, b = ch.n;
    if (m.mode === 'vis') { a = Math.max(0, Math.floor(ch.timeIdx(ax.xlim[0]))); b = Math.min(ch.n, Math.ceil(ch.timeIdx(ax.xlim[1])) + 1); }
    const key = m.mode + ':' + a + ':' + b + ':' + ch.delCount + ':' + m.dc, c = t._grms;
    if (c && c.key === key) return c.txt;
    if (b - a > 2e5 && c && m.mode === 'vis') {   // etkileşim sırasında eski değeri göster, durulunca yeniden hesapla
      clearTimeout(t._gt); t._gt = setTimeout(() => { t._grms = {key, txt: this._grmsTxt(ch, a, b)}; this.invalidate(); }, 150); return c.txt;
    }
    t._grms = {key, txt: this._grmsTxt(ch, a, b)}; return t._grms.txt;
  }
  _grmsTxt(ch, a, b) {
    const d = ch.data, del = ch.del; let s = 0, s2 = 0, n = 0;
    for (let i = a; i < b; i++) { const v = d[i]; if ((del && del[i]) || !isFinite(v)) continue; s += v; s2 += v * v; n++; }
    if (!n) return '';
    const mean = s / n, ms = this.grms.dc ? Math.max(0, s2 / n - mean * mean) : s2 / n;
    return ' — ' + Math.sqrt(ms).toPrecision(4) + ' Grms';
  }
  zoomOut(f = 2) {
    this.pushView();
    for (const ax of this.axes) {
      this.zoomX(ax, f, (ax.xlim[0] + ax.xlim[1]) / 2);
      if (!ax.yAuto) this.zoomY(ax, f, (ax.ylim[0] + ax.ylim[1]) / 2);
      if (this.hasRight(ax) && ax.yAuto2 === false) this.zoomY2(ax, f, (ax.ylim2[0] + ax.ylim2[1]) / 2);
    }
    this.invalidate(); this.onChange('view');
  }
  zoomIn() { this.zoomOut(0.5); }
  fitAll(xOnly) {
    this.pushView();
    const b = this.bounds();
    for (const ax of this.axes) {
      if (this.linkX || true) {
        let lo = Infinity, hi = -Infinity;
        const src = this.linkX ? this.axes : [ax];
        for (const a of src) for (const tr of a.traces) { const bb = trBounds(tr, a.xlog); if (!bb) continue; lo = Math.min(lo, bb[0]); hi = Math.max(hi, bb[1]); }
        if (isFinite(lo)) { if (hi <= lo) hi = lo + 1; ax.xlim = [lo, hi]; }
      }
      if (!xOnly) { ax.yAuto = true; ax.yAuto2 = true; }
    }
    this.invalidate(); this.onChange('view');
  }
  // ---------- dönüşümler ----------
  xPx(ax, x) { const r = ax.rect; if (ax.xlog) { const l0 = Math.log10(ax.xlim[0]), l1 = Math.log10(ax.xlim[1]); return r.x + (Math.log10(Math.max(x, 1e-300)) - l0) / (l1 - l0) * r.w; } return r.x + (x - ax.xlim[0]) / (ax.xlim[1] - ax.xlim[0]) * r.w; }
  yPx(ax, y) { const r = ax.rect; if (ax.ylog) { const l0 = Math.log10(ax.ylim[0]), l1 = Math.log10(ax.ylim[1]); return r.y + r.h - (Math.log10(Math.max(y, 1e-300)) - l0) / (l1 - l0) * r.h; } return r.y + r.h - (y - ax.ylim[0]) / (ax.ylim[1] - ax.ylim[0]) * r.h; }
  pxX(ax, px) { const r = ax.rect, f = (px - r.x) / r.w; if (ax.xlog) { const l0 = Math.log10(ax.xlim[0]), l1 = Math.log10(ax.xlim[1]); return Math.pow(10, l0 + f * (l1 - l0)); } return ax.xlim[0] + f * (ax.xlim[1] - ax.xlim[0]); }
  pxY(ax, py) { const r = ax.rect, f = 1 - (py - r.y) / r.h; if (ax.ylog) { const l0 = Math.log10(ax.ylim[0]), l1 = Math.log10(ax.ylim[1]); return Math.pow(10, l0 + f * (l1 - l0)); } return ax.ylim[0] + f * (ax.ylim[1] - ax.ylim[0]); }

  // ---------- çizim ----------
  draw() { this.dirty = false; const ctx = this.cv.getContext('2d'); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.render(ctx, this.W, this.H, curTheme(), false); this.onDraw(); }
  render(ctx, W, H, T, forExport) {
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
    if (!this.axes.length) { ctx.fillStyle = T.muted; ctx.font = '14px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(this.opts.emptyText || 'Soldaki listeden bir kanalı çift tıklayın veya buraya sürükleyin', W / 2, H / 2); return; }
    this.layout(W, H);
    for (const ax of this.axes) { this.autoY(ax); this.drawAxes(ctx, ax, T, forExport); }
    if (!forExport && this.crosshair && this.hoverX != null) this.drawCrosshair(ctx, T);
    else if (!forExport && this.hoverX != null && this.axes.length > 1 && this.linkX) { ctx.save(); ctx.strokeStyle = T.muted; ctx.setLineDash([2, 3]); for (const ax of this.axes) { const x = this.xPx(ax, this.hoverX), r = ax.rect; if (x >= r.x && x <= r.x + r.w) { ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, r.y); ctx.lineTo(Math.round(x) + .5, r.y + r.h); ctx.stroke(); } } ctx.restore(); }
    this.drawOverlay(ctx, T, forExport);
  }
  autoY(ax) {
    if (this.hasRight(ax) && ax.yAuto2 !== false) this._r(ax, () => this._autoY(ax, true));
    if (ax.yAuto) this._autoY(ax, false);
  }
  _autoY(ax, right) {
    let lo = Infinity, hi = -Infinity;
    for (const tr of ax.traces) {
      if (!tr.visible || !!tr.yr !== right) continue;
      const mm = trYRange(tr, ax); if (!mm) continue;
      if (mm[0] < lo) lo = mm[0]; if (mm[1] > hi) hi = mm[1];
    }
    if (!isFinite(lo)) return;
    if (ax.ylog) { lo = Math.max(lo, 1e-300); if (hi <= lo) hi = lo * 10; const a = Math.log10(lo), b = Math.log10(hi), p = (b - a) * 0.05 || 0.5; ax.ylim = [Math.pow(10, a - p), Math.pow(10, b + p)]; return; }
    if (hi === lo) { const d = Math.abs(lo) * 0.05 || 1; lo -= d; hi += d; }
    const p = (hi - lo) * 0.05; ax.ylim = [lo - p, hi + p];
  }
  drawAxes(ctx, ax, T, forExport) {
    const r = ax.rect; ctx.save();
    ctx.fillStyle = T.bg; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.font = '11px system-ui,sans-serif'; ctx.textBaseline = 'middle';
    // ızgara + eksen etiketleri
    const xt = ax.xlog ? logTicks(ax.xlim[0], ax.xlim[1]) : niceTicks(ax.xlim[0], ax.xlim[1], Math.max(3, Math.floor(r.w / 90)));
    const yt = ax.ylog ? logTicks(ax.ylim[0], ax.ylim[1]) : niceTicks(ax.ylim[0], ax.ylim[1], Math.max(3, Math.floor(r.h / 40)));
    ctx.lineWidth = 1;
    if (this.grid) {
      if (ax.xlog) { ctx.strokeStyle = T.minor; ctx.beginPath(); for (const v of xt.minor) { if (v < ax.xlim[0] || v > ax.xlim[1]) continue; const x = Math.round(this.xPx(ax, v)) + .5; ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); } ctx.stroke(); }
      if (ax.ylog) { ctx.strokeStyle = T.minor; ctx.beginPath(); for (const v of yt.minor) { if (v < ax.ylim[0] || v > ax.ylim[1]) continue; const y = Math.round(this.yPx(ax, v)) + .5; ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); } ctx.stroke(); }
      ctx.strokeStyle = T.grid; ctx.beginPath();
      for (const v of xt.ticks) { if (v < ax.xlim[0] || v > ax.xlim[1]) continue; const x = Math.round(this.xPx(ax, v)) + .5; ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); }
      for (const v of yt.ticks) { if (v < ax.ylim[0] || v > ax.ylim[1]) continue; const y = Math.round(this.yPx(ax, v)) + .5; ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); }
      ctx.stroke();
    }
    // izler
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ax._lab = [];
    for (let k = 0; k < ax.traces.length; k++) { const tr = ax.traces[k]; if (!tr.visible) continue; if (tr.yr) this._r(ax, () => drawTrace(ctx, tr, ax, this, T)); else drawTrace(ctx, tr, ax, this, T); }
    ctx.restore(); ctx.save();
    // çerçeve ve tikler
    ctx.strokeStyle = T.axis; ctx.strokeRect(r.x + .5, r.y + .5, r.w, r.h);
    if (this.active === ax && this.axes.length > 1 && !forExport) { ctx.strokeStyle = T.acc; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1.5, r.w - 1, r.h - 1); ctx.lineWidth = 1; }
    ctx.fillStyle = T.fg; ctx.strokeStyle = T.axis;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.beginPath();
    for (const v of xt.ticks) { if (v < ax.xlim[0] || v > ax.xlim[1]) continue; const x = Math.round(this.xPx(ax, v)) + .5; ctx.moveTo(x, r.y + r.h); ctx.lineTo(x, r.y + r.h + 4); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of yt.ticks) { if (v < ax.ylim[0] || v > ax.ylim[1]) continue; const y = Math.round(this.yPx(ax, v)) + .5; ctx.moveTo(r.x, y); ctx.lineTo(r.x - 4, y); }
    ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of xt.ticks) { if (v < ax.xlim[0] || v > ax.xlim[1]) continue; ctx.fillText(ax.xlog ? fmtLog(v) : fmtTick(v, xt.step), this.xPx(ax, v), r.y + r.h + 6); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of yt.ticks) { if (v < ax.ylim[0] || v > ax.ylim[1]) continue; ctx.fillText(ax.ylog ? fmtLog(v) : fmtTick(v, yt.step), r.x - 7, this.yPx(ax, v)); }
    // başlık / eksen adı
    ctx.fillStyle = T.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (ax.title) { ctx.font = '600 12px system-ui,sans-serif'; ctx.fillText(ax.title, r.x + r.w / 2, r.y - 1); ctx.font = '11px system-ui,sans-serif'; }
    if (this.hasRight(ax)) {   // sağ Y ekseni
      const yt2 = niceTicks(ax.ylim2[0], ax.ylim2[1], Math.max(3, Math.floor(r.h / 40))), Y2 = v => r.y + r.h - (v - ax.ylim2[0]) / (ax.ylim2[1] - ax.ylim2[0]) * r.h;
      ctx.strokeStyle = T.axis; ctx.beginPath();
      for (const v of yt2.ticks) { if (v < ax.ylim2[0] || v > ax.ylim2[1]) continue; const y = Math.round(Y2(v)) + .5; ctx.moveTo(r.x + r.w, y); ctx.lineTo(r.x + r.w + 4, y); }
      ctx.stroke(); ctx.fillStyle = T.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const v of yt2.ticks) { if (v < ax.ylim2[0] || v > ax.ylim2[1]) continue; ctx.fillText(fmtTick(v, yt2.step), r.x + r.w + 7, Y2(v)); }
      const rc = ax.traces.find(t => t.yr && t.visible); if (rc) { ctx.fillStyle = rc.color; ctx.fillRect(r.x + r.w + 1, r.y, 2, r.h); }
      if (ax.ylabel2) { ctx.save(); ctx.fillStyle = T.muted; ctx.translate(r.x + r.w + 62, r.y + r.h / 2); ctx.rotate(Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ax.ylabel2, 0, 0); ctx.restore(); }
    }
    ctx.fillStyle = T.muted; ctx.textBaseline = 'top';
    const xl = ax.xlabel || this.opts.xlabel || 'Zaman (s)';
    if (ax === this.axes[this.axes.length - 1] || forExport) ctx.fillText(xl, r.x + r.w / 2, r.y + r.h + 21);
    if (ax.ylabel) { ctx.save(); ctx.translate(13, r.y + r.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ax.ylabel, 0, 0); ctx.restore(); }
    // gösterge
    if (this.legend && (forExport || !this.domLegend)) {
      const vis = ax.traces.filter(t => t.visible && !t.noLegend); if (vis.length) {
        ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const lbl = new Map(vis.map(t => [t, t.label + (t.yr ? ' (sağ Y)' : '') + this.legendExtra(t, ax)])); let wmax = 0; for (const t of vis) wmax = Math.max(wmax, ctx.measureText(lbl.get(t)).width);
        const bw = wmax + 34, bh = vis.length * 16 + 6, lp = ax.lgPos || {dx: 0, dy: 0}, bx = Math.max(r.x, Math.min(r.x + r.w - bw, r.x + r.w - bw - 6 + lp.dx)), by = Math.max(r.y, Math.min(r.y + r.h - bh, r.y + 6 + lp.dy));
        ctx.globalAlpha = .92; ctx.fillStyle = T.box; ctx.fillRect(bx, by, bw, bh); ctx.globalAlpha = 1;
        ctx.strokeStyle = T.grid; ctx.strokeRect(bx + .5, by + .5, bw, bh);
        vis.forEach((t, i) => { const y = by + 11 + i * 16; ctx.strokeStyle = t.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx + 6, y); ctx.lineTo(bx + 22, y); ctx.stroke(); ctx.lineWidth = 1; ctx.fillStyle = T.fg; ctx.fillText(lbl.get(t), bx + 28, y); });
      }
    }
    ctx.restore();
  }
  // her alt grafikte hoverX'teki tüm görünür izlerin değeri (senkron dikey imleç)
  valueAt(tr, ax, x) {
    if (tr.kind === 'ts') { const ch = tr.ch; if (!ch.data || !ch.n) return null; const i = Math.max(0, Math.min(ch.n - 1, Math.round(ch.timeIdx(x)))); const v = ch.data[i]; if ((ch.del && ch.del[i]) || !isFinite(v)) return null; const tt = ch.t(i); if (ch.n > 1 && Math.abs(tt - x) > 3 * Math.abs(ch.t(Math.min(ch.n - 1, i + 1)) - ch.t(Math.max(0, i - 1)) || 1e-12)) return null; return {x: tt, y: v}; }
    if (tr.bars || !tr.x || !tr.x.length) return null;
    let i = lowerBound(tr.x, x); if (i >= tr.x.length) i = tr.x.length - 1; if (i > 0 && Math.abs(tr.x[i - 1] - x) < Math.abs(tr.x[i] - x)) i--;
    return isFinite(tr.y[i]) ? {x: tr.x[i], y: tr.y[i]} : null;
  }
  drawCrosshair(ctx, T) {
    const x0 = this.hoverX;
    for (const ax of this.axes) {
      const r = ax.rect, X = this.xPx(ax, x0); if (!(X >= r.x && X <= r.x + r.w)) continue;
      ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      ctx.strokeStyle = T.muted; ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(X) + .5, r.y); ctx.lineTo(Math.round(X) + .5, r.y + r.h); ctx.stroke(); ctx.setLineDash([]);
      const rows = [];
      for (const tr of ax.traces) {
        if (!tr.visible || tr.noLegend) continue; const v = this.valueAt(tr, ax, x0); if (!v) continue;
        const py = tr.yr ? this._r(ax, () => this.yPx(ax, v.y)) : this.yPx(ax, v.y), px = this.xPx(ax, v.x);
        ctx.fillStyle = tr.color; ctx.beginPath(); ctx.arc(px, py, 3, 0, 6.283); ctx.fill();
        rows.push({c: tr.color, t: (tr.label.length > 28 ? tr.label.slice(0, 27) + '…' : tr.label) + ': ' + fmtNum(v.y, 6)});
      }
      if (rows.length) {
        ctx.font = '11px system-ui,sans-serif'; const head = (this.opts.xName || 't') + ' = ' + fmtNum(x0, 7); let w = ctx.measureText(head).width; for (const q of rows) w = Math.max(w, ctx.measureText(q.t).width + 12);
        const bw = w + 12, bh = rows.length * 14 + 22; let bx = X + 10; if (bx + bw > r.x + r.w) bx = X - bw - 10; const by = r.y + Math.min(34, Math.max(6, r.h - bh - 6));
        ctx.globalAlpha = .92; ctx.fillStyle = T.box; ctx.fillRect(bx, by, bw, bh); ctx.globalAlpha = 1; ctx.strokeStyle = T.grid; ctx.strokeRect(bx + .5, by + .5, bw, bh);
        ctx.fillStyle = T.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(head, bx + 6, by + 10);
        rows.forEach((q, i) => { const y = by + 24 + i * 14; ctx.fillStyle = q.c; ctx.fillRect(bx + 6, y - 1, 8, 3); ctx.fillStyle = T.fg; ctx.fillText(q.t, bx + 18, y); });
      }
      ctx.restore();
    }
  }
  drawOverlay(ctx, T, forExport) {
    // seçim kutusu / kement / yakınlaştırma çerçevesi
    if (!forExport) {
    if (this.drag && this.drag.kind === 'rubber') {
      const d = this.drag; ctx.save(); ctx.strokeStyle = d.mode === 'zoom' ? T.fg : T.sel; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(d.x0, d.x1) + .5, Math.min(d.y0, d.y1) + .5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); ctx.restore();
    }
    if (this.drag && this.drag.kind === 'lasso') {
      ctx.save(); ctx.strokeStyle = T.sel; ctx.setLineDash([4, 3]); ctx.beginPath(); this.drag.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.restore();
    }
    const sel = this.sel;
    if (sel && sel.axes && this.axes.includes(sel.axes)) {
      const ax = sel.axes, r = ax.rect; ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      ctx.strokeStyle = T.sel; ctx.fillStyle = T.sel; ctx.lineWidth = 1;
      if (sel.type === 'box') { const x0 = this.xPx(ax, sel.x0), x1 = this.xPx(ax, sel.x1), y0 = this.yPx(ax, sel.y1), y1 = this.yPx(ax, sel.y0); ctx.setLineDash([4, 3]); ctx.strokeRect(x0 + .5, y0 + .5, x1 - x0, y1 - y0); }
      else if (sel.type === 'lasso') { ctx.setLineDash([4, 3]); ctx.beginPath(); sel.poly.forEach((p, i) => { const x = this.xPx(ax, p[0]), y = this.yPx(ax, p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); }
      ctx.setLineDash([]);
      for (const h of sel.hits || []) {
        const ch = h.tr.ch, idx = h.idx, step = Math.max(1, Math.floor(idx.length / 20000));
        const yp = h.tr.yr ? v => this._r(ax, () => this.yPx(ax, v)) : v => this.yPx(ax, v);
        for (let k = 0; k < idx.length; k += step) { const i = idx[k]; const x = this.xPx(ax, ch.t(i)), y = yp(ch.data[i]); ctx.fillRect(x - 2.5, y - 2.5, 5, 5); }
      }
      ctx.restore();
    }
    }
    for (const b of this.bands || []) for (const ax of this.axes) { const r = ax.rect; const x0 = Math.max(r.x, this.xPx(ax, b.x0)), x1 = Math.min(r.x + r.w, this.xPx(ax, b.x1)); if (x1 > x0) { ctx.save(); ctx.globalAlpha = .13; ctx.fillStyle = b.color || '#2aa198'; ctx.fillRect(x0, r.y, x1 - x0, r.h); ctx.restore(); } }
    for (const nt of this.notes || []) this.axes.forEach((ax, ai) => { const r = ax.rect, x0 = this.xPx(ax, nt.t0); if (!(x0 >= r.x - 1 && x0 <= r.x + r.w + 1)) return; ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.strokeStyle = nt.color || '#b45309'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x0, r.y); ctx.lineTo(x0, r.y + r.h); ctx.stroke(); if (nt.t1 > nt.t0) { const x1 = Math.min(r.x + r.w, this.xPx(ax, nt.t1)); ctx.setLineDash([]); ctx.globalAlpha = .1; ctx.fillStyle = nt.color || '#b45309'; ctx.fillRect(x0, r.y, Math.max(1, x1 - x0), r.h); ctx.globalAlpha = 1; }
      if (ai === 0) { ctx.setLineDash([]); ctx.font = '10px sans-serif'; ctx.fillStyle = nt.color || '#b45309'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(nt.text, x0 + 3, r.y + 2); } ctx.restore(); });
    if (this.harm && this.harm.f0 > 0) for (const ax of this.axes) {   // harmonik ve yan-band imleçleri
      const r = ax.rect, hm = this.harm; ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      for (let k = 1; k <= hm.n; k++) {
        const f = k * hm.f0, x = this.xPx(ax, f); if (f > ax.xlim[1]) break;
        if (f >= ax.xlim[0]) { ctx.strokeStyle = T.acc || '#2b6cb0'; ctx.setLineDash([]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + .5, r.y); ctx.lineTo(x + .5, r.y + r.h); ctx.stroke(); ctx.fillStyle = T.acc || '#2b6cb0'; ctx.save(); ctx.translate(x - 3, r.y + 4); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(k + '× ' + fmtHz(f), 0, 0); ctx.restore(); }
        if (hm.fm > 0) for (let m = 1; m <= hm.nsb; m++) for (const sg of [-1, 1]) { const fs_ = f + sg * m * hm.fm; if (fs_ <= 0 || fs_ < ax.xlim[0] || fs_ > ax.xlim[1]) continue; const xs = this.xPx(ax, fs_); ctx.strokeStyle = T.muted; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xs + .5, r.y); ctx.lineTo(xs + .5, r.y + r.h); ctx.stroke(); ctx.save(); ctx.setLineDash([]); ctx.fillStyle = T.muted; ctx.font = '9px sans-serif'; ctx.translate(xs - 2, r.y + 4); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(fmtHz(fs_), 0, 0); ctx.restore(); }
      }
      ctx.restore();
    }
    // veri imleçleri
    this.cursors.forEach((c, k) => this.drawCursor(ctx, c, k, T));
    if (this.playhead != null) for (const ax of this.axes) { const x = this.xPx(ax, this.playhead), r = ax.rect; if (x >= r.x && x <= r.x + r.w) { ctx.save(); ctx.strokeStyle = T.sel; ctx.beginPath(); ctx.moveTo(x + .5, r.y); ctx.lineTo(x + .5, r.y + r.h); ctx.stroke(); ctx.restore(); } }
  }
  drawCursor(ctx, c, k, T) {
    const ax = c.axes; if (!this.axes.includes(ax) || !ax.rect) return;
    const x = this.xPx(ax, c.x), y = c.tr.yr ? this._r(ax, () => this.yPx(ax, c.y)) : this.yPx(ax, c.y), r = ax.rect;
    if (x < r.x - 1 || x > r.x + r.w + 1) return;
    ctx.save(); ctx.beginPath(); ctx.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); ctx.clip();
    ctx.strokeStyle = c.tr.color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x + .5, r.y); ctx.lineTo(x + .5, r.y + r.h); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = T.bg; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.283); ctx.fill(); ctx.stroke();
    const xl = this.opts.xName || 't', lines = [(this.cursors.length > 1 ? 'C' + (k + 1) + ' · ' : '') + c.tr.label, `${xl} = ${fmtNum(c.x, 7)}`, `y = ${fmtNum(c.y, 6)}`];
    if (c.i != null && this.cursors.length < 3) lines.push('i = ' + c.i);
    if (c.snap) lines.push(c.snap === 'peak' ? 'tepe' : 'çukur');
    ctx.font = '11px system-ui,sans-serif'; let w = 0; for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    const bw = w + 14, bh = lines.length * 15 + 8; let bx = x + 10, by = y - bh - 8;
    if (bx + bw > r.x + r.w) bx = x - bw - 10; if (by < r.y) by = y + 10; if (by + bh > r.y + r.h) by = r.y + r.h - bh;
    ctx.fillStyle = T.box; ctx.fillRect(bx, by, bw, bh); ctx.lineWidth = 1; ctx.strokeStyle = c.tr.color; ctx.strokeRect(bx + .5, by + .5, bw, bh);
    ctx.fillStyle = T.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => { ctx.fillText(l, bx + 7, by + 12 + i * 15); });
    ctx.restore();
  }

  // ---------- etkileşim ----------
  _bind() {
    const cv = this.cv; cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', e => this._down(e));
    cv.addEventListener('pointermove', e => this._move(e));
    cv.addEventListener('pointerup', e => this._up(e));
    cv.addEventListener('pointercancel', e => this._up(e));
    cv.addEventListener('pointerleave', () => { this.hover = null; this.onHover(null); if (this.crosshair && this.hoverX != null) { this.hoverX = null; this.invalidate(); } });
    cv.addEventListener('wheel', e => this._wheel(e), {passive: false});
    cv.addEventListener('dblclick', e => { const h = this.hit(e); if (h && this.mode !== 'cursor') this.fitAll(false); });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  }
  pos(e) { const b = this.cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
  hit(e) {
    const [px, py] = this.pos(e);
    for (const ax of this.axes) {
      const r = ax.rect; if (!r) continue;
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return {ax, zone: 'plot', px, py};
      if (px < r.x && py >= r.y && py <= r.y + r.h) return {ax, zone: 'y', px, py};
      if (px >= r.x && px <= r.x + r.w && py > r.y + r.h && py < r.y + r.h + 34) return {ax, zone: 'x', px, py};
      if (px > r.x + r.w && px < r.x + r.w + 70 && py >= r.y && py <= r.y + r.h && this.hasRight(ax)) return {ax, zone: 'y2', px, py};
    }
    return null;
  }
  setXlim(ax, lo, hi) {
    if (!(hi > lo)) return;
    const b = this.bounds();
    if (b && !ax.xlog && this.opts.clamp !== false) { const span = b[1] - b[0] || 1, m = span * 0.02; const w = hi - lo; if (w > span + 2 * m) { lo = b[0] - m; hi = b[1] + m; } else { if (lo < b[0] - m) { lo = b[0] - m; hi = lo + w; } if (hi > b[1] + m) { hi = b[1] + m; lo = hi - w; } } }
    if (ax.xlog && lo <= 0) return;
    const targets = this.linkX ? this.axes : [ax];
    for (const a of targets) a.xlim = [lo, hi];
  }
  setYlim(ax, lo, hi) { if (!(hi > lo)) return; if (ax.ylog && lo <= 0) return; ax.ylim = [lo, hi]; ax.yAuto = false; }
  setYlim2(ax, lo, hi) { if (!(hi > lo)) return; ax.ylim2 = [lo, hi]; ax.yAuto2 = false; }
  zoomY2(ax, f, cy) { const [a, b] = ax.ylim2; this.setYlim2(ax, cy - (cy - a) * f, cy + (b - cy) * f); }
  zoomX(ax, f, cx) { let [a, b] = ax.xlim; if (ax.xlog) { const l0 = Math.log10(a), l1 = Math.log10(b), c = Math.log10(cx); this.setXlim(ax, Math.pow(10, c - (c - l0) * f), Math.pow(10, c + (l1 - c) * f)); } else this.setXlim(ax, cx - (cx - a) * f, cx + (b - cx) * f); }
  zoomY(ax, f, cy) { let [a, b] = ax.ylim; if (ax.ylog) { const l0 = Math.log10(a), l1 = Math.log10(b), c = Math.log10(cy); this.setYlim(ax, Math.pow(10, c - (c - l0) * f), Math.pow(10, c + (l1 - c) * f)); } else this.setYlim(ax, cy - (cy - a) * f, cy + (b - cy) * f); }
  _wheel(e) {
    const h = this.hit(e); if (!h) return; e.preventDefault();
    const now = performance.now(); if (now - this._lastWheel > 600) this.pushView(); this._lastWheel = now;
    const f = Math.pow(1.0018, e.deltaY * (e.deltaMode === 1 ? 33 : 1)), {ax} = h;
    const pyc = Math.min(Math.max(h.py, ax.rect.y), ax.rect.y + ax.rect.h), cx = this.pxX(ax, Math.min(Math.max(h.px, ax.rect.x), ax.rect.x + ax.rect.w)), cy = this.pxY(ax, pyc);
    const right = this.hasRight(ax), cy2 = right ? this._r(ax, () => this.pxY(ax, pyc)) : 0;
    if (h.zone === 'y2') this.zoomY2(ax, f, cy2);
    else if (h.zone === 'y' || (h.zone === 'plot' && e.shiftKey)) { this.zoomY(ax, f, cy); if (right && h.zone === 'plot') this.zoomY2(ax, f, cy2); }
    else if (h.zone === 'x' || !e.ctrlKey) this.zoomX(ax, f, cx);
    else { this.zoomX(ax, f, cx); this.zoomY(ax, f, cy); if (right) this.zoomY2(ax, f, cy2); }
    this.invalidate(); this.onChange('view');
  }
  _down(e) {
    const h = this.hit(e); if (!h) return; this.cv.setPointerCapture(e.pointerId);
    const {ax, px, py} = h; const rb = e.button === 2; if (this.active !== ax) { this.active = ax; this.onChange('active'); this.invalidate(); }
    this.drag = {ax, zone: h.zone, x0: px, y0: py, x1: px, y1: py, xl: ax.xlim.slice(), yl: ax.ylim.slice(), yl2: (ax.ylim2 || [0, 1]).slice(), moved: false, btn: e.button, shift: e.shiftKey};
    if (h.zone !== 'plot') { this.drag.kind = 'pan'; this.pushView(); return; }
    if (this.mode === 'pan' || e.button === 1) { this.drag.kind = 'pan'; this.cv.style.cursor = 'grabbing'; this.pushView(); }
    else if (this.mode === 'zoom') { this.drag.kind = 'rubber'; this.drag.mode = 'zoom'; this.pushView(); }
    else if (this.mode === 'box') { this.drag.kind = 'rubber'; this.drag.mode = 'box'; }
    else if (this.mode === 'lasso') { this.drag.kind = 'lasso'; this.drag.pts = [[px, py]]; }
    else if (this.mode === 'cursor') {
      this.drag.kind = 'cursor';
      // var olan imlece yakın tık: o imleç sürüklenir; Shift: yeni imleç eklenir; aksi hâlde tek imleç
      let ci = -1, bd = 9;
      this.cursors.forEach((c, k) => { if (c.axes !== ax) return; const d = Math.abs(this.xPx(ax, c.x) - px); if (d < bd) { bd = d; ci = k; } });
      if (ci < 0) ci = e.shiftKey && this.cursors.length ? Math.min(this.cursors.length, (this.cursorOpt.max || 12) - 1) : -1;
      this.drag.ci = ci; this.placeCursor(ax, px, py, ci);
    }
  }
  _move(e) {
    const d = this.drag;
    if (!d) {
      const h = this.hit(e);
      if (h && h.zone === 'plot') { const x = this.pxX(h.ax, h.px), y = this.pxY(h.ax, h.py); this.onHover({x, y, ax: h.ax}); if (this.crosshair && this.hoverX !== x) { this.hoverX = x; this.invalidate(); } } else { this.onHover(null); if (this.crosshair && this.hoverX != null) { this.hoverX = null; this.invalidate(); } }
      this.cv.style.cursor = !h ? 'default' : h.zone === 'y' || h.zone === 'y2' ? 'ns-resize' : h.zone === 'x' ? 'ew-resize' : ({pan: 'grab', zoom: 'zoom-in', cursor: 'crosshair', box: 'crosshair', lasso: 'crosshair'}[this.mode] || 'default');
      return;
    }
    const [px, py] = this.pos(e); d.x1 = px; d.y1 = py;
    if (Math.abs(px - d.x0) + Math.abs(py - d.y0) > 3) d.moved = true;
    const ax = d.ax, r = ax.rect;
    if (d.kind === 'pan') {
      const dx = px - d.x0, dy = py - d.y0;
      if (d.zone === 'y2' || (d.zone === 'plot' && this.hasRight(ax) && (ax.yAuto2 === false || Math.abs(dy) > 2))) { const s2 = dy / r.h * (d.yl2[1] - d.yl2[0]); this.setYlim2(ax, d.yl2[0] + s2, d.yl2[1] + s2); }
      if (d.zone === 'y2') { this.invalidate(); this.onChange('view'); return; }
      if (d.zone !== 'y') {
        let lo, hi;
        if (ax.xlog) { const l0 = Math.log10(d.xl[0]), l1 = Math.log10(d.xl[1]), s = -dx / r.w * (l1 - l0); lo = Math.pow(10, l0 + s); hi = Math.pow(10, l1 + s); }
        else { const s = -dx / r.w * (d.xl[1] - d.xl[0]); lo = d.xl[0] + s; hi = d.xl[1] + s; }
        this.setXlim(ax, lo, hi);
      }
      if (d.zone !== 'x') {
        if (ax.ylog) { const l0 = Math.log10(d.yl[0]), l1 = Math.log10(d.yl[1]), s = dy / r.h * (l1 - l0); this.setYlim(ax, Math.pow(10, l0 + s), Math.pow(10, l1 + s)); }
        else { const s = dy / r.h * (d.yl[1] - d.yl[0]); if (d.zone === 'y' || !ax.yAuto || Math.abs(dy) > 2) this.setYlim(ax, d.yl[0] + s, d.yl[1] + s); }
      }
      this.invalidate(); this.onChange('view');
    } else if (d.kind === 'rubber') { d.x1 = Math.min(Math.max(px, r.x), r.x + r.w); d.y1 = Math.min(Math.max(py, r.y), r.y + r.h); this.invalidate(); }
    else if (d.kind === 'lasso') { d.pts.push([Math.min(Math.max(px, r.x), r.x + r.w), Math.min(Math.max(py, r.y), r.y + r.h)]); this.invalidate(); }
    else if (d.kind === 'cursor') { this.placeCursor(ax, px, py, d.ci); }
  }
  _up(e) {
    const d = this.drag; if (!d) return; this.drag = null; this.cv.style.cursor = '';
    try { this.cv.releasePointerCapture(e.pointerId); } catch (_) {}
    const ax = d.ax;
    if (d.kind === 'rubber') {
      const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      if (d.mode === 'zoom') {
        if (w < 6 && h < 6) { const f = d.btn === 2 || d.shift ? 2 : 0.5, cx = this.pxX(ax, d.x0), cy = this.pxY(ax, d.y0); this.zoomX(ax, f, cx); this.zoomY(ax, f, cy); if (this.hasRight(ax)) this.zoomY2(ax, f, this._r(ax, () => this.pxY(ax, d.y0))); }
        else { const xa = this.pxX(ax, Math.min(d.x0, d.x1)), xb = this.pxX(ax, Math.max(d.x0, d.x1)), ya = this.pxY(ax, Math.max(d.y0, d.y1)), yb = this.pxY(ax, Math.min(d.y0, d.y1)); if (w >= 6) this.setXlim(ax, xa, xb); if (h >= 6) { if (this.hasRight(ax)) { const y2a = this._r(ax, () => this.pxY(ax, Math.max(d.y0, d.y1))), y2b = this._r(ax, () => this.pxY(ax, Math.min(d.y0, d.y1))); this.setYlim2(ax, y2a, y2b); } this.setYlim(ax, ya, yb); } }
        this.invalidate(); this.onChange('view');
      } else if (d.mode === 'box') {
        if (w < 3 && h < 3) { this.sel = null; this.onSelect(null); this.invalidate(); return; }
        const xa = this.pxX(ax, Math.min(d.x0, d.x1)), xb = this.pxX(ax, Math.max(d.x0, d.x1)), ya = this.pxY(ax, Math.max(d.y0, d.y1)), yb = this.pxY(ax, Math.min(d.y0, d.y1));
        this.makeSelection({axes: ax, type: 'box', x0: xa, x1: xb, y0: ya, y1: yb});
      }
    } else if (d.kind === 'lasso') {
      if (d.pts.length < 4) { this.sel = null; this.onSelect(null); this.invalidate(); return; }
      this.makeSelection({axes: ax, type: 'lasso', poly: d.pts.map(p => [this.pxX(ax, p[0]), this.pxY(ax, p[1])])});
    } else if (d.kind === 'pan') { this.onChange('view'); }
    this.invalidate();
  }
  // en yakın örneği bul ve imleç yerleştir
  // ci: değiştirilecek imleç sırası (-1 → tek imleç; cursors.length → yeni imleç)
  placeCursor(ax, px, py, ci) {
    if (ci === true) ci = this.cursors.length ? Math.min(this.cursors.length, 1) : -1; else if (ci === false || ci == null) ci = -1;
    let best = null;
    for (const tr of ax.traces) {
      if (!tr.visible) continue;
      const c = tr.yr ? this._r(ax, () => nearest(this, ax, tr, px, py)) : nearest(this, ax, tr, px, py); if (c && (!best || c.d < best.d)) best = c;
    }
    if (!best) return;
    const cur = {axes: ax, tr: best.tr, x: best.x, y: best.y, i: best.i};
    const snap = this.cursorOpt.snap; if (snap && snap !== 'off') this.snapCursor(cur, px, py, snap);
    if (ci < 0) this.cursors = [cur]; else this.cursors[ci] = cur;
    this.cursors = this.cursors.filter(Boolean);
    this.invalidate(); this.onChange('cursor');
  }
  // ±14 px içindeki yerel tepe / çukur (auto: tıklanan noktaya değer olarak en yakın uç)
  snapCursor(c, px, py, mode) {
    const ax = c.axes, tr = c.tr, w = 14, xa = this.pxX(ax, px - w), xb = this.pxX(ax, px + w);
    let a, b, get, tx;
    if (tr.kind === 'ts') { const ch = tr.ch; if (!ch.data) return; a = Math.max(0, Math.floor(ch.timeIdx(xa))); b = Math.min(ch.n - 1, Math.ceil(ch.timeIdx(xb))); get = i => (ch.del && ch.del[i]) ? NaN : ch.data[i]; tx = i => ch.t(i); }
    else if (tr.x && !tr.bars) { a = Math.max(0, lowerBound(tr.x, xa) - 1); b = Math.min(tr.x.length - 1, lowerBound(tr.x, xb)); get = i => tr.y[i]; tx = i => tr.x[i]; }
    else return;
    let imx = -1, imn = -1;
    for (let i = a; i <= b; i++) { const v = get(i); if (!isFinite(v)) continue; if (imx < 0 || v > get(imx)) imx = i; if (imn < 0 || v < get(imn)) imn = i; }
    if (imx < 0) return;
    let i = mode === 'peak' ? imx : mode === 'valley' ? imn : null;
    if (i == null) { const yv = tr.yr ? this._r(ax, () => this.pxY(ax, py)) : this.pxY(ax, py); i = Math.abs(get(imx) - yv) <= Math.abs(get(imn) - yv) ? imx : imn; }
    c.i = i; c.x = tx(i); c.y = get(i); c.snap = i === imx ? 'peak' : 'valley';
  }
  // imleç ölçümleri: ardışık çiftler için Δ, eğim, alan (yamuk), RMS, ortalama, min/maks; x / x₁ (harmonik oranı)
  cursorStats() {
    const cs = this.cursors, rows = [], pairs = [];
    cs.forEach((c, k) => rows.push({k, label: c.tr.label, x: c.x, y: c.y, ratio: k && cs[0].x ? c.x / cs[0].x : null, snap: c.snap || ''}));
    for (let k = 1; k < cs.length; k++) {
      const p = cs[k - 1], q = cs[k], dx = q.x - p.x, dy = q.y - p.y, o = {a: k - 1, b: k, dx, dy, inv: dx ? 1 / Math.abs(dx) : null, slope: dx ? dy / dx : null};
      if (p.tr === q.tr) {
        const tr = p.tr, lo = Math.min(p.x, q.x), hi = Math.max(p.x, q.x); let s1 = 0, s2 = 0, n = 0, area = 0, mn = Infinity, mx = -Infinity, px_ = null, py_ = null;
        const add = (x, v) => { if (!isFinite(v)) return; s1 += v; s2 += v * v; n++; if (v < mn) mn = v; if (v > mx) mx = v; if (px_ !== null) area += (x - px_) * (v + py_) / 2; px_ = x; py_ = v; };
        if (tr.kind === 'ts' && tr.ch.data) { const ch = tr.ch, i0 = Math.max(0, Math.ceil(ch.timeIdx(lo) - 1e-9)), i1 = Math.min(ch.n - 1, Math.floor(ch.timeIdx(hi) + 1e-9)); for (let i = i0; i <= i1; i++) { if (ch.del && ch.del[i]) continue; add(ch.t(i), ch.data[i]); } }
        else if (tr.x && tr.y) { const i0 = lowerBound(tr.x, lo), i1 = Math.min(tr.x.length - 1, lowerBound(tr.x, hi + 1e-12 * Math.abs(hi)) ); for (let i = i0; i <= i1 && i < tr.x.length; i++) if (tr.x[i] <= hi) add(tr.x[i], tr.y[i]); }
        if (n) Object.assign(o, {n, area, mean: s1 / n, rms: Math.sqrt(s2 / n), min: mn, max: mx, pp: mx - mn});
      }
      pairs.push(o);
    }
    return {rows, pairs};
  }
  makeSelection(sel) {
    // seçim kapsamındaki noktalar (yalnızca zaman izleri)
    const targets = this.selectionTargets ? this.selectionTargets(sel.axes) : sel.axes.traces.filter(t => t.visible);
    sel.hits = [];
    let sel2 = null;
    for (const tr of targets) {
      if (tr.kind !== 'ts' || !tr.ch.data) continue;
      let s = sel;
      if (tr.yr) { if (!sel2) { const ax = sel.axes, cv = v => this.leftToRight(ax, v); sel2 = sel.type === 'box' ? Object.assign({}, sel, {y0: Math.min(cv(sel.y0), cv(sel.y1)), y1: Math.max(cv(sel.y0), cv(sel.y1))}) : Object.assign({}, sel, {poly: sel.poly.map(p => [p[0], cv(p[1])])}); } s = sel2; }
      const idx = pointsIn(tr, s); if (idx.length) sel.hits.push({tr, idx});
    }
    this.sel = sel; this.onSelect(sel); this.invalidate();
  }
  clearSelection() { this.sel = null; this.onSelect(null); this.invalidate(); }

  toSVG(light = true) { const c = new SvgCtx(this.W, this.H), keep = this.cursors; this.render(c, this.W, this.H, light ? THEMES.light : curTheme(), true); this.cursors = keep; return c.toString(); }
  toPNG(scale = 2, light = true) {
    const w = this.W, h = this.H, c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
    const ctx = c.getContext('2d'); ctx.scale(scale, scale);
    const keep = this.cursors; this.render(ctx, w, h, light ? THEMES.light : curTheme(), true);
    this.cursors = keep; return c;
  }
}

// ---- iz yardımcıları ----
function trBounds(tr, xlog) {
  if (tr.kind === 'ts') { const ch = tr.ch; return [ch.t(0), ch.t(ch.n - 1)]; }
  if (tr.marker || tr.bars) { if (!tr._xb) { let lo = Infinity, hi = -Infinity, pl = Infinity; for (let i = 0; i < tr.x.length; i++) { const v = tr.x[i]; if (!isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; if (v > 0 && v < pl) pl = v; } const w = tr.bars ? tr.bars / 2 : 0; tr._xb = [lo - w, hi + w, pl]; } return isFinite(tr._xb[0]) ? [xlog ? tr._xb[2] : tr._xb[0], tr._xb[1]] : null; }
  const x = tr.x; if (!x || !x.length) return null;
  let lo = xlog ? Math.max(x[0], 1e-300) : x[0];
  if (xlog) for (let i = 0; i < x.length; i++) if (x[i] > 0) { lo = x[i]; break; }
  return [lo, x[x.length - 1]];
}
function lowerBound(a, v) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; }
function trYRange(tr, ax) {
  if (tr.kind === 'ts') {
    const ch = tr.ch; if (!ch.data) return null;
    const i0 = Math.max(0, Math.floor(ch.timeIdx(ax.xlim[0]))), i1 = Math.min(ch.n, Math.ceil(ch.timeIdx(ax.xlim[1])) + 1);
    if (i1 <= i0) return null; return ch.minmax(i0, i1) ? [ch._mn, ch._mx] : null;
  }
  if (tr.marker || tr.bars) { let lo = tr.bars ? 0 : Infinity, hi = -Infinity; for (let i = 0; i < tr.x.length; i++) { const xv = tr.x[i], v = tr.y[i]; if (!isFinite(v) || xv < ax.xlim[0] || xv > ax.xlim[1]) continue; if (ax.ylog && v <= 0) continue; if (v < lo) lo = v; if (v > hi) hi = v; } return isFinite(hi) && isFinite(lo) ? [lo, hi] : null; }
  const x = tr.x, y = tr.y; let i0 = Math.max(0, lowerBound(x, ax.xlim[0]) - 1), i1 = Math.min(x.length, lowerBound(x, ax.xlim[1]) + 1);
  let lo = Infinity, hi = -Infinity;
  for (let i = i0; i < i1; i++) { const v = y[i]; if (!isFinite(v)) continue; if (ax.ylog && v <= 0) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
  return isFinite(lo) ? [lo, hi] : null;
}
function drawTrace(ctx, tr, ax, P, T) {
  const r = ax.rect; ctx.lineWidth = tr.width || 1; ctx.strokeStyle = tr.color; ctx.fillStyle = tr.color; ctx.lineJoin = 'round';
  if (tr.kind === 'ts') {
    const ch = tr.ch;
    if (!ch.data) { ctx.fillStyle = T.muted; ctx.textAlign = 'center'; ctx.font = '12px system-ui'; ctx.fillText('Yükleniyor… ' + ch.label, r.x + r.w / 2, r.y + r.h / 2); return; }
    const x0 = ax.xlim[0], x1 = ax.xlim[1];
    const f0 = ch.timeIdx(x0), f1 = ch.timeIdx(x1);
    const i0 = Math.max(0, Math.floor(f0) - 1), i1 = Math.min(ch.n - 1, Math.ceil(f1) + 1);
    if (i1 < i0) return;
    const W = r.w, count = i1 - i0 + 1, y0 = ax.ylim[0], y1 = ax.ylim[1], ys = ax.ylog ? 0 : r.h / (y1 - y0);
    const Y = v => ax.ylog ? P.yPx(ax, v) : r.y + r.h - (v - y0) * ys, xs = r.w / (x1 - x0);
    const data = ch.data, del = ch.del;
    if (count <= 2 * W) {
      ctx.beginPath(); let pen = false, dRun = 0;   // silinen kısa boşluklar (≤20 örnek) çizgiyle köprülenir; NaN ve uzun silinmiş aralıklar çizgiyi keser
      for (let i = i0; i <= i1; i++) {
        const v = data[i];
        if (del && del[i]) { dRun++; continue; }
        if (!isFinite(v) || (ax.ylog && v <= 0)) { pen = false; dRun = 0; continue; }
        const x = r.x + (ch.t(i) - x0) * xs, y = Y(v);
        if (!pen || dRun > 20) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
        dRun = 0;
      }
      ctx.stroke();
      if (count < W / 3) { // az örnek: işaretçi
        for (let i = i0; i <= i1; i++) { const v = data[i]; if ((del && del[i]) || !isFinite(v)) continue; const x = r.x + (ch.t(i) - x0) * xs, y = Y(v); ctx.fillRect(x - 2, y - 2, 4, 4); }
      }
    } else {
      const cols = Math.floor(W), dt = (x1 - x0) / cols;
      ctx.beginPath(); let lastY = null, prevC = -2;
      for (let c = 0; c < cols; c++) {
        const a = Math.ceil(ch.timeIdx(x0 + c * dt)), b = Math.ceil(ch.timeIdx(x0 + (c + 1) * dt));
        const aa = Math.max(0, a), bb = Math.min(ch.n, b); if (bb <= aa) { continue; }
        if (!ch.minmax(aa, bb)) { prevC = -2; continue; }
        const px = r.x + c + 0.5, ya = Y(ch._mn), yb = Y(ch._mx);
        if (c - prevC > 1 || lastY === null) { ctx.moveTo(px, ya); lastY = ya; }
        if (Math.abs(lastY - ya) <= Math.abs(lastY - yb)) { ctx.lineTo(px, ya); ctx.lineTo(px, yb); lastY = yb; } else { ctx.lineTo(px, yb); ctx.lineTo(px, ya); lastY = ya; }
        prevC = c;
      }
      ctx.stroke();
    }
  } else if (tr.bars) { // histogram çubukları
    const x = tr.x, y = tr.y, w = tr.bars; ctx.globalAlpha = tr.alpha || 0.7;
    for (let i = 0; i < x.length; i++) { if (!(y[i] > 0)) continue; const a = P.xPx(ax, x[i] - w / 2), b = P.xPx(ax, x[i] + w / 2); if (b < r.x || a > r.x + r.w) continue; const y0 = P.yPx(ax, ax.ylog ? ax.ylim[0] : 0), y1 = P.yPx(ax, y[i]); ctx.fillRect(a + .5, y1, Math.max(1, b - a - 1), y0 - y1); }
    ctx.globalAlpha = 1;
  } else if (tr.marker) { // dağılım (scatter) işaretçileri
    const x = tr.x, y = tr.y, n = x.length, sz = tr.msize || 4, svg = ctx instanceof SvgCtx, step = Math.max(1, Math.floor(n / (svg ? 15000 : 200000)));
    let lut = null, cv = tr.cval; if (cv) { lut = cmapLUT('viridis'); }
    ctx.globalAlpha = tr.alpha || (n > 20000 ? 0.35 : n > 2000 ? 0.55 : 0.85);
    for (let i = 0; i < n; i += step) {
      const xv = x[i], yv = y[i]; if (!isFinite(xv) || !isFinite(yv) || (ax.ylog && yv <= 0) || (ax.xlog && xv <= 0)) continue; const px = P.xPx(ax, xv), py = P.yPx(ax, yv);
      if (px < r.x - sz || px > r.x + r.w + sz || py < r.y - sz || py > r.y + r.h + sz) continue;
      if (cv) { const q = Math.max(0, Math.min(255, Math.round((cv[i] - tr.cmin) / ((tr.cmax - tr.cmin) || 1) * 255))); ctx.fillStyle = `rgb(${lut[q * 3]},${lut[q * 3 + 1]},${lut[q * 3 + 2]})`; }
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  } else { // xy
    const x = tr.x, y = tr.y, n = x.length; if (!n) return;
    const i0 = Math.max(0, lowerBound(x, ax.xlim[0]) - 1), i1 = Math.min(n - 1, lowerBound(x, ax.xlim[1]) + 1), count = i1 - i0 + 1;
    const W = r.w;
    ctx.beginPath();
    if (count <= 3 * W) {
      let pen = false;
      for (let i = i0; i <= i1; i++) { const v = y[i]; if (!isFinite(v) || (ax.ylog && v <= 0) || (ax.xlog && x[i] <= 0)) { pen = false; continue; } const px = P.xPx(ax, x[i]), py = P.yPx(ax, v); if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py); }
    } else {
      const cols = Math.floor(W), mn = new Float64Array(cols).fill(Infinity), mx = new Float64Array(cols).fill(-Infinity);
      for (let i = i0; i <= i1; i++) { const v = y[i]; if (!isFinite(v) || (ax.ylog && v <= 0) || (ax.xlog && x[i] <= 0)) continue; let c = Math.floor(P.xPx(ax, x[i]) - r.x); if (c < 0 || c >= cols) continue; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
      let lastY = null;
      for (let c = 0; c < cols; c++) { if (mn[c] === Infinity) { lastY = null; continue; } const px = r.x + c + .5, ya = P.yPx(ax, mn[c]), yb = P.yPx(ax, mx[c]); if (lastY === null) { ctx.moveTo(px, ya); lastY = ya; } if (Math.abs(lastY - ya) <= Math.abs(lastY - yb)) { ctx.lineTo(px, ya); ctx.lineTo(px, yb); lastY = yb; } else { ctx.lineTo(px, yb); ctx.lineTo(px, ya); lastY = ya; } }
    }
    if (tr.dash) ctx.setLineDash(tr.dash);
    ctx.stroke(); ctx.setLineDash([]);
    if (tr.peaks) { ctx.fillStyle = T.fg; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; for (const p of tr.peaks) { const px = P.xPx(ax, p.x), py = P.yPx(ax, p.y); if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue; ctx.beginPath(); ctx.arc(px, py, 3, 0, 6.283); ctx.stroke(); const txt = fmtNum(p.x, 5) + ' Hz', w = ctx.measureText(txt).width; let ly = py - 7; const box = () => [px - w / 2, ly - 12, px + w / 2, ly + 2]; let b = box(), tries = 0; while (ax._lab.some(o => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3])) && tries++ < 6) { ly -= 13; b = box(); } if (b[1] < r.y) continue; ax._lab.push(b); ctx.fillStyle = tr.color; ctx.fillText(txt, px, ly); } }
  }
}
function nearest(P, ax, tr, px, py) {
  if (tr.marker) { let best = null; const x = tr.x, y = tr.y, step = Math.max(1, Math.floor(x.length / 300000)); for (let i = 0; i < x.length; i += step) { if (!isFinite(x[i]) || !isFinite(y[i])) continue; const d = Math.hypot(P.xPx(ax, x[i]) - px, P.yPx(ax, y[i]) - py); if (!best || d < best.d) best = {tr, d, x: x[i], y: y[i], i}; } return best; }
  if (tr.bars) return null;
  if (tr.kind === 'ts') {
    const ch = tr.ch; if (!ch.data) return null;
    const x = P.pxX(ax, px), fi = ch.timeIdx(x), spp = Math.max(1, (ax.xlim[1] - ax.xlim[0]) / ax.rect.w * (ch.n / Math.max(1e-9, ch.t(ch.n - 1) - ch.t(0)))), w = Math.ceil(spp * 3);
    const a = Math.max(0, Math.floor(fi) - w), b = Math.min(ch.n - 1, Math.ceil(fi) + w); let best = null;
    for (let i = a; i <= b; i++) {
      if ((ch.del && ch.del[i]) || !isFinite(ch.data[i])) continue;
      const X = P.xPx(ax, ch.t(i)), Yp = P.yPx(ax, ch.data[i]), d = Math.hypot(X - px, Yp - py);
      if (!best || d < best.d) best = {tr, d, x: ch.t(i), y: ch.data[i], i};
    }
    return best;
  }
  const x = tr.x, y = tr.y, xv = P.pxX(ax, px); let i = lowerBound(x, xv); let best = null;
  for (let k = Math.max(0, i - 40); k < Math.min(x.length, i + 40); k++) { if (!isFinite(y[k])) continue; const d = Math.hypot(P.xPx(ax, x[k]) - px, P.yPx(ax, y[k]) - py); if (!best || d < best.d) best = {tr, d, x: x[k], y: y[k], i: k}; }
  return best;
}
function pointsIn(tr, sel) {
  const ch = tr.ch, data = ch.data, del = ch.del;
  let xa, xb, ya, yb;
  if (sel.type === 'box') { xa = sel.x0; xb = sel.x1; ya = sel.y0; yb = sel.y1; }
  else { xa = Infinity; xb = -Infinity; ya = Infinity; yb = -Infinity; for (const p of sel.poly) { xa = Math.min(xa, p[0]); xb = Math.max(xb, p[0]); ya = Math.min(ya, p[1]); yb = Math.max(yb, p[1]); } }
  const i0 = Math.max(0, Math.floor(ch.timeIdx(xa)) - 1), i1 = Math.min(ch.n - 1, Math.ceil(ch.timeIdx(xb)) + 1);
  const out = [];
  for (let i = i0; i <= i1; i++) {
    if (del && del[i]) continue; const v = data[i]; if (!(v >= ya && v <= yb)) continue;
    const t = ch.t(i); if (t < xa || t > xb) continue;
    if (sel.type === 'lasso' && !inPoly(t, v, sel.poly)) continue;
    out.push(i);
  }
  return Uint32Array.from(out);
}
function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/* ---------- Spektrogram görünümü ---------- */
const CMAPS = {
  viridis: ['#440154', '#482878', '#3e4a89', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  turbo: ['#30123b', '#4662d7', '#36aaf9', '#1ae4b6', '#72fe5e', '#c7ef34', '#faba39', '#f66b19', '#ca2a04', '#7a0403'],
  inferno: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'],
  magma: ['#000004', '#180f3d', '#440f76', '#721f81', '#9e2f7f', '#cd4071', '#f1605d', '#fd9668', '#feca8d', '#fcfdbf'],
  jet: ['#00007f', '#0000ff', '#007fff', '#00ffff', '#7fff7f', '#ffff00', '#ff7f00', '#ff0000', '#7f0000'],
  gri: ['#000000', '#ffffff']
};
function cmapLUT(name) {
  const st = (CMAPS[name] || CMAPS.viridis).map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) { const p = i / 255 * (st.length - 1), a = Math.min(st.length - 2, Math.floor(p)), f = p - a; for (let k = 0; k < 3; k++) lut[i * 3 + k] = st[a][k] * (1 - f) + st[a + 1][k] * f; }
  return lut;
}
// Spektrogram: tıklama imleç (t, f) koyar; slices = true iken sağda o andaki spektrum, altta o frekanstaki seviye-zaman kesiti
// çizilir. logF = true: logaritmik frekans ekseni (görüntü log uzayında yeniden örneklenir).
class SpecView {
  constructor(canvas) {
    this.cv = canvas; this.spec = null; this.xlim = [0, 1]; this.ylim = [0, 1]; this.cmap = 'viridis'; this.clim = [-100, 0];
    this.dirty = false; this.onHover = () => {}; this.onCursor = () => {}; this.cur = null; this.slices = false; this.logF = false;
    this.dpr = devicePixelRatio || 1;
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(canvas.parentElement);
    canvas.addEventListener('wheel', e => this._wheel(e), {passive: false});
    canvas.addEventListener('pointerdown', e => { const [px, py] = this.pos(e); this.drag = {px, py, xl: this.xlim.slice(), yl: this.ylim.slice(), moved: false}; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => this._move(e));
    canvas.addEventListener('pointerup', e => { const d = this.drag; this.drag = null; if (d && !d.moved && e.button === 0) { const [px, py] = this.pos(e); this.setCursorPx(px, py); } });
    canvas.addEventListener('dblclick', () => this.fit());
    this.resize();
  }
  resize() { const p = this.cv.parentElement; this.W = p.clientWidth; this.H = p.clientHeight; if (!this.W) return; this.dpr = devicePixelRatio || 1; this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr; this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px'; this.invalidate(); }
  pos(e) { const b = this.cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
  rect() { const sl = this.slices && this.W > 520 && this.H > 320; return {x: 74, y: 12, w: this.W - 74 - 86 - (sl ? 160 : 0), h: this.H - 12 - 40 - (sl ? 120 : 0)}; }
  fMin() { return this.spec ? this.spec.df : 1; }
  // frekans ↔ eksen koordinatı (u) ↔ piksel
  u(f) { return this.logF ? Math.log10(Math.max(f, this.fMin() * 0.5)) : f; }
  uInv(u) { return this.logF ? Math.pow(10, u) : u; }
  fyl() { const lo = this.logF ? Math.max(this.ylim[0], this.fMin()) : this.ylim[0]; return [this.u(lo), this.u(this.ylim[1])]; }
  fy(f, r) { const [a, b] = this.fyl(); return r.y + r.h - (this.u(f) - a) / ((b - a) || 1) * r.h; }
  pyF(py, r) { const [a, b] = this.fyl(); return this.uInv(a + (1 - (py - r.y) / r.h) * (b - a)); }
  setSpec(s, fs, t0) {
    this.spec = s; this.fs = fs; this.t0 = t0 || 0; this.cur = null;
    // yüzdelik dilimlerle otomatik renk aralığı
    const smp = []; const st = Math.max(1, Math.floor(s.z.length / 20000)); for (let i = 0; i < s.z.length; i += st) smp.push(s.z[i]); smp.sort((a, b) => a - b);
    const hi = smp[Math.floor(smp.length * 0.998)]; this.clim = [Math.max(smp[Math.floor(smp.length * 0.05)], hi - 110), hi];
    this.fit(); this.rebuild();
  }
  setLog(on) { this.logF = !!on; if (this.spec) { this.ylim = [this.logF ? Math.max(this.ylim[0], this.fMin()) : this.ylim[0], this.ylim[1]]; this.rebuild(); } else this.invalidate(); }
  fit() { if (!this.spec) return; const s = this.spec; this.xlim = [this.t0 + s.tStart, this.t0 + s.tStart + (s.nf - 1) * s.dt]; if (this.xlim[1] <= this.xlim[0]) this.xlim[1] = this.xlim[0] + 1; this.ylim = [this.logF ? this.fMin() : 0, this.fs / 2]; this.invalidate(); }
  bin(t, f) { const s = this.spec; return [Math.max(0, Math.min(s.nf - 1, Math.round((t - this.t0 - s.tStart) / s.dt))), Math.max(0, Math.min(s.nb - 1, Math.round(f / s.df)))]; }
  rebuild() {
    const s = this.spec; if (!s) return;
    // görüntü satırları u ekseninde eşit aralıklı: doğrusal → her satır bir bin; log → M satır, en yakın bin
    let M, u0, u1, rowBin;
    if (this.logF) { M = Math.min(1024, Math.max(256, s.nb)); u0 = Math.log10(s.df * 0.5); u1 = Math.log10((s.nb - 0.5) * s.df); rowBin = new Int32Array(M); for (let j = 0; j < M; j++) rowBin[j] = Math.max(0, Math.min(s.nb - 1, Math.round(Math.pow(10, u0 + (j + 0.5) / M * (u1 - u0)) / s.df))); }
    else { M = s.nb; u0 = -s.df / 2; u1 = (s.nb - 0.5) * s.df; rowBin = null; }
    this.imgU = [u0, u1];
    const c = document.createElement('canvas'); c.width = s.nf; c.height = M; const g = c.getContext('2d'), im = g.createImageData(s.nf, M), lut = cmapLUT(this.cmap);
    const [lo, hi] = this.clim, sc = 255 / ((hi - lo) || 1);
    for (let f = 0; f < s.nf; f++) for (let j = 0; j < M; j++) { const k = rowBin ? rowBin[j] : j; const v = Math.max(0, Math.min(255, Math.round((s.z[f * s.nb + k] - lo) * sc))); const o = ((M - 1 - j) * s.nf + f) * 4; im.data[o] = lut[v * 3]; im.data[o + 1] = lut[v * 3 + 1]; im.data[o + 2] = lut[v * 3 + 2]; im.data[o + 3] = 255; }
    g.putImageData(im, 0, 0); this.img = c; this.invalidate();
  }
  invalidate() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = null; this.draw(); }); }
  draw() { const ctx = this.cv.getContext('2d'); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.render(ctx, this.W, this.H, curTheme()); }
  toPNG(scale = 2, light = true) { const c = document.createElement('canvas'); c.width = this.W * scale; c.height = this.H * scale; const g = c.getContext('2d'); g.scale(scale, scale); this.render(g, this.W, this.H, light ? THEMES.light : curTheme()); return c; }
  toSVG(light = true) { const c = new SvgCtx(this.W, this.H); this.render(c, this.W, this.H, light ? THEMES.light : curTheme()); return c.toString(); }
  // kesitler: o andaki spektrum (dB, bin başına) ve o frekanstaki zaman geçmişi
  sliceT(t) { const s = this.spec, [fi] = this.bin(t, 0), out = new Float64Array(s.nb); for (let k = 0; k < s.nb; k++) out[k] = s.z[fi * s.nb + k]; return out; }
  sliceF(f) { const s = this.spec, [, ki] = this.bin(0, f), out = new Float64Array(s.nf); for (let i = 0; i < s.nf; i++) out[i] = s.z[i * s.nb + ki]; return out; }
  setCursorPx(px, py) {
    const r = this.rect(); if (!this.spec || px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) return;
    this.setCursor(this.xlim[0] + (px - r.x) / r.w * (this.xlim[1] - this.xlim[0]), this.pyF(py, r));
  }
  setCursor(t, f) {
    if (!this.spec || t == null) { this.cur = null; this.invalidate(); this.onCursor(null); return; }
    const s = this.spec, [fi, ki] = this.bin(t, f); this.cur = {t: this.t0 + s.tStart + fi * s.dt, f: ki * s.df, v: s.z[fi * s.nb + ki], fi, ki};
    this.invalidate(); this.onCursor(this.cur);
  }
  render(ctx, W, H, T) {
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
    if (!this.spec) { ctx.fillStyle = T.muted; ctx.textAlign = 'center'; ctx.font = '14px system-ui'; ctx.fillText('Spektrogram için bir iz seçip "Hesapla"ya basın', W / 2, H / 2); return; }
    const r = this.rect(), s = this.spec;
    const tx = t => r.x + (t - this.xlim[0]) / (this.xlim[1] - this.xlim[0]) * r.w, fy = f => this.fy(f, r);
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    // görüntü koordinatları: x → kare, y → satır (üstte yüksek frekans, satırlar u ekseninde eşit)
    const tA = this.t0 + s.tStart, fA = t => (t - tA) / s.dt, M = this.img.height, [iu0, iu1] = this.imgU, [ua, ub] = this.fyl();
    const rowOf = u => M - (u - iu0) / (iu1 - iu0) * M;   // u → kaynak satır (üst kenar 0)
    const sx0 = fA(this.xlim[0]) + 0.5, sx1 = fA(this.xlim[1]) + 0.5, sy0 = rowOf(ub), sy1 = rowOf(ua);
    ctx.imageSmoothingEnabled = false;
    const cx0 = Math.max(0, sx0), cx1 = Math.min(s.nf, sx1), cy0 = Math.max(0, sy0), cy1 = Math.min(M, sy1);
    if (cx1 > cx0 && cy1 > cy0) {
      const dX0 = r.x + (cx0 - sx0) / (sx1 - sx0) * r.w, dX1 = r.x + (cx1 - sx0) / (sx1 - sx0) * r.w, dY0 = r.y + (cy0 - sy0) / (sy1 - sy0) * r.h, dY1 = r.y + (cy1 - sy0) / (sy1 - sy0) * r.h;
      ctx.drawImage(this.img, cx0, cy0, cx1 - cx0, cy1 - cy0, dX0, dY0, dX1 - dX0, dY1 - dY0);
    }
    const c = this.cur;
    if (c) {   // imleç artı işareti
      const X = Math.round(tx(c.t)) + .5, Y = Math.round(fy(c.f)) + .5;
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = .9; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, r.y); ctx.lineTo(X, r.y + r.h); ctx.moveTo(r.x, Y); ctx.lineTo(r.x + r.w, Y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      const lab = `t = ${fmtNum(c.t, 6)} s  f = ${fmtNum(c.f, 6)} Hz  ${c.v.toFixed(1)} dB`; ctx.font = '11px system-ui'; const w = ctx.measureText(lab).width + 10;
      let bx = X + 8, by = Y - 22; if (bx + w > r.x + r.w) bx = X - w - 8; if (by < r.y) by = Y + 6;
      ctx.globalAlpha = .85; ctx.fillStyle = '#000'; ctx.fillRect(bx, by, w, 17); ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lab, bx + 5, by + 9);
    }
    ctx.restore();
    ctx.strokeStyle = T.axis; ctx.strokeRect(r.x + .5, r.y + .5, r.w, r.h); ctx.fillStyle = T.fg; ctx.font = '11px system-ui';
    const xt = niceTicks(this.xlim[0], this.xlim[1], Math.max(3, r.w / 90));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const v of xt.ticks) ctx.fillText(fmtTick(v, xt.step), tx(v), r.y + r.h + 6);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of this.fTicks(r.h)) { const y = fy(v.v); if (y < r.y - 1 || y > r.y + r.h + 1) continue; ctx.fillText(v.t, r.x - 6, y); }
    ctx.fillStyle = T.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('Zaman (s)', r.x + r.w / 2, r.y + r.h + 22);
    ctx.save(); ctx.translate(14, r.y + r.h / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText('Frekans (Hz)' + (this.logF ? ' — log' : ''), 0, 0); ctx.restore();
    // renk çubuğu
    const bx = this.W - 86 + 18, bw = 14, lut = cmapLUT(this.cmap);
    for (let i = 0; i < r.h; i++) { const v = Math.round((1 - i / r.h) * 255); ctx.fillStyle = `rgb(${lut[v * 3]},${lut[v * 3 + 1]},${lut[v * 3 + 2]})`; ctx.fillRect(bx, r.y + i, bw, 1.5); }
    ctx.strokeStyle = T.axis; ctx.strokeRect(bx + .5, r.y + .5, bw, r.h); ctx.fillStyle = T.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const ct = niceTicks(this.clim[0], this.clim[1], 6); for (const v of ct.ticks) { const y = r.y + r.h - (v - this.clim[0]) / (this.clim[1] - this.clim[0]) * r.h; ctx.fillText(fmtTick(v, ct.step), bx + bw + 5, y); }
    ctx.fillStyle = T.muted; ctx.textAlign = 'left'; ctx.fillText('dB', bx, r.y - 1 + 0);
    if (r.w < this.W - 160) this.renderSlices(ctx, r, T, tx, fy);
  }
  fTicks(h) {
    if (!this.logF) { const yt = niceTicks(this.ylim[0], this.ylim[1], Math.max(3, h / 40)); return yt.ticks.map(v => ({v, t: fmtTick(v, yt.step)})); }
    const lo = Math.max(this.ylim[0], this.fMin()), hi = this.ylim[1], out = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of (hi / lo > 300 ? [1] : [1, 2, 5])) { const v = m * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push({v, t: fmtNum(v, 3)}); }
    return out;
  }
  renderSlices(ctx, r, T, tx, fy) {
    const s = this.spec, c = this.cur, [lo, hi] = this.clim, rng = (hi - lo) || 1;
    // sağ: spektrum kesiti (yatay dB, dikey frekans — ana grafikle aynı frekans ekseni)
    const R = {x: r.x + r.w + 12, y: r.y, w: 140, h: r.h}, B = {x: r.x, y: r.y + r.h + 40, w: r.w, h: 84};
    ctx.strokeStyle = T.axis; ctx.strokeRect(R.x + .5, R.y + .5, R.w, R.h); ctx.strokeRect(B.x + .5, B.y + .5, B.w, B.h);
    ctx.fillStyle = T.muted; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`${fmtNum(lo, 3)} … ${fmtNum(hi, 3)} dB`, R.x + R.w / 2, R.y + R.h + 6);
    if (!c) { ctx.fillText('kesit için tıklayın', R.x + R.w / 2, R.y + R.h / 2); ctx.fillText('Kesit: spektrogram üzerine tıklayın', B.x + B.w / 2, B.y + B.h / 2 - 6); return; }
    ctx.fillText(`t = ${fmtNum(c.t, 5)} s`, R.x + R.w / 2, R.y + 3);
    const sp = this.sliceT(c.t), ts = this.sliceF(c.f);
    ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip(); ctx.strokeStyle = T.fg; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let k = 0; k < s.nb; k++) { const f = k * s.df; if (this.logF && k === 0) continue; const x = R.x + (sp[k] - lo) / rng * R.w, y = fy(f); k === (this.logF ? 1 : 0) ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.strokeStyle = '#e15759'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(R.x, fy(c.f)); ctx.lineTo(R.x + R.w, fy(c.f)); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    // alt: zaman kesiti (o frekanstaki seviye)
    ctx.save(); ctx.beginPath(); ctx.rect(B.x, B.y, B.w, B.h); ctx.clip(); ctx.strokeStyle = T.fg; ctx.lineWidth = 1.2; ctx.beginPath();
    const tA = this.t0 + s.tStart; for (let i = 0; i < s.nf; i++) { const x = tx(tA + i * s.dt), y = B.y + B.h - (ts[i] - lo) / rng * B.h; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.strokeStyle = '#e15759'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(tx(c.t), B.y); ctx.lineTo(tx(c.t), B.y + B.h); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    ctx.fillStyle = T.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(`f = ${fmtNum(c.f, 5)} Hz`, B.x + 4, B.y + 3);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(fmtNum(hi, 3), B.x - 6, B.y + 6); ctx.fillText(fmtNum(lo, 3), B.x - 6, B.y + B.h - 6);
  }
  _wheel(e) {
    e.preventDefault(); const [px, py] = this.pos(e), r = this.rect(), f = Math.pow(1.0018, e.deltaY * (e.deltaMode === 1 ? 33 : 1));
    const cx = this.xlim[0] + (px - r.x) / r.w * (this.xlim[1] - this.xlim[0]);
    if (e.shiftKey || px < r.x) {
      const [a, b] = this.fyl(), cu = a + (1 - (py - r.y) / r.h) * (b - a), umin = this.u(this.logF ? this.fMin() : 0), umax = this.u(this.fs / 2);
      const na = Math.max(umin, cu - (cu - a) * f), nb = Math.min(umax, cu + (b - cu) * f); if (nb > na) this.ylim = [this.uInv(na), this.uInv(nb)];
    } else this.xlim = [cx - (cx - this.xlim[0]) * f, cx + (this.xlim[1] - cx) * f];
    this.invalidate();
  }
  _move(e) {
    const [px, py] = this.pos(e), r = this.rect();
    if (this.drag) {
      const d = this.drag; if (Math.abs(px - d.px) + Math.abs(py - d.py) > 3) d.moved = true;
      if (d.moved) {
        const dx = (px - d.px) / r.w * (d.xl[1] - d.xl[0]); this.xlim = [d.xl[0] - dx, d.xl[1] - dx];
        const ua = this.u(this.logF ? Math.max(d.yl[0], this.fMin()) : d.yl[0]), ub = this.u(d.yl[1]), du = (py - d.py) / r.h * (ub - ua); this.ylim = [this.uInv(ua + du), this.uInv(ub + du)];
        this.invalidate();
      }
    }
    if (this.spec && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
      const t = this.xlim[0] + (px - r.x) / r.w * (this.xlim[1] - this.xlim[0]), f = this.pyF(py, r), s = this.spec;
      const fi = Math.round((t - this.t0 - s.tStart) / s.dt), ki = Math.round(f / s.df); let v = null; if (fi >= 0 && fi < s.nf && ki >= 0 && ki < s.nb) v = s.z[fi * s.nb + ki];
      this.onHover({t, f, v});
    }
  }
}
