import { useState, type FormEvent } from 'react';
import emblem from '../assets/emblem.webp';
import { api, ApiError, type User } from '../api';
import { useT, type Key } from '../i18n';

export function Login({ onDone }: { onDone: (u: User) => void }) {
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      onDone(await api<User>('/auth/login', { method: 'POST', body: { username, password } }));
    } catch (x) {
      const code = x instanceof ApiError ? x.code : 'error';
      setErr(t((['invalid_credentials', 'too_many_attempts'].includes(code) ? code : 'error') as Key));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <img src={emblem} alt="" className="auth-logo" />
        <h1>{t('app_name')}</h1>
        <div className="field"><label htmlFor="u">{t('username')}</label>
          <input id="u" autoComplete="username" dir="ltr" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
        <div className="field"><label htmlFor="p">{t('password')}</label>
          <input id="p" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="primary" disabled={busy}>{t('login')}</button>
      </form>
    </div>
  );
}

export function ChangePassword({ onDone, forced }: { onDone: (u: User) => void; forced?: boolean }) {
  const t = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      onDone(await api<User>('/auth/password', { method: 'POST', body: { current, next } }));
    } catch (x) {
      const code = x instanceof ApiError ? x.code : 'error';
      setErr(t((['wrong_password', 'password_short', 'password_weak'].includes(code) ? code : 'error') as Key));
    }
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>{t('change_password')}</h1>
        {forced && <p className="muted">{t('must_change')}</p>}
        <div className="field"><label htmlFor="c">{t('current_password')}</label>
          <input id="c" type="password" autoComplete="current-password" dir="ltr" value={current} onChange={(e) => setCurrent(e.target.value)} required /></div>
        <div className="field"><label htmlFor="n">{t('new_password')}</label>
          <input id="n" type="password" autoComplete="new-password" dir="ltr" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
          <small className="muted">{t('password_rule')}</small></div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="primary">{t('save')}</button>
      </form>
    </div>
  );
}
