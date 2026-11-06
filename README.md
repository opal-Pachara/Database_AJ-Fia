# ระบบรับฝากไฟล์ผ่าน LINE OA และให้ผู้ใช้งานดาวน์โหลดผ่านเว็บไซต์

ระบบ Web Application แบบ Self-Hosted บนคอมพิวเตอร์ **Windows 10 / Windows 11** สำหรับรับไฟล์ รูปภาพ เอกสาร และลิงก์ (URL) จากอาจารย์ผ่าน **LINE Official Account (LINE OA)** แล้วจัดเก็บลงในพื้นที่จัดเก็บข้อมูลและฐานข้อมูลภายในเครื่องส่วนตัว พร้อมให้ผู้ใช้งานเข้าสู่ระบบผ่านเว็บไซต์เพื่อดู ค้นหา Preview และดาวน์โหลดไฟล์ได้ตลอด 24 ชั่วโมง โดยไม่ต้องเสียค่าเช่า Hosting หรือ VPS

---

## คุณสมบัติหลักของระบบ (Key Features)

1. **รับไฟล์และลิงก์จาก LINE OA อัตโนมัติ (1-on-1 Chat):**
   - ตรวจสอบความถูกต้องของ `X-Line-Signature` (HMAC-SHA256) และป้องกันการประมวลผลซ้ำ (Idempotency)
   - รองรับการส่งไฟล์จาก iPhone ผ่าน **iOS Share Sheet** และการกด Reply (`quotedMessageId`)
   - รองรับทั้งไฟล์เอกสาร, PDF, รูปภาพ, วิดีโอ, เสียง และลิงก์ URL (บันทึก URL เป็น Link โดยไม่ดาวน์โหลดเนื้อหาหน้าเว็บ)
   - ตอบกลับสถานะการดำเนินการผ่าน LINE Reply API หลังจากเขียนไฟล์ลง Disk และ Commit ลงฐานข้อมูลสำเร็จจริงเท่านั้น
2. **การจัดเก็บไฟล์และการแยกสิทธิ์ (Private & Public Storage):**
   - แยกพื้นที่จัดเก็บไฟล์ส่วนตัว (`storage/private/{USER_ID}/`) และไฟล์ส่วนกลาง (`storage/public/`)
   - ในระหว่างที่ยังไม่ได้กำหนด Syntax สำหรับระบุผู้รับ ระบบจะจัดเก็บไฟล์ทั้งหมดลงในพื้นที่ **`Public`** โดยอัตโนมัติ (ไม่ทิ้งไฟล์) และมีโมดูล `recipientParser.ts` ที่พร้อมเปิดใช้งาน Syntax ทันทีเมื่ออาจารย์กำหนด
   - ตั้งชื่อไฟล์จริงบน Disk ด้วย UUID เพื่อป้องกันชื่อไฟล์ซ้ำและป้องกันการโจมตีแบบ Path Traversal โดยเก็บชื่อไฟล์ต้นฉบับไว้ในฐานข้อมูล
3. **ระบบความปลอดภัยและจัดการบัญชีผู้ใช้ (Security & RBAC):**
   - เข้าสู่ระบบด้วย User ID และ Password (รหัสผ่านเริ่มต้นเท่ากับ User ID และบังคับเปลี่ยนรหัสผ่านเมื่อ Login ครั้งแรก)
   - เข้ารหัสรหัสผ่านด้วย **Argon2id** พร้อมระบบล็อกบัญชีชั่วคราวเมื่อเดารหัสผ่านผิดเกินกำหนด (Account Lockout), CSRF Token และ Rate Limiting
   - ตรวจสอบสิทธิ์ฝั่ง Backend ทุกครั้งที่มีการ Preview หรือ Download ไฟล์
4. **การค้นหา, ตัวกรอง, Preview และ Notification Inbox:**
   - ค้นหาจากชื่อไฟล์หรือข้อความแนบ กรองตามหมวดหมู่ไฟล์ พื้นที่จัดเก็บ และช่วงวันที่
   - รองรับการ Preview ไฟล์ **PDF** และ **รูปภาพ** บนเบราว์เซอร์โดยตรง
   - ระบบ Notification Inbox ที่รวมกลุ่มการแจ้งเตือนตามช่วงเวลาเหตุการณ์เดียวกัน (Notification Grouping)
5. **ระบบสำรองข้อมูลอัตโนมัติทุก 6 ชั่วโมงและการกู้คืน (Backup & Restore):**
   - สำรองฐานข้อมูล SQLite แบบ Online Atomic Backup พร้อมไฟล์จริงและ `manifest.json` (ตรวจสอบค่า SHA-256 และ `PRAGMA integrity_check`) ทุก 6 ชั่วโมงโดยอัตโนมัติ

---

## โครงสร้างโปรเจกต์ (Project Structure)

```text
Database-AJ_Fia/
├── .env.example                 # ตัวอย่างการตั้งค่าระบบ (คัดลอกเป็น .env)
├── package.json                 # สคริปต์และรายการไลบรารี
├── scripts/
│   ├── windows-install.bat      # สคริปต์ติดตั้งอัตโนมัติสำหรับ Windows 10/11
│   ├── windows-start-server.bat # สคริปต์รันระบบพร้อม Auto-Restart
│   ├── windows-start-quick-tunnel.bat # สคริปต์เปิด Cloudflare Quick Tunnel (ฟรี 0 บาท)
│   ├── windows-start-named-tunnel.bat # สคริปต์เปิด Cloudflare Named Tunnel
│   ├── windows-register-autostart.ps1 # ลงทะเบียนให้เปิดเองเมื่อเครื่อง Windows Restart
│   ├── backup-now.ts            # สคริปต์สั่ง Backup ผ่าน CLI
│   └── restore-backup.ts        # สคริปต์สั่ง Restore ผ่าน CLI
├── src/
│   ├── server/                  # Backend (Node.js + TypeScript + Express + SQLite WAL)
│   └── client/                  # Frontend (React 18 + TypeScript + Tailwind CSS)
└── tests/
    └── full-system.test.ts      # ชุดทดสอบอัตโนมัติ (Integration, Security, Backup/Restore)
```

---

## สารบัญเอกสารทั้งหมด (Documentation Index)

1. [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) — สถาปัตยกรรมระบบและแผนผังการทำงาน (Data Flow, Webhook Flow, Auth, Backup)
2. [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) — โครงสร้างฐานข้อมูล, ER Diagram, ตาราง และ Index
3. [INSTALLATION_GUIDE.md](./INSTALLATION_GUIDE.md) — คู่มือการติดตั้งและเปิดใช้งานบน Windows 10/11 แบบ Step-by-Step
4. [LINE_OA_SETUP.md](./LINE_OA_SETUP.md) — คู่มือการตั้งค่า LINE Official Account, Messaging API และการแชร์ไฟล์จาก iPhone
5. [CLOUDFLARE_TUNNEL_SETUP.md](./CLOUDFLARE_TUNNEL_SETUP.md) — คู่มือการเผยแพร่เว็บไซต์ผ่าน HTTPS ด้วย Cloudflare Tunnel (Quick Tunnel vs Named Tunnel)
6. [BACKUP_AND_RESTORE.md](./BACKUP_AND_RESTORE.md) — คู่มือระบบสำรองข้อมูลทุก 6 ชั่วโมงและขั้นตอนการกู้คืนระบบ
7. [USER_GUIDE.md](./USER_GUIDE.md) — คู่มือการใช้งานสำหรับผู้รับไฟล์ (User)
8. [ADMIN_GUIDE.md](./ADMIN_GUIDE.md) — คู่มือการดูแลระบบสำหรับอาจารย์ (Admin)
9. [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — คู่มือการวินิจฉัยและแก้ไขปัญหาที่พบบ่อย
10. [TEST_REPORT.md](./TEST_REPORT.md) — รายงานผลการทดสอบระบบจริงและสถานะ Acceptance Criteria ทั้ง 26 ข้อ

