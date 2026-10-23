import { useEffect, useState } from 'react';
import { enumLabel } from '@shared/model.js';
import { api, type Row, type User } from '../api';
import { useT, type Key } from '../i18n';
import { Badge, money, useLang, waLink } from '../ui';

type Summary = Record<string, any> & { today?: Row[] };

const TILES: { key: Key; href: string; money?: boolean; tone?: (s: Summary) => string }[] = [
  { key: 'leads_new', href: 't/leads', tone: (s) => (s.leads_new ? 'hot' : '') },
  { key: 'quotes_pending_approval', href: 'sales/quotes', tone: (s) => (s.quotes_pending_approval ? 'hot' : '') },
  { key: 'bookings_today', href: 't/bookings' },
  { key: 'bookings_upcoming', href: 't/bookings' },
  { key: 'quotes_open', href: 'sales/quotes' },
  { key: 'invoices_draft', href: 'sales/invoices' },
  { key: 'invoiced_month', href: 'reports', money: true },
  { key: 'collected_month', href: 'payments', money: true, tone: () => 'pos' },
  { key: 'expenses_month', href: 't/expenses', money: true },
  { key: 'profit_month', href: 'reports', money: true, tone: (s) => (s.profit_month < 0 ? 'neg' : 'pos') },
  { key: 'receivable_confirmed', href: 'reports', money: true },
  { key: 'overdue_count', href: 'sales/invoices', tone: (s) => (s.overdue_count ? 'neg' : '') },
  { key: 'receivable_unverified', href: 'reports', money: true, tone: (s) => (s.receivable_unverified ? 'hot' : '') },
  { key: 'projects_active', href: 't/projects' },
  { key: 'tasks_open', href: 't/tasks' },
];

export function Home({ user }: { user: User }) {
  const t = useT();
  const lang = useLang();
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => { api<Summary>('/summary').then(setS).catch(() => setS({})); }, []);
  if (!s) return <p className="muted pad">{t('loading')}</p>;

  const tiles = TILES.filter((x) => s[x.key] !== undefined && !(x.key === 'receivable_unverified' && !s[x.key]));

  return (
    <div className="page">
      <h1 className="hello">{t('hello')} {user.name} 👋</h1>
      <div className="tiles">
        {tiles.map((x) => (
          <a key={x.key} href={`#/${x.href}`} className={`tile ${x.tone?.(s) || ''}`}>
            <span className="tile-label">{t(x.key)}</span>
            <b className="num">{x.money ? money(s[x.key], lang) : s[x.key]}</b>
          </a>
        ))}
      </div>

      {s.today && (
        <section className="card">
          <h2>{t('today_schedule')}</h2>
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
