/* appearance.js - the Theme panel: light / dark, page style, series colours (presets or your own) and the look of every graph.
   Colours work by overriding the CSS variables on <html>; the graph look is Kit.gfx (read by every line chart each time it draws).
   Everything is remembered in this browser (localStorage: eq-theme, eq-look, eq-gfx). */
(function () {
'use strict';
const { h, clear } = Kit;
const KEY = 'eq-look';

/* ---- page styles: the surfaces and text colours (the warm paper look is the default and needs no override) */
const PAGES = {
  warm:    { name: 'Warm paper', sw: { light: ['#FFF1E0', '#FFF9F5', '#2a78d6'], dark: ['#0d0d0d', '#1a1a19', '#3987e5'] }, light: null, dark: null },
  neutral: { name: 'Neutral',
    light: { '--page': '#e9e9e6', '--surface-1': '#ffffff', '--ink': '#1a1a1a', '--ink-2': '#505156', '--muted': '#808187', '--grid': '#e1e1de', '--axis': '#c6c6c1', '--border': 'rgba(26,26,26,0.12)', '--shadow': '0 6px 24px rgba(0,0,0,0.14)' },
    dark: { '--page': '#101113', '--surface-1': '#1b1c1f', '--ink': '#ffffff', '--ink-2': '#c4c6cc', '--muted': '#8b8e96', '--grid': '#2a2c30', '--axis': '#3a3d43', '--border': 'rgba(255,255,255,0.10)', '--shadow': '0 6px 24px rgba(0,0,0,0.6)' } },
  cool:    { name: 'Cool slate',
    light: { '--page': '#d3e1f2', '--surface-1': '#f3f8fe', '--ink': '#10203a', '--ink-2': '#3f5675', '--muted': '#6c84a6', '--grid': '#cbdced', '--axis': '#a7c0dc', '--border': 'rgba(16,32,58,0.13)', '--shadow': '0 6px 24px rgba(10,40,90,0.16)', '--accent': '#1f5fbf' },
    dark: { '--page': '#08111f', '--surface-1': '#101c31', '--ink': '#ffffff', '--ink-2': '#b6c6de', '--muted': '#7b8fae', '--grid': '#1d2e4a', '--axis': '#2b4166', '--border': 'rgba(150,190,255,0.14)', '--shadow': '0 6px 24px rgba(0,0,0,0.6)', '--accent': '#5ea0ff' } },
  parchment: { name: 'Parchment',
    light: { '--page': '#e8d9b8', '--surface-1': '#f7efdb', '--ink': '#2b2418', '--ink-2': '#5f5238', '--muted': '#8f7f5e', '--grid': '#e0d0aa', '--axis': '#c4ae7e', '--border': 'rgba(43,36,24,0.16)', '--shadow': '0 6px 24px rgba(70,45,0,0.18)', '--accent': '#9a5b13' },
    dark: { '--page': '#1a140a', '--surface-1': '#2a2112', '--ink': '#fff8e8', '--ink-2': '#d6c8a6', '--muted': '#9d8e6c', '--grid': '#3b3120', '--axis': '#54472d', '--border': 'rgba(255,225,160,0.14)', '--shadow': '0 6px 24px rgba(0,0,0,0.6)', '--accent': '#e0a43e' } },
  mint:    { name: 'Mint',
    light: { '--page': '#cfe9de', '--surface-1': '#eef9f3', '--ink': '#0e2a1f', '--ink-2': '#35604f', '--muted': '#678f7e', '--grid': '#c4e2d4', '--axis': '#9cc9b4', '--border': 'rgba(14,42,31,0.14)', '--shadow': '0 6px 24px rgba(0,60,30,0.16)', '--accent': '#17805a' },
    dark: { '--page': '#07150f', '--surface-1': '#0f271c', '--ink': '#ffffff', '--ink-2': '#b3d3c3', '--muted': '#78a08c', '--grid': '#1a3a2b', '--axis': '#285640', '--border': 'rgba(150,255,200,0.13)', '--shadow': '0 6px 24px rgba(0,0,0,0.6)', '--accent': '#3fcf93' } },
  lavender: { name: 'Lavender',
    light: { '--page': '#e0d6f3', '--surface-1': '#f6f2fe', '--ink': '#1d1632', '--ink-2': '#493f6c', '--muted': '#7a6fa0', '--grid': '#d8cdee', '--axis': '#b6a6dc', '--border': 'rgba(29,22,50,0.14)', '--shadow': '0 6px 24px rgba(40,10,90,0.16)', '--accent': '#6a48c8' },
    dark: { '--page': '#120d24', '--surface-1': '#1d1736', '--ink': '#ffffff', '--ink-2': '#c6bfe2', '--muted': '#8f86b3', '--grid': '#2c2450', '--axis': '#403670', '--border': 'rgba(200,180,255,0.14)', '--shadow': '0 6px 24px rgba(0,0,0,0.6)', '--accent': '#a98cf5' } },
  contrast: { name: 'High contrast',
    light: { '--page': '#ffffff', '--surface-1': '#ffffff', '--ink': '#000000', '--ink-2': '#1c1c1c', '--muted': '#404040', '--grid': '#bdbdbd', '--axis': '#000000', '--border': '#000000', '--shadow': '0 0 0 2px #000', '--accent': '#0033cc', '--wash': 'rgba(0,51,204,0.12)' },
    dark: { '--page': '#000000', '--surface-1': '#000000', '--ink': '#ffffff', '--ink-2': '#f2f2f2', '--muted': '#cfcfcf', '--grid': '#4a4a4a', '--axis': '#ffffff', '--border': '#ffffff', '--shadow': '0 0 0 2px #fff', '--accent': '#ffd400', '--wash': 'rgba(255,212,0,0.16)' } },
};
for (const k of Object.keys(PAGES)) {                               // the swatches show the page, the card and the accent as they look in the current mode
  const P = PAGES[k]; if (!P.sw) P.sw = { light: [P.light['--page'], P.light['--surface-1'], P.light['--accent'] || '#2a78d6'], dark: [P.dark['--page'], P.dark['--surface-1'], P.dark['--accent'] || '#3987e5'] };
}
/* ---- series palettes. Every preset passed the data-viz palette checks (lightness band, chroma, colour-blind separation, neighbour distance) in both light and dark.
   up / down = which slots mean "rising" and "falling" in the heat colours. */
const PALS = {
  classic: { name: 'Classic', light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'], dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'], up: 0, down: 7, stock: true },
  cb:      { name: 'Colour-blind safe', light: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#6A51A3', '#00A5A5', '#D55E00'], dark: ['#0072B2', '#c0850d', '#009E73', '#c673a1', '#3c9cd0', '#6A51A3', '#00A5A5', '#D55E00'], up: 0, down: 7 },
  berry:   { name: 'Berry', light: ['#b9498e', '#6faa18', '#4e98e8', '#24cf99', '#c99d19', '#03759f', '#990f36', '#859003'], dark: ['#c8589d', '#64990d', '#4989d1', '#15ac7a', '#a38306', '#03759f', '#dd6872', '#949a0f'], up: 2, down: 6 },
  coral:   { name: 'Coral', light: ['#c74844', '#14ae8a', '#9883e3', '#21c7d6', '#8bb34b', '#4b5cd1', '#7e3f09', '#19a05e'], dark: ['#d75853', '#0f9e7c', '#8a76cc', '#0ea6b0', '#639915', '#4b5cd1', '#d37727', '#28ad5f'], up: 5, down: 0 },
  dune:    { name: 'Dune', light: ['#837c0b', '#2a99fc', '#dd6c7e', '#a9a5fc', '#10b8ca', '#b32f75', '#346004', '#1792c8'], dark: ['#938a03', '#0e8ae9', '#c76370', '#8784e6', '#0098ab', '#b32f75', '#65a647', '#129fd5'], up: 1, down: 2 },
  lagoon:  { name: 'Lagoon', light: ['#8e7811', '#189fe8', '#da6c8e', '#9caafc', '#08babe', '#ac3387', '#475b07', '#1395ba'], dark: ['#9e850d', '#0b90d2', '#c4627f', '#768ae9', '#1499a0', '#ac3387', '#7aa232', '#13a2c6'], up: 1, down: 2 },
};
const GFX_NAMES = { classic: 'Classic', minimal: 'Minimal', filled: 'Filled', columns: 'Columns', presentation: 'Presentation', compact: 'Compact', soft: 'Soft', bold: 'Bold', blueprint: 'Blueprint' };
// display settings: attribute on <html> (read by the stylesheet) and the default each starts at
const DISPLAY = { dens: ['comfortable', 'compact'], round: ['std', 'sharp', 'round'], size: ['m', 's', 'l', 'xl'], head: ['serif', 'sans'], heat: ['std', 'soft', 'strong'] };
const HEAT = { soft: 0.6, std: 1, strong: 1.5 };
const VARS = ['--page', '--surface-1', '--ink', '--ink-2', '--muted', '--grid', '--axis', '--border', '--shadow', '--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8', '--accent', '--wash', '--up', '--down'];
const CUSTOM0 = PALS.classic.light.slice();

let st = { mode: 'auto', page: 'warm', pal: 'classic', custom: CUSTOM0.slice(), dens: 'comfortable', round: 'std', size: 'm', head: 'serif', heat: 'std' };
try { const sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) st = Object.assign(st, sv); } catch (e) {}
try { const m = localStorage.getItem('eq-theme'); if (m === 'light' || m === 'dark') st.mode = m; } catch (e) {}
if (!PAGES[st.page]) st.page = 'warm';
if (st.pal !== 'custom' && !PALS[st.pal]) st.pal = 'classic';
Object.keys(DISPLAY).forEach(k => { if (DISPLAY[k].indexOf(st[k]) < 0) st[k] = DISPLAY[k][0]; });
if (!Array.isArray(st.custom) || st.custom.length !== 8) st.custom = CUSTOM0.slice();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ page: st.page, pal: st.pal, custom: st.custom, dens: st.dens, round: st.round, size: st.size, head: st.head, heat: st.heat })); if (st.mode === 'auto') localStorage.removeItem('eq-theme'); else localStorage.setItem('eq-theme', st.mode); } catch (e) {} };

const isDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); };
function colours(pal, dark) { return pal === 'custom' ? st.custom : PALS[pal][dark ? 'dark' : 'light']; }

function apply(notify) {
  const root = document.documentElement, sty = root.style, dark = isDark();
  if (st.mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', st.mode);
  VARS.forEach(v => sty.removeProperty(v));
  Object.keys(DISPLAY).forEach(k => { if (st[k] === DISPLAY[k][0]) root.removeAttribute('data-' + k); else root.setAttribute('data-' + k, st[k]); });
  Kit.look.heat = HEAT[st.heat] || 1;
  const pg = PAGES[st.page][isDark() ? 'dark' : 'light'];
  if (st.page === 'warm') root.removeAttribute('data-page'); else root.setAttribute('data-page', st.page);
  if (pg) Object.keys(pg).forEach(k => sty.setProperty(k, pg[k]));
  if (st.pal !== 'classic') {
    const cs = colours(st.pal, isDark()), P = st.pal === 'custom' ? { up: 0, down: 7 } : PALS[st.pal];
    cs.forEach((c, i) => sty.setProperty('--c' + (i + 1), c));
    sty.setProperty('--accent', cs[P.up]); sty.setProperty('--up', cs[P.up]); sty.setProperty('--down', cs[P.down]);
    sty.setProperty('--wash', 'color-mix(in srgb, ' + cs[P.up] + ' 10%, transparent)');
  }
  if (notify) document.dispatchEvent(new CustomEvent('themechange'));
}

/* ---- how alike are two neighbouring colours? (OKLab distance x100; the data-viz checks want 15+ for people with normal colour vision) */
function lab(hex) {
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const r = f(parseInt(hex.slice(1, 3), 16)), g = f(parseInt(hex.slice(3, 5), 16)), b = f(parseInt(hex.slice(5, 7), 16));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const dE = (a, b) => { const x = lab(a), y = lab(b); return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
function worstNeighbour(cs) { let w = Infinity, at = 0; for (let i = 1; i < cs.length; i++) { const d = dE(cs[i - 1], cs[i]); if (d < w) { w = d; at = i; } } return { d: w, at }; }

/* ---- the panel */
let panel = null, btn = null;
const seg = (opts, value, fn) => Kit.segmented(opts.map(([v, l, t]) => ({ v, label: l, title: t })), value, fn);
const sec = (title, sub) => h('div', { class: 'lkhead' }, h('b', { text: title }), sub ? h('span', { text: sub }) : null);

function preview(kind, name) {                                  // a tiny picture of what the preset does to a chart
  const s = Kit.s, svg = s('svg', { viewBox: '0 0 72 40', width: 72, height: 40, 'aria-hidden': 'true' });
  const pts = [8, 14, 10, 20, 17, 24, 21, 30, 27, 33].map((v, i) => [4 + i * 7, 36 - v]);
  const G = Kit.gfx.presets[name];
  if (G.grid !== 'none') [12, 22, 32].forEach(y => svg.appendChild(s('line', { x1: 3, x2: 69, y1: y, y2: y, stroke: 'var(--grid)', 'stroke-width': 1 })));
  if (G.grid === 'hv') [18, 36, 54].forEach(x => svg.appendChild(s('line', { x1: x, x2: x, y1: 4, y2: 36, stroke: 'var(--grid)', 'stroke-width': 1 })));
  if (G.style === 'bar') pts.forEach(p => svg.appendChild(s('rect', { x: p[0] - 2.5, y: p[1], width: 5, height: 37 - p[1], fill: 'var(--c1)' })));
  else {
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join('');
    if (G.style === 'area') svg.appendChild(s('path', { d: d + 'L' + pts[pts.length - 1][0] + ' 37L' + pts[0][0] + ' 37Z', fill: 'var(--c1)', 'fill-opacity': 0.18 }));
    svg.appendChild(s('path', { d, fill: 'none', stroke: 'var(--c1)', 'stroke-width': Math.min(3.4, G.lineW), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    if (G.dots === 'all') pts.forEach(p => svg.appendChild(s('circle', { cx: p[0], cy: p[1], r: 1.8, fill: 'var(--c1)' })));
    else if (G.dots === 'last') svg.appendChild(s('circle', { cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 2.6, fill: 'var(--c1)' }));
  }
  return svg;
}

function paint() {
  if (!panel) return;
  const dark = isDark(), G = Kit.gfx.cur;
  clear(panel);
  panel.appendChild(h('div', { class: 'lktop' }, h('b', { text: 'Theme' }), h('span', { class: 'grow' }), h('button', { type: 'button', class: 'small ghost', text: 'Reset all', title: 'Back to the standard look', onclick: () => { st.page = 'warm'; st.pal = 'classic'; st.custom = CUSTOM0.slice(); Object.keys(DISPLAY).forEach(k => { st[k] = DISPLAY[k][0]; }); Kit.gfx.cur.preset = 'classic'; Object.assign(Kit.gfx.cur, Kit.gfx.presets.classic); Kit.gfx.save(); save(); apply(true); paint(); } }),
    h('button', { type: 'button', class: 'x', 'aria-label': 'Close', text: '×', onclick: close })));

  panel.appendChild(sec('Light or dark'));
  panel.appendChild(seg([['auto', 'Automatic', 'Follow the device setting'], ['light', 'Light'], ['dark', 'Dark']], st.mode, v => { st.mode = v; save(); apply(true); paint(); }));

  panel.appendChild(sec('Display', 'Spacing, corners, text and colour strength'));
  const disp = h('div', { class: 'lkfine' });
  const drow = (label, key, opts) => disp.appendChild(h('label', { class: 'lkrow' }, h('span', { text: label }), seg(opts, st[key], v => { st[key] = v; save(); apply(true); paint(); })));
  drow('Spacing', 'dens', [['comfortable', 'Comfortable'], ['compact', 'Compact']]);
  drow('Corners', 'round', [['sharp', 'Sharp'], ['std', 'Standard'], ['round', 'Round']]);
  drow('Text size', 'size', [['s', 'Small'], ['m', 'Standard'], ['l', 'Large'], ['xl', 'Extra']]);
  drow('Headings', 'head', [['serif', 'Serif'], ['sans', 'Sans']]);
  drow('Heat colours', 'heat', [['soft', 'Soft'], ['std', 'Standard'], ['strong', 'Strong']]);
  panel.appendChild(disp);
  panel.appendChild(sec('Page style', 'Backgrounds and text'));
  const pages = h('div', { class: 'lkcards' });
  Object.keys(PAGES).forEach(k => pages.appendChild(h('button', { type: 'button', class: 'lkcard' + (st.page === k ? ' on' : ''), 'aria-pressed': String(st.page === k), onclick: () => { st.page = k; save(); apply(true); paint(); } },
    h('span', { class: 'lksw' }, PAGES[k].sw[dark ? 'dark' : 'light'].map(c => h('i', { style: 'background:' + c }))), h('span', { text: PAGES[k].name }))));
  panel.appendChild(pages);

  panel.appendChild(sec('Series colours', 'Used by every chart, tile and map'));
  const pals = h('div', { class: 'lkpals' });
  Object.keys(PALS).concat(['custom']).forEach(k => {
    const cs = colours(k, dark);
    pals.appendChild(h('button', { type: 'button', class: 'lkpal' + (st.pal === k ? ' on' : ''), 'aria-pressed': String(st.pal === k), title: k === 'custom' ? 'Your own colours' : PALS[k].name, onclick: () => { st.pal = k; save(); apply(true); paint(); } },
      h('span', { class: 'lkstrip' }, cs.map(c => h('i', { style: 'background:' + c }))), h('span', { text: k === 'custom' ? 'Your own' : PALS[k].name })));
  });
  panel.appendChild(pals);
  if (st.pal === 'custom') {
    const row = h('div', { class: 'lkcustom' });
    st.custom.forEach((c, i) => {
      const inp = h('input', { type: 'color', value: c, 'aria-label': 'Colour ' + (i + 1), title: 'Colour ' + (i + 1) + (i === 0 ? ' (also the accent and the "rising" colour)' : i === 7 ? ' (also the "falling" colour)' : '') });
      inp.addEventListener('input', () => { st.custom[i] = inp.value; save(); apply(false); clearTimeout(inp._t); inp._t = setTimeout(() => { document.dispatchEvent(new CustomEvent('themechange')); note(); }, 120); });
      row.appendChild(inp);
    });
    const nt = h('div', { class: 'lknote' });
    const note = () => { const w = worstNeighbour(st.custom); nt.textContent = w.d < 15 ? 'Colours ' + w.at + ' and ' + (w.at + 1) + ' look alike. Charts read best when neighbouring colours differ clearly.' : 'Neighbouring colours are easy to tell apart.'; nt.classList.toggle('warn', w.d < 15); };
    note();
    panel.appendChild(h('div', { class: 'lknote', text: 'Colour 1 is also the accent and the "rising" colour; colour 8 is the "falling" colour. The same colours are used in light and dark.' }));
    panel.appendChild(row); panel.appendChild(nt);
    panel.appendChild(h('button', { type: 'button', class: 'small', text: 'Start from the current preset', onclick: () => { st.custom = colours(st.pal === 'custom' ? 'classic' : st.pal, dark).slice(); save(); apply(true); paint(); } }));
  }

  panel.appendChild(sec('Graph layout themes', 'How every line chart is drawn'));
  const gcards = h('div', { class: 'lkcards g' });
  Object.keys(Kit.gfx.presets).forEach(k => gcards.appendChild(h('button', { type: 'button', class: 'lkcard' + (G.preset === k ? ' on' : ''), 'aria-pressed': String(G.preset === k), onclick: () => { Kit.gfx.usePreset(k); paint(); } }, preview('p', k), h('span', { text: GFX_NAMES[k] }))));
  panel.appendChild(gcards);
  if (G.preset === 'custom') panel.appendChild(h('div', { class: 'lknote', text: 'Custom graph layout (adjusted below).' }));
  const fine = h('div', { class: 'lkfine' });
  const row = (label, ctl) => fine.appendChild(h('label', { class: 'lkrow' }, h('span', { text: label }), ctl));
  row('Chart type', seg([['auto', 'As designed'], ['line', 'Line'], ['area', 'Area'], ['bar', 'Bars']], G.style, v => { Kit.gfx.set({ style: v }); paint(); }));
  row('Line weight', seg([[1.5, 'Thin'], [2, 'Normal'], [3.5, 'Bold']].map(([v, l]) => [String(v), l]), String(G.lineW), v => { Kit.gfx.set({ lineW: +v }); paint(); }));
  row('Gridlines', seg([['none', 'None'], ['h', 'Horizontal'], ['hv', 'Grid']], G.grid, v => { Kit.gfx.set({ grid: v }); paint(); }));
  row('Points', seg([['last', 'Latest'], ['all', 'All'], ['none', 'None']], G.dots, v => { Kit.gfx.set({ dots: v }); paint(); }));
  row('Chart height', seg([['0.78', 'Compact'], ['1', 'Standard'], ['1.25', 'Tall']], String(G.size === 0.95 ? 1 : G.size), v => { Kit.gfx.set({ size: +v }); paint(); }));
  panel.appendChild(fine);
  panel.appendChild(h('div', { class: 'lknote', text: 'The Explorer and the Pulse chart also have their own Style choice; set to a fixed type it overrides "Chart type" here. Weight, gridlines, points and height always follow this theme.' }));
}

function open() {
  if (!panel) {
    panel = h('aside', { class: 'lkpanel', id: 'lookPanel', role: 'dialog', 'aria-label': 'Theme: colours and graph layout' });
    document.body.appendChild(panel);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });
  }
  panel.hidden = false; paint(); if (btn) btn.setAttribute('aria-expanded', 'true');
}
function close() { if (panel) panel.hidden = true; if (btn) { btn.setAttribute('aria-expanded', 'false'); } }

Kit.appearance = {
  init(button) {
    btn = button; btn.title = 'Colours and graph layout'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => { if (panel && !panel.hidden) close(); else open(); });
    if (window.matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); const f = () => { if (st.mode === 'auto') apply(true); }; if (mq.addEventListener) mq.addEventListener('change', f); }
  },
  open, close, apply,
};
Kit.theme.init = Kit.appearance.init;
apply(false);                                                     // before the first paint
})();
