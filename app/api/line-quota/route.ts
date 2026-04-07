import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    // customer_app_settingsからLINEトークン取得
    const { rows } = await sql`
      SELECT data FROM customer_app_settings WHERE customer_id = ${customerId} LIMIT 1;
    `;
    const settings = rows[0]?.data?.settings || {};
    const token = settings.lineChannelAccessToken;

    if (!token) {
      return NextResponse.json({ configured: false });
    }

    // LINE API: 月間上限取得
    const [quotaRes, consumptionRes] = await Promise.all([
      fetch('https://api.line.me/v2/bot/message/quota', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('https://api.line.me/v2/bot/message/quota/consumption', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    if (!quotaRes.ok || !consumptionRes.ok) {
      return NextResponse.json({ configured: true, error: 'LINE APIトークンが無効です' });
    }

    const quotaData = await quotaRes.json();
    const consumptionData = await consumptionRes.json();

    return NextResponse.json({
      configured: true,
      used: consumptionData.totalUsage || 0,
      limit: quotaData.value || 0,
      type: quotaData.type || 'unknown',
    });
  } catch (error) {
    console.error('line-quota error:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}
