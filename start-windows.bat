@echo off
chcp 65001 >nul
title المثلث - نظام عيادة الأطفال
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js غير مثبت. حمله من https://nodejs.org ثم أعد التشغيل.
  pause
  exit /b 1
)
node server.js
pause
