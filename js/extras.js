/* extras.js - sections added to existing tabs for the second batch of publications:
     Industrials -> Land transport (P7162)          Consumer -> Food & beverages (P6420)          Prices -> Trade prices (P0142.7)
     Corporate   -> Credit stress (P0043.1, P0043.2, P0041) and Quarterly results (P0044 QFS)
   Each function renders into ctx.body and pushes its charts to ctx.cs; ctx = {tab, body, cs, xr(code) -> [x0, x1], redo() re-renders the tab}.
   Section state lives in the closures below (kept for the browser session, not in the URL). */
(function () {
'use strict';
const { h, clear, fmt, time } = Kit;
const Store = Kit.store;
const PAL = Kit.PALETTE;
const PROVS = ['Western Cape', 'Eastern Cape', 'Northern Cape', 'Free State', 'KwaZulu-Natal', 'North West', 'Gauteng', 'Mpumalanga', 'Limpopo'];
const short = (t, n) => t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
const MAX_SEL = 8;

function card(body, title, sub, tools, style) { const c = h('div', { class: 'card', style: style || null }); if (title) c.appendChild(Kit.cardHead(title, sub, tools)); body.appendChild(c); return c; }
function twoUp(body) { const a = h('div', { class: 'card' }), b = h('div', { class: 'card' }); body.appendChild(h('div', { class: 'grid2' }, a, b)); return [a, b]; }
const yoyOf = (it, k) => { if (!it) return null; const F = Store.full(it), n = F.length - 1; return Store.pct(F[n], F[n - (k || 12)]); };
// toggle a key in a selection array (min 1, max MAX_SEL)
function toggler(sel, redo) { return k => { const i = sel.indexOf(k); if (i >= 0) { if (sel.length === 1) return; sel.splice(i, 1); } else { if (sel.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' series — remove one first'); return; } sel.push(k); } redo(); }; }
// selection bar: chips (remove) + search-to-add
function selBar(host, sel, labelOf, cm, cands, redo, placeholder) {
  const tg = toggler(sel, redo);
  host.appendChild(h('div', { class: 'addrow', style: 'margin:6px 0' }, Kit.chips(sel.map(k => ({ v: k, label: short(labelOf(k), 34) + ' ×' })), sel, k => cm.of(k), tg),
    Kit.addSearch({ placeholder, candidates: cands, selected: () => sel, onAdd: tg, max: MAX_SEL })));
}
// derived full-length series from two items: f(a, b) per period
function derive(src, key, name, A, B, f, unit) { const a = Store.full(A), b = Store.full(B || A); return Store.derive(src, key, name, a.map((x, i) => { const v = f(x, b[i]); return v == null || !isFinite(v) ? null : v; }), { unit: unit || src.unit }); }
function twelve(it) { return Store.derive(it, it.key + ':12m', it.name, Store.rolling(Store.full(it), 12, 'sum'), { unit: it.unit }); }
function basisSeg(st, redo) { return Kit.segmented([{ v: 'sa', label: 'Seasonally adjusted' }, { v: 'nsa', label: 'Actual' }], st.basis, v => { st.basis = v; redo(); }); }
function tfSeg(st, redo, opts) { return Kit.segmented(opts || [{ v: 'level', label: 'Level' }, { v: 'yoy', label: '% y/y' }, { v: 'rebase', label: 'Rebased' }], st.tf, v => { st.tf = v; redo(); }); }

/* ============================================================================== Land transport (P7162) */
const LT = { basis: 'sa', tf: 'level', sel: ['inc_ming', 'inc_agri', 'inc_cont', 'inc_food'], cm: Kit.colorMap(PAL) };
function transport(ctx) {
  const { body, cs, xr } = ctx, L = Kit.lookup(ctx.tab, 'P7162'), [x0, x1] = xr('P7162'), redo = ctx.redo;
  L.markAll();
  const sa = LT.basis === 'sa';
  const g = (actual, seas) => (sa && seas ? (L.byId(seas) || L.byId(actual)) : L.byId(actual));
  const T = { pay: g('payl_totl', 'fpayl1_tot_d11'), fin: g('incf_totl', 'fincf1_tot_d11'), pax: g('nops_totl', 'fnops1_tot_d11'), pin: g('incp_totl', 'fincp1_tot_d11') };
  const R = { rp: g('railpayl', 'fpayl1_Rail_d11'), dp: g('roadpayl', 'fpayl1_Road_d11'), ri: g('railincf', 'fincf1_Rail_d11'), di: g('roadincf', 'fincf1_Road_d11'),
    rn: g('railnops', 'fnops1_Rail_d11'), dn: g('roadnops', 'fnops1_Road_d11'), rpi: g('inc_rail', 'fincp1_Rail_d11'), dpi: g('inc_road', 'fincp1_Road_d11') };
  body.appendChild(h('div', { class: 'filters', style: 'margin:0 0 6px' }, h('label', { class: 'lbl', text: 'Basis' }), basisSeg(LT, redo), h('span', { class: 'sub', style: 'margin:0', text: 'Seasonally adjusted series are published for the totals and for rail and road; commodity income is actual only.' })));
  const tile = (label, actualId, seasId, note) => { const m = Store.metrics(L.byId(actualId), sa ? L.byId(seasId) : null); return { label: label + ' · ' + fmt.period(m.lastP), value: fmt.num(m.last), delta: [{ text: m.mm != null ? 'm/m ' : '' }, { text: m.mm != null ? fmt.sg(m.mm) : '', bold: true }, { text: ' · y/y ' }, { text: fmt.sg(m.yoy), bold: true }], note: note + (m.sa ? ', SA' : ', actual'), spark: m.spark }; };
  card(body, 'Headline', 'Freight and passenger activity on land transport; y/y compares actual values with the same month a year earlier.').appendChild(Kit.kpiStrip([
    tile('Freight payload', 'payl_totl', 'fpayl1_tot_d11', 'thousand tons'), tile('Freight income', 'incf_totl', 'fincf1_tot_d11', 'R million, current prices'),
    tile('Passenger journeys', 'nops_totl', 'fnops1_tot_d11', 'thousand journeys'), tile('Passenger income', 'incp_totl', 'fincp1_tot_d11', 'R million, current prices')]));
  const mkEntries = (a, b, na, nb) => [{ key: 'a', name: na, color: PAL[0], it: a }, { key: 'b', name: nb, color: PAL[1], it: b }];
  const [c1, c2] = twoUp(body);
  const seg = tfSeg(LT, redo);
  c1.appendChild(Kit.cardHead('Freight payload: rail vs road', "Thousand tons carried per month" + (sa ? ', seasonally adjusted' : ''), seg));
  cs.push(Kit.linePanel(c1, { entries: mkEntries(R.rp, R.dp, 'Rail', 'Road'), tf: LT.tf, x0, x1, height: 280 }));
  c2.appendChild(Kit.cardHead('Passenger journeys: rail vs road', 'Thousand journeys per month' + (sa ? ', seasonally adjusted' : '')));
  cs.push(Kit.linePanel(c2, { entries: mkEntries(R.rn, R.dn, 'Rail', 'Road'), tf: LT.tf, x0, x1, height: 280 }));
  const [c3, c4] = twoUp(body);
  c3.appendChild(Kit.cardHead('Rail’s share of the market', 'Rail as % of rail + road, by payload, freight income and passenger journeys'));
  const share = (a, b, nm) => derive(a, a.key + ':share', nm, a, b, (x, y) => x == null || y == null || x + y === 0 ? null : x / (x + y) * 100, 'Percentage');
  cs.push(Kit.linePanel(c3, { entries: [{ key: 's1', name: 'Freight payload', color: PAL[0], it: share(R.rp, R.dp, 'Freight payload') }, { key: 's2', name: 'Freight income', color: PAL[1], it: share(R.ri, R.di, 'Freight income') }, { key: 's3', name: 'Passenger journeys', color: PAL[2], it: share(R.rn, R.dn, 'Passenger journeys') }], tf: 'level', x0, x1, height: 280, unit: 'Rail share, %', valFmt: v => fmt.fixed(v, 1) + '%' }));
  c4.appendChild(Kit.cardHead('Income per unit carried', 'Freight income ÷ payload (R per ton) for rail and road — a proxy for rate per ton; actual series'));
  const rpt = (inc, pay, nm) => derive(inc, inc.key + ':rpt', nm, inc, pay, (x, y) => x == null || !y ? null : x * 1e6 / (y * 1e3), 'R per ton');
  cs.push(Kit.linePanel(c4, { entries: [{ key: 'r1', name: 'Rail', color: PAL[0], it: rpt(L.byId('railincf'), L.byId('railpayl'), 'Rail') }, { key: 'r2', name: 'Road', color: PAL[1], it: rpt(L.byId('roadincf'), L.byId('roadpayl'), 'Road') }], tf: 'level', x0, x1, height: 280, unit: 'R per ton', valFmt: v => 'R ' + fmt.fixed(v, 0) }));

  // commodities
  const com = L.all({ measure: 'Type of commodity' }).filter(it => /^inc_/.test(it.id)), byId = {}; com.forEach(it => { byId[it.id] = it; });
  const nice = it => short(it.name.replace(/^Transportation of /, '').replace(/^./, c => c.toUpperCase()), 52);
  const c5 = card(body, 'Freight income by commodity', 'Income from carrying each type of cargo, R million per month (actual). Search to add up to ' + MAX_SEL + '.', null, 'margin-top:12px');
  LT.cm.assign(LT.sel);
  selBar(c5, LT.sel, id => nice(byId[id]), LT.cm, () => com.map(it => ({ key: it.id, label: nice(it), group: 'Commodity' })), redo, 'Add a commodity… e.g. containers, mining, parcels');
  cs.push(Kit.linePanel(c5, { entries: LT.sel.filter(id => byId[id]).map(id => ({ key: id, name: nice(byId[id]), color: LT.cm.of(id), it: byId[id] })), tf: LT.tf === 'rebase' ? 'rebase' : (LT.tf === 'yoy' ? 'yoy' : 'level'), x0, x1, height: 300 }));
  const [c6, c7] = twoUp(body);
  const tot12 = Store.sumLast(L.byId('incf_totl'), 0, 12);
  const rows = com.map(it => ({ it, s12: Store.sumLast(it, 0, 12), p12: Store.sumLast(it, 12, 12) })).filter(r => r.s12 != null).sort((a, b) => b.s12 - a.s12);
  c6.appendChild(Kit.cardHead('Where the freight income comes from', 'Share of the last 12 months of freight income, %'));
  cs.push(Kit.hbar(c6, { rows: rows.map(r => ({ label: nice(r.it), value: r.s12 / tot12 * 100, tip: [[fmt.fixed(r.s12 / tot12 * 100, 1) + '%', 'of freight income'], ['R ' + fmt.num(r.s12) + ' m', 'last 12 months'], [fmt.sg(Store.pct(r.s12, r.p12)), 'vs prior 12 months']] })), fmtVal: v => fmt.fixed(v, 1) + '%', rowH: 22, ariaLabel: 'Share of freight income by commodity', title: 'Freight income by commodity, share of 12 months', valueLabel: '% of freight income' }));
  c7.appendChild(Kit.cardHead('Fastest and slowest', 'Change in 12-month freight income on the 12 months before, %'));
  const gr = rows.filter(r => r.p12).map(r => ({ label: nice(r.it), value: Store.pct(r.s12, r.p12), tip: [[fmt.sg(Store.pct(r.s12, r.p12)), 'last 12m vs prior 12m'], ['R ' + fmt.num(r.s12) + ' m', 'last 12 months']] })).sort((a, b) => b.value - a.value);
  cs.push(Kit.hbar(c7, { rows: gr, fmtVal: v => fmt.signed(v, 1, '%'), rowH: 22, ariaLabel: 'Freight income growth by commodity', title: 'Freight income growth by commodity', valueLabel: '12m vs prior 12m, %' }));
}

/* ============================================================================== Food and beverages (P6420) */
const FB = { basis: 'sa', price: 'constant', tf: 'level', sel: ['Total industry', 'Restaurants and coffee shops', 'Take-away and fast food outlets'], outlet: 'Total industry', cm: Kit.colorMap(PAL) };
const FB_OUT = ['Total industry', 'Restaurants and coffee shops', 'Take-away and fast food outlets', 'Catering services'];
function fnb(ctx) {
  const { body, cs, xr } = ctx, L = Kit.lookup(ctx.tab, 'P6420'), [x0, x1] = xr('P6420'), redo = ctx.redo;
  L.markAll();
  const find = (measure, name, price, adj) => L.find({ measure, name, price, adj });
  const pick = (measure, name, price) => (FB.basis === 'sa' && find(measure, name, price, 'sa')) || find(measure, name, price, 'nsa');
  const price = FB.price, outs = FB_OUT.filter(o => find('Total income', o, 'current', 'nsa'));
  body.appendChild(h('div', { class: 'filters', style: 'margin:0 0 6px' }, h('label', { class: 'lbl', text: 'Basis' }), basisSeg(FB, redo), h('label', { class: 'lbl', style: 'margin-left:10px', text: 'Prices' }),
    Kit.segmented([{ v: 'constant', label: 'Constant 2019 prices' }, { v: 'current', label: 'Current prices' }], FB.price, v => { FB.price = v; redo(); })));
  const tiles = outs.map(o => { const a = find('Total income', o, price, 'nsa'), s = find('Total income', o, price, 'sa'), m = Store.metrics(a, FB.basis === 'sa' ? s : null);
    return { label: (o === 'Total industry' ? 'Food and beverages industry' : o) + ' · ' + fmt.period(m.lastP), value: fmt.bn(m.last), delta: [{ text: m.mm != null ? 'm/m ' : '' }, { text: m.mm != null ? fmt.sg(m.mm) : '', bold: true }, { text: ' · y/y ' }, { text: fmt.sg(m.yoy), bold: true }], note: 'Total income, ' + (price === 'constant' ? 'constant prices' : 'current prices') + (m.sa ? ', SA' : ', actual'), spark: m.spark }; });
  const kc = card(body, 'Headline', 'Monthly income of restaurants, take-aways and caterers. y/y compares actual values with a year earlier.'); kc.appendChild(Kit.kpiStrip(tiles));
  // outlet lines
  FB.cm.assign(FB.sel);
  const c1 = card(body, 'Total income by type of outlet', 'R million per month, ' + (price === 'constant' ? 'constant 2019' : 'current') + ' prices', tfSeg(FB, redo, [{ v: 'level', label: 'Level' }, { v: 'pct', label: '% m/m' }, { v: 'yoy', label: '% y/y' }, { v: 'rebase', label: 'Rebased' }]), 'margin-top:12px');
  c1.appendChild(h('div', { style: 'margin:6px 0' }, Kit.chips(outs.map(o => ({ v: o, label: o })), FB.sel, k => FB.cm.of(k), toggler(FB.sel, redo))));
  cs.push(Kit.linePanel(c1, { entries: FB.sel.filter(o => outs.includes(o)).map(o => ({ key: o, name: o, color: FB.cm.of(o), it: pick('Total income', o, price) })), tf: FB.tf, x0, x1, height: 300 }));
  const [c2, c3] = twoUp(body);
  // income mix
  const oSel = h('select', { 'aria-label': 'Outlet type' }, outs.map(o => { const e = h('option', { value: o, text: o }); if (o === FB.outlet) e.selected = true; return e; }));
  oSel.addEventListener('change', () => { FB.outlet = oSel.value; redo(); });
  c2.appendChild(Kit.cardHead('Where the income comes from', 'Food, bar and other income, trailing 12 months, last 36 months · ' + (price === 'constant' ? 'constant' : 'current') + ' prices', oSel));
  const parts = [['Income from food sales', 'Food sales'], ['Income from bar sales', 'Bar sales'], ['Other income', 'Other income']].map(([m, nm], k) => ({ nm, color: PAL[k], it: find(m, FB.outlet, price, 'nsa') })).filter(p => p.it);
  const P = parts[0].it.periods, li = P.length - 1, from = li - 35, labels = P.slice(from, li + 1);
  const ser = parts.map(p => { const R = Store.rolling(Store.full(p.it), 12, 'sum'); return { name: p.nm, color: p.color, vals: labels.map((_, j) => R[from + j]) }; });
  c2.appendChild(Kit.legend(ser));
  cs.push(Kit.stackedColumns(c2, { labels, series: ser, height: 270, fmtVal: v => fmt.bn(v), label: 'Food and beverages income mix', title: 'Income mix, ' + FB.outlet }));
  // deflator
  c3.appendChild(Kit.cardHead('Implied price deflator', 'Current ÷ constant-price income (actual), rebased to the start of the range = 100 — a proxy for menu-price inflation'));
  const dEntries = outs.map((o, k) => { const cur = find('Total income', o, 'current', 'nsa'), con = find('Total income', o, 'constant', 'nsa'); return cur && con ? { key: o, name: o, color: PAL[k], it: derive(cur, cur.key + ':defl', o, cur, con, (a, b) => a == null || !b ? null : a / b) } : null; }).filter(Boolean);
  cs.push(Kit.linePanel(c3, { entries: dEntries, tf: 'rebase', x0, x1, height: 270 }));
  // table
  const tc = card(body, 'Income by outlet type and source', 'Latest month at ' + (price === 'constant' ? 'constant' : 'current') + ' prices, with y/y on actual values', null, 'margin-top:12px');
  const meas = [['Income from food sales', 'Food'], ['Income from bar sales', 'Bar'], ['Other income', 'Other'], ['Total income', 'Total']];
  const rows = outs.map(o => ({ o, cells: meas.map(([m]) => { const a = find(m, o, price, 'nsa'), mm = Store.metrics(a, null); return { last: a ? a.last : null, yoy: mm.yoy }; }) }));
  const cols = [{ key: 'o', label: 'Outlet type', cls: 'l', nosort: true, render: r => r.o }].concat(meas.map(([, lab], k) => ({ key: 'm' + k, label: lab + ' (R m)', nosort: true, render: r => fmt.num(r.cells[k].last) + '  ' + fmt.sg(r.cells[k].yoy, 1) })));
  const t = Kit.table(cols, { sortKey: null, page: 20 }); t.set(rows); tc.appendChild(t.el); t.el.style.maxHeight = 'none';
  tc.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Each cell: latest monthly value, then y/y. Seasonally adjusted and constant-price versions of every line are in the Series Explorer and the chart above.' }));
}

/* ============================================================================== Trade prices (P0142.7) */
const TP = { tf: 'yoy', sel: ['UVI10000', 'UVI20000', 'UVI31000'], cm: Kit.colorMap(PAL) };
function tradePrices(ctx) {
  const { body, cs, xr } = ctx, L = Kit.lookup(ctx.tab, 'P0142.7'), [x0, x1] = xr('P0142.7'), redo = ctx.redo;
  L.markAll();
  const ex = L.byId('UVI10000'), im = L.byId('UVI20000');
  const tot = derive(ex, 'P0142.7:tot', 'Terms of trade', ex, im, (a, b) => a == null || !b ? null : a / b * 100, 'Index');
  const mk = (label, it, note) => { const m = Store.metrics(it, null); return { label: label + ' · ' + fmt.period(m.lastP), value: fmt.fixed(m.last, 1), delta: [{ text: 'm/m ' }, { text: fmt.sg(Store.pct(it.last, it.v[it.v.length - 2])), bold: true }, { text: ' · y/y ' }, { text: fmt.sg(m.yoy), bold: true }], note, spark: m.spark }; };
  const kc = card(body, 'Headline', 'Unit value indices for goods exports and imports (Dec 2024 = 100). The terms of trade are export ÷ import prices — above 100 means each unit exported buys more imports than in Dec 2024. Derived, not published.');
  kc.appendChild(Kit.kpiStrip([mk('Export prices', ex, 'Dec 2024 = 100'), mk('Import prices', im, 'Dec 2024 = 100'), mk('Terms of trade', tot, 'derived: exports ÷ imports'),
    mk('Exports excl. gold', L.byId('UVI31000'), 'Dec 2024 = 100'), mk('Imports excl. crude oil', L.byId('UVI34000'), 'Dec 2024 = 100')]));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('Export vs import prices', 'Both indices, Dec 2024 = 100', tfSeg(TP, redo, [{ v: 'level', label: 'Index' }, { v: 'yoy', label: '% y/y' }, { v: 'rebase', label: 'Rebased' }])));
  cs.push(Kit.linePanel(c1, { entries: [{ key: 'e', name: 'Exports', color: PAL[0], it: ex }, { key: 'i', name: 'Imports', color: PAL[1], it: im }], tf: TP.tf, x0, x1, height: 280 }));
  c2.appendChild(Kit.cardHead('Terms of trade', 'Export prices ÷ import prices × 100 (derived)'));
  cs.push(Kit.linePanel(c2, { entries: [{ key: 't', name: 'Terms of trade', color: PAL[2], it: tot }], tf: 'level', x0, x1, height: 280, ref: 100, valFmt: v => fmt.fixed(v, 1) }));
  const [c3, c4] = twoUp(body);
  const byGroup = (meas, ids) => ids.map(id => L.byId(id)).filter(Boolean).map(it => ({ label: short(it.name, 40), value: yoyOf(it), tip: [[fmt.sg(yoyOf(it)), 'y/y'], [fmt.sg(Store.pct(it.last, it.v[it.v.length - 2])), 'm/m'], [fmt.fixed(it.last, 1), 'index']] })).filter(r => r.value != null).sort((a, b) => b.value - a.value);
  const exIds = L.all({ measure: 'Exports' }).map(it => it.id), imIds = L.all({ measure: 'Imports' }).map(it => it.id);
  c3.appendChild(Kit.cardHead('Export prices by product', 'y/y, latest month, %'));
  cs.push(Kit.hbar(c3, { rows: byGroup('Exports', exIds), fmtVal: v => fmt.signed(v, 1, '%'), rowH: 20, ariaLabel: 'Export unit values by product', title: 'Export unit value indices by product, y/y', valueLabel: 'y/y %' }));
  c4.appendChild(Kit.cardHead('Import prices by product', 'y/y, latest month, %'));
  cs.push(Kit.hbar(c4, { rows: byGroup('Imports', imIds), fmtVal: v => fmt.signed(v, 1, '%'), rowH: 20, ariaLabel: 'Import unit values by product', title: 'Import unit value indices by product, y/y', valueLabel: 'y/y %' }));
  const bc = card(body, 'All unit value indices', L.items.length + ' series: exports and imports by product group. Search or pick rows to chart.', null, 'margin-top:12px');
  const items = L.items.map(it => ({ key: it.key, name: it.measure + ' · ' + it.name, group: it.measure, it }));
  if (!ctx.state.tpb) ctx.state.tpb = { q: '', group: '', sel: ['P0142.7:UVI10000', 'P0142.7:UVI20000'], tf: 'yoy', sortKey: 'yoy', sortDir: -1 };
  const br = Kit.indexBrowser({ items, state: ctx.state.tpb, getRange: () => xr('P0142.7'), groups: ['Exports', 'Imports'], onState: () => {}, unitHint: 'Index, Dec 2024 = 100' });
  ctx.browsers && ctx.browsers.push(br); bc.appendChild(br.el);
}

/* ============================================================================== Credit stress (P0043.1, P0043.2, P0041) */
const CR = { tf: 'yoy', roll: true };
function credit(ctx) {
  const { body, cs, xr } = ctx, redo = ctx.redo;
  const LQ = Kit.lookup(ctx.tab, 'P0043.1'), IN = Kit.lookup(ctx.tab, 'P0043.2'), CV = Kit.lookup(ctx.tab, 'P0041');
  [LQ, IN, CV].forEach(l => l.markAll());
  const lq = LQ.byId('LIQ00000'), inv = IN.byId('INV00000'), civ = CV.byId('S1100000SEAS') || CV.byId('S1100000'), civN = CV.byId('S1100000');
  const roll = it => twelve(it);
  const mk = (label, it, note) => { const r = roll(it), m = Store.metrics(r, null); return { label: label + ' · ' + fmt.period(it.lastP), value: fmt.num(it.last), delta: [{ text: '12-month total ' }, { text: fmt.num(r.last), bold: true }, { text: ' · vs prior ' }, { text: fmt.sg(m.yoy), bold: true }], note, spark: it.v.slice(-60) }; };
  const kc = card(body, 'Headline', 'Business and household distress indicators. Monthly counts are noisy, so the 12-month total is compared with the 12 months before it.');
  kc.appendChild(Kit.kpiStrip([mk('Liquidations', lq, 'companies and close corporations'), mk('Insolvencies', inv, 'individuals, South Africa'), mk('Civil cases for debt', civN, 'summonses issued + cases recorded'),
    (() => { const j = CV.find({ measure: /judgements/i, sub: 'Total', adj: 'nsa' }); return j ? mk('Debt judgements', j, 'default and consent judgements') : null; })()].filter(Boolean)));
  const [x0, x1] = xr('P0043.1'), [y0, y1] = xr('P0043.2');
  const [c1, c2] = twoUp(body);
  const seg = Kit.segmented([{ v: 'roll', label: '12-month total' }, { v: 'month', label: 'Monthly' }], CR.roll ? 'roll' : 'month', v => { CR.roll = v === 'roll'; redo(); });
  c1.appendChild(Kit.cardHead('Liquidations', 'Companies and close corporations (compulsory + voluntary), number', seg));
  const co = LQ.byId('LIQ10000'), cc = LQ.all({ name: /^Close corporations/, sub: 'Total' }).find(it => /^LIQ2/.test(it.id));
  const lqEntries = [{ key: 'all', name: 'All', color: PAL[0], it: CR.roll ? roll(lq) : lq }, { key: 'co', name: 'Companies', color: PAL[1], it: co && (CR.roll ? roll(co) : co) }, { key: 'cc', name: 'Close corporations', color: PAL[2], it: cc && (CR.roll ? roll(cc) : cc) }].filter(e => e.it);
  cs.push(Kit.linePanel(c1, { entries: lqEntries, tf: 'level', x0, x1, height: 280, unit: CR.roll ? 'Number, rolling 12 months' : 'Number per month' }));
  c2.appendChild(Kit.cardHead('Insolvencies since 1980', 'Individual insolvencies in South Africa, number. StatsSA published no monthly counts from Sep 2021 to Dec 2022, so the line has a gap (and the 12-month total is blank until Dec 2023).', null));
  cs.push(Kit.linePanel(c2, { entries: [{ key: 'inv', name: CR.roll ? 'Insolvencies (12 months)' : 'Insolvencies', color: PAL[3], it: CR.roll ? roll(inv) : inv }].concat(IN.byId('INS00000') && !CR.roll ? [{ key: 'sa', name: 'Seasonally adjusted (to Aug 2021)', color: PAL[4], it: IN.byId('INS00000') }] : []), tf: 'level', x0: y0, x1: y1, height: 280, unit: CR.roll ? 'Number, rolling 12 months' : 'Number per month' }));
  // sectors + provinces
  const grid = h('div', { class: 'grid2' }); body.appendChild(grid);
  const c3 = h('div', { class: 'card' }); grid.appendChild(c3);
  const sectNames = {}; LQ.all({}).forEach(it => { if (it.sub && it.sub !== 'Total' && /^LIQ[12][1-9]\d00$/.test(it.id)) (sectNames[it.sub] = sectNames[it.sub] || []).push(it); });
  const srows = Object.keys(sectNames).map(k => { const a = sectNames[k].reduce((t, it) => t + (Store.sumLast(it, 0, 12) || 0), 0), b = sectNames[k].reduce((t, it) => t + (Store.sumLast(it, 12, 12) || 0), 0); return { label: short(k, 44), value: a, tip: [[fmt.num(a), 'liquidations, last 12 months'], [fmt.sg(Store.pct(a, b)), 'vs prior 12 months']] }; }).sort((a, b) => b.value - a.value);
  c3.appendChild(Kit.cardHead('Liquidations by sector', 'Last 12 months, companies + close corporations, number'));
  cs.push(Kit.hbar(c3, { rows: srows, fmtVal: v => fmt.num(v), rowH: 24, ariaLabel: 'Liquidations by sector', title: 'Liquidations by sector, last 12 months', valueLabel: 'number' }));
  const prov = {}, provPrev = {}; PROVS.forEach(p => { const it = IN.find({ geo: p }); if (it) { prov[p] = Store.sumLast(it, 0, 12); provPrev[p] = Store.sumLast(it, 12, 12); } });
  const sum12 = Object.values(prov).reduce((a, b) => a + (b || 0), 0), sumP = Object.values(provPrev).reduce((a, b) => a + (b || 0), 0);
  const vals2 = {}, vals3 = {}; PROVS.forEach(p => { vals2[p] = prov[p] != null && sum12 ? prov[p] / sum12 * 100 : null; vals3[p] = prov[p] != null && provPrev[p] ? Store.pct(prov[p], provPrev[p]) : null; });
  cs.push(Kit.provMapCard(grid, { title: 'Insolvencies by province', sub: 'Last 12 months (published by province from 2023)', metrics: [
    { v: 'share', label: 'Share of provincial total', values: vals2, fmt: v => fmt.fixed(v, 1) + '%' },
    { v: 'chg', label: 'Change on prior 12 months', values: vals3, fmt: v => fmt.signed(v, 1, '%'), pivot: Store.pct(sum12, sumP), pivotLabel: 'all provinces' }] }));
  // civil cases
  const [c5, c6] = twoUp(body);
  c5.appendChild(Kit.cardHead('Civil cases for debt', 'Summonses issued and cases recorded, number per month — actual and seasonally adjusted'));
  cs.push(Kit.linePanel(c5, { entries: [{ key: 'n', name: 'Actual', color: PAL[0], it: civN }, { key: 's', name: 'Seasonally adjusted', color: PAL[1], it: CV.byId('S1100000SEAS') }].filter(e => e.it), tf: 'level', x0: xr('P0041')[0], x1: xr('P0041')[1], height: 280, unit: 'Number per month' }));
  c6.appendChild(Kit.cardHead('Why people are being sued', 'Civil summonses for debt by cause of action, last 12 months, number'));
  const causes = CV.all({ measure: /Civil cases recorded and summonses/, adj: 'nsa', name: /Civil summonses for debt/ }).filter(it => it.sub && it.sub !== 'Total' && !it.geo);
  const crow = causes.map(it => ({ label: short(it.sub, 44), value: Store.sumLast(it, 0, 12), tip: [[fmt.num(Store.sumLast(it, 0, 12)), 'last 12 months'], [fmt.sg(Store.pct(Store.sumLast(it, 0, 12), Store.sumLast(it, 12, 12))), 'vs prior 12 months']] })).filter(r => r.value != null).sort((a, b) => b.value - a.value);
  if (crow.length) cs.push(Kit.hbar(c6, { rows: crow, fmtVal: v => fmt.num(v), rowH: 24, ariaLabel: 'Civil summonses by cause', title: 'Civil summonses for debt by cause, last 12 months', valueLabel: 'number' })); else c6.appendChild(h('div', { class: 'empty', text: 'No breakdown available.' }));
  // browsers
  ctx.state.crb = ctx.state.crb || { lq: { q: '', group: '', sel: [], tf: 'yoy', sortKey: 'yoy', sortDir: -1 }, iv: { q: '', group: '', sel: [], tf: 'yoy', sortKey: 'yoy', sortDir: -1 }, cv: { q: '', group: '', sel: [], tf: 'yoy', sortKey: 'yoy', sortDir: -1 } };
  const B = ctx.state.crb;
  const addBrowser = (title, sub, L0, st, code, grpOf) => {
    const items = L0.items.map(it => ({ key: it.key, name: [it.measure, it.name, it.sub, it.geo].filter(Boolean).join(' · ') + (it.adj === 'sa' ? ' (SA)' : ''), group: grpOf(it), it }));
    if (!st.sel.length) st.sel = [items[0].key];
    const c = card(body, title, sub, null, 'margin-top:12px');
    const br = Kit.indexBrowser({ items, state: st, getRange: () => xr(code), groups: Array.from(new Set(items.map(r => r.group))), onState: () => {}, unitHint: 'Number' });
    ctx.browsers && ctx.browsers.push(br); c.appendChild(br.el);
  };
  addBrowser('All liquidation series', LQ.items.length + ' series by type, sector and procedure', LQ, B.lq, 'P0043.1', it => it.name.split(' / ')[0]);
  addBrowser('All insolvency series', IN.items.length + ' series, national (from 1980) and by province (from 2023)', IN, B.iv, 'P0043.2', it => it.geo ? 'Province' : 'South Africa');
  addBrowser('All civil-case series', CV.items.length + ' series: cases, judgements, causes of action, provinces and magisterial districts', CV, B.cv, 'P0041', it => it.measure.split(' ').slice(0, 5).join(' '));
}

/* ============================================================================== Quarterly financial statistics (P0044) */
const QF = { item: 'Turnover', sel: ['All industries', 'Manufacturing industry', 'Trade industry'], size: 'Total', mode: 'yoy', cm: Kit.colorMap(PAL) };
function qfs(ctx) {
  const { body, cs, xr } = ctx, L = Kit.lookup(ctx.tab, 'P0044'), [x0, x1] = xr('P0044'), redo = ctx.redo;
  L.markAll();
  const inds = Array.from(new Set(L.items.map(it => it.name))), sizes = ['Total', 'Large', 'Medium', 'Small'];
  const itemsAll = Array.from(new Set(L.items.map(it => it.measure)));
  const pick = (item, ind, size) => L.items.find(it => it.measure === item && it.name === ind && it.sub === size && it.lastP === L.last) || L.items.find(it => it.measure === item && it.name === ind && it.sub === size);
  const margin = (ind, size) => { const a = pick('Net profit or loss before taxation', ind, size), t = pick('Turnover', ind, size); return a && t ? derive(t, 'qfs:m:' + ind + size, ind, a, t, (x, y) => x == null || !y ? null : x / y * 100, 'Percentage') : null; };
  const pl = pick('Turnover', 'All industries', 'Total'), pr = pick('Net profit or loss before taxation', 'All industries', 'Total'), mg = margin('All industries', 'Total');
  const tile = (label, it, pct, note) => { const m = Store.metrics(it, null); return { label: label + ' · ' + fmt.period(m.lastP), value: pct ? fmt.fixed(m.last, 1) + '%' : fmt.bn(m.last), delta: [{ text: pct ? 'vs year ago ' : 'y/y ' }, { text: pct ? fmt.signed(m.last - m.yearAgo, 1, ' pp') : fmt.sg(m.yoy), bold: true }], note, spark: it.v.slice(-24) }; };
  const kc = card(body, 'Headline', 'Quarterly financial statistics: a sample survey of formal non-agricultural enterprises (R million, not seasonally adjusted — compare a quarter with the same quarter a year earlier). Latest quarter is preliminary and the previous one is revised in each release.');
  const wi = k => pick(k, 'All industries', 'Total');
  kc.appendChild(Kit.kpiStrip([tile('Turnover', pl, false, 'All industries'), tile('Net profit before tax', pr, false, 'All industries'), tile('Pre-tax margin', mg, true, 'profit ÷ turnover, derived'),
    wi('Employment costs') ? tile('Employment costs', wi('Employment costs'), false, 'All industries') : null, wi('Company tax') ? tile('Company tax', wi('Company tax'), false, 'All industries') : null].filter(Boolean)));
  // controls
  QF.cm.assign(QF.sel);
  const HEAD_ITEMS = ['Turnover', 'Total income', 'Total expenditure', 'Net profit or loss before taxation', 'Company tax', 'Dividends payable', 'Employment costs', 'Depreciation', 'Carrying value of fixed assets as at the end of quarter'];
  const itSel = Kit.pickSearch({ options: HEAD_ITEMS.filter(k => itemsAll.includes(k)).concat(itemsAll.filter(k => !HEAD_ITEMS.includes(k))).map((k, i) => ({ key: k, label: short(k, 70), group: HEAD_ITEMS.includes(k) ? 'Headline items' : 'Other items' })), value: QF.item, ariaLabel: 'Item', placeholder: 'Search items\u2026', width: '340px', onChange: k => { QF.item = k; redo(); } });
  const szSel = Kit.segmented(sizes.map(s0 => ({ v: s0, label: s0 === 'Total' ? 'All sizes' : s0 })), QF.size, v => { QF.size = v; redo(); });
  const modeSeg = Kit.segmented([{ v: 'level', label: 'R million' }, { v: 'yoy', label: '% y/y' }, { v: 'margin', label: 'Margin' }], QF.mode, v => { QF.mode = v; redo(); });
  const c1 = card(body, 'By industry', 'Pick an item and enterprise size. Margin = net profit before tax ÷ turnover.', modeSeg, 'margin-top:12px');
  c1.appendChild(h('div', { class: 'filters', style: 'margin:6px 0' }, h('label', { class: 'lbl', text: 'Item' }), QF.mode === 'margin' ? h('span', { class: 'sub', style: 'margin:0', text: 'Net profit before tax ÷ turnover' }) : itSel, h('label', { class: 'lbl', style: 'margin-left:8px', text: 'Size' }), szSel));
  selBar(c1, QF.sel, k => k, QF.cm, () => inds.map(k => ({ key: k, label: k, group: 'Industry' })), redo, 'Add an industry…');
  const entries = QF.sel.filter(k => inds.includes(k)).map(k => ({ key: k, name: k, color: QF.cm.of(k), it: QF.mode === 'margin' ? margin(k, QF.size) : pick(QF.item, k, QF.size) })).filter(e => e.it);
  cs.push(Kit.linePanel(c1, { entries, tf: QF.mode === 'yoy' ? 'yoy' : 'level', x0, x1, height: 300, unit: QF.mode === 'margin' ? 'Pre-tax margin, %' : QF.mode === 'yoy' ? '% change on the same quarter a year earlier' : 'R million per quarter', valFmt: QF.mode === 'margin' ? (v => fmt.fixed(v, 1) + '%') : undefined }));
  // size classes + league table
  const [c2, c3] = twoUp(body);
  const isel = h('select', { 'aria-label': 'Industry' }, inds.map(k => { const e = h('option', { value: k, text: k }); if (k === (QF.sizeInd || 'All industries')) e.selected = true; return e; }));
  isel.addEventListener('change', () => { QF.sizeInd = isel.value; redo(); });
  const ind2 = QF.sizeInd || 'All industries';
  c2.appendChild(Kit.cardHead('Large, medium and small enterprises', QF.item + ' · ' + ind2 + ' · R million per quarter', isel));
  const sizeIts = ['Large', 'Medium', 'Small'].map((s0, k) => ({ nm: s0, color: PAL[k], it: pick(QF.item, ind2, s0) })).filter(p => p.it);
  if (sizeIts.length) { const P = sizeIts[0].it.periods, li = P.length - 1, from = Math.max(0, li - 19), labels = P.slice(from, li + 1); const ser = sizeIts.map(p => { const F = Store.full(p.it); return { name: p.nm, color: p.color, vals: labels.map((_, j) => F[from + j]) }; }); c2.appendChild(Kit.legend(ser)); cs.push(Kit.stackedColumns(c2, { labels, series: ser, height: 270, fmtVal: v => fmt.bn(v), label: 'Quarterly ' + QF.item + ' by enterprise size', title: QF.item + ' by size, ' + ind2 })); }
  c3.appendChild(Kit.cardHead('Pre-tax margin by industry', 'Net profit before tax ÷ turnover, latest quarter vs the same quarter a year earlier'));
  const mrows = inds.map(k => margin(k, 'Total')).filter(Boolean).map(it => { const n = it.v.length, a = it.last, b = it.v[n - 5]; return { label: it.name, value: a, tip: [[fmt.fixed(a, 1) + '%', 'now'], [b != null ? fmt.fixed(b, 1) + '%' : '–', 'a year earlier']] }; }).sort((a, b) => b.value - a.value);
  cs.push(Kit.hbar(c3, { rows: mrows, fmtVal: v => fmt.fixed(v, 1) + '%', rowH: 26, ariaLabel: 'Pre-tax margin by industry', title: 'Pre-tax margin by industry, latest quarter', valueLabel: '% of turnover' }));
  // industry comparison (the quarterly counterpart of the annual comparison): ratios shaded by rank within each column
  const qP = L.items[0].periods, qOpts = qP.slice(-12).reverse();
  if (!QF.cq || qOpts.indexOf(QF.cq) < 0) QF.cq = qP[qP.length - 1];
  const qi = qP.indexOf(QF.cq), cmpSize = QF.csize || 'Total';
  const qSel = h('select', { 'aria-label': 'Quarter' }, qOpts.map(p => { const o = h('option', { value: p, text: fmt.period(p) }); if (p === QF.cq) o.selected = true; return o; }));
  qSel.addEventListener('change', () => { QF.cq = qSel.value; redo(); });
  const zSel = Kit.segmented(sizes.map(s0 => ({ v: s0, label: s0 === 'Total' ? 'All sizes' : s0 })), cmpSize, v => { QF.csize = v; redo(); });
  const tc = card(body, 'Industry comparison', 'Shading shows where an industry ranks within each ratio column (darker = higher). Click a row for its full history, or + to chart it above.', h('span', { style: 'display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap' }, qSel, zSel), 'margin-top:12px');
  const at = (it, i) => { if (!it) return null; const k = i - it.s; return k >= 0 && k < it.v.length ? it.v[k] : null; };
  const rt = (a, b, mul) => (a == null || b == null || !(b > 0)) ? null : a / b * (mul || 1);
  const rows = inds.map(k => {
    const t = pick('Turnover', k, cmpSize), p = pick('Net profit or loss before taxation', k, cmpSize), tx = pick('Company tax', k, cmpSize), ec = pick('Employment costs', k, cmpSize), dp = pick('Depreciation', k, cmpSize), dv = pick('Dividends payable', k, cmpSize);
    const T = at(t, qi), T0 = at(t, qi - 4), Pq = at(p, qi), P0 = at(p, qi - 4), X = at(tx, qi), E = at(ec, qi), D = at(dp, qi), V = at(dv, qi);
    return { k, t, p, T, Ty: T == null || !T0 ? null : Store.pct(T, T0), Pq, Py: Pq == null || P0 == null || !(P0 > 0) ? null : Store.pct(Pq, P0), mg: rt(Pq, T, 100), ec: rt(E, T, 100), tax: Pq != null && Pq > 0 ? rt(X, Pq, 100) : null,
      pay: Pq != null && X != null && Pq - X > 0 ? rt(V, Pq - X, 100) : null, dep: rt(D, T, 100), spark: t ? t.v.slice(-20) : [] };
  });
  const RC = [{ k: 'mg', label: 'Pre-tax margin', tip: 'Net profit before tax ÷ turnover' }, { k: 'ec', label: 'Employment cost ÷ turnover', tip: 'Employment costs ÷ turnover' }, { k: 'tax', label: 'Effective tax rate', tip: 'Company tax ÷ profit before tax (only where profit is positive)' },
    { k: 'pay', label: 'Dividend payout', tip: 'Dividends payable ÷ (profit before tax − company tax)' }, { k: 'dep', label: 'Depreciation ÷ turnover', tip: 'Depreciation ÷ turnover' }];
  const rk = {}; RC.forEach(c => { const vs = rows.map(r => r[c.k]).filter(v => v != null).sort((a, b) => a - b); rk[c.k] = v => v == null || vs.length < 2 ? null : vs.indexOf(v) / (vs.length - 1); });
  const heat = (r, c) => { const v = r[c.k], q = rk[c.k](v); return v == null ? '–' : h('span', { class: 'heatcell', style: 'background:color-mix(in srgb, var(--c1) ' + Math.round((q == null ? 0 : q) * 40) + '%, var(--surface-1))' }, fmt.fixed(v, 1) + '%'); };
  const cols = [{ key: 'k', label: 'Industry', cls: 'l lab', nosort: true, render: r => h('div', { class: 't', title: r.k, text: r.k }) },
    { key: 't', label: 'Turnover', nosort: true, title: 'R million in the quarter', render: r => fmt.num(r.T) }, { key: 'ty', label: 'y/y', nosort: true, title: 'vs the same quarter a year earlier', render: r => fmt.sg(r.Ty) },
    { key: 'p', label: 'Profit before tax', nosort: true, render: r => fmt.num(r.Pq) }, { key: 'py', label: 'y/y', nosort: true, render: r => fmt.sg(r.Py) }]
    .concat(RC.map(c => ({ key: c.k, label: c.label, nosort: true, title: c.tip, render: r => heat(r, c) })), [{ key: 's', label: 'Turnover trend', nosort: true, cls: 'hide-s', render: r => Kit.spark(r.spark) }]);
  const togInd = k => { const i = QF.sel.indexOf(k); if (i >= 0) { if (QF.sel.length > 1) QF.sel.splice(i, 1); } else if (QF.sel.length < MAX_SEL) QF.sel.push(k); else Kit.toast('Maximum ' + MAX_SEL + ' industries — remove one first'); redo(); };
  const t = Kit.table(cols, { sortKey: null, page: 20, isSel: r => QF.sel.includes(r.k), onToggle: r => togInd(r.k),
    onOpen: r => Kit.openSeries({ title: r.k, sub: 'Quarterly financial statistics, ' + (cmpSize === 'Total' ? 'all sizes' : cmpSize.toLowerCase() + ' enterprises'), entries: [{ name: 'Turnover', it: r.t }, { name: 'Profit before tax', it: r.p }],
      more: [{ title: 'Pre-tax margin, %', entries: [{ name: 'Pre-tax margin', it: margin(r.k, cmpSize) }] }, { title: 'Employment costs, R million', entries: [{ name: 'Employment costs', it: pick('Employment costs', r.k, cmpSize) }] }],
      toggle: { isOn: () => QF.sel.includes(r.k), fn: () => togInd(r.k), offLabel: 'Add to the industry chart', onLabel: 'Remove from the industry chart' } }) });
  t.set(rows); tc.appendChild(t.el); t.el.style.maxHeight = 'none';
  t.el.querySelectorAll('tbody tr').forEach((tr, i) => { if (rows[i] && rows[i].k === 'All industries') tr.classList.add('total'); });
  tc.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Quarterly results are preliminary when first published and the previous quarter is revised in each release; this app keeps the newest figures. Annual results (P0021, the other half of this tab) reconcile to the quarterly series only approximately: different samples and definitions.' }));
  // browser
  const bitems = L.items.map(it => ({ key: it.key, name: it.measure + ' · ' + it.name + ' · ' + it.sub, group: it.name, it })).filter(r => r.it.v.length > 4);
  ctx.state.qfb = ctx.state.qfb || { q: '', group: '', sel: ['P0044:Turnover|All industries|Total'], tf: 'yoy', sortKey: 'yoy', sortDir: -1 };
  const bc = card(body, 'All quarterly series', bitems.length + ' series: every item for every industry and enterprise size.', null, 'margin-top:12px');
  const br = Kit.indexBrowser({ items: bitems, state: ctx.state.qfb, getRange: () => xr('P0044'), groups: inds, onState: () => {}, unitHint: 'R million per quarter' });
  ctx.browsers && ctx.browsers.push(br); bc.appendChild(br.el);
}

/* ============================================================================== Agriculture (P1101, annual agricultural survey) */
const AG = { sel: ['INCFC11', 'INCHOT11', 'INCANIM11'], cm: Kit.colorMap(PAL), geo: 'share' };
function agriculture(ctx) {
  const { body, cs, xr } = ctx, L = Kit.lookup(ctx.tab, 'P1101', { includeDiscontinued: true }), [x0, x1] = xr('P1101'), redo = ctx.redo;
  L.markAll();
  const g = id => L.byId(id), n = id => (g(id) ? g(id).last : null);
  const inc = g('INCTOT11'), exp = g('EXPTOT11'), pub = Store.pub('P1101');
  const surplus = derive(inc, 'P1101:surplus', 'Income less expenditure', inc, exp, (a, b) => a == null || b == null ? null : a - b);
  const tile = (label, it, note, f) => { const m = Store.metrics(it, null); return { label: label + ' · ' + it.lastP, value: (f || fmt.rands)(m.last), delta: [{ text: 'vs previous year ' }, { text: fmt.sg(m.yoy), bold: true }], note, spark: it.v }; };
  const kc = card(body, 'Headline', 'Annual agricultural survey: income, costs, capital spending and jobs on farms. The survey is annual; the latest edition (' + pub.last + ') was published in November 2025 and the next is expected about a year later.');
  kc.appendChild(Kit.kpiStrip([tile('Total income', inc, 'R, current prices'), tile('Total expenditure', exp, 'R, current prices'), tile('Income less expenditure', surplus, 'derived; before tax, interest and depreciation are counted in expenditure'),
    tile('Capital expenditure', g('FCAPTOT11'), 'land, vehicles, machinery, other'), tile('Book value of assets', g('FBVTOT11'), 'land and buildings, machinery, other'),
    tile('Farm employment', g('FTOTEMP11'), 'number of people, from 2016', fmt.num)]));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('Income and expenditure', 'R, current prices, by survey year'));
  cs.push(Kit.linePanel(c1, { entries: [{ key: 'i', name: 'Total income', color: PAL[0], it: inc }, { key: 'e', name: 'Total expenditure', color: PAL[1], it: exp }, { key: 's', name: 'Income less expenditure', color: PAL[2], it: surplus }], tf: 'level', x0: Store.pubX['P1101'][0], x1, height: 280, valFmt: v => fmt.rands(v), unit: "R'000" }));
  c2.appendChild(Kit.cardHead('Where the sales come from', 'Sales of goods by type, R, current prices'));
  const parts = [['INCFC11', 'Field crops'], ['INCHOT11', 'Horticulture'], ['INCANIM11', 'Animals'], ['INCANIP11', 'Animal products'], ['INCOTHAGR11', 'Other agricultural products']].map(([id, nm], k) => ({ nm, color: PAL[k], it: g(id) })).filter(p => p.it);
  const P = parts[0].it.periods, li = P.length - 1, labels = P.slice(P.indexOf('2008'), li + 1), from = P.indexOf('2008');
  const ser = parts.map(p => { const F = Store.full(p.it); return { name: p.nm, color: p.color, vals: labels.map((_, j) => F[from + j]) }; });
  c2.appendChild(Kit.legend(ser));
  cs.push(Kit.stackedColumns(c2, { labels, series: ser, height: 270, fmtVal: v => fmt.rands(v), label: 'Agricultural sales by type', title: 'Agricultural sales by type' }));
  // products and costs
  const [c3, c4] = twoUp(body);
  const prodIds = ['IMAIZE11', 'IWHEAT11', 'ISUGARCN11', 'IVEGES11', 'IFRUIT11', 'IGRAPES11', 'ICATTL11', 'ISHEEP11', 'INPIGS11', 'ICHICK11', 'INEGGS11', 'INMILK11', 'ICHCMT11', 'INBEEF11', 'INWOOL11'];
  c3.appendChild(Kit.cardHead('Income by product, ' + pub.last, 'Sales of the main crops, livestock and animal products (R); change on the previous year in the tooltip'));
  cs.push(Kit.hbar(c3, { rows: prodIds.map(id => g(id)).filter(it => it && it.lastP === pub.last).map(it => ({ label: it.measure.replace(/^./, c => c.toUpperCase()), value: it.last, tip: [[fmt.rands(it.last), it.lastP], [fmt.sg(Store.pct(it.last, it.v[it.v.length - 2])), 'vs previous year']] })).sort((a, b) => b.value - a.value), fmtVal: v => fmt.rands(v), rowH: 22, ariaLabel: 'Income by product', title: 'Agricultural income by product, ' + pub.last, valueLabel: "R'000" }));
  const costIds = ['EXPPURC11', 'EXPFEED11', 'EXPSEDFET11', 'EXPFUEL11', 'EXPSALAR11', 'EXPREPIAR11', 'EXPDEPR11', 'EXPINTER11', 'EXPELECW11', 'EXPRENT11', 'EXPTRANS11', 'EXPINSU11', 'EXPCONT11', 'EXPREMCROP11', 'EXPOTHER11'];
  c4.appendChild(Kit.cardHead('What farming costs, ' + pub.last, 'Main expenditure lines (R). "Total purchases" includes feed, seed and fertiliser, fuel, containers and the other purchases below it, so the bars overlap.'));
  cs.push(Kit.hbar(c4, { rows: costIds.map(id => g(id)).filter(it => it && it.lastP === pub.last).map(it => ({ label: short(it.measure, 40), value: it.last, tip: [[fmt.rands(it.last), it.lastP], [fmt.sg(Store.pct(it.last, it.v[it.v.length - 2])), 'vs previous year'], [fmt.fixed(it.last / exp.last * 100, 1) + '%', 'of total expenditure']] })).sort((a, b) => b.value - a.value), fmtVal: v => fmt.rands(v), rowH: 22, ariaLabel: 'Farm costs', title: 'Farm expenditure by line, ' + pub.last, valueLabel: "R'000" }));
  // provinces
  const PN = { WC: 'Western Cape', EC: 'Eastern Cape', NC: 'Northern Cape', FS: 'Free State', KZN: 'KwaZulu-Natal', NW: 'North West', GP: 'Gauteng', MP: 'Mpumalanga', LP: 'Limpopo' };
  const provVals = suffix => { const o = {}, p = {}; Object.keys(PN).forEach(k => { const it = g(k + suffix + '11'); if (it) { o[PN[k]] = it.last; p[PN[k]] = it.v[it.v.length - 2]; } }); return [o, p]; };
  const [si, sp] = provVals('SALESERV'), [em, ep] = provVals('EMPL'), [sa] = provVals('SALARIES');
  const tot = o => Object.values(o).reduce((a, b) => a + (b || 0), 0), share = o => { const t = tot(o), r = {}; Object.keys(o).forEach(k => { r[k] = o[k] / t * 100; }); return r; };
  const chg = (o, p) => { const r = {}; Object.keys(o).forEach(k => { r[k] = Store.pct(o[k], p[k]); }); return r; };
  const grid = h('div', { class: 'grid2' }); body.appendChild(grid);
  cs.push(Kit.provMapCard(grid, { title: 'Farm sales by province', sub: 'Income from sales and services, ' + pub.last + ' (published by province from 2020)', metrics: [
    { v: 'share', label: 'Share of national', values: share(si), fmt: v => fmt.fixed(v, 1) + '%' }, { v: 'chg', label: 'Change on previous year', values: chg(si, sp), fmt: v => fmt.signed(v, 1, '%'), pivot: Store.pct(tot(si), tot(sp)), pivotLabel: 'all provinces' }] }));
  cs.push(Kit.provMapCard(grid, { title: 'Farm jobs by province', sub: 'People employed in agriculture, ' + pub.last, metrics: [
    { v: 'share', label: 'Share of national', values: share(em), fmt: v => fmt.fixed(v, 1) + '%' }, { v: 'chg', label: 'Change on previous year', values: chg(em, ep), fmt: v => fmt.signed(v, 1, '%'), pivot: Store.pct(tot(em), tot(ep)), pivotLabel: 'all provinces' }] }));
  const bc = card(body, 'All agricultural survey series', L.items.length + ' series: income, expenditure, capital spending, assets, debt, employment, product income and provinces. Annual, so "y/y" is the change on the previous survey year.', null, 'margin-top:12px');
  const items = L.items.map(it => ({ key: it.key, name: it.measure + (it.id.match(/^(WC|EC|NC|FS|KZN|NW|GP|MP|LP)/) ? '' : ''), group: /^(INC|IN[A-Z]|I[A-Z]{3,}|OTHE)/.test(it.id) ? 'Income' : /^EXP/.test(it.id) ? 'Expenditure' : /^(FCAP|CAP)/.test(it.id) ? 'Capital spending' : /^(FBV|BV)/.test(it.id) ? 'Assets' : /EMP/.test(it.id) ? 'Employment' : 'Other', it }));
  if (!ctx.state.agb) ctx.state.agb = { q: '', group: '', sel: ['P1101:INCTOT11', 'P1101:EXPTOT11'], tf: 'level', sortKey: 'yoy', sortDir: -1 };
  const br = Kit.indexBrowser({ items, state: ctx.state.agb, getRange: () => xr('P1101'), groups: ['Income', 'Expenditure', 'Capital spending', 'Assets', 'Employment', 'Other'], onState: () => {}, unitHint: "R'000 or number", fmtLast: v => fmt.num(v) });
  ctx.browsers && ctx.browsers.push(br); bc.appendChild(br.el);
}

window.Extras = { transport, fnb, tradePrices, credit, qfs, agriculture };
})();
