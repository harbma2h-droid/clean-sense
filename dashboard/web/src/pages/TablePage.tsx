import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, Printer, MessageCircle, Phone, CalendarPlus, FileCheck2 } from 'lucide-react';
import { TABLES, enumLabel } from '@shared/model.js';
import { api, ApiError, type Row } from '../api';
import { pick, useT } from '../i18n';
import { Badge, Input, Modal, Value, money, useLang, waLink, type FieldDef } from '../ui';

type TableDef = { perm: string; label: { ar: string; en: string }; title: string; sub: string[]; sort: string; printable?: boolean; fields: FieldDef[] };

export function TablePage({ table, month, embedded }: { table: string; month?: string; embedded?: boolean }) {
  const def = (TABLES as any)[table] as TableDef;
  const t = useT();
  const lang = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [toast, setToast] = useState('');

  const load = () => api<Row[]>(`/data/${table}`).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, [table]);
  useEffect(() => { if (toast) { const h = setTimeout(() => setToast(''), 2500); return () => clearTimeout(h); } }, [toast]);

  const badgeField = def.fields.find((f) => f.badge);
  const listFields = def.fields.filter((f) => f.list);
  const totalFields = def.fields.filter((f) => f.total);

  const shown = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !month || String(r.date || '').startsWith(month))
      .filter((r) => !status || r[badgeField!.key] === status)
      .filter((r) => !needle || def.fields.some((f) => {
        const v = r[f.key];
        if (!v) return false;
        const text = f.enum ? `${v} ${String(v).split(',').map((c) => enumLabel(f.enum!, c, lang)).join(' ')}` : String(v);
        return text.toLowerCase().includes(needle);
      }))
      .sort((a, b) => String(b[def.sort] || b.created_at || '').localeCompare(String(a[def.sort] || a.created_at || '')));
  }, [rows, q, status, month, lang]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    if (badgeField) for (const r of rows || []) c[r[badgeField.key]] = (c[r[badgeField.key]] || 0) + 1;
    return c;
  }, [rows]);

  const blank = () => Object.fromEntries(def.fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default]));

  return (
    <div className={embedded ? '' : 'page'}>
      {!embedded && (
        <div className="page-head">
          <h1>{pick(def.label, lang)}</h1>
          <button className="primary" onClick={() => setEditing(blank())}><Plus size={18} />{t('add')}</button>
        </div>
      )}
      <div className="toolbar">
        <label className="search"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} /></label>
        {embedded && <button className="primary" onClick={() => setEditing(blank())}><Plus size={18} />{t('add')}</button>}
      </div>
      {badgeField && Object.keys(statusCounts).length > 1 && (
        <div className="chips filter">
          <button className={!status ? 'chip on' : 'chip'} onClick={() => setStatus('')}>{t('all')} <span className="num">{rows?.length}</span></button>
          {Object.entries(statusCounts).map(([c, n]) => (
            <button key={c} className={status === c ? 'chip on' : 'chip'} onClick={() => setStatus(c)}>{enumLabel(badgeField.enum!, c, lang)} <span className="num">{n}</span></button>
          ))}
        </div>
      )}

      {totalFields.length > 0 && rows && (
        <div className="totals">{totalFields.map((f) => (
          <span key={f.key}>{t('total')}: <b className="num">{money(shown.reduce((s, r) => s + (Number(r[f.key]) || 0), 0), lang)}</b> <small className="muted">({shown.length})</small></span>
        ))}</div>
      )}

      {!rows ? <p className="muted pad">{t('loading')}</p> : shown.length === 0 ? <p className="empty">{t('empty')}</p> : (
        <>
          <table className="grid">
            <thead><tr>{listFields.map((f) => <th key={f.key}>{pick(f.label, lang)}</th>)}</tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id} onClick={() => setEditing(r)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(r)}>
                {listFields.map((f) => <td key={f.key} className={f.key === 'notes' ? 'clip' : ''}><Value f={f} row={r} /></td>)}
              </tr>
            ))}</tbody>
          </table>
          <ul className="cards">{shown.map((r) => (
            <li key={r.id}><button onClick={() => setEditing(r)}>
              <div className="card-top">
                <b className="clip">{r[def.title] || '—'}</b>
                {badgeField && <Badge code={r[badgeField.key]} enumName={badgeField.enum!} />}
              </div>
              <small className="muted">{def.sub.map((k) => { const f = def.fields.find((x) => x.key === k); return f && r[k] ? (f.enum ? enumLabel(f.enum, r[k], lang) : r[k]) : null; }).filter(Boolean).join(' · ')}</small>
              {totalFields.map((f) => <b key={f.key} className="num amount">{money(r[f.key], lang)}</b>)}
              {table === 'documents' && <b className="num amount">{money(r.price, lang)}</b>}
            </button></li>
          ))}</ul>
        </>
      )}

      {editing && (
        <Editor table={table} def={def} row={editing} onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setToast(msg); load(); }} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Editor({ table, def, row, onClose, onSaved }: { table: string; def: TableDef; row: Row; onClose: () => void; onSaved: (msg: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [data, setData] = useState<Row>(row);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const isNew = !row.id;
  const visible = def.fields.filter((f) => !f.showIf || data[f.showIf[0]] === f.showIf[1]).filter((f) => !(isNew && f.readonly));

  const run = async (fn: () => Promise<unknown>, msg = t('saved')) => {
    setBusy(true);
    setErr('');
    try { await fn(); onSaved(msg); } catch (x) {
      const fields = x instanceof ApiError && x.body?.fields;
      setErr(fields ? fields.map((s: string) => { const f = def.fields.find((ff) => ff.key === s.split(':')[0]); return f ? pick(f.label, lang) : s; }).join('، ') + ' — ' + t('required') : t('error'));
    } finally { setBusy(false); }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const body = Object.fromEntries(def.fields.filter((f) => !f.readonly && data[f.key] !== row[f.key]).map((f) => [f.key, data[f.key] ?? '']));
    if (isNew) return run(() => api(`/data/${table}`, { method: 'POST', body: data }));
    if (!Object.keys(body).length) return onClose();
    return run(() => api(`/data/${table}/${row.id}`, { method: 'PATCH', body }));
  };

  const remove = () => confirm(t('confirm_delete')) && run(() => api(`/data/${table}/${row.id}`, { method: 'DELETE' }));

  const quoteToInvoice = () => run(() => api(`/data/documents/${row.id}/to-invoice`, { method: 'POST' }));

  const phone = data.phone || data.customer_phone;
  const title = isNew ? `${t('add')} — ${pick(def.label, lang)}` : String(row.doc_number || row[def.title] || row.id);

  return (
    <Modal title={title} onClose={onClose}>
      {!isNew && (
        <div className="quick">
          {phone && <a className="btn wa" href={waLink(phone, table === 'leads' ? `${lang === 'ar' ? 'هلا' : 'Hi'} ${row.customer_name || ''}، ${lang === 'ar' ? 'معك كلين سنس بخصوص طلبك رقم' : 'Clean Sense here about your request'} ${row.id}` : '')} target="_blank" rel="noreferrer"><MessageCircle size={18} />{t('whatsapp')}</a>}
          {phone && <a className="btn" href={`tel:${phone}`}><Phone size={18} />{t('call')}</a>}
          {table === 'leads' && !row.booking_id && <button type="button" className="btn" disabled={busy} onClick={() => run(() => api(`/data/leads/${row.id}/convert`, { method: 'POST' }), t('converted'))}><CalendarPlus size={18} />{t('convert_booking')}</button>}
          {def.printable && <a className="btn" href={`#/doc/${row.id}`}><Printer size={18} />{t('print')}</a>}
          {table === 'documents' && row.type === 'quote' && !row.converted_to && <button type="button" className="btn" disabled={busy} onClick={quoteToInvoice}><FileCheck2 size={18} />{lang === 'ar' ? 'تحويل لفاتورة' : 'Convert to invoice'}</button>}
        </div>
      )}
      <form onSubmit={save}>
        <div className="form">{visible.map((f) => <Input key={f.key} f={f} value={data[f.key]} onChange={(v) => setData({ ...data, [f.key]: v })} />)}</div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="modal-foot">
          {!isNew && <button type="button" className="danger" onClick={remove} disabled={busy}>{t('delete')}</button>}
          <span className="grow" />
          <button type="button" className="ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="primary" disabled={busy}>{t('save')}</button>
        </div>
      </form>
    </Modal>
  );
}
