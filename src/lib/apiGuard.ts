import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from './rateLimit';

export function apiGuard(request: NextRequest): NextResponse | null {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const path = request.nextUrl.pathname;

  const { allowed, retryAfter } = checkRateLimit(ip, path);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter || 60) } }
    );
  }

  const apiSecret = process.env.API_SECRET;
  if (apiSecret && !path.startsWith('/api/admin')) {
    const provided = request.headers.get('authorization')?.replace('Bearer ', '')
      || request.headers.get('x-api-key');
    if (provided !== apiSecret) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }
  }

  return null;
}
