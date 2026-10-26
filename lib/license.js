// ترخيص المثلث — نسخة تجريبية 14 يوماً ثم التفعيل برقم تسلسلي مرتبط برقم الحاسبة
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROGRAM_CODE = 'PED';
const TRIAL_DAYS = 14;
const TRIAL_PATIENT_LIMIT = 30;
const LIC_SECRET = 'MTH-7f3a91c2-2026-ASL-K9x';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function serialFor(code, machine) {
  const m = String(machine).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const h = cyrb128(LIC_SECRET + '|' + String(code).toUpperCase() + '|' + m);
  return h.map(x => x.toString(16).padStart(8, '0')).join('').toUpperCase().slice(0, 20).match(/.{4}/g).join('-');
}

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function newMachine() {
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHA[bytes[i] % ALPHA.length];
  return s.match(/.{4}/g).join('-');
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
  isActivated() { return !!this.data.serial && norm(this.data.serial) === norm(serialFor(PROGRAM_CODE, this.data.machine)); }
  status() {
    const activated = this.isActivated();
    const elapsed = this.now() - this.data.trialStart;
    const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - elapsed / 86400000));
    return {
      program: PROGRAM_CODE, machine: this.data.machine, activated,
      trial: !activated, daysLeft: activated ? null : daysLeft,
      expired: !activated && daysLeft <= 0,
      patientLimit: activated ? null : TRIAL_PATIENT_LIMIT, trialDays: TRIAL_DAYS
    };
  }
  activate(serial) {
    if (norm(serial) !== norm(serialFor(PROGRAM_CODE, this.data.machine))) return false;
    this.data.serial = serialFor(PROGRAM_CODE, this.data.machine);
    this.save();
    return true;
  }
}

module.exports = { License, serialFor, PROGRAM_CODE, TRIAL_DAYS, TRIAL_PATIENT_LIMIT };
