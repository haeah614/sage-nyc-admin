import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { AppError } from './errors';
export async function sessionClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new AppError(503, 'Authentication is not configured.');
  const jar = await cookies();
  return createServerClient(url, key, {
    cookieOptions: { name: 'sage-admin-auth', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true },
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try { values.forEach(({name,value,options}) => jar.set(name,value,options)); }
        catch { /* Server component refresh is persisted by proxy. */ }
      },
    },
  });
}
