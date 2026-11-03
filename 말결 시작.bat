@echo off
chcp 65001 >nul
cd /d "%~dp0"
node server.js
if errorlevel 1 (
  echo Node.js가 설치되어 있는지 확인해주세요.
  pause
)
