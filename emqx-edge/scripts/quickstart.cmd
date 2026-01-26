@echo off
REM EMQX Edge Quickstart Script
REM Starts the broker and runs a quick test to verify it's working

echo.
echo ========================================
echo   EMQX Edge Quickstart
echo ========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop.
    exit /b 1
)

echo [1/4] Starting EMQX Edge...
cd /d "%~dp0.."
docker-compose up -d

if errorlevel 1 (
    echo [ERROR] Failed to start EMQX Edge.
    exit /b 1
)

echo [2/4] Waiting for broker to be ready...
timeout /t 5 /nobreak >nul

REM Check if the container is healthy
docker-compose ps | findstr "emqx-edge" | findstr "Up" >nul
if errorlevel 1 (
    echo [ERROR] EMQX Edge container is not running.
    echo Run 'docker-compose logs emqx-edge' to see what went wrong.
    exit /b 1
)

echo [3/4] Checking dashboard...
curl -s -o nul -w "%%{http_code}" http://localhost:8081 | findstr "200" >nul
if errorlevel 1 (
    echo [WARN] Dashboard not responding yet. It may take a few more seconds.
) else (
    echo       Dashboard is ready at http://localhost:8081
)

echo [4/4] Testing MQTT port...
powershell -Command "Test-NetConnection localhost -Port 1883 -WarningAction SilentlyContinue | Select-Object -ExpandProperty TcpTestSucceeded" | findstr "True" >nul
if errorlevel 1 (
    echo [WARN] MQTT port 1883 not responding yet.
) else (
    echo       MQTT is ready on port 1883
)

echo.
echo ========================================
echo   EMQX Edge is running!
echo ========================================
echo.
echo   Dashboard:  http://localhost:8081
echo   Username:   admin
echo   Password:   public
echo.
echo   MQTT:       mqtt://localhost:1883
echo   WebSocket:  ws://localhost:8083/mqtt
echo.
echo   To stop:    docker-compose down
echo   Logs:       docker-compose logs -f
echo.
