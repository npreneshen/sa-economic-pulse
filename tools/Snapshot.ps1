# Snapshot.ps1 - safety net for the updater (dot-sourced by Update-Data.ps1 and Restore-Snapshot.ps1).
# A snapshot is a zip in <app>\backups holding everything an update can change: all of data\ (except the log / state / status files), the source-data folders of the
# publications being replaced, and index.html + INTEGRATION_STATUS.md + ACCURACY_REPORT.md. The updater takes one before every swap and puts it back automatically if a
# check fails afterwards; Restore-Snapshot.ps1 does the same by hand.
$SNAP_SKIP = @('update-log.txt', 'update-state.json', 'update-status.js', 'update-status.json', 'calendar-state.json', 'calendar-status.js', 'live-snapshot.js')         # history, not data: never rolled back
$SNAP_ROOT_FILES = @('index.html', 'INTEGRATION_STATUS.md', 'ACCURACY_REPORT.md')

# Empty a folder but keep files whose name matches $keep wherever they sit (they live in an EXCEL subfolder). Removing every non-matching folder (the old behaviour)
# deleted the EXCEL folder together with the files meant to survive, e.g. the legacy insolvency history of P0043.2.
function Clear-Folder([string]$folder, [string]$keep) {
    if (-not (Test-Path $folder)) { return }
    if (-not $keep) { Get-ChildItem $folder -Recurse -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue; return }
    Get-ChildItem $folder -Recurse -Force -File | Where-Object { $_.Name -notlike $keep } | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem $folder -Recurse -Force -Directory | Sort-Object { $_.FullName.Length } -Descending | Where-Object { -not (Get-ChildItem $_.FullName -Force -ErrorAction SilentlyContinue) } | Remove-Item -Force -ErrorAction SilentlyContinue
}

function New-Snapshot([string]$root, [string[]]$codes, [datetime]$when, [int]$keepLast = 5) {
    $dir = Join-Path $root 'backups'; New-Item -ItemType Directory -Force $dir | Out-Null
    $tmp = Join-Path $env:TEMP ('eq-snap-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Force (Join-Path $tmp 'data'), (Join-Path $tmp 'source-data'), (Join-Path $tmp 'root') | Out-Null
    try {
        Get-ChildItem (Join-Path $root 'data') -File | Where-Object { $SNAP_SKIP -notcontains $_.Name } | Copy-Item -Destination (Join-Path $tmp 'data')
        foreach ($c in $codes) { $src = Join-Path (Join-Path $root 'source-data') $c; if (Test-Path $src) { New-Item -ItemType Directory -Force (Join-Path $tmp "source-data\$c") | Out-Null; Copy-Item (Join-Path $src '*') (Join-Path $tmp "source-data\$c") -Recurse -Force } }
        foreach ($f in $SNAP_ROOT_FILES) { $p = Join-Path $root $f; if (Test-Path $p) { Copy-Item $p (Join-Path $tmp 'root') } }
        (@{ when = $when.ToString('s'); codes = @($codes) } | ConvertTo-Json -Compress) | Set-Content (Join-Path $tmp 'snapshot.json') -Encoding UTF8
        $zip = Join-Path $dir ('snapshot-{0:yyyyMMdd-HHmmss}.zip' -f $when)
        if (Test-Path $zip) { Remove-Item $zip -Force }
        Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $zip -Force
    } finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    Get-ChildItem $dir -Filter 'snapshot-*.zip' | Sort-Object Name -Descending | Select-Object -Skip $keepLast | Remove-Item -Force -ErrorAction SilentlyContinue
    return $zip
}

function Get-Snapshots([string]$root) {
    $dir = Join-Path $root 'backups'
    if (-not (Test-Path $dir)) { return @() }
    return @(Get-ChildItem $dir -Filter 'snapshot-*.zip' | Sort-Object Name -Descending)
}

# Put a snapshot back. $only limits it to some publications (their data files and source folders); no $only = everything the snapshot holds.
function Restore-Snapshot([string]$root, [string]$zip, [string[]]$only) {
    $tmp = Join-Path $env:TEMP ('eq-restore-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    try {
        Expand-Archive -Path $zip -DestinationPath $tmp -Force
        $meta = Get-Content (Join-Path $tmp 'snapshot.json') -Raw | ConvertFrom-Json
        $dataDir = Join-Path $root 'data'; $sourceDir = Join-Path $root 'source-data'
        if ($only) {
            foreach ($c in $only) {
                $f = Join-Path $tmp "data\$c.js"; if (Test-Path $f) { Copy-Item $f $dataDir -Force }
                if ($c -eq 'P0441') { $f2 = Join-Path $tmp 'data\P0441A.js'; if (Test-Path $f2) { Copy-Item $f2 $dataDir -Force } }
                $s = Join-Path $tmp "source-data\$c"; if (Test-Path $s) { Clear-Folder (Join-Path $sourceDir $c) ''; New-Item -ItemType Directory -Force (Join-Path $sourceDir $c) | Out-Null; Copy-Item (Join-Path $s '*') (Join-Path $sourceDir $c) -Recurse -Force }
            }
            foreach ($f in 'manifest.js', '_parse-report.json') { Copy-Item (Join-Path $tmp "data\$f") $dataDir -Force }          # these describe the whole set: the caller re-runs Parse-StatsSA.ps1 afterwards for a partial restore
        } else {
            Copy-Item (Join-Path $tmp 'data\*') $dataDir -Force
            Get-ChildItem (Join-Path $tmp 'source-data') -Directory | ForEach-Object { $live = Join-Path $sourceDir $_.Name; Clear-Folder $live ''; New-Item -ItemType Directory -Force $live | Out-Null; Copy-Item (Join-Path $_.FullName '*') $live -Recurse -Force }
            Get-ChildItem (Join-Path $tmp 'root') -File -ErrorAction SilentlyContinue | ForEach-Object { Copy-Item $_.FullName (Join-Path $root $_.Name) -Force }
        }
        return $meta
    } finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
