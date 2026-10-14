import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { sessionClient } from './supabase';
import { authorize } from './auth-policy';
import { AppError } from './errors';
export async function requireAdmin() {
  const session = await sessionClient();
  return authorize(async () => {
    const { data, error } = await session.auth.getUser();
    return error ? null : data.user;
  }, async (id) => {
    const { data, error } = await session.from('profiles').select('is_superadmin').eq('id', id).maybeSingle();
    if (error) throw new AppError(503, 'Admin authorization is unavailable. Check the reviewed database setup.');
    return data?.is_superadmin === true;
  });
}
// The privileged client is constructed ONLY after an independent session + DB check.
export async function adminDatabase() {
  const actor = await requireAdmin();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AppError(503, 'Admin data access is not configured.');
  return { actor, db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }) } }) };
}
export async function pageAdmin() {
  try { return await requireAdmin(); }
  catch (error) {
    if (error instanceof AppError && error.status === 401) redirect('/login');
    if (error instanceof AppError && error.status === 403) redirect('/denied');
    throw error;
  }
}
