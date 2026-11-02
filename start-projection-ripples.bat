@echo off
rem deep dive (ripples only) - double-click to start the ripple-only projection.
rem Starts the Next.js server in its own window, then opens Chrome full-screen
rem on the projection page. (Live Server / "Go Live" cannot run this app.)

cd /d "%~dp0"
set "URL=http://localhost:3000/projection-ripples"

set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

echo Starting the projection server (keep the "deep dive server" window open)...
start "deep dive server" cmd /k npm run dev -- --webpack

echo Waiting for the server to start...
timeout /t 12 /nobreak >nul

if defined CHROME (
  start "" "%CHROME%" --new-window --start-fullscreen "%URL%"
) else (
  start "" "%URL%"
)
