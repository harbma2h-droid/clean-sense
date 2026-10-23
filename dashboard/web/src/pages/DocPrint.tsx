import { useEffect, useRef, useState } from 'react';
import { Printer, ArrowRight, ArrowLeft, Download, Send } from 'lucide-react';
import { api, type Row } from '../api';
import { useT } from '../i18n';
import { useLang, useLookup } from '../ui';
import { useCompany } from '../meta';
import { DocSheet } from '../components/DocSheet';
import { SendDialog } from '../components/SendDialog';
import { downloadFile, sheetToPdf } from '../pdf';

/** Full-page view of a document (or a payment receipt) as it will look on paper / in the PDF. */
export function DocPrint({ id, paymentId }: { id?: string; paymentId?: string }) {
  const t = useT();
  const uiLang = useLang();
  const company = useCompany();
  const customers = useLookup(paymentId ? 'customers' : undefined);
  const sheet = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<Row | null | undefined>(undefined);
  const [payment, setPayment] = useState<Row | null | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id) api<Row>(`/sales/documents/${id}`).then(setDoc).catch(() => setDoc(null));
    if (paymentId) api<Row[]>('/payments').then((all) => setPayment(all.find((p) => p.id === paymentId) || null)).catch(() => setPayment(null));
  }, [id, paymentId]);

  const item = id ? doc : payment;
  if (item === undefined) return <p className="muted pad">{t('loading')}</p>;
  if (item === null) return <p className="empty">{t('empty')}</p>;

  const cust = payment ? customers.find((c) => c.id === payment.customer_id) : null;
  const pay: Row | undefined = payment ? { ...payment, customer_phone: cust?.phone || '', language: cust?.language || 'ar' } : undefined;
  const Back = uiLang === 'ar' ? ArrowRight : ArrowLeft;
  const download = async () => {
    setBusy(true);
    try { downloadFile(await sheetToPdf(sheet.current!, `${doc?.doc_number || pay?.receipt_no || 'document'}-Clean-Sense.pdf`)); } finally { setBusy(false); }
  };

  return (
    <div className="page doc-wrap">
      <div className="toolbar no-print">
        <a className="btn" href={doc ? `#/doc/${doc.id}` : '#/payments'}><Back size={18} />{t('back')}</a>
        <span className="grow" />
        <button className="btn" onClick={download} disabled={busy}><Download size={18} />{busy ? t('preparing_pdf') : t('download_pdf')}</button>
        <button className="btn" onClick={() => print()}><Printer size={18} />{t('print')}</button>
        {(doc?.doc_number || pay?.receipt_no) && <button className="primary" onClick={() => setSending(true)}><Send size={18} />{t('send_to_customer')}</button>}
      </div>
      <div className="sheet-wrap"><DocSheet ref={sheet} doc={doc || undefined} payment={pay} company={company} /></div>
      {sending && <SendDialog doc={doc || undefined} payment={pay} company={company} onClose={() => setSending(false)} onDone={() => setSending(false)} />}
    </div>
  );
}
