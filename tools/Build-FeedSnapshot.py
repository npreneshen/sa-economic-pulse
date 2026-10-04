"""Build-FeedSnapshot.py - writes the live series' full history into data\\live\\ : one small index plus part files that the browser loads only when it needs them.
The site ships these files so a visitor gets all the history without a bulk download from the source; the browser then tops up only what is newer than the snapshot (js/feeds.js).
The snapshot never has to be fresh for the numbers to be right - only for the top-up to be small - and it is rebuilt whenever the site is published (run this script).
    python tools\\Build-FeedSnapshot.py            every series, full history, 8 requests at a time (about two minutes)
    python tools\\Build-FeedSnapshot.py --check    report what the existing snapshot holds
Files (data\\live\\):
    index.js        window.FEEDS_INDEX = { built, builtMs, releases:{type:lastPeriod}, parts:{name:{series,bytes}} }   (loaded with the page; a few hundred bytes per part)
    <part>.js       (window.FEEDS_PARTS = window.FEEDS_PARTS || {})[name] = { built, builtMs, series:{ "<group>|<id>": record } }
                    'core' = every monthly / quarterly / annual group and the monthly views of the daily series; 'rates-daily', 'fx-daily' = daily history; 'sdds' = the IMF-standard tables' series
Records:  {f:'M'|'Q'|'A', a:'YYYY-MM', st:months per step, v:[...]}                       one value per step from a, null where missing
          {f:'D', a:'YYYY-MM', v:[monthly figures before the window], o:[[date,value],...]}  monthly view of a daily series: months before a recent window as one figure, the raw days after
          {f:'D', dv:1, a:'YYYY-MM-DD', d:[days since the previous observation,...], v:[...]}   daily view: every observation
All records carry s = the release stamp at build time (release-based series are topped up only when the source's release list moves past it)."""
import json, os, sys, time, datetime, urllib.request, collections, gzip
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = os.path.join(ROOT, 'js', 'feeds-catalog.js')
OUTDIR = os.path.join(ROOT, 'data', 'live')
t = open(CAT, encoding='utf-8').read()
C = json.loads(t[t.index('=') + 1:].strip().rstrip(';'))
API = C['api']
PARTOF = {p['code']: p.get('part', 'core') for p in C['pubs']}

if '--check' in sys.argv:
    ix = open(os.path.join(OUTDIR, 'index.js'), encoding='utf-8').read(); d = json.loads(ix[ix.index('=') + 1:].strip().rstrip(';'))
    print('built', d['built']); [print(' ', k, v) for k, v in d['parts'].items()]; sys.exit(0)

def get(url, tries=3, timeout=180):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'Accept': 'application/json'}), timeout=timeout) as r: return json.load(r)
        except Exception as e: last = e; time.sleep(1.5 * (i + 1))
    raise last

today = datetime.date.today().isoformat()
rel = {r['DataType']: r.get('LastPeriod', '') for r in get(API + '/WebIndicators/ReleaseOfSelectedData')}
def mi(p): return int(p[:4]) * 12 + int(p[5:7]) - 1
def ml(i): return '%d-%02d' % (i // 12, i % 12 + 1)
def ordinal(d): return datetime.date.fromisoformat(d).toordinal()

def fetch(code):
    rows = get('%s/WebIndicators/Shared/GetTimeseriesObservations/%s/1800-01-01/%s' % (API, code, today))
    out = {}
    for r in rows:
        d = str(r.get('Period', ''))[:10]; v = r.get('Value')
        if not d or v is None: continue
        try: out[d] = float(v)
        except Exception: pass
    return sorted(out.items())                                                      # [(YYYY-MM-DD, value)] oldest first

def monthly_keys(obs):                                                              # a periodic series is keyed by month ('YYYY-MM'); a day-off date still belongs to its month
    m = {}
    for d, v in obs: m[d[:7]] = v
    return sorted(m.items())

def clean(e, obs, notes):
    """Placeholder rows: an isolated first observation more than two years before the next one is not data (the fiscal statement carries a 0.0 dated 1990-01-01)."""
    while len(obs) > 2 and mi(obs[1][0]) - mi(obs[0][0]) > 24:
        notes.append('%s: dropped isolated first observation %s=%s' % (e['c'], obs[0][0], obs[0][1])); obs = obs[1:]
    return obs

def pack(e, raw):
    daily_src = e['f'] == 'D'
    if daily_src and e.get('dv'):                                                   # daily view: all observations, day gaps + values
        a = raw[0][0]; prev = ordinal(a); d = [0]
        for dt_, _ in raw[1:]:
            o = ordinal(dt_); d.append(o - prev); prev = o
        return {'f': 'D', 'dv': 1, 'a': a, 'd': d, 'v': [round(v, 6) for _, v in raw]}
    if daily_src:                                                                   # monthly view of a daily series
        w = datetime.date.today().replace(day=1); w = (w - datetime.timedelta(days=1)).replace(day=1); w = (w - datetime.timedelta(days=1)).replace(day=1)
        cut = w.isoformat(); need = 1 if e.get('a') == 'last' else 3
        g = collections.OrderedDict()
        for d_, v in raw:
            if d_ < cut: g.setdefault(d_[:7], []).append(v)
        rawwin = [[d_, round(v, 6)] for d_, v in raw if d_ >= cut]
        if not g: return {'f': 'D', 'o': [[d_, round(v, 6)] for d_, v in raw]}
        first, last = mi(min(g)), mi(max(g)); hv = []
        for i in range(first, last + 1):
            a_ = g.get(ml(i)); hv.append(None if not a_ or len(a_) < need else round(a_[-1] if e.get('a') == 'last' else sum(a_) / len(a_), 6))
        return {'f': 'D', 'a': ml(first), 'v': hv, 'o': rawwin}
    obs = monthly_keys(raw)
    st = {'M': 1, 'Q': 3, 'A': 12}[e['f']]
    first, last = mi(obs[0][0]), mi(obs[-1][0]); m = {mi(p): v for p, v in obs}
    if any(((i - first) % st) for i in m): return {'f': e['f'], 'o': [[p, round(x, 6)] for p, x in obs]}
    return {'f': e['f'], 'st': st, 'a': ml(first), 'v': [None if i not in m else round(m[i], 6) for i in range(first, last + 1, st)]}

ents = [dict(e, k=e['p'] + '|' + e['id']) for e in C['series']]
codes = sorted({e['c'] for e in ents})
t0 = time.time(); raw, fails, notes = {}, [], []
def work(c):
    try: return c, fetch(c)
    except Exception as ex: return c, ex
with ThreadPoolExecutor(8) as ex:
    for c, res in ex.map(work, codes):
        if isinstance(res, Exception) or not res: fails.append((c, str(res)[:80] if isinstance(res, Exception) else 'no observations')); continue
        raw[c] = res
parts = collections.defaultdict(dict)
for e in ents:
    r = raw.get(e['c'])
    if not r: continue
    obs = r if e['f'] == 'D' else clean(e, monthly_keys(r), notes)
    if e['f'] != 'D' and not obs: continue
    rec = pack(e, r if e['f'] == 'D' else [(p, v) for p, v in obs])
    rec['s'] = rel.get(e['dt'], '') if e.get('dt') else ''
    parts[PARTOF[e['p']]][e['k']] = rec
built = datetime.datetime.now().isoformat(timespec='seconds'); builtMs = int(time.time() * 1000)
os.makedirs(OUTDIR, exist_ok=True)
for fn in os.listdir(OUTDIR):
    if fn.endswith('.js'): os.remove(os.path.join(OUTDIR, fn))
index = {'built': built, 'builtMs': builtMs, 'releases': rel, 'parts': {}}
total = 0
for name, series in parts.items():
    js = '(window.FEEDS_PARTS=window.FEEDS_PARTS||{})[%s]=%s;\n' % (json.dumps(name), json.dumps({'built': built, 'builtMs': builtMs, 'series': series}, separators=(',', ':')))
    open(os.path.join(OUTDIR, name + '.js'), 'w', encoding='utf-8', newline='').write(js)
    index['parts'][name] = {'series': len(series), 'bytes': len(js.encode('utf-8')), 'gzip': len(gzip.compress(js.encode('utf-8')))}; total += len(js)
open(os.path.join(OUTDIR, 'index.js'), 'w', encoding='utf-8', newline='').write('window.FEEDS_INDEX=' + json.dumps(index, separators=(',', ':')) + ';\n')
print('wrote %d part files to %s | %d series entries | %.2f MB in all | %.0f s' % (len(parts), OUTDIR, sum(len(s) for s in parts.values()), total / 1e6, time.time() - t0))
for name, v in index['parts'].items(): print('  %-12s %4d series  %6.2f MB  (%5.2f MB gzipped)' % (name, v['series'], v['bytes'] / 1e6, v['gzip'] / 1e6))
for n in notes[:3]: print('  note:', n)
if len(notes) > 3: print('  note: ... and %d more placeholder rows dropped' % (len(notes) - 3))
for c, why in fails: print('  FAILED:', c, why)
sys.exit(1 if len(fails) > 5 else 0)
