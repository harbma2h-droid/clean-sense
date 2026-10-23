import { createContext, useContext } from 'react';

export type Meta = { company: Record<string, string>; roles: Record<string, { ar: string; en: string; perms: string[] }>; open_access?: boolean };
export const MetaContext = createContext<Meta | null>(null);
export const useMeta = () => useContext(MetaContext);
export const useCompany = () => useContext(MetaContext)?.company || {};
