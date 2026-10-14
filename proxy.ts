import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
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
    if (authError || !user) return denied('/login');
    if (user.app_metadata.provider !== 'google' || !user.identities?.some(i => i.provider === 'google')) return denied('/denied');
    const flag = await client.from('profiles').select('is_superadmin').eq('id',user.id).maybeSingle();
    if (flag.error) return new NextResponse('Admin authorization is unavailable. Review database setup.',{status:503,headers:{'Cache-Control':'private, no-store'}});
    if (flag.data?.is_superadmin !== true) return denied('/denied');
  }
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
