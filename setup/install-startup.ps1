<#
  Makes the KFDisplay sync service run by itself (Gary, 2026-10-22: without KFIDisplay and without Task Manager).
  Run once on the PC with SQL Server, in PowerShell as Administrator:

      powershell -ExecutionPolicy Bypass -File C:\Source\kfdisplay-sync\setup\install-startup.ps1

  What it does:
    1. The "KFDisplay sync" scheduled task: starts start-sync.cmd at boot as SYSTEM, with no time limit (Windows'
       default 3-day limit once stopped the service silently) and restarted if the task itself fails.
       start-sync.cmd starts the service again whenever it stops, unless it was stopped on purpose.
    2. Desktop shortcuts for everyone on this PC: Start, Stop and Restart KFDisplay sync, and KFDisplay sync status.
       They need no administrator rights.
  Safe to run again. Undo: delete the task (schtasks /Delete /TN "KFDisplay sync" /F) and the four shortcuts.
#>
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root 'start-sync.cmd'

# 1. The start-at-boot task
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$script`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'KFDisplay sync' -Action $action -Trigger $trigger -Principal $principal `
  -Settings $settings -Force | Out-Null
Write-Host 'Scheduled task "KFDisplay sync" set to start at boot.'

# 2. Shortcuts on the shared desktop
$node = (Get-Command node -ErrorAction Stop).Source
$desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
$shell = New-Object -ComObject WScript.Shell
foreach ($s in @(
    @{ Name = 'Start KFDisplay sync'; Cmd = 'start' },
    @{ Name = 'Stop KFDisplay sync'; Cmd = 'stop' },
    @{ Name = 'Restart KFDisplay sync'; Cmd = 'restart' },
    @{ Name = 'KFDisplay sync status'; Cmd = 'status' })) {
  $lnk = $shell.CreateShortcut((Join-Path $desktop "$($s.Name).lnk"))
  $lnk.TargetPath = 'cmd.exe'
  # Runs the command, shows what happened, and closes after 5 seconds.
  $lnk.Arguments = "/c `"`"$node`" `"$root\tools\control.js`" $($s.Cmd) & timeout /t 5`""
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,238"
  $lnk.Save()
}
Write-Host "Shortcuts added to the desktop: Start, Stop, Restart KFDisplay sync, KFDisplay sync status."

# Run it through the task now: a copy started some other way (by KFIDisplay, by hand, or an older version without
# the restart loop) is stopped first, so the one running is the task's.
$old = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($procId in $old) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
if ($old) { Start-Sleep -Seconds 2 }
Start-ScheduledTask -TaskName 'KFDisplay sync'
Start-Sleep -Seconds 5
& $node (Join-Path $root 'tools\control.js') status
