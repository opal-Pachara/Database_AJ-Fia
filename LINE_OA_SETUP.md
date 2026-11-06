# คู่มือการตั้งค่า LINE Official Account และ Messaging API (LINE OA SETUP)

คู่มือนี้อธิบายวิธีเชื่อมต่อระบบเข้ากับ **LINE Official Account (LINE OA)** และวิธีการส่งไฟล์ของอาจารย์ผ่าน iPhone

---

## 1. การเปิดใช้งาน Messaging API และรับค่า Secret / Token

1. เข้าสู่เว็บไซต์ **LINE Official Account Manager** (https://manager.line.biz/) และเลือกบัญชี LINE OA ที่ต้องการใช้งาน
2. ไปที่เมนู **Settings (ตั้งค่า)** มุมขวาบน -> เลือกเมนู **Messaging API** ทางซ้ายมือ -> กด **Enable Messaging API** (เลือกหรือสร้าง Provider)
3. ไปที่ **LINE Developers Console** (https://developers.line.biz/console/) แล้วเลือก Provider และ Channel ของคุณ:
   - ที่แท็บ **Basic settings**:
     - เลื่อนลงมาที่หัวข้อ **Channel secret** -> คัดลอกค่าไปใส่ในไฟล์ `.env` ที่ตัวแปร `LINE_CHANNEL_SECRET=`
   - ที่แท็บ **Messaging API**:
     - เลื่อนลงมาล่างสุดที่หัวข้อ **Channel access token (long-lived)** -> กดปุ่ม **Issue** -> คัดลอกค่าที่ได้ไปใส่ในไฟล์ `.env` ที่ตัวแปร `LINE_CHANNEL_ACCESS_TOKEN=`

---

## 2. การตั้งค่า Webhook URL และการตอบกลับ

1. ในหน้า **LINE Developers Console -> แท็บ Messaging API**:
   - ที่หัวข้อ **Webhook settings**:
     - ช่อง **Webhook URL**: ใส่ URL ที่ได้จาก Cloudflare Tunnel ตามด้วย `/api/line/webhook`
       ตัวอย่าง: `https://xxxx.trycloudflare.com/api/line/webhook` (หรือ `https://files.yourdomain.com/api/line/webhook`)
     - กดปุ่ม **Update** แล้วกดปุ่ม **Verify** (ต้องขึ้นข้อความ **Success**)
     - เปิดสวิตช์ **Use webhook** ให้เป็นสีเขียว (Enabled)
     - เปิดสวิตช์ **Webhook redelivery** (หากมีให้เลือก) เพื่อให้ LINE ส่งซ้ำอัตโนมัติกรณีเน็ตสะดุด
2. ปิดข้อความตอบกลับอัตโนมัติของ LINE OA เพื่อไม่ให้ชนกับข้อความตอบกลับของระบบ:
   - ในหน้า **LINE Official Account Manager -> Settings -> Response settings (การตั้งค่าการตอบกลับ)**:
     - **Auto-response messages (ข้อความตอบกลับอัตโนมัติ)**: ตั้งเป็น **Disabled (ปิด)**
     - **Webhooks**: ตั้งเป็น **Enabled (เปิด)**

---

## 3. การตั้งค่าให้รับไฟล์เฉพาะจาก LINE ของอาจารย์เพียงคนเดียว (REQ-02)

1. ในแชท LINE OA บน iPhone ของอาจารย์ ให้ลองส่งข้อความหรือไฟล์ทดสอบมา 1 ครั้ง
2. เปิดหน้าเว็บไซต์ของระบบ Login ด้วยบัญชี **Admin** -> ไปที่แท็บ **บันทึกการทำงาน (Webhook & Backup Logs)**
3. ดูคอลัมน์ **ผู้ส่ง (LINE userId)** ของอาจารย์ (จะเป็นรหัส 33 ตัวอักษรที่ขึ้นต้นด้วย `U...`)
4. คัดลอกรหัส `U...` นั้นไปใส่ในไฟล์ `.env`:
   ```env
   ALLOWED_SENDER_LINE_USER_ID=Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
5. รีสตาร์ท Server 1 ครั้ง ตั้งแต่นี้เป็นต้นไป ระบบจะอนุญาตให้เฉพาะบัญชี LINE ของอาจารย์เท่านั้นที่สามารถส่งไฟล์หรือลิงก์เข้าสู่ระบบได้

---

## 4. วิธีการส่งไฟล์และลิงก์จาก iPhone ของอาจารย์ (REQ-02, REQ-03, REQ-14)

### 4.1 การแชร์ไฟล์จากแอปใน iPhone (iOS Share Sheet)
1. เปิดแอป **Files (ไฟล์)** หรือ **Photos (รูปภาพ)** บน iPhone
2. เลือกไฟล์ที่ต้องการส่ง -> กดปุ่ม **Share (ปุ่มสี่เหลี่ยมมีลูกศรชี้ขึ้น)** -> เลือกแอป **LINE**
3. เลือกบัญชี **LINE OA** ของระบบ (สามารถพิมพ์ข้อความแนบในช่อง *"ใส่ข้อความ / Add a message"* ก่อนกดส่งได้)
4. เมื่อระบบดาวน์โหลดไฟล์และบันทึกลงเครื่อง Server เสร็จสมบูรณ์ LINE OA จะส่งข้อความตอบกลับแจ้ง:
   - ชื่อไฟล์
   - ผู้รับไฟล์
   - ขนาดไฟล์
   - สถานะการจัดเก็บสำเร็จ

### 4.2 การแนบข้อความเพิ่มเติมด้วยการกด Reply (Quote Message)
- หากอาจารย์แชร์ไฟล์จากแอปบางตัวบน iPhone ที่ส่งตัวไฟล์ไปทันทีโดยไม่มีช่องให้พิมพ์ข้อความ อาจารย์สามารถเปิดแอป LINE แล้ว **ปัดขวา (Reply/Quote)** ที่ไฟล์นั้นเพื่อพิมพ์ข้อความตามหลังได้ทันที ระบบจะจับคู่ข้อความเข้ากับไฟล์นั้นด้วย `quotedMessageId` อย่างแม่นยำ 100%

### 4.3 การส่งลิงก์ (URL)
- อาจารย์สามารถวางลิงก์ (`https://...`) พร้อมข้อความอธิบายในแชท LINE OA หรือกด Share เว็บไซต์จาก Safari มายัง LINE OA ได้โดยตรง ระบบจะบันทึกเป็นรายการ Link บนหน้าเว็บไซต์โดยไม่ดาวน์โหลดเนื้อหาของเว็บไซต์นั้นมาเก็บในเครื่อง

