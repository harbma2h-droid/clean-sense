import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, FileText, MessageCircle, Phone, Receipt } from 'lucide-react';
import { PERMISSIONS, enumLabel } from '@shared/model.js';
import { api, type Row } from '../api';
import { pick, useT } from '../i18n';
import { Badge, money, useLang, waLink } from '../ui';
import { docStatus } from './Documents';

/** One page with everything about a customer: documents, payments, balance and bookings. */
export function Customer({ id }: { id: string }) {
  const t = useT();
  const lang = useLang();
  const [s, setS] = useState<Row | null>(null);
  useEffect(() => { api<Row>(`/customers/${id}/statement`).then(setS).catch(() => setS({})); }, [id]);
  if (!s) return <p className="muted pad">{t('loading')}</p>;
  if (!s.customer) return <p className="empty">{t('empty')}</p>;
  const c = s.customer;
  const Back = lang === 'ar' ? ArrowRight : ArrowLeft;
  return (
    <div className="page">
      <div className="page-head">
        <div className="title-row">
          <a className="icon-btn" href="#/t/customers" aria-label={t('back')}><Back size={20} /></a>
          <h1>{c.name}</h1><span className="tag num">{c.code}</span>
        </div>
        <div className="quick">
          {c.phone && <a className="btn wa" href={waLink(c.phone)} target="_blank" rel="noreferrer"><MessageCircle size={18} />{t('whatsapp')}</a>}
          {c.phone && <a className="btn" href={`tel:${c.phone}`}><Phone size={18} />{t('call')}</a>}
          <a className="btn" href={`#/doc/new/quote?c=${c.id}`}><FileText size={18} />{t('new_quote')}</a>
          <a className="btn" href={`#/doc/new/invoice?c=${c.id}`}><Receipt size={18} />{t('new_invoice')}</a>
        </div>
      </div>
      <p className="muted"><span className="num" dir="ltr">{c.phone}</span>{c.city && ` · ${enumLabel('city', c.city, lang)}`}{c.type && ` · ${enumLabel('customer_type', c.type, lang)}`}</p>
      <div className="tiles three">
        <div className="tile"><span className="tile-label">{t('invoiced')}</span><b className="num">{money(s.invoiced, lang)}</b></div>
        <div className="tile pos"><span className="tile-label">{t('paid')}</span><b className="num">{money(s.paid, lang)}</b></div>
        <div className={`tile ${s.balance > 0 ? 'hot' : ''}`}><span className="tile-label">{t('balance')}</span><b className="num">{money(s.balance, lang)}</b></div>
      </div>
      {s.unallocated > 0 && <p className="note warn">{t('unallocated')}: <b className="num">{money(s.unallocated, lang)}</b></p>}
      <section className="card">
        <h2>{lang === 'ar' ? 'المستندات' : 'Documents'}</h2>
        {s.documents.length === 0 ? <p className="muted">{t('empty')}</p> : (
          <ul className="plain rows">{s.documents.sort((a: Row, b: Row) => String(b.date).localeCompare(String(a.date))).map((d: Row) => {
            const [st, en] = docStatus(d);
            return <li key={d.id}><a href={`#/doc/${d.id}`}><span>{enumLabel('doc_type', d.type, lang)} <b className="num">{d.doc_number || '—'}</b></span><span className="num muted">{d.date}</span><Badge code={st} enumName={en} /><b className="num end">{money(d.total_value, lang)}</b></a></li>;
          })}</ul>
        )}
      </section>
      <section className="card">
        <h2>{t('payments')}</h2>
        {s.payments.length === 0 ? <p className="muted">{t('empty')}</p> : (
          <ul className="plain rows">{s.payments.map((p: Row) => (
            <li key={p.id} className={p.status === 'void' ? 'off' : ''}><span className="num">{p.receipt_no || t('legacy')}</span><span className="num muted">{p.date}</span><span>{enumLabel('payment_method', p.method, lang)}{p.invoice_number ? ` · ${p.invoice_number}` : ` · ${t('unallocated')}`}</span><b className="num end">{money(p.amount, lang)}</b></li>
          ))}</ul>
        )}
      </section>
      {s.bookings.length > 0 && (
        <section className="card">
          <h2>{pick(PERMISSIONS.bookings, lang)}</h2>
          <ul className="plain rows">{s.bookings.map((b: Row) => <li key={b.id}><span className="num">{b.date} {b.time}</span><span>{String(b.services || '').split(',').filter(Boolean).map((x) => enumLabel('service', x, lang)).join('، ')}</span><Badge code={b.status} enumName="booking_status" /></li>)}</ul>
        </section>
      )}
    </div>
  );
}
