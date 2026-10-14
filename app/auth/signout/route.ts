import { NextResponse } from 'next/server';
import { sessionClient } from '@/lib/supabase';
import { AppError, errorResponse } from '@/lib/errors';
export async function POST(request: Request) {
  try {
    const origin = process.env.APP_ORIGIN;
    if (!origin || request.headers.get('origin') !== origin) throw new AppError(403,'Request origin is not allowed.');
    const session = await sessionClient();
    const {error} = await session.auth.signOut({scope:'local'});
    if (error) throw new AppError(503,'Sign-out failed. Please retry.');
    return NextResponse.redirect(new URL('/login',origin),303);
  } catch (error) { return errorResponse(error); }
}
