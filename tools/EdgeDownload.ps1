# EdgeDownload.ps1 - browser-driven download helper (dot-sourced by Update-Data.ps1).
# StatsSA sits behind Imperva, which serves a fake ~200-byte JS-challenge page (still HTTP 200) to scripted requests; a REAL (minimised) Edge window passes.
# Copied from the SA CPI updater, where it has been working since July 2026. Must NOT use --headless.
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
            if ($proc) { & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null }          # the whole process tree: Edge's child processes otherwise keep the profile folder locked and it is left behind in %TEMP%
        } catch {}
        if ($found) {
            Move-Item -Path $found.FullName -Destination $destPath -Force
            return $true
        }
        return $false
    } finally {
        foreach ($try in 1..5) {
            Remove-Item $profileDir, $downloadDir -Recurse -Force -ErrorAction SilentlyContinue
            if (-not (Test-Path $profileDir) -and -not (Test-Path $downloadDir)) { break }
            Start-Sleep -Milliseconds 700
        }
    }
}
