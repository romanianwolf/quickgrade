@echo off
title QuickGrade - Development Setup & Run
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
echo [1/7] Checking prerequisites...

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
    if errorlevel 1 (
        echo [ERROR] Failed to install pnpm
        pause
        exit /b 1
    )
)
for /f "tokens=*" %%v in ('pnpm -v') do echo   pnpm: v%%v

where git >nul 2>&1
if errorlevel 1 (
    echo [WARN] Git not found. GitHub sync will be skipped.
) else (
    echo   Git: installed
)

echo [OK] Prerequisites OK
echo.

:: ─── Step 2: Install Dependencies ─────────────────────────────
echo [2/7] Installing dependencies...
pnpm install --frozen-lockfile 2>nul
if errorlevel 1 (
    echo [INFO] Lockfile missing or outdated, running pnpm install...
    pnpm install
)
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo.

:: ─── Step 3: Check .env.local ─────────────────────────────────
echo [3/7] Checking environment...
if not exist ".env.local" (
    if exist ".env.local.example" (
        echo [INFO] Creating .env.local from template...
        copy .env.local.example .env.local >nul
        echo [WARN] Edit .env.local with your API keys before grading will work.
    ) else (
        echo [WARN] No .env.local found.
    )
) else (
    echo [OK] .env.local found
)
echo.

:: ─── Step 4: Setup Git ────────────────────────────────────────
echo [4/7] Setting up Git repository...
where git >nul 2>&1
if not errorlevel 1 (
    if not exist ".git" (
        git init
        git branch -M main
    )
    git config user.name "Abhinav"
    git config user.email "romanianwolf@users.noreply.github.com"
    git remote get-url origin >nul 2>&1
    if errorlevel 1 (
        git remote add origin https://github.com/romanianwolf/quickgrade.git
    )
    echo [OK] Git configured
) else (
    echo [SKIP] Git not installed
)
echo.

:: ─── Step 5: Typecheck & Lint ─────────────────────────────────
echo [5/7] Running typecheck and lint...
pnpm typecheck 2>nul
if errorlevel 1 (
    echo [WARN] Typecheck had issues (non-fatal)
)
pnpm lint 2>nul
if errorlevel 1 (
    echo [WARN] Lint had issues (non-fatal)
)
echo.

:: ─── Step 6: Push to GitHub ───────────────────────────────────
echo [6/7] Syncing with GitHub...
where git >nul 2>&1
if not errorlevel 1 (
    if exist ".git" (
        git status --short
        echo.
        set /p COMMIT_MSG="Commit message (Enter to skip): "
        if not "!COMMIT_MSG!"=="" (
            git add -A
            git commit -m "!COMMIT_MSG!" 2>nul
            if not errorlevel 1 (
                echo [OK] Committed: !COMMIT_MSG!
                git push -u origin main 2>nul
                if not errorlevel 1 (
                    echo [OK] Pushed to GitHub
                ) else (
                    echo [WARN] Push failed (no remote or auth issue)
                )
            ) else (
                echo [INFO] Nothing to commit
            )
        ) else (
            echo [SKIP] Skipping push
        )
    ) else (
        echo [INFO] No git repo found.
    )
) else (
    echo [SKIP] Git not installed
)
echo.

:: ─── Step 7: Start Dev Server ─────────────────────────────────
echo [7/7] Starting development server...
echo.
echo  ┌─────────────────────────────────────────┐
echo  │  Web:     http://localhost:3000          │
echo  │  Demo:    http://localhost:3000/demo     │
echo  │  API:     http://localhost:3000/api/v1/  │
echo  │  Worker:  http://localhost:3001          │
echo  └─────────────────────────────────────────┘
echo.

:: Start dev server in separate window
start "QuickGrade Dev" cmd /c "cd /d "%~dp0" && pnpm dev"

:: Wait for server to boot
echo Waiting for server to start... (6 seconds)
timeout /t 6 /nobreak >nul

:: Open browser to demo
echo Opening browser to demo page...
start http://localhost:3000/demo

echo.
echo Server is running in separate window.
echo Close that window to stop the server.
echo.
pause