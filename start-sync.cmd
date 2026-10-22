@echo off
rem Starts the KFDisplay sync service and appends its output to logs\sync.log.
rem Used by the "KFDisplay sync" scheduled task (setup\install-startup.ps1); also fine to double-click.
rem If the service stops (a restart from the register, an update, a crash) it is started again after a few
rem seconds, unless stop.flag is here (tools\control.js stop, the "Stop KFDisplay sync" shortcut).
cd /d "%~dp0"
if not exist logs mkdir logs
if exist stop.flag del stop.flag
:run
node src\main.js >> logs\sync.log 2>&1
if exist stop.flag (
  echo %date% %time% stopped >> logs\sync.log
  del stop.flag
  exit /b 0
)
echo %date% %time% stopped, starting again in 3 seconds >> logs\sync.log
timeout /t 3 /nobreak > nul
rem Another copy already serving port 8787 (e.g. started twice): leave it to that one.
netstat -ano | findstr /r /c:":8787 .*LISTENING" > nul && exit /b 0
goto run
