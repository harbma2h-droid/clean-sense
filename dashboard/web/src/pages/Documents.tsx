import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { enumLabel } from '@shared/model.js';
import { api, type Row } from '../api';
import { useT } from '../i18n';
import { Badge, errText, money, useLang } from '../ui';
import { PaymentDialog } from './Doc';

export type DocKind = 'quote' | 'invoice' | 'contract';
const TITLE = { quote: 'quotes', invoice: 'invoices', contract: 'contracts' } as const;
const NEW = { quote: 'new_quote', invoice: 'new_invoice', contract: 'new_contract' } as const;

/** Status shown for a document: invoices show their collection state, quotes their workflow step. */
export function docStatus(d: Row): [string, string] {
  if (d.type === 'invoice') return [d.state || d.status, 'payment_state'];
  if (d.type === 'quote') return [d.status || d.quote_status || 'pending', 'quote_status'];
  if (d.type === 'contract') return [d.status || 'draft', 'contract_status'];
  return [d.status || '', 'invoice_status'];
}

export function Documents({ kind }: { kind: DocKind }) {
  const t = useT();
  const lang = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [paying, setPaying] = useState<Row | null>(null);
  const [msg, setMsg] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setRows(null);
    setStatus('');
    api<Row[]>('/sales/documents').then((all) => setRows(all.filter((d) => d.type === kind || (kind === 'invoice' && d.type === 'receipt')))).catch(() => setRows([]));
  }, [kind, reload]);
  // Quick review of legacy balances the old system never recorded as collected.
  const confirmDue = async (d: Row) => {
    try { await api(`/sales/documents/${d.id}/confirm-balance`, { method: 'POST', body: { review: 'confirmed_due' } }); setReload((n) => n + 1); setMsg(t('saved')); } catch (x) { setMsg(errText(t, x)); }
  };
  const reviewButtons = (d: Row) => d.state === 'unverified' && (
    <span className="row-actions" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
      <button className="ghost small" onClick={() => setPaying(d)}>{t('review_paid')}</button>
      <button className="ghost small" onClick={() => confirmDue(d)}>{t('review_due')}</button>
    </span>
  );

  // Receipts sit on the invoices page with their own statuses, so each chip keeps the list its label comes from.
  const counts = useMemo(() => {
    const c: Record<string, { n: number; list: string }> = {};
    for (const d of rows || []) { const [s, list] = docStatus(d); c[s] = { n: (c[s]?.n || 0) + 1, list }; }
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows || [])
      .filter((d) => !status || docStatus(d)[0] === status)
      .filter((d) => !n || [d.doc_number, d.customer_name, d.customer_phone, d.scope].some((v) => String(v || '').toLowerCase().includes(n)))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }, [rows, q, status]);

  const total = shown.reduce((s, d) => s + (d.state === 'void' || d.status === 'void' ? 0 : Number(d.total_value) || 0), 0);
  const balance = shown.reduce((s, d) => s + (d.type === 'invoice' && d.balance > 0 && !['void', 'draft'].includes(d.state) ? d.balance : 0), 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t(TITLE[kind])}</h1>
        <a className="primary" href={`#/doc/new/${kind}`}><Plus size={18} />{t(NEW[kind])}</a>
      </div>
      <div className="toolbar">
        <label className="search"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} /></label>
      </div>
      {Object.keys(counts).length > 1 && (
        <div className="chips filter">
          <button className={!status ? 'chip on' : 'chip'} onClick={() => setStatus('')}>{t('all')} <span className="num">{rows?.length}</span></button>
          {Object.entries(counts).map(([c, { n, list }]) => (
            <button key={c} className={status === c ? 'chip on' : 'chip'} onClick={() => setStatus(c)}>{enumLabel(list, c, lang)} <span className="num">{n}</span></button>
          ))}
        </div>
      )}
      {rows && (
        <div className="totals">
          <span>{t('total')}: <b className="num">{money(total, lang)}</b> <small className="muted">({shown.length})</small></span>
          {kind === 'invoice' && <span>{t('balance')}: <b className="num">{money(balance, lang)}</b></span>}
        </div>
      )}
      {kind === 'invoice' && (counts.unverified?.n || 0) > 0 && <p className="note warn">{t('review_note').replace('{n}', String(counts.unverified.n))}</p>}
      {msg && <p className="note">{msg}</p>}
      {!rows ? <p className="muted pad">{t('loading')}</p> : shown.length === 0 ? <p className="empty">{t('empty')}</p> : (
        <>
          <table className="grid">
            <thead><tr>
              <th>{lang === 'ar' ? 'الرقم' : 'No.'}</th><th>{t('date')}</th><th>{t('customer')}</th><th>{t('status')}</th>
              <th className="end">{t('grand_total')}</th>{kind === 'invoice' && <th className="end">{t('balance')}</th>}
            </tr></thead>
            <tbody>{shown.map((d) => {
              const [s, e] = docStatus(d);
              return (
                <tr key={d.id} onClick={() => { location.hash = `#/doc/${d.id}`; }} tabIndex={0} onKeyDown={(ev) => ev.key === 'Enter' && (location.hash = `#/doc/${d.id}`)}>
                  <td className="num">{d.doc_number || <span className="muted">{t('draft_no_number').split(' ')[0]}</span>}{d.legacy === 'yes' && <small className="tag">{t('legacy')}</small>}</td>
                  <td className="num">{d.date}</td>
                  <td className="clip">{d.customer_name}</td>
                  <td><Badge code={s} enumName={e} /></td>
                  <td className="num end">{money(d.total_value, lang)}</td>
                  {kind === 'invoice' && <td className="num end">{d.balance > 0 && d.state !== 'void' ? money(d.balance, lang) : '—'}{reviewButtons(d)}</td>}
                </tr>
              );
            })}</tbody>
          </table>
          <ul className="cards">{shown.map((d) => {
            const [s, e] = docStatus(d);
            return (
              <li key={d.id}><a href={`#/doc/${d.id}`}>
                <div className="card-top"><b className="clip">{d.customer_name}</b><Badge code={s} enumName={e} /></div>
                <small className="muted num">{d.doc_number || '—'} · {d.date}{d.legacy === 'yes' ? ` · ${t('legacy')}` : ''}</small>
                <div className="card-top">
                  <b className="num amount">{money(d.total_value, lang)}</b>
                  {kind === 'invoice' && d.balance > 0 && d.state !== 'void' && <small className="num">{t('balance')}: {money(d.balance, lang)}</small>}
                </div>
                {reviewButtons(d)}
              </a></li>
            );
          })}</ul>
        </>
      )}
      {paying && <PaymentDialog invoice={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); setReload((n) => n + 1); setMsg(t('saved')); }} />}
    </div>
  );
}
