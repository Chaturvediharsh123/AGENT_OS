@echo off
cd /d "%~dp0"
title AgentOS
where py >nul 2>nul && (set PY=py -3) || (set PY=python)
%PY% --version >nul 2>nul || (echo Python not found. Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH". & pause & exit /b 1)
set AGENTOS_PORT=8080
start "" http://localhost:8080
%PY% server.py
echo.
echo AgentOS stopped. If you saw an error above, copy it and send it to Claude.
pause
