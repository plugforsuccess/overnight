import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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
  let response = NextResponse.next({ request: req });

  // Add security headers to all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // Create a Supabase client that reads/writes cookies on the request/response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          // Apply cookies to the request (for downstream server components)
          cookiesToSet.forEach(({ name, value }) => {
            req.cookies.set(name, value);
          });
          // Re-create the response so it picks up the updated request cookies
          response = NextResponse.next({ request: req });
          // Re-apply security headers to the new response
          for (const [hKey, hValue] of Object.entries(SECURITY_HEADERS)) {
            response.headers.set(hKey, hValue);
          }
          // Apply cookies to the response (for the browser)
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
          });
        },
      },
    },
  );

  // Refresh the session — writes updated auth cookies if the token was refreshed
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route));

  const isAuthenticated = !!user && !userError;

  if (isProtected && !isAuthenticated) {
    console.log(`[middleware] redirect to /login: path=${pathname} reason=no_valid_session`);
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
