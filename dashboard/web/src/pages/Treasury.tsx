import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeftRight, Landmark, MinusCircle, PlusCircle, Scale } from 'lucide-react';
import { ENUMS, enumLabel } from '@shared/model.js';
import { api, type Row } from '../api';
import { useT, type Key } from '../i18n';
import { Badge, Modal, errText, money, useLang } from '../ui';
import { ReasonDialog } from './Doc';

type Form = null | { kind: 'balance' | 'capital_in' | 'drawing' | 'transfer' };
const today = () => new Date().toISOString().slice(0, 10);

/** Bank, cash box and STC Pay balances, partner contributions/drawings, transfers and reconciliation. */
export function Treasury() {
  const t = useT();
  const lang = useLang();
  const [data, setData] = useState<Row | null>(null);
  const [form, setForm] = useState<Form>(null);
  const [voiding, setVoiding] = useState<Row | null>(null);
  const load = () => api<Row>('/treasury').then(setData).catch(() => setData({}));
  useEffect(() => { load(); }, []);
  if (!data) return <p className="muted pad">{t('loading')}</p>;
  const M = (n: number) => money(n, lang);

  return (
    <div className="page">
      <div className="page-head"><h1>{t('treasury')}</h1></div>
      <div className="actions">
        <button className="primary" onClick={() => setForm({ kind: 'balance' })}><Scale size={18} />{t('reconcile')}</button>
        <button className="btn" onClick={() => setForm({ kind: 'capital_in' })}><PlusCircle size={18} />{t('partner_in')}</button>
        <button className="btn" onClick={() => setForm({ kind: 'drawing' })}><MinusCircle size={18} />{t('partner_out')}</button>
        <button className="btn" onClick={() => setForm({ kind: 'transfer' })}><ArrowLeftRight size={18} />{t('transfer')}</button>
      </div>
      <div className="tiles three">
        {(data.balances || []).map((b: Row) => (
          <div key={b.code} className={`tile ${b.balance < 0 ? 'neg' : 'pos'}`}><span className="tile-label"><Landmark size={14} /> {enumLabel('treasury_account', b.code, lang)}</span><b className="num">{M(b.balance)}</b></div>
        ))}
      </div>

      <section className="card">
        <h2>{t('partners')}</h2>
        {(data.partners || []).length === 0 ? <p className="muted">{lang === 'ar' ? 'أضف أسماء الشركاء من الإعدادات.' : 'Add partner names in Settings.'}</p> : (
          <table className="mini">
            <thead><tr><th>{t('partner')}</th><th className="end">{t('capital')}</th><th className="end">{t('drawings')}</th><th className="end">{t('net')}</th></tr></thead>
            <tbody>{data.partners.map((p: Row) => <tr key={p.partner}><td>{p.partner}</td><td className="num end">{M(p.capital)}</td><td className="num end">{M(p.drawings)}</td><td className="num end">{M(p.net)}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>{t('history')}</h2>
        {(data.entries || []).length === 0 ? <p className="muted">{t('empty')}</p> : (
          <ul className="pay-list">{data.entries.map((e: Row) => (
            <li key={e.id} className={e.status === 'void' ? 'off' : ''}>
              <span className="num">{e.date}</span>
              <span>{enumLabel('treasury_kind', e.kind, lang)}</span>
              <span>{enumLabel('treasury_account', e.account, lang)}{e.to_account && ` → ${enumLabel('treasury_account', e.to_account, lang)}`}{e.partner && ` · ${e.partner}`}</span>
              {e.kind === 'balance_set' && <small className="muted">{t('book_balance')}: <span className="num">{M(e.book_balance)}</span> → {t('actual_balance')}: <span className="num">{M(e.actual_balance)}</span></small>}
              <b className="num">{e.kind === 'balance_set' && e.amount > 0 ? '+' : ''}{M(e.amount)}</b>
              {e.status === 'void' ? <Badge code="void" enumName="payment_status" /> : <button className="ghost small" onClick={() => setVoiding(e)}>{t('void')}</button>}
            </li>
          ))}</ul>
        )}
      </section>

      {form && <TreasuryForm kind={form.kind} partners={data.partner_names || []} balances={data.balances || []} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
      {voiding && <ReasonDialog title={t('void')} onClose={() => setVoiding(null)} onOk={async (reason) => { await api(`/treasury/${voiding.id}/void`, { method: 'POST', body: { reason } }); setVoiding(null); load(); }} />}
    </div>
  );
}

function TreasuryForm({ kind, partners, balances, onClose, onDone }: { kind: 'balance' | 'capital_in' | 'drawing' | 'transfer'; partners: string[]; balances: Row[]; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const lang = useLang();
  const [d, setD] = useState<Row>({ date: today(), account: 'bank', to_account: 'cash', partner: partners[0] || '', amount: '', actual: '', notes: '' });
  const [err, setErr] = useState('');
  const accounts = Object.entries(ENUMS.treasury_account as Record<string, { ar: string; en: string }>);
  const book = balances.find((b) => b.code === d.account)?.balance ?? 0;
  const title: Key = kind === 'balance' ? 'reconcile' : kind === 'capital_in' ? 'partner_in' : kind === 'drawing' ? 'partner_out' : 'transfer';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      if (kind === 'balance') await api('/treasury/balance', { method: 'POST', body: { account: d.account, actual: d.actual, date: d.date, notes: d.notes } });
      else await api('/treasury', { method: 'POST', body: { ...d, kind } });
      onDone();
    } catch (x) { setErr(errText(t, x)); }
  };
  const select = (k: string, label: Key) => (
    <div className="field"><label htmlFor={k}>{t(label)}</label>
      <select id={k} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })}>{accounts.map(([c, l]) => <option key={c} value={c}>{l[lang]}</option>)}</select></div>
  );
  return (
    <Modal title={t(title)} onClose={onClose}>
      <form onSubmit={submit}>
        {kind === 'balance' && <p className="small muted">{t('reconcile_hint')}</p>}
        <div className="form">
          {select('account', kind === 'transfer' ? 'from_account' : 'account')}
          {kind === 'transfer' && select('to_account', 'to_account')}
          {(kind === 'capital_in' || kind === 'drawing') && (
            <div className="field"><label htmlFor="pt">{t('partner')}</label>
              <input id="pt" list="partners" required value={d.partner} onChange={(e) => setD({ ...d, partner: e.target.value })} />
              <datalist id="partners">{partners.map((p) => <option key={p} value={p} />)}</datalist></div>
          )}
          {kind === 'balance' ? (
            <div className="field"><label htmlFor="ac">{t('actual_balance')}</label>
              <input id="ac" type="number" step="0.01" dir="ltr" inputMode="decimal" required value={d.actual} onChange={(e) => setD({ ...d, actual: e.target.value })} />
              <small className="muted">{t('book_balance')}: <span className="num">{money(book, lang)}</span>{d.actual !== '' && <> · {t('difference')}: <b className="num">{money(Number(d.actual) - book, lang)}</b></>}</small></div>
          ) : (
            <div className="field"><label htmlFor="am">{t('amount')}</label><input id="am" type="number" min="0.01" step="0.01" dir="ltr" inputMode="decimal" required value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} /></div>
          )}
          <div className="field"><label htmlFor="dt">{t('date')}</label><input id="dt" type="date" max={today()} required value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
          <div className="field wide"><label htmlFor="nt">{t('notes')}</label><textarea id="nt" rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></div>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="modal-foot"><span className="grow" /><button type="button" className="ghost" onClick={onClose}>{t('cancel')}</button><button className="primary">{t('save')}</button></div>
      </form>
    </Modal>
  );
}
