import { useEffect, useState } from 'react';
import { enumLabel } from '@shared/model.js';
import { api, type Row, type User } from '../api';
import { useT, type Key } from '../i18n';
import { Badge, money, useLang, waLink } from '../ui';

type Summary = Partial<Record<'bookings_today' | 'bookings_upcoming' | 'bookings_pending' | 'leads_new' | 'revenue_month' | 'expenses_month' | 'projects_active' | 'tasks_open', number>> & { today?: Row[] };

const TILES: { key: Key; href: string; money?: boolean }[] = [
  { key: 'leads_new', href: 't/leads' },
  { key: 'bookings_today', href: 't/bookings' },
  { key: 'bookings_pending', href: 't/bookings' },
  { key: 'bookings_upcoming', href: 't/bookings' },
  { key: 'revenue_month', href: 'finance', money: true },
  { key: 'expenses_month', href: 'finance', money: true },
  { key: 'projects_active', href: 't/projects' },
  { key: 'tasks_open', href: 't/tasks' },
];

export function Home({ user }: { user: User }) {
  const t = useT();
  const lang = useLang();
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => { api<Summary>('/summary').then(setS).catch(() => setS({})); }, []);
  if (!s) return <p className="muted pad">{t('loading')}</p>;

  const tiles = TILES.filter((x) => (s as any)[x.key] !== undefined);
  const hasFinance = s.revenue_month !== undefined;
  const net = (s.revenue_month || 0) - (s.expenses_month || 0);

  return (
    <div className="page">
      <h1 className="hello">{t('hello')} {user.name} 👋</h1>
      <div className="tiles">
        {tiles.map((x) => (
          <a key={x.key} href={`#/${x.href}`} className={`tile ${x.key === 'leads_new' && s.leads_new ? 'hot' : ''}`}>
            <span className="tile-label">{t(x.key)}</span>
            <b className="num">{x.money ? money((s as any)[x.key], lang) : (s as any)[x.key]}</b>
          </a>
        ))}
        {hasFinance && (
          <a href="#/finance" className={`tile ${net < 0 ? 'neg' : 'pos'}`}>
            <span className="tile-label">{t('net_month')}</span><b className="num">{money(net, lang)}</b>
          </a>
        )}
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
