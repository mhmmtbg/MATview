// Telemetri modülü için sentetik kayıt üretir (gerçek veri değildir).
//   node test/make_tlm.js <çıktı klasörü> [ayar.json] [çerçeve sayısı]
// Ayar verilmezse telemetryParser'ın örnek ayarları + iki çerçeve tipine birer "video" alanı kullanılır.
// video alanları için ffmpeg varsa H.264 (RTP / FU-A, "RTP0"+uzunluk kayıtları, 0xAA dolgu, 2 bayt footer) üretilir.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const TP = require('./tlm_core.js')();
const OUT = process.argv[2] || '/tmp/_mv_tlm', NF = +(process.argv[4] || 1200);
fs.mkdirSync(OUT, { recursive: true });
let S;
if (process.argv[3]) S = (o => o.settings || o)(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')));
else {
  S = TP.buildSamples().settings;
  const vrow = (u, i, n, e) => [u, String(i), n, 'video', String(e), '', '', '', '', '', '', ''];
  S.frameTypes[0].templateRows.push(vrow('KAMERA_A', 6000, 'goruntu', 990));
  S.frameTypes[1].templateRows.push(vrow('KAMERA_B', 7000, 'goruntu', 1990));
  S.framePeriodMs = 10; S.live = { source: 'sim', sim: { periodMs: 10, loop: false } };
  fs.writeFileSync(path.join(OUT, 'ayarlar.json'), JSON.stringify({ app: 'telemetryParser', format: 2, version: TP.VERSION, settings: S, liveWork: [] }));
  S.frameTypes.forEach((ft, i) => fs.writeFileSync(path.join(OUT, 'template_cerceve' + i + '.xlsx'), TP.writeXlsx(ft.templateRows, 'Template')));
}
const C = S.cols, R = S.rows, FL = C * R, hdr = TP.parseHexBytes(S.header).bytes, T = (+S.framePeriodMs || 10) / 1000;
const comp = S.frameTypes.map(ft => TP.compileTemplate(ft.templateRows, S));
comp.forEach((c, i) => { if (c.errors.length) throw new Error('template ' + i + ': ' + c.errors[0].msg); });

/* kamera: Annex B → AU → RTP → "RTP0" kayıtları (üretim zamanıyla) */
function nals(b) { const out = []; let s = -1; for (let i = 0; i + 3 <= b.length; i++) if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1) { if (s >= 0) { let e = i; if (b[e - 1] === 0) e--; out.push(b.subarray(s, e)); } s = i + 3; i += 2; } if (s >= 0) out.push(b.subarray(s)); return out; }
function camera(src, size, ssrc) {
  const f = path.join(OUT, 'kamera_' + ssrc + '.h264');
  try { cp.execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', src + '=size=' + size + ':rate=25', '-t', String(Math.ceil(NF * T) + 2), '-c:v', 'libx264', '-profile:v', 'baseline', '-g', '25', '-bf', '0', '-b:v', '150k', '-x264-params', 'aud=1:repeat-headers=1', '-pix_fmt', 'yuv420p', '-f', 'h264', f]); }
  catch (e) { return null; }
  const ns = nals(fs.readFileSync(f)), aus = []; let cur = null;
  for (const n of ns) { if ((n[0] & 31) === 9) { cur = []; aus.push(cur); continue; } if (!cur) { cur = []; aus.push(cur); } cur.push(n); }
  let seq = 100; const recs = [];
  aus.forEach((au, i) => {
    const ts = (i * 3600) >>> 0, pk = [];
    for (const n of au) {
      if (n.length <= 1200) pk.push(n);
      else { const h0 = n[0]; let o = 1, first = true; while (o < n.length) { const L = Math.min(1200, n.length - o), last = o + L >= n.length, p = new Uint8Array(2 + L); p[0] = (h0 & 0xe0) | 28; p[1] = (first ? 0x80 : 0) | (last ? 0x40 : 0) | (h0 & 31); p.set(n.subarray(o, o + L), 2); pk.push(p); o += L; first = false; } }
    }
    pk.forEach((pl, k) => {
      const r = new Uint8Array(12 + pl.length); r[0] = 0x80; r[1] = 96 | (k === pk.length - 1 ? 0x80 : 0); r[2] = (seq >> 8) & 255; r[3] = seq & 255; seq = (seq + 1) & 0xffff;
      r[4] = ts >>> 24; r[5] = (ts >> 16) & 255; r[6] = (ts >> 8) & 255; r[7] = ts & 255; r[11] = ssrc; r.set(pl, 12);
      const rec = new Uint8Array(6 + r.length); rec.set([0x52, 0x54, 0x50, 0x30, r.length & 255, r.length >> 8]); rec.set(r, 6);
      recs.push({ t: i / 25, b: rec });
    });
  });
  return { recs, qi: 0, buf: [], aus: aus.length };
}
const cams = new Map(); let camNo = 0;
comp.forEach(c => c.defs.forEach(d => { if (d.type.video && !cams.has(d.unit)) { camNo++; cams.set(d.unit, camera(camNo % 2 ? 'testsrc' : 'testsrc2', camNo % 2 ? '320x240' : '256x192', camNo)); } }));
function camTake(cam, t, n) {
  if (!cam) return [];
  while (cam.qi < cam.recs.length && cam.recs[cam.qi].t <= t) { for (const x of cam.recs[cam.qi].b) cam.buf.push(x); cam.qi++; }
  return cam.buf.splice(0, Math.min(n, cam.buf.length));
}
function val(d, k, s, e) {
  if (d.name === 'sel') return k % 256;
  const ty = d.type, w = 2 * Math.PI * (k + s / d.n) / (150 + (d.line * 37) % 600) + d.line * 0.3 + e;
  if (ty.kind === 'float') return Math.sin(w) * (10 + d.line % 50);
  const bits = ty.bits, max = Math.pow(2, Math.min(bits, 52)) - 1;
  if (ty.kind === 'bit') return bits === 1 ? ((k >> 4) + d.line) & 1 : Math.floor((Math.sin(w) * 0.5 + 0.5) * max);
  if (ty.signed) return Math.round(Math.sin(w) * (max / 2 - 1) * 0.6);
  if (bits > 48) return BigInt(k) * 7n;
  return Math.round((Math.sin(w) * 0.45 + 0.5) * max);
}
function encodeDefs(L, dv, defs, k) {
  for (const d of defs) {
    if (d.isSlot || d.type.video) continue;
    const st = d.byte * 8 + d.bit, step = d.sMode === 'block' ? d.blockSize * 8 : d.perSample * d.elemBits;
    for (let s = 0; s < d.n; s++) {
      if (d.type.kind === 'bytes') { for (let i = 0; i < d.E; i++) L[d.byte + (d.sMode === 'block' ? s * d.blockSize : s * d.E) + i] = (k + i + d.line) & 255; continue; }
      for (let e = 0; e < d.perSample; e++) { try { TP.encodeValue(L, dv, d, st + s * step + e * d.elemBits, val(d, k, s, e)); } catch (x) {} }
    }
  }
}
const slots = new Map();
comp.forEach(c => c.streams.forEach(sd => { let q = slots.get(sd.slotByte); if (!q) slots.set(sd.slotByte, q = { len: sd.slotLen, streams: [], buf: [], pk: 0 }); if (!q.streams.some(x => x.unit === sd.unit)) q.streams.push(sd); }));
function slotBytes(q, n) {
  while (q.buf.length < n) { const sd = q.streams[q.pk % q.streams.length], P = new Uint8Array(sd.packetLen); P.set(sd.header, 0); encodeDefs(P, new DataView(P.buffer), sd.inner, q.pk); q.pk++; for (const x of P) q.buf.push(x); }
  return q.buf.splice(0, n);
}
const cntT = TP.parseType(S.counterType || 'uint16'), cntB = cntT ? cntT.bits / 8 : 2;
const fd = fs.openSync(path.join(OUT, 'kayit.bin'), 'w'), raw = new Uint8Array(FL);
let written = 0, lost = 0;
for (let k = 0; k < NF; k++) {
  const ty = S.frameIdEnabled && S.frameTypes.length > 1 && k % 4 === 3 ? 1 : 0, c = comp[ty], L = new Uint8Array(FL), dv = new DataView(L.buffer), t = k * T;
  encodeDefs(L, dv, c.defs.filter(d => d.ctx === 'frame'), k);
  for (const d of c.defs) if (d.type.video && d.ctx === 'frame') {
    const cap = d.E - 2, data = camTake(cams.get(d.unit), t, cap);
    L.set(data, d.byte); L.fill(0xAA, d.byte + data.length, d.byte + cap); L[d.byte + cap] = (k >> 8) & 255; L[d.byte + cap + 1] = k & 255;
  }
  c.streams.forEach(sd => { const q = slots.get(sd.slotByte); if (q.done !== k) { L.set(slotBytes(q, q.len), sd.slotByte); q.done = k; } });
  if (S.counterEnabled) { let v = BigInt(k); for (let b = 0; b < cntB; b++) { const byte = Number(v & 255n); v >>= 8n; L[S.counterIndex + (S.counterEndian === 'big' ? cntB - 1 - b : b)] = byte; } }
  if (S.frameIdEnabled) L[S.frameIdIndex] = TP.parseByteValue(S.frameTypes[ty].id);
  if (S.transpose) { for (let cc = 0; cc < C; cc++) for (let r = 0; r < R; r++) raw[r * C + cc] = L[cc * R + r]; } else raw.set(L);
  raw.set(hdr, S.headerPos === 'end' ? FL - hdr.length : 0);
  if (k >= Math.floor(NF / 2) && k < Math.floor(NF / 2) + 3) { lost++; continue; }
  fs.writeSync(fd, raw); written++;
  if (k === 100) fs.writeSync(fd, Buffer.from([1, 2, 3, 4, 5, 6, 7]));
}
fs.closeSync(fd);
console.log(path.join(OUT, 'kayit.bin') + ': ' + written + ' çerçeve, ' + lost + ' kayıp; kamera ' + [...cams].map(([u, c]) => u + (c ? '=' + c.aus + ' kare' : '=yok (ffmpeg yok)')).join(', '));
