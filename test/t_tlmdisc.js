// telemetryParser v4.8 uyumu: "dikkate alınmayacak byte'lar" (header'dan önce/sonra) — her çerçeveye fazladan byte eklenmiş
// kayıt, ayar açıkken eklenmemiş kayıtla birebir aynı çözülmeli (sentetik veri: make_tlm.js); çerçeve dizini de aynı sayıda çerçeve bulmalı.
const fs = require('fs'), cp = require('child_process'), path = require('path');
const TP = require('./tlm_core.js')();
const D = '/tmp/_mv_tlm/';
if (!fs.existsSync(D + 'kayit.bin')) cp.execFileSync('node', [path.join(__dirname, 'make_tlm.js'), D]);
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('  HATA:', m); } };
(async () => {
  const S0 = (o => o.settings || o)(JSON.parse(fs.readFileSync(D + 'ayarlar.json', 'utf8'))); S0.singleMat = false; S0.matEnabled = true;
  const raw = fs.readFileSync(D + 'kayit.bin'), FL = S0.cols * S0.rows, hdr = Buffer.from(S0.header.replace(/\s+/g, ''), 'hex');
  // çerçeve başlangıçları (header başta)
  const starts = []; for (let i = 0; i + FL <= raw.length; ) { if (raw.slice(i, i + hdr.length).equals(hdr)) { starts.push(i); i += FL; } else i++; }
  const N = 7;
  const make = pos => { const parts = []; let prev = 0; for (const s of starts) { parts.push(raw.slice(prev, s)); const fr = raw.slice(s, s + FL), junk = Buffer.alloc(N, 0xA5); junk[0] = hdr[0]; junk[N - 1] = hdr[1];   // header benzeri byte'lar da içersin
      parts.push(pos === 'before' ? Buffer.concat([junk, fr]) : Buffer.concat([fr.slice(0, hdr.length), junk, fr.slice(hdr.length)])); prev = s + FL; } parts.push(raw.slice(prev)); return Buffer.concat(parts); };
  const run = async (S, buf, name) => { const sink = new TP.MemSink(); const r = await TP.runJobs({ settings: S, files: [new File([buf], name)], sink, folderName: 'x', mode: 'concat' }, () => {}); return {r, out: sink.out}; };
  const ref = await run(S0, raw, 'kayit.bin');
  for (const pos of ['before', 'after']) {
    const S = Object.assign({}, S0, { discardEnabled: true, discardCount: N, discardPos: pos }), buf = make(pos);
    const got = await run(S, buf, 'kayit.cnv');
    ok(got.r.stats.frames === ref.r.stats.frames, pos + ': çerçeve sayısı ' + got.r.stats.frames + ' ≠ ' + ref.r.stats.frames);
    let n = 0; for (const [k, v] of Object.entries(ref.out)) { if (!/\.(csv|mat)$/.test(k)) continue; const g = got.out[k.replace(/^kayit/, 'kayit')]; ok(g && Buffer.compare(Buffer.from(g), Buffer.from(v)) === 0 || /\.mat$/.test(k) && g && g.length === v.length, pos + ': ' + k + ' farklı'); n++; }
    const ix = await TP.scanFrames(S, [new File([buf], 'k.cnv')], 'file');
    ok(ix.n === ref.r.stats.frames && ix.frameLen === FL + N, pos + ': çerçeve dizini ' + ix.n + ' / ' + ix.frameLen);
    console.log(pos + ': ' + got.r.stats.frames + ' çerçeve, ' + n + ' çıktı karşılaştırıldı');
  }
  console.log('tlmdisc:', bad ? bad + ' HATA' : 'OK'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
