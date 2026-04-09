import { NextResponse } from 'next/server';
import { getAuthUrl, getGoogleTokens, deleteGoogleTokens } from '@/app/api/_lib/google-auth';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId') || '';
  const action = searchParams.get('action') || '';

  if (action === 'status') {
    if (!customerId) return NextResponse.json({ connected: false });
    const tokens = await getGoogleTokens(customerId);
    return NextResponse.json({
      connected: Boolean(tokens),
      email: tokens?.email || null,
    });
  }

  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
  }

  const url = getAuthUrl(customerId);
  return NextResponse.redirect(url);
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || '';
  const customerId = searchParams.get('customerId') || '';

  if (action === 'disconnect' && customerId) {
    await deleteGoogleTokens(customerId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
