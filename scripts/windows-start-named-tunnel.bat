@echo off
chcp 65001 >nul
title Cloudflare Named Tunnel (Permanent HTTPS Domain)
cd /d "%~dp0.."

echo ================================================================
echo  กำลังเปิด Cloudflare Named Tunnel ^(สำหรับผู้ที่มี Custom Domain^)
echo ================================================================

if "%~1"=="" (
    echo กรุณาระบุชื่อ Tunnel หรือ Tunnel Token ในการรัน หรือติดตั้งเป็น Windows Service ด้วย:
    echo   cloudflared service install ^<YOUR_TUNNEL_TOKEN^>
    pause
    exit /b 1
)

cloudflared tunnel run %1
pause

