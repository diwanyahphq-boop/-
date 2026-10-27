// نسخة الهاتف: نفس منطق النظام يعمل داخل الهاتف بدون خادم، والبيانات محفوظة في ذاكرة الجهاز
(function () {
  'use strict';
  const Core = window.ClinicCore, Serial = window.MthSerial;
  const DB_KEY = 'ped-db-v1', LIC_KEY = 'mth-lic-v1', SES_KEY = 'ped-session-v1';
  const PROGRAM_CODE = 'PED', TRIAL_DAYS = 14, TRIAL_PATIENT_LIMIT = 30;
  const mem = {};
  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v === null ? (mem[k] ?? null) : v; } catch { return mem[k] ?? null; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch { /* التخزين غير متاح — تبقى البيانات في الذاكرة */ } },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch { /* */ } }
  };
  const rand = n => { const a = new Uint8Array(n); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); return a; };
  const hex = a => Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  const newId = () => hex(rand(8));

  // ---------- البيانات ----------
  let db;
  try { db = JSON.parse(store.get(DB_KEY) || 'null'); } catch { db = null; }
  const base = Core.emptyDb(window.PED_DRUGS);
  if (!db) db = base;
  else { for (const k of Object.keys(base)) if (db[k] === undefined) db[k] = base[k]; db.settings = Object.assign(base.settings, db.settings); }
  let timer;
  const save = () => { clearTimeout(timer); timer = setTimeout(flush, 100); };
  const flush = () => { clearTimeout(timer); store.set(DB_KEY, JSON.stringify(db)); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  // ---------- الترخيص (معيار المثلث) ----------
  function licData() {
    let d;
    try { d = JSON.parse(store.get(LIC_KEY) || 'null'); } catch { d = null; }
    if (!d || !d.machine) {
      const b = rand(12); let m = '';
      for (let i = 0; i < 12; i++) m += Serial.ALPHA[b[i] % Serial.ALPHA.length];
      d = { machine: m.match(/.{4}/g).join('-'), trialStart: Date.now(), lastSeen: Date.now(), serial: null };
    }
    d.lastSeen = Math.max(Date.now(), d.lastSeen || 0);
    store.set(LIC_KEY, JSON.stringify(d));
    return d;
  }
  const license = {
    status() {
      const d = licData();
      const activated = !!d.serial && Serial.norm(d.serial) === Serial.norm(Serial.serialFor(PROGRAM_CODE, d.machine));
      const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - (d.lastSeen - d.trialStart) / 86400000));
      return { program: PROGRAM_CODE, machine: d.machine, activated, trial: !activated, daysLeft: activated ? null : daysLeft,
        expired: !activated && daysLeft <= 0, patientLimit: activated ? null : TRIAL_PATIENT_LIMIT, trialDays: TRIAL_DAYS };
    },
    activate(serial) {
      const d = licData();
      if (Serial.norm(serial) !== Serial.norm(Serial.serialFor(PROGRAM_CODE, d.machine))) return false;
      d.serial = Serial.serialFor(PROGRAM_CODE, d.machine);
      store.set(LIC_KEY, JSON.stringify(d));
      return true;
    }
  };

  // ---------- كلمات المرور (بوابة دخول محلية) ----------
  const subtle = window.crypto && window.crypto.subtle;
  async function derive(pw, salt, algo) {
    if (algo === 'pbkdf2' && subtle) {
      const key = await subtle.importKey('raw', new TextEncoder().encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
      const bits = await subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
      return hex(new Uint8Array(bits));
    }
    let h = salt + '|' + pw;
    for (let i = 0; i < 2000; i++) h = Serial.cyrb128(h + i).map(x => x.toString(16).padStart(8, '0')).join('');
    return h;
  }
  const hashPassword = async pw => { const salt = hex(rand(16)), algo = subtle ? 'pbkdf2' : 'cyrb'; return { salt, algo, hash: await derive(pw, salt, algo) }; };
  const checkPassword = async (u, pw) => u.salt && (await derive(pw, u.salt, u.algo || 'cyrb')) === u.hash;

  // ---------- الأحداث ----------
  const listeners = new Set();
  const broadcast = (type, data) => setTimeout(() => listeners.forEach(fn => fn(type, data || {})), 0);

  const core = Core.createCore({
    db: () => db, save, id: newId, license, broadcast, hashPassword, checkPassword,
    ageMonths: dob => window.Dose.ageMonths(dob),
    dropSessions: () => {}
  });

  function currentUser() {
    let s;
    try { s = JSON.parse(store.get(SES_KEY) || 'null'); } catch { s = null; }
    if (!s || s.exp < Date.now()) return null;
    const u = db.users.find(x => x.id === s.userId);
    return u && u.active !== false ? u : null;
  }
  const setSession = u => store.set(SES_KEY, JSON.stringify({ userId: u.id, exp: Date.now() + 7 * 86400e3 }));

  async function request(method, url, body) {
    const u = new URL(url, 'http://local');
    const p = u.pathname;
    const user = currentUser();
    body = body ? JSON.parse(JSON.stringify(body)) : {};
    if (p === '/api/login' && method === 'POST') {
      try { const lu = await core.login(body.username, body.password); setSession(lu); return { status: 200, data: { user: core.publicUser(lu) } }; }
      catch (e) { return { status: 401, data: { error: e.message } }; }
    }
    if (p === '/api/logout') { store.del(SES_KEY); return { status: 200, data: { ok: true } }; }
    if (p === '/api/backup' || p === '/api/restore') {
      if (!user) return { status: 401, data: { error: 'يجب تسجيل الدخول' } };
      if (user.role !== 'doctor') return { status: 403, data: { error: 'هذه العملية خاصة بحساب الطبيب' } };
      if (p === '/api/backup') { flush(); return { status: 200, data: db }; }
      try { core.validateBackup(body); } catch (e) { return { status: 400, data: { error: e.message } }; }
      db = Object.assign(Core.emptyDb(window.PED_DRUGS), body); flush(); store.del(SES_KEY);
      return { status: 200, data: { ok: true } };
    }
    return core.dispatch(method, p, { user, body, query: u.searchParams });
  }

  // بيانات تجريبية لمعاينة النظام
  function seedDemo() {
    const today = Core.localDate(new Date());
    const dayOff = n => { const d = new Date(); d.setDate(d.getDate() + n); return Core.localDate(d); };
    const yearsAgo = (y, m) => { const d = new Date(); d.setFullYear(d.getFullYear() - y); d.setMonth(d.getMonth() - (m || 0)); return Core.localDate(d); };
    const kids = [
      ['زينب علي حسين', yearsAgo(2, 3), 'أنثى', 'علي حسين', '07801112233', '', 12.4],
      ['محمد أحمد جاسم', yearsAgo(5, 1), 'ذكر', 'أحمد جاسم', '07712223344', 'بنسلين', 18.2],
      ['فاطمة حيدر كاظم', yearsAgo(0, 9), 'أنثى', 'حيدر كاظم', '07903334455', '', 8.6],
      ['يوسف كرار عباس', yearsAgo(8, 4), 'ذكر', 'كرار عباس', '07724445566', '', 25.5],
      ['مريم سجاد هادي', yearsAgo(1, 6), 'أنثى', 'سجاد هادي', '07815556677', '', 10.8],
      ['حسين مصطفى رضا', yearsAgo(3, 8), 'ذكر', 'مصطفى رضا', '07706667788', 'سلفا', 15.1]
    ];
    const now = Date.now();
    kids.forEach((k, i) => {
      db.counters.fileNo = (db.counters.fileNo || 0) + 1;
      const p = { id: newId(), fileNo: String(db.counters.fileNo), name: k[0], dob: k[1], sex: k[2], guardian: k[3], phone: k[4], allergies: k[5],
        address: 'الديوانية', createdAt: now - 40 * 86400e3, updatedAt: now - i * 1000 };
      db.patients.push(p);
      const base = { complaint: '', history: '', exam: '', diagnosis: '', plan: '', doctorNotes: '', followUp: '', prescription: [], note: '' };
      if (i === 0 || i === 3) {
        db.visits.push(Object.assign({}, base, { id: newId(), patientId: p.id, date: dayOff(-30), queueNo: 1 + i, type: 'new', status: 'done', fee: db.settings.feeNew, paid: true,
          checkInAt: now - 30 * 86400e3, ageMonths: window.Dose.ageMonths(p.dob, now - 30 * 86400e3), vitals: { weight: k[6] - 0.6, temp: 38.9 },
          complaint: 'حرارة وسعال', diagnosis: 'التهاب بلعوم', prescription: [{ drugId: 'paracetamol', name: 'Paracetamol (باراسيتامول)', form: 'شراب 120 ملغم/5 مل', text: 'حسب الوزن كل 6 ساعات عند الحاجة', durationDays: 3 }] }));
      }
      if (i < 4) {
        db.visits.push(Object.assign({}, base, { id: newId(), patientId: p.id, date: today, queueNo: i + 1, type: i === 3 ? 'review' : 'new', status: 'waiting',
          priority: false, fee: i === 3 ? db.settings.feeReview : db.settings.feeNew, paid: i !== 2, checkInAt: now - (40 - i * 8) * 60e3,
          ageMonths: window.Dose.ageMonths(p.dob), vitals: { weight: k[6], temp: [38.4, 37.2, 39.1, 36.9][i] }, note: ['حرارة منذ يومين', 'سعال', 'إسهال وتقيؤ', 'مراجعة'][i] }));
      }
      if (i >= 4) db.appointments.push({ id: newId(), patientId: p.id, date: i === 4 ? today : dayOff(1), time: i === 4 ? '18:30' : '17:00', type: 'review', note: 'مراجعة', status: 'booked', createdAt: now });
    });
    flush();
  }

  window.LocalBackend = {
    request,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    seedDemo,
    isLocal: true
  };
})();
