@echo off
chcp 65001 >nul
title LINE OA File Storage Server
cd /d "%~dp0.."

:loop
echo [%date% %time%] กำลังเริ่มทำงาน LINE OA File Storage Server...
call npm start
echo [%date% %time%] โปรเซส Server หยุดทำงาน กำลังเริ่มใหม่อัตโนมัติใน 5 วินาที...
timeout /t 5 /nobreak >nul
goto loop

