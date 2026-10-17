import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authorize } from './lib/auth-policy';
import { lookupSuperadmin } from './lib/superadmin';
import { AppError } from './lib/errors';
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookieOptions: { name: 'sage-admin-auth', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({name,value}) => request.cookies.set(name,value));
        response = NextResponse.next({ request });
        values.forEach(({name,value,options}) => response.cookies.set(name,value,options));
        Object.entries(headers).forEach(([key,value]) => response.headers.set(key,value));
      },
    },
  });
  const {data:{user},error:authError} = await client.auth.getUser();
  const path = request.nextUrl.pathname;
  const publicPaths = ['/login','/denied','/auth/callback','/auth/signout'];
  const adminPage = !publicPaths.includes(path) && !path.startsWith('/api/');
  function denied(destination: string) {
    const redirect = NextResponse.redirect(new URL(destination,request.url));
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    redirect.headers.set('Cache-Control','private, no-store');
    return redirect;
  }
  if (adminPage) {
    try {
      await authorize(async () => authError ? null : user, lookupSuperadmin);
    } catch (error) {
      if (error instanceof AppError && error.status === 401) return denied('/login');
      if (error instanceof AppError && error.status === 403) return denied('/denied');
      return new NextResponse('Admin authorization is unavailable. Review database setup.',{status:503,headers:{'Cache-Control':'private, no-store'}});
    }
  }
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
