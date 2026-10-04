"""Xls2Xlsx.py - StatsSA still ships a few time-series workbooks as legacy .xls (the wholesale, retail and motor-trade industry surveys).
The parser reads .xlsx only, so this converts every .xls under the given folder(s) to a sibling .xlsx (values only, first sheet kept as sheet 1,
other sheets appended in order). Dates/blank cells are preserved as-is; numbers stay numbers. Needs: pip install xlrd openpyxl (pandas + lxml for the HTML-table variants).
Usage: python tools/Xls2Xlsx.py source-data/Report-62-01-02 [more folders]   (no argument = every folder under source-data)"""
import sys, os, glob
import xlrd, openpyxl

def convert(path):
    out = os.path.splitext(path)[0] + '.xlsx'
    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(path):
        return out, False
    head = open(path, 'rb').read(64).lstrip()
    if head[:1] == b'<':                                   # SAS output saved as ".xls": really an HTML table (government finance workbooks)
        import io, pandas as pd
        df = pd.read_html(io.StringIO(open(path, encoding='cp1252', errors='replace').read()))[0]
        wb = openpyxl.Workbook(); ws = wb.active; ws.append([str(c) for c in df.columns])
        for row in df.itertuples(index=False):
            ws.append([None if (isinstance(v, float) and v != v) else (int(v) if isinstance(v, float) and v == int(v) and abs(v) < 1e15 else v) for v in row])
        wb.save(out); return out, True
    book = xlrd.open_workbook(path)
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    for sh in book.sheets():
        ws = wb.create_sheet(sh.name[:31] or 'Sheet')
        for r in range(sh.nrows):
            row = sh.row(r)
            vals = []
            for c in row:
                if c.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK): vals.append(None)
                elif c.ctype == xlrd.XL_CELL_NUMBER:
                    v = c.value; vals.append(int(v) if v == int(v) and abs(v) < 1e15 else v)
                elif c.ctype == xlrd.XL_CELL_ERROR: vals.append(None)
                else: vals.append(c.value)
            ws.append(vals)
    wb.save(out)
    return out, True

if __name__ == '__main__':
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'source-data')
    targets = sys.argv[1:] or [root]
    n = 0
    for t in targets:
        for p in glob.glob(os.path.join(t, '**', '*.xls'), recursive=True):
            out, did = convert(p); n += did
            print(('converted ' if did else 'up to date ') + os.path.relpath(out))
    print(n, 'file(s) converted')
