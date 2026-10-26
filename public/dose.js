// محرك حساب جرعات الأدوية للأطفال — يُستخدم في الخادم والمتصفح معاً
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dose = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UNIT_AR = { mg: 'ملغم', mcg: 'مكغم', IU: 'وحدة دولية', units: 'وحدة', ml: 'مل' };

  function freqText(freq, prn) {
    let t;
    switch (Number(freq)) {
      case 0: t = 'جرعة واحدة فقط'; break;
      case 1: t = 'مرة واحدة يومياً'; break;
      case 2: t = 'مرتين يومياً (كل 12 ساعة)'; break;
      case 3: t = 'ثلاث مرات يومياً (كل 8 ساعات)'; break;
      case 4: t = 'أربع مرات يومياً (كل 6 ساعات)'; break;
      case 6: t = 'كل 4 ساعات'; break;
      default: t = freq + ' مرات يومياً';
    }
    return prn ? t + ' عند الحاجة' : t;
  }

  // العمر بالأشهر من تاريخ الميلاد (YYYY-MM-DD)
  function ageMonths(dob, at) {
    if (!dob) return null;
    const b = new Date(dob + 'T00:00:00');
    const n = at ? new Date(at) : new Date();
    if (isNaN(b)) return null;
    let m = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
    if (n.getDate() < b.getDate()) m -= 1;
    return Math.max(0, m);
  }

  function ageText(dob, at) {
    const m = ageMonths(dob, at);
    if (m === null) return '—';
    if (m < 1) {
      const days = Math.floor(((at ? new Date(at) : new Date()) - new Date(dob + 'T00:00:00')) / 86400000);
      return Math.max(0, days) + ' يوم';
    }
    if (m < 24) return m + ' شهر';
    const y = Math.floor(m / 12), r = m % 12;
    return y + ' سنة' + (r ? ' و' + r + ' شهر' : '');
  }

  function round(n, step) { return Math.round(n / step) * step; }
  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const v = Math.round(n * 100) / 100;
    return String(v);
  }

  function findBand(bands, value) {
    return (bands || []).find(b =>
      (b.min === undefined || b.min === null || value >= b.min) &&
      (b.max === undefined || b.max === null || value < b.max));
  }

  // يحسب الجرعة. patient = { weightKg, ageMonths }
  function calc(drug, patient, formIndex) {
    const out = { ok: false, errors: [], warnings: [], notes: [] };
    if (!drug) { out.errors.push('لم يتم اختيار الدواء'); return out; }
    const w = Number(patient && patient.weightKg) || 0;
    const age = patient && patient.ageMonths !== null && patient.ageMonths !== undefined && patient.ageMonths !== ''
      ? Number(patient.ageMonths) : null;
    const unit = drug.unit || 'mg';
    let dose = null, freq = Number(drug.freq) || 0;

    if (drug.minAgeMonths && age !== null && age < drug.minAgeMonths) {
      out.warnings.push('غير موصى به تحت عمر ' + ageLabel(drug.minAgeMonths) + ' — عمر الطفل ' + ageLabel(age));
    }
    if (drug.minAgeMonths && age === null) out.warnings.push('العمر غير معروف — الحد الأدنى للعمر ' + ageLabel(drug.minAgeMonths));

    if (drug.mode === 'kg') {
      if (!w) { out.errors.push('أدخل وزن الطفل لحساب الجرعة'); return out; }
      dose = Number(drug.perKg) * w;
      out.notes.push(fmt(drug.perKg) + ' ' + (UNIT_AR[unit] || unit) + '/كغم × ' + fmt(w) + ' كغم = ' + fmt(dose));
      if (drug.minDose && dose < drug.minDose) { dose = Number(drug.minDose); out.notes.push('رُفعت إلى الحد الأدنى للجرعة ' + fmt(dose)); }
      if (drug.maxDose && dose > drug.maxDose) { dose = Number(drug.maxDose); out.warnings.push('تم تحديد الجرعة بالحد الأقصى للجرعة الواحدة ' + fmt(dose) + ' ' + (UNIT_AR[unit] || unit)); }
    } else if (drug.mode === 'age' || drug.mode === 'weight') {
      const v = drug.mode === 'age' ? age : w;
      if (v === null || !(drug.mode === 'age' ? v >= 0 : v > 0)) {
        out.errors.push(drug.mode === 'age' ? 'أدخل تاريخ ميلاد الطفل لحساب الجرعة' : 'أدخل وزن الطفل لحساب الجرعة');
        return out;
      }
      const band = findBand(drug.bands, v);
      if (!band) { out.errors.push('لا توجد جرعة معرفة لهذا ' + (drug.mode === 'age' ? 'العمر' : 'الوزن') + ' — راجع المصدر'); return out; }
      dose = Number(band.dose);
      if (band.freq !== undefined && band.freq !== null && band.freq !== '') freq = Number(band.freq);
      out.notes.push('حسب ' + (drug.mode === 'age' ? 'العمر' : 'الوزن') + ': ' + bandLabel(band, drug.mode));
    } else {
      out.errors.push('طريقة الحساب غير معروفة'); return out;
    }

    if (freq > 0 && drug.maxDaily && dose * freq > drug.maxDaily) {
      dose = Number(drug.maxDaily) / freq;
      out.warnings.push('خُفضت الجرعة لعدم تجاوز الحد الأقصى اليومي ' + fmt(drug.maxDaily) + ' ' + (UNIT_AR[unit] || unit));
    }
    if (freq > 0 && drug.maxPerKgDay && w && dose * freq > drug.maxPerKgDay * w + 1e-9) {
      dose = drug.maxPerKgDay * w / freq;
      out.warnings.push('خُفضت الجرعة لعدم تجاوز ' + fmt(drug.maxPerKgDay) + ' ' + (UNIT_AR[unit] || unit) + '/كغم/يوم');
    }

    out.ok = true;
    out.unit = unit;
    out.unitAr = UNIT_AR[unit] || unit;
    out.dose = Math.round(dose * 100) / 100;
    out.freq = freq;
    out.prn = !!drug.prn;
    out.daily = freq > 0 ? Math.round(dose * freq * 100) / 100 : out.dose;
    out.freqText = freqText(freq, drug.prn);

    const form = (drug.forms || [])[formIndex || 0];
    if (form) applyForm(out, form);
    out.text = summary(out, form);
    return out;
  }

  function applyForm(out, form) {
    out.form = form.label;
    const s = Number(form.strength);
    if (form.kind === 'liquid' && s > 0) {
      const raw = out.dose / s;
      const step = raw < 2.5 ? 0.1 : 0.5;
      let ml = round(raw, step);
      if (ml <= 0) ml = step;
      out.volumeMl = Math.round(ml * 100) / 100;
      out.givenDose = Math.round(ml * s * 100) / 100;
    } else if (form.kind === 'solid' && s > 0) {
      const step = form.split ? 0.5 : 1;
      let n = round(out.dose / s, step);
      if (n <= 0) { n = step; }
      out.count = n;
      out.countUnit = form.unitLabel || 'قرص';
      out.givenDose = Math.round(n * s * 100) / 100;
      const dev = Math.abs(out.givenDose - out.dose) / out.dose;
      if (dev > 0.2) out.warnings.push('هذا الشكل الدوائي لا يعطي جرعة دقيقة (' + fmt(out.givenDose) + ' بدلاً من ' + fmt(out.dose) + ') — اختر شكلاً آخر');
    }
  }

  function countText(n, unitLabel) {
    const map = { 0.5: 'نصف', 1: 'واحد', 1.5: 'واحد ونصف', 2: 'اثنان' };
    return (map[n] || fmt(n)) + ' ' + unitLabel;
  }

  function summary(out, form) {
    let amount;
    if (out.volumeMl !== undefined) amount = fmt(out.volumeMl) + ' مل (' + fmt(out.givenDose) + ' ' + out.unitAr + ')';
    else if (out.count !== undefined) amount = countText(out.count, out.countUnit) + ' (' + fmt(out.givenDose) + ' ' + out.unitAr + ')';
    else amount = fmt(out.dose) + ' ' + out.unitAr;
    return amount + ' — ' + out.freqText;
  }

  function ageLabel(m) {
    if (m === null || m === undefined) return '—';
    if (m < 24) return m + ' شهر';
    return (Math.round(m / 12 * 10) / 10) + ' سنة';
  }

  function bandLabel(b, mode) {
    const u = mode === 'age' ? ageLabel : (v => v + ' كغم');
    const lo = b.min !== undefined && b.min !== null ? u(b.min) : null;
    const hi = b.max !== undefined && b.max !== null ? u(b.max) : null;
    if (lo && hi) return 'من ' + lo + ' إلى أقل من ' + hi;
    if (lo) return lo + ' فأكثر';
    if (hi) return 'أقل من ' + hi;
    return 'كل الأعمار';
  }

  return { calc, freqText, ageMonths, ageText, ageLabel, bandLabel, fmt, UNIT_AR };
});
