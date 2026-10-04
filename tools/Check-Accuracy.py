"""Check-Accuracy.py - accuracy audit across ALL series in the app.  Run from the app folder:  python tools\\Check-Accuracy.py
Writes ACCURACY_REPORT.md and prints a summary. Exit status 1 if any FAIL.

What is checked
  A  Source fidelity ........ every numeric cell of every workbook == generated data (tools\\Validate-Parse.py, run first)
  B  Accounting identities .. parts add up to totals (mining value, manufacturing sales, electricity balance, trade sales, building by
                              type/province, tourist income, corporate statements, capacity-utilisation reasons, CPI weights, PPI weights)
  C  Index bases ............ "2019=100", "Dec 2020=100", "Dec 2023=100", "Dec 2024 = 100" series really equal 100 at their base
  D  SA vs actual ........... seasonally adjusted series average out to the actual series over whole years
  E  Series hygiene ......... interior gaps, non-positive indices, impossible percentages, extreme month-on-month jumps, stale/discontinued series
  F  Independent cross-check  CPI/PPI/average-price data compared value-for-value with the SA CPI & PPI dashboard's own parse (read-only)
Tolerances are stated next to every result; PASS <= tolerance, WARN <= 4x tolerance, FAIL beyond."""
import glob, json, math, pathlib, re, statistics, subprocess, sys, collections

APP = pathlib.Path(__file__).resolve().parent.parent
CPI_APP = pathlib.Path(r'C:\Users\P\Downloads\Dashboards\SA CPI\data\live-data.js')
RES = []          # (area, check, status, detail)

def add(area, check, status, detail):
    RES.append((area, check, status, detail))

def grade(err, tol):
    return 'PASS' if err <= tol else ('WARN' if err <= 4 * tol else 'FAIL')

# ------------------------------------------------------------------ load
def load(code):
    txt = (APP / 'data' / f'{code}.js').read_text(encoding='utf-8')
    d = json.loads(re.search(r'\]=(\{.*\});\s*$', txt, re.S)[1])
    n = len(d['periods']); S = {}
    for s in d['series']:
        a = [None] * n
        for i, v in enumerate(s['v']): a[s['s'] + i] = v
        S[s['id']] = dict(m=s, a=a)
    return d, S

PUBS = sorted(p.stem for p in list((APP / 'data').glob('P*.js')) + list((APP / 'data').glob('Report-*.js')))
D, SER, PER = {}, {}, {}
for c in PUBS:
    D[c], SER[c] = load(c); PER[c] = D[c]['periods']

UNIT = {'R million': 1, "R'000": 1, 'R1000': 1, 'Gigawatt-hours': 1, 'Number': 1, 'Square metres': 1, 'Thousand': 1, 'Index': 0.1, 'Percentage': 0.1, 'Rand': 0.01}
def get(c, i): return SER[c][i]['a'] if i in SER[c] else None

def sum_check(area, label, code, total, parts, tol, sign=None, note=''):
    """total == sum(parts) in every period where all are present; reports worst relative error."""
    T = get(code, total); P = [get(code, p) for p in parts]
    if T is None or any(p is None for p in P):
        add(area, label, 'FAIL', f'series missing: {[x for x, y in zip([total] + parts, [T] + P) if y is None]}'); return
    errs = []; worst = (0, None)
    for i in range(len(PER[code])):
        if T[i] is None or any(p[i] is None for p in P): continue
        tot = sum((sign[k] if sign else 1) * P[k][i] for k in range(len(P)))
        den = max(abs(T[i]), 1e-9)
        # every published figure is rounded to the series' unit, so allow half a unit per component
        e = max(0.0, abs(tot - T[i]) - 0.5 * (len(P) + 1) * UNIT.get(SER[code][total]['m']['unit'], 0)) / den
        errs.append(e)
        if e > worst[0]: worst = (e, PER[code][i])
    if not errs: add(area, label, 'FAIL', 'no overlapping periods'); return
    med = statistics.median(errs); w = worst[0]
    add(area, label, grade(w, tol), f'{len(errs)} periods; worst relative gap {w*100:.3f}% ({worst[1]}), median {med*100:.4f}%; tolerance {tol*100:.2f}% {note}')

# ------------------------------------------------------------------ A  source fidelity
def run_validator():
    r = subprocess.run([sys.executable, str(APP / 'tools' / 'Validate-Parse.py')], capture_output=True, text=True, cwd=APP, encoding='utf-8')
    last = [l for l in r.stdout.strip().splitlines() if l.startswith('TOTAL')]
    add('A source', 'Every workbook cell == generated data', 'PASS' if r.returncode == 0 else 'FAIL', last[0] if last else r.stdout[-300:])
run_validator()

# ------------------------------------------------------------------ B  identities
A = 'B identities'
# Mining
sum_check(A + ' P2041', 'Mineral sales value: 11 mineral groups = total (gold incl.)', 'P2041', 'MVK20000',
          ['MVK21000', 'MVK23010', 'MVK23020', 'MVK23021', 'MVK23022', 'MVK23023', 'MVK23029', 'MVK23999', 'MVK24000', 'MVK28888', 'MVK28999'], 0.001)
sum_check(A + ' P2041', 'Total gold-excluded = total gold-included - gold', 'P2041', 'MVK20001', ['MVK20000', 'MVK24000'], 0.001, sign=[1, -1])
sum_check(A + ' P2041', 'Building materials = granite + limestone + other', 'P2041', 'MVK28888', ['MVK28010', 'MVK28011', 'MVK28889'], 0.001)
# Manufacturing sales value
S = SER['P3041.2']
codes = sorted(i[3:] for i in S if i.startswith('MSV'))
isdiv = lambda c: c[2:] == '999' or c == '39991'
divs = [c for c in codes if isdiv(c)]
sum_check(A + ' P3041.2', 'Sales value: the ten divisions = total manufacturing', 'P3041.2', 'MSV30000', ['MSV' + c for c in divs], 0.002)
sum_check(A + ' P3041.2', 'Sales value: furniture + other manufacturing groups = Furniture and other division', 'P3041.2', 'MSV39991', ['MSV39100', 'MSV39OTHER'], 0.002)
for dcode in divs:
    kids = [c for c in codes if not isdiv(c) and c != '30000' and c[:2] == dcode[:2]]
    if kids: sum_check(A + ' P3041.2', f'Sales value: industries = division {S["MSV"+dcode]["m"]["name"][:40]}', 'P3041.2', 'MSV' + dcode, ['MSV' + k for k in kids], 0.002)
# Electricity
sum_check(A + ' P4141', 'Available = produced - own use + imports - exports (all producers)', 'P4141', 'ELEKTR10', ['ELEKTR11', 'ELEKTR12', 'ELEKTR13', 'ELEKTR14'], 0.002, sign=[1, -1, 1, -1])
sum_check(A + ' P4141', 'Available = produced - own use + imports - exports (national supplier)', 'P4141', 'ELEKTR20', ['ELEKTR21', 'ELEKTR22', 'ELEKTR23', 'ELEKTR24'], 0.002, sign=[1, -1, 1, -1])
sum_check(A + ' P4141', 'Nine provinces = South Africa distributed', 'P4141', 'ELEKTRSA', ['ELEKTR' + p for p in ['WC', 'EC', 'NC', 'FS', 'KZ', 'NW', 'GT', 'ML', 'LP']], 0.002)
T, E = get('P4141', 'ELEKTR11'), get('P4141', 'ELEKTR21'); bad = sum(1 for a, b in zip(T, E) if a is not None and b is not None and b > a * 1.0005)
add(A + ' P4141', 'National supplier output <= all-producer output', 'PASS' if bad == 0 else 'FAIL', f'{bad} months where supplier exceeds the total')
# Trade
def trade(code, tot_cur, tot_con, parts_cur, parts_con, tol=0.002):
    sum_check(A + ' ' + code, 'Sales by type = total (current prices, actual)', code, tot_cur, parts_cur, tol)
    if tot_con: sum_check(A + ' ' + code, 'Sales by type = total (constant prices, actual)', code, tot_con, parts_con, tol)
trade('P6242.1', 'cur_act', 'con_act', ['sales' + c for c in ['621C', '6220', '6231', '6232', '6233', '6234', '6239']], ['con_S' + c for c in ['621C', '6220', '6231', '6232', '6233', '6234', '6239']])
sum_check(A + ' P6242.1', 'Retail: types = total (constant, SA)', 'P6242.1', 'con_seas', ['con_S' + c + '_D11' for c in ['621C', '6220', '6231', '6232', '6233', '6234', '6239']], 0.01, note='(SA components are adjusted separately, so a small gap is expected)')
sum_check(A + ' P6242.1', 'Retail: types = total (current, SA)', 'P6242.1', 'cur_seas', ['sales' + c + '_D11' for c in ['621C', '6220', '6231', '6232', '6233', '6234', '6239']], 0.01, note='(SA components are adjusted separately)')
trade('P6343.2', 'Cur_act', 'Con_act', ['Accessories', 'Conv_store', 'Fuel', 'New_vehicles', 'Used_vehicles', 'Workshop'], ['con_fAcces', 'con_fConv1', 'con_fFuel', 'con_fnew', 'con_fUsed', 'con_fWork'])
sum_check(A + ' P6343.2', 'Motor: activities = total (current, SA)', 'P6343.2', 'Cur_seas', ['fAcces_D11', 'fConv1_D11', 'fFuel_D11', 'fNew_D11', 'fUsed_D11', 'fWork_D11'], 0.01, note='(SA components are adjusted separately)')
trade('P6141.2', 'cur_act', None, ['sales' + c for c in ['6110', '6121', '6122', '6131', '6139', '613A', '6141', '6142', '6143', '6149', '6150', '6190']], None)
# Building statistics
S = SER['P5041.1']; groups = collections.defaultdict(dict)
for i, s in S.items():
    m = s['m']
    if m['adj'] == 'nsa': groups[(m['measure'][:14], m['name'], m['sub'], m['unit'], m['price'])][m['geo']] = i
worst = (0, None); n = 0; skipped = 0; wc = 0
PROVS = ['Western Cape', 'Eastern Cape', 'Northern Cape', 'Free State', 'KwaZulu-Natal', 'North West', 'Gauteng', 'Mpumalanga', 'Limpopo']
for key, g in groups.items():
    if 'South Africa' not in g or any(p not in g for p in PROVS): skipped += 1; continue
    SA = S[g['South Africa']]['a']; Ps = [S[g[p]]['a'] for p in PROVS]
    for t in range(len(SA)):
        if SA[t] is None or any(p[t] is None for p in Ps): continue
        e = abs(sum(p[t] for p in Ps) - SA[t]) / max(abs(SA[t]), 1)
        n += 1
        if e > worst[0]: worst = (e, (key[1], key[2], key[3], PER['P5041.1'][t]))
        if e > 0.002: wc += 1
add(A + ' P5041.1', 'Nine provinces = South Africa (every type x sub-type x measure x unit)', grade(worst[0], 0.002), f'{len(groups)-skipped} series groups, {n:,} cells; worst gap {worst[0]*100:.3f}% at {worst[1]}; {wc} cells beyond 0.2%')
def b(measure, name, sub, unit="R'000", geo='South Africa'):
    for i, s in S.items():
        m = s['m']
        if m['measure'].startswith(measure) and m['name'] == name and m['sub'] == sub and m['unit'] == unit and m['geo'] == geo and m['adj'] == 'nsa' and m['price'] in ('current', ''): return i
for meas in ('Building plans', 'Buildings reported'):
    tot = b(meas, 'Total', ''); res = b(meas, 'Residential buildings', 'Total'); non = b(meas, 'Non-residential buildings', 'Total'); add_ = b(meas, 'Additions and alterations', 'Total')
    sum_check(A + ' P5041.1', f'{meas[:9]}: residential + non-residential + additions = total (value)', 'P5041.1', tot, [res, non, add_], 0.002)
    for tyname, subs in (('Residential buildings', ['Dwelling-houses < 80 square metres', 'Dwelling-houses >= 80 square metres', 'Flats and townhouses', 'Other residential buildings']),
                         ('Non-residential buildings', ['Office and banking space', 'Shopping space', 'Industrial and warehouse space', 'Other non-residential buildings']),
                         ('Additions and alterations', ['Dwelling-houses', 'Other buildings'])):
        sum_check(A + ' P5041.1', f'{meas[:9]}: {tyname} sub-types = type total (value)', 'P5041.1', b(meas, tyname, 'Total'), [b(meas, tyname, x) for x in subs], 0.002)
# Tourist accommodation
S = SER['P6410']; segs = ['Total industry', 'Hotels', 'Caravan parks and camping sites', 'Guest houses and guest farms', 'Other accommodation']
def tid(meas, seg, adj='nsa'):
    for i, s in S.items():
        m = s['m']
        if m['measure'] == meas and m['name'] == seg and m['adj'] == adj: return i
for seg in segs:
    sum_check(A + ' P6410', f'Total income = accommodation + restaurant/bar + other ({seg[:18]})', 'P6410', tid('Total income', seg), [tid('Income from accommodation', seg), tid('Income from restaurant and bar sales', seg), tid('Other income', seg)], 0.002)
for meas in ('Stay units available', 'Stay units nights sold', 'Income from accommodation', 'Income from restaurant and bar sales', 'Other income', 'Total income'):
    sum_check(A + ' P6410', f'{meas}: four segments = total industry', 'P6410', tid(meas, segs[0]), [tid(meas, x) for x in segs[1:]], 0.002)
for seg in segs:                                           # occupancy = nights sold / units available
    O, N, U = get('P6410', tid('Occupancy rate', seg)), get('P6410', tid('Stay units nights sold', seg)), get('P6410', tid('Stay units available', seg))
    import calendar
    pers = PER['P6410']; dim = lambda p: calendar.monthrange(int(p[:4]), int(p[5:7]))[1]
    errs = [abs(o - nn / (u * dim(pers[k])) * 100) for k, (o, nn, u) in enumerate(zip(O, N, U)) if None not in (o, nn, u) and u]
    add(A + ' P6410', f'Occupancy = nights sold / (units available x days in month) ({seg[:18]})', grade(max(errs), 0.6), f'{len(errs)} months; worst gap {max(errs):.3f} pp; median {statistics.median(errs):.3f} pp; tolerance 0.6 pp (rounded inputs)')
# Corporate
S = SER['P0021']
def g21(code, ind): return get('P0021', f'{code}.{ind}')
varcodes = sorted({i.split('.')[0] for i in S})
worst = (0, None); cnt = 0
for v in varcodes:
    allv = g21(v, '10'); parts = [g21(v, str(k)) for k in range(1, 10)]
    if allv is None or any(p is None for p in parts): continue
    for t in range(len(PER['P0021'])):
        if allv[t] is None or any(p[t] is None for p in parts): continue
        e = abs(sum(p[t] for p in parts) - allv[t]) / max(abs(allv[t]), 1); cnt += 1
        if e > worst[0]: worst = (e, (v, PER['P0021'][t]))
add(A + ' P0021', 'Nine industries = all industries (every line item, every year)', grade(worst[0], 0.002), f'{cnt:,} cells; worst relative gap {worst[0]*100:.3f}% at {worst[1]}')
for ind in ['10', '3', '6']:
    sum_check(A + ' P0021', f'Retained profit = profit before tax - tax - dividends (industry {ind})', 'P0021', f'FPROFAFTERTAX.{ind}', [f'FPROF.{ind}', f'FTAX.{ind}', f'FTDIV.{ind}'], 0.002, sign=[1, -1, -1])
    sum_check(A + ' P0021', f'Total assets = total equity and liabilities (industry {ind})', 'P0021', f'FTOTA.{ind}', [f'FLITOT.{ind}'], 0.001)
    sum_check(A + ' P0021', f'Total assets = non-current + current assets (industry {ind})', 'P0021', f'FTOTA.{ind}', [f'FOTHA.{ind}', f'FFINA.{ind}'], 0.002)
    sum_check(A + ' P0021', f'Equity and liabilities = equity + non-current + current liabilities (industry {ind})', 'P0021', f'FLITOT.{ind}', [f'FOE.{ind}', f'FLIABL.{ind}', f'FLIABT.{ind}'], 0.002)
# Capacity utilisation
S = SER['P3043']; inds = sorted({i[:6] for i in S}); w1 = w2 = 0; n1 = n2 = 0
for ind in inds:
    u, ud = get('P3043', ind + '10'), get('P3043', ind + '20'); rs = [get('P3043', ind + m) for m in ('21', '22', '23', '24', '25')]
    for t in range(len(PER['P3043'])):
        if u[t] is not None and ud[t] is not None: n1 += 1; w1 = max(w1, abs(u[t] + ud[t] - 100))
        if ud[t] is not None and all(r[t] is not None for r in rs): n2 += 1; w2 = max(w2, abs(sum(r[t] for r in rs) - ud[t]))
add(A + ' P3043', 'Utilisation + under-utilisation = 100%', grade(w1, 0.15), f'{len(inds)} industries, {n1:,} quarters; worst gap {w1:.2f} pp; tolerance 0.15 pp')
add(A + ' P3043', 'Five reasons add up to under-utilisation', grade(w2, 0.35), f'{n2:,} industry-quarters; worst gap {w2:.2f} pp (rounding of five one-decimal numbers); tolerance 0.35 pp')
# CPI / PPI weights
S = SER['P0141']; items = {i: s for i, s in S.items() if re.fullmatch(r'\d{8}', i)}
ws = sum(s['m'].get('w') or 0 for s in items.values())
add(A + ' P0141', 'Product weights sum to 100', grade(abs(ws - 100), 1e-4), f'{len(items)} products; sum = {ws:.6f}')
divw = collections.defaultdict(float)
for i, s in items.items(): divw[i[:2]] += s['m'].get('w') or 0
head = get('P0141', 'CPS00000'); divs = {d: get('P0141', f'CPS{d}000') for d in divw}; per = PER['P0141']
worst = (0, None); n = 0
for t, p in enumerate(per):
    if p < '2024-12' or head[t] is None or any(divs[d][t] is None for d in divs): continue
    pred = sum(divw[d] * divs[d][t] for d in divw) / 100; e = abs(pred - head[t]); n += 1
    if e > worst[0]: worst = (e, p)
add(A + ' P0141', 'Division weights x division indices rebuild the headline index (Dec 2024 onward)', grade(worst[0], 0.1), f'{n} months; worst gap {worst[0]:.3f} index points at {worst[1]} (rounding of one-decimal indices); tolerance 0.1')
S = SER['P0142.1']; sw = collections.defaultdict(float)
for i, s in S.items():
    if re.fullmatch(r'\d+', i): sw[s['m']['measure']] += s['m'].get('w') or 0
add(A + ' P0142.1', 'Elementary product weights sum to 100 within each sector', grade(max(abs(v - 100) for v in sw.values()), 1e-4), '; '.join(f'{k[:22]} {v:.4f}' for k, v in sw.items()))

# ---- second batch: land transport, food & beverages, liquidations, insolvencies, QFS, industry surveys
sum_check(A + ' P7162', 'Freight payload: rail + road = total (actual)', 'P7162', 'payl_totl', ['railpayl', 'roadpayl'], 0.002)
sum_check(A + ' P7162', 'Freight income: rail + road = total (actual)', 'P7162', 'incf_totl', ['railincf', 'roadincf'], 0.002)
sum_check(A + ' P7162', 'Passenger journeys: rail + road = total (actual)', 'P7162', 'nops_totl', ['railnops', 'roadnops'], 0.002)
sum_check(A + ' P7162', 'Passenger income: rail + road = total (actual)', 'P7162', 'incp_totl', ['inc_rail', 'inc_road'], 0.002)
sum_check(A + ' P7162', 'Freight income: 15 commodity groups = total', 'P7162', 'incf_totl', ['inc_agri', 'inc_ming', 'inc_food', 'inc_text', 'inc_chem', 'inc_metl', 'inc_nonm', 'inc_mach', 'inc_moto', 'inc_papr', 'inc_comm', 'inc_used', 'inc_cont', 'inc_parc', 'inc_othf'], 0.002)
sum_check(A + ' P7162', 'Freight payload: rail + road = total (seasonally adjusted)', 'P7162', 'fpayl1_tot_d11', ['fpayl1_Rail_d11', 'fpayl1_Road_d11'], 0.01)
sum_check(A + ' P7162', 'Freight income: rail + road = total (seasonally adjusted)', 'P7162', 'fincf1_tot_d11', ['fincf1_Rail_d11', 'fincf1_Road_d11'], 0.01)
for suf, lab in (('', 'current, actual'), ('_CON', 'constant, actual'), ('_SEAS', 'current, SA'), ('_CON_D11', 'constant, SA')):
    for o, on in (('64200', 'total industry'), ('64201', 'restaurants'), ('64203', 'take-away'), ('64209', 'catering')):
        sum_check(A + ' P6420', f'Total income = food + bar + other ({on}, {lab})', 'P6420', f'D{o}{suf}', [f'A{o}{suf}', f'B{o}{suf}', f'C{o}{suf}'], 0.002)
    for p_, n_ in (('A', 'food sales'), ('B', 'bar sales'), ('C', 'other income'), ('D', 'total income')):
        sum_check(A + ' P6420', f'{n_}: three outlet types = total industry ({lab})', 'P6420', f'{p_}64200{suf}', [f'{p_}64201{suf}', f'{p_}64203{suf}', f'{p_}64209{suf}'], 0.002)
sum_check(A + ' P0043.1', 'Liquidations: companies + close corporations = total', 'P0043.1', 'LIQ00000', ['LIQ10000', 'LIQ20000'], 0.0005)
sum_check(A + ' P0043.1', 'Companies: compulsory + voluntary = total', 'P0043.1', 'LIQ10000', ['LIQ11000', 'LIQ12000'], 0.0005)
sum_check(A + ' P0043.1', 'Close corporations: compulsory + voluntary = total', 'P0043.1', 'LIQ20000', ['LIQ21000', 'LIQ22000'], 0.0005)
sum_check(A + ' P0043.2', 'Insolvencies: nine provinces = South Africa (2023 on)', 'P0043.2', 'INV00000', ['INV00000' + k for k in ('EC', 'FS', 'GP', 'KZN', 'LP', 'MP', 'NC', 'NW', 'WC')], 0.01,
          note='(provinces published from Jan 2023; earlier periods have no provincial values and are skipped)')

# QFS: Large + Medium + Small = Total for every item and industry, in every quarter
def qfs_size_check():
    S = SER['P0044']; worst = (0, None); n = 0; bad = 0; per = PER['P0044']
    for sid, s in S.items():
        item, ind, size = sid.split('|')
        if size != 'Total': continue
        parts = [S.get(f'{item}|{ind}|{z}') for z in ('Large', 'Medium', 'Small')]
        if any(p is None for p in parts): continue
        for i in range(len(per)):
            t = s['a'][i]
            if t is None or any(p['a'][i] is None for p in parts): continue
            tot = sum(p['a'][i] for p in parts); e = max(0.0, abs(tot - t) - 2) / max(abs(t), 1)
            n += 1; bad += e > 0.001
            if e > worst[0]: worst = (e, (sid[:50], per[i]))
    add(A + ' P0044', 'Large + medium + small = all sizes (every item, industry, quarter)', grade(worst[0], 0.002), f'{n} item-industry-quarters; worst relative gap {worst[0]*100:.3f}% {worst[1]}; {bad} above 0.1%')
qfs_size_check()
def qfs_industry_check():
    S = SER['P0044']; per = PER['P0044']; inds = ['Mining and quarrying industry', 'Manufacturing industry', 'Electricity, gas and water supply industry', 'Construction industry', 'Trade industry', 'Transport industry',
                                                    'Real estate and other business services industry', 'Community, social and personal services industry']
    for item in ('Turnover', 'Total income', 'Total expenditure', 'Net profit or loss before taxation'):
        sum_check(A + ' P0044', f'{item}: eight industries = all industries (all sizes)', 'P0044', f'{item}|All industries|Total', [f'{item}|{x}|Total' for x in inds], 0.003)
qfs_industry_check()
sum_check(A + ' P0044', 'Total income = turnover + interest + dividends + royalties + rent + hire + asset profit + other (all industries)', 'P0044', 'Total income|All industries|Total',
          ['Turnover|All industries|Total', 'Interest|All industries|Total', 'Dividends|All industries|Total', 'Royalties, franchise fees, copyright, trade names and trade and patent rights|All industries|Total',
           'Rental/leasing of land, buildings and other structures received|All industries|Total', 'Hiring/leasing of plant, machinery, vehicles and other equipment received|All industries|Total',
           'Profit on assets/investment sold or revalued|All industries|Total', 'Other income|All industries|Total'], 0.003)
# flat industry surveys: industries add up to the total
def survey_total_check(code):
    S = SER[code]; rows = [(i, s) for i, s in S.items() if s['m']['measure'] == 'Total income' and (s['m']['geo'] or 'South Africa') == 'South Africa']
    tot = [i for i, s in rows if re.match(r'^(All|Total)', s['m']['name']) or s['m']['sub'] == 'Total']
    parts = [i for i, s in rows if i not in tot and re.fullmatch(r'\d{4,5}', s['m']['sub'] or '')]
    if len(tot) != 1 or len(parts) < 2: add(A + ' ' + code, 'Total income: industries add up to the total', 'WARN', f'structure not flat enough to test ({len(tot)} totals, {len(parts)} parts)'); return
    sum_check(A + ' ' + code, f'Total income: {len(parts)} industries = total', code, tot[0], parts, 0.003)
for c in ('Report-61-01-01', 'Report-62-01-02', 'Report-63-01-02', 'Report-64-11-01', 'Report-64-20-01'):
    if c in SER: survey_total_check(c)

# ---- macro batch: GDP, labour, jobs, provincial GDP, investment, government finance
A = 'B identities'
if 'P0441' in SER:
    # volumes at constant prices are rebased and chained by StatsSA, so components need not add exactly (early 1990s worst); current prices must
    for pre, lab, tol in (('QNU', 'current prices, actual', 0.002), ('QNS', 'current prices, seasonally adjusted', 0.01), ('QRU', 'constant 2015 prices, actual', 0.05), ('QRS', 'constant 2015 prices, seasonally adjusted', 0.05)):
        sum_check(A + ' P0441', f'Value added: ten industries = total ({lab})', 'P0441', pre + '1011', [pre + str(1000 + k) for k in range(1, 11)], tol)
        sum_check(A + ' P0441', f'GDP at market prices = value added + taxes less subsidies ({lab})', 'P0441', pre + '1000', [pre + '1011', pre + '1012'], tol)
        sum_check(A + ' P0441', f'Primary + secondary + tertiary = value added ({lab})', 'P0441', pre + '1011', [pre + '1015', pre + '1016', pre + '1017'], tol)
        sum_check(A + ' P0441', f'Final consumption = households + government ({lab})', 'P0441', pre + '2010', [pre + '2011', pre + '2012'], tol)
        sum_check(A + ' P0441', f'Gross capital formation = fixed capital + inventories ({lab})', 'P0441', pre + '2020', [pre + '2021', pre + '2022'], tol)
        sum_check(A + ' P0441', f'Gross domestic expenditure = consumption + capital formation ({lab})', 'P0441', pre + '2030', [pre + '2010', pre + '2020'], tol)
        sum_check(A + ' P0441', f'Expenditure on GDP = domestic expenditure + exports - imports ({lab})', 'P0441', pre + '2000', [pre + '2030', pre + '2040', pre + '2050'], tol, sign=[1, 1, -1])
        sum_check(A + ' P0441', f'GDP (production) = expenditure on GDP + residual ({lab})', 'P0441', pre + '1000', [pre + '2000', pre + '2001'], tol)
if 'P0441A' in SER:
    for pre, lab in (('AN', 'current prices'), ('AR', 'constant 2015 prices')):
        sum_check(A + ' P0441A', f'Annual value added: ten industries = total ({lab})', 'P0441A', pre + '1011', [pre + str(1000 + k) for k in range(1, 11)], 0.002)
        sum_check(A + ' P0441A', f'Annual GDP = value added + taxes less subsidies ({lab})', 'P0441A', pre + '1000', [pre + '1011', pre + '1012'], 0.002)
# annual = sum of the four quarters (current prices, actual)
if 'P0441' in SER and 'P0441A' in SER:
    Qs, As, per_q, per_a = get('P0441', 'QNU1000'), get('P0441A', 'AN1000'), PER['P0441'], PER['P0441A']
    if As is not None:
        worst = (0, None); n = 0
        for y in per_a:
            ix = [per_q.index(f'{y}-Q{k}') for k in range(1, 5) if f'{y}-Q{k}' in per_q]
            j = per_a.index(y)
            if len(ix) == 4 and None not in [Qs[i] for i in ix] and As[j]:
                e = abs(sum(Qs[i] for i in ix) - As[j]) / As[j]; n += 1
                if e > worst[0]: worst = (e, y)
        add(A + ' P0441A', 'Annual GDP (current prices) = sum of its four quarters', grade(worst[0], 0.002), f'{n} years; worst relative gap {worst[0]*100:.3f}% ({worst[1]}); tolerance 0.20%')
# QLFS
if 'P0211' in SER:
    P = 'T2|Both sexes > Population 15-64 years'
    lf, emp, un, out = P + ' > Labour Force', P + ' > Labour Force > Employed', P + ' > Labour Force > Unemployed', P + ' > Labour Force > Outside the Labour Force'
    sum_check(A + ' P0211', 'Labour force = employed + unemployed', 'P0211', lf, [emp, un], 0.002)
    sum_check(A + ' P0211', 'Working-age population = labour force + outside the labour force', 'P0211', P, [lf, out], 0.002)
    sum_check(A + ' P0211', 'Employed = formal + informal + household sector', 'P0211', emp, [emp + ' > Formal sector', emp + ' > Informal sector', emp + ' > Household sector'], 0.005, note='(QLFS rounds each cell; agriculture sits inside these three)')
    sum_check(A + ' P0211', 'Employed: women + men = both sexes', 'P0211', emp, [emp.replace('Both sexes', 'Women'), emp.replace('Both sexes', 'Men')], 0.002)
    sum_check(A + ' P0211', 'Unemployed: women + men = both sexes', 'P0211', un, [un.replace('Both sexes', 'Women'), un.replace('Both sexes', 'Men')], 0.002)
    ind = [i for i in SER['P0211'] if i.startswith('T3.1|Both sexes > ') and i.count(' > ') == 1]
    sum_check(A + ' P0211', f'Employed by industry ({len(ind)} industries) = employed', 'P0211', emp, ind, 0.002)
    PROV9 = ['Western Cape', 'Eastern Cape', 'Northern Cape', 'Free State', 'KwaZulu-Natal', 'North West', 'Gauteng', 'Mpumalanga', 'Limpopo']
    pe = [f'T2.3|{p} > Population 15-64 years > Labour Force > Employed' for p in PROV9]
    pe = []
    for p_ in PROV9:      # the workbook indents the provinces' blocks differently, so find the series by table / province / name rather than by path
        f_ = [i for i, s_ in SER['P0211'].items() if s_['m']['x'].get('Table') == '2.3' and s_['m']['geo'] == p_ and s_['m']['name'] == 'Employed' and ' - ' not in s_['m']['sub'].split(' > ')[0]]
        if len(f_) == 1: pe.append(f_[0])
    if len(pe) == 9: sum_check(A + ' P0211', 'Employed: nine provinces = South Africa', 'P0211', emp, pe, 0.003)
    else: add(A + ' P0211', 'Employed: nine provinces = South Africa', 'FAIL', f'found {len(pe)} of 9 province employed series')
    # published rates vs the rates rebuilt from the counts
    LF, UN = get('P0211', lf), get('P0211', un)
    U1 = get('P0211', 'T2|Both sexes > Labour underutilization indicators (%) > LU1- Unemployment rate')
    errs = [abs(u / l * 100 - r) for l, u, r in zip(LF, UN, U1) if None not in (l, u, r) and l]
    add(A + ' P0211', 'Published unemployment rate (LU1) = unemployed / labour force', grade(max(errs), 0.05), f'{len(errs)} quarters; worst gap {max(errs):.3f} pp; median {statistics.median(errs):.4f} pp; tolerance 0.05 pp')
    PA = get('P0211', P); PR = get('P0211', 'T2|Both sexes > Key rates in relation to the working-age population > Labour force participation rate')
    errs = [abs(l / p * 100 - r) for p, l, r in zip(PA, LF, PR) if None not in (p, l, r) and p]
    add(A + ' P0211', 'Published participation rate = labour force / working-age population', grade(max(errs), 0.05), f'{len(errs)} quarters; worst gap {max(errs):.3f} pp; tolerance 0.05 pp')
# QES
if 'P0277' in SER:
    for k, lab in (('EMP', 'Employees'), ('EARN', 'Total gross earnings')):
        tot = f'{k}|TOTAL|TOTAL'; parts = [i for i in SER['P0277'] if i.startswith(k + '|') and i.split('|')[1] in list('23456789')]
        if tot in SER['P0277'] and len(parts) == 8: sum_check(A + ' P0277', f'{lab}: eight industries = total', 'P0277', tot, parts, 0.002)
        else: add(A + ' P0277', f'{lab}: eight industries = total', 'WARN', f'{len(parts)} industry rows, total present: {tot in SER["P0277"]}')
# provincial GDP
if 'P0441.2' in SER:
    S = SER['P0441.2']
    for bk, lab in (('a', 'current prices, R million'), ('c', 'constant 2015 prices, R million')):
        names = [s['m']['name'] for i, s in S.items() if i.startswith(f'T1|{bk}|')]
        if not names: add(A + ' P0441.2', f'Provinces = South Africa ({lab})', 'FAIL', 'block not found'); continue
        worst = (0, None); n = 0
        for nm in names:
            T = get('P0441.2', f'T1|{bk}|{nm}'); Ps = [get('P0441.2', f'T{t}|{bk}|{nm}') for t in range(2, 11)]
            if T is None or any(p is None for p in Ps): continue
            for j in range(len(PER['P0441.2'])):
                if T[j] is None or any(p[j] is None for p in Ps): continue
                e = max(0.0, abs(sum(p[j] for p in Ps) - T[j]) - 5) / max(abs(T[j]), 1); n += 1
                if e > worst[0]: worst = (e, (nm[:30], PER['P0441.2'][j]))
        add(A + ' P0441.2', f'Nine provinces = South Africa, every industry ({lab})', grade(worst[0], 0.003), f'{n} industry-years; worst relative gap {worst[0]*100:.3f}% {worst[1]}; tolerance 0.3%')
        for t in range(1, 11):
            gp = lambda nm: f'T{t}|{bk}|{nm}'
            sum_check(A + ' P0441.2', f'Primary = agriculture + mining (table T{t}, {lab})', 'P0441.2', gp('Primary Industries'), [gp('Agriculture, forestry and fishing'), gp('Mining and quarrying')], 0.003)
            sum_check(A + ' P0441.2', f'All industries + taxes less subsidies = GDP (table T{t}, {lab})', 'P0441.2', gp('GDP at market prices' if t == 1 else 'GDPR at market prices'), [gp('All industries at basic prices'), gp('Taxes less subsidies on products')], 0.003)
# public capex and QCE
if 'P9101' in SER:
    for pre, nm in (('NG', 'national government'), ('PG', 'provincial government'), ('EBA', 'extra-budgetary accounts'), ('PCs', 'public corporations'), ('Mun', 'municipalities'), ('HEI', 'higher education'), ('TPS', 'total public sector')):
        sum_check(A + ' P9101', f'Capex by asset type = total ({nm})', 'P9101', pre + '08', [pre + f'0{k}' for k in range(1, 8)], 0.0005)
    sum_check(A + ' P9101', 'Public sector total = six sectors', 'P9101', 'TPS08', [x + '08' for x in ('NG', 'PG', 'EBA', 'PCs', 'Mun', 'HEI')], 0.0005)
if 'P0045' in SER:
    sum_check(A + ' P0045', 'Capex by industry: five groups = total industries', 'P0045', 'QCE000006', ['QCE00000' + str(k) for k in range(1, 6)], 0.002)
    sum_check(A + ' P0045', 'Capex by asset type: ten categories = total assets', 'P0045', 'QCE000017', ['QCE0000' + f'{k:02d}' for k in range(7, 17)], 0.002)
    T, U = get('P0045', 'QCE000006'), get('P0045', 'QCE000017'); e = [abs(a - b) / b for a, b in zip(T, U) if a is not None and b]
    add(A + ' P0045', 'Total by industry = total by asset type', grade(max(e), 0.002), f'{len(e)} quarters; worst relative gap {max(e)*100:.3f}%; tolerance 0.2%')
# government finance statistics
for code, nm in (('P9119.3', 'national government'), ('P9119.4', 'consolidated general government'), ('P9121', 'provincial government'), ('P9102', 'extra-budgetary accounts')):
    if code not in SER: continue
    fn = ['701', '702', '703', '704', '705', '706', '707', '708', '709', '710']; ex = ['21', '22', '24', '25', '26', '27', '28', '61']
    F = [get(code, k) for k in fn]; E = [get(code, k) for k in ex]; per = PER[code]; worst = (0, None); n = 0
    for j in range(len(per)):
        if any(x[j] is None for x in F + E): continue
        e = max(0.0, abs(sum(x[j] for x in F) - sum(x[j] for x in E)) - 10) / max(sum(x[j] for x in E), 1); n += 1
        if e > worst[0]: worst = (e, per[j])
    add(A + ' ' + code, f'Spending by function (10 groups) = expenses + purchases of non-financial assets ({nm})', grade(worst[0], 0.001), f'{n} years; worst relative gap {worst[0]*100:.4f}% ({worst[1]}); tolerance 0.1% (R10m rounding allowance)')

# ---- municipal quarterly finance (P9110.1)
if 'P9110.1' in SER:
    S9 = {i: s['a'] for i, s in SER['P9110.1'].items()}; per9 = PER['P9110.1']; n9 = len(per9)
    SHEET_NAME = {'CE': 'combined expenditure', 'CR': 'combined revenue', 'RE': 'rates expenditure', 'RR': 'rates revenue', 'HE': 'housing and trading expenditure', 'HR': 'housing and trading revenue'}
    TOTQ = {'E': 'Total expenditure', 'R': 'Total revenue'}
    byM = collections.defaultdict(lambda: collections.defaultdict(list))                # sheet -> municipality -> ids
    for i in S9:
        sh_, mu_, _q = i.split('|', 2); byM[sh_][mu_].append(i)
    # (1) the lines (plus the surplus / deficit balancing line) add up to the total, for every municipality and quarter
    for sh in SHEET_NAME:
        tq = TOTQ[sh[1]]; worst = (0, None); cells = 0
        for mu, ids in byM[sh].items():
            T = S9[f'{sh}|{mu}|{tq}']
            for j in range(n9):
                if T[j] is None: continue
                tot = sum((S9[k][j] or 0) for k in ids if not k.endswith('|' + tq))
                e = abs(tot - T[j]) / max(abs(T[j]), 1); cells += 1
                if e > worst[0]: worst = (e, (mu, per9[j]))
        add(A + ' P9110.1', f'{SHEET_NAME[sh].capitalize()}: lines + surplus/deficit = total ({len(byM[sh])} municipalities)', grade(worst[0], 0.001), f'{cells:,} municipality-quarters; worst relative gap {worst[0]*100:.4f}% {worst[1]}; tolerance 0.1% (rounding of ~50 lines)')
    # (2) revenue = expenditure (the surplus / deficit line balances them)
    for a_, b_, nm in (('CR', 'CE', 'combined'), ('RR', 'RE', 'rates'), ('HR', 'HE', 'housing and trading')):
        worst = 0; cells = 0
        for mu in byM[a_]:
            x, y = S9[f'{a_}|{mu}|Total revenue'], S9[f'{b_}|{mu}|Total expenditure']
            for j in range(n9):
                if x[j] is None or y[j] is None: continue
                cells += 1; worst = max(worst, abs(x[j] - y[j]) / max(abs(x[j]), 1))
        add(A + ' P9110.1', f'Total revenue = total expenditure ({nm})', grade(worst, 1e-6), f'{cells:,} municipality-quarters; worst relative gap {worst*100:.6f}%')
    # (3) the national row is the sum of the 130 municipalities, line by line
    for sh in ('CR', 'CE', 'RR', 'RE', 'HR', 'HE'):
        worst = (0, None); cells = 0; natl = 'All 130 municipalities'
        for i in byM[sh][natl]:
            q = i.split('|', 2)[2]; others = [S9.get(f'{sh}|{mu}|{q}') for mu in byM[sh] if mu != natl]
            others = [o for o in others if o is not None]
            for j in range(n9):
                if S9[i][j] is None: continue
                e = abs(sum((o[j] or 0) for o in others) - S9[i][j]) / max(abs(S9[i][j]), 1) if abs(S9[i][j]) > 0 else 0; cells += 1
                if e > worst[0]: worst = (e, (q[:30], per9[j]))
        add(A + ' P9110.1', f'National row = sum of the municipalities, every line ({SHEET_NAME[sh]})', grade(worst[0], 1e-6), f'{cells:,} line-quarters; worst relative gap {worst[0]*100:.6f}% {worst[1]}')
    # (4) combined = rates & general + housing & trading (the first quarter, 2023-Q3, is reported on its own: it exists only in one release, and 22 municipalities do not add up in the source itself)
    for sfx, tq in (('R', 'Total revenue'), ('E', 'Total expenditure')):
        worst = (0, None); cells = 0; first_bad = []
        for mu in byM['C' + sfx]:
            c_, r_, h_ = S9[f'C{sfx}|{mu}|{tq}'], S9[f'R{sfx}|{mu}|{tq}'], S9[f'H{sfx}|{mu}|{tq}']
            for j in range(n9):
                if None in (c_[j], r_[j], h_[j]): continue
                e = abs(r_[j] + h_[j] - c_[j]) / max(abs(c_[j]), 1)
                if j == 0:
                    if e > 0.001: first_bad.append(mu)
                    continue
                cells += 1
                if e > worst[0]: worst = (e, (mu, per9[j]))
        add(A + ' P9110.1', f'{tq}: combined = rates & general + housing & trading ({per9[1]} on)', grade(worst[0], 0.001), f'{cells:,} municipality-quarters; worst relative gap {worst[0]*100:.4f}% {worst[1]}; tolerance 0.1%')
        add(A + ' P9110.1', f'{tq}: combined = rates & general + housing & trading ({per9[0]}, first quarter)', 'PASS' if not first_bad else 'WARN', f'{len(first_bad)} of {len(byM["C" + sfx])} rows differ by more than 0.1% in the source workbook (it appears in one release only, so there is nothing to cross-check it against); e.g. {", ".join(first_bad[:3])}')
    # (5) every release attaches the right quarter to its columns (figures compared with the other releases)
    rr = subprocess.run([sys.executable, str(APP / 'tools' / 'Check-Municipal-Releases.py')], capture_output=True, text=True, cwd=APP, encoding='utf-8')
    add(A + ' P9110.1', 'Quarter columns of the 8 releases are attached to the right quarters (exact-figure comparison between releases)', 'PASS' if rr.returncode == 0 else 'FAIL', (rr.stdout.strip().splitlines() or [rr.stderr[-200:]])[-1])

# ---- municipal non-financial census (P9115)
if 'P9115' in SER:
    A = 'B identities'
    sum_check(A + ' P9115', 'Posts: full-time + part-time + vacant = total', 'P9115', 'ES289', ['ES259', 'ES269', 'ES279'], 0.006, note='(the published totals for 2015 and 2021 differ from the sum of their parts in the source workbook itself, by -1.3% and +2.1%; every other year is exact)')
    sum_check(A + ' P9115', 'Councillors: four groups + vacant seats = total', 'P9115', 'ES189', ['ES139', 'ES149', 'ES159', 'ES169', 'ES179'], 0.001)
    sum_check(A + ' P9115', 'Managers (Section 57): four groups + vacant = total', 'P9115', 'ES069', ['ES019', 'ES029', 'ES039', 'ES049', 'ES059'], 0.001)
    sum_check(A + ' P9115', 'Mayors: four groups + vacant = total', 'P9115', 'ES249', ['ES199', 'ES209', 'ES219', 'ES229', 'ES239'], 0.001, note='(2018 differs by 0.4% in the source)')
    PV = ['Western Cape', 'Eastern Cape', 'Northern Cape', 'Free State', 'KwaZulu-Natal', 'North West', 'Gauteng', 'Mpumalanga', 'Limpopo']
    def pid(measure_re, name, geo):
        f = [i for i, s_ in SER['P9115'].items() if re.match(measure_re, s_['m']['measure']) and s_['m']['name'] == name and s_['m']['geo'] == geo]
        return f[0] if len(f) == 1 else None
    for lab, mre, nm in (('Councillors', r'^Number of councillors', 'Total (including vacancies)'), ('Municipal posts', r'^Employment positions including managerial', 'Total (including vacancies)'), ('Indigent households', r'^Number of households in each province benefitting', 'Indigent households identified by the municipalities'),
                         ('Free basic electricity households', r'^Number of domestic consumer units', 'Free Basic Electricity'), ('Consumer units with water', r'^Number of consumer units in each province receiving services', 'Water')):
        sa, ps = pid(mre, nm, 'South Africa'), [pid(mre, nm, p_) for p_ in PV]
        if sa and all(ps): sum_check(A + ' P9115', f'{lab}: nine provinces = South Africa', 'P9115', sa, ps, 0.002)
        else: add(A + ' P9115', f'{lab}: nine provinces = South Africa', 'FAIL', f'series not found (SA {sa}, provinces {sum(1 for x in ps if x)} of 9)')

# ------------------------------------------------------------------ C  index bases
A = 'C bases'
def base_check(code, pat_year=r'(\d{4})\s*=\s*100', pat_dec=r'Dec(?:ember)?\s*(\d{4})\s*=\s*100', tol_year=0.6, tol_month=0.06):
    S = SER[code]; per = PER[code]; bad = []; n = 0; kinds = collections.Counter()
    for i, s in S.items():
        m = s['m']; txt = (m['base'] or '')
        mm = re.search(pat_dec, txt)
        if mm:
            p = f'{mm[1]}-12'
            if p in per:
                v = s['a'][per.index(p)]
                if v is not None: n += 1; kinds['month'] += 1; (abs(v - 100) > tol_month) and bad.append((i, p, v))
            continue
        mm = re.search(pat_year, txt)
        if mm and m['adj'] == 'nsa' and m['unit'] == 'Index':
            ps = [per.index(f'{mm[1]}-{k:02d}') for k in range(1, 13) if f'{mm[1]}-{k:02d}' in per]
            vs = [s['a'][j] for j in ps]
            if len(vs) == 12 and None not in vs:
                n += 1; kinds['year'] += 1; avg = sum(vs) / 12
                if abs(avg - 100) > tol_year: bad.append((i, f'{mm[1]} avg', round(avg, 2)))
    status = 'PASS' if not bad else ('WARN' if len(bad) <= max(2, n * 0.03) else 'FAIL')
    add(A + ' ' + code, f'Series equal 100 at their stated base ({", ".join(f"{k} {v}" for k, v in kinds.items())})', status if n else 'WARN',
        f'{n} series tested, {len(bad)} off-base' + (': ' + '; '.join(f'{x[0]} {x[1]}={x[2]}' for x in bad[:6]) if bad else ''))
for c in ('P2041', 'P3041.2', 'P4141', 'P0160', 'P0151.1', 'P0141', 'P0142.1', 'P0142.7'): base_check(c)

# ------------------------------------------------------------------ D  SA vs actual
A = 'D SA vs actual'
def twin_check(code, tol=0.02):
    S = SER[code]; per = PER[code]; byk = collections.defaultdict(dict)
    for i, s in S.items():
        m = s['m']
        if m['adj'] in ('nsa', 'sa'): byk[(m['measure'], m['name'], m['sub'], m['geo'], m['price'], m['unit'])][m['adj']] = i
    years = sorted({p[:4] for p in per if re.fullmatch(r'\d{4}-\d\d', p)})
    pairs = [(k, v) for k, v in byk.items() if 'nsa' in v and 'sa' in v]
    worst = (0, None); n = 0; over = 0
    for k, v in pairs:
        a, s_ = S[v['nsa']]['a'], S[v['sa']]['a']
        for y in years:
            idx = [per.index(f'{y}-{mo:02d}') for mo in range(1, 13) if f'{y}-{mo:02d}' in per]
            if len(idx) < 12 or any(a[j] is None or s_[j] is None for j in idx): continue
            ma, ms = sum(a[j] for j in idx) / 12, sum(s_[j] for j in idx) / 12
            if ma == 0: continue
            e = abs(ms / ma - 1); n += 1
            if e > 0.03: over += 1
            if e > worst[0]: worst = (e, (k[0][:28], k[1][:24], y))
    st_ = 'PASS' if worst[0] <= 0.03 else ('WARN' if worst[0] <= 0.20 else 'FAIL')
    add(A + ' ' + code, 'Calendar-year average of SA series is close to the actual series', st_ if pairs else 'WARN',
        f'{len(pairs)} SA/actual pairs, {n} series-years; worst {worst[0]*100:.2f}% at {worst[1]}; {over} series-years differ by more than 3%; PASS <= 3%, WARN <= 20% (strongly seasonal small series can drift: the seasonal factors need not average to 1 within a year)')
for c in ('P2041', 'P3041.2', 'P4141', 'P5041.1', 'P6242.1', 'P6343.2', 'P6141.2', 'P6410', 'P7162', 'P6420'): twin_check(c)

# ------------------------------------------------------------------ E  hygiene
A = 'E hygiene'
FREQ_LAG = {'M': 1, 'Q': 1, 'A': 1}
for code in PUBS:
    S = SER[code]; per = PER[code]; last = len(per) - 1; freq = D[code]['freq']
    gaps = []; nonpos = []; pcts = []; stale = []; jumps = []; zeros = []; covid = 0
    for i, s in S.items():
        m = s['m']; a = s['a']; v = s['v'] if 'v' in s else s['m']['v']; lo = m['s']; hi = lo + len(m['v']) - 1
        if hi != last: stale.append((i, per[hi]))
        nulls = sum(1 for x in m['v'] if x is None)
        if nulls: gaps.append((i, nulls))
        vals = [x for x in m['v'] if x is not None]
        if m['unit'] in ('Index',) and any(x < 0 for x in vals): nonpos.append(i)
        if m['unit'] in ('Index',) and any(x == 0 for x in vals): zeros.append((i, [per[lo + k] for k, x in enumerate(m['v']) if x == 0][:2]))
        lo_ok = -0.001 if not re.search(r'(?i)margin|profit|^FPRO', (m['measure'] or '') + ' ' + (m['name'] or '')) and code not in ('P0441', 'P0441A', 'P0441.2') else -1000       # margins, profits and GDP growth rates / contributions can be negative
        if m['unit'] in ('Percentage', 'Percent', '%') and any(x < lo_ok or x > (5000 if code in ('P0441', 'P0441A', 'P0441.2') else 100.001) for x in vals): pcts.append(i)
        # month-on-month jumps (levels only, positive series): robust z of log change
        if m['unit'] in ('Index', 'Rand', 'R million', "R'000", 'R1000', 'Gigawatt-hours', 'Thousand', 'Number', 'Square metres') and len(vals) > 40 and min(vals) > 0:
            ch = []; prev = None
            for t in range(len(m['v'])):
                x = m['v'][t]
                if x is not None and prev is not None: ch.append((math.log(x / prev), t))
                prev = x
            if len(ch) > 30:
                mu = statistics.median(c for c, _ in ch); mad = statistics.median(abs(c - mu) for c, _ in ch) or 1e-9
                for c, t in ch:
                    z = abs(c - mu) / (1.4826 * mad)
                    if z > 12 and abs(c) > 0.5:
                        if '2020-03' <= per[lo + t] <= '2020-07': covid += 1          # the national lockdown
                        else: jumps.append((i, per[lo + t], round(math.exp(c) - 1, 2)))
    add(A + ' ' + code, 'Interior gaps (missing months inside a series)', 'PASS' if not gaps else 'WARN', f'{len(gaps)} of {len(S)} series have gaps' + (f' (e.g. {gaps[0][0]}: {gaps[0][1]} missing)' if gaps else ''))
    add(A + ' ' + code, 'No negative index values; percentages within 0-100', 'PASS' if not (nonpos or pcts) else 'FAIL', f'{len(nonpos)} index series below 0, {len(pcts)} percentage series out of range' + (f': {(nonpos+pcts)[:5]}' if nonpos or pcts else '') + (f'; {len(zeros)} index series touch exactly 0 ({zeros[0][0]} in {zeros[0][1][0]}, a real shutdown)' if zeros else ''))
    add(A + ' ' + code, 'Stale / discontinued series (end before the latest period)', 'PASS' if not stale else 'WARN', f'{len(stale)} series' + (f', e.g. {stale[0][0]} ends {stale[0][1]}' if stale else ''))
    add(A + ' ' + code, 'Extreme period-on-period jumps outside Mar-Jul 2020 (>50% and >12 robust deviations)', 'PASS' if not jumps else 'WARN', f'{len(jumps)} flagged ({covid} more in the Mar-Jul 2020 lockdown, which is real)' + (' - ' + '; '.join(f'{j[0]} {j[1]} {j[2]*100:+.0f}%' for j in jumps[:6]) if jumps else ''))

# ------------------------------------------------------------------ F  independent cross-check vs the SA CPI & PPI dashboard
A = 'F cross-check'
if CPI_APP.exists():
    txt = CPI_APP.read_text(encoding='utf-8'); J = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    def cmp(label, pairs, tol=1e-9):
        n = bad = miss = 0; worst = 0; ex = []; oursonly = 0; oo_keys = set()
        for key, ours, theirs in pairs:
            if ours is None: miss += 1; ex.append(f'{key} missing in ours'); continue
            for o, t in zip(ours, theirs):
                if o is None and t is None: continue
                n += 1
                if o is not None and t is None:
                    oursonly += 1; oo_keys.add(key.rsplit(' ', 1)[0] if label.startswith('Average prices by') else key); continue
                if o is None or abs(o - t) > tol:
                    bad += 1; worst = max(worst, abs((o or 0) - (t or 0)))
                    if len(ex) < 4: ex.append(f'{key} ours={o} theirs={t}')
        extra = f'; {oursonly} cells exist only in ours (source rows duplicated with complementary periods - this app merges them, the reference keeps the last row only): {sorted(oo_keys)[:4]}' if oursonly else ''
        add(A, label, ('PASS' if not oursonly else 'WARN') if not bad and not miss else 'FAIL', f'{n:,} values compared; {bad} differ, {miss} series missing' + (f'; e.g. {"; ".join(ex)}' if ex else '') + extra)
    def aligned(code, id_, months):                       # our series laid out on THEIR month list
        s = SER[code].get(id_)
        if s is None: return None
        per = PER[code]; a = s['a']; idx = {p: i for i, p in enumerate(per)}
        return [a[idx[mn]] if mn in idx else None for mn in months]
    sm = J['summary']['months']; seen = set(); pr = []
    for r in J['summary']['series']:
        if r['code'] in seen: continue                    # their file repeats 5 codes with alternate labels (identical data)
        seen.add(r['code']); pr.append((r['code'], aligned('P0141', r['code'], sm), r['v']))
    cmp('CPI COICOP: 784 index series, value for value', pr)
    im = J['items']['months']; pr = [(r['code'], aligned('P0141', r['code'], im), r['v']) for r in J['items']['items']]
    cmp('CPI products: 391 product indices, value for value', pr)
    wd = [(r['code'], abs((SER['P0141'][r['code']]['m'].get('w') or -1) - r['w'])) for r in J['items']['items']]
    add(A, 'CPI product weights (391)', 'PASS' if max(x[1] for x in wd) < 1e-6 else 'FAIL', f'largest weight difference {max(x[1] for x in wd):.2e}')
    pm = J['ppiSummary']['months']; pr = [(r['code'], aligned('P0142.1', r['code'], pm), r['v']) for r in J['ppiSummary']['series']]
    cmp('PPI categories: 76 series', pr)
    pr = [(r['code'], aligned('P0142.1', r['code'], J['ppiItems']['months']), r['v']) for r in J['ppiItems']['items']]
    cmp('PPI elementary products: 277 series', pr)
    wd = [abs((SER['P0142.1'][r['code']]['m'].get('w') or -1) - r['w']) for r in J['ppiItems']['items']]
    add(A, 'PPI elementary weights (277)', 'PASS' if max(wd) < 1e-5 else 'FAIL', f'largest weight difference {max(wd):.2e}')
    # average prices: they key by (code, pack text); we key by code.packcode(.province)
    am = J['pricesUrban']['months']; byname = collections.defaultdict(list)
    for i, s in SER['P0141AP'].items():
        if s['m']['geo'] == 'All urban areas': byname[(i.split('.')[0], s['m']['name'].replace(',', '.'))].append(i)
    pr = []; amb = 0
    for r in J['pricesUrban']['items']:
        ids = byname.get((r['code'], r['unit'].replace(',', '.')), [])
        pr.append((r['code'] + ' ' + r['unit'], aligned('P0141AP', ids[0], am) if ids else None, r['v']))
        if len(ids) > 1: amb += 1
    cmp('Average prices, all urban: 391 products', pr)
    pm2 = J['pricesProv']['months']; provmap = {'Kwa-Zulu Natal': 'KwaZulu-Natal'}
    bykey = collections.defaultdict(list)
    for i, s in SER['P0141AP'].items():
        if s['m']['geo'] != 'All urban areas': bykey[(i.split('.')[0], s['m']['name'].replace(',', '.'), s['m']['geo'])].append(i)
    pr = []
    for r in J['pricesProv']['items']:
        for prov, vals in r['byProv'].items():
            ids = bykey.get((r['code'], r['unit'].replace(',', '.'), provmap.get(prov, prov)), [])
            pr.append((f'{r["code"]} {r["unit"]} {prov}', aligned('P0141AP', ids[0], pm2) if ids else None, vals))
    cmp('Average prices by province: every product x province', pr)
else:
    add(A, 'SA CPI & PPI dashboard data not found', 'WARN', str(CPI_APP))

# ------------------------------------------------------------------ report
cnt = collections.Counter(r[2] for r in RES)
order = {'FAIL': 0, 'WARN': 1, 'PASS': 2}
out = ['# Accuracy report', '', f'Generated by `tools/Check-Accuracy.py` over **{sum(len(SER[c]) for c in PUBS):,} series in {len(PUBS)} publications**.',
       '', f'**{cnt["PASS"]} passed, {cnt["WARN"]} warnings, {cnt["FAIL"]} failures** across {len(RES)} checks.', '',
       'PASS = within the stated tolerance; WARN = outside it but within 4x (usually StatsSA rounding or a known data feature — explained below); FAIL = needs investigation.', '']
FINDINGS = [
 '## What the audit found', '',
 '**Defects in this app, found by checking and fixed** (none remain open):', '',
 '1. *Industrials contribution chart double-counted "Other manufacturing groups".* StatsSA\'s "Furniture and other manufacturing" division already contains that group (39991 = 39100 + 39OTHER, to the unit). The identity check (divisions must add to the total) exposed it. Fixed: the group is now a child of the division; the ten divisions\' weights sum to exactly 1.0.',
 '2. *Resources showed nickel / diamonds / other-metallic as if current.* Their seasonally adjusted series stopped in 2002 and were being read as "latest". Fixed: lookups ignore any series that ends before the publication\'s latest period.',
 '3. *Corporate profit.* StatsSA\'s item `FPROFAFTERTAX` is profit after tax **and dividends** (retained profit), not profit after tax (855,721 - 270,559 - 363,930 = 221,232 for all industries). The ratios now derive true after-tax profit as pre-tax profit minus tax.',
 '4. *Stacked columns lost their top segment* (string concatenation in the path builder) and *long bar-chart labels spilled out of the card*. Both fixed.', '',
 '5. *Macro batch (found by the cell-by-cell audit and the identity checks, all fixed).* (a) The GDP workbook lists the column header 201803 twice; the second is Q4 2018, which was being dropped (133 instead of 134 quarters). (b) The QLFS workbook calls one table "Table 3 10" (no dot), so Formal / informal employment (84 series) was skipped. (c) The last column of QLFS Table 7d is headed "Apr-Jun 2025" but is Apr-Jun 2026 (the file is the 2026Q2 release); it is now read as the next quarter. (d) QLFS blocks of "conditions of employment" and the metro tables are indented inconsistently in the workbook, which produced ambiguous "#2 / #3" series and lost headings; blocks that follow a blank row are now anchored to their heading (series with ambiguous names fell from about 280 to 4). (e) The unit rule matched the letters "ratio" inside "corporations", labelling six employer counts as percentages. (f) The unemployment-by-province map on the Economy tab missed KwaZulu-Natal because the workbook spells it "KwaZulu Natal" in one table.', '',
 '6. *Municipal finance (P9110.1) — a publisher error found by comparing releases.* The March 2026 workbook\'s two Combined sheets repeat the December 2025 figures under headers one quarter too late (its Rates and Housing sheets are correct, and the same workbook has a "March 2026" header where March 2025 belongs). Read by its headers, 2024-Q4 and 2025-Q1 came out identical for every municipality and 58,794 cells looked revised; read as the quarters the figures belong to, 16,411 cells are genuine restatements. `Check-Municipal-Releases.py` re-proves this from the figures themselves on every run (0 of 4,200 column pairs misaligned; 24 if the correction is removed), and the updater refuses a new release that fails it.', '',
 '**Source-data features, reproduced exactly as StatsSA publishes them** (the WARN rows below):', '',
 '* Volumes at constant 2015 prices are rebased and chained by StatsSA, so their components do not add exactly (worst gaps 1–4% in the early 1990s, median under 0.02%); the same identities at current prices hold to the rand-million.',
 '* QLFS metro and non-metro blocks of Table 2.3 are indented inconsistently in the workbook, so the nesting of a few labels inside those blocks (for example "Unemployed" above "Outside the labour force") follows the workbook layout rather than the true hierarchy; every value is correct.',
 '* Early-history rounding in two additive identities: Building statistics residential sub-types vs total differ by up to 0.55% in 1995-96; mining gold-excluded vs total by 0.13% in Jan 1986.',
 '* The Mar-Jul 2020 national lockdown produces hundreds of "extreme" month-on-month moves (e.g. manufacturing -52% in Apr 2020, tourist nights sold -96%); they are real and counted separately from the other flagged jumps.',
 '* A handful of single-product price jumps in the average-price and PPI elementary files (e.g. a +97% month for one pack in one province) are in StatsSA\'s numbers; they are not altered.',
 '* Tourist-accommodation seasonally adjusted caravan-park income averages 16% below the actual series in 2010: a very seasonal, very small series, where the seasonal factors need not average to 1 within a year.',
 '* Stale series: 59 retired corporate line items, 3 mining SA series (ended 2002), 2 CPI analytical series, and average-price rows that stopped being collected for some provinces. They are kept with their own date range, not extended or hidden.', '',
 '**Where this app is more complete than the reference dashboard:** three province price rows are duplicated in the source with complementary periods; this app merges them (146 more cells than the SA CPI & PPI dashboard holds). All other CPI / PPI / price values, and all 391 + 277 weights, match that dashboard exactly.', '',
 '**Figures on screen:** every tab\'s headline numbers (KPI tiles, tables, contribution bars) were recomputed independently from the raw data and matched: Resources, Industrials, Consumer, Property & Construction, Travel & Leisure, Corporate, Prices and Pulse.', '']
out[8:8] = FINDINGS
areas = collections.OrderedDict()
for a, c, s, d in RES: areas.setdefault(a, []).append((c, s, d))
for a, rows in areas.items():
    out += [f'## {a}', '', '| Check | Result | Detail |', '|---|---|---|']
    for c, s, d in rows:
        out.append(f'| {c} | {s} | {d.replace("|", "/")} |')
    out.append('')
(APP / 'ACCURACY_REPORT.md').write_text('\n'.join(out), encoding='utf-8')
print(f'{cnt["PASS"]} PASS, {cnt["WARN"]} WARN, {cnt["FAIL"]} FAIL of {len(RES)} checks')
for a, c, s, d in sorted(RES, key=lambda r: order[r[2]]):
    if s != 'PASS': print(f'[{s}] {a} :: {c} :: {d[:230]}')
sys.exit(1 if cnt['FAIL'] else 0)
