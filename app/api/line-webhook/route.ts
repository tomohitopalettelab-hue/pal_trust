import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import crypto from 'crypto';
import { ensureLineFriendsTable } from '@/app/api/_lib/ensure-line-friends-table';

function verifySignature(body: string, signature: string, channelSecret: string): boolean {
  const hash = crypto.createHmac('SHA256', channelSecret).update(body).digest('base64');
  return hash === signature;
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get('x-line-signature') || '';

    // customer_app_settingsからchannelSecretを取得
    const { rows } = await sql`
      SELECT data FROM customer_app_settings WHERE customer_id = ${customerId} LIMIT 1;
    `;
    const settings = rows[0]?.data?.settings || {};
    const channelSecret = settings.lineChannelSecret;

    if (channelSecret && signature && !verifySignature(rawBody, signature, channelSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const body = JSON.parse(rawBody);
    const events = Array.isArray(body.events) ? body.events : [];

    await ensureLineFriendsTable();

    for (const event of events) {
      const userId = event.source?.userId;
      if (!userId) continue;

      if (event.type === 'follow') {
        // 友だち追加
        // プロフィール取得
        let displayName = '';
        const token = settings.lineChannelAccessToken;
        if (token) {
          try {
            const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (profileRes.ok) {
              const profile = await profileRes.json();
              displayName = profile.displayName || '';
            }
          } catch { /* ignore */ }
        }

        await sql`
          INSERT INTO line_friends (customer_id, line_user_id, display_name, status, added_at)
          VALUES (${customerId}, ${userId}, ${displayName}, 'active', NOW())
          ON CONFLICT (customer_id, line_user_id)
          DO UPDATE SET status = 'active', display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), line_friends.display_name);
        `;
      } else if (event.type === 'unfollow') {
        // ブロック
        await sql`
          UPDATE line_friends SET status = 'blocked' WHERE customer_id = ${customerId} AND line_user_id = ${userId};
        `;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('line-webhook error:', error);
    return NextResponse.json({ ok: true }); // LINEには200を返す
  }
}
