$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
  Write-Host "Starting Noven.code Platform on http://127.0.0.1:3000 ..." -ForegroundColor Cyan
  & node "src/server/index.js"
  exit 0
}

$cursorNode = "C:\Users\1\AppData\Local\Programs\cursor\Cursor.exe"
if (Test-Path $cursorNode) {
  Write-Host "Starting Noven.code Platform via embedded Node v24 runtime on http://127.0.0.1:3000 ..." -ForegroundColor Cyan
  $env:ELECTRON_RUN_AS_NODE = "1"
  Start-Process -FilePath $cursorNode -ArgumentList "src/server/index.js" -NoNewWindow -Wait
  exit 0
}

Write-Error "Node.js v22.5+ runtime not found."
