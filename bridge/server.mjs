// Claude Code Bridge — เชื่อมหน้าเว็บแชทกับ Claude Code ในเครื่อง
// รันด้วย:  node server.mjs   (หรือดับเบิลคลิก start.bat)
// ฟังเฉพาะ localhost + ต้องมี token → ปลอดภัย ใช้ได้เฉพาะเครื่องนี้
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const CFG_PATH = join(__dir, 'config.json');

// ---- โหลด/สร้าง config ----
function loadConfig() {
  if (!existsSync(CFG_PATH)) {
    const def = {
      port: 4317,
      token: randomUUID(),
      claudePath: 'C:\\Users\\notey\\.local\\bin\\claude.exe',
      workdir: dirname(__dir),
      addDirs: [],
      model: 'opus',
      permissionMode: 'acceptEdits',
      allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch', 'TodoWrite']
    };
    writeFileSync(CFG_PATH, JSON.stringify(def, null, 2), 'utf8');
    console.log('สร้าง config.json ใหม่ (token สุ่มให้แล้ว)');
    return def;
  }
  const c = JSON.parse(readFileSync(CFG_PATH, 'utf8'));
  // ถ้ายังเป็น token ตัวอย่าง → สุ่มให้ใหม่แล้วเซฟ
  if (!c.token || c.token === 'REPLACE_ME') {
    c.token = randomUUID();
    writeFileSync(CFG_PATH, JSON.stringify(c, null, 2), 'utf8');
    console.log('ตั้ง token ใหม่ให้อัตโนมัติแล้ว');
  }
  return c;
}
const cfg = loadConfig();

// ---- หน้า chat.html (ฝัง token ตอนเสิร์ฟ) ----
function serveChat(res) {
  let html = readFileSync(join(__dir, 'chat.html'), 'utf8');
  html = html.replace('__BRIDGE_TOKEN__', cfg.token);
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

// ---- HTTP server ----
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${cfg.port}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return serveChat(res);
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, workdir: cfg.workdir, model: cfg.model }));
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    // ตรวจ token
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${cfg.token}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'token ไม่ถูกต้อง' }));
    }
    const chunks = [];
    let size = 0;
    req.on('data', c => { chunks.push(c); size += c.length; if (size > 1e6) req.destroy(); });
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      let data;
      try { data = JSON.parse(body); } catch { data = {}; }
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
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(cfg.port, '127.0.0.1', () => {
  console.log('');
  console.log('  🤖 Claude Code Bridge พร้อมแล้ว');
  console.log('  เปิดแชทที่:  http://localhost:' + cfg.port);
  console.log('  workdir   :  ' + cfg.workdir);
  console.log('  model     :  ' + cfg.model + '   permission: ' + cfg.permissionMode);
  console.log('  token     :  ' + cfg.token);
  console.log('  (ปิดด้วย Ctrl+C)');
  console.log('');
});
