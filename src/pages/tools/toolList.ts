export interface ToolInfo {
  id: string;
  ar: string;
  en: string;
  icon: string;
  desc: string;
  basis: string;
}

export const TOOL_LIST: ToolInfo[] = [
  { id: 'scale', ar: 'محوّل المقياس', en: 'Scale Converter', icon: 'scale', desc: 'تحويل بين الأبعاد الحقيقية وأبعاد اللوحة، واختيار المقياس المناسب لحجم الورق.', basis: 'حساب هندسي مباشر: طول اللوحة = الطول الحقيقي ÷ مقام المقياس.' },
  { id: 'area', ar: 'حاسبة المساحات', en: 'Area Calculator', icon: 'area', desc: 'مضلعات بالإحداثيات (معادلة Shoelace)، أشكال أساسية، ومثلث بثلاثة أضلاع.', basis: 'Shoelace / Gauss area formula، معادلة هيرون.' },
  { id: 'stairs', ar: 'حاسبة الأدراج', en: 'Stair Calculator', icon: 'stairs', desc: 'عدد القوائم والنائمات، معادلة بلوندل، عدد القلبات وطول الدرج.', basis: 'قاعدة بلوندل 2R + T ≈ 63 سم (Neufert). الحدود إرشادية — راجعي الكود السوري وبرنامج الأستاذ.' },
  { id: 'quantities', ar: 'حصر الكميات', en: 'Quantity Takeoff', icon: 'calc', desc: 'حجوم البيتون والقوالب، البلوك مع خصم الفتحات، البلاط والدهان.', basis: 'قياس هندسي مباشر مع نسب هدر يدخلها المستخدم. قواعد القياس تختلف بين المواصفات.' },
  { id: 'concrete', ar: 'تمارين البيتون المسلح', en: 'Concrete Practice', icon: 'cube', desc: 'عزوم الجوائز، مقاومة مقطع مستطيل، التسليح المطلوب، وكميات الخلطة.', basis: 'ACI 318-19 (طريقة المقاومة القصوى) — لأغراض تعليمية فقط.' },
  { id: 'materials', ar: 'مقارنة المواد والعزل', en: 'Material Comparison', icon: 'material', desc: 'خصائص المواد الحرارية وحساب معامل انتقال الحرارة U لجدار متعدد الطبقات.', basis: 'ISO 6946 (مبسّط)، قيم λ نموذجية من ISO 10456 / CIBSE Guide A.' },
  { id: 'space', ar: 'جدول الفراغات', en: 'Space Schedule', icon: 'list', desc: 'افتحي جدول فراغات أي مشروع مباشرة مع حسابات الصافي والإجمالي.', basis: 'مرتبط بمشاريعك.' },
  { id: 'checklist', ar: 'قوائم تحقق المشروع', en: 'Project Checklist', icon: 'check', desc: 'كل قوائم التحقق (الموقع، البرنامج، المخططات، اللوحات) لمشروع واحد.', basis: 'قوائم أكاديمية عامة — ليست متطلبات رسمية.' },
  { id: 'units', ar: 'محوّل الواحدات', en: 'Unit Converter', icon: 'swap', desc: 'طول، مساحة، حجم، قوة، إجهاد، عزوم، أحمال، كثافة، حرارة.', basis: 'معاملات تحويل SI الدقيقة (NIST).' },
  { id: 'measure', ar: 'أدوات القياس', en: 'Measurement Tools', icon: 'angle', desc: 'الميول والمنحدرات، المثلث القائم، الأقواس، وأحجام الورق.', basis: 'علاقات مثلثية مباشرة. ميل 1:12 للمنحدرات مرجع شائع (ADA)؛ تحققي من الكود المحلي.' },
];
