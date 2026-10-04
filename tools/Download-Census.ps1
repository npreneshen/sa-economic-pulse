# Download-Census.ps1 - one-off fetch of the Non-Financial Census of Municipalities (P9115) provincial time series into ../source-data/P9115/.
# Link pattern (verified 2026-10-03 from the publication pages of 2020-2023): /publications/P9115/<prefix>Time series 2006-<edition>_ by province_final.xlsx
# where the prefix was 'NFCM_P9115_' for the 2020-2022 editions and 'P9115__' for 2023 (the updater tries both). Editions are annual (2004 to 2023 all published); the 2025 edition is scheduled for 31 March 2027.
param([string[]]$Names = @('P9115__Time series 2006-2023_ by province_final.xlsx'))
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "EdgeDownload.ps1")
$dir = Join-Path (Join-Path (Split-Path -Parent $PSScriptRoot) "source-data") "P9115"; New-Item -ItemType Directory -Force $dir | Out-Null
foreach ($name in $Names) {
    $dest = Join-Path $dir $name
    if (Test-Path $dest) { "{0,-60} exists" -f $name; continue }
    $url = "https://www.statssa.gov.za/publications/P9115/" + ($name -replace ' ', '%20')
    $ok = Invoke-BrowserDownload -url $url -destPath $dest -timeoutSec 90
    $len = if (Test-Path $dest) { (Get-Item $dest).Length } else { 0 }
    $hd = if ($len -gt 4) { [IO.File]::ReadAllBytes($dest)[0..1] } else { @(0, 0) }
    if ($len -gt 0 -and ($hd[0] -ne 0x50 -or $hd[1] -ne 0x4B)) { Remove-Item $dest -Force; "{0,-60} NOT A WORKBOOK (bot-check page?)" -f $name; continue }
    "{0,-60} ok={1} bytes={2}" -f $name, $ok, $len
}
