"""Validate-Parse.py - independent cell-by-cell check of data/<code>.js against the source workbooks (read with openpyxl, not the PowerShell parser).
Run from the app folder:  python tools\\Validate-Parse.py
For every publication: every numeric period cell in every xlsx must appear, unchanged, in the generated file (and nothing else may).
Exit status 1 if any mismatch / missing / extra value is found."""
import glob, json, pathlib, re, sys
import openpyxl

CUR = {'q6': False}
def per(c):
    c = str(c)
    if CUR['q6']:
        m = re.fullmatch(r'(\d{4})0([1-4])', c)
        if m: return f'{m[1]}-Q{m[2]}'
    m = re.fullmatch(r'MO(\d\d)(\d{4})', c)
    if m: return f'{m[2]}-{m[1]}'
    m = re.fullmatch(r'QR(\d\d)(\d{4})', c)
    if m: return f'{m[2]}-Q{int(m[1])}'
    m = re.fullmatch(r'Y(\d{4})', c)
    if m: return m[1]
    m = re.fullmatch(r'[Mm](\d{4})(\d\d)', c)
    if m: return f'{m[1]}-{m[2]}'
    m = re.fullmatch(r'(\d{4})MO(\d\d)', c)               # 1980MO03
    if m: return f'{m[1]}-{m[2]}'
    if re.fullmatch(r'(19|20)\d\d', c): return c           # plain year header (P1101)
    if re.fullmatch(r'(19|20)\d\d\*', c): return c[:4]          # provisional year, '2023*' (P9115)

# id columns (header names) per publication; per-file overrides for the CPI/PPI product files
IDCOLS = {'P0021': ['H03', 'H05'], 'P0141AP': ['H03', 'H07', 'H09'], 'Report-30-02-03': ['H03', 'H05']}
FILE_IDFILTER = {'P0043.2': (re.compile('^P0043 legacy'), re.compile('^IN[VS]'))}      # legacy workbook: only the insolvency series are carried (see Parse-StatsSA.ps1)
QFS = {'P0044'}
from layouts import SHEETS, FOLDER, PROVS, num, CUSTOM, Q6, dedupe_q, QFSSM, qfssm_expected
FILE_IDCOLS = [(re.compile('8digit'), ['Eight digit code']), (re.compile('Elementary'), ['cpcProdCode'])]

def read_rows(path, sheet=0):
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[sheet]
    rows, blank = [], 0
    for r in ws.iter_rows(values_only=True):
        if any(c not in (None, '') for c in r):
            rows.append(r); blank = 0
        else:
            blank += 1
            if blank > 500: break          # sheets whose declared range runs to row 1,048,576
    return rows

def qfs_expected(path):
    wb = openpyxl.load_workbook(path, data_only=True); out = {}; last = ''
    MQ = {'mar': 1, 'jun': 2, 'sep': 3, 'dec': 4}
    for ws in wb.worksheets:
        rows = [r for r in ws.iter_rows(values_only=True) if any(c not in (None, '') for c in r)]
        hr = next((i for i, r in enumerate(rows[:14]) if r[0] == 'Item'), None)
        tr = next((i for i, r in enumerate(rows[:14]) if isinstance(r[0], str) and r[0].startswith('Quarterly Financial Statistics Survey')), None)
        if hr is None or tr is None: continue
        m = re.search(r'(?i)(mar|jun|sep|dec)[a-z]*\s*(\d{4})', rows[tr][0]); p = f'{m[2]}-Q{MQ[m[1].lower()]}'; last = max(last, p)
        ind, cur = {}, ''
        for c in range(1, len(rows[hr])):
            t = rows[hr][c]
            if t not in (None, ''): cur = re.sub(r'(?<=industry)\d$', '', str(t).strip()).strip()
            ind[c] = cur
        size = {c: str(v).strip() for c, v in enumerate(rows[hr + 1]) if c >= 1 and v not in (None, '')}
        seen = {}
        for r in rows[hr + 2:]:
            label = str(r[0]).strip() if r[0] not in (None, '') else ''
            if not label or re.match(r'^\d ', label) or label.startswith('Range for'): continue
            if not any(c not in (None, '') for c in r[1:]): continue
            seen[label] = seen.get(label, 0) + 1; key = label if seen[label] == 1 else f'{label} #{seen[label]}'
            for c in range(1, len(r)):
                if c not in ind or not ind[c] or r[c] in (None, ''): continue
                out.setdefault(f'{key}|{ind[c]}|{size.get(c, "")}', {})[p] = float(r[c])
    return out, last

def main():
    tot = bad = missing = extra = 0
    for js in sorted(glob.glob('data/P*.js') + glob.glob('data/Report-*.js')):
        CUR['q6'] = pathlib.Path(js).stem in Q6
        code = pathlib.Path(js).stem
        d = json.loads(re.search(r'\]=(\{.*\});\s*$', open(js, encoding='utf-8').read(), re.S)[1])
        P = d['periods']; ser = {}
        for s in d['series']:
            ser[s['id']] = {P[s['s'] + i]: v for i, v in enumerate(s['v']) if v is not None}
        exp, files = {}, []
        if code in QFS:
            fl = []
            for x in glob.glob(f'source-data/{code}/**/*.xlsx', recursive=True):
                e, lp = qfs_expected(x); fl.append((lp, e))
            for lp, e in sorted(fl, key=lambda t: t[0]):
                for sid, pv in e.items(): exp.setdefault(sid, {}).update(pv)
            files = []
        if code in QFSSM:
            fl = []
            for x in glob.glob(f'source-data/{code}/**/*.xlsx', recursive=True):
                e, lp = qfssm_expected(x); fl.append((lp, e))
            for lp, e in sorted(fl, key=lambda t: t[0]):
                for sid, pv in e.items(): exp.setdefault(sid, {}).update(pv)
        if code in CUSTOM:
            for x in glob.glob(f'source-data/{code}/**/*.xlsx', recursive=True):
                if '_archive' in x: continue
                e, _ = CUSTOM[code](x)
                for sid, pv in e.items(): exp.setdefault(sid, {}).update(pv)
        for x in glob.glob(f'source-data/{FOLDER.get(code, code)}/**/*.xlsx', recursive=True):
            if '_archive' in x or code in QFS or code in QFSSM or code in CUSTOM: continue
            for sh in SHEETS.get(code, [0]):
                rows = read_rows(x, sh); files.append((x, rows))
        def last(rows):
            h = rows[0]
            if h[0] == 'month': return max(per(r[-1]) for r in rows[1:])
            return max([per(c) for c in h if per(c)] or [''])
        files.sort(key=lambda t: last(t[1]))
        for x, rows in files:
            h = list(rows[0])
            if h[0] == 'month':                       # transposed legacy file (P6343.2 1998-99): fills gaps only
                for j in range(2, h.index('yy')):
                    for r in rows[1:]:
                        v = r[j]; p = per(r[-1])
                        if isinstance(v, (int, float)): exp.setdefault(h[j], {}).setdefault(p, v)
                continue
            idcols = IDCOLS.get(code, ['H03'])
            for rx, cols in FILE_IDCOLS:
                if rx.search(x): idcols = cols
            flt = FILE_IDFILTER.get(code); flt = flt[1] if flt and flt[0].search(pathlib.Path(x).name) else None
            hidx = {c: j for j, c in enumerate(h) if c}
            idj = [hidx[c] for c in idcols if c in hidx]
            pc = dedupe_q([(j, per(c)) for j, c in enumerate(h) if per(c)])
            for r in rows[1:]:
                parts = [str(r[j]).strip() for j in idj if r[j] not in (None, '')]
                if not parts: continue
                sid = '.'.join(p for p in parts if p)
                if flt and not flt.search(sid): continue
                for j, p in pc:
                    v = r[j]
                    if v is None or v == '' or (isinstance(v, str) and v.strip() in ('.', '-', '~')): continue
                    try: v = float(v)
                    except Exception:
                        print('non-numeric', code, sid, p, repr(v)); continue
                    exp.setdefault(sid, {})[p] = v
        n = 0
        for sid, pv in exp.items():
            if sid not in ser:
                if pv: missing += len(pv); print('MISSING series', code, sid)
                continue
            for p, v in pv.items():
                n += 1; g = ser[sid].get(p)
                if g is None: missing += 1; print('missing value', code, sid, p)
                elif abs(g - v) > 1e-6 * max(1, abs(v)): bad += 1; print('MISMATCH', code, sid, p, g, v)
        ex = sum(1 for sid in ser for p in ser[sid] if p not in exp.get(sid, {}))
        extra += ex; tot += n
        print(f'{code:8} series={len(ser):5} cells checked={n:7} extra-in-output={ex}')
    print('TOTAL cells', tot, 'mismatch', bad, 'missing', missing, 'extra', extra)
    sys.exit(1 if (bad or missing or extra) else 0)

if __name__ == '__main__':
    main()
