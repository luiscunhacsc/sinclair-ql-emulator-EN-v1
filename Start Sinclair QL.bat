@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto missing_node

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 20 || (major === 20 && minor >= 12) ? 0 : 1)" >nul 2>&1
if errorlevel 1 goto old_node

echo Using Node.js:
node --version
echo.
node scripts\serve.mjs
if errorlevel 1 (
  echo.
  echo The emulator stopped because the server reported an error.
  pause
)
exit /b

:missing_node
echo Node.js 20.12 or later is required to run the emulator.
echo Install it from https://nodejs.org/ and then double-click this file again.
pause
exit /b 1

:old_node
echo This emulator needs Node.js 20.12 or later.
echo Update Node.js from https://nodejs.org/ and then try again.
node --version
pause
exit /b 1
