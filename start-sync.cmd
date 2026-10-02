@echo off
rem Starts the KFDisplay sync service and appends its output to logs\sync.log.
rem Used by the "KFDisplay sync" scheduled task (see README); also fine to double-click.
cd /d "%~dp0"
if not exist logs mkdir logs
node src\main.js >> logs\sync.log 2>&1
