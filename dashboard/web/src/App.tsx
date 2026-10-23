import { useContext, useEffect, useMemo, useState } from 'react';
import emblem from './assets/emblem.webp';
import { Home as HomeIcon, Inbox, CalendarClock, FolderKanban, FileText, Wallet, HardHat, ListChecks, Users as UsersIcon, LogOut, Menu, Languages } from 'lucide-react';
import { PERMISSIONS } from '@shared/model.js';
import { api, isDemo, type User } from './api';
import { LangContext, applyDir, pick, useT, type Lang } from './i18n';
import { Login, ChangePassword } from './pages/Login';
import { Home } from './pages/Home';
import { TablePage } from './pages/TablePage';
import { Finance } from './pages/Finance';
import { Users } from './pages/Users';
import { DocPrint } from './pages/DocPrint';

export type Meta = { company: Record<string, string>; roles: Record<string, { ar: string; en: string; perms: string[] }>; open_access?: boolean };

const NAV = [
  { route: '', perm: 'dashboard', Icon: HomeIcon },
  { route: 't/leads', perm: 'leads', Icon: Inbox },
  { route: 't/bookings', perm: 'bookings', Icon: CalendarClock },
  { route: 't/documents', perm: 'documents', Icon: FileText },
  { route: 'finance', perm: 'finance', Icon: Wallet },
  { route: 't/projects', perm: 'projects', Icon: FolderKanban },
  { route: 't/workers', perm: 'workers', Icon: HardHat },
  { route: 't/tasks', perm: 'tasks', Icon: ListChecks },
  { route: 'users', perm: 'users', Icon: UsersIcon },
];

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
      api<Meta>('/meta').then(setMeta).catch(() => {});
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
        : <Shell user={user} meta={meta} onLogout={() => setUser(null)} />}
    </LangContext.Provider>
  );
}

function Shell({ user, meta, onLogout }: { user: User; meta: Meta | null; onLogout: () => void }) {
  const t = useT();
  const { lang, setLang } = useLangCtx();
  const route = useRoute();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = NAV.filter((n) => user.permissions.includes(n.perm));
  const label = (perm: string) => (perm === 'finance' ? t('finance') : pick((PERMISSIONS as any)[perm], lang));
  const isActive = (r: string) => (r === '' ? route === '' : route === r || route.startsWith(r + '/'));
  const primary = items.slice(0, 4);
  const rest = items.slice(4);

  useEffect(() => setMoreOpen(false), [route]);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    onLogout();
  };

  let page;
  const [kind, arg] = [route.split('/')[0], route.split('/').slice(1).join('/')];
  if (kind === 't' && items.some((n) => n.route === `t/${arg}`)) page = <TablePage key={arg} table={arg} />;
  else if (kind === 'finance' && user.permissions.includes('finance')) page = <Finance />;
  else if (kind === 'users' && user.permissions.includes('users')) page = <Users me={user} meta={meta} />;
  else if (kind === 'doc' && user.permissions.includes('documents')) page = <DocPrint id={arg} meta={meta} />;
  else page = <Home user={user} />;

  return (
    <div className="shell">
      {isDemo && <div className="demo-bar">{t('demo_banner')}</div>}
      <aside className="side">
        <div className="brand"><img src={emblem} alt="" /><span>{t('app_name')}</span></div>
        <nav>{items.map((n) => (
          <a key={n.route} href={`#/${n.route}`} className={isActive(n.route) ? 'on' : ''}><n.Icon size={20} />{label(n.perm)}</a>
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
          <a key={n.route} href={`#/${n.route}`} className={isActive(n.route) ? 'on' : ''}><n.Icon size={22} /><span>{label(n.perm)}</span></a>
        ))}
        {(rest.length > 0 || !meta?.open_access) && (
          <button className={moreOpen ? 'on' : ''} onClick={() => setMoreOpen(!moreOpen)}><Menu size={22} /><span>{t('more')}</span></button>
        )}
      </nav>
      {moreOpen && (
        <div className="overlay" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {rest.map((n) => <a key={n.route} href={`#/${n.route}`}><n.Icon size={20} />{label(n.perm)}</a>)}
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

