import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Link2 } from 'lucide-react';
import { enumLabel } from '@shared/model.js';
import { api, type Row } from '../api';
import { useT } from '../i18n';
import { Badge, Modal, errText, money, useLang } from '../ui';
import { PaymentDialog, ReasonDialog } from './Doc';

export function Payments() {
  const t = useT();
  const lang = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'' | 'unallocated' | 'void'>('');
  const [month, setMonth] = useState('');
  const [adding, setAdding] = useState(false);
  const [allocating, setAllocating] = useState<Row | null>(null);
  const [voiding, setVoiding] = useState<Row | null>(null);
  const [err, setErr] = useState('');

  const load = () => api<Row[]>('/payments').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows || [])
      .filter((p) => !month || String(p.date).startsWith(month))
      .filter((p) => (filter === 'unallocated' ? !p.invoice_id && p.status !== 'void' : filter === 'void' ? p.status === 'void' : true))
      .filter((p) => !n || [p.receipt_no, p.customer_name, p.invoice_number, p.reference, p.notes].some((v) => String(v || '').toLowerCase().includes(n)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [rows, q, filter, month]);
  const total = shown.filter((p) => p.status !== 'void').reduce((s, p) => s + Number(p.amount), 0);
  const unallocated = (rows || []).filter((p) => !p.invoice_id && p.status !== 'void');

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('payments')}</h1>
        <button className="primary" onClick={() => setAdding(true)}><Plus size={18} />{t('record_payment')}</button>
      </div>
      {unallocated.length > 0 && (
        <p className="note warn">
          {lang === 'ar' ? `فيه ${unallocated.length} دفعة غير مربوطة بفاتورة بمجموع ${money(unallocated.reduce((s, p) => s + Number(p.amount), 0), lang)}. اربطها بفواتيرها عشان تنضبط أرصدة العملاء.` : `${unallocated.length} payment(s) totalling ${money(unallocated.reduce((s, p) => s + Number(p.amount), 0), lang)} are not linked to an invoice. Link them so customer balances are right.`}
        </p>
      )}
      <div className="toolbar">
        <label className="search"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} /></label>
        <label className="month"><input type="month" aria-label={t('month')} value={month} onChange={(e) => setMonth(e.target.value)} /></label>
      </div>
      <div className="chips filter">
        <button className={!filter ? 'chip on' : 'chip'} onClick={() => setFilter('')}>{t('all')}</button>
        <button className={filter === 'unallocated' ? 'chip on' : 'chip'} onClick={() => setFilter('unallocated')}>{t('unallocated')} <span className="num">{unallocated.length}</span></button>
        <button className={filter === 'void' ? 'chip on' : 'chip'} onClick={() => setFilter('void')}>{enumLabel('payment_status', 'void', lang)}</button>
      </div>
      <div className="totals"><span>{t('total')}: <b className="num">{money(total, lang)}</b> <small className="muted">({shown.length})</small></span></div>
      {err && <p className="err">{err}</p>}
      {!rows ? <p className="muted pad">{t('loading')}</p> : shown.length === 0 ? <p className="empty">{t('empty')}</p> : (
        <ul className="cards always">{shown.map((p) => (
          <li key={p.id} className={p.status === 'void' ? 'off' : ''}><div className="pay-card">
            <div className="card-top">
              <b className="num">{money(p.amount, lang)}</b>
              {p.status === 'void' ? <Badge code="void" enumName="payment_status" /> : !p.invoice_id ? <span className="badge gold">{t('unallocated')}</span> : null}
            </div>
            <small className="muted">
              <span className="num">{p.receipt_no || t('legacy')}</span> · <span className="num">{p.date}</span> · {enumLabel('payment_method', p.method, lang)} · {p.customer_name}
              {p.reference && <> · <span className="num">{p.reference}</span></>}
            </small>
            {p.notes && <small className="pre">{p.notes}</small>}
            <div className="row-actions">
              {p.invoice_id && <a className="ghost small" href={`#/doc/${p.invoice_id}`}>{t('invoice')} {p.invoice_number}</a>}
              {!p.invoice_id && p.status !== 'void' && <button className="ghost small" onClick={() => setAllocating(p)}><Link2 size={16} />{t('allocate')}</button>}
              {p.status !== 'void' && <button className="ghost small" onClick={() => setVoiding(p)}>{t('void_payment')}</button>}
              {p.status === 'void' && <small className="muted">{t('reason')}: {p.void_reason}</small>}
            </div>
          </div></li>
        ))}</ul>
      )}
      {adding && <PaymentDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
      {allocating && <AllocateDialog payment={allocating} onClose={() => setAllocating(null)} onDone={() => { setAllocating(null); load(); }} />}
      {voiding && <ReasonDialog title={t('void_payment')} onClose={() => setVoiding(null)} onOk={async (reason) => {
        try { await api(`/payments/${voiding.id}/void`, { method: 'POST', body: { reason } }); setVoiding(null); load(); } catch (x) { setErr(errText(t, x)); setVoiding(null); }
      }} />}
    </div>
  );
}

function AllocateDialog({ payment, onClose, onDone }: { payment: Row; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const lang = useLang();
  const [invoices, setInvoices] = useState<Row[]>([]);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    api<Row[]>('/sales/documents').then((all) => setInvoices(all.filter((d) => d.type === 'invoice' && d.balance >= Number(payment.amount) - 0.001 && ['unpaid', 'partial', 'overdue', 'unverified'].includes(d.state))
      // Most likely matches first: same customer, then same amount, then closest date.
      .sort((a, b) => Number(b.customer_id === payment.customer_id) - Number(a.customer_id === payment.customer_id) || Number(b.balance === Number(payment.amount)) - Number(a.balance === Number(payment.amount)) || Math.abs(Date.parse(a.date) - Date.parse(payment.date)) - Math.abs(Date.parse(b.date) - Date.parse(payment.date)))));
  }, []);
  const save = async () => {
    try { await api(`/payments/${payment.id}/allocate`, { method: 'POST', body: { invoice_id: pick } }); onDone(); } catch (x) { setErr(errText(t, x)); }
  };
  return (
    <Modal title={`${t('allocate')} — ${money(payment.amount, lang)}`} onClose={onClose}>
      <p className="muted">{payment.customer_name} · <span className="num">{payment.date}</span>{payment.notes ? ` · ${payment.notes}` : ''}</p>
      <ul className="choose">{invoices.map((d) => (
        <li key={d.id}><label>
          <input type="radio" name="inv" checked={pick === d.id} onChange={() => setPick(d.id)} />
          <span><b className="num">{d.doc_number}</b> · {d.customer_name} · <span className="num">{d.date}</span><br /><small className="muted">{t('balance')}: <span className="num">{money(d.balance, lang)}</span> {d.state === 'unverified' && `· ${enumLabel('payment_state', 'unverified', lang)}`}</small></span>
        </label></li>
      ))}</ul>
      {invoices.length === 0 && <p className="empty">{t('empty')}</p>}
      {err && <p className="err">{err}</p>}
      <div className="modal-foot"><span className="grow" /><button className="ghost" onClick={onClose}>{t('cancel')}</button><button className="primary" disabled={!pick} onClick={save}>{t('allocate')}</button></div>
    </Modal>
  );
}
