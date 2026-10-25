import type { ImageMetadata } from 'astro';
import deep from '../assets/images/deep.jpg';
import villa from '../assets/images/villa.jpg';
import kitchen from '../assets/images/kitchen.jpg';
import carpet from '../assets/images/carpet.jpg';

export type Lang = 'ar' | 'en';
// Cleaning lines (home, specialised, property) and, separately, facility management.
export type Category = 'home' | 'specialised' | 'property' | 'facility';

interface Copy {
  name: string;
  short: string;
  intro: string;
  includes: string[];
  ideal: string[];
  faqs: { q: string; a: string }[];
}

export interface Service {
  slug: string;
  icon: string; // lucide icon name
  category: Category;
  image?: ImageMetadata;
  featured?: boolean;
  /** Offered on request while the team expands (shown with a note). */
  expanding?: boolean;
  ar: Copy;
  en: Copy;
}

export const CATEGORIES: Record<Category, Record<Lang, string>> = {
  home: { ar: 'تنظيف المنازل', en: 'Home cleaning' },
  specialised: { ar: 'تنظيف متخصص', en: 'Specialised cleaning' },
  property: { ar: 'تنظيف المباني والمشاريع', en: 'Building & project cleaning' },
  // A separate service line from cleaning: managing, operating and maintaining the building.
  facility: { ar: 'إدارة وتشغيل وصيانة المباني', en: 'Building management, operation & maintenance' },
};

export const SERVICES: Service[] = [
  {
    slug: 'deep-cleaning',
    icon: 'sparkles',
    category: 'home',
    image: deep,
    featured: true,
    ar: {
      name: 'التنظيف العميق',
      short: 'تنظيف شامل لكل زاوية في البيت — من الأرضيات للأسقف، ومن المطبخ للحمامات.',
      intro:
        'التنظيف العميق هو الخدمة الأنسب إذا البيت ما تنظّف تنظيف كامل من فترة، أو قبل مناسبة، أو قبل السكن. فريقنا يشتغل غرفة غرفة بخطة واضحة ومواد مخصصة لكل سطح، ويوصل للأماكن اللي ما يوصلها التنظيف اليومي.',
      includes: [
        'إزالة الغبار من الأسقف والجدران والإضاءات والمكيفات من الخارج',
        'تنظيف الأبواب والنوافذ والإطارات والمقابض',
        'تنظيف المطبخ بالكامل: الخزائن من الخارج والأسطح والأجهزة',
        'تنظيف الحمامات وإزالة الترسبات والكلس',
        'غسيل وتلميع الأرضيات حسب نوعها (رخام، بورسلان، باركيه)',
        'تعقيم الأسطح ونقاط اللمس المتكررة',
      ],
      ideal: ['قبل السكن أو بعد الخروج', 'قبل المناسبات ورمضان والأعياد', 'بيوت ما تنظّفت تنظيف كامل من فترة'],
      faqs: [
        { q: 'كم يستغرق التنظيف العميق؟', a: 'حسب المساحة والحالة. الشقة عادةً تنتهي في نفس اليوم، والفيلا في المتوسط ٦–٨ ساعات بفريق متكامل.' },
        { q: 'هل تجيبون المواد والمعدات؟', a: 'نعم، نوصل بكامل المعدات والمواد الاحترافية الآمنة. ما تحتاج تجهّز شي.' },
      ],
    },
    en: {
      name: 'Deep Cleaning',
      short: 'A top-to-bottom clean of every room — floors to ceilings, kitchen to bathrooms.',
      intro:
        'Deep cleaning is the right choice when a home has not had a thorough clean in a while, before an occasion, or before moving in. Our team works room by room with a clear checklist and the right product for every surface, reaching the places routine cleaning misses.',
      includes: [
        'Dusting ceilings, walls, light fittings and AC grilles',
        'Doors, window frames, sills and handles',
        'Full kitchen clean: cabinet fronts, counters and appliance exteriors',
        'Bathrooms descaled and limescale removed',
        'Floors washed and finished to suit the material (marble, porcelain, parquet)',
        'Sanitising of surfaces and high-touch points',
      ],
      ideal: ['Move-in or move-out', 'Before Ramadan, Eid and family occasions', 'Homes overdue for a full clean'],
      faqs: [
        { q: 'How long does a deep clean take?', a: 'It depends on size and condition. Apartments are usually done the same day; a villa takes 6–8 hours on average with a full team.' },
        { q: 'Do you bring supplies and equipment?', a: 'Yes. We arrive with all professional equipment and safe cleaning products — you do not need to prepare anything.' },
      ],
    },
  },
  {
    slug: 'general-cleaning',
    icon: 'mop-sparkles',
    category: 'home',
    image: villa,
    ar: {
      name: 'التنظيف العام',
      short: 'تنظيف دوري يحافظ على بيتك مرتب ونظيف — زيارة واحدة أو باقة شهرية.',
      intro:
        'خدمة التنظيف العام مصممة للحفاظ على مستوى نظافة ثابت في البيت. تقدر تطلبها زيارة واحدة، أو تشترك بزيارات أسبوعية أو شهرية بنفس الفريق ونفس المعايير كل مرة.',
      includes: [
        'كنس ومسح الأرضيات لجميع الغرف',
        'مسح الغبار عن الأثاث والأسطح',
        'تنظيف المطبخ والأسطح والمغسلة',
        'تنظيف وتعقيم الحمامات',
        'ترتيب عام وإخراج النفايات',
      ],
      ideal: ['الشقق والفلل المسكونة', 'العائلات المشغولة', 'زيارات أسبوعية أو شهرية'],
      faqs: [
        { q: 'هل عندكم باقات شهرية؟', a: 'نعم، نرتب معك جدول زيارات ثابت (أسبوعي أو كل أسبوعين أو شهري) بسعر أفضل من الزيارة المنفردة.' },
        { q: 'وش الفرق بين التنظيف العام والعميق؟', a: 'العام للحفاظ على النظافة بشكل دوري، والعميق تنظيف شامل ومفصّل يوصل لكل الزوايا والتفاصيل.' },
      ],
    },
    en: {
      name: 'General Cleaning',
      short: 'Regular cleaning that keeps your home fresh — one visit or a monthly plan.',
      intro:
        'General cleaning keeps your home at a consistent standard. Book a single visit, or set up weekly or monthly visits with the same team and the same checklist every time.',
      includes: [
        'Sweeping and mopping of all rooms',
        'Dusting furniture and surfaces',
        'Kitchen counters, sink and surfaces',
        'Bathrooms cleaned and sanitised',
        'General tidying and rubbish removal',
      ],
      ideal: ['Lived-in apartments and villas', 'Busy families', 'Weekly or monthly visits'],
      faqs: [
        { q: 'Do you offer monthly plans?', a: 'Yes. We set a fixed schedule with you (weekly, fortnightly or monthly) at a better rate than single visits.' },
        { q: 'What is the difference between general and deep cleaning?', a: 'General cleaning maintains your home regularly; deep cleaning is a detailed, top-to-bottom clean that reaches every corner.' },
      ],
    },
  },
  {
    slug: 'post-construction-cleaning',
    icon: 'hard-hat',
    category: 'property',
    featured: true,
    ar: {
      name: 'تنظيف ما بعد البناء والتشطيب',
      short: 'إزالة غبار البناء وبقايا الدهان والإسمنت وتجهيز المكان للسكن مباشرة.',
      intro:
        'بعد البناء أو الترميم يبقى غبار ناعم وبقايا دهان وإسمنت وسيليكون في كل مكان. نستخدم معدات وأدوات مخصصة تزيل البقايا بدون ما تخدش الرخام أو الزجاج أو الإكسسوارات، ونسلّمك المكان جاهز للسكن.',
      includes: [
        'إزالة بقايا الدهان والإسمنت والجبس والسيليكون',
        'شفط الغبار الناعم من الأرضيات والجدران والفتحات',
        'تنظيف الزجاج والإطارات من الملصقات والبقايا',
        'تنظيف المطابخ والحمامات الجديدة وتلميع الإكسسوارات',
        'غسيل الأرضيات والدرج والمداخل',
        'تنظيف الأحواش والمداخل الخارجية عند الطلب',
      ],
      ideal: ['الفلل والشقق الجديدة', 'بعد الترميم أو التشطيب', 'المطورين والمقاولين قبل التسليم'],
      faqs: [
        { q: 'هل تتعاملون مع بقايا الدهان على الرخام والزجاج؟', a: 'نعم، نستخدم أدوات ومواد مناسبة لكل سطح حتى نزيل البقايا بدون خدوش.' },
        { q: 'هل تخدمون المقاولين والمطورين؟', a: 'نعم، نقدم عروض أسعار للمشاريع والوحدات المتعددة مع جدول تسليم واضح.' },
      ],
    },
    en: {
      name: 'Post-Construction Cleaning',
      short: 'Removing construction dust, paint and cement residue so the space is move-in ready.',
      intro:
        'Construction and renovation leave fine dust and paint, cement and silicone residue everywhere. We use dedicated tools that remove it without scratching marble, glass or fittings, and hand the property back ready to live in.',
      includes: [
        'Removing paint, cement, plaster and silicone residue',
        'Vacuuming fine dust from floors, walls and vents',
        'Glass and frames cleared of stickers and residue',
        'New kitchens and bathrooms cleaned, fittings polished',
        'Floors, stairs and entrances washed',
        'Yards and outdoor entrances on request',
      ],
      ideal: ['New villas and apartments', 'After renovation or fit-out', 'Developers and contractors before handover'],
      faqs: [
        { q: 'Can you remove paint residue from marble and glass?', a: 'Yes. We use the right tools and products for each surface so residue comes off without scratching.' },
        { q: 'Do you work with contractors and developers?', a: 'Yes. We quote for projects and multiple units with a clear handover schedule.' },
      ],
    },
  },
  {
    slug: 'sofa-upholstery-cleaning',
    icon: 'sofa',
    category: 'specialised',
    featured: true,
    ar: {
      name: 'تنظيف الكنب والمفروشات',
      short: 'غسيل عميق للكنب والمجالس والكراسي والمراتب يزيل البقع والروائح.',
      intro:
        'نغسل الكنب والمجالس العربية والكراسي والمراتب بأجهزة غسيل وشفط احترافية، ونختار المادة حسب نوع القماش. النتيجة: بقع أقل، روائح أقل، وألوان ترجع لها حياتها.',
      includes: [
        'فحص نوع القماش واختيار طريقة الغسيل المناسبة',
        'شفط الغبار والأتربة العالقة',
        'معالجة البقع الظاهرة',
        'غسيل بالبخار أو بالشفط الرطب حسب القماش',
        'إزالة الروائح وتعقيم',
      ],
      ideal: ['الكنب والمجالس العربية', 'كراسي السفرة', 'المراتب ومفروشات غرف الأطفال'],
      faqs: [
        { q: 'متى يجف الكنب بعد الغسيل؟', a: 'عادةً خلال ساعات قليلة حسب نوع القماش والتهوية.' },
        { q: 'هل تضمنون إزالة كل البقع؟', a: 'أغلب البقع تزول، لكن بعض البقع القديمة أو الصبغات قد تخف ولا تزول تمامًا — نوضح لك هذا قبل البدء.' },
      ],
    },
    en: {
      name: 'Sofa & Upholstery Cleaning',
      short: 'Deep washing of sofas, majlis seating, chairs and mattresses to lift stains and odours.',
      intro:
        'We wash sofas, Arabic majlis seating, chairs and mattresses with professional extraction machines, choosing the product for each fabric. The result: fewer stains, fewer odours and colours that look alive again.',
      includes: [
        'Fabric check to choose the right method',
        'Vacuuming embedded dust and dirt',
        'Spot treatment of visible stains',
        'Steam or wet-extraction cleaning to suit the fabric',
        'Odour removal and sanitising',
      ],
      ideal: ['Sofas and majlis seating', 'Dining chairs', "Mattresses and children's rooms"],
      faqs: [
        { q: 'How long does the sofa take to dry?', a: 'Usually within a few hours, depending on fabric and ventilation.' },
        { q: 'Do you guarantee every stain comes out?', a: 'Most stains come out, but some old stains or dyes may fade rather than disappear completely — we tell you before we start.' },
      ],
    },
  },
  {
    slug: 'carpet-moquette-cleaning',
    icon: 'layers',
    category: 'specialised',
    image: carpet,
    ar: {
      name: 'تنظيف السجاد والموكيت',
      short: 'غسيل الموكيت والسجاد في الموقع بأجهزة شفط وغسيل احترافية.',
      intro:
        'الموكيت يجمع غبار ورمل وروائح أكثر من أي سطح ثاني في البيت — خصوصًا في أجواء الشرقية. نغسله في الموقع بأجهزة شفط وغسيل قوية تسحب الأوساخ من العمق، مع معالجة البقع والروائح.',
      includes: [
        'شفط قوي للرمل والغبار من العمق',
        'معالجة البقع قبل الغسيل',
        'غسيل بالشفط الرطب أو البخار',
        'إزالة الروائح وتعقيم',
        'تسريع التجفيف قدر الإمكان',
      ],
      ideal: ['الموكيت المثبت في الغرف والمكاتب', 'السجاد الكبير', 'البيوت اللي فيها أطفال أو حيوانات أليفة'],
      faqs: [
        { q: 'هل تغسلون الموكيت في البيت؟', a: 'نعم، الغسيل يتم في الموقع بدون ما تحتاج تفك الموكيت.' },
        { q: 'كم مرة يُنصح بغسيل الموكيت؟', a: 'مرة إلى مرتين في السنة للبيوت العادية، وأكثر للبيوت اللي فيها أطفال أو حركة عالية.' },
      ],
    },
    en: {
      name: 'Carpet & Moquette Cleaning',
      short: 'On-site washing of fitted carpet and rugs with professional extraction machines.',
      intro:
        'Carpet traps more dust, sand and odour than any other surface in the home — especially in the Eastern Province climate. We wash it on site with powerful extraction machines that pull dirt from deep in the fibres, with stain and odour treatment.',
      includes: [
        'Powerful vacuuming of deep sand and dust',
        'Pre-treatment of stains',
        'Wet-extraction or steam washing',
        'Odour removal and sanitising',
        'Faster drying where possible',
      ],
      ideal: ['Fitted carpet in rooms and offices', 'Large rugs', 'Homes with children or pets'],
      faqs: [
        { q: 'Do you clean fitted carpet at home?', a: 'Yes. Cleaning is done on site — no need to lift the carpet.' },
        { q: 'How often should carpet be cleaned?', a: 'Once or twice a year for most homes, more often with children or high foot traffic.' },
      ],
    },
  },
  {
    slug: 'kitchen-deep-cleaning',
    icon: 'chef-hat',
    category: 'home',
    image: kitchen,
    ar: {
      name: 'التنظيف العميق للمطابخ',
      short: 'إزالة الدهون المتراكمة من الخزائن والشفاط والفرن والجدران.',
      intro:
        'المطبخ أكثر مكان تتراكم فيه الدهون والبقع. ننظف المطبخ بالكامل بمواد مزيلة للدهون آمنة على الخشب والرخام والستانلس، ونهتم بالتفاصيل مثل الشفاط والفرن والمقابض.',
      includes: [
        'تنظيف الخزائن من الداخل والخارج (عند إفراغها)',
        'إزالة الدهون من الشفاط والفلاتر',
        'تنظيف الفرن والموقد',
        'تنظيف البلاط والجدران خلف الموقد',
        'تلميع المغسلة والحنفيات والأسطح',
        'تنظيف الأجهزة من الخارج وتعقيم الأسطح',
      ],
      ideal: ['المطابخ اليومية الاستخدام', 'قبل رمضان والعزايم', 'عند الانتقال لبيت جديد'],
      faqs: [
        { q: 'هل تنظفون الخزائن من الداخل؟', a: 'نعم، إذا كانت فاضية. نقدر نساعد في الترتيب لكن نفضّل تفريغها قبل الزيارة.' },
        { q: 'هل المواد آمنة على الأسطح؟', a: 'نعم، نختار المواد حسب نوع السطح (خشب، رخام، ستانلس) حتى ما تتضرر.' },
      ],
    },
    en: {
      name: 'Kitchen Deep Cleaning',
      short: 'Removing built-up grease from cabinets, hood, oven and walls.',
      intro:
        'The kitchen is where grease and stains build up most. We clean it top to bottom with degreasers that are safe on wood, marble and stainless steel, with attention to details like the hood, oven and handles.',
      includes: [
        'Cabinets inside and out (when emptied)',
        'Degreasing the range hood and filters',
        'Oven and hob cleaning',
        'Tiles and walls behind the cooker',
        'Sink, taps and counters polished',
        'Appliance exteriors and surfaces sanitised',
      ],
      ideal: ['Busy family kitchens', 'Before Ramadan and gatherings', 'When moving into a new home'],
      faqs: [
        { q: 'Do you clean inside the cabinets?', a: 'Yes, when they are empty. We prefer cabinets to be cleared before the visit.' },
        { q: 'Are the products safe for my surfaces?', a: 'Yes. We match products to the surface (wood, marble, stainless steel) so nothing is damaged.' },
      ],
    },
  },
  {
    slug: 'bathroom-deep-cleaning',
    icon: 'bath',
    category: 'home',
    ar: {
      name: 'التنظيف العميق للحمامات',
      short: 'إزالة الكلس والترسبات وتعقيم الحمامات بالكامل.',
      intro:
        'مياه المنطقة تترك ترسبات وكلس على الحنفيات والزجاج والبلاط. ننظف الحمامات بعمق ونزيل الترسبات ونعقّم كل الأسطح، ونرجّع للإكسسوارات لمعتها.',
      includes: [
        'إزالة الكلس والترسبات من الحنفيات والدش والزجاج',
        'تنظيف الفواصل بين البلاط',
        'تنظيف وتعقيم المراحيض والمغاسل',
        'تلميع المرايا والإكسسوارات',
        'تنظيف الشفاطات والأرضيات',
      ],
      ideal: ['الحمامات اللي فيها ترسبات', 'قبل السكن', 'ضمن التنظيف العميق للبيت'],
      faqs: [
        { q: 'هل تقدرون تزيلون الكلس القديم؟', a: 'نعم في أغلب الحالات. الترسبات القديمة جدًا قد تحتاج أكثر من جلسة، ونوضح لك هذا مسبقًا.' },
        { q: 'هل أقدر أطلب الحمامات فقط؟', a: 'نعم، تقدر تطلبها كخدمة مستقلة.' },
      ],
    },
    en: {
      name: 'Bathroom Deep Cleaning',
      short: 'Limescale and residue removed, bathrooms fully sanitised.',
      intro:
        'Local water leaves limescale on taps, glass and tiles. We deep clean bathrooms, remove the build-up and sanitise every surface, bringing the fittings back to a shine.',
      includes: [
        'Limescale removed from taps, showers and glass',
        'Grout lines cleaned',
        'Toilets and basins cleaned and sanitised',
        'Mirrors and fittings polished',
        'Extractor fans and floors',
      ],
      ideal: ['Bathrooms with limescale build-up', 'Before moving in', 'As part of a whole-home deep clean'],
      faqs: [
        { q: 'Can you remove old limescale?', a: 'In most cases, yes. Very old build-up may need more than one session — we tell you in advance.' },
        { q: 'Can I book bathrooms only?', a: 'Yes, it can be booked as a standalone service.' },
      ],
    },
  },
  {
    slug: 'glass-cleaning',
    icon: 'app-window',
    category: 'specialised',
    ar: {
      name: 'تنظيف الزجاج والواجهات الزجاجية',
      short: 'نوافذ وواجهات زجاجية لامعة بدون خطوط — من الداخل والخارج.',
      intro:
        'غبار الشرقية يخلي الزجاج يفقد لمعته بسرعة. ننظف النوافذ والأبواب الزجاجية والواجهات والدرابزين الزجاجي بأدوات احترافية، ونسلّمها بدون خطوط أو بقع.',
      includes: [
        'تنظيف الزجاج من الداخل والخارج (حسب إمكانية الوصول)',
        'تنظيف الإطارات والمجاري',
        'إزالة بقع الماء والغبار',
        'الواجهات الزجاجية للفلل والمحلات',
        'الدرابزين والأبواب الزجاجية',
      ],
      ideal: ['الفلل ذات الواجهات الزجاجية', 'المحلات والمكاتب', 'بعد موجات الغبار'],
      faqs: [
        { q: 'هل تنظفون الزجاج الخارجي للأدوار العالية؟', a: 'حسب طبيعة المبنى وإمكانية الوصول الآمن. أرسل لنا صور ونعطيك الحل المناسب.' },
        { q: 'هل الخدمة متاحة بشكل دوري؟', a: 'نعم، خصوصًا للمحلات والمباني التجارية.' },
      ],
    },
    en: {
      name: 'Glass Cleaning',
      short: 'Streak-free windows and glass façades — inside and out.',
      intro:
        'Eastern Province dust takes the shine off glass fast. We clean windows, glass doors, façades and balustrades with professional tools and leave them streak-free.',
      includes: [
        'Glass inside and out (where safely accessible)',
        'Frames and tracks',
        'Water spots and dust removed',
        'Glass façades for villas and shops',
        'Balustrades and glass doors',
      ],
      ideal: ['Villas with large glazing', 'Shops and offices', 'After dust storms'],
      faqs: [
        { q: 'Do you clean exterior glass on high floors?', a: 'It depends on the building and safe access. Send us photos and we will recommend the right approach.' },
        { q: 'Is this available on a schedule?', a: 'Yes, especially for shops and commercial buildings.' },
      ],
    },
  },
  {
    slug: 'ac-cleaning',
    icon: 'air-vent',
    category: 'specialised',
    ar: {
      name: 'تنظيف المكيفات',
      short: 'غسيل وتنظيف المكيفات السبليت والشباك من الغبار والأوساخ المتراكمة.',
      intro:
        'المكيف يشتغل أغلب السنة في الشرقية، ومع الوقت يتجمع الغبار في الفلاتر والوحدة الداخلية ويقل التبريد. ننظف الفلاتر والوحدة الداخلية بأدوات مخصصة مع حماية المكان حول المكيف، ونقدر نضيفها مع تنظيف البيت في نفس الزيارة.',
      includes: [
        'فك الفلاتر وغسلها',
        'تنظيف الوحدة الداخلية وفتحات الهواء',
        'حماية الجدار والأرضية أثناء التنظيف',
        'تنظيف الغطاء الخارجي للوحدة',
        'تجربة التشغيل بعد الانتهاء',
      ],
      ideal: ['الشقق والفلل', 'قبل الصيف', 'مع التنظيف العميق أو بعد التشطيب'],
      faqs: [
        { q: 'هل تنظفون المكيفات مع تنظيف البيت؟', a: 'نعم، تقدر تضيفها لنفس الحجز ويتم تحديد العدد في عرض السعر.' },
        { q: 'كم يستغرق تنظيف المكيف؟', a: 'حسب نوع المكيف وحالته، ونوضح المدة في عرض السعر.' },
      ],
    },
    en: {
      name: 'AC Cleaning',
      short: 'Washing and cleaning split and window AC units of built-up dust and dirt.',
      intro:
        'In the Eastern Province the AC runs most of the year, and dust builds up in the filters and indoor unit, reducing cooling. We clean the filters and indoor unit with dedicated tools while protecting the area around it — and can add it to a home clean in the same visit.',
      includes: [
        'Filters removed and washed',
        'Indoor unit and air vents cleaned',
        'Wall and floor protected while cleaning',
        'Unit cover cleaned',
        'Test run after cleaning',
      ],
      ideal: ['Apartments and villas', 'Before summer', 'Together with a deep or post-construction clean'],
      faqs: [
        { q: 'Can you clean the ACs during a home clean?', a: 'Yes, add them to the same booking; the number of units is set in the quotation.' },
        { q: 'How long does one AC take?', a: 'It depends on the type and condition; the quotation states the duration.' },
      ],
    },
  },
  {
    slug: 'water-tank-cleaning',
    icon: 'droplets',
    category: 'property',
    ar: {
      name: 'تنظيف وتعقيم خزانات المياه',
      short: 'تنظيف الخزانات العلوية والأرضية وتعقيمها للحفاظ على ماء نظيف وآمن.',
      intro:
        'الخزان مصدر مياه بيتك كله. مع الوقت تتراكم فيه الرواسب والطين. نفرّغ الخزان وننظفه وننقّيه ونعقّمه بمواد مخصصة لخزانات مياه الشرب، ثم نعيد تشغيله.',
      includes: [
        'تفريغ الخزان بالكامل',
        'إزالة الرواسب والطين',
        'تنظيف الجدران والأرضية',
        'التعقيم بمواد مخصصة للخزانات',
        'الشطف وإعادة التعبئة',
        'فحص بصري للغطاء والفتحات',
      ],
      ideal: ['الخزانات الأرضية والعلوية', 'العمائر السكنية', 'قبل السكن في بيت جديد'],
      faqs: [
        { q: 'كم مرة يُنصح بتنظيف الخزان؟', a: 'مرة إلى مرتين في السنة على الأقل.' },
        { q: 'هل ينقطع الماء أثناء التنظيف؟', a: 'نعم لفترة مؤقتة، ونرتب الموعد بحيث يكون الانقطاع أقل ما يمكن.' },
      ],
    },
    en: {
      name: 'Water Tank Cleaning',
      short: 'Cleaning and sanitising rooftop and underground tanks for clean, safe water.',
      intro:
        'Your tank supplies water to the whole home, and sediment builds up over time. We drain, clean and sanitise the tank with products made for drinking-water tanks, then bring it back into service.',
      includes: [
        'Tank fully drained',
        'Sediment and sludge removed',
        'Walls and floor scrubbed',
        'Sanitised with tank-safe products',
        'Rinsed and refilled',
        'Visual check of the lid and openings',
      ],
      ideal: ['Underground and rooftop tanks', 'Residential buildings', 'Before moving into a new home'],
      faqs: [
        { q: 'How often should a tank be cleaned?', a: 'At least once or twice a year.' },
        { q: 'Will the water be off during cleaning?', a: 'Temporarily, yes. We schedule to keep the interruption as short as possible.' },
      ],
    },
  },
  {
    slug: 'exterior-cleaning',
    icon: 'house',
    category: 'specialised',
    ar: {
      name: 'تنظيف الواجهات والمساحات الخارجية',
      short: 'الأحواش والمداخل والجلسات الخارجية والمواقف والأسطح.',
      intro:
        'المساحات الخارجية أول شي يشوفه الضيف. ننظف الأحواش والممرات والجلسات الخارجية والمواقف والأسطح، ونزيل الرمل والبقع والأوساخ المتراكمة.',
      includes: [
        'غسيل الأحواش والممرات والمداخل',
        'تنظيف الجلسات الخارجية والمظلات',
        'إزالة الرمل والأتربة المتراكمة',
        'تنظيف المواقف والكراج',
        'تنظيف الأسطح (السطوح) عند الطلب',
      ],
      ideal: ['الفلل والقصور', 'قبل المناسبات والعزايم', 'بعد موجات الغبار'],
      faqs: [
        { q: 'هل تستخدمون أجهزة ضغط الماء؟', a: 'نعم عند الحاجة وحسب نوع السطح.' },
        { q: 'هل تشمل الخدمة الواجهة الخارجية للمبنى؟', a: 'حسب ارتفاع المبنى وإمكانية الوصول الآمن. أرسل لنا صور ونعطيك الحل المناسب.' },
      ],
    },
    en: {
      name: 'Exterior Cleaning',
      short: 'Yards, entrances, outdoor seating, parking areas and rooftops.',
      intro:
        'Outdoor areas are the first thing guests see. We clean yards, walkways, outdoor seating, parking and rooftops, removing sand, stains and built-up dirt.',
      includes: [
        'Yards, walkways and entrances washed',
        'Outdoor seating and shades cleaned',
        'Built-up sand and dust removed',
        'Parking and garage areas',
        'Rooftops on request',
      ],
      ideal: ['Villas and palaces', 'Before gatherings and occasions', 'After dust storms'],
      faqs: [
        { q: 'Do you use pressure washers?', a: 'Yes, where needed and suitable for the surface.' },
        { q: 'Does this include the building façade?', a: 'It depends on building height and safe access. Send photos and we will recommend the right approach.' },
      ],
    },
  },
  {
    slug: 'residential-building-cleaning',
    icon: 'building-2',
    category: 'property',
    ar: {
      name: 'تنظيف العمائر والمجمعات السكنية',
      short: 'عقود تنظيف دورية للمداخل والممرات والدرج والمصاعد والمواقف.',
      intro:
        'للملاك ومدراء الأملاك واتحادات الملاك: نقدم عقود تنظيف دورية للعمائر والمجمعات السكنية بجدول ثابت وقائمة مهام واضحة، ونرفع لك تقرير بعد كل زيارة حتى تتابع بدون ما تحتاج تحضر.',
      includes: [
        'تنظيف المداخل واللوبي',
        'تنظيف الدرج والممرات والدرابزين',
        'تنظيف المصاعد من الداخل والخارج',
        'تنظيف المواقف وغرف النفايات',
        'تنظيف الزجاج والأبواب المشتركة',
        'تقرير مصوّر بعد كل زيارة',
      ],
      ideal: ['ملاك العمائر', 'اتحادات الملاك', 'مكاتب إدارة الأملاك', 'المجمعات السكنية'],
      faqs: [
        { q: 'هل عندكم عقود شهرية أو سنوية؟', a: 'نعم، نصمم العقد حسب عدد الزيارات وحجم المبنى، مع سعر ثابت وواضح.' },
        { q: 'كيف أتابع جودة الشغل؟', a: 'نرسل تقرير مصوّر بعد كل زيارة، ويكون لك مشرف مسؤول تتواصل معه مباشرة.' },
      ],
    },
    en: {
      name: 'Residential Building Cleaning',
      short: 'Scheduled cleaning of lobbies, corridors, stairs, lifts and parking.',
      intro:
        'For building owners, property managers and owners’ associations: scheduled cleaning contracts for residential buildings and compounds, with a fixed timetable, a clear checklist and a report after every visit so you can follow up without being on site.',
      includes: [
        'Entrances and lobbies',
        'Stairs, corridors and handrails',
        'Lifts inside and out',
        'Parking areas and bin rooms',
        'Shared glass and doors',
        'Photo report after every visit',
      ],
      ideal: ['Building owners', "Owners' associations (HOA)", 'Property management offices', 'Residential compounds'],
      faqs: [
        { q: 'Do you offer monthly or annual contracts?', a: 'Yes. We scope the contract around visit frequency and building size, with a clear fixed price.' },
        { q: 'How do I track quality?', a: 'You receive a photo report after every visit and a dedicated supervisor you can contact directly.' },
      ],
    },
  },
  {
    slug: 'building-operation-maintenance',
    icon: 'wrench',
    category: 'facility',
    expanding: true,
    ar: {
      name: 'إدارة وتشغيل وصيانة المباني',
      short: 'نتولى إدارة مبناك وتشغيله اليومي وصيانته الوقائية والطارئة — خدمة مستقلة عن التنظيف.',
      intro:
        'خدمة مستقلة عن خدمات التنظيف: نتولى إدارة المبنى وتشغيله يوميًا، ومتابعة مرافقه المشتركة، وتنفيذ وتنسيق الصيانة الوقائية والطارئة — بعقد واضح وتقارير دورية لمالك المبنى أو اتحاد الملاك. وإذا تحتاج تنظيف دوري للمبنى، تقدر تضيفه كخدمة منفصلة.',
      includes: [
        'إدارة المبنى وتشغيله اليومي',
        'جولات تفقدية وتقارير دورية للمالك',
        'صيانة وقائية للمرافق الأساسية (كهرباء، سباكة، تكييف، مضخات)',
        'استقبال الأعطال وتنسيق الصيانة الطارئة',
        'متابعة خزانات المياه والمضخات والمساحات الخارجية',
        'نقطة تواصل واحدة للمالك والسكان',
      ],
      ideal: ['العمائر السكنية', 'المجمعات السكنية', 'اتحادات الملاك', 'المباني التجارية الصغيرة والمتوسطة'],
      faqs: [
        { q: 'وش الفرق بينها وبين خدمة تنظيف العمائر؟', a: 'تنظيف العمائر خدمة تنظيف دوري للمرافق المشتركة. أما إدارة وتشغيل وصيانة المباني فهي خدمة مستقلة تهتم بتشغيل المبنى وصيانته ومتابعته. تقدر تطلب وحدة منهم أو الثنتين مع بعض.' },
        { q: 'وش يشمل العقد؟', a: 'نحدد النطاق معك بعد معاينة المبنى: من المتابعة والصيانة الوقائية فقط، إلى تشغيل كامل مع الصيانة الطارئة.' },
        { q: 'هل الخدمة متاحة الحين؟', a: 'الخدمة قيد التوسع، ونستقبل الطلبات ونرتب معاينة للمبنى حسب النطاق والموقع.' },
      ],
    },
    en: {
      name: 'Building Management, Operation & Maintenance',
      short: 'We manage, run and maintain your building day to day — a service separate from cleaning.',
      intro:
        'A separate service from our cleaning: we manage the building and run it day to day, look after its shared facilities and carry out and coordinate preventive and reactive maintenance — under a clear contract with regular reports for the owner or owners’ association. If the building also needs scheduled cleaning, you can add it as a separate service.',
      includes: [
        'Building management and day-to-day operation',
        'Routine inspections and reports for the owner',
        'Preventive maintenance of core systems (electrical, plumbing, AC, pumps)',
        'Fault reporting and coordination of urgent repairs',
        'Water tanks, pumps and outdoor areas looked after',
        'One point of contact for owners and residents',
      ],
      ideal: ['Residential buildings', 'Residential compounds', "Owners' associations (HOA)", 'Small and mid-size commercial buildings'],
      faqs: [
        { q: 'How is this different from building cleaning?', a: 'Building cleaning is scheduled cleaning of shared areas. Management, operation and maintenance is a separate service that runs, maintains and looks after the building. You can order either one, or both together.' },
        { q: 'What does the contract include?', a: 'We define the scope with you after a site visit — from inspections and preventive maintenance only, to full operation with reactive maintenance.' },
        { q: 'Is the service available now?', a: 'The service is expanding; we take requests and arrange a site visit depending on scope and location.' },
      ],
    },
  },
];

export const serviceBySlug = (slug: string) => SERVICES.find((s) => s.slug === slug);
