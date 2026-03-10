import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Allow /embed to be loaded in iframes on any site
  if (request.nextUrl.pathname.startsWith('/embed')) {
    response.headers.delete('X-Frame-Options');
    response.headers.set('Content-Security-Policy', "frame-ancestors *");
  }

  return response;
}

export const config = {
  matcher: ['/embed/:path*', '/embed'],
};
