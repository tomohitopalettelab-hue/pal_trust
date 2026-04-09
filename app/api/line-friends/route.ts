import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { ensureLineFriendsTable } from '@/app/api/_lib/ensure-line-friends-table';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    await ensureLineFriendsTable();

    const { rows } = await sql`
      SELECT line_user_id, display_name, status, added_at
      FROM line_friends
      WHERE customer_id = ${customerId} AND status = 'active'
      ORDER BY added_at DESC;
    `;

    return NextResponse.json({ friends: rows });
  } catch (error) {
    console.error('line-friends error:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}

// POST: LINE APIから既存友だちを全件取得してDBに同期
export async function POST(request: Request) {
  try {
    const { customerId } = await request.json();
    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    // customer_app_settingsからLINEトークン取得
    const { rows: settingsRows } = await sql`
      SELECT data FROM customer_app_settings
      WHERE customer_id = ${customerId} OR customer_id = ${customerId.toLowerCase()} OR customer_id = ${customerId.toUpperCase()}
      LIMIT 1;
    `;
    const settings = settingsRows[0]?.data?.settings || {};
    const token = settings.lineChannelAccessToken;

    if (!token) {
      return NextResponse.json({ error: 'LINE Channel Access Tokenが未設定です' }, { status: 400 });
    }

    await ensureLineFriendsTable();

    // フォロワーIDを全件取得（ページネーション対応）
    let allUserIds: string[] = [];
    let nextToken: string | undefined;

    do {
      const url = nextToken
        ? `https://api.line.me/v2/bot/followers/ids?start=${nextToken}`
        : 'https://api.line.me/v2/bot/followers/ids';

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return NextResponse.json({ error: err.message || 'LINE APIからフォロワー取得に失敗しました' }, { status: 500 });
      }

      const data = await res.json();
      const userIds: string[] = Array.isArray(data.userIds) ? data.userIds : [];
      allUserIds = allUserIds.concat(userIds);
      nextToken = data.next || undefined;
    } while (nextToken);

    // 各ユーザーのプロフィールを取得してDBに保存
    let syncedCount = 0;
    for (const userId of allUserIds) {
      let displayName = '';
      try {
        const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          displayName = profile.displayName || '';
        }
      } catch { /* ignore */ }

      await sql`
        INSERT INTO line_friends (customer_id, line_user_id, display_name, status, added_at)
        VALUES (${customerId}, ${userId}, ${displayName}, 'active', NOW())
        ON CONFLICT (customer_id, line_user_id)
        DO UPDATE SET
          status = 'active',
          display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), line_friends.display_name);
      `;
      syncedCount++;
    }

    return NextResponse.json({ success: true, syncedCount, totalFollowers: allUserIds.length });
  } catch (error) {
    console.error('line-friends sync error:', error);
    return NextResponse.json({ error: '同期に失敗しました' }, { status: 500 });
  }
}
