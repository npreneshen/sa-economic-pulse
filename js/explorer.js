/* explorer.js - Series Explorer tab: search / filter / plot / export any series. */
(function () {
'use strict';
const { h, clear, fmt, time, TF } = Kit;
const Store = Kit.store;
const MAX_SEL = 8;
const PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];

const DIMS = {                       // filter dimension -> accessor
  pub:   it => it.pub,
  adj:   it => it.adj,
  price: it => it.price || 'n/a',
  unit:  it => it.unit || '(none)',
  geo:   it => it.geo || '(national / none)',
  freq:  it => it.freq,
};
const ADJ_LABEL = { nsa: 'Actual (not seasonally adjusted)', sa: 'Seasonally adjusted', trend: 'Trend' };
const FREQ_LABEL = { D: 'Daily', M: 'Monthly', Q: 'Quarterly', A: 'Annual', S: 'Periodic survey' };
const STYLES = [['line', 'Line'], ['area', 'Area'], ['bar', 'Bars'], ['scatter', 'Scatter'], ['stackbar', 'Stacked bars'], ['stackarea', 'Stacked area']];
const VIEWS = [['', 'As set above'], ['level', 'Level'], ['pct', '% change'], ['yoy', '% y/y'], ['ydiff', 'Δ y/y'], ['rebase', 'Rebased = 100'], ['ma', 'Moving average'], ['sum', 'Rolling sum']];
const defWin = it => it.freq === 'D' ? 250 : it.freq === 'M' ? 12 : it.freq === 'Q' ? 4 : 3;
const PRICE_LABEL = { current: 'Current prices', constant: 'Constant prices', 'n/a': 'Not applicable' };

function unitKeyFirst(views) { return views.length ? (Store.unitKey(views[0].it, views[0].tf) || ('~' + views[0].tf.split(':')[0])) : ''; }
function axisFor(it, tf, firstKey, manual, stack, axisMap) {
  if (stack) return 'l';
  if (manual) return axisMap[it.key] === 'r' ? 'r' : 'l';
  const k = Store.unitKey(it, tf) || ('~' + tf.split(':')[0]);
  return k === firstKey ? 'l' : 'r';
}

function create() {
  const st = {
    q: '', f: { pub: new Set(), adj: new Set(), price: new Set(), unit: new Set(), geo: new Set(), freq: new Set() },
    tfOf: {}, axis: {}, style: 'line', fx: [], fxN: 0,       // per-series view and axis; chart style; formula series {k, expr, keys}
    sel: [],                           // keys, in add order
    color: new Map(),                  // key -> palette index (colour follows the entity)
    tf: 'level', range: '10', fromYear: '', layout: 'auto', tableView: false, sortKey: 'pub', sortDir: 1,
  };
  loadHash(st);

  const root = h('div');
  const countEl = h('span', { class: 'count' });
  const search = h('input', { type: 'search', placeholder: 'Search ' + Store.all.length.toLocaleString('en-US') + ' series — e.g. gold, retail "constant", Gauteng', 'aria-label': 'Search series', value: st.q });
  const msPub = Kit.multiSelect('Publication', set => { st.f.pub = set; refresh(); });
  const msAdj = Kit.multiSelect('Adjustment', set => { st.f.adj = set; refresh(); });
  const msPrice = Kit.multiSelect('Price basis', set => { st.f.price = set; refresh(); });
  const msUnit = Kit.multiSelect('Unit', set => { st.f.unit = set; refresh(); });
  const msGeo = Kit.multiSelect('Geography', set => { st.f.geo = set; refresh(); });
  const msFreq = Kit.multiSelect('Frequency', set => { st.f.freq = set; refresh(); });
  const clearBtn = h('button', { type: 'button', class: 'ghost small', text: 'Reset filters', onclick: () => {
    st.q = ''; search.value = ''; Object.keys(st.f).forEach(k => st.f[k] = new Set()); refresh(); } });
  let qTimer = null;
  search.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { st.q = search.value; refresh(); }, 120); });

  const filters = h('div', { class: 'filters' }, h('div', { class: 'grow' }, search), msPub, msFreq, msAdj, msPrice, msUnit, msGeo, clearBtn, countEl);

  // ---------- results table
  const cols = [
    { key: 'sel', label: '', nosort: true, cls: '', render: it => h('span', { class: 'chk', 'aria-hidden': 'true' }, st.color.has(it.key) && st.sel.includes(it.key) ? h('i', { style: 'background:' + PALETTE[st.color.get(it.key)] }) : null) },
    { key: 'pub', label: 'Publication', cls: 'l', sort: it => it.pubShort.toLowerCase() + '|' + it.label.toLowerCase(), render: it => h('span', {}, h('span', { class: 'code', text: it.pub }), h('div', { class: 'sm', text: it.pubShort })) },
    { key: 'label', label: 'Series', cls: 'l lab', sort: it => it.label.toLowerCase(), render: it => h('div', { title: it.label + ' [' + it.id + ']' }, h('div', { class: 't', text: Store.primary(it) }), it.measure && it.measure !== Store.primary(it) ? h('div', { class: 'sm', text: it.measure }) : null) },
    { key: 'unit', label: 'Unit', cls: 'l hide-s', sort: it => it.unit, render: it => h('span', {}, it.unit, it.base && !/^At /.test(it.base) ? h('div', { class: 'sm', text: it.base.replace(/^Base:\s*/, '') }) : null) },
    { key: 'adj', label: 'Basis', cls: 'l hide-s', sort: it => it.adj, render: it => h('span', { class: 'badge ' + it.adj, text: it.adj === 'sa' ? 'SA' : it.adj === 'trend' ? 'Trend' : 'Actual' }) },
    { key: 'last', label: 'Latest', firstDir: -1, sort: it => it.last, render: it => h('span', {}, fmt.num(it.last), h('div', { class: 'sm', text: fmt.period(it.lastP) })) },
    { key: 'yoy', label: 'y/y', firstDir: -1, title: 'Change on a year earlier (% , or percentage points for % series)', sort: it => it.yoy, render: it => it.yoy == null ? '–' : fmt.signed(it.yoy, 1, it.yoyKind === 'pp' ? ' pp' : '%') },
    { key: 'spark', label: 'Trend', nosort: true, cls: 'hide-s', render: it => Kit.spark(sparkVals(it)) },
    { key: 'first', label: 'From', cls: 'hide-s', sort: it => Store.pubX[it.pub][it.s], render: it => fmt.period(it.firstP) },
  ];
  const tbl = Kit.table(cols, { sortKey: st.sortKey, sortDir: st.sortDir, page: 150, empty: 'No series match these filters.',
    isSel: it => st.sel.includes(it.key), onRow: it => toggle(it.key), onSort: (k, d) => { st.sortKey = k; st.sortDir = d; writeHash(st); } });
  const sparkCache = new Map();
  function sparkVals(it) {
    let v = sparkCache.get(it.key); if (v) return v;
    const keep = it.freq === 'D' ? 250 : it.freq === 'M' ? 60 : it.freq === 'Q' ? 20 : 24; v = it.v.slice(-keep); sparkCache.set(it.key, v); return v;
  }
  const listCard = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', { text: 'Series' }), h('div', { class: 'sub', text: 'Click rows to plot (up to ' + MAX_SEL + '); then transform, combine with a formula or put them on separate axes on the right. Click a column heading to sort.' })),
    tbl.el);

  // ---------- formula series: a, b, c ... are the selected series in order; the result is a new series that joins the selection
  const derived = new Map();
  const itemOf = k => Store.byKey.get(k) || derived.get(k);
  const letter = i => i < 26 ? String.fromCharCode(97 + i) : '·';
  function parseFx(src) {
    let i = 0; const ws = () => { while (i < src.length && src[i] === ' ') i++; };
    function expr() { let n = term(); for (;;) { ws(); const c = src[i]; if (c === '+' || c === '-') { i++; n = { op: c, l: n, r: term() }; } else return n; } }
    function term() { let n = pow(); for (;;) { ws(); const c = src[i]; if (c === '*' || c === '/') { i++; n = { op: c, l: n, r: pow() }; } else return n; } }
    function pow() { let n = fact(); ws(); if (src[i] === '^') { i++; n = { op: '^', l: n, r: pow() }; } return n; }
    function fact() {
      ws(); const c = src[i];
      if (c === '(') { i++; const n = expr(); ws(); if (src[i] !== ')') throw new Error('missing )'); i++; return n; }
      if (c === '-') { i++; return { op: 'neg', l: fact() }; }
      if (c && /[0-9.]/.test(c)) { let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++; const num = parseFloat(src.slice(i, j)); i = j; return { num }; }
      if (c && /[a-z]/i.test(c)) {
        let j = i; while (j < src.length && /[a-z]/i.test(src[j])) j++; const w = src.slice(i, j).toLowerCase();
        if (w.length === 1) { i = j; return { v: w }; }
        if (['abs', 'ln', 'log', 'sqrt'].includes(w)) { i = j; ws(); if (src[i] !== '(') throw new Error(w + ' needs ( )'); i++; const a = expr(); ws(); if (src[i] !== ')') throw new Error('missing )'); i++; return { fn: w, l: a }; }
        throw new Error("unknown '" + w + "' - use single letters for series, or abs / ln / log / sqrt");
      }
      throw new Error("unexpected '" + (c || 'end') + "'");
    }
    const n = expr(); ws(); if (i < src.length) throw new Error("unexpected '" + src[i] + "'"); return n;
  }
  function evalFx(n, get) {
    if (n.num != null) return n.num; if (n.v) return get(n.v);
    if (n.op === 'neg') { const a = evalFx(n.l, get); return a == null ? null : -a; }
    if (n.fn) { const a = evalFx(n.l, get); if (a == null) return null; return n.fn === 'abs' ? Math.abs(a) : n.fn === 'sqrt' ? (a < 0 ? null : Math.sqrt(a)) : n.fn === 'ln' ? (a > 0 ? Math.log(a) : null) : (a > 0 ? Math.log10(a) : null); }
    const a = evalFx(n.l, get), b = evalFx(n.r, get); if (a == null || b == null) return null;
    return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? (b === 0 ? null : a / b) : Math.pow(a, b);
  }
  function valueAt(it, x) {                // last observation at or before x (a slower series is held across the dates of a faster one)
    const X = Store.pubX[it.pub]; let lo = 0, hi = it.n - 1, best = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (X[it.s + mid] <= x + 1e-9) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    return best < 0 ? null : it.v[best];
  }
  function buildFx(def, items) {            // items: the series a, b, c ... in order
    const ast = parseFx(def.expr), used = [];
    (function walk(n) { if (!n || typeof n !== 'object') return; if (n.v && !used.includes(n.v)) used.push(n.v); walk(n.l); walk(n.r); })(ast);
    if (!used.length) throw new Error('reference at least one series letter (a, b, ...)');
    used.forEach(u => { const k = u.charCodeAt(0) - 97; if (k < 0 || k >= items.length) throw new Error("'" + u + "' is not a selected series"); });
    const base = items[used[0].charCodeAt(0) - 97], X = Store.pubX[base.pub], full = new Array(base.periods.length).fill(null);
    for (let i = 0; i < base.n; i++) {
      const x = X[base.s + i];
      const v = evalFx(ast, l => { const it = items[l.charCodeAt(0) - 97]; return it === base ? base.v[i] : valueAt(it, x); });
      if (v != null && isFinite(v)) full[base.s + i] = v;
    }
    const names = used.map(u => u + ' = ' + Store.shortName(items[u.charCodeAt(0) - 97]));
    const it = Store.derive(base, def.k, def.expr, full, { unit: 'formula', label: 'Formula ' + def.expr, pubShort: 'Formula', measure: names.join('; '), sub: '', geo: '', name: def.expr, base: '' });
    if (!it) throw new Error('no overlapping observations');
    return it;
  }
  function rebuildDerived() {
    st.fx.forEach(def => { if (derived.has(def.k)) return; try { derived.set(def.k, buildFx(def, def.keys.map(itemOf))); } catch (e) { /* source gone: the formula series is dropped */ } });
    st.sel = st.sel.filter(k => !k.startsWith('fx:') || derived.has(k));
  }

  // ---------- chart column
  const chartCard = h('div', { class: 'card chartcol' });
  root.appendChild(filters);
  root.appendChild(h('div', { class: 'explorer' }, listCard, chartCard));

  // ---------- filtering
  function matches(it, skip) {
    if (st.q) { const toks = st.q.toLowerCase().match(/"[^"]+"|\S+/g) || []; for (const t of toks) { const w = t.replace(/^"|"$/g, ''); if (w && it.hay.indexOf(w) < 0) return false; } }
    for (const d in st.f) if (d !== skip && st.f[d].size && !st.f[d].has(DIMS[d](it))) return false;
    return true;
  }
  function facet(dim, labelFn, order) {
    const counts = new Map();
    Store.all.forEach(it => { if (matches(it, dim)) { const k = DIMS[dim](it); counts.set(k, (counts.get(k) || 0) + 1); } });
    const all = new Map(); Store.all.forEach(it => all.set(DIMS[dim](it), 1));
    st.f[dim].forEach(k => all.set(k, 1));
    let keys = Array.from(all.keys());
    keys.sort(order || ((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || String(a).localeCompare(b)));
    return keys.map(k => ({ v: k, label: labelFn(k), count: counts.get(k) || 0 }));
  }
  let results = [];
  function refresh() {
    results = Store.all.filter(it => matches(it));
    tbl.set(results);
    countEl.textContent = results.length.toLocaleString('en-US') + ' of ' + Store.all.length.toLocaleString('en-US') + ' series';
    const pubOrder = Store.pubs.map(p => p.code);
    msPub.set(facet('pub', c => c + ' · ' + (Kit.PUB_SHORT[c] || c), (a, b) => pubOrder.indexOf(a) - pubOrder.indexOf(b)), st.f.pub);
    msAdj.set(facet('adj', k => ADJ_LABEL[k] || k), st.f.adj);
    msPrice.set(facet('price', k => PRICE_LABEL[k] || k), st.f.price);
    msUnit.set(facet('unit', k => k), st.f.unit);
    msGeo.set(facet('geo', k => k), st.f.geo);
    msFreq.set(facet('freq', k => FREQ_LABEL[k] || k, (a, b) => 'DMQAS'.indexOf(a) - 'DMQAS'.indexOf(b)), st.f.freq);
    writeHash(st);
  }

  // ---------- selection
  function toggle(key) {
    const i = st.sel.indexOf(key);
    if (i >= 0) st.sel.splice(i, 1);
    else {
      if (st.sel.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' series — remove one first'); return; }
      st.sel.push(key);
    }
    assignColors(); tbl.refresh(); renderChart(); writeHash(st);
  }
  function assignColors() {
    st.color.forEach((_, k) => { if (!st.sel.includes(k)) st.color.delete(k); });
    st.sel.forEach(k => {
      if (st.color.has(k)) return;
      const used = new Set(st.color.values()); let c = 0; while (used.has(c)) c++;
      st.color.set(k, c);
    });
  }

  // ---------- chart rendering
  let charts = [];
  function rangeX(items) {
    let x1 = -Infinity, x0all = Infinity;
    items.forEach(it => { const X = Store.pubX[it.pub]; x1 = Math.max(x1, X[it.s + it.n - 1]); x0all = Math.min(x0all, X[it.s]); });
    let x0 = x0all;
    if (st.fromYear && +st.fromYear > 1900) x0 = Math.max(x0all, +st.fromYear);
    else if (st.range !== 'all') x0 = Math.max(x0all, x1 - (+st.range));
    return [x0, x1];
  }
  function renderChart() {
    charts.forEach(c => c.destroy()); charts = [];
    clear(chartCard);
    const items = st.sel.map(itemOf).filter(Boolean);

    chartCard.appendChild(h('div', { class: 'card-head' }, h('h3', { text: items.length ? 'Chart' : 'Chart' }),
      items.length ? h('div', { class: 'tools' },
        h('button', { type: 'button', class: 'small', text: 'Download CSV', title: 'Levels, full history', onclick: () => exportCsv(items) }),
        h('button', { type: 'button', class: 'small', text: 'Copy link', onclick: copyLink }),
        h('button', { type: 'button', class: 'small ghost', text: 'Clear', onclick: () => { st.sel = []; assignColors(); tbl.refresh(); renderChart(); writeHash(st); } })) : null));

    if (!items.length) {
      chartCard.appendChild(h('div', { class: 'empty', text: 'Select one or more series from the list to plot them here. Series with different units are shown on separate charts; use a % or rebased view to overlay them on one axis.' }));
      return;
    }

    // controls: default view, range, layout, style, table view
    const tfSeg = Kit.segmented(Object.keys(TF).map(k => ({ v: k, label: k === 'level' ? 'Level' : k === 'pct' ? '% prior' : k === 'yoy' ? '% y/y' : k === 'ydiff' ? 'Δ y/y' : 'Rebased', title: TF[k].label })), st.tf, v => { st.tf = v; renderChart(); writeHash(st); });
    const rangeSeg = Kit.segmented([{ v: '1', label: '1Y' }, { v: '3', label: '3Y' }, { v: '5', label: '5Y' }, { v: '10', label: '10Y' }, { v: '25', label: '25Y' }, { v: 'all', label: 'All' }], st.fromYear ? '' : st.range,
      v => { st.range = v; st.fromYear = ''; renderChart(); writeHash(st); });
    const fromIn = h('input', { type: 'number', min: '1950', max: '2100', placeholder: 'from year', style: 'width:92px', 'aria-label': 'Start year', value: st.fromYear });
    fromIn.addEventListener('change', () => { st.fromYear = fromIn.value; renderChart(); writeHash(st); });
    const laySeg = Kit.segmented([{ v: 'auto', label: 'Auto', title: 'One chart; two different units go on a left and a right axis' }, { v: 'overlay', label: 'One axis' }, { v: 'separate', label: 'Separate' }], st.layout, v => { st.layout = v; renderChart(); writeHash(st); });
    const viewSeg = Kit.segmented([{ v: 'chart', label: 'Chart' }, { v: 'table', label: 'Table' }], st.tableView ? 'table' : 'chart', v => { st.tableView = v === 'table'; renderChart(); });
    const stySel = h('select', { 'aria-label': 'Chart style', title: 'Chart style' }, STYLES.map(([v, l]) => { const o = h('option', { value: v, text: l }); if (v === st.style) o.selected = true; return o; }));
    stySel.addEventListener('change', () => { st.style = stySel.value; renderChart(); writeHash(st); });
    chartCard.appendChild(h('div', { class: 'filters', style: 'margin:8px 0 4px' }, h('label', { class: 'lbl', text: 'View' }), tfSeg, rangeSeg, fromIn, h('label', { class: 'lbl', text: 'Style' }), stySel, items.length > 1 ? laySeg : null, viewSeg));

    // one row per selected series: letter, colour, name, its own view, its axis, remove
    const tfOf = it => st.tfOf[it.key] || st.tf, tfBase = t => t.split(':')[0];
    const stack = st.style === 'stackbar' || st.style === 'stackarea';
    const rowsEl = h('div', { class: 'serrows' });
    items.forEach((it, i) => {
      const cur = st.tfOf[it.key] || '', kind = cur ? tfBase(cur) : '';
      const vsel = h('select', { 'aria-label': 'View of ' + it.label, class: 'rowsel' }, VIEWS.map(([v, l]) => { const o = h('option', { value: v, text: v === '' ? 'View: as set above' : l }); if (v === kind) o.selected = true; return o; }));
      const nIn = h('input', { type: 'number', min: '2', max: '120', class: 'winin', 'aria-label': 'Window', title: 'Window (observations)', value: cur.indexOf(':') > 0 ? cur.split(':')[1] : String(defWin(it)) });
      nIn.style.display = kind === 'ma' || kind === 'sum' ? '' : 'none';
      const setTf = () => { const k = vsel.value; if (!k) delete st.tfOf[it.key]; else if (k === 'ma' || k === 'sum') st.tfOf[it.key] = k + ':' + Math.max(2, Math.min(120, parseInt(nIn.value, 10) || defWin(it))); else st.tfOf[it.key] = k; renderChart(); writeHash(st); };
      vsel.addEventListener('change', setTf); nIn.addEventListener('change', setTf);
      const ax = st.axis[it.key] === 'r';
      const axb = items.length > 1 && !stack ? h('button', { type: 'button', class: 'axtag' + (ax ? ' on' : ''), title: ax ? 'On the right axis. Click to move to the left axis' : 'On the left axis. Click to move to the right axis', text: ax ? 'R' : 'L' }) : null;
      if (axb) axb.addEventListener('click', () => { if (ax) delete st.axis[it.key]; else st.axis[it.key] = 'r'; if (st.layout === 'separate') st.layout = 'auto'; renderChart(); writeHash(st); });
      rowsEl.appendChild(h('div', { class: 'serrow' },
        h('b', { class: 'ltr', title: 'Use ' + letter(i) + ' in a formula', text: letter(i) }), h('span', { class: 'key', style: 'background:' + PALETTE[st.color.get(it.key)] }),
        h('span', { class: 'nm', title: it.pubShort + ': ' + it.label, text: it.pubShort + ' · ' + Store.shortName(it) }), vsel, nIn, axb,
        h('button', { type: 'button', class: 'x', 'aria-label': 'Remove ' + it.label, text: '×', onclick: () => toggle(it.key) })));
    });
    chartCard.appendChild(rowsEl);

    // formula bar
    const fBox = h('input', { type: 'text', class: 'fxin', placeholder: 'formula, e.g. a-b   or   100*a/b   or   (a+b)/2   or   ln(a)', 'aria-label': 'Formula over the selected series', spellcheck: 'false' });
    const fBtn = h('button', { type: 'button', class: 'small', text: 'plot formula ⊕' });
    const fMsg = h('span', { class: 'fxmsg', text: 'a, b, c… are the series above, in order. The result joins the chart as a new series.' });
    const plotFx = () => {
      const src = fBox.value.trim().toLowerCase(); if (!src) return;
      if (st.sel.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' series — remove one first'); return; }
      try {
        const def = { k: 'fx:' + (++st.fxN), expr: src, keys: st.sel.slice() }, it = buildFx(def, items);
        st.fx.push(def); derived.set(def.k, it); st.sel.push(def.k); assignColors(); fBox.value = ''; renderChart(); writeHash(st);
      } catch (e) { fMsg.textContent = 'Error: ' + e.message; fMsg.classList.add('err'); setTimeout(() => { fMsg.classList.remove('err'); fMsg.textContent = 'a, b, c… are the series above, in order. The result joins the chart as a new series.'; }, 4000); }
    };
    fBtn.addEventListener('click', plotFx); fBox.addEventListener('keydown', e => { if (e.key === 'Enter') plotFx(); });
    chartCard.appendChild(h('div', { class: 'fxbar' }, h('label', { class: 'lbl', text: 'Formula' }), fBox, fBtn, fMsg));

    const [x0, x1] = rangeX(items);
    const views = items.map(it => ({ it, tf: tfOf(it), v: Store.view(it, tfOf(it), x0, x1) }));
    const ukeys = new Set(views.map(({ it, tf }) => Store.unitKey(it, tf) || ('~' + tfBase(tf))));
    const mixed = ukeys.size > 1, manualAx = Object.keys(st.axis).length > 0 && !stack;
    const separate = items.length > 1 && (st.layout === 'separate' || (st.layout === 'auto' && !manualAx && ukeys.size > 2));
    if (mixed && st.layout === 'overlay') chartCard.appendChild(h('div', { class: 'note' }, 'These series use different units, so one shared axis can mislead. Use ', h('b', { text: 'Auto' }), ' for left / right axes, or % y/y or Rebased.'));
    if (separate && st.layout === 'auto') chartCard.appendChild(h('div', { class: 'note' }, 'More than two different units, so one chart per series. Switch the view to % y/y or Rebased to overlay them, or tag series L / R.'));
    const doSeparate = separate;

    // KPI strip for the most recently added series
    const focus = items[items.length - 1], S = Store.stats(focus);
    chartCard.appendChild(h('div', { class: 'sub', style: 'margin:8px 0 0', text: items.length > 1 ? 'Headline figures: ' + Store.shortName(focus) + ' (' + focus.pubShort + ')' : focus.label }));
    const pp = S.isPct;
    chartCard.appendChild(Kit.kpiStrip([
      { label: 'Latest · ' + fmt.period(focus.lastP), value: fmt.num(S.cur), note: focus.unit + (focus.base ? ' · ' + focus.base.replace(/^Base:\s*/, '') : ''), spark: sparkVals(focus) },
      { label: 'vs prior ' + time.stepName(focus.freq), value: fmt.signed(S.dPrior, 1, pp ? ' pp' : '%'), delta: S.prior != null ? [{ text: 'was ' }, { text: fmt.num(S.prior), bold: true }] : null },
      { label: 'vs year ago', value: fmt.signed(S.dYear, 1, pp ? ' pp' : '%'), delta: S.yago != null ? [{ text: 'was ' }, { text: fmt.num(S.yago), bold: true }] : null },
      { label: 'vs prior-12 average', value: fmt.signed(S.dAvg, 1, pp ? ' pp' : '%') },
      { label: 'Percentile since ' + fmt.period(focus.firstP), value: S.pctile == null ? '–' : fmt.ord(S.pctile), note: 'range ' + fmt.num(S.min) + ' – ' + fmt.num(S.max) },
    ]));

    const isGrowth = tf => tf === 'pct' || tf === 'yoy', fmtVal = (v, se) => { const tf = se && se.tf ? se.tf : st.tf; return isGrowth(tf) ? fmt.signed(v, 2, '%') : fmt.num(v); };
    const zero = views.some(({ tf }) => isGrowth(tf) || tf === 'ydiff'), ref = views.length && views.every(({ tf }) => tf === 'rebase') ? 100 : null;
    if (st.tableView) { chartCard.appendChild(tableView(views)); }
    else if (!doSeparate) {
      const host = h('div'); chartCard.appendChild(host);
      const first = unitKeyFirst(views);
      const lUnit = Store.unitLabel(views[0].it, views[0].tf);
      host.appendChild(h('div', { class: 'sub', style: 'margin:6px 0 0', text: ukeys.size > 1 ? 'Left axis: ' + lUnit + (views.some(({ it, tf }) => axisFor(it, tf, first, manualAx, stack, st.axis) === 'r') ? '   ·   Right axis: ' + Store.unitLabel(views.find(({ it, tf }) => axisFor(it, tf, first, manualAx, stack, st.axis) === 'r').it, views.find(({ it, tf }) => axisFor(it, tf, first, manualAx, stack, st.axis) === 'r').tf) : '') : lUnit }));
      const series = views.map(({ it, tf, v }) => ({ key: it.key, name: Store.shortName(it), color: PALETTE[st.color.get(it.key)], xs: v.xs, vs: v.vs, ps: v.ps, tf, axis: stack ? 'l' : axisFor(it, tf, first, manualAx, stack, st.axis) }));
      charts.push(Kit.lineChart(host, { series, height: 320, x0, x1, zero, ref, single: items.length === 1, area: items.length === 1 && st.style === 'line', style: st.style,
        label: 'Chart of ' + items.map(i => i.label).join('; '), valFmt: fmtVal, source: Kit.sourceOf(items.map(i => i.pub)) }));
    } else {
      const grid = h('div', { class: 'smgrid' }); chartCard.appendChild(grid);
      views.forEach(({ it, tf, v }) => {
        const cell = h('div', { class: 'cell' }, h('h4', {}, h('span', { class: 'key', style: 'width:16px;height:2px;flex:none;background:' + PALETTE[st.color.get(it.key)] }),
          h('span', { class: 't', title: it.label, text: it.pubShort + ' · ' + Store.shortName(it) })),
          h('div', { class: 'u', text: Store.unitLabel(it, tf) }));
        grid.appendChild(cell);
        charts.push(Kit.lineChart(cell, { series: [{ key: it.key, name: Store.shortName(it), color: PALETTE[st.color.get(it.key)], xs: v.xs, vs: v.vs, ps: v.ps, tf }],
          height: 190, x0, x1, zero: isGrowth(tf) || tf === 'ydiff', ref: tf === 'rebase' ? 100 : null, single: true, area: st.style === 'line', style: st.style === 'stackbar' ? 'bar' : st.style === 'stackarea' ? 'area' : st.style, tickCount: 4, label: it.label, source: Kit.sourceOf([it.pub]),
          valFmt: (val) => fmtVal(val, { tf }) }));
      });
    }

    // summary table
    chartCard.appendChild(summaryTable(items, x0, x1));
  }

  function tableView(views) {
    const periods = new Map();
    views.forEach(({ v }) => v.ps.forEach((p, i) => { periods.set(p, v.xs[i]); }));
    const rows = Array.from(periods.entries()).sort((a, b) => b[1] - a[1]);
    const ix = views.map(({ v }) => { const m = new Map(); v.ps.forEach((p, i) => m.set(p, v.vs[i])); return m; });
    const cols = [{ key: 'p', label: 'Period', cls: 'l', sort: r => r[1], firstDir: -1, render: r => fmt.period(r[0]) }].concat(views.map(({ it, tf }, k) => ({
      key: 'v' + k, label: it.pubShort + ' · ' + Store.shortName(it), firstDir: -1, sort: r => ix[k].get(r[0]), render: r => { const v = ix[k].get(r[0]); return v == null ? '–' : (tf === 'pct' || tf === 'yoy') ? fmt.signed(v, 2, '%') : fmt.num(v); } })));
    const t = Kit.table(cols, { page: 120, sortKey: 'p', sortDir: -1 }); t.set(rows);
    const wrap = h('div', {}, h('div', { class: 'sub', style: 'margin-top:6px', text: 'Table view — ' + views.map(({ it, tf }) => Store.unitLabel(it, tf)).filter((x, i, a) => a.indexOf(x) === i).join('; ') }), t.el);
    return wrap;
  }
  function summaryTable(items, x0, x1) {
    const cols = [
      { key: 'n', label: 'Series', cls: 'l lab', nosort: true, render: it => h('span', { style: 'display:flex;gap:6px;align-items:center' }, h('span', { style: 'width:12px;height:2px;flex:none;background:' + PALETTE[st.color.get(it.key)] }), h('span', { class: 't', title: it.label, text: it.pubShort + ' · ' + Store.shortName(it) })) },
      { key: 'src', label: 'ID', cls: 'l hide-s', nosort: true, render: it => h('span', { class: 'code', text: it.id }) },
      { key: 'last', label: 'Latest', nosort: true, render: it => fmt.num(it.last) + ' ' },
      { key: 'p', label: 'Period', nosort: true, cls: 'l', render: it => fmt.period(it.lastP) },
      { key: 'rng', label: 'Hi / Lo in view', nosort: true, cls: 'hide-s', render: it => { const v = Store.view(it, 'level', x0, x1).vs.filter(x => x != null); return v.length ? fmt.num(Math.max.apply(null, v)) + ' / ' + fmt.num(Math.min.apply(null, v)) : '–'; } },
      { key: 'obs', label: 'Obs', nosort: true, cls: 'hide-s', render: it => String(it.v.filter(x => x != null).length) },
      { key: 'xf', label: 'Other fields in the workbook', nosort: true, cls: 'l hide-s', render: it => it.x ? h('span', { class: 'sm', title: Object.keys(it.x).map(k => k + ': ' + it.x[k]).join('\n'), text: Object.keys(it.x).map(k => k + ': ' + it.x[k]).join(' \u00b7 ') }) : '' },
    ];
    const t = Kit.table(cols, { page: 20 }); t.set(items);
    t.el.style.maxHeight = 'none';
    return h('div', { style: 'margin-top:10px' }, t.el);
  }
  function exportCsv(items) {
    const periods = new Map();
    items.forEach(it => { const X = Store.pubX[it.pub]; it.v.forEach((v, i) => { const p = it.periods[it.s + i]; periods.set(p, X[it.s + i]); }); });
    const keys = Array.from(periods.entries()).sort((a, b) => a[1] - b[1]).map(e => e[0]);
    const maps = items.map(it => { const m = new Map(); it.v.forEach((v, i) => m.set(it.periods[it.s + i], v)); return m; });
    const head = ['Period'].concat(items.map(it => it.pub + ':' + it.id + ' | ' + it.label + ' | ' + it.unit + (it.base ? ' | ' + it.base : '') + ' | ' + it.adj));
    const lines = [head.map(Kit.csvCell).join(',')];
    keys.forEach(p => lines.push([p].concat(maps.map(m => m.has(p) ? m.get(p) : '')).map(Kit.csvCell).join(',')));
    Kit.download('sa-pulse-series.csv', '﻿' + lines.join('\r\n') + '\r\n');
  }
  function copyLink() {
    const url = location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => Kit.toast('Link copied'), () => window.prompt('Copy this link', url));
    else window.prompt('Copy this link', url);
  }

  document.addEventListener('themechange', () => { charts.forEach(c => c.redraw()); });
  rebuildDerived(); assignColors(); refresh(); renderChart();
  // series read live (rates, FX, money and credit, ...) join the list as they arrive; the rest can be loaded here on request
  if (window.Feeds) {
    const note = h('div', { class: 'sub', style: 'margin:4px 0' });
    countEl.parentNode.insertBefore(note, countEl.nextSibling);
    const paint = () => {
      if (!Feeds.isReady()) return;
      const miss = Feeds.entriesFor({}).filter(e => !e.hide && !Feeds.has(e)), est = Feeds.estimate(miss); note.textContent = '';
      search.placeholder = 'Search ' + Store.all.length.toLocaleString('en-US') + ' series — e.g. gold, retail "constant", Gauteng';
      if (Feeds.progress.active) { note.textContent = 'Loading more series… ' + Feeds.progress.done + ' of ' + Feeds.progress.total; return; }
      if (miss.length) {
        note.appendChild(document.createTextNode(miss.length + ' more series (interest rates, exchange rates, money and credit, balance of payments, public finance and more) are read live and not loaded yet. '));
        note.appendChild(h('button', { class: 'btn', type: 'button', text: 'Load them (about ' + Math.max(1, Math.round(est.mb)) + ' MB the first time)', onclick: () => { Feeds.ensureAll(); paint(); } }));
      }
    };
    const onFeeds = () => { if (!root.isConnected) { document.removeEventListener('feedsupdate', onFeeds); return; } paint(); refresh(); };
    document.addEventListener('feedsupdate', onFeeds); paint();
  }
  return { el: root, destroy() { charts.forEach(c => c.destroy()); } };
}

/* ---------- shareable state in the URL hash ---------- */
function writeHash(st) {
  const p = new URLSearchParams();
  if (st.q) p.set('q', st.q);
  Object.keys(st.f).forEach(k => { if (st.f[k].size) p.set(k, Array.from(st.f[k]).join('|')); });
  if (st.sel.length) p.set('sel', st.sel.join(','));
  if (st.tf !== 'level') p.set('tf', st.tf);
  if (st.fromYear) p.set('from', st.fromYear); else if (st.range !== '10') p.set('r', st.range);
  if (st.layout !== 'auto') p.set('lay', st.layout);
  if (st.style !== 'line') p.set('sty', st.style);
  const tfo = Object.keys(st.tfOf).map(k => k + '=' + st.tfOf[k]); if (tfo.length) p.set('tfo', tfo.join('~'));
  const axo = Object.keys(st.axis).filter(k => st.axis[k] === 'r'); if (axo.length) p.set('axr', axo.join('~'));
  if (st.fx.length) p.set('fx', st.fx.map(d => d.k + '=' + d.expr + '=' + d.keys.join(',')).join('~'));
  if (st.sortKey !== 'pub' || st.sortDir !== 1) p.set('sort', st.sortKey + (st.sortDir < 0 ? '-' : '+'));
  const q = p.toString(), hash = '#/explorer' + (q ? '?' + q : '');
  try { history.replaceState(null, '', hash); } catch (e) { /* file:// quirks - state just isn't shareable */ }
}
function loadHash(st) {
  const m = /^#\/explorer\?(.*)$/.exec(location.hash); if (!m) return;
  const p = new URLSearchParams(m[1]);
  st.q = p.get('q') || '';
  Object.keys(st.f).forEach(k => { const v = p.get(k); if (v) st.f[k] = new Set(v.split('|')); });
  (p.get('fx') || '').split('~').filter(Boolean).forEach(t => { const a = t.split('='); if (a.length >= 3 && /^fx:\d+$/.test(a[0])) { st.fx.push({ k: a[0], expr: a[1], keys: a.slice(2).join('=').split(',').filter(Boolean) }); st.fxN = Math.max(st.fxN, +a[0].slice(3)); } });
  (p.get('sel') || '').split(',').filter(k => Store.byKey.has(k) || st.fx.some(d => d.k === k)).slice(0, MAX_SEL).forEach(k => st.sel.push(k));
  (p.get('tfo') || '').split('~').filter(Boolean).forEach(t => { const i = t.lastIndexOf('='); if (i > 0) st.tfOf[t.slice(0, i)] = t.slice(i + 1); });
  (p.get('axr') || '').split('~').filter(Boolean).forEach(k => { st.axis[k] = 'r'; });
  if (STYLES.some(x => x[0] === p.get('sty'))) st.style = p.get('sty');
  if (TF[p.get('tf')]) st.tf = p.get('tf');
  if (p.get('from')) st.fromYear = p.get('from'); else if (p.get('r')) st.range = p.get('r');
  if (['overlay', 'separate'].includes(p.get('lay'))) st.layout = p.get('lay');
  const so = /^(\w+)([+-])$/.exec(p.get('sort') || ''); if (so) { st.sortKey = so[1]; st.sortDir = so[2] === '-' ? -1 : 1; }
}

window.Explorer = { create };
})();
