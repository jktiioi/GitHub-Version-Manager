@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$existing = Get-NetTCPConnection -LocalPort 7788 -ErrorAction SilentlyContinue; if (-not $existing) { Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden }; Start-Sleep -Seconds 1; Start-Process 'http://127.0.0.1:7788'"
