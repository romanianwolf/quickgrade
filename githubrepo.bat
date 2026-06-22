@echo off
echo ==========================================
echo   Markov - Push to GitHub
echo ==========================================
echo.

:: Check if git is installed
where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git not found. Install from https://git-scm.com
    pause
    exit /b 1
)

:: Check if .gitignore exists
if not exist ".gitignore" (
    echo [ERROR] .gitignore not found. Are you in the markov folder?
    pause
    exit /b 1
)

:: Check if repo is initialized
if not exist ".git" (
    echo [1/4] Initializing git repo...
    git init
    git branch -M main
) else (
    echo [1/4] Git repo found.
)

:: Check for remote
git remote -v | findstr "origin" >nul 2>&1
if errorlevel 1 (
    echo.
    echo No remote configured. Enter your GitHub repo URL:
    echo Example: https://github.com/username/markov.git
    set /p REMOTE_URL="URL: "
    git remote add origin %REMOTE_URL%
    echo [OK] Remote added.
)

:: Stage all files (respecting .gitignore)
echo.
echo [2/4] Staging files...
git add -A
echo [OK] Files staged.

:: Show status
echo.
echo [3/4] Current status:
git status --short

:: Commit
echo.
set /p COMMIT_MSG="Commit message (or press Enter for 'Update'): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Update
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo [WARN] Nothing to commit or commit failed.
) else (
    echo [OK] Committed.
)

:: Push
echo.
echo [4/4] Pushing to GitHub...
git push -u origin main
if errorlevel 1 (
    echo [ERROR] Push failed. Check your remote URL and credentials.
    echo Try: git push -u origin main --force
) else (
    echo [OK] Pushed successfully!
)

echo.
echo ==========================================
echo   Done!
echo ==========================================
echo.
pause
