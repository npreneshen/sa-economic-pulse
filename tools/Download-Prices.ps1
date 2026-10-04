# Download-Prices.ps1 - one-off fetch of the current CPI / PPI zips into source-data (same Edge-window method as the other publications)
$ErrorActionPreference="Stop"
. (Join-Path $PSScriptRoot "EdgeDownload.ps1")
$root = Join-Path (Split-Path -Parent $PSScriptRoot) "source-data"
$base = "https://www.statssa.gov.za/timeseriesdata/Excel/"
$files = [ordered]@{
 "P0141"   = @("P0141 - CPI(COICOP) from Jan 2008 (202608).zip","P0141 - CPI(5 and 8 digit) from Jan 2017 (202608).zip","P0141 - CPI Average Prices All urban (202608).zip","P0141 - CPI Average Prices Provinces (202608).zip")
 "P0142.1" = @("P0142.1 PPI New series from 2013(202608).zip","P0142.1 PPI Historicals Elementary Indices (202608).zip")
}
foreach ($k in $files.Keys) { foreach ($f in $files[$k]) {
  $dest = Join-Path (Join-Path $root $k) $f
  if (Test-Path $dest) { "skip $f"; continue }
  $ok = Invoke-BrowserDownload -url ($base + ($f -replace ' ','%20')) -destPath $dest -timeoutSec 120
  "{0,-9} ok={1} bytes={2}  {3}" -f $k,$ok,$(if(Test-Path $dest){(Get-Item $dest).Length}else{0}),$f
}}
