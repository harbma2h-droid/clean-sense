// Accounting rules for Clean Sense, as pure functions over the stored records.
//
// Single source of truth: invoices, payments and expenses are the only financial
// records. Balances, payment states, journal entries and every report are derived
// from them on the fly, so nothing is entered twice and nothing can drift apart.
//
// Basis: an issued invoice is revenue (accrual). An accepted quotation is a customer
// commitment only: it creates no revenue and no receivable. Money is "collected"
// only when a payment is recorded.

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const live = (rows) => (rows || []).filter((r) => !r.deleted_at);
const day = (s) => String(s || '').slice(0, 10);

export const ACCOUNTS = {
  1010: { ar: 'الصندوق (كاش)', en: 'Cash on hand', kind: 'asset' },
  1020: { ar: 'البنك (تحويل وشبكة)', en: 'Bank (transfers & card)', kind: 'asset' },
  1040: { ar: 'STC Pay', en: 'STC Pay', kind: 'asset' },
  1090: { ar: 'طرق دفع أخرى', en: 'Other payment methods', kind: 'asset' },
  1200: { ar: 'ذمم العملاء (مستحقات)', en: 'Accounts receivable', kind: 'asset' },
  2200: { ar: 'دفعات عملاء غير مخصصة', en: 'Unallocated customer payments', kind: 'liability' },
  3100: { ar: 'رأس مال الشركاء', en: "Partners' capital", kind: 'equity' },
  3200: { ar: 'مسحوبات الشركاء', en: "Partners' drawings", kind: 'equity' },
  3900: { ar: 'تسويات الأرصدة الافتتاحية', en: 'Opening balance adjustments', kind: 'equity' },
  4000: { ar: 'إيرادات الخدمات', en: 'Service revenue', kind: 'revenue' },
  5010: { ar: 'مواد', en: 'Supplies', kind: 'expense', cat: 'supplies' },
  5020: { ar: 'وقود', en: 'Fuel', kind: 'expense', cat: 'fuel' },
  5030: { ar: 'نقل عمالة', en: 'Labour transport', kind: 'expense', cat: 'labor_transport' },
  5040: { ar: 'سكن', en: 'Housing', kind: 'expense', cat: 'housing' },
  5050: { ar: 'معدات', en: 'Equipment', kind: 'expense', cat: 'equipment' },
  5060: { ar: 'سيارة', en: 'Vehicle', kind: 'expense', cat: 'vehicle' },
  5070: { ar: 'رواتب وأجور', en: 'Wages', kind: 'expense', cat: 'wages' },
  5080: { ar: 'تسويق', en: 'Marketing', kind: 'expense', cat: 'marketing' },
  5090: { ar: 'مصاريف أخرى', en: 'Other expenses', kind: 'expense', cat: 'other' },
};
// Card (POS) receipts settle into the bank account and card purchases are paid from it, so both use the bank.
export const METHOD_ACCOUNT = { cash: 1010, bank_transfer: 1020, card: 1020, stc_pay: 1040, other: 1090 };
export const TREASURY_ACCOUNT = { cash: 1010, bank: 1020, stc_pay: 1040 };
const expenseAccount = (cat) => Number(Object.keys(ACCOUNTS).find((k) => ACCOUNTS[k].cat === cat) || 5090);
const cashAccount = (method) => METHOD_ACCOUNT[method] || 1090;

/* ---------- Documents ---------- */

/** Parse stored line items. Each item: { description, service, qty, unit_price }. */
export function parseItems(doc) {
  if (Array.isArray(doc.items)) return doc.items;
  try {
    const v = JSON.parse(doc.items || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function computeTotals(items, discount = 0) {
  const lines = items.map((it) => ({ ...it, qty: Number(it.qty) || 0, unit_price: r2(it.unit_price), line_total: r2((Number(it.qty) || 0) * (Number(it.unit_price) || 0)) }));
  const subtotal = r2(lines.reduce((s, l) => s + l.line_total, 0));
  const disc = r2(discount);
  return { lines, subtotal, discount: disc, total: r2(subtotal - disc) };
}

/** Document total. Legacy documents have no line items: their original price is the total. */
export function docTotal(doc) {
  if (doc.total !== undefined && doc.total !== '' && doc.total !== null) return r2(doc.total);
  return r2(doc.price);
}

export const isIssuedInvoice = (d) => d.type === 'invoice' && !d.deleted_at && d.status !== 'draft' && d.status !== 'void';

/** Payments posted against each invoice id. */
export function paidByInvoice(payments) {
  const out = {};
  for (const p of live(payments)) if (p.status !== 'void' && p.invoice_id) out[p.invoice_id] = r2((out[p.invoice_id] || 0) + Number(p.amount));
  return out;
}

/** Collection state of one invoice, derived from its payments. */
export function invoiceState(inv, paid = 0, today = new Date().toISOString().slice(0, 10)) {
  const total = docTotal(inv);
  const balance = r2(total - paid);
  let state;
  if (inv.status === 'void') state = 'void';
  else if (inv.status === 'draft') state = 'draft';
  else if (balance <= 0) state = 'paid';
  else if (inv.legacy === 'yes' && inv.balance_review !== 'confirmed_due') state = 'unverified';
  else if (paid > 0) state = 'partial';
  else if (inv.due_date && day(inv.due_date) < today) state = 'overdue';
  else state = 'unpaid';
  return { total, paid: r2(paid), balance, state };
}

/** Documents enriched with totals and (for invoices) collection state. */
export function enrichDocuments(docs, payments, today) {
  const paid = paidByInvoice(payments);
  return live(docs).map((d) => {
    const base = { ...d, total_value: docTotal(d), items_parsed: parseItems(d) };
    return d.type === 'invoice' ? { ...base, ...invoiceState(d, paid[d.id] || 0, today) } : base;
  });
}

/* ---------- Journal (generated, never typed) ---------- */

/**
 * Double-entry journal generated from invoices, payments and expenses.
 * Voiding creates a reversing entry on the void date, so closed months never change.
 */
export function journal({ documents = [], payments = [], expenses = [], treasury = [] }) {
  const entries = [];
  const push = (date, ref, memo, source, lines) => entries.push({ date: day(date), ref, memo, source, lines: lines.map(([account, debit, credit]) => ({ account, debit: r2(debit), credit: r2(credit) })) });

  for (const d of live(documents)) {
    if (d.type !== 'invoice' || d.status === 'draft') continue;
    const total = docTotal(d);
    if (!total) continue;
    push(d.date, d.doc_number, d.customer_name, { table: 'documents', id: d.id }, [[1200, total, 0], [4000, 0, total]]);
    if (d.status === 'void') push(d.voided_at || d.date, d.doc_number, `إلغاء / void: ${d.void_reason || ''}`, { table: 'documents', id: d.id }, [[4000, total, 0], [1200, 0, total]]);
  }
  for (const p of live(payments)) {
    const amt = r2(p.amount);
    if (!amt) continue;
    const credit = p.invoice_id ? 1200 : 2200;
    const lines = [[cashAccount(p.method), amt, 0], [credit, 0, amt]];
    push(p.date, p.receipt_no || p.invoice_number || 'PAY', p.customer_name, { table: 'payments', id: p.id }, lines);
    if (p.status === 'void') push(p.voided_at || p.date, p.receipt_no || 'PAY', `إلغاء / void: ${p.void_reason || ''}`, { table: 'payments', id: p.id }, lines.map(([a, dr, cr]) => [a, cr, dr]));
  }
  for (const x of live(expenses)) {
    const amt = r2(x.amount);
    if (!amt) continue;
    push(x.date, x.reference || 'EXP', x.notes || x.category, { table: 'expenses', id: x.id }, [[expenseAccount(x.category), amt, 0], [cashAccount(x.method), 0, amt]]);
  }
  for (const t of live(treasury)) {
    if (t.status === 'void') continue;
    const amt = r2(t.amount);
    const acc = TREASURY_ACCOUNT[t.account];
    if (!amt || !acc) continue;
    const src = { table: 'treasury', id: t.id };
    const memo = [t.partner, t.notes].filter(Boolean).join(' — ');
    if (t.kind === 'capital_in') push(t.date, 'CAP', memo, src, [[acc, amt, 0], [3100, 0, amt]]);
    else if (t.kind === 'drawing') push(t.date, 'DRW', memo, src, [[3200, amt, 0], [acc, 0, amt]]);
    else if (t.kind === 'transfer' && TREASURY_ACCOUNT[t.to_account]) push(t.date, 'TRF', memo, src, [[TREASURY_ACCOUNT[t.to_account], amt, 0], [acc, 0, amt]]);
    // A reconciliation stores the signed difference between the real balance and the books.
    else if (t.kind === 'balance_set') push(t.date, 'ADJ', memo, src, amt > 0 ? [[acc, amt, 0], [3900, 0, amt]] : [[3900, -amt, 0], [acc, 0, -amt]]);
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

/** Book balance of one account up to and including a date. */
export function accountBalance(entries, account, to) {
  let bal = 0;
  for (const e of entries) {
    if (to && e.date > to) continue;
    for (const l of e.lines) if (l.account === account) bal += l.debit - l.credit;
  }
  return r2(bal);
}

/** Balances of the money accounts (bank, cash box, STC Pay). */
export function treasuryBalances(entries, to) {
  return Object.entries(TREASURY_ACCOUNT).map(([code, account]) => ({ code, account, balance: accountBalance(entries, account, to) }));
}

/** Contributions and drawings per partner. */
export function partnersEquity(treasury, partners = []) {
  const out = Object.fromEntries(partners.map((p) => [p, { partner: p, capital: 0, drawings: 0 }]));
  for (const t of live(treasury)) {
    if (t.status === 'void' || !['capital_in', 'drawing'].includes(t.kind)) continue;
    const row = (out[t.partner || '—'] ??= { partner: t.partner || '—', capital: 0, drawings: 0 });
    if (t.kind === 'capital_in') row.capital = r2(row.capital + Number(t.amount));
    else row.drawings = r2(row.drawings + Number(t.amount));
  }
  return Object.values(out).map((r) => ({ ...r, net: r2(r.capital - r.drawings) }));
}

const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

export function trialBalance(entries, to) {
  const acc = {};
  for (const e of entries) {
    if (to && e.date > to) continue;
    for (const l of e.lines) {
      const a = (acc[l.account] ??= { account: l.account, debit: 0, credit: 0 });
      a.debit = r2(a.debit + l.debit);
      a.credit = r2(a.credit + l.credit);
    }
  }
  const rows = Object.values(acc).map((a) => ({ ...a, balance: r2(a.debit - a.credit) })).sort((a, b) => a.account - b.account);
  const debit = r2(rows.reduce((s, a) => s + a.debit, 0));
  const credit = r2(rows.reduce((s, a) => s + a.credit, 0));
  return { rows, debit, credit, balanced: Math.abs(debit - credit) < 0.005 };
}

/* ---------- Reports ---------- */

/** Profit & loss per month (accrual: issued invoices less expenses). */
export function profitAndLoss(entries, from, to) {
  const months = {};
  const m = (k) => (months[k] ??= { month: k, revenue: 0, expenses: 0, by_category: {} });
  for (const e of entries) {
    if (!inRange(e.date, from, to)) continue;
    for (const l of e.lines) {
      const a = ACCOUNTS[l.account];
      if (!a) continue;
      if (a.kind === 'revenue') m(e.date.slice(0, 7)).revenue = r2(m(e.date.slice(0, 7)).revenue + l.credit - l.debit);
      if (a.kind === 'expense') {
        const row = m(e.date.slice(0, 7));
        row.expenses = r2(row.expenses + l.debit - l.credit);
        row.by_category[a.cat] = r2((row.by_category[a.cat] || 0) + l.debit - l.credit);
      }
    }
  }
  const rows = Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).map((r) => ({ ...r, profit: r2(r.revenue - r.expenses) }));
  const total = rows.reduce((t, r) => ({ revenue: r2(t.revenue + r.revenue), expenses: r2(t.expenses + r.expenses), profit: r2(t.profit + r.profit) }), { revenue: 0, expenses: 0, profit: 0 });
  return { rows, total };
}

/** Money actually received / paid per method in a period (cash view). */
export function cashByMethod({ payments = [], expenses = [] }, from, to) {
  const out = {};
  const row = (m) => (out[m] ??= { method: m, received: 0, paid_out: 0 });
  for (const p of live(payments)) if (p.status !== 'void' && inRange(day(p.date), from, to)) row(p.method || 'other').received = r2(row(p.method || 'other').received + Number(p.amount));
  for (const x of live(expenses)) if (inRange(day(x.date), from, to)) row(x.method || 'other').paid_out = r2(row(x.method || 'other').paid_out + Number(x.amount));
  const rows = Object.values(out).map((r) => ({ ...r, net: r2(r.received - r.paid_out) }));
  return { rows, received: r2(rows.reduce((s, r) => s + r.received, 0)), paid_out: r2(rows.reduce((s, r) => s + r.paid_out, 0)) };
}

/** Outstanding invoices grouped by age (days since invoice date, or due date when set). */
export function receivablesAging(documents, payments, today = new Date().toISOString().slice(0, 10)) {
  const buckets = { current: 0, d31_60: 0, d61_90: 0, d90_plus: 0, unverified: 0 };
  const rows = [];
  for (const d of enrichDocuments(documents, payments, today)) {
    if (d.type !== 'invoice' || !['unpaid', 'partial', 'overdue', 'unverified'].includes(d.state)) continue;
    const age = Math.max(0, Math.round((Date.parse(today) - Date.parse(day(d.due_date || d.date))) / 864e5));
    const bucket = d.state === 'unverified' ? 'unverified' : age <= 30 ? 'current' : age <= 60 ? 'd31_60' : age <= 90 ? 'd61_90' : 'd90_plus';
    buckets[bucket] = r2(buckets[bucket] + d.balance);
    rows.push({ id: d.id, doc_number: d.doc_number, customer_id: d.customer_id, customer_name: d.customer_name, date: d.date, due_date: d.due_date, total: d.total, paid: d.paid, balance: d.balance, age, bucket, state: d.state });
  }
  const confirmed = r2(buckets.current + buckets.d31_60 + buckets.d61_90 + buckets.d90_plus);
  return { rows: rows.sort((a, b) => b.age - a.age), buckets, confirmed, unverified: buckets.unverified, total: r2(confirmed + buckets.unverified) };
}

/** Invoiced revenue per service. Legacy invoices without line items are split evenly across their listed services. */
export function revenueByService(documents, from, to) {
  const out = {};
  for (const d of live(documents)) {
    if (!isIssuedInvoice(d)) continue;
    if (!inRange(day(d.date), from, to)) continue;
    const items = parseItems(d);
    if (items.length) {
      const { lines, subtotal, total } = computeTotals(items, d.discount);
      const factor = subtotal ? total / subtotal : 0;
      for (const l of lines) out[l.service || 'other'] = r2((out[l.service || 'other'] || 0) + l.line_total * factor);
    } else {
      const services = String(d.services || '').split(',').filter(Boolean);
      const list = services.length ? services : ['other'];
      for (const s of list) out[s] = r2((out[s] || 0) + docTotal(d) / list.length);
    }
  }
  return Object.entries(out).map(([service, amount]) => ({ service, amount })).sort((a, b) => b.amount - a.amount);
}

/** Per-project: contract value, invoiced, collected, direct costs, profit and margin. */
export function projectProfitability({ projects = [], documents = [], payments = [], expenses = [] }) {
  const paid = paidByInvoice(payments);
  return live(projects).map((p) => {
    const invs = live(documents).filter((d) => d.project_id === p.id && d.type === 'invoice' && d.status !== 'draft' && d.status !== 'void');
    const invoiced = r2(invs.reduce((s, d) => s + docTotal(d), 0));
    const collected = r2(invs.reduce((s, d) => s + (paid[d.id] || 0), 0));
    const costs = r2(live(expenses).filter((x) => x.project_id === p.id).reduce((s, x) => s + Number(x.amount), 0));
    const profit = r2(invoiced - costs);
    return { id: p.id, code: p.code, name: p.name, status: p.status, contract_value: r2(p.contract_value), invoiced, collected, outstanding: r2(invoiced - collected), costs, budget_cost: r2(p.budget_cost), profit, margin: invoiced ? Math.round((profit / invoiced) * 1000) / 10 : null };
  });
}

/** Everything a customer owes or has paid. */
export function customerStatement(customerId, { documents = [], payments = [] }, today) {
  const docs = enrichDocuments(documents.filter((d) => d.customer_id === customerId), payments, today);
  const pays = live(payments).filter((p) => p.customer_id === customerId);
  const invoices = docs.filter((d) => d.type === 'invoice' && d.state !== 'void' && d.state !== 'draft');
  return {
    documents: docs,
    payments: pays,
    invoiced: r2(invoices.reduce((s, d) => s + d.total, 0)),
    paid: r2(pays.filter((p) => p.status !== 'void').reduce((s, p) => s + Number(p.amount), 0)),
    balance: r2(invoices.reduce((s, d) => s + Math.max(0, d.balance), 0)),
    unallocated: r2(pays.filter((p) => p.status !== 'void' && !p.invoice_id).reduce((s, p) => s + Number(p.amount), 0)),
  };
}
