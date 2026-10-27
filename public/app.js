// المثلث · نظام عيادة الأطفال — واجهة الطبيب والاستعلامات
'use strict';

const PROGRAM_NAME = 'نظام عيادة الأطفال';
const LOCAL = window.LocalBackend || null; // نسخة الهاتف: تعمل بدون خادم
const NATIVE = window.AndroidBridge || null; // تطبيق أندرويد
const NO_PRINT = !!window.PED_NO_PRINT; // صفحة المعاينة لا تسمح بالطباعة والمشاركة
const S = { user: null, license: null, settings: {}, drugs: [], live: false, es: null, dirty: false, hash: '', queueDate: null };
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const esc = v => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = Dose.fmt;
const money = n => (Number(n) || 0).toLocaleString('en-US') + ' ' + (S.settings.currency || '');
const pad = n => String(n).padStart(2, '0');
const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayStr = () => dstr(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return dstr(d); };
const timeOf = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const TYPE_AR = { new: 'كشف جديد', review: 'مراجعة', emergency: 'طارئ' };
const STATUS_AR = { waiting: 'بالانتظار', in: 'عند الطبيب', done: 'انتهت', cancelled: 'ملغاة' };
const APPT_AR = { booked: 'محجوز', arrived: 'حضر', cancelled: 'ملغى', missed: 'لم يحضر' };

const LOGO = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 37 34H3Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M20 16 28 30H12Z" fill="currentColor" fill-opacity=".45"/></svg>';
const ICON = {
  queue: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  patients: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .7 3 2.8 3 6"/>',
  appointments: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  drugs: '<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="m9 8 5 7"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
  reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  users: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  display: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'
};
const icon = n => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICON[n] + '</svg>';

// ---------------- الاتصال بالخادم ----------------
async function api(method, url, body) {
  let res, data;
  if (LOCAL) {
    const r = await LOCAL.request(method, url, body);
    res = { status: r.status, ok: r.status < 400 }; data = r.data || {};
  } else {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    try { res = await fetch(url, opt); } catch { throw new Error('تعذر الاتصال بالخادم — تأكد من تشغيل جهاز الخادم والشبكة'); }
    data = await res.json().catch(() => ({}));
  }
  if (res.status === 401 && url !== '/api/login' && url !== '/api/me/password') { S.user = null; boot(); throw new Error(data.error || 'يجب تسجيل الدخول'); }
  if (res.status === 402 && /انتهت/.test(data.error || '')) { boot(); }
  if (!res.ok) { const e = new Error(data.error || 'حدث خطأ'); e.status = res.status; throw e; }
  return data;
}

function toast(msg, kind, ms) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms || (kind === 'err' ? 5000 : 3000));
}
const errToast = e => toast(e.message || String(e), 'err');

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = i ? 660 : 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25);
    });
  } catch { /* لا يوجد صوت */ }
}

// ---------------- النوافذ المنبثقة ----------------
function modal(title, bodyHtml, actions, opts) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = '<div class="modal" style="max-width:' + ((opts && opts.width) || 720) + 'px" role="dialog" aria-modal="true"><header><h3>' + esc(title) + '</h3><span class="spacer"></span><button class="btn ghost sm" data-x aria-label="إغلاق">✕</button></header><div class="body">' + bodyHtml + '</div><div class="actions"></div></div>';
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  $('[data-x]', bg).onclick = close;
  const box = $('.actions', bg);
  (actions || []).forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.onclick = async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try { const r = await a.onClick(bg, close); if (r !== false) close(); } catch (e) { errToast(e); } finally { b.disabled = false; }
    };
    box.appendChild(b);
  });
  if (!actions || !actions.length) box.remove();
  document.body.appendChild(bg);
  const f = $('input:not([type=checkbox]),select,textarea', bg);
  if (f && !(opts && opts.noFocus)) f.focus();
  return { el: bg, close };
}
const formData = el => {
  const o = {};
  $$('[name]', el).forEach(i => { o[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
  return o;
};
function confirmBox(msg, okLabel) {
  return new Promise(resolve => {
    modal('تأكيد', '<p>' + esc(msg) + '</p>', [
      { label: okLabel || 'تأكيد', cls: 'primary', onClick: () => { resolve(true); } },
      { label: 'إلغاء', onClick: () => { resolve(false); } }
    ], { width: 440, noFocus: true });
  });
}

// ---------------- العلامة التجارية ----------------
const brandHtml = () => '<a class="brand" href="#/queue">' + LOGO + '<div><b>المثلث</b><span>' + PROGRAM_NAME + '</span></div></a>';
const footHtml = () => '<footer class="foot"><div>المثلث · ' + PROGRAM_NAME + '</div><div>حقوق البرمجة © أصيل الصافي</div></footer>';

// ---------------- البدء ----------------
async function boot() {
  applyTheme();
  let st;
  try { st = await api('GET', '/api/state'); }
  catch (e) { $('#root').innerHTML = centerBox('<div class="alert danger">' + esc(e.message) + '</div><button class="btn primary" onclick="boot()">إعادة المحاولة</button>'); return; }
  S.license = st.license; S.user = st.user;
  if (!st.setup) return renderSetup(st);
  if (st.license.expired) return renderActivation();
  if (!st.user) return renderLogin(st);
  try {
    [S.settings, S.drugs] = await Promise.all([api('GET', '/api/settings'), api('GET', '/api/drugs')]);
  } catch (e) { return errToast(e); }
  renderShell();
  connectEvents();
  route();
}

function centerBox(inner, sub) {
  return '<div class="center"><div class="box">' + brandHtml() + (sub ? '<p class="muted" style="text-align:center;margin-top:-.5rem">' + esc(sub) + '</p>' : '') + '<div class="card">' + inner + '</div></div>' + footHtml() + '</div>';
}

function renderSetup() {
  $('#root').innerHTML = centerBox(
    '<h2>إعداد النظام لأول مرة</h2><p class="muted small">أنشئ حساب الطبيب (المدير). بعدها يمكنك إضافة حسابات موظفي الاستعلامات من شاشة المستخدمين.</p>' +
    '<form id="f"><div class="field"><label>اسم العيادة</label><input name="clinicName" value="عيادة الأطفال" required></div>' +
    '<div class="field"><label>اسم الطبيب</label><input name="name" placeholder="د. ..." required></div>' +
    '<div class="field"><label>اسم المستخدم (إنكليزي)</label><input name="username" dir="ltr" autocomplete="username" required></div>' +
    '<div class="field"><label>كلمة المرور</label><input name="password" type="password" autocomplete="new-password" required minlength="6"></div>' +
    '<div class="field"><label>تأكيد كلمة المرور</label><input name="password2" type="password" autocomplete="new-password" required></div>' +
    (LOCAL ? '<label class="check"><input type="checkbox" name="demo" checked> إضافة مراجعين تجريبيين وحساب استعلامات للمعاينة</label>' : '') +
    '<button class="btn primary" style="width:100%">إنشاء الحساب والبدء</button></form>', PROGRAM_NAME);
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const d = formData(e.target);
    if (d.password !== d.password2) return toast('كلمتا المرور غير متطابقتين', 'err');
    try {
      await api('POST', '/api/setup', d);
      await api('POST', '/api/login', { username: d.username, password: d.password });
      if (LOCAL && d.demo) {
        LOCAL.seedDemo();
        await api('POST', '/api/users', { username: 'reception', password: '123456', name: 'موظف الاستعلامات', role: 'reception' }).catch(() => {});
        toast('أضيف حساب الاستعلامات: reception / 123456', null, 7000);
      }
      location.hash = '#/queue'; boot();
    } catch (err) { errToast(err); }
  };
}

function renderLogin(st) {
  $('#root').innerHTML = centerBox(
    '<h2>تسجيل الدخول</h2>' + trialNote() +
    '<form id="f"><div class="field"><label>اسم المستخدم</label><input name="username" dir="ltr" autocomplete="username" required></div>' +
    '<div class="field"><label>كلمة المرور</label><input name="password" type="password" autocomplete="current-password" required></div>' +
    '<button class="btn primary" style="width:100%">دخول</button></form>' +
    '<p class="small muted" style="margin:.8rem 0 0">حساب الطبيب وحساب الاستعلامات يدخلان من نفس الشاشة، وكل حساب يرى صلاحياته فقط.</p>', st.clinicName);
  $('#f').onsubmit = async e => {
    e.preventDefault();
    try { await api('POST', '/api/login', formData(e.target)); history.replaceState(null, '', '#/queue'); boot(); } catch (err) { errToast(err); }
  };
}

function trialNote() {
  const l = S.license;
  if (!l || l.activated) return '';
  return '<div class="alert warn small">نسخة تجريبية — متبقي ' + l.daysLeft + ' يوم (حد ' + l.patientLimit + ' مراجعاً)</div>';
}

function machineHtml() {
  return '<label>رقم الحاسبة</label><div class="row"><div class="machine" style="flex:1">' + esc(S.license.machine) + '</div><button type="button" class="btn sm" id="copyM">نسخ</button></div>';
}
function bindCopyMachine() {
  const b = $('#copyM');
  if (b) b.onclick = () => copyText(S.license.machine);
}
async function copyText(t) {
  if (NATIVE && NATIVE.copy) { NATIVE.copy(t); toast('تم النسخ'); return; }
  try { await navigator.clipboard.writeText(t); toast('تم النسخ'); }
  catch {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('تم النسخ'); } catch { toast('انسخ الرقم يدوياً', 'err'); }
    ta.remove();
  }
}

function renderActivation() {
  $('#root').innerHTML = centerBox(
    '<h2>انتهت الفترة التجريبية</h2><p class="muted small">بياناتك محفوظة بأمان على جهاز الخادم. أرسل رقم الحاسبة إلى المبرمج للحصول على الرقم التسلسلي.</p>' +
    machineHtml() + activationForm(), PROGRAM_NAME);
  bindCopyMachine(); bindActivation(() => boot());
}
function activationForm() {
  return '<form id="act" style="margin-top:1rem"><div class="field"><label>الرقم التسلسلي</label><input name="serial" dir="ltr" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" required style="text-align:center;font-family:monospace"></div><button class="btn primary" style="width:100%">تفعيل البرنامج</button></form>';
}
function bindActivation(done) {
  $('#act').onsubmit = async e => {
    e.preventDefault();
    try { S.license = await api('POST', '/api/license/activate', formData(e.target)); toast('تم تفعيل البرنامج بنجاح — شكراً لك'); done(); }
    catch (err) { errToast(err); }
  };
}

// ---------------- الهيكل العام ----------------
function navItems() {
  if (S.user.role === 'doctor') return [
    ['queue', 'قائمة الانتظار'], ['patients', 'المراجعون'], ['appointments', 'المواعيد'],
    ['drugs', 'قاعدة الأدوية'], ['calc', 'حاسبة الجرعات'], ['reports', 'التقارير'], ['users', 'المستخدمون'], ['settings', 'الإعدادات']
  ];
  return [['queue', 'الاستقبال والانتظار'], ['patients', 'المراجعون'], ['appointments', 'المواعيد'], ['settings', 'حسابي']];
}

function renderShell() {
  const l = S.license;
  $('#root').innerHTML =
    '<div class="app">' +
    '<header class="top">' + brandHtml() +
    '<div class="userbox"><span class="live" id="live" title="الاتصال المباشر"></span><span class="small uname">' + esc(S.settings.clinicName) + ' · <b>' + esc(S.user.name) + '</b> <span class="badge">' + (S.user.role === 'doctor' ? 'الطبيب' : 'الاستعلامات') + '</span></span>' +
    '<button class="btn sm" id="logout">خروج</button></div></header>' +
    (l.trial ? '<div class="trial"><b>نسخة تجريبية</b><span>متبقي ' + l.daysLeft + ' يوم · الحد ' + l.patientLimit + ' مراجعاً</span><span class="spacer"></span>' + (S.user.role === 'doctor' ? '<a class="btn sm brass" href="#/settings">تفعيل البرنامج</a>' : '') + '</div>' : '') +
    '<nav class="side" id="side">' + navItems().map(([k, t]) => '<a href="#/' + k + '" data-nav="' + k + '">' + icon(k) + '<span>' + t + '</span></a>').join('') +
    (LOCAL ? '' : '<a href="/display" target="_blank" rel="noopener">' + icon('display') + '<span>شاشة الانتظار</span></a>') + '</nav>' +
    '<main id="view"></main>' + footHtml() + '</div>' + bottomNavHtml();
  bindBottomNav();
  $('#logout').onclick = async () => {
    if (S.dirty && !await confirmBox('توجد تغييرات غير محفوظة في الزيارة، هل تريد الخروج بدون حفظ؟', 'خروج')) return;
    S.dirty = false;
    await api('POST', '/api/logout').catch(() => {});
    if (S.es) S.es.close();
    S.user = null; boot();
  };
}

// شريط التنقل السفلي للهاتف
function bottomNavHtml() {
  const items = navItems();
  const short = { queue: 'الانتظار', patients: 'المراجعون', appointments: 'المواعيد', calc: 'الجرعات', settings: S.user.role === 'doctor' ? 'الإعدادات' : 'حسابي' };
  const main = S.user.role === 'doctor' ? ['queue', 'patients', 'appointments', 'calc'] : ['queue', 'patients', 'appointments', 'settings'];
  const more = items.filter(([k]) => !main.includes(k));
  return '<nav class="bottom" id="bnav">' + main.map(k => '<a href="#/' + k + '" data-nav="' + k + '">' + icon(k) + '<span>' + short[k] + '</span></a>').join('') +
    (more.length ? '<button type="button" id="moreBtn" data-more>' + '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg><span>المزيد</span></button>' : '') + '</nav>' +
    (more.length ? '<div class="more-sheet" id="moreSheet" hidden><div class="more-box">' + more.map(([k, t]) => '<a href="#/' + k + '" data-nav="' + k + '">' + icon(k) + '<span>' + t + '</span></a>').join('') +
      (LOCAL ? '' : '<a href="/display" target="_blank" rel="noopener">' + icon('display') + '<span>شاشة الانتظار</span></a>') + '</div></div>' : '');
}
function bindBottomNav() {
  const sheet = $('#moreSheet'), btn = $('#moreBtn');
  if (!sheet) return;
  btn.onclick = () => { sheet.hidden = !sheet.hidden; };
  sheet.onclick = e => { if (e.target === sheet || e.target.closest('a')) sheet.hidden = true; };
}

function connectEvents() {
  if (S.es) S.es.close();
  const setLive = on => { S.live = on; const l = $('#live'); if (l) l.classList.toggle('on', on); };
  let es;
  if (LOCAL) {
    // نفس واجهة EventSource فوق ناقل الأحداث المحلي
    const handlers = {};
    const off = LOCAL.subscribe((type, data) => (handlers[type] || []).forEach(fn => fn({ data: JSON.stringify(data) })));
    es = { addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); }, close: off };
    setTimeout(() => setLive(true));
  } else {
    es = new EventSource('/api/events');
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
  }
  S.es = es;
  const view = () => location.hash.split('/')[1] || 'queue';
  es.addEventListener('queue', () => { if (view() === 'queue') viewQueue(true); if (view() === 'patient') refreshCurrent(); });
  es.addEventListener('patients', () => { if (view() === 'patients') viewPatients(true); });
  es.addEventListener('appointments', () => { if (view() === 'appointments') viewAppointments(true); });
  es.addEventListener('drugs', async () => { S.drugs = await api('GET', '/api/drugs'); if (view() === 'drugs') viewDrugs(); });
  es.addEventListener('settings', async () => { S.settings = await api('GET', '/api/settings'); });
  es.addEventListener('license', () => boot());
  es.addEventListener('reload', () => location.reload());
  es.addEventListener('call', e => {
    const d = JSON.parse(e.data);
    if (S.user.role !== 'doctor') { beep(); toast('الطبيب يستدعي المراجع رقم ' + d.queueNo + ' — ' + d.name, 'call', 8000); }
  });
}
function refreshCurrent() { if (!S.dirty) route(); }

window.addEventListener('hashchange', () => {
  if (S.dirty && location.hash !== S.hash) {
    const target = location.hash;
    history.replaceState(null, '', S.hash);
    confirmBox('توجد تغييرات غير محفوظة في الزيارة. هل تريد المغادرة بدون حفظ؟', 'مغادرة').then(ok => {
      if (ok) { S.dirty = false; location.hash = target; }
    });
    return;
  }
  route();
});
window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

// زر الرجوع في تطبيق أندرويد: يغلق النوافذ أولاً ثم يرجع للصفحة السابقة
window.__back = () => {
  const rx = $('.rx-overlay'); if (rx) { rx.querySelector('[data-a=close]').click(); return true; }
  const m = $$('.modal-bg').pop(); if (m) { m.querySelector('[data-x]').click(); return true; }
  const sh = $('#moreSheet'); if (sh && !sh.hidden) { sh.hidden = true; return true; }
  if (S.user && !/^#\/queue$/.test(location.hash || '#/queue')) { history.back(); return true; }
  return false;
};

function route() {
  if (!S.user || !$('#view')) return;
  S.hash = location.hash || '#/queue';
  const [, name, id] = S.hash.split('/');
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name || (name === 'patient' && a.dataset.nav === 'patients') || (name === 'visit' && a.dataset.nav === 'queue')));
  const more = $('#moreBtn');
  if (more) more.classList.toggle('active', !!$('#moreSheet [data-nav].active'));
  document.body.classList.toggle('focus-mode', name === 'visit');
  const doctorOnly = ['visit', 'drugs', 'calc', 'reports', 'users'];
  if (doctorOnly.includes(name) && S.user.role !== 'doctor') { location.hash = '#/queue'; return; }
  const views = { queue: viewQueue, patients: viewPatients, patient: () => viewPatient(id), visit: () => viewVisit(id), appointments: viewAppointments,
    drugs: viewDrugs, calc: viewCalc, reports: viewReports, users: viewUsers, settings: viewSettings };
  (views[name] || viewQueue)();
  window.scrollTo(0, 0);
}
const V = html => { $('#view').innerHTML = html; };

// على الهاتف تتحول الجداول إلى بطاقات: كل خلية تأخذ عنوان عمودها
const TITLE_COLS = ['المراجع', 'الاسم', 'الدواء'];
function labelTables(root) {
  $$('table:not([data-rt])', root).forEach(t => {
    const heads = $$('thead th', t).map(th => th.textContent.trim());
    t.dataset.rt = '1';
    if (!heads.length) return;
    t.classList.add('rt');
    if (heads[0] === 'الرقم') t.classList.add('rt-q');
    $$('tbody tr', t).forEach(tr => {
      const cells = [...tr.children];
      if (cells.length === 1) { tr.classList.add('rt-empty'); return; }
      cells.forEach((td, i) => {
        const h = heads[i] || '';
        if (!h) td.classList.add('c-actions');
        else if (h === 'الرقم') td.classList.add('c-no');
        else if (TITLE_COLS.includes(h)) td.classList.add('c-title');
        else td.dataset.l = h;
      });
    });
  });
}
new MutationObserver(() => labelTables(document)).observe(document.documentElement, { childList: true, subtree: true });

// ---------------- قائمة الانتظار ----------------
async function viewQueue(silent) {
  const date = S.queueDate || todayStr();
  let q;
  try { q = await api('GET', '/api/queue?date=' + date); } catch (e) { return errToast(e); }
  if (!/^#\/queue|^#?$/.test(location.hash || '#/queue') && location.hash !== '') return;
  const isDoc = S.user.role === 'doctor';
  const isToday = date === todayStr();
  const s = q.summary;
  const rows = q.visits.map(v => {
    const p = v.patient || {};
    const w = v.vitals && v.vitals.weight;
    let act = '';
    if (isDoc) {
      if (v.status === 'waiting') act += '<button class="btn sm primary" data-call="' + v.id + '">استدعاء</button>';
      if (v.status === 'in' || v.status === 'done') act += '<a class="btn sm" href="#/visit/' + v.id + '">' + (v.status === 'in' ? 'متابعة الكشف' : 'فتح') + '</a>';
    } else {
      if (v.status === 'waiting' || v.status === 'in') act += '<button class="btn sm" data-vitals="' + v.id + '">القياسات</button>';
      if (v.fee > 0) act += '<button class="btn sm' + (v.paid ? '' : ' brass') + '" data-pay="' + v.id + '">' + (v.paid ? 'مدفوع ✓' : 'استلام الأجور') + '</button>';
    }
    if (v.status === 'done' && v.prescription && v.prescription.length) act += '<button class="btn sm" data-print="' + v.id + '">طباعة الوصفة</button>';
    if (v.status === 'waiting') act += '<button class="btn sm danger" data-cancel="' + v.id + '">إلغاء</button>';
    if (v.status === 'cancelled') act += '<button class="btn sm" data-restore="' + v.id + '">إرجاع</button>';
    return '<tr' + (v.status === 'cancelled' ? ' style="opacity:.55"' : '') + '><td><span class="qno">' + v.queueNo + '</span></td>' +
      '<td><a href="#/patient/' + esc(p.id) + '"><b>' + esc(p.name) + '</b></a>' + (p.allergies ? ' <span class="badge b-cancelled" title="' + esc(p.allergies) + '">حساسية</span>' : '') + '<div class="small muted">ملف ' + esc(p.fileNo) + (v.note ? ' · ' + esc(v.note) : '') + '</div></td>' +
      '<td>' + Dose.ageText(p.dob) + '</td>' +
      '<td><span class="badge ' + (v.type === 'emergency' ? 'b-emergency' : v.type === 'review' ? 'b-review' : '') + '">' + TYPE_AR[v.type] + '</span></td>' +
      '<td class="num">' + (w ? fmt(w) + ' كغم' : '<span class="muted">—</span>') + '</td>' +
      '<td class="num">' + timeOf(v.checkInAt) + '</td>' +
      '<td class="num">' + (v.fee ? money(v.fee) + (v.paid ? '' : ' <span class="badge b-waiting">غير مدفوع</span>') : '<span class="muted">مجاناً</span>') + '</td>' +
      '<td><span class="badge b-' + v.status + '">' + STATUS_AR[v.status] + '</span></td>' +
      '<td><div class="row">' + act + '</div></td></tr>';
  }).join('');
  const html =
    '<div class="page-head"><h2>' + (isDoc ? 'قائمة الانتظار' : 'الاستقبال والانتظار') + '</h2>' +
    '<input type="date" id="qdate" value="' + date + '" style="width:auto">' + (isToday ? '' : '<button class="btn sm" id="qtoday">اليوم</button>') +
    '<span class="spacer"></span>' +
    (isDoc && isToday ? '<button class="btn primary" id="callNext">استدعاء المراجع التالي</button>' : '') +
    (isToday ? '<button class="btn' + (isDoc ? '' : ' primary') + '" id="checkin">إدخال مراجع للانتظار</button><button class="btn" id="newPat">تسجيل مراجع جديد</button>' : '') + '</div>' +
    '<div class="stats">' + stat(s.total, 'مراجعو اليوم') + stat(s.waiting, 'بالانتظار') + stat(s.inRoom, 'عند الطبيب') + stat(s.done, 'انتهى كشفهم') + stat(money(s.collected), 'المبالغ المستلمة') + (s.unpaid ? stat(s.unpaid, 'غير مدفوع') : '') + '</div>' +
    '<div class="card" style="padding:0"><div class="table-wrap"><table><thead><tr><th>الرقم</th><th>المراجع</th><th>العمر</th><th>النوع</th><th>الوزن</th><th>الوصول</th><th>الأجور</th><th>الحالة</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="9" class="empty">لا يوجد مراجعون في هذا اليوم</td></tr>') + '</tbody></table></div></div>';
  V(html);
  $('#qdate').onchange = e => { S.queueDate = e.target.value === todayStr() ? null : e.target.value; viewQueue(); };
  if ($('#qtoday')) $('#qtoday').onclick = () => { S.queueDate = null; viewQueue(); };
  if ($('#checkin')) $('#checkin').onclick = () => checkInDialog();
  if ($('#newPat')) $('#newPat').onclick = () => patientDialog(null);
  if ($('#callNext')) $('#callNext').onclick = () => {
    const next = q.visits.filter(v => v.status === 'waiting').sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || a.queueNo - b.queueNo)[0];
    if (!next) return toast('لا يوجد مراجعون بالانتظار');
    callVisit(next.id);
  };
  $$('[data-call]').forEach(b => b.onclick = () => callVisit(b.dataset.call));
  $$('[data-vitals]').forEach(b => b.onclick = () => vitalsDialog(q.visits.find(v => v.id === b.dataset.vitals)));
  $$('[data-pay]').forEach(b => b.onclick = async () => {
    const v = q.visits.find(x => x.id === b.dataset.pay);
    try { await api('PUT', '/api/visits/' + v.id, { paid: !v.paid }); viewQueue(); } catch (e) { errToast(e); }
  });
  $$('[data-cancel]').forEach(b => b.onclick = async () => {
    if (!await confirmBox('إلغاء هذه الزيارة من قائمة الانتظار؟', 'إلغاء الزيارة')) return;
    try { await api('POST', '/api/visits/' + b.dataset.cancel + '/status', { status: 'cancelled' }); viewQueue(); } catch (e) { errToast(e); }
  });
  $$('[data-restore]').forEach(b => b.onclick = async () => {
    try { await api('POST', '/api/visits/' + b.dataset.restore + '/status', { status: 'waiting' }); viewQueue(); } catch (e) { errToast(e); }
  });
  $$('[data-print]').forEach(b => b.onclick = async () => {
    try { const v = await api('GET', '/api/visits/' + b.dataset.print); printRx(v, v.patient); } catch (e) { errToast(e); }
  });
}
const stat = (v, l) => '<div class="stat"><div class="v num">' + esc(v) + '</div><div class="l">' + esc(l) + '</div></div>';

async function callVisit(id) {
  try { await api('POST', '/api/visits/' + id + '/call'); location.hash = '#/visit/' + id; } catch (e) { errToast(e); }
}

// منتقي المراجع (بحث مباشر)
function patientPicker(container, onPick) {
  container.innerHTML = '<div class="drug-search"><input id="ppq" placeholder="ابحث بالاسم أو رقم الملف أو الهاتف..." autocomplete="off"><div class="suggest" id="pps" hidden></div></div>';
  const inp = $('#ppq', container), box = $('#pps', container);
  let timer;
  inp.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const v = inp.value.trim();
      if (!v) { box.hidden = true; return; }
      const list = await api('GET', '/api/patients?q=' + encodeURIComponent(v)).catch(() => []);
      box.innerHTML = list.slice(0, 12).map(p => '<div data-id="' + p.id + '"><b>' + esc(p.name) + '</b> <span class="small muted">· ملف ' + esc(p.fileNo) + ' · ' + Dose.ageText(p.dob) + (p.phone ? ' · ' + esc(p.phone) : '') + '</span></div>').join('') || '<div class="muted">لا توجد نتائج</div>';
      box.hidden = false;
      $$('[data-id]', box).forEach(d => d.onclick = () => { box.hidden = true; onPick(list.find(p => p.id === d.dataset.id)); });
    }, 200);
  };
  return inp;
}

function vitalsFields(v) {
  v = v || {};
  return '<div class="grid g4">' +
    '<div class="field"><label>الوزن (كغم)</label><input name="weight" type="number" step="0.01" min="0" inputmode="decimal" value="' + esc(v.weight ?? '') + '"></div>' +
    '<div class="field"><label>الطول (سم)</label><input name="height" type="number" step="0.1" min="0" value="' + esc(v.height ?? '') + '"></div>' +
    '<div class="field"><label>الحرارة (°م)</label><input name="temp" type="number" step="0.1" value="' + esc(v.temp ?? '') + '"></div>' +
    '<div class="field"><label>محيط الرأس (سم)</label><input name="hc" type="number" step="0.1" value="' + esc(v.hc ?? '') + '"></div></div>';
}

function checkInDialog(preset) {
  let patient = preset || null;
  const s = S.settings;
  const body = '<div id="pick"></div><div id="picked"></div>' +
    '<div class="grid g3"><div class="field"><label>نوع الزيارة</label><select name="type"><option value="new">كشف جديد</option><option value="review">مراجعة</option><option value="emergency">طارئ (أولوية)</option></select></div>' +
    '<div class="field"><label>الأجور (' + esc(s.currency) + ')</label><input name="fee" type="number" min="0" value="' + (s.feeNew || 0) + '"></div>' +
    '<div class="field"><label>&nbsp;</label><label style="display:flex;gap:.5rem;align-items:center;color:var(--text)"><input type="checkbox" name="paid" style="width:auto;min-height:0"> تم استلام الأجور</label></div></div>' +
    '<h3 style="margin-top:.5rem">القياسات الحيوية</h3>' + vitalsFields() +
    '<div class="field"><label>ملاحظة للطبيب</label><input name="note" placeholder="مثال: حرارة منذ يومين"></div>';
  const m = modal('إدخال مراجع لقائمة الانتظار', body, [
    { label: 'إدخال للانتظار', cls: 'primary', onClick: async el => {
      if (!patient) { toast('اختر المراجع أولاً', 'err'); return false; }
      const d = formData(el);
      const v = await api('POST', '/api/visits', { patientId: patient.id, type: d.type, fee: d.fee, paid: d.paid, note: d.note,
        vitals: { weight: d.weight, height: d.height, temp: d.temp, hc: d.hc } });
      toast('تم إدخال ' + patient.name + ' برقم ' + v.queueNo);
      if ((location.hash || '#/queue').startsWith('#/queue')) viewQueue();
    } },
    { label: 'إلغاء' }
  ]);
  const show = p => {
    patient = p;
    $('#pick', m.el).innerHTML = '';
    $('#picked', m.el).innerHTML = '<div class="alert info row"><b>' + esc(p.name) + '</b><span>ملف ' + esc(p.fileNo) + ' · ' + Dose.ageText(p.dob) + (p.lastWeight ? ' · آخر وزن ' + fmt(p.lastWeight) + ' كغم' : '') + '</span><span class="spacer"></span><button class="btn sm" id="chg">تغيير</button></div>' +
      (p.allergies ? '<div class="allergy">حساسية: ' + esc(p.allergies) + '</div>' : '');
    $('#chg', m.el).onclick = () => { patient = null; $('#picked', m.el).innerHTML = ''; patientPicker($('#pick', m.el), show).focus(); };
    const type = $('[name=type]', m.el);
    if (p.lastVisit) {
      const days = (new Date(todayStr()) - new Date(p.lastVisit)) / 86400000;
      if (days <= (s.reviewDays || 7)) { type.value = 'review'; $('[name=fee]', m.el).value = s.feeReview || 0; }
    }
  };
  $('[name=type]', m.el).onchange = e => { $('[name=fee]', m.el).value = e.target.value === 'review' ? (s.feeReview || 0) : (s.feeNew || 0); };
  if (patient) show(patient); else patientPicker($('#pick', m.el), show).focus();
}

function vitalsDialog(v) {
  modal('القياسات — ' + (v.patient ? v.patient.name : ''), vitalsFields(v.vitals), [
    { label: 'حفظ', cls: 'primary', onClick: async el => { await api('PUT', '/api/visits/' + v.id, { vitals: formData(el) }); toast('تم الحفظ'); viewQueue(); } },
    { label: 'إلغاء' }
  ]);
}

// ---------------- المراجعون ----------------
let patientsQ = '';
async function viewPatients(silent) {
  if (!silent || !$('#pq')) {
    V('<div class="page-head"><h2>المراجعون</h2><span class="spacer"></span><button class="btn primary" id="newPat">تسجيل مراجع جديد</button></div>' +
      '<div class="card"><input id="pq" placeholder="ابحث بالاسم، رقم الملف، الهاتف أو اسم ولي الأمر..." value="' + esc(patientsQ) + '"></div><div id="plist"></div>');
    $('#newPat').onclick = () => patientDialog(null);
    let t;
    $('#pq').oninput = e => { clearTimeout(t); t = setTimeout(() => { patientsQ = e.target.value; loadPatients(); }, 250); };
    $('#pq').focus();
  }
  loadPatients();
}
async function loadPatients() {
  let list;
  try { list = await api('GET', '/api/patients?q=' + encodeURIComponent(patientsQ)); } catch (e) { return errToast(e); }
  const el = $('#plist'); if (!el) return;
  el.innerHTML = '<div class="card" style="padding:0"><div class="table-wrap"><table><thead><tr><th>الملف</th><th>الاسم</th><th>العمر</th><th>الجنس</th><th>ولي الأمر</th><th>الهاتف</th><th>آخر زيارة</th><th></th></tr></thead><tbody>' +
    (list.map(p => '<tr class="click" data-open="' + p.id + '"><td class="num">' + esc(p.fileNo) + '</td><td><b>' + esc(p.name) + '</b>' + (p.allergies ? ' <span class="badge b-cancelled">حساسية</span>' : '') + '</td><td>' + Dose.ageText(p.dob) + '</td><td>' + esc(p.sex || '—') + '</td><td>' + esc(p.guardian || '—') + '</td><td class="num" dir="ltr" style="text-align:right">' + esc(p.phone || '—') + '</td><td class="num">' + esc(p.lastVisit || '—') + '</td><td><button class="btn sm" data-ci="' + p.id + '">إدخال للانتظار</button></td></tr>').join('') ||
      '<tr><td colspan="8" class="empty">' + (patientsQ ? 'لا توجد نتائج' : 'لا يوجد مراجعون بعد — ابدأ بتسجيل مراجع جديد') + '</td></tr>') +
    '</tbody></table></div></div>';
  $$('[data-open]', el).forEach(r => r.onclick = e => { if (!e.target.closest('button')) location.hash = '#/patient/' + r.dataset.open; });
  $$('[data-ci]', el).forEach(b => b.onclick = () => checkInDialog(list.find(p => p.id === b.dataset.ci)));
}

function patientDialog(p, after, opts) {
  p = p || {};
  const opt = (v, cur) => '<option' + (v === cur ? ' selected' : '') + '>' + v + '</option>';
  const body = '<div class="grid g2">' +
    '<div class="field"><label>اسم الطفل الثلاثي *</label><input name="name" required value="' + esc(p.name) + '"></div>' +
    '<div class="grid g2"><div class="field"><label>تاريخ الميلاد</label><input name="dob" type="date" max="' + todayStr() + '" value="' + esc(p.dob) + '"></div>' +
    '<div class="field"><label>الجنس</label><select name="sex"><option value="">—</option>' + opt('ذكر', p.sex) + opt('أنثى', p.sex) + '</select></div></div>' +
    '<div class="field"><label>اسم ولي الأمر</label><input name="guardian" value="' + esc(p.guardian) + '"></div>' +
    '<div class="field"><label>اسم الأم</label><input name="motherName" value="' + esc(p.motherName) + '"></div>' +
    '<div class="field"><label>رقم الهاتف</label><input name="phone" type="tel" dir="ltr" value="' + esc(p.phone) + '"></div>' +
    '<div class="field"><label>العنوان</label><input name="address" value="' + esc(p.address) + '"></div>' +
    '<div class="field"><label>فصيلة الدم</label><select name="bloodType"><option value="">—</option>' + ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(x => opt(x, p.bloodType)).join('') + '</select></div>' +
    '<div class="field"><label>الحساسية الدوائية / الغذائية</label><input name="allergies" placeholder="مثال: بنسلين" value="' + esc(p.allergies) + '"></div>' +
    '<div class="field"><label>أمراض مزمنة</label><input name="chronic" value="' + esc(p.chronic) + '"></div>' +
    '<div class="field"><label>تاريخ الولادة (طبيعية/قيصرية، خديج...)</label><input name="birthHistory" value="' + esc(p.birthHistory) + '"></div></div>' +
    '<div class="field"><label>اللقاحات</label><input name="vaccination" value="' + esc(p.vaccination) + '"></div>' +
    '<div class="field"><label>ملاحظات</label><textarea name="notes">' + esc(p.notes) + '</textarea></div>';
  const save = async (el, force) => {
    const d = formData(el);
    if (!d.name.trim()) { toast('اسم الطفل مطلوب', 'err'); return null; }
    if (p.id) return api('PUT', '/api/patients/' + p.id, d);
    try { return await api('POST', '/api/patients', Object.assign(d, { force })); }
    catch (e) {
      if (e.status === 409 && await confirmBox(e.message + '. هل تريد التسجيل كمراجع جديد رغم ذلك؟', 'تسجيل')) return api('POST', '/api/patients', Object.assign(d, { force: true }));
      throw e;
    }
  };
  // after: يُستدعى بعد الحفظ؛ لمراجع جديد بدونه يُفتح ملفه. opts.noCheckin يخفي زر الإدخال للانتظار
  const actions = [];
  if (!p.id && !(opts && opts.noCheckin)) actions.push({ label: 'حفظ وإدخال للانتظار', cls: 'primary', onClick: async el => { const r = await save(el); if (!r) return false; toast('تم تسجيل المراجع — رقم الملف ' + r.fileNo); setTimeout(() => checkInDialog(r), 50); } });
  actions.push({ label: 'حفظ', cls: actions.length ? '' : 'primary', onClick: async el => {
    const r = await save(el); if (!r) return false;
    toast('تم الحفظ — رقم الملف ' + r.fileNo);
    if (after) setTimeout(() => after(r), 50); else if (!p.id) location.hash = '#/patient/' + r.id; else route();
  } });
  actions.push({ label: 'إلغاء' });
  modal(p.id ? 'تعديل بيانات المراجع' : 'تسجيل مراجع جديد', body, actions, { width: 820 });
}

async function viewPatient(id) {
  let d;
  try { d = await api('GET', '/api/patients/' + id); } catch (e) { return errToast(e); }
  const p = d.patient, isDoc = S.user.role === 'doctor';
  const visits = d.visits.filter(v => v.status !== 'cancelled');
  const kv = (k, v) => v ? '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>' : '';
  V('<div class="page-head"><h2>' + esc(p.name) + '</h2><span class="badge">ملف ' + esc(p.fileNo) + '</span><span class="spacer"></span>' +
    '<button class="btn primary" id="ci">إدخال للانتظار</button><button class="btn" id="appt">حجز موعد</button><button class="btn" id="edit">تعديل</button>' +
    (isDoc ? '<button class="btn danger" id="del">حذف</button>' : '') + '</div>' +
    (p.allergies ? '<div class="allergy" style="margin-bottom:1rem">⚠ حساسية: ' + esc(p.allergies) + '</div>' : '') +
    '<div class="card"><dl class="kv">' + kv('العمر', Dose.ageText(p.dob)) + kv('تاريخ الميلاد', p.dob) + kv('الجنس', p.sex) + kv('ولي الأمر', p.guardian) + kv('الأم', p.motherName) +
    kv('الهاتف', p.phone) + kv('العنوان', p.address) + kv('فصيلة الدم', p.bloodType) + kv('أمراض مزمنة', p.chronic) + kv('تاريخ الولادة', p.birthHistory) + kv('اللقاحات', p.vaccination) + kv('ملاحظات', p.notes) +
    kv('عدد الزيارات', String(p.visitsCount)) + kv('آخر وزن', p.lastWeight ? fmt(p.lastWeight) + ' كغم' : '') + '</dl></div>' +
    '<div class="tabs"><button class="active" data-tab="v">الزيارات</button><button data-tab="g">منحنى النمو</button><button data-tab="a">المواعيد</button></div><div id="tab"></div>');
  const tabs = {
    v: () => visits.length ? visits.map(v => visitCard(v, isDoc)).join('') : '<div class="empty card">لا توجد زيارات</div>',
    g: () => '<div class="card chart">' + growthChart(visits, p) + '</div>',
    a: () => '<div class="card" style="padding:0"><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الوقت</th><th>النوع</th><th>ملاحظة</th><th>الحالة</th></tr></thead><tbody>' +
      (d.appointments.map(a => '<tr><td class="num">' + a.date + '</td><td class="num">' + (a.time || '—') + '</td><td>' + TYPE_AR[a.type] + '</td><td>' + esc(a.note) + '</td><td>' + APPT_AR[a.status] + '</td></tr>').join('') || '<tr><td colspan="5" class="empty">لا توجد مواعيد</td></tr>') + '</tbody></table></div></div>'
  };
  const showTab = k => { $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === k)); $('#tab').innerHTML = tabs[k](); bindVisitCards(visits, p); };
  $$('[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  showTab('v');
  $('#ci').onclick = () => checkInDialog(p);
  $('#appt').onclick = () => appointmentDialog(p);
  $('#edit').onclick = () => patientDialog(p, () => viewPatient(id));
  if ($('#del')) $('#del').onclick = async () => {
    if (!await confirmBox('سيتم حذف المراجع وجميع زياراته ومواعيده نهائياً. هل أنت متأكد؟', 'حذف نهائي')) return;
    try { await api('DELETE', '/api/patients/' + id); toast('تم الحذف'); location.hash = '#/patients'; } catch (e) { errToast(e); }
  };
}

function vitalsText(vt) {
  if (!vt) return '';
  const parts = [];
  if (vt.weight) parts.push('الوزن ' + fmt(vt.weight) + ' كغم');
  if (vt.height) parts.push('الطول ' + fmt(vt.height) + ' سم');
  if (vt.temp) parts.push('الحرارة ' + fmt(vt.temp) + '°');
  if (vt.hc) parts.push('محيط الرأس ' + fmt(vt.hc) + ' سم');
  if (vt.hr) parts.push('النبض ' + vt.hr);
  if (vt.rr) parts.push('التنفس ' + vt.rr);
  if (vt.spo2) parts.push('الأوكسجين ' + vt.spo2 + '%');
  return parts.join(' · ');
}

function visitCard(v, isDoc) {
  return '<div class="card"><div class="row"><b class="num">' + v.date + '</b><span class="badge ' + (v.type === 'review' ? 'b-review' : v.type === 'emergency' ? 'b-emergency' : '') + '">' + TYPE_AR[v.type] + '</span><span class="badge b-' + v.status + '">' + STATUS_AR[v.status] + '</span><span class="spacer"></span>' +
    (isDoc ? '<a class="btn sm" href="#/visit/' + v.id + '">فتح الزيارة</a>' : '') +
    ((v.prescription || []).length ? '<button class="btn sm" data-rxp="' + v.id + '">طباعة الوصفة</button>' : '') + '</div>' +
    '<div class="small muted">' + vitalsText(v.vitals) + '</div>' +
    (isDoc && v.complaint ? '<div><b>الشكوى:</b> ' + esc(v.complaint) + '</div>' : '') +
    (isDoc && v.diagnosis ? '<div><b>التشخيص:</b> ' + esc(v.diagnosis) + '</div>' : '') +
    ((v.prescription || []).length ? '<ol class="small" style="margin:.4rem 0 0;padding-inline-start:1.3rem">' + v.prescription.map(r => '<li><b dir="ltr">' + esc(r.name) + '</b> — ' + esc(r.text) + (r.durationDays ? ' · ' + r.durationDays + ' يوم' : '') + '</li>').join('') + '</ol>' : '') +
    (v.followUp ? '<div class="small">المراجعة: ' + v.followUp + '</div>' : '') + '</div>';
}
function bindVisitCards(visits, p) {
  $$('[data-rxp]').forEach(b => b.onclick = () => printRx(visits.find(v => v.id === b.dataset.rxp), p));
}

function growthChart(visits, p) {
  const pts = visits.filter(v => v.vitals && v.vitals.weight).map(v => ({ age: v.ageMonths ?? Dose.ageMonths(p.dob, v.checkInAt), w: v.vitals.weight, h: v.vitals.height, date: v.date }))
    .filter(x => x.age !== null).sort((a, b) => a.age - b.age);
  if (!pts.length) return '<div class="empty">لا توجد قياسات وزن مسجلة' + (p.dob ? '' : ' (أدخل تاريخ الميلاد لعرض المنحنى)') + '</div>';
  const W = 640, H = 280, L = 44, R = 16, T = 16, B = 36;
  const maxA = Math.max(12, ...pts.map(x => x.age)) * 1.05, maxW = Math.max(5, ...pts.map(x => x.w)) * 1.15;
  const X = a => L + (a / maxA) * (W - L - R), Y = w => H - B - (w / maxW) * (H - T - B);
  let g = '';
  for (let i = 0; i <= 4; i++) { const w = maxW * i / 4; g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(w) + '" y2="' + Y(w) + '" stroke="var(--border)"/><text x="' + (L - 6) + '" y="' + (Y(w) + 4) + '" font-size="11" fill="var(--muted)" text-anchor="end">' + Math.round(w) + '</text>'; }
  const step = maxA > 60 ? 12 : maxA > 24 ? 6 : 3;
  for (let a = 0; a <= maxA; a += step) g += '<text x="' + X(a) + '" y="' + (H - B + 16) + '" font-size="11" fill="var(--muted)" text-anchor="middle">' + a + '</text>';
  const path = pts.map((x, i) => (i ? 'L' : 'M') + X(x.age).toFixed(1) + ' ' + Y(x.w).toFixed(1)).join(' ');
  const dots = pts.map(x => '<circle cx="' + X(x.age) + '" cy="' + Y(x.w) + '" r="4" fill="var(--accent)"><title>' + x.date + ': ' + fmt(x.w) + ' كغم بعمر ' + x.age + ' شهر</title></circle>').join('');
  return '<h3>الوزن حسب العمر</h3><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="منحنى الوزن" style="direction:ltr">' + g +
    '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2"/>' + dots +
    '<text x="' + (W - R) + '" y="' + (H - 4) + '" font-size="11" fill="var(--muted)" text-anchor="end">العمر (شهر)</text><text x="4" y="12" font-size="11" fill="var(--muted)">كغم</text></svg>' +
    '<div class="table-wrap"><table class="small"><thead><tr><th>التاريخ</th><th>العمر</th><th>الوزن</th><th>الطول</th></tr></thead><tbody>' +
    pts.slice().reverse().map(x => '<tr><td class="num">' + x.date + '</td><td>' + Dose.ageLabel(x.age) + '</td><td class="num">' + fmt(x.w) + ' كغم</td><td class="num">' + (x.h ? fmt(x.h) + ' سم' : '—') + '</td></tr>').join('') + '</tbody></table></div>';
}

// ---------------- شاشة الكشف (الطبيب) ----------------
const ALLERGY_GROUPS = [
  { keys: ['بنسلين', 'penicillin', 'اموكس', 'amox', 'اوكمنتين', 'augmentin'], drugs: ['amoxicillin', 'amoxicillin-hd', 'co-amoxiclav'], msg: 'المريض لديه حساسية بنسلين — هذا الدواء من عائلة البنسلين!', level: 'danger' },
  { keys: ['بنسلين', 'penicillin'], drugs: ['cephalexin', 'cefuroxime', 'cefixime', 'ceftriaxone'], msg: 'حساسية بنسلين: احتمال حساسية متصالبة مع السيفالوسبورينات', level: 'warn' },
  { keys: ['سلفا', 'sulfa', 'سبترين', 'septrin'], drugs: ['cotrimoxazole'], msg: 'المريض لديه حساسية سلفا — هذا الدواء يحتوي سلفاميثوكسازول!', level: 'danger' },
  { keys: ['بروفين', 'ibuprofen', 'nsaid', 'ايبوبروفين'], drugs: ['ibuprofen'], msg: 'المريض لديه حساسية من الايبوبروفين/مضادات الالتهاب', level: 'danger' }
];
function allergyAlerts(drug, allergies) {
  const a = String(allergies || '').toLowerCase();
  if (!a.trim() || !drug) return [];
  const out = [];
  ALLERGY_GROUPS.forEach(g => { if (g.drugs.includes(drug.id) && g.keys.some(k => a.includes(k))) out.push(g); });
  if (!out.length && [drug.name, drug.nameAr].some(n => n && a.includes(String(n).toLowerCase().split(' ')[0]))) out.push({ msg: 'اسم الدواء مذكور في حساسية المريض!', level: 'danger' });
  return out;
}

async function viewVisit(id) {
  let v, pd;
  try { v = await api('GET', '/api/visits/' + id); pd = await api('GET', '/api/patients/' + v.patientId); }
  catch (e) { return errToast(e); }
  const p = pd.patient;
  const history = pd.visits.filter(x => x.id !== v.id && x.status !== 'cancelled');
  let rx = (v.prescription || []).map(r => Object.assign({}, r));
  const ageM = Dose.ageMonths(p.dob);
  const vt = v.vitals || {};
  const ta = (name, label, rows) => '<div class="field"><label>' + label + '</label><textarea name="' + name + '" rows="' + (rows || 2) + '">' + esc(v[name]) + '</textarea></div>';
  V('<div class="page-head"><a class="btn sm" href="#/queue">→ قائمة الانتظار</a><h2>' + esc(p.name) + '</h2><span class="qno">' + v.queueNo + '</span><span class="badge b-' + v.status + '">' + STATUS_AR[v.status] + '</span><span class="badge">' + TYPE_AR[v.type] + '</span><span class="spacer"></span>' +
    '<span class="small muted" id="saveState"></span>' +
    '<div class="visit-actions"><button class="btn" id="save">حفظ</button><button class="btn" id="print">الوصفة</button>' +
    (v.status !== 'done' ? '<button class="btn primary" id="finish">إنهاء الكشف</button>' : '') + '</div></div>' +
    '<div class="visit-grid"><aside>' +
    '<div class="card"><dl class="kv"><dt>العمر</dt><dd>' + Dose.ageText(p.dob) + '</dd><dt>الجنس</dt><dd>' + esc(p.sex || '—') + '</dd><dt>الملف</dt><dd>' + esc(p.fileNo) + '</dd>' +
    (p.bloodType ? '<dt>الدم</dt><dd>' + esc(p.bloodType) + '</dd>' : '') + (p.chronic ? '<dt>مزمن</dt><dd>' + esc(p.chronic) + '</dd>' : '') +
    (p.birthHistory ? '<dt>الولادة</dt><dd>' + esc(p.birthHistory) + '</dd>' : '') + (p.vaccination ? '<dt>اللقاحات</dt><dd>' + esc(p.vaccination) + '</dd>' : '') + '</dl>' +
    (p.allergies ? '<div class="allergy" style="margin-top:.6rem">⚠ حساسية: ' + esc(p.allergies) + '</div>' : '') +
    (v.note ? '<div class="alert info small" style="margin-top:.6rem">ملاحظة الاستعلامات: ' + esc(v.note) + '</div>' : '') +
    '<div class="row" style="margin-top:.6rem"><a class="btn sm" href="#/patient/' + p.id + '">الملف الكامل</a><button class="btn sm" id="editP">تعديل البيانات</button></div></div>' +
    '<div class="card"><h3>الزيارات السابقة <span class="badge">' + history.length + '</span></h3>' +
    (history.length ? history.slice(0, 15).map(h => '<div class="hist-item"><div class="row"><b class="num">' + h.date + '</b><span class="badge">' + TYPE_AR[h.type] + '</span><span class="spacer"></span>' +
      ((h.prescription || []).length ? '<button class="btn sm" data-repeat="' + h.id + '" title="نسخ أدوية هذه الوصفة">تكرار الوصفة</button>' : '') + '</div>' +
      '<div class="muted">' + vitalsText(h.vitals) + '</div>' + (h.diagnosis ? '<div><b>التشخيص:</b> ' + esc(h.diagnosis) + '</div>' : '') +
      ((h.prescription || []).length ? '<div class="small">' + h.prescription.map(r => esc(r.name)).join('، ') + '</div>' : '') + '</div>').join('') : '<div class="muted small">أول زيارة</div>') +
    '</div></aside>' +
    '<section><form id="vf" autocomplete="off">' +
    '<div class="card"><h3>القياسات الحيوية</h3>' + vitalsFields(vt) +
    '<div class="grid g4"><div class="field"><label>النبض /د</label><input name="hr" type="number" value="' + esc(vt.hr ?? '') + '"></div><div class="field"><label>التنفس /د</label><input name="rr" type="number" value="' + esc(vt.rr ?? '') + '"></div>' +
    '<div class="field"><label>تشبع الأوكسجين %</label><input name="spo2" type="number" value="' + esc(vt.spo2 ?? '') + '"></div><div class="field"><label>ضغط الدم</label><input name="bp" dir="ltr" value="' + esc(vt.bp ?? '') + '"></div></div></div>' +
    '<div class="card"><h3>الفحص السريري</h3><div class="grid g2">' + ta('complaint', 'الشكوى الرئيسية') + ta('history', 'التاريخ المرضي') + '</div>' +
    ta('exam', 'الفحص السريري', 3) + '<div class="grid g2">' + ta('diagnosis', 'التشخيص') + ta('plan', 'الخطة / الفحوصات المطلوبة') + '</div>' +
    ta('doctorNotes', 'ملاحظات خاصة بالطبيب (لا تظهر في الوصفة)') + '</div>' +
    '<div class="card"><h3>الوصفة الطبية <span class="spacer"></span><span class="small muted" id="wInfo"></span></h3>' +
    '<div class="grid g2" style="align-items:end"><div class="field drug-search"><label>إضافة دواء من قاعدة الأدوية</label><input id="dq" placeholder="اكتب اسم الدواء أو الصنف..."><div class="suggest" id="ds" hidden></div></div>' +
    '<div class="field"><button type="button" class="btn" id="freeDrug">دواء غير موجود في القاعدة</button></div></div>' +
    '<div id="calcBox"></div><div id="rxList"></div>' +
    '<div class="grid g2" style="margin-top:.8rem"><div class="field"><label>موعد المراجعة</label><input name="followUp" type="date" min="' + todayStr() + '" value="' + esc(v.followUp) + '"></div>' +
    '<div class="field"><label>&nbsp;</label><div class="row">' + [3, 5, 7, 14, 30].map(n => '<button type="button" class="btn sm" data-fu="' + n + '">بعد ' + n + ' أيام</button>').join('') + '<button type="button" class="btn sm ghost" data-fu="0">بدون</button></div></div></div>' +
    '</div></form></section></div>');

  const form = $('#vf');
  const markDirty = e => { if (e && e.target && e.target.id === 'dq') return; S.dirty = true; $('#saveState').textContent = 'تغييرات غير محفوظة'; };
  form.addEventListener('input', markDirty);
  const weight = () => Number($('[name=weight]', form).value) || 0;
  const updW = () => { $('#wInfo').textContent = (weight() ? 'الوزن ' + fmt(weight()) + ' كغم' : 'الوزن غير مدخل') + ' · العمر ' + Dose.ageText(p.dob); };
  updW();
  $('[name=weight]', form).addEventListener('input', () => { updW(); if (current) renderCalc(); });
  $$('[data-fu]').forEach(b => b.onclick = () => { $('[name=followUp]', form).value = b.dataset.fu === '0' ? '' : addDays(todayStr(), +b.dataset.fu); markDirty(); });
  $('#editP').onclick = () => patientDialog(p, np => { Object.assign(p, np); toast('تم تحديث البيانات'); });

  // قائمة الأدوية في الوصفة
  const renderRx = () => {
    $('#rxList').innerHTML = rx.length ? rx.map((r, i) => '<div class="rx-item"><span class="rx-n">' + (i + 1) + '</span><div class="grow"><div><b dir="ltr">' + esc(r.name) + '</b> <span class="small muted">' + esc(r.form) + '</span></div>' +
      '<div class="grid g3" style="margin-top:.3rem"><input data-i="' + i + '" data-k="text" value="' + esc(r.text) + '" style="grid-column:span 2" aria-label="الجرعة">' +
      '<div class="row" style="flex-wrap:nowrap"><input data-i="' + i + '" data-k="durationDays" type="number" min="0" value="' + esc(r.durationDays ?? '') + '" aria-label="المدة" style="width:5em"><span class="small">يوم</span></div></div>' +
      '<input data-i="' + i + '" data-k="instructions" value="' + esc(r.instructions) + '" placeholder="تعليمات الاستعمال" style="margin-top:.3rem"></div>' +
      '<button type="button" class="btn sm danger" data-del="' + i + '" aria-label="حذف">✕</button></div>').join('') : '<div class="muted small" style="padding:.5rem 0">لم تتم إضافة أدوية بعد</div>';
    $$('[data-i]', $('#rxList')).forEach(inp => inp.oninput = () => { rx[+inp.dataset.i][inp.dataset.k] = inp.dataset.k === 'durationDays' ? (inp.value === '' ? null : Number(inp.value)) : inp.value; markDirty(); });
    $$('[data-del]', $('#rxList')).forEach(b => b.onclick = () => { rx.splice(+b.dataset.del, 1); markDirty(); renderRx(); });
  };
  renderRx();

  // البحث في الأدوية وحساب الجرعة
  let current = null, formIdx = 0;
  const dq = $('#dq'), ds = $('#ds');
  let sel = -1, matches = [];
  const search = () => {
    const q = dq.value.trim().toLowerCase();
    if (!q) { ds.hidden = true; return; }
    matches = S.drugs.filter(d => [d.name, d.nameAr, d.category].some(x => String(x || '').toLowerCase().includes(q))).slice(0, 12);
    sel = matches.length ? 0 : -1;
    ds.innerHTML = matches.map((d, i) => '<div data-di="' + i + '"' + (i === sel ? ' class="sel"' : '') + '><b dir="ltr">' + esc(d.name) + '</b> · ' + esc(d.nameAr) + ' <span class="small muted">' + esc(d.category) + '</span></div>').join('') || '<div class="muted">غير موجود — استخدم زر "دواء غير موجود في القاعدة"</div>';
    ds.hidden = false;
    $$('[data-di]', ds).forEach(el => el.onmousedown = e => { e.preventDefault(); pick(matches[+el.dataset.di]); });
  };
  dq.oninput = search;
  dq.onkeydown = e => {
    if (ds.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, Math.min(matches.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); $$('[data-di]', ds).forEach((el, i) => el.classList.toggle('sel', i === sel)); }
    if (e.key === 'Enter') { e.preventDefault(); if (matches[sel]) pick(matches[sel]); }
    if (e.key === 'Escape') ds.hidden = true;
  };
  dq.onblur = () => setTimeout(() => { ds.hidden = true; }, 150);
  const pick = d => { current = d; formIdx = 0; dq.value = ''; ds.hidden = true; renderCalc(); };

  const renderCalc = () => {
    if (!current) { $('#calcBox').innerHTML = ''; return; }
    const d = current;
    const r = Dose.calc(d, { weightKg: weight(), ageMonths: ageM }, formIdx);
    const alerts = allergyAlerts(d, p.allergies);
    const dup = rx.some(x => x.drugId === d.id);
    $('#calcBox').innerHTML = '<div class="dose-box" style="margin-bottom:.8rem"><div class="row"><b dir="ltr" style="font-size:1.05rem">' + esc(d.name) + '</b><span>' + esc(d.nameAr) + '</span><span class="badge">' + esc(d.category) + '</span><span class="spacer"></span><button type="button" class="btn sm ghost" id="cx">✕</button></div>' +
      alerts.map(a => '<div class="alert ' + a.level + '"><b>⚠ ' + esc(a.msg) + '</b></div>').join('') +
      (dup ? '<div class="alert warn">هذا الدواء موجود في الوصفة مسبقاً</div>' : '') +
      '<div class="grid g2" style="margin-top:.4rem"><div class="field"><label>الشكل الدوائي</label><select id="cf">' + (d.forms || []).map((f, i) => '<option value="' + i + '"' + (i === formIdx ? ' selected' : '') + '>' + esc(f.label) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>طريق الإعطاء</label><input value="' + esc(d.route) + '" readonly></div></div>' +
      (r.ok ? '<div class="big">' + esc(r.text) + '</div><div class="small">الجرعة المحسوبة: ' + fmt(r.dose) + ' ' + r.unitAr + ' للجرعة' + (r.freq > 0 ? ' · ' + fmt(r.daily) + ' ' + r.unitAr + ' يومياً' : '') + '</div>' +
        r.notes.map(n => '<div class="small muted">' + esc(n) + '</div>').join('') : '') +
      r.errors.map(e => '<div class="alert danger">' + esc(e) + '</div>').join('') +
      r.warnings.map(w => '<div class="alert warn">' + esc(w) + '</div>').join('') +
      (d.notes ? '<div class="small muted" style="margin-top:.3rem">المرجع: ' + esc(d.notes) + '</div>' : '') +
      '<div class="grid g3" style="margin-top:.6rem"><div class="field" style="grid-column:span 2"><label>نص الجرعة في الوصفة (قابل للتعديل)</label><input id="ct" value="' + esc(r.ok ? r.text : '') + '"></div>' +
      '<div class="field"><label>المدة (يوم)</label><input id="cd" type="number" min="0" value="' + esc(d.durationDays ?? '') + '"></div></div>' +
      '<div class="field"><label>تعليمات</label><input id="ci2" value="' + esc(d.instructions) + '"></div>' +
      '<button type="button" class="btn primary" id="addRx">إضافة إلى الوصفة</button></div>';
    $('#cf').onchange = e => { formIdx = +e.target.value; renderCalc(); };
    $('#cx').onclick = () => { current = null; renderCalc(); };
    $('#addRx').onclick = () => {
      const text = $('#ct').value.trim();
      if (!text) return toast('أدخل نص الجرعة', 'err');
      const f = (d.forms || [])[formIdx] || {};
      rx.push({ drugId: d.id, name: d.name + (d.nameAr ? ' (' + d.nameAr + ')' : ''), form: f.label || '', route: d.route, dose: r.ok ? r.dose : null, unit: r.unit, volumeMl: r.volumeMl, count: r.count, countUnit: r.countUnit,
        freq: r.ok ? r.freq : null, prn: !!d.prn, durationDays: $('#cd').value === '' ? null : Number($('#cd').value), text, instructions: $('#ci2').value.trim() });
      current = null; renderCalc(); renderRx(); markDirty(); dq.focus();
    };
  };

  $('#freeDrug').onclick = () => modal('إضافة دواء يدوياً', '<div class="field"><label>اسم الدواء والتركيز</label><input name="name"></div><div class="field"><label>الشكل الدوائي</label><input name="form" placeholder="شراب، قرص، مرهم..."></div><div class="field"><label>الجرعة وطريقة الاستعمال</label><input name="text"></div><div class="grid g2"><div class="field"><label>المدة (يوم)</label><input name="durationDays" type="number"></div><div class="field"><label>تعليمات</label><input name="instructions"></div></div>', [
    { label: 'إضافة', cls: 'primary', onClick: el => { const d = formData(el); if (!d.name.trim()) { toast('أدخل اسم الدواء', 'err'); return false; } rx.push({ drugId: '', name: d.name, form: d.form, text: d.text, durationDays: d.durationDays === '' ? null : Number(d.durationDays), instructions: d.instructions }); renderRx(); markDirty(); } },
    { label: 'إلغاء' }
  ]);

  $$('[data-repeat]').forEach(b => b.onclick = () => {
    const h = history.find(x => x.id === b.dataset.repeat);
    rx = rx.concat(h.prescription.map(r => Object.assign({}, r)));
    renderRx(); markDirty();
    toast('تم نسخ الأدوية — راجع الجرعات حسب الوزن الحالي', null, 5000);
  });

  const collect = () => {
    const d = formData(form);
    return {
      vitals: { weight: d.weight, height: d.height, temp: d.temp, hc: d.hc, hr: d.hr, rr: d.rr, spo2: d.spo2, bp: d.bp },
      complaint: d.complaint, history: d.history, exam: d.exam, diagnosis: d.diagnosis, plan: d.plan, doctorNotes: d.doctorNotes,
      followUp: d.followUp, prescription: rx
    };
  };
  const save = async () => {
    const nv = await api('PUT', '/api/visits/' + v.id, collect());
    S.dirty = false; $('#saveState').textContent = 'تم الحفظ ' + timeOf(Date.now());
    Object.assign(v, nv);
    return nv;
  };
  $('#save').onclick = () => save().then(() => toast('تم الحفظ')).catch(errToast);
  $('#print').onclick = async () => {
    try {
      const nv = await save();
      if (!nv.prescription.length) return toast('الوصفة فارغة', 'err');
      printRx(nv, p);
    } catch (e) { errToast(e); }
  };
  if ($('#finish')) $('#finish').onclick = async () => {
    try {
      await save();
      await api('POST', '/api/visits/' + v.id + '/finish');
      toast('تم إنهاء الكشف' + (v.followUp ? ' وحجز موعد المراجعة ' + v.followUp : ''));
      location.hash = '#/queue';
    } catch (e) { errToast(e); }
  };
}

// ---------------- طباعة الوصفة ----------------
function rxPlainText(v, p) {
  const s = S.settings, w = v.vitals && v.vitals.weight;
  const lines = [s.clinicName, s.doctorName + (s.specialty ? ' — ' + s.specialty : ''), '',
    'الاسم: ' + p.name, 'العمر: ' + Dose.ageText(p.dob, v.checkInAt) + (w ? ' · الوزن: ' + fmt(w) + ' كغم' : ''), 'التاريخ: ' + v.date, ''];
  if (p.allergies) lines.push('حساسية: ' + p.allergies, '');
  (v.prescription || []).forEach((r, i) => {
    lines.push((i + 1) + '. ' + r.name + (r.form ? ' — ' + r.form : ''));
    lines.push('   ' + r.text + (r.durationDays ? ' — لمدة ' + r.durationDays + ' يوم' : ''));
    if (r.instructions) lines.push('   ' + r.instructions);
  });
  if (v.followUp) lines.push('', 'موعد المراجعة: ' + v.followUp);
  return lines.join('\n');
}

// عرض الوصفة داخل الصفحة (يعمل على الهاتف والحاسوب وتطبيق أندرويد)
function printRx(v, p) {
  const s = S.settings;
  const w = v.vitals && v.vitals.weight;
  const items = (v.prescription || []).map(r => '<li><div class="dn">' + esc(r.name) + '</div><div class="df">' + esc(r.form) + (r.route ? ' · ' + esc(r.route) : '') + '</div>' +
    '<div class="dd">' + esc(r.text) + (r.durationDays ? ' — لمدة ' + r.durationDays + ' يوم' : '') + '</div>' + (r.instructions ? '<div class="di">' + esc(r.instructions) + '</div>' : '') + '</li>').join('');
  const paper = '<div class="rx-paper">' +
    '<div class="hd"><div><h1>' + esc(s.doctorName || '') + '</h1><div class="sub">' + esc(s.specialty) + '</div></div>' +
    '<div class="hd-l"><b>' + esc(s.clinicName) + '</b><div class="sub">' + esc(s.address) + '</div><div class="sub" dir="ltr">' + esc(s.phone) + '</div><div class="sub">' + esc(s.workHours) + '</div></div></div>' +
    '<div class="pt"><div><b>الاسم:</b> ' + esc(p.name) + '</div><div><b>العمر:</b> ' + Dose.ageText(p.dob, v.checkInAt) + '</div><div><b>التاريخ:</b> ' + esc(v.date) + '</div>' +
    '<div><b>الوزن:</b> ' + (w ? fmt(w) + ' كغم' : '—') + '</div><div><b>الجنس:</b> ' + esc(p.sex || '—') + '</div><div><b>رقم الملف:</b> ' + esc(p.fileNo) + '</div></div>' +
    (p.allergies ? '<div class="al">حساسية: ' + esc(p.allergies) + '</div>' : '') +
    '<div class="rx">℞</div><ol>' + items + '</ol>' +
    (v.followUp ? '<div class="nt"><b>موعد المراجعة:</b> ' + esc(v.followUp) + '</div>' : '') +
    (s.rxFooter ? '<div class="nt">' + esc(s.rxFooter) + '</div>' : '') +
    '<div class="ft"><div class="sig">توقيع الطبيب</div></div>' +
    '<div class="br">المثلث · ' + PROGRAM_NAME + ' — حقوق البرمجة © أصيل الصافي</div></div>';
  const ov = document.createElement('div');
  ov.className = 'rx-overlay';
  ov.innerHTML = '<div class="rx-bar">' + (NO_PRINT ? '' : '<button class="btn primary" data-a="print">طباعة / PDF</button>') +
    (!NO_PRINT && (navigator.share || (NATIVE && NATIVE.share)) ? '<button class="btn" data-a="share">مشاركة</button>' : '') +
    '<button class="btn" data-a="copy">نسخ النص</button><span class="spacer"></span><button class="btn" data-a="close" aria-label="إغلاق">✕</button></div>' + paper;
  document.body.appendChild(ov);
  document.body.classList.add('rx-open');
  const close = () => { ov.remove(); document.body.classList.remove('rx-open'); };
  const text = rxPlainText(v, p);
  ov.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'close') close();
    if (a.dataset.a === 'copy') copyText(text);
    if (a.dataset.a === 'share' && NATIVE && NATIVE.share) NATIVE.share('وصفة طبية — ' + p.name, text);
    else if (a.dataset.a === 'share') { try { await navigator.share({ title: 'وصفة طبية — ' + p.name, text }); } catch { /* أُلغيت المشاركة */ } }
    if (a.dataset.a === 'print') {
      if (NATIVE && NATIVE.print) NATIVE.print('وصفة ' + p.name);
      else { try { window.print(); } catch { toast('الطباعة غير متاحة هنا — استخدم نسخ النص أو المشاركة', 'err'); } }
    }
  });
}

// ---------------- المواعيد ----------------
let apptDate = null;
async function viewAppointments() {
  const date = apptDate || todayStr();
  let list;
  try { list = await api('GET', '/api/appointments?from=' + date + '&to=' + date); } catch (e) { return errToast(e); }
  if (!(location.hash || '').startsWith('#/appointments')) return;
  const isToday = date === todayStr();
  V('<div class="page-head"><h2>المواعيد</h2><button class="btn sm" id="prev">→</button><input type="date" id="ad" value="' + date + '" style="width:auto"><button class="btn sm" id="next">←</button>' +
    (isToday ? '' : '<button class="btn sm" id="tod">اليوم</button>') + '<span class="spacer"></span><button class="btn primary" id="newA">حجز موعد</button></div>' +
    '<div class="card" style="padding:0"><div class="table-wrap"><table><thead><tr><th>الوقت</th><th>المراجع</th><th>العمر</th><th>الهاتف</th><th>النوع</th><th>ملاحظة</th><th>الحالة</th><th></th></tr></thead><tbody>' +
    (list.map(a => { const p = a.patient || {}; return '<tr><td class="num">' + (a.time || '—') + '</td><td><a href="#/patient/' + esc(p.id) + '"><b>' + esc(p.name) + '</b></a><div class="small muted">ملف ' + esc(p.fileNo) + '</div></td><td>' + Dose.ageText(p.dob) + '</td><td class="num" dir="ltr" style="text-align:right">' + esc(p.phone || '—') + '</td><td>' + TYPE_AR[a.type] + '</td><td>' + esc(a.note) + '</td><td><span class="badge ' + (a.status === 'arrived' ? 'b-done' : a.status === 'cancelled' || a.status === 'missed' ? 'b-cancelled' : 'b-waiting') + '">' + APPT_AR[a.status] + '</span></td><td><div class="row">' +
      (a.status === 'booked' && isToday ? '<button class="btn sm primary" data-ci="' + a.id + '">وصل — إدخال للانتظار</button>' : '') +
      (a.status === 'booked' ? '<button class="btn sm" data-mv="' + a.id + '">تغيير الموعد</button><button class="btn sm danger" data-cn="' + a.id + '">إلغاء</button>' : '') +
      (a.status === 'booked' && date < todayStr() ? '<button class="btn sm" data-ms="' + a.id + '">لم يحضر</button>' : '') + '</div></td></tr>'; }).join('') ||
      '<tr><td colspan="8" class="empty">لا توجد مواعيد في هذا اليوم</td></tr>') + '</tbody></table></div></div>');
  const go = d => { apptDate = d === todayStr() ? null : d; viewAppointments(); };
  $('#ad').onchange = e => go(e.target.value);
  $('#prev').onclick = () => go(addDays(date, -1));
  $('#next').onclick = () => go(addDays(date, 1));
  if ($('#tod')) $('#tod').onclick = () => go(todayStr());
  $('#newA').onclick = () => appointmentDialog(null, date);
  const setSt = async (id, status) => { try { await api('PUT', '/api/appointments/' + id, { status }); viewAppointments(); } catch (e) { errToast(e); } };
  $$('[data-ci]').forEach(b => b.onclick = async () => {
    const a = list.find(x => x.id === b.dataset.ci);
    const p = await api('GET', '/api/patients/' + a.patient.id).catch(errToast);
    if (p) checkInDialog(p.patient);
  });
  $$('[data-cn]').forEach(b => b.onclick = () => setSt(b.dataset.cn, 'cancelled'));
  $$('[data-ms]').forEach(b => b.onclick = () => setSt(b.dataset.ms, 'missed'));
  $$('[data-mv]').forEach(b => b.onclick = () => {
    const a = list.find(x => x.id === b.dataset.mv);
    modal('تغيير الموعد', '<div class="grid g2"><div class="field"><label>التاريخ</label><input name="date" type="date" value="' + a.date + '"></div><div class="field"><label>الوقت</label><input name="time" type="time" value="' + esc(a.time) + '"></div></div>', [
      { label: 'حفظ', cls: 'primary', onClick: async el => { await api('PUT', '/api/appointments/' + a.id, formData(el)); viewAppointments(); } }, { label: 'إلغاء' }]);
  });
}

function appointmentDialog(preset, date) {
  let patient = preset;
  const m = modal('حجز موعد', '<div id="pick"></div><div id="picked"></div><div class="grid g3"><div class="field"><label>التاريخ</label><input name="date" type="date" min="' + todayStr() + '" value="' + (date && date >= todayStr() ? date : todayStr()) + '"></div>' +
    '<div class="field"><label>الوقت</label><input name="time" type="time"></div><div class="field"><label>النوع</label><select name="type"><option value="new">كشف جديد</option><option value="review">مراجعة</option></select></div></div>' +
    '<div class="field"><label>ملاحظة</label><input name="note"></div>', [
    { label: 'حجز', cls: 'primary', onClick: async el => {
      if (!patient) { toast('اختر المراجع', 'err'); return false; }
      await api('POST', '/api/appointments', Object.assign(formData(el), { patientId: patient.id }));
      toast('تم حجز الموعد'); if ((location.hash || '').startsWith('#/appointments')) viewAppointments();
    } },
    { label: 'تسجيل مراجع جديد', onClick: (el, close) => { close(); patientDialog(null, p => appointmentDialog(p, date), { noCheckin: true }); } },
    { label: 'إلغاء' }
  ]);
  const show = p => {
    patient = p;
    $('#pick', m.el).innerHTML = '';
    $('#picked', m.el).innerHTML = '<div class="alert info"><b>' + esc(p.name) + '</b> · ملف ' + esc(p.fileNo) + ' · ' + Dose.ageText(p.dob) + '</div>';
  };
  if (patient) show(patient); else patientPicker($('#pick', m.el), show).focus();
}

// ---------------- قاعدة الأدوية ----------------
let drugQ = '';
function drugDoseSummary(d) {
  const u = Dose.UNIT_AR[d.unit] || d.unit;
  if (d.mode === 'kg') return fmt(d.perKg) + ' ' + u + '/كغم/جرعة · ' + Dose.freqText(d.freq, d.prn) + (d.maxDose ? ' · أقصى ' + fmt(d.maxDose) : '');
  return 'حسب ' + (d.mode === 'age' ? 'العمر' : 'الوزن') + ': ' + (d.bands || []).map(b => Dose.bandLabel(b, d.mode) + ' ← ' + fmt(b.dose) + ' ' + u).join(' | ');
}
function viewDrugs() {
  V('<div class="page-head"><h2>قاعدة أدوية الأطفال</h2><span class="badge">' + S.drugs.length + ' دواء</span><span class="spacer"></span><button class="btn primary" id="newD">إضافة دواء</button></div>' +
    '<div class="alert warn small">الجرعات المدخلة مسبقاً قيم استرشادية من المراجع الشائعة. على الطبيب مراجعتها وتعديلها حسب النشرة الدوائية المعتمدة قبل الاستخدام.</div>' +
    '<div class="card"><input id="dsq" placeholder="بحث..." value="' + esc(drugQ) + '"></div><div id="dlist"></div>');
  const draw = () => {
    const q = drugQ.toLowerCase();
    const list = S.drugs.filter(d => !q || [d.name, d.nameAr, d.category].some(x => String(x || '').toLowerCase().includes(q)));
    $('#dlist').innerHTML = '<div class="card" style="padding:0"><div class="table-wrap"><table><thead><tr><th>الدواء</th><th>الصنف</th><th>طريقة الحساب</th><th>الأشكال</th><th></th></tr></thead><tbody>' +
      list.map(d => '<tr><td><b dir="ltr">' + esc(d.name) + '</b><div class="small muted">' + esc(d.nameAr) + '</div></td><td>' + esc(d.category) + '</td><td class="small">' + esc(drugDoseSummary(d)) + (d.minAgeMonths ? '<div class="muted">من عمر ' + Dose.ageLabel(d.minAgeMonths) + '</div>' : '') + '</td><td class="small">' + (d.forms || []).map(f => esc(f.label)).join('<br>') + '</td>' +
        '<td><div class="row"><button class="btn sm" data-ed="' + esc(d.id) + '">تعديل</button><button class="btn sm danger" data-dl="' + esc(d.id) + '">حذف</button></div></td></tr>').join('') + '</tbody></table></div></div>';
    $$('[data-ed]').forEach(b => b.onclick = () => drugDialog(S.drugs.find(d => d.id === b.dataset.ed)));
    $$('[data-dl]').forEach(b => b.onclick = async () => {
      if (!await confirmBox('حذف هذا الدواء من القاعدة؟', 'حذف')) return;
      try { await api('DELETE', '/api/drugs/' + b.dataset.dl); S.drugs = await api('GET', '/api/drugs'); draw(); } catch (e) { errToast(e); }
    });
  };
  $('#dsq').oninput = e => { drugQ = e.target.value; draw(); };
  $('#newD').onclick = () => drugDialog(null);
  draw();
}

function drugDialog(d) {
  d = JSON.parse(JSON.stringify(d || { mode: 'kg', unit: 'mg', freq: 3, forms: [{ label: '', kind: 'liquid', strength: '' }], bands: [] }));
  d.bands = d.bands || []; d.forms = d.forms || [];
  const sel = (name, opts, cur) => '<select name="' + name + '">' + opts.map(([v, t]) => '<option value="' + v + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>';
  const inp = (name, label, val, type, extra) => '<div class="field"><label>' + label + '</label><input name="' + name + '"' + (type ? ' type="' + type + '" step="any"' : '') + ' value="' + esc(val ?? '') + '"' + (extra || '') + '></div>';
  const body = '<div class="grid g3">' + inp('name', 'الاسم العلمي (إنكليزي) *', d.name, '', ' dir="ltr"') + inp('nameAr', 'الاسم بالعربي', d.nameAr) + inp('category', 'الصنف', d.category) + '</div>' +
    '<div class="grid g4"><div class="field"><label>طريقة الحساب</label>' + sel('mode', [['kg', 'حسب الوزن (لكل كغم)'], ['age', 'شرائح حسب العمر'], ['weight', 'شرائح حسب الوزن']], d.mode) + '</div>' +
    '<div class="field"><label>الوحدة</label>' + sel('unit', [['mg', 'ملغم'], ['mcg', 'مكغم'], ['IU', 'وحدة دولية'], ['units', 'وحدة'], ['ml', 'مل']], d.unit) + '</div>' +
    '<div class="field"><label>عدد المرات يومياً</label>' + sel('freq', [[0, 'جرعة واحدة فقط'], [1, 'مرة'], [2, 'مرتين'], [3, '3 مرات'], [4, '4 مرات'], [6, 'كل 4 ساعات']], d.freq || 0) + '</div>' +
    '<div class="field"><label>&nbsp;</label><label style="display:flex;gap:.5rem;align-items:center;color:var(--text)"><input type="checkbox" name="prn" style="width:auto;min-height:0"' + (d.prn ? ' checked' : '') + '> عند الحاجة</label></div></div>' +
    '<div id="kgBox" class="grid g4">' + inp('perKg', 'الجرعة لكل كغم (للجرعة الواحدة)', d.perKg, 'number') + inp('maxDose', 'أقصى جرعة واحدة', d.maxDose, 'number') + inp('maxDaily', 'أقصى جرعة يومية', d.maxDaily, 'number') + inp('maxPerKgDay', 'أقصى لكل كغم/يوم', d.maxPerKgDay, 'number') + '</div>' +
    '<div id="bandBox"><label>شرائح الجرعات <span class="muted small" id="bandUnit"></span></label><div id="bands"></div><button type="button" class="btn sm" id="addBand">+ شريحة</button></div>' +
    '<div class="grid g3" style="margin-top:.8rem">' + inp('minAgeMonths', 'أقل عمر مسموح (بالأشهر)', d.minAgeMonths, 'number') + inp('durationDays', 'المدة الافتراضية (يوم)', d.durationDays, 'number') + inp('route', 'طريق الإعطاء', d.route) + '</div>' +
    '<label>الأشكال الدوائية والتراكيز</label><div class="small muted">شراب/قطرة: التركيز لكل 1 مل (مثال: 120 ملغم/5 مل = 24). قرص/تحميلة: الكمية في الوحدة الواحدة.</div><div id="forms"></div><button type="button" class="btn sm" id="addForm">+ شكل دوائي</button>' +
    '<div class="grid g2" style="margin-top:.8rem">' + inp('instructions', 'تعليمات تظهر في الوصفة', d.instructions) + inp('notes', 'ملاحظات / المرجع', d.notes) + '</div>' +
    '<div class="card" style="background:var(--surface-2)"><b>تجربة الحساب</b><div class="grid g3" style="margin-top:.4rem"><div class="field"><label>الوزن كغم</label><input id="tw" type="number" step="any" value="10"></div><div class="field"><label>العمر بالأشهر</label><input id="ta" type="number" value="24"></div><div class="field"><label>الشكل</label><select id="tf"></select></div></div><div id="tr"></div></div>';
  const m = modal(d.id ? 'تعديل دواء' : 'إضافة دواء', body, [
    { label: 'حفظ', cls: 'primary', onClick: async () => {
      const out = collect();
      if (d.id) await api('PUT', '/api/drugs/' + d.id, out); else await api('POST', '/api/drugs', out);
      S.drugs = await api('GET', '/api/drugs'); toast('تم الحفظ'); if ((location.hash || '').startsWith('#/drugs')) viewDrugs();
    } },
    { label: 'إلغاء' }
  ], { width: 900, noFocus: !!d.id });
  const el = m.el;
  const drawForms = () => {
    $('#forms', el).innerHTML = d.forms.map((f, i) => '<div class="row" style="margin-bottom:.4rem;flex-wrap:nowrap"><input data-f="' + i + '" data-k="label" placeholder="الوصف مثل: شراب 125 ملغم/5 مل" value="' + esc(f.label) + '" style="flex:3">' +
      '<select data-f="' + i + '" data-k="kind" style="flex:1.2"><option value="liquid"' + (f.kind === 'liquid' ? ' selected' : '') + '>سائل (لكل مل)</option><option value="solid"' + (f.kind === 'solid' ? ' selected' : '') + '>صلب (لكل وحدة)</option><option value="other"' + (f.kind === 'other' ? ' selected' : '') + '>أخرى</option></select>' +
      '<input data-f="' + i + '" data-k="strength" type="number" step="any" placeholder="التركيز" value="' + esc(f.strength) + '" style="flex:1">' +
      '<input data-f="' + i + '" data-k="unitLabel" placeholder="قرص/تحميلة" value="' + esc(f.unitLabel) + '" style="flex:1">' +
      '<label title="يمكن تنصيفه" style="display:flex;align-items:center;gap:.2rem;margin:0;white-space:nowrap"><input type="checkbox" data-f="' + i + '" data-k="split"' + (f.split ? ' checked' : '') + ' style="width:auto;min-height:0">½</label>' +
      '<button type="button" class="btn sm danger" data-rf="' + i + '">✕</button></div>').join('');
    $$('[data-f]', el).forEach(x => x.oninput = x.onchange = () => { const f = d.forms[+x.dataset.f]; f[x.dataset.k] = x.type === 'checkbox' ? x.checked : x.value; test(); });
    $$('[data-rf]', el).forEach(b => b.onclick = () => { d.forms.splice(+b.dataset.rf, 1); drawForms(); });
    $('#tf', el).innerHTML = d.forms.map((f, i) => '<option value="' + i + '">' + esc(f.label || 'شكل ' + (i + 1)) + '</option>').join('');
    test();
  };
  const drawBands = () => {
    const mode = $('[name=mode]', el).value;
    $('#kgBox', el).style.display = mode === 'kg' ? '' : 'none';
    $('#bandBox', el).style.display = mode === 'kg' ? 'none' : '';
    $('#bandUnit', el).textContent = mode === 'age' ? '(العمر بالأشهر: من ≤ العمر < إلى)' : '(الوزن بالكغم: من ≤ الوزن < إلى)';
    $('#bands', el).innerHTML = d.bands.map((b, i) => '<div class="row" style="margin-bottom:.4rem;flex-wrap:nowrap"><input data-b="' + i + '" data-k="min" type="number" step="any" placeholder="من" value="' + esc(b.min ?? '') + '"><input data-b="' + i + '" data-k="max" type="number" step="any" placeholder="إلى (فارغ = بلا حد)" value="' + esc(b.max ?? '') + '">' +
      '<input data-b="' + i + '" data-k="dose" type="number" step="any" placeholder="الجرعة" value="' + esc(b.dose ?? '') + '"><input data-b="' + i + '" data-k="freq" type="number" placeholder="مرات/يوم (اختياري)" value="' + esc(b.freq ?? '') + '"><button type="button" class="btn sm danger" data-rb="' + i + '">✕</button></div>').join('');
    $$('[data-b]', el).forEach(x => x.oninput = () => { d.bands[+x.dataset.b][x.dataset.k] = x.value === '' ? null : Number(x.value); test(); });
    $$('[data-rb]', el).forEach(b => b.onclick = () => { d.bands.splice(+b.dataset.rb, 1); drawBands(); });
    test();
  };
  const collect = () => {
    const f = formData(el);
    const n = v => v === '' || v === undefined ? null : Number(v);
    return { name: f.name, nameAr: f.nameAr, category: f.category, mode: f.mode, unit: f.unit, freq: Number(f.freq), prn: f.prn,
      perKg: n(f.perKg), maxDose: n(f.maxDose), maxDaily: n(f.maxDaily), maxPerKgDay: n(f.maxPerKgDay), minAgeMonths: n(f.minAgeMonths), durationDays: n(f.durationDays),
      route: f.route, instructions: f.instructions, notes: f.notes,
      bands: d.bands, forms: d.forms.map(x => ({ label: x.label, kind: x.kind, strength: Number(x.strength) || 0, unitLabel: x.unitLabel || '', split: !!x.split })) };
  };
  const test = () => {
    const r = Dose.calc(collect(), { weightKg: Number($('#tw', el).value), ageMonths: $('#ta', el).value === '' ? null : Number($('#ta', el).value) }, Number($('#tf', el).value) || 0);
    $('#tr', el).innerHTML = (r.ok ? '<div class="big" style="font-weight:700;color:var(--accent)">' + esc(r.text) + '</div>' : '') + r.errors.concat(r.warnings).map(x => '<div class="small" style="color:var(--warn)">' + esc(x) + '</div>').join('');
  };
  $('#addForm', el).onclick = () => { d.forms.push({ label: '', kind: 'liquid', strength: '' }); drawForms(); };
  $('#addBand', el).onclick = () => { d.bands.push({ min: null, max: null, dose: null }); drawBands(); };
  $('[name=mode]', el).onchange = drawBands;
  el.addEventListener('input', e => { if (e.target.name) test(); });
  ['#tw', '#ta', '#tf'].forEach(s => $(s, el).oninput = $(s, el).onchange = test);
  drawForms(); drawBands();
}

// ---------------- حاسبة الجرعات ----------------
function viewCalc() {
  V('<div class="page-head"><h2>حاسبة جرعات الأطفال</h2></div>' +
    '<div class="card"><div class="grid g4"><div class="field"><label>الوزن (كغم)</label><input id="cw" type="number" step="0.01" min="0" inputmode="decimal"></div>' +
    '<div class="field"><label>العمر — سنوات</label><input id="cy" type="number" min="0" value="0"></div><div class="field"><label>العمر — أشهر</label><input id="cm" type="number" min="0" max="11" value="0"></div>' +
    '<div class="field"><label>بحث في الأدوية</label><input id="cq" placeholder="اختياري"></div></div></div>' +
    '<div id="cres"></div>');
  const draw = () => {
    const w = Number($('#cw').value) || 0;
    const age = (Number($('#cy').value) || 0) * 12 + (Number($('#cm').value) || 0);
    const q = $('#cq').value.trim().toLowerCase();
    if (!w) { $('#cres').innerHTML = '<div class="empty card">أدخل وزن الطفل لعرض جرعات جميع الأدوية</div>'; return; }
    const list = S.drugs.filter(d => !q || [d.name, d.nameAr, d.category].some(x => String(x || '').toLowerCase().includes(q)));
    $('#cres').innerHTML = '<div class="card" style="padding:0"><div class="table-wrap"><table><thead><tr><th>الدواء</th><th>الشكل الدوائي والجرعة</th><th>ملاحظات</th></tr></thead><tbody>' +
      list.map(d => {
        const forms = (d.forms && d.forms.length ? d.forms : [null]).map((f, i) => { const r = Dose.calc(d, { weightKg: w, ageMonths: age }, i); return r.ok ? '<div><span class="small muted">' + esc(f ? f.label : '') + ':</span> <b>' + esc(r.text) + '</b></div>' : ''; }).join('');
        const r0 = Dose.calc(d, { weightKg: w, ageMonths: age }, 0);
        return '<tr><td><b dir="ltr">' + esc(d.name) + '</b><div class="small muted">' + esc(d.nameAr) + ' · ' + esc(d.category) + '</div></td><td>' + (forms || '—') + '</td><td class="small">' +
          r0.errors.concat(r0.warnings).map(x => '<div style="color:var(--warn)">' + esc(x) + '</div>').join('') + '</td></tr>';
      }).join('') + '</tbody></table></div></div><div class="alert warn small">النتائج مساعدة حسابية فقط، والقرار العلاجي النهائي للطبيب.</div>';
  };
  ['#cw', '#cy', '#cm', '#cq'].forEach(s => $(s).oninput = draw);
  draw(); $('#cw').focus();
}

// ---------------- التقارير ----------------
let repRange = null;
async function viewReports() {
  const t = todayStr();
  const r0 = repRange || { from: t, to: t };
  let r;
  try { r = await api('GET', '/api/reports?from=' + r0.from + '&to=' + r0.to); } catch (e) { return errToast(e); }
  const maxV = Math.max(1, ...r.days.map(d => d.visits));
  V('<div class="page-head"><h2>التقارير</h2><span class="spacer"></span><input type="date" id="rf" value="' + r.from + '" style="width:auto"><span>إلى</span><input type="date" id="rt" value="' + r.to + '" style="width:auto">' +
    '<button class="btn sm" data-q="d">اليوم</button><button class="btn sm" data-q="w">آخر 7 أيام</button><button class="btn sm" data-q="m">هذا الشهر</button></div>' +
    '<div class="stats">' + stat(r.visits, 'عدد الزيارات') + stat(r.byType.new, 'كشف جديد') + stat(r.byType.review, 'مراجعة') + stat(r.byType.emergency, 'طارئ') + stat(r.newPatients, 'مراجعون جدد') + stat(money(r.collected), 'المبالغ المستلمة') + stat(money(r.unpaid), 'غير مستلم') + '</div>' +
    (r.days.length > 1 ? '<div class="card"><h3>الزيارات اليومية</h3><div class="table-wrap"><table><tbody>' + r.days.map(d => '<tr><td class="num" style="width:110px">' + d.date + '</td><td><div style="background:var(--accent);height:14px;border-radius:4px;width:' + (d.visits / maxV * 100) + '%"></div></td><td class="num" style="width:50px">' + d.visits + '</td><td class="num" style="width:140px">' + money(d.collected) + '</td></tr>').join('') + '</tbody></table></div></div>' : '') +
    '<div class="grid g2"><div class="card"><h3>أكثر التشخيصات</h3>' + topList(r.diagnoses) + '</div><div class="card"><h3>أكثر الأدوية وصفاً</h3>' + topList(r.drugs) + '</div></div>');
  const set = (from, to) => { repRange = { from, to }; viewReports(); };
  $('#rf').onchange = $('#rt').onchange = () => set($('#rf').value, $('#rt').value);
  $$('[data-q]').forEach(b => b.onclick = () => {
    if (b.dataset.q === 'd') set(t, t);
    if (b.dataset.q === 'w') set(addDays(t, -6), t);
    if (b.dataset.q === 'm') set(t.slice(0, 8) + '01', t);
  });
}
const topList = l => l.length ? '<table class="small"><tbody>' + l.map(x => '<tr><td>' + esc(x.name) + '</td><td class="num" style="width:50px">' + x.n + '</td></tr>').join('') + '</tbody></table>' : '<div class="muted small">لا توجد بيانات</div>';

// ---------------- المستخدمون ----------------
async function viewUsers() {
  let users;
  try { users = await api('GET', '/api/users'); } catch (e) { return errToast(e); }
  V('<div class="page-head"><h2>المستخدمون</h2><span class="spacer"></span><button class="btn primary" id="newU">إضافة مستخدم</button></div>' +
    '<div class="alert info small">أنشئ حساباً لكل موظف استعلامات. حساب الاستعلامات يسجل المراجعين والقياسات والأجور والمواعيد، ولا يرى التشخيص أو الملاحظات الطبية.</div>' +
    '<div class="card" style="padding:0"><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>الصلاحية</th><th>الحالة</th><th></th></tr></thead><tbody>' +
    users.map(u => '<tr><td><b>' + esc(u.name) + '</b></td><td dir="ltr" style="text-align:right">' + esc(u.username) + '</td><td>' + (u.role === 'doctor' ? 'طبيب' : 'استعلامات') + '</td><td>' + (u.active ? '<span class="badge b-done">فعال</span>' : '<span class="badge b-cancelled">معطل</span>') + '</td>' +
      '<td><div class="row"><button class="btn sm" data-pw="' + u.id + '">تغيير كلمة المرور</button>' + (u.id !== S.user.id ? '<button class="btn sm" data-tg="' + u.id + '">' + (u.active ? 'تعطيل' : 'تفعيل') + '</button>' : '') + '</div></td></tr>').join('') + '</tbody></table></div></div>');
  $('#newU').onclick = () => modal('إضافة مستخدم', '<div class="grid g2"><div class="field"><label>الاسم</label><input name="name"></div><div class="field"><label>الصلاحية</label><select name="role"><option value="reception">استعلامات</option><option value="doctor">طبيب</option></select></div>' +
    '<div class="field"><label>اسم المستخدم (إنكليزي)</label><input name="username" dir="ltr" autocomplete="off"></div><div class="field"><label>كلمة المرور</label><input name="password" type="password" autocomplete="new-password"></div></div>', [
    { label: 'إضافة', cls: 'primary', onClick: async el => { await api('POST', '/api/users', formData(el)); toast('تمت الإضافة'); viewUsers(); } }, { label: 'إلغاء' }]);
  $$('[data-pw]').forEach(b => b.onclick = () => modal('تغيير كلمة المرور', '<div class="field"><label>كلمة المرور الجديدة</label><input name="password" type="password" autocomplete="new-password"></div>', [
    { label: 'حفظ', cls: 'primary', onClick: async el => { await api('PUT', '/api/users/' + b.dataset.pw, formData(el)); toast('تم التغيير'); } }, { label: 'إلغاء' }], { width: 420 }));
  $$('[data-tg]').forEach(b => b.onclick = async () => {
    const u = users.find(x => x.id === b.dataset.tg);
    try { await api('PUT', '/api/users/' + u.id, { active: !u.active }); viewUsers(); } catch (e) { errToast(e); }
  });
}

// ---------------- الإعدادات ----------------
function applyTheme() {
  let t = 'auto';
  try { t = localStorage.getItem('ped-theme') || 'auto'; } catch { /* */ }
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}
async function viewSettings() {
  const isDoc = S.user.role === 'doctor';
  const s = S.settings, l = S.license;
  let theme = 'auto';
  try { theme = localStorage.getItem('ped-theme') || 'auto'; } catch { /* */ }
  const inp = (name, label, extra) => '<div class="field"><label>' + label + '</label><input name="' + name + '" value="' + esc(s[name]) + '"' + (extra || '') + '></div>';
  V('<div class="page-head"><h2>' + (isDoc ? 'الإعدادات' : 'حسابي') + '</h2></div>' +
    (isDoc ? '<div class="card"><h3>بيانات العيادة (تظهر في الوصفة)</h3><form id="sf"><div class="grid g2">' + inp('clinicName', 'اسم العيادة') + inp('doctorName', 'اسم الطبيب') + inp('specialty', 'الاختصاص') + inp('phone', 'الهاتف', ' dir="ltr"') + inp('address', 'العنوان') + inp('workHours', 'أوقات الدوام') + '</div>' +
      '<div class="grid g4">' + inp('feeNew', 'أجور الكشف', ' type="number"') + inp('feeReview', 'أجور المراجعة', ' type="number"') + inp('currency', 'العملة') + inp('reviewDays', 'المراجعة المجانية خلال (يوم)', ' type="number"') + '</div>' +
      inp('rxFooter', 'ملاحظة أسفل الوصفة') + '<button class="btn primary">حفظ الإعدادات</button></form></div>' : '') +
    (LOCAL ? '<div class="card"><h3>نسخة الهاتف</h3><p class="small">هذه النسخة تعمل على الهاتف وحده بدون شبكة، والبيانات محفوظة في ذاكرة هذا الهاتف. يمكن الدخول بحساب الطبيب أو الاستعلامات من نفس الهاتف عبر «خروج» ثم الدخول بالحساب الآخر.</p></div>'
      : '<div class="card"><h3>الاتصال من أجهزة الشبكة</h3><p class="small">افتح المتصفح على أي جهاز في شبكة العيادة واكتب العنوان:</p><div class="machine" style="font-size:1.1rem">' + esc(location.origin) + '</div>' +
      '<p class="small muted">شاشة الانتظار للتلفاز في صالة الانتظار: <a href="/display" target="_blank" rel="noopener" dir="ltr">' + esc(location.origin) + '/display</a></p></div>') +
    '<div class="card"><h3>المظهر</h3><select id="theme" style="max-width:240px"><option value="auto">تلقائي حسب الجهاز</option><option value="light">فاتح</option><option value="dark">داكن</option></select></div>' +
    '<div class="card"><h3>تغيير كلمة المرور</h3><form id="pf" class="grid g3" style="align-items:end"><div class="field"><label>الحالية</label><input name="oldPassword" type="password" autocomplete="current-password"></div><div class="field"><label>الجديدة</label><input name="newPassword" type="password" autocomplete="new-password"></div><div class="field"><button class="btn">تغيير</button></div></form></div>' +
    (isDoc ? '<div class="card"><h3>الترخيص</h3>' + (l.activated ? '<div class="alert ok">البرنامج مفعل — نسخة كاملة</div>' : '<div class="alert warn">نسخة تجريبية — متبقي ' + l.daysLeft + ' يوم، والحد ' + l.patientLimit + ' مراجعاً</div>') +
      machineHtml() + (l.activated ? '' : activationForm()) + '</div>' +
      (LOCAL ? '<div class="card"><h3>النسخ الاحتياطي</h3><p class="small muted">انسخ النسخة الاحتياطية واحفظها في مكان آمن (رسالة لنفسك أو ملاحظة). مسح بيانات التطبيق يحذف البيانات من الهاتف.</p>' +
        '<div class="row"><button class="btn primary" id="bkCopy">نسخ النسخة الاحتياطية</button><button class="btn" id="bkPaste">استعادة من نص</button></div></div>'
      : '<div class="card"><h3>النسخ الاحتياطي</h3><p class="small muted">يحفظ النظام نسخة تلقائية يومية في مجلد data/backups على جهاز الخادم (آخر 30 يوماً). يمكنك أيضاً تنزيل نسخة كاملة وحفظها على فلاش.</p>' +
        '<div class="row"><a class="btn primary" href="/api/backup" download>تنزيل نسخة احتياطية</a><label class="btn" style="margin:0;color:var(--text)">استعادة من ملف<input type="file" id="restore" accept=".json,application/json" hidden></label></div></div>') : ''));
  $('#theme').value = theme;
  $('#theme').onchange = e => { try { localStorage.setItem('ped-theme', e.target.value); } catch { /* */ } applyTheme(); };
  $('#pf').onsubmit = async e => {
    e.preventDefault();
    try { await api('PUT', '/api/me/password', formData(e.target)); toast('تم تغيير كلمة المرور'); e.target.reset(); } catch (err) { errToast(err); }
  };
  if (!isDoc) return;
  $('#sf').onsubmit = async e => {
    e.preventDefault();
    try { S.settings = await api('PUT', '/api/settings', formData(e.target)); toast('تم حفظ الإعدادات'); } catch (err) { errToast(err); }
  };
  bindCopyMachine();
  if ($('#act')) bindActivation(() => boot());
  const restoreData = async data => {
    await api('POST', '/api/restore', data); toast('تمت الاستعادة — سجل الدخول من جديد'); setTimeout(() => location.reload(), 1200);
  };
  if (LOCAL) {
    $('#bkCopy').onclick = async () => { try { copyText(JSON.stringify(await api('GET', '/api/backup'))); } catch (e) { errToast(e); } };
    $('#bkPaste').onclick = () => modal('استعادة نسخة احتياطية', '<p class="small">الصق نص النسخة الاحتياطية. ستُستبدل جميع البيانات الحالية.</p><textarea name="data" rows="8" dir="ltr"></textarea>', [
      { label: 'استعادة', cls: 'primary', onClick: async el => {
        let data; try { data = JSON.parse(formData(el).data); } catch { toast('النص غير صالح', 'err'); return false; }
        await restoreData(data);
      } }, { label: 'إلغاء' }]);
    return;
  }
  $('#restore').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!await confirmBox('ستُستبدل جميع البيانات الحالية بمحتوى الملف (تُحفظ نسخة من الحالية تلقائياً). متابعة؟', 'استعادة')) { e.target.value = ''; return; }
    try { await restoreData(JSON.parse(await f.text())); }
    catch (err) { errToast(err); }
  };
}

boot();
