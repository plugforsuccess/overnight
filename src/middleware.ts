import { NextRequest, NextResponse } from 'next/server';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function middleware(req: NextRequest) {
  const response = NextResponse.next();

  // Add security headers to all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // NOTE: Auth redirects are handled client-side in each page's useEffect.
  // The Supabase JS client stores sessions in localStorage (not cookies),
  // so server-side middleware cannot reliably check auth state.

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
