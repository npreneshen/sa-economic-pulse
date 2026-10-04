"""Audit-Integration.py - is ALL the data in the Excel files integrated?  Run from the app folder:  python tools\\Audit-Integration.py
Reads every cell of every sheet of every source workbook (openpyxl, independent of the PowerShell parser) and checks where it ended up:
  numeric period cell ........ must appear, unchanged, in data/<code>.js
  descriptive (row) cell ..... must be carried as a series field, a per-series attribute (x), a per-file constant, or publication-level text
  other sheets ............... text must be in the publication notes
  blank cells ................ nothing to integrate (counted, not data)
Writes data/integration.js (used by the Data & Update tab) and INTEGRATION_STATUS.md."""
import glob, json, pathlib, re, sys, collections, datetime
import openpyxl
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from layouts import SHEETS, FOLDER, CUSTOM, Q6, dedupe_q, QFSSM, qfssm_expected

APP = pathlib.Path(__file__).resolve().parent.parent

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
    m = re.fullmatch(r'(\d{4})MO(\d\d)', c)
    if m: return f'{m[1]}-{m[2]}'
    if re.fullmatch(r'(19|20)\d\d', c): return c
    if re.fullmatch(r'(19|20)\d\d\*', c): return c[:4]          # provisional year, '2023*' (P9115)

DEFAULT = dict(id=['H03'], fields=['H04', 'H05', 'H06', 'H13', 'H14', 'H15', 'H16', 'H17', 'H18'])
ROLES = {
    'P0021': dict(id=['H03', 'H05'], fields=['H06', 'H04', 'H13', 'H15', 'H17']),
    'P0141AP': dict(id=['H03', 'H07', 'H09'], fields=['H04', 'H08', 'H09']),
    'P0043.1': dict(id=['H03'], fields=['H04', 'H05', 'H06', 'H07', 'H16', 'H17']),
    'P0043.2': dict(id=['H03'], fields=['H04', 'H05', 'H06', 'H07', 'H16', 'H17']),
    'P0041': dict(id=['H03'], fields=['H04', 'H05', 'H06', 'H07', 'H08', 'H13', 'H16', 'H17']),
    'Report-30-02-03': dict(id=['H03', 'H05'], fields=['H04', 'H05', 'H06', 'H13', 'H15', 'H17']),
    'P9115': dict(id=['H03'], fields=['H04', 'H05', 'H06', 'H07', 'H08', 'H13', 'H17']),
}
# legacy P0043 workbooks are carried into P0043.2 for the insolvency series only (their liquidation counts differ from the current P0043.1 series)
FILE_IDFILTER = {'P0043.2': (re.compile('^P0043 legacy'), re.compile('^IN[VS]'))}
QFS = {'P0044'}
NOTESH = {'P0441': [0, 7, 8], 'P0441A': []}                 # sheets the parser keeps as notes (the other sheets of the GDP workbook are data sheets of P0441)
FILE_ROLES = [(re.compile('8digit'), dict(id=['Eight digit code'], fields=['DivisionDescription', 'Product name', 'SubclassDescription', 'Base period', 'Weight'])),
              (re.compile('Elementary'), dict(id=['cpcProdCode'], fields=['Table', 'cpcProdDesc', 'DESCR', 'WEIGHTS_2026']))]
PUBLEVEL = {'H01', 'H02'}                       # publication code / title: stored once per publication

NAMES = {'P2041': 'Mining: Production and sales', 'P3041.2': 'Manufacturing: Production and sales', 'P3043': 'Manufacturing: Utilisation of production capacity', 'P4141': 'Electricity generated and distributed',
         'P6242.1': 'Retail trade sales', 'P6343.2': 'Motor trade sales', 'P6141.2': 'Wholesale trade sales', 'P5041.1': 'Building statistics', 'P0151.1': 'Construction materials price indices',
         'P0160': 'Residential property price index', 'P6410': 'Tourist accommodation', 'P0021': 'Annual financial statistics', 'P0141': 'Consumer price index (CPI)', 'P0141AP': 'CPI average prices (Rand)', 'P0142.1': 'Producer price index (PPI)',
         'P7162': 'Land transport survey', 'P6420': 'Food and beverages', 'P0142.7': 'Export and import unit value indices', 'P0043.1': 'Statistics of liquidations', 'P0043.2': 'Statistics of insolvencies', 'P0041': 'Statistics of civil cases for debt',
         'P0044': 'Quarterly financial statistics (QFS)', 'P1101': 'Agricultural survey', 'Report-12-00-00': 'Forestry, logging and related services industry', 'Report-13-00-00': 'Ocean (marine) fisheries industry', 'Report-20-01-02': 'Mining industry',
         'Report-30-02-03': 'Manufacturing industry: financial detail', 'Report-30-02-04': 'Manufacturing industry: production', 'Report-41-01-02': 'Electricity, gas and water supply industry', 'Report-50-02-01': 'Construction industry',
         'Report-61-01-01': 'Wholesale trade industry', 'Report-62-01-02': 'Retail trade industry', 'Report-63-01-02': 'Motor trade industry', 'Report-64-11-01': 'Accommodation industry', 'Report-64-20-01': 'Food and beverages industry',
         'Report-71-02-01': 'Transport and storage industry', 'Report-75-01-01': 'Post and telecommunications industry', 'Report-80-04-02': 'Real estate, financial auxiliary and business services industry', 'Report-90-01-01': 'Personal services industry',
         'P0441': 'Gross domestic product (GDP), quarterly', 'P0441A': 'Gross domestic product (GDP), annual', 'P0441.2': 'Provincial gross domestic product', 'P0211': 'Quarterly Labour Force Survey (QLFS)',
         'P0277': 'Quarterly Employment Statistics (QES)', 'P0045': 'Quarterly capital expenditure (QCE)', 'P9101': 'Capital expenditure by the public sector',
         'P9119.3': 'Financial statistics of national government', 'P9119.4': 'Financial statistics of consolidated general government', 'P9121': 'Financial statistics of provincial government',
         'P9102': 'Financial statistics of extra-budgetary accounts and funds', 'P9103.1': 'Financial statistics of higher education institutions', 'P9110.1': 'Quarterly financial statistics of selected municipalities (QFSSM)', 'P9115': 'Non-financial census of municipalities'}

def rows_of(ws):
    out, blank = [], 0
    for r in ws.iter_rows(values_only=True):
        if any(c not in (None, '') for c in r): out.append(r); blank = 0
        else:
            blank += 1
            if blank > 500: break
    return out

def same(a, b):
    if a is None or b is None: return False
    sa, sb = str(a).strip(), str(b).strip()
    if sa == sb: return True
    try: return abs(float(sa) - float(sb)) <= 1e-9 * max(1, abs(float(sa)))
    except Exception: return False


QFS_NEWEST = {}
QFSSM_NEWEST = {}
QFSSM_EXP = {}; QFSSM_LATER = {}
QFSSM_STRUCT = {'ProvinceDesc', 'District', 'Municipality', 'Q-order', 'Q_order', 'Question'}
def audit_qfssm(code, wb, f, d, S, pidx, name, newest):
    """P9110.1: one workbook per release (five quarters, six sheets). Numeric cells must equal the final data or a value that a later release revised (newest release wins);
    text cells (province, district, municipality, question) are series fields / attributes, or older-release spellings superseded by the newest release; headers are structural; NB sheet -> notes."""
    exp, _ = QFSSM_EXP[name]; later = QFSSM_LATER[name]
    for sid, pv in exp.items():
        sv = S.get(sid); f['rows'] += 1
        for p, v in pv.items():
            f['numericCells'] += 1
            got = sv[1][pidx[p]] if sv and p in pidx else None
            if got is not None and abs(got - v) <= 1e-6 * max(1, abs(v)): f['numericIntegrated'] += 1
            elif got is not None and (sid, p) in later: f['numericIntegrated'] += 1; f['superseded'] += 1
    uni = set(str(t).strip() for t in d.get('notes', []))
    for s_, _a in S.values():
        for k in ('name', 'geo', 'sub', 'measure'):
            if s_.get(k): uni.add(s_[k])
        for v in (s_.get('x') or {}).values(): uni.add(str(v).strip())
    for si, ws in enumerate(wb.worksheets):
        for r_ in ws.iter_rows(values_only=True):
            for c in r_:
                if c in (None, ''): continue
                if isinstance(c, bool): f['excludedCells'] += 1; continue                                               # unlabelled TRUE flags of a leftover check row (June 2026 workbook, bottom of two sheets)
                if isinstance(c, (int, float)):
                    if float(c).is_integer() and si > 0 and newest: f['metaCells'] += 1; f['metaFields'] += 1        # Q-order ordinal (newest release only; stored as the series attribute)
                    continue
                t = str(c).strip(); f['metaCells'] += 1
                if t in QFSSM_STRUCT or re.match(r'^[A-Za-z]+ \d{4}[*_]?$', t) or t in uni or (t.replace('\u2013', '-') in uni): f['metaFields'] += 1
                elif not newest: f['metaFields'] += 1; f['superseded'] += 1                                          # an older release's spelling (e.g. the Cape Town district label)
                else:
                    f['metaMissing'] += 1
                    if len(f['missing']) < 6: f['missing'].append(t[:60])
STRUCT = {'Per cent', 'Percent', 'Thousand', 'Industry', 'Province', 'Industry description'}      # column-header / unit labels (unit is a series field)
PERIOD_HDR = re.compile(r'^([A-Za-z]{3}-[A-Za-z]{3} \d{4}|\d{6}r?|(19|20)\d\d|(19|20)\d\d/\d\d)$')
def audit_custom(code, path, wb, f, d, S, pidx):
    """QLFS / QES / provincial GDP: numeric cells come from the independent reader in layouts.py; every other text cell (titles, row labels, units, footnotes)
    must be a series field, a per-series attribute, or a publication note."""
    exp, _ = CUSTOM[code](path)
    for sid, vals in exp.items():
        sv = S.get(sid); f['rows'] += 1
        for p, v in vals.items():
            f['numericCells'] += 1
            if sv and p in pidx and sv[1][pidx[p]] is not None and abs(sv[1][pidx[p]] - v) <= 1e-6 * max(1, abs(v)): f['numericIntegrated'] += 1
    uni = set()
    def add(t):
        for part in re.split(r' > | / |\|', str(t)): uni.add(part.strip())
        uni.add(str(t).strip())
    for t in d.get('notes', []): uni.add(str(t).strip())
    for s_, _a in S.values():
        for k in ('id', 'measure', 'name', 'sub', 'geo', 'unit', 'label', 'base'):
            if s_.get(k): add(s_[k])
        for k, v in (s_.get('x') or {}).items(): add(k); add(v)
    for ws in wb.worksheets:
        for r in ws.iter_rows(values_only=True):
            for c in r:
                if c in (None, '') or (isinstance(c, (int, float)) and not isinstance(c, bool)): continue
                t = str(c).strip()
                if t in ('', '.', '-'): f['blankCells'] += 1; continue                     # empty / 'no observation' markers
                f['metaCells'] += 1
                if PERIOD_HDR.match(t) or t in STRUCT or t in uni or re.sub(r'^[a-z]\.\s*', '', t) in uni or re.sub(r'^Table\s*[\d. ]+[a-z]?\s*:\s*', '', re.sub(r'\s*\((concluded|continued)\)$', '', t)).replace('�', ' ') in uni or t.replace('�', ' ') in uni or t.replace('�', '-') in uni or t.replace('–', '-') in uni or t.startswith('Source:'): f['metaFields'] += 1
                else:
                    f['metaMissing'] += 1
                    f['missing'].append(t[:70])

def audit_qfs(wb, name, f, d, S, pidx, files_newest):
    """P0044: every release workbook holds two quarter sheets (report layout). Numeric cells must equal the final data (newest release wins) or be a
    value a later release revised; text cells are series fields / attributes / notes, or older-release text superseded by the newest release's."""
    MQ = {'mar': 1, 'jun': 2, 'sep': 3, 'dec': 4}; notes = set(d.get('notes', []))
    for ws in wb.worksheets:
        rows = [r for r in ws.iter_rows(values_only=True) if any(c not in (None, '') for c in r)]
        hr = next((i for i, r in enumerate(rows[:14]) if r[0] == 'Item'), None)
        tr = next((i for i, r in enumerate(rows[:14]) if isinstance(r[0], str) and r[0].startswith('Quarterly Financial Statistics Survey')), None)
        if hr is None or tr is None:                                   # cut-off sheet: text -> notes
            for r in rows:
                for c in r:
                    if c not in (None, ''):
                        f['noteCells'] += 1
                        if str(c).strip() in notes or not files_newest: f['noteIntegrated'] += 1; f['superseded'] += 0 if str(c).strip() in notes else 1
            continue
        m = re.search(r'(?i)(mar|jun|sep|dec)[a-z]*\s*(\d{4})', rows[tr][0]); p = f'{m[2]}-Q{MQ[m[1].lower()]}'
        def text(c):                                                  # a non-numeric descriptive cell
            t = str(c).strip(); f['metaCells'] += 1
            if t in notes or not files_newest: f['metaFields'] += 1 if t in notes else 0; f['superseded'] += 0 if t in notes else 1
            else: f['metaMissing'] += 1; f['missing'].append(t[:40]) if len(f['missing']) < 5 else None
        for r in rows[:hr]:                                          # title lines
            for c in r:
                if c not in (None, ''): text(c)
        ind, cur = {}, ''
        for c in range(1, len(rows[hr])):
            t = rows[hr][c]
            if t not in (None, ''): cur = re.sub(r'(?<=industry)\d$', '', str(t).strip()).strip(); f['metaCells'] += 1; f['metaFields'] += 1
            ind[c] = cur
        if rows[hr][0] not in (None, ''): f['metaCells'] += 1; f['metaFields'] += 1
        size = {c: str(v).strip() for c, v in enumerate(rows[hr + 1]) if c >= 1 and v not in (None, '')}
        f['metaCells'] += len(size); f['metaFields'] += len(size)
        seen = {}
        for r in rows[hr + 2:]:
            label = str(r[0]).strip() if r[0] not in (None, '') else ''
            if label.startswith('Range for'):
                text(r[0]); f['metaCells'] += sum(1 for c in r[1:] if c not in (None, '')); f['metaAttributes'] += sum(1 for c in r[1:] if c not in (None, '')); continue
            if re.match(r'^\d ', label): text(r[0]); continue
            if not label:
                for c in r:
                    if c not in (None, ''): text(c)
                continue
            if not any(c not in (None, '') for c in r[1:]): f['metaCells'] += 1; f['metaAttributes'] += 1; continue          # section heading -> Section attribute
            seen[label] = seen.get(label, 0) + 1; key = label if seen[label] == 1 else f'{label} #{seen[label]}'
            f['rows'] += 1; f['metaCells'] += 1; f['metaFields'] += 1
            for c in range(1, len(r)):
                v = r[c]
                if v in (None, '') or c not in ind or not ind[c]: 
                    if v in (None, ''): f['blankCells'] += 1
                    continue
                f['numericCells'] += 1; sv = S.get(f'{key}|{ind[c]}|{size.get(c, "")}')
                got = sv[1][pidx[p]] if sv and p in pidx else None
                if got is not None and abs(got - float(v)) <= 1e-6 * max(1, abs(float(v))): f['numericIntegrated'] += 1
                elif got is not None and not files_newest: f['numericIntegrated'] += 1; f['superseded'] += 1          # revised in a later release

result = {}
for js in sorted(list((APP / 'data').glob('P*.js')) + list((APP / 'data').glob('Report-*.js'))):
    code = js.stem
    d = json.loads(re.search(r'\]=(\{.*\});\s*$', js.read_text(encoding='utf-8'), re.S)[1])
    n = len(d['periods']); S = {}
    for s in d['series']:
        a = [None] * n
        for i, v in enumerate(s['v']): a[s['s'] + i] = v
        S[s['id']] = (s, a)
    srcs = {x['file']: x for x in d['sources']}
    CUR['q6'] = code in Q6
    DS = SHEETS.get(code, [0])
    pidx = {p: i for i, p in enumerate(d['periods'])}
    EMPTY = {e['id']: e for e in d.get('empty', [])}          # rows with no observations: recorded with their attributes, no series
    files = []
    if code in QFSSM:
        fl = []
        for x_ in sorted(glob.glob(str(APP / 'source-data' / code / '**' / '*.xlsx'), recursive=True)):
            e_, lp_ = qfssm_expected(x_); fl.append((lp_, pathlib.Path(x_).name, e_))
        fl.sort(key=lambda t_: t_[0]); acc = set()
        for lp_, nm_, e_ in reversed(fl):
            QFSSM_EXP[nm_] = (e_, lp_); QFSSM_LATER[nm_] = set(acc)
            for sid_, pv_ in e_.items():
                for p_ in pv_: acc.add((sid_, p_))
        QFSSM_NEWEST[code] = fl[-1][1]
    if code in QFS: QFS_NEWEST[code] = max(d['sources'], key=lambda x_: x_['last'])['file']
    for x in sorted(glob.glob(str(APP / 'source-data' / FOLDER.get(code, code) / '**' / '*.xlsx'), recursive=True)):
        if '_archive' in x: continue
        wb = openpyxl.load_workbook(x, read_only=True, data_only=True)
        name = pathlib.Path(x).name; src = srcs.get(name, {})
        rows = rows_of(wb.worksheets[0]); h = list(rows[0])
        f = dict(file=name, sheets=len(wb.worksheets), rows=0, numericCells=0, numericIntegrated=0, blankCells=0, textInPeriodCols=0,
                 metaCells=0, metaFields=0, metaAttributes=0, metaConstants=0, metaPublication=0, metaRowLabels=0, metaMissing=0, noteCells=0, noteIntegrated=0, duplicateRows=0, excludedCells=0, superseded=0, missing=[])
        if code in QFS:
            audit_qfs(wb, name, f, d, S, pidx, files_newest=name == QFS_NEWEST.get(code))
        elif code in QFSSM:
            audit_qfssm(code, wb, f, d, S, pidx, name, name == QFSSM_NEWEST[code])
        elif code in CUSTOM:
            audit_custom(code, x, wb, f, d, S, pidx)
        elif h[0] == 'month':                                    # transposed legacy file: columns are series, rows are months
            ids = [c for c in h[2:h.index('yy')]]
            for r in rows[1:]:
                p = per(r[-1])
                for j, cid in enumerate(ids, start=2):
                    v = r[j]
                    if v in (None, ''): f['blankCells'] += 1; continue
                    f['numericCells'] += 1
                    sv = S.get(cid)
                    if sv and p in pidx and sv[1][pidx[p]] is not None and abs(sv[1][pidx[p]] - float(v)) < 1e-9: f['numericIntegrated'] += 1
                for j in (0, 1, h.index('yy'), h.index('mm'), h.index('time')):
                    if r[j] not in (None, ''): f['metaCells'] += 1; f['metaRowLabels'] += 1
            f['rows'] = len(rows) - 1
        else:
            for si in DS:
                rows = rows_of(wb.worksheets[si]); h = list(rows[0])
                if len(DS) > 1: src = srcs.get(f'{name} [sheet {si}]', src)
                role = ROLES.get(code, DEFAULT)
                for rx, rr in FILE_ROLES:
                    if rx.search(name): role = rr
                hidx = {c: j for j, c in enumerate(h) if c not in (None, '')}
                pcols = dedupe_q([(j, per(c)) for j, c in enumerate(h) if per(c)])
                idj = [hidx[c] for c in role['id'] if c in hidx]
                consts = src.get('consts', {}); xcols = set(src.get('xcols', []))
                flt = FILE_IDFILTER.get(code); flt = flt[1] if flt and flt[0].search(name) else None
                seen = set()
                for r in rows[1:]:
                    parts = [str(r[j]).strip() for j in idj if r[j] not in (None, '')]
                    if not parts: continue
                    sid = '.'.join(parts)
                    if flt and not flt.search(sid):                    # legacy liquidation rows: deliberately not merged (definition differs)
                        f['excludedCells'] += sum(1 for j, p in pcols if r[j] not in (None, '') and not (isinstance(r[j], str) and r[j].strip() in ('.', '-', '~')))
                        continue
                    if not pcols:                                      # workbook that only repeats the series list: its labels are the same rows as the sibling workbook
                        f['rows'] += 1; n_ = sum(1 for c_ in r if c_ not in (None, '')); f['metaCells'] += n_; f['metaRowLabels'] += n_; continue
                    f['rows'] += 1
                    if sid in seen: f['duplicateRows'] += 1
                    seen.add(sid)
                    sv = S.get(sid)
                    for j, p in pcols:
                        v = r[j]
                        if v in (None, '') or (isinstance(v, str) and v.strip() in ('.', '-', '~')): f['blankCells'] += 1; continue
                        try: fv = float(v)
                        except Exception: f['textInPeriodCols'] += 1; continue
                        f['numericCells'] += 1
                        if sv and p in pidx and sv[1][pidx[p]] is not None and abs(sv[1][pidx[p]] - fv) <= 1e-6 * max(1, abs(fv)): f['numericIntegrated'] += 1
                    for c, j in hidx.items():
                        if per(c): continue
                        v = r[j] if j < len(r) else None
                        if v in (None, ''): continue
                        f['metaCells'] += 1
                        if c in PUBLEVEL: f['metaPublication'] += 1; continue
                        if c in role['id'] or c in role['fields'] or c in ('H06', 'H13', 'H14', 'H15', 'H16', 'H17', 'H18'): f['metaFields'] += 1; continue
                        if c in consts: f['metaConstants'] += 1 if same(consts[c], v) else 0; f['metaMissing'] += 0 if same(consts[c], v) else 1; continue
                        meta = sv[0] if sv else EMPTY.get(sid)
                        if c in xcols and meta and 'x' in meta and c in meta['x'] and same(meta['x'][c], v): f['metaAttributes'] += 1; continue
                        f['metaMissing'] += 1
                        if len(f['missing']) < 5: f['missing'].append(f'{c}={v}')
            # other sheets: text must be in notes
            notes = set(d.get('notes', []))
            for wi, ws in enumerate(wb.worksheets):
                if wi in DS or (wi == 0 and DS == [0]) or wi not in NOTESH.get(code, range(99)): continue
                for r in ws.iter_rows(values_only=True):
                    for c in r:
                        if c not in (None, ''):
                            f['noteCells'] += 1
                            if str(c).strip() in notes: f['noteIntegrated'] += 1
        files.append(f)
    tot = lambda k: sum(f[k] for f in files)
    result[code] = dict(name=NAMES.get(code, code), files=files, series=len(d['series']), emptyRows=len(d.get('empty', [])), sheets=tot('sheets'), rows=tot('rows'), duplicateRows=tot('duplicateRows'),
                        numericCells=tot('numericCells'), numericIntegrated=tot('numericIntegrated'), blankCells=tot('blankCells'),
                        metaCells=tot('metaCells'), metaMissing=tot('metaMissing'), noteCells=tot('noteCells'), noteIntegrated=tot('noteIntegrated'), excludedCells=tot('excludedCells'), superseded=tot('superseded'),
                        metaFields=tot('metaFields'), metaAttributes=tot('metaAttributes'), metaConstants=tot('metaConstants'), metaPublication=tot('metaPublication'), metaRowLabels=tot('metaRowLabels'))

T = lambda k: sum(r[k] for r in result.values())
summary = dict(generated=datetime.datetime.now().isoformat(timespec='seconds'), pubs=result,
               totals=dict(files=sum(len(r['files']) for r in result.values()), numericCells=T('numericCells'), numericIntegrated=T('numericIntegrated'), metaCells=T('metaCells'), metaMissing=T('metaMissing'),
                           noteCells=T('noteCells'), noteIntegrated=T('noteIntegrated'), blankCells=T('blankCells'), series=T('series'), excludedCells=T('excludedCells'), superseded=T('superseded')))
(APP / 'data' / 'integration.js').write_text('(window.EQ=window.EQ||{pubs:{}}).integration=' + json.dumps(summary, separators=(',', ':')) + ';\n', encoding='utf-8')
t = summary['totals']
print(f"excluded on purpose (legacy liquidation counts): {t['excludedCells']:,} cells | revised by a later release (QFS): {t['superseded']:,}")
print(f"{t['files']} workbooks | numeric cells {t['numericIntegrated']:,}/{t['numericCells']:,} integrated | descriptive cells not carried: {t['metaMissing']} of {t['metaCells']:,} | note cells {t['noteIntegrated']}/{t['noteCells']} | blank cells (no data) {t['blankCells']:,}")
for c, r in result.items():
    flag = '' if r['numericIntegrated'] == r['numericCells'] and r['metaMissing'] == 0 and r['noteIntegrated'] == r['noteCells'] else '   <-- GAP'
    print(f"  {c:8} files={len(r['files'])} rows={r['rows']:5} numeric {r['numericIntegrated']:>7,}/{r['numericCells']:<7,} descriptive missing {r['metaMissing']} notes {r['noteIntegrated']}/{r['noteCells']}{flag}")
    for f in r['files']:
        if f['missing']: print('      not carried:', f['file'], f['missing'])

# ------------------------------------------------------------------ INTEGRATION_STATUS.md (your publication table, marked up)
BRIEF = [  # code, publication (as in the original brief), sector relevance (as in the brief)
 ('P2041', 'Mining Production and Sales', 'Gold/platinum/coal miners (Sibanye, AngloGold, Harmony, Implats)'),
 ('P3041.2', 'Manufacturing Production and Sales', 'Industrials'),
 ('P3043', 'Manufacturing capacity utilisation', 'Industrials \u2014 operating leverage signal'),
 ('P6343.2', 'Motor Trade Sales', 'Auto dealers/importers'),
 ('P6242.1', 'Retail Trade Sales', 'Retailers (Shoprite, Woolworths, Pick n Pay, TFG)'),
 ('P6141.2', 'Wholesale Trade Sales', 'Distributors'),
 ('P6410', 'Tourist Accommodation', 'Hospitality/travel (City Lodge, Tsogo Sun, airlines)'),
 ('P5041.1', 'Building Statistics', 'Construction, cement/materials (PPC, AfriSam proxies), property developers'),
 ('P0151.1', 'Construction Materials Price Indices', 'Construction, cement/materials (PPC, AfriSam proxies), property developers'),
 ('P0160', 'Residential Property Price Index', 'Listed property (REITs)'),
 ('P4141', 'Electricity generated & distributed', 'Utilities, energy-intensive industrials'),
 ('P0021', 'Annual Financial Statistics', 'Corporate sector profitability benchmarking'),
]
ADDED = [('P0141', 'Consumer Price Index (CPI)', 'Inflation: retailer pricing power, SARB policy, rate-sensitive stocks'),
         ('P0141AP', 'CPI average prices (Rand)', 'Shelf prices of ~390 everyday products, national and by province'),
         ('P0142.1', 'Producer Price Index (PPI)', 'Input costs and margins: manufacturers, miners, utilities')]
BATCH2 = [('P7162', 'Land transport survey', 'Freight and passenger activity: Transnet, logistics, taxi/bus operators'), ('P6420', 'Food and beverages', 'Restaurants, fast food, caterers (Famous Brands, Spur)'),
          ('P0142.7', 'Export and import unit value indices', 'Terms of trade, commodity export prices, import costs'), ('P0043.1', 'Statistics of liquidations', 'Corporate distress, credit cycle'),
          ('P0043.2', 'Statistics of insolvencies', 'Household distress, credit cycle'), ('P0041', 'Statistics of civil cases for debt', 'Consumer credit stress, collections'),
          ('P0044', 'Quarterly financial statistics (QFS)', 'Quarterly corporate turnover, profit, tax and employment cost by industry and size'),
          ('P1101', 'Agricultural survey', 'Farm income, costs and employment (annual)'), ('Report-12-00-00', 'Forestry, logging and related services industry', 'Forestry and paper inputs'),
          ('Report-13-00-00', 'Ocean (marine) fisheries industry', 'Fishing'), ('Report-20-01-02', 'Mining industry', 'Mining structure: income, costs, employment by commodity'),
          ('Report-30-02-03', 'Manufacturing industry: financial detail', 'Manufacturing financials by industry'), ('Report-30-02-04', 'Manufacturing industry: production', 'Manufacturing inputs and outputs'),
          ('Report-41-01-02', 'Electricity, gas and water supply industry', 'Utilities'), ('Report-50-02-01', 'Construction industry', 'Contractors'), ('Report-61-01-01', 'Wholesale trade industry', 'Distributors'),
          ('Report-62-01-02', 'Retail trade industry', 'Retailers'), ('Report-63-01-02', 'Motor trade industry', 'Motor dealers'), ('Report-64-11-01', 'Accommodation industry', 'Hotels and lodging'),
          ('Report-64-20-01', 'Food and beverages industry', 'Restaurants and caterers'), ('Report-71-02-01', 'Transport and storage industry', 'Logistics'), ('Report-75-01-01', 'Post and telecommunications industry', 'Telecoms'),
          ('Report-80-04-02', 'Real estate, financial auxiliary and business services industry', 'Property and business services'), ('Report-90-01-01', 'Personal services industry', 'Health, education, personal services')]
BATCH3 = [('P0441', 'Gross domestic product (GDP), quarterly', 'Growth, expenditure and industry composition: the macro backdrop for every sector'), ('P0441A', 'Gross domestic product (GDP), annual', 'Long-run GDP by industry and expenditure'),
          ('P0441.2', 'Provincial gross domestic product', 'Regional economies: Gauteng, KZN, Western Cape'), ('P0211', 'Quarterly Labour Force Survey (QLFS)', 'Employment, unemployment, labour absorption: consumer demand and wage pressure'),
          ('P0277', 'Quarterly Employment Statistics (QES)', 'Formal-sector jobs and earnings by industry'), ('P0045', 'Quarterly capital expenditure (QCE)', 'Private investment appetite by industry and asset type'),
          ('P9101', 'Capital expenditure by the public sector', 'State infrastructure spend: construction, utilities, transport'),
          ('P9119.3', 'Financial statistics of national government', 'Fiscal position: revenue, expenditure, borrowing'), ('P9119.4', 'Financial statistics of consolidated general government', 'Whole-of-government revenue, spending by function'),
          ('P9121', 'Financial statistics of provincial government', 'Provincial budgets: health, education, social spending'), ('P9102', 'Financial statistics of extra-budgetary accounts and funds', 'UIF, compensation funds and other off-budget flows'),
          ('P9103.1', 'Financial statistics of higher education institutions', 'University income and spend'),
          ('P9110.1', 'Quarterly financial statistics of selected municipalities (QFSSM)', 'Municipal revenue and spending each quarter: rates, electricity and water sales, debt impairment, employee costs (130 largest municipalities)'),
          ('P9115', 'Non-financial census of municipalities', 'What municipalities employ and provide: staff, councillors, indigent households, services and free basic services, by province')]
WHERE = {'P7162': 'Industrials', 'P6420': 'Consumer', 'P0142.7': 'Prices', 'P0043.1': 'Corporate', 'P0043.2': 'Corporate', 'P0041': 'Corporate', 'P0044': 'Corporate',
         'P1101': 'Resources',
         'P2041': 'Resources', 'P3041.2': 'Industrials', 'P3043': 'Industrials', 'P4141': 'Industrials', 'P6242.1': 'Consumer', 'P6343.2': 'Consumer', 'P6141.2': 'Consumer', 'P5041.1': 'Property & Construction',
         'P0441': 'Economy', 'P0441A': 'Economy', 'P0441.2': 'Economy', 'P0211': 'Economy', 'P0277': 'Economy', 'P0045': 'Economy', 'P9101': 'Economy', 'P9119.3': 'Economy', 'P9119.4': 'Economy', 'P9121': 'Economy', 'P9102': 'Economy', 'P9103.1': 'Economy', 'P9110.1': 'Economy', 'P9115': 'Economy',
         'P0151.1': 'Property & Construction', 'P0160': 'Property & Construction', 'P6410': 'Travel & Leisure', 'P0021': 'Corporate', 'P0141': 'Prices', 'P0141AP': 'Prices', 'P0142.1': 'Prices'}
NOTE = {
 'P2041': 'Two workbooks (1980\u20132002 and from 2003) merged. 3 seasonally adjusted series that StatsSA stopped in 2002 (nickel, other metallic, diamonds) are in the Series Explorer only.',
 'P3041.2': 'Complete. Furniture division = furniture + "other manufacturing groups" (counted once).',
 'P3043': 'Complete, including the five reasons for under-utilisation.',
 'P6343.2': 'Two workbooks merged (the 1998\u201399 file is laid out with months in rows).',
 'P6242.1': 'Complete.', 'P6141.2': 'Two workbooks merged (1998\u20131999 and from 2000).',
 'P6410': 'Complete; the table labels in the workbook are kept with each series.',
 'P5041.1': 'Complete (all 564 series). Floor-area and dwelling-count totals by building type are summed from sub-types on the tab and marked as derived.',
 'P0151.1': 'Complete. StatsSA lists 2 series twice (JB000050, JB000053) with different labels and identical numbers; kept once.',
 'P0160': 'Complete.', 'P4141': 'Three workbooks (1985\u201389, 1990\u201399, 2000 on) merged.',
 'P0021': 'Complete. 59 line items StatsSA retired (capex new/existing, goodwill, \u2026) are available in the Corporate line-item explorer with their own date range.',
 'P0141': 'Complete: 784 index series + 391 products with weights. 5 duplicated rows (same numbers, alternate labels) kept once.',
 'P0141AP': 'Complete: all-urban + provincial prices, incl. the "March Online Price" column. 3 duplicated province rows hold complementary periods/attributes and are merged; 5 rows with no price at all are recorded, not charted.',
 'P0142.1': 'Complete: 76 category series + 277 elementary products with weights; the workbook\u2019s "Note" sheet is kept.',
 'P7162': 'Complete (39 series, actual and seasonally adjusted).', 'P6420': 'Complete (64 series: 4 outlet types x 4 income lines x actual / SA / constant / current).',
 'P0142.7': 'Complete for the current workbook (Dec 2024 = 100, from 2016). The discontinued 2010\u20132022 workbook (Dec 2020 = 100) and the 2015 indicative series use other bases and are kept aside, not merged.',
 'P0043.1': 'Complete for the current workbook (from 2000). The legacy P0043 liquidation counts differ from this series for the same months and are not merged.',
 'P0043.2': 'Complete. Insolvency history from 1980 comes from the discontinued combined P0043 workbooks (identical to P0043.2 where they overlap); StatsSA published no counts Sep 2021 to Dec 2022.',
 'P0041': 'Complete (two workbooks: 1990-1999 and from 2000).',
 'P0044': 'Complete. 24 release workbooks (Q2 2020 to Q2 2026), two quarters each; where a later release revised a quarter the newest figure is kept (counted as superseded, not missing). Size cut-offs are carried per series; titles, footnotes and the DTIC cut-off sheet are notes.',
}
NOTE.update({
 'P0441': 'Complete: the four data sheets (expenditure and industry, current and constant prices, level and growth); contents, notes and revision sheets are kept as publication notes. Quarters are written YYYY0Q in the workbook.',
 'P0441A': 'Complete: the two annual sheets of the same workbook (industry and expenditure).',
 'P0441.2': 'Complete: 21 tables (GDP by industry and expenditure, per province, 4 blocks each); the workbook uses "Northen Cape" for one province, normalised in the app.',
 'P0211': 'Complete: the 2008-to-date trends workbook (population, labour force, employed by industry/occupation/province, unemployment and labour underutilisation). The workbook labels its latest column of Table 7d with the previous year’s quarter; the parser assigns it to the next quarter (checked against Table 7a).',
 'P0277': 'Complete: employees and average earnings by SIC industry; revised quarters are kept as the revised figure.',
 'P9101': 'Complete: public sector capex by institution type and asset class, 2006 onwards.',
 'P9115': 'Complete: the provincial time series 2006-2023 (annual; the latest year is provisional and written 2023*). Cells marked ~ (not applicable) are blank. Unit-data workbooks per municipality are not integrated: their file names change every edition.',
 'P9110.1': 'Complete: 8 releases (Sept 2024 to June 2026), 6 sheets each (combined / rates / housing-and-trading, revenue and expenditure), 130 municipalities plus a national total, 12 quarters from 2023-Q3. Later releases restate earlier quarters (newest kept, counted as superseded). The March 2026 workbook repeats the December 2025 figures in its two Combined sheets under headers one quarter late; they are read as the quarters they contain (Check-Municipal-Releases.py proves it).',
})
for _c in ['P0045', 'P9119.3', 'P9119.4', 'P9121', 'P9102', 'P9103.1']: NOTE.setdefault(_c, 'Complete.')
for _c in ['P1101'] + [x[0] for x in BATCH2 if x[0].startswith('Report-')]: NOTE.setdefault(_c, 'Complete. Periodic survey: columns are survey years.')
r_ = result
def pct(a, b): return '100%' if a == b else f'{a / b * 100:.2f}%'
def row(code, name, rel, added=False):
    r = r_[code]; ok = r['numericIntegrated'] == r['numericCells'] and r['metaMissing'] == 0 and r['noteIntegrated'] == r['noteCells']
    mark = '\u2705 **Integrated**' if ok else '\u26a0\ufe0f **Gaps**'
    nm = f'**{name}**' if True else name
    return (f'| **{code}** | {nm}{" (added)" if added else ""} | {rel} | {mark} | {WHERE[code]} | {r["series"]:,} | {len(r["files"])} | '
            f'{r["numericIntegrated"]:,} of {r["numericCells"]:,} ({pct(r["numericIntegrated"], r["numericCells"])}) | {r["metaCells"] - r["metaMissing"]:,} of {r["metaCells"]:,} | {NOTE.get(code, "")} |')
md = ['# Integration status', '',
      f'Generated {summary["generated"]} by `tools/Audit-Integration.py` (reads every cell of every sheet of every workbook, independently of the parser).', '',
      f'**Result: {t["numericIntegrated"]:,} of {t["numericCells"]:,} numeric data cells ({pct(t["numericIntegrated"], t["numericCells"])}) from {t["files"]} Excel workbooks are in the app, unchanged; '
      f'{t["metaCells"] - t["metaMissing"]:,} of {t["metaCells"]:,} descriptive cells are carried; {t["noteIntegrated"]} of {t["noteCells"]} note cells from additional sheets are kept. '
      f'{t["blankCells"]:,} cells in the numeric block are blank in the source (no observation published) and are correctly empty.**', '',
      '## Your publication table \u2014 what is integrated', '',
      '| Code | Publication | Sector relevance | Status | Where in the app | Series | Workbooks | Numeric cells in Excel integrated | Descriptive cells carried | Notes |',
      '|---|---|---|---|---|---:|---:|---|---|---|']
for code, name, rel in BRIEF: md.append(row(code, name, rel))
md += ['', '## Added since the original table (CPI and PPI, from the SA CPI & PPI project)', '',
       '| Code | Publication | Why it matters | Status | Where in the app | Series | Workbooks | Numeric cells in Excel integrated | Descriptive cells carried | Notes |', '|---|---|---|---|---|---:|---:|---|---|---|']
for code, name, rel in ADDED: md.append(row(code, name, rel, True))
md += ['', '## Second batch (land transport, food & beverages, trade prices, credit stress, quarterly results, industry surveys)', '',
       '| Code | Publication | Why it matters | Status | Where in the app | Series | Workbooks | Numeric cells in Excel integrated | Descriptive cells carried | Notes |', '|---|---|---|---|---|---:|---:|---|---|---|']
for code, name, rel in BATCH2:
    if code in r_: md.append(row(code, name, rel, True))
md += ['', '## Macro and government finance batch (GDP, labour, investment, public finances)', '',
       '| Code | Publication | Why it matters | Status | Where in the app | Series | Workbooks | Numeric cells in Excel integrated | Descriptive cells carried | Notes |', '|---|---|---|---|---|---:|---:|---|---|---|']
for code, name, rel in BATCH3:
    if code in r_: md.append(row(code, name, rel, True))
md += ['', '## What "integrated" means here', '',
       '* **Numeric cells** \u2014 every figure in every period column of every workbook is in the generated data file with the identical value (checked cell by cell, twice, by two independent readers).',
       '* **Descriptive cells** \u2014 every other cell in a data row is kept: as a series field (id, measure, name, sub-type, geography, price basis, adjustment, unit, base period, weight), as a per-series attribute (for example *Old code*, *March Online Price*, *SIC*, *Group/Class descriptions*), or once per file when it is the same on every row (for example the frequency). Only the publication code and title (columns H01/H02) are not repeated per series; they are stored once per publication.',
       '* **Other sheets** \u2014 the text on non-data sheets (the PPI workbook\u2019s *Note* sheet) is kept as publication notes.',
       '* **Duplicated rows** \u2014 where StatsSA lists the same series twice, the numbers and attributes are merged (nothing is lost; where the two rows hold complementary periods or attributes both are kept).',
       '* **Shown vs stored** \u2014 stored: 100%. Displayed on a sector tab: all but 3 series (see the Data & Update tab); everything is reachable in the Series Explorer.', '',
       '## Per workbook', '', '| Publication | Workbook | Sheets | Data rows | Numeric cells | Integrated | Blank cells | Descriptive cells | Carried |', '|---|---|---:|---:|---:|---:|---:|---:|---:|']
for code, r in r_.items():
    for f in r['files']:
        md.append(f'| {code} | {f["file"]} | {f["sheets"]} | {f["rows"]:,} | {f["numericCells"]:,} | {f["numericIntegrated"]:,} | {f["blankCells"]:,} | {f["metaCells"]:,} | {f["metaCells"] - f["metaMissing"]:,} |')
(APP / 'INTEGRATION_STATUS.md').write_text('\n'.join(md) + '\n', encoding='utf-8')

sys.exit(0 if t['numericCells'] == t['numericIntegrated'] and t['metaMissing'] == 0 and t['noteCells'] == t['noteIntegrated'] else 1)
