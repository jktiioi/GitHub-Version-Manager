@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "$existing = Get-NetTCPConnection -LocalPort 7788 -ErrorAction SilentlyContinue; if ($existing) { $existing | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force } }"
