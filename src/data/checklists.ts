// Structured checklists & critique frameworks used across the project studio.
// These are general architectural-education checklists (not official
// Tartous University requirements). Joudy's professor's brief always wins.

export interface CheckItem {
  id: string;
  text: string;
  hint?: string;
}

export const SITE_CHECKS: CheckItem[] = [
  { id: 'boundary', text: 'حدود الموقع وأبعاده موثقة بدقة على مخطط', hint: 'Site boundary & dimensions' },
  { id: 'north', text: 'اتجاه الشمال الحقيقي محدد على المخطط', hint: 'True north' },
  { id: 'topo', text: 'الطبوغرافيا والمناسيب (Levels) مدروسة', hint: 'Topography / contours' },
  { id: 'sun', text: 'مسار الشمس صيفاً وشتاءً وتأثيره على الواجهات', hint: 'Sun path & solar exposure' },
  { id: 'wind', text: 'الرياح السائدة موثقة من مصدر موثوق (مع ذكر المصدر)', hint: 'Prevailing winds — cite the source' },
  { id: 'access', text: 'نقاط الوصول للمشاة والسيارات والخدمة', hint: 'Access points' },
  { id: 'traffic', text: 'كثافة الحركة على الشوارع المحيطة', hint: 'Traffic & street hierarchy' },
  { id: 'context', text: 'المباني المجاورة: الارتفاعات، الاستعمالات، الطابع', hint: 'Built context' },
  { id: 'views', text: 'الإطلالات الجيدة والسيئة (Views in / out)', hint: 'Views' },
  { id: 'noise', text: 'مصادر الضجيج', hint: 'Noise sources' },
  { id: 'infra', text: 'البنية التحتية: كهرباء، ماء، صرف', hint: 'Utilities' },
  { id: 'regs', text: 'الأنظمة: الوجائب (Setbacks)، نسبة البناء، الارتفاع المسموح', hint: 'Zoning regulations' },
  { id: 'photos', text: 'صور فوتوغرافية للموقع ومحيطه', hint: 'Site photographs' },
  { id: 'swot', text: 'خلاصة: فرص ومحددات واضحة تقود التصميم', hint: 'Opportunities & constraints synthesis' },
];

export const PROGRAM_CHECKS: CheckItem[] = [
  { id: 'brief', text: 'كل متطلبات البرنامج من الأستاذ موجودة في جدول الفراغات' },
  { id: 'areas', text: 'مساحات الفراغات مبررة (معايير نويفرت أو مشاريع مشابهة)' },
  { id: 'zoning', text: 'كل فراغ مصنف ضمن نطاق وظيفي (عام / خاص / خدمات)' },
  { id: 'adj', text: 'مصفوفة العلاقات الوظيفية مكتملة للفراغات الأساسية' },
  { id: 'entrance', text: 'المدخل الرئيسي واضح ومرتبط بالفراغ العام' },
  { id: 'service', text: 'مدخل خدمة منفصل عند الحاجة' },
  { id: 'vertical', text: 'الحركة الشاقولية (أدراج/مصاعد) موزعة ضمن مسافات هروب معقولة' },
  { id: 'access', text: 'إمكانية الوصول لذوي الاحتياجات الخاصة (منحدرات، مصعد، دورات مياه)' },
  { id: 'wet', text: 'تجميع الفراغات الرطبة (حمامات/مطابخ) شاقولياً' },
  { id: 'grid', text: 'الشبكة الإنشائية متوافقة مع أبعاد الفراغات' },
  { id: 'far', text: 'المساحة الإجمالية ضمن عامل الاستثمار ونسبة التغطية المسموحة' },
];

export const DRAWING_CHECKS: CheckItem[] = [
  { id: 'site-plan', text: 'المخطط العام (Site plan) مع التنسيق والمداخل' },
  { id: 'plans', text: 'مساقط كل الطوابق مع الأبعاد والمناسيب وأسماء الفراغات' },
  { id: 'sections', text: 'مقطعان على الأقل يمران بالدرج والفراغات المهمة' },
  { id: 'elevations', text: 'الواجهات الأربع مع المواد' },
  { id: 'details', text: 'تفصيلة إنشائية/معمارية واحدة على الأقل' },
  { id: 'concept-diagrams', text: 'مخططات الفكرة والتطور (Diagrams)' },
  { id: '3d', text: 'منظور أو إظهار ثلاثي الأبعاد' },
  { id: 'north-scale', text: 'سهم الشمال ومقياس الرسم على كل لوحة' },
  { id: 'titleblock', text: 'إطار وجدول بيانات اللوحة (Title block)' },
  { id: 'lineweights', text: 'تدرج سماكات الخطوط واضح (قطع / إسقاط / خلفية)' },
  { id: 'consistency', text: 'تطابق المساقط مع المقاطع والواجهات' },
];

export interface ReviewCriterion {
  id: string;
  ar: string;
  en: string;
  questions: string[];
}

export const REVIEW_CRITERIA: ReviewCriterion[] = [
  {
    id: 'function',
    ar: 'الوظيفية',
    en: 'Functionality',
    questions: [
      'هل تحقق المساحات متطلبات البرنامج كاملة؟',
      'هل أبعاد الفراغات مناسبة للأثاث والاستعمال الفعلي؟',
      'هل الفراغات المتجاورة متوافقة وظيفياً؟',
    ],
  },
  {
    id: 'circulation',
    ar: 'الحركة',
    en: 'Circulation',
    questions: [
      'هل المدخل الرئيسي واضح ومقروء من الخارج؟',
      'هل تتقاطع حركة الزوار مع حركة الخدمة أو العاملين؟',
      'هل الممرات بأطوال وعروض معقولة دون فراغات ضائعة؟',
      'هل مسافات الهروب إلى الأدراج منطقية؟',
    ],
  },
  {
    id: 'organization',
    ar: 'تنظيم الفراغات',
    en: 'Spatial organization',
    questions: [
      'هل هناك منطق تنظيمي واضح (محور، فناء، شبكة، تجميع)؟',
      'هل التدرج من العام إلى الخاص مقروء؟',
      'هل الفراغات الرطبة مجمّعة؟',
    ],
  },
  {
    id: 'accessibility',
    ar: 'إمكانية الوصول',
    en: 'Accessibility',
    questions: [
      'هل يمكن لمستخدم كرسي متحرك الوصول لكل المستويات العامة؟',
      'هل ميل المنحدرات ≤ 1:12 تقريباً مع بسطات استراحة؟',
      'هل يوجد دورة مياه مهيأة وأبواب بعرض كافٍ؟',
    ],
  },
  {
    id: 'daylight',
    ar: 'الإضاءة الطبيعية',
    en: 'Daylighting',
    questions: [
      'هل تحصل الفراغات الرئيسية على إضاءة طبيعية مباشرة؟',
      'هل عمق الفراغات معقول نسبة لارتفاع النوافذ (قاعدة ≈ 2–2.5 × ارتفاع رأس النافذة)؟',
      'هل هناك حماية من الإبهار والإشعاع الغربي؟',
    ],
  },
  {
    id: 'ventilation',
    ar: 'التهوية',
    en: 'Ventilation',
    questions: [
      'هل التهوية المتعاكسة (Cross ventilation) ممكنة؟',
      'هل الفراغات الداخلية بدون نوافذ مخدومة بتهوية؟',
      'هل استُخدم أثر المدخنة (Stack effect) حيث يفيد؟',
    ],
  },
  {
    id: 'environment',
    ar: 'الاستجابة البيئية',
    en: 'Environmental response',
    questions: [
      'هل التوجيه يستفيد من الشمس الشتوية ويحمي من الصيفية؟',
      'هل كاسرات الشمس مصممة حسب اتجاه كل واجهة؟',
      'هل اختيار المواد يناسب المناخ الساحلي المتوسطي (رطوبة، ملوحة)؟',
    ],
  },
  {
    id: 'consistency',
    ar: 'الاتساق المعماري',
    en: 'Architectural consistency',
    questions: [
      'هل الفكرة الأساسية حاضرة في المسقط والمقطع والواجهة؟',
      'هل لغة المواد والفتحات متسقة؟',
      'هل القرارات التفصيلية تخدم الفكرة أم تشتتها؟',
    ],
  },
  {
    id: 'presentation',
    ar: 'جودة الإخراج',
    en: 'Presentation quality',
    questions: [
      'هل ترتيب اللوحات يروي قصة المشروع؟',
      'هل سماكات الخطوط والتهشير واضحة؟',
      'هل النصوص مقروءة والمقاييس صحيحة؟',
    ],
  },
];

export const BOARD_CHECKS: CheckItem[] = [
  { id: 'story', text: 'تسلسل اللوحات: الموقع ← الفكرة ← المساقط ← المقاطع والواجهات ← التفاصيل ← الإظهار' },
  { id: 'title', text: 'عنوان المشروع واسم الطالبة والمقرر والأستاذ على كل لوحة' },
  { id: 'statement', text: 'بيان الفكرة (Concept statement) مختصر وواضح' },
  { id: 'hierarchy', text: 'هرمية بصرية: رسم رئيسي كبير ورسومات داعمة أصغر' },
  { id: 'grid', text: 'شبكة تنسيق موحدة لكل اللوحات' },
  { id: 'fonts', text: 'خطان كحد أقصى، بأحجام متسقة' },
  { id: 'scales', text: 'مقاييس الرسم مكتوبة وصحيحة للطباعة' },
  { id: 'print-test', text: 'طباعة تجريبية بحجم مصغر للتأكد من الوضوح' },
  { id: 'files', text: 'ملفات PDF نهائية بدقة مناسبة للطباعة (300 dpi للصور)' },
  { id: 'backup', text: 'نسخة احتياطية من الملفات على جهاز آخر أو فلاشة' },
];
