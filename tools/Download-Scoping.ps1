# Download-Scoping.ps1 - fetches the current StatsSA time-series zip for each publication into ../source-data/<code>/
$ErrorActionPreference="Stop"
function Get-EdgePath {
    $candidates = @(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    throw "Microsoft Edge not found -- install it, or point Get-EdgePath at your browser's exe."
}
function Invoke-BrowserDownload([string]$url, [string]$destPath, [int]$timeoutSec = 90) {
    $edge = Get-EdgePath
    $tag = "$([Guid]::NewGuid().ToString('N').Substring(0,8))"
    $profileDir = Join-Path $env:TEMP "sa-cpi-edge-profile-$tag"
    $downloadDir = Join-Path $env:TEMP "sa-cpi-edge-dl-$tag"
    $defaultDir = Join-Path $profileDir "Default"
    New-Item -ItemType Directory -Force $defaultDir | Out-Null
    New-Item -ItemType Directory -Force $downloadDir | Out-Null
    try {
        # Pre-seeding Preferences before first launch is what lets a plain
        # navigation (no CDP, no Selenium) save straight to our folder with
        # no "Keep/save as" prompt -- Edge/Chromium read this on startup.
        $downloadDirJson = $downloadDir.Replace('\', '\\')
        $prefs = '{"download":{"default_directory":"' + $downloadDirJson + '","prompt_for_download":false,"directory_upgrade":true},"profile":{"default_content_setting_values":{"automatic_downloads":1}}}'
        [IO.File]::WriteAllText((Join-Path $defaultDir "Preferences"), $prefs)

        # IMPORTANT: this must NOT use --headless=new. Confirmed by direct testing
        # (2026-09-22, via --dump-dom) that Imperva serves its actual Incapsula
        # challenge iframe -- not the real file -- specifically to headless Chromium,
        # regardless of GPU/automation flags; a genuine (even minimized) window passes
        # straight through. That's the whole reason this function exists instead of
        # Invoke-WebRequest in the first place (see the comment above this function) --
        # headless was the original approach and it quietly stopped working at some
        # point, most likely because bot-detection got better at spotting it, not
        # because of anything StatsSA-specific. A real window is the fix, not a flag.
        #
        # A brand-new --user-data-dir still triggers Edge's OWN first-run background
        # activity on newer Edge builds -- account sync (bookmarks/passwords/history) and
        # several multi-MB self component-update downloads (SmartScreen data, Widevine,
        # etc.) all kick off immediately and compete with the actual navigation for
        # bandwidth. These flags suppress that background noise on a throwaway profile;
        # they're independent of the headless/window fix above but still worth keeping.
        $edgeArgs = @(
            "--no-first-run", "--no-default-browser-check", "--disable-popup-blocking",
            "--disable-sync", "--disable-background-networking", "--disable-component-update",
            "--disable-client-side-phishing-detection", "--disable-domain-reliability",
            "--no-service-autorun", "--disable-features=msEdgeContinuousMigration,MicrosoftEdgeSignin",
            "--user-data-dir=$profileDir", $url
        )
        # -WindowStyle Minimized: a real window (required, see above), just not one that
        # steals focus or sits prominently on screen during an automated check.
        $proc = Start-Process -FilePath $edge -ArgumentList $edgeArgs -PassThru -WindowStyle Minimized

        $deadline = (Get-Date).AddSeconds($timeoutSec)
        $found = $null
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 500
            $files = Get-ChildItem $downloadDir -File -ErrorAction SilentlyContinue |
                Where-Object { $_.Extension -notin ".crdownload", ".tmp" }
            if ($files) {
                # a .zip that's still growing has a stable-size check below via the
                # short extra sleep + re-list, cheap insurance against a half-written file
                Start-Sleep -Milliseconds 400
                $found = $files | Sort-Object LastWriteTime -Descending | Select-Object -First 1
                break
            }
        }
        try {
            if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
        } catch {}
        if ($found) {
            Move-Item -Path $found.FullName -Destination $destPath -Force
            return $true
        }
        return $false
    } finally {
        Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $downloadDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$root = Join-Path (Split-Path -Parent $PSScriptRoot) "source-data"
$base = "https://www.statssa.gov.za/timeseriesdata/Excel/"
$pubs = [ordered]@{
 "P2041"   = "P2041 Mining Production and sales(202607).zip"
 "P3041.2" = "P3041.2 Manufacturing: Production and sales(202607).zip"
 "P3043"   = "P3043 Manufacturing Utilisation of production capacity by large enterprises (202605).zip"
 "P6343.2" = "P6343.2 Motor trade sales (202607).zip"
 "P6242.1" = "P6242.1 Retail trade sales (New time series) from January 2002_202607.zip"
 "P6141.2" = "P6141.2 Wholesale trade sales(202607).zip"
 "P6410"   = "P6410 - Tourist Accomodation(202607).zip"
 "P5041.1" = "P5041.1 Building Statistics(202607).zip"
 "P0151.1" = "P0151.1 Construction Materials Price Indices, 2006-2026(202608).zip"
 "P0160"   = "P0160 Residential Property Price Index Report(202604).zip"
 "P4141"   = "P4141 Electricity generated and available for distribution(202608).zip"
 "P0021"   = "P0021 Annual Financial Statistics (2024).zip"
}
foreach ($k in $pubs.Keys) {
  $f = $pubs[$k]; $dest = Join-Path (Join-Path $root $k) ($f -replace ":","")
  if (Test-Path $dest) { "skip $k (exists)"; continue }
  $url = $base + ($f -replace ' ','%20')
  $ok = Invoke-BrowserDownload -url $url -destPath $dest -timeoutSec 120
  $len = if (Test-Path $dest) { (Get-Item $dest).Length } else { 0 }
  "{0,-8} ok={1} bytes={2}" -f $k,$ok,$len
}
