@echo off
title QuickGrade - AI Grading Platform
color 0B
setlocal enabledelayedexpansion
echo.
echo  ███████╗ ██████╗ █████╗ ██╗███╗   ██╗
echo  ██╔════╝██╔════██╗██╔══██╗██║████╗  ██║
echo  ██║     █████╔╝███████║██║██╔██╗ ██║
echo  ██║     ██╔═══╝ ██╔══██║██║██║╚██╗██║
echo  ███████╗██║     ██║  ██║██║██║ ╚████║
echo  ╚══════╝╚═╝     ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝
echo.
echo  QuickGrade - AI-Powered Grading Platform
echo.

:: ─── Step 1: Check Prerequisites ──────────────────────────────
echo [1/6] Checking prerequisites...
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   Node.js: %%v

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [INFO] pnpm not found. Installing...
    call npm install -g pnpm
)
for /f "tokens=*" %%v in ('pnpm -v') do echo   pnpm: v%%v
echo [OK] Prerequisites OK
echo.

:: ─── Step 2: Install Dependencies ─────────────────────────────
echo [2/6] Installing dependencies...
if not exist "node_modules" (
    pnpm install
) else (
    echo [OK] Already installed
)
echo.

:: ─── Step 3: Setup Git ────────────────────────────────────────
echo [3/6] Setting up Git...
where git >nul 2>&1
if not errorlevel 1 (
    if not exist ".git" (git init && git branch -M main)
    git config user.name "Abhinav" 2>nul
    git config user.email "romanianwolf@users.noreply.github.com" 2>nul
    git remote get-url origin >nul 2>&1
    if errorlevel 1 (git remote add origin https://github.com/romanianwolf/quickgrade.git 2>nul)
    echo [OK] Git configured
)
echo.

:: ─── Step 4: Push to GitHub ───────────────────────────────────
echo [4/6] Sync with GitHub...
where git >nul 2>&1
if not errorlevel 1 (
    git status --short
    echo.
    set /p COMMIT_MSG="Commit message (Enter to skip): "
    if not "!COMMIT_MSG!"=="" (
        git add -A
        git commit -m "!COMMIT_MSG!" 2>nul
        git push -u origin main 2>nul
        echo [OK] Pushed to GitHub
    ) else (
        echo [SKIP] Skipped
    )
)
echo.

:: ─── Step 5: Start Dev Server ─────────────────────────────────
echo [5/6] Starting dev server in new window...
set "PROJECT_DIR=%~dp0"
start "QuickGrade" cmd /k "cd /d "%PROJECT_DIR%" && pnpm dev"

:: ─── Step 6: Wait & Open Browser ──────────────────────────────
echo [6/6] Waiting for server to be ready...
set /a ATTEMPTS=0

:WAIT_LOOP
set /a ATTEMPTS+=1
if %ATTEMPTS% gtr 30 (
    echo [WARN] Server took too long. Open http://localhost:3000/demo manually.
    goto :OPEN_BROWSER
)
timeout /t 2 /nobreak >nul
netstat -an 2>nul | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo   Waiting... (%ATTEMPTS%/30)
    goto :WAIT_LOOP
)

echo [OK] Server is ready!

:OPEN_BROWSER
start http://localhost:3000/demo

echo.
echo  ┌─────────────────────────────────────────┐
echo  │  Demo:  http://localhost:3000/demo       │
echo  │  API:   http://localhost:3000/api/v1/    │
echo  └─────────────────────────────────────────┘
echo.
echo  Close the "QuickGrade" window to stop.
echo.
pause