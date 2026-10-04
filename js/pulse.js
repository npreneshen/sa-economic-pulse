/* pulse.js - Pulse tab: one heat tile per headline series, grouped by sector, plus the release calendar.
   Colour = direction and size of the year-on-year move (blue = up, red = down, neutral midpoint); text stays in ink. */
(function () {
'use strict';
const { h, clear, fmt, time } = Kit;
const Store = Kit.store;
const TAB = 'pulse';

// kind: 'idx' (y/y in %), 'pct' (series is a percentage: y/y in pp), flow12 (monthly flow compared as trailing 12-month sums)
function defs() {
  const L = {}; ['P2041', 'P3041.2', 'P3043', 'P4141', 'P6242.1', 'P6343.2', 'P6141.2', 'P5041.1', 'P0151.1', 'P0160', 'P6410', 'P0021', 'P0141', 'P0142.1', 'P7162', 'P6420', 'P0142.7', 'P0043.1', 'P0043.2', 'P0044', 'P0441', 'P0211', 'P0277', 'P0045', 'P9110.1'].forEach(c => { L[c] = Kit.lookup(TAB, c); });
  const pair = (c, a, s) => ({ actual: L[c].byId(a), sa: s ? L[c].byId(s) : null });
  const S = [];
  const add = (sector, tab, label, o) => { if (o.actual || o.derived) S.push(Object.assign({ sector, tab, label }, o)); };
  add('Resources', 'resources', 'Mining volume', Object.assign(pair('P2041', 'FMP20000', 'FMS20000'), { fl: fmt.num, note: 'index, 2019 = 100' }));
  add('Resources', 'resources', 'Gold volume', Object.assign(pair('P2041', 'FMP24000', 'FMS24000'), { fl: fmt.num, note: 'index' }));
  add('Resources', 'resources', 'PGM volume', Object.assign(pair('P2041', 'FMP23023', 'FMS23023'), { fl: fmt.num, note: 'index' }));
  add('Resources', 'resources', 'Coal volume', Object.assign(pair('P2041', 'FMP21000', 'FMS21000'), { fl: fmt.num, note: 'index' }));
  add('Resources', 'resources', 'Iron ore volume', Object.assign(pair('P2041', 'FMP23010', 'FMS23010'), { fl: fmt.num, note: 'index' }));
  add('Industrials', 'industrials', 'Manufacturing volume', Object.assign(pair('P3041.2', 'MPI30000', 'MPS30000'), { fl: fmt.num, note: 'index, 2019 = 100' }));
  add('Industrials', 'industrials', 'Capacity utilisation', { actual: L['P3043'].byId('MUP30010'), kind: 'pct', fl: v => fmt.fixed(v, 1) + '%', note: 'quarterly, % of capacity' });
  add('Industrials', 'industrials', 'Electricity available', Object.assign(pair('P4141', 'ELEKTR10', 'ELEKTS10'), { fl: v => fmt.num(v) + ' GWh', note: 'for distribution' }));
  add('Industrials', 'industrials', 'Electricity production', Object.assign(pair('P4141', 'ELEKIN11', 'ELEKIS11'), { fl: fmt.num, note: 'volume index' }));
  add('Industrials', 'industrials', 'Freight payload (land)', Object.assign(pair('P7162', 'payl_totl', 'fpayl1_tot_d11'), { fl: v => fmt.num(v) + ' k tons', note: 'rail + road, monthly' }));
  add('Consumer', 'consumer', 'Retail sales (real)', Object.assign(pair('P6242.1', 'con_act', 'con_seas'), { fl: v => fmt.bn(v), note: 'constant prices, monthly' }));
  add('Consumer', 'consumer', 'Motor trade (real)', Object.assign(pair('P6343.2', 'Con_act', 'Con_seas'), { fl: v => fmt.bn(v), note: 'constant prices, monthly' }));
  add('Consumer', 'consumer', 'Food & beverages (real)', Object.assign(pair('P6420', 'D64200_CON', 'D64200_CON_D11'), { fl: v => fmt.bn(v), note: 'restaurants, take-aways, caterers' }));
  add('Consumer', 'consumer', 'Wholesale (real)', Object.assign(pair('P6141.2', 'con_act', 'con_seas'), { fl: v => fmt.bn(v), note: 'constant prices, monthly' }));
  const bp = (meas, adj) => L['P5041.1'].find({ measure: meas, name: 'Total', sub: '', price: 'current', adj, geo: 'South Africa' });
  add('Property & construction', 'property', 'Building plans passed', { actual: bp(/^Building plans/, 'nsa'), flow12: true, fl: v => fmt.rands(v), note: 'value, 12 months' });
  add('Property & construction', 'property', 'Buildings completed', { actual: bp(/^Buildings reported/, 'nsa'), flow12: true, fl: v => fmt.rands(v), note: 'value, 12 months' });
  add('Property & construction', 'property', 'Construction costs', { actual: L['P0151.1'].byId('JB000050'), fl: fmt.num, note: 'index, Dec 2023 = 100' });
  add('Property & construction', 'property', 'House prices', { actual: L['P0160'].byId('RPPI1000'), fl: fmt.num, note: 'national, Dec 2020 = 100' });
  const tp = (meas, adj) => L['P6410'].find({ measure: meas, name: 'Total industry', adj });
  add('Travel & leisure', 'travel', 'Accommodation occupancy', { actual: tp('Occupancy rate', 'nsa'), sa: tp('Occupancy rate', 'sa'), kind: 'pct', fl: v => fmt.fixed(v, 1) + '%', note: 'total industry' });
  add('Travel & leisure', 'travel', 'Accommodation income', { actual: tp('Total income', 'nsa'), flow12: true, fl: v => fmt.bn(v), note: 'total, 12 months' });
  // prices: CPI and PPI (index series; y/y on the index itself)
  const Lc = Kit.lookup(TAB, 'P0141', { includeDiscontinued: true }), Lp = Kit.lookup(TAB, 'P0142.1', { includeDiscontinued: true });
  add('Prices', 'prices', 'Headline CPI', { actual: Lc.byId('CPS00000'), yoyDelta: true, fl: v => fmt.fixed(v, 1), note: 'index, Dec 2024 = 100' });
  add('Prices', 'prices', 'Core CPI', { actual: Lc.byId('CPS00014'), yoyDelta: true, fl: v => fmt.fixed(v, 1), note: 'excl. food, fuel & energy' });
  add('Prices', 'prices', 'PPI: final manufactured', { actual: Lp.byId('PPC30000'), fl: v => fmt.fixed(v, 1), note: 'index, Dec 2023 = 100' });
  add('Prices', 'prices', 'Export prices', { actual: L['P0142.7'].byId('UVI10000'), fl: v => fmt.fixed(v, 1), note: 'unit values, Dec 2024 = 100' });
  add('Prices', 'prices', 'Import prices', { actual: L['P0142.7'].byId('UVI20000'), fl: v => fmt.fixed(v, 1), note: 'unit values, Dec 2024 = 100' });
  add('Prices', 'prices', 'PPI: mining', { actual: Lp.byId('PPF10000'), fl: v => fmt.fixed(v, 1), note: 'index, Dec 2023 = 100' });
  // economy: growth, jobs, investment, municipal finance
  add('Economy', 'economy', 'Real GDP', Object.assign(pair('P0441', 'QRU1000', 'QRS1000'), { fl: v => fmt.bn(v), note: 'constant 2015 prices, quarterly' }));
  add('Jobs & wages', 'economy', 'Unemployment rate', { actual: L['P0211'].byId('T2|Both sexes > Labour underutilization indicators (%) > LU1- Unemployment rate'), kind: 'pct', fl: v => fmt.fixed(v, 1) + '%', note: 'QLFS, official, quarterly' });
  add('Jobs & wages', 'economy', 'Expanded unemployment', { actual: L['P0211'].byId('T2|Both sexes > Labour underutilization indicators (%) > LU4 - Composite measure of labour underutilization'), kind: 'pct', fl: v => fmt.fixed(v, 1) + '%', note: 'QLFS, incl. discouraged' });
  add('Jobs & wages', 'economy', 'People employed', { actual: L['P0211'].byId('T2|Both sexes > Population 15-64 years > Labour Force > Employed'), fl: v => fmt.fixed(v / 1000, 2) + ' m', note: 'QLFS, quarterly' });
  add('Jobs & wages', 'economy', 'Formal employees', { actual: L['P0277'].byId('EMP|TOTAL|TOTAL'), fl: v => fmt.fixed(v / 1e6, 2) + ' m', note: 'QES payroll survey, quarterly' });
  add('Economy', 'economy', 'Private capex', { actual: L['P0045'].byId('QCE000017'), fl: v => fmt.bn(v), note: 'QCE, quarterly, current prices' });
  const mr = L['P9110.1'].byId('CR|All 130 municipalities|Total revenue');
  if (mr) add('Public finance', 'economy', 'Municipal revenue', { actual: Store.derive(mr, 'pulse:mrev', 'Municipal revenue', Store.full(mr).map(v => v == null ? null : v / 1000), { unit: 'R million' }), fl: v => fmt.bn(v), note: '130 largest municipalities, quarterly' });
  // credit stress and quarterly results
  add('Corporate', 'corporate', 'Liquidations', { actual: L['P0043.1'].byId('LIQ00000'), flow12: true, fl: v => fmt.num(v), note: 'companies + close corps, 12 months' });
  add('Corporate', 'corporate', 'Insolvencies', { actual: L['P0043.2'].byId('INV00000'), flow12: true, fl: v => fmt.num(v), note: 'individuals, 12 months' });
  add('Corporate', 'corporate', 'Quarterly turnover', { actual: L['P0044'].byId('Turnover|All industries|Total'), fl: v => fmt.bn(v), note: 'all industries, QFS, vs same quarter a year ago' });
  // corporate: annual
  const fy = (code, no) => L['P0021'].byId(code + '.' + no);
  const turn = fy('FTURN', '10'), fp = fy('FPROF', '10'), tx = fy('FTAX', '10');
  if (turn && fp && tx) {
    const A = Store.full(fp), B = Store.full(tx), T = Store.full(turn);
    const marg = Store.derive(turn, 'pulse:margin', 'Net margin', A.map((x, i) => x == null || B[i] == null || !(T[i] > 0) ? null : (x - B[i]) / T[i] * 100), { unit: 'Percentage' });
    add('Corporate', 'corporate', 'Corporate turnover', { actual: turn, fl: v => fmt.bn(v), note: 'all industries, annual' });
    add('Corporate', 'corporate', 'Net profit margin', { actual: marg, kind: 'pct', fl: v => fmt.fixed(v, 1) + '%', note: 'all industries, annual' });
  }
  // money, markets, external, public finance, labour and sentiment: read live from the Reserve Bank's data service (js/feeds.js); the tiles appear once those series are in the browser
  if (window.Feeds) {
    const F = (c, p) => Feeds.get(c, p), usd = v => 'US$ ' + fmt.fixed(v / 1000, 1) + ' bn', pc = v => fmt.fixed(v, 1) + '%';
    add('Money & markets', 'markets', 'Policy rate', { actual: F('MMRD002A'), kind: 'pct', fl: v => fmt.fixed(v, 2) + '%', note: 'set by the MPC, month-end' });
    add('Money & markets', 'markets', 'Prime lending rate', { actual: F('MMRD000A', 'RATES'), kind: 'pct', fl: v => fmt.fixed(v, 2) + '%', note: 'commercial banks, month-end' });
    add('Money & markets', 'markets', '91-day T-bill', { actual: F('MMRD203A', 'RATES'), kind: 'pct', fl: v => fmt.fixed(v, 2) + '%', note: 'tender rate, monthly average' });
    add('Money & markets', 'markets', 'Long bond yield', { actual: F('CMJM004A'), kind: 'pct', fl: v => fmt.fixed(v, 2) + '%', note: 'government bonds, monthly average' });
    add('Money & markets', 'markets', 'Rand per US dollar', { actual: F('EXCB135M'), fl: v => 'R ' + fmt.fixed(v, 2), note: 'monthly average; higher = weaker rand' });
    add('Banking & credit', 'markets', 'M3 money growth', { actual: F('MON0300P'), kind: 'pct', fl: pc, note: 'growth over 12 months' });
    add('Banking & credit', 'markets', 'Private-sector credit growth', { actual: F('MON0023P'), kind: 'pct', fl: pc, note: 'growth over 12 months' });
    add('Banking & credit', 'markets', 'Total credit growth', { actual: F('MON0075P', 'MRDMA'), kind: 'pct', fl: pc, note: 'all domestic credit, 12 months' });
    add('Banking & credit', 'markets', 'Household credit', { actual: F('MON0255A', 'CDACSM'), fl: v => fmt.bn(v), note: 'total to households, month-end' });
    add('Banking & credit', 'markets', 'Mortgage advances', { actual: F('MON0232A', 'CDACSM'), fl: v => fmt.bn(v), note: 'households, month-end' });
    add('External & trade', 'markets', 'Gross reserves', { actual: F('BOP5806M'), fl: usd, note: 'Reserve Bank, month-end' });
    add('External & trade', 'markets', 'Effective exchange rate', { actual: F('BOP5396M'), fl: v => fmt.fixed(v, 1), note: 'nominal, trade-weighted index' });
    add('External & trade', 'markets', 'Exports (value)', { actual: F('CURX600A', 'MKTM'), flow12: true, fl: v => fmt.bn(v), note: 'merchandise, 12 months' });
    add('External & trade', 'markets', 'Imports (value)', { actual: F('CURM600A', 'MKTM'), flow12: true, fl: v => fmt.bn(v), note: 'merchandise, 12 months' });
    add('Public finance', 'markets', 'Government revenue', { actual: F('NGFC020M', 'MRDFG'), flow12: true, fl: v => fmt.bn(v), note: 'national, cash basis, 12 months' });
    add('Public finance', 'markets', 'Government spending', { actual: F('NGFC040M', 'MRDFG'), flow12: true, fl: v => fmt.bn(v), note: 'national, cash basis, 12 months' });
    add('Public finance', 'markets', 'Government loan debt', { actual: F('NGD1213A', 'CGDEBTM'), fl: v => fmt.bn(v), note: 'gross, budgetary central government' });
    add('Economy', 'economy', 'Household spending (real)', { actual: F('NRI6007D', 'NATACCQ'), fl: v => fmt.bn(v), note: 'constant 2015 prices, seasonally adjusted' });
    add('Economy', 'economy', 'Fixed investment (real)', { actual: F('NRI6009D', 'NATACCQ'), fl: v => fmt.bn(v), note: 'constant 2015 prices, seasonally adjusted' });
    add('Economy', 'economy', 'Exports (real)', { actual: F('NRI6013D', 'NATACCQ'), fl: v => fmt.bn(v), note: 'goods and services, constant 2015 prices' });
    add('Jobs & wages', 'economy', 'Participation rate', { actual: F('LABT081A', 'ECOINDQ'), kind: 'pct', fl: pc, note: 'labour force, quarterly' });
    add('Jobs & wages', 'economy', 'Wages and earnings', { actual: F('LABP130L', 'ECOINDQ'), fl: v => fmt.fixed(v, 1), note: 'index, seasonally adjusted' });
    add('Business cycle', 'economy', 'Leading indicator', { actual: F('DIFN003A'), fl: v => fmt.fixed(v, 1), note: 'composite, 2019 = 100' });
    add('Business cycle', 'economy', 'Coincident indicator', { actual: F('DIFN002A'), fl: v => fmt.fixed(v, 1), note: 'composite, 2019 = 100' });
    add('Business cycle', 'economy', 'Lagging indicator', { actual: F('DIFN007A', 'MRDEI'), fl: v => fmt.fixed(v, 1), note: 'composite, 2019 = 100' });
    add('Prices', 'prices', 'Inflation expectations', { actual: F('CPI7001F', 'ECOINDQ'), kind: 'pct', fl: pc, note: 'one year ahead, surveyed' });
    add('Resources', 'resources', 'Gold price (US$)', { actual: F('GDPL201D', 'FXD'), fl: v => 'US$ ' + fmt.num(v), note: 'London fixing, monthly average' });
  }
  return S;
}
const FEED_CODES = ['MMRD002A', 'MMRD000A', 'MMRD203A', 'CMJM004A', 'EXCB135M', 'BOP5396M', 'MON0300P', 'MON0023P', 'MON0075P', 'MON0255A', 'MON0232A', 'BOP5806M', 'CURX600A', 'CURM600A', 'NGFC020M', 'NGFC040M', 'NGD1213A', 'NRI6007D', 'NRI6009D', 'NRI6013D', 'LABT081A', 'LABP130L', 'DIFN003A', 'DIFN002A', 'DIFN007A', 'CPI7001F', 'GDPL201D'];

/* ------------------------------------------------------------------ how a tile measures its move */
const HZ = [['1M', 1], ['3M', 3], ['1Y', 12], ['5Y', 60]];               // quick views: the change over this many months
// The Overview shows the most important tiles of each theme, in this order; a theme that is missing here (or has fewer) shows all its tiles.
const OVERVIEW_TOP = {
  'Economy': ['Real GDP', 'Household spending (real)', 'Fixed investment (real)', 'Exports (real)'],
  'Jobs & wages': ['Unemployment rate', 'Expanded unemployment', 'People employed', 'Wages and earnings'],
  'Prices': ['Headline CPI', 'Core CPI', 'PPI: final manufactured', 'Inflation expectations'],
  'Money & markets': ['Policy rate', 'Long bond yield', 'Rand per US dollar', '91-day T-bill'],
  'Banking & credit': ['M3 money growth', 'Private-sector credit growth', 'Total credit growth', 'Household credit'],
  'Resources': ['Mining volume', 'Gold volume', 'PGM volume', 'Gold price (US$)'],
  'Industrials': ['Manufacturing volume', 'Capacity utilisation', 'Electricity production', 'Freight payload (land)'],
  'Corporate': ['Liquidations', 'Insolvencies', 'Quarterly turnover', 'Net profit margin'],
};
const SECTOR_ICON = {
  'Economy': 'M4 20V11M10 20V4M16 20v-7M22 20H2',
  'Money & markets': 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v5c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 11v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
  'Resources': 'M2 20l7-12 4 6 3-4 6 10z',
  'Industrials': 'M3 20V10l6 4v-4l6 4V6h4v14z',
  'Consumer': 'M3 4h2.5l2.2 11h10.3L20 7H6.2M9.5 20h.01M17 20h.01',
  'Property & construction': 'M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M2 21h20',
  'Travel & leisure': 'M21 3L3 10.5l7 2.5 2.5 7z',
  'Prices': 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  'Corporate': 'M3 8h18v12H3zM9 8V5h6v3M3 13h18',
  'Jobs & wages': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  'Business cycle': 'M2 12c2-7 4-7 6 0s4 7 6 0 4-7 6 0',
  'Banking & credit': 'M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-7 10 7z',
  'External & trade': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  'Public finance': 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
};
function sectorIcon(sector, size) {
  const svg = Kit.s('svg', { width: size || 22, height: size || 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  svg.appendChild(Kit.s('path', { d: SECTOR_ICON[sector] || SECTOR_ICON.Economy })); return svg;
}
function stepYears(it) { return it.freq === 'M' ? 1 / 12 : it.freq === 'Q' ? 0.25 : it.freq === 'D' ? 0 : 1; }
function rollItem(d) { if (!d._roll) d._roll = Store.derive(d.actual, d.actual.key + ':12m', d.label, Store.rolling(Store.full(d.actual), 12, 'sum')); return d._roll; }
// the tile's number: the move over `months` ending at the latest observation on or before `asOf` (decimal year); one period at least for slow series
function calc(d, months, asOf) {
  const it0 = d.flow12 ? rollItem(d) : d.actual, it = months < 12 && d.sa && !d.flow12 ? d.sa : it0, X = Store.pubX[it.pub];
  let i = it.v.length - 1; while (i >= 0 && (it.v[i] == null || X[it.s + i] > asOf + 1e-9)) i--;
  if (i < 0) return null;
  const cur = it.v[i], xc = X[it.s + i], per = stepYears(it), want = Math.max(months / 12, per), tgt = xc - want + 1e-9;
  let j = i - 1; while (j >= 0 && (it.v[j] == null || X[it.s + j] > tgt)) j--;
  const slack = per ? per * 1.6 : 10 / 365;
  const pv = j >= 0 && tgt - X[it.s + j] <= slack ? it.v[j] : null;
  const pp = d.kind === 'pct';
  const change = pv == null ? null : pp ? cur - pv : (pv === 0 ? null : (cur - pv) / Math.abs(pv) * 100);
  const keep = it.freq === 'D' ? 250 : it.freq === 'M' ? 60 : it.freq === 'Q' ? 20 : 15;
  const lab = months >= 60 ? '5Y' : months >= 12 ? (want <= 1.001 ? 'y/y' : '5Y') : want > months / 12 + 1e-6 ? (it.freq === 'Q' ? 'q/q' : it.freq === 'A' ? 'y/y' : 'm/m') : (months === 1 ? 'm/m' : '3M');
  // inflation tiles (yoyDelta): what the year-on-year rate was one period earlier, and the change in the rate in percentage points (taken from the rates as published, to 1 decimal)
  let yp = null;
  if (d.yoyDelta && !pp && months === 12 && change != null) {
    let i2 = i - 1; while (i2 >= 0 && it.v[i2] == null) i2--;
    if (i2 >= 0) {
      const tg2 = X[it.s + i2] - want + 1e-9; let j2 = i2 - 1; while (j2 >= 0 && (it.v[j2] == null || X[it.s + j2] > tg2)) j2--;
      if (j2 >= 0 && tg2 - X[it.s + j2] <= slack && it.v[j2]) { const pv2 = (it.v[i2] - it.v[j2]) / Math.abs(it.v[j2]) * 100, r1 = v => Math.round(v * 10) / 10; yp = { v: pv2, p: it.periods[it.s + i2], delta: r1(r1(change) - r1(pv2)) }; }
    }
  }
  return { cur, change, yp, lastP: it.periods[it.s + i], pp, spark: it.v.slice(Math.max(0, i - keep + 1), i + 1), lab, x: xc, src: it };
}

function create() {
  const root = h('div');
  root.appendChild(h('h3', { class: 'serif', style: 'margin:0;font-size:18px', text: 'Pulse' }));
  root.appendChild(h('div', { class: 'page-sub', text: 'The latest move in every headline series, theme by theme. Choose a theme to chart its indicators: click a tile to put it on the chart (Ctrl-click opens its tab), or search the chart for any series.' }));
  let seen = {}; try { seen = JSON.parse(localStorage.getItem('eq-seen') || '{}'); } catch (e) {}
  const nowSeen = {};
  const hs = Kit.hashState.read(TAB);

  const defsList = defs();
  const ORDER = ['Economy', 'Jobs & wages', 'Prices', 'Money & markets', 'Banking & credit', 'External & trade', 'Public finance', 'Resources', 'Industrials', 'Consumer', 'Property & construction', 'Travel & leisure', 'Corporate', 'Business cycle'], ord = x => ORDER.indexOf(x) < 0 ? 99 : ORDER.indexOf(x);
  const chartItem = d => d.flow12 ? rollItem(d) : d.actual;
  defsList.forEach(d => PulseChart.register(chartItem(d), d.label));
  const tiles = defsList.map(d => ({ d })); tiles.sort((a, b) => ord(a.d.sector) - ord(b.d.sector));          // Array.sort is stable: tiles keep their order inside a sector
  const sectors = []; tiles.forEach(t => { if (sectors.indexOf(t.d.sector) < 0) sectors.push(t.d.sector); });
  const pick = (v, ok, dflt) => ok.indexOf(v) >= 0 ? v : dflt;
  const latestX = tiles.reduce((m, t) => { const X = Store.pubX[t.d.actual.pub], it = t.d.actual; return Math.max(m, X[it.s + it.v.length - 1]); }, 0);
  const asOfOpts = [{ v: '', label: 'Latest' }]; for (let k = 0; k < 14; k++) { const n = Math.round(latestX * 12 + 1e-6) - k, yy = Math.floor(n / 12), mm = n % 12 + 1, lab = yy + '-' + String(mm).padStart(2, '0'); asOfOpts.push({ v: lab, label: Kit.fmt.period(lab) }); }
  let lay0 = {}; try { lay0 = JSON.parse(localStorage.getItem('eq-pulse-layout') || '{}'); } catch (e) {}
  const st = { sort: pick(hs.get('sort'), ['sector', 'strong', 'weak', 'name'], 'sector'), sec: sectors.includes(hs.get('sec')) ? hs.get('sec') : '', q: hs.get('q') || '', hz: pick(hs.get('hz'), HZ.map(x => x[0]), '1Y'), asof: asOfOpts.some(o => o.v === hs.get('asof')) ? hs.get('asof') : '', mode: hs.get('mode') === 'table' ? 'table' : 'cards',
    cp: pick(hs.get('cp') || lay0.cp, ['side', 'top', 'off'], 'side'), ts: pick(hs.get('ts') || lay0.ts, ['s', 'm', 'l'], 'm'), sp: pick(hs.get('sp') || lay0.sp, ['on', 'off'], 'on') };
  let autoFor = '', pchart = null, touched = hs.has('cs'), lastList = [];
  const save = () => Kit.hashState.write(TAB, { sort: st.sort === 'sector' ? '' : st.sort, sec: st.sec, q: st.q, hz: st.hz === '1Y' ? '' : st.hz, asof: st.asof, mode: st.mode === 'cards' ? '' : st.mode,
    cp: st.cp === 'side' ? '' : st.cp, ts: st.ts === 'm' ? '' : st.ts, sp: st.sp === 'on' ? '' : st.sp, cs: touched ? (pchart && pchart.keys().length ? pchart.keys().join('~') : '-') : '' });
  const saveLayout = () => { try { localStorage.setItem('eq-pulse-layout', JSON.stringify({ cp: st.cp, ts: st.ts, sp: st.sp })); } catch (e) {} };
  const asOfX = () => st.asof ? (+st.asof.slice(0, 4) + (+st.asof.slice(5, 7)) / 12 - 1e-6) : Infinity;
  const months = () => (HZ.find(x => x[0] === st.hz) || HZ[2])[1];
  const capOf = t => (t.m && t.m.pp ? 5 : 10) * Math.sqrt(months() / 12);
  const score = t => !t.m || t.m.change == null ? -1e9 : t.m.change / capOf(t);

  // release calendar rows (future only)
  const today = new Date().toISOString().slice(0, 10), sch = (window.EQ.manifest.schedule || []).filter(r => r.date >= today).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : 1);
  const days = d => Math.round((new Date(d + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 864e5);
  const nextOf = pubCode => { const p = Store.pub(pubCode); return sch.find(r => r.code === pubCode || (p && r.code === p.sched)); };
  const nx = sch[0];
  if (nx) root.appendChild(h('div', { class: 'page-sub', style: 'margin-top:-2px', text: 'Next release: ' + (Kit.PUB_SHORT[nx.code] || nx.code) + ' (' + fmt.period(nx.period) + ') on ' + Kit.sched.dateText(nx.date) + ' ' + nx.time + ' (' + (days(nx.date) === 0 ? 'today' : days(nx.date) === 1 ? 'tomorrow' : 'in ' + days(nx.date) + ' days') + ')' }));

  // controls: search and sector pills; sort, legend, quick view, as-of, cards / table
  const search = h('input', { type: 'search', class: 'psearch', placeholder: 'Search indicators, sectors or keywords…', 'aria-label': 'Search indicators', value: st.q });
  search.addEventListener('input', () => { st.q = search.value; draw(); save(); });
  const pills = h('div', { class: 'ppills', role: 'group', 'aria-label': 'Sector' });
  const paintPills = () => { clear(pills); pills.appendChild(h('span', { class: 'pcap', text: 'Themes' })); [''].concat(sectors).forEach(sec => { const b = h('button', { type: 'button', class: 'ppill' + (st.sec === sec ? ' on' : ''), 'aria-pressed': String(st.sec === sec), onclick: () => { st.sec = sec; paintPills(); applyLayout(); draw(); save(); } }, sec ? sectorIcon(sec, 16) : null, sec || 'Overview'); pills.appendChild(b); }); };
  paintPills();
  const sortSel = h('select', { 'aria-label': 'Sort by' }, [['sector', 'Sector'], ['strong', 'Strongest first'], ['weak', 'Weakest first'], ['name', 'A to Z']].map(([v, l]) => h('option', { value: v, text: l, selected: st.sort === v ? '' : null })));
  sortSel.value = st.sort; sortSel.addEventListener('change', () => { st.sort = sortSel.value; draw(); save(); });
  const asofSel = h('select', { 'aria-label': 'Show the data as it stood at the end of', title: 'Show every tile as it stood at the end of this month' }, asOfOpts.map(o => h('option', { value: o.v, text: o.v ? o.label : 'Latest' })));
  asofSel.value = st.asof; asofSel.addEventListener('change', () => { st.asof = asofSel.value; draw(); save(); });
  const hzSeg = Kit.segmented(HZ.map(x => ({ v: x[0], label: x[0] })), st.hz, v => { st.hz = v; draw(); save(); });
  const modeSeg = Kit.segmented([{ v: 'cards', label: 'Cards' }, { v: 'table', label: 'Table' }], st.mode, v => { st.mode = v; draw(); save(); });
  const layBar = h('div', { class: 'pbar2 playout', hidden: true });
  const layBtn = h('button', { type: 'button', class: 'small', title: 'Where the chart sits, how big the tiles are', text: '⚙ Layout', 'aria-expanded': 'false' });
  const paintLayBar = () => { clear(layBar);
    layBar.appendChild(h('label', { class: 'lbl', text: 'Chart (for a chosen theme)' })); layBar.appendChild(Kit.segmented([{ v: 'side', label: 'Beside tiles', title: 'Tiles on the left, chart on the right (stacks on a narrow screen)' }, { v: 'top', label: 'Above tiles' }, { v: 'off', label: 'Hidden', title: 'Tiles only; clicking a tile opens its tab' }], st.cp, v => { st.cp = v; applyLayout(); saveLayout(); save(); draw(); }));
    layBar.appendChild(h('label', { class: 'lbl', text: 'Tile size' })); layBar.appendChild(Kit.segmented([{ v: 's', label: 'Compact' }, { v: 'm', label: 'Standard' }, { v: 'l', label: 'Large' }], st.ts, v => { st.ts = v; applyLayout(); saveLayout(); save(); }));
    layBar.appendChild(h('label', { class: 'lbl', text: 'Mini charts' })); layBar.appendChild(Kit.segmented([{ v: 'on', label: 'Show' }, { v: 'off', label: 'Hide' }], st.sp, v => { st.sp = v; applyLayout(); saveLayout(); save(); }));
    layBar.appendChild(h('span', { class: 'phint', text: 'Chart layout (style, axes, columns, height) is in the chart\'s own ⚙ Layout.' })); };
  layBtn.addEventListener('click', () => { layBar.hidden = !layBar.hidden; layBtn.setAttribute('aria-expanded', String(!layBar.hidden)); if (!layBar.hidden) paintLayBar(); });
  root.appendChild(h('div', { class: 'pbar' }, search, pills));
  root.appendChild(h('div', { class: 'pbar2' }, h('label', { class: 'lbl', text: 'Sort by' }), sortSel, h('span', { class: 'plegend' }, h('i', { class: 'dot up' }), 'Up', h('i', { class: 'dot down' }), 'Down'),
    h('span', { class: 'phint', text: 'Colour depth = size of the move' }), h('span', { class: 'grow' }), h('label', { class: 'lbl', text: 'Quick view' }), hzSeg, h('label', { class: 'lbl', text: 'As of' }), asofSel, modeSeg, layBtn));
  root.appendChild(layBar);
  const grid0 = h('div', { class: 'pleft' }), right = h('div', { class: 'pright' }), work = h('div', { class: 'pwork' }, grid0, right); root.appendChild(work);
  const chartOn = () => st.cp !== 'off' && !!st.sec;                      // graphs are for a chosen theme; the Overview shows the key tiles of every theme
  const applyLayout = () => { work.className = 'pwork cp-' + (chartOn() ? st.cp : 'off') + ' ts-' + st.ts + (st.sp === 'off' ? ' nospark' : ''); right.hidden = !chartOn(); };
  const chartKeys = () => { const raw = hs.get('cs'); return raw && raw !== '-' ? raw.split('~') : []; };
  const keyOfTile = t => chartItem(t.d).key;
  function paintSel() {                                             // mark the tiles that are on the chart
    root.querySelectorAll('.pulsetile[data-k]').forEach(a => { const c = pchart && pchart.colorOf(a.dataset.k); a.classList.toggle('sel', !!c); if (c) a.style.setProperty('--selc', c); else a.style.removeProperty('--selc'); });
  }
  function autoPick(list) {                                         // until the chart is touched, it follows the sector being looked at
    if (touched || !chartOn() || !pchart || !list.length || autoFor === st.sec + '|' + st.cp) return;
    autoFor = st.sec + '|' + st.cp;
    const keys = list.slice(0, 2).map(keyOfTile);
    if (keys.join('~') !== pchart.keys().join('~')) pchart.setKeys(keys, false);
  }
  pchart = PulseChart.create({ keys: chartKeys(), suggestTitle: 'Indicators in view',
    suggest: () => lastList.map(t => ({ key: keyOfTile(t), label: t.d.label })),
    onChange: (keys, byUser) => { if (byUser) touched = true; save(); paintSel(); } });
  right.appendChild(pchart.el); applyLayout();

  function tileEl(t, showSector) {
    const d = t.d, m = t.m, pp = m.pp, pubCode = d.actual.pub; nowSeen[pubCode] = d.actual.periods[d.actual.periods.length - 1];
    const isNew = seen[pubCode] && seen[pubCode] !== nowSeen[pubCode], nr = nextOf(pubCode);
    const k = keyOfTile(t), onChart = chartOn();
    const a = h('a', { class: 'pulsetile', href: '#/' + d.tab, 'data-k': k, style: 'background:' + Kit.heat(m.change, capOf(t)), title: onChart ? d.label + ': click to add it to the chart (Ctrl-click opens ' + d.sector + ')' : d.label + ': open ' + d.sector },
      h('div', { class: 'lab' }, d.label, isNew ? h('span', { class: 'newbadge', text: 'NEW' }) : null),
      h('div', { class: 'big', text: m.change == null ? '–' : fmt.sg(m.change, 1, pp ? ' pp' : '%') }),
      h('div', { class: 'small', title: m.yp ? 'The year-on-year rate was ' + fmt.sg(m.yp.v, 1, '%') + ' in ' + fmt.period(m.yp.p) : null, text: m.lab + (m.yp ? ' · ' + fmt.sg(m.yp.delta, 1, ' pp') : '') }),
      h('div', { class: 'spk' }, Kit.spark(m.spark, { w: 130, h: 26, color: 'var(--ink-2)', dot: 'var(--ink)' })),
      h('div', { class: 'val', text: d.fl(m.cur) }),
      h('div', { class: 'nt', text: fmt.period(m.lastP) + ' • ' + d.note + (showSector ? ' • ' + d.sector : '') }),
      nr && !st.asof ? h('div', { class: 'nt', text: 'next release ' + Kit.sched.dateText(nr.date) }) : null);
    a.addEventListener('click', e => { if (!chartOn() || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; e.preventDefault(); pchart.toggle(k); });
    return a;
  }
  function panel(sector, shown, all) {
    const ok = all.filter(t => t.m && t.m.change != null), rising = ok.filter(t => t.m.change > 0).length;
    const tab = (all[0] && all[0].d.tab) || 'economy', cut = shown.length < all.length;
    const links = h('span', { class: 'psec-links' },
      cut ? h('button', { type: 'button', class: 'psec-all', title: 'Show all ' + all.length + ' indicators of this theme, with the chart', text: 'All ' + all.length + ' →', onclick: () => { st.sec = sector; paintPills(); applyLayout(); draw(); save(); window.scrollTo(0, 0); } }) : null,
      h('a', { class: 'psec-all', href: '#/' + tab, title: 'Open the ' + sector + ' tab', text: cut ? 'Open tab ↗' : 'View all →' }));
    const p = h('section', { class: 'psec' }, h('div', { class: 'psec-h' }, h('span', { class: 'psec-ic' }, sectorIcon(sector, 26)), h('div', { class: 'psec-t' }, h('b', { text: sector }), h('span', { text: rising + ' of ' + ok.length + ' indicators rising' })), links));
    const g = h('div', { class: 'pulsegrid' }); shown.forEach(t => g.appendChild(tileEl(t, false))); p.appendChild(g); return p;
  }
  function draw() { Kit.keepScroll(drawBody); }
  function drawBody() {
    clear(grid0);
    const mo = months(), ax = asOfX();
    tiles.forEach(t => { t.m = calc(t.d, mo, ax); });
    const q = st.q.trim().toLowerCase();
    const list = tiles.filter(t => t.m && (!st.sec || t.d.sector === st.sec) && (!q || (t.d.label + ' ' + t.d.sector + ' ' + t.d.note).toLowerCase().indexOf(q) >= 0));
    lastList = list; if (pchart) { autoPick(list); pchart.suggestions(); }
    if (!list.length) { grid0.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty', text: 'No indicator matches.' }))); return; }
    if (st.mode === 'table') {
      const cols = [
        { key: 'l', label: 'Indicator', cls: 'l', sort: r => r.d.label, render: r => h('a', { href: '#/' + r.d.tab, text: r.d.label }) },
        { key: 's', label: 'Sector', cls: 'l', sort: r => r.d.sector, render: r => h('span', { class: 'sectag' }, sectorIcon(r.d.sector, 14), ' ' + r.d.sector) },
        { key: 'v', label: 'Latest', sort: r => r.m.cur, render: r => r.d.fl(r.m.cur) },
        { key: 'c', label: 'Change (' + st.hz + ')', firstDir: -1, sort: r => score(r), render: r => h('b', { text: r.m.change == null ? '–' : fmt.sg(r.m.change, 1, r.m.pp ? ' pp' : '%') }) },
        { key: 'b', label: 'Basis', cls: 'l hide-s', nosort: true, render: r => r.m.lab },
        { key: 'p', label: 'Period', cls: 'l', sort: r => r.m.x, render: r => fmt.period(r.m.lastP) },
        { key: 'n', label: 'Note', cls: 'l hide-s', nosort: true, render: r => r.d.note },
      ];
      const t = Kit.table(cols, { sortKey: st.sort === 'name' ? 'l' : 'c', sortDir: st.sort === 'name' || st.sort === 'weak' ? 1 : -1, page: 60 });
      t.set(list); t.el.style.maxHeight = 'none'; list.forEach(x => { nowSeen[x.d.actual.pub] = x.d.actual.periods[x.d.actual.periods.length - 1]; });
      grid0.appendChild(h('div', { class: 'card', style: 'margin-bottom:12px' }, t.el));
    } else if (st.sort === 'sector') {
      const wrap = h('div', { class: 'pgrid3' });
      const overview = !st.sec && !q;                                   // the key tiles of each theme; choosing a theme or searching shows everything
      sectors.filter(x => !st.sec || x === st.sec).forEach(sector => {
        const all = list.filter(t => t.d.sector === sector); if (!all.length) return;
        let shown = all; const top = OVERVIEW_TOP[sector];
        if (overview && top) { const pick = top.map(lb => all.find(t => t.d.label === lb)).filter(Boolean); if (pick.length >= 2) shown = pick; }
        wrap.appendChild(panel(sector, shown, all));
      });
      grid0.appendChild(wrap);
    } else {
      const sorted = list.slice().sort((a, b) => st.sort === 'name' ? a.d.label.localeCompare(b.d.label) : st.sort === 'weak' ? score(a) - score(b) : score(b) - score(a));
      const card = h('div', { class: 'card', style: 'margin-bottom:12px' }, Kit.cardHead(st.sec || 'All indicators', st.sort === 'name' ? 'In alphabetical order' : (st.sort === 'weak' ? 'Weakest' : 'Strongest') + ' first by the size of the move over ' + st.hz + ' (percentage-point series are scaled to compare)'));
      const g = h('div', { class: 'pulsegrid' }); sorted.forEach(t => g.appendChild(tileEl(t, !st.sec))); card.appendChild(g); grid0.appendChild(card);
    }
    try { localStorage.setItem('eq-seen', JSON.stringify(Object.assign({}, seen, nowSeen))); } catch (e) {}
    paintSel();
  }
  draw();
  const onLook = () => { if (!root.isConnected) { document.removeEventListener('themechange', onLook); return; } draw(); };
  document.addEventListener('themechange', onLook);
  if (window.Feeds) {                                                    // fetch the few live series the tiles need (once; then cached) and redraw when they arrive
    const miss = Feeds.entriesFor(FEED_CODES).filter(e => !e.dv && !e.hide && !Feeds.has(e));          // the monthly views only: the daily publications are for the Markets tab if (miss.length) Feeds.load(miss);
    const onFeeds = () => {
      if (!root.isConnected) { document.removeEventListener('feedsupdate', onFeeds); return; }
      if (defs().length !== tiles.length) { document.removeEventListener('feedsupdate', onFeeds); pchart.destroy(); const fresh = create(); root.replaceWith(fresh.el); }
    };
    document.addEventListener('feedsupdate', onFeeds);
    const onRefreshed = () => { if (!root.isConnected) { document.removeEventListener('feedsrefreshed', onRefreshed); return; } document.removeEventListener('feedsrefreshed', onRefreshed); document.removeEventListener('feedsupdate', onFeeds); Kit.keepScroll(() => { pchart.destroy(); const fresh = create(); root.replaceWith(fresh.el); }); };
    document.addEventListener('feedsrefreshed', onRefreshed);
  }

  // release calendar
  const tabOf = code => (Store.pub(code) || {}).tab || 'data';
  const cols = [
    { key: 'd', label: 'Date', cls: 'l', nosort: true, render: r => Kit.sched.dateText(r.date) + ' ' + r.time },
    { key: 'in', label: 'In', nosort: true, render: r => { const n = days(r.date); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n + ' days'; } },
    { key: 'p', label: 'Publication', cls: 'l', nosort: true, render: r => h('span', {}, h('span', { class: 'code', text: r.code }), ' ' + (Kit.PUB_SHORT[r.code] || r.code)) },
    { key: 'per', label: 'Covers', cls: 'l', nosort: true, render: r => fmt.period(r.period) },
    { key: 'go', label: '', nosort: true, render: r => h('a', { href: '#/' + tabOf(r.code), text: 'Open →' }) },
  ];
  const t = Kit.table(cols, { sortKey: null, page: 20 }); t.set(sch.slice(0, 14));
  root.appendChild(h('div', { class: 'card' }, Kit.cardHead('Coming up', 'Next scheduled StatsSA releases for these publications'), t.el));
  t.el.style.maxHeight = 'none';
  return { el: root, destroy() { if (pchart) pchart.destroy(); } };
}
window.Pulse = { create };
})();
