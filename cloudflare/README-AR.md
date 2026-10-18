# معرض دبي — تجهيز نسخة Cloudflare Pages المجانية

هذه **نسخة جديدة مستقلة** قيد التجربة على Cloudflare. لا تعدّل موقع Netlify الحالي ولا كلمة مروره ولا بياناته.

## ماذا يبقى؟
- تصميم موقع معرض دبي والشعار والخطوط.
- لوحة التحكم القديمة \`/admin/\`.
- لوحة التحكم الثانية V2 \`/admin-v2/\`.
- إضافة وتعديل وحذف المنتجات، الأقسام، الأسعار، جديد/مستعمل، نسبة نظافة الجهاز، الصور.
- البيانات المستوردة من Netlify تُحفظ في قاعدة بيانات Cloudflare D1، والصور المُحمّلة تُحفظ في Workers KV.

**تنبيه:** هذه نسختان مستقلتان من قواعد البيانات. بعد النقل، لا تعدّل المنتجات من Netlify وتنتظر مزامنتها تلقائياً مع Cloudflare. الاستيراد يتم مرة واحدة فقط قبل الاعتماد.

## خطوة 1 — ربط Cloudflare بـGitHub
1. افتح https://dash.cloudflare.com/
2. اختر **Workers & Pages → Create application → Pages → Connect to Git** (قد تختلف الأسماء قليلاً).
3. اربط حساب GitHub الذي يملك المستودع \`awjnob1988-hash/dubai-store\`. امنح Cloudflare الوصول للمستودع المطلوب فقط إذا رغبت.
4. اسم المشروع المقترح: \`dubai-store-iq-v2\` (قد تحتاج اسماً متاحاً آخر).
5. Production branch: \`feature/cloudflare-pages-store-20261018\`
6. Framework preset: \`None\`
7. Build command:
   \`node install-admin.cjs && node cloudflare/build-pages.cjs\`
8. Build output directory:
   \`dubai-site-handoff/dist\`
9. Root directory: جذر المستودع (لا تضع \`dubai-site-handoff\` كـroot).
10. أنشئ المشروع وانتظر النشر. **واجهة الإدارة لن تعمل حتى تكمل الربط في الخطوات التالية.**

## خطوة 2 — ربط قاعدة بيانات D1
1. في Cloudflare: **Storage & databases → D1 → Create database**.
2. سمّها \`dubai-store-catalog\`.
3. افتح Console لقاعدة البيانات ونفّذ الأمر في \`cloudflare/schema.sql\`:
   \`CREATE TABLE IF NOT EXISTS shop_catalog (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);\`
4. افتح مشروع Pages الجديد: **Settings → Bindings → Add binding → D1**.
5. Variable name يجب أن يكون بالضبط: \`DB\`، واختار قاعدة \`dubai-store-catalog\`.

## خطوة 3 — ربط تخزين الصور KV
1. في Cloudflare: **Storage & databases → KV → Create namespace** (أحياناً اسمه Workers KV).
2. سمّه \`dubai-store-media\`.
3. في Pages → Settings → Bindings أضف **KV namespace**.
4. Variable name يجب أن يكون بالضبط: \`MEDIA\`، واختار \`dubai-store-media\`.

## خطوة 4 — أسرار تسجيل الدخول
في مشروع Pages → Settings → Variables and Secrets، أضف أسراراً في Production:
- \`ADMIN_USERNAME\`: اسم مستخدم من اختيارك.
- \`ADMIN_PASSWORD\`: كلمة مرور جديدة وقوية، 12 حرفاً على الأقل.
- \`ADMIN_SESSION_SECRET\`: رمز عشوائي جديد بطول 32 حرفاً أو أكثر (الأفضل 64).

**لا ترسلها في المحادثة أو تضعها في مستودع GitHub.** استخدم أسرار Cloudflare المحمية. إذا ظهرت خيارات Production وPreview، فابدأ بـProduction فقط.

بعد إنشاء D1 وKV والأسرار، أعد النشر مرة واحدة لكي تتفعّل الربطيات والبيئة.

## خطوة 5 — فحص ثم استيراد المنتجات القديمة بأمان
1. افتح رابط موقع Cloudflare الجديد، وينتهي عادةً بـ \`.pages.dev\`.
2. افتح \`https://[اسم مشروعك].pages.dev/api/data?action=status\`، وتأكد من:
   \`configured:true\` و\`storage:"ok"\`.
3. افتح \`/admin-v2/\` في الموقع **الجديد**، وسجل الدخول ببيانات Cloudflare التي أنشأتها.
4. على الرئيسية يظهر زر **استيراد المنتجات والصور من الموقع القديم**. اضغطه **مرة واحدة فقط**.
5. خدمة Cloudflare تقرأ بيانات المنتجات والصور العامة من:
   \`https://dubai-store-iq.netlify.app/\`
   ثم تنسخها إلى D1 وKV. لا تمسح أو تغير بيانات Netlify.
6. حدّث لوحة التحكم وتحقق من العدد الحقيقي والأقسام والصور.
7. افتح موقع Cloudflare كزبون وتأكد من عرض المنتجات بأسعارها وحالاتها.
8. جرّب تعديل بيانات منتج قديم بشكل قابل للاسترجاع، واحفظ ثم تحقق من ظهور التعديل للزبائن. أعد القيمة كما كانت إذا كانت تجربة.
9. **لا توقف Netlify أو تعلن الرابط الجديد** حتى تنجح هذه الاختبارات.

## حدود وملاحظات
- هذه الخطة لا تتطلب Netlify للنشر بعد الانتقال، لكنها تحتاج تفعيل حساب Cloudflare وربط D1 وKV.
- KV مجاني ضمن حصة استخدام محدودة، وتحديث الصور عبر نقاط Cloudflare المختلفة قد يتأخر قليلاً بسبب الاتساق النهائي.
- لا ينقل المتجر كلمات المرور من Netlify؛ تحتاج إنشاء أسرار جديدة على Cloudflare.
- المنتجات الجديدة تُحفظ في D1، والصور الجديدة في KV، ولذلك لا يتطلب تعديل المنتج إعادة نشر الموقع.
- عدم توفر رصيد Netlify للنشر لا يمنع محاولة قراءة النسخة الحالية المنشورة، ما دامت وظائفها متاحة.
- في حال فشل استيراد صورة، لن يُكتب سجل المنتجات في D1؛ عالج الخطأ ثم أعد الاستيراد.
- لا ننصح باستضافة متجر تجاري على GitHub Pages؛ نستخدم GitHub للمستودع فقط، وCloudflare Pages للاستضافة.

## فحوص تمت قبل النشر
- صياغة JavaScript للـWorker وللوحة V2 سليمة.
- فحص صلاحية المنتجات القديمة والجديد والمستعمل.
- حقل نظافة المستعمل إجباري في API.
- وظيفة الاستيراد تحتاج جلسة مدير، ولا تستطيع الكتابة فوق قاعدة تم استيرادها سابقاً.
- **لم يُختبر النشر الحقيقي والحفظ على Cloudflare بعد** لعدم وجود حساب Cloudflare متصل بهذا العمل.
