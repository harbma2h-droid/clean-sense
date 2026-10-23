import { useEffect, useState } from 'react';
import { Plus, Eye, EyeOff } from 'lucide-react';
import { ENUMS, SETTINGS_SPEC, SETTINGS_GROUPS, EDITABLE_LISTS } from '@shared/model.js';
import { api, type Row } from '../api';
import { useT, type Key } from '../i18n';
import { errText, useLang } from '../ui';

type ListItem = { code: string; ar: string; en: string; hidden?: boolean };

/** Owner settings: company details, document defaults, WhatsApp messages and editable lists. */
export function Settings({ onSaved }: { onSaved: (company: Record<string, string>) => void }) {
  const t = useT();
  const lang = useLang();
  const [orig, setOrig] = useState<Record<string, string> | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [lists, setLists] = useState<Record<string, ListItem[]>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadLists = (company: Record<string, string>) => {
    const out: Record<string, ListItem[]> = {};
    for (const name of EDITABLE_LISTS) {
      let custom: ListItem[] = [];
      try { custom = JSON.parse(company[`list.${name}`] || '[]'); } catch { custom = []; }
      const hidden = new Set(custom.filter((c) => c.hidden).map((c) => c.code));
      // Every current item (built-in and added), with its hidden flag.
      out[name] = Object.entries((ENUMS as any)[name] as Record<string, { ar: string; en: string }>).map(([code, l]) => ({ code, ar: l.ar, en: l.en, hidden: hidden.has(code) }));
    }
    setLists(out);
  };
  useEffect(() => { api<Record<string, string>>('/settings').then((c) => { setOrig(c); setVals(c); loadLists(c); }).catch(() => setOrig({})); }, []);
  if (!orig) return <p className="muted pad">{t('loading')}</p>;

  const save = async () => {
    setErr('');
    setMsg('');
    const body: Record<string, string> = {};
    for (const s of SETTINGS_SPEC) if ((vals[s.key] ?? '') !== (orig[s.key] ?? '')) body[s.key] = vals[s.key] ?? '';
    for (const name of EDITABLE_LISTS) {
      // Store only what differs from the built-in list: added items and hidden flags.
      const builtIn = new Set(Object.keys(BUILT_IN[name]));
      const custom = lists[name].filter((it) => !builtIn.has(it.code) || it.hidden || it.ar !== BUILT_IN[name][it.code]?.ar || it.en !== BUILT_IN[name][it.code]?.en);
      const next = JSON.stringify(custom.map(({ code, ar, en, hidden }) => ({ code, ar, en, hidden: !!hidden })));
      if (next !== (orig[`list.${name}`] || '[]')) body[`list.${name}`] = next;
    }
    if (!Object.keys(body).length) return;
    try {
      const company = await api<Record<string, string>>('/settings', { method: 'PUT', body });
      setOrig(company);
      setVals(company);
      onSaved(company);
      setMsg(t('saved'));
    } catch (x) { setErr(errText(t, x)); }
  };

  return (
    <div className="page settings">
      <div className="page-head"><h1>{t('settings')}</h1><button className="primary" onClick={save}>{t('save')}</button></div>
      {msg && <p className="note">{msg}</p>}
      {err && <p className="err">{err}</p>}
      {Object.entries(SETTINGS_GROUPS as Record<string, { ar: string; en: string }>).map(([g, label]) => (
        <section className="card" key={g}>
          <h2>{label[lang]}</h2>
          {g === 'messages' && <p className="small muted">{lang === 'ar' ? 'تقدر تستخدم: {name} اسم العميل، {number} رقم المستند، {total} المبلغ، {balance} المتبقي، {company} اسم المنشأة.' : 'Placeholders: {name}, {number}, {total}, {balance}, {company}.'}</p>}
          <div className="form">
            {SETTINGS_SPEC.filter((s) => s.group === g).map((s) => (
              <div key={s.key} className={`field ${s.type === 'textarea' ? 'wide' : ''}`}>
                <label htmlFor={s.key}>{lang === 'ar' ? s.ar : s.en}</label>
                {s.type === 'textarea' ? <textarea id={s.key} rows={3} value={vals[s.key] || ''} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />
                  : s.type === 'yes_no' ? (
                    <select id={s.key} value={vals[s.key] || 'no'} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })}>
                      <option value="yes">{lang === 'ar' ? 'نعم' : 'Yes'}</option><option value="no">{lang === 'ar' ? 'لا' : 'No'}</option>
                    </select>
                  ) : <input id={s.key} type={s.type === 'number' ? 'number' : 'text'} dir={/phone|email|website|iban|unified|days/.test(s.key) ? 'ltr' : undefined} value={vals[s.key] || ''} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />}
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="card">
        <h2>{t('lists')}</h2>
        <p className="small muted">{t('lists_hint')}</p>
        {EDITABLE_LISTS.map((name: string) => <ListEditor key={name} name={name} items={lists[name] || []} onChange={(items) => setLists({ ...lists, [name]: items })} />)}
      </section>
      <div className="sticky-save"><span className="grow" /><button className="primary" onClick={save}>{t('save')}</button></div>
    </div>
  );
}

// Snapshot of the built-in lists, taken before any owner changes are applied.
const BUILT_IN: Record<string, Record<string, { ar: string; en: string }>> = {};
for (const name of EDITABLE_LISTS) BUILT_IN[name] = { ...(ENUMS as any)[name] };

function ListEditor({ name, items, onChange }: { name: string; items: ListItem[]; onChange: (items: ListItem[]) => void }) {
  const t = useT();
  const lang = useLang();
  const [ar, setAr] = useState('');
  const [en, setEn] = useState('');
  const add = () => {
    if (!ar.trim() && !en.trim()) return;
    const base = (en || ar).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'item';
    let code = /^[a-z]/.test(base) ? base : `x_${base}`;
    while (items.some((i) => i.code === code)) code = `${code}_2`;
    if (code.length < 2) code = `item_${items.length + 1}`;
    onChange([...items, { code, ar: ar.trim() || en.trim(), en: en.trim() || ar.trim() }]);
    setAr('');
    setEn('');
  };
  return (
    <details className="list-editor">
      <summary><b>{t(`list_${name}` as Key)}</b> <span className="muted num">({items.filter((i) => !i.hidden).length})</span></summary>
      <ul className="plain">{items.map((it, i) => (
        <li key={it.code} className={`list-row ${it.hidden ? 'off' : ''}`}>
          <input aria-label={t('name_ar')} value={it.ar} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, ar: e.target.value } : x)))} />
          <input aria-label={t('name_en')} dir="ltr" value={it.en} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)))} />
          <button type="button" className="ghost small" onClick={() => onChange(items.map((x, j) => (j === i ? { ...x, hidden: !x.hidden } : x)))}>
            {it.hidden ? <><Eye size={14} />{t('show')}</> : <><EyeOff size={14} />{t('hide')}</>}
          </button>
        </li>
      ))}</ul>
      <div className="list-row add">
        <input placeholder={t('name_ar')} value={ar} onChange={(e) => setAr(e.target.value)} />
        <input placeholder={t('name_en')} dir="ltr" value={en} onChange={(e) => setEn(e.target.value)} />
        <button type="button" className="ghost small" onClick={add}><Plus size={14} />{t('add')}</button>
      </div>
      {lang === 'ar' && <small className="muted">التعديل على الأسماء يظهر في كل السجلات، والرمز الداخلي ما يتغيّر.</small>}
    </details>
  );
}
