import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { AppError } from './errors';

// Internal authorization lookup only. Call after getUser() and Google identity
// verification, with that verified user's ID, never an ID from request input.
// This client is deliberately private and separate from session and CRUD clients.
export async function lookupSuperadmin(verifiedUserId: string): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing configuration');
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }) },
    });
    const { data, error } = await db.from('profiles').select('is_superadmin').eq('id', verifiedUserId).maybeSingle();
    if (error) throw error;
    return data?.is_superadmin === true;
  } catch {
    throw new AppError(503, 'Admin authorization is unavailable. Check the reviewed database setup.');
  }
}
