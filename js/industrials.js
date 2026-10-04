/* industrials.js - Industrials tab: Manufacturing (P3041.2), Capacity utilisation (P3043), Power (P4141).
   P3041.2 ids: MPI<code> volume (actual), MPS<code> volume (SA), MSV<code> sales value R'000 (actual), MSS<code> sales value (SA).
   P3043 ids: MUP<ind3><measure2> (10 utilisation, 20 under-utilisation, 21-25 reasons). */
(function () {
'use strict';
const { h, clear, fmt, time } = Kit;
const Store = Kit.store;
const TAB = 'industrials';
const PUBS = ['P3041.2', 'P3043', 'P4141', 'P7162'];
const MAX_SEL = 8;
const REASONS = [['21', 'Raw materials'], ['22', 'Skilled labour'], ['23', 'Semi- and unskilled labour'], ['24', 'Insufficient demand'], ['25', 'Other reasons']];
const PROV = [['WC', 'Western Cape'], ['EC', 'Eastern Cape'], ['NC', 'Northern Cape'], ['FS', 'Free State'], ['KZ', 'KwaZulu-Natal'], ['NW', 'North West'], ['GT', 'Gauteng'], ['ML', 'Mpumalanga'], ['LP', 'Limpopo']];
const RELEVANCE = 'Sector relevance: industrials, and energy-intensive users of electricity.';

function coverage() { PUBS.forEach(c => Kit.lookup(TAB, c).markAll()); }

function create() {
  const hs = Kit.hashState.read(TAB);
  const MFG = Kit.lookup(TAB, 'P3041.2'), CAP = Kit.lookup(TAB, 'P3043'), PWR = Kit.lookup(TAB, 'P4141');
  const st = {
    v: ['mfg', 'cap', 'pow', 'tra'].includes(hs.get('v')) ? hs.get('v') : 'mfg',
    basis: hs.get('basis') === 'nsa' ? 'nsa' : 'sa', range: hs.get('r') || '10', fromYear: hs.get('from') || '',
    tf: ['level', 'pct', 'yoy', 'rebase'].includes(hs.get('tf')) ? hs.get('tf') : 'level',
    sel: (hs.get('m') || '30000,30999,33999,35999,38999').split(',').slice(0, MAX_SEL),
    exp: new Set((hs.get('x') || '').split(',').filter(Boolean)),
    cap: (hs.get('ci') || 'MUP300,MUP309,MUP399').split(',').slice(0, MAX_SEL),
    capInd: hs.get('ind') || 'MUP300', cp: hs.get('cp') || '',
    ent: hs.get('ent') === 'eskom' ? 'eskom' : 'total', pmode: hs.get('pm') === 'sa' ? 'sa' : 'nsa',
  };
  const colM = Kit.colorMap(Kit.PALETTE), colC = Kit.colorMap(Kit.PALETTE);
  const cs = [], xb = []; const xstate = {}; const kill = () => { while (cs.length) cs.pop().destroy(); while (xb.length) xb.pop().destroy(); };
  function save() {
    Kit.hashState.write(TAB, { v: st.v === 'mfg' ? '' : st.v, basis: st.basis === 'sa' ? '' : 'nsa', r: st.fromYear ? '' : (st.range === '10' ? '' : st.range), from: st.fromYear,
      tf: st.tf === 'level' ? '' : st.tf, m: st.sel.join(','), x: Array.from(st.exp).join(','), ci: st.cap.join(','), ind: st.capInd, cp: st.cp, ent: st.ent === 'total' ? '' : st.ent, pm: st.pmode === 'nsa' ? '' : st.pmode });
  }
  const root = Kit.tabShell({ title: 'Industrials', pubs: PUBS, relevance: RELEVANCE });
  const body = h('div'); Kit.freshOrder(body);                          // fresh, frequently updated charts first; annual / pre-2025 ones below
  const rangeCtl = Kit.rangeCtl(st, () => render());
  const basisSeg = Kit.segmented([{ v: 'sa', label: 'Seasonally adjusted' }, { v: 'nsa', label: 'Actual' }], st.basis, v => { st.basis = v; render(); save(); });
  const secNav = Kit.segmented([{ v: 'mfg', label: 'Manufacturing' }, { v: 'cap', label: 'Capacity utilisation' }, { v: 'pow', label: 'Electricity' }, { v: 'tra', label: 'Land transport' }], st.v, v => { st.v = v; render(); save(); });
  const ctlRow = h('div', { class: 'filters', style: 'margin-bottom:10px' }, secNav, h('label', { class: 'lbl', style: 'margin-left:10px', text: 'All charts', title: 'Sets the range of every chart on this page; each chart also has its own range buttons' }), rangeCtl.el);
  const basisWrap = h('span', { style: 'display:inline-flex;gap:6px;align-items:center' }, h('label', { class: 'lbl', text: 'Basis' }), basisSeg);
  root.appendChild(ctlRow); root.appendChild(body);

  const xrFor = (code) => { const X = Store.pubX[code]; return rangeCtl.xr(X[0], X[X.length - 1]); };

  /* ============================================================ Manufacturing */
  const catalog = (() => {
    const names = {}, codes = [];
    MFG.all({ id: /^MPI/ }).forEach(it => { const c = it.id.slice(3); names[c] = it.name; codes.push(c); });
    const isDiv = c => c.slice(2) === '999' || c === '39991';
    const divs = codes.filter(isDiv).map(c => ({ c, name: names[c], kids: codes.filter(k => !isDiv(k) && k !== '30000' && k.slice(0, 2) === c.slice(0, 2)) }));   // 39OTHER is a child of division 39991 (39991 = 39100 + 39OTHER, exactly)
    return { names, codes, divs };
  })();
  const mName = c => catalog.names[c] || c;
  const mVol = c => st.basis === 'sa' ? (MFG.byId('MPS' + c) || MFG.byId('MPI' + c)) : MFG.byId('MPI' + c);
  const mVal = c => st.basis === 'sa' ? (MFG.byId('MSS' + c) || MFG.byId('MSV' + c)) : MFG.byId('MSV' + c);
  function mRow(c) {
    const a = MFG.byId('MPI' + c), sa = MFG.byId('MPS' + c), v = MFG.byId('MSV' + c), vb = mVol(c);
    const m = Store.metrics(a, sa), r = { c, name: mName(c), vol: vb.last, mm: m.mm, m3: m.m3, yoy: m.yoy, spark: vb.v.slice(-60), sa: !!sa && st.basis === 'sa' };
    if (v) {
      r.v12 = Store.sumLast(v, 0, 12); r.vp12 = Store.sumLast(v, 12, 12); r.vyoy = Store.pct(r.v12, r.vp12);
      const vm = Store.sumLast(a, 0, 12) / 12, pm = Store.sumLast(a, 12, 12) / 12; r.price = Store.pct(r.v12 / vm, r.vp12 / pm);
    }
    return r;
  }
  function renderMfg() {
    const [x0, x1] = xrFor('P3041.2'), pub = Store.pub('P3041.2');
    colM.assign(st.sel);
    // controls row 2
    body.appendChild(h('div', { class: 'filters', style: 'margin-bottom:6px' }, basisWrap, h('span', { class: 'sub', style: 'margin:0', text: 'Click rows in the table to chart up to ' + MAX_SEL + ' industries; ▸ expands a division.' })));

    // KPI strip
    const tot = mRow('30000'), kp = ['30000', '30999', '33999', '35999', '38999'].map(c => mRow(c));
    const totV = MFG.byId('MSV30000');
    const tiles = kp.map(r => ({ label: r.name.length > 34 ? r.name.slice(0, 32) + '…' : r.name, value: fmt.num(r.vol), delta: [{ text: 'm/m ' }, { text: fmt.sg(r.mm), bold: true }, { text: ' · y/y ' }, { text: fmt.sg(r.yoy), bold: true }], note: 'Volume index' + (st.basis === 'sa' ? ', SA' : ', actual'), spark: r.spark }));
    tiles.push({ label: 'Sales value, last 12 months', value: fmt.rands(Store.sumLast(totV, 0, 12)), delta: [{ text: 'vs prior 12m ' }, { text: fmt.sg(tot.vyoy), bold: true }], note: 'Total manufacturing, current prices' });
    const kCard = h('div', { class: 'card' }, Kit.cardHead('Headline', 'Latest ' + fmt.period(pub.last) + '. m/m on seasonally adjusted series; y/y on actual series.'), Kit.kpiStrip(tiles));
    body.appendChild(kCard);
    const divOf = c => { if (c === '30000') return 'Total manufacturing'; const d = catalog.divs.find(x => x.c === c || x.kids.indexOf(c) >= 0); return d ? (d.c === c ? 'Division' : d.name) : ''; };
    body.appendChild(h('div', { class: 'addrow', style: 'margin-top:12px' },
      Kit.chips(st.sel.map(c => ({ v: c, label: (mName(c).length > 34 ? mName(c).slice(0, 32) + '\u2026' : mName(c)) + ' \u00d7' })), st.sel, k => colM.of(k), k => toggleM(k)),
      Kit.addSearch({ placeholder: 'Add an industry to the charts\u2026 e.g. steel, beverages, vehicles', candidates: () => catalog.codes.map(c => ({ key: c, label: mName(c), group: divOf(c) })), selected: () => st.sel, onAdd: toggleM, max: MAX_SEL })));

    // volume + contribution
    const volCard = h('div', { class: 'card' }), contCard = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, volCard, contCard));
    const tfSeg = Kit.segmented([{ v: 'level', label: 'Level' }, { v: 'pct', label: '% m/m' }, { v: 'yoy', label: '% y/y' }, { v: 'rebase', label: 'Rebased' }], st.tf, v => { st.tf = v; render(); save(); });
    volCard.appendChild(Kit.cardHead('Production volume', 'Volume index, 2019 = 100', tfSeg));
    cs.push(Kit.linePanel(volCard, { entries: st.sel.map(c => ({ key: c, name: mName(c) + (st.basis === 'sa' ? ' (SA)' : ''), color: colM.of(c), it: mVol(c) })), tf: st.tf, x0, x1, height: 300 }));

    // contribution of divisions (2019 sales-value weights)
    const periods = pub.last ? MFG.byId('MPI30000').periods : [], li = periods.length - 1;
    const opts = []; for (let i = li; i >= Math.max(12, li - 59); i--) opts.push(periods[i]);
    if (!st.cp || opts.indexOf(st.cp) < 0) st.cp = opts[0];
    const sel = h('select', { 'aria-label': 'Month' }, opts.map(p => { const o = h('option', { value: p, text: fmt.period(p) }); if (p === st.cp) o.selected = true; return o; }));
    sel.addEventListener('change', () => { st.cp = sel.value; render(); save(); });
    contCard.appendChild(Kit.cardHead('What drove total volume growth', 'Contribution of each division to the y/y change in total manufacturing volume, percentage points', sel));
    const yr19 = it => { let s0 = 0; it.v.forEach((x, i) => { if (it.periods[it.s + i].startsWith('2019-')) s0 += x || 0; }); return s0; };
    const totVal19 = yr19(MFG.byId('MSV30000'));
    const T = Store.full(MFG.byId('MPI30000')), i = periods.indexOf(st.cp);
    const parts = catalog.divs.map(d => ({ c: d.c, name: d.name })).map(d => {
      const A = Store.full(MFG.byId('MPI' + d.c)), w = yr19(MFG.byId('MSV' + d.c)) / totVal19;
      return { label: d.name.length > 38 ? d.name.slice(0, 36) + '…' : d.name, cur: A[i], prev: A[i - 12], w, fmtLevel: fmt.num };
    });
    cs.push(Kit.hbar(contCard, { rows: Kit.contribRows({ parts, totalCur: T[i], totalPrev: T[i - 12], totalLabel: 'Total volume y/y', totalTip: 'published index', remainderLabel: 'Weights / rounding' }), fmtVal: v => fmt.signed(v, 1), rowH: 27, ariaLabel: 'Division contributions to manufacturing growth' }));
    contCard.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Indicative: StatsSA does not publish weights, so each division is weighted by its share of 2019 sales value. The last bar is what that cannot explain.' }));

    // table
    const tCard = h('div', { class: 'card', style: 'margin-top:12px' });
    body.appendChild(tCard);
    tCard.appendChild(Kit.cardHead('Industries at a glance', 'Volume on the ' + (st.basis === 'sa' ? 'seasonally adjusted' : 'actual') + ' basis; m/m and 3m/3m use SA; sales over the last 12 months (R billion).'));
    const rows = [{ ...mRow('30000'), kind: 'total' }];
    const addDiv = (d) => {
      rows.push({ ...mRow(d.c), kind: 'div', n: d.kids.length, open: st.exp.has(d.c) });
      if (st.exp.has(d.c)) d.kids.forEach(k => rows.push({ ...mRow(k), kind: 'child' }));
    };
    const totVal12 = Store.sumLast(MFG.byId('MSV30000'), 0, 12);
    catalog.divs.sort((a, b) => (mRow(b.c).v12 || 0) - (mRow(a.c).v12 || 0)).forEach(addDiv);
    rows.forEach(r => { r.share = r.v12 != null && totVal12 ? r.v12 / totVal12 * 100 : null; });
    const cols = [
      { key: 'name', label: 'Industry', cls: 'l lab', nosort: true, render: r => h('div', { class: 't', title: r.name },
          r.kind === 'div' && r.n ? h('button', { type: 'button', class: 'ghost small', style: 'padding:0 5px;margin-right:2px', 'aria-expanded': String(!!r.open), 'aria-label': (r.open ? 'Collapse ' : 'Expand ') + r.name, text: r.open ? '▾' : '▸',
            onclick: e => { e.stopPropagation(); if (st.exp.has(r.c)) st.exp.delete(r.c); else st.exp.add(r.c); render(); save(); } }) : null, r.name) },
      { key: 'vol', label: 'Volume idx', nosort: true, render: r => fmt.num(r.vol) },
      { key: 'mm', label: 'm/m', nosort: true, render: r => fmt.sg(r.mm) },
      { key: 'm3', label: '3m/3m', nosort: true, render: r => fmt.sg(r.m3) },
      { key: 'yoy', label: 'y/y', nosort: true, render: r => fmt.sg(r.yoy) },
      { key: 'sp', label: '5-yr trend', nosort: true, cls: 'hide-s', render: r => Kit.spark(r.spark) },
      { key: 'v12', label: 'Sales 12m', nosort: true, render: r => fmt.rands(r.v12) },
      { key: 'vy', label: 'Sales y/y', nosort: true, render: r => fmt.sg(r.vyoy) },
      { key: 'sh', label: 'Share', nosort: true, cls: 'hide-s', render: r => r.share == null ? '–' : r.share < 0.1 ? '<0.1%' : fmt.fixed(r.share, 1) + '%' },
      { key: 'px', label: 'Price/mix y/y', nosort: true, cls: 'hide-s', title: '12-month sales value per unit of average volume, vs a year earlier. A proxy: mixes price and product mix.', render: r => fmt.sg(r.price) },
    ];
    const t = Kit.table(cols, { sortKey: null, page: 100, isSel: r => st.sel.includes(r.c), onToggle: r => toggleM(r.c),
      onOpen: r => Kit.openSeries({ title: r.name, sub: 'Manufacturing', entries: [{ name: 'Production volume index', it: MFG.byId('MPI' + r.c) }, { name: 'Production volume index (seasonally adjusted)', it: MFG.byId('MPS' + r.c) }],
        more: [{ title: 'Sales value, R million', entries: [{ name: 'Sales value', it: MFG.byId('MSV' + r.c) }, { name: 'Sales value (seasonally adjusted)', it: MFG.byId('MSS' + r.c) }] }],
        toggle: { isOn: () => st.sel.includes(r.c), fn: () => toggleM(r.c), offLabel: 'Add to the volume charts', onLabel: 'Remove from the volume charts' } }) });
    t.set(rows); tCard.appendChild(t.el); t.el.style.maxHeight = 'none';
    t.el.querySelectorAll('tbody tr').forEach((tr, k) => { const r = rows[k]; if (r && r.kind === 'child') tr.classList.add('child'); if (r && (r.kind === 'total' || r.kind === 'div')) tr.classList.add('total'); });

    // sales value + price proxy
    const valCard = h('div', { class: 'card' }), pxCard = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, valCard, pxCard));
    valCard.appendChild(Kit.cardHead('Sales value', 'Trailing 12 months, R thousand (current prices)'));
    const vEntries = st.sel.map(c => { const it = mVal(c); if (!it) return null; return { key: c, name: mName(c), color: colM.of(c), it: Store.derive(it, it.key + ':12m', mName(c), Store.rolling(Store.full(it), 12, 'sum')) }; }).filter(Boolean);
    cs.push(Kit.linePanel(valCard, { entries: vEntries, tf: 'level', x0, x1, unit: "R'000, trailing 12 months", height: 290 }));
    pxCard.appendChild(Kit.cardHead('Implied price proxy', 'Trailing 12-month sales value ÷ average volume index, rebased to the start of the range = 100. Mixes price and product mix — a direction signal.'));
    const pEntries = st.sel.map(c => {
      const v = MFG.byId('MSV' + c), a = MFG.byId('MPI' + c); if (!v || !a) return null;
      const num = Store.rolling(Store.full(v), 12, 'sum'), den = Store.rolling(Store.full(a), 12, 'mean');
      const d = Store.derive(v, v.key + ':px', mName(c), num.map((x, k) => x == null || !den[k] ? null : x / den[k]));
      return d ? { key: c, name: mName(c), color: colM.of(c), it: d } : null;
    }).filter(Boolean);
    cs.push(Kit.linePanel(pxCard, { entries: pEntries, tf: 'rebase', x0, x1, height: 290 }));
  }
  function toggleM(c) {
    const i = st.sel.indexOf(c);
    if (i >= 0) { if (st.sel.length === 1) return; st.sel.splice(i, 1); }
    else { if (st.sel.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' series — remove one first'); return; } st.sel.push(c); }
    render(); save();
  }

  /* ============================================================ Capacity utilisation */
  const capNames = {}; CAP.all({ id: /10$/ }).forEach(it => { capNames[it.id.slice(0, 6)] = it.name; });
  const capCodes = Object.keys(capNames);
  const capId = (ind, m) => CAP.byId(ind + m);
  function renderCap() {
    const [x0, x1] = xrFor('P3043'), pub = Store.pub('P3043');
    colC.assign(st.cap);
    body.appendChild(h('div', { class: 'filters', style: 'margin-bottom:6px' }, h('span', { class: 'sub', style: 'margin:0', text: 'Capacity utilisation is quarterly (large enterprises). Click rows to chart up to ' + MAX_SEL + ' industries.' })));
    const tot = capId('MUP300', '10'), ud = capId('MUP300', '20');
    const tl = tot.v, n = tl.length;
    const reasonsTot = REASONS.map(([m, nm]) => ({ nm, v: capId('MUP300', m).last }));
    const top = reasonsTot.slice().sort((a, b) => b.v - a.v)[0];
    const avg10 = Store.avg(tl.slice(-40));
    const tiles = [
      { label: 'Utilisation · ' + fmt.period(tot.lastP), value: fmt.fixed(tot.last, 1) + '%', delta: [{ text: 'vs prior quarter ' }, { text: fmt.sg(tot.last - tl[n - 2], 1, ' pp'), bold: true }], note: 'Total manufacturing', spark: tl.slice(-40) },
      { label: 'vs year ago', value: fmt.sg(tot.last - tl[n - 5], 1, ' pp'), delta: [{ text: 'was ' }, { text: fmt.fixed(tl[n - 5], 1) + '%', bold: true }] },
      { label: 'vs 10-year average', value: fmt.sg(tot.last - avg10, 1, ' pp'), delta: [{ text: 'average ' }, { text: fmt.fixed(avg10, 1) + '%', bold: true }] },
      { label: 'Under-utilised', value: fmt.fixed(ud.last, 1) + '%', note: 'of capacity idle' },
      { label: 'Biggest reason', value: top.nm, delta: [{ text: fmt.fixed(top.v, 1) + ' pp of idle capacity', bold: true }], note: 'Total manufacturing' },
    ];
    body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Headline', 'Latest ' + fmt.period(pub.last)), Kit.kpiStrip(tiles)));
    body.appendChild(h('div', { class: 'addrow', style: 'margin-top:12px' },
      Kit.chips(st.cap.map(ind => ({ v: ind, label: (capNames[ind].length > 34 ? capNames[ind].slice(0, 32) + '\u2026' : capNames[ind]) + ' \u00d7' })), st.cap, k => colC.of(k), k => toggleC(k)),
      Kit.addSearch({ placeholder: 'Add an industry to the chart\u2026 e.g. plastic, paper, motor', candidates: () => capCodes.map(c => ({ key: c, label: capNames[c], group: /division|Total manufacturing/.test(capNames[c]) ? 'Division' : '' })), selected: () => st.cap, onAdd: toggleC, max: MAX_SEL })));

    const c1 = h('div', { class: 'card' }), c2 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c1, c2));
    c1.appendChild(Kit.cardHead('Capacity utilisation', '% of production capacity in use'));
    cs.push(Kit.linePanel(c1, { entries: st.cap.map(ind => ({ key: ind, name: capNames[ind], color: colC.of(ind), it: capId(ind, '10') })), tf: 'level', x0, x1, unit: '% of capacity', height: 300, valFmt: v => fmt.fixed(v, 1) + '%' }));

    // reasons for one industry
    const indSel = Kit.pickSearch({ options: capCodes.map(c => ({ key: c, label: capNames[c] })), value: st.capInd, ariaLabel: 'Industry', placeholder: 'Search industries\u2026', width: '320px', onChange: k => { st.capInd = k; render(); save(); } });
    c2.appendChild(Kit.cardHead('Why capacity is idle', 'Idle capacity split by reason, percentage points of total capacity (adds up to under-utilisation)', indSel));
    const pal = [Kit.PALETTE[0], Kit.PALETTE[1], Kit.PALETTE[2], Kit.PALETTE[3], Kit.PALETTE[4]];
    const rItems = REASONS.map(([m]) => capId(st.capInd, m)), labels = [];
    const P = rItems[0].periods, lastIdx = P.length - 1, from = Math.max(0, lastIdx - 23);
    for (let i = from; i <= lastIdx; i++) labels.push(P[i]);
    const series = REASONS.map(([m, nm], k) => { const full = Store.full(rItems[k]); return { name: nm, color: pal[k], vals: labels.map((_, j) => full[from + j]) }; });
    c2.appendChild(Kit.legend(series));
    cs.push(Kit.stackedColumns(c2, { labels, series, height: 280, fmtVal: v => fmt.fixed(v, 1) + ' pp', label: 'Reasons for under-utilisation, ' + capNames[st.capInd] }));
    const ldem = rItems[3].last, lud = capId(st.capInd, '20').last;
    c2.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Latest ' + fmt.period(rItems[0].lastP) + ': ' + fmt.fixed(lud, 1) + '% idle, of which insufficient demand ' + fmt.fixed(ldem, 1) + ' pp (' + (lud ? fmt.fixed(ldem / lud * 100, 0) : '0') + '% of the idle capacity).' }));

    // table
    const tCard = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(tCard);
    tCard.appendChild(Kit.cardHead('Industries ranked', 'Utilisation, change and the largest reason for idle capacity. Click a heading to sort.'));
    const rows = capCodes.map(ind => {
      const u = capId(ind, '10'), ud2 = capId(ind, '20'), L = u.v.length;
      const rs = REASONS.map(([m, nm]) => ({ nm, v: capId(ind, m).last })).sort((a, b) => b.v - a.v)[0];
      return { ind, name: capNames[ind], last: u.last, dq: L > 1 ? u.last - u.v[L - 2] : null, dy: L > 4 ? u.last - u.v[L - 5] : null, d10: u.last - Store.avg(u.v.slice(-40)), idle: ud2.last, top: rs.nm, topv: rs.v, spark: u.v.slice(-40) };
    });
    const cols = [
      { key: 'name', label: 'Industry', cls: 'l lab', sort: r => r.name.toLowerCase(), render: r => h('div', { class: 't', title: r.name, text: r.name }) },
      { key: 'last', label: 'Utilisation', firstDir: -1, sort: r => r.last, render: r => fmt.fixed(r.last, 1) + '%' },
      { key: 'dq', label: 'Δ qtr', firstDir: -1, title: 'Percentage-point change on the prior quarter', sort: r => r.dq, render: r => fmt.sg(r.dq, 1, ' pp') },
      { key: 'dy', label: 'Δ y/y', firstDir: -1, title: 'Percentage-point change on a year earlier', sort: r => r.dy, render: r => fmt.sg(r.dy, 1, ' pp') },
      { key: 'd10', label: 'vs 10y avg', firstDir: -1, sort: r => r.d10, render: r => fmt.sg(r.d10, 1, ' pp') },
      { key: 'sp', label: '10-yr trend', nosort: true, cls: 'hide-s', render: r => Kit.spark(r.spark) },
      { key: 'idle', label: 'Idle', firstDir: -1, sort: r => r.idle, render: r => fmt.fixed(r.idle, 1) + '%' },
      { key: 'top', label: 'Main reason', cls: 'l hide-s', sort: r => r.top, render: r => r.top + ' (' + fmt.fixed(r.topv, 1) + ' pp)' },
    ];
    const t = Kit.table(cols, { sortKey: 'last', sortDir: -1, page: 60, isSel: r => st.cap.includes(r.ind), onToggle: r => toggleC(r.ind),
      onOpen: r => Kit.openSeries({ title: r.name, sub: 'Capacity utilisation, % of capacity', entries: [{ name: 'Utilisation', it: capId(r.ind, '10') }, { name: 'Idle capacity', it: capId(r.ind, '20') }],
        toggle: { isOn: () => st.cap.includes(r.ind), fn: () => toggleC(r.ind), offLabel: 'Add to the capacity chart', onLabel: 'Remove from the capacity chart' } }) });
    t.set(rows); tCard.appendChild(t.el); t.el.style.maxHeight = 'none';
  }
  function toggleC(ind) {
    const i = st.cap.indexOf(ind);
    if (i >= 0) { if (st.cap.length === 1) return; st.cap.splice(i, 1); }
    else { if (st.cap.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' series — remove one first'); return; } st.cap.push(ind); }
    render(); save();
  }

  /* ============================================================ Electricity */
  const E = id => PWR.byId(id);
  function renderPow() {
    const [x0, x1] = xrFor('P4141'), pub = Store.pub('P4141');
    const sa = st.pmode === 'sa';
    body.appendChild(h('div', { class: 'filters', style: 'margin-bottom:6px' }, h('label', { class: 'lbl', text: 'Producer' }),
      Kit.segmented([{ v: 'total', label: 'All producers' }, { v: 'eskom', label: 'National supplier (Eskom)' }], st.ent, v => { st.ent = v; render(); save(); }),
      h('label', { class: 'lbl', style: 'margin-left:10px', text: 'Basis' }),
      Kit.segmented([{ v: 'nsa', label: 'Actual' }, { v: 'sa', label: 'Seasonally adjusted' }], st.pmode, v => { st.pmode = v; render(); save(); })));
    // KPIs
    const avail = Store.metrics(E('ELEKTR10'), E('ELEKTS10')), prod = Store.metrics(E('ELEKIN11'), E('ELEKIS11'));
    const r11 = E('ELEKTR11'), r21 = E('ELEKTR21'), eskomShare = r21.last / r11.last * 100, esPrev = r21.v[r21.v.length - 13] / r11.v[r11.v.length - 13] * 100;
    const net = E('ELEKTR13').last - E('ELEKTR14').last, netPrev = E('ELEKTR13').v[E('ELEKTR13').v.length - 13] - E('ELEKTR14').v[E('ELEKTR14').v.length - 13];
    const tiles = [
      { label: 'Available for distribution · ' + fmt.period(pub.last), value: fmt.num(avail.last) + ' GWh', delta: [{ text: 'm/m ' }, { text: fmt.sg(avail.mm), bold: true }, { text: ' · y/y ' }, { text: fmt.sg(avail.yoy), bold: true }], note: 'South Africa, SA', spark: avail.spark },
      { label: 'Production volume index', value: fmt.num(prod.last), delta: [{ text: 'm/m ' }, { text: fmt.sg(prod.mm), bold: true }, { text: ' · y/y ' }, { text: fmt.sg(prod.yoy), bold: true }], note: '2019 = 100, SA', spark: prod.spark },
      { label: 'National supplier share of output', value: fmt.fixed(eskomShare, 1) + '%', delta: [{ text: 'vs year ago ' }, { text: fmt.sg(eskomShare - esPrev, 1, ' pp'), bold: true }], note: 'rest = other producers' },
      { label: 'Net imports', value: fmt.num(net) + ' GWh', delta: [{ text: 'a year ago ' }, { text: fmt.num(netPrev) + ' GWh', bold: true }], note: 'imports less exports' },
      { label: 'Exports', value: fmt.num(E('ELEKTR14').last) + ' GWh', delta: [{ text: 'y/y ' }, { text: fmt.sg(Store.pct(E('ELEKTR14').last, E('ELEKTR14').v[E('ELEKTR14').v.length - 13])), bold: true }] },
    ];
    body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Headline', 'Gigawatt-hours unless stated. Latest ' + fmt.period(pub.last)), Kit.kpiStrip(tiles)));

    // balance + production
    const c1 = h('div', { class: 'card' }), c2 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c1, c2));
    const es = st.ent === 'eskom', P = es ? '2' : '1';
    const pick = (suffix) => { const sId = es ? 'ELEKTS2' + suffix : null; return sa && sId ? (E(sId) || E('ELEKTR2' + suffix)) : E((es ? 'ELEKTR2' : 'ELEKTR1') + suffix); };
    const fbNote = sa && !es ? 'No seasonally adjusted series is published for the all-producer balance — actual shown.' : null;
    c1.appendChild(Kit.cardHead('Energy balance', (es ? 'National electricity supplier' : 'All producers') + ' — produced, imported, own use, exported and available for distribution'));
    const ents = [['1', 'Produced', 0], ['3', 'Imports', 1], ['2', 'Own use (power stations)', 2], ['4', 'Exports', 3], ['0', 'Available for distribution', 4]].map(([sfx, nm, k]) => ({ key: sfx, name: nm, color: Kit.PALETTE[k], it: pick(sfx) }));
    cs.push(Kit.linePanel(c1, { entries: ents, tf: 'level', x0, x1, unit: 'GWh per month', height: 300, notes: fbNote ? [fbNote] : [] }));
    c2.appendChild(Kit.cardHead('Production', 'Electricity produced, GWh — actual, seasonally adjusted and trend (all producers)'));
    cs.push(Kit.linePanel(c2, { entries: [{ key: 'a', name: 'Actual', color: Kit.PALETTE[0], it: E('ELEKTR11') }, { key: 's', name: 'Seasonally adjusted', color: Kit.PALETTE[1], it: E('ELEKTS11') }, { key: 't', name: 'Trend', color: Kit.PALETTE[2], it: E('ELEKTT11') }], tf: 'level', x0, x1, unit: 'GWh per month', height: 300 }));

    const c3 = h('div', { class: 'card' }), c4 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c3, c4));
    // who produces: national supplier vs others (stacked, last 36 months)
    c3.appendChild(Kit.cardHead('Who produces the electricity', 'National supplier vs all other producers, GWh per month, last 36 months'));
    const Pm = r11.periods, li = Pm.length - 1, from = li - 35, labels = Pm.slice(from, li + 1);
    const F11 = Store.full(r11), F21 = Store.full(r21);
    const ser = [{ name: 'National supplier', color: Kit.PALETTE[0], vals: labels.map((_, j) => F21[from + j]) }, { name: 'Other producers', color: Kit.PALETTE[2], vals: labels.map((_, j) => F11[from + j] == null || F21[from + j] == null ? null : F11[from + j] - F21[from + j]) }];
    c3.appendChild(Kit.legend(ser));
    cs.push(Kit.stackedColumns(c3, { labels, series: ser, height: 270, fmtVal: v => fmt.num(v) + ' GWh', label: 'Electricity produced by producer type' }));
    c3.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Other producers = all producers less the national supplier. Derived, not published.' }));
    // production volume index
    c4.appendChild(Kit.cardHead('Production volume index', '2019 = 100'));
    cs.push(Kit.linePanel(c4, { entries: [{ key: 'ia', name: 'Actual', color: Kit.PALETTE[0], it: E('ELEKIN11') }, { key: 'is', name: 'Seasonally adjusted', color: Kit.PALETTE[1], it: E('ELEKIS11') }], tf: 'level', x0, x1, unit: 'Index, 2019 = 100', height: 270 }));

    // provinces
    const tCard = h('div', { class: 'card', style: 'margin-top:12px' });
    tCard.appendChild(Kit.cardHead('Electricity distributed by province', 'GWh. Share is of the national total over the last 12 months.'));
    const nat = E('ELEKTRSA'), nat12 = Store.sumLast(nat, 0, 12);
    const prow = PROV.map(([k, nm]) => { const it = E('ELEKTR' + k); return { nm, last: it.last, yoy: Store.pct(it.last, it.v[it.v.length - 13]), s12: Store.sumLast(it, 0, 12), p12: Store.sumLast(it, 12, 12), spark: it.v.slice(-60) }; });
    prow.forEach(r => { r.share = r.s12 / nat12 * 100; r.y12 = Store.pct(r.s12, r.p12); });
    prow.sort((a, b) => b.s12 - a.s12);
    prow.unshift({ nm: 'South Africa', last: nat.last, yoy: Store.pct(nat.last, nat.v[nat.v.length - 13]), s12: nat12, p12: Store.sumLast(nat, 12, 12), y12: Store.pct(nat12, Store.sumLast(nat, 12, 12)), share: 100, spark: nat.v.slice(-60), tot: true });
    const mv = f => { const o = {}; prow.forEach(r => { if (r.nm !== 'South Africa') o[r.nm] = f(r); }); return o; };
    cs.push(Kit.provMapCard(body, { style: 'margin-top:12px', title: 'Electricity distributed by province — map', sub: 'Last 12 months. Share of the national total, or growth on the 12 months before.', metrics: [
      { v: 'share', label: 'Share of national', values: mv(r => r.share), fmt: v => fmt.fixed(v, 1) + '%' },
      { v: 'g', label: 'Growth (12m vs prior)', values: mv(r => r.y12), fmt: v => fmt.signed(v, 1, '%'), pivot: prow[0].y12, pivotLabel: 'South Africa' }] }));
    body.appendChild(tCard);
    const pc = [
      { key: 'nm', label: 'Province', cls: 'l', nosort: true, render: r => r.nm },
      { key: 'last', label: 'Latest', nosort: true, render: r => fmt.num(r.last) },
      { key: 'yoy', label: 'y/y', nosort: true, render: r => fmt.sg(r.yoy) },
      { key: 'sp', label: '5-yr trend', nosort: true, cls: 'hide-s', render: r => Kit.spark(r.spark) },
      { key: 's12', label: '12m total', nosort: true, render: r => fmt.num(r.s12) },
      { key: 'y12', label: '12m vs prior', nosort: true, render: r => fmt.sg(r.y12) },
      { key: 'sh', label: 'Share', nosort: true, render: r => fmt.fixed(r.share, 1) + '%' },
    ];
    const pt = Kit.table(pc, { sortKey: null, page: 20 }); pt.set(prow); tCard.appendChild(pt.el); pt.el.style.maxHeight = 'none';
    pt.el.querySelectorAll('tbody tr').forEach((tr, k) => { if (prow[k].tot) tr.classList.add('total'); });
    const chk = prow.slice(1).reduce((a, r) => a + r.last, 0);
    tCard.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Provinces sum to ' + fmt.num(chk) + ' GWh against the published national figure of ' + fmt.num(nat.last) + ' GWh.' }));
  }

  /* ============================================================ render */
  function render() { Kit.keepScroll(renderBody); }
  function renderBody() {
    kill(); clear(body);
    if (st.v === 'mfg') renderMfg(); else if (st.v === 'cap') renderCap(); else if (st.v === 'tra') Extras.transport({ tab: TAB, body, cs, xr: xrFor, redo: () => render(), state: xstate, browsers: xb }); else renderPow();
    const cov = h('div', { class: 'foot', text: 'Every series in P3041.2, P3043, P4141 and P7162 is reachable on this tab through the industry, producer and basis selectors; the Series Explorer shows any of them individually.' });
    body.appendChild(cov);
  }
  document.addEventListener('themechange', () => cs.forEach(c => c.redraw && c.redraw()));
  coverage(); render();
  return { el: root, destroy() { kill(); } };
}
window.Industrials = { create, coverage };
})();
