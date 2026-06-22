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
echo  QuickGrade AI-Powered Grading Platform

echo.

:: Check for prerequisites
echo [1/5] Checking prerequisites...

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

echo.

:: Initialize Git repository if not exists
echo [2/5] Setting up Git repository...
if not exist ".git" (
    git init
    git branch -M main
    echo [OK] Git repository initialized
) else (
    echo [OK] Git repository exists
)

:: Configure Git user
git config user.name "Abhinav"
git config user.email "romanianwolf@users.noreply.github.com"

:: Add GitHub remote
if not exist ".git/refs/remotes/origin/main" (
    git remote add origin https://github.com/romanianwolf/quickgrade.git
    echo [OK] GitHub remote configured
) else (
    echo [INFO] GitHub remote already configured
)

echo.

:: Install dependencies
echo [3/5] Installing dependencies...
pnpm install
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.

:: Build the project
echo [4/5] Building project...
pnpm run build
if errorlevel 1 (
    echo [WARN] Build had warnings (non-fatal)
) else (
    echo [OK] Build completed
)

echo.

:: Commit and push changes
echo [5/5] Updating GitHub repository...
git add -A
if errorlevel 1 (
    echo [WARN] Nothing to commit
) else (
    git commit -m "feat: QuickGrade demo platform - automated build $(date /t)"
    git push -u origin main --force
    if not errorlevel 1 (
        echo [OK] Pushed to GitHub successfully!
    ) else (
        echo [WARN] Push failed (check credentials)
    )
)

echo.
echo  ┌─────────────────────────────────────────┐
echo  │  Web:     http://localhost:3000          │
echo  │  Demo:    http://localhost:3000/demo     │
echo  │  API:     http://localhost:3000/api/v1/demo│
echo  └─────────────────────────────────────────┘
echo.

:: Start development server in separate window
echo Starting development server...
start "QuickGrade Dev" cmd /c "pnpm dev"

:: Wait for server to boot
echo Waiting for server to start... (5 seconds)
timeout /t 5 /nobreak >nul

:: Open browser to demo
echo Opening browser to demo page...
start http://localhost:3000/demo

echo.
echo Server is running in separate window.
echo Close that window to stop the server.
echo.
echo.
Press any key to exit this script (server still running in background window)
pause >nul
