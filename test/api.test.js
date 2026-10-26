const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');

function client(base) {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
}

test('doctor and reception full workflow', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ped-'));
  const { server, license } = createApp({ dataDir: dir });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const doc = client(base), rec = client(base);
  let r = await doc('GET', '/api/state');
  assert.strictEqual(r.data.setup, false);
  assert.strictEqual(r.data.license.trial, true);
  assert.strictEqual(r.data.license.daysLeft, 14);

  r = await doc('POST', '/api/setup', { username: 'doctor', password: 'secret1', name: 'د. أحمد', clinicName: 'عيادة النور' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await doc('POST', '/api/setup', { username: 'x', password: 'secret1' })).status, 400);

  assert.strictEqual((await doc('POST', '/api/login', { username: 'doctor', password: 'wrong' })).status, 401);
  r = await doc('POST', '/api/login', { username: 'doctor', password: 'secret1' });
  assert.strictEqual(r.data.user.role, 'doctor');

  r = await doc('POST', '/api/users', { username: 'reception', password: 'secret2', name: 'سارة', role: 'reception' });
  assert.strictEqual(r.status, 200);
  await rec('POST', '/api/login', { username: 'reception', password: 'secret2' });

  // الاستعلامات لا تصل لعمليات الطبيب
  assert.strictEqual((await rec('GET', '/api/users')).status, 403);
  assert.strictEqual((await rec('GET', '/api/reports')).status, 403);
  assert.strictEqual((await rec('POST', '/api/drugs', { name: 'x' })).status, 403);

  r = await rec('POST', '/api/patients', { name: 'علي حسن محمد', dob: '2023-04-01', sex: 'ذكر', phone: '0770', allergies: 'بنسلين' });
  assert.strictEqual(r.status, 200);
  const pid = r.data.id;
  assert.strictEqual(r.data.fileNo, '1');
  assert.strictEqual((await rec('POST', '/api/patients', { name: 'علي حسن محمد', dob: '2023-04-01' })).status, 409);

  r = await rec('POST', '/api/visits', { patientId: pid, type: 'new', paid: true, vitals: { weight: 14, temp: 38.5 } });
  assert.strictEqual(r.data.queueNo, 1);
  assert.strictEqual(r.data.fee, 25000);
  const vid = r.data.id;
  assert.strictEqual((await rec('POST', '/api/visits', { patientId: pid })).status, 400);

  assert.strictEqual((await rec('POST', '/api/visits/' + vid + '/call')).status, 403);
  r = await doc('POST', '/api/visits/' + vid + '/call');
  assert.strictEqual(r.data.status, 'in');

  const followUp = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  r = await doc('PUT', '/api/visits/' + vid, {
    diagnosis: 'التهاب لوزتين', complaint: 'حرارة',
    prescription: [{ drugId: 'paracetamol', name: 'Paracetamol', text: '8.5 مل كل 6 ساعات', durationDays: 3 }],
    followUp
  });
  assert.strictEqual(r.data.prescription.length, 1);
  await doc('POST', '/api/visits/' + vid + '/finish');

  // الاستعلامات ترى الوصفة للطباعة لكن لا ترى التشخيص
  r = await rec('GET', '/api/visits/' + vid);
  assert.strictEqual(r.data.diagnosis, undefined);
  assert.strictEqual(r.data.prescription.length, 1);
  r = await doc('GET', '/api/visits/' + vid);
  assert.strictEqual(r.data.diagnosis, 'التهاب لوزتين');

  // موعد المراجعة يُحجز تلقائياً
  r = await rec('GET', '/api/appointments?from=' + followUp + '&to=' + followUp);
  assert.strictEqual(r.data.length, 1);

  r = await rec('GET', '/api/queue');
  assert.strictEqual(r.data.summary.done, 1);
  assert.strictEqual(r.data.summary.collected, 25000);

  r = await doc('GET', '/api/reports');
  assert.strictEqual(r.data.visits, 1);
  assert.strictEqual(r.data.drugs[0].name, 'Paracetamol');

  r = await (await fetch(base + '/api/display')).json();
  assert.strictEqual(r.current, null);

  // انتهاء الفترة التجريبية يوقف العمل حتى التفعيل
  license.data.trialStart -= 15 * 86400000;
  assert.strictEqual((await rec('GET', '/api/patients')).status, 402);
  assert.strictEqual((await rec('POST', '/api/license/activate', { serial: 'AAAA-BBBB' })).status, 400);
  const { serialFor } = require('../lib/license');
  r = await rec('POST', '/api/license/activate', { serial: serialFor('PED', license.data.machine).toLowerCase() });
  assert.strictEqual(r.data.activated, true);
  assert.strictEqual((await rec('GET', '/api/patients')).status, 200);
});
