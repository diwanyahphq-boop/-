// منطق النظام المشترك — يعمل على خادم الشبكة (Node) وفي نسخة الهاتف (المتصفح) بدون تغيير
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ClinicCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CLINICAL = ['complaint', 'history', 'exam', 'diagnosis', 'plan', 'doctorNotes'];

  class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
  const fail = (code, msg) => { throw new HttpError(code, msg); };

  function localDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function emptyDb(seedDrugs) {
    return {
      version: 1,
      users: [],
      patients: [],
      visits: [],
      appointments: [],
      drugs: JSON.parse(JSON.stringify(seedDrugs || [])),
      settings: {
        clinicName: 'عيادة الأطفال', doctorName: '', specialty: 'اختصاص طب الأطفال',
        address: '', phone: '', workHours: '', feeNew: 25000, feeReview: 0, currency: 'دينار',
        reviewDays: 7, rxFooter: 'يرجى مراجعة العيادة عند ارتفاع الحرارة أو ظهور أعراض جديدة'
      },
      counters: { fileNo: 0 }
    };
  }

  // env: { db(), save(), id(), license{status(),activate()}, broadcast(type,data), hashPassword(pw)->Promise<{salt,hash}>,
  //        checkPassword(user,pw)->Promise<bool>, ageMonths(dob), replaceDb(db) }
  function createCore(env) {
    const db = () => env.db();
    const today = () => localDate(new Date());
    const broadcast = (t, d) => env.broadcast && env.broadcast(t, d);
    const str = (v, max) => (v === undefined || v === null) ? '' : String(v).trim().slice(0, max || 500);
    const num = v => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return isFinite(n) ? n : null; };
    const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
    const publicUser = u => u && { id: u.id, username: u.username, name: u.name, role: u.role, active: u.active !== false };

    function displayState() {
      const d = today();
      const vs = db().visits.filter(v => v.date === d);
      const current = vs.filter(v => v.status === 'in').sort((a, b) => (b.calledAt || 0) - (a.calledAt || 0))[0];
      const waiting = vs.filter(v => v.status === 'waiting').sort((a, b) => a.queueNo - b.queueNo);
      const firstName = id => { const p = db().patients.find(x => x.id === id); return p ? p.name.split(/\s+/)[0] : ''; };
      return {
        clinicName: db().settings.clinicName, doctorName: db().settings.doctorName,
        current: current ? { queueNo: current.queueNo, name: firstName(current.patientId) } : null,
        next: waiting.slice(0, 5).map(v => ({ queueNo: v.queueNo })),
        waitingCount: waiting.length
      };
    }
    function patientSummary(p) {
      const vs = db().visits.filter(v => v.patientId === p.id && v.status !== 'cancelled').sort((a, b) => (b.checkInAt || 0) - (a.checkInAt || 0));
      const lastW = vs.find(v => v.vitals && v.vitals.weight);
      return Object.assign({}, p, { visitsCount: vs.length, lastVisit: vs[0] ? vs[0].date : null, lastWeight: lastW ? lastW.vitals.weight : null });
    }
    function visitFor(v, user) {
      if (!v || user.role === 'doctor') return v;
      const c = Object.assign({}, v);
      for (const k of CLINICAL) delete c[k];
      return c;
    }
    function withPatient(v, user) {
      const p = db().patients.find(x => x.id === v.patientId);
      return Object.assign(visitFor(v, user), {
        patient: p ? { id: p.id, fileNo: p.fileNo, name: p.name, dob: p.dob, sex: p.sex, phone: p.phone, guardian: p.guardian, allergies: p.allergies } : null
      });
    }
    function cleanVitals(src, old) {
      const v = Object.assign({}, old || {});
      for (const k of ['weight', 'height', 'temp', 'hc', 'hr', 'rr', 'spo2', 'bp']) {
        if (src && src[k] !== undefined) v[k] = k === 'bp' ? str(src[k], 20) : num(src[k]);
      }
      if (v.weight !== null && v.weight !== undefined && (v.weight <= 0 || v.weight > 200)) fail(400, 'الوزن غير منطقي');
      return v;
    }
    function cleanPatient(b, old) {
      const p = Object.assign({}, old || {});
      const fields = { name: 120, sex: 10, guardian: 120, motherName: 120, phone: 40, address: 200, bloodType: 10,
        allergies: 300, chronic: 300, birthHistory: 300, vaccination: 300, notes: 1000 };
      for (const k of Object.keys(fields)) if (b[k] !== undefined) p[k] = str(b[k], fields[k]);
      if (b.dob !== undefined) {
        if (b.dob && !isDate(b.dob)) fail(400, 'تاريخ الميلاد غير صالح');
        if (b.dob && b.dob > today()) fail(400, 'تاريخ الميلاد في المستقبل');
        p.dob = b.dob || '';
      }
      if (!p.name) fail(400, 'اسم الطفل مطلوب');
      if (p.sex && !['ذكر', 'أنثى'].includes(p.sex)) fail(400, 'الجنس غير صالح');
      return p;
    }
    function cleanRx(list) {
      if (!Array.isArray(list)) return [];
      return list.slice(0, 30).map(r => ({
        drugId: str(r.drugId, 60), name: str(r.name, 120), form: str(r.form, 120), route: str(r.route, 60),
        dose: num(r.dose), unit: str(r.unit, 10), volumeMl: num(r.volumeMl), count: num(r.count), countUnit: str(r.countUnit, 30),
        freq: num(r.freq), prn: !!r.prn, durationDays: num(r.durationDays), text: str(r.text, 300), instructions: str(r.instructions, 300)
      })).filter(r => r.name);
    }
    function cleanDrug(b, old) {
      const d = Object.assign({}, old || {});
      d.name = str(b.name, 120); d.nameAr = str(b.nameAr, 120); d.category = str(b.category, 80);
      d.mode = ['kg', 'age', 'weight'].includes(b.mode) ? b.mode : 'kg';
      d.unit = ['mg', 'mcg', 'IU', 'units', 'ml'].includes(b.unit) ? b.unit : 'mg';
      d.perKg = num(b.perKg); d.freq = num(b.freq) || 0; d.prn = !!b.prn;
      d.maxDose = num(b.maxDose); d.maxDaily = num(b.maxDaily); d.maxPerKgDay = num(b.maxPerKgDay); d.minDose = num(b.minDose);
      d.minAgeMonths = num(b.minAgeMonths); d.durationDays = num(b.durationDays);
      d.route = str(b.route, 60); d.instructions = str(b.instructions, 300); d.notes = str(b.notes, 500);
      d.bands = Array.isArray(b.bands) ? b.bands.slice(0, 12).map(x => ({ min: num(x.min), max: num(x.max), dose: num(x.dose), freq: num(x.freq) })).filter(x => x.dose !== null) : [];
      d.forms = Array.isArray(b.forms) ? b.forms.slice(0, 12).map(f => ({
        label: str(f.label, 120), kind: ['liquid', 'solid', 'other'].includes(f.kind) ? f.kind : 'other',
        strength: num(f.strength) || 0, unitLabel: str(f.unitLabel, 30), split: !!f.split
      })).filter(f => f.label) : [];
      if (!d.name) fail(400, 'اسم الدواء مطلوب');
      if (d.mode === 'kg' && !(d.perKg > 0)) fail(400, 'أدخل الجرعة لكل كغم');
      if (d.mode !== 'kg' && !d.bands.length) fail(400, 'أدخل شرائح الجرعات');
      return d;
    }
    function ensureFollowUp(visit) {
      if (!isDate(visit.followUp) || visit.followUp <= visit.date) return;
      const exists = db().appointments.some(a => a.patientId === visit.patientId && a.date === visit.followUp && a.status !== 'cancelled');
      if (!exists) {
        db().appointments.push({ id: env.id(), patientId: visit.patientId, date: visit.followUp, time: '', type: 'review',
          note: 'مراجعة حسب طلب الطبيب', status: 'booked', createdAt: Date.now(), fromVisit: visit.id });
        broadcast('appointments');
      }
    }
    function checkUsername(u) {
      const username = str(u, 40).toLowerCase();
      if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(400, 'اسم المستخدم بالأحرف الإنكليزية والأرقام (3 أحرف على الأقل)');
      return username;
    }
    const checkPw = pw => { if (String(pw || '').length < 6) fail(400, 'كلمة المرور 6 أحرف على الأقل'); };
    const save = () => env.save();

    // ---------- المسارات ----------
    const routes = [];
    const route = (method, pattern, auth, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), auth, handler });

    route('GET', '/api/state', 'none', ({ user }) => ({
      setup: db().users.length > 0, license: env.license.status(), user: publicUser(user), clinicName: db().settings.clinicName
    }));
    route('POST', '/api/setup', 'none', async ({ body }) => {
      if (db().users.length) fail(400, 'تم إعداد النظام مسبقاً');
      const username = checkUsername(body.username);
      checkPw(body.password);
      const h = await env.hashPassword(body.password);
      db().users.push(Object.assign({ id: env.id(), username, name: str(body.name, 80) || 'الطبيب', role: 'doctor', active: true, createdAt: Date.now() }, h));
      if (body.clinicName) db().settings.clinicName = str(body.clinicName, 120);
      db().settings.doctorName = str(body.name, 80);
      save();
      return { ok: true };
    });
    route('PUT', '/api/me/password', 'any', async ({ body, user }) => {
      if (!await env.checkPassword(user, body.oldPassword || '')) fail(400, 'كلمة المرور الحالية غير صحيحة');
      checkPw(body.newPassword);
      Object.assign(user, await env.hashPassword(body.newPassword));
      save();
      return { ok: true };
    });
    route('GET', '/api/license', 'none', () => env.license.status());
    route('POST', '/api/license/activate', 'none', ({ body }) => {
      if (!env.license.activate(body.serial)) fail(400, 'الرقم التسلسلي غير صحيح لهذه الحاسبة');
      broadcast('license', env.license.status());
      return env.license.status();
    });
    route('GET', '/api/display', 'none', () => displayState());

    route('GET', '/api/settings', 'any', () => db().settings);
    route('PUT', '/api/settings', 'doctor', ({ body }) => {
      const s = db().settings;
      for (const k of ['clinicName', 'doctorName', 'specialty', 'address', 'phone', 'workHours', 'currency', 'rxFooter']) if (body[k] !== undefined) s[k] = str(body[k], 300);
      for (const k of ['feeNew', 'feeReview', 'reviewDays']) if (body[k] !== undefined) s[k] = num(body[k]) || 0;
      save(); broadcast('settings');
      return s;
    });

    route('GET', '/api/users', 'doctor', () => db().users.map(publicUser));
    route('POST', '/api/users', 'doctor', async ({ body }) => {
      const username = checkUsername(body.username);
      if (db().users.some(u => u.username === username)) fail(400, 'اسم المستخدم موجود مسبقاً');
      checkPw(body.password);
      const role = body.role === 'doctor' ? 'doctor' : 'reception';
      const u = Object.assign({ id: env.id(), username, name: str(body.name, 80) || username, role, active: true, createdAt: Date.now() }, await env.hashPassword(body.password));
      db().users.push(u); save();
      return publicUser(u);
    });
    route('PUT', '/api/users/:id', 'doctor', async ({ body, params, user }) => {
      const u = db().users.find(x => x.id === params.id) || fail(404, 'المستخدم غير موجود');
      if (body.name !== undefined) u.name = str(body.name, 80);
      if (body.active !== undefined) {
        if (u.id === user.id && !body.active) fail(400, 'لا يمكنك تعطيل حسابك');
        u.active = !!body.active;
        if (!u.active && env.dropSessions) env.dropSessions(u.id);
      }
      if (body.role !== undefined && u.id !== user.id) u.role = body.role === 'doctor' ? 'doctor' : 'reception';
      if (body.password) { checkPw(body.password); Object.assign(u, await env.hashPassword(body.password)); }
      save();
      return publicUser(u);
    });

    route('GET', '/api/patients', 'any', ({ query }) => {
      const q = str(query.get('q'), 100).toLowerCase();
      let list = db().patients;
      if (q) list = list.filter(p => [p.name, p.fileNo, p.phone, p.guardian, p.motherName].some(x => String(x || '').toLowerCase().includes(q)));
      return list.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 200).map(patientSummary);
    });
    route('POST', '/api/patients', 'any', ({ body }) => {
      const st = env.license.status();
      if (st.patientLimit && db().patients.length >= st.patientLimit) fail(402, 'النسخة التجريبية تسمح بـ ' + st.patientLimit + ' مراجعاً فقط — فعّل البرنامج للاستمرار');
      const p = cleanPatient(body);
      const dup = db().patients.find(x => x.name === p.name && x.dob === p.dob && p.dob);
      if (dup && !body.force) fail(409, 'يوجد مراجع بنفس الاسم وتاريخ الميلاد (رقم الملف ' + dup.fileNo + ')');
      db().counters.fileNo = (db().counters.fileNo || 0) + 1;
      Object.assign(p, { id: env.id(), fileNo: String(db().counters.fileNo), createdAt: Date.now(), updatedAt: Date.now() });
      db().patients.push(p); save(); broadcast('patients');
      return p;
    });
    route('GET', '/api/patients/:id', 'any', ({ params, user }) => {
      const p = db().patients.find(x => x.id === params.id) || fail(404, 'المراجع غير موجود');
      const visits = db().visits.filter(v => v.patientId === p.id).sort((a, b) => (b.checkInAt || 0) - (a.checkInAt || 0)).map(v => visitFor(v, user));
      const appointments = db().appointments.filter(a => a.patientId === p.id).sort((a, b) => a.date < b.date ? 1 : -1);
      return { patient: patientSummary(p), visits, appointments };
    });
    route('PUT', '/api/patients/:id', 'any', ({ params, body }) => {
      const i = db().patients.findIndex(x => x.id === params.id);
      if (i < 0) fail(404, 'المراجع غير موجود');
      const p = cleanPatient(body, db().patients[i]);
      p.updatedAt = Date.now();
      db().patients[i] = p; save(); broadcast('patients'); broadcast('queue');
      return p;
    });
    route('DELETE', '/api/patients/:id', 'doctor', ({ params }) => {
      const d = db();
      if (!d.patients.some(x => x.id === params.id)) fail(404, 'المراجع غير موجود');
      d.patients = d.patients.filter(x => x.id !== params.id);
      d.visits = d.visits.filter(x => x.patientId !== params.id);
      d.appointments = d.appointments.filter(x => x.patientId !== params.id);
      save(); broadcast('patients'); broadcast('queue'); broadcast('appointments');
      return { ok: true };
    });

    route('GET', '/api/queue', 'any', ({ query, user }) => {
      const date = isDate(query.get('date')) ? query.get('date') : today();
      const vs = db().visits.filter(v => v.date === date).sort((a, b) => a.queueNo - b.queueNo);
      const live = vs.filter(v => v.status !== 'cancelled');
      return {
        date,
        visits: vs.map(v => withPatient(v, user)),
        summary: {
          total: live.length,
          waiting: live.filter(v => v.status === 'waiting').length,
          inRoom: live.filter(v => v.status === 'in').length,
          done: live.filter(v => v.status === 'done').length,
          collected: live.reduce((s, v) => s + (v.paid ? (v.fee || 0) : 0), 0),
          unpaid: live.filter(v => !v.paid && v.fee > 0).length
        }
      };
    });
    route('POST', '/api/visits', 'any', ({ body, user }) => {
      const p = db().patients.find(x => x.id === body.patientId) || fail(404, 'المراجع غير موجود');
      const date = today();
      if (db().visits.some(v => v.patientId === p.id && v.date === date && ['waiting', 'in'].includes(v.status))) fail(400, 'المراجع موجود في قائمة انتظار اليوم');
      const queueNo = db().visits.filter(v => v.date === date).reduce((m, v) => Math.max(m, v.queueNo || 0), 0) + 1;
      const type = ['new', 'review', 'emergency'].includes(body.type) ? body.type : 'new';
      const s = db().settings;
      const v = {
        id: env.id(), patientId: p.id, date, queueNo, type, status: 'waiting', priority: type === 'emergency',
        checkInAt: Date.now(), checkInBy: user.name,
        fee: num(body.fee) !== null ? num(body.fee) : (type === 'review' ? s.feeReview : s.feeNew),
        paid: !!body.paid, vitals: cleanVitals(body.vitals), note: str(body.note, 300),
        complaint: '', history: '', exam: '', diagnosis: '', plan: '', doctorNotes: '', followUp: '', prescription: [],
        ageMonths: env.ageMonths(p.dob)
      };
      db().visits.push(v);
      const appt = db().appointments.find(a => a.patientId === p.id && a.date === date && a.status === 'booked');
      if (appt) { appt.status = 'arrived'; broadcast('appointments'); }
      p.updatedAt = Date.now();
      save(); broadcast('queue', { action: 'checkin', queueNo });
      return withPatient(v, user);
    });
    route('GET', '/api/visits/:id', 'any', ({ params, user }) => {
      const v = db().visits.find(x => x.id === params.id) || fail(404, 'الزيارة غير موجودة');
      return withPatient(v, user);
    });
    route('PUT', '/api/visits/:id', 'any', ({ params, body, user }) => {
      const v = db().visits.find(x => x.id === params.id) || fail(404, 'الزيارة غير موجودة');
      if (body.vitals) v.vitals = cleanVitals(body.vitals, v.vitals);
      if (body.fee !== undefined) v.fee = num(body.fee) || 0;
      if (body.paid !== undefined) v.paid = !!body.paid;
      if (body.note !== undefined) v.note = str(body.note, 300);
      if (body.type !== undefined && ['new', 'review', 'emergency'].includes(body.type)) { v.type = body.type; v.priority = body.type === 'emergency'; }
      if (user.role === 'doctor') {
        for (const k of CLINICAL) if (body[k] !== undefined) v[k] = str(body[k], 4000);
        if (body.followUp !== undefined) v.followUp = isDate(body.followUp) ? body.followUp : '';
        if (body.prescription !== undefined) { v.prescription = cleanRx(body.prescription); v.prescribedAt = Date.now(); }
      }
      v.updatedAt = Date.now();
      save(); broadcast('queue', { action: 'update', id: v.id });
      return withPatient(v, user);
    });
    route('POST', '/api/visits/:id/call', 'doctor', ({ params, user }) => {
      const v = db().visits.find(x => x.id === params.id) || fail(404, 'الزيارة غير موجودة');
      if (v.status === 'cancelled') fail(400, 'الزيارة ملغاة');
      v.status = 'in'; v.calledAt = Date.now();
      save();
      const p = db().patients.find(x => x.id === v.patientId);
      broadcast('queue', { action: 'call' });
      broadcast('call', { queueNo: v.queueNo, name: p ? p.name : '', by: user.name });
      return withPatient(v, user);
    });
    route('POST', '/api/visits/:id/finish', 'doctor', ({ params, user }) => {
      const v = db().visits.find(x => x.id === params.id) || fail(404, 'الزيارة غير موجودة');
      v.status = 'done'; v.doneAt = Date.now();
      ensureFollowUp(v);
      save(); broadcast('queue', { action: 'finish' });
      return withPatient(v, user);
    });
    route('POST', '/api/visits/:id/status', 'any', ({ params, body, user }) => {
      const v = db().visits.find(x => x.id === params.id) || fail(404, 'الزيارة غير موجودة');
      if (!['waiting', 'cancelled'].includes(body.status)) fail(400, 'حالة غير صالحة');
      if (user.role !== 'doctor' && v.status === 'done') fail(403, 'لا يمكن تعديل زيارة منتهية');
      v.status = body.status; save(); broadcast('queue');
      return withPatient(v, user);
    });

    route('GET', '/api/appointments', 'any', ({ query }) => {
      const from = isDate(query.get('from')) ? query.get('from') : today();
      const to = isDate(query.get('to')) ? query.get('to') : from;
      return db().appointments.filter(a => a.date >= from && a.date <= to)
        .sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')))
        .map(a => {
          const p = db().patients.find(x => x.id === a.patientId);
          return Object.assign({}, a, { patient: p ? { id: p.id, name: p.name, fileNo: p.fileNo, phone: p.phone, dob: p.dob } : null });
        });
    });
    route('POST', '/api/appointments', 'any', ({ body, user }) => {
      if (!db().patients.some(x => x.id === body.patientId)) fail(404, 'المراجع غير موجود');
      if (!isDate(body.date)) fail(400, 'التاريخ غير صالح');
      const a = { id: env.id(), patientId: body.patientId, date: body.date, time: /^\d{2}:\d{2}$/.test(body.time || '') ? body.time : '',
        type: body.type === 'review' ? 'review' : 'new', note: str(body.note, 300), status: 'booked', createdAt: Date.now(), createdBy: user.name };
      db().appointments.push(a); save(); broadcast('appointments');
      return a;
    });
    route('PUT', '/api/appointments/:id', 'any', ({ params, body }) => {
      const a = db().appointments.find(x => x.id === params.id) || fail(404, 'الموعد غير موجود');
      if (body.date !== undefined) { if (!isDate(body.date)) fail(400, 'التاريخ غير صالح'); a.date = body.date; }
      if (body.time !== undefined) a.time = /^\d{2}:\d{2}$/.test(body.time || '') ? body.time : '';
      if (body.note !== undefined) a.note = str(body.note, 300);
      if (body.status !== undefined && ['booked', 'arrived', 'cancelled', 'missed'].includes(body.status)) a.status = body.status;
      save(); broadcast('appointments');
      return a;
    });

    route('GET', '/api/drugs', 'any', () => db().drugs);
    route('POST', '/api/drugs', 'doctor', ({ body }) => {
      const d = cleanDrug(body);
      d.id = 'd-' + env.id();
      db().drugs.push(d); save(); broadcast('drugs');
      return d;
    });
    route('PUT', '/api/drugs/:id', 'doctor', ({ params, body }) => {
      const i = db().drugs.findIndex(x => x.id === params.id);
      if (i < 0) fail(404, 'الدواء غير موجود');
      const d = cleanDrug(body, db().drugs[i]);
      d.id = params.id;
      db().drugs[i] = d; save(); broadcast('drugs');
      return d;
    });
    route('DELETE', '/api/drugs/:id', 'doctor', ({ params }) => {
      const n = db().drugs.length;
      db().drugs = db().drugs.filter(x => x.id !== params.id);
      if (n === db().drugs.length) fail(404, 'الدواء غير موجود');
      save(); broadcast('drugs');
      return { ok: true };
    });

    route('GET', '/api/reports', 'doctor', ({ query }) => {
      const from = isDate(query.get('from')) ? query.get('from') : today();
      const to = isDate(query.get('to')) ? query.get('to') : from;
      const vs = db().visits.filter(v => v.date >= from && v.date <= to && v.status !== 'cancelled');
      const count = (arr, key) => {
        const m = new Map();
        arr.forEach(x => { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, n]) => ({ name, n }));
      };
      const byDay = new Map();
      vs.forEach(v => {
        const d = byDay.get(v.date) || { date: v.date, visits: 0, collected: 0 };
        d.visits++; if (v.paid) d.collected += v.fee || 0; byDay.set(v.date, d);
      });
      return {
        from, to, visits: vs.length,
        byType: { new: vs.filter(v => v.type === 'new').length, review: vs.filter(v => v.type === 'review').length, emergency: vs.filter(v => v.type === 'emergency').length },
        collected: vs.reduce((s, v) => s + (v.paid ? (v.fee || 0) : 0), 0),
        unpaid: vs.reduce((s, v) => s + (!v.paid ? (v.fee || 0) : 0), 0),
        newPatients: db().patients.filter(p => { const d = localDate(new Date(p.createdAt)); return d >= from && d <= to; }).length,
        diagnoses: count(vs, v => (v.diagnosis || '').split('\n')[0].trim()),
        drugs: count(vs.flatMap(v => v.prescription || []), r => r.name),
        days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
      };
    });

    // يتحقق من بيانات الدخول ويعيد المستخدم
    async function login(username, password) {
      const u = db().users.find(x => x.username === str(username, 40).toLowerCase());
      if (!u || u.active === false || !await env.checkPassword(u, password || '')) fail(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
      return u;
    }

    // ينفذ الطلب ويعيد { status, data }
    async function dispatch(method, path, ctx) {
      const r = routes.find(x => x.method === method && x.re.test(path));
      if (!r) return { status: 404, data: { error: 'غير موجود' } };
      try {
        const user = ctx.user;
        if (r.auth !== 'none') {
          if (!user) fail(401, 'يجب تسجيل الدخول');
          if (r.auth === 'doctor' && user.role !== 'doctor') fail(403, 'هذه العملية خاصة بحساب الطبيب');
          if (env.license.status().expired) fail(402, 'انتهت الفترة التجريبية — يرجى تفعيل البرنامج');
        }
        const data = await r.handler({ user, body: ctx.body || {}, params: path.match(r.re).groups || {}, query: ctx.query });
        return { status: 200, data };
      } catch (e) {
        if (!(e instanceof HttpError)) { if (typeof console !== 'undefined') console.error(e); return { status: 500, data: { error: 'خطأ في البرنامج' } }; }
        return { status: e.code, data: { error: e.message } };
      }
    }

    function validateBackup(data) {
      for (const k of ['users', 'patients', 'visits', 'appointments', 'drugs', 'settings', 'counters']) {
        if (!data || data[k] === undefined) fail(400, 'ملف النسخة الاحتياطية غير صالح: ' + k);
      }
    }

    return { dispatch, login, displayState, publicUser, validateBackup };
  }

  return { createCore, emptyDb, localDate, HttpError, CLINICAL };
});
