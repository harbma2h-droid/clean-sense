// Turns a rendered DocSheet into an A4 PDF file in the browser.
// Pages break between blocks (rows, sections), never through a line of text.

const A4_W = 210;
const A4_H = 297;
const MARGIN = 10; // mm, top and bottom of every page

export async function sheetToPdf(el: HTMLElement, fileName: string): Promise<File> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  await document.fonts?.ready;
  const scale = 2;
  // Rendered by the browser itself (SVG foreignObject), so Arabic shaping and direction are exact.
  const canvas = await toCanvas(el, { pixelRatio: scale, backgroundColor: '#ffffff', cacheBust: true, width: el.offsetWidth, height: el.scrollHeight, style: { margin: '0', boxShadow: 'none' } });

  // Safe break positions (in CSS px from the top of the sheet): the bottom of every block.
  const top = el.getBoundingClientRect().top;
  const breaks = [...el.querySelectorAll<HTMLElement>('[data-block]')].map((b) => b.getBoundingClientRect().bottom - top).sort((a, b) => a - b);

  const pxPerMm = el.offsetWidth / A4_W;
  const pageCss = (A4_H - 2 * MARGIN) * pxPerMm;
  const total = el.scrollHeight;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  let start = 0;
  let page = 0;
  while (total - start > 12) { // ignore a sliver of empty space left by rounding
    // The first page uses the sheet's own top padding; later pages get a top margin.
    const single = total <= A4_H * pxPerMm + 12;
    const room = single ? total : page === 0 ? (A4_H - MARGIN) * pxPerMm : pageCss;
    let end = Math.min(start + room, total);
    if (end < total) {
      const safe = breaks.filter((b) => b > start + room * 0.5 && b <= end);
      if (safe.length) end = safe[safe.length - 1];
    }
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.ceil((end - start) * scale);
    const ctx = slice.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, Math.floor(start * scale), canvas.width, Math.min(slice.height, canvas.height - Math.floor(start * scale)), 0, 0, canvas.width, Math.min(slice.height, canvas.height - Math.floor(start * scale)));
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, page === 0 ? 0 : MARGIN, A4_W, (end - start) / pxPerMm);
    start = end;
    page++;
  }
  const n = pdf.getNumberOfPages();
  if (n > 1) {
    for (let i = 1; i <= n; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(`${i} / ${n}`, A4_W / 2, A4_H - 5, { align: 'center' });
    }
  }
  return new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
}

export async function downloadFile(file: File) {
  // Inside the claude.ai preview the page may not download directly: use its save capability.
  const host = (window as any).claude;
  if (host?.use) {
    const downloads = await host.use('downloads').catch(() => null);
    if (downloads) {
      try { await downloads.save({ filename: file.name, data: file }); } catch { /* declined or unavailable */ }
      return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Share the PDF through the phone's share sheet (WhatsApp appears there). Returns false when not supported. */
export async function sharePdf(file: File, text: string): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], text });
    return true;
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return true; // user closed the sheet
    return false;
  }
}
