@echo off
echo ==========================================
echo   Markov v3 - Health Check
echo ==========================================
echo.

echo Checking API health...
curl -s http://localhost:3000/api/v1/health | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);console.log('Status:',j.status);Object.entries(j.checks).forEach(([k,v])=>console.log('  '+k+':',v.status,v.latencyMs? '('+v.latencyMs+'ms)':''))}catch{console.log('API not responding')}})"
echo.

echo Checking database...
where supabase >nul 2>&1
if not errorlevel 1 (
    supabase status
) else (
    echo [SKIP] Supabase CLI not available
)

echo.
echo Health check complete.
pause
