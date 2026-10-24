import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, MessageCircle, Share2, Pencil } from 'lucide-react';
import { MONEY_FMT, enumLabel } from '@shared/model.js';
import { validPhone } from '@shared/services.js';
import { api, type Row } from '../api';
import { useT } from '../i18n';
import { Modal, errText, useLang, waLink } from '../ui';
import { DocSheet } from './DocSheet';
import { downloadFile, sharePdf, sheetToPdf } from '../pdf';

const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

/**
 * Send a quote, invoice or receipt to the customer.
 * The number is the customer's saved mobile (changeable here). For quotes and invoices the main
 * button opens WhatsApp straight on the customer's chat with a private link to view and download
 * the document, so nobody has to pick a contact. Sharing or downloading the PDF stays available.
 */
export function SendDialog({ doc, payment, company, onClose, onDone }: { doc?: Row; payment?: Row; company: Record<string, string>; onClose: () => void; onDone?: () => void }) {
  const t = useT();
  const uiLang = useLang();
  const sheet = useRef<HTMLDivElement>(null);
  const lang: 'ar' | 'en' = (doc?.language || payment?.language) === 'en' ? 'en' : 'ar';
  const kind = payment ? 'receipt' : doc!.type === 'quote' ? 'quote' : 'invoice';
  const origPhone = String((doc ? doc.send_phone || doc.customer_phone : payment?.customer_phone) || '');
  const [phone, setPhone] = useState(origPhone);
  const [editingPhone, setEditingPhone] = useState(!validPhone(origPhone));
  const [saveToCustomer, setSaveToCustomer] = useState(true);
  const number = (payment ? payment.receipt_no : doc!.doc_number) || '';
  const vars = {
    name: (doc ? doc.customer_name : payment!.customer_name) || '',
    number,
    total: MONEY_FMT(payment ? payment.amount : doc!.total_value, lang),
    balance: MONEY_FMT(doc?.balance ?? 0, lang),
    company: lang === 'ar' ? 'كلين سنس' : 'Clean Sense',
  };
  const [text, setText] = useState(fill(company[`wa.${kind}_${lang}`] || '', vars));
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const okPhone = validPhone(phone);

  // The customer's link is made once per document and reused, so a link already sent keeps working.
  useEffect(() => {
    if (!doc || !doc.doc_number || ['void', 'cancelled'].includes(doc.status)) return;
    api<{ path: string }>(`/sales/documents/${doc.id}/link`, { method: 'POST' }).then((r) => setLink(location.origin + r.path)).catch(() => setLink(''));
  }, [doc?.id]);

  const message = link ? `${text}\n\n${lang === 'ar' ? 'تقدر تشوفه وتحمّله من هنا:' : 'View and download it here:'}\n${link}` : text;
  const typeName = payment ? (lang === 'ar' ? 'سند-قبض' : 'Receipt') : enumLabel('doc_type', doc!.type, lang).replace(/\s+/g, '-');
  const fileName = `${typeName}-${number || 'draft'}-${lang === 'ar' ? 'كلين-سنس' : 'Clean-Sense'}.pdf`;

  /** Save a changed number (document + optionally the customer record) before sending. */
  const syncPhone = async () => {
    if (!doc || phone === origPhone || !okPhone) return;
    await api(`/sales/documents/${doc.id}/phone`, { method: 'POST', body: { phone: okPhone, update_customer: saveToCustomer } });
  };
  const logShared = (via: string) => (doc ? api(`/sales/documents/${doc.id}/shared`, { method: 'POST', body: { via, phone: okPhone } }).catch(() => {}) : Promise.resolve());

  /** WhatsApp straight to the customer's chat: a real link, so phones open WhatsApp without a popup blocker. */
  const sendWhatsApp = () => {
    syncPhone().catch(() => {});
    logShared('whatsapp_link').then(() => onDone?.());
  };

  const run = async (via: 'share' | 'whatsapp' | 'download') => {
    setErr('');
    setNote('');
    setBusy(via);
    try {
      await syncPhone();
      const file = await sheetToPdf(sheet.current!, fileName);
      if (via === 'share') {
        if (!(await sharePdf(file, message))) {
          downloadFile(file);
          window.open(waLink(okPhone, message), '_blank');
          setNote(t('pdf_downloaded_attach'));
        }
      } else if (via === 'whatsapp') {
        downloadFile(file);
        window.open(waLink(okPhone, message), '_blank');
        setNote(t('pdf_downloaded_attach'));
      } else {
        downloadFile(file);
      }
      if (via !== 'download') await logShared(via === 'share' ? 'pdf' : 'whatsapp');
      if (via !== 'download') onDone?.();
    } catch (x) {
      setErr(errText(t, x));
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal title={`${t('send_to_customer')} — ${number}`} onClose={onClose}>
      <div className="send">
        <div className="field">
          <label htmlFor="sp">{t('send_to_number')}</label>
          {editingPhone ? (
            <>
              <input id="sp" type="tel" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" autoFocus />
              {phone && !okPhone && <small className="err">{t('phone_invalid')}</small>}
              {!origPhone && <small className="muted">{t('no_saved_number')}</small>}
              {doc && phone !== origPhone && okPhone && (
                <label className="check"><input type="checkbox" checked={saveToCustomer} onChange={(e) => setSaveToCustomer(e.target.checked)} />{t('save_number_to_customer')}</label>
              )}
            </>
          ) : (
            <div className="phone-row">
              <b className="num" dir="ltr">{okPhone}</b>
              <small className="muted">{t('registered_number')} · {vars.name}</small>
              <button type="button" className="ghost small" onClick={() => setEditingPhone(true)}><Pencil size={14} />{t('change_number')}</button>
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="st">{t('message')}</label>
          <textarea id="st" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          {link && <div className="link-row"><small className="muted">{t('link_added')}</small><code>{link}</code></div>}
        </div>
        <div className="send-actions">
          {doc ? (
            okPhone && link
              ? <a className="primary wa-btn" href={waLink(okPhone, message)} target="_blank" rel="noreferrer" onClick={sendWhatsApp}><MessageCircle size={18} />{t('whatsapp_customer')}</a>
              : <button className="primary wa-btn" disabled><MessageCircle size={18} />{okPhone ? t('loading') : t('whatsapp_customer')}</button>
          ) : (
            <button className="primary wa-btn" disabled={!!busy || !okPhone} onClick={() => run('whatsapp')}><MessageCircle size={18} />{t('whatsapp_text_pdf')}</button>
          )}
          <button className="btn" disabled={!!busy} onClick={() => run('share')}><Share2 size={18} />{busy === 'share' ? t('preparing_pdf') : t('share_pdf')}</button>
          <button className="btn" disabled={!!busy} onClick={() => run('download')}><Download size={18} />{busy === 'download' ? t('preparing_pdf') : t('download_pdf')}</button>
        </div>
        <p className="small muted">{doc ? t('send_link_hint') : t('share_hint')}</p>
        {note && <p className="note">{note}</p>}
        {err && <p className="err">{err}</p>}
        <details className="preview">
          <summary>{t('preview')}</summary>
          <div className="preview-wrap"><div className="preview-scale"><DocSheet doc={doc} payment={payment} company={company} /></div></div>
        </details>
      </div>
      {/* Full-size copy used to make the PDF, kept out of view. */}
      {createPortal(<div className="pdf-stage" aria-hidden="true" lang={uiLang}><DocSheet ref={sheet} doc={doc} payment={payment} company={company} /></div>, document.body)}
    </Modal>
  );
}
