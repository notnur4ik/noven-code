@echo off
setlocal
title Noven.code Platform Server
cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  echo Starting Noven.code Platform on http://127.0.0.1:3000 ...
  node src\server\index.js
  goto :eof
)

if exist "C:\Users\1\AppData\Local\Programs\cursor\Cursor.exe" (
  echo Starting Noven.code Platform via embedded Node v24 runtime on http://127.0.0.1:3000 ...
  set ELECTRON_RUN_AS_NODE=1
  "C:\Users\1\AppData\Local\Programs\cursor\Cursor.exe" src\server\index.js
  goto :eof
)

echo Error: Node.js v22.5+ runtime not found. Please install Node.js or add it to PATH.
pause
