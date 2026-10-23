import { useEffect, useState } from 'react';
import emblem from '../assets/emblem.webp';
import { Printer, ArrowRight, ArrowLeft } from 'lucide-react';
import { ENUMS, MONEY_FMT, enumLabel } from '@shared/model.js';
import { api, type Row } from '../api';
import type { Meta } from '../App';
import { useT } from '../i18n';
import { useLang } from '../ui';

// Document labels follow the document's own language, not the user's screen language.
const L = {
  ar: { no: 'رقم المستند', date: 'التاريخ', customer: 'العميل', phone: 'الجوال', city: 'المدينة', services: 'الخدمات', scope: 'نطاق العمل', duration: 'مدة التنفيذ', project: 'المشروع', period: 'الفترة',
    price: 'المبلغ الإجمالي', desc: 'الوصف', qty: 'الكمية', unit: 'سعر الوحدة', line: 'المجموع', subtotal: 'المجموع قبل الخصم', discount: 'الخصم', paid: 'المبلغ المستلم', due: 'المتبقي', method: 'طريقة الدفع', terms: 'الشروط', notes: 'ملاحظات', guarantee: 'الضمان الذهبي', unified: 'الرقم الوطني الموحد',
    novat: 'المبالغ غير خاضعة لضريبة القيمة المضافة (المنشأة غير مسجلة في الضريبة).', thanks: 'شكراً لثقتكم بكلين سنس', sign: 'توقيع العميل', sign2: 'عن مؤسسة كلين سنس' },
  en: { no: 'Document no.', date: 'Date', customer: 'Customer', phone: 'Phone', city: 'City', services: 'Services', scope: 'Scope of work', duration: 'Duration', project: 'Project', period: 'Period',
    price: 'Total amount', desc: 'Description', qty: 'Qty', unit: 'Unit price', line: 'Amount', subtotal: 'Subtotal', discount: 'Discount', paid: 'Amount received', due: 'Balance due', method: 'Payment method', terms: 'Terms', notes: 'Notes', guarantee: 'Golden guarantee', unified: 'Unified number',
    novat: 'Amounts are not subject to VAT (the business is not VAT-registered).', thanks: 'Thank you for choosing Clean Sense', sign: 'Customer signature', sign2: 'For Clean Sense Est.' },
};

export function DocPrint({ id, meta }: { id: string; meta: Meta | null }) {
  const t = useT();
  const uiLang = useLang();
  const [doc, setDoc] = useState<Row | null | undefined>(undefined);
  useEffect(() => { api<Row>(`/sales/documents/${id}`).then(setDoc).catch(() => setDoc(null)); }, [id]);

  if (doc === undefined) return <p className="muted pad">{t('loading')}</p>;
  if (doc === null) return <p className="empty">{t('empty')}</p>;

  const lang: 'ar' | 'en' = doc.language === 'en' ? 'en' : 'ar';
  const l = L[lang];
  const c = meta?.company || {};
  const price = Number(doc.total_value) || 0;
  // Invoices show what was actually collected (from recorded payments); legacy receipts keep their own amount.
  const paid = doc.type === 'invoice' ? Number(doc.paid) || 0 : Number(doc.paid_amount) || 0;
  const items: Row[] = doc.items_parsed || [];
  const subtotal = items.reduce((s, x) => s + Number(x.qty) * Number(x.unit_price), 0);
  const services = String(doc.services || '').split(',').filter(Boolean).map((s) => enumLabel('service', s, lang)).concat(doc.custom_service ? [doc.custom_service] : []).join('، ');
  const guarantee = lang === 'en' ? c['guarantee.golden_en'] : c['guarantee.golden_ar'];
  const Back = uiLang === 'ar' ? ArrowRight : ArrowLeft;

  return (
    <div className="page doc-wrap">
      <div className="toolbar no-print">
        <a className="btn" href={`#/doc/${doc.id}`}><Back size={18} />{t('back')}</a>
        <button className="primary" onClick={() => print()}><Printer size={18} />{t('print')}</button>
      </div>
      <article className="doc" lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <header className="doc-head">
          <div className="doc-brand">
            <img src={emblem} alt="" />
            <div>
              <b>{lang === 'ar' ? c['company.legal_name'] || 'مؤسسة كلين سنس' : 'Clean Sense Est.'}</b>
              <small>{l.unified}: <span className="num">{c['company.unified_number'] || '7049749042'}</span></small>
              <small className="num" dir="ltr">{c['contact.phone'] || '0537717716'} · {c['contact.email'] || 'info@cleansense.co'} · {c['contact.website'] || 'cleansense.co'}</small>
            </div>
          </div>
          <div className="doc-title">
            <h1>{(ENUMS as any).doc_type[doc.type]?.[lang] || doc.type}</h1>
            <span className="num">{doc.doc_number}</span>
            {(doc.status === 'draft' || doc.status === 'void') && <b className="stamp">{doc.status === 'draft' ? (lang === 'ar' ? 'مسودة — غير معتمدة' : 'DRAFT — not valid') : (lang === 'ar' ? 'ملغاة' : 'VOID')}</b>}
          </div>
        </header>

        <dl className="doc-meta">
          <div><dt>{l.customer}</dt><dd>{doc.customer_name}</dd></div>
          <div><dt>{l.date}</dt><dd className="num">{doc.date}</dd></div>
          {doc.customer_phone && <div><dt>{l.phone}</dt><dd className="num" dir="ltr">{doc.customer_phone}</dd></div>}
          {doc.city && <div><dt>{l.city}</dt><dd>{enumLabel('city', doc.city, lang)}</dd></div>}
          {doc.project_name && <div><dt>{l.project}</dt><dd>{doc.project_name}</dd></div>}
          {doc.start_date && <div><dt>{l.period}</dt><dd className="num">{doc.start_date} → {doc.end_date}</dd></div>}
          {services && <div className="span"><dt>{l.services}</dt><dd>{services}</dd></div>}
        </dl>

        {doc.scope && <section><h2>{l.scope}</h2><p className="pre">{doc.scope}</p></section>}
        {doc.duration && <p><b>{l.duration}:</b> {doc.duration}</p>}

        {items.length > 0 && (
          <table className="doc-items">
            <thead><tr><th>#</th><th>{l.desc}</th><th>{l.qty}</th><th>{l.unit}</th><th>{l.line}</th></tr></thead>
            <tbody>{items.map((x, i) => (
              <tr key={i}><td className="num">{i + 1}</td><td><span className="pre">{x.description || enumLabel('service', x.service, lang)}</span></td><td className="num">{x.qty}</td><td className="num">{MONEY_FMT(x.unit_price, lang)}</td><td className="num">{MONEY_FMT(Number(x.qty) * Number(x.unit_price), lang)}</td></tr>
            ))}</tbody>
          </table>
        )}
        <table className="doc-money">
          <tbody>
            {Number(doc.discount) > 0 && <tr><th>{l.subtotal}</th><td className="num">{MONEY_FMT(subtotal, lang)}</td></tr>}
            {Number(doc.discount) > 0 && <tr><th>{l.discount}</th><td className="num">− {MONEY_FMT(doc.discount, lang)}</td></tr>}
            <tr className="big"><th>{l.price}</th><td className="num">{MONEY_FMT(price, lang)}</td></tr>
            {paid > 0 && <tr><th>{l.paid}</th><td className="num">{MONEY_FMT(paid, lang)}</td></tr>}
            {paid > 0 && doc.type !== 'receipt' && <tr><th>{l.due}</th><td className="num">{MONEY_FMT(price - paid, lang)}</td></tr>}
            {doc.payment_method && <tr><th>{l.method}</th><td>{enumLabel('payment_method', doc.payment_method, lang)}</td></tr>}
          </tbody>
        </table>
        <p className="small muted">{l.novat}</p>

        {doc.terms && <section><h2>{l.terms}</h2><p className="pre">{doc.terms}</p></section>}
        {doc.notes && <section><h2>{l.notes}</h2><p className="pre">{doc.notes}</p></section>}
        {guarantee && doc.type !== 'receipt' && (
          <section className="guarantee"><h2>{l.guarantee}</h2><p>{guarantee}</p></section>
        )}
        {doc.type === 'contract' && (
          <div className="signs"><div>{l.sign}<span /></div><div>{l.sign2}<span /></div></div>
        )}
        <footer className="doc-foot">{l.thanks} · CLEAN YOU CAN FEEL</footer>
      </article>
    </div>
  );
}
