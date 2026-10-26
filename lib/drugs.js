// قاعدة بيانات أولية لأدوية الأطفال الشائعة.
// القيم مأخوذة من المراجع الشائعة (BNF for Children, WHO, Harriet Lane) كقيم استرشادية،
// ويجب على الطبيب مراجعتها وتعديلها حسب النشرة المعتمدة محلياً من شاشة "قاعدة الأدوية".
//
// mode: 'kg'     => perKg لكل جرعة × الوزن، مع maxDose للجرعة و maxDaily لليوم
//       'age'    => جرعة ثابتة حسب شريحة العمر بالأشهر (min شامل، max غير شامل)
//       'weight' => جرعة ثابتة حسب شريحة الوزن بالكيلوغرام
// freq: عدد المرات يومياً (0 = جرعة واحدة فقط)
// forms.kind: liquid => strength لكل 1 مل ، solid => strength لكل وحدة (split = يمكن تنصيفه)

module.exports = [
  {
    id: 'paracetamol', name: 'Paracetamol', nameAr: 'باراسيتامول', category: 'خافض حرارة ومسكن',
    mode: 'kg', perKg: 15, freq: 4, prn: true, maxDose: 1000, maxDaily: 4000, maxPerKgDay: 60, unit: 'mg',
    durationDays: 3, route: 'فموي',
    forms: [
      { label: 'شراب 120 ملغم/5 مل', kind: 'liquid', strength: 24 },
      { label: 'شراب 250 ملغم/5 مل', kind: 'liquid', strength: 50 },
      { label: 'قطرة 100 ملغم/1 مل', kind: 'liquid', strength: 100 },
      { label: 'تحميلة 125 ملغم', kind: 'solid', strength: 125, unitLabel: 'تحميلة' },
      { label: 'تحميلة 250 ملغم', kind: 'solid', strength: 250, unitLabel: 'تحميلة' },
      { label: 'قرص 500 ملغم', kind: 'solid', strength: 500, unitLabel: 'قرص', split: true }
    ],
    instructions: 'عند ارتفاع الحرارة، لا تقل الفترة بين الجرعات عن 4–6 ساعات',
    notes: '10–15 ملغم/كغم/جرعة كل 4–6 ساعات، بحد أقصى 60 ملغم/كغم/يوم'
  },
  {
    id: 'ibuprofen', name: 'Ibuprofen', nameAr: 'ايبوبروفين', category: 'خافض حرارة ومسكن',
    mode: 'kg', perKg: 10, freq: 3, prn: true, maxDose: 400, maxDaily: 1200, maxPerKgDay: 30, unit: 'mg',
    minAgeMonths: 6, durationDays: 3, route: 'فموي',
    forms: [
      { label: 'شراب 100 ملغم/5 مل', kind: 'liquid', strength: 20 },
      { label: 'شراب 200 ملغم/5 مل', kind: 'liquid', strength: 40 }
    ],
    instructions: 'بعد الأكل. يُتجنب في الجفاف والتقيؤ الشديد',
    notes: '5–10 ملغم/كغم/جرعة كل 6–8 ساعات. لا يعطى تحت 6 أشهر أو مع الجفاف'
  },
  {
    id: 'amoxicillin', name: 'Amoxicillin', nameAr: 'اموكسيسيلين', category: 'مضاد حيوي',
    mode: 'kg', perKg: 25, freq: 2, maxDose: 1000, maxDaily: 2000, unit: 'mg',
    durationDays: 7, route: 'فموي',
    forms: [
      { label: 'شراب 125 ملغم/5 مل', kind: 'liquid', strength: 25 },
      { label: 'شراب 250 ملغم/5 مل', kind: 'liquid', strength: 50 },
      { label: 'كبسول 500 ملغم', kind: 'solid', strength: 500, unitLabel: 'كبسولة' }
    ],
    instructions: 'يُرج الشراب جيداً ويُحفظ في الثلاجة بعد التحضير',
    notes: 'الجرعة الاعتيادية 50 ملغم/كغم/يوم مقسمة على جرعتين'
  },
  {
    id: 'amoxicillin-hd', name: 'Amoxicillin (High dose)', nameAr: 'اموكسيسيلين جرعة عالية', category: 'مضاد حيوي',
    mode: 'kg', perKg: 45, freq: 2, maxDose: 2000, maxDaily: 4000, unit: 'mg',
    durationDays: 10, route: 'فموي',
    forms: [
      { label: 'شراب 250 ملغم/5 مل', kind: 'liquid', strength: 50 },
      { label: 'شراب 400 ملغم/5 مل', kind: 'liquid', strength: 80 },
      { label: 'كبسول 500 ملغم', kind: 'solid', strength: 500, unitLabel: 'كبسولة' }
    ],
    instructions: 'يُرج الشراب جيداً',
    notes: '80–90 ملغم/كغم/يوم مقسمة على جرعتين (التهاب الأذن الوسطى، الالتهاب الرئوي)'
  },
  {
    id: 'co-amoxiclav', name: 'Amoxicillin + Clavulanate', nameAr: 'اموكسيسيلين + كلافيولانيت', category: 'مضاد حيوي',
    mode: 'kg', perKg: 22.5, freq: 2, maxDose: 875, maxDaily: 1750, unit: 'mg',
    durationDays: 7, route: 'فموي',
    forms: [
      { label: 'شراب 228 ملغم/5 مل (200 اموكسيسيلين)', kind: 'liquid', strength: 40 },
      { label: 'شراب 457 ملغم/5 مل (400 اموكسيسيلين)', kind: 'liquid', strength: 80 },
      { label: 'قرص 625 ملغم (500 اموكسيسيلين)', kind: 'solid', strength: 500, unitLabel: 'قرص' }
    ],
    instructions: 'في بداية الوجبة لتقليل اضطراب المعدة',
    notes: 'الحساب على أساس مكون الاموكسيسيلين: 45 ملغم/كغم/يوم مقسمة على جرعتين'
  },
  {
    id: 'azithromycin', name: 'Azithromycin', nameAr: 'ازيثرومايسين', category: 'مضاد حيوي',
    mode: 'kg', perKg: 10, freq: 1, maxDose: 500, maxDaily: 500, unit: 'mg',
    minAgeMonths: 6, durationDays: 3, route: 'فموي',
    forms: [
      { label: 'شراب 200 ملغم/5 مل', kind: 'liquid', strength: 40 },
      { label: 'شراب 100 ملغم/5 مل', kind: 'liquid', strength: 20 }
    ],
    instructions: 'مرة واحدة يومياً لمدة 3 أيام',
    notes: '10 ملغم/كغم مرة يومياً لمدة 3 أيام'
  },
  {
    id: 'clarithromycin', name: 'Clarithromycin', nameAr: 'كلاريثرومايسين', category: 'مضاد حيوي',
    mode: 'kg', perKg: 7.5, freq: 2, maxDose: 500, maxDaily: 1000, unit: 'mg',
    minAgeMonths: 6, durationDays: 7, route: 'فموي',
    forms: [
      { label: 'شراب 125 ملغم/5 مل', kind: 'liquid', strength: 25 },
      { label: 'شراب 250 ملغم/5 مل', kind: 'liquid', strength: 50 }
    ],
    instructions: '', notes: '15 ملغم/كغم/يوم مقسمة على جرعتين'
  },
  {
    id: 'cefixime', name: 'Cefixime', nameAr: 'سيفكسيم', category: 'مضاد حيوي',
    mode: 'kg', perKg: 8, freq: 1, maxDose: 400, maxDaily: 400, unit: 'mg',
    minAgeMonths: 6, durationDays: 7, route: 'فموي',
    forms: [{ label: 'شراب 100 ملغم/5 مل', kind: 'liquid', strength: 20 }],
    instructions: '', notes: '8 ملغم/كغم/يوم مرة واحدة أو مقسمة على جرعتين'
  },
  {
    id: 'cefuroxime', name: 'Cefuroxime axetil', nameAr: 'سيفوروكسيم', category: 'مضاد حيوي',
    mode: 'kg', perKg: 15, freq: 2, maxDose: 500, maxDaily: 1000, unit: 'mg',
    minAgeMonths: 3, durationDays: 7, route: 'فموي',
    forms: [
      { label: 'شراب 125 ملغم/5 مل', kind: 'liquid', strength: 25 },
      { label: 'شراب 250 ملغم/5 مل', kind: 'liquid', strength: 50 }
    ],
    instructions: 'مع الطعام', notes: '30 ملغم/كغم/يوم مقسمة على جرعتين'
  },
  {
    id: 'cephalexin', name: 'Cephalexin', nameAr: 'سيفالكسين', category: 'مضاد حيوي',
    mode: 'kg', perKg: 12.5, freq: 4, maxDose: 500, maxDaily: 2000, unit: 'mg',
    durationDays: 7, route: 'فموي',
    forms: [
      { label: 'شراب 125 ملغم/5 مل', kind: 'liquid', strength: 25 },
      { label: 'شراب 250 ملغم/5 مل', kind: 'liquid', strength: 50 },
      { label: 'كبسول 250 ملغم', kind: 'solid', strength: 250, unitLabel: 'كبسولة' }
    ],
    instructions: '', notes: '25–50 ملغم/كغم/يوم مقسمة على 4 جرعات'
  },
  {
    id: 'ceftriaxone', name: 'Ceftriaxone', nameAr: 'سيفترياكسون', category: 'مضاد حيوي (حقن)',
    mode: 'kg', perKg: 50, freq: 1, maxDose: 2000, maxDaily: 2000, unit: 'mg',
    durationDays: 3, route: 'عضلي/وريدي',
    forms: [
      { label: 'فيال 500 ملغم', kind: 'other', strength: 500 },
      { label: 'فيال 1 غم', kind: 'other', strength: 1000 }
    ],
    instructions: 'تحت إشراف طبي. لا يُخلط مع محاليل تحتوي الكالسيوم',
    notes: '50 ملغم/كغم مرة يومياً (حتى 100 ملغم/كغم في الحالات الشديدة)'
  },
  {
    id: 'metronidazole', name: 'Metronidazole', nameAr: 'ميترونيدازول', category: 'مضاد حيوي/طفيلي',
    mode: 'kg', perKg: 7.5, freq: 3, maxDose: 500, maxDaily: 1500, unit: 'mg',
    durationDays: 5, route: 'فموي',
    forms: [{ label: 'شراب 200 ملغم/5 مل', kind: 'liquid', strength: 40 }],
    instructions: 'بعد الأكل', notes: '7.5 ملغم/كغم كل 8 ساعات (الأميبا حتى 10–15 ملغم/كغم)'
  },
  {
    id: 'cotrimoxazole', name: 'Trimethoprim + Sulfamethoxazole', nameAr: 'كوتريموكسازول', category: 'مضاد حيوي',
    mode: 'kg', perKg: 4, freq: 2, maxDose: 160, maxDaily: 320, unit: 'mg',
    minAgeMonths: 2, durationDays: 7, route: 'فموي',
    forms: [{ label: 'شراب 240 ملغم/5 مل (40 تراي ميثوبريم)', kind: 'liquid', strength: 8 }],
    instructions: 'مع كثرة السوائل', notes: 'الحساب على مكون التراي ميثوبريم: 8 ملغم/كغم/يوم على جرعتين'
  },
  {
    id: 'acyclovir', name: 'Acyclovir', nameAr: 'اسيكلوفير', category: 'مضاد فيروسي',
    mode: 'kg', perKg: 20, freq: 4, maxDose: 800, maxDaily: 3200, unit: 'mg',
    minAgeMonths: 24, durationDays: 5, route: 'فموي',
    forms: [{ label: 'شراب 200 ملغم/5 مل', kind: 'liquid', strength: 40 }],
    instructions: 'مع كثرة السوائل', notes: 'جدري الماء: 20 ملغم/كغم 4 مرات يومياً لمدة 5 أيام'
  },
  {
    id: 'cetirizine', name: 'Cetirizine', nameAr: 'سيتريزين', category: 'مضاد حساسية',
    mode: 'age', freq: 1, unit: 'mg', minAgeMonths: 6, durationDays: 5, route: 'فموي',
    bands: [
      { min: 6, max: 24, dose: 2.5 },
      { min: 24, max: 72, dose: 2.5, freq: 2 },
      { min: 72, max: 144, dose: 5, freq: 2 },
      { min: 144, max: null, dose: 10 }
    ],
    forms: [
      { label: 'شراب 5 ملغم/5 مل', kind: 'liquid', strength: 1 },
      { label: 'قرص 10 ملغم', kind: 'solid', strength: 10, unitLabel: 'قرص', split: true }
    ],
    instructions: 'قد يسبب النعاس', notes: ''
  },
  {
    id: 'loratadine', name: 'Loratadine', nameAr: 'لوراتادين', category: 'مضاد حساسية',
    mode: 'weight', freq: 1, unit: 'mg', minAgeMonths: 24, durationDays: 5, route: 'فموي',
    bands: [{ min: 0, max: 30, dose: 5 }, { min: 30, max: null, dose: 10 }],
    forms: [
      { label: 'شراب 5 ملغم/5 مل', kind: 'liquid', strength: 1 },
      { label: 'قرص 10 ملغم', kind: 'solid', strength: 10, unitLabel: 'قرص', split: true }
    ],
    instructions: '', notes: 'من سنتين: أقل من 30 كغم 5 ملغم، 30 كغم فأكثر 10 ملغم'
  },
  {
    id: 'desloratadine', name: 'Desloratadine', nameAr: 'ديسلوراتادين', category: 'مضاد حساسية',
    mode: 'age', freq: 1, unit: 'mg', minAgeMonths: 6, durationDays: 5, route: 'فموي',
    bands: [
      { min: 6, max: 12, dose: 1 },
      { min: 12, max: 72, dose: 1.25 },
      { min: 72, max: 144, dose: 2.5 },
      { min: 144, max: null, dose: 5 }
    ],
    forms: [{ label: 'شراب 2.5 ملغم/5 مل', kind: 'liquid', strength: 0.5 }],
    instructions: '', notes: ''
  },
  {
    id: 'montelukast', name: 'Montelukast', nameAr: 'مونتيلوكاست', category: 'الربو والحساسية',
    mode: 'age', freq: 1, unit: 'mg', minAgeMonths: 6, durationDays: 30, route: 'فموي',
    bands: [{ min: 6, max: 72, dose: 4 }, { min: 72, max: 180, dose: 5 }, { min: 180, max: null, dose: 10 }],
    forms: [
      { label: 'حبيبات/قرص مضغ 4 ملغم', kind: 'solid', strength: 4, unitLabel: 'كيس/قرص' },
      { label: 'قرص مضغ 5 ملغم', kind: 'solid', strength: 5, unitLabel: 'قرص' },
      { label: 'قرص 10 ملغم', kind: 'solid', strength: 10, unitLabel: 'قرص' }
    ],
    instructions: 'مساءً قبل النوم', notes: 'مراقبة التغيرات السلوكية والنوم'
  },
  {
    id: 'salbutamol-neb', name: 'Salbutamol nebules', nameAr: 'سالبيوتامول بخار', category: 'الربو والحساسية',
    mode: 'weight', freq: 4, prn: true, unit: 'mg', durationDays: 5, route: 'استنشاق (نيبولايزر)',
    bands: [{ min: 0, max: 20, dose: 2.5 }, { min: 20, max: null, dose: 5 }],
    forms: [{ label: 'محلول 5 ملغم/1 مل', kind: 'liquid', strength: 5 }, { label: 'أمبولة 2.5 ملغم/2.5 مل', kind: 'liquid', strength: 1 }],
    instructions: 'تُخفف بمحلول ملحي إلى 3 مل', notes: 'أقل من 20 كغم: 2.5 ملغم، 20 كغم فأكثر: 5 ملغم'
  },
  {
    id: 'budesonide-neb', name: 'Budesonide nebules', nameAr: 'بوديسونايد بخار', category: 'الربو والحساسية',
    mode: 'age', freq: 2, unit: 'mg', minAgeMonths: 6, durationDays: 7, route: 'استنشاق (نيبولايزر)',
    bands: [{ min: 6, max: 144, dose: 0.5 }, { min: 144, max: null, dose: 1 }],
    forms: [{ label: 'أمبولة 0.5 ملغم/2 مل', kind: 'liquid', strength: 0.25 }],
    instructions: 'غسل الفم بعد الاستخدام', notes: '0.25–0.5 ملغم مرتين يومياً'
  },
  {
    id: 'prednisolone', name: 'Prednisolone', nameAr: 'بريدنيزولون', category: 'كورتيزون',
    mode: 'kg', perKg: 1, freq: 1, maxDose: 40, maxDaily: 40, unit: 'mg',
    durationDays: 3, route: 'فموي',
    forms: [
      { label: 'شراب 15 ملغم/5 مل', kind: 'liquid', strength: 3 },
      { label: 'قرص 5 ملغم', kind: 'solid', strength: 5, unitLabel: 'قرص', split: true }
    ],
    instructions: 'صباحاً بعد الأكل', notes: 'نوبة الربو: 1–2 ملغم/كغم/يوم لمدة 3–5 أيام'
  },
  {
    id: 'dexamethasone', name: 'Dexamethasone', nameAr: 'ديكساميثازون', category: 'كورتيزون',
    mode: 'kg', perKg: 0.6, freq: 0, maxDose: 16, unit: 'mg',
    durationDays: 1, route: 'فموي/عضلي',
    forms: [{ label: 'أمبولة 4 ملغم/1 مل', kind: 'liquid', strength: 4 }, { label: 'قرص 0.5 ملغم', kind: 'solid', strength: 0.5, unitLabel: 'قرص' }],
    instructions: '', notes: 'الخانوق (Croup): 0.15–0.6 ملغم/كغم جرعة واحدة'
  },
  {
    id: 'ondansetron', name: 'Ondansetron', nameAr: 'اوندانسيترون', category: 'مضاد قيء',
    mode: 'weight', freq: 0, unit: 'mg', minAgeMonths: 6, durationDays: 1, route: 'فموي',
    bands: [{ min: 8, max: 15, dose: 2 }, { min: 15, max: 30, dose: 4 }, { min: 30, max: null, dose: 8 }],
    forms: [{ label: 'شراب 4 ملغم/5 مل', kind: 'liquid', strength: 0.8 }, { label: 'قرص ذائب 4 ملغم', kind: 'solid', strength: 4, unitLabel: 'قرص' }],
    instructions: 'قبل البدء بمحلول الإرواء بنصف ساعة', notes: 'جرعة واحدة في التهاب المعدة والأمعاء'
  },
  {
    id: 'ors', name: 'Oral Rehydration Solution', nameAr: 'محلول الإرواء الفموي', category: 'الجفاف والإسهال',
    mode: 'weight', freq: 0, unit: 'ml', durationDays: 3, route: 'فموي',
    bands: [{ min: 0, max: 10, dose: 75 }, { min: 10, max: null, dose: 150 }],
    forms: [{ label: 'كيس يُذاب في لتر ماء', kind: 'other', strength: 0 }],
    instructions: 'بعد كل خروج رخو، رشفات صغيرة متكررة',
    notes: 'أقل من 10 كغم: 50–100 مل بعد كل إسهال، 10 كغم فأكثر: 100–200 مل'
  },
  {
    id: 'zinc', name: 'Zinc sulfate', nameAr: 'زنك', category: 'الجفاف والإسهال',
    mode: 'age', freq: 1, unit: 'mg', durationDays: 10, route: 'فموي',
    bands: [{ min: 0, max: 6, dose: 10 }, { min: 6, max: null, dose: 20 }],
    forms: [{ label: 'شراب 20 ملغم/5 مل', kind: 'liquid', strength: 4 }, { label: 'قرص ذائب 20 ملغم', kind: 'solid', strength: 20, unitLabel: 'قرص', split: true }],
    instructions: 'لمدة 10–14 يوماً حتى بعد توقف الإسهال', notes: 'توصية منظمة الصحة العالمية'
  },
  {
    id: 'albendazole', name: 'Albendazole', nameAr: 'البندازول', category: 'مضاد ديدان',
    mode: 'age', freq: 0, unit: 'mg', minAgeMonths: 12, durationDays: 1, route: 'فموي',
    bands: [{ min: 12, max: 24, dose: 200 }, { min: 24, max: null, dose: 400 }],
    forms: [{ label: 'شراب 200 ملغم/5 مل', kind: 'liquid', strength: 40 }, { label: 'قرص 400 ملغم', kind: 'solid', strength: 400, unitLabel: 'قرص', split: true }],
    instructions: 'جرعة واحدة، تُعاد بعد أسبوعين عند الحاجة', notes: ''
  },
  {
    id: 'mebendazole', name: 'Mebendazole', nameAr: 'ميبندازول', category: 'مضاد ديدان',
    mode: 'age', freq: 2, unit: 'mg', minAgeMonths: 12, durationDays: 3, route: 'فموي',
    bands: [{ min: 12, max: null, dose: 100 }],
    forms: [{ label: 'شراب 100 ملغم/5 مل', kind: 'liquid', strength: 20 }, { label: 'قرص 100 ملغم', kind: 'solid', strength: 100, unitLabel: 'قرص' }],
    instructions: 'مرتين يومياً لمدة 3 أيام (الدودة الدبوسية: 100 ملغم جرعة واحدة)', notes: ''
  },
  {
    id: 'nystatin', name: 'Nystatin oral suspension', nameAr: 'نيستاتين', category: 'مضاد فطري',
    mode: 'age', freq: 4, unit: 'units', durationDays: 7, route: 'فموي (موضعي داخل الفم)',
    bands: [{ min: 0, max: 12, dose: 200000 }, { min: 12, max: null, dose: 400000 }],
    forms: [{ label: 'معلق 100,000 وحدة/1 مل', kind: 'liquid', strength: 100000 }],
    instructions: 'بعد الرضاعة، يوزع داخل الفم ويستمر 48 ساعة بعد الشفاء', notes: ''
  },
  {
    id: 'fluconazole', name: 'Fluconazole', nameAr: 'فلوكونازول', category: 'مضاد فطري',
    mode: 'kg', perKg: 3, freq: 1, maxDose: 200, maxDaily: 200, unit: 'mg',
    durationDays: 7, route: 'فموي',
    forms: [{ label: 'معلق 50 ملغم/5 مل', kind: 'liquid', strength: 10 }],
    instructions: '', notes: 'اليوم الأول 6 ملغم/كغم ثم 3 ملغم/كغم يومياً'
  },
  {
    id: 'omeprazole', name: 'Omeprazole', nameAr: 'اوميبرازول', category: 'الجهاز الهضمي',
    mode: 'weight', freq: 1, unit: 'mg', minAgeMonths: 12, durationDays: 14, route: 'فموي',
    bands: [{ min: 5, max: 10, dose: 5 }, { min: 10, max: 20, dose: 10 }, { min: 20, max: null, dose: 20 }],
    forms: [{ label: 'كبسول 10 ملغم', kind: 'solid', strength: 10, unitLabel: 'كبسولة' }, { label: 'كبسول 20 ملغم', kind: 'solid', strength: 20, unitLabel: 'كبسولة' }],
    instructions: 'قبل الفطور بنصف ساعة', notes: ''
  },
  {
    id: 'iron', name: 'Iron (elemental)', nameAr: 'حديد', category: 'فيتامينات ومعادن',
    mode: 'kg', perKg: 3, freq: 1, maxDose: 60, maxDaily: 60, unit: 'mg',
    durationDays: 90, route: 'فموي',
    forms: [{ label: 'قطرة 15 ملغم حديد/1 مل', kind: 'liquid', strength: 15 }, { label: 'شراب 30 ملغم حديد/5 مل', kind: 'liquid', strength: 6 }],
    instructions: 'بين الوجبات مع العصير، لا يعطى مع الحليب', notes: 'العلاج 3–6 ملغم/كغم/يوم من الحديد العنصري'
  },
  {
    id: 'vitamin-d', name: 'Vitamin D3', nameAr: 'فيتامين د', category: 'فيتامينات ومعادن',
    mode: 'age', freq: 1, unit: 'IU', durationDays: 90, route: 'فموي',
    bands: [{ min: 0, max: 12, dose: 400 }, { min: 12, max: null, dose: 600 }],
    forms: [{ label: 'قطرة 400 وحدة/1 مل', kind: 'liquid', strength: 400 }],
    instructions: '', notes: 'جرعة وقائية. جرعات العلاج تحدد من قبل الطبيب'
  }
];
