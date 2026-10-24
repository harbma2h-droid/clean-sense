import { useEffect, useState } from 'react';
import { enumLabel } from '@shared/model.js';
import { api, type Row, type User } from '../api';
import { useT, type Key } from '../i18n';
import { Badge, money, useLang, waLink } from '../ui';
import { CalendarConnect } from '../components/CalendarConnect';
import { PeriodPicker, usePeriod, type Period } from '../components/PeriodPicker';

type MonthFig = { month: string; revenue: number; expenses: number; profit: number; collected: number };
type PeriodFig = { from: string; to: string; revenue: number; expenses: number; profit: number; collected: number };
type Finance = {
  cash_total: number;
  accounts: { code: string; balance: number }[];
  period: PeriodFig;
  prev: PeriodFig;
  trend: MonthFig[];
  receivable: { confirmed: number; unverified: number; overdue: number };
  payroll?: { salary_due: number; worker_debts: number };
  top_expenses: { category: string; amount: number }[];
};
type Summary = Record<string, any> & { today?: Row[]; finance?: Finance };

// Operational counters; money now lives in the financial snapshot above them.
const TILES: { key: Key; href: string; tone?: (s: Summary) => string }[] = [
  { key: 'leads_new', href: 't/leads', tone: (s) => (s.leads_new ? 'hot' : '') },
  { key: 'quotes_pending_approval', href: 'sales/quotes', tone: (s) => (s.quotes_pending_approval ? 'hot' : '') },
  { key: 'bookings_today', href: 't/bookings' },
  { key: 'bookings_upcoming', href: 't/bookings' },
  { key: 'quotes_open', href: 'sales/quotes' },
  { key: 'invoices_draft', href: 'sales/invoices' },
  { key: 'projects_active', href: 't/projects' },
  { key: 'tasks_open', href: 't/tasks' },
];

/** Dashboard figures in whole riyals; exact amounts stay in the reports. */
const whole = (n: number, lang: 'ar' | 'en') => money(Math.round(n), lang);

const monthName = (key: string, lang: 'ar' | 'en', style: 'long' | 'short' = 'long') =>
  new Date(`${key}-01T00:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { month: style, timeZone: 'UTC' });

/** Change against the period before; for costs a rise is bad, so the colour flips. */
function Delta({ cur, prev, costs = false }: { cur: number; prev: number; costs?: boolean }) {
  const t = useT();
  if (!prev) return <small className="muted">—</small>;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  const good = costs ? pct <= 0 : pct >= 0;
  return (
    <small className={good ? 'delta up' : 'delta down'}>
      <span className="num">{pct > 0 ? '▲' : pct < 0 ? '▼' : '•'} {Math.abs(pct)}%</span> <span className="muted">{t('vs_prev')}</span>
    </small>
  );
}

function FinanceSnapshot({ f, period, onPeriod }: { f: Finance; period: Period; onPeriod: (p: Period) => void }) {
  const t = useT();
  const lang = useLang();
  const max = Math.max(1, ...f.trend.flatMap((m) => [m.collected, m.expenses]));
  // Bars are relative to the largest category, so the biggest one fills the track.
  const max4 = Math.max(1, ...f.top_expenses.map((x) => x.amount));
  const accounts = f.accounts.filter((a) => a.balance !== 0);
  const cur = f.period;

  return (
    <section className="fin">
      <div className="fin-head">
        <h2>{t('fin_title')}</h2>
        <PeriodPicker value={period} onChange={onPeriod} />
        <a href="#/reports" className="link">{t('view_reports')} ←</a>
      </div>
      {period.key !== 'this_month' && <p className="small muted fin-range num">{cur.from} → {cur.to}</p>}

      <div className="kpis">
        <a href="#/treasury" className="kpi main">
          <span className="tile-label">{t('cash_on_hand')}</span>
          <b className={`num ${f.cash_total < 0 ? 'neg-text' : ''}`}>{whole(f.cash_total, lang)}</b>
          {accounts.length > 0 && (
            <small className="muted">{accounts.map((a) => `${enumLabel('treasury_account', a.code, lang)} ${money(a.balance, lang)}`).join(' · ')}</small>
          )}
        </a>
        <a href="#/reports" className="kpi">
          <span className="tile-label">{t('fin_invoiced')}</span>
          <b className="num">{whole(cur.revenue, lang)}</b>
          <Delta cur={cur.revenue} prev={f.prev.revenue} />
        </a>
        <a href="#/payments" className="kpi">
          <span className="tile-label">{t('fin_collected')}</span>
          <b className="num">{whole(cur.collected, lang)}</b>
          <Delta cur={cur.collected} prev={f.prev.collected} />
        </a>
        <a href="#/t/expenses" className="kpi">
          <span className="tile-label">{t('fin_spent')}</span>
          <b className="num">{whole(cur.expenses, lang)}</b>
          <Delta cur={cur.expenses} prev={f.prev.expenses} costs />
        </a>
        <a href="#/reports" className={`kpi ${cur.profit < 0 ? 'neg' : 'pos'}`}>
          <span className="tile-label">{t('fin_profit')}</span>
          <b className={`num ${cur.profit < 0 ? 'neg-text' : ''}`}>{whole(cur.profit, lang)}</b>
          <Delta cur={cur.profit} prev={f.prev.profit} />
        </a>
      </div>

      <div className="fin-grid">
        <div className="card">
          <h3>{t('by_month')}</h3>
          <div className={`bars ${f.trend.length > 8 ? 'many' : ''}`} role="img" aria-label={t('by_month')}>
            {f.trend.map((m) => (
              <div key={m.month} className="bar-col" title={`${monthName(m.month, lang)} — ${t('fin_collected')} ${money(m.collected, lang)} · ${t('fin_spent')} ${money(m.expenses, lang)}`}>
                <div className="bar-pair">
                  <span className="bar in" style={{ height: `${(m.collected / max) * 100}%` }} />
                  <span className="bar out" style={{ height: `${(m.expenses / max) * 100}%` }} />
                </div>
                <small className="muted">{monthName(m.month, lang, 'short')}</small>
              </div>
            ))}
          </div>
          <div className="legend small">
            <span><i className="dot in" />{t('fin_collected')}</span>
            <span><i className="dot out" />{t('fin_spent')}</span>
          </div>
        </div>

        <div className="card">
          <h3>{t('fin_receivables')}</h3>
          <dl className="facts">
            <div><dt>{t('due_from_customers')}</dt><dd className="num">{money(f.receivable.confirmed, lang)}</dd></div>
            {f.receivable.overdue > 0 && <div><dt>{t('overdue_count')}</dt><dd className="num neg-text">{f.receivable.overdue}</dd></div>}
            {f.receivable.unverified > 0 && (
              <div><dt>{t('needs_review')}</dt><dd><span className="num">{money(f.receivable.unverified, lang)}</span> <a href="#/sales/invoices" className="link small">{t('review_now')}</a></dd></div>
            )}
            {f.payroll && f.payroll.salary_due > 0 && <div><dt><a href="#/payroll" className="link">{t('salary_due')}</a></dt><dd className="num neg-text">{money(f.payroll.salary_due, lang)}</dd></div>}
            {f.payroll && f.payroll.worker_debts > 0 && <div><dt><a href="#/payroll" className="link">{t('worker_debts')}</a></dt><dd className="num">{money(f.payroll.worker_debts, lang)}</dd></div>}
          </dl>
          <h3 className="mt">{t('top_expenses')}</h3>
          {f.top_expenses.length === 0 ? <p className="muted small">{t('no_expenses_month')}</p> : (
            <ul className="shares">
              {f.top_expenses.map((x) => (
                <li key={x.category}>
                  <span className="grow">{enumLabel('expense_category', x.category, lang)}</span>
                  <span className="num">{money(x.amount, lang)}</span>
                  <span className="share-track"><span className="share" style={{ width: `${(x.amount / max4) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function Home({ user }: { user: User }) {
  const t = useT();
  const lang = useLang();
  const [s, setS] = useState<Summary | null>(null);
  const [period, setPeriod] = usePeriod('cs_home_period');

  useEffect(() => { api<Summary>(`/summary?from=${period.from}&to=${period.to}`).then(setS).catch(() => setS({})); }, [period.from, period.to]);
  if (!s) return <p className="muted pad">{t('loading')}</p>;

  const tiles = TILES.filter((x) => s[x.key] !== undefined);

  return (
    <div className="page">
      <h1 className="hello">{t('hello')} {user.name} 👋</h1>

      {s.finance?.period && <FinanceSnapshot f={s.finance} period={period} onPeriod={setPeriod} />}

      {tiles.length > 0 && (
        <>
          {s.finance && <h2 className="section-title">{t('operations')}</h2>}
          <div className="tiles">
            {tiles.map((x) => (
              <a key={x.key} href={`#/${x.href}`} className={`tile ${x.tone?.(s) || ''}`}>
                <span className="tile-label">{t(x.key)}</span>
                <b className="num">{s[x.key]}</b>
              </a>
            ))}
          </div>
        </>
      )}

      {s.today && (
        <section className="card">
          <div className="card-top"><h2>{t('today_schedule')}</h2><CalendarConnect /></div>
          {s.today.length === 0 ? <p className="muted">{t('nothing_today')}</p> : (
            <ul className="agenda">
              {s.today.map((b) => (
                <li key={b.id}>
                  <span className="time num">{b.time || '—'}</span>
                  <div className="grow">
                    <b>{b.customer_name}</b>
                    <small className="muted">
                      {[enumLabel('city', b.city, lang), String(b.services || '').split(',').filter(Boolean).map((c) => enumLabel('service', c, lang)).join('، '), b.assigned_workers].filter(Boolean).join(' · ')}
                    </small>
                  </div>
                  <Badge code={b.status} enumName="booking_status" />
                  {b.phone && <a className="icon-btn wa" href={waLink(b.phone)} target="_blank" rel="noreferrer" aria-label={t('whatsapp')}>💬</a>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
