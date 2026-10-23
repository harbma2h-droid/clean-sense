import { useEffect, useState, type FormEvent } from 'react';
import { Plus, KeyRound } from 'lucide-react';
import { ROLES } from '@shared/model.js';
import { api, ApiError, type Row, type User } from '../api';
import type { Meta } from '../App';
import { useT } from '../i18n';
import { Modal, useLang } from '../ui';

const roleOptions = Object.entries(ROLES as Record<string, { ar: string; en: string }>);

export function Users({ me, meta }: { me: User; meta: Meta | null }) {
  const t = useT();
  const lang = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [temp, setTemp] = useState<{ name: string; username: string; password: string } | null>(null);
  const [err, setErr] = useState('');

  const load = () => api<Row[]>('/users').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const patch = async (u: Row, body: Row) => {
    setErr('');
    try {
      const r = await api<{ user: Row; temporary_password?: string }>(`/users/${u.id}`, { method: 'PATCH', body });
      if (r.temporary_password) setTemp({ name: u.name, username: u.username, password: r.temporary_password });
      load();
    } catch { setErr(t('error')); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('users')}</h1>
        <button className="primary" onClick={() => setAdding(true)}><Plus size={18} />{t('add')}</button>
      </div>
      {meta?.open_access && (
        <p className="note">{lang === 'ar' ? 'تسجيل الدخول متوقف مؤقتاً بطلبك أثناء البناء. الصلاحيات محفوظة وتتفعل لما نرجّع الدخول.' : 'Sign-in is paused at your request while we build. Roles are kept and apply once sign-in is back.'}</p>
      )}
      {err && <p className="err">{err}</p>}
      {!rows ? <p className="muted pad">{t('loading')}</p> : (
        <ul className="cards users">
          {rows.map((u) => (
            <li key={u.id} className={u.active ? '' : 'off'}>
              <div className="card-top">
                <b>{u.name}</b>
                <span className={`badge ${u.active ? 'green' : 'grey'}`}>{u.active ? t('active') : t('inactive')}</span>
              </div>
              <small className="muted" dir="auto">{u.username ? `@${u.username}` : t('no_login')} · {u.job_title || ''}</small>
              <div className="row-actions">
                <select aria-label={t('role')} value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u, { role: e.target.value })}>
                  {roleOptions.map(([k, l]) => <option key={k} value={k}>{l[lang]}</option>)}
                </select>
                {u.id !== me.id && u.username && (
                  <button className="ghost small" onClick={() => patch(u, { active: !u.active })}>{u.active ? t('deactivate') : t('activate')}</button>
                )}
                {u.username && u.id !== me.id && (
                  <button className="ghost small" onClick={() => patch(u, { reset_password: true })}><KeyRound size={16} />{t('reset_password')}</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {adding && <AddUser onClose={() => setAdding(false)} onDone={(r) => { setAdding(false); setTemp(r); load(); }} />}
      {temp && (
        <Modal title={temp.name} onClose={() => setTemp(null)}>
          <p>{t('temp_password')}</p>
          <p className="secret" dir="ltr"><span className="muted">@{temp.username}</span><br /><b className="num">{temp.password}</b></p>
          <div className="modal-foot"><span className="grow" /><button className="primary" onClick={() => setTemp(null)}>OK</button></div>
        </Modal>
      )}
    </div>
  );
}

function AddUser({ onClose, onDone }: { onClose: () => void; onDone: (r: { name: string; username: string; password: string }) => void }) {
  const t = useT();
  const lang = useLang();
  const [d, setD] = useState({ name: '', username: '', job_title: '', role: 'employee', language: lang });
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ user: Row; temporary_password: string }>('/users', { method: 'POST', body: d });
      onDone({ name: r.user.name, username: r.user.username, password: r.temporary_password });
    } catch (x) {
      setErr(x instanceof ApiError && x.code === 'username_taken' ? t('username_taken') : t('username_rule'));
    }
  };

  return (
    <Modal title={t('add')} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form">
          <div className="field"><label htmlFor="n">{t('name')}</label><input id="n" required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="un">{t('username')}</label>
            <input id="un" required dir="ltr" autoCapitalize="none" pattern="[a-z0-9._\-]{3,30}" value={d.username} onChange={(e) => setD({ ...d, username: e.target.value.toLowerCase() })} />
            <small className="muted">{t('username_rule')}</small></div>
          <div className="field"><label htmlFor="r">{t('role')}</label>
            <select id="r" value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })}>{roleOptions.map(([k, l]) => <option key={k} value={k}>{l[lang]}</option>)}</select></div>
          <div className="field"><label htmlFor="j">{t('job_title')}</label><input id="j" value={d.job_title} onChange={(e) => setD({ ...d, job_title: e.target.value })} /></div>
          <div className="field"><label htmlFor="l">{t('language')}</label>
            <select id="l" value={d.language} onChange={(e) => setD({ ...d, language: e.target.value as 'ar' | 'en' })}><option value="ar">العربية</option><option value="en">English</option></select></div>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="modal-foot"><span className="grow" /><button type="button" className="ghost" onClick={onClose}>{t('cancel')}</button><button className="primary">{t('save')}</button></div>
      </form>
    </Modal>
  );
}
