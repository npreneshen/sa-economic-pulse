# Restore-Snapshot.ps1 - put back the data from before an update. The updater takes a snapshot (backups\snapshot-*.zip, newest 5 kept) before every swap and rolls back
# by itself when a check fails; this is the manual version, for when the problem is noticed later.
#   .\tools\Restore-Snapshot.ps1 -List                              what snapshots exist (newest first)
#   .\tools\Restore-Snapshot.ps1                                    restore the newest snapshot completely
#   .\tools\Restore-Snapshot.ps1 -Snapshot snapshot-20261003-120000.zip
#   .\tools\Restore-Snapshot.ps1 -Only P0141,P0211                  restore just those publications (then re-parses so the manifest and reports agree)
# The restored publications are also held off for 23 hours, so the next scheduled update does not immediately fetch the same file again;
# run .\tools\Update-Data.ps1 -Force -Only <code> once StatsSA or the parser is fixed (add -ClearRejected if the updater had rejected that file).
param([switch]$List, [string]$Snapshot, [string[]]$Only, [switch]$NoPin)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "Snapshot.ps1")
$snaps = Get-Snapshots $root
if ($List -or -not $snaps.Count) {
    if (-not $snaps.Count) { Write-Host "No snapshots yet (they are created by the updater before every swap)."; return }
    foreach ($z in $snaps) { $m = $null; try { Add-Type -AssemblyName System.IO.Compression.FileSystem; $za = [IO.Compression.ZipFile]::OpenRead($z.FullName); $e = $za.GetEntry('snapshot.json'); $sr = New-Object IO.StreamReader($e.Open()); $m = $sr.ReadToEnd() | ConvertFrom-Json; $sr.Close(); $za.Dispose() } catch {}
        "{0}  {1,6:N1} MB  replaced: {2}" -f $z.Name, ($z.Length / 1MB), $(if ($m) { @($m.codes) -join ', ' } else { '?' }) }
    return
}
$zip = if ($Snapshot) { Join-Path (Join-Path $root 'backups') $Snapshot } else { $snaps[0].FullName }
if (-not (Test-Path $zip)) { throw "No such snapshot: $zip" }
$only = if ($Only) { @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ }) } else { $null }
Write-Host ("Restoring " + (Split-Path $zip -Leaf) + $(if ($only) { " for " + ($only -join ', ') } else { " (everything it holds)" }))
$meta = Restore-Snapshot $root $zip $only
if ($only) {
    # data files of the other publications stay as they are, so rebuild the manifest and parse report from what is now on disk
    & (Join-Path $PSScriptRoot "Parse-StatsSA.ps1") -Quiet
    $py = Get-Command python -ErrorAction SilentlyContinue
    if ($py) { Push-Location $root; try { & python (Join-Path $PSScriptRoot "Audit-Integration.py") | Out-Null; & python (Join-Path $PSScriptRoot "Check-Accuracy.py") | Out-Null } finally { Pop-Location } }
}
$idx = Join-Path $root "index.html"
if (Test-Path $idx) { $txt = [IO.File]::ReadAllText($idx); [IO.File]::WriteAllText($idx, ($txt -replace '\?v=\d+', ('?v=' + (Get-Date).ToString('yyyyMMddHHmm'))), (New-Object Text.UTF8Encoding($false))) }
# do not fetch the same files again straight away
if (-not $NoPin) {
    $sp = Join-Path (Join-Path $root 'data') 'update-state.json'; $st = @{}
    if (Test-Path $sp) { try { (Get-Content $sp -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $st[$_.Name] = $_.Value } } catch {} }
    foreach ($c in $(if ($only) { $only } else { @($meta.codes) })) { $st[$c] = (Get-Date).AddHours(23).ToString('s') }          # the updater waits 25 minutes after a try; this holds it off for a day
    ($st | ConvertTo-Json) | Set-Content $sp -Encoding UTF8
}
Write-Host "Done. Reload the app. The updater will leave these publications alone for 23 hours (or run Update-Data.ps1 -ClearRejected -Force -Only <code>)."
