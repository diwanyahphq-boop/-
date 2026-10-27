// تخزين البيانات في ملف JSON على جهاز الخادم مع حفظ آمن ونسخ احتياطي يومي
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seedDrugs = require('./drugs');
const { emptyDb: baseEmptyDb } = require('./core');

const emptyDb = () => baseEmptyDb(seedDrugs);

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    this.backupDir = path.join(dir, 'backups');
    fs.mkdirSync(this.backupDir, { recursive: true });
    if (fs.existsSync(this.file)) {
      this.db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const base = emptyDb();
      for (const k of Object.keys(base)) if (this.db[k] === undefined) this.db[k] = base[k];
      this.db.settings = Object.assign(base.settings, this.db.settings);
    } else {
      this.db = emptyDb();
      this.flush();
    }
    this.timer = null;
  }
  id() { return crypto.randomBytes(8).toString('hex'); }
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 150);
  }
  flush() {
    clearTimeout(this.timer);
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, this.file);
    this.dailyBackup();
  }
  dailyBackup() {
    const day = new Date().toISOString().slice(0, 10);
    const f = path.join(this.backupDir, 'db-' + day + '.json');
    if (fs.existsSync(f)) return;
    fs.copyFileSync(this.file, f);
    // الاحتفاظ بآخر 30 نسخة
    const files = fs.readdirSync(this.backupDir).filter(x => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();
    while (files.length > 30) fs.unlinkSync(path.join(this.backupDir, files.shift()));
  }
  replace(db) {
    const base = emptyDb();
    for (const k of ['users', 'patients', 'visits', 'appointments', 'drugs', 'settings', 'counters']) {
      if (db[k] === undefined) throw new Error('ملف النسخة الاحتياطية غير صالح: ' + k);
    }
    // نسخة من الحالة الحالية قبل الاستبدال
    fs.copyFileSync(this.file, path.join(this.backupDir, 'before-restore-' + Date.now() + '.json'));
    this.db = Object.assign(base, db);
    this.flush();
  }
}

module.exports = { Store, emptyDb };
