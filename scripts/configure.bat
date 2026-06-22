@echo off
echo ==========================================
echo   Markov v3 - Configuration Setup
echo ==========================================
echo.

:: Check for required tools
echo [1/5] Checking prerequisites...

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing pnpm...
    npm install -g pnpm
)

where supabase >nul 2>&1
if errorlevel 1 (
    echo [WARN] Supabase CLI not found. Install from https://supabase.com/docs/guides/cli
)

echo [OK] Prerequisites checked

:: Install dependencies
echo.
echo [2/5] Installing dependencies...
pnpm install
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [OK] Dependencies installed

:: Generate encryption key
echo.
echo [3/5] Generating field encryption key...
for /f "tokens=*" %%i in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set FIELD_KEY=%%i
echo FIELD_ENCRYPTION_KEY=%FIELD_KEY%

:: Create .env.local from example
echo.
echo [4/5] Creating .env.local...
if not exist ".env.local" (
    copy .env.local.example .env.local
    echo [OK] .env.local created — edit with your API keys
) else (
    echo [OK] .env.local already exists
)

:: Set encryption key in .env.local
echo.
echo [4.5/5] Setting FIELD_ENCRYPTION_KEY...
node -e "const fs=require('fs');let c=fs.readFileSync('.env.local','utf8');c=c.replace(/FIELD_ENCRYPTION_KEY=.*/,'FIELD_ENCRYPTION_KEY=%FIELD_KEY%');fs.writeFileSync('.env.local',c)"
echo [OK] FIELD_ENCRYPTION_KEY set

:: Start Supabase
echo.
echo [5/5] Starting Supabase local instance...
where supabase >nul 2>&1
if not errorlevel 1 (
    supabase start
    supabase db push
    echo [OK] Supabase running
) else (
    echo [SKIP] Supabase CLI not found — configure remote Supabase in .env.local
)

echo.
echo ==========================================
echo   Configuration complete!
echo ==========================================
echo.
echo Next steps:
echo   1. Edit .env.local with your API keys
echo   2. Run: pnpm dev
echo.
pause
