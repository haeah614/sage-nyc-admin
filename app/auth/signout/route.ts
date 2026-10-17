import { NextResponse } from 'next/server';
import { sessionClient } from '@/lib/supabase';
import { AppError, errorResponse } from '@/lib/errors';
import { trustedRequestOrigin } from '@/lib/trusted-origin';
export async function POST(request: Request) {
  try {
    const origin = process.env.APP_ORIGIN;
    if (!origin) throw new AppError(503,'Authentication is not configured.');
    const requestOrigin = trustedRequestOrigin(request, true);
    const session = await sessionClient();
    const {error} = await session.auth.signOut({scope:'local'});
    if (error) throw new AppError(503,'Sign-out failed. Please retry.');
    return NextResponse.redirect(new URL('/login',requestOrigin),303);
  } catch (error) { return errorResponse(error); }
}
