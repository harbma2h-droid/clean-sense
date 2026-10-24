import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, MessageCircle } from 'lucide-react';
import { ENUMS, MONEY_FMT, enumLabel } from '@shared/model.js';
import logo from '../assets/brand/logo-navy.svg';
import type { Row } from '../api';
import { DocSheet } from '../components/DocSheet';
import { downloadFile, sheetToPdf } from '../pdf';
import { waLink } from '../ui';

// The customer's own view of a quote, invoice or contract, opened from the link we send on
// WhatsApp (/d/<token>). Phone-first HTML; the A4 PDF is made from the same data on demand.
const L = {
  ar: {
    loading: 'جاري التحميل…', missing: 'الرابط غير صالح أو انتهت صلاحيته. تواصل معنا وبنرسل لك نسخة جديدة.',
    date: 'التاريخ', valid: 'صالح حتى', due: 'تاريخ الاستحقاق', customer: 'العميل', items: 'التفاصيل', qty: 'الكمية', total: 'الإجمالي',
    subtotal: 'المجموع', discount: 'الخصم', paid: 'المدفوع', balance: 'المتبقي', method: 'طريقة الدفع', scope: 'نطاق العمل', terms: 'الشروط والأحكام',
    notes: 'ملاحظات', bank: 'بيانات التحويل البنكي', iban: 'الآيبان', holder: 'اسم الحساب', bankName: 'البنك', pdf: 'تحميل PDF', making: 'جاري التجهيز…',
    contact: 'تواصل معنا', draft: 'مسودة — غير معتمدة', paidStamp: 'مدفوعة', novat: 'المبالغ غير خاضعة لضريبة القيمة المضافة (المنشأة غير مسجلة في ضريبة القيمة المضافة).',
    ask: 'السلام عليكم، عندي استفسار بخصوص', services: 'الخدمات',
  },
  en: {
    loading: 'Loading…', missing: 'This link is not valid any more. Contact us and we will send you a new copy.',
    date: 'Date', valid: 'Valid until', due: 'Due date', customer: 'Customer', items: 'Details', qty: 'Qty', total: 'Total',
    subtotal: 'Subtotal', discount: 'Discount', paid: 'Paid', balance: 'Balance due', method: 'Payment method', scope: 'Scope of work', terms: 'Terms & conditions',
    notes: 'Notes', bank: 'Bank transfer details', iban: 'IBAN', holder: 'Account name', bankName: 'Bank', pdf: 'Download PDF', making: 'Preparing…',
    contact: 'Contact us', draft: 'DRAFT — not valid', paidStamp: 'Paid', novat: 'Amounts are not subject to VAT (the business is not VAT-registered).',
    ask: 'Hello, I have a question about', services: 'Services',
  },
};

export function PublicDoc({ token }: { token: string }) {
  const [data, setData] = useState<{ doc: Row; company: Record<string, string> } | null | false>(null);
  const [busy, setBusy] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/public/doc/${encodeURIComponent(token)}`).then((r) => (r.ok ? r.json() : false)).then(setData).catch(() => setData(false));
  }, [token]);

  const docLang: 'ar' | 'en' = data && data.doc.language === 'en' ? 'en' : data === false && !navigator.language.startsWith('ar') ? 'en' : 'ar';
  useEffect(() => {
    document.documentElement.lang = docLang;
    document.documentElement.dir = docLang === 'ar' ? 'rtl' : 'ltr';
  }, [docLang]);

  const l = L[docLang];
  if (data === null) return <div className="pd"><p className="pd-msg">{l.loading}</p></div>;
  if (data === false) return <div className="pd"><img className="pd-logo" src={logo} alt="Clean Sense" /><p className="pd-msg">{l.missing}</p></div>;

  const { doc: d, company: c } = data;
  const M = (n: unknown) => MONEY_FMT(n, docLang);
  const title = (ENUMS as any).doc_type[d.type]?.[docLang] || d.type;
  document.title = `${title} ${d.doc_number} — ${docLang === 'ar' ? 'كلين سنس' : 'Clean Sense'}`;
  const items: Row[] = d.items_parsed || [];
  const total = Number(d.total_value) || 0;
  const paid = d.type === 'invoice' ? Number(d.paid) || 0 : 0;
  const subtotal = items.reduce((s, x) => s + Number(x.qty) * Number(x.unit_price), 0);
  const phone = c['contact.phone'] || '0537717716';
  const stamp = d.status === 'draft' ? l.draft : d.type === 'invoice' && d.state === 'paid' ? l.paidStamp : '';
  const services = String(d.services || '').split(',').filter(Boolean).map((s) => enumLabel('service', s, docLang)).join(docLang === 'ar' ? '، ' : ', ');
  const showBank = d.type === 'invoice' && c['docs.show_bank'] === 'yes' && c['bank.iban'];

  const pdf = async () => {
    setBusy(true);
    try {
      const name = `${title.replace(/\s+/g, '-')}-${d.doc_number}-${docLang === 'ar' ? 'كلين-سنس' : 'Clean-Sense'}.pdf`;
      await downloadFile(await sheetToPdf(sheet.current!, name));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pd">
      <header className="pd-head">
        <img className="pd-logo" src={logo} alt="Clean Sense" />
        <div className="pd-title">
          <h1>{title}</h1>
          <span className="num">{d.doc_number}</span>
          {stamp && <b className={`pd-stamp ${d.status === 'draft' ? 'warn' : ''}`}>{stamp}</b>}
        </div>
      </header>

      <section className="pd-card">
        <dl className="pd-rows">
          <div><dt>{l.customer}</dt><dd>{d.customer_name}</dd></div>
          <div><dt>{l.date}</dt><dd className="num">{d.date}</dd></div>
          {d.type === 'quote' && d.valid_until && <div><dt>{l.valid}</dt><dd className="num">{d.valid_until}</dd></div>}
          {d.type === 'invoice' && d.due_date && <div><dt>{l.due}</dt><dd className="num">{d.due_date}</dd></div>}
        </dl>
      </section>

      <section className="pd-card">
        <h2>{l.items}</h2>
        {items.length > 0 ? (
          <ul className="pd-items">{items.map((x, i) => (
            <li key={i}>
              <p className="pre">{x.description || enumLabel('service', x.service, docLang)}</p>
              <div><span className="muted num">{x.qty} × {M(x.unit_price)}</span><b className="num">{M(Number(x.qty) * Number(x.unit_price))}</b></div>
            </li>
          ))}</ul>
        ) : <p>{services ? `${l.services}: ${services}` : d.scope}</p>}
        <dl className="pd-total">
          {Number(d.discount) > 0 && <><div><dt>{l.subtotal}</dt><dd className="num">{M(subtotal)}</dd></div><div><dt>{l.discount}</dt><dd className="num">− {M(d.discount)}</dd></div></>}
          <div className="grand"><dt>{l.total}</dt><dd className="num">{M(total)}</dd></div>
          {paid > 0 && <div><dt>{l.paid}</dt><dd className="num">{M(paid)}</dd></div>}
          {paid > 0 && <div className="due"><dt>{l.balance}</dt><dd className="num">{M(Math.max(0, total - paid))}</dd></div>}
          {d.payment_method && <div><dt>{l.method}</dt><dd>{enumLabel('payment_method', d.payment_method, docLang)}</dd></div>}
        </dl>
        <p className="pd-small">{l.novat}</p>
      </section>

      {showBank && (
        <section className="pd-card">
          <h2>{l.bank}</h2>
          <dl className="pd-rows">
            {c['bank.name'] && <div><dt>{l.bankName}</dt><dd>{c['bank.name']}</dd></div>}
            {c['bank.account_name'] && <div><dt>{l.holder}</dt><dd>{c['bank.account_name']}</dd></div>}
            <div><dt>{l.iban}</dt><dd className="num pd-iban" dir="ltr">{c['bank.iban']}</dd></div>
          </dl>
        </section>
      )}
      {d.type !== 'invoice' && d.scope && items.length > 0 && <details className="pd-card"><summary>{l.scope}</summary><p className="pre">{d.scope}</p></details>}
      {d.terms && <details className="pd-card"><summary>{l.terms}</summary><p className="pre">{d.terms}</p></details>}
      {d.notes && <details className="pd-card"><summary>{l.notes}</summary><p className="pre">{d.notes}</p></details>}

      <footer className="pd-foot">
        <div><span className="num" dir="ltr">{phone}</span> · <span dir="ltr">{c['contact.website'] || 'cleansense.co'}</span></div>
        <strong>CLEAN YOU CAN FEEL</strong>
      </footer>

      <div className="pd-actions">
        <button className="primary" onClick={pdf} disabled={busy}><Download size={18} />{busy ? l.making : l.pdf}</button>
        <a className="btn" href={waLink(phone, `${l.ask} ${title} ${d.doc_number}`)} target="_blank" rel="noreferrer"><MessageCircle size={18} />{l.contact}</a>
      </div>

      {/* Full-size A4 copy used to make the PDF, kept out of view. */}
      {createPortal(<div className="pdf-stage" aria-hidden="true"><DocSheet ref={sheet} doc={d} company={c} /></div>, document.body)}
    </div>
  );
}
