/* ===== Rapor → Word (.docx): kapak, üst/alt bilgi (sayfa no alanları), içindekiler, şekil/tablo/not ===== */
const DX = {esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), mm: v => Math.round(v * 36000)};
const dxNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const dxRun = (t, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}${o.sp ? `<w:spacing w:val="${o.sp}"/>` : ''}</w:rPr><w:t xml:space="preserve">${DX.esc(t)}</w:t></w:r>`;
const dxP = (inner, o = {}) => `<w:p><w:pPr>${o.keep ? '<w:keepNext/>' : ''}${o.tabs || ''}${o.border || ''}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 80}"${o.line ? ` w:line="${o.line}" w:lineRule="auto"` : ''}/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${inner}</w:p>`;
const dxField = (instr, cached, o) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${dxRun(cached, o)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
function dxImgSize(url) { return new Promise(r => { const im = new Image(); im.onload = () => r([im.naturalWidth || 300, im.naturalHeight || 100]); im.onerror = () => r([300, 100]); im.src = url; }); }
function dxBytes(url) { const b64 = url.slice(url.indexOf(',') + 1), bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
const dxExt = url => /image\/jpe?g/.test(url) ? 'jpeg' : /svg/.test(url) ? 'svg' : 'png';
function dxDrawing(rid, id, wEmu, hEmu, name) {
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${wEmu}" cy="${hEmu}"/><wp:docPr id="${id}" name="${DX.esc(name)}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${DX.esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}
const dxCell = (inner, w, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>` : ''}${o.noB ? '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>' : ''}<w:vAlign w:val="${o.va || 'center'}"/></w:tcPr>${inner}</w:tc>`;
function dxTable(head, rows, widths, o = {}) {
  const sz = o.sz || 16, bd = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="666666"/>`).join('') + '</w:tblBorders>';
  const cp = (t, w, shd, b) => dxCell(dxP(dxRun(t, {sz, b}), {after: 0}), w, {shd});
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${bd}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + (head ? `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${head.map((t, i) => cp(t, widths[i], 'E5E8EE', true)).join('')}</w:tr>` : '')
    + rows.map(r => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((t, i) => cp(t, widths[i], o.firstShd && i === 0 ? 'EEF0F4' : null, o.firstShd && i === 0)).join('')}</w:tr>`).join('') + '</w:tbl>';
}
async function repDocx(m) {
  const items = REP.items, W = 10206, rels = [], media = [], enc = new TextEncoder(); let rid = 10, imgN = 0, did = 1;
  const addImg = url => { const id = 'rId' + (rid++), ext = dxExt(url), name = 'image' + (++imgN) + '.' + ext; media.push(['word/media/' + name, dxBytes(url)]); return {id, name, ext}; };
  // üst bilgi için logo (header1 kendi ilişki dosyasına sahip)
  let logoSize = null, logoBytes = null, logoExt = 'png'; if (m.logo) { logoSize = await dxImgSize(m.logo); logoBytes = dxBytes(m.logo); logoExt = dxExt(m.logo); }
  const logoEmu = (maxH, maxW) => { const [w, h] = logoSize, s = Math.min(maxH / h, maxW / w); return [DX.mm(w * s), DX.mm(h * s)]; };   // w,h px -> mm ölçeği: oran korunur
  const hdrLogo = m.logo ? (() => { const [w, h] = logoSize, sc = Math.min(15 / h, 46 / w); return dxDrawing('rIdLogo', 900, DX.mm(w * sc), DX.mm(h * sc), 'logo'); })() : '';
  const meta = [['Dok. No', m.docNo], ['Tarih', m.date], ['Proje No', m.project], ['Revizyon', m.rev]].filter(x => x[1]);
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${dxNS}><w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders><w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="2700"/><w:gridCol w:w="4806"/><w:gridCol w:w="2700"/></w:tblGrid><w:tr>`
    + dxCell(dxP(hdrLogo, {after: 0}), 2700)
    + dxCell(dxP(dxRun(m.title, {b: 1, sz: 24}), {jc: 'center', after: 0}), 4806)
    + dxCell(meta.map(([k, v]) => dxP(dxRun(k + ': ', {sz: 15, color: '444444'}) + dxRun(v, {b: 1, sz: 15}), {jc: 'right', after: 0})).join(''), 2700) + '</w:tr></w:tbl>' + dxP('', {after: 0}) + '</w:hdr>';
  const ftTabs = `<w:tabs><w:tab w:val="center" w:pos="${W / 2}"/><w:tab w:val="right" w:pos="${W}"/></w:tabs>`, topB = '<w:pBdr><w:top w:val="single" w:sz="6" w:space="2" w:color="000000"/></w:pBdr>';
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${dxNS}>${dxP(dxRun(m.org, {sz: 16}) + '<w:r><w:tab/></w:r>' + dxRun(m.cls, {b: 1, sz: 16, sp: 20}) + '<w:r><w:tab/></w:r>' + dxRun('Sayfa ', {sz: 16}) + dxField('PAGE', '1', {sz: 16}) + dxRun(' / ', {sz: 16}) + dxField('NUMPAGES', '1', {sz: 16}), {tabs: ftTabs, border: topB, after: 0})}</w:ftr>`;
  const footerFirst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${dxNS}>${dxP(dxRun(m.cls, {b: 1, sz: 20, sp: 30}), {jc: 'center', border: topB, after: 0})}</w:ftr>`;
  const headerFirst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${dxNS}>${dxP(dxRun(m.cls, {b: 1, sz: 20, sp: 30}), {jc: 'center', border: '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="000000"/></w:pBdr>', after: 0})}</w:hdr>`;
  const parts = []; const pb = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  // --- kapak ---
  let coverLogo = ''; if (m.logo) { const [w, h] = logoSize, sc = Math.min(28 / h, 70 / w), a = addImg(m.logo); coverLogo = dxDrawing(a.id, did++, DX.mm(w * sc), DX.mm(h * sc), 'logo'); }
  parts.push(dxP(coverLogo + (m.org ? '<w:r><w:tab/></w:r>' + dxRun(m.org, {sz: 22}) : ''), {tabs: `<w:tabs><w:tab w:val="right" w:pos="${W}"/></w:tabs>`, after: 2600}));
  parts.push(dxP(dxRun(m.title, {b: 1, sz: 52}), {jc: 'center', before: 1800, after: 1800, line: 276}));
  parts.push(dxTable(null, [['Doküman no', m.docNo], ['Proje no', m.project], ['Revizyon', m.rev], ['Tarih', m.date], ['Gizlilik derecesi', m.cls]].filter(x => x[1]), [2800, 5400], {sz: 21, firstShd: true}).replace('<w:tblW w:w="8200" w:type="dxa"/>', '<w:tblW w:w="8200" w:type="dxa"/><w:jc w:val="center"/>'));
  parts.push(dxP('', {before: 1800, after: 0}));
  parts.push(dxTable(['Hazırlayan', 'Kontrol eden', 'Onaylayan'], [[m.prep || ' ', m.chk || ' ', m.appr || ' ']], [3400, 3400, 3400], {sz: 19}));
  parts.push(pb);
  // --- özet / revizyon / içindekiler ---
  const {toc} = repPaginate(m); let bm = 0; const tocBm = [];
  const sumParas = m.summary ? [dxP(dxRun('Özet', {b: 1, sz: 26}), {keep: 1, after: 100})].concat(m.summary.split(/\n\s*\n/).map(p => dxP(dxRun(p.replace(/\n/g, ' ')), {jc: 'both'}))) : [];
  const revRows = (m.revs || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|').map(x => x.trim()));
  parts.push(...sumParas);
  if (revRows.length) { parts.push(dxP(dxRun('Revizyon geçmişi', {b: 1, sz: 24}), {before: 200, keep: 1, after: 80})); parts.push(dxTable(['Rev', 'Tarih', 'Açıklama'], revRows.map(r => [r[0] || '', r[1] || '', r.slice(2).join(' | ')]), [1000, 1800, 7406], {sz: 18})); }
  parts.push(dxP(dxRun('İçindekiler', {b: 1, sz: 24}), {before: 200, keep: 1, after: 80}));
  const tocIdx = parts.length; parts.push('@@TOC@@'); parts.push(pb);
  // --- içerik ---
  let figN = 0, tabN = 0, ti = 0; const tocRows = [];
  const bmark = (inner, name) => { const id = ++bm; return `<w:bookmarkStart w:id="${id}" w:name="${name}"/>${inner}<w:bookmarkEnd w:id="${id}"/>`; };
  for (let ii = 0; ii < items.length; ii++) {
    const it = items[ii], nx = items[ii + 1];
    if (it.type === 'fig' && it.half && nx && nx.type === 'fig' && nx.half) {
      const cell = q => { figN++; const nm = '_Ref_f' + figN, a = addImg(q.url), w = 85, hh = Math.min(w * q.ar, 110), ww = hh / q.ar; tocRows.push([`Şekil ${figN} – ${q.title || ''}`, nm, toc[ti++]?.[1] ?? '']);
        return dxCell(dxP(dxDrawing(a.id, did++, DX.mm(ww), DX.mm(hh), 'sekil' + figN), {jc: 'center', keep: 1, after: 40}) + dxP(bmark(dxRun('Şekil ' + figN, {b: 1, sz: 18}) + dxRun(' – ' + (q.title || ''), {sz: 18}), nm), {jc: 'center', after: q.note ? 20 : 120}) + (q.note ? dxP(dxRun(q.note, {sz: 16, color: '333333'}), {after: 120}) : ''), W / 2, {noB: true, va: 'top'}); };
      parts.push(`<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${W / 2}"/><w:gridCol w:w="${W / 2}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(it)}${cell(nx)}</w:tr></w:tbl>`); parts.push(dxP('', {after: 120})); ii++; continue;
    }
    if (it.type === 'fig') {
      figN++; const nm = '_Ref_f' + figN, a = addImg(it.url), w = 180, hh = Math.min(w * it.ar, 150), ww = hh / it.ar; tocRows.push([`Şekil ${figN} – ${it.title || ''}`, nm, toc[ti++]?.[1] ?? '']);
      parts.push(dxP(dxDrawing(a.id, did++, DX.mm(ww), DX.mm(hh), 'sekil' + figN), {jc: 'center', keep: 1, after: 40}));
      parts.push(dxP(bmark(dxRun('Şekil ' + figN, {b: 1, sz: 18}) + dxRun(' – ' + (it.title || ''), {sz: 18}), nm), {jc: 'center', after: it.note ? 20 : 200}));
      if (it.note) parts.push(dxP(dxRun(it.note, {sz: 17, color: '333333'}), {after: 200}));
    } else if (it.type === 'table') {
      tabN++; const nm = '_Ref_t' + tabN; tocRows.push([`Tablo ${tabN} – ${it.title || ''}`, nm, toc[ti++]?.[1] ?? '']);
      parts.push(dxP(bmark(dxRun('Tablo ' + tabN, {b: 1, sz: 18}) + dxRun(' – ' + (it.title || ''), {sz: 18}), nm), {keep: 1, before: 100, after: 60}));
      const nc = it.head.length, wcol = Math.floor(W / nc), ws = it.head.map(() => wcol); ws[0] += W - wcol * nc;
      parts.push(dxTable(it.head, it.rows, ws, {sz: 15})); if (it.note) parts.push(dxP(dxRun(it.note, {sz: 16, color: '333333'}), {before: 60, after: 200})); else parts.push(dxP('', {after: 120}));
    } else if (it.type === 'text') {
      if (it.title) { const nm = '_Ref_x' + (++bm); tocRows.push([it.title, nm, toc[ti++]?.[1] ?? '']); parts.push(dxP(bmark(dxRun(it.title, {b: 1, sz: 24}), nm), {keep: 1, before: 120, after: 80})); }
      for (const p of it.body.split(/\n\s*\n/)) parts.push(dxP(dxRun(p.replace(/\n/g, ' ')), {jc: 'both'}));
    }
  }
  parts[tocIdx] = tocRows.map(([t, nm, pg]) => dxP(dxRun(t) + '<w:r><w:tab/></w:r>' + dxField(`PAGEREF ${nm} \\h`, String(pg)), {tabs: `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${W}"/></w:tabs>`, after: 30})).join('') || dxP('', {});
  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/><w:headerReference w:type="first" r:id="rIdH2"/><w:footerReference w:type="default" r:id="rIdF1"/><w:footerReference w:type="first" r:id="rIdF2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1650" w:right="850" w:bottom="1100" w:left="850" w:header="450" w:footer="400" w:gutter="0"/><w:titlePg/></w:sectPr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${dxNS}><w:body>${parts.join('')}${sect}</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="tr-TR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rIdH1" Type="${R}/header" Target="header1.xml"/><Relationship Id="rIdH2" Type="${R}/header" Target="header2.xml"/><Relationship Id="rIdF1" Type="${R}/footer" Target="footer1.xml"/><Relationship Id="rIdF2" Type="${R}/footer" Target="footer2.xml"/>` + media.map(([p], i) => { const nm = p.split('/').pop(); const id = 'rId' + (10 + i); return `<Relationship Id="${id}" Type="${R}/image" Target="media/${nm}"/>`; }).join('') + '</Relationships>';
  const files = [['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', doc], ['word/styles.xml', styles], ['word/_rels/document.xml.rels', docRels], ['word/header1.xml', header], ['word/header2.xml', headerFirst], ['word/footer1.xml', footer], ['word/footer2.xml', footerFirst]];
  if (m.logo) { files.push(['word/media/logo.' + logoExt, logoBytes], ['word/_rels/header1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="${R}/image" Target="media/logo.${logoExt}"/></Relationships>`]); if (logoExt === 'svg') toast('SVG logo Word’de görünmeyebilir; PNG/JPEG önerilir', 6000); }
  return XLSX.zip([...files, ...media], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
async function repDocxSave() { const m = repMeta(); try { const b = await repDocx(m); await saveBlob(b, sanitizeName(m.docNo || m.title || 'rapor') + '_' + sanitizeName(m.rev || 'A') + '.docx'); } catch (e) { toast('Word çıktısı hatası: ' + e.message, 8000); } }
