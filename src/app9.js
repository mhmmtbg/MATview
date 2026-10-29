/* ===== Rapor: kapak, üst/alt bilgili A4 sayfalar, içindekiler, şekil/tablo/not; PDF (yazdır) veya HTML ===== */
const REP = {items: [], meta: null, cls: ['TASNİF DIŞI', 'HİZMETE ÖZEL', 'ÖZEL', 'GİZLİ', 'ÇOK GİZLİ']};
const repEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const repToday = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(); };
function repMeta() {
  if (!REP.meta) { let m = {}; try { m = JSON.parse(localStorage.getItem('mv.reportMeta') || '{}'); } catch (_) {} REP.meta = Object.assign({title: '', docNo: '', date: '', project: '', rev: 'A', cls: 'HİZMETE ÖZEL', org: '', prep: '', chk: '', appr: '', summary: '', revs: '', logo: ''}, m); }
  return REP.meta;
}
function repSaveMeta() { try { localStorage.setItem('mv.reportMeta', JSON.stringify(REP.meta)); } catch (_) { try { const m = Object.assign({}, REP.meta, {logo: ''}); localStorage.setItem('mv.reportMeta', JSON.stringify(m)); } catch (__) {} } }

/* ---- içerik toplama ---- */
async function repAddView() {
  const T = exportReady(); if (!T) return; const c = T === S.specView ? T.toPNG(2, true) : T.toPNG(2, true);
  const title = VIEWNAME_TR[S.view] + (activeAxes() && S.view === 'time' && activeAxes().title ? ' – ' + activeAxes().title : '');
  REP.items.push({type: 'fig', url: c.toDataURL('image/png'), ar: c.height / c.width, title, note: ''}); repRefreshList(); toast('Rapora eklendi: ' + title);
}
const VIEWNAME_TR = {time: 'Zaman grafiği', spec: 'Spektrum', sgram: 'Spektrogram', xy: 'Dağılım grafiği'};
function repAddStats() {
  const rows = [], f = v => fmtNum(v, 5);
  for (const ax of S.plot.axes) for (const tr of ax.traces) {
    if (tr.kind !== 'ts' || !tr.visible || !tr.ch || !tr.ch.data) continue; const [a, b] = visRange(tr, ax), s = DSP.stats(tr.ch.data, tr.ch.del, a, b);
    rows.push([tr.label, tr.ch.unit || '', fmtCnt(s.n), f(s.min), f(s.max), f(s.mean), f(s.rms), f(s.std), f(s.p2p)]);
  }
  if (!rows.length) return toast('İstatistik için zaman grafiğinde yüklü (çizilmiş) iz gerekir');
  REP.items.push({type: 'table', title: 'Görünen aralık istatistikleri', head: ['İz', 'Birim', 'N', 'Min', 'Maks', 'Ort', 'RMS', 'Std', 'Tepe-tepe'], rows, note: 'Değerler grafikte görünen zaman aralığı için hesaplanmıştır; silinen noktalar dışarıda bırakılır. Titreşim için Std, DC çıkarılmış RMS (Grms) değeridir.'});
  repRefreshList(); toast('İstatistik tablosu eklendi');
}
function repAddInfo() {
  const rows = []; const used = new Set(); for (const a of S.plot.axes) for (const t of a.traces) if (t.ch) used.add(t.ch);
  for (const f of allFiles()) for (const c of f.channels) { if (!used.has(c)) continue; rows.push([f.name, c.label || c.name, c.unit || '', fmtNum(c.fs, 6), fmtCnt(c.n), fmtNum(c.n / c.fs, 6)]); }
  if (!rows.length) return toast('Grafikte iz yok');
  REP.items.push({type: 'table', title: 'Veri özeti (grafikteki kanallar)', head: ['Dosya', 'Kanal', 'Birim', 'Örnekleme (Hz)', 'Örnek sayısı', 'Süre (s)'], rows, note: ''}); repRefreshList(); toast('Veri özeti eklendi');
}
function repAddText() {
  const body = h('div', null, fr('Başlık', h('input', {type: 'text', id: 'rtT', style: 'width:100%'})), h('textarea', {id: 'rtB', rows: 8, style: 'width:100%', placeholder: 'Metin (boş satır = yeni paragraf)'}));
  modal('Rapora not / metin ekle', body, [{t: 'Ekle', primary: true, fn: () => { const t = sv('rtT').trim(), b = sv('rtB').trim(); if (!b) { toast('Metin boş'); return false; } REP.items.push({type: 'text', title: t, body: b}); repRefreshList(); }}, {t: 'Vazgeç'}]);
}
function repRefreshList() {
  const box = $('#repList'); if (!box) return; box.replaceChildren();
  if (!REP.items.length) box.append(h('div', {class: 'note'}, 'Rapor boş. Görünümü, tabloları veya notları ekleyin.'));
  REP.items.forEach((it, i) => {
    const kind = {fig: 'Şekil', table: 'Tablo', text: 'Metin'}[it.type];
    box.append(h('div', {class: 'repItem'}, h('span', {class: 'muted'}, (i + 1) + '. ' + kind),
      h('input', {type: 'text', value: it.title || '', placeholder: 'Başlık', oninput: e => it.title = e.target.value}),
      h('button', {title: 'Yukarı', onclick: () => { if (i) { [REP.items[i - 1], REP.items[i]] = [REP.items[i], REP.items[i - 1]]; repRefreshList(); } }}, '↑'),
      h('button', {title: 'Aşağı', onclick: () => { if (i < REP.items.length - 1) { [REP.items[i + 1], REP.items[i]] = [REP.items[i], REP.items[i + 1]]; repRefreshList(); } }}, '↓'),
      h('button', {title: 'Sil', onclick: () => { REP.items.splice(i, 1); repRefreshList(); }}, '×')));
    if (it.type === 'fig') box.append(h('input', {type: 'text', class: 'repNote', value: it.note || '', placeholder: 'Şekil altı açıklaması (isteğe bağlı)', oninput: e => it.note = e.target.value}));
  });
}
function buildReportCard() {
  return card('Rapor',
    h('div', {class: 'note'}, 'Grafikleri, tabloları ve notları ekleyip kapaklı, üst/alt bilgili A4 rapor üretir. PDF için açılan önizlemede “Yazdır → PDF olarak kaydet” seçilir.'),
    h('div', {class: 'btns'}, btn('Açık görünümü ekle', repAddView), btn('İstatistik tablosu', repAddStats), btn('Veri özeti', repAddInfo), btn('Not ekle', repAddText)),
    h('div', {id: 'repList'}),
    h('div', {class: 'btns'}, btn('Rapor bilgileri…', () => repMetaDialog()), btn('Raporu oluştur', () => repMetaDialog(true), 'primary'), btn('Listeyi temizle', () => { REP.items = []; repRefreshList(); })));
}

/* ---- rapor bilgileri iletişim kutusu (üretmeden önce sorulur) ---- */
function repMetaDialog(then) {
  const m = repMeta(); if (!m.date) m.date = repToday();
  const inp = (id, v, w) => h('input', {type: 'text', id, value: v || '', style: 'width:' + (w || '100%')});
  const body = h('div', null,
    card('Başlık bilgileri', fr('Rapor adı *', inp('rmT', m.title)), fr('Doküman no *', inp('rmD', m.docNo)), fr('Tarih *', inp('rmDt', m.date)), fr('Proje no', inp('rmP', m.project)), fr('Revizyon *', inp('rmR', m.rev)),
      fr('Gizlilik derecesi *', h('select', {id: 'rmC'}, REP.cls.map(c => h('option', {value: c, selected: c === m.cls}, c))), inp('rmC2', '', '100%')), h('div', {class: 'note'}, 'Listede olmayan bir gizlilik ifadesi için alttaki kutuya yazın (listeyi geçersiz kılar).'),
      fr('Kurum / firma', inp('rmO', m.org))),
    card('Kimlik', fr('Hazırlayan', inp('rmH', m.prep)), fr('Kontrol eden', inp('rmK', m.chk)), fr('Onaylayan', inp('rmA', m.appr))),
    card('Logo (isteğe bağlı)', h('div', {id: 'rmLogoBox'}, m.logo ? h('img', {src: m.logo, style: 'max-height:44px;max-width:160px'}) : h('span', {class: 'note'}, 'Logo seçilmedi')),
      h('div', {class: 'btns'}, h('input', {type: 'file', id: 'rmLogoIn', accept: 'image/png,image/jpeg,image/svg+xml', onchange: async e => { const f = e.target.files[0]; if (!f) return; const url = await new Promise(r => { const fr_ = new FileReader(); fr_.onload = () => r(fr_.result); fr_.readAsDataURL(f); }); REP.meta.logo = url; $('#rmLogoBox').replaceChildren(h('img', {src: url, style: 'max-height:44px;max-width:160px'})); }}), btn('Logoyu kaldır', () => { REP.meta.logo = ''; $('#rmLogoBox').replaceChildren(h('span', {class: 'note'}, 'Logo seçilmedi')); }))),
    card('Özet ve revizyon geçmişi', h('textarea', {id: 'rmS', rows: 4, style: 'width:100%', placeholder: 'Amaç / özet (kapaktan sonraki sayfada)'}, m.summary || ''),
      h('textarea', {id: 'rmV', rows: 3, style: 'width:100%', placeholder: 'Revizyon geçmişi: her satır "Rev | Tarih | Açıklama"'}, m.revs || '')));
  modal(then ? 'Rapor bilgileri' : 'Rapor bilgileri (kaydedilir)', body, [{t: then ? 'Önizle / Yazdır' : 'Kaydet', primary: true, fn: () => {
    Object.assign(m, {title: sv('rmT').trim(), docNo: sv('rmD').trim(), date: sv('rmDt').trim(), project: sv('rmP').trim(), rev: sv('rmR').trim(), cls: sv('rmC2').trim().toUpperCase() || sv('rmC'), org: sv('rmO').trim(), prep: sv('rmH').trim(), chk: sv('rmK').trim(), appr: sv('rmA').trim(), summary: sv('rmS').trim(), revs: sv('rmV').trim()});
    repSaveMeta();
    if (then) { const miss = [['title', 'Rapor adı'], ['docNo', 'Doküman no'], ['date', 'Tarih'], ['rev', 'Revizyon']].filter(([k]) => !m[k]).map(x => x[1]); if (miss.length) { toast('Zorunlu alan boş: ' + miss.join(', '), 5000); return false; } if (!REP.items.length) { toast('Rapora en az bir öğe ekleyin'); return false; } setTimeout(repPreview, 50); }
  }}, {t: 'Vazgeç'}]);
}

/* ---- sayfalama (A4, mm) ---- */
const RP = {W: 210, H: 297, hdr: 26, ftr: 14, mx: 15, bodyH: 297 - 26 - 14 - 8, bodyW: 180};
function repPaginate(m) {
  const pages = [], cur = {h: 0, html: []}; let figN = 0, tabN = 0; const toc = [];
  const flush = () => { if (cur.html.length) { pages.push(cur.html.join('')); cur.html = []; cur.h = 0; } };
  const place = (h, html) => { if (cur.h + h > RP.bodyH && cur.html.length) flush(); cur.html.push(html); cur.h += h; };
  const pageNo = () => pages.length + 3;   // kapak=1, içindekiler=2, içerik 3'ten
  for (const it of REP.items) {
    if (it.type === 'fig') {
      figN++; const w = RP.bodyW, hh = Math.min(w * it.ar, 150), ww = hh / it.ar, noteLines = it.note ? Math.ceil(it.note.length / 100) : 0, tot = hh + 18 + noteLines * 5;
      if (cur.h + tot > RP.bodyH && cur.html.length) flush(); toc.push([`Şekil ${figN} – ${it.title || ''}`, pageNo()]);
      place(tot, `<figure><img src="${it.url}" style="width:${ww.toFixed(1)}mm;height:${hh.toFixed(1)}mm"><figcaption><b>Şekil ${figN}</b> – ${repEsc(it.title)}${it.note ? '<div class="nt">' + repEsc(it.note) + '</div>' : ''}</figcaption></figure>`);
    } else if (it.type === 'table') {
      tabN++; const RH = 6.4, head = '<tr>' + it.head.map(x => `<th>${repEsc(x)}</th>`).join('') + '</tr>', cap = `<div class="cap"><b>Tablo ${tabN}</b> – ${repEsc(it.title)}</div>`;
      if (cur.h + 30 > RP.bodyH && cur.html.length) flush(); toc.push([`Tablo ${tabN} – ${it.title || ''}`, pageNo()]);
      let i = 0, first = true;
      while (i < it.rows.length) {
        const room = RP.bodyH - cur.h - (first ? 14 : 10) - RH; let take = Math.max(1, Math.floor(room / RH)); if (room < RH * 2 && cur.html.length) { flush(); continue; }
        const part = it.rows.slice(i, i + take), noteH = (i + take >= it.rows.length && it.note) ? 4 + Math.ceil(it.note.length / 120) * 4.5 : 0;
        const html = (first ? cap : `<div class="cap">Tablo ${tabN} (devam)</div>`) + `<table><thead>${head}</thead><tbody>${part.map(r => '<tr>' + r.map(x => `<td>${repEsc(x)}</td>`).join('') + '</tr>').join('')}</tbody></table>` + (noteH ? `<div class="nt">${repEsc(it.note)}</div>` : '');
        place((first ? 14 : 10) + RH * (part.length + 1) + noteH, html); i += take; first = false; if (i < it.rows.length) flush();
      }
    } else if (it.type === 'text') {
      const paras = it.body.split(/\n\s*\n/), lines = p => Math.max(1, Math.ceil(p.length / 95)) ;
      if (it.title) toc.push([it.title, pageNo()]);
      let pend = it.title ? `<h2>${repEsc(it.title)}</h2>` : '', ph = it.title ? 12 : 0;
      for (const p of paras) { const hh = lines(p) * 5.2 + 3; place(hh + ph, pend + `<p>${repEsc(p).replace(/\n/g, '<br>')}</p>`); pend = ''; ph = 0; }
    }
  }
  flush(); return {pages, toc};
}
function repHTML(m) {
  const {pages, toc} = repPaginate(m), N = pages.length + 2, cls = repEsc(m.cls), logo = m.logo ? `<img src="${m.logo}">` : '';
  const meta = [['Doküman no', m.docNo], ['Proje no', m.project], ['Revizyon', m.rev], ['Tarih', m.date]].filter(x => x[1]);
  const header = `<div class="hd"><div class="l">${logo}</div><div class="c">${repEsc(m.title)}</div><div class="r">${meta.map(([k, v]) => `<div><span>${k}:</span> <b>${repEsc(v)}</b></div>`).join('')}</div></div>`;
  const footer = n => `<div class="ft"><span class="fl">${repEsc(m.org)}</span><span class="fc">${cls}</span><span class="fr">Sayfa ${n} / ${N}</span></div>`;
  const css = `@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#8a8f98;font:10pt/1.45 "Segoe UI",Arial,sans-serif;color:#111}
.page{width:210mm;height:297mm;background:#fff;margin:6mm auto;position:relative;overflow:hidden;page-break-after:always;break-after:page}
@media print{html,body{background:#fff}.page{margin:0}}
.hd{position:absolute;left:15mm;right:15mm;top:8mm;height:${RP.hdr - 6}mm;border-bottom:.4mm solid #111;display:grid;grid-template-columns:48mm 1fr 52mm;align-items:center;gap:4mm;padding-bottom:2mm}
.hd .l img{max-height:15mm;max-width:46mm}.hd .c{text-align:center;font-weight:700;font-size:12pt}.hd .r{font-size:7.5pt;line-height:1.35;text-align:right}.hd .r span{color:#444}
.ft{position:absolute;left:15mm;right:15mm;bottom:7mm;height:7mm;border-top:.3mm solid #111;display:grid;grid-template-columns:1fr auto 1fr;align-items:end;font-size:8pt}.ft .fc{font-weight:700;letter-spacing:.06em}.ft .fr{text-align:right}
.bd{position:absolute;left:15mm;right:15mm;top:${RP.hdr + 4}mm;bottom:${RP.ftr + 3}mm}
figure{margin:0 0 6mm;text-align:center}figure img{display:block;margin:0 auto;border:.2mm solid #bbb}figcaption{font-size:9pt;margin-top:1.5mm;text-align:center}.nt{font-size:8.5pt;color:#333;margin-top:1mm;text-align:left}
.cap{font-size:9pt;margin:2mm 0 1.5mm}table{border-collapse:collapse;width:100%;font-size:8pt;margin-bottom:2mm}th,td{border:.2mm solid #666;padding:1mm 1.6mm;text-align:left;height:6.4mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:60mm}th{background:#e5e8ee}
h2{font-size:12pt;margin:0 0 3mm}h3{font-size:11pt;margin:5mm 0 2mm}p{margin:0 0 3mm;text-align:justify}
.cover{padding:0}.cover .band{position:absolute;left:0;right:0;text-align:center;font-weight:700;letter-spacing:.12em;font-size:11pt;padding:3mm;border-top:.5mm solid #111;border-bottom:.5mm solid #111}
.cover .lg{position:absolute;top:24mm;left:20mm}.cover .lg img{max-height:28mm;max-width:70mm}.cover .org{position:absolute;top:26mm;right:20mm;font-size:11pt;text-align:right;max-width:90mm}
.cover .tt{position:absolute;left:20mm;right:20mm;top:100mm;text-align:center}.cover .tt h1{font-size:26pt;line-height:1.2;margin:0 0 6mm}.cover .tt .sub{font-size:13pt;color:#333}
.cover table.meta{position:absolute;left:35mm;top:155mm;width:140mm;font-size:10.5pt}.cover table.meta td{height:9mm;white-space:normal;max-width:none}.cover table.meta td:first-child{width:45mm;background:#eef0f4;font-weight:700}
.cover table.sig{position:absolute;left:20mm;bottom:40mm;width:170mm;font-size:9.5pt}.cover table.sig td,.cover table.sig th{height:12mm;text-align:center;white-space:normal}
.toc div{display:flex;gap:2mm;font-size:10pt;padding:.8mm 0}.toc i{flex:1;border-bottom:.2mm dotted #777;transform:translateY(-1.5mm)}`;
  const cover = `<section class="page cover"><div class="band" style="top:12mm">${cls}</div><div class="lg">${logo}</div><div class="org">${repEsc(m.org)}</div>
<div class="tt"><h1>${repEsc(m.title)}</h1></div><table class="meta">${[['Doküman no', m.docNo], ['Proje no', m.project], ['Revizyon', m.rev], ['Tarih', m.date], ['Gizlilik derecesi', m.cls]].filter(x => x[1]).map(([k, v]) => `<tr><td>${k}</td><td>${repEsc(v)}</td></tr>`).join('')}</table>
<table class="sig"><thead><tr><th>Hazırlayan</th><th>Kontrol eden</th><th>Onaylayan</th></tr></thead><tbody><tr><td>${repEsc(m.prep)}</td><td>${repEsc(m.chk)}</td><td>${repEsc(m.appr)}</td></tr></tbody></table><div class="band" style="bottom:12mm">${cls}</div></section>`;
  const revRows = (m.revs || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|').map(x => x.trim()));
  const sum = `<section class="page">${header}<div class="bd">${m.summary ? `<h2>Özet</h2>${m.summary.split(/\n\s*\n/).map(p => `<p>${repEsc(p).replace(/\n/g, '<br>')}</p>`).join('')}` : ''}
${revRows.length ? `<h3>Revizyon geçmişi</h3><table><thead><tr><th>Rev</th><th>Tarih</th><th>Açıklama</th></tr></thead><tbody>${revRows.map(r => `<tr><td>${repEsc(r[0] || '')}</td><td>${repEsc(r[1] || '')}</td><td style="white-space:normal">${repEsc(r.slice(2).join(' | '))}</td></tr>`).join('')}</tbody></table>` : ''}
<h3>İçindekiler</h3><div class="toc">${toc.map(([t, n]) => `<div><span>${repEsc(t)}</span><i></i><span>${n}</span></div>`).join('')}</div></div>${footer(2)}</section>`;
  const body = pages.map((p, i) => `<section class="page">${header}<div class="bd">${p}</div>${footer(i + 3)}</section>`).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${repEsc(m.title)} - ${repEsc(m.docNo)}</title><style>${css}</style></head><body>${cover}${sum}${body}</body></html>`;
}
function repPreview() {
  const m = repMeta(), html = repHTML(m), old = $('#repPrev'); if (old) old.remove();
  const fr_ = h('iframe', {style: 'flex:1;border:0;background:#8a8f98', srcdoc: html});
  const close = () => $('#repPrev').remove();
  const bar = h('div', {class: 'repBar'}, h('b', null, 'Rapor önizleme'), h('span', {class: 'muted'}, 'PDF için: Yazdır → Hedef: PDF olarak kaydet (kenar boşluğu: yok, arka plan grafikleri: açık)'), h('div', {class: 'spacer', style: 'flex:1'}),
    btn('Yazdır / PDF', () => { try { fr_.contentWindow.focus(); fr_.contentWindow.print(); } catch (e) { toast('Yazdırma açılamadı: ' + e.message); } }, 'primary'),
    btn('Word (.docx) kaydet', repDocxSave),
    btn('HTML kaydet', () => saveBlob(new Blob([html], {type: 'text/html'}), sanitizeName(m.docNo || m.title || 'rapor') + '_' + sanitizeName(m.rev || 'A') + '.html')), btn('Kapat', close));
  document.body.append(h('div', {id: 'repPrev'}, bar, fr_));
}
