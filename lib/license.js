// ترخيص المثلث — نسخة تجريبية 14 يوماً ثم التفعيل برقم تسلسلي مرتبط برقم الحاسبة
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { serialFor, norm, ALPHA } = require('./serial');

const PROGRAM_CODE = 'PED';
const TRIAL_DAYS = 14;
const TRIAL_PATIENT_LIMIT = 30;

function newMachine() {
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHA[bytes[i] % ALPHA.length];
  return s.match(/.{4}/g).join('-');
}

function licenseStatus(data, now) {
  const activated = !!data.serial && norm(data.serial) === norm(serialFor(PROGRAM_CODE, data.machine));
  const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - (now - data.trialStart) / 86400000));
  return {
    program: PROGRAM_CODE, machine: data.machine, activated,
    trial: !activated, daysLeft: activated ? null : daysLeft,
    expired: !activated && daysLeft <= 0,
    patientLimit: activated ? null : TRIAL_PATIENT_LIMIT, trialDays: TRIAL_DAYS
  };
}

class License {
  constructor(dir) {
    this.file = path.join(dir, 'license.json');
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.data = null; }
    if (!this.data || !this.data.machine) {
      const now = Date.now();
      this.data = { machine: newMachine(), trialStart: now, lastSeen: now, serial: null };
    }
    this.touch();
  }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
  // max(now, lastSeen) حتى لا يمدد إرجاع الساعة الفترة التجريبية
  now() { return Math.max(Date.now(), this.data.lastSeen || 0); }
  touch() { this.data.lastSeen = this.now(); this.save(); }
  status() { return licenseStatus(this.data, this.now()); }
  activate(serial) {
    if (norm(serial) !== norm(serialFor(PROGRAM_CODE, this.data.machine))) return false;
    this.data.serial = serialFor(PROGRAM_CODE, this.data.machine);
    this.save();
    return true;
  }
}

module.exports = { License, licenseStatus, serialFor, PROGRAM_CODE, TRIAL_DAYS, TRIAL_PATIENT_LIMIT };
