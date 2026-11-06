# คู่มือการนำไปติดตั้งและใช้งานจริงฉบับสมบูรณ์ (COMPLETE DEPLOYMENT MASTER GUIDE)
**ระบบรับฝากไฟล์ผ่าน LINE OA และให้ผู้ใช้งานดาวน์โหลดผ่านเว็บไซต์ (สำหรับ Windows 10 / Windows 11)**

เอกสารฉบับนี้เป็น **คู่มือรวมครบจบในไฟล์เดียว (All-in-One Master Guide)** ที่ครอบคลุมครบทุกส่วน ตั้งแต่:
1. การเตรียมเครื่องคอมพิวเตอร์ Windows 10/11
2. การติดตั้งโปรแกรมและเตรียม **Database (ฐานข้อมูล SQLite)** พร้อมวิธีเปิดดูข้อมูลในฐานข้อมูล
3. **การสร้างบัญชี LINE Official Account (LINE OA) ตั้งแต่ศูนย์** และการเชื่อมต่อ **LINE Messaging API (Webhook API, Content API, Reply API)**
4. **รายละเอียด API ทั้งหมดของระบบ (Backend REST API & Database Mapping)**
5. การเปิดรัน Server และการ **Publish Link (`https://...`)** ออกสู่อินเทอร์เน็ตให้คนอื่นเข้าใช้งานได้จริง

---

## สารบัญ (Table of Contents)

1. [ส่วนที่ 1: การเตรียมความพร้อมของเครื่องคอมพิวเตอร์ Windows 10/11](#ส่วนที่-1-การเตรียมความพร้อมของเครื่องคอมพิวเตอร์-windows-1011)
2. [ส่วนที่ 2: การติดตั้งโปรแกรมพื้นฐานที่จำเป็นบนเครื่อง Server](#ส่วนที่-2-การติดตั้งโปรแกรมพื้นฐานที่จำเป็นบนเครื่อง-server)
3. [ส่วนที่ 3: การนำโปรเจกต์ลงเครื่องและการเตรียมฐานข้อมูล (Database Setup & Inspection)](#ส่วนที่-3-การนำโปรเจกต์ลงเครื่องและการเตรียมฐานข้อมูล-database-setup--inspection)
4. [ส่วนที่ 4: การสร้าง LINE OA ตั้งแต่ศูนย์ และการเชื่อมต่อ LINE Messaging API](#ส่วนที่-4-การสร้าง-line-oa-ตั้งแต่ศูนย์-และการเชื่อมต่อ-line-messaging-api)
5. [ส่วนที่ 5: การตั้งค่าไฟล์ `.env` เพื่อเชื่อม LINE API และ Database](#ส่วนที่-5-การตั้งค่าไฟล์-env-เพื่อเชื่อม-line-api-และ-database)
6. [ส่วนที่ 6: การเปิดรันระบบและการ Publish Link ออกสู่อินเทอร์เน็ตให้คนอื่นใช้งาน](#ส่วนที่-6-การเปิดรันระบบและการ-publish-link-ออกสู่อินเทอร์เน็ตให้คนอื่นใช้งาน)
   - [วิธีที่ 6.1: แบบฟรี 100% ไม่ต้องมีโดเมน (Cloudflare Quick Tunnel)](#วิธีที่-61-แบบฟรี-100-ไม่ต้องมีโดเมน-cloudflare-quick-tunnel)
   - [วิธีที่ 6.2: แบบลิงก์ถาวรไม่เปลี่ยนเมื่อเครื่องรีสตาร์ท (Cloudflare Named Tunnel)](#วิธีที่-62-แบบลิงก์ถาวรไม่เปลี่ยนเมื่อเครื่องรีสตาร์ท-cloudflare-named-tunnel)
   - [วิธีที่ 6.3: การผูก Webhook URL เข้ากับ LINE Developers Console และการล็อกผู้ส่ง](#63-ขั้นตอนนำลิงก์ที่-publish-แล้วไปผูกกับ-line-webhook-api)
7. [ส่วนที่ 7: รายละเอียดการเชื่อมต่อ API และ Database ทั้งหมดของระบบ (API & Database Reference)](#ส่วนที่-7-รายละเอียดการเชื่อมต่อ-api-และ-database-ทั้งหมดของระบบ-api--database-reference)
8. [ส่วนที่ 8: การตั้งค่าให้ระบบเปิดตัวเองอัตโนมัติเมื่อเครื่อง Restart (24/7 Operation)](#ส่วนที่-8-การตั้งค่าให้ระบบเปิดตัวเองอัตโนมัติเมื่อเครื่อง-restart-247-operation)
9. [ส่วนที่ 9: ขั้นตอนการทดสอบระบบหลังติดตั้งเสร็จ (Go-Live Checklist)](#ส่วนที่-9-ขั้นตอนการทดสอบระบบหลังติดตั้งเสร็จ-go-live-checklist)
10. [ส่วนที่ 10: การดูแลรักษาระบบ การสำรองข้อมูล (Backup) และการกู้คืน (Restore)](#ส่วนที่-10-การดูแลรักษาระบบ-การสำรองข้อมูล-backup-และการกู้คืน-restore)

---

# ส่วนที่ 1: การเตรียมความพร้อมของเครื่องคอมพิวเตอร์ Windows 10/11

เครื่องคอมพิวเตอร์ที่จะทำหน้าที่เป็น Server เก็บฐานข้อมูลและไฟล์ควรเตรียมการดังนี้:

### 1.1 สเปกเครื่องและระบบปฏิบัติการ
- **ระบบปฏิบัติการ:** Windows 10 หรือ Windows 11 (64-bit)
- **RAM:** ขั้นต่ำ 4 GB (ตัวระบบนี้กิน RAM เพียงประมาณ 50–80 MB เท่านั้น จึงสามารถใช้งานคอมพิวเตอร์ทำงานอื่นควบคู่ไปด้วยได้สบาย)
- **พื้นที่ว่างในฮาร์ดดิสก์ (SSD/HDD):** แนะนำให้มีพื้นที่ว่างอย่างน้อย 20 GB ขึ้นไป (ขึ้นอยู่กับปริมาณไฟล์ที่อาจารย์จะส่งเข้ามาสะสม)
- **อินเทอร์เน็ต:** เชื่อมต่อ Wi-Fi หรือสาย LAN ที่สามารถออกอินเทอร์เน็ตได้ปกติ (**แนะนำสาย LAN** เพื่อความเสถียรสูงสุดในการเปิด 24 ชั่วโมง และ **ไม่ต้องทำ Port Forwarding ที่ Router**)

### 1.2 การตั้งค่าไม่ให้เครื่องหลับ (Disable Sleep Mode) — สำคัญมาก!
หากคอมพิวเตอร์เข้าสู่โหมด Sleep ระบบเว็บและการรับไฟล์จาก LINE จะหยุดชั่วคราวจนกว่าจะขยับเมาส์ปลุกเครื่อง ดังนั้นต้องตั้งค่าดังนี้:
1. กดปุ่ม **Start** -> ไปที่ **Settings (รูปเฟือง)** -> เลือก **System** -> เลือก **Power & sleep** (หรือ **Power & battery** บน Windows 11)
2. ในหัวข้อ **Screen (หน้าจอ):** สามารถตั้งให้ดับหน้าจอเมื่อไม่ได้ใช้งาน เช่น `10 minutes` หรือ `15 minutes` ได้ตามปกติเพื่อประหยัดไฟและถนอมจอ
3. ในหัวข้อ **Sleep (การหลับของเครื่อง):** ตั้งค่า **When plugged in, put my device to sleep after** เป็น **`Never` (ไม่เคย)**
4. *(สำหรับโน้ตบุ๊ก)* หากต้องการพับฝาโน้ตบุ๊กแล้วยังให้ระบบทำงานต่อ:
   - เปิด **Control Panel** -> **Hardware and Sound** -> **Power Options** -> คลิก **Choose what closing the lid does** ทางซ้ายมือ
   - ที่หัวข้อ **When I close the lid (Plugged in)** ให้เลือกเป็น **`Do nothing`** แล้วกด **Save changes**

---

# ส่วนที่ 2: การติดตั้งโปรแกรมพื้นฐานที่จำเป็นบนเครื่อง Server

เครื่อง Windows ที่จะนำไปติดตั้งต้องลงโปรแกรมฟรีเพียง **2 ตัว** เท่านั้น (ทำครั้งเดียว):

### 2.1 ติดตั้ง Node.js (สำหรับรันระบบ Backend API, Frontend และฐานข้อมูล SQLite)
> **สำคัญ:** ระบบใช้โมดูลฐานข้อมูล SQLite ที่ฝังมาในตัว Node.js (`node:sqlite`) จึง **ต้องใช้ Node.js เวอร์ชัน 22.5.0 ขึ้นไป** (แนะนำเวอร์ชัน **v22 LTS ล่าสุด** หรือ **v24 LTS**)

1. เปิดเว็บเบราว์เซอร์ เข้าไปที่เว็บไซต์ทางการ: **https://nodejs.org/**
2. ดาวน์โหลดตัวติดตั้งสำหรับ Windows (`.msi` 64-bit)
3. ดับเบิลคลิกไฟล์ที่ดาวน์โหลดมา แล้วกด **Next -> ยอมรับเงื่อนไข -> Next -> Install -> Finish** ตามค่าเริ่มต้นทั้งหมด
4. **ตรวจสอบการติดตั้ง:**
   - กดปุ่ม `Windows + R` พิมพ์ `cmd` แล้วกด Enter
   - พิมพ์คำสั่งต่อไปนี้แล้วกด Enter:
     ```bat
     node -v
     npm -v
     ```
   - หากขึ้นเลขเวอร์ชัน (เช่น `v22.x.x` หรือ `v24.x.x`) แสดงว่าติดตั้งสำเร็จแล้ว

### 2.2 ติดตั้ง Cloudflare Tunnel (`cloudflared`) สำหรับทำลิงก์ HTTPS ออกสู่อินเทอร์เน็ต
1. คลิกขวาที่ปุ่ม **Start** เลือก **PowerShell (Admin)** หรือ **Terminal (Admin)**
2. พิมพ์คำสั่งต่อไปนี้แล้วกด Enter:
   ```powershell
   winget install --id Cloudflare.cloudflared
   ```
   *(หากระบบถาม `Do you agree to all the source agreements terms?` ให้พิมพ์ `Y` แล้วกด Enter)*
3. เมื่อติดตั้งเสร็จ ให้ **ปิดหน้าต่าง PowerShell แล้วเปิดใหม่** จากนั้นทดสอบโดยพิมพ์:
   ```powershell
   cloudflared --version
   ```
   หากแสดงเลขเวอร์ชัน เช่น `cloudflared version 2026.x.x` แสดงว่าพร้อมใช้งานแล้ว

---

# ส่วนที่ 3: การนำโปรเจกต์ลงเครื่องและการเตรียมฐานข้อมูล (Database Setup & Inspection)

### 3.1 การวางโฟลเดอร์โปรเจกต์และการรันสคริปต์ติดตั้ง
1. คัดลอกโฟลเดอร์โปรเจกต์ `Database-AJ_Fia` ไปวางไว้ในตำแหน่งถาวรบนเครื่อง Windows เช่น `C:\Apps\Database-AJ_Fia`
2. เปิดเข้าไปในโฟลเดอร์ `Database-AJ_Fia\scripts`
3. ดับเบิลคลิกไฟล์ **`windows-install.bat`**
   - สคริปต์จะดำเนินการ 3 ขั้นตอนโดยอัตโนมัติ:
     1. ติดตั้งไลบรารีทั้งหมด (`npm install`)
     2. คอมไพล์หน้าเว็บไซต์ (`npm run build`)
     3. สร้างไฟล์ `.env` เริ่มต้นจาก `.env.example`

### 3.2 การเตรียมและสร้างฐานข้อมูล (Database) อัตโนมัติ
คุณ **ไม่ต้องติดตั้งโปรแกรมฐานข้อมูลแยก (เช่น MySQL, PostgreSQL, SQL Server หรือ XAMPP) เลยแม้แต่ตัวเดียว!** เพราะระบบใช้ **SQLite 3 (โหมด WAL - Write-Ahead Logging)** ที่ทำงานร่วมกับ Backend โดยตรง:

1. **สร้างไฟล์ฐานข้อมูลและตารางทั้งหมดอัตโนมัติ:**
   - ทันทีที่รัน Server ครั้งแรก โค้ดใน `src/server/db/schema.ts` และ `src/server/db/seed.ts` จะทำการ:
     - สร้างโฟลเดอร์ `D:\LINE_FILE_STORAGE\` (หรือ `C:\LINE_FILE_STORAGE\` หากเครื่องไม่มีไดรฟ์ `D:`)
     - สร้างไฟล์ฐานข้อมูลจริงที่ **`D:\LINE_FILE_STORAGE\database\app.sqlite`**
     - สร้างตารางทั้ง **11 ตาราง** (`users`, `sessions`, `line_webhook_events`, `files`, `file_recipients`, `url_records`, `url_recipients`, `notification_groups`, `notifications`, `backup_logs`, `system_logs`) พร้อม Primary Key, Foreign Key และ Index ทั้งหมด
     - สร้างบัญชีผู้ดูแลระบบเริ่มต้น (`admin`) ที่เข้ารหัสรหัสผ่านด้วย **Argon2id** ลงในตาราง `users`
2. **โครงสร้างโฟลเดอร์ที่ระบบสร้างให้อัตโนมัติบนฮาร์ดดิสก์:**
   ```text
   D:\LINE_FILE_STORAGE\
   ├── storage\
   │   ├── private\        <-- เก็บไฟล์ส่วนตัวแยกตามรหัสนักศึกษา (เช่น 6501001\{uuid}.pdf)
   │   ├── public\         <-- เก็บไฟล์ส่วนกลาง (Public) ({uuid}.pdf)
   │   └── urls\           <-- เก็บข้อมูล Metadata JSON ของลิงก์ URL
   ├── database\
   │   └── app.sqlite      <-- ไฟล์ฐานข้อมูล SQLite หลักของระบบ
   ├── backups\            <-- เก็บชุดสำรองข้อมูลอัตโนมัติทุก 6 ชั่วโมง
   ├── logs\               <-- เก็บไฟล์บันทึกการทำงานรายวัน (system-YYYY-MM-DD.log)
   └── temp\               <-- พื้นที่พักไฟล์ระหว่างดาวน์โหลดจาก LINE Content API
   ```
3. **(ทางเลือก) หากต้องการเปิดดูตารางในไฟล์ฐานข้อมูล `app.sqlite` ด้วยตาตนเองบน Windows:**
   - สามารถดาวน์โหลดโปรแกรมฟรีชื่อ **DB Browser for SQLite** (https://sqlitebrowser.org/) มาเปิดไฟล์ `D:\LINE_FILE_STORAGE\database\app.sqlite` เพื่อดูข้อมูลในตารางทั้งหมดได้โดยตรง

---

# ส่วนที่ 4: การสร้าง LINE OA ตั้งแต่ศูนย์ และการเชื่อมต่อ LINE Messaging API

ส่วนนี้อธิบายตั้งแต่การสร้างบัญชี LINE Official Account (LINE OA) ไปจนถึงการเปิดใช้งาน API เพื่อให้บอทรับไฟล์จาก iPhone ของอาจารย์ได้

### 4.1 ขั้นตอนการสร้างบัญชี LINE Official Account (กรณีเริ่มจากศูนย์)
1. เปิดเว็บเบราว์เซอร์ไปที่ **LINE Business ID / LINE Official Account Manager**: https://manager.line.biz/
2. กดปุ่ม **เข้าสู่ระบบด้วยบัญชี LINE (Log in with LINE account)** แล้วล็อกอินด้วย LINE ส่วนตัวของอาจารย์หรือผู้ดูแล
3. กดปุ่ม **สร้างบัญชีทั่วไป (Create Line Official Account)**
4. กรอกข้อมูลที่จำเป็น:
   - **ชื่อบัญชี (Account Name):** เช่น `ระบบรับส่งไฟล์การเรียน - อ.เฟียร์`
   - **อีเมล (Email):** อีเมลของคุณ
   - **ประเภทธุรกิจ (Category):** เลือก `การศึกษา (Education)` -> `มหาวิทยาลัย / วิทยาลัย (Universities / Colleges)`
5. กด **ตกลง / ยืนยัน** จนได้บัญชี LINE OA ใหม่ (แพ็กเกจเริ่มต้นคือ **Free Plan 0 บาท/เดือน** ซึ่งใช้ **Reply API** ตอบกลับสถานะไฟล์ได้ **ฟรีและไม่จำกัดจำนวนครั้ง**)

### 4.2 ขั้นตอนการเปิดใช้งาน Messaging API ใน LINE OA
1. ในหน้าจัดการบัญชี LINE OA (https://manager.line.biz/) คลิกปุ่ม **ตั้งค่า (Settings)** รูปเฟืองที่มุมขวาบน
2. เมนูซ้ายมือ คลิกที่คำว่า **Messaging API**
3. กดปุ่มสีเขียว **ใช้ Messaging API (Enable Messaging API)**
4. ระบบจะให้เลือกหรือสร้าง **Provider (ผู้ให้บริการ)**:
   - เลือก **สร้างโพรไวเดอร์ใหม่ (Create new provider)** แล้วพิมพ์ชื่อภาษาอังกฤษ เช่น `AJFia_FilePortal` -> กด **ตกลง (Agree)**
   - หน้าถัดไปเกี่ยวกับนโยบายความเป็นส่วนตัว (Privacy Policy / Terms of Use) สามารถเว้นว่างไว้แล้วกด **ตกลง (OK)** ได้เลย
5. กดยืนยันจนหน้าจอแสดงสถานะว่าเปิดใช้งาน Messaging API แล้ว

### 4.3 ขั้นตอนการตั้งค่าโหมดการตอบกลับ (ปิดข้อความอัตโนมัติ & เปิด Webhook)
ยังอยู่ในหน้า **ตั้งค่า (Settings)** ของ LINE Official Account Manager:
1. เมนูซ้ายมือ คลิกที่ **การตั้งค่าการตอบกลับ (Response settings)**
2. ตั้งค่าตามนี้ให้ครบทุกข้อ:
   - **โหมดการตอบกลับ (Response mode):** เลือก `บอท (Bot)` หรือ `แชท (Chat)` ก็ได้
   - **ข้อความทักทายเพื่อนใหม่ (Greeting message):** เลือก `ปิด (Disabled)` หรือเปิดไว้ก็ได้
   - **ข้อความตอบกลับอัตโนมัติ (Auto-response messages):** **ต้องเลือกเป็น `ปิด (Disabled)`** *(สำคัญมาก: เพื่อไม่ให้ข้อความอัตโนมัติของ LINE ไปตอบแทรกข้อความรายงานผลของระบบเรา)*
   - **Webhooks:** **ต้องเลือกเป็น `เปิด (Enabled)`**

### 4.4 ขั้นตอนการรับค่า `Channel Secret` และ `Channel Access Token` จาก LINE Developers Console
1. เปิดแท็บใหม่ไปที่เว็บไซต์ **LINE Developers Console**: https://developers.line.biz/console/
2. ล็อกอินด้วยบัญชี LINE เดียวกัน -> คลิกเลือก **Provider** (`AJFia_FilePortal`) -> คลิกเลือก **Channel (Messaging API)** ของคุณ
3. **ดึงค่าที่ 1 (`LINE_CHANNEL_SECRET`):**
   - คลิกที่แท็บ **Basic settings**
   - เลื่อนลงมาที่หัวข้อ **Channel secret**
   - กดปุ่ม **Copy** เก็บไว้ (เป็นรหัสตัวอักษรผสมตัวเลข 32 ตัว)
4. **ดึงค่าที่ 2 (`LINE_CHANNEL_ACCESS_TOKEN`):**
   - คลิกที่แท็บ **Messaging API** (อยู่ถัดจากแท็บ Basic settings)
   - เลื่อนลงไปล่างสุดที่หัวข้อ **Channel access token (long-lived)**
   - กดปุ่ม **Issue**
   - จะปรากฏรหัส Token ยาวประมาณ 170 ตัวอักษร -> กดปุ่ม **Copy** เก็บไว้

---

# ส่วนที่ 5: การตั้งค่าไฟล์ `.env` เพื่อเชื่อม LINE API และ Database

1. เปิดโฟลเดอร์โปรเจกต์ `Database-AJ_Fia` บนเครื่องคอมพิวเตอร์
2. คลิกขวาที่ไฟล์ **`.env`** -> เลือก **Open with -> Notepad**
3. นำค่า `Channel secret` และ `Channel access token` จากส่วนที่ 4.4 มาวางลงในไฟล์ `.env` ตามตัวอย่างด้านล่างนี้ แล้วกด **Save (`Ctrl + S`)**:

```env
# ============================================================================
# 1. การตั้งค่า Server
# ============================================================================
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
PUBLIC_BASE_URL=http://localhost:3000

# ============================================================================
# 2. พื้นที่จัดเก็บไฟล์และฐานข้อมูลบนเครื่อง Windows
# ============================================================================
# ระบบจะสร้างโฟลเดอร์ย่อย storage/, database/app.sqlite, backups/, logs/, temp/ ในนี้ให้อัตโนมัติ
STORAGE_ROOT_PATH=D:\LINE_FILE_STORAGE
BACKUP_ROOT_PATH=

# ============================================================================
# 3. บัญชีผู้ดูแลระบบ (Admin) เริ่มต้น
# ============================================================================
INITIAL_ADMIN_USER_ID=admin
INITIAL_ADMIN_NAME=อาจารย์ผู้ดูแลระบบ
INITIAL_ADMIN_PASSWORD=admin

# ============================================================================
# 4. ความปลอดภัยและ Session
# ============================================================================
SESSION_SECRET=MySuperSecretKey_ChangeThisToRandomString_2026_987654321
SESSION_TTL_HOURS=12
MAX_LOGIN_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15

# ============================================================================
# 5. การเชื่อมต่อ LINE Messaging API (นำค่าจากส่วนที่ 4.4 มาวางที่นี่!)
# ============================================================================
LINE_CHANNEL_SECRET=วางค่า_Channel_Secret_32_ตัวอักษรที่นี่
LINE_CHANNEL_ACCESS_TOKEN=วางค่า_Channel_Access_Token_ยาวๆ_ที่นี่

# รหัส LINE userId ของอาจารย์ผู้ส่งไฟล์ (33 ตัวอักษร ขึ้นต้นด้วยตัว U ใหญ่)
# ในการเปิดครั้งแรก ให้เว้นว่างไว้ก่อน แล้วดูวิธีนำรหัส U... มาใส่ในหัวข้อ 6.3 ด้านล่าง
ALLOWED_SENDER_LINE_USER_ID=

# ============================================================================
# 6. ขีดจำกัดขนาดไฟล์และพื้นที่ว่างบน Disk
# ============================================================================
MAX_FILE_SIZE_BYTES=314572800
MIN_FREE_DISK_BYTES=1073741824

# ============================================================================
# 7. การรวมกลุ่ม Notification และตารางเวลา Backup ทุก 6 ชั่วโมง
# ============================================================================
NOTIFICATION_GROUP_WINDOW_SECONDS=120
BACKUP_CRON_SCHEDULE=0 */6 * * *
BACKUP_RETENTION_DAYS=0
```

---

# ส่วนที่ 6: การเปิดรันระบบและการ Publish Link ออกสู่อินเทอร์เน็ตให้คนอื่นใช้งาน

เมื่อตั้งค่า `.env` เสร็จแล้ว ขั้นตอนนี้คือการเปิด Server และสร้างลิงก์ `https://...` เพื่อนำไปใส่ใน LINE Webhook และส่งให้นักศึกษาเข้าใช้งานจากอินเทอร์เน็ตภายนอก

---

## วิธีที่ 6.1: แบบฟรี 100% ไม่ต้องมีโดเมน (Cloudflare Quick Tunnel)
*ไม่ต้องเสียเงิน ไม่ต้องจดโดเมน ไม่ต้องตั้งค่า Router*

1. **เปิดโปรแกรม Web Server:**
   - เข้าไปที่โฟลเดอร์ `scripts` แล้วดับเบิลคลิกไฟล์ **`windows-start-server.bat`**
   - จะมีหน้าต่างสีดำแสดงข้อความว่า `ระบบรับฝากและดาวน์โหลดไฟล์ผ่าน LINE OA พร้อมทำงานแล้ว` (**เปิดหน้าต่างนี้ค้างไว้ ห้ามปิด**)
2. **เปิดโปรแกรมสร้างลิงก์ HTTPS (Quick Tunnel):**
   - ในโฟลเดอร์ `scripts` เดียวกัน ให้ดับเบิลคลิกไฟล์ **`windows-start-quick-tunnel.bat`**
   - รอประมาณ 3–5 วินาที ในหน้าต่างสีดำจะแสดงกรอบสี่เหลี่ยมที่มีลิงก์ `.trycloudflare.com` เช่น:
     ```text
     +--------------------------------------------------------------------------------------------+
     |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
     |  https://sunny-forest-1234.trycloudflare.com                                               |
     +--------------------------------------------------------------------------------------------+
     ```
   - **ลิงก์นี้คือลิงก์เว็บไซต์จริงของคุณ!** สามารถคัดลอก `https://sunny-forest-1234.trycloudflare.com` ส่งให้นักศึกษาเปิดเข้าเว็บไซต์ได้ทันที
   - *(หมายเหตุ: ห้ามปิดหน้าต่างสีดำทั้ง 2 หน้าต่าง หากปิดหน้าต่าง Quick Tunnel หรือเครื่อง Restart ลิงก์ `.trycloudflare.com` จะเปลี่ยนเป็นชื่อใหม่)*

---

## วิธีที่ 6.2: แบบลิงก์ถาวรไม่เปลี่ยนเมื่อเครื่องรีสตาร์ท (Cloudflare Named Tunnel)
*สำหรับกรณีที่มีชื่อโดเมนส่วนตัว (เช่น `yourdomain.com`) และต้องการให้ลิงก์คงที่ตลอดเวลา*

1. ล็อกอินเข้าสู่ **Cloudflare Zero Trust Dashboard** (https://one.dash.cloudflare.com/) -> แพ็กเกจ **Free Plan ($0)**
2. ไปที่เมนู **Networks** -> **Tunnels** -> กด **Create a tunnel** -> เลือก **Cloudflared** -> ตั้งชื่อ Tunnel เช่น `line-oa-storage`
3. ในหน้า **Install and run a connector**:
   - เลือก **Windows (64-bit)** -> คัดลอกคำสั่ง `cloudflared.exe service install <TOKEN>` ไปรันใน **PowerShell (Run as Administrator)**
   - คำสั่งนี้จะติดตั้ง Tunnel เป็น Windows Service ที่ทำงานเบื้องหลังอัตโนมัติทุกครั้งที่เปิดเครื่อง
4. ในหน้า **Public Hostname**:
   - **Subdomain:** เช่น `files`
   - **Domain:** เลือกโดเมนของคุณ (จะได้ลิงก์ถาวรเป็น `https://files.yourdomain.com`)
   - **Service Type:** `HTTP`
   - **URL:** `127.0.0.1:3000`
   - กด **Save tunnel**

---

## 6.3 ขั้นตอนนำลิงก์ที่ Publish แล้วไปผูกกับ LINE Webhook API

เมื่อคุณได้ลิงก์ `https://...` จากข้อ 6.1 หรือ 6.2 แล้ว ให้นำไปผูกกับ LINE OA ตามขั้นตอนนี้:

1. เปิดเว็บ **LINE Developers Console** (https://developers.line.biz/console/) -> เลือก Channel ของคุณ -> แท็บ **Messaging API**
2. เลื่อนลงมาที่หัวข้อ **Webhook settings** -> กดปุ่ม **Edit** ที่ช่อง **Webhook URL**
3. นำลิงก์ HTTPS ของคุณมาวาง โดย **ต้องเติม `/api/line/webhook` ต่อท้ายเสมอ**:
   - ตัวอย่าง (กรณีใช้ Quick Tunnel):
     ```text
     https://sunny-forest-1234.trycloudflare.com/api/line/webhook
     ```
   - ตัวอย่าง (กรณีใช้ Named Tunnel):
     ```text
     https://files.yourdomain.com/api/line/webhook
     ```
4. กดปุ่ม **Update**
5. กดปุ่ม **Verify** -> หากเชื่อมต่อถูกต้อง หน้าจอจะเด้งป๊อปอัปคำว่า **`Success`**
6. เปิดสวิตช์ **Use webhook** ให้เป็นสีเขียว (**Enabled**)
7. **การล็อกให้รับไฟล์เฉพาะจาก LINE ของอาจารย์คนเดียว (`ALLOWED_SENDER_LINE_USER_ID`):**
   - หยิบ iPhone ของอาจารย์ สแกน QR Code เพิ่มเพื่อนกับ LINE OA นี้ (ดู QR Code ได้ในแท็บ Messaging API ของ LINE Developers Console)
   - ส่งข้อความทักแชท LINE OA ไป 1 ครั้ง เช่น `สวัสดี`
   - เปิดหน้าเว็บไซต์ของเรา ล็อกอินด้วยบัญชี `admin` -> ไปที่แท็บ **บันทึกการทำงาน (Webhook & Backup Logs)**
   - ในตารางประวัติการรับ Webhook ดูคอลัมน์ **ผู้ส่ง (LINE userId)** จะเห็นรหัส 33 ตัวอักษรที่ขึ้นต้นด้วย `U...` ของอาจารย์
   - คัดลอกรหัส `U...` นั้นไปใส่ในไฟล์ `.env` ที่บรรทัด `ALLOWED_SENDER_LINE_USER_ID=U...` แล้วรีสตาร์ท `windows-start-server.bat` 1 ครั้ง

---

# ส่วนที่ 7: รายละเอียดการเชื่อมต่อ API และ Database ทั้งหมดของระบบ (API & Database Reference)

เพื่อให้เข้าใจว่าเมื่อระบบทำงานแล้ว **LINE API**, **Backend API**, **Frontend** และ **Database (`app.sqlite`)** เชื่อมต่อกันอย่างไร สรุปไว้ครบถ้วนดังนี้ครับ:

### 7.1 การเชื่อมต่อกับ LINE Messaging API ทั้ง 3 ส่วน
ระบบเชื่อมต่อกับเซิร์ฟเวอร์ของ LINE จริงผ่านโปรโตคอล HTTPS ตามมาตรฐานของ LINE Developers ทุกประการ:

| ชื่อ API ของ LINE | ทิศทาง | Endpoint ที่เชื่อมต่อ | หน้าที่และการทำงานร่วมกับ Database |
| :--- | :---: | :--- | :--- |
| **1. LINE Webhook API** | LINE -> Server เรา | `POST /api/line/webhook` | รับแจ้งเตือนเมื่ออาจารย์ส่งไฟล์ รูปภาพ หรือข้อความ -> ตรวจสอบลายเซ็น `X-Line-Signature` ด้วย `LINE_CHANNEL_SECRET` -> บันทึกลงตาราง `line_webhook_events` |
| **2. LINE Content API** | Server เรา -> LINE | `GET https://api-data.line.me/v2/bot/message/{messageId}/content` | ใช้ `LINE_CHANNEL_ACCESS_TOKEN` ดาวน์โหลดเนื้อไฟล์จริงแบบ Stream -> ตรวจสอบขนาดไฟล์และพื้นที่ว่าง -> เขียนลงโฟลเดอร์ `storage/` -> บันทึกข้อมูลไฟล์ลงตาราง `files`, `file_recipients`, `notifications` |
| **3. LINE Reply API** | Server เรา -> LINE | `POST https://api.line.me/v2/bot/message/reply` | ใช้ `replyToken` ตอบกลับสถานะ (ชื่อไฟล์, ผู้รับ, ขนาด, สถานะสำเร็จ/ล้มเหลว) กลับไปยังแชท LINE ของอาจารย์ **หลังจากบันทึกไฟล์และ Commit ลง Database สำเร็จจริงแล้วเท่านั้น** |

---

### 7.2 รายการ Backend REST API และการเชื่อมโยงกับตารางใน Database

| หมวดหมู่ | HTTP Method & Path | หน้าที่ของ API | ตารางใน Database (`app.sqlite`) ที่เชื่อมโยง |
| :--- | :--- | :--- | :--- |
| **Authentication** | `POST /api/auth/login` | ตรวจสอบ User ID & Password (Argon2id), นับจำนวนครั้งที่ผิด (Lockout) และสร้าง Session Cookie | `users`, `sessions`, `system_logs` |
| **Authentication** | `POST /api/auth/logout` | ลบ Session และออกจากระบบ | `sessions`, `system_logs` |
| **Authentication** | `GET /api/auth/me` | ตรวจสอบสถานะการล็อกอินและดึง CSRF Token | `users`, `sessions` |
| **Authentication** | `POST /api/auth/change-password` | เปลี่ยนรหัสผ่าน (รวมถึงบังคับเปลี่ยนรหัสในการล็อกอินครั้งแรก) | `users`, `sessions`, `system_logs` |
| **Files & URLs** | `GET /api/files` | ดึงรายการไฟล์ที่ผู้ใช้มีสิทธิ์เห็น (Private ของตนเอง + Public) พร้อมค้นหาและกรองตามวันที่/ประเภทไฟล์ | `files`, `file_recipients` |
| **Files & URLs** | `GET /api/files/urls` | ดึงรายการลิงก์ URL ที่อาจารย์ส่งเข้ามาในระบบ | `url_records`, `url_recipients` |
| **Files & URLs** | `GET /api/files/:fileUuid/preview` | ตรวจสอบสิทธิ์ฝั่ง Backend แล้วสตรีมไฟล์ **PDF** หรือ **รูปภาพ** เพื่อแสดง Preview บนเว็บ | `files`, `file_recipients`, `system_logs` |
| **Files & URLs** | `GET /api/files/:fileUuid/download` | ตรวจสอบสิทธิ์ฝั่ง Backend แล้วสตรีมไฟล์จริงให้ดาวน์โหลดลงเครื่องด้วยชื่อไฟล์ต้นฉบับ | `files`, `file_recipients`, `system_logs` |
| **Notifications** | `GET /api/notifications` | ดึงรายการแจ้งเตือนแบบรวมกลุ่ม (Notification Groups) และจำนวนที่ยังไม่ได้อ่าน | `notification_groups`, `notifications` |
| **Notifications** | `PATCH /api/notifications/groups/:id/read` | เปลี่ยนสถานะ อ่านแล้ว (Read) / ยังไม่อ่าน (Unread) ของกลุ่มแจ้งเตือน | `notification_groups`, `notifications` |
| **Notifications** | `PATCH /api/notifications/items/:id/read` | เปลี่ยนสถานะ อ่านแล้ว / ยังไม่อ่าน ของรายการแจ้งเตือนย่อย | `notification_groups`, `notifications` |
| **Notifications** | `POST /api/notifications/read-all` | ทำเครื่องหมายว่าอ่านแล้วทั้งหมด | `notification_groups`, `notifications` |
| **Notifications** | `DELETE /api/notifications/...` | ลบรายการหรือกลุ่มแจ้งเตือนของผู้ใช้งาน | `notification_groups`, `notifications` |
| **Admin API** | `GET /api/admin/users` | ดูรายชื่อผู้ใช้งานทั้งหมดและจำนวนไฟล์ส่วนตัวของแต่ละคน | `users`, `file_recipients`, `files` |
| **Admin API** | `POST /api/admin/users` | เพิ่มผู้ใช้งานใหม่ (ตั้งรหัสเริ่มต้นเท่ากับ User ID อัตโนมัติ) | `users`, `file_recipients`, `system_logs` |
| **Admin API** | `PUT /api/admin/users/:id` | แก้ไขชื่อ รีเซ็ตรหัสผ่าน หรือเปลี่ยนสถานะบัญชีผู้ใช้ | `users`, `sessions`, `system_logs` |
| **Admin API** | `PATCH /api/admin/users/:id/status` | เปิดใช้งาน (`ACTIVE`), ปิดใช้งาน (`INACTIVE`), หรือระงับ (`SUSPENDED`) บัญชีผู้ใช้ | `users`, `sessions`, `system_logs` |
| **Admin API** | `DELETE /api/admin/users/:id` | ลบบัญชีผู้ใช้ **โดยไม่ลบไฟล์ของผู้ใช้นั้น** (REQ-05) | `users`, `file_recipients`, `url_recipients`, `sessions` |
| **Admin API** | `GET /api/admin/files` & `DELETE` | ดูและสั่งลบไฟล์ออกจากเครื่อง Server | `files`, `file_recipients`, `notifications` |
| **Admin API** | `GET /api/admin/system-status` | ดูพื้นที่ว่างบน Disk, ขนาด Database, สถานะ LINE OA และสถานะ Backup ล่าสุด | `users`, `files`, `url_records`, `backup_logs` |
| **Admin API** | `GET /api/admin/logs` | ดูประวัติ Webhook (`RECEIVED` -> `SUCCESS`/`FAILED`), ประวัติ Backup และ System Logs | `line_webhook_events`, `backup_logs`, `system_logs` |
| **Admin API** | `POST /api/admin/backups/run` | สั่งทำ Online Backup ฐานข้อมูลและไฟล์จริงทั้งหมดทันที | `backup_logs`, `system_logs` |
| **Admin API** | `POST /api/admin/backups/:id/restore` | สั่งกู้คืนฐานข้อมูลและไฟล์ทั้งหมดจากชุดสำรองที่เลือก | `backup_logs`, `system_logs` + ทุกตารางใน DB |

---

# ส่วนที่ 8: การตั้งค่าให้ระบบเปิดตัวเองอัตโนมัติเมื่อเครื่อง Restart (24/7 Operation)

เพื่อให้ระบบกลับมาเปิด Web Server เองโดยอัตโนมัติเมื่อไฟดับแล้วไฟมา หรือเมื่อ Windows รีสตาร์ทตัวเอง:

1. คลิกขวาที่ปุ่ม **Start** ของ Windows -> เลือก **PowerShell (Admin)** หรือ **Terminal (Admin)**
2. พิมพ์คำสั่งต่อไปนี้เพื่อเข้าไปยังโฟลเดอร์ `scripts` ของโปรเจกต์แล้วรันสคริปต์ลงทะเบียน:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   cd "C:\Apps\Database-AJ_Fia\scripts"
   .\windows-register-autostart.ps1
   ```
   *(เปลี่ยน `C:\Apps\Database-AJ_Fia` ให้ตรงกับโฟลเดอร์ที่คุณวางโปรเจกต์จริง)*
3. เมื่อขึ้นข้อความ `✅ ลงทะเบียนสำเร็จ!` ระบบจะสร้างงานชื่อ **`LineOA_FileStorage_Server_AutoStart`** ไว้ใน **Windows Task Scheduler** ซึ่งจะเปิด Web Server ขึ้นมาทำงานอัตโนมัติทุกครั้งที่เปิดเครื่องคอมพิวเตอร์

---

# ส่วนที่ 9: ขั้นตอนการทดสอบระบบหลังติดตั้งเสร็จ (Go-Live Checklist)

หลังจากติดตั้งและผูก Webhook เสร็จแล้ว ให้ทดสอบตามลำดับ 6 ข้อนี้เพื่อยืนยันว่าระบบพร้อมใช้งานจริง 100%:

- [ ] **ขั้นที่ 1 (ทดสอบเข้าหน้าเว็บและเปลี่ยนรหัส Admin):**
  เปิดลิงก์เว็บไซต์ -> ล็อกอินด้วย `User ID: admin` และ `Password: admin` -> ระบบบังคับให้ตั้งรหัสผ่านใหม่ของ Admin -> ตั้งรหัสผ่านใหม่ให้เรียบร้อย
- [ ] **ขั้นที่ 2 (ทดสอบสร้างบัญชีผู้ใช้งาน/นักศึกษา):**
  ในหน้า Admin -> แท็บ **จัดการบัญชีผู้ใช้งาน** -> ลองเพิ่มรหัสนักศึกษา เช่น `User ID: 6501001`, ชื่อ `สมชาย ใจดี` (เว้นช่องรหัสผ่านว่างไว้ ระบบจะตั้งรหัสเริ่มต้นเป็น `6501001` ให้เอง) -> กดเพิ่มบัญชี
- [ ] **ขั้นที่ 3 (ทดสอบส่งไฟล์จาก iPhone ของอาจารย์เข้า LINE OA):**
  หยิบ iPhone ของอาจารย์ -> เปิดแอป **Files (ไฟล์)** หรือ **Photos (รูปภาพ)** -> เลือกไฟล์ PDF หรือรูปภาพ -> กด **Share** -> เลือกแอป **LINE** -> เลือกส่งให้ **LINE OA** ของระบบ
  - *ผลลัพธ์ที่ต้องเห็น:* บอทใน LINE OA ต้องส่งข้อความตอบกลับว่า `✅ จัดเก็บไฟล์สำเร็จ` พร้อมแจ้งชื่อไฟล์ ผู้รับ ขนาดไฟล์ และสถานะ
- [ ] **ขั้นที่ 4 (ทดสอบส่งลิงก์ URL เข้า LINE OA):**
  พิมพ์ลิงก์เว็บไซต์ เช่น `https://www.google.com เอกสารอ้างอิงเพิ่มเติม` ส่งในแชท LINE OA
  - *ผลลัพธ์ที่ต้องเห็น:* บอทตอบกลับว่า `✅ บันทึกลิงก์ (URL) สำเร็จ`
- [ ] **ขั้นที่ 5 (ทดสอบฝั่งผู้ใช้งาน Login, Preview และ Download ผ่านอินเทอร์เน็ต):**
  ลองใช้โทรศัพท์มือถือหรือคอมพิวเตอร์เครื่องอื่น เปิดลิงก์เว็บไซต์ (`https://...`) -> ล็อกอินด้วย `6501001` / `6501001` -> เปลี่ยนรหัสผ่านใหม่ -> ตรวจสอบว่าเห็นไฟล์ในหน้าแดชบอร์ด, เห็นแจ้งเตือนในกระดิ่งมุมขวาบน, กดปุ่ม **Preview** ดูไฟล์ PDF/รูปภาพได้ และกดปุ่ม **Download** ได้จริง
- [ ] **ขั้นที่ 6 (ทดสอบระบบสำรองข้อมูล Backup):**
  ล็อกอินด้วยบัญชี Admin -> ไปที่แท็บ **สถานะระบบและ Backup** -> กดปุ่ม **สั่งสำรองข้อมูลทันที (Run Backup Now)** -> ตรวจสอบว่าขึ้นสถานะ `SUCCESS` และมีโฟลเดอร์ชุดสำรองเกิดขึ้นใน `D:\LINE_FILE_STORAGE\backups\`

---

# ส่วนที่ 10: การดูแลรักษาระบบ การสำรองข้อมูล (Backup) และการกู้คืน (Restore)

1. **ระบบสำรองข้อมูลอัตโนมัติทุก 6 ชั่วโมง:**
   - ตราบใดที่ Server เปิดอยู่ ระบบจะทำการสำรองฐานข้อมูล `app.sqlite` และไฟล์ทั้งหมดไปยังโฟลเดอร์ `backups\` ทุกๆ 6 ชั่วโมง (00:00, 06:00, 12:00, 18:00 น.) โดยอัตโนมัติ พร้อมตรวจสอบค่าแฮช SHA-256 และความสมบูรณ์ของฐานข้อมูล (`PRAGMA integrity_check`) ทุกครั้ง
2. **การกู้คืนข้อมูล (Restore) เมื่อเกิดเหตุฉุกเฉิน:**
   - สามารถกดปุ่ม **"กู้คืนข้อมูลจากชุดนี้"** จากหน้าเว็บ Admin (แท็บ **สถานะระบบและ Backup**) ได้ทันที
   - หรือรันผ่าน Command Prompt ในโฟลเดอร์โปรเจกต์ด้วยคำสั่ง:
     ```bat
     npm run restore -- ชื่อโฟลเดอร์_Backup_ID
     ```
3. **การเปิดใช้งานการแยกไฟล์เข้าโฟลเดอร์ส่วนตัว (Private) อัตโนมัติเมื่ออาจารย์กำหนด Syntax แล้ว:**
   - ปัจจุบันตามข้อกำหนด REQ-03 ระบบเก็บไฟล์ไว้ใน `Public` เป็นค่าเริ่มต้นเพื่อไม่ให้ไฟล์สูญหาย
   - เมื่ออาจารย์ตกลงรูปแบบข้อความระบุผู้รับ (Syntax) ที่แน่นอนแล้ว สามารถนำรูปแบบนั้นมาใส่ในฟังก์ชัน `setRecipientSyntaxExtractor` ที่ไฟล์ `src/server/services/recipientParser.ts` เพื่อให้ระบบแยกไฟล์เข้าโฟลเดอร์ `Private` ของนักศึกษาตามข้อความที่อาจารย์พิมพ์แนบมาได้ทันที
