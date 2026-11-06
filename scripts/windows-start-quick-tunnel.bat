@echo off
chcp 65001 >nul
title Cloudflare Quick Tunnel (TryCloudflare - Free HTTPS)
cd /d "%~dp0.."

echo ================================================================
echo  กำลังเปิด Cloudflare Quick Tunnel ^(ฟรี 100%% ไม่ต้องใช้โดเมน^)
echo  หมายเหตุสำคัญ:
echo  - เมื่อได้ลิงก์ https://xxxx.trycloudflare.com บนหน้าจอนี้
echo  - ให้นำลิงก์ไปตั้งค่าใน LINE Developers Console ช่อง Webhook URL:
echo    https://xxxx.trycloudflare.com/api/line/webhook
echo  - หากปิดหน้าต่างนี้หรือเครื่อง Restart ลิงก์จะเปลี่ยนใหม่
echo ================================================================

where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] ไม่พบโปรแกรม cloudflared บนเครื่องนี้
    echo กรุณาติดตั้งด้วยคำสั่งใน PowerShell: winget install --id Cloudflare.cloudflared
    pause
    exit /b 1
)

cloudflared tunnel --url http://127.0.0.1:3000
pause

