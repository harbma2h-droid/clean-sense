import { useEffect, useState } from 'react';
import { Plus, Wallet, Check, Undo2, Ban, Download, ArrowRight, Trash2 } from 'lucide-react';
import { enumLabel } from '@shared/model.js';
import { api, type Row } from '../api';
import { useT } from '../i18n';
import { Badge, Modal, errText, money, options, useLang } from '../ui';
import { ReasonDialog } from './Doc';

// Payroll: monthly runs, advances and debts, and each worker's account.
// Everything here posts to the books automatically (see shared/finance.js → journal).

const ym = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const STATE_TONE: Record<string, string> = { draft: 'gold', unpaid: 'blue', partial: 'navy', paid: 'green', void: 'grey' };

function StateBadge({ state }: { state: string }) {
  const lang = useLang();
  return <span className={`badge ${STATE_TONE[state] || 'grey'}`}>{enumLabel('payroll_state', state, lang)}</span>;
}

export function Payroll({ runId }: { runId?: string }) {
  return runId ? <RunDetail id={runId} /> : <Overview />;
}

function Overview() {
  const t = useT();
  const lang = useLang();
  const [data, setData] = useState<Row | null>(null);
  const [tab, setTab] = useState<'runs' | 'advances' | 'workers'>('runs');
  const [month, setMonth] = useState(ym());
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<Row | null>(null);
  const [statementOf, setStatementOf] = useState<string | null>(null);
  const load = () => api<Row>('/payroll').then(setData).catch((x) => setErr(errText(t, x)));
  useEffect(() => { load(); }, []);

  const createRun = async () => {
    setErr('');
    try {
      const r = await api<Row>('/payroll/runs', { method: 'POST', body: { month } });
      location.hash = `#/payroll/${r.id}`;
    } catch (x) { setErr(errText(t, x)); }
  };

  if (!data) return <p className="muted pad">{err || t('loading')}</p>;
  return (
    <div className="page payroll">
      <div className="page-head"><h1>{t('payroll')}</h1></div>
      <div className="tiles three">
        <div className={`tile ${data.totals.salary_due > 0 ? 'hot' : ''}`}><span className="tile-label">{t('salary_due')}</span><b className="num">{money(data.totals.salary_due, lang)}</b></div>
        <div className="tile"><span className="tile-label">{t('worker_debts')}</span><b className="num">{money(data.totals.worker_debts, lang)}</b></div>
      </div>
      <p className="small muted">{t('payroll_note')}</p>
      <div className="tabs">
        {(['runs', 'advances', 'workers'] as const).map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(k === 'runs' ? 'payroll_runs' : k === 'advances' ? 'advances' : 'worker_accounts')}</button>
        ))}
      </div>
      {err && <p className="err" role="alert">{err}</p>}

      {tab === 'runs' && <>
        <section className="card new-run">
          <label htmlFor="rm">{t('run_month')}</label>
          <input id="rm" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="primary" onClick={createRun} disabled={!month}><Plus size={18} />{t('new_run')}</button>
        </section>
        {data.runs.length === 0 ? <p className="empty">—</p> : (
          <ul className="cards">{data.runs.map((r: Row) => (
            <li key={r.id}><a href={`#/payroll/${r.id}`}>
              <div className="card-top"><b className="num">{r.month}</b><StateBadge state={r.state} /></div>
              <small className="muted">{r.totals.workers} · {t('net_pay')} <span className="num">{money(r.totals.net, lang)}</span>{r.totals.unpaid > 0 && r.state !== 'draft' ? <> · {t('not_paid')} <span className="num">{money(r.totals.unpaid, lang)}</span></> : null}</small>
            </a></li>
          ))}</ul>
        )}
      </>}

      {tab === 'advances' && <>
        <button className="primary" onClick={() => setAdding(true)}><Plus size={18} />{t('new_advance')}</button>
        {data.advances.length === 0 ? <p className="empty">—</p> : (
          <ul className="cards mt">{data.advances.map((a: Row) => (
            <li key={a.id} className={a.status === 'void' ? 'off' : ''}><div className="pay-card">
              <div className="card-top"><b>{a.worker_name}</b><b className={`num ${a.kind === 'repayment' ? '' : 'neg-text'}`}>{a.kind === 'repayment' ? '−' : '+'} {money(a.amount, lang)}</b></div>
              <small className="muted">
                <span className="num">{a.date}</span> · {enumLabel('advance_kind', a.kind, lang)}
                {a.method ? ` · ${enumLabel('payment_method', a.method, lang)}` : ''}{a.category ? ` · ${enumLabel('expense_category', a.category, lang)}` : ''}
                {Number(a.installment) > 0 ? <> · {t('installment')} <span className="num">{money(a.installment, lang)}</span></> : null}
              </small>
              {a.notes && <small>{a.notes}</small>}
              {a.status === 'void' ? <Badge code="void" enumName="payment_status" /> : <button className="ghost small" onClick={() => setVoiding(a)}><Ban size={14} />{t('void_payment')}</button>}
            </div></li>
          ))}</ul>
        )}
      </>}

      {tab === 'workers' && (
        <ul className="cards">{data.workers.map((w: Row) => (
          <li key={w.id}><button onClick={() => setStatementOf(w.id)}>
            <div className="card-top"><b>{w.name}</b>{w.status !== 'active' && <Badge code={w.status} enumName="worker_status" />}</div>
            <small className="muted">{enumLabel('employment_type', w.employment_type, lang)} · <span className="num">{money(w.wage, lang)}</span></small>
            <small>{t('debt_balance')}: <b className="num">{money(w.debt, lang)}</b> · {t('salary_due')}: <b className="num">{money(w.salary_due, lang)}</b></small>
          </button></li>
        ))}</ul>
      )}

      {adding && <AdvanceDialog workers={data.workers} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
      {voiding && <ReasonDialog title={t('void_payment')} onClose={() => setVoiding(null)} onOk={async (reason) => {
        try { await api(`/payroll/advances/${voiding.id}/void`, { method: 'POST', body: { reason } }); setVoiding(null); load(); } catch (x) { setErr(errText(t, x)); setVoiding(null); }
      }} />}
      {statementOf && <WorkerStatement id={statementOf} onClose={() => setStatementOf(null)} />}
    </div>
  );
}

function AdvanceDialog({ workers, onClose, onDone }: { workers: Row[]; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const lang = useLang();
  const [d, setD] = useState<Row>({ worker_id: workers.find((w) => w.status === 'active')?.id || '', kind: 'advance', date: today(), amount: '', method: 'cash', category: 'housing', installment: '', notes: '' });
  const [err, setErr] = useState('');
  const w = workers.find((x) => x.id === d.worker_id);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try { await api('/payroll/advances', { method: 'POST', body: d }); onDone(); } catch (x) { setErr(errText(t, x)); }
  };
  return (
    <Modal title={t('new_advance')} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form">
          <div className="field"><label htmlFor="aw">{t('worker')}</label>
            <select id="aw" required value={d.worker_id} onChange={(e) => setD({ ...d, worker_id: e.target.value })}>{workers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            {w && <small className="muted">{t('debt_balance')}: <span className="num">{money(w.debt, lang)}</span></small>}</div>
          <div className="field wide"><label htmlFor="ak">{t('kind')}</label>
            <select id="ak" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })}>{options('advance_kind').map(([c, l]) => <option key={c} value={c}>{l[lang]}</option>)}</select></div>
          <div className="field"><label htmlFor="ad">{t('date')}</label><input id="ad" type="date" required value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
          <div className="field"><label htmlFor="aa">{t('amount')}</label><input id="aa" type="number" inputMode="decimal" min="0.01" step="0.01" dir="ltr" required value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} /></div>
          {d.kind !== 'charge' ? (
            <div className="field"><label htmlFor="am">{t('method')}</label>
              <select id="am" value={d.method} onChange={(e) => setD({ ...d, method: e.target.value })}>{options('payment_method', d.method).map(([c, l]) => <option key={c} value={c}>{l[lang]}</option>)}</select></div>
          ) : (
            <div className="field"><label htmlFor="ac">{t('expense_category_label')}</label>
              <select id="ac" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>{options('expense_category', d.category).map(([c, l]) => <option key={c} value={c}>{l[lang]}</option>)}</select></div>
          )}
          {d.kind !== 'repayment' && <div className="field"><label htmlFor="ai">{t('installment')}</label><input id="ai" type="number" inputMode="decimal" min="0" step="0.01" dir="ltr" value={d.installment} onChange={(e) => setD({ ...d, installment: e.target.value })} /></div>}
          <div className="field wide"><label htmlFor="an">{t('notes')}</label><textarea id="an" rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></div>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="modal-foot"><span className="grow" /><button type="button" className="ghost" onClick={onClose}>{t('cancel')}</button><button className="primary">{t('save')}</button></div>
      </form>
    </Modal>
  );
}

function WorkerStatement({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const [s, setS] = useState<Row | null>(null);
  useEffect(() => { api<Row>(`/payroll/workers/${id}`).then(setS).catch(() => setS({})); }, [id]);
  const M = (n: unknown) => money(n, lang);
  return (
    <Modal title={s?.worker?.name || t('statement')} onClose={onClose}>
      {!s?.totals ? <p className="muted">{t('loading')}</p> : <>
        <dl className="sum">
          <div><dt>{t('earned')}</dt><dd className="num">{M(s.totals.earned)}</dd></div>
          <div><dt>{t('paid')}</dt><dd className="num">{M(s.totals.paid)}</dd></div>
          <div><dt>{t('recovered')}</dt><dd className="num">{M(s.totals.recovered)}</dd></div>
          <div className={s.totals.salary_due > 0 ? 'due' : ''}><dt>{t('salary_due')}</dt><dd className="num">{M(s.totals.salary_due)}</dd></div>
          <div className="big"><dt>{t('debt_balance')}</dt><dd className="num">{M(s.totals.debt)}</dd></div>
        </dl>
        {s.lines.length > 0 && <div className="tw"><table className="mini">
          <thead><tr><th>{t('month')}</th><th className="end">{t('gross')}</th><th className="end">{t('advance_recovery')}</th><th className="end">{t('net_pay')}</th><th>{t('status')}</th></tr></thead>
          <tbody>{s.lines.map((l: Row) => <tr key={l.id}><td className="num">{l.month}</td><td className="num end">{M(l.gross)}</td><td className="num end">{M(l.advance_recovery)}</td><td className="num end">{M(l.net)}</td><td>{l.run_status === 'draft' ? enumLabel('payroll_state', 'draft', lang) : l.paid_at ? <span className="num">{t('paid_on')} {l.paid_at}</span> : t('not_paid')}</td></tr>)}</tbody>
        </table></div>}
        {s.advances.length > 0 && <ul className="plain mt">{s.advances.map((a: Row) => (
          <li key={a.id} className={a.status === 'void' ? 'muted' : ''}><span className="num">{a.date}</span> · {enumLabel('advance_kind', a.kind, lang)} · <b className="num">{M(a.amount)}</b>{a.status === 'void' ? ` (${enumLabel('payment_status', 'void', lang)})` : ''}{a.notes ? ` — ${a.notes}` : ''}</li>
        ))}</ul>}
      </>}
    </Modal>
  );
}

const EDIT_FIELDS = ['basic', 'allowances', 'overtime', 'bonus', 'deductions', 'advance_recovery'] as const;

function RunDetail({ id }: { id: string }) {
  const t = useT();
  const lang = useLang();
  const [run, setRun] = useState<Row | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<null | { line_ids?: string[] }>(null);
  const [voiding, setVoiding] = useState(false);
  const [workers, setWorkers] = useState<Row[]>([]);
  const load = () => api<Row>(`/payroll/runs/${id}`).then(setRun).catch((x) => setErr(errText(t, x)));
  useEffect(() => { load(); api<Row>('/payroll').then((d) => setWorkers(d.workers)).catch(() => {}); }, [id]);
  const M = (n: unknown) => money(n, lang);

  const call = async (fn: () => Promise<Row>) => {
    setErr('');
    setBusy(true);
    try { setRun(await fn()); } catch (x) { setErr(errText(t, x)); } finally { setBusy(false); }
  };
  const act = (action: string, body: Row = {}) => call(() => api<Row>(`/payroll/runs/${id}/${action}`, { method: 'POST', body }));
  const saveLine = (lineId: string, body: Row) => call(() => api<Row>(`/payroll/runs/${id}/lines/${lineId}`, { method: 'PATCH', body }));

  /** Simple CSV for the bank's bulk-payment upload; the bank's own template may need other columns. */
  const exportCsv = () => {
    const rows = [['name', 'id_number', 'bank', 'iban', 'net', 'month'], ...run!.lines.map((l: Row) => [l.worker_name, l.id_number, l.bank_name, l.iban, l.net.toFixed(2), run!.month])];
    const csv = '﻿' + rows.map((r) => r.map((v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `payroll-${run!.month}.csv`;
    a.click();
  };

  if (!run) return <p className="muted pad">{err || t('loading')}</p>;
  const draft = run.status === 'draft';
  const missing = workers.filter((w) => w.status === 'active' && !run.lines.some((l: Row) => l.worker_id === w.id));

  return (
    <div className="page payroll">
      <div className="page-head">
        <h1><a href="#/payroll" className="icon-btn" aria-label={t('payroll')}><ArrowRight size={20} /></a> {t('payroll')} <span className="num">{run.month}</span></h1>
        <StateBadge state={run.state} />
      </div>
      <div className="quick">
        {draft && <button className="primary" disabled={busy} onClick={() => act('approve')}><Check size={18} />{t('approve_run')}</button>}
        {run.status === 'approved' && run.totals.unpaid > 0 && <button className="primary ok" disabled={busy} onClick={() => setPaying({})}><Wallet size={18} />{t('pay_all')}</button>}
        {run.status === 'approved' && !run.lines.some((l: Row) => l.paid_at) && <button className="ghost" disabled={busy} onClick={() => act('return')}><Undo2 size={18} />{t('return_run')}</button>}
        <button className="btn" onClick={exportCsv}><Download size={18} />{t('export_csv')}</button>
        {run.status !== 'void' && !run.lines.some((l: Row) => l.paid_at) && <button className="danger" disabled={busy} onClick={() => setVoiding(true)}><Ban size={18} />{t('void_run')}</button>}
      </div>
      {err && <p className="err" role="alert">{err}</p>}

      <dl className="sum card">
        <div><dt>{t('gross')}</dt><dd className="num">{M(run.totals.gross)}</dd></div>
        <div><dt>{t('advance_recovery')}</dt><dd className="num">{M(run.totals.advance_recovery)}</dd></div>
        <div className="big"><dt>{t('net_pay')}</dt><dd className="num">{M(run.totals.net)}</dd></div>
        {run.status === 'approved' && <div className={run.totals.unpaid > 0 ? 'due' : ''}><dt>{t('not_paid')}</dt><dd className="num">{M(run.totals.unpaid)}</dd></div>}
      </dl>

      <ul className="pay-lines">{run.lines.map((l: Row) => (
        <li key={l.id} className="card">
          <div className="card-top">
            <b>{l.worker_name}</b>
            <span><b className="num">{M(l.net)}</b>{!draft && (l.paid_at ? <small className="badge green">{t('paid_on')} <span className="num">{l.paid_at}</span></small> : <small className="badge gold">{t('not_paid')}</small>)}</span>
          </div>
          {draft ? (
            <div className="pl-grid">
              {l.employment_type === 'daily' && <LineInput label={t('days')} value={l.days} onSave={(v) => saveLine(l.id, { days: v })} />}
              {EDIT_FIELDS.map((k) => <LineInput key={k} label={t(k)} value={l[k]} onSave={(v) => saveLine(l.id, { [k]: v })} />)}
              <button className="icon-btn" aria-label={t('delete')} onClick={() => call(() => api<Row>(`/payroll/runs/${id}/lines/${l.id}`, { method: 'DELETE' }))}><Trash2 size={18} /></button>
            </div>
          ) : (
            <small className="muted">
              {t('basic')} <span className="num">{M(l.basic)}</span>{Number(l.allowances) ? <> · {t('allowances')} <span className="num">{M(l.allowances)}</span></> : null}
              {Number(l.overtime) ? <> · {t('overtime')} <span className="num">{M(l.overtime)}</span></> : null}{Number(l.bonus) ? <> · {t('bonus')} <span className="num">{M(l.bonus)}</span></> : null}
              {Number(l.deductions) ? <> · {t('deductions')} <span className="num">−{M(l.deductions)}</span></> : null}{Number(l.advance_recovery) ? <> · {t('advance_recovery')} <span className="num">−{M(l.advance_recovery)}</span></> : null}
              {l.paid_at && l.method ? <> · {enumLabel('payment_method', l.method, lang)}</> : null}
            </small>
          )}
          {run.status === 'approved' && (l.paid_at
            ? <button className="ghost small" disabled={busy} onClick={() => act('unpay', { line_id: l.id })}><Undo2 size={14} />{t('unpay')}</button>
            : <button className="ghost small" disabled={busy} onClick={() => setPaying({ line_ids: [l.id] })}><Wallet size={14} />{t('pay_one')}</button>)}
        </li>
      ))}</ul>

      {draft && missing.length > 0 && (
        <div className="row-actions">
          <select aria-label={t('add_worker_line')} defaultValue="" onChange={(e) => { if (e.target.value) call(() => api<Row>(`/payroll/runs/${id}/lines`, { method: 'POST', body: { worker_id: e.target.value } })); e.target.value = ''; }}>
            <option value="">+ {t('add_worker_line')}</option>
            {missing.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      )}

      {paying && <PayDialog onClose={() => setPaying(null)} onOk={async (body) => { await act('pay', { ...body, ...paying }); setPaying(null); }} />}
      {voiding && <ReasonDialog title={t('void_run')} onClose={() => setVoiding(false)} onOk={async (reason) => { await act('void', { reason }); setVoiding(false); }} />}
    </div>
  );
}

/** Number field saved when you leave it (or press Enter), so typing stays smooth on a phone. */
function LineInput({ label, value, onSave }: { label: string; value: unknown; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value ?? ''));
  useEffect(() => setV(String(value ?? '')), [value]);
  const commit = () => { if (v !== String(value ?? '')) onSave(Number(v) || 0); };
  return (
    <label className="pl-field"><span>{label}</span>
      <input type="number" inputMode="decimal" min="0" step="0.01" dir="ltr" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  );
}

function PayDialog({ onClose, onOk }: { onClose: () => void; onOk: (b: Row) => Promise<void> }) {
  const t = useT();
  const lang = useLang();
  const [d, setD] = useState<Row>({ method: 'bank_transfer', date: today(), reference: '' });
  return (
    <Modal title={t('pay_all')} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onOk(d); }}>
        <div className="form">
          <div className="field"><label htmlFor="pm">{t('method')}</label>
            <select id="pm" value={d.method} onChange={(e) => setD({ ...d, method: e.target.value })}>{options('payment_method', d.method).map(([c, l]) => <option key={c} value={c}>{l[lang]}</option>)}</select></div>
          <div className="field"><label htmlFor="pd">{t('date')}</label><input id="pd" type="date" required value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
          <div className="field wide"><label htmlFor="pr">{t('reference')}</label><input id="pr" value={d.reference} onChange={(e) => setD({ ...d, reference: e.target.value })} /></div>
        </div>
        <div className="modal-foot"><span className="grow" /><button type="button" className="ghost" onClick={onClose}>{t('cancel')}</button><button className="primary ok">{t('pay_one')}</button></div>
      </form>
    </Modal>
  );
}
