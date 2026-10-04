# =====================================================================
#  Update-Calendar.ps1 - keeps tools\schedule-seed.json (StatsSA's release calendar) current.
#
#  Source: https://www.statssa.gov.za/?page_id=1874 (Scheduled Publications). The page offers one list per month (10 rows per page, ~3 pages a month) and the
#  months StatsSA has published so far (currently about 9 months ahead). The list is loaded by a small POST the page makes itself, behind Imperva, so it is read
#  through a real (minimised) Edge window controlled over its debugging port - the same reason the downloads use a real Edge window.
#
#  Usage:
#    .\Update-Calendar.ps1 -Next                 ONE page (the updater does this once a day): cycles through every month/page, the next two months twice per cycle
#    .\Update-Calendar.ps1 -All                  every month and page now (about 20 page loads, 3 s apart) - the first import, or a catch-up
#    .\Update-Calendar.ps1 -FromFile rows.tsv    merge rows saved as "publication<TAB>date<TAB>time" lines (offline; used for testing)
#    add -DryRun to see what would change without writing anything
#
#  What it changes: only tracked publications (the codes already in the schedule). A moved date/time is updated, a new release is added with its file-name token
#  worked out from the publication's naming rule. Rows are never deleted, past rows are never altered, and a copy of the old file goes to backups\ first.
#  After a change data\manifest.js (which carries the schedule for the app's "next release" labels) is patched in place. Every run is logged in data\update-log.txt
#  and summarised in data\calendar-status.js for the Data tab.
# =====================================================================
param([switch]$Next, [switch]$All, [string]$FromFile, [switch]$DryRun, [switch]$Quiet)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root "data"
$seedPath = Join-Path $PSScriptRoot "schedule-seed.json"
$statePath = Join-Path $dataDir "calendar-state.json"
$logPath = Join-Path $dataDir "update-log.txt"
$inv = [Globalization.CultureInfo]::InvariantCulture
$PAGE = "https://www.statssa.gov.za/?page_id=1874"
function Say($m) { $line = "{0}  Calendar: {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m; if (-not $Quiet) { Write-Host $line }; try { Add-Content -Path $logPath -Value $line -Encoding UTF8 } catch {} }

# ---------------------------------------------------------------- period + file-name token rules (one place; mirrors the tokens already in the seed)
$MONTH_NAMES = (1..12 | ForEach-Object { $inv.DateTimeFormat.GetMonthName($_) })
$QTR_FROM_MONTH = @('P0044', 'P9110.1', 'P0045', 'P0277', 'P3043')          # the calendar names a month; the period is the quarter containing it
$QTR_NAMED = @('P0211', 'P0441')                                            # the calendar says "3rd Quarter 2026"
$ANNUAL = @('P0021', 'P9101', 'P9103.1', 'P9115', 'P9119.4')                # the calendar says "2025"
function Get-Period([string]$code, [string]$label) {
    # $label = the text after the publication name's last comma, e.g. "August 2026", "3rd Quarter 2026", "2025"
    if ($ANNUAL -contains $code) { if ($label -match '^(\d{4})$') { return [pscustomobject]@{ period = $Matches[1]; year = [int]$Matches[1]; month = 0; q = 0 } }; return $null }
    if ($QTR_NAMED -contains $code) { if ($label -match '^(\d)(st|nd|rd|th) Quarter (\d{4})$') { return [pscustomobject]@{ period = "$($Matches[3])-Q$($Matches[1])"; year = [int]$Matches[3]; month = 3 * [int]$Matches[1]; q = [int]$Matches[1] } }; return $null }
    if ($label -match '^([A-Z][a-z]+) (\d{4})$') {
        $m = [array]::IndexOf($MONTH_NAMES, $Matches[1]) + 1; if ($m -lt 1) { return $null }
        $y = [int]$Matches[2]
        if ($QTR_FROM_MONTH -contains $code) { $q = [int][math]::Ceiling($m / 3); return [pscustomobject]@{ period = "$y-Q$q"; year = $y; month = $m; q = $q } }
        return [pscustomobject]@{ period = ("{0}-{1:00}" -f $y, $m); year = $y; month = $m; q = 0 }
    }
    return $null
}
function Get-Token([string]$code, $p) {
    switch ($code) {
        { $_ -in 'P0044', 'P9110.1' } { return "$($MONTH_NAMES[$p.month - 1]) $($p.year)" }
        'P0045' { return "$($p.year)$($MONTH_NAMES[$p.month - 1])" }
        'P0211' { return "$($p.year)Q$($p.q)" }
        'P0441' { return "Q$($p.q) $($p.year)" }
        { $_ -in 'P0277', 'P3043' } { return ("{0}{1:00}" -f $p.year, $p.month) }
        { $_ -in 'P9103.1', 'P9119.4' } { return "2005-$($p.year)" }
        { $ANNUAL -contains $_ } { return "$($p.year)" }
        default { return ("{0}{1:00}" -f $p.year, $p.month) }
    }
}
function PeriodKey([string]$p) { if ($p -match '^(\d{4})-Q(\d)$') { return "{0}-{1:00}" -f $Matches[1], (3 * [int]$Matches[2]) }; if ($p -match '^\d{4}$') { return "$p-12" }; return $p }

# ---------------------------------------------------------------- the seed
function Read-Seed { @((Get-Content $seedPath -Raw -Encoding UTF8 | ConvertFrom-Json) | ForEach-Object { $_ }) | ForEach-Object { [ordered]@{ code = [string]$_.code; period = [string]$_.period; date = [string]$_.date; time = [string]$_.time; token = [string]$_.token } } }
function Format-Seed($rows) {
    $parts = foreach ($r in $rows) { "{`n`"code`": `"$($r.code)`",`n`"period`": `"$($r.period)`",`n`"date`": `"$($r.date)`",`n`"time`": `"$($r.time)`",`n`"token`": `"$($r.token)`"`n}" }
    return "[`n" + ($parts -join ",`n") + "`n]`n"
}

# ---------------------------------------------------------------- merge: rows from StatsSA's page -> the seed
# $lines: objects { pub = "P0141 - Consumer Price Index (CPI), September 2026"; date = "21 October 2026 (Wednesday)"; time = "10:00" }
function Merge-Rows($lines) {
    $seed = @(Read-Seed); $codes = @($seed | ForEach-Object { $_.code } | Select-Object -Unique)
    $today = (Get-Date).Date; $changes = @(); $seen = 0
    foreach ($l in $lines) {
        if ($l.pub -notmatch '^(\S+) - (.+), ([^,]+)$') { continue }
        $code = $Matches[1]; $label = $Matches[3].Trim()
        if ($codes -notcontains $code) { continue }                        # not a publication this app tracks
        $per = Get-Period $code $label; if (-not $per) { Say "could not read the period '$label' for $code - skipped"; continue }
        if ($l.time -notmatch '^\d{2}:\d{2}') { Say "could not read the time of $code $($per.period) - skipped"; continue }
        if ($l.date -notmatch '^(\d{1,2}) ([A-Z][a-z]+) (\d{4})') { Say "could not read the date of $code $($per.period) - skipped"; continue }
        $d = [datetime]::ParseExact(("{0} {1} {2}" -f [int]$Matches[1], $Matches[2], $Matches[3]), "d MMMM yyyy", $inv)
        $tm = $l.time.Substring(0, 5); $iso = $d.ToString("yyyy-MM-dd"); $seen++
        $row = $seed | Where-Object { $_.code -eq $code -and $_.period -eq $per.period } | Select-Object -First 1
        if ($row) {
            if ($row.date -ne $iso -or $row.time -ne $tm) {
                $oldD = [datetime]::ParseExact($row.date, "yyyy-MM-dd", $inv)
                if ($oldD -ge $today -or $d -ge $today) { $changes += "$code $($per.period): $($row.date) $($row.time) -> $iso $tm"; $row.date = $iso; $row.time = $tm }
            }
        } else {
            if ($d -lt $today) { continue }                                   # history is not needed
            $seed += [ordered]@{ code = $code; period = $per.period; date = $iso; time = $tm; token = (Get-Token $code $per) }
            $changes += "$code $($per.period): new release $iso $tm (file token '$(Get-Token $code $per)')"
        }
    }
    return [pscustomobject]@{ seed = $seed; changes = $changes; seen = $seen }
}
function Save-Seed($res) {
    $sorted = @($res.seed | Sort-Object { $_.code }, { PeriodKey $_.period })
    $backups = Join-Path $root "backups"; New-Item -ItemType Directory -Force $backups | Out-Null
    Copy-Item $seedPath (Join-Path $backups ("schedule-seed-{0:yyyyMMdd-HHmmss}.json" -f (Get-Date))) -Force
    Get-ChildItem $backups -Filter "schedule-seed-*.json" | Sort-Object Name -Descending | Select-Object -Skip 10 | Remove-Item -Force -ErrorAction SilentlyContinue
    $text = Format-Seed $sorted
    [IO.File]::WriteAllText($seedPath, $text, (New-Object Text.UTF8Encoding($false)))
    # the app carries the schedule inside data\manifest.js: patch that section in place (a full parse would also do it)
    $mp = Join-Path $dataDir "manifest.js"
    if (Test-Path $mp) {
        $m = [IO.File]::ReadAllText($mp); $a = $m.IndexOf('"schedule":'); $b = if ($a -ge 0) { $m.IndexOf(',"report":', $a) } else { -1 }
        if ($a -ge 0 -and $b -gt $a) {
            $compact = ($text -replace '\s*\r?\n\s*', '')
            [IO.File]::WriteAllText($mp, $m.Substring(0, $a) + '"schedule":' + $compact + $m.Substring($b), (New-Object Text.UTF8Encoding($false)))
        } else { Say "data\manifest.js has no schedule section to patch - the next full parse will refresh it" }
    }
}

# ---------------------------------------------------------------- read pages through a real Edge window (remote debugging)
function Get-EdgePath {
    foreach ($c in @("$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe")) { if (Test-Path $c) { return $c } }
    throw "Microsoft Edge not found."
}
function Read-CalendarPages([string[]]$wanted) {
    # $wanted: "October 2026|2" entries (month|page). Returns { months = [...]; results = [ { month; page; pages; rows = [ [pub,date,time] ] } ] } or $null if StatsSA did not answer.
    $edge = Get-EdgePath; $tag = [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $profileDir = Join-Path $env:TEMP "sa-cal-edge-profile-$tag"; New-Item -ItemType Directory -Force (Join-Path $profileDir "Default") | Out-Null
    $port = Get-Random -Minimum 9300 -Maximum 9800
    $proc = $null; $ws = $null
    try {
        $proc = Start-Process -FilePath $edge -PassThru -WindowStyle Minimized -ArgumentList @("--no-first-run", "--no-default-browser-check", "--disable-popup-blocking", "--disable-sync", "--disable-background-networking", "--disable-component-update", "--remote-debugging-port=$port", "--user-data-dir=$profileDir", $PAGE)
        $wsUrl = $null
        foreach ($i in 1..40) { Start-Sleep -Milliseconds 500; try { $t = Invoke-RestMethod "http://127.0.0.1:$port/json/list" -TimeoutSec 3; $pg = @($t | Where-Object { $_.type -eq 'page' })[0]; if ($pg) { $wsUrl = $pg.webSocketDebuggerUrl; break } } catch {} }
        if ($env:CAL_DEBUG) { Say "debug: debugger url = $wsUrl" }
        if (-not $wsUrl) { return $null }
        $ws = New-Object Net.WebSockets.ClientWebSocket; $ws.ConnectAsync([uri]$wsUrl, [Threading.CancellationToken]::None).Wait()
        $script:cdpId = 0
        function Send-Cdp([string]$method, $params) {
            $script:cdpId++; $id = $script:cdpId
            $json = (@{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 8 -Compress)
            $bytes = [Text.Encoding]::UTF8.GetBytes($json)
            $ws.SendAsync([ArraySegment[byte]]$bytes, [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
            $buf = New-Object byte[] 1048576
            while ($true) {
                $sb = New-Object Text.StringBuilder
                do { $r = $ws.ReceiveAsync([ArraySegment[byte]]$buf, [Threading.CancellationToken]::None); $r.Wait(); [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Result.Count)) } while (-not $r.Result.EndOfMessage)
                $msg = $sb.ToString() | ConvertFrom-Json
                if ($msg.id -eq $id) { return $msg }
            }
        }
        # wait for the real page (Imperva's challenge resolves itself in a few seconds)
        $ready = $false
        foreach ($i in 1..40) {
            Start-Sleep -Milliseconds 1000
            $r = Send-Cdp 'Runtime.evaluate' @{ expression = "!!document.querySelector('select[name=drop_public]') && document.readyState === 'complete'"; returnByValue = $true }
            if ($r.result.result.value -eq $true) { $ready = $true; break }
            if ($i -in 6, 16, 28) { [void](Send-Cdp 'Page.navigate' @{ url = $PAGE }) }          # Imperva's first answer is a tiny challenge page that sets its cookies; asking again gets the real page
            if ($env:CAL_DEBUG -and ($i % 5 -eq 0)) { $d = Send-Cdp 'Runtime.evaluate' @{ expression = "document.readyState + ' | ' + location.href + ' | ' + document.title + ' | ' + document.body.innerText.slice(0,120).replace(/\s+/g,' ')"; returnByValue = $true }; Say ("debug: " + $d.result.result.value) }
        }
        if (-not $ready) { return $null }
        $list = ($wanted | ForEach-Object { '"' + $_ + '"' }) -join ','
        $js = @"
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const months = [...document.querySelectorAll('.dropdown-menu li a')].map(a => a.textContent.trim()).filter(x => /^[A-Z][a-z]+ \d{4}$/.test(x));
  const out = { months, results: [] };
  let first = true;
  for (const w of [$list]) {
    const [m, p] = w.split('|'); if (!first) await sleep(3000); first = false;
    const b = new URLSearchParams({ sel_publication: m, selec: '200', start: String((+p - 1) * 10), page_no: String(p) });
    const r = await fetch('/wp-content/themes/umkhanyakude-v2.1/ajax_server.php?req=recently_scheduled_eddie_t', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: b, credentials: 'include' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    const pages = Math.max(1, ...[...d.querySelectorAll('.pagination a')].map(a => +((/page_no=(\d+)/.exec(a.getAttribute('href')) || [0, 0])[1])));
    const rows = [...d.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(x => (x.childNodes[0] ? x.childNodes[0].textContent : '').replace(/\s+/g, ' ').trim()));
    out.results.push({ month: m, page: +p, pages, status: r.status, rows });
  }
  return JSON.stringify(out);
})()
"@
        $r = Send-Cdp 'Runtime.evaluate' @{ expression = $js; awaitPromise = $true; returnByValue = $true }
        if (-not $r.result.result.value) { return $null }
        return ($r.result.result.value | ConvertFrom-Json)
    } finally {
        try { if ($ws) { $ws.Dispose() } } catch {}
        if ($proc) { & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null }
        foreach ($try in 1..5) { Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue; if (-not (Test-Path $profileDir)) { break }; Start-Sleep -Milliseconds 700 }
    }
}

# ---------------------------------------------------------------- state: which page is next
$state = [ordered]@{ cursor = 0; months = @(); pages = @{}; lastCheck = ''; lastChange = ''; lastChanges = @(); lastResult = '' }
if (Test-Path $statePath) { try { $o = Get-Content $statePath -Raw | ConvertFrom-Json; foreach ($k in 'cursor', 'lastCheck', 'lastChange', 'lastResult') { if ($null -ne $o.$k) { $state[$k] = $o.$k } }; if ($o.months) { $state.months = @($o.months) }; if ($o.pages) { $o.pages.PSObject.Properties | ForEach-Object { $state.pages[$_.Name] = [int]$_.Value } }; if ($o.lastChanges) { $state.lastChanges = @($o.lastChanges) } } catch {} }
function Save-State { try { [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false))); $js = '(window.EQ=window.EQ||{pubs:{}}).calendarStatus=' + ($state | ConvertTo-Json -Depth 5 -Compress) + ';' + "`n"; [IO.File]::WriteAllText((Join-Path $dataDir "calendar-status.js"), $js, (New-Object Text.UTF8Encoding($false))) } catch {} }
function Get-Plan {
    $ms = @($state.months); if (-not $ms.Count) { $ms = @((Get-Date).ToString("MMMM yyyy", $inv)) }
    $all = @(); foreach ($m in $ms) { $n = if ($state.pages[$m]) { [int]$state.pages[$m] } else { 1 }; foreach ($p in 1..$n) { $all += "$m|$p" } }
    $near = @($all | Where-Object { $_.Split('|')[0] -in @($ms | Select-Object -First 2) })
    return @($near + $all)                                                  # the next two months are read twice per cycle
}
function Apply-Results($data) {
    $lines = @()
    if ($data.months -and @($data.months).Count) { $state.months = @($data.months) }
    foreach ($r in @($data.results)) {
        if ($r.status -ne 200) { Say "$($r.month) page $($r.page): StatsSA answered HTTP $($r.status)"; continue }
        $state.pages[$r.month] = [int]$r.pages
        foreach ($row in @($r.rows)) { if (@($row).Count -ge 3) { $lines += [pscustomobject]@{ pub = $row[0]; date = $row[1]; time = $row[2] } } }
    }
    return $lines
}
function Finish($lines, [string]$what) {
    $res = Merge-Rows $lines
    $state.lastCheck = (Get-Date).ToString('s')
    if ($res.changes.Count) {
        foreach ($c in $res.changes) { Say $c }
        if ($DryRun) { Say "dry run - nothing written ($($res.changes.Count) change(s))" } else { Save-Seed $res; $state.lastChange = (Get-Date).ToString('s'); $state.lastChanges = @($res.changes | Select-Object -First 12) }
        $state.lastResult = "$what : $($res.changes.Count) change(s)"
    } else { $state.lastResult = "$what : no change ($($res.seen) tracked rows read)"; Say $state.lastResult }
    if (-not $DryRun) { Save-State }
    return $res
}

# ---------------------------------------------------------------- run
if ($FromFile) {
    $lines = @(Get-Content $FromFile -Encoding UTF8 | Where-Object { $_.Trim() } | ForEach-Object { $c = $_ -split "`t"; [pscustomobject]@{ pub = $c[0]; date = $c[1]; time = $c[2] } })
    [void](Finish $lines "file $(Split-Path $FromFile -Leaf) ($($lines.Count) rows)")
    return
}
if ($All) {
    $months = @($state.months); if (-not $months.Count) { $months = @((Get-Date).ToString("MMMM yyyy", $inv)) }
    $first = Read-CalendarPages @("$($months[0])|1")
    if (-not $first) { Say "StatsSA did not answer (bot protection or no connection) - try again later"; exit 1 }
    $state.months = @($first.months); $want = @()
    foreach ($m in $state.months) { $n = 1; if ($m -eq $months[0]) { $n = [int]$first.results[0].pages }; foreach ($p in 1..([math]::Max(1, $n))) { $want += "$m|$p" } }
    $data = $first; $lines = @(Apply-Results $first)
    $rest = @($want | Where-Object { $_ -ne "$($months[0])|1" })
    if ($rest.Count) {                                                       # page counts of the other months are unknown until their page 1 is read: read 1..3 and stop at the real count
        $firsts = @()
        foreach ($m in @($state.months | Where-Object { $_ -ne $months[0] })) { $firsts += "$m|1" }
        $d1 = Read-CalendarPages $firsts; if (-not $d1) { Say "StatsSA stopped answering - partial calendar not merged"; exit 1 }
        $lines += @(Apply-Results $d1)
        $more = @(); foreach ($m in $state.months) { $n = [int]$state.pages[$m]; if ($n -gt 1) { foreach ($p in 2..$n) { $more += "$m|$p" } } }
        if ($more.Count) { $d2 = Read-CalendarPages $more; if (-not $d2) { Say "StatsSA stopped answering - partial calendar not merged"; exit 1 }; $lines += @(Apply-Results $d2) }
    }
    [void](Finish $lines "full calendar ($($state.months.Count) months, $($lines.Count) rows)")
    return
}
if ($Next) {
    $plan = @(Get-Plan); $i = [int]$state.cursor % $plan.Count; $target = $plan[$i]
    $data = Read-CalendarPages @($target)
    if (-not $data) { Say "StatsSA did not answer for $target (bot protection or no connection) - will try again tomorrow"; $state.lastResult = "no answer for $target"; if (-not $DryRun) { Save-State }; exit 1 }
    $lines = @(Apply-Results $data)
    $state.cursor = ([int]$state.cursor + 1) % [math]::Max(1, @(Get-Plan).Count)
    [void](Finish $lines "page $target")
    return
}
Write-Host "Nothing to do: use -Next (one page), -All (everything) or -FromFile <tsv>. See the header of this file."
