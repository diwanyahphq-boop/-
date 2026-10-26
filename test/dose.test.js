const test = require('node:test');
const assert = require('node:assert');
const Dose = require('../public/dose');
const drugs = require('../lib/drugs');
const { serialFor } = require('../lib/license');

const drug = id => drugs.find(d => d.id === id);

test('serial algorithm matches the Al-Muthalath test vector', () => {
  assert.strictEqual(serialFor('EMP', '62GD-589Q-DFWB'), '980F-E262-27FA-9F25-007D');
});

test('paracetamol 10 kg: 150 mg every 6h, syrup 120/5 rounds to 6.5 ml', () => {
  const r = Dose.calc(drug('paracetamol'), { weightKg: 10, ageMonths: 12 }, 0);
  assert.ok(r.ok);
  assert.strictEqual(r.dose, 150);
  assert.strictEqual(r.freq, 4);
  assert.strictEqual(r.volumeMl, 6.5);
  assert.strictEqual(r.givenDose, 156);
});

test('paracetamol is capped at 1000 mg per dose for heavy children', () => {
  const r = Dose.calc(drug('paracetamol'), { weightKg: 80, ageMonths: 180 }, 1);
  assert.strictEqual(r.dose, 1000);
  assert.ok(r.warnings.length);
});

test('ibuprofen warns under 6 months', () => {
  const r = Dose.calc(drug('ibuprofen'), { weightKg: 5, ageMonths: 3 }, 0);
  assert.ok(r.ok);
  assert.ok(r.warnings.some(w => w.includes('غير موصى')));
});

test('weight is required for weight-based drugs', () => {
  const r = Dose.calc(drug('amoxicillin'), { weightKg: 0, ageMonths: 24 }, 0);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.length);
});

test('amoxicillin 12 kg: 300 mg twice daily = 6 ml of 250/5', () => {
  const r = Dose.calc(drug('amoxicillin'), { weightKg: 12, ageMonths: 30 }, 1);
  assert.strictEqual(r.dose, 300);
  assert.strictEqual(r.volumeMl, 6);
  assert.strictEqual(r.daily, 600);
});

test('age-band drugs pick the right band and frequency', () => {
  const r = Dose.calc(drug('cetirizine'), { weightKg: 15, ageMonths: 36 }, 0);
  assert.strictEqual(r.dose, 2.5);
  assert.strictEqual(r.freq, 2);
  assert.strictEqual(r.volumeMl, 2.5);
});

test('weight-band drugs (ondansetron) pick the right band', () => {
  assert.strictEqual(Dose.calc(drug('ondansetron'), { weightKg: 12, ageMonths: 18 }, 0).dose, 2);
  assert.strictEqual(Dose.calc(drug('ondansetron'), { weightKg: 20, ageMonths: 60 }, 0).dose, 4);
});

test('solid forms round to half tablets when splittable', () => {
  const r = Dose.calc(drug('prednisolone'), { weightKg: 12, ageMonths: 30 }, 1);
  assert.strictEqual(r.dose, 12);
  assert.strictEqual(r.count, 2.5);
});

test('daily maximum reduces the single dose', () => {
  const d = { mode: 'kg', perKg: 20, freq: 4, maxDaily: 1000, unit: 'mg', forms: [] };
  const r = Dose.calc(d, { weightKg: 20 }, 0);
  assert.strictEqual(r.dose, 250);
});

test('every seeded drug computes for a typical 3-year-old', () => {
  for (const d of drugs) {
    for (let i = 0; i < d.forms.length; i++) {
      const r = Dose.calc(d, { weightKg: 14, ageMonths: 36 }, i);
      assert.ok(r.ok, d.id + ': ' + r.errors.join());
      assert.ok(r.dose > 0, d.id);
    }
  }
});

test('age text', () => {
  const now = new Date('2026-10-26T10:00:00');
  assert.strictEqual(Dose.ageMonths('2024-10-26', now), 24);
  assert.strictEqual(Dose.ageMonths('2024-10-27', now), 23);
  assert.strictEqual(Dose.ageText('2023-04-01', now), '3 سنة و6 شهر');
});
