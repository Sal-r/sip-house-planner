@echo off
setlocal
cd /d "%~dp0"

rem ------------------------------------------------------------------
rem Optional: if your conda Python lives somewhere unusual, paste its
rem full path below (in Anaconda Prompt, run:  where python ).
rem Example: set "CONDA_PY=C:\Users\YourName\anaconda3\python.exe"
set "CONDA_PY="
rem ------------------------------------------------------------------

rem Find the folder that holds the planner (dist\ or this folder)
set "SITE_DIR="
if exist "dist\index.html" set "SITE_DIR=dist"
if not defined SITE_DIR if exist "index.html" set "SITE_DIR=."
if not defined SITE_DIR (
  echo Could not find index.html here or in a "dist" subfolder.
  echo Make sure the planner files are extracted next to this .bat file.
  pause
  exit /b 1
)

rem Find Python: manual path first, then common conda installs, then the py launcher
set "PY_CMD="
if defined CONDA_PY if exist "%CONDA_PY%" set PY_CMD="%CONDA_PY%"
for %%D in (
  "%USERPROFILE%\anaconda3"
  "%USERPROFILE%\miniconda3"
  "%USERPROFILE%\miniforge3"
  "%LOCALAPPDATA%\anaconda3"
  "%LOCALAPPDATA%\miniconda3"
  "%ProgramData%\anaconda3"
  "%ProgramData%\miniconda3"
  "C:\anaconda3"
  "C:\miniconda3"
) do (
  if not defined PY_CMD if exist "%%~D\python.exe" set PY_CMD="%%~D\python.exe"
)
if not defined PY_CMD (
  where py >nul 2>nul
  if not errorlevel 1 set "PY_CMD=py -3"
)
if not defined PY_CMD (
  echo Could not find conda's Python.
  echo Open Anaconda Prompt, run:  where python
  echo then paste that path into the CONDA_PY line near the top of this file.
  pause
  exit /b 1
)

echo Using %PY_CMD%

rem Serve only to this PC (127.0.0.1), not to other devices on the network
start "SIP House Planner" cmd /k "%PY_CMD% -m http.server 8000 --bind 127.0.0.1 --directory %SITE_DIR%"
timeout /t 3 >nul
start "" "http://127.0.0.1:8000"
