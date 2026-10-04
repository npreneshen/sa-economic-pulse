# Download-Batch2.ps1 - one-off fetch of the second batch of StatsSA time-series zips (land transport, food & beverages, trade unit values,
# liquidations/insolvencies/civil cases, quarterly capital expenditure is NOT here, and the periodic industry surveys) into ../source-data/<code>/.
# Uses the same minimised-Edge-window technique as the updater (Imperva blocks scripted requests). Files that already exist are skipped.
# NOTE (2026-10-02): the 16 periodic industry surveys that were first fetched here were removed again (irregular editions, unpredictable file names); only P1101 remains. A record of how the second batch was fetched. It does not rebuild three hand-made pieces: (1) source-data\P0043.2\EXCEL\"P0043 legacy - ..." (the two workbooks of the discontinued P0043 zip, prefixed
# with "P0043 legacy - "; the parser keeps only their insolvency series), (2) source-data\_superseded\ (files deliberately not parsed), (3) the removal of Report-11-01-01 (two survey years only).
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "EdgeDownload.ps1")
$root = Join-Path (Split-Path -Parent $PSScriptRoot) "source-data"
$base = "https://www.statssa.gov.za/timeseriesdata/Excel/"
$files = @(
 @('P7162',   'P7162 Land transport survey(202607).zip'),
 @('P6420',   'P6420 Food and beverages (202607).zip'),
 @('P0142.7', 'P0142.7 Export and import unit value indices(202607).zip'),
 @('P0142.7', 'P0142.7 Export and import unit value indices(202212) discontinued.zip'),
 @('P0142.7', 'P0142.7 Unit value indices Indicative time series, December 2015.zip'),
 @('P0043.1', 'P0043.1 Liquidations (202608).zip'),
 @('P0043.2', 'P0043.2 Statistics of insolvencies (202608).zip'),
 @('P0043',   'P0043 Liquidations and insolvencies(202302).zip'),
 @('P0041',   'P0041 Civil cases for debt (202607).zip'),
 @('P1101',   'P1101 - Agricultural survey (2024).zip'),
)
foreach ($f in $files) {
    $code = $f[0]; $name = $f[1]
    $dir = Join-Path $root $code; New-Item -ItemType Directory -Force $dir | Out-Null
    $dest = Join-Path $dir ($name -replace ':', '')
    if (Test-Path $dest) { "{0,-16} exists" -f $code; continue }
    $url = $base + ($name -replace ' ', '%20')
    $ok = Invoke-BrowserDownload -url $url -destPath $dest -timeoutSec 90
    $len = if (Test-Path $dest) { (Get-Item $dest).Length } else { 0 }
    "{0,-16} ok={1} bytes={2}  {3}" -f $code, $ok, $len, $name
}

# Quarterly financial statistics (P0044): one workbook per release under /publications/P0044/, named "<Month> <Year> Details SML.zip".
# StatsSA only links the latest on the publication page, but the earlier ones are still served; each holds the previous and the current quarter.
# Releases back to September 2020 exist (earlier ones do not). The updater adds each new quarter by itself (P0044 ACCUMULATEs).
$qDir = Join-Path $root "P0044"; New-Item -ItemType Directory -Force $qDir | Out-Null
foreach ($y in 2026, 2025, 2024, 2023, 2022, 2021, 2020) {
    foreach ($m in 'December', 'September', 'June', 'March') {
        if ($y -eq 2026 -and $m -in 'December', 'September') { continue }
        if ($y -eq 2020 -and $m -in 'June', 'March') { continue }
        $nm = "$m $y Details SML.zip"; $dest = Join-Path $qDir $nm
        if (Test-Path $dest) { continue }
        $ok = Invoke-BrowserDownload -url ("https://www.statssa.gov.za/publications/P0044/" + ($nm -replace ' ', '%20')) -destPath $dest -timeoutSec 40
        "{0,-16} ok={1}  {2}" -f 'P0044', $ok, $nm
    }
}

# Unpack: every zip's workbook goes to <code>\EXCEL (QFS workbooks are named after their zip, because several releases share the inner file name); legacy .xls are converted.
Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($dir in Get-ChildItem $root -Directory | Where-Object { $_.Name -notlike '_*' }) {
    $x = Join-Path $dir.FullName 'EXCEL'
    foreach ($z in Get-ChildItem $dir.FullName -Filter *.zip) {
        $zip = [IO.Compression.ZipFile]::OpenRead($z.FullName)
        foreach ($e in $zip.Entries | Where-Object { $_.FullName -match '\.xlsx?$' -and $_.Name -notlike '~$*' }) {
            New-Item -ItemType Directory -Force $x | Out-Null
            $name = if ($dir.Name -eq 'P0044') { [IO.Path]::GetFileNameWithoutExtension($z.Name) + '.xlsx' } else { $e.Name }
            $dest = Join-Path $x $name; if (-not (Test-Path $dest)) { [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $dest) }
        }
        $zip.Dispose()
    }
}
& python (Join-Path $PSScriptRoot 'Xls2Xlsx.py')
