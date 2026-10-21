/* Veri modeli: Kanal, zaman haritası, piramit, maskeleme, dosya içe aktarma */
const KIND = {
  ac: {name: 'Akustik', ylabel: 'Akustik', color: '#0072BD'}, vib: {name: 'Titreşim', ylabel: 'Titreşim', color: '#D95319'},
  temp: {name: 'Sıcaklık', ylabel: 'Sıcaklık', color: '#A2142F'}, press: {name: 'Basınç', ylabel: 'Basınç', color: '#7E2F8E'},
  strain: {name: 'Gerinim', ylabel: 'Gerinim', color: '#77AC30'}, volt: {name: 'Gerilim', ylabel: 'Gerilim', color: '#EDB120'},
  curr: {name: 'Akım', ylabel: 'Akım', color: '#4DBEEE'}, pos: {name: 'Konum/Açı', ylabel: 'Konum/Açı', color: '#5b7c99'},
  state: {name: 'Durum/Bit', ylabel: 'Durum', color: '#8b929b'}, other: {name: 'Diğer', ylabel: '', color: '#8b929b'}, spec: {name: 'Spektrum (UNV)', ylabel: '', color: '#b58900'}, calc: {name: 'Türetilmiş', ylabel: '', color: '#2aa198'}
};
function kindOf(full, rest) {
  const s = rest.toLowerCase();
  if (/_related$/.test(s)) return 'other';
  if (/cbit|_bit_|bit_|^tm/.test(s)) return 'state';
  if (/^as\d/.test(s)) return 'ac';
  if (/^ts/.test(s)) return 'vib';
  if (/^(ss|hs)\d/.test(s)) return 'temp';
  if (/^p?bs/.test(s)) return 'press';
  if (/^gs\d/.test(s)) return 'strain';
  if (/^(cnt|tmp)$/.test(s)) return 'other';
  if (/tsens|temp|sicak/.test(s)) return 'temp';
  if (/volt|gerilim|_v$|supply.*v/.test(s) && !/akim|current/.test(s)) return 'volt';
  if (/akim|current|_a$/.test(s)) return 'curr';
  if (/pos|enc|deg|angle|aci/.test(s)) return 'pos';
  if (/cbit|bit|state|cntr|durum|^tm$/.test(s)) return 'state';
  return 'other';
}

const PYR_B = 32;
class Channel {
  constructor(o) {
    Object.assign(this, {t0: 0, data: null, del: null, delCount: 0, pyr: null, derived: false, g: null, spp: 1, Tpkt: 1, dtS: 1, loading: null, uid: Channel.seq++}, o);
  }
  get fs() { return this.g ? this.spp / this.Tpkt : 1 / this.dtS; }
  setFs(fs) { if (this.g) this.Tpkt = this.spp / fs; else this.dtS = 1 / fs; }
  copyTiming(o) { this.t0 = o.t0; this.g = o.g; this.spp = o.spp; this.Tpkt = o.Tpkt; this.dtS = o.dtS; }
  t(i) {
    if (!this.g) return this.t0 + i * this.dtS;
    let k = Math.floor(i / this.spp); const L = this.g.length; if (k >= L) k = L - 1; if (k < 0) k = 0;
    return this.t0 + (this.g[k] + (i - k * this.spp) / this.spp) * this.Tpkt;
  }
  timeIdx(t) {
    t -= this.t0; if (!this.g) return t / this.dtS;
    const g = this.g, pp = t / this.Tpkt; if (pp <= g[0]) return pp * this.spp;
    let lo = 0, hi = g.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m] <= pp) lo = m; else hi = m - 1; }
    let f = pp - g[lo]; if (lo < g.length - 1 && f > 1) f = 1;
    return (lo + f) * this.spp;
  }
  get duration() { return this.t(this.n - 1); }
  buildPyr() {
    const n = this.n, nb = Math.ceil(n / PYR_B), mn = new Float64Array(nb), mx = new Float64Array(nb);
    for (let b = 0; b < nb; b++) this._blk(b, mn, mx);
    this.pyr = {mn, mx};
  }
  _blk(b, mn, mx) {
    const d = this.data, del = this.del, a = b * PYR_B, e = Math.min(this.n, a + PYR_B); let lo = Infinity, hi = -Infinity;
    for (let i = a; i < e; i++) { const v = d[i]; if ((del && del[i]) || !isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    mn[b] = lo; mx[b] = hi;
  }
  // [a,b) aralığında min/max -> this._mn/_mx; veri yoksa false
  minmax(a, b) {
    const d = this.data, del = this.del; let lo = Infinity, hi = -Infinity;
    a = Math.max(0, a | 0); b = Math.min(this.n, b | 0);
    if (b - a >= 4 * PYR_B) {
      if (!this.pyr) this.buildPyr();
      const ba = Math.ceil(a / PYR_B), bb = Math.floor(b / PYR_B), pm = this.pyr.mn, px = this.pyr.mx;
      for (let i = a, e = ba * PYR_B; i < e; i++) { const v = d[i]; if ((del && del[i]) || !isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
      for (let k = ba; k < bb; k++) { if (pm[k] < lo) lo = pm[k]; if (px[k] > hi) hi = px[k]; }
      for (let i = bb * PYR_B; i < b; i++) { const v = d[i]; if ((del && del[i]) || !isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    } else {
      for (let i = a; i < b; i++) { const v = d[i]; if ((del && del[i]) || !isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    this._mn = lo; this._mx = hi; return lo <= hi;
  }
  // silinen indeksleri maskele; gerçekten yeni silinenleri döndürür
  applyDelete(idx) {
    if (!this.del) this.del = new Uint8Array(this.n);
    const del = this.del, blocks = new Set(), out = [];
    for (let k = 0; k < idx.length; k++) { const i = idx[k]; if (!del[i]) { del[i] = 1; out.push(i); blocks.add((i / PYR_B) | 0); } }
    this.delCount += out.length; this._fixBlocks(blocks); return Uint32Array.from(out);
  }
  restore(idx) {
    const del = this.del; if (!del) return; const blocks = new Set(); let c = 0;
    for (let k = 0; k < idx.length; k++) { const i = idx[k]; if (del[i]) { del[i] = 0; c++; blocks.add((i / PYR_B) | 0); } }
    this.delCount -= c; this._fixBlocks(blocks);
  }
  _fixBlocks(blocks) { if (!this.pyr) return; for (const b of blocks) this._blk(b, this.pyr.mn, this.pyr.mx); }
}
Channel.seq = 1;

function sanitizeName(s) { s = s.replace(/[^A-Za-z0-9_]/g, '_'); if (!/^[A-Za-z]/.test(s)) s = 'v_' + s; return s.slice(0, 60); }

const DEFAULTS = {Tpkt: 0.010, baseFs: 200};
const DEV_RE = /^([A-Za-z0-9]+?)_anak_?(\d+)_(\d+)_(.+)$/;

async function importFile(file, onProgress) {
  const mat = await MAT.open(file);
  const f = {id: 'f' + (importFile.seq++), name: file.name, mat, vars: mat.vars, channels: [], mcache: new Map(), Tpkt: DEFAULTS.Tpkt, baseFs: DEFAULTS.baseFs, cnts: {}};
  // paket sayaçları
  for (let vi = 0; vi < mat.vars.length; vi++) {
    const v = mat.vars[vi]; const m = /^([A-Za-z0-9]+?)_anak_?(\d+)_(\d+)_cnt$/.exec(v.name);
    if (m && v.numeric) f.cnts[m[1] + '|' + m[2] + '_' + m[3]] = vi;
  }
  // dosya düzeyi temel uzunluk (cnt'siz kanallar için)
  let baseN = 0;
  for (const v of mat.vars) if (v.numeric && Math.min(...v.dims) === 1) baseN = Math.max(baseN, v.count);
  f.baseN = baseN;
  for (let vi = 0; vi < mat.vars.length; vi++) {
    const v = mat.vars[vi]; if (!v.numeric || v.count < 2) continue;
    const full = v.name, m = DEV_RE.exec(full);
    let pre, dev, rest;
    if (m) { pre = m[1]; dev = 'anak' + m[2] + '_' + m[3]; rest = m[4]; } else { const k = full.indexOf('_'); pre = k > 0 ? full.slice(0, k) : full; dev = pre; rest = k > 0 ? full.slice(k + 1) : full; }
    const dims = v.dims, vec = dims.length === 2 && Math.min(dims[0], dims[1]) === 1;
    const mk = (nm, restN, n, extra) => {
      const base = restN.replace(/_(X|Y|Z|\d+)$/, ''), comp = restN === base ? '' : restN.slice(base.length + 1);
      return new Channel(Object.assign({name: nm, rest: restN, base, comp, file: f, dev, devKey: m ? devKeyOf(full) : null, kind: kindOf(full, restN), n, varIdx: vi, label: nm}, extra));
    };
    if (vec) f.channels.push(mk(full, rest, v.count));
    else {
      const R = dims[0], C = dims[1];
      if (R <= C && R <= 256) for (let r = 0; r < R; r++) f.channels.push(mk(full + '[' + (r + 1) + ']', rest + '[' + (r + 1) + ']', C, {row: r, R, C, rowMode: 'row'}));
      else if (C < R && C <= 256) for (let c = 0; c < C; c++) f.channels.push(mk(full + '[' + (c + 1) + ']', rest + '[' + (c + 1) + ']', R, {row: c, R, C, rowMode: 'col'}));
    }
  }
  // sayaçları yükle ve zamanlamayı hesapla
  const gcache = {};
  for (const ch of f.channels) {
    if (ch.devKey && f.cnts[ch.devKey] != null && !gcache[ch.devKey]) {
      const cv = mat.vars[f.cnts[ch.devKey]]; const c = await MAT.load(mat, cv);
      const g = new Float64Array(c.length); let acc = 0;
      for (let k = 1; k < c.length; k++) { let d = ((c[k] - c[k - 1]) % 65536 + 65536) % 65536; if (d === 0 || d > 5000) d = 1; acc += d; g[k] = acc; }
      gcache[ch.devKey] = {g, np: c.length, lost: countLost(g)};
    }
  }
  f.gcache = gcache;
  applyTiming(f);
  return f;
}
importFile.seq = 1;
function countLost(g) { let c = 0; for (let k = 1; k < g.length; k++) if (g[k] - g[k - 1] > 1) c += g[k] - g[k - 1] - 1; return c; }
function devKeyOf(full) { const m = DEV_RE.exec(full); return m ? m[1] + '|' + m[2] + '_' + m[3] : null; }

function applyTiming(f) {
  for (const ch of f.channels) {
    if (ch.derived || ch.bin || ch.spec) continue;
    const gc = ch.devKey && f.gcache ? f.gcache[ch.devKey] : null;
    if (gc) { ch.g = gc.g; ch.spp = ch.n / gc.np; ch.Tpkt = f.Tpkt; ch.dtS = ch.Tpkt / ch.spp; }
    else { ch.g = null; ch.dtS = 1 / (f.baseFs * ch.n / (f.baseN || ch.n)); ch.spp = 1; ch.Tpkt = ch.dtS; }
  }
}
