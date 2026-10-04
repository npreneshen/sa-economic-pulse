/* prices.js - Prices tab: CPI (P0141), PPI (P0142.1) and CPI average prices in Rand (P0141AP).
   The CPI/PPI layouts and analytics follow the SA CPI & PPI project (read-only reference).
   CPI: 784 COICOP-based index series (headline, 13 divisions, analytical measures, provinces, expenditure deciles) + 391 products with weights
   (Dec 2024 = 100; weights sum to 100). Division weights are the sums of the product weights - they rebuild the published headline index
   exactly, so contributions are exact for any month whose year-earlier point is on the Dec 2024 basket (Dec 2025 onward).
   PPI: 76 sector/category series + 277 elementary products with within-sector weights (each sector sums to 100). */
(function () {
'use strict';
const { h, clear, fmt, time } = Kit;
const Store = Kit.store;
const TAB = 'prices', MAX_SEL = 8;
const PAL = Kit.PALETTE;
const RELEVANCE = 'Use: inflation drivers for consumer-facing, input-cost-sensitive and rate-sensitive stocks — CPI feeds retailer pricing power and SARB policy; PPI feeds margins for manufacturers and miners.';
const BASKET_FROM = '2025-12';                                         // first month whose year-earlier point sits on the Dec 2024 = 100 basket
const PROVINCES = [['CPA00000', 'Western Cape'], ['CPB00000', 'Eastern Cape'], ['CPC00000', 'Northern Cape'], ['CPD00000', 'Free State'], ['CPE00000', 'KwaZulu-Natal'], ['CPF00000', 'North West'], ['CPG00000', 'Gauteng'], ['CPH00000', 'Mpumalanga'], ['CPJ00000', 'Limpopo']];
const DIVS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'];
const CPI_KPI = [['CPS00000', 'Headline CPI'], ['CPS00014', 'Core CPI'], ['CPS00025', 'Trimmed mean'], ['CPS00006', 'Goods'], ['CPS00007', 'Services'], ['CPS51000', 'Administered prices']];
const CPI_DEFAULT = ['CPS00000', 'CPS00014', 'CPS00025', 'CPS00006', 'CPS00007'];
const PPI_SECTORS = [['PPC30000', 'Final manufactured goods', 'Final manufactured goods'], ['PPD30000', 'Intermediate manufactured goods', 'Intermediate manufactured goods'], ['PPE10000', 'Electricity and water', 'Electricity and water'],
  ['PPF10000', 'Mining', 'Mining'], ['PPG10000', 'Agriculture, forestry and fishing', 'Agriculture, forestry and fishing']];
const REL_PPI = 'P0142.1';
const PROVS_ALL = ['Western Cape', 'Eastern Cape', 'Northern Cape', 'Free State', 'KwaZulu-Natal', 'North West', 'Gauteng', 'Mpumalanga', 'Limpopo'];

function coverage() { ['P0141', 'P0141AP', 'P0142.1', 'P0142.7'].forEach(c => Kit.lookup(TAB, c, { includeDiscontinued: true }).markAll()); }

function create() {
  const hs = Kit.hashState.read(TAB);
  const C = Kit.lookup(TAB, 'P0141', { includeDiscontinued: true }), P = Kit.lookup(TAB, 'P0142.1', { includeDiscontinued: true }), A = Kit.lookup(TAB, 'P0141AP', { includeDiscontinued: true });
  const cpiPub = Store.pub('P0141'), ppiPub = Store.pub('P0142.1'), apPub = Store.pub('P0141AP');
  const st = {
    v: ['cpi', 'ppi', 'rand', 'trade'].includes(hs.get('v')) ? hs.get('v') : 'cpi',
    range: hs.get('r') || '10', fromYear: hs.get('from') || '', tf: ['yoy', 'pct', 'level', 'rebase'].includes(hs.get('tf')) ? hs.get('tf') : 'yoy',
    ci: (hs.get('ci') || CPI_DEFAULT.join('|')).split('|').filter(Boolean).slice(0, MAX_SEL), cp: hs.get('cp') || '',
    ps: (hs.get('ps') || 'P0142.1:PPC30000|P0142.1:PPD30000|P0141:CPS00000').split('|').filter(Boolean).slice(0, MAX_SEL), sec: hs.get('sec') || 'PPC30000', pcp: hs.get('pcp') || '',
    ptf: ['yoy', 'pct', 'level', 'rebase'].includes(hs.get('ptf')) ? hs.get('ptf') : 'yoy',
    prod: hs.get('pp') || '', pg: (hs.get('pg') || 'Gauteng|Western Cape|Limpopo').split('|').filter(Boolean), rtf: ['level', 'yoy', 'rebase'].includes(hs.get('rtf')) ? hs.get('rtf') : 'level', pm: hs.get('pm') === 'bars' ? 'bars' : 'map',
    cs: ['over', 'drivers', 'regions', 'hh', 'explore'].includes(hs.get('cs')) ? hs.get('cs') : 'over', hm: hs.get('hm') || 'CPS00000', at: hs.get('at') === 'mom' ? 'mom' : 'yoy', mp: hs.get('mp') || '', cat: hs.get('cat') || '00000', mt: hs.get('mt') === 'mom' ? 'mom' : 'yoy', prov: hs.get('pv') || 'Gauteng', dg: hs.get('dg') === 't' ? 't' : 's', bk: null,
    all: { q: '', group: '', sel: (hs.get('as') || 'P0141:CPS00000').split('|').filter(Boolean), tf: 'yoy', sortKey: 'yoy', sortDir: -1 },
    prodB: { q: '', group: '', sel: (hs.get('qs') || '').split('|').filter(Boolean), tf: 'yoy', sortKey: 'yoy', sortDir: -1 },
    ppiB: { q: '', group: '', sel: (hs.get('bs') || '').split('|').filter(Boolean), tf: 'yoy', sortKey: 'yoy', sortDir: -1 },
    elB: { q: '', group: '', sel: (hs.get('es') || '').split('|').filter(Boolean), tf: 'yoy', sortKey: 'yoy', sortDir: -1 },
    apB: { q: '', group: '', sel: (hs.get('ab') || '').split('|').filter(Boolean), tf: 'level', sortKey: 'yoy', sortDir: -1 },
  };
  const xstate = {};
  const cmC = Kit.colorMap(PAL), cmP = Kit.colorMap(PAL), cmR = Kit.colorMap(PAL);
  const cs = []; let browsers = []; const kill = () => { while (cs.length) cs.pop().destroy(); browsers.forEach(b => b.destroy()); browsers = []; };
  function save() {
    Kit.hashState.write(TAB, { v: st.v === 'cpi' ? '' : st.v, r: st.fromYear ? '' : (st.range === '10' ? '' : st.range), from: st.fromYear, tf: st.tf === 'yoy' ? '' : st.tf,
      ci: st.ci.join('|') === CPI_DEFAULT.join('|') ? '' : st.ci.join('|'), cp: st.cp, ps: st.ps.join('|'), sec: st.sec === 'PPC30000' ? '' : st.sec, pcp: st.pcp, ptf: st.ptf === 'yoy' ? '' : st.ptf,
      pp: st.prod, pg: st.pg.join('|'), rtf: st.rtf === 'level' ? '' : st.rtf, pm: st.pm === 'map' ? '' : st.pm, cs: st.cs === 'over' ? '' : st.cs, hm: st.hm === 'CPS00000' ? '' : st.hm, at: st.at === 'yoy' ? '' : st.at, mp: st.mp, cat: st.cat === '00000' ? '' : st.cat, mt: st.mt === 'yoy' ? '' : st.mt, pv: st.prov === 'Gauteng' ? '' : st.prov, dg: st.dg === 's' ? '' : st.dg, as: st.all.sel.join('|'), qs: st.prodB.sel.join('|'), bs: st.ppiB.sel.join('|'), es: st.elB.sel.join('|'), ab: st.apB.sel.join('|') });
  }
  const root = Kit.tabShell({ title: 'Prices', pubs: ['P0141', 'P0142.1', 'P0141AP', 'P0142.7'], relevance: RELEVANCE });
  const body = h('div'); Kit.freshOrder(body);                          // fresh, frequently updated charts first; annual / pre-2025 ones below
  const rangeCtl = Kit.rangeCtl(st, () => render());
  const secNav = Kit.segmented([{ v: 'cpi', label: 'Consumer prices (CPI)' }, { v: 'ppi', label: 'Producer prices (PPI)' }, { v: 'rand', label: 'Prices in rand' }, { v: 'trade', label: 'Trade prices' }], st.v, v => { st.v = v; render(); save(); });
  root.appendChild(h('div', { class: 'filters', style: 'margin-bottom:8px' }, secNav, h('label', { class: 'lbl', style: 'margin-left:10px', text: 'All charts', title: 'Sets the range of every chart on this page; each chart also has its own range buttons' }), rangeCtl.el));
  root.appendChild(body);
  const rangeFor = code => { const X = Store.pubX[code]; return rangeCtl.xr(X[0], X[X.length - 1]); };
  const cid = id => C.byId(id), pid = id => P.byId(id);
  const divName = d => { const it = cid('CPS' + d + '000'); return it ? it.measure : d; };
  const short = (t, n) => t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
  const LBL = { CPS00000: 'Headline CPI', CPS00014: 'Core CPI (excl. food, NAB, fuel & energy)', CPS00025: 'Trimmed mean', CPS00006: 'Goods', CPS00007: 'Services', CPS00015: 'Durable goods', CPS00016: 'Semi-durable goods',
    CPS00017: 'Non-durable goods', CPS00009: 'CPI excl. food & NAB', CPS00011: 'CPI excl. food, NAB & fuel', CPS00013: 'CPI excl. fuel & energy', CPS00010: 'CPI excl. fuel', CPS00018: 'CPI excl. energy', CPS00008: 'CPI excl. housing',
    CPS40000: 'CPI excl. owners\u2019 equivalent rent', CPS51000: 'Administered prices', CPS51100: 'Regulated prices', CPS51200: 'Administered, not regulated', CPS00019: 'CPI excl. administered prices',
    CPS00020: 'Administered excl. fuel & paraffin', CPS00021: 'Processed food', CPS00022: 'Unprocessed food', CPS60065: 'CPI for pensioners' };
  const cpiName = it => LBL[it.id] || (it.name ? it.name : it.measure);
  const monthOptions = (it, from, count) => { const per = it.periods, out = []; for (let i = per.length - 1; i >= 0 && out.length < count; i--) { if (from && per[i] < from) break; if (it.v[i - it.s] != null || i < it.s) { if (i >= it.s && i - it.s < it.v.length && it.v[i - it.s] != null) out.push(per[i]); } } return out; };
  const monthSel = (opts, cur, onCh) => { const sel = h('select', { 'aria-label': 'Month' }, opts.map(p => { const o = h('option', { value: p, text: fmt.period(p) }); if (p === cur) o.selected = true; return o; })); sel.addEventListener('change', () => onCh(sel.value)); return sel; };
  const wOf = {};                                                       // division weights = sum of its product weights
  C.items.forEach(it => { if (/^\d{8}$/.test(it.id) && it.w != null) wOf[it.id.slice(0, 2)] = (wOf[it.id.slice(0, 2)] || 0) + it.w; });

  const mapSeg = () => Kit.segmented([{ v: 'map', label: 'Map' }, { v: 'bars', label: 'Bars' }], st.pm, v => { st.pm = v; render(); save(); });
  const cpiLabel = it => cpiName(it) + (it.geo && it.geo !== 'All urban areas' ? ' · ' + it.geo : '');
  const cpiCands = () => C.items.map(it => ({ key: it.id, label: cpiLabel(it), group: /^\d{8}$/.test(it.id) ? 'Product' : (it.geo || 'All urban areas') }));

  /* ============================================================ CPI helpers */
  const PER = window.EQ.pubs.P0141.periods, LASTK = PER.length - 1;
  const FULLC = {}; const full = it => FULLC[it.key] || (FULLC[it.key] = Store.full(it));
  const yoyAt = (it, k) => { if (!it || k < 12) return null; const F = full(it); return Store.pct(F[k], F[k - 12]); };
  const momAt = (it, k) => { if (!it || k < 1) return null; const F = full(it); return Store.pct(F[k], F[k - 1]); };
  const bandAt = p => p < '2025-11' ? [3, 6] : [2, 4];
  const bandText = p => { const b = bandAt(p); return b[0] + '–' + b[1] + '%'; };
  const inBand = (v, p) => v != null && v >= bandAt(p)[0] - 1e-9 && v <= bandAt(p)[1] + 1e-9;
  const bandStreak = k => { const hd = cid('CPS00000'), ins = inBand(yoyAt(hd, k), PER[k]); let n = 1; for (let j = k - 1; j >= 12; j--) { if (inBand(yoyAt(hd, j), PER[j]) === ins) n++; else break; } return { inside: ins, n }; };
  const K_YOY0 = PER.indexOf(BASKET_FROM), K_MOM0 = PER.indexOf('2025-01');
  const divW = d => (wOf[d] || 0) / 100;
  const contribYoY = (d, k) => { if (k < K_YOY0 || K_YOY0 < 0) return null; const it = cid('CPS' + d + '000'), hd = cid('CPS00000'); if (!it) return null; const F = full(it), H = full(hd); return F[k] == null || F[k - 12] == null || !H[k - 12] ? null : divW(d) * (F[k] - F[k - 12]) / H[k - 12] * 100; };
  const contribMoM = (d, k) => { if (k < K_MOM0 || K_MOM0 < 0) return null; const it = cid('CPS' + d + '000'), hd = cid('CPS00000'); if (!it) return null; const F = full(it), H = full(hd); return F[k] == null || F[k - 1] == null || !H[k - 1] ? null : divW(d) * (F[k] - F[k - 1]) / H[k - 1] * 100; };
  const STACKS = [['Food', ['01']], ['Housing & utilities', ['04']], ['Transport', ['07']], ['Alcohol & tobacco', ['02']], ['Clothing & footwear', ['03']], ['Health & education', ['06', '10']], ['All other', ['05', '08', '09', '11', '12', '13']]];
  const PROD = () => C.items.filter(it => /^\d{8}$/.test(it.id) && it.w != null);
  const arrAt = (arr, k) => arr[k] == null ? null : arr[k];
  const sgn = (v, d) => fmt.signed(v, d == null ? 1 : d, '%');

  /* ---------- the written summary ---------- */
  function narrative(host) {
    const hd = cid('CPS00000'), k = LASTK, y = yoyAt(hd, k), yp = yoyAt(hd, k - 1), m = momAt(hd, k), P = [];
    const dir = yp == null ? '' : y > yp + 0.05 ? 'accelerated' : y < yp - 0.05 ? 'cooled' : 'held steady';
    const bs = bandStreak(k);
    P.push(h('p', {}, 'Headline inflation ', dir ? [h('b', { text: dir }), ' to '] : 'was ', h('b', { text: sgn(y) }), ' in ' + fmt.period(PER[k]) + (yp != null ? ' (from ' + sgn(yp) + ' in ' + fmt.period(PER[k - 1]) + ')' : '') + ', a monthly change of ' + sgn(m, 2) + '. That is ', h('b', { text: bs.inside ? 'inside' : 'outside' }), ' the SARB’s ' + bandText(PER[k]) + ' target band' + (bs.n > 1 ? ' for the ' + fmt.ord(bs.n) + ' consecutive month.' : '.')));
    const cons = DIVS.map(d => ({ d, c: contribYoY(d, k), cp: contribYoY(d, k - 1) })).filter(x => x.c != null);
    if (cons.length) {
      cons.sort((a, b) => b.c - a.c);
      const top = cons.slice(0, 3).filter(x => x.c > 0.01), drag = cons[cons.length - 1];
      const nm = d => short(divName(d), 44);
      if (top.length) P.push(h('p', {}, 'The biggest drivers: ', top.map((x, i) => [i ? ', ' : '', h('b', { text: nm(x.d) }), ' (' + fmt.signed(x.c, 1) + ' pp, category at ' + sgn(yoyAt(cid('CPS' + x.d + '000'), k)) + ')']), drag.c < -0.01 ? ['; the main drag was ', h('b', { text: nm(drag.d) }), ' (' + fmt.signed(drag.c, 1) + ' pp).'] : '.'));
      const acc = cons.filter(x => x.cp != null).map(x => ({ d: x.d, a: x.c - x.cp })).sort((a, b) => b.a - a.a);
      if (acc.length && acc[0].a > 0.03) P.push(h('p', {}, 'Momentum shift versus last month: ', h('b', { text: nm(acc[0].d) }), ' added ' + fmt.signed(acc[0].a, 2) + ' pp to the headline rate', acc[acc.length - 1].a < -0.03 ? [', while ', h('b', { text: nm(acc[acc.length - 1].d) }), ' took ' + fmt.signed(-acc[acc.length - 1].a, 2) + ' pp off it.'] : '.'));
    }
    const core = yoyAt(cid('CPS00014'), k);
    if (core != null && y != null) { const g = y - core; P.push(h('p', {}, 'Core inflation is ', h('b', { text: sgn(core) }), ' — headline is ', Math.abs(g) < 0.1 ? 'in line with underlying price pressure.' : g > 0 ? [h('b', { text: fmt.fixed(g, 1) + ' pp above' }), ' core, so food and energy are doing the pushing.'] : [h('b', { text: fmt.fixed(-g, 1) + ' pp below' }), ' core, so food and energy are currently masking underlying pressure.'])); }
    const pr = PROD().map(it => ({ it, c: yoyAt(it, k) })).filter(x => x.c != null).sort((a, b) => b.c - a.c);
    if (pr.length) P.push(h('p', {}, 'At product level the biggest riser is ', h('b', { text: pr[0].it.name }), ' (' + sgn(pr[0].c) + ') and the biggest faller is ', h('b', { text: pr[pr.length - 1].it.name }), ' (' + sgn(pr[pr.length - 1].c) + ').'));
    const pv = PROVINCES.map(([id, nm]) => ({ nm, y: yoyAt(cid(id), k) })).filter(x => x.y != null).sort((a, b) => b.y - a.y);
    if (pv.length >= 8) P.push(h('p', {}, 'Provincial spread: highest in ', h('b', { text: pv[0].nm }), ' (' + sgn(pv[0].y) + '), lowest in ', h('b', { text: pv[pv.length - 1].nm }), ' (' + sgn(pv[pv.length - 1].y) + ').'));
    const d1 = yoyAt(cid('CPSD0001'), k), d10 = yoyAt(cid('CPSD0010'), k);
    if (d1 != null && d10 != null) { const g = d1 - d10; P.push(h('p', {}, 'Inflation inequality: the poorest decile faces ', h('b', { text: sgn(d1) }), ' against ', h('b', { text: sgn(d10) }), ' for the richest — ', Math.abs(g) < 0.1 ? 'essentially equal this month.' : g > 0 ? ['low-income households are experiencing ', h('b', { text: fmt.fixed(g, 1) + ' pp higher' }), ' inflation.'] : ['high-income households are experiencing ', h('b', { text: fmt.fixed(-g, 1) + ' pp higher' }), ' inflation.'])); }
    host.appendChild(h('div', { class: 'narr' }, P));
  }

  /* ---------- breadth, volatility, heat map (overview) ---------- */
  function breadthCard(host) {
    const prods = PROD().map(full), vals = new Array(PER.length).fill(null);
    for (let k = 1; k < PER.length; k++) { let up = 0, n = 0; prods.forEach(F => { const a = F[k], b = F[k - 1]; if (a == null || b == null) return; n++; if (a > b) up++; }); if (n >= 100) vals[k] = up / n * 100; }
    host.appendChild(Kit.cardHead('Inflation breadth', 'Share of the ' + prods.length + ' products in the basket whose price rose on the month. Latest ' + fmt.period(PER[LASTK]) + ': ' + fmt.fixed(vals[LASTK], 0) + '%'));
    const [x0, x1] = rangeFor('P0141');
    cs.push(Kit.seriesLine(host, { code: 'P0141', series: [{ key: 'breadth', name: 'Products rising m/m', color: PAL[0], vals }], x0, x1, height: 220, ref: 50, valFmt: v => fmt.fixed(v, 0) + '%', unit: '% of products; the 50% line separates broad price rises from broad falls', title: 'Inflation breadth' }));
  }
  function volatilityCard(host) {
    const H = full(cid('CPS00000')), mm = H.map((v, k) => k ? Store.pct(v, H[k - 1]) : null), vals = new Array(PER.length).fill(null);
    for (let k = 12; k < PER.length; k++) { const w = mm.slice(k - 11, k + 1); if (w.every(v => v != null)) { const mean = w.reduce((a, b) => a + b, 0) / 12; vals[k] = Math.sqrt(w.reduce((a, b) => a + (b - mean) * (b - mean), 0) / 11); } }
    host.appendChild(Kit.cardHead('Inflation volatility', 'How jumpy monthly headline inflation has been: the standard deviation of the last 12 monthly changes'));
    const [x0, x1] = rangeFor('P0141');
    cs.push(Kit.seriesLine(host, { code: 'P0141', series: [{ key: 'vol', name: '12-month rolling std. dev. of m/m', color: PAL[5], vals }], x0, x1, height: 220, valFmt: v => fmt.fixed(v, 2) + ' pp', unit: 'Percentage points', title: 'Inflation volatility' }));
  }
  function heatCard(host) {
    const opts = [['CPS00000', 'Headline CPI']].concat(DIVS.map(d => ['CPS' + d + '000', divName(d)]));
    if (!opts.some(o => o[0] === st.hm)) st.hm = 'CPS00000';
    const sel = h('select', { 'aria-label': 'Series' }, opts.map(o => { const e = h('option', { value: o[0], text: short(o[1], 40) }); if (o[0] === st.hm) e.selected = true; return e; }));
    sel.addEventListener('change', () => { st.hm = sel.value; render(); save(); });
    host.appendChild(Kit.cardHead('Monthly momentum heat map', 'Month-on-month % change, by year and month — spot seasonal patterns (January price resets, mid-year fuel moves)', sel));
    const it = cid(st.hm), F = full(it), yrs = Array.from(new Set(PER.map(p => +p.slice(0, 4)))).filter(yv => yv >= +PER[LASTK].slice(0, 4) - 11);
    const vals = yrs.map(yv => Array.from({ length: 12 }, (_, c) => { const k = PER.indexOf(yv + '-' + String(c + 1).padStart(2, '0')); return k < 1 ? null : Store.pct(F[k], F[k - 1]); }));
    cs.push(Kit.heatmapChart(host, { rows: yrs.map(String), cols: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], vals, fmt: v => fmt.signed(v, 2), scale: 1.2, title: 'Monthly momentum: ' + short(opts.find(o => o[0] === st.hm)[1], 40) }));
  }

  /* ---------- drivers ---------- */
  function contribOverTime(host) {
    const mode = st.at === 'mom' ? 'mom' : 'yoy', first = mode === 'mom' ? K_MOM0 : K_YOY0;
    const seg = Kit.segmented([{ v: 'yoy', label: 'y/y' }, { v: 'mom', label: 'm/m' }], mode, v => { st.at = v; render(); save(); });
    host.appendChild(Kit.cardHead('Contributions over time', mode === 'mom' ? 'What each group added to (or took off) the monthly change in headline CPI, percentage points — exact from Jan 2025 (Dec 2024 basket)' : 'What each group added to the year-on-year headline rate, percentage points — exact from ' + fmt.period(BASKET_FROM) + ' (the first month a year earlier sits on the Dec 2024 basket)', seg));
    if (first < 0) { host.appendChild(h('div', { class: 'empty', text: 'No months available on the current basket yet.' })); return; }
    const idx = []; for (let k = first; k <= LASTK; k++) idx.push(k);
    const fn = mode === 'mom' ? contribMoM : contribYoY, hd = cid('CPS00000');
    const series = STACKS.map(([nm, ds], gi) => ({ name: nm, color: PAL[gi], vals: idx.map(k => { let s0 = 0, any = false; ds.forEach(d => { const c = fn(d, k); if (c != null) { s0 += c; any = true; } }); return any ? s0 : null; }) }));
    const line = { name: mode === 'mom' ? 'Headline m/m' : 'Headline y/y', color: 'var(--ink)', vals: idx.map(k => mode === 'mom' ? momAt(hd, k) : yoyAt(hd, k)) };
    const resid = idx.map((k, i) => line.vals[i] == null ? null : line.vals[i] - series.reduce((a, se) => a + (se.vals[i] || 0), 0));
    host.appendChild(Kit.legend(series.concat([{ name: line.name, color: line.color }])));
    cs.push(Kit.stackedColumns(host, { labels: idx.map(k => PER[k]), series, line, height: 280, fmtVal: v => fmt.signed(v, 2, ' pp'), label: 'Contributions to CPI inflation over time', title: 'Contributions to CPI inflation over time' }));
    const mx = Math.max.apply(null, resid.filter(v => v != null).map(Math.abs).concat([0]));
    host.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Groups: Food = division 01 · Housing & utilities = 04 · Transport = 07 · Alcohol & tobacco = 02 · Clothing & footwear = 03 · Health & education = 06 + 10 · All other = 05, 08, 09, 11, 12, 13. Largest gap between the stacked parts and the published rate: ' + fmt.fixed(mx, 2) + ' pp (rounding).' }));
  }
  function momentumCards(a, b) {
    const monthsM = monthOptions(cid('CPS00000'), '2025-01', 60);
    if (!monthsM.length) return;
    if (!st.mp || monthsM.indexOf(st.mp) < 0) st.mp = monthsM[0];
    const k = PER.indexOf(st.mp), hd = cid('CPS00000'), hm = momAt(hd, k);
    const mSel = monthSel(monthsM, st.mp, v => { st.mp = v; render(); save(); });
    a.appendChild(Kit.cardHead('This month’s contribution (m/m)', 'What each division added to the ' + sgn(hm, 2) + ' monthly change in headline CPI, ' + fmt.period(st.mp) + ', percentage points', mSel));
    const rows = DIVS.map(d => ({ label: short(divName(d), 34), value: contribMoM(d, k) })).filter(r => r.value != null).sort((x, y) => y.value - x.value);
    cs.push(Kit.hbar(a, { rows, fmtVal: v => fmt.signed(v, 2), rowH: 24, ariaLabel: 'Division contributions to monthly CPI change', title: 'Contribution to monthly CPI change, ' + fmt.period(st.mp), valueLabel: 'pp' }));
    b.appendChild(Kit.cardHead('Momentum: what changed vs last month', 'Change in each division’s contribution to the y/y rate, ' + fmt.period(st.mp) + ' against ' + fmt.period(PER[k - 1]) + ', percentage points'));
    const rows2 = DIVS.map(d => { const c = contribYoY(d, k), cp = contribYoY(d, k - 1); return { label: short(divName(d), 34), value: c != null && cp != null ? c - cp : null }; }).filter(r => r.value != null && Math.abs(r.value) >= 0.005).sort((x, y) => y.value - x.value);
    if (rows2.length) cs.push(Kit.hbar(b, { rows: rows2, fmtVal: v => fmt.signed(v, 2), rowH: 24, ariaLabel: 'Change in contributions', title: 'Change in contribution to y/y inflation, ' + fmt.period(st.mp), valueLabel: 'pp' }));
    else b.appendChild(h('div', { class: 'empty', text: 'Needs a month on the current basket whose previous month is also exact (from ' + fmt.period(PER[K_YOY0 + 1]) + ').' }));
  }
  function attribTable(host) {
    const k = LASTK, hd = cid('CPS00000'), hy = yoyAt(hd, k);
    host.appendChild(Kit.cardHead('Contribution detail', fmt.period(PER[k]) + ' decomposition of the headline rate by division'));
    const rows = DIVS.map(d => ({ d, name: divName(d), w: wOf[d], y: yoyAt(cid('CPS' + d + '000'), k), c: contribYoY(d, k), cp: contribYoY(d, k - 1) })).filter(r => r.c != null).sort((x, y) => y.c - x.c);
    const cols = [
      { key: 'n', label: 'Division', cls: 'l lab', nosort: true, render: r => h('div', { class: 't', title: r.name, text: r.name }) },
      { key: 'w', label: 'Weight', nosort: true, render: r => fmt.fixed(r.w, 2) + '%' },
      { key: 'y', label: 'y/y', nosort: true, render: r => fmt.sg(r.y) },
      { key: 'c', label: 'Contribution', nosort: true, title: 'Percentage points', render: r => fmt.signed(r.c, 2, ' pp') },
      { key: 'a', label: 'vs last month', nosort: true, cls: 'hide-s', title: 'Change in contribution since the previous month, pp', render: r => r.cp == null ? '–' : fmt.signed(r.c - r.cp, 2, ' pp') },
      { key: 's', label: 'Share of headline', nosort: true, cls: 'hide-s', render: r => hy ? fmt.fixed(r.c / hy * 100, 0) + '%' : '–' },
    ];
    const tbl = Kit.table(cols, { sortKey: null, page: 20 }); tbl.set(rows); host.appendChild(tbl.el); tbl.el.style.maxHeight = 'none';
  }

  /* ---------- regions ---------- */
  const PLET = {}; PROVINCES.forEach(([id, nm]) => { PLET[nm] = id[2]; });
  const provCat = (nm, suf) => cid('CP' + PLET[nm] + suf);
  function provCats() {
    const g = C.items.filter(it => it.geo === 'Gauteng' && /^CPG\d{5}$/.test(it.id)), out = [];
    g.forEach(it => { const suf = it.id.slice(3); const n = PROVINCES.filter(([, nm]) => provCat(nm, suf)).length; if (n >= 8) out.push({ suf, name: it.measure, div: /000$/.test(suf) }); });
    return out;
  }
  function regions() {
    const cats = provCats(); if (!cats.some(c => c.suf === st.cat)) st.cat = '00000';
    if (!PROVS_ALL.includes(st.prov)) st.prov = 'Gauteng';
    const metric = st.mt === 'mom' ? 'mom' : 'yoy', fn = metric === 'mom' ? momAt : yoyAt, k = LASTK, mlab = metric === 'mom' ? 'm/m' : 'y/y';
    const catSel = h('select', { 'aria-label': 'Category' }, cats.map(c => { const o = h('option', { value: c.suf, text: (c.div || c.suf === '00000' ? '' : '  ') + short(c.name, 48) }); if (c.suf === st.cat) o.selected = true; return o; }));
    catSel.addEventListener('change', () => { st.cat = catSel.value; render(); save(); });
    const mSeg = Kit.segmented([{ v: 'yoy', label: '% y/y' }, { v: 'mom', label: '% m/m' }], metric, v => { st.mt = v; render(); save(); });
    body.appendChild(h('div', { class: 'filters', style: 'margin:4px 0 8px' }, h('label', { class: 'lbl', text: 'Category' }), catSel, mSeg));
    const catName = cats.find(c => c.suf === st.cat).name;
    const vals = {}; PROVINCES.forEach(([, nm]) => { vals[nm] = fn(provCat(nm, st.cat), k); });
    const nat = fn(cid(st.cat === '00000' ? 'CPS00000' : 'CPS' + st.cat), k);
    const c1 = h('div', { class: 'card' }), c2 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c1, c2));
    c1.appendChild(Kit.cardHead('Provincial inflation map', catName + ' · ' + mlab + ' % · ' + fmt.period(PER[k]) + ' · click a province for its detail'));
    cs.push(Kit.provinceMap(c1, { values: vals, fmt: v => fmt.fixed(v, 1) + '%', pivot: nat, pivotLabel: 'all urban areas', selected: st.prov, onClick: p => { st.prov = p; render(); save(); }, tipLabel: mlab, title: catName + ' by province, ' + mlab + ', ' + fmt.period(PER[k]) }));
    c2.appendChild(Kit.cardHead('Provincial ranking', catName + ' · ' + mlab + ' % · ' + fmt.period(PER[k])));
    const rr = PROVINCES.map(([, nm]) => ({ label: nm, value: vals[nm], tip: [[fmt.sg(vals[nm]), mlab], [fmt.signed(vals[nm] - nat, 1, ' pp'), 'vs all urban areas']] })).filter(r => r.value != null).sort((a, b) => b.value - a.value);
    cs.push(Kit.hbar(c2, { rows: [{ label: 'All urban areas', value: nat, emph: true, tip: [[fmt.sg(nat), mlab]] }].concat(rr), fmtVal: v => fmt.signed(v, 1, '%'), rowH: 26, ariaLabel: 'Provincial ranking', title: catName + ' by province, ' + mlab, valueLabel: mlab + ' %' }));

    // province detail: the 13 divisions for the selected province against all urban areas
    const pSel = h('select', { 'aria-label': 'Province' }, PROVS_ALL.map(p => { const o = h('option', { value: p, text: p }); if (p === st.prov) o.selected = true; return o; }));
    pSel.addEventListener('change', () => { st.prov = pSel.value; render(); save(); });
    const c3 = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(c3);
    c3.appendChild(Kit.cardHead('Provincial detail', st.prov + ' by division, ' + mlab + ' % against all urban areas · ' + fmt.period(PER[k]), pSel));
    const dr = DIVS.map(d => { const p = provCat(st.prov, d + '000'), n = cid('CPS' + d + '000'); return { d, name: divName(d), pv: fn(p, k), nv: fn(n, k) }; }).filter(r => r.pv != null).sort((a, b) => b.pv - a.pv);
    const pAll = fn(provCat(st.prov, '00000'), k);
    const rows3 = [{ label: 'All items', value: pAll, emph: true, tip: [[fmt.sg(pAll), st.prov], [fmt.sg(fn(cid('CPS00000'), k)), 'all urban areas']] }].concat(dr.map(r => ({ label: short(r.name, 36), value: r.pv, tip: [[fmt.sg(r.pv), st.prov], [fmt.sg(r.nv), 'all urban areas'], [fmt.signed(r.pv - (r.nv || 0), 1, ' pp'), 'gap']] })));
    cs.push(Kit.hbar(c3, { rows: rows3, fmtVal: v => fmt.signed(v, 1, '%'), rowH: 24, ariaLabel: 'Province detail', title: st.prov + ' CPI by division, ' + mlab, valueLabel: mlab + ' %' }));

    // race + dispersion
    const [x0, x1] = rangeFor('P0141'), H = full(cid('CPS00000'));
    const c4 = h('div', { class: 'card' }), c5 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c4, c5));
    c4.appendChild(Kit.cardHead('Province race', 'Headline CPI y/y for every province over time; ' + st.prov + ' highlighted, all urban areas dashed'));
    const arr = nm => { const it = cid('CP' + PLET[nm] + '00000'), F = full(it); return F.map((v, i) => i >= 12 ? Store.pct(v, F[i - 12]) : null); };
    const natArr = H.map((v, i) => i >= 12 ? Store.pct(v, H[i - 12]) : null);
    c4.appendChild(Kit.legend([{ name: st.prov + ' (selected)', color: 'var(--accent)' }, { name: 'Other provinces', color: 'var(--axis)' }, { name: 'All urban areas (dashed)', color: 'var(--ink)' }]));
    const others = PROVS_ALL.filter(p => p !== st.prov).map(p => ({ key: p, name: p, color: 'var(--axis)', vals: arr(p), width: 1.3 }));
    cs.push(Kit.seriesLine(c4, { code: 'P0141', series: others.concat([{ key: 'nat', name: 'All urban areas', color: 'var(--ink)', vals: natArr, dash: true }, { key: st.prov, name: st.prov, color: 'var(--accent)', vals: arr(st.prov), width: 2.6 }]), x0, x1, height: 260, zero: true, legend: false, valFmt: v => fmt.signed(v, 1, '%'), title: 'Province race: headline CPI y/y' }));
    c5.appendChild(Kit.cardHead('Regional convergence', 'The gap between the highest and lowest province: a narrowing band means price pressure is spreading evenly'));
    const lo = PER.map((_, i) => { const v = PROVS_ALL.map(p => arr(p)[i]).filter(x => x != null); return v.length ? Math.min.apply(null, v) : null; });
    const hi = PER.map((_, i) => { const v = PROVS_ALL.map(p => arr(p)[i]).filter(x => x != null); return v.length ? Math.max.apply(null, v) : null; });
    cs.push(Kit.seriesLine(c5, { code: 'P0141', series: [{ key: 'nat', name: 'All urban areas', color: PAL[0], vals: natArr }], ribbon: { lo, hi, color: PAL[0], name: 'Range across the 9 provinces' }, x0, x1, height: 260, zero: true, valFmt: v => fmt.signed(v, 1, '%'), title: 'Regional convergence: provincial range of headline CPI y/y' }));
  }

  /* ---------- households ---------- */
  const DEC_PREF = () => (st.dg === 't' && cid('CPTD0001')) ? 'CPTD' : 'CPSD';
  function deciles() {
    const pre = DEC_PREF(), k = LASTK, hd = cid(pre === 'CPTD' ? 'CPT00000' : 'CPS00000'), hy = yoyAt(hd, k);
    const geoSeg = cid('CPTD0001') ? Kit.segmented([{ v: 's', label: 'All urban areas' }, { v: 't', label: 'Total country' }], st.dg === 't' ? 't' : 's', v => { st.dg = v; render(); save(); }) : null;
    const c1 = h('div', { class: 'card' }), c2 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c1, c2));
    c1.appendChild(Kit.cardHead('Inflation by expenditure decile', 'Headline CPI for households ranked by spending (decile 1 = poorest tenth), % y/y, ' + fmt.period(PER[k]), geoSeg));
    const its = Array.from({ length: 10 }, (_, i) => cid(pre + String(i + 1).padStart(4, '0')));
    const rows = its.map((it, i) => it ? { label: 'Decile ' + (i + 1) + (i === 0 ? ' (lowest spend)' : i === 9 ? ' (highest spend)' : ''), value: yoyAt(it, k), tip: [[fmt.sg(yoyAt(it, k)), 'y/y'], [fmt.signed(yoyAt(it, k) - hy, 1, ' pp'), 'vs headline'], [fmt.fixed(it.last, 1), 'index']] } : null).filter(Boolean);
    cs.push(Kit.hbar(c1, { rows: [{ label: pre === 'CPTD' ? 'Total country' : 'All urban areas', value: hy, emph: true, tip: [[fmt.sg(hy), 'y/y']] }].concat(rows), fmtVal: v => fmt.signed(v, 1, '%'), rowH: 24, ariaLabel: 'CPI inflation by expenditure decile', title: 'CPI inflation by expenditure decile', valueLabel: 'y/y %' }));
    c2.appendChild(Kit.cardHead('Inflation inequality over time', 'Poorest decile against richest decile, % y/y — above the headline means low-income households are worse off'));
    const [x0, x1] = rangeFor('P0141'), ya = it => full(it).map((v, i) => i >= 12 ? Store.pct(v, full(it)[i - 12]) : null);
    if (its[0] && its[9]) cs.push(Kit.seriesLine(c2, { code: 'P0141', series: [{ key: 'd1', name: 'Decile 1 (poorest)', color: PAL[5], vals: ya(its[0]) }, { key: 'd10', name: 'Decile 10 (richest)', color: PAL[0], vals: ya(its[9]) }], x0, x1, height: 250, valFmt: v => fmt.signed(v, 1, '%'), zero: true, title: 'Decile 1 vs decile 10 inflation' }));
    // table
    const c3 = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(c3);
    c3.appendChild(Kit.cardHead('Decile detail', 'Index, rates and the five-year trend for each decile'));
    const trs = its.map((it, i) => it ? { name: 'Decile ' + (i + 1), last: it.last, y: yoyAt(it, k), m: momAt(it, k), gap: yoyAt(it, k) - hy, spark: full(it).map((v, j) => j >= 12 ? Store.pct(v, full(it)[j - 12]) : null).slice(-60) } : null).filter(Boolean);
    const cols = [
      { key: 'n', label: 'Decile', cls: 'l lab', nosort: true, render: r => r.name }, { key: 'l', label: 'Index', nosort: true, render: r => fmt.fixed(r.last, 1) },
      { key: 'y', label: 'y/y', nosort: true, render: r => fmt.sg(r.y) }, { key: 'm', label: 'm/m', nosort: true, render: r => fmt.sg(r.m) },
      { key: 'g', label: 'vs headline', nosort: true, cls: 'hide-s', render: r => fmt.signed(r.gap, 1, ' pp') }, { key: 'sp', label: '5-yr y/y', nosort: true, cls: 'hide-s', render: r => Kit.spark(r.spark) },
    ];
    const tbl = Kit.table(cols, { sortKey: null, page: 20 }); tbl.set(trs); c3.appendChild(tbl.el); tbl.el.style.maxHeight = 'none';
  }

  /* ---------- my basket ---------- */
  const PRESETS = [
    { id: 'official', name: 'Official basket', desc: 'The weights StatsSA uses', m: {} },
    { id: 'low', name: 'Low-income household', desc: 'Food and housing weigh far more; little spent on recreation, restaurants or finance', m: { '01': 1.7, '04': 1.3, '07': 0.7, '09': 0.4, '11': 0.3, '12': 0.3 } },
    { id: 'car', name: 'Car commuter', desc: 'Fuel, vehicles and insurance dominate', m: { '07': 2.4, '12': 1.4, '01': 0.9 } },
    { id: 'retiree', name: 'Retiree', desc: 'Health and food weigh more; transport and clothing less', m: { '06': 2.5, '01': 1.2, '07': 0.6, '03': 0.6 } },
    { id: 'family', name: 'Young family', desc: 'Food, education, clothing and furnishings weigh more', m: { '01': 1.3, '10': 2.2, '03': 1.4, '05': 1.3 } },
    { id: 'saver', name: 'Cost-cutter', desc: 'No alcohol, tobacco or eating out; more spent on food at home', m: { '02': 0, '11': 0, '09': 0.5, '01': 1.3 } },
  ];
  const BK_KEY = 'sea.basket';
  const loadBk = () => { try { const j = JSON.parse(localStorage.getItem(BK_KEY) || 'null'); if (j && j.mult) return j; } catch (e) {} return null; };
  const saveBk = () => { try { localStorage.setItem(BK_KEY, JSON.stringify(st.bk)); } catch (e) {} };
  function basketCalc(bk) {
    const prods = PROD(), W = prods.map(it => it.w * ((bk.mult[it.id.slice(0, 2)] != null ? bk.mult[it.id.slice(0, 2)] : 1)) * (bk.excl.indexOf(it.id) >= 0 ? 0 : 1)), F = prods.map(full), tot = W.reduce((a, b) => a + b, 0);
    return {
      tot, rate(k, lag) { if (k < lag) return null; let num = 0, den = 0, cov = 0; for (let i = 0; i < prods.length; i++) { if (!W[i]) continue; const a = F[i][k], b = F[i][k - lag]; if (a == null || b == null) continue; num += W[i] * a; den += W[i] * b; cov += W[i]; } return den && cov >= 0.8 * tot ? (num / den - 1) * 100 : null; },
    };
  }
  function basket() {
    if (!st.bk) st.bk = loadBk() || { preset: 'official', mult: {}, excl: [], spend: 15000 };
    const bk = st.bk, mine = basketCalc(bk), off = basketCalc({ mult: {}, excl: [] }), k = LASTK;
    const myY = mine.rate(k, 12), offY = off.rate(k, 12), myM = mine.rate(k, 1), gap = myY != null && offY != null ? myY - offY : null;
    const spend = bk.spend || 15000, extra = myY != null ? spend - spend / (1 + myY / 100) : null;
    const c1 = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(c1);
    c1.appendChild(Kit.cardHead('My basket', 'Build your own inflation rate: weight the 13 spending divisions the way your household does, optionally drop products you never buy. Your basket is saved in this browser.'));
    c1.appendChild(Kit.kpiStrip([
      { label: 'My basket inflation · y/y', value: sgn(myY), note: 'official basket (rebuilt from products): ' + sgn(offY) },
      { label: 'My basket · m/m', value: sgn(myM, 2) },
      { label: 'Gap vs official', value: gap == null ? '–' : fmt.signed(gap, 1, ' pp'), note: gap == null ? '' : gap > 0 ? 'your basket inflates faster' : 'your basket inflates slower' },
      { label: 'What inflation costs you', value: extra == null ? '–' : 'R ' + fmt.fixed(extra, 0) + ' / month', note: 'on monthly spend of R ' + fmt.fixed(spend, 0) + ' — the same basket cost R ' + fmt.fixed(spend - (extra || 0), 0) + ' a year ago' },
    ]));
    c1.appendChild(h('div', { class: 'addrow', style: 'margin-top:10px' }, h('span', { class: 'lbl', text: 'Start from' }),
      Kit.segmented(PRESETS.map(p => ({ v: p.id, label: p.name, title: p.desc })), bk.preset, v => { const p = PRESETS.find(x => x.id === v); bk.mult = Object.assign({}, p.m); bk.preset = v; saveBk(); render(); }),
      h('label', { class: 'lbl', text: 'Monthly spend (R)' }), (() => { const i = h('input', { type: 'number', min: '0', step: '500', value: spend, style: 'width:100px', 'aria-label': 'Monthly spend in rand' }); i.addEventListener('change', () => { bk.spend = Math.max(0, +i.value || 0); saveBk(); render(); }); return i; })()));
    const grid = h('div', { class: 'bkgrid', style: 'margin-top:10px' }, DIVS.map(d => {
      const i = h('input', { type: 'number', min: '0', max: '5', step: '0.1', value: bk.mult[d] != null ? bk.mult[d] : 1, 'aria-label': 'Weight multiplier for ' + divName(d) });
      i.addEventListener('change', () => { bk.mult[d] = Math.max(0, +i.value || 0); bk.preset = 'custom'; saveBk(); render(); });
      return h('label', {}, h('span', { title: divName(d), text: short(divName(d), 30) + ' (' + fmt.fixed(wOf[d], 1) + '%)' }), h('span', { style: 'display:inline-flex;gap:4px;align-items:center' }, '×', i));
    }));
    c1.appendChild(h('div', { class: 'sub', style: 'margin-top:8px', text: 'Weight multipliers: 1 = official share, 2 = twice as important, 0 = ignore the division. Official weight shown in brackets.' }));
    c1.appendChild(grid);
    const exc = h('div', { class: 'addrow', style: 'margin-top:10px' }, h('span', { class: 'lbl', text: 'Products I never buy' }),
      Kit.chips(bk.excl.map(id => ({ v: id, label: short(cid(id) ? cid(id).name : id, 30) + ' ×' })), bk.excl, () => 'var(--axis)', id => { bk.excl = bk.excl.filter(x => x !== id); bk.preset = 'custom'; saveBk(); render(); }),
      Kit.addSearch({ placeholder: 'Exclude a product… e.g. beer, cigarettes, petrol', candidates: () => PROD().map(it => ({ key: it.id, label: it.name, group: short(it.measure, 28) })), selected: () => bk.excl, onAdd: id => { bk.excl.push(id); bk.preset = 'custom'; saveBk(); render(); } }));
    c1.appendChild(exc);

    const c2 = h('div', { class: 'card' }), c3 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c2, c3));
    const [x0, x1] = rangeFor('P0141'), ya = bkc => PER.map((_, i) => bkc.rate(i, 12));
    c2.appendChild(Kit.cardHead('My inflation vs headline', 'Year-on-year change of your basket against the official weights, with the SARB target range'));
    const bands = [{ x0: -1e9, x1: time.xOf('2025-11'), lo: 3, hi: 6 }, { x0: time.xOf('2025-11'), x1: 1e9, lo: 2, hi: 4 }];
    cs.push(Kit.seriesLine(c2, { code: 'P0141', series: [{ key: 'mine', name: 'My basket', color: PAL[0], vals: ya(mine) }, { key: 'off', name: 'Official basket', color: 'var(--muted)', vals: ya(off), dash: true }], x0, x1, height: 250, zero: true, bands, valFmt: v => fmt.signed(v, 1, '%'), title: 'My basket inflation vs official' }));
    // purchasing power
    c3.appendChild(Kit.cardHead('Purchasing power of your money', 'What R100 from the start of the range buys today, given each basket’s inflation'));
    const k0 = Math.max(1, PER.findIndex((_, i) => Store.pubX.P0141[i] >= x0 - 1e-9));
    const lev = bkc => { const out = new Array(PER.length).fill(null); let L = 100; out[k0] = 100; for (let i = k0 + 1; i <= LASTK; i++) { const m = bkc.rate(i, 1); L = m == null ? L : L * (1 + m / 100); out[i] = L; } return out; };
    const lm = lev(mine), lo = lev(off), pp = l => l.map(v => v == null ? null : 100 * 100 / v);
    cs.push(Kit.seriesLine(c3, { code: 'P0141', series: [{ key: 'm', name: 'My basket', color: PAL[0], vals: pp(lm) }, { key: 'o', name: 'Official basket', color: 'var(--muted)', vals: pp(lo), dash: true }], x0, x1, height: 250, valFmt: v => 'R ' + fmt.fixed(v, 0), unit: 'Rand of purchasing power per R100 spent in ' + fmt.period(PER[k0]), title: 'Purchasing power of R100' }));
    c3.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'R' + fmt.fixed(spend, 0) + ' of purchases in ' + fmt.period(PER[k0]) + ' would cost about R' + fmt.fixed(spend * lm[LASTK] / 100, 0) + ' on your basket today (R' + fmt.fixed(spend * lo[LASTK] / 100, 0) + ' on the official one).' }));
  }

  /* ============================================================ CPI */
  const CPI_SECS = [{ v: 'over', label: 'Overview' }, { v: 'drivers', label: 'What drives it' }, { v: 'regions', label: 'Provinces' }, { v: 'hh', label: 'Households' }, { v: 'explore', label: 'All series' }];
  function renderCpi() {
    const [x0, x1] = rangeFor('P0141'), head = cid('CPS00000'), k = LASTK;
    const bs = bandStreak(k);
    const tiles = CPI_KPI.map(([id, lab]) => {
      const it = cid(id), n = it.v.length, yy = Store.pct(it.last, it.v[n - 13]), mm = Store.pct(it.last, it.v[n - 2]);
      const r1 = v => Math.round(v * 10) / 10, dy = n > 13 ? r1(r1(yy) - r1(Store.pct(it.v[n - 2], it.v[n - 14]))) : null;          // change in the y/y rate since the month before, in pp (rates as published, 1 decimal)
      return { label: lab + ' · y/y' + (dy == null ? '' : ' (' + fmt.sg(dy, 1, ' pp') + ')'), value: fmt.fixed(yy, 1) + '%', delta: [{ text: 'm/m ' }, { text: fmt.sg(mm, 1), bold: true }, { text: ' · index ' }, { text: fmt.fixed(it.last, 1), bold: true }], note: fmt.period(it.lastP) + ' · ' + (it.base || ''), spark: yoySpark(it) };
    });
    tiles.splice(1, 0, { label: 'SARB target band', value: bs.inside ? 'Inside' : 'Outside', delta: [{ text: bandText(PER[k]) + ' target · ' }, { text: bs.n + (bs.n === 1 ? ' month' : ' months'), bold: true }], note: 'headline ' + fmt.fixed(yoyAt(head, k), 1) + '% in ' + fmt.period(PER[k]) });
    body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Headline', 'Consumer price index, all urban areas — year-on-year change; Dec 2024 = 100. Latest ' + fmt.period(cpiPub.last)), Kit.kpiStrip(tiles)));
    body.appendChild(h('div', { class: 'subnav' }, Kit.segmented(CPI_SECS, st.cs, v => { st.cs = v; render(); save(); })));
    const card = (t, sub, tools) => { const c = h('div', { class: 'card', style: 'margin-top:12px' }); if (t) c.appendChild(Kit.cardHead(t, sub, tools)); body.appendChild(c); return c; };
    if (st.cs === 'over') {
      const nc = card('This month in brief', 'A plain-language read of the latest release, written from the data'); narrative(nc);
      measuresChart(card(), x0, x1);
      componentsTable();
      const a = h('div', { class: 'card' }), b = h('div', { class: 'card' }); body.appendChild(h('div', { class: 'grid2' }, a, b)); breadthCard(a); volatilityCard(b);
      heatCard(card());
    } else if (st.cs === 'drivers') {
      contribPanel();
      const a = h('div', { class: 'card' }), b = h('div', { class: 'card' }); body.appendChild(h('div', { class: 'grid2' }, a, b)); momentumCards(a, b);
      contribOverTime(card());
      attribTable(card());
    } else if (st.cs === 'regions') regions();
    else if (st.cs === 'hh') { deciles(); basket(); }
    else exploreCpi();
  }
  function measuresChart(c1, x0, x1) {
    cmC.assign(st.ci);
    const tfSeg = Kit.segmented([{ v: 'yoy', label: '% y/y' }, { v: 'pct', label: '% m/m' }, { v: 'level', label: 'Index' }, { v: 'rebase', label: 'Rebased' }], st.tf, v => { st.tf = v; render(); save(); });
    c1.appendChild(Kit.cardHead('Inflation measures', 'Search to add any series (up to ' + MAX_SEL + '), or click rows in the components table below.', tfSeg));
    c1.appendChild(h('div', { class: 'addrow' }, Kit.chips(st.ci.map(id => ({ v: id, label: cpiName(cid(id)) + ' ×' })), st.ci, k => cmC.of(k), k => toggleCi(k)),
      Kit.addSearch({ placeholder: 'Add a measure, division, province or product… e.g. petrol, bread, Gauteng', candidates: cpiCands, selected: () => st.ci, onAdd: toggleCi, max: MAX_SEL })));
    const bands = st.tf === 'yoy' ? [{ x0: -1e9, x1: time.xOf('2025-11'), lo: 3, hi: 6 }, { x0: time.xOf('2025-11'), x1: 1e9, lo: 2, hi: 4 }] : null;
    cs.push(Kit.linePanel(c1, { entries: st.ci.map(id => ({ key: id, name: cpiName(cid(id)), color: cmC.of(id), it: cid(id) })), tf: st.tf, x0, x1, height: 320, bands,
      notes: bands ? ['Shaded: SARB inflation target range — 3–6% until Oct 2025, then 2–4% (3% ± 1 pp) from Nov 2025.'] : [] }));
  }
  function contribPanel() {
    const head = cid('CPS00000'), months = monthOptions(head, BASKET_FROM, 60);
    const c2 = h('div', { class: 'card', style: 'margin-top:12px' }), c3 = h('div', { class: 'card', style: 'margin-top:12px' });
    body.appendChild(h('div', { class: 'grid2' }, c2, c3));
    if (!months.length) { c2.appendChild(Kit.cardHead('What drove inflation')); c2.appendChild(h('div', { class: 'empty', text: 'Contributions need a year-earlier point on the Dec 2024 basket: available from Dec 2025.' })); return; }
    if (!st.cp || months.indexOf(st.cp) < 0) st.cp = months[0];
    const i = PER.indexOf(st.cp), j = i - 12, hv = Store.full(head), mSel = monthSel(months, st.cp, v => { st.cp = v; render(); save(); });
    c2.appendChild(Kit.cardHead('What drove CPI inflation', 'Contribution of each division to the y/y change in headline CPI, percentage points', mSel));
    const parts = DIVS.map(d => { const it = cid('CPS' + d + '000'), F = Store.full(it); return { label: short(it.measure, 36), cur: F[i], prev: F[j], w: (wOf[d] || 0) / 100, fmtLevel: v => fmt.fixed(v, 1) }; });
    cs.push(Kit.hbar(c2, { rows: Kit.contribRows({ parts, totalCur: hv[i], totalPrev: hv[j], totalLabel: 'Headline CPI y/y', totalTip: 'published index', remainderLabel: 'Rounding' }), fmtVal: v => fmt.signed(v, 2), rowH: 26, ariaLabel: 'Division contributions to CPI inflation', title: 'Division contributions to CPI inflation, ' + fmt.period(st.cp), valueLabel: 'pp' }));
    c2.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Exact: division weights (sum of product weights in the Dec 2024 basket) rebuild the published headline index, so contributions add to the total up to rounding.' }));
    c3.appendChild(Kit.cardHead('Products pushing prices', 'The biggest upward and downward contributions to headline y/y, ' + fmt.period(st.cp) + ' — of 391 products'));
    let denom = 0; const cand = [];
    PROD().forEach(it => { const F = Store.full(it), a = F[i], b = F[j]; if (a == null || b == null) return; denom += it.w * b; cand.push({ it, a, b }); });
    const rows = cand.map(c => ({ label: short(c.it.name, 34), value: c.it.w * (c.a - c.b) / denom * 100, tip: [[fmt.signed(c.it.w * (c.a - c.b) / denom * 100, 3, ' pp'), 'contribution to headline y/y'], [fmt.sg(Store.pct(c.a, c.b)) + ' y/y', c.it.measure], [fmt.fixed(c.it.w, 2) + '%', 'basket weight']] })).sort((x, y) => y.value - x.value);
    const top = rows.slice(0, 8).concat(rows.slice(-8).reverse()).sort((x, y) => y.value - x.value);
    cs.push(Kit.hbar(c3, { rows: top, fmtVal: v => fmt.signed(v, 2), rowH: 22, ariaLabel: 'Product contributions to CPI inflation', title: 'Products pushing CPI, ' + fmt.period(st.cp), valueLabel: 'pp' }));
  }
  function componentsTable() {
    const head = cid('CPS00000'), tc = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(tc);
    tc.appendChild(Kit.cardHead('CPI components', 'Divisions with weights and latest contribution, then the analytical measures. Click a row to chart it above.'));
    const lastIdx = head.periods.length - 1, hv0 = Store.full(head);
    const mkRow = (id, kind) => {
      const it = cid(id); if (!it) return null; const n = it.v.length, F = Store.full(it);
      const w = kind === 'div' ? (wOf[id.slice(3, 5)] || 0) : null;
      const contrib = kind === 'div' && F[lastIdx - 12] != null && hv0[lastIdx - 12] ? w / 100 * (F[lastIdx] - F[lastIdx - 12]) / hv0[lastIdx - 12] * 100 : null;
      return { id, kind, name: kind === 'div' ? it.measure : cpiName(it), last: it.last, yoy: Store.pct(it.last, it.v[n - 13]), mm: Store.pct(it.last, it.v[n - 2]), ann3: n > 3 && it.v[n - 4] ? (Math.pow(it.last / it.v[n - 4], 4) - 1) * 100 : null, w, contrib, spark: it.v.slice(-60) };
    };
    const analytic = ['CPS00000', 'CPS00014', 'CPS00025', 'CPS00006', 'CPS00007', 'CPS00015', 'CPS00016', 'CPS00017', 'CPS00009', 'CPS00011', 'CPS00013', 'CPS00010', 'CPS00018', 'CPS00008', 'CPS40000', 'CPS51000', 'CPS51100', 'CPS51200', 'CPS00019', 'CPS00020', 'CPS00021', 'CPS00022', 'CPS60065'];
    const rowsT = [{ head: 'Divisions' }].concat(DIVS.map(d => mkRow('CPS' + d + '000', 'div')), [{ head: 'Analytical measures' }], analytic.map(id => mkRow(id, 'an'))).filter(Boolean);
    const cols = [
      { key: 'n', label: 'Series', cls: 'l lab', nosort: true, render: r => r.head ? h('b', { text: r.head }) : h('div', { class: 't', title: r.name, text: r.name }) },
      { key: 'w', label: 'Weight', nosort: true, cls: 'hide-s', render: r => r.head ? '' : (r.w == null ? '' : fmt.fixed(r.w, 1) + '%') },
      { key: 'l', label: 'Index', nosort: true, render: r => r.head ? '' : fmt.fixed(r.last, 1) },
      { key: 'y', label: 'y/y', nosort: true, render: r => r.head ? '' : fmt.sg(r.yoy) },
      { key: 'm', label: 'm/m', nosort: true, render: r => r.head ? '' : fmt.sg(r.mm) },
      { key: 'a', label: '3m annualised', nosort: true, cls: 'hide-s', title: 'Latest 3 months, annualised', render: r => r.head ? '' : fmt.sg(r.ann3) },
      { key: 'c', label: 'Contribution', nosort: true, cls: 'hide-s', title: 'Contribution to headline y/y, pp (divisions)', render: r => r.head || r.contrib == null ? '' : fmt.sg(r.contrib, 2, ' pp') },
      { key: 'sp', label: '5-yr trend', nosort: true, cls: 'hide-s', render: r => r.head ? '' : Kit.spark(r.spark) },
    ];
    const tbl = Kit.table(cols, { sortKey: null, page: 60, isSel: r => !r.head && st.ci.includes(r.id), canToggle: r => !r.head, onToggle: r => toggleCi(r.id), canOpen: r => !r.head,
      onOpen: r => Kit.openSeries({ title: r.name, sub: r.kind === 'div' ? 'CPI division' : 'CPI', entries: [{ name: r.name, it: cid(r.id) }],
        toggle: { isOn: () => st.ci.includes(r.id), fn: () => toggleCi(r.id), offLabel: 'Add to the CPI chart', onLabel: 'Remove from the CPI chart' } }) });
    tbl.set(rowsT); tc.appendChild(tbl.el); tbl.el.style.maxHeight = 'none';
    tbl.el.querySelectorAll('tbody tr').forEach((tr, i) => { if (rowsT[i].head) tr.classList.add('total'); });
  }
  function exploreCpi() {
    const items = C.items.filter(it => !/^\d{8}$/.test(it.id)).map(it => ({ key: it.key, name: it.measure + (it.name ? ' · ' + it.name : '') + (it.sub ? ' · ' + it.sub : ''), group: it.geo || 'Other', it }));
    const geos = Array.from(new Set(items.map(r => r.group))).sort();
    if (!st.all.sel.length) st.all.sel = ['P0141:CPS00000'];
    const ba = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(ba);
    ba.appendChild(Kit.cardHead('All CPI index series', items.length + ' series: headline, divisions, groups and analytical measures for all urban areas, rural areas and each province, plus expenditure deciles.'));
    const b1 = Kit.indexBrowser({ items, state: st.all, getRange: () => rangeFor('P0141'), groups: geos, onState: save, unitHint: 'Index, Dec 2024 = 100' }); browsers.push(b1); ba.appendChild(b1.el);
    const pitems = C.items.filter(it => /^\d{8}$/.test(it.id)).map(it => ({ key: it.key, name: it.name, group: it.measure, it, w: it.w }));
    if (!st.prodB.sel.length) st.prodB.sel = pitems.filter(r => /^(White bread|Petrol|Chicken|Maize meal|Electricity)/i.test(r.name)).slice(0, 4).map(r => r.key);
    const bp = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(bp);
    bp.appendChild(Kit.cardHead('All 391 products', 'Index for each product in the CPI basket with its weight (Dec 2024 basket; weights sum to 100).'));
    const b2 = Kit.indexBrowser({ items: pitems, state: st.prodB, getRange: () => rangeFor('P0141'), groups: Array.from(new Set(pitems.map(r => r.group))), onState: save, unitHint: 'Index, Dec 2024 = 100',
      extraCols: [{ key: 'w', label: 'Weight', firstDir: -1, sort: r => r.w, render: r => r.w == null ? '–' : fmt.fixed(r.w, 2) + '%' }] }); browsers.push(b2); bp.appendChild(b2.el);
    const nt = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(nt);
    nt.appendChild(Kit.cardHead('Method notes'));
    nt.appendChild(h('div', { class: 'narr' },
      h('p', { text: 'The index is rebased to Dec 2024 = 100 with a new basket introduced in January 2025. Division weights here are the sum of that basket’s 391 product weights; they rebuild the published headline index, which is why contributions are exact from Dec 2025 (y/y) and Jan 2025 (m/m). Earlier months sit on the previous basket, so the charts show only the published rates for them.' }),
      h('p', { text: 'The SARB target was a 3–6% band until October 2025 and a 3% point target with a ±1 pp tolerance (2–4%) from November 2025. Breadth, volatility and momentum are computed from the published product indices; “My basket” re-weights those indices (a constant-weight, Laspeyres-style calculation) and is an estimate, not a StatsSA statistic.' }),
      h('p', { text: 'Provincial series cover all items and the divisions; deciles rank households by spending and are available for all urban areas and the whole country.' })));
  }
  const yoySpark = it => { const v = it.v, out = []; for (let i = Math.max(12, v.length - 60); i < v.length; i++) out.push(Store.pct(v[i], v[i - 12])); return out; };
  function toggleCi(id) {
    const i = st.ci.indexOf(id);
    if (i >= 0) { if (st.ci.length === 1) return; st.ci.splice(i, 1); } else { if (st.ci.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' series — remove one first'); return; } st.ci.push(id); }
    render(); save();
  }

  /* ============================================================ PPI */
  function renderPpi() {
    const [x0, x1] = rangeFor('P0142.1');
    const tiles = PPI_SECTORS.map(([id, nm]) => { const it = pid(id), n = it.v.length; return { label: nm + ' · y/y', value: fmt.fixed(Store.pct(it.last, it.v[n - 13]), 1) + '%', delta: [{ text: 'm/m ' }, { text: fmt.sg(Store.pct(it.last, it.v[n - 2]), 1), bold: true }, { text: ' · index ' }, { text: fmt.fixed(it.last, 1), bold: true }], note: fmt.period(it.lastP) + ' · Dec 2023 = 100', spark: yoySpark(it) }; });
    body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Headline', 'Producer price index by sector (StatsSA publishes no single combined PPI). Latest ' + fmt.period(ppiPub.last)), Kit.kpiStrip(tiles)));

    // written summary
    const nc = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(nc);
    nc.appendChild(Kit.cardHead('This month in brief — producer prices', 'A plain-language read of the latest release, written from the data'));
    ppiNarrative(nc);

    // PPI vs CPI
    cmP.assign(st.ps);
    const c1 = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(c1);
    const tfSeg = Kit.segmented([{ v: 'yoy', label: '% y/y' }, { v: 'pct', label: '% m/m' }, { v: 'level', label: 'Index' }, { v: 'rebase', label: 'Rebased' }], st.ptf, v => { st.ptf = v; render(); save(); });
    c1.appendChild(Kit.cardHead('Producer vs consumer prices', 'PPI sectors against headline CPI. Search to add any PPI or CPI series, or click rows in the tables below.', tfSeg));
    const nm = key => { const it = Store.byKey.get(key); return it ? (it.pub === 'P0141' ? 'CPI · ' + cpiName(it) : 'PPI · ' + (it.name || it.measure)) : key; };
    c1.appendChild(h('div', { class: 'addrow' }, Kit.chips(st.ps.map(k => ({ v: k, label: short(nm(k), 40) + ' ×' })), st.ps, k => cmP.of(k), k => togglePs(k)),
      Kit.addSearch({ placeholder: 'Add a producer or consumer series… e.g. steel, diesel, maize, core CPI', candidates: () => P.items.map(it => ({ key: it.key, label: 'PPI · ' + (it.name || it.measure), group: it.measure.replace(/^PPI for /, '') })).concat(C.items.filter(it => !/^\d{8}$/.test(it.id)).map(it => ({ key: it.key, label: 'CPI · ' + cpiLabel(it), group: it.geo || 'CPI' }))), selected: () => st.ps, onAdd: togglePs, max: MAX_SEL })));
    cs.push(Kit.linePanel(c1, { entries: st.ps.map(k => ({ key: k, name: nm(k), color: cmP.of(k), it: Store.byKey.get(k) })).filter(e => e.it), tf: st.ptf, x0: Math.max(x0, Store.pubX['P0142.1'][0]), x1, height: 320 }));

    // elementary contributions within a sector
    const sector = PPI_SECTORS.find(s0 => s0[0] === st.sec) || PPI_SECTORS[0];
    const secSel = h('select', { 'aria-label': 'Sector' }, PPI_SECTORS.map(s0 => { const o = h('option', { value: s0[0], text: s0[1] }); if (s0[0] === st.sec) o.selected = true; return o; }));
    secSel.addEventListener('change', () => { st.sec = secSel.value; render(); save(); });
    const head = pid(sector[0]), months = monthOptions(head, null, 36);
    if (!st.pcp || months.indexOf(st.pcp) < 0) st.pcp = months[0];
    const c2 = h('div', { class: 'card' }), c3 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c2, c3));
    c2.appendChild(Kit.cardHead('Products behind the sector move', 'Biggest contributions to the sector’s y/y change, ' + fmt.period(st.pcp), h('span', { style: 'display:inline-flex;gap:6px' }, secSel, monthSel(months, st.pcp, v => { st.pcp = v; render(); save(); }))));
    const per = head.periods, i = per.indexOf(st.pcp), j = i - 12;
    const el = P.items.filter(it => /^\d+$/.test(it.id) && it.w != null && it.measure === sector[2]);
    let denom = 0; const cand = [];
    el.forEach(it => { const F = Store.full(it), a = F[i], b = F[j]; if (a == null || b == null) return; denom += it.w * b; cand.push({ it, a, b }); });
    const rows = cand.map(c => ({ label: short(c.it.name, 32), value: c.it.w * (c.a - c.b) / denom * 100, tip: [[fmt.signed(c.it.w * (c.a - c.b) / denom * 100, 2, ' pp'), 'contribution to the sector y/y'], [fmt.sg(Store.pct(c.a, c.b)) + ' y/y', c.it.sub || ''], [fmt.fixed(c.it.w, 2) + '%', 'weight within sector']] })).sort((a, b) => b.value - a.value);
    const top = rows.slice(0, 7).concat(rows.slice(-7).reverse()).filter((r, k, arr) => arr.indexOf(r) === k).sort((a, b) => b.value - a.value);
    const published = Store.pct(head.v[i - head.s], head.v[j - head.s]);
    cs.push(Kit.hbar(c2, { rows: [{ label: 'Sector y/y (published)', value: published, emph: true, tip: [[fmt.sg(published), 'published sector index']] }].concat(top), fmtVal: v => fmt.signed(v, 2), rowH: 24, ariaLabel: 'Product contributions to PPI' }));
    c2.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Best-effort: contributions use the current (2026) within-sector weights, so they sum to this reconstruction’s own total (' + fmt.sg(rows.reduce((a, r) => a + r.value, 0), 2) + ' pp), which can differ from the published sector rate.' }));
    // sector overview chart (all sectors y/y)
    c3.appendChild(Kit.cardHead('Sectors compared', 'PPI y/y by sector (right now) and the products in each — weights sum to 100 within a sector'));
    const sr = PPI_SECTORS.map(([id, nm0]) => { const it = pid(id); return { label: short(nm0, 34), value: Store.pct(it.last, it.v[it.v.length - 13]), tip: [[fmt.sg(Store.pct(it.last, it.v[it.v.length - 13])), 'y/y'], [fmt.sg(Store.pct(it.last, it.v[it.v.length - 2])), 'm/m'], [P.items.filter(x => /^\d+$/.test(x.id) && x.measure === nm0).length + ' products', 'in the elementary file']] }; }).sort((a, b) => b.value - a.value);
    cs.push(Kit.hbar(c3, { rows: sr, fmtVal: v => fmt.signed(v, 1, '%'), rowH: 30, ariaLabel: 'PPI by sector' }));

    // biggest movers among the elementary products
    const c6 = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(c6);
    const PP = window.EQ.pubs['P0142.1'].periods, kk = PP.length - 1;
    c6.appendChild(Kit.cardHead('Biggest producer-price risers and fallers', 'Elementary products with the largest year-on-year change, ' + fmt.period(PP[kk]) + ' — of ' + el0().length + ' products'));
    const mv = el0().map(r => { const F = Store.full(r.it); return { r, y: Store.pct(F[kk], F[kk - 12]) }; }).filter(x => x.y != null && isFinite(x.y)).sort((a, b) => b.y - a.y);
    const mrows = mv.slice(0, 10).concat(mv.slice(-10)).filter((x, i, arr) => arr.indexOf(x) === i).map(x => ({ label: short(x.r.name, 34), value: x.y, tip: [[fmt.sg(x.y), 'y/y'], [short(x.r.group, 40), 'sector'], [x.r.w == null ? '' : fmt.fixed(x.r.w, 2) + '%', 'weight in sector']] }));
    cs.push(Kit.hbar(c6, { rows: mrows, fmtVal: v => fmt.signed(v, 1, '%'), rowH: 22, ariaLabel: 'Biggest PPI risers and fallers', title: 'Biggest producer-price risers and fallers, ' + fmt.period(PP[kk]), valueLabel: 'y/y %' }));

    // browsers
    const cat = P.items.filter(it => !/^\d+$/.test(it.id)).map(it => ({ key: it.key, name: it.name || it.measure, group: it.measure.replace(/^PPI for /, ''), it }));
    if (!st.ppiB.sel.length) st.ppiB.sel = cat.slice(0, 1).map(r => r.key);
    const b1c = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(b1c);
    b1c.appendChild(Kit.cardHead('All PPI category series', cat.length + ' series: the five sectors, their sub-categories and the analytical series (Dec 2023 = 100).'));
    const b1 = Kit.indexBrowser({ items: cat, state: st.ppiB, getRange: () => rangeFor('P0142.1'), groups: Array.from(new Set(cat.map(r => r.group))), onState: save, unitHint: 'Index, Dec 2023 = 100' }); browsers.push(b1); b1c.appendChild(b1.el);
    const eitems = el0();
    if (!st.elB.sel.length) st.elB.sel = eitems.slice(0, 3).map(r => r.key);
    const b2c = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(b2c);
    b2c.appendChild(Kit.cardHead('All elementary products', eitems.length + ' producer-price products with their within-sector weights.'));
    const b2 = Kit.indexBrowser({ items: eitems, state: st.elB, getRange: () => rangeFor('P0142.1'), groups: PPI_SECTORS.map(s0 => s0[2]), onState: save, unitHint: 'Index',
      extraCols: [{ key: 'w', label: 'Weight', firstDir: -1, sort: r => r.w, render: r => r.w == null ? '–' : fmt.fixed(r.w, 2) + '%' }] }); browsers.push(b2); b2c.appendChild(b2.el);
  }
  function ppiNarrative(host) {
    const PP = window.EQ.pubs['P0142.1'].periods, k = PP.length - 1, P0 = [];
    const yy = (it, kk) => { if (!it || kk < 12) return null; const F = Store.full(it); return Store.pct(F[kk], F[kk - 12]); };
    const hd = pid('PPC30000'), y = yy(hd, k), yp = yy(hd, k - 1);
    if (y == null) { host.appendChild(h('div', { class: 'empty', text: 'No PPI data for the latest month.' })); return; }
    const dir = yp == null ? '' : y > yp + 0.05 ? 'accelerated' : y < yp - 0.05 ? 'cooled' : 'held steady';
    P0.push(h('p', {}, 'Producer price inflation for final manufactured goods ', dir ? [h('b', { text: dir }), ' to '] : 'was ', h('b', { text: fmt.sg(y) }), ' in ' + fmt.period(PP[k]) + (yp != null ? ' (from ' + fmt.sg(yp) + ')' : '') + '.'));
    const sec = PPI_SECTORS.map(([id, nm0]) => ({ nm0, y: yy(pid(id), k) })).filter(x => x.y != null).sort((a, b) => b.y - a.y);
    if (sec.length > 1) P0.push(h('p', {}, 'Across sectors: ', h('b', { text: sec[0].nm0 }), ' is running hottest at ' + fmt.sg(sec[0].y) + ', while ', h('b', { text: sec[sec.length - 1].nm0 }), ' is lowest at ' + fmt.sg(sec[sec.length - 1].y) + '.'));
    const cp = cid('CPS00000'), cy = cp ? Store.pct(cp.last, cp.v[cp.v.length - 13]) : null;
    if (cy != null) { const g = y - cy; P0.push(h('p', {}, 'Final-goods PPI is ', h('b', { text: fmt.fixed(Math.abs(g), 1) + ' pp ' + (g >= 0 ? 'above' : 'below') }), ' consumer inflation (' + fmt.sg(cy) + ') — ' + (g > 0.5 ? 'producer cost pressure that has not fully reached consumers yet.' : g < -0.5 ? 'consumer prices running ahead of producer costs.' : 'the two are broadly in step.'))); }
    const mv = el0().map(r => { const F = Store.full(r.it); return { r, y: Store.pct(F[k], F[k - 12]) }; }).filter(x => x.y != null && isFinite(x.y)).sort((a, b) => b.y - a.y);
    if (mv.length > 1) P0.push(h('p', {}, 'At product level the biggest riser is ', h('b', { text: mv[0].r.name }), ' (' + fmt.sg(mv[0].y) + ') and the biggest faller is ', h('b', { text: mv[mv.length - 1].r.name }), ' (' + fmt.sg(mv[mv.length - 1].y) + ').'));
    host.appendChild(h('div', { class: 'narr' }, P0));
  }
  const el0 = () => P.items.filter(it => /^\d+$/.test(it.id)).map(it => ({ key: it.key, name: it.name, group: it.measure, it, w: it.w }));
  function togglePs(k) {
    const i = st.ps.indexOf(k);
    if (i >= 0) { if (st.ps.length === 1) return; st.ps.splice(i, 1); } else { if (st.ps.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' series — remove one first'); return; } st.ps.push(k); }
    render(); save();
  }

  /* ============================================================ Prices in rand */
  function renderRand() {
    const [x0, x1] = rangeFor('P0141AP');
    const urban = A.items.filter(it => it.geo === 'All urban areas');
    const dname = {}; C.items.forEach(it => { if (/^\d{8}$/.test(it.id)) dname[it.id.slice(0, 2)] = it.measure; });
    const prodKey = it => it.id;                                                   // "<8-digit code>.<pack code>"
    const label = it => it.measure + ' · ' + it.name;
    const sorted = urban.slice().sort((a, b) => (dname[a.id.slice(0, 2)] || '').localeCompare(dname[b.id.slice(0, 2)] || '') || label(a).localeCompare(label(b)));
    // how many provinces report each product at the latest month (StatsSA collects many products in only a few provinces)
    const provCount = {}; A.items.forEach(it => { if (it.geo !== 'All urban areas' && it.lastP === apPub.last) { const k = it.id.split('.').slice(0, 2).join('.'); provCount[k] = (provCount[k] || 0) + 1; } });
    if (!st.prod || !urban.some(u => prodKey(u) === st.prod)) {
      const wide = urban.filter(u => (provCount[prodKey(u)] || 0) >= 9 && u.lastP === apPub.last);
      const d = wide.find(u => /^White (bread|rice)/i.test(u.measure)) || wide.find(u => /bread|rice|milk|maize/i.test(u.measure)) || wide[0] || urban[0]; st.prod = prodKey(d);
    }
    const cur = urban.find(u => prodKey(u) === st.prod);
    const sel = Kit.pickSearch({ options: sorted.map(u => ({ key: prodKey(u), label: label(u), group: dname[u.id.slice(0, 2)] || 'Other' })), value: st.prod, ariaLabel: 'Product', placeholder: 'Search ' + urban.length + ' products\u2026 e.g. white bread, petrol, eggs', width: '420px', onChange: k => { st.prod = k; render(); save(); } });
    const provItems = A.items.filter(it => it.id.indexOf(st.prod + '.') === 0);
    const byProv = {}; provItems.forEach(it => { byProv[it.geo] = it; });
    const n = cur.v.length, yy = Store.pct(cur.last, cur.v[n - 13]);
    const prices = PROVS_ALL.filter(g => byProv[g] && byProv[g].lastP === apPub.last).map(g => ({ g, it: byProv[g], p: byProv[g].last }));
    const cheap = prices.length > 1 ? prices.slice().sort((a, b) => a.p - b.p)[0] : null, dear = prices.length > 1 ? prices.slice().sort((a, b) => b.p - a.p)[0] : null;
    body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Pick a product', 'StatsSA’s average retail price panel: ' + urban.length + ' products nationally (all urban areas) and by province. Prices are in rand, not an index.', sel),
      Kit.kpiStrip([
        { label: label(cur) + ' · ' + fmt.period(cur.lastP), value: 'R ' + fmt.fixed(cur.last, 2), delta: [{ text: 'y/y ' }, { text: fmt.sg(yy), bold: true }, { text: ' · since 2017 ' }, { text: fmt.sg(Store.pct(cur.last, cur.v[0])), bold: true }], note: 'All urban areas, ' + (cur.name || ''), spark: cur.v.slice(-60) },
        cheap ? { label: 'Cheapest province', value: cheap.g, delta: [{ text: 'R ' + fmt.fixed(cheap.p, 2), bold: true }, { text: ' (' + fmt.sg(Store.pct(cheap.p, cur.last)) + ' vs all urban)' }] } : null,
        dear ? { label: 'Dearest province', value: dear.g, delta: [{ text: 'R ' + fmt.fixed(dear.p, 2), bold: true }, { text: ' (' + fmt.sg(Store.pct(dear.p, cur.last)) + ' vs all urban)' }] } : null,
        (cur.x && cur.x['March Online Price']) ? { label: 'March online price', value: 'R ' + fmt.fixed(+cur.x['March Online Price'], 2), note: 'StatsSA\u2019s online price collection for this product, published in the same workbook' } : null,
        cheap && dear ? { label: 'Spread', value: fmt.fixed(Store.pct(dear.p, cheap.p), 0) + '%', note: 'dearest vs cheapest province' } : null,
      ].filter(Boolean))));

    const c1 = h('div', { class: 'card' }), c2 = h('div', { class: 'card' });
    body.appendChild(h('div', { class: 'grid2' }, c1, c2));
    c1.appendChild(Kit.cardHead('Price by province', 'Latest average price in rand and how far each province is from the all-urban price', mapSeg()));
    const rows = prices.sort((a, b) => a.p - b.p).map(r => ({ label: r.g, value: r.p, tip: [['R ' + fmt.fixed(r.p, 2), 'average price'], [fmt.sg(Store.pct(r.p, cur.last)) + ' vs all urban', 'R ' + fmt.fixed(cur.last, 2)], [fmt.sg(Store.pct(r.p, r.it.v[Math.max(0, r.it.v.length - 13)])) + ' y/y', '']] }));
    if (st.pm === 'map' && prices.length >= 2) {
      const pv = {}; PROVS_ALL.forEach(g => { pv[g] = byProv[g] && byProv[g].lastP === apPub.last ? byProv[g].last : null; });
      cs.push(Kit.provinceMap(c1, { values: pv, fmt: v => 'R ' + fmt.fixed(v, 2), pivot: cur.last, pivotLabel: 'all urban areas', tipLabel: 'average price', title: label(cur) + ' by province, ' + fmt.period(apPub.last) }));
    } else
    cs.push(Kit.hbar(c1, { rows: [{ label: 'All urban areas', value: cur.last, emph: true, tip: [['R ' + fmt.fixed(cur.last, 2), 'average price']] }].concat(rows), fmtVal: v => 'R ' + fmt.fixed(v, 2), rowH: 26, ariaLabel: 'Average price by province' }));
    if (prices.length < 2) c1.appendChild(h('div', { class: 'note', text: prices.length ? 'StatsSA collects this pack size in ' + prices[0].g + ' only, so there is no province comparison.' : 'This product has no recent province prices.' }));
    else if (prices.length < 9) c1.appendChild(h('div', { class: 'note', text: 'Only ' + prices.length + ' of 9 provinces report this product.' }));

    // line chart: all urban + chosen provinces
    const cm = cmR; const keys = ['All urban areas'].concat(st.pg.filter(g => byProv[g]));
    cm.assign(keys);
    const tfSeg = Kit.segmented([{ v: 'level', label: 'Rand' }, { v: 'yoy', label: '% y/y' }, { v: 'rebase', label: 'Rebased' }], st.rtf, v => { st.rtf = v; render(); save(); });
    c2.appendChild(Kit.cardHead('Price over time', 'All urban areas against the provinces you pick', tfSeg));
    c2.appendChild(h('div', { style: 'margin:6px 0' }, Kit.chips(PROVS_ALL.filter(g => byProv[g]).map(g => ({ v: g, label: g })), st.pg, g => cm.of(g), g => {
      const i = st.pg.indexOf(g); if (i >= 0) st.pg.splice(i, 1); else if (st.pg.length < MAX_SEL - 1) st.pg.push(g); render(); save(); })));
    const entries = [{ key: 'All urban areas', name: 'All urban areas', color: cm.of('All urban areas'), it: cur }].concat(st.pg.filter(g => byProv[g]).map(g => ({ key: g, name: g, color: cm.of(g), it: byProv[g] })));
    cs.push(Kit.linePanel(c2, { entries, tf: st.rtf, x0, x1, height: 280, unit: st.rtf === 'level' ? 'Rand per ' + (cur.name || 'pack') : undefined, valFmt: v => st.rtf === 'yoy' ? fmt.signed(v, 1, '%') : st.rtf === 'rebase' ? fmt.fixed(v, 1) : 'R ' + fmt.fixed(v, 2) }));

    // browser of all national prices
    const items = urban.map(u => ({ key: u.key, name: label(u), group: dname[u.id.slice(0, 2)] || 'Other', it: u }));
    if (!st.apB.sel.length) st.apB.sel = [cur.key];
    const bc = h('div', { class: 'card', style: 'margin-top:12px' }); body.appendChild(bc);
    bc.appendChild(Kit.cardHead('All national prices', items.length + ' products and pack sizes, rand. The province prices (' + (A.items.length - urban.length).toLocaleString('en-US') + ' series) are reachable through the product picker above.'));
    const b = Kit.indexBrowser({ items, state: st.apB, getRange: () => rangeFor('P0141AP'), groups: Array.from(new Set(items.map(r => r.group))), onState: save, unitHint: 'Rand', lastLabel: 'Latest (R)', fmtLast: v => v == null ? '–' : fmt.fixed(v, 2) });
    browsers.push(b); bc.appendChild(b.el);
  }

  function render() { Kit.keepScroll(renderBody); }
  function renderBody() {
    kill(); clear(body);
    if (st.v === 'cpi') renderCpi(); else if (st.v === 'ppi') renderPpi(); else if (st.v === 'trade') Extras.tradePrices({ tab: TAB, body, cs, xr: rangeFor, redo: () => { render(); save(); }, state: xstate, browsers }); else renderRand();
    body.appendChild(h('div', { class: 'foot', text: 'CPI, PPI and average prices are StatsSA releases P0141 and P0142.1. For the full CPI & PPI workbench (My Basket, purchasing power, regional convergence) see the SA CPI & PPI dashboard (sacpi.pages.dev). Every series in the three publications is reachable here through the tables, browsers and product picker.' }));
  }
  document.addEventListener('themechange', () => { cs.forEach(c => c.redraw && c.redraw()); browsers.forEach(b => b.redraw()); });
  coverage(); render();
  return { el: root, destroy() { kill(); } };
}
window.Prices = { create, coverage };
})();
