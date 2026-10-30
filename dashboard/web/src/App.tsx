import { useContext, useEffect, useMemo, useState } from 'react';
import emblem from './assets/brand/logo-mark.svg';
import { Home as HomeIcon, Inbox, CalendarClock, FolderKanban, FileText, Receipt, Wallet, TrendingDown, BarChart3, Contact, FileSignature, HardHat, ListChecks, Users as UsersIcon, Landmark, Settings as SettingsIcon, LogOut, Menu, Languages, Banknote, Building2, DoorOpen, MapPin } from 'lucide-react';
import { PERMISSIONS, applyLists } from '@shared/model.js';
import { MetaContext, type Meta } from './meta';
import { Treasury } from './pages/Treasury';
import { Settings } from './pages/Settings';
import { api, isDemo, type User } from './api';
import { LangContext, applyDir, pick, useT, type Key, type Lang } from './i18n';
import { Login, ChangePassword } from './pages/Login';
import { Home } from './pages/Home';
import { TablePage } from './pages/TablePage';
import { Documents } from './pages/Documents';
import { Doc } from './pages/Doc';
import { Payments } from './pages/Payments';
import { Reports } from './pages/Reports';
import { Customer } from './pages/Customer';
import { Users } from './pages/Users';
import { DocPrint } from './pages/DocPrint';
import { Payroll } from './pages/Payroll';


type NavItem = { route: string; perm: string; Icon: any; label: Key | null };
const NAV: { group: Key | null; items: NavItem[] }[] = [
  { group: null, items: [{ route: '', perm: 'dashboard', Icon: HomeIcon, label: null }] },
  { group: 'nav_sales', items: [
    { route: 't/leads', perm: 'leads', Icon: Inbox, label: null },
    { route: 'sales/quotes', perm: 'sales', Icon: FileText, label: 'quotes' },
    { route: 'sales/invoices', perm: 'sales', Icon: Receipt, label: 'invoices' },
    { route: 'sales/contracts', perm: 'sales', Icon: FileSignature, label: 'contracts' },
    { route: 't/customers', perm: 'customers', Icon: Contact, label: 'customers' },
  ] },
  { group: 'nav_ops', items: [
    { route: 't/bookings', perm: 'bookings', Icon: CalendarClock, label: null },
    { route: 't/projects', perm: 'projects', Icon: FolderKanban, label: null },
    { route: 't/tasks', perm: 'tasks', Icon: ListChecks, label: null },
    { route: 't/workers', perm: 'workers', Icon: HardHat, label: null },
  ] },
  { group: 'nav_buildings', items: [
    { route: 't/sites', perm: 'buildings', Icon: Building2, label: 'sites' },
    { route: 't/units', perm: 'buildings', Icon: DoorOpen, label: 'units' },
    { route: 't/zones', perm: 'buildings', Icon: MapPin, label: 'zones' },
  ] },
  { group: 'nav_finance', items: [
    { route: 'payments', perm: 'finance', Icon: Wallet, label: 'payments' },
    { route: 't/expenses', perm: 'finance', Icon: TrendingDown, label: 'expenses' },
    { route: 'payroll', perm: 'finance', Icon: Banknote, label: 'payroll' },
    { route: 'treasury', perm: 'finance', Icon: Landmark, label: 'treasury' },
    { route: 'reports', perm: 'reports', Icon: BarChart3, label: 'reports' },
  ] },
  { group: 'nav_admin', items: [
    { route: 'users', perm: 'users', Icon: UsersIcon, label: null },
    { route: 'settings', perm: 'settings', Icon: SettingsIcon, label: 'settings' },
  ] },
];
// Bottom bar on phones: the four most used screens for this user.
const MOBILE_PRIORITY = ['', 'sales/quotes', 't/bookings', 'sales/invoices', 'payments', 't/leads', 't/tasks'];

function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, '');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (r: string) => { location.hash = `#/${r}`; };

export function App() {
  const [lang, setLangState] = useState<Lang>(() => (localStorageGet('cs_lang') as Lang) || 'ar');
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => applyDir(lang), [lang]);
  useEffect(() => {
    api<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);
  useEffect(() => {
    if (user && !user.must_change_password) {
      if (user.language && user.language !== lang) setLangState(user.language);
      api<Meta>('/meta').then((m) => { applyLists(m.company || {}); setMeta(m); }).catch(() => {});
    }
  }, [user]);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorageSet('cs_lang', l);
    if (user) api('/auth/me', { method: 'PATCH', body: { language: l } }).catch(() => {});
  };

  const ctx = useMemo(() => ({ lang, setLang }), [lang, user]);
  return (
    <LangContext.Provider value={ctx}>
      {user === undefined ? <div className="splash"><img src={emblem} alt="" /></div>
        : user === null ? <Login onDone={setUser} />
        : user.must_change_password ? <ChangePassword onDone={setUser} forced />
        : <MetaContext.Provider value={meta}><Shell user={user} meta={meta} onLogout={() => setUser(null)} onMeta={setMeta} /></MetaContext.Provider>}
    </LangContext.Provider>
  );
}

function Shell({ user, meta, onLogout, onMeta }: { user: User; meta: Meta | null; onLogout: () => void; onMeta: (m: Meta) => void }) {
  const t = useT();
  const { lang, setLang } = useLangCtx();
  const route = useRoute();
  const [moreOpen, setMoreOpen] = useState(false);
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((n) => user.permissions.includes(n.perm)) })).filter((g) => g.items.length);
  const items = groups.flatMap((g) => g.items);
  const label = (n: NavItem) => (n.label ? t(n.label) : pick((PERMISSIONS as any)[n.perm], lang));
  const isActive = (r: string) => (r === '' ? route === '' : route === r || route.startsWith(r + '/'));
  const primary = MOBILE_PRIORITY.map((r) => items.find((n) => n.route === r)).filter(Boolean).slice(0, 4) as NavItem[];
  const rest = items.filter((n) => !primary.includes(n));

  useEffect(() => setMoreOpen(false), [route]);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    onLogout();
  };

  let page;
  const [path, qs] = route.split('?');
  const parts = path.split('/');
  const has = (p: string) => user.permissions.includes(p);
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  if (parts[0] === 't' && items.some((n) => n.route === `t/${parts[1]}`)) page = <TablePage key={parts[1]} table={parts[1]} />;
  else if (parts[0] === 'sales' && has('sales') && ['quotes', 'invoices', 'contracts'].includes(parts[1])) page = <Documents kind={parts[1].slice(0, -1) as any} />;
  else if (parts[0] === 'doc' && parts[1] === 'new' && has('sales')) page = <Doc key={route} kind={parts[2] as any} customerId={query.c} user={user} />;
  else if (parts[0] === 'doc' && (has('sales') || has('finance'))) page = <Doc key={parts[1]} id={parts[1]} user={user} />;
  else if (parts[0] === 'print' && parts[1] !== 'receipt' && (has('sales') || has('finance'))) page = <DocPrint id={parts[1]} />;
  else if (parts[0] === 'customer' && (has('customers') || has('finance'))) page = <Customer id={parts[1]} />;
  else if (parts[0] === 'payments' && has('finance')) page = <Payments />;
  else if (parts[0] === 'reports' && has('reports')) page = <Reports />;
  else if (parts[0] === 'treasury' && has('finance')) page = <Treasury />;
  else if (parts[0] === 'payroll' && has('finance')) page = <Payroll key={parts[1] || 'list'} runId={parts[1]} />;
  else if (parts[0] === 'settings' && has('settings')) page = <Settings onSaved={(company) => { applyLists(company); if (meta) onMeta({ ...meta, company }); }} />;
  else if (parts[0] === 'print' && parts[1] === 'receipt' && has('finance')) page = <DocPrint paymentId={parts[2]} />;
  else if (parts[0] === 'users' && has('users')) page = <Users me={user} meta={meta} />;
  else page = <Home user={user} />;

  return (
    <div className="shell">
      {isDemo && <div className="demo-bar">{t('demo_banner')}</div>}
      <aside className="side">
        <div className="brand"><img src={emblem} alt="" /><span>{t('app_name')}</span></div>
        <nav>{groups.map((g, i) => (
          <div key={i} className="nav-group">
            {g.group && <span className="nav-title">{t(g.group)}</span>}
            {g.items.map((n) => <a key={n.route} href={`#/${n.route}`} className={isActive(n.route) ? 'on' : ''}><n.Icon size={19} />{label(n)}</a>)}
          </div>
        ))}</nav>
        <div className="side-foot">
          <button className="ghost" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Languages size={18} />{lang === 'ar' ? 'English' : 'العربية'}</button>
          {!meta?.open_access && <button className="ghost" onClick={logout}><LogOut size={18} />{t('logout')}</button>}
          <small className="muted">{user.name}</small>
        </div>
      </aside>
      <header className="top">
        <div className="brand"><img src={emblem} alt="" /><span>{t('app_name')}</span></div>
        <button className="ghost small" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label="language">{lang === 'ar' ? 'EN' : 'ع'}</button>
      </header>
      <main className="main">{page}</main>
      <nav className="bottom">
        {primary.map((n) => (
          <a key={n.route} href={`#/${n.route}`} className={isActive(n.route) ? 'on' : ''}><n.Icon size={22} /><span>{label(n)}</span></a>
        ))}
        {(rest.length > 0 || !meta?.open_access) && (
          <button className={moreOpen ? 'on' : ''} onClick={() => setMoreOpen(!moreOpen)}><Menu size={22} /><span>{t('more')}</span></button>
        )}
      </nav>
      {moreOpen && (
        <div className="overlay" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {/* Home is always one tap away, also from this menu. */}
            <a href="#/" className={route === '' ? 'on' : ''} onClick={() => setMoreOpen(false)}><HomeIcon size={20} />{t('home')}</a>
            {rest.map((n) => <a key={n.route} href={`#/${n.route}`}><n.Icon size={20} />{label(n)}</a>)}
            {!meta?.open_access && <button onClick={logout}><LogOut size={20} />{t('logout')}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

const useLangCtx = () => useContext(LangContext);

function localStorageGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

