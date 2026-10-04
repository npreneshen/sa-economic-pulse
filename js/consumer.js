/* consumer.js - Consumer tab: Retail (P6242.1), Motor trade (P6343.2), Wholesale (P6141.2).
   All three publish sales (R million) split by dealer type / activity, at constant and current prices, actual and
   seasonally adjusted. Wholesale dealer types are current-price, actual only. One generic section builder serves all three. */
(function () {
'use strict';
const { h, clear, fmt, time } = Kit;
const Store = Kit.store;
const TAB = 'consumer', MAX_SEL = 8;
const SECTIONS = [
  { v: 'ret', label: 'Retail', pub: 'P6242.1', title: 'Retail trade sales', noun: 'dealer type' },
  { v: 'mot', label: 'Motor trade', pub: 'P6343.2', title: 'Motor trade sales', noun: 'activity' },
  { v: 'who', label: 'Wholesale', pub: 'P6141.2', title: 'Wholesale trade sales', noun: 'dealer type' },
];
const RELEVANCE = 'Sector relevance: retailers (Shoprite, Woolworths, Pick n Pay, TFG), restaurants and fast food (Famous Brands, Spur), auto dealers and importers, and distributors.';
const PAL = Kit.PALETTE;

function coverage() { SECTIONS.forEach(s => Kit.lookup(TAB, s.pub).markAll()); Kit.lookup(TAB, 'P6420').markAll(); }
const nice = n => { const t = n.replace(/^Income from (the sales of )?/i, '').replace(/^Retailers (of|in) /i, '').replace(/^Wholesale trade (on a |in )?/i, ''); return t.charAt(0).toUpperCase() + t.slice(1); };

function buildGroups(L) {
  const groups = new Map(), totals = {};
  L.items.forEach(it => {
    const k = it.price + '|' + (it.adj === 'sa' ? 'sa' : 'nsa');
    if (it.measure === 'Total') { totals[k] = it; return; }
    if (!groups.has(it.name)) groups.set(it.name, { key: it.name, name: nice(it.name), full: it.name, items: {} });
    groups.get(it.name).items[k] = it;
  });
  return { groups: Array.from(groups.values()), total: { key: 'TOTAL', name: 'Total', full: 'Total', items: totals } };
}

function create() {
  const hs = Kit.hashState.read(TAB);
  const st = {
    v: SECTIONS.some(s => s.v === hs.get('v')) || hs.get('v') === 'fnb' ? hs.get('v') : 'ret',
    basis: hs.get('basis') === 'nsa' ? 'nsa' : 'sa', price: hs.get('pr') === 'current' ? 'current' : 'constant',
    range: hs.get('r') || '10', fromYear: hs.get('from') || '', tf: ['level', 'pct', 'yoy', 'rebase'].includes(hs.get('tf')) ? hs.get('tf') : 'yoy',
    sel: {}, cp: hs.get('cp') || '',
  };
  SECTIONS.forEach(s => { const q = hs.get('m_' + s.v); st.sel[s.v] = q ? q.split('|') : null; });
  const L = {}; SECTIONS.forEach(s => { L[s.v] = Kit.lookup(TAB, s.pub); });
  const G = {}; SECTIONS.forEach(s => { G[s.v] = buildGroups(L[s.v]); });
  SECTIONS.forEach(s => { if (!st.sel[s.v]) st.sel[s.v] = ['TOTAL'].concat(G[s.v].groups.slice(0, 3).map(g => g.key)); });
  const colors = {}; SECTIONS.forEach(s => { colors[s.v] = Kit.colorMap(PAL); });
  const cs = [], xb = []; const xstate = {}; const kill = () => { while (cs.length) cs.pop().destroy(); while (xb.length) xb.pop().destroy(); };
  function save() {
    const o = { v: st.v === 'ret' ? '' : st.v, basis: st.basis === 'sa' ? '' : 'nsa', pr: st.price === 'constant' ? '' : 'current', r: st.fromYear ? '' : (st.range === '10' ? '' : st.range), from: st.fromYear, tf: st.tf === 'yoy' ? '' : st.tf, cp: st.cp };
    SECTIONS.forEach(s => { o['m_' + s.v] = st.sel[s.v].join('|'); });
    Kit.hashState.write(TAB, o);
  }
  const root = Kit.tabShell({ title: 'Consumer', pubs: SECTIONS.map(s => s.pub).concat(['P6420']), relevance: RELEVANCE });
  const body = h('div'); Kit.freshOrder(body);                          // fresh, frequently updated charts first; annual / pre-2025 ones below
  const rangeCtl = Kit.rangeCtl(st, () => render());
  const secNav = Kit.segmented(SECTIONS.map(s => ({ v: s.v, label: s.label })).concat([{ v: 'fnb', label: 'Food & beverages' }]), st.v, v => { st.v = v; render(); save(); });
  root.appendChild(h('div', { class: 'filters', style: 'margin-bottom:8px' }, secNav, h('label', { class: 'lbl', style: 'margin-left:10px', text: 'All charts', title: 'Sets the range of every chart on this page; each chart also has its own range buttons' }), rangeCtl.el));
  root.appendChild(body);

  /* ---- cross-sector strip (constant-price totals; wholesale shown at current prices only if no constant total) */
  function crossStrip() {
    const tiles = SECTIONS.map(s => {
      const T = G[s.v].total.items, a = T['constant|nsa'], sa = T['constant|sa'];
      const m = Store.metrics(a, sa);
      return { label: s.label + ' · real sales · ' + fmt.period(m.lastP), value: fmt.bn(m.last), delta: [{ text: 'm/m ' }, { text: fmt.sg(m.mm), bold: true }, { text: ' · y/y ' }, { text: fmt.sg(m.yoy), bold: true }], note: 'Constant prices, ' + (sa ? 'SA' : 'actual'), spark: m.spark };
    });
    return h('div', { class: 'card' }, Kit.cardHead('Real sales across the consumer chain', 'Total sales at constant prices; m/m on seasonally adjusted series, y/y on actual series.'), Kit.kpiStrip(tiles));
  }

  function pick(g, price) {                                     // basis-aware item, falling back to actual when no SA series exists
    const sa = g.items[price + '|sa'], a = g.items[price + '|nsa'];
    if (st.basis === 'sa' && sa) return { it: sa, sa: true, fb: false };
    return { it: a || sa || null, sa: false, fb: st.basis === 'sa' && !sa && !!a };
  }

  function renderSection(sec) {
    const { groups, total } = G[sec.v], all = [total].concat(groups), byKey = {}; all.forEach(g => byKey[g.key] = g);
    const X = Store.pubX[sec.pub], [x0, x1] = rangeCtl.xr(X[0], X[X.length - 1]);
    const sel = st.sel[sec.v].filter(k => byKey[k]); st.sel[sec.v] = sel; const cm = colors[sec.v]; cm.assign(sel);
    const hasConst = !!(groups.length && groups[0].items['constant|nsa']);
    const price = hasConst ? st.price : 'current';

    // controls
    const pSeg = hasConst ? Kit.segmented([{ v: 'constant', label: 'Constant prices' }, { v: 'current', label: 'Current prices' }], st.price, v => { st.price = v; render(); save(); }) : null;
    const bSeg = Kit.segmented([{ v: 'sa', label: 'Seasonally adjusted' }, { v: 'nsa', label: 'Actual' }], st.basis, v => { st.basis = v; render(); save(); });
    body.appendChild(h('div', { class: 'filters', style: 'margin-bottom:6px' }, h('label', { class: 'lbl', text: 'Basis' }), bSeg, pSeg ? h('label', { class: 'lbl', style: 'margin-left:10px', text: 'Prices' }) : null, pSeg));
    if (!hasConst) body.appendChild(h('div', { class: 'note' }, 'Wholesale dealer types are published at current prices and actual (not seasonally adjusted) values only; the total is also available at constant prices and seasonally adjusted.'));
    const chips = Kit.chips(all.map(g => ({ v: g.key, label: g.name })), sel, k => cm.of(k), k => toggle(sec.v, k));
    body.appendChild(h('div', { style: 'margin-bottom:12px' }, h('div', { class: 'sub', style: 'margin-bottom:4px', text: 'Shown in the charts (up to ' + MAX_SEL + '). Click a table row to add or remove.' }), chips));

    // headline
    const tm = Store.metrics(total.items[price + '|nsa'], total.items[price + '|sa']);
    if (st.basis === 'nsa') { tm.last = total.items[price + '|nsa'].last; tm.sa = false; tm.spark = total.items[price + '|nsa'].v.slice(-60); }
    const cur12 = Store.sumLast(total.items['current|nsa'], 0, 12), curP12 = Store.sumLast(total.items['current|nsa'], 12, 12);
    const defl = (c, k) => (c == null || k == null) ? null : ((1 + c / 100) / (1 + k / 100) - 1) * 100;
    const mCur = Store.metrics(total.items['current|nsa'], total.items['current|sa']), mCon = hasConst ? Store.metrics(total.items['constant|nsa'], total.items['constant|sa']) : null;
    const gm = groups.map(g => { const a = g.items[(hasConst ? 'constant' : 'current') + '|nsa']; return { g, m: Store.metrics(a, null) }; }).filter(x => x.m.yoy != null).sort((a, b) => b.m.yoy - a.m.yoy);
    const tiles = [
      { label: 'Total sales · ' + fmt.period(tm.lastP), value: fmt.bn(tm.last), delta: [{ text: 'm/m ' }, { text: fmt.sg(tm.mm), bold: true }, { text: ' · y/y ' }, { text: fmt.sg(tm.yoy), bold: true }], note: (price === 'constant' ? 'Constant prices' : 'Current prices') + (tm.sa ? ', SA' : ', actual'), spark: tm.spark },
      { label: 'Last 12 months', value: fmt.bn(cur12), delta: [{ text: 'vs prior 12m ' }, { text: fmt.sg(Store.pct(cur12, curP12)), bold: true }], note: 'Current prices' },
    ];
    if (mCon) tiles.push({ label: 'Implied price deflator y/y', value: fmt.sg(defl(mCur.yoy, mCon.yoy)), note: 'current ÷ constant sales' });
    if (gm.length) {
      tiles.push({ label: 'Fastest growing', value: gm[0].g.name.length > 28 ? gm[0].g.name.slice(0, 26) + '…' : gm[0].g.name, delta: [{ text: fmt.sg(gm[0].m.yoy), bold: true }, { text: ' y/y' }] });
      const w = gm[gm.length - 1]; tiles.push({ label: 'Weakest', value: w.g.name.length > 28 ? w.g.name.slice(0, 26) + '…' : w.g.name, delta: [{ text: fmt.sg(w.m.yoy), bold: true }, { text: ' y/y' }] });
    }
    body.appendChild(h('div', { class: 'card' }, Kit.cardHead(sec.title, 'Latest ' + fmt.period(Store.pub(sec.pub).last) + '. Group growth rates are year-on-year, ' + (hasConst ? 'at constant prices.' : 'at current prices.')), Kit.kpiStrip(tiles)));

    // charts
    const c1 = h('div', { class: 'card' }), c2 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c1, c2));
    const tfSeg = Kit.segmented([{ v: 'level', label: 'Level' }, { v: 'pct', label: '% m/m' }, { v: 'yoy', label: '% y/y' }, { v: 'rebase', label: 'Rebased' }], st.tf, v => { st.tf = v; render(); save(); });
    c1.appendChild(Kit.cardHead('Sales by ' + sec.noun, 'R million per month, ' + (price === 'constant' ? 'constant' : 'current') + ' prices', tfSeg));
    const fbs = [], entries = sel.map(k => { const g = byKey[k], p = pick(g, price); if (p.fb) fbs.push(g.name); return p.it ? { key: k, name: g.name + (p.sa ? ' (SA)' : p.fb ? ' †' : ''), color: cm.of(k), it: p.it } : null; }).filter(Boolean);
    cs.push(Kit.linePanel(c1, { entries, tf: st.tf, x0, x1, height: 300, notes: fbs.length ? ['† No seasonally adjusted series is published for ' + fbs.join(', ') + ' — actual values shown.'] : [] }));

    // contribution
    const li = Store.byKey.get(sec.pub + ':' + total.items[price + '|nsa'].id).periods;
    const lastIdx = li.length - 1, opts = []; for (let i = lastIdx; i >= Math.max(12, lastIdx - 59); i--) opts.push(li[i]);
    if (!st.cp || opts.indexOf(st.cp) < 0) st.cp = opts[0];
    const cpSel = h('select', { 'aria-label': 'Month' }, opts.map(p => { const o = h('option', { value: p, text: fmt.period(p) }); if (p === st.cp) o.selected = true; return o; }));
    cpSel.addEventListener('change', () => { st.cp = cpSel.value; render(); save(); });
    c2.appendChild(Kit.cardHead('What drove total sales growth', 'Contribution of each ' + sec.noun + ' to the y/y change in total sales (actual, ' + price + ' prices), percentage points', cpSel));
    const ix = li.indexOf(st.cp), Tf = Store.full(total.items[price + '|nsa']);
    const parts = groups.map(g => { const a = g.items[price + '|nsa']; if (!a) return null; const F = Store.full(a); return { label: g.name.length > 36 ? g.name.slice(0, 34) + '…' : g.name, cur: F[ix], prev: F[ix - 12], fmtLevel: v => fmt.num(v) }; }).filter(Boolean);
    cs.push(Kit.hbar(c2, { rows: Kit.contribRows({ parts, totalCur: Tf[ix], totalPrev: Tf[ix - 12], totalLabel: 'Total sales y/y', totalTip: 'published total', remainderLabel: 'Not explained' }), fmtVal: v => fmt.signed(v, 1), rowH: 28, ariaLabel: 'Contributions to sales growth' }));
    c2.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Components add up to the total up to rounding and chain-linking; the last bar shows any gap.' }));

    // table
    const tCard = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(tCard);
    tCard.appendChild(Kit.cardHead(sec.title + ' by ' + sec.noun, 'Latest month. Sales at ' + (price === 'constant' ? 'constant' : 'current') + ' prices; share and deflator use current vs constant sales.'));
    const rows = all.map(g => {
      const p = pick(g, price), a = g.items[price + '|nsa'], sa = g.items[price + '|sa'], m = Store.metrics(a, sa);
      const cur = g.items['current|nsa'], con = g.items['constant|nsa'];
      const yc = cur ? Store.metrics(cur, null).yoy : null, yk = con ? Store.metrics(con, null).yoy : null;
      return { g, last: p.it ? p.it.last : null, fb: p.fb, mm: m.mm, m3: m.m3, yoy: m.yoy, spark: p.it ? p.it.v.slice(-60) : [], s12: Store.sumLast(cur, 0, 12), ycur: yc, defl: defl(yc, yk) };
    });
    rows.forEach(r => { r.share = r.s12 != null && cur12 ? r.s12 / cur12 * 100 : null; });
    const cols = [
      { key: 'name', label: sec.noun.charAt(0).toUpperCase() + sec.noun.slice(1), cls: 'l lab', nosort: true, render: r => h('div', { class: 't', title: r.g.full, text: r.g.name }) },
      { key: 'last', label: 'Latest', nosort: true, title: 'R million', render: r => fmt.num(r.last) + (r.fb ? ' †' : '') },
      { key: 'mm', label: 'm/m', nosort: true, render: r => fmt.sg(r.mm) },
      { key: 'm3', label: '3m/3m', nosort: true, render: r => fmt.sg(r.m3) },
      { key: 'yoy', label: 'y/y', nosort: true, render: r => fmt.sg(r.yoy) },
      { key: 'sp', label: '5-yr trend', nosort: true, cls: 'hide-s', render: r => Kit.spark(r.spark) },
      { key: 'yc', label: 'y/y current', nosort: true, cls: 'hide-s', render: r => fmt.sg(r.ycur) },
      { key: 'df', label: 'Deflator y/y', nosort: true, cls: 'hide-s', title: 'Current-price growth relative to constant-price growth: a proxy for selling-price inflation', render: r => fmt.sg(r.defl) },
      { key: 'sh', label: 'Share', nosort: true, cls: 'hide-s', render: r => r.g.key === 'TOTAL' ? '100%' : (r.share == null ? '–' : fmt.fixed(r.share, 1) + '%') },
    ];
    const t = Kit.table(cols, { sortKey: null, page: 40, isSel: r => sel.includes(r.g.key), onToggle: r => toggle(sec.v, r.g.key),
      onOpen: r => Kit.openSeries({ title: r.g.full || r.g.name, sub: sec.title, entries: [{ name: 'Constant prices', it: r.g.items['constant|nsa'] }, { name: 'Constant prices (SA)', it: r.g.items['constant|sa'] }],
        more: [{ title: 'Current prices', entries: [{ name: 'Current prices', it: r.g.items['current|nsa'] }, { name: 'Current prices (SA)', it: r.g.items['current|sa'] }] }],
        toggle: { isOn: () => sel.includes(r.g.key), fn: () => toggle(sec.v, r.g.key), offLabel: 'Add to the sales chart', onLabel: 'Remove from the sales chart' } }) });
    t.set(rows); tCard.appendChild(t.el); t.el.style.maxHeight = 'none';
    t.el.querySelectorAll('tbody tr').forEach((tr, i) => { if (rows[i].g.key === 'TOTAL') tr.classList.add('total'); });

    // deflator + shares
    const c3 = h('div', { class: 'card' }), c4 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c3, c4));
    c3.appendChild(Kit.cardHead('Implied price deflator', 'Current-price sales ÷ constant-price sales (actual), rebased to the start of the range = 100'));
    const dEntries = sel.map(k => {
      const g = byKey[k], cur = g.items['current|nsa'], con = g.items['constant|nsa']; if (!cur || !con) return null;
      const A = Store.full(cur), B = Store.full(con), d = Store.derive(cur, cur.key + ':defl', g.name, A.map((x, i) => x == null || !B[i] ? null : x / B[i]));
      return d ? { key: k, name: g.name, color: cm.of(k), it: d } : null;
    }).filter(Boolean);
    cs.push(Kit.linePanel(c3, { entries: dEntries, tf: 'rebase', x0, x1, height: 280, emptyText: hasConst ? 'Select a group with both current and constant series.' : 'Constant-price sales are only published for the total in this survey.' }));
    c4.appendChild(Kit.cardHead('Mix of sales', 'Share of the last 12 months of sales at current prices, %'));
    const sh = rows.filter(r => r.g.key !== 'TOTAL' && r.share != null).sort((a, b) => b.share - a.share);
    cs.push(Kit.hbar(c4, { rows: sh.map(r => ({ label: r.g.name.length > 36 ? r.g.name.slice(0, 34) + '…' : r.g.name, value: r.share, tip: [[fmt.fixed(r.share, 1) + '%', 'of total sales'], [fmt.bn(r.s12), 'last 12 months']] })), fmtVal: v => fmt.fixed(v, 1) + '%', rowH: 26, ariaLabel: 'Share of sales' }));
  }
  function toggle(sv, k) {
    const sel = st.sel[sv], i = sel.indexOf(k);
    if (i >= 0) { if (sel.length === 1) return; sel.splice(i, 1); }
    else { if (sel.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' series — remove one first'); return; } sel.push(k); }
    render(); save();
  }
  function render() { Kit.keepScroll(renderBody); }
  function renderBody() {
    kill(); clear(body);
    body.appendChild(crossStrip());
    body.appendChild(h('div', { style: 'height:10px' }));
    if (st.v === 'fnb') Extras.fnb({ tab: TAB, body, cs, xr: code => { const X = Store.pubX[code]; return rangeCtl.xr(X[0], X[X.length - 1]); }, redo: () => { render(); save(); }, state: xstate, browsers: xb });
    else renderSection(SECTIONS.find(s => s.v === st.v));
    body.appendChild(h('div', { class: 'foot', text: 'All series in P6242.1, P6343.2, P6141.2 and P6420 are reachable here through the section, price and basis controls and the group selection.' }));
  }
  document.addEventListener('themechange', () => cs.forEach(c => c.redraw && c.redraw()));
  coverage(); render();
  return { el: root, destroy() { kill(); } };
}
window.Consumer = { create, coverage };
})();
