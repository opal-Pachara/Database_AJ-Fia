@echo off
chcp 65001 >nul
echo ================================================================
echo  ขั้นตอนติดตั้งระบบรับฝากและดาวน์โหลดไฟล์ผ่าน LINE OA (Windows 10/11)
echo ================================================================

cd /d "%~dp0.."

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] ไม่พบโปรแกรม Node.js บนเครื่องนี้
    echo กรุณาดาวน์โหลดและติดตั้ง Node.js ^(v22.5 ขึ้นไป หรือ v24 LTS^) จาก https://nodejs.org/
    pause
    exit /b 1
)

echo [1/3] กำลังติดตั้ง Dependencies ^(npm install^)...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] การติดตั้ง Dependencies ล้มเหลว
    pause
    exit /b 1
)

echo [2/3] กำลัง Build หน้าเว็บไซต์ Frontend ^(npm run build^)...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] การ Build Frontend ล้มเหลว
    pause
    exit /b 1
)

if not exist ".env" (
    echo [3/3] กำลังสร้างไฟล์ .env จาก .env.example...
    copy ".env.example" ".env" >nul
    echo สร้างไฟล์ .env เรียบร้อยแล้ว! กรุณาเปิดไฟล์ .env ด้วย Notepad เพื่อใส่ค่า LINE_CHANNEL_SECRET และ LINE_CHANNEL_ACCESS_TOKEN
) else (
    echo [3/3] พบไฟล์ .env อยู่แล้ว ^(ไม่เขียนทับไฟล์เดิม^)
)

echo ================================================================
echo  ติดตั้งเสร็จสมบูรณ์!
echo  ขั้นตอนถัดไป:
echo  1. แก้ไขไฟล์ .env เพื่อใส่ค่า LINE_CHANNEL_SECRET และ LINE_CHANNEL_ACCESS_TOKEN
echo  2. ดับเบิลคลิก scripts\windows-start-server.bat เพื่อเปิด Server
echo  3. ดับเบิลคลิก scripts\windows-start-quick-tunnel.bat เพื่อเปิด HTTPS URL
echo ================================================================
pause

