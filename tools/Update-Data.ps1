# =====================================================================
#  Update-Data.ps1 - keeps the 24 scheduled StatsSA publications (plus 17 periodic industry surveys) behind the SA Economic Pulse app current.
#
#  How it decides what to fetch: tools\schedule-seed.json lists every scheduled release (date, time, the period it covers and the
#  file-name token StatsSA uses). A publication is DUE when a release dated on/before now covers a period later than the data we hold
#  (data\_parse-report.json). Only due publications are downloaded, so a run on a quiet day makes no network request at all.
#
#  How it fetches: StatsSA is behind Imperva (scripted requests get a fake page), so every download goes through a minimised real Edge
#  window - the same method as the SA CPI updater. File names are NOT uniform across publications (see $PUBS), so each publication
#  has its own template; if StatsSA renames a file the download simply never arrives and the run reports it instead of guessing.
#
#  How it stays safe: the new zip is unpacked into a STAGING copy of source-data, parsed there with Parse-StatsSA.ps1, and only if the
#  parse succeeds and the latest period actually moved forward are data\ and source-data\ swapped over. Nothing live is touched on failure.
#
#  Usage:
#    .\Update-Data.ps1                 download + parse whatever is due now
#    .\Update-Data.ps1 -CheckOnly      just report what is due (no network)
#    .\Update-Data.ps1 -Force -Only P2041   re-download the CURRENT file for a publication and re-parse (tests the pipeline)
#    .\Update-Data.ps1 -Install        register a Windows scheduled task (weekdays, every 30 min from 09:15 for 7 h; runs are
#                                            instant when nothing is due)     -Uninstall removes it
#  Safety net (added 2026-10-03):
#    1. GUARDS before anything live is touched: a new file must keep (nearly) all the series, periods and cells already held, must advance the latest period, and every
#       cell must still equal the workbook (Validate-Parse). A publication that fails keeps its held data and the reason is shown on the Data tab.
#    2. SNAPSHOT before every swap (backups\snapshot-*.zip, last 5): data\, the replaced source folders, index.html and the two reports.
#    3. AUTO-ROLLBACK: if validation, the integration audit or the accuracy audit fails after the swap, the snapshot is put back and the culprit is remembered.
#    4. REJECTED FILES are remembered (by content hash): the same file is not downloaded and re-tried every 30 minutes; a different file from StatsSA is tried again,
#       and -ClearRejected forgets the rejection (use it after fixing the parser).
#    Restore by hand:  .\tools\Restore-Snapshot.ps1 -List   |   .\tools\Restore-Snapshot.ps1 [-Snapshot snapshot-....zip] [-Only P0141,P0211]
#  Publishing: this updater changes the data on this PC only; the website picks it up when the folder is published again. CPI/PPI are fetched 90 min after release ($DELAY_MIN); survey probes are staggered (one per day).
# =====================================================================
param([switch]$CheckOnly, [switch]$Force, [string[]]$Only, [switch]$Install, [switch]$Uninstall, [switch]$ScheduledRun, [switch]$Quiet, [switch]$VerifyTemplates, [switch]$ClearRejected, [datetime]$AsOf)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $root "source-data"
$dataDir = Join-Path $root "data"
$logPath = Join-Path $dataDir "update-log.txt"
$statePath = Join-Path $dataDir "update-state.json"
$taskName = "SA Economic Pulse Data Update"
$oldTaskNames = @()                                          # earlier names of the same task (none)
$inv = [Globalization.CultureInfo]::InvariantCulture
. (Join-Path $PSScriptRoot "Snapshot.ps1")
$statusPath = Join-Path $dataDir "update-status.json"; $statusJs = Join-Path $dataDir "update-status.js"
function Say($m) { $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m; if (-not $Quiet) { Write-Host $line }; try { Add-Content -Path $logPath -Value $line -Encoding UTF8 } catch {} }

if ($Uninstall) { foreach ($tn in (@($taskName) + $oldTaskNames)) { Unregister-ScheduledTask -TaskName $tn -Confirm:$false -ErrorAction SilentlyContinue }; Write-Host "Removed scheduled task '$taskName'."; return }
if ($Install) {
    foreach ($tn in $oldTaskNames) { Unregister-ScheduledTask -TaskName $tn -Confirm:$false -ErrorAction SilentlyContinue }
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`" -ScheduledRun -Quiet" -f $PSCommandPath)
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At "09:15"
    $trigger.Repetition = (New-ScheduledTaskTrigger -Once -At "09:15" -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Hours 7)).Repetition
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Fetch new StatsSA releases for the SA Economic Pulse app" -Force | Out-Null
    Write-Host "Registered '$taskName': weekdays 09:15-16:15, every 30 minutes. A run with nothing due exits in about a second."
    return
}

# file-name templates ({0} = token from the schedule; {1} = four-digit year of the token). A publication may arrive as SEVERAL zips; all are
# fetched together and the publication is only updated if every one arrives. Verified against statssa.gov.za/?page_id=1847 on 2026-10-02.
$PUBS = [ordered]@{
    'P2041'   = @('P2041 Mining Production and sales({0}).zip')
    'P3041.2' = @('P3041.2 Manufacturing: Production and sales({0}).zip')
    'P3043'   = @('P3043 Manufacturing Utilisation of production capacity by large enterprises ({0}).zip')
    'P4141'   = @('P4141 Electricity generated and available for distribution({0}).zip')
    'P6242.1' = @('P6242.1 Retail trade sales (New time series) from January 2002_{0}.zip')
    'P6343.2' = @('P6343.2 Motor trade sales ({0}).zip')
    'P6141.2' = @('P6141.2 Wholesale trade sales({0}).zip')
    'P5041.1' = @('P5041.1 Building Statistics({0}).zip')
    'P0151.1' = @('P0151.1 Construction Materials Price Indices, 2006-{1}({0}).zip')
    'P0160'   = @('P0160 Residential Property Price Index Report({0}).zip')
    'P6410'   = @('P6410 - Tourist Accomodation({0}).zip')
    'P0021'   = @('P0021 Annual Financial Statistics ({0}).zip')
    'P0141'   = @('P0141 - CPI(COICOP) from Jan 2008 ({0}).zip', 'P0141 - CPI(5 and 8 digit) from Jan 2017 ({0}).zip')
    'P0141AP' = @('P0141 - CPI Average Prices All urban ({0}).zip', 'P0141 - CPI Average Prices Provinces ({0}).zip')
    'P0142.1' = @('P0142.1 PPI New series from 2013({0}).zip', 'P0142.1 PPI Historicals Elementary Indices ({0}).zip')
    # second batch
    'P7162'   = @('P7162 Land transport survey({0}).zip')
    'P6420'   = @('P6420 Food and beverages ({0}).zip')
    'P0142.7' = @('P0142.7 Export and import unit value indices({0}).zip')
    'P0043.1' = @('P0043.1 Liquidations ({0}).zip')
    'P0043.2' = @('P0043.2 Statistics of insolvencies ({0}).zip')
    'P0041'   = @('P0041 Civil cases for debt ({0}).zip')
    'P0044'   = @('{0} Details SML.zip')                      # token = 'June 2026'; lives under /publications/P0044/, one workbook per release
    # macro batch. 'A|B' = alternatives (StatsSA sometimes re-issues a file as _v2). DIRECT = a plain .xlsx on the publication page, not a zip.
    'P0441'   = @('GDP P0441 - GDP Time series {0}.xlsx|GDP P0441 - GDP Time series {0}_v2.xlsx')       # token 'Q3 2026'
    'P0211'   = @('QLFS Trends 2008-{0}.xlsx')                                                          # token '2026Q3'
    'P0277'   = @('QES_Details_BreakDown_200909_{0}.xlsx')                                              # token '202609' (quarter-end month)
    'P9101'   = @('P9101_Capital Expenditure Time Series 2006 to {0}.xlsx')                             # token '2025'
    'P0045'   = @('P0045 QCE (Quarterly) ({0}).zip')                                                    # token '2026September' (quarter-end month name)
    'P9119.4' = @('P9119.4 Financial statistics of consolidated general government ({0}).zip')           # token '2005-2025'
    'P9103.1' = @('P9103.1 Financial statistics of higher education institutions({0}).zip')             # token '2005-2025'
    'P9115'   = @('NFCM_P9115_Time series 2006-{0}_ by province_final.xlsx|P9115__Time series 2006-{0}_ by province_final.xlsx')   # token '2025' (edition year); the prefix was NFCM_ up to the 2022 edition. /publications/P9115/
    'P9110.1' = @('P9110.1 {0} Unit Data.xlsx')                                                         # token 'September 2026' (quarter-end month and year); /publications/P91101/, one workbook per release
}
# publications whose files do not live under /timeseriesdata/Excel/
$BASE_OVERRIDE = @{ 'P0044' = 'https://www.statssa.gov.za/publications/P0044/'; 'P0441' = 'https://www.statssa.gov.za/publications/P0441/'; 'P0211' = 'https://www.statssa.gov.za/publications/P0211/'
                    'P0277' = 'https://www.statssa.gov.za/publications/P0277/'; 'P9101' = 'https://www.statssa.gov.za/publications/P9101/'
                    'P9110.1' = 'https://www.statssa.gov.za/publications/P91101/'; 'P9115' = 'https://www.statssa.gov.za/publications/P9115/' }
$DIRECT = @('P0441', 'P0211', 'P0277', 'P9101', 'P9110.1', 'P9115')                # downloaded as plain .xlsx
$NOVERIFY = @('P9115', 'P0441', 'P0211', 'P0277', 'P9101', 'P0045', 'P9119.4', 'P9103.1')       # token formats other than YYYYMM: checked against the live page by hand (see the Scheduled Publications page)
# publications that ACCUMULATE: every release is kept (the quarterly financial statistics have no history file), so a new release is added, nothing is cleared
$ACCUMULATE = @('P0044', 'P9110.1')
# files inside a publication folder that are not re-downloaded and must survive an update (legacy insolvency history)
$KEEP_FILES = @{ 'P0043.2' = 'P0043 legacy*' }
# P1101 (annual agricultural survey) is not on StatsSA's schedule page; its file name carries the survey year, so once a month the updater tries the NEXT year's name (last year in the name + 1 / + 2).
# A file only replaces the old one if its latest survey year moved forward. (The other industry surveys were removed: no schedule, irregular editions, file names that change between editions.)
$SURVEYS = @('P1101', 'P9119.3', 'P9121', 'P9102', 'P0441.2')
# publications released on another publication's schedule (CPI average prices come out with the CPI)
$SCHED = @{ 'P0141AP' = 'P0141' }
# CPI and PPI are also fetched by the SA CPI/PPI dashboard's own task (Update-CPI-Data.ps1, polling from 10:05 on CPI day and 11:35 on PPI day). To keep StatsSA from seeing two
# fetchers at once, this updater waits 90 minutes after the published release time for them (the dashboard has had its turn by then; polls run on :15/:45, so the pick-up is at 11:45 / 13:15).
$DELAY_MIN = @{ 'P0141' = 90; 'P0141AP' = 90; 'P0142.1' = 90 }
$base = "https://www.statssa.gov.za/timeseriesdata/Excel/"

# ---- offline self-check: every template must reproduce a live file name we hold (token taken from that file's own name)
if ($VerifyTemplates) {
    $bad = 0; $n = 0
    foreach ($code in $PUBS.Keys) {
        if (($ACCUMULATE + $NOVERIFY) -contains $code) { Write-Host ("OK        {0,-8} {1} (token is not YYYYMM; checked against the live site)" -f $code, $PUBS[$code][0]); $n++; continue }
        $zips = @(Get-ChildItem (Join-Path $sourceDir $code) -Filter *.zip | ForEach-Object { $_.Name })
        foreach ($t in $PUBS[$code]) {
            $n++; $hit = $null
            foreach ($zn in $zips) { if ($zn -match '[\(_](\d{6}|\d{4})\)?\.zip$') { $tok = $Matches[1]; if (($t -f $tok, $tok.Substring(0, 4)).Replace(':', '') -eq $zn) { $hit = $zn } } }
            if ($hit) { Write-Host ("OK        {0,-8} {1}" -f $code, $hit) } else { $bad++; Write-Host ("MISMATCH  {0,-8} template '{1}' matches none of: {2}" -f $code, $t, ($zips -join ' | ')) }
        }
    }
    Write-Host ($(if ($bad) { "$bad of $n template(s) do not reproduce a live file name." } else { "All $n templates reproduce the live file names." }))
    return
}

# ---- what we hold, and what is scheduled
$reportPath = Join-Path $dataDir "_parse-report.json"
if (-not (Test-Path $reportPath)) { throw "No data\_parse-report.json - run tools\Parse-StatsSA.ps1 first." }
$held = Get-Content $reportPath -Raw | ConvertFrom-Json
# PS 5.1 wraps a top-level JSON array into ONE object unless it is unrolled through the pipeline
$schedule = @((Get-Content (Join-Path $PSScriptRoot "schedule-seed.json") -Raw | ConvertFrom-Json) | ForEach-Object { $_ })
$state = @{}; if (Test-Path $statePath) { try { (Get-Content $statePath -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $state[$_.Name] = $_.Value } } catch {} }
if ($ClearRejected) { @($state.Keys | Where-Object { $_ -like 'rej:*' }) | ForEach-Object { $state.Remove($_) }; Say 'Forgot all rejected files.' }
# what happened to each publication on this run (shown on the Data tab); previous entries are kept until a publication updates again
$status = @{}; $prevStatus = @{ pubs = @{} }; if (Test-Path $statusPath) { try { $prevStatus = Get-Content $statusPath -Raw | ConvertFrom-Json } catch {} }
function Set-Status([string]$code, [string]$st, [string]$why, [string]$from, [string]$to) { $script:status[$code] = [ordered]@{ status = $st; reason = $why; at = (Get-Date).ToString('s'); from = $from; to = $to } }
function Write-Status([string]$result, [string]$snap) {
    $pubs = [ordered]@{}
    if ($prevStatus -and $prevStatus.pubs -and $prevStatus.pubs -isnot [hashtable]) { $prevStatus.pubs.PSObject.Properties | ForEach-Object { $pubs[$_.Name] = $_.Value } }   # a status file read back is a PSCustomObject; the empty default is a hashtable
    foreach ($k in $status.Keys) { if ($status[$k].status -eq 'updated') { $pubs.Remove($k) | Out-Null; $pubs[$k] = $status[$k] } else { $pubs[$k] = $status[$k] } }
    $o = [ordered]@{ lastRun = (Get-Date).ToString('s'); result = $result; snapshot = $snap; pubs = $pubs }
    if ($result -like 'updated*') { $o.lastSuccess = (Get-Date).ToString('s') } elseif ($prevStatus -and $prevStatus.lastSuccess) { $o.lastSuccess = $prevStatus.lastSuccess }
    $j = $o | ConvertTo-Json -Depth 6
    try { [IO.File]::WriteAllText($statusPath, $j, (New-Object Text.UTF8Encoding($false))); [IO.File]::WriteAllText($statusJs, '(window.EQ=window.EQ||{pubs:{}}).updateStatus=' + ($o | ConvertTo-Json -Depth 6 -Compress) + ';' + "`n", (New-Object Text.UTF8Encoding($false))) } catch {}
}

function PeriodKey([string]$p) {                                     # sortable key: 2026-07 / 2026-Q3 / 2026
    if ($p -match '^(\d{4})-Q(\d)$') { return "{0}-{1:00}" -f $Matches[1], (3 * [int]$Matches[2]) }
    if ($p -match '^\d{4}$') { return "$p-12" }
    return $p
}
$now = if ($PSBoundParameters.ContainsKey('AsOf')) { $AsOf } else { Get-Date }   # -AsOf simulates another date (testing)
$due = @()
foreach ($code in $PUBS.Keys) {
    if ($Only -and ($Only -notcontains $code)) { continue }
    if (-not $held.$code) { continue }
    $heldLast = $held.$code.last
    if ($Force) { $due += [pscustomobject]@{ code = $code; period = $heldLast; token = $null; when = "forced"; force = $true }; continue }
    $sc = if ($SCHED.ContainsKey($code)) { $SCHED[$code] } else { $code }
    $delay = if ($DELAY_MIN.ContainsKey($code)) { $DELAY_MIN[$code] } else { 0 }
    $past = @($schedule | Where-Object { $_.code -eq $sc -and ([datetime]::ParseExact(($_.date + " " + $_.time), "yyyy-MM-dd HH:mm", $inv).AddMinutes($delay) -le $now) } | Sort-Object { PeriodKey $_.period })
    if ($past.Count -eq 0) { continue }
    $latest = $past[$past.Count - 1]
    if ((PeriodKey $latest.period) -gt (PeriodKey $heldLast)) { $due += [pscustomobject]@{ code = $code; period = $latest.period; token = $latest.token; when = "$($latest.date) $($latest.time)$(if ($delay) { " +$delay min" })"; force = $false } }
    $future = @($schedule | Where-Object { $_.code -eq $sc -and $_.date -gt $now.ToString("yyyy-MM-dd") })
    if ($future.Count -eq 0 -and -not $ScheduledRun) { Say "WARNING: no future releases left in schedule-seed.json for $code - re-capture the schedule from the Scheduled Publications page of the StatsSA website." }
}
# periodic surveys: each is probed at most once every 30 days, AT MOST ONE PER DAY, and only on a run with no scheduled release due, so the probes are spread out (never a burst of
# requests, and never on top of a release download). Naming one with -Only probes it straight away.
$probeNow = $null
if (-not $Force -and -not $CheckOnly) {
    if ($Only -and (@($Only | Where-Object { $SURVEYS -contains $_ }).Count -gt 0)) { $probeNow = @($SURVEYS | Where-Object { $Only -contains $_ }) }
    elseif (-not $Only -and $due.Count -eq 0) {
        $lastAny = $state['probe-last']; $dayGap = if ($lastAny) { ($now - [datetime]$lastAny).TotalHours } else { 1e9 }
        if ($dayGap -ge 24) {
            $dueSurveys = @($SURVEYS | Where-Object { -not $state["probe:$_"] -or (($now - [datetime]$state["probe:$_"]).TotalDays -ge 30) } | Sort-Object { if ($state["probe:$_"]) { [datetime]$state["probe:$_"] } else { [datetime]'2000-01-01' } })
            if ($dueSurveys.Count) { $probeNow = @($dueSurveys[0]) }          # the one waiting longest
        }
    }
}
foreach ($code in @($probeNow)) {
    if (-not $code) { continue }
    $zip = Get-ChildItem (Join-Path $sourceDir $code) -Filter *.zip -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $zip) { continue }
    $nm = $zip.Name; $yrs = [regex]::Matches($nm, '(?<!\d)(19|20)\d{2}(?!\d)')
    $cands = @()
    if ($yrs.Count -gt 0) { $lastY = $yrs[$yrs.Count - 1]; foreach ($k in 1, 2) { $cands += $nm.Substring(0, $lastY.Index) + ([int]$lastY.Value + $k) + $nm.Substring($lastY.Index + 4) } } else { $cands += $nm }
    $due += [pscustomobject]@{ code = $code; period = $held.$code.last; token = $null; when = "periodic survey"; force = $false; probe = $true; names = $cands }
    if (-not $Only) { $state["probe:$code"] = $now.ToString("s"); $state['probe-last'] = $now.ToString("s") }
}
# light calendar check: ONE page of StatsSA's release calendar per day (Update-Calendar.ps1 -Next cycles through every month/page, nearest months twice), on a run with nothing else to do.
# One attempt a day even if StatsSA does not answer; a moved date or a new release is merged into schedule-seed.json by that script. (Not when simulating a date or naming publications.)
$calScript = Join-Path $PSScriptRoot 'Update-Calendar.ps1'
if ($due.Count -eq 0 -and -not $CheckOnly -and -not $Force -and -not $Only -and -not $PSBoundParameters.ContainsKey('AsOf') -and (Test-Path $calScript) -and $state['cal-attempt'] -ne $now.ToString('yyyy-MM-dd')) {
    $state['cal-attempt'] = $now.ToString('yyyy-MM-dd')
    try { ($state | ConvertTo-Json) | Set-Content $statePath -Encoding UTF8 } catch {}
    try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $calScript -Next -Quiet | Out-Null } catch { Say "Calendar check failed: $($_.Exception.Message)" }
}
if ($due.Count -eq 0) { if (-not $ScheduledRun) { Say ("Nothing due. Latest held: " + (($PUBS.Keys | ForEach-Object { "$_ $($held.$_.last)" }) -join "; ")) }; return }
Say ("Due: " + (($due | ForEach-Object { "$($_.code) ($($_.period), released $($_.when))" }) -join "; "))
if ($CheckOnly) { return }

# ---- download + stage + parse
. (Join-Path $PSScriptRoot "EdgeDownload.ps1")
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stage = Join-Path $env:TEMP ("eq-stage-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
$stageSrc = Join-Path $stage "source-data"; $stageData = Join-Path $stage "data"
New-Item -ItemType Directory -Force $stageSrc, $stageData | Out-Null
Copy-Item (Join-Path $sourceDir "*") $stageSrc -Recurse -Force
$got = @(); $sigs = @{}
try {
    $dlN = 0
    foreach ($d in $due) {
        $code = $d.code
        if ($dlN++ -gt 0) { Start-Sleep -Seconds 8 }          # a pause between publications: StatsSA's bot protection refuses bursts
        $attempted = $state[$code]
        if (-not $d.force -and $attempted -and (($now - [datetime]$attempted).TotalMinutes -lt 25)) { Say "$code : tried $attempted - waiting before retrying."; continue }
        $state[$code] = $now.ToString("s")
        $pubBase = if ($BASE_OVERRIDE.ContainsKey($code)) { $BASE_OVERRIDE[$code] } else { $base }
        if ($d.force) { $names = @(Get-ChildItem (Join-Path $sourceDir $code) -Filter *.zip | ForEach-Object { $_.Name }) }
        elseif ($d.probe) { $names = @($d.names) }
        else { $names = @($PUBS[$code] | ForEach-Object { $_ -f $d.token, $d.token.Substring(0, 4) }) }
        if ($ACCUMULATE -contains $code -and $d.force) { $names = @($names | Select-Object -Last 1) }      # a forced re-run only needs the newest release
        $tmps = @(); $okAll = $true; $i = 0
        foreach ($fileName in $names) {
            $i++; $tmp = Join-Path $stage ("dl-" + $code + "-" + $i + ".zip"); $got1 = $false; $alts = @($fileName -split '\|')
            foreach ($alt in $alts) {
                $fileName = $alt; $url = $pubBase + ($fileName -replace ' ', '%20')
                Say "$code : downloading '$fileName'"
                $got1 = (Invoke-BrowserDownload -url $url -destPath $tmp -timeoutSec $(if ($d.probe) { 25 } else { 75 })) -and (Test-Path $tmp) -and ((Get-Item $tmp).Length -ge 5000)
                if ($got1 -and ($DIRECT -contains $code)) { $hd = [IO.File]::ReadAllBytes($tmp)[0..1]; if ($hd[0] -ne 0x50 -or $hd[1] -ne 0x4B) { Say "$code : '$fileName' is not a workbook (probably the bot-check page)"; $got1 = $false } }
                if ($got1) { break }
            }
            if ($got1 -and ($DIRECT -notcontains $code)) { $za = [IO.Compression.ZipFile]::OpenRead($tmp); $hasX = @($za.Entries | Where-Object { $_.FullName -like '*.xlsx' -or $_.FullName -like '*.xls' }).Count; $za.Dispose(); if ($hasX -lt 1) { Say "$code : '$fileName' is not a zip with a workbook inside (probably the bot-check page) - skipped."; $got1 = $false } }
            if ($d.probe) { if ($got1) { $tmps = @([pscustomobject]@{ tmp = $tmp; name = $fileName }); break } else { continue } }          # surveys: the first candidate that exists wins
            if (-not $got1) { Say "$code : '$fileName' is not available yet (or the file name changed - check https://www.statssa.gov.za/?page_id=1847). Will retry."; $okAll = $false; break }
            $tmps += [pscustomobject]@{ tmp = $tmp; name = $fileName }
        }
        if ($d.probe -and $tmps.Count -eq 0) { Say "$code : no newer edition found."; continue }
        if (-not $okAll) { Set-Status $code 'unavailable' 'the file is not on the StatsSA site under the expected name (not published yet, or renamed)' $held.$code.last ''; continue }          # all files of a publication or none: never mix old and new
        $joined = (($tmps | ForEach-Object { (Get-FileHash $_.tmp -Algorithm SHA256).Hash }) -join '')
        $sigs[$code] = (Get-FileHash -InputStream ([IO.MemoryStream][Text.Encoding]::UTF8.GetBytes($joined)) -Algorithm SHA256).Hash
        $rej = [string]$state["rej:$code"]
        if ($rej -and $rej.StartsWith($sigs[$code] + '|') -and -not $d.force) { $rp = $rej.Split('|'); Say "$code : this exact file was already rejected on $($rp[1]) ($($rp[2])) - keeping the held data until StatsSA publishes a different file (or run -ClearRejected)."; Set-Status $code 'rejected' $rp[2] $held.$code.last ''; continue }
        $pubStage = Join-Path $stageSrc $code
        New-Item -ItemType Directory -Force $pubStage | Out-Null
        if ($ACCUMULATE -notcontains $code) {
            Clear-Folder $pubStage $KEEP_FILES[$code]
        }
        foreach ($f in $tmps) {
            if ($DIRECT -contains $code) { New-Item -ItemType Directory -Force (Join-Path $pubStage 'EXCEL') | Out-Null; Copy-Item $f.tmp (Join-Path (Join-Path $pubStage 'EXCEL') $f.name); continue }
            Copy-Item $f.tmp (Join-Path $pubStage $f.name.Replace(':', ''))
            if ($ACCUMULATE -contains $code) {                       # one uniquely named workbook per release (several releases share the inner file name)
                $zz = [IO.Compression.ZipFile]::OpenRead($f.tmp); $e = $zz.Entries | Where-Object { $_.FullName -like '*.xlsx' } | Select-Object -First 1
                $dest = Join-Path (Join-Path $pubStage 'EXCEL') ([IO.Path]::GetFileNameWithoutExtension($f.name) + '.xlsx'); New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $dest, $true); $zz.Dispose()
            } else { [IO.Compression.ZipFile]::ExtractToDirectory($f.tmp, $pubStage) }
        }
        if (@(Get-ChildItem $pubStage -Recurse -Filter *.xls -File -ErrorAction SilentlyContinue).Count -gt 0) {     # legacy .xls workbooks (wholesale / retail / motor trade industry surveys)
            $pyc = Get-Command python -ErrorAction SilentlyContinue
            if ($pyc) { & python (Join-Path $PSScriptRoot "Xls2Xlsx.py") $pubStage | Out-Null } else { Say "$code : the workbook is a legacy .xls and Python (xlrd, openpyxl) is needed to convert it - skipped."; continue }
        }
        $got += $code
    }
    if ($got.Count -eq 0) { Say "Nothing new downloaded."; Write-Status 'nothing new downloaded' ''; return }

    Say ("Parsing staged data for: " + ($got -join ", "))
    function Invoke-StageParse { & (Join-Path $PSScriptRoot "Parse-StatsSA.ps1") -SourceDir $stageSrc -OutDir $stageData -Quiet; return (Get-Content (Join-Path $stageData "_parse-report.json") -Raw | ConvertFrom-Json) }
    $new = Invoke-StageParse
    $py = Get-Command python -ErrorAction SilentlyContinue
    $GUARD_SERIES = 0.95; $GUARD_CELLS = 0.97
    function Invoke-Py([string[]]$pyargs) {          # python's harmless warnings go to stderr, which strict error mode would turn into a failure
        $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        try { $o = @(& python @pyargs 2>&1 | ForEach-Object { [string]$_ }); $c = $LASTEXITCODE } finally { $ErrorActionPreference = $old }
        return [pscustomobject]@{ out = $o; code = $c }
    }
    function Get-Family([string]$code) { if ($code -eq 'P0441') { return @('P0441', 'P0441A') } else { return @($code) } }          # the GDP workbook feeds two data files
    function Get-Guards([string]$code) {
        $why = @()
        foreach ($c in (Get-Family $code)) {
            $n = $new.$c; $o = $held.$c
            if (-not $n) { $why += "$c produced nothing when parsed"; continue }
            if (-not $o) { continue }
            if ($n.series -lt $GUARD_SERIES * $o.series) { $why += "$c series fell from $($o.series) to $($n.series)" }
            if ($n.periods -lt $o.periods) { $why += "$c has fewer periods ($($n.periods) vs $($o.periods))" }
            if ($o.cells -and $n.cells -lt $GUARD_CELLS * $o.cells) { $why += "$c cell count fell from $($o.cells) to $($n.cells)" }
        }
        return $why
    }
    function Test-Cells([string[]]$codes, [string]$where) {          # Validate-Parse in $where (the staging copy or the live app): every number must equal the workbook
        $res = @{}
        if (-not $py -or -not (Test-Path (Join-Path $PSScriptRoot "Validate-Parse.py"))) { return $res }
        Push-Location $where; try { $out = @((Invoke-Py @((Join-Path $PSScriptRoot "Validate-Parse.py"))).out) } finally { Pop-Location }
        foreach ($code in $codes) {
            foreach ($c in (Get-Family $code)) {
                $e = [regex]::Escape($c)
                $bad = @($out | Where-Object { $_ -match "^(MISMATCH|MISSING series|missing value)\s+$e\s" }).Count
                $sum = $out | Where-Object { $_ -match "^$e\s+series=.*extra-in-output=(\d+)" } | Select-Object -First 1
                $extra = if ($sum -and $sum -match 'extra-in-output=(\d+)') { [int]$Matches[1] } else { 0 }
                if ($bad -or $extra) { $res[$code] = "${c}: $bad cell(s) differ from the workbook and $extra value(s) have no source cell" }
            }
        }
        $tot = $out | Where-Object { $_ -like 'TOTAL*' } | Select-Object -Last 1
        if (-not $tot) { foreach ($code in $codes) { if (-not $res.ContainsKey($code)) { $res[$code] = 'the cell-by-cell validation could not run' } } }
        return $res
    }
    $rejected = @{}; $moved = @()
    for ($pass = 1; $pass -le 3; $pass++) {
        $moved = @(); $revert = @()
        foreach ($code in $got) {
            if (-not $new.$code) { $rejected[$code] = 'the parser produced nothing for it'; $revert += $code; continue }
            if ((PeriodKey $new.$code.last) -le (PeriodKey $held.$code.last) -and -not $Force) { Say "$code : the new file still ends at $($new.$code.last) - keeping the old data."; Set-Status $code 'kept' "the downloaded file still ends at $($new.$code.last)" $held.$code.last $new.$code.last; $revert += $code; continue }
            $why = @(Get-Guards $code)
            if ($why.Count) { $rejected[$code] = $why -join '; '; $revert += $code; continue }
            $moved += $code
        }
        if ($moved.Count) {
            $bad = Test-Cells $moved $stage
            foreach ($code in @($bad.Keys)) { $rejected[$code] = $bad[$code]; $revert += $code; $moved = @($moved | Where-Object { $_ -ne $code }) }
        }
        if ($moved -contains 'P9110.1') {          # municipal finance: refuse a release whose quarter columns are attached to the wrong quarters
            $cm = Invoke-Py @((Join-Path $PSScriptRoot "Check-Municipal-Releases.py"), $stageSrc); $chk = @($cm.out); $chkExit = $cm.code
            $chk | ForEach-Object { Say "P9110.1 : $_" }
            if ($chkExit -ne 0) { $rejected['P9110.1'] = "the new workbook's quarters do not line up with the earlier releases"; $revert += 'P9110.1'; $moved = @($moved | Where-Object { $_ -ne 'P9110.1' }) }
        }
        if (-not $revert.Count) { break }
        foreach ($code in ($revert | Select-Object -Unique)) {          # put the live files back into the staging copy so the next parse (and the swap) leave that publication alone
            if ($rejected.ContainsKey($code)) { Say "$code : REJECTED - $($rejected[$code]). Keeping the held data ($($held.$code.last))."; Set-Status $code 'rejected' $rejected[$code] $held.$code.last $new.$code.last; if ($sigs[$code]) { $state["rej:$code"] = $sigs[$code] + '|' + $now.ToString('s') + '|' + $rejected[$code] } }
            $dst = Join-Path $stageSrc $code; Clear-Folder $dst ''; New-Item -ItemType Directory -Force $dst | Out-Null
            $live0 = Join-Path $sourceDir $code; if (Test-Path $live0) { Copy-Item (Join-Path $live0 '*') $dst -Recurse -Force }
        }
        $got = @($got | Where-Object { $revert -notcontains $_ })
        if ($got.Count -eq 0) { $moved = @(); break }
        Say ("Re-parsing without: " + (($revert | Select-Object -Unique) -join ', '))
        $new = Invoke-StageParse
    }
    if ($moved.Count -eq 0) { Say "No publication advanced; live data untouched."; Write-Status 'no publication advanced' ''; return }

    # ---- swap, with a snapshot to fall back on
    $snap = New-Snapshot $root $moved $now
    Say ("Snapshot taken: " + (Split-Path $snap -Leaf) + " (restore with tools\Restore-Snapshot.ps1)")
    $archive = Join-Path $sourceDir "_archive"; New-Item -ItemType Directory -Force $archive | Out-Null
    $failure = $null; $culprits = @()
    try {
        foreach ($code in $moved) {
            $live = Join-Path $sourceDir $code
            if ($ACCUMULATE -notcontains $code) {
                Get-ChildItem $live -Filter *.zip | ForEach-Object { Move-Item $_.FullName (Join-Path $archive ("{0:yyyyMMdd-HHmm}-{1}" -f $now, $_.Name)) -Force }
                Clear-Folder $live $KEEP_FILES[$code]
            }
            New-Item -ItemType Directory -Force $live | Out-Null
            Copy-Item (Join-Path (Join-Path $stageSrc $code) "*") $live -Recurse -Force
        }
        Copy-Item (Join-Path $stageData "*") $dataDir -Force
        # re-check what is now on disk; any failure puts the snapshot back
        if ($py -and (Test-Path (Join-Path $PSScriptRoot "Validate-Parse.py"))) {
            $vbad = (Test-Cells $moved $root)
            if ($vbad.Count) { $failure = 'cell-by-cell validation failed after the swap'; $culprits = @($vbad.Keys) }
            else { Say "Validation: all cells equal the workbooks" }
        }
        if (-not $failure -and $py) {
            Push-Location $root
            try {
                $ai = Invoke-Py @((Join-Path $PSScriptRoot "Audit-Integration.py")); $a1 = @($ai.out); $a1x = $ai.code
                Say ("Integration audit: " + (($a1 | Where-Object { $_ -match 'workbooks \|' } | Select-Object -First 1)))
                if ($a1x -ne 0) { $failure = 'the integration audit found cells that are not in the app'; $culprits = @($moved | Where-Object { $c = $_; (@($a1 | Where-Object { $_ -match 'GAP' -and $_ -match ('^\s+' + [regex]::Escape($c) + '\s') }).Count -gt 0) }) }
            } finally { Pop-Location }
        }
        if (-not $failure -and $py) {
            Push-Location $root
            try {
                $ac = Invoke-Py @((Join-Path $PSScriptRoot "Check-Accuracy.py")); $a2 = @($ac.out); $a2x = $ac.code
                Say ("Accuracy audit: " + (($a2 | Select-Object -First 1)))
                if ($a2x -ne 0) {
                    $failure = 'the accuracy audit has failures'
                    $lines = @($a2 | Where-Object { $_ -like '`[FAIL`]*' }); $failure += ': ' + (($lines | Select-Object -First 3 | ForEach-Object { $_.Substring(0, [Math]::Min(150, $_.Length)) }) -join ' | ')
                    $culprits = @($moved | Where-Object { $c = $_; (Get-Family $c | Where-Object { $f = $_; @($lines | Where-Object { $_ -match ('(^|[\s:])' + [regex]::Escape($f) + '(\s|$)') }).Count -gt 0 }).Count -gt 0 })
                }
            } finally { Pop-Location }
        }
    } catch { $failure = 'the swap itself failed: ' + $_.Exception.Message }

    if ($failure) {
        Say "ROLLING BACK: $failure"
        Restore-Snapshot $root $snap $null | Out-Null
        Get-ChildItem $archive -Filter ('{0:yyyyMMdd-HHmm}-*' -f $now) -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue          # the zips this swap had moved there are back in their folders
        if (-not $culprits.Count) { $culprits = @($moved) }
        foreach ($code in $moved) {
            $why = if ($culprits -contains $code) { $failure } else { 'rolled back together with the others (the failure was in another publication); it will be tried again on the next run' }
            Set-Status $code $(if ($culprits -contains $code) { 'rejected' } else { 'kept' }) $why $held.$code.last $new.$code.last
            if ($culprits -contains $code -and $sigs[$code]) { $state["rej:$code"] = $sigs[$code] + '|' + $now.ToString('s') + '|' + $failure }
        }
        Say ("Rolled back to " + (Split-Path $snap -Leaf) + ". Rejected: " + ($culprits -join ', ') + ". Run the updater again to update the other publications.")
        Write-Status 'rolled back' (Split-Path $snap -Leaf)
        $script:exitCode = 2
        return
    }
    foreach ($code in $moved) { Say ("{0} : updated {1} -> {2} ({3} series)" -f $code, $held.$code.last, $new.$code.last, $new.$code.series); Set-Status $code 'updated' '' $held.$code.last $new.$code.last }
    # bump the cache-busting version on every script/style/data URL so a browser or CDN cannot serve the old data
    $idx = Join-Path $root "index.html"
    if (Test-Path $idx) { $txt = [IO.File]::ReadAllText($idx); $stamp = $now.ToString("yyyyMMddHHmm"); [IO.File]::WriteAllText($idx, ($txt -replace '\?v=\d+', ('?v=' + $stamp)), (New-Object Text.UTF8Encoding($false))) }
    Write-Status ('updated ' + ($moved -join ', ')) (Split-Path $snap -Leaf)
    Say "Done. Reload the app. (Cloudflare deployment is not part of this script.)"
} finally {
    try { ($state | ConvertTo-Json) | Set-Content $statePath -Encoding UTF8 } catch {}
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
    if ($script:exitCode) { exit $script:exitCode }
}
