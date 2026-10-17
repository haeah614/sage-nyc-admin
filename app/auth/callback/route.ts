import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sessionClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin';
import { AppError, errorResponse } from '@/lib/errors';
export async function POST(request: Request) {
  try {
    const origin = process.env.APP_ORIGIN;
    if (!origin) throw new AppError(503,'Authentication is not configured.');
    // GIS posts to the origin that rendered the button. Redirect back to that
    // same origin so the session cookies set by sessionClient remain in scope
    // for commit-specific Vercel deployments as well as the canonical domain.
    const requestUrl = new URL(request.url);
    const allowedOrigins = new Set([new URL(origin).origin]);
    for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
      if (host) allowedOrigins.add(new URL(host.startsWith('http') ? host : `https://${host}`).origin);
    }
    if (!allowedOrigins.has(requestUrl.origin)) throw new AppError(403, 'Request origin is not allowed.');
    const requestOrigin = requestUrl.origin;
    if (Number(request.headers.get('content-length')||0) > 16000) throw new AppError(413,'Request too large.');
    const form = await request.formData();
    const posted = form.get('g_csrf_token'), cookie = (await cookies()).get('g_csrf_token')?.value;
    if (typeof posted !== 'string' || !cookie || Buffer.byteLength(posted)!==Buffer.byteLength(cookie) || !timingSafeEqual(Buffer.from(posted),Buffer.from(cookie))) {
      throw new AppError(403,'Google sign-in verification failed. Restart sign-in.');
    }
    const credential = form.get('credential');
    if (typeof credential !== 'string' || credential.length > 12000) throw new AppError(400,'Invalid Google credential.');
    const session = await sessionClient();
    const result = await session.auth.signInWithIdToken({provider:'google',token:credential});
    if (result.error) throw new AppError(401,'Google sign-in failed. Please try again.');
    try { await requireAdmin(); }
    catch (error) {
      if (error instanceof AppError && error.status===403) return NextResponse.redirect(new URL('/denied',requestOrigin),303);
      throw error;
    }
    return NextResponse.redirect(new URL('/',requestOrigin),303);
  } catch (error) { return errorResponse(error); }
}
