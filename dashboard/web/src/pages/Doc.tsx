import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Trash2, Printer, MessageCircle, Check, Send, Undo2, X, FileCheck2, BadgeCheck, Ban, Wallet, ArrowRight, ArrowLeft } from 'lucide-react';
import { ENUMS, enumLabel } from '@shared/model.js';
import { computeTotals } from '@shared/finance.js';
import { api, type Row, type User } from '../api';
import { useT, type Key } from '../i18n';
import { Badge, Input, Modal, errText, money, refreshLookup, useLang, useLookup, waLink, type FieldDef } from '../ui';
import { docStatus, type DocKind } from './Documents';

type Item = { description: string; service: string; qty: number | string; unit_price: number | string };
const blankItem = (): Item => ({ description: '', service: '', qty: 1, unit_price: '' });
const today = () => new Date().toISOString().slice(0, 10);
const TYPE_TITLE: Record<string, Key> = { quote: 'quotes', invoice: 'invoices', contract: 'contracts', receipt: 'invoices' };

const f = (key: string, ar: string, en: string, type = 'text', extra: Partial<FieldDef> = {}): FieldDef => ({ key, label: { ar, en }, type, ...extra });
const FIELDS: Record<string, FieldDef[]> = {
  quote: [f('date', 'تاريخ العرض', 'Quote date', 'date'), f('valid_until', 'صالح حتى (اختياري)', 'Valid until (optional)', 'date'), f('project_id', 'المشروع', 'Project', 'ref', { ref: 'projects' }), f('duration', 'مدة التنفيذ', 'Duration'), f('payment_method', 'طريقة الدفع المتوقعة', 'Expected payment method', 'select', { enum: 'payment_method' }), f('language', 'لغة المستند', 'Document language', 'select', { enum: 'language' }), f('scope', 'نطاق العمل', 'Scope of work', 'textarea'), f('terms', 'الشروط', 'Terms', 'textarea'), f('notes', 'ملاحظات', 'Notes', 'textarea')],
  invoice: [f('date', 'تاريخ الفاتورة', 'Invoice date', 'date'), f('due_date', 'تاريخ الاستحقاق', 'Due date', 'date'), f('project_id', 'المشروع', 'Project', 'ref', { ref: 'projects' }), f('duration', 'مدة التنفيذ', 'Duration'), f('payment_method', 'طريقة الدفع', 'Payment method', 'select', { enum: 'payment_method' }), f('language', 'لغة المستند', 'Document language', 'select', { enum: 'language' }), f('scope', 'نطاق العمل', 'Scope of work', 'textarea'), f('terms', 'الشروط', 'Terms', 'textarea'), f('notes', 'ملاحظات', 'Notes', 'textarea')],
  contract: [f('date', 'تاريخ العقد', 'Contract date', 'date'), f('project_name', 'اسم المشروع', 'Project name'), f('project_id', 'المشروع', 'Project', 'ref', { ref: 'projects' }), f('start_date', 'تاريخ البداية', 'Start date', 'date'), f('end_date', 'تاريخ النهاية', 'End date', 'date'), f('language', 'لغة المستند', 'Document language', 'select', { enum: 'language' }), f('scope', 'نطاق العمل', 'Scope of work', 'textarea'), f('terms', 'الشروط', 'Terms', 'textarea'), f('notes', 'ملاحظات', 'Notes', 'textarea')],
};

export function Doc({ id, kind, user, customerId }: { id?: string; kind?: DocKind; user: User; customerId?: string }) {
  const t = useT();
  const lang = useLang();
  const isNew = !id;
  const [doc, setDoc] = useState<Row | null>(isNew ? { type: kind, status: 'draft', date: today(), language: lang, items: [blankItem()], discount: 0 } : null);
  const [edit, setEdit] = useState<Row>({});
  const [items, setItems] = useState<Item[]>([blankItem()]);
  const [customer, setCustomer] = useState<{ customer_id?: string; customer_name?: string; customer_phone?: string }>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [ask, setAsk] = useState<null | { title: string; run: (reason: string) => Promise<unknown> }>(null);
  const [paying, setPaying] = useState(false);

  const load = async (docId = id) => {
    const d = await api<Row>(`/sales/documents/${docId}`);
    setDoc(d);
    setEdit({});
    setItems(d.items_parsed?.length ? d.items_parsed.map((x: Row) => ({ ...x })) : [blankItem()]);
    setCustomer({ customer_id: d.customer_id, customer_name: d.customer_name, customer_phone: d.customer_phone });
  };
  useEffect(() => { if (id) load().catch(() => setDoc({ missing: true })); }, [id]);
  const customers = useLookup(isNew && customerId ? 'customers' : undefined);
  useEffect(() => {
    const c = customers.find((x) => x.id === customerId);
    if (c) setCustomer({ customer_id: c.id, customer_name: c.name, customer_phone: c.phone });
  }, [customers]);
  useEffect(() => { if (toast) { const h = setTimeout(() => setToast(''), 2500); return () => clearTimeout(h); } }, [toast]);

  const perms = user.permissions;
  if (!doc) return <p className="muted pad">{t('loading')}</p>;
  if (doc.missing) return <p className="empty">{t('empty')}</p>;

  const type: string = doc.type;
  const [status, statusEnum] = isNew ? ['draft', type === 'invoice' ? 'invoice_status' : type === 'quote' ? 'quote_status' : 'contract_status'] : docStatus(doc);
  const legacy = doc.legacy === 'yes';
  const editable = !legacy && (isNew || (type === 'invoice' ? doc.status === 'draft' : type === 'quote' ? ['draft', 'pending_approval', 'approved', 'sent'].includes(doc.status) : ['draft', 'active', ''].includes(doc.status || '')));
  const val = (k: string) => (edit[k] !== undefined ? edit[k] : doc[k]);
  const totals = computeTotals(items.map((it) => ({ ...it, qty: Number(it.qty) || 0, unit_price: Number(it.unit_price) || 0 })), Number(val('discount')) || 0);
  const shownTotal = type === 'contract' && !items.some((x) => Number(x.unit_price)) ? Number(val('price')) || 0 : editable ? totals.total : doc.total_value;
  const dirty = Object.keys(edit).length > 0 || JSON.stringify(items) !== JSON.stringify(doc.items_parsed?.length ? doc.items_parsed : [blankItem()]) || customer.customer_id !== doc.customer_id || customer.customer_name !== doc.customer_name;

  const run = async (fn: () => Promise<Row | void>, msg: string = t('saved')) => {
    setBusy(true);
    setErr('');
    try {
      const out = await fn();
      if (out && out.id && out.id !== doc.id) location.hash = `#/doc/${out.id}`;
      else await load(doc.id);
      setToast(msg);
    } catch (x) {
      setErr(errText(t, x));
    } finally {
      setBusy(false);
    }
  };

  const payload = () => ({
    ...edit,
    ...(customer.customer_id ? { customer_id: customer.customer_id } : { customer_name: customer.customer_name, customer_phone: customer.customer_phone }),
    items: items.filter((x) => x.description || Number(x.unit_price)).map((x) => ({ ...x, qty: Number(x.qty) || 0, unit_price: Number(x.unit_price) || 0 })),
    discount: Number(val('discount')) || 0,
    ...(type === 'contract' ? { price: Number(val('price')) || 0 } : {}),
    services: [...new Set(items.map((x) => x.service).filter(Boolean))].join(','),
  });

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (isNew) {
      setBusy(true);
      setErr('');
      try {
        const created = await api<Row>('/sales/documents', { method: 'POST', body: { type, date: val('date'), language: val('language'), ...payload() } });
        refreshLookup('customers');
        location.hash = `#/doc/${created.id}`;
      } catch (x) { setErr(errText(t, x)); setBusy(false); }
      return;
    }
    await run(() => api(`/sales/documents/${doc.id}`, { method: 'PATCH', body: payload() }));
  };
  const act = (action: string, body?: Row, msg?: string) => run(() => api(`/sales/documents/${doc.id}/${action}`, { method: 'POST', body: body || {} }), msg);
  const withReason = (title: string, action: string) => setAsk({ title, run: (reason) => act(action, { reason }) });

  const canSales = perms.includes('sales');
  const canFinance = perms.includes('finance');
  const canApprove = perms.includes('approve_quotes');
  const company = lang === 'ar' ? 'كلين سنس' : 'Clean Sense';
  const waText = type === 'quote'
    ? (doc.language === 'en' ? `Hello ${doc.customer_name}, here is ${company}'s quotation ${doc.doc_number} for ${money(doc.total_value, 'en')}. We're happy to answer any questions.` : `هلا ${doc.customer_name}، هذا عرض سعر ${company} رقم ${doc.doc_number} بقيمة ${money(doc.total_value, 'ar')}. حياك لأي استفسار.`)
    : (doc.language === 'en' ? `Hello ${doc.customer_name}, invoice ${doc.doc_number} from ${company}: ${money(doc.total_value, 'en')}${doc.balance > 0 ? `, balance due ${money(doc.balance, 'en')}` : ''}. Thank you.` : `هلا ${doc.customer_name}، فاتورة ${company} رقم ${doc.doc_number} بقيمة ${money(doc.total_value, 'ar')}${doc.balance > 0 ? `، المتبقي ${money(doc.balance, 'ar')}` : ''}. شاكرين لك.`);
  const Back = lang === 'ar' ? ArrowRight : ArrowLeft;
  const listRoute = type === 'quote' ? 'sales/quotes' : type === 'contract' ? 'sales/contracts' : 'sales/invoices';

  return (
    <div className="page doc-page">
      <div className="page-head">
        <div className="title-row">
          <a className="icon-btn" href={`#/${listRoute}`} aria-label={t('back')}><Back size={20} /></a>
          <h1>{isNew ? t(type === 'quote' ? 'new_quote' : type === 'invoice' ? 'new_invoice' : 'new_contract') : `${enumLabel('doc_type', type, lang)} ${doc.doc_number || ''}`}</h1>
          {!isNew && <Badge code={status} enumName={statusEnum} />}
          {legacy && <span className="tag">{t('legacy')}</span>}
        </div>
        {!isNew && (
          <div className="quick">
            <a className="btn" href={`#/print/${doc.id}`}><Printer size={18} />{t('print')}</a>
            {doc.customer_phone && doc.doc_number && <a className="btn wa" href={waLink(doc.customer_phone, waText)} target="_blank" rel="noreferrer"><MessageCircle size={18} />{t('act_send_wa')}</a>}
          </div>
        )}
      </div>

      {legacy && <p className="note">{t('legacy_record')}</p>}
      {doc.state === 'unverified' && <p className="note warn">{t('unverified_note')}</p>}

      {/* Workflow actions */}
      {!isNew && (
        <div className="actions">
          {type === 'quote' && <>
            {doc.status === 'draft' && canSales && <button className="primary" disabled={busy || dirty} onClick={() => act('submit')}><Send size={18} />{t('act_submit')}</button>}
            {['draft', 'pending_approval'].includes(doc.status) && canApprove && <button className="primary" disabled={busy || dirty} onClick={() => act('approve')}><BadgeCheck size={18} />{t('act_approve')}</button>}
            {['pending_approval', 'approved'].includes(doc.status) && canApprove && <button className="ghost" disabled={busy} onClick={() => act('return')}><Undo2 size={18} />{t('act_return')}</button>}
            {doc.status === 'approved' && <button className="primary" disabled={busy || dirty} onClick={() => act('send')}><Send size={18} />{t('act_send')}</button>}
            {['approved', 'sent', 'pending'].includes(status) && <button className="primary ok" disabled={busy || dirty} onClick={() => act('accept')}><Check size={18} />{t('act_accept')}</button>}
            {['approved', 'sent', 'pending'].includes(status) && <button className="ghost" disabled={busy} onClick={() => withReason(t('act_reject'), 'reject')}><X size={18} />{t('act_reject')}</button>}
            {status === 'accepted' && !doc.converted_to && canSales && <button className="primary" disabled={busy} onClick={() => act('to-invoice')}><FileCheck2 size={18} />{t('act_to_invoice')}</button>}
            {doc.converted_to && <button className="btn" onClick={() => openByNumber(doc.converted_to)}><FileCheck2 size={18} />{t('invoice')} {String(doc.converted_to).startsWith('INV') ? doc.converted_to : ''}</button>}
            {['draft', 'pending_approval', 'approved', 'sent', 'pending'].includes(status) && !legacy && <button className="danger" disabled={busy} onClick={() => act('cancel')}><Ban size={18} />{t('act_cancel')}</button>}
          </>}
          {type === 'invoice' && <>
            {doc.status === 'draft' && canSales && <button className="primary" disabled={busy || dirty} onClick={() => act('issue')}><BadgeCheck size={18} />{t('act_issue')}</button>}
            {['unpaid', 'partial', 'overdue', 'unverified'].includes(doc.state) && canFinance && <button className="primary ok" disabled={busy} onClick={() => setPaying(true)}><Wallet size={18} />{t('record_payment')}</button>}
            {doc.state === 'unverified' && canFinance && <button className="ghost" disabled={busy} onClick={() => act('confirm-balance', { review: 'confirmed_due' })}><Check size={18} />{t('act_confirm_due')}</button>}
            {doc.status !== 'void' && canFinance && <button className="danger" disabled={busy} onClick={() => withReason(t('act_void'), 'void')}><Ban size={18} />{t('act_void')}</button>}
            {doc.converted_from && <span className="muted">← {doc.converted_from}</span>}
          </>}
          {type === 'contract' && !legacy && <>
            {(doc.status === 'draft' || !doc.status) && <button className="primary" disabled={busy} onClick={() => act('activate')}>{t('act_activate')}</button>}
            {doc.status === 'active' && <button className="primary" disabled={busy} onClick={() => act('complete')}>{t('act_complete')}</button>}
          </>}
        </div>
      )}
      {type === 'quote' && ['approved', 'sent', 'accepted'].includes(status) && <p className="small muted">{t('accept_note')}</p>}
      {err && <p className="err" role="alert">{err}</p>}

      <form onSubmit={save} className="doc-form">
        <section className="card">
          <h2>{t('customer')}</h2>
          {editable ? <CustomerPicker value={customer} onChange={setCustomer} /> : (
            <p><a href={`#/customer/${doc.customer_id}`}><b>{doc.customer_name}</b></a> <span className="muted num" dir="ltr">{doc.customer_phone}</span></p>
          )}
        </section>

        <section className="card">
          <h2>{t('items')}</h2>
          {editable ? (
            <div className="items">
              {items.map((it, i) => (
                <div className="item-row" key={i}>
                  <textarea rows={2} placeholder={t('description')} aria-label={t('description')} value={it.description} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                  <select aria-label={t('service')} value={it.service} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, service: e.target.value } : x)))}>
                    <option value="">{t('service')}…</option>
                    {Object.entries(ENUMS.service as Record<string, { ar: string; en: string }>).map(([c, l]) => <option key={c} value={c}>{l[lang]}</option>)}
                  </select>
                  <input aria-label={t('qty')} type="number" inputMode="decimal" min="0" step="any" dir="ltr" value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                  <input aria-label={t('unit_price')} placeholder={t('unit_price')} type="number" inputMode="decimal" min="0" step="0.01" dir="ltr" value={it.unit_price} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, unit_price: e.target.value } : x)))} />
                  <span className="num line-total">{money((Number(it.qty) || 0) * (Number(it.unit_price) || 0), lang)}</span>
                  <button type="button" className="icon-btn" aria-label={t('delete')} onClick={() => setItems(items.length > 1 ? items.filter((_, j) => j !== i) : [blankItem()])}><Trash2 size={18} /></button>
                </div>
              ))}
              <button type="button" className="ghost small" onClick={() => setItems([...items, blankItem()])}><Plus size={16} />{t('add_item')}</button>
            </div>
          ) : doc.items_parsed?.length ? (
            <table className="mini">
              <thead><tr><th>{t('description')}</th><th>{t('qty')}</th><th>{t('unit_price')}</th><th className="end">{t('line_total')}</th></tr></thead>
              <tbody>{doc.items_parsed.map((x: Row, i: number) => (
                <tr key={i}><td><span className="pre">{x.description}</span>{x.service && <small className="muted"> · {enumLabel('service', x.service, lang)}</small>}</td><td className="num">{x.qty}</td><td className="num">{money(x.unit_price, lang)}</td><td className="num end">{money(Number(x.qty) * Number(x.unit_price), lang)}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="pre">{doc.scope || '—'}</p>}

          <dl className="sum">
            {editable && type !== 'contract' && <>
              <div><dt>{t('subtotal')}</dt><dd className="num">{money(totals.subtotal, lang)}</dd></div>
              <div><dt>{t('discount')}</dt><dd><input type="number" min="0" step="0.01" dir="ltr" inputMode="decimal" aria-label={t('discount')} value={val('discount') ?? 0} onChange={(e) => setEdit({ ...edit, discount: e.target.value })} /></dd></div>
            </>}
            {editable && type === 'contract' && !items.some((x) => Number(x.unit_price)) && (
              <div><dt>{lang === 'ar' ? 'قيمة العقد' : 'Contract value'}</dt><dd><input type="number" min="0" step="0.01" dir="ltr" value={val('price') ?? ''} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></dd></div>
            )}
            {!editable && Number(doc.discount) > 0 && <div><dt>{t('discount')}</dt><dd className="num">{money(doc.discount, lang)}</dd></div>}
            <div className="big"><dt>{t('grand_total')}</dt><dd className="num">{money(shownTotal, lang)}</dd></div>
            {type === 'invoice' && !isNew && doc.status !== 'draft' && <>
              <div><dt>{t('paid')}</dt><dd className="num">{money(doc.paid, lang)}</dd></div>
              <div className={doc.balance > 0 ? 'due' : ''}><dt>{t('balance')}</dt><dd className="num">{money(doc.balance, lang)}</dd></div>
            </>}
          </dl>
        </section>

        <section className="card">
          <div className="form">
            {FIELDS[type === 'receipt' ? 'invoice' : type].map((fd) => (editable || (type === 'invoice' && doc.status !== 'void' && ['notes', 'due_date'].includes(fd.key) && !legacy)
              ? <Input key={fd.key} f={fd} value={val(fd.key)} onChange={(v) => setEdit({ ...edit, [fd.key]: v })} />
              : <Input key={fd.key} f={{ ...fd, readonly: true }} value={fd.type === 'select' && fd.enum ? enumLabel(fd.enum, doc[fd.key], lang) : doc[fd.key]} onChange={() => {}} />))}
          </div>
        </section>

        {(editable || (type === 'invoice' && Object.keys(edit).length > 0)) && (
          <div className="sticky-save">
            {type === 'quote' && ['approved', 'sent'].includes(doc.status) && dirty && <small className="muted">{lang === 'ar' ? 'تعديل العرض بعد اعتماده يرجعه مسودة ويحتاج اعتماد جديد.' : 'Editing an approved quote returns it to draft for re-approval.'}</small>}
            <span className="grow" />
            <button className="primary" disabled={busy || (!isNew && !dirty)}>{t('save')}</button>
          </div>
        )}
      </form>

      {type === 'invoice' && !isNew && doc.payments?.length > 0 && (
        <section className="card">
          <h2>{t('payments')}</h2>
          <ul className="pay-list">{doc.payments.map((p: Row) => (
            <li key={p.id} className={p.status === 'void' ? 'off' : ''}>
              <span className="num">{p.receipt_no || t('legacy')}</span>
              <span className="num">{p.date}</span>
              <span>{enumLabel('payment_method', p.method, lang)}</span>
              <b className="num">{money(p.amount, lang)}</b>
              {p.status === 'void' ? <Badge code="void" enumName="payment_status" /> : canFinance && <button className="ghost small" onClick={() => setAsk({ title: t('void_payment'), run: (reason) => run(() => api(`/payments/${p.id}/void`, { method: 'POST', body: { reason } })) })}>{t('void_payment')}</button>}
            </li>
          ))}</ul>
        </section>
      )}

      {!isNew && <Timeline doc={doc} />}

      {paying && <PaymentDialog invoice={doc} onClose={() => setPaying(false)} onDone={() => { setPaying(false); load(doc.id); setToast(t('saved')); }} />}
      {ask && <ReasonDialog title={ask.title} onClose={() => setAsk(null)} onOk={async (r) => { await ask.run(r); setAsk(null); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

// converted_to holds an invoice id (draft) or its number once issued.
async function openByNumber(v: string) {
  if (!String(v).startsWith('INV')) { location.hash = `#/doc/${v}`; return; }
  const all = await api<Row[]>('/sales/documents');
  const d = all.find((x) => x.doc_number === v && x.type === 'invoice');
  if (d) location.hash = `#/doc/${d.id}`;
}

function Timeline({ doc }: { doc: Row }) {
  const t = useT();
  const lang = useLang();
  const at = (s: string) => String(s || '').slice(0, 16).replace('T', ' ');
  const rows: [string, string, string][] = [
    [lang === 'ar' ? 'أُنشئ' : 'Created', doc.created_by, doc.created_at],
    [t('act_submit'), doc.submitted_by, doc.submitted_by ? ' ' : ''],
    [t('act_approve'), doc.approved_by, doc.approved_at],
    [t('act_send'), '', doc.sent_at],
    [lang === 'ar' ? 'رد العميل' : 'Customer decision', doc.reject_reason || '', doc.decided_at],
    [t('act_issue'), doc.issued_by, doc.issued_at],
    [t('act_void'), doc.void_reason, doc.voided_at],
  ].filter((r) => r[2]) as [string, string, string][];
  if (!rows.length) return null;
  return (
    <section className="card">
      <h2>{t('history')}</h2>
      <ol className="timeline">{rows.map(([label, who, when], i) => <li key={i}><b>{label}</b> <span className="muted">{who}</span> <span className="num muted">{at(when)}</span></li>)}</ol>
    </section>
  );
}

/** Pick an existing customer (search by name / phone / number) or enter a new one. */
function CustomerPicker({ value, onChange }: { value: { customer_id?: string; customer_name?: string; customer_phone?: string }; onChange: (v: any) => void }) {
  const t = useT();
  const all = useLookup('customers');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? all.filter((c) => [c.name, c.phone, c.code].some((v) => String(v || '').toLowerCase().includes(n))).slice(0, 8) : [];
  }, [q, all]);
  if (value.customer_id) {
    return (
      <div className="picked">
        <b>{value.customer_name}</b> <span className="muted num" dir="ltr">{value.customer_phone}</span>
        <button type="button" className="ghost small" onClick={() => onChange({})}>{t('edit')}</button>
      </div>
    );
  }
  return (
    <div className="picker">
      <input placeholder={t('pick_customer')} value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); onChange({ customer_name: e.target.value, customer_phone: value.customer_phone }); }} />
      {open && matches.length > 0 && (
        <ul className="suggest">{matches.map((c) => (
          <li key={c.id}><button type="button" onClick={() => { onChange({ customer_id: c.id, customer_name: c.name, customer_phone: c.phone }); setOpen(false); setQ(''); }}>
            <b>{c.name}</b> <small className="muted num" dir="ltr">{c.code} · {c.phone}</small>
          </button></li>
        ))}</ul>
      )}
      {q && <input className="mt" type="tel" dir="ltr" placeholder={`${t('new_customer')} — ${t('call')}: 05xxxxxxxx`} value={value.customer_phone || ''} onChange={(e) => onChange({ customer_name: q, customer_phone: e.target.value })} />}
    </div>
  );
}

export function PaymentDialog({ invoice, onClose, onDone }: { invoice?: Row; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const lang = useLang();
  const [d, setD] = useState<Row>({ amount: invoice ? invoice.balance : '', date: today(), method: invoice?.payment_method || 'bank_transfer', reference: '', notes: '' });
  const [customer, setCustomer] = useState<Row>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/payments', { method: 'POST', body: { ...d, ...(invoice ? { invoice_id: invoice.id } : customer) } });
      onDone();
    } catch (x) { setErr(errText(t, x)); setBusy(false); }
  };
  return (
    <Modal title={`${t('record_payment')}${invoice ? ` — ${invoice.doc_number}` : ''}`} onClose={onClose}>
      <form onSubmit={submit}>
        {invoice && <p className="muted">{t('balance')}: <b className="num">{money(invoice.balance, lang)}</b></p>}
        <div className="form">
          {!invoice && <div className="field wide"><label>{t('customer')}</label><CustomerPicker value={customer} onChange={setCustomer} /></div>}
          <div className="field"><label htmlFor="pa">{t('amount')}</label><input id="pa" type="number" min="0.01" step="0.01" dir="ltr" inputMode="decimal" required value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} /></div>
          <div className="field"><label htmlFor="pd">{t('date')}</label><input id="pd" type="date" required max={today()} value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
          <div className="field"><label htmlFor="pm">{t('method')}</label>
            <select id="pm" value={d.method} onChange={(e) => setD({ ...d, method: e.target.value })}>{Object.entries(ENUMS.payment_method as Record<string, { ar: string; en: string }>).map(([c, l]) => <option key={c} value={c}>{l[lang]}</option>)}</select></div>
          <div className="field"><label htmlFor="pr">{t('reference')}</label><input id="pr" value={d.reference} onChange={(e) => setD({ ...d, reference: e.target.value })} /></div>
          <div className="field wide"><label htmlFor="pn">{t('notes')}</label><textarea id="pn" rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></div>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="modal-foot"><span className="grow" /><button type="button" className="ghost" onClick={onClose}>{t('cancel')}</button><button className="primary" disabled={busy}>{t('save')}</button></div>
      </form>
    </Modal>
  );
}

export function ReasonDialog({ title, onClose, onOk }: { title: string; onClose: () => void; onOk: (reason: string) => Promise<void> }) {
  const t = useT();
  const [r, setR] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (r.trim()) onOk(r.trim()); }}>
        <div className="field"><label htmlFor="rs">{t('reason')}</label><textarea id="rs" rows={3} required value={r} onChange={(e) => setR(e.target.value)} placeholder={t('reason_required')} /></div>
        <div className="modal-foot"><span className="grow" /><button type="button" className="ghost" onClick={onClose}>{t('cancel')}</button><button className="danger" disabled={!r.trim()}>{title}</button></div>
      </form>
    </Modal>
  );
}

