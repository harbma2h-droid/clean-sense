import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Share2 } from 'lucide-react';
import { ACCOUNTS } from '@shared/finance.js';
import { enumLabel } from '@shared/model.js';
import { api, type Row } from '../api';
import { useT, type Key } from '../i18n';
import { money, useLang } from '../ui';
import { MetaContext } from '../meta';
import { ReportSheet } from '../components/ReportSheet';
import { PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { downloadFile, sharePdf, sheetToPdf } from '../pdf';


export function Reports() {
  const t = useT();
  const lang = useLang();
  const [period, setPeriod] = usePeriod('cs_reports_period', 'this_year');
  const { from, to } = period;
  const [r, setR] = useState<Row | null>(null);
  useEffect(() => { setR(null); api<Row>(`/reports?from=${from}&to=${to}`).then(setR).catch(() => setR({})); }, [from, to]);
  const M = (n: number) => money(n, lang);
  const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { month: 'short', year: 'numeric' });
  const meta = useContext(MetaContext);
  const sheet = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState('');

  /** Branded A4 PDF of the report for the chosen period: shared from the phone, or downloaded. */
  const exportPdf = async (share: boolean) => {
    setBusy(share ? 'share' : 'pdf');
    try {
      const file = await sheetToPdf(sheet.current!, `${lang === 'ar' ? 'التقرير-المالي' : 'Financial-report'}-${from}_${to}.pdf`);
      if (!share || !(await sharePdf(file, `${t('reports')} ${from} → ${to}`))) await downloadFile(file);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="page reports">
      <div className="page-head">
        <h1>{t('reports')}</h1>
        {r?.pnl && (
          <div className="row-actions">
            <button className="btn" disabled={!!busy} onClick={() => exportPdf(true)}><Share2 size={16} />{busy === 'share' ? t('preparing_pdf') : t('share_pdf')}</button>
            <button className="btn" disabled={!!busy} onClick={() => exportPdf(false)}><Download size={16} />{busy === 'pdf' ? t('preparing_pdf') : t('download_pdf')}</button>
          </div>
        )}
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      <p className="small muted">{t('accrual_note')}</p>
      {!r ? <p className="muted pad">{t('loading')}</p> : !r.pnl ? <p className="empty">{t('error')}</p> : <>
        <div className="tiles three">
          <div className="tile"><span className="tile-label">{t('revenue_accrual')}</span><b className="num">{M(r.pnl.total.revenue)}</b></div>
          <div className="tile"><span className="tile-label">{t('expenses')}</span><b className="num">{M(r.pnl.total.expenses)}</b></div>
          <div className={`tile ${r.pnl.total.profit < 0 ? 'neg' : 'pos'}`}><span className="tile-label">{t('profit')}</span><b className="num">{M(r.pnl.total.profit)}</b></div>
          <div className="tile"><span className="tile-label">{t('received')}</span><b className="num">{M(r.cash.received)}</b></div>
          <div className="tile"><span className="tile-label">{t('receivable_confirmed')}</span><b className="num">{M(r.receivables.confirmed)}</b></div>
          {r.receivables.unverified > 0 && <div className="tile hot"><span className="tile-label">{t('receivable_unverified')}</span><b className="num">{M(r.receivables.unverified)}</b></div>}
        </div>

        <section className="card">
          <h2>{t('pnl')}</h2>
          <div className="tw"><table className="mini">
            <thead><tr><th>{t('month')}</th><th className="end">{t('revenue')}</th><th className="end">{t('expenses')}</th><th className="end">{t('profit')}</th></tr></thead>
            <tbody>{r.pnl.rows.map((m: Row) => (
              <tr key={m.month}><td>{monthName(m.month)}</td><td className="num end">{M(m.revenue)}</td><td className="num end">{M(m.expenses)}</td><td className={`num end ${m.profit < 0 ? 'neg-text' : ''}`}>{M(m.profit)}</td></tr>
            ))}</tbody>
            <tfoot><tr><th>{t('total')}</th><th className="num end">{M(r.pnl.total.revenue)}</th><th className="num end">{M(r.pnl.total.expenses)}</th><th className="num end">{M(r.pnl.total.profit)}</th></tr></tfoot>
          </table></div>
          <Bars rows={r.pnl.rows.map((m: Row) => ({ label: monthName(m.month), a: m.revenue, b: m.expenses }))} aLabel={t('revenue')} bLabel={t('expenses')} />
        </section>

        <div className="two">
          <section className="card">
            <h2>{t('aging')}</h2>
            <dl className="sum">{(['current', 'd31_60', 'd61_90', 'd90_plus', 'unverified'] as const).map((b) => (
              <div key={b}><dt>{t(`b_${b}` as Key)}</dt><dd className="num">{M(r.receivables.buckets[b])}</dd></div>
            ))}<div className="big"><dt>{t('total')}</dt><dd className="num">{M(r.receivables.total)}</dd></div></dl>
            {r.receivables.rows.length > 0 && (
              <details><summary>{lang === 'ar' ? 'الفواتير' : 'Invoices'} ({r.receivables.rows.length})</summary>
                <ul className="plain">{r.receivables.rows.map((x: Row) => <li key={x.id}><a href={`#/doc/${x.id}`} className="num">{x.doc_number}</a> · {x.customer_name} · <span className="num">{M(x.balance)}</span> <small className="muted num">({x.age}d)</small></li>)}</ul>
              </details>
            )}
          </section>
          <section className="card">
            <h2>{t('cash_view')}</h2>
            <table className="mini">
              <thead><tr><th>{t('method')}</th><th className="end">{t('received')}</th><th className="end">{t('paid_out')}</th><th className="end">{t('net')}</th></tr></thead>
              <tbody>{r.cash.rows.map((c: Row) => <tr key={c.method}><td>{enumLabel('payment_method', c.method, lang)}</td><td className="num end">{M(c.received)}</td><td className="num end">{M(c.paid_out)}</td><td className={`num end ${c.net < 0 ? 'neg-text' : ''}`}>{M(c.net)}</td></tr>)}</tbody>
              <tfoot><tr><th>{t('total')}</th><th className="num end">{M(r.cash.received)}</th><th className="num end">{M(r.cash.paid_out)}</th><th className="num end">{M(r.cash.received - r.cash.paid_out)}</th></tr></tfoot>
            </table>
          </section>
        </div>

        <div className="two">
          <section className="card">
            <h2>{t('by_service')}</h2>
            <Bars rows={r.by_service.map((s: Row) => ({ label: enumLabel('service', s.service, lang), a: s.amount }))} aLabel={t('revenue')} horizontal />
          </section>
          <section className="card">
            <h2>{t('expenses')}</h2>
            <Bars rows={Object.entries(r.pnl.rows.reduce((acc: Record<string, number>, m: Row) => { for (const [k, v] of Object.entries(m.by_category as Record<string, number>)) acc[k] = (acc[k] || 0) + v; return acc; }, {}))
              .sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => ({ label: enumLabel('expense_category', k, lang), a: v as number }))} aLabel={t('expenses')} horizontal tone="b" />
          </section>
        </div>

        {r.projects.length > 0 && (
          <section className="card">
            <h2>{t('project_profit')}</h2>
            <div className="tw"><table className="mini">
              <thead><tr><th>{lang === 'ar' ? 'المشروع' : 'Project'}</th><th className="end">{t('invoiced')}</th><th className="end">{t('paid')}</th><th className="end">{t('costs')}</th><th className="end">{t('profit')}</th><th className="end">{t('margin')}</th></tr></thead>
              <tbody>{r.projects.map((p: Row) => <tr key={p.id}><td>{p.code} · {p.name}</td><td className="num end">{M(p.invoiced)}</td><td className="num end">{M(p.collected)}</td><td className="num end">{M(p.costs)}</td><td className={`num end ${p.profit < 0 ? 'neg-text' : ''}`}>{M(p.profit)}</td><td className="num end">{p.margin === null ? '—' : `${p.margin}%`}</td></tr>)}</tbody>
            </table></div>
          </section>
        )}

        <div className="two">
          <section className="card">
            <h2>{t('balances')}</h2>
            <dl className="sum">{(r.treasury || []).map((b: Row) => <div key={b.code}><dt>{enumLabel('treasury_account', b.code, lang)}</dt><dd className={`num ${b.balance < 0 ? 'neg-text' : ''}`}>{M(b.balance)}</dd></div>)}</dl>
            <a className="ghost small" href="#/treasury">{t('treasury')}</a>
          </section>
          <section className="card">
            <h2>{t('partners')}</h2>
            <table className="mini">
              <thead><tr><th>{t('partner')}</th><th className="end">{t('capital')}</th><th className="end">{t('drawings')}</th><th className="end">{t('net')}</th></tr></thead>
              <tbody>{(r.partners || []).map((p: Row) => <tr key={p.partner}><td>{p.partner}</td><td className="num end">{M(p.capital)}</td><td className="num end">{M(p.drawings)}</td><td className="num end">{M(p.net)}</td></tr>)}</tbody>
            </table>
          </section>
        </div>

        <section className="card">
          <h2>{t('trial_balance')} <span className={`badge ${r.trial_balance.balanced ? 'green' : 'red'}`}>{r.trial_balance.balanced ? t('balanced') : t('not_balanced')}</span></h2>
          <div className="tw"><table className="mini">
            <thead><tr><th>{t('account')}</th><th className="end">{t('debit')}</th><th className="end">{t('credit')}</th><th className="end">{t('balance')}</th></tr></thead>
            <tbody>{r.trial_balance.rows.map((a: Row) => <tr key={a.account}><td><span className="num muted">{a.account}</span> {(ACCOUNTS as any)[a.account]?.[lang]}</td><td className="num end">{M(a.debit)}</td><td className="num end">{M(a.credit)}</td><td className="num end">{M(a.balance)}</td></tr>)}</tbody>
            <tfoot><tr><th>{t('total')}</th><th className="num end">{M(r.trial_balance.debit)}</th><th className="num end">{M(r.trial_balance.credit)}</th><th /></tr></tfoot>
          </table></div>
        </section>
        {createPortal(<div className="pdf-stage" aria-hidden="true"><ReportSheet ref={sheet} r={r} from={from} to={to} lang={lang} company={meta?.company || {}} /></div>, document.body)}
      </>}
    </div>
  );
}

/** Small dependency-free bar chart. */
function Bars({ rows, aLabel, bLabel, horizontal, tone = 'a' }: { rows: { label: string; a: number; b?: number }[]; aLabel: string; bLabel?: string; horizontal?: boolean; tone?: 'a' | 'b' }) {
  const lang = useLang();
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b || 0]));
  if (!rows.length) return null;
  if (horizontal) {
    return (
      <ul className="hbars">{rows.map((r) => (
        <li key={r.label}><span className="hb-label">{r.label}</span><span className="hb-track"><span className={`hb-fill ${tone}`} style={{ inlineSize: `${(r.a / max) * 100}%` }} /></span><span className="num hb-val">{money(r.a, lang)}</span></li>
      ))}</ul>
    );
  }
  return (
    <figure className="vbars" aria-label={`${aLabel}${bLabel ? ` / ${bLabel}` : ''}`}>
      <div className="vb-plot">{rows.map((r) => (
        <div className="vb-group" key={r.label} title={`${r.label}: ${money(r.a, lang)}${r.b !== undefined ? ` / ${money(r.b, lang)}` : ''}`}>
          <span className="vb a" style={{ blockSize: `${(r.a / max) * 100}%` }} />
          {r.b !== undefined && <span className="vb b" style={{ blockSize: `${(r.b / max) * 100}%` }} />}
          <small>{r.label}</small>
        </div>
      ))}</div>
      <figcaption><span className="key a" />{aLabel}{bLabel && <><span className="key b" />{bLabel}</>}</figcaption>
    </figure>
  );
}
