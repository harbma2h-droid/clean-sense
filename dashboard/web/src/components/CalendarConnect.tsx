import { useState } from 'react';
import { CalendarPlus, Copy, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { useT } from '../i18n';
import { Modal } from '../ui';

/**
 * Subscribe a phone or computer calendar to the user's bookings and tasks.
 * One private address; calendar apps refresh it themselves, and edits or cancellations update
 * the same event (no duplicates). Google refreshes subscribed calendars only every few hours.
 */
export function CalendarConnect() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  const load = async (reset = false) => {
    setErr('');
    try {
      const r = await api<{ path: string }>('/auth/calendar', { method: 'POST', body: reset ? { reset: true } : {} });
      setUrl(location.origin + r.path);
      setCopied(false);
    } catch {
      setErr(t('error'));
    }
  };
  const webcal = url.replace(/^https?:/, 'webcal:');

  return (
    <>
      <button className="btn" onClick={() => { setOpen(true); if (!url) load(); }}><CalendarPlus size={18} />{t('cal_connect')}</button>
      {open && (
        <Modal title={t('cal_connect')} onClose={() => setOpen(false)}>
          <p className="small">{t('cal_intro')}</p>
          {err && <p className="err">{err}</p>}
          {!url ? <p className="muted">{t('loading')}</p> : (
            <div className="send-actions cal-actions">
              <a className="primary" href={webcal}>{t('cal_apple')}</a>
              <a className="btn" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noreferrer">{t('cal_google')}</a>
              <a className="btn" href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent('Clean Sense')}`} target="_blank" rel="noreferrer">{t('cal_outlook')}</a>
              <button className="btn" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))}><Copy size={16} />{copied ? t('copied') : t('cal_copy')}</button>
            </div>
          )}
          <p className="small muted">{t('cal_note')}</p>
          {url && <button className="ghost small" onClick={() => load(true)}><RefreshCw size={14} />{t('cal_reset')}</button>}
        </Modal>
      )}
    </>
  );
}
