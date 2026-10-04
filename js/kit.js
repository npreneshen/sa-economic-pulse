/* kit.js - UI kit + series store for the SA Economic Pulse app.
   Everything that comes from data (series names, labels) is inserted with textContent / text
   nodes, never innerHTML. */
(function () {
'use strict';
const SVGNS = 'http://www.w3.org/2000/svg';
const Kit = {};

/* ------------------------------------------------------------------ DOM helpers */
// h('div', {class:'x', onclick:fn, dataset:{a:1}}, 'text', childNode, ...)
function h(tag, attrs) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
  return el;
}
function append(el, c) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) { c.forEach(x => append(el, x)); return; }
  el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
}
function s(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
  for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
  return el;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
Kit.h = h; Kit.s = s; Kit.clear = clear;

/* ------------------------------------------------------------------ formatting */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = Kit.fmt = {
  period(p) {
    let m = /^(\d{4})-(\d\d)$/.exec(p); if (m) return MONTHS[+m[2] - 1] + ' ' + m[1];
    m = /^(\d{4})-Q(\d)$/.exec(p); if (m) return 'Q' + m[2] + ' ' + m[1];
    m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(p); if (m) return +m[3] + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1];                   // a daily observation
    return p == null ? '' : String(p);
  },
  num(v) {
    if (v == null || !isFinite(v)) return '–';
    const a = Math.abs(v);
    const d = a === 0 ? 0 : a >= 1000 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
  },
  ord(n) { const r = n % 100, s = (r >= 11 && r <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'; return n + s; },
  fixed(v, d) { return v == null || !isFinite(v) ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−'); },
  signed(v, d, suffix) {
    if (v == null || !isFinite(v)) return '–';
    const t = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    const zero = /^[0.,]*$/.test(t);                       // rounds to zero: no sign (avoids "−0.0")
    return (zero ? '' : v > 0 ? '+' : v < 0 ? '−' : '') + t + (suffix || '');
  },
  tick(v, step) {
    const d = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  },
};
function niceTicks(lo, hi, n) {
  if (!(hi > lo)) { const c = lo || 0; lo = c - 1; hi = c + 1; }
  const raw = (hi - lo) / Math.max(1, n);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const out = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) out.push(+t.toPrecision(12));
  return { ticks: out, step, lo: Math.min(lo, out[0] ?? lo), hi: Math.max(hi, out[out.length - 1] ?? hi) };
}
Kit.niceTicks = niceTicks;

/* ------------------------------------------------------------------ time + series store */
const time = Kit.time = {
  xOf(p) {                                  // decimal-year position; quarters sit on their last month
    let m = /^(\d{4})-(\d\d)$/.exec(p); if (m) return +m[1] + (+m[2] - 1) / 12;
    m = /^(\d{4})-Q(\d)$/.exec(p); if (m) return +m[1] + (+m[2] * 3 - 1) / 12;
    m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(p); if (m) return +m[1] + (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(+m[1], 0, 1)) / 864e5 / 365;       // daily: the day of the year as a fraction
    return +p + 11 / 12;
  },
  lag(freq) { return freq === 'M' ? 12 : freq === 'Q' ? 4 : 1; },
  stepName(freq) { return freq === 'D' ? 'day' : freq === 'M' ? 'month' : freq === 'Q' ? 'quarter' : freq === 'S' ? 'survey' : 'year'; },
};

const PUB_SHORT = Kit.PUB_SHORT = {
  'P2041': 'Mining', 'P3041.2': 'Manufacturing', 'P3043': 'Capacity utilisation', 'P4141': 'Electricity',
  'P6242.1': 'Retail', 'P6343.2': 'Motor trade', 'P6141.2': 'Wholesale', 'P5041.1': 'Building plans & completions',
  'P0151.1': 'Construction materials', 'P0160': 'House prices', 'P6410': 'Tourist accommodation', 'P0021': 'Annual financial stats',
  'P0141': 'CPI', 'P0141AP': 'CPI average prices', 'P0142.1': 'PPI',
  'P7162': 'Land transport', 'P6420': 'Food and beverages', 'P0142.7': 'Trade unit values', 'P0043.1': 'Liquidations', 'P0043.2': 'Insolvencies', 'P0041': 'Civil cases for debt', 'P0044': 'Quarterly financial stats',
  'P1101': 'Agricultural survey', 'P0441': 'GDP (quarterly)', 'P0441A': 'GDP (annual)', 'P0441.2': 'Provincial GDP', 'P0211': 'Labour force survey', 'P0277': 'Employment statistics', 'P0045': 'Quarterly capex', 'P9101': 'Public-sector capex',
  'P9119.3': 'National government', 'P9119.4': 'General government', 'P9121': 'Provincial government', 'P9102': 'Extra-budgetary funds', 'P9103.1': 'Higher education', 'P9110.1': 'Municipalities', 'P9115': 'Municipal census',
};

// Flat list of every series, with cheap derived fields computed once.
const Store = Kit.store = { all: [], byKey: new Map(), pubs: [], pubX: {} };
// Index (within a series that starts at period s) of the observation one year before point i, found by date: the index lag L is only right when no edition is missing
// (the agricultural survey has no 2018, so 2019 would otherwise be compared with 2017). -1 when that year has no observation.
Store.pubF = {};                                                  // publication code -> frequency (so a daily series finds "a year ago" by date)
Store.agoIdx = function (code, s, i, L) {
  const X = Store.pubX[code]; if (!X) return i - L;
  if (Store.pubF[code] === 'D') {                                  // daily: the last observation on or before the same date a year earlier, if there is one within ten days of it
    const tgt = X[s + i] - 1 + 1e-9; let lo = 0, hi = i - 1, best = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (X[s + mid] <= tgt) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    return best >= 0 && tgt - X[s + best] <= 10 / 365 ? best : -1;
  }
  const t = Math.round(X[s + i] * 12) - 12;
  for (let j = i - 1; j >= Math.max(0, i - L); j--) if (Math.round(X[s + j] * 12) === t) return j;
  return -1;
};
Store.build = function () {
  const E = window.EQ; if (!E) return;
  Store.all = []; Store.byKey.clear(); Store.pubs = [];
  Object.keys(E.pubs).forEach(code => Store.addPub(code));
};
// Add (or replace) one publication from window.EQ.pubs; used by build() and by the live feeds, whose publications arrive after the page has started.
Store.addPub = function (code) {
  const E = window.EQ; if (!E || !E.pubs[code]) return;
  if (Store.pubs.some(p => p.code === code)) { Store.all = Store.all.filter(it => { if (it.pub !== code) return true; Store.byKey.delete(it.key); return false; }); Store.pubs = Store.pubs.filter(p => p.code !== code); }
  {
    const P = E.pubs[code];
    Store.pubX[code] = P.periods.map(time.xOf); Store.pubF[code] = P.freq;
    const mp = ((E.manifest && E.manifest.pubs) || []).find(x => x.code === code);
    Store.pubs.push({ code, sched: (mp && mp.sched) || code, short: PUB_SHORT[code] || code, name: P.name, tab: P.tab, freq: P.freq, n: P.series.length, notes: P.notes || [], empty: P.empty || [], first: P.periods[0], last: P.periods[P.periods.length - 1], sources: P.sources });
    const L = time.lag(P.freq);
    P.series.forEach(r => {
      const n = r.v.length, cur = r.v[n - 1];
      const pj = Store.agoIdx(code, r.s, n - 1, L), prev = pj >= 0 ? r.v[pj] : null;
      const isPct = r.unit === 'Percentage';
      let yoy = null, yoyKind = isPct ? 'pp' : '%';
      if (cur != null && prev != null) yoy = isPct ? cur - prev : (prev !== 0 ? (cur - prev) / Math.abs(prev) * 100 : null);
      const cl = x => typeof x === 'string' ? x.replace(/�/g, ' ') : x;             // StatsSA exports contain a stray replacement character in some names
      r.label = cl(r.label); r.name = cl(r.name); r.measure = cl(r.measure); r.sub = cl(r.sub);
      const it = {
        key: code + ':' + r.id, pub: code, pubShort: PUB_SHORT[code] || code, freq: P.freq, tab: P.tab,
        id: r.id, label: r.label, name: r.name, measure: r.measure, sub: r.sub, geo: r.geo, price: r.price, adj: r.adj,
        unit: r.unit, base: r.base, w: r.w == null ? null : r.w, x: r.x || null, periods: P.periods, s: r.s, v: r.v,
        firstP: P.periods[r.s], lastP: P.periods[r.s + n - 1], last: cur, yoy, yoyKind, n,
      };
      it.hay = (code + ' ' + it.pubShort + ' ' + P.name + ' ' + r.id + ' ' + r.label + ' ' + r.unit + ' ' + r.base + ' ' + r.price + ' ' +
        (r.adj === 'sa' ? 'seasonally adjusted sa' : r.adj === 'trend' ? 'trend' : 'actual nsa')).toLowerCase();
      Store.all.push(it); Store.byKey.set(it.key, it);
    });
  }
};
// Distinguishing part of a series name, e.g. "Total, gold included" / "Hotels" / "Gauteng"
Store.primary = function (it) {
  const parts = [it.name, it.sub, it.geo].filter(Boolean);
  return parts.length ? parts.join(' · ') : it.measure;
};
// Legend / tooltip name: distinguishing part first (so truncation drops the shared measure text, not the name)
Store.shortName = function (it) {
  const p = Store.primary(it);
  const base = it.measure && it.measure !== p ? p + ' — ' + it.measure : p;
  const pr = it.price && !new RegExp(it.price, 'i').test(base) ? ', ' + it.price + ' prices' : '';
  return base + (it.adj === 'sa' ? ' (SA' + pr + ')' : it.adj === 'trend' ? ' (trend' + pr + ')' : pr ? ' (' + pr.slice(2) + ')' : '');
};
// dense arrays (xs, vs, ps) for one series, optionally transformed
Store.dense = function (it) {
  const X = Store.pubX[it.pub], xs = new Array(it.n), ps = new Array(it.n);
  for (let i = 0; i < it.n; i++) { xs[i] = X[it.s + i]; ps[i] = it.periods[it.s + i]; }
  return { xs, ps, vs: it.v.slice() };
};
const TF = Kit.TF = {
  level: { label: 'Level' },
  pct:   { label: '% vs prior period' },
  yoy:   { label: '% vs year ago' },
  ydiff: { label: 'Change vs year ago' },
  rebase:{ label: 'Rebased = 100' },
};
// Apply a transform on the FULL history first (so the first visible point already has a value), then cut to [x0,x1].
Store.view = function (it, tf, x0, x1) {
  const d = Store.dense(it), L = time.lag(it.freq), n = d.vs.length;
  let vs = d.vs;
  const mw = /^(ma|sum):(\d+)$/.exec(tf);
  if (mw) {                                              // trailing moving average / rolling sum over the last N observations (only where all N are present)
    const N = Math.max(2, +mw[2]), out = new Array(n).fill(null);
    for (let i = N - 1; i < n; i++) { let t = 0, ok = true; for (let j = i - N + 1; j <= i; j++) { if (d.vs[j] == null) { ok = false; break; } t += d.vs[j]; } if (ok) out[i] = mw[1] === 'ma' ? t / N : t; }
    vs = out;
  }
  if (tf === 'pct' || tf === 'yoy' || tf === 'ydiff') {
    const lag = tf === 'pct' ? 1 : L; vs = new Array(n).fill(null);
    const at = new Map(); const daily = Store.pubF[it.pub] === 'D'; if (tf !== 'pct' && !daily) d.xs.forEach((x, i) => at.set(Math.round(x * 12), i));          // "a year ago" is found by date, so a missing edition (P1101 has no 2018) is not bridged
    const dayAgo = i => { const tgt = d.xs[i] - 1 + 1e-9; let lo = 0, hi = i - 1, best = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (d.xs[mid] <= tgt) { best = mid; lo = mid + 1; } else hi = mid - 1; } return best >= 0 && tgt - d.xs[best] <= 10 / 365 ? best : null; };
    for (let i = lag; i < n; i++) {
      const j = tf === 'pct' ? i - 1 : daily ? dayAgo(i) : at.get(Math.round(d.xs[i] * 12) - 12);
      const a = d.vs[i], b = j == null ? null : d.vs[j]; if (a == null || b == null) continue;
      if (tf === 'ydiff') vs[i] = a - b; else if (b !== 0) vs[i] = (a - b) / Math.abs(b) * 100;
    }
  }
  const xs = [], ps = [], ov = [];
  for (let i = 0; i < n; i++) if (d.xs[i] >= x0 - 1e-9 && d.xs[i] <= x1 + 1e-9) { xs.push(d.xs[i]); ps.push(d.ps[i]); ov.push(vs[i]); }
  let out = ov;
  if (tf === 'rebase') {
    const base = ov.find(v => v != null && v !== 0);
    out = ov.map(v => v == null || base == null ? null : v / base * 100);
  }
  return { xs, ps, vs: out };
};
Store.unitKey = (it, tf) => tf === 'level' || tf === 'ydiff' || /^(ma|sum):/.test(tf) ? it.unit + '|' + it.base : '';
Store.unitLabel = function (it, tf) {
  if (tf === 'pct') return '% change on prior ' + time.stepName(it.freq);
  if (tf === 'yoy') return '% change on a year earlier';
  if (tf === 'rebase') return 'Rebased, start of range = 100';
  const mw = /^(ma|sum):(\d+)$/.exec(tf);
  if (mw) return (mw[1] === 'ma' ? mw[2] + '-period moving average, ' : 'Rolling ' + mw[2] + '-period sum, ') + it.unit;
  const u = it.unit + (it.base && !/^At /.test(it.base) ? ', ' + it.base.replace(/^Base:\s*/, '') : '');
  return tf === 'ydiff' ? 'Change on a year earlier, ' + u : u;
};

// headline statistics for a KPI strip
Store.stats = function (it) {
  const v = it.v, n = v.length, cur = v[n - 1], L = time.lag(it.freq);
  const at = k => (n - 1 - k >= 0 ? v[n - 1 - k] : null);
  const pct = (a, b) => (a == null || b == null || b === 0) ? null : (a - b) / Math.abs(b) * 100;
  const isPct = it.unit === 'Percentage';
  const prior = at(1), yj = Store.agoIdx(it.pub, it.s, n - 1, L), yago = yj >= 0 ? v[yj] : null;
  let avg = null; const w = []; for (let i = 1; i <= Math.min(12, n - 1); i++) if (at(i) != null) w.push(at(i));
  if (w.length >= 3) avg = w.reduce((a, b) => a + b, 0) / w.length;
  const sorted = v.filter(x => x != null).sort((a, b) => a - b);
  let below = 0; for (const x of sorted) if (x < cur) below++;
  const pctile = sorted.length > 4 ? Math.round(below / (sorted.length - 1) * 100) : null;
  return { cur, prior, yago, isPct,
    dPrior: isPct ? (prior == null ? null : cur - prior) : pct(cur, prior),
    dYear: isPct ? (yago == null ? null : cur - yago) : pct(cur, yago),
    dAvg: avg == null ? null : (isPct ? cur - avg : pct(cur, avg)),
    pctile, min: sorted[0], max: sorted[sorted.length - 1] };
};

/* ------------------------------------------------------------------ sparkline */
Kit.spark = function (vals, o) {
  o = o || {}; const W = o.w || 72, H = o.h || 20, pad = 2;
  const pts = vals.map((v, i) => [i, v]).filter(p => p[1] != null);
  const svg = s('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' });
  if (pts.length < 2) return svg;
  let lo = Infinity, hi = -Infinity; pts.forEach(p => { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; });
  if (hi === lo) { hi += 1; lo -= 1; }
  const x = i => pad + (i / (vals.length - 1)) * (W - 2 * pad), y = v => H - pad - (v - lo) / (hi - lo) * (H - 2 * pad);
  let d = '', pen = false;
  vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; });
  svg.appendChild(s('path', { d, fill: 'none', stroke: o.color || 'var(--muted)', 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const last = pts[pts.length - 1];
  svg.appendChild(s('circle', { cx: x(last[0]).toFixed(1), cy: y(last[1]).toFixed(1), r: 2.5, fill: o.dot || 'var(--accent)' }));
  return svg;
};

/* ------------------------------------------------------------------ KPI tile + strip */
// tiles: [{label, value, delta:[{text, bold}], note, spark:{vals}}]
Kit.kpiStrip = function (tiles) {
  const wrap = h('div', { class: 'kpis' });
  tiles.forEach(t => {
    const tile = h('div', { class: 'tile' }, h('div', { class: 'label', text: t.label }), h('div', { class: 'value', text: t.value }));
    if (t.delta) tile.appendChild(h('div', { class: 'delta' }, t.delta.map(d => d.bold ? h('b', { text: d.text }) : d.text)));
    if (t.note) tile.appendChild(h('div', { class: 'nt', text: t.note }));
    if (t.spark) tile.appendChild(Kit.spark(t.spark));
    wrap.appendChild(tile);
  });
  return wrap;
};

/* ------------------------------------------------------------------ controls */
Kit.segmented = function (opts, value, onChange) {
  const box = h('div', { class: 'seg', role: 'group' });
  const btns = opts.map(o => h('button', { type: 'button', text: o.label, title: o.title || null, 'aria-pressed': String(o.v === value),
    onclick: () => { set(o.v); onChange(o.v); } }));
  function set(v) { btns.forEach((b, i) => { const on = opts[i].v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); value = v; }
  btns.forEach(b => box.appendChild(b)); set(value);
  box.setValue = set; return box;
};

// Popover multi-select. options: [{v, label, count}]; selected: Set. onChange(Set)
Kit.multiSelect = function (label, onChange) {
  const root = h('div', { class: 'ms' });
  const btn = h('button', { type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false' });
  let pop = null, opts = [], sel = new Set();
  function paintBtn() { clear(btn); btn.appendChild(document.createTextNode(label)); if (sel.size) btn.appendChild(h('span', { class: 'n', text: String(sel.size) })); btn.appendChild(document.createTextNode(' ▾')); }
  function close() { if (pop) { pop.remove(); pop = null; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside, true); } }
  function outside(e) { if (!root.contains(e.target)) close(); }
  function open() {
    pop = h('div', { class: 'pop', role: 'listbox' });
    fill(); root.appendChild(pop); btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
  }
  function fill() {
    if (!pop) return; clear(pop);
    opts.forEach(o => {
      const cb = h('input', { type: 'checkbox' }); cb.checked = sel.has(o.v);
      cb.addEventListener('change', () => { cb.checked ? sel.add(o.v) : sel.delete(o.v); paintBtn(); onChange(new Set(sel)); });
      pop.appendChild(h('label', { class: o.count === 0 && !sel.has(o.v) ? 'zero' : '' }, cb, h('span', { text: o.label }), h('span', { class: 'c', text: o.count == null ? '' : String(o.count) })));
    });
    pop.appendChild(h('div', { class: 'foot' }, h('button', { type: 'button', class: 'small', text: 'Clear', onclick: () => { sel.clear(); paintBtn(); fill(); onChange(new Set()); } }),
      h('button', { type: 'button', class: 'small', text: 'Done', onclick: close })));
  }
  btn.addEventListener('click', () => pop ? close() : open());
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); btn.focus(); } });
  root.set = (o, selected) => { opts = o; sel = new Set(selected); paintBtn(); fill(); };
  root.appendChild(btn); paintBtn(); return root;
};

Kit.toast = function (msg) {
  const t = h('div', { class: 'toast', role: 'status', text: msg }); document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
};

Kit.download = function (name, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
};
Kit.csvCell = v => { if (v == null) return ''; const t = String(v); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };

/* ------------------------------------------------------------------ sortable table */
// cols: [{key,label,cls,sort:(row)=>val, render:(row)=>Node|string, nosort}]
Kit.table = function (cols, o) {
  o = o || {};
  const wrap = h('div', { class: 'tablewrap' });
  const table = h('table', { class: 'data' + (o.cls ? ' ' + o.cls : '') });
  const thead = h('thead'), tbody = h('tbody'), more = h('div', { class: 'moreRow' });
  table.appendChild(thead); table.appendChild(tbody); wrap.appendChild(table); wrap.appendChild(more);
  let rows = [], sortKey = o.sortKey || null, sortDir = o.sortDir || 1, shown = o.page || 200;
  const page = o.page || 200;
  function head() {
    clear(thead); const tr = h('tr');
    if (o.onToggle) tr.appendChild(h('th', { class: 'nosort rowaddh', scope: 'col', title: 'Add to / remove from the chart', 'aria-label': 'Chart' }));
    cols.forEach(c => {
      const th = h('th', { class: (c.cls || '') + (c.nosort ? ' nosort' : ''), text: c.label, scope: 'col', title: c.title || null });
      if (!c.nosort) {
        th.setAttribute('aria-sort', sortKey === c.key ? (sortDir > 0 ? 'ascending' : 'descending') : 'none');
        if (sortKey === c.key) th.appendChild(h('span', { class: 'arr', text: sortDir > 0 ? '▲' : '▼' }));
        th.addEventListener('click', () => { if (sortKey === c.key) sortDir = -sortDir; else { sortKey = c.key; sortDir = c.firstDir || 1; } head(); body(); if (o.onSort) o.onSort(sortKey, sortDir); });
      }
      tr.appendChild(th);
    });
    thead.appendChild(tr);
  }
  function sorted() {
    if (!sortKey) return rows;
    const c = cols.find(x => x.key === sortKey); if (!c || !c.sort) return rows;
    const dir = sortDir;
    return rows.map((r, i) => [r, c.sort(r), i]).sort((a, b) => {
      const x = a[1], y = b[1];
      if (x == null && y == null) return a[2] - b[2]; if (x == null) return 1; if (y == null) return -1;   // blanks always last
      return (x < y ? -1 : x > y ? 1 : a[2] - b[2]) * (x === y ? 1 : dir);
    }).map(a => a[0]);
  }
  function body() {
    clear(tbody); clear(more);
    const list = sorted();
    list.slice(0, shown).forEach(r => {
      const act = o.onOpen || o.onRow, canOpen = act && (!o.canOpen || o.canOpen(r)), sel = o.isSel && o.isSel(r);
      const tr = h('tr', { class: 'row' + (sel ? ' sel' : '') + (o.onOpen && canOpen ? ' openable' : ''), tabindex: canOpen ? '0' : null, title: o.onOpen && canOpen ? 'Click for the full history' : null });
      if (o.onToggle) {
        const td = h('td', { class: 'rowadd' });
        if (!o.canToggle || o.canToggle(r)) {
          const b = h('button', { type: 'button', class: 'rowaddb' + (sel ? ' on' : ''), title: sel ? 'Remove from the chart' : 'Add to the chart', 'aria-pressed': String(!!sel), text: sel ? '✓' : '+' });
          b.addEventListener('click', e => { e.stopPropagation(); o.onToggle(r); }); td.appendChild(b);
        }
        tr.appendChild(td);
      }
      cols.forEach(c => { const td = h('td', { class: c.cls || '' }); const v = c.render(r); append(td, v); tr.appendChild(td); });
      if (canOpen) {
        tr.addEventListener('click', e => { if (e.target.closest && e.target.closest('input,select,a')) return; act(r, tr); });
        tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(r, tr); } });
      }
      tbody.appendChild(tr);
    });
    if (!list.length) tbody.appendChild(h('tr', {}, h('td', { colspan: String(cols.length), class: 'empty l', text: o.empty || 'Nothing to show.' })));
    if (list.length > shown) more.appendChild(h('button', { type: 'button', text: 'Show ' + Math.min(page, list.length - shown) + ' more (' + (list.length - shown) + ' hidden)', onclick: () => { shown += page; body(); } }));
  }
  head(); body();
  return { el: wrap, set(r) { rows = r; shown = page; body(); }, refresh() { body(); }, get sort() { return [sortKey, sortDir]; }, setSort(k, d) { sortKey = k; sortDir = d; head(); body(); } };
};

/* ------------------------------------------------------------------ graph look (chosen in the Theme panel; every line chart reads it each time it draws) */
// a CSS colour (possibly var(--c1)) as a concrete rgb() string, for pictures drawn on a canvas
Kit.cssColor = function (c) {
  try { const el = document.createElement('span'); el.style.color = c; el.style.display = 'none'; document.body.appendChild(el); const v = getComputedStyle(el).color; el.remove(); return v || c; } catch (e) { return c; }
};
const GFX_PRESETS = {
  classic:      { style: 'auto', lineW: 2,   grid: 'h',    dots: 'last', size: 1 },
  minimal:      { style: 'line', lineW: 1.6, grid: 'none', dots: 'last', size: 0.95 },
  filled:       { style: 'area', lineW: 2,   grid: 'h',    dots: 'last', size: 1 },
  columns:      { style: 'bar',  lineW: 2,   grid: 'h',    dots: 'none', size: 1 },
  presentation: { style: 'auto', lineW: 3.5, grid: 'h',    dots: 'last', size: 1.25 },
  compact:      { style: 'line', lineW: 1.5, grid: 'hv',   dots: 'none', size: 0.78 },
  soft:         { style: 'area', lineW: 1.8, grid: 'none', dots: 'last', size: 1 },
  bold:         { style: 'line', lineW: 3.5, grid: 'hv',   dots: 'all',  size: 1 },
  blueprint:    { style: 'line', lineW: 1.5, grid: 'hv',   dots: 'all',  size: 1.1 },
};
Kit.look = { heat: 1 };                                      // how strongly the heat colours show (Theme panel)
// who the numbers come from, for the footer of an exported picture (pubs = publication codes)
Kit.sourceOf = function (pubs) {
  const live = new Set(window.Feeds && Feeds.catalog ? Feeds.catalog.pubs.map(p => p.code) : []), n = pubs.filter(p => live.has(p)).length;
  return n === 0 ? 'Statistics South Africa' : n === pubs.length ? 'South African Reserve Bank' : 'Statistics South Africa and the South African Reserve Bank';
};
Kit.gfx = {
  presets: GFX_PRESETS,
  cur: Object.assign({ preset: 'classic' }, GFX_PRESETS.classic),
  match() { const c = this.cur; return Object.keys(GFX_PRESETS).find(k => Object.keys(GFX_PRESETS[k]).every(f => GFX_PRESETS[k][f] === c[f])) || 'custom'; },
  save() { try { localStorage.setItem('eq-gfx', JSON.stringify(this.cur)); } catch (e) {} },
  set(patch) { Object.assign(this.cur, patch); this.cur.preset = this.match(); this.save(); document.dispatchEvent(new CustomEvent('themechange')); },
  usePreset(name) { if (!GFX_PRESETS[name]) return; Object.assign(this.cur, GFX_PRESETS[name], { preset: name }); this.save(); document.dispatchEvent(new CustomEvent('themechange')); },
};
try { const sv = JSON.parse(localStorage.getItem('eq-gfx') || 'null'); if (sv) { Object.assign(Kit.gfx.cur, sv); Kit.gfx.cur.preset = Kit.gfx.match(); } } catch (e) {}

/* ------------------------------------------------------------------ line chart */
// o: {series:[{key,name,full,color,xs,vs,ps,unit}], height, x0, x1, zero, ref, single, area, yTitle, label:'aria label'}
Kit.lineChart = function (host, o) {
  const frame = Kit.chartFrame(host, () => Kit.lineRows(o.series.filter(se => se.vs.some(v => v != null))), { title: o.title, sub: o.sub, source: o.source,
    legend: () => o.series.filter(se => se.vs.some(v => v != null)).map(se => ({ name: se.name + (se.axis === 'r' ? ' (right axis)' : ''), color: Kit.cssColor(se.color) })).concat(o.ribbon && o.ribbon.name ? [{ name: o.ribbon.name, color: Kit.cssColor(o.ribbon.color || 'var(--accent)') }] : []) });
  const box = frame.box;
  const tip = h('div', { class: 'tt', hidden: true, role: 'status' });
  const G0 = () => Kit.gfx.cur, sizeNow = () => Math.max(120, Math.round((o.height || 300) * (G0().size || 1)));
  let cx = null, W = 0, destroyed = false, geom = null, ro = null, curH = null;

  const live = o.series.filter(se => se.vs.some(v => v != null));
  const styNow = () => o.style || (!o.ribbon && !o.log && (G0().style === 'area' || G0().style === 'bar') ? G0().style : 'line');
  let STY = styNow();
  const STACK = o.style === 'stackbar' || o.style === 'stackarea', hasR = !STACK && live.some(se => se.axis === 'r');
  // stacked styles: cumulative layers on the union of x positions (positives stack up from zero, negatives down from zero)
  const stackX = STACK ? Array.from(new Set([].concat.apply([], live.map(se => se.xs.filter((x, i) => se.vs[i] != null))))).sort((a, b) => a - b) : [];
  const layers = STACK ? (() => {
    const pos = stackX.map(() => 0), neg = stackX.map(() => 0), ix = live.map(se => { const m = new Map(); se.xs.forEach((x, i) => { if (se.vs[i] != null) m.set(x, se.vs[i]); }); return m; });
    return live.map((se, k) => stackX.map((x, i) => { const v = ix[k].get(x) || 0, y0 = v >= 0 ? pos[i] : neg[i]; if (v >= 0) pos[i] += v; else neg[i] += v; return [y0, y0 + v, ix[k].has(x)]; }));
  })() : null;
  function logDomain(lo, hi) {                  // decades (and 2 / 5 inside them when the span is short) around the data
    lo = Math.max(lo, 1e-9); hi = Math.max(hi, lo * 1.0001);
    const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi)), ticks = [];
    for (let e = a; e <= b; e++) { [1, 2, 5].forEach(k => { const t = k * Math.pow(10, e); if (t >= Math.pow(10, a) && t <= Math.pow(10, b) && (b - a < 4 || k === 1)) ticks.push(t); }); }
    return { ticks, step: 0, lo: Math.pow(10, a), hi: Math.pow(10, b), log: true };
  }
  function domain(ax) {                         // ax: 'l' (default) or 'r'
    const set = live.filter(se => (se.axis === 'r') === (ax === 'r'));
    let lo = Infinity, hi = -Infinity;
    set.forEach(se => se.vs.forEach(v => { if (v != null && (!o.log || v > 0)) { if (v < lo) lo = v; if (v > hi) hi = v; } }));
    if (STACK) { layers.forEach(L => L.forEach(c => { lo = Math.min(lo, c[0], c[1]); hi = Math.max(hi, c[0], c[1]); })); lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    else if (STY === 'bar' || STY === 'area') { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (ax !== 'r' && o.ribbon) o.ribbon.lo.concat(o.ribbon.hi).forEach(v => { if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; } });
    if (!isFinite(lo)) { lo = o.log ? 1 : 0; hi = o.log ? 10 : 1; }
    if (o.log) return logDomain(lo, hi);
    if (o.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (ax !== 'r' && o.ref != null) { lo = Math.min(lo, o.ref); hi = Math.max(hi, o.ref); }
    const pad = (hi - lo) * 0.06 || 1;
    if (!(o.zero && lo === 0)) lo -= pad; if (!(o.zero && hi === 0)) hi += pad;
    return niceTicks(lo, hi, o.tickCount || 5);
  }
  const tickTxt = (t, nt) => nt.log ? fmt.num(t) : fmt.tick(t, nt.step);
  function draw() {
    if (destroyed) return;
    W = Math.max(240, box.clientWidth || host.clientWidth || 600);
    STY = styNow(); const areaOn = !!(o.area || STY === 'area') && !!o.single, GL = G0();
    const H = curH || sizeNow(), nt = domain('l'), ntR = hasR ? domain('r') : null;
    const labW = Math.max(...nt.ticks.map(t => tickTxt(t, nt).length)) * 6.6 + 10;
    const labWR = ntR ? Math.max(...ntR.ticks.map(t => tickTxt(t, ntR).length)) * 6.6 + 12 : 0;
    const m = { l: Math.max(34, labW), r: ntR ? Math.max(44, labWR) : (o.single && o.endLabel !== false ? 62 : 14), t: (o.yTitle || ntR) ? 18 : 8, b: 24 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const X = x => m.l + (x - o.x0) / (o.x1 - o.x0 || 1) * iw;
    const mk = n => n.log ? (v => m.t + (Math.log10(n.hi) - Math.log10(Math.min(n.hi, Math.max(v, n.lo)))) / ((Math.log10(n.hi) - Math.log10(n.lo)) || 1) * ih) : (v => m.t + (n.hi - v) / (n.hi - n.lo) * ih);
    const YL = mk(nt), YR = ntR ? mk(ntR) : YL, Y = (v, se) => se && se.axis === 'r' ? YR(v) : YL(v);
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', tabindex: '0', 'aria-label': o.label || 'Line chart' });
    // y grid + labels
    const g = s('g', { class: 'grid' }), ax = s('g', { class: 'ax' });
    nt.ticks.forEach(t => {
      if (GL.grid !== 'none') g.appendChild(s('line', { x1: m.l, x2: W - m.r, y1: Y(t).toFixed(1), y2: Y(t).toFixed(1) }));
      ax.appendChild(s('text', { x: m.l - 6, y: (Y(t) + 3.5).toFixed(1), 'text-anchor': 'end' }, tickTxt(t, nt)));
    });
    if (ntR) ntR.ticks.forEach(t => ax.appendChild(s('text', { x: W - m.r + 6, y: (YR(t) + 3.5).toFixed(1), 'text-anchor': 'start' }, tickTxt(t, ntR))));
    svg.appendChild(g);
    if (o.yTitle || ntR) svg.appendChild(s('text', { class: 'ytitle', x: m.l, y: 10 }, (o.yTitle || '') + (ntR ? (o.yTitle ? '  ' : '') + '(left axis)' : '')));
    if (ntR) svg.appendChild(s('text', { class: 'ytitle', x: W - m.r, y: 10, 'text-anchor': 'end' }, '(right axis)'));
    // x ticks
    const span = o.x1 - o.x0, yStep = span > 40 ? 10 : span > 20 ? 5 : span > 10 ? 2 : span > 3 ? 1 : 0;
    if (yStep) {
      for (let yr = Math.ceil(o.x0 / yStep) * yStep; yr <= o.x1 + 1e-9; yr += yStep) {
        const x = X(yr); if (x < m.l - 1 || x > W - m.r + 1) continue;
        if (GL.grid === 'hv') g.appendChild(s('line', { x1: x.toFixed(1), x2: x.toFixed(1), y1: m.t, y2: H - m.b }));
        ax.appendChild(s('text', { x: x.toFixed(1), y: H - 6, 'text-anchor': 'middle' }, String(yr)));
      }
    } else {   // short window: label every 3rd / 6th month
      const stepM = span > 1.5 ? 6 : 3;
      for (let k = Math.ceil(o.x0 * 12 / stepM) * stepM; k <= o.x1 * 12 + 1e-6; k += stepM) {
        const x = X(k / 12); if (x < m.l - 1 || x > W - m.r + 1) continue;
        if (GL.grid === 'hv') g.appendChild(s('line', { x1: x.toFixed(1), x2: x.toFixed(1), y1: m.t, y2: H - m.b }));
        ax.appendChild(s('text', { x: x.toFixed(1), y: H - 6, 'text-anchor': 'middle' }, MONTHS[k % 12] + ' ' + String(Math.floor(k / 12)).slice(2)));
      }
    }
    svg.appendChild(ax);
    // reference bands (e.g. an inflation target range), drawn behind everything else
    (o.bands || []).forEach(b => {
      const bx0 = Math.max(o.x0, b.x0), bx1 = Math.min(o.x1, b.x1); if (!(bx1 > bx0)) return;
      const by0 = Y(Math.min(nt.hi, b.hi)), by1 = Y(Math.max(nt.lo, b.lo)); if (!(by1 > by0)) return;
      svg.appendChild(s('rect', { x: X(bx0).toFixed(1), y: by0.toFixed(1), width: (X(bx1) - X(bx0)).toFixed(1), height: (by1 - by0).toFixed(1), fill: 'var(--accent)', 'fill-opacity': 0.09 }));
    });
    // zero / reference line
    const refv = o.ref != null ? o.ref : (o.zero ? 0 : null);
    if (refv != null && refv >= nt.lo && refv <= nt.hi)
      svg.appendChild(s('g', { class: 'zero' }, s('line', { x1: m.l, x2: W - m.r, y1: Y(refv).toFixed(1), y2: Y(refv).toFixed(1) })));
    // shaded range (e.g. lowest-to-highest province), behind the lines
    if (o.ribbon) {
      const R = o.ribbon; let up = '', dn = [], pen2 = false;
      R.xs.forEach((x, i) => { if (R.lo[i] == null || R.hi[i] == null) return; up += (pen2 ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(R.hi[i]).toFixed(1); dn.push('L' + X(x).toFixed(1) + ' ' + Y(R.lo[i]).toFixed(1)); pen2 = true; });
      if (pen2) svg.appendChild(s('path', { d: up + dn.reverse().join('') + 'Z', fill: R.color || 'var(--accent)', 'fill-opacity': 0.16, stroke: 'none' }));
    }
    // series
    const ends = [], baseV = Math.min(nt.hi, Math.max(nt.lo, 0));
    const stepX = (() => { let m = Infinity; const xs = STACK ? stackX : (live[0] ? live[0].xs : []); for (let i = 1; i < xs.length; i++) m = Math.min(m, xs[i] - xs[i - 1]); return isFinite(m) && m > 0 ? m : (o.x1 - o.x0) / 20; })();
    const groupW = Math.max(1, Math.min(60, stepX / ((o.x1 - o.x0) || 1) * iw * 0.78));
    if (STACK && STY === 'stackbar') {
      layers.forEach((L, k) => L.forEach((c, i) => { if (!c[2] || c[0] === c[1]) return; const y1 = Y(c[1]), y0 = Y(c[0]); svg.appendChild(s('rect', { x: (X(stackX[i]) - groupW / 2).toFixed(1), y: Math.min(y0, y1).toFixed(1), width: groupW.toFixed(1), height: Math.max(0.5, Math.abs(y0 - y1) - (groupW > 4 ? 0.6 : 0)).toFixed(1), fill: live[k].color })); }));
    } else if (STACK) {
      layers.forEach((L, k) => { let up = '', dn = ''; stackX.forEach((x, i) => { up += (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(L[i][1]).toFixed(1); }); for (let i = stackX.length - 1; i >= 0; i--) dn += 'L' + X(stackX[i]).toFixed(1) + ' ' + Y(L[i][0]).toFixed(1); svg.appendChild(s('path', { d: up + dn + 'Z', fill: live[k].color, 'fill-opacity': 0.8, stroke: 'var(--surface-1)', 'stroke-width': 0.6 })); });
    } else if (STY === 'bar') {
      const bw = Math.max(1, groupW / live.length);
      live.forEach((se, k) => se.xs.forEach((x, i) => { const v = se.vs[i]; if (v == null) return; const y = Y(v, se), yb = Y(baseV, se); svg.appendChild(s('rect', { x: (X(x) - groupW / 2 + k * bw).toFixed(1), y: Math.min(y, yb).toFixed(1), width: Math.max(0.8, bw - (bw > 4 ? 0.6 : 0)).toFixed(1), height: Math.max(0.5, Math.abs(y - yb)).toFixed(1), fill: se.color })); }));
    }
    if (STACK || STY === 'bar') { /* shapes already drawn */ } else
    live.forEach(se => {
      let d = '', a = '', pen = false, segStart = null, segLast = null, lastPt = null;
      se.xs.forEach((x, i) => {
        const v = se.vs[i];
        if (v == null) { if (areaOn && segStart != null) { a += 'L' + X(segLast).toFixed(1) + ' ' + Y(baseV).toFixed(1) + 'L' + X(segStart).toFixed(1) + ' ' + Y(baseV).toFixed(1) + 'Z'; segStart = null; } pen = false; return; }
        if (o.log && !(v > 0)) { pen = false; return; }
        const px = X(x).toFixed(1), py = Y(v, se).toFixed(1);
        d += (pen ? 'L' : 'M') + px + ' ' + py; pen = true;
        if (areaOn) { if (segStart == null) { segStart = x; a += 'M' + px + ' ' + py; } else a += 'L' + px + ' ' + py; segLast = x; }
        lastPt = [x, v];
      });
      if (areaOn && segStart != null) { const yb = Y(baseV).toFixed(1); a += 'L' + X(segLast).toFixed(1) + ' ' + yb + 'L' + X(segStart).toFixed(1) + ' ' + yb + 'Z'; }
      if (areaOn) svg.appendChild(s('path', { d: a, fill: se.color, 'fill-opacity': 0.1, stroke: 'none' }));
      if (STY === 'area' && !o.single) { let seg = '', first = null, prev = null; se.xs.forEach((x, i) => { const v = se.vs[i]; if (v == null) { if (first != null) { seg += 'L' + X(prev).toFixed(1) + ' ' + Y(baseV, se).toFixed(1) + 'L' + X(first).toFixed(1) + ' ' + Y(baseV, se).toFixed(1) + 'Z'; first = null; } return; } seg += (first == null ? 'M' : 'L') + X(x).toFixed(1) + ' ' + Y(v, se).toFixed(1); if (first == null) first = x; prev = x; }); if (first != null) seg += 'L' + X(prev).toFixed(1) + ' ' + Y(baseV, se).toFixed(1) + 'L' + X(first).toFixed(1) + ' ' + Y(baseV, se).toFixed(1) + 'Z'; svg.appendChild(s('path', { d: seg, fill: se.color, 'fill-opacity': 0.14, stroke: 'none' })); }
      if (STY === 'scatter') se.xs.forEach((x, i) => { const v = se.vs[i]; if (v == null || (o.log && !(v > 0))) return; svg.appendChild(s('circle', { cx: X(x).toFixed(1), cy: Y(v, se).toFixed(1), r: 2.4, fill: se.color, 'fill-opacity': 0.85 })); });
      else svg.appendChild(s('path', { d, fill: 'none', stroke: se.color, 'stroke-width': se.width || GL.lineW || 2, 'stroke-dasharray': se.dash ? '6 4' : null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      if (GL.dots === 'all' && STY !== 'scatter' && se.xs.length <= 160) se.xs.forEach((x, i) => { const v = se.vs[i]; if (v == null || (o.log && !(v > 0))) return; svg.appendChild(s('circle', { cx: X(x).toFixed(1), cy: Y(v, se).toFixed(1), r: 2.3, fill: se.color, stroke: 'var(--surface-1)', 'stroke-width': 1 })); });
      if (lastPt) ends.push([se, lastPt]);
    });
    ends.forEach(([se, p]) => {
      if (GL.dots !== 'none') svg.appendChild(s('circle', { cx: X(p[0]).toFixed(1), cy: Y(p[1], se).toFixed(1), r: 4, fill: se.color, stroke: 'var(--surface-1)', 'stroke-width': 2 }));
      if (o.single && o.endLabel !== false && !ntR) svg.appendChild(s('text', { class: 'endlab', x: (X(p[0]) + 8).toFixed(1), y: (Y(p[1], se) + 4).toFixed(1) }, fmt.fixed(p[1], nt.step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(nt.step)) + 0))));
    });
    // hover layer
    const xh = s('line', { class: 'xhair', y1: m.t, y2: H - m.b, visibility: 'hidden' });
    const dots = s('g');
    svg.appendChild(xh); svg.appendChild(dots);
    const overlay = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', style: 'cursor:crosshair' });
    svg.appendChild(overlay);
    clear(box); box.appendChild(svg); box.appendChild(tip); frame.svg = svg;
    geom = { m, iw, ih, X, Y, xh, dots, W, H };

    function nearestIdx(xs, x) {         // binary search for nearest x in sorted xs
      let lo = 0, hi = xs.length - 1; if (hi < 0) return -1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid; else hi = mid; }
      return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi;
    }
    function showAt(xv) {
      // snap to the nearest data x across all series
      let best = null, bd = Infinity;
      live.forEach(se => { const i = nearestIdx(se.xs, xv); if (i >= 0) { const dd = Math.abs(se.xs[i] - xv); if (dd < bd) { bd = dd; best = se.xs[i]; } } });
      if (best == null) return;
      cx = best;
      xh.setAttribute('x1', X(best)); xh.setAttribute('x2', X(best)); xh.setAttribute('visibility', 'visible');
      clear(dots); clear(tip); tip.hidden = false;
      const rows = []; let when = null;
      live.forEach(se => {
        const i = nearestIdx(se.xs, best); if (i < 0) return;
        const step = se.xs.length > 1 ? (se.xs[se.xs.length - 1] - se.xs[0]) / (se.xs.length - 1) : 1;
        if (Math.abs(se.xs[i] - best) > Math.max(step * 0.6, 0.04)) return;
        const v = se.vs[i]; if (v == null) return;
        if (!when) when = se.ps[i];
        dots.appendChild(s('circle', { cx: X(se.xs[i]).toFixed(1), cy: Y(v, se).toFixed(1), r: 4, fill: se.color, stroke: 'var(--surface-1)', 'stroke-width': 2 }));
        rows.push({ se, v, p: se.ps[i] });
      });
      tip.appendChild(h('div', { class: 'when', text: rows.length > 1 && new Set(rows.map(r => r.p)).size > 1 ? rows.map(r => fmt.period(r.p)).filter((v, i, a) => a.indexOf(v) === i).join(' / ') : fmt.period(when) }));
      rows.forEach(r => tip.appendChild(h('div', { class: 'r' }, h('span', { class: 'k', style: 'background:' + r.se.color }),
        h('span', { class: 'v', text: o.valFmt ? o.valFmt(r.v, r.se) : fmt.num(r.v) + (o.valSuffix || '') }), o.single ? null : h('span', { class: 'n', text: r.se.name + (r.se.axis === 'r' ? ' (right axis)' : '') }))));
      // position: right of crosshair unless it would overflow
      const tw = tip.offsetWidth, th = tip.offsetHeight, px = X(best);
      let left = px + 14; if (left + tw > W) left = px - tw - 14; if (left < 0) left = 4;
      const ys = rows.map(r => Y(r.v, r.se)); let top = (ys.length ? Math.min(...ys) : m.t) - th / 2; top = Math.max(0, Math.min(H - th - 4, top));
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    }
    function hide() { xh.setAttribute('visibility', 'hidden'); clear(dots); tip.hidden = true; cx = null; }
    function xFromEvent(e) { const r = overlay.getBoundingClientRect(); const px = (e.clientX - r.left) / (r.width || 1); return o.x0 + px * (o.x1 - o.x0); }
    overlay.addEventListener('pointermove', e => showAt(xFromEvent(e)));
    overlay.addEventListener('pointerdown', e => showAt(xFromEvent(e)));
    overlay.addEventListener('pointerleave', hide);
    svg.addEventListener('keydown', e => {
      if (e.key === 'Escape') { hide(); return; }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const all = Array.from(new Set([].concat(...live.map(se => se.xs.filter((x, i) => se.vs[i] != null))))).sort((a, b) => a - b);
      if (!all.length) return;
      let k = cx == null ? all.length - 1 : nearestIdx(all, cx);
      k = Math.max(0, Math.min(all.length - 1, k + (e.key === 'ArrowLeft' ? -1 : 1)));
      showAt(all[k]);
    });
    svg.addEventListener('blur', hide);
  }
  draw();
  if (typeof ResizeObserver !== 'undefined') { let last = 0; ro = new ResizeObserver(() => { const w = box.clientWidth; if (Math.abs(w - last) > 2) { last = w; draw(); } }); ro.observe(box); }
  const api = { destroy() { destroyed = true; if (ro) ro.disconnect(); frame.remove(); }, redraw: draw, getHeight: () => curH || sizeNow(), setHeight(hh) { curH = Math.max(160, Math.round(hh)); draw(); } };
  box.__chart = api;
  return api;
};


/* ------------------------------------------------------------------ derived series */
// Build a store-compatible item from a full-length array aligned to a publication's periods.
// src supplies pub/freq/periods; vals is an array of numbers|null, one per period.
Store.derive = function (src, key, name, vals, extra) {
  let a = 0, b = vals.length - 1;
  while (a <= b && vals[a] == null) a++;
  while (b >= a && vals[b] == null) b--;
  if (a > b) return null;
  const v = vals.slice(a, b + 1), cur = v[v.length - 1];
  return Object.assign({ key, pub: src.pub, pubShort: src.pubShort, freq: src.freq, tab: src.tab, id: key, label: name, name, measure: '', sub: '', geo: '',
    price: '', adj: 'nsa', unit: src.unit, base: '', periods: src.periods, s: a, v, n: v.length, firstP: src.periods[a], lastP: src.periods[b],
    last: cur, yoy: null, yoyKind: '%', derived: true }, extra || {});
};
// full-length array for an item (null where the series has no value)
Store.full = function (it) {
  const out = new Array(it.periods.length).fill(null);
  for (let i = 0; i < it.v.length; i++) out[it.s + i] = it.v[i];
  return out;
};
Store.rolling = function (arr, n, how) {          // trailing window, null unless the full window is present
  const out = new Array(arr.length).fill(null);
  for (let i = n - 1; i < arr.length; i++) {
    let sum = 0, ok = true;
    for (let j = i - n + 1; j <= i; j++) { if (arr[j] == null) { ok = false; break; } sum += arr[j]; }
    if (ok) out[i] = how === 'mean' ? sum / n : sum;
  }
  return out;
};

/* ------------------------------------------------------------------ release schedule */
Kit.sched = {
  next(code) {
    const sch = (window.EQ.manifest && window.EQ.manifest.schedule) || [];
    const today = new Date().toISOString().slice(0, 10);
    const sp = Store.pub(code); const sc = (sp && sp.sched) || code;       // e.g. CPI average prices are released with the CPI
    return sch.filter(r => r.code === sc && r.date >= today).sort((a, b) => a.date < b.date ? -1 : 1)[0] || null;
  },
  dateText(d) { const p = d.split('-'); return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; },
};

/* ------------------------------------------------------------------ coverage tracker */
// Tabs register every series they draw on; each tab footer (and later the Data tab) reports what is unused.
Kit.coverage = {
  used: {},
  use(tab, key) { (this.used[tab] = this.used[tab] || new Set()).add(key); },
  report(tab, pub) {
    const all = Store.all.filter(it => it.pub === pub), used = this.used[tab] || new Set();
    return { total: all.length, used: all.filter(it => used.has(it.key)).length, unused: all.filter(it => !used.has(it.key)) };
  },
};

/* ------------------------------------------------------------------ toggle chips */
// opts: [{v,label,disabled,title}]; selected: ordered array; colorOf(v) -> css colour | null
Kit.chips = function (opts, selected, colorOf, onToggle) {
  const big = opts.length > 8, root = h('div', { class: 'chips', role: 'group' }), byV = new Map(opts.map(o => [o.v, o]));
  function paint() {
    clear(root);
    (big ? selected.map(v => byV.get(v)).filter(Boolean) : opts).forEach(o => {
      const on = selected.indexOf(o.v) >= 0, col = on && colorOf ? colorOf(o.v) : null;
      const b = h('button', { type: 'button', class: 'chipb' + (on ? ' on' : ''), 'aria-pressed': String(on), disabled: o.disabled || null, title: big ? 'Remove from the chart' : (o.title || null),
        onclick: () => onToggle(o.v) });
      if (col) b.appendChild(h('span', { class: 'sw', style: 'background:' + col }));
      b.appendChild(document.createTextNode(o.label + (big ? ' ×' : '')));
      root.appendChild(b);
    });
  }
  paint();
  if (!big) { root.set = sel => { selected = sel; paint(); }; return root; }
  const search = Kit.addSearch({ placeholder: 'Add… type to search', candidates: () => opts.filter(o => !o.disabled).map(o => ({ key: o.v, label: o.label })), selected: () => selected, onAdd: k => onToggle(k) });
  const box = h('div', { class: 'chipsearch' }, root, search);
  box.set = sel => { selected = sel; paint(); };
  return box;
};

/* ------------------------------------------------------------------ horizontal diverging bars */
// o: {rows:[{label, value, tip:[[strong, secondary]...], emph}], fmtVal(v), rowH, ariaLabel}
// Bars grow from a single zero baseline; 4px rounded data-end, square at the baseline; <= 20px thick.
Kit.hbar = function (host, o) {
  const frame = Kit.chartFrame(host, () => [['Item', o.valueLabel || 'Value']].concat(o.rows.map(r => [r.label, r.value])), { title: o.title, source: o.source,
    legend: () => {                                                  // bars are coloured by direction; a total bar is grey
      const vs = o.rows.filter(r => !r.emph && r.value != null), neg = vs.some(r => r.value < 0), pos = vs.some(r => r.value >= 0), L = [];
      if (pos) L.push({ name: neg ? 'Positive' : (o.valueLabel || o.title || 'Value'), color: Kit.cssColor('var(--up)') });
      if (neg) L.push({ name: 'Negative', color: Kit.cssColor('var(--down)') });
      if (o.rows.some(r => r.emph)) L.push({ name: 'Total', color: Kit.cssColor('var(--ink-2)') });
      return L;
    } });
  const box = frame.box;
  const tip = h('div', { class: 'tt', hidden: true });
  let ro = null, destroyed = false, rhCur = o.rowH || 30;
  function barPath(x0, x1, y, hgt, r) {
    const dir = x1 >= x0 ? 1 : -1, len = Math.abs(x1 - x0);
    if (len < 0.5) return '';
    r = Math.min(r, len, hgt / 2);
    return 'M' + x0 + ' ' + y + 'L' + (x1 - dir * r) + ' ' + y + 'Q' + x1 + ' ' + y + ' ' + x1 + ' ' + (y + r) + 'L' + x1 + ' ' + (y + hgt - r) +
      'Q' + x1 + ' ' + (y + hgt) + ' ' + (x1 - dir * r) + ' ' + (y + hgt) + 'L' + x0 + ' ' + (y + hgt) + 'Z';
  }
  function draw() {
    if (destroyed) return;
    const rows = o.rows, rh = rhCur, top = 6, bottom = 24;
    const W = Math.max(280, box.clientWidth || host.clientWidth || 520);
    const lab = Math.min(Math.max(120, W * 0.40), Math.max(80, Math.max.apply(null, rows.map(r => r.label.length)) * 6.4 + 10));
    const maxCh = Math.max(8, Math.floor((lab - 10) / 6.4));                       // labels longer than the column are cut with an ellipsis (full text in the tooltip)
    const shortL = t => t.length > maxCh ? t.slice(0, maxCh - 1).trimEnd() + '…' : t;
    const vals = rows.map(r => r.value).filter(v => v != null);
    let lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
    const pad = (hi - lo) * 0.2 || 1; if (lo < 0) lo -= pad; if (hi > 0) hi += pad;
    const nt = niceTicks(lo, hi, 5);
    const m = { l: lab + 10, r: 10 }, iw = W - m.l - m.r, H = top + rows.length * rh + bottom;
    const X = v => m.l + (v - nt.lo) / (nt.hi - nt.lo) * iw, x0 = X(0);
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'list', 'aria-label': o.ariaLabel || 'Bar chart' });
    const g = s('g', { class: 'grid' }), ax = s('g', { class: 'ax' });
    nt.ticks.forEach(t => {
      g.appendChild(s('line', { x1: X(t).toFixed(1), x2: X(t).toFixed(1), y1: top, y2: H - bottom }));
      ax.appendChild(s('text', { x: X(t).toFixed(1), y: H - 8, 'text-anchor': 'middle' }, fmt.tick(t, nt.step)));
    });
    svg.appendChild(g); svg.appendChild(ax);
    svg.appendChild(s('g', { class: 'zero' }, s('line', { x1: x0.toFixed(1), x2: x0.toFixed(1), y1: top, y2: H - bottom })));
    rows.forEach((r, i) => {
      const y = top + i * rh, bh = Math.min(20, rh - 10), by = y + (rh - bh) / 2;
      const grp = s('g', { role: 'listitem', tabindex: '0', 'aria-label': r.label + ': ' + (r.value == null ? 'not available' : (o.fmtVal ? o.fmtVal(r.value) : fmt.num(r.value))) });
      const lt = s('text', { x: m.l - 8, y: (y + rh / 2 + 4).toFixed(1), 'text-anchor': 'end', fill: 'var(--ink)', style: 'font-size:12.5px;' + (r.emph ? 'font-weight:650' : '') }, shortL(r.label));
      lt.appendChild(s('title', {}, r.label)); grp.appendChild(lt);
      if (r.value != null) {
        const xv = X(r.value), color = r.emph ? 'var(--ink-2)' : (r.value >= 0 ? 'var(--up)' : 'var(--down)');
        const d = barPath(x0, xv, by, bh, 4);
        if (d) grp.appendChild(s('path', { d, fill: color }));
        const txt = o.fmtVal ? o.fmtVal(r.value) : fmt.num(r.value);
        grp.appendChild(s('text', { x: (r.value >= 0 ? xv + 6 : xv - 6).toFixed(1), y: (y + rh / 2 + 4).toFixed(1), 'text-anchor': r.value >= 0 ? 'start' : 'end', style: 'font-size:12px;font-weight:600;fill:var(--ink)' }, txt));
      } else {
        grp.appendChild(s('text', { x: x0 + 6, y: (y + rh / 2 + 4).toFixed(1), style: 'font-size:12px;fill:var(--muted)' }, 'n/a'));
      }
      const hit = s('rect', { x: 0, y: y, width: W, height: rh, fill: 'transparent' });
      grp.appendChild(hit);
      function showTip(cx) {
        clear(tip); tip.hidden = false;
        tip.appendChild(h('div', { class: 'when', text: r.label }));
        (r.tip || []).forEach(t => tip.appendChild(h('div', { class: 'r' }, h('span', { class: 'v', text: t[0] }), h('span', { class: 'n', text: t[1] || '' }))));
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        const left = Math.min(W - tw - 4, Math.max(4, cx + 14)), tp = Math.max(0, Math.min(H - th - 2, y + rh / 2 - th / 2));
        tip.style.left = left + 'px'; tip.style.top = tp + 'px';
      }
      hit.addEventListener('pointermove', e => { const b = box.getBoundingClientRect(); showTip(e.clientX - b.left); });
      hit.addEventListener('pointerleave', () => { tip.hidden = true; });
      grp.addEventListener('focus', () => showTip(r.value == null ? x0 : X(r.value)));
      grp.addEventListener('blur', () => { tip.hidden = true; });
      svg.appendChild(grp);
      if (r.emph) svg.appendChild(s('line', { x1: 0, x2: W, y1: y + rh, y2: y + rh, stroke: 'var(--grid)' }));
    });
    clear(box); box.appendChild(svg); box.appendChild(tip); frame.svg = svg;
  }
  draw();
  if (typeof ResizeObserver !== 'undefined') { let last = 0; ro = new ResizeObserver(() => { const w = box.clientWidth; if (Math.abs(w - last) > 2) { last = w; draw(); } }); ro.observe(box); }
  const api = { destroy() { destroyed = true; if (ro) ro.disconnect(); frame.remove(); }, redraw: draw };
  api.getHeight = () => 30 + o.rows.length * rhCur; api.setHeight = hh => { rhCur = Math.max(o.rowH || 30, Math.min(46, Math.floor((hh - 30) / Math.max(1, o.rows.length)))); draw(); }; box.__chart = api;
  return api;
};

/* ------------------------------------------------------------------ tiny URL-hash state per tab */
Kit.hashState = {
  read(tab) { const m = new RegExp('^#/' + tab + '\\?(.*)$').exec(location.hash); return new URLSearchParams(m ? m[1] : ''); },
  write(tab, obj) {
    const p = new URLSearchParams(); Object.keys(obj).forEach(k => { if (obj[k] != null && obj[k] !== '') p.set(k, obj[k]); });
    const q = p.toString(); try { history.replaceState(null, '', '#/' + tab + (q ? '?' + q : '')); } catch (e) { /* file:// quirks */ }
  },
};


/* ================================================================== shared helpers for sector tabs */
Store.pub = code => Store.pubs.find(p => p.code === code);
Store.pct = (a, b) => (a == null || b == null || b === 0) ? null : (a - b) / Math.abs(b) * 100;
// sum of n values ending `from` periods before the latest; null if the window is incomplete
Store.sumLast = function (it, from, n) {
  if (!it) return null; const L = it.v.length; let sum = 0;
  for (let i = L - 1 - from - n + 1; i <= L - 1 - from; i++) { if (i < 0 || it.v[i] == null) return null; sum += it.v[i]; }
  return sum;
};
// Headline moves. `actual` (not seasonally adjusted) drives y/y; `sa` (if any) drives m/m and 3m/3m.
Store.metrics = function (actual, sa) {
  const base = sa || actual; if (!base) return {};
  const L = time.lag((actual || base).freq), a = actual || base, n = base.v.length, na = a.v.length;
  const isPct = base.unit === 'Percentage';
  const diff = (x, y) => (x == null || y == null) ? null : x - y;
  const m = { last: base.last, lastP: base.lastP, sa: !!sa, isPct, spark: base.v.slice(-60) };
  const prev = n > 1 ? base.v[n - 2] : null;
  m.mm = sa ? (isPct ? diff(sa.last, prev) : Store.pct(sa.last, prev)) : null;
  if (sa) { const a3 = Store.sumLast(sa, 0, 3), b3 = Store.sumLast(sa, 3, 3); m.m3 = (a3 == null || b3 == null) ? null : (isPct ? (a3 - b3) / 3 : Store.pct(a3, b3)); }
  const yj = Store.agoIdx(a.pub, a.s, na - 1, L), ya = yj >= 0 ? a.v[yj] : null;
  m.yoy = isPct ? diff(a.last, ya) : Store.pct(a.last, ya);
  m.yearAgo = ya;
  return m;
};
Store.avg = (arr) => { const v = arr.filter(x => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };

// lookup(tab, pub): series access that (a) ignores discontinued series (they stop before the latest period)
// and (b) records every series a tab draws on, for the coverage report.
Kit.lookup = function (tab, pubCode, opts) {
  const last = Store.pub(pubCode).last, incl = !!(opts && opts.includeDiscontinued);
  const items = Store.all.filter(it => it.pub === pubCode && (incl || it.lastP === last));
  const mark = it => { if (it) Kit.coverage.use(tab, it.key); return it; };
  const match = (it, c) => {
    for (const k in c) {
      const w = c[k], v = it[k];
      if (w instanceof RegExp ? !w.test(v) : Array.isArray(w) ? w.indexOf(v) < 0 : v !== w) return false;
    }
    return true;
  };
  return {
    pub: pubCode, last, items,
    byId(id) { const it = Store.byKey.get(pubCode + ':' + id); return mark(it && (incl || it.lastP === last) ? it : null); },
    find(c) { return mark(items.find(it => match(it, c)) || null); },
    all(c) { const r = c ? items.filter(it => match(it, c)) : items.slice(); r.forEach(mark); return r; },
    markAll() { items.forEach(mark); },
  };
};

fmt.bn = function (millions, d) {
  if (millions == null) return '–';
  return Math.abs(millions) >= 1e6 ? 'R ' + fmt.fixed(millions / 1e6, 2) + ' tn' : 'R ' + fmt.fixed(millions / 1000, d == null ? 1 : d) + ' bn';
};
fmt.rands = function (thousands, d) {        // input in R'000
  if (thousands == null) return '–';
  const bn = thousands / 1e6;
  if (Math.abs(bn) >= 1000) return 'R ' + fmt.fixed(bn / 1000, 2) + ' tn';
  return Math.abs(bn) >= 1 ? 'R ' + fmt.fixed(bn, d == null ? 1 : d) + ' bn' : 'R ' + fmt.fixed(thousands / 1000, 0) + ' m';
};
fmt.sg = (v, d, suf) => v == null ? '–' : fmt.signed(v, d == null ? 1 : d, suf == null ? '%' : suf);

/* ------------------------------------------------------------------ card header + legend */
Kit.cardHead = function (title, sub, tools) {
  return h('div', {}, h('div', { class: 'card-head' }, h('h3', { text: title }), tools ? h('div', { class: 'tools' }, tools) : null), sub ? h('div', { class: 'sub', text: sub }) : null);
};
Kit.legend = function (items) {
  return h('div', { class: 'legend' }, items.map(it => h('span', { class: 'it' }, h('span', { class: 'key', style: 'background:' + it.color }), h('span', { class: 'nm', title: it.name, text: it.name }))));
};

/* ------------------------------------------------------------------ range control (3Y..All or a start year) */
// st: {range:'10', fromYear:''}; X: the publication's x array (for the data span); returns {el, xr()}
Kit.rangeCtl = function (st, onChange, opts) {
  opts = opts || {};
  const seg = Kit.segmented((opts.presets || [{ v: '3', label: '3Y' }, { v: '5', label: '5Y' }, { v: '10', label: '10Y' }, { v: '25', label: '25Y' }, { v: 'all', label: 'All' }]), st.fromYear ? '' : st.range,
    v => { st.range = v; st.fromYear = ''; inp.value = ''; onChange(); });
  const inp = h('input', { type: 'number', min: '1950', max: '2100', placeholder: 'from year', style: 'width:92px', 'aria-label': 'Start year', value: st.fromYear });
  inp.addEventListener('change', () => { st.fromYear = inp.value; seg.setValue(st.fromYear ? '' : st.range); onChange(); });
  return {
    el: h('span', { style: 'display:inline-flex;gap:6px;align-items:center' }, seg, inp),
    xr(X0, X1) {
      if (st.fromYear && +st.fromYear > 1900) return [Math.max(X0, +st.fromYear), X1];
      return [st.range === 'all' ? X0 : Math.max(X0, X1 - (+st.range)), X1];
    },
  };
};

/* ------------------------------------------------------------------ ready-made multi-line panel */
// o: {entries:[{key,name,color,it}], tf, x0, x1, height, unit, area, notes:[text], emptyText}
Kit.linePanel = function (host, o) {
  const entries = o.entries.filter(e => e.it);
  if (!entries.length) { host.appendChild(h('div', { class: 'empty', text: o.emptyText || 'Nothing to plot for this selection.' })); return { destroy() {}, redraw() {} }; }
  (o.notes || []).forEach(t => host.appendChild(h('div', { class: 'note', text: t })));
  const wrap = h('div', { class: 'lp' }); host.appendChild(wrap);
  const baseTf = o.tf || 'level', S = { tf: baseTf, axis: {}, log: false };
  const first = it => Store.pubX[it.pub][it.s], last = it => Store.pubX[it.pub][it.s + it.n - 1];
  const X0 = Math.min.apply(null, entries.map(e => first(e.it))), X1 = Math.max.apply(null, entries.map(e => last(e.it)));
  Kit.noteFresh(host, X1, entries.every(e => e.it.freq === 'A'));
  const span0 = o.x1 - o.x0, hit = [3, 5, 10, 25].find(y => Math.abs(span0 - y) < 0.6);
  const st = { range: o.x0 <= X0 + 0.01 ? 'all' : hit ? String(hit) : '10', fromYear: o.x0 > X0 + 0.01 && !hit ? String(Math.round(o.x0)) : '' };
  const rc = Kit.rangeCtl(st, () => drawChart());
  const viewOpts = [{ v: 'level', label: 'Level' }];
  const pctUnits = entries.some(e => e.it.unit === 'Percentage');
  if (!pctUnits) viewOpts.push({ v: 'yoy', label: '% y/y' });
  if (!pctUnits || entries.length > 1) viewOpts.push({ v: 'rebase', label: 'Rebased' });
  if (!viewOpts.some(v => v.v === baseTf)) viewOpts.push({ v: baseTf, label: (Kit.TF[baseTf] || {}).label || baseTf });
  const viewSeg = viewOpts.length > 1 && o.tfSwitch !== false ? Kit.segmented(viewOpts, S.tf, v => { S.tf = v; drawLegend(); drawChart(); }) : null;
  const logBox = h('label', { class: 'lpchk', title: 'Logarithmic vertical scale (equal percentage moves look equal)' }, h('input', { type: 'checkbox' }), ' Log');
  logBox.firstChild.addEventListener('change', () => { S.log = logBox.firstChild.checked; drawChart(); });
  const bar = h('div', { class: 'lpbar' }, viewSeg, logBox, h('span', { class: 'grow' }), h('span', { class: 'lprange', title: 'Range for this chart' }, rc.el));
  const legendHost = h('div', { class: 'lplegend' }), unitEl = h('div', { class: 'sub', style: 'margin:4px 0 0' }), chartHost = h('div');
  wrap.appendChild(bar); wrap.appendChild(legendHost); wrap.appendChild(unitEl); wrap.appendChild(chartHost);
  let chart = null;
  const med = e => { const v = Store.view(e.it, 'level', X0, X1).vs.filter(x => x != null).map(Math.abs).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 0; };
  function drawLegend() {
    clear(legendHost);
    logBox.style.display = S.tf === 'level' || S.tf === 'rebase' ? '' : 'none';
    if (entries.length < 2) return;
    const canAxis = true;                                                // the left / right axis switch is offered in every view
    entries.forEach(e => {
      const right = S.axis[e.key] === 'r';
      const item = h('span', { class: 'lpleg' }, h('i', { class: 'sw', style: 'background:' + e.color }), h('span', { class: 'nm', text: e.name }));
      if (canAxis) { const b = h('button', { type: 'button', class: 'axtag' + (right ? ' on' : ''), title: right ? 'On the right axis. Click to move to the left axis' : 'On the left axis. Click to move to a separate right axis', text: right ? 'R' : 'L' });
        b.addEventListener('click', () => { if (right) delete S.axis[e.key]; else S.axis[e.key] = 'r'; drawLegend(); drawChart(); }); item.appendChild(b); }
      legendHost.appendChild(item);
    });
    if (canAxis && S.tf === 'level') {
      const split = h('button', { type: 'button', class: 'minibtn', text: Object.keys(S.axis).length ? 'One shared axis' : 'Split axes by size', title: 'Series of very different size are hard to compare on one axis' });
      split.addEventListener('click', () => {
        if (Object.keys(S.axis).length) S.axis = {};
        else { const m0 = med(entries[0]) || 1; entries.forEach(e => { const m = med(e); if (m0 > 0 && m > 0 && (m / m0 > 8 || m0 / m > 8)) S.axis[e.key] = 'r'; }); if (!Object.keys(S.axis).length) { const e = entries[entries.length - 1]; S.axis[e.key] = 'r'; } }
        drawLegend(); drawChart();
      });
      legendHost.appendChild(split);
    }
  }
  function drawChart() {
    if (chart) chart.destroy(); clear(chartHost);
    const [x0, x1] = rc.xr(X0, X1), tf = S.tf, sameTf = tf === baseTf;
    const pctMode = tf === 'pct' || tf === 'yoy', useR = Object.keys(S.axis).length > 0;
    const series = entries.map(e => { const v = Store.view(e.it, tf, x0, x1); return { key: e.key, name: e.name, color: e.color, xs: v.xs, vs: v.vs, ps: v.ps, axis: useR && S.axis[e.key] === 'r' ? 'r' : 'l' }; });
    unitEl.textContent = (sameTf && o.unit) || Store.unitLabel(entries[0].it, tf);
    chart = Kit.lineChart(chartHost, { series, height: o.height || 280, x0, x1, zero: pctMode || tf === 'ydiff', ref: tf === 'rebase' ? 100 : (sameTf && o.ref != null ? o.ref : null), log: S.log && (tf === 'level' || tf === 'rebase'),
      single: series.length === 1, area: o.area != null ? o.area : series.length === 1, label: o.label || ('Chart of ' + entries.map(e => e.name).join(', ')), title: o.title, source: Kit.sourceOf(entries.map(e => e.it.pub)),
      valFmt: sameTf && o.valFmt ? o.valFmt : (v => pctMode ? fmt.signed(v, 2, '%') : tf === 'rebase' ? fmt.fixed(v, 1) : fmt.num(v)), tickCount: o.tickCount, bands: sameTf ? o.bands : null });
  }
  drawLegend(); drawChart();
  setTimeout(() => {         // the card may already carry its own Level / y/y / Rebased switch; then ours would only duplicate it
    const card = wrap.closest('.card'); if (!card || !viewSeg) return;
    if (Array.from(card.querySelectorAll('.seg')).some(sg => !wrap.contains(sg) && /Level|y\/y|Rebase|year ago|Change/i.test(sg.textContent))) viewSeg.style.display = 'none';
  }, 0);
  return { destroy() { if (chart) chart.destroy(); wrap.remove(); }, redraw() { if (chart) chart.redraw(); } };
};

/* ------------------------------------------------------------------ fresh data first
   Charts that are updated often (monthly / quarterly, with data from 2025 on) belong at the top of a tab; annual series and anything whose last
   observation is 2024 or older go below them, and the "all series" browsers come last. Components tag the card they draw into with
   data-lastx (decimal year of the last observation) and data-annual; cards that show a single year in their heading (maps, bar charts) are judged by that year. */
Kit.noteFresh = function (host, lastx, annual) {
  try { if (host && host.dataset && isFinite(lastx)) { host.dataset.lastx = String(lastx); host.dataset.annual = annual ? '1' : '0'; } } catch (e) { /* detached or odd host: no tag, the card stays where it is */ }
};
Kit.freshOrder = function (body) {
  const STALE_BEFORE = 2025;
  const headYear = card => { const t = (card.querySelector('h3') || {}).textContent || '', m = t.match(/\b(19|20)\d\d\b/g); return m ? +m[m.length - 1] : null; };
  // true = old or annual, false = fresh, null = cannot tell (a bar chart or map with no year older than 2025 in its heading)
  const cardStale = card => {
    const tags = (card.dataset && card.dataset.lastx ? [card] : []).concat(Array.from(card.querySelectorAll('[data-lastx]')));
    if (tags.length) return tags.every(e => e.dataset.annual === '1' || +e.dataset.lastx < STALE_BEFORE);
    const y = headYear(card); return y != null && y < STALE_BEFORE ? true : null;
  };
  const rankOf = el => {
    if (el.dataset && el.dataset.kind === 'browser' || el.querySelector('[data-kind="browser"]')) return 2;
    const t0 = el.querySelector('h3'); if (el.classList.contains('foot') || (t0 && t0.textContent.trim() === 'Data timing')) return 1.5;           // notes about the data sit just above the browsers
    const cards = el.classList.contains('card') ? [el] : Array.from(el.querySelectorAll('.card'));
    const known = (cards.length ? cards : [el]).map(cardStale).filter(v => v !== null);
    return known.length && known.every(Boolean) ? 1 : 0;                  // old only when every card that can be judged is old
  };
  const tagged = el => (el.dataset && el.dataset.lastx) || el.querySelector('[data-lastx],[data-kind="browser"]') || (el.classList.contains('card') && headYear(el) != null);
  let timer = null;
  function apply() {
    const kids = Array.from(body.children); let last = -1;
    kids.forEach((k, i) => { if (tagged(k)) last = i; });
    if (last < 0) return;
    const head = kids.slice(0, last + 1).map((k, i) => ({ k, i, r: rankOf(k) })).sort((a, b) => a.r - b.r || a.i - b.i);
    if (head.every((x, i) => x.k === kids[i])) return;
    const tail = kids[last + 1] || null;
    head.forEach(x => body.insertBefore(x.k, tail));
  }
  const mo = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(apply, 60); });
  mo.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-lastx', 'data-kind'] });
  return mo;
};

/* ------------------------------------------------------------------ heat colour (diverging, neutral midpoint) */
// v: signed value; scale: |v| at which the colour is at full strength (capped so ink text stays readable)
Kit.heat = function (v, scale) {
  if (v == null || !isFinite(v)) return 'transparent';
  const t = Math.min(1, Math.abs(v) / (scale || 10) * (Kit.look.heat || 1)), pctMix = Math.round(t * 46);
  return 'color-mix(in srgb, ' + (v >= 0 ? 'var(--up)' : 'var(--down)') + ' ' + pctMix + '%, var(--surface-1))';
};

/* ------------------------------------------------------------------ contribution rows for Kit.hbar */
// parts: [{label, cur, prev, w?, extra?}] -> additive (w omitted) or weighted contribution to the total's % change, in pp
Kit.contribRows = function (o) {
  const rows = []; let sum = 0;
  o.parts.forEach(p => {
    if (p.cur == null || p.prev == null || !o.totalPrev) return;
    const c = (p.w != null ? p.w : 1) * (p.cur - p.prev) / o.totalPrev * 100; sum += c;
    const tip = [[fmt.signed(c, 2, ' pp'), 'contribution to total change']];
    if (p.fmtLevel) tip.push([p.fmtLevel(p.cur) + ' vs ' + p.fmtLevel(p.prev), 'now vs a year earlier']);
    if (p.w != null) tip.push([fmt.fixed(p.w * 100, 1) + '%', 'weight']);
    rows.push({ label: p.label, value: c, tip });
  });
  rows.sort((a, b) => b.value - a.value);
  const totalYy = o.totalCur != null && o.totalPrev ? (o.totalCur / o.totalPrev - 1) * 100 : null;
  const out = [{ label: o.totalLabel || 'Total change', value: totalYy, emph: true, tip: [[fmt.signed(totalYy, 2, '%'), o.totalTip || 'published total']] }].concat(rows);
  if (totalYy != null && o.remainder !== false) out.push({ label: o.remainderLabel || 'Not explained', value: totalYy - sum, tip: [[fmt.signed(totalYy - sum, 2, ' pp'), 'part of the published change the parts above do not explain']] });
  return out;
};

/* ------------------------------------------------------------------ stacked columns (positive parts, <= 24px, 2px gaps) */
// o: {labels:[period], series:[{name,color,vals}], height, fmtVal, unit}
Kit.stackedColumns = function (host, o) {
  // o: {labels:[period], series:[{name,color,vals}], height, fmtVal, line?:{name,color,vals}, label, title}
  // Positive parts stack up from zero, negative parts stack down; <= 24px wide, 2px gaps, 4px rounded outer ends. Optional overlaid line (e.g. the published total).
  const rowsFn = () => [['Period'].concat(o.series.map(se => se.name), o.line ? [o.line.name] : [])].concat(o.labels.map((p, i) => [p].concat(o.series.map(se => se.vals[i]), o.line ? [o.line.vals[i]] : [])));
  const frame = Kit.chartFrame(host, rowsFn, { title: o.title, legend: () => o.series.map(se => ({ name: se.name, color: Kit.cssColor(se.color) })).concat(o.line ? [{ name: o.line.name, color: Kit.cssColor(o.line.color) }] : []) });
  const box = frame.box;
  { const lb = o.labels[o.labels.length - 1] || '', m = /^(\d{4})(?:-Q(\d))?/.exec(String(lb)); if (m) Kit.noteFresh(host, +m[1] + (m[2] ? (+m[2] - 1) / 4 : 0.5), o.labels.every(l => /^\d{4}$/.test(String(l)))); }
  const tip = h('div', { class: 'tt', hidden: true });
  let ro = null, destroyed = false, curH = o.height || 260;
  function endRounded(x, y, w, hgt, r, up) {                   // rounded at the data end only (top for up-stacks, bottom for down-stacks)
    x = +x; y = +y; w = +w; hgt = +hgt;                         // callers pass toFixed() strings; '+' would concatenate
    r = Math.min(r, hgt, w / 2);
    return up ? 'M' + x + ' ' + (y + hgt) + 'L' + x + ' ' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'L' + (x + w - r) + ' ' + y + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'L' + (x + w) + ' ' + (y + hgt) + 'Z'
              : 'M' + x + ' ' + y + 'L' + (x + w) + ' ' + y + 'L' + (x + w) + ' ' + (y + hgt - r) + 'Q' + (x + w) + ' ' + (y + hgt) + ' ' + (x + w - r) + ' ' + (y + hgt) + 'L' + (x + r) + ' ' + (y + hgt) + 'Q' + x + ' ' + (y + hgt) + ' ' + x + ' ' + (y + hgt - r) + 'Z';
  }
  function draw() {
    if (destroyed) return;
    const W = Math.max(280, box.clientWidth || host.clientWidth || 560), H = curH, m = { l: 52, r: 8, t: 8, b: 26 };
    const n = o.labels.length, iw = W - m.l - m.r, ih = H - m.t - m.b, band = iw / Math.max(1, n), bw = Math.min(24, Math.max(2, band * 0.72));
    const pos = o.labels.map((_, i) => o.series.reduce((a, se) => a + (se.vals[i] > 0 ? se.vals[i] : 0), 0));
    const neg = o.labels.map((_, i) => o.series.reduce((a, se) => a + (se.vals[i] < 0 ? se.vals[i] : 0), 0));
    const lv = o.line ? o.line.vals.filter(v => v != null) : [];
    let hiV = Math.max.apply(null, pos.concat(lv, [0.0001])) * 1.06, loV = Math.min.apply(null, neg.concat(lv, [0]));
    if (loV < 0) loV *= 1.06;
    const nt = niceTicks(loV, hiV, 5);
    const Y = v => m.t + (nt.hi - v) / (nt.hi - nt.lo) * ih;
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': o.label || 'Stacked column chart' });
    const g = s('g', { class: 'grid' }), ax = s('g', { class: 'ax' });
    nt.ticks.forEach(t => { g.appendChild(s('line', { x1: m.l, x2: W - m.r, y1: Y(t).toFixed(1), y2: Y(t).toFixed(1) })); ax.appendChild(s('text', { x: m.l - 6, y: (Y(t) + 3.5).toFixed(1), 'text-anchor': 'end' }, fmt.tick(t, nt.step))); });
    svg.appendChild(g);
    const stepL = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
    o.labels.forEach((p, i) => { if ((n - 1 - i) % stepL === 0) ax.appendChild(s('text', { x: (m.l + band * i + band / 2).toFixed(1), y: H - 7, 'text-anchor': 'middle' }, fmt.period(p).replace(/^(\w{3}) 20(\d\d)$/, "$1 '$2"))); });
    svg.appendChild(ax);
    if (nt.lo < 0) svg.appendChild(s('g', { class: 'zero' }, s('line', { x1: m.l, x2: W - m.r, y1: Y(0).toFixed(1), y2: Y(0).toFixed(1) })));
    const cols = [];
    o.labels.forEach((p, i) => {
      const x = m.l + band * i + (band - bw) / 2, grp = s('g'); let cumP = 0, cumN = 0, topP = -1, topN = -1;
      o.series.forEach((se, k) => { if (se.vals[i] > 0) topP = k; else if (se.vals[i] < 0) topN = k; });
      o.series.forEach((se, k) => {
        const v = se.vals[i]; if (v == null || v === 0) return;
        if (v > 0) {
          const yTop = Y(cumP + v), yBot = Y(cumP) - (cumP > 0 ? 2 : 0), hgt = Math.max(0.8, yBot - yTop);
          grp.appendChild(k === topP ? s('path', { d: endRounded(x.toFixed(1), yTop.toFixed(1), bw.toFixed(1), hgt.toFixed(1), 4, true), fill: se.color }) : s('rect', { x: x.toFixed(1), y: yTop.toFixed(1), width: bw.toFixed(1), height: hgt.toFixed(1), fill: se.color }));
          cumP += v;
        } else {
          const yTop = Y(cumN) + (cumN < 0 ? 2 : 0), yBot = Y(cumN + v), hgt = Math.max(0.8, yBot - yTop);
          grp.appendChild(k === topN ? s('path', { d: endRounded(x.toFixed(1), yTop.toFixed(1), bw.toFixed(1), hgt.toFixed(1), 4, false), fill: se.color }) : s('rect', { x: x.toFixed(1), y: yTop.toFixed(1), width: bw.toFixed(1), height: hgt.toFixed(1), fill: se.color }));
          cumN += v;
        }
      });
      svg.appendChild(grp); cols.push(grp);
    });
    if (o.line) {
      let d = '', pen = false;
      o.line.vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + (m.l + band * i + band / 2).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; });
      svg.appendChild(s('path', { d, fill: 'none', stroke: o.line.color || 'var(--ink)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    }
    o.labels.forEach((p, i) => {
      const hit = s('rect', { x: (m.l + band * i).toFixed(1), y: m.t, width: band.toFixed(1), height: ih, fill: 'transparent' });
      const show = () => {
        clear(tip); tip.hidden = false;
        tip.appendChild(h('div', { class: 'when', text: fmt.period(p) }));
        if (o.line && o.line.vals[i] != null) tip.appendChild(h('div', { class: 'r' }, h('span', { class: 'k', style: 'background:' + (o.line.color || 'var(--ink)') }), h('span', { class: 'v', text: o.fmtVal ? o.fmtVal(o.line.vals[i]) : fmt.num(o.line.vals[i]) }), h('span', { class: 'n', text: o.line.name })));
        o.series.forEach(se => { if (se.vals[i] != null && se.vals[i] !== 0) tip.appendChild(h('div', { class: 'r' }, h('span', { class: 'k', style: 'background:' + se.color }), h('span', { class: 'v', text: o.fmtVal ? o.fmtVal(se.vals[i]) : fmt.num(se.vals[i]) }), h('span', { class: 'n', text: se.name }))); });
        if (!o.line) tip.appendChild(h('div', { class: 'r' }, h('span', { class: 'v', text: o.fmtVal ? o.fmtVal(pos[i] + neg[i]) : fmt.num(pos[i] + neg[i]) }), h('span', { class: 'n', text: 'Total' })));
        const tw = tip.offsetWidth; let left = m.l + band * i + band + 6; if (left + tw > W) left = m.l + band * i - tw - 6;
        tip.style.left = Math.max(2, left) + 'px'; tip.style.top = '4px';
        cols.forEach((c, j) => c.setAttribute('opacity', j === i ? '1' : '0.45'));
      };
      const hide = () => { tip.hidden = true; cols.forEach(c => c.removeAttribute('opacity')); };
      hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', hide); hit.addEventListener('pointerdown', show);
      svg.appendChild(hit);
    });
    clear(box); box.appendChild(svg); box.appendChild(tip); frame.svg = svg;
  }
  draw();
  if (typeof ResizeObserver !== 'undefined') { let last = 0; ro = new ResizeObserver(() => { const w = box.clientWidth; if (Math.abs(w - last) > 2) { last = w; draw(); } }); ro.observe(box); }
  const api = { destroy() { destroyed = true; if (ro) ro.disconnect(); frame.remove(); }, redraw: draw };
  api.getHeight = () => curH; api.setHeight = hh => { curH = Math.max(160, Math.round(hh)); draw(); }; box.__chart = api;
  return api;
};

/* ------------------------------------------------------------------ tab shell */
// cfg: {title, pubs:[code], relevance, extra}
Kit.tabShell = function (cfg) {
  const root = h('div');
  root.appendChild(h('h3', { class: 'serif', style: 'margin:0;font-size:18px', text: cfg.title }));
  const bits = cfg.pubs.map(code => {
    const p = Store.pub(code), nx = Kit.sched.next(code);
    return code + ' ' + (Kit.PUB_SHORT[code] || p.name) + ': latest ' + fmt.period(p.last) + (nx ? ', next ' + Kit.sched.dateText(nx.date) + ' ' + nx.time : '');
  });
  root.appendChild(h('div', { class: 'page-sub', text: bits.join(' · ') }));
  if (cfg.relevance) root.appendChild(h('div', { class: 'relevance', text: cfg.relevance }));
  return root;
};

/* ------------------------------------------------------------------ shared persistent colour assignment */
// colours follow the entity: a key keeps its slot while it stays selected
Kit.colorMap = function (palette) {
  const m = new Map();
  return {
    assign(sel) {
      Array.from(m.keys()).forEach(k => { if (sel.indexOf(k) < 0) m.delete(k); });
      sel.forEach(k => { if (!m.has(k)) { const used = new Set(m.values()); let i = 0; while (used.has(i)) i++; m.set(k, i); } });
    },
    of(k) { return palette[m.get(k)] || palette[0]; },
  };
};
Kit.PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];

/* ------------------------------------------------------------------ section navigation inside a tab (kept in the hash as ?v=) */
Kit.sectionNav = function (tab, sections, onChange) {
  const hs = Kit.hashState.read(tab);
  let cur = sections.some(s0 => s0.v === hs.get('v')) ? hs.get('v') : sections[0].v;
  const seg = Kit.segmented(sections.map(s0 => ({ v: s0.v, label: s0.label })), cur, v => { cur = v; onChange(v); });
  return { el: seg, get value() { return cur; } };
};


/* ------------------------------------------------------------------ index browser: search + group filter + sortable table + chart */
// o: {items:[{key,name,group,it}], state:{q,group,sel,tf} (mutated, persisted by the caller), getRange:()=>[x0,x1], maxSel, onState, groups:[labels], unitHint}
Kit.indexBrowser = function (o) {
  const st = o.state, max = o.maxSel || 8, cm = Kit.colorMap(Kit.PALETTE);
  const root = h('div', { 'data-kind': 'browser' }), cs = [];
  const byKey = new Map(o.items.map(r => [r.key, r]));
  st.sel = st.sel.filter(k => byKey.has(k)); if (!st.sel.length) st.sel = [o.items[0].key];
  const q = h('input', { type: 'search', placeholder: 'Search ' + o.items.length + ' series', 'aria-label': 'Search series', value: st.q || '', style: 'min-width:200px' });
  let timer = null; q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { st.q = q.value; fillTable(); changed(); }, 120); });
  const grp = o.groups && o.groups.length > 1 ? h('select', { 'aria-label': 'Group' }, [h('option', { value: '', text: 'All groups' })].concat(o.groups.map(g => { const op = h('option', { value: g, text: g }); if (g === st.group) op.selected = true; return op; }))) : null;
  if (grp) grp.addEventListener('change', () => { st.group = grp.value; fillTable(); changed(); });
  const tfSeg = Kit.segmented([{ v: 'level', label: 'Level' }, { v: 'yoy', label: '% y/y' }, { v: 'rebase', label: 'Rebased' }], st.tf, v => { st.tf = v; drawChart(); changed(); });
  const chartHost = h('div'), chipHost = h('div');
  const changed = () => { if (o.onState) o.onState(); };
  // the newest period any series in this list has; a series that stops earlier (published later, or discontinued) is flagged in the table and under the chart
  const endX = it => Store.pubX[it.pub][it.s + it.n - 1];
  const newest = {};                                                 // per publication: a quarterly series is not "late" for ending before a monthly one
  o.items.forEach(r => { const x = endX(r.it), c = newest[r.it.pub]; if (!c || x > c.x) newest[r.it.pub] = { x, p: r.it.lastP }; });
  const behind = it => endX(it) < newest[it.pub].x - 0.01;
  const rows = o.items.map(r => {
    const it = r.it, n = it.v.length, m = Store.metrics(it, null);
    const pp = it.yoyKind === 'pp';                                    // a series that is itself a percentage / rate: changes are in percentage points
    return Object.assign({ last: it.last, d3: n > 3 ? (pp ? (it.v[n - 4] == null ? null : it.last - it.v[n - 4]) : Store.pct(it.last, it.v[n - 4])) : null, yoy: m.yoy, pp, spark: it.v.slice(-60), lastP: it.lastP }, r);
  });
  const cols = [
    { key: 'name', label: 'Series', cls: 'l lab', sort: r => r.name.toLowerCase(), render: r => h('div', { title: r.name + (r.group ? ' — ' + r.group : '') }, h('div', { class: 't', text: r.name }), r.group ? h('div', { class: 'sm', text: r.group }) : null) },
    { key: 'last', label: o.lastLabel || 'Latest', firstDir: -1, sort: r => r.last, render: r => behind(r.it) ? h('span', {}, o.fmtLast ? o.fmtLast(r.last) : fmt.num(r.last), h('div', { class: 'sm', title: 'This series stops here; the rest of its release runs to ' + fmt.period(newest[r.it.pub].p), text: fmt.period(r.lastP) })) : (o.fmtLast ? o.fmtLast(r.last) : fmt.num(r.last)) },
    { key: 'd3', label: 'vs 3m ago', firstDir: -1, sort: r => r.d3, render: r => r.pp ? fmt.sg(r.d3, 1, ' pp') : fmt.sg(r.d3) },
    { key: 'yoy', label: 'y/y', firstDir: -1, sort: r => r.yoy, render: r => r.pp ? fmt.sg(r.yoy, 1, ' pp') : fmt.sg(r.yoy) },
    { key: 'sp', label: '5-yr trend', nosort: true, cls: 'hide-s', render: r => Kit.spark(r.spark) },
  ].concat(o.extraCols || []);
  const tbl = Kit.table(cols, { sortKey: st.sortKey || 'yoy', sortDir: st.sortDir || -1, page: 40, empty: 'No series match.', isSel: r => st.sel.includes(r.key),
    onToggle: r => { toggle(r.key); }, onOpen: r => { const bi = byKey.get(r.key); if (bi && bi.it) Kit.openSeries({ title: bi.name, entries: [{ name: bi.name.slice(0, 80), it: bi.it }], toggle: { isOn: () => st.sel.includes(r.key), fn: () => toggle(r.key), offLabel: 'Add to the chart', onLabel: 'Remove from the chart' } }); }, onSort: (k, d) => { st.sortKey = k; st.sortDir = d; changed(); } });
  tbl.el.style.maxHeight = '46vh';
  function visible() {
    const toks = (st.q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(r => (!st.group || r.group === st.group) && toks.every(t => (r.name + ' ' + (r.group || '')).toLowerCase().indexOf(t) >= 0));
  }
  function fillTable() { tbl.set(visible()); countEl.textContent = visible().length + ' of ' + rows.length; }
  const countEl = h('span', { class: 'count' });
  function toggle(k) {
    const i = st.sel.indexOf(k);
    if (i >= 0) { if (st.sel.length === 1) return; st.sel.splice(i, 1); }
    else { if (st.sel.length >= max) { Kit.toast('Maximum ' + max + ' series — remove one first'); return; } st.sel.push(k); }
    tbl.refresh(); drawChart(); changed();
  }
  function drawChart() {
    while (cs.length) cs.pop().destroy();
    clear(chartHost); cm.assign(st.sel);
    clear(chipHost); chipHost.appendChild(Kit.chips(st.sel.map(k => ({ v: k, label: byKey.get(k).name + ' ×' })), st.sel, k => cm.of(k), k => toggle(k)));
    const [x0, x1] = o.getRange();
    const early = st.sel.map(k => byKey.get(k)).filter(r => r && behind(r.it));
    const twinOf = r => { const k = it => [it.measure, it.name, it.sub, it.geo, it.unit, it.price].join('|'); return r.it.adj === 'sa' ? o.items.find(x => x !== r && x.it.adj === 'nsa' && k(x.it) === k(r.it) && endX(x.it) > endX(r.it) + 0.01) : null; };
    const twinNote = early.map(twinOf).filter(Boolean).length ? ' The actual (not seasonally adjusted) version of the same series runs to ' + fmt.period(early.map(twinOf).filter(Boolean)[0].it.lastP) + '; the seasonally adjusted version is published later.' : '';
    if (early.length) chartHost.appendChild(h('div', { class: 'note', text: early.map(r => (r.name.length > 60 ? r.name.slice(0, 58) + '…' : r.name) + ' — latest figure ' + fmt.period(r.it.lastP)).join('; ') + '. The rest of ' + (early.length > 1 ? 'their releases runs' : 'its release runs') + ' to ' + early.map(r => fmt.period(newest[r.it.pub].p)).filter((v, i, arr) => arr.indexOf(v) === i).join(' / ') + ', so the line stops earlier.' + twinNote }));
    cs.push(Kit.linePanel(chartHost, { entries: st.sel.map(k => ({ key: k, name: byKey.get(k).name, color: cm.of(k), it: byKey.get(k).it })), tf: st.tf, x0, x1, height: o.height || 300, unit: o.unitHint && st.tf === 'level' ? o.unitHint : undefined }));
  }
  root.appendChild(h('div', { class: 'filters', style: 'margin:8px 0' }, q, grp, tfSeg, countEl));
  root.appendChild(chipHost); root.appendChild(chartHost);
  root.appendChild(h('div', { style: 'margin-top:10px' }, tbl.el));
  fillTable(); drawChart();
  return { el: root, destroy() { while (cs.length) cs.pop().destroy(); }, redraw() { cs.forEach(c => c.redraw && c.redraw()); } };
};


/* ================================================================== chart frame: PNG / CSV / table export on every chart */
Kit.APP_NAME = 'SA Economic Pulse';
Kit.slug = t => String(t || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'chart';

Kit.modal = function (title, node) {
  const back = h('div', { class: 'modalback', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const box = h('div', { class: 'modalbox' }, h('div', { class: 'card-head' }, h('h3', { text: title }), h('div', { class: 'tools' }, h('button', { type: 'button', class: 'small', text: 'Close', onclick: close }))), node);
  function close() { back.remove(); document.removeEventListener('keydown', onKey, true); }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey, true);
  back.appendChild(box); document.body.appendChild(back);
  box.querySelector('button').focus();
  return { close };
};

/* A row's full history in a pop-up (the way the CPI dashboard does it).
   o: {title, sub, entries:[{name, it, color?}], toggle?:{isOn(), fn(), onLabel, offLabel}, note?}.  Chart has its own range / view / axis controls and the Table / PNG / CSV toolbar. */
Kit.openSeries = function (o) {
  const entries = (o.entries || []).filter(e => e.it);
  if (!entries.length) { Kit.toast('No history to show for this row'); return null; }
  const body = h('div', { class: 'serbody' }), it0 = entries[0].it, X = Store.pubX[it0.pub];
  const st = Store.stats(it0), isPct = st.isPct, ff = v => v == null ? '–' : (isPct ? fmt.fixed(v, 1) + '%' : fmt.num(v));
  const dtxt = (d, pp) => d == null ? '–' : fmt.sg(d, 1, pp ? ' pp' : '%');
  body.appendChild(h('div', { class: 'sub', text: (o.sub && o.sub !== it0.pubShort ? o.sub + ' · ' : '') + it0.pubShort + ' · ' + Store.unitLabel(it0, 'level') + ' · ' + fmt.period(it0.firstP) + ' to ' + fmt.period(it0.lastP) + ' · ' + it0.n + ' observations' }));
  body.appendChild(Kit.kpiStrip([
    { label: 'Latest · ' + fmt.period(it0.lastP), value: ff(st.cur), note: entries[0].name },
    { label: 'On the prior ' + time.stepName(it0.freq), value: dtxt(st.dPrior, isPct), note: ff(st.prior) },
    { label: 'On a year earlier', value: dtxt(st.dYear, isPct), note: ff(st.yago) },
    { label: 'Lowest / highest', value: ff(st.min) + ' / ' + ff(st.max), note: st.pctile == null ? '' : 'now at the ' + st.pctile + 'th percentile of its history' },
  ]));
  const panels = [];
  [{ title: null, entries }].concat((o.more || []).map(g => ({ title: g.title, entries: (g.entries || []).filter(e => e.it) }))).filter(g => g.entries.length).forEach((g, gi) => {
    const chartHost = h('div', { class: 'card flat' }); body.appendChild(chartHost);
    if (g.title) chartHost.appendChild(h('div', { class: 'serhead', text: g.title }));
    const x0 = Math.min.apply(null, g.entries.map(e => Store.pubX[e.it.pub][e.it.s])), x1 = Math.max.apply(null, g.entries.map(e => Store.pubX[e.it.pub][e.it.s + e.it.n - 1]));
    panels.push(Kit.linePanel(chartHost, { entries: g.entries.map((e, i) => ({ key: 'o' + gi + '_' + i, name: e.name, color: e.color || Kit.PALETTE[i % 8], it: e.it })), tf: 'level', x0, x1, height: gi ? 240 : 300, label: g.title || o.title, title: (g.title ? o.title + ': ' + g.title : o.title) }));
  });
  const foot = h('div', { class: 'serfoot' });
  if (o.toggle) { const b = h('button', { type: 'button', class: 'primary', text: o.toggle.isOn() ? (o.toggle.onLabel || 'Remove from the chart') : (o.toggle.offLabel || 'Add to the chart') });
    b.addEventListener('click', () => { o.toggle.fn(); md.close(); }); foot.appendChild(b); }
  foot.appendChild(h('a', { class: 'ghostlink', href: '#/explorer?q=' + encodeURIComponent(entries[0].name.replace(/ \(.*\)$/, '').slice(0, 60)), text: 'Open in the Series Explorer', onclick: () => md.close() }));
  if (o.note) body.appendChild(h('div', { class: 'note', text: o.note }));
  body.appendChild(foot);
  const md = Kit.modal(o.title, body);
  const orig = md.close; md.close = function () { panels.forEach(pn => pn.destroy()); orig(); };
  return md;
};

Kit.rowsToTable = function (rows) {
  const t = h('table', { class: 'data' }), head = h('thead'), body = h('tbody');
  head.appendChild(h('tr', {}, rows[0].map((c, i) => h('th', { class: i === 0 ? 'l' : '', text: String(c) }))));
  rows.slice(1).forEach(r => body.appendChild(h('tr', {}, r.map((c, i) => h('td', { class: i === 0 ? 'l' : '', text: c == null ? '' : (typeof c === 'number' ? fmt.num(c) : String(c)) })))));
  t.appendChild(head); t.appendChild(body);
  return h('div', { class: 'tablewrap', style: 'max-height:60vh' }, t);
};
Kit.csvDownload = function (name, rows) {
  Kit.download(name + '.csv', '﻿' + rows.map(r => r.map(Kit.csvCell).join(',')).join('\r\n') + '\r\n');
};
// rows for a multi-series line chart: one row per period, one column per series
Kit.lineRows = function (series) {
  const byX = new Map();
  series.forEach((se, k) => se.xs.forEach((x, i) => { if (se.vs[i] == null) return; const key = x.toFixed(4); if (!byX.has(key)) byX.set(key, { x, p: se.ps[i], v: new Array(series.length).fill(null) }); byX.get(key).v[k] = se.vs[i]; }));
  const rows = Array.from(byX.values()).sort((a, b) => a.x - b.x);
  return [['Period'].concat(series.map(s0 => s0.name))].concat(rows.map(r => [r.p].concat(r.v)));
};

// serialise an SVG with its CSS-variable colours and classes resolved, so it renders as a stand-alone picture
function inlineSvgStyles(src, dst) {
  const cs = getComputedStyle(src);
  ['fill', 'stroke', 'stroke-width', 'stroke-opacity', 'fill-opacity', 'opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'paint-order', 'visibility', 'display', 'stop-color', 'stop-opacity'].forEach(p => dst.style.setProperty(p, cs.getPropertyValue(p)));
  for (let i = 0; i < src.children.length; i++) inlineSvgStyles(src.children[i], dst.children[i]);
}
Kit.svgToPng = function (svg, meta, filename) {
  const clone = svg.cloneNode(true);
  inlineSvgStyles(svg, clone);
  Array.from(clone.querySelectorAll('[fill="transparent"],.xhair,title')).forEach(n => n.remove());
  Array.from(clone.querySelectorAll('*')).forEach(n => { if (n.style.display === 'none') n.remove(); });
  const vb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal : null;
  const w = vb ? vb.width : (svg.clientWidth || 720), hgt = vb ? vb.height : (svg.clientHeight || 320);
  clone.setAttribute('width', w); clone.setAttribute('height', hgt); clone.setAttribute('xmlns', SVGNS);
  const root = getComputedStyle(document.documentElement), V = n => root.getPropertyValue(n).trim() || '#000';
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.onload = () => {
    const sc = 2, pad = 16, W = w + pad * 2;
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    const font = (sz, wt) => (wt || 400) + ' ' + sz + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
    // measure the header: title, subtitle, legend (wrapped)
    ctx.font = font(11);
    const legend = meta.legend || [], lines = []; let x = 0, line = [];
    legend.forEach(it => { const tw = ctx.measureText(it.name).width + 34; if (x + tw > w && line.length) { lines.push(line); line = []; x = 0; } line.push(it); x += tw; });
    if (line.length) lines.push(line);
    const titleH = meta.title ? 30 : 0, subH = meta.sub ? 20 : 0, legH = lines.length * 20 + (lines.length ? 6 : 0), footH = 26;
    const H = pad + titleH + subH + legH + hgt + footH + pad / 2;
    cv.width = W * sc; cv.height = H * sc; ctx.scale(sc, sc);
    ctx.fillStyle = V('--surface-1'); ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle'; let y = pad;
    if (meta.title) { ctx.fillStyle = V('--ink'); ctx.font = font(16, 700); ctx.fillText(meta.title, pad, y + 14); y += titleH; }
    if (meta.sub) { ctx.fillStyle = V('--ink-2'); ctx.font = font(12); let t = meta.sub; while (t.length > 8 && ctx.measureText(t).width > w) t = t.slice(0, -2); ctx.fillText(t === meta.sub ? t : t.trimEnd() + '…', pad, y + 8); y += subH; }
    ctx.font = font(11);
    lines.forEach(ln => { let lx = pad; ln.forEach(it => { ctx.fillStyle = it.color; ctx.fillRect(lx, y + 8, 14, 3); ctx.fillStyle = V('--ink'); ctx.fillText(it.name, lx + 20, y + 9); lx += ctx.measureText(it.name).width + 34; }); y += 20; });
    if (lines.length) y += 6;
    ctx.drawImage(img, pad, y, w, hgt); y += hgt;
    ctx.fillStyle = V('--muted'); ctx.font = font(10.5);
    ctx.fillText('Source: ' + (meta.source || 'Statistics South Africa') + ', via ' + Kit.APP_NAME + ' · ' + new Date().toISOString().slice(0, 10), pad, y + 14);
    cv.toBlob(b => { const a = h('a', { href: URL.createObjectURL(b), download: filename }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); });
  };
  img.onerror = () => Kit.toast('Could not render the picture in this browser');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
};

// A wrapper every chart sits in: gives it a hover toolbar (Table / PNG / CSV). getRows() -> array of arrays (header first).
Kit.chartFrame = function (host, getRows, o) {
  o = o || {};
  const box = h('div', { class: 'chartbox' });
  const wrap = h('div', { class: 'chartwrap' }, box);
  const frame = { box, wrap, svg: null, remove() { wrap.remove(); } };
  const ctx = () => {
    const card = wrap.closest('.card') || wrap.closest('.modalbox');
    const h3 = card && card.querySelector('h3'), sub = card && card.querySelector('.card-head + .sub, .sub');
    const lg = [];
    (wrap.parentElement ? wrap.parentElement.querySelectorAll(':scope > .legend .it, :scope > .maplegend .it') : []).forEach(it => { const k = it.querySelector('.key, .sw'); lg.push({ name: (it.querySelector('.nm') || it).textContent.trim(), color: k ? getComputedStyle(k).backgroundColor : 'gray' }); });
    return { title: o.title || (h3 ? h3.textContent.trim() : ''), sub: o.sub || (sub ? sub.textContent.trim() : ''), legend: typeof o.legend === 'function' ? o.legend() : (o.legend || lg), source: typeof o.source === 'function' ? o.source() : o.source };
  };
  const btn = (label, title, fn) => h('button', { type: 'button', class: 'small', title, text: label, onclick: e => { e.stopPropagation(); fn(); } });
  const bar = h('div', { class: 'charttools', role: 'toolbar', 'aria-label': 'Export this chart' },
    btn('Table', 'View the plotted numbers as a table', () => { const r = getRows(); if (r && r.length > 1) Kit.modal(ctx().title || 'Data', Kit.rowsToTable(r)); }),
    btn('PNG', 'Download as a picture (with title and legend)', () => { if (frame.svg) Kit.svgToPng(frame.svg, ctx(), Kit.slug(ctx().title) + '.png'); }),
    btn('CSV', 'Download the plotted numbers', () => { const r = getRows(); if (r && r.length > 1) Kit.csvDownload(Kit.slug(ctx().title), r); }));
  wrap.appendChild(bar); host.appendChild(wrap);
  return frame;
};

/* ================================================================== search-to-add combobox */
// o: {placeholder, candidates:()=>[{key,label,group}], selected:()=>[keys], onAdd(key), max, maxText}
Kit.addSearch = function (o) {
  const id = 'as' + Math.random().toString(36).slice(2, 8);
  const inp = h('input', { type: 'search', class: 'addinp', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': id, 'aria-autocomplete': 'list', autocomplete: 'off', placeholder: o.placeholder || 'Add a series… type to search' });
  const list = h('div', { class: 'addlist', id, role: 'listbox', hidden: true });
  const root = h('div', { class: 'addsearch' + (o.current != null ? ' pick' : '') }, h('span', { class: 'addplus', 'aria-hidden': 'true', text: '+' }), inp, list);
  if (o.current != null) inp.value = o.current;
  let cur = [], act = -1;
  function matches() {
    const q = o.current != null && inp.value === o.current ? '' : inp.value;                   // pick mode: the box shows the current choice until you start typing
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean), sel = new Set(o.selected ? o.selected() : []);
    const all = o.candidates();
    return all.filter(c => !sel.has(c.key) && toks.every(t => (c.label + ' ' + (c.group || '')).toLowerCase().indexOf(t) >= 0)).slice(0, 40);
  }
  function show() {
    cur = matches(); act = cur.length ? 0 : -1; clear(list);
    const full = o.max && o.selected && o.selected().length >= o.max;
    if (full) list.appendChild(h('div', { class: 'addmsg', text: o.maxText || ('Maximum ' + o.max + ' series — remove one first.') }));
    else if (!cur.length) list.appendChild(h('div', { class: 'addmsg', text: inp.value ? 'No match' : 'Everything is already shown' }));
    else cur.forEach((c, i) => list.appendChild(h('div', { class: 'addopt' + (i === act ? ' act' : ''), role: 'option', id: id + '-' + i, 'aria-selected': String(i === act), onpointerdown: e => { e.preventDefault(); pick(i); } }, h('span', { class: 'ol', text: c.label }), c.group ? h('span', { class: 'og', text: c.group }) : null)));
    list.hidden = false; inp.setAttribute('aria-expanded', 'true');
  }
  function hide() { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); }
  function pick(i) { const c = cur[i]; if (!c) return; if (o.max && o.selected && o.selected().length >= o.max) { Kit.toast(o.maxText || 'Maximum ' + o.max + ' series — remove one first'); return; } o.onAdd(c.key); inp.value = o.current != null ? o.current : ''; hide(); }
  inp.addEventListener('focus', () => { if (o.current != null) inp.select(); show(); }); inp.addEventListener('input', show);
  inp.addEventListener('blur', () => setTimeout(() => { hide(); if (o.current != null) inp.value = o.current; }, 120));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) show(); else { act = Math.min(cur.length - 1, act + 1); mark(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, act - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(act); }
    else if (e.key === 'Escape') { hide(); inp.blur(); }
  });
  function mark() { Array.from(list.children).forEach((n, i) => { n.classList.toggle('act', i === act); n.setAttribute('aria-selected', String(i === act)); if (i === act) n.scrollIntoView({ block: 'nearest' }); }); inp.setAttribute('aria-activedescendant', act >= 0 ? id + '-' + act : ''); }
  return root;
};

// A searchable replacement for a long <select>: o = {options:[{key,label,group}], value, onChange(key), placeholder, ariaLabel}
Kit.pickSearch = function (o) {
  const cur = o.options.find(x => x.key === o.value);
  const el = Kit.addSearch({ placeholder: o.placeholder || 'Type to search\u2026', current: cur ? cur.label : '', candidates: () => o.options, selected: () => [], onAdd: o.onChange });
  const inp = el.querySelector('input'); if (o.ariaLabel) inp.setAttribute('aria-label', o.ariaLabel);
  if (o.width) el.style.cssText += ';max-width:' + o.width + ';flex-basis:' + o.width;
  return el;
};

/* ================================================================== province map (choropleth) */
const PROV_SHORT = { 'Western Cape': 'WC', 'Eastern Cape': 'EC', 'Northern Cape': 'NC', 'Free State': 'FS', 'KwaZulu-Natal': 'KZN', 'North West': 'NW', 'Gauteng': 'GP', 'Mpumalanga': 'MP', 'Limpopo': 'LP' };
// o: {values:{province:number|null}, fmt(v), pivot?, pivotLabel?, selected?, onClick?(prov), tipLabel, caption, title}
Kit.provinceMap = function (host, o) {
  const Z = window.ZAMAP;
  const frame = Kit.chartFrame(host, () => [['Province', o.tipLabel || 'Value']].concat(Object.keys(Z.paths).map(p => [p, o.values[p]])), { title: o.title });
  const box = frame.box, tip = h('div', { class: 'tt', hidden: true });
  const vals = Object.values(o.values).filter(v => v != null && isFinite(v));
  const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  const diverging = o.pivot != null && isFinite(o.pivot);
  const dev = diverging ? (Math.max(Math.abs(hi - o.pivot), Math.abs(lo - o.pivot)) || 1) : 1;
  const MIX = 70, MID = 'color-mix(in srgb, var(--muted) 32%, var(--surface-1))';
  const fill = v => {
    if (v == null || !isFinite(v)) return 'var(--grid)';
    if (diverging) { const t = (v - o.pivot) / dev; return 'color-mix(in srgb, ' + (t >= 0 ? 'var(--up)' : 'var(--down)') + ' ' + Math.round(Math.abs(t) * MIX) + '%, ' + MID + ')'; }
    return 'color-mix(in srgb, var(--c1) ' + Math.round(8 + (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (MIX - 8)) + '%, var(--surface-1))';
  };
  const LGH = 40, svg = s('svg', { viewBox: '0 0 ' + Z.viewW + ' ' + (Z.viewH + LGH), class: 'mapsvg', role: 'group', 'aria-label': o.title || 'Map of South African provinces' });
  Object.keys(Z.paths).forEach(p => {
    const v = o.values[p], tipTxt = p + ': ' + (v == null ? 'no data' : o.fmt(v));
    const path = s('path', { d: Z.paths[p], class: 'prov' + (o.selected === p ? ' sel' : ''), fill: fill(v), 'fill-rule': 'evenodd', tabindex: '0', role: 'img', 'aria-label': tipTxt });
    const showTip = (cx, cy) => { clear(tip); tip.hidden = false; tip.appendChild(h('div', { class: 'when', text: p })); tip.appendChild(h('div', { class: 'r' }, h('span', { class: 'v', text: v == null ? '–' : o.fmt(v) }), h('span', { class: 'n', text: o.tipLabel || '' })));
      if (diverging && v != null) tip.appendChild(h('div', { class: 'r' }, h('span', { class: 'v', text: fmt.signed(v - o.pivot, 2) }), h('span', { class: 'n', text: 'vs ' + (o.pivotLabel || 'national') })));
      const b = box.getBoundingClientRect(); tip.style.left = Math.max(2, Math.min(b.width - tip.offsetWidth - 2, cx - b.left + 12)) + 'px'; tip.style.top = Math.max(2, Math.min(b.height - tip.offsetHeight - 2, cy - b.top + 12)) + 'px'; };
    path.addEventListener('pointermove', e => showTip(e.clientX, e.clientY));
    path.addEventListener('pointerleave', () => { tip.hidden = true; });
    path.addEventListener('focus', () => { const r = path.getBoundingClientRect(); showTip(r.left + r.width / 2, r.top + r.height / 2); });
    path.addEventListener('blur', () => { tip.hidden = true; });
    if (o.onClick) { path.addEventListener('click', () => o.onClick(p)); path.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onClick(p); } }); path.style.cursor = 'pointer'; }
    svg.appendChild(path);
  });
  Object.keys(Z.cent).forEach(p => {
    const [cx, cy] = Z.cent[p], v = o.values[p];
    svg.appendChild(s('text', { x: cx, y: cy, 'text-anchor': 'middle', class: 'maplab' }, PROV_SHORT[p] || p.slice(0, 2)));
    if (v != null) svg.appendChild(s('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', class: 'mapval' }, o.fmt(v)));
  });
  box.appendChild(svg); box.appendChild(tip); frame.svg = svg;
  // legend drawn inside the SVG so it is part of the PNG export
  const gid = 'mg' + Math.random().toString(36).slice(2, 7), stops = diverging ? [['0%', 'color-mix(in srgb, var(--down) ' + MIX + '%, ' + MID + ')'], ['50%', MID], ['100%', 'color-mix(in srgb, var(--up) ' + MIX + '%, ' + MID + ')']]
    : [['0%', 'color-mix(in srgb, var(--c1) 8%, var(--surface-1))'], ['100%', 'color-mix(in srgb, var(--c1) ' + MIX + '%, var(--surface-1))']];
  const gr = s('linearGradient', { id: gid, x1: '0', x2: '1', y1: '0', y2: '0' }); stops.forEach(([off, c]) => gr.appendChild(s('stop', { offset: off, style: 'stop-color:' + c })));
  svg.appendChild(s('defs', {}, gr));
  const lx = Z.viewW / 2 - 110, ly = Z.viewH + 8;
  svg.appendChild(s('rect', { x: lx, y: ly, width: 220, height: 10, rx: 5, fill: 'url(#' + gid + ')', stroke: 'var(--border)' }));
  svg.appendChild(s('text', { x: lx - 6, y: ly + 9, 'text-anchor': 'end', class: 'maplegtxt' }, o.fmt(lo)));
  svg.appendChild(s('text', { x: lx + 226, y: ly + 9, 'text-anchor': 'start', class: 'maplegtxt' }, o.fmt(hi)));
  if (diverging) svg.appendChild(s('text', { x: Z.viewW / 2, y: ly + 28, 'text-anchor': 'middle', class: 'maplegtxt' }, 'centre = ' + (o.pivotLabel || 'national') + ' ' + o.fmt(o.pivot)));
  return { destroy() { frame.remove(); }, redraw() {} };
};

/* ================================================================== line chart from full-length arrays (derived series) */
// o: {code, series:[{key,name,color,vals,dash?,width?}], x0, x1, height, valFmt, ref?, zero?, ribbon?:{lo,hi,color,name}, bands?, unit?, notes?, title, area?}
// vals/ribbon arrays are aligned to the publication's periods. Draws legend (>=2 series), unit line and the chart (with Table/PNG/CSV).
Kit.seriesLine = function (host, o) {
  const P = window.EQ.pubs[o.code], X = Store.pubX[o.code];
  (o.notes || []).forEach(t => host.appendChild(h('div', { class: 'note', text: t })));
  const wrap = h('div', { class: 'lp' }); host.appendChild(wrap);
  // the span of the data and the chart's own range (defaults to the range the page asked for)
  let i0 = X.length, i1 = -1; o.series.forEach(se => se.vals.forEach((v, i) => { if (v != null && isFinite(v)) { if (i < i0) i0 = i; if (i > i1) i1 = i; } }));
  if (i1 < 0) { i0 = 0; i1 = X.length - 1; }
  const X0 = X[i0], X1 = X[i1], span0 = o.x1 - o.x0;
  Kit.noteFresh(host, X1, (Store.pub(o.code) || {}).freq === 'A');
  const hit = [3, 5, 10, 25].find(y => Math.abs(span0 - y) < 0.6);
  const st = { range: o.x0 <= X0 + 0.01 ? 'all' : hit ? String(hit) : '10', fromYear: o.x0 > X0 + 0.01 && !hit ? String(Math.round(o.x0)) : '' }, S = { axis: {}, log: false };
  const rc = Kit.rangeCtl(st, () => drawChart());
  const logBox = h('label', { class: 'lpchk', title: 'Logarithmic vertical scale' }, h('input', { type: 'checkbox' }), ' Log');
  logBox.firstChild.addEventListener('change', () => { S.log = logBox.firstChild.checked; drawChart(); });
  const bar = h('div', { class: 'lpbar' }, o.log === false || o.zero ? null : logBox, h('span', { class: 'grow' }), h('span', { class: 'lprange', title: 'Range for this chart' }, rc.el));
  const legendHost = h('div', { class: 'lplegend' }), unitEl = h('div', { class: 'sub', style: 'margin:4px 0 0' }), chartHost = h('div');
  wrap.appendChild(bar); wrap.appendChild(legendHost);
  if (o.unit) { unitEl.textContent = o.unit; wrap.appendChild(unitEl); }
  wrap.appendChild(chartHost);
  const keyOf = se => se.key || se.name, hasRibbon = !!(o.ribbon && o.ribbon.name);
  const noAxis = hasRibbon || o.series.length < 2;
  let chart = null;
  function drawLegend() {
    clear(legendHost);
    if (o.legend === false || o.series.length + (hasRibbon ? 1 : 0) < 2) return;
    o.series.forEach(se => {
      const right = S.axis[keyOf(se)] === 'r', item = h('span', { class: 'lpleg' }, h('i', { class: 'sw', style: 'background:' + se.color }), h('span', { class: 'nm', text: se.name }));
      if (!noAxis) { const b = h('button', { type: 'button', class: 'axtag' + (right ? ' on' : ''), title: right ? 'On the right axis. Click to move to the left axis' : 'On the left axis. Click to move to a separate right axis', text: right ? 'R' : 'L' });
        b.addEventListener('click', () => { if (right) delete S.axis[keyOf(se)]; else S.axis[keyOf(se)] = 'r'; drawLegend(); drawChart(); }); item.appendChild(b); }
      legendHost.appendChild(item);
    });
    if (hasRibbon) legendHost.appendChild(h('span', { class: 'lpleg' }, h('i', { class: 'sw', style: 'background:' + (o.ribbon.color || 'var(--accent)') + ';opacity:.4' }), h('span', { class: 'nm', text: o.ribbon.name })));
  }
  function drawChart() {
    if (chart) chart.destroy(); clear(chartHost);
    const [x0, x1] = rc.xr(X0, X1);
    const cut = arr => { const xs = [], vs = [], ps = []; for (let i = 0; i < X.length; i++) if (X[i] >= x0 - 1e-9 && X[i] <= x1 + 1e-9) { xs.push(X[i]); vs.push(arr[i] == null || !isFinite(arr[i]) ? null : arr[i]); ps.push(P.periods[i]); } return { xs, vs, ps }; };
    const series = o.series.map(se => Object.assign({ key: keyOf(se), name: se.name, color: se.color, dash: se.dash, width: se.width, axis: S.axis[keyOf(se)] === 'r' ? 'r' : 'l' }, cut(se.vals)));
    let ribbon = null;
    if (o.ribbon) { const lo = cut(o.ribbon.lo), hi = cut(o.ribbon.hi); ribbon = { xs: lo.xs, lo: lo.vs, hi: hi.vs, color: o.ribbon.color }; }
    chart = Kit.lineChart(chartHost, { series, height: o.height || 240, x0, x1, zero: !!o.zero, ref: o.ref != null ? o.ref : null, single: series.length === 1, area: o.area != null ? o.area : false, log: S.log,
      label: o.title || 'Line chart', title: o.title, source: Kit.sourceOf([o.code]), valFmt: o.valFmt || (v => fmt.num(v)), bands: o.bands, ribbon });
  }
  drawLegend(); drawChart();
  return { destroy() { if (chart) chart.destroy(); wrap.remove(); }, redraw() { if (chart) chart.redraw(); } };
};

/* ================================================================== heat-map grid (SVG) */
// o: {rows:[label], cols:[label], vals:[[n|null]], fmt(v), scale, title, note?}
Kit.heatmapChart = function (host, o) {
  const frame = Kit.chartFrame(host, () => [[''].concat(o.cols)].concat(o.rows.map((r, i) => [r].concat(o.vals[i]))), { title: o.title,
    legend: () => [{ name: 'Increase (darker = bigger)', color: Kit.cssColor('var(--up)') }, { name: 'Decrease (darker = bigger)', color: Kit.cssColor('var(--down)') }] });
  const cw = 58, chh = 26, lw = 46, th = 22, W = lw + cw * o.cols.length + 2, H = th + chh * o.rows.length + 2;
  const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', 'aria-label': o.title || 'Heat map', style: 'max-width:' + W + 'px;display:block' });
  o.cols.forEach((c, j) => svg.appendChild(s('text', { x: lw + cw * j + cw / 2, y: 14, 'text-anchor': 'middle', class: 'hmcol' }, c)));
  o.rows.forEach((r, i) => {
    svg.appendChild(s('text', { x: lw - 6, y: th + chh * i + chh / 2 + 4, 'text-anchor': 'end', class: 'hmrow' }, r));
    o.cols.forEach((c, j) => {
      const v = o.vals[i][j]; if (v == null) return;
      const g = s('g'), x = lw + cw * j + 1, y = th + chh * i + 1;
      g.appendChild(s('rect', { x, y, width: cw - 2, height: chh - 2, rx: 3, fill: Kit.heat(v, o.scale || 1) }, s('title', {}, r + ' ' + c + ': ' + o.fmt(v))));
      g.appendChild(s('text', { x: x + (cw - 2) / 2, y: y + chh / 2 + 3, 'text-anchor': 'middle', class: 'hmval' }, o.fmt(v)));
      svg.appendChild(g);
    });
  });
  frame.box.appendChild(svg); frame.svg = svg;
  return { destroy() { frame.remove(); }, redraw() {} };
};

/* ================================================================== province map card with a metric switch */
// o: {title, sub, metrics:[{v,label,values:{province:n|null},fmt,pivot?,pivotLabel?}], selected?, onClick?(prov), style?}
Kit.provMapCard = function (host, o) {
  const card = h('div', { class: 'card mapcard', style: o.style || null }), mapHost = h('div', { class: 'mapcol' }), rankHost = h('div', { class: 'rankcol' }), body = h('div', { class: 'mapbody' }, mapHost, rankHost);
  let cur = o.metrics[0], chart = null, rank = null;
  function draw() {
    if (chart) chart.destroy(); if (rank) rank.destroy(); clear(mapHost); clear(rankHost);
    chart = Kit.provinceMap(mapHost, { values: cur.values, fmt: cur.fmt, pivot: cur.pivot, pivotLabel: cur.pivotLabel, tipLabel: cur.label, selected: o.selected, onClick: o.onClick, title: o.title + ' — ' + cur.label });
    const rows = Object.keys(cur.values).filter(p => cur.values[p] != null && isFinite(cur.values[p])).map(p => ({ label: p, value: cur.values[p], emph: p === o.selected,
      tip: [[cur.fmt(cur.values[p]), cur.label]].concat(cur.pivot != null && isFinite(cur.pivot) ? [[fmt.signed(cur.values[p] - cur.pivot, 2), 'vs ' + (cur.pivotLabel || 'national')]] : []) })).sort((a, b) => b.value - a.value);
    rankHost.appendChild(h('div', { class: 'rankhead', text: 'Ranked: ' + cur.label }));
    rank = Kit.hbar(rankHost, { rows, fmtVal: cur.fmt, rowH: 30, ariaLabel: o.title + ' ranked', title: o.title + ' — ' + cur.label + ' (ranking)', valueLabel: cur.label });
  }
  const seg = o.metrics.length > 1 ? Kit.segmented(o.metrics.map(m => ({ v: m.v, label: m.label })), cur.v, v => { cur = o.metrics.find(m => m.v === v); draw(); }) : null;
  card.appendChild(Kit.cardHead(o.title, o.sub, seg)); card.appendChild(body); host.appendChild(card); draw();
  if (host.classList && host.classList.contains('grid2') && !o.half) card.style.gridColumn = '1 / -1';          // a map beside a ranking needs the full row
  return { el: card, destroy() { if (chart) chart.destroy(); if (rank) rank.destroy(); card.remove(); }, redraw() { if (chart && chart.redraw) chart.redraw(); if (rank && rank.redraw) rank.redraw(); } };
};

/* ------------------------------------------------------------------ data timing: what period the latest figure covers, when it was due, when the next one lands */
Kit.freshness = function (codes, note) {
  const sch = (window.EQ && window.EQ.manifest && window.EQ.manifest.schedule) || [], today = new Date().toISOString().slice(0, 10);
  const endOf = p => { let m = /^(\d{4})-Q(\d)$/.exec(p); if (m) return new Date(Date.UTC(+m[1], +m[2] * 3, 0)); m = /^(\d{4})-(\d\d)$/.exec(p); if (m) return new Date(Date.UTC(+m[1], +m[2], 0)); m = /^(\d{4})$/.exec(p); if (m) return new Date(Date.UTC(+m[1], 12, 0)); return null; };
  const dtxt = d => d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  const FREQ = { D: 'daily', M: 'monthly', Q: 'quarterly', A: 'annual', S: 'periodic' };
  const card = h('div', { class: 'card fresh' }, Kit.cardHead('Data timing', 'The period each dataset covers, and how long after the period ends it is published'));
  const list = h('div', { class: 'freshlist' });
  codes.forEach(code => {
    const pub = Store.pub(code); if (!pub) return;
    const nx = sch.filter(r => (r.code === code || r.code === pub.sched) && r.date >= today).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : 1)[0];
    const e0 = endOf(pub.last), eN = nx ? endOf(nx.period) : null, lag = nx && eN ? Math.round((new Date(nx.date + 'T00:00:00Z') - eN) / 864e5) : null;
    const parts = [h('b', { text: (Kit.PUB_SHORT[code] || code) + ' ' }), h('span', { class: 'code', text: code }), ' ' + (FREQ[pub.freq] || '') + ': latest data covers ', h('b', { text: fmt.period(pub.last) }), e0 ? ' (period ended ' + dtxt(e0) + ')' : ''];
    if (nx) parts.push('. Next release ', h('b', { text: Kit.sched.dateText(nx.date) + ' ' + nx.time }), ' for ' + fmt.period(nx.period) + (lag != null ? ', about ' + lag + ' days after that period ends' : ''));
    else parts.push('. No further release is on the schedule yet');
    list.appendChild(h('div', { class: 'freshrow' }, parts));
  });
  card.appendChild(list); if (note) card.appendChild(h('div', { class: 'sub', style: 'margin-top:6px', text: note }));
  return card;
};

/* ------------------------------------------------------------------ stacked columns: each chart chooses how many periods it shows */
(function () {
  const base = Kit.stackedColumns;
  Kit.stackedColumns = function (host, o) {
    const n = o.labels ? o.labels.length : 0;
    if (o._inner || n < 10 || o.noRange) return base(host, o);
    const wrap = h('div', { class: 'scwrap' }), chartHost = h('div'); host.appendChild(wrap);
    const opts = [{ v: '6', label: 'Last 6' }, { v: '12', label: 'Last 12' }].filter(x => +x.v < n - 1).concat([{ v: 'all', label: n > 12 ? 'All ' + n : 'All' }]);
    let k = 'all', inner = null;
    function draw() {
      if (inner) inner.destroy(); clear(chartHost);
      const m = k === 'all' ? n : +k, cut = a => a && a.slice(-m);
      inner = base(chartHost, Object.assign({}, o, { _inner: true, labels: cut(o.labels), series: o.series.map(se => Object.assign({}, se, { vals: cut(se.vals) })), line: o.line ? Object.assign({}, o.line, { vals: cut(o.line.vals) }) : o.line }));
    }
    const seg = Kit.segmented(opts, k, v => { k = v; draw(); });
    wrap.appendChild(h('div', { class: 'scbar', title: 'How many periods this chart shows' }, h('span', { class: 'lbl', text: 'Show' }), seg)); wrap.appendChild(chartHost); draw();
    return { destroy() { if (inner) inner.destroy(); wrap.remove(); }, redraw() { if (inner) inner.redraw(); } };
  };
})();

/* ------------------------------------------------------------------ even out side-by-side cards */
// Two cards in a row often differ in height, leaving blank space under the shorter one. The first resizable chart in the shorter card is stretched to close the gap.
Kit.equalize = function (root) {
  (root || document).querySelectorAll('.grid2').forEach(g => {
    const cs = Array.from(g.children).filter(c => c.classList && c.classList.contains('card'));
    if (cs.length < 2) return;
    const rc = cs.map(c => c.getBoundingClientRect());
    if (Math.abs(rc[0].top - rc[1].top) > 6 || rc[0].height < 80) return;       // stacked in one column, or not laid out yet
    const hmax = Math.max.apply(null, rc.map(x => x.height));
    cs.forEach((c, i) => {
      const diff = hmax - rc[i].height; if (diff < 36) return;
      const box = Array.from(c.querySelectorAll('.chartbox')).find(b => b.__chart && b.__chart.setHeight); if (!box) return;
      box.__chart.setHeight(box.__chart.getHeight() + Math.min(diff - 2, 340));
    });
  });
};
let eqTimer = null;
Kit.scheduleEqualize = function () { clearTimeout(eqTimer); eqTimer = setTimeout(() => { Kit.equalize(document); }, 250); };

/* ------------------------------------------------------------------ keep the reader's place when a tab re-renders itself */
// Tabs rebuild their body after a dropdown / toggle changes. Clearing it collapses the page, the browser clamps the scroll position and the page "jumps to the top".
// This holds the page height while the body is rebuilt and restores the scroll position afterwards.
Kit.keepScroll = function (fn) {
  Kit.scheduleEqualize();
  const y = window.scrollY, view = document.getElementById('view');
  if (view) view.style.minHeight = view.offsetHeight + 'px';
  try { fn(); } finally {
    window.scrollTo(0, y);
    requestAnimationFrame(() => { window.scrollTo(0, y); setTimeout(() => { if (view) view.style.minHeight = ''; }, 60); });
  }
};

/* ------------------------------------------------------------------ theme */
Kit.theme = {
  init(btn) {
    let saved = null; try { saved = localStorage.getItem('eq-theme'); } catch (e) {}
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
    btn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') ||
        (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const nxt = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nxt);
      try { localStorage.setItem('eq-theme', nxt); } catch (e) {}
      document.dispatchEvent(new CustomEvent('themechange'));
    });
  },
};

window.Kit = Kit;
})();
