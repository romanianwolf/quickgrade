@echo off
echo ==========================================
echo   Markov v3 - Development Server
echo ==========================================
echo.

:: Check if configured
if not exist ".env.local" (
    echo [ERROR] .env.local not found. Run configure.bat first.
    pause
    exit /b 1
)

:: Start development servers
echo Starting Next.js + Worker...
echo.
echo   Web:    http://localhost:3000
echo   Worker: http://localhost:3001
echo   API:    http://localhost:3000/api/v1/health
echo.
echo Press Ctrl+C to stop all servers.
echo.

pnpm turbo dev
