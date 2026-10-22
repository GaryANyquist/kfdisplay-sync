<#
  Optional, only when KFIDisplay (the menu board) runs on a different PC from SQL Server
  (Gary, 2026-10-22). Run once on the SQL Server PC, in PowerShell as Administrator:

      powershell -ExecutionPolicy Bypass -File C:\Source\kfdisplay-sync\setup\09-allow-remote-display.ps1

  What it does, and only this:
    1. SQL Server Express (instance SQLEXPRESS) listens on TCP port 1433 (it already does if the sync
       service's .env uses KFDISPLAY_PORT=1433) and accepts SQL logins (needed for kfidisplay_read).
       SQL Server is restarted only if one of these had to change.
    2. Windows Firewall lets the local network (Domain and Private profiles) reach port 1433 (SQL Server)
       and port 8787 (the sync service, which the KFIDisplay PC copies photos from).
  Nothing is opened to Public networks. Undo: remove the "KFDisplay SQL Server" firewall rule.
#>
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$instance = 'SQLEXPRESS'
$id = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL').$instance
if (-not $id) { throw "SQL Server instance $instance was not found on this PC." }
$root = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$id\MSSQLServer"
$changed = $false

# 1a. TCP/IP on, fixed port 1433 on all addresses.
$tcp = "$root\SuperSocketNetLib\Tcp"
if ((Get-ItemProperty $tcp).Enabled -ne 1) { Set-ItemProperty $tcp -Name Enabled -Value 1; $changed = $true }
$ipAll = "$tcp\IPAll"
if ((Get-ItemProperty $ipAll).TcpPort -ne '1433') { Set-ItemProperty $ipAll -Name TcpPort -Value '1433'; $changed = $true }
if ((Get-ItemProperty $ipAll).TcpDynamicPorts -ne '') { Set-ItemProperty $ipAll -Name TcpDynamicPorts -Value ''; $changed = $true }

# 1b. SQL Server and Windows sign-in (LoginMode 2), so SQL logins like kfidisplay_read work.
if ((Get-ItemProperty $root).LoginMode -ne 2) { Set-ItemProperty $root -Name LoginMode -Value 2; $changed = $true }

if ($changed) {
  Write-Host 'Restarting SQL Server to apply the network settings...'
  Restart-Service -Name "MSSQL`$$instance" -Force
} else {
  Write-Host 'SQL Server already listens on port 1433 and accepts SQL logins.'
}

# 2. Firewall, local network only (Domain and Private, like the existing "KFDisplay sync" rule: the
#    truck PC's network is a domain network). The sync service's 8787 rule is usually there already.
foreach ($rule in @(
    @{ Name = 'KFDisplay SQL Server'; Port = 1433 },
    @{ Name = 'KFDisplay sync'; Port = 8787 })) {
  if (-not (Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Protocol TCP -LocalPort $rule.Port `
      -Profile Domain,Private -Action Allow | Out-Null
    Write-Host "Firewall: allowed port $($rule.Port) on the local network."
  } else {
    Write-Host "Firewall: '$($rule.Name)' already exists."
  }
}

Write-Host ''
Write-Host "Done. On the KFIDisplay PC, put this PC's name or address in C:\KFDisplay\display.ini."
Write-Host "This PC is: $env:COMPUTERNAME"
