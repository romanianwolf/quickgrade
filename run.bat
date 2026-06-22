@echo off
title Markov v3 - Development Server
color 0B
setlocal enabledelayedexpansion
echo.
echo  ███╗   ███╗ █████╗ ███████╗████████╗ ██████╗ ███╗   ██╗
echo  ████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔═══██╗████╗  ██║
echo  ██╔████╔██║███████║███████╗   ██║   ██║   ██║██╔██╗ ██║
echo  ██║╚██╔╝██║██╔══██║╚════██║   ██║   ██║   ██║██║╚██╗██║
echo  ██║ ╚═╝ ██║██║  ██║███████║   ██║   ╚██████╔╝██║ ╚████║
echo  ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═══╝
echo.
echo  AI-Powered Grading Platform - v3.0.0
echo  ==========================================
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
echo [2/6] Installing dependencies...
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
echo [3/6] Checking environment...
if not exist ".env.local" (
    if exist ".env.local.example" (
        echo [INFO] Creating .env.local from template...
        copy .env.local.example .env.local >nul
        echo [WARN] Edit .env.local with your API keys before grading will work.
    ) else (
        echo [WARN] No .env.local found. Create one with your environment variables.
    )
) else (
    echo [OK] .env.local found
)
echo.

:: ─── Step 4: Push to GitHub ───────────────────────────────────
echo [4/6] Syncing with GitHub...
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
                git push 2>nul
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
        echo [INFO] No git repo found. Run githubrepo.bat to initialize.
    )
) else (
    echo [SKIP] Git not installed
)
echo.

:: ─── Step 5: Build Check ─────────────────────────────────────
echo [5/6] Quick build check...
pnpm turbo build --filter=@markov/web 2>nul
if errorlevel 1 (
    echo [WARN] Build had warnings (non-fatal)
) else (
    echo [OK] Build OK
)
echo.

:: ─── Step 6: Start Dev Server ─────────────────────────────────
echo [6/6] Starting development servers...
echo.
echo  ┌─────────────────────────────────────────┐
echo  │  Web:     http://localhost:3000          │
echo  │  Demo:    http://localhost:3000/demo     │
echo  │  API:     http://localhost:3000/api/v1/  │
echo  │  Worker:  http://localhost:3001          │
echo  └─────────────────────────────────────────┘
echo.
echo  Press Ctrl+C to stop all servers
echo.

pnpm turbo dev
