/* ===== MATLAB alt kümesi — 4: grafik nesneleri (GUIDE arayüzleri), dosya G/Ç, iletişim kutuları, eval ===== */
(function (ML) {
  'use strict';
  const {M, num, bool, zeros, rowv, colv, str, empty, toStr, cell, isCell, isSA, isFH, isTrue, classOf, sizeOf, E} = ML;
  const B = ML.builtins, FA = ML.figApi;
  const S = v => toStr(v);
  const isGH = v => v && v.gh === true;
  const isChar = v => v instanceof M && v.t === 'c';
  const CLS = {figure: 'matlab.ui.Figure', uicontrol: 'matlab.ui.control.UIControl', axes: 'matlab.graphics.axis.Axes', uipanel: 'matlab.ui.container.Panel', uibuttongroup: 'matlab.ui.container.ButtonGroup', uitable: 'matlab.ui.control.Table', root: 'matlab.ui.Root'};

  /* ---------- nesne deposu ---------- */
  function G(it) {
    if (!it.G) { it.G = {objs: new Map(), seq: 100, cbo: null, cbf: null, data: new Map(), ver: 1}; it.G.objs.set(0, {id: 0, type: 'root', parent: -1, children: [], props: Object.assign(Object.create(null), {defaultUicontrolBackgroundColor: rowv([0.94, 0.94, 0.94]), defaultFigureColor: rowv([0.94, 0.94, 0.94]), ScreenSize: rowv([1, 1, 1920, 1080]), ScreenPixelsPerInch: num(96), Units: str('pixels'), MonitorPositions: rowv([1, 1, 1920, 1080]), ShowHiddenHandles: str('off')})}); }
    return it.G;
  }
  const gh = (it, id) => { const o = G(it).objs.get(id); return {gh: true, id, cls: CLS[o ? o.type : 'uicontrol'] || 'matlab.graphics.Graphics'}; };
  ML.isGH = isGH;
  function objOf(it, v, what) {
    let id; if (isGH(v)) id = v.id; else if (v instanceof M && v.re.length === 1) id = v.re[0]; else E('MATLAB:hg:InvalidHandle', (what || 'Tutamaç') + ' geçerli bir grafik nesnesi olmalı.');
    const o = G(it).objs.get(id); if (!o || o.deleted) E('MATLAB:hg:InvalidHandle', 'Geçersiz ya da silinmiş grafik nesnesi tutamacı.'); return o;
  }
  const DEF = {
    uicontrol: () => ({Style: str('pushbutton'), String: str(''), Value: num(0), Min: num(0), Max: num(1), Enable: str('on'), Visible: str('on'), Tag: str(''), UserData: empty(), Units: str('pixels'), Position: rowv([20, 20, 60, 20]), BackgroundColor: rowv([0.94, 0.94, 0.94]), ForegroundColor: rowv([0, 0, 0]), FontSize: num(8), FontWeight: str('normal'), HorizontalAlignment: str('center'), TooltipString: str(''), Callback: empty(), ListboxTop: num(1)}),
    figure: () => ({Name: str(''), Tag: str(''), Units: str('pixels'), Position: rowv([100, 100, 560, 420]), Color: rowv([0.94, 0.94, 0.94]), UserData: empty(), Visible: str('on'), NumberTitle: str('on'), CloseRequestFcn: empty()}),
    axes: () => ({Tag: str(''), Units: str('normalized'), Position: rowv([0.13, 0.11, 0.775, 0.815]), UserData: empty(), Visible: str('on'), NextPlot: str('replace')}),
    uipanel: () => ({Title: str(''), Tag: str(''), Units: str('normalized'), Position: rowv([0, 0, 1, 1]), BackgroundColor: rowv([0.94, 0.94, 0.94]), UserData: empty(), Visible: str('on'), FontSize: num(8)}),
    uitable: () => ({Data: cell(0, 0, []), ColumnName: str('numbered'), RowName: str('numbered'), ColumnEditable: bool(false), Tag: str(''), Units: str('normalized'), Position: rowv([0, 0, 1, 1]), UserData: empty(), Visible: str('on'), FontSize: num(8), Enable: str('on')}),
  };
  DEF.uibuttongroup = () => Object.assign(DEF.uipanel(), {SelectedObject: empty(), SelectionChangedFcn: empty(), SelectionChangeFcn: empty()});
  function mkObj(it, type, parentId, props, id) {
    const g = G(it); if (id == null) { id = ++g.seq + 0.0001 * 0; while (g.objs.has(id)) id = ++g.seq; }
    const o = {id, type, parent: parentId, children: [], props: Object.assign(Object.create(null), (DEF[type] || (() => ({Tag: str(''), UserData: empty()})))(), props || {}), ver: 1};
    g.objs.set(id, o); const p = g.objs.get(parentId); if (p) p.children.push(id); g.ver++;
    return o;
  }
  function figOf(it, o) { const g = G(it); while (o && o.type !== 'figure') o = g.objs.get(o.parent); return o; }
  function descendants(it, o, out) { const g = G(it); out = out || []; for (const c of o.children) { const k = g.objs.get(c); if (k && !k.deleted) { out.push(k); descendants(it, k, out); } } return out; }
  function propKey(o, name) { const n = String(name).toLowerCase(); for (const k in o.props) if (k.toLowerCase() === n) return k; const alias = {string: 'String', value: 'Value', title: 'Title', data: 'Data'}; return alias[n] || null; }
  // MATLAB'daki gibi 'figure' nesnesi için mlab3 figür modeli eşlenir
  function ensureFigModel(it, o) { const f = FA.newFig.call(null, it, o.id); it.curFig = o.id; f.gobj = o.id; return f; }
  function figModelOf(it, figObj) { if (!it.figs) it.figs = new Map(); let f = it.figs.get(figObj.id); if (!f) { const keep = it.curFig; f = FA.newFig(it, figObj.id); it.curFig = keep || figObj.id; f.gobj = figObj.id; } return f; }
  function axModel(it, axObj) {
    const fo = figOf(it, axObj), f = figModelOf(it, fo);
    let a = f.axes.find(x => x.oid === axObj.id);
    if (!a) { a = {r: 1, c: 1, p: f.axes.length + 1, oid: axObj.id, traces: [], xlabel: '', ylabel: '', title: '', xlim: null, ylim: null, grid: false, legend: null, xscale: 'linear', yscale: 'linear', hold: false, ci: 0, ver: 1}; f.axes.push(a); }
    return a;
  }
  ML.ghGet = function (it, h, name) {
    const o = objOf(it, h); const k = propKey(o, name);
    if (o.type === 'axes' && /^(xlim|ylim)$/i.test(name)) { const a = axModel(it, o); const v = name.toLowerCase() === 'xlim' ? a.xlim : a.ylim; return v ? rowv(v) : rowv([0, 1]); }
    if (/^children$/i.test(name)) return colv(o.children.slice().reverse()).re.length ? (() => { const c = o.children.filter(i => !G(it).objs.get(i).deleted).reverse(); return c.length === 1 ? gh(it, c[0]) : colv(c); })() : empty();
    if (/^parent$/i.test(name)) return o.parent > 0 ? gh(it, o.parent) : num(0);
    if (/^type$/i.test(name)) return str(o.type);
    if (/^selectedobject$/i.test(name) && o.type === 'uibuttongroup') { const sel = descendants(it, o).find(k => k.type === 'uicontrol' && /^(radiobutton|togglebutton)$/.test(S(k.props.Style)) && isTrue(k.props.Value)); return sel ? gh(it, sel.id) : empty(); }
    if (!k) E('MATLAB:hg:InvalidProperty', `'${name}' özelliği ${o.type} nesnesinde yok ya da desteklenmiyor.`);
    return o.props[k];
  };
  ML.ghSet = function (it, h, name, v) {
    const o = objOf(it, h); let k = propKey(o, name) || String(name);
    if (o.type === 'axes' && /^(xlim|ylim)$/i.test(name)) { const a = axModel(it, o); a[name.toLowerCase()] = v instanceof M && v.re.length === 2 ? [v.re[0], v.re[1]] : null; a.ver++; return; }
    if (/^(parent|type|children)$/i.test(name)) return;
    if (v && v._o !== undefined) v._o = null;
    if (k === 'Value' && o.type === 'uicontrol' && /^(radiobutton|togglebutton)$/.test(S(o.props.Style)) && isTrue(v)) { const p = G(it).objs.get(o.parent); if (p && p.type === 'uibuttongroup') for (const s of descendants(it, p)) if (s !== o && s.type === 'uicontrol' && /^(radiobutton|togglebutton)$/.test(S(s.props.Style))) { s.props.Value = num(0); s.ver++; } }
    o.props[k] = v; o.ver++; G(it).ver++;
  };
  function setPairs(it, o, a) { for (let i = 0; i + 1 < a.length; i += 2) { if (!isChar(a[i])) E('MATLAB:set', 'Özellik adı metin olmalı.'); ML.ghSet(it, gh(it, o.id), S(a[i]), a[i + 1]); } }
  function handlesArg(it, v) { if (isGH(v)) return [objOf(it, v)]; if (v instanceof M) return Array.from(v.re, id => objOf(it, num(id))); E('MATLAB:hg:InvalidHandle', 'Grafik nesnesi tutamacı bekleniyordu.'); }

  /* ---------- .fig'den nesne ağacı kurma ---------- */
  function treeStr(t) { if (!t) return null; if (t.k === 'num' && t.cls === 'c') { const r = t.dims[0] || 0, c = t.dims[1] || 0; if (r <= 1) return str(String.fromCharCode(...Array.from(t.re))); const v = []; for (let i = 0; i < r; i++) { let s = ''; for (let j = 0; j < c; j++) s += String.fromCharCode(t.re[i + j * r]); v.push(str(s.replace(/\s+$/, ''))); } return {cell: true, r, c: 1, v}; } if (t.k === 'cell') return {cell: true, r: t.v.length, c: 1, v: t.v.map(x => treeStr(x) || str(''))}; return null; }
  function treeVal(t) { if (!t) return null; if (t.k === 'num') { if (t.cls === 'c') return treeStr(t); const m = new M(1, 1, Float64Array.from(t.re), null, t.cls); ML.setDims(m, t.dims.length ? t.dims : [0, 0]); return m; } if (t.k === 'cell') return {cell: true, r: t.dims[0] || 0, c: (t.dims[1] || 0), v: t.v.map(x => treeVal(x) || empty())}; return null; }
  const FIGPROPS = {figure: ['Name', 'Tag', 'Units', 'Position', 'Color', 'Visible'], uicontrol: ['Style', 'String', 'Value', 'Min', 'Max', 'Enable', 'Visible', 'Tag', 'Units', 'Position', 'BackgroundColor', 'ForegroundColor', 'FontSize', 'FontWeight', 'HorizontalAlignment', 'TooltipString', 'ListboxTop', 'UserData'], axes: ['Tag', 'Units', 'Position', 'Visible'], uipanel: ['Title', 'Tag', 'Units', 'Position', 'BackgroundColor', 'Visible', 'FontSize'], uibuttongroup: ['Title', 'Tag', 'Units', 'Position', 'BackgroundColor', 'Visible', 'FontSize'], uitable: ['Data', 'ColumnName', 'RowName', 'ColumnEditable', 'Tag', 'Units', 'Position', 'Visible', 'FontSize']};
  function buildFromTree(it, node, parentId, guiName) {
    const f = node.v ? node.v[0] : node; const type = S(treeStr(f.type) || str('')); const pt = f.properties && f.properties.v && f.properties.v[0]; const props = {};
    const allow = FIGPROPS[type];
    if (!allow) return null;   // scribe, toolbar, menü vb. atlanır
    if (pt) for (const k of allow) if (pt[k]) { const v = treeVal(pt[k]); if (v != null) props[k] = v; }
    if (type === 'uicontrol' && !props.Style) props.Style = str('pushbutton');
    if (type === 'uicontrol' && props.Style && /popupmenu|listbox/.test(S(props.Style)) && props.Value && props.Value.re.length === 0) props.Value = num(1);
    const o = mkObj(it, type, parentId, props, type === 'figure' ? nextFigId(it) : null);
    if (type === 'figure') { o.guiName = guiName; o.guide = true; }
    if (type === 'axes') axModel(it, o);
    const kids = !f.children ? [] : f.children.k === 'struct' ? f.children.v.map(v => ({v: [v]})) : f.children.k === 'cell' ? f.children.v.filter(x => x.k === 'struct').flatMap(x => x.v.map(v => ({v: [v]}))) : [];
    // MATLAB çocukları ters sırada saklar (en son eklenen önce)
    for (const k of kids.slice().reverse()) buildFromTree(it, k, o.id, guiName);
    return o;
  }
  function nextFigId(it) { let id = 1; const g = G(it); while (g.objs.has(id) || (it.figs && it.figs.has(id))) id++; return id; }
  function guihandles(it, figObj) { const o = Object.create(null); for (const k of [figObj, ...descendants(it, figObj)]) { const t = S(k.props.Tag || str('')); if (t && /^[A-Za-z]\w*$/.test(t) && !(t in o)) o[t] = gh(it, k.id); } return {sa: true, r: 1, c: 1, v: [o]}; }
  ML.guiOpen = function (it, name, args) {   // GUIDE düzeni + açılış işlevleri
    const tree = it.ctx.figLayout && it.ctx.figLayout(name);
    if (!tree) E('MATLAB:guide:noFig', `'${name}.fig' bulunamadı. Arayüz düzen dosyasını (.fig) da Kod sekmesinde açın.`);
    return buildFromTree(it, tree, 0, name);
  };
  B.gui_mainfcn = function (a, no, sc) {
    const st = a[0]; if (!isSA(st)) E('MATLAB:gui_mainfcn', 'gui_mainfcn: gui_State yapısı bekleniyordu.');
    const s = st.v[0], rest = a.slice(1), cbk = s.gui_Callback;
    if (cbk && !(cbk instanceof M && cbk.re.length === 0)) return this.callFunctionValue(cbk, rest.slice(1), no);
    const name = S(s.gui_Name);
    const g = G(this); let fo = [...g.objs.values()].find(o => o.type === 'figure' && !o.deleted && o.guiName === name);
    const single = s.gui_Singleton && isTrue(s.gui_Singleton);
    if (!fo || !single) {
      fo = ML.guiOpen(this, name, rest);
      this.ctx.notify && this.ctx.notify('guiopen', {id: fo.id, name});
      const hs = guihandles(this, fo); g.data.set(fo.id, hs); this.curFig = fo.id; const fmod = ensureFigModel(this, fo); const ax1 = descendants(this, fo).find(k => k.type === 'axes'); if (ax1) fmod.cur = axModel(this, ax1);
      // CreateFcn'ler (GUIDE: Tag_CreateFcn)
      for (const k of descendants(this, fo)) { const t = S(k.props.Tag || str('')); if (t && this.funcs.has(t + '_CreateFcn')) { try { this.callNamed(t + '_CreateFcn', [gh(this, k.id), empty(), empty()], 0, this.cur, this.base); } catch (e) { if (!(e instanceof ML.MLError)) throw e; this.out(`Uyarı: ${t}_CreateFcn: ${e.message}\n`, 'warn'); } } }
      if (s.gui_OpeningFcn && isFH(s.gui_OpeningFcn)) { const prev = g.cbf; g.cbf = fo.id; try { this.callFunctionValue(s.gui_OpeningFcn, [gh(this, fo.id), empty(), g.data.get(fo.id), ...rest], 0); } finally { g.cbf = prev; } }
    }
    if (s.gui_OutputFcn && isFH(s.gui_OutputFcn)) { const r = this.callFunctionValue(s.gui_OutputFcn, [gh(this, fo.id), empty(), g.data.get(fo.id) || empty()], Math.max(no, 1)); return no ? r : []; }
    return no ? [gh(this, fo.id)] : [];
  };
  // arayüz olayı: nesnenin geri çağırma işlevi
  ML.guiCallback = function (it, id, kind) {
    const g = G(it), o = g.objs.get(id); if (!o || o.deleted) return;
    let fo = figOf(it, o), prop = kind || 'Callback', target = o;
    if (prop === 'SelectionChangedFcn') { const p = G(it).objs.get(o.parent); if (p && p.type === 'uibuttongroup') { target = p; } }
    let cb = target.props[prop] && !(target.props[prop] instanceof M && target.props[prop].re.length === 0) ? target.props[prop] : (prop === 'SelectionChangedFcn' ? target.props.SelectionChangeFcn : undefined);
    const prevO = g.cbo, prevF = g.cbf; g.cbo = id; g.cbf = fo ? fo.id : null; if (fo) it.curFig = fo.id;
    try {
      if (cb && !(cb instanceof M && cb.re.length === 0)) {
        if (isFH(cb)) return it.callFunctionValue(cb, [gh(it, id), empty()], 0);
        if (isCell(cb)) return it.callFunctionValue(cb.v[0], [gh(it, id), empty(), ...cb.v.slice(1)], 0);
        if (isChar(cb)) return ML.evalString(it, S(cb), it.base);
      }
      const t = S(target.props.Tag || str('')), main = fo && fo.guiName;
      if (main && t) {
        const fn = t + '_' + (prop === 'SelectionChangedFcn' ? 'SelectionChangedFcn' : prop);
        if (!it.funcs.has(fn)) { if (prop === 'Callback' && o.type === 'uicontrol' && /pushbutton|togglebutton|popupmenu|listbox|edit|checkbox|radiobutton|slider/.test(S(o.props.Style))) it.out(`(${fn} işlevi ${main}.m içinde bulunamadı)\n`, 'warn'); return; }
        if (it.funcs.has(main)) return it.callNamed(main, [str(fn), gh(it, id), empty(), g.data.get(fo.id) || empty()], 0, 0, it.base);
        return it.callNamed(fn, [gh(it, id), empty(), g.data.get(fo.id) || empty()], 0, 0, it.base);
      }
    } finally { g.cbo = prevO; g.cbf = prevF; }
  };
  // ana iş parçacığından gelen değer güncellemesi (kullanıcı arayüzde değiştirdi)
  ML.guiSetFromUI = function (it, id, props) {
    const o = G(it).objs.get(id); if (!o) return;
    for (const k in props) { const v = props[k]; let mv; if (k === 'String') mv = Array.isArray(v) ? {cell: true, r: v.length, c: 1, v: v.map(str)} : str(v); else if (k === 'Value') mv = v.length === 1 ? num(v[0]) : rowv(v); else if (k === 'Data') mv = fromPlainTable(v); else continue; o.props[k] = mv; o.ver++; }
    G(it).ver++;
  };
  function fromPlainTable(rows) { const R = rows.length, C = R ? rows[0].length : 0; const allNum = rows.every(r => r.every(x => typeof x === 'number')); if (allNum) { const m = zeros(R, C); rows.forEach((r, i) => r.forEach((x, j) => { m.re[i + j * R] = x; })); return m; } const v = new Array(R * C); rows.forEach((r, i) => r.forEach((x, j) => { v[i + j * R] = typeof x === 'number' ? num(x) : typeof x === 'boolean' ? bool(x) : str(x == null ? '' : x); })); return {cell: true, r: R, c: C, v}; }
  /* ---------- anlık görüntü (ana iş parçacığına) ---------- */
  const plainStr = v => { if (v == null) return ''; if (isChar(v)) { if (v.r <= 1) return S(v); const out = []; for (let i = 0; i < v.r; i++) out.push(ML.rowStr(v, i).replace(/\s+$/, '')); return out; } if (isCell(v)) return v.v.map(x => isChar(x) ? S(x) : x instanceof M && x.re.length ? ML.fmtNumShort(x.re[0]) : ''); if (v instanceof M) return v.re.length === 1 ? ML.fmtNumShort(v.re[0]) : Array.from(v.re, x => ML.fmtNumShort(x)); return ''; };
  const plainNum = v => v instanceof M ? Array.from(v.re) : [];
  function plainData(v) { if (v instanceof M) { const r = []; for (let i = 0; i < v.r; i++) { const row = []; for (let j = 0; j < v.c; j++) row.push(v.re[i + j * v.r]); r.push(row); } return r; } if (isCell(v)) { const r = []; for (let i = 0; i < v.r; i++) { const row = []; for (let j = 0; j < v.c; j++) { const x = v.v[i + j * v.r]; row.push(isChar(x) ? S(x) : x instanceof M && x.t === 'l' ? !!x.re[0] : x instanceof M && x.re.length ? x.re[0] : ''); } r.push(row); } return r; } return []; }
  ML.guiSnapshot = function (it, full) {
    const g = it.G; if (!g) return null; const figs = [];
    for (const fo of g.objs.values()) {
      if (fo.type !== 'figure' || fo.deleted) continue;
      const desc = descendants(it, fo); if (!fo.guide && !desc.some(o => o.type !== 'axes')) continue;
      const objs = [fo, ...desc].map(o => { const p = o.props, q = {}; for (const k in p) { const v = p[k]; if (k === 'UserData' || /Fcn$|Callback$/.test(k)) continue; if (k === 'Data') q[k] = plainData(v); else if (/^(String|Title|Name|Tag|Style|Enable|Visible|Units|FontWeight|HorizontalAlignment|TooltipString)$/.test(k)) q[k] = plainStr(v); else if (/^(ColumnName|RowName)$/.test(k)) q[k] = isChar(v) && S(v) === 'numbered' ? 'numbered' : plainStr(v); else if (v instanceof M) q[k] = plainNum(v); } return {id: o.id, type: o.type, parent: o.parent, props: q, children: o.children.filter(c => !g.objs.get(c).deleted)}; });
      const fm = it.figs && it.figs.get(fo.id), axes = [];
      if (fm) for (const a of fm.axes) if (a.oid != null) { const sendTr = full || a.sentVer !== a.ver; a.sentVer = a.ver; axes.push({oid: a.oid, ver: a.ver, title: a.title, xlabel: a.xlabel, ylabel: a.ylabel, xlim: a.xlim, ylim: a.ylim, grid: a.grid, legend: a.legend, xscale: a.xscale, yscale: a.yscale, traces: sendTr ? a.traces.map(t => ({x: t.x, y: t.y, name: t.name, color: t.color, dash: t.dash, marker: t.marker, noLine: t.noLine, lw: t.lw, kind: t.kind})) : null}); }
      figs.push({id: fo.id, name: S(fo.props.Name || str('')) || fo.guiName || ('Figür ' + fo.id), guiName: fo.guiName || '', objs, axes});
    }
    return figs;
  };
  ML.guiFigIds = it => it.figs ? [...it.figs.keys()].filter(id => { const o = it.G && it.G.objs.get(id); return o && !o.deleted && (o.guide || descendants(it, o).some(k => k.type !== 'axes')); }) : [];

  /* ---------- grafik işlevleri ---------- */
  const origFigure = B.figure;
  B.figure = function (a, no) {
    const g = G(this); let id = null, props = a;
    if (a.length && !isChar(a[0])) { const o0 = a[0]; id = isGH(o0) ? o0.id : Math.floor(o0.re[0]); props = a.slice(1); }
    let o = id != null ? g.objs.get(id) : null;
    if (!o || o.deleted) { o = mkObj(this, 'figure', 0, {}, id != null ? id : nextFigId(this)); }
    origFigure.call(this, [num(o.id)], 0);
    setPairs(this, o, props); if (this.figs.get(o.id)) this.figs.get(o.id).gobj = o.id;
    return no ? gh(this, o.id) : undefined;
  };
  B.gcf = function () { const g = G(this); let id = this.curFig; if (!id || !g.objs.get(id) || g.objs.get(id).deleted) { const o = mkObj(this, 'figure', 0, {}, nextFigId(this)); origFigure.call(this, [num(o.id)], 0); id = o.id; } return gh(this, id); };
  B.gcbo = function () { const g = G(this); return g.cbo != null ? gh(this, g.cbo) : empty(); };
  B.gcbf = function () { const g = G(this); return g.cbf != null ? gh(this, g.cbf) : empty(); };
  B.groot = () => num(0);
  function parentFrom(it, a) { for (let i = 0; i + 1 < a.length; i += 2) if (isChar(a[i]) && S(a[i]).toLowerCase() === 'parent') return objOf(it, a[i + 1]); return null; }
  function creator(type) {
    return function (a, no) {
      let rest = a, par = null;
      if (a.length && (isGH(a[0]) || (a[0] instanceof M && !isChar(a[0]) && a.length % 2 === 1))) { par = objOf(this, a[0]); rest = a.slice(1); }
      par = parentFrom(this, rest) || par || objOf(this, B.gcf.call(this, []));
      const o = mkObj(this, type, par.id, {});
      setPairs(this, o, rest.filter((x, i, arr) => !(isChar(arr[i - (i % 2)]) && S(arr[i - (i % 2)]).toLowerCase() === 'parent')));
      if (type === 'axes') { const f = figModelOf(this, figOf(this, o)); f.cur = axModel(this, o); }
      return gh(this, o.id);
    };
  }
  B.uicontrol = creator('uicontrol'); B.uipanel = creator('uipanel'); B.uibuttongroup = creator('uibuttongroup'); B.uitable = creator('uitable');
  B.uimenu = (a, no) => no ? num(0) : undefined; B.uitoolbar = B.uipushtool = B.uitoggletool = B.uicontextmenu = B.uimenu;
  const origAxes = FA.axes;
  B.axes = function (a, no) {
    if (a.length === 1 && (isGH(a[0]) || (a[0] instanceof M && !isChar(a[0])))) { const o = objOf(this, a[0]); if (o.type !== 'axes') E('MATLAB:axes', 'axes(h): h bir eksen olmalı.'); const fo = figOf(this, o), f = figModelOf(this, fo); this.curFig = fo.id; f.cur = axModel(this, o); return no ? gh(this, o.id) : undefined; }
    return creator('axes').call(this, a, no);
  };
  B.gca = function () { const f = FA.fig(this); const cur = f && f.cur; if (cur && cur.oid != null) return gh(this, cur.oid); const g = G(this); let fo = g.objs.get(this.curFig); if (!fo) { B.gcf.call(this, []); fo = g.objs.get(this.curFig); } const o = mkObj(this, 'axes', fo.id, {}); const a = axModel(this, o); f.cur = a; return gh(this, o.id); };
  // eksen tutamacıyla başlayan çizim çağrıları + sürüm sayacı
  for (const n of ['plot', 'semilogx', 'semilogy', 'loglog', 'stem', 'scatter', 'bar', 'hist', 'histogram', 'cla', 'hold', 'xlabel', 'ylabel', 'title', 'legend', 'grid', 'xlim', 'ylim', 'axis']) {
    const orig = B[n]; if (!orig) continue;
    B[n] = function (a, no, sc) {
      let restore = null;
      if (a.length && isGH(a[0])) { const o = objOf(this, a[0]); if (o.type === 'axes') { const fo = figOf(this, o), f = figModelOf(this, fo); restore = [this.curFig, f.cur, f]; this.curFig = fo.id; f.cur = axModel(this, o); a = a.slice(1); } }
      try { const r = orig.call(this, a, no, sc); const f = this.figs && this.figs.get(this.curFig); if (f && f.cur) f.cur.ver = (f.cur.ver || 0) + 1; return r; }
      finally { if (restore) { /* MATLAB: eksen argümanı geçerli ekseni değiştirmez */ } }
    };
  }
  B.get = function (a, no) {
    const os = handlesArg(this, a[0]);
    if (a.length === 1) { const o = os[0], q = Object.create(null); for (const k in o.props) q[k] = o.props[k]; q.Type = str(o.type); return {sa: true, r: 1, c: 1, v: [q]}; }
    const nm = S(a[1]); if (os.length === 1) return ML.ghGet(this, gh(this, os[0].id), nm);
    return {cell: true, r: os.length, c: 1, v: os.map(o => ML.ghGet(this, gh(this, o.id), nm))};
  };
  B.set = function (a) { const os = handlesArg(this, a[0]); for (const o of os) { if (a.length === 2 && isSA(a[1])) { for (const k in a[1].v[0]) ML.ghSet(this, gh(this, o.id), k, a[1].v[0][k]); } else setPairs(this, o, a.slice(1)); } };
  B.findobj = B.findall = function (a) {
    let roots, rest = a; if (a.length && (isGH(a[0]) || (a[0] instanceof M && !isChar(a[0])))) { roots = handlesArg(this, a[0]); rest = a.slice(1); } else roots = [G(this).objs.get(0)];
    let list = []; for (const r of roots) list.push(r, ...descendants(this, r)); list = list.filter(o => o.id !== 0 && !o.deleted);
    for (let i = 0; i + 1 < rest.length; i += 2) { const k = S(rest[i]), v = rest[i + 1]; if (k.startsWith('-')) continue; list = list.filter(o => { if (k.toLowerCase() === 'type') return o.type === S(v); const pk = propKey(o, k); if (!pk) return false; const pv = o.props[pk]; return isChar(v) ? isChar(pv) && S(pv) === S(v) : v instanceof M && pv instanceof M && pv.re.length === v.re.length && pv.re.every((x, j) => x === v.re[j]); }); }
    if (list.length === 1) return gh(this, list[0].id); return list.length ? colv(list.map(o => o.id)) : zeros(0, 1);
  };
  B.guidata = function (a, no) {
    const o = objOf(this, a[0]), fo = figOf(this, o); if (!fo) E('MATLAB:guidata', 'guidata: nesne bir figüre bağlı değil.');
    const g = G(this); if (a.length >= 2) { const v = a[1]; if (v && v._o !== undefined) v._o = null; g.data.set(fo.id, v); return; }
    return g.data.has(fo.id) ? g.data.get(fo.id) : empty();
  };
  B.guihandles = function (a) { const fo = figOf(this, objOf(this, a.length ? a[0] : B.gcf.call(this, []))); return guihandles(this, fo); };
  B.ancestor = function (a) { let o = objOf(this, a[0]); const t = S(a[1]); const g = G(this); while (o && o.type !== t) o = g.objs.get(o.parent); return o ? gh(this, o.id) : empty(); };
  B.ishandle = B.isgraphics = B.isvalid = function (a) { const v = a[0]; if (isGH(v)) { const o = G(this).objs.get(v.id); return bool(!!o && !o.deleted); } if (v instanceof M) { const r = zeros(v.r, v.c, 'l'); for (let i = 0; i < v.re.length; i++) { const o = G(this).objs.get(v.re[i]); r.re[i] = o && !o.deleted ? 1 : 0; } return r; } return bool(false); };
  const origClose = B.close;
  function delObj(it, o) { o.deleted = true; for (const k of descendants(it, o)) k.deleted = true; G(it).ver++; if (o.type === 'figure') { if (it.figs) it.figs.delete(o.id); if (it.curFig === o.id) it.curFig = it.figs && it.figs.size ? [...it.figs.keys()].pop() : 0; it.ctx.notify && it.ctx.notify('guiclose', {id: o.id}); } }
  B.close = function (a) {
    if (!a.length) { const id = this.curFig; const o = G(this).objs.get(id); if (o) delObj(this, o); else origClose.call(this, a); return; }
    if (isChar(a[0])) { if (S(a[0]) === 'all') for (const o of G(this).objs.values()) if (o.type === 'figure' && !o.deleted) delObj(this, o); origClose.call(this, a); return; }
    for (const o of handlesArg(this, a[0])) { if (o.type === 'figure') delObj(this, o); }
  };
  B.delete = function (a) { if (isChar(a[0])) return; for (const o of handlesArg(this, a[0])) delObj(this, o); };
  B.uiwait = B.uiresume = B.waitfor = () => {};
  B.movegui = B.uistack = B.setappdata_ = () => {}; delete B.setappdata_;
  B.setappdata = function (a) { const o = objOf(this, a[0]); (o.app || (o.app = Object.create(null)))[S(a[1])] = a[2]; };
  B.getappdata = function (a) { const o = objOf(this, a[0]); if (a.length < 2) { const q = Object.create(null); Object.assign(q, o.app || {}); return {sa: true, r: 1, c: 1, v: [q]}; } return (o.app && o.app[S(a[1])]) || empty(); };
  B.isappdata = function (a) { const o = objOf(this, a[0]); return bool(!!(o.app && S(a[1]) in o.app)); };
  B.rmappdata = function (a) { const o = objOf(this, a[0]); if (o.app) delete o.app[S(a[1])]; };
  const origDrawnow = B.drawnow; B.drawnow = function () { this.ctx.flushGui && this.ctx.flushGui(); };
  const origPause = B.pause; B.pause = function (a) { this.ctx.flushGui && this.ctx.flushGui(); if (a.length && a[0] instanceof M && this.ctx.sleep) this.ctx.sleep(Math.min(10, Math.max(0, a[0].re[0] || 0)) * 1000); };

  /* ---------- iletişim kutuları ---------- */
  const textOf = v => isCell(v) ? v.v.map(S).join('\n') : isChar(v) ? Array.from({length: Math.max(1, v.r)}, (_, i) => ML.rowStr(v, i)).join('\n') : '';
  for (const [n, kind] of [['msgbox', 'info'], ['errordlg', 'error'], ['warndlg', 'warn'], ['helpdlg', 'info']]) B[n] = function (a, no) { this.ctx.notify && this.ctx.notify('msg', {kind, text: a.length ? textOf(a[0]) : '', title: a.length > 1 && isChar(a[1]) ? S(a[1]) : ''}); else0(this, kind, a); return no ? num(-1) : undefined; };
  function else0(it, kind, a) { if (!it.ctx.notify) it.out(`[${kind}] ${a.length ? textOf(a[0]) : ''}\n`, kind === 'error' ? 'err' : 'warn'); }
  B.waitbar = function (a, no) { const x = a.length && a[0] instanceof M && !isChar(a[0]) ? a[0].re[0] : 0; const msg = a.length > 1 && (isChar(a[1]) || isCell(a[1])) ? textOf(a[1]) : ''; this.ctx.notify && this.ctx.notify('progress', {x, msg}); this.ctx.flushGui && this.ctx.flushGui(); return no ? num(-2) : undefined; };
  function blocking(it, kind, payload, fallback) {
    const r = it.ctx.rpc ? it.ctx.rpc(kind, payload) : undefined;
    if (r !== undefined) return r;
    return fallback();
  }
  B.questdlg = function (a) {
    const q = textOf(a[0]), title = a[1] ? S(a[1]) : ''; let btns = a.slice(2).map(S); let def = btns.length > 1 ? btns.pop() : null; if (!btns.length) { btns = ['Yes', 'No', 'Cancel']; def = def || 'Yes'; }
    const r = blocking(this, 'questdlg', {q, title, btns, def}, () => { this.out(`(soru kutusu bu ortamda gösterilemiyor; varsayılan yanıt: ${def || btns[0]})\n`, 'warn'); return def || btns[0]; });
    return str(r == null ? '' : r);
  };
  B.inputdlg = function (a) {
    const prompts = a.length ? (isCell(a[0]) ? a[0].v.map(S) : [S(a[0])]) : ['']; const title = a[1] ? S(a[1]) : ''; const defs = a[3] ? (isCell(a[3]) ? a[3].v.map(S) : [S(a[3])]) : prompts.map(() => '');
    const r = blocking(this, 'inputdlg', {prompts, title, defs}, () => { this.out('(giriş kutusu bu ortamda gösterilemiyor; varsayılan değerler kullanıldı)\n', 'warn'); return defs; });
    if (r == null) return cell(0, 0, []); return {cell: true, r: r.length, c: 1, v: r.map(str)};
  };
  B.listdlg = function (a, no) {
    let list = [], mode = 'multiple', title = '', prompt = '', init = [1];
    for (let i = 0; i + 1 < a.length; i += 2) { const k = S(a[i]).toLowerCase(), v = a[i + 1]; if (k === 'liststring') list = isCell(v) ? v.v.map(S) : [S(v)]; else if (k === 'selectionmode') mode = S(v); else if (k === 'name') title = S(v); else if (k === 'promptstring') prompt = textOf(v); else if (k === 'initialvalue') init = Array.from(v.re); }
    const r = blocking(this, 'listdlg', {list, mode, title, prompt, init}, () => { this.out('(liste kutusu bu ortamda gösterilemiyor; ilk öğe seçildi)\n', 'warn'); return init; });
    const sel = r == null ? [] : r; const o = sel.length ? rowv(sel) : zeros(1, 0); return no > 1 ? [o, num(sel.length ? 1 : 0)] : o;
  };
  /* ---------- sanal dosya sistemi ---------- */
  const base = p => String(p).replace(/^.*[\\/]/, '');
  const VFS_DIR = 'C:\\MATView\\';
  function vfs(it) { return it.vfs || (it.vfs = new Map()); }
  function vfsFind(it, name) { const b = base(name).toLowerCase(); for (const [k, v] of vfs(it)) if (k.toLowerCase() === b) return v; const r = it.ctx.statFile && it.ctx.statFile(base(name)); if (r) { const e = {name: r.name, size: r.size, remote: true}; vfs(it).set(r.name, e); return e; } return null; }
  ML.vfsAdd = (it, name, bytes) => { vfs(it).set(base(name), {name: base(name), size: bytes.length, bytes}); };
  function readBytes(it, e, off, len) {
    len = Math.max(0, Math.min(len, e.size - off)); if (!len) return new Uint8Array(0);
    if (e.bytes) return e.bytes.subarray(off, off + len);
    if (!it.ctx.readFile) E('MATLAB:fread', `'${e.name}' dosyasının içeriği bu ortamda okunamıyor. Dosyayı arayüzdeki “Dosya ekle” ile ekleyip yeniden deneyin.`);
    return it.ctx.readFile(e.name, off, len);
  }
  B.uigetfile = function (a, no) {
    let filter = a.length && isChar(a[0]) ? S(a[0]) : a.length && isCell(a[0]) ? a[0].v.map(S).join(';') : '*.*'; const title = a.length > 1 ? S(a[1]) : 'Dosya seçin'; let multi = false;
    for (let i = 0; i + 1 < a.length; i++) if (isChar(a[i]) && S(a[i]).toLowerCase() === 'multiselect') multi = /on/i.test(S(a[i + 1]));
    const r = blocking(this, 'uigetfile', {filter, title, multi}, () => {
      const pats = filter.split(/[;,]/).map(p => p.trim()).filter(Boolean).map(p => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i'));
      const list = [...vfs(this).values()].filter(e => !pats.length || pats.some(re => re.test(e.name)));
      if (!list.length) E('MATLAB:uigetfile', `uigetfile: dosya seçme penceresi bu ortamda açılamıyor. Arayüzün üstündeki “Dosya ekle” ile (${filter}) dosyasını ekleyip düğmeye yeniden basın.`);
      return multi ? list.map(e => e.name) : [list[list.length - 1].name];
    });
    if (r == null || !r.length) return no > 1 ? [num(0), num(0), num(0)] : num(0);
    const fn = multi && r.length > 1 ? {cell: true, r: 1, c: r.length, v: r.map(str)} : str(r[0]);
    return [fn, str(VFS_DIR), num(1)].slice(0, Math.max(1, no));
  };
  B.uiputfile = function (a, no) { const def = a.length > 1 ? S(a[1]) : a.length && /^[^*]+\.\w+$/.test(S(a[0])) ? S(a[0]) : 'cikti.mat'; const r = blocking(this, 'uiputfile', {def}, () => def); if (r == null) return [num(0), num(0), num(0)].slice(0, Math.max(1, no)); return [str(base(r)), str(VFS_DIR), num(1)].slice(0, Math.max(1, no)); };
  B.uigetdir = () => str(VFS_DIR.slice(0, -1));
  B.fullfile = a => { const parts = a.map(S).filter(Boolean); let s = parts.map((p, i) => i ? p.replace(/^[\\/]+/, '') : p).map((p, i, arr) => i < arr.length - 1 ? p.replace(/[\\/]+$/, '') : p).join('\\'); return str(s); };
  B.fileparts = (a, no) => { const p = S(a[0]), i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')), d = i >= 0 ? p.slice(0, i) : '', f = p.slice(i + 1), j = f.lastIndexOf('.'); return [str(d), str(j > 0 ? f.slice(0, j) : f), str(j > 0 ? f.slice(j) : '')].slice(0, Math.max(1, no)); };
  B.filesep = () => str('\\'); B.pwd = () => str(VFS_DIR.slice(0, -1)); B.isfile = function (a) { return bool(!!vfsFind(this, S(a[0]))); }; B.isfolder = B.isdir = () => bool(false);
  const origExist = B.exist; B.exist = function (a, no, sc) { if (a.length > 1 && /file/i.test(S(a[1]))) return num(vfsFind(this, S(a[0])) ? 2 : 0); const r = origExist.call(this, a, no, sc); if (r.re[0] === 0 && /\.\w+$/.test(S(a[0])) && vfsFind(this, S(a[0]))) return num(2); return r; };
  B.dir = function (a) { const pat = a.length ? base(S(a[0])) : '*'; const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'); const list = [...vfs(this).values()].filter(e => re.test(e.name)); return {sa: true, r: list.length, c: 1, v: list.map(e => { const o = Object.create(null); o.name = str(e.name); o.folder = str(VFS_DIR.slice(0, -1)); o.bytes = num(e.size); o.isdir = bool(false); o.date = str(''); return o; })}; };
  // fopen / fread / fwrite ...
  const PREC = {uint8: ['u8', 1], uchar: ['u8', 1], 'unsigned char': ['u8', 1], int8: ['i8', 1], schar: ['i8', 1], char: ['c', 1], 'char*1': ['c', 1], uint16: ['u16', 2], ushort: ['u16', 2], int16: ['i16', 2], short: ['i16', 2], uint32: ['u32', 4], uint: ['u32', 4], ulong: ['u32', 4], int32: ['i32', 4], int: ['i32', 4], long: ['i32', 4], uint64: ['u64', 8], int64: ['i64', 8], single: ['s', 4], float32: ['s', 4], float: ['s', 4], double: ['d', 8], float64: ['d', 8]};
  function parsePrec(p) { p = p.trim().toLowerCase(); let outT = 'd', inP = p; if (p.startsWith('*')) { inP = p.slice(1); outT = null; } else if (p.includes('=>')) { const [x, y] = p.split('=>').map(s => s.trim()); inP = x; outT = (PREC[y] || [y === 'logical' ? 'l' : 'd'])[0]; } const ip = PREC[inP]; if (!ip) E('MATLAB:fread:prec', `fread: '${p}' duyarlılığı desteklenmiyor.`); if (outT === null) outT = ip[0] === 'c' ? 'c' : ip[0]; return {t: ip[0], sz: ip[1], out: outT}; }
  function files(it) { return it.fids || (it.fids = new Map()); }
  function fidOf(it, v) { const id = v instanceof M ? v.re[0] : -1; const f = files(it).get(id); if (!f) E('MATLAB:FileIO:InvalidFid', 'Geçersiz dosya tanımlayıcısı (fid). fopen başarısız olmuş olabilir.'); return f; }
  B.fopen = function (a, no) {
    if (isChar(a[0]) && S(a[0]) === 'all') return rowv([...files(this).keys()]);
    const name = S(a[0]), perm = a.length > 1 ? S(a[1]) : 'r', fmt = a.length > 2 ? S(a[2]).toLowerCase() : 'n';
    let id = 3; while (files(this).has(id)) id++;
    if (/^[wa]/.test(perm)) { files(this).set(id, {name: base(name), write: true, chunks: [], pos: 0, size: 0, be: /^(b|ieee-be)/.test(fmt)}); return no > 1 ? [num(id), str('')] : num(id); }
    const e = vfsFind(this, name); if (!e) return no > 1 ? [num(-1), str(`Dosya bulunamadı: ${base(name)} (dosyayı arayüzde “Dosya ekle” ile ya da uigetfile ile seçin)`)] : num(-1);
    files(this).set(id, {name: e.name, e, pos: 0, size: e.size, be: /^(b|ieee-be)/.test(fmt), text: /t/.test(perm)});
    return no > 1 ? [num(id), str('')] : num(id);
  };
  B.fclose = function (a) {
    const close = (id, f) => { if (f.write && this.ctx.notify) { let n = 0; for (const c of f.chunks) n += c.length; const all = new Uint8Array(n); let o = 0; for (const c of f.chunks) { all.set(c, o); o += c.length; } this.ctx.notify('download', {name: f.name, bytes: all}); } files(this).delete(id); };
    if (isChar(a[0]) && S(a[0]) === 'all') { for (const [id, f] of [...files(this)]) close(id, f); return num(0); }
    const id = a[0].re[0], f = files(this).get(id); if (!f) return num(-1); close(id, f); return num(0);
  };
  B.fread = function (a, no) {
    const f = fidOf(this, a[0]); let sizeA = a.length > 1 && a[1] instanceof M && !isChar(a[1]) ? Array.from(a[1].re) : [Infinity]; let precA = a.length > 1 && isChar(a[1]) ? 1 : 2;
    const prec = parsePrec(a.length > precA && isChar(a[precA]) ? S(a[precA]) : 'uint8'); const skip = a.length > precA + 1 && a[precA + 1] instanceof M && !isChar(a[precA + 1]) ? a[precA + 1].re[0] : 0;
    let be = f.be; const mf = a.length > precA + 2 && isChar(a[precA + 2]) ? S(a[precA + 2]).toLowerCase() : a.length > precA + 1 && isChar(a[precA + 1]) ? S(a[precA + 1]).toLowerCase() : null; if (mf) be = /^(b|ieee-be)/.test(mf);
    const avail = Math.max(0, f.size - f.pos), per = prec.sz + skip; let want = sizeA.reduce((p, x) => p * x, 1); const maxN = Math.floor((avail + skip) / per); if (!(want <= maxN)) want = maxN;
    if (want * prec.sz > 2e9) E('MATLAB:fread:mem', 'fread: okunacak veri çok büyük.');
    const bytes = skip ? null : readBytes(this, f.e, f.pos, want * prec.sz); const out = new Float64Array(want);
    if (bytes) { const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), le = !be; const n = Math.min(want, Math.floor(bytes.length / prec.sz)); readTyped(dv, prec, n, le, out); f.pos += n * prec.sz; want = n; }
    else { let n = 0; for (; n < want; n++) { const b = readBytes(this, f.e, f.pos, prec.sz); if (b.length < prec.sz) break; const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); readTyped(dv, prec, 1, !be, out.subarray(n)); f.pos += per; } want = n; }
    let R, C; if (sizeA.length === 1) { R = want; C = 1; } else { R = sizeA[0]; C = Math.ceil(want / R); }
    const res = new M(R, C, R * C === want ? out.subarray(0, want).slice() : (() => { const o = new Float64Array(R * C); o.set(out.subarray(0, want)); return o; })(), null, prec.out === 'c' ? 'c' : prec.out);
    return no > 1 ? [res, num(want)] : res;
  };
  function readTyped(dv, p, n, le, out) {
    switch (p.t) {
      case 'u8': case 'c': for (let i = 0; i < n; i++) out[i] = dv.getUint8(i); break; case 'i8': for (let i = 0; i < n; i++) out[i] = dv.getInt8(i); break;
      case 'u16': for (let i = 0; i < n; i++) out[i] = dv.getUint16(2 * i, le); break; case 'i16': for (let i = 0; i < n; i++) out[i] = dv.getInt16(2 * i, le); break;
      case 'u32': for (let i = 0; i < n; i++) out[i] = dv.getUint32(4 * i, le); break; case 'i32': for (let i = 0; i < n; i++) out[i] = dv.getInt32(4 * i, le); break;
      case 'u64': for (let i = 0; i < n; i++) out[i] = Number(dv.getBigUint64(8 * i, le)); break; case 'i64': for (let i = 0; i < n; i++) out[i] = Number(dv.getBigInt64(8 * i, le)); break;
      case 's': for (let i = 0; i < n; i++) out[i] = dv.getFloat32(4 * i, le); break; case 'd': for (let i = 0; i < n; i++) out[i] = dv.getFloat64(8 * i, le); break;
    }
  }
  B.fwrite = function (a) {
    const f = fidOf(this, a[0]); if (!f.write) E('MATLAB:fwrite', 'fwrite: dosya yazma kipinde açılmadı.'); const x = a[1]; const prec = parsePrec(a.length > 2 ? S(a[2]) : 'uint8');
    const n = x.re.length, buf = new ArrayBuffer(n * prec.sz), dv = new DataView(buf), le = !f.be;
    for (let i = 0; i < n; i++) { const v = x.re[i]; switch (prec.t) { case 'u8': case 'c': dv.setUint8(i, v); break; case 'i8': dv.setInt8(i, v); break; case 'u16': dv.setUint16(2 * i, v, le); break; case 'i16': dv.setInt16(2 * i, v, le); break; case 'u32': dv.setUint32(4 * i, v, le); break; case 'i32': dv.setInt32(4 * i, v, le); break; case 's': dv.setFloat32(4 * i, v, le); break; case 'd': dv.setFloat64(8 * i, v, le); break; case 'u64': dv.setBigUint64(8 * i, BigInt(Math.round(v)), le); break; case 'i64': dv.setBigInt64(8 * i, BigInt(Math.round(v)), le); break; } }
    f.chunks.push(new Uint8Array(buf)); return num(n);
  };
  B.fseek = function (a) { const f = fidOf(this, a[0]); const off = a[1].re[0]; let o = a.length > 2 ? (isChar(a[2]) ? ({bof: -1, cof: 0, eof: 1})[S(a[2])] : a[2].re[0]) : -1; const p = o === -1 ? off : o === 0 ? f.pos + off : f.size + off; if (p < 0 || p > f.size) return num(-1); f.pos = p; return num(0); };
  B.ftell = function (a) { return num(fidOf(this, a[0]).pos); }; B.frewind = function (a) { fidOf(this, a[0]).pos = 0; };
  B.feof = function (a) { const f = fidOf(this, a[0]); return bool(f.pos >= f.size); };
  function readLine(it, f, keep) { if (f.pos >= f.size) return null; const chunk = 4096; let s = ''; for (;;) { const b = readBytes(it, f.e, f.pos, chunk); if (!b.length) break; let i = b.indexOf(10); if (i < 0) { s += new TextDecoder('windows-1254').decode(b); f.pos += b.length; continue; } s += new TextDecoder('windows-1254').decode(b.subarray(0, i + 1)); f.pos += i + 1; break; } return keep ? s : s.replace(/\r?\n$/, ''); }
  B.fgetl = function (a) { const r = readLine(this, fidOf(this, a[0]), false); return r == null ? num(-1) : str(r); };
  B.fgets = function (a) { const r = readLine(this, fidOf(this, a[0]), true); return r == null ? num(-1) : str(r); };
  const origFprintf = B.fprintf;
  B.fprintf = function (a, no, sc) { if (a.length >= 2 && a[0] instanceof M && !isChar(a[0]) && a[0].re.length === 1 && a[0].re[0] >= 3) { const f = fidOf(this, a[0]); if (!f.write) E('MATLAB:fprintf', 'fprintf: dosya yazma kipinde açılmadı.'); const s = ML.sprintfImpl(S(a[1]), a.slice(2)); f.chunks.push(new TextEncoder().encode(s.replace(/\r?\n/g, '\r\n'))); return; } return origFprintf.call(this, a, no, sc); };
  B.fscanf = function (a) { const f = fidOf(this, a[0]); const b = readBytes(this, f.e, f.pos, f.size - f.pos); f.pos = f.size; const t = new TextDecoder('windows-1254').decode(b); const nums = (t.match(/[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/g) || []).map(Number); return colv(nums); };
  B.textscan = function () { E('MATLAB:unsupported', 'textscan desteklenmiyor; fgetl ile satır satır okuyun ya da MATView “Aç ▸ Tablo” ile içe aktarın.'); };
  // load: VFS'teki .mat (ana iş parçacığı çözer)
  const origLoad = B.load;
  B.load = function (a, no, sc) {
    if (a.length && isChar(a[0])) { const nm = S(a[0]); const has = this.ctx.loadMat && (this.ctx.loadMat(nm) || this.ctx.loadMat(base(nm))); if (!has && this.ctx.loadMatRpc) { const vars = this.ctx.loadMatRpc(base(nm)); if (vars) { const want = a.slice(1).map(S).filter(x => !x.startsWith('-')); const o = Object.create(null); for (const k in vars) if (!want.length || want.includes(k)) o[k] = vars[k]; if (no >= 1) return {sa: true, r: 1, c: 1, v: [o]}; for (const k in o) this.setVar(sc, k, o[k]); return; } } if (!has && this.ctx.loadMat) { const v2 = this.ctx.loadMat(base(nm)); if (v2) { a = [str(base(nm)), ...a.slice(1)]; } } }
    const r = origLoad.call(this, a, no, sc);
    if (no < 1 && sc !== this.base && r === undefined) { /* origLoad taban çalışma alanına yazar; işlev içindeyse yerel alana da kopyala */ }
    return r;
  };
  /* ---------- eval / assignin / evalin ---------- */
  ML.evalString = function (it, src, sc, nargout) {
    let ast; try { ast = ML.parse(src); } catch (e) { throw e; }
    for (const f of ast.funcs) it.funcs.set(f.name, f);
    if (nargout && ast.body.length === 1 && ast.body[0].t === 'expr') return it.evalMulti(ast.body[0].e, sc, nargout);
    it.execBlock(ast.body, sc); return [];
  };
  B.eval = function (a, no, sc) {
    const src = S(a[0]);
    if (a.length > 1) { try { return ML.evalString(this, src, sc, no); } catch (e) { if (!(e instanceof ML.MLError)) throw e; this.lastErr = {message: e.message, identifier: e.mid}; return ML.evalString(this, S(a[1]), sc, no); } }
    return ML.evalString(this, src, sc, no);
  };
  B.evalin = function (a, no, sc) { const w = S(a[0]); return ML.evalString(this, S(a[1]), w === 'base' ? this.base : sc, no); };
  B.assignin = function (a, no, sc) { const w = S(a[0]); const v = a[2]; if (v && v._o !== undefined) v._o = null; this.setVar(w === 'base' ? this.base : sc, S(a[1]), v); };
  B.inputname = () => str(''); B.beep = () => {}; B.version = () => str('9.x (MATView alt kümesi)'); B.ver = B.version; B.computer = () => str('PCWIN64'); B.ispc = () => bool(true); B.isunix = () => bool(false); B.ismac = () => bool(false); B.isdeployed = () => bool(false); B.usejava = () => bool(false); B.verLessThan = () => bool(false);
  B.getenv = () => str(''); B.datestr = a => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return str(`${p(d.getDate())}-${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`); };
  B.num2cell_ = null; delete B.num2cell_;
  B.typecast = function (a) {
    const x = a[0], to = S(a[1]); const sz = {uint8: 1, int8: 1, uint16: 2, int16: 2, uint32: 4, int32: 4, uint64: 8, int64: 8, single: 4, double: 8}; const tf = ML.CLSNAME[x.t], s1 = sz[tf], s2 = sz[to]; if (!s1 || !s2) E('MATLAB:typecast', 'typecast: desteklenmeyen tür.');
    const n = x.re.length, buf = new ArrayBuffer(n * s1), dv = new DataView(buf);
    const wr = {uint8: (i, v) => dv.setUint8(i, v), int8: (i, v) => dv.setInt8(i, v), uint16: (i, v) => dv.setUint16(i * 2, v, true), int16: (i, v) => dv.setInt16(i * 2, v, true), uint32: (i, v) => dv.setUint32(i * 4, v, true), int32: (i, v) => dv.setInt32(i * 4, v, true), single: (i, v) => dv.setFloat32(i * 4, v, true), double: (i, v) => dv.setFloat64(i * 8, v, true), uint64: (i, v) => dv.setBigUint64(i * 8, BigInt(v), true), int64: (i, v) => dv.setBigInt64(i * 8, BigInt(v), true)}[tf];
    for (let i = 0; i < n; i++) wr(i, x.re[i]);
    const m = Math.floor(n * s1 / s2), o = new Float64Array(m);
    const rd = {uint8: i => dv.getUint8(i), int8: i => dv.getInt8(i), uint16: i => dv.getUint16(i * 2, true), int16: i => dv.getInt16(i * 2, true), uint32: i => dv.getUint32(i * 4, true), int32: i => dv.getInt32(i * 4, true), single: i => dv.getFloat32(i * 4, true), double: i => dv.getFloat64(i * 8, true), uint64: i => Number(dv.getBigUint64(i * 8, true)), int64: i => Number(dv.getBigInt64(i * 8, true))}[to];
    for (let i = 0; i < m; i++) o[i] = rd(i);
    const t = ML.INTNAME[to] || (to === 'single' ? 's' : 'd'); return x.c === 1 && x.r > 1 ? new M(m, 1, o, null, t) : new M(1, m, o, null, t);
  };
  /* ---------- containers.Map ---------- */
  const keyOf = (m, k) => { if (m.kt === 'char') { if (!isChar(k)) E('MATLAB:Containers:TypeMismatch', 'containers.Map: anahtar metin olmalı.'); return S(k); } if (!(k instanceof M) || k.re.length !== 1) E('MATLAB:Containers:TypeMismatch', 'containers.Map: anahtar sayısal skaler olmalı.'); return k.re[0]; };
  ML.mapNew = function (it, a) {
    const m = {map: true, kt: 'char', vt: 'any', m: new Map()}; let i = 0;
    if (a.length >= 2 && !(isChar(a[0]) && /^(KeyType|ValueType|UniformValues)$/i.test(S(a[0])))) { const ks = isCell(a[0]) ? a[0].v : [a[0]], vs = isCell(a[1]) && isCell(a[0]) ? a[1].v : [a[1]]; if (ks.length && !isChar(ks[0])) m.kt = 'double'; ks.forEach((k, j) => m.m.set(keyOf(m, k), vs[j])); i = 2; }
    for (; i + 1 < a.length; i += 2) { const k = S(a[i]).toLowerCase(); if (k === 'keytype') m.kt = /char|string/.test(S(a[i + 1])) ? 'char' : 'double'; else if (k === 'valuetype') m.vt = S(a[i + 1]); }
    return m;
  };
  const sortedKeys = m => [...m.m.keys()].sort((x, y) => typeof x === 'number' ? x - y : x < y ? -1 : x > y ? 1 : 0);
  ML.mapGet = (m, k) => { const kk = keyOf(m, k); if (!m.m.has(kk)) E('MATLAB:Containers:Map:NoKey', `containers.Map: '${kk}' anahtarı yok.`); return m.m.get(kk); };
  ML.mapSet = (m, k, v) => { if (v && v._o !== undefined) v._o = null; m.m.set(keyOf(m, k), v); };
  const keysCell = m => { const k = sortedKeys(m); return {cell: true, r: 1, c: k.length, v: k.map(x => typeof x === 'number' ? num(x) : str(x))}; };
  ML.mapProp = (it, m, name) => { const n = name.toLowerCase(); if (n === 'count') return num(m.m.size); if (n === 'keytype') return str(m.kt); if (n === 'valuetype') return str(m.vt); if (n === 'keys') return keysCell(m); if (n === 'values') { const k = sortedKeys(m); return {cell: true, r: 1, c: k.length, v: k.map(x => m.m.get(x))}; } E('MATLAB:map', `containers.Map: '${name}' özelliği yok.`); };
  const origKeys = B.keys, origValues = B.values, origLength = B.length, origIsKey = B.isKey, origRemove = B.remove;
  B.keys = function (a, no) { if (a[0] && a[0].map) return keysCell(a[0]); if (origKeys) return origKeys.call(this, a, no); E('MATLAB:keys', 'keys: containers.Map bekleniyordu.'); };
  B.values = function (a, no) { if (a[0] && a[0].map) { const m = a[0]; if (a.length > 1) return {cell: true, r: 1, c: a[1].v.length, v: a[1].v.map(k => ML.mapGet(m, k))}; return ML.mapProp(this, m, 'values'); } E('MATLAB:values', 'values: containers.Map bekleniyordu.'); };
  B.isKey = function (a) { const m = a[0]; if (!m || !m.map) E('MATLAB:isKey', 'isKey: containers.Map bekleniyordu.'); if (isCell(a[1])) { const r = zeros(a[1].r, a[1].c, 'l'); a[1].v.forEach((k, i) => { r.re[i] = m.m.has(keyOf(m, k)) ? 1 : 0; }); return r; } return bool(m.m.has(keyOf(m, a[1]))); };
  B.remove = function (a) { const m = a[0]; if (!m || !m.map) E('MATLAB:remove', 'remove: containers.Map bekleniyordu.'); for (const k of isCell(a[1]) ? a[1].v : [a[1]]) m.m.delete(keyOf(m, k)); return m; };
  B.length = function (a, no) { if (a[0] && a[0].map) return num(a[0].m.size); return origLength.call(this, a, no); };
  const origIsobj = B.isobject; B.isobject = a => bool(!!(a[0] && (a[0].map || a[0].gh)));
  for (const n of ['zoom', 'pan', 'datacursormode', 'linkaxes', 'brush', 'rotate3d', 'colorbar', 'colormap', 'box', 'axis_', 'shg', 'refresh', 'figure_', 'uisetcolor_']) if (!B[n]) B[n] = () => {};
  delete B.axis_; delete B.figure_; delete B.uisetcolor_;
})(MLAB);
