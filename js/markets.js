/* markets.js - Money & Markets tab: interest rates (daily), the rand (daily), bonds and equities, money and credit, the external accounts, the public finances and the money-market
   operations notices. The series come from js/feeds.js (history shipped with the site, recent days read live) and are ordinary publications in the Store, so the Series Explorer, charts,
   pop-ups and the formula bar treat them like every other series. StatsSA series are mixed in where they belong (e.g. the real policy rate uses CPI).
   Sections: Interest rates | Rand & FX | Bonds & equities | Money & credit | External | Public finance | Market operations. */
(function () {
'use strict';
const { h, clear, fmt } = Kit;
const Store = Kit.store;
const TAB = 'markets', PAL = Kit.PALETTE, MAX_SEL = 8;
const FULL_SITE = 'https://sarb.metiscore.space';
const SECS = [{ v: 'rates', label: 'Interest rates' }, { v: 'fx', label: 'Rand & FX' }, { v: 'bonds', label: 'Bonds & equities' }, { v: 'money', label: 'Money & credit' }, { v: 'external', label: 'External' }, { v: 'fiscal', label: 'Public finance' }, { v: 'ops', label: 'Market operations' }];
const RELEVANCE = 'Use: the price of money (policy and market rates, the rand, bond yields), how fast money and credit are growing, how the country pays its way abroad, what the government raises and spends, and what the money-market desk is doing.';
const short = (t, n) => t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;

/* what each section needs from the live feed: whole groups (publications) */
const NEED = {
  rates: { pubs: ['RATESD', 'RATES', 'MKTM'] },
  fx: { pubs: ['FXDD', 'MRDIE'] },
  bonds: { pubs: ['MRDCM', 'RATESD', 'RATES'] },
  money: { pubs: ['MRDMA', 'CDACSM', 'CDACSQ', 'CDADS', 'CDACM3', 'CDASA', 'CDACA', 'CBSURVM', 'MRDBM'] },
  external: { pubs: ['BOPQ', 'MKTM', 'MRDIE', 'IIPQ', 'BOPDQ', 'BOPDM', 'BOPA'] },
  fiscal: { pubs: ['MRDFG', 'BOPA', 'GGOPSQ', 'CGOPSQ', 'CGDEBTM'] },
  ops: { pubs: [] },
};
function needEntries(sec) { const n = NEED[sec]; return (n.pubs && n.pubs.length ? Feeds.entriesFor({ pubs: n.pubs }) : []).filter(e => !e.hide); }

/* ------------------------------------------------------------------ small builders */
const I = (code, pub) => Feeds.get(code, pub);
const card = (body, title, sub, tools, style) => { const c = h('div', { class: 'card', style: style || null }); if (title) c.appendChild(Kit.cardHead(title, sub, tools)); body.appendChild(c); return c; };
const twoUp = body => { const a = h('div', { class: 'card' }), b = h('div', { class: 'card' }); body.appendChild(h('div', { class: 'grid2' }, a, b)); return [a, b]; };
function roll(it, n, how, key, name, unit) { return it ? Store.derive(it, key, name || it.name, Store.rolling(Store.full(it), n, how || 'sum'), { unit: unit || it.unit }) : null; }
function yoyOf(it, key, name) { if (!it) return null; const F = Store.full(it); return Store.derive(it, key, name || it.name, F.map((v, i) => i >= 12 && v != null && F[i - 12] ? (v / F[i - 12] - 1) * 100 : null), { unit: 'Percentage' }); }
function minus(a, b, key, name, unit) { if (!a || !b) return null; const A = Store.full(a), B = Store.full(b); return Store.derive(a, key, name, A.map((v, i) => v == null || B[i] == null ? null : v - B[i]), { unit: unit || a.unit }); }
const pct2 = v => fmt.fixed(v, 2) + '%', usdbn = v => 'US$ ' + fmt.fixed(v / 1000, 1) + ' bn', rbn = v => 'R ' + fmt.fixed(v, 0) + ' bn';
function entry(it, k, name, color) { return it && { key: k, name: name || short(it.name, 34), color: color || PAL[0], it }; }
function valAgo(it, days) {                                       // the value on, or the last one before, the date `days` before this series' latest figure (daily series)
  const X = Store.pubX[it.pub], last = X[it.s + it.n - 1], tgt = last - days / 365 + 1e-9; let lo = 0, hi = it.n - 1, best = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (X[it.s + mid] <= tgt) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  return best >= 0 ? it.v[best] : null;
}
function changesOf(it) {                                          // dates on which a step series (policy / prime rate) changed
  const P = it.periods, out = []; let prev = null;
  for (let i = 0; i < it.v.length; i++) { const v = it.v[i]; if (v == null) continue; if (prev != null && Math.abs(v - prev) > 1e-9) out.push({ date: P[it.s + i], from: prev, to: v }); prev = v; }
  return out;
}
function dailyTile(label, it, note) {                             // a daily rate: latest figure and its date, change on the same date a year ago, a year of history in the sparkline
  if (!it) return null; const m = Store.metrics(it, null);
  return { label: label + ' · ' + fmt.period(m.lastP), value: pct2(m.last), delta: [{ text: 'a year earlier ' }, { text: m.yearAgo == null ? '–' : fmt.signed(m.last - m.yearAgo, 2, ' pp'), bold: true }], note, spark: it.v.slice(-250) };
}
function lvlTile(label, it, f, note, o) {
  if (!it) return null; o = o || {}; const m = Store.metrics(it, null);
  const dl = o.pp ? [{ text: 'a year earlier ' }, { text: m.yearAgo == null ? '–' : fmt.signed(m.last - m.yearAgo, 2, ' pp'), bold: true }] : o.abs ? [{ text: 'a year earlier ' }, { text: m.yearAgo == null ? '–' : (m.last - m.yearAgo < 0 ? '−' : '+') + o.abs(Math.abs(m.last - m.yearAgo)), bold: true }] : [{ text: 'vs a year earlier ' }, { text: fmt.sg(m.yoy), bold: true }];
  return { label: label + ' · ' + fmt.period(m.lastP), value: f(m.last), delta: dl, note, spark: it.freq === 'D' ? it.v.slice(-250) : m.spark };
}
// what each "All ... series" browser opens with (publication/series id) and the view; anything not listed opens on its first row
const BROWSER_DEFAULT = {
  rt: { ids: ['RATESD/MMRD002A', 'RATESD/MMRD000A', 'RATESD/MMRD203A'] },                       // policy rate, prime rate, 91-day T-bill
  fxb: { ids: ['FXDD/EXCX135D', 'FXDD/EXCZ002D', 'FXDD/EXCZ001D'] },                           // rand per US dollar, euro, pound
  mc: { ids: ['MRDMA/MON0300P', 'MRDMA/MON0023P'] },                                            // M3 growth, private-sector credit growth
  xb: { ids: ['BOPQ/KBP5007L', 'MRDIE/BOP5806M'] },                                             // current account balance, gross reserves
  fg: { ids: ['MRDFG/NGFC020M', 'MRDFG/NGFC040M'] },                                            // national government revenue and expenditure
};
function browser(ctx, host, title, sub, pubs, key, unitHint) {
  const items = pubs.flatMap(code => Store.pub(code) ? Kit.lookup(TAB, code, { includeDiscontinued: true }).items : []).map(it => ({ key: it.key, name: [it.measure, it.name, it.sub].filter((x, i, a) => x && a.indexOf(x) === i).join(' · '), group: Kit.PUB_SHORT[it.pub] || it.pub, it }));
  if (!items.length) return;
  const dd = BROWSER_DEFAULT[key], pick = dd ? dd.ids.map(id => items.find(r => r.it.pub + '/' + r.it.id === id)).filter(Boolean).map(r => r.key) : [];
  ctx.state[key] = ctx.state[key] || { q: '', group: '', sel: pick.length ? pick : [items[0].key], tf: 'level', sortKey: 'yoy', sortDir: -1 };
  const c = card(host, title, sub, null, 'margin-top:12px');
  const br = Kit.indexBrowser({ items, state: ctx.state[key], getRange: () => ctx.xr(pubs.find(p => Store.pub(p)) || pubs[0]), groups: Array.from(new Set(items.map(r => r.group))), onState: () => {}, unitHint: unitHint || '' });
  ctx.browsers.push(br); c.appendChild(br.el);
}
function usePubs(codes) { codes.forEach(c => { if (Store.pub(c)) Kit.lookup(TAB, c, { includeDiscontinued: true }).markAll(); }); }
function lp(host, entries, ctx, pubCode, o) { const x = ctx.xr(pubCode); return Kit.linePanel(host, Object.assign({ entries: entries.filter(Boolean), tf: 'level', x0: x[0], x1: x[1], height: 280 }, o || {})); }
function footer(body, types) {                                    // one quiet line under a section: when the releases behind it were published, and a pointer to the complete dataset
  const f = h('div', { class: 'foot', style: 'margin-top:12px' }), when = h('span');
  f.appendChild(when); f.appendChild(h('span', {}, ' All Reserve Bank series (about 3,700, including the Quarterly Bulletin catalogue) are in the ', h('a', { href: FULL_SITE, target: '_blank', rel: 'noopener', text: 'SARB Data Explorer ↗' }), '.'));
  body.appendChild(f);
  Feeds.releaseStamps().then(() => {
    const reg = Feeds.releases().filter(r => !types || types.indexOf(r.DataType) >= 0);
    const parts = reg.map(r => r.Indicator + ' to ' + String(r.LatestDate || '').replace(', ', ' ') + (r.LastPeriod ? ' (published ' + Kit.sched.dateText(r.LastPeriod.slice(0, 10)) + ')' : ''));
    when.textContent = parts.length ? 'Latest releases: ' + parts.join('; ') + '.' : 'Daily figures carry the date of their latest value and are re-read from the source while the page is open.';
  });
}

/* ============================================================================== Interest rates (daily) */
function rates(ctx) {
  const { body, cs } = ctx; usePubs(['RATES', 'RATESD', 'MKTM']);
  const D = c => I(c, 'RATESD');
  const pol = D('MMRD002A'), prime = D('MMRD000A'), jib = D('MMRD403A'), tb91 = D('MMRD203A'), tb182 = D('MMRD206A'), tb273 = D('MMRD209A'), tb364 = D('MMRD212A'), sab = D('MMRD851A'), zar = D('MMRD855A');
  const n3 = D('MMRD303A'), n6 = D('MMRD306A'), n12 = D('MMRD312A'), ibk = D('MMRD950A'), ofx = D('MMRD853A'), b10 = D('CMJD004A'), b510 = D('CMJD003A'), r30 = D('MMRD708A'), r36 = D('MMRD709A'), cpd = D('MMSW018A');
  const realPrime = I('MMSM001R', 'MKTM');
  const polM = I('MMRD002A', 'RATES'), cpi = Store.byKey.get('P0141:CPS00000');
  let real = null, infl = null;
  if (polM && cpi) {                                       // real policy rate = policy rate (month-end) less CPI inflation (StatsSA CPI, year on year), matched by month
    const C = Store.full(cpi), cp = cpi.periods, ix = new Map(cp.map((p, i) => [p, i])), y = new Map();
    polM.periods.forEach(p => { const i = ix.get(p); if (i != null && i >= 12 && C[i] != null && C[i - 12]) y.set(p, (C[i] / C[i - 12] - 1) * 100); });
    infl = Store.derive(polM, 'mk:cpi', 'CPI inflation, y/y', polM.periods.map(p => y.has(p) ? y.get(p) : null), { unit: 'Percentage' });
    const Pl = Store.full(polM); real = Store.derive(polM, 'mk:realpol', 'Real policy rate (policy rate less CPI inflation)', polM.periods.map((p, i) => Pl[i] == null || !y.has(p) ? null : Pl[i] - y.get(p)), { unit: 'Percentage' });
  }
  card(body, 'Headline', 'Daily rates and yields, % per year, with the date of each latest figure; the change is against the same date a year earlier. Policy and prime are the rates in force.')
    .appendChild(Kit.kpiStrip([dailyTile('Policy rate', pol, 'set by the MPC'), dailyTile('Prime lending rate', prime, 'banks\' base lending rate'), dailyTile('3-month JIBAR', jib, 'interbank'), dailyTile('91-day T-bill', tb91, 'Treasury tender rate'),
      dailyTile('Government bonds, 10 years+', b10, 'daily average yield'), real && lvlTile('Real policy rate', real, pct2, 'policy rate less CPI inflation (derived, monthly)', { pp: true })].filter(Boolean)));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('Policy rate and prime lending rate', 'Daily, % per year'));
  cs.push(lp(c1, [entry(pol, 'p', 'Policy rate', PAL[0]), entry(prime, 'q', 'Prime lending rate', PAL[1])], ctx, 'RATESD', { unit: '% per year', valFmt: v => fmt.fixed(v, 2) + '%' }));
  c2.appendChild(Kit.cardHead('Real policy rate', 'The policy rate less CPI inflation (StatsSA CPI, year on year), monthly: how tight policy is once inflation is taken out'));
  cs.push(lp(c2, [entry(real, 'r', 'Real policy rate', PAL[2]), entry(polM, 'p', 'Policy rate (month-end)', PAL[0]), entry(infl, 'i', 'CPI inflation, y/y', PAL[3])], ctx, 'RATES', { unit: '% per year', valFmt: v => fmt.fixed(v, 1) + '%' }));
  const [c3, c4] = twoUp(body);
  c3.appendChild(Kit.cardHead('Money-market rates', 'Daily, % per year'));
  cs.push(lp(c3, [entry(jib, 'j', '3-month JIBAR', PAL[0]), entry(tb91, 't', '91-day T-bill', PAL[1]), entry(sab, 's', 'SABOR (overnight)', PAL[2]), entry(zar, 'z', 'ZARONIA (overnight)', PAL[3]), entry(pol, 'p', 'Policy rate', 'var(--ink)')], ctx, 'RATESD', { unit: '% per year', valFmt: v => fmt.fixed(v, 2) + '%' }));
  c4.appendChild(Kit.cardHead('Negotiable certificates of deposit', 'NCD closing rates by term, and the interbank rate; daily, % per year'));
  cs.push(lp(c4, [entry(n3, 'a', 'NCD 3 months', PAL[0]), entry(n6, 'b', 'NCD 6 months', PAL[1]), entry(n12, 'c', 'NCD 12 months', PAL[2]), entry(ibk, 'd', 'Interbank rate', PAL[3]), entry(ofx, 'e', 'Overnight FX rate', PAL[4])], ctx, 'RATESD', { unit: '% per year', valFmt: v => fmt.fixed(v, 2) + '%' }));
  const [c5, c6] = twoUp(body);
  c5.appendChild(Kit.cardHead('Treasury bills', 'Tender rates by maturity; daily, % per year'));
  cs.push(lp(c5, [entry(tb91, 'a', '91-day', PAL[0]), entry(tb182, 'b', '182-day', PAL[1]), entry(tb273, 'c', '273-day', PAL[2]), entry(tb364, 'd', '364-day', PAL[3])], ctx, 'RATESD', { unit: '% per year', valFmt: v => fmt.fixed(v, 2) + '%' }));
  c6.appendChild(Kit.cardHead('Government bond yields', 'Daily average yield by maturity band and closing yields on two benchmark bonds; % per year'));
  cs.push(lp(c6, [entry(b510, 'a', 'Bonds 5–10 years', PAL[0]), entry(b10, 'b', 'Bonds 10 years+', PAL[1]), entry(r30, 'c', short(r30 ? r30.name.replace(/ \(closing yields\)/, '') : '', 28), PAL[2]), entry(r36, 'd', short(r36 ? r36.name.replace(/ \(closing yields\)/, '') : '', 28), PAL[3])], ctx, 'RATESD', { unit: '% per year', valFmt: v => fmt.fixed(v, 2) + '%' }));
  // dates of change in the policy and prime rates (derived from the daily series)
  const [c7, c8] = twoUp(body);
  const chg = (host, title, it) => {
    host.appendChild(Kit.cardHead(title, it ? changesOf(it).length + ' changes since ' + fmt.period(it.firstP) + '; the latest first' : ''));
    if (!it) { host.appendChild(h('div', { class: 'empty', text: 'Not available.' })); return; }
    const rows = changesOf(it).reverse().slice(0, 14);
    const t = Kit.table([{ key: 'd', label: 'Date', cls: 'l', nosort: true, render: r => fmt.period(r.date) }, { key: 'f', label: 'From', nosort: true, render: r => pct2(r.from) }, { key: 't', label: 'To', nosort: true, render: r => pct2(r.to) },
      { key: 'c', label: 'Change', nosort: true, render: r => fmt.signed((r.to - r.from) * 100, 0, ' bp') }], { sortKey: null, page: 14 });
    t.set(rows); t.el.style.maxHeight = 'none'; host.appendChild(t.el);
  };
  chg(c7, 'Policy rate changes', pol); chg(c8, 'Prime lending rate changes', prime);
  // the rates board, and the curve today against a year ago
  const rowsB = [['Policy rate', pol], ['Prime lending rate', prime], ['3-month JIBAR', jib], ['Interbank rate', ibk], ['SABOR', sab], ['ZARONIA', zar], ['Overnight FX rate', ofx], ['NCD 3 months', n3], ['NCD 6 months', n6], ['NCD 12 months', n12], ['T-bill 91-day', tb91], ['T-bill 182-day', tb182], ['T-bill 273-day', tb273], ['T-bill 364-day', tb364],
    ['Bonds 5–10 years', b510], ['Bonds 10 years+', b10], [r30 ? r30.name.replace(/ \(closing yields\)/, '') : 'Benchmark bond', r30], [r36 ? r36.name.replace(/ \(closing yields\)/, '') : 'Benchmark bond', r36], ['CPD interest charged', cpd], ['Real prime rate (monthly)', realPrime]].filter(r => r[1]);
  const dlt = (it, days) => { const a = it.last, b = it.freq === 'D' ? valAgo(it, days) : (it.v.length > Math.round(days / 30) ? it.v[it.v.length - 1 - Math.round(days / 30)] : null); return b == null ? '–' : fmt.signed(a - b, 2, ' pp'); };
  const t = Kit.table([{ key: 'n', label: 'Rate', cls: 'l', nosort: true, render: r => r.n }, { key: 'v', label: 'Latest', nosort: true, render: r => pct2(r.it.last) }, { key: 'p', label: 'As at', cls: 'l', nosort: true, render: r => fmt.period(r.it.lastP) },
    { key: 'w', label: 'vs 1 week', nosort: true, render: r => dlt(r.it, 7) }, { key: 'm1', label: 'vs 1 month', nosort: true, render: r => dlt(r.it, 30) }, { key: 'm3', label: 'vs 3 months', nosort: true, render: r => dlt(r.it, 91) },
    { key: 'm12', label: 'vs 12 months', nosort: true, render: r => dlt(r.it, 365) }], { sortKey: null, page: 30 });
  t.set(rowsB.map(r => ({ n: r[0], it: r[1] }))); t.el.style.maxHeight = 'none';
  card(body, 'Rates board', 'Latest figure and change in percentage points, measured to the same date earlier', null, 'margin-top:12px').appendChild(t.el);
  const curve = [['T-bill 91-day', tb91], ['T-bill 182-day', tb182], ['T-bill 273-day', tb273], ['T-bill 364-day', tb364], ['NCD 3 months', n3], ['NCD 6 months', n6], ['NCD 12 months', n12], ['Bonds 5–10 years', b510], ['Bonds 10 years+', b10]].filter(r => r[1]);
  if (curve.length) { const cc = card(body, 'Yield curve today', 'Latest rate by instrument (the change on a year earlier is in the tooltip)', null, 'margin-top:12px'); cs.push(Kit.hbar(cc, { rows: curve.map(([nm, it]) => { const a = valAgo(it, 365); return { label: nm, value: it.last, tip: [[pct2(it.last), fmt.period(it.lastP)], [a == null ? '–' : fmt.signed(it.last - a, 2, ' pp'), 'vs a year earlier']] }; }), fmtVal: pct2, rowH: 24, ariaLabel: 'Yield curve', title: 'Yield curve today', valueLabel: '% per year' })); }
  footer(body, []);
  browser(ctx, body, 'All interest-rate and yield series', 'Daily; pick rows to chart. The monthly averages of the same series are in the Series Explorer.', ['RATESD'], 'rt', '% per year');
}

/* ============================================================================== Rand & FX (daily) */
function fx(ctx) {
  const { body, cs } = ctx; usePubs(['MRDIE', 'FXD', 'FXDD', 'MKTM']);
  const F = c => I(c, 'FXDD');
  const usd = F('EXCX135D'), eur = F('EXCZ002D'), gbp = F('EXCZ001D'), jpy = F('EXCZ120D'), neer = F('EER5504A'), reer = I('BOP5398M', 'MRDIE'), gR = F('GDPL203D'), gU = F('GDPL201D');
  const rt = (label, it, note) => lvlTile(label, it, v => 'R ' + fmt.fixed(v, v < 1 ? 4 : 2), note);
  card(body, 'Headline', 'Daily rand exchange rates (bank rates at about 10:30), with the date of each latest figure; the change is against the same date a year earlier. A rising rand-per-dollar figure means a weaker rand; the effective indexes (2015 = 100) rise when the rand strengthens.')
    .appendChild(Kit.kpiStrip([rt('Rand per US dollar', usd, 'daily'), rt('Rand per euro', eur, 'daily'), rt('Rand per pound', gbp, 'daily'), lvlTile('Nominal effective rate', neer, v => fmt.fixed(v, 1), 'daily index: trade-weighted basket'), lvlTile('Real effective rate', reer, v => fmt.fixed(v, 1), 'monthly; adjusted for relative inflation'),
      lvlTile('Gold, rand per ounce', gR, v => 'R ' + fmt.num(v), 'London fixing, daily')].filter(Boolean)));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('The rand against the dollar, euro and pound', 'Daily rand per unit of foreign currency (higher = weaker rand); use "Rebased" to compare moves'));
  cs.push(lp(c1, [entry(usd, 'u', 'Rand per US dollar', PAL[0]), entry(eur, 'e', 'Rand per euro', PAL[1]), entry(gbp, 'g', 'Rand per pound', PAL[2])], ctx, 'FXDD', { unit: 'Rand per unit of foreign currency', valFmt: v => 'R ' + fmt.fixed(v, 2) }));
  c2.appendChild(Kit.cardHead('Effective exchange rates', 'Nominal (daily) and real (monthly) effective exchange rate of the rand; higher = stronger rand'));
  cs.push(lp(c2, [entry(neer, 'n', 'Nominal effective (daily, 2015 = 100)', PAL[0]), entry(reer, 'r', 'Real effective (monthly)', PAL[1])], ctx, 'FXDD', { unit: 'Index', valFmt: v => fmt.fixed(v, 1) }));
  const [c3, c4] = twoUp(body);
  c3.appendChild(Kit.cardHead('Gold price', 'London fixing, daily, in rand and in US dollars per fine ounce (two scales)'));
  cs.push(lp(c3, [entry(gR, 'r', 'Gold in rand', PAL[0]), entry(gU, 'u', 'Gold in US dollars', PAL[1])], ctx, 'FXDD', { unit: 'Per fine ounce', valFmt: v => fmt.num(v) }));
  c4.appendChild(Kit.cardHead('The rand against other currencies, 12 months', 'Change in the value of the rand against each currency since the same date a year ago; positive = the rand bought more of that currency'));
  const pairs = [['US dollar', usd, 'inv'], ['Euro', eur, 'inv'], ['British pound', gbp, 'inv'], ['Japanese yen', jpy, 'inv']].concat(Feeds.byPub.FXDD.filter(e => /^EXCB/.test(e.c)).map(e => { const it = F(e.c); if (!it) return null; const mm = /^(.+): (.+) per Rand$/.exec(it.name); return [mm ? mm[2] + ' (' + mm[1] + ')' : it.name, it, 'per']; }).filter(Boolean)).filter(p => p[1]);          // a currency whose series has not arrived is left out instead of breaking the section
  const rowsF = pairs.map(([label, it, kind]) => { const a = it.last, b = valAgo(it, 365); if (a == null || b == null || !a || !b) return null; const ch = kind === 'inv' ? (b / a - 1) * 100 : (a / b - 1) * 100; return { label, value: ch, tip: [[fmt.sg(ch), 'rand vs ' + label], [fmt.period(it.lastP), 'latest figure']] }; }).filter(Boolean).sort((a, b) => b.value - a.value);
  if (rowsF.length) cs.push(Kit.hbar(c4, { rows: rowsF, fmtVal: v => fmt.sg(v), rowH: 22, ariaLabel: 'Rand against other currencies over 12 months', title: 'Rand against other currencies, change over 12 months', valueLabel: '% change in the rand\'s value' }));
  else c4.appendChild(h('div', { class: 'empty', text: 'Currency comparison not available yet.' }));
  footer(body, ['MRDIE']);
  browser(ctx, body, 'All exchange-rate and gold series', 'Daily series (every currency pair, effective rates, gold) and the monthly averages; pick rows to chart.', ['FXDD', 'MRDIE'], 'fxb', 'Rand or index');
}

/* ============================================================================== Bonds & equities */
function bonds(ctx) {
  const { body, cs } = ctx; usePubs(['MRDCM', 'RATESD', 'RATES']);
  const y = I('CMJM004A'), pol = I('MMRD002A', 'RATESD'), b10 = I('CMJD004A', 'RATESD'), b510 = I('CMJD003A', 'RATESD'), r30 = I('MMRD708A', 'RATESD'), r36 = I('MMRD709A', 'RATESD');
  const sv = I('CMSM082A'), nrS = I('CAPM311A'), nrT = I('CAPM335A'), nrB = I('CAPJ009M'), bTurn = I('CAPM702A'), dUnd = I('SAFC199M'), iss = I('BMPH500H'), shares = I('JLE2001M');
  const sv12 = roll(sv, 12, 'sum', 'mk:sv12', 'Value of shares traded, 12-month total'), nrT12 = roll(nrT, 12, 'sum', 'mk:nr12', 'Non-resident net purchases of shares and bonds, 12-month total'), bT12 = roll(bTurn, 12, 'sum', 'mk:bt12', 'Bond turnover, 12-month total');
  card(body, 'Headline', 'The long government-bond yield, share-market turnover, foreign investors\' net buying and the derivatives market. Flows are R million; the tiles use 12-month totals to smooth the monthly noise.')
    .appendChild(Kit.kpiStrip([dailyTile('Government bonds, 10 years+', b10, 'daily average yield'), lvlTile('Long-term government bond yield', y, pct2, 'monthly average, % per year', { pp: true }), sv12 && lvlTile('Shares traded, 12 months', sv12, v => fmt.bn(v), 'value, R'), nrT12 && lvlTile('Non-resident net buying, 12 months', nrT12, v => fmt.bn(v), 'shares and bonds', { abs: v => fmt.bn(v) }), bT12 && lvlTile('Bonds traded, 12 months', bT12, v => fmt.bn(v), 'consideration, R'),
      dUnd && lvlTile('Equity futures underlying value', dUnd, v => fmt.bn(v), 'R, monthly')].filter(Boolean)));
  const [c0, c1] = twoUp(body);
  c0.appendChild(Kit.cardHead('Government bond yields, daily', 'Daily average yield on bonds of 5–10 years and over 10 years, closing yields on two benchmark bonds, and the policy rate; % per year'));
  cs.push(lp(c0, [entry(b10, 'a', 'Bonds 10 years+', PAL[0]), entry(b510, 'b', 'Bonds 5–10 years', PAL[1]), entry(r30, 'c', short(r30 ? r30.name.replace(/ \(closing yields\)/, '') : '', 28), PAL[2]), entry(r36, 'd', short(r36 ? r36.name.replace(/ \(closing yields\)/, '') : '', 28), PAL[3]), entry(pol, 'p', 'Policy rate', 'var(--ink)')], ctx, 'RATESD', { unit: '% per year', valFmt: v => fmt.fixed(v, 2) + '%' }));
  c1.appendChild(Kit.cardHead('Long-term bond yield and the policy rate', 'Monthly, per cent per year; the yield is the long end of the curve (back to 1949), the policy rate the short end'));
  cs.push(lp(c1, [entry(y, 'y', 'Long-term government bond yield', PAL[0]), entry(I('MMRD002A', 'RATES'), 'p', 'Policy rate (month-end)', PAL[1])], ctx, 'MRDCM', { unit: '% per year', valFmt: v => fmt.fixed(v, 2) + '%' }));
  const [c2, c3] = twoUp(body);
  c2.appendChild(Kit.cardHead('Foreign investors in South African shares and bonds', 'Net purchases by non-residents, R million, 12-month totals'));
  cs.push(lp(c2, [entry(roll(nrS, 12, 'sum', 'mk:nrs12', 'Shares'), 's', 'Shares', PAL[0]), entry(roll(nrB, 12, 'sum', 'mk:nrb12', 'Bonds'), 'b', 'Bonds', PAL[1]), entry(nrT12, 't', 'Shares and bonds', 'var(--ink)')], ctx, 'MRDCM', { unit: 'R million, 12-month total', valFmt: v => fmt.bn(v) }));
  c3.appendChild(Kit.cardHead('Share-market turnover', 'Value of shares traded, R million per month and as a 12-month total'));
  cs.push(lp(c3, [entry(sv, 'm', 'Per month', PAL[0]), entry(sv12, 'y', '12-month total', PAL[1])], ctx, 'MRDCM', { unit: 'R million', valFmt: v => fmt.bn(v) }));
  const [c4, c5] = twoUp(body);
  c4.appendChild(Kit.cardHead('Bond market', 'Consideration of bonds traded and net issues of marketable debt securities, R million, 12-month totals'));
  cs.push(lp(c4, [entry(bT12, 'b', 'Bonds traded (consideration)', PAL[0]), entry(roll(iss, 12, 'sum', 'mk:iss12', 'Net issues of debt securities, 12-month total'), 'i', 'Net issues of debt securities', PAL[1])], ctx, 'MRDCM', { unit: 'R million, 12-month total', valFmt: v => fmt.bn(v) }));
  c5.appendChild(Kit.cardHead('Share prices', 'Share price index for all classes of shares (monthly)'));
  cs.push(lp(c5, [entry(shares, 'a', 'Share prices, all classes', PAL[0])], ctx, 'MKTM', { unit: 'Index', valFmt: v => fmt.fixed(v, 0) }));
  footer(body, ['MRDCM']);
  browser(ctx, body, 'All bond and equity market series', 'Fixed-interest and share markets, non-resident transactions, equity derivatives.', ['MRDCM'], 'bn', 'R million or number');
}

/* ============================================================================== Money & credit */
function money(ctx) {
  const { body, cs } = ctx; usePubs(['MRDMA', 'CDACSM', 'CDACSQ', 'CDADS', 'CDACM3', 'CDASA', 'CDACA', 'CBSURVM', 'MRDBM']);
  const g = c => I(c, 'MRDMA');
  const m3 = g('MON0300P'), m2 = g('MON0200P'), m1 = g('MON0100P'), m0 = g('MON0088P'), pc = g('MON0023P'), ln = g('MON0089P'), dce = g('MON0075P');
  const hh = I('MON0255A', 'CDACSM'), co = I('MON0254A', 'CDACSM'), hhG = yoyOf(hh, 'mk:hhg', 'Credit to households, y/y'), coG = yoyOf(co, 'mk:cog', 'Credit to companies, y/y');
  card(body, 'Headline', 'Growth over 12 months of money and credit. Money (M3) is the broad money supply; credit is what banks have lent to households and companies. Levels are R million, month-end.')
    .appendChild(Kit.kpiStrip([lvlTile('M3 money supply', m3, v => fmt.fixed(v, 1) + '%', 'growth over 12 months', { pp: true }), lvlTile('Credit to the private sector', pc, v => fmt.fixed(v, 1) + '%', 'growth over 12 months', { pp: true }), lvlTile('Credit to households', hhG, v => fmt.fixed(v, 1) + '%', 'growth over 12 months (derived)', { pp: true }),
      lvlTile('Credit to companies', coG, v => fmt.fixed(v, 1) + '%', 'growth over 12 months (derived)', { pp: true }), lvlTile('Total domestic credit extension', dce, v => fmt.fixed(v, 1) + '%', 'growth over 12 months', { pp: true })].filter(Boolean)));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('Money supply growth', 'Per cent change over 12 months'));
  cs.push(lp(c1, [entry(m3, 'a', 'M3', PAL[0]), entry(m2, 'b', 'M2', PAL[1]), entry(m1, 'c', 'M1', PAL[2]), entry(m0, 'd', 'M0 (notes, coin and reserves)', PAL[3])], ctx, 'MRDMA', { unit: '% change over 12 months', valFmt: v => fmt.fixed(v, 1) + '%' }));
  c2.appendChild(Kit.cardHead('Credit growth', 'Per cent change over 12 months'));
  cs.push(lp(c2, [entry(pc, 'a', 'Claims on the private sector', PAL[0]), entry(ln, 'b', 'Total loans and advances', PAL[1]), entry(dce, 'c', 'Total domestic credit extension', PAL[2]), entry(hhG, 'h', 'Households (derived)', PAL[3]), entry(coG, 'k', 'Companies (derived)', PAL[4])], ctx, 'MRDMA', { unit: '% change over 12 months', valFmt: v => fmt.fixed(v, 1) + '%' }));
  const Q = id => I(id, 'CDACSQ'), prodH = [['Mortgages', 'MON0232X'], ['Overdrafts', 'MON0233X'], ['General loans', 'MON0234X'], ['Credit cards', 'MON0235X'], ['Instalment sale', 'BAT1431K'], ['Leasing', 'BAT1481K']];
  const prodC = [['Mortgages', 'MON0236X'], ['Overdrafts', 'MON0237X'], ['General loans', 'MON0238X'], ['Credit cards', 'MON0239X'], ['Instalment sale', 'BATT142K'], ['Leasing', 'BATT143K']];
  const [c3, c4] = twoUp(body);
  const stack = (host, title, sub, defs) => {
    host.appendChild(Kit.cardHead(title, sub)); const its = defs.map(d => [d[0], Q(d[1])]).filter(d => d[1]);
    if (!its.length) { host.appendChild(h('div', { class: 'empty', text: 'Not available.' })); return; }
    const P = its[0][1].periods, li = P.length - 1, from = Math.max(0, li - 19), labels = P.slice(from, li + 1);
    const ser = its.map(([nmx, it], k) => { const F = Store.full(it); return { name: nmx, color: PAL[k % 8], vals: labels.map((_, j) => F[from + j]) }; });
    host.appendChild(Kit.legend(ser)); cs.push(Kit.stackedColumns(host, { labels, series: ser, height: 270, fmtVal: v => fmt.bn(v), label: title, title }));
  };
  stack(c3, 'Household credit by product', 'Quarter-end stock, R million, last 20 quarters', prodH);
  stack(c4, 'Corporate credit by product', 'Quarter-end stock, R million, last 20 quarters', prodC);
  const [c5, c6] = twoUp(body);
  c5.appendChild(Kit.cardHead('Bank deposits by sector', 'Month-end deposits at the monetary sector, R million'));
  cs.push(lp(c5, [entry(I('MON0288A', 'CDADS'), 'h', 'Households', PAL[0]), entry(I('MON0392A', 'CDADS'), 'n', 'Non-financial companies', PAL[1]), entry(I('MON0492A', 'CDADS'), 'f', 'Financial companies', PAL[2]), entry(I('MON0300A', 'CDADS'), 't', 'Total M3 deposits', 'var(--ink)')], ctx, 'CDADS', { unit: 'R million', valFmt: v => fmt.bn(v) }));
  c6.appendChild(Kit.cardHead('What is driving M3', 'Counterparts of the change in M3, R million per month, as 12-month totals'));
  const ctp = [['MON0041H', 'Net foreign assets'], ['MON0037H', 'Net claims on government'], ['MON0023H', 'Claims on the private sector'], ['MON0131H', 'Net other assets'], ['MON0300H', 'Change in M3']];
  cs.push(lp(c6, ctp.map(([c, n], k) => entry(roll(g(c), 12, 'sum', 'mk:ct' + c, n), c, n, c === 'MON0300H' ? 'var(--ink)' : PAL[k])), ctx, 'MRDMA', { unit: 'R million, 12-month total', valFmt: v => fmt.bn(v) }));
  footer(body, ['MRDMA', 'CDACSM', 'CDACSQ', 'CDADS', 'CDASA', 'CDACA', 'CDACM3', 'MRDBM']);
  browser(ctx, body, 'All money, credit, deposit and bank series', 'Monetary aggregates, credit by sector and product, deposits, securitisation, M3 counterparts, the central bank survey and the banks\' balance sheet.', ['MRDMA', 'CDASA', 'CDACM3', 'CDACSM', 'CDACSQ', 'CDADS', 'CDACA', 'MRDBM', 'CBSURVM'], 'mc', 'R million or %');
}

/* ============================================================================== External accounts and reserves */
function external(ctx) {
  const { body, cs } = ctx; usePubs(['BOPQ', 'MKTM', 'MRDIE', 'IIPQ', 'BOPDQ', 'BOPDM', 'BOPA']);
  const ca = I('KBP5007L'), caN = I('KBP5007K'), ex = I('KBP5000K'), im = I('KBP5003K'), cover = I('KBP5381K'), gross = I('BOP5806M'), liq = I('BOP5277M'), tx = I('CURX600A'), tm = I('CURM600A');
  const ex4 = roll(ex, 4, 'sum', 'mk:ex4', 'Goods exports, 4-quarter total'), im4 = roll(im, 4, 'sum', 'mk:im4', 'Goods imports, 4-quarter total'), bal4 = minus(ex4, im4, 'mk:bal4', 'Goods trade balance, 4-quarter total');
  const bal = minus(tx, tm, 'mk:tbal', 'Trade balance (exports less imports)'), bal12 = roll(bal, 12, 'sum', 'mk:tbal12', 'Trade balance, 12-month total');
  const iipA = I('BOP3000Q'), iipL = I('BOP3006Q'), iipN = I('BOP3012Q'), xdebt = I('BOP5514K');
  card(body, 'Headline', 'How the country pays its way abroad: the current account, trade, the foreign-exchange reserves that cushion it, and what South Africa owns and owes abroad. Rand values are R million unless stated; reserves are in US dollars.')
    .appendChild(Kit.kpiStrip([lvlTile('Current account balance', ca, v => fmt.bn(v), 'seasonally adjusted, annualised', { abs: v => fmt.bn(v) }), bal4 && lvlTile('Goods trade balance, 4 quarters', bal4, v => fmt.bn(v), 'balance-of-payments basis', { abs: v => fmt.bn(v) }), bal12 && lvlTile('Trade balance, 12 months', bal12, v => fmt.bn(v), 'customs basis, monthly', { abs: v => fmt.bn(v) }),
      lvlTile('Gross reserves', gross, usdbn, 'Reserve Bank, month-end'), lvlTile('Import cover', cover, v => fmt.fixed(v, 1) + ' months', 'reserves ÷ imports'), iipN && lvlTile('Net investment position', iipN, rbn, 'assets abroad less liabilities', { abs: rbn })].filter(Boolean)));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('Current account', 'Balance on the current account, R million (seasonally adjusted, annualised) and not seasonally adjusted'));
  cs.push(lp(c1, [entry(ca, 'a', 'Seasonally adjusted, annualised', PAL[0]), entry(caN, 'n', 'Not seasonally adjusted', PAL[1])], ctx, 'BOPQ', { unit: 'R million', valFmt: v => fmt.bn(v) }));
  c2.appendChild(Kit.cardHead('Goods exports and imports', 'Four-quarter totals, R million (balance-of-payments basis)'));
  cs.push(lp(c2, [entry(ex4, 'e', 'Exports', PAL[0]), entry(im4, 'i', 'Imports', PAL[1]), entry(bal4, 'b', 'Balance', 'var(--ink)')], ctx, 'BOPQ', { unit: 'R million, 4-quarter total', valFmt: v => fmt.bn(v) }));
  const [c3, c4] = twoUp(body);
  c3.appendChild(Kit.cardHead('Foreign-exchange reserves', 'Gross reserves and the international liquidity position of the Reserve Bank, US$ million'));
  cs.push(lp(c3, [entry(gross, 'g', 'Gross reserves', PAL[0]), entry(liq, 'l', 'International liquidity position', PAL[1])], ctx, 'MRDIE', { unit: 'US$ million', valFmt: usdbn }));
  c4.appendChild(Kit.cardHead('What the reserves are held in', 'Official reserve assets by type, US$ million'));
  cs.push(lp(c4, [entry(I('BOP5272N'), 'f', 'Foreign currency reserves', PAL[0]), entry(I('BOP5270N'), 'g', 'Gold', PAL[1]), entry(I('BOP5271N'), 's', 'Special drawing rights', PAL[2]), entry(I('BOP5279M'), 'i', 'IMF reserve position', PAL[3])], ctx, 'BOPDM', { unit: 'US$ million', valFmt: usdbn }));
  const [c5, c6] = twoUp(body);
  c5.appendChild(Kit.cardHead('International investment position', 'What South Africans own abroad (assets) and what non-residents own here (liabilities), R billion'));
  cs.push(lp(c5, [entry(iipA, 'a', 'Assets abroad', PAL[0]), entry(iipL, 'l', 'Liabilities', PAL[1]), entry(iipN, 'n', 'Net position', 'var(--ink)')], ctx, 'IIPQ', { unit: 'R billion', valFmt: rbn }));
  c6.appendChild(Kit.cardHead('Liabilities by type and external debt', 'Direct, portfolio and other investment liabilities (R billion) and total external debt (US$ million, right scale)'));
  cs.push(lp(c6, [entry(I('BOP3007Q'), 'd', 'Direct investment', PAL[0]), entry(I('BOP3008Q'), 'p', 'Portfolio investment', PAL[1]), entry(I('BOP3011Q'), 'o', 'Other investment', PAL[2]), entry(xdebt, 'x', 'External debt (US$ million)', PAL[3])], ctx, 'IIPQ', { unit: 'R billion', valFmt: v => fmt.num(v) }));
  const [c7, c8] = twoUp(body);
  c7.appendChild(Kit.cardHead('Monthly trade', 'Exports and imports of goods, R million per month (customs data)'));
  cs.push(lp(c7, [entry(tx, 'x', 'Exports', PAL[0]), entry(tm, 'm', 'Imports', PAL[1]), entry(bal, 'b', 'Balance', 'var(--ink)')], ctx, 'MKTM', { unit: 'R million', valFmt: v => fmt.bn(v) }));
  c8.appendChild(Kit.cardHead('Financial account', 'Quarterly flows by type, R million: assets abroad and liabilities to non-residents (not seasonally adjusted)'));
  cs.push(lp(c8, [['KBP5764K', 'Financial account'], ['KBP5644K', 'Portfolio investment, liabilities'], ['KBP5660K', 'Portfolio investment, assets'], ['KBP5640K', 'Direct investment in South Africa'], ['KBP5679K', 'Reserve assets']].map(([c, n], k) => entry(roll(I(c), 4, 'sum', 'mk:fa' + c, n + ', 4-quarter total'), c, n, k ? PAL[k % 8] : 'var(--ink)')), ctx, 'BOPQ', { unit: 'R million, 4-quarter total', valFmt: v => fmt.bn(v) }));
  const c9 = card(body, null, null, null, 'margin-top:12px'), c10 = card(body, null, null, null, 'margin-top:12px');           // the annual ratios are their own row: yearly data sits below the monthly and quarterly charts
  c9.appendChild(Kit.cardHead('Foreign-exchange market turnover', 'Net average daily turnover in the South African forex market by instrument, US$ million'));
  cs.push(lp(c9, ['BOP5453M', 'BOP5457M', 'BOP5461M'].map((c, k) => entry(I(c), c, ['Spot', 'Forward', 'Swap'][k], PAL[k])), ctx, 'MRDIE', { unit: 'US$ million per day', valFmt: v => fmt.num(v) }));
  c10.appendChild(Kit.cardHead('Annual ratios', 'Foreign debt and the national government balance as a share of GDP, % (year-end)'));
  cs.push(lp(c10, [entry(I('KBP5260J'), 'f', 'Foreign debt as % of GDP', PAL[0]), entry(I('KBP4420J'), 'g', 'National government balance as % of GDP', PAL[1])], ctx, 'BOPA', { unit: '% of GDP', valFmt: v => fmt.fixed(v, 1) + '%' }));
  footer(body, ['MRDIE']);
  browser(ctx, body, 'All balance-of-payments, reserves, investment-position and trade series', 'Balance of payments (quarterly and detail), reserves and forex turnover, the international investment position, trade.', ['BOPQ', 'BOPDQ', 'BOPDM', 'IIPQ', 'MKTM', 'MRDIE', 'BOPA'], 'xb', 'R million, R billion, US$ million or %');
}

/* ============================================================================== Public finance */
function fiscal(ctx) {
  const { body, cs } = ctx; usePubs(['MRDFG', 'BOPA', 'GGOPSQ', 'CGOPSQ', 'CGDEBTM']);
  const rev = I('NGFC020M'), exp = I('NGFC040M'), bal = I('NGFC050M'), nbr = I('NGFC080M');
  const rev12 = roll(rev, 12, 'sum', 'mk:rev12', 'Revenue, 12-month total'), exp12 = roll(exp, 12, 'sum', 'mk:exp12', 'Expenditure, 12-month total'), bal12 = roll(bal, 12, 'sum', 'mk:bal12', 'Cash-flow balance, 12-month total'), nbr12 = roll(nbr, 12, 'sum', 'mk:nbr12', 'Net borrowing requirement, 12-month total');
  const debt = I('NGD1213A'), ggRec = I('GCK1000Q'), ggNet = I('GCK4000Q');
  card(body, 'Headline', 'National government cash flow, R million, not seasonally adjusted; the monthly statement is published from April 2021, so 12-month totals start in March 2022. A negative balance is a deficit. The debt tile is the stock of national government loan debt.')
    .appendChild(Kit.kpiStrip([rev12 && lvlTile('Revenue, 12 months', rev12, v => fmt.bn(v), 'cash-flow basis'), exp12 && lvlTile('Expenditure, 12 months', exp12, v => fmt.bn(v), 'cash-flow basis'), bal12 && lvlTile('Cash-flow balance, 12 months', bal12, v => fmt.bn(v), 'deficit (−) / surplus (+)', { abs: v => fmt.bn(v) }), nbr12 && lvlTile('Net borrowing requirement, 12 months', nbr12, v => fmt.bn(v), 'what had to be raised', { abs: v => fmt.bn(v) }),
      debt && lvlTile('Total gross loan debt', debt, v => fmt.bn(v), 'national government, month-end')].filter(Boolean)));
  const [c1, c2] = twoUp(body);
  c1.appendChild(Kit.cardHead('Revenue and expenditure', 'Twelve-month totals, R million'));
  cs.push(lp(c1, [entry(rev12, 'r', 'Revenue', PAL[0]), entry(exp12, 'e', 'Expenditure', PAL[1]), entry(bal12, 'b', 'Balance', 'var(--ink)')], ctx, 'MRDFG', { unit: 'R million, 12-month total', valFmt: v => fmt.bn(v) }));
  c2.appendChild(Kit.cardHead('How the borrowing is financed', 'Twelve-month totals by instrument, R million'));
  cs.push(lp(c2, [['NGFC101M', 'Treasury bills and short-term loans'], ['NGFC102M', 'Domestic government bonds'], ['NGFC103M', 'Foreign bonds and loans'], ['NGFC104M', 'Other financing'], ['NGFC006M', 'Change in cash balances']].map(([c, n], k) => entry(roll(I(c), 12, 'sum', 'mk:fin' + c, n), c, n, PAL[k])), ctx, 'MRDFG', { unit: 'R million, 12-month total', valFmt: v => fmt.bn(v) }));
  const [c3, c4] = twoUp(body);
  c3.appendChild(Kit.cardHead('National government loan debt', 'Total gross loan debt and its main parts, R million, month-end'));
  cs.push(lp(c3, [entry(debt, 't', 'Total gross loan debt', 'var(--ink)'), entry(I('NGD1209A'), 'd', 'Domestic marketable', PAL[0]), entry(I('NGD1000A'), 'b', 'Treasury bills', PAL[1]), entry(I('NGD2000A'), 'n', 'Bonds', PAL[2])], ctx, 'CGDEBTM', { unit: 'R million', valFmt: v => fmt.bn(v) }));
  c4.appendChild(Kit.cardHead('General government: receipts and cash flow', 'Consolidated general government, quarterly, R million: cash receipts from operations and net cash flow from operating activities'));
  cs.push(lp(c4, [entry(ggRec, 'r', 'Cash receipts from operating activities', PAL[0]), entry(I('GCK1100Q'), 't', 'of which taxes', PAL[1]), entry(ggNet, 'n', 'Net cash flow from operating activities', 'var(--ink)')], ctx, 'GGOPSQ', { unit: 'R million', valFmt: v => fmt.bn(v) }));
  const c5 = card(body, null, null, null, 'margin-top:12px'), c6 = card(body, null, null, null, 'margin-top:12px');
  c5.appendChild(Kit.cardHead('Monthly cash flow', 'Revenue, expenditure and balance by month, R million'));
  cs.push(lp(c5, [entry(rev, 'r', 'Revenue', PAL[0]), entry(exp, 'e', 'Expenditure', PAL[1]), entry(bal, 'b', 'Balance', 'var(--ink)')], ctx, 'MRDFG', { unit: 'R million per month', valFmt: v => fmt.bn(v) }));
  c6.appendChild(Kit.cardHead('Annual ratios to GDP', 'Foreign debt and the national government balance, % of GDP (year-end)'));
  cs.push(lp(c6, [entry(I('KBP5260J'), 'f', 'Foreign debt as % of GDP', PAL[0]), entry(I('KBP4420J'), 'g', 'National government balance as % of GDP', PAL[1])], ctx, 'BOPA', { unit: '% of GDP', valFmt: v => fmt.fixed(v, 1) + '%' }));
  footer(body, ['MRDFG']);
  browser(ctx, body, 'All public-finance series', 'National government cash flow and financing, central and general government operations, loan debt.', ['MRDFG', 'GGOPSQ', 'CGOPSQ', 'CGDEBTM', 'BOPA'], 'fg', 'R million');
}

/* ============================================================================== Market operations: the money-market desk's notices (auctions, valuation rates, summaries) */
const OPS = { cats: null, cat: '', cache: new Map() };
const API = () => Feeds.catalog.api;
async function opsJson(path) { const ac = new AbortController(), to = setTimeout(() => ac.abort(), 30000); try { const r = await fetch(API() + path, { signal: ac.signal, mode: 'cors', credentials: 'omit' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(to); } }
function noticeTable(xml) {                                       // the desk's notices are small XML tables: <Line><Column bold="Y" bdr="Y">text</Column>...</Line>
  let doc; try { doc = new DOMParser().parseFromString(xml, 'text/xml'); } catch (e) { doc = null; }
  if (!doc || doc.querySelector('parsererror')) return h('div', { class: 'note', text: 'This notice could not be displayed.' });
  const tb = h('tbody'), nCols = Math.max(1, ...[...doc.querySelectorAll('Line')].map(l => l.children.length));
  doc.querySelectorAll('Line').forEach(line => {
    const cols = [...line.children], tr = h('tr');
    if (!cols.length) return;
    cols.forEach((c, i) => {
      const txt = (c.textContent || '').replace(/\s+$/g, ''), bold = c.getAttribute('bold') === 'Y', bdr = c.getAttribute('bdr') === 'Y';
      const td = h('td', { style: 'padding:3px 8px;white-space:pre-wrap;vertical-align:top;' + (bold ? 'font-weight:600;' : '') + (bdr ? 'border-bottom:1px solid var(--rule);' : ''), text: txt });
      if (cols.length === 1 && nCols > 1) td.setAttribute('colspan', String(nCols));
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  return h('div', { style: 'overflow-x:auto' }, h('table', { style: 'border-collapse:collapse;font-size:13px;min-width:320px' }, tb));
}
function ops(ctx) {
  const { body } = ctx;
  const intro = card(body, 'Market operations', 'The money-market desk\'s own notices: repo and Treasury-bill auctions, bond auctions, valuation rates and the daily money-market summary. Read from the source when this section is opened; each notice carries the time it was issued.');
  const list = h('div'), view = h('div'); body.appendChild(list); body.appendChild(view);
  const fmtWhen = s => { const d = new Date(String(s).trim().replace(/(\d{4})\/(\d\d)\/(\d\d)/, '$1-$2-$3').replace(/\s+/g, ' ')); return isNaN(d) ? String(s).trim() : d.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }); };
  const stamp = c => { const d = new Date(String(c.lastupdate || '').trim().replace(/(\d{4})\/(\d\d)\/(\d\d)/, '$1-$2-$3').replace(/\s+/g, ' ')); return isNaN(d) ? 0 : d.getTime(); };
  function show(id) {
    OPS.cat = id; clear(view); const cat = OPS.cats.find(c => c.id === id);
    const c = h('div', { class: 'card', style: 'margin-top:12px' }, Kit.cardHead(cat.description, 'Last updated ' + fmtWhen(cat.lastupdate)));
    view.appendChild(c);
    const body2 = h('div', { class: 'note', text: 'Reading…' }); c.appendChild(body2);
    const go = rows => {
      clear(body2); body2.className = '';
      if (!rows.length) { body2.className = 'empty'; body2.textContent = 'No notices in this category.'; return; }
      rows.slice().sort((a, b) => String(b.Date).localeCompare(String(a.Date))).forEach((r, i) => {
        const d = h('details', { open: i === 0 ? '' : null, style: 'margin-top:8px' }, h('summary', { text: fmtWhen(r.Date) + (r.Description && r.Description !== cat.description ? ' · ' + r.Description : '') }));
        d.appendChild(noticeTable(r.XMLData || '')); body2.appendChild(d);
      });
    };
    if (OPS.cache.has(id)) go(OPS.cache.get(id));
    else opsJson('/MCM/Contributions/' + encodeURIComponent(id)).then(rows => { OPS.cache.set(id, rows || []); if (OPS.cat === id) go(rows || []); }).catch(e => { clear(body2); body2.className = 'empty'; body2.textContent = 'Could not read this notice (' + e.message + ').'; });
  }
  function paint() {
    clear(list);
    const sorted = OPS.cats.slice().sort((a, b) => stamp(b) - stamp(a));
    const t = Kit.table([{ key: 'c', label: 'Notice', cls: 'l', nosort: true, render: r => h('a', { href: '#', text: r.description, onclick: ev => { ev.preventDefault(); show(r.id); view.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }) }, { key: 'u', label: 'Last updated', cls: 'l', nosort: true, render: r => fmtWhen(r.lastupdate) }, { key: 'f', label: 'Frequency', cls: 'l hide-s', nosort: true, render: r => r.frequency || '' }], { sortKey: null, page: 30 });
    t.set(sorted); t.el.style.maxHeight = 'none';
    list.appendChild(h('div', { class: 'card', style: 'margin-top:12px' }, Kit.cardHead('All notices', sorted.length + ' categories, most recently updated first. Click one to read it.'), t.el));
    show(OPS.cat || (OPS.cats.find(c => c.id === 'REPO') || sorted[0]).id);
  }
  if (OPS.cats) paint();
  else { intro.appendChild(h('div', { class: 'note', text: 'Reading the list of notices…' })); opsJson('/MCM/Categories').then(c => { OPS.cats = c || []; intro.lastChild.remove(); paint(); }).catch(e => { intro.lastChild.textContent = 'Could not read the notices (' + e.message + ').'; intro.appendChild(h('button', { class: 'btn', type: 'button', text: 'Try again', onclick: () => ctx.redo() })); }); }
  body.appendChild(h('div', { class: 'sub', style: 'margin-top:12px' }, 'The complete Reserve Bank dataset and notices archive are in the dedicated ', h('a', { href: FULL_SITE, target: '_blank', rel: 'noopener', text: 'SARB Data Explorer ↗' }), '.'));
}

/* ============================================================================== tab shell: loading states + routing */
function create() {
  const hs = Kit.hashState.read(TAB);
  const st = { v: SECS.some(s => s.v === hs.get('v')) ? hs.get('v') : 'rates', range: hs.get('r') || '10', fromYear: hs.get('from') || '' };
  const cs = [], browsers = [], state = {};
  let alive = true, loadingFor = null, loadingEl = null;
  const kill = () => { while (cs.length) cs.pop().destroy(); while (browsers.length) browsers.pop().destroy(); };
  const root = Kit.tabShell({ title: 'Money & Markets', pubs: [], relevance: RELEVANCE });
  const body = h('div'); Kit.freshOrder(body);                          // fresh, frequently updated charts first; annual / pre-2025 ones below
  const rangeCtl = Kit.rangeCtl(st, () => render());
  const save = () => Kit.hashState.write(TAB, { v: st.v === 'rates' ? '' : st.v, r: st.fromYear ? '' : (st.range === '10' ? '' : st.range), from: st.fromYear });
  root.appendChild(h('div', { class: 'filters', style: 'margin-bottom:8px' }, Kit.segmented(SECS, st.v, v => { st.v = v; render(); save(); }), h('label', { class: 'lbl', style: 'margin-left:10px', text: 'All charts', title: 'Sets the range of every chart on this page; each chart also has its own range buttons' }), rangeCtl.el));
  root.appendChild(body);
  const ctx = { tab: TAB, body, cs, browsers, state, xr: pub => { const X = Store.pubX[pub]; if (!X) return [2000, new Date().getFullYear() + 1]; return rangeCtl.xr(X[0], X[X.length - 1]); }, redo: () => { render(); save(); } };
  function render() { Kit.keepScroll(renderBody); }
  function loadingCard(missing) {
    const est = Feeds.estimate(missing), P = Feeds.progress;
    const c = h('div', { class: 'card' }, Kit.cardHead('Loading data', 'The history for this section is read when you first open it, then kept; later visits only fetch what is new.'));
    const msg = h('div', { class: 'note' }); c.appendChild(msg);
    const bar = h('div', { style: 'height:6px;border-radius:3px;background:var(--rule);margin:8px 0;overflow:hidden' }, h('div', { style: 'height:100%;width:0;background:var(--accent);transition:width .3s' }));
    c.appendChild(bar);
    const upd = () => { const tot = P.total || 0, done = P.done; msg.textContent = (P.active ? 'Updating the latest figures: ' + done + ' of ' + tot + ' series' : 'Loading the stored history') + (est.series && est.mb >= 0.1 ? ' (about ' + (est.mb < 1 ? '<1' : Math.round(est.mb)) + ' MB the first time)' : '') + '…' + (P.failed ? ' ' + P.failed + ' could not be fetched.' : ''); bar.firstChild.style.width = P.active && tot ? Math.min(100, done / tot * 100) + '%' : '35%'; };
    upd(); loadingEl = { upd }; return c;
  }
  function needMissing(sec) { return needEntries(sec).filter(e => !Feeds.has(e)); }
  function renderBody() {
    kill(); clear(body); loadingEl = null;
    if (!window.Feeds) { body.appendChild(h('div', { class: 'empty', text: 'Live data is not available in this build.' })); return; }
    if (!Feeds.isReady()) { body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Preparing', 'Loading the stored history…'))); Feeds.ready.then(() => { if (alive) render(); }); return; }
    const sec = st.v, missing = needMissing(sec);
    if (missing.length) {
      loadingFor = sec; body.appendChild(loadingCard(missing));
      Feeds.load(missing).then(() => { if (!alive || st.v !== sec) return; const still = needMissing(sec); if (!still.length || !Feeds.progress.active) { loadingFor = null; renderDone(sec, still); } });
      return;
    }
    renderDone(sec, []);
    if (needEntries(sec).length) Feeds.load(needEntries(sec));                           // anything stored but out of date is re-read in the background; the section redraws when newer data arrives
  }
  // the data of a publication can be stored a moment before the publication is built into the page; wait for that (at most about 6 s) so the section never draws with a publication missing
  const unbuilt = sec => (NEED[sec].pubs || []).filter(c => { const es = Feeds.entriesFor({ pubs: [c] }).filter(e => !e.hide); return es.length && es.every(e => Feeds.has(e)) && !Store.pub(c); });
  let gaveUp = null;
  function renderDone(sec, still) {
    if (unbuilt(sec).length && gaveUp !== sec) {
      kill(); clear(body); loadingEl = null; body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Preparing', 'Building the stored history…')));
      let n = 0; const iv = setInterval(() => { if (!alive || st.v !== sec) { clearInterval(iv); return; } if (!unbuilt(sec).length || ++n > 40) { clearInterval(iv); if (unbuilt(sec).length) gaveUp = sec; renderDone(sec, still); } }, 150);
      return;
    }
    kill(); clear(body); loadingEl = null;
    const all = needEntries(sec);
    if (still.length && still.length >= all.length * 0.8) {
      body.appendChild(h('div', { class: 'card' }, Kit.cardHead('Data is not reachable right now', 'The history for this section is not stored in this browser yet and the source did not answer.'), h('div', { class: 'note' }, h('button', { class: 'btn', type: 'button', text: 'Try again', onclick: () => render() }))));
      return;
    }
    if (still.length) body.appendChild(h('div', { class: 'note', style: 'margin-bottom:8px' }, still.length + ' of the series for this section could not be loaded and are left out. ', h('button', { class: 'btn', type: 'button', text: 'Try again', onclick: () => render() })));
    try { ({ rates, fx, bonds, money, external, fiscal, ops })[sec](ctx); }
    catch (e) { body.appendChild(h('div', { class: 'empty', text: 'This section could not be drawn: ' + e.message })); console.error(e); }
  }
  const onUpdate = () => { if (!alive) return; if (loadingEl) loadingEl.upd(); };
  document.addEventListener('feedsupdate', onUpdate);
  const onRefreshed = () => { if (alive && !loadingFor && !loadingEl && st.v !== 'ops') render(); };
  document.addEventListener('feedsrefreshed', onRefreshed);
  document.addEventListener('themechange', () => { cs.forEach(c => c.redraw && c.redraw()); browsers.forEach(b => b.redraw && b.redraw()); });
  render();
  return { el: root, destroy() { alive = false; document.removeEventListener('feedsupdate', onUpdate); document.removeEventListener('feedsrefreshed', onRefreshed); kill(); } };
}
function coverage() { if (window.Feeds) usePubs(Object.keys(Feeds.pubDef).filter(c => c !== 'MRDEI' && !/^(NATACC|ECOIND)/.test(c))); }
window.Markets = { create, coverage };
})();
