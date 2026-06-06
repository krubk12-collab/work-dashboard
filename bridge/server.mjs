// Claude Code Bridge — เชื่อมหน้าเว็บแชทกับ Claude Code ในเครื่อง
// รันด้วย:  node server.mjs   (หรือดับเบิลคลิก start.bat)
// ปลอดภัยด้วย: รหัสผ่าน (login) + session cookie + แจ้งเตือน Telegram + กันเดารหัส
import http from 'node:http';
import https from 'node:https';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const CFG_PATH = join(__dir, 'config.json');

// ---- โหลด/สร้าง config ----
function loadConfig() {
  let c;
  if (!existsSync(CFG_PATH)) {
    c = {
      port: 4317,
      token: randomUUID(),
      password: randomUUID().slice(0, 8),
      sessionTtlHours: 12,
      telegram: { botToken: '', chatId: '' },
      claudePath: 'C:\\Users\\notey\\.local\\bin\\claude.exe',
      workdir: dirname(__dir),
      addDirs: [],
      model: 'opus',
      permissionMode: 'acceptEdits',
      allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch', 'TodoWrite']
    };
    writeFileSync(CFG_PATH, JSON.stringify(c, null, 2), 'utf8');
    console.log('สร้าง config.json ใหม่ (token + password สุ่มให้แล้ว)');
    return c;
  }
  c = JSON.parse(readFileSync(CFG_PATH, 'utf8'));
  // migrate: เติมฟิลด์ใหม่ให้ config เก่า แล้วเซฟถ้ามีอะไรเปลี่ยน
  let changed = false;
  if (!c.token || c.token === 'REPLACE_ME') { c.token = randomUUID(); changed = true; }
  if (!c.password || c.password === 'REPLACE_ME') { c.password = randomUUID().slice(0, 8); changed = true; }
  if (typeof c.sessionTtlHours !== 'number') { c.sessionTtlHours = 12; changed = true; }
  if (!c.telegram || typeof c.telegram !== 'object') { c.telegram = { botToken: '', chatId: '' }; changed = true; }
  if (changed) {
    writeFileSync(CFG_PATH, JSON.stringify(c, null, 2), 'utf8');
    console.log('อัปเดต config.json (เติม password/telegram/session ให้แล้ว)');
  }
  return c;
}
const cfg = loadConfig();

// ---- แจ้งเตือน Telegram (ไม่ตั้งค่าก็ข้ามเงียบๆ) ----
function notifyTelegram(text) {
  const t = cfg.telegram || {};
  if (!t.botToken || !t.chatId) return;
  const q = `chat_id=${encodeURIComponent(t.chatId)}&text=${encodeURIComponent(text)}&disable_web_page_preview=true`;
  const path = `/bot${t.botToken}/sendMessage?${q}`;
  const req = https.request({ hostname: 'api.telegram.org', path, method: 'GET', timeout: 8000 }, res => {
    res.resume();
  });
  req.on('error', e => console.log('แจ้งเตือน Telegram ไม่สำเร็จ:', e.message));
  req.on('timeout', () => req.destroy());
  req.end();
}

// ---- session (เก็บในหน่วยความจำ; รีสตาร์ตแล้วต้อง login ใหม่) ----
const sessions = new Map(); // id -> expiryMs
const SESSION_MS = Math.max(1, cfg.sessionTtlHours) * 3600 * 1000;
function newSession() {
  const id = randomUUID() + randomUUID();
  sessions.set(id, Date.now() + SESSION_MS);
  return id;
}
function parseCookies(req) {
  const out = {};
  const raw = req.headers['cookie'] || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function hasSession(req) {
  const id = parseCookies(req)['ccb_session'];
  if (!id) return false;
  const exp = sessions.get(id);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(id); return false; }
  return true;
}
function clientIp(req) {
  return (req.headers['cf-connecting-ip']
    || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress || '?').toString();
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// ---- กันเดารหัส (rate limit ต่อ IP) ----
const attempts = new Map(); // ip -> { count, lockUntil }
const MAX_FAILS = 5, LOCK_MS = 5 * 60 * 1000;
function isLocked(ip) {
  const a = attempts.get(ip);
  return !!(a && a.lockUntil && Date.now() < a.lockUntil);
}
function recordFail(ip) {
  const a = attempts.get(ip) || { count: 0, lockUntil: 0 };
  a.count++;
  if (a.count >= MAX_FAILS) { a.lockUntil = Date.now() + LOCK_MS; a.count = 0; }
  attempts.set(ip, a);
}
function clearFails(ip) { attempts.delete(ip); }

// ---- เสิร์ฟไฟล์ HTML ----
function serveFile(res, name, replaceToken) {
  let html = readFileSync(join(__dir, name), 'utf8');
  if (replaceToken) html = html.replace('__BRIDGE_TOKEN__', cfg.token);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// ---- เรียก claude แบบสตรีม ----
function runClaude(res, message, sessionId) {
  const sse = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', cfg.permissionMode,
    '--model', cfg.model
  ];
  for (const d of (cfg.addDirs || [])) args.push('--add-dir', d);
  if (cfg.allowedTools?.length) args.push('--allowedTools', cfg.allowedTools.join(' '));

  let sid = sessionId;
  if (sid) {
    args.push('--resume', sid);
  } else {
    sid = randomUUID();
    args.push('--session-id', sid);
    sse('session', { sessionId: sid });
  }

  const child = spawn(cfg.claudePath, args, {
    cwd: cfg.workdir,
    windowsHide: true,
    env: process.env
  });

  child.stdin.write(message, 'utf8');
  child.stdin.end();

  let buf = '';
  child.stdout.on('data', chunk => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      handleEvent(ev, sse);
    }
  });

  let errBuf = '';
  child.stderr.on('data', d => { errBuf += d.toString('utf8'); });

  child.on('close', code => {
    if (code !== 0 && errBuf.trim()) sse('error', { message: errBuf.trim().slice(0, 2000) });
    sse('end', { code });
    res.end();
  });
  child.on('error', err => {
    sse('error', { message: 'เรียก claude ไม่ได้: ' + err.message });
    sse('end', { code: -1 });
    res.end();
  });

  res.on('close', () => { try { child.kill(); } catch {} });
}

function handleEvent(ev, sse) {
  if (ev.type === 'system' && ev.subtype === 'init') {
    if (ev.session_id) sse('session', { sessionId: ev.session_id });
    return;
  }
  if (ev.type === 'assistant' && ev.message?.content) {
    for (const block of ev.message.content) {
      if (block.type === 'text' && block.text) sse('text', { text: block.text });
      else if (block.type === 'tool_use') {
        sse('tool', { name: block.name, input: briefInput(block.input) });
      }
    }
    return;
  }
  if (ev.type === 'result') {
    sse('result', {
      text: ev.result || '',
      isError: !!ev.is_error,
      sessionId: ev.session_id,
      durationMs: ev.duration_ms,
      cost: ev.total_cost_usd
    });
  }
}

function briefInput(input) {
  if (!input) return '';
  try {
    const s = JSON.stringify(input);
    return s.length > 300 ? s.slice(0, 300) + '…' : s;
  } catch { return ''; }
}

function readBody(req, cb) {
  const chunks = [];
  let size = 0;
  req.on('data', c => { chunks.push(c); size += c.length; if (size > 1e6) req.destroy(); });
  req.on('end', () => cb(Buffer.concat(chunks).toString('utf8')));
}

// ---- HTTP server ----
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${cfg.port}`);
  const ip = clientIp(req);

  // หน้าแรก: ยังไม่ login → หน้ากรอกรหัส, login แล้ว → หน้าแชท (ฝัง token)
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return hasSession(req) ? serveFile(res, 'chat.html', true) : serveFile(res, 'login.html', false);
  }

  // เข้าสู่ระบบ
  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (isLocked(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'ลองผิดหลายครั้ง ถูกล็อกชั่วคราว 5 นาที' }));
    }
    return readBody(req, body => {
      let data; try { data = JSON.parse(body); } catch { data = {}; }
      const ok = data.password && safeEqual(data.password, cfg.password);
      const when = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
      const ua = (req.headers['user-agent'] || '?').slice(0, 120);
      if (!ok) {
        recordFail(ip);
        notifyTelegram(`⚠️ Claude Code Bridge: ใส่รหัสผิด\n🕐 ${when}\n🌐 IP: ${ip}\n📱 ${ua}`);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'รหัสผ่านไม่ถูกต้อง' }));
      }
      clearFails(ip);
      const sid = newSession();
      notifyTelegram(`✅ Claude Code Bridge: เข้าสู่ระบบสำเร็จ\n🕐 ${when}\n🌐 IP: ${ip}\n📱 ${ua}`);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `ccb_session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}`
      });
      res.end(JSON.stringify({ ok: true }));
    });
  }

  // ออกจากระบบ
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const id = parseCookies(req)['ccb_session'];
    if (id) sessions.delete(id);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'ccb_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  // health: ต้อง login แล้ว
  if (req.method === 'GET' && url.pathname === '/health') {
    if (!hasSession(req)) { res.writeHead(401); return res.end('{"error":"unauthorized"}'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, workdir: cfg.workdir, model: cfg.model }));
  }

  // แชท: ต้องมี session cookie + token
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    if (!hasSession(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'ยังไม่ได้เข้าสู่ระบบ' }));
    }
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${cfg.token}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'token ไม่ถูกต้อง' }));
    }
    return readBody(req, body => {
      let data; try { data = JSON.parse(body); } catch { data = {}; }
      const message = (data.message || '').toString();
      if (!message.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'ไม่มีข้อความ' }));
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      runClaude(res, message, data.sessionId || null);
    });
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(cfg.port, '127.0.0.1', () => {
  const tg = (cfg.telegram?.botToken && cfg.telegram?.chatId) ? 'เปิด' : 'ปิด (ยังไม่ตั้งค่า)';
  console.log('');
  console.log('  🤖 Claude Code Bridge พร้อมแล้ว');
  console.log('  เปิดแชทที่:  http://localhost:' + cfg.port);
  console.log('  workdir   :  ' + cfg.workdir);
  console.log('  model     :  ' + cfg.model + '   permission: ' + cfg.permissionMode);
  console.log('  รหัสผ่าน   :  ' + cfg.password + '   (เปลี่ยนได้ใน config.json)');
  console.log('  แจ้งเตือน  :  Telegram ' + tg);
  console.log('  (ปิดด้วย Ctrl+C)');
  console.log('');
});
