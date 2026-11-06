# รายงานผลการทดสอบระบบ (TEST REPORT)

เอกสารนี้สรุปผลการทดสอบจริงของระบบตามเกณฑ์ **Phase 7 (Integration Testing)**, **Phase 8 (Security Testing)**, **Phase 9 (Backup and Recovery Testing)** และ **Section 13 (Acceptance Criteria ทั้ง 26 ข้อ)**

> **กฎความซื่อสัตย์ในการรายงานผล (Section 2.3 และ Section 13):**
> รายการใดที่ทดสอบผ่านชุดทดสอบจริงในระบบแล้วจะระบุว่า **PASSED (ผ่านการทดสอบจริง)** และรายการใดที่ต้องอาศัยอุปกรณ์จริงของผู้ใช้ (เช่น โทรศัพท์ iPhone จริงของอาจารย์ที่ผูกกับบัญชี LINE OA จริง และเครื่อง Windows 10/11 จริงของผู้ใช้หลังการติดตั้ง) จะระบุอย่างตรงไปตรงมาว่า **พร้อมใช้งานและรอการทดสอบบนสภาพแวดล้อมจริงของผู้ใช้ (Pending Live User Hardware/Account Verification)** โดยไม่แอบอ้างว่าทดสอบบนฮาร์ดแวร์ของผู้ใช้แล้ว

---

## 1. ผลการรันชุดทดสอบอัตโนมัติ (Automated Test Suite Execution)

คำสั่งที่ใช้ทดสอบ:
```bash
npm test
```
(ไฟล์ชุดทดสอบ: [tests/full-system.test.ts](./tests/full-system.test.ts))

| รหัสการทดสอบ | หมวดการทดสอบ | รายละเอียดการทดสอบจริง | ผลลัพธ์ |
| :--- | :--- | :--- | :--- |
| **TEST-01** | Phase 7 & Security | Admin Login ครั้งแรก, บล็อกการเข้าถึง API ก่อนเปลี่ยนรหัสผ่าน, ป้องกันการตั้งรหัสซ้ำกับ User ID และเปลี่ยนรหัสผ่านสำเร็จ | **PASSED** |
| **TEST-02** | Phase 7 & User Mgmt | Admin สร้างบัญชีผู้ใช้ `6501001` และ `6501002` (รหัสเริ่มต้น = User ID) และตรวจสอบว่าฐานข้อมูลเก็บเป็น Argon2id Hash เท่านั้น | **PASSED** |
| **TEST-03** | Phase 8 Security | ทดสอบกรอกรหัสผ่านผิดติดต่อกัน 5 ครั้งจนบัญชีถูกล็อก (`HTTP 423 Locked`) และทดสอบการระงับบัญชี (`SUSPENDED` -> `HTTP 403 Forbidden`) | **PASSED** |
| **TEST-04** | Phase 7 Auth | ผู้ใช้งาน `6501001` และ `6501002` Login ด้วยรหัสเริ่มต้นและเปลี่ยนรหัสผ่านใหม่สำเร็จ | **PASSED** |
| **TEST-05** | Phase 8 Security | ทดสอบส่ง LINE Webhook ปลอมที่มี `X-Line-Signature` ไม่ถูกต้อง ระบบปฏิเสธด้วย `HTTP 401 Unauthorized` | **PASSED** |
| **TEST-06** | Phase 7 Webhook & Public | รับไฟล์ PDF และรูปภาพผ่าน LINE Webhook (โหมดยังไม่กำหนด Syntax ผู้รับตาม REQ-03) ดาวน์โหลดผ่าน Content API เก็บลง `storage/public/` บันทึก DB ตอบกลับผ่าน LINE Reply API และทดสอบป้องกัน Webhook ซ้ำ (`isRedelivery`) | **PASSED** |
| **TEST-07** | Phase 7 Recipient & Pairing | ทดสอบการระบุผู้รับเมื่อยืนยัน Syntax + การจับคู่ข้อความกับไฟล์แบบ Batch (iOS Share Sheet) และการกด Reply (`quotedMessageId`) จัดเก็บลง `storage/private/6501001/` และกรณีรหัสผู้รับไม่มีในระบบให้เก็บลง `Public` | **PASSED** |
| **TEST-08** | Phase 7 URL & Limits | ทดสอบส่ง URL เข้า LINE OA (บันทึกเป็น Link โดยไม่ดาวน์โหลดหน้าเว็บ) และทดสอบส่งไฟล์ขนาดเกินกำหนด (ปฏิเสธและแจ้งสาเหตุกลับทาง LINE OA) | **PASSED** |
| **TEST-09** | Phase 7 & 8 RBAC / File API | ทดสอบสิทธิ์การเห็นไฟล์ของ `6501001` vs `6501002`, ป้องกัน `6501002` แอบเปิด Preview/Download ไฟล์ส่วนตัวของ `6501001` (`HTTP 403`), ทดสอบ Preview PDF (`200 OK`), ปฏิเสธ Preview DOCX (`415`), ดาวน์โหลดไฟล์จริงตรวจ SHA-256 และป้องกัน SQL Injection ในระบบค้นหา | **PASSED** |
| **TEST-10** | Phase 7 Notifications | ทดสอบสร้าง Notification Inbox, การรวมกลุ่มอัตโนมัติ (Notification Grouping), การเปลี่ยนสถานะ Read/Unread และการลบ Notification | **PASSED** |
| **TEST-11** | Phase 8 Path Traversal & REQ-05 | ทดสอบป้องกันการโจมตี Path Traversal (`../../`) และทดสอบลบบัญชี `6501001` โดยตรวจสอบว่าไฟล์ส่วนตัวทั้ง 3 ไฟล์ยังคงอยู่ครบทั้งบน Disk และในฐานข้อมูล | **PASSED** |
| **TEST-12** | Phase 9 Backup & Restore | ทดสอบสำรองฐานข้อมูลและไฟล์จริงพร้อมตรวจ `PRAGMA integrity_check` และ `manifest.json`, จำลองการลบไฟล์ทิ้ง แล้วสั่ง Restore กู้คืนกลับมาครบ 100% | **PASSED** |

---

## 2. สรุปสถานะตามเกณฑ์การยอมรับระบบ (Section 13: Acceptance Criteria 26 ข้อ)

| ข้อที่ | เกณฑ์การยอมรับระบบ (Acceptance Criteria) | สถานะการทดสอบ | หมายเหตุ / หลักฐานการทดสอบ |
| :---: | :--- | :---: | :--- |
| **1** | Admin สามารถส่งไฟล์จาก iPhone ผ่าน LINE OA ได้จริง | **รอทดสอบกับ iPhone และ LINE OA จริงของผู้ใช้** | โค้ดรับ Webhook และจัดการ Event จาก iOS Share Sheet / 1-on-1 Chat พร้อมใช้งานสมบูรณ์ (ดูคู่มือใน `LINE_OA_SETUP.md`) |
| **2** | Server ได้รับ Webhook จาก LINE จริง | **PASSED (ในชุดทดสอบ) / รอผูกบัญชี LINE OA จริง** | ทดสอบการรับ HTTP POST `/api/line/webhook` พร้อมตรวจ HMAC-SHA256 `X-Line-Signature` ผ่านใน `TEST-05`, `TEST-06` |
| **3** | Server ดาวน์โหลดไฟล์จริงจาก LINE Content API ได้ | **PASSED** | ทดสอบการดาวน์โหลดไฟล์ Binary แบบ Stream ผ่าน `/v2/bot/message/{id}/content` ใน `TEST-06`, `TEST-07` |
| **4** | ระบบสามารถระบุผู้รับตาม Message ที่กำหนดได้เมื่อมี Syntax ที่ได้รับการยืนยันแล้ว | **PASSED** | ทดสอบผ่าน `setRecipientSyntaxExtractor` ใน `TEST-07` ทั้งแบบส่งพร้อมกันและแบบกด Quote Reply |
| **5** | หากไม่สามารถระบุผู้รับได้ ไฟล์ต้องถูกจัดเก็บใน Public | **PASSED** | ทดสอบใน `TEST-06` (ไม่มีข้อความ/ยังไม่ตั้ง Syntax) และ `TEST-07` (รหัสผู้รับไม่มีในระบบ) ไฟล์ถูกเก็บลง `storage/public/` |
| **6** | ไฟล์ต้องถูกบันทึกลง Local Disk จริง | **PASSED** | ตรวจสอบไฟล์จริงบน Disk ใน `storage/public/` และ `storage/private/6501001/` ใน `TEST-06`, `TEST-07` |
| **7** | Metadata ต้องถูกบันทึกลง Database จริง | **PASSED** | ตรวจสอบข้อมูลในตาราง `files`, `file_recipients`, `line_webhook_events` ใน `TEST-06`, `TEST-07`, `TEST-09` |
| **8** | Admin สามารถเพิ่ม User ได้ | **PASSED** | ทดสอบผ่าน `POST /api/admin/users` ใน `TEST-02` |
| **9** | User สามารถ Login ได้ | **PASSED** | ทดสอบผ่าน `POST /api/auth/login` ใน `TEST-01`, `TEST-04` |
| **10** | User สามารถเปลี่ยน Password ได้ | **PASSED** | ทดสอบการบังคับเปลี่ยนรหัสครั้งแรกและการเปลี่ยนรหัสผ่านใน `TEST-01`, `TEST-04` |
| **11** | User เห็นไฟล์ส่วนตัวของตนเอง | **PASSED** | ทดสอบผ่าน `GET /api/files` ของผู้ใช้ `6501001` ใน `TEST-09` |
| **12** | User เห็นไฟล์ Public | **PASSED** | ทดสอบผ่าน `GET /api/files` ของทั้ง `6501001` และ `6501002` ใน `TEST-09` |
| **13** | User ไม่สามารถเข้าถึงไฟล์ส่วนตัวของผู้อื่นได้ | **PASSED** | ทดสอบใน `TEST-09` เมื่อ `6501002` พยายามเปิด Preview/Download ไฟล์ส่วนตัวของ `6501001` ระบบบล็อกด้วย `403 Forbidden` |
| **14** | User สามารถค้นหาไฟล์ได้ตามเงื่อนไขที่กำหนด | **PASSED** | ทดสอบค้นหาด้วยคำค้น หมวดหมู่ และพื้นที่จัดเก็บใน `TEST-09` |
| **15** | User สามารถ Preview PDF และรูปภาพได้ | **PASSED** | ทดสอบ `GET /api/files/:uuid/preview` สำหรับ PDF (`200 OK`) และปฏิเสธไฟล์ DOCX (`415`) ใน `TEST-09` |
| **16** | User สามารถ Download ไฟล์จริงได้ | **PASSED** | ทดสอบ `GET /api/files/:uuid/download` และเปรียบเทียบเนื้อหา Binary ตรงกับต้นฉบับ 100% ใน `TEST-09` |
| **17** | URL ถูกบันทึกเป็น Link โดยไม่ดาวน์โหลดเนื้อหา | **PASSED** | ทดสอบใน `TEST-08` ลิงก์ถูกบันทึกลง `url_records` โดยไม่ดึงหน้าเว็บ |
| **18** | LINE OA ตอบกลับสถานะการทำงานได้ | **PASSED** | ทดสอบข้อความตอบกลับทั้งกรณีสำเร็จและกรณีล้มเหลวใน `TEST-06`, `TEST-08` |
| **19** | Notification ถูกสร้างและแสดงใน Inbox ได้ | **PASSED** | ทดสอบผ่าน `GET /api/notifications` ใน `TEST-10` |
| **20** | Notification สามารถ Read / Unread และ Delete ได้ | **PASSED** | ทดสอบ `PATCH` และ `DELETE` Notification ใน `TEST-10` |
| **21** | Notification สามารถ Group ตามเหตุการณ์ได้ | **PASSED** | ทดสอบการจัดกลุ่มไฟล์ที่ส่งในเหตุการณ์เดียวกันเข้าเป็น `NotificationGroup` เดียวใน `TEST-10` |
| **22** | ระบบ Backup Database และไฟล์จริงทุก 6 ชั่วโมง | **PASSED** | ตั้งเวลา Cron `0 */6 * * *` ใน `backupService.ts` และทดสอบการทำงานจริงของระบบ Backup ใน `TEST-12` |
| **23** | สามารถ Restore ข้อมูลจาก Backup ได้ | **PASSED** | ทดสอบลบไฟล์จริงแล้วสั่ง Restore จาก Backup กู้คืนกลับมาครบ 100% พร้อมตรวจ SHA-256 ใน `TEST-12` |
| **24** | เว็บไซต์เข้าถึงผ่าน HTTPS จาก Internet ภายนอกได้ | **รอเปิด Cloudflare Tunnel บนเครื่องผู้ใช้** | เตรียมสคริปต์ `scripts/windows-start-quick-tunnel.bat` และ `windows-start-named-tunnel.bat` พร้อมคู่มือครบถ้วน |
| **25** | ระบบทำงานได้โดยไม่ต้อง Port Forwarding | **PASSED (ตามสถาปัตยกรรม Outbound Tunnel)** | Server ผูกที่ `127.0.0.1:3000` และใช้ Cloudflare Tunnel เชื่อมต่อขาออกโดยไม่ต้องเปิดพอร์ตที่ Router |
| **26** | ระบบสามารถกลับมาทำงานหลัง Restart เครื่องได้ | **รอลงทะเบียน Task Scheduler บนเครื่อง Windows จริง** | เตรียมสคริปต์ `scripts/windows-register-autostart.ps1` และ `windows-start-server.bat` สำหรับ Windows 10/11 เรียบร้อยแล้ว |

