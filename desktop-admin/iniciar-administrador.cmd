@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Necesitas Node.js 22 o superior instalado en Windows.
  echo https://nodejs.org/
  pause
  exit /b 1
)
if not defined GOOGLE_APPLICATION_CREDENTIALS (
  set "GOOGLE_APPLICATION_CREDENTIALS=%APPDATA%\HojaFinanciera\service-account.json"
)
if not exist "%GOOGLE_APPLICATION_CREDENTIALS%" (
  echo.
  echo Falta el archivo privado de Firebase:
  echo "%GOOGLE_APPLICATION_CREDENTIALS%"
  echo Crea la carpeta %%APPDATA%%\HojaFinanciera y coloca alli service-account.json.
  echo Consulta INSTRUCCIONES.md. NO subas ese JSON a GitHub.
  pause
  exit /b 1
)
if not exist "node_modules\firebase-admin" (
  echo Instalando dependencias de la aplicacion local...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)
node server.mjs
echo Administrador detenido.
pause
