// يبني نسخة الهاتف كملف واحد: dist/mobile/index.html
// تعمل بدون خادم، وتُستخدم للمعاينة على الهاتف ولتطبيق أندرويد.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const script = code => '<script>\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>';

const drugs = require(path.join(root, 'lib/drugs.js'));
const html = '<!doctype html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  '<meta name="theme-color" content="#0e5a52">\n' +
  '<title>المثلث لعيادة الأطفال</title>\n' +
  read('public/index.html').match(/<link rel="icon"[^>]*>/)[0] + '\n' +
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Readex+Pro:wght@400;600;700&display=swap">\n' +
  '<style>\n' + read('public/style.css') + '\n</style>\n</head>\n<body>\n<div id="root"></div>\n<div class="toasts" id="toasts"></div>\n' +
  script('window.PED_DRUGS = ' + JSON.stringify(drugs) + ';') + '\n' +
  ['lib/serial.js', 'lib/core.js', 'public/dose.js', 'public/local-backend.js', 'public/app.js'].map(f => script(read(f))).join('\n') +
  '\n</body>\n</html>\n';

const args = process.argv.slice(2);
const preview = args.includes('--preview');
const out = args.find(a => !a.startsWith('--')) || path.join(root, 'dist/mobile/index.html');
let result = html;
if (preview) {
  // صفحة معاينة: محتوى الصفحة فقط (الإطار يضيف هيكل المستند)، بدون أزرار الطباعة والمشاركة
  result = result.replace(/^<!doctype html>\n<html[^>]*>\n<head>\n<meta charset="utf-8">\n<meta name="viewport"[^>]*>\n/, '')
    .replace('</head>\n<body>\n', '').replace('\n</body>\n</html>\n', '\n')
    .replace('<div id="root"></div>', '<div id="root"></div>\n<script>window.PED_NO_PRINT = true; document.documentElement.dir = \'rtl\'; document.documentElement.lang = \'ar\';</script>');
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, result);
const html_ = result;
console.log('built', out, Math.round(html_.length / 1024) + ' KB');
