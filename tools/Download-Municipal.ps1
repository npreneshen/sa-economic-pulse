# Download-Municipal.ps1 - one-off fetch of the municipal finance quarterly workbooks (P9110.1) into ../source-data/P9110.1/.
# Same minimised-Edge-window technique as the updater (Imperva blocks scripted requests). Files that already exist are skipped.
# Link pattern (verified 2026-10-03 by range requests): https://www.statssa.gov.za/publications/P91101/P9110.1 <Month> <Year> Unit Data.xlsx,
# one file per quarter, unbroken from September 2024 to June 2026 (the file for quarter-end month M of year Y appears at the end of the following quarter).
param([string[]]$Quarters = @('September 2024', 'December 2024', 'March 2025', 'June 2025', 'September 2025', 'December 2025', 'March 2026', 'June 2026'))
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "EdgeDownload.ps1")
$dir = Join-Path (Join-Path (Split-Path -Parent $PSScriptRoot) "source-data") "P9110.1"; New-Item -ItemType Directory -Force $dir | Out-Null
foreach ($q in $Quarters) {
    $name = "P9110.1 $q Unit Data.xlsx"; $dest = Join-Path $dir $name
    if (Test-Path $dest) { "{0,-40} exists" -f $name; continue }
    $url = "https://www.statssa.gov.za/publications/P91101/" + ($name -replace ' ', '%20')
    $ok = Invoke-BrowserDownload -url $url -destPath $dest -timeoutSec 90
    $len = if (Test-Path $dest) { (Get-Item $dest).Length } else { 0 }
    $hd = if ($len -gt 4) { [IO.File]::ReadAllBytes($dest)[0..1] } else { @(0, 0) }
    if ($len -gt 0 -and ($hd[0] -ne 0x50 -or $hd[1] -ne 0x4B)) { Remove-Item $dest -Force; "{0,-40} NOT A WORKBOOK (bot-check page?)" -f $name; continue }
    "{0,-40} ok={1} bytes={2}" -f $name, $ok, $len
}
