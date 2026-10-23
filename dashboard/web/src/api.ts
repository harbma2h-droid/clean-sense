export type Row = Record<string, any>;
export type User = { id: string; name: string; username: string; job_title: string; role: string; language: 'ar' | 'en'; permissions: string[]; must_change_password: boolean };

export class ApiError extends Error {
  constructor(public status: number, public code: string, public body: any) { super(code); }
}

const DEMO = import.meta.env.VITE_DEMO === '1';

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const init = { method: opts.method || 'GET', body: opts.body === undefined ? undefined : JSON.stringify(opts.body) };
  if (DEMO) return (await import('./demo')).demoFetch(path, init.method, opts.body) as Promise<T>;
  const res = await fetch(`/api${path}`, { ...init, credentials: 'same-origin', headers: opts.body === undefined ? {} : { 'Content-Type': 'application/json' } });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'error', data);
  return data as T;
}

export const isDemo = DEMO;
