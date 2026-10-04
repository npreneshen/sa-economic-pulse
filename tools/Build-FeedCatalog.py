"""Build-FeedCatalog.py - writes js\\feeds-catalog.js: the list of series the app can read live from the Reserve Bank's public Web API (276 statistical-release and daily series plus the
series behind the IMF-standard (SDDS) tables, the investment position, the CPD rates and the chart sets).
A development-time step (the app itself needs no updater). It combines
  * an inventory of the API's statistical-release and daily series (names, categories, observation spacing) read from a saved copy of the API's data (the SARB dashboard's data file,
    read-only), and
  * the API's own SDDS table lists, CPD rates and a frequency check of every series it adds (a few hundred small requests, about a minute).
    python tools\\Build-FeedCatalog.py [path-to-inventory.js]"""
import json, re, sys, os, collections, urllib.request, datetime
from concurrent.futures import ThreadPoolExecutor

SRC = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\P\Downloads\Dashboards\SARB Dashboard\data\live-data.js'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'js', 'feeds-catalog.js')
API = 'https://custom.resbank.co.za/SarbWebApi'
t = open(SRC, encoding='utf-8-sig').read()
D = json.loads(t[t.index('=') + 1:].strip().rstrip(';'))

def get(path, timeout=90):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(API + path, headers={'Accept': 'application/json'}), timeout=timeout) as r: return json.load(r)
        except Exception as e: err = e
    raise err

# ---------------------------------------------------------------- publication groups. part = the file the history lives in (data/live/<part>.js): small groups share 'core'; the big or rarely used ones load on demand
PUBS = [
 dict(code='MRDMA',  name='Monetary aggregates and credit extension', short='Money & credit', freq='M', part='core'),
 dict(code='CDASA',  name='Credit aggregates, seasonally adjusted', short='Credit (SA)', freq='M', part='core'),
 dict(code='CDACM3', name='Counterparts of M3', short='M3 counterparts', freq='M', part='core'),
 dict(code='CDACSM', name='Credit to households and companies (monthly)', short='Credit detail', freq='M', part='core'),
 dict(code='CDACSQ', name='Credit to households and companies (quarterly)', short='Credit detail (Q)', freq='Q', part='core'),
 dict(code='CDADS',  name='Bank deposits by sector', short='Deposits', freq='M', part='core'),
 dict(code='CDACA',  name='Effect of securitisation on credit', short='Securitisation', freq='M', part='core'),
 dict(code='MRDBM',  name='Banks and mutual banks: balance sheet', short='Banks', freq='M', part='core'),
 dict(code='MRDIE',  name='Exchange rates, gold, reserves and forex turnover', short='FX & reserves', freq='M', part='core'),
 dict(code='MRDCM',  name='Bond and equity markets', short='Capital markets', freq='M', part='core'),
 dict(code='MRDFG',  name='National government cash flow and financing', short='Govt cash flow', freq='M', part='core'),
 dict(code='MRDEI',  name='Business-cycle indicators, production and sales', short='Cycle indicators', freq='M', part='core'),
 dict(code='RATES',  name='Interest rates and bond yields (monthly, from daily data)', short='Rates (monthly)', freq='M', part='core'),
 dict(code='FXD',    name='Exchange rates and gold (monthly, from daily data)', short='FX (monthly)', freq='M', part='core'),
 dict(code='MKTM',   name='Other monthly indicators', short='Other monthly', freq='M', part='core'),
 dict(code='BOPQ',   name='Balance of payments and national accounts ratios (quarterly)', short='Balance of payments', freq='Q', part='core'),
 dict(code='BOPA',   name='Annual ratios', short='Annual ratios', freq='A', part='core'),
 dict(code='RATESD', name='Interest rates and bond yields (daily)', short='Rates (daily)', freq='D', part='rates-daily'),
 dict(code='FXDD',   name='Exchange rates and gold (daily)', short='FX (daily)', freq='D', part='fx-daily'),
]
# groups for the SDDS tables / investment position: one publication per (group, frequency)
SDDS_GROUPS = {
 'NATACC': ('National accounts: GDP and national income', 'National accounts'),
 'ECOIND': ('Economic indicators: surveys, labour market, prices and expectations', 'Economic indicators'),
 'CBSURV': ('Central bank survey (depository corporations)', 'Central bank survey'),
 'BOPD':   ('Balance of payments (detail)', 'BoP detail'),
 'IIP':    ('International investment position', 'Investment position'),
 'GGOPS':  ('General government operations', 'General government'),
 'CGOPS':  ('Central government operations', 'Central government'),
 'CGDEBT': ('Central government debt and budgetary operations', 'Government debt'),
}
FREQ_NAME = {'M': 'monthly', 'Q': 'quarterly', 'A': 'annual'}
PUBF = {p['code']: p['freq'] for p in PUBS}

def step(a, b):
    y1, m1 = map(int, a[:7].split('-')); y2, m2 = map(int, b[:7].split('-')); return (y2 - y1) * 12 + m2 - m1
def spacing(obs):
    if len(obs) < 3: return None
    if len(obs[-1][0]) == 10: return 'D'
    g = collections.Counter(step(obs[i][0], obs[i + 1][0]) for i in range(max(0, len(obs) - 30), len(obs) - 1)).most_common(1)[0][0]
    return {1: 'M', 3: 'Q', 12: 'A'}.get(g)
def classify(rows):
    """Frequency of an API series from its dates: month-end dates a month / quarter / year apart, otherwise daily."""
    ds = sorted({str(r['Period'])[:10] for r in rows if r.get('Value') is not None})
    if len(ds) < 3: return None
    tail = ds[-30:]
    def month_end(d): return (datetime.date.fromisoformat(d) + datetime.timedelta(days=1)).day == 1
    if sum(month_end(d) for d in tail) >= 0.8 * len(tail):                      # tolerate the odd date that is a day off (one series has 29 Nov)
        return {1: 'M', 3: 'Q', 12: 'A'}.get(collections.Counter(step(tail[i], tail[i + 1]) for i in range(len(tail) - 1)).most_common(1)[0][0], 'M')
    return 'D'

def clean(s):
    s = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', str(s or '').replace('&nbsp;', ' ').replace('&nbsp', ' ').replace('--->', '›').replace('->', '›'))).strip()
    return re.sub(r'\s*Please see the statement.*$', '', s, flags=re.I).strip()

def unit_of(name, cat, fmt, code, desc='', pub='', unit_hint=''):
    s = (name + ' ' + cat + ' ' + unit_hint).lower()
    if pub in ('RATES', 'RATESD') or code in ('CMJM004A', 'MMSM001R', 'CPI1000F', 'PPI1000F'): return 'Percentage'
    if re.match(r'^(MON|BAT)', code) and code[-1] in 'PI': return 'Percentage'
    if unit_hint:
        u = unit_hint.lower()
        if 'per cent' in u or u == '%': return 'Percentage'
        if u == 'millions': return 'Million'
        if 'billion' in u: return 'R billion'
        if 'million' in u and 'rand' in u or u == 'r million': return 'R million'
        if 'million' in u and ('us' in u or '$' in u): return 'US$ million'
        if 'rand per' in u or 'per us' in u: return 'Rand'
        if "'000" in u or 'thousand' in u: return 'Thousand'
        if '= 100' in u or 'index' in u: return 'Index'
    if re.search(r'%|percentage|as a % of|as % of|per cent', s): return 'Percentage'
    if code in ('KBP6006S', 'KBP6286L', 'KBP5260J', 'KBP4420J'): return 'Percentage'
    if pub == 'MRDEI' or code.startswith(('EER', 'BOP5396', 'BOP5398')) or 'index' in s: return 'Index'
    if code == 'KBP5381K': return 'Months'
    if code == 'GDPL201D' or code == 'BOP5357M': return 'US$'
    if code == 'GDPL203D' or code == 'BOP5356M': return 'Rand'
    if pub in ('FXD', 'FXDD') or code.startswith('EXC'): return 'Rand' if re.search(r'^(sa )?rand per|^rand per', name.lower()) else 'Exchange rate'
    if 'us $' in s or 'us$' in s: return 'US$ million'
    if 'actual number' in s: return 'Number'
    if 'shares traded (millions)' in s: return 'Million shares'
    return 'R million'

# ---------------------------------------------------------------- curated bits
TIER1 = set('''MMRD002A MMRD000A MMRD403A MMRD203A MMRD851A MMRD855A CMJM004A CMJD004A CMJD003A MMSM001R
EXCB135M EXCZ001M EXCZ002M EXCZ120M BOP5396M BOP5398M BOP5356M BOP5357M BOP5806M BOP5277M
MON0088P MON0100P MON0150P MON0200P MON0300P MON0023P MON0089P MON0075P MON0300A MON0023A MON0075A
KBP5007L KBP5381K KBP5007K KBP5000K KBP5003K KBP6006S CMSM082A CAPM335A
NGFC020M NGFC040M NGFC050M DIFN003A DIFN002A DIFN007A'''.split())
LAST_AGG = set('MMRD002A MMRD000A'.split())                                    # a rate "in force" is the month-end value; everything else daily is a monthly average
DROP = {'BOP5393M', 'BOP5395M'}                                                  # the API returns no observations for these two (the same indexes are carried by BOP5396M / BOP5398M)
HIDE = {'CPI1000F', 'PPI1000F'}                                                 # duplicate the CPI/PPI already held; used only for the cross-check on the Data tab

series, seen = [], {}
def add(e):
    key = (e['p'], e['c'])
    e['id'] = (e['c'] + '|' + e.get('cat', '')) if key in seen else e['c']          # the same code can sit under two categories inside one release
    seen[key] = 1
    series.append(e)

# 1. the statistical releases (monthly / quarterly) ------------------------------------------------------------------------------------------
in_release = set()
for dt, lst in D['monthly'].items():
    for s in lst:
        fr = spacing(s['obs']) or PUBF[dt]
        cat, nm = clean(s['catName']), clean(s['name'])
        e = dict(c=s['code'], p=dt, f=fr, cat=cat, n=nm, u=unit_of(nm, cat, s['fmt'], s['code'], '', dt), d=s['fmt'], dt=dt, a='last', t=1 if s['code'] in TIER1 else 3, cc=s['cat'])
        if s['sub']: e['sub'] = clean(s['sub'])
        add(e); in_release.add(s['code'])

# 2. the codes the dashboard fetches one by one (daily rates and FX, quarterly balance of payments, annual ratios, a few monthly) ------------------
def put_daily(code, nm, desc, fmt_):
    """A daily series appears twice: as a monthly publication (average of the days / month-end; small, used by the Pulse tiles) and as a daily publication."""
    fx = code.startswith(('EXC', 'EER', 'GDPL'))
    pm, pd_ = ('FXD', 'FXDD') if fx else ('RATES', 'RATESD')
    if code.startswith('EXCB'): cm, cd = 'Rand per foreign currency unit (monthly average)', 'Rand per foreign currency unit (daily)'
    elif code.startswith('EXC'): cm, cd = 'Exchange rates (monthly average of daily)', 'Exchange rates (daily)'
    elif code.startswith('EER'): cm, cd = 'Effective exchange rate (monthly average of daily)', 'Effective exchange rate (daily)'
    elif code.startswith('GDPL'): cm, cd = 'London gold price (monthly average of daily)', 'London gold price (daily)'
    else: cm, cd = 'Money-market rates and bond yields (monthly)', 'Money-market rates and bond yields (daily)'
    if code.startswith('GDPL'): nm = 'Gold price in ' + ('US dollars' if nm.startswith('US') else 'rand') + ' (London fixing)'
    if code.startswith('EER'): nm = nm + (' (daily index, 2015=100)' if code == 'EER5504A' else ' (daily index)')
    agg = 'last' if code in LAST_AGG else 'avg'
    add(dict(c=code, p=pm, f='D', cat=cm, n=nm, u=unit_of(nm, cm, fmt_, code, desc, pm), d=fmt_, dt=None, a=agg, t=1 if code in TIER1 else 3, desc=desc))
    add(dict(c=code, p=pd_, f='D', dv=1, cat=cd, n=nm, u=unit_of(nm, cd, fmt_, code, desc, pd_), d=fmt_, dt=None, a=agg, t=3, desc=desc))

for code, s in D['daily'].items():
    obs = s['obs']; fr = spacing(obs); nm = clean(s.get('name')); desc = clean(s.get('desc'))[:160]; fmt_ = s.get('fmt') or ''
    if code in in_release and code not in ('MMSM001R',): continue
    if fr is None or code in DROP: continue
    if fr == 'D': put_daily(code, nm, desc, fmt_); continue
    p = {'M': 'MKTM', 'Q': 'BOPQ', 'A': 'BOPA'}[fr]
    cat = ('Balance of payments' if code.startswith(('KBP50', 'KBP51', 'KBP56', 'KBP57')) else 'National accounts ratios') if p == 'BOPQ' else 'Other indicators'
    e = dict(c=code, p=p, f=fr, cat=cat, n=nm, u=unit_of(nm, cat, fmt_, code, desc, p), d=fmt_, dt=None, a='last', t=1 if code in TIER1 else 3, desc=desc)
    if code in HIDE: e['hide'] = 1
    add(e)

# 3. what the dashboard's other API lists carry that the above does not -------------------------------------------------------------------------
have = {e['c'] for e in series}
extra = collections.OrderedDict()                                                 # code -> dict(name, cat, kind, unit_hint, group)
# CPD rates and the chart sets (names from the dashboard's data file; the CPD list from the API)
for r in get('/WebIndicators/CPDRates'): extra.setdefault(r['TimeseriesCode'], dict(name=clean(r['Name']), cat='CPD interest rates', group='RATES'))
for gk, v in D['graphs'].items():
    for n, lst in v.items():
        for s in lst:
            if s['code'] not in have: extra.setdefault(s['code'], dict(name=clean(s['name']), cat='Chart-set series', group='MKTM', desc=clean(s.get('desc'))[:160]))
# the IMF-standard (SDDS) tables
SD = [('Real', '/WebIndicators/EconFinDataForSA/GetRealSectorData'), ('Financial', '/WebIndicators/EconFinDataForSA/GetFinancialSectorData'), ('External', '/WebIndicators/EconFinDataForSA/GetExternalSectorData'),
      ('Fiscal', '/WebIndicators/EconFinDataForSA/GetFiscalSectorData'), ('Population', '/WebIndicators/EconFinDataForSA/GetPopulationData')]
def sdds_group(table, section):
    s = section.lower()
    if table == 'Real':
        return 'NATACC' if re.search(r'gdp|national income|savings', s) else 'ECOIND'
    if table == 'Financial': return 'CBSURV'
    if table == 'External': return 'IIP' if 'investment position' in s else 'BOPD'
    if table == 'Fiscal':
        if 'consolidated general' in s: return 'GGOPS'
        if 'consolidated central' in s: return 'CGOPS'
        return 'CGDEBT'
    return 'ECOIND'
for table, path in SD:
    for r in get(path):
        c = r['TsCode']
        if c in have or c in extra: continue
        raw = str(r.get('MeasureName') or ''); depth = raw.count('&nbsp') // 4
        extra[c] = dict(name=('› ' * depth) + clean(raw), cat=clean(r.get('SectionName')), group=sdds_group(table, str(r.get('SectionName') or '')), unit_hint=str(r.get('UnitOfMeasure') or '').strip(), desc=clean(r.get('Description'))[:160])
# the international investment position items the dashboard references that the tables do not list
for i in (1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14):
    c = 'BOP30%02dQ' % i
    if c not in have and c not in extra: extra[c] = dict(name=None, cat='International investment position', group='IIP', unit_hint='R billion')

def probe(c):
    try: return c, get('/WebIndicators/Shared/GetTimeseriesObservations/%s/1990-01-01/%s' % (c, datetime.date.today().isoformat()))
    except Exception as ex: return c, None
with ThreadPoolExecutor(8) as ex: probes = dict(ex.map(probe, list(extra)))
bad, byf = [], collections.Counter()
for c, x in extra.items():
    rows = probes.get(c)
    if not rows: bad.append(c); continue
    fr = classify(rows)
    if fr is None: bad.append(c); continue
    nm = x['name'] or clean(rows[0].get('Description') or rows[0].get('Timeseries'))
    if x['name'] is None:                                                          # IIP items: tell assets from liabilities by the series description
        d = clean(rows[0].get('Description') or ''); nm = clean(rows[0].get('Timeseries') or c) + (' (' + d[:80] + ')' if d and d.lower() != clean(rows[0].get('Timeseries') or '').lower() else '')
    g = x['group']
    if g in ('RATES',) and fr == 'D':
        put_daily(c, nm, x.get('desc', ''), ''); byf['RATES D'] += 1; continue
    if g in SDDS_GROUPS:
        p = g + fr
    else:
        p = {'M': 'MKTM', 'Q': 'BOPQ', 'A': 'BOPA', 'D': 'RATES'}[fr] if g == 'MKTM' else {'M': 'MKTM', 'Q': 'BOPQ', 'A': 'BOPA'}.get(fr, 'MKTM')
    byf[g + ' ' + fr] += 1
    e = dict(c=c, p=p, f=fr, cat=x['cat'], n=nm, u=unit_of(nm, x['cat'], '', c, x.get('desc', ''), p, x.get('unit_hint', '')), d='', dt=None, a='last', t=3, desc=x.get('desc', ''), hint=x.get('unit_hint', ''))
    add(e)
# units the generic rules cannot know (chart-set series are labelled R million by default)
for e in series:
    if e['c'] in ('MMSM001E', 'MMSM002E'): e['u'] = 'Percentage'
    if e['c'] == 'JLE2001M': e['u'] = 'Index'
    m_ = re.search(r'(\d{4}(?:/\d\d)?)\s*=\s*100', e['n'] + ' ' + e.get('hint', ''))
    if e['u'] == 'Index' and m_: e['bs'] = m_.group(1) + ' = 100'
    e.pop('hint', None)
# publications for the new (group, frequency) combinations
used = {(e['p']) for e in series}
for g, (long_, short) in SDDS_GROUPS.items():
    for fr in 'MQA':
        if g + fr in used: PUBS.append(dict(code=g + fr, name=long_ + ' (' + FREQ_NAME[fr] + ')', short=short + (' (' + fr + ')' if fr != 'M' else ''), freq=fr, part='sdds'))

js = 'window.FEEDS_CATALOG=' + json.dumps({'api': API, 'pubs': PUBS, 'series': series}, separators=(',', ':'), ensure_ascii=False) + ';\n'
open(OUT, 'w', encoding='utf-8', newline='').write(js)
cnt = collections.Counter((e['p'], e['f']) for e in series)
print('wrote', OUT, len(js) // 1024, 'KB |', len(series), 'series entries |', len({e['c'] for e in series}), 'distinct API codes |', len(PUBS), 'publications')
for (p, f), n in sorted(cnt.items()): print(' ', p.ljust(8), f, n)
print('added from the other API lists, by group/frequency:', dict(byf))
print('no usable data (skipped):', bad)
u = collections.Counter(e['u'] for e in series); print('units:', dict(u))
miss = TIER1 - {e['c'] for e in series}; print('tier-1 codes not found:', sorted(miss))
