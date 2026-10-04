# =====================================================================
#  Parse-StatsSA.ps1 - turns the StatsSA time-series xlsx files for the 12
#  app publications into data/<code>.js (one per publication) plus
#  data/manifest.js and data/_parse-report.json. No Excel/COM needed.
#
#  All 12 files share one wide layout: metadata columns H01..H25 followed by one
#  column per period (MOmmyyyy monthly, QRqqyyyy quarterly, Yyyyy annual, myyyymm
#  for P0160). The H-column NUMBERS are stable roles (H03 = series id, H04 = group /
#  measure, H05 = name, H06 = sub-type, H13/H14 = geography, H15 = price basis,
#  H16 = actual / seasonally-adjusted / trend, H17 = unit, H18 = base), so one
#  generic reader covers everything; $PUBS below holds the few per-publication
#  differences. History is often split across several files per publication
#  (P2041, P4141, P5041.1, P6141.2, P6343.2): they are merged on series id, newest
#  file wins on overlapping periods.
#
#  Usage:  .\Parse-StatsSA.ps1               parse everything under ..\source-data
#          .\Parse-StatsSA.ps1 -Only P2041   parse one publication
# =====================================================================
param(
    [string]$SourceDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "source-data"),
    [string]$OutDir    = (Join-Path (Split-Path -Parent $PSScriptRoot) "data"),
    [string[]]$Only,
    [switch]$Quiet
)
$ErrorActionPreference = "Stop"
$inv = [Globalization.CultureInfo]::InvariantCulture
function Say($m) { if (-not $Quiet) { Write-Host $m } }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (-not ('XlsxGrid' -as [type])) {
    Add-Type -Language CSharp -ReferencedAssemblies System.IO.Compression, System.IO.Compression.FileSystem, System.Xml -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Xml;

// Streaming xlsx -> grid reader (first worksheet). Cells come back as raw text
// (numbers included); missing cells are null. Row arrays are as long as the last
// populated cell in that row.
public static class XlsxGrid {
    static int ColIdx(string r) {
        int n = 0;
        for (int i = 0; i < r.Length; i++) {
            char c = r[i];
            if (c >= 'A' && c <= 'Z') n = n * 26 + (c - 'A' + 1);
            else if (c >= 'a' && c <= 'z') n = n * 26 + (c - 'a' + 1);
            else break;
        }
        return n - 1;
    }
    static int SheetNo(string name) { var m = System.Text.RegularExpressions.Regex.Match(name, @"sheet(\d+)\.xml$"); return m.Success ? int.Parse(m.Groups[1].Value) : 0; }
    public static int SheetCount(string path) {
        using (var za = ZipFile.OpenRead(path)) { int n = 0; foreach (var e in za.Entries) if (e.FullName.StartsWith("xl/worksheets/sheet") && e.FullName.EndsWith(".xml")) n++; return n; }
    }
    public static List<string[]> Read(string path) { return ReadSheet(path, 0); }
    public static List<string[]> ReadSheet(string path, int index) {
        using (var za = ZipFile.OpenRead(path)) {
            var shared = new List<string>();
            var se = za.GetEntry("xl/sharedStrings.xml");
            if (se != null) {
                using (var s = se.Open())
                using (var xr = XmlReader.Create(s)) {
                    var sb = new StringBuilder();
                    while (xr.Read()) {
                        if (xr.NodeType == XmlNodeType.Element && xr.LocalName == "si") {
                            sb.Length = 0;
                            if (!xr.IsEmptyElement) {
                                using (var sub = xr.ReadSubtree()) {
                                    while (sub.Read())
                                        if (sub.NodeType == XmlNodeType.Element && sub.LocalName == "t")
                                            sb.Append(sub.ReadElementContentAsString());
                                }
                            }
                            shared.Add(sb.ToString());
                        }
                    }
                }
            }
            var sheets = new List<ZipArchiveEntry>();
            foreach (var e in za.Entries) if (e.FullName.StartsWith("xl/worksheets/sheet") && e.FullName.EndsWith(".xml")) sheets.Add(e);
            sheets.Sort((a, b) => SheetNo(a.FullName).CompareTo(SheetNo(b.FullName)));
            if (sheets.Count <= index) throw new InvalidDataException("no worksheet " + index + " in " + path);
            var sheet = sheets[index];
            var rows = new List<string[]>();
            using (var s = sheet.Open())
            using (var xr = XmlReader.Create(s)) {
                List<string> cur = null;
                while (xr.Read()) {
                    if (xr.NodeType == XmlNodeType.Element) {
                        if (xr.LocalName == "row") {
                            cur = new List<string>();
                            if (xr.IsEmptyElement) { rows.Add(new string[0]); cur = null; }
                        } else if (xr.LocalName == "c" && cur != null) {
                            string r = xr.GetAttribute("r");
                            string t = xr.GetAttribute("t");
                            int ci = r != null ? ColIdx(r) : cur.Count;
                            string val = null;
                            if (!xr.IsEmptyElement) {
                                using (var sub = xr.ReadSubtree()) {
                                    var sbv = new StringBuilder();
                                    bool hasIs = false;
                                    while (sub.Read()) {
                                        if (sub.NodeType != XmlNodeType.Element) continue;
                                        if (sub.LocalName == "v") val = sub.ReadElementContentAsString();
                                        else if (sub.LocalName == "t") { hasIs = true; sbv.Append(sub.ReadElementContentAsString()); }
                                    }
                                    if (hasIs && val == null) val = sbv.ToString();
                                }
                                if (t == "s" && val != null) val = shared[int.Parse(val)];
                            }
                            while (cur.Count < ci) cur.Add(null);
                            if (cur.Count == ci) cur.Add(val); else cur[ci] = val;
                        }
                    } else if (xr.NodeType == XmlNodeType.EndElement && xr.LocalName == "row" && cur != null) {
                        rows.Add(cur.ToArray());
                        cur = null;
                    }
                }
            }
            return rows;
        }
    }
}
"@
}

# ---------------------------------------------------------------------
#  Publication registry. 'tab' is the dashboard tab (see APP_DESIGN.md).
#  Role overrides: only where a publication departs from the default H-column roles.
#    idCols   - header names joined with '.' to form the series id (default H03)
#    measure/name/sub/geo/price/adj/unit/base - header name to read each role from
#    splitDash - P6410 only: H04 is "<measure> - <segment>"
# ---------------------------------------------------------------------
$PUBS = [ordered]@{
    'P2041'   = @{ name = 'Mining: Production and sales';                tab = 'resources';   freq = 'M' }
    'P3041.2' = @{ name = 'Manufacturing: Production and sales';         tab = 'industrials'; freq = 'M' }
    'P3043'   = @{ name = 'Manufacturing: Utilisation of production capacity'; tab = 'industrials'; freq = 'Q' }
    'P4141'   = @{ name = 'Electricity generated and available for distribution'; tab = 'industrials'; freq = 'M' }
    'P6242.1' = @{ name = 'Retail trade sales';                          tab = 'consumer';    freq = 'M' }
    'P6343.2' = @{ name = 'Motor trade sales';                           tab = 'consumer';    freq = 'M' }
    'P6141.2' = @{ name = 'Wholesale trade sales';                       tab = 'consumer';    freq = 'M' }
    'P5041.1' = @{ name = 'Building statistics (plans passed / completed)'; tab = 'property'; freq = 'M' }
    'P0151.1' = @{ name = 'Construction materials price indices';        tab = 'property';    freq = 'M' }
    'P0160'   = @{ name = 'Residential property price index';            tab = 'property';    freq = 'M' }
    'P6410'   = @{ name = 'Tourist accommodation';                       tab = 'travel';      freq = 'M'; splitDash = $true }
    'P0021'   = @{ name = 'Annual financial statistics';                 tab = 'corporate';   freq = 'A'
                   idCols = @('H03', 'H05'); measure = 'H06'; name_col = 'H04'; sub = $null }
    # --- prices (from the SA CPI & PPI project's source files; layouts differ per file, see fileRoles) ---
    'P0141'   = @{ name = 'Consumer price index (CPI)';                  tab = 'prices';      freq = 'M'; sched = 'P0141'
                   fileRoles = @(
                     @{ re = '8digit'; roles = @{ idCols = @('Eight digit code'); measure = 'DivisionDescription'; name_col = 'Product name'; sub = 'SubclassDescription'; geo = $null; geo2 = $null
                                                  price = $null; adj = $null; unit = '=Index'; base = 'Base period'; w = 'Weight' } } ) }
    'P0141AP' = @{ name = 'CPI average prices (Rand)';                   tab = 'prices';      freq = 'M'; sched = 'P0141'
                   idCols = @('H03', 'H07', 'H09'); measure = 'H04'; name_col = 'H08'; sub = $null; geo = 'H09'; geo2 = $null; price = $null; adj = $null; unit = '=Rand'; base = $null
                   fileRoles = @( @{ re = 'All urban'; roles = @{ geo = '=All urban areas' } } ) }
    'P0142.1' = @{ name = 'Producer price index (PPI)';                  tab = 'prices';      freq = 'M'; sched = 'P0142.1'
                   fileRoles = @(
                     @{ re = 'Elementary'; roles = @{ idCols = @('cpcProdCode'); measure = 'Table'; name_col = 'cpcProdDesc'; sub = 'DESCR'; geo = $null; geo2 = $null
                                                      price = $null; adj = $null; unit = '=Index'; base = $null; w = 'WEIGHTS_2026' } } ) }
}
# --- second batch (monthly/quarterly releases) ---
$PUBS['P7162']   = @{ name = 'Land transport survey';                     tab = 'industrials'; freq = 'M' }
$PUBS['P6420']   = @{ name = 'Food and beverages';                        tab = 'consumer';    freq = 'M'; splitColon = $true; unit = '=R million'; base = 'H18' }
$PUBS['P0142.7'] = @{ name = 'Export and import unit value indices';      tab = 'prices';      freq = 'M' }
# liquidations / insolvencies: the discontinued combined P0043 workbooks (1980-2023-02) are carried into P0043.2 as 'P0043 legacy' files, filtered to the insolvency series (they agree with P0043.2 where they overlap).
# They are NOT merged into P0043.1: the legacy liquidation counts differ from the current P0043.1 series for the same months (e.g. Jan 2000: 193 vs 117), so joining them would create a false break.
$PUBS['P0043.1'] = @{ name = 'Statistics of liquidations';                tab = 'corporate';   freq = 'M'; measure = 'H04'; name_col = 'H05|H06'; sub = 'H07'; geo = $null; price = $null; base = $null }
$PUBS['P0043.2'] = @{ name = 'Statistics of insolvencies';                tab = 'corporate';   freq = 'M'; metaNewest = $true; measure = 'H04'; name_col = 'H05'; sub = $null; geo = 'H07'; price = $null; base = $null
                      fileRoles = @( @{ re = '^P0043 legacy'; roles = @{ idFilter = '^IN[VS]'; geo = $null; sub = 'H06' } } ) }
$PUBS['P0041']   = @{ name = 'Statistics of civil cases for debt';        tab = 'corporate';   freq = 'M'; measure = 'H04'; name_col = 'H05|H06'; sub = 'H07|H08'; geo = 'H13'; price = $null; base = $null }
$PUBS['P0044']   = @{ name = 'Quarterly financial statistics (QFS)';      tab = 'corporate';   freq = 'Q'; layout = 'qfs'; metaNewest = $true }
$PUBS['P9110.1'] = @{ name = 'Quarterly financial statistics of selected municipalities (QFSSM)'; tab = 'economy'; freq = 'Q'; layout = 'qfssm'; metaNewest = $true }
# --- macro batch (Excel files on the publication pages, /publications/<code>/) ---
# GDP: one workbook, six data sheets in the standard H-column layout. Quarterly periods are written 199301 ... 202602 (year + 0 + quarter); annual sheets are separate (P0441A).
$PUBS['P0441']   = @{ name = 'Gross domestic product (GDP), quarterly'; tab = 'economy'; freq = 'Q'; pfmt = 'q6'; sheets = @(3, 4, 5, 6); noteSheets = @(0, 7, 8) }
$PUBS['P0441A']  = @{ name = 'Gross domestic product (GDP), annual';    tab = 'economy'; freq = 'A'; folder = 'P0441'; sheets = @(1, 2); noteSheets = @() }
# QLFS Trends workbook: 27 report-style tables (rows = indicator hierarchy by indentation, columns = quarters written 'Jan-Mar 2008')
$PUBS['P0211']   = @{ name = 'Quarterly Labour Force Survey (QLFS)';    tab = 'economy'; freq = 'Q'; layout = 'qlfs' }
# QES details workbook: employees and gross earnings by industry (SIC) since Sep 2009; columns 200909 ... 202606 (quarter-end month, 'r' = revised)
$PUBS['P0277']   = @{ name = 'Quarterly Employment Statistics (QES)';    tab = 'economy'; freq = 'Q'; layout = 'qes' }
# Quarterly capital expenditure (time-series zip, standard H-column layout) and provincial GDP (report-style tables, annual)
$PUBS['P0045']   = @{ name = 'Quarterly capital expenditure (QCE)';       tab = 'economy'; freq = 'Q' }
$PUBS['P0441.2'] = @{ name = 'Provincial gross domestic product';         tab = 'economy'; freq = 'A'; layout = 'rgdp' }
# Government finance (annual GFS tables, 25 rows: revenue, expense and functional lines): national, consolidated general, provincial, extra-budgetary accounts, higher education
$PUBS['P9119.3'] = @{ name = 'Financial statistics of national government';                tab = 'economy'; freq = 'A' }
$PUBS['P9119.4'] = @{ name = 'Financial statistics of consolidated general government';     tab = 'economy'; freq = 'A' }
$PUBS['P9121']   = @{ name = 'Financial statistics of provincial government';               tab = 'economy'; freq = 'A' }
$PUBS['P9102']   = @{ name = 'Financial statistics of extra-budgetary accounts and funds';  tab = 'economy'; freq = 'A' }
$PUBS['P9103.1'] = @{ name = 'Financial statistics of higher education institutions';       tab = 'economy'; freq = 'A' }
# Capital expenditure by the public sector (annual): standard H-column layout, first sheet
$PUBS['P9101']   = @{ name = 'Capital expenditure by the public sector'; tab = 'economy'; freq = 'A' }
# Non-financial census of municipalities: provincial time series 2006 onwards (jobs in municipalities, councillors, indigent households, services and free basic services). Year headers carry '*' while provisional ('2023*').
$PUBS['P9115']   = @{ name = 'Non-financial census of municipalities'; tab = 'economy'; freq = 'A'; measure = 'H04'; name_col = 'H08'; sub = 'H05'; geo = 'H13'; unit = 'H17'; price = $null; adj = $null; base = $null }
# --- periodic industry surveys (structural statistics): one workbook per survey, columns Yyyyy / yyyy for the survey years, freq 'S'.
#     Only P1101 (annual) is in the app. The other 16 surveys are released every 2-5 years with no schedule and file names that change from edition to edition, so they were
#     taken out (source-data\_not-integrated). Moving a folder back into source-data re-enables its definition below. ---
$SURVEY = @{ idCols = @('H03'); measure = '@item'; name_col = 'H04'; sub = 'H05'; geo = 'H13'; price = 'H15'; adj = $null; unit = 'H17'; base = $null }
function Add-Survey([string]$code, [string]$name, $over) { if (-not (Test-Path (Join-Path $SourceDir $code))) { return }; $c = @{ name = $name; tab = 'surveys'; freq = 'S' }; foreach ($k in $SURVEY.Keys) { $c[$k] = $SURVEY[$k] }; if ($over) { foreach ($k in $over.Keys) { $c[$k] = $over[$k] } }; $script:PUBS[$code] = $c }
Add-Survey 'P1101'           'Agricultural survey'                                   @{ sub = $null; tab = 'resources'; freq = 'A' }       # annual: the one survey kept in the app
Add-Survey 'Report-12-00-00' 'Forestry, logging and related services industry'       $null
Add-Survey 'Report-13-00-00' 'Ocean (marine) fisheries and related services industry' $null
Add-Survey 'Report-20-01-02' 'Mining industry'                                       $null
Add-Survey 'Report-30-02-03' 'Manufacturing industry: financial detail'              @{ idCols = @('H03', 'H05') }
Add-Survey 'Report-30-02-04' 'Manufacturing industry: production'                    @{ name_col = 'H04'; sub = 'H05' }
Add-Survey 'Report-41-01-02' 'Electricity, gas and water supply industry'            @{ sub = $null }
Add-Survey 'Report-50-02-01' 'Construction industry'                                 @{ sub = $null }
Add-Survey 'Report-61-01-01' 'Wholesale trade industry'                              $null
Add-Survey 'Report-62-01-02' 'Retail trade industry'                                 $null
Add-Survey 'Report-63-01-02' 'Motor trade industry'                                  $null
Add-Survey 'Report-64-11-01' 'Accommodation industry'                                $null
Add-Survey 'Report-64-20-01' 'Food and beverages industry'                           $null
Add-Survey 'Report-71-02-01' 'Transport and storage industry'                        $null
Add-Survey 'Report-75-01-01' 'Post and telecommunications industry'                  $null
Add-Survey 'Report-80-04-02' 'Real estate, financial auxiliary and business services industry' $null
Add-Survey 'Report-90-01-01' 'Personal services industry'                            $null
$SURVEY_LEXICON_FROM = @('Report-30-02-03', 'Report-50-02-01', 'Report-71-02-01', 'Report-80-04-02', 'Report-90-01-01', 'Report-75-01-01', 'Report-41-01-02', 'P1101')
$DEFAULT_ROLES = @{ idCols = @('H03'); measure = 'H04'; name_col = 'H05'; sub = 'H06'; geo = 'H13'; geo2 = 'H14'
                    price = 'H15'; adj = 'H16'; unit = 'H17'; base = 'H18'; w = $null }
$ROLE_KEYS = @('idCols','measure','name_col','sub','geo','geo2','price','adj','unit','base','w','splitDash','splitColon','idFilter','pfmt','sheets','noteSheets')

$script:PQ6 = $false
function Convert-PeriodCode([string]$c) {
    if ($script:PQ6 -and $c -match '^(\d{4})0([1-4])$') { return "$($Matches[1])-Q$($Matches[2])" }
    if ($c -match '^MO(\d{2})(\d{4})$') { return "$($Matches[2])-$($Matches[1])" }
    if ($c -match '^QR(\d{2})(\d{4})$') { return "$($Matches[2])-Q$([int]$Matches[1])" }
    if ($c -match '^Y(\d{4})$')         { return $Matches[1] }
    if ($c -match '^[Mm](\d{4})(\d{2})$') { return "$($Matches[1])-$($Matches[2])" }
    if ($c -match '^(\d{4})MO(\d{2})$')   { return "$($Matches[1])-$($Matches[2])" }      # 1980MO03 (P0043 / P0041 pre-2000 files)
    if ($c -match '^(19|20)\d{2}$')        { return $c }                                  # plain year header (P1101)
    if ($c -match '^((19|20)\d{2})\*$')    { return $Matches[1] }                         # provisional year, '2023*' (P9115)
    return $null
}
# StatsSA truncates one unit label in P5041.1 ('Unit: Square me'): drop the 'Unit:' prefix and repair it
function Fix-Unit([string]$u) { $u = $u -replace '^Unit:\s*',''; if ($u -eq 'Square me') { $u = 'Square metres' }; return $u }
# StatsSA spells provinces differently across (and within) files; one spelling in the app
function Fix-Geo([string]$g) {
    $g = $g -replace '^(\w+)\.(\w+)$', '$1 $2'                      # Northern.Cape
    switch -Regex ($g) { '^(?i)kwa-?zulu[- ]natal$' { return 'KwaZulu-Natal' } '^(?i)north[- ]west$' { return 'North West' } '^(?i)rural areas$' { return 'Rural areas' } }
    return $g
}
$script:ITEM_LEX = @{}
function Item-Prefix([string]$h3, [string]$h5) {
    if ($h5 -ne '' -and $h3.EndsWith($h5, [StringComparison]::OrdinalIgnoreCase) -and $h3.Length -gt $h5.Length) { $pre = $h3.Substring(0, $h3.Length - $h5.Length) } else { $pre = $h3 -replace '\d+$', '' }
    if ($pre.Length -gt 5 -and $pre.EndsWith('TOTAL')) { $pre = $pre.Substring(0, $pre.Length - 5) }
    return $pre
}
function Build-ItemLexicon([string]$srcDir) {
    $cnt = @{}
    foreach ($c in $SURVEY_LEXICON_FROM) {
        $fl = @(Get-ChildItem (Join-Path $srcDir $c) -Recurse -Filter *.xlsx -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike '~$*' })
        foreach ($f in $fl) {
            $g = [XlsxGrid]::Read($f.FullName); $hd = $g[0]; $i3 = -1; $i5 = -1; $i6 = -1
            for ($i = 0; $i -lt $hd.Length; $i++) { switch ((Get-Cell $hd $i)) { 'H03' { $i3 = $i } 'H05' { $i5 = $i } 'H06' { $i6 = $i } } }
            if ($i3 -lt 0 -or $i6 -lt 0) { continue }
            for ($r = 1; $r -lt $g.Count; $r++) {
                $nm = (Get-Cell $g[$r] $i6); if ($nm -eq '') { continue }
                $k = Item-Prefix (Get-Cell $g[$r] $i3) $(if ($i5 -ge 0) { Get-Cell $g[$r] $i5 } else { '' }); if ($k -eq '') { continue }
                if (-not $cnt.ContainsKey($k)) { $cnt[$k] = @{} }
                if ($cnt[$k].ContainsKey($nm)) { $cnt[$k][$nm]++ } else { $cnt[$k][$nm] = 1 }
            }
        }
    }
    foreach ($k in $cnt.Keys) { $script:ITEM_LEX[$k] = ($cnt[$k].GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Name }
}
function Get-Cell($row, [int]$i) { if ($i -ge 0 -and $i -lt $row.Length) { $v = $row[$i]; if ($null -ne $v) { return $v.Trim() } }; return '' }
$script:badTokens = @{}
function ConvertTo-Num([string]$t, [string]$pub) {
    if ($null -eq $t) { return $null }
    $t = $t.Trim()
    if ($t -eq '') { return $null }
    $d = 0.0
    if ([double]::TryParse($t, [Globalization.NumberStyles]::Float, $inv, [ref]$d)) { return $d }
    $k = "$pub|$t"; if ($script:badTokens.ContainsKey($k)) { $script:badTokens[$k]++ } else { $script:badTokens[$k] = 1 }
    return $null
}
function Get-Adj($dims) {
    foreach ($t in $dims) { if ($t -match '(?i)season') { return 'sa' }; if ($t -match '(?i)\btrend\b') { return 'trend' } }
    return 'nsa'
}
function Get-Price([string[]]$vals) {
    foreach ($t in $vals) { if ($t -match '(?i)constant') { return 'constant' }; if ($t -match '(?i)current') { return 'current' } }
    return ''
}
function Esc([string]$s) {
    if ($null -eq $s) { return '""' }
    $sb = New-Object Text.StringBuilder
    [void]$sb.Append('"')
    foreach ($ch in $s.ToCharArray()) {
        switch ($ch) {
            '"'  { [void]$sb.Append('\"') }
            '\'  { [void]$sb.Append('\\') }
            "`n" { [void]$sb.Append('\n') }
            "`r" { [void]$sb.Append('\r') }
            "`t" { [void]$sb.Append('\t') }
            default { if ([int]$ch -lt 32) { [void]$sb.Append(('\u{0:x4}' -f [int]$ch)) } else { [void]$sb.Append($ch) } }
        }
    }
    [void]$sb.Append('"')
    return $sb.ToString()
}

function JsonObj($h) {
    if ($null -eq $h -or $h.Count -eq 0) { return '{}' }
    return '{' + (($h.Keys | Sort-Object | ForEach-Object { (Esc ([string]$_)) + ':' + (Esc ([string]$h[$_])) }) -join ',') + '}'
}

# One xlsx -> list of @{ id; meta(hashtable); vals(hashtable period->double) } plus the file's period list
function Read-PubFile([string]$path, [string]$code, $roles, [int]$sheet = 0) {
    $script:PQ6 = ($roles.pfmt -eq 'q6')
    $grid = [XlsxGrid]::ReadSheet($path, $sheet)
    if ($grid.Count -lt 2) { throw "$path : empty sheet" }
    $hdr = $grid[0]
    $out = New-Object System.Collections.Generic.List[object]
    $periodsInFile = New-Object System.Collections.Generic.List[string]
    $nRows = 0

    if ((Get-Cell $hdr 0) -eq 'month') {
        # Transposed legacy layout (P6343.2 1998-99): one column per series id, period code in a 'time' column
        $timeCol = -1; $firstId = -1; $lastId = -1
        for ($i = 0; $i -lt $hdr.Length; $i++) {
            $h = Get-Cell $hdr $i
            if ($h -eq 'time') { $timeCol = $i }
            if ($h -eq 'yy') { $lastId = $i - 1 }
            if ($firstId -lt 0 -and $i -ge 2) { $firstId = $i }
        }
        if ($timeCol -lt 0 -or $lastId -lt $firstId) { throw "$path : unrecognised transposed layout" }
        $tcells = 0
        for ($c = $firstId; $c -le $lastId; $c++) {
            $vals = @{}
            for ($r = 1; $r -lt $grid.Count; $r++) {
                $p = Convert-PeriodCode (Get-Cell $grid[$r] $timeCol)
                if (-not $p) { continue }
                $n = ConvertTo-Num (Get-Cell $grid[$r] $c) $code
                if ($null -ne $n) { $vals[$p] = $n; $tcells++ }
            }
            $out.Add(@{ id = (Get-Cell $hdr $c); meta = $null; vals = $vals })
        }
        for ($r = 1; $r -lt $grid.Count; $r++) { $p = Convert-PeriodCode (Get-Cell $grid[$r] $timeCol); if ($p) { $periodsInFile.Add($p) } }
        return @{ rows = $out; periods = $periodsInFile; nRows = ($grid.Count - 1); transposed = $true; cells = $tcells; skippedBlank = 0 }
    }

    $hcol = @{}; $pcols = New-Object System.Collections.Generic.List[int]; $plabels = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $hdr.Length; $i++) {
        $h = Get-Cell $hdr $i
        $p = Convert-PeriodCode $h
        if ($p -and $plabels.Contains($p) -and $plabels.Count -gt 0 -and $plabels[$plabels.Count - 1] -match '^(\d{4})-Q([1-4])$') {      # source typo: a repeated quarter label is the next quarter (GDP workbook lists 201803 twice)
            $y = [int]$Matches[1]; $q = [int]$Matches[2] + 1; if ($q -gt 4) { $q = 1; $y++ }; $p = "$y-Q$q"; Say "  note: repeated period label '$h' in header read as $p"
        }
        if ($p) { $pcols.Add($i); $plabels.Add($p); continue }
        if ($h -ne '') { $hcol[$h] = $i }            # H03.. or a plain header name (CPI/PPI product files)
    }
    if ($pcols.Count -lt 1) { return @{ rows = $out; periods = $periodsInFile; nRows = 0; transposed = $false; cells = 0; skippedBlank = 0; consts = @{}; extraCols = @(); notes = @(); noPeriods = $true } }   # e.g. a workbook that only repeats the series list
    foreach ($ic in $roles.idCols) { if (-not $hcol.ContainsKey($ic) -and $ic -ne 'H09') { throw "$path : id column '$ic' not found" } }
    foreach ($pl in $plabels) { $periodsInFile.Add($pl) }
    $ci = @{}
    $const = @{}
    $multi = @{}                                       # 'H05|H06' -> several columns joined with ' / '
    $itemRole = ($roles.measure -eq '@item')
    foreach ($k in 'measure','name_col','sub','geo','geo2','price','adj','unit','base','w') {
        $hn = $roles[$k]
        if ($k -eq 'measure' -and $itemRole) { $ci[$k] = -1; continue }
        if ($hn -and $hn.StartsWith('=')) { $const[$k] = $hn.Substring(1); $ci[$k] = -1; continue }
        if ($hn -and $hn.Contains('|')) { $multi[$k] = @($hn.Split('|') | ForEach-Object { if ($hcol.ContainsKey($_)) { $hcol[$_] } else { -1 } }); $ci[$k] = -1; continue }
        $ci[$k] = if ($hn -and $hcol.ContainsKey($hn)) { $hcol[$hn] } else { -1 }
    }
    $i03 = if ($hcol.ContainsKey('H03')) { $hcol['H03'] } else { -1 }; $i05 = if ($hcol.ContainsKey('H05')) { $hcol['H05'] } else { -1 }; $i06 = if ($hcol.ContainsKey('H06')) { $hcol['H06'] } else { -1 }
    $rv = { param($row, [string]$k) if ($multi.ContainsKey($k)) { return ((@($multi[$k] | ForEach-Object { Get-Cell $row $_ } | Where-Object { $_ -ne '' }) -join ' / ')) } else { return (Get-Cell $row $ci[$k]) } }
    $idRe = $roles.idFilter
    $idIdx = @($roles.idCols | ForEach-Object { if ($hcol.ContainsKey($_)) { $hcol[$_] } else { -1 } })
    $pc = $pcols.ToArray(); $pl = $plabels.ToArray(); $skippedBlank = 0; $cells = 0
    # Every descriptive column that is not already a field is carried: varying ones per series (x), single-valued ones once per file (consts).
    # Only the publication code/title (H01/H02) are not repeated - they sit at publication level.
    $mapped = @{}; foreach ($ic in $roles.idCols) { $mapped[$ic] = $true }
    foreach ($k in 'measure','name_col','sub','geo','geo2','price','adj','unit','base','w') { $hn = $roles[$k]; if ($hn -and -not $hn.StartsWith('=') -and $hn -ne '@item') { foreach ($one in $hn.Split('|')) { $mapped[$one] = $true } } }
    if ($itemRole -and $i06 -ge 0) { $mapped['H06'] = $true }
    $extra = @(); $consts = @{}
    foreach ($hn in $hcol.Keys) {
        if ($mapped.ContainsKey($hn) -or $hn -eq 'H01' -or $hn -eq 'H02') { continue }
        $j = $hcol[$hn]; $distinct = New-Object 'System.Collections.Generic.HashSet[string]'; $filled = 0
        for ($r = 1; $r -lt $grid.Count; $r++) { $t = Get-Cell $grid[$r] $j; if ($t -ne '') { $filled++; [void]$distinct.Add($t) } }
        if ($filled -eq 0) { continue }
        if ($distinct.Count -eq 1 -and $filled -eq ($grid.Count - 1)) { $consts[$hn] = @($distinct)[0] } else { $extra += [pscustomobject]@{ name = $hn; col = $j } }
    }
    for ($r = 1; $r -lt $grid.Count; $r++) {
        $row = $grid[$r]
        $idParts = @(); foreach ($ix in $idIdx) { $idParts += (Get-Cell $row $ix) }
        $id = (($idParts | Where-Object { $_ -ne '' }) -join '.')
        if ($id -eq '') { $skippedBlank++; continue }
        if ($idRe -and $id -notmatch $idRe) { continue }                                  # file-specific series filter (legacy workbooks)
        $nRows++
        $measure = if ($itemRole) { & { $v = if ($i06 -ge 0) { Get-Cell $row $i06 } else { '' }; if ($v -ne '') { $v } else { $pre = Item-Prefix (Get-Cell $row $i03) $(if ($i05 -ge 0) { Get-Cell $row $i05 } else { '' }); if ($script:ITEM_LEX.ContainsKey($pre)) { $script:ITEM_LEX[$pre] } else { $pre } } } } else { & $rv $row 'measure' }
        $name = & $rv $row 'name_col'; $sub = & $rv $row 'sub'
        $g1 = if ($const.ContainsKey('geo')) { $const.geo } else { & $rv $row 'geo' }; $g2 = & $rv $row 'geo2'
        $geo = Fix-Geo $(if ($g1 -match '^Province:?$' -and $g2) { $g2 } else { $g1 })
        $priceRaw = & $rv $row 'price'; $adjRaw = & $rv $row 'adj'
        if ($roles.splitDash -and $measure -match '^(.*?)\s+-\s+(.*)$') { $measure = $Matches[1]; $name = $Matches[2] }
        elseif ($roles.splitColon -and $measure -match '^(.*?)\s+:\s+(.*)$') { $measure = $Matches[1]; $name = $Matches[2] }
        $unitRaw = if ($const.ContainsKey('unit')) { $const.unit } else { & $rv $row 'unit' }
        $meta = @{
            measure = $measure; name = $name; sub = $sub; geo = $geo
            price = (Get-Price @($priceRaw, $adjRaw, $measure))
            adj = (Get-Adj @($adjRaw, $g1, $g2, $priceRaw, $name, $sub))
            unit = $(if ($unitRaw -match '(?i)percentage change') { 'Percentage' } else { Fix-Unit $unitRaw }); base = $(if ($unitRaw -match '(?i)percentage change') { $unitRaw } elseif ($const.ContainsKey('base')) { $const.base } else { & $rv $row 'base' })
            w = $(if ($ci.w -ge 0) { ConvertTo-Num (Get-Cell $row $ci.w) $code } else { $null })
        }
        $xb = @{}; foreach ($e in $extra) { $t = Get-Cell $row $e.col; if ($t -ne '') { $xb[$e.name] = $t } }
        $meta.x = $xb
        $vals = @{}
        for ($k = 0; $k -lt $pc.Length; $k++) {
            $j = $pc[$k]
            if ($j -lt $row.Length) {
                $t = $row[$j]
                if ($null -ne $t) { $n = ConvertTo-Num $t $code; if ($null -ne $n) { $vals[$pl[$k]] = $n; $cells++ } }
            }
        }
        $out.Add(@{ id = $id; meta = $meta; vals = $vals })
    }
    $notes = @(); $nsh = [XlsxGrid]::SheetCount($path); $dsh = if ($roles.sheets) { @($roles.sheets) } else { @(0) }
    $nsl = if ($roles.ContainsKey("noteSheets")) { @($roles.noteSheets) } else { @(0..($nsh - 1) | Where-Object { $dsh -notcontains $_ }) }
    for ($si = 0; $si -lt $nsh; $si++) { if ($nsl -notcontains $si -or $sheet -ne $dsh[0]) { continue }; foreach ($rw in [XlsxGrid]::ReadSheet($path, $si)) { foreach ($c in $rw) { if ($c -and $c.Trim()) { $notes += $c.Trim() } } } }
    return @{ rows = $out; periods = $periodsInFile; nRows = $nRows; transposed = $false; cells = $cells; skippedBlank = $skippedBlank; consts = $consts; extraCols = @($extra | ForEach-Object { $_.name }); notes = $notes }
}

# QLFS Trends: every sheet 'Table n: title' is a block of indicators; hierarchy comes from the indentation of the row label; a row with no numbers is a heading.
$script:PROVS = @{ 'western cape' = 'Western Cape'; 'eastern cape' = 'Eastern Cape'; 'northern cape' = 'Northern Cape'; 'northen cape' = 'Northern Cape'; 'free state' = 'Free State'; 'kwazulu-natal' = 'KwaZulu-Natal'; 'kwazulu natal' = 'KwaZulu-Natal'
                   'north west' = 'North West'; 'gauteng' = 'Gauteng'; 'mpumalanga' = 'Mpumalanga'; 'limpopo' = 'Limpopo'; 'south africa' = 'South Africa' }
function Read-QlfsFile([string]$path) {
    $nsh = [XlsxGrid]::SheetCount($path); $out = New-Object System.Collections.Generic.List[object]; $periods = New-Object System.Collections.Generic.List[string]; $notes = New-Object System.Collections.Generic.List[string]; $cells = 0; $nRows = 0
    $MQ = @{ 'jan' = 1; 'apr' = 2; 'jul' = 3; 'oct' = 4 }
    for ($si = 0; $si -lt $nsh; $si++) {
        $g = [XlsxGrid]::ReadSheet($path, $si)
        $title = ''; for ($r = 0; $r -lt [math]::Min(3, $g.Count); $r++) { $t = Get-Cell $g[$r] 0; if ($t -match '^Table\s*([0-9]+(?:[. ][0-9]+)?[a-z]?)\s*:\s*(.*)$') { $title = $Matches[2]; $tkey = 'T' + ($Matches[1] -replace ' ', '.'); break } }
        if ($title -eq '') { foreach ($rw in $g) { foreach ($c in $rw) { if ($c -and $c.Trim()) { $notes.Add($c.Trim()) } } }; continue }          # table of contents: text -> notes
        $hr = -1; for ($r = 0; $r -lt [math]::Min(8, $g.Count); $r++) { if ((Get-Cell $g[$r] 1) -match '^[A-Za-z]{3}-[A-Za-z]{3} \d{4}$') { $hr = $r; break } }
        if ($hr -lt 0) { foreach ($rw in $g) { foreach ($c in $rw) { if ($c -and $c.Trim()) { $notes.Add($c.Trim()) } } }; continue }          # table of contents (lists the tables but has no quarter columns)
        $notes.Add("Table " + $tkey.Substring(1) + ": " + $title)
        $pc = @{}; for ($c = 1; $c -lt $g[$hr].Length; $c++) { $t = Get-Cell $g[$hr] $c; if ($t -match '^([A-Za-z]{3})-[A-Za-z]{3} (\d{4})$') { $pc[$c] = "{0}-Q{1}" -f $Matches[2], $MQ[$Matches[1].ToLower()]; if ($pc.Values.Where({ $_ -eq $pc[$c] }).Count -gt 1 -and $c -gt 1 -and $pc.ContainsKey($c - 1) -and $pc[$c - 1] -match '^(\d{4})-Q(\d)$') { $y = [int]$Matches[1]; $q = [int]$Matches[2] + 1; if ($q -gt 4) { $q = 1; $y++ }; $pc[$c] = "$y-Q$q" }; if (-not $periods.Contains($pc[$c])) { $periods.Add($pc[$c]) } } }
        $unitRow = if ($g.Count -gt $hr + 1) { Get-Cell $g[$hr + 1] 1 } else { '' }; $tablePct = ($unitRow -match '(?i)per ?cent|%')
        $stack = New-Object System.Collections.ArrayList; $seen = @{}; $afterBlank = $true; $afterHead = $false
        for ($r = $hr + 1; $r -lt $g.Count; $r++) {
            $row = $g[$r]; $raw = if ($row.Length -gt 0 -and $null -ne $row[0]) { [string]$row[0] } else { '' }; $label = $raw.Trim(); if ($label -eq '') { $afterBlank = $true; continue }
            if ($label -match '^(Thousand|Per ?cent)$') { continue }
            $indent = $raw.Length - $raw.TrimStart().Length
            $hasAny = $false; for ($c = 1; $c -lt $row.Length; $c++) { if ((Get-Cell $row $c) -ne '') { $hasAny = $true; break } }
            if (-not $hasAny -and ($label -match '^(Due to rounding|Source:|Note)' -or $label -match '^Table\s' -or $label.Length -gt 60)) { $notes.Add($label); $afterBlank = $true; continue }          # footnotes, continuation titles
            if ($afterBlank -and -not $hasAny) { $stack.Clear(); [void]$stack.Add(@{ indent = $indent; label = $label; base = $true; grp = $false }); $afterBlank = $false; $afterHead = $true; continue }          # a heading after a blank row opens a block and is never popped (the workbook indents these inconsistently)
            $wasBlank = $afterBlank; $wasHead = $afterHead; $afterBlank = $false; $afterHead = $false
            while ($stack.Count -gt 0 -and -not $stack[$stack.Count - 1].base -and ($stack[$stack.Count - 1].indent -ge $indent -or ($wasBlank -and $stack[$stack.Count - 1].grp))) { $stack.RemoveAt($stack.Count - 1) }
            $grp = $false          # a data row after a blank row whose next row is at the same indent heads a group (flat blocks such as 'Both sexes' / 'Yes' / 'No')
            if (($wasBlank -or $wasHead) -and $hasAny -and $r + 1 -lt $g.Count) { $nx = $g[$r + 1]; $nr = if ($nx.Length -gt 0 -and $null -ne $nx[0]) { [string]$nx[0] } else { '' }; if ($nr.Trim() -ne '' -and ($nr.Length - $nr.TrimStart().Length) -eq $indent) { for ($c = 1; $c -lt $nx.Length; $c++) { if ((Get-Cell $nx $c) -ne '') { $grp = $true; break } } } }
            $pth = @($stack | ForEach-Object { $_.label }); $vals = @{}
            foreach ($c in $pc.Keys) { if ($c -lt $row.Length) { $n = ConvertTo-Num (Get-Cell $row $c) 'P0211'; if ($null -ne $n) { $vals[$pc[$c]] = $n } } }
            [void]$stack.Add(@{ indent = $(if ($grp) { $indent - 0.5 } else { $indent }); label = $label; base = $false; grp = $grp })
            if (-not $hasAny) { continue }          # sub-heading
            if ($vals.Count -eq 0) { continue }
            $key = $tkey + '|' + (($pth + $label) -join ' > '); if ($seen.ContainsKey($key)) { $seen[$key]++; $key = "$key #$($seen[$key])" } else { $seen[$key] = 1 }
            $ctx = ($pth + $label) -join ' '
            $pct = $tablePct -or ($ctx -match '(?i)\brate\b|\bratio\b|\(%\)|per cent|percent|\bshare\b|proportion|absorption|LU\d')
            $geo = ''
            $chain = @($label) + @($pth | ForEach-Object { $_ }); foreach ($x in $chain) { $k = $x.ToLower().Trim(); if ($script:PROVS.ContainsKey($k)) { $geo = $script:PROVS[$k]; break } }
            $nRows++
            $out.Add(@{ id = $key; meta = @{ measure = $title; name = $label; sub = ($pth -join ' > '); geo = $geo; price = ''; adj = 'nsa'; unit = $(if ($pct) { 'Percentage' } else { 'Thousand' }); base = ''; w = $null; x = @{ Table = $tkey.Substring(1) } }; vals = $vals }); $cells += $vals.Count
        }
    }
    return @{ rows = $out; periods = $periods; nRows = $nRows; transposed = $false; cells = $cells; skippedBlank = 0; consts = @{}; extraCols = @('Table'); notes = @($notes) }
}
# Provincial GDP: workbook with a ReadMe and 21 tables (1 = South Africa by activity, 2-10 = each province by activity, 11-20 = each activity by province, 21 = GDP by province); every table has blocks a-d
# (a current prices R million, b current prices % contribution, c constant 2015 prices R million, d constant % contribution) and a header row 'Industry' / 'Province' + years.
$script:PROVS['kwazulu/natal'] = 'KwaZulu-Natal'
function Read-RgdpFile([string]$path) {
    $nsh = [XlsxGrid]::SheetCount($path); $out = New-Object System.Collections.Generic.List[object]; $periods = New-Object System.Collections.Generic.List[string]; $notes = New-Object System.Collections.Generic.List[string]; $cells = 0; $nRows = 0
    for ($si = 0; $si -lt $nsh; $si++) {
        $g = [XlsxGrid]::ReadSheet($path, $si)
        if ($si -eq 0) { foreach ($rw in $g) { foreach ($c in $rw) { if ($c -and $c.Trim()) { $notes.Add($c.Trim()) } } }; continue }          # ReadMe
        $title = (Get-Cell $g[0] 0) -replace '[^\u0020-\u007e]', '-'; $tkey = "T$si"; $sub = ''; $block = ''; $bkey = ''; $pc = @{}; $seen = @{}
        $tprov = ''; if ($si -ge 2 -and $si -le 10) { $k = ($title -split ' - ')[0].Trim().ToLower(); if ($script:PROVS.ContainsKey($k)) { $tprov = $script:PROVS[$k] } }
        for ($r = 1; $r -lt $g.Count; $r++) {
            $row = $g[$r]; $c0 = Get-Cell $row 0; if ($c0 -eq '') { continue }
            if ($c0 -match '^([a-z])\.\s*(.*)$') { $bkey = $Matches[1]; $block = $Matches[2]; $pc = @{}; continue }
            $hdr = @{}; for ($c = 1; $c -lt $row.Length; $c++) { $t = Get-Cell $row $c; if ($t -match '^(19|20)\d{2}$') { $hdr[$c] = $t } }
            if ($hdr.Count -ge 3 -and $c0 -match '^(Industry|Province)$') { $pc = $hdr; foreach ($y in $hdr.Values) { if (-not $periods.Contains($y)) { $periods.Add($y) } }; continue }
            if ($pc.Count -eq 0) { if ($c0 -ne $title) { $sub = $c0 }; continue }
            $vals = @{}; foreach ($c in $pc.Keys) { if ($c -lt $row.Length) { $n = ConvertTo-Num (Get-Cell $row $c) 'P0441.2'; if ($null -ne $n) { $vals[$pc[$c]] = $n } } }
            if ($vals.Count -eq 0) { $notes.Add($c0); continue }
            $key = "$tkey|$bkey|$c0"; if ($seen.ContainsKey($key)) { $seen[$key]++; $key = "$key #$($seen[$key])" } else { $seen[$key] = 1 }
            $geo = $tprov; $lk = $c0.ToLower().Trim(); if ($script:PROVS.ContainsKey($lk)) { $geo = $script:PROVS[$lk] }
            $nRows++
            $out.Add(@{ id = $key; meta = @{ measure = ($title + $(if ($sub) { ' / ' + $sub } else { '' })); name = $c0; sub = $block; geo = $geo; price = $(if ($block -match '(?i)constant') { 'constant' } else { 'current' }); adj = 'nsa'; unit = $(if ($block -match '(?i)percent') { 'Percentage' } else { 'R million' }); base = $(if ($block -match '(?i)constant') { '2015 prices' } else { '' }); w = $null; x = @{ Table = $si } }; vals = $vals }); $cells += $vals.Count
        }
    }
    return @{ rows = $out; periods = $periods; nRows = $nRows; transposed = $false; cells = $cells; skippedBlank = 0; consts = @{}; extraCols = @('Table'); notes = @($notes) }
}
# Quarterly financial statistics of selected municipalities (P9110.1): one workbook per release; six sheets (combined / rates / housing-and-trading x revenue / expenditure),
# 130 municipalities + a national total down (a block of 'Question' rows each), the last five quarters across. Row order is identical in every release, only the newest one has a Q-order column.
# Known publisher errors, proven by exact cell-for-cell equality with the neighbouring releases (tools\Check-Municipal-Releases.py re-tests this on every run):
# the 'March 2026' workbook's two Combined sheets (sheet index 1 and 2) repeat the December 2025 figures under headers one quarter too late; its Rates and Housing sheets are correct.
$script:QFSSM_SHIFT = @{ 'P9110.1 March 2026 Unit Data.xlsx|1' = -1; 'P9110.1 March 2026 Unit Data.xlsx|2' = -1 }
function Read-QfssmFile([string]$path) {
    $nsh = [XlsxGrid]::SheetCount($path); $out = New-Object System.Collections.Generic.List[object]; $periods = New-Object System.Collections.Generic.List[string]; $notes = New-Object System.Collections.Generic.List[string]; $cells = 0; $nRows = 0
    $MQ = @{ 'march' = 1; 'june' = 2; 'september' = 3; 'december' = 4 }
    $SHEET = @{ 1 = @('CE', 'Combined expenditure'); 2 = @('CR', 'Combined revenue'); 3 = @('RE', 'Rates expenditure'); 4 = @('RR', 'Rates revenue'); 5 = @('HE', 'Housing and trading expenditure'); 6 = @('HR', 'Housing and trading revenue') }
    $GROUP = @{ 'Property rates from:' = 4; 'Service charges:' = 5; 'Interest on:' = 3; 'Government transfers and subsidies:' = 3; 'Contracted services:' = 3; 'Operating leases:' = 4; 'Bulk purchases:' = 3; 'Transfers and subsidies:' = 5; 'Operational costs:' = 14 }
    for ($si = 0; $si -lt $nsh; $si++) {
        $g = [XlsxGrid]::ReadSheet($path, $si); if ($g.Count -eq 0) { continue }
        $qc = -1; for ($c = 0; $c -lt $g[0].Length; $c++) { if ((Get-Cell $g[0] $c) -eq 'Question') { $qc = $c; break } }
        if ($qc -lt 0) { foreach ($rw in $g) { foreach ($c in $rw) { if ($c -and $c.Trim()) { $notes.Add($c.Trim()) } } }; continue }          # 'NB notes' sheet
        $sh = $SHEET[$si]; if (-not $sh) { throw "$path sheet $si : unexpected extra sheet" }          # the sheet order is the same in every release
        $isExp = $false; $isRev = $false; foreach ($rw in $g) { $t = Get-Cell $rw $qc; if ($t -eq 'Total expenditure') { $isExp = $true; break }; if ($t -eq 'Total revenue') { $isRev = $true; break } }
        if (($sh[1] -match 'expenditure' -and -not $isExp) -or ($sh[1] -match 'revenue' -and -not $isRev)) { throw "$path sheet $si : expected '$($sh[1])' but the totals row says otherwise" }
        # the five period columns are consecutive quarters ending with the release quarter; the release workbooks contain header typos (March 2026 lists 'March 2026*' first), so count back from the last label
        $hdr = @(); for ($c = $qc + 1; $c -lt $g[0].Length; $c++) { $t = Get-Cell $g[0] $c; if ($t -match '^([A-Za-z]+)\s+(\d{4})') { $hdr += [pscustomobject]@{ col = $c; label = $t; m = $Matches[1].ToLower(); y = [int]$Matches[2] } } }
        if ($hdr.Count -eq 0) { throw "$path sheet $si : no period header" }
        $last = $hdr[$hdr.Count - 1]; $y = $last.y; $q = $MQ[$last.m]; $pc = @{}
        $shk = [IO.Path]::GetFileName($path) + '|' + $si
        if ($script:QFSSM_SHIFT.ContainsKey($shk)) {
            $sh1 = $script:QFSSM_SHIFT[$shk]; $q += $sh1; while ($q -lt 1) { $q += 4; $y-- }; while ($q -gt 4) { $q -= 4; $y++ }
            $notes.Add("Sheet '" + $sh[1] + "' of " + [IO.Path]::GetFileName($path) + " repeats the figures of the previous release under headers one quarter late; read as the quarters it actually contains"); Say "  note: $shk shifted by $sh1 quarter(s)"
        }
        for ($k = $hdr.Count - 1; $k -ge 0; $k--) {
            $lab = "{0}-Q{1}" -f $y, $q; $pc[$hdr[$k].col] = $lab; if (-not $periods.Contains($lab)) { $periods.Add($lab) }
            if (-not $script:QFSSM_SHIFT.ContainsKey($shk) -and ($hdr[$k].y -ne $y -or $MQ[$hdr[$k].m] -ne $q)) { $notes.Add("Header '" + $hdr[$k].label + "' in " + [IO.Path]::GetFileName($path) + " read as " + $lab + " (columns are consecutive quarters ending with the release quarter)"); Say "  note: header '$($hdr[$k].label)' read as $lab" }
            $q--; if ($q -lt 1) { $q = 4; $y-- }
        }
        $curMun = $null; $occ = @{}; $grp = ''; $left = 0
        for ($r = 1; $r -lt $g.Count; $r++) {
            $row = $g[$r]; $prov = Get-Cell $row 0; if ($prov -eq '') { continue }
            $dist = Get-Cell $row 1; $mun = Get-Cell $row 2; $qn = Get-Cell $row $qc; if ($qn -eq '') { continue }
            $qo = if ($qc -ge 4) { Get-Cell $row 3 } else { '' }          # Q-order: only the newest release carries it
            $mkey = "$prov|$mun"; if ($mkey -ne $curMun) { $curMun = $mkey; $occ = @{}; $grp = ''; $left = 0 }
            $sub = ''
            if ($GROUP.ContainsKey($qn)) { $grp = $qn.TrimEnd(':'); $left = $GROUP[$qn] } elseif ($left -gt 0) { $sub = $grp; $left-- }
            $muniName = if ($mun) { $mun } else { 'All 130 municipalities' }
            $key = "$($sh[0])|$muniName|$qn"; if ($occ.ContainsKey($key)) { $occ[$key]++; $key = "$key #$($occ[$key])" } else { $occ[$key] = 1 }
            $vals = @{}; foreach ($c in $pc.Keys) { if ($c -lt $row.Length) { $n = ConvertTo-Num (Get-Cell $row $c) 'P9110.1'; if ($null -ne $n) { $vals[$pc[$c]] = $n } } }
            $nRows++
            if ($vals.Count -eq 0) { continue }
            $out.Add(@{ id = $key; meta = @{ measure = $sh[1]; name = $qn; sub = $sub; geo = $muniName; price = ''; adj = 'nsa'; unit = "R'000"; base = ''; w = $null; x = $(if ($qo) { @{ Province = $prov; District = $dist; 'Q-order' = $qo } } else { @{ Province = $prov; District = $dist } }) }; vals = $vals }); $cells += $vals.Count
        }
    }
    return @{ rows = $out; periods = $periods; nRows = $nRows; transposed = $false; cells = $cells; skippedBlank = 0; consts = @{}; extraCols = @('Province', 'District', 'Q-order'); notes = @($notes) }
}
# QES details: 'Employment' and 'Gross earnings' sheets, industries down, quarters across (period header 200909, 202603r ...)
function Read-QesFile([string]$path) {
    $nsh = [XlsxGrid]::SheetCount($path); $out = New-Object System.Collections.Generic.List[object]; $periods = New-Object System.Collections.Generic.List[string]; $notes = New-Object System.Collections.Generic.List[string]; $cells = 0; $nRows = 0
    $QM = @{ '03' = 1; '06' = 2; '09' = 3; '12' = 4 }
    for ($si = 0; $si -lt $nsh; $si++) {
        $g = [XlsxGrid]::ReadSheet($path, $si); $t0 = Get-Cell $g[0] 2
        if ($t0 -match '(?i)employees') { $kind = 'EMP'; $measure = 'Number of employees'; $unit = 'Number' } elseif ($t0 -match '(?i)earnings') { $kind = 'EARN'; $measure = 'Gross earnings'; $unit = 'Rand' }
        else { foreach ($rw in $g) { foreach ($c in $rw) { if ($c -and $c.Trim()) { $notes.Add($c.Trim()) } } }; continue }
        $notes.Add($t0);
        $hr = -1; for ($r = 0; $r -lt [math]::Min(5, $g.Count); $r++) { if ((Get-Cell $g[$r] 2) -match '^\d{6}r?$') { $hr = $r; break } }
        if ($hr -lt 0) { throw "$path sheet $si : no period header row" }
        $pc = @{}; for ($c = 2; $c -lt $g[$hr].Length; $c++) { $t = Get-Cell $g[$hr] $c; if ($t -match '^(\d{4})(\d{2})r?$') { $pc[$c] = "{0}-Q{1}" -f $Matches[1], $QM[$Matches[2]]; if (-not $periods.Contains($pc[$c])) { $periods.Add($pc[$c]) } } }
        $done = $false
        for ($r = $hr + 1; $r -lt $g.Count; $r++) {
            $row = $g[$r]; $label = Get-Cell $row 0; if ($label -eq '') { continue }
            if ($done -or $label -match '^Notes on SIC') { $done = $true; foreach ($c in $row) { if ($c -and $c.Trim()) { $notes.Add($c.Trim()) } }; continue }
            $sic = Get-Cell $row 1; $vals = @{}
            foreach ($c in $pc.Keys) { if ($c -lt $row.Length) { $n = ConvertTo-Num (Get-Cell $row $c) 'P0277'; if ($null -ne $n) { $vals[$pc[$c]] = $n } } }
            $nRows++
            if ($label -eq 'TOTAL') { $done = $true }
            if ($vals.Count -eq 0) { continue }
            $out.Add(@{ id = "$kind|$(if ($sic) { $sic } else { 'TOTAL' })|$label"; meta = @{ measure = $measure; name = $label; sub = $(if ($sic) { 'SIC ' + $sic } else { 'All industries' }); geo = ''; price = $(if ($kind -eq 'EARN') { 'current' } else { '' }); adj = 'nsa'; unit = $unit; base = ''; w = $null; x = @{ 'SIC code' = $sic } }; vals = $vals }); $cells += $vals.Count
        }
    }
    return @{ rows = $out; periods = $periods; nRows = $nRows; transposed = $false; cells = $cells; skippedBlank = 0; consts = @{}; extraCols = @('SIC code'); notes = @($notes) }
}

# Quarterly financial statistics: each release workbook holds the previous and the current quarter as report tables (items down, industry x size across).
function Read-QfsFile([string]$path) {
    $nsh = [XlsxGrid]::SheetCount($path); $out = New-Object System.Collections.Generic.List[object]; $periods = New-Object System.Collections.Generic.List[string]; $cells = 0; $nRows = 0; $notes = New-Object System.Collections.Generic.List[string]
    $MQ = @{ 'mar' = 1; 'jun' = 2; 'sep' = 3; 'dec' = 4 }
    for ($si = 0; $si -lt $nsh; $si++) {
        $g = [XlsxGrid]::ReadSheet($path, $si)
        $hr = -1; $tr = -1                                                                            # empty rows are absent from the sheet xml, so find the header by content
        for ($r = 0; $r -lt [math]::Min(14, $g.Count); $r++) { $c0 = Get-Cell $g[$r] 0; if ($c0 -eq 'Item' -and $hr -lt 0) { $hr = $r }; if ($c0 -like 'Quarterly Financial Statistics Survey*' -and $tr -lt 0) { $tr = $r } }
        if ($hr -lt 0 -or $tr -lt 0 -or $g.Count -lt 12) {                                              # DTIC cut-off sheet etc.: its text is kept as publication notes
            foreach ($rw in $g) { foreach ($c in $rw) { if ($c -and $c.Trim()) { $notes.Add($c.Trim()) } } }
            continue
        }
        for ($r = 0; $r -lt $hr; $r++) { foreach ($c in $g[$r]) { if ($c -and $c.Trim()) { $notes.Add($c.Trim()) } } }                    # title lines
        if ((Get-Cell $g[$tr] 0) -notmatch '(?i)(mar|jun|sep|dec)[a-z]*\s*(\d{4})') { throw "$path sheet $si : cannot read the quarter from '$(Get-Cell $g[$tr] 0)'" }
        $per = "{0}-Q{1}" -f $Matches[2], $MQ[$Matches[1].ToLower()]
        $periods.Add($per)
        $ind = @{}; $cur = ''; $hd = $g[$hr]
        for ($c = 1; $c -lt $hd.Length; $c++) { $t = Get-Cell $hd $c; if ($t -ne '') { $cur = ($t -replace '(?<=industry)\d$', '').Trim() }; $ind[$c] = $cur }
        $size = @{}; for ($c = 1; $c -lt $g[$hr + 1].Length; $c++) { $size[$c] = Get-Cell $g[$hr + 1] $c }
        $rng = @{}; $section = ''; $seen = @{}
        for ($r = $hr + 2; $r -lt $g.Count; $r++) {
            $row = $g[$r]; $label = Get-Cell $row 0
            if ($label -like 'Range for*') { $notes.Add($label); for ($c = 1; $c -lt $row.Length; $c++) { $t = Get-Cell $row $c; if ($t -ne '') { $rng[$c] = $t } }; continue }       # size cut-offs per industry: kept on every series of that column
            if ($label -match '^\d ') { $notes.Add($label); continue }
            if ($label -eq '') { foreach ($c in $row) { if ($c -and $c.Trim()) { $notes.Add($c.Trim()) } }; continue }                                                                    # unit row
            $nums = @(); for ($c = 1; $c -lt $row.Length; $c++) { if ((Get-Cell $row $c) -ne '') { $nums += $c } }
            if ($nums.Count -eq 0) { $section = $label; continue }
            $key = if ($seen.ContainsKey($label)) { $seen[$label]++; "$label #$($seen[$label])" } else { $seen[$label] = 1; $label }
            $nRows++
            for ($c = 1; $c -lt $row.Length; $c++) {
                if (-not $ind.ContainsKey($c) -or $ind[$c] -eq '') { continue }
                $n = ConvertTo-Num (Get-Cell $row $c) 'P0044'; if ($null -eq $n) { continue }
                $sz = $size[$c]; $xa = @{ Section = $section }; if ($rng.ContainsKey($c)) { $xa['Size range'] = $rng[$c] }
                $out.Add(@{ id = "$key|$($ind[$c])|$sz"; meta = @{ measure = $label; name = $ind[$c]; sub = $sz; geo = ''; price = 'current'; adj = 'nsa'; unit = 'R million'; base = ''; w = $null; x = $xa }; vals = @{ $per = $n } }); $cells++
            }
        }
    }
    return @{ rows = $out; periods = $periods; nRows = $nRows; transposed = $false; cells = $cells; skippedBlank = 0; consts = @{}; extraCols = @('Section', 'Size range'); notes = @($notes) }
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
$report = [ordered]@{}
$manifest = New-Object System.Collections.Generic.List[object]
$parsedAt = (Get-Date).ToString('s')
$enc = New-Object Text.UTF8Encoding($false)

Build-ItemLexicon $SourceDir
foreach ($code in $PUBS.Keys) {
    if ($Only -and ($Only -notcontains $code)) { continue }
    $cfg = $PUBS[$code]
    $roles = @{}; foreach ($k in $DEFAULT_ROLES.Keys) { $roles[$k] = $DEFAULT_ROLES[$k] }
    foreach ($k in $cfg.Keys) { if ($k -in $ROLE_KEYS) { $roles[$k] = $cfg[$k] } }
    $dir = Join-Path $SourceDir $(if ($cfg.folder) { $cfg.folder } else { $code })
    $files = @(Get-ChildItem $dir -Recurse -Filter *.xlsx -File | Where-Object { $_.Name -notlike '~$*' })
    if ($files.Count -eq 0) { throw "$code : no xlsx under $dir" }
    Say "$code  ($($cfg.name)) - $($files.Count) file(s)"

    # read every file, order oldest-first by last period so the newest file wins on overlap
    $parsed = @(); $sources = @()
    foreach ($f in $files) {
        $fr = @{}; foreach ($k in $roles.Keys) { $fr[$k] = $roles[$k] }                  # file-specific layout, where the publication has several
        foreach ($fo in @($cfg.fileRoles)) { if ($fo -and $f.Name -match $fo.re) { foreach ($k in $fo.roles.Keys) { $fr[$k] = $fo.roles[$k] } } }
        $sheetList = if ($cfg.sheets) { @($cfg.sheets) } else { @(0) }
        foreach ($shx in $sheetList) {
            $res = switch ($cfg.layout) { 'qfs' { Read-QfsFile $f.FullName } 'qlfs' { Read-QlfsFile $f.FullName } 'qes' { Read-QesFile $f.FullName } 'rgdp' { Read-RgdpFile $f.FullName } 'qfssm' { Read-QfssmFile $f.FullName } default { Read-PubFile $f.FullName $code $fr $shx } }
            $ps = @($res.periods | Sort-Object); $fname = if ($cfg.sheets) { $f.Name + ' [sheet ' + $shx + ']' } else { $f.Name }
            if ($ps.Count -eq 0) { Say "   (skipped ${fname}: no period columns - it only repeats the series list)"; $sources += [ordered]@{ file = $fname; first = ''; last = ''; rows = 0; transposed = $false; cells = 0; duplicateIds = 0; consts = @{}; extraCols = @(); notes = @(); skipped = $true }; continue }
            $parsed += [pscustomobject]@{ file = $fname; res = $res; first = $ps[0]; last = $ps[$ps.Count - 1] }
        }
    }
    $parsed = @($parsed | Sort-Object last, first)
    if ($cfg.layout -eq 'qfs' -or $cfg.layout -eq 'qfssm') { for ($qi = 0; $qi -lt $parsed.Count - 1; $qi++) { $parsed[$qi].res.notes = @() } }          # titles, footnotes and cut-offs of the newest release only

    $series = [ordered]@{}   # id -> @{ meta; vals }
    $allP = New-Object System.Collections.Generic.HashSet[string]
    $conflicts = 0; $skippedNoMeta = New-Object System.Collections.Generic.List[string]
    $dupRows = 0
    foreach ($pf in $parsed) {
        foreach ($p in $pf.res.periods) { [void]$allP.Add($p) }
        $fileDup = 0
        foreach ($row in $pf.res.rows) {
            $key = $row.id
            if ($series.Contains($key) -and $null -ne $row.meta) { $fileDup++ }
            $isNew = $false
            if (-not $series.Contains($key)) {
                if ($null -eq $row.meta) { $skippedNoMeta.Add($key); continue }   # transposed id with no metadata anywhere (yet)
                $series[$key] = @{ meta = $row.meta; vals = @{} }; $isNew = $true
            }
            $tgt = $series[$key]
            # publications continued across workbooks (liquidations, insolvencies): the newest workbook's labels win, older attributes are kept
            if ($cfg.metaNewest -and -not $isNew -and $row.meta) { $oldx = $tgt.meta.x; $tgt.meta = $row.meta; if ($oldx) { foreach ($xk in $oldx.Keys) { if (-not $tgt.meta.x.ContainsKey($xk)) { $tgt.meta.x[$xk] = $oldx[$xk] } } } }
            # duplicate rows can carry complementary attributes as well as complementary periods: keep the first row's fields, add any attribute it lacks
            if ($row.meta -and $row.meta.x -and $tgt.meta.x) { foreach ($xk in $row.meta.x.Keys) { if (-not $tgt.meta.x.ContainsKey($xk)) { $tgt.meta.x[$xk] = $row.meta.x[$xk] } } }
            foreach ($p in $row.vals.Keys) {
                $nv = $row.vals[$p]
                if ($tgt.vals.ContainsKey($p) -and [math]::Abs($tgt.vals[$p] - $nv) -gt 1e-9) { $conflicts++ }
                $tgt.vals[$p] = $nv
            }
        }
        $dupRows += $fileDup
        $sources += [ordered]@{ file = $pf.file; first = $pf.first; last = $pf.last; rows = $pf.res.nRows; transposed = $pf.res.transposed; cells = $pf.res.cells; duplicateIds = $fileDup; consts = $pf.res.consts; extraCols = $pf.res.extraCols; notes = $pf.res.notes }
    }
    # a transposed legacy file may be read BEFORE the main file (it is older); re-apply any skipped ids now that metadata exists
    if ($skippedNoMeta.Count -gt 0) {
        foreach ($pf in $parsed) { foreach ($row in $pf.res.rows) {
            if ($null -eq $row.meta -and $series.Contains($row.id)) {
                $tgt = $series[$row.id]
                foreach ($p in $row.vals.Keys) {
                    # only fill gaps: never overwrite what the newer main file provided
                    if (-not $tgt.vals.ContainsKey($p)) { $tgt.vals[$p] = $row.vals[$p] }
                }
            } } }
    }
    $stillMissing = @($skippedNoMeta | Where-Object { -not $series.Contains($_) } | Sort-Object -Unique)

    $periods = @($allP | Sort-Object)
    $pIdx = @{}; for ($i = 0; $i -lt $periods.Count; $i++) { $pIdx[$periods[$i]] = $i }

    $sb = New-Object Text.StringBuilder
    [void]$sb.Append('(window.EQ=window.EQ||{pubs:{}}).pubs[' + (Esc $code) + ']={')
    [void]$sb.Append('"code":' + (Esc $code) + ',"name":' + (Esc $cfg.name) + ',"tab":' + (Esc $cfg.tab) + ',"freq":' + (Esc $cfg.freq) + ',"parsedAt":' + (Esc $parsedAt))
    [void]$sb.Append(',"periods":[' + (($periods | ForEach-Object { Esc $_ }) -join ',') + ']')
    [void]$sb.Append(',"sources":[' + (($sources | ForEach-Object { '{"file":' + (Esc $_.file) + ',"first":' + (Esc $_.first) + ',"last":' + (Esc $_.last) + ',"rows":' + $_.rows + ',"cells":' + $_.cells + ',"dup":' + $_.duplicateIds + ',"consts":' + (JsonObj $_.consts) + ',"xcols":[' + ((@($_.extraCols) | ForEach-Object { Esc $_ }) -join ',') + ']}' }) -join ',') + ']')
    $notesAll = @($sources | ForEach-Object { $_.notes } | Where-Object { $_ } | Select-Object -Unique)
    [void]$sb.Append(',"notes":[' + (($notesAll | ForEach-Object { Esc $_ }) -join ',') + ']')
    [void]$sb.Append(',"series":[')
    $firstS = $true; $nEmpty = 0; $emptyList = @()
    foreach ($id in $series.Keys) {
        $s = $series[$id]; $m = $s.meta
        $idxs = @($s.vals.Keys | ForEach-Object { $pIdx[$_] } | Sort-Object)
        if ($idxs.Count -eq 0) { $nEmpty++; $emptyList += ('{"id":' + (Esc $id) + ',"label":' + (Esc ((@($m.measure, $m.name, $m.sub, $m.geo) | Where-Object { $_ } | Select-Object -Unique) -join ' / ')) + ',"x":' + (JsonObj $m.x) + '}'); continue }   # rows with no observation at all: kept as a record, not a series
        $lo = $idxs[0]; $hi = $idxs[$idxs.Count - 1]
        $vv = New-Object 'System.Collections.Generic.List[string]'
        for ($i = $lo; $i -le $hi; $i++) {
            $p = $periods[$i]
            if ($s.vals.ContainsKey($p)) { $vv.Add(([double]$s.vals[$p]).ToString('G12', $inv)) } else { $vv.Add('null') }
        }
        $labelParts = @($m.measure, $m.name, $m.sub, $m.geo) | Where-Object { $_ } | Select-Object -Unique
        $label = $labelParts -join ' / '
        if (-not $firstS) { [void]$sb.Append(',') }; $firstS = $false
        [void]$sb.Append('{"id":' + (Esc $id) + ',"measure":' + (Esc $m.measure) + ',"name":' + (Esc $m.name) + ',"sub":' + (Esc $m.sub) + ',"geo":' + (Esc $m.geo) +
            ',"price":' + (Esc $m.price) + ',"adj":' + (Esc $m.adj) + ',"unit":' + (Esc $m.unit) + ',"base":' + (Esc $m.base) + ',"label":' + (Esc $label) +
            $(if ($null -ne $m.w) { ',"w":' + ([double]$m.w).ToString('G10', $inv) } else { '' }) + $(if ($m.x -and $m.x.Count) { ',"x":' + (JsonObj $m.x) } else { '' }) + ',"s":' + $lo + ',"v":[' + ($vv -join ',') + ']}')
    }
    [void]$sb.Append(']' + $(if ($emptyList.Count) { ',"empty":[' + ($emptyList -join ',') + ']' } else { '' }) + '};' + "`n")
    $outFile = Join-Path $OutDir ($code + '.js')
    [IO.File]::WriteAllText($outFile, $sb.ToString(), $enc)

    $nSeries = $series.Count - $nEmpty
    $report[$code] = [ordered]@{
        files = @($sources | ForEach-Object { $_.file }); series = $nSeries; emptySeriesDropped = $nEmpty
        periods = $periods.Count; first = $periods[0]; last = $periods[$periods.Count - 1]
        crossFileConflicts = $conflicts; legacyIdsWithoutMetadata = $stillMissing; duplicateRows = $dupRows
        cells = (($sources | ForEach-Object { $_.cells } | Measure-Object -Sum).Sum); rowsRead = (($sources | ForEach-Object { $_.rows } | Measure-Object -Sum).Sum)
        fileDetail = @($sources | ForEach-Object { [ordered]@{ file = $_.file; rows = $_.rows; cells = $_.cells; duplicateIds = $_.duplicateIds; extraColumns = @($_.extraCols); constantColumns = @($_.consts.Keys | Sort-Object); noteCells = @($_.notes).Count } })
        bytes = (Get-Item $outFile).Length
    }
    $manifest.Add([ordered]@{ code = $code; name = $cfg.name; tab = $cfg.tab; freq = $cfg.freq; sched = $(if ($cfg.sched) { $cfg.sched } else { $code }); series = $nSeries; first = $periods[0]; last = $periods[$periods.Count - 1]; parsedAt = $parsedAt })
    Say ("   {0} series, {1} periods ({2} .. {3}), {4} KB, conflicts={5}" -f $nSeries, $periods.Count, $periods[0], $periods[$periods.Count - 1], [math]::Round((Get-Item $outFile).Length / 1KB), $conflicts)
}

# manifest.js (+ release schedule seed if present)
$schedPath = Join-Path $PSScriptRoot 'schedule-seed.json'
$schedJson = '[]'
if (Test-Path $schedPath) { $schedJson = ([IO.File]::ReadAllText($schedPath) -replace '\s*\r?\n\s*', '') }
if (-not $Only) {
    $mj = '(window.EQ=window.EQ||{pubs:{}}).manifest={"parsedAt":' + (Esc $parsedAt) + ',"pubs":[' +
        (($manifest | ForEach-Object { '{"code":' + (Esc $_.code) + ',"name":' + (Esc $_.name) + ',"tab":' + (Esc $_.tab) + ',"freq":' + (Esc $_.freq) + ',"sched":' + (Esc $_.sched) + ',"series":' + $_.series + ',"first":' + (Esc $_.first) + ',"last":' + (Esc $_.last) + '}' }) -join ',') +
        '],"schedule":' + $schedJson + ',"report":' + ($report | ConvertTo-Json -Depth 6 -Compress) + '};' + "`n"
    [IO.File]::WriteAllText((Join-Path $OutDir 'manifest.js'), $mj, $enc)
}
$rj = $report | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $OutDir '_parse-report.json'), $rj, $enc)
if ($script:badTokens.Count -gt 0) {
    Say "Non-numeric cell tokens ignored (pub|token = count):"
    $script:badTokens.GetEnumerator() | Sort-Object Name | ForEach-Object { Say ("   {0} = {1}" -f $_.Name, $_.Value) }
}
$tot = ($report.Values | ForEach-Object { $_.series } | Measure-Object -Sum).Sum
Say "Done: $tot series across $($report.Count) publication(s) -> $OutDir"
