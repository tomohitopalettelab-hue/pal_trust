import { NextResponse } from 'next/server';
import { exchangeCode, saveGoogleTokens, createOAuth2Client } from '@/app/api/_lib/google-auth';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const customerId = searchParams.get('state') || '';

  if (!code || !customerId) {
    return NextResponse.redirect(new URL('/main/login', request.url));
  }

  try {
    const tokens = await exchangeCode(code);

    // メールアドレスを取得
    let email = '';
    try {
      const client = createOAuth2Client();
      client.setCredentials(tokens);
      const oauth2 = (await import('googleapis')).google.oauth2({ version: 'v2', auth: client });
      const userInfo = await oauth2.userinfo.get();
      email = userInfo.data.email || '';
    } catch { /* ignore */ }

    await saveGoogleTokens(customerId, tokens, email);

    const redirectUrl = new URL(`/main/settings?customerId=${encodeURIComponent(customerId)}&google_connected=true`, request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Google callback error:', error);
    const redirectUrl = new URL(`/main/settings?customerId=${encodeURIComponent(customerId)}&google_error=true`, request.url);
    return NextResponse.redirect(redirectUrl);
  }
}
