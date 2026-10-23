"""Writes dist-preview/preview.html — the entry page of the claude.ai preview link.
Order: PREVIEW=1 npx astro build --outDir dist-preview && python3 scripts/make-preview.py && python3 scripts/preview-hub.py"""
import re

svc = open('src/data/services.ts', encoding='utf-8').read()
items = re.findall(r"slug: '([^']+)'.*?ar: \{\s*name: '([^']+)'", svc, re.S)
rows = '\n'.join(
    f'      <li><a href="site/services/{s}/index.html">{ar}</a>'
    f'<a class="en" href="site/en/services/{s}/index.html" lang="en">EN</a></li>'
    for s, ar in items
)

html = f'''<title>معاينة موقع كلين سنس</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap">
<style>
  :root {{
    color-scheme: dark;
    --navy: #0B1F41; --navy-2: #13294F; --line: rgba(234,213,125,.18);
    --gold-hl: #EAD57D; --gold: #D1AD45;
    --text: #E6EAF2; --muted: #A9B5CB;
    --grad: linear-gradient(135deg,#EAD57D,#D1AD45 50%,#B88A1C);
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--navy); color: var(--text);
    font-family: 'Cairo', system-ui, Tahoma, sans-serif; font-size: 16px; line-height: 1.7; }}
  .wrap {{ max-width: 760px; margin: 0 auto; padding-inline: 18px; padding-block: 32px 56px; display: grid; gap: 28px; }}
  header {{ display: flex; align-items: center; gap: 14px; }}
  header img {{ height: 56px; width: auto; }}
  .brand b {{ display: block; color: var(--gold-hl); letter-spacing: .08em; font-size: .95rem; }}
  .brand span {{ color: var(--muted); font-size: .9rem; }}
  h1 {{ margin: 0; font-size: clamp(1.6rem, 1.2rem + 2vw, 2.2rem); line-height: 1.35; color: #fff; text-wrap: balance; }}
  h1 em {{ font-style: normal; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }}
  p {{ margin: 0; color: var(--muted); }}
  .open {{ display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0,1fr)); }}
  .btn {{ display: flex; flex-direction: column; justify-content: center; gap: 2px; min-height: 84px; padding: 14px 18px;
    border-radius: 18px; text-decoration: none; font-weight: 700; font-size: 1.1rem; }}
  .btn small {{ font-weight: 400; font-size: .8rem; }}
  .btn--gold {{ background: var(--grad); color: var(--navy); box-shadow: 0 14px 30px -14px rgba(209,173,69,.8); }}
  .btn--ghost {{ border: 1.5px solid var(--line); color: #fff; }}
  a:focus-visible {{ outline: 3px solid var(--gold-hl); outline-offset: 3px; }}
  section {{ display: grid; gap: 12px; }}
  h2 {{ margin: 0; font-size: 1.05rem; color: var(--gold-hl); }}
  ul {{ margin: 0; padding: 0; list-style: none; }}
  .svc {{ display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }}
  .svc li {{ display: flex; align-items: stretch; border: 1px solid var(--line); border-radius: 12px; background: var(--navy-2); }}
  .svc a {{ color: var(--text); text-decoration: none; padding: 10px 12px; font-size: .92rem; font-weight: 600; flex: 1; line-height: 1.4; }}
  .svc a.en {{ flex: 0 0 auto; display: grid; place-items: center; color: var(--gold); font-size: .75rem; border-inline-start: 1px solid var(--line); }}
  .svc a:hover {{ color: var(--gold-hl); }}
  .list li {{ display: flex; gap: 10px; padding-block: 8px; border-bottom: 1px solid rgba(255,255,255,.07); }}
  .list li::before {{ content: ''; flex: 0 0 8px; height: 8px; margin-top: 10px; border-radius: 50%; background: var(--gold); }}
  .ask li::before {{ background: transparent; border: 2px solid var(--gold-hl); }}
  .note {{ padding: 14px 16px; border-radius: 14px; border: 1px dashed var(--line); font-size: .9rem; }}
  @media (max-width: 420px) {{ .svc {{ grid-template-columns: 1fr; }} }}
</style>

<div class="wrap" dir="rtl" lang="ar">
  <header>
    <img src="site/brand/logo-mark.svg" alt="">
    <div class="brand"><b>CLEAN SENSE</b><span>معاينة التصميم الجديد</span></div>
  </header>

  <div style="display:grid;gap:10px">
    <h1>الموقع الجديد جاهز. <em>اضغط وجرّب بنفسك.</em></h1>
    <p>هذي نسخة معاينة خاصة. موقعك الحالي cleansense.co ما تغيّر فيه شي.</p>
  </div>

  <div class="open">
    <a class="btn btn--gold" href="site/index.html">افتح الموقع<small>النسخة العربية</small></a>
    <a class="btn btn--ghost" href="site/en/index.html" lang="en">Open website<small>English version</small></a>
  </div>

  <section>
    <h2>جرّب هذي الأشياء</h2>
    <ul class="list">
      <li>افتحه من الجوال: شريط الحجز الثابت تحت (اتصال / واتساب / احسب السعر).</li>
      <li>حاسبة السعر: اختر «التنظيف العميق»، بعدين فيلا، وزوّد الغرف. بتشوف السعر ورسالة الواتساب الجاهزة.</li>
      <li>زر English فوق يحوّلك لنفس الصفحة بالإنجليزي.</li>
      <li>كل خدمة لها صفحة خاصة (القائمة تحت).</li>
    </ul>
  </section>

  <section>
    <h2>صفحات الخدمات (١٢)</h2>
    <ul class="svc">
{rows}
    </ul>
  </section>

  <section>
    <h2>محتاج تأكيدك قبل النشر</h2>
    <ul class="list ask">
      <li>التقييمات الثلاث أمثلة مؤقتة، نبدّلها بتقييمات حقيقية من عملائك.</li>
      <li>رقم «+500 عميل» منقول من الموقع القديم، هل هو دقيق؟</li>
      <li>وعود كتبتها: تقرير مصوّر بعد كل زيارة للعمائر، ضمان إعادة العمل خلال ٢٤ ساعة، معاينة مجانية.</li>
      <li>المدن: الخبر والدمام والجبيل فقط؟ ولا نضيف الظهران والقطيف؟</li>
    </ul>
  </section>

  <p class="note">داخل المعاينة، أزرار الواتساب تفتح في تبويب جديد، وزر الاتصال ممكن ما يشتغل هنا. في الموقع الحقيقي كلها تشتغل عادي.</p>
</div>
'''
open('dist-preview/preview.html', 'w', encoding='utf-8').write(html)
print('hub written with', len(items), 'services')
