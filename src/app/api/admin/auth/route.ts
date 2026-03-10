import { NextRequest, NextResponse } from 'next/server';
import { createAdminToken, verifyPassword, verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/auth';
import { apiGuard } from '@/lib/apiGuard';

export async function POST(request: NextRequest) {
  const guardResponse = apiGuard(request);
  if (guardResponse) return guardResponse;

  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return NextResponse.json(
        { success: false, error: 'Admin password not configured' },
        { status: 500 }
      );
    }

    if (!verifyPassword(password, adminPassword)) {
      return NextResponse.json(
        { success: false, error: 'Invalid password' },
        { status: 401 }
      );
    }

    const token = createAdminToken();
    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/admin',
      maxAge: 15 * 60,
    });
    return response;
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (token && verifyAdminToken(token)) {
    return NextResponse.json({ authenticated: true });
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}
