import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

const getSecret = (): string => process.env.CONSOLE_SSO_SECRET?.trim() || 'palette-console-sso-default';

const verifySsoToken = (token: string): { paletteId: string } | null => {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const [paletteId, tsStr, sig] = decoded.split(':');
    if (!paletteId || !tsStr || !sig) return null;
    if (Date.now() - Number(tsStr) > 5 * 60 * 1000) return null;
    const expected = createHmac('sha256', getSecret()).update(`${paletteId}:${tsStr}`).digest('hex').slice(0, 32);
    if (sig !== expected) return null;
    return { paletteId };
  } catch {
    return null;
  }
};

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  const redirect = req.nextUrl.searchParams.get('redirect') || '/main';

  const result = verifySsoToken(token);
  if (!result) {
    return NextResponse.redirect(new URL('/main', req.url));
  }

  const session = encodeURIComponent(JSON.stringify({
    role: 'customer',
    customerId: result.paletteId,
    exp: Date.now() + 12 * 60 * 60 * 1000,
  }));

  const res = NextResponse.redirect(new URL(redirect, req.url));
  res.cookies.set('palette_main_session', session, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 12 * 60 * 60,
    path: '/',
  });
  return res;
}
