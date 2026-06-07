// เปิด Cloudflare quick tunnel → localhost:PORT แล้ว "ประกาศ" ลิงก์ขึ้นทะเบียน GAS อัตโนมัติ
// หน้า dashboard จะอ่านลิงก์นี้เอง (ไม่ต้องพิมพ์/วางลิงก์)
// รันด้วย:  node --use-system-ca tunnel.mjs   (ผ่าน tunnel.bat)
import { spawn } from 'node:child_process';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dir, 'config.json'), 'utf8'));
const PORT = cfg.port || 4317;
const CF = cfg.cloudflaredPath || 'cloudflared';

// ประกาศ/ล้างลิงก์ขึ้น dashboard (ผ่าน gas-api setBridge)
function publish(url) {
  return new Promise(resolve => {
    if (!cfg.dashboardApi || !cfg.bridgeKey) {
      console.log('(ข้ามประกาศ: ยังไม่ตั้ง dashboardApi/bridgeKey ใน config.json)');
      return resolve(false);
    }
    let u;
    try { u = new URL(cfg.dashboardApi); } catch { return resolve(false); }
    u.searchParams.set('action', 'setBridge');
    u.searchParams.set('key', cfg.bridgeKey);
    u.searchParams.set('url', url);
    const req = https.get(u, res => { res.resume(); res.on('end', () => resolve(true)); });
    req.on('error', e => { console.log('  ประกาศลิงก์ไม่สำเร็จ:', e.message); resolve(false); });
    req.setTimeout(15000, () => { req.destroy(); resolve(false); });
  });
}

console.log('============================================================');
console.log('  เปิด Cloudflare Tunnel → localhost:' + PORT);
console.log('  (ปิดหน้าต่างนี้ = ปิด tunnel + ล้างลิงก์ออกจาก dashboard)');
console.log('============================================================\n');

const child = spawn(CF, ['tunnel', '--url', 'http://localhost:' + PORT, '--no-autoupdate'], { windowsHide: false });

let announced = false;
function scan(buf) {
  const s = buf.toString('utf8');
  process.stdout.write(s);
  if (!announced) {
    const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      announced = true;
      const url = m[0];
      console.log('\n>>> ลิงก์ tunnel: ' + url);
      console.log('>>> กำลังประกาศขึ้น dashboard...');
      publish(url).then(ok => {
        console.log(ok
          ? '>>> ✅ ประกาศแล้ว! เปิด dashboard บนมือถือ → ปุ่มแชทจะออนไลน์เอง\n'
          : '>>> ⚠️ ประกาศไม่สำเร็จ (เช็ค dashboardApi/bridgeKey) แต่ tunnel ยังใช้ได้\n');
      });
      // heartbeat: ประกาศซ้ำทุก 3 นาที (กันประกาศครั้งแรกพลาด + ยืนยันยังออนไลน์)
      setInterval(() => publish(url), 180000);
    }
  }
}
child.stdout.on('data', scan);
child.stderr.on('data', scan);   // cloudflared พิมพ์ URL ทาง stderr

let closing = false;
async function shutdown() {
  if (closing) return; closing = true;
  console.log('\nกำลังล้างลิงก์ออกจาก dashboard...');
  await publish('');
  try { child.kill(); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
child.on('close', async () => { if (!closing) { await publish(''); } process.exit(0); });
