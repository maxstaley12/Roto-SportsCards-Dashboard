import { NextResponse } from 'next/server';
import { authToken, COOKIE } from './lib/auth';

const OPEN = ['/login.html', '/api/login'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (OPEN.includes(pathname)) return NextResponse.next();

  // Fail closed: with no password configured, nothing is served.
  if (!process.env.DASHBOARD_PASSWORD) {
    return new NextResponse('DASHBOARD_PASSWORD is not set.', { status: 503 });
  }
  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && cookie === (await authToken())) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login.html', req.url));
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
