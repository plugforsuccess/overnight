import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase-ssr';

const PROTECTED_ROUTES = ['/dashboard', '/schedule', '/account'];
const AUTH_ROUTES = ['/login', '/signup'];

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const response = NextResponse.next({ request: req });

  // Add security headers to all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route));

  // Only do session validation for protected or auth routes
  if (!isProtected && !isAuthRoute) {
    return response;
  }

  // Create Supabase client that can read/refresh cookies
  const supabase = createSupabaseMiddlewareClient(req, response);

  // getUser() validates the JWT server-side (not just reading from cookie).
  // This also refreshes the session if the access token is expired.
  const { data: { user }, error } = await supabase.auth.getUser();

  console.log(`[middleware] path=${pathname} user=${user?.id ?? 'null'} error=${error?.message ?? 'none'}`);

  if (isProtected && !user) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    console.log(`[middleware] Redirecting unauthenticated user to /login from ${pathname}`);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  if (isAuthRoute && user) {
    console.log(`[middleware] Redirecting authenticated user from ${pathname} to /dashboard`);
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
