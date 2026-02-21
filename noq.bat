@echo off
title NO-Q Development Launcher

echo Starting NO-Q Backend...
start cmd /k "cd backend && python app.py"

timeout /t 3 > nul

echo Starting NO-Q Frontend...
start cmd /k "cd frontend && python -m http.server 5500"

timeout /t 2 > nul

echo Opening browser...
start http://localhost:5500/public/index.html

echo.
echo NO-Q is now running.
pause