# Claude Code Bridge 🤖

ช่องแชทในเครื่อง สำหรับคุยและสั่งงาน **Claude Code** ผ่านหน้าเว็บ
(ปุ่ม "💬 Claude Code" บนหน้า dashboard จะลิงก์มาที่นี่)

## วิธีใช้
1. **ดับเบิลคลิก `start.bat`** (หรือสั่ง `node server.mjs` ในโฟลเดอร์นี้)
2. เบราว์เซอร์จะเปิด `http://localhost:4317` ให้เอง
3. พิมพ์คำสั่งได้เลย เช่น "แก้ไฟล์ index.html เพิ่มปุ่ม X" หรือ "clasp push โปรเจกต์ election"
4. ปิดหน้าต่าง command (Ctrl+C) เมื่อเลิกใช้

## มันทำงานยังไง
หน้าเว็บ → `localhost:4317` → สั่ง `claude -p --output-format stream-json` ในเครื่อง
→ ใช้ login เดิมของ Claude Code (ไม่ต้องใส่ API key)

## ⚠️ ความปลอดภัย — อ่านให้ครบ
- Bridge ฟังเฉพาะ **127.0.0.1 (localhost)** = ใช้ได้เฉพาะคอมเครื่องนี้ เครื่องอื่น/มือถือเข้าไม่ได้
- ทุกคำขอต้องมี **token** (อยู่ใน `config.json`) → เว็บอื่นที่เปิดอยู่สั่งงานไม่ได้
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
| `token` | เว้นเป็น `REPLACE_ME` ได้ ระบบจะสุ่มให้เองตอนรันครั้งแรก |

## อยากใช้จากมือถือ? (เปิด tunnel — ทำเมื่อจำเป็น)
1. ติดตั้ง `cloudflared` (`winget install cloudflare.cloudflared`)
2. `cloudflared tunnel --url http://localhost:4317`
3. จะได้ URL https สาธารณะ — **ใครรู้ URL+token ก็สั่งคอมได้** จึงควรเปิดเฉพาะตอนใช้ แล้วปิดทันที
