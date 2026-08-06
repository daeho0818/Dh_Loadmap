@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ==========================================================================
REM  Lab deploy / redeploy helper
REM    build check -> empty commit -> push -> open Actions -> wait for live
REM
REM  NOTE: ASCII only. Korean text in a .bat breaks cmd parsing.
REM
REM  MARKER : string that exists ONLY in the new version of the page.
REM           Used to detect that the deploy actually landed.
REM           Leave empty to skip the waiting step.
REM ==========================================================================
set "REPO=daeho0818/Dh_Loadmap"
set "PAGE=https://daeho0818.github.io/Dh_Loadmap/experiments/007-stock-desk/"
set "MARKER=rc-body"

echo.
echo ==========================================
echo   LAB DEPLOY
echo ==========================================
echo.

REM ---------- 1. working tree ----------
echo [1/4] Working tree
echo ------------------------------------------
git status --short
echo ------------------------------------------

set "CHANGED="
for /f "delims=" %%a in ('git status --porcelain') do set "CHANGED=1"

if defined CHANGED (
  echo.
  echo   [X] Uncommitted changes found.
  echo       Commit them first, then run this again.
  echo       This script only re-triggers a deploy.
  goto end
)
echo   clean.
echo.

REM ---------- 2. local build ----------
echo [2/4] Local build
call npm run build
if errorlevel 1 (
  echo.
  echo   [X] Build failed. Fix it before deploying.
  goto end
)
echo.

REM ---------- 3. empty commit + push ----------
echo [3/4] Trigger redeploy
set "GO="
set /p "GO=Push an empty commit to re-run the deploy? (y/n): "
if /i not "!GO!"=="y" (
  echo   cancelled.
  goto end
)

git commit --allow-empty -m "chore: retry github pages deploy"
if errorlevel 1 (
  echo   [X] commit failed
  goto end
)

git push origin main
if errorlevel 1 (
  echo   [X] push failed
  goto end
)
echo.
start "" "https://github.com/%REPO%/actions"

REM ---------- 4. wait until live ----------
if "%MARKER%"=="" (
  echo [4/4] Skipping wait. Check the Actions tab for a green run.
  goto end
)

echo [4/4] Waiting for the deploy to land - up to 12 min
echo   marker: %MARKER%
echo.
set "OK="
for /l %%i in (1,1,36) do (
  if not defined OK (
    timeout /t 20 /nobreak >nul
    curl -s -o "%TEMP%\lab_deploy_check.html" "%PAGE%?cb=%%i!RANDOM!"
    findstr /c:"%MARKER%" "%TEMP%\lab_deploy_check.html" >nul 2>&1
    if !errorlevel! equ 0 (
      set "OK=1"
      echo.
      echo   [OK] Deployed.
      echo   %PAGE%
      start "" "%PAGE%"
    ) else (
      echo   ... %%i/36  still the old version
    )
  )
)

if not defined OK (
  echo.
  echo   [X] Not live after 12 minutes.
  echo       Open the Actions tab and read the "deploy" step log.
  echo       If "build" succeeded and only "deploy" failed, that is a
  echo       transient GitHub Pages error - just run this script again.
)

:end
echo.
pause
endlocal
