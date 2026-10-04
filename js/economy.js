/* economy.js - Economy tab (macro): GDP (P0441, P0441A), provincial GDP (P0441.2), labour (P0211 QLFS, P0277 QES), investment (P0045 QCE, P9101) and government finance
   (P9119.3 national, P9119.4 consolidated, P9121 provincial, P9102 extra-budgetary, P9103.1 higher education, P9110.1 municipalities quarterly, P9115 municipal census annual).
   Sections: Growth | Jobs | Investment | Government. Everything not drawn is reachable through the "all series" browsers and the Series Explorer. */
(function () {
'use strict';
const { h, clear, fmt, time } = Kit;
const Store = Kit.store;
const TAB = 'economy', PAL = Kit.PALETTE, MAX_SEL = 8;
const SECS = [{ v: 'growth', label: 'Growth (GDP)' }, { v: 'jobs', label: 'Jobs and pay' }, { v: 'invest', label: 'Investment' }, { v: 'gov', label: 'Government finance' }, { v: 'cycle', label: 'Business cycle' }];
const RELEVANCE = 'Use: the macro backdrop for every sector — growth, jobs and wages, capital spending and the state of the public finances.';
const PROVS = ['Western Cape', 'Eastern Cape', 'Northern Cape', 'Free State', 'KwaZulu-Natal', 'North West', 'Gauteng', 'Mpumalanga', 'Limpopo'];
const short = (t, n) => t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
const PUBS = ['P0441', 'P0441A', 'P0441.2', 'P0211', 'P0277', 'P0045', 'P9101', 'P9119.3', 'P9119.4', 'P9121', 'P9102', 'P9103.1', 'P9110.1', 'P9115', 'MRDEI', 'NATACCQ', 'ECOINDQ', 'ECOINDM', 'ECOINDA'];

function coverage() { PUBS.forEach(c => { if (Store.pub(c)) Kit.lookup(TAB, c, { includeDiscontinued: true }).markAll(); }); }

function card(body, title, sub, tools, style) { const c = h('div', { class: 'card', style: style || null }); if (title) c.appendChild(Kit.cardHead(title, sub, tools)); body.appendChild(c); return c; }
function twoUp(body) { const a = h('div', { class: 'card' }), b = h('div', { class: 'card' }); body.appendChild(h('div', { class: 'grid2' }, a, b)); return [a, b]; }
function derive(src, key, name, A, B, f, unit) { const a = Store.full(A), b = Store.full(B || A); return Store.derive(src, key, name, a.map((x, i) => { const v = f(x, b[i]); return v == null || !isFinite(v) ? null : v; }), { unit: unit || src.unit }); }
function selBar(host, sel, labelOf, cm, cands, redo, placeholder) {
  const tg = k => { const i = sel.indexOf(k); if (i >= 0) { if (sel.length === 1) return; sel.splice(i, 1); } else { if (sel.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' series — remove one first'); return; } sel.push(k); } redo(); };
  host.appendChild(h('div', { class: 'addrow', style: 'margin:6px 0' }, Kit.chips(sel.map(k => ({ v: k, label: short(labelOf(k), 34) + ' ×' })), sel, k => cm.of(k), tg), Kit.addSearch({ placeholder, candidates: cands, selected: () => sel, onAdd: tg, max: MAX_SEL })));
}
// what each "All series" browser opens with (series ids, and the view); anything not listed opens on its first row
const BROWSER_DEFAULT = {
  gdp: { ids: ['QRS1000', 'QRS2011', 'QRS2021', 'QRS2040'], tf: 'yoy' },                                  // GDP, household consumption, fixed investment, exports (seasonally adjusted, growth)
  rg: { ids: ['T1|c|GDP at market prices'] },                                                             // South Africa's GDP at constant prices
  qlfs: { ids: ['T2|Both sexes > Labour underutilization indicators (%) > LU1- Unemployment rate', 'T2|Both sexes > Labour underutilization indicators (%) > LU4 - Composite measure of labour underutilization'] },
  qes: { ids: ['EMP|TOTAL|TOTAL'], tf: 'yoy' },                                                          // formal employees
  qce: { ids: ['QCE000017'], tf: 'yoy' },                                                                 // total capital expenditure
  p91: { ids: ['TPS08', 'NG08', 'PCs08', 'Mun08'] },                                                     // total public-sector capex, national government, public corporations, municipalities
  cy: { ids: ['DIFN003A', 'DIFN002A', 'DIFN007A'] },                                                     // leading, coincident and lagging indicators
  na: { ids: ['NRI6007D', 'NRI6009D', 'NRI6013D'], tf: 'yoy' },                                            // household spending, fixed investment, exports (constant prices)
  ei: { ids: ['LABT079A', 'LABT081A'] },                                                                  // unemployment and participation rates
  em: { ids: ['CPI1000A'], tf: 'yoy' },                                                                   // consumer price index
};
function browser(ctx, host, title, sub, code, key, groupOf, groups, unitHint) {
  const L = Kit.lookup(TAB, code, { includeDiscontinued: true });
  const items = L.items.map(it => ({ key: it.key, name: [it.measure, it.name, it.sub, it.geo].filter((x, i, arr) => x && arr.indexOf(x) === i).join(' · ') + (code === 'P0441' && it.unit === 'Percentage' ? ' (% change)' : '') + (it.adj === 'sa' ? ' (SA)' : code === 'P0441' ? ' (actual)' : '') + (it.price === 'constant' ? ' (constant)' : ''), group: groupOf(it), it }));
  const dd = BROWSER_DEFAULT[key], pick = dd ? dd.ids.map(id => items.find(r => r.it.id === id)).filter(Boolean).map(r => r.key) : [];
  ctx.state[key] = ctx.state[key] || { q: '', group: '', sel: pick.length ? pick : [items[0].key], tf: pick.length && dd.tf ? dd.tf : 'level', sortKey: 'yoy', sortDir: -1 };
  const c = card(host, title, sub, null, 'margin-top:12px');
  const br = Kit.indexBrowser({ items, state: ctx.state[key], getRange: () => ctx.xr(code), groups: groups || Array.from(new Set(items.map(r => r.group))), onState: () => {}, unitHint: unitHint || '' });
  ctx.browsers.push(br); c.appendChild(br.el);
}

/* ============================================================================== Government finance */
const GV = { tier: 'P9119.3', view: 'level', cm: Kit.colorMap(PAL) };
const TIERS = [['P9119.3', 'National government'], ['P9119.4', 'General government'], ['P9121', 'Provincial government'], ['P9102', 'Extra-budgetary funds'], ['P9103.1', 'Universities'], ['P9110.1', 'Municipalities'], ['P9115', 'Municipal census']];
function government(ctx) {
  const { body, cs, redo } = ctx, code = GV.tier, L = Kit.lookup(TAB, code, { includeDiscontinued: true }), pub = Store.pub(code), x = ctx.xr(code);
  L.markAll();
  const seg = Kit.segmented(TIERS.filter(t => Store.pub(t[0])).map(t => ({ v: t[0], label: t[1] })), GV.tier, v => { GV.tier = v; redo(); });
  if (code === 'P9110.1') return municipal(ctx, seg);
  if (code === 'P9115') return census(ctx, seg);
  body.appendChild(h('div', { class: 'filters', style: 'margin:0 0 6px' }, h('label', { class: 'lbl', text: 'Level of government' }), seg));
  const by = re => L.items.find(it => re.test(it.measure));
  const REV = [/^Taxes$/, /^Social contributions$/, /^Grants received$/, /^Other revenue$/].map(by).filter(Boolean);
  const EXPN = [/^Compensation of employees/, /^Purchases of goods and services/, /^Interest$/, /^Subsidies/, /^Grants paid/, /^Social benefits/, /^Other payments|^Other expense/].map(by).filter(Boolean);
  const NFA = by(/^Purchases of non-financial assets/), SNFA = by(/^Sales of non-financial assets/);
  const sumOf = (items, nm) => { if (!items.length) return null; const F = items.map(Store.full); return Store.derive(items[0], code + ':' + nm, nm, F[0].map((_, i) => F.some(f => f[i] == null) ? null : F.reduce((a, f) => a + f[i], 0)), { unit: 'R million' }); };
  const rev = sumOf(REV, 'Revenue'), expn = sumOf(EXPN, 'Expense');
  let spend = expn;
  if (expn && NFA) { const E = Store.full(expn), N = Store.full(NFA), S = SNFA ? Store.full(SNFA) : null; spend = Store.derive(expn, code + ':spend', 'Expenditure incl. capital', E.map((v, i) => v == null || N[i] == null ? null : v + N[i] - (S && S[i] != null ? S[i] : 0)), { unit: 'R million' }); }
  const bal = rev && spend ? derive(rev, code + ':bal', 'Balance (revenue less expenditure)', rev, spend, (a, b) => a == null || b == null ? null : a - b) : null;
  const intr = by(/^Interest$/), tax = by(/^Taxes$/);
  const tile = (label, it, note, f) => { const m = Store.metrics(it, null); return { label: label + ' · ' + m.lastP, value: (f || fmt.bn)(m.last), delta: [{ text: 'vs previous year ' }, { text: it.unit === 'Percentage' ? fmt.signed(m.last - m.yearAgo, 1, ' pp') : fmt.sg(m.yoy), bold: true }], note, spark: m.spark }; };
  const tiles = []; if (rev) tiles.push(tile('Revenue', rev, 'taxes, contributions, grants, other')); if (spend) tiles.push(tile('Expenditure', spend, 'expense plus net purchases of assets'));
  if (bal) tiles.push(tile('Balance', bal, 'revenue less expenditure (derived)')); if (tax) tiles.push(tile('Tax revenue', tax, ''));
  if (intr && rev) { const r = derive(intr, code + ':intr', 'Interest as % of revenue', intr, rev, (a, b) => a == null || !b ? null : a / b * 100, 'Percentage'); tiles.push({ label: 'Interest as % of revenue · ' + r.lastP, value: fmt.fixed(r.last, 1) + '%', delta: [{ text: 'vs previous year ' }, { text: fmt.signed(r.last - r.v[r.v.length - 2], 1, ' pp'), bold: true }], note: 'the cost of servicing debt', spark: r.v }); }
  card(body, 'Headline', pub.name + '. Annual, R million, current prices. Revenue, expenditure and balance are derived from the published lines (revenue = taxes + contributions + grants + other; expenditure = expense lines + purchases of non-financial assets less sales of them).').appendChild(Kit.kpiStrip(tiles));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('Revenue and expenditure', 'R million per year (derived totals)'));
  cs.push(Kit.linePanel(c1, { entries: [rev && { key: 'r', name: 'Revenue', color: PAL[0], it: rev }, spend && { key: 'e', name: 'Expenditure', color: PAL[1], it: spend }, bal && { key: 'b', name: 'Balance', color: PAL[2], it: bal }].filter(Boolean), tf: 'level', x0: Store.pubX[code][0], x1: x[1], height: 280, valFmt: v => fmt.bn(v) }));
  c2.appendChild(Kit.cardHead('Where the money goes', 'Expense by type, R million per year'));
  const parts = EXPN.map((it, k) => ({ nm: short(it.measure, 28), color: PAL[k % 8], it }));
  if (parts.length) { const P = parts[0].it.periods, li = P.length - 1, from = Math.max(0, li - 19), labels = P.slice(from, li + 1); const ser = parts.map(p => { const F = Store.full(p.it); return { name: p.nm, color: p.color, vals: labels.map((_, j) => F[from + j]) }; }); c2.appendChild(Kit.legend(ser)); cs.push(Kit.stackedColumns(c2, { labels, series: ser, height: 270, fmtVal: v => fmt.bn(v), label: 'Expense by type', title: pub.name + ': expense by type' })); }
  const [c3, c4] = twoUp(body);
  const FUN = L.items.filter(it => /^\d{3}$/.test(it.id) && +it.id >= 701 && +it.id <= 710);
  c3.appendChild(Kit.cardHead('Spending by function, ' + pub.last, 'Government functions (COFOG), R million; change on the previous year in the tooltip'));
  if (FUN.length) cs.push(Kit.hbar(c3, { rows: FUN.map(it => ({ label: it.measure.replace(/^./, c => c.toUpperCase()), value: it.last, tip: [[fmt.bn(it.last), it.lastP], [fmt.sg(Store.pct(it.last, it.v[it.v.length - 2])), 'vs previous year']] })).sort((a, b) => b.value - a.value), fmtVal: v => fmt.bn(v), rowH: 26, ariaLabel: 'Spending by function', title: pub.name + ': spending by function, ' + pub.last, valueLabel: 'R million' }));
  else c3.appendChild(h('div', { class: 'empty', text: 'This level of government does not publish a spending-by-function split.' }));
  c4.appendChild(Kit.cardHead('Revenue sources', 'Share of revenue by source, % per year'));
  if (rev && REV.length) { const R = Store.full(rev), ents = REV.map((it, k) => { const F = Store.full(it); return { key: 'q' + k, name: short(it.measure, 26), color: PAL[k], it: Store.derive(it, code + ':sh' + k, it.measure, F.map((v, i) => v == null || !R[i] ? null : v / R[i] * 100), { unit: 'Percentage' }) }; }); cs.push(Kit.linePanel(c4, { entries: ents, tf: 'level', x0: Store.pubX[code][0], x1: x[1], height: 260, valFmt: v => fmt.fixed(v, 0) + '%', unit: '% of revenue' })); }
  browser(ctx, body, 'All series for ' + pub.name, L.items.length + ' annual lines. Pick rows to chart.', code, 'gv_' + code, it => /^\d{3}$/.test(it.id) && +it.id >= 700 ? 'Function' : /^[1-2]\d$/.test(it.id) ? (+it.id < 20 ? 'Revenue' : 'Expense') : 'Other', null, 'R million');
}

/* ============================================================================== Municipal finance (P9110.1), shown as the last "level of government" */
const MU = { metric: 'Total revenue', sel: null, cm: Kit.colorMap(PAL) };
const MU_METRICS = [['Total revenue', 'CR', 'Total revenue'], ['Property rates: residential', 'CR', 'Residential'], ['Electricity sales', 'CR', 'Sales of eletricity'], ['Water sales', 'CR', 'Sales of water'],
  ['Operating grants received', 'CR', 'Operational'], ['Employee costs', 'CE', 'Employee related costs'], ['Bulk electricity purchases', 'CE', 'Purchases of electricity'], ['Debt impairment', 'CE', 'Debt impairment'], ['Contractors', 'CE', 'Contractors']];
const MU_METROS = ['City of Cape Town MM', 'City of Johannesburg MM', 'Ethekwini MM', 'City of Tshwane MM', 'Ekurhuleni MM', 'Nelson Mandela Bay MM', 'Buffalo City MM', 'Mangaung MM'];
const NATL = 'All 130 municipalities';
function municipal(ctx, seg) {
  const { body, cs, redo } = ctx, code = 'P9110.1', L = Kit.lookup(TAB, code, { includeDiscontinued: true }), pub = Store.pub(code), x = ctx.xr(code);
  L.markAll();
  body.appendChild(h('div', { class: 'filters', style: 'margin:0 0 6px' }, h('label', { class: 'lbl', text: 'Level of government' }), seg));
  const g = (sh, mu, q) => L.byId(sh + '|' + mu + '|' + q);
  const mil = (it, key, name) => it ? Store.derive(it, key, name || it.name, Store.full(it).map(v => v == null ? null : v / 1000), { unit: 'R million' }) : null;           // R'000 -> R million
  const comb = (key, name, parts, signs) => { const F = parts.map(p => p && Store.full(p)); if (F.some(f => !f)) return null; return Store.derive(parts[0], key, name, F[0].map((_, i) => F.some(f => f[i] == null) ? null : F.reduce((a, f, k) => a + (signs ? signs[k] : 1) * f[i], 0) / 1000), { unit: 'R million' }); };
  const rev = mil(g('CR', NATL, 'Total revenue'), 'mu:rev', 'Total revenue'), deficit = g('CR', NATL, 'Deficit'), surplus = g('CE', NATL, 'Surplus');
  const net = surplus && deficit ? comb('mu:net', 'Operating surplus / (deficit)', [surplus, deficit], [1, -1]) : null;
  const emp = g('CE', NATL, 'Employee related costs'), texp = g('CE', NATL, 'Total expenditure'), buyE = g('CE', NATL, 'Purchases of electricity'), sellE = g('CR', NATL, 'Sales of eletricity'), imp = g('CE', NATL, 'Debt impairment');
  const ratio = (a, b, key, name) => a && b ? derive(a, key, name, a, b, (u, v) => u == null || !v ? null : u / v * 100, 'Percentage') : null;
  const empSh = ratio(emp, texp, 'mu:empsh', 'Employee costs as % of spending'), elec = ratio(buyE, sellE, 'mu:elec', 'Electricity bought as % of electricity sold'), impSh = ratio(imp, g('CR', NATL, 'Total revenue'), 'mu:imp', 'Debt impairment as % of revenue');
  const tile = (label, it, note, pctUnit, absChange) => { if (!it) return null; const m = Store.metrics(it, null); const d = m.last - m.yearAgo; return { label: label + ' · ' + m.lastP, value: pctUnit ? fmt.fixed(m.last, 1) + '%' : fmt.bn(m.last), delta: [{ text: 'a year earlier ' }, { text: pctUnit ? fmt.signed(d, 1, ' pp') : absChange ? (d < 0 ? '−' : '+') + fmt.bn(Math.abs(d)) : fmt.sg(m.yoy), bold: true }], note, spark: m.spark }; };
  card(body, 'Headline: the 130 largest municipalities', 'Quarterly, R million, current prices (' + pub.name + '). Figures are preliminary and later releases restate recent quarters; the newest release is shown.')
    .appendChild(Kit.kpiStrip([tile('Revenue', rev, 'all 130 municipalities'), tile('Operating result', net, 'surplus less deficit (derived)', false, true), tile('Employee costs', empSh, 'share of total spending', true), tile('Electricity bought', elec, 'bulk purchases / electricity sales', true), tile('Debt impairment', impSh, 'share of revenue (unpaid bills written off)', true)].filter(Boolean)));
  const P = (rev || L.items[0]).periods, li = P.length - 1, from = Math.max(0, li - 11), labels = P.slice(from, li + 1);
  const stack = (host, title, sub, rows) => { host.appendChild(Kit.cardHead(title, sub)); const ser = rows.filter(r => r.it).map((r, k) => { const F = Store.full(r.it); return { name: r.nm, color: PAL[k % 8], vals: labels.map((_, j) => F[from + j]) }; }); host.appendChild(Kit.legend(ser)); cs.push(Kit.stackedColumns(host, { labels, series: ser, height: 270, fmtVal: v => fmt.bn(v), label: title, title: pub.name + ': ' + title })); };
  const kidsOf = (sh, grp) => L.items.filter(it => it.id.indexOf(sh + '|' + NATL + '|') === 0 && it.sub === grp);
  const sumKids = (sh, grp) => { const kids = kidsOf(sh, grp); return kids.length ? comb('mu:' + sh + grp, grp, kids) : null; };
  const [c1, c2] = twoUp(body);
  const rates = comb('mu:rates', 'Property rates', kidsOf('CR', 'Property rates from').concat([g('CR', NATL, 'Property rates - penalties imposed and collection')].filter(Boolean)));
  const grants = sumKids('CR', 'Government transfers and subsidies');
  const known = [rates, mil(sellE, 'mu:sE'), mil(g('CR', NATL, 'Sales of water'), 'mu:sW'), comb('mu:ref', 'Refuse and sewerage', [g('CR', NATL, 'Refuse removal charges'), g('CR', NATL, 'Sewerage and sanitation charges')]), grants].filter(Boolean);
  const other = rev && deficit ? (() => { const R = Store.full(rev), Dd = Store.full(deficit), K = known.map(Store.full); return Store.derive(rev, 'mu:orev', 'Other', R.map((v, i) => v == null || Dd[i] == null || K.some(k => k[i] == null) ? null : v - Dd[i] / 1000 - K.reduce((a, k) => a + k[i], 0)), { unit: 'R million' }); })() : null;
  stack(c1, 'Where the money comes from', 'Revenue by source, R million per quarter, last 12 quarters (before the balancing deficit line)', [{ nm: 'Property rates', it: rates }, { nm: 'Electricity sales', it: known[1] }, { nm: 'Water sales', it: known[2] }, { nm: 'Refuse and sewerage', it: known[3] }, { nm: 'Government grants', it: grants }, { nm: 'Everything else', it: other }]);
  const bulk = comb('mu:bulk', 'Bulk purchases', [g('CE', NATL, 'Purchases of water'), g('CE', NATL, 'Purchases of electricity'), g('CE', NATL, 'Other bulk purchases')]);
  const lines = [['Employee related costs', 'Employees'], ['Remuneration of councillors', 'Councillors']].map(a => mil(g('CE', NATL, a[0]), 'mu:' + a[0], a[1]));
  const cont = sumKids('CE', 'Contracted services'), trans = sumKids('CE', 'Transfers and subsidies'), opc = sumKids('CE', 'Operational costs');
  const named = [lines[0], lines[1], bulk, cont, mil(g('CE', NATL, 'Depreciation, amortisation and impairment'), 'mu:dep'), mil(imp, 'mu:imp2'), mil(g('CE', NATL, 'Finance costs'), 'mu:fin'), trans, opc].filter(Boolean);
  const restE = texp && surplus ? (() => { const T = Store.full(texp), S = Store.full(surplus), K = named.map(Store.full); return Store.derive(texp, 'mu:oexp', 'Everything else', T.map((v, i) => v == null || S[i] == null || K.some(k => k[i] == null) ? null : v / 1000 - S[i] / 1000 - K.reduce((a, k) => a + k[i], 0)), { unit: 'R million' }); })() : null;
  stack(c2, 'Where the money goes', 'Spending by type, R million per quarter, last 12 quarters (before the balancing surplus line)', [{ nm: 'Employees and councillors', it: lines[0] && lines[1] ? comb('mu:ppl', 'Employees and councillors', [g('CE', NATL, 'Employee related costs'), g('CE', NATL, 'Remuneration of councillors')]) : lines[0] }, { nm: 'Bulk purchases (electricity, water)', it: bulk }, { nm: 'Contracted services', it: cont }, { nm: 'Depreciation', it: named[4] }, { nm: 'Debt impairment', it: mil(imp, 'mu:imp3') }, { nm: 'Finance costs', it: mil(g('CE', NATL, 'Finance costs'), 'mu:fin2') }, { nm: 'Transfers and subsidies', it: trans }, { nm: 'Operational costs', it: opc }, { nm: 'Everything else', it: restE }].filter(r => r.it));
  /* municipality comparison and province ranking for one measure */
  const mdef = MU_METRICS.find(m => m[0] === MU.metric) || MU_METRICS[0];
  const munis = L.items.filter(it => it.id.indexOf('CR|') === 0 && it.name === 'Total revenue' && it.geo !== NATL);
  const muLabel = mu => { const it = munis.find(i => i.geo === mu); return mu + (it ? ' (' + (it.x && it.x.Province || '').replace('KwaZulu-Natal', 'KZN') + ')' : ''); };
  if (!MU.sel) MU.sel = MU_METROS.filter(m => munis.some(i => i.geo === m)).slice(0, 5);
  MU.cm.assign(MU.sel);
  const [c3, c4] = twoUp(body);
  c3.appendChild(Kit.cardHead('Compare municipalities', 'Quarterly, R million (search to add any of the 130; up to ' + MAX_SEL + ')', Kit.pickSearch({ options: MU_METRICS.map(m => ({ key: m[0], label: m[0] })), value: MU.metric, ariaLabel: 'Measure', placeholder: 'Measure…', width: '240px', onChange: k => { MU.metric = k; redo(); } })));
  selBar(c3, MU.sel, mu => muLabel(mu), MU.cm, munis.map(i => ({ key: i.geo, label: muLabel(i.geo) })), redo, 'Add a municipality…');
  const ents = MU.sel.map(mu => { const it = g(mdef[1], mu, mdef[2]); return it && { key: mu, name: short(muLabel(mu), 30), color: MU.cm.of(mu), it: mil(it, 'mu:c:' + mdef[1] + mu + mdef[2], mu) }; }).filter(Boolean);
  cs.push(Kit.linePanel(c3, { entries: ents, tf: 'level', x0: Store.pubX[code][0], x1: x[1], height: 280, valFmt: v => fmt.bn(v), unit: 'R million' }));
  c4.appendChild(Kit.cardHead('By province, ' + pub.last, mdef[0] + ', R million for the quarter (sum of the largest municipalities in each province)'));
  const prow = PROVS.map(p => { const its = L.items.filter(it => it.id.indexOf(mdef[1] + '|') === 0 && it.name === mdef[2] && it.x && it.x.Province === p && it.geo !== NATL); if (!its.length) return null; const last = its.reduce((a, it) => a + (it.last || 0), 0) / 1000, prev = its.reduce((a, it) => a + (it.v[it.v.length - 5] || 0), 0) / 1000; return { label: p + ' (' + its.length + ')', value: last, tip: [[fmt.bn(last), pub.last], [fmt.sg(Store.pct(last, prev)), 'vs a year earlier']] }; }).filter(Boolean).sort((a, b) => b.value - a.value);
  cs.push(Kit.hbar(c4, { rows: prow, fmtVal: v => fmt.bn(v), rowH: 26, ariaLabel: mdef[0] + ' by province', title: pub.name + ': ' + mdef[0] + ' by province, ' + pub.last, valueLabel: 'R million' }));
  c4.appendChild(h('div', { class: 'note', text: 'Brackets: number of municipalities in the survey for that province. A quarter is cumulative-to-quarter converted by StatsSA, so single quarters can be lumpy.' }));
  browser(ctx, body, 'All municipal series (QFSSM)', L.items.length.toLocaleString('en-ZA') + ' series: 130 municipalities and the national total x 6 sheets x ~35 lines. Search by municipality or line item.', code, 'mu', it => it.measure, null, "R'000");
}

/* ============================================================================== Municipal census (P9115): who municipalities employ and what they provide, by province, annual */
const CE = { cm: Kit.colorMap(PAL) };
function census(ctx, seg) {
  const { body, cs, redo } = ctx, code = 'P9115', L = Kit.lookup(TAB, code, { includeDiscontinued: true }), pub = Store.pub(code), x = ctx.xr(code);
  L.markAll();
  body.appendChild(h('div', { class: 'filters', style: 'margin:0 0 6px' }, h('label', { class: 'lbl', text: 'Level of government' }), seg));
  const g = id => L.byId(id), SA = 'South Africa';
  const sum = (key, name, parts) => { const F = parts.map(p => p && Store.full(p)); if (F.some(f => !f)) return null; return Store.derive(parts[0], key, name, F[0].map((_, i) => F.some(f => f[i] == null) ? null : F.reduce((a, f) => a + f[i], 0)), { unit: 'Number' }); };
  const filled = sum('ce:filled', 'Filled positions', [g('ES259'), g('ES269')]), vac = g('ES279'), tot = g('ES289');
  const vacRate = vac && tot ? derive(vac, 'ce:vac', 'Vacancy rate', vac, tot, (a, b) => a == null || !b ? null : a / b * 100, 'Percentage') : null;
  const tile = (label, it, note, pctUnit) => { if (!it) return null; const m = Store.metrics(it, null); return { label: label + ' · ' + m.lastP, value: pctUnit ? fmt.fixed(m.last, 1) + '%' : fmt.num(m.last), delta: [{ text: 'a year earlier ' }, { text: pctUnit ? fmt.signed(m.last - m.yearAgo, 1, ' pp') : fmt.sg(m.yoy), bold: true }], note, spark: m.spark }; };
  card(body, 'Headline: South Africa', pub.name + '. Annual census of all municipalities; the newest year is provisional and the data runs about two years behind (' + pub.last + ' was published in March 2025; the next edition is scheduled for March 2027).')
    .appendChild(Kit.kpiStrip([tile('Filled municipal posts', filled, 'full-time plus part-time'), tile('Vacancy rate', vacRate, 'vacant posts ÷ all posts', true), tile('Councillors', g('ES189'), 'including vacant seats'),
      tile('Indigent households', g('IH009'), 'identified by municipalities'), tile('Free basic electricity', g('FBS019'), 'households receiving it')].filter(Boolean)));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('Municipal jobs', 'Posts by status, all municipalities, number of posts'));
  const P = (tot || L.items[0]).periods, parts = [['Full-time', 'ES259'], ['Part-time', 'ES269'], ['Vacant', 'ES279']].map(([nm, id], k) => ({ nm, color: PAL[k], it: g(id) })).filter(p => p.it);
  if (parts.length) { const ser = parts.map(p => ({ name: p.nm, color: p.color, vals: Store.full(p.it) })); c1.appendChild(Kit.legend(ser)); cs.push(Kit.stackedColumns(c1, { labels: P.slice(), series: ser, height: 280, fmtVal: v => fmt.num(v), label: 'Municipal posts', title: pub.name + ': municipal posts' })); }
  c2.appendChild(Kit.cardHead('Posts by department, ' + pub.last, 'Staff in post (full-time and part-time), excluding managers; vacant posts in the tooltip'));
  const deps = L.items.filter(it => /^ES3\d\d$/.test(it.id) && it.sub && it.sub !== SA).map(it => { const pt = g('ES4' + it.id.slice(3)), vc = g('ES5' + it.id.slice(3)), v = it.last + (pt ? pt.last : 0); return { label: it.sub, value: v, tip: [[fmt.num(v), 'in post'], [vc ? fmt.num(vc.last) : '–', 'vacant posts']] }; }).sort((a, b) => b.value - a.value);
  if (deps.length) cs.push(Kit.hbar(c2, { rows: deps, fmtVal: v => fmt.num(v), rowH: 26, ariaLabel: 'Municipal posts by department', title: pub.name + ': posts by department, ' + pub.last, valueLabel: 'posts' }));
  const [c3, c4] = twoUp(body);
  const mk = (ids, cm) => ids.map(id => g(id)).filter(Boolean).map((it, k) => ({ key: it.id, name: it.name.replace(/^Free Basic /, '').replace(/ \(refuse removal\)/, ''), color: PAL[k], it }));
  c3.appendChild(Kit.cardHead('Consumer units receiving services', 'Number of consumer units served by municipalities'));
  cs.push(Kit.linePanel(c3, { entries: mk(['S009', 'S019', 'S029', 'S039']), tf: 'level', x0: x[0], x1: x[1], height: 280, unit: 'Consumer units', valFmt: v => fmt.num(v) }));
  c4.appendChild(Kit.cardHead('Free basic services and indigent support', 'Households receiving free basic services, and indigent households identified'));
  cs.push(Kit.linePanel(c4, { entries: mk(['IH009', 'FBS009', 'FBS019', 'FBS029', 'FBS039']), tf: 'level', x0: x[0], x1: x[1], height: 280, unit: 'Households', valFmt: v => fmt.num(v) }));
  // province map and ranking for one measure at a time
  const byProv = (re, name) => { const o = {}; L.items.filter(it => re.test(it.measure) && it.name === name && PROVS.indexOf(it.geo) >= 0).forEach(it => { o[it.geo] = it.last; }); return o; };
  const V = { ind: byProv(/^Number of households in each province benefitting/, 'Indigent households identified by the municipalities'), fe: byProv(/^Number of domestic consumer units/, 'Free Basic Electricity'), fw: byProv(/^Number of domestic consumer units/, 'Free Basic Water'),
    cl: byProv(/^Number of councillors/, 'Total (including vacancies)'), po: byProv(/^Employment positions including managerial/, 'Total (including vacancies)'), pv: byProv(/^Employment positions including managerial/, 'Vacant posts') };
  const vr = {}; PROVS.forEach(p => { if (V.po[p] && V.pv[p] != null) vr[p] = V.pv[p] / V.po[p] * 100; });
  const metrics = [{ v: 'ind', label: 'Indigent households', values: V.ind, fmt: v => fmt.num(v) }, { v: 'fe', label: 'Free basic electricity', values: V.fe, fmt: v => fmt.num(v) }, { v: 'fw', label: 'Free basic water', values: V.fw, fmt: v => fmt.num(v) },
    { v: 'cl', label: 'Councillors', values: V.cl, fmt: v => fmt.num(v) }, { v: 'po', label: 'Municipal posts', values: V.po, fmt: v => fmt.num(v) }, { v: 'vr', label: 'Vacancy rate', values: vr, fmt: v => fmt.fixed(v, 1) + '%', pivot: g('ES279') && g('ES289') ? g('ES279').last / g('ES289').last * 100 : undefined, pivotLabel: 'South Africa' }]
    .filter(m => Object.keys(m.values).length > 3);
  if (metrics.length) cs.push(Kit.provMapCard(body, { style: 'margin-top:12px', title: 'By province, ' + pub.last, sub: 'Latest year, by province. Switch the measure above.', metrics }));
  browser(ctx, body, 'All municipal census series', L.items.length + ' series: posts, councillors, mayors, services, free basic services and indigent households, by province and for South Africa, ' + (g('ES289') || L.items[0]).firstP + ' to ' + pub.last + '.', code, 'ce', it => it.x && it.x.H06 ? it.x.H06 : 'Other', null, '');
}

/* ======================= SECTIONS ARE APPENDED BELOW (growth, jobs, investment) ======================= */
/* ============================================================================== Growth: GDP (P0441), provincial GDP (P0441.2) */
const GR = { tf: 'yoy', sa: true };                     // sa: the spending-contribution chart starts on seasonally adjusted data
function growth(ctx) {
  const { body, cs } = ctx, L = Kit.lookup(TAB, 'P0441', { includeDiscontinued: true }), [x0, x1] = ctx.xr('P0441'), pub = Store.pub('P0441');
  L.markAll();
  const g = id => L.byId(id), per = pub.last;
  const gy = g('QRU1000P'), gq = g('QRS1000P');
  const comp = (id, label, note) => { const it = g(id); return it ? { label: label + ' · ' + fmt.period(it.lastP), value: fmt.signed(it.last, 1, '%'), delta: [{ text: 'a quarter earlier ' }, { text: fmt.signed(it.v[it.v.length - 2], 1, '%'), bold: true }], note, spark: it.v.slice(-24) } : null; };
  card(body, 'Headline', 'Real GDP (constant 2015 prices). Quarter-on-quarter growth is seasonally adjusted; year-on-year growth compares with the same quarter a year earlier. Latest ' + fmt.period(per) + '.').appendChild(Kit.kpiStrip([
    gq && { label: 'GDP growth, q/q · ' + fmt.period(gq.lastP), value: fmt.signed(gq.last, 1, '%'), delta: [{ text: 'a quarter earlier ' }, { text: fmt.signed(gq.v[gq.v.length - 2], 1, '%'), bold: true }], note: 'seasonally adjusted, not annualised', spark: gq.v.slice(-24) },
    comp('QRU1000P', 'GDP growth, y/y', 'real'), comp('QRU2011P', 'Household consumption, y/y', 'real'), comp('QRU2012P', 'Government consumption, y/y', 'real'), comp('QRU2021P', 'Fixed investment, y/y', 'real'), comp('QRU2040P', 'Exports, y/y', 'real'), comp('QRU2050P', 'Imports, y/y', 'real')].filter(Boolean)));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('GDP growth', 'Percentage change in real GDP'));
  cs.push(Kit.linePanel(c1, { entries: [gy && { key: 'y', name: 'Year-on-year', color: PAL[0], it: gy }, gq && { key: 'q', name: 'Quarter-on-quarter (SA)', color: PAL[1], it: gq }].filter(Boolean), tf: 'level', x0, x1, height: 280, zero: true, valFmt: v => fmt.signed(v, 1, '%'), unit: '% change' }));
  // production side contributions
  const W = L.find({ id: 'QRU1000', price: 'constant', adj: 'nsa' }) ? g('QRU1000') : null;
  c2.appendChild(Kit.cardHead('What drove growth: industries', 'Contribution to year-on-year real GDP growth, percentage points (value added at constant 2015 prices)'));
  const GROUPS = [['Agriculture and mining', ['QRU1001', 'QRU1002']], ['Manufacturing', ['QRU1003']], ['Utilities and construction', ['QRU1004', 'QRU1005']], ['Trade and hospitality', ['QRU1006']], ['Transport and communication', ['QRU1007']], ['Finance and business services', ['QRU1008']], ['Government and personal services', ['QRU1009', 'QRU1010']], ['Taxes less subsidies', ['QRU1012']]];
  const contrib = (ids, k) => { let s = 0; for (const id of ids) { const it = g(id); if (!it) return null; const F = Store.full(it), T = Store.full(W); if (F[k] == null || F[k - 4] == null || !T[k - 4]) return null; s += (F[k] - F[k - 4]) / T[k - 4] * 100; } return s; };
  const PER = window.EQ.pubs.P0441.periods, last = PER.length - 1, idx = []; for (let k = last - 15; k <= last; k++) idx.push(k);
  const ser = GROUPS.map(([nm, ids], gi) => ({ name: nm, color: PAL[gi], vals: idx.map(k => contrib(ids, k)) }));
  c2.appendChild(Kit.legend(ser.map(x => ({ name: x.name, color: x.color }))));
  cs.push(Kit.stackedColumns(c2, { labels: idx.map(k => PER[k]), series: ser, line: gy ? { name: 'GDP y/y', color: 'var(--ink)', vals: idx.map(k => Store.full(gy)[k]) } : undefined, height: 280, fmtVal: v => fmt.signed(v, 2, ' pp'), label: 'Industry contributions to GDP growth', title: 'Industry contributions to y/y GDP growth' }));
  const [c3, c4] = twoUp(body);
  // actual (unadjusted) or seasonally adjusted: the published "residual item" (production less expenditure) follows the seasons in actual data (large and negative every fourth quarter), so the adjusted view is the cleaner read
  const sa = GR.sa === true, pf = sa ? 'QRS' : 'QRU';
  const basisSeg = Kit.segmented([{ v: 'nsa', label: 'Actual', title: 'Not seasonally adjusted, as in the GDP growth chart above' }, { v: 'sa', label: 'Seasonally adjusted', title: 'Seasonally adjusted components and residual' }], sa ? 'sa' : 'nsa', v => { GR.sa = v === 'sa'; ctx.redo(); });
  c3.appendChild(Kit.cardHead('What drove growth: spending', 'Contribution to year-on-year real GDP growth by type of spending, percentage points (adds up to GDP growth)', basisSeg));
  // expenditure on GDP excludes the "residual item" (the gap between production-side and expenditure-side GDP); with it, and with GDP as the base, the parts add up to GDP growth exactly
  const E = g(pf + '1000'), parts = [['Households', '2011'], ['Government', '2012'], ['Fixed investment', '2021'], ['Inventories', '2022'], ['Exports', '2040'], ['Imports (a drag when rising)', '2050'], ['Residual item', '2001']];
  const ec = (suf, k, sign) => { const it = g(pf + suf); if (!it || !E) return null; const F = Store.full(it), T = Store.full(E); if (F[k] == null || F[k - 4] == null || !T[k - 4]) return null; return sign * (F[k] - F[k - 4]) / T[k - 4] * 100; };
  const eser = parts.map(([nm, suf], gi) => ({ name: nm, color: PAL[gi], vals: idx.map(k => ec(suf, k, suf === '2050' ? -1 : 1)) }));
  const gdpLine = sa ? (E ? Store.full(E) : null) : (gy ? Store.full(gy) : null), gdpYoy = k => !gdpLine ? null : sa ? (gdpLine[k] == null || gdpLine[k - 4] == null ? null : (gdpLine[k] / gdpLine[k - 4] - 1) * 100) : gdpLine[k];
  c3.appendChild(Kit.legend(eser.map(x => ({ name: x.name, color: x.color }))));
  cs.push(Kit.stackedColumns(c3, { labels: idx.map(k => PER[k]), series: eser, line: gdpLine ? { name: sa ? 'GDP y/y (seasonally adjusted)' : 'GDP y/y', color: 'var(--ink)', vals: idx.map(gdpYoy) } : undefined, height: 280, fmtVal: v => fmt.signed(v, 2, ' pp'), label: 'Expenditure contributions to GDP growth', title: 'Expenditure contributions to y/y GDP growth' + (sa ? ' (seasonally adjusted)' : '') }));
  c3.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'The parts and the residual item (the gap between production-side and expenditure-side GDP in the published accounts) add up to year-on-year GDP growth. ' + (sa ? 'On seasonally adjusted data the residual is small. Growth on this basis can differ from the actual-data growth in the chart above.' : 'On actual data the residual follows the seasons (it is usually large and negative in the fourth quarter), so it can look big; the seasonally adjusted view is the cleaner read.') }));
  c4.appendChild(Kit.cardHead('Growth by industry, ' + fmt.period(per), 'Year-on-year change in real value added, %'));
  const rows = ['QRU1001', 'QRU1002', 'QRU1003', 'QRU1004', 'QRU1005', 'QRU1006', 'QRU1007', 'QRU1008', 'QRU1009', 'QRU1010'].map(id => g(id + 'P')).filter(Boolean).map(it => ({ label: it.name, value: it.last, tip: [[fmt.signed(it.last, 1, '%'), 'y/y'], [fmt.signed(it.v[it.v.length - 2], 1, '%'), 'a quarter earlier']] })).sort((a, b) => b.value - a.value);
  cs.push(Kit.hbar(c4, { rows, fmtVal: v => fmt.signed(v, 1, '%'), rowH: 26, ariaLabel: 'Real value added growth by industry', title: 'Real value added growth by industry, ' + fmt.period(per), valueLabel: 'y/y %' }));
  // provinces
  const PL = Kit.lookup(TAB, 'P0441.2', { includeDiscontinued: true });
  if (Store.pub('P0441.2')) {
    PL.markAll();
    const sh = {}, gr = {}; PROVS.forEach(p => { const lv = PL.items.find(it => it.id.indexOf('T21|c|') === 0 && it.geo === p); const cu = PL.items.find(it => it.id.indexOf('T21|b|') === 0 && it.geo === p); if (lv) gr[p] = Store.pct(lv.last, lv.v[lv.v.length - 2]); if (cu) sh[p] = cu.last; });
    const nat = PL.items.find(it => it.id.indexOf('T21|c|') === 0 && /All provinces|South Africa|Total/i.test(it.name)); const pubP = Store.pub('P0441.2');
    cs.push(Kit.provMapCard(body, { style: 'margin-bottom:12px', title: 'GDP by province, ' + pubP.last, sub: 'Provincial GDP (annual; published about nine months after the year ends)', metrics: [
      { v: 'sh', label: 'Share of national GDP', values: sh, fmt: v => fmt.fixed(v, 1) + '%' },
      { v: 'gr', label: 'Real growth', values: gr, fmt: v => fmt.signed(v, 1, '%'), pivot: nat ? Store.pct(nat.last, nat.v[nat.v.length - 2]) : undefined, pivotLabel: 'South Africa' }] }));
  }
  browser(ctx, body, 'All quarterly GDP series', L.items.length + ' series: value added by industry, expenditure on GDP, income, in current and constant prices, actual and seasonally adjusted, with growth rates.', 'P0441', 'gdp',
    it => it.measure.indexOf('Value added') === 0 ? 'Value added' : /^Expenditure|^Final|^Gross fixed/.test(it.measure) ? 'Expenditure' : /^Compensation|^Gross operating/.test(it.measure) ? 'Income' : 'Totals', null, 'R million or %');
  if (Store.pub('P0441.2')) browser(ctx, body, 'All provincial GDP series', Store.pub('P0441.2').n + ' series', 'P0441.2', 'rg', it => it.geo || 'South Africa', null, 'R million or %');
}

/* ============================================================================== Jobs and pay: QLFS (P0211) and QES (P0277) */
const JB = { sel: ['Agriculture', 'Mining', 'Manufacturing', 'Trade', 'Finance'], cm: Kit.colorMap(PAL), tf: 'level', qsel: ['3', '6', '8'], qcm: Kit.colorMap(PAL), basis: 'emp' };
function jobs(ctx) {
  const { body, cs, redo } = ctx, Q = Kit.lookup(TAB, 'P0211', { includeDiscontinued: true }), E = Kit.lookup(TAB, 'P0277', { includeDiscontinued: true }), [x0, x1] = ctx.xr('P0211');
  Q.markAll(); E.markAll();
  const rx = re => Q.items.find(it => re.test(it.id));
  const U1 = rx(/^T2\|Both sexes > Labour underutilization indicators \(%\) > LU1/), U4 = rx(/^T2\|Both sexes > Labour underutilization indicators \(%\) > LU4/), PART = rx(/^T2\|Both sexes > Key rates.*participation/i), ABS = rx(/^T2\|Both sexes > Key rates.*Employed \/ population/i);
  const EMPL = rx(/^T2\|Both sexes > Population 15-64 years > Labour Force > Employed$/), UNEMP = rx(/^T2\|Both sexes > Population 15-64 years > Labour Force > Unemployed$/);
  const pp = (label, it, note) => it && ({ label: label + ' · ' + fmt.period(it.lastP), value: fmt.fixed(it.last, 1) + '%', delta: [{ text: 'a year earlier ' }, { text: fmt.signed(it.last - it.v[it.v.length - 5], 1, ' pp'), bold: true }], note, spark: it.v.slice(-24) });
  const th = (label, it, note) => it && ({ label: label + ' · ' + fmt.period(it.lastP), value: fmt.num(it.last * 1000), delta: [{ text: 'a year earlier ' }, { text: fmt.sg(Store.pct(it.last, it.v[it.v.length - 5])), bold: true }], note, spark: it.v.slice(-24) });
  const eTot = E.byId('EMP|TOTAL|TOTAL'), gTot = E.byId('EARN|TOTAL|TOTAL');
  card(body, 'Headline', 'Quarterly Labour Force Survey (household survey, ages 15–64) and Quarterly Employment Statistics (payroll survey of formal non-agricultural employers). Quarters are three-month periods; rates compare with the same quarter a year earlier.').appendChild(Kit.kpiStrip([
    pp('Unemployment rate (official)', U1, 'LU1'), pp('Expanded unemployment rate', U4, 'LU4: incl. discouraged and time-related underemployed'), pp('Labour force participation', PART, 'of the working-age population'), pp('Absorption rate', ABS, 'employed ÷ working-age population'),
    th('Employed', EMPL, 'QLFS, people'), th('Unemployed', UNEMP, 'QLFS, people'), eTot && th('Formal employees (QES)', Object.assign({}, eTot, { last: eTot.last / 1000, v: eTot.v.map(v => v / 1000) }), 'payroll survey, people')].filter(Boolean)));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('Unemployment and participation', 'Percent of the labour force (unemployment) and of the working-age population (participation)'));
  cs.push(Kit.linePanel(c1, { entries: [U1 && { key: 'u1', name: 'Unemployment rate', color: PAL[0], it: U1 }, U4 && { key: 'u4', name: 'Expanded unemployment rate', color: PAL[1], it: U4 }, PART && { key: 'p', name: 'Participation rate', color: PAL[2], it: PART }, ABS && { key: 'a', name: 'Absorption rate', color: PAL[3], it: ABS }].filter(Boolean), tf: 'level', x0, x1, height: 280, valFmt: v => fmt.fixed(v, 1) + '%', unit: '%' }));
  // employment by industry
  const ind = Q.items.filter(it => it.id.indexOf('T3.1|Both sexes > ') === 0), byN = {}; ind.forEach(it => { byN[it.name] = it; });
  c2.appendChild(Kit.cardHead('Employment by industry', 'Thousand people (QLFS). Search to add up to ' + MAX_SEL + ' industries.', Kit.segmented([{ v: 'level', label: 'Level' }, { v: 'yoy', label: '% y/y' }, { v: 'rebase', label: 'Rebased' }], JB.tf, v => { JB.tf = v; redo(); })));
  JB.cm.assign(JB.sel);
  selBar(c2, JB.sel, k => k, JB.cm, () => ind.map(it => ({ key: it.name, label: it.name, group: 'Industry' })), redo, 'Add an industry…');
  cs.push(Kit.linePanel(c2, { entries: JB.sel.filter(k => byN[k]).map(k => ({ key: k, name: k, color: JB.cm.of(k), it: byN[k] })), tf: JB.tf, x0, x1, height: 250 }));
  // who is unemployed + provinces
  const [c3, c4] = twoUp(body);
  const LU = it => /LU1/.test(it.name);
  const groups = []; const addG = (tbl, label) => Q.items.filter(it => it.x.Table === tbl && LU(it)).forEach(it => groups.push({ label: (tbl === '2' ? '' : '') + it.sub.split(' > ')[0].replace(/^\s+/, ''), v: it.last, prev: it.v[it.v.length - 5], g: label }));
  addG('2', 'Sex'); addG('2.1', 'Population group'); addG('2.2', 'Age group');
  c3.appendChild(Kit.cardHead('Who is unemployed, ' + (U1 ? fmt.period(U1.lastP) : ''), 'Official unemployment rate by sex, population group and age, %'));
  cs.push(Kit.hbar(c3, { rows: groups.filter(x => x.v != null).map(x => ({ label: (x.g === 'Age group' ? 'Age ' : '') + short(x.label.replace(/years?/, 'yrs'), 28), value: x.v, tip: [[fmt.fixed(x.v, 1) + '%', x.g], [x.prev != null ? fmt.fixed(x.prev, 1) + '%' : '–', 'a year earlier']] })).sort((a, b) => b.value - a.value), fmtVal: v => fmt.fixed(v, 1) + '%', rowH: 22, ariaLabel: 'Unemployment rate by group', title: 'Unemployment rate by group', valueLabel: '% unemployed' }));
  const prov = {}, provP = {}; Q.items.filter(it => it.x.Table === '2.3' && /LU1/.test(it.name)).forEach(it => { const root = it.sub.split(' > ')[0].trim(); const p = !/ - /.test(root) && PROVS.indexOf(it.geo) >= 0 ? it.geo : null; if (p) { prov[p] = it.last; provP[p] = it.v[it.v.length - 5]; } });
  cs.push(Kit.provMapCard(c4.parentElement, { title: 'Unemployment by province', sub: 'Official unemployment rate, ' + (U1 ? fmt.period(U1.lastP) : ''), metrics: [{ v: 'lvl', label: 'Rate', values: prov, fmt: v => fmt.fixed(v, 1) + '%', pivot: U1 ? U1.last : undefined, pivotLabel: 'South Africa' },
    { v: 'chg', label: 'Change on a year ago', values: Object.fromEntries(Object.keys(prov).map(p => [p, provP[p] != null ? prov[p] - provP[p] : null])), fmt: v => fmt.signed(v, 1, ' pp'), pivot: 0, pivotLabel: 'no change' }] }));
  c4.remove();
  // QES
  const maj = E.items.filter(it => it.id.indexOf('EMP|') === 0 && /^(2|3|4|5|6|7|8|9Gov|9NonGov)$/.test(it.id.split('|')[1]));
  const qc = card(body, 'Formal employment by industry (QES)', 'Employees on payrolls, thousand (quarterly employment statistics; non-agricultural formal sector, from Q3 2009)', null, 'margin-top:12px');
  const P = window.EQ.pubs.P0277.periods, li = P.length - 1, from = Math.max(0, li - 19), labels = P.slice(from, li + 1);
  const qser = maj.map((it, k) => { const F = Store.full(it); return { name: short(it.name, 30), color: PAL[k % 8], vals: labels.map((_, j) => F[from + j] == null ? null : F[from + j] / 1000) }; });
  qc.appendChild(Kit.legend(qser.map(x => ({ name: x.name, color: x.color }))));
  cs.push(Kit.stackedColumns(qc, { labels, series: qser, height: 290, fmtVal: v => fmt.num(v) + ' k', label: 'Formal employment by major industry', title: 'QES formal employment by major industry' }));
  // average earnings
  const pc = card(body, 'Average pay by industry', 'Gross earnings ÷ employees ÷ 3 = average monthly gross earnings per employee, rand (derived; QES). Pick industries below.', null, 'margin-top:12px');
  const earnFor = it => { const e = E.byId('EARN|' + it.id.split('|')[1] + '|' + it.id.split('|').slice(2).join('|')); return e; };
  const avgOf = it => { const e = earnFor(it); return e ? derive(it, it.key + ':avg', it.name, e, it, (a, b) => a == null || !b ? null : a / b / 3, 'Rand') : null; };
  const allEmp = E.items.filter(it => it.id.indexOf('EMP|') === 0), byS = {}; allEmp.forEach(it => { byS[it.id.split('|')[1]] = it; });
  JB.qcm.assign(JB.qsel);
  selBar(pc, JB.qsel, k => byS[k] ? byS[k].name : k, JB.qcm, () => allEmp.map(it => ({ key: it.id.split('|')[1], label: it.name, group: 'SIC ' + it.id.split('|')[1] })), redo, 'Add an industry… e.g. mining, retail, banks');
  cs.push(Kit.linePanel(pc, { entries: [{ key: 'T', name: 'All industries', color: 'var(--ink)', it: avgOf(eTot) }].concat(JB.qsel.filter(k => byS[k]).map(k => ({ key: k, name: short(byS[k].name, 34), color: JB.qcm.of(k), it: avgOf(byS[k]) }))).filter(e => e.it), tf: 'level', x0: ctx.xr('P0277')[0], x1: ctx.xr('P0277')[1], height: 270, valFmt: v => 'R ' + fmt.num(v), unit: 'Rand per employee per month, gross' }));
  browser(ctx, body, 'All labour-force series (QLFS)', Q.items.length + ' series from 26 tables: population, labour force, employment by industry, occupation, sector, province, metro and group; unemployment and underutilisation rates.', 'P0211', 'qlfs', it => 'Table ' + it.x.Table, null, 'Thousand or %');
  browser(ctx, body, 'All employment and earnings series (QES)', E.items.length + ' series: employees and gross earnings for every industry.', 'P0277', 'qes', it => it.measure, null, 'Number or rand');
}

/* ============================================================================== Investment: QCE (P0045), public sector (P9101) */
const IV = { cm: Kit.colorMap(PAL), sel: ['NG', 'PG', 'PC'] };
function invest(ctx) {
  const { body, cs } = ctx, Q = Kit.lookup(TAB, 'P0045', { includeDiscontinued: true }), P = Kit.lookup(TAB, 'P9101', { includeDiscontinued: true }), [x0, x1] = ctx.xr('P0045');
  Q.markAll(); P.markAll();
  const tot = Q.byId('QCE000006'), all = Q.byId('QCE000017'), pt = P.items.find(it => /Total Public sector/i.test(it.measure) && /by the public sector$/.test(it.name));
  const mk = (label, it, note, f) => it && { label: label + ' · ' + it.lastP, value: (f || fmt.bn)(it.last), delta: [{ text: it.freq === 'Q' ? 'y/y ' : 'vs previous year ' }, { text: fmt.sg(Store.pct(it.last, it.v[it.v.length - (it.freq === 'Q' ? 5 : 2)])), bold: true }], note, spark: it.v.slice(-24) };
  card(body, 'Headline', 'Private and public capital spending. QCE is a quarterly sample survey of capital expenditure on new assets (R million, current prices, not seasonally adjusted); P9101 is the annual census of public-sector capital spending (R’000).').appendChild(Kit.kpiStrip([
    mk('Private + public capex (QCE)', all, 'all assets, quarterly'), mk('Mining', Q.byId('QCE000001'), 'QCE'), mk('Manufacturing', Q.byId('QCE000002'), 'QCE'), mk('Electricity, gas and water', Q.byId('QCE000003'), 'QCE'),
    pt && mk('Public-sector capex', Object.assign({}, pt, { last: pt.last / 1000, v: pt.v.map(v => v == null ? null : v / 1000), unit: 'R million' }), 'P9101, annual')].filter(Boolean)));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('Capital spending by industry', 'Quarterly, R million (QCE)'));
  const ind = Q.items.filter(it => it.measure === 'Selected industries' && it.id !== 'QCE000006'), P0 = ind[0].periods, li = P0.length - 1, from = Math.max(0, li - 19), labels = P0.slice(from, li + 1);
  const ser = ind.map((it, k) => { const F = Store.full(it); return { name: short(it.name.replace('Manufactruring', 'Manufacturing'), 30), color: PAL[k], vals: labels.map((_, j) => F[from + j]) }; });
  c1.appendChild(Kit.legend(ser.map(x => ({ name: x.name, color: x.color }))));
  cs.push(Kit.stackedColumns(c1, { labels, series: ser, line: tot && { name: 'Total', color: 'var(--ink)', vals: labels.map((_, j) => Store.full(tot)[from + j]) }, height: 280, fmtVal: v => fmt.bn(v), label: 'Quarterly capex by industry', title: 'Quarterly capital expenditure by industry' }));
  c2.appendChild(Kit.cardHead('Capital spending by asset, ' + (all ? fmt.period(all.lastP) : ''), 'Latest quarter, R million; change on the same quarter a year earlier in the tooltip'));
  const assets = Q.items.filter(it => it.measure === 'Asset category' && it.id !== 'QCE000017').map(it => ({ label: it.name, value: it.last, tip: [[fmt.bn(it.last), it.lastP], [fmt.sg(Store.pct(it.last, it.v[it.v.length - 5])), 'y/y']] })).sort((a, b) => b.value - a.value);
  cs.push(Kit.hbar(c2, { rows: assets, fmtVal: v => fmt.bn(v), rowH: 24, ariaLabel: 'Capex by asset category', title: 'Capital expenditure by asset category, latest quarter', valueLabel: 'R million' }));
  // public sector
  const [c3, c4] = twoUp(body);
  const sectors = ['National Government', 'Provincial Government', 'Municipalities', 'Public Corporations', 'Extra-Budgetary Accounts and Funds', 'Higher Education Institutions'];
  const totals = sectors.map(s0 => P.items.find(it => it.measure === s0 && /by the public sector$/.test(it.name))).filter(Boolean);
  c3.appendChild(Kit.cardHead('Public-sector capex by sector', 'Annual, R million (P9101; total capital expenditure of each part of the public sector)'));
  if (totals.length) { const P1 = totals[0].periods, l1 = P1.length - 1, f1 = Math.max(0, l1 - 14), lab1 = P1.slice(f1, l1 + 1); const s1 = totals.map((it, k) => { const F = Store.full(it); return { name: short(it.measure, 28), color: PAL[k], vals: lab1.map((_, j) => F[f1 + j] == null ? null : F[f1 + j] / 1000) }; }); c3.appendChild(Kit.legend(s1.map(x => ({ name: x.name, color: x.color })))); cs.push(Kit.stackedColumns(c3, { labels: lab1, series: s1, height: 280, fmtVal: v => fmt.bn(v), label: 'Public-sector capex by sector', title: 'Public-sector capital expenditure by sector' })); }
  c4.appendChild(Kit.cardHead('What the public sector buys, ' + (pt ? pt.lastP : ''), 'Total public-sector capex by asset type, R million'));
  const types = P.items.filter(it => it.measure === 'Total Public sector' && !/by the public sector$/.test(it.name)).map(it => ({ label: short(it.name.replace(/^Total capital expenditure on /, ''), 36), value: it.last / 1000, tip: [[fmt.bn(it.last / 1000), it.lastP], [fmt.sg(Store.pct(it.last, it.v[it.v.length - 2])), 'vs previous year']] })).sort((a, b) => b.value - a.value);
  cs.push(Kit.hbar(c4, { rows: types, fmtVal: v => fmt.bn(v), rowH: 26, ariaLabel: 'Public-sector capex by asset type', title: 'Public-sector capex by asset type', valueLabel: 'R million' }));
  browser(ctx, body, 'All quarterly capex series (QCE)', Q.items.length + ' series', 'P0045', 'qce', it => it.measure, null, 'R million');
  browser(ctx, body, 'All public-sector capex series (P9101)', P.items.length + ' series: every sector by asset type, R’000', 'P9101', 'p91', it => it.measure, null, "R'000");
}


/* ============================================================================== Business cycle: composite leading / coincident / lagging indicators, production volumes and sales (monthly, read live) */
const CY = { cm: Kit.colorMap(PAL) };
function cycle(ctx) {
  const { body, cs, redo } = ctx;
  if (!window.Feeds) { card(body, 'Business cycle', 'Live data is not available in this build.'); return; }
  const CYC = ['MRDEI', 'ECOINDM', 'ECOINDQ', 'ECOINDA', 'NATACCQ'], miss = Feeds.entriesFor({ pubs: CYC }).filter(e => !Feeds.has(e) && !e.hide);
  if (miss.length) {
    card(body, 'Loading the business-cycle indicators', 'Read live from the source when you first open this section, then kept in your browser; later visits only fetch what is new.').appendChild(h('div', { class: 'note', text: 'Fetching ' + miss.length + ' series…' }));
    Feeds.load(miss).then(() => redo()); return;
  }
  const L = Kit.lookup(TAB, 'MRDEI', { includeDiscontinued: true }); L.markAll();
  const g = id => L.byId(id), lead = g('DIFN003A'), coin = g('DIFN002A'), lag = g('DIFN007A');
  const x = ctx.xr('MRDEI'), pub = Store.pub('MRDEI');
  const yoyOf = (it, key, name) => { if (!it) return null; const F = Store.full(it); return Store.derive(it, key, name || it.name, F.map((v, i) => i >= 12 && v != null && F[i - 12] ? (v / F[i - 12] - 1) * 100 : null), { unit: 'Percentage' }); };
  const tile = (label, it, note) => { if (!it) return null; const m = Store.metrics(it, null); return { label: label + ' · ' + fmt.period(m.lastP), value: fmt.fixed(m.last, 1), delta: [{ text: 'vs a year earlier ' }, { text: fmt.sg(m.yoy), bold: true }], note, spark: m.spark }; };
  card(body, 'Headline', pub.name + '. Monthly indexes (2019 = 100). The composite indicators summarise the cycle: the leading indicator turns before the economy does, the coincident indicator moves with it and the lagging indicator follows.')
    .appendChild(Kit.kpiStrip([tile('Leading indicator', lead, 'composite'), tile('Coincident indicator', coin, 'composite'), tile('Lagging indicator', lag, 'composite'), tile('Manufacturing volume', g('MPR0000B'), 'production, 2019 = 100'), tile('New vehicle sales', g('MAN2022N'), 'index, 2019 = 100'), tile('Retail volume', g('MAN5008F'), 'constant prices, 2019 = 100')].filter(Boolean)));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('Composite business-cycle indicators', 'Leading, coincident and lagging indicators (2019 = 100)'));
  cs.push(Kit.linePanel(c1, { entries: [lead && { key: 'l', name: 'Leading', color: PAL[0], it: lead }, coin && { key: 'c', name: 'Coincident', color: PAL[1], it: coin }, lag && { key: 'g', name: 'Lagging', color: PAL[2], it: lag }].filter(Boolean), tf: 'level', x0: x[0], x1: x[1], height: 280, valFmt: v => fmt.fixed(v, 1), unit: 'Index, 2019 = 100' }));
  c2.appendChild(Kit.cardHead('Is the cycle turning?', 'Year-on-year change in the leading and coincident indicators, %'));
  cs.push(Kit.linePanel(c2, { entries: [lead && { key: 'l', name: 'Leading, y/y', color: PAL[0], it: yoyOf(lead, 'cy:lead', 'Leading indicator, y/y') }, coin && { key: 'c', name: 'Coincident, y/y', color: PAL[1], it: yoyOf(coin, 'cy:coin', 'Coincident indicator, y/y') }].filter(Boolean), tf: 'level', x0: x[0], x1: x[1], height: 280, valFmt: v => fmt.fixed(v, 1) + '%', unit: '% change on a year earlier' }));
  const [c3, c4] = twoUp(body);
  c3.appendChild(Kit.cardHead('Production volumes', 'Volume of production, 2019 = 100: manufacturing, other mining and gold mining'));
  cs.push(Kit.linePanel(c3, [['MPR0000B', 'Manufacturing'], ['PROB211B', 'Other mining'], ['PROB101B', 'Gold mining']].map(([id, nm], k) => g(id) && { key: id, name: nm, color: PAL[k], it: g(id) }).reduce((o, e) => { if (e) o.entries.push(e); return o; }, { entries: [], tf: 'level', x0: x[0], x1: x[1], height: 280, valFmt: v => fmt.fixed(v, 1), unit: 'Index, 2019 = 100' })));
  c4.appendChild(Kit.cardHead('Sales volumes', 'Constant-price sales, 2019 = 100: retail, wholesale and manufacturing, and new-vehicle sales'));
  cs.push(Kit.linePanel(c4, [['MAN5008F', 'Retail'], ['MAN6013F', 'Wholesale'], ['MAN4001F', 'Manufacturing'], ['MAN2022N', 'New vehicles']].map(([id, nm], k) => g(id) && { key: id, name: nm, color: PAL[k], it: g(id) }).reduce((o, e) => { if (e) o.entries.push(e); return o; }, { entries: [], tf: 'level', x0: x[0], x1: x[1], height: 280, valFmt: v => fmt.fixed(v, 1), unit: 'Index, 2019 = 100' })));
  // surveys, expectations and the labour market (quarterly / monthly), from the same data service
  const E = (c, pub) => Feeds.get(c, pub), xq = ctx.xr('ECOINDQ'), xm = ctx.xr('ECOINDM');
  const [c5, c6] = twoUp(body);
  c5.appendChild(Kit.cardHead('Business sentiment', 'Absa purchasing managers\' index (above 50 = expansion); monthly'));
  cs.push(Kit.linePanel(c5, { entries: [E('DIFJ049B', 'ECOINDM') && { key: 'p', name: 'Purchasing managers\' index', color: PAL[0], it: E('DIFJ049B', 'ECOINDM') }].filter(Boolean), tf: 'level', x0: xm[0], x1: xm[1], height: 260, valFmt: v => fmt.fixed(v, 1), unit: 'Index' }));
  c6.appendChild(Kit.cardHead('Inflation expectations', 'What surveyed economists, businesses and households expect CPI inflation to be, % (quarterly)'));
  cs.push(Kit.linePanel(c6, { entries: [['CPI7000F', 'Current year'], ['CPI7001F', 'One year ahead'], ['CPI7002F', 'Two years ahead'], ['CPI7003F', 'Five years ahead']].map(([c, n], k) => E(c, 'ECOINDQ') && { key: c, name: n, color: PAL[k], it: E(c, 'ECOINDQ') }).filter(Boolean), tf: 'level', x0: xq[0], x1: xq[1], height: 260, valFmt: v => fmt.fixed(v, 1) + '%', unit: '% per year' }));
  const [c7, c8] = twoUp(body);
  c7.appendChild(Kit.cardHead('Unemployment and participation', 'Unemployment rate and labour-force participation rate, % (quarterly)'));
  cs.push(Kit.linePanel(c7, { entries: [['LABT079A', 'Unemployment rate'], ['LABT081A', 'Participation rate'], ['LABU080A', 'Unemployment rate: men'], ['LABU081A', 'Unemployment rate: women']].map(([c, n], k) => E(c, 'ECOINDQ') && { key: c, name: n, color: PAL[k], it: E(c, 'ECOINDQ') }).filter(Boolean), tf: 'level', x0: xq[0], x1: xq[1], height: 260, valFmt: v => fmt.fixed(v, 1) + '%', unit: '%' }));
  c8.appendChild(Kit.cardHead('Employment and earnings', 'Formal non-agricultural employment and wages/earnings indexes (quarterly)'));
  cs.push(Kit.linePanel(c8, { entries: [['LABP900L', 'Formal employment (enterprise survey)'], ['LABP130L', 'Wages and earnings']].map(([c, n], k) => E(c, 'ECOINDQ') && { key: c, name: n, color: PAL[k], it: E(c, 'ECOINDQ') }).filter(Boolean), tf: 'level', x0: xq[0], x1: xq[1], height: 260, valFmt: v => fmt.fixed(v, 1), unit: 'Index' }));
  browser(ctx, body, 'All business-cycle series', L.items.length + ' monthly series: composite indicators, production volumes and sales.', 'MRDEI', 'cy', it => it.measure, null, 'Index, 2019 = 100');
  [['NATACCQ', 'All national-accounts series (quarterly)', 'GDP by industry and by expenditure at current and constant prices, national income and savings, R million.', 'na', 'R million'], ['ECOINDQ', 'All survey, labour and expectations series (quarterly)', 'Employment, unemployment, participation, earnings and inflation expectations.', 'ei', 'Index, % or million'],
   ['ECOINDM', 'All survey and price-index series (monthly)', 'Purchasing managers\' index, consumer and producer price indexes.', 'em', 'Index']].forEach(([code, title, sub, key, unit]) => { if (Store.pub(code)) browser(ctx, body, title, sub, code, key, it => it.measure, null, unit); });
}


function create() {
  const hs = Kit.hashState.read(TAB);
  const st = { v: SECS.some(s => s.v === hs.get('v')) ? hs.get('v') : 'growth', range: hs.get('r') || '10', fromYear: hs.get('from') || '' };
  const cs = [], browsers = [], state = {};
  const kill = () => { while (cs.length) cs.pop().destroy(); while (browsers.length) browsers.pop().destroy(); };
  const root = Kit.tabShell({ title: 'Economy', pubs: ['P0441', 'P0211', 'P0277', 'P9101', 'P9119.4'].filter(c => Store.pub(c)), relevance: RELEVANCE });
  const body = h('div'); Kit.freshOrder(body);                          // fresh, frequently updated charts first; annual / pre-2025 ones below
  const rangeCtl = Kit.rangeCtl(st, () => render());
  const save = () => Kit.hashState.write(TAB, { v: st.v === 'growth' ? '' : st.v, r: st.fromYear ? '' : (st.range === '10' ? '' : st.range), from: st.fromYear });
  root.appendChild(h('div', { class: 'filters', style: 'margin-bottom:8px' }, Kit.segmented(SECS, st.v, v => { st.v = v; render(); save(); }), h('label', { class: 'lbl', style: 'margin-left:10px', text: 'All charts', title: 'Sets the range of every chart on this page; each chart also has its own range buttons' }), rangeCtl.el));
  root.appendChild(body);
  const ctx = { tab: TAB, body, cs, browsers, state, xr: code => { const X = Store.pubX[code]; return rangeCtl.xr(X[0], X[X.length - 1]); }, redo: () => { render(); save(); } };
  function render() { Kit.keepScroll(renderBody); }
  function renderBody() {
    kill(); clear(body);
    try { ({ growth, jobs, invest, gov: government, cycle })[st.v](ctx); }
    catch (e) { body.appendChild(h('div', { class: 'empty', text: 'This section could not be drawn: ' + e.message })); console.error(e); }
  }
  document.addEventListener('themechange', () => { cs.forEach(c => c.redraw && c.redraw()); browsers.forEach(b => b.redraw && b.redraw()); });
  coverage(); render();
  const onRefreshed = () => { if (!root.isConnected) { document.removeEventListener('feedsrefreshed', onRefreshed); return; } if (st.v === 'cycle') render(); };
  document.addEventListener('feedsrefreshed', onRefreshed);
  return { el: root, destroy() { kill(); document.removeEventListener('feedsrefreshed', onRefreshed); } };
}
window.Economy = { create, coverage, _government: government };
})();
