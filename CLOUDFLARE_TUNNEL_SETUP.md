# คู่มือการตั้งค่า Cloudflare Tunnel (CLOUDFLARE TUNNEL SETUP)

เอกสารนี้อธิบายวิธีการเผยแพร่เว็บไซต์จากคอมพิวเตอร์ Windows 10/11 ออกสู่อินเทอร์เน็ตภายนอกผ่าน **HTTPS** โดย **ไม่ต้องทำ Port Forwarding ที่ Router** และ **ไม่ต้องมี Static IP** ตามข้อกำหนด REQ-19

---

## 1. เปรียบเทียบแนวทางของ Cloudflare Tunnel อย่างตรงไปตรงมา

| หัวข้อเปรียบเทียบ | วิธีที่ 1: Cloudflare Quick Tunnel (`TryCloudflare`) | วิธีที่ 2: Cloudflare Named Tunnel (Zero Trust Free Plan) |
| :--- | :--- | :--- |
| **ค่าใช้จ่าย** | **ฟรี 100% (0 บาท)** ไม่ต้องสมัครสมาชิก ไม่ต้องใช้โดเมน | ตัว Tunnel **ฟรี 0 บาท** แต่ **ต้องมีชื่อโดเมน (Custom Domain)** ผูกในบัญชี Cloudflare |
| **รูปแบบ URL ที่ได้** | URL ชั่วคราว เช่น `https://random-words.trycloudflare.com` | URL ถาวรตามโดเมนของคุณ เช่น `https://files.yourdomain.com` |
| **เมื่อเครื่อง Restart หรือปิด-เปิดใหม่** | **URL จะเปลี่ยนใหม่ทุกครั้ง** (ต้องนำ URL ใหม่ไปอัปเดตใน LINE Developers Console และแจ้งผู้ใช้งาน) | **URL คงเดิม 100% ตลอดเวลา** ไม่ต้องแก้ไข Webhook URL ใน LINE OA อีกเลย |
| **ข้อจำกัดจากเอกสารทางการ** | จำกัด Concurrent Requests สูงสุด 200 requests พร้อมกัน ไม่มี SLA | รองรับการใช้งานระดับ Production และติดตั้งเป็น Windows Service ได้ |

---

## 2. วิธีที่ 1: การใช้งาน Cloudflare Quick Tunnel (ฟรี 100% ไม่ต้องมีโดเมน)

1. ติดตั้งโปรแกรม `cloudflared` บน Windows (ทำครั้งเดียว):
   เปิด PowerShell แล้วรันคำสั่ง:
   ```powershell
   winget install --id Cloudflare.cloudflared
   ```
2. เปิด Server ของระบบด้วยการดับเบิลคลิกไฟล์ `scripts\windows-start-server.bat`
3. ดับเบิลคลิกไฟล์ **`scripts\windows-start-quick-tunnel.bat`**
4. ในหน้าต่างสีดำ จะปรากฏกรอบข้อความพร้อม URL ที่ลงท้ายด้วย `.trycloudflare.com` เช่น:
   ```text
   +--------------------------------------------------------------------------------------------+
   |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
   |  https://bright-river-example.trycloudflare.com                                            |
   +--------------------------------------------------------------------------------------------+
   ```
5. นำ URL ที่ได้ไปใช้งานดังนี้:
   - **สำหรับผู้ใช้งานเข้าเว็บไซต์:** `https://bright-river-example.trycloudflare.com`
   - **สำหรับใส่ใน LINE Developers Console (Webhook URL):** `https://bright-river-example.trycloudflare.com/api/line/webhook`

> **ข้อควรระวัง:** ห้ามปิดหน้าต่าง Quick Tunnel ขณะใช้งาน หากปิดหน้าต่างหรือเครื่อง Restart จะได้ URL ใหม่ ซึ่งต้องนำ URL ใหม่ไปกด Update ใน LINE Developers Console อีกครั้ง

---

## 3. วิธีที่ 2: การใช้งาน Cloudflare Named Tunnel (URL ถาวรสำหรับผู้ที่มี Custom Domain)

หากคุณมีชื่อโดเมนของตนเองที่ผูกกับ Cloudflare DNS อยู่แล้ว (หรือจดโดเมนใหม่ซึ่งมีค่าจดทะเบียนโดเมนรายปีกับผู้ให้บริการรับจดโดเมน):

1. เข้าสู่หน้าแดชบอร์ด **Cloudflare Zero Trust** (https://one.dash.cloudflare.com/) -> เลือกแพ็กเกจ **Free Plan (0 บาท)**
2. ไปที่เมนู **Networks -> Tunnels** -> กดปุ่ม **Create a tunnel** -> เลือก **Cloudflared** -> ตั้งชื่อ Tunnel เช่น `line-file-server`
3. ในหน้า **Install and run a connector**:
   - เลือกหัวข้อ **Windows** -> คัดลอกคำสั่ง `cloudflared.exe service install <TOKEN>` ไปรันใน **PowerShell (Run as Administrator)**
   - คำสั่งนี้จะติดตั้ง Cloudflare Tunnel เป็น **Windows Service** ที่ทำงานเบื้องหลังตลอด 24/7 และเชื่อมต่อใหม่อัตโนมัติทันทีเมื่อเครื่อง Restart หรืออินเทอร์เน็ตหลุด
4. ในหน้า **Public Hostname**:
   - **Subdomain**: เช่น `files`
   - **Domain**: เลือกโดเมนของคุณ (จะได้ `https://files.yourdomain.com`)
   - **Service Type**: เลือก `HTTP`
   - **URL**: กรอก `127.0.0.1:3000`
   - กด **Save tunnel**
5. นำ URL ถาวร `https://files.yourdomain.com/api/line/webhook` ไปตั้งค่าใน LINE Developers Console เพียงครั้งเดียว ไม่ต้องเปลี่ยนอีกต่อไป

---

## 4. ความปลอดภัยด้านเครือข่าย (Network Security Compliance - REQ-19)

- ระบบผูกพอร์ต Web Server ไว้ที่ `127.0.0.1:3000` (Localhost เท่านั้น)
- ฐานข้อมูล SQLite ทำงานแบบ Embedded ภายในโปรเซส จึง **ไม่มีการเปิดพอร์ตของ Database ออกสู่อินเทอร์เน็ตโดยเด็ดขาด**
- **ไม่มีการเปิด SMB / Windows File Sharing ออกสู่อินเทอร์เน็ต** ทุกการดาวน์โหลดหรือดูไฟล์ต้องผ่านการตรวจสอบสิทธิ์ของระบบ Backend เท่านั้น

