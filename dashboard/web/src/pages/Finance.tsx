import { useEffect, useState } from 'react';
import { api, type Row } from '../api';
import { useT } from '../i18n';
import { money, useLang } from '../ui';
import { TablePage } from './TablePage';

export function Finance() {
  const t = useT();
  const lang = useLang();
  const [tab, setTab] = useState<'revenue' | 'expenses'>('revenue');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [sums, setSums] = useState({ revenue: 0, expenses: 0 });

  useEffect(() => {
    const total = (rows: Row[]) => rows.filter((r) => !month || String(r.date).startsWith(month)).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    Promise.all([api<Row[]>('/data/revenue'), api<Row[]>('/data/expenses')])
      .then(([r, e]) => setSums({ revenue: total(r), expenses: total(e) }))
      .catch(() => {});
  }, [month, tab]);

  const net = sums.revenue - sums.expenses;
  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('finance')}</h1>
        <label className="month"><span className="muted">{t('month')}</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          {month && <button className="ghost small" onClick={() => setMonth('')}>{t('all')}</button>}
        </label>
      </div>
      <div className="tiles three">
        <div className="tile pos"><span className="tile-label">{t('revenue')}</span><b className="num">{money(sums.revenue, lang)}</b></div>
        <div className="tile"><span className="tile-label">{t('expenses')}</span><b className="num">{money(sums.expenses, lang)}</b></div>
        <div className={`tile ${net < 0 ? 'neg' : 'pos'}`}><span className="tile-label">{t('net_month')}</span><b className="num">{money(net, lang)}</b></div>
      </div>
      <div className="tabs" role="tablist">
        {(['revenue', 'expenses'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(k)}</button>
        ))}
      </div>
      <TablePage key={tab} table={tab} month={month} embedded />
    </div>
  );
}
