/* resources.js - Resources tab (P2041 Mining: production and sales).
   Series ids: FMP<code> volume index (actual), FMS<code> volume index (SA), MVK<code> sales value R million (actual),
   MVS<code> sales value (SA, totals only). */
(function () {
'use strict';
const { h, clear, fmt, time } = Kit;
const Store = Kit.store;
const TAB = 'resources', PUB = 'P2041';
const PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];
const MAX_SEL = 8;

// code = StatsSA mineral code; total = headline aggregate rows
const MINERALS = [
  { c: '20000', name: 'Total (gold included)', total: true },
  { c: '20001', name: 'Total (gold excluded)', total: true },
  { c: '24000', name: 'Gold' },
  { c: '23023', name: 'PGMs' },
  { c: '21000', name: 'Coal' },
  { c: '23010', name: 'Iron ore' },
  { c: '23022', name: 'Manganese ore' },
  { c: '23020', name: 'Chromium' },
  { c: '23021', name: 'Copper' },
  { c: '23029', name: 'Nickel' },
  { c: '23999', name: 'Other metallic minerals' },
  { c: '27000', name: 'Diamonds' },
  { c: '28888', name: 'Building materials' },
  { c: '28999', name: 'Other non-metallic minerals' },
];
const BY_C = {}; MINERALS.forEach(m => BY_C[m.c] = m);
const BUILD_SUB = [
  { c: '28010', name: 'Granite or norite' },
  { c: '28011', name: 'Lime and limestone' },
  { c: '28889', name: 'Other building materials' },
];
const RELEVANCE = 'Sector relevance: gold, platinum and coal miners — Sibanye, AngloGold, Harmony, Implats.';

function item(pref, c) {
  const it = Store.byKey.get(PUB + ':' + pref + c);
  // Discontinued series (they stop before the latest period; e.g. SA nickel/diamonds end in 2002) exist in the file but must never be
  // treated as "the latest" - they are ignored here and reported as unused in the coverage footer.
  if (!it || it.lastP !== Store.pubs.find(p => p.code === PUB).last) return null;
  Kit.coverage.use(TAB, it.key);
  return it;
}
const lastN = (it, from, n) => {              // sum of n values ending `from` periods before the latest; null if incomplete
  if (!it) return null; const L = it.v.length; let s = 0;
  for (let i = L - 1 - from - n + 1; i <= L - 1 - from; i++) { if (i < 0 || it.v[i] == null) return null; s += it.v[i]; }
  return s;
};
const pctChg = (a, b) => (a == null || b == null || b === 0) ? null : (a - b) / Math.abs(b) * 100;

function createMining() {
  const hs = Kit.hashState.read(TAB);
  const st = {
    basis: hs.get('basis') === 'nsa' ? 'nsa' : 'sa',
    range: hs.get('r') || '10', fromYear: hs.get('from') || '',
    sel: (hs.get('m') ? hs.get('m').split(',').filter(c => BY_C[c]) : ['20000', '24000', '23023', '21000', '23010']).slice(0, MAX_SEL),
    tf: ['level', 'pct', 'yoy', 'rebase'].includes(hs.get('tf')) ? hs.get('tf') : 'level',
    vm: ['m', '12m', 'yoy'].includes(hs.get('vm')) ? hs.get('vm') : '12m',
    cp: hs.get('cp') || '',
  };
  const pub = Store.pubs.find(p => p.code === PUB);
  const colors = new Map();
  function assign() {
    colors.forEach((_, c) => { if (!st.sel.includes(c)) colors.delete(c); });
    st.sel.forEach(c => { if (!colors.has(c)) { const used = new Set(colors.values()); let i = 0; while (used.has(i)) i++; colors.set(c, i); } });
  }
  const colorOf = c => PALETTE[colors.get(c)];
  function save() {
    Kit.hashState.write(TAB, { basis: st.basis === 'sa' ? '' : 'nsa', r: st.fromYear ? '' : (st.range === '10' ? '' : st.range), from: st.fromYear,
      m: st.sel.join(','), tf: st.tf === 'level' ? '' : st.tf, vm: st.vm === '12m' ? '' : st.vm, cp: st.cp });
  }

  const X = Store.pubX[PUB];
  const x1 = X[X.length - 1];
  function xr() {
    const all = X[0];
    if (st.fromYear && +st.fromYear > 1900) return [Math.max(all, +st.fromYear), x1];
    return [st.range === 'all' ? all : Math.max(all, x1 - (+st.range)), x1];
  }
  const cs = [];                       // live charts
  const kill = () => { while (cs.length) cs.pop().destroy(); };

  // ---------- series lookups honouring the basis toggle
  function vol(c) {                    // volume index for the chosen basis; falls back to actual when no SA series exists
    const a = item('FMP', c), sa = item('FMS', c);
    if (st.basis === 'sa' && sa) return { it: sa, fb: false, sa: true };
    return { it: a, fb: st.basis === 'sa' && !sa, sa: false };
  }
  function valSeries(c) {
    const a = item('MVK', c), sa = item('MVS', c);
    if (st.basis === 'sa' && sa) return { it: sa, sa: true };
    return { it: a, sa: false };
  }
  // Series reachable through the basis toggle count as used even while the other basis is showing.
  // Discontinued series (they stop before the latest period) are not drawn anywhere, so they are NOT primed.
  MINERALS.concat(BUILD_SUB).forEach(m => ['FMP', 'FMS', 'MVK', 'MVS'].forEach(pref => item(pref, m.c)));

  const root = h('div');
  root.appendChild(h('h3', { class: 'serif', style: 'margin:0;font-size:18px', text: 'Resources — mining' }));
  const nxt = Kit.sched.next(PUB);
  root.appendChild(h('div', { class: 'page-sub', text: 'Statistics South Africa P2041 · latest ' + fmt.period(pub.last) + (nxt ? ' · next release ' + Kit.sched.dateText(nxt.date) + ' ' + nxt.time + ' (' + fmt.period(nxt.period) + ')' : '') + ' · volume indices 2019 = 100' }));
  root.appendChild(h('div', { class: 'relevance', text: RELEVANCE }));

  // ---------- controls (one row above the content they scope)
  const basisSeg = Kit.segmented([{ v: 'sa', label: 'Seasonally adjusted', title: 'Month-on-month moves are only meaningful on SA series' }, { v: 'nsa', label: 'Actual' }], st.basis, v => { st.basis = v; renderAll(); save(); });
  const rangeSeg = Kit.segmented([{ v: '3', label: '3Y' }, { v: '5', label: '5Y' }, { v: '10', label: '10Y' }, { v: '25', label: '25Y' }, { v: 'all', label: 'All' }], st.fromYear ? '' : st.range, v => { st.range = v; st.fromYear = ''; fromIn.value = ''; renderAll(); save(); });
  const fromIn = h('input', { type: 'number', min: '1980', max: '2100', placeholder: 'from year', style: 'width:92px', 'aria-label': 'Start year', value: st.fromYear });
  fromIn.addEventListener('change', () => { st.fromYear = fromIn.value; rangeSeg.setValue(st.fromYear ? '' : st.range); renderAll(); save(); });
  const chipOpts = MINERALS.map(m => ({ v: m.c, label: m.name }));
  const chips = Kit.chips(chipOpts, st.sel, colorOf, c => {
    const i = st.sel.indexOf(c);
    if (i >= 0) { if (st.sel.length === 1) return; st.sel.splice(i, 1); }
    else { if (st.sel.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' series — remove one first'); return; } st.sel.push(c); }
    assign(); chips.set(st.sel); renderAll(); save();
  });
  root.appendChild(h('div', { class: 'filters', style: 'margin-bottom:6px' }, h('label', { class: 'lbl', text: 'Basis' }), basisSeg, h('label', { class: 'lbl', style: 'margin-left:10px', text: 'All charts', title: 'Sets the range of every chart on this page; each chart also has its own range buttons' }), rangeSeg, fromIn));
  root.appendChild(h('div', { style: 'margin-bottom:12px' }, h('div', { class: 'sub', style: 'margin-bottom:4px', text: 'Minerals shown in the charts (up to ' + MAX_SEL + '). Search to add one, or use the + button in the table; click a table row for its full history.' }), chips));

  const kpiHost = h('div'), volCard = h('div', { class: 'card' }), contCard = h('div', { class: 'card' });
  const tableCard = h('div', { class: 'card', style: 'margin-top:12px' });
  const valCard = h('div', { class: 'card' }), priceCard = h('div', { class: 'card' }), bldCard = h('div', { class: 'card', style: 'margin-top:12px' });
  const footHost = h('div', { class: 'foot' });
  root.appendChild(kpiHost);
  root.appendChild(h('div', { class: 'grid2' }, volCard, contCard));
  root.appendChild(tableCard);
  root.appendChild(h('div', { class: 'grid2' }, valCard, priceCard));
  root.appendChild(bldCard);
  root.appendChild(footHost);
  Kit.freshOrder(root);

  const head = (title, sub, tools) => h('div', {}, h('div', { class: 'card-head' }, h('h3', { text: title }), tools ? h('div', { class: 'tools' }, tools) : null), sub ? h('div', { class: 'sub', text: sub }) : null);
  const pctFmt = (v) => fmt.signed(v, 2, '%');

  // ---------- KPI strip
  function renderKpis() {
    clear(kpiHost);
    const tiles = ['20000', '20001', '24000', '23023', '21000'].map(c => {
      const v = vol(c), a = item('FMP', c), sa = item('FMS', c) || a;
      const mm = pctChg(sa.last, sa.v[sa.v.length - 2]), yy = pctChg(a.last, a.v[a.v.length - 13]);
      return { label: BY_C[c].name + ' · ' + fmt.period(v.it.lastP), value: fmt.num(v.it.last),
        delta: [{ text: 'm/m ' }, { text: fmt.signed(mm, 1, '%'), bold: true }, { text: ' · y/y ' }, { text: fmt.signed(yy, 1, '%'), bold: true }],
        note: 'Volume index' + (v.sa ? ', SA' : v.fb ? ', actual †' : ', actual'), spark: v.it.v.slice(-60) };
    });
    const tot = item('MVK', '20000'), t12 = lastN(tot, 0, 12), p12 = lastN(tot, 12, 12);
    tiles.push({ label: 'Sales value, last 12 months', value: 'R ' + fmt.fixed(t12 / 1000, 0) + ' bn', delta: [{ text: 'vs prior 12m ' }, { text: fmt.signed(pctChg(t12, p12), 1, '%'), bold: true }], note: 'Total incl. gold, current prices' });
    kpiHost.appendChild(h('div', { class: 'card' }, head('Headline', 'm/m is on seasonally adjusted series; y/y compares actual with a year earlier.'), Kit.kpiStrip(tiles)));
  }

  // ---------- production volume chart
  function renderVolume() {
    clear(volCard);
    const [x0, xe] = xr();
    const tfSeg = Kit.segmented([{ v: 'level', label: 'Level' }, { v: 'pct', label: '% m/m', title: '% vs prior month' }, { v: 'yoy', label: '% y/y' }, { v: 'rebase', label: 'Rebased' }], st.tf, v => { st.tf = v; renderVolume(); save(); });
    volCard.appendChild(head('Production volume', 'Volume index, 2019 = 100', tfSeg));
    const fbs = [];
    const series = st.sel.map(c => {
      const v = vol(c); if (v.fb) fbs.push(BY_C[c].name);
      return { key: c, name: BY_C[c].name + (v.sa ? ' (SA)' : v.fb ? ' †' : ''), color: colorOf(c), it: v.it };
    }).filter(e => e.it);
    if (fbs.length) volCard.appendChild(h('div', { class: 'note' }, '† No seasonally adjusted series is published for ' + fbs.join(', ') + ' — actual values shown.'));
    const zero = st.tf === 'pct' || st.tf === 'yoy', ref = st.tf === 'rebase' ? 100 : null;
    const unit = st.tf === 'level' ? 'Index, 2019 = 100' : st.tf === 'pct' ? '% change on prior month' : st.tf === 'yoy' ? '% change on a year earlier' : 'Rebased, start of range = 100';
    cs.push(Kit.linePanel(volCard, { entries: series, tf: st.tf, x0, x1: xe, height: 300, unit, ref,
      label: 'Mining production volume: ' + series.map(s => s.name).join(', '), valFmt: (v) => (st.tf === 'pct' || st.tf === 'yoy') ? pctFmt(v) : fmt.num(v) }));
  }

  // ---------- contribution to y/y growth
  function weights() {
    const yr = (it) => { let sum = 0; for (let i = 0; i < it.v.length; i++) if (it.periods[it.s + i].startsWith('2019-')) sum += it.v[i] || 0; return sum; };
    const tot = yr(item('MVK', '20000')), w = {};
    MINERALS.forEach(m => { if (m.total) return; const v = item('MVK', m.c); w[m.c] = v ? yr(v) / tot : 0; });
    return w;
  }
  function renderContribution() {
    clear(contCard);
    const periods = pub.last ? Store.byKey.get(PUB + ':FMP20000').periods : [];
    const lastIdx = periods.length - 1;
    const opts = []; for (let i = lastIdx; i >= Math.max(12, lastIdx - 59); i--) opts.push(periods[i]);
    if (!st.cp || opts.indexOf(st.cp) < 0) st.cp = opts[0];
    const sel = h('select', { 'aria-label': 'Month' }, opts.map(p => { const o = h('option', { value: p, text: fmt.period(p) }); if (p === st.cp) o.selected = true; return o; }));
    sel.addEventListener('change', () => { st.cp = sel.value; renderContribution(); save(); });
    contCard.appendChild(head('What drove total volume growth', 'Contribution to the y/y change in the total volume index (gold included), percentage points', sel));
    const i = periods.indexOf(st.cp), W = weights();
    const tot = item('FMP', '20000'), T = Store.full(tot);
    const rows = [];
    let sum = 0;
    MINERALS.filter(m => !m.total && W[m.c] > 0).forEach(m => {
      const A = Store.full(item('FMP', m.c)), a = A[i], b = A[i - 12];
      if (a == null || b == null || T[i - 12] == null) return;
      const c = W[m.c] * (a - b) / T[i - 12] * 100; sum += c;
      rows.push({ label: m.name, value: c, tip: [[fmt.signed(c, 2, ' pp'), 'contribution to total y/y'], [fmt.num(a) + ' vs ' + fmt.num(b), 'index now vs a year earlier'], [fmt.fixed(W[m.c] * 100, 1) + '%', '2019 sales-value weight']] });
    });
    rows.sort((x, y) => y.value - x.value);
    const totalYy = T[i] != null && T[i - 12] != null ? (T[i] / T[i - 12] - 1) * 100 : null;
    const out = [{ label: 'Total volume y/y', value: totalYy, emph: true, tip: [[fmt.signed(totalYy, 2, '%'), 'published index, ' + fmt.num(T[i]) + ' vs ' + fmt.num(T[i - 12])]] }].concat(rows);
    if (totalYy != null) out.push({ label: 'Weights / rounding', value: totalYy - sum, tip: [[fmt.signed(totalYy - sum, 2, ' pp'), 'part of the published change the proxy weights do not explain']] });
    cs.push(Kit.hbar(contCard, { rows: out, fmtVal: v => fmt.signed(v, 1), ariaLabel: 'Contribution to total mining volume growth, ' + fmt.period(st.cp), rowH: 28 }));
    contCard.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Indicative: StatsSA does not publish index weights, so each mineral is weighted by its share of 2019 sales value (diamonds have no value series and carry no weight). The last bar is what those weights cannot explain.' }));
  }

  // ---------- mineral table
  function mineralRows() {
    const totV12 = lastN(item('MVK', '20000'), 0, 12);
    const rowFor = (m, child) => {
      const a = item('FMP', m.c), sa = item('FMS', m.c), v = item('MVK', m.c), basisV = vol(m.c);
      const src = sa || a, r = { m, child: !!child };
      if (a) {
        r.vol = basisV.it.last; r.volSa = basisV.sa; r.fb = basisV.fb;
        r.mm = sa ? pctChg(sa.last, sa.v[sa.v.length - 2]) : null;
        const a3 = lastN(sa, 0, 3), b3 = lastN(sa, 3, 3); r.m3 = sa ? pctChg(a3, b3) : null;
        r.yoy = pctChg(a.last, a.v[a.v.length - 13]);
        r.spark = basisV.it.v.slice(-60);
      }
      if (v) {
        r.v12 = lastN(v, 0, 12); r.vp12 = lastN(v, 12, 12);
        r.vyoy = pctChg(r.v12, r.vp12); r.share = totV12 ? r.v12 / totV12 * 100 : null;
        if (a) {
          const vm = lastN(a, 0, 12) / 12, pm = lastN(a, 12, 12) / 12;
          r.price = pctChg(r.v12 / vm, r.vp12 / pm);
        }
      }
      return r;
    };
    const tops = MINERALS.filter(m => m.total).map(m => rowFor(m));
    const mins = MINERALS.filter(m => !m.total).map(m => rowFor(m)).sort((x, y) => (y.v12 == null ? -1 : y.v12) - (x.v12 == null ? -1 : x.v12));
    const out = tops.slice();
    mins.forEach(r => { out.push(r); if (r.m.c === '28888') BUILD_SUB.forEach(s => out.push(rowFor(s, true))); });
    return out;
  }
  function renderTable() {
    clear(tableCard);
    tableCard.appendChild(head('Minerals at a glance', 'Latest ' + fmt.period(pub.last) + '. Volume on the ' + (st.basis === 'sa' ? 'seasonally adjusted basis († = actual, none published)' : 'actual basis') + '; m/m and 3m/3m need SA; sales over the last 12 months.'));
    const sg = (v, pp) => v == null ? '–' : fmt.signed(v, 1, '%');
    const cols = [
      { key: 'name', label: 'Mineral', cls: 'l lab', nosort: true, render: r => h('div', { class: 't', title: r.m.name, text: r.m.name }) },
      { key: 'vol', label: 'Volume idx', nosort: true, title: 'Volume index, 2019 = 100', render: r => r.vol == null ? '–' : fmt.num(r.vol) + (r.fb ? ' †' : '') },
      { key: 'mm', label: 'm/m', nosort: true, title: 'Seasonally adjusted, vs prior month', render: r => sg(r.mm) },
      { key: 'm3', label: '3m/3m', nosort: true, title: 'Seasonally adjusted, average of last 3 months vs the 3 before', render: r => sg(r.m3) },
      { key: 'yoy', label: 'y/y', nosort: true, title: 'Actual, vs a year earlier', render: r => sg(r.yoy) },
      { key: 'spark', label: '5-yr trend', nosort: true, cls: 'hide-s', render: r => r.spark ? Kit.spark(r.spark) : '' },
      { key: 'v12', label: 'Sales 12m', nosort: true, title: 'Sales value, last 12 months, R billion', render: r => r.v12 == null ? '–' : 'R ' + fmt.fixed(r.v12 / 1000, 1) + ' bn' },
      { key: 'vyoy', label: 'Sales y/y', nosort: true, title: 'Last 12 months vs the previous 12', render: r => sg(r.vyoy) },
      { key: 'share', label: 'Share', nosort: true, cls: 'hide-s', title: 'Share of total sales value (12m)', render: r => r.share == null ? '–' : r.share < 0.1 ? '<0.1%' : fmt.fixed(r.share, 1) + '%' },
      { key: 'price', label: 'Price/mix y/y', nosort: true, cls: 'hide-s', title: '12-month sales value per unit of average volume, vs a year earlier. A proxy: it mixes price, grade and product mix.', render: r => sg(r.price) },
    ];
    const data = mineralRows();
    const t = Kit.table(cols, { sortKey: null, page: 40, isSel: r => !r.child && st.sel.includes(r.m.c), canToggle: r => !r.child, onToggle: r => toggleMineral(r.m.c),
      canOpen: r => !!(item('FMP', r.m.c) || item('MVK', r.m.c)),
      onOpen: r => Kit.openSeries({ title: r.m.name, sub: 'Mining', entries: [{ name: 'Volume index', it: item('FMP', r.m.c) }, { name: 'Volume index (seasonally adjusted)', it: item('FMS', r.m.c) }],
        more: [{ title: 'Sales value, R’000', entries: [{ name: 'Sales value', it: item('MVK', r.m.c) }, { name: 'Sales value (seasonally adjusted)', it: item('MVS', r.m.c) }] }],
        toggle: r.child ? null : { isOn: () => st.sel.includes(r.m.c), fn: () => toggleMineral(r.m.c), offLabel: 'Add to the volume charts', onLabel: 'Remove from the volume charts' } }) });
    t.set(data);
    tableCard.appendChild(t.el);
    t.el.querySelectorAll('tbody tr').forEach((tr, i) => { if (data[i] && data[i].child) tr.classList.add('child'); if (data[i] && data[i].m.total) tr.classList.add('total'); });
    t.el.style.maxHeight = 'none';
  }
  function toggleMineral(c) {
    const i = st.sel.indexOf(c);
    if (i >= 0) { if (st.sel.length === 1) return; st.sel.splice(i, 1); }
    else { if (st.sel.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' series — remove one first'); return; } st.sel.push(c); }
    assign(); chips.set(st.sel); renderAll(); save();
  }

  // ---------- sales value
  function valView(it, name, mode) {
    let base = it;
    if (mode !== 'm') base = Store.derive(it, it.key + ':12m', name, Store.rolling(Store.full(it), 12, 'sum'));
    return base;
  }
  function renderValue() {
    clear(valCard);
    const [x0, xe] = xr();
    const vmSeg = Kit.segmented([{ v: 'm', label: 'Monthly' }, { v: '12m', label: '12-month sum' }, { v: 'yoy', label: '12m % y/y' }], st.vm, v => { st.vm = v; renderValue(); save(); });
    valCard.appendChild(head('Sales value', 'Mineral sales, R million, current prices', vmSeg));
    const none = [], series = [];
    st.sel.forEach(c => {
      const v = valSeries(c); if (!v.it) { none.push(BY_C[c].name); return; }
      const base = valView(v.it, BY_C[c].name, st.vm);
      if (base) series.push({ key: c, name: BY_C[c].name + (v.sa ? ' (SA)' : ''), color: colorOf(c), it: base });
    });
    if (none.length) valCard.appendChild(h('div', { class: 'note' }, 'No sales-value series is published for ' + none.join(', ') + '.'));
    if (!series.length) { valCard.appendChild(h('div', { class: 'empty', text: 'None of the selected minerals has a sales-value series.' })); return; }
    cs.push(Kit.linePanel(valCard, { entries: series, tf: st.vm === 'yoy' ? 'yoy' : 'level', x0, x1: xe, height: 300, unit: st.vm === 'm' ? 'R million per month' : st.vm === '12m' ? 'R million, trailing 12 months' : '% change in trailing-12-month sales on a year earlier',
      label: 'Mineral sales value', valFmt: v => st.vm === 'yoy' ? pctFmt(v) : fmt.num(v) }));
  }

  // ---------- implied price proxy
  function renderPrice() {
    clear(priceCard);
    const [x0, xe] = xr();
    priceCard.appendChild(head('Implied price proxy', 'Trailing 12-month sales value ÷ average volume index, rebased to the start of the range = 100. Mixes price, grade and product mix — a direction signal, not a price.'));
    const series = [], none = [];
    st.sel.forEach(c => {
      const v = item('MVK', c), a = item('FMP', c);
      if (!v || !a) { none.push(BY_C[c].name); return; }
      const num = Store.rolling(Store.full(v), 12, 'sum'), den = Store.rolling(Store.full(a), 12, 'mean');
      const ratio = num.map((x, i) => x == null || den[i] == null || den[i] === 0 ? null : x / den[i]);
      const d = Store.derive(v, v.key + ':px', BY_C[c].name, ratio, { unit: 'R million per index point' });
      if (!d) return;
      series.push({ key: c, name: BY_C[c].name, color: colorOf(c), it: d });
    });
    if (none.length) priceCard.appendChild(h('div', { class: 'note' }, 'Not available for ' + none.join(', ') + ' (no value series).'));
    if (!series.length) { priceCard.appendChild(h('div', { class: 'empty', text: 'Select at least one mineral that has both a volume and a sales-value series.' })); return; }
    cs.push(Kit.linePanel(priceCard, { entries: series, tf: 'rebase', x0, x1: xe, height: 300, area: false, label: 'Implied price proxy, rebased', unit: 'Rebased, start of range = 100', tfSwitch: false,
      valFmt: v => fmt.fixed(v, 1) }));
  }

  // ---------- building materials breakdown
  function renderBuilding() {
    clear(bldCard);
    const [x0, xe] = xr();
    bldCard.appendChild(head('Building materials breakdown', 'Sales value, R million, trailing 12 months — granite or norite, lime and limestone, other building materials against the group total.'));
    const set = [{ c: '28888', name: 'Building materials (total)', slot: 0 }].concat(BUILD_SUB.map((s, i) => ({ c: s.c, name: s.name, slot: i + 1 })));
    const series = set.map(m => {
      const it = item('MVK', m.c); const d = Store.derive(it, it.key + ':12b', m.name, Store.rolling(Store.full(it), 12, 'sum'));
      return { key: m.c, name: m.name, color: PALETTE[m.slot], it: d };
    });
    cs.push(Kit.linePanel(bldCard, { entries: series, tf: 'level', x0, x1: xe, height: 240, unit: 'R million, trailing 12 months', label: 'Building materials sales value', valFmt: v => fmt.num(v) }));
  }

  function renderFoot() {
    clear(footHost);
    const cov = Kit.coverage.report(TAB, PUB);
    const d = h('details', {}, h('summary', { text: 'Coverage: this tab draws on ' + cov.used + ' of ' + cov.total + ' P2041 series' + (cov.unused.length ? ' — ' + cov.unused.length + ' not shown' : ' — all of them') }));
    if (cov.unused.length) {
      d.appendChild(h('div', { style: 'margin-top:4px' }, 'Not shown here (discontinued seasonally adjusted series that stop in 2002; still in the ', h('a', { href: '#/explorer?pub=P2041', text: 'Series Explorer' }), '):'));
      d.appendChild(h('ul', { style: 'margin:4px 0 0 18px;padding:0' }, cov.unused.map(it => h('li', { text: it.label + ' [' + it.id + '] ' + fmt.period(it.firstP) + ' – ' + fmt.period(it.lastP) }))));
    }
    d.appendChild(h('div', { style: 'margin-top:6px', text: 'Contribution weights are an approximation (see that panel). Values and volume indices are StatsSA P2041; nothing is estimated except where a panel says so.' }));
    footHost.appendChild(d);
  }

  function renderAll() { Kit.keepScroll(renderAllBody); }
  function renderAllBody() {
    kill(); assign();
    renderKpis(); renderVolume(); renderContribution(); renderTable(); renderValue(); renderPrice(); renderBuilding(); renderFoot();
  }
  document.addEventListener('themechange', () => cs.forEach(c => c.redraw && c.redraw()));
  assign(); renderAll();
  return { el: root, destroy() { kill(); } };
}
function create() {
  const hs = Kit.hashState.read(TAB);
  let v = hs.get('v') === 'agri' ? 'agri' : 'mining', inst = null;
  const root = h('div'), host = h('div'), xs = [], cs = [], xstate = {};
  const kill = () => { while (cs.length) cs.pop().destroy(); while (xs.length) xs.pop().destroy(); };
  const seg = Kit.segmented([{ v: 'mining', label: 'Mining' }, { v: 'agri', label: 'Agriculture' }], v, x => { v = x; Kit.hashState.write(TAB, x === 'agri' ? { v: 'agri' } : {}); draw(); });
  function draw() {
    if (inst) inst.destroy(); kill(); clear(host);
    if (v === 'mining') { inst = createMining(); host.appendChild(inst.el); const f = inst.el.querySelector('.filters'); if (f) f.insertBefore(seg, f.firstChild); return; }
    const sh = Kit.tabShell({ title: 'Resources \u2014 agriculture', pubs: ['P1101'], relevance: 'Use: farm income, costs and jobs \u2014 agribusiness, food producers and rural lenders (Astral, RCL, Tongaat, Land Bank exposure).' });
    const body = h('div'), st = { range: '25', fromYear: '' };
    const rc = Kit.rangeCtl(st, () => draw2(), { presets: [{ v: '5', label: '5Y' }, { v: '10', label: '10Y' }, { v: 'all', label: 'All' }] });
    sh.appendChild(h('div', { class: 'filters', style: 'margin-bottom:6px' }, seg, h('label', { class: 'lbl', style: 'margin-left:10px', text: 'All charts', title: 'Sets the range of every chart on this page; each chart also has its own range buttons' }), rc.el)); sh.appendChild(body); host.appendChild(sh);
    const draw2 = () => { kill(); clear(body); Extras.agriculture({ tab: TAB, body, cs, xr: code => { const X = Store.pubX[code]; return rc.xr(X[0], X[X.length - 1]); }, redo: draw2, state: xstate, browsers: xs }); };
    draw2(); inst = { destroy() { kill(); } };
  }
  root.appendChild(host);
  draw();
  return { el: root, destroy() { if (inst) inst.destroy(); kill(); } };
}
function coverage() { Kit.lookup(TAB, PUB).markAll(); Kit.lookup(TAB, 'P1101', { includeDiscontinued: true }).markAll(); }   // every live P2041 series is reachable through the basis toggle and the mineral selection
window.Resources = { create, coverage };
})();
