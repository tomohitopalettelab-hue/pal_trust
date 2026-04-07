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
