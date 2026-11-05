// Joudy's 11 subjects. The outlines below are SUGGESTED study outlines built
// from standard architecture / engineering curricula and the listed textbooks.
// They are NOT official Tartous University syllabi. Joudy can edit, reorder
// and replace topics to match her actual lectures.

export interface SubjectRef {
  title: string;
  author: string;
  note?: string;
}

export interface Subject {
  id: string;
  num: number;
  ar: string;
  en: string;
  group: 'design' | 'structures' | 'construction' | 'urban' | 'environment' | 'computing' | 'management';
  summary: string;
  outline: string[];
  references: SubjectRef[];
  caution?: string;
}

export const SUBJECTS: Subject[] = [
  {
    id: 'design-3',
    num: 1,
    ar: 'تصميم معماري 3',
    en: 'Architectural Design III',
    group: 'design',
    summary: 'استوديو تصميم لمشاريع متوسطة التعقيد: تحليل الموقع، البرنامج، الفكرة، والتطوير حتى العرض النهائي.',
    outline: [
      'قراءة البرنامج (Brief analysis) وتحويله إلى جدول فراغات',
      'تحليل الموقع والسياق (Site & context analysis)',
      'مشاريع مشابهة (Case studies / precedents)',
      'توليد الفكرة والمخططات البيانية (Concept & diagrams)',
      'التنطيق والعلاقات الوظيفية (Zoning & adjacency)',
      'الحركة الأفقية والشاقولية (Circulation)',
      'الشبكة الإنشائية والتصميم (Structural grid)',
      'الواجهات والكتلة (Massing & façades)',
      'المقاطع والفراغ الثلاثي الأبعاد (Sections)',
      'الإخراج والعرض (Presentation)',
    ],
    references: [
      { title: "Architects' Data (Neufert)", author: 'Ernst & Peter Neufert' },
      { title: 'Architecture: Form, Space, and Order', author: 'Francis D.K. Ching' },
      { title: 'Analysing Architecture', author: 'Simon Unwin' },
    ],
  },
  {
    id: 'steel',
    num: 2,
    ar: 'إنشاءات معدنية',
    en: 'Steel Structures',
    group: 'structures',
    summary: 'سلوك وتصميم العناصر الفولاذية: الشد، الضغط والتحنيب، الانعطاف، والوصلات.',
    outline: [
      'خواص الفولاذ والمقاطع القياسية (Material & sections)',
      'الأحمال وتراكيبها (Loads & combinations)',
      'عناصر الشد (Tension members)',
      'عناصر الضغط والتحنيب (Compression & buckling)',
      'الجوائز والانعطاف والتحنيب الجانبي (Beams & LTB)',
      'الوصلات بالبراغي (Bolted connections)',
      'الوصلات باللحام (Welded connections)',
      'الجملونات والهياكل المعدنية (Trusses & portal frames)',
    ],
    references: [
      { title: 'Steel Design', author: 'William T. Segui' },
      { title: 'Steel Structures: Design and Behavior', author: 'Salmon, Johnson & Malhas' },
      { title: 'ANSI/AISC 360 Specification', author: 'AISC' },
    ],
    caution: 'تحققي من الكود المعتمد في مقرركم (AISC أو غيره) لأن المعاملات تختلف بين الكودات.',
  },
  {
    id: 'rc-1',
    num: 3,
    ar: 'بيتون مسلح 1',
    en: 'Reinforced Concrete I',
    group: 'structures',
    summary: 'أساسيات تصميم المقاطع البيتونية بطريقة المقاومة القصوى: الانعطاف، القص، والبلاطات البسيطة.',
    outline: [
      'خواص البيتون والفولاذ (Materials)',
      'مبادئ طريقة المقاومة القصوى (Ultimate strength design)',
      'تحليل المقاطع المستطيلة مفردة التسليح (Singly reinforced sections)',
      'تصميم المقاطع وحدود التسليح (As,min / tension-controlled)',
      'المقاطع مزدوجة التسليح (Doubly reinforced)',
      'مقاطع T و L (Flanged sections)',
      'القص والتسليح العرضي (Shear & stirrups)',
      'البلاطات المصمتة باتجاه واحد (One-way slabs)',
    ],
    references: [
      { title: 'Design of Concrete Structures', author: 'Darwin, Dolan & Nilson' },
      { title: 'Design of Reinforced Concrete', author: 'McCormac & Brown' },
      { title: 'ACI 318-19 Building Code Requirements for Structural Concrete', author: 'ACI' },
      { title: 'الكود العربي السوري لتصميم وتنفيذ المنشآت بالخرسانة المسلحة', author: 'نقابة المهندسين السوريين', note: 'المرجع المحلي — تحققي من الإصدار المعتمد في الجامعة' },
    ],
    caution: 'الحاسبات في التطبيق تتبع ACI 318-19 لأغراض تعليمية. اتبعي الكود والمعاملات المعتمدة في محاضراتكم.',
  },
  {
    id: 'detailing-1',
    num: 4,
    ar: 'تصميمات تنفيذية 1',
    en: 'Construction Detailing I',
    group: 'construction',
    summary: 'تحويل التصميم إلى مخططات تنفيذية: الجدران، الفتحات، الأسقف، العزل، والأدراج.',
    outline: [
      'أصول الرسم التنفيذي والمقاييس (Working drawings conventions)',
      'تفاصيل الأساسات والعزل المائي (Foundations & damp-proofing)',
      'الجدران والبلوك والحجر (Walls & cladding)',
      'تفاصيل الأبواب والنوافذ (Doors & windows)',
      'الأدراج وتفاصيلها (Stairs)',
      'الأسقف والأسطح والعزل الحراري (Roofs & insulation)',
      'الأرضيات والتشطيبات (Floors & finishes)',
      'فواصل التمدد (Expansion joints)',
    ],
    references: [
      { title: 'Building Construction Illustrated', author: 'Francis D.K. Ching' },
      { title: 'Fundamentals of Building Construction', author: 'Edward Allen & Joseph Iano' },
      { title: 'Constructing Architecture', author: 'Andrea Deplazes (ed.)' },
    ],
  },
  {
    id: 'urban-1',
    num: 5,
    ar: 'تخطيط عمراني 1',
    en: 'Urban Planning I',
    group: 'urban',
    summary: 'مدخل إلى نظريات تخطيط المدن، عناصر المدينة، استعمالات الأراضي، وشبكات الطرق.',
    outline: [
      'تاريخ تخطيط المدن ونظرياته (History & theories)',
      'عناصر صورة المدينة لكيفن لينش (Paths, edges, districts, nodes, landmarks)',
      'استعمالات الأراضي (Land use)',
      'الكثافات وعوامل الاستثمار (Density, FAR)',
      'شبكات الطرق وتدرجها (Street hierarchy)',
      'المخطط التنظيمي والأنظمة العمرانية (Master plan & regulations)',
      'الخدمات العامة ومعايير توزيعها (Public facilities)',
    ],
    references: [
      { title: 'The Image of the City', author: 'Kevin Lynch' },
      { title: 'The Urban Pattern', author: 'Gallion & Eisner' },
      { title: 'Cities of Tomorrow', author: 'Peter Hall' },
    ],
  },
  {
    id: 'environment',
    num: 6,
    ar: 'علوم البيئة',
    en: 'Environmental Science',
    group: 'environment',
    summary: 'المناخ والراحة الحرارية والتصميم البيئي السلبي: الشمس، الرياح، الإضاءة، والعزل.',
    outline: [
      'عناصر المناخ والأقاليم المناخية (Climate)',
      'الراحة الحرارية (Thermal comfort)',
      'الإشعاع الشمسي ومسار الشمس (Solar geometry)',
      'التظليل وكاسرات الشمس (Shading devices)',
      'التهوية الطبيعية (Natural ventilation)',
      'انتقال الحرارة والعزل (Heat transfer, U-value)',
      'الإضاءة الطبيعية (Daylighting)',
      'الاستدامة وكفاءة الطاقة (Sustainability)',
    ],
    references: [
      { title: 'Design with Climate', author: 'Victor Olgyay' },
      { title: 'Heating, Cooling, Lighting', author: 'Norbert Lechner' },
      { title: 'Climate Considerations in Building and Urban Design', author: 'Baruch Givoni' },
    ],
  },
  {
    id: 'programming',
    num: 7,
    ar: 'البرمجة',
    en: 'Programming',
    group: 'computing',
    summary: 'أساسيات التفكير الخوارزمي والبرمجة. لغة المقرر قابلة للتحديد — اختاري اللغة التي تُدرَّس فعلاً.',
    outline: [
      'التفكير الخوارزمي والمخططات التدفقية (Algorithms & flowcharts)',
      'المتغيرات وأنواع البيانات (Variables & types)',
      'الشروط (Conditionals)',
      'الحلقات (Loops)',
      'التوابع (Functions)',
      'المصفوفات والقوائم (Arrays / lists)',
      'تطبيقات معمارية: حساب المساحات والكميات برمجياً',
    ],
    references: [{ title: 'المرجع يعتمد على اللغة المختارة', author: '—' }],
    caution: 'لم نفترض لغة برمجة معينة لأننا لا نملك توصيف المقرر. حددي اللغة من صفحة المادة.',
  },
  {
    id: 'urban-sociology',
    num: 8,
    ar: 'علم الاجتماع العمراني',
    en: 'Urban Sociology',
    group: 'urban',
    summary: 'العلاقة بين المجتمع والفراغ العمراني: الأحياء، الفراغات العامة، والهوية والسلوك.',
    outline: [
      'مفاهيم أساسية: المدينة، المجتمع، الفراغ (Key concepts)',
      'مدرسة شيكاغو والإيكولوجيا الحضرية (Chicago School)',
      'الفراغ العام والحياة العامة (Public space)',
      'الحي والجيرة والانتماء (Neighbourhood & community)',
      'الخصوصية في المسكن العربي (Privacy & culture)',
      'السكن العشوائي والتحولات العمرانية (Informal settlements)',
      'المشاركة المجتمعية في التخطيط (Participation)',
    ],
    references: [
      { title: 'The Death and Life of Great American Cities', author: 'Jane Jacobs' },
      { title: 'The Social Life of Small Urban Spaces', author: 'William H. Whyte' },
      { title: 'Life Between Buildings', author: 'Jan Gehl' },
    ],
  },
  {
    id: 'urban-2',
    num: 9,
    ar: 'التخطيط العمراني 2',
    en: 'Urban Planning II',
    group: 'urban',
    summary: 'تخطيط الأحياء والتصميم الحضري: الكتل، الشوارع، الفراغات العامة، والتجديد العمراني.',
    outline: [
      'وحدة الجيرة وتخطيط الأحياء (Neighbourhood unit)',
      'التصميم الحضري: الكتلة والفراغ (Figure-ground)',
      'تصميم الشوارع والفراغات العامة (Streets & squares)',
      'التنقل والنقل العام (Mobility)',
      'التجديد العمراني والحفاظ (Regeneration & conservation)',
      'التخطيط المستدام والمدن المتراصة (Sustainable / compact city)',
      'إعادة الإعمار بعد النزاعات (Post-conflict reconstruction)',
    ],
    references: [
      { title: 'Shaping Neighbourhoods', author: 'Barton, Grant & Guise' },
      { title: 'Cities for People', author: 'Jan Gehl' },
      { title: 'Responsive Environments', author: 'Bentley et al.' },
    ],
  },
  {
    id: 'rc-2',
    num: 10,
    ar: 'بيتون مسلح 2',
    en: 'Reinforced Concrete II',
    group: 'structures',
    summary: 'تصميم العناصر الإنشائية: البلاطات باتجاهين، الأعمدة، الأساسات، والأدراج.',
    outline: [
      'البلاطات باتجاهين (Two-way slabs)',
      'البلاطات الهوردي والمفرغة (Ribbed / hollow-block slabs)',
      'الأعمدة القصيرة: ضغط محوري وانعطاف (Short columns)',
      'مخططات التفاعل (Interaction diagrams)',
      'الأساسات المنفردة (Isolated footings)',
      'الأساسات المشتركة والشريطية (Combined & strip footings)',
      'الأدراج البيتونية (Concrete stairs)',
    ],
    references: [
      { title: 'Design of Concrete Structures', author: 'Darwin, Dolan & Nilson' },
      { title: 'Reinforced Concrete: Mechanics and Design', author: 'Wight & MacGregor' },
      { title: 'ACI 318-19', author: 'ACI' },
    ],
    caution: 'الحسابات تعليمية فقط ولا تعتبر تصميماً إنشائياً معتمداً.',
  },
  {
    id: 'quantities',
    num: 11,
    ar: 'الكميات والمواصفات',
    en: 'Quantity Surveying & Specifications',
    group: 'management',
    summary: 'حصر الكميات وكتابة المواصفات وإعداد جداول الكميات وتقدير الكلفة.',
    outline: [
      'مبادئ حصر الكميات وقواعد القياس (Measurement rules)',
      'كميات أعمال الحفر والردم (Earthworks)',
      'كميات البيتون والتسليح والقوالب (Concrete, rebar, formwork)',
      'كميات البناء والتشطيبات (Masonry & finishes)',
      'جداول الكميات (Bill of Quantities)',
      'كتابة المواصفات الفنية (Specifications)',
      'تحليل الأسعار وتقدير الكلفة (Rate analysis)',
    ],
    references: [
      { title: 'Building Quantities Explained', author: 'Ivor H. Seeley' },
      { title: 'NRM — New Rules of Measurement', author: 'RICS' },
      { title: 'MasterFormat', author: 'CSI', note: 'تنظيم المواصفات' },
    ],
  },
];

export const SUBJECT_GROUP_LABEL: Record<Subject['group'], string> = {
  design: 'تصميم',
  structures: 'إنشاءات',
  construction: 'تنفيذ',
  urban: 'عمران',
  environment: 'بيئة',
  computing: 'حوسبة',
  management: 'إدارة مشاريع',
};
