@echo off
cd /d "%~dp0"
echo Abrindo ALYS Pool Manager em http://localhost:8000
start "" "http://localhost:8000"
py -m http.server 8000
if errorlevel 1 (
 echo Python nao encontrado. Voce pode abrir o arquivo index.html diretamente no navegador.
 pause
)
