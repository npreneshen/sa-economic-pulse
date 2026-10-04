"""layouts.py - independent (openpyxl) readers for the macro workbooks, shared by Validate-Parse.py and Audit-Integration.py.
Each *_expected(path) returns ({series id: {period: value}}, '') exactly as the parser should have produced them."""
import re
import openpyxl

Q6 = {'P0441'}                      # GDP: quarters are written 199301 ... 202602
SHEETS = {'P0441': [3, 4, 5, 6], 'P0441A': [1, 2]}          # multi-sheet workbooks
FOLDER = {'P0441A': 'P0441'}
PROVS = {'western cape': 'Western Cape', 'eastern cape': 'Eastern Cape', 'northern cape': 'Northern Cape', 'northen cape': 'Northern Cape', 'free state': 'Free State', 'kwazulu-natal': 'KwaZulu-Natal', 'north west': 'North West', 'gauteng': 'Gauteng', 'mpumalanga': 'Mpumalanga', 'limpopo': 'Limpopo', 'south africa': 'South Africa'}

def num(v):
    if v is None or v == '': return None
    try: return float(v)
    except Exception: return None

def qlfs_expected(path):
    wb = openpyxl.load_workbook(path, data_only=True); out = {}; MQ = {'jan': 1, 'apr': 2, 'jul': 3, 'oct': 4}
    for ws in wb.worksheets:
        raw_rows = [list(r) for r in ws.iter_rows(values_only=True)]
        rows = [r for r in raw_rows if any(c not in (None, '') for c in r)]
        m = None
        for r in rows[:3]:
            m = re.match(r'^Table\s*([0-9]+(?:[. ][0-9]+)?[a-z]?)\s*:\s*(.*)$', str(r[0] or '').strip())
            if m: break
        if not m: continue
        tkey = 'T' + m[1].replace(' ', '.')
        hr = next((i for i, r in enumerate(rows[:8]) if re.match(r'^[A-Za-z]{3}-[A-Za-z]{3} \d{4}$', str(r[1] or '').strip())), None)
        if hr is None: continue
        pc = {}
        for c, t in enumerate(rows[hr]):
            mm = re.match(r'^([A-Za-z]{3})-[A-Za-z]{3} (\d{4})$', str(t or '').strip())
            if mm: pc[c] = f'{mm[2]}-Q{MQ[mm[1].lower()]}'
            if mm and list(pc.values()).count(pc[c]) > 1 and (c - 1) in pc:      # source typo: repeated label = the next quarter
                y, q = map(int, re.match(r'(\d{4})-Q(\d)', pc[c - 1]).groups()); q += 1
                if q > 4: q, y = 1, y + 1
                pc[c] = f'{y}-Q{q}'
        stack, seen, after_blank, after_head = [], {}, True, False
        rhr = next(i for i, r in enumerate(raw_rows) if r is rows[hr])
        for ri in range(rhr + 1, len(raw_rows)):
            r = raw_rows[ri]
            raw = str(r[0]) if r[0] is not None else ''; label = raw.strip()
            if not label: after_blank = True; continue
            if re.match(r'^(Thousand|Per ?cent)$', label): continue
            indent = len(raw) - len(raw.lstrip())
            has = any(str(c).strip() != '' for c in r[1:] if c is not None)
            if not has and (re.match(r'^(Due to rounding|Source:|Note)', label) or re.match(r'^Table\s', label) or len(label) > 60): after_blank = True; continue
            if after_blank and not has:                      # a heading after a blank row opens a block and is never popped
                stack = [(indent, label, True, False)]; after_blank = False; after_head = True; continue
            was_blank, was_head, after_blank, after_head = after_blank, after_head, False, False
            while stack and not stack[-1][2] and (stack[-1][0] >= indent or (was_blank and stack[-1][3])): stack.pop()
            grp = False                                       # data row after a blank whose next row is at the same indent heads a group
            if (was_blank or was_head) and has and ri + 1 < len(raw_rows):
                nx = raw_rows[ri + 1]; nraw = str(nx[0]) if nx[0] is not None else ''
                if nraw.strip() and len(nraw) - len(nraw.lstrip()) == indent and any(str(c).strip() != '' for c in nx[1:] if c is not None): grp = True
            path = [x[1] for x in stack]
            stack.append((indent - 0.5 if grp else indent, label, False, grp))
            if not has: continue
            vals = {pc[c]: num(r[c]) for c in pc if c < len(r) and num(r[c]) is not None}
            if not vals: continue
            key = tkey + '|' + ' > '.join(path + [label])
            if key in seen: seen[key] += 1; key = f'{key} #{seen[key]}'
            else: seen[key] = 1
            out[key] = vals
    return out, ''

def qes_expected(path):
    wb = openpyxl.load_workbook(path, data_only=True); out = {}; QM = {'03': 1, '06': 2, '09': 3, '12': 4}
    for ws in wb.worksheets:
        rows = [list(r) for r in ws.iter_rows(values_only=True) if any(c not in (None, '') for c in r)]
        t0 = str(rows[0][2] or '')
        kind = 'EMP' if re.search('(?i)employees', t0) else 'EARN' if re.search('(?i)earnings', t0) else None
        if not kind: continue
        hr = next(i for i, r in enumerate(rows[:5]) if re.match(r'^\d{6}r?$', str(r[2] or '').strip()))
        pc = {c: f'{m[1]}-Q{QM[m[2]]}' for c, t in enumerate(rows[hr]) for m in [re.match(r'^(\d{4})(\d{2})r?$', str(t or '').strip())] if m}
        for r in rows[hr + 1:]:
            label = str(r[0]).strip() if r[0] is not None else ''
            if not label or label.startswith('Notes on SIC'): break
            sic = str(r[1]).strip() if r[1] is not None else ''
            vals = {pc[c]: num(r[c]) for c in pc if c < len(r) and num(r[c]) is not None}
            if vals: out[f"{kind}|{sic or 'TOTAL'}|{label}"] = vals
            if label == 'TOTAL': break
    return out, ''

def rgdp_expected(path):
    wb = openpyxl.load_workbook(path, data_only=True); out = {}
    for si, ws in enumerate(wb.worksheets):
        if si == 0: continue
        rows = [list(r) for r in ws.iter_rows(values_only=True) if any(c not in (None, '') for c in r)]
        title = str(rows[0][0]); pc = {}; block = bkey = ''; seen = {}
        for r in rows[1:]:
            c0 = str(r[0]).strip() if r[0] is not None else ''
            if not c0: continue
            m = re.match(r'^([a-z])\.\s*(.*)$', c0)
            if m: bkey, block, pc = m[1], m[2], {}; continue
            hdr = {c: str(v).strip() for c, v in enumerate(r) if c >= 1 and re.match(r'^(19|20)\d{2}$', str(v).strip())}
            if len(hdr) >= 3 and c0 in ('Industry', 'Province'): pc = hdr; continue
            if not pc: continue
            vals = {pc[c]: num(r[c]) for c in pc if c < len(r) and num(r[c]) is not None}
            if not vals: continue
            key = f'T{si}|{bkey}|{c0}'
            if key in seen: seen[key] += 1; key = f'{key} #{seen[key]}'
            else: seen[key] = 1
            out[key] = vals
    return out, ''
CUSTOM = {'P0211': qlfs_expected, 'P0277': qes_expected, 'P0441.2': rgdp_expected}

def dedupe_q(pc):
    """pc = [(column, period)]; a quarter label repeated in the header is a source typo for the next quarter (GDP workbook lists 201803 twice)."""
    out = []
    for j, p in pc:
        if out and p in [x[1] for x in out]:
            m = re.fullmatch(r'(\d{4})-Q([1-4])', out[-1][1])
            if m:
                y, q = int(m[1]), int(m[2]) + 1
                if q > 4: y, q = y + 1, 1
                p = f'{y}-Q{q}'
        out.append((j, p))
    return out

# ---- P9110.1 municipal quarterly finance (one workbook per release, five quarters across, newest release wins)
QFSSM = {'P9110.1'}
QFSSM_SHEETS = {1: 'CE', 2: 'CR', 3: 'RE', 4: 'RR', 5: 'HE', 6: 'HR'}
# publisher error proven by exact equality with the neighbouring releases (Check-Municipal-Releases.py re-tests it): the March 2026 workbook's Combined sheets hold the previous release's figures under headers one quarter late
QFSSM_SHIFT = {('P9110.1 March 2026 Unit Data.xlsx', 1): -1, ('P9110.1 March 2026 Unit Data.xlsx', 2): -1}
QFSSM_GROUP = {'Property rates from:': 4, 'Service charges:': 5, 'Interest on:': 3, 'Government transfers and subsidies:': 3, 'Contracted services:': 3, 'Operating leases:': 4, 'Bulk purchases:': 3, 'Transfers and subsidies:': 5, 'Operational costs:': 14}
_MQ = {'march': 1, 'june': 2, 'september': 3, 'december': 4}

def qfssm_columns(hdr_row, qc, shift=0):
    """period for each value column: consecutive quarters ending with the last header label (the headers contain typos), moved by `shift` quarters."""
    cols = []
    for c in range(qc + 1, len(hdr_row)):
        m = re.match(r'^\s*([A-Za-z]+)\s+(\d{4})', str(hdr_row[c] or ''))
        if m: cols.append((c, int(m[2]), _MQ[m[1].lower()]))
    c, y, q = cols[-1]; q += shift
    while q < 1: q += 4; y -= 1
    while q > 4: q -= 4; y += 1
    pc = {}
    for c, _, _ in reversed(cols):
        pc[c] = f'{y}-Q{q}'; q -= 1
        if q < 1: q, y = 4, y - 1
    return pc

def qfssm_expected(path):
    import os
    name = os.path.basename(path); wb = openpyxl.load_workbook(path, read_only=True, data_only=True); out = {}; last = ''
    for si, ws in enumerate(wb.worksheets):
        rows = list(ws.iter_rows(values_only=True))
        if not rows: continue
        qc = next((c for c, t in enumerate(rows[0]) if str(t or '').strip() == 'Question'), None)
        if qc is None: continue
        pc = qfssm_columns(rows[0], qc, QFSSM_SHIFT.get((name, si), 0)); last = max([last] + list(pc.values()))
        sh = QFSSM_SHEETS[si]; cur = None; occ = {}
        for r in rows[1:]:
            prov = str(r[0] or '').strip()
            if not prov: continue
            mun = str(r[2] or '').strip(); qn = str(r[qc] or '').strip()
            if not qn: continue
            mk = (prov, mun)
            if mk != cur: cur = mk; occ = {}
            key = f"{sh}|{mun or 'All 130 municipalities'}|{qn}"
            if key in occ: occ[key] += 1; key = f'{key} #{occ[key]}'
            else: occ[key] = 1
            vals = {pc[c]: num(r[c]) for c in pc if c < len(r) and num(r[c]) is not None}
            if vals: out[key] = vals
    return out, last
