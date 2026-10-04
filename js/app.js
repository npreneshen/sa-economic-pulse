/* app.js - shell: tabs, hash router, placeholder tabs (publication overview) and boot. */
(function () {
'use strict';
const { h, clear, fmt } = Kit;

const TABS = [
  { id: 'pulse',       label: 'Pulse',                  tabs: null,          built: true, create: () => Pulse.create() },
  { id: 'economy',     label: 'Economy',                tabs: 'economy',     built: true, create: () => Economy.create() },
  { id: 'markets',     label: 'Money & Markets',        tabs: 'markets',     built: true, create: () => Markets.create() },
  { id: 'resources',   label: 'Resources',              tabs: 'resources',   built: true, create: () => Resources.create() },
  { id: 'industrials', label: 'Industrials',            tabs: 'industrials', built: true, create: () => Industrials.create() },
  { id: 'consumer',    label: 'Consumer',               tabs: 'consumer',    built: true, create: () => Consumer.create() },
  { id: 'property',    label: 'Property & Construction',tabs: 'property',    built: true, create: () => Property.create() },
  { id: 'travel',      label: 'Travel & Leisure',       tabs: 'travel',      built: true, create: () => Travel.create() },
  { id: 'prices',      label: 'Prices',                 tabs: 'prices',      built: true, create: () => Prices.create() },
  { id: 'corporate',   label: 'Corporate',              tabs: 'corporate',   built: true, create: () => Corporate.create() },
  { id: 'explorer',    label: 'Series Explorer',        built: true, create: () => Explorer.create() },
  { id: 'data',        label: 'Data & Update',          tabs: null,          built: true, create: () => DataTab.create() },
];

const TAB_ICON = {                                                   // line icons for the main tabs (24 x 24)
  pulse: 'M3 12h4l3-8 4 16 3-8h4', economy: 'M4 20V11M10 20V4M16 20v-7M22 20H2', markets: 'M3 17l6-6 4 4 8-9M15 6h6v6', resources: 'M2 20l7-12 4 6 3-4 6 10z',
  industrials: 'M3 20V10l6 4v-4l6 4V6h4v14z', consumer: 'M3 4h2.5l2.2 11h10.3L20 7H6.2M9.5 20h.01M17 20h.01', property: 'M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M2 21h20',
  travel: 'M21 3L3 10.5l7 2.5 2.5 7z', prices: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01', corporate: 'M3 8h18v12H3zM9 8V5h6v3M3 13h18',
  explorer: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', data: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
};
function tabIcon(id) {
  const svg = Kit.s('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'tabic' });
  svg.appendChild(Kit.s('path', { d: TAB_ICON[id] || TAB_ICON.economy })); return svg;
}

const view = document.getElementById('view'), nav = document.getElementById('tabs');
let current = null, explorer = null;

function nextRelease(code) {
  const sch = (window.EQ.manifest && window.EQ.manifest.schedule) || [];
  const today = new Date().toISOString().slice(0, 10);
  return sch.filter(r => r.code === code && r.date >= today).sort((a, b) => a.date < b.date ? -1 : 1)[0] || null;
}
function dateText(d) { const [y, m, dd] = d.split('-'); return +dd + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1] + ' ' + y; }

function pubTable(pubs) {
  const cols = [
    { key: 'code', label: 'Code', cls: 'l', sort: p => p.code, render: p => h('span', { class: 'code', text: p.code }) },
    { key: 'name', label: 'Publication', cls: 'l', sort: p => p.short, render: p => h('span', {}, p.short, h('div', { class: 'sm', text: p.name })) },
    { key: 'freq', label: 'Freq', cls: 'l', sort: p => p.freq, render: p => ({ M: 'Monthly', Q: 'Quarterly', A: 'Annual', S: 'Periodic survey' })[p.freq] },
    { key: 'n', label: 'Series', firstDir: -1, sort: p => p.n, render: p => String(p.n) },
    { key: 'last', label: 'Latest data', cls: 'l', sort: p => Kit.time.xOf(p.last), firstDir: -1, render: p => fmt.period(p.last) },
    { key: 'next', label: 'Next release', cls: 'l', sort: p => { const r = nextRelease(p.code); return r ? r.date : null; }, render: p => { const r = nextRelease(p.code); return r ? dateText(r.date) + ' ' + r.time + ' (' + fmt.period(r.period) + ')' : '–'; } },
    { key: 'explore', label: '', nosort: true, render: p => h('a', { href: '#/explorer?pub=' + encodeURIComponent(p.code), text: 'Explore →' }) },
  ];
  const t = Kit.table(cols, { cls: 'pubtable', sortKey: 'code', sortDir: 1 }); t.set(pubs); t.el.style.maxHeight = 'none';
  return t.el;
}

function renderPlaceholder(tab) {
  const pubs = Kit.store.pubs.filter(p => tab.tabs ? p.tab === tab.tabs : true);
  view.appendChild(h('div', { class: 'card' },
    h('h3', { text: tab.label }),
    h('div', { class: 'sub', text: tab.blurb }),
    h('div', { class: 'note' }, 'This tab is next in the build order. The data behind it is already loaded and can be browsed in the ', h('a', { href: '#/explorer', text: 'Series Explorer' }), '.'),
    pubTable(pubs)));
}

function route() {
  const m = /^#\/([a-z]+)/.exec(location.hash);
  const id = m ? m[1] : 'pulse';
  const tab = TABS.find(t => t.id === id) || TABS.find(t => t.id === 'pulse');
  if (current === tab.id && tab.built) return;      // built tabs manage their own hash state
  current = tab.id;
  if (explorer) { explorer.destroy(); explorer = null; }
  clear(view);
  Array.from(nav.children).forEach(a => a.classList.toggle('active', a.dataset.id === tab.id));
  document.title = tab.id === 'pulse' ? 'SA Economic Pulse | South African economy dashboard' : tab.label + ' · SA Economic Pulse';
  if (tab.built) { explorer = tab.create(); view.appendChild(explorer.el); }
  else renderPlaceholder(tab);
  window.scrollTo(0, 0);
}

function boot() {
  Kit.store.build();
  const total = Kit.store.all.length;
  document.getElementById('hdrStat').textContent = total.toLocaleString('en-US') + ' series · ' + Kit.store.pubs.length + ' publications';
  TABS.forEach(t => nav.appendChild(h('a', { href: '#/' + t.id, 'data-id': t.id }, tabIcon(t.id), h('span', { text: t.label }))));
  Kit.theme.init(document.getElementById('themeBtn'));
  window.addEventListener('hashchange', route);
  route();
  if (window.Feeds) Feeds.boot();                                  // live series (rates, FX, money and credit, ...) load in the background; see feeds.js
}
if (!window.EQ || !window.EQ.pubs || !Object.keys(window.EQ.pubs).length) {
  view.appendChild(h('div', { class: 'card' }, h('h3', { text: 'Data not found' }), h('div', { class: 'sub', text: 'The data/ folder did not load. Run tools\\Parse-StatsSA.ps1 to generate it.' })));
} else boot();
})();
