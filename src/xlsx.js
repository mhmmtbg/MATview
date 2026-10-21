/* Kurulumsuz minimal XLSX okuyucu: zip + DecompressionStream; sayfalar -> {name, rows:[[...]]} */
const XLSX = (() => {
  async function inflateRaw(u8) {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter(); w.write(u8); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf); let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Geçerli bir .xlsx (zip) dosyası değil');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = new Map();
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Zip dizini bozuk');
      const meth = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
      files.set(name, {meth, csz, off});
    }
    return async name => {
      const f = files.get(name); if (!f) return null;
      const lo = f.off, ln = dv.getUint16(lo + 26, true), le = dv.getUint16(lo + 28, true), s = lo + 30 + ln + le, raw = u8.subarray(s, s + f.csz);
      return f.meth === 0 ? raw : f.meth === 8 ? inflateRaw(raw) : (() => { throw new Error('Desteklenmeyen zip yöntemi'); })();
    };
  }
  const dec = u => new TextDecoder('utf-8').decode(u);
  const parse = s => new DOMParser().parseFromString(s, 'application/xml');
  const colNum = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const tx = el => { let s = ''; for (const t of el.getElementsByTagName('t')) s += t.textContent; return s; };
  async function read(file) {
    const get = await unzip(await file.arrayBuffer());
    const wbx = await get('xl/workbook.xml'); if (!wbx) throw new Error('xl/workbook.xml yok');
    const wb = parse(dec(wbx)), rels = parse(dec(await get('xl/_rels/workbook.xml.rels')));
    const rt = {}; for (const r of rels.getElementsByTagName('Relationship')) rt[r.getAttribute('Id')] = r.getAttribute('Target');
    let sst = []; const sx = await get('xl/sharedStrings.xml');
    if (sx) sst = [...parse(dec(sx)).getElementsByTagName('si')].map(tx);
    const sheets = [];
    for (const s of wb.getElementsByTagName('sheet')) {
      const name = s.getAttribute('name'); let id = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let tg = rt[id]; if (!tg) continue; tg = tg.replace(/^\//, ''); const path = tg.startsWith('xl/') ? tg : 'xl/' + tg;
      const data = await get(path); if (!data) continue;
      const doc = parse(dec(data)), rows = []; let maxc = 0;
      for (const c of doc.getElementsByTagName('c')) {
        const ref = c.getAttribute('r'); const m = /^([A-Z]+)(\d+)$/.exec(ref || ''); if (!m) continue;
        const ci = colNum(m[1]), ri = +m[2] - 1, t = c.getAttribute('t'); let v = '';
        if (t === 'inlineStr') v = tx(c); else { const ve = c.getElementsByTagName('v')[0]; if (ve) { v = ve.textContent; if (t === 's') v = sst[+v] ?? ''; else if (t === 'b') v = v === '1' ? 'DOĞRU' : 'YANLIŞ'; } }
        if (v === '') continue;
        (rows[ri] || (rows[ri] = []))[ci] = v; if (ci + 1 > maxc) maxc = ci + 1;
      }
      for (let r = 0; r < rows.length; r++) { if (!rows[r]) rows[r] = []; }
      // birleştirilmiş hücreler: sol-üst değeri aralığa yay
      for (const mc of doc.getElementsByTagName('mergeCell')) {
        const mm = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(mc.getAttribute('ref') || ''); if (!mm) continue;
        const c0 = colNum(mm[1]), r0 = +mm[2] - 1, c1 = colNum(mm[3]), r1 = +mm[4] - 1, v = rows[r0] && rows[r0][c0]; if (v == null) continue;
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) (rows[r] || (rows[r] = []))[c] = v;
      }
      sheets.push({name, rows, ncols: maxc});
    }
    return sheets;
  }
  // Basit .xlsx yazıcı (şablon indirme): sheets=[{name, rows:[[...]]}], zip "stored" (sıkıştırmasız)
  function crc32(u8) { let c, crc = 0xFFFFFFFF; if (!crc32.t) { crc32.t = new Uint32Array(256); for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc32.t[n] = c >>> 0; } } for (let i = 0; i < u8.length; i++) crc = crc32.t[(crc ^ u8[i]) & 255] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0; }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  function write(sheets) {
    const enc = new TextEncoder(), files = [];
    files.push(['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>']);
    files.push(['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
    files.push(['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>']);
    files.push(['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + '</Relationships>']);
    sheets.forEach((s, i) => {
      let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
      s.rows.forEach((row, r) => { x += `<row r="${r + 1}">`; row.forEach((v, c) => { if (v == null || v === '') return; const ref = colName(c) + (r + 1); x += typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`; }); x += '</row>'; });
      files.push([`xl/worksheets/sheet${i + 1}.xml`, x + '</sheetData></worksheet>']);
    });
    const parts = [], cen = []; let off = 0;
    for (const [name, txt] of files) {
      const nb = enc.encode(name), data = enc.encode(txt), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(lh.buffer), nb, data);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      cen.push(new Uint8Array(ch.buffer), nb); off += 30 + nb.length + data.length;
    }
    let cs = 0; for (const c of cen) cs += c.length;
    const ed = new DataView(new ArrayBuffer(22)); ed.setUint32(0, 0x06054b50, true); ed.setUint16(8, files.length, true); ed.setUint16(10, files.length, true); ed.setUint32(12, cs, true); ed.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(ed.buffer)], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  return {read, write};
})();
