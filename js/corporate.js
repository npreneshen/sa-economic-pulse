/* corporate.js - Corporate tab (P0021 Annual financial statistics).
   1,009 series: 101 line items x 10 industries, annual 2001-2024, R million at current prices. Series ids are "<ITEM>.<industry no>",
   industry 10 = all industries. Ratios here are DERIVED from those line items (the definitions are shown in the tooltips). */
(function () {
'use strict';
const { h, clear, fmt, time } = Kit;
const Store = Kit.store;
const TAB = 'corporate', PUB = 'P0021', MAX_SEL = 6;
const RELEVANCE = 'Use: corporate-sector profitability benchmarking by industry — margins, returns, leverage, investment.';

const pos = x => x != null && x > 0;
const div = (a, b, mul) => (a == null || !pos(b)) ? null : a / b * (mul || 1);
// NB: StatsSA's FPROFAFTERTAX is profit after tax AND dividends (retained profit): FPROF - FTAX - FTDIV. True after-tax profit is derived here.
const npat = g => (g('FPROF') == null || g('FTAX') == null) ? null : g('FPROF') - g('FTAX');
// ratio definitions: g(code) returns the value of a line item for the year being evaluated
const RATIOS = [
  { k: 'nm',  name: 'Net profit margin',        unit: '% of turnover', pct: true, f: g => div(npat(g), g('FTURN'), 100), tip: '(Net profit before tax − company tax) ÷ turnover' },
  { k: 'pm',  name: 'Pre-tax margin',           unit: '% of turnover', pct: true, f: g => div(g('FPROF'), g('FTURN'), 100), tip: 'Net profit before tax ÷ turnover' },
  { k: 'ec',  name: 'Employment cost ratio',    unit: '% of turnover', pct: true, f: g => div(g('FSAL'), g('FTURN'), 100), tip: 'Employment cost ÷ turnover' },
  { k: 'roe', name: 'Return on equity',         unit: '% of equity', pct: true, f: g => div(npat(g), g('FOE'), 100), tip: '(Net profit before tax − company tax) ÷ total equity (year-end)' },
  { k: 'roa', name: 'Return on assets',         unit: '% of assets', pct: true, f: g => div(npat(g), g('FTOTA'), 100), tip: '(Net profit before tax − company tax) ÷ total assets (year-end)' },
  { k: 'lev', name: 'Leverage (liabilities ÷ equity)', unit: 'times', pct: false, f: g => (g('FLITOT') == null || g('FOE') == null || !pos(g('FOE'))) ? null : (g('FLITOT') - g('FOE')) / g('FOE'), tip: '(Total equity and liabilities − equity) ÷ equity' },
  { k: 'ic',  name: 'Interest cover',           unit: 'times', pct: false, f: g => (g('FPROF') == null || !pos(g('FINTPD'))) ? null : (g('FPROF') + g('FINTPD')) / g('FINTPD'), tip: '(Profit before tax + interest paid) ÷ interest paid' },
  { k: 'cr',  name: 'Current ratio',            unit: 'times', pct: false, f: g => div(g('FFINA'), g('FLIABT')), tip: 'Current assets ÷ current liabilities' },
  { k: 'cx',  name: 'Capex intensity',          unit: '% of turnover', pct: true, f: g => div(g('FCEADD'), g('FTURN'), 100), tip: 'Capital expenditure additions ÷ turnover' },
  { k: 'cd',  name: 'Capex ÷ depreciation', unit: 'times', pct: false, f: g => div(g('FCEADD'), g('FDEPR')), tip: 'Capital expenditure additions ÷ depreciation' },
  { k: 'tx',  name: 'Effective tax rate',       unit: '% of pre-tax profit', pct: true, f: g => div(g('FTAX'), g('FPROF'), 100), tip: 'Company tax ÷ net profit before tax' },
  { k: 'dp',  name: 'Dividend payout',          unit: '% of after-tax profit', pct: true, f: g => div(g('FTDIV'), npat(g), 100), tip: 'Dividends paid or provided ÷ (net profit before tax − company tax)' },
  { k: 'rd',  name: 'R&D intensity',            unit: '% of turnover', pct: true, f: g => div(g('FRES'), g('FTURN'), 100), tip: 'Research and development expenditure ÷ turnover' },
  { k: 'at',  name: 'Asset turnover',           unit: 'times', pct: false, f: g => div(g('FTURN'), g('FTOTA')), tip: 'Turnover ÷ total assets (year-end)' },
];
const TABLE_RATIOS = ['nm', 'pm', 'ec', 'roe', 'roa', 'lev', 'ic', 'cx', 'dp'];
const STATEMENT = [
  ['Income statement', null],
  ['FTURN', 'Turnover'], ['FINC', 'Total income'], ['FPURCH', 'Purchases'], ['FSAL', 'Employment cost'], ['FDEPR', 'Depreciation'], ['FINTPD', 'Interest paid'], ['FEXP', 'Total expenditure'],
  ['FPROF', 'Net profit before tax'], ['FTAX', 'Company tax'], ['NPAT', 'Net profit after tax (derived)'], ['FTDIV', 'Dividends'], ['FPROFAFTERTAX', 'Retained profit (after tax and dividends)'],
  ['Balance sheet', null],
  ['FOTHA', 'Non-current assets'], ['FFINA', 'Current assets'], ['FTOTA', 'Total assets'], ['FOE', 'Total equity'], ['FLIABL', 'Non-current liabilities'], ['FLIABT', 'Current liabilities'], ['FLITOT', 'Total equity and liabilities'],
  ['Investment', null],
  ['FCEADD', 'Capital expenditure (additions)'], ['FRES', 'Research and development'],
];

function coverage() { Kit.lookup(TAB, PUB, { includeDiscontinued: true }).markAll(); ['P0044', 'P0043.1', 'P0043.2', 'P0041'].forEach(c => Kit.lookup(TAB, c).markAll()); }

function create() {
  const hs = Kit.hashState.read(TAB);
  const L = Kit.lookup(TAB, PUB, { includeDiscontinued: true });   // retired line items (e.g. capex split, goodwill) are still published history
  const inds = [];                                              // [{no, name}] with "All" first
  L.all({ measure: 'Turnover' }).forEach(it => inds.push({ no: it.id.split('.')[1], name: it.name }));
  inds.sort((a, b) => (a.name === 'All' ? -1 : b.name === 'All' ? 1 : +a.no - +b.no));
  const allNo = (inds.find(i => i.name === 'All') || inds[0]).no;
  const label = no => (inds.find(i => i.no === no) || { name: no }).name === 'All' ? 'All industries' : (inds.find(i => i.no === no) || { name: no }).name;
  const items = {}; L.items.forEach(it => { items[it.id] = it; });
  const itemCodes = []; L.items.forEach(it => { const c = it.id.split('.')[0]; if (it.id.endsWith('.' + allNo)) itemCodes.push([c, it.measure + (it.lastP !== Store.pub(PUB).last ? '  (' + it.firstP + '–' + it.lastP + ', discontinued)' : '')]); });
  itemCodes.sort((a, b) => a[1].localeCompare(b[1]));
  const P = L.items[0].periods;                                  // YYYY labels
  const st = {
    v: ['fin', 'qfs', 'credit'].includes(hs.get('v')) ? hs.get('v') : 'qfs',
    range: hs.get('r') || '10', fromYear: hs.get('from') || '',
    sel: (hs.get('ind') ? hs.get('ind').split('|') : [allNo, inds[3] ? inds[3].no : allNo, inds[2] ? inds[2].no : allNo]).filter((v, i, a) => inds.some(x => x.no === v) && a.indexOf(v) === i).slice(0, MAX_SEL),
    ratio: RATIOS.some(r => r.k === hs.get('ra')) ? hs.get('ra') : 'nm', year: P.includes(hs.get('yr')) ? hs.get('yr') : P[P.length - 1],
    stInd: inds.some(i => i.no === hs.get('si')) ? hs.get('si') : allNo, item: itemCodes.some(c => c[0] === hs.get('it')) ? hs.get('it') : 'FTURN', ipct: hs.get('ip') === '1', itf: ['level', 'yoy', 'rebase'].includes(hs.get('itf')) ? hs.get('itf') : 'level',
  };
  if (!st.sel.length) st.sel = [allNo];
  const cm = Kit.colorMap(Kit.PALETTE);
  const cs = [], xb = []; const xstate = {}; const kill = () => { while (cs.length) cs.pop().destroy(); while (xb.length) xb.pop().destroy(); };
  function save() {
    Kit.hashState.write(TAB, { v: st.v === 'qfs' ? '' : st.v, r: st.fromYear ? '' : (st.range === '10' ? '' : st.range), from: st.fromYear, ind: st.sel.join('|'), ra: st.ratio === 'nm' ? '' : st.ratio, yr: st.year === P[P.length - 1] ? '' : st.year,
      si: st.stInd === allNo ? '' : st.stInd, it: st.item === 'FTURN' ? '' : st.item, ip: st.ipct ? '1' : '', itf: st.itf === 'level' ? '' : st.itf });
  }
  const root = Kit.tabShell({ title: 'Corporate', pubs: [PUB, 'P0044', 'P0043.1', 'P0043.2', 'P0041'], relevance: RELEVANCE });
  const body = h('div'); Kit.freshOrder(body);                          // fresh, frequently updated charts first; annual / pre-2025 ones below
  const rangeCtl = Kit.rangeCtl(st, () => render(), { presets: [{ v: '5', label: '5Y' }, { v: '10', label: '10Y' }, { v: '15', label: '15Y' }, { v: 'all', label: 'All' }] });
  const X = Store.pubX[PUB]; const xr = () => rangeCtl.xr(X[0], X[X.length - 1]);
  const secNav = Kit.segmented([{ v: 'qfs', label: 'Quarterly results' }, { v: 'fin', label: 'Annual financial statistics' }, { v: 'credit', label: 'Credit stress' }], st.v, v => { st.v = v; render(); save(); });
  root.appendChild(h('div', { class: 'filters', style: 'margin-bottom:6px' }, secNav, h('label', { class: 'lbl', style: 'margin-left:10px', text: 'All charts', title: 'Sets the range of every chart on this page; each chart also has its own range buttons' }), rangeCtl.el));
  const chips = () => Kit.chips(inds.map(i => ({ v: i.no, label: i.name === 'All' ? 'All industries' : i.name })), st.sel, k => cm.of(k), k => {
    const i = st.sel.indexOf(k); if (i >= 0) { if (st.sel.length === 1) return; st.sel.splice(i, 1); } else { if (st.sel.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' industries'); return; } st.sel.push(k); }
    render(); save(); });
  const chipHost = h('div', { style: 'margin-bottom:12px' });
  root.appendChild(chipHost);
  root.appendChild(body);

  const get = (code, no) => items[code + '.' + no] || null;
  const gAt = (no, i) => code => { const it = get(code, no); if (!it) return null; const k = i - it.s; return k >= 0 && k < it.v.length ? it.v[k] : null; };
  function ratioSeries(def, no) {
    const base = get('FTURN', no); if (!base) return null;
    const arr = P.map((_, i) => def.f(gAt(no, i)));
    return Store.derive(base, 'ratio:' + def.k + ':' + no, def.name + ' · ' + label(no), arr, { unit: def.unit });
  }

  // Why the latest year is not recent: P0021 is an annual survey released ~11 months after year-end
  function freshNote() {
    const today = new Date().toISOString().slice(0, 10), nx = (window.EQ.manifest.schedule || []).filter(r => r.code === PUB && r.date >= today).sort((a, b) => a.date < b.date ? -1 : 1)[0];
    const days = nx ? Math.round((new Date(nx.date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 864e5) : null;
    return h('div', { class: 'note', style: 'margin-top:10px' }, h('b', { text: 'Why is the latest year ' + P[P.length - 1] + '? ' }),
      'StatsSA runs this survey once a year and publishes it roughly eleven months after the financial year ends, so it always trails the monthly and quarterly tabs. ' + P[P.length - 1] + ' is the newest year published' +
      (nx ? '; the ' + nx.period + ' results are scheduled for ' + Kit.sched.dateText(nx.date) + ' (in ' + days + ' days) and will be picked up automatically by the updater.' : '.'));
  }

  function render() { Kit.keepScroll(renderBody); }
  function renderBody() {
    kill(); clear(body); clear(chipHost);
    body.appendChild(Kit.freshness(st.v === 'qfs' ? ['P0044'] : st.v === 'fin' ? [PUB] : ['P0043.1', 'P0043.2', 'P0041'], st.v === 'qfs' ? 'Quarterly results are preliminary when first published and the previous quarter is revised in each release.' : st.v === 'fin' ? 'Annual results arrive about eleven months after the financial year ends, so this section always trails the quarterly one.' : 'Counts are for calendar months; the newest month is the one before the release.'));
    if (st.v !== 'fin') { Extras[st.v === 'qfs' ? 'qfs' : 'credit']({ tab: TAB, body, cs, xr: code => { const Xc = Store.pubX[code]; return rangeCtl.xr(Xc[0], Xc[Xc.length - 1]); }, redo: () => { render(); save(); }, state: xstate, browsers: xb }); return; }
    cm.assign(st.sel);
    chipHost.appendChild(h('div', { class: 'sub', style: 'margin-bottom:4px', text: 'Industries shown in the charts (up to ' + MAX_SEL + '). Click a table row to add or remove one.' }));
    chipHost.appendChild(chips());
    const [x0, x1] = xr(), lastY = P[P.length - 1];

    // KPIs for all industries
    const gl = gAt(allNo, P.length - 1), gp = gAt(allNo, P.length - 2);
    const kp = ['nm', 'roe', 'lev', 'cx', 'ec'].map(k => RATIOS.find(r => r.k === k));
    const tiles = kp.map(def => { const a = def.f(gl), b = def.f(gp); return { label: def.name + ' · ' + lastY, value: a == null ? '–' : fmt.fixed(a, def.pct ? 1 : 2) + (def.pct ? '%' : 'x'), delta: [{ text: 'vs prior year ' }, { text: a == null || b == null ? '–' : fmt.sg(a - b, def.pct ? 1 : 2, def.pct ? ' pp' : 'x'), bold: true }], note: 'All industries', spark: ratioSeries(def, allNo).v.slice(-24) }; });
    tiles.push({ label: 'Turnover · ' + lastY, value: fmt.bn(gl('FTURN')), delta: [{ text: 'y/y ' }, { text: fmt.sg(Store.pct(gl('FTURN'), gp('FTURN'))), bold: true }], note: 'All industries, current prices' });
    body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Headline', 'Annual financial statistics for the whole corporate sector, ' + lastY + '. Ratios are derived from the published line items; hover a ratio name for its definition.'), Kit.kpiStrip(tiles), freshNote()));

    // ratio table (industry comparison)
    const yrSel = h('select', { 'aria-label': 'Year' }, P.slice().reverse().map(y => { const o = h('option', { value: y, text: y }); if (y === st.year) o.selected = true; return o; }));
    yrSel.addEventListener('change', () => { st.year = yrSel.value; render(); save(); });
    const yi = P.indexOf(st.year);
    const defs = TABLE_RATIOS.map(k => RATIOS.find(r => r.k === k));
    const def0 = () => RATIOS.find(r => r.k === st.ratio) || defs[0];
    const rows = inds.map(i => ({ no: i.no, name: i.name === 'All' ? 'All industries' : i.name, vals: defs.map(d => d.f(gAt(i.no, yi))) }));
    const rank = defs.map((_, c) => { const vs = rows.map(r => r.vals[c]).filter(v => v != null).sort((a, b) => a - b); return v => v == null || vs.length < 2 ? null : vs.indexOf(v) / (vs.length - 1); });
    const tc = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(tc);
    tc.appendChild(Kit.cardHead('Industry comparison', 'Shading shows where an industry ranks within each column (darker = higher). Click a row for its full history, or + to chart it.', yrSel));
    const cols = [{ key: 'n', label: 'Industry', cls: 'l lab', nosort: true, render: r => h('div', { class: 't', title: r.name, text: r.name }) }].concat(defs.map((d, c) => ({ key: d.k, label: d.name, nosort: true, title: d.name + ' — ' + d.tip + ' (' + d.unit + ')',
      render: r => { const v = r.vals[c], rk = rank[c](v); return v == null ? '–' : h('span', { class: 'heatcell', style: 'background:color-mix(in srgb, var(--c1) ' + Math.round((rk == null ? 0 : rk) * 40) + '%, var(--surface-1))' }, fmt.fixed(v, d.pct ? 1 : 2) + (d.pct ? '%' : 'x')); } })));
    const togInd = no => { const i = st.sel.indexOf(no); if (i >= 0) { if (st.sel.length > 1) st.sel.splice(i, 1); } else if (st.sel.length < MAX_SEL) st.sel.push(no); render(); save(); };
    const tbl = Kit.table(cols, { sortKey: null, page: 20, isSel: r => st.sel.includes(r.no), onToggle: r => togInd(r.no),
      onOpen: r => Kit.openSeries({ title: r.name, sub: 'Annual financial statistics', entries: [{ name: def0().name, it: ratioSeries(def0(), r.no) }],
        more: [{ title: 'Turnover, R million', entries: [{ name: 'Turnover', it: get('FTURN', r.no) }] }, { title: 'Profit before tax, R million', entries: [{ name: 'Profit before tax', it: get('FPROF', r.no) }] }],
        toggle: { isOn: () => st.sel.includes(r.no), fn: () => togInd(r.no), offLabel: 'Add to the charts', onLabel: 'Remove from the charts' } }) });
    tbl.set(rows); tc.appendChild(tbl.el); tbl.el.style.maxHeight = 'none';
    tbl.el.querySelectorAll('tbody tr')[0].classList.add('total');

    // ratio over time
    const c1 = h('div', { class: 'card' }), c2 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c1, c2));
    const rSel = h('select', { 'aria-label': 'Ratio' }, RATIOS.map(r => { const o = h('option', { value: r.k, text: r.name }); if (r.k === st.ratio) o.selected = true; return o; }));
    rSel.addEventListener('change', () => { st.ratio = rSel.value; render(); save(); });
    const def = RATIOS.find(r => r.k === st.ratio);
    c1.appendChild(Kit.cardHead('Ratio over time', def.tip + ' — ' + def.unit, rSel));
    cs.push(Kit.linePanel(c1, { entries: st.sel.map(no => ({ key: no, name: label(no), color: cm.of(no), it: ratioSeries(def, no) })), tf: 'level', x0, x1, height: 290, unit: def.unit, valFmt: v => fmt.fixed(v, def.pct ? 1 : 2) + (def.pct ? '%' : 'x'), area: false }));

    // statement for one industry
    const sSel = h('select', { 'aria-label': 'Industry' }, inds.map(i => { const o = h('option', { value: i.no, text: i.name === 'All' ? 'All industries' : i.name }); if (i.no === st.stInd) o.selected = true; return o; }));
    sSel.addEventListener('change', () => { st.stInd = sSel.value; render(); save(); });
    c2.appendChild(Kit.cardHead('Financial statements', label(st.stInd) + ' · R billion, last five years', sSel));
    const yrs = P.slice(-5), srows = STATEMENT.map(([code, nm]) => {
      if (nm == null) return { head: code };
      let it = get(code, st.stInd);
      if (code === 'NPAT') {                                       // derived: profit before tax less company tax
        const a = get('FPROF', st.stInd), b = get('FTAX', st.stInd), A = a && Store.full(a), B = b && Store.full(b);
        it = a && b ? Store.derive(a, 'npat:' + st.stInd, nm, A.map((x, i) => x == null || B[i] == null ? null : x - B[i])) : null;
      }
      if (!it) return { code, nm, vals: [], none: true };
      const v = yrs.map(y => { const k = P.indexOf(y) - it.s; return k >= 0 && k < it.v.length ? it.v[k] : null; });
      const n = it.v.length, cagr = n > 10 && it.v[n - 11] > 0 && it.v[n - 1] > 0 ? (Math.pow(it.v[n - 1] / it.v[n - 11], 1 / 10) - 1) * 100 : null;
      return { code, nm, vals: v, yoy: Store.pct(v[4], v[3]), cagr };
    });
    const scols = [{ key: 'n', label: 'R billion', cls: 'l lab', nosort: true, render: r => r.head ? h('b', { text: r.head }) : h('div', { class: 't', title: r.code, text: r.nm }) }]
      .concat(yrs.map((y, k) => ({ key: 'y' + k, label: y, nosort: true, render: r => r.head ? '' : fmt.fixed(r.vals[k] == null ? null : r.vals[k] / 1000, 1) })))
      .concat([{ key: 'yy', label: 'y/y', nosort: true, render: r => r.head ? '' : fmt.sg(r.yoy) }, { key: 'cg', label: '10y CAGR', nosort: true, cls: 'hide-s', render: r => r.head ? '' : fmt.sg(r.cagr) }]);
    const stbl = Kit.table(scols, { sortKey: null, page: 40 }); stbl.set(srows); c2.appendChild(stbl.el); stbl.el.style.maxHeight = '420px';
    stbl.el.querySelectorAll('tbody tr').forEach((tr, i) => { if (srows[i].head) tr.classList.add('total'); });

    // line-item explorer
    const c3 = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(c3);
    const iSel = Kit.pickSearch({ options: itemCodes.map(([c, nm]) => ({ key: c, label: nm })), value: st.item, ariaLabel: 'Line item', placeholder: 'Search 101 line items\u2026 e.g. dividends, inventories', width: '360px', onChange: k => { st.item = k; render(); save(); } });
    const ipc = h('label', { style: 'display:inline-flex;gap:5px;align-items:center;font-size:12.5px' }, h('input', { type: 'checkbox', checked: st.ipct ? 'checked' : null, onchange: e => { st.ipct = e.target.checked; render(); save(); } }), 'as % of turnover');
    if (st.ipct) ipc.querySelector('input').checked = true;
    const itf = Kit.segmented([{ v: 'level', label: 'Level' }, { v: 'yoy', label: '% y/y' }, { v: 'rebase', label: 'Rebased' }], st.itf, v => { st.itf = v; render(); save(); });
    c3.appendChild(Kit.cardHead('Any line item', 'All ' + itemCodes.length + ' published line items for each industry — R million, current prices', h('span', { style: 'display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap' }, iSel, ipc, itf)));
    const entries = st.sel.map(no => {
      let it = get(st.item, no); if (!it) return null;
      if (st.ipct) { const t = get('FTURN', no), A = Store.full(it), B = Store.full(t); it = Store.derive(it, it.key + ':pt', label(no), A.map((x, i) => x == null || !pos(B[i]) ? null : x / B[i] * 100), { unit: '% of turnover' }); }
      return it ? { key: no, name: label(no), color: cm.of(no), it } : null;
    }).filter(Boolean);
    const itemName = (itemCodes.find(c => c[0] === st.item) || [0, st.item])[1];
    const pubLast = Store.pub(PUB).last, retired = entries.length && entries.every(e => e.it.lastP !== pubLast);
    let ex0 = x0, ex1 = x1;
    if (retired) { ex0 = Math.min.apply(null, entries.map(e => Store.pubX[PUB][e.it.s])); ex1 = Math.max.apply(null, entries.map(e => Store.pubX[PUB][e.it.s + e.it.n - 1])); }
    cs.push(Kit.linePanel(c3, { entries, tf: st.itf, x0: ex0, x1: ex1, notes: retired ? ['This line item is no longer published; the chart shows the years it was.'] : [], height: 300, unit: itemName + (st.ipct ? ' as % of turnover' : ', R million'), emptyText: 'This line item is not published for the selected industries.' }));
    body.appendChild(h('div', { class: 'foot', text: 'All 1,009 P0021 series (101 line items x 10 industries) are reachable through the industry chips, the line-item selector and the statement table. Ratios are derived here, not published.' }));
  }
  document.addEventListener('themechange', () => cs.forEach(c => c.redraw && c.redraw()));
  coverage(); render();
  return { el: root, destroy() { kill(); } };
}
window.Corporate = { create, coverage };
})();
