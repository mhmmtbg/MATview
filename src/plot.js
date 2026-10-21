/* Grafik motoru: Canvas, MATLAB benzeri etkileşim, büyük veri için min/max inceltme */
const PAL = ['#0072BD', '#D95319', '#EDB120', '#7E2F8E', '#77AC30', '#4DBEEE', '#A2142F'];
const THEMES = {
  light: {bg: '#ffffff', fg: '#1b1f24', axis: '#3a3f45', grid: '#e3e6ea', minor: '#f0f2f4', muted: '#6b7280', box: '#ffffff', sel: '#d62728'},
  dark: {bg: '#16191d', fg: '#e6e8eb', axis: '#aab0b8', grid: '#2c3137', minor: '#22262b', muted: '#8b929b', box: '#1e2227', sel: '#ff6b6b'}
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
  const out = [], minor = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    out.push(Math.pow(10, e));
    for (let m = 2; m < 10; m++) minor.push(m * Math.pow(10, e));
  }
  return {ticks: out, minor};
}
function fmtLog(v) { if (v >= 1000 && v < 1e6) return (v / 1000) + 'k'; if (v >= 1e6) return (v / 1e6) + 'M'; return +v.toPrecision(3) + ''; }

class Plot {
  constructor(canvas, opts = {}) {
    this.cv = canvas; this.opts = opts; this.mode = 'pan';
    this.axes = []; this.linkX = true; this.grid = true; this.legend = true; this.grms = {mode: 'off', dc: true};
    this.cursors = []; this.sel = null; this.playhead = null; this.hover = null;
    this.xBounds = null; this.dirty = true; this.dpr = window.devicePixelRatio || 1;
    this.onChange = opts.onChange || (() => {}); this.onSelect = opts.onSelect || (() => {}); this.onHover = opts.onHover || (() => {});
    this.onNeedData = opts.onNeedData || (() => {}); this.onDraw = opts.onDraw || (() => {});
    this.W = 0; this.H = 0;
    this._bind();
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(canvas.parentElement);
    this.resize();
  }
  addAxes(o = {}) {
    const ax = Object.assign({traces: [], xlim: [0, 1], ylim: [0, 1], yAuto: true, xlog: false, ylog: false, ylabel: '', xlabel: '', title: '', active: 0}, o);
    if (this.axes.length && this.linkX) ax.xlim = this.axes[0].xlim.slice();
    this.axes.push(ax); this.invalidate(); return ax;
  }
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
    const L = 74, R = 18, T = 10, B = 36, gap = 34;
    const titleH = 0;
    const avail = H - T - B - gap * (n - 1) - titleH * n;
    const h = Math.max(60, avail / n);
    this.axes.forEach((ax, i) => { ax.rect = {x: L, y: T + i * (h + gap), w: Math.max(50, W - L - R), h}; });
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
    const m = this.grms; if (!m || m.mode === 'off' || t.kind !== 'ts' || t.ch.kind !== 'vib' || !t.ch.data) return '';
    const ch = t.ch; let a = 0, b = ch.n;
    if (m.mode === 'vis') { a = Math.max(0, Math.floor(ch.timeIdx(ax.xlim[0]))); b = Math.min(ch.n, Math.ceil(ch.timeIdx(ax.xlim[1])) + 1); }
    const key = m.mode + ':' + a + ':' + b + ':' + ch.delCount + ':' + m.dc, c = t._grms;
    if (c && c.key === key) return c.txt;
    if (b - a > 3e6 && c && m.mode === 'vis') {   // etkileşim sırasında eski değeri göster, durulunca yeniden hesapla
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
    for (const ax of this.axes) {
      this.zoomX(ax, f, (ax.xlim[0] + ax.xlim[1]) / 2);
      if (!ax.yAuto) this.zoomY(ax, f, (ax.ylim[0] + ax.ylim[1]) / 2);
    }
    this.invalidate(); this.onChange('view');
  }
  zoomIn() { this.zoomOut(0.5); }
  fitAll(xOnly) {
    const b = this.bounds();
    for (const ax of this.axes) {
      if (this.linkX || true) {
        let lo = Infinity, hi = -Infinity;
        const src = this.linkX ? this.axes : [ax];
        for (const a of src) for (const tr of a.traces) { const bb = trBounds(tr, a.xlog); if (!bb) continue; lo = Math.min(lo, bb[0]); hi = Math.max(hi, bb[1]); }
        if (isFinite(lo)) { if (hi <= lo) hi = lo + 1; ax.xlim = [lo, hi]; }
      }
      if (!xOnly) { ax.yAuto = true; }
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
    if (!forExport) { this.drawOverlay(ctx, T); }
  }
  autoY(ax) {
    if (!ax.yAuto) return;
    let lo = Infinity, hi = -Infinity;
    for (const tr of ax.traces) {
      if (!tr.visible) continue;
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
    for (let k = 0; k < ax.traces.length; k++) { const tr = ax.traces[k]; if (tr.visible) drawTrace(ctx, tr, ax, this, T); }
    ctx.restore(); ctx.save();
    // çerçeve ve tikler
    ctx.strokeStyle = T.axis; ctx.strokeRect(r.x + .5, r.y + .5, r.w, r.h);
    if (this.active === ax && this.axes.length > 1) { ctx.fillStyle = '#0072BD'; ctx.fillRect(r.x - 3, r.y, 3, r.h); }
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
    ctx.fillStyle = T.muted; ctx.textBaseline = 'top';
    const xl = ax.xlabel || this.opts.xlabel || 'Zaman (s)';
    ctx.fillText(xl, r.x + r.w / 2, r.y + r.h + 19);
    if (ax.ylabel) { ctx.save(); ctx.translate(13, r.y + r.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ax.ylabel, 0, 0); ctx.restore(); }
    // gösterge
    if (this.legend) {
      const vis = ax.traces.filter(t => t.visible); if (vis.length) {
        ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const lbl = new Map(vis.map(t => [t, t.label + this.legendExtra(t, ax)])); let wmax = 0; for (const t of vis) wmax = Math.max(wmax, ctx.measureText(lbl.get(t)).width);
        const bw = wmax + 34, bh = vis.length * 16 + 6, bx = r.x + r.w - bw - 6, by = r.y + 6;
        ctx.globalAlpha = .92; ctx.fillStyle = T.box; ctx.fillRect(bx, by, bw, bh); ctx.globalAlpha = 1;
        ctx.strokeStyle = T.grid; ctx.strokeRect(bx + .5, by + .5, bw, bh);
        vis.forEach((t, i) => { const y = by + 11 + i * 16; ctx.strokeStyle = t.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx + 6, y); ctx.lineTo(bx + 22, y); ctx.stroke(); ctx.lineWidth = 1; ctx.fillStyle = T.fg; ctx.fillText(lbl.get(t), bx + 28, y); });
      }
    }
    ctx.restore();
  }
  drawOverlay(ctx, T) {
    // seçim kutusu / kement / yakınlaştırma çerçevesi
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
        for (let k = 0; k < idx.length; k += step) { const i = idx[k]; const x = this.xPx(ax, ch.t(i)), y = this.yPx(ax, ch.data[i]); ctx.fillRect(x - 2.5, y - 2.5, 5, 5); }
      }
      ctx.restore();
    }
    for (const b of this.bands || []) for (const ax of this.axes) { const r = ax.rect; const x0 = Math.max(r.x, this.xPx(ax, b.x0)), x1 = Math.min(r.x + r.w, this.xPx(ax, b.x1)); if (x1 > x0) { ctx.save(); ctx.globalAlpha = .13; ctx.fillStyle = b.color || '#2aa198'; ctx.fillRect(x0, r.y, x1 - x0, r.h); ctx.restore(); } }
    // veri imleçleri
    this.cursors.forEach((c, k) => this.drawCursor(ctx, c, k, T));
    if (this.playhead != null) for (const ax of this.axes) { const x = this.xPx(ax, this.playhead), r = ax.rect; if (x >= r.x && x <= r.x + r.w) { ctx.save(); ctx.strokeStyle = T.sel; ctx.beginPath(); ctx.moveTo(x + .5, r.y); ctx.lineTo(x + .5, r.y + r.h); ctx.stroke(); ctx.restore(); } }
  }
  drawCursor(ctx, c, k, T) {
    const ax = c.axes; if (!this.axes.includes(ax) || !ax.rect) return;
    const x = this.xPx(ax, c.x), y = this.yPx(ax, c.y), r = ax.rect;
    if (x < r.x - 1 || x > r.x + r.w + 1) return;
    ctx.save(); ctx.beginPath(); ctx.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); ctx.clip();
    ctx.strokeStyle = c.tr.color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x + .5, r.y); ctx.lineTo(x + .5, r.y + r.h); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = T.bg; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.283); ctx.fill(); ctx.stroke();
    const xl = this.opts.xName || 't', lines = [c.tr.label, `${xl} = ${fmtNum(c.x, 7)}`, `y = ${fmtNum(c.y, 6)}`];
    if (c.i != null) lines.push('i = ' + c.i);
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
    cv.addEventListener('pointerleave', () => { this.hover = null; this.onHover(null); });
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
  zoomX(ax, f, cx) { let [a, b] = ax.xlim; if (ax.xlog) { const l0 = Math.log10(a), l1 = Math.log10(b), c = Math.log10(cx); this.setXlim(ax, Math.pow(10, c - (c - l0) * f), Math.pow(10, c + (l1 - c) * f)); } else this.setXlim(ax, cx - (cx - a) * f, cx + (b - cx) * f); }
  zoomY(ax, f, cy) { let [a, b] = ax.ylim; if (ax.ylog) { const l0 = Math.log10(a), l1 = Math.log10(b), c = Math.log10(cy); this.setYlim(ax, Math.pow(10, c - (c - l0) * f), Math.pow(10, c + (l1 - c) * f)); } else this.setYlim(ax, cy - (cy - a) * f, cy + (b - cy) * f); }
  _wheel(e) {
    const h = this.hit(e); if (!h) return; e.preventDefault();
    const f = Math.pow(1.0018, e.deltaY * (e.deltaMode === 1 ? 33 : 1)), {ax} = h;
    const cx = this.pxX(ax, Math.min(Math.max(h.px, ax.rect.x), ax.rect.x + ax.rect.w)), cy = this.pxY(ax, Math.min(Math.max(h.py, ax.rect.y), ax.rect.y + ax.rect.h));
    if (h.zone === 'y' || (h.zone === 'plot' && e.shiftKey)) this.zoomY(ax, f, cy);
    else if (h.zone === 'x' || !e.ctrlKey) this.zoomX(ax, f, cx);
    else { this.zoomX(ax, f, cx); this.zoomY(ax, f, cy); }
    this.invalidate(); this.onChange('view');
  }
  _down(e) {
    const h = this.hit(e); if (!h) return; this.cv.setPointerCapture(e.pointerId);
    const {ax, px, py} = h; const rb = e.button === 2; if (this.active !== ax) { this.active = ax; this.onChange('active'); this.invalidate(); }
    this.drag = {ax, zone: h.zone, x0: px, y0: py, x1: px, y1: py, xl: ax.xlim.slice(), yl: ax.ylim.slice(), moved: false, btn: e.button, shift: e.shiftKey};
    if (h.zone !== 'plot') { this.drag.kind = 'pan'; return; }
    if (this.mode === 'pan' || e.button === 1) { this.drag.kind = 'pan'; this.cv.style.cursor = 'grabbing'; }
    else if (this.mode === 'zoom') { this.drag.kind = 'rubber'; this.drag.mode = 'zoom'; }
    else if (this.mode === 'box') { this.drag.kind = 'rubber'; this.drag.mode = 'box'; }
    else if (this.mode === 'lasso') { this.drag.kind = 'lasso'; this.drag.pts = [[px, py]]; }
    else if (this.mode === 'cursor') { this.drag.kind = 'cursor'; this.placeCursor(ax, px, py, e.shiftKey); }
  }
  _move(e) {
    const d = this.drag;
    if (!d) {
      const h = this.hit(e);
      if (h && h.zone === 'plot') { const x = this.pxX(h.ax, h.px), y = this.pxY(h.ax, h.py); this.onHover({x, y, ax: h.ax}); } else this.onHover(null);
      this.cv.style.cursor = !h ? 'default' : h.zone === 'y' ? 'ns-resize' : h.zone === 'x' ? 'ew-resize' : ({pan: 'grab', zoom: 'zoom-in', cursor: 'crosshair', box: 'crosshair', lasso: 'crosshair'}[this.mode] || 'default');
      return;
    }
    const [px, py] = this.pos(e); d.x1 = px; d.y1 = py;
    if (Math.abs(px - d.x0) + Math.abs(py - d.y0) > 3) d.moved = true;
    const ax = d.ax, r = ax.rect;
    if (d.kind === 'pan') {
      const dx = px - d.x0, dy = py - d.y0;
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
    else if (d.kind === 'cursor') { this.placeCursor(ax, px, py, d.shift); }
  }
  _up(e) {
    const d = this.drag; if (!d) return; this.drag = null; this.cv.style.cursor = '';
    try { this.cv.releasePointerCapture(e.pointerId); } catch (_) {}
    const ax = d.ax;
    if (d.kind === 'rubber') {
      const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      if (d.mode === 'zoom') {
        if (w < 6 && h < 6) { const f = d.btn === 2 || d.shift ? 2 : 0.5, cx = this.pxX(ax, d.x0), cy = this.pxY(ax, d.y0); this.zoomX(ax, f, cx); this.zoomY(ax, f, cy); }
        else { const xa = this.pxX(ax, Math.min(d.x0, d.x1)), xb = this.pxX(ax, Math.max(d.x0, d.x1)), ya = this.pxY(ax, Math.max(d.y0, d.y1)), yb = this.pxY(ax, Math.min(d.y0, d.y1)); if (w >= 6) this.setXlim(ax, xa, xb); if (h >= 6) this.setYlim(ax, ya, yb); }
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
  placeCursor(ax, px, py, add) {
    let best = null;
    for (const tr of ax.traces) {
      if (!tr.visible) continue;
      const c = nearest(this, ax, tr, px, py); if (c && (!best || c.d < best.d)) best = c;
    }
    if (!best) return;
    const cur = {axes: ax, tr: best.tr, x: best.x, y: best.y, i: best.i};
    if (add && this.cursors.length) { this.cursors = [this.cursors[0], cur]; } else this.cursors = [cur];
    this.invalidate(); this.onChange('cursor');
  }
  makeSelection(sel) {
    // seçim kapsamındaki noktalar (yalnızca zaman izleri)
    const targets = this.selectionTargets ? this.selectionTargets(sel.axes) : sel.axes.traces.filter(t => t.visible);
    sel.hits = [];
    for (const tr of targets) {
      if (tr.kind !== 'ts' || !tr.ch.data) continue;
      const idx = pointsIn(tr, sel); if (idx.length) sel.hits.push({tr, idx});
    }
    this.sel = sel; this.onSelect(sel); this.invalidate();
  }
  clearSelection() { this.sel = null; this.onSelect(null); this.invalidate(); }

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
      ctx.beginPath(); let pen = false;
      for (let i = i0; i <= i1; i++) {
        const v = data[i];
        if ((del && del[i]) || !isFinite(v) || (ax.ylog && v <= 0)) { pen = false; continue; }
        const x = r.x + (ch.t(i) - x0) * xs, y = Y(v);
        if (!pen) { ctx.moveTo(x, y); pen = true; if (i === i0 || true) { /* tek nokta için */ } } else ctx.lineTo(x, y);
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
    ctx.stroke();
    if (tr.peaks) { ctx.fillStyle = T.fg; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; for (const p of tr.peaks) { const px = P.xPx(ax, p.x), py = P.yPx(ax, p.y); if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue; ctx.beginPath(); ctx.arc(px, py, 3, 0, 6.283); ctx.stroke(); const txt = fmtNum(p.x, 5) + ' Hz', w = ctx.measureText(txt).width; let ly = py - 7; const box = () => [px - w / 2, ly - 12, px + w / 2, ly + 2]; let b = box(), tries = 0; while (ax._lab.some(o => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3])) && tries++ < 6) { ly -= 13; b = box(); } if (b[1] < r.y) continue; ax._lab.push(b); ctx.fillStyle = tr.color; ctx.fillText(txt, px, ly); } }
  }
}
function nearest(P, ax, tr, px, py) {
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
  gri: ['#000000', '#ffffff']
};
function cmapLUT(name) {
  const st = CMAPS[name].map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) { const p = i / 255 * (st.length - 1), a = Math.min(st.length - 2, Math.floor(p)), f = p - a; for (let k = 0; k < 3; k++) lut[i * 3 + k] = st[a][k] * (1 - f) + st[a + 1][k] * f; }
  return lut;
}
class SpecView {
  constructor(canvas) {
    this.cv = canvas; this.spec = null; this.xlim = [0, 1]; this.ylim = [0, 1]; this.cmap = 'viridis'; this.clim = [-100, 0];
    this.dirty = false; this.onHover = () => {};
    this.dpr = devicePixelRatio || 1;
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(canvas.parentElement);
    canvas.addEventListener('wheel', e => this._wheel(e), {passive: false});
    canvas.addEventListener('pointerdown', e => { const [px, py] = this.pos(e); this.drag = {px, py, xl: this.xlim.slice(), yl: this.ylim.slice()}; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => this._move(e));
    canvas.addEventListener('pointerup', () => { this.drag = null; });
    canvas.addEventListener('dblclick', () => this.fit());
    this.resize();
  }
  resize() { const p = this.cv.parentElement; this.W = p.clientWidth; this.H = p.clientHeight; if (!this.W) return; this.dpr = devicePixelRatio || 1; this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr; this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px'; this.invalidate(); }
  pos(e) { const b = this.cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
  rect() { return {x: 74, y: 12, w: this.W - 74 - 86, h: this.H - 12 - 40}; }
  setSpec(s, fs, t0) {
    this.spec = s; this.fs = fs; this.t0 = t0 || 0; const dur = s.nf * s.dt;
    // yüzdelik dilimlerle otomatik renk aralığı
    const smp = []; const st = Math.max(1, Math.floor(s.z.length / 20000)); for (let i = 0; i < s.z.length; i += st) smp.push(s.z[i]); smp.sort((a, b) => a - b);
    const hi = smp[Math.floor(smp.length * 0.998)]; this.clim = [Math.max(smp[Math.floor(smp.length * 0.05)], hi - 110), hi];
    this.fit(); this.rebuild();
  }
  fit() { if (!this.spec) return; const s = this.spec; this.xlim = [this.t0 + s.tStart, this.t0 + s.tStart + (s.nf - 1) * s.dt]; if (this.xlim[1] <= this.xlim[0]) this.xlim[1] = this.xlim[0] + 1; this.ylim = [0, this.fs / 2]; this.invalidate(); }
  rebuild() {
    const s = this.spec; if (!s) return; const c = document.createElement('canvas'); c.width = s.nf; c.height = s.nb; const g = c.getContext('2d'), im = g.createImageData(s.nf, s.nb), lut = cmapLUT(this.cmap);
    const [lo, hi] = this.clim, sc = 255 / ((hi - lo) || 1);
    for (let f = 0; f < s.nf; f++) for (let k = 0; k < s.nb; k++) { const v = Math.max(0, Math.min(255, Math.round((s.z[f * s.nb + k] - lo) * sc))); const o = ((s.nb - 1 - k) * s.nf + f) * 4; im.data[o] = lut[v * 3]; im.data[o + 1] = lut[v * 3 + 1]; im.data[o + 2] = lut[v * 3 + 2]; im.data[o + 3] = 255; }
    g.putImageData(im, 0, 0); this.img = c; this.invalidate();
  }
  invalidate() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = null; this.draw(); }); }
  draw() {
    const ctx = this.cv.getContext('2d'), T = curTheme(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillStyle = T.bg; ctx.fillRect(0, 0, this.W, this.H);
    if (!this.spec) { ctx.fillStyle = T.muted; ctx.textAlign = 'center'; ctx.font = '14px system-ui'; ctx.fillText('Spektrogram için bir iz seçip "Hesapla"ya basın', this.W / 2, this.H / 2); return; }
    const r = this.rect(), s = this.spec;
    const tx = t => r.x + (t - this.xlim[0]) / (this.xlim[1] - this.xlim[0]) * r.w, fy = f => r.y + r.h - (f - this.ylim[0]) / (this.ylim[1] - this.ylim[0]) * r.h;
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    // görüntü koordinatları: x -> kare, y -> bin (üstte yüksek frekans)
    const tA = this.t0 + s.tStart, fA = (t) => (t - tA) / s.dt;
    const sx0 = fA(this.xlim[0]) - 0.5, sx1 = fA(this.xlim[1]) + 0.5, sy0 = s.nb - 1 - this.ylim[1] / s.df - 0.5 + 0.5, sy1 = s.nb - 1 - this.ylim[0] / s.df + 0.5;
    ctx.imageSmoothingEnabled = false;
    const dx0 = tx(tA + (Math.floor(sx0) + 0.5) * s.dt - 0 * s.dt), dummy = 0;
    // basit eşleme: kaynak dikdörtgeni hedefe ölçekle
    const cx0 = Math.max(0, sx0), cx1 = Math.min(s.nf, sx1), cy0 = Math.max(0, sy0), cy1 = Math.min(s.nb, sy1);
    if (cx1 > cx0 && cy1 > cy0) {
      const dX0 = r.x + (cx0 - sx0) / (sx1 - sx0) * r.w, dX1 = r.x + (cx1 - sx0) / (sx1 - sx0) * r.w, dY0 = r.y + (cy0 - sy0) / (sy1 - sy0) * r.h, dY1 = r.y + (cy1 - sy0) / (sy1 - sy0) * r.h;
      ctx.drawImage(this.img, cx0, cy0, cx1 - cx0, cy1 - cy0, dX0, dY0, dX1 - dX0, dY1 - dY0);
    }
    ctx.restore();
    ctx.strokeStyle = T.axis; ctx.strokeRect(r.x + .5, r.y + .5, r.w, r.h); ctx.fillStyle = T.fg; ctx.font = '11px system-ui';
    const xt = niceTicks(this.xlim[0], this.xlim[1], Math.max(3, r.w / 90)), yt = niceTicks(this.ylim[0], this.ylim[1], Math.max(3, r.h / 40));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const v of xt.ticks) ctx.fillText(fmtTick(v, xt.step), tx(v), r.y + r.h + 6);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const v of yt.ticks) ctx.fillText(fmtTick(v, yt.step), r.x - 6, fy(v));
    ctx.fillStyle = T.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('Zaman (s)', r.x + r.w / 2, r.y + r.h + 22);
    ctx.save(); ctx.translate(14, r.y + r.h / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText('Frekans (Hz)', 0, 0); ctx.restore();
    // renk çubuğu
    const bx = r.x + r.w + 18, bw = 14, lut = cmapLUT(this.cmap);
    for (let i = 0; i < r.h; i++) { const v = Math.round((1 - i / r.h) * 255); ctx.fillStyle = `rgb(${lut[v * 3]},${lut[v * 3 + 1]},${lut[v * 3 + 2]})`; ctx.fillRect(bx, r.y + i, bw, 1.5); }
    ctx.strokeStyle = T.axis; ctx.strokeRect(bx + .5, r.y + .5, bw, r.h); ctx.fillStyle = T.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const ct = niceTicks(this.clim[0], this.clim[1], 6); for (const v of ct.ticks) { const y = r.y + r.h - (v - this.clim[0]) / (this.clim[1] - this.clim[0]) * r.h; ctx.fillText(fmtTick(v, ct.step), bx + bw + 5, y); }
    ctx.fillStyle = T.muted; ctx.textAlign = 'left'; ctx.fillText('dB', bx, r.y - 1 + 0);
  }
  _wheel(e) {
    e.preventDefault(); const [px, py] = this.pos(e), r = this.rect(), f = Math.pow(1.0018, e.deltaY * (e.deltaMode === 1 ? 33 : 1));
    const cx = this.xlim[0] + (px - r.x) / r.w * (this.xlim[1] - this.xlim[0]), cy = this.ylim[0] + (1 - (py - r.y) / r.h) * (this.ylim[1] - this.ylim[0]);
    if (e.shiftKey || px < r.x) this.ylim = [Math.max(0, cy - (cy - this.ylim[0]) * f), Math.min(this.fs / 2, cy + (this.ylim[1] - cy) * f)]; else this.xlim = [cx - (cx - this.xlim[0]) * f, cx + (this.xlim[1] - cx) * f];
    this.invalidate();
  }
  _move(e) {
    const [px, py] = this.pos(e), r = this.rect();
    if (this.drag) { const dx = (px - this.drag.px) / r.w * (this.drag.xl[1] - this.drag.xl[0]), dy = (py - this.drag.py) / r.h * (this.drag.yl[1] - this.drag.yl[0]); this.xlim = [this.drag.xl[0] - dx, this.drag.xl[1] - dx]; this.ylim = [this.drag.yl[0] + dy, this.drag.yl[1] + dy]; this.invalidate(); }
    if (this.spec && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
      const t = this.xlim[0] + (px - r.x) / r.w * (this.xlim[1] - this.xlim[0]), f = this.ylim[0] + (1 - (py - r.y) / r.h) * (this.ylim[1] - this.ylim[0]), s = this.spec;
      const fi = Math.round((t - this.t0 - s.tStart) / s.dt), ki = Math.round(f / s.df); let v = null; if (fi >= 0 && fi < s.nf && ki >= 0 && ki < s.nb) v = s.z[fi * s.nb + ki];
      this.onHover({t, f, v});
    }
  }
}
