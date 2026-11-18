import { NextResponse } from 'next/server';
import { authToken, COOKIE } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const form = await req.formData();
  const given = String(form.get('password') || '');
  const real = process.env.DASHBOARD_PASSWORD || '';
  if (!real || given !== real) {
    return NextResponse.redirect(new URL('/login.html?e=1', req.url), 303);
  }
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(COOKIE, await authToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
