import { useContext, useEffect, useState, type ReactNode } from 'react';
import { ENUMS, MONEY_FMT, enumLabel } from '@shared/model.js';
import { LangContext, pick, useT } from './i18n';
import { api, ApiError, type Row } from './api';
import type { Key } from './i18n';

export type FieldDef = {
  key: string; label: { ar: string; en: string }; type: string; enum?: string; required?: boolean; readonly?: boolean;
  list?: boolean; badge?: boolean; default?: string; showIf?: [string, string]; total?: boolean; ref?: string;
};

/* Lookups for link fields (customers, projects), cached for the session. */
const lookupCache: Record<string, Promise<Row[]>> = {};
export function useLookup(name: string | undefined) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!name || !['customers', 'projects'].includes(name)) return;
    (lookupCache[name] ||= api<Row[]>(`/lookup/${name}`).catch(() => [])).then(setRows);
  }, [name]);
  return rows;
}
export const refreshLookup = (name: string) => { delete lookupCache[name]; };
const refLabel = (r: Row) => [r.code, r.name].filter(Boolean).join(' · ');

/** Human message for an API error. */
export function errText(t: (k: Key) => string, e: unknown) {
  if (e instanceof ApiError) {
    const k = `err_${e.code}` as Key;
    try { const v = t(k); if (v) return v; } catch { /* no translation */ }
    if (e.code === 'exceeds_balance') return `${t('exceeds_balance')} (${e.body?.balance})`;
  }
  return t('error');
}

export const useLang = () => useContext(LangContext).lang;

export function money(n: unknown, lang: 'ar' | 'en') {
  return MONEY_FMT(n, lang);
}

const TONES: Record<string, string> = {
  new: 'gold', pending: 'gold', open: 'gold', contacted: 'blue', quoted: 'blue', confirmed: 'blue', planned: 'blue',
  in_progress: 'navy', active: 'green', booked: 'green', completed: 'green', delivered: 'green', done: 'green', accepted: 'green',
  lost: 'grey', cancelled: 'grey', closed: 'grey', rejected: 'red', inactive: 'grey', leave: 'blue',
};

export function Badge({ code, enumName }: { code: string; enumName: string }) {
  const lang = useLang();
  if (!code) return null;
  return <span className={`badge ${TONES[code] || 'grey'}`}>{enumLabel(enumName, code, lang)}</span>;
}

/** Read-only display of one field value. */
export function Value({ f, row }: { f: FieldDef; row: Row }) {
  const lang = useLang();
  const v = row[f.key];
  if (v === undefined || v === null || v === '') return <span className="muted">—</span>;
  if (f.badge && f.enum) return <Badge code={v} enumName={f.enum} />;
  if (f.type === 'select' && f.enum) return <>{enumLabel(f.enum, v, lang)}</>;
  if (f.type === 'multiselect' && f.enum) return <>{String(v).split(',').filter(Boolean).map((c) => enumLabel(f.enum!, c, lang)).join('، ')}</>;
  if (f.type === 'money') return <span className="num">{money(v, lang)}</span>;
  if (f.type === 'tel') return <a href={`tel:${v}`} className="num" dir="ltr">{v}</a>;
  if (f.type === 'url') return <a href={v} target="_blank" rel="noreferrer">↗</a>;
  if (f.type === 'ref') return <RefValue f={f} id={v} />;
  if (f.key === 'created_at') return <span className="num">{String(v).slice(0, 16).replace('T', ' ')}</span>;
  return <>{String(v)}</>;
}

function RefValue({ f, id }: { f: FieldDef; id: string }) {
  const rows = useLookup(f.ref);
  const r = rows.find((x) => x.id === id);
  if (f.ref === 'customers' && r) return <a href={`#/customer/${id}`}>{refLabel(r)}</a>;
  if (f.ref === 'documents') return <a href={`#/doc/${id}`}>↗</a>;
  return <>{r ? refLabel(r) : '—'}</>;
}

/** Editable input for one field. */
export function Input({ f, value, onChange }: { f: FieldDef; value: any; onChange: (v: any) => void }) {
  const lang = useLang();
  const t = useT();
  const id = `f-${f.key}`;
  const label = <label htmlFor={id}>{pick(f.label, lang)}{f.required && <b className="req"> *</b>}</label>;
  const refRows = useLookup(f.type === 'ref' && !f.readonly ? f.ref : undefined);
  if (f.readonly) return value ? <div className="field">{label}<div className="ro">{f.type === 'ref' ? <RefValue f={f} id={value} /> : String(value)}</div></div> : null;
  let control: ReactNode;
  if (f.type === 'ref') {
    control = (
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {refRows.map((r) => <option key={r.id} value={r.id}>{refLabel(r)}</option>)}
      </select>
    );
    return <div className="field">{label}{control}</div>;
  }
  if (f.type === 'select' && f.enum) {
    control = (
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={f.required}>
        <option value="">—</option>
        {Object.entries((ENUMS as any)[f.enum] as Record<string, { ar: string; en: string }>).map(([c, l]) => <option key={c} value={c}>{l[lang]}</option>)}
      </select>
    );
  } else if (f.type === 'multiselect' && f.enum) {
    const set = new Set(String(value || '').split(',').filter(Boolean));
    control = (
      <div className="chips" id={id}>
        {Object.entries((ENUMS as any)[f.enum] as Record<string, { ar: string; en: string }>).map(([c, l]) => (
          <button type="button" key={c} className={set.has(c) ? 'chip on' : 'chip'}
            onClick={() => { set.has(c) ? set.delete(c) : set.add(c); onChange([...set].join(',')); }}>{l[lang]}</button>
        ))}
      </div>
    );
  } else if (f.type === 'textarea') {
    control = <textarea id={id} rows={4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={f.required} />;
  } else {
    const type = ({ money: 'number', number: 'number', date: 'date', time: 'time', tel: 'tel', url: 'url', email: 'email' } as Record<string, string>)[f.type] || 'text';
    control = (
      <input id={id} type={type} value={value ?? ''} required={f.required} step={f.type === 'money' ? '0.01' : undefined}
        inputMode={f.type === 'money' ? 'decimal' : undefined} dir={['tel', 'money', 'url', 'email'].includes(f.type) ? 'ltr' : undefined}
        placeholder={f.required ? t('required') : undefined} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return <div className={`field ${f.type === 'textarea' || f.type === 'multiselect' ? 'wide' : ''}`}>{label}{control}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export const waLink = (phone: string, text = '') => {
  let p = String(phone).replace(/[^\d]/g, '');
  if (p.startsWith('05')) p = '966' + p.slice(1);
  else if (p.startsWith('5') && p.length === 9) p = '966' + p;
  return `https://wa.me/${p}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};
