/* Veri modeli: Kanal, zaman haritası, piramit, maskeleme, dosya içe aktarma */
const KIND = {
  ac: {name: 'Akustik', ylabel: 'Akustik', color: '#0072BD'}, vib: {name: 'Titreşim', ylabel: 'Titreşim', color: '#D95319'},
  temp: {name: 'Sıcaklık', ylabel: 'Sıcaklık', color: '#A2142F'}, press: {name: 'Basınç', ylabel: 'Basınç', color: '#7E2F8E'},
  strain: {name: 'Gerinim', ylabel: 'Gerinim', color: '#77AC30'}, volt: {name: 'Gerilim', ylabel: 'Gerilim', color: '#EDB120'},
  curr: {name: 'Akım', ylabel: 'Akım', color: '#4DBEEE'}, pos: {name: 'Konum/Açı', ylabel: 'Konum/Açı', color: '#5b7c99'},
  feat: {name: 'Özellik / Sütun', ylabel: '', color: '#5b7c99'}, state: {name: 'Durum/Bit', ylabel: 'Durum', color: '#8b929b'}, other: {name: 'Diğer', ylabel: '', color: '#8b929b'}, spec: {name: 'Spektrum (UNV)', ylabel: '', color: '#b58900'}, calc: {name: 'Türetilmiş', ylabel: '', color: '#2aa198'}
};
function kindOf(full, rest) {
  const s = rest.toLowerCase();
  if (/_related$/.test(s)) return 'other';
  if (/cbit|_bit_|bit_|^tm/.test(s)) return 'state';
  for (const t of s.split(/[_\s.\/]+/)) {   // önek olsa da (BIRIM_alt1_ts11_X) as/ts/ss/hs/bs/pbs/gs + sayı kısaltmaları
    if (/^as\d/.test(t)) return 'ac'; if (/^ts\d/.test(t)) return 'vib'; if (/^(ss|hs)\d/.test(t)) return 'temp'; if (/^p?bs\d/.test(t)) return 'press'; if (/^gs\d/.test(t)) return 'strain';
  }
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
/* Zaman eşlemesi: bir parametrenin değerleri (ölçek / ofsetle) dosyanın yeni zamanı olur. xs: kanalın kendi (eski) zamanı,
   ys: parametre değeri × ölçek + ofset; ikisi de artan tutulur (tekil bozuk değerler atılır, geri gitmede süreklilik korunur, ileri sıçrama boşluktur). Arada doğrusal,
   uçlarda son parçanın eğimiyle. fwd: eski → yeni, inv: yeni → eski. */
function makeTimeMap(xs0, ys0, info) {
  info = info || {};
  // geçerli noktalar (aynı x'te tekrarlar tek)
  const n0 = Math.min(xs0.length, ys0.length), X0 = [], Y0 = []; let bad = 0;
  for (let i = 0; i < n0; i++) { const x = xs0[i], y = ys0[i]; if (!isFinite(x) || !isFinite(y)) { bad++; continue; } if (X0.length && x <= X0[X0.length - 1]) { if (x < X0[X0.length - 1]) bad++; continue; } X0.push(x); Y0.push(y); }
  const n = X0.length; if (n < 2) throw new Error('Zaman parametresinde kullanılabilir değer yok');
  // eğim: ardışık artan adımların medyanı (sıfırlanma / bozuk değerlerden etkilenmez)
  const sl = [], dxs = []; for (let i = 1; i < n; i++) { const dx = X0[i] - X0[i - 1], dy = Y0[i] - Y0[i - 1]; dxs.push(dx); if (dy > 0) sl.push(dy / dx); }
  if (sl.length < n * 0.05) throw new Error('Zaman parametresi artmıyor (artan adım: ' + sl.length + ' / ' + (n - 1) + ')');
  sl.sort((a, b) => a - b); dxs.sort((a, b) => a - b); const m = sl[sl.length >> 1], mdx = dxs[dxs.length >> 1];
  // tekil bozuk değerler (bit hatası): beklenmeyen değerde sonraki 3 nokta eski diziden mi (B) yeni değerden mi (A) sürüyor.
  // Pay: adımın olağan (%90) eğim oranının 2 katı, en az 4 (sık kayıplı kayıtta da çalışır)
  const rs = []; for (let i = 1; i < n && rs.length < 200000; i++) { const q = (Y0[i] - Y0[i - 1]) / (m * (X0[i] - X0[i - 1])); if (q > 0 && q < 1e3) rs.push(q); }
  rs.sort((a, b) => a - b); const Q = Math.max(4, 2 * (rs.length ? rs[Math.floor(rs.length * 0.9)] : 1));
  const fits = (i, t) => { const dy = Y0[i] - Y0[t]; return dy > 0 && dy <= Q * m * (X0[i] - X0[t]); };
  const keep = new Uint8Array(n); let out = 0, t = 0;
  // başlangıç: sonraki 3 noktanın kendisinden sürdüğü ilk nokta (baştaki bozuk değerler atılır)
  while (t < Math.min(n - 4, 50) && !(fits(t + 1, t) && fits(t + 2, t) && fits(t + 3, t))) t++;
  if (t >= Math.min(n - 4, 50)) t = 0; out += t; keep[t] = 1;
  for (let i = t + 1; i < n; i++) {
    const R = (Y0[i] - Y0[t]) / (m * (X0[i] - X0[t]));
    if (R >= 0.5 && R <= 1.5) { keep[i] = 1; t = i; continue; }
    let A = 0, B = 0; for (let j = 1; j <= 3 && i + j < n; j++) { if (fits(i + j, i)) A++; if (fits(i + j, t)) B++; }
    if (R > 0 ? B > A : (B > 0 && B >= A)) { out++; continue; }   // bozuk değer: atlanır (arası doğrusal)
    keep[i] = 1; t = i;
  }
  // sürekli zaman: geri gitmede (sayaç sıfırlanması / taşma) değer önceki noktadan beklenen eğimle devam edecek biçimde kaydırılır.
  // İleri sıçrama gerçek boşluktur (kayıp çerçeveler; MATLAB'de plot(sayaç, x) ile aynı) ve korunur.
  const X = [], Y = []; let off = 0, resets = 0;
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue; const x = X0[i]; let y = Y0[i] + off;
    if (X.length) { const L = X.length - 1, e = m * (x - X[L]), d = y - Y[L];
      if (d < 0) { const y2 = Y[L] + e; off += y2 - y; y = y2; resets++; } }
    X.push(x); Y.push(y);
  }
  if (X.length < 2) throw new Error('Zaman parametresinde kullanılabilir değer yok');
  const Xa = Float64Array.from(X), Ya = Float64Array.from(Y), N = Xa.length;
  if (info.zero) { const y0 = Ya[0]; for (let i = 0; i < N; i++) Ya[i] -= y0; info.off = -y0; }
  const seg = (A, v) => { let lo = 0, hi = N - 2; while (lo < hi) { const md = (lo + hi + 1) >> 1; if (A[md] <= v) lo = md; else hi = md - 1; } return lo; };
  const lerp = (A, B, v) => { const k = v <= A[0] ? 0 : v >= A[N - 1] ? N - 2 : seg(A, v), d = A[k + 1] - A[k]; return d > 0 ? B[k] + (B[k + 1] - B[k]) * (v - A[k]) / d : B[k]; };
  return Object.assign({xs: Xa, ys: Ya, n: N, drop: bad + out, outliers: out, resets, slope: m, fwd: x => lerp(Xa, Ya, x), inv: y => lerp(Ya, Xa, y)}, info);
}
class Channel {
  constructor(o) {
    Object.assign(this, {t0: 0, data: null, del: null, delCount: 0, pyr: null, derived: false, g: null, spp: 1, Tpkt: 1, dtS: 1, loading: null, uid: Channel.seq++}, o);
  }
  get fs() { return this.g ? this.spp / this.Tpkt : 1 / this.dtS; }
  setFs(fs) { if (this.g) this.Tpkt = this.spp / fs; else this.dtS = 1 / fs; }
  copyTiming(o) { this.t0 = o.t0; this.g = o.g; this.spp = o.spp; this.Tpkt = o.Tpkt; this.dtS = o.dtS; this.tmap = o.tmapOf(); }
  tmapOf() { return this.tmap || (this.file && this.file.tmap) || null; }
  // dosyaya "zaman ekseni olarak kullan" ile bir parametrenin zamanı verildiyse (file.tmap): eski zaman → yeni zaman
  t(i) { const M = this.tmap || (this.file && this.file.tmap); return M ? M.fwd(this.tRaw(i)) : this.tRaw(i); }
  tRaw(i) {
    if (!this.g) return this.t0 + i * this.dtS;
    let k = Math.floor(i / this.spp); const L = this.g.length; if (k >= L) k = L - 1; if (k < 0) k = 0;
    return this.t0 + (this.g[k] + (i - k * this.spp) / this.spp) * this.Tpkt;
  }
  timeIdx(t) {
    const M = this.tmap || (this.file && this.file.tmap); if (M) t = M.inv(t);
    t -= this.t0; if (!this.g) return t / this.dtS;
    const g = this.g, pp = t / this.Tpkt; if (pp <= g[0]) return pp * this.spp;
    let lo = 0, hi = g.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m] <= pp) lo = m; else hi = m - 1; }
    let f = pp - g[lo]; if (lo < g.length - 1 && f > 1) f = 1;
    return (lo + f) * this.spp;
  }
  get duration() { return this.t(this.n - 1); }
  // İki düzeyli piramit: 32'lik bloklar (mn/mx) ve 32 bloktan oluşan 1024'lük üst bloklar (mn2/mx2) → tam görünümde sütun başına birkaç okuma
  buildPyr() {
    const n = this.n, nb = Math.ceil(n / PYR_B), nb2 = Math.ceil(nb / PYR_B), mn = new Float64Array(nb), mx = new Float64Array(nb), mn2 = new Float64Array(nb2).fill(Infinity), mx2 = new Float64Array(nb2).fill(-Infinity);
    const d = this.data, del = this.del, M = 1.7976931348623157e308;
    for (let b = 0; b < nb; b++) {
      const a = b * PYR_B, e = Math.min(n, a + PYR_B); let lo = Infinity, hi = -Infinity;
      if (del) { for (let i = a; i < e; i++) { const v = d[i]; if (del[i] || !(v >= -M && v <= M)) continue; if (v < lo) lo = v; if (v > hi) hi = v; } }
      else for (let i = a; i < e; i++) { const v = d[i]; if (!(v >= -M && v <= M)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
      mn[b] = lo; mx[b] = hi; const q = (b / PYR_B) | 0; if (lo < mn2[q]) mn2[q] = lo; if (hi > mx2[q]) mx2[q] = hi;
    }
    this.pyr = {mn, mx, mn2, mx2};
  }
  _blk(b, mn, mx) {
    const d = this.data, del = this.del, a = b * PYR_B, e = Math.min(this.n, a + PYR_B); let lo = Infinity, hi = -Infinity;
    for (let i = a; i < e; i++) { const v = d[i]; if ((del && del[i]) || !isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    mn[b] = lo; mx[b] = hi;
  }
  _blk2(q) { const p = this.pyr, a = q * PYR_B, e = Math.min(p.mn.length, a + PYR_B); let lo = Infinity, hi = -Infinity; for (let k = a; k < e; k++) { if (p.mn[k] < lo) lo = p.mn[k]; if (p.mx[k] > hi) hi = p.mx[k]; } p.mn2[q] = lo; p.mx2[q] = hi; }
  // [a,b) aralığında min/max -> this._mn/_mx; veri yoksa false
  minmax(a, b) {
    const d = this.data, del = this.del; let lo = Infinity, hi = -Infinity;
    a = Math.max(0, a | 0); b = Math.min(this.n, b | 0);
    if (b - a >= 4 * PYR_B) {
      if (!this.pyr) this.buildPyr();
      const P = this.pyr, ba = Math.ceil(a / PYR_B), bb = Math.floor(b / PYR_B), pm = P.mn, px = P.mx;
      for (let i = a, e = ba * PYR_B; i < e; i++) { const v = d[i]; if ((del && del[i]) || !isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
      let k = ba;
      if (bb - ba >= 4 * PYR_B) {   // üst düzey: tam 32-blok gruplarını atla
        const qa = Math.ceil(ba / PYR_B), qb = Math.floor(bb / PYR_B), m2 = P.mn2, x2 = P.mx2;
        for (; k < qa * PYR_B; k++) { if (pm[k] < lo) lo = pm[k]; if (px[k] > hi) hi = px[k]; }
        for (let q = qa; q < qb; q++) { if (m2[q] < lo) lo = m2[q]; if (x2[q] > hi) hi = x2[q]; }
        k = qb * PYR_B;
      }
      for (; k < bb; k++) { if (pm[k] < lo) lo = pm[k]; if (px[k] > hi) hi = px[k]; }
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
  _fixBlocks(blocks) { if (!this.pyr) return; const qs = new Set(); for (const b of blocks) { this._blk(b, this.pyr.mn, this.pyr.mx); qs.add((b / PYR_B) | 0); } for (const q of qs) this._blk2(q); }
}
Channel.seq = 1;

function sanitizeName(s) { s = s.replace(/[^A-Za-z0-9_]/g, '_'); if (!/^[A-Za-z]/.test(s)) s = 'v_' + s; return s.slice(0, 60); }

const DEFAULTS = {Tpkt: 0.010, baseFs: 200};
const DEV_RE = /^([A-Za-z0-9]+?)_([a-z]{2,8})_?(\d+)_(\d+)_(.+)$/;   // <önek>_<cihaz><a>_<b>_<ad> (cihaz başına paket sayacı <..>_cnt)

async function importFile(file, onProgress) {
  const mat = await MAT.open(file);
  const f = {id: 'f' + (importFile.seq++), name: file.name, mat, vars: mat.vars, channels: [], mcache: new Map(), Tpkt: DEFAULTS.Tpkt, baseFs: DEFAULTS.baseFs, cnts: {}};
  // paket sayaçları
  for (let vi = 0; vi < mat.vars.length; vi++) {
    const v = mat.vars[vi]; const m = /^([A-Za-z0-9]+?)_([a-z]{2,8})_?(\d+)_(\d+)_cnt$/.exec(v.name);
    if (m && v.numeric) f.cnts[m[1] + '|' + m[2] + m[3] + '_' + m[4]] = vi;
  }
  // dosya düzeyi temel uzunluk (cnt'siz kanallar için)
  let baseN = 0;
  for (const v of mat.vars) if (v.numeric && Math.min(...v.dims) === 1) baseN = Math.max(baseN, v.count);
  f.baseN = baseN;
  for (let vi = 0; vi < mat.vars.length; vi++) {
    const v = mat.vars[vi]; if (!v.numeric || v.count < 2) continue;
    const full = v.name, m = v.top ? null : DEV_RE.exec(full);
    let pre, dev, rest;
    if (v.top) { pre = v.top; dev = v.top; rest = full.slice(v.top.length + 1) || full; } else if (m) { pre = m[1]; dev = m[2] + m[3] + '_' + m[4]; rest = m[5]; } else { const k = full.indexOf('_'); pre = k > 0 ? full.slice(0, k) : full; dev = pre; rest = k > 0 ? full.slice(k + 1) : full; }
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
  await detectTimeVec(f);
  applyTiming(f);
  return f;
}
// Dosyada zaman vektörü varsa (zaman_s, zaman, time, t, …; MATView'in kaydettiği .mat dahil) örnekleme ondan alınır.
// Kayıp çerçeve boşlukları paket haritasına (g) çevrilir: boşluktan sonraki örnekler doğru zamanda kalır.
const TIME_RE = /^(zaman(_s)?|time(_s|_sec)?|t|ts|timestamps?|tvec|t_s|sure_s)$/i;
// Zaman vektörleri: her kanal için en yakın eşleşen zaman değişkeni (eleman sayısı aynı olmalı):
//  1) kanalın kendi zamanı "<ad>_t" (MATView / telemetri tek .mat: farklı hızdaki alanlar)
//  2) aynı yapıdaki zaman alanı "<yapı>.t", "<yapı>.zaman_s" … (telemetri tek .mat: birim başına zaman)
//  3) dosya düzeyinde zaman değişkeni (t, zaman_s, time …)
// Kullanılan zaman değişkenleri kanal olarak listelenmez.
function analyzeTime(t, vi, name) {
  const n = t.length; if (n < 2) return null;
  const d = new Float64Array(Math.min(n - 1, 200000)), st = Math.max(1, Math.floor((n - 1) / d.length));
  for (let k = 0; k < d.length; k++) { const i = k * st; d[k] = t[i + 1] - t[i]; }
  const ds = Float64Array.from(d).sort(); let dt = ds[ds.length >> 1];
  if (!(dt > 0)) { let j = 0; while (j < ds.length && !(ds[j] > 0)) j++; dt = ds[(j + ds.length) >> 1]; }   // çok sayıda yinelenen zaman: artan adımların medyanı
  if (!(dt > 0) || !isFinite(dt)) return null;
  // artmalı (yinelenen zamanlar olabilir); büyük sıçramalar = kayıp paketler
  const gaps = []; let bad = 0, dup = 0; for (let i = 1; i < n; i++) { const q = t[i] - t[i - 1]; if (q === 0) dup++; else if (!(q > 0)) { if (++bad > n * 0.001) return null; } else if (q > 1.5 * dt) gaps.push(i); }
  const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
  let spp = 0; for (const i of gaps) spp = gcd(spp, i); if (!(gaps.length && spp >= 2)) spp = 0;   // boşluk konumlarının ortak böleni = çerçeve başına örnek
  const tv = {vi, n, t0: t[0], dt, name};
  if (spp >= 2 && gaps.length) {
    const np = Math.ceil(n / spp), Tp = spp * dt, g = new Float64Array(np); for (let k = 0; k < np; k++) g[k] = Math.round((t[k * spp] - t[0]) / Tp);
    // çerçeve haritası her örneğin zamanını vermeli; vermiyorsa (boşluk konumları rastlantısal ortak bölenli) örnek başına harita
    let ok = true; for (let i = 0; i < n && ok; i++) { const k = Math.floor(i / spp); if (Math.abs(t[0] + (g[k] + (i - k * spp) / spp) * Tp - t[i]) > dt * 0.02) ok = false; }
    if (ok) { tv.g = g; tv.spp = spp; tv.Tpkt = Tp; tv.lost = countLost(g); } else spp = 0;
  }
  // boşluksuz model (t0 + i·dt) de her örnekte doğrulanır: kayan / düzensiz örneklemede yaklaşık zaman gösterilmez
  if (!tv.g && !gaps.length) { const tol = dt * 0.02; for (let i = 0; i < n; i++) if (!(Math.abs(t[0] + i * dt - t[i]) <= tol)) { gaps.push(i); break; } }
  if (!tv.g && (gaps.length || dup || bad)) {   // düzensiz boşluklar: örnek başına harita
    // g kesirli olabilir: t(i) = t0 + g[i]·dt her örnekte kayıttaki zamanın aynısı (düzensiz örneklemede de)
    const g = new Float64Array(n); for (let k = 0; k < n; k++) g[k] = (t[k] - t[0]) / dt; tv.g = g; tv.spp = 1; tv.Tpkt = dt; tv.lost = countLost(g.map(Math.round));
  }
  return tv;
}
async function detectTimeVec(f) {
  const vars = f.vars, isVec = v => v.numeric && v.dims.length === 2 && Math.min(v.dims[0], v.dims[1]) === 1 && v.count >= 2;
  const leaf = v => v.top ? v.name.slice(v.top.length + 1) : v.name;
  const byName = new Map(); vars.forEach((v, i) => { if (v.numeric) byName.set(v.name, i); });
  const isTime = v => isVec(v) && TIME_RE.test(leaf(v));
  const glob = vars.findIndex(v => !v.top && isTime(v) && v.count >= 16);
  const structT = new Map(); vars.forEach((v, i) => { if (v.top && isTime(v) && !structT.has(v.top) && !leaf(v).includes('.')) structT.set(v.top, i); });
  const tvs = new Map(), used = new Set();
  const tvOf = async vi => {
    if (tvs.has(vi)) return tvs.get(vi);
    let tv = null; try { tv = analyzeTime(await MAT.load(f.mat, vars[vi]), vi, vars[vi].name); } catch (_) {}
    tvs.set(vi, tv); return tv;
  };
  const multi = new Map();   // çerçeve başına k örnekli alanlar: yapının zamanından türetilir (çerçeve içinde eşit aralık)
  const multiOf = (ti, tv, k) => {
    const key = ti + '*' + k; if (multi.has(key)) return multi.get(key);
    const m = {vi: ti, n: tv.n * k, t0: tv.t0, dt: tv.dt / k, name: tv.name + '×' + k};
    if (tv.g && tv.spp === 1) { m.g = tv.g; m.spp = k; m.Tpkt = tv.Tpkt; }
    tvs.set(key, m); multi.set(key, m); return m;
  };
  // düz değişkenler (MAT v5 yapı sınırını aşan birimler "<birim>_<alan>" + "<birim>_t" olarak yazılır): en uzun öneki olan zaman
  const TSUF = ['_t', '_time', '_zaman_s', '_zaman'], pref = new Map();
  const prefT = v => {
    if (v.top) return undefined; if (pref.has(v.name)) return pref.get(v.name);
    let r; for (let j = v.name.lastIndexOf('_'); j > 0 && r === undefined; j = v.name.lastIndexOf('_', j - 1)) {
      const P = v.name.slice(0, j); for (const sf of TSUF) { const ti = byName.get(P + sf); if (ti != null && isVec(vars[ti]) && vars[ti].name !== v.name) { r = ti; break; } }
    }
    pref.set(v.name, r); return r;
  };
  for (const ch of f.channels) {
    const v = vars[ch.varIdx]; if (!v) continue;
    const st = v.top ? structT.get(v.top) : prefT(v);
    const SRC = ['ad_t', 'ad_zaman_s', 'ad_time', v.top ? 'yapı t' : 'önek t', 'dosya zamanı'];
    const cand = [byName.get(v.name + '_t'), byName.get(v.name + '_zaman_s'), byName.get(v.name + '_time'), st, glob >= 0 ? glob : undefined];   // MATView seçim/binary .mat'i: <ad>_zaman_s
    let done = false; const tried = [];   // tanılama raporu: denenen adaylar ve sonuçları
    for (let ci = 0; ci < cand.length; ci++) {
      const ti = cand[ci]; if (ti == null || ti === ch.varIdx) continue;
      if (vars[ti].count !== ch.n) { tried.push([ti, SRC[ci], 'uzunluk ' + vars[ti].count]); continue; }
      const tv = await tvOf(ti); if (!tv) { tried.push([ti, SRC[ci], 'zaman vektörü geçersiz (artmıyor / sayısal değil)']); continue; }
      ch.tvi = ti; ch.tsrc = SRC[ci]; used.add(ti); done = true; break;
    }
    if (!done) { const C2 = [cand[0], cand[1], st, glob >= 0 ? glob : undefined], S2 = [SRC[0], SRC[1], SRC[3], SRC[4]];
      for (let ci = 0; ci < C2.length; ci++) {   // n = k × (zaman uzunluğu); son çerçeve yarım olabilir (± bir çerçeve)
        const ti = C2[ci]; if (ti == null || ti === ch.varIdx) continue; const nt = vars[ti].count, k = Math.round(ch.n / nt);
        if (!(k >= 1 && Math.abs(ch.n - k * nt) <= k && nt >= 8)) continue;
        const tv = await tvOf(ti); if (!tv) continue;
        if (k === 1) ch.tvi = ti; else { multiOf(ti, tv, k); ch.tvi = ti + '*' + k; }
        ch.tsrc = S2[ci] + (k > 1 ? ' ×' + k : '') + (ch.n !== k * nt ? ' (yakın uzunluk ' + (ch.n - k * nt > 0 ? '+' : '') + (ch.n - k * nt) + ')' : '');
        used.add(ti); done = true; break;
      } }
    if (!done) ch.ttried = tried;
  }
  // "<ad>_t" / "<ad>_zaman_s" zaman alanları (ad kanal olarak açılamasa da, ör. bayt dizisi) ve yapı zamanları listelenmez
  const allNames = new Set(vars.map(v => v.name));
  vars.forEach((v, i) => { const m = /(_t|_zaman_s|_time)$/.exec(v.name); if (m && isVec(v) && allNames.has(v.name.slice(0, -m[1].length))) used.add(i); });
  for (const i of structT.values()) used.add(i);
  for (const i of pref.values()) if (i != null) used.add(i);
  f.tvecs = tvs;
  if (glob >= 0 && tvs.get(glob)) f.tvec = tvs.get(glob);
  // zaman eksenleri kanal olarak listelenmez (dosya düzeyindeki zaman, eşleşen kanal olmasa da)
  if (glob >= 0 && tvs.get(glob)) used.add(glob);
  f.channels = f.channels.filter(c => !used.has(c.varIdx));
  f.noTime = f.channels.filter(c => c.tvi == null && !(c.devKey && f.cnts[c.devKey] != null) && !(f.tvec && f.tvec.n === c.n)).length;   // varsayılan örnekleme hızıyla açılanlar
}
importFile.seq = 1;
function countLost(g) { let c = 0; for (let k = 1; k < g.length; k++) if (g[k] - g[k - 1] > 1) c += g[k] - g[k - 1] - 1; return c; }
function devKeyOf(full) { const m = DEV_RE.exec(full); return m ? m[1] + '|' + m[2] + m[3] + '_' + m[4] : null; }

function applyTiming(f) {
  for (const ch of f.channels) {
    if (ch.derived || ch.bin || ch.spec || ch.tbl) continue;
    const gc = ch.devKey && f.gcache ? f.gcache[ch.devKey] : null;
    const tv = ch.tvi != null && f.tvecs ? f.tvecs.get(ch.tvi) : (f.tvec && f.tvec.n === ch.n ? f.tvec : null);
    if (tv) { ch.t0 = tv.t0; if (tv.g) { ch.g = tv.g; ch.spp = tv.spp; ch.Tpkt = tv.Tpkt; ch.dtS = tv.dt; } else { ch.g = null; ch.dtS = tv.dt; ch.spp = 1; ch.Tpkt = tv.dt; } continue; }
    if (gc) { ch.g = gc.g; ch.spp = ch.n / gc.np; ch.Tpkt = f.Tpkt; ch.dtS = ch.Tpkt / ch.spp; }
    else { ch.g = null; ch.dtS = 1 / (f.baseFs * ch.n / (f.baseN || ch.n)); ch.spp = 1; ch.Tpkt = ch.dtS; }
  }
}
