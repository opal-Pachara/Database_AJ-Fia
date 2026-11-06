# คู่มือการติดตั้งและเปิดใช้งานระบบบน Windows 10 / 11 (INSTALLATION GUIDE)

คู่มือนี้อธิบายขั้นตอนการติดตั้งและเปิดใช้งานระบบบนคอมพิวเตอร์ **Windows 10 หรือ Windows 11** แบบทีละขั้นตอน (Step-by-Step) โดยไม่ต้องมีความรู้ด้าน DevOps ขั้นสูง

---

## 1. สิ่งที่ต้องเตรียมบนเครื่อง Windows 10/11

1. **ติดตั้ง Node.js (เวอร์ชัน 22.5 ขึ้นไป หรือ v24 LTS):**
   - ดาวน์โหลดตัวติดตั้งสำหรับ Windows (.msi) ได้จากเว็บไซต์ทางการ: https://nodejs.org/
   - กด Next จนเสร็จสิ้น แล้วเปิดโปรแกรม **Command Prompt (cmd)** หรือ **PowerShell** พิมพ์คำสั่งต่อไปนี้เพื่อตรวจสอบ:
     ```bat
     node -v
     npm -v
     ```
2. **ติดตั้ง Cloudflare Tunnel (`cloudflared`):**
   - เปิด **PowerShell** แล้วรันคำสั่ง:
     ```powershell
     winget install --id Cloudflare.cloudflared
     ```
   - (รายละเอียดการตั้งค่า Tunnel ดูเพิ่มเติมในไฟล์ [CLOUDFLARE_TUNNEL_SETUP.md](./CLOUDFLARE_TUNNEL_SETUP.md))

---

## 2. ขั้นตอนการติดตั้งโปรเจกต์

1. วางโฟลเดอร์โปรเจกต์นี้ไว้ในเครื่อง เช่น `C:\Apps\Database-AJ_Fia`
2. ดับเบิลคลิกไฟล์ **`scripts\windows-install.bat`**
   - สคริปต์จะทำการติดตั้งไลบรารี (`npm install`), สร้างหน้าเว็บไซต์ (`npm run build`) และสร้างไฟล์ `.env` เริ่มต้นให้โดยอัตโนมัติ

---

## 3. การตั้งค่าไฟล์ `.env`

เปิดไฟล์ `.env` ในโฟลเดอร์หลักของโปรเจกต์ด้วยโปรแกรม **Notepad** แล้วตรวจสอบ/แก้ไขค่าสำคัญดังนี้:

```env
# พอร์ตของระบบภายในเครื่อง
PORT=3000
HOST=127.0.0.1

# โฟลเดอร์สำหรับเก็บไฟล์และฐานข้อมูลจริง (หากเครื่องไม่มี Drive D: ให้เปลี่ยนเป็น C:\LINE_FILE_STORAGE)
STORAGE_ROOT_PATH=D:\LINE_FILE_STORAGE

# รหัสผู้ดูแลระบบเริ่มต้น (เมื่อ Login ครั้งแรก ระบบจะบังคับให้ตั้งรหัสผ่านใหม่ทันที)
INITIAL_ADMIN_USER_ID=admin
INITIAL_ADMIN_NAME=อาจารย์ผู้ดูแลระบบ
INITIAL_ADMIN_PASSWORD=ChangeMe_Initial_Admin_123!

# คีย์ลับสำหรับเข้ารหัส Session (เปลี่ยนเป็นข้อความสุ่มยาวๆ ของคุณเอง)
SESSION_SECRET=put_your_own_long_random_secret_string_here_at_least_32_chars

# ค่าจาก LINE Developers Console (ดูวิธีนำค่ามาใส่ใน LINE_OA_SETUP.md)
LINE_CHANNEL_SECRET=ใส่ค่า_Channel_Secret_จาก_LINE
LINE_CHANNEL_ACCESS_TOKEN=ใส่ค่า_Channel_Access_Token_จาก_LINE

# (ทางเลือก) ระบุ LINE userId ของอาจารย์เพื่อให้รับไฟล์จากอาจารย์คนเดียวเท่านั้น
ALLOWED_SENDER_LINE_USER_ID=
```

---

## 4. การเปิดใช้งานระบบ

1. ดับเบิลคลิกไฟล์ **`scripts\windows-start-server.bat`**
   - หน้าต่างโปรแกรมจะแสดงข้อความว่า Server พร้อมทำงานที่ `http://127.0.0.1:3000`
   - หากรันบนเครื่องเดียวกัน สามารถเปิดเบราว์เซอร์เข้าที่ `http://localhost:3000` เพื่อเข้าสู่หน้าเว็บและ Login ด้วยบัญชี Admin เริ่มต้นได้ทันที
2. เปิดใช้งาน HTTPS เพื่อให้เข้าถึงจากอินเทอร์เน็ตและรับ Webhook จาก LINE OA:
   - **กรณีใช้โหมดฟรีแบบไม่มีโดเมน (Quick Tunnel):** ดับเบิลคลิกไฟล์ **`scripts\windows-start-quick-tunnel.bat`**
   - **กรณีมีโดเมนส่วนตัว (Named Tunnel):** ดูขั้นตอนใน [CLOUDFLARE_TUNNEL_SETUP.md](./CLOUDFLARE_TUNNEL_SETUP.md)

---

## 5. การตั้งค่าให้เครื่องทำงานต่อเนื่อง 24/7 และเปิดระบบอัตโนมัติเมื่อเครื่อง Restart

1. **ป้องกันไม่ให้ Windows เข้าโหมด Sleep:**
   - ไปที่ **Settings -> System -> Power & sleep**
   - ตั้งค่า **Sleep** (When plugged in) เป็น **Never (ไม่เคยหลับ)** (ส่วนหน้าจอ Screen สามารถตั้งให้ดับเพื่อประหยัดไฟได้ตามปกติ)
2. **ตั้งค่าให้ระบบเปิดตัวเองอัตโนมัติเมื่อเครื่อง Windows Restart:**
   - คลิกขวาที่ปุ่ม Start เลือก **Terminal (Admin)** หรือ **PowerShell (Run as Administrator)**
   - รันคำสั่งต่อไปนี้:
     ```powershell
     Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
     cd C:\path\to\Database-AJ_Fia\scripts
     .\windows-register-autostart.ps1
     ```
   - ระบบจะสร้าง Task ใน **Windows Task Scheduler** ชื่อ `LineOA_FileStorage_Server_AutoStart` ซึ่งจะเปิด Server ขึ้นมาทำงานโดยอัตโนมัติทุกครั้งที่เครื่องเปิดใหม่

