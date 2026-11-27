@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Erster Start: Pakete werden installiert...
  call npm install
)
call npm start
