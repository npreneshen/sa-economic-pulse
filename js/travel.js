/* travel.js - Travel & Leisure tab (P6410 Tourist accommodation).
   5 segments (total industry, hotels, caravan parks & camping, guest houses & farms, other) x 8 measures, actual and (for 7 measures) SA. */
(function () {
'use strict';
const { h, clear, fmt, time } = Kit;
const Store = Kit.store;
const TAB = 'travel', PUB = 'P6410', MAX_SEL = 5;
const RELEVANCE = 'Sector relevance: hospitality and travel (City Lodge, Tsogo Sun, airlines).';
const MEASURES = [
  ['Occupancy rate', 'Occupancy rate', 'avg'],
  ['Income per stay unit nights sold', 'Income per stay-unit night', 'avg'],
  ['Stay units nights sold', 'Stay-unit nights sold', 'sum'],
  ['Stay units available', 'Stay units available', 'sum'],
  ['Total income', 'Total income', 'sum'],
  ['Income from accommodation', 'Accommodation income', 'sum'],
  ['Income from restaurant and bar sales', 'Restaurant & bar income', 'sum'],
  ['Other income', 'Other income', 'sum'],
];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function coverage() { Kit.lookup(TAB, PUB).markAll(); }

function create() {
  const hs = Kit.hashState.read(TAB);
  const L = Kit.lookup(TAB, PUB);
  const segs = []; L.items.forEach(it => { if (segs.indexOf(it.name) < 0) segs.push(it.name); });
  const st = {
    basis: hs.get('basis') === 'nsa' ? 'nsa' : 'sa', range: hs.get('r') || '10', fromYear: hs.get('from') || '',
    tf: ['level', 'yoy', 'rebase'].includes(hs.get('tf')) ? hs.get('tf') : 'level',
    m: MEASURES.some(x => x[0] === hs.get('m')) ? hs.get('m') : MEASURES[0][0],
    sel: (hs.get('seg') ? hs.get('seg').split('|').filter(s => segs.includes(s)) : segs.slice(0, 2)), mix: segs.includes(hs.get('mix')) ? hs.get('mix') : segs[0],
  };
  if (!st.sel.length) st.sel = [segs[0]];
  const cm = Kit.colorMap(Kit.PALETTE);
  const cs = []; const kill = () => { while (cs.length) cs.pop().destroy(); };
  function save() {
    Kit.hashState.write(TAB, { basis: st.basis === 'sa' ? '' : 'nsa', r: st.fromYear ? '' : (st.range === '10' ? '' : st.range), from: st.fromYear, tf: st.tf === 'level' ? '' : st.tf,
      m: st.m === MEASURES[0][0] ? '' : st.m, seg: st.sel.join('|'), mix: st.mix === segs[0] ? '' : st.mix });
  }
  const root = Kit.tabShell({ title: 'Travel & Leisure', pubs: [PUB], relevance: RELEVANCE });
  const body = h('div'); Kit.freshOrder(body);                          // fresh, frequently updated charts first; annual / pre-2025 ones below
  const rangeCtl = Kit.rangeCtl(st, () => render());
  const X = Store.pubX[PUB];
  const xr = () => rangeCtl.xr(X[0], X[X.length - 1]);
  const get = (meas, seg, sa) => L.find({ measure: meas, name: seg, adj: sa ? 'sa' : 'nsa' });
  const pickB = (meas, seg) => { const sa = get(meas, seg, true), a = get(meas, seg, false); return st.basis === 'sa' && sa ? { it: sa, sa: true } : { it: a, sa: false, fb: st.basis === 'sa' && !sa }; };
  const label = meas => (MEASURES.find(x => x[0] === meas) || [0, meas])[1];

  root.appendChild(h('div', { class: 'filters', style: 'margin-bottom:6px' }, h('label', { class: 'lbl', text: 'Basis' }),
    Kit.segmented([{ v: 'sa', label: 'Seasonally adjusted' }, { v: 'nsa', label: 'Actual' }], st.basis, v => { st.basis = v; render(); save(); }),
    h('label', { class: 'lbl', style: 'margin-left:10px', text: 'All charts', title: 'Sets the range of every chart on this page; each chart also has its own range buttons' }), rangeCtl.el));
  root.appendChild(body);

  function render() { Kit.keepScroll(renderBody); }
  function renderBody() {
    kill(); clear(body); cm.assign(st.sel);
    const [x0, x1] = xr(), pub = Store.pub(PUB);
    // KPIs
    const mT = (meas, seg) => Store.metrics(get(meas, seg, false), get(meas, seg, true));
    const occT = mT('Occupancy rate', segs[0]), incN = mT('Income per stay unit nights sold', segs[0]), occH = mT('Occupancy rate', segs[1]);
    const sumTile = (meas, seg, lab, note) => { const a = get(meas, seg, false); return { label: lab, value: meas.startsWith('Stay') ? fmt.num(Store.sumLast(a, 0, 12)) + ' k' : fmt.bn(Store.sumLast(a, 0, 12)), delta: [{ text: 'vs prior 12m ' }, { text: fmt.sg(Store.pct(Store.sumLast(a, 0, 12), Store.sumLast(a, 12, 12))), bold: true }], note }; };
    const tiles = [
      { label: 'Occupancy · ' + fmt.period(pub.last), value: fmt.fixed(occT.last, 1) + '%', delta: [{ text: 'm/m ' }, { text: fmt.sg(occT.mm, 1, ' pp'), bold: true }, { text: ' · y/y ' }, { text: fmt.sg(occT.yoy, 1, ' pp'), bold: true }], note: segs[0] + ', SA', spark: occT.spark },
      { label: 'Hotels occupancy', value: fmt.fixed(occH.last, 1) + '%', delta: [{ text: 'm/m ' }, { text: fmt.sg(occH.mm, 1, ' pp'), bold: true }, { text: ' · y/y ' }, { text: fmt.sg(occH.yoy, 1, ' pp'), bold: true }], note: 'SA', spark: occH.spark },
      { label: 'Income per stay-unit night', value: 'R ' + fmt.fixed(incN.last, 0), delta: [{ text: 'm/m ' }, { text: fmt.sg(incN.mm), bold: true }, { text: ' · y/y ' }, { text: fmt.sg(incN.yoy), bold: true }], note: segs[0] + ', SA', spark: incN.spark },
      sumTile('Total income', segs[0], 'Total income, last 12 months', segs[0] + ', current prices'),
      sumTile('Stay units nights sold', segs[0], 'Nights sold, last 12 months', 'thousand stay-unit nights'),
    ];
    body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Headline', 'Tourist accommodation, larger establishments. m/m on seasonally adjusted series; y/y on actual series. Latest ' + fmt.period(pub.last)), Kit.kpiStrip(tiles)));

    // controls for chart A
    const mSel = h('select', { 'aria-label': 'Measure' }, MEASURES.map(x => { const o = h('option', { value: x[0], text: x[1] }); if (x[0] === st.m) o.selected = true; return o; }));
    mSel.addEventListener('change', () => { st.m = mSel.value; render(); save(); });
    const tfSeg = Kit.segmented([{ v: 'level', label: 'Level' }, { v: 'yoy', label: '% y/y' }, { v: 'rebase', label: 'Rebased' }], st.tf, v => { st.tf = v; render(); save(); });
    const chips = Kit.chips(segs.map(s0 => ({ v: s0, label: s0 })), st.sel, k => cm.of(k), k => {
      const i = st.sel.indexOf(k); if (i >= 0) { if (st.sel.length === 1) return; st.sel.splice(i, 1); } else { if (st.sel.length >= MAX_SEL) return; st.sel.push(k); }
      render(); save(); });
    const c1 = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(c1);
    c1.appendChild(Kit.cardHead('Segments compared', 'One measure across accommodation types', h('span', { style: 'display:inline-flex;gap:6px;align-items:center' }, mSel, tfSeg)));
    c1.appendChild(h('div', { style: 'margin:6px 0' }, chips));
    const fbs = [], entries = st.sel.map(sg => { const p = pickB(st.m, sg); if (p.fb) fbs.push(sg); return { key: sg, name: sg + (p.sa ? ' (SA)' : p.fb ? ' †' : ''), color: cm.of(sg), it: p.it }; });
    cs.push(Kit.linePanel(c1, { entries, tf: st.tf, x0, x1, height: 300, notes: fbs.length ? ['† No seasonally adjusted series is published for ' + label(st.m).toLowerCase() + ' — actual values shown.'] : [] }));

    // income mix + seasonality
    const c2 = h('div', { class: 'card' }), c3 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c2, c3));
    const mixSel = h('select', { 'aria-label': 'Segment' }, segs.map(s0 => { const o = h('option', { value: s0, text: s0 }); if (s0 === st.mix) o.selected = true; return o; }));
    mixSel.addEventListener('change', () => { st.mix = mixSel.value; render(); save(); });
    c2.appendChild(Kit.cardHead('Where the income comes from', 'Trailing 12 months, R million, last 36 months', mixSel));
    const parts = [['Income from accommodation', 'Accommodation'], ['Income from restaurant and bar sales', 'Restaurant & bar'], ['Other income', 'Other']].map(([m, nm], k) => ({ nm, color: Kit.PALETTE[k], it: get(m, st.mix, false) }));
    const P = parts[0].it.periods, li = P.length - 1, from = li - 35, labels = P.slice(from, li + 1);
    const ser = parts.map(p => { const R = Store.rolling(Store.full(p.it), 12, 'sum'); return { name: p.nm, color: p.color, vals: labels.map((_, j) => R[from + j]) }; });
    c2.appendChild(Kit.legend(ser));
    cs.push(Kit.stackedColumns(c2, { labels, series: ser, height: 270, fmtVal: v => fmt.bn(v), label: 'Income mix, ' + st.mix }));
    const totA = Store.sumLast(get('Total income', st.mix, false), 0, 12), fb = Store.sumLast(get('Income from restaurant and bar sales', st.mix, false), 0, 12);
    c2.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Restaurant and bar sales are ' + fmt.fixed(fb / totA * 100, 0) + '% of total income over the last 12 months.' }));

    // seasonality heat strip: month x year, actual values of the chosen measure for the first selected segment
    const sg = st.sel[0], it = get(st.m, sg, false), F = Store.full(it), Pp = it.periods;
    c3.appendChild(Kit.cardHead('Seasonality', label(st.m) + ' · ' + sg + ' · actual values by month. Darker = higher within the table.'));
    const years = []; for (let y = +Pp[li].slice(0, 4); y > +Pp[li].slice(0, 4) - 8; y--) years.push(y);
    const val = (y, m) => { const idx = Pp.indexOf(y + '-' + String(m + 1).padStart(2, '0')); return idx >= 0 ? F[idx] : null; };
    let lo = Infinity, hi = -Infinity; years.forEach(y => MON.forEach((_, m) => { const v = val(y, m); if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
    const isPctU = it.unit === 'Percentage';
    const tcols = [{ key: 'y', label: 'Year', cls: 'l', nosort: true, render: r => String(r) }].concat(MON.map((mn, m) => ({ key: mn, label: mn, nosort: true, render: y => { const v = val(y, m); return v == null ? h('span', { class: 'muted', text: '–' }) : h('span', { class: 'heatcell', style: 'background:color-mix(in srgb, var(--c1) ' + Math.round((v - lo) / ((hi - lo) || 1) * 48) + '%, var(--surface-1))', title: fmt.period(y + '-' + String(m + 1).padStart(2, '0')) + ': ' + fmt.num(v) }, isPctU ? fmt.fixed(v, 0) : (v >= 1000 ? fmt.fixed(v / 1000, 1) + 'k' : fmt.fixed(v, 0))); } })));
    const stbl = Kit.table(tcols, { sortKey: null, page: 12, cls: 'compact' }); stbl.set(years); c3.appendChild(stbl.el); stbl.el.style.maxHeight = 'none';
    c3.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Units: ' + it.unit + (isPctU ? '' : '; values over 1,000 shown as k.') }));

    // segment table
    const tc = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(tc);
    tc.appendChild(Kit.cardHead('Segments at a glance', 'Latest month and last 12 months. Click a segment to add it to the chart above.'));
    const rows = segs.map(s0 => {
      const o = mT('Occupancy rate', s0), n = mT('Income per stay unit nights sold', s0), ti = get('Total income', s0, false), nt = get('Stay units nights sold', s0, false), fbI = get('Income from restaurant and bar sales', s0, false);
      return { s0, occ: o.last, occY: o.yoy, inc: n.last, incY: n.yoy, nts: Store.sumLast(nt, 0, 12), ntsY: Store.pct(Store.sumLast(nt, 0, 12), Store.sumLast(nt, 12, 12)), ti: Store.sumLast(ti, 0, 12), tiY: Store.pct(Store.sumLast(ti, 0, 12), Store.sumLast(ti, 12, 12)), fb: Store.sumLast(fbI, 0, 12) / Store.sumLast(ti, 0, 12) * 100, spark: get('Occupancy rate', s0, true).v.slice(-60) };
    });
    const cols = [
      { key: 's', label: 'Segment', cls: 'l lab', nosort: true, render: r => h('div', { class: 't', text: r.s0 }) },
      { key: 'o', label: 'Occupancy', nosort: true, render: r => fmt.fixed(r.occ, 1) + '%' },
      { key: 'oy', label: 'y/y', nosort: true, render: r => fmt.sg(r.occY, 1, ' pp') },
      { key: 'sp', label: '5-yr trend', nosort: true, cls: 'hide-s', render: r => Kit.spark(r.spark) },
      { key: 'i', label: 'Income/night', nosort: true, render: r => 'R ' + fmt.fixed(r.inc, 0) },
      { key: 'iy', label: 'y/y', nosort: true, render: r => fmt.sg(r.incY) },
      { key: 'n', label: 'Nights 12m', nosort: true, cls: 'hide-s', render: r => fmt.num(r.nts) + ' k' },
      { key: 'ny', label: 'y/y', nosort: true, cls: 'hide-s', render: r => fmt.sg(r.ntsY) },
      { key: 't', label: 'Income 12m', nosort: true, render: r => fmt.bn(r.ti) },
      { key: 'ty', label: 'y/y', nosort: true, render: r => fmt.sg(r.tiY) },
      { key: 'f', label: 'Bar & restaurant share', nosort: true, cls: 'hide-s', render: r => fmt.fixed(r.fb, 0) + '%' },
    ];
    const t = Kit.table(cols, { sortKey: null, page: 10, isSel: r => st.sel.includes(r.s0),
      onOpen: r => Kit.openSeries({ title: r.s0, sub: 'Tourist accommodation', entries: [{ name: 'Occupancy rate', it: get('Occupancy rate', r.s0, false) }, { name: 'Occupancy rate (SA)', it: get('Occupancy rate', r.s0, true) }],
        more: [{ title: 'Income per stay-unit night, R', entries: [{ name: 'Income per night', it: get('Income per stay unit nights sold', r.s0, false) }] }, { title: 'Total income, R million', entries: [{ name: 'Total income', it: get('Total income', r.s0, false) }] }],
        toggle: { isOn: () => st.sel.includes(r.s0), fn: () => { const i = st.sel.indexOf(r.s0); if (i >= 0) { if (st.sel.length > 1) st.sel.splice(i, 1); } else if (st.sel.length < MAX_SEL) st.sel.push(r.s0); render(); save(); }, offLabel: 'Add to the charts', onLabel: 'Remove from the charts' } }),
      onToggle: r => { const i = st.sel.indexOf(r.s0); if (i >= 0) { if (st.sel.length > 1) st.sel.splice(i, 1); } else if (st.sel.length < MAX_SEL) st.sel.push(r.s0); render(); save(); } });
    t.set(rows); tc.appendChild(t.el); t.el.style.maxHeight = 'none';
    t.el.querySelectorAll('tbody tr')[0].classList.add('total');
    body.appendChild(h('div', { class: 'foot', text: 'All 75 P6410 series (5 segments x 8 measures, actual and seasonally adjusted) are reachable through the measure, basis and segment controls.' }));
  }
  document.addEventListener('themechange', () => cs.forEach(c => c.redraw && c.redraw()));
  coverage(); render();
  return { el: root, destroy() { kill(); } };
}
window.Travel = { create, coverage };
})();
