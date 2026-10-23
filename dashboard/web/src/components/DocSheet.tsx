import { forwardRef } from 'react';
import { ENUMS, MONEY_FMT, enumLabel } from '@shared/model.js';
import logo from '../assets/brand/logo-transparent.svg';
import type { Row } from '../api';

// Labels follow the document's own language, not the screen language.
const L = {
  ar: {
    no: 'رقم المستند', date: 'التاريخ', valid: 'صالح حتى', due: 'تاريخ الاستحقاق', customer: 'العميل', phone: 'الجوال', city: 'المدينة', project: 'المشروع', period: 'مدة العقد',
    desc: 'الوصف', qty: 'الكمية', unit: 'سعر الوحدة', amount: 'المبلغ', subtotal: 'المجموع', discount: 'الخصم', total: 'الإجمالي', paid: 'المدفوع', balance: 'المتبقي',
    scope: 'نطاق العمل', duration: 'مدة التنفيذ', method: 'طريقة الدفع', terms: 'الشروط والأحكام', notes: 'ملاحظات', guarantee: 'الضمان الذهبي',
    unified: 'الرقم الوطني الموحد', novat: 'المبالغ غير خاضعة لضريبة القيمة المضافة (المنشأة غير مسجلة في ضريبة القيمة المضافة).',
    bank: 'بيانات التحويل البنكي', iban: 'الآيبان', holder: 'اسم الحساب', bankName: 'البنك', sign: 'توقيع العميل', sign2: 'عن مؤسسة كلين سنس',
    draft: 'مسودة — غير معتمدة', void: 'ملغاة', receipt: 'سند قبض', received_from: 'استلمنا من', the_sum: 'مبلغ وقدره', for: 'وذلك عن', ref: 'المرجع', receiver: 'المستلم',
    from_quote: 'بناءً على عرض السعر', thanks: 'شكراً لثقتكم بكلين سنس',
  },
  en: {
    no: 'Document no.', date: 'Date', valid: 'Valid until', due: 'Due date', customer: 'Customer', phone: 'Phone', city: 'City', project: 'Project', period: 'Contract period',
    desc: 'Description', qty: 'Qty', unit: 'Unit price', amount: 'Amount', subtotal: 'Subtotal', discount: 'Discount', total: 'Total', paid: 'Paid', balance: 'Balance due',
    scope: 'Scope of work', duration: 'Duration', method: 'Payment method', terms: 'Terms & conditions', notes: 'Notes', guarantee: 'Golden guarantee',
    unified: 'Unified number', novat: 'Amounts are not subject to VAT (the business is not VAT-registered).',
    bank: 'Bank transfer details', iban: 'IBAN', holder: 'Account name', bankName: 'Bank', sign: 'Customer signature', sign2: 'For Clean Sense Est.',
    draft: 'DRAFT — not valid', void: 'VOID', receipt: 'Payment receipt', received_from: 'Received from', the_sum: 'The sum of', for: 'For', ref: 'Reference', receiver: 'Received by',
    from_quote: 'Based on quotation', thanks: 'Thank you for choosing Clean Sense',
  },
};

type Props = { doc?: Row; payment?: Row; company: Record<string, string> };

/** The printable / PDF version of a quote, invoice, contract or payment receipt (A4). */
export const DocSheet = forwardRef<HTMLDivElement, Props>(function DocSheet({ doc, payment, company: c }, ref) {
  const lang: 'ar' | 'en' = (doc?.language || payment?.language) === 'en' ? 'en' : 'ar';
  const l = L[lang];
  const M = (n: unknown) => MONEY_FMT(n, lang);
  const legalName = lang === 'ar' ? c['company.legal_name'] || 'مؤسسة كلين سنس' : c['company.legal_name_en'] || 'Clean Sense Est.';
  const guarantee = lang === 'en' ? c['guarantee.golden_en'] : c['guarantee.golden_ar'];
  const footerNote = lang === 'en' ? c['docs.footer_note_en'] : c['docs.footer_note_ar'];
  const phone = c['contact.phone'] || '0537717716';

  const header = (title: string, number: string, stamp?: string) => (
    <header className="ds-head" data-block>
      <div className="ds-brand">
        <img src={logo} alt="Clean Sense" />
        <div>
          <b>{legalName}</b>
          <span>{l.unified}: <bdi className="num">{c['company.unified_number'] || '7049749042'}</bdi></span>
          <span className="num" dir="ltr">{phone} · {c['contact.email'] || 'info@cleansense.co'}</span>
          <span className="num" dir="ltr">{c['contact.website'] || 'cleansense.co'}</span>
        </div>
      </div>
      <div className="ds-title">
        <h1>{title}</h1>
        <span className="num">{number}</span>
        {stamp && <b className="ds-stamp">{stamp}</b>}
      </div>
    </header>
  );
  const footer = (
    <footer className="ds-foot" data-block>
      {footerNote && <p>{footerNote}</p>}
      <div><span className="num" dir="ltr">{phone}</span><span>·</span><span dir="ltr">{c['contact.website'] || 'cleansense.co'}</span><span>·</span><span>{l.thanks}</span></div>
      <strong>CLEAN YOU CAN FEEL</strong>
    </footer>
  );

  if (payment) {
    return (
      <div className="ds" ref={ref} lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {header(l.receipt, payment.receipt_no || '', payment.status === 'void' ? l.void : undefined)}
        <section className="ds-receipt" data-block>
          <div><span>{l.date}</span><b className="num">{payment.date}</b></div>
          <div><span>{l.received_from}</span><b>{payment.customer_name}</b></div>
          <div className="big"><span>{l.the_sum}</span><b className="num">{M(payment.amount)}</b></div>
          <div><span>{l.method}</span><b>{enumLabel('payment_method', payment.method, lang)}</b></div>
          {payment.invoice_number && <div><span>{l.for}</span><b className="num">{lang === 'ar' ? 'الفاتورة' : 'Invoice'} {payment.invoice_number}</b></div>}
          {payment.reference && <div><span>{l.ref}</span><b className="num">{payment.reference}</b></div>}
          {payment.notes && <div><span>{l.notes}</span><b>{payment.notes}</b></div>}
        </section>
        <p className="ds-small" data-block>{l.novat}</p>
        <div className="ds-signs" data-block><div>{l.receiver}<span /></div><div>{l.sign2}<span /></div></div>
        {footer}
      </div>
    );
  }

  const d = doc!;
  const items: Row[] = d.items_parsed?.length ? d.items_parsed : [];
  const subtotal = items.reduce((s, x) => s + Number(x.qty) * Number(x.unit_price), 0);
  const total = Number(d.total_value) || 0;
  const paid = d.type === 'invoice' ? Number(d.paid) || 0 : Number(d.paid_amount) || 0;
  const stamp = d.status === 'draft' ? l.draft : d.status === 'void' || d.state === 'void' ? l.void : undefined;
  const title = (ENUMS as any).doc_type[d.type]?.[lang] || d.type;
  const showBank = d.type === 'invoice' && c['docs.show_bank'] === 'yes' && c['bank.iban'];
  const services = String(d.services || '').split(',').filter(Boolean).map((s) => enumLabel('service', s, lang)).join(lang === 'ar' ? '، ' : ', ');

  return (
    <div className="ds" ref={ref} lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {header(title, d.doc_number || '', stamp)}

      <section className="ds-parties" data-block>
        <div className="ds-box">
          <span className="ds-label">{l.customer}</span>
          <b>{d.customer_name}</b>
          {d.customer_phone && <span className="num" dir="ltr">{d.customer_phone}</span>}
          {d.city && <span>{enumLabel('city', d.city, lang)}</span>}
        </div>
        <dl className="ds-box ds-meta">
          <div><dt>{l.date}</dt><dd className="num">{d.date}</dd></div>
          {d.type === 'quote' && d.valid_until && <div><dt>{l.valid}</dt><dd className="num">{d.valid_until}</dd></div>}
          {d.type === 'invoice' && d.due_date && <div><dt>{l.due}</dt><dd className="num">{d.due_date}</dd></div>}
          {d.converted_from && <div><dt>{l.from_quote}</dt><dd className="num">{d.converted_from}</dd></div>}
          {d.project_name && <div><dt>{l.project}</dt><dd>{d.project_name}</dd></div>}
          {d.start_date && <div><dt>{l.period}</dt><dd className="num">{d.start_date} → {d.end_date}</dd></div>}
          {d.duration && <div><dt>{l.duration}</dt><dd>{d.duration}</dd></div>}
        </dl>
      </section>

      {items.length > 0 ? (
        <table className="ds-items">
          <thead><tr data-block><th>#</th><th>{l.desc}</th><th>{l.qty}</th><th>{l.unit}</th><th>{l.amount}</th></tr></thead>
          <tbody>{items.map((x, i) => (
            <tr key={i} data-block>
              <td className="num">{i + 1}</td>
              <td><span className="pre">{x.description || enumLabel('service', x.service, lang)}</span>{x.description && x.service && <small>{enumLabel('service', x.service, lang)}</small>}</td>
              <td className="num">{x.qty}</td><td className="num">{M(x.unit_price)}</td><td className="num">{M(Number(x.qty) * Number(x.unit_price))}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : services ? <p className="ds-services" data-block><b>{lang === 'ar' ? 'الخدمات' : 'Services'}:</b> {services}</p> : null}

      <section className="ds-totals" data-block>
        <dl>
          {Number(d.discount) > 0 && <><div><dt>{l.subtotal}</dt><dd className="num">{M(subtotal)}</dd></div><div><dt>{l.discount}</dt><dd className="num">− {M(d.discount)}</dd></div></>}
          <div className="grand"><dt>{l.total}</dt><dd className="num">{M(total)}</dd></div>
          {paid > 0 && <div><dt>{l.paid}</dt><dd className="num">{M(paid)}</dd></div>}
          {paid > 0 && d.type === 'invoice' && <div className="due"><dt>{l.balance}</dt><dd className="num">{M(Math.max(0, total - paid))}</dd></div>}
          {d.payment_method && <div><dt>{l.method}</dt><dd>{enumLabel('payment_method', d.payment_method, lang)}</dd></div>}
        </dl>
        <p className="ds-small">{l.novat}</p>
      </section>

      {d.scope && <section className="ds-sec" data-block><h2>{l.scope}</h2><p className="pre">{d.scope}</p></section>}
      {d.terms && <section className="ds-sec" data-block><h2>{l.terms}</h2><p className="pre">{d.terms}</p></section>}
      {d.notes && <section className="ds-sec" data-block><h2>{l.notes}</h2><p className="pre">{d.notes}</p></section>}
      {showBank && (
        <section className="ds-sec ds-bank" data-block>
          <h2>{l.bank}</h2>
          <dl>
            {c['bank.name'] && <div><dt>{l.bankName}</dt><dd>{c['bank.name']}</dd></div>}
            {c['bank.account_name'] && <div><dt>{l.holder}</dt><dd>{c['bank.account_name']}</dd></div>}
            <div><dt>{l.iban}</dt><dd className="num" dir="ltr">{c['bank.iban']}</dd></div>
          </dl>
        </section>
      )}
      {guarantee && d.type !== 'receipt' && <section className="ds-guarantee" data-block><h2>{l.guarantee}</h2><p>{guarantee}</p></section>}
      {d.type === 'contract' && <div className="ds-signs" data-block><div>{l.sign}<span /></div><div>{l.sign2}<span /></div></div>}
      {footer}
    </div>
  );
});
