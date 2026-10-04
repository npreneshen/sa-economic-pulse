/* pulsechart.js - the chart workspace on the Pulse tab: search any series, click tiles to add them, change the view and the layout.
   A compact cousin of the Series Explorer chart: same data (Store.view), same chart (Kit.lineChart); settings are remembered in this browser. */
(function () {
'use strict';
const { h, clear, fmt } = Kit;
const Store = Kit.store;
const MAX_SEL = 8, PAL = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];
const PREF_KEY = 'eq-pchart';
const TFS = [['level', 'Level'], ['yoy', '% y/y'], ['rebase', 'Rebased'], ['pct', '% prior'], ['ydiff', 'Δ y/y']];
const RANGES = [['1', '1Y'], ['3', '3Y'], ['5', '5Y'], ['10', '10Y'], ['25', '25Y'], ['all', 'All']];
const STYLES = [['auto', 'Theme default'], ['line', 'Line'], ['area', 'Area'], ['bar', 'Bars'], ['scatter', 'Dots'], ['stackbar', 'Stacked bars'], ['stackarea', 'Stacked area']];
const HEIGHTS = { s: 200, m: 290, l: 400 };
const DEFAULTS = { tf: 'level', range: '10', fromYear: '', style: 'auto', layout: 'auto', cols: '1', height: 'm', log: false, open: false };
const extra = new Map();                                                           // items that are not in the Store (derived tiles), registered by the Pulse tab

function loadPrefs() {
  try {
    const sv = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'), p = Object.assign({}, DEFAULTS, sv);
    if (sv.v !== 2) p.style = 'auto';                                              // before the Theme panel the style defaulted to 'line'; now it follows the theme unless chosen here
    p.v = 2; return p;
  } catch (e) { return Object.assign({}, DEFAULTS, { v: 2 }); }
}
function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* private window: the settings just are not remembered */ } }
const itemOf = k => Store.byKey.get(k) || extra.get(k);
const names = new Map();                                                           // short names for series that come from a Pulse tile
function register(it, label) { if (!it) return it; if (!Store.byKey.has(it.key)) extra.set(it.key, it); if (label) names.set(it.key, label); return it; }
const nameOf = it => names.get(it.key) || Store.shortName(it);

function unitKeyOf(it, tf) { return Store.unitKey(it, tf) || ('~' + tf.split(':')[0]); }
function axisFor(it, tf, firstKey, manual, stack, axisMap) {
  if (stack) return 'l';
  if (manual) return axisMap[it.key] === 'r' ? 'r' : 'l';
  return unitKeyOf(it, tf) === firstKey ? 'l' : 'r';
}

// find series by words (all words must appear); best matches first
function search(q, limit) {
  const toks = (q.toLowerCase().match(/"[^"]+"|\S+/g) || []).map(t => t.replace(/^"|"$/g, '')).filter(Boolean);
  if (!toks.length) return [];
  const out = [];
  for (const it of Store.all) {
    let ok = true; for (const t of toks) if (it.hay.indexOf(t) < 0) { ok = false; break; }
    if (!ok) continue;
    const nm = (Store.shortName(it) + ' ' + (it.label || '')).toLowerCase(); let inName = 0; toks.forEach(t => { if (nm.indexOf(t) >= 0) inName++; });
    out.push({ it, s: (toks.length - inName) * 10000 + (nm.indexOf(toks[0]) === 0 ? 0 : nm.indexOf(toks[0]) > 0 ? 1000 : 2000) + Math.min(999, nm.length) });
    if (out.length > 600) break;
  }
  out.sort((a, b) => a.s - b.s);
  return out.slice(0, limit || 14).map(x => x.it);
}

/* o: { keys: [..], onChange(keys, byUser), suggest(): [{ key, label }], suggestTitle } */
function create(o) {
  o = o || {};
  const P = loadPrefs();
  const st = { sel: [], color: new Map(), axis: {} };
  (o.keys || []).forEach(k => { if (itemOf(k) && st.sel.length < MAX_SEL && st.sel.indexOf(k) < 0) st.sel.push(k); });
  let charts = [], destroyed = false;
  const root = h('div', { class: 'card pchart' });
  const changed = (byUser) => { if (o.onChange) o.onChange(st.sel.slice(), !!byUser); };
  const pref = (k, v) => { P[k] = v; savePrefs(P); };

  /* ---- series search with a result list */
  const input = h('input', { type: 'search', class: 'pcin', placeholder: 'Search any series to chart — e.g. gold, retail, repo, Gauteng…', 'aria-label': 'Search series to chart', autocomplete: 'off' });
  const drop = h('div', { class: 'pcdrop', hidden: true, role: 'listbox' });
  let hits = [], hi = -1, qTimer = null;
  const closeDrop = () => { drop.hidden = true; hi = -1; };
  const markHi = () => { Array.from(drop.children).forEach((c, i) => c.classList.toggle('hi', i === hi)); const c = drop.children[hi]; if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest' }); };
  function paintDrop() {
    clear(drop);
    if (!hits.length) { drop.appendChild(h('div', { class: 'pcnone', text: input.value.trim() ? 'No series match.' : '' })); drop.hidden = !input.value.trim(); return; }
    hits.forEach((it, i) => {
      const on = st.sel.indexOf(it.key) >= 0;
      drop.appendChild(h('div', { class: 'pchit' + (on ? ' on' : ''), role: 'option', onmousedown: e => { e.preventDefault(); pick(it.key); } },
        h('div', { class: 't', text: nameOf(it) }),
        h('div', { class: 'sm', text: it.pubShort + ' · ' + it.unit + ' · latest ' + fmt.num(it.last) + ' (' + fmt.period(it.lastP) + ')' + (on ? ' · on the chart' : '') })));
    });
    drop.hidden = false;
  }
  function pick(k) { toggle(k, true); input.value = ''; hits = []; closeDrop(); }
  input.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { hits = search(input.value, 14); hi = hits.length ? 0 : -1; paintDrop(); markHi(); }, 100); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); hi = (hi + 1) % hits.length; markHi(); }
    else if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); hi = (hi - 1 + hits.length) % hits.length; markHi(); }
    else if (e.key === 'Enter' && hits[hi]) { e.preventDefault(); pick(hits[hi].key); }
    else if (e.key === 'Escape') { input.value = ''; hits = []; closeDrop(); }
  });
  input.addEventListener('blur', () => setTimeout(closeDrop, 120));
  input.addEventListener('focus', () => { if (input.value.trim()) { hits = search(input.value, 14); paintDrop(); } });

  const head = h('div', { class: 'card-head' }, h('h3', { text: 'Chart' }), h('div', { class: 'sub', text: 'Click a tile or search for any series. Up to ' + MAX_SEL + '.' }));
  const toolsEl = h('div', { class: 'tools' });
  head.appendChild(toolsEl);
  const searchWrap = h('div', { class: 'pcsearch' }, input, drop);
  const suggestEl = h('div', { class: 'pcsug' });
  const rowsEl = h('div', { class: 'serrows pcrows' });
  const barEl = h('div', { class: 'filters pcbar' });
  const setEl = h('div', { class: 'pcset', hidden: !P.open });
  const plot = h('div', { class: 'pcplot' });
  root.appendChild(head); root.appendChild(searchWrap); root.appendChild(suggestEl); root.appendChild(rowsEl); root.appendChild(barEl); root.appendChild(setEl); root.appendChild(plot);

  /* ---- selection */
  function assignColors() {
    st.color.forEach((_, k) => { if (st.sel.indexOf(k) < 0) st.color.delete(k); });
    st.sel.forEach(k => { if (st.color.has(k)) return; const used = new Set(st.color.values()); let c = 0; while (used.has(c)) c++; st.color.set(k, c); });
  }
  function toggle(k, byUser) {
    const i = st.sel.indexOf(k);
    if (i >= 0) { st.sel.splice(i, 1); delete st.axis[k]; }
    else { if (!itemOf(k)) return; if (st.sel.length >= MAX_SEL) { Kit.toast('Maximum ' + MAX_SEL + ' series: remove one first'); return; } st.sel.push(k); }
    assignColors(); render(); changed(byUser !== false);
  }
  function setKeys(keys, byUser) {
    st.sel = []; st.axis = {};
    (keys || []).forEach(k => { if (itemOf(k) && st.sel.length < MAX_SEL && st.sel.indexOf(k) < 0) st.sel.push(k); });
    assignColors(); render(); changed(!!byUser);
  }
  function addMany(keys) {
    keys.forEach(k => { if (st.sel.indexOf(k) < 0 && st.sel.length < MAX_SEL && itemOf(k)) st.sel.push(k); });
    assignColors(); render(); changed(true);
  }

  /* ---- the settings bar and the layout panel */
  function seg(opts, value, fn) { return Kit.segmented(opts.map(([v, l]) => ({ v, label: l })), value, fn); }
  function paintBar() {
    clear(barEl);
    barEl.appendChild(h('label', { class: 'lbl', text: 'View' }));
    barEl.appendChild(seg(TFS, P.tf, v => { pref('tf', v); render(); }));
    barEl.appendChild(seg(RANGES, P.fromYear ? '' : P.range, v => { P.fromYear = ''; pref('range', v); render(); }));
    barEl.appendChild(h('button', { type: 'button', class: 'small' + (P.open ? ' on' : ''), 'aria-expanded': String(!!P.open), title: 'Chart style, axes, columns, height, log scale', text: '⚙ Layout', onclick: () => { pref('open', !P.open); setEl.hidden = !P.open; paintBar(); } }));
  }
  function paintSettings() {
    clear(setEl);
    const field = (label, ctl) => h('label', { class: 'pcfield' }, h('span', { class: 'lbl', text: label }), ctl);
    const sty = h('select', { 'aria-label': 'Chart style' }, STYLES.map(([v, l]) => h('option', { value: v, text: l, selected: P.style === v ? '' : null })));
    sty.value = P.style; sty.addEventListener('change', () => { pref('style', sty.value); render(); });
    const lay = seg([['auto', 'Auto'], ['overlay', 'One axis'], ['separate', 'Separate']], P.layout, v => { pref('layout', v); render(); });
    lay.title = 'Auto: two units share a left and right axis, more get a chart each. One axis: everything on one scale. Separate: one small chart per series.';
    const cols = seg([['1', '1'], ['2', '2'], ['3', '3']], P.cols, v => { pref('cols', v); render(); });
    const hgt = seg([['s', 'Short'], ['m', 'Medium'], ['l', 'Tall']], P.height, v => { pref('height', v); render(); });
    const log = h('input', { type: 'checkbox' }); log.checked = !!P.log; log.addEventListener('change', () => { pref('log', log.checked); render(); });
    const yr = h('input', { type: 'number', min: '1950', max: '2100', placeholder: 'e.g. 2008', style: 'width:84px', value: P.fromYear, 'aria-label': 'Start year' });
    yr.addEventListener('change', () => { pref('fromYear', yr.value); paintBar(); render(); });
    setEl.appendChild(field('Style', sty)); setEl.appendChild(field('Axes', lay)); setEl.appendChild(field('Charts per row', cols)); setEl.appendChild(field('Height', hgt));
    setEl.appendChild(field('Start year', yr)); setEl.appendChild(h('label', { class: 'pcfield' }, log, h('span', { text: ' Log scale (level / rebased)' })));
    setEl.appendChild(h('button', { type: 'button', class: 'small ghost', text: 'Reset layout', onclick: () => { Object.assign(P, DEFAULTS, { open: true }); savePrefs(P); paintBar(); paintSettings(); render(); } }));
  }

  /* ---- chosen series and the quick picks */
  function paintRows(items) {
    clear(rowsEl);
    items.forEach(it => {
      const pp = it.yoyKind === 'pp', ax = st.axis[it.key] === 'r', tab = (Store.pub(it.pub) || {}).tab || 'data';
      const axb = items.length > 1 && P.style.indexOf('stack') < 0 ? h('button', { type: 'button', class: 'axtag' + (ax ? ' on' : ''), title: ax ? 'On the right axis. Click to move to the left axis' : 'On the left axis. Click to move to the right axis', text: ax ? 'R' : 'L', onclick: () => { if (ax) delete st.axis[it.key]; else st.axis[it.key] = 'r'; if (P.layout === 'separate') pref('layout', 'auto'); render(); } }) : null;
      rowsEl.appendChild(h('div', { class: 'serrow' },
        h('span', { class: 'key', style: 'background:' + PAL[st.color.get(it.key) || 0] }),
        h('span', { class: 'nm', title: it.pubShort + ': ' + it.label, text: nameOf(it) }),
        h('span', { class: 'pcnum', title: 'Latest value (' + fmt.period(it.lastP) + ')', text: fmt.num(it.last) }),
        h('span', { class: 'pcyoy', title: 'Change on a year earlier', text: it.yoy == null ? '' : fmt.signed(it.yoy, 1, pp ? ' pp' : '%') }),
        axb,
        h('a', { class: 'pcopen', href: '#/' + tab, title: 'Open ' + it.pubShort + ' in its tab', 'aria-label': 'Open ' + it.pubShort, text: '↗' }),
        h('button', { type: 'button', class: 'x', 'aria-label': 'Remove ' + it.label, text: '×', onclick: () => toggle(it.key, true) })));
    });
  }
  function paintSuggest() {
    clear(suggestEl);
    const list = (o.suggest ? o.suggest() : []).filter(s => itemOf(s.key));
    if (!list.length) return;
    suggestEl.appendChild(h('span', { class: 'lbl', text: o.suggestTitle || 'Quick picks' }));
    list.slice(0, 14).forEach(s => {
      const on = st.sel.indexOf(s.key) >= 0;
      suggestEl.appendChild(h('button', { type: 'button', class: 'pcchip' + (on ? ' on' : ''), 'aria-pressed': String(on), title: on ? 'Remove from the chart' : 'Add to the chart', text: s.label, onclick: () => toggle(s.key, true) }));
    });
    suggestEl.appendChild(h('button', { type: 'button', class: 'minibtn', text: 'Chart these (' + Math.min(MAX_SEL, list.length) + ')', title: 'Replace the chart with these indicators', onclick: () => { setKeys(list.slice(0, MAX_SEL).map(s => s.key), true); } }));
  }
  function paintTools(items) {
    clear(toolsEl);
    if (!items.length) return;
    toolsEl.appendChild(h('button', { type: 'button', class: 'small', text: 'CSV', title: 'Download the levels, full history', onclick: () => exportCsv(items) }));
    const p = new URLSearchParams(); p.set('sel', st.sel.join(',')); if (P.tf !== 'level') p.set('tf', P.tf); if (P.fromYear) p.set('from', P.fromYear); else if (P.range !== '10') p.set('r', P.range); if (P.style !== 'line') p.set('sty', P.style);
    const real = st.sel.every(k => Store.byKey.has(k));
    if (real) toolsEl.appendChild(h('a', { class: 'btn small', href: '#/explorer?' + p.toString(), title: 'Open these series in the Series Explorer (formulas, per-series views)', text: 'Explorer ↗' }));
    toolsEl.appendChild(h('button', { type: 'button', class: 'small ghost', text: 'Clear', onclick: () => { st.sel = []; st.axis = {}; assignColors(); render(); changed(true); } }));
  }
  function exportCsv(items) {
    const periods = new Map();
    items.forEach(it => { const X = Store.pubX[it.pub]; it.v.forEach((v, i) => { periods.set(it.periods[it.s + i], X[it.s + i]); }); });
    const keys = Array.from(periods.entries()).sort((a, b) => a[1] - b[1]).map(e => e[0]);
    const maps = items.map(it => { const m = new Map(); it.v.forEach((v, i) => m.set(it.periods[it.s + i], v)); return m; });
    const lines = [['Period'].concat(items.map(it => it.pub + ':' + it.id + ' | ' + it.label + ' | ' + it.unit + ' | ' + it.adj)).map(Kit.csvCell).join(',')];
    keys.forEach(p => lines.push([p].concat(maps.map(m => m.has(p) ? m.get(p) : '')).map(Kit.csvCell).join(',')));
    Kit.download('sa-pulse-chart.csv', '﻿' + lines.join('\r\n') + '\r\n');
  }

  /* ---- the chart itself */
  function rangeX(items) {
    let x1 = -Infinity, x0all = Infinity;
    items.forEach(it => { const X = Store.pubX[it.pub]; x1 = Math.max(x1, X[it.s + it.n - 1]); x0all = Math.min(x0all, X[it.s]); });
    let x0 = x0all;
    if (P.fromYear && +P.fromYear > 1900) x0 = Math.max(x0all, +P.fromYear);
    else if (P.range !== 'all') x0 = Math.max(x0all, x1 - (+P.range));
    return [x0, x1];
  }
  function render() {
    if (destroyed) return;
    charts.forEach(c => c.destroy()); charts = []; clear(plot);
    const items = st.sel.map(itemOf).filter(Boolean);
    paintBar(); paintSettings(); paintRows(items); paintSuggest(); paintTools(items);
    if (!items.length) { plot.appendChild(h('div', { class: 'empty', text: 'Nothing on the chart yet. Click a tile, pick a quick pick above, or search for a series.' })); return; }
    const tf = P.tf, stack = P.style === 'stackbar' || P.style === 'stackarea';
    const [x0, x1] = rangeX(items);
    const views = items.map(it => ({ it, v: Store.view(it, tf, x0, x1) }));
    const ukeys = new Set(items.map(it => unitKeyOf(it, tf)));
    const manual = Object.keys(st.axis).length > 0 && !stack;
    const separate = items.length > 1 && (P.layout === 'separate' || (P.layout === 'auto' && !manual && ukeys.size > 2));
    const growth = tf === 'pct' || tf === 'yoy', zero = growth || tf === 'ydiff', ref = tf === 'rebase' ? 100 : null;
    const valFmt = v => growth ? fmt.signed(v, 2, '%') : tf === 'rebase' ? fmt.fixed(v, 1) : fmt.num(v);
    const H = HEIGHTS[P.height] || HEIGHTS.m, logOn = !!P.log && (tf === 'level' || tf === 'rebase') && !stack;
    if (items.length > 1 && ukeys.size > 1 && P.layout === 'overlay') plot.appendChild(h('div', { class: 'note', text: 'These series use different units, so one shared axis can mislead. Use Auto for left and right axes, or % y/y or Rebased.' }));
    if (separate && P.layout === 'auto') plot.appendChild(h('div', { class: 'note', text: 'More than two different units, so one chart per series. Switch to % y/y or Rebased to overlay them, or tag series L / R and use Axes: One axis.' }));
    const sty = P.style, styOpt = sty === 'auto' ? undefined : sty, fill = sty === 'line' || (sty === 'auto' && Kit.gfx.cur.style === 'auto');
    const ttl = items.length <= 3 ? items.map(nameOf).join(', ') : items.length + ' series';
    if (!separate) {
      const first = unitKeyOf(items[0], tf), host = h('div'); plot.appendChild(host);
      const rIt = views.find(({ it }) => axisFor(it, tf, first, manual, stack, st.axis) === 'r');
      host.appendChild(h('div', { class: 'sub', style: 'margin:4px 0 0', text: ukeys.size > 1 ? 'Left axis: ' + Store.unitLabel(items[0], tf) + (rIt ? '   ·   Right axis: ' + Store.unitLabel(rIt.it, tf) : '') : Store.unitLabel(items[0], tf) }));
      const series = views.map(({ it, v }) => ({ key: it.key, name: nameOf(it), color: PAL[st.color.get(it.key) || 0], xs: v.xs, vs: v.vs, ps: v.ps, tf, axis: stack ? 'l' : axisFor(it, tf, first, manual, stack, st.axis) }));
      charts.push(Kit.lineChart(host, { series, height: H, x0, x1, zero, ref, log: logOn, single: items.length === 1, area: items.length === 1 && fill, style: styOpt, label: 'Chart of ' + items.map(i => i.label).join('; '), valFmt, title: ttl, source: Kit.sourceOf(items.map(i => i.pub)), sub: (ukeys.size > 1 ? 'Left axis: ' + Store.unitLabel(items[0], tf) + (rIt ? ' · Right axis: ' + Store.unitLabel(rIt.it, tf) : '') : Store.unitLabel(items[0], tf)) }));
    } else {
      const grid = h('div', { class: 'pcgrid', style: 'grid-template-columns:repeat(' + (+P.cols || 1) + ',minmax(0,1fr))' }); plot.appendChild(grid);
      views.forEach(({ it, v }) => {
        const cell = h('div', { class: 'cell' }, h('h4', {}, h('span', { class: 'key', style: 'width:16px;height:2px;flex:none;background:' + PAL[st.color.get(it.key) || 0] }), h('span', { class: 't', title: it.label, text: nameOf(it) })), h('div', { class: 'u', text: Store.unitLabel(it, tf) }));
        grid.appendChild(cell);
        charts.push(Kit.lineChart(cell, { series: [{ key: it.key, name: nameOf(it), color: PAL[st.color.get(it.key) || 0], xs: v.xs, vs: v.vs, ps: v.ps, tf }], height: Math.round(H * 0.72), x0, x1, zero, ref, log: logOn, single: true, area: fill, style: sty === 'stackbar' ? 'bar' : sty === 'stackarea' ? 'area' : styOpt, tickCount: 4, label: it.label, valFmt, title: it.label, source: Kit.sourceOf([it.pub]), sub: Store.unitLabel(it, tf) }));
      });
    }
  }
  const onTheme = () => charts.forEach(c => c.redraw && c.redraw());
  document.addEventListener('themechange', onTheme);
  assignColors(); render();
  return {
    el: root,
    keys: () => st.sel.slice(),
    has: k => st.sel.indexOf(k) >= 0,
    colorOf: k => st.color.has(k) ? PAL[st.color.get(k)] : null,
    toggle: k => toggle(k, true), setKeys, addMany,
    refresh() { render(); },
    suggestions() { paintSuggest(); },                                                         // the quick picks or the data changed
    destroy() { destroyed = true; document.removeEventListener('themechange', onTheme); charts.forEach(c => c.destroy()); charts = []; },
  };
}
window.PulseChart = { create, register };
})();
