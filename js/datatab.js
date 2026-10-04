/* datatab.js - Data & Update tab: freshness, release schedule, coverage audit, parse report. */
(function () {
'use strict';
const { h, clear, fmt } = Kit;
const Store = Kit.store;
const TABS = [['economy', 'Economy', () => Economy.coverage()], ['markets', 'Money & Markets', () => window.Markets && Markets.coverage()], ['resources', 'Resources', () => Resources.coverage()], ['industrials', 'Industrials', () => Industrials.coverage()], ['consumer', 'Consumer', () => Consumer.coverage()],
  ['property', 'Property & Construction', () => Property.coverage()], ['travel', 'Travel & Leisure', () => Travel.coverage()], ['corporate', 'Corporate', () => Corporate.coverage()], ['prices', 'Prices', () => Prices.coverage()]];
const FREQ = { D: 'Daily', M: 'Monthly', Q: 'Quarterly', A: 'Annual', S: 'Periodic survey' };

function create() {
  TABS.forEach(t => t[2]());                                        // make every sector tab register the series it can display
  const man = window.EQ.manifest, today = new Date().toISOString().slice(0, 10);
  const root = h('div');
  root.appendChild(h('h3', { class: 'serif', style: 'margin:0;font-size:18px', text: 'Data & Update' }));
  root.appendChild(h('div', { class: 'page-sub', text: 'Where the numbers come from, how fresh they are, when the next release is due, and which series each tab draws on. Data parsed ' + man.parsedAt.replace('T', ' ') + '.' }));

  // update health: what the updater did on its last run, and any publication whose newest file it refused (the held data stays on screen until it is fixed)
  const us = window.EQ.updateStatus;
  if (us && us.lastRun) {
    const when = d => d ? String(d).replace('T', ' ').slice(0, 16) : 'never';
    const problems = Object.keys(us.pubs || {}).filter(c => ['rejected', 'unavailable', 'kept'].indexOf(us.pubs[c].status) >= 0 && Store.pubs.some(p => p.code === c));
    const card = h('div', { class: 'card', style: 'margin-top:12px' }, Kit.cardHead('Update health', 'Last updater run ' + when(us.lastRun) + ': ' + us.result + '. Last successful update ' + when(us.lastSuccess) + '.' + (us.snapshot ? ' Safety copy: ' + us.snapshot + '.' : '')));
    if (!problems.length) card.appendChild(h('div', { class: 'note', text: 'Nothing is being held back: every publication shows its newest file.' }));
    else {
      const t = Kit.table([{ key: 'c', label: 'Code', cls: 'l', nosort: true, render: r => h('span', { class: 'code', text: r.c }) }, { key: 's', label: 'Status', cls: 'l', nosort: true, render: r => r.s.status === 'rejected' ? 'Newest file rejected, showing held data' : r.s.status === 'unavailable' ? 'Newest file not on the StatsSA site yet' : 'Downloaded file had nothing new' },
        { key: 'h', label: 'Showing', cls: 'l', nosort: true, render: r => fmt.period(r.s.from || (Store.pub(r.c) || {}).last) }, { key: 'w', label: 'Why', cls: 'l', nosort: true, render: r => h('div', { class: 'sm', text: r.s.reason || '' }) }, { key: 'a', label: 'When', cls: 'l', nosort: true, render: r => when(r.s.at) }], { sortKey: null, page: 20 });
      t.set(problems.map(c => ({ c, s: us.pubs[c] }))); t.el.style.maxHeight = 'none'; card.appendChild(t.el);
      card.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Nothing was lost: the previous data stays in use and a safety copy is kept in the backups folder (tools\\Restore-Snapshot.ps1 -List). The updater tries again when StatsSA publishes a different file.' }));
    }
    root.appendChild(card);
  }
  // release calendar: StatsSA's calendar is re-read one page a day (tools\Update-Calendar.ps1); moved dates and new releases are merged into the schedule used below
  const cs = window.EQ.calendarStatus;
  if (cs && cs.lastCheck) {
    const w2 = d => d ? String(d).replace('T', ' ').slice(0, 16) : 'never';
    const card = h('div', { class: 'card', style: 'margin-top:12px' }, Kit.cardHead('Release calendar', 'Checked against StatsSA\'s Scheduled Publications page, one page a day. Last check ' + w2(cs.lastCheck) + ' (' + (cs.lastResult || 'ok') + '). Last change to a date or time: ' + w2(cs.lastChange) + '.'));
    const ch = [].concat(cs.lastChanges || []);
    if (ch.length) card.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: 'Latest changes: ' + ch.join('; ') }));
    root.appendChild(card);
  }
  // live series: what has been read from the source into this browser, and a cross-check of the headline inflation figures against the source's own
  if (window.Feeds) {
   const mkLive = () => {
    const st = Feeds.status(), codes = Object.keys(st), loaded = codes.reduce((a, c) => a + st[c].loaded, 0), total = codes.reduce((a, c) => a + st[c].total, 0);
    const card = h('div', { class: 'card', style: 'margin-top:12px' }, Kit.cardHead('Live series', loaded + ' of ' + total + ' live series (interest rates, exchange rates, money and credit, balance of payments, public finance, business cycle, SDDS tables) are loaded in this browser right now. Their full history ships with the site in ' + (Feeds.snapshotInfo() ? Object.keys(Feeds.snapshotInfo().parts || {}).length + ' parts (built ' + Feeds.snapshotInfo().built.replace('T', ' ').slice(0, 16) + '), each loaded only when a section needs it' : 'parts') + ', and the recent days are read directly from the Reserve Bank\'s public data service, then kept in this browser. Series that are not loaded yet are read from the site when a section needs them (the Explorer\'s "Load them" button reads them all). Data © South African Reserve Bank.'));
    const t = Kit.table([{ key: 'c', label: 'Code', cls: 'l', nosort: true, render: r => h('span', { class: 'code', text: r.c }) }, { key: 'n', label: 'Group', cls: 'l', nosort: true, render: r => r.s.name }, { key: 'f', label: 'Freq', cls: 'l', nosort: true, render: r => ({ D: 'Daily', M: 'Monthly', Q: 'Quarterly', A: 'Annual' })[r.s.freq] },
      { key: 'l', label: 'Loaded', nosort: true, render: r => r.s.loaded + ' of ' + r.s.total }, { key: 'w', label: 'Last read', cls: 'l', nosort: true, render: r => r.s.newest ? new Date(r.s.newest).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : '–' }], { sortKey: null, page: 30 });
    t.set(codes.map(c => ({ c, s: st[c] }))); t.el.style.maxHeight = 'none'; card.appendChild(t.el);
    const out = h('div', { class: 'note', style: 'margin-top:8px' }), btn = h('button', { class: 'btn', type: 'button', text: 'Cross-check headline CPI and PPI against the source' });
    btn.addEventListener('click', async () => {
      btn.disabled = true; out.textContent = 'Reading…';
      try {
        await Feeds.ensureCodes(['CPI1000F', 'PPI1000F']);
        const cmp = (hid, ownId, pubCode) => { const hd = Feeds.hidden[hid], it = Store.byKey.get(pubCode + ':' + ownId); if (!hd || !it) return null; const X = Store.full(it), P = it.periods; let ok = 0, n = 0, worst = 0; hd.pts.slice(-12).forEach(([i, v]) => { const lab = Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0'), k = P.indexOf(lab); if (k < 12 || X[k] == null || !X[k - 12]) return; n++; const own = (X[k] / X[k - 12] - 1) * 100, d = Math.abs(own - v); worst = Math.max(worst, d); if (d <= 0.06) ok++; }); return { ok, n, worst }; };
        const a = cmp('CPI1000F', 'CPS00000', 'P0141'), b = cmp('PPI1000F', 'PPC30000', 'P0142.1');
        const say = (nm, r) => r ? nm + ': ' + r.ok + ' of ' + r.n + ' of the last months agree to within 0.06 percentage points (largest gap ' + r.worst.toFixed(2) + ')' : nm + ': not available';
        out.textContent = say('Headline CPI', a) + '. ' + say('PPI (final manufactured goods)', b) + '.';
      } catch (e) { out.textContent = 'Could not read the source: ' + e.message; }
      btn.disabled = false;
    });
    card.appendChild(h('div', { style: 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center' }, btn, h('button', { class: 'btn', type: 'button', text: 'Clear the stored live series', onclick: async () => { await Feeds.clearCache(); Kit.toast('Cleared. They will be read again when needed.'); } })));
    card.appendChild(out); return card;
   };
   let liveCard = mkLive(), liveTimer = null; root.appendChild(liveCard);
   const repaint = () => { clearTimeout(liveTimer); liveTimer = setTimeout(() => { if (!root.isConnected) { document.removeEventListener('feedsupdate', repaint); return; } const c = mkLive(); liveCard.replaceWith(c); liveCard = c; }, 600); };
   document.addEventListener('feedsupdate', repaint); Feeds.ready.then(repaint);
  }
  const days = d => Math.round((new Date(d + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 864e5);
  const isUsed = it => TABS.some(t => (Kit.coverage.used[t[0]] || new Set()).has(it.key));
  const rows = Store.pubs.map(p => {
    const nx = Kit.sched.next(p.code), rep = (man.report || {})[p.code] || {};
    const all = Store.all.filter(it => it.pub === p.code), disc = all.filter(it => it.lastP !== p.last);
    const usedBy = TABS.filter(t => all.some(it => (Kit.coverage.used[t[0]] || new Set()).has(it.key))).map(t => t[1]);
    const covered = all.filter(isUsed).length;
    return { p, nx, rep, all, disc, usedBy, covered, notCov: all.filter(it => !isUsed(it)) };
  });
  const cols = [
    { key: 'c', label: 'Code', cls: 'l', nosort: true, render: r => h('span', { class: 'code', text: r.p.code }) },
    { key: 'n', label: 'Publication', cls: 'l', nosort: true, render: r => h('span', {}, r.p.short, h('div', { class: 'sm', text: r.p.name })) },
    { key: 'f', label: 'Freq', cls: 'l', nosort: true, render: r => FREQ[r.p.freq] },
    { key: 'l', label: 'Latest data', cls: 'l', nosort: true, render: r => fmt.period(r.p.last) },
    { key: 'nx', label: 'Next release', cls: 'l', nosort: true, render: r => r.nx ? Kit.sched.dateText(r.nx.date) + ' ' + r.nx.time + ' (' + fmt.period(r.nx.period) + ')' : '–' },
    { key: 'in', label: 'In', nosort: true, render: r => r.nx ? (days(r.nx.date) <= 0 ? 'today' : days(r.nx.date) + ' days') : '–' },
    { key: 'sr', label: 'Series', nosort: true, render: r => String(r.p.n) },
    { key: 'cv', label: 'On a sector tab', nosort: true, title: 'Series each sector tab can display', render: r => r.covered + ' / ' + r.all.length + (r.covered === r.all.length ? ' ✓' : '') },
    { key: 'ub', label: 'Shown on', cls: 'l hide-s', nosort: true, render: r => r.usedBy.join(', ') || '–' },
    { key: 'go', label: '', nosort: true, render: r => h('a', { href: '#/explorer?pub=' + encodeURIComponent(r.p.code), text: 'Explore →' }) },
  ];
  const t1 = Kit.table(cols, { sortKey: null, page: 20, cls: 'pubtable' }); t1.set(rows); t1.el.style.maxHeight = 'none';
  root.appendChild(h('div', { class: 'card' }, Kit.cardHead('Publications', 'All ' + Store.pubs.length + ' publications in this app' + (window.Feeds && Feeds.cached() ? ' (' + Store.pubs.filter(p => Feeds.pubDef[p.code]).length + ' of them are live series: history shipped with the site, recent days read live)' : '')), t1.el));

  // coverage audit
  const tot = rows.reduce((a, r) => a + r.all.length, 0), cov = rows.reduce((a, r) => a + r.covered, 0);
  const audit = h('div', { class: 'card', style: 'margin-top:12px' });
  audit.appendChild(Kit.cardHead('Coverage audit', cov.toLocaleString('en-US') + ' of ' + tot.toLocaleString('en-US') + ' series can be displayed on a sector tab; the Series Explorer reaches all ' + Store.all.length.toLocaleString('en-US') + '.'));
  rows.forEach(r => {
    if (!r.notCov.length) return;
    const cur = r.notCov.filter(it => it.lastP === r.p.last).length;
    const d = h('details', { style: 'margin-top:6px' }, h('summary', { text: r.p.code + ' ' + r.p.short + ': ' + r.notCov.length + ' series not on a sector tab (' + cur + ' current, ' + (r.notCov.length - cur) + ' discontinued)' }));
    d.appendChild(h('ul', { style: 'margin:4px 0 0 18px;padding:0;font-size:12.5px' }, r.notCov.map(it => h('li', { text: it.label + ' [' + it.id + '] ' + fmt.period(it.firstP) + ' – ' + fmt.period(it.lastP) + (it.lastP !== r.p.last ? ' (discontinued)' : '') }))));
    audit.appendChild(d);
  });
  if (cov === tot) audit.appendChild(h('div', { class: 'note', text: 'Every series is covered.' }));
  root.appendChild(audit);

  // integration status: the publication table from the brief, marked up with what has been integrated
  const IN = (window.EQ.integration || {}).pubs || {}, TOT = (window.EQ.integration || {}).totals;
  const BRIEF = [['P2041', 'Mining Production and Sales', 'Gold/platinum/coal miners (Sibanye, AngloGold, Harmony, Implats)'], ['P3041.2', 'Manufacturing Production and Sales', 'Industrials'],
    ['P3043', 'Manufacturing capacity utilisation', 'Industrials \u2014 operating leverage signal'], ['P6343.2', 'Motor Trade Sales', 'Auto dealers/importers'], ['P6242.1', 'Retail Trade Sales', 'Retailers (Shoprite, Woolworths, Pick n Pay, TFG)'],
    ['P6141.2', 'Wholesale Trade Sales', 'Distributors'], ['P6410', 'Tourist Accommodation', 'Hospitality/travel (City Lodge, Tsogo Sun, airlines)'],
    ['P5041.1', 'Building Statistics', 'Construction, cement/materials (PPC, AfriSam proxies), property developers'], ['P0151.1', 'Construction Materials Price Indices', 'Construction, cement/materials (PPC, AfriSam proxies), property developers'],
    ['P0160', 'Residential Property Price Index', 'Listed property (REITs)'], ['P4141', 'Electricity generated & distributed', 'Utilities, energy-intensive industrials'], ['P0021', 'Annual Financial Statistics', 'Corporate sector profitability benchmarking'],
    ['P0141', 'Consumer Price Index (CPI) \u2014 added', 'Inflation: retailer pricing power, SARB policy, rate-sensitive stocks'], ['P0141AP', 'CPI average prices (Rand) \u2014 added', 'Shelf prices of ~390 everyday products, national and by province'],
    ['P0142.1', 'Producer Price Index (PPI) \u2014 added', 'Input costs and margins: manufacturers, miners, utilities'],
    ['P7162', 'Land transport survey \u2014 added', 'Freight and passenger activity: logistics and transport operators'], ['P6420', 'Food and beverages \u2014 added', 'Restaurants, fast food, caterers'],
    ['P0142.7', 'Export and import unit value indices \u2014 added', 'Terms of trade, export prices, import costs'], ['P0043.1', 'Statistics of liquidations \u2014 added', 'Corporate distress, credit cycle'],
    ['P0043.2', 'Statistics of insolvencies \u2014 added', 'Household distress, credit cycle'], ['P0041', 'Civil cases for debt \u2014 added', 'Consumer credit stress'],
    ['P0044', 'Quarterly financial statistics (QFS) \u2014 added', 'Quarterly corporate turnover and profit by industry and size'], ['P1101', 'Agricultural survey \u2014 added', 'Farm income and costs'], ['P0441', 'GDP, quarterly — added', 'Growth backdrop for every sector'], ['P0441A', 'GDP, annual — added', 'Growth backdrop'], ['P0441.2', 'Provincial GDP — added', 'Regional growth'], ['P0211', 'Quarterly Labour Force Survey — added', 'Jobs, unemployment, consumer income'],
    ['P0277', 'Quarterly Employment Statistics — added', 'Payroll jobs and wages by industry'], ['P0045', 'Quarterly capital expenditure — added', 'Capex cycle: industrials, miners, utilities'], ['P9101', 'Public-sector capital expenditure — added', 'Infrastructure spend: construction, materials'],
    ['P9119.3', 'National government finance — added', 'Fiscal position, bond market'], ['P9119.4', 'General government finance — added', 'Fiscal position'], ['P9121', 'Provincial government finance — added', 'Provincial spending'],
    ['P9102', 'Extra-budgetary accounts finance — added', 'Public funds'], ['P9103.1', 'Higher education finance — added', 'Universities'], ['P9110.1', 'Municipal quarterly finance — added', 'Municipalities'], ['P9115', 'Municipal census — added', 'Municipal services']];
  const WHERE = { P2041: 'Resources', 'P3041.2': 'Industrials', P3043: 'Industrials', P4141: 'Industrials', 'P6242.1': 'Consumer', 'P6343.2': 'Consumer', 'P6141.2': 'Consumer', 'P5041.1': 'Property & Construction', 'P0151.1': 'Property & Construction', P0160: 'Property & Construction', P6410: 'Travel & Leisure', P0021: 'Corporate', P0141: 'Prices', P0141AP: 'Prices', 'P0142.1': 'Prices', P7162: 'Industrials', P6420: 'Consumer', 'P0142.7': 'Prices', 'P0043.1': 'Corporate', 'P0043.2': 'Corporate', P0041: 'Corporate', P0044: 'Corporate' };
  WHERE.P1101 = 'Resources'; ['P0441','P0441A','P0441.2','P0211','P0277','P0045','P9101','P9119.3','P9119.4','P9121','P9102','P9103.1','P9110.1','P9115'].forEach(c => { WHERE[c] = 'Economy'; });
  if (TOT) {
    const pc = (a, b) => b ? (a === b ? '100%' : (a / b * 100).toFixed(2) + '%') : '\u2013';
    const irows = BRIEF.filter(b => Store.pub(b[0])).map(([code, nm, rel], k) => { const r = IN[code] || {}, cr = rows.find(x => x.p.code === code); const ok = r.numericCells && r.numericIntegrated === r.numericCells && !r.metaMissing; return { code, nm, rel, r, cr, ok, added: k >= 12 }; });
    const icols = [
      { key: 'c', label: 'Code', cls: 'l', nosort: true, render: r => h('span', { class: 'code', text: r.code }) },
      { key: 'n', label: 'Publication', cls: 'l', nosort: true, render: r => h('b', { text: r.nm }) },
      { key: 'st', label: 'Status', cls: 'l', nosort: true, render: r => h('span', { class: 'ok', text: r.ok ? '\u2705 Integrated' : '\u26a0\ufe0f Gaps' }) },
      { key: 'nc', label: 'Excel numbers in the app', nosort: true, render: r => (r.r.numericIntegrated || 0).toLocaleString('en-US') + ' of ' + (r.r.numericCells || 0).toLocaleString('en-US') + ' (' + pc(r.r.numericIntegrated, r.r.numericCells) + ')' },
      { key: 'w', label: 'Where', cls: 'l', nosort: true, render: r => WHERE[r.code] },
      { key: 's', label: 'Series', nosort: true, render: r => String(r.r.series || '') },
      { key: 'dc', label: 'Descriptive cells', nosort: true, cls: 'hide-s', render: r => ((r.r.metaCells || 0) - (r.r.metaMissing || 0)).toLocaleString('en-US') + ' of ' + (r.r.metaCells || 0).toLocaleString('en-US') },
      { key: 'f', label: 'Workbooks', nosort: true, cls: 'hide-s', render: r => String((r.r.files || []).length) },
      { key: 'sh', label: 'Charted on a sector tab', nosort: true, cls: 'hide-s', render: r => r.cr ? r.cr.covered + ' of ' + r.cr.all.length : '\u2013' },
      { key: 'rel', label: 'Sector relevance', cls: 'l hide-s', nosort: true, render: r => r.rel },
    ];
    const it = Kit.table(icols, { sortKey: null, page: 60, cls: 'pubtable' }); it.set(irows); it.el.style.maxHeight = 'none';
    it.el.querySelectorAll('tbody tr').forEach((tr, i) => tr.classList.add(irows[i].added ? 'newrow' : 'okrow'));
    root.appendChild(h('div', { class: 'card', style: 'margin-top:12px' },
      Kit.cardHead('Integration status \u2014 is everything in the Excel files in the app?', TOT.numericIntegrated.toLocaleString('en-US') + ' of ' + TOT.numericCells.toLocaleString('en-US') + ' numeric cells (' + pc(TOT.numericIntegrated, TOT.numericCells) + ') from ' + TOT.files + ' workbooks, ' + (TOT.metaCells - TOT.metaMissing).toLocaleString('en-US') + ' of ' + TOT.metaCells.toLocaleString('en-US') + ' descriptive cells and ' + TOT.noteIntegrated + ' of ' + TOT.noteCells + ' note cells. Green = your original table, blue = added since (CPI and PPI, land transport, food & beverages, trade prices, credit stress, quarterly results, industry surveys). Audit run ' + (window.EQ.integration.generated || '').replace('T', ' ') + '.'),
      it.el,
      h('div', { class: 'sub', style: 'margin-top:8px', text: 'Blank cells in the source (' + TOT.blankCells.toLocaleString('en-US') + ') mean no observation was published and are correctly empty. Details per workbook: INTEGRATION_STATUS.md.' })));
  }
  // publication notes carried from the workbooks
  const noted = Store.pubs.filter(p => p.notes && p.notes.length);
  if (noted.length) root.appendChild(h('div', { class: 'card', style: 'margin-top:12px' }, Kit.cardHead('Notes published with the data', 'Text on non-data sheets of the workbooks'),
    h('ul', { style: 'margin:4px 0 0 18px;padding:0;font-size:12.5px' }, noted.map(p => h('li', {}, h('span', { class: 'code', text: p.code }), ' ' + p.notes.filter(n => n !== 'Note').join(' '))))));

  // schedule
  const sch = (man.schedule || []).filter(r => r.date >= today).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : 1);
  const cols2 = [
    { key: 'd', label: 'Date', cls: 'l', nosort: true, render: r => Kit.sched.dateText(r.date) + ' ' + r.time },
    { key: 'p', label: 'Publication', cls: 'l', nosort: true, render: r => h('span', {}, h('span', { class: 'code', text: r.code }), ' ' + (Kit.PUB_SHORT[r.code] || r.code)) },
    { key: 'per', label: 'Covers', cls: 'l', nosort: true, render: r => fmt.period(r.period) },
  ];
  const t2 = Kit.table(cols2, { sortKey: null, page: 30 }); t2.set(sch); t2.el.style.maxHeight = '420px';
  root.appendChild(h('div', { class: 'card', style: 'margin-top:12px' }, Kit.cardHead('Release calendar', 'All scheduled releases (' + sch.length + '), from StatsSA’s publication schedule. The list needs refreshing every few months — see tools\\schedule-seed.json.'), t2.el));

  // sources + parse report
  const rep = man.report || {};
  const cols3 = [
    { key: 'c', label: 'Code', cls: 'l', nosort: true, render: r => h('span', { class: 'code', text: r.code }) },
    { key: 'f', label: 'Source files', cls: 'l', nosort: true, render: r => r.files.join('; ') },
    { key: 'pe', label: 'Periods', nosort: true, render: r => String(r.periods) },
    { key: 'fr', label: 'Range', cls: 'l', nosort: true, render: r => fmt.period(r.first) + ' – ' + fmt.period(r.last) },
    { key: 'se', label: 'Series', nosort: true, render: r => String(r.series) },
    { key: 'cf', label: 'Cross-file conflicts', nosort: true, cls: 'hide-s', render: r => String(r.crossFileConflicts) },
    { key: 'ed', label: 'Empty dropped', nosort: true, cls: 'hide-s', render: r => String(r.emptySeriesDropped) },
    { key: 'kb', label: 'Size', nosort: true, cls: 'hide-s', render: r => Math.round(r.bytes / 1024) + ' KB' },
  ];
  const t3 = Kit.table(cols3, { sortKey: null, page: 20, cls: 'pubtable' }); t3.set(Object.keys(rep).map(c => Object.assign({ code: c }, rep[c]))); t3.el.style.maxHeight = 'none';
  root.appendChild(h('div', { class: 'card', style: 'margin-top:12px' }, Kit.cardHead('Sources and parse report', 'Excel files read from statssa.gov.za/timeseriesdata, merged on series id (newest file wins). Every numeric cell was cross-checked against a second reader.'), t3.el));
  root.appendChild(h('div', { class: 'foot', text: 'Refresh: tools\\Update-Data.ps1 downloads whatever is due, re-parses and re-validates. Notes on specific series (for example the seasonally adjusted series StatsSA discontinued in 2002) are on the tabs that use them.' }));
  return { el: root, destroy() {} };
}
window.DataTab = { create };
})();
