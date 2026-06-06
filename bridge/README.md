# Claude Code Bridge 🤖

ช่องแชทในเครื่อง สำหรับคุยและสั่งงาน **Claude Code** ผ่านหน้าเว็บ
(ปุ่ม "💬 Claude Code" บนหน้า dashboard จะลิงก์มาที่นี่)

## วิธีใช้
1. **ดับเบิลคลิก `start.bat`** (หรือสั่ง `node server.mjs` ในโฟลเดอร์นี้)
2. เบราว์เซอร์จะเปิด `http://localhost:4317` ให้เอง
3. **กรอกรหัสผ่าน** (ดูได้จากหน้าต่างดำตอนเปิด หรือใน `config.json` ช่อง `password`)
4. พิมพ์คำสั่งได้เลย เช่น "แก้ไฟล์ index.html เพิ่มปุ่ม X" หรือ "clasp push โปรเจกต์ election"
5. กด "ออกจากระบบ" เมื่อเลิกใช้ และปิดหน้าต่าง command (Ctrl+C)

## 🚫 ห้ามทำ — บั๊กฆ่าตัวเอง
อย่าสั่งให้ Claude (ในแชทนี้) **kill/restart เซิร์ฟเวอร์ node ที่ฟัง port 4317** —
เพราะนั่นคือตัว bridge เอง การ `taskkill` มันจะตัดสายขณะกำลังตอบ (ขึ้น "network error")
ถ้าต้องโหลดโค้ดใหม่ ให้ **ปิดหน้าต่าง command แล้วเปิด `start.bat` ใหม่เองจากเครื่อง**

## มันทำงานยังไง
หน้าเว็บ → `localhost:4317` → สั่ง `claude -p --output-format stream-json` ในเครื่อง
→ ใช้ login เดิมของ Claude Code (ไม่ต้องใส่ API key)

## ⚠️ ความปลอดภัย — อ่านให้ครบ
- Bridge ฟังเฉพาะ **127.0.0.1 (localhost)** = ใช้ได้เฉพาะคอมเครื่องนี้ เครื่องอื่น/มือถือเข้าไม่ได้
- **ต้อง login ด้วยรหัสผ่าน** ก่อนใช้ → ได้ session cookie (อายุ `sessionTtlHours` ชม.)
- ใส่รหัสผิดเกิน 5 ครั้ง → ล็อก IP นั้น 5 นาที (กันเดารหัส)
- ตั้งค่า **Telegram** ได้ → แจ้งเตือนทุกครั้งที่มีคน login สำเร็จ/ใส่รหัสผิด (IP + เวลา + อุปกรณ์)
- ทุกคำขอแชทต้องมี **token** (ฝังในหน้าหลัง login) → เว็บอื่นที่เปิดอยู่สั่งงานไม่ได้
- ค่าเริ่มต้น `permissionMode: acceptEdits` + อนุญาต `Bash` → **Claude แก้ไฟล์/รันคำสั่งได้เองโดยไม่ถาม** (เหมือนพิมพ์ในเทอร์มินัล) ระวังคำสั่งที่ลบไฟล์
- **อย่า commit `config.json` ขึ้น GitHub** (มี token) — ใส่ใน .gitignore แล้ว

## ตั้งค่า (`config.json`)
| ฟิลด์ | ความหมาย |
|------|---------|
| `workdir` | โฟลเดอร์ที่ Claude ทำงาน (ค่าเริ่ม = โฟลเดอร์ work-dashboard) |
| `addDirs` | โฟลเดอร์อื่นให้เข้าถึงได้ เช่น `["C:\\\\Users\\\\notey\\\\projects"]` |
| `model` | `opus` / `sonnet` / `haiku` |
| `permissionMode` | `acceptEdits` (แก้ไฟล์ไม่ถาม) / `plan` (วางแผนอย่างเดียว) / `default` |
| `allowedTools` | เครื่องมือที่อนุญาตโดยไม่ถาม — เอา `"Bash"` ออกถ้าไม่อยากให้รันคำสั่ง |
| `password` | รหัสผ่านเข้าระบบ (เปลี่ยนเป็นรหัสที่จำง่ายได้); เว้น `REPLACE_ME` = สุ่มให้ |
| `sessionTtlHours` | อายุการ login ก่อนต้องกรอกรหัสใหม่ (ชม.) ค่าเริ่ม 12 |
| `telegram` | `{ "botToken": "...", "chatId": "..." }` ใส่เพื่อรับแจ้งเตือน login (เว้นว่าง = ปิด) |
| `token` | เว้นเป็น `REPLACE_ME` ได้ ระบบจะสุ่มให้เองตอนรันครั้งแรก |

### ตั้งค่าแจ้งเตือน Telegram (ถ้าต้องการ)
1. แชทกับ **@BotFather** ใน Telegram → `/newbot` → ได้ `botToken`
2. แชทกับบอทที่สร้าง (ทักอะไรก็ได้) แล้วเปิด `https://api.telegram.org/bot<botToken>/getUpdates` → หา `chat.id` = `chatId`
3. ใส่ทั้งสองค่าใน `config.json` ช่อง `telegram` แล้วรีสตาร์ต

## อยากใช้จากมือถือ? (เปิด tunnel — ทำเมื่อจำเป็น)
1. ติดตั้ง `cloudflared` (`winget install cloudflare.cloudflared`)
2. `cloudflared tunnel --url http://localhost:4317`
3. จะได้ URL https สาธารณะ — **ใครรู้ URL+token ก็สั่งคอมได้** จึงควรเปิดเฉพาะตอนใช้ แล้วปิดทันที
