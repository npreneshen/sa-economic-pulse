"""Check-Municipal-Releases.py - are the quarter columns of the municipal finance workbooks (P9110.1) attached to the right quarters?
Every release holds five quarters, and consecutive releases overlap on four of them. A column that holds the same figures as a column of another release
(exact equality on at least 97% of its non-zero cells) must be the same quarter in both. The headers are not trusted (they contain typos, and the March 2026
workbook's Combined sheets repeat the December 2025 figures under headers one quarter late); the quarters assigned by the parser (layouts.qfssm_columns, including the
documented shift) are tested against the figures themselves.
Run from the app folder:  python tools\\Check-Municipal-Releases.py        exit status 1 if any column is attached to the wrong quarter."""
import glob, os, sys, warnings
import numpy as np
import openpyxl
warnings.filterwarnings('ignore')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from layouts import qfssm_columns, QFSSM_SHIFT, QFSSM_SHEETS, num

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THRESH = 0.97

def load(path):
    name = os.path.basename(path); wb = openpyxl.load_workbook(path, read_only=True, data_only=True); out = {}
    for si, ws in enumerate(wb.worksheets):
        rows = list(ws.iter_rows(values_only=True))
        qc = next((c for c, t in enumerate(rows[0]) if str(t or '').strip() == 'Question'), None) if rows else None
        if qc is None: continue
        pc = qfssm_columns(rows[0], qc, QFSSM_SHIFT.get((name, si), 0)); cols = list(pc)
        keys, mat, occ, cur = [], [], {}, None
        for r in rows[1:]:
            if not r[0]: continue
            mk = (r[0], r[2])
            if mk != cur: cur = mk; occ = {}
            k = (r[0], r[2], str(r[qc]).strip()); occ[k] = occ.get(k, 0) + 1; keys.append(k + (occ[k],))
            mat.append([num(r[c]) if c < len(r) and num(r[c]) is not None else np.nan for c in cols])
        out[si] = (keys, np.array(mat, dtype=float), [pc[c] for c in cols])
    return out

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(APP, 'source-data')          # the updater passes its staging copy
files = sorted(glob.glob(os.path.join(ROOT, 'P9110.1', '**', '*.xlsx'), recursive=True))
data = {os.path.basename(f): load(f) for f in files}
bad = []; pairs = 0
names = list(data)
for si in QFSSM_SHEETS:
    for a in range(len(names)):
        for b in range(a + 1, len(names)):
            ka, ma, qa = data[names[a]][si]; kb, mb, qb = data[names[b]][si]
            if ka != kb:                                             # same rows in a different order: align by key
                idx = {k: i for i, k in enumerate(kb)}; sel = [(i, idx[k]) for i, k in enumerate(ka) if k in idx]
                ma = ma[[i for i, _ in sel]]; mb = mb[[j for _, j in sel]]
            for i in range(ma.shape[1]):
                for j in range(mb.shape[1]):
                    x, y = ma[:, i], mb[:, j]; m = ~np.isnan(x) & ~np.isnan(y) & (x != 0) & (y != 0)
                    if m.sum() < 500: continue
                    share = float((np.abs(x[m] - y[m]) < 1e-6).mean()); pairs += 1
                    if share >= THRESH and qa[i] != qb[j]:
                        bad.append((QFSSM_SHEETS[si], names[a], qa[i], names[b], qb[j], round(share, 3)))
for b_ in bad: print('MISALIGNED', *b_)
print(f'{len(files)} releases, {pairs} column pairs compared, {len(bad)} column(s) attached to a quarter that another release attaches different figures to')
sys.exit(1 if bad else 0)
