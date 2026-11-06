# สถาปัตยกรรมระบบ (SYSTEM ARCHITECTURE)

เอกสารนี้อธิบายสถาปัตยกรรมของระบบ การเลือกใช้เทคโนโลยี และแผนผังการไหลของข้อมูลในทุกส่วนสำคัญของระบบ

---

## 1. เหตุผลในการเลือก Tech Stack (REQ-11)

- **Node.js (v22.5+ / v24 LTS) + TypeScript + Express:**
  - ทำงานแบบ Native บน Windows 10/11 โดยไม่ต้องรัน Virtual Machine หรือ Docker Desktop ที่กินหน่วยความจำสูง
  - ใช้หน่วยความจำ (RAM) ต่ำมาก (~50–80 MB ขณะพัก) เหมาะกับการเปิดทำงานต่อเนื่อง 24/7 บนคอมพิวเตอร์ส่วนตัว
  - รองรับการดาวน์โหลดไฟล์จาก LINE Content API แบบ **Stream Pipeline** ลงสู่ Disk โดยตรงพร้อมตรวจสอบขนาดไฟล์และพื้นที่ว่างแบบ Real-time
  - รวมการให้บริการทั้ง Backend API (`/api/*`), LINE Webhook (`/api/line/webhook`) และหน้าเว็บ Frontend ไว้ในพอร์ตเดียวกัน (`127.0.0.1:3000`) ทำให้เชื่อมต่อผ่าน Cloudflare Tunnel เพียงช่องทางเดียวได้ทันที
- **SQLite (`node:sqlite` โหมด WAL - Write-Ahead Logging):**
  - เป็น Relational Database จริงที่รองรับ ACID Transaction, Primary Key, Foreign Key, Unique Constraint และ Index
  - **ปลอดภัยสูงสุด:** ไม่มีพอร์ตฐานข้อมูลเปิดออกสู่เครือข่าย (Embedded Database) จึงไม่มีความเสี่ยงที่ฐานข้อมูลจะถูกโจมตีผ่านอินเทอร์เน็ต
  - **Online Atomic Backup:** รองรับการทำสำเนาฐานข้อมูลขณะระบบเปิดทำงานอยู่โดยที่ข้อมูลไม่เสียหาย
- **Argon2id (`hash-wasm`) + HttpOnly Signed Session + CSRF Protection:**
  - เข้ารหัสรหัสผ่านด้วยอัลกอริทึม Argon2id ตามมาตรฐานความปลอดภัยสมัยใหม่

---

## 2. แผนผังสถาปัตยกรรมระบบ (System & Deployment Architecture)

```mermaid
flowchart TB
    subgraph Internet["อินเทอร์เน็ตภายนอก"]
        Teacher["อาจารย์ (iPhone LINE App)<br/>ส่งไฟล์ผ่าน 1-on-1 Chat / iOS Share Sheet"]
        LineAPI["LINE Platform<br/>(Webhook & Content API)"]
        Users["ผู้ใช้งาน (Users) & Admin<br/>เข้าเว็บผ่าน Browser (HTTPS)"]
        Cloudflare["Cloudflare Edge Network<br/>(HTTPS Tunnel)"]
    end

    subgraph WindowsPC["เครื่องคอมพิวเตอร์ Windows 10/11 (Server & Database Host)"]
        Cloudflared["cloudflared.exe<br/>(Outbound Tunnel - ไม่ต้อง Port Forwarding)"]
        AppServer["Node.js Monolithic Server (127.0.0.1:3000)<br/>- Static React UI<br/>- Auth & RBAC Middleware<br/>- File Preview/Download/Search API<br/>- LINE Webhook Processor<br/>- 6-Hour Backup Scheduler"]
        
        subgraph StorageRoot["D:\\LINE_FILE_STORAGE\\"]
            PrivateDir["storage/private/{USER_ID}/"]
            PublicDir["storage/public/"]
            UrlsDir["storage/urls/"]
            DatabaseDir[("database/app.sqlite")]
            BackupsDir["backups/BK_YYYYMMDD_HHMMSS/"]
            LogsDir["logs/ & temp/"]
        end
    end

    Teacher -->|"ส่งไฟล์ / URL"| LineAPI
    LineAPI -->|"HTTPS POST /api/line/webhook"| Cloudflare
    Users -->|"HTTPS Web Request"| Cloudflare
    Cloudflare <-->|"Encrypted Tunnel"| Cloudflared
    Cloudflared -->|"http://127.0.0.1:3000"| AppServer
    AppServer -->|"GET /v2/bot/message/{id}/content"| LineAPI
    AppServer -->|"POST /v2/bot/message/reply"| LineAPI
    AppServer --> PrivateDir
    AppServer --> PublicDir
    AppServer --> UrlsDir
    AppServer --> DatabaseDir
    AppServer --> BackupsDir
    AppServer --> LogsDir
```

---

## 3. แผนผังการรับและประมวลผลไฟล์จาก LINE Webhook (Webhook & File Processing Flow)

ทุก Webhook Event ที่ได้รับจะถูกบันทึกสถานะในตาราง `line_webhook_events` ตามลำดับ:
`RECEIVED` -> `VALIDATING` -> `DOWNLOADING` -> `STORING` -> `DATABASE_COMMITTED` -> `SUCCESS` (หรือ `FAILED`)

```mermaid
sequenceDiagram
    autonumber
    participant T as อาจารย์ (iPhone)
    participant L as LINE Platform
    participant S as Server (Webhook Processor)
    participant D as Local Disk
    participant DB as SQLite DB

    T->>L: แชร์ไฟล์ / รูปภาพ / URL ไปยัง LINE OA
    L->>S: POST /api/line/webhook พร้อม X-Line-Signature
    S->>S: 1. ตรวจสอบ HMAC-SHA256 Signature ด้วย Channel Secret
    S->>DB: 2. ตรวจสอบ webhookEventId ซ้ำ (Idempotency)
    S->>DB: 3. บันทึกสถานะ RECEIVED -> VALIDATING (ตรวจแชท 1-on-1 และผู้ส่ง)
    alt เป็นไฟล์ (file, image, video, audio)
        S->>DB: อัปเดตสถานะ DOWNLOADING
        S->>L: ดึงไฟล์ผ่าน LINE Content API แบบ Stream
        S->>D: ตรวจขนาดไฟล์ + พื้นที่ว่างบน Disk แล้วเขียนลง temp/{uuid}.part พร้อมคำนวณ SHA-256
        S->>DB: อัปเดตสถานะ STORING
        S->>S: วิเคราะห์ผู้รับจากข้อความแนบ (หากยังไม่กำหนด Syntax หรือไม่พบผู้รับ -> PUBLIC)
        S->>D: ย้ายไฟล์จาก temp/ ไปยัง storage/public/ หรือ storage/private/{USER_ID}/
        S->>DB: Transaction: บันทึกตาราง files + file_recipients + notifications -> DATABASE_COMMITTED
        S->>L: ส่ง LINE Reply แจ้งผลสำเร็จ (ชื่อไฟล์, ผู้รับ, ขนาด, สถานะ)
        S->>DB: อัปเดตสถานะ SUCCESS
    else เป็นข้อความที่มี URL
        S->>DB: Transaction: บันทึกตาราง url_records (ไม่ดาวน์โหลดหน้าเว็บ) + notifications -> DATABASE_COMMITTED
        S->>L: ส่ง LINE Reply แจ้งผลบันทึกลิงก์สำเร็จ
        S->>DB: อัปเดตสถานะ SUCCESS
    end
```

---

## 4. โครงสร้างโฟลเดอร์จัดเก็บข้อมูล (File Storage Structure - Section 9)

```text
D:\LINE_FILE_STORAGE\
├── storage\
│   ├── private\
│   │   └── 6501001\              # เก็บไฟล์ส่วนตัวแยกตาม User ID (ชื่อไฟล์จริงเป็น UUID)
│   ├── public\                   # เก็บไฟล์ส่วนกลาง (Public)
│   └── urls\                     # เก็บ Metadata JSON ของลิงก์ URL
├── database\
│   └── app.sqlite                # ฐานข้อมูล SQLite หลัก (โหมด WAL)
├── backups\
│   └── BK_YYYYMMDD_HHMMSS_xxxx\  # ชุดสำรองข้อมูลทุก 6 ชั่วโมง (database + storage + manifest.json)
├── logs\
│   └── system-YYYY-MM-DD.log     # ไฟล์บันทึกการทำงานรายวัน
└── temp\                         # พื้นที่พักไฟล์ชั่วคราวขณะกำลังดาวน์โหลดจาก LINE Content API
```

