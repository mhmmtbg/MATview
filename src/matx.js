/* .mat araçları: anonim zaman tanılama raporu · içerik görüntüleyici / düzenleyici · MAT v5 kodlayıcı */

/* ---------- Anonim adlar ----------
   Ad parçaları (_ . ( ) { } [ ] ile ayrılan) tutarlı biçimde A1, A2 … olur; yalnız zamanla ilgili genel sözcükler
   (t, time, zaman, s, frame, counter, cnt …) ve sayılar korunur. Böylece "<birim>_t", "<yapı>.t", "<ad>_t"
   ilişkileri raporda görünür, adların kendisi görünmez. */
function mxAnon() {
  const KEEP = new Set(['t', 'time', 'zaman', 's', 'sec', 'ts', 'tvec', 'frame', 'counter', 'cnt', 'timestamp', 'timestamps', 'sure', 'bayt', 'no']);
  const map = new Map(); let k = 0;
  return name => String(name).split(/([._(){}[\]×*|\s]+)/).map(p => {
    if (!p || /^[._(){}[\]×*|\s]+$/.test(p) || /^\d+$/.test(p) || KEEP.has(p.toLowerCase())) return p;
    if (!map.has(p)) map.set(p, 'A' + (++k)); return map.get(p);
  }).join('');
}

/* ---------- Zaman tanılama raporu ---------- */
async function timeDiagReport(f, opt) {
  opt = opt || {};
  const an = mxAnon(), L = [], vars = f.vars || [], m = f.mat || {};
  const isVec = v => v && v.numeric && v.dims && v.dims.length === 2 && Math.min(v.dims[0], v.dims[1]) === 1 && v.count >= 2;
  const dims = v => (v.dims || []).join('×'), sec = x => (x == null || !isFinite(x)) ? '—' : fmtNum(x, 6) + ' s';
  const sz = n => n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' kB';
  L.push('MATView zaman tanılama raporu (anonim)', 'Sürüm ' + APP_VER + ' · ' + new Date().toISOString().slice(0, 16).replace('T', ' '),
    'Değişken ve dosya adları gizlidir (A1, A2 …); yalnız t / time / zaman / frame_counter gibi genel sözcükler korunur. Ölçüm değerleri yoktur' +
    (opt.cursors ? '; "İmleç noktaları" bölümünde yalnız zaman / sayaç vektörlerinin o noktalardaki değerleri vardır.' : ', başlangıç zamanı da yoktur.'), '');
  const ext = (f.name.match(/\.[^.]+$/) || [''])[0];
  L.push('== Dosya ==', 'Ad: D1' + ext + ' · ' + (f.mat && f.mat.file ? sz(f.mat.file.size) : f.mat && f.mat.u8 ? sz(f.mat.u8.length) : '?'),
    'Biçim: ' + (m.h5 ? 'MAT v7.3 (HDF5)' : 'MAT v5') + (m.lazy ? ' · büyük dosya (parça parça okunuyor)' : '') + (vars.some(v => v.compressed) ? ' · sıkıştırılmış öğeler var' : ''),
    'Değişken: ' + vars.length + ' (sayısal ' + vars.filter(v => v.numeric).length + ', yapı/hücre ' + vars.filter(v => !v.numeric && v.top == null).length + ', yapı içi alan ' + vars.filter(v => v.top != null).length + ')',
    'Kanal: ' + f.channels.length + ' · varsayılan hız ' + fmtNum(f.baseFs, 6) + ' Hz · temel uzunluk ' + (f.baseN || '—'), '');
  // zaman vektörleri: ada göre zaman olan ya da bir kanala bağlanan
  const used = new Map(); for (const c of f.channels) if (c.tvi != null) { const k = String(c.tvi).split('*')[0]; used.set(+k, (used.get(+k) || 0) + 1); }
  const leaf = v => v.top ? v.name.slice(v.top.length + 1) : v.name;
  const tcand = []; vars.forEach((v, i) => { if (isVec(v) && (TIME_RE.test(leaf(v)) || /(_t|_time|_zaman_s|_zaman)$/.test(v.name) || used.has(i))) tcand.push(i); });
  L.push('== Zaman vektörleri (' + tcand.length + ') ==');
  if (!tcand.length) L.push('(yok — dosyada t / time / zaman / <ad>_t biçiminde vektör bulunamadı)');
  for (const i of tcand.slice(0, 400)) {
    const v = vars[i]; let s = an(v.name) + ' · n=' + v.count + ' · ' + v.clsName + (used.has(i) ? ' · ' + used.get(i) + ' kanal kullanıyor' : ' · kullanılmıyor');
    try {
      const t = await MAT.load(m, v); const n = t.length; let dup = 0, back = 0, nan = 0, maxGap = 0, dmin = Infinity, dmax = -Infinity;
      const ds = []; for (let j = 1; j < n; j++) { const q = t[j] - t[j - 1]; if (q !== q) { nan++; continue; } if (q === 0) dup++; else if (q < 0) back++; else { if (q < dmin) dmin = q; if (q > dmax) dmax = q; } if (j % Math.max(1, Math.floor(n / 50000)) === 0) ds.push(q); }
      ds.sort((a, b) => a - b); const med = ds[ds.length >> 1];
      let gaps = 0; if (med > 0) for (let j = 1; j < n; j++) { const q = t[j] - t[j - 1]; if (q > 1.5 * med) { gaps++; if (q > maxGap) maxGap = q; } }
      const tv = f.tvecs && f.tvecs.get(i);
      s += '\n    süre ' + sec(t[n - 1] - t[0]) + ' · medyan adım ' + sec(med) + (med > 0 ? ' (' + fmtNum(1 / med, 6) + ' Hz)' : '') + ' · en küçük / en büyük adım ' + sec(dmin) + ' / ' + sec(dmax) +
        '\n    boşluk (>1,5×adım) ' + gaps + (gaps ? ', en büyüğü ' + sec(maxGap) : '') + ' · yinelenen ' + dup + ' · geri giden ' + back + (nan ? ' · NaN ' + nan : '') +
        '\n    model: ' + (tv ? (tv.g ? (tv.spp > 1 ? 'çerçeve haritası (çerçeve başına ' + tv.spp + ')' : 'örnek başına harita') : 'düzgün (t0 + i·adım)') : used.has(i) ? '—' : 'çözümlenmedi');
    } catch (e) { s += '\n    okunamadı: ' + (e.message || e); }
    L.push('- ' + s);
  }
  if (tcand.length > 400) L.push('… ' + (tcand.length - 400) + ' zaman vektörü daha');
  L.push('');
  // kanallar: zamanın kaynağına göre
  const groups = new Map();
  for (const c of f.channels) {
    const src = c.tsrc || (c.tvi != null ? 'zaman vektörü' : c.devKey && f.cnts && f.cnts[c.devKey] != null ? 'paket sayacı (_cnt)' : f.tvec && f.tvec.n === c.n ? 'dosya zamanı' : 'YOK — varsayılan hız');
    if (!groups.has(src)) groups.set(src, []); groups.get(src).push(c);
  }
  L.push('== Kanalların zaman kaynağı ==');
  for (const [k, a] of [...groups].sort((x, y) => (x[0].startsWith('YOK') ? 1 : 0) - (y[0].startsWith('YOK') ? 1 : 0))) L.push((k.startsWith('YOK') ? '! ' : '  ') + k + ': ' + a.length + ' kanal');
  L.push('');
  for (const [k, a] of groups) {
    const none = k.startsWith('YOK'), lim = none ? 500 : 60;
    L.push('-- ' + k + ' (' + a.length + ') --');
    for (const c of a.slice(0, lim)) {
      const v = vars[c.varIdx], tvn = c.tvi != null ? an(vars[+String(c.tvi).split('*')[0]].name) : null;
      let s = an(c.name) + ' · n=' + c.n + (v ? ' · ' + dims(v) + ' ' + v.clsName : '') + (tvn ? ' · zaman: ' + tvn : '') + ' · adım ' + sec(c.dtS) + ' · süre ' + sec(c.n > 1 ? c.t(c.n - 1) - c.t(0) : 0);
      if (none && c.ttried) s += c.ttried.length ? '\n    denenen: ' + c.ttried.map(([ti, src, why]) => src + ' ' + an(vars[ti].name) + ' (' + why + ')').join(' · ') : '\n    denenen: aday zaman vektörü yok (ad_t, yapı t, <önek>_t, dosya düzeyi t / time / zaman bulunamadı)';
      L.push('  ' + s);
    }
    if (a.length > lim) L.push('  … ' + (a.length - lim) + ' kanal daha');
  }
  if (opt.cursors) await diagCursors(f, an, L, tcand);
  return L.join('\n');
}
// İmleç noktaları: her imlecin örneği için MATView'in zamanı, bağlı zaman vektörünün dosyadaki değeri (ve komşuları),
// aynı uzunluktaki (ya da tam katı) diğer zaman / sayaç vektörlerinin o örnekteki değeri. MATLAB'de aynı indeksle karşılaştırılabilir.
async function diagCursors(f, an, L, tcand) {
  const P = S.plot, vars = f.vars, m = f.mat, num = x => x == null ? '—' : fmtNum(Number(x), 10);
  const cs = (P.cursors || []).map((c, k) => [c, k]).filter(([c]) => c.tr && c.tr.ch && c.tr.ch.file === f);
  L.push('', '== İmleç noktaları (' + cs.length + ') ==');
  if (!cs.length) { L.push('(bu dosyanın kanallarında imleç yok: grafikte imleç koyup raporu yeniden oluşturun)'); return; }
  const cache = new Map(), raw = async vi => { if (!cache.has(vi)) { try { cache.set(vi, await MAT.load(m, vars[vi])); } catch (e) { cache.set(vi, null); } } return cache.get(vi); };
  const isVec = v => v && v.numeric && v.dims.length === 2 && Math.min(v.dims[0], v.dims[1]) === 1 && v.count >= 2;
  const leaf = v => v.top ? v.name.slice(v.top.length + 1) : v.name;
  const other = []; vars.forEach((v, i) => { if (isVec(v) && (tcand.includes(i) || /(^|_)(frame_?counter|cnt|counter|sayac|timestamp)s?$/i.test(leaf(v)))) other.push(i); });
  for (const [c, k] of cs) {
    const ch = c.tr.ch, i = Math.max(0, Math.min(ch.n - 1, c.i != null ? c.i : Math.round(ch.timeIdx(c.x))));
    L.push(P.cursorName(k) + ' · kanal ' + an(ch.name) + ' (n=' + ch.n + ') · örnek ' + (i + 1) + ' (MATLAB indeksi, 1 tabanlı) · MATView zamanı ' + num(ch.t(i)) + ' s');
    if (ch.tvi != null) {
      const [vi0, kk0] = String(ch.tvi).split('*'), vi = +vi0, kk = +(kk0 || 1), j = Math.floor(i / kk), r = await raw(vi);
      if (r) {
        L.push('  bağlı zaman: ' + an(vars[vi].name) + '(' + (j + 1) + ') = ' + num(r[j]) + (kk > 1 ? ' · çerçeve başına ' + kk + ' örnek, bu örnek ' + (i - j * kk + 1) + '. sırada' : '') + ' · kaynak: ' + (ch.tsrc || '—'));
        const nb = []; for (let q = Math.max(0, j - 2); q <= Math.min(r.length - 1, j + 2); q++) nb.push('(' + (q + 1) + ')=' + num(r[q])); L.push('  komşular: ' + nb.join('  '));
        // model ↔ dosya: kanalın her (çerçeve başı) örneğinde
        let mx = 0, at = -1; for (let q = 0; q < Math.min(r.length, Math.ceil(ch.n / kk)); q++) { const e = Math.abs(ch.t(q * kk) - r[q]); if (e > mx || e !== e) { mx = e; at = q; } }
        L.push('  MATView zamanı ile dosyadaki zaman arasındaki en büyük fark: ' + num(mx) + ' s' + (mx > 1e-6 ? ' (örnek ' + (at * kk + 1) + ': MATView ' + num(ch.t(at * kk)) + ', dosya ' + num(r[at]) + ')' : ' (aynı)'));
      } else L.push('  bağlı zaman ' + an(vars[vi].name) + ' okunamadı');
    } else L.push('  bağlı zaman yok: varsayılan hız (' + fmtNum(f.baseFs, 6) + ' Hz) kullanılıyor');
    const rows = [];
    for (const vi of other) {
      const v = vars[vi]; if (ch.tvi != null && +String(ch.tvi).split('*')[0] === vi) continue;
      const kk = Math.round(ch.n / v.count); if (!(kk >= 1 && Math.abs(ch.n - kk * v.count) <= kk)) continue;
      const r = await raw(vi); if (!r) continue; const j = Math.min(r.length - 1, Math.floor(i / kk));
      rows.push('    ' + an(v.name) + '(' + (j + 1) + ') = ' + num(r[j]) + ' · n=' + v.count + (kk > 1 ? ' (×' + kk + ')' : '') + ' · ilk ' + num(r[0]) + ' · son ' + num(r[r.length - 1]));
      if (rows.length >= 20) break;
    }
    L.push(rows.length ? '  aynı uzunluktaki diğer zaman / sayaç vektörleri (aynı örnekte):\n' + rows.join('\n') : '  aynı uzunlukta başka zaman / sayaç vektörü yok');
  }
  if (cs.length >= 2) { const [a] = cs[0], [b] = cs[cs.length - 1]; L.push('Fark (son − ilk imleç, MATView): ' + num(b.tr.ch.t(Math.max(0, Math.min(b.tr.ch.n - 1, b.i))) - a.tr.ch.t(Math.max(0, Math.min(a.tr.ch.n - 1, a.i)))) + ' s'); }
}
function timeDiagDlg(f, withCur) {
  if (withCur == null) withCur = true;
  busy('Zaman tanılaması…', async () => {
    let txt = await timeDiagReport(f, {cursors: withCur}); const pre = h('pre', {class: 'mx-rep'}, txt);
    const cb = h('input', {type: 'checkbox', checked: withCur ? '' : null}); cb.onchange = () => timeDiagDlg(f, cb.checked);
    const nC = (S.plot.cursors || []).filter(c => c.tr && c.tr.ch && c.tr.ch.file === f).length;
    modal('Zaman tanılama raporu (anonim)', h('div', null, h('div', {class: 'note', style: 'margin-bottom:6px'}, 'Adlar gizlenmiştir; ölçüm değeri içermez. Sorun bildirirken bu metni paylaşabilirsiniz.'),
      h('label', {class: 'chk', style: 'display:block;margin-bottom:6px'}, cb, ' İmleç noktalarındaki zaman / sayaç değerlerini ekle (' + nC + ' imleç; yanlış zaman şüphesinde MATLAB\'deki aynı indeksle karşılaştırmak için)'), pre),
      [{t: 'Panoya kopyala', fn: () => { navigator.clipboard.writeText(txt).then(() => toast('Rapor panoya kopyalandı'), () => toast('Kopyalanamadı')); return false; }},
       {t: '.txt kaydet', fn: () => { saveBlob(new Blob([txt.replace(/\n/g, '\r\n')], {type: 'text/plain'}), 'MATView_zaman_tanilama.txt'); return false; }}, {t: 'Kapat'}]);
  });
}

/* ---------- MAT v5 kodlayıcı (MAT.readAll ağacından, sıkıştırmasız) ---------- */
const MXE = (() => {
  const pad8 = n => (n + 7) & ~7;
  const TY = {d: [6, 9, Float64Array], s: [7, 7, Float32Array], i8: [8, 1, Int8Array], u8: [9, 2, Uint8Array], i16: [10, 3, Int16Array], u16: [11, 4, Uint16Array], i32: [12, 5, Int32Array], u32: [13, 6, Uint32Array], i64: [14, 12, BigInt64Array], u64: [15, 13, BigUint64Array], c: [4, 4, Uint16Array], l: [9, 2, Uint8Array]};
  const LIM = {i8: [-128, 127], u8: [0, 255], i16: [-32768, 32767], u16: [0, 65535], i32: [-2147483648, 2147483647], u32: [0, 4294967295], c: [0, 65535], l: [0, 1]};
  const enc8 = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xFF; return b; };
  function el(type, bytes) { const o = new Uint8Array(8 + pad8(bytes.length)), dv = new DataView(o.buffer); dv.setUint32(0, type, true); dv.setUint32(4, bytes.length, true); o.set(bytes, 8); return o; }
  function typed(cls, src) {
    const [, , T] = TY[cls], n = src.length, out = new T(n), lim = LIM[cls];
    if (T === BigInt64Array || T === BigUint64Array) { for (let i = 0; i < n; i++) { const v = Number(src[i]); out[i] = BigInt(isFinite(v) ? Math.round(v) : 0); } }
    else if (lim) { for (let i = 0; i < n; i++) { let v = Math.round(Number(src[i])); if (!(v === v)) v = 0; out[i] = Math.max(lim[0], Math.min(lim[1], v)); } }
    else for (let i = 0; i < n; i++) out[i] = src[i];
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  }
  const cat = parts => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
  function head(clsCode, flags, dims, name) {
    const fl = new Uint8Array(8), dv = new DataView(fl.buffer); dv.setUint32(0, clsCode | flags, true);
    const dm = new Int32Array(dims.length ? dims : [0, 0]);
    return [el(6, fl), el(5, new Uint8Array(dm.buffer)), el(1, enc8(name || ''))];
  }
  function enc(nd, name) {
    let body;
    if (nd.k === 'num') {
      const cls = nd.sparse ? 'd' : nd.cls, [code, mi] = TY[cls] || TY.d, flags = (nd.im ? 0x800 : 0) | (cls === 'l' ? 0x200 : 0);
      body = head(code, flags, nd.dims, name); body.push(el(mi, typed(TY[cls] ? cls : 'd', nd.re))); if (nd.im) body.push(el(mi, typed(TY[cls] ? cls : 'd', nd.im)));
    } else if (nd.k === 'cell') { body = head(1, 0, nd.dims, name); for (const c of nd.v) body.push(enc(c, '')); }
    else if (nd.k === 'struct') {
      const obj = !!nd.className; body = head(obj ? 3 : 2, 0, nd.dims, name);
      if (obj) body.push(el(1, enc8(nd.className)));
      const Lw = Math.min(64, Math.max(8, ...nd.f.map(s => s.length + 1))), fn = new Uint8Array(Lw * nd.f.length);
      nd.f.forEach((s, i) => fn.set(enc8(s.slice(0, Lw - 1)), i * Lw));
      body.push(el(5, new Uint8Array(new Int32Array([Lw]).buffer)), el(1, fn));
      for (const o of nd.v) for (const k of nd.f) body.push(enc(o[k], ''));
    } else throw new Error((nd.name || name || 'değişken') + ': bu öğe türü (' + (nd.cls || nd.k) + ') yeniden yazılamıyor');
    return el(14, cat(body));
  }
  // ağaçta "a.b(2).c{3}" yolundaki düğüm
  function nodeAt(tr, path) {
    let nd = tr; const toks = path.slice(tr.name.length).match(/\.[^.({]+|\(\d+\)|\{\d+\}/g) || [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (nd.k === 'struct') { let k = 0; if (t[0] === '(') { k = +t.slice(1, -1) - 1; i++; } const fld = (toks[i] || '').slice(1); const o = nd.v[k]; if (!o || !(fld in o)) return null; nd = o[fld]; }
      else if (nd.k === 'cell' && t[0] === '{') { nd = nd.v[+t.slice(1, -1) - 1]; if (!nd) return null; }
      else return null;
    }
    return nd;
  }
  return {enc, nodeAt, cat, el};
})();

/* ---------- İçerik görüntüleyici / düzenleyici ---------- */
const MXV = {};
function matContentDlg(f) {
  const m = f.mat; if (!m) return toast('Bu dosya .mat değil');
  const st = MXV[f.id] = MXV[f.id] || {edits: new Map(), del: new Set(), ren: new Map()};
  const vars = m.vars, editable = !m.h5;
  let q = '', sel = null, data = null, page = 0, cpage = 0; const PR = 100, PC = 12;
  const depth = v => v.top == null ? 0 : (v.name.slice(v.top.length).match(/\.|\{|\(/g) || []).length;
  const topOf = v => v.top == null ? v.name : v.top;
  const list = h('div', {class: 'mx-list'}), right = h('div', {class: 'mx-right'}), qi = h('input', {type: 'search', placeholder: 'Ara: değişken adı', class: 'mx-q'});
  const dirty = () => st.edits.size || st.del.size || st.ren.size;
  const status = h('div', {class: 'mx-st note'});
  const updStatus = () => { const ne = [...st.edits.values()].reduce((a, mp) => a + mp.size, 0); status.textContent = dirty() ? `Kaydedilmemiş değişiklik: ${ne} değer · ${st.del.size} silinecek · ${st.ren.size} yeniden adlandırılacak değişken` : 'Değişiklik yok · değeri düzenlemek için hücreye çift tıklayın'; };
  function renderList() {
    const qq = q.toLowerCase(); list.replaceChildren();
    let shown = 0;
    vars.forEach((v, i) => {
      if (qq && !v.name.toLowerCase().includes(qq)) return; if (++shown > 3000) return;
      const top = topOf(v), gone = st.del.has(top), nm = v.top == null ? (st.ren.get(v.name) || v.name) : v.name.slice(v.top.length);
      const ed = st.edits.has(v.name);
      const row = h('div', {class: 'mx-row' + (sel === i ? ' on' : '') + (gone ? ' del' : ''), title: v.name, style: 'padding-left:' + (6 + 14 * depth(v)) + 'px'},
        h('span', {class: 'mx-n'}, (v.numeric ? '' : (v.cls === 2 ? '▸ ' : v.cls === 1 ? '{} ' : '')) + nm + (ed ? ' ●' : '')), h('span', {class: 'mx-d'}, (v.dims || []).join('×') + ' ' + (v.clsName || '')));
      row.onclick = () => pick(i); list.append(row);
    });
    if (shown > 3000) list.append(h('div', {class: 'note'}, '… ' + (shown - 3000) + ' değişken daha (aramayı daraltın)'));
    if (!shown) list.append(h('div', {class: 'note'}, 'Eşleşen değişken yok'));
  }
  async function pick(i) {
    sel = i; page = 0; cpage = 0; data = null; renderList(); const v = vars[i];
    right.replaceChildren(h('div', {class: 'note'}, 'Yükleniyor…'));
    if (v.numeric && !v.complex) { try { data = await MAT.load(m, v); } catch (e) { data = null; right.replaceChildren(info(v), h('div', {class: 'note'}, 'Okunamadı: ' + (e.message || e))); return; } }
    renderRight();
  }
  function info(v) {
    const top = v.top == null, nm = top ? (st.ren.get(v.name) || v.name) : v.name;
    const bx = h('div', {class: 'mx-info'}, h('b', null, nm), h('span', null, ' · ' + (v.dims || []).join('×') + ' · ' + v.clsName + (v.complex ? ' (karmaşık)' : '') + (v.compressed ? ' · sıkıştırılmış' : '') + ' · ' + fmtCnt(v.count || 0) + ' öğe'));
    if (data && data.length) { let mn = Infinity, mx = -Infinity, s = 0, k = 0; for (let j = 0; j < data.length; j++) { const x = Number(data[j]); if (x === x) { if (x < mn) mn = x; if (x > mx) mx = x; s += x; k++; } } bx.append(h('span', {class: 'mx-dim'}, ` · en küçük ${fmtNum(mn, 6)} · en büyük ${fmtNum(mx, 6)} · ortalama ${fmtNum(k ? s / k : NaN, 6)}`)); }
    const tools = h('div', {class: 'btns mx-tools'});
    if (top && editable) {
      tools.append(btn(st.del.has(v.name) ? 'Silmeyi geri al' : 'Değişkeni sil', () => { if (st.del.has(v.name)) st.del.delete(v.name); else st.del.add(v.name); updStatus(); renderList(); renderRight(); }),
        btn('Yeniden adlandır', () => { const nn = prompt('Yeni ad (harfle başlamalı; harf, rakam, _ ):', st.ren.get(v.name) || v.name); if (nn == null) return; const s2 = nn.trim(); if (!/^[A-Za-z]\w{0,62}$/.test(s2)) return toast('Geçersiz MATLAB adı'); if (s2 === v.name) st.ren.delete(v.name); else st.ren.set(v.name, s2); updStatus(); renderList(); renderRight(); }));
    }
    if (st.edits.has(v.name)) tools.append(btn('Bu değişkendeki düzenlemeleri geri al', () => { st.edits.delete(v.name); updStatus(); renderList(); renderRight(); }));
    return h('div', null, bx, tools);
  }
  function renderRight() {
    const v = vars[sel]; if (!v) return right.replaceChildren(h('div', {class: 'note'}, 'Soldan bir değişken seçin'));
    if (!v.numeric || v.complex || !data) { right.replaceChildren(info(v), h('div', {class: 'note'}, v.numeric ? (v.complex ? 'Karmaşık değerler tabloda gösterilmez.' : '') : 'Yapı / hücre / metin: alanları soldaki listede.')); return; }
    const R = v.dims[0] || 1, C = Math.max(1, Math.round(data.length / R)), np = Math.ceil(R / PR), ncp = Math.ceil(C / PC);
    page = Math.max(0, Math.min(page, np - 1)); cpage = Math.max(0, Math.min(cpage, ncp - 1));
    const ed = st.edits.get(v.name) || new Map(), r0 = page * PR, r1 = Math.min(R, r0 + PR), c0 = cpage * PC, c1 = Math.min(C, c0 + PC);
    const tb = h('table', {class: 'mx-t nofilter'}), hr = h('tr', null, h('th', null, '#'));
    for (let c = c0; c < c1; c++) hr.append(h('th', null, C > 1 ? String(c + 1) : 'değer')); tb.append(hr);
    for (let r = r0; r < r1; r++) {
      const tr = h('tr', null, h('th', null, String(r + 1)));
      for (let c = c0; c < c1; c++) { const ix = r + c * R, has = ed.has(ix), val = has ? ed.get(ix) : Number(data[ix]); const td = h('td', {class: has ? 'ed' : null, 'data-i': ix}, fmtNum(val, 10)); tr.append(td); }
      tb.append(tr);
    }
    tb.ondblclick = e => {
      const td = e.target.closest('td[data-i]'); if (!td || !editable) return; const ix = +td.dataset.i, cur = ed.has(ix) ? ed.get(ix) : Number(data[ix]);
      const inp = h('input', {type: 'text', class: 'mx-in', value: String(cur)}); let done = false;
      const fin = ok => { if (done) return; done = true; if (ok) { const s = inp.value.trim().replace(',', '.'); const x = /^[+-]?inf$/i.test(s) ? (s[0] === '-' ? -Infinity : Infinity) : /^nan$/i.test(s) ? NaN : Number(s);
          if (s === '' || (x !== x && !/^nan$/i.test(s))) { toast('Sayı girin (NaN, Inf da olur)'); }
          else { if (/int|uint/.test(v.clsName) && !Number.isInteger(x)) toast('Tamsayı tipinde: kaydederken yuvarlanır'); if (Object.is(x, Number(data[ix])) || x === Number(data[ix])) ed.delete(ix); else ed.set(ix, x); if (ed.size) st.edits.set(v.name, ed); else st.edits.delete(v.name); updStatus(); renderList(); } }
        renderRight(); };
      inp.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') fin(true); else if (ev.key === 'Escape') fin(false); };
      inp.onblur = () => fin(true); td.replaceChildren(inp); inp.focus(); inp.select();
    };
    const go = h('input', {type: 'number', min: 1, max: R, value: r0 + 1, class: 'mx-go', title: 'Satıra git'}); go.onchange = () => { page = Math.floor((Math.max(1, Math.min(R, +go.value || 1)) - 1) / PR); renderRight(); };
    const nav = h('div', {class: 'mx-nav'},
      btn('◀', () => { page--; renderRight(); }), h('span', null, ` satır ${fmtCnt(r0 + 1)}–${fmtCnt(r1)} / ${fmtCnt(R)} `), btn('▶', () => { page++; renderRight(); }), h('span', null, ' git: '), go,
      ncp > 1 ? h('span', null, '   sütun ', btn('◀', () => { cpage--; renderRight(); }), ` ${c0 + 1}–${c1} / ${C} `, btn('▶', () => { cpage++; renderRight(); })) : null);
    right.replaceChildren(info(v), nav, h('div', {class: 'mx-tw'}, tb));
  }
  qi.oninput = () => { q = qi.value.trim(); renderList(); };
  const body = h('div', {class: 'mx-wrap'}, h('div', {class: 'mx-left'}, qi, list), right);
  renderList(); updStatus(); right.replaceChildren(h('div', {class: 'note'}, editable ? 'Soldan bir değişken seçin. Değeri değiştirmek için hücreye çift tıklayın; değişiklikler "Düzenlenmiş kopyayı kaydet" ile yeni bir .mat dosyasına yazılır (asıl dosya değişmez).' : 'MAT v7.3 (HDF5) dosyası: yalnız görüntüleme.'));
  modal('İçerik · ' + f.name, h('div', null, body, status), [
    ...(editable ? [{t: 'Düzenlenmiş kopyayı kaydet…', primary: true, fn: () => { if (!dirty()) { toast('Değişiklik yok'); return false; } matSaveEdited(f); return false; }},
      {t: 'Tüm değişiklikleri geri al', fn: () => { st.edits.clear(); st.del.clear(); st.ren.clear(); updStatus(); renderList(); renderRight(); return false; }}] : []), {t: 'Kapat'}]);
  $('#modal').classList.add('mx-modal');   // geniş pencere; sonraki modal() çağrısı kaldırır
}
// düzenlenmiş kopya: değişmeyen üst düzey öğeler bayt bayt kopyalanır (sıkıştırılmışlar da), değişenler ağaçtan yeniden yazılır
async function matBuildEdited(f) {
  const m = f.mat, st = MXV[f.id], file = m.file || new Blob([m.u8]), le = m.le !== false;
  if (!le) throw new Error('Büyük-endian .mat dosyası düzenlenemiyor');
  const rd = async (a, n) => new Uint8Array(await file.slice(a, Math.min(file.size, a + n)).arrayBuffer());
  const touched = new Set(); for (const k of st.edits.keys()) { const v = m.vars.find(x => x.name === k); if (v) touched.add(v.top == null ? v.name : v.top); } for (const k of st.ren.keys()) touched.add(k);
  const parts = [await rd(0, 128)], seen = new Set(); let o = 128, nEnc = 0;
  while (o + 8 <= file.size) {
    const tb = await rd(o, 8), dv = new DataView(tb.buffer), type = dv.getUint32(0, true), size = dv.getUint32(4, true);
    const next = o + 8 + (type === 15 ? size : ((size + 7) & ~7)); if (next <= o || next > file.size + 8) break;
    let name = '';
    if (type === 14 || type === 15) {
      let hb = type === 14 ? await rd(o, 1024) : await MAT.inflate(file.slice(o + 8, o + 8 + size), 1024);
      const hv = new DataView(hb.buffer, hb.byteOffset, hb.byteLength); let p = 8; const step = q => { const t = hv.getUint32(q, true), small = t >>> 16; return small ? q + 8 : q + 8 + ((hv.getUint32(q + 4, true) + 7) & ~7); };
      p = step(p); p = step(p); const nt = hv.getUint32(p, true), small = nt >>> 16, ln = small ? small : hv.getUint32(p + 4, true), d0 = small ? p + 4 : p + 8;
      for (let i = 0; i < ln && d0 + i < hb.length; i++) name += String.fromCharCode(hb[d0 + i]);
    }
    const first = !seen.has(name); seen.add(name);
    if (name && first && st.del.has(name)) { o = next; continue; }
    if (name && first && touched.has(name)) {
      const [tr] = await MAT.readAll(m, [name]); if (!tr) throw new Error(name + ' okunamadı');
      for (const [vn, mp] of st.edits) {
        const v = m.vars.find(x => x.name === vn); if (!v || (v.top == null ? v.name : v.top) !== name) continue;
        const nd = v.top == null ? tr : MXE.nodeAt(tr, vn); if (!nd || nd.k !== 'num') throw new Error(vn + ': düğüm bulunamadı');
        if (!(nd.re instanceof Float64Array)) nd.re = Float64Array.from(nd.re, Number);
        for (const [ix, val] of mp) nd.re[ix] = val;
      }
      parts.push(MXE.enc(tr, st.ren.get(name) || name)); nEnc++;
    } else parts.push(file.slice(o, Math.min(next, file.size)));
    o = next;
  }
  return {blob: new Blob(parts), nEnc};
}
function matSaveEdited(f) {
  busy('Düzenlenmiş .mat hazırlanıyor…', async () => {
    const {blob} = await matBuildEdited(f), nm = f.name.replace(/\.mat$/i, '') + '_duzenlenmis.mat';
    const ok = await saveBlob(blob, nm);
    if (ok !== false) toast(nm + ' kaydedildi', 7000, {t: 'MATView\'de aç', fn: () => openFiles([new File([blob], nm)])});
  });
}

// Ayarlar menüsü: açık .mat dosyalarından birini seç (birden fazlaysa sorar; imleçli dosya önce)
function matPick(fn) {
  const ms = S.files.filter(f => f.mat); if (!ms.length) return toast('Önce bir .mat dosyası açın');
  const cf = (S.plot.cursors || []).map(c => c.tr && c.tr.ch && c.tr.ch.file).find(f => f && f.mat);
  if (ms.length === 1) return fn(ms[0]);
  const box = h('div', null, h('div', {class: 'note', style: 'margin-bottom:6px'}, 'Dosya seçin:'));
  for (const f of ms.sort((a, b) => (b === cf) - (a === cf))) box.append(h('div', null, btn(f.name + (f === cf ? '  (imleçler bunda)' : ''), () => { $('#modal').classList.add('hidden'); fn(f); })));
  modal('Dosya seç', box, [{t: 'Vazgeç'}]);
}
(() => { const a = document.getElementById('btnTdiag'), b = document.getElementById('btnMatx');
  if (a) a.onclick = () => matPick(f => timeDiagDlg(f)); if (b) b.onclick = () => matPick(f => matContentDlg(f)); })();
