import { forwardRef } from 'react';
import { ACCOUNTS } from '@shared/finance.js';
import { MONEY_FMT, enumLabel } from '@shared/model.js';
import logo from '../assets/brand/logo-transparent.svg';
import type { Row } from '../api';
import { localDate } from '../ui';

// Printable financial report (A4), same brand frame as quotes and invoices.
const L = {
  ar: {
    title: 'التقرير المالي', period: 'الفترة', made: 'تاريخ الإصدار', summary: 'الملخص', revenue: 'الإيرادات (استحقاق)', expenses: 'المصروفات', profit: 'صافي الربح',
    received: 'المحصّل نقداً', receivable: 'المستحقات المؤكدة', unverified: 'مستحقات قيد المراجعة', pnl: 'الأرباح والخسائر حسب الشهر', month: 'الشهر', total: 'الإجمالي',
    aging: 'أعمار المستحقات', current: 'حتى 30 يوم', d31_60: '31–60 يوم', d61_90: '61–90 يوم', d90_plus: 'أكثر من 90 يوم', cash: 'التحصيل والصرف حسب طريقة الدفع',
    method: 'الطريقة', paid_out: 'المصروف', net: 'الصافي', byCat: 'المصروفات حسب البند', category: 'البند', amount: 'المبلغ', byService: 'الإيرادات حسب الخدمة', service: 'الخدمة',
    balances: 'الأرصدة', account: 'الحساب', balance: 'الرصيد', tb: 'ميزان المراجعة', balanced: 'متوازن', notBalanced: 'غير متوازن', debit: 'مدين', credit: 'دائن',
    note: 'الإيرادات تُحسب عند إصدار الفاتورة (أساس الاستحقاق)، والتحصيل يظهر في جدول طرق الدفع. المبالغ بالريال السعودي.', unified: 'الرقم الوطني الموحد',
  },
  en: {
    title: 'Financial report', period: 'Period', made: 'Issued', summary: 'Summary', revenue: 'Revenue (accrual)', expenses: 'Expenses', profit: 'Net profit',
    received: 'Cash collected', receivable: 'Confirmed receivables', unverified: 'Receivables under review', pnl: 'Profit & loss by month', month: 'Month', total: 'Total',
    aging: 'Receivables aging', current: 'Up to 30 days', d31_60: '31–60 days', d61_90: '61–90 days', d90_plus: 'Over 90 days', cash: 'Collected and paid by method',
    method: 'Method', paid_out: 'Paid out', net: 'Net', byCat: 'Expenses by category', category: 'Category', amount: 'Amount', byService: 'Revenue by service', service: 'Service',
    balances: 'Balances', account: 'Account', balance: 'Balance', tb: 'Trial balance', balanced: 'Balanced', notBalanced: 'Not balanced', debit: 'Debit', credit: 'Credit',
    note: 'Revenue is counted when an invoice is issued (accrual); collections are in the payment-method table. Amounts in Saudi riyals.', unified: 'Unified number',
  },
};

type Props = { r: Row; from: string; to: string; lang: 'ar' | 'en'; company: Record<string, string> };

export const ReportSheet = forwardRef<HTMLDivElement, Props>(function ReportSheet({ r, from, to, lang, company: c }, ref) {
  const l = L[lang];
  const M = (n: unknown) => MONEY_FMT(n, lang);
  const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const legalName = lang === 'ar' ? c['company.legal_name'] || 'مؤسسة كلين سنس' : c['company.legal_name_en'] || 'Clean Sense Est.';
  const cats = Object.entries((r.pnl.rows as Row[]).reduce((acc: Record<string, number>, m) => { for (const [k, v] of Object.entries(m.by_category as Record<string, number>)) acc[k] = (acc[k] || 0) + v; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const table = (head: string[], rows: (string | number)[][], foot?: (string | number)[]) => (
    <table className="ds-table">
      <thead><tr data-block>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i} data-block>{row.map((v, j) => <td key={j} className={j ? 'num' : ''}>{v}</td>)}</tr>)}</tbody>
      {foot && <tfoot><tr data-block>{foot.map((v, j) => <th key={j} className={j ? 'num' : ''}>{v}</th>)}</tr></tfoot>}
    </table>
  );

  return (
    <div className="ds report" ref={ref} lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <header className="ds-head" data-block>
        <div className="ds-brand">
          <img src={logo} alt="Clean Sense" />
          <div>
            <b>{legalName}</b>
            <span>{l.unified}: <bdi className="num">{c['company.unified_number'] || '7049749042'}</bdi></span>
            <span className="num" dir="ltr">{c['contact.phone'] || '0537717716'} · {c['contact.email'] || 'info@cleansense.co'}</span>
          </div>
        </div>
        <div className="ds-title">
          <h1>{l.title}</h1>
          <span className="num">{from} → {to}</span>
          <small className="ds-small">{l.made}: <bdi className="num">{localDate()}</bdi></small>
        </div>
      </header>

      <section className="ds-sec" data-block>
        <h2>{l.summary}</h2>
        <div className="ds-kpis">
          <div><span>{l.revenue}</span><b className="num">{M(r.pnl.total.revenue)}</b></div>
          <div><span>{l.expenses}</span><b className="num">{M(r.pnl.total.expenses)}</b></div>
          <div className={r.pnl.total.profit < 0 ? 'neg' : 'pos'}><span>{l.profit}</span><b className="num">{M(r.pnl.total.profit)}</b></div>
          <div><span>{l.received}</span><b className="num">{M(r.cash.received)}</b></div>
          <div><span>{l.receivable}</span><b className="num">{M(r.receivables.confirmed)}</b></div>
          {r.receivables.unverified > 0 && <div><span>{l.unverified}</span><b className="num">{M(r.receivables.unverified)}</b></div>}
        </div>
      </section>

      <section className="ds-sec"><h2 data-block>{l.pnl}</h2>
        {table([l.month, l.revenue, l.expenses, l.profit], r.pnl.rows.map((m: Row) => [monthName(m.month), M(m.revenue), M(m.expenses), M(m.profit)]), [l.total, M(r.pnl.total.revenue), M(r.pnl.total.expenses), M(r.pnl.total.profit)])}
      </section>

      {cats.length > 0 && <section className="ds-sec"><h2 data-block>{l.byCat}</h2>
        {table([l.category, l.amount], cats.map(([k, v]) => [enumLabel('expense_category', k, lang), M(v)]), [l.total, M(r.pnl.total.expenses)])}
      </section>}

      {r.by_service.length > 0 && <section className="ds-sec"><h2 data-block>{l.byService}</h2>
        {table([l.service, l.amount], r.by_service.map((s: Row) => [enumLabel('service', s.service, lang), M(s.amount)]))}
      </section>}

      <section className="ds-sec"><h2 data-block>{l.cash}</h2>
        {table([l.method, l.received, l.paid_out, l.net], r.cash.rows.map((x: Row) => [enumLabel('payment_method', x.method, lang), M(x.received), M(x.paid_out), M(x.net)]), [l.total, M(r.cash.received), M(r.cash.paid_out), M(r.cash.received - r.cash.paid_out)])}
      </section>

      <section className="ds-sec"><h2 data-block>{l.aging}</h2>
        {table([l.aging, l.amount], (['current', 'd31_60', 'd61_90', 'd90_plus'] as const).map((b) => [l[b], M(r.receivables.buckets[b])]).concat(r.receivables.unverified > 0 ? [[l.unverified, M(r.receivables.unverified)]] : []), [l.total, M(r.receivables.total)])}
      </section>

      {(r.treasury || []).length > 0 && <section className="ds-sec"><h2 data-block>{l.balances}</h2>
        {table([l.account, l.balance], r.treasury.map((b: Row) => [enumLabel('treasury_account', b.code, lang), M(b.balance)]))}
      </section>}

      <section className="ds-sec"><h2 data-block>{l.tb} — {r.trial_balance.balanced ? l.balanced : l.notBalanced}</h2>
        {table([l.account, l.debit, l.credit, l.balance], r.trial_balance.rows.map((a: Row) => [`${a.account} ${(ACCOUNTS as any)[a.account]?.[lang] || ''}`, M(a.debit), M(a.credit), M(a.balance)]), [l.total, M(r.trial_balance.debit), M(r.trial_balance.credit), ''])}
      </section>

      <p className="ds-small" data-block>{l.note}</p>
      <footer className="ds-foot" data-block>
        <div><span className="num" dir="ltr">{c['contact.phone'] || '0537717716'}</span><span>·</span><span dir="ltr">{c['contact.website'] || 'cleansense.co'}</span></div>
        <strong>CLEAN YOU CAN FEEL</strong>
      </footer>
    </div>
  );
});
