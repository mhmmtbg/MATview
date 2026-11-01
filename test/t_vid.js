// Video kayıp dayanıklılığı (sentetik H.264, ffmpeg ile üretilir): bozuk kareler atlanır, MP4 kaydı kayıptan sonra
// bir sonraki IDR/I karede sürer ve sonuna kadar gider; I dilim tipi ayrıştırma.
const fs = require('fs'), cp = require('child_process'), assert = require('assert'), os = require('os'), path = require('path');
const TP = require('./tlm_core.js')();
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mvvid')), H = path.join(D, 'a.h264');
try { cp.execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=25', '-t', '12', '-c:v', 'libx264', '-profile:v', 'baseline', '-g', '50', '-bf', '0', '-x264-params', 'aud=1:repeat-headers=1:scenecut=0', '-pix_fmt', 'yuv420p', '-f', 'h264', H]); }
catch (e) { console.log('ffmpeg yok, video testi atlandı'); process.exit(0); }
const b = fs.readFileSync(H), nals = []; let s = -1;
for (let i = 0; i + 3 <= b.length; i++) if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1) { if (s >= 0) { let e = i; if (b[e - 1] === 0) e--; nals.push(b.subarray(s, e)); } s = i + 3; }
nals.push(b.subarray(s));
const aus = []; let cur = null; for (const n of nals) { if ((n[0] & 31) === 9) { cur = []; aus.push(cur); continue; } if (!cur) { cur = []; aus.push(cur); } cur.push(n); }
// I dilim tespiti: IDR dilimi tipini 1 (IDR olmayan) yapınca da I sayılmalı; P kare I sayılmamalı
const idr = aus[0].find(n => (n[0] & 31) === 5), fake = Uint8Array.from(idr); fake[0] = (fake[0] & 0xe0) | 1;
assert.ok(TP.h264Intra([fake]), 'I dilim'); const pf = aus[5].find(n => (n[0] & 31) === 1); assert.ok(!TP.h264Intra([pf]), 'P dilim');
// RTP kayıtları; 100. karenin bir paketi ve 160. karenin tamamı kaybolur
let seq = 10; const recs = [], lostAu = 100, lostWhole = 160;
aus.forEach((au, i) => {
  const pk = []; for (const n of au) { if (n.length <= 300) pk.push(n); else { let o = 1, first = true; while (o < n.length) { const L = Math.min(300, n.length - o), last = o + L >= n.length, p = new Uint8Array(2 + L); p[0] = (n[0] & 0xe0) | 28; p[1] = (first ? 0x80 : 0) | (last ? 0x40 : 0) | (n[0] & 31); p.set(n.subarray(o, o + L), 2); pk.push(p); o += L; first = false; } } }
  pk.forEach((pl, k) => {
    const r = new Uint8Array(12 + pl.length), ts = i * 3600; r[0] = 0x80; r[1] = 96 | (k === pk.length - 1 ? 0x80 : 0); r[2] = seq >> 8 & 255; r[3] = seq & 255; seq = (seq + 1) & 0xffff;
    r[4] = ts >>> 24; r[5] = ts >> 16 & 255; r[6] = ts >> 8 & 255; r[7] = ts & 255; r.set(pl, 12);
    if ((i === lostAu && k === 1 && pk.length > 2) || i === lostWhole) return;
    const rec = new Uint8Array(6 + r.length); rec.set([0x52, 0x54, 0x50, 0x30, r.length & 255, r.length >> 8]); rec.set(r, 6); recs.push(rec);
  });
});
const all = new Uint8Array(recs.reduce((a, r) => a + r.length, 0)); let o = 0; for (const r of recs) { all.set(r, o); o += r.length; }
function MemStore() { this.parts = []; } MemStore.prototype.put = function (u) { this.parts.push(u.slice()); return this.parts.length - 1; }; MemStore.prototype.get = async function (r) { return this.parts[r]; };
(async () => {
  const mw = new TP.Mp4Writer(new MemStore(), {fps: 25}), got = [];
  const dp = new TP.VideoDepack({chunked: false, onAU: au => { got.push(au); mw.add(au); }});
  for (let i = 0; i < all.length; i += 990) dp.push(all.subarray(i, i + 990)); dp.flush();
  console.log('kare', aus.length, 'gelen', got.length, 'bozuk', dp.st.brokenAu, 'kayıptan sonra', got.filter(a => a.afterLoss).length, 'MP4', mw.sizes.length, 'atılan', mw.dropped, 'kayıp noktası', mw.lossEvents);
  assert.ok(dp.st.brokenAu >= 1 && got.some(a => a.afterLoss), 'kayıp işaretleri');
  assert.strictEqual(mw.lossEvents, 2); assert.ok(mw.sizes.length >= aus.length - 2 - 2 * 50 && mw.sizes.length < aus.length - 2, 'MP4 sonuna kadar sürmeli');
  assert.ok(Math.abs(mw.duration() - aus.length / 25) < 0.2, 'süre korunmalı ' + mw.duration());
  // kayıptan sonra ilk yazılan kare anahtar kare olmalı
  const ix = got.findIndex(a => a.ts === 101 * 3600), kk = mw.ts.findIndex(t => t > lostAu * 3600); assert.ok(mw.keys[kk], 'kayıptan sonra anahtar kareden devam');
  fs.writeFileSync(path.join(D, 'o.mp4'), Buffer.from(await (await mw.toBlob()).arrayBuffer()));
  const n = cp.execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path.join(D, 'o.mp4')]).toString().trim();
  console.log('ffprobe çözülen kare', n); assert.strictEqual(+n, mw.sizes.length, 'MP4 tümüyle çözülebilmeli');
  fs.rmSync(D, {recursive: true}); console.log('t_vid OK');
})().catch(e => { console.log('HATA', e.message); process.exit(1); });
