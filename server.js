// المثلث · نظام عيادة الأطفال — خادم الشبكة الداخلية
// يعمل على جهاز واحد في العيادة، ويتصل به الطبيب والاستعلامات من المتصفح على أي جهاز في الشبكة.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Store } = require('./lib/store');
const { License } = require('./lib/license');
const { createCore, localDate } = require('./lib/core');
const Dose = require('./public/dose');

const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};
const SESSION_HOURS = 12;

function createApp(opts = {}) {
  const dataDir = opts.dataDir || path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const store = new Store(dataDir);
  const license = new License(dataDir);
  const sessions = new Map();
  const failures = new Map();
  const clients = new Set();
  const displayClients = new Set();

  setInterval(() => license.touch(), 10 * 60 * 1000).unref();

  function broadcast(type, data) {
    const msg = 'event: ' + type + '\ndata: ' + JSON.stringify(data || {}) + '\n\n';
    for (const c of clients) { try { c.res.write(msg); } catch { clients.delete(c); } }
    if (type === 'queue' || type === 'call') {
      const d = 'event: display\ndata: ' + JSON.stringify(core.displayState()) + '\n\n';
      for (const r of displayClients) { try { r.write(d); } catch { displayClients.delete(r); } }
    }
  }
  setInterval(() => {
    for (const c of clients) { try { c.res.write(': ping\n\n'); } catch { clients.delete(c); } }
    for (const r of displayClients) { try { r.write(': ping\n\n'); } catch { displayClients.delete(r); } }
  }, 25000).unref();

  const core = createCore({
    db: () => store.db,
    save: () => store.save(),
    id: () => store.id(),
    license,
    broadcast,
    ageMonths: dob => Dose.ageMonths(dob),
    hashPassword: async pw => {
      const salt = crypto.randomBytes(16).toString('hex');
      return { salt, hash: crypto.scryptSync(String(pw), salt, 64).toString('hex') };
    },
    checkPassword: async (user, pw) => {
      const h = crypto.scryptSync(String(pw), user.salt, 64);
      const ref = Buffer.from(user.hash, 'hex');
      return h.length === ref.length && crypto.timingSafeEqual(h, ref);
    },
    dropSessions: userId => { for (const [k, s] of sessions) if (s.userId === userId) sessions.delete(k); }
  });

  function parseCookies(req) {
    const out = {};
    (req.headers.cookie || '').split(';').forEach(p => {
      const i = p.indexOf('=');
      if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    });
    return out;
  }
  function currentUser(req) {
    const sid = parseCookies(req).ped_sid;
    if (!sid) return null;
    const s = sessions.get(sid);
    if (!s || s.exp < Date.now()) { sessions.delete(sid); return null; }
    const u = store.db.users.find(x => x.id === s.userId);
    if (!u || u.active === false) return null;
    s.exp = Date.now() + SESSION_HOURS * 3600e3;
    return u;
  }
  function send(res, code, obj, headers) {
    res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
    res.end(JSON.stringify(obj));
  }
  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => {
        size += c.length;
        if (size > limit) { reject(Object.assign(new Error('حجم البيانات كبير جداً'), { code: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(Object.assign(new Error('بيانات غير صالحة'), { code: 400 })); }
      });
      req.on('error', reject);
    });
  }
  const sse = (res) => res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });

  // مسارات خاصة بالخادم: الجلسات، البث المباشر، النسخ الاحتياطي
  async function serverRoute(method, p, req, res, user) {
    if (method === 'POST' && p === '/api/login') {
      const ip = req.socket.remoteAddress;
      const f = failures.get(ip) || { n: 0, t: Date.now() };
      if (Date.now() - f.t > 10 * 60e3) { f.n = 0; f.t = Date.now(); }
      if (f.n >= 8) return send(res, 429, { error: 'محاولات كثيرة، حاول بعد 10 دقائق' });
      const body = await readBody(req, 1e5);
      let u;
      try { u = await core.login(body.username, body.password); }
      catch (e) { f.n++; failures.set(ip, f); return send(res, 401, { error: e.message }); }
      failures.delete(ip);
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.set(sid, { userId: u.id, exp: Date.now() + SESSION_HOURS * 3600e3 });
      return send(res, 200, { user: core.publicUser(u) }, { 'Set-Cookie': 'ped_sid=' + sid + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + SESSION_HOURS * 3600 });
    }
    if (method === 'POST' && p === '/api/logout') {
      sessions.delete(parseCookies(req).ped_sid);
      return send(res, 200, { ok: true }, { 'Set-Cookie': 'ped_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (method === 'GET' && p === '/api/display/events') {
      sse(res);
      res.write('retry: 3000\nevent: display\ndata: ' + JSON.stringify(core.displayState()) + '\n\n');
      displayClients.add(res);
      req.on('close', () => displayClients.delete(res));
      return true;
    }
    const isServerOnly = ['/api/events', '/api/backup', '/api/restore'].includes(p);
    if (!isServerOnly) return false;
    if (!user) return send(res, 401, { error: 'يجب تسجيل الدخول' });
    if (p === '/api/events' && method === 'GET') {
      sse(res);
      res.write('retry: 3000\n\n');
      const c = { res, role: user.role };
      clients.add(c);
      req.on('close', () => clients.delete(c));
      return true;
    }
    if (user.role !== 'doctor') return send(res, 403, { error: 'هذه العملية خاصة بحساب الطبيب' });
    if (p === '/api/backup' && method === 'GET') {
      store.flush();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="pediatric-clinic-backup-' + localDate(new Date()) + '.json"' });
      res.end(JSON.stringify(store.db));
      return true;
    }
    if (p === '/api/restore' && method === 'POST') {
      const body = await readBody(req, 100e6);
      try { core.validateBackup(body); } catch (e) { return send(res, 400, { error: e.message }); }
      store.replace(body);
      sessions.clear();
      broadcast('reload');
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'غير موجود' });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (!p.startsWith('/api/')) return serveStatic(p, res);
    try {
      const user = currentUser(req);
      if (await serverRoute(req.method, p, req, res, user) !== false) return;
      const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req, 1e6) : {};
      const r = await core.dispatch(req.method, p, { user, body, query: url.searchParams });
      send(res, r.status, r.data);
    } catch (e) {
      if (!e.code) console.error(e);
      if (!res.headersSent) send(res, e.code || 500, { error: e.code ? e.message : 'خطأ في الخادم' });
    }
  }

  function serveStatic(p, res) {
    if (p === '/') p = '/index.html';
    if (p === '/display') p = '/display.html';
    const file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('غير موجود'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }

  const server = http.createServer(handle);
  server.on('close', () => store.flush());
  return { server, store, license };
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { server, store } = createApp({ dataDir: process.env.DATA_DIR });
  server.listen(port, '0.0.0.0', () => {
    console.log('');
    console.log('  المثلث · نظام عيادة الأطفال');
    console.log('  حقوق البرمجة © أصيل الصافي');
    console.log('  ---------------------------------------------');
    console.log('  على هذا الجهاز:   http://localhost:' + port);
    for (const ip of lanAddresses()) console.log('  من أجهزة الشبكة:  http://' + ip + ':' + port);
    console.log('  شاشة الانتظار:    /display');
    console.log('  لا تغلق هذه النافذة طالما العيادة تعمل.');
    console.log('');
  });
  const stop = () => { store.flush(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

module.exports = { createApp };
