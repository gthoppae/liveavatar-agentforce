import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'admin_token';
const TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes

function getSigningSecret(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD not configured');
  return crypto.createHmac('sha256', password).update('admin-token-signing-key').digest('hex');
}

export function createAdminToken(): string {
  const secret = getSigningSecret();
  const payload = {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

export function verifyAdminToken(token: string): boolean {
  try {
    const secret = getSigningSecret();
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payloadB64, signature] = parts;

    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
    if (expectedSig.length !== signature.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) return false;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    return payload.exp >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function verifyPassword(input: string, expected: string): boolean {
  const inputBuf = Buffer.from(input);
  const expectedBuf = Buffer.from(expected);
  if (inputBuf.length !== expectedBuf.length) {
    crypto.timingSafeEqual(expectedBuf, expectedBuf); // constant-time even on length mismatch
    return false;
  }
  return crypto.timingSafeEqual(inputBuf, expectedBuf);
}

export function authenticateAdmin(request: NextRequest): NextResponse | null {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export { COOKIE_NAME as ADMIN_COOKIE_NAME };
