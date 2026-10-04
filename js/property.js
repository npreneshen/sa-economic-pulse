/* property.js - Property & Construction tab: Building activity (P5041.1), Construction costs (P0151.1), House prices (P0160).
   P5041.1 is published by type (total / residential / non-residential / additions), sub-type, province and measure
   (plans passed, buildings completed): value (R'000), floor area (m2) and, for dwellings, number. Floor area and numbers exist only
   for sub-types, so type-level floor area / dwelling counts are summed from the sub-types here (derived, and labelled). */
(function () {
'use strict';
const { h, clear, fmt, time } = Kit;
const Store = Kit.store;
const TAB = 'property', PUBS = ['P5041.1', 'P0151.1', 'P0160'];
const RELEVANCE = 'Sector relevance: construction, cement and materials (PPC, AfriSam proxies), property developers and listed property.';
const GEOS = ['South Africa', 'Western Cape', 'Eastern Cape', 'Northern Cape', 'Free State', 'KwaZulu-Natal', 'North West', 'Gauteng', 'Mpumalanga', 'Limpopo'];
const TYPES = [
  { k: 'total', name: 'Total', long: 'All buildings' },
  { k: 'res', name: 'Residential buildings', long: 'Residential' },
  { k: 'non', name: 'Non-residential buildings', long: 'Non-residential' },
  { k: 'add', name: 'Additions and alterations', long: 'Additions & alterations' },
];
const SUBS = {
  res: ['Dwelling-houses < 80 square metres', 'Dwelling-houses >= 80 square metres', 'Flats and townhouses', 'Other residential buildings'],
  non: ['Office and banking space', 'Shopping space', 'Industrial and warehouse space', 'Other non-residential buildings'],
  add: ['Dwelling-houses', 'Other buildings'],
};
const DWELL = ['Dwelling-houses < 80 square metres', 'Dwelling-houses >= 80 square metres', 'Flats and townhouses'];
const MEAS = { plans: { re: /^Building plans/, label: 'Plans passed' }, comp: { re: /^Buildings reported/, label: 'Buildings completed' } };
const METRIC = { value: "Value (current prices)", sqm: 'Floor area (m²)', num: 'Dwellings (number)' };

function coverage() { PUBS.forEach(c => Kit.lookup(TAB, c).markAll()); }

function create() {
  const hs = Kit.hashState.read(TAB);
  const st = {
    v: ['bld', 'cost', 'hp'].includes(hs.get('v')) ? hs.get('v') : 'bld',
    range: hs.get('r') || '10', fromYear: hs.get('from') || '',
    mt: ['value', 'sqm', 'num'].includes(hs.get('mt')) ? hs.get('mt') : 'value', ty: TYPES.some(t => t.k === hs.get('ty')) ? hs.get('ty') : 'total',
    geo: GEOS.includes(hs.get('geo')) ? hs.get('geo') : 'South Africa', flow: hs.get('flow') === 'm' ? 'm' : '12m', mm: hs.get('mm') === 'comp' ? 'comp' : 'plans',
    pr: hs.get('pr') === 'current' ? 'current' : 'constant',
    cost: { q: '', group: '', sel: (hs.get('cs') || '').split('|').filter(Boolean), tf: ['level', 'yoy', 'rebase'].includes(hs.get('ctf')) ? hs.get('ctf') : 'rebase', sortKey: 'yoy', sortDir: -1 },
    hp: { q: '', group: '', sel: (hs.get('hs') || '').split('|').filter(Boolean), tf: ['level', 'yoy', 'rebase'].includes(hs.get('htf')) ? hs.get('htf') : 'level', sortKey: 'yoy', sortDir: -1 },
    hm: ['yoy', 'y3', 'base'].includes(hs.get('hm')) ? hs.get('hm') : 'yoy',
  };
  const B = Kit.lookup(TAB, 'P5041.1'), C = Kit.lookup(TAB, 'P0151.1'), H = Kit.lookup(TAB, 'P0160');
  const cs = []; const kill = () => { while (cs.length) cs.pop().destroy(); };
  let browsers = [];
  function save() {
    Kit.hashState.write(TAB, { v: st.v === 'bld' ? '' : st.v, r: st.fromYear ? '' : (st.range === '10' ? '' : st.range), from: st.fromYear, mt: st.mt === 'value' ? '' : st.mt, ty: st.ty === 'total' ? '' : st.ty,
      geo: st.geo === 'South Africa' ? '' : st.geo, flow: st.flow === '12m' ? '' : 'm', mm: st.mm === 'plans' ? '' : 'comp', pr: st.pr === 'constant' ? '' : 'current',
      cs: st.cost.sel.join('|'), ctf: st.cost.tf === 'rebase' ? '' : st.cost.tf, hs: st.hp.sel.join('|'), htf: st.hp.tf === 'level' ? '' : st.hp.tf, hm: st.hm === 'yoy' ? '' : st.hm });
  }
  const root = Kit.tabShell({ title: 'Property & Construction', pubs: PUBS, relevance: RELEVANCE });
  const body = h('div'); Kit.freshOrder(body);                          // fresh, frequently updated charts first; annual / pre-2025 ones below
  const rangeCtl = Kit.rangeCtl(st, () => render());
  const secNav = Kit.segmented([{ v: 'bld', label: 'Building activity' }, { v: 'cost', label: 'Construction costs' }, { v: 'hp', label: 'House prices' }], st.v, v => { st.v = v; render(); save(); });
  root.appendChild(h('div', { class: 'filters', style: 'margin-bottom:8px' }, secNav, h('label', { class: 'lbl', style: 'margin-left:10px', text: 'All charts', title: 'Sets the range of every chart on this page; each chart also has its own range buttons' }), rangeCtl.el));
  root.appendChild(body);
  const rangeFor = code => { const X = Store.pubX[code]; return rangeCtl.xr(X[0], X[X.length - 1]); };

  /* ============================================================ Building activity */
  const memo = new Map();
  const sumOf = (items, key, name, unit) => {
    if (memo.has(key)) return memo.get(key);
    if (items.some(x => !x)) { memo.set(key, null); return null; }
    const F = items.map(Store.full), tot = F[0].map((_, i) => F.every(f => f[i] != null) ? F.reduce((a, f) => a + f[i], 0) : null);
    const d = Store.derive(items[0], key, name, tot, { unit, derived: true }); memo.set(key, d); return d;
  };
  // the series for (measure, type, metric, geo) -- direct where StatsSA publishes it, summed from sub-types otherwise
  function get(meas, tyK, metric, geo) {
    const re = MEAS[meas].re, ty = TYPES.find(t => t.k === tyK);
    if (metric === 'value') {
      return tyK === 'total' ? B.find({ measure: re, name: 'Total', sub: '', price: 'current', adj: 'nsa', geo }) : B.find({ measure: re, name: ty.name, sub: 'Total', unit: "R'000", price: 'current', geo });
    }
    const subsFor = tyK === 'total' ? [].concat(SUBS.res.map(s => ['Residential buildings', s]), SUBS.non.map(s => ['Non-residential buildings', s]), SUBS.add.map(s => ['Additions and alterations', s])) : SUBS[tyK].map(s => [ty.name, s]);
    if (metric === 'num') {
      if (tyK !== 'res' && tyK !== 'total') return null;
      const items = DWELL.map(s => B.find({ measure: re, name: 'Residential buildings', sub: s, unit: 'Number', geo }));
      return sumOf(items, 'num:' + meas + ':' + geo, 'Dwellings, ' + MEAS[meas].label.toLowerCase(), 'Number');
    }
    const items = subsFor.map(([n, s]) => B.find({ measure: re, name: n, sub: s, unit: 'Square metres', geo }));
    return sumOf(items, 'sqm:' + meas + ':' + tyK + ':' + geo, ty.long + ', ' + MEAS[meas].label.toLowerCase(), 'Square metres');
  }
  const sub = (meas, typeName, subName, metric, geo) => {
    const unit = metric === 'value' ? "R'000" : metric === 'sqm' ? 'Square metres' : 'Number';
    return B.find(Object.assign({ measure: MEAS[meas].re, name: typeName, sub: subName, unit, geo }, metric === 'value' ? { price: 'current' } : {}));
  };
  const fmtMetric = (v, metric) => v == null ? '–' : metric === 'value' ? fmt.rands(v) : metric === 'sqm' ? fmt.num(v / 1e6 >= 1 ? v / 1e6 : v) + (v / 1e6 >= 1 ? ' m m²' : ' m²') : fmt.num(v);
  const unitOf = metric => metric === 'value' ? "R'000, current prices" : metric === 'sqm' ? 'Square metres' : 'Number of dwellings';
  const sm = (it, back) => Store.sumLast(it, back, 12);

  function renderBld() {
    const [x0, x1] = rangeFor('P5041.1'), pub = Store.pub('P5041.1');
    // controls
    const tySel = h('select', { 'aria-label': 'Building type' }, TYPES.map(t => { const o = h('option', { value: t.k, text: t.long }); if (t.k === st.ty) o.selected = true; return o; }));
    tySel.addEventListener('change', () => { st.ty = tySel.value; render(); save(); });
    const geoSel = h('select', { 'aria-label': 'Geography' }, GEOS.map(g => { const o = h('option', { value: g, text: g }); if (g === st.geo) o.selected = true; return o; }));
    geoSel.addEventListener('change', () => { st.geo = geoSel.value; render(); save(); });
    body.appendChild(h('div', { class: 'filters', style: 'margin-bottom:6px' },
      h('label', { class: 'lbl', text: 'Measure' }), Kit.segmented(Object.keys(METRIC).map(k => ({ v: k, label: METRIC[k] })), st.mt, v => { st.mt = v; render(); save(); }),
      h('label', { class: 'lbl', style: 'margin-left:8px', text: 'Type' }), tySel, h('label', { class: 'lbl', style: 'margin-left:8px', text: 'Where' }), geoSel,
      h('label', { class: 'lbl', style: 'margin-left:8px', text: 'Show' }), Kit.segmented([{ v: '12m', label: '12-month sum' }, { v: 'm', label: 'Monthly' }], st.flow, v => { st.flow = v; render(); save(); })));
    if (st.mt === 'num' && !(st.ty === 'res' || st.ty === 'total')) body.appendChild(h('div', { class: 'note', text: 'StatsSA publishes dwelling counts for residential buildings only — choose "All buildings" or "Residential" for this measure.' }));
    if (st.mt === 'num' && st.ty === 'total') body.appendChild(h('div', { class: 'note', text: 'Dwelling counts cover residential buildings only (houses under 80 m², houses of 80 m² and over, flats and townhouses).' }));
    if (st.mt === 'sqm' || st.mt === 'num') body.appendChild(h('div', { class: 'note', text: 'Derived: StatsSA publishes floor area' + (st.mt === 'num' ? ' and dwelling counts' : '') + ' by sub-type only; type totals here are the sum of the sub-types.' }));

    // KPIs (always SA totals, value)
    const pl = get('plans', 'total', 'value', 'South Africa'), cm = get('comp', 'total', 'value', 'South Africa');
    const plR = get('plans', 'res', 'value', 'South Africa'), plN = get('plans', 'non', 'value', 'South Africa');
    const realP = B.find({ measure: MEAS.plans.re, name: 'Total', sub: '', price: 'constant', adj: 'sa' }), realC = B.find({ measure: MEAS.comp.re, name: 'Total', sub: '', price: 'constant', adj: 'sa' });
    const mP = Store.metrics(null || pl, B.find({ measure: MEAS.plans.re, name: 'Total', sub: '', price: 'current', adj: 'sa' })), mC = Store.metrics(cm, B.find({ measure: MEAS.comp.re, name: 'Total', sub: '', price: 'current', adj: 'sa' }));
    const yy12 = (it) => Store.pct(sm(it, 0), sm(it, 12));
    const mRP = Store.metrics(realP, realP);
    const tiles = [
      { label: 'Plans passed · 12 months', value: fmt.rands(sm(pl, 0)), delta: [{ text: 'vs prior 12m ' }, { text: fmt.sg(yy12(pl)), bold: true }], note: 'South Africa, current prices' },
      { label: 'Buildings completed · 12 months', value: fmt.rands(sm(cm, 0)), delta: [{ text: 'vs prior 12m ' }, { text: fmt.sg(yy12(cm)), bold: true }], note: 'South Africa, current prices' },
      { label: 'Completed ÷ plans (12m)', value: fmt.fixed(sm(cm, 0) / sm(pl, 0) * 100, 0) + '%', note: 'a pipeline gauge: below 100% = building ahead of what is finished' },
      { label: 'Residential share of plans', value: fmt.fixed(sm(plR, 0) / sm(pl, 0) * 100, 0) + '%', delta: [{ text: 'non-residential ' }, { text: fmt.fixed(sm(plN, 0) / sm(pl, 0) * 100, 0) + '%', bold: true }], note: '12 months, value' },
      { label: 'Real plans passed · ' + fmt.period(realP.lastP), value: fmt.rands(realP.last), delta: [{ text: 'm/m ' }, { text: fmt.sg(mRP.mm), bold: true }], note: 'Constant 2019 prices, SA, monthly', spark: realP.v.slice(-60) },
    ];
    body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Headline', 'South Africa, larger municipalities. Latest ' + fmt.period(pub.last)), Kit.kpiStrip(tiles)));

    // plans vs completed
    const c1 = h('div', { class: 'card' }), c2 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c1, c2));
    const tyName = TYPES.find(t => t.k === st.ty).long;
    c1.appendChild(Kit.cardHead('Plans passed vs buildings completed', tyName + ' · ' + st.geo + ' · ' + unitOf(st.mt) + (st.flow === '12m' ? ', trailing 12 months' : ', monthly')));
    const mk = (meas, color) => { const it = get(meas, st.ty, st.mt, st.geo); if (!it) return null; return { key: meas, name: MEAS[meas].label, color, it: st.flow === '12m' ? Store.derive(it, it.key + ':12', MEAS[meas].label, Store.rolling(Store.full(it), 12, 'sum'), { unit: it.unit }) : it }; };
    cs.push(Kit.linePanel(c1, { entries: [mk('plans', Kit.PALETTE[0]), mk('comp', Kit.PALETTE[1])].filter(Boolean), tf: 'level', x0, x1, height: 300, unit: unitOf(st.mt) + (st.flow === '12m' ? ', trailing 12 months' : ''), emptyText: 'Not published for this selection.' }));

    // composition
    const mSeg = Kit.segmented([{ v: 'plans', label: 'Plans passed' }, { v: 'comp', label: 'Completed' }], st.mm, v => { st.mm = v; render(); save(); });
    c2.appendChild(Kit.cardHead('What is being built', 'Value by building type, trailing 12 months, last 36 months · ' + st.geo, mSeg));
    const parts = TYPES.slice(1).map((t, k) => ({ t, it: get(st.mm, t.k, 'value', st.geo), color: Kit.PALETTE[k] }));
    const P = parts[0].it.periods, li = P.length - 1, from = li - 35, labels = P.slice(from, li + 1);
    const ser = parts.map(p => { const R = Store.rolling(Store.full(p.it), 12, 'sum'); return { name: p.t.long, color: p.color, vals: labels.map((_, j) => R[from + j]) }; });
    c2.appendChild(Kit.legend(ser));
    cs.push(Kit.stackedColumns(c2, { labels, series: ser, height: 270, fmtVal: v => fmt.rands(v), label: 'Value of buildings by type' }));

    // sub-type table
    const t1 = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(t1);
    t1.appendChild(Kit.cardHead('By building type', METRIC[st.mt] + ' · ' + st.geo + ' · last 12 months'));
    const trow = [];
    const addRow = (label, pItem, cItem, cls) => { if (!pItem && !cItem) return; trow.push({ label, cls, p12: sm(pItem, 0), py: Store.pct(sm(pItem, 0), sm(pItem, 12)), c12: sm(cItem, 0), cy: Store.pct(sm(cItem, 0), sm(cItem, 12)), spark: pItem ? pItem.v.slice(-60) : [] }); };
    addRow('All buildings', get('plans', 'total', st.mt, st.geo), get('comp', 'total', st.mt, st.geo), 'total');
    TYPES.slice(1).forEach(t => {
      addRow(t.long, get('plans', t.k, st.mt, st.geo), get('comp', t.k, st.mt, st.geo), 'total');
      SUBS[t.k].forEach(s => { if (st.mt === 'num' && DWELL.indexOf(s) < 0) return; addRow(s.replace('Dwelling-houses', 'Dwelling houses'), sub('plans', t.name, s, st.mt, st.geo), sub('comp', t.name, s, st.mt, st.geo), 'child'); });
    });
    const tcols = [
      { key: 'l', label: 'Type', cls: 'l lab', nosort: true, render: r => h('div', { class: 't', text: r.label }) },
      { key: 'p', label: 'Plans 12m', nosort: true, render: r => fmtMetric(r.p12, st.mt) },
      { key: 'py', label: 'y/y', nosort: true, render: r => fmt.sg(r.py) },
      { key: 'sp', label: '5-yr trend', nosort: true, cls: 'hide-s', render: r => Kit.spark(r.spark) },
      { key: 'c', label: 'Completed 12m', nosort: true, render: r => fmtMetric(r.c12, st.mt) },
      { key: 'cy', label: 'y/y', nosort: true, render: r => fmt.sg(r.cy) },
      { key: 'ratio', label: 'Completed ÷ plans', nosort: true, cls: 'hide-s', render: r => r.p12 && r.c12 != null ? fmt.fixed(r.c12 / r.p12 * 100, 0) + '%' : '–' },
    ];
    const tt = Kit.table(tcols, { sortKey: null, page: 40 }); tt.set(trow); t1.appendChild(tt.el); tt.el.style.maxHeight = 'none';
    tt.el.querySelectorAll('tbody tr').forEach((tr, i) => tr.classList.add(trow[i].cls));

    // province table
    const t2 = h('div', { class: 'card', style: 'margin-top:12px' });
    t2.appendChild(Kit.cardHead('By province', tyName + ' · ' + METRIC[st.mt] + ' · last 12 months. Click a province for its full history, or the + button to chart it above.'));
    const prow = GEOS.map(g => ({ g, p: get('plans', st.ty, st.mt, g), c: get('comp', st.ty, st.mt, g) })).filter(r => r.p);
    const natP = sm(prow.find(r => r.g === 'South Africa').p, 0);
    const rowsP = prow.map(r => ({ g: r.g, p12: sm(r.p, 0), py: Store.pct(sm(r.p, 0), sm(r.p, 12)), share: sm(r.p, 0) / natP * 100, c12: r.c ? sm(r.c, 0) : null, cy: r.c ? Store.pct(sm(r.c, 0), sm(r.c, 12)) : null, spark: r.p.v.slice(-60) }));
    const sa = rowsP.shift(); rowsP.sort((a, b) => b.p12 - a.p12); rowsP.unshift(sa);
    const pmv = f => { const o = {}; rowsP.forEach(r => { if (r.g !== 'South Africa') o[r.g] = f(r); }); return o; };
    cs.push(Kit.provMapCard(body, { style: 'margin-top:12px', title: 'Building plans passed by province — map', sub: tyName + ' · ' + METRIC[st.mt] + ' · last 12 months. Click a province to chart it above.', selected: st.geo, onClick: g => { st.geo = g; render(); save(); }, metrics: [
      { v: 'share', label: 'Share of national', values: pmv(r => r.share), fmt: v => fmt.fixed(v, 1) + '%' },
      { v: 'yoy', label: 'Change on a year earlier', values: pmv(r => r.py), fmt: v => fmt.signed(v, 1, '%'), pivot: rowsP[0].py, pivotLabel: 'South Africa' }] }));
    body.appendChild(t2);
    const pcols = [
      { key: 'g', label: 'Province', cls: 'l', nosort: true, render: r => r.g },
      { key: 'p', label: 'Plans 12m', nosort: true, render: r => fmtMetric(r.p12, st.mt) },
      { key: 'py', label: 'y/y', nosort: true, render: r => fmt.sg(r.py) },
      { key: 'sp', label: '5-yr trend', nosort: true, cls: 'hide-s', render: r => Kit.spark(r.spark) },
      { key: 'sh', label: 'Share', nosort: true, render: r => fmt.fixed(r.share, 1) + '%' },
      { key: 'c', label: 'Completed 12m', nosort: true, render: r => fmtMetric(r.c12, st.mt) },
      { key: 'cy', label: 'y/y', nosort: true, render: r => fmt.sg(r.cy) },
      { key: 'ratio', label: 'Completed ÷ plans', nosort: true, cls: 'hide-s', render: r => r.c12 != null && r.p12 ? fmt.fixed(r.c12 / r.p12 * 100, 0) + '%' : '–' },
    ];
    const pt = Kit.table(pcols, { sortKey: null, page: 20, isSel: r => r.g === st.geo, onToggle: r => { st.geo = r.g; render(); save(); },
      onOpen: r => Kit.openSeries({ title: r.g + ' · ' + tyName, sub: METRIC[st.mt], entries: [{ name: 'Plans passed', it: get('plans', st.ty, st.mt, r.g) }, { name: 'Buildings completed', it: get('comp', st.ty, st.mt, r.g) }],
        toggle: r.g === st.geo ? null : { isOn: () => false, fn: () => { st.geo = r.g; render(); save(); }, offLabel: 'Chart this province above' } }) }); pt.set(rowsP); t2.appendChild(pt.el); pt.el.style.maxHeight = 'none';
    pt.el.querySelectorAll('tbody tr').forEach((tr, i) => { if (i === 0) tr.classList.add('total'); });
    const provSum = rowsP.slice(1).reduce((a, r) => a + r.p12, 0);
    t2.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Provinces sum to ' + fmtMetric(provSum, st.mt) + ' against ' + fmtMetric(rowsP[0].p12, st.mt) + ' published for South Africa (plans passed, 12 months).' }));

    // real series
    const c3 = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(c3);
    const prSeg = Kit.segmented([{ v: 'constant', label: 'Constant 2019 prices' }, { v: 'current', label: 'Current prices' }], st.pr, v => { st.pr = v; render(); save(); });
    const mSeg2 = Kit.segmented([{ v: 'plans', label: 'Plans passed' }, { v: 'comp', label: 'Completed' }], st.mm, v => { st.mm = v; render(); save(); });
    c3.appendChild(Kit.cardHead('Seasonally adjusted value of building', 'South Africa, monthly, R\'000 — by building type', h('span', { style: 'display:inline-flex;gap:6px' }, mSeg2, prSeg)));
    const saE = TYPES.map((t, k) => ({ key: t.k, name: t.long, color: Kit.PALETTE[k], it: B.find({ measure: MEAS[st.mm].re, name: t.name, sub: '', price: st.pr, adj: 'sa' }) }));
    cs.push(Kit.linePanel(c3, { entries: saE, tf: 'level', x0, x1, height: 280, unit: "R'000 per month, seasonally adjusted, " + (st.pr === 'constant' ? 'constant 2019 prices' : 'current prices') }));
  }

  /* ============================================================ Construction costs */
  function renderCost() {
    const pub = Store.pub('P0151.1');
    const items = C.items.map(it => ({ key: it.key, name: it.name.replace(/^Conctrete/, 'Concrete').replace(/fastners/, 'fasteners'), group: it.measure === 'Indices' ? 'Materials, plant & services' : 'Work groups', it }));
    const find = re => items.find(r => re.test(r.name));
    const kp = [/^Total Construction$/i, /^Cement$/, /^Bricks$/, /^Ready-mix/, /^Construction structural and reinforcing steel/, /^Pre-mix asphalt/].map(find).filter(Boolean);
    const tiles = kp.map(r => { const m = Store.metrics(r.it, null), n = r.it.v.length; return { label: r.name.length > 34 ? r.name.slice(0, 32) + '…' : r.name, value: fmt.num(r.it.last), delta: [{ text: 'y/y ' }, { text: fmt.sg(m.yoy), bold: true }, { text: ' · 3m ' }, { text: fmt.sg(Store.pct(r.it.last, r.it.v[n - 4])), bold: true }], note: 'Dec 2023 = 100 · ' + fmt.period(r.it.lastP), spark: m.spark }; });
    body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Headline', 'Construction materials price indices (not seasonally adjusted). Base: Dec 2023 = 100.'), Kit.kpiStrip(tiles)));
    if (!st.cost.sel.length) st.cost.sel = kp.slice(0, 5).map(r => r.key);
    const card = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(card);
    card.appendChild(Kit.cardHead('All construction price indices', items.length + ' series: work groups since 2006, materials, plant and services since 2015. Click rows to chart (up to 8).'));
    const br = Kit.indexBrowser({ items, state: st.cost, getRange: () => rangeFor('P0151.1'), groups: ['Work groups', 'Materials, plant & services'], onState: save, unitHint: 'Index, Dec 2023 = 100' });
    browsers.push(br); card.appendChild(br.el);
  }

  /* ============================================================ House prices */
  const CUTS = [['Residential property price index: Metropolitan areas', 'All sales'], ['RPPI for properties sold the first time', 'First sale'], ['RPPI for resold properties', 'Resold'], ['RPPI for sectional title properties', 'Sectional title'], ['RPPI for freehold properties', 'Freehold']];
  const METROS = ['All metropolitan areas', 'City of Cape Town', 'Buffalo City', 'Nelson Mandela Bay', 'Mangaung', 'eThekwini', 'Ekurhuleni', 'City of Johannesburg', 'City of Tshwane'];
  function renderHp() {
    const pub = Store.pub('P0160');
    const nat = H.find({ name: 'National' }), n = nat.v.length;
    const chg = (it, mode) => { const L = it.v.length; return mode === 'yoy' ? Store.pct(it.last, it.v[L - 13]) : mode === 'y3' ? Store.pct(it.last, it.v[L - 37]) : it.last - 100; };
    const topP = ['Western Cape', 'Gauteng', 'KwaZulu-Natal'].map(nm => H.find({ name: nm, measure: /national and provincial/ }));
    const metro = H.find({ name: 'All metropolitan areas', measure: /Metropolitan/ });
    const mk = (it, label) => { const m = Store.metrics(it, null); return { label, value: fmt.num(it.last), delta: [{ text: 'y/y ' }, { text: fmt.sg(m.yoy), bold: true }, { text: ' · since Dec 2020 ' }, { text: fmt.sg(it.last - 100), bold: true }], note: 'Dec 2020 = 100', spark: m.spark }; };
    body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Headline', 'Residential property price index · latest ' + fmt.period(pub.last) + ' (published with a lag of about five months)'),
      Kit.kpiStrip([mk(nat, 'National'), mk(metro, 'All metropolitan areas')].concat(topP.map(it => mk(it, it.name))))));

    // metro heat matrix
    const mSeg = Kit.segmented([{ v: 'yoy', label: 'vs year ago' }, { v: 'y3', label: 'vs 3 years ago' }, { v: 'base', label: 'since Dec 2020' }], st.hm, v => { st.hm = v; render(); save(); });
    const hc = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(hc);
    hc.appendChild(Kit.cardHead('Metros by property type', 'Price change in the latest month, by metro and type of sale. Blue = prices up, red = down; deeper colour = bigger move.', mSeg));
    const rows = METROS.map(mn => ({ mn, cells: CUTS.map(([meas]) => H.find({ name: mn, measure: meas })) }));
    const scale = st.hm === 'yoy' ? 12 : st.hm === 'y3' ? 35 : 60;
    const cols = [{ key: 'm', label: 'Metro', cls: 'l', nosort: true, render: r => r.mn }].concat(CUTS.map(([_, lab], k) => ({ key: 'c' + k, label: lab, nosort: true, render: r => { const it = r.cells[k]; if (!it) return '–'; const v = chg(it, st.hm); return h('span', { class: 'heatcell', style: 'background:' + Kit.heat(v, scale), title: it.name + ': index ' + fmt.num(it.last) }, fmt.sg(v)); } })));
    const mt = Kit.table(cols, { sortKey: null, page: 20 }); mt.set(rows); hc.appendChild(mt.el); mt.el.style.maxHeight = 'none';
    mt.el.querySelectorAll('tbody tr')[0].classList.add('total');
    // national + provinces bars
    const bc = h('div', { class: 'card', style: 'margin-top:12px' });
    bc.appendChild(Kit.cardHead('National and provinces', 'Price change ' + (st.hm === 'yoy' ? 'on a year earlier' : st.hm === 'y3' ? 'on three years earlier' : 'since Dec 2020') + ', %'));
    const prov = H.all({ measure: /national and provincial/ }).map(it => ({ label: it.name, value: chg(it, st.hm), emph: it.name === 'National', tip: [[fmt.sg(chg(it, st.hm)), 'price change'], [fmt.num(it.last), 'index, Dec 2020 = 100']] }));
    const natRow = prov.find(r => r.emph); const others = prov.filter(r => !r.emph).sort((a, b) => b.value - a.value);
    const hv = {}; others.forEach(r => { hv[r.label] = r.value; });
    cs.push(Kit.provMapCard(body, { style: 'margin-top:12px', title: 'House prices by province — map', sub: 'Price change ' + (st.hm === 'yoy' ? 'on a year earlier' : st.hm === 'y3' ? 'on three years earlier' : 'since Dec 2020') + ', %; the toggle above (vs year ago / 3 years / since Dec 2020) changes it.', metrics: [
      { v: 'chg', label: 'Price change', values: hv, fmt: v => fmt.signed(v, 1, '%'), pivot: natRow.value, pivotLabel: 'national' }] }));
    body.appendChild(bc);
    cs.push(Kit.hbar(bc, { rows: [natRow].concat(others), fmtVal: v => fmt.signed(v, 1, '%'), rowH: 27, ariaLabel: 'House price change by province' }));
    // browser
    const items = H.items.map(it => {
      const cut = CUTS.find(c => c[0] === it.measure); const isNat = /national and provincial/.test(it.measure);
      return { key: it.key, name: isNat ? it.name : it.name + ' · ' + cut[1], group: isNat ? 'National & provinces' : 'Metros · ' + cut[1], it };
    });
    if (!st.hp.sel.length) st.hp.sel = items.filter(r => ['National', 'Western Cape', 'Gauteng', 'KwaZulu-Natal', 'All metropolitan areas · All sales'].includes(r.name)).map(r => r.key);
    const card = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(card);
    card.appendChild(Kit.cardHead('All house price indices', items.length + ' series. Click rows to chart (up to 8).'));
    const groups = ['National & provinces'].concat(CUTS.map(c => 'Metros · ' + c[1]));
    const br = Kit.indexBrowser({ items, state: st.hp, getRange: () => rangeFor('P0160'), groups, onState: save, unitHint: 'Index, Dec 2020 = 100' });
    browsers.push(br); card.appendChild(br.el);
  }

  function render() { Kit.keepScroll(renderBody); }
  function renderBody() {
    kill(); browsers.forEach(b => b.destroy()); browsers = []; clear(body);
    if (st.v === 'bld') renderBld(); else if (st.v === 'cost') renderCost(); else renderHp();
    body.appendChild(h('div', { class: 'foot', text: 'Every series in P5041.1, P0151.1 and P0160 is reachable here through the measure, type, province, search and group controls; floor-area and dwelling-count type totals are summed from sub-types and marked as derived.' }));
  }
  document.addEventListener('themechange', () => { cs.forEach(c => c.redraw && c.redraw()); browsers.forEach(b => b.redraw()); });
  coverage(); render();
  return { el: root, destroy() { kill(); browsers.forEach(b => b.destroy()); } };
}
window.Property = { create, coverage };
})();
