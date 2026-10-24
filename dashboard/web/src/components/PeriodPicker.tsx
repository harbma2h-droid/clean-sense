import { useState } from 'react';
import { useT, type Key } from '../i18n';

// Period for the dashboard and reports: a ready choice (this month, this year…) or any custom
// range. The last choice is remembered on this device for each screen.
export type Period = { key: string; from: string; to: string };

const PRESETS = ['this_month', 'last_month', 'last_3', 'last_6', 'this_year', 'last_year', 'last_12', 'custom'] as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (y: number, m: number) => iso(new Date(Date.UTC(y, m, 1)));
const monthEnd = (y: number, m: number) => iso(new Date(Date.UTC(y, m + 1, 0)));

export function presetRange(key: string, today = new Date()): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (key) {
    case 'last_month': return { from: monthStart(y, m - 1), to: monthEnd(y, m - 1) };
    case 'last_3': return { from: monthStart(y, m - 2), to: monthEnd(y, m) };
    case 'last_6': return { from: monthStart(y, m - 5), to: monthEnd(y, m) };
    case 'this_year': return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'last_year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'last_12': return { from: monthStart(y, m - 11), to: monthEnd(y, m) };
    default: return { from: monthStart(y, m), to: monthEnd(y, m) };
  }
}

const read = (k: string): Period | null => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k: string, v: Period) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

/** Remembered period for one screen. Ready choices are recalculated each day; custom ranges are kept as typed. */
export function usePeriod(storageKey: string, fallback = 'this_month'): [Period, (p: Period) => void] {
  const [p, setP] = useState<Period>(() => {
    const saved = read(storageKey);
    if (saved?.key === 'custom' && saved.from && saved.to) return saved;
    const key = saved?.key && (PRESETS as readonly string[]).includes(saved.key) ? saved.key : fallback;
    return { key, ...presetRange(key) };
  });
  return [p, (next) => { setP(next); write(storageKey, next); }];
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const t = useT();
  return (
    <div className="period">
      <select aria-label={t('period')} value={value.key} onChange={(e) => {
        const key = e.target.value;
        onChange(key === 'custom' ? { key, from: value.from, to: value.to } : { key, ...presetRange(key) });
      }}>
        {PRESETS.map((k) => <option key={k} value={k}>{t(`p_${k}` as Key)}</option>)}
      </select>
      {value.key === 'custom' && (
        <span className="period-range">
          <input type="date" aria-label={t('from')} value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
          <span className="muted">→</span>
          <input type="date" aria-label={t('to')} value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
        </span>
      )}
    </div>
  );
}
