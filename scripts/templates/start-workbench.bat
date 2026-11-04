@echo off
setlocal
cd /d "%~dp0"

if not exist "runner\tauri-host.exe" (
  echo [ERROR] runner\tauri-host.exe not found!
  pause
  exit /b 1
)

echo Starting OM Workbench...
start "" "runner\tauri-host.exe" --workspace "web-workbench\dist"
